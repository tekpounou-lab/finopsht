import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderSalaryCertificate(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];
  const accentBlue = [37, 99, 235];
  const borderGray = [226, 232, 240];
  const lightBg = [248, 250, 252];
  const emeraldGreen = [16, 185, 129];

  // Resolve Remuneration Model
  const paymentModel = (
    additionalData?.paymentModel ||
    employee.paymentModel ||
    (employee.payRegime ? employee.payRegime.toUpperCase() : "FIXED")
  ).toUpperCase();

  const isCommissionOnly = paymentModel === "COMMISSION";
  const isHybrid = paymentModel === "HYBRID";
  const isVariableProfile = isCommissionOnly || isHybrid;

  // Base Contractual Salary (0 if pure commission)
  const baseSalaryNum = isCommissionOnly ? 0 : (employee.baseSalary || (employee as any).salaryBaseHtg || additionalData?.salary || 0);
  const formattedBaseSalary = baseSalaryNum.toLocaleString("fr-FR") + " HTG";

  // Last Payroll Indicators
  const lastPayroll = additionalData?.lastPayroll;
  const hasPayrollHistory = !!lastPayroll;
  const lastPeriodLabel = lastPayroll?.cycleName || (lastPayroll ? "Dernier cycle clôturé" : "Aucun historique de paie");
  const lastCommissionAmount = Number(lastPayroll?.commission || 0);
  const lastGrossAmount = Number(lastPayroll?.grossSalary || (isCommissionOnly ? lastCommissionAmount : (baseSalaryNum + lastCommissionAmount)));
  const lastNetAmount = Number(lastPayroll?.netSalary || 0);
  const commissionRateNum = Number(additionalData?.commissionRate ?? employee.commissionRate ?? employee.commission_rate ?? 0);

  // Model Label
  let regimeBadgeText = "RÉGIME FIXE CONTRACTUEL";
  if (isCommissionOnly) regimeBadgeText = "RÉGIME 100% COMMISSION SUR PERFORMANCE";
  if (isHybrid) regimeBadgeText = "RÉGIME HYBRIDE (SALAIRE DE BASE + COMMISSIONS)";

  // Intro paragraph
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  pdf.text(
    "La Direction Financière et des Ressources Humaines certifie par la présente que l'employé(e) désigné(e) ci-dessous :",
    15,
    startY
  );

  // Employee Name + Identification
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text(`${employee.name.toUpperCase()} (Matricule: ${employee.id})`, 15, startY + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(
    `Occupe le poste de ${employee.position || "Collaborateur Titulaire"} et relève du statut salarial suivant :`,
    15,
    startY + 15
  );

  // Remuneration Structure Box
  pdf.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  pdf.roundedRect(15, startY + 19, 180, isVariableProfile ? 76 : 50, 2, 2, "FD");

  // Box Header
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
  pdf.text("STRUCTURE DE LA RÉMUNÉRATION & COMPOSANTES LÉGALES", 20, startY + 26);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text(`MODÈLE : ${regimeBadgeText}`, 190, startY + 26, { align: "right" });

  pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  pdf.line(20, startY + 29, 190, startY + 29);

  // Line 1: Salaire de Base
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text("• Salaire de Base Fixe Contractuel :", 22, startY + 36);
  pdf.setFont("helvetica", "bold");
  pdf.text(isCommissionOnly ? "0 HTG (Non applicable - Profil 100% Variable)" : formattedBaseSalary, 190, startY + 36, { align: "right" });

  if (!isVariableProfile) {
    // Standard Fixed Employee
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
    pdf.text("• Régularité de versement :", 22, startY + 44);
    pdf.setFont("helvetica", "bold");
    pdf.text("Virement Bancaire Mensuel / Quinzaine", 190, startY + 44, { align: "right" });

    pdf.setFont("helvetica", "normal");
    pdf.text("• Déductions Légales Obligatoires :", 22, startY + 52);
    pdf.text("Soumis aux cotisations CNSS (6%) & CNS (2%)", 190, startY + 52, { align: "right" });
  } else {
    // Hybrid or Commission Profile
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
    pdf.text("• Taux de Commission sur Performance / Ventes :", 22, startY + 44);
    pdf.setFont("helvetica", "bold");
    pdf.text(commissionRateNum > 0 ? `${commissionRateNum}% sur chiffre d'affaires / ventes réalisées` : "Taux variable selon grille de performance", 190, startY + 44, { align: "right" });

    // Last payroll data line
    pdf.setFont("helvetica", "normal");
    pdf.text(`• Dernier Cycle de Paie Enregistré (${lastPeriodLabel}) :`, 22, startY + 52);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.text(hasPayrollHistory ? "Activité Traitée & Validée" : "Aucun bulletin émis (Valeurs à 0)", 190, startY + 52, { align: "right" });

    // Details Grid for commissions and gross
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
    pdf.text("  - Commission Perçue au dernier cycle :", 25, startY + 60);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(lastCommissionAmount > 0 ? emeraldGreen[0] : textDark[0], lastCommissionAmount > 0 ? emeraldGreen[1] : textDark[1], lastCommissionAmount > 0 ? emeraldGreen[2] : textDark[2]);
    pdf.text(`${lastCommissionAmount.toLocaleString("fr-FR")} HTG`, 190, startY + 60, { align: "right" });

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
    pdf.text("  - Rémunération Brute Globale (Fixe + Variable) :", 25, startY + 68);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.text(`${lastGrossAmount.toLocaleString("fr-FR")} HTG`, 190, startY + 68, { align: "right" });

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
    pdf.text("  - Rémunération Nette Virée sur Compte :", 25, startY + 76);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
    pdf.text(`${lastNetAmount.toLocaleString("fr-FR")} HTG`, 190, startY + 76, { align: "right" });

    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
    pdf.text("• Déductions Légales Obligatoires :", 22, startY + 84);
    pdf.text("Soumis aux cotisations CNSS (6%) & CNS (2%) selon barèmes légaux", 190, startY + 84, { align: "right" });
  }

  // Legal & Banking Notice
  const noticeY = startY + (isVariableProfile ? 104 : 78);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);

  if (isVariableProfile) {
    if (hasPayrollHistory) {
      pdf.text(
        "Note aux Établissements Bancaires et Financiers :",
        15,
        noticeY
      );
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        "En raison de la composante variable liée à la performance commerciale, les montants réels versés peuvent fluctuer.",
        15,
        noticeY + 5
      );
      pdf.text(
        `Les chiffres présentés ci-dessus reflètent fidèlement les données validées du dernier cycle de paie (${lastPeriodLabel}).`,
        15,
        noticeY + 10
      );
      pdf.text(
        "Ce salaire fait l'objet de virements bancaires réguliers sous déduction des charges sociales obligatoires.",
        15,
        noticeY + 15
      );
    } else {
      pdf.text(
        "Note aux Établissements Bancaires et Financiers :",
        15,
        noticeY
      );
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        "L'employé(e) étant rémunéré(e) sous un régime avec commissions variables et n'ayant pas encore de cycle de paie clôturé,",
        15,
        noticeY + 5
      );
      pdf.text(
        "les données de commissions et de versement effectif restent provisoirement à 0 HTG jusqu'au premier arrêté de paie.",
        15,
        noticeY + 10
      );
    }
  } else {
    pdf.text(
      "Ce salaire régulier est versé par virement bancaire sous déduction des précomptes légaux en vigueur en République d'Haïti.",
      15,
      noticeY
    );
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(
    "La présente attestation est délivrée à l'intéressé(e) sur sa demande pour servir et valoir ce que de droit auprès de tout organisme bancaire ou administratif.",
    15,
    noticeY + (isVariableProfile ? 23 : 9)
  );

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
