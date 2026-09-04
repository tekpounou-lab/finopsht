/**
 * FINOPS ERP — Sprint 5 Payroll & Financial Calculation Engine
 * Pure mathematical, tax compliance, and cryptographic calculation engine.
 */

import { BusinessTaxConfiguration } from "../../../repositories/BusinessAdministrationRepository";
import {
  STATUTORY_TAX_RATES,
  SURVIVAL_FLOOR_HTG,
  OVERTIME_MULTIPLIERS,
  TaxAuthority,
  resolveTaxAuthority,
} from "../../../constants/finance";

export interface TaxDeductions {
  employeeCNSS: number; // 6% ONA
  employerCNSS: number; // 6% ONA Employer
  employeeCNS: number;  // 2% OFATMA
  employerCNS: number;  // 3% OFATMA Employer
  totalDeductions: number;
}

export interface PayrollLineItem {
  baseSalaryHTG: number;
  overtimeHours150: number;
  overtimeHours200: number;
  hourlyRateHTG: number;
  bonusesHTG: number;
  commissionsHTG: number;
  advancesHTG: number;
}

export interface PayrollCalculationResult {
  baseSalary: number;
  overtimePayout: number;
  commissions: number;
  grossPay: number;
  taxDeductions: TaxDeductions;
  netPay: number;
  survivalFloorApplied: boolean;
  finalPayout: number;
  integritySeal: string;
}

const ONA_EMPLOYEE_RATE = STATUTORY_TAX_RATES.ONA.EMPLOYEE_RATE;
const ONA_EMPLOYER_RATE = STATUTORY_TAX_RATES.ONA.EMPLOYER_RATE;
const OFATMA_EMPLOYEE_RATE = STATUTORY_TAX_RATES.OFATMA.EMPLOYEE_RATE;
const OFATMA_EMPLOYER_RATE = STATUTORY_TAX_RATES.OFATMA.EMPLOYER_RATE_DEFAULT;

/**
 * Helper to resolve the correct tax rates and survival floor based on a target date.
 * If config is null or date is invalid, it falls back to the default rates.
 */
export function resolveTaxRatesForDate(
  config: BusinessTaxConfiguration | null,
  dateStr?: string
) {
  const defaults = {
    cnssRateEmployee: ONA_EMPLOYEE_RATE,
    cnssRateEmployer: ONA_EMPLOYER_RATE,
    cnsRateEmployee: OFATMA_EMPLOYEE_RATE,
    cnsRateEmployer: OFATMA_EMPLOYER_RATE,
    survivalFloorHTG: SURVIVAL_FLOOR_HTG,
  };

  if (!config) {
    return defaults;
  }

  // Fallback if no history is defined or history is empty
  if (!config.history || !Array.isArray(config.history) || config.history.length === 0) {
    return {
      cnssRateEmployee: typeof config.cnssRateEmployee === "number" ? config.cnssRateEmployee : defaults.cnssRateEmployee,
      cnssRateEmployer: typeof config.cnssRateEmployer === "number" ? config.cnssRateEmployer : defaults.cnssRateEmployer,
      cnsRateEmployee: typeof config.cnsRateEmployee === "number" ? config.cnsRateEmployee : defaults.cnsRateEmployee,
      cnsRateEmployer: typeof config.cnsRateEmployer === "number" ? config.cnsRateEmployer : defaults.cnsRateEmployer,
      survivalFloorHTG: typeof config.survivalFloorHTG === "number" ? config.survivalFloorHTG : defaults.survivalFloorHTG,
    };
  }

  if (!dateStr) {
    // If no target date is supplied, return the standard active rates
    return {
      cnssRateEmployee: typeof config.cnssRateEmployee === "number" ? config.cnssRateEmployee : defaults.cnssRateEmployee,
      cnssRateEmployer: typeof config.cnssRateEmployer === "number" ? config.cnssRateEmployer : defaults.cnssRateEmployer,
      cnsRateEmployee: typeof config.cnsRateEmployee === "number" ? config.cnsRateEmployee : defaults.cnsRateEmployee,
      cnsRateEmployer: typeof config.cnsRateEmployer === "number" ? config.cnsRateEmployer : defaults.cnsRateEmployer,
      survivalFloorHTG: typeof config.survivalFloorHTG === "number" ? config.survivalFloorHTG : defaults.survivalFloorHTG,
    };
  }

  // Parse target date
  const targetDate = new Date(dateStr);
  if (isNaN(targetDate.getTime())) {
    return {
      cnssRateEmployee: typeof config.cnssRateEmployee === "number" ? config.cnssRateEmployee : defaults.cnssRateEmployee,
      cnssRateEmployer: typeof config.cnssRateEmployer === "number" ? config.cnssRateEmployer : defaults.cnssRateEmployer,
      cnsRateEmployee: typeof config.cnsRateEmployee === "number" ? config.cnsRateEmployee : defaults.cnsRateEmployee,
      cnsRateEmployer: typeof config.cnsRateEmployer === "number" ? config.cnsRateEmployer : defaults.cnsRateEmployer,
      survivalFloorHTG: typeof config.survivalFloorHTG === "number" ? config.survivalFloorHTG : defaults.survivalFloorHTG,
    };
  }

  // Search through history to find matching effective period
  const match = config.history.find(record => {
    const from = new Date(record.effectiveFrom);
    if (isNaN(from.getTime())) return false;
    
    // Must be on or after the starting date
    if (targetDate < from) return false;

    // If effectiveTo is defined, must be on or before it
    if (record.effectiveTo) {
      const to = new Date(record.effectiveTo);
      if (!isNaN(to.getTime()) && targetDate > to) {
        return false;
      }
    }

    return true;
  });

  if (match) {
    return {
      cnssRateEmployee: match.cnssRateEmployee,
      cnssRateEmployer: match.cnssRateEmployer,
      cnsRateEmployee: match.cnsRateEmployee,
      cnsRateEmployer: match.cnsRateEmployer,
      survivalFloorHTG: match.survivalFloorHTG,
    };
  }

  // Fallback to active rates
  return {
    cnssRateEmployee: typeof config.cnssRateEmployee === "number" ? config.cnssRateEmployee : defaults.cnssRateEmployee,
    cnssRateEmployer: typeof config.cnssRateEmployer === "number" ? config.cnssRateEmployer : defaults.cnssRateEmployer,
    cnsRateEmployee: typeof config.cnsRateEmployee === "number" ? config.cnsRateEmployee : defaults.cnsRateEmployee,
    cnsRateEmployer: typeof config.cnsRateEmployer === "number" ? config.cnsRateEmployer : defaults.cnsRateEmployer,
    survivalFloorHTG: typeof config.survivalFloorHTG === "number" ? config.survivalFloorHTG : defaults.survivalFloorHTG,
  };
}

/**
 * Calculates tax deductions (CNSS / ONA & CNS / OFATMA) for a given gross pay.
 */
export function calculateTaxDeductions(
  grossPayHTG: number,
  config?: {
    cnssRateEmployee: number;
    cnssRateEmployer: number;
    cnsRateEmployee: number;
    cnsRateEmployer: number;
  }
): TaxDeductions {
  const cnssEmp = config?.cnssRateEmployee ?? ONA_EMPLOYEE_RATE;
  const cnssEmpr = config?.cnssRateEmployer ?? ONA_EMPLOYER_RATE;
  const cnsEmp = config?.cnsRateEmployee ?? OFATMA_EMPLOYEE_RATE;
  const cnsEmpr = config?.cnsRateEmployer ?? OFATMA_EMPLOYER_RATE;

  const employeeCNSS = Math.round(grossPayHTG * cnssEmp);
  const employerCNSS = Math.round(grossPayHTG * cnssEmpr);
  const employeeCNS = Math.round(grossPayHTG * cnsEmp);
  const employerCNS = Math.round(grossPayHTG * cnsEmpr);

  return {
    employeeCNSS,
    employerCNSS,
    employeeCNS,
    employerCNS,
    totalDeductions: employeeCNSS + employeeCNS
  };
}

/**
 * Calculates overtime pay for 1.5x and 2.0x rates.
 */
export function calculateOvertimePay(
  hourlyRateHTG: number,
  overtimeHours150: number,
  overtimeHours200: number
): number {
  const pay150 = Math.round(hourlyRateHTG * OVERTIME_MULTIPLIERS.STANDARD_150 * overtimeHours150);
  const pay200 = Math.round(hourlyRateHTG * OVERTIME_MULTIPLIERS.PREMIUM_200 * overtimeHours200);
  return pay150 + pay200;
}

/**
 * Calculates full payroll for a single employee line item with survival floor protection and cryptographic SHA-256 seal.
 */
export function calculateEmployeePayrollItem(
  item: PayrollLineItem,
  businessId: string,
  employeeId: string,
  periodKey: string,
  taxConfig?: BusinessTaxConfiguration
): PayrollCalculationResult {
  const rates = resolveTaxRatesForDate(taxConfig || null, periodKey);

  const overtimePayout = calculateOvertimePay(
    item.hourlyRateHTG,
    item.overtimeHours150,
    item.overtimeHours200
  );

  const grossPay = item.baseSalaryHTG + overtimePayout + item.bonusesHTG + item.commissionsHTG;
  const taxDeductions = calculateTaxDeductions(grossPay, rates);

  let netPay = grossPay - taxDeductions.totalDeductions - item.advancesHTG;
  let survivalFloorApplied = false;

  const resolvedFloor = rates.survivalFloorHTG;

  // Survival Floor Protection
  if (netPay < resolvedFloor && grossPay >= resolvedFloor) {
    netPay = resolvedFloor;
    survivalFloorApplied = true;
  }

  const finalPayout = Math.max(0, netPay);

  // Generate SHA-256 integrity seal deterministically
  const sealPayload = `${businessId}:${employeeId}:${periodKey}:${grossPay}:${finalPayout}`;
  const integritySeal = `SHA256::` + btoa(sealPayload).slice(0, 32).toUpperCase();

  return {
    baseSalary: item.baseSalaryHTG,
    overtimePayout,
    commissions: item.commissionsHTG,
    grossPay,
    taxDeductions,
    netPay,
    survivalFloorApplied,
    finalPayout,
    integritySeal
  };
}

/**
 * Generates an audit hash seal for a payroll run sheet or forensic log stream.
 */
import { PayrollInputSnapshot } from "../../../types";

/**
 * Generates an audit hash seal for a payroll run sheet or forensic log stream.
 */
export function generateAuditSeal(
  businessId: string,
  recordCount: number,
  totalGrossHTG: number,
  totalNetHTG: number
): string {
  const payload = `FINOPS_SPRINT5:${businessId}:${recordCount}:${totalGrossHTG}:${totalNetHTG}:${Date.now()}`;
  return "SHA256::" + btoa(payload).replace(/=/g, "").toUpperCase();
}

export interface SnapshotPayrollResult extends PayrollCalculationResult {
  snapshotId: string;
  payRegime: "FIXED" | "COMMISSION" | "HYBRID";
  primeAmount: number;
  penaltyAmount: number;
  manualBonus: number;
  manualDeduction: number;
  advances: number;
  grossPay: number;
  netPay: number;
}

/**
 * Calculates payroll ONLY from a PayrollInputSnapshot (Single Source of Truth).
 * The Payroll Engine NEVER queries Firestore directly.
 */
export function calculatePayrollFromSnapshot(
  snapshot: PayrollInputSnapshot,
  enableTaxes: boolean = true,
  taxConfig?: BusinessTaxConfiguration,
  calculationDate?: string
): SnapshotPayrollResult {
  const hr = snapshot.hr;
  const sales = snapshot.sales;
  const attendance = snapshot.attendance;
  const adjustments = snapshot.adjustments;

  const payRegime = hr?.pay_regime || "FIXED";
  const baseSalary = hr?.salary_base ?? (snapshot.baseSalaryHtg || 0);

  // Commission is taken strictly from snapshot (pre-calculated)
  const commissions = sales?.commission_amount ?? (snapshot.commissionsHtg || 0);

  // Attendance prime & penalty taken strictly from snapshot
  const primeAmount = attendance?.prime_amount ?? attendance?.prime ?? (snapshot.overtimeContribution || 0);
  const penaltyAmount = attendance?.penalty_amount ?? attendance?.penalty ?? ((snapshot.latePenaltiesHtg || 0) + (snapshot.absencePenaltiesHtg || 0));

  // Manual adjustments taken strictly from snapshot
  const manualBonus = adjustments?.manual_bonus ?? adjustments?.bonus ?? (snapshot.bonusesHtg || 0);
  const manualDeduction = adjustments?.manual_deduction ?? adjustments?.deduction ?? (snapshot.deductionsHtg?.other || 0);
  const advances = snapshot.advancesHtg || 0;

  // Phase 9 Formula Calculation
  let grossPay = 0;
  if (payRegime === "FIXED") {
    grossPay = baseSalary + primeAmount - penaltyAmount + manualBonus - manualDeduction;
  } else if (payRegime === "COMMISSION") {
    grossPay = commissions + primeAmount - penaltyAmount + manualBonus - manualDeduction;
  } else {
    // HYBRID
    grossPay = baseSalary + commissions + primeAmount - penaltyAmount + manualBonus - manualDeduction;
  }

  grossPay = Math.max(0, grossPay);

  // Determine calculation target date
  const targetDate = calculationDate || snapshot.generatedAt || new Date().toISOString();
  const rates = resolveTaxRatesForDate(taxConfig || null, targetDate);

  // Government Taxes applied AFTER Gross Pay
  const taxDeductions = enableTaxes
    ? calculateTaxDeductions(grossPay, rates)
    : { employeeCNSS: 0, employerCNSS: 0, employeeCNS: 0, employerCNS: 0, totalDeductions: 0 };

  let netPay = grossPay - taxDeductions.totalDeductions - advances;
  let survivalFloorApplied = false;

  const resolvedFloor = rates.survivalFloorHTG;

  if (netPay < resolvedFloor && grossPay >= resolvedFloor) {
    netPay = resolvedFloor;
    survivalFloorApplied = true;
  }

  const finalPayout = Math.max(0, netPay);
  const sealPayload = `${snapshot.business_id}:${snapshot.employee_id}:${snapshot.payroll_cycle_id || snapshot.cycleId}:${grossPay}:${finalPayout}:${snapshot.hash || snapshot.id}`;
  const integritySeal = `SHA256::` + btoa(sealPayload).slice(0, 32).toUpperCase();

  return {
    snapshotId: snapshot.id,
    payRegime,
    baseSalary,
    overtimePayout: primeAmount,
    commissions,
    primeAmount,
    penaltyAmount,
    manualBonus,
    manualDeduction,
    advances,
    grossPay,
    taxDeductions,
    netPay,
    survivalFloorApplied,
    finalPayout,
    integritySeal,
  };
}
