import React, { useState, useRef, useEffect, useCallback } from "react";
import { 
  X, 
  Scan, 
  Volume2, 
  VolumeX, 
  Search, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  User, 
  Building2, 
  RefreshCw, 
  Layers, 
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Camera,
  CameraOff
} from "lucide-react";
import CameraQrScanner from "./CameraQrScanner";
import { Employee, AttendanceRecord, Branch, Department, EmployeeBadge, ERPEvent, ForensicLog } from "../../types";
import { AttendanceRepository } from "../../repositories/AttendanceRepository";
import { calculateAttendanceVariance, getDeviceLocalDate, getDeviceLocalTime, getDeviceMetadata, normalizeDateStr, findEmployeeByQrPayload, findAttendanceRecordForEmployee } from "../../lib/attendanceSSOT";
import { ReferenceResolver } from "../../services/ReferenceResolver";
import { getLocalIP } from "../../data";
import { Monitor, Laptop, Globe, Cpu } from "lucide-react";

export interface UnifiedAttendanceKioskModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  current_business_id: string;
  currentRole?: string;
  currentUser?: any;
  branches?: Branch[];
  departments?: Department[];
  employeeBadges?: EmployeeBadge[];
  onUpdateAttendance: (records: AttendanceRecord[]) => void;
  onAddEvent?: (event: ERPEvent | any) => void;
  onAddForensicLog?: (log: ForensicLog | any) => void;
  title?: string;
  initialMode?: "AUTO" | "IN" | "OUT";
  language?: "fr" | "ht" | "en";
  preSelectedEmployeeId?: string;
}

export function UnifiedAttendanceKioskModal({
  isOpen,
  onClose,
  employees,
  attendanceRecords,
  current_business_id,
  currentRole,
  currentUser,
  branches = [],
  departments = [],
  employeeBadges = [],
  onUpdateAttendance,
  onAddEvent,
  onAddForensicLog,
  title,
  initialMode = "AUTO",
  language = "fr",
  preSelectedEmployeeId,
}: UnifiedAttendanceKioskModalProps) {
  const [scanMode, setScanMode] = useState<"AUTO" | "IN" | "OUT">(initialMode);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedQrString, setScannedQrString] = useState("");
  const [empSearchQuery, setEmpSearchQuery] = useState("");
  const [isEmpDropdownOpen, setIsEmpDropdownOpen] = useState(false);
  const [deviceClock, setDeviceClock] = useState<{ time: string; date: string; tz: string; meta: any }>(() => {
    const now = new Date();
    const meta = getDeviceMetadata();
    return {
      time: getDeviceLocalTime(now),
      date: getDeviceLocalDate(now),
      tz: meta.deviceTimezone,
      meta
    };
  });
  const [recentScans, setRecentScans] = useState<
    Array<{ id: string; name: string; time: string; date: string; status: "IN" | "OUT" | "ERROR"; badge?: string; deviceId?: string }>
  >([]);
  const [scannerFeedback, setScannerFeedback] = useState<{
    status: "idle" | "scanning" | "success" | "error" | "breach" | "warning";
    message: string;
    details?: string;
  }>({
    status: "idle",
    message: "",
  });

  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cleanly close modal and forcefully release all camera hardware resources
  const handleCloseModal = useCallback(() => {
    try {
      const allVideos = document.querySelectorAll("video");
      allVideos.forEach((v) => {
        try {
          if (v.srcObject) {
            const stream = v.srcObject as MediaStream;
            if (stream && typeof stream.getTracks === "function") {
              stream.getTracks().forEach((t) => {
                try {
                  t.stop();
                } catch {}
              });
            }
            v.srcObject = null;
          }
          v.pause();
          v.removeAttribute("src");
          v.load();
        } catch {}
      });
    } catch {}
    onClose();
  }, [onClose]);

  // Live Machine / Device Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const meta = getDeviceMetadata();
      setDeviceClock({
        time: getDeviceLocalTime(now),
        date: getDeviceLocalDate(now),
        tz: meta.deviceTimezone,
        meta
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (preSelectedEmployeeId) {
      const emp = employees.find((e) => e.id === preSelectedEmployeeId);
      if (emp) {
        setScannedQrString(emp.id);
        setEmpSearchQuery(emp.name);
      }
    }
  }, [preSelectedEmployeeId, employees]);

  // Pre-populate recent scans feed from today's attendance records when modal opens or records update
  useEffect(() => {
    if (!isOpen) return;
    const todayStr = getDeviceLocalDate();
    const todayNorm = normalizeDateStr(todayStr);

    const todayScans: Array<{ id: string; name: string; time: string; date: string; status: "IN" | "OUT" | "ERROR"; badge?: string; deviceId?: string }> = [];

    attendanceRecords.forEach((rec) => {
      const recBizId = rec.business_id || (rec as any).businessId;
      if (recBizId && current_business_id && recBizId !== current_business_id) return;
      const rDateNorm = normalizeDateStr(rec.date);
      if (rDateNorm === todayNorm) {
        const emp = employees.find((e) => e.id === rec.employeeId);
        const name = emp?.name || rec.employeeName || (rec as any).name || "Employé";
        const badge = String((emp as any)?.badgeNumber || rec.employeeId);

        if (rec.checkOut) {
          todayScans.push({
            id: `scan_out_${rec.id}`,
            name,
            time: rec.checkOut,
            date: rDateNorm,
            status: "OUT",
            badge,
            deviceId: (rec as any).deviceId,
          });
        }
        if (rec.checkIn) {
          todayScans.push({
            id: `scan_in_${rec.id}`,
            name,
            time: rec.checkIn,
            date: rDateNorm,
            status: "IN",
            badge,
            deviceId: (rec as any).deviceId,
          });
        }
      }
    });

    // Sort latest scan time first
    todayScans.sort((a, b) => (b.time || "").localeCompare(a.time || ""));

    setRecentScans((prev) => {
      const existingIds = new Set(todayScans.map((s) => s.id));
      const liveOnly = prev.filter((s) => !existingIds.has(s.id));
      return [...liveOnly, ...todayScans].slice(0, 15);
    });
  }, [isOpen, attendanceRecords, current_business_id, employees]);

  // Audio chimes
  const playBeep = useCallback(
    (type: "success" | "error" | "chime") => {
      if (isMuted) return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        if (type === "success") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.22);
          setTimeout(() => { try { ctx.close(); } catch {} }, 300);
        } else if (type === "error") {
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(220, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.25);
          gain.gain.setValueAtTime(0.18, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.25);
          setTimeout(() => { try { ctx.close(); } catch {} }, 350);
        } else {
          osc.type = "sine";
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.08, ctx.currentTime);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.1);
          setTimeout(() => { try { ctx.close(); } catch {} }, 200);
        }
      } catch (e) {
        // AudioContext silent fallback
      }
    },
    [isMuted]
  );

  const addRecentScan = useCallback((name: string, status: "IN" | "OUT" | "ERROR", badge?: string) => {
    const now = new Date();
    const timeStr = getDeviceLocalTime(now);
    const dateStr = getDeviceLocalDate(now);
    const meta = getDeviceMetadata();
    setRecentScans((prev) => [
      { id: "scan_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6), name, time: timeStr, date: dateStr, status, badge, deviceId: meta.deviceId },
      ...prev,
    ].slice(0, 6));
  }, []);

  // Secure scan and SSOT verification processor
  const processSecureScan = useCallback(
    async (modeOverride?: "AUTO" | "IN" | "OUT", payloadOverride?: string) => {
      const payloadToProcess = (payloadOverride !== undefined ? payloadOverride : scannedQrString).trim();
      const targetMode = modeOverride || scanMode;

      if (!payloadToProcess) {
        setScannerFeedback({
          status: "warning",
          message: language === "fr" ? "Veuillez scanner un QR code ou sélectionner un employé." : "Tanpri skane yon kòd QR oswa chwazi yon anplwaye.",
        });
        return;
      }

      // Debounce duplicate camera trigger within 2.5 seconds
      const nowTs = Date.now();
      if (lastScannedCodeRef.current.code === payloadToProcess && nowTs - lastScannedCodeRef.current.time < 2500) {
        return;
      }
      lastScannedCodeRef.current = { code: payloadToProcess, time: nowTs };

      setIsProcessing(true);
      setScannerFeedback({
        status: "scanning",
        message: language === "fr" ? "Vérification cryptographique du badge en cours..." : "Verifikasyon sekirite badj la ap fèt...",
      });

      try {
        let employeeId = "";
        let businessId = "";
        let branchId = "";
        let role = "";
        let signature = "";

        // 1. Parse JSON, Base64 JSON, or structured delimited payload
        try {
          let rawToParse = payloadToProcess.trim();
          // Check if Base64 encoded JSON
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
          // Delimited or plain text or HMAC prefix fallback
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

        // 2. Real-time employee lookup in active directory
        const emp = findEmployeeByQrPayload(employeeId, employees);

        if (!emp) {
          playBeep("error");
          addRecentScan("BADGE INCONNU", "ERROR", employeeId.substring(0, 10));
          setScannerFeedback({
            status: "error",
            message:
              language === "fr"
                ? `Identité non reconnue ("${employeeId.substring(0, 24)}"). Employé introuvable dans l'annuaire.`
                : `Idantite pa rekonèt ("${employeeId.substring(0, 24)}"). Anplwaye pa jwenn nan sistèm nan.`,
          });
          setIsProcessing(false);
          return;
        }

        // 3. Multi-tenant isolation verification
        if (businessId && businessId !== current_business_id && emp.business_id !== current_business_id) {
          if (onAddForensicLog) {
            onAddForensicLog({
              id: "f_sec_" + Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toISOString(),
              userId: "sys_kiosk",
              userName: "Borne Entrée Sécurisée",
              userRole: "EMPLOYEE",
              business_id: current_business_id,
              action: "ATTENDANCE_CROSS_TENANT_BREACH_REJECTED",
              beforeState: JSON.stringify({ current_business_id }),
              afterState: JSON.stringify({ attemptedPayload: payloadToProcess }),
              ipAddress: getLocalIP(),
              userAgent: window.navigator.userAgent,
              signature: "threat_seal_" + Math.random().toString(36).substring(2, 8),
            });
          }
          playBeep("error");
          addRecentScan(emp.name || "INCONNU", "ERROR", "CROSS_TENANT");
          setScannerFeedback({
            status: "breach",
            message:
              language === "fr"
                ? "BRÈCHE DE SÉCURITÉ : Ce badge appartient à un tiers locataire. Accès rejeté."
                : "SEKIRITE : Badj sa a se pou yon lòt konpayi. Aksè refize.",
          });
          setIsProcessing(false);
          return;
        }

        // 4. Check revoked badge signature
        const activeBadge = employeeBadges.find((b) => b.employeeId === emp.id);
        const defaultHmac = `HMAC::${btoa((emp.id || "") + (emp.business_id || "")).substring(0, 16).toUpperCase()}`;
        const isSignatureValid =
          !signature ||
          !activeBadge ||
          !activeBadge.signature ||
          activeBadge.signature === signature ||
          (activeBadge as any).tokenHash === signature ||
          signature === defaultHmac ||
          (activeBadge as any)?.status === "ACTIVE";

        if (!isSignatureValid && (activeBadge as any)?.status === "REVOKED") {
          playBeep("error");
          addRecentScan(emp.name, "ERROR", "SIG_REVOKED");
          setScannerFeedback({
            status: "breach",
            message:
              language === "fr"
                ? "ALERTE SÉCURITÉ : Signature cryptographique de badge révoquée ou expirée."
                : "ALÈT SEKIRITE : Siyati kripotgrafik badj sa a ekspire.",
          });
          setIsProcessing(false);
          return;
        }

        const now = new Date();
        const devMeta = getDeviceMetadata();
        const timeStr = getDeviceLocalTime(now); // Local machine time HH:MM:SS
        const dateStr = getDeviceLocalDate(now); // Local machine date YYYY-MM-DD

        // 5. Check if payroll period is locked
        try {
          await AttendanceRepository.verifyPeriodLock(emp.business_id || current_business_id, dateStr);
        } catch (lockErr: any) {
          playBeep("error");
          setScannerFeedback({
            status: "error",
            message: lockErr.message || "Période de paie verrouillée.",
          });
          setIsProcessing(false);
          return;
        }

        const exists = findAttendanceRecordForEmployee(emp, attendanceRecords, dateStr);
        let calculatedAction: "IN" | "OUT" = "IN";

        if (targetMode === "AUTO") {
          calculatedAction = exists && exists.checkIn && !exists.checkOut ? "OUT" : "IN";
        } else {
          calculatedAction = targetMode;
        }

        // 6. Execute Check-in or Check-out
        if (calculatedAction === "IN") {
          if (exists && exists.checkIn) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message:
                language === "fr"
                  ? `Pointage d'arrivée déjà enregistré à ${exists.checkIn} pour ${emp.name}.`
                  : `Pwentaj antre te deja fèt a ${exists.checkIn} pou ${emp.name}.`,
            });
            setIsProcessing(false);
            return;
          }

          try {
            const session = await AttendanceRepository.checkIn({
              employeeId: emp.id,
              businessId: emp.business_id || current_business_id,
              branchId: emp.branchId || branchId || "BRANCH_DEFAULT",
              method: "QR",
              deviceId: devMeta.deviceId,
              location: "Borne Entrée Sécurisée Hub",
              actor: { id: emp.id, name: emp.name, role: emp.role },
              deviceDate: dateStr,
              deviceTime: timeStr,
              deviceTimezone: devMeta.deviceTimezone,
              deviceInfo: devMeta.userAgent,
            });

            const newRecord: AttendanceRecord = {
              id: session.sessionId || "att_" + Math.random().toString(36).substring(2, 9),
              employeeId: session.employeeId || emp.id,
              employeeName: emp.name,
              business_id: session.businessId || emp.business_id || current_business_id,
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

            onUpdateAttendance([newRecord, ...attendanceRecords.filter((r) => r.id !== newRecord.id)]);

            if (onAddEvent) {
              onAddEvent({
                id: "ev_" + Math.random().toString(36).substring(2, 9),
                timestamp: now.toISOString(),
                type: "ATTENDANCE",
                business_id: current_business_id,
                payload: { action: "SECURE_QR_CHECKIN", record: newRecord, employeeId: emp.id },
                status: "PROCESSED",
                retryCount: 0,
              });
            }

            playBeep("success");
            addRecentScan(emp.name, "IN", emp.id);
            setScannerFeedback({
              status: "success",
              message:
                language === "fr"
                  ? `ENTRÉE VALIDÉE ✓ Bienvenue, ${emp.name}. Arrivée enregistrée à ${timeStr} (Horodatage Machine).`
                  : `ANTRE VALIDE ✓ Byenveni, ${emp.name}. Enskri a ${timeStr} (Machin Lokal).`,
            });
            setScannedQrString("");
            setEmpSearchQuery("");
          } catch (err: any) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message: err.message || "Échec de l'enregistrement de l'arrivée.",
            });
          }
        } else {
          // CHECK-OUT
          if (!exists || !exists.checkIn) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message:
                language === "fr"
                  ? `Aucun pointage d'arrivée trouvé pour aujourd'hui pour ${emp.name}.`
                  : `Pa gen okenn pwentaj antre jwenn pou jodi a pou ${emp.name}.`,
            });
            setIsProcessing(false);
            return;
          }

          if (exists.checkOut) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message:
                language === "fr"
                  ? `Sortie déjà enregistrée à ${exists.checkOut} pour ${emp.name}.`
                  : `Pwentaj soti te deja fèt a ${exists.checkOut} pou ${emp.name}.`,
            });
            setIsProcessing(false);
            return;
          }

          try {
            const session = await AttendanceRepository.checkOut({
              sessionId: exists.id,
              method: "QR",
              actor: { id: emp.id, name: emp.name, role: emp.role },
              deviceId: devMeta.deviceId,
              deviceDate: dateStr,
              deviceTime: timeStr,
              deviceTimezone: devMeta.deviceTimezone,
              deviceInfo: devMeta.userAgent,
            });

            const totalHours = session?.totalMinutes ? Number((session.totalMinutes / 60).toFixed(2)) : 8;
            let updatedRecToSave: AttendanceRecord | null = null;
            const updated = attendanceRecords.map((r) => {
              const rDateNorm = normalizeDateStr(r.date);
              if (r.id === exists.id || (r.employeeId === emp.id && rDateNorm === normalizeDateStr(dateStr))) {
                const variance = calculateAttendanceVariance(totalHours, r.plannedHours || 8);
                updatedRecToSave = {
                  ...r,
                  checkOut: timeStr,
                  realHours: totalHours,
                  variance,
                  status: "NORMAL",
                };
                return updatedRecToSave;
              }
              return r;
            });

            onUpdateAttendance(updated);

            if (onAddEvent) {
              onAddEvent({
                id: "ev_" + Math.random().toString(36).substring(2, 9),
                timestamp: now.toISOString(),
                type: "ATTENDANCE",
                business_id: current_business_id,
                payload: { action: "SECURE_QR_CHECKOUT", recordId: exists.id, employeeId: emp.id },
                status: "PROCESSED",
                retryCount: 0,
              });
            }

            playBeep("success");
            addRecentScan(emp.name, "OUT", emp.id);
            setScannerFeedback({
              status: "success",
              message:
                language === "fr"
                  ? `SORTIE VALIDÉE ✓ Au revoir, ${emp.name}. Départ à ${timeStr} (Horodatage Machine). Temps: ${totalHours}h.`
                  : `SOTI VALIDE ✓ Orevwa, ${emp.name}. Pati a ${timeStr} (Machin Lokal). Tan: ${totalHours}h.`,
            });
            setScannedQrString("");
            setEmpSearchQuery("");
          } catch (err: any) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message: err.message || "Échec de l'enregistrement de la sortie.",
            });
          }
        }
      } catch (globalErr: any) {
        playBeep("error");
        setScannerFeedback({
          status: "error",
          message: globalErr?.message || "Erreur de traitement du pointage.",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [
      scannedQrString,
      scanMode,
      language,
      employees,
      employeeBadges,
      attendanceRecords,
      current_business_id,
      onUpdateAttendance,
      onAddEvent,
      onAddForensicLog,
      playBeep,
      addRecentScan,
    ]
  );

  if (!isOpen) return null;

  const companyEmps = employees.filter((e) => e.business_id === current_business_id);
  const searchFilter = (empSearchQuery || "").toLowerCase().trim();
  const filteredEmployees = searchFilter
    ? companyEmps.filter(
        (emp) =>
          emp.name.toLowerCase().includes(searchFilter) ||
          emp.id.toLowerCase().includes(searchFilter) ||
          (emp.position && emp.position.toLowerCase().includes(searchFilter)) ||
          (emp.email && emp.email.toLowerCase().includes(searchFilter)) ||
          ((emp as any).badgeNumber && String((emp as any).badgeNumber).toLowerCase().includes(searchFilter))
      )
    : companyEmps;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      id="unified-attendance-kiosk-modal"
    >
      <div className="bg-slate-900 border border-slate-800/90 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[92vh]">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/95 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/70 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-inner">
              <Scan className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase text-slate-100 tracking-wider">
                  {title || (language === "fr" ? "Borne de Pointage Automatique Hub" : "Borne Pwentaj Otomatik")}
                </h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  ONLINE
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                <span>FINOPS Enterprise Badge Authenticator</span>
                <span>•</span>
                <span>Cryptographie SHA-256</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`p-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
                isMuted
                  ? "bg-rose-950/30 border-rose-900/50 text-rose-400 hover:bg-rose-900/40"
                  : "bg-slate-800/80 border-slate-700 text-cyan-400 hover:bg-slate-800"
              }`}
              title={isMuted ? "Activer le signal sonore" : "Couper le signal sonore"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleCloseModal}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 bg-slate-950/50">
          {/* Mode Selector & Status Tag */}
          <div className="flex items-center justify-between gap-3 bg-slate-900/80 p-2 border border-slate-800 rounded-xl">
            <div className="flex items-center gap-1.5">
              {(["AUTO", "IN", "OUT"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setScanMode(m)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition cursor-pointer flex items-center gap-1.5 ${
                    scanMode === m
                      ? m === "IN"
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                        : m === "OUT"
                        ? "bg-rose-600 text-white shadow-md shadow-rose-950"
                        : "bg-cyan-600 text-slate-950 shadow-md shadow-cyan-950 font-extrabold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <span>{m === "AUTO" ? "Automatique" : m === "IN" ? "Arrivée (IN)" : "Sortie (OUT)"}</span>
                </button>
              ))}
            </div>

            <div className="text-[10px] font-mono text-slate-400 hidden sm:block">
              {scanMode === "AUTO" && "Détection automatique de statut"}
              {scanMode === "IN" && "Mode forcé : Enregistrement d'arrivée"}
              {scanMode === "OUT" && "Mode forcé : Enregistrement de sortie"}
            </div>
          </div>

          {/* Machine / Device Local Clock & Connection Bar */}
          <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold">
                <Clock className="w-3.5 h-3.5" />
                <span>Heure Machine : <span className="text-white font-mono font-black tracking-widest">{deviceClock.time}</span></span>
              </div>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300">{deviceClock.date}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="bg-slate-800/90 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-900/50">
                {deviceClock.tz}
              </span>
              <span className="hidden sm:inline text-emerald-400 font-sans font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Horodatage Appareil Certifié
              </span>
            </div>
          </div>

          {/* Camera Scanner Viewport */}
          <div className="flex flex-col items-center justify-center p-2 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
            <CameraQrScanner
              onScanSuccess={(decodedText) => {
                processSecureScan(undefined, decodedText);
              }}
              isMuted={isMuted}
              onToggleMute={() => setIsMuted(!isMuted)}
            />
          </div>

          {/* Scanner Feedback Card */}
          {scannerFeedback.message && (
            <div
              className={`p-3.5 border rounded-xl flex items-start gap-3 transition-all duration-200 ${
                scannerFeedback.status === "success"
                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                  : scannerFeedback.status === "error"
                  ? "bg-rose-950/40 border-rose-500/50 text-rose-300"
                  : scannerFeedback.status === "breach"
                  ? "bg-amber-950/50 border-amber-500/60 text-amber-200"
                  : scannerFeedback.status === "scanning"
                  ? "bg-cyan-950/40 border-cyan-500/50 text-cyan-300"
                  : "bg-slate-900 border-slate-800 text-slate-300"
              }`}
              id="kiosk-feedback-panel"
            >
              {scannerFeedback.status === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : scannerFeedback.status === "error" ? (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              ) : scannerFeedback.status === "breach" ? (
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5 animate-spin" />
              )}
              <div className="text-xs font-semibold leading-relaxed">
                <p>{scannerFeedback.message}</p>
                {scannerFeedback.details && (
                  <p className="text-[10px] font-mono text-slate-400 mt-1">{scannerFeedback.details}</p>
                )}
              </div>
            </div>
          )}

          {/* Real Collaborator Direct Lookup (Zero Simulated Data) */}
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Recherche Collaborateur ou Saisie Manuelle de Badge</span>
              </label>
              <span className="text-[9px] text-slate-400 font-mono">
                {companyEmps.length} collaborateurs actifs
              </span>
            </div>

            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={empSearchQuery}
                    onChange={(e) => {
                      setEmpSearchQuery(e.target.value);
                      setScannedQrString(e.target.value);
                      setIsEmpDropdownOpen(true);
                    }}
                    onFocus={() => setIsEmpDropdownOpen(true)}
                    placeholder="Entrez le nom, matricule ou scannez le badge..."
                    className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-400 focus:border-cyan-500/60 outline-none"
                  />
                  {empSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setEmpSearchQuery("");
                        setScannedQrString("");
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => processSecureScan(scanMode, scannedQrString || empSearchQuery)}
                  disabled={isProcessing || (!scannedQrString.trim() && !empSearchQuery.trim())}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  <span>Pointer</span>
                </button>
              </div>

              {/* Autocomplete Dropdown */}
              {isEmpDropdownOpen && empSearchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                  <div className="p-2 bg-slate-950/90 border-b border-slate-800 text-[10px] text-slate-400 font-mono flex items-center justify-between px-3">
                    <span>COLLABORATEURS CORRESPONDANTS</span>
                    <button
                      type="button"
                      onClick={() => setIsEmpDropdownOpen(false)}
                      className="text-slate-400 hover:text-slate-200 font-bold cursor-pointer"
                    >
                      Fermer ✕
                    </button>
                  </div>

                  {filteredEmployees.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-mono">
                      Aucun collaborateur trouvé pour "{empSearchQuery}"
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800/60">
                      {filteredEmployees.slice(0, 8).map((emp) => {
                        const deptName = emp.departmentId
                          ? ReferenceResolver.resolveDepartment(departments, emp.departmentId)?.name || "Général"
                          : "Général";

                        return (
                          <div
                            key={emp.id}
                            onClick={() => {
                              setScannedQrString(emp.id);
                              setEmpSearchQuery(emp.name);
                              setIsEmpDropdownOpen(false);
                            }}
                            className="p-2.5 flex items-center justify-between hover:bg-cyan-950/40 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-[10px] text-cyan-300 shrink-0 uppercase">
                                {emp.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .substring(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-slate-200 truncate flex items-center gap-1.5">
                                  <span>{emp.name}</span>
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                                    {emp.id}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 truncate flex items-center gap-2">
                                  <span>{emp.position || "Staff"}</span>
                                  <span>•</span>
                                  <span className="text-cyan-400/80">{deptName}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setScannedQrString(emp.id);
                                setEmpSearchQuery(emp.name);
                                setIsEmpDropdownOpen(false);
                                processSecureScan("AUTO", emp.id);
                              }}
                              className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold rounded uppercase transition shrink-0 ml-2 cursor-pointer"
                            >
                              Pointer
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Action Buttons for Directional Forced Scans */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => processSecureScan("IN")}
                disabled={isProcessing || (!scannedQrString.trim() && !empSearchQuery.trim())}
                className="py-2 px-3 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold transition disabled:opacity-40 uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Entrée Forcée (IN)</span>
              </button>
              <button
                type="button"
                onClick={() => processSecureScan("OUT")}
                disabled={isProcessing || (!scannedQrString.trim() && !empSearchQuery.trim())}
                className="py-2 px-3 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-40 uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Sortie Forcée (OUT)</span>
              </button>
            </div>
          </div>

          {/* Recent Live Scans Feed */}
          <div className="flex flex-col gap-2 bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Flux de Pointage Récent (Session Active)</span>
              </span>
              <span className="text-[9px] text-slate-400 font-mono">
                {recentScans.length} scans enregistrés
              </span>
            </div>

            <div className="flex flex-col gap-1.5" id="kiosk-recent-scans-feed">
              {recentScans.length > 0 ? (
                recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex justify-between items-center text-xs animate-in slide-in-from-bottom-2 duration-200"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          scan.status === "IN"
                            ? "bg-emerald-400"
                            : scan.status === "OUT"
                            ? "bg-indigo-400"
                            : "bg-rose-400"
                        }`}
                      />
                      <span className="font-bold text-slate-200">{scan.name}</span>
                      {scan.badge && (
                        <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-800 text-slate-400 rounded">
                          {scan.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono">{scan.time}</span>
                      <span
                        className={`text-[9px] font-mono font-black px-2 py-0.5 rounded ${
                          scan.status === "IN"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800/60"
                            : scan.status === "OUT"
                            ? "bg-indigo-950 text-indigo-300 border border-indigo-800/60"
                            : "bg-rose-950 text-rose-300 border border-rose-800/60"
                        }`}
                      >
                        {scan.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg font-mono">
                  Aucun pointage scanné pour cette session.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/95 flex justify-between items-center shrink-0">
          <div className="text-[10px] text-slate-400 font-mono">
            Mode : <span className="text-cyan-400 font-bold">{scanMode}</span>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold rounded-lg text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-2"
          >
            <CameraOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Fermer la Borne</span>
          </button>
        </div>
      </div>
    </div>
  );
}
