import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Employee, Role, Branch, Department } from "../../types";
import { X } from "lucide-react";

interface EditEmployeeDialogProps {
  employee: Employee;
  branches: Branch[];
  departments: Department[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Employee) => void;
}

export default function EditEmployeeDialog({
  employee,
  branches,
  departments,
  isOpen,
  onClose,
  onSave
}: EditEmployeeDialogProps) {
  const initialSalary = employee.baseSalary ?? employee.salaryBaseHtg ?? 0;
  const initialCommission = employee.commissionRate ?? employee.commission_rate ?? 0;
  const initialContractType = employee.contractType || "cdi";
  const initialPayRegime = employee.paymentModel || (employee.payRegime ? (employee.payRegime.toUpperCase() === "FIXE" ? "FIXED" : (employee.payRegime.toUpperCase() as any)) : "FIXED");

  const [name, setName] = useState(employee.name);
  const [email, setEmail] = useState(employee.email);
  const [phone, setPhone] = useState(employee.phone || "");
  const [role, setRole] = useState<Role>(employee.role);
  const [position, setPosition] = useState(employee.position || "");
  const [branchId, setBranchId] = useState(employee.branchId);
  const [departmentId, setDepartmentId] = useState(employee.departmentId);
  
  const [payRegime, setPayRegime] = useState<"FIXED" | "COMMISSION" | "HYBRID">(initialPayRegime);
  const [baseSalary, setBaseSalary] = useState(initialSalary);
  const [commissionRate, setCommissionRate] = useState(initialCommission);
  const [contractType, setContractType] = useState<"cdi" | "cdd" | "freelance">(initialContractType);

  useEffect(() => {
    if (isOpen) {
      const curSalary = employee.baseSalary ?? employee.salaryBaseHtg ?? 0;
      const curCommission = employee.commissionRate ?? employee.commission_rate ?? 0;
      const curContract = employee.contractType || "cdi";
      const curPayRegime = employee.paymentModel || (employee.payRegime ? (employee.payRegime.toUpperCase() === "FIXE" ? "FIXED" : (employee.payRegime.toUpperCase() as any)) : "FIXED");

      setName(employee.name);
      setEmail(employee.email);
      setPhone(employee.phone || "");
      setRole(employee.role);
      setPosition(employee.position || "");
      setBranchId(employee.branchId);
      setDepartmentId(employee.departmentId);
      setPayRegime(curPayRegime);
      setBaseSalary(curSalary);
      setCommissionRate(curCommission);
      setContractType(curContract);
    }
  }, [isOpen, employee]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveSalary = (payRegime === "FIXED" || payRegime === "HYBRID") ? baseSalary : 0;
    const effectiveCommission = (payRegime === "COMMISSION" || payRegime === "HYBRID") ? commissionRate : 0;

    onSave({
      ...employee,
      name,
      email,
      phone,
      role,
      position,
      branchId,
      departmentId,
      paymentModel: payRegime,
      baseSalary: effectiveSalary,
      salaryBaseHtg: effectiveSalary,
      contractType,
      payRegime: payRegime.toLowerCase() as "fixe" | "commission" | "hybrid",
      commissionRate: effectiveCommission,
      commission_rate: effectiveCommission
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col max-h-[92vh]">
        <div className="flex justify-between items-center px-8 py-6 border-b border-slate-800 bg-slate-900/50">
          <div className="flex flex-col">
            <h2 className="text-xs font-black text-slate-100 uppercase tracking-[0.2em]">Modifier le Dossier Employé</h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Édition Master Data SSOT</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-all active:scale-95 border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 max-h-[80vh] overflow-y-auto p-4 gap-6">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm uppercase font-bold text-cyan-400 border-b border-slate-800/80 pb-1">Identité</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Nom Complet</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Email</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Téléphone</label>
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm uppercase font-bold text-cyan-400 border-b border-slate-800/80 pb-1">Organisation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Succursale</label>
                <select required value={branchId} onChange={e => setBranchId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200">
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Département</label>
                <select required value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200">
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Poste</label>
                <input type="text" value={position} onChange={e => setPosition(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Rôle Système</label>
                <select required value={role} onChange={e => setRole(e.target.value as Role)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200">
                  <option value="OWNER">OWNER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="SUPERVISOR">SUPERVISOR</option>
                  <option value="EMPLOYEE">EMPLOYEE</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm uppercase font-bold text-cyan-400 border-b border-slate-800/80 pb-1">Paie et Contrat</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Type de Contrat</label>
                <select value={contractType} onChange={e => setContractType(e.target.value as "cdi" | "cdd" | "freelance")} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200">
                  <option value="cdi">CDI</option>
                  <option value="cdd">CDD</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Régime de Paie</label>
                <select value={payRegime} onChange={e => setPayRegime(e.target.value as "FIXED" | "COMMISSION" | "HYBRID")} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200">
                  <option value="FIXED">Fixe</option>
                  <option value="COMMISSION">Commission Exclusive</option>
                  <option value="HYBRID">Hybride (Fixe + Commission)</option>
                </select>
              </div>

              {(payRegime === "FIXED" || payRegime === "HYBRID") && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-[10px] uppercase font-bold text-emerald-400 mb-1">Salaire de Base (HTG)</label>
                  <input required type="number" value={baseSalary} onChange={e => setBaseSalary(Number(e.target.value))} className="w-full bg-slate-950 border border-emerald-900 rounded p-2 text-xs text-emerald-400" />
                </div>
              )}

              {(payRegime === "COMMISSION" || payRegime === "HYBRID") && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-[10px] uppercase font-bold text-amber-400 mb-1">Commission (%)</label>
                  <input required type="number" step="0.01" min="0" max="100" value={commissionRate} onChange={e => setCommissionRate(Number(e.target.value))} className="w-full bg-slate-950 border border-amber-900 rounded p-2 text-xs text-amber-400" />
                  <p className="text-[9px] text-slate-500 mt-1">Pourcentage appliqué sur les transactions INCOME.</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition">Annuler</button>
            <button type="submit" className="px-4 py-2 rounded bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 transition">Enregistrer les Modifications</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
