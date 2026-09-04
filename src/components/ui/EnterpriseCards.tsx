import React, { useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ArrowUpRight, HelpCircle } from "lucide-react";

export interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  variant?: "blue" | "emerald" | "amber" | "rose" | "purple" | "slate";
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  tooltip?: string;
}

const VARIANT_ICON_CLASSES = {
  blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  slate: "bg-slate-800 text-slate-300 border-slate-700"
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  variant = "blue",
  loading = false,
  onClick,
  className = "",
  tooltip
}) => {
  if (loading) {
    return (
      <div className={`p-4 sm:p-5 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse space-y-3 ${className}`}>
        <div className="h-4 bg-slate-800 rounded w-1/2" />
        <div className="h-7 bg-slate-800 rounded w-3/4" />
        <div className="h-3 bg-slate-800 rounded w-1/3" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group relative p-4 sm:p-5 bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/80 hover:border-slate-700 rounded-2xl transition duration-200 backdrop-blur-sm ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span className="truncate">{title}</span>
            {tooltip && (
              <span className="text-slate-500 hover:text-slate-300 transition" title={tooltip}>
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight leading-none truncate pt-1">
            {value}
          </div>
        </div>

        {icon && (
          <div className={`p-2.5 sm:p-3 rounded-xl border shrink-0 transition group-hover:scale-105 ${VARIANT_ICON_CLASSES[variant]}`}>
            {icon}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 gap-2">
          {trend ? (
            <div className={`flex items-center gap-1 font-semibold ${trend.isPositive !== false ? "text-emerald-400" : "text-rose-400"}`}>
              {trend.isPositive !== false ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{trend.value}</span>
              {trend.label && <span className="text-slate-400 font-normal ml-0.5">{trend.label}</span>}
            </div>
          ) : (
            <div className="truncate">{subtitle}</div>
          )}
          {onClick && <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" />}
        </div>
      )}
    </div>
  );
};

export const StatCard = MetricCard;
export const KpiCard = MetricCard;

export const InsightCard: React.FC<{
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  type?: "info" | "warning" | "success" | "critical";
}> = ({ title, description, icon, action, badge, type = "info" }) => {
  const typeStyles = {
    info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    critical: "bg-rose-500/10 border-rose-500/20 text-rose-400"
  };

  return (
    <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && <div className={`p-2 rounded-xl border ${typeStyles[type]}`}>{icon}</div>}
          <div>
            <h4 className="text-sm font-bold text-slate-100">{title}</h4>
            {badge && <div className="mt-0.5">{badge}</div>}
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-300 leading-relaxed">{description}</div>
      {action && <div className="pt-2 flex justify-end">{action}</div>}
    </div>
  );
};

export const SummaryCard: React.FC<{
  title: string;
  items: { label: string; value: React.ReactNode; highlight?: boolean }[];
  action?: React.ReactNode;
}> = ({ title, items, action }) => (
  <div className="p-4 sm:p-5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-4">
    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
      <h3 className="text-sm font-bold text-slate-200">{title}</h3>
      {action}
    </div>
    <div className="space-y-2.5">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{item.label}</span>
          <span className={`font-semibold ${item.highlight ? "text-emerald-400 font-bold" : "text-slate-200"}`}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export const DashboardCard: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
}> = ({ title, subtitle, actions, children, className = "", headerClassName = "" }) => (
  <div className={`bg-slate-900/60 border border-slate-800/80 rounded-2xl flex flex-col overflow-hidden backdrop-blur-sm ${className}`}>
    <div className={`p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between gap-3 bg-slate-900/40 ${headerClassName}`}>
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-100">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 font-medium">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
    <div className="p-4 sm:p-5 flex-1">{children}</div>
  </div>
);

export const ExpandableCard: React.FC<{
  title: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}> = ({ title, summary, children, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden transition">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between gap-4 text-left hover:bg-slate-800/40 transition cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="font-bold text-sm text-slate-100 truncate">{title}</div>
          {summary && <div className="text-xs text-slate-400 truncate hidden sm:block">{summary}</div>}
        </div>
        <div className="text-slate-400 shrink-0">
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>
      {isExpanded && <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">{children}</div>}
    </div>
  );
};

export const InfoCard: React.FC<{
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, children, icon }) => (
  <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex items-start gap-3">
    {icon && <div className="p-2 bg-slate-800 text-slate-300 rounded-lg shrink-0">{icon}</div>}
    <div className="space-y-1">
      <h4 className="text-xs font-bold text-slate-200">{title}</h4>
      <div className="text-xs text-slate-400 leading-relaxed">{children}</div>
    </div>
  </div>
);

export const ActionCard: React.FC<{
  title: string;
  description: string;
  buttonLabel: string;
  onAction: () => void;
  icon?: React.ReactNode;
  variant?: "emerald" | "blue" | "rose" | "amber";
}> = ({ title, description, buttonLabel, onAction, icon, variant = "blue" }) => {
  const btnVariants = {
    blue: "bg-blue-600 hover:bg-blue-500 text-white",
    emerald: "bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold",
    rose: "bg-rose-600 hover:bg-rose-500 text-white",
    amber: "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
  };

  return (
    <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
      <div className="flex items-start gap-3">
        {icon && <div className="p-2.5 bg-slate-800 rounded-xl text-slate-200">{icon}</div>}
        <div>
          <h4 className="text-sm font-bold text-slate-100">{title}</h4>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer transition ${btnVariants[variant]}`}
      >
        {buttonLabel}
      </button>
    </div>
  );
};
