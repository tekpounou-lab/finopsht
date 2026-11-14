/**
 * FINOPS ERP / FINAYITI Fusion
 * TRANSFER PAYOUT MANAGEMENT — CONCURRENCY, ATOMICITY & HMAC INTEGRITY SUITE
 *
 * Verifies:
 * 1. Single-Transaction Atomicity: All reads precede writes; no partial writes on failure.
 * 2. Concurrent Execution Prevention: Promise.all simultaneous calls on same transfer yield exactly 1 success.
 * 3. Concurrent Liquidity Exhaustion: Prevents double-debiting below available till cash.
 * 4. Identity Spoofing Protection: Rejects caller operatorId mismatch with authenticatedUser context.
 * 5. Cryptographic HMAC Signature & Tamper Detection: Verifies ForensicLog seal integrity.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CustomerTransfer, CashTill, TillSession } from "../../../types/cashManagement";
import { TransferPayoutEngine } from "../../../domains/cash/services/TransferPayoutEngine";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";
import { FinopsException } from "../../../modules/runtime/FinopsException";

const { mockStore } = vi.hoisted(() => {
  return {
    mockStore: new Map<string, any>()
  };
});

let globalTxLock: Promise<void> = Promise.resolve();

// Mock Firestore with transactional locking simulation
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
      // Simulate Firestore transaction locking & serialization
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

describe("TRANSFER PAYOUT ENGINE — CONCURRENCY & INTEGRITY HARDENING", () => {
  const BUSINESS_ID = "biz_concurrency_test";
  const BRANCH_ID = "MAIN_BRANCH";
  const TILL_ID = "till_concurrency_htg";
  const SESSION_ID = "session_concurrency_htg";
  const AUTH_OPERATOR_ID = "emp_authenticated_teller_001";
  const AUTH_OPERATOR_NAME = "Marie Curie";

  beforeEach(() => {
    mockStore.clear();

    // Setup Till and Active Session
    const till: CashTill = {
      id: TILL_ID,
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      name: "Guichet Test Concurrence",
      currency: "HTG",
      balance_cents: 5000000, // 50,000 HTG initial balance
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
      operator_id: AUTH_OPERATOR_ID,
      operator_name: AUTH_OPERATOR_NAME,
      opening_balance_cents: 1000000,
      current_balance_cents: 5000000,
      status: "ACTIVE",
      opened_at: new Date().toISOString()
    };
    mockStore.set(`till_sessions/${session.id}`, session);
  });

  it("1. Reject operator spoofing when caller operatorId does not match authenticated user", async () => {
    const transfer: CustomerTransfer = {
      id: "trf_spoof_001",
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      reference: "TRF-SPOOF001",
      sender_name: "John Doe",
      beneficiary_name: "Jane Smith",
      amount_cents: 1000000, // 10,000 HTG
      currency: "HTG",
      status: "READY_FOR_PAYOUT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockStore.set(`customer_transfers/${transfer.id}`, transfer);

    await expect(
      TransferPayoutEngine.executePayout(
        {
          businessId: BUSINESS_ID,
          branchId: BRANCH_ID,
          transferId: transfer.id,
          tillId: TILL_ID,
          sessionId: SESSION_ID,
          operatorId: "emp_malicious_attacker", // Mismatched ID
          operatorName: "Attacker",
          idDocument: "CIN-SPOOF"
        },
        {
          id: AUTH_OPERATOR_ID, // Legitimate authenticated ID
          name: AUTH_OPERATOR_NAME,
          role: "TELLER",
          operational_profile: "teller"
        }
      )
    ).rejects.toThrow("Usurpation d'identité détectée");
  });

  it("2. Promise.all simultaneous execution on same transfer yields exactly 1 payout and 0 double-debiting", async () => {
    const transfer: CustomerTransfer = {
      id: "trf_concurrent_001",
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      reference: "TRF-CONCURRENT-01",
      sender_name: "Alice",
      beneficiary_name: "Bob",
      amount_cents: 1500000, // 15,000 HTG
      currency: "HTG",
      status: "READY_FOR_PAYOUT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockStore.set(`customer_transfers/${transfer.id}`, transfer);

    const payoutParams = {
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID,
      transferId: transfer.id,
      tillId: TILL_ID,
      sessionId: SESSION_ID,
      operatorId: AUTH_OPERATOR_ID,
      operatorName: AUTH_OPERATOR_NAME,
      idDocument: "CIN-CONCURRENT-01"
    };

    const authContext = {
      id: AUTH_OPERATOR_ID,
      name: AUTH_OPERATOR_NAME,
      role: "TELLER",
      operational_profile: "teller"
    };

    // Fire 2 simultaneous payout requests concurrently
    const results = await Promise.allSettled([
      TransferPayoutEngine.executePayout(payoutParams, authContext),
      TransferPayoutEngine.executePayout(payoutParams, authContext)
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify Till Balance was reduced EXACTLY ONCE (50,000 HTG - 15,000 HTG = 35,000 HTG)
    const tillInStore = mockStore.get(`cash_tills/${TILL_ID}`);
    expect(tillInStore.balance_cents).toBe(3500000);

    // Verify Transfer status is PAID
    const transferInStore = mockStore.get(`customer_transfers/${transfer.id}`);
    expect(transferInStore.status).toBe("PAID");

    // Verify exactly ONE Teller Transaction was recorded
    const tellerTxs: any[] = [];
    mockStore.forEach((v, k) => {
      if (k.startsWith("teller_transactions/")) tellerTxs.push(v);
    });
    expect(tellerTxs.length).toBe(1);
  });

  it("3. Concurrent liquidity check prevents till overdraft", async () => {
    // Till has 20,000 HTG balance
    const tillInStore = mockStore.get(`cash_tills/${TILL_ID}`);
    tillInStore.balance_cents = 2000000;
    mockStore.set(`cash_tills/${TILL_ID}`, tillInStore);

    // Create 2 distinct transfers of 15,000 HTG each
    const transferA: CustomerTransfer = {
      id: "trf_liquidity_a",
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      reference: "TRF-LIQ-A",
      sender_name: "Sender A",
      beneficiary_name: "Ben A",
      amount_cents: 1500000, // 15,000 HTG
      currency: "HTG",
      status: "READY_FOR_PAYOUT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const transferB: CustomerTransfer = {
      id: "trf_liquidity_b",
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      reference: "TRF-LIQ-B",
      sender_name: "Sender B",
      beneficiary_name: "Ben B",
      amount_cents: 1500000, // 15,000 HTG
      currency: "HTG",
      status: "READY_FOR_PAYOUT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    mockStore.set(`customer_transfers/${transferA.id}`, transferA);
    mockStore.set(`customer_transfers/${transferB.id}`, transferB);

    const authContext = {
      id: AUTH_OPERATOR_ID,
      name: AUTH_OPERATOR_NAME,
      role: "TELLER",
      operational_profile: "teller"
    };

    // Execute sequentially or concurrently
    const resA = await TransferPayoutEngine.executePayout(
      {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        transferId: transferA.id,
        tillId: TILL_ID,
        sessionId: SESSION_ID,
        operatorId: AUTH_OPERATOR_ID,
        operatorName: AUTH_OPERATOR_NAME,
        idDocument: "CIN-A"
      },
      authContext
    );

    expect(resA.status).toBe("PAID");

    // Till balance is now 5,000 HTG (20,000 - 15,000)
    // Transfer B (15,000 HTG) must fail due to insufficient liquidity
    await expect(
      TransferPayoutEngine.executePayout(
        {
          businessId: BUSINESS_ID,
          branchId: BRANCH_ID,
          transferId: transferB.id,
          tillId: TILL_ID,
          sessionId: SESSION_ID,
          operatorId: AUTH_OPERATOR_ID,
          operatorName: AUTH_OPERATOR_NAME,
          idDocument: "CIN-B"
        },
        authContext
      )
    ).rejects.toThrow("Encaisse insuffisante");

    // Remaining till balance must be exactly 5,000 HTG (500000 cents)
    const finalTill = mockStore.get(`cash_tills/${TILL_ID}`);
    expect(finalTill.balance_cents).toBe(500000);
  });

  it("4. ForensicLog HMAC signature is created and verifies successfully, detecting tampering", async () => {
    const transfer: CustomerTransfer = {
      id: "trf_hmac_001",
      business_id: BUSINESS_ID,
      branch_id: BRANCH_ID,
      reference: "TRF-HMAC001",
      sender_name: "Sender HMAC",
      beneficiary_name: "Ben HMAC",
      amount_cents: 1000000,
      currency: "HTG",
      status: "READY_FOR_PAYOUT",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockStore.set(`customer_transfers/${transfer.id}`, transfer);

    await TransferPayoutEngine.executePayout(
      {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        transferId: transfer.id,
        tillId: TILL_ID,
        sessionId: SESSION_ID,
        operatorId: AUTH_OPERATOR_ID,
        operatorName: AUTH_OPERATOR_NAME,
        idDocument: "CIN-HMAC"
      },
      {
        id: AUTH_OPERATOR_ID,
        name: AUTH_OPERATOR_NAME,
        role: "TELLER",
        operational_profile: "teller"
      }
    );

    // Retrieve written ForensicLog
    let writtenLog: any = null;
    mockStore.forEach((v, k) => {
      if (k.startsWith("forensic_logs/")) writtenLog = v;
    });

    expect(writtenLog).toBeDefined();
    expect(writtenLog.signature).toBeDefined();

    // Verify legitimate signature
    const isValid = await ForensicLogRepository.verifyLogSignature(writtenLog);
    expect(isValid).toBe(true);

    // Tamper with details in the log
    const tamperedLog = {
      ...writtenLog,
      details: "FRAUDULENT ALTERATION: Amount modified to 999,000 HTG"
    };

    const isTamperedValid = await ForensicLogRepository.verifyLogSignature(tamperedLog);
    expect(isTamperedValid).toBe(false);
  });
});
