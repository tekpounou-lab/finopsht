import React, { useEffect, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Centralized Navigation Engine & Guards
import { 
  AuthNavigationEngine, 
  ProtectedRoute, 
  SuperAdminRoute, 
  BusinessRoute,
  CrmRoute
} from "../navigation";

import { ResolveRoute } from "./ResolveRoute";
import UnifiedAuthPortal from "../components/UnifiedAuthPortal";
import { lazyWithRetry } from "../utils/lazyWithRetry";

// Lazy-loaded routes for code splitting
const DashboardShell = lazyWithRetry(() => import("../components/DashboardShell").then((m: any) => ({ default: m.DashboardShell || m.default })));
const LandingPage = lazyWithRetry(() => import("../pages/LandingPage").then((m: any) => ({ default: m.LandingPage || m.default })));
const AcceptInvitation = lazyWithRetry(() => import("../pages/AcceptInvitation").then((m: any) => ({ default: m.AcceptInvitation || m.default })));
const WaitingRoom = lazyWithRetry(() => import("../pages/WaitingRoom").then((m: any) => ({ default: m.WaitingRoom || m.default })));
const WaitingApproval = lazyWithRetry(() => import("../pages/WaitingApproval").then((m: any) => ({ default: m.WaitingApproval || m.default })));
const ApprovalPending = lazyWithRetry(() => import("../pages/ApprovalPending").then((m: any) => ({ default: m.ApprovalPending || m.default })));
const OnboardingChoice = lazyWithRetry(() => import("../pages/onboarding/OnboardingChoice").then((m: any) => ({ default: m.OnboardingChoice || m.default })));
const AccountRecovery = lazyWithRetry(() => import("../pages/AccountRecovery").then((m: any) => ({ default: m.AccountRecovery || m.default })));
const SuperAdminPlatform = lazyWithRetry(() => import("../pages/SuperAdminPlatform").then((m: any) => ({ default: m.SuperAdminPlatform || m.default })));
const OperationsLayout = lazyWithRetry(() => import("../components/admin/OperationsLayout").then((m: any) => ({ default: m.OperationsLayout || m.default })));
const DesignSystemCatalog = lazyWithRetry(() => import("../components/DesignSystemCatalog").then((m: any) => ({ default: m.DesignSystemCatalog || m.default })));
const PerformanceIntelligenceCenter = lazyWithRetry(() => import("../pages/PerformanceIntelligenceCenter").then((m: any) => ({ default: m.PerformanceIntelligenceCenter || m.default })));

function PageFallback() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-3">
      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Chargement du module FINOPS ERP...</div>
    </div>
  );
}

function UnifiedAuthPortalWrapper() {
  const navigate = useNavigate();

  return (
    <UnifiedAuthPortal 
      businesses={[]} 
      branches={[]} 
      departments={[]} 
      invitations={[]} 
      onLoginSuccess={() => {
        navigate("/resolve");
      }} 
      onAddForensicLog={() => {}} 
      onAddEvent={() => {}} 
    />
  );
}

function ForceLogout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    logout().then(() => {
      navigate("/", { replace: true });
    });
  }, [logout, navigate]);

  return <div className="p-8 text-white">Déconnexion forcée en cours...</div>;
}

function LandingPageWrapper({ allowLoggedIn = false }: { allowLoggedIn?: boolean }) {
  const navigate = useNavigate();
  const { user, targetRoute } = useAuth();

  return (
    <LandingPage 
      allowLoggedIn={allowLoggedIn}
      onEnterApp={() => {
        if (user) {
          navigate(targetRoute || "/resolve");
        } else {
          navigate("/login");
        }
      }} 
    />
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageFallback />}>
      {/* Centralized Global Reactive Navigation Engine */}
      <AuthNavigationEngine />
      
      <Routes>
        <Route path="/" element={<LandingPageWrapper />} />
        <Route path="/landing" element={<LandingPageWrapper allowLoggedIn={true} />} />
        
        <Route path="/resolve" element={<ResolveRoute />} />
        <Route path="/force-logout" element={<ForceLogout />} />
        
        <Route path="/login" element={<UnifiedAuthPortalWrapper />} />
        <Route path="/join-company" element={<UnifiedAuthPortalWrapper />} />
        
        <Route path="/waiting-room" element={<ProtectedRoute><WaitingRoom /></ProtectedRoute>} />
        
        <Route path="/invitation-pending" element={<BusinessRoute><AcceptInvitation /></BusinessRoute>} />
        <Route path="/accept-invitation" element={<BusinessRoute><AcceptInvitation /></BusinessRoute>} />
        <Route path="/onboarding-choice" element={<BusinessRoute><OnboardingChoice /></BusinessRoute>} />
        <Route path="/create-business" element={<BusinessRoute><DashboardShell /></BusinessRoute>} />
        <Route path="/onboarding" element={<BusinessRoute><DashboardShell /></BusinessRoute>} />
        <Route path="/workspace" element={<BusinessRoute><DashboardShell /></BusinessRoute>} />
        <Route path="/dashboard" element={<BusinessRoute><DashboardShell /></BusinessRoute>} />
        <Route path="/manager" element={<BusinessRoute><DashboardShell /></BusinessRoute>} />
        <Route path="/supervisor" element={<BusinessRoute><DashboardShell /></BusinessRoute>} />
        
        <Route path="/waiting-approval" element={<BusinessRoute><WaitingApproval /></BusinessRoute>} />
        <Route path="/approval-pending" element={<BusinessRoute><ApprovalPending /></BusinessRoute>} />
        <Route path="/account-recovery" element={<BusinessRoute><AccountRecovery /></BusinessRoute>} />
        <Route path="/operations" element={<BusinessRoute><OperationsLayout /></BusinessRoute>} />
        <Route path="/performance-intelligence" element={<BusinessRoute><PerformanceIntelligenceCenter /></BusinessRoute>} />
        <Route path="/pic" element={<BusinessRoute><PerformanceIntelligenceCenter /></BusinessRoute>} />
        <Route path="/admin/design-system" element={<BusinessRoute><DesignSystemCatalog /></BusinessRoute>} />
        <Route path="/dev/ui" element={<BusinessRoute><DesignSystemCatalog /></BusinessRoute>} />

        {/* CRM Commercial Suite (Authorized for OWNER, ADMIN, MANAGER, and SUPER_ADMIN) */}
        <Route path="/crm" element={<CrmRoute><DashboardShell initialTab="crm" /></CrmRoute>} />
        <Route path="/leads" element={<CrmRoute><DashboardShell initialTab="crm" initialSubTab="LEADS" /></CrmRoute>} />
        <Route path="/prospects" element={<CrmRoute><DashboardShell initialTab="crm" initialSubTab="LEADS" /></CrmRoute>} />
        <Route path="/proformas" element={<CrmRoute><DashboardShell initialTab="crm" initialSubTab="PROFORMAS" /></CrmRoute>} />
        <Route path="/invoices" element={<CrmRoute><DashboardShell initialTab="crm" initialSubTab="INVOICES" /></CrmRoute>} />
        <Route path="/invoice-template" element={<CrmRoute><DashboardShell initialTab="crm" initialSubTab="TEMPLATES" /></CrmRoute>} />
        <Route path="/invoice_template" element={<CrmRoute><DashboardShell initialTab="crm" initialSubTab="TEMPLATES" /></CrmRoute>} />

        {/* Platform Supervision & System SRE Modules (Super Admin Only) */}
        <Route path="/admin/pending-businesses" element={<SuperAdminRoute><DashboardShell initialTab="platform" initialSubTab="PENDING" /></SuperAdminRoute>} />
        <Route path="/admin/pending_businesses" element={<SuperAdminRoute><DashboardShell initialTab="platform" initialSubTab="PENDING" /></SuperAdminRoute>} />
        <Route path="/platform/pending" element={<SuperAdminRoute><DashboardShell initialTab="platform" initialSubTab="PENDING" /></SuperAdminRoute>} />
        <Route path="/platform" element={<SuperAdminRoute><DashboardShell initialTab="platform" /></SuperAdminRoute>} />
        <Route path="/platform/*" element={<SuperAdminRoute><DashboardShell initialTab="platform" /></SuperAdminRoute>} />
        <Route path="/super-admin" element={<SuperAdminRoute><DashboardShell initialTab="platform" /></SuperAdminRoute>} />
        <Route path="/forensic" element={<BusinessRoute><DashboardShell initialTab="forensic" /></BusinessRoute>} />
        <Route path="/system/forensic" element={<BusinessRoute><DashboardShell initialTab="forensic" /></BusinessRoute>} />
        <Route path="/health" element={<SuperAdminRoute><DashboardShell initialTab="health" /></SuperAdminRoute>} />
        <Route path="/system-health" element={<SuperAdminRoute><DashboardShell initialTab="health" /></SuperAdminRoute>} />
        <Route path="/system/health" element={<SuperAdminRoute><DashboardShell initialTab="health" /></SuperAdminRoute>} />
        <Route path="/reliability" element={<SuperAdminRoute><DashboardShell initialTab="reliability" /></SuperAdminRoute>} />
        <Route path="/system/reliability" element={<SuperAdminRoute><DashboardShell initialTab="reliability" /></SuperAdminRoute>} />
        <Route path="/recovery" element={<SuperAdminRoute><DashboardShell initialTab="recovery" /></SuperAdminRoute>} />
        <Route path="/disaster-recovery" element={<SuperAdminRoute><DashboardShell initialTab="recovery" /></SuperAdminRoute>} />
        <Route path="/system/recovery" element={<SuperAdminRoute><DashboardShell initialTab="recovery" /></SuperAdminRoute>} />
        
        <Route path="*" element={<Navigate to="/resolve" replace />} />
      </Routes>
    </Suspense>
  );
}
