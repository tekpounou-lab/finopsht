import { describe, it, expect, vi } from "vitest";
import { 
  BusinessIntegritySchema, 
  BranchIntegritySchema, 
  DepartmentIntegritySchema, 
  EmployeeIntegritySchema,
  UserProfileIntegritySchema,
  validateOrThrow 
} from "../../validations/integritySchemas";
import { EnterpriseIdentityOrchestrator } from "../../modules/identity/EnterpriseIdentityOrchestrator";
import { resolveTargetRoute } from "../../navigation/useTargetRoute";

describe("Onboarding & Business Setup Integrity Test Suite", () => {
  describe("Zod Schema Validation for Onboarding Payloads", () => {
    it("should validate a compliant Business payload", () => {
      const validBusiness = {
        id: "b_enterprise_1",
        name: "Acme Corp S.A.",
        nif: "123-456-789-0",
        domain: "SME",
        ownerId: "u_founder_1",
        currency: "HTG",
        status: "ACTIVE"
      };

      expect(() => validateOrThrow(BusinessIntegritySchema, validBusiness, "Business")).not.toThrow();
    });

    it("should validate a compliant Branch payload", () => {
      const validBranch = {
        id: "br_main_1",
        businessId: "b_enterprise_1",
        name: "Siège Social",
        location: "Port-au-Prince",
        status: "ACTIVE",
        isActive: true
      };

      expect(() => validateOrThrow(BranchIntegritySchema, validBranch, "Branch")).not.toThrow();
    });

    it("should validate a compliant Department payload", () => {
      const validDept = {
        id: "d_operations_1",
        businessId: "b_enterprise_1",
        branchId: "br_main_1",
        name: "Opérations & Logistique",
        status: "ACTIVE",
        isActive: true
      };

      expect(() => validateOrThrow(DepartmentIntegritySchema, validDept, "Department")).not.toThrow();
    });

    it("should validate a compliant Employee payload (Founder Owner)", () => {
      const validEmployee = {
        id: "e_founder_1",
        businessId: "b_enterprise_1",
        branchId: "br_main_1",
        departmentId: "d_operations_1",
        name: "Jean Dupont",
        displayName: "Jean Dupont",
        email: "jean.dupont@acme.com",
        role: "OWNER",
        position: "Directeur Général",
        baseSalary: 150000,
        paymentModel: "FIXED",
        contractType: "cdi",
        payRegime: "fixe",
        status: "ACTIVE",
        isActive: true,
        onboardingComplete: true,
        uid: "u_founder_1"
      };

      expect(() => validateOrThrow(EmployeeIntegritySchema, validEmployee, "Employee")).not.toThrow();
    });

    it("should validate a compliant User Profile payload with onboarding_completed", () => {
      const validUserProfile = {
        id: "u_founder_1",
        uid: "u_founder_1",
        businessId: "b_enterprise_1",
        branchId: "br_main_1",
        departmentId: "d_operations_1",
        employeeId: "e_founder_1",
        name: "Jean Dupont",
        displayName: "Jean Dupont",
        role: "OWNER",
        accountStatus: "ACTIVE" as const,
        businessStatus: "ACTIVE" as const,
        onboardingComplete: true
      };

      expect(() => validateOrThrow(UserProfileIntegritySchema, validUserProfile, "UserProfile")).not.toThrow();
    });
  });

  describe("EnterpriseIdentityOrchestrator Cache Invalidation", () => {
    it("should invalidate user cache without throwing", () => {
      const testUid = "u_test_invalidation_99";
      expect(() => EnterpriseIdentityOrchestrator.invalidateCache(testUid)).not.toThrow();
    });
  });

  describe("Auth Navigation & Route Resolution", () => {
    it("should route OWNER_ACTIVE to /dashboard", () => {
      const result = resolveTargetRoute({
        flowState: "OWNER_ACTIVE",
        identity: {
          uid: "u_owner_1",
          email: "owner@finops.com",
          role: "OWNER",
          business_id: "b_biz_1",
          business_status: "ACTIVE",
          account_status: "ACTIVE",
          onboarding_completed: true,
          permissions: ["*"],
          tier: "ENTERPRISE",
          resolved_at: new Date().toISOString()
        } as any,
        role: "OWNER",
        user: { uid: "u_owner_1", email: "owner@finops.com" }
      });

      expect(result.targetPath).toBe("/dashboard");
      expect(result.requiredRole).toBe("OWNER");
    });

    it("should route SUPER_ADMIN to /platform", () => {
      const result = resolveTargetRoute({
        flowState: "SUPER_ADMIN_ACTIVE",
        identity: {
          uid: "u_super_1",
          email: "tekpounou@gmail.com",
          role: "SUPER_ADMIN",
          permissions: ["*"],
          tier: "ENTERPRISE",
          resolved_at: new Date().toISOString()
        } as any,
        role: "SUPER_ADMIN" as any,
        user: { uid: "u_super_1", email: "tekpounou@gmail.com" }
      });

      expect(result.targetPath).toBe("/platform");
      expect(result.requiredRole).toBe("SUPER_ADMIN");
    });

    it("should route BUSINESS_PENDING to /waiting-room", () => {
      const result = resolveTargetRoute({
        flowState: "BUSINESS_PENDING",
        identity: {
          uid: "u_pending_1",
          email: "newbiz@finops.com",
          role: "OWNER",
          business_id: "b_pending_1",
          business_status: "PENDING",
          account_status: "ACTIVE",
          onboarding_completed: true,
          permissions: ["*"],
          tier: "STARTER",
          resolved_at: new Date().toISOString()
        } as any,
        role: "OWNER",
        user: { uid: "u_pending_1", email: "newbiz@finops.com" }
      });

      expect(result.targetPath).toBe("/waiting-room");
    });
  });
});
