import React, { lazy, Suspense } from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { isDateInSelectedPeriod } from "../modules/analytics/core/AnalyticsEngine";
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
  currentRole: Role;
  current_business_id: string;
  currentBranchId: string | null;
  branches: Branch[];
  departments: Department[];
  onAddTransaction: (t: LedgerTransaction) => void;
  onAddForensicLog: (log: ForensicLog) => void;
  onAddEvent: (ev: ERPEvent) => void;
  currentBusiness: Business;
  selectedMonth: number | string;
}

export const ConnectedFinanceLedger: React.FC<ConnectedFinanceLedgerProps> = (props) => {
  const { employees, ledgerTransactions } = useBusinessContext();
  
  const { selectedMonth, ...restProps } = props;

  return (
    <Suspense fallback={<div className="text-xs text-slate-500 italic p-4">Chargement du Grand Livre Financier...</div>}>
      <FinanceLedger
        {...restProps}
        selectedMonth={selectedMonth}
        employees={employees || []}
        ledgerTransactions={ledgerTransactions || []}
      />
    </Suspense>
  );
};

export default ConnectedFinanceLedger;
