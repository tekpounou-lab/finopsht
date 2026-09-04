import React from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { Business, Branch, Department, ForensicLog, ERPEvent, Role } from "../types";
import BusinessIntelligence from "./BusinessIntelligence";

interface ConnectedBusinessIntelligenceProps {
  currentRole: Role;
  currentBusiness?: Business;
  currentBranch: Branch | null;
  branches: Branch[];
  departments: Department[];
  onAddForensicLog: (log: ForensicLog) => void;
  onAddEvent: (ev: ERPEvent) => void;
}

export const ConnectedBusinessIntelligence: React.FC<ConnectedBusinessIntelligenceProps> = (props) => {
  const { business, employees, ledgerTransactions, payrollRecords, attendanceRecords, forensicLogs, isLoading } = useBusinessContext();
  
  // Destructure currentBusiness if passed, but prioritize the live business from context
  const { currentBusiness, ...restProps } = props;
  const activeBusiness = business || currentBusiness;

  if (isLoading || !activeBusiness) {
    return (
      <div className="text-xs text-slate-500 italic p-6 text-center">
        Chargement de la Console Business Intelligence...
      </div>
    );
  }

  return (
    <BusinessIntelligence
      {...restProps}
      currentBusiness={activeBusiness}
      employees={employees || []}
      ledgerTransactions={ledgerTransactions || []}
      payrollRecords={payrollRecords || []}
      attendanceRecords={attendanceRecords || []}
      forensicLogs={forensicLogs || []}
      isLoading={isLoading}
    />
  );
};

export default ConnectedBusinessIntelligence;
