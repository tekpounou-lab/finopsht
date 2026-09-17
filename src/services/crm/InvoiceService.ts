import { Invoice, InvoiceLine, InvoiceStatus, Proforma } from "../../types/crm";
import { LedgerTransaction } from "../../types";
import { InvoiceRepository } from "../../repositories/crm/InvoiceRepository";
import { ProformaRepository } from "../../repositories/crm/ProformaRepository";
import { LedgerRepository } from "../../repositories/LedgerRepository";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../AccountingEngine";
import { InvoiceIntegritySchema } from "../../validations/integritySchemas";
import { EventBus } from "../../modules/runtime/EventBus";
import { finopsEventOrchestrator } from "../finopsEventOrchestrator";

export class InvoiceService {
  /**
   * Computes totals for a single invoice line
   */
  public static calculateLine(line: Partial<InvoiceLine>): InvoiceLine {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discountRate = Number(line.discountRate) || 0;
    const taxRate = Number(line.taxRate) || 0;

    const rawTotal = qty * price;
    const discountAmount = rawTotal * (discountRate / 100);
    const subtotal = rawTotal - discountAmount;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    return {
      id: line.id || `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      description: line.description || "",
      quantity: qty,
      unitPrice: price,
      discountRate,
      discountAmount,
      taxRate,
      subtotal,
      taxAmount,
      total
    };
  }

  /**
   * Computes totals across all lines of an invoice or proforma
   */
  public static calculateTotals(items: InvoiceLine[]): {
    subtotal: number;
    totalDiscount: number;
    taxAmount: number;
    totalAmount: number;
  } {
    let subtotal = 0;
    let totalDiscount = 0;
    let taxAmount = 0;
    let totalAmount = 0;

    items.forEach((item) => {
      const raw = item.quantity * item.unitPrice;
      const disc = raw * (item.discountRate / 100);
      totalDiscount += disc;
      subtotal += (raw - disc);
      taxAmount += item.taxAmount;
      totalAmount += item.total;
    });

    return {
      subtotal,
      totalDiscount,
      taxAmount,
      totalAmount
    };
  }

  /**
   * Generates a standard formatted invoice number (e.g. INV-2026-0042)
   */
  public static generateInvoiceNumber(count: number, year: number = new Date().getFullYear()): string {
    const sequence = String(count + 1).padStart(4, "0");
    return `INV-${year}-${sequence}`;
  }

  /**
   * Validates invoice data using Zod integrity schema
   */
  public static validateInvoice(invoice: Partial<Invoice>): { isValid: boolean; errors: string[] } {
    const parsed = InvoiceIntegritySchema.safeParse(invoice);
    if (!parsed.success) {
      return {
        isValid: false,
        errors: parsed.error.issues.map((err) => `${err.path.join(".")}: ${err.message}`)
      };
    }
    return {
      isValid: true,
      errors: []
    };
  }

  /**
   * Converts an accepted Proforma into an Invoice and emits PROFORMA_CONVERTED event
   */
  public static async convertProformaToInvoice(
    businessId: string,
    proformaId: string,
    count: number,
    actor?: { uid: string; email: string; name?: string }
  ): Promise<Invoice> {
    const proforma = await ProformaRepository.getProformaById(businessId, proformaId);
    if (!proforma) {
      throw new Error(`Proforma [${proformaId}] introuvable.`);
    }

    const now = new Date().toISOString();
    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const invoiceNumber = this.generateInvoiceNumber(count);

    const invoice: Invoice = {
      id: invoiceId,
      businessId,
      invoiceNumber,
      proformaId: proforma.id,
      leadId: proforma.leadId,
      clientName: proforma.clientName,
      clientEmail: proforma.clientEmail,
      clientPhone: proforma.clientPhone,
      clientAddress: proforma.clientAddress,
      clientNif: proforma.clientNif,
      issueDate: now.split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      currency: proforma.currency,
      items: proforma.items,
      subtotal: proforma.subtotal,
      totalDiscount: proforma.totalDiscount,
      taxAmount: proforma.taxAmount,
      totalAmount: proforma.totalAmount,
      amountPaid: 0,
      status: "ISSUED",
      isPaid: false,
      createdAt: now,
      updatedAt: now
    };

    // Save invoice
    await InvoiceRepository.saveInvoice(invoice);

    // Update proforma status
    await ProformaRepository.updateStatus(businessId, proformaId, "CONVERTED_TO_INVOICE");

    // Emit PROFORMA_CONVERTED and INVOICE_CREATED events
    EventBus.publish(
      EventBus.createEvent({
        correlationId: `corr_proforma_conv_${proforma.id}`,
        businessId,
        module: "CRM",
        aggregate: "Proforma",
        type: "ProformaConverted",
        eventType: "PROFORMA_CONVERTED",
        source: "InvoiceService",
        payload: {
          proformaId: proforma.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice.totalAmount,
          businessId
        }
      })
    );

    EventBus.publish(
      EventBus.createEvent({
        correlationId: `corr_inv_create_${invoice.id}`,
        businessId,
        module: "CRM",
        aggregate: "Invoice",
        type: "InvoiceCreated",
        eventType: "INVOICE_CREATED",
        source: "InvoiceService",
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          totalAmount: invoice.totalAmount,
          businessId
        }
      })
    );

    finopsEventOrchestrator.emit("PROFORMA_CONVERTED", businessId, {
      proformaId: proforma.id,
      invoiceId: invoice.id,
      businessId
    }).catch(() => {});

    return invoice;
  }

  /**
   * Posts an issued/sent invoice directly to the General Ledger (double-entry).
   * Double-Entry Accounting:
   *  - Debit: 1200_ACCOUNTS_RECEIVABLE (Créance Client - Total TTC)
   *  - Credit: 4000_OPERATING_REVENUE (Produits d'exploitation / Ventes HT)
   *  - Credit: 2200_TAXES_PAYABLE (TVA Collectée / Taxes)
   * Emits INVOICE_POSTED event.
   */
  public static async postInvoiceToLedger(
    invoice: Invoice,
    branchId?: string,
    departmentId?: string,
    actor?: { uid: string; email: string; name?: string }
  ): Promise<LedgerTransaction> {
    const now = new Date().toISOString();
    const txId = `tx_inv_${invoice.id}`;
    const amount = Number(invoice.totalAmount) || 0;
    const amountCents = Math.round(amount * 100);

    const ledgerTx: LedgerTransaction = {
      id: txId,
      business_id: invoice.businessId,
      branchId: branchId || "main",
      branch_id: branchId || "main",
      department_id: departmentId,
      departmentId: departmentId,
      type: "INCOME",
      amount: amount,
      amount_cents: amountCents,
      date: invoice.issueDate || now.split("T")[0],
      description: `Facture Client ${invoice.invoiceNumber} - ${invoice.clientName}`,
      category: "SALES",
      signerId: actor?.uid || "system",
      currency: (invoice.currency as any) || "HTG",
      source: "SYSTEM",
      status: "POSTED",
      isImmutable: true,
      debit_account: DEFAULT_CHART_OF_ACCOUNTS.ASSETS.RECEIVABLES || "1200_ACCOUNTS_RECEIVABLE",
      credit_account: DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING || "4000_OPERATING_REVENUE",
      debit: amount,
      credit: amount,
      debit_cents: amountCents,
      credit_cents: amountCents,
      metadata: {
        crmInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        clientNif: invoice.clientNif || "",
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        currency: invoice.currency,
        postedByUid: actor?.uid,
        postedByEmail: actor?.email
      },
      created_at: now,
      updated_at: now
    };

    // Save to General Ledger
    await LedgerRepository.save(ledgerTx);

    // Link transaction ID on the invoice
    await InvoiceRepository.linkAccountingTransaction(invoice.businessId, invoice.id, txId);

    // Emit INVOICE_POSTED event
    EventBus.publish(
      EventBus.createEvent({
        correlationId: `corr_inv_post_${invoice.id}`,
        businessId: invoice.businessId,
        module: "CRM",
        aggregate: "Invoice",
        type: "InvoicePosted",
        eventType: "INVOICE_POSTED",
        source: "InvoiceService",
        payload: {
          invoiceId: invoice.id,
          transactionId: txId,
          amount,
          amountCents,
          businessId: invoice.businessId
        }
      })
    );

    return ledgerTx;
  }

  /**
   * Records a payment received for an invoice and posts the balanced cash/bank entry to General Ledger:
   * Double-Entry:
   *  - Debit: 1010_BANK (ou 1000_CASH)
   *  - Credit: 1200_ACCOUNTS_RECEIVABLE (Extinction de la créance client)
   * Emits INVOICE_PAID event.
   */
  public static async recordInvoicePayment(
    businessId: string,
    invoiceId: string,
    paymentMethod: NonNullable<Invoice["paymentMethod"]>,
    branchId?: string,
    departmentId?: string,
    actor?: { uid: string; email: string; name?: string },
    customAmount?: number,
    paymentEventId?: string,
    idempotencyKey?: string,
    dbInstance?: any
  ): Promise<{ invoice: Invoice; paymentTransaction: LedgerTransaction }> {
    const invoice = await InvoiceRepository.getInvoiceById(businessId, invoiceId, dbInstance);
    if (!invoice) {
      throw new Error(`Facture [${invoiceId}] introuvable.`);
    }

    const currentPaid = Number(invoice.paidAmount ?? invoice.amountPaid ?? 0);
    const totalAmount = Number(invoice.totalAmount) || 0;
    const currentBalance = invoice.balance !== undefined ? Number(invoice.balance) : Math.max(0, totalAmount - currentPaid);

    if (invoice.isPaid && currentBalance <= 0) {
      throw new Error(`La facture ${invoice.invoiceNumber} est déjà réglée.`);
    }

    const amount = customAmount !== undefined ? Number(customAmount) : currentBalance;
    if (!Number.isFinite(amount) || isNaN(amount) || amount <= 0) {
      throw new Error(`Le montant du paiement doit être un nombre valide supérieur à 0 (fourni: ${customAmount ?? currentBalance}).`);
    }

    const now = new Date().toISOString();
    const rawEvtId = paymentEventId || idempotencyKey || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const effectiveKey = idempotencyKey || rawEvtId;

    // Idempotency conflict check: If payment with this key already exists on invoice with different amount, reject immediately
    const existingPaymentWithKey = (invoice.payments || []).find(
      (p) => (p.idempotencyKey && p.idempotencyKey === effectiveKey) || p.id === rawEvtId
    );
    if (existingPaymentWithKey && Math.abs(existingPaymentWithKey.amount - amount) > 0.001) {
      throw new Error(
        `Conflit d'idempotence: Une tentative de paiement avec la clé "${effectiveKey}" existe déjà avec un montant différent (${existingPaymentWithKey.amount} HTG vs ${amount} HTG requis).`
      );
    }

    if (amount > currentBalance + 0.001) {
      throw new Error(`Erreur de surpaiement: Le montant (${amount} HTG) dépasse le solde restant (${currentBalance} HTG).`);
    }

    const cleanEvtId = rawEvtId.replace(/^tx_pay_/, '');
    const paymentTxId = `tx_pay_${invoice.id}_${cleanEvtId}`;
    const amountCents = Math.round(amount * 100);

    const debitAccount = (paymentMethod === "CASH")
      ? (DEFAULT_CHART_OF_ACCOUNTS.ASSETS.CASH || "1000_CASH")
      : (DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK || "1010_BANK");

    const paymentTx: LedgerTransaction = {
      id: paymentTxId,
      business_id: businessId,
      branchId: branchId || "main",
      branch_id: branchId || "main",
      department_id: departmentId,
      departmentId: departmentId,
      type: "TRANSFER",
      amount: amount,
      amount_cents: amountCents,
      date: now.split("T")[0],
      description: `Règlement Facture ${invoice.invoiceNumber} (${invoice.clientName}) via ${paymentMethod}`,
      category: "SALES_PAYMENT",
      signerId: actor?.uid || "system",
      currency: (invoice.currency as any) || "HTG",
      source: "SYSTEM",
      status: "POSTED",
      isImmutable: true,
      debit_account: debitAccount,
      credit_account: DEFAULT_CHART_OF_ACCOUNTS.ASSETS.RECEIVABLES || "1200_ACCOUNTS_RECEIVABLE",
      debit: amount,
      credit: amount,
      debit_cents: amountCents,
      credit_cents: amountCents,
      metadata: {
        crmInvoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.clientName,
        paymentMethod,
        currency: invoice.currency,
        paymentEventId: rawEvtId,
        idempotencyKey: idempotencyKey || rawEvtId,
        collectedByUid: actor?.uid,
        collectedByEmail: actor?.email
      },
      created_at: now,
      updated_at: now
    };

    // Atomically post ledger payment transaction and update invoice state in Firestore
    const { alreadyProcessed, updatedInvoice } = await InvoiceRepository.recordInvoicePaymentAtomic(
      businessId,
      invoiceId,
      paymentTx,
      paymentMethod,
      dbInstance
    );

    if (alreadyProcessed && updatedInvoice) {
      return {
        invoice: updatedInvoice,
        paymentTransaction: paymentTx
      };
    }

    const finalInvoice: Invoice = updatedInvoice || {
      ...invoice,
      paidAmount: Math.min(totalAmount, currentPaid + amount),
      amountPaid: Math.min(totalAmount, currentPaid + amount),
      balance: Math.max(0, currentBalance - amount),
      status: Math.max(0, currentBalance - amount) <= 0.001 ? "PAID" : "PARTIALLY_PAID",
      isPaid: Math.max(0, currentBalance - amount) <= 0.001,
      paidAt: now,
      paymentMethod,
      paymentTransactionId: paymentTxId,
      updatedAt: now
    };

    // Emit INVOICE_PAID event
    EventBus.publish(
      EventBus.createEvent({
        correlationId: `corr_inv_pay_${invoice.id}_${rawEvtId}`,
        businessId,
        module: "CRM",
        aggregate: "Invoice",
        type: "InvoicePaid",
        eventType: "INVOICE_PAID",
        source: "InvoiceService",
        payload: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          totalAmount: invoice.totalAmount,
          paymentTransactionId: paymentTxId,
          paymentMethod,
          businessId
        }
      })
    );

    finopsEventOrchestrator.emit("INVOICE_PAID", businessId, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.totalAmount,
      paymentMethod,
      businessId
    }).catch(() => {});

    return {
      invoice: updatedInvoice,
      paymentTransaction: paymentTx
    };
  }


  /**
   * Scans invoices and marks overdue ones
   */
  public static detectOverdueInvoices(invoices: Invoice[]): Invoice[] {
    const today = new Date().toISOString().split("T")[0];
    return invoices.map((inv) => {
      if (!inv.isPaid && inv.status !== "CANCELLED" && inv.dueDate && inv.dueDate < today) {
        return {
          ...inv,
          status: "OVERDUE"
        };
      }
      return inv;
    });
  }
}

