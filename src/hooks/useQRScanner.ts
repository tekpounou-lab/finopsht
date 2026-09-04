import { useState, useCallback } from "react";
import { Employee, AttendanceRecord, ERPEvent, ForensicLog, EmployeeBadge } from "../types";
import { queueAttendanceLog } from "../lib/offlineSync";
import { calculateAttendanceVariance, formatAttendanceVariance, getDeviceLocalDate, getDeviceLocalTime, getDeviceMetadata, normalizeDateStr, findEmployeeByQrPayload, findAttendanceRecordForEmployee } from "../lib/attendanceSSOT";
import { AttendanceRepository } from "../repositories/AttendanceRepository";

interface UseQRScannerProps {
  employees: Employee[];
  employeeBadges?: EmployeeBadge[];
  attendanceRecords: AttendanceRecord[];
  current_business_id: string;
  currentBranchId?: string | null;
  isOffline: boolean;
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
  onUpdateAttendance?: (records: AttendanceRecord[]) => void;
  language?: string;
}

export function useQRScanner({
  employees,
  employeeBadges = [],
  attendanceRecords,
  current_business_id,
  currentBranchId,
  isOffline,
  onAddEvent,
  onAddForensicLog,
  onUpdateAttendance,
  language = "fr",
}: UseQRScannerProps) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedQrString, setScannedQrString] = useState("");
  const [scannerFeedback, setScannerFeedback] = useState<{ status: string; message: string }>({
    status: "idle",
    message: "",
  });
  const [recentScans, setRecentScans] = useState<{ id: string; name: string; time: string; status: "IN" | "OUT" | "ERROR" }[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  // Helper to generate system IP simulation
  const getLocalIP = () => "192.168.1." + Math.floor(Math.random() * 254 + 1);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const openScanner = useCallback(() => {
    setIsScannerOpen(true);
    setIsCameraActive(true);
    setScannerFeedback({ status: "idle", message: "" });
  }, []);

  const closeScanner = useCallback(() => {
    setIsScannerOpen(false);
    setIsCameraActive(false);
    setScannedQrString("");
    setScannerFeedback({ status: "idle", message: "" });
  }, []);

  const addRecentScan = useCallback((name: string, status: "IN" | "OUT" | "ERROR") => {
    setRecentScans((prev) => {
      const newScan = {
        id: Math.random().toString(),
        name,
        time: new Date().toLocaleTimeString(),
        status,
      };
      return [newScan, ...prev].slice(0, 5);
    });
  }, []);

  const playBeep = useCallback((type: "success" | "error") => {
    if (isMuted) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type === "success" ? "sine" : "sawtooth";
      osc.frequency.setValueAtTime(type === "success" ? 880 : 220, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // AudioContext might be blocked/unsupported initially
    }
  }, [isMuted]);

  const processSecureScan = useCallback(
    async (mode: "IN" | "OUT" | "AUTO", qrString?: string) => {
      const payloadToProcess = qrString || scannedQrString;
      setScannerFeedback({
        status: "scanning",
        message:
          language === "fr"
            ? "Analyse autofocus de l'image..."
            : language === "ht"
            ? "Kalkile konsantre kòd..."
            : "Autofocus analyzing...",
      });
      setIsProcessing(true);

      if (!payloadToProcess.trim()) {
        playBeep("error");
        setScannerFeedback({
          status: "error",
          message:
            language === "fr"
              ? "Veuillez entrer ou charger une charge utile de badge QR."
              : language === "ht"
              ? "Tanpri antre oswa chaje yon kòd QR badge."
              : "Please enter or load a QR badge payload.",
        });
        setIsProcessing(false);
        return;
      }

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

        const emp = findEmployeeByQrPayload(employeeId, employees);

        if (!emp) {
          playBeep("error");
          addRecentScan("INCONNU", "ERROR");
          setScannerFeedback({
            status: "error",
            message:
              language === "fr"
                ? `Identité non reconnue ("${employeeId.substring(0, 24)}"). Employé introuvable.`
                : `Unrecognized identity ("${employeeId.substring(0, 24)}"). Employee not found.`,
          });
          setIsProcessing(false);
          return;
        }

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
          addRecentScan("INCONNU", "ERROR");
          setScannerFeedback({
            status: "breach",
            message:
              language === "fr"
                ? "BRÈCHE DE SÉCURITÉ : Ce badge appartient à un tiers locataire. Accès rejeté."
                : language === "ht"
                ? "VYOLASYON SEKIRITE : Badge sa a apatni a yon lòt moun. Aksè refize."
                : "SECURITY BREACH: This badge belongs to a third-party tenant. Access denied.",
          });
          setIsProcessing(false);
          return;
        }

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
          if (onAddForensicLog) {
            onAddForensicLog({
              id: "f_sec_" + Math.random().toString(36).substring(2, 9),
              timestamp: new Date().toISOString(),
              userId: "sys_kiosk",
              userName: "Borne Entrée Sécurisée",
              userRole: "EMPLOYEE",
              business_id: current_business_id,
              action: "ATTENDANCE_REVOKED_BADGE_REJECTED",
              beforeState: JSON.stringify({ activeBadgeSig: activeBadge?.signature }),
              afterState: JSON.stringify({ attemptedSignature: signature }),
              ipAddress: getLocalIP(),
              userAgent: window.navigator.userAgent,
              signature: "threat_seal_" + Math.random().toString(36).substring(2, 8),
            });
          }
          playBeep("error");
          addRecentScan(emp.name, "ERROR");
          setScannerFeedback({
            status: "breach",
            message:
              language === "fr"
                ? "ALERTE FRAUDE : Ce badge a été révoqué ou régénéré. Accès refusé."
                : language === "ht"
                ? "ALÈT FRA DE : Badge sa a te revoke oswa rejenere. Aksè refize."
                : "FRAUD ALERT: This badge has been revoked or regenerated. Access denied.",
          });
          setIsProcessing(false);
          return;
        }

        const now = new Date();
        const devMeta = getDeviceMetadata();
        const timeStr = getDeviceLocalTime(now);
        const dateStr = getDeviceLocalDate(now);

        const exists = findAttendanceRecordForEmployee(emp, attendanceRecords, dateStr);
        let targetMode = mode;

        if (targetMode === "AUTO") {
          targetMode = exists && exists.checkIn && !exists.checkOut ? "OUT" : "IN";
        }

        if (targetMode === "IN") {
          if (exists && exists.checkIn) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message:
                language === "fr"
                  ? `Pointage d'arrivée déjà enregistré à ${exists.checkIn} pour ${emp.name}.`
                  : `Check-in already registered at ${exists.checkIn} for ${emp.name}.`,
            });
            setIsProcessing(false);
            return;
          }

          if (isOffline) {
            const newRecord: AttendanceRecord = {
              id: "att_" + Math.random().toString(36).substring(2, 9),
              employeeId: emp.id,
              employeeName: emp.name,
              business_id: emp.business_id,
              branchId: emp.branchId,
              date: dateStr,
              checkIn: timeStr,
              checkOut: null,
              plannedHours: 8,
              realHours: 0,
              variance: -8,
              status: "NORMAL",
            };

            if (onUpdateAttendance) {
              onUpdateAttendance([newRecord, ...attendanceRecords]);
            }

            await queueAttendanceLog({
              id: newRecord.id,
              business_id: newRecord.business_id,
              employeeId: newRecord.employeeId,
              timestamp: new Date().toISOString(),
              type: "CHECK_IN",
              method: "QR",
            });

            if (onAddEvent) {
              onAddEvent({
                id: "ev_" + Math.random().toString(36).substring(2, 9),
                timestamp: now.toISOString(),
                type: "ATTENDANCE",
                business_id: current_business_id,
                payload: { action: "SECURE_QR_CHECKIN_OFFLINE", record: newRecord, employeeId: emp.id },
                status: "DLQ",
                retryCount: 0,
              });
            }

            playBeep("success");
            addRecentScan(emp.name, "IN");
            setScannerFeedback({
              status: "success",
              message:
                language === "fr"
                  ? `[HORS-LIGNE] ENTRÉE VALIDÉE ✓ Bienvenue, ${emp.name}. Arrivée à ${timeStr}.`
                  : language === "ht"
                  ? `[DEKONEKTE] ANTREE VALIDE ✓ Byenveni, ${emp.name}. Rive a ${timeStr}.`
                  : `[OFFLINE] ENTRY VALIDATED ✓ Welcome, ${emp.name}. Arrived at ${timeStr}.`,
            });
          } else {
            // SSOT Online Check-In via AttendanceRepository
            try {
              const session = await AttendanceRepository.checkIn({
                employeeId: emp.id,
                businessId: emp.business_id,
                branchId: emp.branchId || "BRANCH_DEFAULT",
                method: "QR",
                deviceId: devMeta.deviceId,
                location: "Kiosk Terminal",
                actor: { id: emp.id, name: emp.name, role: emp.role },
                deviceDate: dateStr,
                deviceTime: timeStr,
                deviceTimezone: devMeta.deviceTimezone,
                deviceInfo: devMeta.userAgent,
              });

              const newRecord: AttendanceRecord = {
                id: session.sessionId,
                employeeId: session.employeeId,
                employeeName: emp.name,
                business_id: session.businessId,
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

              if (onUpdateAttendance) {
                onUpdateAttendance([newRecord, ...attendanceRecords.filter(r => r.id !== newRecord.id)]);
              }

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
              addRecentScan(emp.name, "IN");
              setScannerFeedback({
                status: "success",
                message:
                  language === "fr"
                    ? `ENTRÉE VALIDÉE ✓ Bienvenue, ${emp.name}. Arrivée à ${timeStr}.`
                    : language === "ht"
                    ? `ANTREE VALIDE ✓ Byenveni, ${emp.name}. Rive a ${timeStr}.`
                    : `ENTRY VALIDATED ✓ Welcome, ${emp.name}. Arrived at ${timeStr}.`,
              });
            } catch (err: any) {
              playBeep("error");
              setScannerFeedback({
                status: "error",
                message: err?.message || "Échec de l'enregistrement de l'entrée.",
              });
            }
          }
        } else {
          // Check-out processing
          const targetIdx = attendanceRecords.findIndex(
            (r) => r.employeeId === emp.id && normalizeDateStr(r.date) === normalizeDateStr(dateStr)
          );
          if (targetIdx === -1) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message:
                language === "fr"
                  ? "Aucun pointage d'arrivée trouvé pour aujourd'hui."
                  : language === "ht"
                  ? "Pa gen pwentaj antre yo jwenn pou jodi a."
                  : "No check-in found for today.",
            });
            setIsProcessing(false);
            return;
          }

          const record = attendanceRecords[targetIdx];

          if (record.checkOut) {
            playBeep("error");
            setScannerFeedback({
              status: "error",
              message:
                language === "fr"
                  ? "Sortie déjà enregistrée pour aujourd'hui."
                  : language === "ht"
                  ? "Soti a deja anrejistre pou jodi a."
                  : "Check-out already registered for today.",
            });
            setIsProcessing(false);
            return;
          }

          if (isOffline) {
            const [inH, inM, inS] = record.checkIn.split(":").map(Number);
            const [outH, outM, outS] = timeStr.split(":").map(Number);
            const hoursClocked =
              Math.round((outH * 3600 + outM * 60 + outS - (inH * 3600 + inM * 60 + inS)) / 360) / 10;

            const updated = [...attendanceRecords];
            const updatedRecord = { ...updated[targetIdx] };
            updatedRecord.checkOut = timeStr;
            updatedRecord.realHours = hoursClocked;
            updatedRecord.variance = calculateAttendanceVariance(hoursClocked, updatedRecord.plannedHours);
            updatedRecord.status = "NORMAL";
            updated[targetIdx] = updatedRecord;

            if (onUpdateAttendance) {
              onUpdateAttendance(updated);
            }

            await queueAttendanceLog({
              id: record.id + "_out",
              business_id: record.business_id,
              employeeId: record.employeeId,
              timestamp: new Date().toISOString(),
              type: "CHECK_OUT",
              method: "QR",
            });

            if (onAddEvent) {
              onAddEvent({
                id: "ev_" + Math.random().toString(36).substring(2, 9),
                timestamp: now.toISOString(),
                type: "ATTENDANCE",
                business_id: current_business_id,
                payload: { action: "SECURE_QR_CHECKOUT_OFFLINE", record: updatedRecord, employeeId: emp.id },
                status: "DLQ",
                retryCount: 0,
              });
            }

            playBeep("success");
            addRecentScan(emp.name, "OUT");
            const formattedVarianceStr = formatAttendanceVariance(updatedRecord.variance);
            setScannerFeedback({
              status: "success",
              message:
                language === "fr"
                  ? `[HORS-LIGNE] SORTIE ENREGISTRÉE ✓ Bon repos, ${emp.name}. Départ à ${timeStr}. (${hoursClocked}h, Écart: ${formattedVarianceStr})`
                  : language === "ht"
                  ? `[DEKONEKTE] SOTI ANREJISTRE ✓ Repo, ${emp.name}. Pati a ${timeStr}. (${hoursClocked}h, Écart: ${formattedVarianceStr})`
                  : `[OFFLINE] DEPARTURE REGISTERED ✓ Goodbye, ${emp.name}. Left at ${timeStr}. (${hoursClocked}h, Variance: ${formattedVarianceStr})`,
            });
          } else {
            // SSOT Online Check-Out via AttendanceRepository
            try {
              const session = await AttendanceRepository.checkOut({
                sessionId: record.id,
                method: "QR",
                actor: { id: emp.id, name: emp.name, role: emp.role },
                deviceId: devMeta.deviceId,
                deviceDate: dateStr,
                deviceTime: timeStr,
                deviceTimezone: devMeta.deviceTimezone,
                deviceInfo: devMeta.userAgent,
              });

              const updated = [...attendanceRecords];
              const item = { ...updated[targetIdx] };
              item.checkOut = timeStr;
              item.realHours = session.totalMinutes ? Number((session.totalMinutes / 60).toFixed(2)) : 8;
              item.variance = calculateAttendanceVariance(item.realHours, item.plannedHours);
              item.status = "NORMAL";
              updated[targetIdx] = item;

              if (onUpdateAttendance) {
                onUpdateAttendance(updated);
              }

              if (onAddEvent) {
                onAddEvent({
                  id: "ev_" + Math.random().toString(36).substring(2, 9),
                  timestamp: now.toISOString(),
                  type: "ATTENDANCE",
                  business_id: current_business_id,
                  payload: { action: "SECURE_QR_CHECKOUT", record: item, employeeId: emp.id },
                  status: "PROCESSED",
                  retryCount: 0,
                });
              }

              playBeep("success");
              addRecentScan(emp.name, "OUT");
              const formattedVarianceStr = formatAttendanceVariance(item.variance);
              setScannerFeedback({
                status: "success",
                message:
                  language === "fr"
                    ? `SORTIE COMPTABILISÉE ✓ Au revoir, ${emp.name}. (${item.realHours}h, Écart: ${formattedVarianceStr})`
                    : language === "ht"
                    ? `SOTI ANREJISTRE ✓ Orevwa, ${emp.name}. (${item.realHours}h, Écart: ${formattedVarianceStr})`
                    : `EXIT LOGGED ✓ Goodbye, ${emp.name}. (${item.realHours}h, Variance: ${formattedVarianceStr})`,
              });
            } catch (err: any) {
              playBeep("error");
              setScannerFeedback({
                status: "error",
                message: err?.message || "Échec de l'enregistrement de la sortie.",
              });
            }
          }
        }
      } catch (err) {
        playBeep("error");
        setScannerFeedback({
          status: "error",
          message:
            language === "fr"
              ? "Erreur technique de décodage durant la numérisation du QR."
              : language === "ht"
              ? "Erre teknoloji pandan pwentaj kòd QR badge."
              : "Decoding error during scanner virtualization check.",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [
      scannedQrString,
      language,
      employees,
      employeeBadges,
      attendanceRecords,
      current_business_id,
      isOffline,
      onAddForensicLog,
      onAddEvent,
      onUpdateAttendance,
      playBeep,
      addRecentScan,
    ]
  );

  return {
    isScannerOpen,
    isCameraActive,
    isProcessing,
    scannedQrString,
    scannerFeedback,
    recentScans,
    isMuted,
    openScanner,
    closeScanner,
    setScannedQrString,
    toggleMute,
    processSecureScan,
  };
}
