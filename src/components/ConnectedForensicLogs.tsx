import React from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { ForensicLog, Employee } from "../types";
import ForensicLogs from "./ForensicLogs";

interface ConnectedForensicLogsProps {
  current_business_id: string;
  currentUser?: any;
  employees?: Employee[];
}

export const ConnectedForensicLogs: React.FC<ConnectedForensicLogsProps> = (props) => {
  const { forensicLogs, employees } = useBusinessContext();
  const { employees: propsEmployees, ...restProps } = props;

  return (
    <ForensicLogs
      {...restProps}
      forensicLogs={forensicLogs || []}
      employees={employees || propsEmployees || []}
    />
  );
};

export default ConnectedForensicLogs;
