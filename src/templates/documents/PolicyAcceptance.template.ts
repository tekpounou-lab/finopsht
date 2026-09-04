import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderPolicyAcceptance(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("ENGAGEMENT D'ADHÉSION AU RÈGLEMENT INTÉRIEUR & CHARTE ÉTIQUE", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`L'employé(e) soussigné(e) ${employee.name} reconnaît avoir pris connaissance du règlement intérieur`, 15, startY + 8);
  pdf.text("et s'engage à en respecter l'ensemble des clauses de confidentialité et de sécurité.", 15, startY + 14);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
