import { describe, it, expect, beforeEach, vi } from "vitest";
import { InvoiceService } from "../../services/crm/InvoiceService";
import { InvoiceRepository } from "../../repositories/crm/InvoiceRepository";
import { Invoice, LedgerTransaction } from "../../types";

// Mock Firestore lower-level database functions with atomic state in memory
const mockStore = new Map<string, any>();

vi.mock("firebase/firestore", () => {
  return {
    doc: (db: any, ...pathSegments: string[]) => pathSegments.join("/"),
    getDoc: async (path: string) => ({
      exists: () => mockStore.has(path),
      data: () => mockStore.get(path)
    }),
    setDoc: async (path: string, data: any) => mockStore.set(path, data),
    runTransaction: async (db: any, updateFunction: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (path: string) => ({
          exists: () => mockStore.has(path),
          data: () => mockStore.get(path)
        }),
        set: (path: string, data: any, opts?: any) => {
          if (opts?.merge && mockStore.has(path)) {
            mockStore.set(path, { ...mockStore.get(path), ...data });
          } else {
            mockStore.set(path, data);
          }
        },
        update: (path: string, data: any) => {
          const existing = mockStore.get(path) || {};
          mockStore.set(path, { ...existing, ...data });
        }
      };
      return await updateFunction(tx);
    }
  };
});

vi.mock("../../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "test_user_123", email: "test@finops.com" } },
  functions: null,
  OperationType: { READ: "read", WRITE: "write", DELETE: "delete" },
  handleFirestoreError: (err: any) => { throw err; }
}));

describe("CRM Payment Invariants, Concurrency & Idempotency", () => {
  const businessId = "biz_crm_test";
  const invoiceId = "inv_100k_test";

  const initialInvoice: Invoice = {
    id: invoiceId,
    businessId,
    invoiceNumber: "INV-2026-100K",
    clientName: "Global Logistics SA",
    issueDate: "2026-09-01",
    dueDate: "2026-09-30",
    currency: "HTG",
    items: [],
    subtotal: 100000,
    totalDiscount: 0,
    taxAmount: 0,
    totalAmount: 100000,
    paidAmount: 0,
    amountPaid: 0,
    balance: 100000,
    status: "ISSUED",
    isPaid: false,
    payments: [],
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z"
  };

  beforeEach(() => {
    mockStore.clear();
    const invPath = `businesses/${businessId}/invoices/${invoiceId}`;
    mockStore.set(invPath, { ...initialInvoice });

    vi.spyOn(InvoiceRepository, "getInvoiceById").mockImplementation(async (bId, iId) => {
      return mockStore.get(`businesses/${bId}/invoices/${iId}`) || null;
    });
  });

  it("executes partial payment sequence 40k + 30k + 30k = 100k correctly", async () => {
    // Step 1: Pay 40,000
    const res1 = await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "CASH",
      "main",
      "dept_sales",
      { uid: "usr1", email: "teller1@finops.com" },
      40000,
      "evt_pay_1"
    );

    expect(res1.invoice.paidAmount).toBe(40000);
    expect(res1.invoice.balance).toBe(60000);
    expect(res1.invoice.status).toBe("PARTIALLY_PAID");
    expect(res1.invoice.isPaid).toBe(false);
    expect(res1.invoice.payments?.length).toBe(1);

    // Step 2: Pay 30,000
    const res2 = await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "BANK_TRANSFER",
      "main",
      "dept_sales",
      { uid: "usr1", email: "teller1@finops.com" },
      30000,
      "evt_pay_2"
    );

    expect(res2.invoice.paidAmount).toBe(70000);
    expect(res2.invoice.balance).toBe(30000);
    expect(res2.invoice.status).toBe("PARTIALLY_PAID");
    expect(res2.invoice.isPaid).toBe(false);
    expect(res2.invoice.payments?.length).toBe(2);

    // Step 3: Pay remaining 30,000
    const res3 = await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "CASH",
      "main",
      "dept_sales",
      { uid: "usr1", email: "teller1@finops.com" },
      30000,
      "evt_pay_3"
    );

    expect(res3.invoice.paidAmount).toBe(100000);
    expect(res3.invoice.balance).toBe(0);
    expect(res3.invoice.status).toBe("PAID");
    expect(res3.invoice.isPaid).toBe(true);
    expect(res3.invoice.payments?.length).toBe(3);
  });

  it("prevents overpayment exceeding outstanding balance", async () => {
    // Pay 80,000 on 100,000 invoice (balance 20,000 remaining)
    await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "CASH",
      "main",
      undefined,
      undefined,
      80000,
      "evt_pay_80k"
    );

    // Attempting to pay 30,000 on remaining 20,000 balance MUST fail
    await expect(
      InvoiceService.recordInvoicePayment(
        businessId,
        invoiceId,
        "CASH",
        "main",
        undefined,
        undefined,
        30000,
        "evt_pay_over"
      )
    ).rejects.toThrow(/surpaiement/i);
  });

  it("guarantees idempotency when retrying exact same payment event", async () => {
    // First call for event 'evt_unique_100'
    const res1 = await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "BANK_TRANSFER",
      "main",
      undefined,
      undefined,
      25000,
      "evt_unique_100",
      "idempotency_key_100"
    );

    expect(res1.invoice.paidAmount).toBe(25000);

    // Retry exact same payment event
    const res2 = await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "BANK_TRANSFER",
      "main",
      undefined,
      undefined,
      25000,
      "evt_unique_100",
      "idempotency_key_100"
    );

    // Invoice state and payment list must remain unchanged (no double posting)
    expect(res2.invoice.paidAmount).toBe(25000);
    expect(res2.invoice.payments?.length).toBe(1);
  });

  it("rejects non-finite payment amounts (NaN, Infinity, negative)", async () => {
    await expect(
      InvoiceService.recordInvoicePayment(
        businessId,
        invoiceId,
        "CASH",
        "main",
        undefined,
        undefined,
        NaN,
        "evt_nan"
      )
    ).rejects.toThrow(/nombre valide/i);

    await expect(
      InvoiceService.recordInvoicePayment(
        businessId,
        invoiceId,
        "CASH",
        "main",
        undefined,
        undefined,
        Infinity,
        "evt_inf"
      )
    ).rejects.toThrow(/nombre valide/i);

    await expect(
      InvoiceService.recordInvoicePayment(
        businessId,
        invoiceId,
        "CASH",
        "main",
        undefined,
        undefined,
        -5000,
        "evt_neg"
      )
    ).rejects.toThrow(/nombre valide/i);
  });

  it("enforces multi-tenant boundary security", async () => {
    const wrongBusinessId = "biz_attacker_tenant";
    
    // Attempting to invoke repository with mismatched businessId
    const fakeTx: LedgerTransaction = {
      id: "tx_pay_attack",
      business_id: wrongBusinessId,
      branchId: "main",
      type: "TRANSFER",
      amount: 10000,
      amount_cents: 1000000,
      date: "2026-09-01",
      description: "Cross tenant payment attack",
      category: "SALES_PAYMENT",
      signerId: "attacker",
      currency: "HTG",
      source: "SYSTEM",
      status: "POSTED",
      isImmutable: true,
      debit_account: "1000_CASH",
      credit_account: "1200_ACCOUNTS_RECEIVABLE"
    };

    await expect(
      InvoiceRepository.recordInvoicePaymentAtomic(businessId, invoiceId, fakeTx, "CASH")
    ).rejects.toThrow(/Violation d'isolation multi-tenant/i);
  });

  it("verifies double-entry ledger balance for every payment posting", async () => {
    const res = await InvoiceService.recordInvoicePayment(
      businessId,
      invoiceId,
      "CASH",
      "main",
      "dept_sales",
      { uid: "usr1", email: "teller1@finops.com" },
      50000,
      "evt_pay_double_entry"
    );

    expect(res.paymentTransaction).toBeDefined();
    expect(res.paymentTransaction.debit_account).toBe("1000_CASH");
    expect(res.paymentTransaction.credit_account).toBe("1200_ACCOUNTS_RECEIVABLE");
    expect(res.paymentTransaction.amount).toBe(50000);
    expect(res.paymentTransaction.amount_cents).toBe(5000000);
    expect(res.paymentTransaction.business_id).toBe(businessId);
  });
});
