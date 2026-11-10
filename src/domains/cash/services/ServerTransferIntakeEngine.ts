import { getAdminFirestore } from "../../../lib/firebaseAdmin";
import { CustomerTransfer, CashTill, TillSession, TellerTransaction, CurrencyCode } from "../../../types/cashManagement";
import { LedgerTransaction } from "../../../types";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import crypto from "crypto";

export interface ServerInboundTransferParams {
  businessId: string;
  branchId: string;
  senderName: string;
  senderPhone?: string;
  senderCountry?: string;
  beneficiaryName: string;
  beneficiaryPhone?: string;
  amountCents: number;
  currency: CurrencyCode;
  tillId?: string;
  sessionId?: string;
  notes?: string;
  businessDate?: string;
}

export interface ServerOperatorContext {
  uid: string;
  name: string;
  role: string;
  email?: string;
  business_id: string;
}

export const AUTHORIZED_CASH_OPERATOR_ROLES = new Set([
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

export function computeServerHMACSignature(data: Record<string, any>, secretKey?: string): string {
  const tenantBizId = typeof data?.business_id === "string" ? data.business_id.trim() : "";
  if (!tenantBizId || tenantBizId.toUpperCase() === "DEFAULT") {
    throw new FinopsException(
      "MISSING_TENANT_CONTEXT",
      "Un business_id explicite et valide est obligatoire pour le calcul de signature HMAC."
    );
  }
  const masterSecret =
    secretKey ||
    process.env.FORENSIC_HMAC_SECRET_V2 ||
    process.env.FORENSIC_HMAC_SECRET ||
    "FINOPS_SECURE_FORENSIC_MASTER_KEY_2026";
  const tenantKey = `${masterSecret}_${tenantBizId}`;
  const jsonStr = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHmac("sha256", tenantKey).update(jsonStr).digest("hex");
}

export class ServerTransferIntakeEngine {
  /**
   * Executes inbound customer remittance intake on trusted server using Firebase Admin SDK.
   * Posts Leg 1 accounting liability entry (Credit Account 2400) and updates Till/Cash balance.
   */
  public static async recordInboundTransfer(
    params: ServerInboundTransferParams,
    operatorContext: ServerOperatorContext
  ): Promise<{ transfer: CustomerTransfer; intakeGlTxId: string }> {
    const firestore = getAdminFirestore();

    const { businessId, branchId, senderName, beneficiaryName, amountCents, currency } = params;

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
        `L'opérateur (${operatorContext?.uid || "UNKNOWN"}) n'est pas autorisé à enregistrer des opérations pour l'entreprise (${businessId}).`
      );
    }

    // Cash RBAC Validation
    const normalizedRole = (operatorContext.role || "").trim().toUpperCase();
    if (!AUTHORIZED_CASH_OPERATOR_ROLES.has(normalizedRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle (${operatorContext.role || "UNKNOWN"}) n'est pas habilité à exécuter des opérations d'encaissement.`
      );
    }

    if (!amountCents || amountCents <= 0) {
      throw new FinopsException("INVALID_AMOUNT", "Le montant du transfert doit être supérieur à zéro.");
    }

    const effectiveOperatorId = operatorContext.uid;
    const effectiveOperatorName = operatorContext.name || operatorContext.email || "Opérateur Guichet";
    const now = new Date().toISOString();
    const businessDate = params.businessDate || now.split("T")[0];
    const transferId = `trf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const reference = `TRF-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const txId = `tx_intake_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const glTxId = `gl_${txId}`;

    const clearingCode = CashAccountMapping.ACCOUNTS.TRANSFER_PAYOUT_CLEARING.code;
    const clearingName = CashAccountMapping.ACCOUNTS.TRANSFER_PAYOUT_CLEARING.name;
    const tillAccount = CashAccountMapping.resolveTillAccount(currency);

    const tillRef = params.tillId ? firestore.collection("cash_tills").doc(params.tillId) : null;
    const sessionRef = params.sessionId ? firestore.collection("till_sessions").doc(params.sessionId) : null;
    const transferRef = firestore.collection("customer_transfers").doc(transferId);
    const glRef = firestore.collection("ledger_transactions").doc(glTxId);
    const tellerTxRef = firestore.collection("teller_transactions").doc(txId);

    return await firestore.runTransaction(async (transaction) => {
      if ((tillRef && !sessionRef) || (!tillRef && sessionRef)) {
        throw new FinopsException(
          "SESSION_TILL_MISMATCH",
          "Opération de caisse invalide : tillId et sessionId doivent être fournis simultanément."
        );
      }

      let tillData: CashTill | null = null;
      let sessionData: TillSession | null = null;

      if (tillRef) {
        const tillSnap = await transaction.get(tillRef);
        if (!tillSnap.exists) {
          throw new FinopsException("TILL_NOT_FOUND", "La caisse sélectionnée est introuvable.");
        }
        tillData = { id: tillSnap.id, ...tillSnap.data() } as CashTill;
        const tillBizId = tillData.business_id || (tillData as any).businessId;
        if (tillBizId !== businessId) {
          throw new FinopsException(
            "TENANT_ISOLATION_VIOLATION",
            `Violation d'isolation multi-tenant : la caisse (${tillData.id}) n'appartient pas à l'entreprise (${businessId}).`
          );
        }
        if (tillData.status !== "OPEN") {
          throw new FinopsException("TILL_NOT_OPEN", `La caisse "${tillData.name}" n'est pas ouverte.`);
        }
        if (tillData.currency !== currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `Incohérence de devise : Dépôt en ${currency} vers caisse en ${tillData.currency}.`
          );
        }
      }

      if (sessionRef) {
        const sessionSnap = await transaction.get(sessionRef);
        if (!sessionSnap.exists) {
          throw new FinopsException("SESSION_NOT_FOUND", "La session de caisse sélectionnée est introuvable.");
        }
        sessionData = { id: sessionSnap.id, ...sessionSnap.data() } as TillSession;
        const sessionBizId = sessionData.business_id || (sessionData as any).businessId;
        if (sessionBizId !== businessId) {
          throw new FinopsException(
            "TENANT_ISOLATION_VIOLATION",
            `Violation d'isolation multi-tenant : la session (${sessionData.id}) n'appartient pas à l'entreprise (${businessId}).`
          );
        }
        if (sessionData.status !== "ACTIVE") {
          throw new FinopsException("SESSION_NOT_ACTIVE", "La session de caisse n'est pas active.");
        }
        if (tillData && sessionData.till_id !== tillData.id) {
          throw new FinopsException(
            "SESSION_TILL_MISMATCH",
            `La session (${sessionData.id}) ne correspond pas à la caisse sélectionnée (${tillData.id}).`
          );
        }
        const sessionHolderId = sessionData.teller_id || (sessionData as any).operator_id;
        if (
          !sessionHolderId ||
          (sessionHolderId !== effectiveOperatorId && normalizedRole !== "SUPER_ADMIN")
        ) {
          throw new FinopsException(
            "UNAUTHORIZED_SESSION_OPERATOR",
            `L'opérateur (${effectiveOperatorId}) n'est pas le titulaire autorisé de la session (${sessionData.id}).`
          );
        }
      }

      // Leg 1 GL Entry: Debit Till/Cash (1010/1020) / Credit Liability (2400)
      const ledgerTx: LedgerTransaction = {
        id: glTxId,
        businessId,
        business_id: businessId,
        branchId,
        branch_id: branchId,
        departmentId: "counter",
        date: businessDate,
        description: `[TRANSFER INTAKE] Dépôt transfert ${reference} par ${senderName} pour ${beneficiaryName}`,
        amount: amountCents / 100,
        amount_cents: amountCents,
        currency,
        type: "INCOME",
        category: "Réception Transfert d'Argent",
        status: "POSTED",
        debit_account: tillAccount.accountCode,
        credit_account: clearingCode,
        debit_account_code: tillAccount.accountCode,
        credit_account_code: clearingCode,
        debit_cents: amountCents,
        credit_cents: amountCents,
        debit_amount_cents: amountCents,
        credit_amount_cents: amountCents,
        source: "SYSTEM",
        signerId: effectiveOperatorId,
        createdBy: effectiveOperatorName,
        referenceTransactionId: txId,
        isImmutable: true,
        metadata: { tellerTransactionId: txId, transferId, transferReference: reference }
      };

      // Operational Teller Transaction (Code 4001 MONEY_TRANSFER_IN)
      const tellerTx: TellerTransaction = {
        id: txId,
        business_id: businessId,
        branch_id: branchId,
        till_id: params.tillId || "VIRTUAL_COUNTER",
        session_id: params.sessionId || "VIRTUAL_SESSION",
        operator_id: effectiveOperatorId,
        operator_name: effectiveOperatorName,
        business_date: businessDate,
        transaction_type_code: "4001",
        transaction_type_name: "Dépôt Transfert d'Argent",
        flow_behavior: 1, // Cash In
        currency,
        amount_cents: amountCents,
        debit_account_code: tillAccount.accountCode,
        debit_account_name: tillAccount.accountName,
        credit_account_code: clearingCode,
        credit_account_name: clearingName,
        ledger_transaction_id: glTxId,
        customer_name: senderName,
        notes: params.notes || `Dépôt transfert ${reference}`,
        status: "POSTED",
        created_at: now
      };

      // CustomerTransfer Record
      const transferRecord: CustomerTransfer = {
        id: transferId,
        business_id: businessId,
        branch_id: branchId,
        reference,
        sender_name: senderName,
        sender_phone: params.senderPhone,
        sender_country: params.senderCountry,
        beneficiary_name: beneficiaryName,
        beneficiary_phone: params.beneficiaryPhone,
        amount_cents: amountCents,
        currency,
        status: "READY_FOR_PAYOUT",
        created_at: now,
        updated_at: now,
        notes: params.notes || "Transfert entrant enregistré via API serveur sécurisée (Obligation compte 2400)"
      };

      // Cryptographically Sealed Server Forensic Log
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "TRANSFER_INTAKE_RECORDED",
        actorId: effectiveOperatorId,
        timestamp: now,
        details: `Réception du transfert ${reference} (${(amountCents / 100).toLocaleString()} ${currency}) de ${senderName} pour ${beneficiaryName}. Crédit compte liability 2400.`,
        beforeState: null,
        afterState: { transferId, reference, amountCents, currency, glTxId },
        keyVersion: "v2_server"
      };
      const signature = computeServerHMACSignature(logPayload);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveOperatorId,
        userName: effectiveOperatorName,
        userRole: operatorContext.role || "TELLER",
        action: "TRANSFER_INTAKE_RECORDED",
        details: logPayload.details,
        beforeState: null,
        afterState: logPayload.afterState,
        keyVersion: "v2_server",
        timestamp: now,
        signature
      };

      // Server Admin SDK Mutations
      transaction.set(transferRef, transferRecord);
      transaction.set(glRef, ledgerTx);
      transaction.set(tellerTxRef, tellerTx);
      transaction.set(firestore.collection("forensic_logs").doc(logId), forensicLogRecord);

      if (tillRef && tillData) {
        transaction.set(
          tillRef,
          {
            ...tillData,
            balance_cents: tillData.balance_cents + amountCents,
            updated_at: now
          },
          { merge: true }
        );
      }

      return { transfer: transferRecord, intakeGlTxId: glTxId };
    });
  }
}
