import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderGenericReport(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, meta, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text((meta.docTitle || "RAPPORT OFFICIEL RH").toUpperCase(), 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Le présent rapport concerne le titulaire ${employee.name} (Matricule: ${employee.id}).`, 15, startY + 8);

  if (additionalData?.notes) {
    pdf.text(`Détails : ${additionalData.notes}`, 15, startY + 16);
  }

  pdf.text("Document certifié conforme et archivé au registre EDMS d'entreprise.", 15, startY + 26);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
