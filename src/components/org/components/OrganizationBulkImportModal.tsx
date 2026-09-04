import React, { useState } from "react";
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2, X, FileText } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { BulkEmployeeImportService } from "../../../services/workforce/BulkEmployeeImportService";
import { Branch, Department, Employee, Business } from "../../../types";

interface OrganizationBulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  onSuccess: (importedCount: number) => void;
}

export const OrganizationBulkImportModal: React.FC<OrganizationBulkImportModalProps> = ({
  isOpen,
  onClose,
  currentBusiness,
  branches,
  departments,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  if (!isOpen) return null;

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
    setLogs(["Démarrage de l'analyse du plan d'importation..."]);

    try {
      const plan = BulkEmployeeImportService.resolveImportPlan(
        currentBusiness.id,
        parsedRows,
        branches,
        departments,
        []
      );

      if (plan.validationErrors && plan.validationErrors.length > 0) {
        setValidationErrors(plan.validationErrors);
        setIsProcessing(false);
        return;
      }

      const result = await BulkEmployeeImportService.executeImportPlan(plan);

      if (result.success) {
        setLogs((prev) => [...prev, `Importation terminée: ${result.importedEmployeesCount} employés créés.`]);
        onSuccess(result.importedEmployeesCount);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setValidationErrors([result.error || "Erreur lors du traitement du lot."]);
      }
    } catch (err: any) {
      setValidationErrors([err.message || "Échec inattendu de l'import."]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <UploadCloud className="w-5 h-5 text-indigo-400" />
            <span>Import Massif d'Effectif (CSV / Excel)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/50 rounded-xl p-6 text-center bg-slate-800/30 transition-colors">
          <input
            type="file"
            id="bulkFileInput"
            accept=".csv, .xlsx, .xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <label htmlFor="bulkFileInput" className="cursor-pointer flex flex-col items-center">
            <FileSpreadsheet className="w-10 h-10 text-indigo-400 mb-2" />
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : "Cliquez pour sélectionner un fichier CSV ou Excel"}
            </span>
            <span className="text-xs text-slate-500 mt-1">
              Colonnes requises: nom, email, salaire, poste, succursale, departement
            </span>
          </label>
        </div>

        {parsedRows.length > 0 && (
          <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60 text-xs flex justify-between items-center text-slate-300">
            <span>{parsedRows.length} ligne(s) détectée(s) prêtes à être intégrées.</span>
            <span className="text-emerald-400 font-medium">Format Validé</span>
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg max-h-32 overflow-y-auto space-y-1 text-xs text-red-400">
            {validationErrors.map((err, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
          >
            Fermer
          </button>
          <button
            type="button"
            disabled={!parsedRows.length || isProcessing}
            onClick={handleExecuteImport}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isProcessing ? "Import en cours..." : "Lancer l'importation"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
