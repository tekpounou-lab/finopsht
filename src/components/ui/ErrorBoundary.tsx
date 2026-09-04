import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from "lucide-react";
import { LogSanitizer } from "../../services/security/LogSanitizer";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string;
}

export class EnterpriseErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: ""
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const eventId = `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      hasError: true,
      error,
      eventId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    const sanitizedError = LogSanitizer.sanitizePayload({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      section: this.props.sectionName || "APP_ROOT"
    });

    console.error(`[EnterpriseErrorBoundary] Caught UI Exception [${this.state.eventId}]:`, sanitizedError);
  }

  handleReload = (): void => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleHardRefresh = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = "/";
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isSectionLevel = Boolean(this.props.sectionName);

      if (isSectionLevel) {
        return (
          <div
            id="error-boundary-section"
            className="p-6 my-4 bg-slate-900/90 border border-amber-500/30 rounded-2xl text-slate-200 shadow-xl backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-100 mb-1">
                  {this.props.fallbackTitle || "Anomalie d'affichage de la section"}
                </h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  {this.props.fallbackMessage || "Un composant interne a rencontré une interruption contrôlée. Les données du système restent intègres."}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    id="btn-retry-section-error"
                    onClick={this.handleReload}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Réessayer
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          id="error-boundary-root"
          className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 text-slate-200"
        >
          <div className="max-w-md w-full p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl text-center">
            <div className="w-16 h-16 mx-auto mb-6 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-400">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-bold text-slate-100 mb-2">
              {this.props.fallbackTitle || "Interruption Sécurisée de l'Application"}
            </h1>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              {this.props.fallbackMessage || "Le moteur de rendu a intercepté une anomalie d'interface. Toutes vos opérations et transactions financières sont sauvegardées."}
            </p>

            <div className="p-3 mb-6 bg-slate-950/80 border border-slate-800 rounded-xl text-[11px] font-mono text-slate-400 text-left overflow-x-auto">
              <p className="text-slate-300 font-bold mb-1">Rapport de Diagnostic :</p>
              <p className="text-amber-400 font-bold">Code: {this.state.eventId}</p>
              <p className="text-slate-400 truncate">
                {this.state.error?.message ? LogSanitizer.sanitizeString(this.state.error.message) : "Unknown UI Render Exception"}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                id="btn-error-refresh"
                onClick={this.handleHardRefresh}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Actualiser la page
              </button>
              <button
                id="btn-error-home"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" />
                Accueil FinOps
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default EnterpriseErrorBoundary;
