import { useState } from "react";
import { Branch, Department, Role } from "../types";

export function useDashboardUIState() {
  const [selectedMonth, setSelectedMonth] = useState<number | string>(new Date().getMonth());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Active Multi-Tenant Filter State
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [currentDept, setCurrentDept] = useState<Department>({ id: "", business_id: "", name: "" });
  const [currentRole, setCurrentRole] = useState<Role>("OWNER");
  const [focusedEmployeeIdForProfile, setFocusedEmployeeIdForProfile] = useState<string | null>(null);

  // Wizard & Requests UI State
  const [wizardActive, setWizardActive] = useState<boolean>(false);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [branchDepartmentLinks, setBranchDepartmentLinks] = useState<{ branchId: string; departmentId: string }[]>([]);

  return {
    selectedMonth,
    setSelectedMonth,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    currentBranch,
    setCurrentBranch,
    currentDept,
    setCurrentDept,
    currentRole,
    setCurrentRole,
    focusedEmployeeIdForProfile,
    setFocusedEmployeeIdForProfile,
    wizardActive,
    setWizardActive,
    leaveRequests,
    setLeaveRequests,
    branchDepartmentLinks,
    setBranchDepartmentLinks,
  };
}
