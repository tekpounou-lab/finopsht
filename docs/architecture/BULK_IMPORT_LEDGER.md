# BULK IMPORT & LEDGER DATE FILTER SYNCHRONIZATION ARCHITECTURE

**Module:** Financial Ledger / CFO
**Status:** Active
**Version:** 2.0

---

## 1. Overview & Problem Statement

When importing General Ledger entries in bulk (via CSV files or QuickBooks exports), imported transaction dates may belong to past or custom accounting periods (e.g. `01/07/2026` to `15/07/2026`). 

If the user's active screen filters in the General Ledger (`FinanceLedger.tsx`) are constrained to a different period (e.g. `THIS_MONTH` or `2026-09`), the single-source-of-truth filter engine (`LedgerFilterEngine.ts`) correctly filters out non-matching transactions, resulting in an empty view (0 records displayed out of total imported).

To solve this UX friction and eliminate false "missing records" reports:
1. **Automatic Date Filter Alignment**: Upon completion of a CSV/QuickBooks import, the system extracts the minimum and maximum transaction dates from the batch and automatically updates the active date range filter (`startDate` and `endDate`) in `FilterContext`.
2. **Event-Driven Orchestration**: The import modal publishes a strongly typed `GL_IMPORT_COMPLETED` event on the runtime `EventBus` carrying the imported date bounds and count.
3. **Contextual Period Banners & Quick Actions**: If active filters yield 0 records while database records exist, the Ledger UI displays a prominent banner detailing the global period range (`minDate` to `maxDate`) and offers one-click action buttons to adjust the period or reset filters.
4. **Filter Persistence**: Active namespace filters (`gl`) are saved to `localStorage` (`finops_filter_store`) to ensure user selections persist across reloads and navigation.

---

## 2. Event Contract (`GL_IMPORT_COMPLETED`)

When a bulk import is committed via `BulkTransactionImportDialog.tsx`:

```typescript
EventBus.publish(EventBus.createEvent({
  correlationId: `corr_imp_${batchId}`,
  businessId: current_business_id,
  module: "FINANCIAL_LEDGER",
  aggregate: "LedgerTransaction",
  type: "GL_IMPORT_COMPLETED",
  source: "BulkTransactionImportDialog",
  payload: {
    businessId: current_business_id,
    importedCount: txsToImport.length,
    startDate: minImportDate, // YYYY-MM-DD
    endDate: maxImportDate,   // YYYY-MM-DD
    periodLabel: `${minImportDate} au ${maxImportDate}`
  }
}));
```

`FinanceLedger.tsx` subscribes to this event and calls `setDateRange(startDate, endDate)`, switching the UI view to the exact period of the imported batch with feedback toast notifications.

---

## 3. CSV Date Normalization Engine (`normalizeCsvDate`)

To support heterogeneous CSV templates (such as US `M/D/YYYY` from QuickBooks/Excel exports like `7/15/2026`, European `DD/MM/YYYY` like `15/07/2026`, and ISO `YYYY-MM-DD`), the import pipeline uses a universal normalizer (`src/utils/dateUtils.ts`):

1. **Format Priority Order**:
   - **ISO Format (`YYYY-MM-DD` / `YYYY/MM/DD`)**: Detected via regex `^(\d{4})[-/](\d{1,2})[-/](\d{1,2})`.
   - **US Format (`M/D/YYYY` / `MM/DD/YYYY`)**: Default when month and day are $\le 12$ or when second part $> 12$ (e.g., `7/15/2026` $\rightarrow$ `2026-07-15`).
   - **European Format (`DD/MM/YYYY` / `D/M/YYYY`)**: Explicitly handled when first part $> 12$ (e.g., `15/07/2026` $\rightarrow$ `2026-07-15`).
   - **Native Fallback**: Standard `new Date()` fallback with fallback date safety.
2. **Persistence Guarantee**: All imported transactions store exact ISO `"YYYY-MM-DD"` strings in Firestore (`tx.date`), ensuring 100% compatibility with `extractTxDateString` and `LedgerFilterEngine`.

---

## 4. Single Source of Truth Filtering Rules

The `LedgerFilterEngine` applies filtering in the following order:
1. **Tenant Isolation**: `business_id === current_business_id`
2. **Role / Branch Isolation**: Manager branch scoping
3. **Branch Filter**: `filters.branchId`
4. **Department Filter**: `filters.departmentId`
5. **Employee Filter**: `filters.employeeId`
6. **Type Filter**: `INCOME`, `EXPENSE`, `TRANSFER`, `CORRECTION`
7. **Category Filter**: `filters.category`
8. **Date Precedence**: Custom Date Range (`startDate` / `endDate`) strictly overrides `period` string.
9. **Multi-field Search**: Search text matching across ID, description, accounts, and names.

---

## 4. Verification & Testing

- **Import 136 Records (01/07/2026 -> 15/07/2026)**: Successful CSV import triggers date auto-adjustment to `startDate: 2026-07-01` and `endDate: 2026-07-15`. All 136 records display immediately in the table.
- **Filter Reset**: Clicking "Réinitialiser les filtres" returns filters to default.
- **Banner Assistance**: Selecting a date range with 0 records displays a banner with the available date bounds and a button to view all available records.
