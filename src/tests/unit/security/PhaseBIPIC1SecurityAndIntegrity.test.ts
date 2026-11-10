import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_SYSTEM_ROLE_MODULE_MATRIX } from "../../../services/PermissionService";
import { ForensicLogRepository, getForensicHMACSecretKey, computeHMACSignature } from "../../../repositories/ForensicLogRepository";
import fs from "fs";
import path from "path";

describe("Phase BI/PIC-1 — RBAC, Audit Identity & Firestore Read Optimization", () => {
  describe("Phase B: RBAC & Permission Matrix Verification", () => {
    it("enforces canonical BI authorization strictly for OWNER, ADMIN, SUPER_ADMIN, MANAGER", () => {
      // Check DEFAULT_SYSTEM_ROLE_MODULE_MATRIX
      expect(DEFAULT_SYSTEM_ROLE_MODULE_MATRIX.SUPER_ADMIN.bi).toBe(true);
      expect(DEFAULT_SYSTEM_ROLE_MODULE_MATRIX.OWNER.bi).toBe(true);
      expect(DEFAULT_SYSTEM_ROLE_MODULE_MATRIX.ADMIN.bi).toBe(true);
      expect(DEFAULT_SYSTEM_ROLE_MODULE_MATRIX.MANAGER.bi).toBe(true);

      // Operational and audit roles must NOT have access to executive BI
      expect(DEFAULT_SYSTEM_ROLE_MODULE_MATRIX.SUPERVISOR.bi).toBe(false);
      expect(DEFAULT_SYSTEM_ROLE_MODULE_MATRIX.EMPLOYEE.bi).toBe(false);
    });

    it("verifies Sidebar.tsx nav configuration for dashboard matches canonical roles", () => {
      const sidebarPath = path.resolve(process.cwd(), "src/components/dashboard/components/Sidebar.tsx");
      const content = fs.readFileSync(sidebarPath, "utf-8");

      // Locate dashboard item in Sidebar
      const dashboardMatch = content.match(/id:\s*"dashboard"[^}]+roles:\s*\[([^\]]+)\]/);
      expect(dashboardMatch).not.toBeNull();

      const roles = dashboardMatch![1].replace(/["'\s]/g, "").split(",");
      expect(roles).toContain("OWNER");
      expect(roles).toContain("ADMIN");
      expect(roles).toContain("SUPER_ADMIN");
      expect(roles).toContain("MANAGER");

      // Verify unauthorized roles were removed
      expect(roles).not.toContain("HEAD_TELLER");
      expect(roles).not.toContain("ACCOUNTANT");
      expect(roles).not.toContain("AUDITOR");
    });

    it("verifies BusinessIntelligence.tsx defends against unauthorized roles", () => {
      const biPath = path.resolve(process.cwd(), "src/components/BusinessIntelligence.tsx");
      const content = fs.readFileSync(biPath, "utf-8");

      expect(content).toContain('currentRole === "OWNER" || currentRole === "MANAGER" || (currentRole as string) === "SUPER_ADMIN" || (currentRole as string) === "ADMIN"');
      expect(content).toContain('id="unauthorized-bi-pane"');
    });
  });

  describe("Phase C: Audit Identity & Forensic Log Integrity", () => {
    it("ensures no hardcoded dummy personas exist in BusinessIntelligence.tsx or useBIAiAdvisor.ts", () => {
      const biPath = path.resolve(process.cwd(), "src/components/BusinessIntelligence.tsx");
      const biContent = fs.readFileSync(biPath, "utf-8");
      expect(biContent).not.toContain("Manoel Lhérisson");
      expect(biContent).not.toContain("Fabienne Jean-Gilles");

      const advisorPath = path.resolve(process.cwd(), "src/components/bi/hooks/useBIAiAdvisor.ts");
      const advisorContent = fs.readFileSync(advisorPath, "utf-8");
      expect(advisorContent).not.toContain("Manoel Lhérisson");
      expect(advisorContent).not.toContain("Fabienne Jean-Gilles");
    });

    it("verifies handleSaveSnapshot requires authentication and signs logs with ForensicLogRepository", () => {
      const biPath = path.resolve(process.cwd(), "src/components/BusinessIntelligence.tsx");
      const biContent = fs.readFileSync(biPath, "utf-8");

      // Verifies strict authentication check
      expect(biContent).toContain("AUTHENTICATION_REQUIRED");
      expect(biContent).toContain("if (!authUser || !authUser.uid)");

      // Verifies ForensicLogRepository invocation
      expect(biContent).toContain("ForensicLogRepository.createAndSignLog");
      expect(biContent).toContain("actorId: authUser.uid");
      expect(biContent).toContain("userId: authUser.uid");
    });

    it("verifies cryptographic sealing via ForensicLogRepository.createAndSignLog", async () => {
      const log = await ForensicLogRepository.createAndSignLog({
        timestamp: "2026-10-29T12:00:00.000Z",
        actorId: "usr_auth_789",
        userId: "usr_auth_789",
        userName: "Jean Dupont",
        userRole: "MANAGER",
        business_id: "biz_tenant_1",
        action: "SAVE_ANALYTICS_SNAPSHOT",
        beforeState: "{}",
        afterState: '{"netProfit": 150000}',
        details: "Snapshot saved",
        severity: "AUDIT_GRADE",
      });

      expect(log.id).toBeDefined();
      expect(log.signature).toBeDefined();
      expect(log.signature.length).toBeGreaterThan(10);
      expect(log.keyVersion).toBe("v2_server");
      expect(log.actorId).toBe("usr_auth_789");
      expect(log.userName).toBe("Jean Dupont");

      // Verify the signature is authentic
      const expectedKey = getForensicHMACSecretKey("biz_tenant_1");
      const isValid = await ForensicLogRepository.verifyLogSignature(log, expectedKey);
      expect(isValid).toBe(true);

      // Verify tampering invalidates the signature
      const tamperedLog = { ...log, afterState: '{"netProfit": 999999}' };
      const isTamperedValid = await ForensicLogRepository.verifyLogSignature(tamperedLog, expectedKey);
      expect(isTamperedValid).toBe(false);
    });
  });

  describe("Phase D: Firestore Read Optimization & Tenant Isolation in PIC", () => {
    it("verifies usePerformanceData clears rawDataSet on businessId change to prevent cross-tenant leakage", () => {
      const picPath = path.resolve(process.cwd(), "src/hooks/usePerformanceData.ts");
      const picContent = fs.readFileSync(picPath, "utf-8");

      // Tenant isolation: dataset reset on businessId change
      expect(picContent).toContain("setRawDataSet({\n      employees: [],\n      transactions: [],\n      payrollRecords: [],\n      attendanceRecords: [],\n      branches: [],\n      departments: [],\n      snapshots: [],\n    });");
    });

    it("verifies usePerformanceData does NOT include UI filters in primary network fetch dependency array", () => {
      const picPath = path.resolve(process.cwd(), "src/hooks/usePerformanceData.ts");
      const picContent = fs.readFileSync(picPath, "utf-8");

      // The effect dependency array must only be [businessId, refreshIndex]
      expect(picContent).toContain("}, [businessId, refreshIndex]);");
    });

    it("verifies usePerformanceData merges live context updates without network reload", () => {
      const picPath = path.resolve(process.cwd(), "src/hooks/usePerformanceData.ts");
      const picContent = fs.readFileSync(picPath, "utf-8");

      // Separate context synchronization effect
      expect(picContent).toContain("// Synchronize live updates from BusinessContext into rawDataSet WITHOUT re-querying Firestore");
      expect(picContent).toContain("mergeById(prev.employees, ctxEmployees)");
    });
  });
});
