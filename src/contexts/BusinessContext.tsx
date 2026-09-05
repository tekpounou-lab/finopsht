import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { auth, db, handleFirestoreError, OperationType } from "../lib/firebase";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { RuntimeEngine } from "../modules/runtime/RuntimeEngine";
import { SynchronizationEngine } from "../modules/runtime/SynchronizationEngine";
import { EventBus } from "../modules/runtime/EventBus";
import { useAuth } from "../hooks/useAuth";
import { useIdentity } from "../modules/identity/IdentityContext";
import { Business, Branch, Department, Role } from "../types";
import { BusinessResolver } from "../services/business/BusinessResolver";
import { FeatureResolver } from "../services/FeatureResolver";
import { PermissionService } from "../services/PermissionService";
import { SnapshotEngine } from "../services/business/snapshot/SnapshotEngine";
import { BusinessSnapshot } from "../services/business/snapshot/types";
import { AttendanceSnapshotEngine } from "../services/workforce/AttendanceSnapshotEngine";
import { AttendanceRepository } from "../repositories/AttendanceRepository";
import { WorkflowEngine } from "../modules/workflow/WorkflowEngine";
import {
  useEmployees,
  useLedgerTransactions,
  useEvents,
  usePayrollRecords,
  useAttendanceRecords,
  useForensicLogs,
  useLeaves,
  useEmployeeContracts,
  useShifts,
  useOvertimeRequests,
  useAbsenceEvents,
  usePayrollInputsSnapshots,
  useSalaryStructures,
  usePayrollProfiles,
  useSalaryAdvances,
  usePayrollBonuses,
  usePayrollDeductions,
  usePayslips,
  useInvitations,
  useEmployeeBadges,
  useAttendanceRules,
  useCompensationModels,
  usePayrollPolicies,
  useRoleProfiles,
  useBranchDepartmentLinks,
  useBranches,
  useDepartments
} from "../hooks/useRepositories";

// --- Enterprise Business Context State Machine ---
export type BusinessRuntimeState = 'INITIALIZING' | 'LOADING' | 'READY' | 'REFRESHING' | 'ERROR';

export interface BusinessContextState {
  // Backward Compatibility Fields
  business: Business | null;
  branches: Branch[];
  departments: Department[];
  settings: any | null;
  featureFlags: string[];
  permissions: string[];
  snapshot: BusinessSnapshot | null;
  isLoading: boolean;
  
  // Realtime Enterprise Data lists
  employees: any[];
  ledgerTransactions: any[];
  events: any[];
  payrollRecords: any[];
  attendanceRecords: any[];
  forensicLogs: any[];
  leaves: any[];
  employeeContracts: any[];
  shifts: any[];
  overtimeRequests: any[];
  absenceEvents: any[];
  payrollInputsSnapshots: any[];
  salaryStructures: any[];
  payrollProfiles: any[];
  salaryAdvances: any[];
  payrollBonuses: any[];
  payrollDeductions: any[];
  payslips: any[];
  invitations: any[];
  employeeBadges: any[];
  compensationModels: any[];
  payrollPolicies: any[];
  roleProfiles: any[];
  attendanceRules: any | null;
  branchDepartmentLinks: any[];
  attendanceSnapshot: any | null;
  updateAttendanceRules: (rules: any) => Promise<void>;

  // --- New Enterprise V1.3 Core API ---
  
  // State Machine State
  state: BusinessRuntimeState;
  
  // Business Subsection
  currentBusiness: Business | null;
  businessStatus: string;
  businessMetadata: Record<string, any>;
  
  // Organization Subsection
  teams: any[];
  businessUnits: any[];
  costCenters: any[];
  
  // Identity Subsection
  roles: Role[];
  approvalChains: any[];
  permissionMatrix: Record<string, any>;
  roleModuleMatrix?: Record<string, Record<string, boolean>>;
  
  // Configuration Subsection (evolution of settings)
  businessSettings: any;
  payrollSettings: any;
  attendanceSettings: any;
  hrSettings: any;
  securitySettings: any;
  financeSettings: any;
  brandSettings: any;
  notificationSettings: any;
  aiSettings: any;
  
  // Licensing Subsection
  subscription: any;
  licensing: any;
  enabledModules: string[];
  
  // Runtime Subsection
  snapshotVersion: string;
  snapshotGeneratedAt: string;
  isReady: boolean;
  isRefreshing: boolean;
  hasError: boolean;
  
  selectedBranch: string | null;
  setSelectedBranch: (branchId: string | null) => void;
  selectedDepartment: string | null;
  setSelectedDepartment: (deptId: string | null) => void;
  selectedFiscalYear: number | null;
  setSelectedFiscalYear: (year: number | null) => void;
  selectedPeriod: string | null;
  setSelectedPeriod: (period: string | null) => void;
  selectedCurrency: string | null;
  setSelectedCurrency: (currency: string | null) => void;
  selectedLanguage: string | null;
  setSelectedLanguage: (lang: string | null) => void;
  
  // Navigation Subsection
  navigation: {
    sidebar: any[];
    topbar: any;
    quickActions: any[];
  };
  
  // References Subsection
  references: {
    countries: string[];
    currencies: string[];
    languages: string[];
    taxRates: any[];
    units: any[];
    calendars: any[];
    holidayTables: any[];
  };
  
  // Domain Event Bus (decoupled communications)
  publish: (event: string, payload: any) => void;
  subscribe: (event: string, callback: (payload: any) => void) => () => void;
}

const BusinessContext = createContext<BusinessContextState | null>(null);

export const BusinessProvider = ({ children }: { children: React.ReactNode }) => {
  const { authLoading } = useAuth();
  const { identity, loading: identityLoading } = useIdentity();
  
  // 0. Register with Runtime
  useEffect(() => {
    RuntimeEngine.registerModule({
      name: "BUSINESS_CORE",
      version: "1.3.0",
      onInitialize: async () => console.log("[BusinessCore] Initializing...")
    });
  }, []);

  // State Machine State
  const [state, setState] = useState<BusinessRuntimeState>('INITIALIZING');
  const [hasError, setHasError] = useState<boolean>(false);

  // Core resolved data
  const [business, setBusiness] = useState<Business | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [featureFlags, setFeatureFlags] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null);

  // Runtime State Properties
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState<number | null>(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>("USD");
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>("fr");

  // In-memory Domain Event Bus listeners
  const [listeners] = useState<Record<string, Array<(payload: any) => void>>>(() => ({}));

  // Enterprise Observability Audit logger
  const traceEvent = (eventName: string, metadata?: any) => {
    console.log(`[Observability] ${eventName}`, {
      timestamp: new Date().toISOString(),
      state,
      ...metadata
    });
  };

  // Event Bus implementation
  const publish = (event: string, payload: any) => {
    console.log(`[DomainEventBus] Publish: "${event}"`, payload);
    traceEvent(`DomainEvent:${event}`, { payload });
    if (listeners[event]) {
      listeners[event].forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(`[DomainEventBus] Error calling listener for "${event}":`, e);
        }
      });
    }
  };

  const subscribe = (event: string, callback: (payload: any) => void) => {
    if (!listeners[event]) {
      listeners[event] = [];
    }
    listeners[event].push(callback);
    return () => {
      listeners[event] = listeners[event].filter((cb) => cb !== callback);
    };
  };

  // Enterprise Hooks (will automatically listen to data based on business?.id)
  const canFetch = (state === 'READY' || state === 'REFRESHING') && Boolean(auth.currentUser);
  const activeBusinessId = canFetch ? business?.id : undefined;

  const employees = useEmployees(activeBusinessId);
  const ledgerTransactions = useLedgerTransactions(activeBusinessId);
  const events = useEvents(activeBusinessId);
  const payrollRecords = usePayrollRecords(activeBusinessId);
  const attendanceRecords = useAttendanceRecords(activeBusinessId);
  const forensicLogs = useForensicLogs(activeBusinessId);
  const leaves = useLeaves(activeBusinessId);
  const employeeContracts = useEmployeeContracts(activeBusinessId);
  const shifts = useShifts(activeBusinessId);
  const overtimeRequests = useOvertimeRequests(activeBusinessId);
  const absenceEvents = useAbsenceEvents(activeBusinessId);
  const payrollInputsSnapshots = usePayrollInputsSnapshots(activeBusinessId);
  const salaryStructures = useSalaryStructures(activeBusinessId);
  const payrollProfiles = usePayrollProfiles(activeBusinessId);
  const salaryAdvances = useSalaryAdvances(activeBusinessId);
  const payrollBonuses = usePayrollBonuses(activeBusinessId);
  const payrollDeductions = usePayrollDeductions(activeBusinessId);
  const payslips = usePayslips(activeBusinessId);
  const invitations = useInvitations(activeBusinessId);
  const employeeBadges = useEmployeeBadges(activeBusinessId);
  const attendanceRules = useAttendanceRules(activeBusinessId);
  const compensationModels = useCompensationModels(activeBusinessId);
  const payrollPolicies = usePayrollPolicies(activeBusinessId);
  const roleProfiles = useRoleProfiles(activeBusinessId);
  const branchDepartmentLinks = useBranchDepartmentLinks(activeBusinessId);
  const liveBranches = useBranches(activeBusinessId);
  const liveDepartments = useDepartments(activeBusinessId);

  const effectiveBranches = useMemo(() => {
    if (liveBranches && liveBranches.length > 0) return liveBranches;
    return branches;
  }, [liveBranches, branches]);

  const effectiveDepartments = useMemo(() => {
    if (liveDepartments && liveDepartments.length > 0) return liveDepartments;
    return departments;
  }, [liveDepartments, departments]);

  // Compute attendance snapshot dynamically on data list or rule changes
  const attendanceSnapshot = useMemo(() => {
    if (!business?.id) return null;
    try {
      return AttendanceSnapshotEngine.build({
        businessId: business.id,
        attendanceLogs: attendanceRecords || [],
        shifts: shifts || [],
        leaves: leaves || [],
        rules: attendanceRules
      });
    } catch (err) {
      console.error("[AttendanceSnapshotEngine] build failure:", err);
      return null;
    }
  }, [business?.id, attendanceRecords, shifts, leaves, attendanceRules]);

  const updateAttendanceRules = async (rules: any) => {
    if (!business?.id) return;
    try {
      await AttendanceRepository.saveRules(business.id, rules);
    } catch (err) {
      console.error("[AttendanceRepository] saveRules failure:", err);
    }
  };

  // Log initial context creation & seed workflow defaults for active business
  useEffect(() => {
    traceEvent("BusinessContextInitialized", { message: "Enterprise Context Layer Ready" });
  }, []);

  useEffect(() => {
    if (activeBusinessId && auth.currentUser) {
      WorkflowEngine.seedForBusiness(activeBusinessId).catch((err) => {
        console.warn("[BusinessContext] Workflow seeding deferred:", err.message);
      });
    }
  }, [activeBusinessId]);

  // Map permissions from roles for authorization context
  useEffect(() => {
    const role = identity?.role;
    if (!role) {
      setPermissions([]);
      return;
    }
    const r = role.toUpperCase();
    if (r === "OWNER") setPermissions(["*"]);
    else if (r === "MANAGER") setPermissions(["manage_users", "view_reports", "manage_payroll", "edit_attendance"]);
    else if (r === "SUPERVISOR") setPermissions(["view_reports", "edit_attendance"]);
    else setPermissions(["view_own_data"]); // Default employee permissions
  }, [identity?.role]);

  // Synchronize roleModuleMatrix dynamically with PermissionService
  useEffect(() => {
    if (settings?.roleModuleMatrix) {
      PermissionService.setRoleModuleMatrix(settings.roleModuleMatrix);
    }
  }, [settings?.roleModuleMatrix]);

  // Enterprise Application State Machine integration on Lifecycle
  useEffect(() => {
    if (authLoading || identityLoading || !auth.currentUser) {
      setState('INITIALIZING');
      setBusiness(null);
      setBranches([]);
      setDepartments([]);
      setSettings(null);
      setFeatureFlags([]);
      setSnapshot(null);
      return;
    }

    // 1. Try to use the pre-resolved snapshot from Identity Orchestrator (Source of Truth)
    let initialResolveNeeded = true;
    if (identity?.businessSnapshot) {
      const bizSnap = identity.businessSnapshot;
      setBusiness(bizSnap.business);
      setBranches(bizSnap.branches);
      setDepartments(bizSnap.departments);
      setSettings(bizSnap.business.settings || {});
      setFeatureFlags(Object.keys(bizSnap.featureFlags || {}));
      setSnapshot(bizSnap as any);
      setState('READY');
      traceEvent("BusinessContextReadyFromIdentity", { businessId: bizSnap.id });
      initialResolveNeeded = false;
    }

    const business_id = identity?.business?.id;
    if (!business_id) {
      setBusiness(null);
      setBranches([]);
      setDepartments([]);
      setSettings(null);
      setFeatureFlags([]);
      setSnapshot(null);
      setState(auth.currentUser ? 'READY' : 'INITIALIZING');
      return;
    }

    // Phase 2: Start Managed Synchronization (Mandatory for SSOT consistency)
    // CRITICAL: Ensure auth.currentUser is populated and business is active before starting sync
    const isAuthReady = !authLoading && !identityLoading && auth.currentUser;
    const isBizActive = identity?.business?.status === "ACTIVE" || identity?.business?.status === "APPROVED" || identity?.onboardingStatus === "COMPLETED";
    
    if (business_id && business_id !== "none" && state !== "INITIALIZING" && state !== "LOADING" && isAuthReady && isBizActive) {
      SynchronizationEngine.startSync(business_id);
    }

    // Initial Enterprise Resolution Pipeline (Only if no snapshot was provided by Identity)
    if (initialResolveNeeded) {
      // Clear any previous business state immediately before resolving the new business
      setBusiness(null);
      setBranches([]);
      setDepartments([]);
      setSettings(null);
      setFeatureFlags([]);
      setSnapshot(null);

      // State transition to LOADING
      setState('LOADING');
      setHasError(false);
      traceEvent("BusinessContextLoading", { businessId: business_id });

      BusinessResolver.resolve(business_id)
        .then((snapshotData) => {
          setBusiness(snapshotData.business);
          setBranches(snapshotData.branches);
          setDepartments(snapshotData.departments);
          setSettings(snapshotData.settings);
          
          // Build Snapshot asynchronously to complete bootstrap cycle
          SnapshotEngine.build(snapshotData)
            .then((s) => {
              setSnapshot(s);
              setState('READY');
              traceEvent("BusinessContextReady", {
                businessId: business_id,
                snapshotVersion: s.snapshotVersion,
                generatedAt: s.generatedAt
              });
              // Publish Event to Domain Event Bus
              publish("BusinessContextReady", { businessId: business_id, version: s.snapshotVersion });
            })
            .catch((err) => {
              console.error("[SnapshotEngine] Background build failure:", err);
              setHasError(true);
              setState('ERROR');
              traceEvent("BusinessContextError", { reason: "SnapshotBuildFailed", error: err.message });
            });
        })
        .catch((err) => {
          console.error("[BusinessResolver] Primary load failure:", err);
          setHasError(true);
          setState('ERROR');
          traceEvent("BusinessContextError", { reason: "BusinessResolveFailed", error: err.message });
        });
    }

    // Phase 3: Runtime Context Redirection
    // Subscribe to Synchronization Events for Core Org structure only
    const unsubSync = EventBus.subscribe("*", (event) => {
      if (event.businessId !== business_id) return;

      switch (event.type) {
        case "BUSINESS_Synced":
          setState('REFRESHING');
          setBusiness(event.payload);
          setSettings(event.payload.settings || null);
          setFeatureFlags(event.payload.featureFlags || []);
          break;
        case "FEATURE_CACHE_INVALIDATED":
          // Fetch the absolute latest feature flags since cache is now completely invalidated
          FeatureResolver.resolveAll(business_id)
            .then(features => {
              // Convert mapped feature record back to keys representation
              const enabledFlags = Object.entries(features)
                .filter(([_, enabled]) => enabled)
                .map(([key]) => key);
              setFeatureFlags(enabledFlags);
            })
            .catch(err => {
              console.warn("[BusinessContext] Error updating feature flags after invalidation:", err);
            });
          break;
        case "BRANCHES_Synced":
          setBranches(event.payload);
          if (event.payload && event.payload.length > 0) {
            setSelectedBranch(prev => prev || event.payload[0]);
          }
          break;
        case "DEPARTMENTS_Synced":
          setDepartments(event.payload);
          break;
        case "SETTINGS_Synced":
          setSettings(event.payload);
          break;
      }
    });

    return () => {
      unsubSync();
      SynchronizationEngine.stopSync();
    };
  }, [identity?.business?.id, authLoading, identityLoading]);

  // Backward-compatible Loading state flag
  const isLoading = state === 'INITIALIZING' || state === 'LOADING';

  // Navigation snapshot builder based on permissions
  const role = identity?.role;
  const navigation = {
    sidebar: [
      { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: ["OWNER", "MANAGER", "SUPERVISOR", "EMPLOYEE"] },
      { id: "organization", label: "Organisation", icon: "Network", roles: ["OWNER", "MANAGER"] },
      { id: "attendance", label: "Présences", icon: "Clock", roles: ["OWNER", "MANAGER", "SUPERVISOR"] },
      { id: "payroll", label: "Paie", icon: "CreditCard", roles: ["OWNER", "MANAGER"] },
      { id: "analytics", label: "Analytics", icon: "BarChart3", roles: ["OWNER", "MANAGER"] }
    ].filter(item => {
      if (role) {
        const r = role.toUpperCase();
        if (r === "SUPER_ADMIN") return true;
        return item.roles.includes(r);
      }
      return false;
    }),
    topbar: {
      showLanguageSelector: true,
      showNotificationCenter: true,
      quickSettings: true
    },
    quickActions: [
      { id: "check_in", label: "Pointer Entrée", action: "scan_qr", roles: ["EMPLOYEE", "SUPERVISOR"] },
      { id: "request_leave", label: "Demander un Congé", action: "create_leave", roles: ["EMPLOYEE", "SUPERVISOR", "MANAGER", "OWNER"] }
    ].filter(act => {
      if (!role) return false;
      const r = role.toUpperCase();
      if (r === "SUPER_ADMIN") return true;
      return act.roles.includes(r);
    })
  };

  // Reference data dictionary
  const references = {
    countries: ["Haiti", "France", "United States", "Canada"],
    currencies: ["HTG", "EUR", "USD", "CAD"],
    languages: ["fr", "ht", "en"],
    taxRates: [
      { id: "tca_ht", label: "TCA Haiti", rate: 0.10 },
      { id: "tva_fr", label: "TVA France", rate: 0.20 }
    ],
    units: ["Heure", "Jour", "Mois"],
    calendars: [],
    holidayTables: []
  };

  return (
    <BusinessContext.Provider value={{
      // --- Backward Compatibility ---
      business,
      branches: effectiveBranches,
      departments: effectiveDepartments,
      settings,
      featureFlags,
      permissions,
      snapshot,
      isLoading,
      employees,
      ledgerTransactions,
      events,
      payrollRecords,
      attendanceRecords,
      forensicLogs,
      leaves,
      employeeContracts,
      shifts,
      overtimeRequests,
      absenceEvents,
      payrollInputsSnapshots,
      salaryStructures,
      payrollProfiles,
      salaryAdvances,
      payrollBonuses,
      payrollDeductions,
      payslips,
      invitations,
      employeeBadges,
      compensationModels,
      payrollPolicies,
      roleProfiles,
      attendanceRules,
      branchDepartmentLinks,
      attendanceSnapshot,
      updateAttendanceRules,

      // --- New Enterprise V1.3 Core ---
      state,
      currentBusiness: business,
      businessStatus: business?.status || "ACTIVE",
      businessMetadata: (business as any)?.metadata || {},
      
      teams: [],
      businessUnits: [],
      costCenters: [],
      
      roles: (snapshot?.data?.roles as any) || [],
      approvalChains: [],
      permissionMatrix: settings?.permissionMatrix || settings || {},
      roleModuleMatrix: settings?.roleModuleMatrix || {},
      
      businessSettings: settings || {},
      payrollSettings: settings?.payroll || {},
      attendanceSettings: settings?.attendance || {},
      hrSettings: settings?.hr || {},
      securitySettings: settings?.security || {},
      financeSettings: settings?.finance || {},
      brandSettings: settings?.brand || {},
      notificationSettings: settings?.notifications || {},
      aiSettings: settings?.ai || {},
      
      subscription: (business as any)?.subscription || { plan: "FREE_TIER", status: "ACTIVE" },
      licensing: { tier: "Enterprise", seats: 100 },
      enabledModules: ["workforce", "attendance", "payroll", "analytics"],
      
      snapshotVersion: snapshot?.snapshotVersion || "1.0.0",
      snapshotGeneratedAt: snapshot?.generatedAt || new Date().toISOString(),
      isReady: state === 'READY' || state === 'REFRESHING',
      isRefreshing: state === 'REFRESHING',
      hasError,
      
      selectedBranch,
      setSelectedBranch,
      selectedDepartment,
      setSelectedDepartment,
      selectedFiscalYear,
      setSelectedFiscalYear,
      selectedPeriod,
      setSelectedPeriod,
      selectedCurrency,
      setSelectedCurrency,
      selectedLanguage,
      setSelectedLanguage,
      
      navigation,
      references,
      
      publish,
      subscribe
    }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusinessContext = () => {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusinessContext must be inside BusinessProvider");
  return ctx;
};

// --- Specialized Business Selectors for Maximum Render Performance ---

export const useCurrentBusiness = () => {
  const { currentBusiness } = useBusinessContext();
  return currentBusiness;
};

export const useBusinessBranches = () => {
  const { branches } = useBusinessContext();
  return branches;
};

export const useBusinessDepartments = () => {
  const { departments } = useBusinessContext();
  return departments;
};

export const useBusinessPermissions = () => {
  const { permissions } = useBusinessContext();
  return permissions;
};

export const useBusinessSettings = () => {
  const { businessSettings } = useBusinessContext();
  return businessSettings;
};

export const useBusinessFeatureFlags = () => {
  const { featureFlags } = useBusinessContext();
  return featureFlags;
};

export const useBusinessSubscription = () => {
  const { subscription } = useBusinessContext();
  return subscription;
};

export const useBusinessRuntimeState = () => {
  const { state, isReady, isRefreshing, hasError } = useBusinessContext();
  return { state, isReady, isRefreshing, hasError };
};

export const useDomainEventBus = () => {
  const { publish, subscribe } = useBusinessContext();
  return { publish, subscribe };
};
