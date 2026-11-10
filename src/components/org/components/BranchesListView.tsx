import React, { useState, useMemo } from "react";
import { Branch, Department, Employee } from "../../../types";
import { 
  MapPin, 
  Search, 
  Plus, 
  UploadCloud, 
  Download, 
  Building2, 
  Users, 
  Layers, 
  Trash2, 
  Edit3, 
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { db } from "../../../lib/firebase";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";

interface BranchesListViewProps {
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  isOwnerOrManager: boolean;
  onOpenAddBranch: () => void;
  onOpenBulkImport: (type: "branches") => void;
  onSelectBranchInTree?: (branchId: string) => void;
}

export const BranchesListView: React.FC<BranchesListViewProps> = ({
  branches,
  departments,
  employees,
  isOwnerOrManager,
  onOpenAddBranch,
  onOpenBulkImport,
  onSelectBranchInTree,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [deletingBranchId, setDeletingBranchId] = useState<string | null>(null);

  // Download template function
  const handleDownloadTemplate = () => {
    const filename = "modele_import_succursales.csv";
    const headers = "nom,code,adresse,ville,telephone,email\n";
    const sampleRows = 
      "Succursale Siège,SIEGE,Rue Capois,Port-au-Prince,+509 3700-0001,siege@finops.ht\n" +
      "Succursale Pétion-Ville,PVIL,Rue Panamericaine,Pétion-Ville,+509 3700-0002,pvil@finops.ht\n" +
      "Succursale Cap-Haïtien,CAPH,Rue 18 A,Cap-Haïtien,+509 3700-0003,cap@finops.ht\n" +
      "Succursale Delmas,DELM,Delmas 33,Delmas,+509 3700-0004,delmas@finops.ht";

    const blob = new Blob(["\uFEFF" + headers + sampleRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Modèle CSV de succursales téléchargé avec succès.");
  };

  // Filtered branches
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = 
        !q || 
        b.name.toLowerCase().includes(q) || 
        (b.code && b.code.toLowerCase().includes(q)) || 
        (b.location && b.location.toLowerCase().includes(q)) ||
        (b.address && b.address.toLowerCase().includes(q));

      const isActive = b.status === "ACTIVE" || b.is_active !== false;
      const matchStatus = 
        statusFilter === "ALL" || 
        (statusFilter === "ACTIVE" && isActive) || 
        (statusFilter === "INACTIVE" && !isActive);

      return matchQuery && matchStatus;
    });
  }, [branches, searchQuery, statusFilter]);

  // Count attached departments and employees per branch
  const getBranchStats = (branchId: string) => {
    const branchDepts = departments.filter((d) => d.branchId === branchId || d.branch_id === branchId);
    const branchEmployees = employees.filter((e) => e.branchId === branchId || (e as any).branch_id === branchId);
    return {
      deptsCount: branchDepts.length,
      employeesCount: branchEmployees.length,
    };
  };

  const handleDeleteBranch = async (branch: Branch) => {
    const stats = getBranchStats(branch.id);
    if (stats.employeesCount > 0) {
      toast.error(`Impossible de supprimer "${branch.name}" : ${stats.employeesCount} collaborateur(s) y sont encore affectés.`);
      return;
    }
    if (!window.confirm(`Confirmez-vous la suppression de la succursale "${branch.name}" ?`)) {
      return;
    }

    try {
      setDeletingBranchId(branch.id);
      await deleteDoc(doc(db, "branches", branch.id));
      toast.success(`Succursale "${branch.name}" supprimée avec succès.`);
    } catch (err: any) {
      toast.error(`Erreur de suppression : ${err.message}`);
    } finally {
      setDeletingBranchId(null);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            <span>Répertoire des Succursales & Points de Service</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              {branches.length} succursale{branches.length > 1 ? "s" : ""}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Visualisez, gérez et importez les sites physiques, bureaux régionaux et points de vente de l'entreprise.
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
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Modèle CSV</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenBulkImport("branches")}
              className="px-3 py-2 bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-300 text-xs font-medium rounded-xl flex items-center gap-1.5 transition shadow-sm"
              title="Importer un fichier CSV ou Excel de succursales"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
              <span>Import Massif</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddBranch}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-900/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle Succursale</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, code ou ville..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
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
              Toutes ({branches.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                statusFilter === "ACTIVE" ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Actives
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                statusFilter === "INACTIVE" ? "bg-slate-800 text-slate-300 font-semibold" : "text-slate-400 hover:text-white"
              }`}
            >
              Inactives
            </button>
          </div>
        </div>
      </div>

      {/* Table of Branches */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/60">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800 font-semibold">
            <tr>
              <th className="py-3 px-4">Succursale & Code</th>
              <th className="py-3 px-4">Localisation / Ville</th>
              <th className="py-3 px-4">Départements</th>
              <th className="py-3 px-4">Collaborateurs</th>
              <th className="py-3 px-4">Statut</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredBranches.length > 0 ? (
              filteredBranches.map((branch) => {
                const stats = getBranchStats(branch.id);
                const isActive = branch.status === "ACTIVE" || branch.is_active !== false;

                return (
                  <tr key={branch.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 px-4 font-medium text-white flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100 flex items-center gap-2">
                          <span>{branch.name}</span>
                          {branch.code && (
                            <span className="font-mono text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-semibold">
                              {branch.code}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">ID: {branch.id}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-300">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{branch.location || branch.address || "Principal"}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[11px] font-medium">
                        <Layers className="w-3 h-3 text-sky-400" />
                        <span>{stats.deptsCount} département{stats.deptsCount > 1 ? "s" : ""}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium">
                        <Users className="w-3 h-3 text-indigo-400" />
                        <span>{stats.employeesCount} collaborateur{stats.employeesCount > 1 ? "s" : ""}</span>
                      </span>
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
                      {onSelectBranchInTree && (
                        <button
                          type="button"
                          onClick={() => onSelectBranchInTree(branch.id)}
                          className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded-lg transition"
                          title="Localiser dans l'organigramme"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isOwnerOrManager && (
                        <button
                          type="button"
                          disabled={deletingBranchId === branch.id}
                          onClick={() => handleDeleteBranch(branch)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50"
                          title="Supprimer la succursale"
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
                  Aucune succursale trouvée avec ces critères.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
