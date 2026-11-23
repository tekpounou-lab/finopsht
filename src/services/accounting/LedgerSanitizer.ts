import { LedgerTransaction } from "../../types";
import { CHART_OF_ACCOUNTS, AmountCentsSchema } from "../../constants/finance";

export const DEFAULT_CHART_OF_ACCOUNTS = CHART_OF_ACCOUNTS;

export const validateDoubleEntry = (tx: Partial<LedgerTransaction>): boolean => {
  if (!tx.debit_account || !tx.credit_account) {
    return false;
  }
  if (tx.amount_cents === undefined || tx.amount_cents <= 0) {
    return false;
  }
  const parsed = AmountCentsSchema.safeParse(tx.amount_cents);
  return parsed.success;
};

export const applyDoubleEntryRules = <T extends Partial<LedgerTransaction>>(tx: T): T => {
  const immutableTx: T = { ...tx, isImmutable: true };

  if (immutableTx.debit_account && immutableTx.credit_account) {
    return immutableTx;
  }

  switch (immutableTx.type) {
    case "INCOME":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING;
      break;
    case "EXPENSE":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.EXPENSES.GENERAL;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      break;
    case "PAYROLL":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.EXPENSES.PAYROLL;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      break;
    case "ADVANCE":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.ADVANCES;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      break;
    case "REFUND":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.EXPENSES.GENERAL;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      break;
    case "CORRECTION":
    case "ADJUSTMENT":
    case "REVERSAL":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.EQUITY.RETAINED_EARNINGS;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      break;
    case "BONUS":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.EXPENSES.PAYROLL;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      break;
    case "PENALTY":
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.EXPENSES.PAYROLL;
      break;
    default:
      immutableTx.debit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
      immutableTx.credit_account = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
  }

  immutableTx.isLocked = true;
  return immutableTx;
};

export interface TransactionSanitizationContext {
  defaultBranchId?: string;
  defaultDepartmentId?: string;
  defaultCostCenter?: string;
  branches?: Array<{ id: string; code?: string; name?: string; business_id?: string }>;
  departments?: Array<{ id: string; code?: string; name?: string; business_id?: string }>;
  employees?: Array<{ id: string; branchId?: string; branch_id?: string; departmentId?: string; department_id?: string; name?: string; email?: string }>;
}

export const sanitizeAndEnrichLedgerTransaction = <T extends Partial<LedgerTransaction>>(
  tx: T,
  businessId: string,
  context?: TransactionSanitizationContext
): LedgerTransaction => {
  const resolvedBusinessId = businessId || tx.business_id || (tx as any).businessId || "BIZ_MAIN";

  const enrichedAccounts = applyDoubleEntryRules(tx);
  let debitAccount = (enrichedAccounts.debit_account || "").trim();
  let creditAccount = (enrichedAccounts.credit_account || "").trim();

  if (!debitAccount || debitAccount === "none" || debitAccount === "ORPHAN") {
    debitAccount = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
  }
  if (!creditAccount || creditAccount === "none" || creditAccount === "ORPHAN") {
    creditAccount = DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING;
  }
  if (debitAccount === creditAccount) {
    if (debitAccount === DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK) {
      creditAccount = DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING;
    } else {
      debitAccount = DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
    }
  }

  const amountCents = enrichedAccounts.amount_cents ?? (
    enrichedAccounts.amount !== undefined ? Math.round(Number(enrichedAccounts.amount) * 100) : 0
  );
  const amount = enrichedAccounts.amount ?? (amountCents / 100);

  const empId = enrichedAccounts.employeeId || (enrichedAccounts as any).employee_id;
  let empBranch: string | undefined;
  let empDept: string | undefined;
  let matchedEmpName: string | undefined;

  if (empId && context?.employees && context.employees.length > 0) {
    const foundEmp = context.employees.find(
      e => e.id === empId || (e.email && e.email.toLowerCase() === empId.toLowerCase())
    );
    if (foundEmp) {
      empBranch = foundEmp.branchId || (foundEmp as any).branch_id;
      empDept = foundEmp.departmentId || (foundEmp as any).department_id;
      matchedEmpName = foundEmp.name;
    }
  }

  let rawBranch = (enrichedAccounts.branchId || (enrichedAccounts as any).branch_id || empBranch || "").trim();
  if (!rawBranch || rawBranch === "none" || rawBranch === "ORPHAN" || rawBranch === "UNASSIGNED" || rawBranch === "SANS_SUCCURSALE") {
    rawBranch = context?.defaultBranchId || (context?.branches && context.branches[0]?.id) || "main";
  } else if (context?.branches && context.branches.length > 0) {
    const match = context.branches.find(
      b => b.id === rawBranch ||
           b.code?.trim().toUpperCase() === rawBranch.toUpperCase() ||
           b.name?.trim().toUpperCase() === rawBranch.toUpperCase()
    );
    if (match) rawBranch = match.id;
  }

  let rawDept = (enrichedAccounts.departmentId || (enrichedAccounts as any).department_id || empDept || "").trim();
  if (!rawDept || rawDept === "none" || rawDept === "ORPHAN" || rawDept === "UNASSIGNED") {
    rawDept = context?.defaultDepartmentId || (context?.departments && context.departments[0]?.id) || "operations";
  } else if (context?.departments && context.departments.length > 0) {
    const match = context.departments.find(
      d => d.id === rawDept ||
           d.code?.trim().toUpperCase() === rawDept.toUpperCase() ||
           d.name?.trim().toUpperCase() === rawDept.toUpperCase()
    );
    if (match) rawDept = match.id;
  }

  let rawCostCenter = ((enrichedAccounts as any).cost_center_id || (enrichedAccounts as any).costCenterId || rawBranch || "").trim();
  if (!rawCostCenter || rawCostCenter === "none" || rawCostCenter === "ORPHAN" || rawCostCenter === "UNASSIGNED") {
    rawCostCenter = rawBranch || context?.defaultCostCenter || "main";
  }

  const finalTx: LedgerTransaction = {
    ...enrichedAccounts,
    id: enrichedAccounts.id || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    business_id: resolvedBusinessId,
    businessId: resolvedBusinessId,
    cost_center_id: rawCostCenter,
    costCenterId: rawCostCenter,
    branchId: rawBranch,
    branch_id: rawBranch,
    departmentId: rawDept,
    department_id: rawDept,
    employeeId: empId || undefined,
    employee_id: empId || undefined,
    employeeName: enrichedAccounts.employeeName || (enrichedAccounts as any).employee_name || matchedEmpName,
    employee_name: enrichedAccounts.employeeName || (enrichedAccounts as any).employee_name || matchedEmpName,
    debit_account: debitAccount,
    credit_account: creditAccount,
    debit: enrichedAccounts.debit ?? amount,
    credit: enrichedAccounts.credit ?? amount,
    debit_cents: enrichedAccounts.debit_cents ?? amountCents,
    credit_cents: enrichedAccounts.credit_cents ?? amountCents,
    amount,
    amount_cents: amountCents,
    type: (enrichedAccounts.type as any) || "INCOME",
    description: enrichedAccounts.description || "Écriture générale",
    date: enrichedAccounts.date || new Date().toISOString(),
    category: enrichedAccounts.category || "General",
    signerId: enrichedAccounts.signerId || "SYSTEM",
    currency: (enrichedAccounts.currency as any) || "HTG",
    status: (enrichedAccounts.status as any) || "POSTED",
    source: (enrichedAccounts.source as any) || "MANUAL",
    isLocked: true,
    isImmutable: true,
    updated_at: enrichedAccounts.updated_at || new Date().toISOString()
  };

  return finalTx;
};
