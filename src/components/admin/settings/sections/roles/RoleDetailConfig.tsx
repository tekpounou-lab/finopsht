import React, { useState } from "react";
import { 
  Users, 
  Shield, 
  Lock, 
  CheckCircle2, 
  Copy, 
  Trash2, 
  Sparkles, 
  Layers, 
  Key, 
  Info,
  Wand2,
  Check
} from "lucide-react";
import { 
  ERP_MODULES, 
  AVAILABLE_PERMISSIONS, 
  STANDARD_ROLE_METADATA, 
  ROLE_PRESETS,
  RolePreset,
  getRoleKey,
  getRoleMetadata
} from "./types";
import { motion } from "motion/react";

interface RoleDetailConfigProps {
  roles: string[];
  selectedRole: string;
  onSelectRole: (role: string) => void;
  roleModuleMatrix: Record<string, Record<string, boolean>>;
  permissionMatrix: Record<string, string[]>;
  onToggleModule: (role: string, moduleId: string) => void;
  onTogglePermission: (role: string, permId: string) => void;
  onApplyPreset: (role: string, preset: RolePreset) => void;
  onDuplicateRole: (role: string) => void;
  onRequestDeleteRole: (role: string) => void;
  loading?: boolean;
}

export const RoleDetailConfig: React.FC<RoleDetailConfigProps> = ({
  roles,
  selectedRole,
  onSelectRole,
  roleModuleMatrix,
  permissionMatrix,
  onToggleModule,
  onTogglePermission,
  onApplyPreset,
  onDuplicateRole,
  onRequestDeleteRole,
  loading = false,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"modules" | "permissions" | "presets">("modules");
  
  const normalizedSelectedRole = getRoleKey(selectedRole);
  const isSuperOrOwner = normalizedSelectedRole === "SUPER_ADMIN" || normalizedSelectedRole === "OWNER";
  const roleMeta = getRoleMetadata(normalizedSelectedRole);

  const isModuleActive = (moduleId: string): boolean => {
    if (isSuperOrOwner) return true;
    const config = roleModuleMatrix[normalizedSelectedRole];
    if (config && config[moduleId] !== undefined) {
      return Boolean(config[moduleId]);
    }
    const mod = ERP_MODULES.find(m => m.id === moduleId);
    return mod ? mod.defaultRoles.includes(normalizedSelectedRole) : false;
  };

  const isPermissionEnabled = (permId: string): boolean => {
    if (isSuperOrOwner) return true;
    const perms = permissionMatrix[normalizedSelectedRole] || [];
    return perms.includes(permId);
  };


  const activeModuleCount = ERP_MODULES.filter(m => isModuleActive(m.id)).length;
  const activePermCount = AVAILABLE_PERMISSIONS.filter(p => isPermissionEnabled(p.id)).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="role-detail-config-root">
      {/* Left Column: Role Selector List */}
      <div className="lg:col-span-4 space-y-3">
        <div className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
            Sélectionner un Profil ({roles.length})
          </p>
          <div className="space-y-2">
            {roles.map(rawRole => {
              const role = getRoleKey(rawRole);
              const meta = getRoleMetadata(role);
              const isSelected = normalizedSelectedRole === role;
              const isRoleFixed = role === "SUPER_ADMIN" || role === "OWNER";
              const count = isRoleFixed ? ERP_MODULES.length : ERP_MODULES.filter(m => {
                const cfg = roleModuleMatrix[role];
                return cfg && cfg[m.id] !== undefined ? cfg[m.id] : m.defaultRoles.includes(role);
              }).length;


              return (
                <button
                  key={role}
                  onClick={() => onSelectRole(role)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all relative overflow-hidden group ${
                    isSelected
                      ? "bg-slate-900 border-cyan-500/40 ring-1 ring-cyan-500/30 shadow-lg"
                      : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${isSelected ? "text-cyan-400" : "text-slate-200"}`}>
                      {meta.label}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                      isSelected ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}>
                      {count}/{ERP_MODULES.length} mod.
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-1">
                    {meta.desc}
                  </p>

                  {isSelected && (
                    <motion.div
                      layoutId="activeRoleIndicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Column: Configuration Workspace */}
      <div className="lg:col-span-8 space-y-5">
        {/* Role Header Banner */}
        <div className="glass p-5 rounded-2xl border border-slate-800/80 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h4 className="text-base font-bold text-slate-100">{roleMeta.label}</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${roleMeta.badgeColor}`}>
                    {roleMeta.isSystem ? "Rôle Système SSOT" : "Rôle Personnalisé"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-xl">{roleMeta.desc}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => onDuplicateRole(selectedRole)}
                disabled={loading}
                title="Dupliquer ce profil"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-all"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Dupliquer</span>
              </button>

              {!isSuperOrOwner && !roleMeta.isSystem && (
                <button
                  onClick={() => onRequestDeleteRole(selectedRole)}
                  disabled={loading}
                  title="Supprimer ce rôle"
                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-800">
            <button
              onClick={() => setActiveSubTab("modules")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === "modules"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Accès aux Modules ({activeModuleCount}/{ERP_MODULES.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab("permissions")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === "permissions"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Habilitations Fines ({activePermCount}/{AVAILABLE_PERMISSIONS.length})</span>
            </button>

            {!isSuperOrOwner && (
              <button
                onClick={() => setActiveSubTab("presets")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeSubTab === "presets"
                    ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Modèles Métiers (Presets)</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub-Tab 1: Modules Grid */}
        {activeSubTab === "modules" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ERP_MODULES.map(module => {
                const Icon = module.icon;
                const active = isModuleActive(module.id);

                return (
                  <div
                    key={module.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                      active
                        ? "bg-slate-900/80 border-emerald-500/30 shadow-md shadow-emerald-500/5"
                        : "bg-slate-950/40 border-slate-800/80 opacity-65 hover:opacity-100"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${module.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-100">{module.name}</h5>
                            <span className="text-[10px] text-cyan-400/80 font-mono">{module.code}</span>
                          </div>
                        </div>

                        {isSuperOrOwner ? (
                          <div className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            <span>Verrouillé</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => onToggleModule(selectedRole, module.id)}
                            disabled={loading}
                            className={`relative w-11 h-6 rounded-full transition-colors ${
                              active ? "bg-emerald-500" : "bg-slate-800"
                            }`}
                          >
                            <motion.div
                              animate={{ x: active ? 22 : 2 }}
                              className="absolute top-1 left-0 w-4 h-4 rounded-full bg-white shadow-md"
                            />
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        {module.fullDesc}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-medium">{module.categoryLabel}</span>
                      <span className={`font-bold ${active ? "text-emerald-400" : "text-slate-400"}`}>
                        {active ? "Accès Autorisé" : "Non Autorisé"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-Tab 2: Granular Permissions */}
        {activeSubTab === "permissions" && (
          <div className="space-y-3">
            <div className="p-4 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
              <div className="space-y-2">
                {AVAILABLE_PERMISSIONS.map(perm => {
                  const enabled = isPermissionEnabled(perm.id);

                  return (
                    <div
                      key={perm.id}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                        enabled
                          ? "bg-emerald-500/5 border-emerald-500/25"
                          : "bg-slate-950/40 border-slate-800/60 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                          enabled
                            ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                            : "bg-slate-900 border-slate-800 text-slate-400"
                        }`}>
                          {enabled ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${enabled ? "text-slate-200" : "text-slate-400"}`}>
                            {perm.label}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{perm.desc}</p>
                        </div>
                      </div>

                      {isSuperOrOwner ? (
                        <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                          Toujours Actif
                        </span>
                      ) : (
                        <button
                          onClick={() => onTogglePermission(selectedRole, perm.id)}
                          disabled={loading}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            enabled ? "bg-emerald-600" : "bg-slate-800"
                          }`}
                        >
                          <motion.div
                            animate={{ x: enabled ? 20 : 2 }}
                            className="absolute top-1 left-0 w-3 h-3 rounded-full bg-white shadow-sm"
                          />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Sub-Tab 3: Presets */}
        {activeSubTab === "presets" && !isSuperOrOwner && (
          <div className="space-y-4">
            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-cyan-300">Modèles Pré-Configurés ERP</h5>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Appliquez en un clic une configuration métier standardisée et éprouvée pour aligner instantanément ce rôle sur les meilleures pratiques d'entreprise.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ROLE_PRESETS.map(preset => (
                <div
                  key={preset.id}
                  className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 transition-all flex flex-col justify-between"
                >
                  <div>
                    <h5 className="text-xs font-bold text-slate-100">{preset.name}</h5>
                    <p className="text-[11px] text-slate-400 mt-1">{preset.desc}</p>
                    
                    <div className="mt-3 flex flex-wrap gap-1">
                      {preset.enabledModules.map(modId => (
                        <span key={modId} className="px-1.5 py-0.5 rounded bg-slate-950 text-cyan-400/90 border border-slate-800 text-[9px] font-mono">
                          {modId}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => onApplyPreset(selectedRole, preset)}
                    disabled={loading}
                    className="mt-4 w-full py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Appliquer ce modèle à {roleMeta.label}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
