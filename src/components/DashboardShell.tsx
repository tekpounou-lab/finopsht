import React, { useState, useMemo, Suspense, lazy } from "react";
import { useAuth } from "../hooks/useAuth";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useI18n } from "../i18n";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import { 
  Sidebar, 
  TopBar, 
  QuickActionMenu, 
  NotificationCenter, 
  UserDropdown, 
  useNavigation, 
  useQuickActions 
} from "./dashboard";
import { normalizeTab } from "./dashboard/hooks/useNavigation";
import { Role, Business } from "../types";

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
const ConnectedOrganizationStructure = lazyWithRetry(() => import("./ConnectedOrganizationStructure").then(m => ({ default: m.ConnectedOrganizationStructure || m.default })));
const ConnectedFinanceLedger = lazyWithRetry(() => import("./ConnectedFinanceLedger").then(m => ({ default: m.ConnectedFinanceLedger || m.default })));
const ConnectedForensicLogs = lazyWithRetry(() => import("./ConnectedForensicLogs").then(m => ({ default: m.ConnectedForensicLogs || m.default })));
const ConnectedPersonnel = lazyWithRetry(() => import("./ConnectedPersonnel").then(m => ({ default: m.ConnectedPersonnel || m.default })));
const PerformanceIntelligenceCenter = lazyWithRetry(() => import("../pages/PerformanceIntelligenceCenter").then(m => ({ default: m.PerformanceIntelligenceCenter || m.default })));
const ConnectedBusinessIntelligence = lazyWithRetry(() => import("./ConnectedBusinessIntelligence").then(m => ({ default: m.ConnectedBusinessIntelligence || m.default })));
const SuperAdminPlatform = lazyWithRetry(() => import("../pages/SuperAdminPlatform").then(m => ({ default: m.SuperAdminPlatform || m.default })));

export interface DashboardShellProps {
  initialTab?: string;
  initialSubTab?: "LEADS" | "PROFORMAS" | "INVOICES" | "TEMPLATES";
}

export function DashboardShell({ initialTab }: DashboardShellProps = {}) {
  const { user: authUser, role: authRole, logout } = useAuth();
  const currentRole: Role = (authRole as Role) || "OWNER";

  const {
    business: liveBusiness,
    branches: liveBranches = [],
    departments: liveDepartments = [],
    employees = [],
    ledgerTransactions = [],
    payrollRecords = [],
    attendanceRecords = [],
    forensicLogs = [],
    leaves = [],
    events = [],
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
          notifications: events?.length || 0,
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
          notificationCount={events?.length || 0}
          currentRole={currentRole}
          userSlot={
            <UserDropdown
              currentUser={{ name: authUser?.displayName || "Administrateur", email: authUser?.email || "" }}
              currentRole={currentRole}
              onLogout={logout}
            />
          }
        />

        {/* 3. Main Workspace Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950" id="finops-workspace-content">
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
              <SuperAdminPlatform initialTab="tenants" />
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
                payrollCycles={[]}
                payrollRecords={payrollRecords}
                attendanceRecords={attendanceRecords}
                onLockCycle={() => {}}
                onAddCycle={() => {}}
                onUpdateCycle={() => {}}
                onAddRecords={() => {}}
                onAddForensicLog={() => {}}
                onAddEvent={() => {}}
                onAddTransaction={() => {}}
              />
            )}

            {normalizedActiveTab === "ledger" && (
              <ConnectedFinanceLedger />
            )}

            {normalizedActiveTab === "attendance" && (
              <AttendanceLedger
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees}
                attendanceRecords={attendanceRecords}
                branches={liveBranches}
                departments={liveDepartments}
              />
            )}

            {normalizedActiveTab === "planning" && (
              <AttendanceLedger
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees}
                attendanceRecords={attendanceRecords}
                branches={liveBranches}
                departments={liveDepartments}
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
                currentUser={{ name: authUser?.displayName || "Administrateur", id: authUser?.uid || "usr_1" }}
                currentUserId={authUser?.uid}
                current_business_id={liveBusiness?.id || "BIZ_MAIN"}
                employees={employees || []}
                employeeContracts={[]}
              />
            )}

            {normalizedActiveTab === "employeeSpace" && (
              <MyWorkspace
                employee={
                  employees.find((e) => e.firebase_uid === authUser?.uid || (e.email && authUser?.email && e.email.toLowerCase() === authUser.email.toLowerCase())) ||
                  employees[0]
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

      {/* 5. Notification Center Drawer */}
      <NotificationCenter
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={(events || []).map((e: any) => ({
          id: e.id,
          title: e.type || "Notification Système",
          message: e.payload?.message || "Événement ERP enregistré",
          timestamp: e.timestamp,
        }))}
      />
    </div>
  );
}

export default DashboardShell;

