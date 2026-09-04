import React from "react";
import { Wallet, Download, CheckCircle2 } from "lucide-react";
import { PayrollRecord } from "../../../types";
import jsPDF from "jspdf";

interface PayslipsListProps {
  records: PayrollRecord[];
  employeeId: string;
  tw: any;
}

export const PayslipsList: React.FC<PayslipsListProps> = ({
  records,
  employeeId,
  tw,
}) => {
  const employeeRecords = records
    .filter((r) => r.employeeId === employeeId)
    .sort((a, b) => b.id.localeCompare(a.id));

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("fr-HT", {
      style: "currency",
      currency: "HTG",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleDownloadSlip = (r: PayrollRecord) => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // Colors
      const primaryColor = [15, 23, 42]; // Slate 900
      const accentColor = [6, 182, 212]; // Cyan 500
      const textColor = [51, 65, 85]; // Slate 700

      // Header
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, 210, 40, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(22);
      doc.text("FINOPS ERP", 15, 18);
      
      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      doc.text("PLATEFORME D'ENTREPRISE ET COMPTABILITÉ EN HTG", 15, 24);
      doc.text("SÉCURISÉ & CONFORME AUX LOIS HAÏTIENNES (OFATMA/CNSS)", 15, 29);

      // Receipt Header
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(16);
      doc.text("FICHE DE PAIE / PAYSLIP", 130, 18);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("Helvetica", "normal");
      doc.text(`ID TRACE: ${r.hashSignature || r.id}`, 130, 24);
      doc.text(`CYCLE: ${r.cycleId || "CYCLE COURANT"}`, 130, 29);

      // Section 1: Employee and Company Details
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.text("INFORMATIONS SALARIÉ", 15, 52);
      doc.line(15, 54, 195, 54);

      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(10);
      
      doc.text(`Nom de l'employé : ${r.employeeName}`, 15, 61);
      doc.text(`Identifiant RH : ${r.employeeId}`, 15, 67);
      doc.text(`Mode de rémunération : ${r.pay_profile || "FIXED"}`, 15, 73);

      doc.text(`Statut : ${r.status}`, 120, 61);
      doc.text(`Généré le : ${new Date().toLocaleDateString()}`, 120, 67);
      doc.text(`Devise : HTG (Gourdes)`, 120, 73);

      // Section 2: Compensation Elements Table
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(12);
      doc.text("DÉTAIL DU CALCUL DE REMUNÉRATION", 15, 87);
      doc.line(15, 89, 195, 89);

      // Table headers
      doc.setFillColor(241, 245, 249);
      doc.rect(15, 93, 180, 8, "F");
      
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.text("RUBRIQUE DE PAIE", 18, 98);
      doc.text("GAINS (+)", 110, 98);
      doc.text("DÉDUCTIONS (-)", 150, 98);

      // Table lines
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      
      let y = 107;
      
      // Line 1: Base Salary
      doc.text("Salaire de base contractuel (HTG)", 18, y);
      doc.text(formatCurrency(r.grossSalary), 110, y);
      doc.text("-", 150, y);
      doc.line(15, y+2, 195, y+2);
      y += 8;

      // Line 2: Commissions
      doc.text("Commissions et primes exceptionnelles", 18, y);
      doc.text(formatCurrency(r.commissions || 0), 110, y);
      doc.text("-", 150, y);
      doc.line(15, y+2, 195, y+2);
      y += 8;

      // Line 3: CNSS / ONA
      const cnssVal = typeof r.cnssDeduction === "number" ? r.cnssDeduction : (r.cnss_employee_cents ? r.cnss_employee_cents / 100 : 0);
      doc.text("Retenue ONA / CNSS (6% obligatoire)", 18, y);
      doc.text("-", 110, y);
      doc.text(formatCurrency(cnssVal), 150, y);
      doc.line(15, y+2, 195, y+2);
      y += 8;

      // Line 4: CNS / OFATMA
      const cnsVal = typeof r.cnsDeduction === "number" ? r.cnsDeduction : (r.cns_employee_cents ? r.cns_employee_cents / 100 : 0);
      doc.text("Retenue OFATMA / CNS (2% assurance)", 18, y);
      doc.text("-", 110, y);
      doc.text(formatCurrency(cnsVal), 150, y);
      doc.line(15, y+2, 195, y+2);
      y += 8;

      // Line 5: Advances
      doc.text("Acomptes / Avances sur salaire remboursés", 18, y);
      doc.text("-", 110, y);
      doc.text(formatCurrency(r.advancesTreated || 0), 150, y);
      doc.line(15, y+2, 195, y+2);
      y += 8;

      // Totals Box
      doc.setFillColor(248, 250, 252);
      doc.rect(15, y+4, 180, 20, "F");
      doc.setDrawColor(203, 213, 225);
      doc.rect(15, y+4, 180, 20, "D");

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.text("TOTAL NET PAYÉ EN GOURDES (HTG) :", 20, y+16);
      
      doc.setFontSize(14);
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text(formatCurrency(r.netPaid), 125, y+16);

      // Section 3: Legal Disclaimers
      y += 35;
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.text("CONFORMITÉ COMPTABLE ET AUDIT TRAIL", 15, y);
      doc.line(15, y+2, 195, y+2);
      
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      
      const disclaimer = [
        "Ce bulletin de paie est généré numériquement de manière sécurisée sous la conformité fiscale.",
        "Il constitue une preuve libératoire de paiement du salaire net indiqué après les retenues sociales obligatoires.",
        "Toutes les retenues CNSS et OFATMA sont comptabilisées et créditées directement sur les comptes nationaux.",
        "Signature cryptographique de l'émetteur : APPROVED_BY_ERP_ORCHESTRATOR."
      ];
      
      disclaimer.forEach((line, index) => {
        doc.text(line, 15, y + 8 + (index * 4.5));
      });

      // Output PDF
      doc.save(`Fiche_De_Paie_${r.employeeName.replace(/\s+/g, "_")}_${r.id}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col h-full" id="workspace-payslips-history">
      <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-4 pb-2 border-b border-slate-800/50">
        <Wallet className="w-4.5 h-4.5 text-cyan-400" />
        {tw.fichesPaieRecentes || "HISTORIQUE DE VOS REÇUS DE PAIE"}
      </h3>

      {employeeRecords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-950/40 border border-dashed border-slate-800/60 rounded-2xl">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            {tw.emptyPayroll || "Aucun bulletin de paie disponible"}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto max-h-[350px] space-y-3.5 pr-1">
          {employeeRecords.map((r) => (
            <div
              key={r.id}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-slate-800 hover:bg-slate-950"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-black tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded uppercase">
                    {r.cycleId || "QUINZAINE"}
                  </span>
                  <span className="text-xs font-mono text-slate-500 font-bold">ID: {r.id}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-black font-mono text-slate-100">
                    {formatCurrency(r.netPaid)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono font-bold uppercase">
                    {tw.netPaye || "NET PAYÉ"}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-slate-400">
                  {tw.salaireBrut || "Salaire Brut"} : {formatCurrency(r.grossSalary)} |{" "}
                  {tw.retenues || "Retenues"} :{" "}
                  {formatCurrency((typeof r.cnssDeduction === "number" ? r.cnssDeduction : (r.cnss_employee_cents ? r.cnss_employee_cents / 100 : 0)) + (typeof r.cnsDeduction === "number" ? r.cnsDeduction : (r.cns_employee_cents ? r.cns_employee_cents / 100 : 0)))}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {r.status}
                </span>

                <button
                  type="button"
                  onClick={() => handleDownloadSlip(r)}
                  className="p-2 bg-slate-900 hover:bg-slate-850 hover:text-cyan-400 border border-slate-800 text-slate-400 rounded-lg transition-colors cursor-pointer"
                  title="Télécharger le reçu de paie en PDF"
                >
                  <Download className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
