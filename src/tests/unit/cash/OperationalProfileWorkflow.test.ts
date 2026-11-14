import { describe, it, expect } from "vitest";
import {
  TransactionMappingEngine,
  DEFAULT_SYSTEM_TRANSACTION_TYPES
} from "../../../services/cash/transactionMappingEngine";
import { OperationalProfile } from "../../../types/transactionTypes";
import {
  normalizeOperationalProfile,
  validateRoleOperationalProfileCompatibility
} from "../../../domains/rbac/operationalProfilePolicy";

describe("RH-PROFILE-01: Canonical Step 4 Operational Profile Workflow & Strict EMPLOYEE/TELLER Separation", () => {
  describe("1. Profile Resolution from Explicit Profile and Role (fail-closed)", () => {
    it("returns null for EXECUTIVE and OVERSIGHT roles unless an explicit (denied) profile is inspected", () => {
      expect(TransactionMappingEngine.resolveOperationalProfile("OWNER")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("ADMIN")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("SUPER_ADMIN")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("MANAGER")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("ACCOUNTANT")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("AUDITOR")).toBeNull();
    });

    it("resolves dedicated TELLER roles to canonical 'teller' profile and rejects non-teller profiles on tellers", () => {
      expect(TransactionMappingEngine.resolveOperationalProfile("TELLER")).toBe("teller");
      expect(TransactionMappingEngine.resolveOperationalProfile("JUNIOR_TELLER")).toBe("teller");
      expect(TransactionMappingEngine.resolveOperationalProfile("SENIOR_TELLER")).toBe("teller");
      expect(TransactionMappingEngine.resolveOperationalProfile("HEAD_TELLER")).toBe("teller");
      expect(TransactionMappingEngine.resolveOperationalProfile("MASTER_HEAD_TELLER")).toBe("teller");

      // Explicit non-teller profile assigned to a TELLER role MUST fail closed (null)
      expect(TransactionMappingEngine.resolveOperationalProfile("JUNIOR_TELLER", undefined, "vendeur")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("HEAD_TELLER", undefined, "polyvalent")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("SENIOR_TELLER", undefined, "barber")).toBeNull();
    });

    it("resolves EMPLOYEE only when explicit canonical vendeur/polyvalent (or legacy barber alias) is provided", () => {
      expect(TransactionMappingEngine.resolveOperationalProfile("EMPLOYEE", undefined, "vendeur")).toBe("vendeur");
      expect(TransactionMappingEngine.resolveOperationalProfile("EMPLOYEE", undefined, "polyvalent")).toBe("polyvalent");
      // Legacy barber read/migration alias resolves strictly to vendeur for EMPLOYEE
      expect(TransactionMappingEngine.resolveOperationalProfile("EMPLOYEE", undefined, "barber")).toBe("vendeur");
      // EMPLOYEE with teller profile or missing profile MUST fail closed (null)
      expect(TransactionMappingEngine.resolveOperationalProfile("EMPLOYEE", undefined, "teller")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("EMPLOYEE")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("EMPLOYEE", "Caissier Guichet #2")).toBeNull();
    });

    it("fails closed (null) on missing, empty, retired pseudo-profiles, and unknown roles", () => {
      expect(TransactionMappingEngine.resolveOperationalProfile(undefined, undefined)).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("", "")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("UNKNOWN_ROLE")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("HEAD_TELLER", undefined, "head_teller")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("MANAGER", undefined, "manager")).toBeNull();
      expect(TransactionMappingEngine.resolveOperationalProfile("OWNER", undefined, "owner")).toBeNull();
    });
  });

  describe("2. Catalog Filtering by Canonical Operational Profile & Role (filterTypesByProfile)", () => {
    const allTypes = DEFAULT_SYSTEM_TRANSACTION_TYPES;

    it("restricts EMPLOYEE + vendeur strictly to Sales only (no Services, no Cash)", () => {
      const vendeurTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, "vendeur", "EMPLOYEE");
      expect(vendeurTypes.length).toBeGreaterThan(0);

      vendeurTypes.forEach((t) => {
        expect(t.category).toBe("Sales");
      });

      expect(vendeurTypes.some((t) => t.code === "3001")).toBe(true); // Vente Marchandises
      expect(vendeurTypes.some((t) => t.code === "3101")).toBe(false); // Prestation Service DENIED for vendeur
      expect(vendeurTypes.some((t) => t.code === "1001")).toBe(false); // Dépôt Cash
      expect(vendeurTypes.some((t) => t.code === "2001")).toBe(false); // Retrait Cash
      expect(vendeurTypes.some((t) => t.code === "6001")).toBe(false); // Dépense Exploitation
      expect(vendeurTypes.some((t) => t.code === "2910")).toBe(false); // Clearing
    });

    it("restricts EMPLOYEE + polyvalent strictly to Sales and Services — NEVER Cash, OpEx, or Clearing", () => {
      const polyTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, "polyvalent", "EMPLOYEE");
      expect(polyTypes.length).toBeGreaterThan(0);

      const allowedCategories = new Set(["Sales", "Services"]);
      polyTypes.forEach((t) => {
        expect(allowedCategories.has(t.category)).toBe(true);
      });

      expect(polyTypes.some((t) => t.code === "3001")).toBe(true); // Vente Marchandises
      expect(polyTypes.some((t) => t.code === "3101")).toBe(true); // Prestation Service
      // Polyvalent MUST NEVER unlock Cash / Teller operations
      expect(polyTypes.some((t) => t.code === "1001")).toBe(false);
      expect(polyTypes.some((t) => t.code === "2001")).toBe(false);
      expect(polyTypes.some((t) => t.code === "4001")).toBe(false);
      expect(polyTypes.some((t) => t.code === "5001")).toBe(false);
      expect(polyTypes.some((t) => t.code === "80001")).toBe(false);
      expect(polyTypes.some((t) => t.code === "6001")).toBe(false);
      expect(polyTypes.some((t) => t.code === "2910")).toBe(false);
    });

    it("restricts JUNIOR/SENIOR TELLER + teller to Money Transfer, Mobile Transfer, and Currency Exchange", () => {
      const tellerTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, "teller", "JUNIOR_TELLER");
      expect(tellerTypes.length).toBeGreaterThan(0);

      const allowedCategories = new Set(["Money Transfer", "Mobile Transfer", "Currency Exchange"]);
      tellerTypes.forEach((t) => {
        expect(allowedCategories.has(t.category)).toBe(true);
      });

      expect(tellerTypes.some((t) => t.code === "3001")).toBe(false);
      expect(tellerTypes.some((t) => t.code === "3101")).toBe(false);
      expect(tellerTypes.some((t) => t.code === "6001")).toBe(false);
    });

    it("allows HEAD_TELLER and MASTER_HEAD_TELLER with 'teller' profile Cash categories + OpEx + Internal Transfers (no Clearing/Sales/Services)", () => {
      const headTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, "teller", "HEAD_TELLER");
      const mhtTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, "teller", "MASTER_HEAD_TELLER");

      for (const list of [headTypes, mhtTypes]) {
        expect(list.some((t) => t.code === "1001")).toBe(true);
        expect(list.some((t) => t.code === "6001")).toBe(true);
        expect(list.some((t) => t.code === "1910")).toBe(true);
        expect(list.some((t) => t.code === "3001")).toBe(false);
        expect(list.some((t) => t.code === "3101")).toBe(false);
        expect(list.some((t) => t.code === "2910")).toBe(false);
      }
    });

    it("denies retired pseudo-profiles and grants EXECUTIVE roles via RBAC role without pseudo-profiles", () => {
      expect(TransactionMappingEngine.filterTypesByProfile(allTypes, "head_teller" as any)).toEqual([]);
      expect(TransactionMappingEngine.filterTypesByProfile(allTypes, "manager" as any)).toEqual([]);
      expect(TransactionMappingEngine.filterTypesByProfile(allTypes, "owner" as any)).toEqual([]);
      expect(TransactionMappingEngine.filterTypesByProfile(allTypes, undefined, "EMPLOYEE")).toEqual([]);

      const managerTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, undefined, "MANAGER");
      const ownerTypes = TransactionMappingEngine.filterTypesByProfile(allTypes, undefined, "OWNER");
      const activeCount = allTypes.filter((t) => t.isActive).length;
      expect(managerTypes.length).toBe(activeCount);
      expect(ownerTypes.length).toBe(activeCount);
      expect(managerTypes.some((t) => t.code === "2910")).toBe(true);
    });
  });

  describe("3. Operation Authorization Check (isOperationAllowedForProfile)", () => {
    const saleOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "3001")!;
    const serviceOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "3101")!;
    const depositOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "1001")!;
    const withdrawalOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "2001")!;
    const opexOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "6001")!;
    const clearingOp = DEFAULT_SYSTEM_TRANSACTION_TYPES.find((t) => t.code === "2910")!;

    it("rejects undefined operation and missing/unknown/retired profile", () => {
      const res = TransactionMappingEngine.isOperationAllowedForProfile(undefined, "vendeur", "EMPLOYEE");
      expect(res.isAllowed).toBe(false);
      expect(res.reason).toContain("Aucune opération");

      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, undefined, "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, "", "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, "head_teller", "HEAD_TELLER").isAllowed).toBe(false);
    });

    it("strictly forbids TELLER from executing Sales and Services", () => {
      const checkSale = TransactionMappingEngine.isOperationAllowedForProfile(saleOp, "teller", "JUNIOR_TELLER");
      expect(checkSale.isAllowed).toBe(false);
      expect(checkSale.reason).toContain("Caissier / Guichetier");

      const checkService = TransactionMappingEngine.isOperationAllowedForProfile(serviceOp, "teller", "SENIOR_TELLER");
      expect(checkService.isAllowed).toBe(false);
    });

    it("strictly forbids VENDEUR from executing Services, Cash Transfers, Withdrawals and OpEx", () => {
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, "vendeur", "EMPLOYEE").isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(serviceOp, "vendeur", "EMPLOYEE").isAllowed).toBe(false);

      const checkDeposit = TransactionMappingEngine.isOperationAllowedForProfile(depositOp, "vendeur", "EMPLOYEE");
      expect(checkDeposit.isAllowed).toBe(false);
      expect(checkDeposit.reason).toContain("Vendeur est strictement limité");

      expect(TransactionMappingEngine.isOperationAllowedForProfile(withdrawalOp, "vendeur", "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(opexOp, "vendeur", "EMPLOYEE").isAllowed).toBe(false);
    });

    it("allows POLYVALENT Sales and Services, but strictly forbids Cash, Operating Expenses, and Clearing", () => {
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, "polyvalent", "EMPLOYEE").isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(serviceOp, "polyvalent", "EMPLOYEE").isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(depositOp, "polyvalent", "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(withdrawalOp, "polyvalent", "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(opexOp, "polyvalent", "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(clearingOp, "polyvalent", "EMPLOYEE").isAllowed).toBe(false);
    });

    it("forbids EMPLOYEE + teller profile escalation across all operations", () => {
      expect(TransactionMappingEngine.isOperationAllowedForProfile(depositOp, "teller", "EMPLOYEE").isAllowed).toBe(false);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, "teller", "EMPLOYEE").isAllowed).toBe(false);
    });

    it("allows HEAD_TELLER + teller Operating Expenses but forbids Clearing", () => {
      expect(TransactionMappingEngine.isOperationAllowedForProfile(opexOp, "teller", "HEAD_TELLER").isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(clearingOp, "teller", "HEAD_TELLER").isAllowed).toBe(false);
    });

    it("allows OWNER and MANAGER full operational authority via RBAC role", () => {
      expect(TransactionMappingEngine.isOperationAllowedForProfile(saleOp, undefined, "OWNER").isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(clearingOp, undefined, "OWNER").isAllowed).toBe(true);
      expect(TransactionMappingEngine.isOperationAllowedForProfile(opexOp, undefined, "MANAGER").isAllowed).toBe(true);
    });
  });

  describe("4. Profile Switch Permissions & Canonical Policy Enforcement", () => {
    it("forbids tellers and employees from switching across incompatible profiles", () => {
      expect(TransactionMappingEngine.canSwitchProfile("JUNIOR_TELLER")).toBe(false);
      expect(TransactionMappingEngine.canSwitchProfile("SENIOR_TELLER")).toBe(false);
      expect(TransactionMappingEngine.canSwitchProfile("HEAD_TELLER")).toBe(false);
      expect(TransactionMappingEngine.canSwitchProfile("MASTER_HEAD_TELLER")).toBe(false);
      expect(TransactionMappingEngine.canSwitchProfile("EMPLOYEE")).toBe(false);

      expect(TransactionMappingEngine.isProfileSwitchAllowed("JUNIOR_TELLER", "polyvalent")).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed("JUNIOR_TELLER", "vendeur")).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed("JUNIOR_TELLER", "teller")).toBe(true);
      expect(TransactionMappingEngine.isProfileSwitchAllowed("HEAD_TELLER", "vendeur")).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed("HEAD_TELLER", "teller")).toBe(true);
    });

    it("allows EXECUTIVE RBAC roles to inspect only canonical operational profiles (vendeur, polyvalent, teller)", () => {
      expect(TransactionMappingEngine.canSwitchProfile("OWNER")).toBe(true);
      expect(TransactionMappingEngine.canSwitchProfile("MANAGER")).toBe(true);
      expect(TransactionMappingEngine.canSwitchProfile("SUPER_ADMIN")).toBe(true);

      const profiles: OperationalProfile[] = ["vendeur", "polyvalent", "teller"];
      profiles.forEach((p) => {
        expect(TransactionMappingEngine.isProfileSwitchAllowed("OWNER", p)).toBe(true);
        expect(TransactionMappingEngine.isProfileSwitchAllowed("MANAGER", p)).toBe(true);
        expect(TransactionMappingEngine.isProfileSwitchAllowed("SUPER_ADMIN", p)).toBe(true);
      });

      expect(TransactionMappingEngine.isProfileSwitchAllowed("OWNER", "head_teller" as any)).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed("OWNER", "manager" as any)).toBe(false);
      expect(TransactionMappingEngine.isProfileSwitchAllowed("OWNER", "owner" as any)).toBe(false);
    });

    it("enforces validateRoleOperationalProfileCompatibility invariants", () => {
      expect(validateRoleOperationalProfileCompatibility("EMPLOYEE", "vendeur").valid).toBe(true);
      expect(validateRoleOperationalProfileCompatibility("EMPLOYEE", "polyvalent").valid).toBe(true);
      expect(validateRoleOperationalProfileCompatibility("EMPLOYEE", "teller").valid).toBe(false);
      expect(validateRoleOperationalProfileCompatibility("JUNIOR_TELLER", "teller").valid).toBe(true);
      expect(validateRoleOperationalProfileCompatibility("JUNIOR_TELLER", "polyvalent").valid).toBe(false);
      expect(validateRoleOperationalProfileCompatibility("MASTER_HEAD_TELLER", "teller").valid).toBe(true);
      expect(normalizeOperationalProfile("barber", { role: "EMPLOYEE", allowLegacyBarberAlias: true })).toBe("vendeur");
      expect(normalizeOperationalProfile("barber", { role: "JUNIOR_TELLER", allowLegacyBarberAlias: true })).toBeNull();
    });
  });

  describe("5. Double-Entry Accounting and Cash Flow Verification", () => {
    it("calculates Cash Inflow (+1) when cash account 1111 is debited", () => {
      const flow = TransactionMappingEngine.calculateFlowBehavior("1111", "4000");
      expect(flow.behavior).toBe(1);
      expect(flow.label).toContain("Entrée");
    });

    it("calculates Cash Outflow (-1) when cash account 1111 is credited", () => {
      const flow = TransactionMappingEngine.calculateFlowBehavior("6010", "1111");
      expect(flow.behavior).toBe(-1);
      expect(flow.label).toContain("Sortie");
    });

    it("calculates Neutral (0) when cash account is neither debited nor credited", () => {
      const flow = TransactionMappingEngine.calculateFlowBehavior("2910", "2910");
      expect(flow.behavior).toBe(0);
      expect(flow.label).toContain("Sans mouvement de caisse");
    });

    it("validates Sales and Services rule: Class 1 debit and Class 4/7 credit", () => {
      const validSale = TransactionMappingEngine.validateSalesAndServicesRule("Sales", "1111", "4000");
      expect(validSale.isValid).toBe(true);

      const invalidDebit = TransactionMappingEngine.validateSalesAndServicesRule("Sales", "6010", "4000");
      expect(invalidDebit.isValid).toBe(false);
      expect(invalidDebit.error).toContain("Classe 1");

      const invalidCredit = TransactionMappingEngine.validateSalesAndServicesRule("Sales", "1111", "1111");
      expect(invalidCredit.isValid).toBe(false);
    });
  });
});
