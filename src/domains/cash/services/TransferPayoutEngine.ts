import { db } from "../../../lib/firebase";
import { runTransaction, doc } from "firebase/firestore";
import { CustomerTransfer, CashTill, TillSession, TellerTransaction } from "../../../types/cashManagement";
import { LedgerTransaction } from "../../../types";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { ForensicLogRepository, computeHMACSignature, getForensicHMACSecretKey } from "../../../repositories/ForensicLogRepository";
import { canOperateCashTill, normalizeRole } from "../../rbac/operationalProfilePolicy";

export interface PayoutParams {
  businessId: string;
  branchId: string;
  transferId: string;
  tillId: string;
  sessionId: string;
  operatorId: string;
  operatorName: string;
  operatorRole?: string;
  idDocument: string;
  notes?: string;
  businessDate?: string;
}

export interface AuthenticatedUserContext {
  id: string;
  name: string;
  role?: string;
  operational_profile?: string;
  operationalProfile?: string;
}

export class TransferPayoutEngine {
  /**
   * Validates if a transfer is eligible for payout at a specific till.
   */
  public static async validatePayoutEligibility(
    transfer: CustomerTransfer,
    till: CashTill,
    session: TillSession
  ): Promise<void> {
    if (transfer.status !== "READY_FOR_PAYOUT") {
      throw new FinopsException(
        "INVALID_TRANSFER_STATUS",
        `Le transfert [${transfer.reference}] n'est pas prêt pour le paiement (Statut: ${transfer.status}).`
      );
    }

    if (session.status !== "ACTIVE") {
      throw new FinopsException(
        "SESSION_NOT_ACTIVE",
        "Une session de caisse active est requise pour effectuer un paiement."
      );
    }

    if (till.currency !== transfer.currency) {
      throw new FinopsException(
        "CURRENCY_MISMATCH",
        `Incohérence de devise : Le transfert est en ${transfer.currency} mais cette caisse est en ${till.currency}.`
      );
    }

    if (till.balance_cents < transfer.amount_cents) {
      throw new FinopsException(
        "INSUFFICIENT_FUNDS",
        `Encaisse insuffisante dans la caisse pour payer ce transfert (${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency} requis).`
      );
    }
  }

  /**
   * Executes the transfer payout atomically in a single Firestore runTransaction block.
   * Enforces operator identity binding and idempotency locking.
   */
  public static async executePayout(
    params: PayoutParams,
    authenticatedUser?: AuthenticatedUserContext
  ): Promise<CustomerTransfer> {
    const { transferId, tillId, sessionId, businessId, operatorId, operatorName } = params;

    // 1. Validate Authenticated Operator Identity Context
    if (!authenticatedUser || !authenticatedUser.id) {
      throw new FinopsException(
        "AUTHENTICATION_REQUIRED",
        "Un identifiant d'opérateur authentifié valide est obligatoire pour valider cette opération de paiement."
      );
    }

    if (operatorId && operatorId !== authenticatedUser.id) {
      throw new FinopsException(
        "UNAUTHORIZED_OPERATOR_SPOOF",
        `Usurpation d'identité détectée : l'identifiant fourni (${operatorId}) ne correspond pas à l'utilisateur authentifié (${authenticatedUser.id}).`
      );
    }

    const authRole = normalizeRole(authenticatedUser.role ?? params.operatorRole);
    if (!authRole) {
      throw new FinopsException("FORBIDDEN_ROLE", "Rôle opérateur requis pour exécuter un paiement de transfert.");
    }
    const rawProfile = authenticatedUser.operational_profile ?? authenticatedUser.operationalProfile;
    const cashDecision = canOperateCashTill(authRole, rawProfile, { allowExecutiveRoleBypass: true });
    if (!cashDecision.allowed) {
      throw new FinopsException(cashDecision.code || "FORBIDDEN_OPERATIONAL_PROFILE", cashDecision.reason);
    }

    const effectiveOperatorId = authenticatedUser.id;
    const effectiveOperatorName = authenticatedUser.name || operatorName;

    // 2. Atomic Transaction Execution
    return await runTransaction(db, async (transaction) => {
      // --- READ PHASE (All Firestore reads MUST precede writes) ---
      const transferRef = doc(db, "customer_transfers", transferId);
      const tillRef = doc(db, "cash_tills", tillId);
      const sessionRef = doc(db, "till_sessions", sessionId);
      const idempRef = doc(db, "payout_idempotency_locks", `payout_${transferId}`);

      const [transferSnap, tillSnap, sessionSnap, idempSnap] = await Promise.all([
        transaction.get(transferRef),
        transaction.get(tillRef),
        transaction.get(sessionRef),
        transaction.get(idempRef)
      ]);

      // Check Idempotency Lock
      if (idempSnap.exists()) {
        const lockData = idempSnap.data();
        if (lockData.status === "COMPLETED" || lockData.status === "PROCESSING") {
          throw new FinopsException(
            "DUPLICATE_PAYOUT_ATTEMPT",
            `Ce transfert (${transferId}) a déjà été payé ou est actuellement en cours de traitement.`
          );
        }
      }

      // Check Transfer
      if (!transferSnap.exists()) {
        throw new FinopsException("TRANSFER_NOT_FOUND", "Le transfert à payer est introuvable.");
      }
      const transfer = { id: transferSnap.id, ...transferSnap.data() } as CustomerTransfer;
      if (transfer.status === "PAID") {
        throw new FinopsException("TRANSFER_ALREADY_PAID", "Ce transfert a déjà été payé.");
      }
      if (transfer.status !== "READY_FOR_PAYOUT") {
        throw new FinopsException(
          "INVALID_TRANSFER_STATUS",
          `Le transfert [${transfer.reference}] n'est pas prêt pour le paiement (Statut: ${transfer.status}).`
        );
      }

      // Check Till
      if (!tillSnap.exists()) {
        throw new FinopsException("TILL_NOT_FOUND", "La caisse sélectionnée est introuvable.");
      }
      const till = { id: tillSnap.id, ...tillSnap.data() } as CashTill;
      if (till.status !== "OPEN") {
        throw new FinopsException(
          "TILL_NOT_OPEN",
          `La caisse "${till.name}" est fermée (${till.status}). Une session active est requise.`
        );
      }
      if (till.currency !== transfer.currency) {
        throw new FinopsException(
          "CURRENCY_MISMATCH",
          `Incohérence de devise : Le transfert est en ${transfer.currency} mais cette caisse est en ${till.currency}.`
        );
      }
      if (till.balance_cents < transfer.amount_cents) {
        throw new FinopsException(
          "INSUFFICIENT_FUNDS",
          `Encaisse insuffisante dans la caisse ${till.name} (${(till.balance_cents / 100).toLocaleString()} ${till.currency} disponible, ${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency} requis).`
        );
      }

      // Check Session
      let session: TillSession | null = null;
      if (sessionSnap.exists()) {
        session = { id: sessionSnap.id, ...sessionSnap.data() } as TillSession;
      }
      if (session && session.status !== "ACTIVE") {
        throw new FinopsException("SESSION_NOT_ACTIVE", "La session de caisse n'est pas active.");
      }

      // --- WRITE PREPARATION ---
      const now = new Date().toISOString();
      const businessDate = params.businessDate || now.split("T")[0];
      const txId = `tx_teller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const glTxId = `gl_${txId}`;

      const tillAccount = CashAccountMapping.resolveTillAccount(till.currency);
      const clearingCode = CashAccountMapping.ACCOUNTS.TRANSFER_PAYOUT_CLEARING.code;
      const clearingName = CashAccountMapping.ACCOUNTS.TRANSFER_PAYOUT_CLEARING.name;

      // 1. General Ledger Entry (Debit 2400 / Credit 1010 or 1020)
      const ledgerTx: LedgerTransaction = {
        id: glTxId,
        businessId,
        business_id: businessId,
        branchId: params.branchId || till.branch_id || "MAIN_BRANCH",
        branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
        departmentId: "counter",
        date: businessDate,
        description: `[TRANSFER PAYOUT] ${transfer.reference} - ${transfer.beneficiary_name}`,
        amount: transfer.amount_cents / 100,
        amount_cents: transfer.amount_cents,
        currency: transfer.currency,
        type: "EXPENSE",
        category: "Paiement Transfert d'Argent",
        status: "POSTED",
        debit_account: clearingCode,
        credit_account: tillAccount.accountCode,
        debit_account_code: clearingCode,
        credit_account_code: tillAccount.accountCode,
        debit_cents: transfer.amount_cents,
        credit_cents: transfer.amount_cents,
        debit_amount_cents: transfer.amount_cents,
        credit_amount_cents: transfer.amount_cents,
        source: "SYSTEM",
        signerId: effectiveOperatorId,
        createdBy: effectiveOperatorName,
        referenceTransactionId: txId,
        isImmutable: true,
        metadata: { tellerTransactionId: txId, transferId: transfer.id, transferReference: transfer.reference, tillId: till.id }
      };

      // 2. Operational Teller Transaction
      const tellerTx: TellerTransaction = {
        id: txId,
        business_id: businessId,
        branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
        till_id: till.id,
        session_id: sessionId,
        operator_id: effectiveOperatorId,
        operator_name: effectiveOperatorName,
        business_date: businessDate,
        transaction_type_code: "4002",
        transaction_type_name: "Paiement Transfert d'Argent",
        flow_behavior: -1,
        currency: transfer.currency,
        amount_cents: transfer.amount_cents,
        debit_account_code: clearingCode,
        debit_account_name: clearingName,
        credit_account_code: tillAccount.accountCode,
        credit_account_name: tillAccount.accountName,
        ledger_transaction_id: glTxId,
        notes: params.notes || `Paiement transfert ${transfer.reference} à ${transfer.beneficiary_name}`,
        idempotency_key: `payout_${transfer.id}`,
        status: "POSTED",
        created_at: now
      };

      // 3. Updated Customer Transfer Record
      const updatedTransfer: CustomerTransfer = {
        ...transfer,
        status: "PAID",
        paid_at: now,
        paid_by_id: effectiveOperatorId,
        paid_by_name: effectiveOperatorName,
        paid_at_till_id: tillId,
        paid_at_session_id: sessionId,
        payout_tx_id: txId,
        beneficiary_id_document: params.idDocument,
        updated_at: now
      };

      // 4. Updated Till Record (Deduct cash balance)
      const newTillBalanceCents = till.balance_cents - transfer.amount_cents;
      const updatedTill: CashTill = {
        ...till,
        balance_cents: newTillBalanceCents,
        updated_at: now
      };

      // 5. Idempotency Lock Record
      const idempotencyRecord = {
        id: `payout_${transfer.id}`,
        transfer_id: transfer.id,
        business_id: businessId,
        status: "COMPLETED",
        payout_tx_id: txId,
        operator_id: effectiveOperatorId,
        created_at: now
      };

      // 6. Cryptographically Sealed Forensic Log Record
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const key = getForensicHMACSecretKey(businessId);
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "TRANSFER_PAYOUT_COMPLETED",
        actorId: effectiveOperatorId,
        timestamp: now,
        details: `Paiement réussi du transfert ${transfer.reference} (${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency}) à ${transfer.beneficiary_name}.`,
        beforeState: { transferId: transfer.id, status: transfer.status, tillBalanceCents: till.balance_cents },
        afterState: { transferId: transfer.id, status: "PAID", txId, tillBalanceCents: newTillBalanceCents }
      };
      const signature = await computeHMACSignature(logPayload, key);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveOperatorId,
        userName: effectiveOperatorName,
        userRole: params.operatorRole || "TELLER",
        action: "TRANSFER_PAYOUT_COMPLETED",
        details: logPayload.details,
        beforeState: logPayload.beforeState,
        afterState: logPayload.afterState,
        timestamp: now,
        signature
      };

      // --- WRITE PHASE (Atomic multi-document updates) ---
      transaction.set(transferRef, updatedTransfer, { merge: true });
      transaction.set(tillRef, updatedTill, { merge: true });
      transaction.set(doc(db, "teller_transactions", txId), tellerTx);
      transaction.set(doc(db, "ledger_transactions", glTxId), ledgerTx);
      transaction.set(idempRef, idempotencyRecord);
      transaction.set(doc(db, "forensic_logs", logId), forensicLogRecord);

      return updatedTransfer;
    });
  }
}

