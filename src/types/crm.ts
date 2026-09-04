/**
 * FINOPS ERP — CRM & Invoicing Domain Types (SSOT)
 * 
 * Defines data structures for Leads, Prospects, Proformas (Quotes),
 * Invoices (Factures), Lines, and Template Customization.
 */

export type LeadStatus = "LEAD" | "PROSPECT" | "CLIENT" | "LOST";

export type LeadSource = 
  | "WEBSITE" 
  | "REFERRAL" 
  | "COLD_CALL" 
  | "CAMPAIGN" 
  | "EVENT" 
  | "PARTNER" 
  | "DIRECT" 
  | "OTHER";

export interface Lead {
  id: string;
  businessId: string;
  companyName: string;
  contactName: string;
  email?: string;
  phone?: string;
  address?: string;
  sector?: string;
  source: LeadSource;
  status: LeadStatus;
  leadScore: number; // 0 to 100
  notes?: string;
  assignedTo?: string; // employee_id
  estimatedValue?: number;
  currency: "HTG" | "USD";
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
  convertedToProspectId?: string;
  convertedToClientId?: string;
}

export interface Prospect extends Lead {
  taxId?: string; // NIF / CIF
  paymentTermsDays?: number;
  creditLimit?: number;
  industry?: string;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountRate: number; // Percentage 0-100
  discountAmount?: number;
  taxRate: number; // e.g. 10 for 10% TVA
  subtotal: number; // (quantity * unitPrice) * (1 - discountRate / 100)
  taxAmount: number; // subtotal * (taxRate / 100)
  total: number; // subtotal + taxAmount
}

export type ProformaStatus = 
  | "DRAFT" 
  | "SENT" 
  | "ACCEPTED" 
  | "EXPIRED" 
  | "CONVERTED_TO_INVOICE" 
  | "REJECTED";

export interface Proforma {
  id: string;
  businessId: string;
  proformaNumber: string; // e.g. PRO-2026-0001
  leadId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientNif?: string;
  issueDate: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD
  currency: "HTG" | "USD";
  items: InvoiceLine[];
  subtotal: number;
  totalDiscount: number;
  taxAmount: number;
  totalAmount: number;
  status: ProformaStatus;
  notes?: string;
  paymentTerms?: string;
  convertedToInvoiceId?: string;
  convertedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type InvoiceStatus = 
  | "DRAFT" 
  | "SENT" 
  | "ISSUED"
  | "PAID" 
  | "PARTIALLY_PAID"
  | "OVERDUE" 
  | "CANCELLED";

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: "BANK_TRANSFER" | "CASH" | "CHECK" | "MONCASH" | "NATCASH" | "CARD" | "OTHER";
  reference?: string;
  transactionId?: string;
  notes?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  businessId: string;
  invoiceNumber: string; // e.g. INV-2026-0001
  proformaId?: string;
  leadId?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  clientNif?: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  currency: "HTG" | "USD";
  items: InvoiceLine[];
  subtotal: number;
  totalDiscount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid?: number;
  status: InvoiceStatus;
  accountingStatus?: "DRAFT" | "POSTED" | "REVERSED";
  notes?: string;
  paymentTerms?: string;
  isPaid: boolean;
  paidAt?: string;
  paymentMethod?: "BANK_TRANSFER" | "CASH" | "CHECK" | "MONCASH" | "NATCASH" | "CARD" | "OTHER";
  payments?: InvoicePayment[];
  accountingTransactionId?: string; // Link to LedgerTransaction
  paymentTransactionId?: string; // Link to Payment LedgerTransaction
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface InvoiceTemplate {
  id: string;
  businessId: string;
  templateName: string;
  contentHtml?: string;
  htmlContent?: string;
  headerLogoUrl?: string;
  logoUrl?: string;
  primaryColor: string; // Hex color code (e.g. #0ea5e9 or #2563eb)
  footerText?: string;
  headerText?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyNif?: string;
  bankDetails?: string;
  legalMentions?: string;
  companyHeader?: {
    companyName: string;
    taxId?: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
  isDefault: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export const DEFAULT_INVOICE_TEMPLATE_HTML = `
<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 32px; background: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
  <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid {primaryColor}; padding-bottom: 20px; margin-bottom: 24px;">
    <div>
      <h1 style="margin: 0 0 6px 0; color: {primaryColor}; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">{companyName}</h1>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">{companyAddress}</p>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">NIF: {companyNif} | Tél: {companyPhone}</p>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">Email: {companyEmail}</p>
    </div>
    <div style="text-align: right;">
      <h2 style="margin: 0 0 6px 0; font-size: 22px; color: #0f172a; text-transform: uppercase; letter-spacing: 1px;">{documentType}</h2>
      <p style="margin: 2px 0; font-size: 15px; font-weight: bold; color: {primaryColor};">N° {documentNumber}</p>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">Date: <strong>{date}</strong></p>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">Échéance: <strong>{dueDate}</strong></p>
    </div>
  </div>

  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 24px; display: flex; justify-content: space-between;">
    <div>
      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">Facturé à / Destinataire</div>
      <h3 style="margin: 0 0 4px 0; font-size: 16px; color: #0f172a;">{clientName}</h3>
      <p style="margin: 2px 0; font-size: 13px; color: #475569;">{clientAddress}</p>
      <p style="margin: 2px 0; font-size: 13px; color: #475569;">NIF: {clientNif}</p>
      <p style="margin: 2px 0; font-size: 13px; color: #475569;">Email: {clientEmail} | Tél: {clientPhone}</p>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #94a3b8; margin-bottom: 4px;">Devise & Modalités</div>
      <p style="margin: 2px 0; font-size: 14px; font-weight: 600; color: #0f172a;">Devise: {currency}</p>
      <p style="margin: 2px 0; font-size: 13px; color: #64748b;">Conditions: {paymentTerms}</p>
    </div>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
    <thead>
      <tr style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1; text-align: left;">
        <th style="padding: 10px 12px; font-weight: 700; color: #334155;">Désignation / Prestation</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: #334155;">Qté</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: #334155;">Prix Unitaire</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: #334155;">Remise</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: #334155;">TVA</th>
        <th style="padding: 10px 12px; text-align: right; font-weight: 700; color: #334155;">Montant Net</th>
      </tr>
    </thead>
    <tbody>
      {items}
    </tbody>
  </table>

  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
    <div style="max-width: 55%; font-size: 12px; color: #64748b; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">
      <strong style="color: #334155; display: block; margin-bottom: 4px;">Notes & Instructions de Paiement :</strong>
      {notes}
    </div>
    <div style="width: 38%;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Sous-Total :</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">{subtotal} {currency}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Remise Globale :</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #dc2626;">-{totalDiscount} {currency}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">TVA (Taxe) :</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: #1e293b;">+{tax} {currency}</td>
        </tr>
        <tr style="border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a;">
          <td style="padding: 10px 0; font-size: 16px; font-weight: 800; color: #0f172a;">TOTAL TTC :</td>
          <td style="padding: 10px 0; text-align: right; font-size: 18px; font-weight: 800; color: {primaryColor};">{total} {currency}</td>
        </tr>
      </table>
    </div>
  </div>

  <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
    {footer}
  </div>
</div>
`.trim();
