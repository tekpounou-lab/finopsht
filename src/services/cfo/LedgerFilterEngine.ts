import { LedgerTransaction, Branch, Department, Employee, Role } from "../../types";
import { LedgerFilterParams } from "../../components/ledger/types";

export type { LedgerFilterParams };

export interface LedgerSummaryMetrics {
  count: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  netCashflowCents: number;
  totalDebitsCents: number;
  totalCreditsCents: number;
  healthScore: number;
  transactionsWithBalance: (LedgerTransaction & { computedBalance: number })[];
}

export interface LedgerFilterContext {
  employees?: Employee[];
  branches?: Branch[];
  departments?: Department[];
  currentRole?: Role;
  currentBranchId?: string | null;
  businessId?: string;
}

/**
 * Safe date string extractor handling ISO strings, Firestore Timestamps, and timestamps.
 */
export function extractTxDateString(rawDate: any): string {
  if (!rawDate) return '';
  if (typeof rawDate === 'string') {
    if (rawDate.includes('T')) return rawDate.split('T')[0];
    if (rawDate.length >= 10 && /^\d{4}[-/]\d{2}[-/]\d{2}/.test(rawDate)) {
      return rawDate.substring(0, 10).replace(/\//g, '-');
    }
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return rawDate;
  }
  if (typeof rawDate === 'number') {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (rawDate && typeof rawDate.toDate === 'function') {
    const d = rawDate.toDate();
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (rawDate && typeof rawDate.seconds === 'number') {
    const d = new Date(rawDate.seconds * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch {
    // ignore
  }
  return '';
}

/**
 * Filter engine enforcing Single Source of Truth (SSOT) rules for General Ledger transactions.
 */
export function filterLedgerTransactions(
  transactions: LedgerTransaction[],
  filters: LedgerFilterParams,
  context?: LedgerFilterContext
): LedgerTransaction[] {
  if (!transactions || transactions.length === 0) return [];

  const { employees, currentRole, currentBranchId, businessId } = context || {};

  return transactions.filter(tx => {
    // 1. Business Tenant Isolation
    const txBizId = tx.business_id || (tx as any).businessId;
    if (businessId && txBizId && txBizId !== businessId) {
      return false;
    }

    // 2. Role-based Manager Branch Isolation
    if (currentRole === 'MANAGER' && currentBranchId) {
      const txBranch = tx.branchId || (tx as any).branch_id || (tx as any).branch;
      if (txBranch && txBranch !== currentBranchId) {
        return false;
      }
    }

    // 3. Immutable Branch ID Filter (never match by name alone)
    if (filters.branchId && filters.branchId.length > 0 && !filters.branchId.includes('ALL')) {
      const txBranchId = tx.branchId || (tx as any).branch_id || (tx as any).branchCode;
      if (!filters.branchId.includes(txBranchId)) {
        return false;
      }
    }

    // 4. Immutable Department ID Filter
    if (filters.departmentId && filters.departmentId.length > 0 && !filters.departmentId.includes('ALL')) {
      const txDeptId = tx.departmentId || (tx as any).department_id || (tx as any).departmentCode;
      if (!filters.departmentId.includes(txDeptId)) {
        return false;
      }
    }

    // 5. Immutable Employee ID / Resolved Email Filter
    if (filters.employeeId && filters.employeeId.length > 0 && !filters.employeeId.includes('ALL')) {
      const txEmpId = tx.employeeId || (tx as any).employee_id;
      const txEmpEmail = (tx as any).employee_email || (tx as any).employeeEmail;
      
      let matches = false;
      for (const empId of filters.employeeId) {
        if (txEmpId === empId) {
          matches = true;
          break;
        }
        const selectedEmployee = employees?.find(e => e.id === empId);
        if (selectedEmployee?.email && txEmpEmail && txEmpEmail.toLowerCase() === selectedEmployee.email.toLowerCase()) {
          matches = true;
          break;
        }
      }

      if (!matches) {
        return false;
      }
    }

    // 6. Transaction Type Filter
    if (filters.type && filters.type.length > 0 && !filters.type.includes('ALL')) {
      const txType = (tx.type || '').toString().trim().toUpperCase();
      
      let matches = false;
      for (const reqType of filters.type) {
        const uReqType = reqType.trim().toUpperCase();
        if (uReqType === 'CORRECTION') {
          if (['REVERSAL', 'CORRECTION', 'ADJUSTMENT'].includes(txType)) {
            matches = true;
            break;
          }
        } else if (txType === uReqType) {
          matches = true;
          break;
        }
      }
      
      if (!matches) {
        return false;
      }
    }

    // 7. Category Filter
    if (filters.category && filters.category !== 'ALL') {
      const reqCat = filters.category.trim().toLowerCase();
      const txCat = (tx.category || '').toString().trim().toLowerCase();
      if (txCat !== reqCat) {
        return false;
      }
    }

    // 8. Status Filter
    if (filters.status && filters.status !== 'ALL') {
      const reqStatus = filters.status.trim().toUpperCase();
      const txStatus = (tx.status || '').toString().trim().toUpperCase();
      if (txStatus !== reqStatus) {
        return false;
      }
    }

    // 9. Precedence Rule: Explicit Date Range overrides Accounting Period
    const rawDate = tx.date || (tx as any).transaction_date || (tx as any).transactionDate || (tx as any).createdAt;
    const txDateStr = extractTxDateString(rawDate);

    const hasCustomDateRange = Boolean(
      (filters.startDate && filters.startDate.trim() !== '') || 
      (filters.endDate && filters.endDate.trim() !== '')
    );

    if (hasCustomDateRange) {
      if (filters.startDate && filters.startDate.trim() !== '') {
        if (!txDateStr || txDateStr < filters.startDate.trim()) {
          return false;
        }
      }
      if (filters.endDate && filters.endDate.trim() !== '') {
        if (!txDateStr || txDateStr > filters.endDate.trim()) {
          return false;
        }
      }
    } else if (filters.period && filters.period !== 'ALL') {
      // Period filter (e.g., 'YYYY-MM')
      const periodStr = filters.period.trim();
      const txPeriod = (tx as any).accounting_period || (tx as any).period;

      const matchesTxPeriod = txPeriod && txPeriod === periodStr;
      const matchesDatePrefix = txDateStr && txDateStr.startsWith(periodStr);

      if (!matchesTxPeriod && !matchesDatePrefix) {
        return false;
      }
    }

    // 10. Multi-field Search Filter
    if (filters.search && filters.search.trim() !== '') {
      const term = filters.search.trim().toLowerCase();
      const matchFields = [
        tx.id,
        tx.description,
        tx.category,
        (tx as any).reference,
        (tx as any).reference_number,
        tx.debit_account,
        (tx as any).debitAccount,
        tx.credit_account,
        (tx as any).creditAccount,
        tx.amount ? tx.amount.toString() : '',
        tx.amount_cents ? (tx.amount_cents / 100).toString() : '',
        tx.employeeName,
        (tx as any).employee_name,
        (tx as any).departmentName,
        (tx as any).department_name,
        (tx as any).branchName,
        (tx as any).branch_name
      ];

      const isMatch = matchFields.some(f => f && f.toString().toLowerCase().includes(term));
      if (!isMatch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Derives running balances, double-entry totals, and financial metrics from filtered transactions.
 */
export function calculateLedgerSummary(filteredTransactions: LedgerTransaction[]): LedgerSummaryMetrics {
  let totalIncomeCents = 0;
  let totalExpenseCents = 0;
  let totalDebitsCents = 0;
  let totalCreditsCents = 0;
  let unpostedCount = 0;

  // Chronological sort (oldest to newest) to calculate accurate running balance
  const chronological = [...filteredTransactions].sort(
    (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  );

  let runningBalanceCents = 0;

  const withBalancesAsc = chronological.map(tx => {
    const amountCents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);

    const isLiquidityDebit = Boolean(
      tx.debit_account?.toUpperCase().includes("CASH") || 
      tx.debit_account?.toUpperCase().includes("BANK") || 
      tx.debit_account?.startsWith("10")
    );

    const isLiquidityCredit = Boolean(
      tx.credit_account?.toUpperCase().includes("CASH") || 
      tx.credit_account?.toUpperCase().includes("BANK") || 
      tx.credit_account?.startsWith("10")
    );

    if (isLiquidityDebit && !isLiquidityCredit) {
      runningBalanceCents += amountCents;
      totalIncomeCents += amountCents;
    } else if (isLiquidityCredit && !isLiquidityDebit) {
      runningBalanceCents -= amountCents;
      totalExpenseCents += amountCents;
    } else if (tx.type === 'INCOME') {
      runningBalanceCents += amountCents;
      totalIncomeCents += amountCents;
    } else if (['EXPENSE', 'ADVANCE', 'PAYROLL', 'REFUND', 'PENALTY'].includes(tx.type)) {
      runningBalanceCents -= amountCents;
      totalExpenseCents += amountCents;
    } else if (tx.type === 'REVERSAL') {
      const isReversingIncome = tx.description?.includes('INCOME') || tx.metadata?.originalType === 'INCOME';
      if (isReversingIncome) {
        runningBalanceCents -= amountCents;
        totalExpenseCents += amountCents;
      } else {
        runningBalanceCents += amountCents;
        totalIncomeCents += amountCents;
      }
    }

    totalDebitsCents += amountCents;
    totalCreditsCents += amountCents;

    if (tx.status !== 'POSTED') {
      unpostedCount += 1;
    }

    return {
      ...tx,
      computedBalance: runningBalanceCents
    };
  });

  // Reverse back to newest-first for presentation
  const transactionsWithBalance = [...withBalancesAsc].reverse();

  const netCashflowCents = totalIncomeCents - totalExpenseCents;
  const count = filteredTransactions.length;

  // Calculate Health Score (100 - unposted penalty, capped between 0 and 100)
  const healthPenalty = count > 0 ? Math.round((unpostedCount / count) * 20) : 0;
  const healthScore = Math.max(70, Math.min(100, 100 - healthPenalty));

  return {
    count,
    totalIncomeCents,
    totalExpenseCents,
    netCashflowCents,
    totalDebitsCents,
    totalCreditsCents,
    healthScore,
    transactionsWithBalance
  };
}
