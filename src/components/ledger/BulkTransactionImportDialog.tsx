import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileDown, 
  X, 
  CheckCircle, 
  AlertTriangle, 
  CloudRain, 
  Building2, 
  Users, 
  ShieldAlert, 
  BarChart3, 
  Info,
  Layers,
  FileCheck,
  Calendar
} from 'lucide-react';
import Papa from 'papaparse';
import { z } from 'zod';
import { toast } from 'sonner';
import { LedgerTransaction, Branch, Department, Employee, ERPEvent, ForensicLog } from '../../types';
import { EmployeeDepartmentLinkingService } from '../../services/workforce/EmployeeDepartmentLinkingService';
import { DepartmentResolutionService } from '../../domains/organization/services/DepartmentResolutionService';
import { MasterDataSynchronizationService } from '../../domains/organization/services/MasterDataSynchronizationService';
import { ReferenceResolver } from '../../services/ReferenceResolver';
import { DepartmentRepository } from '../../repositories/organization';
import { EmployeeRepository } from '../../repositories/EmployeeRepository';
import { analyzeGLDuplicates, DuplicateAnalysisResult } from '../../lib/bulkDuplicateDetector';
import ImportAnalysisDialog from './ImportAnalysisDialog';
import SearchableSelect from '../ui/SearchableSelect';
import { generateSignature, getLocalIP } from '../../data';
import { finopsEventOrchestrator } from '../../services/finopsEventOrchestrator';
import { SnapshotRebuildService } from '../../services/SnapshotRebuildService';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { QuickBooksParserService, ExtractedHeaderDateRange } from '../../domains/ledger/services/QuickBooksParserService';
import { EmployeeResolutionEngine } from '../../domains/ledger/services/EmployeeResolutionEngine';
import { ParsedQuickBooksRow, AssociateResolution, ResolutionStatus } from '../../domains/ledger/types/quickbooks';

interface PendingMissingDepartment {
  code: string;
  name: string;
  branchId: string;
  branchName: string;
  linkedEmployeeEmail: string;
  linkedEmployeeId?: string;
  linkedEmployeeName?: string;
  willCreate: boolean;
}

interface BulkTransactionImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (transactions: Partial<LedgerTransaction>[]) => Promise<void>;
  current_business_id: string;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  ledgerTransactions?: LedgerTransaction[];
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
}

const csvRowSchema = z.object({
  date: z.string().min(1),
  type: z.enum(['INCOME', 'EXPENSE', 'ADVANCE', 'TRANSFER']),
  category: z.string().min(1),
  description: z.string().min(3),
  amount: z.string().min(1),
  currency: z.enum(['HTG', 'USD']).optional().default('HTG'),
  employee_email: z.string().optional(),
  branch_code: z.string().min(1),
  department_code: z.string().optional()
});

export default function BulkTransactionImportDialog({
  isOpen,
  onClose,
  onImport,
  current_business_id,
  branches,
  departments,
  employees,
  ledgerTransactions = [],
  onAddEvent,
  onAddForensicLog
}: BulkTransactionImportDialogProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [pendingDepartments, setPendingDepartments] = useState<PendingMissingDepartment[]>([]);
  
  // Accounting Period & Backdating States
  const [accountingDate, setAccountingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [extractedHeaderDate, setExtractedHeaderDate] = useState<ExtractedHeaderDateRange | null>(null);

  // QuickBooks Import States
  const [importMode, setImportMode] = useState<'CSV' | 'QUICKBOOKS'>('CSV');
  const [quickbooksRows, setQuickbooksRows] = useState<ParsedQuickBooksRow[]>([]);
  const [resolutionMap, setResolutionMap] = useState<Map<string, AssociateResolution>>(new Map());
  const [isResolving, setIsResolving] = useState(false);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [activeEmployeesList, setActiveEmployeesList] = useState<Employee[]>(employees || []);
  const [skippedSummaryRowsWarning, setSkippedSummaryRowsWarning] = useState<number | null>(null);

  useEffect(() => {
    if (employees && employees.length > 0) {
      setActiveEmployeesList(employees);
    }
  }, [employees]);
  
  // Enterprise Duplicate Detection States
  const [duplicateAnalysis, setDuplicateAnalysis] = useState<DuplicateAnalysisResult | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // Post-Import Summary Report State
  const [importSummary, setImportSummary] = useState<{
    transactionsImported: number;
    departmentsReused: number;
    departmentsCreated: number;
    employeesLinked: number;
    employeeDeptLinksCreated: number;
    unknownEmployees: number;
    unknownBranches: number;
    duplicateTransactions: number;
    warningsCount: number;
    errorsCount: number;
    warnings: string[];
    errors: string[];
    createdDepartments: {
      id: string;
      name: string;
      code: string;
      auditLog: ForensicLog;
    }[];
  } | null>(null);

  // Temporary tracking during parse
  const parseStatsRef = useRef<{
    deptsReused: number;
    deptsCreated: number;
    unknownEmployees: number;
    unknownBranches: number;
    warnings: string[];
    createdDepts: { id: string; name: string; code: string; auditLog: ForensicLog }[];
  }>({
    deptsReused: 0,
    deptsCreated: 0,
    unknownEmployees: 0,
    unknownBranches: 0,
    warnings: [],
    createdDepts: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const autoSetMode = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      setImportMode('QUICKBOOKS');
    } else if (ext === 'csv') {
      setImportMode('CSV');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      setFile(selectedFile);
      autoSetMode(selectedFile);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      autoSetMode(selectedFile);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "date,type,category,description,amount,currency,employee_email,branch_code,department_code\n2026-05-01,INCOME,Service Coupe,Vente coupe homme,1500,HTG,employee@email.com,DELMAS,BARBER";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "finops_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTogglePendingDept = (code: string, willCreate: boolean) => {
    setPendingDepartments(prev =>
      prev.map(d => (d.code === code ? { ...d, willCreate } : d))
    );
  };

  const handleUpdatePendingDeptName = (code: string, name: string) => {
    setPendingDepartments(prev =>
      prev.map(d => (d.code === code ? { ...d, name } : d))
    );
  };

  const handleUpdatePendingDeptEmployee = (code: string, employeeId: string) => {
    const selectedEmp = employees.find(e => e.id === employeeId);
    setPendingDepartments(prev =>
      prev.map(d =>
        d.code === code
          ? {
              ...d,
              linkedEmployeeId: employeeId,
              linkedEmployeeName: selectedEmp?.name || "",
              linkedEmployeeEmail: selectedEmp?.email || ""
            }
          : d
      )
    );
  };

  // Process and analyze uploaded file

  const handleProcess = async () => {
    if (!file) return;
    setLoading(true);
    setErrors([]);
    setPreview([]);
    setPendingDepartments([]);
    setDuplicateAnalysis(null);
    setImportSummary(null);

    // Compute File Hash (SHA-256)
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const sessionKey = `finops_import_${hashHex}`;
      if (sessionStorage.getItem(sessionKey)) {
        toast.error("Attention: Ce fichier a potentiellement déjà été importé (même signature).");
        // We don't block entirely, but it's a strong warning
      }
      setFileHash(hashHex);
    } catch (e) {
      console.warn("Could not compute file hash", e);
    }

    parseStatsRef.current = {
      deptsReused: 0,
      deptsCreated: 0,
      unknownEmployees: 0,
      unknownBranches: 0,
      warnings: [],
      createdDepts: []
    };
    
    if (importMode === 'QUICKBOOKS') {
      try {
        console.log(`[QuickBooks Import] File uploaded: ${file.name} (${file.size} bytes)`);
        
        let activeEmployees = employees.length > 0 ? employees : activeEmployeesList;
        if (activeEmployees.length === 0) {
          console.log(`[QuickBooks Import] Employee list is empty. Fetching directly from EmployeeRepository for businessId: "${current_business_id}"...`);
          try {
            const fetched = await EmployeeRepository.listAll(current_business_id);
            console.log(`[QuickBooks Import] Employees fetched: ${fetched.length} employees`);
            if (fetched && fetched.length > 0) {
              activeEmployees = fetched;
              setActiveEmployeesList(fetched);
            } else {
              console.warn("[QuickBooks Import] No employees found in system for businessId:", current_business_id);
              toast.error("Aucun employé trouvé dans la base de données. La résolution se basera sur les créations automatiques.");
            }
          } catch (empErr: any) {
            console.error("[QuickBooks Import] EmployeeRepository.listAll failed:", empErr);
            toast.error("Impossible de charger la liste des employés depuis la base de données.");
          }
        } else {
          console.log(`[QuickBooks Import] Employees fetched: ${activeEmployees.length} employees available`);
        }

        const { rows, uniqueAssociates, extractedDateRange, skippedSummaryRowsCount } = await QuickBooksParserService.parseRawReport(file);
        console.log(`[QuickBooks Import] Parsed ${rows.length} rows, found ${uniqueAssociates.length} unique associates, skipped ${skippedSummaryRowsCount} summary rows.`);
        setQuickbooksRows(rows);

        if (skippedSummaryRowsCount > 0) {
          setSkippedSummaryRowsWarning(skippedSummaryRowsCount);
          const warnText = `${skippedSummaryRowsCount} ligne(s) de total/synthèse QuickBooks détectée(s) et ignorée(s) pour protéger le Grand Livre.`;
          parseStatsRef.current.warnings.push(warnText);
          toast.warning(warnText);
        } else {
          setSkippedSummaryRowsWarning(null);
        }
        
        if (extractedDateRange) {
          setExtractedHeaderDate(extractedDateRange);
          // Keep user's chosen date as the primary authority, only notify of detected date
          toast.success(`Date de période détectée dans l'en-tête: ${extractedDateRange.startDate}`);
        } else {
          setExtractedHeaderDate(null);
        }
        
        const resolutions = EmployeeResolutionEngine.resolveAssociates(uniqueAssociates, activeEmployees);
        setResolutionMap(resolutions);
        console.log(`[QuickBooks Import] Resolution computed: ${uniqueAssociates.length} unique associates mapped to ${resolutions.size} resolution items.`);
        
        let hasUnresolved = false;
        resolutions.forEach(res => {
          if (res.status === 'UNRESOLVED' || !res.matchedEmployeeId) {
            hasUnresolved = true;
          }
        });
        
        console.log(`[QuickBooks Import] isResolving set to: ${hasUnresolved}`);
        
        if (hasUnresolved || resolutions.size > 0) {
          setIsResolving(true);
          console.log(`[QuickBooks Import] setIsResolving(true) called. Map size: ${resolutions.size}, hasUnresolved: ${hasUnresolved}`);
          console.log(`[QuickBooks Import] Resolution table rendered with ${resolutions.size} entries.`);
          if (!hasUnresolved) {
            // Auto-confirm mapping if all were exact/high-confidence matches
            await handleConfirmQuickBooksMapping(resolutions, rows);
          } else {
            setLoading(false);
          }
        } else {
          setIsResolving(false);
          await handleConfirmQuickBooksMapping(resolutions, rows);
        }
      } catch (e: any) {
        console.error("[QuickBooks Import] Error during processing:", e);
        setErrors([`Erreur d'importation QuickBooks: ${e.message || String(e)}`]);
        setLoading(false);
      }
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedData = results.data;
        const errs: string[] = [];
        const validRows: any[] = [];
        const missingDeptsMap = new Map<string, PendingMissingDepartment>();
        
        // High-performance in-memory pre-indexed lookup maps for O(1) matching
        const branchLookupMap = new Map<string, Branch>();
        branches.forEach(b => {
          if (b && typeof b.id === 'string' && b.id.trim()) branchLookupMap.set(b.id.toLowerCase().trim(), b);
          if (b && typeof b.code === 'string' && b.code.trim()) branchLookupMap.set(b.code.toLowerCase().trim(), b);
          if (b && typeof b.name === 'string' && b.name.trim()) branchLookupMap.set(b.name.toLowerCase().trim(), b);
        });

        const deptLookupMap = new Map<string, Department>();
        departments.forEach(d => {
          if (d && typeof d.id === 'string' && d.id.trim()) deptLookupMap.set(d.id.toLowerCase().trim(), d);
          if (d && typeof d.code === 'string' && d.code.trim()) deptLookupMap.set(d.code.toLowerCase().trim(), d);
          if (d && typeof d.name === 'string' && d.name.trim()) deptLookupMap.set(d.name.toLowerCase().trim(), d);
        });

        const empEmailLookupMap = new Map<string, Employee>();
        employees.forEach(e => {
          if (e && typeof e.email === 'string' && e.email.trim()) empEmailLookupMap.set(e.email.toLowerCase().trim(), e);
        });

        const unknownEmailsSet = new Set<string>();

        for (let index = 0; index < parsedData.length; index++) {
          const row = parsedData[index] as any;
          try {
            // Clean up row keys and values
            const cleanRow: any = {};
            Object.keys(row).forEach(k => {
              const cleanedKey = k.trim();
              const val = row[k];
              cleanRow[cleanedKey] = typeof val === 'string' ? val.trim() : val;
            });

            const parsed = csvRowSchema.parse(cleanRow);
            const amount = parseFloat(parsed.amount);
            if (isNaN(amount) || amount <= 0) {
              throw new Error("Montant invalide (doit être un nombre positif)");
            }

            // 1. Resolve branch_code via O(1) in-memory lookup
            const rawBranchKey = parsed.branch_code.toLowerCase().trim();
            let targetBranch = branchLookupMap.get(rawBranchKey);
            if (!targetBranch) {
              targetBranch = ReferenceResolver.resolveBranch(branches, parsed.branch_code);
            }
            if (!targetBranch) {
              targetBranch = await MasterDataSynchronizationService.resolveOrCreateBranch(
                current_business_id,
                parsed.branch_code.trim(),
                parsed.branch_code.trim()
              );
              // Cache it locally so subsequent rows in same batch reuse it in O(1)
              branches.push(targetBranch);
              branchLookupMap.set(rawBranchKey, targetBranch);
              if (targetBranch.code) branchLookupMap.set(targetBranch.code.toLowerCase().trim(), targetBranch);
              if (targetBranch.name) branchLookupMap.set(targetBranch.name.toLowerCase().trim(), targetBranch);
            }

            // 2. Resolve employee_email via O(1) in-memory lookup
            let targetEmployeeId: string | undefined = undefined;
            let targetEmployeeName: string | undefined = undefined;
            let targetEmployeeEmail: string | undefined = undefined;
            if (parsed.employee_email && parsed.employee_email.trim()) {
              const normEmail = parsed.employee_email.toLowerCase().trim();
              const targetEmp = empEmailLookupMap.get(normEmail) || ReferenceResolver.resolveEmployee(employees, parsed.employee_email);
              if (targetEmp) {
                targetEmployeeId = targetEmp.id;
                targetEmployeeName = targetEmp.name;
                targetEmployeeEmail = targetEmp.email;
              } else {
                parseStatsRef.current.unknownEmployees++;
                unknownEmailsSet.add(parsed.employee_email.trim());
              }
            }

            // 3. Resolve department_code via O(1) in-memory lookup
            let targetDeptId: string | undefined = undefined;
            let targetDeptName: string | undefined = undefined;

            if (parsed.department_code && parsed.department_code.trim()) {
              const rawDeptKey = parsed.department_code.toLowerCase().trim();
              let targetDept = deptLookupMap.get(rawDeptKey);
              if (!targetDept) {
                targetDept = ReferenceResolver.resolveDepartment(departments, parsed.department_code);
              }
              if (targetDept) {
                parseStatsRef.current.deptsReused++;
              } else {
                // Department does not exist yet -> resolveOrCreate guarantees no duplicate departments
                targetDept = await MasterDataSynchronizationService.resolveOrCreateDepartment(
                  current_business_id,
                  parsed.department_code.trim(),
                  parsed.department_code.trim(),
                  targetBranch.id
                );
                parseStatsRef.current.deptsCreated++;
                // Cache it locally so subsequent rows in same batch reuse it in O(1)
                departments.push(targetDept);
                deptLookupMap.set(rawDeptKey, targetDept);
                if (targetDept.code) deptLookupMap.set(targetDept.code.toLowerCase().trim(), targetDept);
                if (targetDept.name) deptLookupMap.set(targetDept.name.toLowerCase().trim(), targetDept);

                // Audit Log for automatically created department
                const auditLog: ForensicLog = {
                  id: `f_dept_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  timestamp: new Date().toISOString(),
                  userId: "user",
                  userName: "System User",
                  userRole: "MANAGER",
                  business_id: current_business_id,
                  action: "DEPARTMENT_AUTO_CREATED",
                  beforeState: "{}",
                  afterState: JSON.stringify({
                    departmentId: targetDept.id,
                    name: targetDept.name,
                    code: targetDept.code,
                    source: "GL Import",
                    reason: "Department referenced during import",
                    businessId: current_business_id
                  }),
                  ipAddress: getLocalIP(),
                  userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'System',
                  signature: generateSignature({ departmentId: targetDept.id, code: targetDept.code }),
                  entityType: "DEPARTMENT",
                  entityId: targetDept.id,
                  metadata: {
                    source: "GL Import",
                    reason: "Department referenced during import",
                    departmentId: targetDept.id,
                    departmentName: targetDept.name,
                    departmentCode: targetDept.code,
                    businessId: current_business_id
                  }
                };

                parseStatsRef.current.createdDepts.push({
                  id: targetDept.id,
                  name: targetDept.name,
                  code: targetDept.code || parsed.department_code,
                  auditLog
                });

                if (onAddForensicLog) {
                  onAddForensicLog(auditLog);
                }
              }
              targetDeptId = targetDept.id;
              targetDeptName = targetDept.name;
            }

            validRows.push({
              ...parsed,
              amount,
              branch_code: parsed.branch_code,
              branchId: targetBranch.id,
              branchName: targetBranch.name,
              department_code: parsed.department_code,
              departmentId: targetDeptId,
              departmentName: targetDeptName,
              employee_email: parsed.employee_email,
              employeeId: targetEmployeeId,
              employeeName: targetEmployeeName
            });
          } catch (e: any) {
            if (e instanceof z.ZodError) {
              const errorFormatted = e.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
              errs.push(`Ligne ${index + 2}: Format invalide (${errorFormatted})`);
            } else {
              errs.push(`Ligne ${index + 2}: ${e.message}`);
            }
          }
        }

        // Aggregate unknown employee warnings into UI
        if (unknownEmailsSet.size > 0) {
          parseStatsRef.current.warnings.push(
            `${unknownEmailsSet.size} email(s) d'employés introuvables (${Array.from(unknownEmailsSet).slice(0, 5).join(', ')}${unknownEmailsSet.size > 5 ? '...' : ''}). Les lignes associées sont importées sans attribution RH.`
          );
        }

        // Phase 1 - 3: Run Enterprise Duplicate Detection Engine
        if (validRows.length > 0) {
          const analysis = analyzeGLDuplicates(validRows, ledgerTransactions, current_business_id);
          setDuplicateAnalysis(analysis);
        }

        setPreview(validRows);
        setPendingDepartments(Array.from(missingDeptsMap.values()));
        setErrors(errs);
        setLoading(false);
      },
      error: (err) => {
        setErrors(["Erreur de lecture CSV: " + err.message]);
        setLoading(false);
      }
    });
  };

  // Open the Analysis Modal before importing


  const handleConfirmQuickBooksMapping = async (
    optionalMap?: Map<string, AssociateResolution> | React.MouseEvent,
    optionalRows?: ParsedQuickBooksRow[]
  ) => {
    const mapToUse = (optionalMap instanceof Map) ? optionalMap : resolutionMap;
    const rowsToUse = optionalRows || quickbooksRows;
    
    let hasUnresolved = false;
    mapToUse.forEach(res => {
      if (res.status === 'UNRESOLVED' && !res.matchedEmployeeId) {
        hasUnresolved = true;
      }
    });

    if (hasUnresolved) {
      toast.error("Veuillez mapper tous les employés manquants avant de continuer.");
      return;
    }
    
    setLoading(true);

    const mappedTransactions: any[] = [];
    
    // Build high-performance lookup maps for O(1) matching
    const branchLookupMap = new Map<string, Branch>();
    branches.forEach(b => {
      if (b && typeof b.id === 'string' && b.id.trim()) branchLookupMap.set(b.id.toLowerCase().trim(), b);
      if (b && typeof b.code === 'string' && b.code.trim()) branchLookupMap.set(b.code.toLowerCase().trim(), b);
      if (b && typeof b.name === 'string' && b.name.trim()) branchLookupMap.set(b.name.toLowerCase().trim(), b);
    });

    const deptLookupMap = new Map<string, Department>();
    departments.forEach(d => {
      if (d && typeof d.id === 'string' && d.id.trim()) deptLookupMap.set(d.id.toLowerCase().trim(), d);
      if (d && typeof d.code === 'string' && d.code.trim()) deptLookupMap.set(d.code.toLowerCase().trim(), d);
      if (d && typeof d.name === 'string' && d.name.trim()) deptLookupMap.set(d.name.toLowerCase().trim(), d);
    });

    const empIdMap = new Map<string, Employee>();
    employees.forEach(e => {
      if (e && typeof e.id === 'string') empIdMap.set(e.id, e);
    });

    // Resolve Branch & Departments identically to CSV parser
    for (let i = 0; i < rowsToUse.length; i++) {
      const row = rowsToUse[i];
      const res = mapToUse.get(row.associate);
      const targetEmp = res?.matchedEmployeeId ? empIdMap.get(res.matchedEmployeeId) : undefined;
      
      const branchCode = 'Bureau Central';
      const branchKey = branchCode.toLowerCase().trim();
      let targetBranch = branchLookupMap.get(branchKey) || ReferenceResolver.resolveBranch(branches, branchCode);
      if (!targetBranch) {
        targetBranch = await MasterDataSynchronizationService.resolveOrCreateBranch(
          current_business_id,
          branchCode,
          branchCode
        );
        branches.push(targetBranch);
        branchLookupMap.set(branchKey, targetBranch);
        if (targetBranch.code) branchLookupMap.set(targetBranch.code.toLowerCase().trim(), targetBranch);
        if (targetBranch.name) branchLookupMap.set(targetBranch.name.toLowerCase().trim(), targetBranch);
      }
      
      let targetDeptId: string | undefined = undefined;
      let targetDeptName: string | undefined = undefined;
      
      if (row.department && row.department.trim()) {
        const deptKey = row.department.toLowerCase().trim();
        let targetDept = deptLookupMap.get(deptKey) || ReferenceResolver.resolveDepartment(departments, row.department);
        if (targetDept) {
          targetDeptId = targetDept.id;
          targetDeptName = targetDept.name;
        } else {
          targetDept = await MasterDataSynchronizationService.resolveOrCreateDepartment(
            current_business_id,
            row.department.trim(),
            row.department.trim(),
            targetBranch.id
          );
          departments.push(targetDept);
          deptLookupMap.set(deptKey, targetDept);
          if (targetDept.code) deptLookupMap.set(targetDept.code.toLowerCase().trim(), targetDept);
          if (targetDept.name) deptLookupMap.set(targetDept.name.toLowerCase().trim(), targetDept);
          targetDeptId = targetDept.id;
          targetDeptName = targetDept.name;
          
          const auditLog: ForensicLog = {
            id: `f_dept_auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            userId: "user",
            userName: "System User",
            userRole: "MANAGER",
            business_id: current_business_id,
            action: "DEPARTMENT_CREATED",
            beforeState: `{}`,
            afterState: JSON.stringify(targetDept),
            ipAddress: getLocalIP(),
            userAgent: window.navigator.userAgent,
            signature: generateSignature(targetDept)
          };
          if (onAddForensicLog) onAddForensicLog(auditLog);
        }
      }
      
      mappedTransactions.push({
        date: accountingDate,
        type: 'INCOME',
        category: row.itemName,
        description: `Vente ${row.itemName}`,
        amount: Number(row.extPrice.toFixed(2)),
        currency: 'HTG',
        employee_email: res?.matchedEmail || targetEmp?.email || '',
        branch_code: 'Bureau Central',
        department_code: row.department || '',
        
        branchId: targetBranch.id,
        branchName: targetBranch.name,
        departmentId: targetDeptId,
        departmentName: targetDeptName,
        employeeId: targetEmp?.id,
        employeeName: targetEmp?.name || row.associate,
        amount_cents: Math.round(row.extPrice * 100)
      });
    }

    // Run duplicate detection phase
    const analysis = analyzeGLDuplicates(mappedTransactions, ledgerTransactions, current_business_id);
    setDuplicateAnalysis(analysis);

    setPreview(mappedTransactions);
    setIsResolving(false);
    setLoading(false);
  };

  const handleManualResolution = (rawName: string, employeeId: string) => {
    setResolutionMap(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(rawName);
      if (existing) {
        const targetEmp = employees.find(e => e.id === employeeId);
        newMap.set(rawName, {
          ...existing,
          matchedEmployeeId: employeeId,
          matchedEmail: targetEmp?.email || null,
          status: 'EXACT'
        });
      }
      return newMap;
    });
  };

  const handleStartImportClick = () => {
    if (preview.length === 0) return;
    setShowAnalysisModal(true);
  };

  // Execute import based on user decision ('SKIP_DUPLICATES' or 'FORCE_ALL')
    const handleExecuteImportWithDecision = async (userDecision: 'SKIP_DUPLICATES' | 'FORCE_ALL') => {
    setLoading(true);
    try {
      // Filter rows if user chose SKIP_DUPLICATES
      let rowsToImport = preview;
      let skippedCount = 0;

      if (userDecision === 'SKIP_DUPLICATES' && duplicateAnalysis) {
        rowsToImport = preview.filter((_, idx) => !duplicateAnalysis.exactDuplicateRowIndexes.has(idx));
        skippedCount = duplicateAnalysis.exactDuplicatesCount;
      }

      const batchId = `import_${Date.now()}`;

      const normalizeImportDate = (dateStr: string, fallbackDate: string): string => {
        if (!dateStr) return new Date(fallbackDate).toISOString();
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
          const d = new Date(dateStr);
          return !isNaN(d.getTime()) ? d.toISOString() : new Date(fallbackDate).toISOString();
        }
        const parts = dateStr.split(/[/-]/);
        if (parts.length === 3) {
          let year = parts[2];
          if (year.length === 2) year = '20' + year;
          let part1 = parseInt(parts[0], 10);
          let part2 = parseInt(parts[1], 10);
          let day = part1;
          let month = part2;
          if (month > 12 && day <= 12) {
            day = part2;
            month = part1;
          }
          const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const parsed = new Date(isoStr);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString();
          }
        }
        const fallbackParsed = new Date(dateStr);
        return !isNaN(fallbackParsed.getTime()) ? fallbackParsed.toISOString() : new Date(fallbackDate).toISOString();
      };

      const txsToImport: Partial<LedgerTransaction>[] = rowsToImport.map(p => {
        return {
          type: p.type,
          category: p.category,
          description: p.description,
          amount: p.amount,
          amount_cents: Math.round(p.amount * 100),
          currency: p.currency,
          date: normalizeImportDate(p.date, accountingDate),
          branchId: p.branchId,
          branch_id: p.branchId,
          branch_code: p.branch_code,
          branch_name: p.branchName,
          departmentId: p.departmentId || undefined,
          department_id: p.departmentId || undefined,
          department_code: p.department_code || undefined,
          department_name: p.departmentName || undefined,
          employeeId: p.employeeId || undefined,
          employee_id: p.employeeId || undefined,
          employee_email: p.employee_email || undefined,
          employeeName: p.employeeName || undefined,
          employee_name: p.employeeName || undefined,
          import_batch_id: batchId,
          status: 'POSTED',
          source: 'CSV_IMPORT',
          isImmutable: true,
          business_id: current_business_id
        };
      });

      

      
      // Phase 4: Enterprise Employee-Department Linking (SALES) in optimized batched execution
      const pendingLinks: Array<{ employeeId: string; departmentId: string; transactionDate: string; saleAmount: number }> = [];
      for (const tx of txsToImport) {
        if (tx.employee_id && tx.department_id && tx.type === 'INCOME') {
          pendingLinks.push({
            employeeId: tx.employee_id,
            departmentId: tx.department_id,
            transactionDate: tx.date || new Date().toISOString(),
            saleAmount: tx.amount_cents || 0
          });
        }
      }

      if (pendingLinks.length > 0) {
        await EmployeeDepartmentLinkingService.batchLinkEmployeesToDepartments(
          current_business_id,
          pendingLinks
        ).catch(err => console.warn("Failed batched linking dept to employee:", err));
      }

      // Execute sequenced batch import (400 ops/batch) with forensic audit logging
      await onImport(txsToImport);
      
      // Asynchronously rebuild Business, Department, Employee, and Analytics Snapshots post-import
      const updatedTxs = [...(ledgerTransactions || []), ...(txsToImport as LedgerTransaction[])];
      SnapshotRebuildService.rebuildAllSnapshots({
        businessId: current_business_id,
        employees,
        transactions: updatedTxs,
        departments,
        branches,
      }).catch((err) => console.warn("Non-blocking background snapshot rebuild error:", err));

      // Phase 9: Record Audit Trail & Forensic Logging
      if (onAddForensicLog) {
        onAddForensicLog({
          id: `f_gl_import_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date().toISOString(),
          userId: "user",
          userName: "System User",
          userRole: "MANAGER",
          business_id: current_business_id,
          action: "GL_BULK_IMPORT_COMPLETED",
          beforeState: JSON.stringify({ previousLedgerCount: ledgerTransactions.length }),
          afterState: JSON.stringify({
            period: duplicateAnalysis?.accountingPeriod.periodLabel,
            similarityScore: duplicateAnalysis?.similarityScore,
            userDecision,
            totalUploaded: preview.length,
            importedCount: txsToImport.length,
            skippedDuplicates: skippedCount,
            createdDepartments: 0
          }),
          ipAddress: getLocalIP(),
          userAgent: window.navigator.userAgent,
          signature: generateSignature({ decision: userDecision, imported: txsToImport.length })
        });
      }

      if (onAddEvent) {
        onAddEvent({
          id: `ev_gl_import_${Math.random().toString(36).substring(2, 9)}`,
          timestamp: new Date().toISOString(),
          type: "FINANCE",
          business_id: current_business_id,
          payload: {
            action: "GL_BULK_IMPORT",
            period: duplicateAnalysis?.accountingPeriod.periodLabel,
            similarityScore: duplicateAnalysis?.similarityScore,
            userDecision,
            importedCount: txsToImport.length,
            skippedCount
          },
          status: "PROCESSED",
          retryCount: 0
        });
      }

      try {
        await finopsEventOrchestrator.emit("FINANCE", current_business_id, {
          action: "GL_BULK_IMPORTED",
          userDecision,
          importedCount: txsToImport.length,
          skippedCount
        });
      } catch (evtErr) {
        console.warn("Orchestrator layer tracking notice:", evtErr);
      }

      if (userDecision === 'SKIP_DUPLICATES') {
        toast.success(`Importation réussie ! ${txsToImport.length} nouvelles transactions importées (${skippedCount} doublons ignorés).`);
      } else {
        toast.success(`Importation forcée de ${txsToImport.length} transactions avec succès.`);
      }

      const employeesLinkedCount = new Set(
        txsToImport.map(t => t.employee_id || t.employeeId).filter(Boolean)
      ).size;

      const employeeDeptLinksCount = txsToImport.filter(
        t => (t.employee_id || t.employeeId) && (t.department_id || t.departmentId)
      ).length;

      setImportSummary({
        transactionsImported: txsToImport.length,
        departmentsReused: parseStatsRef.current.deptsReused,
        departmentsCreated: parseStatsRef.current.deptsCreated,
        employeesLinked: employeesLinkedCount,
        employeeDeptLinksCreated: employeeDeptLinksCount,
        unknownEmployees: parseStatsRef.current.unknownEmployees,
        unknownBranches: parseStatsRef.current.unknownBranches,
        duplicateTransactions: skippedCount,
        warningsCount: parseStatsRef.current.warnings.length + (skippedCount > 0 ? 1 : 0),
        errorsCount: errors.length,
        warnings: parseStatsRef.current.warnings,
        errors: errors,
        createdDepartments: parseStatsRef.current.createdDepts
      });

      setShowAnalysisModal(false);
    } catch (err) {
      toast.error("Erreur lors de l'importation massive");
    } finally {
      setLoading(false);
    }
  };

  const handleResetModal = () => {
    setFile(null);
    setPreview([]);
    setPendingDepartments([]);
    setDuplicateAnalysis(null);
    setErrors([]);
    setImportSummary(null);
    setShowAnalysisModal(false);
    setSkippedSummaryRowsWarning(null);
    setIsResolving(false);
    setResolutionMap(new Map());
    setQuickbooksRows([]);
    setFileHash(null);
    setLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCloseDialog = () => {
    handleResetModal();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] flex flex-col max-h-[90vh] overflow-hidden text-left">
          
          {/* Header */}
          <div className="flex justify-between items-center px-8 py-6 border-b border-slate-800 bg-indigo-500/5">
            <div className="flex flex-col">
              <h3 className="font-black text-indigo-400 uppercase tracking-[0.2em] text-xs flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                  <Upload className="w-5 h-5" />
                </div>
                Importation Massive CSV & Détection de Doublons
              </h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2 ml-10">
                Module de Synchronisation ERP & Protection de la Comptabilité
              </p>
            </div>
            <button 
              onClick={handleCloseDialog} 
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {/* Main Body */}
          {importSummary ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Header Banner */}
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-emerald-300 uppercase tracking-wide">
                      Importation Complétée & Instantanés Synchronisés
                    </h4>
                    <p className="text-xs text-slate-300 mt-0.5 font-medium">
                      Toutes les écritures valides ont été intégrées. Les instantanés d'Entreprise, Département, Employé et Analytique ont été régénérés automatiquement.
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold rounded-full uppercase">
                  SSOT Enregistré
                </span>
              </div>

              {/* 10 Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Transactions Imported</div>
                  <div className="text-2xl font-mono font-black text-emerald-400">{importSummary.transactionsImported}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Departments Reused</div>
                  <div className="text-2xl font-mono font-black text-cyan-400">{importSummary.departmentsReused}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Departments Created</div>
                  <div className="text-2xl font-mono font-black text-amber-400">{importSummary.departmentsCreated}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Employees Linked</div>
                  <div className="text-2xl font-mono font-black text-purple-400">{importSummary.employeesLinked}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Employee-Department Links Created</div>
                  <div className="text-2xl font-mono font-black text-indigo-400">{importSummary.employeeDeptLinksCreated}</div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Unknown Employees</div>
                  <div className={`text-2xl font-mono font-black ${importSummary.unknownEmployees > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {importSummary.unknownEmployees}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Unknown Branches</div>
                  <div className={`text-2xl font-mono font-black ${importSummary.unknownBranches > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                    {importSummary.unknownBranches}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Duplicate Transactions</div>
                  <div className={`text-2xl font-mono font-black ${importSummary.duplicateTransactions > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {importSummary.duplicateTransactions}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Warnings</div>
                  <div className={`text-2xl font-mono font-black ${importSummary.warningsCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {importSummary.warningsCount}
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Errors</div>
                  <div className={`text-2xl font-mono font-black ${importSummary.errorsCount > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                    {importSummary.errorsCount}
                  </div>
                </div>
              </div>

              {/* Automatically Created Departments Audit Trail */}
              {importSummary.createdDepartments.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h5 className="text-xs font-bold text-amber-300 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    Départements Créés Automatiquement & Journaux d'Audit Générés ({importSummary.createdDepartments.length})
                  </h5>
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                    {importSummary.createdDepartments.map((dept, i) => (
                      <div key={i} className="p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-200">{dept.name} ({dept.code})</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            ID Département: <span className="text-amber-400">{dept.id}</span> | Source: <span className="text-slate-300">GL Import</span> | Raison: <span className="text-slate-300">Department referenced during import</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            Horodatage: {dept.auditLog.timestamp} | Entreprise: {dept.auditLog.business_id} | Utilisateur: {dept.auditLog.userName}
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[10px] font-bold rounded-lg uppercase shrink-0">
                          Audit Log ID: {dept.auditLog.id}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Details of Warnings and Rejected Errors */}
              {(importSummary.warnings.length > 0 || importSummary.errors.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {importSummary.warnings.length > 0 && (
                    <div className="bg-slate-950 border border-amber-500/20 rounded-xl p-4">
                      <h6 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" /> Avertissements ({importSummary.warnings.length})
                      </h6>
                      <ul className="space-y-1 text-xs text-slate-300 font-mono max-h-36 overflow-y-auto">
                        {importSummary.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                      </ul>
                    </div>
                  )}

                  {importSummary.errors.length > 0 && (
                    <div className="bg-slate-950 border border-rose-500/20 rounded-xl p-4">
                      <h6 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" /> Lignes Invalides Rejetées ({importSummary.errors.length})
                      </h6>
                      <p className="text-[11px] text-slate-400 mb-2">Seules les lignes avec erreurs de format/branche ont été rejetées. Les lignes valides ont été importées.</p>
                      <ul className="space-y-1 text-xs text-rose-300 font-mono max-h-36 overflow-y-auto">
                        {importSummary.errors.map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {isResolving ? (
              <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-amber-300 uppercase flex items-center gap-2">
                  <Users className="w-5 h-5" /> 
                  Résolution des Employés QuickBooks
                </h4>
                <p className="text-xs text-slate-400">Certains associés du fichier QuickBooks n'ont pas pu être associés automatiquement aux employés de l'ERP. Veuillez les mapper manuellement pour continuer l'importation.</p>
                
                <div className="space-y-3 mt-4">
                  {Array.from(resolutionMap.values()).map((res, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-900 border border-slate-800 rounded-xl gap-4">
                       <div>
                         <div className="font-bold text-slate-200">{res.rawName}</div>
                         <div className={`text-[10px] mt-1 ${res.status === 'UNRESOLVED' && !res.matchedEmployeeId ? 'text-rose-400' : 'text-emerald-400'}`}>
                           Statut: {res.matchedEmployeeId ? 'RESOLVED' : res.status}
                         </div>
                       </div>
                       <div className="w-full sm:w-72">
                          <SearchableSelect 
                            options={(activeEmployeesList.length > 0 ? activeEmployeesList : employees).map(emp => ({ id: emp.id, name: `${emp.name} (${emp.email || 'Sans email'})` }))}
                            value={res.matchedEmployeeId || ""}
                            onChange={(val) => handleManualResolution(res.rawName, val)}
                            placeholder="-- Assigner un employé --"
                            error={res.status === 'UNRESOLVED' && !res.matchedEmployeeId}
                          />
                       </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-slate-400 mb-4 leading-relaxed font-sans">
                  Importez vos écritures comptables en toute sécurité. Le système détecte automatiquement les doublons pour la même période comptable avant la validation.
                </p>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-[10px] text-slate-400 mb-4 overflow-x-auto">
                  <div className="text-slate-500 mb-2">// Format requis</div>
                  <div className="text-slate-300">date,type,category,description,amount,currency,employee_email,branch_code,department_code</div>
                  <div className="text-slate-500 mt-2">// Exemple</div>
                  <div className="text-emerald-400/70">2026-05-01,EXPENSE,EQUIPMENT,ACHAT LUNETTES,50000,HTG,jean@tek.com,BR1,IT</div>
                </div>
                <button onClick={downloadTemplate} className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-sm font-bold transition">
                  <FileDown className="w-4 h-4" /> Télécharger Modèle CSV
                </button>
              </div>

              <div>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-sm font-semibold text-slate-300">Format d'import:</span>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="importMode" value="CSV" checked={importMode === 'CSV'} onChange={() => setImportMode('CSV')} className="accent-indigo-500" />
                    Standard CSV
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="importMode" value="QUICKBOOKS" checked={importMode === 'QUICKBOOKS'} onChange={() => setImportMode('QUICKBOOKS')} className="accent-indigo-500" />
                    QuickBooks Raw (.xlsx)
                  </label>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-indigo-400" />
                      Date Comptable d'Imputation
                    </label>
                    {extractedHeaderDate && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full font-mono font-semibold">
                          Détectée: {extractedHeaderDate.rawText}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountingDate(extractedHeaderDate.startDate);
                            if (preview.length > 0) {
                              setPreview(prev => prev.map(p => ({ ...p, date: extractedHeaderDate.startDate })));
                            }
                            toast.info(`Date passée à ${extractedHeaderDate.startDate}`);
                          }}
                          className="text-[10px] text-indigo-400 hover:text-indigo-200 underline font-semibold cursor-pointer"
                        >
                          Appliquer
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Respect de l'indépendance des exercices (attribué à l'exercice comptable réel).
                  </p>
                  <input 
                    type="date"
                    value={accountingDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setAccountingDate(newDate);
                      if (preview.length > 0) {
                        setPreview(prev => prev.map(p => ({ ...p, date: newDate })));
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-mono text-emerald-400 font-bold focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <form 
                  onDragEnter={handleDrag} 
                  onDragLeave={handleDrag} 
                  onDragOver={handleDrag} 
                  onDrop={handleDrop}
                  onSubmit={(e) => e.preventDefault()}
                  className={`h-48 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 transition-all ${
                    dragActive ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-700 bg-slate-900/50 hover:bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept=".csv,.xlsx" 
                    className="hidden" 
                    onChange={handleChange}
                  />
                  
                  {file ? (
                    <div className="flex flex-col items-center">
                      <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
                      <span className="font-bold text-slate-200 text-sm">{file.name}</span>
                      <span className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</span>
                      <div className="flex gap-2 mt-4">
                        <button type="button" onClick={handleResetModal} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-8 h-8 text-slate-500 mb-3" />
                      <span className="font-bold text-slate-300 text-sm mb-1">Cliquer pour uploader</span>
                      <span className="text-xs text-slate-500">ou glisser-déposer le fichier CSV ici</span>
                    </div>
                  )}
                </form>

                {errors.length > 0 && (
                  <div className="mt-4 flex items-start gap-2 bg-rose-500/5 border border-rose-500/20 p-3 rounded-lg text-xs text-rose-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold mb-1">{errors.length} erreurs détectées</div>
                      <ul className="list-disc pl-4 space-y-1">
                        {errors.slice(0, 3).map((e, i) => <li key={i}>{e}</li>)}
                        {errors.length > 3 && <li>...et {errors.length - 3} autres erreurs</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* QuickBooks Skipped Summary / Total Rows Notification */}
            {skippedSummaryRowsWarning !== null && skippedSummaryRowsWarning > 0 && (
              <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                    Lignes de Synthèse / Totaux QuickBooks Ignorées ({skippedSummaryRowsWarning})
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    Le fichier contient {skippedSummaryRowsWarning} ligne(s) de totalisation (sans département, article ou associé valide). Ces lignes ont été automatiquement exclues pour préserver l'intégrité comptable du Grand Livre.
                  </p>
                </div>
              </div>
            )}

            {/* Missing Departments Warning */}
            {pendingDepartments.length > 0 && (
              <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-300 uppercase tracking-widest flex items-center gap-2">
                        Départements Nouveaux Détectés ({pendingDepartments.length} unique{pendingDepartments.length > 1 ? 's' : ''})
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Ces codes de département figurant dans le CSV n'existent pas encore dans l'ERP. Ils seront créés automatiquement.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-900/60 overflow-hidden">
                  {pendingDepartments.map((dept) => (
                    <div key={dept.code} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-800/30 transition">
                      <div className="flex items-center gap-3 shrink-0">
                        <input
                          type="checkbox"
                          id={`chk_dept_${dept.code}`}
                          checked={dept.willCreate}
                          onChange={(e) => handleTogglePendingDept(dept.code, e.target.checked)}
                          className="w-4 h-4 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 cursor-pointer"
                        />
                        <label htmlFor={`chk_dept_${dept.code}`} className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-xs font-bold rounded-lg uppercase cursor-pointer">
                          {dept.code}
                        </label>
                      </div>

                      <div className="flex-1 w-full md:w-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Nom du Département à Créer</label>
                          <input
                            type="text"
                            value={dept.name}
                            onChange={(e) => handleUpdatePendingDeptName(dept.code, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium focus:border-indigo-500 focus:outline-none"
                            placeholder="Ex: Département Marketing"
                          />
                        </div>

                        <div className="mt-2">
                          <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1 flex items-center gap-1">
                            <Users className="w-3 h-3 text-purple-400" /> Lien Personnel HR (Email / Manager)
                          </label>
                          <SearchableSelect
                            options={employees.map(emp => ({ id: emp.id, name: `${emp.name} (${emp.email || 'Pas d\'email'}) - ${emp.position || 'Employé'}` }))}
                            value={dept.linkedEmployeeId || ""}
                            onChange={(val) => handleUpdatePendingDeptEmployee(dept.code, val)}
                            placeholder="-- Aucun Responsable HR Sélectionné --"
                          />
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-slate-400 shrink-0">
                        Succursale: <span className="text-slate-200 font-medium">{dept.branchName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Enterprise GL Duplicate Detection Analysis Bar */}
            {duplicateAnalysis && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${
                    duplicateAnalysis.riskLevel === 'HIGH' || duplicateAnalysis.riskLevel === 'CRITICAL'
                      ? 'bg-rose-950/50 border-rose-800 text-rose-400'
                      : (duplicateAnalysis.riskLevel === 'MEDIUM' ? 'bg-amber-950/50 border-amber-800 text-amber-400' : 'bg-emerald-950/50 border-emerald-800 text-emerald-400')
                  }`}>
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase text-slate-200">
                        Analyse de Doublons Comptables
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 border border-slate-800 text-cyan-400">
                        Période: {duplicateAnalysis.accountingPeriod.periodLabel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {duplicateAnalysis.exactDuplicatesCount > 0
                        ? `${duplicateAnalysis.exactDuplicatesCount} doublon(s) exact(s) détecté(s) sur ${preview.length} transactions (${duplicateAnalysis.similarityScore}% de similarité)`
                        : `Aucun doublon exact détecté (${duplicateAnalysis.similarityScore}% de similarité avec le grand livre actuel).`}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowAnalysisModal(true)}
                  className="px-4 py-2 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/80 text-indigo-300 font-bold text-xs uppercase tracking-wide rounded-xl transition flex items-center gap-2 shrink-0"
                >
                  <BarChart3 className="w-4 h-4 text-indigo-400" /> Inspecter l'Analyse & Doublons
                </button>
              </div>
            )}

            {/* Preview Table */}
            {preview.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" /> Écritures Validées ({preview.length} items)
                </h4>
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto max-h-40">
                  <table className="hidden sm:table w-full text-left font-sans text-xs whitespace-nowrap min-w-max">
                    <thead className="bg-slate-900 sticky top-0 border-b border-slate-800">
                      <tr className="text-[10px] uppercase text-slate-500 tracking-wider font-bold child:py-2 child:px-3">
                        <th>Date</th>
                        <th>Type</th>
                        <th>Catégorie</th>
                        <th>Montant</th>
                        <th>Devise</th>
                        <th>Succursale</th>
                        <th>Département</th>
                        <th>Employé</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                      {preview.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-900/50">
                          <td className="py-2 px-3">{row.date}</td>
                          <td className="py-2 px-3">{row.type}</td>
                          <td className="py-2 px-3">{row.category}</td>
                          <td className="py-2 px-3 text-cyan-400 font-bold">{row.amount}</td>
                          <td className="py-2 px-3">{row.currency}</td>
                          <td className="py-2 px-3">
                            <span className="text-indigo-400 font-sans font-medium">{row.branchName}</span>
                          </td>
                          <td className="py-2 px-3">
                            {row.departmentName ? (
                              <span className="text-teal-400 font-sans font-medium">{row.departmentName}</span>
                            ) : (
                              <span className="text-slate-600 italic">S/O</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {row.employeeName ? (
                              <span className="text-purple-400 font-sans font-medium">{row.employeeName}</span>
                            ) : (
                              <span className="text-slate-600 italic">S/O</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="sm:hidden flex flex-col divide-y divide-slate-800 font-mono text-[10px] text-slate-300">
                    {preview.slice(0, 50).map((row, i) => (
                      <div key={i} className="p-3 flex justify-between items-center hover:bg-slate-900/50">
                        <div>
                          <div className="font-bold text-slate-200">{row.type}</div>
                          <div className="text-slate-500">{row.date}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-cyan-400 text-xs">{row.amount} {row.currency}</div>
                          <div className="text-slate-500 truncate max-w-[100px]">{row.category}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </div>
          )}

          {/* Footer Controls */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-wrap items-center justify-between gap-3">
            <div>
              {(file || preview.length > 0 || isResolving) && !importSummary && (
                <button
                  type="button"
                  onClick={handleResetModal}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-rose-300 hover:text-rose-200 border border-rose-800/40 bg-rose-950/30 hover:bg-rose-900/50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" /> Annuler / Réinitialiser
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {importSummary ? (
                <button 
                  type="button" 
                  onClick={handleCloseDialog} 
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/20 transition flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" /> Terminer & Fermer
                </button>
              ) : (
                <>
                  <button 
                    type="button" 
                    onClick={handleCloseDialog} 
                    className="px-4 py-2 text-xs font-bold rounded-xl text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 transition cursor-pointer"
                  >
                    Fermer
                  </button>

                  {isResolving ? (
                    <button 
                      onClick={handleConfirmQuickBooksMapping}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-900/20 cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" /> Confirmer le Mapping
                    </button>
                  ) : (
                    <>
                      {preview.length === 0 && file && (
                        <button 
                          onClick={handleProcess}
                          disabled={loading}
                          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 text-xs font-bold rounded-xl transition disabled:opacity-50 cursor-pointer"
                        >
                          {loading ? 'Validation...' : 'Valider Fichier'}
                        </button>
                      )}
                      {preview.length > 0 && (
                        <button 
                          onClick={handleStartImportClick}
                          disabled={loading}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 text-xs font-bold rounded-xl transition disabled:opacity-50 shadow-lg shadow-indigo-900/20 cursor-pointer"
                        >
                          {loading ? 'Traitement...' : <><CloudRain className="w-4 h-4" /> Analyse & Lancer Import ({preview.length})</>}
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Enterprise GL Import Analysis & User Confirmation Dialog */}
      {duplicateAnalysis && (
        <ImportAnalysisDialog
          isOpen={showAnalysisModal}
          onClose={() => setShowAnalysisModal(false)}
          onCancelImport={() => {
            setShowAnalysisModal(false);
            handleResetModal();
          }}
          analysis={duplicateAnalysis}
          onConfirmImport={handleExecuteImportWithDecision}
          isImporting={loading}
        />
      )}
    </>
  );
}
