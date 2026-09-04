import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";

export function renderLeaveApproval(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, additionalData } = data;

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const leaveDays = additionalData?.leaveDays || 5;
  const effectiveDate = additionalData?.effectiveDate || new Date().toLocaleDateString("fr-FR");
  const endDate = additionalData?.endDate || "À définir";

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("DÉCISION D'AUTORISATION DE CONGÉ SPÉCIAL / MALADIE", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`La Direction des Ressources Humaines valide par la présente la demande de congé soumise par :`, 15, startY + 8);

  pdf.setFont("helvetica", "bold");
  pdf.text(`${employee.name} (${employee.position || "Employé"})`, 20, startY + 15);

  pdf.setFont("helvetica", "normal");
  pdf.text(`- Nombre de jours autorisés : ${leaveDays} jour(s)`, 20, startY + 23);
  pdf.text(`- Date de début : ${effectiveDate}`, 20, startY + 29);
  pdf.text(`- Date de reprise prévue : ${endDate}`, 20, startY + 35);

  pdf.text("Le solde des jours de congé et le maintien du salaire sont traités conformément au statut du personnel.", 15, startY + 46);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
