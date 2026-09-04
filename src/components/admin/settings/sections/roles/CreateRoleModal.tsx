import React, { useState } from "react";
import { X, Shield, Plus, AlertCircle, Check } from "lucide-react";
import { ERP_MODULES, STANDARD_ROLE_METADATA } from "./types";
import { motion } from "motion/react";

interface CreateRoleModalProps {
  existingRoles: string[];
  onClose: () => void;
  onCreate: (roleId: string, roleLabel: string, roleDesc: string, initialModules: string[], templateRole?: string) => Promise<void>;
  loading?: boolean;
}

export const CreateRoleModal: React.FC<CreateRoleModalProps> = ({
  existingRoles,
  onClose,
  onCreate,
  loading = false,
}) => {
  const [roleCode, setRoleCode] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [templateRole, setTemplateRole] = useState<string>("EMPLOYEE");
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "employeespace",
    "planning"
  ]);
  const [error, setError] = useState<string | null>(null);

  const normalizedRoleId = roleCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  const handleToggleModule = (moduleId: string) => {
    setSelectedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleTemplateChange = (tmpl: string) => {
    setTemplateRole(tmpl);
    if (tmpl) {
      // Pre-select default modules of that template
      const defaults = ERP_MODULES.filter(m => m.defaultRoles.includes(tmpl)).map(m => m.id);
      setSelectedModules(defaults);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedRoleId) {
      setError("Le code du rôle est obligatoire (ex: COMPTABLE).");
      return;
    }
    if (existingRoles.includes(normalizedRoleId)) {
      setError(`Le rôle "${normalizedRoleId}" existe déjà.`);
      return;
    }
    if (!roleLabel.trim()) {
      setError("Veuillez saisir un intitulé pour ce rôle.");
      return;
    }

    try {
      await onCreate(
        normalizedRoleId,
        roleLabel.trim(),
        roleDesc.trim() || "Rôle personnalisé de l'entreprise.",
        selectedModules,
        templateRole
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création du rôle.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-100">Créer un Nouveau Rôle Métier</h4>
              <p className="text-xs text-slate-400">Définissez les habilitations et les modules accessibles</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Code Identifiant *
              </label>
              <input
                type="text"
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                placeholder="ex: COMPTABLE, AUDITEUR"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-bold text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                required
              />
              <p className="text-[10px] text-slate-400 mt-1">Sera normalisé : {normalizedRoleId || "—"}</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Intitulé Affiché *
              </label>
              <input
                type="text"
                value={roleLabel}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder="ex: Comptable Principal"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Description / Périmètre Métier
            </label>
            <input
              type="text"
              value={roleDesc}
              onChange={(e) => setRoleDesc(e.target.value)}
              placeholder="ex: Responsable de la saisie comptable et du rapprochement bancaire"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Modèle de Base (Clonage Initial)
            </label>
            <select
              value={templateRole}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
            >
              <option value="">Profil Personnalisé Vierge</option>
              {existingRoles.map(r => (
                <option key={r} value={r}>
                  Cloner depuis {STANDARD_ROLE_METADATA[r]?.label || r}
                </option>
              ))}
            </select>
          </div>

          {/* Initial Modules Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Modules Autorisés ({selectedModules.length}/{ERP_MODULES.length})
              </label>
              <button
                type="button"
                onClick={() => setSelectedModules(ERP_MODULES.map(m => m.id))}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Tout sélectionner
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {ERP_MODULES.map(m => {
                const isChecked = selectedModules.includes(m.id);

                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => handleToggleModule(m.id)}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isChecked
                        ? "bg-emerald-500/10 border-emerald-500/30 text-slate-200"
                        : "bg-slate-950/40 border-slate-800/80 text-slate-400 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="truncate mr-2">
                      <p className="text-xs font-semibold">{m.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{m.id}</p>
                    </div>

                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                      isChecked ? "bg-emerald-500 border-emerald-500 text-slate-950" : "border-slate-700"
                    }`}>
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-bold transition-all"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{loading ? "Création..." : "Créer le Rôle & Activer"}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
