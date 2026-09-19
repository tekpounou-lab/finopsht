import React, { useState, useEffect, useCallback } from "react";
import { 
  CreditCard, 
  Plus, 
  Settings, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RotateCcw,
  Search,
  Filter,
  ShieldCheck,
  Globe,
  Briefcase,
  Layers,
  ArrowUpDown
} from "lucide-react";
import { PaymentMethodRepository, PaymentMethod, PaymentMethodCategory, AccountingEffect } from "../../repositories/PaymentMethodRepository";
import { toast } from "sonner";

export function SuperAdminPaymentMethodRegistry() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");
  const [effectFilter, setEffectFilter] = useState<string>("ALL");

  // Edit / Create modal states
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingMethod, setEditingMethod] = useState<Partial<PaymentMethod> | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Form states
  const [formCode, setFormCode] = useState<string>("");
  const [formName, setFormName] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formCategory, setFormCategory] = useState<PaymentMethodCategory>("CASH");
  const [formEffect, setFormEffect] = useState<AccountingEffect>("TREASURY");
  const [formTreasuryCode, setFormTreasuryCode] = useState<string>("");
  const [formInflow, setFormInflow] = useState<boolean>(true);
  const [formOutflow, setFormOutflow] = useState<boolean>(true);
  const [formScope, setFormScope] = useState<"GLOBAL" | "TENANT">("GLOBAL");
  const [formBusinessId, setFormBusinessId] = useState<string>("");
  const [formSortOrder, setFormSortOrder] = useState<number>(1);
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  const loadMethods = useCallback(async () => {
    setLoading(true);
    try {
      const list = await PaymentMethodRepository.getAllMethods();
      setMethods(list);
    } catch (err: any) {
      toast.error("Erreur lors du chargement de l'annuaire des modes de paiement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMethods();
  }, [loadMethods]);

  const handleOpenCreate = () => {
    setEditingMethod(null);
    setFormCode("");
    setFormName("");
    setFormDescription("");
    setFormCategory("CASH");
    setFormEffect("TREASURY");
    setFormTreasuryCode("1000");
    setFormInflow(true);
    setFormOutflow(true);
    setFormScope("GLOBAL");
    setFormBusinessId("");
    setFormSortOrder(methods.length + 1);
    setFormStatus("ACTIVE");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (m: PaymentMethod) => {
    setEditingMethod(m);
    setFormCode(m.code);
    setFormName(m.name);
    setFormDescription(m.description || "");
    setFormCategory(m.category);
    setFormEffect(m.accountingEffect);
    setFormTreasuryCode(m.treasuryAccountCode || "");
    setFormInflow(m.supportedDirections.includes("INFLOW"));
    setFormOutflow(m.supportedDirections.includes("OUTFLOW"));
    setFormScope(m.scope);
    setFormBusinessId(m.business_id || "");
    setFormSortOrder(m.sortOrder);
    setFormStatus(m.status);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode || !formName) {
      toast.error("Le code et le libellé sont obligatoires.");
      return;
    }

    setIsSaving(true);
    try {
      const actor = {
        uid: "super_admin",
        email: "superadmin@finops.com",
        name: "Super Admin Platform"
      };

      const directions: Array<"INFLOW" | "OUTFLOW"> = [];
      if (formInflow) directions.push("INFLOW");
      if (formOutflow) directions.push("OUTFLOW");

      if (directions.length === 0) {
        toast.error("Vous devez sélectionner au moins une direction de flux (Entrées ou Sorties).");
        setIsSaving(false);
        return;
      }

      const payload: PaymentMethod = {
        id: editingMethod?.id || `pm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        code: formCode.toUpperCase().trim(),
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        accountingEffect: formEffect,
        treasuryAccountCode: formEffect === "TREASURY" ? (formTreasuryCode.trim() || null) : null,
        supportedDirections: directions,
        status: formStatus,
        scope: formScope,
        business_id: formScope === "TENANT" ? (formBusinessId.trim() || null) : null,
        sortOrder: Number(formSortOrder) || 1,
        createdBy: editingMethod?.createdBy || actor.uid,
        updatedBy: actor.uid
      };

      await PaymentMethodRepository.savePaymentMethod(payload, actor);
      toast.success(`Mode de paiement ${payload.name} enregistré avec succès.`);
      setIsModalOpen(false);
      loadMethods();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erreur lors de l'enregistrement.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (m: PaymentMethod) => {
    const actor = {
      uid: "super_admin",
      email: "superadmin@finops.com",
      name: "Super Admin Platform"
    };

    try {
      if (m.status === "ACTIVE") {
        await PaymentMethodRepository.deactivatePaymentMethod(m.id, actor);
        toast.success(`Mode de paiement ${m.name} désactivé.`);
      } else {
        const updated = { ...m, status: "ACTIVE" as const };
        await PaymentMethodRepository.savePaymentMethod(updated, actor);
        toast.success(`Mode de paiement ${m.name} réactivé.`);
      }
      loadMethods();
    } catch (err: any) {
      toast.error(err.message || "Erreur de changement de statut.");
    }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm("Voulez-vous réinitialiser le registre avec les modes de paiement standards FINOPS (CASH, BANK, MONCASH...) ?")) {
      return;
    }
    setLoading(true);
    try {
      await PaymentMethodRepository.seedDefaultPaymentMethods();
      toast.success("Modes de paiement réinitialisés avec succès.");
      loadMethods();
    } catch (err: any) {
      toast.error("Échec de la réinitialisation.");
    } finally {
      setLoading(false);
    }
  };

  // Filter methods list
  const filteredMethods = methods.filter((m) => {
    const searchLower = search.toLowerCase();
    const matchSearch = 
      m.code.toLowerCase().includes(searchLower) || 
      m.name.toLowerCase().includes(searchLower) || 
      (m.description || "").toLowerCase().includes(searchLower);

    const matchCategory = categoryFilter === "ALL" || m.category === categoryFilter;
    const matchScope = scopeFilter === "ALL" || m.scope === scopeFilter;
    const matchEffect = effectFilter === "ALL" || m.accountingEffect === effectFilter;

    return matchSearch && matchCategory && matchScope && matchEffect;
  });

  return (
    <div className="space-y-6" id="superadmin-payment-methods-tab">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Total Modes Enregistrés</span>
            <div className="text-2xl font-bold text-white">{methods.length}</div>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Modes Actifs</span>
            <div className="text-2xl font-bold text-emerald-400">
              {methods.filter(m => m.status === "ACTIVE").length}
            </div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Trésorerie Réelle (Treasury)</span>
            <div className="text-2xl font-bold text-indigo-400">
              {methods.filter(m => m.accountingEffect === "TREASURY").length}
            </div>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-md">
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Accruals / Hors Trésorerie</span>
            <div className="text-2xl font-bold text-amber-500">
              {methods.filter(m => m.accountingEffect === "NON_CASH").length}
            </div>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-lg">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Control Actions Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            <span>Registre des Modes de Paiement (SSOT)</span>
          </h2>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSeedDefaults}
              className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Réinitialiser Standards
            </button>
            <button
              onClick={handleOpenCreate}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-indigo-950/40 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau Mode
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher code, nom..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="relative flex items-center">
            <Filter className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-white appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">Toutes Catégories</option>
              <option value="CASH">CASH (Espèces)</option>
              <option value="BANK">BANK (Banque)</option>
              <option value="BANK_TRANSFER">BANK_TRANSFER (Virement)</option>
              <option value="MOBILE_MONEY">MOBILE_MONEY (M-Pay)</option>
              <option value="CARD">CARD (Carte)</option>
              <option value="CHECK">CHECK (Chèque)</option>
              <option value="WIRE">WIRE (International)</option>
              <option value="CREDIT">CREDIT (Accrual)</option>
              <option value="OTHER">OTHER (Autre)</option>
            </select>
          </div>

          <div className="relative flex items-center">
            <Globe className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-white appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">Tous les Scopes</option>
              <option value="GLOBAL">GLOBAL (Système)</option>
              <option value="TENANT">TENANT (Spécifique)</option>
            </select>
          </div>

          <div className="relative flex items-center">
            <Activity className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
            <select
              value={effectFilter}
              onChange={(e) => setEffectFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-white appearance-none focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="ALL">Tous Effets Comptables</option>
              <option value="TREASURY">TREASURY (Trésorerie Réelle)</option>
              <option value="NON_CASH">NON_CASH (Accruals / Ignorés)</option>
            </select>
          </div>
        </div>

        {/* Methods Table */}
        <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500">Chargement des données...</div>
          ) : filteredMethods.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">Aucun mode de paiement trouvé.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="p-3">Ordre</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Libellé</th>
                  <th className="p-3">Catégorie</th>
                  <th className="p-3">Effet Comptable</th>
                  <th className="p-3">Compte Classe 10</th>
                  <th className="p-3">Scope</th>
                  <th className="p-3">Directions</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {filteredMethods.map((m) => {
                  const isTreasury = m.accountingEffect === "TREASURY";
                  return (
                    <tr key={m.id} className="hover:bg-slate-900/40 transition">
                      <td className="p-3 font-mono text-slate-500">{m.sortOrder}</td>
                      <td className="p-3 font-bold text-white font-mono">{m.code}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{m.name}</div>
                        {m.description && (
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{m.description}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                          {m.category}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          isTreasury 
                            ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                            : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        }`}>
                          {m.accountingEffect}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-400">
                        {isTreasury ? (
                          m.treasuryAccountCode ? (
                            <span className="text-emerald-400">{m.treasuryAccountCode}</span>
                          ) : (
                            <span className="text-slate-600">Aucun</span>
                          )
                        ) : (
                          <span className="text-slate-600 font-sans italic">Exclu (Accrual)</span>
                        )}
                      </td>
                      <td className="p-3">
                        {m.scope === "GLOBAL" ? (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Globe className="w-3 h-3 text-sky-400" /> Global
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-400" title={m.business_id || undefined}>
                            <Briefcase className="w-3 h-3 text-amber-400" /> Spécifique
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {m.supportedDirections.map((d) => (
                            <span key={d} className="px-1.5 py-0.2 bg-slate-800 text-[9px] font-mono text-slate-400 rounded">
                              {d === "INFLOW" ? "Entrées" : "Sorties"}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleToggleStatus(m)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition ${
                            m.status === "ACTIVE" 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                        >
                          {m.status === "ACTIVE" ? "ACTIF" : "DÉSACTIVÉ"}
                        </button>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                          title="Modifier les propriétés"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Details/Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-400" />
                <span>{editingMethod ? "Modifier le Mode de Paiement" : "Nouveau Mode de Paiement"}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Code Unique (SSOT)</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingMethod}
                    placeholder="E.g. MONCASH"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 uppercase font-mono disabled:opacity-55"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Libellé d'affichage</label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. Sogebank MonCash"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400">Description / Rôle</label>
                <textarea
                  placeholder="Expliquez la destination ou l'effet de ce canal de règlement..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 h-16 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Catégorie Technologique</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as PaymentMethodCategory)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="CASH">CASH (Liquidités)</option>
                    <option value="BANK">BANK (Banque)</option>
                    <option value="BANK_TRANSFER">BANK_TRANSFER (Virement)</option>
                    <option value="MOBILE_MONEY">MOBILE_MONEY (M-Pay)</option>
                    <option value="CARD">CARD (Carte de crédit)</option>
                    <option value="CHECK">CHECK (Chèque)</option>
                    <option value="WIRE">WIRE (International Swift)</option>
                    <option value="CREDIT">CREDIT (Accruals/Ignorés)</option>
                    <option value="OTHER">OTHER (Autre)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Effet de Trésorerie</label>
                  <select
                    value={formEffect}
                    onChange={(e) => setFormEffect(e.target.value as AccountingEffect)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="TREASURY">TREASURY (Trésorerie Réelle)</option>
                    <option value="NON_CASH">NON_CASH (Comptabilité d'Engagement)</option>
                  </select>
                </div>
              </div>

              {formEffect === "TREASURY" && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Rattachement Classe 10 Trésorerie (SSOT)
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="Code du compte de Trésorerie (Ex: 1010, 1020)"
                    value={formTreasuryCode}
                    onChange={(e) => setFormTreasuryCode(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-850 rounded-lg text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400">
                    Saisissez le code comptable qui sera utilisé par défaut pour identifier le mouvement d'actif (doit commencer par 10).
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Scope de Visibilité</label>
                  <select
                    value={formScope}
                    onChange={(e) => setFormScope(e.target.value as "GLOBAL" | "TENANT")}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="GLOBAL">GLOBAL (Disponible pour tous)</option>
                    <option value="TENANT">TENANT (Limité à un client)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400">Ordre de tri</label>
                  <input
                    type="number"
                    min="1"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {formScope === "TENANT" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-amber-400">Identifiant Unique du Tenant (business_id)</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: biz_abc123"
                    value={formBusinessId}
                    onChange={(e) => setFormBusinessId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              {/* Supported directions */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400">Directions de Flux Autorisées</label>
                <div className="flex gap-6 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={formInflow}
                      onChange={(e) => setFormInflow(e.target.checked)}
                      className="rounded border-slate-750 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-slate-900 w-4 h-4 cursor-pointer"
                    />
                    <span>Flux d'Entrées (Inflow)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={formOutflow}
                      onChange={(e) => setFormOutflow(e.target.checked)}
                      className="rounded border-slate-750 text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-slate-900 w-4 h-4 cursor-pointer"
                    />
                    <span>Flux de Sorties (Outflow)</span>
                  </label>
                </div>
              </div>

              {/* Status toggle */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-400">Statut initial</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="formStatus"
                      checked={formStatus === "ACTIVE"}
                      onChange={() => setFormStatus("ACTIVE")}
                      className="text-indigo-600 bg-slate-950 border-slate-800 w-4 h-4 cursor-pointer"
                    />
                    <span>Actif</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="radio"
                      name="formStatus"
                      checked={formStatus === "INACTIVE"}
                      onChange={() => setFormStatus("INACTIVE")}
                      className="text-indigo-600 bg-slate-950 border-slate-800 w-4 h-4 cursor-pointer"
                    />
                    <span>Désactivé</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-900/50 -mx-5 -mb-5 p-5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1 transition shadow-lg shadow-indigo-950/40 disabled:opacity-50"
                >
                  {isSaving && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
