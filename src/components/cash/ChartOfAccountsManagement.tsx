import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  Plus,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Layers,
  X,
  Save,
  ShieldCheck,
  Building2,
  HelpCircle,
  FolderTree
} from "lucide-react";
import {
  ChartOfAccountsRepository,
  ChartOfAccountItem,
  AccountClassId,
  ACCOUNT_CLASS_NAMES,
  StarterPackType,
  isSensitiveLiquidityAccount
} from "../../repositories/accounting/ChartOfAccountsRepository";
import { toast } from "sonner";

interface ChartOfAccountsManagementProps {
  businessId: string;
  currentRole: string;
}

export const ChartOfAccountsManagement: React.FC<ChartOfAccountsManagementProps> = ({
  businessId,
  currentRole
}) => {
  const [accounts, setAccounts] = useState<ChartOfAccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("ALL");

  // Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccountItem | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<AccountClassId>("1");
  const [type, setType] = useState<"HEADER" | "POSTING">("POSTING");
  const [currency, setCurrency] = useState<"HTG" | "USD" | "ANY">("HTG");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await ChartOfAccountsRepository.getAccountsByBusiness(businessId);
      setAccounts(data);
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors du chargement de la Charte des Comptes.");
    } finally {
      setIsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSeedStarterPack = async (packType: StarterPackType) => {
    if (!window.confirm("Voulez-vous injecter ce modèle sectoriel préconfiguré dans votre Plan Comptable ?")) {
      return;
    }
    try {
      setIsLoading(true);
      const items = await ChartOfAccountsRepository.seedStarterPack(businessId, packType, {
        uid: "USER",
        role: currentRole
      });
      setAccounts(items);
      toast.success("Modèle sectoriel injecté avec succès !");
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de l'injection du pack comptable.");
    } finally {
      setIsLoading(false);
    }
  };

  const openNewModal = () => {
    setEditingAccount(null);
    setCode("");
    setName("");
    setClassId("1");
    setType("POSTING");
    setCurrency("HTG");
    setDescription("");
    setIsEditorOpen(true);
  };

  const openEditModal = (acc: ChartOfAccountItem) => {
    setEditingAccount(acc);
    setCode(acc.code);
    setName(acc.name);
    setClassId(acc.classId);
    setType(acc.type);
    setCurrency(acc.currency || "HTG");
    setDescription(acc.description || "");
    setIsEditorOpen(true);
  };

  // Live code validation
  const codeValidation = ChartOfAccountsRepository.validateAccountCode(code, classId);
  const isSensitive = isSensitiveLiquidityAccount(code);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeValidation.isValid) {
      toast.error(codeValidation.error);
      return;
    }

    if (type === "POSTING" && isSensitive && (!currency || currency === "ANY")) {
      toast.error("Tout compte de trésorerie/transit exige une devise explicite (HTG ou USD).");
      return;
    }

    try {
      setIsSaving(true);
      const saved = await ChartOfAccountsRepository.upsertAccount(
        businessId,
        {
          code,
          name,
          classId,
          type,
          currency,
          description,
          isActive: editingAccount ? editingAccount.isActive : true
        },
        { uid: "USER", role: currentRole }
      );

      toast.success(`Compte [${saved.code} - ${saved.name}] enregistré.`);
      setIsEditorOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Erreur d'enregistrement du compte.");
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered Accounts
  const filteredAccounts = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = !q || acc.code.toLowerCase().includes(q) || acc.name.toLowerCase().includes(q);
    const matchesClass = selectedClassFilter === "ALL" || acc.classId === selectedClassFilter;
    return matchesSearch && matchesClass;
  });

  return (
    <div className="space-y-6 text-slate-100">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
            <BookOpen className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">
              Charte des Comptes (Plan Comptable Décimal & Bidevise)
            </h1>
            <p className="text-xs text-slate-400">
              Structure financière autoritative de l'entreprise (Classes 1 à 9, Comptes de Regroupement vs Imputation).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700 cursor-pointer"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>

          <button
            onClick={openNewModal}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Compte</span>
          </button>
        </div>
      </div>

      {/* STARTER PACKS SECTORIELS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Injecter un Modèle Sectoriel Préconfiguré (Starter Pack)
            </h3>
          </div>
          <span className="text-[10px] text-slate-500">
            Initialise instantanément une arborescence conforme bidevise.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleSeedStarterPack("GENERAL_COMMERCE")}
            className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-left transition group cursor-pointer"
          >
            <p className="text-xs font-bold text-slate-200 group-hover:text-emerald-400">
              Commerce Général
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Achats, Ventes, Stocks, Caisses HTG/USD & Banques.
            </p>
          </button>

          <button
            onClick={() => handleSeedStarterPack("MICROFINANCE_TRANSFERS")}
            className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/40 text-left transition group cursor-pointer"
          >
            <p className="text-xs font-bold text-slate-200 group-hover:text-cyan-400">
              Microfinance & Transferts
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Épargne, Microcrédits, Commissions & Clearing (1910/2910).
            </p>
          </button>

          <button
            onClick={() => handleSeedStarterPack("SERVICES_SALONS")}
            className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/40 text-left transition group cursor-pointer"
          >
            <p className="text-xs font-bold text-slate-200 group-hover:text-purple-400">
              Salons & Prestations Services
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Prestations coiffure/soins, commissions RH & fournitures.
            </p>
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher par code ou nom..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Classe:</span>
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="ALL">Toutes les Classes (1 à 9)</option>
            {Object.entries(ACCOUNT_CLASS_NAMES).map(([clsId, clsInfo]) => (
              <option key={clsId} value={clsId}>
                {clsInfo.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ACCOUNTS TABLE */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FolderTree className="w-4 h-4 text-emerald-400" />
            <span>Nomenclature Comptable ({filteredAccounts.length} comptes)</span>
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <th className="p-3.5">Code</th>
                <th className="p-3.5">Intitulé du Compte</th>
                <th className="p-3.5">Classe</th>
                <th className="p-3.5">Type / Nature</th>
                <th className="p-3.5">Devise</th>
                <th className="p-3.5">Sens Normal</th>
                <th className="p-3.5">Usage Moteur</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
              {filteredAccounts.map((acc) => {
                const isHeader = acc.type === "HEADER";
                return (
                  <tr
                    key={acc.id}
                    className={`hover:bg-slate-800/40 transition ${
                      isHeader ? "bg-slate-950/40 font-bold text-slate-200" : "text-slate-300"
                    }`}
                  >
                    <td className="p-3.5 text-emerald-400 font-bold tracking-wider">
                      {acc.code}
                    </td>
                    <td className="p-3.5">
                      <div className="font-sans font-medium text-slate-100 flex items-center gap-2">
                        <span>{acc.name}</span>
                        {isSensitiveLiquidityAccount(acc.code) && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                            Sensible
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 font-sans text-slate-400 text-[11px]">
                      {acc.className || `Classe ${acc.classId}`}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          isHeader
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}
                      >
                        {isHeader ? "Header / Regroupement" : "Posting / Imputation"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          acc.currency === "HTG"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : acc.currency === "USD"
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {acc.currency || "ANY"}
                      </span>
                    </td>
                    <td className="p-3.5 text-[11px]">
                      <span
                        className={
                          acc.normalBalance === "DEBIT" ? "text-emerald-400" : "text-cyan-400"
                        }
                      >
                        {acc.normalBalance}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          acc.smartUsage === "business"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : acc.smartUsage === "system"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {acc.smartUsage}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-sans">
                      <button
                        onClick={() => openEditModal(acc)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        Éditer
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-sans text-xs">
                    Aucun compte comptable trouvé pour cette recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDITOR MODAL */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-8">
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    {editingAccount ? "Éditer le Compte" : "Nouveau Compte Comptable"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Saisie contrôlée conforme au Plan Comptable décimal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditorOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Classe Comptable *
                </label>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value as AccountClassId)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  {Object.entries(ACCOUNT_CLASS_NAMES).map(([clsKey, clsInfo]) => (
                    <option key={clsKey} value={clsKey}>
                      {clsInfo.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Code Comptable (4 à 8 chiffres) *
                </label>
                <input
                  type="text"
                  required
                  placeholder={`Ex. ${classId}010`}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                {!codeValidation.isValid && code.length > 0 && (
                  <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{codeValidation.error}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Intitulé du Compte *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex. Caisse Guichet Monnaie Nationale"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Nature du Compte *
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as "HEADER" | "POSTING")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="POSTING">POSTING (Feuille / Imputation)</option>
                    <option value="HEADER">HEADER (Parent / Regroupement)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Devise Explicite *
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as "HTG" | "USD" | "ANY")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="HTG">HTG (Gourdes)</option>
                    <option value="USD">USD (Dollars)</option>
                    <option value="ANY">ANY (Multidevise)</option>
                  </select>
                </div>
              </div>

              {isSensitive && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Compte sensible de trésorerie ou transit : la devise explicite est obligatoire.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes comptables ou périmètre d'utilisation..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !codeValidation.isValid}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/10"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Enregistrement..." : "Enregistrer le Compte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
