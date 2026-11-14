import { getAdminFirestore } from "../../../lib/firebaseAdmin";
import { CustomerTransfer, CashTill, TillSession, TellerTransaction } from "../../../types/cashManagement";
import { LedgerTransaction } from "../../../types";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import {
  AUTHORIZED_CASH_OPERATOR_ROLES,
  computeServerHMACSignature,
  ServerOperatorContext
} from "./ServerTransferIntakeEngine";
import {
  ServerProfileVerificationError,
  verifyServerEmployeeOperationalProfile
} from "../../rbac/serverEmployeeProfileVerifier";

export interface ServerPayoutParams {
  businessId: string;
  branchId: string;
  transferId: string;
  tillId: string;
  sessionId: string;
  idDocument: string;
  notes?: string;
  businessDate?: string;
}

export class ServerTransferPayoutEngine {
  /**
   * Executes transfer payout atomically on trusted server using Firebase Admin SDK.
   * Enforces operator identity binding, active teller session, available till liquidity,
   * Account 2400 clearing GL entries, idempotency locks, and server-side HMAC signatures.
   */
  public static async executePayout(
    params: ServerPayoutParams,
    operatorContext: ServerOperatorContext
  ): Promise<CustomerTransfer> {
    const firestore = getAdminFirestore();
    const { transferId, tillId, sessionId, businessId, idDocument } = params;

    if (!businessId || !businessId.trim()) {
      throw new FinopsException("MISSING_TENANT_CONTEXT", "L'identifiant d'entreprise (businessId) est obligatoire.");
    }

    // Operator Tenant Scope Validation
    if (
      !operatorContext?.uid ||
      !operatorContext?.business_id ||
      operatorContext.business_id !== businessId
    ) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `L'opérateur (${operatorContext?.uid || "UNKNOWN"}) n'appartient pas à l'entreprise (${businessId}).`
      );
    }

    // Cash RBAC & Operational Profile Validation
    const normalizedRole = (operatorContext.role || "").trim().toUpperCase();
    if (!AUTHORIZED_CASH_OPERATOR_ROLES.has(normalizedRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle (${operatorContext.role || "UNKNOWN"}) n'est pas habilité à exécuter des opérations de décaissement.`
      );
    }

    try {
      await verifyServerEmployeeOperationalProfile({
        adminDb: firestore,
        uid: operatorContext.uid,
        email: operatorContext.email,
        businessId,
        actorRole: normalizedRole,
        isSuperAdmin: normalizedRole === "SUPER_ADMIN",
        capability: "cash"
      });
    } catch (err: any) {
      if (err instanceof ServerProfileVerificationError) {
        throw new FinopsException(err.code, err.message);
      }
      throw err;
    }

    if (!transferId || !tillId || !sessionId) {
      throw new FinopsException(
        "MISSING_REQUIRED_PARAMETERS",
        "Les identifiants transferId, tillId et sessionId sont obligatoires pour un décaissement."
      );
    }

    if (!idDocument || !idDocument.trim()) {
      throw new FinopsException(
        "MISSING_ID_DOCUMENT",
        "La pièce d'identité du bénéficiaire est obligatoire pour effectuer un décaissement."
      );
    }

    const effectiveOperatorId = operatorContext.uid;
    const effectiveOperatorName = operatorContext.name || operatorContext.email || "Opérateur Guichet";

    return await firestore.runTransaction(async (transaction) => {
      // --- READ PHASE (All Firestore reads MUST precede writes) ---
      const transferRef = firestore.collection("customer_transfers").doc(transferId);
      const tillRef = firestore.collection("cash_tills").doc(tillId);
      const sessionRef = firestore.collection("till_sessions").doc(sessionId);
      const idempRef = firestore.collection("payout_idempotency_locks").doc(`payout_${transferId}`);

      const [transferSnap, tillSnap, sessionSnap, idempSnap] = await Promise.all([
        transaction.get(transferRef),
        transaction.get(tillRef),
        transaction.get(sessionRef),
        transaction.get(idempRef)
      ]);

      // 1. Check Transfer existence & Tenant ownership FIRST (before idempotency return)
      if (!transferSnap.exists) {
        throw new FinopsException("TRANSFER_NOT_FOUND", "Le transfert à payer est introuvable.");
      }
      const transfer = { id: transferSnap.id, ...transferSnap.data() } as CustomerTransfer;
      const transferBizId = transfer.business_id || (transfer as any).businessId;
      if (transferBizId !== businessId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Violation d'isolation multi-tenant : le transfert (${transferId}) n'appartient pas à l'entreprise (${businessId}).`
        );
      }

      // 2. Check Idempotency Lock (strictly verified against tenant)
      if (idempSnap.exists) {
        const lockData = idempSnap.data() || {};
        if (lockData.business_id && lockData.business_id !== businessId) {
          throw new FinopsException(
            "TENANT_ISOLATION_VIOLATION",
            `Violation d'isolation multi-tenant sur le verrou d'idempotence (${transferId}).`
          );
        }
        if (lockData.status === "COMPLETED") {
          return transfer;
        }
        if (lockData.status === "PROCESSING") {
          throw new FinopsException(
            "DUPLICATE_PAYOUT_IN_PROGRESS",
            `Un paiement pour ce transfert (${transferId}) est actuellement en cours de traitement.`
          );
        }
      }

      if (transfer.status === "PAID") {
        throw new FinopsException("TRANSFER_ALREADY_PAID", "Ce transfert a déjà été payé.");
      }
      if (transfer.status !== "READY_FOR_PAYOUT") {
        throw new FinopsException(
          "INVALID_TRANSFER_STATUS",
          `Le transfert [${transfer.reference}] n'est pas prêt pour le paiement (Statut: ${transfer.status}).`
        );
      }

      // 3. Check Till existence, Tenant ownership, Status, Currency & Liquidity
      if (!tillSnap.exists) {
        throw new FinopsException("TILL_NOT_FOUND", "La caisse sélectionnée est introuvable.");
      }
      const till = { id: tillSnap.id, ...tillSnap.data() } as CashTill;
      const tillBizId = till.business_id || (till as any).businessId;
      if (tillBizId !== businessId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Violation d'isolation multi-tenant : la caisse (${tillId}) n'appartient pas à l'entreprise (${businessId}).`
        );
      }
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

      // 4. Check Session existence, Tenant ownership, Status, Till binding & Operator ownership
      if (!sessionSnap.exists) {
        throw new FinopsException(
          "SESSION_NOT_FOUND",
          "La session de caisse sélectionnée est introuvable. Une session active est obligatoire."
        );
      }
      const session = { id: sessionSnap.id, ...sessionSnap.data() } as TillSession;
      const sessionBizId = session.business_id || (session as any).businessId;
      if (sessionBizId !== businessId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Violation d'isolation multi-tenant : la session (${sessionId}) n'appartient pas à l'entreprise (${businessId}).`
        );
      }
      if (session.status !== "ACTIVE") {
        throw new FinopsException("SESSION_NOT_ACTIVE", "La session de caisse n'est pas active.");
      }
      if (session.till_id !== till.id) {
        throw new FinopsException(
          "SESSION_TILL_MISMATCH",
          `La session (${session.id}) ne correspond pas à la caisse sélectionnée (${till.id}).`
        );
      }
      const sessionHolderId = session.teller_id || (session as any).operator_id;
      if (
        !sessionHolderId ||
        (sessionHolderId !== effectiveOperatorId && normalizedRole !== "SUPER_ADMIN")
      ) {
        throw new FinopsException(
          "UNAUTHORIZED_SESSION_OPERATOR",
          `L'opérateur (${effectiveOperatorId}) n'est pas le titulaire autorisé de la session (${session.id}).`
        );
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
        beneficiary_id_document: idDocument,
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
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "TRANSFER_PAYOUT_COMPLETED",
        actorId: effectiveOperatorId,
        timestamp: now,
        details: `Paiement réussi du transfert ${transfer.reference} (${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency}) à ${transfer.beneficiary_name}.`,
        beforeState: { transferId: transfer.id, status: transfer.status, tillBalanceCents: till.balance_cents },
        afterState: { transferId: transfer.id, status: "PAID", txId, tillBalanceCents: newTillBalanceCents },
        keyVersion: "v2_server"
      };
      const signature = computeServerHMACSignature(logPayload);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveOperatorId,
        userName: effectiveOperatorName,
        userRole: operatorContext.role || "TELLER",
        action: "TRANSFER_PAYOUT_COMPLETED",
        details: logPayload.details,
        beforeState: logPayload.beforeState,
        afterState: logPayload.afterState,
        keyVersion: "v2_server",
        timestamp: now,
        signature
      };

      // --- WRITE PHASE (Atomic multi-document updates via Firebase Admin SDK) ---
      transaction.set(transferRef, updatedTransfer, { merge: true });
      transaction.set(tillRef, updatedTill, { merge: true });
      transaction.set(firestore.collection("teller_transactions").doc(txId), tellerTx);
      transaction.set(firestore.collection("ledger_transactions").doc(glTxId), ledgerTx);
      transaction.set(idempRef, idempotencyRecord);
      transaction.set(firestore.collection("forensic_logs").doc(logId), forensicLogRecord);

      return updatedTransfer;
    });
  }
}
