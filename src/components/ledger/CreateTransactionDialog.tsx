import React, { useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { z } from 'zod';
import { Branch, Department, Employee, LedgerTransaction } from '../../types';

interface CreateTransactionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  current_business_id: string;
  onSave: (tx: Partial<LedgerTransaction>) => Promise<void>;
}

import { DEFAULT_CHART_OF_ACCOUNTS } from '../../services/AccountingEngine';

const accountOptions = [
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.ASSETS).map(id => ({ id, label: `Actif: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.LIABILITIES).map(id => ({ id, label: `Passif: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.EQUITY).map(id => ({ id, label: `Capitaux Propres: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.REVENUE).map(id => ({ id, label: `Revenu: ${id}` })),
  ...Object.values(DEFAULT_CHART_OF_ACCOUNTS.EXPENSES).map(id => ({ id, label: `Dépense: ${id}` }))
];

const txSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'ADVANCE', 'TRANSFER']),
  description: z.string().min(3, "La description doit contenir au moins 3 caractères"),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
  currency: z.enum(['HTG', 'USD']),
  branchId: z.string().min(1, "Succursale requise"),
  departmentId: z.string().optional(),
  employeeId: z.string().optional(),
  category: z.string().min(1, "Catégorie requise"),
  debit_account: z.string().min(1, "Compte de débit requis"),
  credit_account: z.string().min(1, "Compte de crédit requis")
}).refine(data => data.debit_account !== data.credit_account, {
  message: "Le compte crédité et le compte débité doivent être différents",
  path: ["credit_account"]
});

export default function CreateTransactionDialog({ isOpen, onClose, branches, departments, employees, current_business_id, onSave }: CreateTransactionDialogProps) {
  const [formData, setFormData] = useState({
    type: 'EXPENSE',
    description: '',
    amount: '',
    currency: 'HTG',
    branchId: '',
    departmentId: '',
    employeeId: '',
    category: '',
    debit_account: '',
    credit_account: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    try {
      const parsed = txSchema.parse({
        ...formData,
        amount: parseFloat(formData.amount) || 0,
      });
      
      if (['INCOME', 'ADVANCE'].includes(parsed.type) && !parsed.employeeId) {
        setErrors({ employeeId: "Employé requis pour ce type de transaction" });
        return;
      }
      
      let targetDeptId = parsed.departmentId || undefined;
      if (parsed.employeeId) {
        const selectedEmp = employees.find(e => e.id === parsed.employeeId);
        if (selectedEmp) {
          const empDept = selectedEmp.departmentId || (selectedEmp as any).department_id;
          if (empDept) targetDeptId = empDept;
        }
      }

      setLoading(true);
      await onSave({
        ...parsed,
        departmentId: targetDeptId,
        department_id: targetDeptId,
        amount: parsed.amount,
        amount_cents: Math.round(parsed.amount * 100),
        business_id: current_business_id,
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

  const filteredDepts = departments.filter(d => !formData.branchId || true); // Modify if depts are branch specific
  const filteredEmployees = employees.filter(e => 
    (!formData.branchId || e.branchId === formData.branchId) &&
    (!formData.departmentId || e.departmentId === formData.departmentId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex flex-col">
            <h3 className="font-black text-slate-100 uppercase tracking-[0.2em] text-xs flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20 text-cyan-500">
                <Save className="w-5 h-5" />
              </div>
              Nouvelle Transaction
            </h3>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2 ml-10">Inscription au Grand Livre</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-all active:scale-95 border border-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto space-y-4 font-sans text-sm text-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Type</label>
              <select 
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-cyan-500 outline-none"
              >
                <option value="INCOME">Revenu (INCOME)</option>
                <option value="EXPENSE">Dépense (EXPENSE)</option>
                <option value="ADVANCE">Avance (ADVANCE)</option>
                <option value="TRANSFER">Transfert (TRANSFER)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Categorie</label>
              <input 
                type="text" 
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-xs focus:border-cyan-500 outline-none"
                placeholder="Ex: ACHAT, COMMISSION..."
              />
              {errors.category && <span className="text-xs text-rose-400">{errors.category}</span>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">Description</label>
            <input 
              type="text" 
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-cyan-500 outline-none"
            />
            {errors.description && <span className="text-xs text-rose-400">{errors.description}</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Montant</label>
              <input 
                type="number" 
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono focus:border-cyan-500 outline-none"
              />
              {errors.amount && <span className="text-xs text-rose-400">{errors.amount}</span>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Devise</label>
              <select 
                value={formData.currency}
                onChange={e => setFormData({ ...formData, currency: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-cyan-500 outline-none"
              >
                <option value="HTG">HTG</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Compte Débité (Destination)</label>
              <select 
                value={formData.debit_account}
                onChange={e => setFormData({ ...formData, debit_account: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-[10px] focus:border-cyan-500 outline-none uppercase"
              >
                <option value="">Sélectionner</option>
                {accountOptions.map(acc => <option key={acc.id} value={acc.id}>{acc.label}</option>)}
              </select>
              {errors.debit_account && <span className="text-[10px] font-bold text-rose-400">{errors.debit_account}</span>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Compte Crédité (Source)</label>
              <select 
                value={formData.credit_account}
                onChange={e => setFormData({ ...formData, credit_account: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-[10px] focus:border-cyan-500 outline-none uppercase"
              >
                <option value="">Sélectionner</option>
                {accountOptions.map(acc => <option key={acc.id} value={acc.id}>{acc.label}</option>)}
              </select>
              {errors.credit_account && <span className="text-[10px] font-bold text-rose-400">{errors.credit_account}</span>}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-400">Succursale</label>
            <select 
              value={formData.branchId}
              onChange={e => setFormData({ ...formData, branchId: e.target.value, departmentId: '', employeeId: '' })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-cyan-500 outline-none"
            >
              <option value="">Sélectionner</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {errors.branchId && <span className="text-xs text-rose-400">{errors.branchId}</span>}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Département (Performance)</label>
              <select 
                value={formData.departmentId}
                onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 border-cyan-500/30 focus:border-cyan-500 outline-none"
              >
                <option value="">Tous</option>
                {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Employé (Paie & Commission)</label>
              <select 
                value={formData.employeeId}
                onChange={e => {
                  const empId = e.target.value;
                  const emp = employees.find(x => x.id === empId);
                  if (emp) {
                    setFormData({ 
                      ...formData, 
                      employeeId: empId,
                      branchId: emp.branchId || formData.branchId,
                      departmentId: formData.departmentId || emp.departmentId || ""
                    });
                  } else {
                    setFormData({ ...formData, employeeId: empId });
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 border-emerald-500/30 focus:border-cyan-500 outline-none"
              >
                <option value="">Aucun</option>
                {employees.map(e => {
                  const dept = departments.find(d => d.id === e.departmentId)?.name || 'Sans Département';
                  const br = branches.find(b => b.id === e.branchId)?.name || 'Sans Succursale';
                  return (
                    <option key={e.id} value={e.id}>
                      {e.name} ({dept} / {br})
                    </option>
                  );
                })}
              </select>
              {errors.employeeId && <span className="text-xs text-rose-400">{errors.employeeId}</span>}
              {formData.employeeId && (
                <span className="text-[9.5px] text-emerald-400 font-medium block mt-1">
                  🛡️ Liaison active pour calcul de paie et commissions
                </span>
              )}
            </div>
          </div>

          {formData.employeeId && formData.departmentId && (() => {
            const emp = employees.find(x => x.id === formData.employeeId);
            const isCrossDept = emp && emp.departmentId !== formData.departmentId;
            if (isCrossDept) {
              const empDeptName = departments.find(d => d.id === emp.departmentId)?.name || "Son Département fixe";
              const targetDeptName = departments.find(d => d.id === formData.departmentId)?.name || "Département choisi";
              return (
                <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-lg text-[11px] text-cyan-300 animate-fadeIn space-y-1">
                  <p className="font-bold">✨ Intervention Inter-Département Détectée</p>
                  <p className="font-light leading-relaxed">
                    L'employé appartient à <strong>{empDeptName}</strong>, mais exécute ce service pour <strong>{targetDeptName}</strong>. 
                    Le chiffre d'affaires sera comptabilisé pour la paie de l'employé, mais la performance analytique sera attribuée à <strong>{targetDeptName}</strong>.
                  </p>
                </div>
              );
            }
            return null;
          })()}

        </form>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold rounded text-slate-400 hover:text-slate-200 transition">
            Annuler
          </button>
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 px-4 py-2 text-xs font-bold rounded transition disabled:opacity-50"
          >
            {loading ? 'Création...' : <><Save className="w-4 h-4" /> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}
