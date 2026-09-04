# FINOPS ERP — General Ledger & Double-Entry Accounting Specification

## Overview

FINOPS ERP includes a fully compliant double-entry general ledger architecture. Every financial transaction generates balanced debit and credit journal lines with strict cryptographic audit signatures.

---

## 1. Chart of Accounts Standard

| Account Code | Account Name | Type | Normal Balance |
| :--- | :--- | :--- | :--- |
| `1000` / `1010` | Main Bank Account (Banque Principale) | Asset | Debit |
| `1020` | Petty Cash (Caisse) | Asset | Debit |
| `1200` | Accounts Receivable (Clients) | Asset | Debit |
| `2000` / `2010` | Accounts Payable (Fournisseurs) | Liability | Credit |
| `2100` | TVA Payable (Taxe sur la valeur ajoutée) / ONA Taxes | Liability | Credit |
| `2110` | OFATMA Taxes Payable | Liability | Credit |
| `3000` | Share Capital / Owner Equity | Equity | Credit |
| `4000` | Operating Revenue (Ventes & Services) | Revenue | Credit |
| `5100` | Payroll & Salaries Expense | Expense | Debit |
| `5200` | Administrative & Operating Expense | Expense | Debit |

---

## 2. Fundamental Accounting Principles

1. **Double-Entry Equilibrium Rule**:
   $$\sum \text{Debits} = \sum \text{Credits}$$
   Transactions failing this equality are strictly rejected by the validation layer prior to persistence.
2. **Immutability of Posted Entries & Reversal Protocol**:
   - Posted ledger entries cannot be overwritten or deleted.
   - Corrections must be processed via explicit **Balanced Double-Entry Reversal Entries (Contre-Passations)**:
     - **Account Inversion**: A reversal transaction mirrors and inverts the debit and credit legs of the original transaction (e.g. reversing a `Debit 1010 / Credit 4000` entry creates a `Debit 4000 / Credit 1010` entry).
     - **Equilibrium & Leg Fields**: The reversal transaction explicitly populates `debit`, `credit`, `debit_cents`, and `credit_cents` ensuring $\sum \text{Debits} = \sum \text{Credits}$.
     - **Date Preservation (Independence of Exercises)**: Reversals strictly preserve the original accounting date of the transaction being reversed.
     - **Audit Linkage**: Reversals set `type = "REVERSAL"`, `source = "SYSTEM"`, and reference the original ID via `referenceTransactionId` and `metadata.reversalOf`.
     - **Event & Cache Pipeline**: Reversals emit `LEDGER_TRANSACTION_REVERSED`, invalidating analytical caches and triggering `SnapshotRebuildService.rebuildActivityTable`.
3. **Cryptographic Hash Chain**:
   - Each transaction includes a `signerId` or `signature` field formatted as `SHA256::...` incorporating the prior transaction hash, timestamp, and entry total.

---

## 3. CRM to Accounting Automatic Journal Integration

When a CRM Invoice transitions to `SENT` or `PAID`:
- `InvoiceService.postInvoiceToLedger` delegates to `AccountingEngine.createInvoiceJournal`:
  - **Debit**: `1200 - Accounts Receivable` for the total gross invoice amount.
  - **Credit**: `4000 - Operating Revenue` for the net invoice amount excluding tax.
  - **Credit**: `2100 - TVA Payable` for the applicable tax amount.
- An atomic batch writes the journal entry to Firestore and records the entry in the forensic audit vault.

---

## 4. Financial Statements & Snapshot Engine

The `FinancialSnapshotBuilder` dynamically calculates:
- **Balance Sheet (Bilan Comptable)**: Assets (Actifs), Liabilities (Passifs), and Equity (Capitaux Propres).
- **Profit & Loss Statement (Compte de Résultat)**: Revenues, Expenses, Gross Margin, and Net Margin.
- **Trial Balance (Balance Générale)**: Opening Balance, Debits, Credits, and Ending Balances per account with 100% balance validation.
- **Financial Ratios**: Current Ratio (Liquidité générale), Quick Ratio (Liquidité réduite), Debt-to-Equity, Net Profit Margin, and Return on Equity (ROE).

All snapshots can be persisted to Firestore collection `financial_snapshots` via `FinancialSnapshotRepository`.

---

## 5. Bank Reconciliation & Ledger Integrity

- **BankReconciliationEngine**: Automates reconciliation between bank statements and general ledger entries using fuzzy date matching, amount matching, and confidence score algorithms.
- **LedgerAuditEngine**: Scans the ledger for unposted entries, unbalanced debit/credit legs, missing chart-of-accounts mappings, and orphan department or branch references, offering one-click automated remediation.
