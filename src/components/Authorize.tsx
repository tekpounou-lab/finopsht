import React from "react";
import { PermissionService } from "../services/PermissionService";
import { useBusinessContext } from "../contexts/BusinessContext";
import { AlertCircle, ShieldAlert, Sparkles } from "lucide-react";

export interface AuthorizeProps {
  children: React.ReactNode;
  
  // High-fidelity capability/permission string
  capability?: string;
  permission?: string;
  
  // Specific feature module check
  module?: string;
  
  // Limit validations (validates subscription level limits dynamically)
  limitCheck?: {
    key: "employees" | "branches" | "users" | "storage" | "payroll_cycles";
    count: number;
  };

  // Behavior if authorization fails
  fallbackMode?: "hide" | "disable" | "readonly" | "upgrade_banner" | "custom";
  
  // Custom fallback element to render if fallbackMode is "custom"
  customFallback?: React.ReactNode;

  // Custom warning message
  message?: string;
}

export const Authorize: React.FC<AuthorizeProps> = ({
  children,
  capability,
  permission,
  module,
  limitCheck,
  fallbackMode = "hide",
  customFallback,
  message
}) => {
  // Check feature module activation & role authorization
  if (module && (!PermissionService.hasModule(module) || !PermissionService.hasRoleModuleAccess(undefined, module))) {
    const state = PermissionService.getFeatureState(module);
    
    if (fallbackMode === "hide") {
      return null;
    }
    
    if (state === "ENTERPRISE_ONLY" || fallbackMode === "upgrade_banner") {
      return (
        <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-center max-w-lg mx-auto">
          <Sparkles className="h-10 w-10 text-amber-500 mb-3 animate-pulse" />
          <h3 className="font-semibold text-slate-900 tracking-tight">Fonctionnalité Enterprise</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            Le module <strong className="text-slate-700 capitalize">{module}</strong> est restreint ou non autorisé pour votre profil.
          </p>
          <button className="mt-4 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition">
            Passer à Enterprise
          </button>
        </div>
      );
    }

    if (fallbackMode === "custom" && customFallback) {
      return <>{customFallback}</>;
    }

    return (
      <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        <span>Accès non autorisé au module {module}.</span>
      </div>
    );
  }

  // Check permissions/capabilities
  const checkKey = capability || permission;
  if (checkKey && !PermissionService.can(checkKey)) {
    if (fallbackMode === "hide") {
      return null;
    }

    if (fallbackMode === "custom" && customFallback) {
      return <>{customFallback}</>;
    }

    if (fallbackMode === "readonly" || fallbackMode === "disable") {
      return (
        <div className="opacity-60 pointer-events-none select-none relative">
          <div className="absolute inset-0 bg-white/5 z-10" />
          {children}
        </div>
      );
    }

    return (
      <div className="p-5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-3 max-w-md">
        <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-semibold text-amber-900">Accès restreint</h4>
          <p className="text-xs text-amber-700 mt-1">
            {message || "Vous n'avez pas l'autorisation d'accéder à ce composant ou d'effectuer cette action."}
          </p>
        </div>
      </div>
    );
  }

  // Check license limits
  if (limitCheck) {
    const limitRes = PermissionService.checkLimit(limitCheck.key, limitCheck.count);
    if (limitRes.exceeded) {
      if (fallbackMode === "hide") {
        return null;
      }

      if (fallbackMode === "custom" && customFallback) {
        return <>{customFallback}</>;
      }

      return (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <AlertCircle className="h-8 w-8 text-rose-600 mb-2" />
          <h3 className="font-semibold text-rose-900 tracking-tight">Limite de licence atteinte</h3>
          <p className="text-xs text-rose-700 mt-1">
            {limitRes.message || `La limite d'utilisation de ${limitCheck.key} pour votre forfait a été dépassée.`}
          </p>
          <button className="mt-4 px-4 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition">
            Mettre à niveau mon abonnement
          </button>
        </div>
      );
    }
  }

  // All checks passed
  return <>{children}</>;
};

export default Authorize;
