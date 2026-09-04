import React, { useState } from "react";
import { Department } from "../../types";
import { DepartmentMatchResult, DepartmentAliasEngine } from "../../domains/organization/services/DepartmentAliasEngine";
import { Building2, CheckCircle2, AlertTriangle, HelpCircle, ArrowRight, Save, ShieldCheck } from "lucide-react";

interface DepartmentMappingReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  unmappedItems: Array<{ rawLabel: string; count?: number; matchResult?: DepartmentMatchResult }>;
  departments: Department[];
  onConfirmMappings: (confirmedMappings: Record<string, string>, newAliasesToSave: Array<{ departmentId: string; alias: string }>) => void;
  title?: string;
  subtitle?: string;
}

export const DepartmentMappingReviewModal: React.FC<DepartmentMappingReviewModalProps> = ({
  isOpen,
  onClose,
  unmappedItems,
  departments,
  onConfirmMappings,
  title = "Revue de Correspondance des Départements (SSOT)",
  subtitle = "Les noms bruts importés doivent être associés aux identifiants uniques des Départements enregistrés dans l'ERP."
}) => {
  // State mapping rawLabel -> selected department_id
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    unmappedItems.forEach(item => {
      if (item.matchResult?.department) {
        initial[item.rawLabel] = item.matchResult.department.id;
      } else {
        const autoMatch = DepartmentAliasEngine.resolveDepartment(departments, item.rawLabel);
        if (autoMatch) {
          initial[item.rawLabel] = autoMatch.id;
        }
      }
    });
    return initial;
  });

  // Checkbox state for adding raw label as permanent alias
  const [saveAsAlias, setSaveAsAlias] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    unmappedItems.forEach(item => {
      initial[item.rawLabel] = true; // Default true to build alias engine over time
    });
    return initial;
  });

  if (!isOpen) return null;

  const handleMappingChange = (rawLabel: string, deptId: string) => {
    setSelectedMappings(prev => ({ ...prev, [rawLabel]: deptId }));
  };

  const handleAliasToggle = (rawLabel: string) => {
    setSaveAsAlias(prev => ({ ...prev, [rawLabel]: !prev[rawLabel] }));
  };

  const handleConfirm = () => {
    const aliasesToSave: Array<{ departmentId: string; alias: string }> = [];

    Object.entries(selectedMappings).forEach(([rawLabel, deptId]) => {
      if (deptId && saveAsAlias[rawLabel]) {
        aliasesToSave.push({ departmentId: deptId, alias: rawLabel });
      }
    });

    onConfirmMappings(selectedMappings, aliasesToSave);
    onClose();
  };

  const allResolved = unmappedItems.every(item => Boolean(selectedMappings[item.rawLabel]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/50 flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">{title}</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                SSOT Architecture
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          </div>
        </div>

        {/* Content Table */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <div className="p-3.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-xs text-slate-300 flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Règle de Gouvernance FINOPS :</strong> Les identifiants de département (<code className="text-emerald-300">department_id</code>) sont la source unique de vérité. La validation ici crée un mappage strict et enrichit le moteur d'alias pour les futurs imports.
            </div>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] uppercase font-mono text-slate-400">
                  <th className="py-3 px-4">Intitulé Brut Importé</th>
                  <th className="py-3 px-4 text-center">Correspondance</th>
                  <th className="py-3 px-4">Département Cible SSOT</th>
                  <th className="py-3 px-4 text-center">Memoriser Alias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {unmappedItems.map((item) => {
                  const currentMappedDeptId = selectedMappings[item.rawLabel] || "";
                  const matchDetails = item.matchResult || DepartmentAliasEngine.resolveDepartmentWithDetails(departments, item.rawLabel);
                  const isAutoMatched = matchDetails.confidence !== "UNMAPPED" && matchDetails.confidence !== "FUZZY_MATCH";

                  return (
                    <tr key={item.rawLabel} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-100">{item.rawLabel}</span>
                          {item.count !== undefined && (
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {item.count} occurrence(s) trouvée(s)
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <ArrowRight className="w-4 h-4 text-slate-600 inline-block" />
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={currentMappedDeptId}
                          onChange={(e) => handleMappingChange(item.rawLabel, e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        >
                          <option value="">-- Sélectionner le département SSOT --</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.code || d.id})
                            </option>
                          ))}
                        </select>
                        {isAutoMatched && (
                          <div className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1 font-mono">
                            <CheckCircle2 className="w-3 h-3" /> Auto-détecté via {matchDetails.confidence}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={Boolean(saveAsAlias[item.rawLabel])}
                            onChange={() => handleAliasToggle(item.rawLabel)}
                            disabled={!currentMappedDeptId}
                            className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500/30"
                          />
                          <span>Alias</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            {!allResolved ? (
              <span className="text-amber-400 flex items-center gap-1 font-mono">
                <AlertTriangle className="w-3.5 h-3.5" /> Veuillez associer tous les intitulés bruts.
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" /> Mappage complet prêt à être appliqué.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!allResolved}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              <Save className="w-4 h-4" />
              Valider & Enregistrer Mappages
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
