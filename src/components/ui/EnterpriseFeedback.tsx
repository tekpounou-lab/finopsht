import React from "react";
import { Inbox, Loader2, AlertCircle, CheckCircle2, ShieldAlert, WifiOff } from "lucide-react";

export const EmptyState: React.FC<{
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({
  title = "Aucune donnée disponible",
  description = "Il n'y a aucun élément à afficher pour le moment.",
  action,
  icon
}) => (
  <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-3 bg-slate-900/40 border border-slate-800/80 rounded-2xl">
    <div className="p-4 bg-slate-800/80 rounded-2xl text-slate-400">
      {icon || <Inbox className="w-8 h-8" />}
    </div>
    <div className="space-y-1 max-w-sm">
      <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </div>
    {action && <div className="pt-2">{action}</div>}
  </div>
);

export const LoadingOverlay: React.FC<{ message?: string }> = ({ message = "Chargement en cours..." }) => (
  <div className="absolute inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex flex-col items-center justify-center space-y-3">
    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
    <span className="text-xs font-semibold text-slate-200">{message}</span>
  </div>
);

export const PageLoader: React.FC<{ message?: string }> = ({ message = "Initialisation FINOPS ERP..." }) => (
  <div className="min-h-[400px] w-full flex flex-col items-center justify-center space-y-3">
    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
    <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{message}</span>
  </div>
);

export const LoadingSkeleton: React.FC<{ className?: string }> = ({ className = "h-6 w-full" }) => (
  <div className={`bg-slate-800/80 rounded-xl animate-pulse ${className}`} />
);

export const ProgressOverlay = LoadingOverlay;
export const ToastStack = () => null;
export const NotificationCenter = () => null;

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="p-6 bg-rose-950/40 border border-rose-800 rounded-2xl text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-rose-200">Une erreur inattendue est survenue</h3>
          <p className="text-xs text-rose-300/80 max-w-md mx-auto">{this.state.error?.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            Recharger la page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const RetryPanel: React.FC<{ onRetry: () => void; message?: string }> = ({ onRetry, message }) => (
  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-2">
    <p className="text-xs text-slate-300">{message || "Échec du chargement des données."}</p>
    <button
      type="button"
      onClick={onRetry}
      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg cursor-pointer"
    >
      Réessayer
    </button>
  </div>
);

export const SuccessBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
    <CheckCircle2 className="w-4 h-4 shrink-0" />
    <span>{message}</span>
  </div>
);

export const WarningBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs text-amber-300">
    <AlertCircle className="w-4 h-4 shrink-0" />
    <span>{message}</span>
  </div>
);

export const PermissionGuard: React.FC<{
  allowedRoles?: string[];
  currentRole?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ allowedRoles = [], currentRole = "", children, fallback }) => {
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentRole)) {
    return (
      fallback || (
        <div className="p-4 bg-rose-950/20 border border-rose-800/40 rounded-xl flex items-center gap-2.5 text-xs text-rose-300">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Accès restreint à votre rôle.</span>
        </div>
      )
    );
  }
  return <>{children}</>;
};

export const RoleGuard = PermissionGuard;
export const FeatureFlag: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({ enabled, children }) =>
  enabled ? <>{children}</> : null;

export const OfflineIndicator: React.FC = () => (
  <div className="fixed bottom-4 right-4 z-50 p-3 bg-rose-600 text-white rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold">
    <WifiOff className="w-4 h-4" /> Mode Hors Ligne
  </div>
);

export const OnlineIndicator = () => null;
export const ConnectionBanner = () => null;
export const SessionTimeoutWarning = () => null;
export const AutoSaveIndicator: React.FC<{ isSaving?: boolean }> = ({ isSaving }) => (
  <span className="text-[10px] text-slate-500 font-medium">
    {isSaving ? "Enregistrement automatique..." : "Tous les changements sont enregistrés"}
  </span>
);

export const VersionBadge: React.FC<{ version?: string }> = ({ version = "v2.5.0" }) => (
  <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 font-mono text-[10px] font-bold rounded-md">
    {version}
  </span>
);

export const EnvironmentBadge: React.FC<{ env?: string }> = ({ env = "PROD" }) => (
  <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-[10px] font-bold rounded-md uppercase">
    {env}
  </span>
);
