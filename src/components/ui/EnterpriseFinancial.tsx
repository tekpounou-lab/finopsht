import React from "react";
import { DollarSign, User, Building, TrendingUp, TrendingDown, FileText } from "lucide-react";

export interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  locale?: string;
  showSign?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = "HTG",
  locale = "fr-FR",
  showSign = false,
  size = "md",
  className = ""
}) => {
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency === "HTG" ? "USD" : currency, // fallback format string if needed
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Math.abs(amount)).replace("$", "HTG ");

  const sizeClasses = {
    xs: "text-xs font-semibold",
    sm: "text-xs sm:text-sm font-bold",
    md: "text-sm sm:text-base font-bold",
    lg: "text-lg sm:text-xl font-black tracking-tight",
    xl: "text-2xl sm:text-3xl font-black tracking-tight"
  };

  const isNegative = amount < 0;

  return (
    <span className={`font-mono ${sizeClasses[size]} ${isNegative ? "text-rose-400" : ""} ${className}`}>
      {isNegative ? "-" : showSign && amount > 0 ? "+" : ""}
      {formatted}
    </span>
  );
};

export const MoneyField = CurrencyDisplay;

export const MoneyBadge: React.FC<{ amount: number; currency?: string }> = ({
  amount,
  currency = "HTG"
}) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
      amount >= 0
        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
        : "bg-rose-500/10 border-rose-500/30 text-rose-400"
    }`}
  >
    <CurrencyDisplay amount={amount} currency={currency} size="xs" />
  </span>
);

export const AmountDifference: React.FC<{ current: number; previous: number }> = ({
  current,
  previous
}) => {
  const diff = current - previous;
  const isPositive = diff >= 0;

  return (
    <div className={`flex items-center gap-1 text-xs font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
      {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      <span>{isPositive ? "+" : ""}{diff.toFixed(2)} HTG</span>
    </div>
  );
};

export const BalanceCard: React.FC<{ title: string; balance: number; currency?: string }> = ({
  title,
  balance,
  currency = "HTG"
}) => (
  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
    <div className="text-xs font-bold text-slate-400 uppercase">{title}</div>
    <div className="text-xl sm:text-2xl font-black text-slate-100 font-mono">
      <CurrencyDisplay amount={balance} currency={currency} size="lg" />
    </div>
  </div>
);

export const JournalEntryPreview: React.FC<{
  entryNumber: string;
  date: string;
  lines: { account: string; debit: number; credit: number }[];
}> = ({ entryNumber, date, lines }) => (
  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
      <span className="font-bold text-slate-200">Pièce Comptable #{entryNumber}</span>
      <span className="text-slate-400 font-mono">{date}</span>
    </div>
    <table className="w-full text-xs text-left">
      <thead>
        <tr className="text-slate-400 border-b border-slate-800/60">
          <th className="py-1">Compte</th>
          <th className="py-1 text-right">Débit</th>
          <th className="py-1 text-right">Crédit</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800/40">
        {lines.map((l, idx) => (
          <tr key={idx}>
            <td className="py-1.5 font-mono text-slate-300">{l.account}</td>
            <td className="py-1.5 text-right font-mono text-emerald-400">{l.debit ? `${l.debit.toFixed(2)}` : "-"}</td>
            <td className="py-1.5 text-right font-mono text-rose-400">{l.credit ? `${l.credit.toFixed(2)}` : "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const LedgerPreview = JournalEntryPreview;

export const PayrollSummary: React.FC<{
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  count: number;
}> = ({ totalGross, totalDeductions, totalNet, count }) => (
  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
    <div>
      <div className="text-[11px] text-slate-400">Employés</div>
      <div className="text-base font-bold text-slate-100">{count}</div>
    </div>
    <div>
      <div className="text-[11px] text-slate-400">Brut Total</div>
      <div className="text-base font-bold text-slate-100 font-mono"><CurrencyDisplay amount={totalGross} size="sm" /></div>
    </div>
    <div>
      <div className="text-[11px] text-slate-400">Cotisations</div>
      <div className="text-base font-bold text-amber-400 font-mono"><CurrencyDisplay amount={totalDeductions} size="sm" /></div>
    </div>
    <div>
      <div className="text-[11px] text-slate-400">Masse Nette</div>
      <div className="text-base font-bold text-emerald-400 font-mono"><CurrencyDisplay amount={totalNet} size="sm" /></div>
    </div>
  </div>
);

export const PayslipPreview: React.FC<{ employeeName: string; netPay: number; period: string }> = ({
  employeeName,
  netPay,
  period
}) => (
  <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
        <FileText className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs font-bold text-slate-100">{employeeName}</div>
        <div className="text-[11px] text-slate-400">Période: {period}</div>
      </div>
    </div>
    <div className="text-right">
      <div className="text-[11px] text-slate-400">Salaire Net</div>
      <div className="text-sm font-bold text-emerald-400 font-mono"><CurrencyDisplay amount={netPay} size="sm" /></div>
    </div>
  </div>
);

export const EmployeeAvatar: React.FC<{ name: string; avatarUrl?: string; size?: "sm" | "md" | "lg" }> = ({
  name,
  avatarUrl,
  size = "md"
}) => {
  const sizeMap = {
    sm: "w-7 h-7 text-[10px]",
    md: "w-9 h-9 text-xs",
    lg: "w-12 h-12 text-sm"
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${sizeMap[size]} rounded-full object-cover border border-slate-700`} />;
  }

  return (
    <div className={`${sizeMap[size]} rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 border border-blue-400/30`}>
      {initials || <User className="w-4 h-4" />}
    </div>
  );
};

export const EmployeeCard: React.FC<{ name: string; role: string; department?: string }> = ({
  name,
  role,
  department
}) => (
  <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl flex items-center gap-3">
    <EmployeeAvatar name={name} size="md" />
    <div>
      <div className="text-xs font-bold text-slate-100">{name}</div>
      <div className="text-[11px] text-slate-400">{role} {department ? `• ${department}` : ""}</div>
    </div>
  </div>
);

export const EmployeeQuickView = EmployeeCard;
export const EmployeeBadge = EmployeeAvatar;
export const EmployeeStatus = () => null;
export const DepartmentTree = () => null;
export const OrganizationChart = () => null;
export const ScheduleCalendar = () => null;
export const AttendanceHeatmap = () => null;
