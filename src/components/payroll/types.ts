import { 
  PayrollCycle, 
  PayrollRecord, 
  Employee, 
  SalaryStructure, 
  SalaryAdvance, 
  PayrollBonus, 
  PayrollDeduction, 
  CorrectionRecord 
} from "../../types";

export type { 
  PayrollCycle, 
  PayrollRecord, 
  Employee, 
  SalaryStructure, 
  SalaryAdvance, 
  PayrollBonus, 
  PayrollDeduction, 
  CorrectionRecord 
};

export interface PayrollHeaderProps {
  l: {
    engineTitle: string;
    tagline: string;
    customCycle: string;
    complianceOn: string;
    complianceOff: string;
  };
  onOpenCreateCycle: () => void;
  enableSocialTaxes: boolean;
  onToggleSocialTaxes: () => void;
  activeCycleId: string;
  onSelectCycleId: (id: string) => void;
  tenantCycles: Array<{ id: string; cycleName: string; status: string }>;
}

export interface PayrollSummaryCardsProps {
  cycleStatus: string;
  isPaid: boolean;
  totalWages: {
    baseHTG: number;
    commsHTG: number;
    overtimeHTG: number;
    cnssPatronHTG: number;
    netHTG: number;
    totalCompanyExposure: number;
  };
  enableSocialTaxes: boolean;
  totalCostsLabel: string;
}
