import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";
import { formatDepartmentName } from "./utils";

export function renderEmploymentCertificate(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, business, additionalData } = data;
  const deptDisplayName = formatDepartmentName(employee, additionalData);

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  pdf.text("La Direction des Ressources Humaines soussignée certifie par la présente que :", 15, startY);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text(`Monsieur / Madame ${employee.name.toUpperCase()}`, 15, startY + 10);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`est employé(e) au sein de notre établissement ${business.name} en qualité de :`, 15, startY + 18);

  pdf.setFont("helvetica", "bold");
  pdf.text(`${employee.position || "Collaborateur Titulaire"} - Département ${deptDisplayName}`, 20, startY + 25);

  pdf.setFont("helvetica", "normal");
  pdf.text(`L'intéressé(e) exerce ses fonctions de manière active et continue au sein de nos services.`, 15, startY + 33);

  pdf.text("Cette attestation est délivrée à l'intéressé(e) sur sa demande pour servir et valoir ce que de droit.", 15, startY + 45);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
