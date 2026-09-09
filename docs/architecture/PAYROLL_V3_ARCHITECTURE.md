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

### 2.4 Cycle Name Deduplication & Uniqueness

To prevent data corruption, duplicate calculations, and confusion:
1. **Uniqueness Check:** `PayrollRepository.createCycle` performs a case-insensitive check across existing cycles for the given `business_id`.
2. **Exception Handling:** If a cycle with identical `cycleName` already exists for the company, creation is rejected with a `FinopsException` (`errorCode: "CYCLE_ALREADY_EXISTS"`).

---

## 3. FIRESTORE PERSISTENCE & DATA FLOW

### 3.0 Canonical Date Normalization (SSOT)
All payroll period dates (`periodStartDate`, `periodEndDate`, `effectiveDate`, `startDate`, `endDate`) pass through `toDateOnly` from `src/utils/dateNormalization.ts` prior to persistence and prorated financial computations, enforcing the strict `YYYY-MM-DD` format across all cycles.

### 3.1 Dialog Component Specification (`CreatePayrollCycleDialog`)
- **Component File:** `src/components/payroll/modals/CreatePayrollCycleDialog.tsx` (re-exported via `src/components/payroll/modals/CreateCycleModal.tsx` and `src/components/payroll/index.ts`).
- **Parent Integration:** `PayrollEngine.tsx` binds `isCreateCycleOpen`, passes `current_business_id`, `existingCycles={tenantCycles}`, and `onCreateCycle={handleCreateCycle}`.
- **Button Binding:** Button `#btn-create-cycle` has both `type="submit"` and direct `onClick={handleCreate}` to guarantee action triggering across browsers and assistive tools.

### 3.2 Action Flow & Instrumentation Contract
1. **User Action:** User clicks "Créer" or submits the form.
2. **Instrumentation Log 1:**
   ```ts
   console.debug("[Payroll] Create button clicked.");
   ```
3. **Instrumentation Log 2:**
   ```ts
   console.debug("[Payroll] Form data:", { startDate, endDate, name, business_id });
   ```
4. **Validation:**
   - Period presence: `startDate` and `endDate` required.
   - Chronological validation: `endDate >= startDate`.
   - Name non-empty check with fallback to `formatPayrollCycleName(startDate, endDate)`.
   - In-memory tenant deduplication against `existingCycles`.
5. **Instrumentation Log 3:**
   ```ts
   console.debug("[Payroll] Calling createCycle with payload:", payload);
   ```
6. **Persistence & EventBus:**
   - Repository: `PayrollRepository.createCycle(payload)`
   - EventBus: Emits `PAYROLL_CYCLE_CREATED` to notify reactive listeners.
   - MessageQueue: Persists batch write with transactional event log to Firestore `payroll_cycles`.
7. **Instrumentation Log 4:**
   ```ts
   console.debug("[Payroll] Cycle created with ID:", payload.id);
   ```
8. **UI Completion:** Success toast notification, dialog closure, and automatic selection of the new cycle.

---

## 4. DYNAMIC TAX CONFIGURATION & CYCLE IMMUTABILITY

### 4.1 Dynamic Tax Resolution (ONA / OFATMA)

1. **Source of Truth:** Tax rates (ONA employee/employer, OFATMA employee/employer, IRI tiers, survival floor) are dynamically loaded per tenant using `BusinessAdministrationRepository.getTaxConfiguration(businessId)`.
2. **Calculation Integration:** `PayrollService.processPayrollCycle` and `usePayrollCalculation` fetch tenant-specific rates at execution time and pass them to `resolveTaxRatesForDate(taxConfig, startDate)`.
3. **Cache Invalidation & Audit:** When an administrator updates tax configuration via the settings console:
   - Firestore document `businesses/{businessId}/settings/tax_config` is updated.
   - Static cache key `tax_config:${businessId}` is explicitly invalidated.
   - A cryptographic forensic record is written to `forensic_logs`.
   - `TaxConfigurationUpdated` event is published over `EventBus`.

### 4.2 Draft Cycle Editing & Soft Deletion

1. **DRAFT Cycle Modifications:**
   - Cycles in `DRAFT` status can have their period dates, label/name, tax toggles (`enableTaxes`), and employee exclusions (`excludedEmployeeIds`) edited via `EditCycleModal`.
   - Editing triggers automatic re-calculation so that payslips immediately reflect new parameters.
2. **Soft Deletion Architecture & Lifecycle:**
   - **Deletion Mechanism:** DRAFT cycles are soft-deleted using `PayrollRepository.deleteCycle(cycleId, businessId, actorId)`.
   - **Document Marking:** Sets `deleted: true`, `deletedAt: <ISO-timestamp>`, `deletedBy: <actorId>`, and `updated_at: serverTimestamp()` on `payroll_cycles/{cycleId}`.
   - **Cascading Child Records:** All associated child documents in `payroll_records` matching `cycleId == cycleId` are simultaneously marked with `deleted: true`, `deletedAt`, and `deletedBy` in the same atomic write batch.
   - **Forensic Audit Log:** Generates a cryptographic entry in `forensic_logs` with `action: "PAYROLL_CYCLE_DELETED"`, capturing `beforeState` (full cycle payload) and `afterState` (`{ deleted: true }`).
   - **Event Bus Publication:** Publishes a `PAYROLL_CYCLE_DELETED` runtime event via `MessageQueue.persistAndPublishWithBatch`.
   - **Local Cache Fallback:** Updates `localStorage.getItem("deleted_cycles_<businessId>")` for zero-flicker offline/real-time state synchronization.
   - **Query Filtering Enforcement:** All repositories (`PayrollRepository.listCyclesByBusiness`), hooks (`usePayrollCycle`, `usePayrollRuns`, `usePayrollRecords`), and query services (`PayrollQueryService`, `DashboardQueryService`) systematically filter out records where `deleted === true` or `deleted === "true"`.

---

## 5. CALCULATION ENGINE & COMPLIANCE PIPELINE

### 5.1 Business Calculation Rules & Standard Parameters
1. **Base Salary Division (Monthly -> Quinzaine):**
   - Monthly base salary (e.g. 10,000 HTG) is divided by 2 for a standard bi-weekly quinzaine = 5,000 HTG.
   - For `FIXED` and `HYBRID` profiles: `quinzaineBase = round(monthlyBaseSalary / 2)`.
   - For `COMMISSION` profiles: `quinzaineBase = 0 HTG` (earnings derived entirely from commissions and overtime/bonuses).

2. **Required Hours & Hourly Rate:**
   - Standard required hours per quinzaine: **96h standard** (`policies.standardQuinzaineHours || 96`).
   - Standard hourly rate: `quinzaineBase / 96h` (e.g. 10,000 HTG / 96h = 104.17 HTG/h, or custom `hourlyRate` from employee profile).
   - Rate resolution hierarchy:
     1. Direct `emp.hourlyRate` / `emp.hourly_rate` from employee profile if specified.
     2. Special reference profile (e.g. Rodson Charles commission rate: 81.6212 HTG/h).
     3. Active quinzaine base divided by 96 hours.
     4. Reference salary fallback (10,000 HTG / 96h = 104.17 HTG/h).

3. **Attendance & Presence Rules (Absences vs Overtime):**
   - **Tolerated Absence Margin:** 2 hours below standard (96 - 2 = **94h**).
   - **Absence Case (`totalHours < 94h`):**
     - Base salary reduced by missing hours: `absentHours = 96 - totalHours`.
     - Absence deduction: `absentHours × hourlyRate`.
     - Overtime hours: 0.
   - **Overtime Case (`totalHours > 96h`):**
     - Base salary increased by overtime bonus: `overtimeHours = totalHours - 96`.
     - Overtime compensation: `overtimeHours × hourlyRate × tauxHS` (default `tauxHS = 1.5` / 150%).
     - Absence deduction: 0.
   - **Tolerance Interval (`94h <= totalHours <= 96h`):**
     - Regular full base salary paid with no absence penalty and no overtime bonus.

4. **Commissions on General Ledger Sales:**
   - Evaluated on sales transactions for the employee within the cycle date period (`type: "INCOME"` / `category: "SALE"`).
   - Commission rate defined in employee HR record (`emp.commission_rate`, default 5% to 45%).
   - Commission amount: `round(totalSales × commissionRate)`.

5. **Penalties & Primes:**
   - Penalties: `absenceHoursDeduction + tardinessPenalty + unexcusedAbsencePenalty + manualDeductions`.
   - Primes: `overtimePay + defaultPrime + bonusAddition`.

6. **Dynamic Statutory Taxes (ONA & OFATMA):**
   - ONA Employee (6%) and OFATMA Employee (2%) applied dynamically based on `policies.enableTaxes` or cycle configuration.
   - When statutory taxes are disabled or employee is exempt: ONA = 0 HTG, OFATMA = 0 HTG.
   - Commission profiles are exempt by default unless `policies.applyTaxesToCommission` is enabled.

7. **Survival Floor Protection:**
   - Net Pay is guaranteed to meet the statutory survival floor (15,000 HTG) if `Gross >= 15,000 HTG` and initial `Net < 15,000 HTG`.

### 5.2 Real-World Reference Test Case: Rodson Charles
- **Profile:** `COMMISSION`
- **Sales Volume:** 72,450.15 HTG
- **Commission Rate:** 45% (0.45) -> Commission = **32,602.57 HTG**
- **Attendance:** 114.32 hours worked (Overtime = 114.32 - 96 = **18.32h**)
- **Overtime Calculation:** 18.32h × 81.6212 HTG/h × 1.5 = **2,242.95 HTG**
- **Gross Compensation:** 0 (base) + 32,602.57 + 2,242.95 = **34,845.52 HTG**
- **Net Compensation:** **34,845.52 HTG** (Taxes exempt on independent commission).

### 5.3 Forensic Logging & Traceability
Every step is traced via `[Payroll Forensics]` logging:
- `Step 1 - Base & Rate`: logs paymentModel, monthlyBase, quinzaineBase, standardHours, hourlyRate.
- `Step 2 - Attendance`: logs workedHours, overtimeHours, overtimePay, absenceDeduction, penalties.
- `Step 3 - Commissions`: logs sales, commissionRate, commissionAmount.
- `Step 4 - Summary`: logs grossPay, taxes, advances, bonuses, netPay, survivalFloorApplied.

---

## 6. VALIDATION, CRYPTOGRAPHIC SEALING & REVERSAL WORKFLOW

### 6.1 Lifecycle States
`DRAFT` -> `CALCULATED` -> `SEALED` (with optional `REVERSED` against a sealed cycle).

### 6.2 Cryptographic Sealing Workflow (`sealPayrollCycle`)
1. **Double-Seal Guard:** If the cycle is already `SEALED`, execution immediately aborts by throwing a typed `FinopsException` (`errorCode: "CYCLE_ALREADY_SEALED"`).
2. **Cryptographic SHA-256 Seal Signature:**
   - Computes a deterministic SHA-256 digest over the cycle payload (cycleId, businessId, totalGross, totalNet, employee count, timestamp).
   - Stored in `payroll_cycles/{cycleId}.sealSignature`, `sealedAt`, `sealedBy`, and as `hashSignature` across all `payroll_records`.
3. **Double-Entry General Ledger Integration:**
   - Calls `AccountingEngine.createPayrollJournalEntry(cycle, records, businessId, actor)`.
   - Accounting posting date is mapped strictly to `effectiveAccountingDate || cycle.endDate`.
   - Balanced ledger accounts:
     - Débit: `5100_PAYROLL_EXPENSE` (Masse salariale brute)
     - Crédit: `2100_ONA_TAXES_PAYABLE` (Retenues ONA 6%)
     - Crédit: `2110_OFATMA_TAXES_PAYABLE` (Retenues OFATMA 2%)
     - Crédit: `1300_EMPLOYEE_ADVANCES` (Recouvrement avances sur salaires)
     - Crédit: `1010_BANK` (Règlement net collaborateurs)
4. **Atomic Multi-Document Persistence:**
   - `PayrollRepository.sealCycleAtomic` persists cycle status, sealed payslips, GL transactions in `ledger_transactions`, and the signed forensic log in a single transaction.
5. **Event & Audit Dispatch:**
   - Emits `PAYROLL_CYCLE_SEALED` over `EventBus` and records a signed `PAYROLL_CYCLE_SEALED` log in `forensic_logs`.

### 6.3 Reversal & Contre-Passation Workflow (`reversePayrollCycle`)
1. **Pre-requisite Validation:** Only a `SEALED` cycle can be reversed. If attempted on non-sealed cycles, throws `FinopsException` (`errorCode: "CYCLE_NOT_SEALED"`).
2. **Audit Preservation:** The original sealed cycle and historical records are strictly preserved (immutable and never destroyed).
3. **Reversal DRAFT Cycle Generation:**
   - Generates a new `DRAFT` cycle with `reversalOfCycleId: cycle.id` and name `[CONTRE-PASSATION] <cycleName>`.
   - Generates inverse payslips (`grossSalary: -gross`, `netPaid: -net`, negative statutory deductions).
4. **General Ledger Contre-Passation Entry:**
   - Calls `AccountingEngine.createPayrollReversalJournalEntry(cycle, records, businessId, actor, reason)`.
   - Inverts debits and credits across all legs to balance out the General Ledger books.
5. **Traceability & Auditing:**
   - Marks the original cycle with `isReversed: true`, `reversalCycleId`, `reversedAt`, `reversedBy`, and `reversalReason`.
   - Writes a signed `PAYROLL_CYCLE_REVERSED` entry to `forensic_logs` and publishes `PAYROLL_CYCLE_REVERSED` event on `EventBus`.

---

## 7. FORENSIC AUDIT LOGGING (`forensic_logs`)

All critical payroll actions systematically write immutable, signed records to `forensic_logs`:
- **`PAYROLL_CYCLE_CREATED`**: Logged upon cycle initialization.
- **`PAYROLL_CYCLE_CALCULATED`**: Logged upon dry-run or calculation execution.
- **`PAYROLL_CYCLE_UPDATED`**: Logged when period dates, policies, or exclusions are modified.
- **`PAYROLL_CYCLE_DELETED`**: Logged on soft deletion with beforeState snapshot.
- **`PAYROLL_CYCLE_SEALED`**: Logged on cryptographic sealing with SHA-256 signature.
- **`PAYROLL_CYCLE_REVERSED`**: Logged on reversal/contre-passation with link to reversal cycle.

---

## 8. ROLES & PERMISSIONS

- `OWNER` / `MANAGER` / `SUPER_ADMIN`: Full access to create, edit, delete, dry-run, calculate, commit, and seal cycles.
- `HEAD_TELLER` / `SENIOR_TELLER` / `JUNIOR_TELLER`: Read-only access to payslips and cycle status.
