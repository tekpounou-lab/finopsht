import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderPromotionLetter(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const newPosition = additionalData?.customFields?.newPosition || employee.position || "Superviseur RH";
  const newSalary = additionalData?.salary ? additionalData.salary.toLocaleString("fr-FR") + " HTG" : "Revalorisé";

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("NOTIFICATION OFFICIELLE DE PROMOTION ET REVALORISATION", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Nous avons le plaisir de vous informer que suite à votre évaluation positive, vous êtes promu(e) au poste de :`, 15, startY + 8);

  pdf.setFont("helvetica", "bold");
  pdf.text(`${newPosition}`, 20, startY + 15);

  pdf.setFont("helvetica", "normal");
  pdf.text(`Cette promotion s'accompagne d'un nouveau salaire mensuel brut de : ${newSalary}`, 15, startY + 23);
  pdf.text("Toutes nos félicitations pour votre engagement continu au sein de l'entreprise.", 15, startY + 33);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
