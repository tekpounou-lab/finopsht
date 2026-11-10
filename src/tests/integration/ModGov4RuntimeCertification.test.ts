import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

describe("Phase MOD-GOV-4: Firestore Rules Runtime Entitlements Certification Suite (ADR-012 / R-01)", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-finops-mod-gov-4";

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

      // Existing baseline features document for Tenant A
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

      // Existing legacy features document for Tenant A
      await setDoc(doc(adminDb, "features", "biz_tenant_a"), {
        attendance: true,
        payroll: true,
        accounting: false,
        pos: false
      });

      // Subscriptions baseline document for Tenant A
      await setDoc(doc(adminDb, "subscriptions", "biz_tenant_a"), {
        business_id: "biz_tenant_a",
        plan: "STARTER",
        status: "ACTIVE"
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

      await setDoc(doc(adminDb, "businesses", "biz_tenant_b", "settings", "features"), {
        businessId: "biz_tenant_b",
        features: {
          attendance: true,
          payroll: true,
          accounting: true,
          pos: true
        },
        plan: "ENTERPRISE"
      });
    });
  }, 30000);

  it("MG4-01: strictly DENIES tenant OWNER from creating businesses/{businessId}/settings/features", async () => {
    // Delete existing features doc to test creation
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await deleteDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
    });

    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

    // Attempt creation -> MUST FAIL
    await assertFails(
      setDoc(featuresRef, {
        businessId: "biz_tenant_a",
        features: { accounting: true, pos: true, platform: true }
      })
    );

    // Verify synthetic document does NOT exist
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.exists()).toBe(false);
    });
  });

  it("MG4-02: strictly DENIES tenant OWNER from modifying existing businesses/{businessId}/settings/features", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

    // Attempt modification -> MUST FAIL
    await assertFails(
      updateDoc(featuresRef, {
        "features.accounting": true,
        "features.pos": true
      })
    );

    // Verify document was NOT modified
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.data()?.features?.accounting).toBe(false);
      expect(snap.data()?.features?.pos).toBe(false);
    });
  });

  it("MG4-03: strictly DENIES tenant OWNER from deleting businesses/{businessId}/settings/features", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

    // Attempt deletion -> MUST FAIL
    await assertFails(deleteDoc(featuresRef));

    // Verify document still exists intact
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.exists()).toBe(true);
    });
  });

  it("MG4-04: strictly DENIES tenant MANAGER from modifying businesses/{businessId}/settings/features", async () => {
    const managerContext = testEnv.authenticatedContext("manager_alpha_uid", {
      email: "manager@alpha.com",
      businessId: "biz_tenant_a",
      role: "MANAGER"
    });
    const db = managerContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

    // Attempt update by manager -> MUST FAIL
    await assertFails(
      setDoc(featuresRef, {
        features: { accounting: true }
      }, { merge: true })
    );

    // Verify document state unchanged
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.data()?.features?.accounting).toBe(false);
    });
  });

  it("MG4-05: strictly DENIES tenant EMPLOYEE from modifying businesses/{businessId}/settings/features", async () => {
    const employeeContext = testEnv.authenticatedContext("employee_alpha_uid", {
      email: "employee@alpha.com",
      businessId: "biz_tenant_a",
      role: "EMPLOYEE"
    });
    const db = employeeContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");

    // Attempt update by employee -> MUST FAIL
    await assertFails(
      setDoc(featuresRef, {
        features: { accounting: true }
      }, { merge: true })
    );

    // Verify document state unchanged
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.data()?.features?.accounting).toBe(false);
    });
  });

  it("MG4-06: strictly DENIES unauthenticated user from reading or modifying entitlements", async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();

    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    const legacyFeaturesRef = doc(db, "features", "biz_tenant_a");

    // Unauthenticated read -> MUST FAIL
    await assertFails(getDoc(featuresRef));
    await assertFails(getDoc(legacyFeaturesRef));

    // Unauthenticated write -> MUST FAIL
    await assertFails(setDoc(featuresRef, { features: { pos: true } }));
    await assertFails(setDoc(legacyFeaturesRef, { pos: true }));
  });

  it("MG4-07: strictly DENIES Tenant A OWNER from modifying Tenant B entitlements", async () => {
    const ownerAContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerAContext.firestore();

    // Tenant A attempts to modify Tenant B features
    const tenantBFeaturesRef = doc(db, "businesses", "biz_tenant_b", "settings", "features");
    await assertFails(
      setDoc(tenantBFeaturesRef, {
        features: { pos: false }
      }, { merge: true })
    );

    // Tenant A attempts to read Tenant B features
    await assertFails(getDoc(tenantBFeaturesRef));

    // Verify Tenant B document was NOT modified
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_b", "settings", "features"));
      expect(snap.data()?.features?.pos).toBe(true);
    });
  });

  it("MG4-08: strictly DENIES tenant OWNER from modifying plan, tier, or subscriptionPlan on business or subscriptions doc", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    // Attempt to tamper with plan on businesses/{businessId}
    const bizRef = doc(db, "businesses", "biz_tenant_a");
    await assertFails(updateDoc(bizRef, { plan: "ENTERPRISE" }));
    await assertFails(updateDoc(bizRef, { subscriptionPlan: "ENTERPRISE" }));
    await assertFails(updateDoc(bizRef, { tier: "ENTERPRISE" }));

    // Attempt direct write to subscriptions/{businessId}
    const subRef = doc(db, "subscriptions", "biz_tenant_a");
    await assertFails(setDoc(subRef, { plan: "ENTERPRISE", status: "ACTIVE" }));

    // Verify document state unchanged
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a"));
      expect(snap.data()?.plan).toBe("STARTER");
      const subSnap = await getDoc(doc(adminContext.firestore(), "subscriptions", "biz_tenant_a"));
      expect(subSnap.data()?.plan).toBe("STARTER");
    });
  });

  it("MG4-09: strictly DENIES tenant OWNER from reactivating excluded module via legacy features/{businessId}", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const legacyRef = doc(db, "features", "biz_tenant_a");

    // Attempt to set pos: true and accounting: true on legacy doc -> MUST FAIL
    await assertFails(
      setDoc(legacyRef, {
        accounting: true,
        pos: true
      }, { merge: true })
    );

    // Verify legacy document state unchanged
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "features", "biz_tenant_a"));
      expect(snap.data()?.accounting).toBe(false);
      expect(snap.data()?.pos).toBe(false);
    });
  });

  it("MG4-10: ALLOWS platform SUPER_ADMIN to explicitly create/update features documents", async () => {
    const superAdminContext = testEnv.authenticatedContext("sa_uid_01", {
      email: "tekpounou@gmail.com", // Verified in allowlist
      role: "SUPER_ADMIN",
      is_super_admin: true
    });
    const db = superAdminContext.firestore();

    const modernRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    const legacyRef = doc(db, "features", "biz_tenant_a");
    const subRef = doc(db, "subscriptions", "biz_tenant_a");

    // Super Admin updating modern settings/features -> MUST SUCCEED
    await assertSucceeds(
      setDoc(modernRef, {
        features: { accounting: true, pos: true },
        updatedBy: "SUPER_ADMIN"
      }, { merge: true })
    );

    // Super Admin updating legacy features -> MUST SUCCEED
    await assertSucceeds(
      setDoc(legacyRef, {
        accounting: true,
        pos: true
      }, { merge: true })
    );

    // Super Admin updating subscription -> MUST SUCCEED
    await assertSucceeds(
      updateDoc(subRef, {
        plan: "ENTERPRISE"
      })
    );

    // Verify mutations took effect
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "features"));
      expect(snap.data()?.features?.accounting).toBe(true);
      const subSnap = await getDoc(doc(adminContext.firestore(), "subscriptions", "biz_tenant_a"));
      expect(subSnap.data()?.plan).toBe("ENTERPRISE");
    });
  });

  it("MG4-11: PRESERVES legitimate tenant admin access to ordinary business settings (e.g. appearance, preferences)", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    // 1. Reading own features -> ALLOWED
    const featuresRef = doc(db, "businesses", "biz_tenant_a", "settings", "features");
    await assertSucceeds(getDoc(featuresRef));

    // 2. Writing ordinary settings document (appearance) -> ALLOWED
    const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
    await assertSucceeds(
      setDoc(appearanceRef, {
        theme: "dark",
        primaryColor: "#06b6d4"
      })
    );

    // 3. Writing ordinary settings document (preferences) -> ALLOWED
    const preferencesRef = doc(db, "businesses", "biz_tenant_a", "settings", "preferences");
    await assertSucceeds(
      setDoc(preferencesRef, {
        language: "fr",
        timeZone: "America/Port-au-Prince"
      })
    );

    // 4. Writing business_settings (working_hours) -> ALLOWED
    const bizSettingsRef = doc(db, "business_settings", "biz_tenant_a");
    await assertSucceeds(
      setDoc(bizSettingsRef, {
        workingHours: { start: "08:00", end: "17:00" }
      }, { merge: true })
    );

    // Verify legitimate settings were written
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const appSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(appSnap.data()?.theme).toBe("dark");
    });
  });

  it("MG4-12: strictly DENIES cross-tenant reading/writing of settings documents via alternative paths", async () => {
    const ownerAContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerAContext.firestore();

    // Tenant A attempts to access Tenant B's appearance settings
    const tenantBAppRef = doc(db, "businesses", "biz_tenant_b", "settings", "appearance");
    await assertFails(getDoc(tenantBAppRef));
    await assertFails(setDoc(tenantBAppRef, { theme: "hacked" }));

    // Tenant A attempts to access Tenant B's general configuration
    const tenantBConfigRef = doc(db, "businesses", "biz_tenant_b", "configuration", "sys_config");
    await assertFails(getDoc(tenantBConfigRef));
    await assertFails(setDoc(tenantBConfigRef, { hacked: true }));
  });
});
