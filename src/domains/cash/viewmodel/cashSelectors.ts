/**
 * FINOPS ERP — Cash View Model Selectors
 * Phase 4 SSOT View Model Selectors
 *
 * Pure selector functions for UI consumption of CashBasisViewModel.
 * Ensures strict prohibition of independent UI financial recalculation.
 */

import type {
  CashBasisViewModel,
  CashExecutiveSummary,
  CashWorkforceSummary,
  CashPayrollSummary,
  CashDepartmentSummary,
  CashReportsSummary,
  CashPredictiveSummary,
} from './cashViewModel.types';

export function selectExecutiveSummary(vm: CashBasisViewModel): CashExecutiveSummary {
  return vm.executive;
}

export function selectWorkforceSummary(vm: CashBasisViewModel): CashWorkforceSummary {
  return vm.workforce;
}

export function selectPayrollSummary(vm: CashBasisViewModel): CashPayrollSummary {
  return vm.payroll;
}

export function selectDepartmentSummary(vm: CashBasisViewModel): CashDepartmentSummary {
  return vm.departments;
}

export function selectReportsSummary(vm: CashBasisViewModel): CashReportsSummary {
  return vm.reports;
}

export function selectPredictiveSummary(vm: CashBasisViewModel): CashPredictiveSummary {
  return vm.predictive;
}
