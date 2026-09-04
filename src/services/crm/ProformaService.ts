import { Proforma, Invoice, InvoiceLine, ProformaStatus } from "../../types/crm";
import { ProformaRepository } from "../../repositories/crm/ProformaRepository";
import { InvoiceRepository } from "../../repositories/crm/InvoiceRepository";

export class ProformaService {
  /**
   * Calculates individual line item calculations (discount and tax)
   */
  public static calculateLine(
    description: string,
    quantity: number,
    unitPrice: number,
    discountRate: number = 0,
    taxRate: number = 0,
    existingId?: string
  ): InvoiceLine {
    const validQty = Math.max(0, Number(quantity) || 0);
    const validPrice = Math.max(0, Number(unitPrice) || 0);
    const validDiscount = Math.min(100, Math.max(0, Number(discountRate) || 0));
    const validTaxRate = Math.min(100, Math.max(0, Number(taxRate) || 0));

    const rawSubtotal = validQty * validPrice;
    const discountAmount = rawSubtotal * (validDiscount / 100);
    const subtotal = Math.round((rawSubtotal - discountAmount) * 100) / 100;
    const taxAmount = Math.round((subtotal * (validTaxRate / 100)) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    return {
      id: existingId || `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      description: description.trim(),
      quantity: validQty,
      unitPrice: validPrice,
      discountRate: validDiscount,
      taxRate: validTaxRate,
      subtotal,
      taxAmount,
      total
    };
  }

  /**
   * Calculates aggregated document totals from lines
   */
  public static calculateTotals(items: InvoiceLine[]): {
    subtotal: number;
    totalDiscount: number;
    taxAmount: number;
    totalAmount: number;
  } {
    let grossTotal = 0;
    let totalDiscount = 0;
    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;

    for (const item of items) {
      const lineGross = item.quantity * item.unitPrice;
      const lineDiscount = lineGross * (item.discountRate / 100);
      grossTotal += lineGross;
      totalDiscount += lineDiscount;
      subtotal += item.subtotal;
      taxAmount += item.taxAmount;
      totalAmount += item.total;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }

  /**
   * Generates a standard formatted proforma number (e.g. PRO-2026-0042)
   */
  public static generateProformaNumber(count: number, year: number = new Date().getFullYear()): string {
    const sequence = String(count + 1).padStart(4, "0");
    return `PRO-${year}-${sequence}`;
  }

  /**
   * Validates proforma data before persistence
   */
  public static validateProforma(proforma: Partial<Proforma>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!proforma.businessId) {
      errors.push("Le businessId est obligatoire.");
    }
    if (!proforma.clientName || proforma.clientName.trim() === "") {
      errors.push("Le nom du client / prospect est obligatoire.");
    }
    if (!proforma.items || proforma.items.length === 0) {
      errors.push("Le devis proforma doit contenir au moins une ligne d'article.");
    } else {
      proforma.items.forEach((item, index) => {
        if (!item.description || item.description.trim() === "") {
          errors.push(`La ligne ${index + 1} requiert une description.`);
        }
        if (item.quantity <= 0) {
          errors.push(`La quantité de la ligne ${index + 1} doit être supérieure à 0.`);
        }
        if (item.unitPrice < 0) {
          errors.push(`Le prix unitaire de la ligne ${index + 1} ne peut pas être négatif.`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Converts an ACCEPTED or SENT Proforma directly into a definitive Invoice
   */
  public static async convertToInvoice(
    businessId: string,
    proformaOrId: string | Proforma,
    dueDateDays: number = 30,
    actorName?: string
  ): Promise<{ proforma: Proforma; invoice: Invoice }> {
    let proforma: Proforma | null = null;
    if (typeof proformaOrId === "string") {
      proforma = await ProformaRepository.getProformaById(businessId, proformaOrId);
    } else {
      proforma = proformaOrId;
    }

    if (!proforma) {
      throw new Error(`Proforma introuvable.`);
    }

    const effectiveBusinessId = proforma.businessId || businessId;

    if (proforma.status === "CONVERTED_TO_INVOICE") {
      throw new Error(`Ce devis a déjà été converti en facture (Facture liée: ${proforma.convertedToInvoiceId || "N/A"}).`);
    }

    const existingInvoices = await InvoiceRepository.listInvoicesByBusiness(effectiveBusinessId);
    const invoiceCount = existingInvoices.length;
    const now = new Date();
    const issueDate = now.toISOString().split("T")[0];

    const due = new Date();
    due.setDate(due.getDate() + dueDateDays);
    const dueDate = due.toISOString().split("T")[0];

    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const invoiceNumber = `INV-${now.getFullYear()}-${String(invoiceCount + 1).padStart(4, "0")}`;

    const newInvoice: Invoice = {
      id: invoiceId,
      businessId: effectiveBusinessId,
      invoiceNumber,
      proformaId: proforma.id,
      leadId: proforma.leadId,
      clientName: proforma.clientName,
      clientEmail: proforma.clientEmail,
      clientPhone: proforma.clientPhone,
      clientAddress: proforma.clientAddress,
      clientNif: proforma.clientNif,
      issueDate,
      dueDate,
      currency: proforma.currency,
      items: [...proforma.items],
      subtotal: proforma.subtotal,
      totalDiscount: proforma.totalDiscount,
      taxAmount: proforma.taxAmount,
      totalAmount: proforma.totalAmount,
      status: "DRAFT",
      notes: proforma.notes ? `Généré depuis le devis ${proforma.proformaNumber}. ${proforma.notes}` : `Généré depuis le devis ${proforma.proformaNumber}.`,
      paymentTerms: proforma.paymentTerms || `Paiement à ${dueDateDays} jours`,
      isPaid: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdBy: actorName || "Système CRM"
    };

    // Save newly created invoice
    await InvoiceRepository.saveInvoice(newInvoice);

    // Update proforma state
    const updatedProforma: Proforma = {
      ...proforma,
      status: "CONVERTED_TO_INVOICE",
      convertedToInvoiceId: newInvoice.id,
      convertedAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    await ProformaRepository.saveProforma(updatedProforma);

    return {
      proforma: updatedProforma,
      invoice: newInvoice
    };
  }
}
