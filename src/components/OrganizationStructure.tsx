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
import { OrganizationBulkImportModal, BulkImportEntityType } from "./org/components/OrganizationBulkImportModal";
import { BranchesListView } from "./org/components/BranchesListView";
import { DepartmentsListView } from "./org/components/DepartmentsListView";
import { DepartmentAssignmentManager } from "./organization/DepartmentAssignmentManager";
import { DepartmentMappingReviewModal } from "./organization/DepartmentMappingReviewModal";
import { InvitationManagement } from "./organization/InvitationManagement";
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
  Users,
  Network,
  GitFork,
  CheckSquare,
  Tag,
  Mail
} from "lucide-react";
import { toast } from "sonner";

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
    invitations = [],
    setInvitations,
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
  const [bulkImportInitialType, setBulkImportInitialType] = useState<BulkImportEntityType>("branches");
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [selectedEmpForAssignmentId, setSelectedEmpForAssignmentId] = useState<string>(employees[0]?.id || "");

  const selectedEmpForAssignment = employees.find(e => e.id === selectedEmpForAssignmentId) || employees[0];

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
              onClick={() => setIsMappingModalOpen(true)}
              className="px-3 py-2 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-400 text-xs font-medium rounded-xl flex items-center gap-1.5"
            >
              <Tag className="w-4 h-4" /> Mappage SSOT
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

      {/* KPI Cards with Click-to-View Interactivity */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => setActiveSubTab("branches")}
          className="bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/40 p-3.5 rounded-xl cursor-pointer transition shadow-sm group"
          title="Cliquer pour afficher la liste complète des succursales"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs group-hover:text-emerald-300 font-medium transition">Succursales</span>
            <MapPin className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl font-bold text-white">{businessBranches.length}</div>
            <span className="text-[10px] text-emerald-400 font-semibold group-hover:underline">Voir liste →</span>
          </div>
        </div>

        <div 
          onClick={() => setActiveSubTab("departments")}
          className="bg-slate-900/40 hover:bg-slate-900/80 border border-slate-800/80 hover:border-sky-500/40 p-3.5 rounded-xl cursor-pointer transition shadow-sm group"
          title="Cliquer pour afficher la liste complète des départements"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs group-hover:text-sky-300 font-medium transition">Départements</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <div className="text-xl font-bold text-white">{businessDepts.length}</div>
            <span className="text-[10px] text-sky-400 font-semibold group-hover:underline">Voir liste →</span>
          </div>
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

      {/* Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={() => setActiveSubTab("structures")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "structures"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Network className="w-4 h-4" />
          <span>Arborescence</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("branches")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "branches"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span>Succursales</span>
          <span className="bg-slate-800 border border-slate-700 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono ml-0.5">
            {businessBranches.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("departments")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "departments"
              ? "bg-sky-600 text-white shadow-lg shadow-sky-600/20"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Layers className="w-4 h-4 text-sky-400" />
          <span>Départements</span>
          <span className="bg-slate-800 border border-slate-700 text-sky-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono ml-0.5">
            {businessDepts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("invitations")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "invitations"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Invitations</span>
          {invitations.length > 0 && (
            <span className="bg-slate-800 border border-slate-700 text-indigo-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono ml-0.5">
              {invitations.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab("import")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeSubTab === "import"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <GitFork className="w-4 h-4" />
          <span>Allocations Multi-Dept</span>
        </button>

        <button
          type="button"
          onClick={() => setIsMappingModalOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 hover:bg-slate-800 transition cursor-pointer ml-auto"
        >
          <Tag className="w-4 h-4 text-emerald-400" />
          <span>Mappage SSOT</span>
        </button>
      </div>

      {/* Main Content Area Based on Sub-Tab */}
      {activeSubTab === "branches" && (
        <BranchesListView
          branches={businessBranches}
          departments={businessDepts}
          employees={employees}
          isOwnerOrManager={isOwnerOrManager}
          onOpenAddBranch={() => setModalType("BRANCH")}
          onOpenBulkImport={(type) => {
            setBulkImportInitialType(type);
            setIsBulkImportOpen(true);
          }}
          onSelectBranchInTree={(branchId) => {
            const found = treeData.children?.find((c) => c.id === branchId);
            if (found) setSelectedNode(found);
            setActiveSubTab("structures");
          }}
        />
      )}

      {activeSubTab === "departments" && (
        <DepartmentsListView
          departments={businessDepts}
          branches={businessBranches}
          employees={employees}
          isOwnerOrManager={isOwnerOrManager}
          onOpenAddDept={() => setModalType("DEPARTMENT")}
          onOpenBulkImport={(type) => {
            setBulkImportInitialType(type);
            setIsBulkImportOpen(true);
          }}
          onSelectDeptInTree={(deptId) => {
            for (const bNode of treeData.children || []) {
              const dNode = bNode.children?.find((c) => c.id === deptId);
              if (dNode) {
                setSelectedNode(dNode);
                break;
              }
            }
            setActiveSubTab("structures");
          }}
        />
      )}

      {activeSubTab === "invitations" && (
        <InvitationManagement
          currentBusiness={currentBusiness}
          branches={businessBranches}
          departments={businessDepts}
          invitations={invitations}
          currentRole={currentRole}
          currentUser={currentUser || { name: "Administrateur", id: "usr_1" }}
          setInvitations={setInvitations}
        />
      )}

      {activeSubTab === "structures" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80 shadow-md">
            {/* Quick Navigation / Action Bar */}
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800/60">
              <button
                type="button"
                onClick={() => setActiveSubTab("branches")}
                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 border border-emerald-500/20 transition cursor-pointer"
                title="Voir la liste tabulaire de toutes les succursales"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                <span>Succursales ({businessBranches.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab("departments")}
                className="flex-1 py-1.5 px-2 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 border border-sky-500/20 transition cursor-pointer"
                title="Voir la liste tabulaire de tous les départements"
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Départements ({businessDepts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkImportInitialType("branches");
                  setIsBulkImportOpen(true);
                }}
                className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] flex items-center gap-1 border border-slate-700 transition cursor-pointer"
                title="Ouvrir l'outil d'import massif"
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                <span>Import</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher une entité ou un collaborateur..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
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
      )}

      {activeSubTab === "import" && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <GitFork className="w-5 h-5 text-indigo-400" />
                <span>Gestionnaire d'Allocations Multi-Départements</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Affectez un collaborateur à un département principal et plusieurs départements secondaires avec calcul des pourcentages de ventilation budgétaire.
              </p>
            </div>

            {employees.length > 0 && (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <Users className="w-4 h-4 text-indigo-400" />
                <span className="text-xs text-slate-400 font-semibold uppercase">Employé:</span>
                <select
                  value={selectedEmpForAssignment?.id || ""}
                  onChange={(e) => setSelectedEmpForAssignmentId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer max-w-[220px]"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} className="bg-slate-900 text-slate-200">
                      {emp.name} ({emp.position || "Collaborateur"})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {selectedEmpForAssignment ? (
            <DepartmentAssignmentManager
              employee={selectedEmpForAssignment}
              departments={businessDepts}
              onSaveAssignments={async (updatedEmp) => {
                if (props.setEmployees) {
                  props.setEmployees(prev => prev.map(e => e.id === updatedEmp.id ? updatedEmp : e));
                }
                toast.success("Allocations départementales enregistrées avec succès.");
              }}
            />
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 font-mono">
              Aucun employé disponible pour l'allocation multi-départements.
            </div>
          )}
        </div>
      )}

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
          initialType={bulkImportInitialType}
          currentBusiness={currentBusiness}
          branches={businessBranches}
          departments={businessDepts}
          existingEmployees={employees}
          onAddBranch={onAddBranch}
          onAddDept={onAddDept}
          onSuccess={(count, type) => {
            toast.success(`Import massif de ${count} ${type} terminé avec succès.`);
          }}
          onClose={() => setIsBulkImportOpen(false)}
        />
      )}

      {isMappingModalOpen && (
        <DepartmentMappingReviewModal
          isOpen={isMappingModalOpen}
          onClose={() => setIsMappingModalOpen(false)}
          unmappedItems={businessDepts.map(d => ({ rawLabel: d.name, count: 1 }))}
          departments={businessDepts}
          onConfirmMappings={(confirmed, aliases) => {
            toast.success(`${Object.keys(confirmed).length} correspondances enregistrées.`);
            setIsMappingModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
