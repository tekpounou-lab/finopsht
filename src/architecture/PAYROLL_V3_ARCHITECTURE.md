# PAYROLL ENGINE V3 ARCHITECTURE & AUTOMATION

**Status:** Active  
**Domain:** Payroll / HR & General Ledger Integration  
**Last Updated:** September 2026  

---

## 1. OVERVIEW

The FINOPS ERP Payroll Engine manages employee compensation cycles, legal statutory deductions (ONA 6%, OFATMA 2%, IRI), and double-entry General Ledger postings.

Following recent refactoring, the payroll cycle creation flow features **Automatic Cycle Naming**, ensuring standardized, mistake-free period labeling while preserving user override options.

---

## 2. AUTOMATIC CYCLE NAMING SPECIFICATION

### 2.1 Function: `formatPayrollCycleName(startDate, endDate, cycleType)`

Located in `src/utils/dateUtils.ts` (and exported via `src/utils/payrollUtils.ts`).

### 2.2 Standard Naming Rules

| Period Pattern | Formatted Cycle Name Output | Example |
| :--- | :--- | :--- |
| **Full Month** (1st to last day) | `Paie de [Mois] [Année]` | `Paie de Juillet 2026` |
| **Quinzaine 1** (1st to 15th) | `Quinzaine du DD/MM/YYYY au DD/MM/YYYY` | `Quinzaine du 01/07/2026 au 15/07/2026` |
| **Quinzaine 2** (16th to month end) | `Quinzaine du DD/MM/YYYY au DD/MM/YYYY` | `Quinzaine du 16/07/2026 au 31/07/2026` |
| **Custom Period** | `Cycle du DD/MM/YYYY au DD/MM/YYYY` | `Cycle du 05/07/2026 au 20/07/2026` |

### 2.3 User Experience & Overrides

1. **Auto-Filling:** When dates are selected, `useEffect` computes and inserts the recommended name into the input field.
2. **Manual Edit:** Users can override the generated text at any time. The system sets `isNameManuallyEdited = true` to preserve user input.
3. **Auto-Reset:** An action link allows resetting to the auto-generated name at any point.

---

## 3. FIRESTORE PERSISTENCE & DATA FLOW

### 3.1 Dialog Component Specification (`CreatePayrollCycleDialog`)
- **Component File:** `src/components/payroll/modals/CreatePayrollCycleDialog.tsx` (re-exported via `src/components/payroll/modals/CreateCycleModal.tsx` and `src/components/payroll/index.ts`).
- **Parent Integration:** `PayrollEngine.tsx` binds `isCreateCycleOpen`, passes `current_business_id`, `existingCycles={tenantCycles}`, and `onCreateCycle={handleCreateCycle}`.
- **Button Binding:** Button `#btn-create-cycle` has both `type="submit"` and direct `onClick={handleCreate}`.

### 3.2 Action Flow & Instrumentation Contract
1. **User Action:** User clicks "Créer" or submits the form.
2. **Instrumentation Log 1:** `console.debug("[Payroll] Create button clicked.");`
3. **Instrumentation Log 2:** `console.debug("[Payroll] Form data:", { startDate, endDate, name, business_id });`
4. **Validation:** Period presence, chronological order, non-empty final name, in-memory deduplication against `existingCycles`.
5. **Instrumentation Log 3:** `console.debug("[Payroll] Calling createCycle with payload:", payload);`
6. **Persistence & EventBus:** Calls `PayrollRepository.createCycle(payload)`, writes batch to Firestore, and emits `PAYROLL_CYCLE_CREATED` to the EventBus.
7. **Instrumentation Log 4:** `console.debug("[Payroll] Cycle created with ID:", payload.id);`
8. **UI Completion:** Success toast notification, dialog closure, and auto-selection of the new cycle.

---

## 4. ROLES & PERMISSIONS

- `OWNER` / `MANAGER`: Full access to create, dry-run, calculate, commit, and lock cycles.
- `HEAD_TELLER` / `SENIOR_TELLER` / `JUNIOR_TELLER`: Read-only access to payslips.
