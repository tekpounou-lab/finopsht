import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

describe("Phase 19: Firestore Rules Runtime Security Certification Suite", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-no-project";

  beforeAll(async () => {
    const rules = fs.readFileSync("firestore.rules", "utf8");
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: "127.0.0.1",
        port: 8088
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

  describe("1. ADV-18B-01 Runtime Verification: SUPER_ADMIN Self-Promotion Prevention", () => {
    it("strictly DENIES client creation of /users/{uid} with role: 'SUPER_ADMIN'", async () => {
      const attackerContext = testEnv.authenticatedContext("attacker_uid_101", {
        email: "attacker@external.org"
      });
      const db = attackerContext.firestore();

      const userDocRef = doc(db, "users", "attacker_uid_101");
      await assertFails(
        setDoc(userDocRef, {
          id: "attacker_uid_101",
          email: "attacker@external.org",
          role: "SUPER_ADMIN",
          businessId: "biz_test_01"
        })
      );
    });

    it("allows client creation of /users/{uid} with legitimate non-superadmin role (EMPLOYEE)", async () => {
      const regularContext = testEnv.authenticatedContext("user_valid_01", {
        email: "regular.employee@company.com"
      });
      const db = regularContext.firestore();

      const userDocRef = doc(db, "users", "user_valid_01");
      await assertSucceeds(
        setDoc(userDocRef, {
          id: "user_valid_01",
          email: "regular.employee@company.com",
          role: "EMPLOYEE",
          businessId: "biz_test_01"
        })
      );
    });

    it("strictly DENIES client update of existing /users/{uid} to escalate role to 'SUPER_ADMIN'", async () => {
      // Seed pre-existing valid user document via admin context
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "users", "user_valid_02"), {
          id: "user_valid_02",
          email: "legit.user@company.com",
          role: "EMPLOYEE",
          businessId: "biz_test_01"
        });
      });

      const userContext = testEnv.authenticatedContext("user_valid_02", {
        email: "legit.user@company.com"
      });
      const db = userContext.firestore();

      const userDocRef = doc(db, "users", "user_valid_02");
      await assertFails(
        updateDoc(userDocRef, {
          role: "SUPER_ADMIN"
        })
      );
    });

    it("ensures a poisoned /users/{uid} with role: 'SUPER_ADMIN' NEVER confers platform authority to unverified client", async () => {
      // Seed a document with role: "SUPER_ADMIN" owned by an unverified attacker
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "users", "trojan_uid_99"), {
          id: "trojan_uid_99",
          email: "trojan@hacker.io",
          role: "SUPER_ADMIN",
          businessId: "biz_attacker"
        });
        // Create an audit log in a target business
        await setDoc(doc(adminDb, "audit_logs", "log_victim_01"), {
          id: "log_victim_01",
          business_id: "biz_victim_99",
          action: "CONFIDENTIAL_FINANCIAL_SEAL",
          timestamp: new Date().toISOString()
        });
      });

      const trojanContext = testEnv.authenticatedContext("trojan_uid_99", {
        email: "trojan@hacker.io"
      });
      const db = trojanContext.firestore();

      // Attempt to access cross-tenant audit log — must FAIL because poisoned user doc cannot grant isSuperAdmin()
      const logDocRef = doc(db, "audit_logs", "log_victim_01");
      await assertFails(getDoc(logDocRef));
    });

    it("allows verified platform Super Admin (by verified email) to access system records", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "audit_logs", "log_sa_read_01"), {
          id: "log_sa_read_01",
          business_id: "biz_any_10",
          action: "SYSTEM_TAX_UPDATE",
          timestamp: new Date().toISOString()
        });
      });

      const superAdminContext = testEnv.authenticatedContext("sa_uid_01", {
        email: "tekpounou@gmail.com"
      });
      const db = superAdminContext.firestore();

      const logDocRef = doc(db, "audit_logs", "log_sa_read_01");
      await assertSucceeds(getDoc(logDocRef));
    });
  });

  describe("2. Tenant Isolation & Anti-Tampering Runtime Verification", () => {
    it("strictly DENIES cross-tenant reading between tenant A and tenant B", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "employees", "emp_tenant_b_01"), {
          id: "emp_tenant_b_01",
          business_id: "biz_tenant_B",
          name: "Alice Confidential",
          baseSalary: 100000
        });
      });

      const tenantAUser = testEnv.authenticatedContext("user_tenant_a_01", {
        email: "worker@tenantA.com",
        business_id: "biz_tenant_A",
        role: "EMPLOYEE"
      });
      const db = tenantAUser.firestore();

      const empRef = doc(db, "employees", "emp_tenant_b_01");
      await assertFails(getDoc(empRef));
    });

    it("strictly PREVENTS client tampering (update or delete) with audit logs", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "audit_logs", "log_immutable_01"), {
          id: "log_immutable_01",
          business_id: "biz_tenant_A",
          action: "PAYROLL_CYCLE_CREATED",
          timestamp: new Date().toISOString()
        });
      });

      const tenantAUser = testEnv.authenticatedContext("user_tenant_a_01", {
        email: "owner@tenantA.com",
        business_id: "biz_tenant_A",
        role: "OWNER"
      });
      const db = tenantAUser.firestore();

      const logRef = doc(db, "audit_logs", "log_immutable_01");
      // Update is forbidden
      await assertFails(updateDoc(logRef, { action: "TAMPERED_ACTION" }));
      // Delete is forbidden
      await assertFails(deleteDoc(logRef));
    });

    it("strictly DENIES tenant OWNER tampering with subscription plan or status on business document", async () => {
      await testEnv.withSecurityRulesDisabled(async (adminContext) => {
        const adminDb = adminContext.firestore();
        await setDoc(doc(adminDb, "businesses", "biz_tenant_A"), {
          id: "biz_tenant_A",
          ownerId: "owner_uid_A",
          name: "Tenant A Corp",
          subscriptionPlan: "STARTER",
          status: "ACTIVE"
        });
      });

      const ownerContext = testEnv.authenticatedContext("owner_uid_A", {
        email: "owner@tenantA.com",
        business_id: "biz_tenant_A",
        role: "OWNER"
      });
      const db = ownerContext.firestore();

      const bizRef = doc(db, "businesses", "biz_tenant_A");
      // Attempting to elevate subscription plan to ENTERPRISE must FAIL
      await assertFails(
        updateDoc(bizRef, {
          subscriptionPlan: "ENTERPRISE"
        })
      );
    });
  });
});
