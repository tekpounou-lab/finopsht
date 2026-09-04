import React from "react";
import { createPortal } from "react-dom";
import { Employee } from "../../types";
import { X, UserSquare2, ShieldCheck, Banknote, Briefcase, MapPin, Hash, CheckCircle2, QrCode } from "lucide-react";
import EmployeeLedgerViewer from "./EmployeeLedgerViewer";
import { CommissionEngine } from "../../services/CommissionEngine";

export interface EmployeeProfileDialogProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  payrollRecords?: any[];
  ledgerTransactions?: any[];
}

export default function EmployeeProfileDialog({ employee, isOpen, onClose, businessName, payrollRecords, ledgerTransactions }: EmployeeProfileDialogProps) {
  if (!isOpen || !employee) return null;

  const getRoleColor = (role: string) => {
    switch(role) {
      case "OWNER": return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      case "MANAGER": return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
      case "SUPERVISOR": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      default: return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    }
  };

  const qrValue = JSON.stringify({
    id: employee.id,
    b: employee.business_id,
    v: "1.0",
    hash: btoa(`emp_${employee.id}_${Date.now()}`).substring(0, 16)
  });

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn" id="employee-profile-dialog">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl shadow-cyan-900/10 flex flex-col max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        
        {/* Header Profile */}
        <div className="relative border-b border-slate-800 p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-6 justify-between bg-slate-950/50">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent pointer-events-none" />
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 z-50">
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex flex-col sm:flex-row items-center gap-5 z-10 w-full sm:w-auto">
             <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 shadow-xl overflow-hidden">
                <UserSquare2 className="w-10 h-10 text-slate-600" />
             </div>
             <div className="flex flex-col text-center sm:text-left">
                <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">{employee.name}</h2>
                <div className="text-xs font-mono text-slate-400 mb-3">{employee.email}</div>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                  <span className={`px-2.5 py-1 rounded-lg font-black text-[9px] uppercase border tracking-widest ${getRoleColor(employee.role)}`}>
                    {employee.role}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg font-black text-[9px] uppercase border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 flex items-center gap-1.5 tracking-widest">
                    <CheckCircle2 className="w-3 h-3" /> Actif
                  </span>
                </div>
             </div>
          </div>
          
          <div className="z-10 flex flex-col items-center gap-2 p-3 bg-white rounded-2xl shadow-xl border-4 border-slate-900 group transition-transform hover:scale-105">
             <div className="w-16 h-16 bg-slate-50 flex items-center justify-center rounded-xl overflow-hidden p-1">
               <QrCode className="w-full h-full text-slate-900" />
             </div>
             <span className="text-[7px] font-mono font-black tracking-[0.2em] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase">Digital ID</span>
          </div>
        </div>

        {/* Content sections */}
        <div className="flex-1 overflow-auto p-6 bg-slate-950 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Identity & Work Context */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              <h3 className="text-[10px] uppercase tracking-widest font-black text-slate-500 border-b border-slate-800 pb-2">Identité & Structure</h3>
              
              <div className="flex items-center justify-between text-xs font-mono">
                 <span className="text-slate-400 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Entreprise</span>
                 <span className="text-slate-200 font-bold">{businessName}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                 <span className="text-slate-400 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Succursale</span>
                 <span className="text-cyan-400 font-bold">{employee.branchId.replace(employee.business_id + "_", "")}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                 <span className="text-slate-400 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> Département</span>
                 <span className="text-slate-200 font-bold">{employee.departmentId || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-slate-800">
                 <span className="text-slate-400 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Sécurité Modèle</span>
                 <span className="text-slate-200 font-bold px-1.5 bg-slate-800 rounded text-[9px] uppercase">RBAC Strict</span>
              </div>
            </div>

            {/* Payroll & Compensation */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
              <h3 className="text-[10px] uppercase tracking-widest font-black text-slate-500 border-b border-slate-800 pb-2">Compensation & Paie</h3>
              
              <div className="flex items-center justify-between text-xs font-mono">
                 <span className="text-slate-400 flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Régime</span>
                 <span className="text-slate-200 font-bold px-1.5 bg-slate-800 rounded text-[10px] text-cyan-400 uppercase">{employee.paymentModel}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                 <span className="text-slate-400">Salaire Fixe</span>
                 <span className="text-slate-200 font-bold">{(employee.baseSalary || 0).toLocaleString()} <span className="text-[9px]">HTG</span></span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono">
                 <span className="text-slate-400">Taux Commission</span>
                 <span className="text-slate-200 font-bold">{employee.commissionRate !== undefined && employee.commissionRate !== null ? CommissionEngine.formatCommissionRateDisplay(employee.commissionRate) : "Aucune"}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-2 pt-2 border-t border-slate-800">
                 <span className="text-amber-400/80">Avances non-sclées</span>
                 <span className="text-amber-400 font-bold">-0.00 <span className="text-[9px]">HTG</span></span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono mt-0.5">
                 <span className="text-emerald-400/80">Net Estimatif</span>
                 <span className="text-emerald-400 font-black">{(employee.baseSalary || 0).toLocaleString()} <span className="text-[9px]">HTG</span></span>
              </div>
            </div>
            
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col shadow-lg">
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Présence Mensuelle</span>
               <span className="text-2xl font-black font-sans text-slate-100 mt-3 tracking-tighter">100<span className="text-[10px] font-bold text-slate-500 ml-1">%</span></span>
             </div>
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col shadow-lg">
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Heures Travaillées</span>
               <span className="text-2xl font-black font-sans text-slate-100 mt-3 tracking-tighter">160<span className="text-[10px] font-bold text-slate-500 ml-1">h</span></span>
             </div>
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col shadow-lg">
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Revenus Générés</span>
               <span className="text-2xl font-black font-sans text-emerald-500 mt-3 tracking-tighter">0<span className="text-[10px] font-bold text-emerald-900 ml-1">HTG</span></span>
             </div>
             <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col shadow-lg">
               <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">Performance</span>
               <span className="text-2xl font-black font-sans text-purple-500 mt-3 tracking-tighter">N/A</span>
             </div>
          </div>
          
          <EmployeeLedgerViewer employee={employee} payrollRecords={payrollRecords} ledgerTransactions={ledgerTransactions} />
          
        </div>

      </div>
    </div>,
    document.body
  );
}
