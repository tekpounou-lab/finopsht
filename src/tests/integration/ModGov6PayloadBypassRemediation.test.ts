import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction } from "firebase/firestore";

describe("Phase MOD-GOV-6: Targeted Payload Bypass Remediation Suite (MG6-01..MG6-18)", () => {
  let testEnv: RulesTestEnvironment;
  const PROJECT_ID = "demo-finops-mod-gov-6";

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

  it("MG6-01: DENIED — OWNER adds 'features' key in settings/general", async () => {
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

    // Verify document was NOT created
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "general"));
      expect(snap.exists()).toBe(false);
    });
  });

  it("MG6-02: DENIED — OWNER adds 'modules' key in settings/general", async () => {
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
        modules: ["payroll", "accounting", "pos"]
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "general"));
      expect(snap.exists()).toBe(false);
    });
  });

  it("MG6-03: DENIED — OWNER adds 'entitlements' key in settings/preferences", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const prefSettingRef = doc(db, "businesses", "biz_tenant_a", "settings", "preferences");
    await assertFails(
      setDoc(prefSettingRef, {
        language: "fr",
        entitlements: { unlimitedUsers: true }
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "preferences"));
      expect(snap.exists()).toBe(false);
    });
  });

  it("MG6-04: DENIED — OWNER adds 'subscriptionPlan' in an ordinary setting", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const settingRef = doc(db, "businesses", "biz_tenant_a", "settings", "billing_pref");
    await assertFails(
      setDoc(settingRef, {
        subscriptionPlan: "ENTERPRISE"
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "billing_pref"));
      expect(snap.exists()).toBe(false);
    });
  });

  it("MG6-05: DENIED — OWNER adds 'tier' in an ordinary setting", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const settingRef = doc(db, "businesses", "biz_tenant_a", "settings", "billing_pref");
    await assertFails(
      setDoc(settingRef, {
        tier: "PLATINUM"
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "billing_pref"));
      expect(snap.exists()).toBe(false);
    });
  });

  it("MG6-06: DENIED — MANAGER attempts same payload injections", async () => {
    const managerContext = testEnv.authenticatedContext("manager_alpha_uid", {
      email: "manager@alpha.com",
      businessId: "biz_tenant_a",
      role: "MANAGER"
    });
    const db = managerContext.firestore();

    const settingRef = doc(db, "businesses", "biz_tenant_a", "settings", "general");
    await assertFails(
      setDoc(settingRef, {
        features: { accounting: true }
      })
    );
  });

  it("MG6-07: DENIED — EMPLOYEE attempts same payload injections", async () => {
    const employeeContext = testEnv.authenticatedContext("employee_alpha_uid", {
      email: "employee@alpha.com",
      businessId: "biz_tenant_a",
      role: "EMPLOYEE"
    });
    const db = employeeContext.firestore();

    const settingRef = doc(db, "businesses", "biz_tenant_a", "settings", "general");
    await assertFails(
      setDoc(settingRef, {
        features: { accounting: true }
      })
    );
  });

  it("MG6-08: ALLOWED — OWNER modifies ONLY 'theme' (legitimate key) in an authorized setting", async () => {
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

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(snap.data()?.theme).toBe("dark");
    });
  });

  it("MG6-09: ALLOWED — OWNER creates an ordinary setting without privileged fields", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const workingHoursRef = doc(db, "businesses", "biz_tenant_a", "settings", "working_hours");
    await assertSucceeds(
      setDoc(workingHoursRef, {
        start: "08:00",
        end: "17:00",
        days: ["MON", "TUE", "WED", "THU", "FRI"]
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "working_hours"));
      expect(snap.data()?.start).toBe("08:00");
    });
  });

  it("MG6-10: DENIED — OWNER uses setDoc(..., { merge: true }) to inject 'features'", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    // First create a legitimate appearance setting
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      await setDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"), {
        theme: "light"
      });
    });

    const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
    // Attempt merge setDoc with features injection -> MUST FAIL
    await assertFails(
      setDoc(appearanceRef, {
        features: { accounting: true }
      }, { merge: true })
    );

    // Verify existing document was NOT modified
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(snap.data()?.features).toBeUndefined();
      expect(snap.data()?.theme).toBe("light");
    });
  });

  it("MG6-11: DENIED — OWNER uses writeBatch() containing a privileged payload injection -> Entire batch rejected", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const batch = writeBatch(db);
    const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
    const generalRef = doc(db, "businesses", "biz_tenant_a", "settings", "general");

    batch.set(appearanceRef, { theme: "dark" }); // Legitimate
    batch.set(generalRef, { theme: "light", features: { accounting: true } }); // Malicious payload

    await assertFails(batch.commit());

    // Verify ZERO mutations applied
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const appSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(appSnap.exists()).toBe(false);
      const genSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "general"));
      expect(genSnap.exists()).toBe(false);
    });
  });

  it("MG6-12: DENIED — OWNER uses runTransaction() containing a privileged payload injection -> Entire transaction rejected", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    await assertFails(
      runTransaction(db, async (transaction) => {
        const appearanceRef = doc(db, "businesses", "biz_tenant_a", "settings", "appearance");
        const generalRef = doc(db, "businesses", "biz_tenant_a", "settings", "general");

        transaction.set(appearanceRef, { theme: "dark" });
        transaction.set(generalRef, { theme: "light", features: { accounting: true } });
      })
    );

    // Verify ZERO mutations applied
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const appSnap = await getDoc(doc(adminContext.firestore(), "businesses", "biz_tenant_a", "settings", "appearance"));
      expect(appSnap.exists()).toBe(false);
    });
  });

  it("MG6-13: DENIED — OWNER A targets settings of Tenant B", async () => {
    const ownerAContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerAContext.firestore();

    const tenantBAppRef = doc(db, "businesses", "biz_tenant_b", "settings", "appearance");
    await assertFails(setDoc(tenantBAppRef, { theme: "hacked" }));
    await assertFails(getDoc(tenantBAppRef));
  });

  it("MG6-14: ALLOWED — SUPER_ADMIN writes via official entitlement path (settings/features)", async () => {
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

  it("MG6-15: ALLOWED — OWNER modifies explicitly allowed operational settings (business_settings/{businessId})", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const bizSettingsRef = doc(db, "business_settings", "biz_tenant_a");
    await assertSucceeds(
      updateDoc(bizSettingsRef, {
        companyName: "Tenant Alpha Corp Updated"
      })
    );

    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const snap = await getDoc(doc(adminContext.firestore(), "business_settings", "biz_tenant_a"));
      expect(snap.data()?.companyName).toBe("Tenant Alpha Corp Updated");
    });
  });

  it("MG6-16: DENIED — Attempted injection via 'activeModules' and 'enabledModules' aliases", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const settingRef1 = doc(db, "businesses", "biz_tenant_a", "settings", "activeModules");
    await assertFails(
      setDoc(settingRef1, {
        activeModules: ["accounting", "pos"]
      })
    );

    const settingRef2 = doc(db, "businesses", "biz_tenant_a", "settings", "enabledModules");
    await assertFails(
      setDoc(settingRef2, {
        enabledModules: ["accounting", "pos"]
      })
    );
  });

  it("MG6-17: DENIED — Attempt via parent document (businesses/{businessId}) or legacy collection (features/{businessId})", async () => {
    const ownerContext = testEnv.authenticatedContext("owner_alpha_uid", {
      email: "owner@alpha.com",
      businessId: "biz_tenant_a",
      role: "OWNER"
    });
    const db = ownerContext.firestore();

    const bizRef = doc(db, "businesses", "biz_tenant_a");
    await assertFails(updateDoc(bizRef, { plan: "ENTERPRISE" }));

    const legacyRef = doc(db, "features", "biz_tenant_a");
    await assertFails(setDoc(legacyRef, { accounting: true }));
  });

  it("MG6-18: DENIED — Unauthenticated user attempts payload injection", async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();

    const generalSettingRef = doc(db, "businesses", "biz_tenant_a", "settings", "general");
    await assertFails(
      setDoc(generalSettingRef, {
        features: { accounting: true }
      })
    );
  });
});
