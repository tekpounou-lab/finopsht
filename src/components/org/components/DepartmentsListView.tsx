import React, { useState, useMemo } from "react";
import { Branch, Department, Employee } from "../../../types";
import { 
  Layers, 
  Search, 
  Plus, 
  UploadCloud, 
  Download, 
  Building2, 
  Users, 
  MapPin, 
  Trash2, 
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Filter
} from "lucide-react";
import { toast } from "sonner";
import { db } from "../../../lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";

interface DepartmentsListViewProps {
  departments: Department[];
  branches: Branch[];
  employees: Employee[];
  isOwnerOrManager: boolean;
  onOpenAddDept: () => void;
  onOpenBulkImport: (type: "departments") => void;
  onSelectDeptInTree?: (deptId: string) => void;
}

export const DepartmentsListView: React.FC<DepartmentsListViewProps> = ({
  departments,
  branches,
  employees,
  isOwnerOrManager,
  onOpenAddDept,
  onOpenBulkImport,
  onSelectDeptInTree,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [deletingDeptId, setDeletingDeptId] = useState<string | null>(null);

  // Download template function for departments
  const handleDownloadTemplate = () => {
    const filename = "modele_import_departements.csv";
    const headers = "nom,code,succursale,description\n";
    const sampleRows = 
      "Direction Générale,DIR,SIEGE,Direction exécutive et stratégique\n" +
      "Finance & Comptabilité,COMPTA,SIEGE,Gestion financière et comptabilité générale\n" +
      "Opérations & Caisse,CAISSE,DELM,Gestion des guichets et opérations de caisse\n" +
      "Ventes & Commercial,VENTES,CAPH,Développement commercial et prospection\n" +
      "Ressources Humaines,RH,SIEGE,Gestion du personnel et de la paie";

    const blob = new Blob(["\uFEFF" + headers + sampleRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Modèle CSV de départements téléchargé avec succès.");
  };

  // Branch map for fast lookup
  const branchMap = useMemo(() => {
    const map = new Map<string, Branch>();
    branches.forEach((b) => map.set(b.id, b));
    return map;
  }, [branches]);

  // Filtered departments
  const filteredDepartments = useMemo(() => {
    return departments.filter((d) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = 
        !q || 
        d.name.toLowerCase().includes(q) || 
        (d.code && d.code.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q));

      const deptBranchId = d.branchId || d.branch_id || "";
      const matchBranch = selectedBranchFilter === "ALL" || deptBranchId === selectedBranchFilter;

      const isActive = d.status === "ACTIVE" || d.is_active !== false;
      const matchStatus = 
        statusFilter === "ALL" || 
        (statusFilter === "ACTIVE" && isActive) || 
        (statusFilter === "INACTIVE" && !isActive);

      return matchQuery && matchBranch && matchStatus;
    });
  }, [departments, searchQuery, selectedBranchFilter, statusFilter]);

  // Count employees in department
  const getDeptEmployeesCount = (deptId: string) => {
    return employees.filter((e) => e.departmentId === deptId || (e as any).department_id === deptId).length;
  };

  const handleDeleteDept = async (dept: Department) => {
    const count = getDeptEmployeesCount(dept.id);
    if (count > 0) {
      toast.error(`Impossible de supprimer "${dept.name}" : ${count} collaborateur(s) y sont encore affectés.`);
      return;
    }
    if (!window.confirm(`Confirmez-vous la suppression du département "${dept.name}" ?`)) {
      return;
    }

    try {
      setDeletingDeptId(dept.id);
      await deleteDoc(doc(db, "departments", dept.id));
      toast.success(`Département "${dept.name}" supprimé avec succès.`);
    } catch (err: any) {
      toast.error(`Erreur de suppression : ${err.message}`);
    } finally {
      setDeletingDeptId(null);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-sky-400" />
            <span>Répertoire des Départements & Services</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300">
              {departments.length} département{departments.length > 1 ? "s" : ""}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visualisez, gérez et importez les unités fonctionnelles, centres de coûts et services rattachés aux succursales.
          </p>
        </div>

        {isOwnerOrManager && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-xl flex items-center gap-1.5 border border-slate-700 transition"
              title="Télécharger le fichier CSV pré-formaté avec exemples"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Modèle CSV</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenBulkImport("departments")}
              className="px-3 py-2 bg-sky-950/70 hover:bg-sky-900/80 border border-sky-500/30 text-sky-300 text-xs font-medium rounded-xl flex items-center gap-1.5 transition shadow-sm"
              title="Importer un fichier CSV ou Excel de départements"
            >
              <UploadCloud className="w-3.5 h-3.5 text-sky-400" />
              <span>Import Massif</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddDept}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 shadow-lg shadow-sky-900/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau Département</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un département ou code..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
          </div>

          {/* Branch filter dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">Toutes les Succursales ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                  {b.name} {b.code ? `(${b.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-400">Statut:</span>
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                statusFilter === "ALL" ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Tous ({departments.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                statusFilter === "ACTIVE" ? "bg-sky-500/20 text-sky-300 font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Actifs
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                statusFilter === "INACTIVE" ? "bg-slate-800 text-slate-300 font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Inactifs
            </button>
          </div>
        </div>
      </div>

      {/* Table of Departments */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-semibold">
            <tr>
              <th className="py-3 px-4">Département & Code</th>
              <th className="py-3 px-4">Succursale de Rattachement</th>
              <th className="py-3 px-4">Collaborateurs</th>
              <th className="py-3 px-4">Description / Rôle</th>
              <th className="py-3 px-4">Statut</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredDepartments.length > 0 ? (
              filteredDepartments.map((dept) => {
                const branchId = dept.branchId || dept.branch_id || "";
                const branch = branchMap.get(branchId);
                const empCount = getDeptEmployeesCount(dept.id);
                const isActive = dept.status === "ACTIVE" || dept.is_active !== false;

                return (
                  <tr key={dept.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 font-medium text-white flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100 flex items-center gap-2">
                          <span>{dept.name}</span>
                          {dept.code && (
                            <span className="font-mono text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-semibold">
                              {dept.code}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {dept.id}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {branch ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{branch.name}</span>
                          {branch.code && <span className="text-[10px] text-emerald-400/80 font-mono">({branch.code})</span>}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Siège / Non rattaché</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium">
                        <Users className="w-3 h-3 text-indigo-400" />
                        <span>{empCount} collaborateur{empCount > 1 ? "s" : ""}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                      {dept.description || <span className="text-slate-600 italic">Aucune description</span>}
                    </td>

                    <td className="py-3 px-4">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Actif</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          <span>Inactif</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right space-x-1">
                      {onSelectDeptInTree && (
                        <button
                          type="button"
                          onClick={() => onSelectDeptInTree(dept.id)}
                          className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition"
                          title="Localiser dans l'organigramme"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isOwnerOrManager && (
                        <button
                          type="button"
                          disabled={deletingDeptId === dept.id}
                          onClick={() => handleDeleteDept(dept)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50"
                          title="Supprimer le département"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 font-mono text-xs">
                  Aucun département trouvé avec ces critères.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
