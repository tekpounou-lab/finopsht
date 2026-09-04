import React, { useState, useRef } from 'react';
import { X, Upload, Download, CheckCircle, AlertCircle, AlertTriangle, FileText, Database, ShieldCheck, Loader2 } from 'lucide-react';
import * as xlsx from 'xlsx';
import { Employee, Role, ERPEvent, ForensicLog, Branch, Department } from '../../types';
import { Shift, ShiftStatus } from './types';
import { getLocalIP, generateSignature } from '../../data';
import { ScheduleRepository } from '../../repositories/ScheduleRepository';

interface MassImportShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: Employee[];
  shifts: Shift[];
  currentRole: Role;
  current_business_id: string;
  currentUser?: { name: string; id: string };
  branches: Branch[];
  departments: Department[];
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  onUpdateShifts: (shifts: Shift[]) => void;
}

interface ParsedRow {
  employee_email?: string;
  employee_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string;
}

interface ValidatedRow {
  original: ParsedRow;
  index: number;
  errors: string[];
  warnings: string[];
  isDuplicateInternal: boolean;
  isDuplicateDatabase: boolean;
  isValid: boolean;
  mappedRecord?: Shift;
}

export default function MassImportShiftModal({
  isOpen,
  onClose,
  employees,
  shifts,
  currentRole,
  current_business_id,
  currentUser,
  branches,
  departments,
  onAddEvent,
  onAddForensicLog,
  onUpdateShifts
}: MassImportShiftModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validationResults, setValidationResults] = useState<ValidatedRow[]>([]);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importCompleted, setImportCompleted] = useState(false);
  const [successCount, setSuccessCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const sampleEmail = employees?.[0]?.email || "john.doe@company.com";
    const sampleName = employees?.[0]?.name || "John Doe";

    const data = [
      {
        employee_email: sampleEmail,
        employee_name: sampleName,
        date: "2026-05-28",
        start_time: "08:00",
        end_time: "16:00",
        notes: "Shift généré automatiquement"
      },
      {
        employee_email: "collegue@entreprise.com",
        employee_name: "Autre Employé Exempt",
        date: "2026-05-28",
        start_time: "09:00",
        end_time: "17:00",
        notes: "Support client"
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Gabarit Planning");
    xlsx.writeFile(workbook, "gabarit_importation_plannings.xlsx");
  };

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
        setParsingError("Type de fichier invalide. Veuillez importer un fichier CSV ou Excel (.xlsx, .xls).");
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

  const processFile = (selectedFile: File) => {
    setParsingError(null);
    setValidationResults([]);
    setImportCompleted(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawRows = xlsx.utils.sheet_to_json<any>(worksheet);
        
        if (rawRows.length === 0) {
          setParsingError("Le fichier importé est vide.");
          return;
        }

        const firstRowKeys = Object.keys(rawRows[0]).map(k => k.toLowerCase().trim().replace(/[\s_]+/g, "_"));
        const hasEmail = firstRowKeys.includes("employee_email") || firstRowKeys.includes("email_employe") || firstRowKeys.includes("email");
        const hasName = firstRowKeys.includes("employee_name") || firstRowKeys.includes("nom_employe") || firstRowKeys.includes("nom");
        const hasDate = firstRowKeys.includes("date");
        const hasStartTime = firstRowKeys.includes("start_time") || firstRowKeys.includes("heure_debut");
        const hasEndTime = firstRowKeys.includes("end_time") || firstRowKeys.includes("heure_fin");

        if (!hasEmail && !hasName) {
          setParsingError("Champs d'identification requis manquants : Veuillez inclure 'employee_email' ou 'employee_name'.");
          return;
        }
        if (!hasDate) {
          setParsingError("Colonne requise manquante : 'date'.");
          return;
        }
        if (!hasStartTime || !hasEndTime) {
          setParsingError("Colonnes requises manquantes : 'start_time' et 'end_time'.");
          return;
        }

        const standardizedRows: ParsedRow[] = rawRows.map(row => {
          const std: any = {};
          Object.keys(row).forEach(key => {
            const cleanKey = key.toLowerCase().trim().replace(/[\s_]+/g, "_");
            std[cleanKey] = row[key];
          });
          return {
            employee_email: std.employee_email || std.email_employe || std.email || undefined,
            employee_name: std.employee_name || std.nom_employe || std.nom || undefined,
            date: String(std.date || '').trim(),
            start_time: String(std.start_time || std.heure_debut || '').trim(),
            end_time: String(std.end_time || std.heure_fin || '').trim(),
            notes: std.notes ? String(std.notes).trim() : undefined
          };
        });

        validateRows(standardizedRows);
      } catch (err) {
        console.error(err);
        setParsingError("Impossible de lire le fichier. Veuillez vous assurer que le format du fichier ou de ses colonnes est correct.");
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const cleanDateString = (input: string) => {
    if (/^\d{5}(\.\d+)?$/.test(input)) {
      const serial = parseFloat(input);
      const parsedDate = xlsx.SSF.parse_date_code(serial);
      const y = parsedDate.y;
      const m = String(parsedDate.m).padStart(2, '0');
      const d = String(parsedDate.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return input;
  };

  const cleanTimeString = (input: string) => {
    if (!input) return "";
    if (!isNaN(Number(input)) && input.trim() !== '') {
      const serial = parseFloat(input);
      const parsedTime = xlsx.SSF.parse_date_code(serial);
      const H = String(parsedTime.H).padStart(2, '0');
      const M = String(parsedTime.M).padStart(2, '0');
      return `${H}:${M}`;
    }
    return input;
  };

  const validateRows = (rows: ParsedRow[]) => {
    const results: ValidatedRow[] = [];
    const internalKeysHistory = new Set<string>();

    rows.forEach((row, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const cleanDate = cleanDateString(row.date);
      
      if (!cleanDate) {
        errors.push("La date est requise.");
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        errors.push(`Format de date invalide '${cleanDate}' (Format attendu: YYYY-MM-DD).`);
      }

      let matchedEmployee = undefined;
      if (row.employee_email) {
        const emailToSearch = row.employee_email.toLowerCase().trim();
        matchedEmployee = employees.find(emp => emp.email && emp.email.toLowerCase().trim() === emailToSearch);
      }
      if (!matchedEmployee && row.employee_name) {
        const nameToSearch = row.employee_name.toLowerCase().trim();
        matchedEmployee = employees.find(emp => emp.name && emp.name.toLowerCase().trim() === nameToSearch);
      }

      if (!matchedEmployee) {
        errors.push("Employé non trouvé dans l'entreprise (Vérifiez l'adresse e-mail ou le nom).");
      }

      const cleanStartTime = cleanTimeString(row.start_time);
      const cleanEndTime = cleanTimeString(row.end_time);
      const timePattern = /^\d{2}:\d{2}(:\d{2})?$/;

      if (!timePattern.test(cleanStartTime)) {
        errors.push(`Format d'Heure de Début '${row.start_time}' incorrect (Attendu: HH:MM).`);
      }
      if (!timePattern.test(cleanEndTime)) {
        errors.push(`Format d'Heure de Fin '${row.end_time}' incorrect (Attendu: HH:MM).`);
      }

      const employeeId = matchedEmployee ? matchedEmployee.id : "";
      let isDuplicateInternal = false;
      let isDuplicateDatabase = false;

      if (employeeId && cleanDate) {
        const uniqueComboKey = `${employeeId}_${cleanDate}`;
        isDuplicateInternal = internalKeysHistory.has(uniqueComboKey);
        if (isDuplicateInternal) {
          errors.push("Doublon : Cet employé possède déjà une ligne pour la même date dans ce fichier.");
        } else {
          internalKeysHistory.add(uniqueComboKey);
        }

        isDuplicateDatabase = shifts.some(s => s.employeeId === employeeId && s.date === cleanDate);
        if (isDuplicateDatabase) {
          warnings.push("Un tour existe déjà pour cette journée. L'import va mettre à jour la fiche existante.");
        }
      }

      let mappedRecord: Shift | undefined = undefined;
      
      if (errors.length === 0 && matchedEmployee) {
        let plannedHours = 0;
        const [inH, inM] = cleanStartTime.split(":").map(Number);
        const [outH, outM] = cleanEndTime.split(":").map(Number);
        const totalInMin = inH * 60 + inM;
        const totalOutMin = outH * 60 + outM;
        if (totalOutMin > totalInMin) {
          plannedHours = parseFloat(((totalOutMin - totalInMin) / 60).toFixed(2));
        } else {
          warnings.push("L'heure de fin est antérieure à l'heure de début.");
        }

        const finalBranch = matchedEmployee.branchId || branches?.[0]?.id || "default";
        const finalDept = matchedEmployee.departmentId || departments?.[0]?.id || "default";
        const existingRecordId = shifts.find(r => r.employeeId === matchedEmployee?.id && r.date === cleanDate)?.id;

        mappedRecord = {
          id: existingRecordId || "shf_" + Math.random().toString(36).substring(2, 9),
          employeeId: matchedEmployee.id,
          business_id: current_business_id,
          branchId: finalBranch,
          departmentId: finalDept,
          date: cleanDate,
          startTime: cleanStartTime,
          endTime: cleanEndTime,
          plannedHours,
          status: 'SCHEDULED' as ShiftStatus,
          notes: row.notes || "Mass imported via smart mapping engine"
        };
      }

      results.push({
        original: row,
        index: index + 1,
        errors,
        warnings,
        isDuplicateInternal,
        isDuplicateDatabase,
        isValid: errors.length === 0,
        mappedRecord
      });
    });

    setValidationResults(results);
  };

  const handleConfirmImport = async () => {
    const validRows = validationResults.filter(r => r.isValid && r.mappedRecord);
    if (validRows.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: validRows.length });

    const updatedRecordsToPush: Shift[] = validRows.map(r => r.mappedRecord!);
    let successCountLocal = 0;

    try {
      await ScheduleRepository.bulkSaveShifts(updatedRecordsToPush, { id: "system", name: "Mass Import", role: "SYSTEM" });
      successCountLocal = updatedRecordsToPush.length;
      setImportProgress({ current: validRows.length, total: validRows.length });
    } catch (err) {
      console.error("Failed to mass import shifts", err);
    }

    if (updatedRecordsToPush.length > 0) {
      const mergedList = [...shifts];
      updatedRecordsToPush.forEach(newRec => {
        const index = mergedList.findIndex(r => r.id === newRec.id);
        if (index !== -1) {
          mergedList[index] = newRec;
        } else {
          mergedList.push(newRec);
        }
      });
      onUpdateShifts(mergedList);

      const exportedCount = updatedRecordsToPush.length;
      
      onAddEvent({
        id: "ev_mass_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        type: "SCHEDULE",
        business_id: current_business_id,
        payload: { 
          action: "SHIFTS_MASS_IMPORTED", 
          rowCount: exportedCount,
          source: "MASS_IMPORT"
        },
        status: "PROCESSED",
        retryCount: 0
      });

      onAddForensicLog({
        id: `fLog_mass_${Math.random().toString(36).substring(2,9)}`,
        timestamp: new Date().toISOString(),
        userId: currentRole === "OWNER" ? "e1" : "e2",
        userName: currentUser?.name || "System",
        userRole: currentRole,
        business_id: current_business_id,
        action: "SHIFTS_MASS_IMPORTED",
        beforeState: JSON.stringify({ state: "PRE_MASS_IMPORT", previousRecordsCount: shifts.length }),
        afterState: JSON.stringify({ state: "SUCCESS", importedCount: exportedCount }),
        ipAddress: getLocalIP(),
        userAgent: navigator.userAgent,
        signature: generateSignature({ action: "MASS_IMPORT", count: exportedCount })
      });
    }

    setSuccessCount(successCountLocal);
    setIsImporting(false);
    setImportCompleted(true);
  };

  const handleCancel = () => {
    setFile(null);
    setValidationResults([]);
    setParsingError(null);
    onClose();
  };

  const totalValid = validationResults.filter(r => r.isValid).length;
  const totalErrors = validationResults.filter(r => !r.isValid).length;
  const totalDuplicates = validationResults.filter(r => r.isDuplicateInternal || r.isDuplicateDatabase).length;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div 
        className="bg-slate-900 border border-slate-800/80 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 text-left"
        onDragEnter={handleDrag}
      >
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-tight">
                Importation Massive de Planning
              </h2>
              <p className="text-xs text-slate-400">
                Alimentez les plannings via un gabarit universel Excel.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                1. Gabarit Standard Requis (Sans ID technique)
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                Téléchargez notre tableur et renseignez les adresses courriels ou les noms de vos collaborateurs. Le système associe en arrière-plan les fiches et les départements.
                {' '}
                <span className="font-mono text-cyan-300 bg-cyan-950/30 px-1 py-0.5 rounded text-[10px]">
                  employee_email, employee_name, date, start_time, end_time, notes
                </span>
              </p>
            </div>
            
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wide rounded-lg flex items-center gap-2 transition shrink-0 shadow-lg shadow-indigo-950/40"
            >
              <Download className="w-4 h-4" /> Télécharger le modèle Excel
            </button>
          </div>

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
                Glissez-déposez votre fichier ici
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Formats acceptés : Excel standard (.xlsx, .xls) ou CSV
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
                Parcourir les fichiers
              </button>
            </div>
          )}

          {parsingError && (
            <div className="p-4 bg-rose-950/20 border border-rose-900/40 text-rose-350 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold">Erreur d'analyse structurelle</h5>
                <p className="text-xs text-rose-400 mt-0.5">{parsingError}</p>
              </div>
            </div>
          )}

          {file && !importCompleted && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/50">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  <span className="font-mono text-xs font-bold text-slate-200">{file.name}</span>
                  <span className="text-xs text-slate-500">({validationResults.length} lignes détectées)</span>
                </div>
                <button 
                  onClick={() => { setFile(null); setValidationResults([]); setParsingError(null); }}
                  className="text-xs text-rose-400 hover:underline mt-2 sm:mt-0"
                >
                  Remplacer le fichier
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-lg text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Total</span>
                  <span className="text-lg font-bold text-slate-200 font-mono">{validationResults.length}</span>
                </div>
                <div className="bg-emerald-950/10 border border-emerald-900/30 p-3 rounded-lg text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-500 block">Valides</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">{totalValid}</span>
                </div>
                <div className="bg-rose-950/10 border border-rose-900/30 p-3 rounded-lg text-center">
                  <span className="text-[10px] uppercase font-bold text-rose-500 block">Erreurs</span>
                  <span className="text-lg font-bold text-rose-400 font-mono">{totalErrors}</span>
                </div>
                <div className="bg-amber-950/10 border border-amber-900/30 p-3 rounded-lg text-center">
                  <span className="text-[10px] uppercase font-bold text-amber-500 block">Plannings existants</span>
                  <span className="text-lg font-bold text-amber-400 font-mono">{totalDuplicates}</span>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="bg-slate-950/60 px-4 py-2 text-[10px] uppercase font-extrabold text-slate-400 font-mono border-b border-slate-800">
                  Rapport de validation
                </div>
                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-850 bg-slate-950/20">
                  {validationResults.map((vRow) => (
                    <div 
                      key={vRow.index} 
                      className={`p-3 text-xs flex flex-col gap-1.5 transition ${
                        vRow.isValid ? 'hover:bg-slate-800/20' : 'bg-rose-950/5 border-l-2 border-l-rose-500'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] bg-slate-800 text-slate-350 px-1.5 py-0.5 rounded font-bold">
                            Ligne {vRow.index}
                          </span>
                          <span className="font-bold text-slate-200">
                            {vRow.mappedRecord ? (
                              <span>
                                {employees.find(e => e.id === vRow.mappedRecord?.employeeId)?.name}{" "}
                                <span className="text-[11px] text-indigo-400 font-normal">
                                  ({vRow.original.employee_email || vRow.original.employee_name})
                               </span>
                              </span>
                            ) : (
                              <span>{vRow.original.employee_email || vRow.original.employee_name || "Employé non spécifié"}</span>
                            )}
                          </span>
                          <span className="text-slate-400 font-mono font-bold">
                            ({cleanDateString(vRow.original.date)})
                          </span>
                          {vRow.original.start_time && (
                            <span className="text-slate-400 text-[11px]">
                              Début: <strong className="text-slate-200">{vRow.original.start_time}</strong>
                            </span>
                          )}
                          {vRow.original.end_time && (
                            <span className="text-slate-400 text-[11px]">
                              Fin: <strong className="text-slate-200">{vRow.original.end_time}</strong>
                            </span>
                          )}
                        </div>

                        <div>
                          {vRow.isValid ? (
                            <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Prêt
                            </span>
                          ) : (
                            <span className="text-rose-400 font-bold text-[10px] flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> Invalide
                            </span>
                          )}
                        </div>
                      </div>

                      {vRow.errors.length > 0 && (
                        <div className="space-y-0.5 pl-4">
                          {vRow.errors.map((err, errIdx) => (
                            <div key={errIdx} className="text-rose-400 text-[11px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {vRow.warnings.length > 0 && (
                        <div className="space-y-0.5 pl-4">
                          {vRow.warnings.map((warn, warnIdx) => (
                            <div key={warnIdx} className="text-amber-400 text-[11px] flex items-center gap-1 font-medium">
                              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                              <span>{warn}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {importCompleted && (
            <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-emerald-500/15 rounded-full border border-emerald-500/35 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100 uppercase tracking-wide">
                  Importation Réussie
                </h3>
                <p className="text-sm text-slate-400 mt-2">
                  <strong className="text-emerald-400 font-mono text-base">{successCount}</strong> plannings ont été intégrés avec succès.
                </p>
              </div>
              <button
                onClick={handleCancel}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded-xl transition w-full"
              >
                Fermer le Panel
              </button>
            </div>
          )}
        </div>

        {!importCompleted && (
          <div className="p-5 border-t border-slate-800/80 bg-slate-950/20 rounded-b-2xl flex items-center justify-between flex-wrap gap-2">
            <div>
              {isImporting && (
                <div className="flex items-center gap-2.5" id="import-execution-console">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-xs font-mono text-slate-350">
                    Importation en cours : {importProgress.current} / {importProgress.total}...
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
                Annuler
              </button>

              {file && (
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || totalErrors > 0 || validationResults.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs uppercase tracking-wide rounded-xl flex items-center gap-2 transition disabled:opacity-50 shadow-inner"
                >
                  {isImporting ? "Écritures Firestore..." : `Confirmer & Injecter (${totalValid} lignes)`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
