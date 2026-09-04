import { LedgerTransaction } from "../types";

export interface AccountingPeriodInfo {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  periodLabel: string; // e.g. "July 2026" or "2026-07-01 → 2026-07-31"
}

export interface PeriodSummary {
  periodLabel: string;
  startDate: string;
  endDate: string;
  transactionCount: number;
  totalRevenue: number;
  totalExpenses: number;
  totalDebits: number;
  totalCredits: number;
  totalAmount: number;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DuplicateAnalysisResult {
  accountingPeriod: AccountingPeriodInfo;
  currentLedgerSummary: PeriodSummary;
  uploadedSummary: PeriodSummary;
  exactDuplicatesCount: number;
  newEntriesCount: number;
  modifiedEntriesCount: number;
  internalDuplicatesCount: number;
  similarityScore: number; // 0 to 100
  riskLevel: RiskLevel;
  recommendation: string;
  exactDuplicateRowIndexes: Set<number>;
  newEntryRowIndexes: Set<number>;
  modifiedEntryRowIndexes: Set<number>;
  rowAnalysisList: RowAnalysisItem[];
}

export interface RowAnalysisItem {
  rowIdx: number;
  date: string;
  type: string;
  category: string;
  amount: number;
  description: string;
  branchName?: string;
  departmentName?: string;
  status: "EXACT_DUPLICATE" | "NEW_ENTRY" | "MODIFIED_CONFLICT" | "INTERNAL_DUPLICATE";
  matchReason?: string;
  existingTxId?: string;
}

/**
 * Normalizes date string to YYYY-MM-DD format
 */
export function normalizeDate(input: any): string {
  if (!input) return "";
  const str = String(input).trim();
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) {
    return str.replace(/\//g, "-");
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return str;
}

/**
 * Phase 1 — Detect Accounting Period from Uploaded Rows
 */
export function detectAccountingPeriod(uploadedRows: any[]): AccountingPeriodInfo {
  if (!uploadedRows || uploadedRows.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    return {
      startDate: today,
      endDate: today,
      periodLabel: "No Date Range"
    };
  }

  const dates: string[] = [];
  uploadedRows.forEach((row) => {
    const rawDate = row.date || row.transaction_date;
    const clean = normalizeDate(rawDate);
    if (clean && /^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      dates.push(clean);
    }
  });

  if (dates.length === 0) {
    const today = new Date().toISOString().split("T")[0];
    return {
      startDate: today,
      endDate: today,
      periodLabel: "Undetermined Period"
    };
  }

  dates.sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  // Format label
  const startMonth = startDate.substring(0, 7); // YYYY-MM
  const endMonth = endDate.substring(0, 7);

  let periodLabel = `${startDate} → ${endDate}`;
  if (startMonth === endMonth) {
    const d = new Date(startDate + "T00:00:00");
    const monthName = d.toLocaleString("default", { month: "long" });
    const year = d.getFullYear();
    periodLabel = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
  }

  return {
    startDate,
    endDate,
    periodLabel
  };
}

/**
 * Phase 2 — Calculate Period Financial Summary
 */
export function calculatePeriodSummary(
  period: AccountingPeriodInfo,
  transactions: any[]
): PeriodSummary {
  let count = 0;
  let revenue = 0;
  let expenses = 0;
  let debits = 0;
  let credits = 0;
  let totalAmount = 0;

  transactions.forEach((tx) => {
    const txDate = normalizeDate(tx.date || tx.transaction_date);
    // Include if falls inside period date range
    if (txDate >= period.startDate && txDate <= period.endDate) {
      count++;
      const amt = Number(tx.amount || tx.amount_htg || 0);
      totalAmount += amt;

      const type = String(tx.type || "").toUpperCase();
      if (type === "INCOME" || type === "REVENUE") {
        revenue += amt;
        credits += amt;
      } else if (type === "EXPENSE") {
        expenses += amt;
        debits += amt;
      } else if (type === "TRANSFER" || type === "ADVANCE") {
        debits += amt;
      }
    }
  });

  return {
    periodLabel: period.periodLabel,
    startDate: period.startDate,
    endDate: period.endDate,
    transactionCount: count,
    totalRevenue: Math.round(revenue * 100) / 100,
    totalExpenses: Math.round(expenses * 100) / 100,
    totalDebits: Math.round(debits * 100) / 100,
    totalCredits: Math.round(credits * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100
  };
}

/**
 * Phase 3 & 8 — Analyze Uploaded Rows against Existing Ledger Data & Compute Similarity
 */
export function analyzeGLDuplicates(
  uploadedRows: any[],
  existingTransactions: LedgerTransaction[],
  business_id: string
): DuplicateAnalysisResult {
  const period = detectAccountingPeriod(uploadedRows);

  // Filter existing transactions in this business and date range
  const ledgerInPeriod = existingTransactions.filter((tx) => {
    const bId = tx.business_id || (tx as any).businessId;
    if (bId && bId !== business_id) return false;
    const txDate = normalizeDate(tx.date);
    return txDate >= period.startDate && txDate <= period.endDate;
  });

  const currentLedgerSummary = calculatePeriodSummary(period, ledgerInPeriod);
  const uploadedSummary = calculatePeriodSummary(period, uploadedRows);

  const exactDuplicateRowIndexes = new Set<number>();
  const newEntryRowIndexes = new Set<number>();
  const modifiedEntryRowIndexes = new Set<number>();
  const rowAnalysisList: RowAnalysisItem[] = [];

  // High-performance Pre-Indexed Maps for O(1) lookup
  // Composite Key: Date + Type + Category + AmountCents + EmployeeId + DescPrefix + Ref
  const exactLedgerMap = new Map<string, LedgerTransaction>();
  const dateDescConflictMap = new Map<string, LedgerTransaction>();

  ledgerInPeriod.forEach((existing) => {
    const exDate = normalizeDate(existing.date);
    const exType = String(existing.type || "").toUpperCase();
    const exCategory = String(existing.category || "").toLowerCase().trim();
    const exAmountCents = Math.round(Number(existing.amount || 0) * 100);
    const exEmpId = String(existing.employeeId || (existing as any).employee_id || "").trim();
    const exDesc = String(existing.description || "").toLowerCase().trim().slice(0, 30);
    const exRef = String((existing as any).reference || (existing as any).reference_number || "").toLowerCase().trim();

    const fullKey = `${exDate}_${exType}_${exCategory}_${exAmountCents}_${exEmpId}_${exDesc}_${exRef}`;
    exactLedgerMap.set(fullKey, existing);

    // Conflict index by date + description prefix
    if (exDesc) {
      dateDescConflictMap.set(`${exDate}_${exDesc}`, existing);
    }
  });

  const internalComboSet = new Set<string>();
  let internalDuplicatesCount = 0;

  uploadedRows.forEach((row, idx) => {
    const rowDate = normalizeDate(row.date || row.transaction_date);
    const rowAmount = Number(row.amount || row.amount_htg || 0);
    const rowAmountCents = Math.round(rowAmount * 100);
    const rowType = String(row.type || "").toUpperCase();
    const rowCategory = String(row.category || "").toLowerCase().trim();
    const rowDesc = String(row.description || "").toLowerCase().trim();
    const rowDescPrefix = rowDesc.slice(0, 30);
    const rowRef = String(row.reference || row.reference_number || "").toLowerCase().trim();
    const rowEmpId = String(row.employeeId || row.employee_id || "").trim();

    // Check internal duplicate inside the uploaded file itself
    const internalKey = `${rowDate}_${rowType}_${rowCategory}_${rowAmountCents}_${rowEmpId}_${rowDescPrefix}_${rowRef}`;
    let isInternalDup = false;
    if (internalComboSet.has(internalKey)) {
      isInternalDup = true;
      internalDuplicatesCount++;
    } else {
      internalComboSet.add(internalKey);
    }

    // Exact match in existing ledger via O(1) Map lookup
    const exactMatch = exactLedgerMap.get(internalKey);

    if (exactMatch) {
      exactDuplicateRowIndexes.add(idx);
      rowAnalysisList.push({
        rowIdx: idx + 2,
        date: rowDate,
        type: rowType,
        category: row.category || "General",
        amount: rowAmount,
        description: row.description,
        branchName: row.branchName,
        departmentName: row.departmentName,
        status: "EXACT_DUPLICATE",
        matchReason: `Matches existing transaction #${exactMatch.id} on ${rowDate} (${rowAmount} HTG)`,
        existingTxId: exactMatch.id
      });
    } else {
      // Conflict match (same date and similar description prefix, but differing amount/type)
      const conflictMatch = rowDescPrefix ? dateDescConflictMap.get(`${rowDate}_${rowDescPrefix}`) : undefined;

      if (conflictMatch) {
        modifiedEntryRowIndexes.add(idx);
        rowAnalysisList.push({
          rowIdx: idx + 2,
          date: rowDate,
          type: rowType,
          category: row.category || "General",
          amount: rowAmount,
          description: row.description,
          branchName: row.branchName,
          departmentName: row.departmentName,
          status: "MODIFIED_CONFLICT",
          matchReason: `Similar description as transaction #${conflictMatch.id}, but amount/type differs.`,
          existingTxId: conflictMatch.id
        });
      } else {
        newEntryRowIndexes.add(idx);
        rowAnalysisList.push({
          rowIdx: idx + 2,
          date: rowDate,
          type: rowType,
          category: row.category || "General",
          amount: rowAmount,
          description: row.description,
          branchName: row.branchName,
          departmentName: row.departmentName,
          status: isInternalDup ? "INTERNAL_DUPLICATE" : "NEW_ENTRY",
          matchReason: isInternalDup ? "Duplicate row inside uploaded file" : "New unique transaction"
        });
      }
    }
  });

  const exactDuplicatesCount = exactDuplicateRowIndexes.size;
  const modifiedEntriesCount = modifiedEntryRowIndexes.size;
  const newEntriesCount = newEntryRowIndexes.size;
  const totalUploaded = uploadedRows.length;

  // Compute Similarity Score (Phase 3)
  let similarityScore = 0;
  if (totalUploaded > 0) {
    const matchRatio = exactDuplicatesCount / totalUploaded;
    const ledgerCount = currentLedgerSummary.transactionCount;
    const countRatio = ledgerCount > 0 ? Math.min(totalUploaded, ledgerCount) / Math.max(totalUploaded, ledgerCount) : 0;
    
    // Amount similarity
    const ledgerTotalAmt = currentLedgerSummary.totalAmount;
    const uploadedTotalAmt = uploadedSummary.totalAmount;
    let amtScore = 0;
    if (ledgerTotalAmt > 0) {
      const diff = Math.abs(uploadedTotalAmt - ledgerTotalAmt) / ledgerTotalAmt;
      amtScore = Math.max(0, 1 - diff);
    }

    if (exactDuplicatesCount === totalUploaded) {
      similarityScore = 100.0;
    } else {
      const scoreRaw = (0.7 * matchRatio + 0.2 * countRatio + 0.1 * amtScore) * 100;
      similarityScore = Math.round(scoreRaw * 10) / 10;
    }
  }

  // Determine Risk Level
  let riskLevel: RiskLevel = "LOW";
  let recommendation = "Low risk. Most transactions appear to be new entries.";

  if (similarityScore >= 100 || (totalUploaded > 0 && exactDuplicatesCount === totalUploaded)) {
    riskLevel = "CRITICAL";
    recommendation = "100% Exact duplicate dataset detected! This accounting period appears to be fully imported already.";
  } else if (similarityScore >= 80) {
    riskLevel = "HIGH";
    recommendation = "High probability of duplicate import. Importing this file without skipping duplicates may alter financial statements.";
  } else if (similarityScore >= 50 || exactDuplicatesCount > 0) {
    riskLevel = "MEDIUM";
    recommendation = "Possible overlap detected. We recommend reviewing differences and choosing 'Import Only New Transactions'.";
  }

  return {
    accountingPeriod: period,
    currentLedgerSummary,
    uploadedSummary,
    exactDuplicatesCount,
    newEntriesCount,
    modifiedEntriesCount,
    internalDuplicatesCount,
    similarityScore,
    riskLevel,
    recommendation,
    exactDuplicateRowIndexes,
    newEntryRowIndexes,
    modifiedEntryRowIndexes,
    rowAnalysisList
  };
}
