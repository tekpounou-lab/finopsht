import { db } from "../../../lib/firebase";
import { runTransaction, doc } from "firebase/firestore";
import { CustomerTransfer, CashTill, TillSession, TellerTransaction, CurrencyCode } from "../../../types/cashManagement";
import { LedgerTransaction } from "../../../types";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { ForensicLogRepository, computeHMACSignature, getForensicHMACSecretKey } from "../../../repositories/ForensicLogRepository";
import { canOperateCashTill, normalizeRole } from "../../rbac/operationalProfilePolicy";

export interface InboundTransferParams {
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
  operatorId: string;
  operatorName: string;
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

export class TransferIntakeEngine {
  /**
   * Executes inbound customer remittance intake and posts Leg 1 accounting liability entry (Credit Account 2400).
   * Generates CustomerTransfer record ready for payout.
   */
  public static async recordInboundTransfer(
    params: InboundTransferParams,
    authenticatedUser: AuthenticatedUserContext
  ): Promise<{ transfer: CustomerTransfer; intakeGlTxId: string }> {
    const { businessId, branchId, senderName, beneficiaryName, amountCents, currency, operatorId, operatorName } = params;

    // 1. Operator Identity Authentication Guard
    if (!authenticatedUser || !authenticatedUser.id) {
      throw new FinopsException(
        "AUTHENTICATION_REQUIRED",
        "Un identifiant d'opérateur authentifié est obligatoire pour enregistrer un transfert d'entrée."
      );
    }

    if (operatorId && operatorId !== authenticatedUser.id) {
      throw new FinopsException(
        "UNAUTHORIZED_OPERATOR_SPOOF",
        `Usurpation d'identité détectée : l'opérateur (${operatorId}) ne correspond pas à l'utilisateur authentifié (${authenticatedUser.id}).`
      );
    }

    const authRole = normalizeRole(authenticatedUser.role);
    if (!authRole) {
      throw new FinopsException("FORBIDDEN_ROLE", "Rôle opérateur requis pour enregistrer un transfert d'entrée.");
    }
    const rawProfile = authenticatedUser.operational_profile ?? authenticatedUser.operationalProfile;
    const cashDecision = canOperateCashTill(authRole, rawProfile, { allowExecutiveRoleBypass: true });
    if (!cashDecision.allowed) {
      throw new FinopsException(cashDecision.code || "FORBIDDEN_OPERATIONAL_PROFILE", cashDecision.reason);
    }

    if (!amountCents || amountCents <= 0) {
      throw new FinopsException("INVALID_AMOUNT", "Le montant du transfert doit être supérieur à zéro.");
    }

    const effectiveOperatorId = authenticatedUser.id;
    const effectiveOperatorName = authenticatedUser.name || operatorName;
    const now = new Date().toISOString();
    const businessDate = params.businessDate || now.split("T")[0];
    const transferId = `trf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const reference = `TRF-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const txId = `tx_intake_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const glTxId = `gl_${txId}`;

    const clearingCode = CashAccountMapping.ACCOUNTS.TRANSFER_PAYOUT_CLEARING.code;
    const clearingName = CashAccountMapping.ACCOUNTS.TRANSFER_PAYOUT_CLEARING.name;
    const tillAccount = CashAccountMapping.resolveTillAccount(currency);

    // If till is provided, update till balance atomically
    const tillRef = params.tillId ? doc(db, "cash_tills", params.tillId) : null;
    const sessionRef = params.sessionId ? doc(db, "till_sessions", params.sessionId) : null;
    const transferRef = doc(db, "customer_transfers", transferId);
    const glRef = doc(db, "ledger_transactions", glTxId);
    const tellerTxRef = doc(db, "teller_transactions", txId);

    return await runTransaction(db, async (transaction) => {
      let tillData: CashTill | null = null;
      let sessionData: TillSession | null = null;

      if (tillRef) {
        const tillSnap = await transaction.get(tillRef);
        if (tillSnap.exists()) {
          tillData = { id: tillSnap.id, ...tillSnap.data() } as CashTill;
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
      }

      if (sessionRef) {
        const sessionSnap = await transaction.get(sessionRef);
        if (sessionSnap.exists()) {
          sessionData = { id: sessionSnap.id, ...sessionSnap.data() } as TillSession;
          if (sessionData.status !== "ACTIVE") {
            throw new FinopsException("SESSION_NOT_ACTIVE", "La session de caisse n'est pas active.");
          }
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

      // CustomerTransfer Record with initial liability tracking
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
        notes: params.notes || "Transfert entrant enregistré avec obligation de passer le compte 2400"
      };

      // Forensic Log for Intake
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const key = getForensicHMACSecretKey(businessId);
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "TRANSFER_INTAKE_RECORDED",
        actorId: effectiveOperatorId,
        timestamp: now,
        details: `Réception du transfert ${reference} (${(amountCents / 100).toLocaleString()} ${currency}) de ${senderName} pour ${beneficiaryName}. Crédit compte liability 2400.`,
        beforeState: null,
        afterState: { transferId, reference, amountCents, currency, glTxId }
      };
      const signature = await computeHMACSignature(logPayload, key);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveOperatorId,
        userName: effectiveOperatorName,
        userRole: "TELLER",
        action: "TRANSFER_INTAKE_RECORDED",
        details: logPayload.details,
        beforeState: null,
        afterState: logPayload.afterState,
        timestamp: now,
        signature
      };

      // Atomic Writes
      transaction.set(transferRef, transferRecord);
      transaction.set(glRef, ledgerTx);
      transaction.set(tellerTxRef, tellerTx);
      transaction.set(doc(db, "forensic_logs", logId), forensicLogRecord);

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
