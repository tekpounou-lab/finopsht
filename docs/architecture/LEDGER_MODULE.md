# GENERAL LEDGER MODULE ARCHITECTURE (GRAND LIVRE COMPTABLE)

**Module:** Financial Ledger / CFO  
**Status:** Active  
**Version:** 4.0  
**Domain:** FINOPS ERP / FINAYITI Fusion  

---

## 1. Overview & Architectural Principles

The **General Ledger (Grand Livre Comptable)** is the central system-of-record for all financial transactions within FINOPS ERP. It strictly enforces:

1. **Single Source of Truth (SSOT)**: All financial metrics, balance sheets, income statements (P&L), cash flow ratios, and payroll journal entries derive canonically from the `ledger_transactions` collection.
2. **Double-Entry Bookkeeping**: Every transaction specifies debit and credit accounts, ensuring exact balance (`sum(debits) === sum(credits)`).
3. **Repository Pattern**: Persistence operations pass through `LedgerRepository.ts` for atomic transaction writes, event outbox logging, and forensic audit generation.
4. **Realtime Synchronization**: Uses `useRealtimeSubscription` to stream updates instantly across tenant sessions.
5. **Canonical Date Normalization (SSOT)**: All dates (ISO 8601, Firestore Timestamps, US/EU CSV imports, JS Dates) are strictly normalized into `YYYY-MM-DD` via `src/utils/dateNormalization.ts` (`toDateOnly`) prior to filtering or storage.

---

## 2. Data Model & Firestore Schema

### Collection Path
- **Primary Collection**: `ledger_transactions` (Root Collection)
- **Tenant Isolation**: Every document contains `business_id` (matching the active business tenant ID) and `branch_id`.

### Document Schema (`LedgerTransaction`)

```typescript
export interface LedgerTransaction {
  id: string;                      // e.g. "tx_man_..." or "tx_imp_..."
  business_id: string;             // Tenant isolation ID
  branch_id?: string;              // Branch location
  department_id?: string;          // Department cost center
  employee_id?: string;            // Linked employee (optional)
  
  type: "INCOME" | "EXPENSE" | "ADVANCE" | "TRANSFER" | "REFUND" | "CORRECTION" | "PAYROLL" | "BONUS" | "PENALTY" | "ADJUSTMENT" | "REVERSAL" | "COMPENSATION";
  amount: number;                  // Integer in Gourdes / USD (backward compatibility)
  amount_cents: number;            // Integer in cents (exact financial precision)
  currency: "HTG" | "USD";
  
  description: string;             // Human-readable transaction narrative
  date: string;                    // Normalized date string "YYYY-MM-DD" or ISO string
  category: string;                // Chart of Accounts category
  status: "PENDING" | "POSTED" | "LOCKED" | "REVERSED";
  
  debit_account?: string;          // Double entry debit account code (e.g. "512000")
  credit_account?: string;         // Double entry credit account code (e.g. "701000")
  debit_cents?: number;            // Debit leg amount in cents
  credit_cents?: number;           // Credit leg amount in cents
  
  isImmutable: boolean;            // True when posted and locked against modification
  signerId: string;                // User ID of creator or approver
  source: "MANUAL" | "CSV_IMPORT" | "PAYROLL_ENGINE" | "SYSTEM" | "AI_AUTOMATION";
  
  referenceTransactionId?: string; // Original transaction ID for reversals/corrections
  importBatchId?: string;          // Batch ID for CSV imports
  
  createdBy?: string;
  createdAt?: any;
  updatedAt?: any;
}
```

---

## 3. Date Normalization & Query Pipeline

To handle variations in date inputs across manual entries, CSV imports, and legacy records:
1. **Date Extractor (`extractTxDateString`)**: Converts strings (`"2026-07-01"` or ISO `"2026-07-01T14:30:00Z"`), numbers (timestamps), and Firestore Timestamps into canonical `"YYYY-MM-DD"`.
2. **Date Range Filtering**: Custom date range comparisons (`startDate` / `endDate`) operate on `"YYYY-MM-DD"` string comparisons (`startDate <= txDate <= endDate`), eliminating UTC midnight cutoff bugs.
3. **Filter Engine Precedence**: Explicit Date Ranges (`startDate` & `endDate`) override monthly period strings (`period`).

---

## 4. Bulk Import & Event Alignment Pipeline

1. **CSV Ingestion**: `BulkTransactionImportDialog.tsx` parses and validates CSV rows using `CsvImportService.ts`.
2. **Batch Chunking**: Transactions are written in chunks of 100-400 records using atomic Firestore batches (`LedgerRepository.bulkImportWithAudit`).
3. **Forensic Audit Creation**: Each batch chunk writes a `forensic_logs` document containing cryptographic signatures, IP traces, and item counts.
4. **Event Emission**: `GL_IMPORT_COMPLETED` is published to `EventBus` with `startDate` and `endDate`.
5. **UI Filter Alignment**: `FinanceLedger.tsx` receives `GL_IMPORT_COMPLETED` and sets `startDate` and `endDate` in `FilterContext`, ensuring imported records display immediately.

---

## 5. Security, Multi-Tenancy & Permissions

- **Firestore Rules**: Enforced at database level (`isTenantScoped(getBusinessId(resource.data))`).
- **Role Scoping**: `MANAGER` role is automatically scoped to their assigned `branch_id`.
- **Maker-Checker Rule**: The user who initiates a transaction cannot approve or reverse their own transaction.
- **Audit Trails**: All reversals and manual entries generate immutable logs in `forensic_logs`.

---

## 6. Performance & Optimization

- **Virtualization**: Large transaction tables render using optimized layouts and memoized rows in `DoubleEntryTable.tsx`.
- **Caching**: `useMemo` caches filtered transaction results and ledger metrics calculations (`calculateLedgerSummary`).
- **Realtime Limits**: Queries default to 3,000 recent records per tenant, with pagination supported via `listByBusinessPaginated`.
