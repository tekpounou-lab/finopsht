import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  FileDown,
  Info,
  CheckCircle2,
  AlertTriangle,
  PlayCircle
} from "lucide-react";
import { Business, Branch, Department, Employee, LedgerTransaction } from "../../types";
import { downloadCsvTemplate, downloadExcelTemplateSimulated } from "../../lib/templateGenerator";
import { parseCsvFile } from "../../lib/bulkTransactionParser";
import { validateTransactions, ValidationResult } from "../../lib/bulkTransactionValidator";
import { buildLedgerTransactions } from "../../lib/bulkTransactionParser";
import ImportPreviewDialog from "../../components/transactions/ImportPreviewDialog";

interface BulkTransactionImporterProps {
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  currentUser: Employee | null;
  onImportComplete: (transactions: LedgerTransaction[]) => void;
}

export default function BulkTransactionImporter({
  currentBusiness,
  branches,
  departments,
  employees,
  currentUser,
  onImportComplete
}: BulkTransactionImporterProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const parsed = await parseCsvFile(file);
      const results = validateTransactions(parsed.data, currentBusiness, branches, departments, employees);
      setValidationResults(results);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la lecture du fichier CSV.");
    } finally {
      setIsProcessing(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const executeImport = async () => {
    if (!validationResults || !currentUser) return;
    setIsProcessing(true);
    
    try {
      // Filter out invalid rows (though UI blocks import if any errors exist currently)
      const validRows = validationResults.filter(r => r.isValid).map(r => r.data);
      
      const newTransactions = buildLedgerTransactions(
        validRows,
        currentBusiness,
        branches,
        departments,
        employees,
        currentUser.id
      );

      // We simulate writing to the ledger by calling the passed callback
      onImportComplete(newTransactions);
      setValidationResults(null); 
    } catch (err) {
      console.error(err);
      alert("Erreur critique lors de l'import. Transaction annulée.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 font-sans text-slate-200 animate-fadeIn" id="bulk-importer-container">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950/60 p-6 rounded-2xl border border-slate-900 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div>
          <span className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-widest px-2 py-1 bg-cyan-950/30 border border-cyan-800/30 rounded inline-block mb-2">
            Module Financier Avancé
          </span>
          <h1 className="text-2xl font-black font-mono uppercase tracking-tight text-slate-100 items-center flex gap-2">
            Importation Massive de Transactions
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Importez rapidement vos ventes, dépenses, avances sur salaire et revenus via CSV. Les données seront automatiquement validées face à votre configuration Tenant et scellées dans le registre financier.
          </p>
        </div>

        <div className="flex flex-row gap-2 shrink-0 z-10 w-full md:w-auto">
          {/* Download Buttons Menu Simulator */}
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <button
              onClick={downloadCsvTemplate}
              className="px-4 py-2 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 text-slate-300 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition"
            >
              <FileDown className="w-4 h-4" /> Template CSV
            </button>
            <button
              onClick={downloadExcelTemplateSimulated}
              className="px-4 py-2 border border-slate-700 hover:border-emerald-500 hover:bg-emerald-950/20 text-slate-300 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Template Excel
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Import Zone */}
        <div className="md:col-span-5 flex flex-col gap-4">
          <div className="p-8 border-2 border-dashed border-slate-800 hover:border-cyan-500/50 rounded-2xl bg-slate-900/40 hover:bg-slate-900/60 transition-all flex flex-col items-center justify-center text-center cursor-pointer relative min-h-[300px]">
            <input 
              type="file" 
              accept=".csv" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              onChange={handleFileUpload}
              ref={fileInputRef}
            />
            
            <div className="p-4 bg-cyan-950/30 rounded-full mb-4">
              <UploadCloud className="w-10 h-10 text-cyan-400" />
            </div>
            
            <h3 className="text-lg font-bold font-mono text-slate-200">
              Déposez votre CSV ici
            </h3>
            <p className="text-xs text-slate-500 mt-2 max-w-xs font-mono">
              Glissez et déposez votre fichier rempli, ou cliquez pour parcourir. Format CSV uniquement. Max 5000 lignes.
            </p>
            
            <div className="mt-6 flex gap-2 text-[10px] uppercase font-mono font-bold text-slate-500">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> UTF-8 Supporté</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Auto-parsing</span>
            </div>
          </div>
        </div>

        {/* Right Column: Guidance */}
        <div className="md:col-span-7 flex flex-col gap-4">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800/80">
              <Info className="w-5 h-5 text-cyan-400" />
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-slate-200">
                Comment préparer votre fichier d'importation
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1.5 bg-emerald-950/40 text-emerald-400 text-[9px] font-bold font-mono rounded-bl-lg border-b border-l border-emerald-900/30">CASHFLOW +</div>
                <h3 className="text-xs font-black font-mono text-slate-100 uppercase">Type: INCOME</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  Augmente vos revenus. Si un <code className="text-cyan-400">employee_email</code> est renseigné, cela génère automatiquement les commissions associées sur le prochain cycle de paie.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-1.5 bg-rose-950/40 text-rose-400 text-[9px] font-bold font-mono rounded-bl-lg border-b border-l border-rose-900/30">CASHFLOW -</div>
                <h3 className="text-xs font-black font-mono text-slate-100 uppercase">Type: EXPENSE</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  Réduit le bilan financier global de la succursale. Les dépenses sont assignées aux départements ciblés via le <code className="text-amber-400">department_code</code> pour l'analyse des coûts.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1.5 bg-purple-950/40 text-purple-400 text-[9px] font-bold font-mono rounded-bl-lg border-b border-l border-purple-900/30">PAYROLL DEBT</div>
                <h3 className="text-xs font-black font-mono text-slate-100 uppercase">Type: ADVANCE</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  Crée une dette salariale personnelle. Exige un <code className="text-cyan-400">employee_email</code> valide. Sera automatiquement déduit du bulletin de paie du collaborateur.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1.5 bg-slate-800 text-slate-400 text-[9px] font-bold font-mono rounded-bl-lg border-b border-l border-slate-700">NEUTRAL</div>
                <h3 className="text-xs font-black font-mono text-slate-100 uppercase">Sécurité Multi-Tenant</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-mono">
                  <AlertTriangle className="w-3 h-3 inline text-amber-500 mr-1" />
                  Avant enregistrement, l'IA FinOps valide rigoureusement que les succursales, employés et montants appartiennent exclusivement à votre Workspace.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Preview Dialog Modal */}
      {validationResults && (
        <ImportPreviewDialog 
          results={validationResults} 
          onCancel={() => setValidationResults(null)}
          onConfirm={executeImport}
          isProcessing={isProcessing}
        />
      )}

    </div>
  );
}
