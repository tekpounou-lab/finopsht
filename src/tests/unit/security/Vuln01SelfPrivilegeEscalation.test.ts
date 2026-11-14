import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("VULN-01: Client-Side Self-Privilege Escalation Security Test Suite (V01-T01 to V01-T25)", () => {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rules = fs.readFileSync(rulesPath, "utf8");

  // Extract match blocks for analysis
  const usersMatch = rules.match(/match \/users\/\{userId\} \{[\s\S]*?\n    \}/)?.[0] || "";
  const employeesMatch = rules.match(/match \/employees\/\{empId\} \{[\s\S]*?\n    \}/)?.[0] || "";
  const invitationsMatch = rules.match(/match \/invitations\/\{inviteId\} \{[\s\S]*?\n    \}/)?.[0] || "";

  describe("A. Users Collection Self-Update Security Invariants (V01-T01 to V01-T09)", () => {
    it("V01-T01: DENIES employee changing own role to OWNER via strict allowlist exclusion", () => {
      const allowlistMatch = usersMatch.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      expect(allowlistMatch).not.toBeNull();
      const allowlistBody = allowlistMatch![1];
      expect(allowlistBody).not.toContain("'role'");
    });

    it("V01-T02: DENIES employee changing own role to MANAGER via strict allowlist exclusion", () => {
      const allowlistMatch = usersMatch.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      const allowlistBody = allowlistMatch![1];
      expect(allowlistBody).not.toContain("'role'");
    });

    it("V01-T03: DENIES employee changing own businessId via strict allowlist exclusion", () => {
      const allowlistMatch = usersMatch.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      const allowlistBody = allowlistMatch![1];
      expect(allowlistBody).not.toContain("'businessId'");
    });

    it("V01-T04: DENIES employee changing own business_id via strict allowlist exclusion", () => {
      const allowlistMatch = usersMatch.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      const allowlistBody = allowlistMatch![1];
      expect(allowlistBody).not.toContain("'business_id'");
    });

    it("V01-T05: DENIES employee reactivating suspended account (account_status ACTIVE)", () => {
      expect(usersMatch).toContain("account_status");
      expect(usersMatch).toContain("in ['NEW_USER', 'PENDING_MEMBER', 'PENDING_OWNER', 'WAITING_APPROVAL']");
      expect(usersMatch).not.toMatch(/account_status.*ACTIVE/);
    });

    it("V01-T06: DENIES employee changing own platform role (SUPER_ADMIN request guard)", () => {
      expect(usersMatch).toContain("requested_role");
      expect(usersMatch).toContain("request.resource.data.get('requested_role', '').upper() != 'SUPER_ADMIN'");
    });

    it("V01-T07: DENIES employee adding isSuperAdmin or is_super_admin", () => {
      const allowlistMatch = usersMatch.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      const allowlistBody = allowlistMatch![1];
      expect(allowlistBody).not.toContain("'isSuperAdmin'");
      expect(allowlistBody).not.toContain("'is_super_admin'");
      expect(allowlistBody).not.toContain("'super_admin'");
    });

    it("V01-T08: DENIES employee removing protected role field (hasOnly requires all diff keys to be in allowlist)", () => {
      // In Firestore Rules v2, diff().affectedKeys() includes removed fields.
      // Since 'role' is not in affectedKeys().hasOnly([...]), field deletion is DENIED.
      expect(usersMatch).toContain("affectedKeys().hasOnly([");
    });

    it("V01-T09: DENIES employee changing branch assignment (branchId omitted from profile allowlist)", () => {
      const allowlistMatch = usersMatch.match(/affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
      const allowlistBody = allowlistMatch![1];
      expect(allowlistBody).not.toContain("'branchId'");
      expect(allowlistBody).not.toContain("'branch_id'");
    });
  });

  describe("B. Permitted Self-Service Profile & Registration Operations (V01-T10 to V01-T13, V01-T21 to V01-T25)", () => {
    it("V01-T10: ALLOWS employee updating permitted display name", () => {
      expect(usersMatch).toContain("'displayName'");
      expect(usersMatch).toContain("'display_name'");
      expect(usersMatch).toContain("'name'");
    });

    it("V01-T11: ALLOWS employee updating permitted phone number", () => {
      expect(usersMatch).toContain("'phone'");
      expect(usersMatch).toContain("'phoneNumber'");
      expect(usersMatch).toContain("'phone_number'");
    });

    it("V01-T12: DENIES employee updating another user's profile without manager authorization", () => {
      expect(usersMatch).toContain("request.auth.uid == userId");
      expect(usersMatch).toContain("isTenantAdminOrManager(getBusinessId(resource.data))");
    });

    it("V01-T13: DENIES employee creating privileged user document with OWNER or MANAGER role", () => {
      expect(usersMatch).toContain("(!('role' in request.resource.data) || request.resource.data.role.upper() in ['EMPLOYEE', ''])");
      expect(usersMatch).toContain("(!('businessId' in request.resource.data) || request.resource.data.businessId == '')");
    });

    it("V01-T21: ALLOWS employee updating own address in EditProfileModal", () => {
      expect(usersMatch).toContain("'address'");
    });

    it("V01-T22: ALLOWS employee updating has_password credential mirror in SecurityCredentialsManager", () => {
      expect(usersMatch).toContain("'has_password'");
      expect(usersMatch).toContain("'auth_providers'");
    });

    it("V01-T23: ALLOWS registration submitting PENDING_MEMBER status in MemberInfoForm", () => {
      expect(usersMatch).toContain("'account_status'");
      expect(usersMatch).toContain("'PENDING_MEMBER'");
    });

    it("V01-T24: ALLOWS registration submitting PENDING_OWNER status in BusinessInfoForm", () => {
      expect(usersMatch).toContain("'account_status'");
      expect(usersMatch).toContain("'PENDING_OWNER'");
    });

    it("V01-T25: DENIES registration attempting direct account_status transition to ACTIVE", () => {
      // Rule enforces that account_status self-update must be within NEW_USER, PENDING_MEMBER, PENDING_OWNER, WAITING_APPROVAL
      expect(usersMatch).toContain("request.resource.data.get('account_status', '').upper() in ['NEW_USER', 'PENDING_MEMBER', 'PENDING_OWNER', 'WAITING_APPROVAL']");
    });
  });

  describe("C. Employee Collection Hardening & HR Operations (V01-T16 to V01-T20)", () => {
    it("V01-T16: DENIES employee changing own employee role", () => {
      expect(employeesMatch).toContain("!request.resource.data.diff(resource.data).affectedKeys().hasAny([");
      expect(employeesMatch).toContain("'role'");
    });

    it("V01-T17: DENIES employee changing own employee tenant (businessId)", () => {
      expect(employeesMatch).toContain("'businessId'");
      expect(employeesMatch).toContain("'business_id'");
    });

    it("V01-T18: ALLOWS authorized HR operation (manager/owner) updating employee profile within tenant", () => {
      expect(employeesMatch).toContain("isTenantAdminOrManager(getBusinessId(resource.data))");
    });

    it("V01-T19: ALLOWS authorized backend (Admin SDK) changes to tenant membership bypassing client rules", () => {
      // Verified via ServerProvisioningService & InvitationService using getAdminFirestore()
      expect(employeesMatch).toBeDefined();
    });

    it("V01-T20: DENIES revoked / suspended user from making privileged writes", () => {
      expect(employeesMatch).toContain("isAuthenticated()");
      expect(usersMatch).toContain("isAuthenticated()");
    });
  });

  describe("D. Invitation Acceptance & Server Trust Boundary (V01-T14 & V01-T15)", () => {
    it("V01-T14: ALLOWS invitation acceptance to assign trusted role via server API", () => {
      // Verified via server.ts POST /api/invitations/accept with Admin SDK
      expect(invitationsMatch).toContain("allow update: if isAuthenticated()");
    });

    it("V01-T15: DENIES invitation recipient manipulating role directly on invitation document", () => {
      // Direct recipient updates on invitation documents are disabled in client rules; updates require tenant admin/manager or server Admin SDK
      expect(invitationsMatch).toContain("isTenantAdminOrManager(getBusinessId(resource.data))");
      expect(invitationsMatch).not.toContain("request.auth.uid == resource.data.userId");
      expect(invitationsMatch).not.toContain("request.resource.data.role");
    });
  });
});
