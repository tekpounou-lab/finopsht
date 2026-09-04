export interface RolePermissions {
  canViewDashboard: boolean;
  canManagePayroll: boolean;
  canCreateBranch: boolean;
  canCreateDepartment: boolean;
  canImportEmployees: boolean;
  canValidatePayroll: boolean;
  canOverrideAttendance: boolean;
  canAccessReliability: boolean;
  canAccessForensicAudit: boolean;
  canAccessSystemHealth: boolean;
  canAccessDisasterRecovery: boolean;
}

export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  SUPER_ADMIN: {
    canViewDashboard: true,
    canManagePayroll: true,
    canCreateBranch: true,
    canCreateDepartment: true,
    canImportEmployees: true,
    canValidatePayroll: true,
    canOverrideAttendance: true,
    canAccessReliability: true,
    canAccessForensicAudit: true,
    canAccessSystemHealth: true,
    canAccessDisasterRecovery: true,
  },
  ADMIN: {
    canViewDashboard: true,
    canManagePayroll: true,
    canCreateBranch: true,
    canCreateDepartment: true,
    canImportEmployees: true,
    canValidatePayroll: true,
    canOverrideAttendance: true,
    canAccessReliability: false,
    canAccessForensicAudit: false,
    canAccessSystemHealth: false,
    canAccessDisasterRecovery: false,
  },
  OWNER: {
    canViewDashboard: true,
    canManagePayroll: true,
    canCreateBranch: true,
    canCreateDepartment: true,
    canImportEmployees: true,
    canValidatePayroll: true,
    canOverrideAttendance: true,
    canAccessReliability: false,
    canAccessForensicAudit: false,
    canAccessSystemHealth: false,
    canAccessDisasterRecovery: false,
  },
  MANAGER: {
    canViewDashboard: true, // Limited local/branch view
    canManagePayroll: true, // Prepare/estimate locally
    canCreateBranch: true,  // Can create branch if authorized
    canCreateDepartment: true, // Can create department
    canImportEmployees: true, // Can import files for branch employees
    canValidatePayroll: false, // Cannot final-lock or pay payroll
    canOverrideAttendance: true, // Can adjust hours on the ground
    canAccessReliability: false, // Restricted
    canAccessForensicAudit: false,
    canAccessSystemHealth: false,
    canAccessDisasterRecovery: false,
  },
  SUPERVISOR: {
    canViewDashboard: false, // Shifted to operational monitoring
    canManagePayroll: false,
    canCreateBranch: false,
    canCreateDepartment: false,
    canImportEmployees: false,
    canValidatePayroll: false,
    canOverrideAttendance: false, // Monitor only, no overrides
    canAccessReliability: false,
    canAccessForensicAudit: false,
    canAccessSystemHealth: false,
    canAccessDisasterRecovery: false,
  },
  EMPLOYEE: {
    canViewDashboard: false, // Strictly limited self portal
    canManagePayroll: false,
    canCreateBranch: false,
    canCreateDepartment: false,
    canImportEmployees: false,
    canValidatePayroll: false,
    canOverrideAttendance: false,
    canAccessReliability: false,
    canAccessForensicAudit: false,
    canAccessSystemHealth: false,
    canAccessDisasterRecovery: false,
  },
};

export function hasPermission(role: string, permission: keyof RolePermissions): boolean {
  if (!role) return false;
  const upperRole = role.toUpperCase();
  const perms = ROLE_PERMISSIONS[upperRole];
  if (!perms) return false;
  return perms[permission];
}
