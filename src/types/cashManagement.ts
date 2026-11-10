export type CurrencyCode = "HTG" | "USD";

export interface CashTill {
  id: string; // e.g. till_branch1_01
  business_id: string;
  branch_id: string;
  branch_name?: string;
  department_id?: string;
  department_name?: string;
  name: string; // e.g. "TILL-HTG-001 - Marie Dupont"
  code?: string; // Standardized till code (e.g. TILL-HTG-001)
  type?: "TILL";
  assigned_teller_id?: string;
  assigned_teller_name?: string;
  currency: CurrencyCode;
  balance_cents: number;
  linked_account_code?: string; // Mandatory accounting mapping, e.g. "1010" for HTG, "1020" for USD
  linked_account_name?: string; // e.g. "Caisse HTG Guichet"
  status: "OPEN" | "CLOSED" | "CLOSURE_REQUESTED" | "LOCKED";
  active_session_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface BranchSafe {
  id: string; // e.g. safe_branch1_htg
  business_id: string;
  branch_id: string;
  branch_name?: string;
  department_id?: string;
  department_name?: string;
  name: string; // e.g. "SAFE-HTG-01 (Coffre Principal HTG)"
  code?: string; // Standardized safe code (e.g. SAFE-HTG-01)
  type?: "SAFE";
  manager_id?: string;
  manager_name?: string;
  currency: CurrencyCode;
  balance_cents: number;
  linked_account_code?: string; // e.g. "1010" / "1015" for HTG, "1020" / "1025" for USD
  linked_account_name?: string;
  min_limit_cents: number;
  max_limit_cents: number;
  status?: "ACTIVE" | "LOCKED" | "SUSPENDED";
  created_by?: string;
  created_at?: string;
  updated_at: string;
}

export interface DenominationBreakdown {
  // HTG: 1000, 500, 250, 100, 50, 25, 10, 5
  // USD: 100, 50, 20, 10, 5, 2, 1
  [key: string]: number; // count of each note/coin
}

export type TillSessionStatus =
  | "ACTIVE"
  | "CLOSURE_REQUESTED"
  | "PENDING_APPROVAL"
  | "CLOSED_MATCHED"
  | "CLOSED_DISCREPANCY"
  | "CLOSED"
  | "REOPENED";

export interface TillSession {
  id: string; // e.g. sess_till1_20261016
  business_id: string;
  branch_id?: string;
  till_id: string;
  till_name?: string;
  teller_id?: string;
  teller_name?: string;
  operator_id?: string;
  operator_name?: string;
  currency?: CurrencyCode;
  business_date?: string; // YYYY-MM-DD
  opened_at: string;
  closed_at?: string;
  opening_balance_cents: number;
  current_balance_cents?: number;
  
  // SSOT Calculated Financial Totals from Authoritative Transactions & Transfers
  total_inflows_cents?: number;
  total_outflows_cents?: number;
  expected_closing_cents?: number;
  actual_closing_cents?: number;
  discrepancy_cents?: number; // (actual - expected)
  variance_type?: "ZERO" | "OVERAGE" | "SHORTAGE";
  
  denomination_breakdown?: DenominationBreakdown;
  status: TillSessionStatus;
  notes?: string;
  
  // Variance accounting
  variance_ledger_tx_id?: string;
  variance_account_code?: string; // e.g. "2910"
  
  // Supervisor Approval
  closure_requested_at?: string;
  closure_approver_id?: string;
  closure_approver_name?: string;
  closure_approved_at?: string;
  
  // Reopening Audit Trail (Section 20)
  reopened_at?: string;
  reopened_by_id?: string;
  reopened_by_name?: string;
  reopen_approver_id?: string;
  reopen_approver_name?: string;
  reopen_reason?: string;
  previous_session_id?: string;
  reopened_from_session_id?: string;
}

export type TellerTransactionType =
  | "DEPOSIT"            // Dépôt cash client (Cash In)
  | "WITHDRAWAL"         // Retrait cash client (Cash Out)
  | "SALE"               // Vente comptant (Cash In)
  | "SERVICE"            // Prestation de service (Cash In)
  | "FX_EXCHANGE"        // Achat / Vente de devises
  | "MONEY_TRANSFER_IN"  // Envoi transfert (Cash In)
  | "MONEY_TRANSFER_OUT" // Paiement transfert (Cash Out)
  | "OPERATING_EXPENSE"; // Dépense courante guichet (Cash Out)

export interface TellerTransaction {
  id: string; // e.g. tx_teller_20261026_001
  business_id: string;
  branch_id: string;
  till_id: string;
  session_id: string;
  operator_id: string;
  operator_name: string;
  business_date: string; // YYYY-MM-DD
  transaction_type_code: string; // e.g. "1001", "2001", "80001"
  transaction_type_name: string;
  flow_behavior: 1 | -1 | 0; // 1 = Cash In (Debit till), -1 = Cash Out (Credit till)
  
  // Currencies & Amounts
  currency: CurrencyCode; // Nominal currency received/handled in this till
  amount_cents: number;   // Amount in till currency
  
  // FX details (when customer transacts cross-currency)
  is_cross_currency?: boolean;
  target_currency?: CurrencyCode;
  target_amount_cents?: number;
  exchange_rate_type?: string; // e.g. "ACHAT_CLIENT", "VENTE_CLIENT", "ACHAT_ENVOIE", "VENTE_ENVOIE", "LOCAL", "BRH"
  applied_exchange_rate?: number; // Frozen historical rate
  htg_equivalent_cents?: number;  // Canonical local currency equivalent
  
  // Accounting linkage
  debit_account_code: string;
  debit_account_name: string;
  credit_account_code: string;
  credit_account_name: string;
  ledger_transaction_id: string; // Reference to General Ledger entry
  
  // Customer & Audit details
  customer_name?: string;
  customer_phone?: string;
  customer_id_document?: string;
  notes?: string;
  idempotency_key?: string;
  status: "POSTED" | "VOIDED";
  created_at: string;
}

export interface TillStatementMovement {
  id: string;
  date: string;
  type: "OPENING" | "TRANSACTION" | "STT" | "TTS" | "VARIANCE" | "CLOSING";
  description: string;
  referenceId: string;
  inflow_cents: number;
  outflow_cents: number;
  running_balance_cents: number;
  currency: CurrencyCode;
  operatorName: string;
  glAccountDebit?: string;
  glAccountCredit?: string;
}

export interface TillStatement {
  tillId: string;
  tillName: string;
  currency: CurrencyCode;
  startDate: string;
  endDate: string;
  openingBalanceCents: number;
  totalInflowsCents: number;
  totalOutflowsCents: number;
  closingBalanceCents: number;
  // Aliases for compatibility
  opening_balance_cents?: number;
  total_inflows_cents?: number;
  total_outflows_cents?: number;
  closing_balance_cents?: number;
  movements: TillStatementMovement[];
}

export type TransferSourceType = "TILL" | "SAFE" | "BANK" | "EQUITY_INJECTION";
export type TransferDestinationType = "TILL" | "SAFE" | "BANK";

export interface InternalTransfer {
  id: string; // e.g. trf_20261016_001
  business_id: string;
  branch_id: string;
  source_type: TransferSourceType;
  source_id: string;
  source_name: string;
  destination_type: TransferDestinationType;
  destination_id: string;
  destination_name: string;
  amount_cents: number;
  currency: CurrencyCode;
  status: "PENDING_APPROVAL" | "APPROVED" | "EXECUTED" | "REJECTED";
  initiator_id: string;
  initiator_name: string;
  initiator_role?: string;
  approver_id?: string;
  approver_name?: string;
  rejection_reason?: string;
  description: string;
  created_at: string;
  approved_at?: string;
  executed_at?: string;
  // Direct link with Chart of Accounts (Plan Comptable) & General Ledger (GL)
  debit_account_code?: string;
  debit_account_name?: string;
  credit_account_code?: string;
  credit_account_name?: string;
  bank_reference?: string;
  gl_transaction_id?: string;
  funding_category?: "BANK_WITHDRAWAL" | "INTER_SAFE" | "OWNER_INJECTION" | "TILL_RELIEF";
}

export type CustomerTransferStatus = "READY_FOR_PAYOUT" | "PAID" | "CANCELLED" | "EXPIRED";

export interface CustomerTransfer {
  id: string; // UUID
  business_id: string;
  branch_id: string;
  reference: string; // Searchable unique reference, e.g. "TRF-12345678"
  
  // Sender Details
  sender_name: string;
  sender_phone?: string;
  sender_country?: string;
  
  // Beneficiary Details
  beneficiary_name: string;
  beneficiary_phone?: string;
  beneficiary_id_document?: string; // Required at payout
  
  // Financial Details
  amount_cents: number;
  currency: CurrencyCode;
  
  status: CustomerTransferStatus;
  
  // Audit Trail
  created_at: string;
  updated_at: string;
  paid_at?: string;
  paid_by_id?: string; // Teller ID
  paid_by_name?: string;
  paid_at_till_id?: string;
  paid_at_session_id?: string;
  payout_tx_id?: string; // Reference to TellerTransaction
  
  notes?: string;
}
