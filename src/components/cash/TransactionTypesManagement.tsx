import React, { useState, useEffect, useMemo } from "react";
import {
  Layers,
  Plus,
  Upload,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  MinusCircle,
  Edit2,
  Trash2,
  Sparkles,
  RefreshCw,
  Building,
  HelpCircle
} from "lucide-react";
import {
  TransactionTypeItem,
  TransactionTypeCategory,
  FlowBehavior,
  OperationalProfile
} from "../../types/transactionTypes";
import { TransactionTypeRepository } from "../../repositories/TransactionTypeRepository";
import { TransactionTypeEditorDialog } from "./TransactionTypeEditorDialog";
import { TransactionTypeBulkImportDialog } from "./TransactionTypeBulkImportDialog";
import { toast } from "sonner";

interface TransactionTypesManagementProps {
  businessId: string;
  currentRole: string;
}

export const TransactionTypesManagement: React.FC<TransactionTypesManagementProps> = ({
  businessId,
  currentRole
}) => {
  const [types, setTypes] = useState<TransactionTypeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedBehavior, setSelectedBehavior] = useState<string>("ALL");
  const [selectedProfile, setSelectedProfile] = useState<string>("ALL");

  const [showEditor, setShowEditor] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingType, setEditingType] = useState<TransactionTypeItem | null>(null);

  const loadTypes = async () => {
    if (!businessId) return;
    try {
      setIsLoading(true);
      const data = await TransactionTypeRepository.listByBusiness(businessId);
      setTypes(data);
    } catch (err) {
      toast.error("Erreur lors du chargement des types de transactions.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTypes();
  }, [businessId]);

  const filteredTypes = useMemo(() => {
    return types.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      if (
        q &&
        !t.code.toLowerCase().includes(q) &&
        !t.name.toLowerCase().includes(q) &&
        !t.debit_account_code.toLowerCase().includes(q) &&
        !t.credit_account_code.toLowerCase().includes(q)
      ) {
        return false;
      }

      if (selectedCategory !== "ALL" && t.category !== selectedCategory) {
        return false;
      }

      if (selectedBehavior !== "ALL" && String(t.behavior) !== selectedBehavior) {
        return false;
      }

      if (
        selectedProfile !== "ALL" &&
        t.allowedProfiles &&
        !t.allowedProfiles.includes(selectedProfile as OperationalProfile)
      ) {
        return false;
      }

      return true;
    });
  }, [types, searchQuery, selectedCategory, selectedBehavior, selectedProfile]);

  const kpis = useMemo(() => {
    const total = types.length;
    const cashIn = types.filter((t) => t.behavior === 1).length;
    const cashOut = types.filter((t) => t.behavior === -1).length;
    const systemProtected = types.filter((t) => t.isProtected || t.isSystemDefault).length;
    return { total, cashIn, cashOut, systemProtected };
  }, [types]);

  const handleEdit = (type: TransactionTypeItem) => {
    setEditingType(type);
    setShowEditor(true);
  };

  const handleCreateNew = () => {
    setEditingType(null);
    setShowEditor(true);
  };

  const handleDelete = async (type: TransactionTypeItem) => {
    if (type.isSystemDefault || type.isProtected) {
      toast.error("Les types de transactions système par défaut ne peuvent pas être supprimés.");
      return;
    }

    if (
      !confirm(
        `Voulez-vous vraiment supprimer le type de transaction [${type.code} - ${type.name}] ?`
      )
    ) {
      return;
    }

    try {
      await TransactionTypeRepository.deleteCustomType(type.id, businessId, { role: currentRole });
      toast.success(`Type de transaction [${type.code}] supprimé.`);
      loadTypes();
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de la suppression.");
    }
  };

  return (
    <div className="space-y-6" id="transaction-types-module">
      {/* Module Title & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 shadow-sm backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-100 tracking-tight">
              Gestion des Types de Transactions
            </h2>
          </div>
          <p className="text-xs text-slate-400 font-light mt-1">
            Pont opérationnel guichet ↔ Moteur comptable en partie double. Mappage automatique Débit/Crédit et règles RH.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowBulkImport(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            <Upload className="w-4 h-4 text-teal-400" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={handleCreateNew}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Type</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Total Types</p>
            <p className="text-xl font-black text-slate-100 mt-1 font-mono">{kpis.total}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 text-cyan-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Entrées Cash (+1)</p>
            <p className="text-xl font-black text-emerald-400 mt-1 font-mono">{kpis.cashIn}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Sorties Cash (-1)</p>
            <p className="text-xl font-black text-amber-400 mt-1 font-mono">{kpis.cashOut}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Système Protect</p>
            <p className="text-xl font-black text-purple-400 mt-1 font-mono">{kpis.systemProtected}</p>
          </div>
          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/40 p-3.5 rounded-2xl border border-slate-800">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par code, nom ou compte..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Toutes les Catégories</option>
            <option value="Sales">Sales (Ventes)</option>
            <option value="Services">Services</option>
            <option value="Money Transfer">Money Transfer</option>
            <option value="Mobile Transfer">Mobile Transfer</option>
            <option value="Currency Exchange">Currency Exchange</option>
            <option value="Operating Expenses">Operating Expenses</option>
            <option value="Internal Transfers">Internal Transfers</option>
            <option value="Clearing">Clearing</option>
          </select>

          {/* Behavior Filter */}
          <select
            value={selectedBehavior}
            onChange={(e) => setSelectedBehavior(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous les Flux</option>
            <option value="1">Entrée Cash (+1)</option>
            <option value="-1">Sortie Cash (-1)</option>
            <option value="0">Neutre (0)</option>
          </select>

          {/* Profile Filter */}
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Tous Profils RH</option>
            <option value="vendeur">Vendeur</option>
            <option value="teller">Caissier / Teller</option>
            <option value="polyvalent">Polyvalent</option>
            <option value="head_teller">Chef Caissier</option>
          </select>

          <button
            onClick={loadTypes}
            title="Rafraîchir"
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 transition cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="border border-slate-800 rounded-2xl bg-slate-900/50 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400">
              <tr>
                <th className="p-3.5">Code</th>
                <th className="p-3.5">Intitulé & Catégorie</th>
                <th className="p-3.5">Flux (Behavior)</th>
                <th className="p-3.5">Imputation Débit</th>
                <th className="p-3.5">Imputation Crédit</th>
                <th className="p-3.5">Profils RH Autorisés</th>
                <th className="p-3.5 text-center">Statut</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-light">
                    Chargement du catalogue des types de transactions...
                  </td>
                </tr>
              ) : filteredTypes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-light">
                    Aucun type de transaction ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredTypes.map((item) => {
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition">
                      {/* Code */}
                      <td className="p-3.5 font-mono font-bold text-cyan-400 text-sm">
                        {item.code}
                      </td>

                      {/* Name & Category */}
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-100">{item.name}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                            {item.category}
                          </span>
                          {item.description && (
                            <span className="truncate max-w-[180px]">{item.description}</span>
                          )}
                        </div>
                      </td>

                      {/* Behavior */}
                      <td className="p-3.5 font-mono">
                        {item.behavior === 1 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ArrowDownLeft className="w-3 h-3" /> Entrée (+1)
                          </span>
                        )}
                        {item.behavior === -1 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <ArrowUpRight className="w-3 h-3" /> Sortie (-1)
                          </span>
                        )}
                        {item.behavior === 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            <MinusCircle className="w-3 h-3" /> Neutre (0)
                          </span>
                        )}
                      </td>

                      {/* Debit Account */}
                      <td className="p-3.5 font-mono">
                        <div className="text-slate-200 font-bold">{item.debit_account_code}</div>
                        <div className="text-[10px] text-slate-400 font-sans truncate max-w-[140px]">
                          {item.debit_account_name}
                        </div>
                      </td>

                      {/* Credit Account */}
                      <td className="p-3.5 font-mono">
                        <div className="text-slate-200 font-bold">{item.credit_account_code}</div>
                        <div className="text-[10px] text-slate-400 font-sans truncate max-w-[140px]">
                          {item.credit_account_name}
                        </div>
                      </td>

                      {/* Allowed RH Profiles */}
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {(item.allowedProfiles || []).map((p) => (
                            <span
                              key={p}
                              className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-950 border border-slate-800 text-slate-400"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Status / System Badge */}
                      <td className="p-3.5 text-center">
                        {item.isProtected || item.isSystemDefault ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            <ShieldAlert className="w-3 h-3 text-purple-400" /> Système
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                            <Sparkles className="w-3 h-3 text-cyan-400" /> Personnalisé
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleEdit(item)}
                            title="Éditer le type et l'imputation"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!item.isSystemDefault && !item.isProtected && (
                            <button
                              onClick={() => handleDelete(item)}
                              title="Supprimer"
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal */}
      <TransactionTypeEditorDialog
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        businessId={businessId}
        currentRole={currentRole}
        initialData={editingType}
        onSaved={loadTypes}
      />

      {/* Bulk Import Modal */}
      <TransactionTypeBulkImportDialog
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        businessId={businessId}
        currentRole={currentRole}
        onImportComplete={loadTypes}
      />
    </div>
  );
};
