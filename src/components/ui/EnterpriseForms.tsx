import React from "react";
import { DollarSign, Percent, Phone, MapPin, Calendar, Clock, User, Building, Building2, Briefcase } from "lucide-react";

export const FieldLabel: React.FC<{
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}> = ({ children, required, htmlFor, className = "" }) => (
  <label htmlFor={htmlFor} className={`block text-xs font-semibold text-slate-300 ${className}`}>
    {children}
    {required && <span className="text-rose-400 ml-0.5">*</span>}
  </label>
);

export const FieldHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] text-slate-400 mt-1">{children}</p>
);

export const FieldError: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!children) return null;
  return <p className="text-[11px] text-rose-400 font-semibold mt-1 animate-fadeIn">{children}</p>;
};

export const FormGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = ""
}) => <div className={`space-y-1.5 ${className}`}>{children}</div>;

export const FormSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <div className="space-y-4 pt-4 first:pt-0 border-t border-slate-800/80 first:border-t-0">
    <div>
      <h3 className="text-sm font-bold text-slate-100">{title}</h3>
      {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
  </div>
);

export const FormActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-end gap-3">{children}</div>
);

export const CurrencyInput: React.FC<{
  value: number | string;
  onChange: (val: number) => void;
  currency?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}> = ({ value, onChange, currency = "HTG", placeholder = "0.00", disabled, error }) => (
  <div className="relative">
    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
      {currency}
    </div>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full pl-12 pr-3 py-2 bg-slate-950/80 border ${
        error ? "border-rose-500" : "border-slate-800 focus:border-blue-500"
      } rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition font-mono`}
    />
  </div>
);

export const PercentageInput: React.FC<{
  value: number | string;
  onChange: (val: number) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => (
  <div className="relative">
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      disabled={disabled}
      placeholder="0"
      className="w-full pl-3 pr-8 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-100 focus:outline-none transition font-mono"
    />
    <Percent className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
  </div>
);

export const PhoneInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => (
  <div className="relative">
    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="tel"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="+509 ...."
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-100 focus:outline-none transition"
    />
  </div>
);

export const AddressInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => (
  <div className="relative">
    <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Adresse complète..."
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-100 focus:outline-none transition"
    />
  </div>
);

export const SimpleDateRangeInput: React.FC<{
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}> = ({ startDate, endDate, onChange }) => (
  <div className="flex items-center gap-2">
    <div className="relative flex-1">
      <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="date"
        value={startDate}
        onChange={(e) => onChange(e.target.value, endDate)}
        className="w-full pl-8 pr-2 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-200 focus:outline-none"
      />
    </div>
    <span className="text-xs text-slate-500">à</span>
    <div className="relative flex-1">
      <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="date"
        value={endDate}
        onChange={(e) => onChange(startDate, e.target.value)}
        className="w-full pl-8 pr-2 py-2 bg-slate-950/80 border border-slate-800 focus:border-blue-500 rounded-xl text-xs text-slate-200 focus:outline-none"
      />
    </div>
  </div>
);

export const MonthPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <input
    type="month"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
  />
);

export const YearPicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(parseInt(e.target.value))}
    className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
  >
    {[2024, 2025, 2026, 2027, 2028].map((y) => (
      <option key={y} value={y}>
        {y}
      </option>
    ))}
  </select>
);

export const TimePicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <div className="relative">
    <Clock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="pl-8 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    />
  </div>
);

export const DurationPicker = TimePicker;

export const EmployeeSelector: React.FC<{
  value?: string;
  onChange: (id: string) => void;
  employees?: { id: string; name: string }[];
}> = ({ value, onChange, employees = [] }) => (
  <div className="relative">
    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="">Sélectionner un employé...</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  </div>
);

export const DepartmentSelector: React.FC<{
  value?: string;
  onChange: (id: string) => void;
  departments?: { id: string; name: string }[];
}> = ({ value, onChange, departments = [] }) => (
  <div className="relative">
    <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="">Tous les départements</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  </div>
);

export const BranchSelector: React.FC<{
  value?: string;
  onChange: (id: string) => void;
  branches?: { id: string; name: string }[];
}> = ({ value, onChange, branches = [] }) => (
  <div className="relative">
    <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="">Toutes les succursales</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  </div>
);

export const BusinessSelector = BranchSelector;

export const RoleSelector: React.FC<{ value?: string; onChange: (role: string) => void }> = ({
  value,
  onChange
}) => (
  <div className="relative">
    <Briefcase className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none"
    >
      <option value="EMPLOYEE">Employé</option>
      <option value="MANAGER">Manager</option>
      <option value="ADMIN">Administrateur</option>
      <option value="OWNER">Propriétaire</option>
    </select>
  </div>
);
