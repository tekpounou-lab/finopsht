import React from "react";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Target, HelpCircle, Activity, ChevronRight, Gauge } from "lucide-react";
import { AreaChart, Area } from "recharts";
import { SafeChartContainer } from "../../../components/ui/SafeChartContainer";

export interface SmartKPICardProps {
  title: string;
  currentValue: number;
  previousValue: number;
  difference: number;
  percentage: number;
  trend: "UP" | "DOWN" | "STABLE";
  direction: "UP" | "DOWN" | "NEUTRAL";
  unit?: string;
  targetValue?: number;
  forecastValue?: number;
  confidenceScore?: number;
  status: "Healthy" | "Warning" | "Critical";
  sparklineData?: { value: number }[];
  onClick?: () => void;
}

export const SmartKPICard: React.FC<SmartKPICardProps> = ({
  title,
  currentValue,
  previousValue,
  difference,
  percentage,
  trend,
  direction,
  unit = "HTG",
  targetValue,
  forecastValue,
  confidenceScore = 93,
  status,
  sparklineData = [],
  onClick,
}) => {
  const isPositive = difference > 0.01;
  const isNegative = difference < -0.01;

  // Compute achievement %
  const achievementPct = targetValue && targetValue > 0 
    ? Math.round((currentValue / targetValue) * 100) 
    : undefined;

  // Determine status color classes
  const statusColorMap = {
    Healthy: {
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      accent: "border-l-emerald-500"
    },
    Warning: {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      accent: "border-l-amber-500"
    },
    Critical: {
      text: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
      accent: "border-l-rose-500"
    }
  };

  const statusStyle = statusColorMap[status] || statusColorMap.Healthy;

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01, boxShadow: "0 12px 24px -8px rgba(0, 0, 0, 0.5)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onClick={onClick}
      className={`relative bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between min-h-[14rem] transition-all overflow-hidden ${onClick ? "cursor-pointer select-none active:scale-[0.99]" : ""} border-l-4 ${statusStyle.accent}`}
    >
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full filter blur-2xl pointer-events-none"></div>

      {/* Card Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider font-sans truncate">
          {title}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
            {status.toUpperCase()}
          </span>
          {onClick && <ChevronRight className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 transition" />}
        </div>
      </div>

      {/* Core Value Block */}
      <div className="my-1.5">
        <div className="flex items-baseline gap-1.5 overflow-hidden">
          <span className="text-2xl font-black font-mono text-slate-100 tracking-tight truncate">
            {currentValue.toLocaleString()}
          </span>
          <span className="text-[10px] text-slate-500 font-bold uppercase">{unit}</span>
        </div>

        {/* Change stats */}
        <div className="flex items-center gap-1.5 mt-1">
          {isPositive ? (
            <span className="flex items-center text-xs font-bold text-emerald-400 font-mono">
              <TrendingUp className="w-3 h-3 mr-0.5 shrink-0" />
              +{percentage.toFixed(1)}%
            </span>
          ) : isNegative ? (
            <span className="flex items-center text-xs font-bold text-rose-400 font-mono">
              <TrendingDown className="w-3 h-3 mr-0.5 shrink-0" />
              {percentage.toFixed(1)}%
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-400 font-mono">0.0%</span>
          )}
          <span className="text-[10px] text-slate-500 font-normal">
            vs {previousValue.toLocaleString()} {unit}
          </span>
        </div>
      </div>

      {/* Target & Achievement & Forecast */}
      <div className="grid grid-cols-2 gap-3 pt-3 pb-2 border-t border-slate-800/60 text-[10px] font-sans">
        {targetValue !== undefined && (
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Target className="w-2.5 h-2.5 text-slate-400" /> Target
            </span>
            <span className="text-slate-300 font-bold font-mono">
              {targetValue.toLocaleString()} {unit}
            </span>
            {achievementPct !== undefined && (
              <span className={`font-semibold ${achievementPct >= 100 ? "text-emerald-400" : "text-amber-400"}`}>
                {achievementPct}% achieved
              </span>
            )}
          </div>
        )}

        {forecastValue !== undefined && (
          <div className="flex flex-col gap-0.5">
            <span className="text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Activity className="w-2.5 h-2.5 text-slate-400" /> Forecast
            </span>
            <span className="text-slate-300 font-bold font-mono">
              {Math.round(forecastValue).toLocaleString()} {unit}
            </span>
            <span className="text-[9px] text-slate-500 font-mono">
              Conf: {confidenceScore}%
            </span>
          </div>
        )}
      </div>

      {/* Sparkline Visual / Micro-Chart */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="h-8 mt-1.5 w-full opacity-65 group-hover:opacity-100 transition duration-300">
          <SafeChartContainer height="100%" minHeight={32}>
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id={`gradient_${title.replace(/\s+/g, "_")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isNegative ? "#ef4444" : "#06b6d4"} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={isNegative ? "#ef4444" : "#06b6d4"} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={isNegative ? "#ef4444" : "#06b6d4"}
                strokeWidth={1.5}
                fill={`url(#gradient_${title.replace(/\s+/g, "_")})`}
                dot={false}
              />
            </AreaChart>
          </SafeChartContainer>
        </div>
      )}

      {/* Interactive explanation prompt overlay / tooltip link */}
      <div className="text-[9px] text-slate-500 font-light mt-1.5 flex justify-between items-center">
        <span>Click for granular cause analysis</span>
        <HelpCircle className="w-3 h-3 text-slate-600 hover:text-slate-400 transition" />
      </div>
    </motion.div>
  );
};
