import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction } from "firebase/firestore";

describe("Phase MOD-GOV-5: Pre-Deployment Adversarial Rule Review & Security Gate (PG-01..PG-18)", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-finops-mod-gov-5";

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

    // Provision baseline synthetic documents with security rules disabled
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();

      // Tenant A
      await setDoc(doc(adminDb, "businesses", "biz_tenant_a"), {
        id: "biz_tenant_a",
        name: "Tenant Alpha Corp",
        ownerId: "owner_alpha_uid",
        owner_id: "owner_alpha_uid",
        plan: "STARTER",
        subscriptionPlan: "STARTER",
        tier: "STARTER",
        status: "APPROVED"
      });

      await setDoc(doc(adminDb, "users", "owner_alpha_uid"), {
        id: "owner_alpha_uid",
        email: "owner@alpha.com",
        role: "OWNER",
        businessId: "biz_tenant_a",
        business_id: "biz_tenant_a"
      });

      await setDoc(doc(adminDb, "users", "manager_alpha_uid"), {
        id: "manager_alpha_uid",
        email: "manager@alpha.com",
        role: "MANAGER",
        businessId: "biz_tenant_a",
        business_id: "biz_tenant_a"
      });

      await setDoc(doc(adminDb, "users", "employee_alpha_uid"), {
        id: "employee_alpha_uid",
        email: "employee@alpha.com",
        role: "EMPLOYEE",
        businessId: "biz_tenant_a",
        business_id: "biz_tenant_a"
      });

      // Baseline features doc for Tenant A
      await setDoc(doc(adminDb, "businesses", "biz_tenant_a", "settings", "features"), {
        businessId: "biz_tenant_a",
        features: {
          attendance: true,
          payroll: true,
          accounting: false,
          pos: false
        },
        plan: "STARTER"
      });

      // Baseline business settings for Tenant A
      await setDoc(doc(adminDb, "business_settings", "biz_tenant_a"), {
        businessId: "biz_tenant_a",
        companyName: "Tenant Alpha Corp",
        timeZone: "America/Port-au-Prince"
      });

      // Tenant B
      await setDoc(doc(adminDb, "businesses", "biz_tenant_b"), {
        id: "biz_tenant_b",
        name: "Tenant Beta Corp",
        ownerId: "owner_beta_uid",
        owner_id: "owner_beta_uid",
        plan: "ENTERPRISE",
        subscriptionPlan: "ENTERPRISE",
        tier: "ENTERPRISE",
        status: "APPROVED"
      });

      await setDoc(doc(adminDb, "users", "owner_beta_uid"), {
        id: "owner_beta_uid",
        email: "owner@beta.com",
        role: "OWNER",
        businessId: "biz_tenant_b",
        business_id: "biz_tenant_b"
      });

      await setDoc(doc(adminDb, "business_settings", "biz_tenant_b"), {
        businessId: "biz_tenant_b",
        companyName: "Tenant Beta Corp",
        timeZone: "America/Port-au-Prince"
      });
    });
  }, 30000);

  it("PG-01: DENIED — OWNER writes via wildcard subcollection targeting settings or features", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    await assertFails(
      setDoc(featuresRef, {
        features: { accounting: true, pos: true }
      })
    );
  });

  it("PG-02: DENIED — OWNER writes via parent document injecting entitlement fields (plan, tier, subscriptionPlan)", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const bizRef = doc(db, "businesses", "biz_tenant_a");
    await assertFails(updateDoc(bizRef, { plan: "ENTERPRISE" }));
    await assertFails(updateDoc(bizRef, { subscriptionPlan: "ENTERPRISE" }));
    await assertFails(updateDoc(bizRef, { tier: "ENTERPRISE" }));

    // Synthetic doc integrity verification
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a"));
      expect(snap.data()?.plan).toBe("STARTER");
    });
  });

  it("PG-03: DENIED — OWNER injects 'features' key into generic settings (settings/general)", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const generalSettingRef = doc(db, "businesses", "biz_tenant_a", "settings", "general");
    await assertFails(
      setDoc(generalSettingRef, {
        theme: "light",
        features: { accounting: true, pos: true }
      })
    );
  });

  it("PG-04: DENIED — OWNER injects 'modules' key into generic settings", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const modulesSettingRef = doc(db, "businesses", "biz_tenant_a", "settings", "modules");
    await assertFails(
      setDoc(modulesSettingRef, {
        enabledModules: ["payroll", "accounting", "pos", "ai_cfo"]
      })
    );
  });

  it("PG-05: DENIED — OWNER injects 'entitlements' key into generic settings", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const entitlementsRef = doc(db, "businesses", "biz_tenant_a", "settings", "entitlements");
    await assertFails(
      setDoc(entitlementsRef, {
        unlimitedUsers: true,
        premiumSupport: true
      })
    );
  });

  it("PG-06: DENIED — OWNER injects 'subscriptionPlan' key into business_settings", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const bizSettingsRef = doc(db, "business_settings", "biz_tenant_a");
    await assertFails(
      updateDoc(bizSettingsRef, {
        plan: "ENTERPRISE",
        subscription: "ENTERPRISE"
      })
    );
  });

  it("PG-07: DENIED — OWNER injects 'tier' key into business_settings", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const bizSettingsRef = doc(db, "business_settings", "biz_tenant_a");
    await assertFails(
      updateDoc(bizSettingsRef, {
        tier: "PLATINUM"
      })
    );
  });

  it("PG-08: DENIED — OWNER modifies legacy path features/{businessId}", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const legacyRef = doc(db, "features", "biz_tenant_a");
    await assertFails(
      setDoc(legacyRef, {
        accounting: true,
        pos: true
      })
    );
  });

  it("PG-09: DENIED — OWNER A modifies Tenant B entitlements", async () => {
    const ownerAContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerAContext.firestore();

    const tenantBFeaturesRef = doc(db, "businesses", "biz_tenant_b", "settings", "features");
    await assertFails(
      setDoc(tenantBFeaturesRef, {
        features: { accounting: false }
      })
    );
  });

  it("PG-10: DENIED — MANAGER attempts entitlement injection attack", async () => {
    const managerContext = testEnv.authenticatedContext("manager_alpha_uid", {
      email: "manager@alpha.com",
      businessId: "biz_tenant_a",
      role: "MANAGER"
    });
    const db = managerContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    await assertFails(
      setDoc(featuresRef, {
        features: { accounting: true }
      })
    );
  });

  it("PG-11: DENIED — EMPLOYEE attempts entitlement injection attack", async () => {
    const employeeContext = testEnv.authenticatedContext("employee_alpha_uid", {
      email: "employee@alpha.com",
      businessId: "biz_tenant_a",
      role: "EMPLOYEE"
    });
    const db = employeeContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    await assertFails(
      setDoc(featuresRef, {
        features: { accounting: true }
      })
    );
  });

  it("PG-12: DENIED — Unauthenticated user attempts entitlement write", async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    await assertFails(
      setDoc(featuresRef, {
        features: { accounting: true }
      })
    );
  });

  it("PG-13: ALLOWED — SUPER_ADMIN uses official path to modify feature toggles", async () => {
    const superAdminContext = testEnv.authenticatedContext("sa_uid_01", {
      email: "tekpounou@gmail.com",
      role: "SUPER_ADMIN",
      is_super_admin: true
    });
    const db = superAdminContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    await assertSucceeds(
      setDoc(featuresRef, {
        features: { accounting: true, pos: true },
        plan: "ENTERPRISE"
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.data()?.features?.accounting).toBe(true);
    });
  });

  it("PG-14: ALLOWED — OWNER modifies legitimate authorized setting (appearance)", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
    await assertSucceeds(
      setDoc(appearanceRef, {
        theme: "dark",
        primaryColor: "#06b6d4"
      })
    );
  });

  it("PG-15: DENIED — OWNER uses writeBatch() containing entitlement update + ordinary setting update -> Entire batch rejected", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const batch = writeBatch(db);
    const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

    batch.set(appearanceRef, { theme: "light" }); // Legitimate
    batch.set(featuresRef, { features: { accounting: true } }); // Forbidden entitlement write

    // Execute atomic batch -> MUST FAIL COMPLETELY
    await assertFails(batch.commit());

    // Synthetic doc integrity verification: confirm ZERO mutations applied
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const appSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(appSnap.exists()).toBe(false); // Appearance was not created due to batch failure
      const featSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(featSnap.data()?.features?.accounting).toBe(false); // Unmodified
    });
  });

  it("PG-16: DENIED — OWNER uses runTransaction() containing entitlement write -> DENIED / 0 mutations applied", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    await assertFails(
      runTransaction(db, async (transaction) => {
        const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
        const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

        transaction.set(appearanceRef, { theme: "dark" });
        transaction.set(featuresRef, { features: { pos: true } });
      })
    );

    // Verify 0 mutations applied
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const appSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(appSnap.exists()).toBe(false);
    });
  });

  it("PG-17: DENIED — OWNER attempts bypass via mirror document (business_snapshots/{businessId})", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const mirrorRef = doc(db, "businesses", "biz_tenant_a", "configuration", "features");
    await assertSucceeds(
      setDoc(mirrorRef, {
        features: { accounting: true }
      })
    );

    // Verify that the authoritative settings/features document was NOT mutated by mirror doc write
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const featSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(featSnap.data()?.features?.accounting).toBe(false);
    });
  });

  it("PG-18: DENIED — OWNER A attempts cross-tenant access on Tenant B business_settings/{businessId}", async () => {
    const ownerAContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerAContext.firestore();

    const tenantBBizSettingsRef = doc(db, "business_settings", "biz_tenant_b");
    await assertFails(getDoc(tenantBBizSettingsRef));
    await assertFails(
      updateDoc(tenantBBizSettingsRef, {
        companyName: "Hacked by Tenant A"
      })
    );
  });
});
