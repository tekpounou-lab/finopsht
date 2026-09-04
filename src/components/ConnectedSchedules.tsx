import React from "react";
import { useBusinessContext } from "../contexts/BusinessContext";
import { 
  Employee, 
  Branch, 
  Department, 
  ForensicLog, 
  ERPEvent, 
  Role 
} from "../types";
import { Shift } from "./planning/types";
import Schedules from "../pages/Schedules";

interface ConnectedSchedulesProps {
  currentRole: Role;
  currentUser: Employee;
  branches: Branch[];
  departments: Department[];
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
  current_business_id?: string;
}

export const ConnectedSchedules: React.FC<ConnectedSchedulesProps> = (props) => {
  const { business, employees, shifts } = useBusinessContext();
  const { current_business_id, ...restProps } = props;

  return (
    <Schedules
      {...restProps}
      current_business_id={business?.id || current_business_id || ""}
      employees={employees || []}
      shifts={(shifts as Shift[]) || []}
    />
  );
};

export default ConnectedSchedules;
