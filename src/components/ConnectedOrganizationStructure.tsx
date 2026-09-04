import React from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { 
  Business, 
  Branch, 
  Department, 
  Employee, 
  Invitation, 
  EmployeeBadge, 
  EmployeeContract, 
  ERPEvent, 
  ForensicLog, 
  Role 
} from "../types";
import OrganizationStructure from "./OrganizationStructure";

interface ConnectedOrganizationStructureProps {
  currentRole: Role;
  currentUser?: { name: string; id: string };
  currentBusiness?: Business;
  branches?: Branch[];
  onAddBranch: (b: Branch) => void;
  departments?: Department[];
  onAddDept: (d: Department) => void;
  onUpdateDept?: (deptId: string, updatedData: Partial<Department>) => void;
  onUpdateEmployeeStructure: (empId: string, branchId: string, deptId: string) => void;
  invitations?: Invitation[];
  onSendInvite: (invite: Invitation) => void;
  branchDepartmentLinks: { branchId: string; departmentId: string }[];
  onAddBranchDeptLink: (branchId: string, departmentId: string) => void;
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  
  // Custom automated onboarding bindings
  employeeBadges?: EmployeeBadge[];
  setEmployeeBadges: React.Dispatch<React.SetStateAction<EmployeeBadge[]>>;
  employeeContracts?: EmployeeContract[];
  setEmployeeContracts: React.Dispatch<React.SetStateAction<EmployeeContract[]>>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setInvitations: React.Dispatch<React.SetStateAction<Invitation[]>>;
  setFocusedEmployeeIdForProfile?: (id: string | null) => void;
}

export const ConnectedOrganizationStructure: React.FC<ConnectedOrganizationStructureProps> = (props) => {
  const { 
    business, 
    branches, 
    departments, 
    employees, 
    invitations, 
    employeeBadges, 
    employeeContracts,
    branchDepartmentLinks,
    attendanceRecords
  } = useBusinessContext();

  const {
    currentBusiness,
    branches: propsBranches,
    departments: propsDepartments,
    invitations: propsInvitations,
    employeeBadges: propsEmployeeBadges,
    employeeContracts: propsEmployeeContracts,
    ...restProps
  } = props;

  return (
    <OrganizationStructure
      {...restProps}
      currentBusiness={business || currentBusiness!}
      branches={branches || propsBranches || []}
      departments={departments || propsDepartments || []}
      employees={employees || []}
      invitations={invitations || propsInvitations || []}
      branchDepartmentLinks={branchDepartmentLinks || []}
      attendanceRecords={attendanceRecords || []}
      employeeBadges={employeeBadges || propsEmployeeBadges || []}
      employeeContracts={employeeContracts || propsEmployeeContracts || []}
    />
  );
};

export default ConnectedOrganizationStructure;
