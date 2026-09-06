import React, { lazy, Suspense } from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAuth } from "../hooks/useAuth";
import { 
  Business, 
  Branch, 
  Department, 
  Employee, 
  LedgerTransaction, 
  ForensicLog, 
  ERPEvent, 
  Role 
} from "../types";

import FinanceLedger from "../pages/FinanceLedger";

interface ConnectedFinanceLedgerProps {
  currentRole?: Role;
  current_business_id?: string;
  currentBranchId?: string | null;
  branches?: Branch[];
  departments?: Department[];
  onAddTransaction?: (t: LedgerTransaction) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
  onAddEvent?: (ev: ERPEvent) => void;
  currentBusiness?: Business;
  selectedMonth?: number | string;
  employees?: Employee[];
  ledgerTransactions?: LedgerTransaction[];
}

export const ConnectedFinanceLedger: React.FC<ConnectedFinanceLedgerProps> = (props) => {
  const { role } = useAuth();
  const { 
    business: liveBusiness, 
    branches: liveBranches = [], 
    departments: liveDepartments = [], 
    employees: liveEmployees = [], 
    ledgerTransactions: liveTransactions = [] 
  } = useBusinessContext();
  
  const currentRole = props.currentRole || (role as Role) || "OWNER";
  const current_business_id = props.current_business_id || liveBusiness?.id || "BIZ_MAIN";
  const currentBranchId = props.currentBranchId ?? (liveBranches[0]?.id || null);
  const currentBusiness = props.currentBusiness || liveBusiness || ({ id: current_business_id, name: liveBusiness?.name || "Entreprise" } as Business);
  const branches = props.branches || liveBranches || [];
  const departments = props.departments || liveDepartments || [];
  const selectedMonth = props.selectedMonth || new Date().getMonth() + 1;
  const employees = props.employees || liveEmployees || [];
  const ledgerTransactions = props.ledgerTransactions || liveTransactions || [];
  const onAddTransaction = props.onAddTransaction || (() => {});
  const onAddForensicLog = props.onAddForensicLog || (() => {});
  const onAddEvent = props.onAddEvent || (() => {});

  return (
    <Suspense fallback={<div className="text-xs text-slate-500 italic p-4">Chargement du Grand Livre Financier...</div>}>
      <FinanceLedger
        currentRole={currentRole}
        current_business_id={current_business_id}
        currentBranchId={currentBranchId}
        currentBusiness={currentBusiness}
        branches={branches}
        departments={departments}
        selectedMonth={selectedMonth}
        employees={employees}
        ledgerTransactions={ledgerTransactions}
        onAddTransaction={onAddTransaction}
        onAddForensicLog={onAddForensicLog}
        onAddEvent={onAddEvent}
      />
    </Suspense>
  );
};

export default ConnectedFinanceLedger;
