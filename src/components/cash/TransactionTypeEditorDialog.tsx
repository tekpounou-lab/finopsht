import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Save,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  MinusCircle
} from "lucide-react";
import {
  TransactionTypeItem,
  TransactionTypeCategory,
  FlowBehavior,
  OperationalProfile
} from "../../types/transactionTypes";
import { TransactionMappingEngine } from "../../services/cash/transactionMappingEngine";
import { TransactionTypeRepository } from "../../repositories/TransactionTypeRepository";
import { ChartOfAccountsRepository, ChartOfAccountItem } from "../../repositories/accounting/ChartOfAccountsRepository";
import { toast } from "sonner";

interface TransactionTypeEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  currentRole: string;
  initialData?: TransactionTypeItem | null;
  onSaved: (item: TransactionTypeItem) => void;
}

const CATEGORIES: TransactionTypeCategory[] = [
  "Sales",
  "Services",
  "Money Transfer",
  "Mobile Transfer",
  "Currency Exchange",
  "Operating Expenses",
  "Internal Transfers",
  "Clearing",
  "Other"
];

const PROFILES: { id: OperationalProfile; label: string }[] = [
  { id: "vendeur", label: "Vendeur (Sales/Services)" },
  { id: "teller", label: "Caissier / Teller (Money/Mobile/Exchange)" },
  { id: "polyvalent", label: "Polyvalent (Guichet Général)" },
  { id: "head_teller", label: "Chef Caissier (Supervision/Dépenses)" },
  { id: "manager", label: "Directeur / Manager" },
  { id: "owner", label: "Propriétaire / Owner" }
];

const COMMON_ACCOUNTS = [
  { code: "1111", name: "Caisse Physique Monnaie Nationale (HTG)", class: "1" },
  { code: "1121", name: "Caisse Physique Monnaie Étrangère (USD)", class: "1" },
  { code: "1200", name: "Comptes de Dépôt / Créances Clients", class: "1" },
  { code: "1300", name: "Avances au Personnel", class: "1" },
  { code: "1910", name: "Compte de Virement Interne de Fonds", class: "1" },
  { code: "2400", name: "Compte d'Attente Transferts à Payer", class: "2" },
  { code: "2910", name: "Compte de Clearing / Compensation Interne", class: "2" },
  { code: "4000", name: "Produits de Ventes de Marchandises", class: "4" },
  { code: "4100", name: "Produits des Prestations de Services", class: "4" },
  { code: "4200", name: "Produits de Ventes de Crédits Mobiles", class: "4" },
  { code: "6010", name: "Charges d'Exploitation et Fournitures", class: "6" },
  { code: "6020", name: "Frais Généraux et Services Extérieurs", class: "6" },
  { code: "6500", name: "Frais Bancaires et Commissions", class: "6" }
];

export const TransactionTypeEditorDialog: React.FC<TransactionTypeEditorDialogProps> = ({
  isOpen,
  onClose,
  businessId,
  currentRole,
  initialData,
  onSaved
}) => {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TransactionTypeCategory>("Sales");
  const [currency, setCurrency] = useState<"HTG" | "USD" | "ALL">("ALL");
  const [debitCode, setDebitCode] = useState("1111");
  const [debitName, setDebitName] = useState("Caisse Physique Monnaie Nationale (HTG)");
  const [creditCode, setCreditCode] = useState("4000");
  const [creditName, setCreditName] = useState("Produits de Ventes de Marchandises");
  const [description, setDescription] = useState("");
  const [allowedProfiles, setAllowedProfiles] = useState<OperationalProfile[]>([
    "vendeur",
    "polyvalent",
    "head_teller",
    "manager",
    "owner"
  ]);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccountItem[]>([]);

  useEffect(() => {
    if (isOpen && businessId) {
      ChartOfAccountsRepository.getAccountsByBusiness(businessId)
        .then((accs) => setChartAccounts(accs.filter((a) => a.type === "POSTING")))
        .catch((err) => console.warn("Error fetching accounts for editor:", err));
    }
  }, [isOpen, businessId]);

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code || "");
      setName(initialData.name || "");
      setCategory(initialData.category || "Sales");
      setCurrency(initialData.currency || "ALL");
      setDebitCode(initialData.debit_account_code || "1111");
      setDebitName(initialData.debit_account_name || "");
      setCreditCode(initialData.credit_account_code || "4000");
      setCreditName(initialData.credit_account_name || "");
      setDescription(initialData.description || "");
      setAllowedProfiles(initialData.allowedProfiles || ["vendeur", "polyvalent", "head_teller", "manager", "owner"]);
      setIsActive(initialData.isActive !== false);
    } else {
      setCode("");
      setName("");
      setCategory("Sales");
      setCurrency("ALL");
      setDebitCode("1111");
      setDebitName("Caisse Physique Monnaie Nationale (HTG)");
      setCreditCode("4000");
      setCreditName("Produits de Ventes de Marchandises");
      setDescription("");
      setAllowedProfiles(["vendeur", "polyvalent", "head_teller", "manager", "owner"]);
      setIsActive(true);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  // Live cash flow direction calculation
  const flowInfo = TransactionMappingEngine.calculateFlowBehavior(debitCode, creditCode);

  // Sales & Services rule validation
  const ruleValidation = TransactionMappingEngine.validateSalesAndServicesRule(
    category,
    debitCode,
    creditCode
  );

  const handleRecommend = () => {
    if (!name && !code) {
      toast.info("Saisissez d'abord un nom ou un code de compte pour obtenir une recommandation.");
      return;
    }
    const rec = TransactionMappingEngine.recommendTransactionType(code || creditCode, name || "Opération");
    setCategory(rec.recommendedCategory);
    setDebitCode(rec.suggestedDebitCode);
    setDebitName(rec.suggestedDebitName);
    setCreditCode(rec.suggestedCreditCode);
    setCreditName(rec.suggestedCreditName);
    toast.success(`Recommandation appliquée : ${rec.reasoning}`);
  };

  const handleSelectDebit = (accCode: string) => {
    setDebitCode(accCode);
    const foundChart = chartAccounts.find((a) => a.code === accCode);
    if (foundChart) {
      setDebitName(foundChart.name);
      return;
    }
    const found = COMMON_ACCOUNTS.find((a) => a.code === accCode);
    if (found) setDebitName(found.name);
  };

  const handleSelectCredit = (accCode: string) => {
    setCreditCode(accCode);
    const foundChart = chartAccounts.find((a) => a.code === accCode);
    if (foundChart) {
      setCreditName(foundChart.name);
      return;
    }
    const found = COMMON_ACCOUNTS.find((a) => a.code === accCode);
    if (found) setCreditName(found.name);
  };

  const toggleProfile = (p: OperationalProfile) => {
    if (allowedProfiles.includes(p)) {
      setAllowedProfiles(allowedProfiles.filter((item) => item !== p));
    } else {
      setAllowedProfiles([...allowedProfiles, p]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) {
      toast.error("Veuillez renseigner le code et le nom du type de transaction.");
      return;
    }

    if (!ruleValidation.isValid) {
      toast.error(ruleValidation.error);
      return;
    }

    try {
      setIsSaving(true);
      const saved = await TransactionTypeRepository.upsertCompanyTransactionType(
        {
          id: initialData?.id,
          business_id: businessId,
          code,
          name,
          category,
          behavior: flowInfo.behavior,
          currency,
          allowedProfiles,
          debit_account_code: debitCode,
          debit_account_name: debitName,
          credit_account_code: creditCode,
          credit_account_name: creditName,
          description,
          isActive,
          isSystemDefault: initialData?.isSystemDefault || false
        },
        { role: currentRole }
      );

      toast.success(`Type de transaction [${saved.code} - ${saved.name}] enregistré avec succès.`);
      onSaved(saved);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de l'enregistrement du type de transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                {initialData ? "Éditer le Type de Transaction" : "Nouveau Type de Transaction"}
              </h3>
              <p className="text-xs text-slate-400">
                Gouvernance de la cartographie comptable et droits d'accès guichet.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Top Info & Recommendation Button */}
          <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              <span>Associe automatiquement une écriture comptable Débit / Crédit équilibrée.</span>
            </div>
            <button
              type="button"
              onClick={handleRecommend}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Recommander Mappage
            </button>
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Code Unique / Normé *
              </label>
              <input
                type="text"
                required
                disabled={Boolean(initialData?.isProtected)}
                placeholder="Ex. 1001, 3001"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Intitulé Opérationnel *
              </label>
              <input
                type="text"
                required
                placeholder="Ex. Vente de Marchandises"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Catégorie Métier
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TransactionTypeCategory)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Devise Applicable
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "HTG" | "USD" | "ALL")}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Toutes Devises (Multidevise)</option>
                <option value="HTG">HTG Uniquement</option>
                <option value="USD">USD Uniquement</option>
              </select>
            </div>
          </div>

          {/* Cash Flow Direction Calculation Card */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {flowInfo.behavior === 1 && (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
              )}
              {flowInfo.behavior === -1 && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
              )}
              {flowInfo.behavior === 0 && (
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400">
                  <MinusCircle className="w-5 h-5" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-200">Sens du Flux de Trésorerie (Behavior)</p>
                <p className="text-[11px] text-slate-400">{flowInfo.label}</p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                flowInfo.behavior === 1
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : flowInfo.behavior === -1
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              Behavior: {flowInfo.behavior > 0 ? `+${flowInfo.behavior}` : flowInfo.behavior}
            </span>
          </div>

          {/* Double-Entry Accounting Mapping Section */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Moteur d'Imputation Comptable (Débit / Crédit)</span>
              {ruleValidation.isValid ? (
                <span className="text-[10px] text-emerald-400 font-normal flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Règle comptable valide
                </span>
              ) : (
                <span className="text-[10px] text-rose-400 font-normal flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Règle non conforme
                </span>
              )}
            </h4>

            {!ruleValidation.isValid && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{ruleValidation.error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Debit Account */}
              <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                <label className="block text-[10px] uppercase font-bold text-emerald-400">
                  Compte Débité (Récepteur de valeur) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="1111"
                    value={debitCode}
                    onChange={(e) => setDebitCode(e.target.value)}
                    className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                  <select
                    value={debitCode}
                    onChange={(e) => handleSelectDebit(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
                  >
                    <option value={debitCode}>{debitName || "Sélectionner du Plan Comptable..."}</option>
                    {(chartAccounts.length > 0 ? chartAccounts : COMMON_ACCOUNTS).map((acc) => (
                      <option key={`deb_${acc.code}`} value={acc.code}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Intitulé du compte débité"
                  value={debitName}
                  onChange={(e) => setDebitName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 mt-1"
                />
              </div>

              {/* Credit Account */}
              <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                <label className="block text-[10px] uppercase font-bold text-cyan-400">
                  Compte Crédité (Source / Produit / Contrepartie) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="4000"
                    value={creditCode}
                    onChange={(e) => setCreditCode(e.target.value)}
                    className="w-24 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 font-mono"
                  />
                  <select
                    value={creditCode}
                    onChange={(e) => handleSelectCredit(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
                  >
                    <option value={creditCode}>{creditName || "Sélectionner du Plan Comptable..."}</option>
                    {(chartAccounts.length > 0 ? chartAccounts : COMMON_ACCOUNTS).map((acc) => (
                      <option key={`cred_${acc.code}`} value={acc.code}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Intitulé du compte crédité"
                  value={creditName}
                  onChange={(e) => setCreditName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 mt-1"
                />
              </div>
            </div>
          </div>

          {/* Operational RH Profile Authorization */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block text-[10px] uppercase font-bold text-slate-400">
              Profils RH Opérationnels Autorisés sur le Guichet
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PROFILES.map((p) => {
                const isSelected = allowedProfiles.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProfile(p.id)}
                    className={`px-3 py-2 rounded-xl text-[11px] font-medium border text-left transition cursor-pointer ${
                      isSelected
                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                        : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
              Description / Notes d'Exploitation
            </label>
            <textarea
              rows={2}
              placeholder="Exication sur l'utilisation métier de ce type..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="is_active_toggle"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
            />
            <label htmlFor="is_active_toggle" className="text-xs text-slate-300 cursor-pointer">
              Type de transaction actif et visible sur les formulaires de caisse
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving || !ruleValidation.isValid}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/10"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Enregistrement..." : "Enregistrer le Type"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
