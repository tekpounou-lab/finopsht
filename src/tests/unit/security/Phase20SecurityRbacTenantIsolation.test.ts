import { describe, it, expect, beforeEach } from "vitest";
import { PermissionService } from "../../../services/PermissionService";
import { AccessResolver } from "../../../permissions/AccessResolver";
import { hasPermission } from "../../../permissions/role.permissions";
import { useCommandBus } from "../../../hooks/useCommandBus";
import { useDashboardUIState } from "../../../hooks/useDashboardUIState";
import { FeatureMatrix } from "../../../repositories";

const DEFAULT_FEATURES: FeatureMatrix = {
  attendance: true,
  payroll: true,
  accounting: true,
  pos: true,
  hr: true,
  crm: true,
  bi: true,
  aiCfo: true,
};

describe("PRIORITÉ 2.0 — Sécurité Globale, RBAC et Isolation Multi-Tenant", () => {
  beforeEach(() => {
    // Re-initialize PermissionService before each test
    PermissionService.init(
      "EMPLOYEE",
      ["view_own_data"],
      DEFAULT_FEATURES,
      "STARTER",
      "ACTIVE",
      "tenant_alpha"
    );
  });

  describe("1. Phase A/C — Non Auto-Promotion du Rôle & Séparation SuperAdmin (ADV-18B-01)", () => {
    it("interdit à un EMPLOYEE, MANAGER ou OWNER d'accéder aux fonctions réservées à la plateforme (superadmin_access)", () => {
      const rolesToTest = ["EMPLOYEE", "SUPERVISOR", "MANAGER", "OWNER", "UNASSIGNED", "MEMBER"];

      rolesToTest.forEach((role) => {
        PermissionService.init(
          role,
          ["*"],
          DEFAULT_FEATURES,
          "ENTERPRISE",
          "ACTIVE",
          "tenant_alpha"
        );

        expect(PermissionService.can("superadmin_access")).toBe(false);
        expect(PermissionService.can("delete_business")).toBe(false);
        expect(PermissionService.can("manage_system_config")).toBe(false);
        expect(PermissionService.can("force_unseal_payroll")).toBe(false);
      });
    });

    it("accorde les capacités de plateforme STRICTEMENT au rôle SUPER_ADMIN", () => {
      PermissionService.init(
        "SUPER_ADMIN",
        ["*"],
        DEFAULT_FEATURES,
        "ENTERPRISE",
        "ACTIVE",
        "GLOBAL"
      );

      expect(PermissionService.can("superadmin_access")).toBe(true);
      expect(PermissionService.can("delete_business")).toBe(true);
      expect(PermissionService.can("manage_system_config")).toBe(true);
    });

    it("interdit à un non-SuperAdmin de modifier ou muter le profil d'un SUPER_ADMIN", () => {
      const actorOwner = { id: "user_owner", role: "OWNER" as const, businessId: "tenant_alpha" };
      const actorManager = { id: "user_mgr", role: "MANAGER" as const, businessId: "tenant_alpha", branchId: "b1" };
      const targetSuperAdmin = { id: "user_super", role: "SUPER_ADMIN" as const, businessId: "tenant_alpha" };

      expect(AccessResolver.canMutateEmployee(actorOwner, targetSuperAdmin)).toBe(false);
      expect(AccessResolver.canMutateEmployee(actorManager, targetSuperAdmin)).toBe(false);
    });
  });

  describe("2. Phase A/C — Protection contre le Repli de Rôle vers OWNER (ADV-18B-02/03)", () => {
    it("ne donne aucun privilège par défaut si un rôle est UNASSIGNED, MEMBER ou falsy", () => {
      const unassignedRoles = ["UNASSIGNED", "MEMBER", "GUEST", "", "UNKNOWN"];

      unassignedRoles.forEach((role) => {
        expect(hasPermission(role, "canViewDashboard")).toBe(false);
        expect(hasPermission(role, "canManagePayroll")).toBe(false);
        expect(hasPermission(role, "canValidatePayroll")).toBe(false);
        expect(hasPermission(role, "canCreateBranch")).toBe(false);
      });
    });

    it("vérifie que useDashboardUIState initialise son rôle à UNASSIGNED et non à OWNER", () => {
      expect(useDashboardUIState.toString()).toContain('"UNASSIGNED"');
    });
  });

  describe("3. Phase B/C — Isolation Multi-Tenant Stricte (Fail-Closed)", () => {
    it("interdit l'accès à une ressource appartenant à un autre tenant_id (OWNER Tenant Alpha vs Tenant Beta)", () => {
      const actorAlpha = { id: "owner_alpha", role: "OWNER" as const, businessId: "tenant_alpha" };
      const resourceBeta = { businessId: "tenant_beta", employeeId: "emp_beta_1" };

      expect(AccessResolver.canAccessResource(actorAlpha, resourceBeta)).toBe(false);
    });

    it("interdit la mutation d'un employé entre deux tenants distincts", () => {
      const actorAlpha = { id: "mgr_alpha", role: "MANAGER" as const, businessId: "tenant_alpha", branchId: "b1" };
      const targetBeta = { id: "emp_beta", role: "EMPLOYEE" as const, businessId: "tenant_beta", branchId: "b1" };

      expect(AccessResolver.canMutateEmployee(actorAlpha, targetBeta)).toBe(false);
    });

    it("interdit la gestion de paie entre deux tenants distincts", () => {
      const actorAlpha = { id: "owner_alpha", role: "OWNER" as const, businessId: "tenant_alpha" };
      const targetBeta = { id: "emp_beta", role: "EMPLOYEE" as const, businessId: "tenant_beta" };

      expect(AccessResolver.canManagePayrollFor(actorAlpha, targetBeta)).toBe(false);
    });

    it("refuse l'accès de manière sûre lorsque le businessId est absent ou incohérent", () => {
      const actorIncomplete = { id: "usr_1", role: "OWNER" as const, businessId: "" };
      const resource = { businessId: "tenant_alpha" };

      expect(AccessResolver.canAccessResource(actorIncomplete, resource)).toBe(false);
    });
  });

  describe("4. Phase B/C — Invariants de Sécurité et Inconnues (Deny-By-Default)", () => {
    it("refuse par défaut toute capacité inconnue pour les rôles non-SUPER_ADMIN", () => {
      PermissionService.init(
        "OWNER",
        ["*"],
        DEFAULT_FEATURES,
        "ENTERPRISE",
        "ACTIVE",
        "tenant_alpha"
      );

      expect(PermissionService.can("unknown_custom_injection_capability")).toBe(false);
      expect(PermissionService.can("unauthorized_internal_backdoor")).toBe(false);
    });

    it("interdit STRICTEMENT la modification ou suppression des journaux médico-légaux (Forensic Logs) pour TOUS les rôles", () => {
      const roles = ["EMPLOYEE", "MANAGER", "OWNER", "SUPER_ADMIN"];

      roles.forEach((r) => {
        PermissionService.init(r, ["*"], DEFAULT_FEATURES, "ENTERPRISE", "ACTIVE", "tenant_alpha");
        expect(PermissionService.can("modify_forensic_log")).toBe(false);
        expect(PermissionService.can("delete_forensic_log")).toBe(false);
      });
    });

    it("bloque les actions d'écriture en cas d'abonnement EXPIRED ou BLOCKED", () => {
      PermissionService.init(
        "OWNER",
        ["*"],
        DEFAULT_FEATURES,
        "STARTER",
        "BLOCKED",
        "tenant_alpha"
      );

      expect(PermissionService.can("payroll.approve")).toBe(false);
      expect(PermissionService.can("employee.create")).toBe(false);
      // Mais autorise la lecture/consultation
      expect(PermissionService.can("view_dashboard")).toBe(true);
    });
  });

  describe("5. Phase B/C — Conservation des Autorisations Légitimes des Rôles", () => {
    it("accorde les autorisations légitimes au rôle OWNER dans son propre tenant", () => {
      const actorOwner = { id: "owner_1", role: "OWNER" as const, businessId: "tenant_alpha" };
      const resourceAlpha = { id: "emp_1", role: "EMPLOYEE" as const, businessId: "tenant_alpha" };

      expect(hasPermission("OWNER", "canManagePayroll")).toBe(true);
      expect(hasPermission("OWNER", "canValidatePayroll")).toBe(true);
      expect(AccessResolver.canAccessResource(actorOwner, resourceAlpha)).toBe(true);
      expect(AccessResolver.canManagePayrollFor(actorOwner, resourceAlpha)).toBe(true);
    });

    it("accorde les autorisations de gestion locale au rôle MANAGER dans sa succursale", () => {
      const actorManager = { id: "mgr_1", role: "MANAGER" as const, businessId: "tenant_alpha", branchId: "branch_nord" };
      const targetEmpSameBranch = { id: "emp_1", role: "EMPLOYEE" as const, businessId: "tenant_alpha", branchId: "branch_nord" };
      const targetEmpOtherBranch = { id: "emp_2", role: "EMPLOYEE" as const, businessId: "tenant_alpha", branchId: "branch_sud" };

      expect(hasPermission("MANAGER", "canManagePayroll")).toBe(true);
      expect(hasPermission("MANAGER", "canValidatePayroll")).toBe(false); // Doit passer par Owner/Admin
      expect(AccessResolver.canAccessResource(actorManager, targetEmpSameBranch)).toBe(true);
      expect(AccessResolver.canAccessResource(actorManager, targetEmpOtherBranch)).toBe(false);
    });
  });
});
