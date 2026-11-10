# FINOPS ERP / FINAYITI FUSION — PHASE ENG-01
## OWNER'S MANUAL VALIDATION CHECKLIST & OPERATIONAL GUIDE

**Target Audience:** Product Owner / Business Administrator  
**Scope:** Real End-to-End Operational Manual Validation  
**Environment:** Local Dev Server / Staging Environment  
**Mode:** MANUAL VERIFICATION BY OWNER

---

### 1. OVERVIEW & INSTRUCTIONS

This manual validation checklist provides the business owner with step-by-step procedures to test all core ERP workflows in a browser environment.

For each test case:
1. Verify the **Preconditions**.
2. Log in with the required **User Role**.
3. Perform the exact **UI Actions**.
4. Confirm the **Expected UI Result** and **Backend/Data Persistence**.

---

### 2. CORE WORKFLOW VALIDATION CHECKLIST

#### TEST CASE 1 — Login, Session Restoration & Navigation
- **Preconditions:** Server running (`npm run dev`), browser open at `http://localhost:3000/login`.
- **Test Account Role:** `OWNER` / `ADMIN`
- **UI Actions:**
  1. Click "Connexion Google" or log in with test user credentials.
  2. Confirm redirect to `/resolve` -> `/dashboard` or `/workspace`.
  3. Refresh the browser window (F5 / Ctrl+R).
- **Expected UI Result:** Session remains active without forcing re-login.
- **Backend Verification:** User profile document loaded from `/users/{uid}` in Firestore.
- **Negative Test:** Attempt to navigate to `/platform` with non-SuperAdmin user -> Redirected away or access denied notice displayed.

#### TEST CASE 2 — Business Creation & Provisioning
- **Preconditions:** Logged in user without an active business or selecting "Créer une entreprise".
- **Test Account Role:** `OWNER`
- **UI Actions:**
  1. Navigate to `/onboarding-choice` or click "Créer une entreprise".
  2. Enter Company Name (e.g., "Entreprise Haïti S.A."), currency (`HTG`), and select plan.
  3. Submit creation form.
- **Expected UI Result:** Toast notification "Entreprise initialisée avec succès" and redirection to dashboard.
- **Backend Verification:** Endpoint `/api/provisioning/create-business` executes atomic Firestore batch creating business document in `/businesses/{businessId}` along with default chart of accounts and initial employee profile.

#### TEST CASE 3 — Employee Management & Onboarding
- **Preconditions:** Active business context selected.
- **Test Account Role:** `OWNER` / `MANAGER`
- **UI Actions:**
  1. Navigate to "Ressources Humaines" -> "Employés".
  2. Click "Ajouter un employé".
  3. Fill in name, email, payment model (`FIXED` or `COMMISSION`), base salary (e.g. `25,000 HTG`), and department.
  4. Click "Enregistrer".
- **Expected UI Result:** New employee appears in the active employees table.
- **Backend Verification:** Document created in `/employees/{employeeId}` with `business_id` set to current tenant.

#### TEST CASE 4 — Payroll Calculation, Review & Sealing
- **Preconditions:** Active business with at least 1 employee.
- **Test Account Role:** `OWNER` / `MANAGER`
- **UI Actions:**
  1. Navigate to "Gestion de Paie" -> "Cycles de Paie".
  2. Click "Nouveau cycle de paie" (e.g. "Quinzaine 1er-15 Août 2026").
  3. Click "Calculer la paie".
  4. Inspect the generated payslips: verify gross salary, 6% ONA, 2% OFATMA deductions, and net salary.
  5. Click "Sceller le cycle de paie" and confirm.
- **Expected UI Result:** Cycle status changes to `SEALED`. Payslips display cryptographic SHA-256 seal signature.
- **Backend Verification:**
  - `payroll_cycles/{cycleId}` updated to `status: "SEALED"`.
  - Double-entry journal entry automatically generated in `ledger_transactions` with balanced debit/credit amounts.

#### TEST CASE 5 — Cash Register Shift Open & Daily Closure
- **Preconditions:** Branch teller account configured.
- **Test Account Role:** `HEAD_TELLER` / `SENIOR_TELLER`
- **UI Actions:**
  1. Navigate to "Gestion de Caisse" -> "Caisses".
  2. Click "Ouvrir la caisse" and enter initial float (e.g., `5,000 HTG`).
  3. Perform a test cash deposit or payment movement.
  4. Click "Fermeture de caisse", enter physical count, and submit.
- **Expected UI Result:** Till status updates to `CLOSED`. Variance (gap) between physical count and system balance is displayed clearly.
- **Backend Verification:** `cash_movements` record created; `tills/{tillId}` updated with closure status and variance log.

#### TEST CASE 6 — Approval Workflow Execution (Maker-Checker)
- **Preconditions:** Transaction requiring approval submitted by a teller (Maker).
- **Test Account Role:** `MANAGER` / `OWNER` (Checker)
- **UI Actions:**
  1. Navigate to "Centre d'Approbations".
  2. Locate the pending approval request (e.g., transfer > threshold).
  3. Click "Approuver" or "Rejeter" with an optional note.
- **Expected UI Result:** Request status updates to `APPROVED` or `REJECTED`.
- **Backend Verification:** Endpoint `/api/approvals/process` verifies maker-checker separation (approver != initiator) and executes state transition.

#### TEST CASE 7 — Executive Analytics & AI CFO Inquiry
- **Preconditions:** Financial data present in ledger and payroll.
- **Test Account Role:** `OWNER` / `ADMIN`
- **UI Actions:**
  1. Navigate to "Tableau de Bord / Analytics".
  2. Click "Consulter l'AI CFO".
  3. Type a question (e.g. "Quelle est l'analyse de nos coûts de paie et du risque de trésorerie ?").
- **Expected UI Result:** AI CFO returns structured synthesis with cash flow metrics, fraud risk assessment, and recommendations.
- **Backend Verification:** `/api/cfo/analyze` processes inquiry through role-based data masking and Gemini API or heuristic FinancialRatioEngine.

---

### 3. SUMMARY OF TEST PRECONDITIONS & ROLES

| Test Case | Feature Area | Required Role | Tenant Context | Primary Verification Target |
|---|---|---|---|---|
| **TC-1** | Authentication & Session | Any Role | Global | Session persistence & route access |
| **TC-2** | Business Provisioning | OWNER | New Tenant | Multi-collection database setup |
| **TC-3** | Employee Onboarding | OWNER / MANAGER | Active Tenant | `/employees` collection document |
| **TC-4** | Payroll & GL Sealing | OWNER / MANAGER | Active Tenant | `/payroll_cycles`, `/ledger_transactions` |
| **TC-5** | Cash Register Closure | HEAD TELLER / MANAGER | Branch Tenant | `/tills`, `/cash_movements` |
| **TC-6** | Maker-Checker Approval | MANAGER / OWNER | Active Tenant | `/approval_requests` & maker check |
| **TC-7** | Executive AI CFO | OWNER / ADMIN | Active Tenant | `/api/cfo/analyze` endpoint & RBAC |

---

**Execution Note:** All operational tests above should be run by the product owner in a browser environment to confirm user experience and operational flow.
