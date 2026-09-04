import React from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isSuperAdminEmail } from "../config/superadmin";
import { ShieldAlert, LogOut, ArrowLeft } from "lucide-react";

/**
 * AccessDenied Screen
 * Displayed when an authenticated user attempts to access a module outside their RBAC privileges.
 * Does not reload the page; uses client-side SPA navigation via Link / logout.
 */
export const AccessDenied: React.FC<{
  title?: string;
  message?: string;
  requiredRole?: string;
}> = ({
  title = "Accès Restreint",
  message = "Vous ne disposez pas des autorisations requises pour accéder à ce module.",
  requiredRole
}) => {
  const { logout, targetRoute } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center">
        <div className="w-16 h-16 mx-auto mb-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-400">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-slate-100 mb-2">{title}</h2>
        <p className="text-sm text-slate-400 mb-4 leading-relaxed">{message}</p>
        
        {requiredRole && (
          <div className="inline-block px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-cyan-400 mb-6">
            Rôle requis : {requiredRole}
          </div>
        )}

        <div className="space-y-3">
          <Link
            to={targetRoute || "/dashboard"}
            className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/20"
          >
            <ArrowLeft className="w-4 h-4" />
            Retourner à mon espace
          </Link>

          <button
            onClick={() => logout()}
            className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-slate-100 text-sm font-medium rounded-xl transition flex items-center justify-center gap-2 border border-slate-700/50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * ProtectedRoute
 * Verifies active session. Renders loading indicator while isResolved is false.
 * Only redirects unauthenticated visitors to /login.
 */
export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isResolved, flowState } = useAuth();

  if (!isResolved) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-xs font-medium text-slate-400 tracking-wider uppercase">Authentification en cours...</div>
      </div>
    );
  }

  if (!user || flowState === "LOGGED_OUT" || flowState === "LANDING") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/**
 * SuperAdminRoute
 * Enforces SUPER_ADMIN access level.
 * Renders loading indicator while isResolved is false.
 */
export const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isResolved, role, flowState } = useAuth();

  if (!isResolved) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-xs font-medium text-slate-400 tracking-wider uppercase">Vérification des privilèges Super Admin...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isSuper = 
    role === "SUPER_ADMIN" || 
    flowState === "SUPER_ADMIN_ACTIVE" || 
    isSuperAdminEmail(user.email);

  if (!isSuper) {
    return <AccessDenied requiredRole="SUPER_ADMIN" message="Ce module est strictement réservé à la supervision plateforme Super Admin." />;
  }

  return <>{children}</>;
};

/**
 * BusinessRoute
 * Verifies authenticated workspace access.
 * Renders loading indicator while isResolved is false.
 */
export const BusinessRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isResolved } = useAuth();

  if (!isResolved) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-xs font-medium text-slate-400 tracking-wider uppercase">Chargement de l'espace entreprise...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/**
 * CrmRoute
 * Enforces CRM access (SUPER_ADMIN, OWNER, ADMIN, MANAGER).
 * Strictly blocks unauthorized roles like EMPLOYEE, SUPERVISOR, or unauthenticated visitors.
 */
export const CrmRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isResolved, role, flowState } = useAuth();

  if (!isResolved) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
        <div className="text-xs font-medium text-slate-400 tracking-wider uppercase">Vérification des droits CRM & Facturation...</div>
      </div>
    );
  }

  if (!user || flowState === "LOGGED_OUT" || flowState === "LANDING") {
    return <Navigate to="/login" replace />;
  }

  const userRole = (role || "").toUpperCase();
  const isAuthorized = 
    userRole === "SUPER_ADMIN" || 
    userRole === "OWNER" || 
    userRole === "ADMIN" || 
    userRole === "MANAGER" ||
    flowState === "SUPER_ADMIN_ACTIVE";

  if (!isAuthorized) {
    return (
      <AccessDenied 
        requiredRole="OWNER / SUPER_ADMIN" 
        message="Le module CRM (Contacts, Devis Proforma, Factures & Modèles) est réservé aux propriétaires, administrateurs et gestionnaires autorisés." 
      />
    );
  }

  return <>{children}</>;
};

