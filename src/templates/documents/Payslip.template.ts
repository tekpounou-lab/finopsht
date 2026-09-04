import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderPayslip(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];
  const accentBlue = [37, 99, 235];

  const cycleLabel = additionalData?.cycleName || "Période Mensuelle Courante";
  const gross = additionalData?.grossSalary || employee.baseSalary || 0;
  const net = additionalData?.netSalary || Math.round(gross * 0.92);
  const cnss = additionalData?.cnssDeduction || Math.round(gross * 0.06);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text(`DÉCOMPTE DE PAIE CERTIFIÉ - PÉRIODE : ${cycleLabel.toUpperCase()}`, 15, startY);

  // Table Box
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.rect(15, startY + 6, 180, 50, "FD");

  // Table Header
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("Rubrique / Cotisation Sociale", 20, startY + 12);
  pdf.text("Taux / Base", 110, startY + 12);
  pdf.text("Montant (HTG)", 160, startY + 12);
  pdf.line(15, startY + 15, 195, startY + 15);

  // Table Rows
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);

  pdf.text("1. Salaire de Base Brut", 20, startY + 22);
  pdf.text("Contractuel", 110, startY + 22);
  pdf.text(`${gross.toLocaleString("fr-FR")} HTG`, 160, startY + 22);

  pdf.text("2. Cotisation CNSS (Assurance Vieillesse)", 20, startY + 29);
  pdf.text("6.00%", 110, startY + 29);
  pdf.text(`- ${cnss.toLocaleString("fr-FR")} HTG`, 160, startY + 29);

  pdf.text("3. Cotisation OFATMA (Accident du Travail)", 20, startY + 36);
  pdf.text("2.00%", 110, startY + 36);
  pdf.text("Employeur", 160, startY + 36);

  pdf.line(15, startY + 41, 195, startY + 41);

  // Total Net
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.5);
  pdf.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
  pdf.text("NET À PAYER SANS SOUSTRACTION", 20, startY + 48);
  pdf.text(`${net.toLocaleString("fr-FR")} HTG`, 160, startY + 48);

  // Informational Notice
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(100, 116, 139);
  pdf.text("Bulletin de paie généré numériquement, faisant foi de virement bancaire ou de paiement en caisse.", 15, startY + 65);
  pdf.text("Les cotisations CNSS et OFATMA sont versées conformément au Code du Travail d'Haïti.", 15, startY + 71);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
