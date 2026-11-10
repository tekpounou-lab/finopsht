# FINOPS ERP / FINAYITI FUSION — ENGINEERING PHASE ENG-05
## MANUAL VALIDATION CHECKLIST — COMPLETE PAYROLL REVERSAL & ACCOUNTING INTEGRITY

**Phase ID:** ENG-05  
**Target:** Product Owner / QA Engineer  
**Date:** 2026-10-25  

---

## 1. PRE-CHECKLIST VERIFICATION

- [x] Application compiles cleanly via `compile_applet`.
- [x] Type checking and linting pass with 0 errors via `npm run lint`.
- [x] Automated test suite `CompletePayrollReversalIntegrityENG05.test.ts` passes 7/7 tests.

---

## 2. MANUAL TEST SCENARIOS FOR PRODUCT OWNER

### Scenario 1: Reversing an Unpaid Sealed Payroll (Case A)
1. **Action:** Navigate to **Paie & RH > Moteur de Paie**.
2. Select a sealed cycle that has NOT been disbursed to bank (`status: SEALED`).
3. Click **Contre-passation** and provide a reason (e.g. "Correction taux d'imposition").
4. **Expected Result:**
   - A new DRAFT cycle `[CONTRE-PASSATION] ...` is created.
   - The original cycle remains listed as `SEALED` with a badge/tag `isReversed: true`.
   - The original payslip values are unchanged.
   - The reversal payslips show negative gross (-), net (-), tax IRI (-), ONA (-), OFATMA (-), and advances (-).
   - In **Finance & Grand Livre**, reversal entries credit `5100_PAYROLL_EXPENSE` and debit `2100_PAYROLL_CLEARING` and tax liabilities. Bank account (`1010_BANK`) is NOT touched.

---

### Scenario 2: Reversing a Paid/Disbursed Sealed Payroll (Case B)
1. **Action:** Select a sealed cycle that has already been marked as paid/disbursed (`status: PAID`).
2. Click **Contre-passation** as an authorized Owner.
3. **Expected Result:**
   - The reversal journal entry reverses the expense (`5100_PAYROLL_EXPENSE`) and payroll clearing (`2100_PAYROLL_CLEARING`).
   - **Crucial:** Bank balance on `1010_BANK` does **NOT** increase automatically.
   - Transaction metadata indicates `bankDisbursementPreserved: true`.

---

### Scenario 3: Idempotency Protection (Duplicate Reversal Prevention)
1. **Action:** Attempt to click **Contre-passation** a second time on the same original cycle.
2. **Expected Result:**
   - An error toast appears: `[IdempotencyViolation] Le cycle de paie ... a déjà fait l'objet d'une contre-passation.`
   - No duplicate DRAFT cycle or duplicate GL entries are created.

---

### Scenario 4: Segregation of Duties (Maker-Checker Enforcement)
1. **Action:** Log in as a `SENIOR_TELLER` or `MANAGER` who initiated/sealed the cycle.
2. Attempt to click **Contre-passation** on that same cycle.
3. **Expected Result:**
   - Action is rejected with message: `[SegregationOfDutiesViolation] L'utilisateur ayant initié le cycle ne peut pas exécuter lui-même la contre-passation.`
