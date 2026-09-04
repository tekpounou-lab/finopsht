import { describe, it, expect, beforeEach, vi } from "vitest";
import { 
  SubscriptionPlanRepository, 
  SubscriptionRepository, 
  FeatureRepository 
} from "../../repositories";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { SubscriptionAuditService } from "../../services/billing/SubscriptionAuditService";
import { FinopsException } from "../../validations/integritySchemas";

describe("FINOPS ERP — Subscriptions, Plans & Modules Subsystem Integration Tests", () => {
  const TEST_BIZ_ID = `test_biz_${Date.now()}`;

  it("1. SubscriptionPlanRepository should return standard default plans", async () => {
    const plans = await SubscriptionPlanRepository.getAllPlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
    const starter = plans.find(p => p.id === "STARTER" || p.code === "STARTER");
    expect(starter).toBeDefined();
  });

  it("2. SubscriptionRepository should generate default TRIAL subscription if missing", async () => {
    const sub = await SubscriptionRepository.getWorkspaceSubscription(TEST_BIZ_ID);
    expect(sub).toBeDefined();
    expect(sub.business_id).toBe(TEST_BIZ_ID);
    expect(sub.allowedLimits).toBeDefined();
    expect(sub.allowedLimits.maxEmployees).toBeGreaterThan(0);
  });

  it("3. Syncing subscription with a plan should update limits and feature matrix", async () => {
    const updatedSub = await SubscriptionRepository.syncSubscriptionWithPlan(TEST_BIZ_ID, "PROFESSIONAL", 50);
    expect(updatedSub.plan).toBe("PROFESSIONAL");
    expect(updatedSub.allowedLimits.maxEmployees).toBe(50);

    const features = await FeatureRepository.getWorkspaceFeatures(TEST_BIZ_ID);
    expect(features).toBeDefined();
    expect(typeof features.attendance).toBe("boolean");
  });

  it("4. FeatureRepository.saveFeatures should save feature overrides and invalidate cache", async () => {
    await FeatureRepository.saveFeatures(TEST_BIZ_ID, {
      attendance: true,
      payroll: true,
      accounting: true,
      aiCfo: true
    });

    const features = await FeatureRepository.getWorkspaceFeatures(TEST_BIZ_ID);
    expect(features.aiCfo).toBe(true);
  });

  it("5. SubscriptionAuditService should execute scan and report tenant status", async () => {
    const report = await SubscriptionAuditService.auditAndHealAllTenants();
    expect(report).toBeDefined();
    expect(typeof report.totalTenants).toBe("number");
    expect(Array.isArray(report.tenantDetails)).toBe(true);
    expect(Array.isArray(report.globalAlerts)).toBe(true);
  });
});
