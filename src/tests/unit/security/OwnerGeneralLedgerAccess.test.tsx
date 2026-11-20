import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";

import { PermissionService } from "../../../services/PermissionService";
import { NavigationBuilder } from "../../../services/auth/resolvers";
import { getAuthorizedTabsForRole, resolveDefaultTabForRole } from "../../../services/auth/routeResolver";
import { AccessResolver, ActorIdentity } from "../../../permissions/AccessResolver";
import { resolvePermissionBootstrapInput } from "../../../modules/identity/IdentityContext";
import { normalizeTab, TAB_ALIASES } from "../../../components/dashboard/hooks/useNavigation";
import { Sidebar } from "../../../components/dashboard/components/Sidebar";
import LedgerHeader from "../../../components/ledger/LedgerHeader";
import DoubleEntryTable from "../../../components/ledger/DoubleEntryTable";
import { IdentitySnapshot } from "../../../modules/identity/types";
import { LedgerTransaction } from "../../../types";

const FULL_FEATURES = {
  attendance: true,
  payroll: true,
  accounting: true,
  pos: true,
  hr: true,
  crm: true,
  bi: true,
  aiCfo: true,
  aicfo: true,
  documents: true,
  planning: true,
  leave: true,
  cash_management: true,
};

function makeSnapshot(overrides: Partial<IdentitySnapshot> = {}): IdentitySnapshot {
  return {
    user_uid: "usr_owner_a",
    email: "owner@tenanta.com",
    displayName: "Owner Tenant A",
    role: "OWNER",
    permissions: [],
    business: {
      id: "biz_tenant_A",
      name: "Tenant A Corp",
      ownerId: "usr_owner_a",
      status: "ACTIVE",
      plan: "PROFESSIONAL",
      createdAt: "2026-01-01T00:00:00Z",
    } as any,
    businessSnapshot: null,
    userProfile: null,
    employee: null,
    pendingBusiness: null,
    invitation: null,
    identityStatus: "ACTIVE",
    onboardingStatus: "COMPLETED",
    orchestratorState: "READY",
    lastResolvedAt: "2026-03-01T00:00:00Z",
    subscription: null,
    featureFlags: null,
    ...overrides,
  };
}

describe("FINOPS-RBAC-OWNER-GENERAL-LEDGER-ACCESS: OWNER General Ledger Authorization", () => {
  beforeEach(() => {
    PermissionService.reset();
  });

  // ---------------------------------------------------------------------------
  // TEST 1: OWNER can access General Ledger module + ADV-17B-02 + hydration
  // ---------------------------------------------------------------------------
  describe("Test 1: OWNER General Ledger Module Access & Hydration", () => {
    it("allows authenticated OWNER on eligible plans (TRIAL / PROFESSIONAL / ENTERPRISE) with accounting enabled to access ledger", () => {
      for (const plan of ["TRIAL", "PROFESSIONAL", "BUSINESS", "ENTERPRISE"] as const) {
        PermissionService.init("OWNER", [], FULL_FEATURES, plan, "ACTIVE", "biz_tenant_A");

        expect(PermissionService.hasModule("ledger")).toBe(true);
        expect(PermissionService.hasModule("accounting")).toBe(true);
        expect(PermissionService.hasRoleModuleAccess("OWNER", "ledger")).toBe(true);
        expect(PermissionService.hasRoleModuleAccess("OWNER", "accounting")).toBe(true);

        expect(PermissionService.can("accounting.view")).toBe(true);
        expect(PermissionService.can("accounting.read")).toBe(true);
        expect(PermissionService.can("view_accounting")).toBe(true);
        expect(PermissionService.can("ledger.view")).toBe(true);
        expect(PermissionService.can("ledger.read")).toBe(true);
        expect(PermissionService.can("view_ledger")).toBe(true);
        expect(PermissionService.can("chart_of_accounts.view")).toBe(true);
        expect(PermissionService.can("accounting.coa.view")).toBe(true);
      }
    });

    it("prevents stale roleModuleMatrix from locking OWNER out of enabled General Ledger module", () => {
      const staleMatrix = {
        OWNER: {
          ledger: false,
          accounting: false,
        },
      };

      PermissionService.init(
        "OWNER",
        [],
        FULL_FEATURES,
        "PROFESSIONAL",
        "ACTIVE",
        "biz_tenant_A",
        staleMatrix
      );

      expect(PermissionService.hasRoleModuleAccess("OWNER", "ledger")).toBe(true);
      expect(PermissionService.hasRoleModuleAccess("OWNER", "accounting")).toBe(true);
      expect(PermissionService.can("accounting.view")).toBe(true);
      expect(PermissionService.can("ledger.view")).toBe(true);
    });

    it("retains read-only General Ledger access for OWNER even when subscription is EXPIRED, while blocking writes", () => {
      PermissionService.init(
        "OWNER",
        ["write_ledger", "journal.post"],
        FULL_FEATURES,
        "PROFESSIONAL",
        "EXPIRED",
        "biz_tenant_A"
      );

      expect(PermissionService.can("accounting.view")).toBe(true);
      expect(PermissionService.can("ledger.view")).toBe(true);
      expect(PermissionService.can("view_ledger")).toBe(true);
      expect(PermissionService.can("chart_of_accounts.view")).toBe(true);

      // Write operations stay denied when EXPIRED
      expect(PermissionService.can("ledger.write")).toBe(false);
      expect(PermissionService.can("journal.post")).toBe(false);
    });

    it("preserves ADV-17B-02: denies OWNER General Ledger on STARTER tier or when accounting feature flag is false", () => {
      PermissionService.init("OWNER", ["view_ledger", "accounting.view"], FULL_FEATURES, "STARTER", "ACTIVE", "biz_tenant_A");
      expect(PermissionService.hasModule("ledger")).toBe(false);
      expect(PermissionService.hasModule("accounting")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("OWNER", "ledger")).toBe(false);
      expect(PermissionService.can("accounting.view")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
      expect(PermissionService.can("chart_of_accounts.view")).toBe(false);

      PermissionService.init(
        "OWNER",
        ["view_ledger", "accounting.view"],
        { ...FULL_FEATURES, accounting: false },
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_A"
      );
      expect(PermissionService.hasModule("ledger")).toBe(false);
      expect(PermissionService.hasModule("accounting")).toBe(false);
      expect(PermissionService.hasRoleModuleAccess("OWNER", "ledger")).toBe(false);
      expect(PermissionService.can("accounting.view")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
    });

    it("resolvePermissionBootstrapInput resolves subscription and feature flags without falsely degrading to STARTER when businessSnapshot is null", () => {
      // Missing businessSnapshot, explicit subscription on snapshot
      const snapWithSub = makeSnapshot({
        businessSnapshot: null,
        subscription: { plan: "PROFESSIONAL", status: "ACTIVE" },
        featureFlags: { accounting: true, bi: true },
      });
      const inputFromSub = resolvePermissionBootstrapInput(snapWithSub);
      expect(inputFromSub?.subscriptionPlan).toBe("PROFESSIONAL");
      expect(inputFromSub?.subscriptionStatus).toBe("ACTIVE");
      expect(inputFromSub?.featureFlags?.accounting).toBe(true);

      // Missing businessSnapshot AND missing business.plan falls back to TRIAL (not STARTER)
      const snapNoPlan = makeSnapshot({
        businessSnapshot: null,
        business: { id: "biz_tenant_A", name: "No Plan Biz" } as any,
        subscription: null,
      });
      const inputFallback = resolvePermissionBootstrapInput(snapNoPlan);
      expect(inputFallback?.subscriptionPlan).toBe("TRIAL");

      // Explicit STARTER on subscription or business is strictly preserved for ADV-17B-02
      const snapStarter = makeSnapshot({
        businessSnapshot: null,
        subscription: { plan: "STARTER", status: "ACTIVE" },
      });
      const inputStarter = resolvePermissionBootstrapInput(snapStarter);
      expect(inputStarter?.subscriptionPlan).toBe("STARTER");
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: OWNER sees General Ledger navigation entry
  // ---------------------------------------------------------------------------
  describe("Test 2: OWNER General Ledger Navigation Visibility", () => {
    it("includes ledger in NavigationBuilder.build, getAuthorizedTabsForRole, and rendered Sidebar for OWNER", () => {
      PermissionService.init("OWNER", [], FULL_FEATURES, "PROFESSIONAL", "ACTIVE", "biz_tenant_A");

      const navItems = NavigationBuilder.build("OWNER", "fr", {});
      expect(navItems.some((item) => item.id === "ledger")).toBe(true);

      const authorizedTabs = getAuthorizedTabsForRole("OWNER");
      expect(authorizedTabs).toContain("ledger");

      const sidebarHtml = renderToStaticMarkup(
        <Sidebar
          activeTab="ledger"
          onSelectTab={() => {}}
          currentRole="OWNER"
          isOpen={true}
          onCloseMobile={() => {}}
        />
      );
      expect(sidebarHtml).toContain("Grand Livre Comptable");
    });

    it("omits ledger from NavigationBuilder.build when STARTER or accounting feature is disabled", () => {
      PermissionService.init("OWNER", [], FULL_FEATURES, "STARTER", "ACTIVE", "biz_tenant_A");
      expect(NavigationBuilder.build("OWNER", "fr", {}).some((item) => item.id === "ledger")).toBe(false);

      PermissionService.init("OWNER", [], { ...FULL_FEATURES, accounting: false }, "ENTERPRISE", "ACTIVE", "biz_tenant_A");
      expect(NavigationBuilder.build("OWNER", "fr", {}).some((item) => item.id === "ledger")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Direct route navigation & refresh preservation
  // ---------------------------------------------------------------------------
  describe("Test 3: Direct Route Navigation & Refresh Preservation", () => {
    it("maps General Ledger tab aliases deterministically for routes and query params", () => {
      expect(normalizeTab("ledger")).toBe("ledger");
      expect(normalizeTab("accounting")).toBe("ledger");
      expect(normalizeTab("general-ledger")).toBe("ledger");
      expect(normalizeTab("grand-livre")).toBe("ledger");
      expect(TAB_ALIASES["accounting"]).toBe("ledger");
      expect(TAB_ALIASES["general-ledger"]).toBe("ledger");
      expect(TAB_ALIASES["grand-livre"]).toBe("ledger");
      expect(resolveDefaultTabForRole("OWNER")).toBe("bi");
    });

    it("registers /ledger, /accounting, and /general-ledger in AppRouter, AuthNavigationEngine, and useNavigation URL sync", () => {
      const appRouter = fs.readFileSync(path.resolve(process.cwd(), "src/routes/AppRouter.tsx"), "utf8");
      const authNav = fs.readFileSync(path.resolve(process.cwd(), "src/navigation/AuthNavigationEngine.tsx"), "utf8");
      const useNav = fs.readFileSync(path.resolve(process.cwd(), "src/components/dashboard/hooks/useNavigation.ts"), "utf8");
      const dashboardShell = fs.readFileSync(path.resolve(process.cwd(), "src/components/DashboardShell.tsx"), "utf8");

      expect(appRouter).toContain('path="/ledger"');
      expect(appRouter).toContain('path="/accounting"');
      expect(appRouter).toContain('path="/general-ledger"');
      expect(appRouter).toContain('<BusinessRoute><DashboardShell initialTab="ledger" /></BusinessRoute>');

      expect(authNav).toContain('"/ledger"');
      expect(authNav).toContain('"/accounting"');
      expect(authNav).toContain('"/general-ledger"');

      // Refresh preservation on /dashboard?tab=ledger
      expect(useNav).toContain('params.get("tab")');
      expect(useNav).toContain("window.history.replaceState");
      expect(useNav).toContain('url.searchParams.set("tab", normalized)');

      // DashboardShell renders ConnectedFinanceLedger cleanly and blocks content when permissionGateDenied
      expect(dashboardShell).toContain("Module Grand Livre Verrouillé");
      expect(dashboardShell).toContain("<ConnectedFinanceLedger");
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Cross-tenant OWNER isolation
  // ---------------------------------------------------------------------------
  describe("Test 4: Cross-Tenant Isolation for OWNER", () => {
    it("strictly denies OWNER of Tenant A from accessing Tenant B ledger records or unscoped resources", () => {
      const ownerA: ActorIdentity = {
        id: "usr_owner_A",
        role: "OWNER",
        businessId: "biz_tenant_A",
      };

      expect(AccessResolver.canAccessResource(ownerA, { businessId: "biz_tenant_A" })).toBe(true);
      expect(AccessResolver.canAccessResource(ownerA, { businessId: "biz_tenant_B" })).toBe(false);
      expect(AccessResolver.canAccessResource(ownerA, { business_id: "biz_tenant_B" })).toBe(false);
      expect(AccessResolver.canAccessResource(ownerA, {})).toBe(false);
      expect(AccessResolver.canAccessResource(ownerA, { businessId: "" })).toBe(false);

      // PermissionService fails closed if tenant businessId is missing
      PermissionService.init("OWNER", [], FULL_FEATURES, "ENTERPRISE", "ACTIVE", null);
      expect(PermissionService.can("accounting.view")).toBe(false);
      expect(PermissionService.can("ledger.view")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Unauthorized roles remain denied
  // ---------------------------------------------------------------------------
  describe("Test 5: Unauthorized Roles Remain Denied", () => {
    const unauthorizedRoles = [
      "JUNIOR_TELLER",
      "SENIOR_TELLER",
      "HEAD_TELLER",
      "MASTER_HEAD_TELLER",
      "TELLER",
      "SUPERVISOR",
      "EMPLOYEE",
      "GUEST",
      "UNASSIGNED",
    ];

    it("denies General Ledger module and operations for tellers, supervisors, employees, guests, and unassigned roles even with injected claims", () => {
      for (const role of unauthorizedRoles) {
        PermissionService.init(
          role,
          [
            "view_ledger",
            "write_ledger",
            "accounting.view",
            "ledger.view",
            "journal.post",
            "journal.reverse",
            "journal.delete",
            "*",
          ],
          FULL_FEATURES,
          "ENTERPRISE",
          "ACTIVE",
          "biz_tenant_A"
        );

        expect(PermissionService.hasRoleModuleAccess(role, "ledger"), `${role} ledger access`).toBe(false);
        expect(PermissionService.hasRoleModuleAccess(role, "accounting"), `${role} accounting access`).toBe(false);
        expect(PermissionService.can("accounting.view"), `${role} accounting.view`).toBe(false);
        expect(PermissionService.can("ledger.view"), `${role} ledger.view`).toBe(false);
        expect(PermissionService.can("chart_of_accounts.view"), `${role} chart_of_accounts.view`).toBe(false);
        expect(PermissionService.can("journal.post"), `${role} journal.post`).toBe(false);
        expect(PermissionService.can("journal.reverse"), `${role} journal.reverse`).toBe(false);
        expect(PermissionService.can("journal.delete"), `${role} journal.delete`).toBe(false);
        expect(PermissionService.can("accounting.period.close"), `${role} accounting.period.close`).toBe(false);

        const nav = NavigationBuilder.build(role, "fr", {});
        expect(nav.some((item) => item.id === "ledger"), `${role} NavigationBuilder`).toBe(false);
        expect(getAuthorizedTabsForRole(role), `${role} getAuthorizedTabsForRole`).not.toContain("ledger");

        const sidebarHtml = renderToStaticMarkup(
          <Sidebar
            activeTab="dashboard"
            onSelectTab={() => {}}
            currentRole={role as any}
            isOpen={true}
            onCloseMobile={() => {}}
          />
        );
        expect(sidebarHtml, `${role} Sidebar`).not.toContain("Grand Livre Comptable");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Separation of module access vs restricted accounting operations
  // ---------------------------------------------------------------------------
  describe("Test 6: Separation of General Ledger Module Access vs Restricted Accounting Operations", () => {
    it("does NOT grant OWNER posting, drafting, reversing, deleting, or period-closing capabilities without explicit assignment", () => {
      // Scenario A: OWNER with zero granular accounting permissions
      PermissionService.init("OWNER", [], FULL_FEATURES, "ENTERPRISE", "ACTIVE", "biz_tenant_A");

      // Read/view & report export allowed
      expect(PermissionService.hasModule("ledger")).toBe(true);
      expect(PermissionService.can("accounting.view")).toBe(true);
      expect(PermissionService.can("ledger.view")).toBe(true);
      expect(PermissionService.can("view_ledger")).toBe(true);
      expect(PermissionService.can("chart_of_accounts.view")).toBe(true);
      expect(PermissionService.can("accounting.coa.view")).toBe(true);
      expect(PermissionService.can("export_reports")).toBe(true);
      expect(PermissionService.can("reports.export")).toBe(true);

      // Restricted operations MUST remain denied
      expect(PermissionService.can("journal.create_draft")).toBe(false);
      expect(PermissionService.can("journal.edit_draft")).toBe(false);
      expect(PermissionService.can("journal.post")).toBe(false);
      expect(PermissionService.can("ledger.write")).toBe(false);
      expect(PermissionService.can("write_ledger")).toBe(false);
      expect(PermissionService.can("journal.reverse")).toBe(false);
      expect(PermissionService.can("ledger.reverse")).toBe(false);
      expect(PermissionService.can("reverse_ledger")).toBe(false);
      expect(PermissionService.can("journal.delete")).toBe(false);
      expect(PermissionService.can("ledger.delete")).toBe(false);
      expect(PermissionService.can("accounting.period.close")).toBe(false);
      expect(PermissionService.can("period.close")).toBe(false);
    });

    it("keeps reversal, deletion, and period-closing isolated even when OWNER has write_ledger or wildcard claims", () => {
      // With write_ledger only -> drafting & posting allowed, but reverse/delete/period.close still denied
      PermissionService.init("OWNER", ["write_ledger"], FULL_FEATURES, "ENTERPRISE", "ACTIVE", "biz_tenant_A");
      expect(PermissionService.can("journal.create_draft")).toBe(true);
      expect(PermissionService.can("journal.edit_draft")).toBe(true);
      expect(PermissionService.can("journal.post")).toBe(true);
      expect(PermissionService.can("ledger.write")).toBe(true);
      expect(PermissionService.can("journal.reverse")).toBe(false);
      expect(PermissionService.can("journal.delete")).toBe(false);
      expect(PermissionService.can("accounting.period.close")).toBe(false);

      // Even with wildcard "*" and "all" and "journal.delete", non-SUPER_ADMIN cannot delete ledger entries or bypass restricted ops
      PermissionService.init(
        "OWNER",
        ["*", "all", "journal.delete", "ledger.delete"],
        FULL_FEATURES,
        "ENTERPRISE",
        "ACTIVE",
        "biz_tenant_A"
      );
      expect(PermissionService.can("journal.delete")).toBe(false);
      expect(PermissionService.can("ledger.delete")).toBe(false);
      expect(PermissionService.can("journal.post")).toBe(false);
      expect(PermissionService.can("journal.reverse")).toBe(false);
      expect(PermissionService.can("accounting.period.close")).toBe(false);
    });

    it("enforces fail-closed UI guards in LedgerHeader, DoubleEntryTable, and FinanceLedger", () => {
      PermissionService.init("OWNER", ["view_ledger"], FULL_FEATURES, "ENTERPRISE", "ACTIVE", "biz_tenant_A");

      const sampleTx: LedgerTransaction = {
        id: "tx_audit_001",
        business_id: "biz_tenant_A",
        businessId: "biz_tenant_A",
        date: "2026-03-01T10:00:00Z",
        type: "EXPENSE",
        description: "Fournitures Bureau",
        source: "MANUAL",
        amount: 1500,
        amount_cents: 150000,
        debit_account: "6010 - Achats",
        credit_account: "1010 - Cash",
        isImmutable: true,
        signature: "sig_001",
      } as any;

      const tableHtml = renderToStaticMarkup(
        <DoubleEntryTable
          transactions={[sampleTx]}
          selectedIds={[sampleTx.id]}
          currentRole="OWNER"
          onViewDetails={vi.fn()}
          onBatchReverse={vi.fn()}
          onBatchDelete={vi.fn()}
        />
      );
      expect(tableHtml).toContain("Détails");
      expect(tableHtml).not.toContain("btn-trigger-bulk-delete");
      expect(tableHtml).not.toContain("btn-trigger-batch-reversal");
      expect(tableHtml).not.toContain("Reversal Entry");

      const headerHtml = renderToStaticMarkup(
        <LedgerHeader
          healthScore={98}
          cashflow={500000}
          onNewTransaction={vi.fn()}
          onImportCsv={vi.fn()}
          onGenerateReport={vi.fn()}
          onCompensation={vi.fn()}
          onAiCfo={vi.fn()}
          onOpenDataIntegrity={vi.fn()}
          canWriteLedger={false}
          canImportCsv={false}
          canUseAiCfo={false}
          canExportReports={true}
        />
      );
      expect(headerHtml).toContain("Export Excel");
      expect(headerHtml).not.toContain("Nouvelle Transaction");
      expect(headerHtml).not.toContain("Import CSV");
      expect(headerHtml).not.toContain("Audit d&#x27;Intégrité");
      expect(headerHtml).not.toContain("Compensation");
      expect(headerHtml).not.toContain("AI CFO Analysis");

      // Verify static absence of unsafe OWNER delete/payroll-reversal bypasses in FinanceLedger & DoubleEntryTable
      const financeLedgerSrc = fs.readFileSync(path.resolve(process.cwd(), "src/pages/FinanceLedger.tsx"), "utf8");
      const doubleEntrySrc = fs.readFileSync(path.resolve(process.cwd(), "src/components/ledger/DoubleEntryTable.tsx"), "utf8");
      expect(financeLedgerSrc).not.toContain("canManagePayroll");
      expect(financeLedgerSrc).not.toMatch(/canDeleteLedger\s*=\s*\[\s*['"]OWNER['"]/);
      expect(doubleEntrySrc).not.toMatch(/isDeleteAuthorized\s*=\s*\[\s*['"]OWNER['"]/);
      expect(doubleEntrySrc).not.toMatch(/isReversalAuthorized\s*=.*['"]OWNER['"]/);
    });
  });
});
