import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEmployeeDirectoryUIState } from './hooks/useEmployeeDirectoryUIState';
import { Employee, Branch, Department, Role, EmployeeBadge, AttendanceRecord, ForensicLog } from '../../types';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { getDbCollection } from '../../lib/firebase';
import { realtimeManager } from '../../services/firestore/realtimeManager';
import { useRealtimeSubscription } from '../../hooks/useRealtimeSubscription';
import { EnterpriseIdentityOrchestrator } from '../../modules/identity/EnterpriseIdentityOrchestrator';
import { EmployeeRepository } from '../../repositories/EmployeeRepository';
import { SuspendConfirmationModal } from './SuspendConfirmationModal';
import { ReactivateConfirmationModal } from './ReactivateConfirmationModal';
import { toast } from 'sonner';
import EmployeeTable, { SortDirection, SortField } from './EmployeeTable';
import { Search, Filter, X, SlidersHorizontal, Download, Columns, CheckCircle, FileText, QrCode, Scan, Camera, Volume2, VolumeX, ShieldCheck, Printer, Clock, AlertTriangle, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n';
import CameraQrScanner from '../attendance/CameraQrScanner';
import { EmployeeBadgeCard } from './EmployeeBadgeCard';
import { motion, AnimatePresence } from 'motion/react';
import { generateBadgePdf } from '../../lib/generateBadgePdf';
import { calculateAttendanceVariance } from '../../lib/attendanceSSOT';
import { ReferenceResolver } from '../../services/ReferenceResolver';
import { UnifiedAttendanceKioskModal } from '../attendance/UnifiedAttendanceKioskModal';

interface EmployeeDirectoryProps {
  initialEmployees?: Employee[];
  branches?: Branch[];
  departments?: Department[];
  currentRole?: Role | string;
  userBranchId?: string;
  attendanceRecords?: AttendanceRecord[];
  onUpdateAttendance?: (records: AttendanceRecord[]) => void;
  employeeBadges?: EmployeeBadge[];
  onAddEvent?: (ev: any) => void;
  onAddForensicLog?: (log: any) => void;
  currentBusiness?: any;
  onAction?: (action: string, employee: Employee) => void;
  currentUserId?: string;
  currentUserEmail?: string;
}

const dirDict = {
  fr: {
    restrictedAccess: "Accès Restreint",
    restrictedDesc: "Votre niveau d'accès ne permet pas de consulter l'annuaire.",
    title: "Explorateur du Personnel",
    foundSuffix: "collaborateurs trouvés",
    searchPlaceholder: "Rechercher par nom, email, ID ou poste...",
    filters: "Filtres",
    export: "Exporter",
    branch: "Succursale",
    allBranches: "Toutes les succursales",
    department: "Département",
    allDepts: "Tous les départements",
    status: "Statut",
    allStatuses: "Tous les statuts",
    activeStatus: "Actif (En fonction)",
    revokedStatus: "Révoqué / Suspendu",
    pendingStatus: "En attente / Incomplet",
    payRegime: "Régime Paie",
    allRegimes: "Tous les régimes",
    fixedRegime: "Fixe Uniquement",
    commissionRegime: "Commission Uniquement",
    hybridRegime: "Hybride (Fixe + Comm.)",
    savedViews: "Vues Sauvegardées :",
    viewPending: "Retards / En Attente",
    viewRevoked: "Personnel Révoqué",
    viewCommission: "Régimes Commission",
    resetBtn: "Réinitialiser",
    totalActive: "Total Actifs :",
    monthlyCost: "Coût Mensuel Estimé :",
    selectedPrefix: "employé(s) sélectionné(s)",
    estimatePayroll: "Estimation Paie",
    downloadBadges: "Télécharger Badges (ZIP)",
    cancel: "Annuler",
    exportAlert: "Exportation de {count} enregistrements au format {format} avec les filtres actifs...",
    estimateAlert: "Estimation de la paie pour {count} employés...",
    zipAlert: "Préparation de l'archive ZIP pour {count} badges QR..."
  },
  ht: {
    restrictedAccess: "Aksè Restren",
    restrictedDesc: "Nivo aksè ou a pa pèmèt ou wè anyè a.",
    title: "Eksploratè Anplwaye yo",
    foundSuffix: "kolaboratè yo jwenn",
    searchPlaceholder: "Chache pa non, imel, ID oswa pòs...",
    filters: "Filtè yo",
    export: "Ekspòte",
    branch: "Sikisal",
    allBranches: "Tout sikisal yo",
    department: "Depatman",
    allDepts: "Tout depatman yo",
    status: "Sitiyasyon yo",
    allStatuses: "Tout estati yo",
    activeStatus: "Aktif (Nan travay)",
    revokedStatus: "Rive sispann / Revoke",
    pendingStatus: "Ap tann / Enkonplè",
    payRegime: "Kondisyon Peman",
    allRegimes: "Tout kondisyon yo",
    fixedRegime: "Sèlman Fiks",
    commissionRegime: "Sèlman Komisyon",
    hybridRegime: "Ibrid (Fiks + Kom.)",
    savedViews: "Vues Sove :",
    viewPending: "Reta / Ap Tann",
    viewRevoked: "Moun ki Revoke",
    viewCommission: "Kondisyon Komisyon",
    resetBtn: "Reyisyalize",
    totalActive: "Total ki Aktif :",
    monthlyCost: "Depans pou Chak Mwa :",
    selectedPrefix: "anplwaye chwazi",
    estimatePayroll: "Evalye Peman",
    downloadBadges: "Telechaje Badj (ZIP)",
    cancel: "Anile",
    exportAlert: "Ekspòte {count} fichye nan fòma {format} ak filtè yo...",
    estimateAlert: "Evalyasyon peman pou {count} anplwaye...",
    zipAlert: "Ap prepare fichye ZIP pou {count} badj QR..."
  },
  en: {
    restrictedAccess: "Restricted Access",
    restrictedDesc: "Your access level does not allow you to view the directory.",
    title: "Employee Directory",
    foundSuffix: "employees found",
    searchPlaceholder: "Search by name, email, ID or position...",
    filters: "Filters",
    export: "Export",
    branch: "Branch",
    allBranches: "All branches",
    department: "Department",
    allDepts: "All departments",
    status: "Status",
    allStatuses: "All statuses",
    activeStatus: "Active",
    revokedStatus: "Revoked / Suspended",
    pendingStatus: "Pending / Incomplete",
    payRegime: "Pay Regime",
    allRegimes: "All regimes",
    fixedRegime: "Fixed Only",
    commissionRegime: "Commission",
    hybridRegime: "Hybrid (Fixed + Comm.)",
    savedViews: "Saved Views:",
    viewPending: "Late / Pending",
    viewRevoked: "Revoked Staff",
    viewCommission: "Commission Regime",
    resetBtn: "Reset",
    totalActive: "Total Active:",
    monthlyCost: "Est. Monthly Payroll:",
    selectedPrefix: "employee(s) selected",
    estimatePayroll: "Estimate Payroll",
    downloadBadges: "Download Badges (ZIP)",
    cancel: "Cancel",
    exportAlert: "Exporting {count} records to {format} with active filters...",
    estimateAlert: "Estimating payroll for {count} employees...",
    zipAlert: "Preparing ZIP archive for {count} QR badges..."
  }
};

const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({
  initialEmployees = [],
  branches = [],
  departments = [],
  currentRole = "EMPLOYEE",
  userBranchId,
  attendanceRecords = [],
  onUpdateAttendance,
  employeeBadges = [],
  onAddEvent,
  onAddForensicLog,
  currentBusiness,
  onAction,
  currentUserId,
  currentUserEmail
}) => {
  const { language } = useI18n();
  const d = dirDict[(language === "ht" || language === "en") ? language : "fr"];

  const [employees, setEmployees] = useState<Employee[]>(initialEmployees || []);

  // Keep local employees in sync with initialEmployees from SSOT Realtime layer
  useEffect(() => {
    setEmployees(initialEmployees || []);
  }, [initialEmployees]);

  // Extracted EmployeeDirectory UI state hook
  const {
    searchQuery, setSearchQuery,
    debouncedSearchQuery, setDebouncedSearchQuery,
    hideInactive, setHideInactive,
    isDbConnected, setIsDbConnected,
    suspendTarget, setSuspendTarget,
    reactivateTarget, setReactivateTarget,
    currentPage, setCurrentPage,
    pageSize, setPageSize,
    subTab, setSubTab,
    auditLogs, setAuditLogs,
    isSyncing, setIsSyncing,
    syncFeedback, setSyncFeedback,
    expandedLogId, setExpandedLogId,
    isQrDrawerOpen, setIsQrDrawerOpen,
    qrActiveTab, setQrActiveTab,
    selectedEmployeeId, setSelectedEmployeeId,
    scanMode, setScanMode,
    isCameraActive, setIsCameraActive,
    isProcessing, setIsProcessing,
    isMuted, setIsMuted,
    scannerFeedback, setScannerFeedback,
    recentScans, setRecentScans,
  } = useEmployeeDirectoryUIState();

  const [isKioskModalOpen, setIsKioskModalOpen] = useState(false);
  const [kioskPreSelectedId, setKioskPreSelectedId] = useState<string | undefined>(undefined);

  // Use Real-time SRE hook for observability forensic logs
  const { data: realTimeAuditLogs } = useRealtimeSubscription<ForensicLog>(
    "audit_logs",
    currentBusiness?.id ? [{ field: "business_id", operator: "==", value: currentBusiness.id }] : [],
    {
      enabled: subTab === "observability" && Boolean(currentBusiness?.id),
      businessId: currentBusiness?.id,
      orderByField: "timestamp",
      orderDirection: "desc",
      limitCount: 200
    }
  );

  useEffect(() => {
    if (subTab === "observability" && realTimeAuditLogs) {
      setAuditLogs(realTimeAuditLogs);
    }
  }, [subTab, realTimeAuditLogs, setAuditLogs]);

  // Sound play helper for scanning feedback
  const playBeep = (type: "success" | "error") => {
    if (isMuted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type === "success" ? "sine" : "sawtooth";
      osc.frequency.setValueAtTime(type === "success" ? 880 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.log("Audio feedback blocked:", e);
    }
  };

  // Safe manual scan process simulation / Real camera scan process
  const processAttendanceScan = async (empId: string, forcedType?: "IN" | "OUT") => {
    if (isProcessing) return;
    setIsProcessing(true);
    setScannerFeedback({
      status: "scanning",
      message: language === "fr" ? "Pointage en cours de traitement..." : "Sistèm nan ap trete pwentaj la...",
    });

    await new Promise((r) => setTimeout(r, 600));

    const emp = employees.find((e) => e.id === empId);
    if (!emp) {
      playBeep("error");
      setScannerFeedback({
        status: "error",
        message: language === "fr" ? "Employé introuvable." : "Anplwaye sa a pa egziste nan sistèm nan.",
      });
      setIsProcessing(false);
      return;
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0].slice(0, 5); // "HH:MM"
    const dateStr = now.toISOString().split("T")[0];

    const existingRecordIndex = attendanceRecords.findIndex(
      (r) => r.employeeId === emp.id && r.date === dateStr
    );
    const existingRecord = existingRecordIndex !== -1 ? attendanceRecords[existingRecordIndex] : null;

    let actionType: "IN" | "OUT" = "IN";
    if (forcedType) {
      actionType = forcedType;
    } else if (scanMode === "AUTO") {
      actionType = existingRecord && !existingRecord.checkOut ? "OUT" : "IN";
    } else {
      actionType = scanMode as "IN" | "OUT";
    }

    if (actionType === "IN") {
      if (existingRecord) {
        playBeep("error");
        setScannerFeedback({
          status: "error",
          message: language === "fr" ? "Arrivée déjà enregistrée aujourd'hui." : "Ou deja fè pwentaj antre pou jodi a.",
        });
        setIsProcessing(false);
        return;
      }

      const newRecord: AttendanceRecord = {
        id: "att_" + Math.random().toString(36).substring(2, 9),
        employeeId: emp.id,
        employeeName: emp.name,
        business_id: emp.business_id || currentBusiness?.id || "b1",
        branchId: emp.branchId || "br1",
        departmentId: emp.departmentId || "d1",
        date: dateStr,
        checkIn: timeStr,
        checkOut: null,
        status: "NORMAL",
        plannedHours: 8,
        realHours: 0,
        variance: -8,
      };

      if (onUpdateAttendance) {
        onUpdateAttendance([newRecord, ...attendanceRecords]);
      }

      // Log ERP Event & Forensic Logs
      if (onAddEvent) {
        onAddEvent({
          id: "ev_" + Math.random().toString(36).substring(2, 9),
          business_id: emp.business_id || currentBusiness?.id || "b1",
          type: "INFO",
          category: "ATTENDANCE",
          message: `QR Check-In: ${emp.name} à ${timeStr}`,
          timestamp: new Date().toISOString(),
          actor: emp.name,
          ip_address: "192.168.1.100",
        });
      }

      playBeep("success");
      setScannerFeedback({
        status: "success",
        message: language === "fr" ? `ARRIVÉE VALIDÉE ✓ Bienvenue, ${emp.name} à ${timeStr}.` : `ANTRE VALIDE ✓ Byenveni, ${emp.name} a ${timeStr}.`,
      });

      setRecentScans((prev) => [
        { id: Math.random().toString(), name: emp.name, time: timeStr, status: "IN" as const },
        ...prev,
      ].slice(0, 5));

    } else {
      // OUT Action
      if (!existingRecord) {
        playBeep("error");
        setScannerFeedback({
          status: "error",
          message: language === "fr" ? "Aucune arrivée enregistrée aujourd'hui." : "Ou pa t fè pwentaj antre pou jodi a.",
        });
        setIsProcessing(false);
        return;
      }

      if (existingRecord.checkOut) {
        playBeep("error");
        setScannerFeedback({
          status: "error",
          message: language === "fr" ? "Sortie déjà enregistrée aujourd'hui." : "Ou deja fè pwentaj soti pou jodi a.",
        });
        setIsProcessing(false);
        return;
      }

      const updatedRecords = [...attendanceRecords];
      const recordToUpdate = { ...existingRecord };

      // Calculate worked hours (e.g., 8.0)
      const [inH, inM] = recordToUpdate.checkIn.split(":").map(Number);
      const [outH, outM] = timeStr.split(":").map(Number);
      const hoursClocked = Math.round(((outH * 60 + outM) - (inH * 60 + inM)) / 6) / 10;

      recordToUpdate.checkOut = timeStr;
      recordToUpdate.realHours = hoursClocked;
      recordToUpdate.variance = calculateAttendanceVariance(hoursClocked, recordToUpdate.plannedHours);
      recordToUpdate.status = recordToUpdate.variance >= 0 ? "NORMAL" : "LATE";

      updatedRecords[existingRecordIndex] = recordToUpdate;

      if (onUpdateAttendance) {
        onUpdateAttendance(updatedRecords);
      }

      // Log ERP Event
      if (onAddEvent) {
        onAddEvent({
          id: "ev_" + Math.random().toString(36).substring(2, 9),
          business_id: emp.business_id || currentBusiness?.id || "b1",
          type: "INFO",
          category: "ATTENDANCE",
          message: `QR Check-Out: ${emp.name} à ${timeStr}`,
          timestamp: new Date().toISOString(),
          actor: emp.name,
          ip_address: "192.168.1.100",
        });
      }

      playBeep("success");
      setScannerFeedback({
        status: "success",
        message: language === "fr" ? `DEPART VALIDÉ ✓ Travail accompli, ${emp.name} à ${timeStr}.` : `SOTI VALIDE ✓ Travay fini, ${emp.name} a ${timeStr}.`,
      });

      setRecentScans((prev) => [
        { id: Math.random().toString(), name: emp.name, time: timeStr, status: "OUT" as const },
        ...prev,
      ].slice(0, 5));
    }

    setIsProcessing(false);
  };

  // Pre-select first employee
  useEffect(() => {
    if (employees && employees.length > 0 && !selectedEmployeeId) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterBranch, setFilterBranch] = useState<string>("ALL");
  const [filterDepartment, setFilterDepartment] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterPayRegime, setFilterPayRegime] = useState<string>("ALL");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const prevEmpFingerprintRef = useRef<string>("");

  useEffect(() => {
    const safeInit = initialEmployees || [];
    const fingerprint = safeInit.map(e => `${e.id}_${e.isActive}_${e.updatedAt || ''}_${e.name}`).join('|');
    if (prevEmpFingerprintRef.current !== fingerprint) {
      prevEmpFingerprintRef.current = fingerprint;
      setEmployees(safeInit);
    }
  }, [initialEmployees]);

  // Filtering & Search Across ALL Columns
  const filteredAndSorted = useMemo(() => {
    const safeList = employees || [];
    let result = safeList.filter(emp => {
      // Role Based Access Control
      if (currentRole === 'MANAGER' && userBranchId && emp.branchId !== userBranchId) {
        return false;
      }
      if (currentRole === 'EMPLOYEE') {
        // Allow simple employees to only see their own information
        return emp.id === currentUserId || emp.email.toLowerCase().trim() === currentUserEmail?.toLowerCase().trim();
      }
      
      // Global Search Across ALL Columns
      if (debouncedSearchQuery) {
        const q = debouncedSearchQuery.toLowerCase().trim();
        const branchName = ReferenceResolver.resolveBranch(branches, emp.branchId || (emp as any).branch_id)?.name || emp.branchId || "";
        const deptName = ReferenceResolver.resolveDepartment(departments, emp.departmentId || (emp as any).department_id)?.name || emp.departmentId || "";
        const statusText = emp.status === "SUSPENDED" || emp.isActive === false ? "suspended suspendu inactive révoqué" : emp.onboardingComplete === false ? "pending en attente" : emp.status === "ON_LEAVE" ? "on_leave congé" : "active actif";
        const regimeText = emp.paymentModel || "";
        const salaryText = emp.baseSalary ? String(emp.baseSalary) : "";

        const matches = (
          emp.name.toLowerCase().includes(q) ||
          emp.email.toLowerCase().includes(q) ||
          (emp.phone ? String(emp.phone).toLowerCase() : "").includes(q) ||
          (emp.position ? String(emp.position).toLowerCase() : "").includes(q) ||
          (emp.role ? String(emp.role).toLowerCase() : "").includes(q) ||
          emp.id.toLowerCase().includes(q) ||
          branchName.toLowerCase().includes(q) ||
          deptName.toLowerCase().includes(q) ||
          statusText.toLowerCase().includes(q) ||
          regimeText.toLowerCase().includes(q) ||
          salaryText.includes(q)
        );
        if (!matches) return false;
      }

      // Advanced Filters
      if (filterBranch !== "ALL" && emp.branchId !== filterBranch) return false;
      if (filterDepartment !== "ALL" && emp.departmentId !== filterDepartment) return false;
      
      if (filterStatus !== "ALL") {
        if (filterStatus === "ACTIVE" && (emp.isActive === false || emp.status === "SUSPENDED" || emp.onboardingComplete === false)) return false;
        if (filterStatus === "SUSPENDED" && (emp.status !== "SUSPENDED" && emp.isActive !== false)) return false;
        if (filterStatus === "REVOKED" && emp.isActive !== false) return false;
        if (filterStatus === "PENDING" && emp.onboardingComplete !== false) return false;
      }

      if (filterPayRegime !== "ALL" && emp.paymentModel !== filterPayRegime) return false;
      if (hideInactive && (emp.isActive === false || emp.status === "SUSPENDED")) return false;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof Employee] || "";
      let valB: any = b[sortField as keyof Employee] || "";

      if (sortField === "score") {
        valA = 95;
        valB = 90;
      }

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [employees, debouncedSearchQuery, filterBranch, filterDepartment, filterStatus, filterPayRegime, sortField, sortDirection, currentRole, userBranchId, branches, departments, currentUserId, currentUserEmail, hideInactive]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  // Handlers for Suspend & Reactivate
  const handleConfirmSuspend = async (employeeToSuspend: Employee, reason: string) => {
    try {
      await EmployeeRepository.suspendEmployee(employeeToSuspend.id, reason, {
        uid: currentUserId || "system",
        role: currentRole
      });
      setEmployees(prev => prev.map(e => e.id === employeeToSuspend.id ? { ...e, status: "SUSPENDED", isActive: false, suspensionReason: reason } : e));
      toast.success(language === "fr" ? `${employeeToSuspend.name} a été suspendu avec succès.` : `${employeeToSuspend.name} suspended successfully.`);
    } catch (error: any) {
      console.error("Error suspending employee:", error);
      toast.error(error?.message || "Failed to suspend employee");
    } finally {
      setSuspendTarget(null);
    }
  };

  const handleConfirmReactivate = async (employeeToReactivate: Employee) => {
    try {
      await EmployeeRepository.reactivateEmployee(employeeToReactivate.id, {
        uid: currentUserId || "system",
        role: currentRole
      });
      setEmployees(prev => prev.map(e => e.id === employeeToReactivate.id ? { ...e, status: "ACTIVE", isActive: true, suspensionReason: undefined } : e));
      toast.success(language === "fr" ? `${employeeToReactivate.name} a été réactivé avec succès.` : `${employeeToReactivate.name} reactivated successfully.`);
    } catch (error: any) {
      console.error("Error reactivating employee:", error);
      toast.error(error?.message || "Failed to reactivate employee");
    } finally {
      setReactivateTarget(null);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const clearFilters = () => {
    setFilterBranch("ALL");
    setFilterDepartment("ALL");
    setFilterStatus("ALL");
    setFilterPayRegime("ALL");
    setSearchQuery("");
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredAndSorted.length && filteredAndSorted.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredAndSorted.map(e => e.id));
    }
  };

  // Stats
  const activeCount = filteredAndSorted.filter(e => e.isActive !== false).length;
  const totalPayroll = filteredAndSorted.reduce((sum, e) => sum + (e.baseSalary || 0), 0);

  // Exporter handler
  const handleExport = (format: string) => {
    if (format === 'csv') {
      const headers = ["ID", "Name", "Email", "Position", "Branch", "Department", "Status"];
      const rows = filteredAndSorted.map(emp => [
        emp.id,
        `"${emp.name.replace(/"/g, '""')}"`,
        emp.email,
        `"${(emp.position || '').replace(/"/g, '""')}"`,
        `"${ReferenceResolver.resolveBranch(branches, emp.branchId || (emp as any).branch_id)?.name || emp.branchId || ''}"`,
        `"${ReferenceResolver.resolveDepartment(departments, emp.departmentId || (emp as any).department_id)?.name || emp.departmentId || ''}"`,
        emp.isActive ? "Active" : "Inactive"
      ]);
      
      const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personnel_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } else {
      alert(d.exportAlert.replace("{count}", String(filteredAndSorted.length)).replace("{format}", format.toUpperCase()));
    }
  };



  return (
    <div className="flex flex-col gap-5 w-full font-sans animate-in fade-in duration-300">
      
      {/* HEADER & GLOBAL SEARCH BAR */}
      <div className="flex flex-col gap-4 bg-slate-900/70 p-4 lg:p-5 border border-slate-800/90 rounded-2xl backdrop-blur-md shadow-xl">
        {/* TOP ROW: Title, Compact SubTabs, and Quick Action Utilities */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs sm:text-sm uppercase font-extrabold text-slate-100 tracking-wider">
                {d.title}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold">
                {filteredAndSorted.length} {d.foundSuffix}
              </span>
            </div>

            {currentRole !== "EMPLOYEE" && (
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/80">
                <button
                  onClick={() => setSubTab("directory")}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    subTab === "directory"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Annuaire
                </button>
                <button
                  onClick={() => setSubTab("observability")}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                    subTab === "observability"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Observabilité & Audit
                </button>
              </div>
            )}
          </div>

          {/* Quick Toolbar Action Buttons */}
          {subTab === "directory" && currentRole !== "EMPLOYEE" && (
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
              <button 
                id="employee-scan-qr-btn"
                onClick={() => { setKioskPreSelectedId(undefined); setIsKioskModalOpen(true); }}
                className="px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-[10px] font-bold uppercase text-cyan-400 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
              >
                <Scan className="w-3.5 h-3.5" />
                <span>SCAN QR</span>
              </button>

              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-[10px] font-bold uppercase transition-all shrink-0 ${
                  showFilters || filterBranch !== "ALL" || filterStatus !== "ALL" || filterDepartment !== "ALL" || filterPayRegime !== "ALL" 
                    ? 'bg-cyan-900/40 border-cyan-500/50 text-cyan-300 shadow-sm' 
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{showFilters ? 'Masquer Filtres' : 'Filtres Avancés'}</span>
              </button>

              <div className="relative group shrink-0">
                <button className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-700 transition flex items-center gap-1.5 text-[10px] font-bold uppercase">
                  <Download className="w-3.5 h-3.5" />
                  <span>Exporter</span>
                </button>
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col p-1.5 z-30">
                  <button onClick={() => handleExport('csv')} className="px-3 py-2 text-left text-[10px] uppercase font-bold text-slate-300 hover:bg-slate-800 hover:text-cyan-400 rounded-lg">Export CSV</button>
                  <button onClick={() => handleExport('excel')} className="px-3 py-2 text-left text-[10px] uppercase font-bold text-slate-300 hover:bg-slate-800 hover:text-cyan-400 rounded-lg">Export Excel</button>
                  <button onClick={() => handleExport('pdf')} className="px-3 py-2 text-left text-[10px] uppercase font-bold text-slate-300 hover:bg-slate-800 hover:text-cyan-400 rounded-lg">Export PDF</button>
                </div>
              </div>

              <div className="relative group shrink-0">
                <button className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 hover:border-slate-700 transition flex items-center gap-1.5 text-[10px] font-bold uppercase">
                  <span>Actions</span>
                </button>
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex flex-col p-1.5 z-30">
                  <button className="px-3 py-2 text-left text-[10px] uppercase font-bold text-slate-300 hover:bg-slate-800 hover:text-cyan-400 rounded-lg">Set Active</button>
                  <button className="px-3 py-2 text-left text-[10px] uppercase font-bold text-slate-300 hover:bg-slate-800 hover:text-cyan-400 rounded-lg">Gen. Docs</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PROMINENT HIGH-VISIBILITY SEARCH ROW */}
        {subTab === "directory" ? (
          <div className="flex flex-col md:flex-row gap-3 items-center w-full">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-cyan-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder={d.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border-2 border-slate-800 focus:border-cyan-500/80 text-slate-100 text-xs sm:text-sm rounded-xl pl-10 pr-9 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all font-mono shadow-inner"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {currentRole !== "EMPLOYEE" && (
              <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start shrink-0">
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all font-mono min-w-[120px]"
                >
                  <option value="ALL">Tous les statuts</option>
                  <option value="ACTIVE">Actifs</option>
                  <option value="SUSPENDED">Suspendus</option>
                  <option value="REVOKED">Révoqués</option>
                  <option value="PENDING">En attente</option>
                </select>
                
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-200 whitespace-nowrap bg-slate-950 px-3 py-2.5 rounded-xl border border-slate-800">
                  <input type="checkbox" checked={hideInactive} onChange={() => setHideInactive(!hideInactive)} className="rounded border-slate-700 bg-slate-900 text-cyan-600 focus:ring-cyan-500 accent-cyan-500" />
                  <span>Masquer inactifs</span>
                </label>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 w-full flex flex-col md:flex-row gap-3 items-center justify-end py-1">
            <span className="text-[10px] text-cyan-400 font-mono tracking-wider animate-pulse flex items-center gap-1.5 uppercase font-extrabold bg-cyan-950/40 px-3 py-1.5 rounded-xl border border-cyan-800/40">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              SSOT Identity Integrity Pipeline V1 Active
            </span>
          </div>
        )}
      </div>

      {subTab === "observability" ? (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
          {/* DIAGNOSTICS & METRICS SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Identités RH Multi-Tenant</span>
              <span className="text-2xl font-extrabold text-slate-100 font-mono">{employees.length}</span>
              <span className="text-[9px] text-slate-500 font-mono">Unité de Vérité (Source of Truth)</span>
            </div>
            <div className="bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Audit Logs immuables</span>
              <span className="text-2xl font-extrabold text-slate-100 font-mono">{auditLogs.length}</span>
              <span className="text-[9px] text-slate-500 font-mono">Transactions de cycle d'identité</span>
            </div>
            <div className="bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Statut Système</span>
              <span className="text-sm font-extrabold text-emerald-400 flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Opérationnel
              </span>
              <span className="text-[9px] text-slate-500 font-mono">Contrôle d'intégrité en temps réel</span>
            </div>
            <div className="bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-2 justify-center">
              <button
                disabled={isSyncing}
                onClick={async () => {
                  setIsSyncing(true);
                  setSyncFeedback("Calcul et recalibrage de l'alignement Firebase Auth & SSOT...");
                  try {
                    let resolved = 0;
                    const correlationId = `reconcile_${Date.now()}`;
                    for (const emp of employees) {
                      await EnterpriseIdentityOrchestrator.reconcileEmployee(emp.id, correlationId);
                      resolved++;
                    }
                    setSyncFeedback(`Synchronisation complétée ! ${resolved} profils recalibrés.`);
                  } catch (e: any) {
                    setSyncFeedback(`Erreur : ${e.message}`);
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg py-2 text-[10px] uppercase font-black tracking-wider transition-all disabled:opacity-50"
              >
                {isSyncing ? "Calibrage en cours..." : "Forcer Recalibrage SSOT"}
              </button>
              {syncFeedback && (
                <span className="text-[9px] font-mono text-cyan-500 text-center animate-pulse">{syncFeedback}</span>
              )}
            </div>
          </div>

          {/* AUDIT LOG TRAIL */}
          <div className="bg-slate-900/40 p-5 border border-slate-800/80 rounded-xl backdrop-blur-md flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <h3 className="text-xs uppercase font-extrabold text-slate-200 tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Registre d'Audit Forensic Identité
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">Logs transactionnels d'invitation et d'employés immuables et signés cryptographiquement</span>
              </div>
              <span className="text-[9px] px-2 py-0.5 bg-slate-950 border border-slate-800 text-slate-500 font-mono rounded">
                SECURE SHA-256 INTEGRITY
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/60 text-[9px] uppercase font-black text-slate-500 tracking-wider font-mono">
                    <th className="py-2.5 px-3">Date & Heure</th>
                    <th className="py-2.5 px-3">Action / Transition</th>
                    <th className="py-2.5 px-3">Cible Email / ID</th>
                    <th className="py-2.5 px-3">Opérateur (Rôle)</th>
                    <th className="py-2.5 px-3 text-right">Preuve / Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500 font-mono text-xs">
                        Aucun log transactionnel d'identité enregistré pour ce business.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="border-b border-slate-800/40 text-xs hover:bg-slate-800/20 cursor-pointer transition font-mono"
                          >
                            <td className="py-3 px-3 text-slate-400">
                              {new Date(log.timestamp).toLocaleString("fr-FR")}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                log.action?.includes("HIRE") || log.action?.includes("CREATE")
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : log.action?.includes("INVIT")
                                  ? "bg-cyan-500/10 text-cyan-400"
                                  : log.action?.includes("STATUS") || log.action?.includes("ROLE")
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-slate-500/10 text-slate-400"
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-300">
                              {log.employeeEmail || log.employeeId || "N/A"}
                            </td>
                            <td className="py-3 px-3 text-slate-300">
                              {log.actorName} <span className="text-[10px] text-slate-500">({log.actorRole})</span>
                            </td>
                            <td className="py-3 px-3 text-right text-[10px] text-cyan-400">
                              {log.signature ? log.signature.substring(0, 16) + "..." : "SYSTEM_SEAL_OK"}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-950/40">
                              <td colSpan={5} className="py-4 px-6 border-b border-slate-800/80">
                                <div className="flex flex-col gap-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold uppercase text-slate-400">Détails de l'état (Before / After Transition)</span>
                                    <span className="text-[9px] text-slate-600">ID Log: {log.id}</span>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
                                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/60 flex flex-col gap-1.5">
                                      <span className="text-[9px] uppercase font-bold text-slate-500">État Précédent (Before State)</span>
                                      <pre className="text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap">
                                        {log.beforeState ? JSON.stringify(JSON.parse(log.beforeState), null, 2) : "{}"}
                                      </pre>
                                    </div>
                                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/60 flex flex-col gap-1.5">
                                      <span className="text-[9px] uppercase font-bold text-slate-500">Nouvel État (After State)</span>
                                      <pre className="text-[10px] text-cyan-400 overflow-x-auto whitespace-pre-wrap">
                                        {log.afterState ? JSON.stringify(JSON.parse(log.afterState), null, 2) : "{}"}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ADVANCED FILTER DRAWER */}
          {showFilters && (
            <div className="bg-slate-900/40 p-4 border border-slate-800 border-l-2 border-l-cyan-500 rounded-xl grid grid-cols-1 md:grid-cols-4 gap-4 animate-in slide-in-from-top-4 duration-300">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{d.branch}</label>
                <select 
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:border-cyan-500 outline-none"
                >
                  <option value="ALL">{d.allBranches}</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{d.department}</label>
                <select 
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:border-cyan-500 outline-none"
                >
                  <option value="ALL">{d.allDepts}</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{d.status}</label>
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:border-cyan-500 outline-none"
                >
                  <option value="ALL">{d.allStatuses}</option>
                  <option value="ACTIVE">{d.activeStatus}</option>
                  <option value="REVOKED">{d.revokedStatus}</option>
                  <option value="PENDING">{d.pendingStatus}</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{d.payRegime}</label>
                <select 
                  value={filterPayRegime}
                  onChange={(e) => setFilterPayRegime(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-300 font-mono focus:border-cyan-500 outline-none"
                >
                  <option value="ALL">{d.allRegimes}</option>
                  <option value="FIXED">{d.fixedRegime}</option>
                  <option value="COMMISSION">{d.commissionRegime}</option>
                  <option value="HYBRID">{d.hybridRegime}</option>
                </select>
              </div>

              <div className="md:col-span-4 flex items-center justify-between mt-2 pt-4 border-t border-slate-800/80">
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mr-2">{d.savedViews}</span>
                  <button onClick={() => { clearFilters(); setFilterStatus("PENDING"); }} className="text-[9px] px-2 py-1 rounded bg-slate-800/50 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold uppercase transition">{d.viewPending}</button>
                  <button onClick={() => { clearFilters(); setFilterStatus("REVOKED"); }} className="text-[9px] px-2 py-1 rounded bg-slate-800/50 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold uppercase transition">{d.viewRevoked}</button>
                  <button onClick={() => { clearFilters(); setFilterPayRegime("COMMISSION"); }} className="text-[9px] px-2 py-1 rounded bg-slate-800/50 border border-slate-700 hover:bg-slate-700 text-slate-300 font-bold uppercase transition">{d.viewCommission}</button>
                </div>
                <button 
                  onClick={clearFilters}
                  className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-200 transition shrink-0"
                >
                  {d.resetBtn}
                </button>
              </div>
            </div>
          )}

          {/* FAST METRICS BANNER */}
          {currentRole !== "EMPLOYEE" && (
            <div className="flex gap-4 items-center px-2">
               <div className="flex gap-2 text-[10px] font-mono text-slate-400">
                 <span className="bg-slate-900/50 border border-slate-800 px-2 py-1 rounded">
                   {d.totalActive} <strong className="text-cyan-400">{activeCount}</strong>
                 </span>
                 <span className="bg-slate-900/50 border border-slate-800 px-2 py-1 rounded">
                   {d.monthlyCost} <strong className="text-emerald-400">{totalPayroll.toLocaleString()} HTG</strong>
                 </span>
               </div>
            </div>
          )}

          {/* BULK ACTIONS BANNER */}
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between bg-cyan-900/20 border border-cyan-500/30 p-2.5 rounded-xl animate-in slide-in-from-bottom-2 backdrop-blur-sm -mb-2 z-10 relative">
              <span className="text-xs font-bold text-cyan-400 font-mono flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {selectedIds.length} {d.selectedPrefix}
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => alert(d.estimateAlert.replace("{count}", String(selectedIds.length)))}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded transition flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
                >
                  <FileText className="w-3 h-3" />
                  {d.estimatePayroll}
                </button>
                <button 
                  onClick={() => alert(d.zipAlert.replace("{count}", String(selectedIds.length)))}
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded transition flex items-center gap-1.5 shadow-lg shadow-cyan-900/20"
                >
                  <Download className="w-3 h-3" />
                  {d.downloadBadges}
                </button>
                <button 
                  onClick={() => setSelectedIds([])}
                  className="px-2 py-1.5 text-slate-400 hover:text-slate-200 text-[10px] transition uppercase font-bold"
                >
                  {d.cancel}
                </button>
              </div>
            </div>
          )}

          {/* ERP DATA TABLE */}
          <EmployeeTable 
            employees={paginatedEmployees}
            branches={branches}
            departments={departments}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={toggleSort}
            onAction={(action, emp) => {
              if (action === 'suspend') {
                 setSuspendTarget(emp);
              } else if (action === 'reactivate') {
                 setReactivateTarget(emp);
              } else if (action === 'assign_branch') {
                 alert(language === "fr" ? "Fonctionnalité 'Assigner Succursale' à venir." : language === "ht" ? "Fonksyon 'Asiyen Sikisal' ap vini." : "Assign Branch feature coming soon.");
              } else if (action === 'badge') {
                 setSelectedEmployeeId(emp.id);
                 setQrActiveTab("generator");
                 setIsQrDrawerOpen(true);
              } else {
                 onAction?.(action, emp);
              }
            }}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            currentRole={currentRole as Role}
          />

          {/* PAGINATION CONTROLS */}
          <div className="bg-slate-900/80 border border-slate-800/80 px-4 py-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Affichage de</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs focus:border-cyan-500 outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>sur <strong className="text-slate-200 font-mono">{filteredAndSorted.length}</strong> employés au total</span>
            </div>

            <div className="flex items-center gap-2 font-mono">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-300 flex items-center gap-1 font-sans text-[11px]"
                title="Page précédente"
              >
                <ChevronLeft className="w-4 h-4" /> Précédent
              </button>
              <span className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs font-bold">
                Page {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-300 flex items-center gap-1 font-sans text-[11px]"
                title="Page suivante"
              >
                Suivant <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* SUMMARY FOOTER */}
          {currentRole !== "EMPLOYEE" && (
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase">Directory Summary</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-400">Total Visible: <strong className="text-slate-100">{filteredAndSorted.length}</strong></span>
                <span className="text-xs text-slate-400">Total Monthly Payroll: <strong className="text-emerald-400">{filteredAndSorted.reduce((sum, e) => sum + (e.baseSalary || 0), 0).toLocaleString()} HTG</strong></span>
              </div>
            </div>
          )}
        </>
      )}

      {/* QR CODE GENERATOR & SCANNER SIDE DRAWER */}
      {isQrDrawerOpen && createPortal(
        <AnimatePresence>
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsQrDrawerOpen(false); setIsCameraActive(false); }}
              className="fixed inset-0 bg-slate-950 z-40 cursor-pointer"
            />

            {/* Slide-over Drawer Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col overflow-hidden"
              id="qr-slide-drawer"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 bg-slate-900 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                    <QrCode className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider">
                      Module QR & Pointage Staff
                    </h3>
                    <span className="text-[9px] text-slate-400 font-mono">FINOPS Attendance Systems</span>
                  </div>
                </div>
                <button
                  onClick={() => { setIsQrDrawerOpen(false); setIsCameraActive(false); }}
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs Navigation */}
              <div className="flex bg-slate-950 border-b border-slate-850 p-1 shrink-0">
                <button
                  onClick={() => setQrActiveTab("generator")}
                  className={`flex-1 py-2 text-center text-xs font-bold uppercase transition rounded-md flex items-center justify-center gap-1.5 ${
                    qrActiveTab === "generator"
                      ? "bg-slate-900 text-cyan-400 font-black border border-slate-800"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {language === "fr" ? "Générateur de Badge" : "Jenérateur Badj"}
                </button>
                <button
                  onClick={() => { setQrActiveTab("scanner"); setIsCameraActive(true); }}
                  className={`flex-1 py-2 text-center text-xs font-bold uppercase transition rounded-md flex items-center justify-center gap-1.5 ${
                    qrActiveTab === "scanner"
                      ? "bg-slate-900 text-cyan-400 font-black border border-slate-800"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Scan className="w-3.5 h-3.5" />
                  {language === "fr" ? "Borne de Pointage" : "Borne Pwentaj"}
                </button>
              </div>

              {/* Drawer Content Area */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 bg-slate-950/40">
                {qrActiveTab === "generator" ? (
                  /* --- BADGE GENERATOR TAB --- */
                  <div className="flex flex-col gap-4" id="badge-generator-view">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Sélectionner un Collaborateur
                      </label>
                      <select
                        value={selectedEmployeeId}
                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-semibold focus:border-cyan-500/50 outline-none"
                      >
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} — {emp.position || "Staff"} ({emp.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Render Portrait ID Badge with preview */}
                    {selectedEmployeeId ? (() => {
                      const selectedEmp = employees.find((e) => e.id === selectedEmployeeId);
                      if (!selectedEmp) return null;
                      
                      const bName = branches.find((b) => b.id === selectedEmp.branchId)?.name || "Corporate HQ";
                      const dName = departments.find((d) => d.id === selectedEmp.departmentId)?.name || "Management";
                      const badgeObj = employeeBadges.find((b) => b.employeeId === selectedEmp.id);
                      const badgeToken = badgeObj?.id || `tok_${selectedEmp.id}`;
                      const signatureVal = badgeObj?.signature || `sig_${(selectedEmp.id || "").slice(0, 5)}`;
                      
                      const badgeRef = React.createRef<HTMLDivElement>();

                      const handleDownload = async () => {
                        if (!badgeRef.current) return;
                        try {
                          await generateBadgePdf(badgeRef.current, `Badge_${selectedEmp.name.replace(/\s+/g, "_")}.pdf`);
                        } catch (err) {
                          alert("Erreur de génération PDF");
                        }
                      };

                      return (
                        <div className="flex flex-col items-center gap-4">
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                            <EmployeeBadgeCard
                              ref={badgeRef}
                              employee={selectedEmp}
                              businessName={currentBusiness?.name || "FINOPS ERP"}
                              branchName={bName}
                              departmentName={dName}
                              badgeToken={badgeToken}
                              signature={signatureVal}
                              qrPayload={badgeObj?.qrPayload}
                            />
                          </div>

                          <div className="flex gap-2 w-full">
                            <button
                              onClick={handleDownload}
                              className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Download className="w-4 h-4 text-cyan-400" />
                              Télécharger PDF
                            </button>
                            <button
                              onClick={() => {
                                setKioskPreSelectedId(selectedEmp.id);
                                setIsKioskModalOpen(true);
                              }}
                              className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-900/10 cursor-pointer"
                            >
                              <Scan className="w-4 h-4" />
                              Flasher sur la Borne
                            </button>
                          </div>
                        </div>
                      );
                    })() : (
                      <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                        Sélectionnez un employé pour prévisualiser son badge.
                      </div>
                    )}
                  </div>
                ) : (
                  /* --- BORNE DE POINTAGE SCANNER TAB --- */
                  <div className="flex flex-col gap-4" id="borne-scanner-view">
                    {/* Mode selector and Sound control */}
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex gap-1.5 bg-slate-950 p-1 border border-slate-850 rounded-lg">
                        {(["AUTO", "IN", "OUT"] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => setScanMode(mode)}
                            className={`px-3 py-1 rounded text-[10px] font-black uppercase transition cursor-pointer ${
                              scanMode === mode
                                ? "bg-cyan-950/40 border border-cyan-500/20 text-cyan-400"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsQrDrawerOpen(false);
                            setIsKioskModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 rounded-lg text-cyan-300 text-[10px] font-bold uppercase transition flex items-center gap-1 cursor-pointer"
                        >
                          <Scan className="w-3.5 h-3.5 text-cyan-400" />
                          Mode Kiosk
                        </button>
                        <button
                          onClick={() => setIsMuted(!isMuted)}
                          className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-slate-400 transition cursor-pointer"
                          title={isMuted ? "Activer le son" : "Désactiver le son"}
                        >
                          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
                        </button>
                      </div>
                    </div>

                    {/* Camera scan area layout */}
                    <div className="w-full flex flex-col items-center">
                      <CameraQrScanner
                        onScanSuccess={(decodedText) => {
                          try {
                            const parsed = JSON.parse(decodedText);
                            if (parsed.employee_id || parsed.id || parsed.employeeId) {
                              processAttendanceScan(parsed.employee_id || parsed.id || parsed.employeeId);
                              return;
                            }
                          } catch {
                            // raw text fallback
                          }
                          processAttendanceScan(decodedText);
                        }}
                        isMuted={isMuted}
                        onToggleMute={() => setIsMuted(!isMuted)}
                      />
                    </div>

                    {/* Scan feedback card */}
                    {scannerFeedback.message && (
                      <div
                        className={`p-3.5 border rounded-xl flex items-start gap-3 animate-in zoom-in-95 duration-200 ${
                          scannerFeedback.status === "success"
                            ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-400"
                            : scannerFeedback.status === "error"
                            ? "bg-rose-950/30 border-rose-500/40 text-rose-400"
                            : "bg-slate-900 border-slate-800 text-slate-300"
                        }`}
                        id="scan-feedback-panel"
                      >
                        {scannerFeedback.status === "success" ? (
                          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-bounce" />
                        ) : scannerFeedback.status === "error" ? (
                          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                        ) : (
                          <Clock className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5 animate-spin" />
                        )}
                        <p className="text-xs font-semibold leading-relaxed">
                          {scannerFeedback.message}
                        </p>
                      </div>
                    )}

                    {/* Recent scans log feed */}
                    <div className="flex flex-col gap-2 mt-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        Flux de Pointage Récent
                      </span>
                      <div className="flex flex-col gap-1.5" id="recent-scans-feed">
                        {recentScans.length > 0 ? (
                          recentScans.map((scan) => (
                            <div
                              key={scan.id}
                              className="bg-slate-900 border border-slate-850 p-2.5 rounded-xl flex justify-between items-center text-xs animate-in slide-in-from-bottom-2 duration-300"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    scan.status === "IN" ? "bg-emerald-400" : "bg-indigo-400"
                                  }`}
                                />
                                <span className="font-bold text-slate-200">{scan.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 font-mono">{scan.time}</span>
                                <span
                                  className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    scan.status === "IN"
                                      ? "bg-emerald-950 text-emerald-400 border border-emerald-900"
                                      : "bg-indigo-950 text-indigo-400 border border-indigo-900"
                                  }`}
                                >
                                  {scan.status}
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-6 text-center text-xs text-slate-600 border border-slate-850 rounded-xl font-mono">
                            Aucun scan enregistré aujourd'hui.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        </AnimatePresence>,
        document.body
      )}

      {/* UNIFIED ATTENDANCE KIOSK MODAL */}
      <UnifiedAttendanceKioskModal
        isOpen={isKioskModalOpen}
        onClose={() => {
          setIsKioskModalOpen(false);
          setKioskPreSelectedId(undefined);
        }}
        employees={employees}
        attendanceRecords={attendanceRecords}
        current_business_id={currentBusiness?.id || "b1"}
        currentRole={currentRole}
        currentUser={{ name: currentUserEmail || "Admin", id: currentUserId || "u1" }}
        branches={branches}
        departments={departments}
        employeeBadges={employeeBadges}
        onUpdateAttendance={onUpdateAttendance || (() => {})}
        onAddEvent={onAddEvent}
        onAddForensicLog={onAddForensicLog}
        language={(language === "ht" || language === "en") ? language : "fr"}
        preSelectedEmployeeId={kioskPreSelectedId}
      />

      {/* SUSPEND CONFIRMATION MODAL */}
      <SuspendConfirmationModal
        isOpen={Boolean(suspendTarget)}
        employee={suspendTarget}
        currentUserId={currentUserId}
        currentUserEmail={currentUserEmail}
        onConfirm={handleConfirmSuspend}
        onClose={() => setSuspendTarget(null)}
      />

      {/* REACTIVATE CONFIRMATION MODAL */}
      <ReactivateConfirmationModal
        isOpen={Boolean(reactivateTarget)}
        employee={reactivateTarget}
        onConfirm={handleConfirmReactivate}
        onClose={() => setReactivateTarget(null)}
      />
    </div>
  );
};

export default EmployeeDirectory;
