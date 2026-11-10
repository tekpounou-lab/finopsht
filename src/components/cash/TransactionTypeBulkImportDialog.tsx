import React, { useState } from "react";
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileText
} from "lucide-react";
import { TransactionTypeRepository } from "../../repositories/TransactionTypeRepository";
import { TransactionTypeItem } from "../../types/transactionTypes";
import { toast } from "sonner";

interface TransactionTypeBulkImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  currentRole: string;
  onImportComplete: () => void;
}

export const TransactionTypeBulkImportDialog: React.FC<TransactionTypeBulkImportDialogProps> = ({
  isOpen,
  onClose,
  businessId,
  currentRole,
  onImportComplete
}) => {
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const downloadSampleTemplate = () => {
    const csvContent =
      "code,name,category,behavior,currency,debit_account_code,debit_account_name,credit_account_code,credit_account_name,description\n" +
      '3001,"Vente de Produits","Sales",1,"ALL","1111","Caisse Physique HTG","4000","Produits Ventes Marchandises","Ventes au comptant"\n' +
      '3101,"Prestation Service","Services",1,"ALL","1111","Caisse Physique HTG","4100","Produits Prestations","Facturation services"\n' +
      '6001,"Fournitures Bureau","Operating Expenses",-1,"ALL","6010","Charges Fournitures","1111","Caisse Physique HTG","Achat fournitures caisse"\n' +
      '80001,"Achat Devises USD","Currency Exchange",1,"USD","1121","Caisse USD","1111","Caisse HTG","Change devises guichet"';

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "FINOPS_Template_Transaction_Types.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Modèle CSV téléchargé.");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);

        if (lines.length <= 1) {
          toast.error("Le fichier CSV est vide ou ne contient que les en-têtes.");
          return;
        }

        const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
        const rows: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const rawCols = lines[i].split(",").map((c) => c.replace(/"/g, "").trim());
          if (rawCols.length < 2) continue;

          const rowData: any = {};
          headers.forEach((h, idx) => {
            rowData[h] = rawCols[idx] || "";
          });

          rows.push({
            code: rowData.code || rowData["Code"] || "",
            name: rowData.name || rowData["Nom"] || rowData["Intitulé"] || "",
            category: rowData.category || "Sales",
            behavior: Number(rowData.behavior || 1),
            currency: rowData.currency || "ALL",
            debit_account_code: rowData.debit_account_code || "1111",
            debit_account_name: rowData.debit_account_name || "Caisse",
            credit_account_code: rowData.credit_account_code || "4000",
            credit_account_name: rowData.credit_account_name || "Produits",
            description: rowData.description || ""
          });
        }

        setParsedRows(rows);
        toast.success(`${rows.length} types de transactions détectés dans le CSV.`);
      } catch (err) {
        toast.error("Format de fichier invalide. Assurez-vous d'utiliser un fichier CSV valide.");
      }
    };

    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0) return;

    try {
      setIsProcessing(true);
      const res = await TransactionTypeRepository.bulkImportTransactionTypes(
        parsedRows,
        businessId,
        { role: currentRole }
      );

      if (res.errors.length > 0) {
        toast.warning(
          `Import partiel : ${res.successCount} enregistrés, ${res.errors.length} erreurs.`,
          { duration: 6000 }
        );
      } else {
        toast.success(`Import réussi : ${res.successCount} types de transactions enregistrés !`);
      }

      onImportComplete();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Erreur lors de l'importation massive.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Importation Massive de Types de Transactions
              </h3>
              <p className="text-xs text-slate-400">
                Chargez un catalogue complet en CSV pour une configuration sectorielle rapide.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Download Template & File Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  1. Modèle Standard CSV
                </h4>
                <p className="text-[11px] text-slate-400">
                  Téléchargez la structure normée avec les entêtes requises et des exemples.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadSampleTemplate}
                className="mt-3 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer w-fit"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Télécharger le Modèle
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 mb-1">
                  <Upload className="w-4 h-4 text-teal-400" />
                  2. Téléverser le Fichier
                </h4>
                <p className="text-[11px] text-slate-400">
                  Sélectionnez votre fichier .csv prêt à l'emploi.
                </p>
              </div>
              <label className="mt-3 px-3.5 py-2 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-300 text-xs font-semibold flex items-center gap-2 transition cursor-pointer w-fit">
                <Upload className="w-3.5 h-3.5" />
                <span>{fileName ? fileName : "Choisir un Fichier CSV..."}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Parsed Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Aperçu des Données à Importer ({parsedRows.length} lignes)
                </h4>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 sticky top-0 text-[10px] uppercase font-bold text-slate-400">
                    <tr>
                      <th className="p-2.5">Code</th>
                      <th className="p-2.5">Intitulé</th>
                      <th className="p-2.5">Catégorie</th>
                      <th className="p-2.5">Behavior</th>
                      <th className="p-2.5">Débit</th>
                      <th className="p-2.5">Crédit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50">
                        <td className="p-2.5 text-cyan-400 font-bold">{row.code}</td>
                        <td className="p-2.5 font-sans font-medium text-slate-200">{row.name}</td>
                        <td className="p-2.5 text-slate-400">{row.category}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              row.behavior === 1
                                ? "bg-emerald-500/10 text-emerald-400"
                                : row.behavior === -1
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {row.behavior > 0 ? `+${row.behavior}` : row.behavior}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-300">{row.debit_account_code}</td>
                        <td className="p-2.5 text-slate-300">{row.credit_account_code}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={parsedRows.length === 0 || isProcessing}
              onClick={handleConfirmImport}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-teal-500/10"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {isProcessing ? "Importation en cours..." : `Importer ${parsedRows.length} Types`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
