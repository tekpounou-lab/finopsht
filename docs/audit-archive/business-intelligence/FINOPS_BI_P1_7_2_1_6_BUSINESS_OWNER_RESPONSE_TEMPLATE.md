# FINOPS — BI-P1.7.2.1.6
# BUSINESS OWNER RESPONSE TEMPLATE & ACTIONABLE PACKAGE

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.2.1.6  
**Purpose:** Actionable Governance Package for External Business Owner Decision Sign-Off  

---

## INSTRUCTIONS FOR THE BUSINESS OWNER

Please complete this formal response package to record your decisions on the six accounting policy proposals for FINOPS ERP / FINAYITI Fusion.

- You may approve, reject, defer, or modify each decision individually.
- Partial responses are fully supported (a response to one decision does NOT automatically approve others).
- Once completed, please save and return this document to serve as formal governance evidence (`EVID-04`).

---

## SECTION 1: BUSINESS OWNER DESIGNATION & AUTHORITY (`EVID-01` & `EVID-02`)

```text
FULL NAME: ____________________________________________________
TITLE / ROLE: [ ] Chief Financial Officer
              [ ] Managing Director / Business Owner
              [ ] Designated Financial Controller
              [ ] Other: ______________________________________
COMPANY / ENTITY: _____________________________________________
DATE: [YYYY-MM-DD]
EVIDENCE / DELEGATION ATTACHMENT REFERENCE: ____________________
```

---

## SECTION 2: INDIVIDUAL DECISION SIGN-OFF FORM

### DECISION 1: BD-ACC-01 — ACCOUNTS RECEIVABLE SEMANTICS
**Proposed Wording:** Present AR as an In-Period Timing Variance (`Accrual Revenue - Cash Revenue`) labeled *"Variance Temporelle des Produits"*.

```text
DECISION: [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVED REVISION / COMMENTS: _________________________________
```

---

### DECISION 2: BD-ACC-02 — ACCOUNTS PAYABLE SEMANTICS
**Proposed Wording:** Present AP as an In-Period Timing Variance (`Accrual Expenses - Cash Expenses`) labeled *"Variance Temporelle des Charges"*.

```text
DECISION: [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVED REVISION / COMMENTS: _________________________________
```

---

### DECISION 3: BD-ACC-03 — PAYROLL DISBURSEMENT POLICY
**Proposed Wording:** Model B: Sealing creates liability (`2100`); cash payout requires `payrollRunId` foreign key to settle liability against treasury (`1000/1010`).

```text
DECISION: [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVED REVISION / COMMENTS: _________________________________
```

---

### DECISION 4: BD-ACC-04 — PAYROLL CLASSIFICATION GOVERNANCE
**Proposed Wording:** Model C: Primary guardrail via COA `64xx` account codes and category tags; description keyword regex demoted to secondary audit flags.

```text
DECISION: [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVED REVISION / COMMENTS: _________________________________
```

---

### DECISION 5: BD-ACC-05 — EBITDA VS OPERATING RESULT PRESENTATION
**Proposed Wording:** Operating Result (*Résultat net d'exploitation*) is canonical; EBITDA remains explicitly `undefined` pending fixed asset D&A subledgers.

```text
DECISION: [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
APPROVED REVISION / COMMENTS: _________________________________
```

---

### DECISION 6: BD-ACC-06 — HISTORICAL FX FALLBACK POLICY
**Proposed Wording:** Option A/C: Historical normalization strictly utilizes date-specific BRH reference rate grids. Missing historical rates fail closed (`incompleteData: true`). Silent conversion at default rates (`135.0` or `134.25`) is strictly prohibited.

```text
DECISION: [ ] APPROVED   [ ] REJECTED   [ ] DEFERRED
AUTHORITATIVE FX RATE SOURCE DESIGNATION:
[ ] Banque de la République d'Haïti (BRH) Official Daily Reference Grid
[ ] Other Authorized Source: ____________________________________

APPROVED REVISION / COMMENTS: _________________________________
```

---

## SECTION 3: FORMAL SIGNATURE / CERTIFICATION

```text
I hereby certify that I possess the organizational authority to approve the accounting policies designated above for FINOPS ERP / FINAYITI Fusion.

SIGNATURE / TOKEN: ____________________________________________
DATE: [YYYY-MM-DD]
```
