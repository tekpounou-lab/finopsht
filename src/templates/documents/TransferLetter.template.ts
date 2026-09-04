import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderTransferLetter(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const newDept = additionalData?.customFields?.newDepartment || "Direction Régionale";
  const effectiveDate = additionalData?.effectiveDate || new Date().toLocaleDateString("fr-FR");

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("DÉCISION DE MUTATION ET REDÉPLOIEMENT INTERNE", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Par la présente, nous vous notifions votre mutation vers le service / département :`, 15, startY + 8);

  pdf.setFont("helvetica", "bold");
  pdf.text(`${newDept}`, 20, startY + 15);

  pdf.setFont("helvetica", "normal");
  pdf.text(`Preneuse d'effet à compter du : ${effectiveDate}`, 15, startY + 23);
  pdf.text("Vos acquis d'ancienneté et avantages sociaux demeurent intégralement préservés.", 15, startY + 31);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
