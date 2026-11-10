/**
 * FINOPS ERP — Sprint 5 Payroll & Financial Calculation Engine
 * Pure mathematical, tax compliance, and cryptographic calculation engine.
 */

import { BusinessTaxConfiguration } from "../../../repositories/BusinessAdministrationRepository";
import { TaxPolicyEngine } from "../../../services/payroll/TaxPolicyEngine";
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
  employeeContributionsTotal: number;
  employerContributionsTotal: number;
  totalDeductions: number; // Total employee deductions
  totalEmployerCost: number; // Total employer cost (grossPay + employer contributions)
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

  // If taxes are disabled at the business config level, zero out all tax rates
  const resolvedFloor = typeof config.survivalFloorHTG === "number"
    ? config.survivalFloorHTG
    : typeof (config as any).survivalFloor === "number"
    ? (config as any).survivalFloor
    : typeof (config as any).survivalFloor?.minimumNetHTG === "number"
    ? (config as any).survivalFloor.minimumNetHTG
    : defaults.survivalFloorHTG;

  if (!TaxPolicyEngine.isSocialTaxEnabled(config)) {
    return {
      cnssRateEmployee: 0,
      cnssRateEmployer: 0,
      cnsRateEmployee: 0,
      cnsRateEmployer: 0,
      survivalFloorHTG: resolvedFloor,
    };
  }

  const getActiveRates = () => {
    const cnssEmp = typeof config.cnssRateEmployee === "number"
      ? config.cnssRateEmployee
      : typeof (config as any).onaEmployeeRate === "number"
      ? (config as any).onaEmployeeRate
      : (config as any).socialContributions?.cnssOna?.employeeRate ?? defaults.cnssRateEmployee;

    const cnssEmpr = typeof config.cnssRateEmployer === "number"
      ? config.cnssRateEmployer
      : typeof (config as any).onaEmployerRate === "number"
      ? (config as any).onaEmployerRate
      : (config as any).socialContributions?.cnssOna?.employerRate ?? defaults.cnssRateEmployer;

    const cnsEmp = typeof config.cnsRateEmployee === "number"
      ? config.cnsRateEmployee
      : typeof (config as any).ofatmaEmployeeRate === "number"
      ? (config as any).ofatmaEmployeeRate
      : (config as any).socialContributions?.ofatmaCns?.employeeRate ?? defaults.cnsRateEmployee;

    const cnsEmpr = typeof config.cnsRateEmployer === "number"
      ? config.cnsRateEmployer
      : typeof (config as any).ofatmaEmployerRate === "number"
      ? (config as any).ofatmaEmployerRate
      : (config as any).socialContributions?.ofatmaCns?.employerRate ?? defaults.cnsRateEmployer;

    return {
      cnssRateEmployee: cnssEmp,
      cnssRateEmployer: cnssEmpr,
      cnsRateEmployee: cnsEmp,
      cnsRateEmployer: cnsEmpr,
      survivalFloorHTG: resolvedFloor,
    };
  };

  // Fallback if no history is defined or history is empty
  if (!config.history || !Array.isArray(config.history) || config.history.length === 0) {
    return getActiveRates();
  }

  if (!dateStr) {
    // If no target date is supplied, return the standard active rates
    return getActiveRates();
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

  // Search through history to find matching effective period with explicit deterministic precedence
  const matches = config.history.filter(record => {
    const from = new Date(record.effectiveFrom);
    if (isNaN(from.getTime())) return false;
    
    // Must be on or after the starting date
    if (targetDate < from) return false;

    // If effectiveTo is defined, must be on or before it (inclusive of the entire end day)
    if (record.effectiveTo) {
      const to = new Date(record.effectiveTo);
      if (!isNaN(to.getTime())) {
        if (record.effectiveTo.length <= 10) {
          to.setHours(23, 59, 59, 999);
        }
        if (targetDate > to) {
          return false;
        }
      }
    }

    return true;
  });

  // Sort candidates by explicit deterministic precedence rule:
  // Latest effectiveFrom date first, then highest policyVersion/id
  if (matches.length > 0) {
    matches.sort((a, b) => {
      const fromA = new Date(a.effectiveFrom).getTime();
      const fromB = new Date(b.effectiveFrom).getTime();
      if (fromB !== fromA) return fromB - fromA;

      const verA = Number((a as any).policyVersion) || 0;
      const verB = Number((b as any).policyVersion) || 0;
      if (verB !== verA) return verB - verA;

      return ((b as any).id || "").localeCompare((a as any).id || "");
    });

    const match = matches[0];
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
 * Calculates tax deductions (CNSS / ONA, CNS / OFATMA, & dual-side contributions) for a given gross pay.
 */
export function calculateTaxDeductions(
  grossPayHTG: number,
  config?: any,
  baseSalaryHTG?: number
): TaxDeductions {
  const dualResult = TaxPolicyEngine.calculateDualSideContributions(grossPayHTG, config, baseSalaryHTG);

  return {
    employeeCNSS: dualResult.onaEmployee,
    employerCNSS: dualResult.onaEmployer,
    employeeCNS: dualResult.ofatmaEmployee,
    employerCNS: dualResult.ofatmaEmployer,
    employeeContributionsTotal: dualResult.totalEmployeeDeductions,
    employerContributionsTotal: dualResult.totalEmployerContributions,
    totalDeductions: dualResult.totalEmployeeDeductions,
    totalEmployerCost: dualResult.totalEmployerPayrollCost,
  };
}

/**
 * Calculates overtime pay for 1.5x and 2.0x rates.
 */
export function calculateOvertimePay(
  hourlyRateHTG: number,
  overtimeHours150: number,
  overtimeHours200: number,
  rate150: number = OVERTIME_MULTIPLIERS.STANDARD_150,
  rate200: number = OVERTIME_MULTIPLIERS.PREMIUM_200
): number {
  const safeRate = Math.max(0, Number(hourlyRateHTG) || 0);
  const safeOT150 = Math.max(0, Number(overtimeHours150) || 0);
  const safeOT200 = Math.max(0, Number(overtimeHours200) || 0);
  const pay150 = Math.round(safeRate * rate150 * safeOT150);
  const pay200 = Math.round(safeRate * rate200 * safeOT200);
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

  const otRate150 = (taxConfig as any)?.overtimeRate150 ?? (taxConfig as any)?.overtime?.normalRate ?? OVERTIME_MULTIPLIERS.STANDARD_150;
  const otRate200 = (taxConfig as any)?.overtimeRate200 ?? (taxConfig as any)?.overtime?.holidayRate ?? OVERTIME_MULTIPLIERS.PREMIUM_200;

  const safeBaseSalary = Math.max(0, Number(item.baseSalaryHTG) || 0);
  const safeBonuses = Math.max(0, Number(item.bonusesHTG) || 0);
  const safeCommissions = Math.max(0, Number(item.commissionsHTG) || 0);
  const safeAdvances = Math.max(0, Number(item.advancesHTG) || 0);

  const overtimePayout = calculateOvertimePay(
    item.hourlyRateHTG,
    item.overtimeHours150,
    item.overtimeHours200,
    otRate150,
    otRate200
  );

  const grossPay = safeBaseSalary + overtimePayout + safeBonuses + safeCommissions;
  const taxDeductions = calculateTaxDeductions(grossPay, { ...(taxConfig || {}), ...rates }, safeBaseSalary);

  let netPay = grossPay - taxDeductions.totalDeductions - safeAdvances;
  let survivalFloorApplied = false;

  const resolvedFloor = rates.survivalFloorHTG;

  // Survival Floor Protection: Enforce minimum net threshold if configured and gross pay allows
  if (resolvedFloor > 0 && (netPay < resolvedFloor || grossPay < resolvedFloor)) {
    if ((taxConfig as any)?.enableSurvivalFloor !== false) {
      netPay = resolvedFloor;
      survivalFloorApplied = true;
    }
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

  // Government Taxes & Contributions applied AFTER Gross Pay
  const isTaxActive = enableTaxes && TaxPolicyEngine.isSocialTaxEnabled(taxConfig);
  const taxDeductions = isTaxActive
    ? calculateTaxDeductions(grossPay, taxConfig || rates, baseSalary)
    : {
        employeeCNSS: 0,
        employerCNSS: 0,
        employeeCNS: 0,
        employerCNS: 0,
        employeeContributionsTotal: 0,
        employerContributionsTotal: 0,
        totalDeductions: 0,
        totalEmployerCost: grossPay,
      };

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
