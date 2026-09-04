import React from "react";
import { TreeNode } from "../hooks/useOrganizationTree";
import { 
  Building2, 
  MapPin, 
  Layers, 
  UserCheck, 
  QrCode, 
  FileText, 
  Briefcase, 
  Mail, 
  DollarSign, 
  Edit3, 
  Check, 
  X,
  ExternalLink
} from "lucide-react";
import { Employee, EmployeeBadge, EmployeeContract } from "../../../types";

interface OrganizationNodeDetailsProps {
  selectedNode: TreeNode | null;
  editingDeptId: string | null;
  editDeptName: string;
  editDeptCode: string;
  setEditDeptName: (val: string) => void;
  setEditDeptCode: (val: string) => void;
  onStartEditDept: (dept: any) => void;
  onCancelEditDept: () => void;
  onSaveEditDept: (deptId: string) => void;
  onRegenerateBadge: (empId: string) => void;
  onPreviewBadge?: (badge: EmployeeBadge, emp: Employee) => void;
  onOpenEmployeeProfile?: (empId: string) => void;
  badges: EmployeeBadge[];
  contracts: EmployeeContract[];
}

export const OrganizationNodeDetails: React.FC<OrganizationNodeDetailsProps> = ({
  selectedNode,
  editingDeptId,
  editDeptName,
  editDeptCode,
  setEditDeptName,
  setEditDeptCode,
  onStartEditDept,
  onCancelEditDept,
  onSaveEditDept,
  onRegenerateBadge,
  onPreviewBadge,
  onOpenEmployeeProfile,
  badges,
  contracts,
}) => {
  if (!selectedNode) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[300px]">
        <Building2 className="w-12 h-12 text-slate-600 mb-3" />
        <h3 className="text-slate-300 font-medium text-sm">Aucun élément sélectionné</h3>
        <p className="text-slate-500 text-xs mt-1 max-w-xs">
          Sélectionnez une entité dans l'arborescence pour afficher sa configuration et ses attributs.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-4">
      {/* Node Header */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            {selectedNode.type === "BUSINESS" && <Building2 className="w-5 h-5" />}
            {selectedNode.type === "BRANCH" && <MapPin className="w-5 h-5 text-emerald-400" />}
            {selectedNode.type === "DEPARTMENT" && <Layers className="w-5 h-5 text-sky-400" />}
            {selectedNode.type === "EMPLOYEE" && <UserCheck className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {selectedNode.type}
              </span>
              {selectedNode.code && (
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                  {selectedNode.code}
                </span>
              )}
            </div>
            <h2 className="text-base font-bold text-white mt-0.5">{selectedNode.name}</h2>
          </div>
        </div>
      </div>

      {/* Details based on type */}
      {selectedNode.type === "BRANCH" && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 block mb-1">Localisation</span>
            <span className="text-white font-medium">{selectedNode.location || "Non spécifiée"}</span>
          </div>
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-800">
            <span className="text-slate-500 block mb-1">Départements Rattachés</span>
            <span className="text-white font-medium">{selectedNode.count || 0}</span>
          </div>
        </div>
      )}

      {selectedNode.type === "DEPARTMENT" && (
        <div className="space-y-3 text-xs">
          {editingDeptId === selectedNode.id ? (
            <div className="bg-slate-800/60 p-3 rounded-lg border border-indigo-500/30 space-y-2">
              <div>
                <label className="text-slate-400 block text-[11px] mb-1">Nom du département</label>
                <input
                  type="text"
                  value={editDeptName}
                  onChange={(e) => setEditDeptName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block text-[11px] mb-1">Code</label>
                <input
                  type="text"
                  value={editDeptCode}
                  onChange={(e) => setEditDeptCode(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white uppercase font-mono"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onCancelEditDept}
                  className="px-2.5 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> Annuler
                </button>
                <button
                  type="button"
                  onClick={() => onSaveEditDept(selectedNode.id)}
                  className="px-2.5 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center bg-slate-800/40 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500 block mb-1">Effectif affecté</span>
                <span className="text-white font-medium">{selectedNode.count || 0} Collaborateur(s)</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onStartEditDept({
                    id: selectedNode.id,
                    name: selectedNode.name,
                    code: selectedNode.code,
                  })
                }
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-400" /> Modifier
              </button>
            </div>
          )}
        </div>
      )}

      {selectedNode.type === "EMPLOYEE" && selectedNode.data && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[11px]">Poste</span>
              <span className="text-white font-medium truncate block">
                {selectedNode.data.position || "Non spécifié"}
              </span>
            </div>
            <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-500 block text-[11px]">Email</span>
              <span className="text-white font-medium truncate block">
                {selectedNode.data.email || "Non spécifié"}
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => onRegenerateBadge(selectedNode.id)}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 flex items-center justify-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" /> Régénérer Badge
            </button>
            {onOpenEmployeeProfile && (
              <button
                type="button"
                onClick={() => onOpenEmployeeProfile(selectedNode.id)}
                className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Fiche
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
