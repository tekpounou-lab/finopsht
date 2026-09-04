import React, { useMemo } from 'react';
import { Employee } from '../../types';
import { History, Banknote, ShieldAlert, BadgeCheck, FileText, CheckCircle2 } from 'lucide-react';

export default function EmployeeLedgerViewer({ employee, payrollRecords, ledgerTransactions }: any) {
  
  const ledgers = useMemo(() => {
    if (!employee) return [];
    const entries: any[] = [];
    
    payrollRecords?.forEach((rec: any) => {
      if (rec.employeeId !== employee.id) return;

      if (rec.grossSalary > 0) {
        entries.push({ id: `pl_base_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "SALARY", title: "Salaire de Base", amount: rec.grossSalary, operator: "+" });
      }
      if (rec.bonuses_cents > 0) {
        entries.push({ id: `pl_bonus_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "BONUS", title: "Primes", amount: rec.bonuses_cents / 100, operator: "+" });
      }
      if (rec.commissions > 0) {
        entries.push({ id: `pl_comm_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "COMMISSION", title: "Commissions", amount: rec.commissions, operator: "+" });
      }
      if (rec.penalties_cents > 0) {
        entries.push({ id: `pl_pen_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "DEDUCTION", title: "Pénalités / Retards", amount: rec.penalties_cents / 100, operator: "-" });
      }
      if (rec.advancesTreated > 0) {
        entries.push({ id: `pl_adv_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "DEDUCTION", title: "Déduction Avance/Prêt", amount: rec.advancesTreated, operator: "-" });
      }
      if (rec.cnssDeduction > 0) {
        entries.push({ id: `pl_cnss_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "DEDUCTION", title: "Déduction CNSS (Assurance)", amount: rec.cnssDeduction, operator: "-" });
      }
      
      entries.push({ id: `pl_net_${rec.id}`, date: rec.createdAt || new Date().toISOString(), type: "PAYMENT", title: "Validation Paie", amount: rec.netPaid, operator: "0" });
    });

    ledgerTransactions?.forEach((tx: any) => {
        const isMatch = tx.employeeId === employee.id || 
                        tx.employee_id === employee.id || 
                        (tx.metadata && (tx.metadata.employeeId === employee.id || tx.metadata.employee_id === employee.id));
        if (isMatch) {
            const amount = tx.amount_cents ? tx.amount_cents / 100 : (tx.amount || 0);
            const txDate = tx.date || tx.createdAt || new Date().toISOString();
            
            if (tx.type === "ADVANCE" || (tx.type === "EXPENSE" && (tx.category === "Avans" || tx.category === "Avance"))) {
              entries.push({ id: `tx_${tx.id}`, date: txDate, type: "DEDUCTION", title: `Avance sur Salaire (${tx.category || "Avans"})`, amount, operator: "-" });
            } else if (tx.type === "EXPENSE" && tx.status === "POSTED") {
              entries.push({ id: `tx_${tx.id}`, date: txDate, type: "PAYMENT_DISBURSED", title: tx.description || "Paiement Effectué (Décaissement)", amount, operator: "0" });
            } else if ((tx.type === "INCOME" || tx.type === "TRANSFER") && (tx.category === "Payé dèt" || tx.category === "Remboursement" || tx.category === "Debt Repayment")) {
              entries.push({ id: `tx_${tx.id}`, date: txDate, type: "BONUS", title: "Remboursement Avance / Dette", amount, operator: "+" });
            }
        }
    });
    
    return entries.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [employee, payrollRecords, ledgerTransactions]);

  if (!employee) return null;

  return (
    <div className="flex flex-col gap-4 mt-6 border-t border-slate-800 pt-6">
      <h3 className="text-xs uppercase tracking-widest font-black text-slate-400 flex items-center gap-2">
        <History className="w-4 h-4 text-cyan-500" />
        Employee Ledger (Comptabilité Individuelle)
      </h3>
      
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="max-h-64 overflow-y-auto p-4 flex flex-col gap-3">
            {ledgers.length === 0 ? (
                <div className="text-center text-slate-500 text-xs font-mono py-4">
                    Aucun événement financier traçable pour cet employé.
                </div>
            ) : (
                ledgers.map((l) => (
                    <div key={l.id} className="flex justify-between items-center bg-slate-950 p-3 rounded-lg border border-slate-800/60 font-mono text-xs">
                        <div className="flex items-center gap-3">
                           {l.type === "SALARY" && <Banknote className="w-4 h-4 text-emerald-400" />}
                           {l.type === "BONUS" && <BadgeCheck className="w-4 h-4 text-amber-400" />}
                           {l.type === "COMMISSION" && <BadgeCheck className="w-4 h-4 text-amber-500" />}
                           {l.type === "DEDUCTION" && <ShieldAlert className="w-4 h-4 text-rose-400" />}
                           {l.type === "PAYMENT" && <FileText className="w-4 h-4 text-cyan-400" />}
                           {l.type === "PAYMENT_DISBURSED" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                           
                           <div className="flex flex-col">
                             <span className="text-slate-300 font-bold">{l.title}</span>
                             <span className="text-[9px] text-slate-500">{new Date(l.date).toLocaleString()}</span>
                           </div>
                        </div>
                        
                        <div className="text-right">
                           <span className={`font-bold ${l.operator === '+' ? 'text-emerald-400' : l.operator === '-' ? 'text-rose-400' : 'text-slate-400'}`}>
                             {l.operator !== "0" ? l.operator : ""} {l.amount.toLocaleString()} HTG
                           </span>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </div>
  );
}
