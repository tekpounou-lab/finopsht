# FINOPS ERP / FINAYITI FUSION
## BI-P1.7.3 — FORMAL DECISION FORMS FOR BD-ACC-01 THROUGH BD-ACC-06

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.3 — Business Owner Participation & Financial Policy Sign-Off  
**Document ID:** FINOPS_BI_P1_7_3_BD_ACC_01_TO_06_DECISION_FORMS  
**Governance Mode:** STRICT GOVERNANCE DOCUMENT PREPARATION — READ ONLY (NO CODE IMPLEMENTATION)  
**Status:** DECISION FORMS PREPARED — AWAITING HUMAN BUSINESS OWNER SIGN-OFF  

---

## EXECUTIVE NOTICE FOR DECISION-MAKERS

This document contains the six formal, auditable decision forms requiring human sign-off from the authorized Business Owner or designated Financial Governance Authority.

**IMPORTANT GOVERNANCE DIRECTIVE:**  
All technical analysis and recommendations included herein represent **NON-BINDING TECHNICAL ADVICE** from the Financial Data Architecture & Audit Team. The selection of accounting policies is an exclusive governance right reserved for the human Business Owner.

---

### FORM 1: DECISION FORM BD-ACC-01 — ACCOUNTS RECEIVABLE (AR) METRIC DEFINITION

| Metadata Field | Specification |
|---|---|
| **Decision ID** | `BD-ACC-01` |
| **Decision Title** | Accounts Receivable (AR) Semantics & Recognition Threshold |
| **Financial Domain** | Revenue Recognition & Working Capital Accounting |
| **Affected Components** | Executive BI Dashboard, Financial Reporting Engine, General Ledger AR Reconciliation |
| **Technical Baseline** | Accrual billing model where generated invoices accumulate as outstanding receivables prior to cash settlement. |

#### 1. Policy Context & Technical Ambiguity
Currently, system metrics reflect billed invoices as Accounts Receivable upon issuance. However, organizational policy must clarify whether uncollected or disputed invoices are recognized in total AR without allowance for credit loss, or if cash-basis filtering applies to specific operational views.

#### 2. Policy Options

##### Option A (Recommended — Accrual Accounting Standard):
- **Policy:** Standard Accrual AR. Recognize all issued, non-cancelled invoices as Accounts Receivable regardless of cash settlement status.
- **Financial Impact:** Full visibility of short-term credit extended to clients; requires aging report alignment.
- **Audit Compliance:** Complies with standard US GAAP / IFRS accrual accounting principles.

##### Option B (Cash-Realized Settlement Standard):
- **Policy:** Cash-Basis AR. Only reflect receivables once payment commitment or bank wire confirmation is received; unconfirmed invoices remain in draft/pending status outside core AR KPIs.
- **Financial Impact:** Eliminates credit risk in top-line metrics but obscures outstanding collection pipeline.

##### Option C (Custom Organizational Rule):
- **Policy:** Custom threshold (e.g., exclude receivables past 90 days overdue from core AR KPI).

#### 3. Formal Business Owner Decision Selection

```text
[ ] OPTION A — Standard Accrual Accounts Receivable (RECOMMENDED)
[ ] OPTION B — Cash-Realized Settlement AR
[ ] OPTION C — Custom Policy (Specify below)

Custom Specification (if Option C selected):
TO BE COMPLETED BY THE ORGANIZATION

Business Owner Sign-Off:
Signature: ___________________________
Name: TO BE COMPLETED BY THE ORGANIZATION
Title: TO BE COMPLETED BY THE ORGANIZATION
Date: YYYY-MM-DD
```

---

### FORM 2: DECISION FORM BD-ACC-02 — ACCOUNTS PAYABLE (AP) METRIC DEFINITION

| Metadata Field | Specification |
|---|---|
| **Decision ID** | `BD-ACC-02` |
| **Decision Title** | Accounts Payable (AP) Semantics & Operational Liability Threshold |
| **Financial Domain** | Accounts Payable & Short-Term Liabilities |
| **Affected Components** | Executive BI Dashboard, Till & Branch Expense Engine, AP Reconciliation |
| **Technical Baseline** | Vendor obligations and branch disbursement requests are accrued upon approval. |

#### 1. Policy Context & Technical Ambiguity
System needs formal baseline approval on whether pending branch commitments and supplier invoices are recognized immediately as AP liabilities or upon final voucher payment authorization.

#### 2. Policy Options

##### Option A (Recommended — Comprehensive Accrual AP):
- **Policy:** Accrue all approved supplier bills, branch expense vouchers, and operational obligations immediately as Accounts Payable.
- **Financial Impact:** Accurately depicts current liability obligations and net working capital.

##### Option B (Disbursement-Triggered AP):
- **Policy:** Recognize AP liabilities only upon payment schedule release or cash transfer authorization.
- **Financial Impact:** Understates immediate operational liabilities prior to disbursement execution.

#### 3. Formal Business Owner Decision Selection

```text
[ ] OPTION A — Comprehensive Accrual AP (RECOMMENDED)
[ ] OPTION B — Disbursement-Triggered AP
[ ] OPTION C — Custom Policy (Specify below)

Custom Specification (if Option C selected):
TO BE COMPLETED BY THE ORGANIZATION

Business Owner Sign-Off:
Signature: ___________________________
Name: TO BE COMPLETED BY THE ORGANIZATION
Title: TO BE COMPLETED BY THE ORGANIZATION
Date: YYYY-MM-DD
```

---

### FORM 3: DECISION FORM BD-ACC-03 — PAYROLL DISBURSEMENT POLICY & TIMING

| Metadata Field | Specification |
|---|---|
| **Decision ID** | `BD-ACC-03` |
| **Decision Title** | Payroll Disbursement Liability Recognition & Cash Settlement Timing |
| **Financial Domain** | Payroll Accounting & Treasury Management |
| **Affected Components** | Payroll Module, Cash Management Engine, Executive BI KPI Summary |
| **Technical Baseline** | Payroll expenses accrue during pay-period calculation, while cash disbursement occurs on payout date. |

#### 1. Policy Context & Technical Ambiguity
Payroll constitutes a major operating expenditure. Technical audit identified the need to clarify whether payroll is presented in BI summary cards on an accrual basis (pay-period accrued date) or cash settlement date (disbursement date).

#### 2. Policy Options

##### Option A (Recommended — Accrual Pay-Period Recognition):
- **Policy:** Recognize payroll expense in the period earned/accrued by employees, with payout creating a liability settlement.
- **Financial Impact:** Matches payroll expense accurately against revenues generated in the same operational period.

##### Option B (Cash Payout Date Recognition):
- **Policy:** Recognize payroll expense solely when bank transfer or cash till disbursement is executed.
- **Financial Impact:** Causes artificial expense spikes on payout dates and distorts month-to-month margin analysis.

#### 3. Formal Business Owner Decision Selection

```text
[ ] OPTION A — Accrual Pay-Period Recognition (RECOMMENDED)
[ ] OPTION B — Cash Payout Date Recognition
[ ] OPTION C — Custom Policy (Specify below)

Custom Specification (if Option C selected):
TO BE COMPLETED BY THE ORGANIZATION

Business Owner Sign-Off:
Signature: ___________________________
Name: TO BE COMPLETED BY THE ORGANIZATION
Title: TO BE COMPLETED BY THE ORGANIZATION
Date: YYYY-MM-DD
```

---

### FORM 4: DECISION FORM BD-ACC-04 — PAYROLL CLASSIFICATION POLICY (COA GOVERNANCE)

| Metadata Field | Specification |
|---|---|
| **Decision ID** | `BD-ACC-04` |
| **Decision Title** | Payroll Chart of Accounts (COA) Mapping & Expense Categorization |
| **Financial Domain** | Chart of Accounts & General Ledger Governance |
| **Affected Components** | General Ledger Engine, Payroll Module, Financial Reporting |
| **Technical Baseline** | Single blended payroll account used across operations and administration. |

#### 1. Policy Context & Technical Ambiguity
Determines whether payroll should be split into Direct Operational Labor (Cost of Goods / Services) vs Administrative Payroll (OPEX), or maintained as a single consolidated Operational Payroll expense line item.

#### 2. Policy Options

##### Option A (Recommended — Dual Category COA Mapping):
- **Policy:** Map Branch Tellers, Vault Officers, and Field Staff to Direct Operational Labor (COGS/COS); map Management, HR, and IT staff to Administrative Expenses (OPEX).
- **Financial Impact:** Enables accurate Gross Margin calculation and Operating Result segmentation.

##### Option B (Single Consolidated Payroll Line):
- **Policy:** Aggregate all payroll items under a single Operating Expenditure account (`6100 - Payroll Expense`).
- **Financial Impact:** Simplifies ledger mapping but prevents Gross Margin vs Operating Margin distinction.

#### 3. Formal Business Owner Decision Selection

```text
[ ] OPTION A — Dual Category COA Mapping (RECOMMENDED)
[ ] OPTION B — Single Consolidated Payroll Line
[ ] OPTION C — Custom Policy (Specify below)

Custom Specification (if Option C selected):
TO BE COMPLETED BY THE ORGANIZATION

Business Owner Sign-Off:
Signature: ___________________________
Name: TO BE COMPLETED BY THE ORGANIZATION
Title: TO BE COMPLETED BY THE ORGANIZATION
Date: YYYY-MM-DD
```

---

### FORM 5: DECISION FORM BD-ACC-05 — EBITDA / OPERATING RESULT KPI SEMANTIC RE-LABELING

| Metadata Field | Specification |
|---|---|
| **Decision ID** | `BD-ACC-05` |
| **Decision Title** | KPI Re-labeling: "Bénéfice Net Réalisé" to "Résultat d'Exploitation" (Operating Result) |
| **Financial Domain** | Executive BI Reporting & Financial Semantics |
| **Affected Components** | Executive BI Dashboard KPI Grid, Performance Intelligence Module, Financial Statements |
| **Technical Baseline** | KPI labeled "Bénéfice net réalisé" computes $Revenue - Expenses$ without tax, interest, or D&A deductions. |

#### 1. Policy Context & Technical Ambiguity
The metric currently displayed as "Bénéfice net réalisé" is mathematically equal to Total Revenue minus Total Expenses (EBIT / Operating Result). Calling it "Bénéfice net" (Net Profit) creates a semantic mismatch under standard financial reporting rules.

#### 2. Policy Options

##### Option A (Recommended — Relabel to "Résultat d'Exploitation"):
- **Policy:** Change UI label from "Bénéfice net réalisé" to "Résultat d'exploitation" (Operating Result / EBIT). Preserve formula ($R - E$).
- **Financial Impact:** Achieves instant compliance with standard accounting terminology without requiring complex tax/interest engine additions.

##### Option B (Expand Formula to Full Net Profit):
- **Policy:** Keep label "Bénéfice net réalisé", but modify backend calculation to subtract Interest, Taxes, Depreciation, and Amortization (ITDA).
- **Financial Impact:** Requires developing tax and asset depreciation modules before KPI can be rendered.

#### 3. Formal Business Owner Decision Selection

```text
[ ] OPTION A — Relabel to "Résultat d'Exploitation" (RECOMMENDED)
[ ] OPTION B — Expand Formula to Full Net Profit
[ ] OPTION C — Custom Policy (Specify below)

Custom Specification (if Option C selected):
TO BE COMPLETED BY THE ORGANIZATION

Business Owner Sign-Off:
Signature: ___________________________
Name: TO BE COMPLETED BY THE ORGANIZATION
Title: TO BE COMPLETED BY THE ORGANIZATION
Date: YYYY-MM-DD
```

---

### FORM 6: DECISION FORM BD-ACC-06 — HISTORICAL FX FALLBACK POLICY & GOVERNANCE

| Metadata Field | Specification |
|---|---|
| **Decision ID** | `BD-ACC-06` |
| **Decision Title** | Historical FX Fallback Rate Governance & Missing Rate Safety Policy |
| **Financial Domain** | Multi-Currency Accounting & FX Governance |
| **Affected Components** | `NormalizedAmountResolver.ts`, `ReportCenterEngine.ts`, Currency Normalization Layer |
| **Technical Baseline** | Codebase contains unapproved hardcoded fallback rates (`134.25` in Resolver vs `135.0` in Report Center), creating a $7,500 HTG divergence on $10,000 USD conversions. |

#### 1. Policy Context & Technical Ambiguity
When historical market FX rates are missing for a transaction date, the system requires an authoritative policy rule for fallback rate resolution.

#### 2. Policy Options

##### Option A (Recommended — Central Governance Exchange Rate Master & Strict Priority Cascade):
- **Policy:** Establish a single Central FX Rate Master table. Resolution order: (1) Transaction-date rate -> (2) Latest official BRH daily rate -> (3) Official monthly rate -> (4) Explicit Governance Fallback Rate (e.g. 135.0 HTG/USD). Eliminate duplicate hardcoded constants across files.
- **Financial Impact:** Guarantees 100% multi-currency consistency across all financial reports, till balances, and BI metrics.

##### Option B (Strict Freeze / Block on Missing Rate):
- **Policy:** Block any report generation or multi-currency normalization if exact date FX rate is missing, requiring explicit user input.
- **Financial Impact:** High operational friction; prevents reporting when daily rates are delayed.

#### 3. Formal Business Owner Decision Selection

```text
[ ] OPTION A — Central Governance FX Master & Priority Cascade (RECOMMENDED)
[ ] OPTION B — Strict Freeze / Block on Missing Rate
[ ] OPTION C — Custom Policy (Specify below)

Custom Specification (if Option C selected):
TO BE COMPLETED BY THE ORGANIZATION

Business Owner Sign-Off:
Signature: ___________________________
Name: TO BE COMPLETED BY THE ORGANIZATION
Title: TO BE COMPLETED BY THE ORGANIZATION
Date: YYYY-MM-DD
```

---

## CONSOLIDATED SIGN-OFF BLOCK

By signing below, the authorized Business Owner or Delegated Financial Governance Officer formally executes the decisions marked above and instructs the technical engineering team to enforce these choices across the FINOPS ERP / FINAYITI FUSION platform.

```text
GOVERNANCE SIGN-OFF ATTESTATION:

Authorized Business Owner Name: TO BE COMPLETED BY THE ORGANIZATION
Designated Title: TO BE COMPLETED BY THE ORGANIZATION
Organization / Entity: TO BE COMPLETED BY THE ORGANIZATION

Signature: _________________________________________
Date of Formal Execution: YYYY-MM-DD

Implementation Authorization Status: PENDING FORMAL EXECUTION
```
