export interface LedgerFilterParams {
  type: string[];
  category: string;
  branchId: string[];
  departmentId: string[];
  employeeId: string[];
  period: string; // MM-YYYY or 'ALL'
  startDate?: string;
  endDate?: string;
  search: string;
  status?: string;
}

export interface SavedLedgerView {
  id: string;
  name: string;
  filters: LedgerFilterParams;
}

export type LedgerEntryStatus = 'DRAFT' | 'VALIDATED' | 'POSTED' | 'LOCKED' | 'REVERSED' | 'COMPENSATED' | 'ARCHIVED';

export type TransactionType = 'INCOME' | 'EXPENSE' | 'ADVANCE' | 'TRANSFER' | 'PAYROLL' | 'BONUS' | 'PENALTY' | 'ADJUSTMENT' | 'REVERSAL' | 'COMPENSATION';

// This is an extension of the existing LedgerTransaction, we'll keep using the base LedgerTransaction where possible, but we'll treat the application representation carefully.
