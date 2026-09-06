import React from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAuth } from "../hooks/useAuth";
import { Business, Branch, Department, ForensicLog, ERPEvent, Role } from "../types";
import BusinessIntelligence from "./BusinessIntelligence";

interface ConnectedBusinessIntelligenceProps {
  currentRole?: Role;
  currentBusiness?: Business;
  currentBranch?: Branch | null;
  branches?: Branch[];
  departments?: Department[];
  onAddForensicLog?: (log: ForensicLog) => void;
  onAddEvent?: (ev: ERPEvent) => void;
  employees?: any[];
  ledgerTransactions?: any[];
  payrollRecords?: any[];
  attendanceRecords?: any[];
  current_business_id?: string;
}

export const ConnectedBusinessIntelligence: React.FC<ConnectedBusinessIntelligenceProps> = (props) => {
  const { role } = useAuth();
  const { 
    business, 
    branches: liveBranches = [], 
    departments: liveDepartments = [], 
    employees: liveEmployees = [], 
    ledgerTransactions: liveTransactions = [], 
    payrollRecords: livePayroll = [], 
    attendanceRecords: liveAttendance = [], 
    forensicLogs: liveForensic = [], 
    isLoading 
  } = useBusinessContext();
  
  const currentRole = props.currentRole || (role as Role) || "OWNER";
  const activeBusiness = business || props.currentBusiness || ({
    id: props.current_business_id || "BIZ_MAIN",
    name: "Entreprise Principale",
    status: "ACTIVE"
  } as Business);

  const branches = props.branches || liveBranches || [];
  const departments = props.departments || liveDepartments || [];
  const currentBranch = props.currentBranch !== undefined ? props.currentBranch : (branches[0] || null);
  const onAddForensicLog = props.onAddForensicLog || (() => {});
  const onAddEvent = props.onAddEvent || (() => {});

  const employees = props.employees || liveEmployees || [];
  const ledgerTransactions = props.ledgerTransactions || liveTransactions || [];
  const payrollRecords = props.payrollRecords || livePayroll || [];
  const attendanceRecords = props.attendanceRecords || liveAttendance || [];
  const forensicLogs = liveForensic || [];

  return (
    <BusinessIntelligence
      currentRole={currentRole}
      currentBusiness={activeBusiness}
      currentBranch={currentBranch}
      branches={branches}
      departments={departments}
      onAddForensicLog={onAddForensicLog}
      onAddEvent={onAddEvent}
      employees={employees}
      ledgerTransactions={ledgerTransactions}
      payrollRecords={payrollRecords}
      attendanceRecords={attendanceRecords}
      forensicLogs={forensicLogs}
      isLoading={isLoading && (!employees.length && !ledgerTransactions.length)}
    />
  );
};

export default ConnectedBusinessIntelligence;
