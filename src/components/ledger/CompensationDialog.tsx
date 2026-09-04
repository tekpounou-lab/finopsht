import React, { useState } from 'react';
import { X, Activity } from 'lucide-react';
import { z } from 'zod';
import { LedgerTransaction } from '../../types';
import { AccountingEngine } from '../../services/AccountingEngine';

interface CompensationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: LedgerTransaction[];
  current_business_id: string;
  onSave: (tx: Partial<LedgerTransaction>) => Promise<void>;
}

export default function CompensationDialog({ isOpen, onClose, transactions, current_business_id, onSave }: CompensationDialogProps) {
  const [formData, setFormData] = useState({
    compensationType: 'ADJUSTMENT',
    linkedTransactionId: '',
    reason: '',
    amount: '',
    notes: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (!formData.reason || formData.reason.length < 5) {
      setErrors({ reason: "Un motif valide d'au moins 5 caractères est requis" });
      return;
    }
    const amt = parseFloat(formData.amount);
    if (!amt || amt === 0) {
      setErrors({ amount: "Un montant d'ajustement est requis" });
      return;
    }

    setLoading(true);
    try {
      const parentTx = formData.linkedTransactionId ? transactions.find(t => t.id === formData.linkedTransactionId) : null;
      
      const rawTx: Partial<LedgerTransaction> = {
        type: 'COMPENSATION',
        description: `[${formData.compensationType}] ${formData.reason} ${formData.notes ? `- ${formData.notes}` : ''}`,
        amount: Math.abs(amt),
        amount_cents: Math.round(Math.abs(amt) * 100),
        currency: parentTx ? parentTx.currency : 'HTG',
        branchId: parentTx ? parentTx.branchId : 'BR_COMP',
        business_id: current_business_id,
        date: new Date().toISOString(),
        category: formData.compensationType,
        source: 'MANUAL',
        status: 'POSTED',
        isImmutable: true,
        debit_account: amt >= 0 ? "5200" : "1000",
        credit_account: amt >= 0 ? "1000" : "4000"
      };

      const balancedTx = AccountingEngine.applyDoubleEntryRules(rawTx);

      await onSave(balancedTx);
      onClose();
    } catch (err) {
      alert("Erreur lors de la compensation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-amber-500/10">
          <h3 className="font-bold text-amber-500 uppercase tracking-wider text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" /> Entrée de Compensation
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 bg-amber-500/5 text-amber-400 text-xs px-5 border-b border-amber-500/10 font-mono">
          ATTENTION: Les entrées de compensation sont immuables et génèrent des logs d'audit.
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 flex-1 overflow-y-auto font-sans text-sm text-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Type de Compensation</label>
              <select 
                value={formData.compensationType}
                onChange={e => setFormData({ ...formData, compensationType: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-amber-500 outline-none"
              >
                <option value="ADJUSTMENT">Ajustement (ADJUSTMENT)</option>
                <option value="ROLLBACK">Rollback Global (ROLLBACK)</option>
                <option value="PAYROLL_FIX">Correction Paie (PAYROLL_FIX)</option>
                <option value="LEDGER_CORRECTION">Correction Registre (LEDGER_CORRECTION)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400">Transaction Liée (Optionnel)</label>
              <select 
                value={formData.linkedTransactionId}
                onChange={e => setFormData({ ...formData, linkedTransactionId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-amber-500 outline-none font-mono text-xs"
              >
                <option value="">Aucune</option>
                {transactions.slice(0, 50).map(tx => (
                  <option key={tx.id} value={tx.id}>{tx.id.substring(0,8)} - {tx.description} - {tx.amount.toLocaleString()} {tx.currency}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-400">Motif Administratif</label>
              <input 
                type="text" 
                value={formData.reason}
                onChange={e => setFormData({ ...formData, reason: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-amber-500 outline-none"
                placeholder="Ex: Erreur de saisie 25/05, Trop perçu..."
              />
              {errors.reason && <span className="text-xs text-rose-400">{errors.reason}</span>}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-400">Montant (Cents ou Devise) avec Signe</label>
              <input 
                type="number" 
                step="0.01"
                value={formData.amount}
                onChange={e => setFormData({ ...formData, amount: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono focus:border-amber-500 outline-none text-base"
                placeholder="+500 ou -250"
              />
              {errors.amount && <span className="text-xs text-rose-400">{errors.amount}</span>}
            </div>
            
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-400">Notes Internes</label>
              <textarea 
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 focus:border-amber-500 outline-none resize-none text-xs"
              />
            </div>
          </div>
        </form>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold rounded text-slate-400 hover:text-slate-200 transition">
            Annuler
          </button>
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 text-xs font-bold rounded transition disabled:opacity-50"
          >
            {loading ? 'Application...' : <><Activity className="w-4 h-4" /> Appliquer Compensation</>}
          </button>
        </div>
      </div>
    </div>
  );
}
