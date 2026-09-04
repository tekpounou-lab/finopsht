import React, { useMemo } from "react";
import PerformanceAndCommissionsTab from "./workforce/PerformanceAndCommissionsTab";
import { Employee, LedgerTransaction, EmployeeContract, PayrollCycle } from "../types";

interface Props {
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  employeeContracts: EmployeeContract[];
  language?: "fr" | "en" | "ht";
}

export default function ConnectedWorkforcePerformance({
  employees,
  ledgerTransactions,
  employeeContracts,
  language
}: Props) {
  // Infer active cycle from current date for real-time display, or you could pass it down if DashboardShell tracks it globally
  const activeCycle = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return {
      id: `live_${year}_${month}`,
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-31`,
      status: "DRAFT"
    } as PayrollCycle;
  }, []);

  return (
    <PerformanceAndCommissionsTab
      employees={employees}
      ledgerTransactions={ledgerTransactions}
      employeeContracts={employeeContracts}
      activeCycle={activeCycle}
      language={language}
    />
  );
}
