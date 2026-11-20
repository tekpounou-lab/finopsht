import React, { useState, useEffect, useMemo } from "react";
import { 
  UploadCloud, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Download, 
  MapPin, 
  Layers, 
  Users, 
  Info,
  Check,
  Sparkles,
  ShieldAlert
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  BulkEmployeeImportService,
  BulkImportActorContext,
  BulkImportResolutionPlan,
  EMPLOYEE_IMPORT_TEMPLATE_COLUMNS,
  generateEmployeeImportTemplateCsv
} from "../../../services/workforce/BulkEmployeeImportService";
import { EmployeeRepository } from "../../../repositories/EmployeeRepository";
import { Branch, Department, Employee, Business, Role } from "../../../types";
import { db } from "../../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { OrganizationCodeService } from "../../../services/organization/OrganizationCodeService";
import { useOptionalAuth } from "../../../hooks/useAuth";

export type BulkImportEntityType = "branches" | "departments" | "employees";

export interface OrganizationBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  existingEmployees?: Employee[];
  initialType?: BulkImportEntityType;
  currentRole?: Role;
  currentUser?: {
    id?: string;
    uid?: string;
    name?: string;
    role?: Role;
    businessId?: string;
    business_id?: string;
    status?: string;
    permissions?: string[];
  };
  onAddBranch?: (b: Branch) => void;
  onAddDept?: (d: Department) => void;
  onSuccess?: (importedCount: number, entityType: BulkImportEntityType) => void;
}

export const OrganizationBulkImportModal: React.FC<OrganizationBulkImportModalProps> = ({
  isOpen,
  onClose,
  currentBusiness,
  branches,
  departments,
  existingEmployees,
  initialType = "branches",
  currentRole,
  currentUser,
  onAddBranch,
  onAddDept,
  onSuccess,
}) => {
  const authCtx = useOptionalAuth();
  const [entityType, setEntityType] = useState<BulkImportEntityType>(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const resolvedActor = useMemo<BulkImportActorContext | null>(() => {
    const hasPropActor = Boolean(currentRole || currentUser);
    const hasAuthActor = Boolean(authCtx?.role || authCtx?.identity || authCtx?.user);
    if (!hasPropActor && !hasAuthActor) {
      return null;
    }

    const role = (currentUser?.role || currentRole || authCtx?.role || authCtx?.identity?.role || "UNASSIGNED") as Role;
    const uid = currentUser?.uid || currentUser?.id || authCtx?.user?.uid || authCtx?.identity?.user_uid || "";
    const name = currentUser?.name || authCtx?.user?.displayName || authCtx?.identity?.displayName || undefined;
    const actorBusinessId =
      currentUser?.businessId ||
      currentUser?.business_id ||
      authCtx?.businessDoc?.id ||
      authCtx?.identity?.business?.id ||
      currentBusiness?.id;
    const status = currentUser?.status || authCtx?.identity?.identityStatus || "ACTIVE";
    const permissions =
      currentUser?.permissions ||
      ((authCtx?.identity as any)?.permissions as string[] | undefined);

    return {
      uid,
      name,
      role,
      business_id: actorBusinessId,
      businessId: actorBusinessId,
      status,
      ...(Array.isArray(permissions) ? { permissions } : {})
    };
  }, [currentRole, currentUser, authCtx, currentBusiness?.id]);

  // Pre-calculated preview codes for branches/departments tabs
  const previewCodes = useMemo(() => {
    if (parsedRows.length === 0) return [];
    if (entityType === "branches") {
      return OrganizationCodeService.generateBatchBranchCodes(branches, parsedRows.length);
    }
    if (entityType === "departments") {
      return OrganizationCodeService.generateBatchDepartmentCodes(departments, parsedRows.length);
    }
    return [];
  }, [entityType, branches, departments, parsedRows.length]);

  // Dry-run employee import preview plan (ZERO Firestore writes during preview)
  const employeePreviewPlan = useMemo<BulkImportResolutionPlan | null>(() => {
    if (entityType !== "employees" || parsedRows.length === 0 || !currentBusiness?.id) {
      return null;
    }
    return BulkEmployeeImportService.resolveImportPlan(
      currentBusiness.id,
      parsedRows,
      branches,
      departments,
      existingEmployees || [],
      { actor: resolvedActor }
    );
  }, [entityType, parsedRows, currentBusiness?.id, branches, departments, existingEmployees, resolvedActor]);

  useEffect(() => {
    if (initialType) {
      setEntityType(initialType);
    }
  }, [initialType, isOpen]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    let filename = "";
    let headers = "";
    let sampleRows = "";

    if (entityType === "branches") {
      filename = "modele_import_succursales.csv";
      headers = "nom,adresse,ville,telephone,email\n";
      sampleRows = 
        "Succursale Siège,Rue Capois,Port-au-Prince,+509 3700-0001,siege@finops.ht\n" +
        "Succursale Pétion-Ville,Rue Panamericaine,Pétion-Ville,+509 3700-0002,pvil@finops.ht\n" +
        "Succursale Delmas,Delmas 33,Delmas,+509 3700-0003,delmas@finops.ht\n" +
        "Succursale Cap-Haïtien,Rue 18 A,Cap-Haïtien,+509 3700-0004,cap@finops.ht";
    } else if (entityType === "departments") {
      filename = "modele_import_departements.csv";
      headers = "nom,succursale,description\n";
      sampleRows = 
        "Direction Générale,Succursale Siège,Direction exécutive et stratégique\n" +
        "Finance & Comptabilité,Succursale Siège,Gestion financière et comptabilité générale\n" +
        "Opérations & Caisse,Succursale Delmas,Gestion des guichets et opérations de caisse\n" +
        "Ventes & Commercial,Succursale Cap-Haïtien,Développement commercial et prospection\n" +
        "Ressources Humaines,Succursale Siège,Gestion du personnel et de la paie";
    } else {
      filename = "modele_import_collaborateurs.csv";
      const csvContent = generateEmployeeImportTemplateCsv();
      const firstNewline = csvContent.indexOf("\n");
      headers = csvContent.slice(0, firstNewline + 1);
      sampleRows = csvContent.slice(firstNewline + 1);
    }

    const blob = new Blob(["\uFEFF" + headers + sampleRows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Modèle CSV (${entityType}) téléchargé avec succès.`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setValidationErrors([]);
    setLogs([]);

    const lowerName = selectedFile.name.toLowerCase();
    const reader = new FileReader();
    if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt")) {
      reader.onload = (event) => {
        const text = event.target?.result as string;
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            setParsedRows(results.data);
          },
        });
      };
      reader.readAsText(selectedFile);
    } else if (lowerName.match(/\.xlsx?$|\.xls$/)) {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
        setParsedRows(rows);
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedRows.length) return;

    setIsProcessing(true);
    setLogs([`Démarrage de l'import massif pour ${entityType}...`]);
    setValidationErrors([]);

    try {
      if (entityType === "branches") {
        const createdBranches: Branch[] = [];
        const errors: string[] = [];

        const allocatedCodes = OrganizationCodeService.generateBatchBranchCodes(
          branches,
          parsedRows.length
        );

        for (let i = 0; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          const name = row.nom || row.name || row["Nom de la succursale"] || row["Nom"];
          if (!name || typeof name !== "string" || !name.trim()) {
            errors.push(`Ligne ${i + 1}: Le nom de la succursale est obligatoire.`);
            continue;
          }

          const branchId = "br_" + Math.random().toString(36).substring(2, 9);
          const autoCode = allocatedCodes[i];
          const location = (row.ville || row.adresse || row.location || row.address || "Principal").toString().trim();
          const address = (row.adresse || row.address || "").toString().trim() || undefined;
          const phone = (row.telephone || row.phone || "").toString().trim() || undefined;
          const email = (row.email || "").toString().trim() || undefined;

          const branch: Branch = {
            id: branchId,
            business_id: currentBusiness.id,
            businessId: currentBusiness.id,
            name: name.trim(),
            code: autoCode,
            location,
            ...(address ? { address } : {}),
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
            status: "ACTIVE",
            is_active: true,
            isActive: true,
            created_at: new Date().toISOString(),
          } as Branch;

          await setDoc(doc(db, "branches", branchId), branch);
          if (onAddBranch) onAddBranch(branch);
          createdBranches.push(branch);
        }

        if (errors.length > 0 && createdBranches.length === 0) {
          setValidationErrors(errors);
          setIsProcessing(false);
          return;
        }

        setLogs((prev) => [
          ...prev, 
          `Succès : ${createdBranches.length} succursale(s) importée(s) avec codes automatiques FinOps générés (de ${allocatedCodes[0] || ""} à ${allocatedCodes[allocatedCodes.length - 1] || ""}).`
        ]);
        toast.success(`${createdBranches.length} succursale(s) importée(s) avec succès.`);
        if (onSuccess) onSuccess(createdBranches.length, "branches");
        setTimeout(() => onClose(), 1000);

      } else if (entityType === "departments") {
        const createdDepts: Department[] = [];
        const errors: string[] = [];

        const allocatedCodes = OrganizationCodeService.generateBatchDepartmentCodes(
          departments,
          parsedRows.length
        );

        for (let i = 0; i < parsedRows.length; i++) {
          const row = parsedRows[i];
          const name = row.nom || row.name || row["Nom du département"] || row["Nom"];
          if (!name || typeof name !== "string" || !name.trim()) {
            errors.push(`Ligne ${i + 1}: Le nom du département est obligatoire.`);
            continue;
          }

          const rawBranch = (row.succursale || row.branch || row.code_succursale || "").toString().trim();
          const targetBranch = branches.find((b) => 
            (b.code && b.code.toUpperCase() === rawBranch.toUpperCase()) ||
            b.name.toLowerCase().includes(rawBranch.toLowerCase()) ||
            b.id === rawBranch
          );

          if (!targetBranch) {
            errors.push(`Ligne ${i + 1}: Succursale "${rawBranch || "vide"}" introuvable pour le département "${name.trim()}".`);
            continue;
          }

          const deptId = "d_" + Math.random().toString(36).substring(2, 9);
          const autoCode = allocatedCodes[i];
          const description = (row.description || "").toString().trim() || undefined;

          const dept: Department = {
            id: deptId,
            business_id: currentBusiness.id,
            businessId: currentBusiness.id,
            branchId: targetBranch.id,
            branch_id: targetBranch.id,
            name: name.trim(),
            code: autoCode,
            ...(description ? { description } : {}),
            status: "ACTIVE",
            is_active: true,
            isActive: true,
            created_at: new Date().toISOString(),
          } as Department;

          await setDoc(doc(db, "departments", deptId), dept);
          if (onAddDept) onAddDept(dept);
          createdDepts.push(dept);
        }

        if (errors.length > 0 && createdDepts.length === 0) {
          setValidationErrors(errors);
          setIsProcessing(false);
          return;
        }

        setLogs((prev) => [
          ...prev, 
          `Succès : ${createdDepts.length} département(s) importé(s) avec codes automatiques FinOps générés (de ${allocatedCodes[0] || ""} à ${allocatedCodes[allocatedCodes.length - 1] || ""}).`
        ]);
        toast.success(`${createdDepts.length} département(s) importé(s) avec succès.`);
        if (onSuccess) onSuccess(createdDepts.length, "departments");
        setTimeout(() => onClose(), 1000);

      } else {
        // Persist employees and resolved org entities ONLY on explicit user confirmation
        const activeStaff = existingEmployees || (await EmployeeRepository.listAll(currentBusiness.id).catch(() => []));
        const plan = BulkEmployeeImportService.resolveImportPlan(
          currentBusiness.id,
          parsedRows,
          branches,
          departments,
          activeStaff,
          { actor: resolvedActor }
        );

        if (plan.validationErrors && plan.validationErrors.length > 0) {
          setValidationErrors(plan.validationErrors);
          setIsProcessing(false);
          return;
        }

        if (plan.warnings && plan.warnings.length > 0) {
          setLogs((prev) => [...prev, ...plan.warnings.slice(0, 5)]);
        }

        const result = await BulkEmployeeImportService.executeImportPlan(plan, resolvedActor);

        if (result.success) {
          result.createdBranches.forEach((b) => onAddBranch?.(b));
          result.createdDepartments.forEach((d) => onAddDept?.(d));
          setLogs((prev) => [
            ...prev,
            `Importation terminée : ${result.importedEmployeesCount} collaborateur(s), ${result.createdBranchesCount} succursale(s) et ${result.createdDepartmentsCount} département(s) créés.`
          ]);
          toast.success(`${result.importedEmployeesCount} collaborateur(s) importé(s) avec succès.`);
          if (onSuccess) onSuccess(result.importedEmployeesCount, "employees");
          setTimeout(() => onClose(), 1000);
        } else {
          if (result.createdBranches.length > 0) {
            result.createdBranches.forEach((b) => onAddBranch?.(b));
          }
          if (result.createdDepartments.length > 0) {
            result.createdDepartments.forEach((d) => onAddDept?.(d));
          }
          if (result.logs?.length) {
            setLogs((prev) => [...prev, ...result.logs]);
          }
          setValidationErrors([result.error || "Erreur lors du traitement du lot."]);
        }
      }
    } catch (err: any) {
      setValidationErrors([err.message || "Échec inattendu de l'importation."]);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderBranchBadge = (status: "EXISTING" | "NEW" | "BLOCKED") => {
    if (status === "EXISTING") {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
          Succursale existante
        </span>
      );
    }
    if (status === "NEW") {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-semibold">
          Nouvelle succursale
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-semibold">
        Succursale bloquée
      </span>
    );
  };

  const renderDepartmentBadge = (status: "EXISTING" | "NEW" | "BLOCKED") => {
    if (status === "EXISTING") {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
          Département existant
        </span>
      );
    }
    if (status === "NEW") {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[10px] font-semibold">
          Nouveau département
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-semibold">
        Département bloqué
      </span>
    );
  };

  const employeeConfirmDisabled =
    entityType === "employees" &&
    (!employeePreviewPlan ||
      employeePreviewPlan.summary.validRows === 0 ||
      employeePreviewPlan.summary.blockedRowsCount > 0 ||
      Boolean(employeePreviewPlan.actorAuthorization && !employeePreviewPlan.actorAuthorization.allowedToImportEmployees));

  const displayedErrors =
    validationErrors.length > 0
      ? validationErrors
      : entityType === "employees" && employeePreviewPlan?.validationErrors?.length
        ? employeePreviewPlan.validationErrors
        : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-white font-bold text-base">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <span>Importation Massive avec Modèle</span>
              <p className="text-xs font-normal text-slate-400 mt-0.5">
                Intégrez rapidement vos succursales, départements ou collaborateurs via fichier CSV/Excel.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Entity Selector Tabs */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            1. Choisissez le type d'entité à importer :
          </label>
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setEntityType("branches");
                setParsedRows([]);
                setFile(null);
                setValidationErrors([]);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                entityType === "branches"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>Succursales</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEntityType("departments");
                setParsedRows([]);
                setFile(null);
                setValidationErrors([]);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                entityType === "departments"
                  ? "bg-sky-600 text-white shadow-md shadow-sky-900/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Départements</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEntityType("employees");
                setParsedRows([]);
                setFile(null);
                setValidationErrors([]);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                entityType === "employees"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Collaborateurs</span>
            </button>
          </div>
        </div>

        {/* Template Download Banner */}
        <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-slate-200">Besoin du format exact ?</span>
              <p className="text-slate-400 mt-0.5">
                {entityType === "branches" && "Colonnes requises : nom, adresse, ville, telephone, email (Code attribué automatiquement par FinOps)"}
                {entityType === "departments" && "Colonnes requises : nom, succursale, description (Code attribué automatiquement par FinOps)"}
                {entityType === "employees" && `Colonnes du modèle : ${EMPLOYEE_IMPORT_TEMPLATE_COLUMNS.join(", ")}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition shrink-0 ml-3"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Télécharger Modèle CSV</span>
          </button>
        </div>

        {/* Drag & Drop File Input */}
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-2">
            2. Déposez ou sélectionnez votre fichier renseigné :
          </label>
          <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl p-5 text-center bg-slate-950/40 transition-colors">
            <input
              type="file"
              id="bulkOrgFileInput"
              accept=".csv, .tsv, .xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="bulkOrgFileInput" className="cursor-pointer flex flex-col items-center">
              <FileSpreadsheet className="w-10 h-10 text-indigo-400 mb-2" />
              <span className="text-sm font-medium text-slate-200">
                {file ? file.name : "Cliquez pour parcourir un fichier CSV, TSV ou Excel (.xlsx, .xls)"}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Encodage recommandé : UTF-8 (séparateur virgule ou tabulation)
              </span>
            </label>
          </div>
        </div>

        {/* Parsed Rows Preview */}
        {parsedRows.length > 0 && (
          <div className="space-y-3">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs flex justify-between items-center text-slate-300">
              <span className="font-medium">
                <strong className="text-white">{parsedRows.length}</strong> ligne(s) détectée(s) — Prévisualisation sans écriture en base.
              </span>
              {entityType === "employees" && employeePreviewPlan ? (
                employeePreviewPlan.summary.blockedRowsCount === 0 && employeePreviewPlan.summary.validRows > 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    <Check className="w-3.5 h-3.5" /> Prêt à intégrer
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-400 font-semibold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                    <ShieldAlert className="w-3.5 h-3.5" /> {employeePreviewPlan.summary.blockedRowsCount} ligne(s) bloquée(s)
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <Check className="w-3.5 h-3.5" /> Prêt à intégrer
                </span>
              )}
            </div>

            {/* 6 Summary Counts for Employee Import Organizational Resolution */}
            {entityType === "employees" && employeePreviewPlan && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-slate-400 text-[11px]">Employees to import</div>
                  <div className="text-base font-bold text-white" data-testid="summary-employees-to-import">
                    {employeePreviewPlan.summary.validRows}
                  </div>
                </div>
                <div className="bg-slate-950 border border-emerald-500/20 rounded-xl p-2.5">
                  <div className="text-emerald-300 text-[11px]">Existing branches to reuse</div>
                  <div className="text-base font-bold text-emerald-400" data-testid="summary-existing-branches">
                    {employeePreviewPlan.summary.reusedBranchesCount}
                  </div>
                </div>
                <div className="bg-slate-950 border border-amber-500/20 rounded-xl p-2.5">
                  <div className="text-amber-300 text-[11px]">New branches to create</div>
                  <div className="text-base font-bold text-amber-400" data-testid="summary-new-branches">
                    {employeePreviewPlan.summary.newBranchesCount}
                  </div>
                </div>
                <div className="bg-slate-950 border border-emerald-500/20 rounded-xl p-2.5">
                  <div className="text-emerald-300 text-[11px]">Existing departments to reuse</div>
                  <div className="text-base font-bold text-emerald-400" data-testid="summary-existing-departments">
                    {employeePreviewPlan.summary.reusedDepartmentsCount}
                  </div>
                </div>
                <div className="bg-slate-950 border border-sky-500/20 rounded-xl p-2.5">
                  <div className="text-sky-300 text-[11px]">New departments to create</div>
                  <div className="text-base font-bold text-sky-400" data-testid="summary-new-departments">
                    {employeePreviewPlan.summary.newDepartmentsCount}
                  </div>
                </div>
                <div className="bg-slate-950 border border-red-500/20 rounded-xl p-2.5">
                  <div className="text-red-300 text-[11px]">Blocked rows</div>
                  <div className="text-base font-bold text-red-400" data-testid="summary-blocked-rows">
                    {employeePreviewPlan.summary.blockedRowsCount}
                  </div>
                </div>
              </div>
            )}

            {/* Preview table */}
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 text-[11px]">
              <table className="w-full text-left text-slate-300">
                <thead className="bg-slate-900 sticky top-0 text-slate-400 border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="py-1.5 px-3">#</th>
                    <th className="py-1.5 px-3">Nom</th>
                    <th className="py-1.5 px-3">
                      {entityType === "branches" || entityType === "departments"
                        ? "Code FinOps (Automatique)"
                        : "Rôle & Régime"}
                    </th>
                    <th className="py-1.5 px-3">
                      {entityType === "branches"
                        ? "Ville / Adresse"
                        : entityType === "departments"
                          ? "Succursale"
                          : "Succursale & Département"}
                    </th>
                    {entityType === "employees" && (
                      <th className="py-1.5 px-3">Statut résolution</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {entityType === "employees" && employeePreviewPlan
                    ? employeePreviewPlan.parsedRows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className={row.isValid ? "hover:bg-slate-900/30" : "bg-red-950/20"}>
                          <td className="py-1.5 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-1.5 px-3 text-white truncate max-w-[140px]">{row.name}</td>
                          <td className="py-1.5 px-3 text-slate-300">
                            {row.role} • {row.payRegime} ({row.baseSalary} HTG)
                          </td>
                          <td className="py-1.5 px-3 text-slate-300 truncate max-w-[180px]">
                            {row.branchName || "-"} / {row.departmentName || "-"}
                          </td>
                          <td className="py-1.5 px-3">
                            <div className="flex flex-wrap gap-1 font-sans">
                              {renderBranchBadge(row.branchResolutionStatus)}
                              {renderDepartmentBadge(row.departmentResolutionStatus)}
                              {!row.isValid && row.branchResolutionStatus !== "BLOCKED" && row.departmentResolutionStatus !== "BLOCKED" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-semibold">
                                  Bloqué
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    : parsedRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/30">
                          <td className="py-1 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-1 px-3 text-white truncate max-w-[140px]">
                            {row.displayName || row.display_name || row.nom || row.name || row["Nom"] || "-"}
                          </td>
                          <td className="py-1 px-3">
                            {entityType === "branches" ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] font-bold">
                                <Sparkles className="w-2.5 h-2.5" />
                                {previewCodes[idx] || "SUC-AUTO"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono text-[10px] font-bold">
                                <Sparkles className="w-2.5 h-2.5" />
                                {previewCodes[idx] || "DEP-AUTO"}
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-3 text-slate-400 truncate max-w-[160px]">
                            {row.ville || row.adresse || row.succursale || row.poste || "-"}
                          </td>
                        </tr>
                      ))}
                  {entityType === "employees" && parsedRows.length > 10 && (
                    <tr>
                      <td colSpan={5} className="py-1 px-3 text-slate-500 text-center italic">
                        ... et {parsedRows.length - 10} autre(s) ligne(s)
                      </td>
                    </tr>
                  )}
                  {entityType !== "employees" && parsedRows.length > 5 && (
                    <tr>
                      <td colSpan={4} className="py-1 px-3 text-slate-500 text-center italic">
                        ... et {parsedRows.length - 5} autre(s) ligne(s)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Validation / RBAC / Blocked Rows Errors */}
        {displayedErrors.length > 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl max-h-32 overflow-y-auto space-y-1 text-xs text-red-400">
            {displayedErrors.map((err, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}

        {/* Execution Logs */}
        {logs.length > 0 && (
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px] text-slate-400 max-h-32 overflow-y-auto">
            {logs.map((log, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>{log}</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium transition cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!parsedRows.length || isProcessing || employeeConfirmDisabled}
            onClick={handleExecuteImport}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition shadow-lg shadow-indigo-900/30 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>
              {isProcessing
                ? "Importation en cours..."
                : `Confirmer et importer ${
                    entityType === "employees" && employeePreviewPlan
                      ? `${employeePreviewPlan.summary.validRows} collaborateurs`
                      : `${parsedRows.length} ${entityType === "branches" ? "succursales" : entityType === "departments" ? "départements" : "collaborateurs"}`
                  }`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
