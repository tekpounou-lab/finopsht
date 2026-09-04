/**
 * FINOPS ERP - Accounting & General Ledger Types
 * Strict double-entry accounting schema, financial snapshots, reconciliation, and audit.
 */

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountDefinition {
  code: string;
  name: string;
  category: AccountCategory;
  normalBalance: 'DEBIT' | 'CREDIT';
  description?: string;
}

export interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName?: string;
  debitCents: number;
  creditCents: number;
  description?: string;
  departmentId?: string;
  branchId?: string;
}

export interface JournalEntry {
  id: string;
  businessId: string;
  date: string;
  reference: string;
  source: 'MANUAL' | 'INVOICE' | 'PAYROLL' | 'COMMISSION' | 'BANK_FEED' | 'IMPORT' | 'ADJUSTMENT';
  sourceId?: string;
  description: string;
  currency: 'HTG' | 'USD';
  exchangeRate?: number;
  lines: JournalLine[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
  isLocked: boolean;
  signature?: string;
  createdBy?: string;
  createdAt: string;
}

export interface TrialBalanceItem {
  accountCode: string;
  accountName: string;
  category: AccountCategory;
  debitCents: number;
  creditCents: number;
  netBalanceCents: number; // positive for debit normal, negative for credit normal
}

export interface TrialBalance {
  asOfDate: string;
  businessId: string;
  currency: string;
  items: TrialBalanceItem[];
  totalDebitCents: number;
  totalCreditCents: number;
  isBalanced: boolean;
}

export interface BalanceSheetSection {
  title: string;
  accounts: { code: string; name: string; balanceCents: number }[];
  totalCents: number;
}

export interface BalanceSheet {
  asOfDate: string;
  businessId: string;
  currency: string;
  assets: {
    currentAssets: BalanceSheetSection;
    nonCurrentAssets: BalanceSheetSection;
    totalAssetsCents: number;
  };
  liabilities: {
    currentLiabilities: BalanceSheetSection;
    longTermLiabilities: BalanceSheetSection;
    totalLiabilitiesCents: number;
  };
  equity: {
    retainedEarningsCents: number;
    capitalCents: number;
    currentPeriodNetIncomeCents: number;
    totalEquityCents: number;
  };
  isBalanced: boolean; // Assets = Liabilities + Equity
  equilibriumDeltaCents: number;
}

export interface IncomeStatement {
  startDate: string;
  endDate: string;
  businessId: string;
  currency: string;
  revenue: {
    operatingRevenueCents: number;
    otherRevenueCents: number;
    totalRevenueCents: number;
  };
  costOfSalesCents: number;
  grossProfitCents: number;
  operatingExpenses: {
    payrollExpensesCents: number;
    employerTaxesCents: number;
    generalExpensesCents: number;
    depreciationCents: number;
    totalOperatingExpensesCents: number;
  };
  operatingIncomeCents: number; // EBIT
  financialExpensesCents: number;
  taxExpensesCents: number;
  netIncomeCents: number;
  profitMarginPercentage: number;
}

export interface FinancialRatios {
  currentRatio: number; // Current Assets / Current Liabilities
  quickRatio: number; // (Current Assets - Inventory) / Current Liabilities
  workingCapitalCents: number; // Current Assets - Current Liabilities
  debtToEquityRatio: number; // Total Liabilities / Total Equity
  grossMarginPercentage: number;
  netMarginPercentage: number;
  returnOnEquityPercentage: number;
  cashRunwayMonths: number;
  monthlyBurnRateCents: number;
}

export interface FinancialSnapshot {
  id: string;
  businessId: string;
  periodType: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM';
  startDate: string;
  endDate: string;
  generatedAt: string;
  generatedBy?: string;
  currency: string;
  trialBalance: TrialBalance;
  balanceSheet: BalanceSheet;
  incomeStatement: IncomeStatement;
  ratios: FinancialRatios;
  signature?: string;
  isFrozen: boolean;
}

export interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  amountCents: number; // positive for deposit/credit, negative for withdrawal/debit
  reference?: string;
  balanceAfterCents?: number;
  matchedTransactionId?: string;
  reconciliationStatus: 'UNMATCHED' | 'EXACT_MATCH' | 'SUGGESTED_MATCH' | 'MANUAL_MATCH' | 'RECONCILED' | 'IGNORED';
  matchConfidenceScore?: number; // 0 to 100
}

export interface BankReconciliation {
  id: string;
  businessId: string;
  bankAccountCode: string;
  statementStartDate: string;
  statementEndDate: string;
  statementOpeningBalanceCents: number;
  statementClosingBalanceCents: number;
  ledgerOpeningBalanceCents: number;
  ledgerClosingBalanceCents: number;
  statementLines: BankStatementLine[];
  reconciledCount: number;
  unreconciledCount: number;
  discrepancyDeltaCents: number;
  isBalanced: boolean;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'LOCKED';
  reconciledBy?: string;
  reconciledAt?: string;
  notes?: string;
}

export interface LedgerAnomaly {
  type: 'UNBALANCED_ENTRY' | 'ORPHAN_ACCOUNT' | 'MISSING_BRANCH' | 'MISSING_DEPARTMENT' | 'INVALID_AMOUNT' | 'TAMPERED_HASH' | 'DUPLICATE_ENTRY';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  transactionId: string;
  description: string;
  details: Record<string, any>;
  isAutoReparable: boolean;
  remediationAction?: string;
}

export interface LedgerAuditReport {
  timestamp: string;
  businessId: string;
  totalTransactionsAudited: number;
  totalDebitCents: number;
  totalCreditCents: number;
  isDoubleEntryBalanced: boolean;
  balanceDifferenceCents: number;
  integrityScore: number; // 0-100
  anomalies: LedgerAnomaly[];
  hashChainValid: boolean;
  reparableCount: number;
}

export interface TransactionImportRow {
  date: string;
  description: string;
  debitAmount?: number;
  creditAmount?: number;
  amount?: number;
  type?: string;
  accountCode?: string;
  counterAccountCode?: string;
  currency?: string;
  branchCode?: string;
  departmentCode?: string;
  employeeEmail?: string;
  reference?: string;
}

export interface ImportValidationResult {
  validRows: TransactionImportRow[];
  invalidRows: { row: TransactionImportRow; errors: string[]; index: number }[];
  duplicateRows: { row: TransactionImportRow; matchedTransactionId: string; index: number }[];
  totalDebitSum: number;
  totalCreditSum: number;
  isBalanced: boolean;
}
