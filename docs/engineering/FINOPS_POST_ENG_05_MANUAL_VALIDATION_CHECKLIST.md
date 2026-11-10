# FINOPS ERP / FINAYITI FUSION — POST-ENG-05
## MANUAL VALIDATION CHECKLIST — PAYROLL RECOVERY & ACCOUNTING INTEGRITY

**Phase ID:** POST-ENG-05  
**Target:** Product Owner / Staging QA Engineer  
**Date:** 2026-10-25  

---

## 1. PRE-CHECKLIST VERIFICATION

- [x] Application compiles cleanly via `compile_applet`.
- [x] Type checking and linting pass with 0 errors via `npm run lint`.
- [x] Test suite `PostENG05RecoveryIntegrity.test.ts` passes 11/11 tests.
- [x] Combined test suite passes 24/24 tests.

---

## 2. MANUAL TEST SCENARIOS

### Scenario 1: Reversing a Paid Payroll and Viewing the Recovery Proposal
1. **Action:** Navigate to **Paie & RH > Moteur de Paie** and select a cycle in `PAID` status.
2. Trigger **Contre-passation**.
3. **Expected Result:**
   - Reversal cycle is generated in `DRAFT`.
   - The bank disbursement (`1010_BANK`) is preserved in Grand Livre history.
   - An overpayment recovery proposal (`EmployeeReceivable`) is generated with status `PENDING_HUMAN_APPROVAL`.
   - Bank balance does NOT increase automatically.

---

### Scenario 2: Human Approval and Maker-Checker Validation
1. **Action:** Log in as the proposal creator and attempt to approve the proposal.
2. **Expected Result:**
   - Action is rejected with error `[SegregationOfDutiesViolation] L'utilisateur ne peut pas approuver sa propre proposition.`
3. **Action:** Log in as a distinct Owner or Manager and approve the proposal.
4. **Expected Result:**
   - Status transitions to `APPROVED_PENDING_RECOVERY`.
   - A balanced journal entry is posted (`Dr 1310_EMPLOYEE_RECEIVABLES`, `Cr 2100_PAYROLL_CLEARING`).

---

### Scenario 3: Partial Repayment and Full Settlement
1. **Action:** Record a partial repayment (e.g. 10,000 HTG out of 26,100 HTG) paid via Cash or Bank.
2. **Expected Result:**
   - Status transitions to `PARTIALLY_RECOVERED`.
   - Outstanding balance is updated in minor cents to 16,100 HTG.
   - Cash receipt GL entry is posted (`Dr 1010_BANK / 1000_CASH`, `Cr 1310_EMPLOYEE_RECEIVABLES`).
3. **Action:** Record a second repayment for the remaining 16,100 HTG.
4. **Expected Result:**
   - Outstanding balance reaches 0 HTG.
   - Status transitions to `RECOVERED`.
