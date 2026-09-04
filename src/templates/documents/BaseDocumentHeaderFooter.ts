import { jsPDF } from "jspdf";
import { DocumentTemplateData } from "./types";
import { formatDepartmentName } from "./utils";

export const BaseDocumentHeaderFooter = {
  /**
   * Draws the standardized enterprise header, top bar, and metadata block.
   * Returns the starting Y coordinate for document body content.
   */
  renderHeader(pdf: jsPDF, data: DocumentTemplateData): number {
    const { business, meta, employee } = data;

    // Palette
    const primaryNavy = [15, 23, 42]; // #0f172a
    const accentBlue = [37, 99, 235]; // #2563eb
    const textDark = [51, 65, 85];    // #334155
    const borderGray = [226, 232, 240]; // #e2e8f0

    // Top Navy Accent Bar
    pdf.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.rect(0, 0, 210, 8, "F");

    // Company Branding Header
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text((business.name || "ENTREPRISE FINOPS S.A.").toUpperCase(), 15, 22);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`NIF: ${business.nif || "102-394-881-2"} | Domaine: ${business.domain || "finops-erp.com"}`, 15, 28);
    pdf.text(business.address || "Port-au-Prince, Haiti | Direction Générale des Ressources Humaines", 15, 33);

    // Right Header - Reference & Badge
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(accentBlue[0], accentBlue[1], accentBlue[2]);
    pdf.text(`REF: ${meta.reference}`, 195, 22, { align: "right" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Version: ${meta.version}.0 | Statut: CERTIFIÉ`, 195, 27, { align: "right" });
    pdf.text(`Date: ${new Date(meta.generatedAt).toLocaleDateString("fr-FR")}`, 195, 32, { align: "right" });

    // Separator line
    pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    pdf.setLineWidth(0.5);
    pdf.line(15, 38, 195, 38);

    // Document Title Banner
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(15, 43, 180, 14, 2, 2, "FD");
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text((meta.docTitle || "DOCUMENT RH CERTIFIÉ").toUpperCase(), 105, 52, { align: "center" });

    // Employee Identification Box
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    pdf.roundedRect(15, 62, 180, 32, 2, 2, "D");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.text("IDENTIFICATION DU TITULAIRE", 20, 68);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(textDark[0], textDark[1], textDark[2]);

    const formattedSalary = (employee.baseSalary || 0).toLocaleString("fr-FR") + " HTG";

    pdf.text(`Nom & Prénom: ${employee.name}`, 20, 75);
    pdf.text(`Matricule / ID: ${employee.id}`, 20, 81);
    pdf.text(`Poste Occupé: ${employee.position || "Employé Titulaire"}`, 20, 87);

    const { additionalData } = data;
    const deptDisplayName = formatDepartmentName(employee, additionalData);

    pdf.text(`Adresse Email: ${employee.email}`, 110, 75);
    pdf.text(`Département: ${deptDisplayName}`, 110, 81);
    pdf.text(`Salaire de Base: ${formattedSalary}`, 110, 87);

    // Watermark Background
    pdf.setTextColor(241, 245, 249);
    pdf.setFontSize(38);
    pdf.setFont("helvetica", "bold");
    pdf.text("FINOPS VAULT", 105, 165, { align: "center", angle: 30 });

    return 104; // Return Y start position for content
  },

  /**
   * Renders official signature block and footer with QR verification seal.
   */
  renderFooter(pdf: jsPDF, data: DocumentTemplateData): void {
    const { meta, qrDataUrl, business } = data;

    const primaryNavy = [15, 23, 42];
    const borderGray = [226, 232, 240];

    // Official Seal & Signatures Block
    const sigY = 210;
    pdf.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    pdf.line(15, sigY, 195, sigY);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);

    pdf.text("POUR LA DIRECTION RH", 20, sigY + 8);
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Signé numériquement par: ${meta.generatedBy}`, 20, sigY + 14);
    pdf.text(`Sceau Électronique: ${meta.signature}`, 20, sigY + 19);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.text("SIGNATURE DU TITULAIRE", 130, sigY + 8);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Lu et approuvé le ________________", 130, sigY + 14);

    // Footer with Verification QR Code
    pdf.setFillColor(248, 250, 252);
    pdf.rect(0, 260, 210, 37, "F");

    // QR Image
    if (qrDataUrl) {
      try {
        pdf.addImage(qrDataUrl, "SVG", 15, 263, 28, 28);
      } catch (qrErr) {
        console.warn("[BaseDocumentHeaderFooter] QR render fallback:", qrErr);
      }
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.text("VERIFICATION DE L'AUTHENTICITÉ DU DOCUMENT", 48, 268);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Empreinte Numérique SHA256 : ${meta.checksum}`, 48, 273);
    pdf.text(`Lien de Vérification : https://${business.domain || "finops-erp.com"}/verify?id=${meta.docId}`, 48, 278);
    pdf.text("Document certifié conforme par le coffre-fort numérique FINOPS ERP. Toute altération invalide le sceau.", 48, 283);

    // Bottom navy bar
    pdf.setFillColor(primaryNavy[0], primaryNavy[1], primaryNavy[2]);
    pdf.rect(0, 292, 210, 5, "F");
  }
};
