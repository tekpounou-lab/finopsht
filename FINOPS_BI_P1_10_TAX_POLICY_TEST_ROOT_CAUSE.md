# FINOPS BI-P1.10 — TAX POLICY ENGINE TEST ROOT CAUSE ANALYSIS

**Investigation ID:** `FINOPS-BI-P1.10-TAX-POLICY-RCA-01`  
**Target:** `src/tests/integration/Phase131RuntimeVerification.integration.test.ts:20`  
**Engine Under Inspection:** `src/services/payroll/TaxPolicyEngine.ts:265-310` (`TaxPolicyEngine.isAttendanceRequiredForPayroll`)  
**Verdict:** **`PRE-EXISTING DEFECT & DESIGN INCONSISTENCY IN TaxPolicyEngine.ts (NOT A BI-P1.9 REGRESSION)`**  

---

## 1. THE FAILING ASSERTION & TRACE

### Failing Test Code (`src/tests/integration/Phase131RuntimeVerification.integration.test.ts:16-24`)
```typescript
it("should resolve default statutory policy when configuration is empty", () => {
  const config = {};
  expect(TaxPolicyEngine.isSocialTaxEnabled(config)).toBe(true);
  expect(TaxPolicyEngine.isAttendanceRequiredForPayroll(config)).toBe(true); // <--- FAILS HERE!
  expect(TaxPolicyEngine.isSurvivalFloorEnabled(config)).toBe(true);
  expect(TaxPolicyEngine.getSurvivalFloorAmount(config)).toBe(15000);
});
```

### Execution Output
```
FAIL src/tests/integration/Phase131RuntimeVerification.integration.test.ts > Phase 13.1 Runtime Verification > should resolve default statutory policy when configuration is empty
AssertionError: expected false to be true // Object.is equality
- Expected: true
+ Received: false
 ❯ src/tests/integration/Phase131RuntimeVerification.integration.test.ts:20:70
```

---

## 2. SOURCE CODE INSPECTION (`TaxPolicyEngine.ts`)

Let us compare the four statutory resolver methods in `src/services/payroll/TaxPolicyEngine.ts`:

### A. `isSocialTaxEnabled(source?: any): boolean` (lines 173-194)
```typescript
static isSocialTaxEnabled(source?: any): boolean {
  if (typeof source === "boolean") return source;
  if (!source || typeof source !== "object") return true;
  if (source.enable_social_taxes !== undefined) return Boolean(source.enable_social_taxes);
  // ... nested checks ...
  return true; // <--- DEFAULTS TO TRUE FOR EMPTY OBJECT {}!
}
```

### B. `isSurvivalFloorEnabled(source?: any): boolean` (lines 222-243)
```typescript
static isSurvivalFloorEnabled(source?: any): boolean {
  if (typeof source === "boolean") return source;
  if (!source || typeof source !== "object") return true;
  if (source.enable_survival_floor !== undefined) return Boolean(source.enable_survival_floor);
  // ... nested checks ...
  return true; // <--- DEFAULTS TO TRUE FOR EMPTY OBJECT {}!
}
```

### C. `isAttendanceRequiredForPayroll(source?: any): boolean` (lines 265-310)
```typescript
static isAttendanceRequiredForPayroll(source?: any): boolean {
  if (typeof source === "boolean") {
    return source;
  }
  if (!source || typeof source !== "object") {
    return true; // <--- RETURNS TRUE ONLY FOR undefined, null, or non-object!
  }

  if (source.attendance?.excludeWithoutRecords !== undefined) {
    return Boolean(source.attendance.excludeWithoutRecords);
  }
  if (source.require_attendance_for_payroll !== undefined) {
    return Boolean(source.require_attendance_for_payroll);
  }
  if (source.requireAttendanceForPayroll !== undefined) {
    return Boolean(source.requireAttendanceForPayroll);
  }

  // checks source.payroll and source.settings.payroll
  // checks source.payroll_policies and source.payrollPolicies

  return false; // <--- FALLS THROUGH TO FALSE FOR EMPTY OBJECT {}!
}
```

---

## 3. ROOT CAUSE PROOF

1. **The Asymmetric Guard:**
   - When `source === undefined` (e.g. `TaxPolicyEngine.isAttendanceRequiredForPayroll()`), line 270 evaluates `!source` to `true` and returns **`true`**. This is why `src/tests/unit/TaxPolicyEngine.test.ts:76` (`expect(TaxPolicyEngine.isAttendanceRequiredForPayroll()).toBe(true)`) **PASSES GREEN**.
   - When `source === {}` (empty object, as in `Phase131RuntimeVerification.integration.test.ts:17`), `!source` is `false`, `typeof source === "object"` is `true`. None of the properties (`attendance`, `require_attendance_for_payroll`, `payroll`, `payroll_policies`) exist on `{}`.
   - Execution falls through all checks to line 309: **`return false;`**!
   - This directly contradicts lines 191 (`isSocialTaxEnabled`) and 241 (`isSurvivalFloorEnabled`), which return `true` as the statutory fallback when no explicit override is found on `{}`.

2. **Forensic Timestamp Evidence (`stat -c "%y"`):**
   - `src/services/payroll/TaxPolicyEngine.ts`: **`2026-11-16 14:41:10.967301696 +0000`**
   - `src/tests/integration/Phase131RuntimeVerification.integration.test.ts`: **`2026-11-16 14:41:11.030209048 +0000`**
   - All BI-P1.9 modifications occurred between **`14:49:19`** and **`15:01:22`**.
   - **Conclusion:** `TaxPolicyEngine.ts` and `Phase131RuntimeVerification.integration.test.ts` were **NOT touched** by BI-P1.9. This inconsistency existed in the codebase prior to the BI-P1.9 remediation. It is **100% PRE-EXISTING**, not a regression.

3. **Downstream Callers and Impact:**
   - In `src/services/payroll/PayrollService.ts:287`:
     ```typescript
     const requireAttendance = TaxPolicyEngine.isAttendanceRequiredForPayroll(settings || {});
     ```
     Because `settings || {}` defaults to `{}` when a business has no settings saved, `PayrollService` currently defaults to `requireAttendance = false` (salaried workers without biometric/attendance logs are included in payroll).
   - In `src/tests/unit/PayrollAdversarialValidation.test.ts:241` (`C2`): Salaried worker with 0 hours was included in payroll because `PayrollService` line 311 only auto-excludes `HOURLY` workers when pointage is missing.

---

## 4. RECOMMENDED NEXT ACTION (NON-IMPLEMENTED)

When authorized in a subsequent maintenance/governance phase:
- In `src/services/payroll/TaxPolicyEngine.ts:309`, evaluate whether business policy dictates statutory default attendance enforcement (`return true;`) or opt-in attendance enforcement (`return false;`).
- If statutory policy requires attendance by default across Haiti labor standards, update line 309 to `return true;`.
- If attendance enforcement is strictly opt-in per tenant configuration, update `Phase131RuntimeVerification.integration.test.ts:20` to expect `false` when `config = {}` (or test with `{ require_attendance_for_payroll: true }`).
