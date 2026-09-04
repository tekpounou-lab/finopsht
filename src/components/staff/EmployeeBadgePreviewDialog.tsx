import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Download, AlertCircle } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { usePrintReady } from '../../hooks/usePrintReady';
import { EmployeeBadgeCard } from './EmployeeBadgeCard';
import { generateBadgePdf } from '../../lib/generateBadgePdf';

interface EmployeeBadgePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  employee: any;
  businessName: string;
  branchName: string;
  departmentName: string;
  badgeToken: string;
  signature: string;
  qrPayload?: string;
}

export function EmployeeBadgePreviewDialog({
  isOpen, onClose, employee, businessName, branchName, departmentName, badgeToken, signature, qrPayload
}: EmployeeBadgePreviewDialogProps) {
  const badgeRef = useRef<HTMLDivElement>(null);
  const { isLayoutReady } = usePrintReady();
  const [printError, setPrintError] = useState<string | null>(null);

  const handlePrint = useReactToPrint({
    contentRef: badgeRef,
    documentTitle: `Badge_${employee?.name || 'Employee'}_${businessName}`,
    onBeforePrint: () => {
      if (!isLayoutReady) {
        setPrintError("Impression indisponible: le layout n'est pas prêt.");
        return Promise.reject("Layout not ready");
      }
      return Promise.resolve();
    },
    onAfterPrint: () => {
      setPrintError(null);
      console.log(JSON.stringify({ action: "PRINT_EMPLOYEE_BADGE", employeeId: employee?.id, timestamp: new Date().toISOString() }));
    },
    onPrintError: (error) => {
      setPrintError("Impression indisponible ou bloquée par le navigateur.");
    }
  });

  const handleDownloadPDF = async () => {
    if (!badgeRef.current) return;
    try {
      setPrintError(null);
      await generateBadgePdf(badgeRef.current, `Badge_${employee?.name || 'Employee'}.pdf`);
      console.log(JSON.stringify({ action: "DOWNLOAD_BADGE_PDF", employeeId: employee?.id, timestamp: new Date().toISOString() }));
    } catch (err) {
      setPrintError("Erreur génération PDF");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:bg-transparent print:p-0">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-full print:border-none print:shadow-none print:max-w-none print:p-0">
        
        {/* Header - Hides on Print */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 print:hidden shrink-0">
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            Preview Before Printing
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 flex flex-col items-center justify-center print:p-0 print:bg-white shrink-0 overflow-x-hidden">
          {printError && (
            <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5 bg-rose-950/30 p-2.5 rounded-lg border border-rose-500/20 print:hidden w-full max-w-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {printError}
            </div>
          )}

          {/* The Badge Container with auto-scaling for mobile */}
          <div className="print:m-0 shadow-2xl print:shadow-none bg-white font-sans rounded-2xl overflow-hidden transform scale-90 xs:scale-100 transition-transform origin-center">
             <EmployeeBadgeCard 
               ref={badgeRef}
               employee={employee}
               businessName={businessName}
               branchName={branchName}
               departmentName={departmentName}
               badgeToken={badgeToken}
               signature={signature}
               qrPayload={qrPayload}
             />
          </div>
          
          <p className="mt-6 text-[10px] text-slate-500 font-black uppercase tracking-widest print:hidden">Visualisation Format Original</p>
        </div>

        {/* Footer Actions - Hides on Print */}
        <div className="p-4 sm:p-6 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center gap-3 print:hidden shrink-0">
          <button 
            type="button"
            className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-750 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-slate-700 disabled:opacity-50 active:scale-95"
            onClick={onClose}
          >
            Fermer
          </button>
          
          <button 
            type="button"
            className="w-full sm:flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/20 flex justify-center items-center gap-2 disabled:opacity-50 active:scale-[0.98]"
            onClick={handleDownloadPDF}
            disabled={!isLayoutReady}
          >
            <Download className="w-4 h-4" />
            Télécharger le Badge (PDF)
          </button>
        </div>
      </div>
      
      {/* Print ONLY CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #finops-root-container {
            display: none;
          }
          .fixed.inset-0 {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            transform: none !important;
          }
          .fixed.inset-0 > div > div:nth-child(2) > div {
            visibility: visible;
            position: absolute;
            left: 0;
            top: 0;
          }
          .fixed.inset-0 > div > div:nth-child(2) > div * {
            visibility: visible;
          }
          @page { size: auto;  margin: 0mm; }
        }
      `}</style>
    </div>,
    document.body
  );
}
