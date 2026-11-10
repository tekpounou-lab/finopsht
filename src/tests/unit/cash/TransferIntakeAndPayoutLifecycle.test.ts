/**
 * FINOPS ERP / FINAYITI Fusion
 * TRANSFER INTAKE & PAYOUT 2-LEG ACCOUNTING LIFECYCLE & SECURITY TEST SUITE
 *
 * Verifies:
 * 1. Leg 1 Customer Remittance Intake (TransferIntakeEngine):
 *    - Posts Debit 1010 (Caisse HTG) / Credit 2400 (Compte d'Attente Transferts à Payer).
 *    - Sets CustomerTransfer status to READY_FOR_PAYOUT.
 * 2. Leg 2 Transfer Payout at Till (TransferPayoutEngine):
 *    - Posts Debit 2400 (Compte d'Attente Transferts à Payer) / Credit 1010 (Caisse HTG).
 *    - Sets CustomerTransfer status to PAID.
 * 3. Complete Double-Entry GL Liability Clearing Reconciliation:
 *    - Net balance on Account 2400 after Leg 1 + Leg 2 = 0 HTG.
 *    - Till cash balance increases by 15,000 HTG on intake and decreases by 15,000 HTG on payout.
 * 4. Identity & Authorization Hardening:
 *    - Rejects unauthenticated payout requests (missing authenticatedUser context).
 *    - Rejects operator ID spoofing (mismatched caller operatorId vs authenticated user token).
 * 5. Cryptographic Forensic HMAC Seal Integrity:
 *    - Generates valid HMAC signature using secure master secret key.
 *    - Rejects tampered audit logs.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CustomerTransfer, CashTill, TillSession } from "../../../types/cashManagement";
import { TransferIntakeEngine } from "../../../domains/cash/services/TransferIntakeEngine";
import { TransferPayoutEngine } from "../../../domains/cash/services/TransferPayoutEngine";
import { ForensicLogRepository, getForensicHMACSecretKey } from "../../../repositories/ForensicLogRepository";
import { CashAccountMapping } from "../../../domains/cash/validation/cashAccountMapping";

const { mockStore } = vi.hoisted(() => {
  return {
    mockStore: new Map<string, any>()
  };
});

let globalTxLock: Promise<void> = Promise.resolve();

// Mock Firestore for atomic 2-leg execution
vi.mock("firebase/firestore", () => {
  return {
    getFirestore: vi.fn(() => ({})),
    initializeFirestore: vi.fn(() => ({})),
    memoryLocalCache: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(() => ({})),
    serverTimestamp: vi.fn(() => ({ seconds: Date.now() / 1000 })),
    collection: vi.fn((_db, ...pathSegments) => ({ path: pathSegments.join("/") })),
    doc: vi.fn((_db, ...pathSegments) => ({ id: pathSegments[pathSegments.length - 1], path: pathSegments.join("/") })),
    getDoc: vi.fn(async (docRef) => {
      const data = mockStore.get(docRef.path);
      return {
        exists: () => !!data,
        data: () => data,
        id: docRef.id
      };
    }),
    setDoc: vi.fn(async (docRef, data, options) => {
      if (options?.merge && mockStore.has(docRef.path)) {
        mockStore.set(docRef.path, { ...mockStore.get(docRef.path), ...data });
      } else {
        mockStore.set(docRef.path, data);
      }
    }),
    updateDoc: vi.fn(async (docRef, data) => {
      const existing = mockStore.get(docRef.path) || {};
      mockStore.set(docRef.path, { ...existing, ...data });
    }),
    query: vi.fn((collRef, ...constraints) => ({
      path: collRef.path,
      constraints: constraints || []
    })),
    where: vi.fn((field, op, value) => ({ type: "where", field, op, value })),
    orderBy: vi.fn((field, dir) => ({ type: "orderBy", field, dir })),
    limit: vi.fn((n) => ({ type: "limit", n })),
    getDocs: vi.fn(async (queryRef) => {
      let results: any[] = [];
      mockStore.forEach((val, key) => {
        if (key.startsWith(queryRef.path)) {
          results.push({
            id: key.split("/").pop(),
            data: () => val
          });
        }
      });
      if (queryRef.constraints) {
        for (const c of queryRef.constraints) {
          if (c.type === "where") {
            results = results.filter((doc) => {
              const d = doc.data();
              if (c.op === "==") return d[c.field] === c.value;
              if (c.op === "<=") return d[c.field] <= c.value;
              if (c.op === ">=") return d[c.field] >= c.value;
              return true;
            });
          }
        }
      }
      return {
        empty: results.length === 0,
        docs: results,
        forEach: (cb: any) => results.forEach(cb)
      };
    }),
    runTransaction: vi.fn(async (_db, updateFunction) => {
      const prevLock = globalTxLock;
      let resolveLock: () => void;
      globalTxLock = new Promise<void>((r) => { resolveLock = r!; });
      await prevLock;

      try {
        const txContext = {
          get: async (ref: any) => {
            const data = mockStore.get(ref.path);
            return { exists: () => !!data, data: () => data, id: ref.id };
          },
          set: (ref: any, data: any, options?: any) => {
            if (options?.merge && mockStore.has(ref.path)) {
              mockStore.set(ref.path, { ...mockStore.get(ref.path), ...data });
            } else {
              mockStore.set(ref.path, data);
            }
          },
          update: (ref: any, data: any) => {
            const existing = mockStore.get(ref.path) || {};
            mockStore.set(ref.path, { ...existing, ...data });
          }
        };
        return await updateFunction(txContext);
      } finally {
        resolveLock!();
      }
    })
  };
});

describe("TRANSFER INTAKE & PAYOUT — 2-LEG ACCOUNTING & INTEGRITY LIFECYCLE", () => {
  const BUSINESS_ID = "biz_lifecycle_2leg_test";
  const BRANCH_ID = "MAIN_BRANCH";
  const TILL_ID = "till_2leg_htg";
  const SESSION_ID = "session_2leg_htg";
  const TELLER_INTAKE_ID = "emp_teller_intake_001";
  const TELLER_INTAKE_NAME = "Jean Intake";
  const TELLER_PAYOUT_ID = "emp_teller_payout_002";
  const TELLER_PAYOUT_NAME = "Marie Payout";

  beforeEach(() => {
    mockStore.clear();

    // Setup Till with initial balance of 50,000 HTG (5,000,000 cents)
    const till: CashTill = {
      id: TILL_ID,
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      name: "Guichet HTG 2-Leg Test",
      currency: "HTG",
      balance_cents: 5000000,
      status: "OPEN",
      active_session_id: SESSION_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockStore.set(`cash_tills/${till.id}`, till);

    const session: TillSession = {
      id: SESSION_ID,
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      till_id: TILL_ID,
      operator_id: TELLER_PAYOUT_ID,
      operator_name: TELLER_PAYOUT_NAME,
      opening_balance_cents: 1000000,
      current_balance_cents: 5000000,
      status: "ACTIVE",
      opened_at: new Date().toISOString()
    };
    mockStore.set(`till_sessions/${session.id}`, session);
  });

  it("1. Leg 1 Intake creates Account 2400 Liability; Leg 2 Payout clears Account 2400 Liability to 0", async () => {
    // --- LEG 1: Customer Remittance Deposit (20,000 HTG) ---
    const intakeResult = await TransferIntakeEngine.recordInboundTransfer(
      {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        senderName: "Pierre Desrosiers",
        senderPhone: "+509 3700-5566",
        beneficiaryName: "Clara Desrosiers",
        beneficiaryPhone: "+509 3800-7788",
        amountCents: 2000000, // 20,000 HTG
        currency: "HTG",
        tillId: TILL_ID,
        sessionId: SESSION_ID,
        operatorId: TELLER_INTAKE_ID,
        operatorName: TELLER_INTAKE_NAME,
        notes: "Dépôt transfert entrant 20,000 HTG"
      },
      { id: TELLER_INTAKE_ID, name: TELLER_INTAKE_NAME }
    );

    const transferId = intakeResult.transfer.id;
    expect(intakeResult.transfer.status).toBe("READY_FOR_PAYOUT");
    expect(intakeResult.transfer.amount_cents).toBe(2000000);

    // Verify Leg 1 GL Entry in Firestore mock
    const intakeGl = mockStore.get(`ledger_transactions/${intakeResult.intakeGlTxId}`);
    expect(intakeGl).toBeDefined();
    expect(intakeGl.debit_account_code).toBe("1010");  // Debit Caisse HTG
    expect(intakeGl.credit_account_code).toBe("2400"); // Credit Compte d'Attente Transferts à Payer (Liability)
    expect(intakeGl.amount_cents).toBe(2000000);

    // Till Balance increased by 20,000 HTG (50,000 + 20,000 = 70,000 HTG)
    const tillAfterIntake = mockStore.get(`cash_tills/${TILL_ID}`);
    expect(tillAfterIntake.balance_cents).toBe(7000000);

    // --- LEG 2: Beneficiary Payout at Till (20,000 HTG) ---
    const payoutResult = await TransferPayoutEngine.executePayout(
      {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        transferId: transferId,
        tillId: TILL_ID,
        sessionId: SESSION_ID,
        operatorId: TELLER_PAYOUT_ID,
        operatorName: TELLER_PAYOUT_NAME,
        idDocument: "CIN-2233445566"
      },
      { id: TELLER_PAYOUT_ID, name: TELLER_PAYOUT_NAME }
    );

    expect(payoutResult.status).toBe("PAID");
    expect(payoutResult.paid_by_id).toBe(TELLER_PAYOUT_ID);

    // Verify Leg 2 GL Entry in Firestore mock
    const payoutGl = mockStore.get(`ledger_transactions/gl_${payoutResult.payout_tx_id}`);
    expect(payoutGl).toBeDefined();
    expect(payoutGl.debit_account_code).toBe("2400");  // Debit Compte d'Attente Transferts à Payer (Liability Clear)
    expect(payoutGl.credit_account_code).toBe("1010"); // Credit Caisse HTG
    expect(payoutGl.amount_cents).toBe(2000000);

    // Till Balance restored to initial balance (70,000 - 20,000 = 50,000 HTG)
    const tillAfterPayout = mockStore.get(`cash_tills/${TILL_ID}`);
    expect(tillAfterPayout.balance_cents).toBe(5000000);

    // Reconcile Account 2400 Net Balance
    let account2400Debits = 0;
    let account2400Credits = 0;
    mockStore.forEach((v, k) => {
      if (k.startsWith("ledger_transactions/")) {
        if (v.debit_account_code === "2400") account2400Debits += v.amount_cents;
        if (v.credit_account_code === "2400") account2400Credits += v.amount_cents;
      }
    });

    expect(account2400Credits).toBe(2000000);
    expect(account2400Debits).toBe(2000000);
    expect(account2400Credits - account2400Debits).toBe(0); // Account 2400 net liability = 0 HTG
  });

  it("2. Rejects payout attempts when authenticated operator context is missing or spoofed", async () => {
    // Setup transfer
    const intake = await TransferIntakeEngine.recordInboundTransfer(
      {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        senderName: "Sender Test",
        beneficiaryName: "Ben Test",
        amountCents: 1000000,
        currency: "HTG",
        operatorId: TELLER_INTAKE_ID,
        operatorName: TELLER_INTAKE_NAME
      },
      { id: TELLER_INTAKE_ID, name: TELLER_INTAKE_NAME }
    );

    // Case A: Missing authenticatedUser context
    await expect(
      TransferPayoutEngine.executePayout({
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        transferId: intake.transfer.id,
        tillId: TILL_ID,
        sessionId: SESSION_ID,
        operatorId: TELLER_PAYOUT_ID,
        operatorName: TELLER_PAYOUT_NAME,
        idDocument: "CIN-TEST"
      } as any)
    ).rejects.toThrow("Un identifiant d'opérateur authentifié valide est obligatoire");

    // Case B: Operator ID spoofing (params operatorId != authContext.id)
    await expect(
      TransferPayoutEngine.executePayout(
        {
          businessId: BUSINESS_ID,
          branchId: BRANCH_ID,
          transferId: intake.transfer.id,
          tillId: TILL_ID,
          sessionId: SESSION_ID,
          operatorId: "emp_malicious_hacker",
          operatorName: "Hacker",
          idDocument: "CIN-SPOOF"
        },
        { id: TELLER_PAYOUT_ID, name: TELLER_PAYOUT_NAME }
      )
    ).rejects.toThrow("Usurpation d'identité détectée");
  });

  it("3. Verifies secure HMAC audit seal and detects log tampering", async () => {
    const secretKey = getForensicHMACSecretKey(BUSINESS_ID);
    expect(secretKey).toContain(BUSINESS_ID);

    // Perform intake and payout to generate forensic logs
    const intake = await TransferIntakeEngine.recordInboundTransfer(
      {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        senderName: "Alice",
        beneficiaryName: "Bob",
        amountCents: 500000,
        currency: "HTG",
        operatorId: TELLER_INTAKE_ID,
        operatorName: TELLER_INTAKE_NAME
      },
      { id: TELLER_INTAKE_ID, name: TELLER_INTAKE_NAME }
    );

    let intakeLog: any = null;
    mockStore.forEach((v, k) => {
      if (k.startsWith("forensic_logs/") && v.action === "TRANSFER_INTAKE_RECORDED") {
        intakeLog = v;
      }
    });

    expect(intakeLog).toBeDefined();
    expect(intakeLog.signature).toBeDefined();

    // Signature verification should pass
    const isAuthentic = await ForensicLogRepository.verifyLogSignature(intakeLog);
    expect(isAuthentic).toBe(true);

    // Tampered payload verification must fail
    const tamperedLog = { ...intakeLog, details: "TAMPERED DETAILS: Amount altered to 5,000,000 HTG" };
    const isTamperedValid = await ForensicLogRepository.verifyLogSignature(tamperedLog);
    expect(isTamperedValid).toBe(false);
  });
});
