import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderDisciplinaryLetter(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const notes = additionalData?.notes || "Avertissement formel concernant le respect du règlement d'entreprise.";

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("NOTIFICATION DISCIPLINAIRE / MISE EN DEMEURE", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Nous adressons la présente notification à l'attention de M./Mme ${employee.name}.`, 15, startY + 8);

  pdf.setFont("helvetica", "bold");
  pdf.text(`Motif / Précisions : ${notes}`, 20, startY + 15);

  pdf.setFont("helvetica", "normal");
  pdf.text("Ce document est classé au dossier RH sous référence de traçabilité d'entreprise.", 15, startY + 23);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
