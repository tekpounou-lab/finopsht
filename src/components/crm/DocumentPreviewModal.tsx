import React, { useState } from "react";
import { X, Printer, Download, FileText, CheckCircle2, Copy } from "lucide-react";
import { Proforma, Invoice, InvoiceTemplate } from "../../types/crm";
import { PDFGeneratorService } from "../../services/crm/PDFGeneratorService";
import { toast } from "sonner";

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: Proforma | Invoice | null;
  template: InvoiceTemplate;
  type: "PROFORMA" | "FACTURE";
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  document,
  template,
  type
}) => {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!isOpen || !document) return null;

  const isProforma = type === "PROFORMA";
  const docNumber = isProforma ? (document as Proforma).proformaNumber : (document as Invoice).invoiceNumber;
  const renderedHtml = PDFGeneratorService.renderTemplateHtml(template, document, type);

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${type === "PROFORMA" ? "Devis" : "Facture"} ${docNumber}</title>
            <style>
              body { margin: 0; padding: 20px; background: #fff; }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            ${renderedHtml}
            <script>
              window.onload = function() {
                window.print();
                window.close();
              }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      toast.error("Impossible d'ouvrir la fenêtre d'impression. Veuillez autoriser les popups.");
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      await PDFGeneratorService.downloadPdf(template, document, type);
      toast.success(`Document ${docNumber} téléchargé en PDF.`);
    } catch (err: any) {
      console.error("[DocumentPreviewModal] Error generating PDF:", err);
      toast.error("Erreur lors de la génération du PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div id="modal-document-preview-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div id="modal-document-preview-container" className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{isProforma ? "Devis Proforma" : "Facture Officielle"}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-sky-400 font-mono font-medium">
                  {docNumber}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Client : <strong className="text-slate-200">{document.clientName}</strong> &bull; Total : <strong className="text-emerald-400">{document.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {document.currency}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-preview-print"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Imprimer le document"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimer</span>
            </button>

            <button
              id="btn-preview-download-pdf"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition shadow-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? "Génération..." : "Télécharger PDF"}</span>
            </button>

            <button
              id="btn-preview-close"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Document Preview Scroll Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/50 flex justify-center">
          <div 
            id="rendered-document-content" 
            className="w-full max-w-3xl bg-white text-slate-900 rounded-lg shadow-xl overflow-hidden p-6 sm:p-8"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-900/90 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Modèle appliqué : {template.templateName}</span>
          </div>
          <button
            id="btn-preview-close-footer"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
          >
            Fermer l'aperçu
          </button>
        </div>
      </div>
    </div>
  );
};
