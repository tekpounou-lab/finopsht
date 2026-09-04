import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Proforma, Invoice, InvoiceTemplate, InvoiceLine } from "../../types/crm";

export class PDFGeneratorService {
  /**
   * Replaces all placeholders inside the HTML template with actual document metadata
   */
  public static renderTemplateHtml(
    template: InvoiceTemplate,
    doc: Proforma | Invoice,
    type: "PROFORMA" | "FACTURE"
  ): string {
    const isProforma = type === "PROFORMA";
    const proforma = isProforma ? (doc as Proforma) : null;
    const invoice = !isProforma ? (doc as Invoice) : null;

    const documentType = isProforma ? "Devis Proforma" : "Facture Officielle";
    const documentNumber = isProforma ? (proforma?.proformaNumber || "") : (invoice?.invoiceNumber || "");
    const date = doc.issueDate || "";
    const dueDate = isProforma ? (proforma?.validUntil || "") : (invoice?.dueDate || "");

    const companyName = template.companyName || template.companyHeader?.companyName || "FINOPS ERP Enterprise";
    const companyAddress = template.companyAddress || template.companyHeader?.address || "Port-au-Prince, Haïti";
    const companyNif = template.companyNif || template.companyHeader?.taxId || "000-000-000-0";
    const companyPhone = template.companyPhone || template.companyHeader?.phone || "+509 3000-0000";
    const companyEmail = template.companyEmail || template.companyHeader?.email || "contact@finops-erp.ht";
    const primaryColor = template.primaryColor || "#0ea5e9";
    const bankDetails = template.bankDetails || "";
    const legalMentions = template.legalMentions || "";
    const footerText = template.footerText || "Document généré automatiquement.";

    const clientName = doc.clientName || "Client";
    const clientAddress = doc.clientAddress || "Adresse non spécifiée";
    const clientNif = doc.clientNif || "N/A";
    const clientEmail = doc.clientEmail || "N/A";
    const clientPhone = doc.clientPhone || "N/A";

    const currency = doc.currency || "HTG";
    const paymentTerms = doc.paymentTerms || "Paiement à réception";
    const notes = doc.notes || "Aucune remarque spécifique.";

    // Render items table rows
    const itemsHtml = (doc.items || [])
      .map(
        (item: InvoiceLine, idx: number) => `
      <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding: 10px 12px; font-weight: 500; color: #1e293b;">${item.description}</td>
        <td style="padding: 10px 12px; text-align: right; color: #475569;">${item.quantity}</td>
        <td style="padding: 10px 12px; text-align: right; color: #475569;">${item.unitPrice.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
        <td style="padding: 10px 12px; text-align: right; color: #dc2626;">${item.discountRate > 0 ? `-${item.discountRate}%` : "-"}</td>
        <td style="padding: 10px 12px; text-align: right; color: #475569;">${item.taxRate > 0 ? `${item.taxRate}%` : "0%"}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #0f172a;">${item.total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</td>
      </tr>
    `
      )
      .join("");

    const subtotalFormatted = (doc.subtotal || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    const totalDiscountFormatted = (doc.totalDiscount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    const taxFormatted = (doc.taxAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    const totalFormatted = (doc.totalAmount || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });

    let html = template.htmlContent || template.contentHtml || "";
    if (!html.trim()) {
      return `<div style="padding: 24px; text-align: center; color: #64748b;">Modèle de document vide.</div>`;
    }

    const valueMap: Record<string, string> = {
      primaryColor,
      companyName,
      companyAddress,
      companyNif,
      companyPhone,
      companyEmail,
      documentType,
      documentNumber,
      date,
      dueDate,
      clientName,
      clientAddress,
      clientNif,
      clientEmail,
      clientPhone,
      currency,
      paymentTerms,
      notes,
      items: itemsHtml,
      subtotal: subtotalFormatted,
      totalDiscount: totalDiscountFormatted,
      tax: taxFormatted,
      total: totalFormatted,
      footer: footerText,
      bankDetails: bankDetails ? `<strong>Coordonnées Bancaires :</strong> ${bankDetails}` : "",
      legalMentions: legalMentions,
      DOC_TYPE: documentType,
      DOC_NUMBER: documentNumber,
      COMPANY_NAME: companyName,
      COMPANY_ADDRESS: companyAddress,
      COMPANY_NIF: companyNif,
      COMPANY_PHONE: companyPhone,
      COMPANY_EMAIL: companyEmail,
      CLIENT_NAME: clientName,
      CLIENT_ADDRESS: clientAddress,
      CLIENT_NIF: clientNif,
      CLIENT_EMAIL: clientEmail,
      CLIENT_PHONE: clientPhone,
      ISSUE_DATE: date,
      DUE_DATE: dueDate,
      VALID_UNTIL: dueDate,
      ITEMS_ROWS: itemsHtml,
      TOTAL_AMOUNT: totalFormatted,
      BANK_DETAILS: bankDetails,
      LEGAL_MENTIONS: legalMentions
    };

    // Replace all {key}, {{key}}, {KEY}, {{KEY}} with their value
    for (const [key, value] of Object.entries(valueMap)) {
      html = html.split(`{{${key}}}`).join(value);
      html = html.split(`{${key}}`).join(value);
      html = html.split(`{{${key.toUpperCase()}}}`).join(value);
      html = html.split(`{${key.toUpperCase()}}`).join(value);
      html = html.split(`{{${key.toLowerCase()}}}`).join(value);
      html = html.split(`{${key.toLowerCase()}}`).join(value);
    }

    return html;
  }

  /**
   * Generates a vector PDF document using jsPDF & autoTable
   */
  public static async generatePdf(
    template: InvoiceTemplate,
    doc: Proforma | Invoice,
    type: "PROFORMA" | "FACTURE"
  ): Promise<jsPDF> {
    const isProforma = type === "PROFORMA";
    const docTitle = isProforma ? "DEVIS PROFORMA" : "FACTURE";
    const docNumber = isProforma ? (doc as Proforma).proformaNumber : (doc as Invoice).invoiceNumber;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const companyName = template.companyHeader?.companyName || "FINOPS ERP";
    const companyAddress = template.companyHeader?.address || "Port-au-Prince, Haïti";
    const companyNif = template.companyHeader?.taxId || "000-000-000-0";
    const companyPhone = template.companyHeader?.phone || "+509 3000-0000";

    // Primary Header Banner
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.rect(0, 0, 210, 38, "F");

    // Company Header
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(companyName, 14, 16);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(203, 213, 225); // slate-300
    pdf.text(`${companyAddress} | NIF: ${companyNif} | Tél: ${companyPhone}`, 14, 24);

    // Document Title & Number
    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255, 255, 255);
    pdf.text(docTitle, 196, 16, { align: "right" });

    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(56, 189, 248); // sky-400
    pdf.text(`N° ${docNumber}`, 196, 24, { align: "right" });

    // Client & Dates Box
    pdf.setDrawColor(226, 232, 240); // slate-200
    pdf.setFillColor(248, 250, 252); // slate-50
    pdf.roundedRect(14, 44, 182, 34, 2, 2, "FD");

    // Recipient Info
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.text("DESTINATAIRE / CLIENT", 20, 52);

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text(doc.clientName, 20, 60);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(71, 85, 105);
    if (doc.clientAddress) pdf.text(doc.clientAddress, 20, 66);
    if (doc.clientNif) pdf.text(`NIF: ${doc.clientNif}`, 20, 72);

    // Document Metadata
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(100, 116, 139);
    pdf.text("DÉTAILS DU DOCUMENT", 130, 52);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Date d'émission : ${doc.issueDate}`, 130, 60);
    const dueLabel = isProforma ? "Valable jusqu'au" : "Date d'échéance";
    const dueDateVal = isProforma ? (doc as Proforma).validUntil : (doc as Invoice).dueDate;
    pdf.text(`${dueLabel} : ${dueDateVal}`, 130, 66);
    pdf.text(`Devise : ${doc.currency}`, 130, 72);

    // Items Table via autotable
    const tableRows = (doc.items || []).map((item) => [
      item.description,
      String(item.quantity),
      item.unitPrice.toLocaleString("fr-FR", { minimumFractionDigits: 2 }),
      item.discountRate > 0 ? `-${item.discountRate}%` : "-",
      item.taxRate > 0 ? `${item.taxRate}%` : "0%",
      item.total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })
    ]);

    autoTable(pdf, {
      startY: 84,
      head: [["Désignation", "Qté", "P.U. HT", "Remise", "TVA", `Net (${doc.currency})`]],
      body: tableRows,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9
      },
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "right", cellWidth: 16 },
        2: { halign: "right", cellWidth: 28 },
        3: { halign: "right", cellWidth: 20 },
        4: { halign: "right", cellWidth: 18 },
        5: { halign: "right", cellWidth: 32 }
      },
      margin: { left: 14, right: 14 }
    });

    const finalY = (pdf as any).lastAutoTable.finalY + 8;

    // Totals Box
    const totalsX = 120;
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(71, 85, 105);

    pdf.text("Sous-total :", totalsX, finalY);
    pdf.text(`${doc.subtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${doc.currency}`, 196, finalY, { align: "right" });

    if (doc.totalDiscount > 0) {
      pdf.text("Remise totale :", totalsX, finalY + 6);
      pdf.setTextColor(220, 38, 38);
      pdf.text(`-${doc.totalDiscount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${doc.currency}`, 196, finalY + 6, { align: "right" });
      pdf.setTextColor(71, 85, 105);
    }

    const taxOffset = doc.totalDiscount > 0 ? 12 : 6;
    pdf.text("TVA / Taxes :", totalsX, finalY + taxOffset);
    pdf.text(`+${doc.taxAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${doc.currency}`, 196, finalY + taxOffset, { align: "right" });

    // Grand Total
    const totalOffset = taxOffset + 8;
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(totalsX - 4, finalY + totalOffset - 5, 80, 12, 1, 1, "F");

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text("TOTAL TTC :", totalsX, finalY + totalOffset + 3);
    pdf.text(`${doc.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${doc.currency}`, 196, finalY + totalOffset + 3, { align: "right" });

    // Notes
    if (doc.notes) {
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(100, 116, 139);
      pdf.text("NOTES & INSTRUCTIONS :", 14, finalY);

      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(71, 85, 105);
      const splitNotes = pdf.splitTextToSize(doc.notes, 95);
      pdf.text(splitNotes, 14, finalY + 5);
    }

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(template.footerText || "Document généré par FINOPS ERP.", 105, 285, { align: "center" });

    return pdf;
  }

  /**
   * Downloads the generated PDF directly in browser
   */
  public static async downloadPdf(
    template: InvoiceTemplate,
    doc: Proforma | Invoice,
    type: "PROFORMA" | "FACTURE",
    customFilename?: string
  ): Promise<void> {
    const isProforma = type === "PROFORMA";
    const docNumber = isProforma ? (doc as Proforma).proformaNumber : (doc as Invoice).invoiceNumber;
    const filename = customFilename || `${type.toLowerCase()}_${docNumber || "doc"}.pdf`;

    const pdf = await this.generatePdf(template, doc, type);
    pdf.save(filename);
  }
}
