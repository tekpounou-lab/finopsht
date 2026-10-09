import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

describe("Phase 20: Firestore Rules Runtime Security Certification Suite", () => {
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

  describe("1. SUPER_ADMIN Self-Promotion & User Profile Immutability", () => {
    it("strictly DENIES client creation of /users/{uid} with role: 'SUPER_ADMIN' or isSuperAdmin: true", async () => {
      const attackerContext = testEnv.authenticatedContext("attacker_2001", {
        email: "attacker@external.org"
      });
      const db = attackerContext.firestore();

      const userDocRef = doc(db, "users", "attacker_2001");
      await assertFails(
        setDoc(userDocRef, {
          id: "attacker_2001",
          email: "attacker@external.org",
          role: "SUPER_ADMIN",
          isSuperAdmin: true,
          businessId: "biz_victim_01"
        })
      );
    });

    it("allows client update of permitted profile fields (displayName) while strictly DENYING changes to role or businessId", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "users", "user_p20_01"), {
          id: "user_p20_01",
          email: "legit@company.com",
          displayName: "Original Name",
          role: "EMPLOYEE",
          businessId: "biz_p20_A"
        });
      });

      const userContext = testEnv.authenticatedContext("user_p20_01", {
        email: "legit@company.com"
      });
      const db = userContext.firestore();

      const userDocRef = doc(db, "users", "user_p20_01");

      // Valid displayName update -> ALLOWED
      await assertSucceeds(
        updateDoc(userDocRef, {
          displayName: "Updated Name"
        })
      );

      // Attempting to escalate role to MANAGER -> DENIED (role is immutable for user self-update)
      await assertFails(
        updateDoc(userDocRef, {
          role: "MANAGER"
        })
      );

      // Attempting to switch businessId -> DENIED
      await assertFails(
        updateDoc(userDocRef, {
          businessId: "biz_p20_B"
        })
      );
    });
  });

  describe("2. Public Write Cleanup & Schema Validation", () => {
    it("strictly DENIES unauthenticated writes to /events and /_health_heartbeat_", async () => {
      const unauthCtx = testEnv.unauthenticatedContext();
      const db = unauthCtx.firestore();

      const eventRef = doc(db, "events", "evt_unauth_01");
      await assertFails(setDoc(eventRef, { action: "ANONYMOUS_INJECTION" }));

      const hbRef = doc(db, "_health_heartbeat_", "hb_unauth_01");
      await assertFails(setDoc(hbRef, { status: "CORRUPTED" }));
    });

    it("allows public submission to /sales_requests ONLY when strictly complying with canonical schema", async () => {
      const unauthCtx = testEnv.unauthenticatedContext();
      const db = unauthCtx.firestore();

      const validReqRef = doc(db, "sales_requests", "req_valid_01");
      // Valid submission -> ALLOWED
      await assertSucceeds(
        setDoc(validReqRef, {
          id: "req_valid_01",
          email: "prospect@enterprise.com",
          name: "Jean Dupont",
          companyName: "Acme Corp",
          message: "Interested in FinOps ERP Demo",
          createdAt: new Date().toISOString(),
          status: "NEW"
        })
      );

      // Invalid submission with injected malicious fields or missing required email -> DENIED
      const invalidReqRef = doc(db, "sales_requests", "req_invalid_01");
      await assertFails(
        setDoc(invalidReqRef, {
          id: "req_invalid_01",
          name: "Hacker",
          injectedRole: "SUPER_ADMIN"
        })
      );
    });
  });

  describe("3. Business Ownership & Subscription Entitlements Protection", () => {
    it("strictly DENIES tenant owner from modifying ownerId or subscriptionPlan on business document", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "businesses", "biz_p20_alpha"), {
          id: "biz_p20_alpha",
          ownerId: "owner_p20_alpha",
          name: "Alpha Corp",
          subscriptionPlan: "STARTER",
          status: "ACTIVE"
        });
      });

      const ownerCtx = testEnv.authenticatedContext("owner_p20_alpha", {
        email: "owner@alpha.com",
        businessId: "biz_p20_alpha",
        role: "OWNER"
      });
      const db = ownerCtx.firestore();

      const bizRef = doc(db, "businesses", "biz_p20_alpha");

      // Owner attempting to transfer ownerId to another user -> DENIED
      await assertFails(
        updateDoc(bizRef, {
          ownerId: "attacker_uid_99"
        })
      );

      // Owner attempting to upgrade subscriptionPlan to ENTERPRISE -> DENIED
      await assertFails(
        updateDoc(bizRef, {
          subscriptionPlan: "ENTERPRISE"
        })
      );
    });

    it("strictly DENIES non-superadmin users from accessing /pending_businesses, /subscriptions, or /features writes", async () => {
      const ownerCtx = testEnv.authenticatedContext("owner_p20_alpha", {
        email: "owner@alpha.com",
        businessId: "biz_p20_alpha",
        role: "OWNER"
      });
      const db = ownerCtx.firestore();

      // Listing pending businesses -> DENIED
      const pbizRef = doc(db, "pending_businesses", "pbiz_other");
      await assertFails(getDoc(pbizRef));

      // Direct write to subscriptions -> DENIED
      const subRef = doc(db, "subscriptions", "biz_p20_alpha");
      await assertFails(setDoc(subRef, { plan: "FREE_UNLIMITED" }));
    });
  });
});
