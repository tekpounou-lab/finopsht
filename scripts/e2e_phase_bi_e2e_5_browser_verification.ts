import puppeteer, { Browser, Page } from "puppeteer";
import { auth, db } from "../src/lib/firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, collection, getDocs, limit, query } from "firebase/firestore";
import { EnterpriseIdentityOrchestrator } from "../src/modules/identity/EnterpriseIdentityOrchestrator";

interface AuditStep {
  step: string;
  category: string;
  status: "PASSED" | "FAILED" | "BLOCKED" | "INFO";
  details: string;
  metadata?: any;
}

const auditLog: AuditStep[] = [];

function record(step: string, category: string, status: "PASSED" | "FAILED" | "BLOCKED" | "INFO", details: string, metadata?: any) {
  auditLog.push({ step, category, status, details, metadata });
  console.log(`[${status}] ${step} (${category}): ${details}`);
  if (metadata) {
    console.log(`       Details:`, JSON.stringify(metadata));
  }
}

async function runBrowserAudit() {
  console.log("================================================================================");
  console.log("FINOPS ERP — PHASE BI-E2E-5: REAL BROWSER & STAGING AUTHORIZATION AUDIT");
  console.log("================================================================================");

  // 1. ENVIRONMENT & PRECONDITIONS
  console.log("\n--- SECTION 1: PRECONDITIONS & DISCOVERY ---");
  const envInfo = {
    localUrl: "http://localhost:3000",
    firebaseProject: "finopsht",
    firestoreDb: "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a",
    testUserA: "e2e-tester-a@finops.internal",
    testUserB: "e2e-tester-b@finops.internal",
    timestamp: new Date().toISOString()
  };
  record("Precondition Check", "Environment", "INFO", "Target environment inspected", envInfo);

  // 2. CHECK FIRESTORE TENANTS IN READ-ONLY MODE
  console.log("\n--- SECTION 2: READ-ONLY TENANT & USER DISCOVERY ---");
  let discoveredTenants: any[] = [];
  try {
    const cred = await signInWithEmailAndPassword(auth, envInfo.testUserA, "E2E_TestPassword_2026!A");
    const snap = await EnterpriseIdentityOrchestrator.orchestrate(cred.user);
    record("User A Identity", "Identity", "INFO", `UID: ${cred.user.uid}, Role: ${snap.role}, Biz: ${snap.business?.id || "null"}, Status: ${snap.identityStatus}`, {
      uid: cred.user.uid,
      role: snap.role,
      businessId: snap.business?.id,
      identityStatus: snap.identityStatus,
      onboardingStatus: snap.onboardingStatus
    });

    const q = query(collection(db, "businesses"), limit(10));
    const bizSnap = await getDocs(q);
    bizSnap.forEach(d => {
      discoveredTenants.push({ id: d.id, name: d.data().name || d.data().companyName, ownerId: d.data().ownerId || d.data().owner_id });
    });
    record("Tenant Inventory", "Data", "INFO", `Discovered ${discoveredTenants.length} tenants in remote database`, discoveredTenants);

    // Verify whether testUserA belongs to any of the discovered tenants
    const userBelongsToTenant = discoveredTenants.some(t => t.ownerId === cred.user.uid || snap.business?.id === t.id);
    if (!userBelongsToTenant) {
      record("Tenant Assignment", "Security", "BLOCKED", "Test user e2e-tester-a@finops.internal is UNASSIGNED and has no membership in discovered tenants", {
        userUid: cred.user.uid,
        userRole: snap.role,
        tenantIds: discoveredTenants.map(t => t.id)
      });
    }

    await signOut(auth);
  } catch (err: any) {
    record("Tenant Inventory Error", "Data", "FAILED", err.message);
  }

  // 3. REAL CHROMIUM BROWSER VERIFICATION
  console.log("\n--- SECTION 3: REAL CHROMIUM BROWSER EXECUTION ---");
  let browser: Browser | null = null;
  let page: Page | null = null;
  const consoleLogs: string[] = [];
  const networkEvents: { url: string; method: string; status?: number }[] = [];

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const version = await browser.version();
    record("Browser Boot", "Chromium", "PASSED", `Chromium instance launched successfully: ${version}`);

    page = await browser.newPage();
    page.setViewport({ width: 1280, height: 800 });

    page.on("console", msg => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes("Navigation") || text.includes("Orchestrator") || text.includes("Auth") || text.includes("Error")) {
        console.log(`[Browser Console] ${text}`);
      }
    });

    page.on("requestfinished", req => {
      const resp = req.response();
      if (req.url().includes("identitytoolkit") || req.url().includes("firestore") || req.url().includes("localhost")) {
        networkEvents.push({
          url: req.url().split("?")[0],
          method: req.method(),
          status: resp ? resp.status() : undefined
        });
      }
    });

    // 3.1 Navigate to Landing Page
    await page.goto("http://localhost:3000", { waitUntil: "networkidle2" });
    const title = await page.title();
    record("Landing Page", "Navigation", "PASSED", `Page loaded with title: "${title}"`);

    // 3.2 Navigate to Login
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
    await page.waitForSelector("#login-email-input", { timeout: 10000 });
    record("Login Form Mount", "UI", "PASSED", "UnifiedAuthPortal mounted with interactive input elements");

    // 3.3 Submit Credentials for Test User A
    await page.type("#login-email-input", envInfo.testUserA);
    await page.type("#login-password-input", "E2E_TestPassword_2026!A");
    await page.click("#btn-login-email-submit");

    // Wait for navigation / redirect
    await new Promise(r => setTimeout(r, 4000));
    const currentUrlAfterLogin = page.url();
    record("Post-Login Route", "Routing", "PASSED", `User redirected to: ${currentUrlAfterLogin}`, { currentUrlAfterLogin });

    // 3.4 Verification of Route Protection (Étape A.4: Unassigned user blocked from dashboard)
    console.log("\n--- SECTION 4: ROUTE PROTECTION & RBAC INTERCEPTION ---");
    await page.goto("http://localhost:3000/dashboard", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    const urlAfterDashboardAttempt = page.url();
    const dashboardBlocked = urlAfterDashboardAttempt !== "http://localhost:3000/dashboard";
    record(
      "Dashboard Guard",
      "Security",
      dashboardBlocked ? "PASSED" : "FAILED",
      `Direct navigation to /dashboard was intercepted: Final URL is ${urlAfterDashboardAttempt}`,
      { attempted: "http://localhost:3000/dashboard", final: urlAfterDashboardAttempt, blocked: dashboardBlocked }
    );

    // 3.5 Attempt Workspace Navigation
    await page.goto("http://localhost:3000/workspace", { waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    const urlAfterWorkspaceAttempt = page.url();
    const workspaceBlocked = urlAfterWorkspaceAttempt !== "http://localhost:3000/workspace";
    record(
      "Workspace Guard",
      "Security",
      workspaceBlocked ? "PASSED" : "FAILED",
      `Direct navigation to /workspace was intercepted: Final URL is ${urlAfterWorkspaceAttempt}`,
      { attempted: "http://localhost:3000/workspace", final: urlAfterWorkspaceAttempt, blocked: workspaceBlocked }
    );

    // 3.6 Check DOM text on current page
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 300));
    record("Current Screen Content", "UI", "INFO", `Visible text snippet: ${bodyText.replace(/\n+/g, " ")}`);

  } catch (err: any) {
    record("Browser Execution Failure", "Chromium", "FAILED", err.message);
  } finally {
    if (browser) {
      await browser.close();
      record("Browser Teardown", "Chromium", "PASSED", "Chromium closed cleanly");
    }
  }

  // 4. SUMMARY AUDIT RESULT
  console.log("\n================================================================================");
  console.log("AUDIT EXECUTION SUMMARY");
  console.log("================================================================================");
  console.log(JSON.stringify(auditLog, null, 2));

  process.exit(0);
}

runBrowserAudit().catch(err => {
  console.error("Fatal audit crash:", err);
  process.exit(1);
});
