import React, { useState, useMemo } from "react";
import { 
  Users, 
  Shield, 
  Plus, 
  Layers, 
  Sliders, 
  Eye, 
  Save, 
  RefreshCw, 
  AlertTriangle,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { PermissionService } from "../../../../services/PermissionService";
import { ERP_MODULES, AVAILABLE_PERMISSIONS, STANDARD_ROLE_METADATA, RolePreset } from "./roles/types";
import { RoleModuleMatrixGrid } from "./roles/RoleModuleMatrixGrid";
import { RoleDetailConfig } from "./roles/RoleDetailConfig";
import { RoleAccessSimulator } from "./roles/RoleAccessSimulator";
import { CreateRoleModal } from "./roles/CreateRoleModal";
import { motion, AnimatePresence } from "motion/react";

const DEFAULT_CORE_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"];

export default function RolesPermissionsSection() {
  const { roles: contextRoles, permissionMatrix: ctxPermMatrix, roleModuleMatrix: ctxRoleModMatrix, businessSettings } = useBusinessContext();
  const { updateSettings, loading } = useBusinessAdmin();

  // Tab State: matrix | detail | simulator
  const [activeTab, setActiveTab] = useState<"matrix" | "detail" | "simulator">("matrix");
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Local state for interactive editing and immediate feedback
  const [localRoleModuleMatrix, setLocalRoleModuleMatrix] = useState<Record<string, Record<string, boolean>>>(() => {
    return ctxRoleModMatrix || businessSettings?.roleModuleMatrix || {};
  });

  const [localPermissionMatrix, setLocalPermissionMatrix] = useState<Record<string, string[]>>(() => {
    return (ctxPermMatrix as any) || businessSettings?.permissionMatrix || {};
  });

  const [customRoles, setCustomRoles] = useState<Array<{ id: string; label: string; desc: string }>>(() => {
    return businessSettings?.customRoles || [];
  });

  // Effective unified list of roles
  const effectiveRoles = useMemo(() => {
    const set = new Set<string>(DEFAULT_CORE_ROLES);
    if (Array.isArray(contextRoles)) {
      contextRoles.forEach((r: any) => {
        if (typeof r === "string" && r.trim()) {
          set.add(r.trim());
        } else if (r && typeof r === "object") {
          const roleName = r.name || r.id || r.role;
          if (typeof roleName === "string" && roleName.trim()) {
            set.add(roleName.trim());
          }
        }
      });
    }
    if (Array.isArray(customRoles)) {
      customRoles.forEach((cr: any) => {
        if (typeof cr === "string" && cr.trim()) {
          set.add(cr.trim());
        } else if (cr && typeof cr === "object" && cr.id) {
          set.add(cr.id.trim());
        }
      });
    }
    return Array.from(set);
  }, [contextRoles, customRoles]);


  const [selectedRole, setSelectedRole] = useState<string>(effectiveRoles[3] || "MANAGER");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Sync state if context changes externally
  React.useEffect(() => {
    if (ctxRoleModMatrix && Object.keys(ctxRoleModMatrix).length > 0 && !hasUnsavedChanges) {
      setLocalRoleModuleMatrix(ctxRoleModMatrix);
    }
  }, [ctxRoleModMatrix, hasUnsavedChanges]);

  React.useEffect(() => {
    if (ctxPermMatrix && Object.keys(ctxPermMatrix).length > 0 && !hasUnsavedChanges) {
      setLocalPermissionMatrix(ctxPermMatrix as any);
    }
  }, [ctxPermMatrix, hasUnsavedChanges]);

  // Handler: Toggle single module for a role
  const handleToggleModule = (role: string, moduleId: string) => {
    if (role === "SUPER_ADMIN" || role === "OWNER") return;

    setLocalRoleModuleMatrix(prev => {
      const currentRoleConfig = prev[role] || {};
      const currentVal = currentRoleConfig[moduleId] !== undefined
        ? currentRoleConfig[moduleId]
        : ERP_MODULES.find(m => m.id === moduleId)?.defaultRoles.includes(role) || false;

      const updated = {
        ...prev,
        [role]: {
          ...currentRoleConfig,
          [moduleId]: !currentVal
        }
      };

      // Realtime in-memory preview
      PermissionService.setRoleModuleMatrix(updated);
      return updated;
    });

    setHasUnsavedChanges(true);
  };

  // Handler: Bulk set modules for a role
  const handleBulkSetRoleModules = (role: string, moduleIds: string[], enable: boolean) => {
    if (role === "SUPER_ADMIN" || role === "OWNER") return;

    setLocalRoleModuleMatrix(prev => {
      const currentRoleConfig = { ...(prev[role] || {}) };
      moduleIds.forEach(id => {
        currentRoleConfig[id] = enable;
      });

      const updated = {
        ...prev,
        [role]: currentRoleConfig
      };

      PermissionService.setRoleModuleMatrix(updated);
      return updated;
    });

    setHasUnsavedChanges(true);
  };

  // Handler: Toggle granular capability
  const handleTogglePermission = (role: string, permId: string) => {
    if (role === "SUPER_ADMIN" || role === "OWNER") return;

    setLocalPermissionMatrix(prev => {
      const currentPerms = prev[role] || [];
      const updatedPerms = currentPerms.includes(permId)
        ? currentPerms.filter(p => p !== permId)
        : [...currentPerms, permId];

      return {
        ...prev,
        [role]: updatedPerms
      };
    });

    setHasUnsavedChanges(true);
  };

  // Handler: Apply preset
  const handleApplyPreset = (role: string, preset: RolePreset) => {
    if (role === "SUPER_ADMIN" || role === "OWNER") return;

    // Apply module configuration
    const newRoleModConfig: Record<string, boolean> = {};
    ERP_MODULES.forEach(m => {
      newRoleModConfig[m.id] = preset.enabledModules.includes(m.id);
    });

    setLocalRoleModuleMatrix(prev => {
      const updated = { ...prev, [role]: newRoleModConfig };
      PermissionService.setRoleModuleMatrix(updated);
      return updated;
    });

    setLocalPermissionMatrix(prev => ({
      ...prev,
      [role]: [...preset.enabledPermissions]
    }));

    setHasUnsavedChanges(true);
    showToast(`Modèle "${preset.name}" appliqué au rôle ${role}`);
  };

  // Handler: Duplicate role
  const handleDuplicateRole = (role: string) => {
    const copyId = `${role}_COPY`;
    const roleModConfig = localRoleModuleMatrix[role] || {};
    const rolePerms = localPermissionMatrix[role] || [];

    setLocalRoleModuleMatrix(prev => ({
      ...prev,
      [copyId]: { ...roleModConfig }
    }));

    setLocalPermissionMatrix(prev => ({
      ...prev,
      [copyId]: [...rolePerms]
    }));

    setCustomRoles(prev => [
      ...prev,
      { id: copyId, label: `${role} (Copie)`, desc: `Duplicata du profil ${role}` }
    ]);

    setSelectedRole(copyId);
    setHasUnsavedChanges(true);
    showToast(`Rôle dupliqué avec succès : ${copyId}`);
  };

  // Handler: Create custom role
  const handleCreateCustomRole = async (
    roleId: string,
    roleLabel: string,
    roleDesc: string,
    initialModules: string[],
    templateRole?: string
  ) => {
    const initialModMap: Record<string, boolean> = {};
    ERP_MODULES.forEach(m => {
      initialModMap[m.id] = initialModules.includes(m.id);
    });

    const initialPerms = templateRole && localPermissionMatrix[templateRole]
      ? [...localPermissionMatrix[templateRole]]
      : [];

    setLocalRoleModuleMatrix(prev => {
      const updated = { ...prev, [roleId]: initialModMap };
      PermissionService.setRoleModuleMatrix(updated);
      return updated;
    });

    setLocalPermissionMatrix(prev => ({
      ...prev,
      [roleId]: initialPerms
    }));

    const newCustomRoles = [
      ...customRoles,
      { id: roleId, label: roleLabel, desc: roleDesc }
    ];
    setCustomRoles(newCustomRoles);
    setSelectedRole(roleId);

    // Save immediately to backend
    await updateSettings({
      roleModuleMatrix: {
        ...localRoleModuleMatrix,
        [roleId]: initialModMap
      },
      permissionMatrix: {
        ...localPermissionMatrix,
        [roleId]: initialPerms
      },
      customRoles: newCustomRoles
    });

    setHasUnsavedChanges(false);
    showToast(`Nouveau rôle métier "${roleLabel}" créé et déployé !`);
  };

  // Handler: Delete custom role
  const handleDeleteRole = async () => {
    if (!confirmDelete) return;

    const target = confirmDelete;
    const updatedModMatrix = { ...localRoleModuleMatrix };
    delete updatedModMatrix[target];

    const updatedPermMatrix = { ...localPermissionMatrix };
    delete updatedPermMatrix[target];

    const updatedCustomRoles = customRoles.filter(r => r.id !== target);

    setLocalRoleModuleMatrix(updatedModMatrix);
    setLocalPermissionMatrix(updatedPermMatrix);
    setCustomRoles(updatedCustomRoles);
    PermissionService.setRoleModuleMatrix(updatedModMatrix);

    await updateSettings({
      roleModuleMatrix: updatedModMatrix,
      permissionMatrix: updatedPermMatrix,
      customRoles: updatedCustomRoles
    });

    setConfirmDelete(null);
    setSelectedRole("MANAGER");
    setHasUnsavedChanges(false);
    showToast(`Rôle "${target}" supprimé de la matrice.`);
  };

  // Handler: Save All Settings
  const handleSaveAll = async () => {
    try {
      await updateSettings({
        roleModuleMatrix: localRoleModuleMatrix,
        permissionMatrix: localPermissionMatrix,
        customRoles: customRoles
      });

      PermissionService.setRoleModuleMatrix(localRoleModuleMatrix);
      setHasUnsavedChanges(false);
      showToast("Matrice d'accès aux modules et habilitations enregistrée !");
    } catch (err: any) {
      showToast(`Échec de l'enregistrement: ${err.message}`, "error");
    }
  };

  // Reset to default recommendations
  const handleResetToDefaults = () => {
    const defaultMatrix: Record<string, Record<string, boolean>> = {};
    DEFAULT_CORE_ROLES.forEach(r => {
      defaultMatrix[r] = {};
      ERP_MODULES.forEach(m => {
        defaultMatrix[r][m.id] = m.defaultRoles.includes(r);
      });
    });

    setLocalRoleModuleMatrix(defaultMatrix);
    PermissionService.setRoleModuleMatrix(defaultMatrix);
    setHasUnsavedChanges(true);
    showToast("Matrice réinitialisée aux profils métiers recommandés.");
  };

  return (
    <div className="space-y-6 relative" id="roles-permissions-management-center">
      {/* Toast Notification Banner */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 backdrop-blur-md ${
              toastMessage.type === "success"
                ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300 shadow-emerald-500/10"
                : "bg-rose-950/90 border-rose-500/40 text-rose-300 shadow-rose-500/10"
            }`}
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-xs font-semibold">{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-slate-900/60 border border-slate-800/80 rounded-3xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">
                Contrôle d'Accès aux Modules & Rôles
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span>RBAC SSOT v3.0</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configurez et personnalisez précisément quel rôle métier accède à quel module de l'ERP.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Créer un Rôle</span>
          </button>

          <button
            onClick={handleResetToDefaults}
            disabled={loading}
            title="Réinitialiser aux profils standard"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold rounded-xl transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Par défaut</span>
          </button>

          {hasUnsavedChanges && (
            <button
              onClick={handleSaveAll}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20 animate-pulse"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? "Enregistrement..." : "Enregistrer la Matrice"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation View Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-950/80 border border-slate-800/80 rounded-2xl max-w-fit">
        <button
          onClick={() => setActiveTab("matrix")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "matrix"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Matrice Globale (Rôles × Modules)</span>
        </button>

        <button
          onClick={() => setActiveTab("detail")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "detail"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Configuration par Rôle</span>
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "simulator"
              ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Simulateur d'Accès</span>
        </button>
      </div>

      {/* Active Tab View */}
      {activeTab === "matrix" && (
        <RoleModuleMatrixGrid
          roles={effectiveRoles}
          roleModuleMatrix={localRoleModuleMatrix}
          onToggleModule={handleToggleModule}
          onBulkSetRoleModules={handleBulkSetRoleModules}
          loading={loading}
        />
      )}

      {activeTab === "detail" && (
        <RoleDetailConfig
          roles={effectiveRoles}
          selectedRole={selectedRole}
          onSelectRole={setSelectedRole}
          roleModuleMatrix={localRoleModuleMatrix}
          permissionMatrix={localPermissionMatrix}
          onToggleModule={handleToggleModule}
          onTogglePermission={handleTogglePermission}
          onApplyPreset={handleApplyPreset}
          onDuplicateRole={handleDuplicateRole}
          onRequestDeleteRole={(role) => setConfirmDelete(role)}
          loading={loading}
        />
      )}

      {activeTab === "simulator" && (
        <RoleAccessSimulator
          roles={effectiveRoles}
          roleModuleMatrix={localRoleModuleMatrix}
          permissionMatrix={localPermissionMatrix}
        />
      )}

      {/* Modal: Create Custom Role */}
      {showCreateModal && (
        <CreateRoleModal
          existingRoles={effectiveRoles}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateCustomRole}
          loading={loading}
        />
      )}

      {/* Modal: Delete Confirmation */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-rose-500/20 rounded-3xl overflow-hidden shadow-2xl p-6 text-center space-y-5"
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-500">
                <AlertTriangle className="w-7 h-7 animate-pulse" />
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-100">Supprimer le Rôle Personnalisé</h4>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Êtes-vous certain de vouloir supprimer le rôle <span className="text-slate-100 font-bold">"{confirmDelete}"</span> ? Tous les utilisateurs affectés à ce rôle basculeront automatiquement sur les accès standards.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteRole}
                  disabled={loading}
                  className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-500/20 transition-all"
                >
                  {loading ? "Suppression..." : "Confirmer"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
