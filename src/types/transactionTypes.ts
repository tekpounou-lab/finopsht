export type TransactionTypeCategory =
  | "Sales"
  | "Services"
  | "Money Transfer"
  | "Mobile Transfer"
  | "Currency Exchange"
  | "Operating Expenses"
  | "Internal Transfers"
  | "Clearing"
  | "Other";

export type FlowBehavior = 1 | -1 | 0; // +1 Cash In, -1 Cash Out, 0 Neutral

export type OperationalProfile =
  | "vendeur"
  | "polyvalent"
  | "teller";

export interface TransactionTypeItem {
  id: string; // e.g. "tt_1001" or "tt_custom_1"
  business_id: string;
  code: string; // e.g. "1001", "2001", "3001", "3101", "80001", "1910"
  name: string; // e.g. "Dépôt Cash", "Retrait Cash", "Vente de Marchandises"
  category: TransactionTypeCategory;
  behavior: FlowBehavior; // +1 (Cash In), -1 (Cash Out), 0 (Neutral)
  currency: "HTG" | "USD" | "ALL";
  allowedProfiles: OperationalProfile[]; // Profiles allowed to use this type
  isSystemDefault: boolean;
  isProtected?: boolean; // Reserved system codes (1910, 2910, clearing) protected from override
  isActive: boolean;
  
  // Double-entry accounting mapping rules
  debit_account_code: string; // e.g. "1111" (Caisses HTG) or "6010" (Charges)
  debit_account_name: string;
  credit_account_code: string; // e.g. "4010" (Ventes) or "1111"
  credit_account_name: string;

  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionTypeAccountMapping {
  transaction_type_code: string;
  debit_account_code: string;
  debit_account_name: string;
  credit_account_code: string;
  credit_account_name: string;
  requires_till_id?: boolean;
}

export interface RecommendationResult {
  recommendedCode: string;
  recommendedName: string;
  recommendedCategory: TransactionTypeCategory;
  recommendedBehavior: FlowBehavior;
  suggestedDebitCode: string;
  suggestedDebitName: string;
  suggestedCreditCode: string;
  suggestedCreditName: string;
  confidence: number; // 0 to 1
  reasoning: string;
}
