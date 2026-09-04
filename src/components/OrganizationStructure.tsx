import React, { useState } from "react";
import { 
  Branch, 
  Department, 
  Employee, 
  Invitation, 
  Role, 
  ERPEvent, 
  ForensicLog, 
  Business, 
  EmployeeBadge, 
  EmployeeContract 
} from "../types";
import { useOrgUIState } from "./org/hooks/useOrgUIState";
import { useOrganizationTree } from "./org/hooks/useOrganizationTree";
import { OrganizationTreeView } from "./org/components/OrganizationTreeView";
import { OrganizationNodeDetails } from "./org/components/OrganizationNodeDetails";
import { OrganizationEditModal } from "./org/components/OrganizationEditModal";
import { OrganizationBulkImportModal } from "./org/components/OrganizationBulkImportModal";
import { 
  Building2, 
  MapPin, 
  Layers, 
  UserCheck, 
  Plus, 
  UploadCloud, 
  QrCode, 
  FileText, 
  Search,
  Sparkles,
  Users
} from "lucide-react";

interface OrganizationStructureProps {
  currentRole: Role;
  currentUser?: { name: string; id: string };
  currentBusiness: Business;
  branches: Branch[];
  onAddBranch: (b: Branch) => void;
  departments: Department[];
  onAddDept: (d: Department) => void;
  onUpdateDept?: (deptId: string, updatedData: Partial<Department>) => void;
  employees: Employee[];
  onUpdateEmployeeStructure: (empId: string, branchId: string, deptId: string) => void;
  invitations: Invitation[];
  onSendInvite: (invite: Invitation) => void;
  branchDepartmentLinks: { branchId: string; departmentId: string }[];
  onAddBranchDeptLink: (branchId: string, departmentId: string) => void;
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  attendanceRecords?: any[];
  employeeBadges: EmployeeBadge[];
  setEmployeeBadges: React.Dispatch<React.SetStateAction<EmployeeBadge[]>>;
  employeeContracts: EmployeeContract[];
  setEmployeeContracts: React.Dispatch<React.SetStateAction<EmployeeContract[]>>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setInvitations: React.Dispatch<React.SetStateAction<Invitation[]>>;
  setFocusedEmployeeIdForProfile?: (id: string | null) => void;
}

export default function OrganizationStructure(props: OrganizationStructureProps) {
  const {
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
    setEmployeeContracts,
    onAddBranch,
    onAddDept,
    onUpdateDept,
    onUpdateEmployeeStructure,
    onAddBranchDeptLink,
    onAddEvent,
    onAddForensicLog,
    setFocusedEmployeeIdForProfile,
  } = props;

  const {
    activeSubTab,
    setActiveSubTab,
    searchEmployeeQuery,
    setSearchEmployeeQuery,
  } = useOrgUIState();

  const {
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
  } = useOrganizationTree({
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
    setEmployeeContracts,
    onAddBranch,
    onAddDept,
    onUpdateDept,
    onUpdateEmployeeStructure,
    onAddBranchDeptLink,
    onAddEvent,
    onAddForensicLog,
  });

  const [modalType, setModalType] = useState<"BRANCH" | "DEPARTMENT" | null>(null);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Structure & Organisation</span>
              <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {currentBusiness?.name}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestion de l'arborescence des succursales, départements et affectations des équipes.
            </p>
          </div>
        </div>

        {isOwnerOrManager && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModalType("BRANCH")}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
            >
              <Plus className="w-4 h-4" /> Succursale
            </button>
            <button
              type="button"
              onClick={() => setModalType("DEPARTMENT")}
              className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-xl flex items-center gap-1.5 shadow-lg shadow-sky-900/20"
            >
              <Plus className="w-4 h-4" /> Département
            </button>
            <button
              type="button"
              onClick={() => setIsBulkImportOpen(true)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-1.5 border border-slate-700"
            >
              <UploadCloud className="w-4 h-4 text-indigo-400" /> Import Massif
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Succursales</span>
            <MapPin className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white">{businessBranches.length}</div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Départements</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white">{businessDepts.length}</div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Collaborateurs</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-white">{activeStaff.length}</div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Badges Actifs</span>
            <QrCode className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-white">{employeeBadges.length}</div>
        </div>
      </div>

      {/* Main Grid: Tree View + Node Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher une entité ou un collaborateur..."
              className="w-full bg-slate-900/60 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <OrganizationTreeView
            treeData={treeData}
            selectedNode={selectedNode}
            onSelectNode={(node) => setSelectedNode(node)}
            searchQuery={searchQuery}
          />
        </div>

        <div className="lg:col-span-7">
          <OrganizationNodeDetails
            selectedNode={selectedNode}
            editingDeptId={editingDeptId}
            editDeptName={editDeptName}
            editDeptCode={editDeptCode}
            setEditDeptName={setEditDeptName}
            setEditDeptCode={setEditDeptCode}
            onStartEditDept={(dept) => {
              setEditingDeptId(dept.id);
              setEditDeptName(dept.name);
              setEditDeptCode(dept.code || "");
            }}
            onCancelEditDept={() => setEditingDeptId(null)}
            onSaveEditDept={handleSaveDeptEdit}
            onRegenerateBadge={handleRegenerateBadge}
            onOpenEmployeeProfile={setFocusedEmployeeIdForProfile}
            badges={employeeBadges}
            contracts={employeeContracts}
          />
        </div>
      </div>

      {/* Modals */}
      {modalType && (
        <OrganizationEditModal
          isOpen={!!modalType}
          type={modalType}
          currentBusiness={currentBusiness}
          branches={businessBranches}
          departments={businessDepts}
          currentUser={currentUser}
          onAddBranch={onAddBranch}
          onAddDept={onAddDept}
          onAddEvent={onAddEvent}
          onAddForensicLog={onAddForensicLog}
          onClose={() => setModalType(null)}
        />
      )}

      {isBulkImportOpen && (
        <OrganizationBulkImportModal
          isOpen={isBulkImportOpen}
          currentBusiness={currentBusiness}
          branches={businessBranches}
          departments={businessDepts}
          onSuccess={() => {}}
          onClose={() => setIsBulkImportOpen(false)}
        />
      )}
    </div>
  );
}
