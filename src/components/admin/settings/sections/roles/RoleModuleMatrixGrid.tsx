import React, { useState, useMemo } from "react";
import { 
  Shield, 
  Lock, 
  Check, 
  X, 
  Search, 
  Layers, 
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  HelpCircle
} from "lucide-react";
import { ERP_MODULES, STANDARD_ROLE_METADATA, ErpModuleDefinition, getRoleKey, getRoleMetadata } from "./types";
import { motion } from "motion/react";

interface RoleModuleMatrixGridProps {
  roles: string[];
  roleModuleMatrix: Record<string, Record<string, boolean>>;
  onToggleModule: (role: string, moduleId: string) => void;
  onBulkSetRoleModules: (role: string, moduleIds: string[], enable: boolean) => void;
  loading?: boolean;
}

export const RoleModuleMatrixGrid: React.FC<RoleModuleMatrixGridProps> = ({
  roles,
  roleModuleMatrix,
  onToggleModule,
  onBulkSetRoleModules,
  loading = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = [
    { id: "all", label: "Tous les modules" },
    { id: "hr", label: "RH & Organisation" },
    { id: "ops", label: "Temps & Opérations" },
    { id: "finance", label: "Finance & Paie" },
    { id: "intelligence", label: "Intelligence & Audit" },
    { id: "admin", label: "Administration" },
  ];

  const filteredModules = useMemo(() => {
    return ERP_MODULES.filter(mod => {
      const matchesSearch = 
        mod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.shortDesc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        mod.code.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || mod.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const groupedModules = useMemo(() => {
    const map: Record<string, ErpModuleDefinition[]> = {};
    filteredModules.forEach(mod => {
      if (!map[mod.categoryLabel]) {
        map[mod.categoryLabel] = [];
      }
      map[mod.categoryLabel].push(mod);
    });
    return map;
  }, [filteredModules]);

  const isModuleActiveForRole = (role: string, moduleId: string): boolean => {
    if (role === "SUPER_ADMIN" || role === "OWNER") return true;
    const roleConfig = roleModuleMatrix[role];
    if (roleConfig && roleConfig[moduleId] !== undefined) {
      return Boolean(roleConfig[moduleId]);
    }
    // Fallback to default
    const mod = ERP_MODULES.find(m => m.id === moduleId);
    return mod ? mod.defaultRoles.includes(role) : false;
  };

  const getActiveModuleCountForRole = (role: string): number => {
    if (role === "SUPER_ADMIN" || role === "OWNER") return ERP_MODULES.length;
    return ERP_MODULES.filter(m => isModuleActiveForRole(role, m.id)).length;
  };

  return (
    <div className="space-y-4" id="role-module-matrix-grid-root">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCategory === cat.id
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "bg-slate-950/40 text-slate-400 border border-slate-800/60 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrer un module..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Responsive Grid Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/60 shadow-xl custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
              <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-wider min-w-[280px]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>Modules Métiers ERP ({filteredModules.length})</span>
                </div>
              </th>
              {roles.map(rawRole => {
                const role = getRoleKey(rawRole);
                const meta = getRoleMetadata(role);
                const isFixed = role === "SUPER_ADMIN" || role === "OWNER";
                const activeCount = getActiveModuleCountForRole(role);

                return (
                  <th key={role} className="p-3 text-center min-w-[120px] max-w-[150px] border-l border-slate-800/60">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${meta.badgeColor}`}>
                        {meta.label}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <span>{activeCount}/{ERP_MODULES.length} actifs</span>
                      </div>
                      
                      {!isFixed && (
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={() => onBulkSetRoleModules(role, filteredModules.map(m => m.id), true)}
                            disabled={loading}
                            title="Tout autoriser pour ce rôle"
                            className="p-1 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 rounded transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onBulkSetRoleModules(role, filteredModules.map(m => m.id), false)}
                            disabled={loading}
                            title="Tout révoquer pour ce rôle"
                            className="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/50">
            {Object.entries(groupedModules).map(([categoryLabel, modules]) => (
              <React.Fragment key={categoryLabel}>
                {/* Category Header Row */}
                <tr className="bg-slate-900/40 border-y border-slate-800/80">
                  <td colSpan={roles.length + 1} className="py-2.5 px-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider">
                        {categoryLabel} ({modules.length})
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Modules Rows */}
                {modules.map(module => {
                  const Icon = module.icon;

                  return (
                    <tr 
                      key={module.id} 
                      className="hover:bg-slate-900/30 transition-colors group"
                    >
                      {/* Module Info Cell */}
                      <td className="p-3.5 align-middle">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${module.color}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">
                                {module.name}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800">
                                {module.id}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                              {module.shortDesc}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role Toggle Cells */}
                      {roles.map(rawRole => {
                        const role = getRoleKey(rawRole);
                        const isFixed = role === "SUPER_ADMIN" || role === "OWNER";
                        const active = isModuleActiveForRole(role, module.id);

                        return (
                          <td 
                            key={`${module.id}-${role}`} 
                            className="p-3 text-center align-middle border-l border-slate-800/40"
                          >
                            {isFixed ? (
                              <div className="inline-flex items-center justify-center px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold gap-1 cursor-default" title="Accès système souverain et irrévocable">
                                <Lock className="w-2.5 h-2.5" />
                                <span>Actif</span>
                              </div>
                            ) : (
                              <button
                                onClick={() => onToggleModule(role, module.id)}
                                disabled={loading}
                                aria-label={`Activer ${module.name} pour le rôle ${role}`}
                                className={`inline-flex items-center justify-center p-2 rounded-xl border transition-all transform active:scale-95 ${
                                  active
                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/10"
                                    : "bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700"
                                }`}
                              >
                                {active ? (
                                  <Check className="w-4 h-4 stroke-[2.5]" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}

            {filteredModules.length === 0 && (
              <tr>
                <td colSpan={roles.length + 1} className="py-12 text-center text-slate-500 text-xs">
                  Aucun module ne correspond à vos critères de recherche.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Legend & Guidance */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/30 border border-slate-800/60 rounded-xl text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500 flex items-center justify-center">
              <Check className="w-2 h-2 text-emerald-400" />
            </span>
            <span>Module Autorisé</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <X className="w-2 h-2 text-slate-500" />
            </span>
            <span>Accès Restreint</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>Verrou Système Souverain</span>
          </div>
        </div>
        <span className="text-slate-500">
          Les modifications sont immédiatement synchronisées sur l'environnement de travail des collaborateurs.
        </span>
      </div>
    </div>
  );
};
