import React, { useState, useEffect, useCallback, useMemo } from "react";
import { CashTill, BranchSafe, TillSession, InternalTransfer, CurrencyCode } from "../../types/cashManagement";
import { CashManagementRepository } from "../../repositories/CashManagementRepository";
import { TillSessionModal } from "./TillSessionModal";
import { InternalTransferDialog } from "./InternalTransferDialog";
import { ApprovalQueueWidget } from "./ApprovalQueueWidget";
import { TransactionTypesManagement } from "./TransactionTypesManagement";
import { ChartOfAccountsManagement } from "./ChartOfAccountsManagement";
import { TodayRatesEditor } from "./TodayRatesEditor";
import { FundSafeModal } from "./FundSafeModal";
import { TellerTransactionModal } from "./TellerTransactionModal";
import { TransferPayoutDialog } from "./TransferPayoutDialog";
import { EmployeeCashEligibilityService } from "../../domains/cash/services/EmployeeCashEligibilityService";
import { seedTestTransfer } from "../../utils/seedTransfers";
import {
  Vault,
  Building2,
  BookOpen,
  ArrowRightLeft,
  Lock,
  Unlock,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  Save,
  ShieldAlert,
  Coins,
  Sparkles,
  Users,
  UserCheck,
  ArrowDownToLine,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  SlidersHorizontal,
  Layers,
  Banknote,
  Edit3,
  PauseCircle,
  PlayCircle,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { Employee } from "../../types";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { Branch, Department } from "../../types/organization";
import { WorkspaceRepository } from "../../repositories";
import SearchableSelect from "../ui/SearchableSelect";

interface CashConsoleProps {
  businessId: string;
  branchId?: string;
  currentUser: { id: string; name: string; role: string };
  employees?: Employee[];
}

export const CashConsole: React.FC<CashConsoleProps> = ({
  businessId,
  branchId = "MAIN_BRANCH",
  currentUser,
  employees = []
}) => {
  const [activeTab, setActiveTab] = useState<"OPERATIONS" | "CHART_OF_ACCOUNTS" | "TRANSACTION_TYPES" | "EXCHANGE_RATES">("OPERATIONS");
  const [tills, setTills] = useState<CashTill[]>([]);
  const [safes, setSafes] = useState<BranchSafe[]>([]);
  const [sessions, setSessions] = useState<TillSession[]>([]);
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  // Company employees, branches and departments for till & safe assignment/filtering
  const [companyEmployees, setCompanyEmployees] = useState<Employee[]>(employees);
  const [companyBranches, setCompanyBranches] = useState<Branch[]>([]);
  const [companyDepartments, setCompanyDepartments] = useState<Department[]>([]);

  // Organizational and Status Filters for Caisses & Coffres
  const [cashSubView, setCashSubView] = useState<"TILLS" | "SAFES" | "ALL">("TILLS");
  const [searchQuery, setSearchQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<"ALL" | CurrencyCode>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [branchFilter, setBranchFilter] = useState<string>("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [employeeFilter, setEmployeeFilter] = useState<string>("ALL");

  const [tillsPage, setTillsPage] = useState(1);
  const [safesPage, setSafesPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  // Filtered Tills (by code/number, name, employee/teller, branch, department, currency, status)
  const filteredTills = useMemo(() => {
    return tills.filter((till) => {
      if (currencyFilter !== "ALL" && till.currency !== currencyFilter) {
        return false;
      }
      if (statusFilter !== "ALL" && till.status !== statusFilter) {
        return false;
      }
      if (branchFilter !== "ALL") {
        const tillBranch = till.branch_id || (till as any).branchId || "MAIN_BRANCH";
        if (tillBranch !== branchFilter) return false;
      }
      if (departmentFilter !== "ALL") {
        const tillDept = till.department_id || (till as any).departmentId;
        if (tillDept !== departmentFilter) return false;
      }
      if (employeeFilter !== "ALL") {
        if (
          till.assigned_teller_id !== employeeFilter &&
          till.assigned_teller_name !== employeeFilter
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const matchesName = (till.name || "").toLowerCase().includes(queryLower);
        const matchesId = (till.id || "").toLowerCase().includes(queryLower);
        const matchesTeller = (till.assigned_teller_name || "").toLowerCase().includes(queryLower);
        const matchesTellerId = (till.assigned_teller_id || "").toLowerCase().includes(queryLower);
        const assignedEmp = companyEmployees.find(
          (e) => e.id === till.assigned_teller_id || e.name === till.assigned_teller_name
        );
        const matchesRole = (assignedEmp?.role || "").toLowerCase().includes(queryLower);
        const matchesCurrency = till.currency.toLowerCase().includes(queryLower);
        return matchesName || matchesId || matchesTeller || matchesTellerId || matchesRole || matchesCurrency;
      }
      return true;
    });
  }, [tills, currencyFilter, statusFilter, branchFilter, departmentFilter, employeeFilter, searchQuery, companyEmployees]);

  // Filtered Safes (by code/number, name, manager, branch, department, currency)
  const filteredSafes = useMemo(() => {
    return safes.filter((safe) => {
      if (currencyFilter !== "ALL" && safe.currency !== currencyFilter) {
        return false;
      }
      if (branchFilter !== "ALL") {
        const safeBranch = safe.branch_id || (safe as any).branchId || "MAIN_BRANCH";
        if (safeBranch !== branchFilter) return false;
      }
      if (departmentFilter !== "ALL") {
        const safeDept = safe.department_id || (safe as any).departmentId;
        if (safeDept !== departmentFilter) return false;
      }
      if (employeeFilter !== "ALL") {
        if (
          safe.manager_id !== employeeFilter &&
          safe.manager_name !== employeeFilter
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const matchesName = (safe.name || "").toLowerCase().includes(queryLower);
        const matchesId = (safe.id || "").toLowerCase().includes(queryLower);
        const matchesManager = (safe.manager_name || "").toLowerCase().includes(queryLower);
        const matchesCurrency = safe.currency.toLowerCase().includes(queryLower);
        return matchesName || matchesId || matchesManager || matchesCurrency;
      }
      return true;
    });
  }, [safes, currencyFilter, branchFilter, departmentFilter, employeeFilter, searchQuery]);

  // Reset pagination when search query, filters, or page size changes
  useEffect(() => {
    setTillsPage(1);
    setSafesPage(1);
  }, [searchQuery, currencyFilter, statusFilter, branchFilter, departmentFilter, employeeFilter, pageSize]);

  // Paginated Tills
  const totalTillsPages = Math.max(1, Math.ceil(filteredTills.length / pageSize));
  const paginatedTills = useMemo(() => {
    const start = (tillsPage - 1) * pageSize;
    return filteredTills.slice(start, start + pageSize);
  }, [filteredTills, tillsPage, pageSize]);

  // Paginated Safes
  const totalSafesPages = Math.max(1, Math.ceil(filteredSafes.length / pageSize));
  const paginatedSafes = useMemo(() => {
    const start = (safesPage - 1) * pageSize;
    return filteredSafes.slice(start, start + pageSize);
  }, [filteredSafes, safesPage, pageSize]);

  // Modals state
  const [selectedTillForSession, setSelectedTillForSession] = useState<CashTill | null>(null);
  const [selectedTillForTransaction, setSelectedTillForTransaction] = useState<CashTill | null>(null);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [isFundSafeOpen, setIsFundSafeOpen] = useState(false);
  const [preselectedSafeForFunding, setPreselectedSafeForFunding] = useState<BranchSafe | null>(null);
  const [isTransferPayoutOpen, setIsTransferPayoutOpen] = useState(false);
  const [selectedTillForPayout, setSelectedTillForPayout] = useState<CashTill | null>(null);

  // Reassignment state
  const [reassigningTill, setReassigningTill] = useState<CashTill | null>(null);
  const [selectedReassignTellerId, setSelectedReassignTellerId] = useState<string>("");

  // Creation dialogs
  const [isCreateTillOpen, setIsCreateTillOpen] = useState(false);
  const [tillName, setTillName] = useState("");
  const [tillCurrency, setTillCurrency] = useState<CurrencyCode>("HTG");
  const [selectedTellerId, setSelectedTellerId] = useState<string>("");
  const [tillTellerName, setTillTellerName] = useState("");
  const [selectedTillBranchId, setSelectedTillBranchId] = useState<string>("");
  const [selectedTillDeptId, setSelectedTillDeptId] = useState<string>("");
  const [isSavingTill, setIsSavingTill] = useState(false);

  // Cashier eligibility computed via EmployeeCashEligibilityService
  const eligibleEmployeesForCreateTill = useMemo(() => {
    return EmployeeCashEligibilityService.filterEligibleTellers({
      employees: companyEmployees,
      businessId,
      currency: tillCurrency,
      existingTills: tills
    });
  }, [companyEmployees, businessId, tillCurrency, tills]);

  const eligibleEmployeesForReassign = useMemo(() => {
    if (!reassigningTill) return [];
    return EmployeeCashEligibilityService.filterEligibleTellers({
      employees: companyEmployees,
      businessId,
      currency: reassigningTill.currency,
      existingTills: tills,
      excludeTillId: reassigningTill.id
    });
  }, [companyEmployees, businessId, reassigningTill, tills]);

  // Option lists formatted for SearchableSelect
  const employeeFilterOptions = useMemo(() => {
    return [
      { id: "ALL", name: `Tous les Responsables (${companyEmployees.length})` },
      ...companyEmployees.map((e) => ({
        id: e.id,
        name: `${e.name || e.displayName} — ${e.role || "Employé"}`
      }))
    ];
  }, [companyEmployees]);

  const branchFilterOptions = useMemo(() => {
    return [
      { id: "ALL", name: `Toutes les Succursales (${companyBranches.length || 1})` },
      ...companyBranches.map((b) => ({
        id: b.id,
        name: `${b.name} (${b.code || b.id})`
      }))
    ];
  }, [companyBranches]);

  const departmentFilterOptions = useMemo(() => {
    return [
      { id: "ALL", name: `Tous les Départements (${companyDepartments.length})` },
      ...companyDepartments.map((d) => ({
        id: d.id,
        name: `${d.name} (${d.code || d.id})`
      }))
    ];
  }, [companyDepartments]);

  const eligibleTellerOptions = useMemo(() => {
    return eligibleEmployeesForCreateTill.map((e) => ({
      id: e.id,
      name: `${e.name || e.displayName} — ${e.role || e.position || "Employé"} (${e.departmentName || e.departmentId || "Guichet"}) [Éligible RH]`
    }));
  }, [eligibleEmployeesForCreateTill]);

  const eligibleReassignOptions = useMemo(() => {
    return eligibleEmployeesForReassign.map((e) => ({
      id: e.id,
      name: `${e.name || e.displayName} — ${e.role || e.position || "Employé"} (${e.departmentName || e.departmentId || "Guichet"}) [Éligible RH]`
    }));
  }, [eligibleEmployeesForReassign]);

  const companyEmployeeOptions = useMemo(() => {
    return companyEmployees.map((e) => ({
      id: e.id,
      name: `${e.name || e.displayName} — ${e.role || "Employé"}`
    }));
  }, [companyEmployees]);

  const [editingTill, setEditingTill] = useState<CashTill | null>(null);
  const [editTillName, setEditTillName] = useState("");
  const [editTillBranchId, setEditTillBranchId] = useState("");
  const [editTillDeptId, setEditTillDeptId] = useState("");
  const [editTillTellerId, setEditTillTellerId] = useState("");
  const [editTillStatus, setEditTillStatus] = useState<"OPEN" | "CLOSED" | "LOCKED">("CLOSED");
  const [isUpdatingTill, setIsUpdatingTill] = useState(false);

  const eligibleTellerOptionsForEditTill = useMemo(() => {
    if (!editingTill) return [];
    const eligible = EmployeeCashEligibilityService.filterEligibleTellers({
      employees: companyEmployees,
      businessId,
      currency: editingTill.currency,
      existingTills: tills,
      excludeTillId: editingTill.id
    });
    return eligible.map((e) => ({
      id: e.id,
      name: `${e.name || e.displayName} — ${e.role || "TELLER"} [Éligible RH]`
    }));
  }, [companyEmployees, businessId, editingTill, tills]);

  const companyEmployeeNameOptions = useMemo(() => {
    return companyEmployees.map((e) => ({
      id: e.name || e.displayName || e.id,
      name: `${e.name || e.displayName} — ${e.role || "Manager / Chef Caissier"}`
    }));
  }, [companyEmployees]);

  const createBranchOptions = useMemo(() => {
    if (companyBranches.length === 0) {
      return [{ id: branchId, name: `Succursale Principale (${branchId})` }];
    }
    return companyBranches.map((b) => ({
      id: b.id,
      name: `${b.name} (${b.code || b.id})`
    }));
  }, [companyBranches, branchId]);

  const createDeptOptions = useMemo(() => {
    return companyDepartments.map((d) => ({
      id: d.id,
      name: `${d.name} (${d.code || d.id})`
    }));
  }, [companyDepartments]);

  const [isCreateSafeOpen, setIsCreateSafeOpen] = useState(false);
  const [safeName, setSafeName] = useState("");
  const [safeCurrency, setSafeCurrency] = useState<CurrencyCode>("HTG");
  const [safeManagerName, setSafeManagerName] = useState("");
  const [selectedSafeBranchId, setSelectedSafeBranchId] = useState<string>("");
  const [selectedSafeDeptId, setSelectedSafeDeptId] = useState<string>("");
  const [safeMinLimit, setSafeMinLimit] = useState(50000);
  const [safeMaxLimit, setSafeMaxLimit] = useState(5000000);
  const [isSavingSafe, setIsSavingSafe] = useState(false);

  // Edit & Suspend Till modal state (initialized above for eligibleTellerOptionsForEditTill)

  // Edit & Suspend Safe modal state
  const [editingSafe, setEditingSafe] = useState<BranchSafe | null>(null);
  const [editSafeName, setEditSafeName] = useState("");
  const [editSafeBranchId, setEditSafeBranchId] = useState("");
  const [editSafeDeptId, setEditSafeDeptId] = useState("");
  const [editSafeManagerName, setEditSafeManagerName] = useState("");
  const [editSafeMinLimit, setEditSafeMinLimit] = useState(50000);
  const [editSafeMaxLimit, setEditSafeMaxLimit] = useState(5000000);
  const [editSafeStatus, setEditSafeStatus] = useState<"ACTIVE" | "LOCKED" | "SUSPENDED">("ACTIVE");
  const [isUpdatingSafe, setIsUpdatingSafe] = useState(false);

  // Open Edit Till Modal
  const handleOpenEditTill = (till: CashTill) => {
    setEditingTill(till);
    setEditTillName(till.name);
    setEditTillBranchId(till.branch_id || branchId);
    setEditTillDeptId(till.department_id || "");
    setEditTillTellerId(till.assigned_teller_id || "");
    setEditTillStatus(till.status === "LOCKED" ? "LOCKED" : till.status === "OPEN" ? "OPEN" : "CLOSED");
  };

  // Save Edit Till
  const handleSaveEditTill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTill) return;
    if (!editTillName.trim()) {
      toast.error("Veuillez saisir un libellé pour la caisse.");
      return;
    }
    const assignedEmp = companyEmployees.find((e) => e.id === editTillTellerId);
    if (assignedEmp) {
      const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment({
        employee: assignedEmp,
        businessId,
        currency: editingTill.currency,
        existingTills: tills,
        excludeTillId: editingTill.id
      });
      if (!eligibility.isEligible) {
        toast.error(eligibility.reason || "Seul un caissier au profil 'teller' peut être assigné à une caisse.");
        return;
      }
    }
    const selectedBranch = companyBranches.find((b) => b.id === editTillBranchId);
    const selectedDept = companyDepartments.find((d) => d.id === editTillDeptId);

    setIsUpdatingTill(true);
    try {
      const updatedTill: CashTill = {
        ...editingTill,
        name: editTillName.trim(),
        branch_id: editTillBranchId || editingTill.branch_id,
        branch_name: selectedBranch?.name || editingTill.branch_name,
        department_id: editTillDeptId || editingTill.department_id,
        department_name: selectedDept?.name || editingTill.department_name,
        assigned_teller_id: assignedEmp?.id || editingTill.assigned_teller_id,
        assigned_teller_name: assignedEmp ? (assignedEmp.name || assignedEmp.displayName) : editingTill.assigned_teller_name,
        status: editTillStatus,
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(updatedTill);
      toast.success(`Caisse "${updatedTill.name}" mise à jour avec succès.`);
      setEditingTill(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la modification de la caisse.");
    } finally {
      setIsUpdatingTill(false);
    }
  };

  // Quick Suspend / Reactivate Till
  const handleToggleTillSuspension = async (till: CashTill) => {
    const newStatus = till.status === "LOCKED" ? "CLOSED" : "LOCKED";
    const actionLabel = newStatus === "LOCKED" ? "suspendue / verrouillée" : "réactivée";
    try {
      const updated = { ...till, status: newStatus as any, updated_at: new Date().toISOString() };
      await CashManagementRepository.saveTill(updated);
      toast.success(`Caisse "${till.name}" ${actionLabel}.`);
      await loadData();
    } catch (err: any) {
      toast.error(`Erreur lors de la modification du statut de la caisse.`);
    }
  };

  // Open Edit Safe Modal
  const handleOpenEditSafe = (safe: BranchSafe) => {
    setEditingSafe(safe);
    setEditSafeName(safe.name);
    setEditSafeBranchId(safe.branch_id || branchId);
    setEditSafeDeptId(safe.department_id || "");
    setEditSafeManagerName(safe.manager_name || "");
    setEditSafeMinLimit(safe.min_limit_cents ? safe.min_limit_cents / 100 : 50000);
    setEditSafeMaxLimit(safe.max_limit_cents ? safe.max_limit_cents / 100 : 5000000);
    setEditSafeStatus(safe.status || "ACTIVE");
  };

  // Save Edit Safe
  const handleSaveEditSafe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSafe) return;
    if (!editSafeName.trim()) {
      toast.error("Veuillez saisir un libellé pour le coffre-fort.");
      return;
    }
    const selectedBranch = companyBranches.find((b) => b.id === editSafeBranchId);
    const selectedDept = companyDepartments.find((d) => d.id === editSafeDeptId);

    setIsUpdatingSafe(true);
    try {
      const updatedSafe: BranchSafe = {
        ...editingSafe,
        name: editSafeName.trim(),
        branch_id: editSafeBranchId || editingSafe.branch_id,
        branch_name: selectedBranch?.name || editingSafe.branch_name,
        department_id: editSafeDeptId || editingSafe.department_id,
        department_name: selectedDept?.name || editingSafe.department_name,
        manager_name: editSafeManagerName.trim() || editingSafe.manager_name,
        min_limit_cents: editSafeMinLimit * 100,
        max_limit_cents: editSafeMaxLimit * 100,
        status: editSafeStatus,
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveSafe(updatedSafe);
      toast.success(`Coffre-fort "${updatedSafe.name}" mis à jour avec succès.`);
      setEditingSafe(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la modification du coffre-fort.");
    } finally {
      setIsUpdatingSafe(false);
    }
  };

  // Quick Suspend / Reactivate Safe
  const handleToggleSafeSuspension = async (safe: BranchSafe) => {
    const newStatus = (safe.status === "LOCKED" || safe.status === "SUSPENDED") ? "ACTIVE" : "LOCKED";
    const actionLabel = newStatus === "LOCKED" ? "suspendu / verrouillé" : "réactivé";
    try {
      const updated = { ...safe, status: newStatus as any, updated_at: new Date().toISOString() };
      await CashManagementRepository.saveSafe(updated);
      toast.success(`Coffre-fort "${safe.name}" ${actionLabel}.`);
      await loadData();
    } catch (err: any) {
      toast.error(`Erreur lors de la modification du statut du coffre-fort.`);
    }
  };

  // Helper to automatically generate standardized Till Code (e.g. TILL-HTG-001)
  const generateAutomaticTillCode = useCallback(
    (curr: CurrencyCode, empName?: string) => {
      const existingInCurr = tills.filter((t) => t.currency === curr);
      const nextIndex = existingInCurr.length + 1;
      const baseCode = `TILL-${curr}-${String(nextIndex).padStart(3, "0")}`;
      if (empName && empName.trim()) {
        return `${baseCode} - ${empName.trim()}`;
      }
      return baseCode;
    },
    [tills]
  );

  const handleOpenCreateTill = () => {
    const defaultEmp = eligibleEmployeesForCreateTill.length > 0 ? eligibleEmployeesForCreateTill[0] : null;
    const empId = defaultEmp?.id || "";
    const empName = defaultEmp ? (defaultEmp.name || defaultEmp.displayName || "") : "";
    setSelectedTellerId(empId);
    setTillTellerName(empName);
    setSelectedTillBranchId(defaultEmp?.branchId || defaultEmp?.branch_id || branchId);
    setSelectedTillDeptId(defaultEmp?.departmentId || defaultEmp?.department_id || (companyDepartments[0]?.id || ""));
    setTillName(generateAutomaticTillCode(tillCurrency, empName));
    setIsCreateTillOpen(true);
  };

  // Helper to automatically generate standardized Safe Code (e.g. SAFE-HTG-01)
  const generateAutomaticSafeCode = useCallback(
    (curr: CurrencyCode) => {
      const existingInCurr = safes.filter((s) => s.currency === curr);
      const nextIndex = existingInCurr.length + 1;
      return `SAFE-${curr}-${String(nextIndex).padStart(2, "0")} (Coffre-Fort ${curr})`;
    },
    [safes]
  );

  const handleOpenCreateSafe = () => {
    setSelectedSafeBranchId(companyBranches[0]?.id || branchId);
    setSelectedSafeDeptId(companyDepartments[0]?.id || "");
    setSafeName(generateAutomaticSafeCode(safeCurrency));
    setIsCreateSafeOpen(true);
  };

  const handleOpenFundSafe = (safe?: BranchSafe) => {
    setPreselectedSafeForFunding(safe || null);
    setIsFundSafeOpen(true);
  };

  // Synchronize company employees, branches, and departments from Firestore and props
  useEffect(() => {
    let isMounted = true;
    const fetchCompanyMetadata = async () => {
      try {
        const [firestoreList, branchesList, departmentsList] = await Promise.all([
          EmployeeRepository.listAll(businessId),
          WorkspaceRepository.getBranches(businessId),
          WorkspaceRepository.getDepartments(businessId)
        ]);
        if (isMounted) {
          let merged = [...employees];
          if (firestoreList && firestoreList.length > 0) {
            const existingIds = new Set(merged.map((e) => e.id));
            for (const fe of firestoreList) {
              if (!existingIds.has(fe.id)) {
                merged.push(fe);
                existingIds.add(fe.id);
              }
            }
          }
          setCompanyEmployees(merged);
          if (branchesList && branchesList.length > 0) {
            setCompanyBranches(branchesList as Branch[]);
          }
          if (departmentsList && departmentsList.length > 0) {
            setCompanyDepartments(departmentsList as Department[]);
          }
        }
      } catch (err) {
        console.error("Could not load company metadata for cash console:", err);
      }
    };
    fetchCompanyMetadata();
    return () => {
      isMounted = false;
    };
  }, [businessId, employees]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let [tillsData, safesData, sessionsData, transfersData] = await Promise.all([
        CashManagementRepository.getTillsByBusiness(businessId),
        CashManagementRepository.getSafesByBusiness(businessId),
        CashManagementRepository.getSessionsByBusiness(businessId),
        CashManagementRepository.getTransfersByBusiness(businessId)
      ]);

      // If no tills found in Firestore and caller is an authorized supervisor/admin,
      // invoke controlled server-side till auto-provisioning.
      const normalizedUserRole = (currentUser?.role || "").trim().toUpperCase();
      const canAutoProvisionTills = [
        "OWNER",
        "ADMIN",
        "MANAGER",
        "HEAD_TELLER",
        "MASTER_HEAD_TELLER",
        "SUPER_ADMIN"
      ].includes(normalizedUserRole);

      if (tillsData.length === 0 && canAutoProvisionTills) {
        try {
          const autoResult = await CashManagementRepository.autoProvisionTillsForBusiness(
            businessId,
            branchId,
            employees
          );
          if (autoResult.tills.length > 0) {
            tillsData = autoResult.tills;
            safesData = autoResult.safes;
          }
        } catch (autoErr) {
          console.warn("Auto-provision on initial load skipped:", autoErr);
        }
      }

      setTills(tillsData);
      setSafes(safesData);
      setSessions(sessionsData);
      setTransfers(transfersData);
    } catch (err) {
      console.error("Error loading cash console data", err);
      toast.error("Erreur de chargement des caisses et coffres.");
    } finally {
      setIsLoading(false);
    }
  }, [businessId, branchId, employees, currentUser?.role]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAutoGenerateTills = async () => {
    setIsAutoGenerating(true);
    try {
      const result = await CashManagementRepository.autoProvisionTillsForBusiness(
        businessId,
        branchId,
        companyEmployees
      );
      toast.success(
        `Génération & assignation réussie : ${result.tillsCreated} caisse(s) créée(s) (${result.existingTillsCount ?? 0} existante(s) préservée(s)), ${result.safesCreated} coffre(s) créé(s).`
      );
      await loadData();
    } catch (err: any) {
      console.error("Error auto-generating tills:", err);
      toast.error(err.message || "Erreur lors de la génération automatique des caisses.");
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleReassignTeller = async () => {
    if (!reassigningTill || !selectedReassignTellerId) return;
    const emp = companyEmployees.find((e) => e.id === selectedReassignTellerId);
    if (!emp) return;
    try {
      await CashManagementRepository.assignTillTeller(
        reassigningTill.id,
        emp.id,
        emp.name || emp.displayName || "Employé"
      );
      toast.success(`Caisse "${reassigningTill.name}" assignée à ${emp.name || emp.displayName}.`);
      setReassigningTill(null);
      setSelectedReassignTellerId("");
      await loadData();
    } catch (err: any) {
      toast.error("Erreur lors de la réassignation de la caisse.");
    }
  };

  const handleCreateTill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tillName.trim()) {
      toast.error("Veuillez saisir un code / libellé pour la caisse.");
      return;
    }
    if (!selectedTellerId) {
      toast.error("La caisse doit être obligatoirement assignée à un utilisateur existant dans l'entreprise.");
      return;
    }
    const assignedEmployee = companyEmployees.find((emp) => emp.id === selectedTellerId);
    if (!assignedEmployee) {
      toast.error("L'utilisateur sélectionné n'existe pas dans le registre de l'entreprise.");
      return;
    }
    const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment({
      employee: assignedEmployee,
      businessId,
      currency: tillCurrency,
      existingTills: tills
    });
    if (!eligibility.isEligible) {
      toast.error(eligibility.reason || "Seul un rôle caissier au profil 'teller' peut recevoir une caisse.");
      return;
    }
    const assignedName = assignedEmployee.name || assignedEmployee.displayName || `Employé ${assignedEmployee.id}`;
    const selectedBranch = companyBranches.find((b) => b.id === selectedTillBranchId);
    const selectedDept = companyDepartments.find((d) => d.id === selectedTillDeptId);

    setIsSavingTill(true);
    try {
      const newTill: CashTill = {
        id: `till_${businessId}_${Date.now()}`,
        business_id: businessId,
        branch_id: selectedTillBranchId || assignedEmployee.branchId || assignedEmployee.branch_id || branchId,
        branch_name: selectedBranch?.name,
        department_id: selectedTillDeptId || assignedEmployee.departmentId || assignedEmployee.department_id,
        department_name: selectedDept?.name,
        name: tillName.trim(),
        currency: tillCurrency,
        assigned_teller_id: assignedEmployee.id,
        assigned_teller_name: assignedName,
        balance_cents: 0,
        status: "CLOSED",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveTill(newTill);
      toast.success(`Caisse "${newTill.name}" créée et assignée à ${assignedName}.`);
      setIsCreateTillOpen(false);
      setTillName("");
      setSelectedTellerId("");
      setTillTellerName("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création de la caisse.");
    } finally {
      setIsSavingTill(false);
    }
  };

  const handleCreateSafe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!safeName.trim()) {
      toast.error("Veuillez saisir un libellé pour le coffre-fort.");
      return;
    }
    const selectedBranch = companyBranches.find((b) => b.id === selectedSafeBranchId);
    const selectedDept = companyDepartments.find((d) => d.id === selectedSafeDeptId);

    setIsSavingSafe(true);
    try {
      const newSafe: BranchSafe = {
        id: `safe_${businessId}_${Date.now()}`,
        business_id: businessId,
        branch_id: selectedSafeBranchId || branchId,
        branch_name: selectedBranch?.name,
        department_id: selectedSafeDeptId,
        department_name: selectedDept?.name,
        name: safeName.trim(),
        currency: safeCurrency,
        manager_name: safeManagerName.trim() || currentUser.name || "Manager",
        balance_cents: 0,
        min_limit_cents: safeMinLimit * 100,
        max_limit_cents: safeMaxLimit * 100,
        updated_at: new Date().toISOString()
      };
      await CashManagementRepository.saveSafe(newSafe);
      toast.success(`Coffre-fort "${newSafe.name}" créé avec succès.`);
      setIsCreateSafeOpen(false);
      setSafeName("");
      setSafeManagerName("");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la création du coffre.");
    } finally {
      setIsSavingSafe(false);
    }
  };

  // Total cash held in active tills
  const totalTillsHtgCents = tills
    .filter((t) => t.currency === "HTG")
    .reduce((acc, t) => acc + (t.balance_cents || 0), 0);

  const totalTillsUsdCents = tills
    .filter((t) => t.currency === "USD")
    .reduce((acc, t) => acc + (t.balance_cents || 0), 0);

  // Total cash held in safes
  const totalSafesHtgCents = safes
    .filter((s) => s.currency === "HTG")
    .reduce((acc, s) => acc + (s.balance_cents || 0), 0);

  const totalSafesUsdCents = safes
    .filter((s) => s.currency === "USD")
    .reduce((acc, s) => acc + (s.balance_cents || 0), 0);

  return (
    <div className="space-y-6 text-slate-100">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
            <Vault className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              <span>Gestion des Caisses & Coffres (Cash Management)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                Données Réelles Firestore
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Organisation à 3 niveaux : Coffre principal, coffres de succursale, caisses employés & transferts Maker-Checker
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={loadData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700"
            title="Rafraîchir les données en temps réel"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
          </button>

          <button
            onClick={handleAutoGenerateTills}
            disabled={isAutoGenerating}
            className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
            title="Générer automatiquement et assigner les caisses aux employés de l'entreprise"
          >
            <Sparkles className={`w-4 h-4 ${isAutoGenerating ? "animate-spin" : ""}`} />
            <span>{isAutoGenerating ? "Génération..." : "Générer Caisses Employés"}</span>
          </button>

          <button
            onClick={handleOpenCreateTill}
            className="px-3.5 py-2.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Caisse</span>
          </button>

          <button
            onClick={handleOpenCreateSafe}
            className="px-3.5 py-2.5 bg-amber-700/80 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Coffre</span>
          </button>

          <button
            onClick={() => handleOpenFundSafe()}
            className="px-3.5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-amber-900/30 cursor-pointer"
            title="Alimenter un coffre-fort depuis la banque ou virement interne avec écriture Grand Livre"
          >
            <Coins className="w-4 h-4" />
            <span>Alimenter Coffre</span>
          </button>

          <button
            onClick={() => setIsTransferDialogOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Nouveau Transfert</span>
          </button>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab("OPERATIONS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "OPERATIONS"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <Vault className="w-3.5 h-3.5" />
          <span>Sessions Caisses & Coffres</span>
        </button>

        <button
          onClick={() => setActiveTab("CHART_OF_ACCOUNTS")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "CHART_OF_ACCOUNTS"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
          <span>Plan Comptable & Charte des Comptes</span>
        </button>

        <button
          onClick={() => setActiveTab("TRANSACTION_TYPES")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "TRANSACTION_TYPES"
              ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <Building2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Types de Transactions & Imputation</span>
        </button>

        <button
          onClick={() => setActiveTab("EXCHANGE_RATES")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "EXCHANGE_RATES"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          <span>Taux de Change Centraux</span>
        </button>
      </div>

      {activeTab === "CHART_OF_ACCOUNTS" ? (
        <ChartOfAccountsManagement businessId={businessId} currentRole={currentUser.role} />
      ) : activeTab === "TRANSACTION_TYPES" ? (
        <TransactionTypesManagement businessId={businessId} currentRole={currentUser.role} />
      ) : activeTab === "EXCHANGE_RATES" ? (
        <TodayRatesEditor businessId={businessId} currentUser={currentUser} />
      ) : (
        <>
          {/* OVERVIEW CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Liquidités Caisses (HTG)</span>
                <span className="text-[10px] text-emerald-400 font-mono">{tills.filter(t => t.currency === "HTG").length} caisse(s)</span>
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {(totalTillsHtgCents / 100).toLocaleString()} HTG
              </div>
              <p className="text-[10px] text-slate-500">Agrégation Grand Livre en temps réel</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Liquidités Caisses (USD)</span>
                <span className="text-[10px] text-emerald-400 font-mono">{tills.filter(t => t.currency === "USD").length} caisse(s)</span>
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                ${(totalTillsUsdCents / 100).toLocaleString()} USD
              </div>
              <p className="text-[10px] text-slate-500">Agrégation Grand Livre en temps réel</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Réserves Coffres (HTG)</span>
                <span className="text-[10px] text-amber-400 font-mono">{safes.filter(s => s.currency === "HTG").length} coffre(s)</span>
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {(totalSafesHtgCents / 100).toLocaleString()} HTG
              </div>
              <p className="text-[10px] text-slate-500">Niveaux 1 & 2 - Coffres succursale</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Réserves Coffres (USD)</span>
                <span className="text-[10px] text-amber-400 font-mono">{safes.filter(s => s.currency === "USD").length} coffre(s)</span>
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">
                ${(totalSafesUsdCents / 100).toLocaleString()} USD
              </div>
              <p className="text-[10px] text-slate-500">Niveaux 1 & 2 - Coffres devises</p>
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT TWO COLUMNS: DYNAMIC SEARCH, SEPARATION & PAGINATION FOR TILLS & SAFES */}
            <div className="lg:col-span-2 space-y-5">
              {/* TOP CONTROLLER: SEPARATION (CAISSES VS COFFRES) & DYNAMIC FILTERS */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* SUB-VIEW SELECTOR TABS: CAISSES | COFFRES | VUE GLOBALE */}
                  <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 w-full sm:w-auto overflow-x-auto">
                    <button
                      onClick={() => setCashSubView("TILLS")}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center ${
                        cashSubView === "TILLS"
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Caisses Employés</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                        {filteredTills.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setCashSubView("SAFES")}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center ${
                        cashSubView === "SAFES"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
                      }`}
                    >
                      <Vault className="w-3.5 h-3.5 text-amber-400" />
                      <span>Coffres-Forts</span>
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300">
                        {filteredSafes.length}
                      </span>
                    </button>

                    <button
                      onClick={() => setCashSubView("ALL")}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer flex-1 sm:flex-initial justify-center ${
                        cashSubView === "ALL"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      <span>Vue Séparée (Tous)</span>
                    </button>
                  </div>

                  {/* QUICK CREATION ACTIONS */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(cashSubView === "TILLS" || cashSubView === "ALL") && (
                      <button
                        onClick={handleOpenCreateTill}
                        className="px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nouvelle Caisse</span>
                      </button>
                    )}
                    {(cashSubView === "SAFES" || cashSubView === "ALL") && (
                      <button
                        onClick={handleOpenCreateSafe}
                        className="px-3 py-1.5 bg-amber-700/80 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Nouveau Coffre</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* SEARCH AND FILTERS TOOLBAR WITH DROPDOWNS */}
                <div className="space-y-3 pt-3 border-t border-slate-800/80">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* SEARCH FIELD (NUMBER, CODE, NAME, EMPLOYEE) */}
                    <div className="md:col-span-6 relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                          cashSubView === "TILLS"
                            ? "Rechercher par n° de caisse (ex: TILL-HTG-001), nom, employé..."
                            : cashSubView === "SAFES"
                            ? "Rechercher par n° de coffre (ex: SAFE-01), nom, responsable..."
                            : "Rechercher caisse ou coffre, n°, employé..."
                        }
                        className="w-full pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                          title="Effacer la recherche"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* CURRENCY CHIP FILTER */}
                    <div className="md:col-span-3 flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold px-1.5">Devise:</span>
                      {(["ALL", "HTG", "USD"] as const).map((curr) => (
                        <button
                          key={curr}
                          onClick={() => setCurrencyFilter(curr)}
                          className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-mono font-bold transition cursor-pointer text-center ${
                            currencyFilter === curr
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
                          }`}
                        >
                          {curr === "ALL" ? "TOUTES" : curr}
                        </button>
                      ))}
                    </div>

                    {/* STATUS FILTER (ACTIVE/CLOSED) */}
                    <div className="md:col-span-3 flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-semibold px-1.5">Statut:</span>
                      {(["ALL", "OPEN", "CLOSED"] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setStatusFilter(st)}
                          className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-semibold transition cursor-pointer text-center ${
                            statusFilter === st
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent"
                          }`}
                        >
                          {st === "ALL" ? "TOUS" : st === "OPEN" ? "OUVERTE" : "FERMÉE"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ORGANIZATIONAL DROPDOWN SELECTORS: EMPLOYEE, BRANCH, DEPARTMENT */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                    {/* EMPLOYEE / RESPONSABLE DROPDOWN */}
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span>Responsable / Employé</span>
                        </label>
                        {employeeFilter !== "ALL" && (
                          <button
                            onClick={() => setEmployeeFilter("ALL")}
                            className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                            title="Réinitialiser le filtre employé"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        options={employeeFilterOptions}
                        value={employeeFilter}
                        onChange={(val) => setEmployeeFilter(val)}
                        placeholder="Tous les Responsables..."
                      />
                    </div>

                    {/* SUCCURSALE (BRANCH) DROPDOWN */}
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>Succursale</span>
                        </label>
                        {branchFilter !== "ALL" && (
                          <button
                            onClick={() => setBranchFilter("ALL")}
                            className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                            title="Réinitialiser le filtre succursale"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        options={branchFilterOptions}
                        value={branchFilter}
                        onChange={(val) => setBranchFilter(val)}
                        placeholder="Toutes les Succursales..."
                      />
                    </div>

                    {/* DÉPARTEMENT (DEPARTMENT) DROPDOWN */}
                    <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Département</span>
                        </label>
                        {departmentFilter !== "ALL" && (
                          <button
                            onClick={() => setDepartmentFilter("ALL")}
                            className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                            title="Réinitialiser le filtre département"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <SearchableSelect
                        options={departmentFilterOptions}
                        value={departmentFilter}
                        onChange={(val) => setDepartmentFilter(val)}
                        placeholder="Tous les Départements..."
                      />
                    </div>
                  </div>
                </div>

                {/* ACTIVE FILTER SUMMARY & RESET */}
                {(searchQuery || currencyFilter !== "ALL" || statusFilter !== "ALL" || branchFilter !== "ALL" || departmentFilter !== "ALL" || employeeFilter !== "ALL") && (
                  <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-500">Filtres actifs :</span>
                      {searchQuery && (
                        <span className="bg-slate-800 text-cyan-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          Recherche: "{searchQuery}"
                        </span>
                      )}
                      {currencyFilter !== "ALL" && (
                        <span className="bg-slate-800 text-amber-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          Devise: {currencyFilter}
                        </span>
                      )}
                      {statusFilter !== "ALL" && (
                        <span className="bg-slate-800 text-emerald-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          Statut: {statusFilter === "OPEN" ? "Sessions Ouvertes" : "Sessions Fermées"}
                        </span>
                      )}
                      {employeeFilter !== "ALL" && (
                        <span className="bg-slate-800 text-cyan-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          Responsable: {companyEmployees.find((e) => e.id === employeeFilter)?.name || employeeFilter}
                        </span>
                      )}
                      {branchFilter !== "ALL" && (
                        <span className="bg-slate-800 text-emerald-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          Succursale: {companyBranches.find((b) => b.id === branchFilter)?.name || branchFilter}
                        </span>
                      )}
                      {departmentFilter !== "ALL" && (
                        <span className="bg-slate-800 text-amber-300 px-2 py-0.5 rounded-md font-mono text-[10px]">
                          Département: {companyDepartments.find((d) => d.id === departmentFilter)?.name || departmentFilter}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setCurrencyFilter("ALL");
                        setStatusFilter("ALL");
                        setBranchFilter("ALL");
                        setDepartmentFilter("ALL");
                        setEmployeeFilter("ALL");
                      }}
                      className="text-cyan-400 hover:text-cyan-300 text-xs font-medium underline cursor-pointer"
                    >
                      Réinitialiser tous les filtres
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION 1: CAISSES EMPLOYES (NIVEAU 3) */}
              {(cashSubView === "TILLS" || cashSubView === "ALL") && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                      <div>
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          <span>Caisses Employés ({filteredTills.length})</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                            Niveau 3 • Guichet & Ventes
                          </span>
                        </h2>
                      </div>
                    </div>

                    <button
                      onClick={handleOpenCreateTill}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ajouter une Caisse</span>
                    </button>
                  </div>

                  {tills.length === 0 ? (
                    <div className="text-center py-10 px-4 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 space-y-3">
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl w-fit mx-auto">
                        <Users className="w-8 h-8" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-200">Aucune Caisse Active dans la Base</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                          Générez et assignez automatiquement les tiroirs-caisses (HTG & USD) pour l'ensemble des employés actifs présents dans la base de l'entreprise.
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                        <button
                          onClick={handleAutoGenerateTills}
                          disabled={isAutoGenerating}
                          className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className={`w-4 h-4 ${isAutoGenerating ? "animate-spin" : ""}`} />
                          <span>{isAutoGenerating ? "Génération & Assignation..." : "Générer & Assigner Automatiquement"}</span>
                        </button>
                        <button
                          onClick={handleOpenCreateTill}
                          className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Création Manuelle</span>
                        </button>
                      </div>
                    </div>
                  ) : filteredTills.length === 0 ? (
                    <div className="text-center py-10 px-4 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 space-y-3">
                      <div className="p-3 bg-slate-800/60 text-slate-400 rounded-2xl w-fit mx-auto">
                        <Search className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-200">Aucune caisse ne correspond à votre recherche</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                          Aucun tiroir-caisse ne correspond aux critères sélectionnés. Modifiez vos filtres ou le terme recherché.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setCurrencyFilter("ALL");
                          setStatusFilter("ALL");
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Effacer les filtres</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* RESPONSIVE CARDS GRID */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {paginatedTills.map((till) => {
                          const isOpen = till.status === "OPEN";
                          const assignedEmp = companyEmployees.find(
                            (e) => e.id === till.assigned_teller_id || e.name === till.assigned_teller_name
                          );

                          return (
                            <div
                              key={till.id}
                              className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 relative overflow-hidden group hover:border-slate-700 transition"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <h3 className="text-sm font-bold text-white flex items-center gap-2 truncate">
                                    <span className="truncate">{till.name}</span>
                                    <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.2 rounded shrink-0">
                                      {till.currency}
                                    </span>
                                  </h3>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <p className="text-[11px] text-slate-400 truncate">
                                      Affectation :{" "}
                                      <span className="text-slate-200 font-medium">
                                        {till.assigned_teller_name || "Non assigné"}
                                      </span>
                                    </p>
                                    {assignedEmp?.role && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                        {assignedEmp.role}
                                      </span>
                                    )}
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono" title="Succursale rattachée">
                                      {till.branch_name || companyBranches.find((b) => b.id === till.branch_id)?.name || till.branch_id || branchId}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono" title="Département organisationnel">
                                      {till.department_name || companyDepartments.find((d) => d.id === till.department_id)?.name || assignedEmp?.departmentId || "Dépt. Guichet"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <button
                                      onClick={() => handleOpenEditTill(till)}
                                      className="text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                                      title="Modifier le nom, succursale, département et statut de la caisse"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Éditer / Réaffecter</span>
                                    </button>
                                    <span className="text-slate-700 text-[10px]">•</span>
                                    <button
                                      onClick={() => handleToggleTillSuspension(till)}
                                      className={`text-[10px] flex items-center gap-1 cursor-pointer font-medium hover:underline ${
                                        till.status === "LOCKED" ? "text-emerald-400 hover:text-emerald-300" : "text-amber-400 hover:text-amber-300"
                                      }`}
                                      title={till.status === "LOCKED" ? "Réactiver cette caisse" : "Suspendre / verrouiller cette caisse"}
                                    >
                                      {till.status === "LOCKED" ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                                      <span>{till.status === "LOCKED" ? "Réactiver" : "Suspendre"}</span>
                                    </button>
                                  </div>
                                </div>

                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border shrink-0 ${
                                    isOpen
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 flex items-center gap-1"
                                      : till.status === "LOCKED"
                                      ? "bg-red-500/10 text-red-400 border-red-500/20 flex items-center gap-1"
                                      : "bg-slate-800 text-slate-400 border-slate-700"
                                  }`}
                                >
                                  {isOpen && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                                  {till.status === "LOCKED" && <span className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                                  <span>{isOpen ? "SESSION ACTIVE" : till.status === "LOCKED" ? "SUSPENDUE" : "FERMÉE"}</span>
                                </span>
                              </div>

                              <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80">
                                <div className="text-[10px] text-slate-500 font-semibold uppercase">Solde Agrégé Grand Livre</div>
                                <div className="text-lg font-bold font-mono text-emerald-400">
                                  {(till.balance_cents / 100).toLocaleString()} {till.currency}
                                </div>
                              </div>

                              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                                {isOpen && (
                                  <div className="flex-1 flex flex-col gap-2">
                                    <button
                                      onClick={() => setSelectedTillForTransaction(till)}
                                      className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                      <Coins className="w-3.5 h-3.5" />
                                      <span>Opérations Guichet</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedTillForPayout(till);
                                        setIsTransferPayoutOpen(true);
                                      }}
                                      className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                      <Banknote className="w-3.5 h-3.5" />
                                      <span>Payer Transfert</span>
                                    </button>
                                  </div>
                                )}
                                <button
                                  onClick={() => setSelectedTillForSession(till)}
                                  className={`${isOpen ? "flex-1" : "w-full"} py-2 px-3 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2 border cursor-pointer ${
                                    isOpen
                                      ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30"
                                      : "bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                                  }`}
                                >
                                  {isOpen ? (
                                    <>
                                      <Lock className="w-3.5 h-3.5" />
                                      <span>Contrôle & Clôture</span>
                                    </>
                                  ) : (
                                    <>
                                      <Unlock className="w-3.5 h-3.5" />
                                      <span>Ouvrir une Session</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* RESPONSIVE PAGINATION BAR FOR CAISSES */}
                      {filteredTills.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800/80 text-xs">
                          <div className="text-slate-400 text-[11px]">
                            Affichage de <span className="text-white font-mono font-medium">{(tillsPage - 1) * pageSize + 1}</span> à{" "}
                            <span className="text-white font-mono font-medium">
                              {Math.min(tillsPage * pageSize, filteredTills.length)}
                            </span>{" "}
                            sur <span className="text-emerald-400 font-mono font-bold">{filteredTills.length}</span> caisse(s)
                          </div>

                          <div className="flex items-center gap-3">
                            {/* ITEMS PER PAGE */}
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <span>Par page:</span>
                              <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
                              >
                                <option value={4}>4</option>
                                <option value={6}>6</option>
                                <option value={12}>12</option>
                                <option value={24}>24</option>
                              </select>
                            </div>

                            {/* PREV / NEXT & NUMBERS */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setTillsPage((p) => Math.max(1, p - 1))}
                                disabled={tillsPage === 1}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Page précédente"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>

                              {Array.from({ length: totalTillsPages }, (_, i) => i + 1).map((pageNum) => (
                                <button
                                  key={pageNum}
                                  onClick={() => setTillsPage(pageNum)}
                                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center justify-center ${
                                    tillsPage === pageNum
                                      ? "bg-emerald-600 text-white shadow-sm"
                                      : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              ))}

                              <button
                                onClick={() => setTillsPage((p) => Math.min(totalTillsPages, p + 1))}
                                disabled={tillsPage === totalTillsPages}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Page suivante"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* SECTION 2: COFFRES-FORTS (NIVEAUX 1 & 2) */}
              {(cashSubView === "SAFES" || cashSubView === "ALL") && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Vault className="w-5 h-5 text-amber-400" />
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span>Coffres-Forts ({filteredSafes.length})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                          Niveaux 1 & 2 • Réserves & Distribution
                        </span>
                      </h2>
                    </div>

                    <button
                      onClick={() => setIsCreateSafeOpen(true)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Ajouter un Coffre</span>
                    </button>
                  </div>

                  {safes.length === 0 ? (
                    <div className="text-center py-8 px-4 bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
                      <Vault className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <h3 className="text-xs font-bold text-slate-300">Aucun Coffre-Fort Enregistré</h3>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                        Configurez un coffre principal (Niveau 1) ou de succursale (Niveau 2) pour sécuriser vos transferts et approvisionnements.
                      </p>
                      <button
                        onClick={() => setIsCreateSafeOpen(true)}
                        className="mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Créer un Coffre</span>
                      </button>
                    </div>
                  ) : filteredSafes.length === 0 ? (
                    <div className="text-center py-10 px-4 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 space-y-3">
                      <div className="p-3 bg-slate-800/60 text-slate-400 rounded-2xl w-fit mx-auto">
                        <Search className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-200">Aucun coffre ne correspond à votre recherche</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                          Aucun coffre-fort ne correspond aux critères recherchés. Modifiez vos filtres.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setCurrencyFilter("ALL");
                        }}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Effacer les filtres</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* RESPONSIVE CARDS GRID */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {paginatedSafes.map((safe, idx) => {
                          const isMainVault = idx === 0 || safe.name.toLowerCase().includes("principal");
                          const capacityPct = Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round(
                                ((safe.balance_cents || 0) / (safe.max_limit_cents || 500000000)) * 100
                              )
                            )
                          );

                          return (
                            <div key={safe.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-sm font-bold text-white truncate">{safe.name}</h3>
                                    <span
                                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border shrink-0 ${
                                        isMainVault
                                          ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                                          : "bg-blue-500/10 text-blue-300 border-blue-500/20"
                                      }`}
                                    >
                                      {isMainVault ? "Niveau 1: Principal" : "Niveau 2: Succursale"}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5 truncate flex items-center gap-1.5 flex-wrap">
                                    <span>Responsable : <span className="text-slate-200 font-medium">{safe.manager_name || "Manager / Head Teller"}</span></span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono" title="Succursale rattachée">
                                      {safe.branch_name || companyBranches.find((b) => b.id === safe.branch_id)?.name || safe.branch_id || branchId}
                                    </span>
                                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono" title="Département organisationnel">
                                      {safe.department_name || companyDepartments.find((d) => d.id === safe.department_id)?.name || safe.department_id || "Dépt. Trésorerie"}
                                    </span>
                                  </p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <button
                                      onClick={() => handleOpenEditSafe(safe)}
                                      className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                                      title="Modifier les plafonds, responsables, succursale, département du coffre"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Éditer / Modifier</span>
                                    </button>
                                    <span className="text-slate-700 text-[10px]">•</span>
                                    <button
                                      onClick={() => handleToggleSafeSuspension(safe)}
                                      className={`text-[10px] flex items-center gap-1 cursor-pointer font-medium hover:underline ${
                                        (safe.status === "LOCKED" || safe.status === "SUSPENDED") ? "text-emerald-400 hover:text-emerald-300" : "text-amber-400 hover:text-amber-300"
                                      }`}
                                      title={(safe.status === "LOCKED" || safe.status === "SUSPENDED") ? "Réactiver ce coffre-fort" : "Suspendre / verrouiller ce coffre-fort"}
                                    >
                                      {(safe.status === "LOCKED" || safe.status === "SUSPENDED") ? <PlayCircle className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                                      <span>{(safe.status === "LOCKED" || safe.status === "SUSPENDED") ? "Réactiver" : "Suspendre"}</span>
                                    </button>
                                    {(safe.status === "LOCKED" || safe.status === "SUSPENDED") && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-bold uppercase shrink-0">
                                        SUSPENDU
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0">
                                  {safe.currency}
                                </span>
                              </div>

                              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-slate-500 font-semibold uppercase">Réserve En Coffre</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{capacityPct}% utilisé</span>
                                </div>
                                <div className="text-xl font-bold font-mono text-amber-400">
                                  {(safe.balance_cents / 100).toLocaleString()} {safe.currency}
                                </div>
                                {/* CAPACITY BAR */}
                                <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      capacityPct > 85 ? "bg-red-400" : capacityPct > 60 ? "bg-amber-400" : "bg-emerald-400"
                                    }`}
                                    style={{ width: `${capacityPct}%` }}
                                  />
                                </div>
                              </div>

                              <div className="text-[10px] text-slate-500 flex justify-between font-mono">
                                <span>Min : {((safe.min_limit_cents || 0) / 100).toLocaleString()} {safe.currency}</span>
                                <span>Max : {((safe.max_limit_cents || 0) / 100).toLocaleString()} {safe.currency}</span>
                              </div>

                              <div className="pt-1">
                                <button
                                  onClick={() => handleOpenFundSafe(safe)}
                                  className="w-full py-2 px-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer"
                                  title="Alimenter ce coffre-fort depuis la banque ou virement interne"
                                >
                                  <Coins className="w-3.5 h-3.5" />
                                  <span>Alimenter le Coffre (Banque / GL)</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* RESPONSIVE PAGINATION BAR FOR COFFRES */}
                      {filteredSafes.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800/80 text-xs">
                          <div className="text-slate-400 text-[11px]">
                            Affichage de <span className="text-white font-mono font-medium">{(safesPage - 1) * pageSize + 1}</span> à{" "}
                            <span className="text-white font-mono font-medium">
                              {Math.min(safesPage * pageSize, filteredSafes.length)}
                            </span>{" "}
                            sur <span className="text-amber-400 font-mono font-bold">{filteredSafes.length}</span> coffre(s)
                          </div>

                          <div className="flex items-center gap-3">
                            {/* ITEMS PER PAGE */}
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <span>Par page:</span>
                              <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer"
                              >
                                <option value={4}>4</option>
                                <option value={6}>6</option>
                                <option value={12}>12</option>
                              </select>
                            </div>

                            {/* PREV / NEXT & NUMBERS */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setSafesPage((p) => Math.max(1, p - 1))}
                                disabled={safesPage === 1}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Page précédente"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>

                              {Array.from({ length: totalSafesPages }, (_, i) => i + 1).map((pageNum) => (
                                <button
                                  key={pageNum}
                                  onClick={() => setSafesPage(pageNum)}
                                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition cursor-pointer flex items-center justify-center ${
                                    safesPage === pageNum
                                      ? "bg-amber-600 text-white shadow-sm"
                                      : "bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              ))}

                              <button
                                onClick={() => setSafesPage((p) => Math.min(totalSafesPages, p + 1))}
                                disabled={safesPage === totalSafesPages}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                                title="Page suivante"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: APPROVAL QUEUE & RECENT TRANSFERS */}
            <div className="space-y-6">
              <ApprovalQueueWidget
                transfers={transfers}
                currentUser={currentUser}
                onTransferUpdated={loadData}
              />

              {/* TRANSFERS HISTORY */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Historique Récent des Transferts
                  </h3>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {transfers.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">Aucun transfert enregistré dans la base.</p>
                  ) : (
                    transfers.map((t) => (
                      <div key={t.id} className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{t.source_name} ➔ {t.destination_name}</span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              t.status === "EXECUTED"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : t.status === "REJECTED"
                                ? "bg-red-500/10 text-red-400"
                                : "bg-amber-500/10 text-amber-400"
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 font-mono">
                            {(t.amount_cents / 100).toLocaleString()} {t.currency}
                          </span>
                          <span className="text-slate-500 text-[10px]">
                            {new Date(t.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* MODALS */}
          {selectedTillForSession && (
            <TillSessionModal
              isOpen={Boolean(selectedTillForSession)}
              onClose={() => setSelectedTillForSession(null)}
              till={selectedTillForSession}
              currentSession={sessions.find((s) => s.id === selectedTillForSession.active_session_id)}
              currentUser={currentUser}
              onSessionUpdated={loadData}
            />
          )}

          {selectedTillForTransaction && (
            <TellerTransactionModal
              isOpen={Boolean(selectedTillForTransaction)}
              onClose={() => setSelectedTillForTransaction(null)}
              till={selectedTillForTransaction}
              currentSession={sessions.find((s) => s.id === selectedTillForTransaction.active_session_id)}
              currentUser={currentUser}
              onTransactionSuccess={loadData}
            />
          )}

          {isTransferPayoutOpen && selectedTillForPayout && (
            <TransferPayoutDialog
              isOpen={isTransferPayoutOpen}
              onClose={() => {
                setIsTransferPayoutOpen(false);
                setSelectedTillForPayout(null);
              }}
              till={selectedTillForPayout}
              businessId={businessId}
              branchId={branchId}
              operatorId={currentUser.id}
              operatorName={currentUser.name}
              onSuccess={loadData}
            />
          )}

          {isTransferDialogOpen && (
            <InternalTransferDialog
              isOpen={isTransferDialogOpen}
              onClose={() => setIsTransferDialogOpen(false)}
              businessId={businessId}
              branchId={branchId}
              tills={tills}
              safes={safes}
              currentUser={currentUser}
              onTransferCreated={loadData}
            />
          )}

          {/* CREATE TILL MODAL */}
          {isCreateTillOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white">Créer une Caisse Employé (Niveau 3)</h3>
                  </div>
                  <button
                    onClick={() => setIsCreateTillOpen(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateTill} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Code & Libellé de Caisse (Généré Automatiquement) *
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setTillName(generateAutomaticTillCode(tillCurrency, tillTellerName))
                        }
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono hover:underline cursor-pointer"
                        title="Régénérer automatiquement le code standardisé (ex: TILL-HTG-001)"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Auto-générer code</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={tillName}
                        onChange={(e) => setTillName(e.target.value)}
                        placeholder={`Ex: TILL-${tillCurrency}-001`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500 pr-24"
                        required
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 pointer-events-none">
                        AUTO
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                      <span>Nomenclature standardisée : TILL-[DEVISE]-[NUMÉRO]</span>
                      <span className="text-emerald-400/80 font-mono">Format Banque FINAYITI</span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Devise Unique (Monodevise Stricte) *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTillCurrency("HTG");
                          setTillName(generateAutomaticTillCode("HTG", tillTellerName));
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          tillCurrency === "HTG"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        Gourdes (HTG)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTillCurrency("USD");
                          setTillName(generateAutomaticTillCode("USD", tillTellerName));
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          tillCurrency === "USD"
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        Dollars (USD)
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Pour opérer en HTG et en USD, configurez deux caisses physiques distinctes.
                    </p>
                  </div>

                  {/* SUCCURSALE & DÉPARTEMENT FOR TILL */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Succursale Rattachée *</span>
                      </label>
                      <SearchableSelect
                        options={createBranchOptions}
                        value={selectedTillBranchId}
                        onChange={(val) => setSelectedTillBranchId(val)}
                        placeholder="Sélectionner succursale..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Département Rattaché *</span>
                      </label>
                      <SearchableSelect
                        options={createDeptOptions}
                        value={selectedTillDeptId}
                        onChange={(val) => setSelectedTillDeptId(val)}
                        placeholder="Sélectionner département..."
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Utilisateur Assigné de l'Entreprise (Obligatoire) *</span>
                      </label>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                        Registre RH Entreprise
                      </span>
                    </div>

                    <div className="mb-2">
                      <SearchableSelect
                        options={eligibleTellerOptions}
                        value={selectedTellerId}
                        onChange={(empId) => {
                          setSelectedTellerId(empId);
                          const emp = companyEmployees.find((item) => item.id === empId);
                          if (emp) {
                            const name = emp.name || emp.displayName || "";
                            setTillTellerName(name);
                            setTillName(generateAutomaticTillCode(tillCurrency, name));
                          } else {
                            setTillTellerName("");
                            setTillName(generateAutomaticTillCode(tillCurrency));
                          }
                        }}
                        placeholder="-- Sélectionner obligatoirement un collaborateur éligible --"
                      />
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={
                          selectedTellerId
                            ? `${tillTellerName} (Matricule: ${selectedTellerId} • Utilisateur Actif Vérifié)`
                            : "Aucun utilisateur sélectionné — Sélection obligatoire dans l'entreprise"
                        }
                        placeholder="Utilisateur vérifié de l'entreprise"
                        className={`w-full bg-slate-950/90 border rounded-xl px-3 py-2 text-xs font-mono pr-28 ${
                          selectedTellerId
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-red-500/40 text-red-400"
                        } focus:outline-none`}
                      />
                      <span
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold px-2 py-0.5 rounded border pointer-events-none ${
                          selectedTellerId
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-red-500/10 text-red-400 border-red-500/20"
                        }`}
                      >
                        {selectedTellerId ? "UTILISATEUR VÉRIFIÉ" : "REQUIS"}
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                      <span>Règle d'exclusivité 1 pour 1 : Imputabilité financière stricte par employé.</span>
                      {selectedTellerId && (
                        <span className="text-emerald-400 font-mono flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Certifié FINOPS RH
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreateTillOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingTill}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingTill ? "Enregistrement..." : "Créer la Caisse"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* CREATE SAFE MODAL */}
          {isCreateSafeOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Vault className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">Créer un Coffre-Fort (Niveau 1 ou 2)</h3>
                  </div>
                  <button
                    onClick={() => setIsCreateSafeOpen(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleCreateSafe} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Code & Nom du Coffre-Fort (Généré Automatiquement) *
                      </label>
                      <button
                        type="button"
                        onClick={() => setSafeName(generateAutomaticSafeCode(safeCurrency))}
                        className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono hover:underline cursor-pointer"
                        title="Régénérer automatiquement le code standardisé (ex: SAFE-HTG-01)"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Auto-générer</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={safeName}
                        onChange={(e) => setSafeName(e.target.value)}
                        placeholder={`Ex: SAFE-${safeCurrency}-01 (Coffre Principal ${safeCurrency})`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500 pr-24"
                        required
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 pointer-events-none">
                        AUTO
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Devise Unique *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSafeCurrency("HTG");
                          setSafeName(generateAutomaticSafeCode("HTG"));
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          safeCurrency === "HTG"
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        Gourdes (HTG)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSafeCurrency("USD");
                          setSafeName(generateAutomaticSafeCode("USD"));
                        }}
                        className={`py-2 rounded-xl text-xs font-bold border transition ${
                          safeCurrency === "USD"
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
                        }`}
                      >
                        Dollars (USD)
                      </button>
                    </div>
                  </div>

                  {/* SUCCURSALE & DÉPARTEMENT FOR SAFE */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Succursale *</span>
                      </label>
                      <SearchableSelect
                        options={createBranchOptions}
                        value={selectedSafeBranchId}
                        onChange={(val) => setSelectedSafeBranchId(val)}
                        placeholder="Sélectionner succursale..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Département *</span>
                      </label>
                      <SearchableSelect
                        options={createDeptOptions}
                        value={selectedSafeDeptId}
                        onChange={(val) => setSelectedSafeDeptId(val)}
                        placeholder="Sélectionner département..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Responsable / Gestionnaire du Coffre (Employé de l'Entreprise)
                    </label>
                    <SearchableSelect
                      options={companyEmployeeNameOptions}
                      value={safeManagerName}
                      onChange={(val) => setSafeManagerName(val)}
                      placeholder="-- Sélectionner le responsable du coffre-fort --"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Plafond Min ({safeCurrency})
                      </label>
                      <input
                        type="number"
                        value={safeMinLimit}
                        onChange={(e) => setSafeMinLimit(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Plafond Max ({safeCurrency})
                      </label>
                      <input
                        type="number"
                        value={safeMaxLimit}
                        onChange={(e) => setSafeMaxLimit(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCreateSafeOpen(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingSafe}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingSafe ? "Enregistrement..." : "Créer le Coffre"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* REASSIGN TILL MODAL */}
          {reassigningTill && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Réassigner le Poste de Caisse</h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {reassigningTill.name} ({reassigningTill.currency})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setReassigningTill(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-xs text-slate-300">
                    Sélectionnez le collaborateur de l'entreprise qui opérera ce tiroir-caisse :
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Collaborateur Enregistré *
                    </label>
                    <SearchableSelect
                      options={eligibleReassignOptions}
                      value={selectedReassignTellerId}
                      onChange={(val) => setSelectedReassignTellerId(val)}
                      placeholder="-- Sélectionner un collaborateur éligible --"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReassigningTill(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleReassignTeller}
                      disabled={!selectedReassignTellerId}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Confirmer l'Affectation</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EDIT TILL MODAL */}
          {editingTill && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-5 h-5 text-cyan-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Modifier / Réaffecter la Caisse</h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {editingTill.id} ({editingTill.currency})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingTill(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditTill} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nom / Code de Caisse *
                    </label>
                    <input
                      type="text"
                      value={editTillName}
                      onChange={(e) => setEditTillName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                      required
                    />
                  </div>

                  {/* RESPONSABLE / CAISSIER TITULAIRE */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Responsable Titulaire (Employé RH) *</span>
                    </label>
                    <SearchableSelect
                      options={eligibleTellerOptionsForEditTill}
                      value={editTillTellerId}
                      onChange={(val) => setEditTillTellerId(val)}
                      placeholder="-- Sélectionner un caissier éligible (profil teller) --"
                    />
                  </div>

                  {/* SUCCURSALE & DÉPARTEMENT */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Succursale *</span>
                      </label>
                      <SearchableSelect
                        options={createBranchOptions}
                        value={editTillBranchId}
                        onChange={(val) => setEditTillBranchId(val)}
                        placeholder="Sélectionner succursale..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Département *</span>
                      </label>
                      <SearchableSelect
                        options={createDeptOptions}
                        value={editTillDeptId}
                        onChange={(val) => setEditTillDeptId(val)}
                        placeholder="-- Sélectionner département --"
                      />
                    </div>
                  </div>

                  {/* STATUT ET SUSPENSION */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Statut Opérationnel & Suspension
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTillStatus("CLOSED")}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                          editTillStatus === "CLOSED"
                            ? "bg-slate-800 text-white border-slate-600"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"
                        }`}
                      >
                        Fermée (Standard)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTillStatus("OPEN")}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                          editTillStatus === "OPEN"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"
                        }`}
                      >
                        Ouverte
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTillStatus("LOCKED")}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                          editTillStatus === "LOCKED"
                            ? "bg-red-500/20 text-red-400 border-red-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"
                        }`}
                      >
                        Suspendue / Verrouillée
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTill(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingTill}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isUpdatingTill ? "Mise à jour..." : "Enregistrer la Caisse"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* EDIT SAFE MODAL */}
          {editingSafe && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Vault className="w-5 h-5 text-amber-400" />
                    <div>
                      <h3 className="text-sm font-bold text-white">Modifier / Éditer le Coffre-Fort</h3>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {editingSafe.id} ({editingSafe.currency})
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingSafe(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveEditSafe} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nom / Libellé du Coffre-Fort *
                    </label>
                    <input
                      type="text"
                      value={editSafeName}
                      onChange={(e) => setEditSafeName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  {/* RESPONSABLE / GESTIONNAIRE */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Responsable / Gestionnaire du Coffre (Employé RH)
                    </label>
                    <SearchableSelect
                      options={companyEmployeeNameOptions}
                      value={editSafeManagerName}
                      onChange={(val) => setEditSafeManagerName(val)}
                      placeholder="-- Sélectionner le responsable du coffre --"
                    />
                  </div>

                  {/* SUCCURSALE & DÉPARTEMENT */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Succursale *</span>
                      </label>
                      <SearchableSelect
                        options={createBranchOptions}
                        value={editSafeBranchId}
                        onChange={(val) => setEditSafeBranchId(val)}
                        placeholder="Sélectionner succursale..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                        <span>Département *</span>
                      </label>
                      <SearchableSelect
                        options={createDeptOptions}
                        value={editSafeDeptId}
                        onChange={(val) => setEditSafeDeptId(val)}
                        placeholder="-- Sélectionner département --"
                      />
                    </div>
                  </div>

                  {/* PLAFONDS MIN & MAX */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Plafond Min ({editingSafe.currency})
                      </label>
                      <input
                        type="number"
                        value={editSafeMinLimit}
                        onChange={(e) => setEditSafeMinLimit(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Plafond Max ({editingSafe.currency})
                      </label>
                      <input
                        type="number"
                        value={editSafeMaxLimit}
                        onChange={(e) => setEditSafeMaxLimit(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  {/* STATUT / SUSPENSION */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Statut & Suspension du Coffre
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditSafeStatus("ACTIVE")}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                          editSafeStatus === "ACTIVE"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"
                        }`}
                      >
                        Actif (Opérationnel)
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditSafeStatus("LOCKED")}
                        className={`py-2 px-1 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                          editSafeStatus === "LOCKED" || editSafeStatus === "SUSPENDED"
                            ? "bg-red-500/20 text-red-400 border-red-500/40"
                            : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900"
                        }`}
                      >
                        Suspendu / Verrouillé
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingSafe(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingSafe}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isUpdatingSafe ? "Mise à jour..." : "Enregistrer le Coffre"}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* FUND SAFE MODAL */}
          <FundSafeModal
            isOpen={isFundSafeOpen}
            onClose={() => {
              setIsFundSafeOpen(false);
              setPreselectedSafeForFunding(null);
            }}
            businessId={businessId}
            branchId={branchId}
            safes={safes}
            tills={tills}
            preselectedSafe={preselectedSafeForFunding}
            currentUser={currentUser}
            onFundSuccess={loadData}
          />
        </>
      )}
    </div>
  );
};
