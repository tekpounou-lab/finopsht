import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderVacationApproval(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const leaveDays = additionalData?.leaveDays || 15;
  const effectiveDate = additionalData?.effectiveDate || new Date().toLocaleDateString("fr-FR");

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("DÉCISION D'ACCORD DE CONGÉ PAYÉ ANNUEL", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Conformément aux dispositions relatives au congé payé légal, la Direction RH autorise :`, 15, startY + 8);

  pdf.setFont("helvetica", "bold");
  pdf.text(`M./Mme ${employee.name} (${employee.position || "Titulaire"})`, 20, startY + 15);

  pdf.setFont("helvetica", "normal");
  pdf.text(`à bénéficier de son congé payé annuel d'une durée de ${leaveDays} jours ouvrables,`, 15, startY + 23);
  pdf.text(`prenant effet à compter du ${effectiveDate}.`, 15, startY + 29);

  pdf.text("Le paiement de l'allocation de congé correspondant est effectué sur le décompte de paie afférent.", 15, startY + 40);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
