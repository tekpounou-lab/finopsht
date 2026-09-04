import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { BaseDocumentHeaderFooter } from "./BaseDocumentHeaderFooter";
import { formatDepartmentName } from "./utils";

export function renderEmploymentContract(pdf: jsPDF, data: DocumentTemplateData): void {
  const startY = BaseDocumentHeaderFooter.renderHeader(pdf, data);
  const { employee, business, additionalData } = data;
  const deptDisplayName = formatDepartmentName(employee, additionalData);

  const textDark = [51, 65, 85];
  const primaryNavy = [15, 23, 42];

  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);

  const formattedSalary = (employee.baseSalary || additionalData?.salary || 0).toLocaleString("fr-FR") + " HTG";

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("ENTRE LES SOUSSIGNÉS :", 15, startY);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`1. L'entreprise ${business.name}, représentée par sa Direction des Ressources Humaines.`, 15, startY + 6);
  pdf.text(`2. Et M./Mme ${employee.name}, titulaire du matricule ${employee.id}.`, 15, startY + 12);

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
  pdf.text("IL A ÉTÉ CONVENU CE QUI SUIT :", 15, startY + 22);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(textDark[0], textDark[1], textDark[2]);
  pdf.text(`Article 1 - Engagement : L'employé est engagé sous contrat de travail en qualité de :`, 15, startY + 28);
  pdf.setFont("helvetica", "bold");
  pdf.text(`${employee.position || "Agent Qualifié"} - Département ${deptDisplayName}`, 20, startY + 34);

  pdf.setFont("helvetica", "normal");
  pdf.text(`Article 2 - Rémunération : En contrepartie de ses fonctions, l'employé percevra une rémunération mensuelle de :`, 15, startY + 42);
  pdf.setFont("helvetica", "bold");
  pdf.text(`${formattedSalary} (brut mensuel)`, 20, startY + 48);

  pdf.setFont("helvetica", "normal");
  pdf.text("Article 3 - Obligations : L'employé s'engage à respecter les règlements internes, politiques de confidentialité,", 15, startY + 56);
  pdf.text("et directives de sécurité applicables au sein de l'établissement.", 15, startY + 62);

  pdf.text("Article 4 - Durée & Période d'Essai : Le présent contrat prend effet dès la date d'embauche officielle", 15, startY + 70);
  pdf.text("et demeure régi par les lois du travail en vigueur et la convention collective d'entreprise.", 15, startY + 76);

  pdf.text("Fait de bonne foi, en exemplaires numérisés certifiés et archivés dans le coffre-fort d'entreprise.", 15, startY + 86);

  BaseDocumentHeaderFooter.renderFooter(pdf, data);
}
