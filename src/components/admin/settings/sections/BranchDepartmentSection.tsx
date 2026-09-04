import React, { useState } from "react";
import { MapPin, Building2, Plus, Trash2, Edit2, Search, CheckCircle2, XCircle, AlertTriangle, X, ChevronRight } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { Branch, Department } from "../../../../types";
import { motion, AnimatePresence } from "motion/react";
import MasterDataDiagnostics from "./MasterDataDiagnostics";
import { MasterDataSynchronizationService } from "../../../../domains/organization/services/MasterDataSynchronizationService";

export default function BranchDepartmentSection() {
  const { currentBusiness, branches, departments } = useBusinessContext();
  const { saveBranch, deleteBranch, saveDepartment, deleteDepartment, loading } = useBusinessAdmin();
  const [activeTab, setActiveTab] = useState<"BRANCHES" | "DEPARTMENTS" | "DIAGNOSTICS">("BRANCHES");
  const [searchQuery, setSearchQuery] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDepartments = departments.filter(d => 
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    d.code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleStatus = async (item: any, type: "BRANCH" | "DEPT") => {
    if (type === "BRANCH") {
      await saveBranch({ ...item, is_active: !item.is_active });
    } else {
      await saveDepartment({ ...item, is_active: !item.is_active });
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = {
      name: (formData.get("name") as string).trim(),
      code: (formData.get("code") as string || "").trim().toUpperCase(),
      is_active: editingItem?.is_active ?? true,
    };

    const businessId = currentBusiness?.id || "";

    if (activeTab === "BRANCHES") {
      data.location = formData.get("location") as string;
      if (editingItem?.id && (editingItem.name !== data.name || editingItem.code !== data.code)) {
        await MasterDataSynchronizationService.cascadeRenameBranch(
          businessId,
          editingItem.id,
          data.name,
          data.code
        );
      } else {
        await saveBranch({ ...editingItem, ...data });
      }
    } else {
      if (editingItem?.id && (editingItem.name !== data.name || editingItem.code !== data.code)) {
        await MasterDataSynchronizationService.cascadeRenameDepartment(
          businessId,
          editingItem.id,
          data.name,
          data.code
        );
      } else {
        await saveDepartment({ ...editingItem, ...data });
      }
    }

    setShowModal(false);
    setEditingItem(null);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if (activeTab === "BRANCHES") {
      await deleteBranch(confirmDelete.id);
    } else {
      await deleteDepartment(confirmDelete.id);
    }
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6" id="org-section-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Structure Organisationnelle</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Gérez vos succursales et départements pour une isolation parfaite des données.</p>
        </div>
        <div className="flex gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab("BRANCHES")}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === "BRANCHES" ? "bg-slate-800 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            SUCCURSALES
          </button>
          <button 
            onClick={() => setActiveTab("DEPARTMENTS")}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === "DEPARTMENTS" ? "bg-slate-800 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            DÉPARTEMENTS
          </button>
          <button 
            onClick={() => setActiveTab("DIAGNOSTICS")}
            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${activeTab === "DIAGNOSTICS" ? "bg-slate-800 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
          >
            AUDIT & SYNC
          </button>
        </div>
      </div>

      {activeTab === "DIAGNOSTICS" ? (
        <MasterDataDiagnostics />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input 
                  placeholder="Filtrer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-900 rounded-lg py-1.5 pl-9 pr-3 text-[11px] text-slate-300 outline-none focus:border-cyan-500/30 transition-all"
                />
              </div>
              <button 
                onClick={() => {
                  setEditingItem(null);
                  setShowModal(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold rounded-lg hover:bg-cyan-500/20 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                AJOUTER {activeTab === "BRANCHES" ? "UNE SUCCURSALE" : "UN DÉPARTEMENT"}
              </button>
            </div>

            <div className="overflow-hidden border border-slate-900 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/50">
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Nom / Code</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">{activeTab === "BRANCHES" ? "Localisation" : "Responsable"}</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900">Statut</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {activeTab === "BRANCHES" ? (
                    filteredBranches.map(branch => (
                      <tr key={branch.id} className="hover:bg-slate-900/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                              <MapPin className="w-4 h-4 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-200">{branch.name}</p>
                              <p className="text-[10px] font-mono text-slate-500 mt-0.5">{branch.code || "BRN-001"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] text-slate-400">{branch.location || "N/A"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => handleToggleStatus(branch, "BRANCH")}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${
                              branch.is_active !== false 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-slate-800 border-slate-700 text-slate-500"
                            }`}
                          >
                            {branch.is_active !== false ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                            {branch.is_active !== false ? "ACTIF" : "INACTIF"}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingItem(branch);
                                setShowModal(true);
                              }}
                              className="p-1.5 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-cyan-400"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setConfirmDelete(branch)}
                              className="p-1.5 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    filteredDepartments.map(dept => (
                      <tr key={dept.id} className="hover:bg-slate-900/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-200">{dept.name}</p>
                              <p className="text-[10px] font-mono text-slate-500 mt-0.5">{dept.code || "DEPT-HR"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[11px] text-slate-400">Manager Enterprise</p>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => handleToggleStatus(dept, "DEPT")}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${
                              dept.is_active !== false 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                              : "bg-slate-800 border-slate-700 text-slate-500"
                            }`}
                          >
                            {dept.is_active !== false ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                            {dept.is_active !== false ? "ACTIF" : "INACTIF"}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingItem(dept);
                                setShowModal(true);
                              }}
                              className="p-1.5 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-cyan-400"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => setConfirmDelete(dept)}
                              className="p-1.5 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                  {(activeTab === "BRANCHES" ? filteredBranches : filteredDepartments).length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <p className="text-xs text-slate-500 font-medium">Aucun élément trouvé.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div>
                  <h4 className="text-sm font-bold text-slate-100 uppercase tracking-tight">
                    {editingItem ? "Modifier" : "Ajouter"} {activeTab === "BRANCHES" ? "une succursale" : "un département"}
                  </h4>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Configuration Structurelle</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Nom Officiel</label>
                    <input 
                      name="name"
                      defaultValue={editingItem?.name}
                      required
                      placeholder={activeTab === "BRANCHES" ? "Ex: Succursale Nord" : "Ex: Ressources Humaines"}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-xs text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Code Interne</label>
                      <input 
                        name="code"
                        defaultValue={editingItem?.code}
                        placeholder={activeTab === "BRANCHES" ? "BRN-001" : "DEPT-HR"}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-xs text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                      />
                    </div>
                    {activeTab === "BRANCHES" && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Ville / Localisation</label>
                        <input 
                          name="location"
                          defaultValue={editingItem?.location}
                          placeholder="Ex: Port-au-Prince"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-xs text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-800 transition-all"
                  >
                    ANNULER
                  </button>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/10"
                  >
                    {loading ? "CHARGEMENT..." : "ENREGISTRER"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-sm bg-slate-900 border border-rose-500/20 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto border border-rose-500/20">
                  <AlertTriangle className="w-8 h-8 text-rose-500 animate-pulse" />
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-lg font-black text-slate-100 uppercase tracking-tight">Confirmer la suppression</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Êtes-vous sûr de vouloir supprimer <span className="text-slate-100 font-bold">"{confirmDelete.name}"</span> ? Cette action est irréversible et pourrait affecter l'isolation des données des employés associés.
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button 
                    onClick={handleDelete}
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-rose-500 text-white text-xs font-black hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 uppercase tracking-widest"
                  >
                    {loading ? "SUPPRESSION..." : "OUI, SUPPRIMER DÉFINITIVEMENT"}
                  </button>
                  <button 
                    onClick={() => setConfirmDelete(null)}
                    className="w-full py-3 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold hover:bg-slate-750 transition-all uppercase tracking-widest"
                  >
                    ANNULER
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

