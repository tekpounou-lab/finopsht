# FINOPS — BI-P1.7.3 BUSINESS OWNER DECISION PACK

**Project:** FINOPS ERP / FINAYITI FUSION  
**Phase:** BI-P1.7.3 — Business Owner Participation & Financial Policy Sign-Off  
**Role:** Independent Financial Governance Facilitator, Accounting Policy Decision Analyst and Business Owner Approval Coordinator  
**Mode:** GOVERNANCE DOCUMENT PREPARATION — NO IMPLEMENTATION  
**Target Audience:** FINOPS Business Owner / C-Level Financial Executive  
**Date:** November 2026  

---

## 1. STRUCTURE OF THE DECISION PACK

This pack contains the detailed analysis, available options, trade-offs, and non-binding audit recommendations for the six required financial policy decisions (`BD-ACC-01` through `BD-ACC-06`).

All recommendations provided herein are **EXPLICITLY NON-BINDING**. The final choice rests solely with the authorized Business Owner.

---

## 2. DECISION DETAILS BY POLICY DOMAIN

### BD-ACC-01 — ACCOUNTS RECEIVABLE (AR) METRIC DEFINITION

- **Problem Statement:** The current BI dashboard displays customer collections and sales revenue, but does not provide a full Accounts Receivable subledger balance.
- **Current Technical Situation:** Revenue is recognized on accrual dates; cash receipts are tracked on settlement dates.
- **Available Options:**
  - **Option A:** Define the AR metric as a **Cash-vs-Accrual Revenue Timing Variance** (Revenue recognized minus cash collected).
  - **Option B:** Require a **Full Accounts Receivable Subledger Reconciliation** (Opening AR + Invoices - Collections - Write-offs = Closing AR).
- **Audit Recommendation (NON-BINDING):** **Option A** for immediate BI dashboard visibility, transitioning to Option B when customer invoice subledgers are fully posted.

---

### BD-ACC-02 — ACCOUNTS PAYABLE (AP) METRIC DEFINITION

- **Problem Statement:** The current BI dashboard displays operating expenses and supplier cash payments, but lacks an integrated Accounts Payable balance.
- **Current Technical Situation:** Operating expenses are recorded upon invoice receipt; cash payments reduce treasury.
- **Available Options:**
  - **Option A:** Define the AP metric as an **Accrual-vs-Cash Expense Timing Variance** (Expenses accrued minus supplier cash payments).
  - **Option B:** Require a **Full Accounts Payable Liability Reconciliation** (Opening AP + Supplier Bills - Payments = Closing AP).
- **Audit Recommendation (NON-BINDING):** **Option A** for immediate BI dashboard visibility, pending full supplier bill subledger integration.

---

### BD-ACC-03 — PAYROLL ACCRUAL, CASH AND LIABILITY MODEL

- **Problem Statement:** Need to establish how payroll expenses, disbursements, and statutory tax liabilities are represented in BI snapshots.
- **Current Technical Situation:** Payroll cost is accrued upon cycle sealing (Gross Salary + Employer ONA/OFATMA statutory contributions). Cash disbursements occur on payment dates.
- **Available Options:**
  - **Option A:** **Period Employment Cost Model** (Accrue total gross + employer taxes in the period worked; track cash paid on payment dates).
  - **Option B:** **Full Cumulative Payroll Liability Reconciliation Model** (Track opening/closing liabilities for net salaries, employee withholdings, and employer statutory taxes).
- **Audit Recommendation (NON-BINDING):** **Option A** (Period Employment Cost Model), as it reflects exact economic workforce cost for executive decision-making.

---

### BD-ACC-04 — PAYROLL GENERAL LEDGER (GL) ACCOUNT MAPPING

- **Problem Statement:** Need formal business approval for General Ledger account mappings used by the payroll engine.
- **Current Mappings:**
  - `5000_PAYROLL_EXPENSE` — Gross Salaries & Wages
  - `5110_EMPLOYER_TAX_EXPENSE` — Employer Statutory Contributions (ONA / OFATMA)
  - `2100_PAYROLL_CLEARING` — Net Salary Payable
  - `2110_TAXES_PAYABLE` — Statutory Tax Liabilities
  - `1300_EMPLOYEE_ADVANCES` — Employee Salary Advances (Asset)
- **Required Action:** Authorize these COA mappings or designate the finance manager responsible for accounting classification governance.

---

### BD-ACC-05 — EXECUTIVE PROFITABILITY KPI SEMANTICS

- **Problem Statement:** The main executive KPI labeled `"Bénéfice net réalisé"` calculates $R - E$ (Operating Result before D&A, interest, and taxes).
- **Available Options:**
  - **Option A:** **Rename KPI to "Résultat d'exploitation" / "Résultat opérationnel"**. (Matches existing $R - E$ formula; zero risk to historical numbers).
  - **Option B:** **Rename KPI to "EBIT"**. (Valid if non-operating items and D&A are zero).
  - **Option C:** **Retain "Bénéfice net" and expand the engine** to calculate full Net Income (Requires building D&A and income tax modules).
- **Audit Recommendation (NON-BINDING):** **Option A ("Résultat d'exploitation")**. Accurately describes the existing, verified formula ($R - E$) without requiring unbuilt D&A modules.

---

### BD-ACC-06 — HISTORICAL EXCHANGE RATE (FX) GOVERNANCE POLICY

- **Problem Statement:** Software contains unapproved conflicting fallback rates (`134.25` in analytics vs `135.0` in PDF reports).
- **Available Options:**
  - **Option A:** **Official BRH Daily Rate Feed** with fail-safe prior-day carryforward and explicit `isEstimated` UI warning badges.
  - **Option B:** **Business-Managed Exchange Rate Table** (Strict user entry; transaction posting blocked if rate is missing).
  - **Option C:** **External Commercial Banking API Feed**.
- **Audit Recommendation (NON-BINDING):** **Option A (BRH Daily Rate with Carryforward & `isEstimated` Warning)**. Aligns with Haitian banking reference standards and eliminates hardcoded code constants.
