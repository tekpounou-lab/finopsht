import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  AlertTriangle, 
  FileText, 
  Database, 
  ShieldCheck, 
  Loader2,
  FileSpreadsheet,
  Info,
  UserX,
  Copy,
  CalendarX,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import * as xlsx from 'xlsx';
import { Employee, AttendanceRecord, Role, ERPEvent, ForensicLog } from '../../types';
import { db, getDbDoc } from '../../lib/firebase';
import { setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { AttendanceRepository } from '../../repositories/AttendanceRepository';
import { finopsEventOrchestrator } from '../../services/finopsEventOrchestrator';
import { getLocalIP, generateSignature } from '../../data';
import { calculateAttendanceVariance } from '../../lib/attendanceSSOT';
import { AttendanceSnapshotEngine } from '../../services/workforce/AttendanceSnapshotEngine';
import { toast } from 'sonner';

interface MassImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  currentRole: Role;
  current_business_id: string;
  currentUser?: { name: string; id: string };
  branches: any[];
  departments: any[];
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  onUpdateAttendance: (records: AttendanceRecord[]) => void;
}

export interface ParsedRow {
  employee_email?: string;
  employee_id?: string;
  employee_name?: string;
  attendance_date?: string;
  date?: string;
  check_in?: string;
  check_out?: string;
  status?: string;
  notes?: string;
}

export type RejectionCategory = 
  | "EMPLOYEE_NOT_FOUND"
  | "MISSING_DATE"
  | "MISSING_CHECKOUT"
  | "MISSING_CHECKIN"
  | "NO_TIMES"
  | "DUPLICATE_INTERNAL"
  | "DUPLICATE_DATABASE"
  | "INVALID_TIME_FORMAT"
  | "PERIOD_LOCKED";

export interface ValidatedRow {
  original: ParsedRow;
  index: number; // Row number in file (1-indexed, starting after header row -> row # 2, 3...)
  employeeName: string;
  employeeEmail: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  rejectionReason?: string;
  rejectionCategory?: RejectionCategory;
  errors: string[];
  warnings: string[];
  isDuplicateInternal: boolean;
  isDuplicateDatabase: boolean;
  isValid: boolean;
  mappedRecord?: AttendanceRecord;
}

export default function MassImportModal({
  isOpen,
  onClose,
  employees,
  attendanceRecords,
  currentRole,
  current_business_id,
  currentUser,
  branches,
  departments,
  onAddEvent,
  onAddForensicLog,
  onUpdateAttendance
}: MassImportModalProps) {
  const [allowOverwrite, setAllowOverwrite] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validationResults, setValidationResults] = useState<ValidatedRow[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importCompleted, setImportCompleted] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [rejectedCountState, setRejectedCountState] = useState(0);
  const [activeTab, setActiveTab] = useState<'ALL' | 'VALID' | 'REJECTED'>('ALL');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Download Model Excel Template (Smart Matching Format)
  const handleDownloadTemplate = () => {
    const sampleEmail1 = employees?.[0]?.email || "john.doe@company.com";
    const sampleName1 = employees?.[0]?.name || "John Doe";
    const sampleEmail2 = employees?.[1]?.email || "jane.smith@company.com";
    const sampleName2 = employees?.[1]?.name || "Jane Smith";

    const data = [
      {
        employee_email: sampleEmail1,
        employee_name: sampleName1,
        attendance_date: "2026-08-03",
        check_in: "08:15",
        check_out: "17:30",
        notes: "Present - Standard shift"
      },
      {
        employee_email: sampleEmail2,
        employee_name: sampleName2,
        attendance_date: "2026-08-03",
        check_in: "08:30",
        check_out: "17:00",
        notes: "Present - On time"
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Gabarit Présence");
    xlsx.writeFile(workbook, "FinOps_Gabarit_Importation_Presence.xlsx");
  };

  // 2. Drag and Drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      const fileExt = droppedFile.name.split('.').pop()?.toLowerCase();
      if (validTypes.includes(droppedFile.type) || fileExt === 'csv' || fileExt === 'xlsx' || fileExt === 'xls') {
        setFile(droppedFile);
        processFile(droppedFile);
      } else {
        setParsingError("Invalid file type. Please upload a CSV or Excel file (.xlsx, .xls).");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      processFile(selectedFile);
    }
  };

  // Clean date serial or string to YYYY-MM-DD
  const cleanDateString = (input: any): string => {
    if (!input) return "";
    const str = String(input).trim();
    if (/^\d{5}(\.\d+)?$/.test(str)) {
      const serial = parseFloat(str);
      const parsedDate = xlsx.SSF.parse_date_code(serial);
      const y = parsedDate.y;
      const m = String(parsedDate.m).padStart(2, '0');
      const d = String(parsedDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Match standard YYYY-MM-DD or replace slashes
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
      const parts = str.split(/[-/]/);
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    // Match DD/MM/YYYY or DD-MM-YYYY
    if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
      const parts = str.split(/[-/]/);
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return str;
  };

  // Clean time string (HH:MM)
  const cleanTimeString = (input: any): string => {
    if (input === undefined || input === null) return "";
    const str = String(input).trim();
    if (!str) return "";
    if (!isNaN(Number(str))) {
      const serial = parseFloat(str);
      const parsedTime = xlsx.SSF.parse_date_code(serial);
      const H = String(parsedTime.H).padStart(2, '0');
      const M = String(parsedTime.M).padStart(2, '0');
      return `${H}:${M}`;
    }
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
      const parts = str.split(':');
      return `${parts[0].padStart(2, '0')}:${parts[1]}`;
    }
    return str;
  };

  // 3. Process File and Parse Rows
  const processFile = (selectedFile: File) => {
    setParsingError(null);
    setValidationResults([]);
    setImportCompleted(false);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to Raw JSON rows
        const rawRows = xlsx.utils.sheet_to_json<any>(worksheet);
        
        if (rawRows.length === 0) {
          setParsingError("The uploaded file is empty.");
          return;
        }

        // Flexible key matching
        const standardizedRows: ParsedRow[] = rawRows.map(row => {
          const std: any = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.toLowerCase().trim().replace(/[\s_]+/g, "_");
            std[cleanKey] = row[key];
          });

          return {
            employee_email: std.employee_email || std.email_employe || std.email || std.courriel || undefined,
            employee_id: std.employee_id || std.id_employe || std.emp_id || std.id || undefined,
            employee_name: std.employee_name || std.nom_employe || std.nom || std.name || undefined,
            attendance_date: std.attendance_date || std.date_presence || std.date || undefined,
            date: std.date || std.attendance_date || std.date_presence || undefined,
            check_in: std.check_in !== undefined ? String(std.check_in).trim() : (std.checkin !== undefined ? String(std.checkin).trim() : (std.heure_arrivee !== undefined ? String(std.heure_arrivee).trim() : (std.heure_entree !== undefined ? String(std.heure_entree).trim() : undefined))),
            check_out: std.check_out !== undefined ? String(std.check_out).trim() : (std.checkout !== undefined ? String(std.checkout).trim() : (std.heure_depart !== undefined ? String(std.heure_depart).trim() : (std.heure_sortie !== undefined ? String(std.heure_sortie).trim() : undefined))),
            status: std.status || std.statut || undefined,
            notes: std.notes || std.remarques || std.override_reason || undefined
          };
        });

        await validateRows(standardizedRows);
      } catch (err) {
        console.error(err);
        setParsingError("Could not read file. Please ensure it is a valid CSV or Excel file.");
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  // 4. Enterprise Pipeline Validation Logic
  const validateRows = async (rows: ParsedRow[]) => {
    let lockedCycles: any[] = [];
    try {
      const q = query(
        collection(db, "payroll_cycles"),
        where("business_id", "==", current_business_id),
        where("status", "in", ["LOCKED", "PESSIMISTIC_LOCKED", "SEALED", "PAID"])
      );
      const snap = await getDocs(q);
      lockedCycles = snap.docs.map(docSnap => docSnap.data());
    } catch (err) {
      console.warn("Could not fetch locked payroll cycles for validation:", err);
    }

    const results: ValidatedRow[] = [];
    const internalKeysHistory = new Set<string>();

    rows.forEach((row, rawIdx) => {
      const rowIndex = rawIdx + 2; // Row number in file assuming header is row 1
      const errors: string[] = [];
      const warnings: string[] = [];
      let rejectionReason: string | undefined = undefined;
      let rejectionCategory: RejectionCategory | undefined = undefined;

      const r = row as any;
      // Extract raw inputs with flexible column aliases
      const rawEmail = String(r.employee_email || r.email || r.courriel || "").trim();
      const rawEmpId = String(
        r.employee_id || 
        r.emp_id || 
        r.employee_number || 
        r.matricule || 
        r.badge || 
        r.badge_number || 
        r.badge_id || 
        r.registration_number || 
        r.id || 
        r.id_employe ||
        ""
      ).trim();
      const rawName = String(r.employee_name || r.name || r.nom || r.employe || r.nom_employe || "").trim();
      const rawDate = r.attendance_date || r.date || r.date_pointage || r.jour || "";
      const cleanDate = cleanDateString(rawDate);

      // --- STEP 1: Employee Resolution (Rule 1) ---
      let matchedEmployee: Employee | undefined = undefined;
      
      // Priority 1: Email
      if (rawEmail) {
        const searchEmail = rawEmail.toLowerCase();
        matchedEmployee = employees.find(emp => emp.email && emp.email.toLowerCase().trim() === searchEmail);
      }
      
      // Priority 2: Employee ID / Badge / Registration / Matricule / Code / NIF
      if (!matchedEmployee && rawEmpId) {
        const searchId = rawEmpId.toLowerCase();
        matchedEmployee = employees.find(emp => 
          emp.id.toLowerCase() === searchId || 
          (emp as any).employee_id?.toString().toLowerCase() === searchId ||
          (emp as any).badgeNumber?.toString().toLowerCase() === searchId ||
          (emp as any).badgeId?.toString().toLowerCase() === searchId ||
          (emp as any).code?.toString().toLowerCase() === searchId ||
          (emp as any).registrationNumber?.toString().toLowerCase() === searchId ||
          (emp as any).matricule?.toString().toLowerCase() === searchId ||
          (emp as any).nif?.toString().toLowerCase() === searchId
        );
      }

      // Fallback: Employee Name
      if (!matchedEmployee && rawName) {
        const searchName = rawName.toLowerCase();
        matchedEmployee = employees.find(emp => emp.name && emp.name.toLowerCase().trim() === searchName);
      }

      if (!matchedEmployee) {
        rejectionCategory = "EMPLOYEE_NOT_FOUND";
        rejectionReason = "Employee not found.";
        errors.push("Employee not found in business directory.");
      }

      // --- STEP 2: Date Validation (Rule 2) ---
      if (!rejectionCategory) {
        if (!cleanDate) {
          rejectionCategory = "MISSING_DATE";
          rejectionReason = "Date missing or invalid.";
          errors.push("Date missing or invalid.");
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
          rejectionCategory = "MISSING_DATE";
          rejectionReason = "Date missing or invalid.";
          errors.push(`Invalid date format '${cleanDate}' (Expected YYYY-MM-DD).`);
        } else if (lockedCycles.length > 0) {
          const lockedCycle = lockedCycles.find(c => {
            const start = c.startDate || c.periodStart;
            const end = c.endDate || c.periodEnd;
            return start && end && cleanDate >= start && cleanDate <= end;
          });
          if (lockedCycle) {
            rejectionCategory = "PERIOD_LOCKED";
            rejectionReason = `Période verrouillée: Impossible de modifier le pointage pour une période de paie clôturée ou verrouillée (${lockedCycle.cycleName || lockedCycle.label || lockedCycle.id}, Statut: ${lockedCycle.status}).`;
            errors.push(`Période de paie verrouillée/payée (${lockedCycle.cycleName || lockedCycle.label || 'Clôturée'}).`);
          }
        }
      }

      // --- STEP 3: Check-In / Check-Out Validation (Rule 3 & Rule 7) ---
      const cleanIn = cleanTimeString(row.check_in);
      const cleanOut = cleanTimeString(row.check_out);
      const hasIn = !!cleanIn;
      const hasOut = !!cleanOut;

      if (!rejectionCategory) {
        // Rule 3 Cases
        if (hasIn && !hasOut) {
          rejectionCategory = "MISSING_CHECKOUT";
          rejectionReason = "Incomplete attendance: Missing Check-Out.";
          errors.push("Incomplete attendance: Missing Check-Out.");
        } else if (!hasIn && hasOut) {
          rejectionCategory = "MISSING_CHECKIN";
          rejectionReason = "Incomplete attendance: Missing Check-In.";
          errors.push("Incomplete attendance: Missing Check-In.");
        } else if (!hasIn && !hasOut) {
          rejectionCategory = "NO_TIMES";
          rejectionReason = "No attendance recorded.";
          errors.push("No attendance recorded.");
        } else {
          // Both times present - validate HH:MM format
          const timePattern = /^\d{2}:\d{2}$/;
          if (!timePattern.test(cleanIn) || !timePattern.test(cleanOut)) {
            rejectionCategory = "INVALID_TIME_FORMAT";
            rejectionReason = "Invalid time format.";
            errors.push("Invalid time format (Expected HH:MM).");
          }
        }
      }

      // --- STEP 4: Duplicate Detection Inside Uploaded File (Rule 4) ---
      const empId = matchedEmployee ? matchedEmployee.id : "";
      let isDuplicateInternal = false;

      if (!rejectionCategory && empId && cleanDate) {
        const comboKey = `${empId}_${cleanDate}`;
        if (internalKeysHistory.has(comboKey)) {
          isDuplicateInternal = true;
          rejectionCategory = "DUPLICATE_INTERNAL";
          rejectionReason = "Duplicate attendance detected for the same employee and the same date inside the uploaded file.";
          errors.push("Duplicate row inside uploaded file.");
        } else {
          internalKeysHistory.add(comboKey);
        }
      }

      // --- STEP 5: Duplicate Detection Against Firestore (Rule 5) ---
      let isDuplicateDatabase = false;

      if (!rejectionCategory && empId && cleanDate) {
        const existingRecordInDb = attendanceRecords.find(r => 
          (r.employeeId === empId || (r as any).employee_id === empId) && r.date === cleanDate
        );
        if (existingRecordInDb) {
          isDuplicateDatabase = true;
          if (!allowOverwrite) {
            rejectionCategory = "DUPLICATE_DATABASE";
            rejectionReason = "Attendance already exists for this employee on this date.";
            errors.push("Attendance record already exists in database.");
          } else {
            warnings.push("Un pointage existait déjà pour cet employé à cette date et sera mis à jour lors de l'importation.");
          }
        }
      }

      // Determine validity
      const isValid = rejectionCategory === undefined && errors.length === 0;

      // Construct Mapped Record for Valid Rows
      let mappedRecord: AttendanceRecord | undefined = undefined;

      if (isValid && matchedEmployee) {
        // Calculate Hours & Variance
        const [inH, inM] = cleanIn.split(":").map(Number);
        const [outH, outM] = cleanOut.split(":").map(Number);
        const totalInMin = inH * 60 + inM;
        const totalOutMin = outH * 60 + outM;
        let realHours = 0;
        if (totalOutMin > totalInMin) {
          realHours = parseFloat(((totalOutMin - totalInMin) / 60).toFixed(2));
        } else {
          warnings.push("Check-out time is earlier than check-in time.");
        }

        const plannedHours = 8;
        const variance = calculateAttendanceVariance(realHours, plannedHours);

        const finalBranch = matchedEmployee.branchId || branches?.[0]?.id || "BRANCH_DEFAULT";
        const finalDept = matchedEmployee.departmentId || departments?.[0]?.id || "DEPT_DEFAULT";

        // Create deterministic ID so re-uploads act as upserts rather than duplicating
        const recordId = `rec_${matchedEmployee.id}_${cleanDate.replace(/-/g, "")}`;

        mappedRecord = {
          id: recordId,
          employeeId: matchedEmployee.id,
          employeeName: matchedEmployee.name,
          business_id: current_business_id,
          branchId: finalBranch,
          departmentId: finalDept,
          date: cleanDate,
          checkIn: cleanIn,
          checkOut: cleanOut,
          plannedHours,
          realHours,
          variance,
          status: "NORMAL", // Rule 7: Check-In ✅ & Check-Out ✅ = PRESENT (NORMAL)
          overrideReason: row.notes || "Bulk imported via Enterprise Import Engine",
          overrideBy: currentUser?.name || currentRole
        };
      }

      results.push({
        original: row,
        index: rowIndex,
        employeeName: matchedEmployee ? matchedEmployee.name : (rawName || "Unknown"),
        employeeEmail: matchedEmployee ? matchedEmployee.email : (rawEmail || "N/A"),
        employeeId: empId || rawEmpId || "N/A",
        date: cleanDate || rawDate || "N/A",
        checkIn: cleanIn || row.check_in || "N/A",
        checkOut: cleanOut || row.check_out || "N/A",
        rejectionReason,
        rejectionCategory,
        errors,
        warnings,
        isDuplicateInternal,
        isDuplicateDatabase,
        isValid,
        mappedRecord
      });
    });

    setValidationResults(results);
  };

  // 5. Execute Bulk Partial Import (Rule 6, Rule 9, Rule 10, Rule 11)
  const handleConfirmImport = async () => {
    const validRows = validationResults.filter(r => r.isValid && r.mappedRecord);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    const updatedRecordsToPush: AttendanceRecord[] = [];
    let successCountLocal = 0;

    const validRecords = validRows.map(r => r.mappedRecord!);
    try {
      await AttendanceRepository.batchSaveRecords(current_business_id, validRecords, {
        id: currentUser?.id || "sys_import",
        name: currentUser?.name || "Importateur",
        role: currentRole || "MANAGER"
      });

      for (let i = 0; i < validRecords.length; i++) {
        updatedRecordsToPush.push(validRecords[i]);
        successCountLocal++;
        setImportProgress({ current: i + 1, total: validRecords.length });
      }
    } catch (err: any) {
      console.error("Failed bulk import batch:", err);
      toast.error(err?.message || "Échec de l'importation massive des pointages.");
    }

    if (updatedRecordsToPush.length > 0) {
      const mergedList = [...attendanceRecords];
      updatedRecordsToPush.forEach(newRec => {
        const index = mergedList.findIndex(r => r.id === newRec.id);
        if (index !== -1) {
          mergedList[index] = newRec;
        } else {
          mergedList.unshift(newRec);
        }
      });

      // Rule 10: Immediately update React state & rebuild attendance snapshot
      onUpdateAttendance(mergedList);

      try {
        AttendanceSnapshotEngine.build({
          businessId: current_business_id,
          attendanceLogs: mergedList,
          shifts: [],
          leaves: [],
          rules: null
        });
      } catch (snapErr) {
        console.warn("[AttendanceSnapshotEngine] Async rebuild notice:", snapErr);
      }

      // Rule 11: Audit Trail Logging
      const totalCount = validationResults.length;
      const rejectedCountLocal = totalCount - successCountLocal;

      onAddEvent({
        id: "ev_bulk_att_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        type: "ATTENDANCE",
        business_id: current_business_id,
        payload: { 
          action: "ATTENDANCE_BULK_IMPORTED", 
          totalRows: totalCount,
          importedRows: successCountLocal,
          rejectedRows: rejectedCountLocal,
          status: rejectedCountLocal === 0 ? "SUCCESS" : "PARTIAL_SUCCESS",
          source: "BULK_IMPORT"
        },
        status: "PROCESSED",
        retryCount: 0
      });

      onAddForensicLog({
        id: `fLog_bulk_att_${Math.random().toString(36).substring(2,9)}`,
        timestamp: new Date().toISOString(),
        userId: currentRole === "OWNER" ? "e1" : "e2",
        userName: currentUser?.name || "System",
        userRole: currentRole,
        business_id: current_business_id,
        action: "ATTENDANCE_BULK_IMPORT_COMPLETED",
        beforeState: JSON.stringify({ previousCount: attendanceRecords.length }),
        afterState: JSON.stringify({ 
          totalRows: totalCount, 
          importedRows: successCountLocal, 
          rejectedRows: rejectedCountLocal 
        }),
        ipAddress: getLocalIP(),
        userAgent: navigator.userAgent,
        signature: generateSignature({ action: "BULK_IMPORT", count: successCountLocal })
      });

      try {
        await finopsEventOrchestrator.emit("ATTENDANCE", current_business_id, {
          action: "ATTENDANCE_BULK_IMPORTED",
          importedRows: successCountLocal,
          rejectedRows: rejectedCountLocal,
          triggeredBy: currentRole
        });
      } catch (evtErr) {
        console.warn("Orchestrator layer tracking notice:", evtErr);
      }
    }

    setSuccessCount(successCountLocal);
    setRejectedCountState(validationResults.length - successCountLocal);
    setIsImporting(false);
    setImportCompleted(true);
  };

  // Download CSV report of rejected rows for HR
  const handleDownloadRejectionReport = () => {
    const rejectedRows = validationResults.filter(r => !r.isValid);
    if (rejectedRows.length === 0) return;

    const exportData = rejectedRows.map(r => ({
      Row: r.index,
      Employee: r.employeeName,
      Email: r.employeeEmail,
      Date: r.date,
      Check_In: r.checkIn,
      Check_Out: r.checkOut,
      Rejection_Reason: r.rejectionReason || "Validation error"
    }));

    const worksheet = xlsx.utils.json_to_sheet(exportData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Rejections");
    xlsx.writeFile(workbook, `FinOps_Attendance_Import_Rejections_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleCancel = () => {
    setFile(null);
    setValidationResults([]);
    setParsingError(null);
    setImportCompleted(false);
    onClose();
  };

  // Rule 8 Summary Metrics Calculation
  const totalRows = validationResults.length;
  const validRows = validationResults.filter(r => r.isValid);
  const rejectedRows = validationResults.filter(r => !r.isValid);

  const totalValid = validRows.length;
  const totalRejected = rejectedRows.length;

  const presentCount = validRows.length; // Present count among valid rows
  const absentCount = rejectedRows.filter(r => 
    r.rejectionCategory === "MISSING_CHECKOUT" || 
    r.rejectionCategory === "MISSING_CHECKIN" || 
    r.rejectionCategory === "NO_TIMES"
  ).length;

  const duplicatesCount = rejectedRows.filter(r => r.rejectionCategory === "DUPLICATE_INTERNAL").length;
  const empNotFoundCount = rejectedRows.filter(r => r.rejectionCategory === "EMPLOYEE_NOT_FOUND").length;
  const existingDbCount = rejectedRows.filter(r => r.rejectionCategory === "DUPLICATE_DATABASE").length;

  // Filter rows by active tab
  const displayedRows = activeTab === 'VALID' 
    ? validRows 
    : (activeTab === 'REJECTED' ? rejectedRows : validationResults);

  // Import Status Tag
  let importStatusTag = { text: "VALIDATED", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
  if (totalRows > 0) {
    if (totalValid > 0 && totalRejected > 0) {
      importStatusTag = { text: "PARTIAL SUCCESS", color: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
    } else if (totalValid === 0) {
      importStatusTag = { text: "ALL ROWS REJECTED", color: "bg-rose-500/20 text-rose-400 border-rose-500/40" };
    } else {
      importStatusTag = { text: "FULL SUCCESS", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div 
        className="bg-slate-900 border border-slate-800/80 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 text-left"
        onDragEnter={handleDrag}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                  Bulk Attendance Import Engine
                </h2>
                {file && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${importStatusTag.color}`}>
                    {importStatusTag.text}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Enterprise validation pipeline enforcing SSOT, auditability & partial success.
              </p>
            </div>
          </div>
          <button 
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Panel Scrollable */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Step 1: Gabarit Download instruction */}
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                1. Download Standard Import Template
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                File must contain official employee email/ID, date, check-in, and check-out. Partial import allows valid records to be persisted while invalid rows are flagged with specific rejection reasons.
              </p>
            </div>
            
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wide rounded-lg flex items-center gap-2 transition shrink-0 shadow-lg shadow-indigo-950/40"
            >
              <Download className="w-4 h-4" /> Download Excel Template
            </button>
          </div>

          {/* Step 2: Drag and drop dropzone */}
          {!file && (
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition ${
                dragActive ? 'border-cyan-500 bg-cyan-950/10' : 'border-slate-800 bg-slate-950/10'
              }`}
            >
              <Upload className={`w-10 h-10 mb-4 transition ${dragActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <p className="text-sm font-bold text-slate-200">
                Drag and drop your attendance file here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Accepted formats: Excel (.xlsx, .xls) or CSV
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded-lg transition"
              >
                Browse Files
              </button>
            </div>
          )}

          {/* Loader Parsing Status / Errors */}
          {parsingError && (
            <div className="p-4 bg-rose-950/20 border border-rose-900/40 text-rose-300 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div>
                <h5 className="text-xs font-bold">File Parsing Error</h5>
                <p className="text-xs text-rose-400 mt-0.5">{parsingError}</p>
              </div>
            </div>
          )}

          {/* Step 3: Preview list if file parsed */}
          {file && !importCompleted && (
            <div className="space-y-4">
              
              {/* File Info Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/50">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                  <span className="font-mono text-xs font-bold text-slate-200">{file.name}</span>
                  <span className="text-xs text-slate-500">({totalRows} rows processed)</span>
                </div>
                <button 
                  onClick={() => { setFile(null); setValidationResults([]); setParsingError(null); }}
                  className="text-xs text-rose-400 hover:underline mt-2 sm:mt-0 font-medium"
                >
                  Change File
                </button>
              </div>

              {/* Rule 8: Detailed Summary Report Grid (8 Metrics) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Total</span>
                  <span className="text-base font-bold text-slate-100 font-mono">{totalRows}</span>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-emerald-400 block">Imported</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">{totalValid}</span>
                </div>

                <div className="bg-rose-950/20 border border-rose-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-rose-400 block">Rejected</span>
                  <span className="text-base font-bold text-rose-400 font-mono">{totalRejected}</span>
                </div>

                <div className="bg-cyan-950/20 border border-cyan-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-cyan-400 block">Present</span>
                  <span className="text-base font-bold text-cyan-300 font-mono">{presentCount}</span>
                </div>

                <div className="bg-amber-950/20 border border-amber-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-amber-400 block">Absent</span>
                  <span className="text-base font-bold text-amber-400 font-mono">{absentCount}</span>
                </div>

                <div className="bg-purple-950/20 border border-purple-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-purple-400 block">Duplicates</span>
                  <span className="text-base font-bold text-purple-300 font-mono">{duplicatesCount}</span>
                </div>

                <div className="bg-orange-950/20 border border-orange-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-orange-400 block">Emp. Not Found</span>
                  <span className="text-base font-bold text-orange-300 font-mono">{empNotFoundCount}</span>
                </div>

                <div className="bg-indigo-950/20 border border-indigo-900/40 p-2.5 rounded-xl text-center">
                  <span className="text-[9px] uppercase font-bold text-indigo-400 block">Existing DB</span>
                  <span className="text-base font-bold text-indigo-300 font-mono">{existingDbCount}</span>
                </div>
              </div>

              {/* Tabs for Filtering Displayed Rows */}
              <div className="flex items-center justify-between border-b border-slate-800 pt-2 pb-1">
                <div className="flex items-center gap-1 font-mono text-xs">
                  <button
                    onClick={() => setActiveTab('ALL')}
                    className={`px-3 py-1.5 rounded-t-lg font-bold transition ${
                      activeTab === 'ALL' 
                        ? 'bg-slate-800 text-slate-100 border-t-2 border-cyan-400' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Rows ({totalRows})
                  </button>
                  <button
                    onClick={() => setActiveTab('VALID')}
                    className={`px-3 py-1.5 rounded-t-lg font-bold transition flex items-center gap-1 ${
                      activeTab === 'VALID' 
                        ? 'bg-slate-800 text-emerald-400 border-t-2 border-emerald-400' 
                        : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Valid ({totalValid})
                  </button>
                  <button
                    onClick={() => setActiveTab('REJECTED')}
                    className={`px-3 py-1.5 rounded-t-lg font-bold transition flex items-center gap-1 ${
                      activeTab === 'REJECTED' 
                        ? 'bg-slate-800 text-rose-400 border-t-2 border-rose-400' 
                        : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Rejected ({totalRejected})
                  </button>
                </div>

                {totalRejected > 0 && (
                  <button
                    onClick={handleDownloadRejectionReport}
                    className="text-xs text-rose-300 hover:text-rose-100 font-bold flex items-center gap-1 px-2 py-1 bg-rose-950/40 border border-rose-900/50 rounded transition"
                  >
                    <Download className="w-3 h-3" /> Download Rejection Log
                  </button>
                )}
              </div>

              {/* Rule 8: Detailed Table of Rows */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <div className="max-h-[340px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 sticky top-0 font-mono text-[10px] uppercase">
                        <th className="p-2.5 w-12 text-center">Row</th>
                        <th className="p-2.5">Employee</th>
                        <th className="p-2.5">Email / ID</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Check-In / Out</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Validation Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-500 font-mono">
                            No rows in this category.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((vRow) => (
                          <tr 
                            key={vRow.index}
                            className={`transition ${
                              vRow.isValid 
                                ? 'hover:bg-slate-800/30' 
                                : 'bg-rose-950/10 hover:bg-rose-950/20'
                            }`}
                          >
                            <td className="p-2.5 text-center font-mono font-bold text-slate-400">
                              {vRow.index}
                            </td>
                            <td className="p-2.5 font-bold text-slate-200">
                              {vRow.employeeName}
                            </td>
                            <td className="p-2.5 text-slate-400 font-mono text-[11px]">
                              {vRow.employeeEmail !== "N/A" ? vRow.employeeEmail : vRow.employeeId}
                            </td>
                            <td className="p-2.5 text-slate-300 font-mono">
                              {vRow.date}
                            </td>
                            <td className="p-2.5 text-slate-300 font-mono text-[11px]">
                              {vRow.checkIn !== "N/A" ? vRow.checkIn : "--"} - {vRow.checkOut !== "N/A" ? vRow.checkOut : "--"}
                            </td>
                            <td className="p-2.5">
                              {vRow.isValid ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
                                  PRESENT
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/60 text-rose-400 border border-rose-800/50">
                                  ABSENT
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {vRow.isValid ? (
                                <span className="text-emerald-400 text-[11px] font-bold flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Valid for import
                                </span>
                              ) : (
                                <span className="text-rose-400 text-[11px] font-medium flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3 shrink-0" />
                                  {vRow.rejectionReason}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Import Complete Screen (Rule 8 Execution Summary) */}
          {importCompleted && (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto">
              <div className="w-16 h-16 bg-emerald-500/15 rounded-full border border-emerald-500/35 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-100 uppercase tracking-wide">
                  {rejectedCountState === 0 ? "Full Import Completed" : "Partial Import Completed"}
                </h3>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-3 text-left font-mono text-xs space-y-2">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Total Uploaded Rows:</span>
                    <span className="text-slate-200 font-bold">{totalRows}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-emerald-400">Imported (Valid):</span>
                    <span className="text-emerald-400 font-bold">{successCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-rose-400">Rejected (Invalid):</span>
                    <span className="text-rose-400 font-bold">{rejectedCountState}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  Valid records written to Firestore collection <code className="text-indigo-400 font-mono">attendance_logs</code>. Workforce & Attendance snapshots updated automatically.
                </p>
              </div>

              <div className="flex gap-3 w-full">
                {rejectedCountState > 0 && (
                  <button
                    onClick={handleDownloadRejectionReport}
                    className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-xs font-bold uppercase rounded-xl transition flex-1 flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Export Rejections
                  </button>
                )}
                <button
                  onClick={handleCancel}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded-xl transition flex-1"
                >
                  Close Panel
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer controls */}
        {!importCompleted && (
          <div className="p-5 border-t border-slate-800/80 bg-slate-950/40 rounded-b-2xl flex items-center justify-between flex-wrap gap-2">
            <div>
              {isImporting && (
                <div className="flex items-center gap-2.5" id="import-execution-console">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-xs font-mono text-slate-300">
                    Importing valid records: {importProgress.current} / {importProgress.total}...
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                disabled={isImporting}
                className="px-4 py-2 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-bold uppercase transition disabled:opacity-50"
              >
                Cancel
              </button>

              {file && (
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || totalValid === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center gap-2 transition disabled:opacity-50 shadow-inner"
                  title={totalValid === 0 ? "No valid rows available to import." : ""}
                >
                  {isImporting ? "Writing to Firestore..." : `Import Valid Records (${totalValid} valid)`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
