import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import express from "express";
import { authenticateToken, requireSuperAdmin, AuthenticatedRequest } from "../../../modules/workflow/approval/serverAuthMiddleware";
import { BusinessActivationService } from "../../../services/business/BusinessActivationService";
import { isSuperAdminEmail } from "../../../config/superadmin";

// Mock Firebase Admin Auth for testing Express middleware deterministically
vi.mock("../../../lib/firebaseAdmin", () => {
  return {
    getAdminAuth: () => ({
      verifyIdToken: async (token: string) => {
        if (token === "valid-superadmin-token") {
          return {
            uid: "superadmin_uid_001",
            email: "tekpounou@gmail.com",
            role: "SUPER_ADMIN",
            is_super_admin: true
          };
        }
        if (token === "valid-regular-user-token") {
          return {
            uid: "user_tenant_alpha_001",
            email: "regular@tenant-alpha.com",
            role: "EMPLOYEE",
            business_id: "biz_tenant_alpha"
          };
        }
        if (token === "valid-manager-token") {
          return {
            uid: "mgr_tenant_alpha_001",
            email: "manager@tenant-alpha.com",
            role: "MANAGER",
            business_id: "biz_tenant_alpha"
          };
        }
        throw new Error("Decoding Firebase ID token failed. Invalid signature.");
      }
    }),
    getAdminFirestore: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) })
        })
      })
    })
  };
});

describe("P0 Security Remediation Validation Suite", () => {
  
  describe("P0-1: Firestore Security Rules Static & Behavioral Hardening", () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const rules = fs.readFileSync(rulesPath, "utf8");

    it("1. Verifies zero un-scoped 'allow create, update: if isAuthenticated();' rules remain on cash management collections", () => {
      const cashCollections = [
        "cash_tills",
        "cash_registers",
        "branch_safes",
        "till_sessions",
        "internal_transfers",
        "cash_transfers",
        "cash_settlements",
        "cash_movements",
        "cash_closures"
      ];

      cashCollections.forEach((coll) => {
        const matchRegex = new RegExp(`match\\s+/\\b${coll}\\b/\\{id\\}\\s*\\{([^}]+)\\}`, "s");
        const match = rules.match(matchRegex);
        expect(match, `Collection ${coll} must be defined in firestore.rules`).not.toBeNull();
        if (match) {
          const block = match[1];
          expect(block).not.toContain("allow create, update: if isAuthenticated();");
          expect(block).not.toContain("allow write: if isAuthenticated();");
        }
      });
    });

    it("2. Verifies that isTenantCashOperator helper function is defined and restricts cash roles", () => {
      expect(rules).toContain("function isTenantCashOperator(bizId)");
      expect(rules).toContain("'owner', 'admin', 'manager', 'head_teller', 'senior_teller', 'junior_teller', 'teller', 'owner_admin'");
    });

    it("3. Verifies that cash management collections enforce immutable businessId / tenantId on update", () => {
      const cashCollections = [
        "cash_tills",
        "cash_registers",
        "till_sessions",
        "internal_transfers",
        "cash_transfers",
        "cash_movements",
        "cash_closures"
      ];

      cashCollections.forEach((coll) => {
        const matchRegex = new RegExp(`match\\s+/\\b${coll}\\b/\\{id\\}\\s*\\{([^}]+)\\}`, "s");
        const match = rules.match(matchRegex);
        expect(match).not.toBeNull();
        if (match) {
          const block = match[1];
          expect(block).toContain("getBusinessId(request.resource.data) == getBusinessId(resource.data)");
        }
      });
    });

    it("4. Verifies no duplicate match blocks exist for cash collections that could create cumulative permissive rules", () => {
      const cashCollections = [
        "cash_tills",
        "cash_registers",
        "branch_safes",
        "till_sessions",
        "internal_transfers",
        "cash_transfers",
        "cash_settlements",
        "cash_movements",
        "cash_closures"
      ];

      cashCollections.forEach((coll) => {
        const occurrences = (rules.match(new RegExp(`match\\s+/${coll}/`, "g")) || []).length;
        expect(occurrences, `Collection ${coll} should have exactly 1 match block in rules`).toBe(1);
      });
    });
  });

  describe("P0-2: /api/provisioning/activate-business Server Endpoint Hardening", () => {
    let app: express.Express;
    let activateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      app = express();
      app.use(express.json());

      activateSpy = vi.spyOn(BusinessActivationService, "activate").mockResolvedValue(undefined as any);

      // Mount route with exact middleware stack as in production server.ts
      app.post(
        "/api/provisioning/activate-business",
        authenticateToken,
        requireSuperAdmin,
        async (req: AuthenticatedRequest, res: express.Response) => {
          try {
            const { businessId } = req.body || {};
            if (!businessId) {
              return res.status(400).json({ error: "Missing businessId" });
            }

            const actor = {
              uid: req.user!.uid,
              email: req.user!.email || ""
            };

            await BusinessActivationService.activate(businessId, actor);
            res.json({ success: true });
          } catch (error: any) {
            res.status(500).json({ error: error.message || "Failed to activate business" });
          }
        }
      );
    });

    it("1. Rejects unauthenticated request with 401 UNAUTHORIZED when Bearer token is missing", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/provisioning/activate-business`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId: "biz_test_01" })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("UNAUTHORIZED");
        expect(activateSpy).not.toHaveBeenCalled();
      } finally {
        server.close();
      }
    });

    it("2. Rejects request with 401 INVALID_TOKEN when Bearer token signature is invalid", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/provisioning/activate-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer invalid-signature-token"
          },
          body: JSON.stringify({ businessId: "biz_test_01" })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe("INVALID_TOKEN");
        expect(activateSpy).not.toHaveBeenCalled();
      } finally {
        server.close();
      }
    });

    it("3. Rejects authenticated regular user with 403 FORBIDDEN when user is not a SuperAdmin", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/provisioning/activate-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer valid-regular-user-token"
          },
          body: JSON.stringify({ businessId: "biz_test_01" })
        });

        expect(response.status).toBe(403);
        const data = await response.json();
        expect(data.error).toBe("FORBIDDEN");
        expect(activateSpy).not.toHaveBeenCalled();
      } finally {
        server.close();
      }
    });

    it("4. Strictly IGNORES spoofed actor payload in request body and blocks unauthorized user", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/provisioning/activate-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer valid-regular-user-token"
          },
          body: JSON.stringify({
            businessId: "biz_target_victim",
            actor: {
              uid: "fake_superadmin_id",
              email: "tekpounou@gmail.com",
              role: "SUPER_ADMIN"
            }
          })
        });

        expect(response.status).toBe(403);
        expect(activateSpy).not.toHaveBeenCalled();
      } finally {
        server.close();
      }
    });

    it("5. Rejects 400 BAD REQUEST when businessId parameter is omitted", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/provisioning/activate-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer valid-superadmin-token"
          },
          body: JSON.stringify({})
        });

        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data.error).toBe("Missing businessId");
        expect(activateSpy).not.toHaveBeenCalled();
      } finally {
        server.close();
      }
    });

    it("6. Successfully allows valid SuperAdmin token and derives actor EXCLUSIVELY from verified token", async () => {
      const server = app.listen(0);
      const port = (server.address() as any).port;

      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/provisioning/activate-business`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer valid-superadmin-token"
          },
          body: JSON.stringify({
            businessId: "biz_pending_001",
            actor: {
              uid: "spoofed_body_id_ignored",
              email: "fake@spoofed.com"
            }
          })
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.success).toBe(true);

        expect(activateSpy).toHaveBeenCalledTimes(1);
        expect(activateSpy).toHaveBeenCalledWith("biz_pending_001", {
          uid: "superadmin_uid_001",
          email: "tekpounou@gmail.com"
        });
      } finally {
        server.close();
      }
    });
  });

  describe("Single Source of Truth: SuperAdmin Resolution", () => {
    it("confirms that isSuperAdminEmail correctly identifies platform supervisors", () => {
      expect(isSuperAdminEmail("tekpounou@gmail.com")).toBe(true);
      expect(isSuperAdminEmail("admin@finops.com")).toBe(true);
      expect(isSuperAdminEmail("superadmin@finops.com")).toBe(true);

      expect(isSuperAdminEmail("attacker@evil.com")).toBe(false);
      expect(isSuperAdminEmail("employee@tenant.com")).toBe(false);
      expect(isSuperAdminEmail("null")).toBe(false);
      expect(isSuperAdminEmail(undefined)).toBe(false);
    });
  });
});
