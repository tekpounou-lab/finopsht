import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  Employee, 
  AttendanceRecord, 
  EmployeeBadge, 
  EmployeeContract, 
  Department, 
  LeaveRecord, 
  PayrollRecord,
  LedgerTransaction,
  OvertimeRequest,
  AbsenceEvent,
  PayrollInputSnapshot
} from "../../types";
import { AttendanceRepository } from "../../repositories/AttendanceRepository";
import { getDeviceLocalDate, getDeviceLocalTime } from "../../lib/attendanceSSOT";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { 
  Home, 
  User,
  Briefcase,
  DollarSign,
  Calendar, 
  Clock, 
  ShieldCheck, 
  CalendarDays, 
  FileText, 
  Bell, 
  Activity, 
  Users,
  TrendingUp,
  Receipt,
  X
} from "lucide-react";

import { WelcomeBanner } from "./components/WelcomeBanner";
import { MetricsCards } from "./components/MetricsCards";
import { InteractiveQrBadge } from "./components/InteractiveQrBadge";
import { LeaveWorkflowManager } from "./components/LeaveWorkflowManager";
import { LeaveRequestModal } from "./components/LeaveRequestModal";

import { MyProfileSection } from "./components/MyProfileSection";
import { MyEmploymentSection } from "./components/MyEmploymentSection";
import { MyPayrollSection } from "./components/MyPayrollSection";
import { MySalesAndExpensesSection } from "./components/MySalesAndExpensesSection";
import { MyScheduleSection } from "./components/MyScheduleSection";
import { MyAttendanceSection } from "./components/MyAttendanceSection";
import { MyBadgeSection } from "./components/MyBadgeSection";
import { MyDocumentsSection } from "./components/MyDocumentsSection";
import { MyNotificationsSection } from "./components/MyNotificationsSection";
import { MyActivitySection } from "./components/MyActivitySection";
import { SupervisorWorkspaceSection } from "./components/SupervisorWorkspaceSection";

export interface MyWorkspaceProps {
  employee?: Employee;
  badge?: EmployeeBadge;
  contract?: EmployeeContract;
  employees?: Employee[];
  branches?: any[];
  events?: any[];
  forensicLogs?: any[];
  employeeContracts?: EmployeeContract[];
  employeeBadges?: EmployeeBadge[];
  attendanceRecords?: AttendanceRecord[];
  payrollRecords?: PayrollRecord[];
  leaves?: LeaveRecord[];
  shifts?: any[];
  transactions?: LedgerTransaction[];
  overtimeRequests?: OvertimeRequest[];
  absenceEvents?: AbsenceEvent[];
  payrollInputsSnapshots?: PayrollInputSnapshot[];
  departments?: Department[];
  onAddAttendanceSim?: (rec: AttendanceRecord) => void;
  onAddLeaveRequestSim?: (leave: LeaveRecord) => void;
  language?: "fr" | "ht" | "en";
}

const defaultEmployee: Employee = {
  id: "emp_default",
  name: "Collaborateur",
  email: "collaborateur@finops.erp",
  role: "EMPLOYEE",
  position: "Collaborateur",
  departmentId: "dept_gen",
  branchId: "branch_main",
  hireDate: new Date().toISOString().split("T")[0],
  status: "ACTIVE",
  isActive: true,
  baseSalary: 0,
  paymentModel: "FIXED",
  business_id: "BIZ_MAIN",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function MyWorkspace({
  employee,
  badge,
  contract,
  employees = [],
  branches = [],
  events = [],
  forensicLogs = [],
  employeeContracts = [],
  employeeBadges = [],
  attendanceRecords = [],
  payrollRecords = [],
  leaves = [],
  shifts = [],
  transactions = [],
  overtimeRequests = [],
  absenceEvents = [],
  payrollInputsSnapshots = [],
  departments = [],
  onAddAttendanceSim,
  onAddLeaveRequestSim,
  language = "fr",
}: MyWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "profile"
    | "employment"
    | "payroll"
    | "sales"
    | "schedule"
    | "attendance"
    | "badge"
    | "leaves"
    | "documents"
    | "notifications"
    | "activity"
    | "supervisor"
  >("dashboard");

  const [isClockingIn, setIsClockingIn] = useState(false);
  const [isLeaveRequestModalOpen, setIsLeaveRequestModalOpen] = useState(false);
  const [localTransactions, setLocalTransactions] = useState<LedgerTransaction[]>(transactions);

  // Sync prop changes
  React.useEffect(() => {
    setLocalTransactions(transactions);
  }, [transactions]);

  const safeEmployeeList = employees || [];
  const baseEmployee = employee || safeEmployeeList[0] || defaultEmployee;

  // Single Source of Truth Identity Resolution
  const resolvedEmployee: Employee =
    safeEmployeeList.find(
      (e) =>
        (e.id && baseEmployee.id && e.id === baseEmployee.id) ||
        ((e as any).employee_id && (e as any).employee_id === baseEmployee.id) ||
        (e.id && (baseEmployee as any).employee_id && e.id === (baseEmployee as any).employee_id) ||
        (e.firebase_uid && (baseEmployee as any).firebase_uid && e.firebase_uid === (baseEmployee as any).firebase_uid) ||
        (e.email && baseEmployee.email && e.email.toLowerCase().trim() === baseEmployee.email.toLowerCase().trim())
    ) || baseEmployee;

  // Single Source of Truth Badge Resolution
  const activeBadge =
    badge ||
    employeeBadges.find(
      (b) =>
        b.id === resolvedEmployee.badgeId ||
        b.id === baseEmployee.badgeId ||
        b.employeeId === resolvedEmployee.id ||
        (b as any).employee_id === resolvedEmployee.id ||
        b.employeeId === baseEmployee.id ||
        (b as any).employee_id === baseEmployee.id ||
        (resolvedEmployee.email && (b as any).email && (b as any).email.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim())
    );

  // Single Source of Truth Contract Resolution
  const activeContract =
    contract ||
    employeeContracts.find(
      (c) =>
        c.employeeId === resolvedEmployee.id ||
        (c as any).employee_id === resolvedEmployee.id ||
        c.employeeId === baseEmployee.id ||
        (c as any).employee_id === baseEmployee.id ||
        (resolvedEmployee.email && (c as any).email && (c as any).email.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim())
    );

  // Department & Branch Resolvers
  const deptObj = departments.find((d) => d.id === resolvedEmployee.departmentId);
  const deptName = deptObj ? deptObj.name : "Département Général";

  const branchObj = branches.find((b) => b.id === resolvedEmployee.branchId);
  const branchName = branchObj ? branchObj.name : "Succursale Principale";

  const supervisorObj = safeEmployeeList.find((e) => e.id === resolvedEmployee.managerId);
  const supervisorName = supervisorObj ? supervisorObj.name : "Direction RH";

  const isSupervisorOrManager =
    resolvedEmployee.role === "SUPERVISOR" ||
    resolvedEmployee.role === "MANAGER" ||
    resolvedEmployee.role === "OWNER" ||
    resolvedEmployee.role === "SUPER_ADMIN";

  // Filtered Personal Data Sets (Single Source of Truth)
  const myAttendance = (attendanceRecords || []).filter(
    (a) =>
      a.employeeId === resolvedEmployee.id ||
      (a as any).employee_id === resolvedEmployee.id ||
      a.employeeId === baseEmployee.id ||
      (a as any).employee_id === baseEmployee.id ||
      (resolvedEmployee.email && (a as any).employee_email && (a as any).employee_email.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim())
  );

  const myPayroll = (payrollRecords || []).filter(
    (p) =>
      (
        p.employeeId === resolvedEmployee.id ||
        (p as any).employee_id === resolvedEmployee.id ||
        p.employeeId === baseEmployee.id ||
        (p as any).employee_id === baseEmployee.id ||
        (p as any).employeeId === baseEmployee.id ||
        (resolvedEmployee.email && (p as any).employee_email && (p as any).employee_email.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim())
      ) &&
      (
        !p.business_id || 
        !resolvedEmployee.business_id || 
        p.business_id === resolvedEmployee.business_id || 
        p.business_id === (baseEmployee as any).business_id || 
        p.business_id === (resolvedEmployee as any).businessId ||
        p.business_id === (resolvedEmployee as any).business_id
      ) &&
      ["VALIDATED", "APPROVED", "PAID", "LOCKED", "DRAFT", "PENDING", "CORRECTED"].includes(p.status || "")
  );

  const myShifts = (shifts || []).filter(
    (s) =>
      s.employeeId === resolvedEmployee.id ||
      (s as any).employee_id === resolvedEmployee.id ||
      s.employeeId === baseEmployee.id ||
      (s as any).employee_id === baseEmployee.id ||
      (s.employeeIds && (s.employeeIds.includes(resolvedEmployee.id) || s.employeeIds.includes(baseEmployee.id))) ||
      (s.departmentId && s.departmentId === resolvedEmployee.departmentId)
  );

  const myLeaves = (leaves || []).filter(
    (l) =>
      l.employeeId === resolvedEmployee.id ||
      (l as any).employee_id === resolvedEmployee.id ||
      l.employeeId === baseEmployee.id ||
      (l as any).employee_id === baseEmployee.id ||
      (resolvedEmployee.email && (l as any).employee_email && (l as any).employee_email.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim())
  );

  const myTransactions = (localTransactions || []).filter(
    (t) =>
      t.employeeId === resolvedEmployee.id ||
      (t as any).employee_id === resolvedEmployee.id ||
      (t as any).createdBy === resolvedEmployee.id ||
      (t as any).created_by === resolvedEmployee.id ||
      (t as any).createdBy === baseEmployee.id ||
      (t as any).created_by === baseEmployee.id ||
      (resolvedEmployee.email && (t as any).createdBy && (t as any).createdBy.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim()) ||
      (resolvedEmployee.email && (t as any).created_by && (t as any).created_by.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim()) ||
      (resolvedEmployee.email && (t as any).employee_email && (t as any).employee_email.toLowerCase().trim() === resolvedEmployee.email.toLowerCase().trim()) ||
      (t as any).userId === resolvedEmployee.id
  );

  // Dynamic Scorecard & KPI Projections for Current Month
  const currentDate = new Date();
  const currentYearStr = String(currentDate.getFullYear());
  const currentMonthNum = String(currentDate.getMonth() + 1).padStart(2, "0");
  const currentMonthPrefix = `${currentYearStr}-${currentMonthNum}`; // e.g. "2026-07"
  const currentMonthLabel = currentDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).toUpperCase(); // "JUILLET 2026"
  const currentDayLabel = currentDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); // "31 juillet 2026"

  const currentMonthAttendance = myAttendance.filter((a) => a.date && a.date.startsWith(currentMonthPrefix));
  const activeAttendanceSet = currentMonthAttendance.length > 0 ? currentMonthAttendance : myAttendance;

  const totalWorked = activeAttendanceSet.reduce((acc, curr) => acc + (curr.realHours || (curr as any).workedHours || 8), 0);
  const totalDays = activeAttendanceSet.length;
  const totalLates = activeAttendanceSet.filter((a) => a.status === "LATE" || ((a as any).latenessMinutes && (a as any).latenessMinutes > 0)).length;
  const latenessRate = totalDays > 0 ? (totalLates / totalDays) * 100 : 0;
  const attendanceConsistencyScore = totalDays > 0 ? Math.max(0, 100 - latenessRate) : 100;

  const currentMonthTransactions = myTransactions.filter((t) => (t.date && t.date.startsWith(currentMonthPrefix)) || ((t as any).createdAt && String((t as any).createdAt).startsWith(currentMonthPrefix)));
  const activeTransactionsSet = currentMonthTransactions.length > 0 ? currentMonthTransactions : myTransactions;
  const totalCommissions = activeTransactionsSet.reduce((acc, curr) => acc + ((curr as any).commission || (curr.amount ? curr.amount * 0.05 : 0)), 0);

  const computedScorecard = {
    attendanceConsistencyScore,
    latenessScore: latenessRate,
    totalHours: totalWorked,
    commissions: totalCommissions,
    underperformanceSignal: latenessRate > 20,
    currentMonthLabel,
    currentDayLabel,
  };

  // Today's Clock State
  const nowForState = new Date();
  const todayStr = getDeviceLocalDate(nowForState);
  const todayRecord = myAttendance.find((a) => a.date === todayStr);
  const isCheckedIn = !!todayRecord && !!todayRecord.checkIn && !todayRecord.checkOut;

  // Handle Clock In / Clock Out
  const handleClockIn = async () => {
    setIsClockingIn(true);
    try {
      const now = new Date();
      const timeStr = getDeviceLocalTime(now);

      if (!todayRecord) {
        // Create new check-in
        const newRecord: AttendanceRecord = {
          id: `ATT-${resolvedEmployee.id}-${todayStr}`,
          employeeId: resolvedEmployee.id,
          employeeName: resolvedEmployee.name,
          business_id: resolvedEmployee.business_id,
          branchId: resolvedEmployee.branchId || "BRANCH-001",
          departmentId: resolvedEmployee.departmentId,
          date: todayStr,
          checkIn: timeStr,
          checkOut: null,
          plannedHours: 8,
          realHours: 0,
          variance: 0,
          status: "NORMAL",
        };

        await AttendanceRepository.saveRecord(newRecord, { uid: resolvedEmployee.id, name: resolvedEmployee.name, role: resolvedEmployee.role });
        onAddAttendanceSim?.(newRecord);
        toast.success(`Pointage d'entrée enregistré à ${timeStr}`);
      } else if (!todayRecord.checkOut) {
        // Clock out
        const updatedRecord: AttendanceRecord = {
          ...todayRecord,
          checkOut: timeStr,
          realHours: 8,
        };

        await AttendanceRepository.saveRecord(updatedRecord, { uid: resolvedEmployee.id, name: resolvedEmployee.name, role: resolvedEmployee.role });
        onAddAttendanceSim?.(updatedRecord);
        toast.success(`Pointage de sortie enregistré à ${timeStr}`);
      }
    } catch (err: any) {
      console.error("Clock in/out error:", err);
      toast.error("Erreur lors du pointage: " + (err.message || "Accès refusé"));
    } finally {
      setIsClockingIn(false);
    }
  };

  const navItems = [
    { id: "dashboard", label: "Mon Dashboard", icon: Home },
    { id: "profile", label: "Mon Profil", icon: User },
    { id: "employment", label: "Mon Emploi", icon: Briefcase },
    { id: "payroll", label: "Ma Paie", icon: DollarSign },
    { id: "sales", label: "Ventes & Finances", icon: TrendingUp },
    { id: "schedule", label: "Mon Planning", icon: Calendar },
    { id: "attendance", label: "Ma Présence", icon: Clock },
    { id: "badge", label: "Mon Badge QR", icon: ShieldCheck },
    { id: "leaves", label: "Mes Congés", icon: CalendarDays },
    { id: "documents", label: "Mes Documents", icon: FileText },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "activity", label: "Historique", icon: Activity },
    ...(isSupervisorOrManager
      ? [{ id: "supervisor", label: "Espace Superviseur", icon: Users }]
      : []),
  ];

  return (
    <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 space-y-10 font-sans max-w-7xl mx-auto w-full">
      {/* WELCOME BANNER HEADER */}
      <WelcomeBanner
        employee={resolvedEmployee}
        deptName={deptName}
        tw={{
          welcome: "Bonjour",
          bannerSubtitle: "FINOPS ERP - ESPACE EMPLOYE SSOT",
          refRh: "RÉFÉRANCE EMPLOYE",
          affectation: "DEPARTEMENT",
          clockIn: isCheckedIn ? "POINTER SORTIE" : "POINTER ENTREE",
        }}
        onClockIn={handleClockIn}
        isClockingIn={isClockingIn}
        buttonText={isCheckedIn ? "POINTER SORTIE" : "POINTER ENTREE"}
        showClockIn={isSupervisorOrManager}
      />

      {/* SECONDARY NAVIGATION TABS - EMPLOYEE WORKSPACE */}
      <div className="flex items-center gap-2 overflow-x-auto pb-6 scrollbar-none relative z-30" id="employee-workspace-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <motion.button
              key={item.id}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setActiveTab(item.id as any);
              }}
              className={`
                px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 whitespace-nowrap cursor-pointer shrink-0 border
                ${isActive
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-xl shadow-cyan-500/30"
                  : "bg-slate-900/50 text-slate-400 hover:text-slate-100 border-slate-800 hover:border-slate-700 hover:bg-slate-800"}
              `}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-slate-950" : "text-slate-400"}`} />
              {item.label}
            </motion.button>
          );
        })}
      </div>

      {/* TAB CONTENT AREA */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-12"
              id="view-dashboard-tab"
            >
              {/* METRICS SUMMARY */}
              <MetricsCards
                employee={resolvedEmployee}
                contract={activeContract}
                scorecard={computedScorecard}
                tw={{
                  kpiPresenceTitle: "PRÉSENCE",
                }}
              />

              {/* QUICK DASHBOARD GRID */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT: TODAY'S STATUS & QUICK ACTIONS */}
                <div className="lg:col-span-7 space-y-10">
                  <section className="space-y-8">
                    <div className="flex items-center justify-between border-b border-slate-900 pb-4">
                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-[0.15em] flex items-center gap-3">
                        <Clock className="w-5 h-5 text-cyan-400" />
                        Statut Quotidien
                      </h3>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-lg uppercase font-bold">
                        {currentDayLabel}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter font-bold">État de Pointage</span>
                        <div className="flex items-center gap-2 font-mono font-bold text-sm">
                          {isCheckedIn ? (
                            <span className="text-emerald-400 flex items-center gap-1.5 uppercase">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> PRÉSENT
                            </span>
                          ) : (
                            <span className="text-amber-400 flex items-center gap-1.5 uppercase">
                              <span className="w-2 h-2 rounded-full bg-amber-400"></span> SORTI
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter font-bold">Superviseur Direct</span>
                        <div className="text-slate-200 font-bold text-xs truncate uppercase font-mono">
                          {supervisorName}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter font-bold">Affectation</span>
                        <div className="text-slate-200 font-bold text-xs truncate uppercase font-mono">
                          {branchName}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        onClick={() => setActiveTab("sales")}
                        className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold rounded-xl border border-emerald-500/30 transition cursor-pointer flex items-center gap-2"
                      >
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Mes Ventes & Finances
                      </button>
                      <button
                        onClick={() => setActiveTab("leaves")}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold rounded-xl border border-slate-800 transition cursor-pointer flex items-center gap-2"
                      >
                        <CalendarDays className="w-4 h-4 text-cyan-400" /> Demander un Congé
                      </button>
                      <button
                        onClick={() => setActiveTab("payroll")}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono font-bold rounded-xl border border-slate-800 transition cursor-pointer flex items-center gap-2"
                      >
                        <DollarSign className="w-4 h-4 text-emerald-400" /> Bulletins de Paie
                      </button>
                      <button
                        onClick={() => setActiveTab("badge")}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-850 text-indigo-400 text-xs font-mono font-bold rounded-xl border border-slate-800 transition cursor-pointer flex items-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" /> Badge QR
                      </button>
                    </div>
                  </section>

                  {/* UPCOMING SHIFT ALERT */}
                  <div 
                    className="p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 border border-indigo-500/10 flex items-center justify-between gap-6 group hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-all duration-500 cursor-pointer shadow-2xl shadow-indigo-500/5" 
                    onClick={() => setActiveTab("schedule")}
                  >
                    <div className="flex items-center gap-8">
                      <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400 group-hover:scale-110 transition-transform">
                        <Calendar className="w-8 h-8" />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-slate-100 uppercase tracking-tight">Prochain Shift</h4>
                        <p className="text-xs text-slate-500 font-mono font-bold uppercase tracking-widest mt-1">Horaire Planifié</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black text-indigo-400 tracking-tighter">DEMAIN</div>
                      <div className="text-[11px] text-slate-500 font-mono font-bold tracking-widest uppercase">08:00 — 17:00</div>
                    </div>
                  </div>
                </div>

                {/* RIGHT: BADGE PREVIEW */}
                <div className="lg:col-span-5">
                  <div className="sticky top-8">
                    <InteractiveQrBadge
                      employee={resolvedEmployee}
                      badge={activeBadge}
                      tw={{ activateBadge: "ACTIVER BADGE QR", roleText: "RÔLE" }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 md:p-10 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-10 pb-6 border-b border-slate-800/50">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  {(() => {
                    const Icon = navItems.find(n => n.id === activeTab)?.icon || Home;
                    return <Icon className="w-6 h-6 text-cyan-400" />;
                  })()}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                    {navItems.find(n => n.id === activeTab)?.label}
                  </h2>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em] font-bold">
                    Espace Employé • {resolvedEmployee.name}
                  </p>
                </div>
              </div>

              {activeTab === "profile" && (
                <MyProfileSection
                  employee={resolvedEmployee}
                  deptName={deptName}
                  branchName={branchName}
                  supervisorName={supervisorName}
                  tw={{}}
                />
              )}

              {activeTab === "employment" && (
                <MyEmploymentSection
                  employee={resolvedEmployee}
                  contract={activeContract}
                  employeeContracts={employeeContracts}
                  deptName={deptName}
                  branchName={branchName}
                  tw={{}}
                />
              )}

              {activeTab === "payroll" && (
                <MyPayrollSection
                  employee={resolvedEmployee}
                  payrollRecords={myPayroll}
                  deptName={deptName}
                  branchName={branchName}
                  tw={{}}
                />
              )}

              {activeTab === "sales" && (
                <MySalesAndExpensesSection
                  employee={resolvedEmployee}
                  contract={activeContract}
                  transactions={localTransactions}
                  attendanceRecords={myAttendance}
                  payrollRecords={myPayroll}
                  payrollInputsSnapshots={payrollInputsSnapshots}
                  deptName={deptName}
                  branchName={branchName}
                  onAddTransactionSim={(newTx) => {
                    setLocalTransactions((prev) => [newTx, ...prev]);
                  }}
                  tw={{}}
                />
              )}

              {activeTab === "schedule" && (
                <MyScheduleSection
                  employee={resolvedEmployee}
                  shifts={myShifts}
                  branchName={branchName}
                  deptName={deptName}
                  tw={{}}
                />
              )}

              {activeTab === "attendance" && (
                <MyAttendanceSection
                  employee={resolvedEmployee}
                  attendanceRecords={myAttendance}
                  deptName={deptName}
                  branchName={branchName}
                  tw={{}}
                />
              )}

              {activeTab === "badge" && (
                <MyBadgeSection
                  employee={resolvedEmployee}
                  badge={activeBadge}
                  deptName={deptName}
                  branchName={branchName}
                  tw={{ activateBadge: "ACTIVER BADGE QR", roleText: "RÔLE" }}
                  onRequestLeave={() => setIsLeaveRequestModalOpen(true)}
                />
              )}

              {activeTab === "leaves" && (
                <LeaveWorkflowManager
                  employee={resolvedEmployee}
                  leaves={myLeaves}
                  tw={{
                    requestLeave: "Demander un Congé",
                    cancel: "Annuler",
                    submit: "Soumettre la demande",
                  }}
                  onAddLeaveRequestSim={onAddLeaveRequestSim || (() => {})}
                />
              )}

              {activeTab === "documents" && (
                <MyDocumentsSection
                  employee={resolvedEmployee}
                  employeeContracts={employeeContracts}
                  payrollRecords={myPayroll}
                  deptName={deptName}
                  branchName={branchName}
                  tw={{}}
                />
              )}

              {activeTab === "notifications" && (
                <MyNotificationsSection
                  employee={resolvedEmployee}
                  events={events}
                  tw={{}}
                />
              )}

              {activeTab === "activity" && (
                <MyActivitySection
                  employee={resolvedEmployee}
                  forensicLogs={forensicLogs}
                  tw={{}}
                />
              )}

              {activeTab === "supervisor" && isSupervisorOrManager && (
                <SupervisorWorkspaceSection
                  currentSupervisor={resolvedEmployee}
                  employees={employees}
                  leaves={leaves}
                  attendanceRecords={attendanceRecords}
                  shifts={shifts}
                  departments={departments}
                  branches={branches}
                  tw={{}}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isLeaveRequestModalOpen && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 overflow-hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLeaveRequestModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-10"
            >
              <LeaveRequestModal
                isOpen={isLeaveRequestModalOpen}
                employee={resolvedEmployee}
                language={language}
                onClose={() => setIsLeaveRequestModalOpen(false)}
                onAddLeaveRequestSim={(req) => {
                  onAddLeaveRequestSim?.(req);
                }}
              />
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}

export default MyWorkspace;
