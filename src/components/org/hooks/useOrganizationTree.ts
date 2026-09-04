import { useState, useMemo, useCallback } from "react";
import { Branch, Department, Employee, Role, Business, ERPEvent, ForensicLog, EmployeeBadge, EmployeeContract } from "../../../types";
import { hasPermission } from "../../../permissions/role.permissions";
import { generateSignature, getLocalIP } from "../../../data";
import { checkEmailUniquenessGlobal } from "../../../utils/uniqueness";
import { db } from "../../../lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { finopsEventOrchestrator } from "../../../services/finopsEventOrchestrator";

export interface TreeNode {
  id: string;
  type: "BUSINESS" | "BRANCH" | "DEPARTMENT" | "EMPLOYEE";
  name: string;
  code?: string;
  location?: string;
  role?: Role;
  position?: string;
  count?: number;
  parentId?: string;
  children?: TreeNode[];
  data?: any;
}

export interface UseOrganizationTreeProps {
  currentRole: Role;
  currentUser?: { name: string; id: string };
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  branchDepartmentLinks: { branchId: string; departmentId: string }[];
  employeeBadges: EmployeeBadge[];
  setEmployeeBadges: React.Dispatch<React.SetStateAction<EmployeeBadge[]>>;
  employeeContracts: EmployeeContract[];
  setEmployeeContracts: React.Dispatch<React.SetStateAction<EmployeeContract[]>>;
  onAddBranch: (b: Branch) => void;
  onAddDept: (d: Department) => void;
  onUpdateDept?: (deptId: string, updatedData: Partial<Department>) => void;
  onUpdateEmployeeStructure: (empId: string, branchId: string, deptId: string) => void;
  onAddBranchDeptLink: (branchId: string, departmentId: string) => void;
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
}

export function useOrganizationTree({
  currentRole,
  currentUser,
  currentBusiness,
  branches,
  departments,
  employees,
  branchDepartmentLinks,
  employeeBadges,
  setEmployeeBadges,
  employeeContracts,
  onAddBranch,
  onAddDept,
  onUpdateDept,
  onUpdateEmployeeStructure,
  onAddBranchDeptLink,
  onAddEvent,
  onAddForensicLog,
}: UseOrganizationTreeProps) {
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [editDeptCode, setEditDeptCode] = useState("");

  const isOwnerOrManager = hasPermission(currentRole, "canCreateBranch");

  const businessBranches = useMemo(
    () => branches.filter((b) => b.business_id === currentBusiness?.id),
    [branches, currentBusiness?.id]
  );

  const businessDepts = useMemo(
    () => departments.filter((d) => d.business_id === currentBusiness?.id),
    [departments, currentBusiness?.id]
  );

  const activeStaff = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.business_id === currentBusiness?.id &&
          (e.status === "ACTIVE" ||
            e.status === "INVITED" ||
            e.status === "PENDING_ACCEPTANCE" ||
            e.status === "PENDING" ||
            !e.status)
      ),
    [employees, currentBusiness?.id]
  );

  // Build hierarchical tree
  const treeData = useMemo<TreeNode>(() => {
    const rootNode: TreeNode = {
      id: currentBusiness?.id || "root",
      type: "BUSINESS",
      name: currentBusiness?.name || "Entreprise",
      code: currentBusiness?.nif || "ENT",
      children: [],
      data: currentBusiness,
    };

    const branchNodes: TreeNode[] = businessBranches.map((br) => {
      // Find linked departments for this branch
      const linkedDeptIds = new Set(
        branchDepartmentLinks
          .filter((link) => link.branchId === br.id)
          .map((link) => link.departmentId)
      );

      const deptsForBranch = businessDepts.filter(
        (d) => linkedDeptIds.has(d.id) || d.branchId === br.id
      );

      const deptNodes: TreeNode[] = deptsForBranch.map((dept) => {
        const staffInDept = activeStaff.filter(
          (emp) =>
            (emp.departmentId === dept.id || emp.department_id === dept.id) &&
            (emp.branchId === br.id || emp.branch_id === br.id)
        );

        const empNodes: TreeNode[] = staffInDept.map((emp) => ({
          id: emp.id,
          type: "EMPLOYEE",
          name: emp.name || emp.displayName || "Employé",
          role: emp.role,
          position: emp.position || "Poste non défini",
          parentId: dept.id,
          data: emp,
        }));

        return {
          id: dept.id,
          type: "DEPARTMENT",
          name: dept.name,
          code: dept.code,
          parentId: br.id,
          count: staffInDept.length,
          children: empNodes,
          data: dept,
        };
      });

      return {
        id: br.id,
        type: "BRANCH",
        name: br.name,
        code: br.code,
        location: br.location || br.address,
        parentId: currentBusiness?.id,
        count: deptsForBranch.length,
        children: deptNodes,
        data: br,
      };
    });

    rootNode.children = branchNodes;
    return rootNode;
  }, [currentBusiness, businessBranches, businessDepts, branchDepartmentLinks, activeStaff]);

  const handleSaveDeptEdit = useCallback(
    async (deptId: string) => {
      if (!editDeptName.trim()) return;
      try {
        const deptRef = doc(db, "departments", deptId);
        await updateDoc(deptRef, {
          name: editDeptName.trim(),
          code: editDeptCode.trim().toUpperCase(),
        });
        if (onUpdateDept) {
          onUpdateDept(deptId, {
            name: editDeptName.trim(),
            code: editDeptCode.trim().toUpperCase(),
          });
        }
        setEditingDeptId(null);
        setEditDeptName("");
        setEditDeptCode("");
      } catch (err) {
        console.error("Failed to update department:", err);
      }
    },
    [editDeptName, editDeptCode, onUpdateDept]
  );

  const handleRegenerateBadge = useCallback(
    async (employeeId: string) => {
      const emp = employees.find((e) => e.id === employeeId);
      if (!emp) return;

      const fakeSignature = `HMAC::${btoa(emp.id + emp.business_id).substring(0, 16).toUpperCase()}`;
      const newBadgeId = "bad_" + emp.id;
      const newBadge: EmployeeBadge = {
        id: newBadgeId,
        employeeId: emp.id,
        business_id: emp.business_id,
        branchId: emp.branchId || emp.branch_id || "main",
        departmentId: emp.departmentId || emp.department_id || "general",
        role: emp.role,
        qrPayload: JSON.stringify({
          empId: emp.id,
          bizId: emp.business_id,
          name: emp.name,
          role: emp.role,
          issueDate: new Date().toISOString(),
          signature: fakeSignature,
        }),
        issuedAt: new Date().toISOString(),
        signature: fakeSignature,
      };

      setEmployeeBadges((prev) => {
        const filtered = prev.filter((b) => b.employeeId !== employeeId);
        return [...filtered, newBadge];
      });

      const ev: ERPEvent = {
        id: "ev_" + Math.random().toString(36).substring(2, 9),
        business_id: currentBusiness?.id,
        timestamp: new Date().toISOString(),
        type: "HR_BADGE_ISSUED",
        payload: { message: `Badge régénéré pour ${emp.name}` },
        checksum: generateSignature(emp.id),
      };
      onAddEvent(ev);
    },
    [employees, currentBusiness?.id, currentUser?.name, setEmployeeBadges, onAddEvent]
  );

  return {
    treeData,
    selectedNode,
    setSelectedNode,
    searchQuery,
    setSearchQuery,
    editingDeptId,
    setEditingDeptId,
    editDeptName,
    setEditDeptName,
    editDeptCode,
    setEditDeptCode,
    handleSaveDeptEdit,
    handleRegenerateBadge,
    businessBranches,
    businessDepts,
    activeStaff,
    isOwnerOrManager,
  };
}
