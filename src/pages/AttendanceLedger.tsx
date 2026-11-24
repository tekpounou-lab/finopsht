import React, { useState, useEffect, useCallback, useRef } from 'react';
import { queueAttendanceLog } from '../lib/offlineSync';
import { AttendanceRepository } from '../repositories/AttendanceRepository';
import { Employee, AttendanceRecord, ERPEvent, ForensicLog, Role, EmployeeBadge, Branch, Department } from '../types';
import { useI18n } from '../i18n';
import AttendanceHeader from '../components/attendance/AttendanceHeader';
import FilterToolbar from '../components/attendance/FilterToolbar';
import AttendanceGrid from '../components/attendance/AttendanceGrid';
import LiveMonitor from '../components/attendance/LiveMonitor';
import AttendanceOverrideDialog from '../components/attendance/AttendanceOverrideDialog';
import { AttendanceFilterParams } from '../components/attendance/types';
import MassImportModal from '../components/attendance/MassImportModal';
import { generateSignature, getLocalIP } from '../data';
import { hasPermission } from '../permissions/role.permissions';
import { Fingerprint, AlertTriangle, ShieldX, Scan, Upload, Trash2, User, Search, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CameraQrScanner from '../components/attendance/CameraQrScanner';
import { UnifiedAttendanceKioskModal } from '../components/attendance/UnifiedAttendanceKioskModal';
import { ReferenceResolver } from '../services/ReferenceResolver';
import * as xlsx from 'xlsx';
import { format } from 'date-fns';
import { auth } from "../lib/firebase";
import { toast } from 'sonner';
import { calculateAttendanceVariance, getDeviceLocalDate, getDeviceLocalTime, getDeviceMetadata, normalizeDateStr, findEmployeeByQrPayload, findAttendanceRecordForEmployee } from '../lib/attendanceSSOT';
import { authorizeAttendanceAction } from '../domains/attendance/AttendanceAuthorizationService';
import {
  resolveClientAuthenticatedActor,
  toTrustedAttendanceTarget,
  verifyScannedBadgeSecurity
} from '../domains/attendance/clientActorResolver';

interface AttendanceLedgerProps {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  branches: Branch[];
  departments: Department[];
  currentRole: Role;
  currentUser?: { name: string; id: string };
  current_business_id: string;
  currentBranchId: string | null;
  isOffline: boolean;
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  onUpdateAttendance: (records: AttendanceRecord[]) => void;
  employeeBadges?: EmployeeBadge[];
  initialMassImportOpen?: boolean;
  onResetInitialMassImportOpen?: () => void;
}

export default function AttendanceLedger({
  employees,
  attendanceRecords,
  branches,
  departments,
  currentRole,
  currentUser,
  current_business_id,
  currentBranchId,
  isOffline,
  onAddEvent,
  onAddForensicLog,
  onUpdateAttendance,
  employeeBadges = [],
  initialMassImportOpen = false,
  onResetInitialMassImportOpen
}: AttendanceLedgerProps) {
  const { t, language } = useI18n();

  const allowedRoles = ["OWNER", "DIRECTOR", "MANAGER", "SUPERVISOR", "SUPER_ADMIN"];
  const normalizedRole = currentRole ? currentRole.toUpperCase() : "";

  // Optimistic Local State for Attendance Records
  const [localAttendanceRecords, setLocalAttendanceRecords] = useState<AttendanceRecord[]>(attendanceRecords || []);

  useEffect(() => {
    if (!attendanceRecords) return;
    setLocalAttendanceRecords(prev => {
      const map = new Map<string, AttendanceRecord>();
      // Put incoming props (Firestore state)
      attendanceRecords.forEach(r => map.set(r.id, r));
      // Keep any local optimistic records not yet in Firestore prop
      prev.forEach(r => {
        if (!map.has(r.id)) {
          map.set(r.id, r);
        }
      });
      return Array.from(map.values());
    });
  }, [attendanceRecords]);

  const handleLocalUpdateAttendance = useCallback((updatedList: AttendanceRecord[]) => {
    setLocalAttendanceRecords(prev => {
      const map = new Map<string, AttendanceRecord>();
      prev.forEach(r => map.set(r.id, r));
      updatedList.forEach(r => map.set(r.id, r));
      return Array.from(map.values());
    });
    // Immediately clear date filters if records were added so they are visible
    setFilters(prev => ({
      ...prev,
      date: '',
      endDate: '',
      search: '',
      status: 'ALL'
    }));
    onUpdateAttendance(updatedList);
  }, [onUpdateAttendance]);

  // Realtime Filter State
  const [filters, setFilters] = useState<AttendanceFilterParams>({
    branchId: 'ALL',
    departmentId: 'ALL',
    employeeId: 'ALL',
    date: '',
    endDate: '',
    status: 'ALL',
    search: ''
  });

  // Modal / Override State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isGlobalOverrideOpen, setIsGlobalOverrideOpen] = useState(false);
  const [isMassImportOpen, setIsMassImportOpen] = useState(false);
  
  // Selection State for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>("NORMAL");
  const [overrideHours, setOverrideHours] = useState<number>(8);
  const [overrideReason, setOverrideReason] = useState<string>("");

  // Scan HUD state
  const [scannedQrString, setScannedQrString] = useState<string>("");
  const [empSearchQuery, setEmpSearchQuery] = useState<string>("");
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState<boolean>(false);
  const [scannerFeedback, setScannerFeedback] = useState<{status: string, message: string}>({status: "idle", message: ""});
  const [isCameraActive, setIsCameraActive] = useState(false);
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  
  // New State for Audio & Recent Scans
  const [isMuted, setIsMuted] = useState(false);
  const [recentScans, setRecentScans] = useState<{ id: string, name: string, time: string, status: 'IN' | 'OUT' | 'ERROR' }[]>([]);

  useEffect(() => {
    if (initialMassImportOpen) {
      setIsMassImportOpen(true);
      if (onResetInitialMassImportOpen) {
        onResetInitialMassImportOpen();
      }
    }
  }, [initialMassImportOpen, onResetInitialMassImportOpen]);

  const addRecentScan = (name: string, status: 'IN' | 'OUT' | 'ERROR') => {
    setRecentScans(prev => {
      const newScan = { id: Math.random().toString(), name, time: new Date().toLocaleTimeString(), status };
      return [newScan, ...prev].slice(0, 3);
    });
  };

  const playBeep = (type: 'success' | 'error') => {
    if (isMuted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type === 'success' ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(type === 'success' ? 880 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      // AudioContext might be blocked or unsupported
    }
  };

  // Helper to normalize dates for comparison (handles DD/MM/YYYY, YYYY-MM-DD, ISO strings, Firestore Timestamps, Date objects, single-digit padding)
  const normalizeDateStr = (dInput: any): string => {
    if (!dInput) return "";
    let str = dInput;
    if (typeof dInput !== "string") {
      if (dInput.toDate && typeof dInput.toDate === "function") {
        str = getDeviceLocalDate(dInput.toDate());
      } else if (typeof dInput === "number") {
        str = getDeviceLocalDate(new Date(dInput));
      } else if (dInput instanceof Date) {
        str = getDeviceLocalDate(dInput);
      } else {
        str = String(dInput);
      }
    }
    const trimmed = String(str).trim();
    if (!trimmed) return "";
    
    // ISO string with T: e.g. 2026-08-27T19:00:00Z
    if (trimmed.includes("T")) {
      return trimmed.split("T")[0];
    }
    // DD/MM/YYYY or D/M/YYYY or DD-MM-YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(trimmed)) {
      const p = trimmed.split(/[-/]/);
      return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
    // YYYY-M-D or YYYY/M/D or YYYY-MM-DD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
      const p = trimmed.split(/[-/]/);
      return `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`;
    }
    return trimmed;
  };

  // Derived filtered data following SSOT
  const filteredRecords = localAttendanceRecords.filter((rec) => {
    const emp = findEmployeeByQrPayload(rec.employeeId, employees) || employees.find(
      (e) =>
        e.id === rec.employeeId ||
        (rec.employeeId && String(e.id).toLowerCase() === String(rec.employeeId).toLowerCase()) ||
        String((e as any).user_uid) === String(rec.employeeId) ||
        String((e as any).employee_id) === String(rec.employeeId) ||
        String((e as any).badgeNumber) === String(rec.employeeId) ||
        String((e as any).code) === String(rec.employeeId) ||
        (e.name && rec.employeeName && e.name.toLowerCase() === rec.employeeName.toLowerCase())
    );

    // Multi-tenant business isolation
    const recBizId = rec.business_id || (rec as any).businessId || (emp ? emp.business_id : "");
    if (recBizId && current_business_id && recBizId !== current_business_id) {
      return false;
    }
    
    // Auth context filter (Manager can only see own branch if assigned AND branch filter is not set to ALL)
    const recBranchId = rec.branchId || (rec as any).branch_id || emp?.branchId;
    if (
      filters.branchId !== 'ALL' &&
      currentBranchId && 
      recBranchId && 
      recBranchId !== currentBranchId && 
      recBranchId !== "BRANCH_DEFAULT" && 
      currentBranchId !== "BRANCH_DEFAULT"
    ) {
      return false;
    }
    
    // UI Branch Filter
    if (filters.branchId !== 'ALL') {
      const recBranchId = rec.branchId || (rec as any).branch_id || emp?.branchId || "BRANCH_DEFAULT";
      if (recBranchId !== filters.branchId) {
        return false;
      }
    }

    // UI Department Filter
    if (filters.departmentId !== 'ALL') {
      const recDeptId = rec.departmentId || (rec as any).department_id || emp?.departmentId || "DEPT_DEFAULT";
      if (recDeptId !== filters.departmentId) {
        return false;
      }
    }

    // UI Employee Filter
    if (filters.employeeId && filters.employeeId !== 'ALL') {
      const matchesEmp = 
        rec.employeeId === filters.employeeId ||
        (rec as any).employee_id === filters.employeeId ||
        emp?.id === filters.employeeId ||
        (emp as any)?.user_uid === filters.employeeId;
      if (!matchesEmp) {
        return false;
      }
    }

    // Check Date Range Filter
    if (filters.date || filters.endDate) {
      const rawDate = rec.date || (rec as any).attendance_date || (rec as any).date_presence || (rec as any).date_pointage || (rec as any).effective_date || (rec as any).timestamp || (rec as any).createdAt || (rec as any).created_at;
      const recDateStr = normalizeDateStr(rawDate);
      const fDate = normalizeDateStr(filters.date);
      const eDate = normalizeDateStr(filters.endDate);
      if (!recDateStr) return false;
      if (fDate && eDate) {
        if (recDateStr < fDate || recDateStr > eDate) return false;
      } else if (fDate) {
        if (recDateStr < fDate) return false;
      } else if (eDate) {
        if (recDateStr > eDate) return false;
      }
    }
    
    // Quick status mapping
    if (filters.status !== 'ALL') {
      const recStatus = String(rec.status || "").toUpperCase();
      const hasWorked = Boolean(rec.realHours && Number(rec.realHours) > 0);
      const isCheckedIn = Boolean(rec.checkIn);
      const isPresent = isCheckedIn || hasWorked;
      
      const isNormal = 
        recStatus === 'NORMAL' || 
        recStatus === 'PRESENT' || 
        recStatus === 'PRÉSENT' || 
        recStatus === 'COMPLETED' || 
        recStatus === 'VALIDE' || 
        recStatus === 'VALIDATED' || 
        recStatus === 'ACTIVE' || 
        recStatus === 'PENDING_VERIFICATION' || 
        (isPresent && recStatus !== 'LATE' && recStatus !== 'ABSENT');

      if (filters.status === 'NORMAL') {
        if (!isNormal) return false;
      } else if (filters.status === 'LATE') {
        if (recStatus !== 'LATE') return false;
      } else if (filters.status === 'ABSENT') {
        if (recStatus !== 'ABSENT' || isPresent) return false;
      } else if (recStatus !== filters.status.toUpperCase()) {
        return false;
      }
    }

    if (filters.search) {
      const sq = filters.search.toLowerCase().trim();
      const name = (emp?.name || rec.employeeName || (rec as any).name || "").toLowerCase();
      const id = (rec.employeeId || "").toLowerCase();
      const badge = String((emp as any)?.badgeNumber || (rec as any).badgeNumber || "").toLowerCase();
      const reg = String((emp as any)?.registrationNumber || (emp as any)?.code || "").toLowerCase();
      if (!name.includes(sq) && !id.includes(sq) && !badge.includes(sq) && !reg.includes(sq)) return false;
    }

    return true;
  }).sort((a, b) => {
    const dateA = normalizeDateStr(a.date);
    const dateB = normalizeDateStr(b.date);
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const timeA = a.checkIn || "";
    const timeB = b.checkIn || "";
    return timeB.localeCompare(timeA);
  });

  const hasActiveFilters = Boolean(
    filters.branchId !== 'ALL' ||
    filters.departmentId !== 'ALL' ||
    (filters.employeeId && filters.employeeId !== 'ALL') ||
    filters.status !== 'ALL' ||
    Boolean(filters.search && filters.search.trim()) ||
    Boolean(filters.date) ||
    Boolean(filters.endDate)
  );

  const todayLocal = getDeviceLocalDate(new Date());
  const onlineCount = attendanceRecords.filter(r => (r.date === todayLocal || r.date === new Date().toISOString().split('T')[0]) && r.checkIn && !r.checkOut).length;
  const complianceScore = filteredRecords.length > 0 
    ? Math.round((filteredRecords.filter(a => a.status === 'NORMAL' || a.status === 'OVERTIME').length / filteredRecords.length) * 100)
    : 100;

  // Robust Secure QR / Barcode / Token Scanner
  const processSecureScan = useCallback((mode: "IN" | "OUT" | "AUTO", qrString?: string) => {
    const payloadToProcess = (qrString || scannedQrString || "").trim();
    setScannerFeedback({ status: "idle", message: "" });

    if (!payloadToProcess) {
      playBeep('error');
      setScannerFeedback({
        status: "error",
        message: language === "fr" ? "Veuillez entrer ou scanner une charge utile de badge QR." : language === "ht" ? "Tanpri antre oswa skane yon kòd QR badge." : "Please enter or scan a QR badge payload."
      });
      return;
    }

    // Debounce duplicate camera trigger within 2.5 seconds
    const nowTs = Date.now();
    if (lastScannedCodeRef.current.code === payloadToProcess && (nowTs - lastScannedCodeRef.current.time) < 2500) {
      return;
    }
    lastScannedCodeRef.current = { code: payloadToProcess, time: nowTs };

    try {
      let employeeId = "";
      let businessId = "";
      let branchId = "";
      let role = "";
      let signature = "";

      // 1. Attempt JSON, Base64 JSON, or delimited payload parse
      try {
        let rawToParse = payloadToProcess.trim();
        if (rawToParse.startsWith("ey") && rawToParse.length > 20) {
          try {
            rawToParse = atob(rawToParse);
          } catch {}
        }
        const payloadObj = JSON.parse(rawToParse);
        if (typeof payloadObj === "object" && payloadObj !== null) {
          employeeId = String(payloadObj.employee_id || payloadObj.employeeId || payloadObj.id || payloadObj.empId || payloadObj.userId || "").trim();
          businessId = String(payloadObj.business_id || payloadObj.businessId || "").trim();
          branchId = String(payloadObj.branch_id || payloadObj.branchId || "").trim();
          role = String(payloadObj.role || "").trim();
          signature = String(payloadObj.signature || "").trim();
        } else if (typeof payloadObj === "string" || typeof payloadObj === "number") {
          employeeId = String(payloadObj).trim();
        }
      } catch {
        // Plain string or delimited fallback
        if (payloadToProcess.includes("::")) {
          const parts = payloadToProcess.split("::");
          if (parts[0] === "FINOPS" || parts[0] === "BADGE") {
            employeeId = parts[1] || "";
            businessId = parts[2] || "";
            signature = parts[3] || "";
          } else if (parts[0] === "HMAC") {
            employeeId = parts[1] || "";
          }
        } else {
          employeeId = payloadToProcess.replace(/^HMAC::/i, "").trim();
        }
      }

      if (!employeeId) {
        employeeId = payloadToProcess.trim();
      }

      // Look up employee in current business
      const emp = findEmployeeByQrPayload(employeeId, employees);

      if (!emp) {
        playBeep('error');
        addRecentScan("INCONNU", "ERROR");
        setScannerFeedback({
          status: "error",
          message: language === "fr" 
            ? `Identité non reconnue ("${employeeId.substring(0, 24)}"). Employé introuvable.` 
            : `Unrecognized identity ("${employeeId.substring(0, 24)}"). Employee not found.`
        });
        return;
      }

      // Tenant isolation & badge signature security verification
      const activeBadge = employeeBadges.find((b) => b.employeeId === emp.id && (b as any).status === "ACTIVE")
        || employeeBadges.find((b) => b.employeeId === emp.id);
      const badgeSec = verifyScannedBadgeSecurity({
        emp,
        activeBadge,
        allEmployeeBadges: employeeBadges,
        signature,
        payloadBusinessId: businessId,
        currentBusinessId: current_business_id,
        requireSignature: true
      });
      if (!badgeSec.valid) {
        onAddForensicLog({
          id: "f_sec_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: currentUser?.id || "sys_kiosk",
          userName: currentUser?.name || "Borne Entrée Sécurisée",
          userRole: currentRole || "UNKNOWN",
          business_id: current_business_id || emp.business_id || "global",
          action: `ATTENDANCE_${badgeSec.reasonCode || "SECURITY_REJECTED"}`,
          beforeState: JSON.stringify({ current_business_id }),
          afterState: JSON.stringify({ attemptedPayload: payloadToProcess, targetEmp: emp.id }),
          ipAddress: getLocalIP(),
          userAgent: window.navigator.userAgent,
          signature: "threat_seal_" + Math.random().toString(36).substring(2, 8)
        });
        playBeep('error');
        addRecentScan(emp.name || "INCONNU", "ERROR");
        setScannerFeedback({
          status: "breach",
          message: badgeSec.message || "Validation de sécurité du badge refusée."
        });
        return;
      }

      const now = new Date();
      const devMeta = getDeviceMetadata();
      const timeStr = getDeviceLocalTime(now); 
      const dateStr = getDeviceLocalDate(now); 
      
      const exists = findAttendanceRecordForEmployee(emp, attendanceRecords, dateStr);
      let targetMode = mode;
      
      if (targetMode === "AUTO") {
        targetMode = (exists && exists.checkIn && !exists.checkOut) ? "OUT" : "IN";
      }

      const authenticatedActor = resolveClientAuthenticatedActor({
        currentUser,
        currentRole,
        currentBusinessId: current_business_id,
        employees
      });
      const authDecision = authorizeAttendanceAction({
        action: targetMode === "IN" ? "check_in" : "check_out",
        actor: authenticatedActor,
        targetEmployee: toTrustedAttendanceTarget(emp),
        claimedBusinessId: current_business_id
      });
      if (!authDecision.allowed) {
        onAddForensicLog({
          id: "f_rbac_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: authenticatedActor.uid || "UNKNOWN",
          userName: authenticatedActor.displayName || "Operator",
          userRole: String(authDecision.canonicalRole || authenticatedActor.role || "UNKNOWN"),
          business_id: current_business_id || emp.business_id || "global",
          action: `ATTENDANCE_RBAC_DENIED_${authDecision.code}`,
          beforeState: JSON.stringify({ targetEmp: emp.id, targetBranch: emp.branchId }),
          afterState: JSON.stringify({ code: authDecision.code, reason: authDecision.reason }),
          ipAddress: getLocalIP(),
          userAgent: window.navigator.userAgent,
          signature: "rbac_seal_" + Math.random().toString(36).substring(2, 8)
        });
        playBeep('error');
        addRecentScan(emp.name, "ERROR");
        setScannerFeedback({
          status: "breach",
          message: authDecision.reason
        });
        return;
      }

      const repoActorPayload = {
        id: authenticatedActor.uid,
        name: authenticatedActor.displayName || authenticatedActor.email || authenticatedActor.uid,
        role: String(authDecision.canonicalRole || authenticatedActor.role || ""),
        businessId: authenticatedActor.business_id || current_business_id,
        branchId: authenticatedActor.branchId || undefined,
        departmentId: authenticatedActor.departmentId || undefined,
        employeeId: authenticatedActor.employeeId || undefined,
        authorizedBranchIds: authenticatedActor.authorizedBranchIds || undefined,
        authorizedDepartmentIds: authenticatedActor.authorizedDepartmentIds || undefined,
        authorizedTeamIds: authenticatedActor.authorizedTeamIds || undefined,
        explicitAttendanceDelegation: authenticatedActor.explicitAttendanceDelegation,
        isSuperAdmin: authenticatedActor.isSuperAdmin
      };

      if (targetMode === "IN") {
        if (exists && exists.checkIn) {
          playBeep('error');
          setScannerFeedback({
            status: "error",
            message: language === "fr" 
              ? `Pointage d'arrivée déjà enregistré à ${exists.checkIn} pour ${emp.name}.` 
              : `Check-in already registered at ${exists.checkIn} for ${emp.name}.`
          });
          return;
        }

        AttendanceRepository.checkIn({
          employeeId: emp.id,
          businessId: authDecision.canonicalBusinessId || emp.business_id || current_business_id,
          branchId: emp.branchId || branchId || "BRANCH_DEFAULT",
          method: "QR",
          deviceId: devMeta.deviceId,
          location: "Borne Entrée Sécurisée",
          actor: repoActorPayload,
          deviceDate: dateStr,
          deviceTime: timeStr,
          deviceTimezone: devMeta.deviceTimezone,
          deviceInfo: devMeta.userAgent,
          badgeId: activeBadge?.id,
          qrSignature: signature || undefined,
          badgePayload: payloadToProcess
        }).then((session) => {
          const newRecord: AttendanceRecord = {
            id: session.sessionId,
            employeeId: session.employeeId,
            employeeName: emp.name,
            business_id: session.businessId || authDecision.canonicalBusinessId || current_business_id,
            branchId: session.branchId || emp.branchId || "BRANCH_DEFAULT",
            departmentId: emp.departmentId || "DEPT_DEFAULT",
            date: dateStr,
            checkIn: timeStr,
            checkOut: null,
            plannedHours: 8,
            realHours: 0,
            variance: -8,
            status: "NORMAL",
          };

          onUpdateAttendance([newRecord, ...attendanceRecords.filter(r => r.id !== newRecord.id)]);

          // Ensure filter displays today's scan if date filter was hiding it
          setFilters(prev => ({
            ...prev,
            date: dateStr,
            endDate: dateStr,
            search: ''
          }));

          toast.success(`Présence enregistrée avec succès pour ${emp.name} à ${timeStr}`);

          onAddEvent({
            id: "ev_" + Math.random().toString(36).substring(2, 9),
            timestamp: now.toISOString(),
            type: "ATTENDANCE",
            business_id: current_business_id,
            payload: { action: "SECURE_QR_CHECKIN", record: newRecord, employeeId: emp.id },
            status: "PROCESSED",
            retryCount: 0
          });

          playBeep('success');
          addRecentScan(emp.name, "IN");
          setScannerFeedback({
            status: "success",
            message: language === "fr" 
              ? `ENTRÉE VALIDÉE ✓ Bienvenue, ${emp.name}. Arrivée enregistrée à ${timeStr}.` 
              : `ENTRY VALIDATED ✓ Welcome, ${emp.name}. Checked in at ${timeStr}.`
          });
        }).catch((err: any) => {
          playBeep('error');
          setScannerFeedback({
            status: "error",
            message: err.message || "Échec de l'enregistrement de l'entrée."
          });
        });
      } else {
        // CHECK-OUT
        if (!exists || !exists.checkIn) {
          playBeep('error');
          setScannerFeedback({
            status: "error",
            message: language === "fr" 
              ? `Aucun pointage d'arrivée trouvé pour aujourd'hui pour ${emp.name}.` 
              : `No check-in found for today for ${emp.name}.`
          });
          return;
        }

        if (exists.checkOut) {
          playBeep('error');
          setScannerFeedback({
            status: "error",
            message: language === "fr" 
              ? `Sortie déjà enregistrée à ${exists.checkOut} pour ${emp.name}.` 
              : `Check-out already registered at ${exists.checkOut} for ${emp.name}.`
          });
          return;
        }

        AttendanceRepository.checkOut({
          sessionId: exists.id,
          employeeId: emp.id,
          businessId: authDecision.canonicalBusinessId || emp.business_id || current_business_id,
          method: "QR",
          actor: repoActorPayload,
          deviceId: devMeta.deviceId,
          deviceDate: dateStr,
          deviceTime: timeStr,
          deviceTimezone: devMeta.deviceTimezone,
          deviceInfo: devMeta.userAgent,
          badgeId: activeBadge?.id,
          qrSignature: signature || undefined,
          badgePayload: payloadToProcess
        }).then((session) => {
          const totalHours = session?.totalMinutes ? Number((session.totalMinutes / 60).toFixed(2)) : 8;
          const updated = attendanceRecords.map((r) => {
            if (r.id === exists.id || (r.employeeId === emp.id && r.date === dateStr)) {
              const variance = calculateAttendanceVariance(totalHours, r.plannedHours || 8);
              return {
                ...r,
                checkOut: timeStr,
                realHours: totalHours,
                variance,
                status: "NORMAL" as any
              };
            }
            return r;
          });

          onUpdateAttendance(updated);

          onAddEvent({
            id: "ev_" + Math.random().toString(36).substring(2, 9),
            timestamp: now.toISOString(),
            type: "ATTENDANCE",
            business_id: current_business_id,
            payload: { action: "SECURE_QR_CHECKOUT", recordId: exists.id, employeeId: emp.id },
            status: "PROCESSED",
            retryCount: 0
          });

          playBeep('success');
          addRecentScan(emp.name, "OUT");
          setScannerFeedback({
            status: "success",
            message: language === "fr" 
              ? `SORTIE COMPTABILISÉE ✓ Au revoir, ${emp.name}. Temps comptabilisé: ${totalHours}h.` 
              : `EXIT LOGGED ✓ Goodbye, ${emp.name}. Recorded time: ${totalHours}h.`
          });
        }).catch((err: any) => {
          playBeep('error');
          setScannerFeedback({
            status: "error",
            message: err.message || "Échec de l'enregistrement de la sortie."
          });
        });
      }

    } catch (err: any) {
      playBeep('error');
      addRecentScan("INCONNU", "ERROR");
      setScannerFeedback({
        status: "error",
        message: language === "fr" ? "Charge utile invalide." : "Invalid payload."
      });
    }
  }, [attendanceRecords, current_business_id, currentRole, currentUser, employees, isOffline, onAddEvent, onAddForensicLog, onUpdateAttendance, scannedQrString, employeeBadges, isMuted, language]);

  const handleOverrideSubmit = async () => {
    if (!overrideTarget || !overrideReason.trim()) return;

    if (!hasPermission(currentRole, "canOverrideAttendance")) {
      toast.error(language === "fr" ? "Droit refusé: Votre rôle ne dispose pas de la permission de corriger les temps." : language === "ht" ? "Aksè refize: Wòl ou pa pèmèt ou korije lè yo." : "Access denied: Your role does not have permission to correct time.");
      return;
    }

    const targetIndex = attendanceRecords.findIndex((r) => r.id === overrideTarget.id);
    if (targetIndex === -1) return;

    const resolvedActorId = auth?.currentUser?.uid || currentUser?.id || "";
    const resolvedActorName = currentUser?.name || auth?.currentUser?.displayName || currentRole;

    const updated = [...attendanceRecords];
    const oldState = JSON.stringify(updated[targetIndex]);

    const item = { ...updated[targetIndex] };
    item.status = overrideStatus as any;
    item.realHours = overrideHours;
    item.variance = calculateAttendanceVariance(overrideHours, item.plannedHours);
    item.overrideReason = overrideReason;
    item.overrideBy = currentRole;
    updated[targetIndex] = item;

    const newState = JSON.stringify(item);

    try {
      await AttendanceRepository.updateRecord(item.id, {
        employeeId: item.employeeId,
        business_id: item.business_id || current_business_id,
        branchId: item.branchId,
        departmentId: item.departmentId,
        date: item.date,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        plannedHours: item.plannedHours,
        status: item.status,
        realHours: item.realHours,
        variance: item.variance,
        overrideReason: item.overrideReason,
        overrideBy: item.overrideBy
      }, {
        id: resolvedActorId,
        name: resolvedActorName,
        role: currentRole,
        business_id: current_business_id
      });

      onUpdateAttendance(updated);
      onAddForensicLog({
        id: "f_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: resolvedActorId,
        userName: resolvedActorName,
        userRole: currentRole,
        business_id: current_business_id,
        action: "ATTENDANCE_OVERRIDE",
        beforeState: oldState,
        afterState: newState,
        ipAddress: getLocalIP(),
        userAgent: window.navigator.userAgent,
        signature: generateSignature({ oldState, newState }),
      });

      setOverrideTarget(null);
      setOverrideReason("");
    } catch (e: any) {
      console.error("[AttendanceLedger] Repository update failed:", e);
      toast.error(e?.message || (language === "fr" ? "Erreur de synchronisation Firebase." : "Firebase sync error."));
    }
  };

  const handleGlobalOverrideSave = async (newRecord: AttendanceRecord, reason: string) => {
    const resolvedActorId = auth?.currentUser?.uid || currentUser?.id || "";
    const resolvedActorName = currentUser?.name || auth?.currentUser?.displayName || currentRole;

    try {
      await AttendanceRepository.updateRecord(newRecord.id, {
        ...newRecord,
        business_id: newRecord.business_id || current_business_id,
        overrideReason: reason,
        overrideBy: currentRole
      }, {
        id: resolvedActorId,
        name: resolvedActorName,
        role: currentRole,
        business_id: current_business_id
      });

      const existingIndex = attendanceRecords.findIndex(r => r.id === newRecord.id);
      if (existingIndex >= 0) {
        const updated = [...attendanceRecords];
        updated[existingIndex] = newRecord;
        onUpdateAttendance(updated);
      } else {
        onUpdateAttendance([newRecord, ...attendanceRecords]);
      }
    } catch (e: any) {
      console.error("[AttendanceLedger] Global repository update failed:", e);
      toast.error(e?.message || "Global Sync Error");
      throw e;
    }
  };

  const handleRecalculate = async () => {
    if (currentRole !== 'OWNER' && currentRole !== 'MANAGER') {
      toast.error("Droits insuffisants.");
      return;
    }
    const resolvedActorId = auth?.currentUser?.uid || currentUser?.id || "";
    const resolvedActorName = currentUser?.name || auth?.currentUser?.displayName || currentRole;

    const updated = attendanceRecords.map(rec => {
      if (rec.overrideBy) return rec; // Ne pas toucher aux dérogations
      if (!rec.checkOut) return rec;

      const [inH, inM, inS] = rec.checkIn.split(":").map(Number);
      const [outH, outM, outS] = rec.checkOut.split(":").map(Number);
      const hoursClocked = Math.round(((outH * 3600 + outM * 60 + outS) - (inH * 3600 + inM * 60 + inS)) / 360) / 10;
      
      const variance = calculateAttendanceVariance(hoursClocked, rec.plannedHours);
      const status = "NORMAL";

      return {
        ...rec,
        realHours: hoursClocked,
        variance,
        status: status as any
      };
    });

    // Persist recalculated records via server API before committing React state
    try {
      for (const rec of updated) {
        if (rec.overrideBy || !rec.checkOut) continue;
        await AttendanceRepository.updateRecord(rec.id, {
          employeeId: rec.employeeId,
          date: rec.date,
          checkIn: rec.checkIn,
          checkOut: rec.checkOut,
          plannedHours: rec.plannedHours,
          realHours: rec.realHours,
          variance: rec.variance,
          status: rec.status,
          business_id: rec.business_id || current_business_id,
          overrideReason: "Recalcul automatique des heures effectuées"
        }, {
          id: resolvedActorId,
          name: resolvedActorName,
          role: currentRole,
          business_id: current_business_id
        });
      }
      onUpdateAttendance(updated);
    } catch (e: any) {
      console.error("[AttendanceLedger] Recalculate sync error:", e);
      toast.error(e?.message || "Erreur lors de la synchronisation du recalcul.");
      return;
    }
    
    onAddForensicLog({
      id: `fLog_${Math.random().toString(36).substr(2,9)}`,
      timestamp: new Date().toISOString(),
      userId: resolvedActorId,
      userName: resolvedActorName,
      userRole: currentRole,
      business_id: current_business_id,
      action: "ATTENDANCE_RECALCULATED",
      beforeState: "{}",
      afterState: `{"count": ${updated.length}}`,
      ipAddress: getLocalIP(),
      userAgent: window.navigator.userAgent,
      signature: generateSignature({ action: "RECALCULATE", count: updated.length })
    });
    
    toast.success(language === "fr" ? "Variances recalculées et synchronisées dans Firestore (SSOT)." : language === "ht" ? "Diferans lè yo re-kalkile epi senkronize nan Firestore (SSOT)." : "Variances recalculated and synced to Firestore (SSOT).");
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (filteredRecords.length === 0) return;
    if (selectedIds.length === filteredRecords.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredRecords.map(r => r.id));
    }
  };

  const confirmDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const resolvedActorId = auth?.currentUser?.uid || currentUser?.id || "";
    const resolvedActorName = currentUser?.name || auth?.currentUser?.displayName || currentRole;
    setIsDeleting(true);
    try {
      await AttendanceRepository.batchDeleteRecords(
        selectedIds,
        { uid: resolvedActorId, name: resolvedActorName, business_id: current_business_id },
        current_business_id
      );
      onUpdateAttendance(attendanceRecords.filter(r => !selectedIds.includes(r.id)));
      toast.success(language === "fr" ? `${selectedIds.length} pointage(s) supprimé(s).` : `${selectedIds.length} record(s) deleted.`);
      setSelectedIds([]); // Clear selection
      setIsDeleteConfirmOpen(false); // Close modal
      onAddForensicLog({
        id: `fLog_${Math.random().toString(36).substr(2,9)}`,
        timestamp: new Date().toISOString(),
        userId: resolvedActorId,
        userName: resolvedActorName,
        userRole: currentRole,
        business_id: current_business_id,
        action: "ATTENDANCE_BATCH_DELETED",
        beforeState: `{"selectedCount": ${selectedIds.length}}`,
        afterState: "{}",
        ipAddress: getLocalIP(),
        userAgent: navigator.userAgent,
        signature: generateSignature({ action: "DELETE", count: selectedIds.length })
      });
    } catch (err: any) {
      console.error("Failed to delete records:", err);
      toast.error(err?.message || "Erreur lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      toast.error(language === "fr" ? "Aucune donnée à exporter." : language === "ht" ? "Pa gen okenn done pou ekspòte." : "No data to export.");
      return;
    }

    const exportData = filteredRecords.map(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      const br = branches.find(b => b.id === s.branchId);
      const dp = departments.find(d => d.id === s.departmentId);
      
      return {
        'Date': s.date,
        'Employé': emp ? emp.name : s.employeeId,
        'Début': s.checkIn || 'N/A',
        'Fin': s.checkOut || 'N/A',
        'Heures Prévues': s.plannedHours,
        'Heures Effectuées': s.realHours,
        'Variance': s.variance,
        'Succursale': br ? br.name : s.branchId,
        'Département': dp ? dp.name : s.departmentId,
        'Statut': s.status,
        'Note / Overridden Par': s.overrideBy || ''
      };
    });

    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Présences");

    const range = xlsx.utils.decode_range(ws['!ref'] as string);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = xlsx.utils.encode_col(C) + "1";
      if (!ws[address]) continue;
      ws[address].v = String(ws[address].v).toUpperCase();
    }
    
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    xlsx.writeFile(wb, `finops-presences-${dateStr}.xlsx`);
    
    const resolvedActorId = auth?.currentUser?.uid || currentUser?.id || "";
    const resolvedActorName = currentUser?.name || auth?.currentUser?.displayName || currentRole;
    onAddForensicLog({
      id: `fLog_${Math.random().toString(36).substr(2,9)}`,
      timestamp: new Date().toISOString(),
      userId: resolvedActorId,
      userName: resolvedActorName,
      userRole: currentRole,
      business_id: current_business_id,
      action: "ATTENDANCE_EXPORTED",
      beforeState: "{}",
      afterState: `{"exportedRecords": ${exportData.length}}`,
      ipAddress: getLocalIP(),
      userAgent: navigator.userAgent,
      signature: generateSignature({ action: "EXPORT", count: exportData.length })
    });
  };

  if (!allowedRoles.includes(normalizedRole)) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
          <ShieldX className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Accès Non Autorisé</h2>
        <p className="text-sm text-slate-400 max-w-md">
          Cette page est réservée uniquement aux Managers, Supervisors et Propriétaires d'entreprise.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 font-sans animate-in fade-in duration-300 w-full">
      <AttendanceHeader 
        onlineCount={onlineCount} 
        complianceScore={complianceScore} 
        onScanClick={() => setIsScannerOpen(true)}
        onManualOverride={() => setIsGlobalOverrideOpen(true)} 
        onRecalculate={handleRecalculate}
        onExportExcel={handleExportExcel}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted(!isMuted)}
        recentScans={recentScans}
        currentRole={currentRole}
        onMassImportClick={() => setIsMassImportOpen(true)}
      />

      <LiveMonitor 
        records={filteredRecords}
        activeEmployeesCount={filteredRecords.filter(r => {
          const st = String(r.status || "").toUpperCase();
          const hasWorked = Number(r.realHours) > 0 || Boolean(r.checkIn);
          return st === 'NORMAL' || st === 'PRESENT' || st === 'PRÉSENT' || st === 'COMPLETED' || st === 'VALIDE' || st === 'VALIDATED' || st === 'ACTIVE' || st === 'PENDING_VERIFICATION' || (hasWorked && st !== 'ABSENT' && st !== 'LATE');
        }).length}
        lateEmployeesCount={filteredRecords.filter(r => String(r.status || "").toUpperCase() === 'LATE').length}
        absentEmployeesCount={filteredRecords.filter(r => {
          const st = String(r.status || "").toUpperCase();
          const hasWorked = Number(r.realHours) > 0 || Boolean(r.checkIn);
          return st === 'ABSENT' && !hasWorked;
        }).length}
      />

      <FilterToolbar 
        branches={branches.filter(b => b.business_id === current_business_id)} 
        departments={departments} 
        employees={employees.filter(e => e.business_id === current_business_id)}
        filters={filters}
        onFilterChange={setFilters}
      />

      {hasActiveFilters && localAttendanceRecords.length > 0 && filteredRecords.length === 0 && (
        <div id="attendance-filter-alert" className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-amber-300 text-xs my-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {language === 'fr'
                ? `${localAttendanceRecords.length} pointage(s) existent dans le système, mais aucun ne correspond à vos filtres actifs (${[
                    filters.date ? `Date: ${filters.date}` : '',
                    filters.endDate ? `au ${filters.endDate}` : '',
                    filters.branchId !== 'ALL' ? 'Succursale' : '',
                    filters.departmentId !== 'ALL' ? 'Département' : '',
                    filters.employeeId && filters.employeeId !== 'ALL' ? 'Employé' : '',
                    filters.status !== 'ALL' ? `Statut: ${filters.status}` : '',
                    filters.search ? `Recherche: "${filters.search}"` : ''
                  ].filter(Boolean).join(', ')}).`
                : `${localAttendanceRecords.length} attendance record(s) exist in the system, but none match your active filters.`}
            </span>
          </div>
          <button
            onClick={() => setFilters({
              branchId: 'ALL',
              departmentId: 'ALL',
              employeeId: 'ALL',
              status: 'ALL',
              search: '',
              date: '',
              endDate: ''
            })}
            className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-200 font-bold rounded text-[11px] whitespace-nowrap transition cursor-pointer"
          >
            {language === 'fr' ? "Réinitialiser et tout afficher" : "Reset & Show All"}
          </button>
        </div>
      )}

      <AttendanceGrid 
        key={`grid_${filters.branchId}_${filters.departmentId}_${filters.employeeId}_${filters.date}_${filters.endDate}_${filters.status}_${filters.search}`}
        records={filteredRecords}
        employees={employees}
        currentRole={currentRole}
        selectedIds={selectedIds}
        onToggleSelection={handleToggleSelection}
        onToggleSelectAll={handleToggleSelectAll}
        onOverrideClick={(rec) => {
          setOverrideTarget(rec);
          setOverrideHours(rec.realHours);
          setOverrideStatus(rec.status);
        }}
      />

      {/* Floating Action Bar for Deletion */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 border border-rose-500/30 shadow-2xl shadow-rose-500/10 rounded-full px-6 py-3 flex items-center gap-6 z-40"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs font-bold">
                {selectedIds.length}
              </span>
              <span className="text-sm font-medium text-slate-200">
                {language === "fr" ? "Pointage(s) sélectionné(s)" : "Record(s) selected"}
              </span>
            </div>
            
            <div className="flex items-center gap-3 border-l border-slate-700 pl-6">
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                disabled={isDeleting}
              >
                {language === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={isDeleting}
                className="flex items-center gap-2 bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-full text-xs font-bold transition-all shadow-md shadow-rose-500/20 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? "..." : (language === "fr" ? "Supprimer" : "Delete")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-rose-500/40 rounded-xl p-6 shadow-2xl w-full max-w-sm font-sans"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0 border border-rose-500/30 text-rose-500">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 leading-tight">
                  {language === "fr" ? "Supprimer les pointages" : "Delete Records"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {language === "fr" 
                    ? `Vous êtes sur le point de supprimer ${selectedIds.length} pointage(s).` 
                    : `You are about to delete ${selectedIds.length} record(s).`}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-6 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
              {language === "fr" 
                ? "Cette action est irréversible et sera enregistrée dans le journal d'audit forensic."
                : "This action is irreversible and will be logged in the forensic audit trail."}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-bold text-slate-300 hover:text-white transition-colors"
              >
                {language === "fr" ? "Annuler" : "Cancel"}
              </button>
              <button
                onClick={confirmDeleteSelected}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
              >
                {isDeleting ? "..." : (language === "fr" ? "Confirmer la suppression" : "Confirm Deletion")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-5 shadow-2xl w-full max-w-md animate-in zoom-in-95 font-mono text-xs">
            <h5 className="text-sm font-bold text-amber-500 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
              <AlertTriangle className="w-5 h-5" />
              Correction Manuelle (Forensic)
            </h5>
            
            <div className="mb-4 bg-slate-950 p-3 rounded border border-slate-800">
               <div className="text-slate-400 mb-1">Employé : <span className="font-bold text-slate-200">{overrideTarget.employeeName}</span></div>
               <div className="text-slate-400 mb-1">Date : <span className="font-bold text-slate-200">{overrideTarget.date}</span></div>
               <div className="text-slate-400">Heures : <span className="font-bold text-slate-200">{overrideTarget.realHours}h</span> (Prévu: {overrideTarget.plannedHours}h)</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">État Assigné</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 outline-none focus:border-amber-500"
                >
                  <option value="NORMAL">NORMAL (Présent)</option>
                  <option value="LATE">LATE (En retard)</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="EXCUSED">EXCUSED (Absence excusée)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 mb-1 uppercase">Heures Retenues</label>
                <input
                  type="number"
                  value={overrideHours}
                  onChange={(e) => setOverrideHours(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 font-mono outline-none focus:border-amber-500"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-[10px] text-slate-400 mb-1 uppercase">Justification Légale (Obligatoire) *</label>
              <textarea
                placeholder="Raison du forçage manuel (sera audité)..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 min-h-[60px] outline-none font-sans focus:border-amber-500"
              />
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setOverrideTarget(null)}
                className="px-4 py-2 font-bold text-slate-400 hover:text-slate-200 font-sans"
              >
                Annuler
              </button>
              <button
                onClick={handleOverrideSubmit}
                disabled={!overrideReason.trim()}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold rounded disabled:opacity-50 font-sans"
              >
                Sauvegarder et Auditer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Override Dialog */}
      <AttendanceOverrideDialog 
        isOpen={isGlobalOverrideOpen} 
        onClose={() => setIsGlobalOverrideOpen(false)}
        employees={employees.filter(e => e.business_id === current_business_id)}
        attendanceRecords={localAttendanceRecords}
        currentRole={currentRole}
        currentUser={currentUser}
        current_business_id={current_business_id}
        onSave={handleGlobalOverrideSave}
        onAddForensicLog={onAddForensicLog}
      />

      {/* Unified QR Scanner / Kiosk Modal */}
      <UnifiedAttendanceKioskModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        employees={employees}
        attendanceRecords={localAttendanceRecords}
        current_business_id={current_business_id}
        currentRole={currentRole}
        currentUser={currentUser}
        branches={branches}
        departments={departments}
        employeeBadges={employeeBadges}
        onUpdateAttendance={(updated) => {
          handleLocalUpdateAttendance(updated);
        }}
        onAddEvent={onAddEvent}
        onAddForensicLog={onAddForensicLog}
        language={language as any}
      />

      {/* Mass Import Modal Component */}
      <MassImportModal 
        isOpen={isMassImportOpen}
        onClose={() => setIsMassImportOpen(false)}
        employees={employees}
        attendanceRecords={localAttendanceRecords}
        currentRole={currentRole}
        currentUser={currentUser}
        current_business_id={current_business_id}
        branches={branches}
        departments={departments}
        onAddEvent={onAddEvent}
        onAddForensicLog={onAddForensicLog}
        onUpdateAttendance={(updated) => {
          handleLocalUpdateAttendance(updated);
          toast.success(
            language === 'fr'
              ? "Importation réussie ! Tous les filtres ont été réinitialisés pour afficher l'ensemble des pointages."
              : "Import successful! All filters reset to display imported records."
          );
        }}
      />
    </div>
  );
}
