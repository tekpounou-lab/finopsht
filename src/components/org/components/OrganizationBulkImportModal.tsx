import React, { useState, useEffect } from "react";
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
  Sparkles
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { BulkEmployeeImportService } from "../../../services/workforce/BulkEmployeeImportService";
import { EmployeeRepository } from "../../../repositories/EmployeeRepository";
import { Branch, Department, Employee, Business } from "../../../types";
import { db } from "../../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { OrganizationCodeService } from "../../../services/organization/OrganizationCodeService";

export type BulkImportEntityType = "branches" | "departments" | "employees";

interface OrganizationBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  existingEmployees?: Employee[];
  initialType?: BulkImportEntityType;
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
  onAddBranch,
  onAddDept,
  onSuccess,
}) => {
  const [entityType, setEntityType] = useState<BulkImportEntityType>(initialType);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Pre-calculated preview codes for the loaded batch, handled by FinOps
  const previewCodes = React.useMemo(() => {
    if (parsedRows.length === 0) return [];
    if (entityType === "branches") {
      return OrganizationCodeService.generateBatchBranchCodes(branches, parsedRows.length);
    }
    if (entityType === "departments") {
      return OrganizationCodeService.generateBatchDepartmentCodes(departments, parsedRows.length);
    }
    return [];
  }, [entityType, branches, departments, parsedRows.length]);

  useEffect(() => {
    if (initialType) {
      setEntityType(initialType);
    }
  }, [initialType, isOpen]);

  if (!isOpen) return null;

  // Handle template download
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
      headers = "nom,email,telephone,poste,succursale,departement,salaire_base\n";
      sampleRows = 
        "Jean Baptiste,jean@finops.ht,+509 3700-1111,Responsable Caisse,SIEGE,CAISSE,45000\n" +
        "Marie Claire,marie@finops.ht,+509 3700-2222,Comptable,SIEGE,COMPTA,55000\n" +
        "Pierre Richard,pierre@finops.ht,+509 3700-3333,Agent Commercial,CAPH,VENTES,35000";
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

    const reader = new FileReader();
    if (selectedFile.name.endsWith(".csv")) {
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
    } else if (selectedFile.name.match(/\.xlsx?$|\.xls$/)) {
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
        // Import Branches with FinOps-generated automatic codes
        const createdBranches: Branch[] = [];
        const errors: string[] = [];

        // FinOps side code generation for entire batch
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
          // Auto-generated deterministic code from FinOps engine
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
            address,
            phone,
            email,
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
        // Import Departments with FinOps-generated automatic codes
        const createdDepts: Department[] = [];
        const errors: string[] = [];

        // FinOps side code generation for entire batch
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
          let targetBranch = branches.find((b) => 
            (b.code && b.code.toUpperCase() === rawBranch.toUpperCase()) ||
            b.name.toLowerCase().includes(rawBranch.toLowerCase()) ||
            b.id === rawBranch
          );

          if (!targetBranch && branches.length > 0) {
            targetBranch = branches[0];
          }

          const deptId = "d_" + Math.random().toString(36).substring(2, 9);
          // Auto-generated deterministic code from FinOps engine
          const autoCode = allocatedCodes[i];
          const description = (row.description || "").toString().trim() || undefined;

          const dept: Department = {
            id: deptId,
            business_id: currentBusiness.id,
            businessId: currentBusiness.id,
            branchId: targetBranch?.id || "",
            branch_id: targetBranch?.id || "",
            name: name.trim(),
            code: autoCode,
            description,
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
        // Import Employees (existing workflow)
        const activeStaff = existingEmployees || (await EmployeeRepository.listAll(currentBusiness.id).catch(() => []));
        const plan = BulkEmployeeImportService.resolveImportPlan(
          currentBusiness.id,
          parsedRows,
          branches,
          departments,
          activeStaff
        );

        if (plan.validationErrors && plan.validationErrors.length > 0) {
          setValidationErrors(plan.validationErrors);
          setIsProcessing(false);
          return;
        }

        const result = await BulkEmployeeImportService.executeImportPlan(plan);

        if (result.success) {
          setLogs((prev) => [...prev, `Importation terminée : ${result.importedEmployeesCount} collaborateurs créés.`]);
          toast.success(`${result.importedEmployeesCount} collaborateur(s) importé(s) avec succès.`);
          if (onSuccess) onSuccess(result.importedEmployeesCount, "employees");
          setTimeout(() => onClose(), 1000);
        } else {
          setValidationErrors([result.error || "Erreur lors du traitement du lot."]);
        }
      }
    } catch (err: any) {
      setValidationErrors([err.message || "Échec inattendu de l'importation."]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-5">
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
                {entityType === "employees" && "Colonnes requises : nom, email, telephone, poste, succursale, departement, salaire_base"}
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
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="bulkOrgFileInput" className="cursor-pointer flex flex-col items-center">
              <FileSpreadsheet className="w-10 h-10 text-indigo-400 mb-2" />
              <span className="text-sm font-medium text-slate-200">
                {file ? file.name : "Cliquez pour parcourir un fichier CSV ou Excel (.xlsx, .xls)"}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Encodage recommandé : UTF-8 avec séparateur virgule
              </span>
            </label>
          </div>
        </div>

        {/* Parsed Rows Preview */}
        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs flex justify-between items-center text-slate-300">
              <span className="font-medium">
                📄 <strong className="text-white">{parsedRows.length}</strong> ligne(s) détectée(s) prêtes pour l'import.
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                <Check className="w-3.5 h-3.5" /> Prêt à intégrer
              </span>
            </div>

            {/* Mini preview table */}
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 text-[11px]">
              <table className="w-full text-left text-slate-300">
                <thead className="bg-slate-900 sticky top-0 text-slate-400 border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="py-1.5 px-3">#</th>
                    <th className="py-1.5 px-3">Nom</th>
                    <th className="py-1.5 px-3">
                      {entityType === "branches" || entityType === "departments"
                        ? "Code FinOps (Automatique)"
                        : "Code / Ref"}
                    </th>
                    <th className="py-1.5 px-3">{entityType === "branches" ? "Ville / Adresse" : entityType === "departments" ? "Succursale" : "Poste"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {parsedRows.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/30">
                      <td className="py-1 px-3 text-slate-500">{idx + 1}</td>
                      <td className="py-1 px-3 text-white truncate max-w-[140px]">{row.nom || row.name || row["Nom"] || "-"}</td>
                      <td className="py-1 px-3">
                        {entityType === "branches" ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[10px] font-bold">
                            <Sparkles className="w-2.5 h-2.5" />
                            {previewCodes[idx] || "SUC-AUTO"}
                          </span>
                        ) : entityType === "departments" ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono text-[10px] font-bold">
                            <Sparkles className="w-2.5 h-2.5" />
                            {previewCodes[idx] || "DEP-AUTO"}
                          </span>
                        ) : (
                          <span className="text-slate-400">{row.code || row.code_succursale || row.code_departement || "-"}</span>
                        )}
                      </td>
                      <td className="py-1 px-3 text-slate-400 truncate max-w-[140px]">
                        {row.ville || row.adresse || row.succursale || row.poste || "-"}
                      </td>
                    </tr>
                  ))}
                  {parsedRows.length > 5 && (
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

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl max-h-28 overflow-y-auto space-y-1 text-xs text-red-400">
            {validationErrors.map((err, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}

        {/* Execution Logs */}
        {logs.length > 0 && (
          <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px] text-slate-400">
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
            disabled={!parsedRows.length || isProcessing}
            onClick={handleExecuteImport}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50 transition shadow-lg shadow-indigo-900/30 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isProcessing ? "Importation en cours..." : `Importer ${parsedRows.length} ${entityType === "branches" ? "succursales" : entityType === "departments" ? "départements" : "collaborateurs"}`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
