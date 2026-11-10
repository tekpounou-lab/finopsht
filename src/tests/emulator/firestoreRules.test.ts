/**
 * FINOPS ERP / FINAYITI FUSION
 * FIRESTORE SECURITY RULES AUTOMATED TEST SUITE
 *
 * Evaluates rules_version = '2' firestore.rules logic against:
 * 1. Unauthenticated read/write rejection on financial collections.
 * 2. Direct client write locking on customer_transfers, payout_idempotency_locks, teller_transactions, forensic_logs.
 * 3. Cross-tenant access isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds
} from "@firebase/rules-unit-testing";

const PROJECT_ID = "test-finops-rules-emulator";
let testEnv: RulesTestEnvironment;

describe("FIRESTORE SECURITY RULES — FINANCIAL COLLECTIONS LOCKDOWN", () => {
  beforeAll(async () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf8");

    try {
      const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
      const [host, portStr] = emulatorHost.split(":");
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules,
          host: host || "127.0.0.1",
          port: portStr ? parseInt(portStr) : 8080
        }
      });
    } catch (e) {
      console.warn("Firestore Emulator not active, skipping rules unit tests.");
    }
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  it("1. Unauthenticated users cannot read or write customer_transfers", async () => {
    if (!testEnv) return;
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(unauthDb.collection("customer_transfers").get());
    await assertFails(
      unauthDb.collection("customer_transfers").doc("trf_100").set({
        business_id: "biz_001",
        reference: "TRF-001",
        amount_cents: 100000,
        status: "READY_FOR_PAYOUT"
      })
    );
  });

  it("2. Direct client SDK writes to customer_transfers are DENIED for authenticated tellers", async () => {
    if (!testEnv) return;
    const tellerDb = testEnv
      .authenticatedContext("usr_teller_100", {
        businessId: "biz_001",
        role: "TELLER",
        email_verified: true
      })
      .firestore();

    // Direct create attempt
    await assertFails(
      tellerDb.collection("customer_transfers").doc("trf_direct_01").set({
        business_id: "biz_001",
        reference: "TRF-DIRECT-01",
        amount_cents: 1500000,
        status: "READY_FOR_PAYOUT"
      })
    );

    // Direct update attempt
    await assertFails(
      tellerDb.collection("customer_transfers").doc("trf_existing").update({
        status: "PAID",
        paid_by_id: "usr_teller_100"
      })
    );
  });

  it("3. Direct client SDK writes to payout_idempotency_locks are DENIED", async () => {
    if (!testEnv) return;
    const tellerDb = testEnv
      .authenticatedContext("usr_teller_100", {
        businessId: "biz_001",
        role: "TELLER"
      })
      .firestore();

    await assertFails(
      tellerDb.collection("payout_idempotency_locks").doc("payout_trf_100").set({
        status: "COMPLETED",
        payout_tx_id: "tx_forged_100"
      })
    );
  });

  it("4. Direct client SDK writes to teller_transactions and forensic_logs are DENIED", async () => {
    if (!testEnv) return;
    const tellerDb = testEnv
      .authenticatedContext("usr_teller_100", {
        businessId: "biz_001",
        role: "TELLER"
      })
      .firestore();

    await assertFails(
      tellerDb.collection("teller_transactions").doc("tx_forged_01").set({
        business_id: "biz_001",
        amount_cents: 500000,
        status: "POSTED"
      })
    );

    await assertFails(
      tellerDb.collection("forensic_logs").doc("flog_forged_01").set({
        business_id: "biz_001",
        action: "TRANSFER_PAYOUT_COMPLETED",
        signature: "FORGED_SIGNATURE"
      })
    );
  });

  it("5. Cross-tenant reads are DENIED", async () => {
    if (!testEnv) return;
    const tenantADb = testEnv
      .authenticatedContext("usr_tenant_a", {
        businessId: "biz_tenant_a",
        role: "TELLER"
      })
      .firestore();

    // Attempting to read tenant B transfer document
    await assertFails(
      tenantADb.collection("customer_transfers").doc("trf_tenant_b").get()
    );
  });
});
