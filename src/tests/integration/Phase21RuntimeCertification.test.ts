import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

describe("Phase 21: Firestore Rules Runtime Security Certification Suite", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-no-project";

  beforeAll(async () => {
    const rules = fs.readFileSync("firestore.rules", "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: "127.0.0.1",
        port: 8080
      }
    });
  }, 60000);

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }, 30000);

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  }, 30000);

  describe("1. Canonical Tenant Schema & User Profile Immutability", () => {
    it("strictly DENIES client creation of /users/{uid} with role: 'SUPER_ADMIN'", async () => {
      const attackerContext = testEnv.authenticatedContext("attacker_p21_01", {
        email: "attacker@external.org"
      });
      const db = attackerContext.firestore();

      const userDocRef = doc(db, "users", "attacker_p21_01");
      await assertFails(
        setDoc(userDocRef, {
          id: "attacker_p21_01",
          email: "attacker@external.org",
          role: "SUPER_ADMIN",
          businessId: "biz_p21_01"
        })
      );
    });

    it("allows user update of permitted profile fields (displayName) while strictly DENYING role or businessId mutation", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "users", "usr_p21_legit"), {
          id: "usr_p21_legit",
          email: "legit@company.com",
          displayName: "Original Name",
          role: "EMPLOYEE",
          businessId: "biz_p21_A"
        });
      });

      const userContext = testEnv.authenticatedContext("usr_p21_legit", {
        email: "legit@company.com"
      });
      const db = userContext.firestore();

      const userDocRef = doc(db, "users", "usr_p21_legit");

      // Valid displayName update -> ALLOWED
      await assertSucceeds(
        updateDoc(userDocRef, {
          displayName: "Updated Name"
        })
      );

      // Role mutation attempt -> DENIED
      await assertFails(
        updateDoc(userDocRef, {
          role: "SUPER_ADMIN"
        })
      );

      // BusinessId tenant switch attempt -> DENIED
      await assertFails(
        updateDoc(userDocRef, {
          businessId: "biz_p21_B"
        })
      );
    });
  });

  describe("2. Public Write Cleanup & Audit Trail Immutability", () => {
    it("strictly DENIES unauthenticated writes to /events and /_health_heartbeat_", async () => {
      const unauthCtx = testEnv.unauthenticatedContext();
      const db = unauthCtx.firestore();

      const eventRef = doc(db, "events", "evt_p21_unauth");
      await assertFails(setDoc(eventRef, { action: "ANONYMOUS_INJECTION" }));

      const hbRef = doc(db, "_health_heartbeat_", "hb_p21_unauth");
      await assertFails(setDoc(hbRef, { status: "CORRUPTED" }));
    });

    it("strictly PREVENTS client tampering (update or delete) on /audit_logs", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "audit_logs", "log_p21_01"), {
          id: "log_p21_01",
          businessId: "biz_p21_A",
          action: "PAYROLL_CYCLE_CREATED",
          timestamp: new Date().toISOString()
        });
      });

      const ownerContext = testEnv.authenticatedContext("owner_p21_A", {
        email: "owner@companyA.com",
        businessId: "biz_p21_A",
        role: "OWNER"
      });
      const db = ownerContext.firestore();

      const logRef = doc(db, "audit_logs", "log_p21_01");
      await assertFails(updateDoc(logRef, { action: "FORGED_ACTION" }));
      await assertFails(deleteDoc(logRef));
    });
  });
});
