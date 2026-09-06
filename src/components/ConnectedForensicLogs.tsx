import React from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAuth } from "../hooks/useAuth";
import { ForensicLog, Employee } from "../types";
import ForensicLogs from "./ForensicLogs";

interface ConnectedForensicLogsProps {
  current_business_id?: string;
  currentUser?: any;
  employees?: Employee[];
}

export const ConnectedForensicLogs: React.FC<ConnectedForensicLogsProps> = (props) => {
  const { user: authUser } = useAuth();
  const { forensicLogs, employees, business } = useBusinessContext();
  const { employees: propsEmployees, current_business_id, currentUser, ...restProps } = props;

  const effectiveBusinessId = current_business_id || business?.id || "BIZ_MAIN";
  const effectiveUser = currentUser || { name: authUser?.displayName || "Admin System", id: authUser?.uid || "usr_1" };

  return (
    <ForensicLogs
      {...restProps}
      current_business_id={effectiveBusinessId}
      currentUser={effectiveUser}
      forensicLogs={forensicLogs || []}
      employees={employees || propsEmployees || []}
    />
  );
};

export default ConnectedForensicLogs;
