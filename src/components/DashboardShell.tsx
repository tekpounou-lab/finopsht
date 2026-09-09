import React, { useState, useMemo, Suspense, lazy } from "react";
import { HelpCircle } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useI18n } from "../i18n";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import { 
  Sidebar, 
  TopBar, 
  QuickActionMenu, 
  UserDropdown, 
  useNavigation, 
  useQuickActions 
} from "./dashboard";
import { useNotifications } from "../hooks/useNotifications";
import { normalizeTab } from "./dashboard/hooks/useNavigation";
import { Role, Business } from "../types";
import EnterpriseErrorBoundary from "./ui/ErrorBoundary";
import { EditProfileModal } from "./profile/EditProfileModal";
import { EmployeeRepository } from "../repositories/EmployeeRepository";
import { PayrollRepository } from "../repositories/PayrollRepository";
import { db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

// Subcomponents - Lazy loaded for performance & code splitting
const AttendanceLedger = lazyWithRetry(() => import("../pages/AttendanceLedger"));
const PayrollEngine = lazyWithRetry(() => import("./PayrollEngine"));
const EventStreamPage = lazyWithRetry(() => import("../pages/reliability/EventStreamPage"));
const AiCfoAssistant = lazyWithRetry(() => import("./AiCfoAssistant"));
const LeaveManagement = lazyWithRetry(() => import("./LeaveManagement"));
const DocumentsManager = lazyWithRetry(() => import("./DocumentsManager"));
const BusinessAdministrationCenter = lazyWithRetry(() => import("./admin/settings/BusinessAdministrationCenter"));
const SystemHealthConsole = lazyWithRetry(() => import("../pages/SystemHealthConsole"));
const DisasterRecovery = lazyWithRetry(() => import("./DisasterRecovery"));
const EnterpriseSetupWizard = lazyWithRetry(() => import("./onboarding/EnterpriseSetupWizard"));
const MyWorkspace = lazyWithRetry(() => import("../pages/employee/MyWorkspace"));
const ConnectedOrganizationStructure = lazyWithRetry(() => import("./ConnectedOrganizationStructure"));
const ConnectedFinanceLedger = lazyWithRetry(() => import("./ConnectedFinanceLedger"));
const ConnectedForensicLogs = lazyWithRetry(() => import("./ConnectedForensicLogs"));
const ConnectedPersonnel = lazyWithRetry(() => import("./ConnectedPersonnel"));
const ConnectedSchedules = lazyWithRetry(() => import("./ConnectedSchedules"));
const PerformanceIntelligenceCenter = lazyWithRetry(() => import("../pages/PerformanceIntelligenceCenter"));
const ConnectedBusinessIntelligence = lazyWithRetry(() => import("./ConnectedBusinessIntelligence"));
const SuperAdminPlatform = lazyWithRetry(() => import("../pages/SuperAdminPlatform"));
const NotificationsCenter = lazyWithRetry(() => import("./NotificationsCenter"));

export interface DashboardShellProps {
  initialTab?: string;
  initialSubTab?: "LEADS" | "PROFORMAS" | "INVOICES" | "TEMPLATES" | "PENDING";
}

export function DashboardShell({ initialTab, initialSubTab }: DashboardShellProps = {}) {
  const { user: authUser, identity, dbEmployee, dbUser, role: authRole, logout } = useAuth();
  const currentRole: Role = (authRole as Role) || "OWNER";

  // Resolve full display name from SSOT identity context
  const resolvedUserName = useMemo(() => {
    if (identity?.displayName && identity.displayName.trim().length > 1) {
      return identity.displayName.trim();
    }
    if (identity?.userProfile?.name && identity.userProfile.name.trim().length > 1) {
      return identity.userProfile.name.trim();
    }
    if (identity?.employee?.name && identity.employee.name.trim().length > 1) {
      return identity.employee.name.trim();
    }
    if (dbEmployee?.name && dbEmployee.name.trim().length > 1) {
      return dbEmployee.name.trim();
    }
    if (dbUser?.name && dbUser.name.trim().length > 1) {
      return dbUser.name.trim();
    }
    if (authUser?.displayName && authUser.displayName.trim().length > 1) {
      return authUser.displayName.trim();
    }
    if (authUser?.email) {
      const prefix = authUser.email.split("@")[0];
      if (prefix) {
        return prefix
          .replace(/[._-]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
    return "Administrateur";
  }, [identity, dbEmployee, dbUser, authUser]);

  const {
    business: liveBusiness,
    branches: liveBranches = [],
    departments: liveDepartments = [],
    employees = [],
    ledgerTransactions = [],
    payrollRecords = [],
    payrollCycles = [],
    attendanceRecords = [],
    forensicLogs = [],
    leaves = [],
    events = [],
    employeeContracts = [],
  } = useBusinessContext();

  // 1. Navigation Hook with normalized tab mapping
  const { activeTab, setActiveTab } = useNavigation(currentRole, initialTab);
  const normalizedActiveTab = normalizeTab(activeTab);

  // 2. Quick Actions / Command Palette Hook
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    searchQuery,
    setSearchQuery,
    filteredActions,
    executeAction,
  } = useQuickActions(setActiveTab);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Real-time Notifications Hook
  const { unreadCount: realTimeUnreadCount } = useNotifications(
    liveBusiness?.id
  );

  // Pending leaves count for badge
  const pendingLeavesCount = useMemo(() => {
    return (leaves || []).filter((l: any) => l.status === "PENDING").length;
  }, [leaves]);

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans relative" id="finops-enterprise-app-shell">
      {/* 1. Sidebar Navigation (Desktop Persistent + Mobile Drawer) */}
      <Sidebar
        activeTab={normalizedActiveTab}
        onSelectTab={setActiveTab}
        currentRole={currentRole}
        isOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        badgeCounts={{
          leaves: pendingLeavesCount,
          notifications: realTimeUnreadCount,
        }}
      />

      {/* Main Column Container */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* 2. TopBar Navigation & Global Controls */}
        <TopBar
          currentBusiness={liveBusiness}
          businesses={liveBusiness ? [liveBusiness] : []}
          onSelectBusiness={() => {}}
          onOpenMobileMenu={() => setIsMobileSidebarOpen((prev) => !prev)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          notificationCount={realTimeUnreadCount}
          currentRole={currentRole}
          userSlot={
            <UserDropdown
              currentUser={{ name: resolvedUserName, email: authUser?.email || identity?.email || "" }}
              currentRole={currentRole}
              onLogout={logout}
              onNavigateToProfile={() => setIsEditProfileModalOpen(true)}
              onNavigateToSupport={() => setIsHelpModalOpen(true)}
              onNavigateToSettings={() => setActiveTab("settings")}
            />
          }
        />

        {/* 3. Main Workspace Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950" id="finops-workspace-content">
          <EnterpriseErrorBoundary key={normalizedActiveTab} sectionName="WORKSPACE_TAB">
            <Suspense
              fallback={
                <div className="flex items-center justify-center min-h-[400px] text-xs text-slate-500 font-medium">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span>Chargement du module ERP...</span>
                  </div>
                </div>
              }
            >
            {(normalizedActiveTab === "platform" || normalizedActiveTab === "tenants" || normalizedActiveTab === "superadmin") && (
              <SuperAdminPlatform initialTab={initialSubTab === "PENDING" ? "pending" : "tenants"} />
            )}

            {normalizedActiveTab === "plans" && (
              <SuperAdminPlatform initialTab="plans" />
            )}

            {normalizedActiveTab === "security" && (
              <SuperAdminPlatform initialTab="security" />
            )}

            {normalizedActiveTab === "dashboard" && (
              <ConnectedBusinessIntelligence
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees}
                ledgerTransactions={ledgerTransactions}
                payrollRecords={payrollRecords}
                attendanceRecords={attendanceRecords}
              />
            )}

            {normalizedActiveTab === "organization" && (
              <ConnectedOrganizationStructure />
            )}

            {normalizedActiveTab === "personnel" && (
              <ConnectedPersonnel
                employees={employees}
                branches={liveBranches}
                departments={liveDepartments}
                currentRole={currentRole}
                currentUser={{ name: authUser?.displayName || "Admin", email: authUser?.email || "", id: authUser?.uid || "usr_1" }}
                attendanceRecords={attendanceRecords}
                handleUpdateAttendance={() => {}}
                employeeBadges={[]}
                handleAddEvent={() => {}}
                handleAddForensicLog={() => {}}
                currentBusiness={liveBusiness}
                ledgerTransactions={ledgerTransactions}
                employeeContracts={[]}
                language="fr"
                setFocusedEmployeeIdForProfile={() => {}}
                setActiveTab={setActiveTab}
              />
            )}

            {normalizedActiveTab === "payroll" && (
              <PayrollEngine
                currentRole={currentRole}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees}
                ledgerTransactions={ledgerTransactions}
                payrollCycles={payrollCycles}
                payrollRecords={payrollRecords}
                attendanceRecords={attendanceRecords}
                onLockCycle={async (cycleId, lockedBy) => {
                  console.debug(`[Payroll] Cycle locked: ${cycleId} by ${lockedBy}`);
                  await PayrollRepository.updateCycle(cycleId, {
                    status: "LOCKED",
                    validatedBy: lockedBy,
                    validatedAt: new Date().toISOString(),
                    business_id: liveBusiness?.id || "BIZ_MAIN"
                  });
                }}
                onAddCycle={async (cycle) => {
                  console.debug(`[Payroll] Creating cycle with period: ${cycle.startDate}, ${cycle.endDate} -> generated name: "${cycle.cycleName}"`);
                  await PayrollRepository.createCycle(cycle);
                  console.debug(`[Payroll] Cycle created with ID: ${cycle.id} and name: "${cycle.cycleName}"`);
                }}
                onUpdateCycle={async (cycleId, updates) => {
                  console.debug(`[Payroll] Updating cycle ${cycleId}:`, updates);
                  await PayrollRepository.updateCycle(cycleId, {
                    ...updates,
                    business_id: liveBusiness?.id || "BIZ_MAIN"
                  });
                }}
                onDeleteCycle={async (cycleId) => {
                  console.debug(`[Payroll] Deleting cycle ${cycleId}`);
                  await PayrollRepository.deleteCycle(cycleId, liveBusiness?.id || "BIZ_MAIN", authUser?.uid || "admin");
                }}
                onAddRecords={async (records) => {
                  console.debug(`[Payroll] Employees added: ${records.length} payroll records`);
                  for (const rec of records) {
                    const ref = doc(db, "payroll_records", rec.id);
                    await setDoc(ref, {
                      ...rec,
                      business_id: liveBusiness?.id || "BIZ_MAIN",
                      updated_at: serverTimestamp()
                    }, { merge: true });
                  }
                }}
                onAddForensicLog={async (log) => {
                  console.debug(`[Payroll] Forensic log recorded: ${log.id}`);
                  const ref = doc(db, "forensic_logs", log.id);
                  await setDoc(ref, {
                    ...log,
                    business_id: liveBusiness?.id || "BIZ_MAIN",
                    _server_timestamp: serverTimestamp()
                  }, { merge: true });
                }}
                onAddEvent={async (ev) => {
                  console.debug(`[Payroll] Event published: ${ev.type}`);
                  const ref = doc(db, "erp_events", ev.id);
                  await setDoc(ref, {
                    ...ev,
                    business_id: liveBusiness?.id || "BIZ_MAIN",
                    created_at: serverTimestamp()
                  }, { merge: true });
                }}
                onAddTransaction={async (tx) => {
                  console.debug(`[Payroll] Ledger transaction posted: ${tx.id}`);
                  const ref = doc(db, "ledger_transactions", tx.id);
                  await setDoc(ref, {
                    ...tx,
                    business_id: liveBusiness?.id || "BIZ_MAIN",
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                }}
              />
            )}

            {normalizedActiveTab === "ledger" && (
              <ConnectedFinanceLedger />
            )}

            {normalizedActiveTab === "attendance" && (
              <AttendanceLedger
                currentRole={currentRole}
                currentUser={{ name: authUser?.displayName || "Administrateur", id: authUser?.uid || "usr_1" }}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                currentBranchId={liveBranches[0]?.id || null}
                isOffline={false}
                employees={employees}
                attendanceRecords={attendanceRecords}
                branches={liveBranches}
                departments={liveDepartments}
                onAddEvent={() => {}}
                onAddForensicLog={() => {}}
                onUpdateAttendance={() => {}}
              />
            )}

            {normalizedActiveTab === "planning" && (
              <ConnectedSchedules
                currentRole={currentRole}
                currentUser={{ name: authUser?.displayName || "Administrateur", id: authUser?.uid || "usr_1" } as any}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                branches={liveBranches}
                departments={liveDepartments}
                onAddEvent={() => {}}
                onAddForensicLog={() => {}}
              />
            )}

            {normalizedActiveTab === "leaves" && (
              <LeaveManagement
                currentRole={currentRole}
                currentUser={{ name: authUser?.displayName || "User", id: authUser?.uid || "usr_1" }}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees}
                leaves={leaves}
                onAddEvent={() => {}}
                onAddForensicLog={() => {}}
              />
            )}

            {normalizedActiveTab === "performance" && (
              <PerformanceIntelligenceCenter />
            )}

            {normalizedActiveTab === "cfo" && (
              <AiCfoAssistant
                currentBusiness={liveBusiness || null}
                currentBranch={liveBranches[0] || null}
                employees={employees}
                ledgerTransactions={ledgerTransactions}
                payrollRecords={payrollRecords}
                attendanceRecords={attendanceRecords}
                departments={liveDepartments}
                branches={liveBranches}
              />
            )}

            {normalizedActiveTab === "documents" && (
              <DocumentsManager
                currentRole={currentRole}
                currentUser={{ name: resolvedUserName || authUser?.displayName || "Administrateur", id: authUser?.uid || "usr_1" }}
                currentUserId={authUser?.uid}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                businessName={liveBusiness?.name || ""}
                employees={employees || []}
                employeeContracts={employeeContracts || []}
                onAddEmployeeContract={async (contract) => {
                  try {
                    await EmployeeRepository.saveContract(contract, authUser);
                  } catch (err) {
                    console.error("[DashboardShell] Error saving employee contract:", err);
                  }
                }}
                onUpdateEmployeeContract={async (contract) => {
                  try {
                    await EmployeeRepository.saveContract(contract, authUser);
                  } catch (err) {
                    console.error("[DashboardShell] Error updating employee contract:", err);
                  }
                }}
                onDeleteEmployeeContract={async (contractId) => {
                  try {
                    await EmployeeRepository.deleteContract(contractId);
                  } catch (err) {
                    console.error("[DashboardShell] Error deleting employee contract:", err);
                  }
                }}
              />
            )}

            {normalizedActiveTab === "employeeSpace" && (
              <MyWorkspace
                employee={
                  employees.find((e) => 
                    (e.firebase_uid && authUser?.uid && e.firebase_uid === authUser.uid) || 
                    (e.id && authUser?.uid && e.id === authUser.uid) ||
                    (e.email && authUser?.email && e.email.toLowerCase().trim() === authUser.email.toLowerCase().trim())
                  )
                }
                employees={employees}
                branches={liveBranches}
                departments={liveDepartments}
                attendanceRecords={attendanceRecords}
                payrollRecords={payrollRecords}
                leaves={leaves}
                events={events}
                forensicLogs={forensicLogs}
                transactions={ledgerTransactions}
                onAddAttendanceSim={() => {}}
                onAddLeaveRequestSim={() => {}}
                language="fr"
              />
            )}

            {normalizedActiveTab === "forensic" && (
              <ConnectedForensicLogs />
            )}

            {normalizedActiveTab === "notifications" && (
              <NotificationsCenter
                currentRole={currentRole}
                currentUser={{ name: authUser?.displayName || "Administrateur", id: authUser?.uid || "usr_1" }}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                events={events}
                readIds={[]}
                setReadIds={() => {}}
              />
            )}

            {normalizedActiveTab === "settings" && (
              <BusinessAdministrationCenter
                currentRole={currentRole}
                businessId={liveBusiness?.id || "BIZ_MAIN"}
              />
            )}

            {normalizedActiveTab === "reliability" && (
              <EventStreamPage
                events={events}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                isOffline={false}
                onReplayEvent={() => {}}
                onClearDlq={() => {}}
              />
            )}

            {normalizedActiveTab === "health" && (
              <SystemHealthConsole
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees}
                departments={liveDepartments}
                branches={liveBranches}
                ledgerTransactions={ledgerTransactions}
                employeeContracts={[]}
                employeeBadges={[]}
                invitations={[]}
                onAddForensicLog={() => {}}
              />
            )}

            {normalizedActiveTab === "recovery" && (
              <DisasterRecovery
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                currentRole={currentRole}
              />
            )}

            {normalizedActiveTab === "onboarding" && (
              <EnterpriseSetupWizard />
            )}
          </Suspense>
        </EnterpriseErrorBoundary>
      </main>
      </div>

      {/* 4. Quick Action Command Palette (⌘K) */}
      <QuickActionMenu
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        actions={filteredActions}
        onExecute={executeAction}
      />

      {/* 5. Notification Center Slide-Over Drawer */}
      {isNotificationsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div className="w-full max-w-lg h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col relative z-10 overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-slate-950/80 border-b border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Centre de Notifications</span>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Chargement des notifications...</div>}>
                <NotificationsCenter
                  currentRole={currentRole}
                  currentUser={{ name: resolvedUserName, id: authUser?.uid || "usr_1" }}
                  current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                  events={events}
                  readIds={[]}
                  setReadIds={() => {}}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* 6. User Profile Modal */}
      {isEditProfileModalOpen && (
        <EditProfileModal
          isOpen={isEditProfileModalOpen}
          onClose={() => setIsEditProfileModalOpen(false)}
          currentUser={dbEmployee || (identity?.employee as any) || null}
        />
      )}

      {/* 7. Support & Help Center Modal */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-amber-400" />
                <span>Centre d'Aide & Support FINOPS</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Fermer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Besoin d'assistance technique, de conseils de paramétrage ou de formation sur vos modules FINOPS ERP ?
            </p>
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-medium text-slate-400">Support Technique:</span>
                <span className="font-mono text-indigo-400">support@finops-erp.com</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-medium text-slate-400">Délai SLA Réponse:</span>
                <span className="text-emerald-400 font-semibold">&lt; 2 Heures (Haute Priorité)</span>
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsHelpModalOpen(false);
                  setActiveTab("training");
                }}
                className="px-3 py-2 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-xl hover:bg-indigo-600/30 text-xs font-semibold cursor-pointer transition-colors"
              >
                Accéder aux Formations
              </button>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="px-3 py-2 bg-slate-800 text-slate-200 rounded-xl hover:bg-slate-700 text-xs font-bold cursor-pointer transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardShell;

