import React, { useState, useRef } from "react";
import { QrCode, Printer, Download, ShieldCheck, Eye, Sparkles, Calendar, Clock, MapPin } from "lucide-react";
import { Employee, EmployeeBadge } from "../../../types";
import { InteractiveQrBadge } from "./InteractiveQrBadge";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { QRCodeSVG } from "qrcode.react";

interface MyBadgeSectionProps {
  employee: Employee;
  badge?: EmployeeBadge;
  deptName: string;
  branchName: string;
  tw: any;
  onRequestLeave?: () => void;
}

export const MyBadgeSection: React.FC<MyBadgeSectionProps> = ({
  employee,
  badge,
  deptName,
  branchName,
  tw,
  onRequestLeave,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = async () => {
    if (!downloadRef.current) return;
    setIsDownloading(true);

    try {
      // Ensure the element is visible for capture but off-screen
      const element = downloadRef.current;
      const originalDisplay = element.style.display;
      element.style.display = "flex";
      element.style.position = "fixed";
      element.style.left = "-9999px";
      element.style.top = "0";

      const dataUrl = await toPng(element, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: "#ffffff",
      });

      element.style.display = originalDisplay;
      element.style.position = "relative";
      element.style.left = "auto";

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Badge dimensions (standard ID card size is ~85x54mm, but we'll scale it nicely)
      const badgeWidth = 100; 
      // Proportion calculation from dataUrl if needed, but here we can assume fixed or use a placeholder
      const badgeHeight = 140; 
      
      const x = (pdfWidth - badgeWidth) / 2;
      const y = (pdfHeight - badgeHeight) / 2;

      pdf.setFillColor(248, 250, 252); // slate-50
      pdf.rect(0, 0, pdfWidth, pdfHeight, "F");

      pdf.addImage(dataUrl, "PNG", x, y, badgeWidth, badgeHeight);
      
      // Add some professional footer to the PDF
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184); // slate-400
      pdf.text(`Document officiel FINOPS ERP - Généré le ${new Date().toLocaleString()}`, pdfWidth / 2, pdfHeight - 10, { align: "center" });
      pdf.text(`Identifiant Titulaire: ${employee.id}`, pdfWidth / 2, pdfHeight - 6, { align: "center" });

      pdf.save(`Badge_${employee.name.replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const badgeSignature = badge?.signature || `HMAC::${btoa(employee.id + employee.business_id).substring(0, 16).toUpperCase()}`;
  const payloadValue = badge?.qrPayload || JSON.stringify({
    employee_id: employee.id,
    business_id: employee.business_id,
    branch_id: employee.branchId || "BRANCH_DEFAULT",
    department_id: employee.departmentId || "DEP_DEFAULT",
    role: employee.role,
    signature: badgeSignature
  });

  return (
    <div className="space-y-6" id="view-badge-section">
      {/* Hidden badge for PDF generation */}
      <div 
        ref={downloadRef} 
        style={{ 
          backgroundColor: "#ffffff", 
          color: "#0f172a",
          width: "400px",
          borderRadius: "2.5rem",
          padding: "2.5rem",
          display: "none",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          borderWidth: "12px",
          borderStyle: "solid",
          borderColor: "#f1f5f9"
        }}
      >
        <div className="w-full flex justify-between items-center mb-10 pb-6" style={{ borderBottomWidth: "2px", borderBottomStyle: "solid", borderBottomColor: "#f1f5f9" }}>
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tighter uppercase italic" style={{ color: "#0f172a" }}>FINOPS ERP</span>
            <span className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "#94a3b8" }}>Enterprise Asset</span>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#0f172a" }}>
            <ShieldCheck className="w-6 h-6" style={{ color: "#22d3ee" }} />
          </div>
        </div>

        <div className="w-56 h-56 p-2 rounded-[2rem] border-4 mb-8 flex items-center justify-center relative" style={{ backgroundColor: "#ffffff", borderColor: "#0f172a", borderStyle: "solid" }}>
          <QRCodeSVG 
            value={payloadValue} 
            size={185} 
            level="M" 
            fgColor="#000000" 
            bgColor="#ffffff" 
            includeMargin={true}
            marginSize={2}
          />
          <div className="absolute -bottom-3 text-white text-[10px] font-mono px-4 py-1.5 rounded-full border-2 border-white" style={{ backgroundColor: "#0f172a", borderStyle: "solid", borderColor: "#ffffff" }}>
            HMAC:{badgeSignature.substring(6, 12)}
          </div>
        </div>

        <div className="text-center space-y-2 mb-10">
          <h3 className="font-black text-3xl tracking-tight uppercase" style={{ color: "#0f172a" }}>
            {employee.name}
          </h3>
          <p className="text-sm font-mono font-bold tracking-widest uppercase" style={{ color: "#0891b2" }}>
            {employee.role}
          </p>
          <div className="flex flex-col items-center gap-1 mt-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase" style={{ color: "#64748b" }}>
              <MapPin className="w-3 h-3" style={{ color: "#94a3b8" }} /> {branchName}
            </div>
            <p className="text-[10px] font-mono tracking-widest" style={{ color: "#94a3b8" }}>ID: {employee.id.toUpperCase()}</p>
          </div>
        </div>

        <div className="w-full pt-8 text-[8px] font-mono uppercase tracking-[0.3em] text-center" style={{ borderTopWidth: "2px", borderTopStyle: "solid", borderTopColor: "#f1f5f9", color: "#cbd5e1" }}>
          Certification Sécurité Niveau 4 • SSOT Verified
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            Mon Badge Digital & Hologramme QR
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Pièce d'identité d'entreprise immuable et cryptée par signature HMAC SHA-256.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRequestLeave && (
            <button
              onClick={onRequestLeave}
              className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400/50 text-emerald-400 text-xs font-mono font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/5"
            >
              <Calendar className="w-4 h-4" /> Demander un Congé
            </button>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 hover:border-cyan-400/50 text-cyan-400 text-xs font-mono font-bold rounded-xl transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isDownloading ? (
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isDownloading ? "Génération..." : "Télécharger Badge"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* BADGE SPECIFICATIONS & RULES */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Spécifications du Badge de Sécurité
            </h3>

            <div className="space-y-3 font-sans text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Titulaire du Badge</span>
                <p className="text-slate-100 font-bold font-mono text-sm">{employee.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Rôle ERP</span>
                  <p className="text-cyan-400 font-bold font-mono">{employee.role}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Identifiant Unique</span>
                  <p className="text-amber-400 font-bold font-mono">{employee.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Succursale</span>
                  <p className="text-slate-200 font-bold">{branchName}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                  <span className="text-[10px] font-mono text-slate-400 uppercase font-bold">Département</span>
                  <p className="text-slate-200 font-bold">{deptName}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 text-[11px] text-slate-400 space-y-1 font-mono">
                <p>✓ Badge valide pour pointage sur bornes biométriques et QR kiosk.</p>
                <p>✓ Interdiction de céder ou dupliquer ce badge sous peine de sanctions RH.</p>
              </div>
            </div>
          </div>
        </div>

        {/* BADGE VISUAL CARD */}
        <div className="lg:col-span-5">
          <InteractiveQrBadge employee={employee} badge={badge} tw={tw} />
        </div>
      </div>
    </div>
  );
};
