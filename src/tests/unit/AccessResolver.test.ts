import { describe, it, expect } from "vitest";
import { AccessResolver, ActorIdentity, ProtectedResource } from "../../permissions/AccessResolver";
import { Employee } from "../../types";

describe("AccessResolver Multi-Tenant & Security Tests", () => {
  const superAdminActor: ActorIdentity = {
    id: "usr_super_01",
    role: "SUPER_ADMIN"
  };

  const ownerTenantA: ActorIdentity = {
    id: "usr_owner_A",
    role: "OWNER",
    businessId: "biz_tenant_A"
  };

  const managerTenantA: ActorIdentity = {
    id: "usr_mgr_A",
    role: "MANAGER",
    businessId: "biz_tenant_A",
    branchId: "branch_nord_A"
  };

  const employeeTenantA: ActorIdentity = {
    id: "emp_john_A",
    role: "EMPLOYEE",
    businessId: "biz_tenant_A"
  };

  const sampleEmployeeA: Employee = {
    id: "emp_target_A",
    businessId: "biz_tenant_A",
    branchId: "branch_nord_A",
    departmentId: "dept_nord_A",
    name: "Target Tenant A",
    email: "target@tenantA.com",
    role: "EMPLOYEE",
    baseSalary: 45000,
    paymentModel: "FIXED",
    status: "ACTIVE",
    isActive: true,
    contractType: "cdi",
    payRegime: "fixe"
  };

  const sampleEmployeeB: Employee = {
    id: "emp_target_B",
    businessId: "biz_tenant_B",
    branchId: "branch_sud_B",
    departmentId: "dept_sud_B",
    name: "Target Tenant B",
    email: "target@tenantB.com",
    role: "EMPLOYEE",
    baseSalary: 55000,
    paymentModel: "FIXED",
    status: "ACTIVE",
    isActive: true,
    contractType: "cdi",
    payRegime: "fixe"
  };

  const superAdminTarget: Employee = {
    id: "emp_super_target",
    businessId: "biz_tenant_A",
    branchId: "branch_main_A",
    departmentId: "dept_exec_A",
    name: "SuperAdmin Target",
    email: "super@platform.com",
    role: "SUPER_ADMIN",
    baseSalary: 100000,
    paymentModel: "FIXED",
    status: "ACTIVE",
    isActive: true,
    contractType: "cdi",
    payRegime: "fixe"
  };

  describe("canAccessResource Tenancy Isolation", () => {
    it("allows SUPER_ADMIN universal cross-tenant access", () => {
      const resourceB: ProtectedResource = { businessId: "biz_tenant_B" };
      expect(AccessResolver.canAccessResource(superAdminActor, resourceB)).toBe(true);
    });

    it("allows OWNER access strictly within own businessId", () => {
      const resourceA: ProtectedResource = { businessId: "biz_tenant_A" };
      expect(AccessResolver.canAccessResource(ownerTenantA, resourceA)).toBe(true);
    });

    it("strictly denies OWNER access to resources of a different tenant (Cross-Tenant Breach)", () => {
      const resourceB: ProtectedResource = { businessId: "biz_tenant_B" };
      expect(AccessResolver.canAccessResource(ownerTenantA, resourceB)).toBe(false);
    });

    it("strictly denies access when actor has no businessId but resource is tenant-scoped", () => {
      const noBizActor: ActorIdentity = { id: "usr_nobiz", role: "OWNER" };
      const resourceA: ProtectedResource = { businessId: "biz_tenant_A" };
      expect(AccessResolver.canAccessResource(noBizActor, resourceA)).toBe(false);
    });
  });

  describe("canMutateEmployee Isolation & Hierarchy", () => {
    it("allows SUPER_ADMIN to mutate any employee across tenants", () => {
      expect(AccessResolver.canMutateEmployee(superAdminActor, sampleEmployeeA)).toBe(true);
      expect(AccessResolver.canMutateEmployee(superAdminActor, sampleEmployeeB)).toBe(true);
    });

    it("allows OWNER to mutate employees in own tenant", () => {
      expect(AccessResolver.canMutateEmployee(ownerTenantA, sampleEmployeeA)).toBe(true);
    });

    it("strictly prevents OWNER from mutating employees in another tenant", () => {
      expect(AccessResolver.canMutateEmployee(ownerTenantA, sampleEmployeeB)).toBe(false);
    });

    it("strictly prevents OWNER from mutating a SUPER_ADMIN", () => {
      expect(AccessResolver.canMutateEmployee(ownerTenantA, superAdminTarget)).toBe(false);
    });
  });

  describe("canManagePayrollFor Isolation", () => {
    it("allows SUPER_ADMIN to manage payroll platform-wide", () => {
      expect(AccessResolver.canManagePayrollFor(superAdminActor, sampleEmployeeA)).toBe(true);
      expect(AccessResolver.canManagePayrollFor(superAdminActor, sampleEmployeeB)).toBe(true);
    });

    it("allows OWNER to manage payroll within own tenant", () => {
      expect(AccessResolver.canManagePayrollFor(ownerTenantA, sampleEmployeeA)).toBe(true);
    });

    it("strictly denies OWNER from managing payroll for employee in another tenant", () => {
      expect(AccessResolver.canManagePayrollFor(ownerTenantA, sampleEmployeeB)).toBe(false);
    });
  });
});
