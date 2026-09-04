import React from "react";
import { Calendar, Layers, ShieldCheck, CheckCircle2, XCircle, Bot, Sparkles, Send, Server, Activity } from "lucide-react";

export const PayrollPeriodSelector: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => (
  <div className="relative">
    <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    />
  </div>
);

export const PayrollTypeSelector: React.FC<{
  value: "REGULAR" | "BONUS" | "COMMISSION" | "THIRTEENTH";
  onChange: (type: any) => void;
}> = ({ value, onChange }) => (
  <div className="relative">
    <Layers className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="REGULAR">Cycle Régulier (Mensuel)</option>
      <option value="BONUS">Bonus / Primes</option>
      <option value="COMMISSION">Commissions</option>
      <option value="THIRTEENTH">13ème Mois (Bonus Annuel)</option>
    </select>
  </div>
);

export const PayrollApprovalPanel: React.FC<{
  status: string;
  onApprove: () => void;
  onReject: () => void;
  loading?: boolean;
}> = ({ status, onApprove, onReject, loading }) => (
  <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div className="flex items-center gap-2.5">
      <ShieldCheck className="w-5 h-5 text-blue-400" />
      <div>
        <div className="text-xs font-bold text-slate-100">Approbation du Cycle de Paie</div>
        <div className="text-[11px] text-slate-400">Statut actuel: {status}</div>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onReject}
        disabled={loading}
        className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl transition cursor-pointer"
      >
        Rejeter
      </button>
      <button
        type="button"
        onClick={onApprove}
        disabled={loading}
        className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-xl transition cursor-pointer"
      >
        Approuver & Verrouiller
      </button>
    </div>
  </div>
);

export const LeaveApprovalPanel = PayrollApprovalPanel;
export const AttendanceSummary = () => null;
export const EmployeeSelectorDialog = () => null;
export const BusinessSwitcher = () => null;
export const BranchSwitcher = () => null;
export const DepartmentSwitcher = () => null;
export const CostCenterSelector = () => null;
export const JournalPostingPreview = () => null;
export const AccountingPeriodSelector = PayrollPeriodSelector;
export const FiscalYearSelector = () => null;

export const AiMessage: React.FC<{ content: React.ReactNode; isUser?: boolean }> = ({
  content,
  isUser
}) => (
  <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
    <div className={`p-2 rounded-xl shrink-0 ${isUser ? "bg-blue-600 text-white" : "bg-purple-600/20 text-purple-400 border border-purple-500/30"}`}>
      {isUser ? "Vous" : <Bot className="w-4 h-4" />}
    </div>
    <div className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-xl ${
      isUser ? "bg-blue-600 text-white" : "bg-slate-900 border border-slate-800 text-slate-200"
    }`}>
      {content}
    </div>
  </div>
);

export const AiChatBubble = AiMessage;

export const AiThinking: React.FC<{ message?: string }> = ({ message = "L'IA analyse vos données FINOPS..." }) => (
  <div className="flex items-center gap-2.5 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-300 text-xs font-semibold animate-pulse">
    <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
    <span>{message}</span>
  </div>
);

export const PromptInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}> = ({ value, onChange, onSubmit, placeholder = "Demandez quelque chose à l'Assistant IA..." }) => (
  <div className="relative">
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      placeholder={placeholder}
      className="w-full pl-4 pr-12 py-3 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-2xl text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition"
    />
    <button
      type="button"
      onClick={onSubmit}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl cursor-pointer transition"
    >
      <Send className="w-4 h-4" />
    </button>
  </div>
);

export const ConversationHistory = () => null;
export const SuggestionCard = () => null;
export const InsightPanel = () => null;

export const AuditLogViewer = () => null;
export const PermissionMatrix = () => null;
export const RoleMatrix = () => null;

export const SystemHealthCard: React.FC<{ status?: string; uptime?: string }> = ({
  status = "OPÉRATIONNEL",
  uptime = "99.98%"
}) => (
  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
        <Server className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs font-bold text-slate-100">Serveurs ERP FINOPS</div>
        <div className="text-[11px] text-slate-400">Disponibilité: {uptime}</div>
      </div>
    </div>
    <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-full">
      {status}
    </span>
  </div>
);

export const ServerStatusCard = SystemHealthCard;
export const BackgroundJobs = () => null;
export const QueueMonitor = () => null;
