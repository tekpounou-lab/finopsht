import React from "react";
import { CreatePayrollCycleDialog, CreatePayrollCycleDialogProps } from "./CreatePayrollCycleDialog";

export type CreateCycleModalProps = CreatePayrollCycleDialogProps;

/**
 * Re-export of CreatePayrollCycleDialog for backward compatibility.
 */
export const CreateCycleModal: React.FC<CreateCycleModalProps> = (props) => {
  return <CreatePayrollCycleDialog {...props} />;
};

export { CreatePayrollCycleDialog };
