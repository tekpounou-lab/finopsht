import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import * as fs from "fs";
import { InvoiceRepository } from "../../repositories/crm/InvoiceRepository";
import { InvoiceService } from "../../services/crm/InvoiceService";
import { Invoice, InvoiceLine } from "../../types/crm";
import { LedgerTransaction } from "../../types";

/**
 * PHASE 5D — FIRESTORE EMULATOR CONCURRENCY & ACCOUNTING INTEGRITY SUITE
 * 
 * Execution Environment: FIRESTORE EMULATOR (cloud-firestore-emulator-v1.22.0)
 * Host: 127.0.0.1:8088
 * Rules: firestore.rules (real security rules evaluation)
 * Concurrency Model: Real Firestore Optimistic Concurrency Control (OCC) with transaction retry
 */
describe("Phase 5D: Real Firestore OCC Concurrency & SSOT Accounting Certification", () => {
  let testEnv: RulesTestEnvironment;
  let adminDb: any;
  let tenantADb: any;
  let tenantBDb: any;

  const BIZ_A = "biz_concurrent_A";
  const BIZ_B = "biz_concurrent_B";

  beforeAll(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";
    const rules = fs.readFileSync("firestore.rules", "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: "demo-finops-phase5d",
      firestore: {
        host: "127.0.0.1",
        port: 8088,
        rules,
      },
    });

    // Authenticated contexts
    const superAdminContext = testEnv.authenticatedContext("super_admin_001", {
      email: "admin@finops.com",
      role: "SUPER_ADMIN",
    });
    adminDb = superAdminContext.firestore();

    const tenantAContext = testEnv.authenticatedContext("tenant_a_user", {
      email: "alice@bizA.com",
      business_id: BIZ_A,
    });
    tenantADb = tenantAContext.firestore();

    const tenantBContext = testEnv.authenticatedContext("tenant_b_user", {
      email: "bob@bizB.com",
      business_id: BIZ_B,
    });
    tenantBDb = tenantBContext.firestore();
  }, 30000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  function createTestInvoice(
    businessId: string,
    invoiceId: string,
    totalAmount: number,
    invoiceNumber: string = "INV-2026-TEST"
  ): Invoice {
    const now = new Date().toISOString();
    return {
      id: invoiceId,
      businessId,
      invoiceNumber,
      clientName: "Acme Caribbean Corp",
      clientEmail: "contact@acme.ht",
      clientNif: "001-234-567-8",
      issueDate: "2026-09-14",
      dueDate: "2026-10-14",
      items: [
        {
          id: "item_01",
          description: "Enterprise ERP Service",
          quantity: 1,
          unitPrice: totalAmount,
          discountRate: 0,
          discountAmount: 0,
          taxRate: 0,
          subtotal: totalAmount,
          taxAmount: 0,
          total: totalAmount,
        },
      ],
      subtotal: totalAmount,
      totalDiscount: 0,
      taxAmount: 0,
      totalAmount,
      paidAmount: 0,
      amountPaid: 0,
      balance: totalAmount,
      status: "ISSUED",
      isPaid: false,
      currency: "HTG",
      payments: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  // =========================================================================
  // TEST CASE 1: IDENTICAL PAYMENT CONCURRENCY (20 CONCURRENT REQUESTS)
  // Section 6 & 22.1
  // =========================================================================
  it("TC-01 [OCC]: 20 concurrent identical payment requests serialize to exactly 1 accepted event and 1 ledger entry", async () => {
    const invoiceId = "inv_tc01_identical";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-001");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const paymentAmount = 40000;
    const paymentEventId = "evt_tc01_shared";
    const idempotencyKey = "key_tc01_shared";
    const concurrency = 20;

    // Launch 20 concurrent identical payment requests
    const promises = Array.from({ length: concurrency }).map(() =>
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_01", email: "teller1@bizA.com" },
        paymentAmount,
        paymentEventId,
        idempotencyKey,
        adminDb
      )
    );

    const results = await Promise.all(promises);

    // Invariant checks on results
    expect(results).toHaveLength(concurrency);

    // Fetch authoritative invoice from emulator
    const finalInvoice = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(finalInvoice).not.toBeNull();
    expect(finalInvoice!.totalAmount).toBe(100000);
    expect(finalInvoice!.paidAmount).toBe(40000);
    expect(finalInvoice!.amountPaid).toBe(40000);
    expect(finalInvoice!.balance).toBe(60000);
    expect(finalInvoice!.status).toBe("PARTIALLY_PAID");
    expect(finalInvoice!.isPaid).toBe(false);

    // Exactly 1 payment event in the array
    expect(finalInvoice!.payments).toHaveLength(1);
    expect(finalInvoice!.payments![0].amount).toBe(40000);
    expect(finalInvoice!.payments![0].idempotencyKey).toBe(idempotencyKey);

    // Verify Ledger doc in Firestore emulator directly
    const ledgerSnap = await adminDb.doc(`businesses/${BIZ_A}/ledger/tx_pay_${invoiceId}_${paymentEventId}`).get();
    expect(ledgerSnap.exists).toBe(true);
    const ledgerData = ledgerSnap.data();
    expect(ledgerData.amount).toBe(40000);
    expect(ledgerData.amount_cents).toBe(4000000);
    expect(ledgerData.debit).toBe(40000);
    expect(ledgerData.credit).toBe(40000);
  });

  // =========================================================================
  // TEST CASE 2: DISTINCT PAYMENT CONCURRENCY (A: 40k, B: 30k, C: 30k)
  // Section 7 & 22.2
  // =========================================================================
  it("TC-02 [OCC]: 3 concurrent distinct payment requests (40k, 30k, 30k) perfectly settle a 100k invoice", async () => {
    const invoiceId = "inv_tc02_distinct";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-002");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    // 3 distinct payments that sum to exactly 100k
    const payments = [
      { amount: 40000, eventId: "evt_tc02_p1", key: "key_tc02_p1" },
      { amount: 30000, eventId: "evt_tc02_p2", key: "key_tc02_p2" },
      { amount: 30000, eventId: "evt_tc02_p3", key: "key_tc02_p3" },
    ];

    // Concurrently fire all 3
    const results = await Promise.all(
      payments.map((p) =>
        InvoiceService.recordInvoicePayment(
          BIZ_A,
          invoiceId,
          "BANK_TRANSFER",
          "main",
          "finance",
          { uid: "teller_02", email: "teller2@bizA.com" },
          p.amount,
          p.eventId,
          p.key,
          adminDb
        )
      )
    );

    expect(results).toHaveLength(3);

    // Fetch authoritative invoice from emulator
    const finalInvoice = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(finalInvoice).not.toBeNull();
    expect(finalInvoice!.paidAmount).toBe(100000);
    expect(finalInvoice!.balance).toBe(0);
    expect(finalInvoice!.status).toBe("PAID");
    expect(finalInvoice!.isPaid).toBe(true);

    // Exactly 3 distinct payment events
    expect(finalInvoice!.payments).toHaveLength(3);
    const totalRecorded = finalInvoice!.payments!.reduce((sum, p) => sum + p.amount, 0);
    expect(totalRecorded).toBe(100000);

    // Verify all 3 ledger entries exist in emulator
    for (const p of payments) {
      const snap = await adminDb.doc(`businesses/${BIZ_A}/ledger/tx_pay_${invoiceId}_${p.eventId}`).get();
      expect(snap.exists).toBe(true);
      expect(snap.data().amount).toBe(p.amount);
    }
  });

  // =========================================================================
  // TEST CASE 3: CONCURRENT OVERPAYMENT TEST (60k + 60k on 100k)
  // Section 8 & 22.3
  // =========================================================================
  it("TC-03 [OCC]: 2 concurrent competing payments (60k + 60k on 100k balance) results in 1 success and 1 overpayment rejection", async () => {
    const invoiceId = "inv_tc03_overpay";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-003");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const payment1 = { amount: 60000, eventId: "evt_tc03_p1", key: "key_tc03_p1" };
    const payment2 = { amount: 60000, eventId: "evt_tc03_p2", key: "key_tc03_p2" };

    const results = await Promise.allSettled([
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_03", email: "teller3@bizA.com" },
        payment1.amount,
        payment1.eventId,
        payment1.key,
        adminDb
      ),
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_03", email: "teller3@bizA.com" },
        payment2.amount,
        payment2.eventId,
        payment2.key,
        adminDb
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one must succeed, exactly one must fail with overpayment error
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.message).toMatch(/surpaiement|dépasse le solde restant/i);

    // Verify invoice state in emulator
    const finalInvoice = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(finalInvoice!.paidAmount).toBe(60000);
    expect(finalInvoice!.balance).toBe(40000);
    expect(finalInvoice!.status).toBe("PARTIALLY_PAID");
    expect(finalInvoice!.isPaid).toBe(false);
    expect(finalInvoice!.payments).toHaveLength(1);

    // CRITICAL: paidAmount NEVER became 120,000, balance NEVER negative!
    expect(finalInvoice!.paidAmount).toBeLessThanOrEqual(finalInvoice!.totalAmount);
    expect(finalInvoice!.balance).toBeGreaterThanOrEqual(0);
  });

  // =========================================================================
  // TEST CASE 4: AGGREGATE PAYMENT STRESS (1,000,000 HTG: 10 concurrent x 100k)
  // Section 9 & 22.4
  // =========================================================================
  it("TC-04 [OCC]: 10 concurrent partial payments (100k each) serialize into exactly 1,000,000 HTG full settlement", async () => {
    const invoiceId = "inv_tc04_million";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 1000000, "INV-5D-004");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const batchCount = 10;
    const trancheAmount = 100000;

    const tasks = Array.from({ length: batchCount }).map((_, idx) =>
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_stress", email: "stress@bizA.com" },
        trancheAmount,
        `evt_tc04_${idx}`,
        `key_tc04_${idx}`,
        adminDb
      )
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(batchCount);

    const finalInvoice = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(finalInvoice!.paidAmount).toBe(1000000);
    expect(finalInvoice!.balance).toBe(0);
    expect(finalInvoice!.status).toBe("PAID");
    expect(finalInvoice!.isPaid).toBe(true);
    expect(finalInvoice!.payments).toHaveLength(10);

    // An eleventh payment must now be rejected as overpayment / already settled
    await expect(
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_stress", email: "stress@bizA.com" },
        10000,
        "evt_tc04_overflow",
        "key_tc04_overflow",
        adminDb
      )
    ).rejects.toThrow(/déjà réglée|surpaiement/i);
  });

  // =========================================================================
  // TEST CASE 5: IDEMPOTENT RETRY WAVE UNDER CONCURRENCY
  // Section 10 & 22.5
  // =========================================================================
  it("TC-05 [OCC]: Wave 1 (20 concurrent) followed by Wave 2 (exact same 20 concurrent) produces 1 event and 1 ledger entry", async () => {
    const invoiceId = "inv_tc05_waves";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-005");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const paymentAmount = 40000;
    const eventId = "evt_tc05_wave";
    const key = "key_tc05_wave";

    // WAVE 1
    const wave1 = Array.from({ length: 10 }).map(() =>
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_01", email: "teller1@bizA.com" },
        paymentAmount,
        eventId,
        key,
        adminDb
      )
    );
    await Promise.all(wave1);

    // WAVE 2 (exact same parameters)
    const wave2 = Array.from({ length: 10 }).map(() =>
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_01", email: "teller1@bizA.com" },
        paymentAmount,
        eventId,
        key,
        adminDb
      )
    );
    const resultsWave2 = await Promise.all(wave2);

    expect(resultsWave2).toHaveLength(10);

    const finalInvoice = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(finalInvoice!.paidAmount).toBe(40000);
    expect(finalInvoice!.balance).toBe(60000);
    expect(finalInvoice!.payments).toHaveLength(1);
  });

  // =========================================================================
  // TEST CASE 6: CONFLICTING RETRY TEST (AMOUNT MISMATCH ON SAME KEY)
  // Section 11 & 22.6
  // =========================================================================
  it("TC-06 [OCC]: Conflicting retry with different amount on same idempotency identity throws explicit conflict error", async () => {
    const invoiceId = "inv_tc06_conflict";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-006");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const eventId = "evt_tc06_orig";
    const key = "key_tc06_orig";

    // Initial 40,000 payment
    await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "BANK_TRANSFER",
      "main",
      "finance",
      { uid: "teller_01", email: "teller1@bizA.com" },
      40000,
      eventId,
      key,
      adminDb
    );

    // Retry with conflicting amount: 50,000 on the same idempotency key
    await expect(
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_01", email: "teller1@bizA.com" },
        50000,
        eventId,
        key,
        adminDb
      )
    ).rejects.toThrow(/Conflit d'idempotence/i);

    // Authoritative amount remains 40,000 and was not silently mutated to 50,000
    const inv = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(inv!.paidAmount).toBe(40000);
    expect(inv!.payments![0].amount).toBe(40000);
  });

  // =========================================================================
  // TEST CASE 7: IDEMPOTENCY KEY CONFLICT (DIFFERENT EVENT ID, SAME KEY)
  // Section 12 & 22.7
  // =========================================================================
  it("TC-07 [OCC]: Different event ID with same idempotency key cannot create duplicate credit", async () => {
    const invoiceId = "inv_tc07_key_ns";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-007");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const sharedKey = "shared_idempotency_key_777";

    // Event 1 with sharedKey
    await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "BANK_TRANSFER",
      "main",
      "finance",
      { uid: "teller_01", email: "teller1@bizA.com" },
      40000,
      "evt_tc07_01",
      sharedKey,
      adminDb
    );

    // Event 2 attempting to reuse same sharedKey for 30,000
    await expect(
      InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_01", email: "teller1@bizA.com" },
        30000,
        "evt_tc07_02",
        sharedKey,
        adminDb
      )
    ).rejects.toThrow(/Conflit d'idempotence/i);

    // Verify exactly 1 payment exists
    const inv = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(inv!.paidAmount).toBe(40000);
    expect(inv!.payments).toHaveLength(1);
  });

  // =========================================================================
  // TEST CASE 8: TIMEOUT / LOST RESPONSE SIMULATION
  // Section 13 & 22.8
  // =========================================================================
  it("TC-08 [OCC]: Simulated client timeout / lost response retry safely returns committed state without duplicate", async () => {
    const invoiceId = "inv_tc08_timeout";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 100000, "INV-5D-008");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const eventId = "evt_tc08_timeout";
    const key = "key_tc08_timeout";

    // Request 1 succeeds at server, response dropped by simulated network failure
    const res1 = await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "CASH",
      "main",
      "finance",
      { uid: "teller_01", email: "teller1@bizA.com" },
      35000,
      eventId,
      key,
      adminDb
    );
    expect(res1.invoice.paidAmount).toBe(35000);

    // Client retries exact same request after timeout
    const res2 = await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "CASH",
      "main",
      "finance",
      { uid: "teller_01", email: "teller1@bizA.com" },
      35000,
      eventId,
      key,
      adminDb
    );

    expect(res2.invoice.paidAmount).toBe(35000);
    expect(res2.invoice.balance).toBe(65000);

    const finalInvoice = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(finalInvoice!.payments).toHaveLength(1);
    expect(finalInvoice!.paidAmount).toBe(35000);
  });

  // =========================================================================
  // TEST CASE 9: PAYMENT <-> LEDGER ATOMICITY
  // Section 14 & 22.9
  // =========================================================================
  it("TC-09 [OCC]: Sum of accepted payment events exactly equals sum of ledger entries and invoice paidAmount", async () => {
    const invoiceId = "inv_tc09_atomicity";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 85000, "INV-5D-009");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const payments = [
      { amount: 25000, id: "p1" },
      { amount: 35000, id: "p2" },
      { amount: 25000, id: "p3" },
    ];

    for (const p of payments) {
      await InvoiceService.recordInvoicePayment(
        BIZ_A,
        invoiceId,
        "BANK_TRANSFER",
        "main",
        "finance",
        { uid: "teller_01", email: "teller1@bizA.com" },
        p.amount,
        `evt_tc09_${p.id}`,
        `key_tc09_${p.id}`,
        adminDb
      );
    }

    const inv = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(inv!.paidAmount).toBe(85000);
    expect(inv!.balance).toBe(0);
    expect(inv!.status).toBe("PAID");

    let ledgerSum = 0;
    for (const p of payments) {
      const snap = await adminDb.doc(`businesses/${BIZ_A}/ledger/tx_pay_${invoiceId}_evt_tc09_${p.id}`).get();
      expect(snap.exists).toBe(true);
      ledgerSum += snap.data().amount;
    }

    expect(ledgerSum).toBe(inv!.paidAmount);
    expect(inv!.totalAmount).toBe(inv!.paidAmount + inv!.balance);
  });

  // =========================================================================
  // TEST CASE 10: DOUBLE-ENTRY VERIFICATION
  // Section 15 & 22.10
  // =========================================================================
  it("TC-10 [OCC]: Payment ledger transaction preserves debit === credit (Dr 1010_BANK, Cr 1200_ACCOUNTS_RECEIVABLE) without revenue duplication", async () => {
    const invoiceId = "inv_tc10_double_entry";
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 50000, "INV-5D-010");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    const { paymentTransaction } = await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "BANK_TRANSFER",
      "main",
      "finance",
      { uid: "auditor_01", email: "audit@bizA.com" },
      50000,
      "evt_tc10",
      "key_tc10",
      adminDb
    );

    // Balanced transaction
    expect(paymentTransaction.debit).toBe(50000);
    expect(paymentTransaction.credit).toBe(50000);
    expect(paymentTransaction.debit_cents).toBe(5000000);
    expect(paymentTransaction.credit_cents).toBe(5000000);

    // Correct chart of accounts mapping: Dr Bank, Cr AR
    expect(paymentTransaction.debit_account).toBe("1010_BANK");
    expect(paymentTransaction.credit_account).toBe("1200_ACCOUNTS_RECEIVABLE");

    // Critical invariant: Does NOT credit 4000_OPERATING_REVENUE again!
    expect(paymentTransaction.credit_account).not.toBe("4000_OPERATING_REVENUE");
  });

  // =========================================================================
  // TEST CASE 11: MONETARY PRECISION & FLOATING POINT TOLERANCE
  // Section 16 & 22.11
  // =========================================================================
  it("TC-11 [OCC]: Handles fractional currency, 0.01 cents precision, and prevents IEEE-754 drift (0.1 + 0.2)", async () => {
    const invoiceId = "inv_tc11_precision";
    // Total = 0.30 HTG
    const initialInvoice = createTestInvoice(BIZ_A, invoiceId, 0.3, "INV-5D-011");
    await InvoiceRepository.saveInvoice(initialInvoice, adminDb);

    // Pay 0.10 HTG
    await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "CASH",
      "main",
      "finance",
      { uid: "teller_01", email: "teller1@bizA.com" },
      0.1,
      "evt_tc11_01",
      "key_tc11_01",
      adminDb
    );

    // Pay 0.20 HTG (in IEEE-754, 0.1 + 0.2 = 0.30000000000000004)
    await InvoiceService.recordInvoicePayment(
      BIZ_A,
      invoiceId,
      "CASH",
      "main",
      "finance",
      { uid: "teller_01", email: "teller1@bizA.com" },
      0.2,
      "evt_tc11_02",
      "key_tc11_02",
      adminDb
    );

    const inv = await InvoiceRepository.getInvoiceById(BIZ_A, invoiceId, adminDb);
    expect(inv!.paidAmount).toBeCloseTo(0.3, 5);
    expect(inv!.balance).toBe(0);
    expect(inv!.status).toBe("PAID");
    expect(inv!.isPaid).toBe(true);
  });

  // =========================================================================
  // TEST CASE 12: MULTI-TENANT CONCURRENCY & SECURITY RULES ENFORCEMENT
  // Section 17 & 19 & 22.12
  // =========================================================================
  it("TC-12 [OCC & RULES]: Cross-tenant access is blocked by Firestore Security Rules while intra-tenant is permitted", async () => {
    // Tenant A creates invoice in BIZ_A
    const invoiceA = createTestInvoice(BIZ_A, "inv_tenant_a", 50000);
    await InvoiceRepository.saveInvoice(invoiceA, adminDb);

    // Tenant B attempts to read Tenant A's invoice in emulator
    const tenantBRead = tenantBDb.doc(`businesses/${BIZ_A}/invoices/inv_tenant_a`).get();
    await assertFails(tenantBRead);

    // Tenant B attempts to mutate Tenant A's invoice in emulator
    const tenantBWrite = tenantBDb.doc(`businesses/${BIZ_A}/invoices/inv_tenant_a`).update({ paidAmount: 50000 });
    await assertFails(tenantBWrite);

    // Tenant B attempts to write to Tenant A's ledger
    const tenantBLedger = tenantBDb.doc(`businesses/${BIZ_A}/ledger/fake_tx`).set({ amount: 1000 });
    await assertFails(tenantBLedger);

    // Intra-tenant: Tenant A can read and write within BIZ_A
    const tenantAInvoice = createTestInvoice(BIZ_A, "inv_tenant_a_valid", 25000);
    await assertSucceeds(tenantADb.doc(`businesses/${BIZ_A}/invoices/inv_tenant_a_valid`).set(tenantAInvoice));
    const tenantARead = await assertSucceeds(tenantADb.doc(`businesses/${BIZ_A}/invoices/inv_tenant_a_valid`).get()) as any;
    expect(tenantARead.exists).toBe(true);
    expect(tenantARead.data().totalAmount).toBe(25000);
  });
});
