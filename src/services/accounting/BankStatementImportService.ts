import { BankStatementLine } from "../../types/accounting";

export interface StatementImportOptions {
  businessId: string;
  currency?: string; // e.g. "HTG" or "USD"
  existingLines?: BankStatementLine[];
  bankAccountCode?: string;
}

export interface RawStatementRow {
  date?: string;
  description?: string;
  label?: string;
  libelle?: string;
  amount?: number | string;
  amountCents?: number;
  debit?: number | string;
  credit?: number | string;
  reference?: string;
  ref?: string;
  currency?: string;
  devise?: string;
  balance?: number | string;
  balanceAfterCents?: number;
}

export interface BankStatementImportResult {
  businessId: string;
  currency: string;
  parsedLines: BankStatementLine[];
  validLines: BankStatementLine[];
  invalidLines: BankStatementLine[];
  duplicateLines: BankStatementLine[];
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  netChangeCents: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  statementStartDate: string;
  statementEndDate: string;
}

export class BankStatementImportService {
  /**
   * Parses and validates raw bank statement rows (e.g., from CSV or XLSX parser).
   */
  public static parseAndValidateRows(
    rows: RawStatementRow[],
    options: StatementImportOptions
  ): BankStatementImportResult {
    const { businessId, currency = "HTG", existingLines = [] } = options;

    if (!businessId) {
      throw new Error("BankStatementImportService: businessId is required for tenant validation.");
    }

    const existingSignatures = new Set<string>();
    existingLines.forEach((line) => {
      if (line.id) existingSignatures.add(line.id);
      const sig = `${line.date}_${line.amountCents}_${(line.description || "").trim().toLowerCase()}_${(line.reference || "").trim().toLowerCase()}`;
      existingSignatures.add(sig);
    });

    const parsedLines: BankStatementLine[] = [];
    const validLines: BankStatementLine[] = [];
    const invalidLines: BankStatementLine[] = [];
    const duplicateLines: BankStatementLine[] = [];

    const batchSignatures = new Set<string>();

    let totalDepositsCents = 0;
    let totalWithdrawalsCents = 0;

    let minDate = "";
    let maxDate = "";

    rows.forEach((row, index) => {
      const lineId = `stmt_line_${businessId}_${Date.now()}_${index}`;
      
      // 1. Resolve date
      const rawDate = row.date || "";
      const normalizedDate = this.normalizeDate(rawDate);

      // 2. Resolve description
      const description = (row.description || row.label || row.libelle || "").trim();

      // 3. Resolve currency
      const rowCurrency = (row.currency || row.devise || currency).toUpperCase();

      // 4. Resolve amount in cents
      let amountCents = 0;
      if (row.amountCents !== undefined && typeof row.amountCents === "number") {
        amountCents = Math.round(row.amountCents);
      } else if (row.amount !== undefined && row.amount !== null && row.amount !== "") {
        const parsed = typeof row.amount === "number" ? row.amount : parseFloat(String(row.amount).replace(/,/g, ""));
        amountCents = isNaN(parsed) ? 0 : Math.round(parsed * 100);
      } else if (row.debit || row.credit) {
        const debitVal = row.debit ? (typeof row.debit === "number" ? row.debit : parseFloat(String(row.debit).replace(/,/g, ""))) : 0;
        const creditVal = row.credit ? (typeof row.credit === "number" ? row.credit : parseFloat(String(row.credit).replace(/,/g, ""))) : 0;
        const netAmt = (isNaN(creditVal) ? 0 : creditVal) - (isNaN(debitVal) ? 0 : debitVal);
        amountCents = Math.round(netAmt * 100);
      }

      // 5. Resolve reference & balance
      const reference = (row.reference || row.ref || "").trim();
      let balanceAfterCents: number | undefined = undefined;
      if (row.balanceAfterCents !== undefined && typeof row.balanceAfterCents === "number") {
        balanceAfterCents = Math.round(row.balanceAfterCents);
      } else if (row.balance !== undefined && row.balance !== null && row.balance !== "") {
        const parsedBal = typeof row.balance === "number" ? row.balance : parseFloat(String(row.balance).replace(/,/g, ""));
        if (!isNaN(parsedBal)) balanceAfterCents = Math.round(parsedBal * 100);
      }

      // Check validation criteria
      let isInvalid = false;
      let validationError = "";

      if (!normalizedDate) {
        isInvalid = true;
        validationError = "INVALID_DATE";
      } else if (!description) {
        isInvalid = true;
        validationError = "MISSING_DESCRIPTION";
      } else if (amountCents === 0) {
        isInvalid = true;
        validationError = "ZERO_AMOUNT";
      } else if (rowCurrency !== currency.toUpperCase()) {
        isInvalid = true;
        validationError = `CURRENCY_MISMATCH (${rowCurrency} vs ${currency})`;
      }

      const sig = `${normalizedDate}_${amountCents}_${description.toLowerCase()}_${reference.toLowerCase()}`;
      const isDuplicate = existingSignatures.has(sig) || batchSignatures.has(sig);

      const statementLine: BankStatementLine = {
        id: lineId,
        date: normalizedDate || new Date().toISOString().substring(0, 10),
        description: description || "Ligne non spécifiée",
        amountCents,
        reference: reference || undefined,
        balanceAfterCents,
        reconciliationStatus: isDuplicate ? "IGNORED" : isInvalid ? "UNMATCHED" : "UNMATCHED",
        matchConfidenceScore: 0,
        currency: rowCurrency,
        isInvalid,
        validationError: isInvalid ? validationError : isDuplicate ? "DUPLICATE_ENTRY" : undefined,
      };

      parsedLines.push(statementLine);

      if (isInvalid) {
        invalidLines.push(statementLine);
      } else if (isDuplicate) {
        duplicateLines.push(statementLine);
      } else {
        batchSignatures.add(sig);
        validLines.push(statementLine);

        if (amountCents > 0) {
          totalDepositsCents += amountCents;
        } else {
          totalWithdrawalsCents += Math.abs(amountCents);
        }

        if (!minDate || statementLine.date < minDate) minDate = statementLine.date;
        if (!maxDate || statementLine.date > maxDate) maxDate = statementLine.date;
      }
    });

    const netChangeCents = totalDepositsCents - totalWithdrawalsCents;

    return {
      businessId,
      currency,
      parsedLines,
      validLines,
      invalidLines,
      duplicateLines,
      totalDepositsCents,
      totalWithdrawalsCents,
      netChangeCents,
      validCount: validLines.length,
      invalidCount: invalidLines.length,
      duplicateCount: duplicateLines.length,
      statementStartDate: minDate || new Date().toISOString().substring(0, 10),
      statementEndDate: maxDate || new Date().toISOString().substring(0, 10),
    };
  }

  /**
   * Helper to parse CSV strings into RawStatementRow array.
   */
  public static parseCSVString(
    csvText: string,
    options: StatementImportOptions,
    delimiter: string = ","
  ): BankStatementImportResult {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) {
      return this.parseAndValidateRows([], options);
    }

    // Header row detection
    const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
    const dataLines = lines.slice(1);

    const rawRows: RawStatementRow[] = dataLines.map((line) => {
      const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      const row: RawStatementRow = {};

      headers.forEach((header, i) => {
        const val = cols[i] || "";
        if (header.includes("date")) row.date = val;
        else if (header.includes("desc") || header.includes("libelle") || header.includes("label") || header.includes("memo")) row.description = val;
        else if (header.includes("amount") || header.includes("montant")) row.amount = val;
        else if (header.includes("debit")) row.debit = val;
        else if (header.includes("credit")) row.credit = val;
        else if (header.includes("ref") || header.includes("numero") || header.includes("num")) row.reference = val;
        else if (header.includes("curr") || header.includes("devise")) row.currency = val;
        else if (header.includes("bal") || header.includes("solde")) row.balance = val;
      });

      // Fallback position mapping if headers didn't match standard names
      if (!row.date && cols[0]) row.date = cols[0];
      if (!row.description && cols[1]) row.description = cols[1];
      if (!row.amount && !row.debit && !row.credit && cols[2]) row.amount = cols[2];

      return row;
    });

    return this.parseAndValidateRows(rawRows, options);
  }

  /**
   * Normalizes various date string formats to YYYY-MM-DD.
   */
  private static normalizeDate(raw: string): string | null {
    if (!raw) return null;
    const clean = raw.trim();

    // ISO format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      return clean.substring(0, 10);
    }

    // DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyy) {
      const day = ddmmyyyy[1].padStart(2, "0");
      const month = ddmmyyyy[2].padStart(2, "0");
      const year = ddmmyyyy[3];
      return `${year}-${month}-${day}`;
    }

    // MM/DD/YYYY
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().substring(0, 10);
    }

    return null;
  }
}
