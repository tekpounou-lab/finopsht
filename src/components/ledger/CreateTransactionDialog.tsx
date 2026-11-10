import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, AlertTriangle, Sparkles, HelpCircle, ArrowDownLeft, ArrowUpRight, MinusCircle, CheckCircle2, Layers, Lock } from 'lucide-react';
import { z } from 'zod';
import { Branch, Department, Employee, LedgerTransaction } from '../../types';
import { TransactionTypeItem, OperationalProfile } from '../../types/transactionTypes';
import { TransactionTypeRepository } from '../../repositories/TransactionTypeRepository';
import { TransactionMappingEngine } from '../../services/cash/transactionMappingEngine';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../../services/AccountingEngine';
import { toast } from 'sonner';

interface CreateTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  current_business_id: string;
  onSave: (tx: Partial<LedgerTransaction>) => Promise<void>;
  currentRole?: string;
}

const accountOptions = [
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.ASSETS).map(id => ({ id, label: `Actif: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.LIABILITIES).map(id => ({ id, label: `Passif: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.EQUITY).map(id => ({ id, label: `Capitaux Propres: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.REVENUE).map(id => ({ id, label: `Revenu: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.EXPENSES).map(id => ({ id, label: `Dépense: ${id}` }))
];

const createTxSchema = (hasEmployees: boolean) => z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'ADVANCE', 'TRANSFER', 'COMPENSATION']),
  description: z.string().min(3, "La description doit contenir au moins 3 caractères"),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
  currency: z.enum(['HTG', 'USD']),
  branchId: z.string().min(1, "Succursale requise"),
  departmentId: z.string().optional(),
  employeeId: hasEmployees 
    ? z.string().min(1, "L'écriture doit être assignée à un collaborateur existant dans l'entreprise")
    : z.string().optional(),
  category: z.string().min(1, "Catégorie requise"),
  debit_account: z.string().min(1, "Compte de débit requis"),
  credit_account: z.string().min(1, "Compte de crédit requis"),
  transaction_type_code: z.string().min(1, "Type d'opération requis")
}).refine(data => data.debit_account !== data.credit_account, {
  message: "Le compte crédité et le compte débité doivent être différents",
  path: ["credit_account"]
});

export default function CreateTransactionDialog({
  isOpen,
  onClose,
  branches,
  departments,
  employees,
  current_business_id,
  onSave,
  currentRole = 'MANAGER'
}: CreateTransactionDialogProps) {
  const [transactionTypes, setTransactionTypes] = useState<TransactionTypeItem[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [operationalProfile, setOperationalProfile] = useState<OperationalProfile>(() =>
    TransactionMappingEngine.resolveOperationalProfile(currentRole)
  );
  const [showAdvancedAccounting, setShowAdvancedAccounting] = useState(false);
  
  const [formData, setFormData] = useState({
    type: '' as 'INCOME' | 'EXPENSE' | 'ADVANCE' | 'TRANSFER' | 'COMPENSATION' | '',
    description: '',
    amount: '',
    currency: 'HTG' as 'HTG' | 'USD',
    branchId: '',
    departmentId: '',
    employeeId: '',
    category: '',
    debit_account: '',
    credit_account: '',
    transaction_type_code: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Load available Transaction Types for business tenant
  useEffect(() => {
    if (!isOpen || !current_business_id) return;
    TransactionTypeRepository.listByBusiness(current_business_id)
      .then((types) => setTransactionTypes(types))
      .catch((err) => console.warn("[CreateTransactionDialog] Error loading transaction types:", err));
  }, [isOpen, current_business_id]);

  // Synchronize initial operational profile with currentRole and reset form on open
  useEffect(() => {
    if (!isOpen) return;
    const defaultProfile = TransactionMappingEngine.resolveOperationalProfile(currentRole);
    setOperationalProfile(defaultProfile);
    setSelectedTypeId('');
    setFormData({
      type: '',
      description: '',
      amount: '',
      currency: 'HTG',
      branchId: '',
      departmentId: '',
      employeeId: '',
      category: '',
      debit_account: '',
      credit_account: '',
      transaction_type_code: ''
    });
    setErrors({});
  }, [isOpen, currentRole]);

  // Filter transaction types strictly by active operational RH profile
  const filteredTypes = useMemo(() => {
    return TransactionMappingEngine.filterTypesByProfile(transactionTypes, operationalProfile);
  }, [transactionTypes, operationalProfile]);

  // Handle Profile Switch by authorized users
  const handleProfileSwitch = (targetProfile: OperationalProfile) => {
    if (!TransactionMappingEngine.isProfileSwitchAllowed(currentRole, targetProfile)) {
      toast.error(`Accès refusé : Votre rôle (${currentRole}) ne permet pas de basculer vers le profil ${targetProfile.toUpperCase()}.`);
      return;
    }

    setOperationalProfile(targetProfile);

    // If currently selected operation is not allowed for the new profile, clean it up
    if (selectedTypeId) {
      const currentOp = transactionTypes.find((t) => t.id === selectedTypeId);
      const check = TransactionMappingEngine.isOperationAllowedForProfile(currentOp, targetProfile);
      if (!check.isAllowed) {
        setSelectedTypeId('');
        setFormData((prev) => ({
          ...prev,
          type: '',
          category: '',
          transaction_type_code: '',
          debit_account: '',
          credit_account: ''
        }));
        toast.info(`Profil basculé sur [${targetProfile.toUpperCase()}] : Sélectionnez une opération autorisée pour ce profil.`);
      }
    }
  };

  if (!isOpen) return null;

  // Handle choosing a pre-configured transaction type from catalog
  const handleSelectTransactionType = (typeId: string) => {
    setSelectedTypeId(typeId);
    if (!typeId) {
      setFormData((prev) => ({
        ...prev,
        type: '',
        category: '',
        transaction_type_code: '',
        debit_account: '',
        credit_account: ''
      }));
      return;
    }

    const found = transactionTypes.find((t) => t.id === typeId);
    if (!found) return;

    // Strict profile boundary validation
    const check = TransactionMappingEngine.isOperationAllowedForProfile(found, operationalProfile);
    if (!check.isAllowed) {
      toast.error(check.reason || "Cette opération n'est pas autorisée pour le profil actif.");
      setSelectedTypeId('');
      setFormData((prev) => ({
        ...prev,
        type: '',
        category: '',
        transaction_type_code: '',
        debit_account: '',
        credit_account: ''
      }));
      return;
    }

    const isIncome = found.behavior === 1 || found.category === 'Sales' || found.category === 'Services';
    const txType = isIncome ? 'INCOME' : found.behavior === -1 ? 'EXPENSE' : 'TRANSFER';

    setFormData((prev) => ({
      ...prev,
      type: txType,
      category: found.category,
      transaction_type_code: found.code,
      description: prev.description ? prev.description : found.name,
      currency: (found.currency === 'ALL' ? prev.currency || 'HTG' : found.currency) as 'HTG' | 'USD',
      debit_account: found.debit_account_code,
      credit_account: found.credit_account_code
    }));
    setErrors({});
  };

  // Live cash flow direction calculation based strictly on resolved accounts
  const hasAccounts = Boolean(formData.debit_account && formData.credit_account);
  const flowInfo = hasAccounts
    ? TransactionMappingEngine.calculateFlowBehavior(formData.debit_account, formData.credit_account)
    : { behavior: 0 as const, label: "En attente de sélection d'une opération" };

  // Sales & Services rule validation
  const ruleValidation = hasAccounts
    ? TransactionMappingEngine.validateSalesAndServicesRule(
        formData.category,
        formData.debit_account,
        formData.credit_account
      )
    : { isValid: false, error: "Sélectionnez une opération métier ci-dessus" };

  const canSwitch = TransactionMappingEngine.canSwitchProfile(currentRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (!selectedTypeId || !formData.transaction_type_code) {
      setErrors({ transaction_type: "Veuillez obligatoirement sélectionner une opération métier autorisée." });
      toast.error("Veuillez sélectionner une opération métier autorisée pour ce profil RH.");
      return;
    }

    const selectedOp = transactionTypes.find((t) => t.id === selectedTypeId);
    const profileCheck = TransactionMappingEngine.isOperationAllowedForProfile(selectedOp, operationalProfile);
    if (!profileCheck.isAllowed) {
      setErrors({ transaction_type: profileCheck.reason || "Opération non autorisée" });
      toast.error(profileCheck.reason || "Opération non autorisée pour ce profil RH.");
      return;
    }

    if (!ruleValidation.isValid) {
      setErrors({ credit_account: ruleValidation.error || "Règle comptable non conforme" });
      toast.error(ruleValidation.error);
      return;
    }

    try {
      const schema = createTxSchema(employees.length > 0);
      const parsed = schema.parse({
        ...formData,
        amount: parseFloat(formData.amount) || 0,
      });

      let selectedEmp = employees.find(e => e.id === parsed.employeeId);
      if (employees.length > 0 && !selectedEmp) {
        setErrors({ employeeId: "L'employé sélectionné n'existe pas dans l'entreprise." });
        return;
      }

      const empName = selectedEmp?.name || undefined;
      const empDept = selectedEmp?.departmentId || (selectedEmp as any)?.department_id;
      const targetDeptId = parsed.departmentId || empDept || "operations";
      const empBranch = selectedEmp?.branchId || (selectedEmp as any)?.branch_id;
      const targetBranchId = parsed.branchId || empBranch || "main";

      // Dynamic cash account resolution (Class 11xx substitution for HTG/USD)
      const resolvedAccounts = TransactionMappingEngine.resolveDynamicCashAccounts({
        debitAccountCode: parsed.debit_account,
        creditAccountCode: parsed.credit_account,
        tillCurrency: parsed.currency as 'HTG' | 'USD'
      });

      setLoading(true);
      await onSave({
        ...parsed,
        debit_account: resolvedAccounts.debitAccountCode,
        credit_account: resolvedAccounts.creditAccountCode,
        transaction_type_code: formData.transaction_type_code || undefined,
        branchId: targetBranchId,
        branch_id: targetBranchId,
        departmentId: targetDeptId,
        department_id: targetDeptId,
        cost_center_id: targetBranchId,
        costCenterId: targetBranchId,
        employeeId: selectedEmp?.id || parsed.employeeId || undefined,
        employee_id: selectedEmp?.id || parsed.employeeId || undefined,
        employeeName: empName,
        employee_name: empName,
        amount: parsed.amount,
        amount_cents: Math.round(parsed.amount * 100),
        debit: parsed.amount,
        credit: parsed.amount,
        debit_cents: Math.round(parsed.amount * 100),
        credit_cents: Math.round(parsed.amount * 100),
        business_id: current_business_id,
        businessId: current_business_id,
        date: new Date().toISOString(),
        currency: parsed.currency as 'HTG' | 'USD',
        status: 'POSTED',
        source: 'MANUAL',
        isImmutable: true
      });
      setLoading(false);
      onClose();
    } catch (err: any) {
      if (err && err.errors) {
        const fieldErrors: Record<string, string> = {};
        err.errors.forEach((e: any) => {
          if (e.path[0]) fieldErrors[e.path[0].toString()] = e.message;
        });
        setErrors(fieldErrors);
      }
    }
  };

  const filteredDepts = departments.filter(d => !formData.branchId || true);
  const filteredEmployees = employees.filter(e => 
    (!formData.branchId || e.branchId === formData.branchId) &&
    (!formData.departmentId || e.departmentId === formData.departmentId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh] my-auto">
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-100 text-sm tracking-wide">
                Guichet Opérationnel — Nouvelle Transaction
              </h3>
              <p className="text-[11px] text-slate-400 font-light">
                Mappage automatique Débit/Crédit guidé par la fiche de type de transaction.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition active:scale-95 border border-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-5 font-sans text-xs text-slate-300">
          
          {/* Step 1: Select Operational Profile & Transaction Type from Catalog */}
          <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[10px] uppercase font-extrabold text-cyan-400 tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                1. Sélectionner l'Opération Métier (Type de Transaction)
              </label>

              {/* Profile Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[10px]">
                <span className="text-slate-500 font-medium px-1">Profil RH:</span>
                {(['vendeur', 'teller', 'polyvalent', 'head_teller'] as OperationalProfile[]).map((p) => {
                  const isAllowed = TransactionMappingEngine.isProfileSwitchAllowed(currentRole, p);
                  const isSelected = operationalProfile === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={!isAllowed}
                      onClick={() => handleProfileSwitch(p)}
                      title={!isAllowed ? `Accès restreint au profil ${p.toUpperCase()} pour votre rôle` : `Basculer sur le profil ${p.toUpperCase()}`}
                      className={`px-2 py-0.5 rounded font-mono uppercase transition flex items-center gap-1 ${
                        isSelected
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                          : isAllowed
                          ? "text-slate-400 hover:text-slate-200 cursor-pointer"
                          : "text-slate-600 opacity-40 cursor-not-allowed"
                      }`}
                    >
                      {!isAllowed && <Lock className="w-2.5 h-2.5" />}
                      {p === 'head_teller' ? 'head' : p}
                    </button>
                  );
                })}
              </div>
            </div>

            <select
              value={selectedTypeId}
              onChange={(e) => handleSelectTransactionType(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:border-cyan-500 focus:outline-none"
            >
              <option value="">
                {filteredTypes.length > 0 
                  ? `-- Sélectionner une opération autorisée (${operationalProfile.toUpperCase()} • ${filteredTypes.length} disponibles) --`
                  : `-- Aucune opération disponible pour le profil ${operationalProfile.toUpperCase()} --`
                }
              </option>
              {filteredTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  [{t.code}] {t.name} — ({t.category})
                </option>
              ))}
            </select>
            {errors.transaction_type && (
              <span className="text-[10px] text-rose-400 font-semibold block">{errors.transaction_type}</span>
            )}
          </div>

          {/* Cash Flow Direction Indicator */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {hasAccounts && flowInfo.behavior === 1 && (
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              )}
              {hasAccounts && flowInfo.behavior === -1 && (
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              )}
              {(!hasAccounts || flowInfo.behavior === 0) && (
                <div className="p-1.5 rounded-lg bg-slate-800 text-slate-400 border border-slate-700">
                  <MinusCircle className="w-4 h-4" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-slate-200">{flowInfo.label}</p>
                <p className="text-[10px] text-slate-400">
                  {formData.category 
                    ? `${formData.category} • Mouvement de trésorerie géré automatiquement en arrière-plan.`
                    : "Sélectionnez une opération métier pour configurer le flux de caisse."}
                </p>
              </div>
            </div>
            {hasAccounts && ruleValidation.isValid ? (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Imputation Automatique
              </span>
            ) : hasAccounts ? (
              <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Invalide
              </span>
            ) : (
              <span className="text-[10px] font-medium text-slate-400 bg-slate-800/60 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                Sélection requise
              </span>
            )}
          </div>

          {/* Step 2: Form Details (Driven automatically by chosen operation) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>Nature de Transaction</span>
                <span className="text-[9px] text-cyan-400 font-normal">Auto-imputée</span>
              </label>
              <select 
                value={formData.type}
                disabled={Boolean(selectedTypeId)}
                onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none disabled:opacity-80 disabled:bg-slate-950/40"
              >
                <option value="">-- En attente d'opération --</option>
                <option value="INCOME">Revenu (INCOME)</option>
                <option value="EXPENSE">Dépense (EXPENSE)</option>
                <option value="ADVANCE">Avance (ADVANCE)</option>
                <option value="TRANSFER">Transfert (TRANSFER)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>Catégorie Métier</span>
                <span className="text-[9px] text-cyan-400 font-normal">Fiche profil</span>
              </label>
              <input 
                type="text" 
                readOnly={Boolean(selectedTypeId)}
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none read-only:opacity-80"
                placeholder="Sélectionnez une opération métier..."
              />
              {errors.category && <span className="text-[10px] text-rose-400">{errors.category}</span>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Libellé / Description *</label>
            <input 
              type="text" 
              required
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex. Encaissement vente de marchandises au guichet #1"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-cyan-500 outline-none"
            />
            {errors.description && <span className="text-[10px] text-rose-400">{errors.description}</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Montant *</label>
              <input 
                type="number" 
                step="0.01"
                required
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 font-mono text-xs text-emerald-400 font-bold focus:border-cyan-500 outline-none"
              />
              {errors.amount && <span className="text-[10px] text-rose-400">{errors.amount}</span>}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Devise Caisse</label>
              <select 
                value={formData.currency}
                onChange={e => setFormData({ ...formData, currency: e.target.value as 'HTG' | 'USD' })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
              >
                <option value="HTG">HTG (Monnaie Nationale)</option>
                <option value="USD">USD (Devise Étrangère)</option>
              </select>
            </div>
          </div>

          {/* Optional Collapsible Advanced Accounting Section */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedAccounting(!showAdvancedAccounting)}
              className="text-[11px] text-slate-400 hover:text-cyan-400 font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <span>{showAdvancedAccounting ? "▲ Masquer la configuration comptable" : "▼ Configuration comptable avancée (Arrière-plan)"}</span>
            </button>

            {showAdvancedAccounting && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800/80 mt-2.5 animate-fadeIn">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-emerald-400">Compte Débité (Code)</label>
                  <input
                    type="text"
                    required
                    value={formData.debit_account}
                    onChange={e => setFormData({ ...formData, debit_account: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-100"
                  />
                  {errors.debit_account && <span className="text-[10px] font-bold text-rose-400">{errors.debit_account}</span>}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-cyan-400">Compte Crédité (Code)</label>
                  <input
                    type="text"
                    required
                    value={formData.credit_account}
                    onChange={e => setFormData({ ...formData, credit_account: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 font-mono text-xs text-slate-100"
                  />
                  {errors.credit_account && <span className="text-[10px] font-bold text-rose-400">{errors.credit_account}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Branch & Employee Assignment */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Succursale d'Exécution *</label>
            <select 
              value={formData.branchId}
              onChange={e => setFormData({ ...formData, branchId: e.target.value, departmentId: '', employeeId: '' })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
            >
              <option value="">Sélectionner la succursale...</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {errors.branchId && <span className="text-[10px] text-rose-400">{errors.branchId}</span>}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400">Département (Analytique)</label>
              <select 
                value={formData.departmentId}
                onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
              >
                <option value="">Tous Départements</option>
                {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                <span>Collaborateur / Utilisateur Responsable *</span>
                <span className="text-[9px] text-cyan-400 font-semibold">Requis (Actif Entreprise)</span>
              </label>
              <select 
                value={formData.employeeId}
                required
                onChange={e => {
                  const empId = e.target.value;
                  const emp = employees.find(x => x.id === empId);
                  if (emp) {
                    setFormData({ 
                      ...formData, 
                      employeeId: empId,
                      branchId: emp.branchId || (emp as any).branch_id || formData.branchId,
                      departmentId: formData.departmentId || emp.departmentId || (emp as any).department_id || ""
                    });
                  } else {
                    setFormData({ ...formData, employeeId: empId });
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 outline-none"
              >
                <option value="">-- Sélectionner un utilisateur de l'entreprise --</option>
                {employees.map(e => {
                  const dept = departments.find(d => d.id === e.departmentId || d.id === (e as any).department_id)?.name || 'Sans Dépt';
                  const br = branches.find(b => b.id === e.branchId || b.id === (e as any).branch_id)?.name || 'Sans Succ';
                  return (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.position || 'Collaborateur'} ({dept} / {br})
                    </option>
                  );
                })}
              </select>
              {errors.employeeId && <span className="text-[10px] font-bold text-rose-400">{errors.employeeId}</span>}
            </div>
          </div>

        </form>

        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[10px] text-slate-500 font-mono">
            {formData.transaction_type_code ? `Code Type: ${formData.transaction_type_code}` : 'Saisie directe'}
          </div>
          <div className="flex gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-200 bg-slate-800 transition cursor-pointer"
            >
              Annuler
            </button>
            <button 
              onClick={handleSubmit}
              disabled={loading || !ruleValidation.isValid}
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 px-5 py-2 text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-lg shadow-cyan-500/10"
            >
              {loading ? 'Création...' : <><Save className="w-4 h-4" /> Enregistrer l'Écriture</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

