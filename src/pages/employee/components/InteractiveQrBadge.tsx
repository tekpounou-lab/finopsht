import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { QrCode, Download, X, ShieldCheck, Clock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "motion/react";
import { Employee, EmployeeBadge } from "../../../types";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

interface InteractiveQrBadgeProps {
  employee: Employee;
  badge?: EmployeeBadge;
  tw: any;
}

export const InteractiveQrBadge: React.FC<InteractiveQrBadgeProps> = ({
  employee,
  badge,
  tw,
}) => {
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);

  const badgeSignature = badge?.signature || `HMAC::${btoa(employee.id + employee.business_id).substring(0, 16).toUpperCase()}`;
  const payloadValue = badge?.qrPayload || JSON.stringify({
    employee_id: employee.id,
    business_id: employee.business_id,
    branch_id: employee.branchId || "BRANCH_DEFAULT",
    department_id: employee.departmentId || "DEP_DEFAULT",
    role: employee.role,
    signature: badgeSignature
  });

  const handleDownload = async () => {
    if (!badgeRef.current) return;
    setIsDownloading(true);

    try {
      const dataUrl = await toPng(badgeRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: "#ffffff",
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const badgeWidth = 100;
      const badgeHeight = 140; // Approx proportion
      
      const x = (pdfWidth - badgeWidth) / 2;
      const y = (pdfHeight - badgeHeight) / 2;

      pdf.setFillColor(248, 250, 252);
      pdf.rect(0, 0, pdfWidth, pdfHeight, "F");
      pdf.addImage(dataUrl, "PNG", x, y, badgeWidth, badgeHeight);
      pdf.save(`Badge_${employee.name.replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      console.error("Download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <>
      {/* TRIGGER CARD */}
      <div
        id="workspace-qr-badge"
        onClick={() => setShowPrintModal(true)}
        className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center justify-between group cursor-pointer transition-all duration-300 hover:bg-slate-900/60 hover:border-cyan-500/30 hover:shadow-[0_0_25px_rgba(6,182,212,0.05)]"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
            <QrCode className="w-7 h-7 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-slate-200 font-bold text-sm uppercase tracking-tight">Badge d'Identité Numérique</h4>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-bold animate-pulse">ACTIVE</span>
            </div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Digital Access Control • SSOT Verified</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-1">
          <div className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[9px] font-mono text-cyan-500/70 group-hover:text-cyan-400 transition-colors">
            {employee.role}
          </div>
          <span className="text-[9px] text-slate-600 font-mono">Cliquer pour agrandir</span>
        </div>
      </div>

      {/* DIGITAL ID MODAL */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showPrintModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowPrintModal(false)}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
              />
              
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 40 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 40 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative w-full max-w-sm z-[10000]"
              >
                {/* Close Button - More prominent */}
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="absolute -top-14 right-0 p-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl text-slate-400 hover:text-white transition-all cursor-pointer shadow-xl active:scale-90"
                >
                  <X className="w-6 h-6" />
                </button>

                {/* Physical Badge Layout */}
                <div 
                  ref={badgeRef}
                  style={{ 
                    backgroundColor: "#ffffff", 
                    color: "#0f172a",
                    borderRadius: "2.5rem",
                    padding: "2.5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    overflow: "hidden",
                    position: "relative",
                    borderWidth: "12px",
                    borderStyle: "solid",
                    borderColor: "#f1f5f9",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)"
                  }}
                >
                  {/* Security Hologram Effect Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-transparent pointer-events-none" />
                  
                  <div className="w-full flex justify-between items-center mb-8 pb-4" style={{ borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: "#f1f5f9" }}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black tracking-tighter uppercase italic" style={{ color: "#0f172a" }}>FINOPS ERP</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest leading-none mt-0.5" style={{ color: "#94a3b8" }}>Global Enterprise</span>
                    </div>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#0f172a" }}>
                      <ShieldCheck className="w-5 h-5" style={{ color: "#22d3ee" }} />
                    </div>
                  </div>

                  <div className="w-48 h-48 p-2 rounded-3xl border-4 mb-6 flex items-center justify-center shadow-inner relative" style={{ backgroundColor: "#ffffff", borderColor: "#0f172a", borderStyle: "solid" }}>
                    <QRCodeSVG 
                      value={payloadValue} 
                      size={155} 
                      level="M" 
                      fgColor="#000000" 
                      bgColor="#ffffff" 
                      includeMargin={true}
                      marginSize={2}
                    />
                    <div className="absolute -bottom-2 text-white text-[8px] font-mono px-3 py-1 rounded-full border-2 border-white" style={{ backgroundColor: "#0f172a", borderStyle: "solid", borderColor: "#ffffff" }}>
                      HMAC:{badgeSignature.substring(6, 12)}
                    </div>
                  </div>

                  <div className="text-center space-y-1 mb-8">
                    <h3 className="font-black text-2xl tracking-tight uppercase" style={{ color: "#0f172a" }}>
                      {employee.name}
                    </h3>
                    <p className="text-xs font-mono font-bold tracking-widest uppercase" style={{ color: "#0891b2" }}>
                      {employee.role}
                    </p>
                    <p className="text-[9px] font-mono mt-2" style={{ color: "#94a3b8" }}>ID: {employee.id.substring(0, 12).toUpperCase()}</p>
                  </div>

                  <div className="w-full pt-6 border-t border-slate-100 flex gap-3">
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="flex-1 py-3 bg-slate-950 hover:bg-slate-850 text-white rounded-2xl text-xs font-bold font-mono uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Clock className="w-4 h-4 animate-spin text-cyan-400" />
                      ) : (
                        <Download className="w-4 h-4 text-cyan-400" />
                      )}
                      {isDownloading ? "En cours..." : "Télécharger"}
                    </button>
                    <button
                      onClick={() => setShowPrintModal(false)}
                      className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-xs font-bold font-mono uppercase tracking-wider cursor-pointer active:scale-95 transition-all"
                    >
                      Fermer
                    </button>
                  </div>

                  <div className="mt-6 text-[7px] text-slate-300 font-mono uppercase tracking-[0.2em] text-center">
                    Certification Sécurité Niveau 4 • Expire: 2027
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
