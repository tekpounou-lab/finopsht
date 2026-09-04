import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderTerminationLetter(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const reason = additionalData?.reason || "Fin de contrat / Séparation convenue";

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("NOTIFICATION OFFICIELLE DE SÉPARATION RH", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Nous vous notifions par la présente la fin de vos fonctions au sein de l'établissement.`, 15, startY + 8);

  pdf.setFont("helvetica", "bold");
  pdf.text(`Motif / Cadre : ${reason}`, 20, startY + 15);

  pdf.setFont("helvetica", "normal");
  pdf.text("Vos droits au décompte final et certificat de travail vous seront remis selon les règles légales.", 15, startY + 23);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
