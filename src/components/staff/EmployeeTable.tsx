import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Employee, Role, Branch, Department } from '../../types';
import { motion } from "motion/react";
import { 
  MoreHorizontal, 
  FileText, 
  Download, 
  UserX, 
  Shield, 
  Clock, 
  MapPin, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  QrCode,
  ShieldAlert,
  UserCheck,
  Edit3,
  Trash2,
  User
} from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LineChart, Line, YAxis } from 'recharts';
import { SafeChartContainer } from '../ui/SafeChartContainer';
import { useI18n } from '../../i18n';
import { PermissionService } from '../../services/PermissionService';
import { ReferenceResolver } from '../../services/ReferenceResolver';
import { CommissionEngine } from '../../services/CommissionEngine';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export type SortField = 'name' | 'salary' | 'commission' | 'score' | 'revenue' | 'hireDate' | 'lastActivity';
export type SortDirection = 'asc' | 'desc';

interface EmployeeTableProps {
  employees: Employee[];
  branches: Branch[];
  departments: Department[];
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  onAction: (action: string, employee: Employee) => void;
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  isLoading?: boolean;
  currentRole?: Role;
}

const tableDict = {
  fr: {
    loading: "Chargement des données...",
    noEmployees: "Aucun employé trouvé",
    noEmployeesDesc: "Modifiez vos filtres ou effectuez une autre recherche pour trouver le personnel correspondant.",
    colEmployee: "Employé",
    colContact: "Contact",
    colRole: "Rôle & Poste",
    colLocation: "Localisation",
    colRegime: "Régime & Paie",
    colAttendance: "Assiduité",
    colStatus: "Statut",
    colActivity: "Activité",
    colActions: "Actions",
    defaultPosition: "EMPLOYÉ",
    statusPending: "En attente",
    statusActive: "Actif",
    statusSuspended: "Suspendu",
    statusOnLeave: "En congé",
    statusRevoked: "Révoqué",
    activityAgo: "Il y a 2h",
    badgeOk: "Badge OK",
    exportPayslip: "Exporter le Bulletin de Paie",
    openProfile: "Ouvrir Profil",
    editEmployee: "Modifier l'employé",
    suspendAction: "Suspendre l'employé",
    reactivateAction: "Réactiver l'employé",
    deleteAction: "Supprimer / Archiver",
    estimatePayroll: "Estimer Paie",
    revokeEmployee: "Révoquer Employé",
    revokeBtn: "Révoquer",
    statusProgress: "En Cours",
    revokeTitle: "Révocation d'employé",
    cancel: "Annuler",
    confirmRevocation: "Confirmer la Révocation"
  },
  ht: {
    loading: "Ap chaje done yo...",
    noEmployees: "Pa gen okenn anplwaye yo jwenn",
    noEmployeesDesc: "Chanje filtè ou yo oswa fè yon lòt rechèch pou jwenn anplwaye ki koresponn lan.",
    colEmployee: "Anplwaye",
    colContact: "Kontak",
    colRole: "Ròl ak Pòs",
    colLocation: "Kote yo ye",
    colRegime: "Peman ak Kontra",
    colAttendance: "Prezans yo",
    colStatus: "Sitiyasyon",
    colActivity: "Dènye Aksyon",
    colActions: "Aksyon",
    defaultPosition: "ANPLWAYE",
    statusPending: "Ap tann",
    statusActive: "Aktif",
    statusSuspended: "Sispann",
    statusOnLeave: "Nan konje",
    statusRevoked: "Revoke",
    activityAgo: "Sa gen 2è",
    badgeOk: "Badj OK",
    exportPayslip: "Ekspòte Fich Peman",
    openProfile: "Louvri Profil",
    editEmployee: "Modifye anplwaye a",
    suspendAction: "Sispann anplwaye a",
    reactivateAction: "Reaktive anplwaye a",
    deleteAction: "Efase / Achive",
    estimatePayroll: "Evalye Peman",
    revokeEmployee: "Revoke Anplwaye",
    revokeBtn: "Revoke",
    statusProgress: "Ap Fèt",
    revokeTitle: "Revoke Anplwaye sa a",
    cancel: "Anile",
    confirmRevocation: "Konfime Revokasyon"
  },
  en: {
    loading: "Loading data...",
    noEmployees: "No employee found",
    noEmployeesDesc: "Change your filters or perform another search to find corresponding staff.",
    colEmployee: "Employee",
    colContact: "Contact",
    colRole: "Role & Position",
    colLocation: "Location",
    colRegime: "Regime & Payroll",
    colAttendance: "Attendance",
    colStatus: "Status",
    colActivity: "Activity",
    colActions: "Actions",
    defaultPosition: "EMPLOYEE",
    statusPending: "Pending",
    statusActive: "Active",
    statusSuspended: "Suspended",
    statusOnLeave: "On Leave",
    statusRevoked: "Revoked",
    activityAgo: "2h ago",
    badgeOk: "Badge OK",
    exportPayslip: "Export Payslip Bulletin",
    openProfile: "Open Profile",
    editEmployee: "Edit Employee",
    suspendAction: "Suspend Employee",
    reactivateAction: "Reactivate Employee",
    deleteAction: "Delete / Archive",
    estimatePayroll: "Estimate Payroll",
    revokeEmployee: "Revoke Employee",
    revokeBtn: "Revoke",
    statusProgress: "In Progress",
    revokeTitle: "Employee Revocation",
    cancel: "Cancel",
    confirmRevocation: "Confirm Revocation"
  }
};

const EmployeeTable: React.FC<EmployeeTableProps> = ({
  employees,
  branches,
  departments,
  sortField,
  sortDirection,
  onSort,
  onAction,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  isLoading,
  currentRole
}) => {
  const { language } = useI18n();
  const d = tableDict[(language === "ht" || language === "en") ? language : "fr"];

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [revocationEmp, setRevocationEmp] = useState<Employee | null>(null);

  const getBranchName = (id: string | undefined) => {
    if (!id) return "Succursale Centrale";
    const branch = ReferenceResolver.resolveBranch(branches, id);
    return branch ? branch.name : id;
  };

  const getDeptName = (id: string | undefined) => {
    if (!id) return "Non assigné";
    const dept = ReferenceResolver.resolveDepartment(departments, id);
    return dept ? dept.name : id;
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <span className="opacity-0 group-hover:opacity-30 transition-opacity">↕</span>;
    return <span className="text-cyan-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  if (isLoading) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-slate-500 font-mono text-sm gap-3">
        <div className="w-6 h-6 border-b-2 border-cyan-500 rounded-full animate-spin"></div>
        {d.loading}
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="w-full py-16 flex flex-col items-center justify-center text-slate-500 text-sm gap-4 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
        <UserX className="w-12 h-12 text-slate-600 mb-2" />
        <h3 className="text-lg font-bold text-slate-300">{d.noEmployees}</h3>
        <p className="text-xs font-mono text-slate-500 w-2/3 text-center">{d.noEmployeesDesc}</p>
      </div>
    );
  }

  return (
    <>
    <div className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 shadow-2xl relative hidden md:block min-h-[400px]">
      <table className="w-full text-left font-sans text-xs whitespace-nowrap min-w-max">
        <thead className="bg-slate-900/60 sticky top-0 z-10 backdrop-blur-md border-b border-slate-800">
          <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-extrabold child:py-2.5 child:px-3 child-hover:text-slate-200 transition-colors">
            {currentRole !== "EMPLOYEE" && (
              <th className="w-8 pl-4 pr-1 text-center">
                <input 
                  type="checkbox" 
                  className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 focus:ring-cyan-500 accent-cyan-500"
                  checked={employees.length > 0 && selectedIds.length === employees.length}
                  onChange={onToggleSelectAll}
                />
              </th>
            )}
            <th className="cursor-pointer group" onClick={() => onSort('name')}>
              <div className="flex items-center gap-1.5">{d.colEmployee} {renderSortIcon('name')}</div>
            </th>
            <th>{d.colContact}</th>
            <th>{d.colRole}</th>
            <th>{d.colLocation}</th>
            <th>{d.colRegime}</th>
            <th className="cursor-pointer group text-center" onClick={() => onSort('score')}>
              <div className="flex items-center justify-center gap-1.5">{d.colAttendance} {renderSortIcon('score')}</div>
            </th>
            <th className="text-center">{d.colStatus}</th>
            <th className="cursor-pointer group text-right" onClick={() => onSort('lastActivity')}>
              <div className="flex items-center justify-end gap-1.5">{d.colActivity} {renderSortIcon('lastActivity')}</div>
            </th>
            {currentRole !== "EMPLOYEE" && (
              <th className="text-center sticky right-0 bg-slate-900/90 shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.5)] z-20">{d.colActions}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {employees.map((emp, index) => {
            // Deterministic pseudo-random seed based on employee ID
            let seed = 0;
            for (let i = 0; i < emp.id.length; i++) {
              seed += emp.id.charCodeAt(i);
            }
            
            const random = () => {
              const x = Math.sin(seed++) * 10000;
              return x - Math.floor(x);
            };

            // Mock data for attendance sparkline
            const mockSparklineData = Array.from({ length: 7 }).map(() => ({
              value: Math.floor(random() * 40) + 60
            }));

            const empDisplayName = (emp.name || (emp as any).displayName || (emp as any).display_name || (emp as any).employee_name || (emp.role === 'OWNER' ? 'Propriétaire' : 'Collaborateur')).trim();
            const empInitials = empDisplayName.substring(0, 2).toUpperCase() || "EP";

            return (
            <motion.tr 
              layout
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              key={emp.id}
              className={cn(
                "hover:bg-slate-900/60 transition-colors group",
                emp.isActive === false && "opacity-60 bg-slate-900/10",
                selectedIds.includes(emp.id) && "bg-cyan-900/20",
                openDropdownId === emp.id && "z-40 relative"
              )}
            >
              {currentRole !== "EMPLOYEE" && (
                <td className="py-2 pl-4 pr-1 text-center">
                  <input 
                    type="checkbox" 
                    className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 focus:ring-cyan-500 accent-cyan-500 cursor-pointer"
                    checked={selectedIds.includes(emp.id)}
                    onChange={() => onToggleSelect(emp.id)}
                  />
                </td>
              )}
              <td 
                className="py-2 px-3 cursor-pointer group/name"
                onClick={() => onAction('profile', emp)}
                title={d.openProfile}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-md bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center font-bold text-cyan-400 border border-slate-700/50 shrink-0 uppercase shadow-inner group-hover/name:border-cyan-500/50 transition-colors">
                    {empInitials}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-200 group-hover/name:text-cyan-400 transition-colors">{empDisplayName}</span>
                    <span className="text-[9px] font-mono text-slate-500">ID: {emp.id.split('-')[0]}</span>
                  </div>
                </div>
              </td>
              <td className="py-2 px-3">
                <div className="flex flex-col">
                  <span className="text-slate-300 font-mono text-[10px]">{emp.email}</span>
                  <span className="text-slate-500 font-mono text-[9px]">{emp.phone || 'N/A'}</span>
                </div>
              </td>
              <td className="py-2 px-3 flex flex-col gap-0.5">
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded w-max border",
                  emp.role === 'OWNER' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                  emp.role === 'MANAGER' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30' :
                  emp.role === 'SUPERVISOR' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                  'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                )}>
                  {emp.role}
                </span>
                <span className="text-slate-400 text-[10px] uppercase tracking-wide mt-0.5">{emp.position || d.defaultPosition}</span>
              </td>
              <td className="py-2 px-3">
                <div className="flex flex-col">
                  <span className="text-slate-300 flex items-center gap-1 font-semibold"><MapPin className="w-3 h-3 text-emerald-400" /> {getBranchName(emp.branchId || (emp as any).branch_id)}</span>
                  <span className="text-slate-500 text-[9px] font-mono">{getDeptName(emp.departmentId || (emp as any).department_id)}</span>
                </div>
              </td>
              <td className="py-2 px-3">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-mono font-bold">
                    {(emp.baseSalary || 0).toLocaleString()} HTG
                  </span>
                  <span className="text-slate-500 text-[9px] uppercase tracking-wide flex justify-between">
                    {emp.paymentModel}
                    {(emp.paymentModel === 'COMMISSION' || emp.paymentModel === 'HYBRID') && (
                      <span className="text-emerald-500">+{CommissionEngine.formatCommissionRateDisplay(CommissionEngine.resolveCommissionRate(emp))}</span>
                    )}
                  </span>
                </div>
              </td>
              <td className="py-2 px-3 text-center">
                <div className="flex flex-col items-center gap-1 w-24 mx-auto">
                  <div className="h-6 w-full">
                    <SafeChartContainer height="100%" minHeight={24}>
                      <LineChart data={mockSparklineData}>
                        <YAxis domain={['dataMin - 10', 'dataMax + 10']} hide />
                        <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </SafeChartContainer>
                  </div>
                  <span className="text-[9px] font-mono text-emerald-400">95% (7j)</span>
                </div>
              </td>
              <td className="py-2 px-3 text-center">
                {emp.status === "SUSPENDED" || emp.isActive === false ? (
                  <span className="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 font-bold text-rose-400 text-[10px] flex items-center gap-1.5 w-max mx-auto uppercase tracking-wide">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> {d.statusSuspended}
                  </span>
                ) : emp.status === "ON_LEAVE" ? (
                  <span className="px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 font-bold text-blue-400 text-[10px] flex items-center gap-1.5 w-max mx-auto uppercase tracking-wide">
                    <Clock className="w-3.5 h-3.5 text-blue-400" /> {d.statusOnLeave}
                  </span>
                ) : emp.onboardingComplete === false ? (
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 font-bold text-amber-400 text-[10px] flex items-center gap-1.5 w-max mx-auto uppercase tracking-wide">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" /> {d.statusPending}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 font-bold text-emerald-400 text-[10px] flex items-center gap-1.5 w-max mx-auto uppercase tracking-wide">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> {d.statusActive}
                  </span>
                )}
              </td>
              <td className="py-2 px-3 text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-slate-400 text-[9px] font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {d.activityAgo}
                  </span>
                  <div className="flex gap-1 items-center">
                    <Shield className="w-3 h-3 text-cyan-500" />
                    <span className="text-[8px] text-cyan-600 font-bold uppercase">{d.badgeOk}</span>
                  </div>
                </div>
              </td>
              {currentRole !== "EMPLOYEE" && (
                <td className={cn(
                  "py-2 px-3 text-right sticky right-0 bg-slate-950/80 backdrop-blur-md shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.3)] transition-colors overflow-visible",
                  openDropdownId === emp.id ? "z-40" : "z-10"
                )}>
                  <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onAction('profile', emp)}
                      className="p-1 rounded bg-slate-800/30 border border-slate-700/50 text-slate-400 hover:bg-cyan-900/30 hover:border-cyan-500/30 hover:text-cyan-400 transition-colors"
                      title={d.openProfile}
                    >
                       <User className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => onAction('payroll', emp)}
                      className="p-1 rounded bg-slate-800/30 border border-slate-700/50 text-slate-400 hover:bg-emerald-900/30 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors"
                      title={d.estimatePayroll}
                    >
                       <FileText className="w-3.5 h-3.5" />
                    </button>
                    <div className="relative inline-block text-left">
                      <button
                        onClick={() => openDropdownId === emp.id ? setOpenDropdownId(null) : setOpenDropdownId(emp.id)}
                        className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openDropdownId === emp.id && (
                        <div className="absolute right-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl z-[100] flex flex-col p-1.5 animate-in fade-in zoom-in-95 font-sans group-last:top-auto group-last:bottom-full group-last:mb-1">
                          {/* 1. View Profile */}
                          <button
                            onClick={() => { onAction('profile', emp); setOpenDropdownId(null); }}
                            className="px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                          >
                             <User className="w-3.5 h-3.5 text-cyan-400" /> {d.openProfile}
                          </button>

                          {/* 2. Edit Employee */}
                          <button
                            onClick={() => { onAction('edit', emp); setOpenDropdownId(null); }}
                            className="px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-cyan-400 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                          >
                             <Edit3 className="w-3.5 h-3.5 text-slate-400" /> {d.editEmployee}
                          </button>

                          <div className="h-px bg-slate-800 my-1" />

                          {/* 3. Suspend / Reactivate */}
                          {(PermissionService.can("employees.suspend") || currentRole === 'OWNER' || currentRole === 'MANAGER') && (
                            emp.status === "SUSPENDED" || emp.isActive === false ? (
                              <button
                                onClick={() => { onAction('reactivate', emp); setOpenDropdownId(null); }}
                                className="px-3 py-2 text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                              >
                                 <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> {d.reactivateAction}
                              </button>
                            ) : (
                              <button
                                onClick={() => { onAction('suspend', emp); setOpenDropdownId(null); }}
                                className="px-3 py-2 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                              >
                                 <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> {d.suspendAction}
                              </button>
                            )
                          )}

                          <div className="h-px bg-slate-800 my-1" />

                          {/* Additional Utilities */}
                          <button
                            onClick={() => { onAction('assign_branch', emp); setOpenDropdownId(null); }}
                            className="px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                          >
                             <MapPin className="w-3.5 h-3.5" /> Assign Branch
                          </button>
                          <button
                            onClick={() => { onAction('badge', emp); setOpenDropdownId(null); }}
                            className="px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                          >
                             <QrCode className="w-3.5 h-3.5" /> QR Badge & ID
                          </button>

                          <div className="h-px bg-slate-800 my-1" />

                          {/* 4. Delete / Archive */}
                          <button
                            onClick={() => { setRevocationEmp(emp); setOpenDropdownId(null); }}
                            className="px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-rose-400 transition uppercase font-bold text-[10px] text-left flex items-center gap-2 rounded-lg"
                          >
                             <Trash2 className="w-3.5 h-3.5 text-slate-500" /> {d.deleteAction}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
              )}
            </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* MOBILE CARDS */}
    <div className="flex flex-col gap-3 md:hidden mt-2">
      {employees.map((emp) => (
        <motion.div 
          layout
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          key={emp.id} 
          className={cn("bg-slate-900 border rounded-xl shadow-sm group/card", selectedIds.includes(emp.id) ? "border-cyan-500/50 bg-cyan-900/10" : "border-slate-800")}
        >
          <div className="p-3 flex items-start justify-between border-b border-slate-800/60 overflow-hidden rounded-t-xl">
            <div className="flex items-center gap-3">
              {currentRole !== "EMPLOYEE" && (
                <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-slate-600 bg-slate-900 focus:ring-cyan-500 accent-cyan-500 cursor-pointer shrink-0"
                    checked={selectedIds.includes(emp.id)}
                    onChange={() => onToggleSelect(emp.id)}
                />
              )}
              {(() => {
                const empMobileName = (emp.name || (emp as any).displayName || (emp as any).display_name || (emp as any).employee_name || (emp.role === 'OWNER' ? 'Propriétaire' : 'Collaborateur')).trim();
                const empMobileInitials = empMobileName.substring(0, 2).toUpperCase() || "EP";
                return (
                  <>
                    <div className="w-9 h-9 rounded-md bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center font-bold text-cyan-400 border border-slate-700/50 shrink-0 uppercase shadow-inner text-sm">
                      {empMobileInitials}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-200 text-sm">{empMobileName}</span>
                      <span className={cn(
                          "font-mono font-bold text-[8px] w-max px-1 rounded uppercase tracking-wider mt-0.5",
                          emp.role === 'OWNER' ? 'bg-amber-500/10 text-amber-500' :
                          emp.role === 'MANAGER' ? 'bg-fuchsia-500/10 text-fuchsia-400' :
                          emp.role === 'SUPERVISOR' ? 'bg-indigo-500/10 text-indigo-400' :
                          'bg-slate-800/50 text-slate-400'
                        )}>
                          {emp.role}
                        </span>
                    </div>
                  </>
                );
              })()}
            </div>
                   {/* Context menu */}
             <div className="flex items-center gap-1 relative z-10">
                  {currentRole === 'EMPLOYEE' ? (
                    <button 
                      onClick={() => onAction('profile', emp)}
                      className="p-2 px-3 rounded-md bg-slate-800 text-xs font-bold text-slate-200 hover:bg-cyan-900/30 border border-slate-700 transition"
                    >
                       {d.openProfile}
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => onAction('export_pdf', emp)}
                        className="p-2 rounded-md bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 transition-colors shadow-sm"
                        title={d.exportPayslip}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => openDropdownId === emp.id ? setOpenDropdownId(null) : setOpenDropdownId(emp.id)}
                          className="p-2 rounded-md hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition"
                        >
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {openDropdownId === emp.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-[100] flex flex-col p-1.5 font-sans group-last/card:top-auto group-last/card:bottom-full group-last/card:mb-1">
                            <button onClick={() => { onAction('profile', emp); setOpenDropdownId(null); }} className="px-3 py-2.5 text-slate-200 hover:bg-slate-700 transition uppercase font-bold text-xs text-left flex items-center gap-2 rounded-lg">
                               <User className="w-4 h-4 text-cyan-400" /> {d.openProfile}
                            </button>
                            <button onClick={() => { onAction('edit', emp); setOpenDropdownId(null); }} className="px-3 py-2.5 text-slate-200 hover:bg-slate-700 transition uppercase font-bold text-xs text-left flex items-center gap-2 rounded-lg">
                               <Edit3 className="w-4 h-4 text-slate-400" /> {d.editEmployee}
                            </button>
                            
                            <div className="h-px bg-slate-700/60 my-1" />

                            {(PermissionService.can("employees.suspend") || currentRole === 'OWNER' || currentRole === 'MANAGER') && (
                              emp.status === "SUSPENDED" || emp.isActive === false ? (
                                <button onClick={() => { onAction('reactivate', emp); setOpenDropdownId(null); }} className="px-3 py-2.5 text-emerald-400 hover:bg-slate-700 transition uppercase font-bold text-xs text-left flex items-center gap-2 rounded-lg">
                                   <UserCheck className="w-4 h-4 text-emerald-400" /> {d.reactivateAction}
                                </button>
                              ) : (
                                <button onClick={() => { onAction('suspend', emp); setOpenDropdownId(null); }} className="px-3 py-2.5 text-rose-400 hover:bg-slate-700 transition uppercase font-bold text-xs text-left flex items-center gap-2 rounded-lg">
                                   <ShieldAlert className="w-4 h-4 text-rose-400" /> {d.suspendAction}
                                </button>
                              )
                            )}

                            <div className="h-px bg-slate-700/60 my-1" />

                            <button onClick={() => { setRevocationEmp(emp); setOpenDropdownId(null); }} className="px-3 py-2.5 text-slate-400 hover:bg-slate-700 transition uppercase font-bold text-xs text-left flex items-center gap-2 rounded-lg">
                               <Trash2 className="w-4 h-4 text-slate-500" /> {d.deleteAction}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
          </div>
          <div className="p-3 grid grid-cols-2 gap-3 text-xs bg-slate-900/40 rounded-b-xl">
            <div className="flex flex-col gap-1">
               <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">{d.colLocation}</span>
               <span className="text-slate-300 truncate"><MapPin className="w-3 h-3 inline mr-1 text-emerald-500" />{getBranchName(emp.branchId)}</span>
            </div>
            <div className="flex flex-col gap-1">
               <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">{d.colStatus}</span>
               {emp.onboardingComplete === false ? (
                   <span className="text-amber-500 font-semibold"><AlertCircle className="w-3 h-3 inline mr-1" />{d.statusProgress}</span>
                ) : emp.isActive !== false ? (
                   <span className="text-emerald-400 font-semibold"><CheckCircle className="w-3 h-3 inline mr-1" />{d.statusActive}</span>
                ) : (
                   <span className="text-rose-500 font-semibold"><AlertTriangle className="w-3 h-3 inline mr-1" />{d.statusRevoked}</span>
                )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>

    {/* ALERT DIALOG FOR REVOCATION */}
    {revocationEmp && createPortal(
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-5 flex flex-col animate-in zoom-in-95 font-sans">
          <div className="flex items-center gap-3 text-rose-500 mb-2">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-lg font-bold">{d.revokeTitle}</h3>
          </div>
          <div className="text-slate-300 text-sm mt-2 mb-6">
            {language === "ht" ? (
              <p>Èske ou sèten ou vle revoke <strong className="text-slate-100">{revocationEmp.name}</strong> ?<br/><br/>Aksyon sa a ap bloke aksè li imedyatman epi l ap make kòm revoke nan dosye li.</p>
            ) : language === "en" ? (
              <p>Are you sure you want to revoke <strong className="text-slate-100">{revocationEmp.name}</strong>?<br/><br/>This action will immediately block their system access and append a revocation log entry to the staff dossier.</p>
            ) : (
              <p>Êtes-vous sûr de vouloir révoquer <strong className="text-slate-100">{revocationEmp.name}</strong> ?<br/><br/>Cette action bloquera immédiatement son accès au système et ajoutera une note de révocation au dossier du personnel.</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 mt-auto">
            <button
              onClick={() => setRevocationEmp(null)}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            >
              {d.cancel}
            </button>
            <button
              onClick={() => {
                onAction('revoke', revocationEmp);
                setRevocationEmp(null);
              }}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg shadow-rose-900/20"
            >
              {d.confirmRevocation}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default EmployeeTable;
