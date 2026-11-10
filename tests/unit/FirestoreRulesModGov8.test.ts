import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('MOD-GOV-8 Firestore Rules Static & Rule Matrix Verification', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  describe('B1: User Profiles Self-Promotion & Tenant Drift Prevention', () => {
    it('should disallow updating authority and tenant fields in self profile updates', () => {
      expect(rulesContent).toContain("'is_super_admin', 'isSuperAdmin', 'role', 'businessId', 'business_id', 'tenantId', 'tenant_id', 'permissions', 'is_owner', 'isOwner'");
    });

    it('should restrict unprivileged self-creation from assigning privileged roles or foreign tenant IDs', () => {
      expect(rulesContent).toContain("!('role' in request.resource.data) || !(request.resource.data.role.upper() in ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'ADMIN', 'HEAD_TELLER'])");
      expect(rulesContent).toContain("request.resource.data.businessId in ['', 'none', 'biz_' + request.auth.uid]");
    });
  });

  describe('B2: Audit Logs Immutability', () => {
    it('should prohibit update and delete on all audit log collections', () => {
      expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\} \{\s*allow read: if isAuthenticated\(\);\s*allow create: if canCreateAuditLog\(request\.resource\.data\);\s*allow update, delete: if false;/);
      expect(rulesContent).toMatch(/match \/forensic_logs\/\{id\} \{\s*allow read: if isAuthenticated\(\);\s*allow create: if canCreateAuditLog\(request\.resource\.data\);\s*allow update, delete: if false;/);
      expect(rulesContent).toMatch(/match \/enterprise_audit_logs\/\{id\} \{\s*allow read: if isAuthenticated\(\);\s*allow create: if canCreateAuditLog\(request\.resource\.data\);\s*allow update, delete: if false;/);
      expect(rulesContent).toMatch(/match \/security_audit_logs\/\{id\} \{\s*allow read: if isAuthenticated\(\);\s*allow create: if canCreateAuditLog\(request\.resource\.data\);\s*allow update, delete: if false;/);
      expect(rulesContent).toMatch(/match \/ai_cfo_audit_logs\/\{logId\} \{\s*allow read: if isAuthenticated\(\);\s*allow create: if canCreateAuditLog\(request\.resource\.data\);\s*allow update, delete: if false;/);
    });
  });

  describe('B3: Invitation Acceptance Email Match & Field Whitelist', () => {
    it('should enforce email match and restrict affected keys on invitation update', () => {
      expect(rulesContent).toContain("resource.data.get('email', '').lower() == getAuthEmail().lower()");
      expect(rulesContent).toContain("resource.data.get('normalizedEmail', '').lower() == getAuthEmail().lower()");
      expect(rulesContent).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status', 'uid', 'acceptedAt', 'updatedAt', 'user_id', 'userId'])");
    });
  });

  describe('B4: Payroll Records & Payrolls Role Isolation & Tenant Immutability', () => {
    it('should restrict payroll records creation and update to managers/admins or payroll seals', () => {
      expect(rulesContent).toMatch(/match \/payroll_records\/\{recordId\} \{\s*allow read: if isAuthenticated\(\) && \(isSuperAdmin\(\) \|\| isTenantScoped\(getBusinessId\(resource\.data\)\)\);\s*allow create: if isAuthenticated\(\) && \(\s*isSuperAdmin\(\) \|\| \s*isTenantAdminOrManager\(getBusinessId\(request\.resource\.data\)\) \|\|/);
      expect(rulesContent).toContain("(!('businessId' in request.resource.data) || request.resource.data.businessId == getBusinessId(resource.data))");
    });
  });

  describe('B5: Workflow Definitions & Approval Policies RBAC', () => {
    it('should restrict create and update of workflow definitions and approval policies to SuperAdmin or TenantAdmin/Manager', () => {
      expect(rulesContent).toMatch(/match \/workflow_definitions\/\{id\} \{\s*allow read: if isAuthenticated\(\);\s*allow create, update: if isAuthenticated\(\) && \(\s*isSuperAdmin\(\) \|\|\s*isTenantAdminOrManager\(getBusinessId\(request\.resource\.data\)\)/);
      expect(rulesContent).toMatch(/match \/approval_policies\/\{id\} \{\s*allow read: if isAuthenticated\(\);\s*allow create, update: if isAuthenticated\(\) && \(\s*isSuperAdmin\(\) \|\|\s*isTenantAdminOrManager\(getBusinessId\(request\.resource\.data\)\)/);
    });
  });

  describe('B6: SuperAdmin Email Verification Requirement', () => {
    it('should enforce email_verified == true for hardcoded SuperAdmin emails', () => {
      expect(rulesContent).toContain("request.auth.token.get('email_verified', false) == true");
    });
  });
});
