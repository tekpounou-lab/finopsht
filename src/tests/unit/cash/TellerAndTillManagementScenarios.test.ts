/**
 * FINOPS ERP / FINAYITI Fusion
 * TELLER & TILL MANAGEMENT — SCENARIO VALIDATION SUITE (Scenarios A through I)
 *
 * Verifies:
 * - Scenario A: HTG Till lifecycle (Create, Assign, Open, Transact, Close, GL Balanced)
 * - Scenario B: USD Till lifecycle (Mono-currency nominal isolation, no HTG pollution)
 * - Scenario C: Safe-to-Till Transfer (STT: Liquidity check, Safe decreases, Till increases, GL entry)
 * - Scenario D: Till-to-Safe Transfer (TTS: Till decreases, Safe increases, GL entry)
 * - Scenario E: Cross-Currency FX Transaction (Central exchange rates, frozen rate, GL balance)
 * - Scenario F: Employee Eligibility (Active without user_id is eligible, Terminated ineligible, 1-to-1 unicity)
 * - Scenario G: Daily Closure with Variance (Shortage GL entry on 2910, justification, immutable closure)
 * - Scenario H: Maker-Checker Enforcement (Self-approval rejected)
 * - Scenario I: Concurrency & Duplicate Submission Idempotency
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CashTill, BranchSafe, TillSession, InternalTransfer } from "../../../types/cashManagement";
import { Employee, LedgerTransaction, Role } from "../../../types";
import { CashAccountMapping } from "../../../domains/cash/validation/cashAccountMapping";
import { EmployeeCashEligibilityService } from "../../../domains/cash/services/EmployeeCashEligibilityService";
import { TellerTransactionEngine } from "../../../domains/cash/services/TellerTransactionEngine";
import { TillSessionEngine } from "../../../domains/cash/services/TillSessionEngine";
import { CashTransferEngine } from "../../../domains/cash/services/CashTransferEngine";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { CurrencyRateRepository } from "../../../repositories/CurrencyRateRepository";

const { mockStore } = vi.hoisted(() => {
  return {
    mockStore: new Map<string, any>()
  };
});

// Mock Firestore
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
    runTransaction: vi.fn(async (_db, callback) => {
      return await callback({
        get: vi.fn(async (docRef) => {
          const data = mockStore.get(docRef.path);
          return {
            exists: () => !!data,
            data: () => data,
            id: docRef.id
          };
        }),
        set: vi.fn((docRef, data, options) => {
          if (options?.merge && mockStore.has(docRef.path)) {
            mockStore.set(docRef.path, { ...mockStore.get(docRef.path), ...data });
          } else {
            mockStore.set(docRef.path, data);
          }
        }),
        update: vi.fn((docRef, data) => {
          const existing = mockStore.get(docRef.path) || {};
          mockStore.set(docRef.path, { ...existing, ...data });
        })
      });
    })
  };
});

describe("TELLER & TILL MANAGEMENT — SCENARIO AUDIT SUITE", () => {
  const BIZ_ID = "biz_fusion_haiti_01";
  const BRANCH_ID = "branch_delmas";

  beforeEach(() => {
    mockStore.clear();

    // Seed default central exchange rates
    mockStore.set(`exchange_rates/${BIZ_ID}_latest`, {
      businessId: BIZ_ID,
      effectiveDate: "2026-10-26",
      is_inherited: false,
      rates: {
        ACHAT_CLIENT: 132.5,
        VENTE_CLIENT: 135.0,
        ACHAT_ENVOIE: 131.0,
        VENTE_ENVOIE: 136.0,
        LOCAL: 133.0,
        BRH: 131.8
      }
    });
  });

  // =========================================================================
  // SCENARIO A: HTG Till Lifecycle
  // =========================================================================
  describe("Scenario A: HTG Till Lifecycle & Double-Entry Accounting", () => {
    it("executes complete lifecycle: create, assign, open, cash-in, cash-out, close with matched balance", async () => {
      // 1. Create Till with strict Chart of Accounts mapping (1010)
      const till: CashTill = {
        id: "till_htg_001",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-HTG-001 - Jean Caissier",
        code: "TILL-HTG-001",
        type: "TILL",
        assigned_teller_id: "emp_jean_01",
        assigned_teller_name: "Jean Caissier",
        currency: "HTG",
        balance_cents: 0,
        linked_account_code: "1010",
        linked_account_name: "Caisse HTG Guichet",
        status: "CLOSED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      // 2. Open Session with 5,000.00 HTG (500,000 cents) initial float
      const openResult = await TillSessionEngine.openSession({
        tillId: till.id,
        operatorId: "emp_jean_01",
        operatorName: "Jean Caissier",
        openingBalanceCents: 500000
      });

      expect(openResult.till.status).toBe("OPEN");
      expect(openResult.till.balance_cents).toBe(500000);
      expect(openResult.session.status).toBe("ACTIVE");

      // 3. Counter Cash-In: 12,000.00 HTG (1,200,000 cents)
      const cashInResult = await TellerTransactionEngine.postTellerTransaction({
        tillId: till.id,
        sessionId: openResult.session.id,
        operatorId: "emp_jean_01",
        operatorName: "Jean Caissier",
        transactionType: "COLLECTION_CLIENT",
        currency: "HTG",
        amountCents: 1200000,
        flowBehavior: 1,
        counterpartyName: "Client A",
        description: "Règlement Facture Client"
      });

      expect(cashInResult.till.balance_cents).toBe(1700000); // 5,000 + 12,000 = 17,000 HTG
      expect(cashInResult.transaction.debit_account_code).toBe("1010");
      expect(cashInResult.transaction.credit_account_code).toBe("1200");
      expect(cashInResult.ledgerTransaction.debit_amount_cents).toBe(1200000);
      expect(cashInResult.ledgerTransaction.credit_amount_cents).toBe(1200000);

      // 4. Counter Cash-Out: 2,000.00 HTG (200,000 cents)
      const cashOutResult = await TellerTransactionEngine.postTellerTransaction({
        tillId: till.id,
        sessionId: openResult.session.id,
        operatorId: "emp_jean_01",
        operatorName: "Jean Caissier",
        transactionType: "DISBURSEMENT_OPERATION",
        currency: "HTG",
        amountCents: 200000,
        flowBehavior: -1,
        counterpartyName: "Fournisseur B",
        description: "Avance Fournisseur"
      });

      expect(cashOutResult.till.balance_cents).toBe(1500000); // 17,000 - 2,000 = 15,000 HTG
      expect(cashOutResult.transaction.debit_account_code).toBe("6010");
      expect(cashOutResult.transaction.credit_account_code).toBe("1010");

      // 5. Close Session with physical count exactly 15,000.00 HTG
      const closeResult = await TillSessionEngine.closeSession({
        sessionId: openResult.session.id,
        actualClosingCents: 1500000,
        operatorId: "emp_jean_01",
        operatorName: "Jean Caissier",
        denominationBreakdown: { "1000": 15 }
      });

      expect(closeResult.session.status).toBe("CLOSED_MATCHED");
      expect(closeResult.session.discrepancy_cents).toBe(0);
      expect(closeResult.till.status).toBe("CLOSED");
      expect(closeResult.varianceLedgerTx).toBeUndefined();

      // 6. Verify Till Statement matches SSOT
      const statement = await TillSessionEngine.getTillStatement(till.id, BIZ_ID);
      expect(statement.totalInflowsCents).toBe(1200000);
      expect(statement.totalOutflowsCents).toBe(200000);
      expect(statement.closingBalanceCents).toBe(1500000); // 500k float + 1M net movements
    });
  });

  // =========================================================================
  // SCENARIO B: USD Till Lifecycle & Nominal Isolation
  // =========================================================================
  describe("Scenario B: USD Till Lifecycle & Currency Isolation", () => {
    it("maintains strict nominal USD balances without HTG currency pollution", async () => {
      // Create USD Till with 1020 account
      const usdTill: CashTill = {
        id: "till_usd_001",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-USD-001 - Marie USD",
        code: "TILL-USD-001",
        type: "TILL",
        assigned_teller_id: "emp_marie_02",
        assigned_teller_name: "Marie Teller",
        currency: "USD",
        balance_cents: 0,
        linked_account_code: "1020",
        linked_account_name: "Caisse USD Guichet",
        status: "CLOSED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(usdTill);

      // Open USD Session with $100.00 (10,000 cents)
      const openUsd = await TillSessionEngine.openSession({
        tillId: usdTill.id,
        operatorId: "emp_marie_02",
        operatorName: "Marie Teller",
        openingBalanceCents: 10000
      });
      expect(openUsd.till.balance_cents).toBe(10000);

      // Post USD Transaction: $500.00 (50,000 cents)
      const txUsd = await TellerTransactionEngine.postTellerTransaction({
        tillId: usdTill.id,
        sessionId: openUsd.session.id,
        operatorId: "emp_marie_02",
        operatorName: "Marie Teller",
        transactionType: "COLLECTION_CLIENT",
        currency: "USD",
        amountCents: 50000,
        flowBehavior: 1,
        counterpartyName: "US Customer",
        description: "Payment in USD"
      });

      expect(txUsd.till.balance_cents).toBe(60000); // $600.00
      expect(txUsd.transaction.currency).toBe("USD");
      expect(txUsd.transaction.amount_cents).toBe(50000);
      expect(txUsd.ledgerTransaction.currency).toBe("USD");
      expect(txUsd.ledgerTransaction.debit_account_code).toBe("1020");
    });
  });

  // =========================================================================
  // SCENARIO C: Safe-to-Till Transfer (STT)
  // =========================================================================
  describe("Scenario C: Safe to Till Transfer (STT)", () => {
    it("transfers liquidity from Branch Safe to Till with balanced double-entry accounting", async () => {
      // Safe with 100,000 HTG (10,000,000 cents)
      const safe: BranchSafe = {
        id: "safe_htg_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "SAFE-HTG-01",
        code: "SAFE-HTG-01",
        type: "SAFE",
        currency: "HTG",
        balance_cents: 10000000,
        linked_account_code: "1015",
        linked_account_name: "Coffre-Fort Succursale HTG",
        min_limit_cents: 1000000,
        max_limit_cents: 50000000,
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveSafe(safe);

      // Till with 10,000 HTG (1,000,000 cents)
      const till: CashTill = {
        id: "till_stt_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-HTG-002",
        currency: "HTG",
        balance_cents: 1000000,
        linked_account_code: "1010",
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      // Request STT of 25,000 HTG (2,500,000 cents)
      const trf = await CashTransferEngine.requestTransfer({
        business_id: BIZ_ID,
        source_id: safe.id,
        destination_id: till.id,
        amount_cents: 2500000,
        currency: "HTG",
        initiator_id: "user_teller_01",
        initiator_name: "Teller Jean",
        initiator_role: "TELLER",
        description: "Demande de fonds pour guichet"
      });

      expect(trf.status).toBe("PENDING_APPROVAL");

      // Approve and Execute by Manager
      const execResult = await CashTransferEngine.approveAndExecuteTransfer(
        trf.id,
        "user_mgr_01",
        "Manager Robert",
        "MANAGER"
      );

      expect(execResult.transfer.status).toBe("EXECUTED");
      expect(execResult.source.balance_cents).toBe(7500000); // 100k - 25k = 75k HTG
      expect(execResult.destination.balance_cents).toBe(3500000); // 10k + 25k = 35k HTG

      // Verify Balanced Ledger Entry
      const gl = execResult.ledgerTransaction;
      expect(gl.debit_account_code).toBe("1010"); // Debit Caisse Destination
      expect(gl.credit_account_code).toBe("1015"); // Credit Coffre Source
      expect(gl.debit_amount_cents).toBe(2500000);
      expect(gl.credit_amount_cents).toBe(2500000);
    });
  });

  // =========================================================================
  // SCENARIO D: Till-to-Safe Transfer (TTS)
  // =========================================================================
  describe("Scenario D: Till to Safe Transfer (TTS)", () => {
    it("remits excess cash from Till to Safe with reverse accounting", async () => {
      const safe: BranchSafe = {
        id: "safe_tts_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "SAFE-HTG-02",
        currency: "HTG",
        balance_cents: 5000000,
        linked_account_code: "1015",
        min_limit_cents: 1000000,
        max_limit_cents: 50000000,
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveSafe(safe);

      const till: CashTill = {
        id: "till_tts_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-HTG-003",
        currency: "HTG",
        balance_cents: 3000000, // 30,000 HTG
        linked_account_code: "1010",
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      // Remit 20,000 HTG back to Safe
      const trf = await CashTransferEngine.requestTransfer({
        business_id: BIZ_ID,
        source_id: till.id,
        destination_id: safe.id,
        amount_cents: 2000000,
        currency: "HTG",
        initiator_id: "emp_teller_03",
        initiator_name: "Teller Claire",
        description: "Remise excédent de recettes"
      });

      const execResult = await CashTransferEngine.approveAndExecuteTransfer(
        trf.id,
        "user_mgr_02",
        "Manager Eric",
        "HEAD_TELLER"
      );

      expect(execResult.source.balance_cents).toBe(1000000); // 30k - 20k = 10k HTG
      expect(execResult.destination.balance_cents).toBe(7000000); // 50k + 20k = 70k HTG
      expect(execResult.ledgerTransaction.debit_account_code).toBe("1015"); // Debit Coffre
      expect(execResult.ledgerTransaction.credit_account_code).toBe("1010"); // Credit Caisse
    });
  });

  // =========================================================================
  // SCENARIO E: Cross-Currency FX Counter Transaction
  // =========================================================================
  describe("Scenario E: Cross-Currency FX Transaction", () => {
    it("handles customer selling USD at counter with frozen ACHAT_CLIENT rate", async () => {
      const till: CashTill = {
        id: "till_fx_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-HTG-FX",
        currency: "HTG",
        balance_cents: 2000000, // 20,000 HTG
        linked_account_code: "1010",
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      const session: TillSession = {
        id: "sess_fx_01",
        business_id: BIZ_ID,
        till_id: till.id,
        teller_id: "emp_fx_op",
        teller_name: "FX Operator",
        currency: "HTG",
        opened_at: new Date().toISOString(),
        opening_balance_cents: 2000000,
        status: "ACTIVE"
      };
      await CashManagementRepository.saveSession(session);

      // Customer sells $100 USD. Rate ACHAT_CLIENT is 132.50.
      // HTG disbursed to customer = 100 * 132.50 = 13,250.00 HTG = 1,325,000 cents
      const fxResult = await TellerTransactionEngine.postTellerTransaction({
        tillId: till.id,
        sessionId: session.id,
        operatorId: "emp_fx_op",
        operatorName: "FX Operator",
        transactionType: "FX_EXCHANGE",
        currency: "HTG",
        amountCents: 1325000,
        flowBehavior: -1, // HTG Outflow from till to customer
        isCrossCurrency: true,
        sourceCurrency: "USD",
        targetCurrency: "USD",
        exchangeRateType: "ACHAT_CLIENT",
        appliedExchangeRate: 132.5,
        counterpartyName: "Client FX",
        description: "Achat $100 USD @ 132.50 HTG"
      });

      expect(fxResult.till.balance_cents).toBe(675000); // 20,000 - 13,250 = 6,750 HTG
      expect(fxResult.transaction.applied_exchange_rate).toBe(132.5);
      expect(fxResult.transaction.exchange_rate_type).toBe("ACHAT_CLIENT");
      
      // Verify Bridge Accounting (Multicurrency Safe)
      const gls = fxResult.ledgerTransactions;
      expect(gls).toHaveLength(3);

      // Leg A: HTG Movement (Primary)
      const legA = gls.find(g => g.currency === "HTG" && g.metadata.leg === "PRIMARY")!;
      expect(legA).toBeDefined();
      expect(legA.debit_account_code).toBe("1920"); // Debit FX Clearing
      expect(legA.credit_account_code).toBe("1010"); // Credit Caisse HTG
      expect(legA.amount_cents).toBe(1325000);

      // Leg B: USD Movement (Secondary)
      const legB = gls.find(g => g.currency === "USD")!;
      expect(legB).toBeDefined();
      expect(legB.debit_account_code).toBe("1020"); // Debit Caisse USD (Received)
      expect(legB.credit_account_code).toBe("1920"); // Credit FX Clearing
      expect(legB.amount_cents).toBe(10000); // $100.00

      // Leg C: Realized Result (Spread)
      const legC = gls.find(g => g.category === "FX_RESULT")!;
      expect(legC).toBeDefined();
    });
  });

  // =========================================================================
  // SCENARIO F: Employee Cash Eligibility Service
  // =========================================================================
  describe("Scenario F: Employee Cash Eligibility Verification", () => {
    const employees: Employee[] = [
      {
        id: "emp_active_nouser",
        businessId: BIZ_ID,
        branchId: "BRANCH_01",
        departmentId: "DEP_01",
        email: "nouser@finops.test",
        paymentModel: "FIXED",
        baseSalary: 35000,
        name: "Active Sans Compte Utilisateur",
        role: "JUNIOR_TELLER" as Role,
        status: "ACTIVE",
        isActive: true
        // user_id is deliberately undefined
      },
      {
        id: "emp_active_withuser",
        businessId: BIZ_ID,
        branchId: "BRANCH_01",
        departmentId: "DEP_01",
        email: "withuser@finops.test",
        paymentModel: "FIXED",
        baseSalary: 45000,
        name: "Active Avec Compte",
        userId: "usr_active_01",
        role: "SENIOR_TELLER" as Role,
        status: "ACTIVE",
        isActive: true
      },
      {
        id: "emp_terminated",
        businessId: BIZ_ID,
        branchId: "BRANCH_01",
        departmentId: "DEP_01",
        email: "terminated@finops.test",
        paymentModel: "FIXED",
        baseSalary: 30000,
        name: "Employé Licencié",
        role: "JUNIOR_TELLER" as Role,
        status: "TERMINATED",
        isActive: false
      },
      {
        id: "emp_other_company",
        businessId: "biz_other_tenant",
        branchId: "BRANCH_01",
        departmentId: "DEP_01",
        email: "other@finops.test",
        paymentModel: "FIXED",
        baseSalary: 30000,
        name: "Employé Autre Entreprise",
        role: "JUNIOR_TELLER" as Role,
        status: "ACTIVE",
        isActive: true
      }
    ];

    it("allows active employee without user_id to be assigned to a till", () => {
      const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment({
        employee: employees[0],
        businessId: BIZ_ID,
        currency: "HTG",
        existingTills: []
      });

      expect(eligibility.isEligible).toBe(true);
    });

    it("rejects terminated employee from till assignment", () => {
      const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment({
        employee: employees[2],
        businessId: BIZ_ID,
        currency: "HTG",
        existingTills: []
      });

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain("inactif");
    });

    it("rejects employee from a different business tenant", () => {
      const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment({
        employee: employees[3],
        businessId: BIZ_ID,
        currency: "HTG",
        existingTills: []
      });

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain("n'appartient pas à cette entreprise");
    });

    it("enforces 1-to-1 unicity per currency", () => {
      const existingTill: CashTill = {
        id: "till_existing_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-01",
        currency: "HTG",
        assigned_teller_id: "emp_active_nouser",
        balance_cents: 0,
        status: "OPEN",
        created_at: "",
        updated_at: ""
      };

      const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment({
        employee: employees[0],
        businessId: BIZ_ID,
        currency: "HTG",
        existingTills: [existingTill]
      });

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.reason).toContain("est déjà assigné");
    });
  });

  // =========================================================================
  // SCENARIO G: Daily Closure with Variance Accounting
  // =========================================================================
  describe("Scenario G: Daily Closure with Discrepancy & Variance Accounting", () => {
    it("posts balanced entry to 2910 on cash shortage and enforces justification", async () => {
      const till: CashTill = {
        id: "till_var_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-VARIANCE-01",
        currency: "HTG",
        balance_cents: 10000000, // Expected: 100,000 HTG
        linked_account_code: "1010",
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      const session: TillSession = {
        id: "sess_var_01",
        business_id: BIZ_ID,
        till_id: till.id,
        teller_id: "emp_var_teller",
        teller_name: "Teller Discrepancy",
        currency: "HTG",
        opened_at: new Date().toISOString(),
        opening_balance_cents: 10000000,
        status: "ACTIVE"
      };
      await CashManagementRepository.saveSession(session);

      // Physical count is 99,500 HTG (-500 HTG shortage = -50,000 cents)
      // Attempt closure without notes -> must throw
      await expect(
        TillSessionEngine.closeSession({
          sessionId: session.id,
          actualClosingCents: 9950000,
          operatorId: "emp_var_teller",
          operatorName: "Teller Discrepancy",
          denominationBreakdown: { "1000": 99, "500": 1 },
          notes: ""
        })
      ).rejects.toThrow(/motif d'explication est obligatoire/i);

      // Close with justification
      const closeResult = await TillSessionEngine.closeSession({
        sessionId: session.id,
        actualClosingCents: 9950000,
        operatorId: "emp_var_teller",
        operatorName: "Teller Discrepancy",
        denominationBreakdown: { "1000": 99, "500": 1 },
        notes: "Erreur de rendu de monnaie constatée en fin de journée"
      });

      expect(closeResult.session.status).toBe("CLOSED_DISCREPANCY");
      expect(closeResult.session.discrepancy_cents).toBe(-50000);
      expect(closeResult.session.variance_type).toBe("SHORTAGE");
      expect(closeResult.session.variance_account_code).toBe("2910");

      // Verify Balanced GL Variance Entry
      const gl = closeResult.varianceLedgerTx!;
      expect(gl).toBeDefined();
      expect(gl.debit_account_code).toBe("2910"); // Debit Compte d'Attente Écarts
      expect(gl.credit_account_code).toBe("1010"); // Credit Caisse (reduction to match physical)
      expect(gl.debit_amount_cents).toBe(50000);
      expect(gl.credit_amount_cents).toBe(50000);

      // Verify Audited Reopening requires justification and Maker-Checker
      const reopenResult = await TillSessionEngine.reopenSession({
        tillId: till.id,
        previousSessionId: session.id,
        requesterId: "emp_var_teller",
        requesterName: "Teller Discrepancy",
        approverId: "mgr_audit_01",
        approverName: "Auditor Manager",
        approverRole: "MANAGER",
        reason: "Recomptage ordonné par le contrôleur interne"
      });

      expect(reopenResult.till.status).toBe("OPEN");
      expect(reopenResult.newSession.reopened_from_session_id).toBe(session.id);
    });
  });

  // =========================================================================
  // SCENARIO H: Maker-Checker Enforcement
  // =========================================================================
  describe("Scenario H: Maker-Checker Enforcement on Internal Transfers", () => {
    it("strictly prevents the transfer initiator from self-approving", async () => {
      const safe: BranchSafe = {
        id: "safe_mc_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "SAFE-MC",
        currency: "HTG",
        balance_cents: 5000000,
        linked_account_code: "1015",
        min_limit_cents: 0,
        max_limit_cents: 10000000,
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveSafe(safe);

      const till: CashTill = {
        id: "till_mc_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-MC",
        currency: "HTG",
        balance_cents: 1000000,
        linked_account_code: "1010",
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      const trf = await CashTransferEngine.requestTransfer({
        business_id: BIZ_ID,
        source_id: safe.id,
        destination_id: till.id,
        amount_cents: 1000000,
        currency: "HTG",
        initiator_id: "user_initiator_same",
        initiator_name: "Jean Maker",
        initiator_role: "MANAGER",
        description: "Demande de fonds"
      });

      // Same user attempts self-approval
      await expect(
        CashTransferEngine.approveAndExecuteTransfer(
          trf.id,
          "user_initiator_same", // Maker === Checker
          "Jean Maker",
          "MANAGER"
        )
      ).rejects.toThrow(/MAKER_CHECKER_VIOLATION/i);
    });
  });

  // =========================================================================
  // SCENARIO I: Concurrency & Duplicate Submission Idempotency
  // =========================================================================
  describe("Scenario I: Concurrency & Idempotency", () => {
    it("returns existing transaction without duplicate balance deduction on identical idempotencyKey", async () => {
      const till: CashTill = {
        id: "till_idemp_01",
        business_id: BIZ_ID,
        branch_id: BRANCH_ID,
        name: "TILL-IDEMP",
        currency: "HTG",
        balance_cents: 5000000, // 50,000 HTG
        linked_account_code: "1010",
        status: "OPEN",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(till);

      const session: TillSession = {
        id: "sess_idemp_01",
        business_id: BIZ_ID,
        till_id: till.id,
        teller_id: "emp_idemp",
        teller_name: "Idemp Operator",
        currency: "HTG",
        opened_at: new Date().toISOString(),
        opening_balance_cents: 5000000,
        status: "ACTIVE"
      };
      await CashManagementRepository.saveSession(session);

      const idempotencyKey = "unique_key_order_12345";

      // First call
      const firstRes = await TellerTransactionEngine.postTellerTransaction({
        tillId: till.id,
        sessionId: session.id,
        operatorId: "emp_idemp",
        operatorName: "Idemp Operator",
        transactionType: "DISBURSEMENT_OPERATION",
        currency: "HTG",
        amountCents: 1000000, // 10,000 HTG
        flowBehavior: -1,
        idempotencyKey,
        description: "Paiement Fournisseur"
      });

      expect(firstRes.till.balance_cents).toBe(4000000); // 50k - 10k = 40k HTG

      // Second identical call
      const secondRes = await TellerTransactionEngine.postTellerTransaction({
        tillId: till.id,
        sessionId: session.id,
        operatorId: "emp_idemp",
        operatorName: "Idemp Operator",
        transactionType: "DISBURSEMENT_OPERATION",
        currency: "HTG",
        amountCents: 1000000,
        flowBehavior: -1,
        idempotencyKey,
        description: "Paiement Fournisseur"
      });

      // Must be idempotent: same transaction ID returned, balance NOT deducted a second time
      expect(secondRes.transaction.id).toBe(firstRes.transaction.id);
      expect(secondRes.till.balance_cents).toBe(4000000); // Still 40k HTG, not 30k!
    });
  });

  // =========================================================================
  // SCENARIO J: Realized FX Gains & Losses (Policy Verification)
  // =========================================================================
  describe("Scenario J: Realized FX Gains & Losses", () => {
    const REF_RATE = 131.5; // BRH / Reference Rate
    const BIZ_ID = "biz_fx_policy_test";
    const TODAY = "2026-10-26";

    beforeEach(() => {
      // Seed correct daily grid document for the repository lookup
      mockStore.set(`daily_exchange_rate_grids/fx_grid_${BIZ_ID}_${TODAY}`, {
        businessId: BIZ_ID,
        effectiveDate: TODAY,
        rates: { 
          BRH: REF_RATE, 
          ACHAT_CLIENT: 132.5, 
          VENTE_CLIENT: 135.0,
          LOCAL: 1.0 
        },
        source: "manual",
        is_inherited: false
      });
    });

    it("Scenario J-1: Customer SELLS USD (Bank Buys @ 132.50 vs Ref 131.50) -> Realized Loss", async () => {
      const till: CashTill = {
        id: "till_htg_fx",
        business_id: BIZ_ID,
        branch_id: "MAIN",
        name: "HTG TILL",
        currency: "HTG",
        balance_cents: 5000000, // 50,000 HTG
        status: "OPEN",
        active_session_id: "sess_fx_01",
        created_at: "", updated_at: ""
      };
      await CashManagementRepository.saveTill(till);

      // Customer sells $100.00 USD. 
      // Bank pays $100 * 132.50 = 13,250 HTG.
      // USD is worth $100 * 131.50 = 13,150 HTG.
      // Expected Realized Loss = 100 HTG.

      const result = await TellerTransactionEngine.postTransaction({
        businessId: BIZ_ID,
        branchId: "MAIN",
        tillId: till.id,
        sessionId: "sess_fx_01",
        operatorId: "op_01",
        operatorName: "Operator",
        transactionTypeCode: "FX_BUY",
        transactionTypeName: "Achat USD",
        flowBehavior: -1, // HTG Outflow
        currency: "HTG",
        amountCents: 1325000,
        isCrossCurrency: true,
        targetCurrency: "USD",
        targetAmountCents: 10000, // $100.00
        manualExchangeRate: 132.5,
        businessDate: TODAY
      });

      const gls = result.ledgerTransactions;
      expect(gls).toHaveLength(3); 

      // Leg A: HTG Movement
      const legA = gls.find(g => g.currency === "HTG" && g.metadata.leg === "PRIMARY")!;
      expect(legA.debit_account_code).toBe("1920");
      expect(legA.credit_account_code).toBe("1010");
      expect(legA.amount_cents).toBe(1325000);

      // Leg B: USD Movement
      const legB = gls.find(g => g.currency === "USD")!;
      expect(legB.debit_account_code).toBe("1020"); // Received USD
      expect(legB.credit_account_code).toBe("1920");
      expect(legB.amount_cents).toBe(10000);

      // Leg C: Realized Result (Loss)
      const legC = gls.find(g => g.category === "FX_RESULT")!;
      expect(legC.type).toBe("EXPENSE");
      expect(legC.debit_account_code).toBe("6120"); // FX Loss
      expect(legC.credit_account_code).toBe("1920"); // Clear Bridge
      expect(legC.amount_cents).toBe(10000); // (132.5 - 131.5) * 100 = 100 HTG = 10,000 cents
    });

    it("Scenario J-2: Customer BUYS USD (Bank Sells @ 135.00 vs Ref 131.50) -> Realized Gain", async () => {
      const till: CashTill = {
        id: "till_htg_fx_2",
        business_id: BIZ_ID,
        branch_id: "MAIN",
        name: "HTG TILL",
        currency: "HTG",
        balance_cents: 0,
        status: "OPEN",
        active_session_id: "sess_fx_02",
        created_at: "", updated_at: ""
      };
      await CashManagementRepository.saveTill(till);

      // Customer buys $100.00 USD.
      // Bank receives $100 * 135.00 = 13,500 HTG.
      // USD cost bank $100 * 131.50 = 13,150 HTG.
      // Expected Realized Gain = 350 HTG.

      const result = await TellerTransactionEngine.postTransaction({
        businessId: BIZ_ID,
        branchId: "MAIN",
        tillId: till.id,
        sessionId: "sess_fx_02",
        operatorId: "op_01",
        operatorName: "Operator",
        transactionTypeCode: "FX_SELL",
        transactionTypeName: "Vente USD",
        flowBehavior: 1, // HTG Inflow
        currency: "HTG",
        amountCents: 1350000,
        isCrossCurrency: true,
        targetCurrency: "USD",
        targetAmountCents: 10000,
        manualExchangeRate: 135.0,
        businessDate: TODAY
      });

      const gls = result.ledgerTransactions;
      expect(gls).toHaveLength(3);

      const legC = gls.find(g => g.category === "FX_RESULT")!;
      expect(legC.type).toBe("INCOME");
      expect(legC.debit_account_code).toBe("1920"); // Clear Bridge
      expect(legC.credit_account_code).toBe("4120"); // FX Gain
      expect(legC.amount_cents).toBe(35000); // (135 - 131.5) * 100 = 350 HTG = 35,000 cents
    });
  });
});

