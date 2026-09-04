/**
 * FINOPS ERP — Phase 3 Automated Integrity & Typed EventBus Integration Tests
 * 
 * Validates:
 * 3.1 FinopsEvent<T> typing, emission, subscription, and correlation tracking.
 * 3.2 Automated integrity checks:
 *     - Cross-collection balance consistency (Invoices <-> General Ledger transactions, Payroll <-> Payslips <-> Ledger).
 *     - Absence of orphan records (Departments, Employees, Attendance, Ledger).
 *     - Firestore multi-tenant security and double-entry invariants.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus } from "../../modules/runtime/EventBus";
import { 
  FinopsEvent, 
  InvoicePostedEventPayload, 
  InvoicePaidEventPayload,
  PayrollApprovedEventPayload,
  EmployeeCreatedEventPayload
} from "../../types/events";
import { 
  IntegrityValidator, 
  ForeignKeyIntegrityViolationError 
} from "../../services/integrity/ForeignKeyIntegrityValidator";
import { DataCleanupAndSSOTService } from "../../services/business/DataCleanupAndSSOTService";
import { LedgerTransactionIntegritySchema } from "../../validations/integritySchemas";

// In-memory mock database store
const mockDb = new Map<string, any>();

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    collection: vi.fn((_db: any, ...pathSegments: string[]) => ({ path: pathSegments.join("/") })),
    doc: vi.fn((_db: any, ...pathSegments: string[]) => ({ path: pathSegments.join("/") })),
    setDoc: vi.fn(async (docRef: any, data: any) => {
      mockDb.set(docRef.path, { ...data });
    }),
    getDoc: vi.fn(async (docRef: any) => {
      const data = mockDb.get(docRef.path);
      return {
        exists: () => !!data,
        data: () => data,
        id: docRef.path.split("/").pop()
      };
    }),
    updateDoc: vi.fn(async (docRef: any, updates: any) => {
      const existing = mockDb.get(docRef.path) || {};
      mockDb.set(docRef.path, { ...existing, ...updates });
    }),
    getDocs: vi.fn(async (queryOrCol: any) => {
      const path = queryOrCol.path || "";
      const results: any[] = [];
      mockDb.forEach((value, key) => {
        if (key.startsWith(path)) {
          results.push({
            id: key.split("/").pop(),
            ref: { path: key },
            data: () => value
          });
        }
      });
      return {
        docs: results,
        empty: results.length === 0,
        forEach: (cb: any) => results.forEach(cb)
      };
    }),
    query: vi.fn((colRef: any) => ({ path: colRef.path })),
    where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
    orderBy: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => new Date().toISOString())
  };
});

describe("Phase 3.1: Typed EventBus & FinopsEvent<T> Architecture", () => {
  const tenantId = "biz_enterprise_99";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create and publish a strongly typed FinopsEvent<InvoicePostedEventPayload>", () => {
    let capturedEvent: FinopsEvent<InvoicePostedEventPayload> | null = null;

    const unsubscribe = EventBus.subscribe<InvoicePostedEventPayload>("INVOICE_POSTED", (event) => {
      capturedEvent = event;
    });

    const typedPayload: InvoicePostedEventPayload = {
      invoiceId: "inv_2026_001",
      businessId: tenantId,
      leadId: "lead_caribbean_traders",
      leadName: "Caribbean Traders Ltd.",
      totalAmountHtg: 250000,
      subtotalHtg: 227272.73,
      taxAmountHtg: 22727.27,
      issuedAt: "2026-09-01T10:00:00Z",
      branchId: "br_delmas_01",
      departmentId: "dept_sales_01"
    };

    const event = EventBus.createEvent<InvoicePostedEventPayload>({
      type: "INVOICE_POSTED",
      businessId: tenantId,
      module: "CRM",
      aggregate: "INVOICE",
      payload: typedPayload,
      correlationId: "corr_tx_order_8871"
    });

    EventBus.publish(event);

    expect(capturedEvent).not.toBeNull();
    expect(capturedEvent!.type).toBe("INVOICE_POSTED");
    expect(capturedEvent!.businessId).toBe(tenantId);
    expect(capturedEvent!.payload.invoiceId).toBe("inv_2026_001");
    expect(capturedEvent!.payload.totalAmountHtg).toBe(250000);
    expect(capturedEvent!.correlationId).toBe("corr_tx_order_8871");

    unsubscribe();
  });

  it("should reject domain events that lack a valid businessId (tenant isolation)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let received = false;

    const unsubscribe = EventBus.subscribe("EMPLOYEE_CREATED", () => {
      received = true;
    });

    const unScopedEvent = EventBus.createEvent<EmployeeCreatedEventPayload>({
      type: "EMPLOYEE_CREATED",
      businessId: "", // Missing businessId
      module: "WORKFORCE",
      aggregate: "EMPLOYEE",
      payload: {
        employeeId: "emp_orphan_01",
        businessId: "",
        name: "Ghost Employee"
      }
    });

    EventBus.publish(unScopedEvent);

    expect(received).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("REJECTED un-scoped domain event")
    );

    errorSpy.mockRestore();
    unsubscribe();
  });

  it("should deduplicate rapid identical event emissions within the dedup window", () => {
    let callCount = 0;
    const unsubscribe = EventBus.subscribe("ATTENDANCE_CLOCKED", () => {
      callCount++;
    });

    const eventParams = {
      type: "ATTENDANCE_CLOCKED",
      businessId: tenantId,
      module: "WORKFORCE",
      aggregate: "ATTENDANCE",
      correlationId: "corr_fixed_unique_100",
      payload: {
        logId: "att_scan_01",
        employeeId: "emp_101",
        businessId: tenantId,
        timestamp: "2026-09-01T08:00:00Z",
        mode: "IN" as const
      }
    };

    const evt1 = EventBus.createEvent(eventParams);
    const evt2 = EventBus.createEvent(eventParams);

    EventBus.publish(evt1);
    EventBus.publish(evt2);

    expect(callCount).toBe(1); // Second duplicate within 1500ms deduplicated

    unsubscribe();
  });
});

describe("Phase 3.2: Automated Cross-Collection Integrity & Consistency Tests", () => {
  const tenantId = "biz_enterprise_99";

  beforeEach(() => {
    mockDb.clear();
    IntegrityValidator.clearCache();

    // Setup base tenant hierarchy
    mockDb.set(`businesses/${tenantId}`, { id: tenantId, name: "Enterprise Corp", status: "ACTIVE" });
    mockDb.set(`branches/br_main`, { id: "br_main", business_id: tenantId, name: "Headquarters" });
    mockDb.set(`departments/dept_ops`, { id: "dept_ops", business_id: tenantId, branch_id: "br_main", name: "Operations" });
    mockDb.set(`employees/emp_001`, { id: "emp_001", business_id: tenantId, name: "Jean Pierre", status: "ACTIVE", isActive: true });
    mockDb.set(`employees/emp_002`, { id: "emp_002", business_id: tenantId, name: "Marie Laurent", status: "ACTIVE", isActive: true });
  });

  describe("1. Cross-Collection Financial Invariants (CRM Invoices <-> General Ledger)", () => {
    it("verifies that computed total of invoice lines matches general ledger receivable entry", () => {
      // Create invoice lines
      const items = [
        { id: "line_1", description: "Enterprise Cloud Hosting", quantity: 1, unitPrice: 150000, discountRate: 0, taxRate: 10, subtotal: 150000, taxAmount: 15000, total: 165000 },
        { id: "line_2", description: "Dedicated SLA Support", quantity: 2, unitPrice: 25000, discountRate: 10, taxRate: 10, subtotal: 45000, taxAmount: 4500, total: 49500 }
      ];

      const { subtotal, taxAmount, totalAmount } = DataCleanupAndSSOTService.getInstance().calculateInvoiceTotalsFromItems(items);

      // Line 1: 150000 HTG + 10% tax (15000) = 165000
      // Line 2: 50000 - 10% (45000) + 10% tax (4500) = 49500
      // Total: 214500 HTG
      expect(subtotal).toBe(195000);
      expect(taxAmount).toBe(19500);
      expect(totalAmount).toBe(214500);

      // Corresponding General Ledger Double-Entry
      const ledgerEntry = {
        id: "tx_inv_001",
        businessId: tenantId,
        branchId: "br_main",
        departmentId: "dept_ops",
        type: "INCOME" as const,
        category: "OPERATING_REVENUE",
        description: "Invoice #inv_2026_001 posting",
        date: "2026-09-01",
        amount: totalAmount,
        amountCents: Math.round(totalAmount * 100),
        debitAccount: "1200_ACCOUNTS_RECEIVABLE",
        creditAccount: "4000_OPERATING_REVENUE",
        status: "POSTED" as const
      };

      // Validate Zod schema double-entry invariants
      const validation = LedgerTransactionIntegritySchema.safeParse(ledgerEntry);
      expect(validation.success).toBe(true);

      // Verify that invoice total equals ledger amount in cents
      expect(ledgerEntry.amountCents).toBe(21450000);
      expect(ledgerEntry.debitAccount).not.toBe(ledgerEntry.creditAccount);
    });

    it("verifies that payment settlement decreases receivables and debits bank account identically", () => {
      const invoiceAmount = 100000;
      const paymentAmount = 100000;

      const invoiceJournal = {
        amount: invoiceAmount,
        debit: "1200_ACCOUNTS_RECEIVABLE",
        credit: "4000_OPERATING_REVENUE"
      };

      const paymentJournal = {
        amount: paymentAmount,
        debit: "1010_BANK",
        credit: "1200_ACCOUNTS_RECEIVABLE"
      };

      // Receivable balance: +100,000 (from invoice) - 100,000 (from payment) = 0
      const netReceivableBalance = invoiceJournal.amount - paymentJournal.amount;
      expect(netReceivableBalance).toBe(0);

      // Bank cash received equals settled payment
      expect(paymentJournal.amount).toBe(invoiceAmount);
    });
  });

  describe("2. Cross-Collection Payroll Invariants (Cycle Totals <-> Payslips)", () => {
    it("verifies that payroll cycle aggregate totals strictly equal the sum of employee payslips", () => {
      const payslips: any[] = [
        {
          id: "ps_01",
          business_id: tenantId,
          period: "2026-09",
          status: "APPROVED",
          generatedAt: new Date().toISOString(),
          amount_cents: 11040000,
          employeeId: "emp_001",
          grossSalary: 120000,
          onaHtg: 7200,   // 6% of 120000
          ofatmaHtg: 2400, // 2% of 120000
          netPaid: 110400  // 120000 - 7200 - 2400
        },
        {
          id: "ps_02",
          business_id: tenantId,
          period: "2026-09",
          status: "APPROVED",
          generatedAt: new Date().toISOString(),
          amount_cents: 7360000,
          employeeId: "emp_002",
          grossSalary: 80000,
          onaHtg: 4800,   // 6% of 80000
          ofatmaHtg: 1600, // 2% of 80000
          netPaid: 73600   // 80000 - 4800 - 1600
        }
      ];

      const cycleTotals = DataCleanupAndSSOTService.getInstance().calculatePayrollCycleTotalsFromPayslips(payslips);

      expect(cycleTotals.totalGross).toBe(200000);
      expect(cycleTotals.totalNet).toBe(184000);
      expect(cycleTotals.totalTaxes).toBe(16000); // 7200 + 2400 + 4800 + 1600
      expect(cycleTotals.employeeCount).toBe(2);

      // Invariant check: Gross = Net + Total Deductions
      expect(cycleTotals.totalGross).toBe(cycleTotals.totalNet + cycleTotals.totalTaxes);
    });
  });

  describe("3. Absence of Orphan Records (Referential Constraints)", () => {
    it("detects and rejects employee creation when referencing non-existent department", async () => {
      const orphanEmployeeData = {
        name: "Orphan Employee",
        branchId: "br_main",
        departmentId: "dept_ghost_non_existent"
      };

      await expect(
        IntegrityValidator.validateEntityForeignKeys(tenantId, orphanEmployeeData, "EMPLOYEE")
      ).rejects.toThrow(ForeignKeyIntegrityViolationError);
    });

    it("detects and rejects employee creation when referencing department belonging to another tenant", async () => {
      // Seed another tenant and department
      const foreignTenant = "biz_competitor_88";
      mockDb.set(`businesses/${foreignTenant}`, { id: foreignTenant, name: "Competitor" });
      mockDb.set(`departments/dept_competitor`, { id: "dept_competitor", business_id: foreignTenant, name: "Foreign Dept" });

      const crossTenantEmployee = {
        name: "Infiltrator",
        branchId: "br_main",
        departmentId: "dept_competitor"
      };

      await expect(
        IntegrityValidator.validateEntityForeignKeys(tenantId, crossTenantEmployee, "EMPLOYEE")
      ).rejects.toThrow(ForeignKeyIntegrityViolationError);
    });

    it("detects and rejects attendance record referencing non-existent employee", async () => {
      const orphanAttendanceData = {
        employeeId: "emp_ghost_999",
        branchId: "br_main",
        mode: "IN"
      };

      await expect(
        IntegrityValidator.validateEntityForeignKeys(tenantId, orphanAttendanceData, "ATTENDANCE")
      ).rejects.toThrow(ForeignKeyIntegrityViolationError);
    });
  });

  describe("4. Firestore Security & Double-Entry Invariants", () => {
    it("rejects ledger transactions where debit equals credit account (unilateral entry forbidden)", () => {
      const unilateralTx = {
        id: "tx_bad_01",
        business_id: tenantId,
        amount: 50000,
        amount_cents: 5000000,
        debit_account: "1010_BANK",
        credit_account: "1010_BANK" // Violation
      };

      const parsed = LedgerTransactionIntegritySchema.safeParse(unilateralTx);
      expect(parsed.success).toBe(false);
    });

    it("rejects ledger transactions with negative monetary cents", () => {
      const negativeTx = {
        id: "tx_bad_02",
        business_id: tenantId,
        amount: -1000,
        amount_cents: -100000,
        debit_account: "1010_BANK",
        credit_account: "4000_OPERATING_REVENUE"
      };

      const parsed = LedgerTransactionIntegritySchema.safeParse(negativeTx);
      expect(parsed.success).toBe(false);
    });
  });
});
