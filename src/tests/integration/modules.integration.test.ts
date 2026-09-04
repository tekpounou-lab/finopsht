import { describe, it, expect, beforeEach, vi } from "vitest";
import { InvoiceService } from "../../services/crm/InvoiceService";
import {
  AccountingEngine,
  computeClientBalanceFromLedger,
  handleDomainEvent,
  createInvoiceJournal,
  LedgerOrphanRemediationService
} from "../../services/AccountingEngine";
import { EventBus } from "../../modules/runtime/EventBus";
import { Invoice, Proforma, Lead } from "../../types/crm";
import { LedgerTransaction } from "../../types";
import {
  InvoiceIntegritySchema,
  ProformaIntegritySchema,
  LeadIntegritySchema,
  LedgerTransactionIntegritySchema,
  validateLedgerForeignKeys
} from "../../validations/integritySchemas";

// Mock Repositories to isolate domain logic and test business consistency
vi.mock("../../repositories/crm/InvoiceRepository", () => ({
  InvoiceRepository: {
    saveInvoice: vi.fn().mockResolvedValue(undefined),
    getInvoiceById: vi.fn(),
    linkAccountingTransaction: vi.fn().mockResolvedValue(undefined),
    markInvoiceAsPaid: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("../../repositories/crm/ProformaRepository", () => ({
  ProformaRepository: {
    saveProforma: vi.fn().mockResolvedValue(undefined),
    getProformaById: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock("../../repositories/LedgerRepository", () => ({
  LedgerRepository: {
    save: vi.fn().mockResolvedValue(undefined),
    getTransactionsByBusiness: vi.fn().mockResolvedValue([])
  }
}));

vi.mock("../../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "test_user_123", email: "test@finops.com" } },
  functions: null,
  handleFirestoreError: vi.fn(),
  OperationType: { GET: "GET", WRITE: "WRITE", LIST: "LIST" }
}));

describe("Module Integration & Data Integrity (CRM <-> Accounting SSOT)", () => {
  const businessId = "biz_enterprise_001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Schema & Foreign Key Constraints (Zod & Integrity Rules)", () => {
    it("rejects invalid business_id (e.g. 'global' or empty) in ledger transaction", () => {
      const invalidTx: Partial<LedgerTransaction> = {
        id: "tx_001",
        businessId: "global",
        amount: 100,
        amountCents: 10000,
        debitAccount: "1200_ACCOUNTS_RECEIVABLE",
        creditAccount: "4000_OPERATING_REVENUE"
      };

      const result = validateLedgerForeignKeys(invalidTx);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid Foreign Key: businessId is missing or un-scoped.");
    });

    it("rejects non-positive amount_cents in ledger transaction", () => {
      const invalidTx: Partial<LedgerTransaction> = {
        id: "tx_002",
        businessId,
        amount: -50,
        amountCents: -5000,
        debitAccount: "1200_ACCOUNTS_RECEIVABLE",
        creditAccount: "4000_OPERATING_REVENUE"
      };

      const result = validateLedgerForeignKeys(invalidTx);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Constraint Violation: amountCents must be a strictly positive integer.");
    });

    it("rejects identical debit and credit accounts", () => {
      const invalidTx: Partial<LedgerTransaction> = {
        id: "tx_003",
        businessId,
        amount: 100,
        amountCents: 10000,
        debitAccount: "1200_ACCOUNTS_RECEIVABLE",
        creditAccount: "1200_ACCOUNTS_RECEIVABLE"
      };

      const result = validateLedgerForeignKeys(invalidTx);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Accounting Integrity Violation: debitAccount and creditAccount cannot be identical.");
    });

    it("validates compliant CRM Lead entity", () => {
      const validLead: Lead = {
        id: "lead_001",
        businessId,
        companyName: "Acme Haiti S.A.",
        contactName: "Jean Baptiste",
        email: "jb@acme.ht",
        phone: "+509 3700-0000",
        source: "DIRECT",
        status: "LEAD",
        leadScore: 80,
        estimatedValue: 25000,
        currency: "HTG",
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-03-01T10:00:00Z"
      };

      const parsed = LeadIntegritySchema.safeParse(validLead);
      expect(parsed.success).toBe(true);
    });

    it("validates compliant CRM Invoice entity", () => {
      const validInvoice: Invoice = {
        id: "inv_001",
        businessId,
        invoiceNumber: "INV-2026-0001",
        clientName: "Acme Haiti S.A.",
        issueDate: "2026-03-01",
        dueDate: "2026-03-31",
        currency: "HTG",
        items: [
          {
            id: "line_1",
            description: "Consulting ERP",
            quantity: 10,
            unitPrice: 5000,
            discountRate: 0,
            taxRate: 10,
            subtotal: 50000,
            taxAmount: 5000,
            total: 55000
          }
        ],
        subtotal: 50000,
        totalDiscount: 0,
        taxAmount: 5000,
        totalAmount: 55000,
        amountPaid: 0,
        status: "ISSUED",
        isPaid: false,
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-03-01T10:00:00Z"
      };

      const parsed = InvoiceIntegritySchema.safeParse(validInvoice);
      expect(parsed.success).toBe(true);
    });
  });

  describe("2. End-to-End Flow: CRM Invoice -> Double-Entry General Ledger -> Payment Settlement", () => {
    it("posts invoice to General Ledger with balanced debit and credit entries", async () => {
      const invoice: Invoice = {
        id: "inv_100",
        businessId,
        invoiceNumber: "INV-2026-0100",
        clientName: "Digicel Business",
        issueDate: "2026-03-01",
        dueDate: "2026-03-31",
        currency: "HTG",
        items: [
          {
            id: "item_1",
            description: "Dedicated Fiber 100Mbps",
            quantity: 1,
            unitPrice: 100000,
            discountRate: 0,
            taxRate: 10,
            subtotal: 100000,
            taxAmount: 10000,
            total: 110000
          }
        ],
        subtotal: 100000,
        totalDiscount: 0,
        taxAmount: 10000,
        totalAmount: 110000,
        amountPaid: 0,
        status: "ISSUED",
        isPaid: false,
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-03-01T10:00:00Z"
      };

      const ledgerTx = await InvoiceService.postInvoiceToLedger(invoice, "main_branch", "sales_dept");

      // Verify double-entry rules
      expect(ledgerTx.id).toBe(`tx_inv_${invoice.id}`);
      expect(ledgerTx.business_id).toBe(businessId);
      expect(ledgerTx.amount).toBe(110000);
      expect(ledgerTx.amount_cents).toBe(11000000);
      expect(ledgerTx.debit_account).toBe("1200_ACCOUNTS_RECEIVABLE");
      expect(ledgerTx.credit_account).toBe("4000_OPERATING_REVENUE");
      expect(ledgerTx.debit).toBe(110000);
      expect(ledgerTx.credit).toBe(110000);
      expect(ledgerTx.status).toBe("POSTED");
      expect(ledgerTx.metadata?.crmInvoiceId).toBe(invoice.id);
    });

    it("records payment settlement with cash/bank debit and receivable credit", async () => {
      const invoice: Invoice = {
        id: "inv_100",
        businessId,
        invoiceNumber: "INV-2026-0100",
        clientName: "Digicel Business",
        issueDate: "2026-03-01",
        dueDate: "2026-03-31",
        currency: "HTG",
        items: [],
        subtotal: 100000,
        totalDiscount: 0,
        taxAmount: 10000,
        totalAmount: 110000,
        amountPaid: 0,
        status: "ISSUED",
        isPaid: false,
        createdAt: "2026-03-01T10:00:00Z",
        updatedAt: "2026-03-01T10:00:00Z"
      };

      const { InvoiceRepository } = await import("../../repositories/crm/InvoiceRepository");
      vi.mocked(InvoiceRepository.getInvoiceById).mockResolvedValue(invoice);

      const result = await InvoiceService.recordInvoicePayment(businessId, invoice.id, "BANK_TRANSFER");

      expect(result.invoice.isPaid).toBe(true);
      expect(result.invoice.status).toBe("PAID");
      expect(result.paymentTransaction.debit_account).toBe("1010_BANK");
      expect(result.paymentTransaction.credit_account).toBe("1200_ACCOUNTS_RECEIVABLE");
      expect(result.paymentTransaction.amount).toBe(110000);
      expect(result.paymentTransaction.amount_cents).toBe(11000000);
    });
  });

  describe("3. Single Source of Truth (SSOT): Client Balance Calculation", () => {
    it("computes exact outstanding client balance purely from ledger transactions", () => {
      const mockLedgerTransactions: LedgerTransaction[] = [
        // Transaction 1: Invoice 1 Issued -> Debit 1200 Receivables (50,000 HTG)
        {
          id: "tx_inv_001",
          business_id: businessId,
          branchId: "main",
          signerId: "system",
          type: "INCOME",
          amount: 50000,
          amount_cents: 5000000,
          date: "2026-03-01",
          description: "Invoice INV-001",
          category: "SALES",
          currency: "HTG",
          source: "SYSTEM",
          status: "POSTED",
          isImmutable: true,
          debit_account: "1200_ACCOUNTS_RECEIVABLE",
          credit_account: "4000_OPERATING_REVENUE",
          metadata: { clientName: "Client Alpha", crmInvoiceId: "inv_001" },
          created_at: "2026-03-01T10:00:00Z",
          updated_at: "2026-03-01T10:00:00Z"
        },
        // Transaction 2: Invoice 2 Issued -> Debit 1200 Receivables (30,000 HTG)
        {
          id: "tx_inv_002",
          business_id: businessId,
          branchId: "main",
          signerId: "system",
          type: "INCOME",
          amount: 30000,
          amount_cents: 3000000,
          date: "2026-03-05",
          description: "Invoice INV-002",
          category: "SALES",
          currency: "HTG",
          source: "SYSTEM",
          status: "POSTED",
          isImmutable: true,
          debit_account: "1200_ACCOUNTS_RECEIVABLE",
          credit_account: "4000_OPERATING_REVENUE",
          metadata: { clientName: "Client Alpha", crmInvoiceId: "inv_002" },
          created_at: "2026-03-05T10:00:00Z",
          updated_at: "2026-03-05T10:00:00Z"
        },
        // Transaction 3: Invoice 1 Partial Payment -> Credit 1200 Receivables (20,000 HTG)
        {
          id: "tx_pay_001",
          business_id: businessId,
          branchId: "main",
          signerId: "system",
          type: "TRANSFER",
          amount: 20000,
          amount_cents: 2000000,
          date: "2026-03-10",
          description: "Payment for INV-001",
          category: "SALES_PAYMENT",
          currency: "HTG",
          source: "SYSTEM",
          status: "POSTED",
          isImmutable: true,
          debit_account: "1010_BANK",
          credit_account: "1200_ACCOUNTS_RECEIVABLE",
          metadata: { clientName: "Client Alpha", crmInvoiceId: "inv_001" },
          created_at: "2026-03-10T10:00:00Z",
          updated_at: "2026-03-10T10:00:00Z"
        }

      ];

      const balance = computeClientBalanceFromLedger(mockLedgerTransactions, businessId, {
        clientName: "Client Alpha"
      });

      // Total Invoiced = 50,000 + 30,000 = 80,000 HTG (8,000,000 cents)
      expect(balance.totalInvoicedCents).toBe(8000000);
      // Total Paid = 20,000 HTG (2,000,000 cents)
      expect(balance.totalPaidCents).toBe(2000000);
      // Outstanding Balance = 80,000 - 20,000 = 60,000 HTG (6,000,000 cents)
      expect(balance.outstandingBalanceCents).toBe(6000000);
    });
  });

  describe("4. Cross-Module Domain Event Handling", () => {
    it("handles InvoicePosted event via AccountingEngine orchestrator", async () => {
      const event = {
        type: "INVOICE_POSTED",
        businessId,
        payload: {
          invoiceId: "inv_500",
          invoiceNumber: "INV-2026-0500",
          amount: 45000,
          businessId
        }
      };

      const result = await handleDomainEvent(event);
      expect(result.handled).toBe(true);
      expect(result.actionTaken).toContain("INV-2026-0500");
    });

    it("handles InvoicePaid event via AccountingEngine orchestrator", async () => {
      const event = {
        type: "INVOICE_PAID",
        businessId,
        payload: {
          invoiceId: "inv_500",
          invoiceNumber: "INV-2026-0500",
          amount: 45000,
          paymentMethod: "BANK_TRANSFER",
          businessId
        }
      };

      const result = await handleDomainEvent(event);
      expect(result.handled).toBe(true);
      expect(result.actionTaken).toContain("cash/bank settlement");
    });
  });

  describe("5. End-to-End Invoice -> General Ledger Entry -> SSOT Client Balance Resolution", () => {
    it("creates invoice for existing client, creates ledger entries, and computes exact client balance via Account 1200", async () => {
      const clientName = "Société Commerciale Haïtienne";
      const clientId = "client_sch_999";

      // 1. Create and post invoice for the client
      const invoice: Invoice = {
        id: "inv_sch_001",
        businessId,
        invoiceNumber: "INV-2026-SCH-01",
        proformaId: "prof_sch_001",
        clientName,
        clientEmail: "contact@sch.ht",
        clientPhone: "+509 3700 0000",
        items: [
          {
            id: "item_1",
            description: "Consulting ERP Architecture",
            quantity: 1,
            unitPrice: 75000,
            discountRate: 0,
            taxRate: 10,
            subtotal: 75000,
            taxAmount: 7500,
            total: 82500
          }
        ],
        subtotal: 75000,
        totalDiscount: 0,
        taxAmount: 7500,
        totalAmount: 82500,
        currency: "HTG",
        status: "ISSUED",
        isPaid: false,
        paymentTerms: "30_DAYS",
        issueDate: "2026-03-15",
        dueDate: "2026-04-15",
        createdAt: "2026-03-15T08:00:00Z",
        updatedAt: "2026-03-15T08:00:00Z"
      };

      // 2. Generate double-entry journal transaction for the invoice (Receivables Dr 1200, Revenue Cr 4000)
      const invoiceTx: LedgerTransaction = {
        id: `tx_inv_${invoice.id}`,
        business_id: businessId,
        branchId: "main",
        departmentId: "sales",
        signerId: "system",
        type: "INCOME",
        amount: invoice.totalAmount,
        amount_cents: Math.round(invoice.totalAmount * 100),
        date: invoice.issueDate,
        description: `Invoice ${invoice.invoiceNumber} - ${invoice.clientName}`,
        category: "SALES_INVOICE",
        currency: invoice.currency,
        source: "SYSTEM",
        status: "POSTED",
        isImmutable: true,
        debit_account: "1200_ACCOUNTS_RECEIVABLE",
        credit_account: "4000_OPERATING_REVENUE",
        metadata: {
          clientName: invoice.clientName,
          crmInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber
        },
        created_at: invoice.createdAt,
        updated_at: invoice.updatedAt
      };

      const ledgerState: LedgerTransaction[] = [invoiceTx];

      // 3. SSOT Check: Initial balance after invoice issuance
      const initialBalance = computeClientBalanceFromLedger(ledgerState, businessId, {
        clientName
      });

      expect(initialBalance.totalInvoicedCents).toBe(8250000); // 82,500 HTG
      expect(initialBalance.totalPaidCents).toBe(0);
      expect(initialBalance.outstandingBalanceCents).toBe(8250000); // Full debt outstanding

      // 4. Record partial payment (30,000 HTG) via Bank Transfer
      const paymentTx1: LedgerTransaction = {
        id: `tx_pay_${invoice.id}_01`,
        business_id: businessId,
        branchId: "main",
        departmentId: "sales",
        signerId: "system",
        type: "TRANSFER",
        amount: 30000,
        amount_cents: 3000000,
        date: "2026-03-20",
        description: `Partial payment for ${invoice.invoiceNumber}`,
        category: "SALES_PAYMENT",
        currency: "HTG",
        source: "SYSTEM",
        status: "POSTED",
        isImmutable: true,
        debit_account: "1010_BANK",
        credit_account: "1200_ACCOUNTS_RECEIVABLE",
        metadata: {
          clientName: invoice.clientName,
          crmInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber
        },
        created_at: "2026-03-20T14:00:00Z",
        updated_at: "2026-03-20T14:00:00Z"
      };

      ledgerState.push(paymentTx1);

      // SSOT Check: Outstanding balance drops to 52,500 HTG
      const interimBalance = computeClientBalanceFromLedger(ledgerState, businessId, {
        clientName
      });
      expect(interimBalance.totalInvoicedCents).toBe(8250000);
      expect(interimBalance.totalPaidCents).toBe(3000000);
      expect(interimBalance.outstandingBalanceCents).toBe(5250000);

      // 5. Record full remaining payment (52,500 HTG)
      const paymentTx2: LedgerTransaction = {
        id: `tx_pay_${invoice.id}_02`,
        business_id: businessId,
        branchId: "main",
        departmentId: "sales",
        signerId: "system",
        type: "TRANSFER",
        amount: 52500,
        amount_cents: 5250000,
        date: "2026-03-25",
        description: `Final settlement for ${invoice.invoiceNumber}`,
        category: "SALES_PAYMENT",
        currency: "HTG",
        source: "SYSTEM",
        status: "POSTED",
        isImmutable: true,
        debit_account: "1010_BANK",
        credit_account: "1200_ACCOUNTS_RECEIVABLE",
        metadata: {
          clientName: invoice.clientName,
          crmInvoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber
        },
        created_at: "2026-03-25T16:00:00Z",
        updated_at: "2026-03-25T16:00:00Z"
      };

      ledgerState.push(paymentTx2);

      // SSOT Check: Outstanding debt is exactly 0
      const finalBalance = computeClientBalanceFromLedger(ledgerState, businessId, {
        clientName
      });
      expect(finalBalance.totalInvoicedCents).toBe(8250000);
      expect(finalBalance.totalPaidCents).toBe(8250000);
      expect(finalBalance.outstandingBalanceCents).toBe(0);
    });
  });

  describe("6. Orphan Transactions Remediation Engine (18 Missing Department/Branch)", () => {
    it("detects and remediates exactly 18 orphan transactions, verifying 0 remaining orphans and SHA-256 seal", async () => {
      // 1. Generate 18 orphan transactions lacking branchId and departmentId (simulating legacy CSV imports)
      const mockOrphanTransactions: LedgerTransaction[] = Array.from({ length: 18 }, (_, index) => {
        const isExpense = index % 2 === 0;
        return {
          id: `tx_legacy_orphan_${index + 1}`,
          business_id: businessId,
          // Intentionally missing or blank branch and department
          branchId: "" as any,
          departmentId: "" as any,
          signerId: "legacy_importer",
          type: isExpense ? "EXPENSE" : "INCOME",
          amount: 1000 * (index + 1),
          amount_cents: 100000 * (index + 1),
          date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
          description: `Legacy Imported Entry #${index + 1} without structural attribution`,
          category: isExpense ? "OFFICE_EXPENSE" : "SALES",
          currency: "HTG",
          source: "CSV_IMPORT",
          status: "POSTED",
          isImmutable: true,
          debit_account: isExpense ? "5000_OPERATING_EXPENSES" : "1200_ACCOUNTS_RECEIVABLE",
          credit_account: isExpense ? "1010_BANK" : "4000_OPERATING_REVENUE",
          created_at: "2026-02-01T12:00:00Z",
          updated_at: "2026-02-01T12:00:00Z"
        };
      });

      // Also add 5 clean, non-orphan transactions
      const mockCleanTransactions: LedgerTransaction[] = Array.from({ length: 5 }, (_, index) => ({
        id: `tx_clean_${index + 1}`,
        business_id: businessId,
        branchId: "branch_north",
        departmentId: "dept_finance",
        signerId: "system",
        type: "INCOME",
        amount: 25000,
        amount_cents: 2500000,
        date: "2026-03-01",
        description: `Standard Transaction #${index + 1}`,
        category: "SALES",
        currency: "HTG",
        source: "SYSTEM",
        status: "POSTED",
        isImmutable: true,
        debit_account: "1200_ACCOUNTS_RECEIVABLE",
        credit_account: "4000_OPERATING_REVENUE",
        created_at: "2026-03-01T12:00:00Z",
        updated_at: "2026-03-01T12:00:00Z"
      }));

      const fullDataset = [...mockOrphanTransactions, ...mockCleanTransactions];

      // 2. Pre-remediation verification: findOrphans must detect exactly 18 orphans
      const orphansFound = await LedgerOrphanRemediationService.findOrphans(businessId, fullDataset);
      expect(orphansFound.length).toBe(18);

      // 3. Execute remediation script/service
      const report = await LedgerOrphanRemediationService.remediateOrphans({
        businessId,
        defaultBranchId: "branch_corporate_hq",
        defaultDepartmentId: "dept_operations",
        actor: {
          uid: "sec_auditor_01",
          email: "auditor@finops.internal",
          name: "Chief Compliance Officer"
        },
        customTransactions: fullDataset,
        persistToDb: false // in-memory execution for unit/integration suite
      });

      // 4. Verify remediation report integrity
      expect(report.businessId).toBe(businessId);
      expect(report.totalScanned).toBe(23); // 18 + 5
      expect(report.orphanCount).toBe(18);
      expect(report.correctedCount).toBe(18);
      expect(report.defaultBranchId).toBe("branch_corporate_hq");
      expect(report.defaultDepartmentId).toBe("dept_operations");
      expect(report.fixedTransactionIds.length).toBe(18);
      expect(report.signature).toBeDefined();
      expect(typeof report.signature).toBe("string");
      expect(report.signature.length).toBeGreaterThan(10); // Valid SHA-256 seal

      // 5. Post-remediation verification: 0 orphans remaining
      const postOrphans = await LedgerOrphanRemediationService.findOrphans(businessId, fullDataset);
      expect(postOrphans.length).toBe(0);

      // 6. Verify each formerly orphan transaction now has concrete branch and department attributions
      for (const tx of mockOrphanTransactions) {
        expect(tx.branchId).toBe("branch_corporate_hq");
        expect(tx.departmentId).toBe("dept_operations");
        expect(tx.branch_id).toBe("branch_corporate_hq");
        expect(tx.department_id).toBe("dept_operations");
        expect(tx.metadata?.remediationReason).toBe("ORPHAN_ATTRIBUTION_CORRECTION");
        expect(tx.metadata?.remediatedBy).toBe("sec_auditor_01");
      }
    });
  });
});
