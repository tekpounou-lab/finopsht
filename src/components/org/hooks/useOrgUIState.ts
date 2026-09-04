import { useState } from "react";
import { Role } from "../../../types";

export type OrgSubTab = "structures" | "import" | "badges" | "contracts" | "onboarding";
export type OrgTool = "branch" | "dept" | "link" | "assign" | null;

export function useOrgUIState() {
  const [activeSubTab, setActiveSubTab] = useState<OrgSubTab>("structures");
  const [expandedTool, setExpandedTool] = useState<OrgTool>("branch");

  // Dialogs / Modals
  const [isBranchesListOpen, setIsBranchesListOpen] = useState<boolean>(false);
  const [rowToDeleteIdx, setRowToDeleteIdx] = useState<number | null>(null);
  const [isDeptsListOpen, setIsDeptsListOpen] = useState<boolean>(false);
  const [isSendInviteModalOpen, setIsSendInviteModalOpen] = useState<boolean>(false);
  const [isInviteStatusModalOpen, setIsInviteStatusModalOpen] = useState<boolean>(false);
  const [isBadgePreviewOpen, setIsBadgePreviewOpen] = useState<boolean>(false);

  // Drag over state
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Form states - Branch
  const [branchName, setBranchName] = useState<string>("");
  const [branchLocation, setBranchLocation] = useState<string>("");
  const [branchCode, setBranchCode] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Form states - Department
  const [deptName, setDeptName] = useState<string>("");
  const [deptCode, setDeptCode] = useState<string>("");

  // Form states - Assignments
  const [chosenBranchId, setChosenBranchId] = useState<string>("");
  const [chosenDeptId, setChosenDeptId] = useState<string>("");
  const [chosenEmpId, setChosenEmpId] = useState<string>("");
  const [assignBranchId, setAssignBranchId] = useState<string>("");
  const [assignDeptId, setAssignDeptId] = useState<string>("");

  // Form states - Invitations
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteName, setInviteName] = useState<string>("");
  const [invitePhone, setInvitePhone] = useState<string>("");
  const [invitePosition, setInvitePosition] = useState<string>("");
  const [invitePayRegime, setInvitePayRegime] = useState<"FIXED" | "COMMISSION" | "HYBRID">("FIXED");
  const [inviteBaseSalary, setInviteBaseSalary] = useState<number>(32000);
  const [inviteCommissionRate, setInviteCommissionRate] = useState<number>(0);
  const [inviteRole, setInviteRole] = useState<Role>("EMPLOYEE");
  const [inviteBranchId, setInviteBranchId] = useState<string>("");
  const [inviteDeptId, setInviteDeptId] = useState<string>("");

  // Mass Import States
  const [importEntityType, setImportEntityType] = useState<"employees" | "attendance">("employees");
  const [importInputType, setImportInputType] = useState<"csv" | "json">("csv");
  const [rawTextToImport, setRawTextToImport] = useState<string>("");
  const [parsedImportRows, setParsedImportRows] = useState<any[]>([]);
  const [importValidationErrors, setImportValidationErrors] = useState<string[]>([]);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [searchEmployeeQuery, setSearchEmployeeQuery] = useState<string>("");

  // Badges & Contracts Selection
  const [selectedBadgeEmployeeId, setSelectedBadgeEmployeeId] = useState<string>("");
  const [selectedContractEmployeeId, setSelectedContractEmployeeId] = useState<string>("");

  return {
    activeSubTab, setActiveSubTab,
    expandedTool, setExpandedTool,
    isBranchesListOpen, setIsBranchesListOpen,
    rowToDeleteIdx, setRowToDeleteIdx,
    isDeptsListOpen, setIsDeptsListOpen,
    isSendInviteModalOpen, setIsSendInviteModalOpen,
    isInviteStatusModalOpen, setIsInviteStatusModalOpen,
    isBadgePreviewOpen, setIsBadgePreviewOpen,
    isDragOver, setIsDragOver,
    branchName, setBranchName,
    branchLocation, setBranchLocation,
    branchCode, setBranchCode,
    isSaving, setIsSaving,
    errorMessage, setErrorMessage,
    successMessage, setSuccessMessage,
    deptName, setDeptName,
    deptCode, setDeptCode,
    chosenBranchId, setChosenBranchId,
    chosenDeptId, setChosenDeptId,
    chosenEmpId, setChosenEmpId,
    assignBranchId, setAssignBranchId,
    assignDeptId, setAssignDeptId,
    inviteEmail, setInviteEmail,
    inviteName, setInviteName,
    invitePhone, setInvitePhone,
    invitePosition, setInvitePosition,
    invitePayRegime, setInvitePayRegime,
    inviteBaseSalary, setInviteBaseSalary,
    inviteCommissionRate, setInviteCommissionRate,
    inviteRole, setInviteRole,
    inviteBranchId, setInviteBranchId,
    inviteDeptId, setInviteDeptId,
    importEntityType, setImportEntityType,
    importInputType, setImportInputType,
    rawTextToImport, setRawTextToImport,
    parsedImportRows, setParsedImportRows,
    importValidationErrors, setImportValidationErrors,
    importLogs, setImportLogs,
    searchEmployeeQuery, setSearchEmployeeQuery,
    selectedBadgeEmployeeId, setSelectedBadgeEmployeeId,
    selectedContractEmployeeId, setSelectedContractEmployeeId
  };
}
