import { getAdminFirestore } from "../../../lib/firebaseAdmin";
import {
  InternalTransfer,
  CashTill,
  BranchSafe,
  TillSession,
  TellerTransaction,
  TransferSourceType,
  TransferDestinationType,
  CurrencyCode
} from "../../../types/cashManagement";
import { LedgerTransaction } from "../../../types";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { computeServerHMACSignature } from "./ServerTransferIntakeEngine";
import {
  ServerProfileVerificationError,
  verifyServerEmployeeOperationalProfile
} from "../../rbac/serverEmployeeProfileVerifier";
import { canApproveInternalTransferRole } from "../../rbac/operationalProfilePolicy";

export interface ServerActorContext {
  uid: string;
  business_id: string;
  role: string;
  name?: string;
  email?: string;
  branch_id?: string;
}

export interface RequestInternalTransferParams {
  businessId: string;
  sourceType: TransferSourceType;
  sourceId: string;
  destinationType: TransferDestinationType;
  destinationId: string;
  amountCents: number;
  currency: CurrencyCode;
  reason: string;
  notes?: string;
  branchId?: string;
  debitAccountCode?: string;
  debitAccountName?: string;
  creditAccountCode?: string;
  creditAccountName?: string;
  bankReference?: string;
  fundingCategory?: "BANK_WITHDRAWAL" | "INTER_SAFE" | "OWNER_INJECTION" | "TILL_RELIEF";
  idempotencyKey?: string;
}

export interface ApproveInternalTransferParams {
  businessId: string;
  approvalNotes?: string;
  idempotencyKey?: string;
}

export interface RejectInternalTransferParams {
  businessId: string;
  rejectionReason: string;
  idempotencyKey?: string;
}

export interface FundSafeServerParams {
  businessId: string;
  safeId: string;
  sourceType: "BANK" | "EQUITY_INJECTION" | "SAFE" | "TILL";
  sourceIdentifier: string;
  amountCents: number;
  currency: CurrencyCode;
  referenceNumber?: string;
  reason: string;
  debitAccountCode?: string;
  creditAccountCode?: string;
  autoExecute?: boolean;
  idempotencyKey?: string;
}

export const SUPERVISOR_TRANSFER_ROLES = new Set([
  "HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

export const AUTHORIZED_TRANSFER_INITIATOR_ROLES = new Set([
  "TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

/**
 * FINOPS ERP — ServerInternalTransferEngine (Phase D4-B-2.1)
 *
 * Core transactional backend engine for internal treasury transfers.
 * Enforces:
 * 1. 100% Server authority with Admin SDK.
 * 2. Strict tenant isolation (all actor context derived from authenticated server context).
 * 3. Monetary precision & integer cents validation.
 * 4. Atomic multi-document Firestore transactions (get-then-write).
 * 5. Account 1910 Policy B (funds stay in source during PENDING_APPROVAL; revalidated at execution).
 * 6. Conditional TILL -> TILL transfer rules (8 operational conditions).
 * 7. SAFE -> SAFE cross-approval Manager/Owner Maker-Checker rules.
 * 8. Server-side idempotency lock enforcement via idempotency_keys.
 * 9. Cryptographically signed forensic audit logs (v2_server HMAC).
 */
export class ServerInternalTransferEngine {
  /**
   * Initiates a new internal transfer request (caisse ↔ coffre ↔ banque ↔ apport).
   * Status: PENDING_APPROVAL.
   * Under Policy B, no funds are deducted from source at this stage.
   */
  public static async requestTransfer(
    params: RequestInternalTransferParams,
    actor: ServerActorContext
  ): Promise<InternalTransfer> {
    const firestore = getAdminFirestore();

    // 1. Identity & Tenant Verification
    this.validateActorContext(actor, params.businessId);

    const initiatorRole = (actor.role || "").trim().toUpperCase();
    if (!initiatorRole || !AUTHORIZED_TRANSFER_INITIATOR_ROLES.has(initiatorRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${actor.role || "UNKNOWN"}] n'est pas habilité à initier un transfert interne.`
      );
    }

    try {
      await verifyServerEmployeeOperationalProfile({
        adminDb: firestore,
        uid: actor.uid,
        email: actor.email,
        businessId: params.businessId,
        actorRole: initiatorRole,
        isSuperAdmin: initiatorRole === "SUPER_ADMIN",
        capability: "transfer_initiate"
      });
    } catch (err: any) {
      if (err instanceof ServerProfileVerificationError) {
        throw new FinopsException(err.code, err.message);
      }
      throw err;
    }

    const {
      businessId,
      sourceType,
      sourceId,
      destinationType,
      destinationId,
      amountCents,
      currency,
      reason,
      notes,
      branchId,
      idempotencyKey
    } = params;

    // 2. Financial & Structural Payload Validation
    if (!amountCents || typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new FinopsException(
        "INVALID_TRANSFER_AMOUNT",
        "Le montant du transfert doit être un entier positif strictement supérieur à zéro en centimes."
      );
    }

    if (currency !== "HTG" && currency !== "USD") {
      throw new FinopsException(
        "INVALID_CURRENCY",
        `Devise [${currency}] non supportée. Seules HTG et USD sont autorisées.`
      );
    }

    if (sourceType === destinationType && sourceId === destinationId) {
      throw new FinopsException(
        "SAME_SOURCE_DESTINATION",
        "La source et la destination ne peuvent pas être identiques."
      );
    }

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new FinopsException(
        "MISSING_TRANSFER_REASON",
        "Le motif du transfert est obligatoire."
      );
    }

    const effectiveBranchId = branchId || actor.branch_id || "MAIN_BRANCH";
    const effectiveOperatorId = actor.uid.trim();
    const effectiveOperatorName = (actor.name || actor.email || actor.uid).trim();
    const effectiveOperatorRole = (actor.role || "TELLER").trim().toUpperCase();

    // 3. Transactional Execution for Idempotency & Entity Existence Verification
    return await firestore.runTransaction(async (transaction) => {
      const now = new Date().toISOString();
      const transferId = `trf_int_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const transferRef = firestore.collection("internal_transfers").doc(transferId);

      // Check idempotency lock if key provided
      let idempRef: FirebaseFirestore.DocumentReference | null = null;
      if (idempotencyKey && idempotencyKey.trim()) {
        idempRef = firestore.collection("idempotency_keys").doc(`ik_${businessId}_${idempotencyKey.trim()}`);
        const idempSnap = await transaction.get(idempRef);
        if (idempSnap.exists) {
          const idempData = idempSnap.data() || {};
          if (idempData.business_id && idempData.business_id !== businessId) {
            throw new FinopsException(
              "TENANT_ISOLATION_VIOLATION",
              "Violation d'isolation multi-tenant sur la clé d'idempotence."
            );
          }
          if (idempData.status === "COMPLETED" && idempData.result) {
            return idempData.result as InternalTransfer;
          }
          if (idempData.status === "IN_FLIGHT") {
            throw new FinopsException(
              "DUPLICATE_OPERATION_IN_PROGRESS",
              "Une demande de transfert identique est actuellement en cours de traitement."
            );
          }
        }
      }

      // Read Source & Destination Entities
      let sourceName = "Source Inconnue";
      let destName = "Destination Inconnue";
      let sourceBranchId = effectiveBranchId;
      let destBranchId = effectiveBranchId;

      if (sourceType === "TILL") {
        const srcRef = firestore.collection("cash_tills").doc(sourceId);
        const srcSnap = await transaction.get(srcRef);
        if (!srcSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `La caisse source [${sourceId}] est introuvable.`);
        }
        const srcData = srcSnap.data() as CashTill;
        if (srcData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Caisse source appartenant à un autre tenant.");
        }
        if (srcData.currency !== currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `La caisse source ${srcData.name} est en ${srcData.currency}, incompatible avec un transfert en ${currency}.`
          );
        }
        if (srcData.status !== "OPEN") {
          throw new FinopsException(
            "SESSION_NOT_ACTIVE",
            `La caisse source ${srcData.name} n'est pas ouverte (statut: ${srcData.status}).`
          );
        }
        sourceName = srcData.name;
        sourceBranchId = srcData.branch_id || effectiveBranchId;
      } else if (sourceType === "SAFE") {
        const srcRef = firestore.collection("branch_safes").doc(sourceId);
        const srcSnap = await transaction.get(srcRef);
        if (!srcSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `Le coffre source [${sourceId}] est introuvable.`);
        }
        const srcData = srcSnap.data() as BranchSafe;
        if (srcData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Coffre source appartenant à un autre tenant.");
        }
        if (srcData.currency !== currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `Le coffre source ${srcData.name} est en ${srcData.currency}, incompatible avec un transfert en ${currency}.`
          );
        }
        sourceName = srcData.name;
        sourceBranchId = srcData.branch_id || effectiveBranchId;
      } else if (sourceType === "BANK") {
        sourceName = "Compte Bancaire Commerical";
      } else if (sourceType === "EQUITY_INJECTION") {
        sourceName = "Apport en Capital / Fonds Propres";
      }

      if (destinationType === "TILL") {
        const destRef = firestore.collection("cash_tills").doc(destinationId);
        const destSnap = await transaction.get(destRef);
        if (!destSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `La caisse destination [${destinationId}] est introuvable.`);
        }
        const destData = destSnap.data() as CashTill;
        if (destData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Caisse destination appartenant à un autre tenant.");
        }
        if (destData.currency !== currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `La caisse destination ${destData.name} est en ${destData.currency}, incompatible avec un transfert en ${currency}.`
          );
        }
        if (destData.status !== "OPEN") {
          throw new FinopsException(
            "SESSION_NOT_ACTIVE",
            `La caisse destination ${destData.name} n'est pas ouverte (statut: ${destData.status}).`
          );
        }
        destName = destData.name;
        destBranchId = destData.branch_id || effectiveBranchId;
      } else if (destinationType === "SAFE") {
        const destRef = firestore.collection("branch_safes").doc(destinationId);
        const destSnap = await transaction.get(destRef);
        if (!destSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `Le coffre destination [${destinationId}] est introuvable.`);
        }
        const destData = destSnap.data() as BranchSafe;
        if (destData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Coffre destination appartenant à un autre tenant.");
        }
        if (destData.currency !== currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `Le coffre destination ${destData.name} est en ${destData.currency}, incompatible avec un transfert en ${currency}.`
          );
        }
        destName = destData.name;
        destBranchId = destData.branch_id || effectiveBranchId;
      } else if (destinationType === "BANK") {
        destName = "Compte Bancaire Commercial";
      }

      // Default accounts resolution
      const defaultDebit =
        params.debitAccountCode ||
        (destinationType === "SAFE"
          ? currency === "HTG"
            ? "1015"
            : "1025"
          : currency === "HTG"
          ? "1010"
          : "1020");

      const defaultCredit =
        params.creditAccountCode ||
        (sourceType === "BANK"
          ? currency === "HTG"
            ? "1110"
            : "1120"
          : sourceType === "EQUITY_INJECTION"
          ? "3010"
          : sourceType === "SAFE"
          ? currency === "HTG"
            ? "1015"
            : "1025"
          : currency === "HTG"
          ? "1010"
          : "1020");

      const transferRecord: InternalTransfer = {
        id: transferId,
        business_id: businessId,
        branch_id: sourceBranchId || destBranchId || effectiveBranchId,
        source_type: sourceType,
        source_id: sourceId,
        source_name: sourceName,
        destination_type: destinationType,
        destination_id: destinationId,
        destination_name: destName,
        amount_cents: amountCents,
        currency,
        status: "PENDING_APPROVAL",
        initiator_id: effectiveOperatorId,
        initiator_name: effectiveOperatorName,
        initiator_role: effectiveOperatorRole,
        description: reason.trim() + (notes ? ` (${notes.trim()})` : ""),
        created_at: now,
        debit_account_code: defaultDebit,
        debit_account_name: params.debitAccountName || (destinationType === "SAFE" ? `Coffre ${currency}` : `Caisse ${currency}`),
        credit_account_code: defaultCredit,
        credit_account_name: params.creditAccountName || sourceName,
        bank_reference: params.bankReference,
        funding_category: params.fundingCategory
      };

      // Cryptographically signed Forensic Log (v2_server)
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "INTERNAL_TRANSFER_INITIATED",
        actorId: effectiveOperatorId,
        timestamp: now,
        details: `Initiation de demande de transfert de ${sourceName} vers ${destName} pour ${(amountCents / 100).toLocaleString()} ${currency}.`,
        afterState: { transferId, status: "PENDING_APPROVAL", amountCents, currency },
        keyVersion: "v2_server"
      };
      const signature = computeServerHMACSignature(logPayload);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveOperatorId,
        userName: effectiveOperatorName,
        userRole: effectiveOperatorRole,
        action: "INTERNAL_TRANSFER_INITIATED",
        details: logPayload.details,
        afterState: logPayload.afterState,
        keyVersion: "v2_server",
        timestamp: now,
        signature
      };

      // Atomic Writes
      transaction.set(transferRef, transferRecord);
      transaction.set(firestore.collection("forensic_logs").doc(logId), forensicLogRecord);

      if (idempRef) {
        transaction.set(idempRef, {
          id: `ik_${businessId}_${idempotencyKey?.trim()}`,
          business_id: businessId,
          status: "COMPLETED",
          result: transferRecord,
          created_at: now
        });
      }

      return transferRecord;
    });
  }

  /**
   * Approves and executes an internal transfer with STRICT MAKER-CHECKER and atomic mutations.
   * Revalidates source balances, till session states, posts GL entries, and updates balances.
   */
  public static async approveTransfer(
    transferId: string,
    params: ApproveInternalTransferParams,
    actor: ServerActorContext
  ): Promise<InternalTransfer> {
    const firestore = getAdminFirestore();

    // 1. Identity & Tenant Verification
    this.validateActorContext(actor, params.businessId);

    const { businessId, approvalNotes, idempotencyKey } = params;

    // Role Permission Check (Step 3 Mandatory Correction: MASTER_HEAD_TELLER strictly denied)
    const normalizedRole = (actor.role || "").trim().toUpperCase();
    if (normalizedRole === "MASTER_HEAD_TELLER" || !canApproveInternalTransferRole(normalizedRole) || !SUPERVISOR_TRANSFER_ROLES.has(normalizedRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${actor.role}] n'est pas habilité à approuver les transferts de trésorerie.`
      );
    }

    try {
      await verifyServerEmployeeOperationalProfile({
        adminDb: firestore,
        uid: actor.uid,
        email: actor.email,
        businessId,
        actorRole: normalizedRole,
        isSuperAdmin: normalizedRole === "SUPER_ADMIN",
        capability: "transfer_approve"
      });
    } catch (err: any) {
      if (err instanceof ServerProfileVerificationError) {
        throw new FinopsException(err.code, err.message);
      }
      throw err;
    }

    if (!transferId || typeof transferId !== "string" || !transferId.trim()) {
      throw new FinopsException("INVALID_TRANSFER_ID", "L'identifiant du transfert est obligatoire.");
    }

    const effectiveApproverId = actor.uid.trim();
    const effectiveApproverName = (actor.name || actor.email || actor.uid).trim();

    // 2. Transactional Execution for Read-Validate-Write Atomic Lifecycle
    return await firestore.runTransaction(async (transaction) => {
      const now = new Date().toISOString();
      const transferRef = firestore.collection("internal_transfers").doc(transferId.trim());

      // Read Transfer & Idempotency Lock
      let idempRef: FirebaseFirestore.DocumentReference | null = null;
      if (idempotencyKey && idempotencyKey.trim()) {
        idempRef = firestore.collection("idempotency_keys").doc(`ik_${businessId}_approve_${idempotencyKey.trim()}`);
        const idempSnap = await transaction.get(idempRef);
        if (idempSnap.exists) {
          const idempData = idempSnap.data() || {};
          if (idempData.business_id && idempData.business_id !== businessId) {
            throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Violation d'isolation multi-tenant sur le verrou d'idempotence.");
          }
          if (idempData.status === "COMPLETED" && idempData.result) {
            return idempData.result as InternalTransfer;
          }
          if (idempData.status === "IN_FLIGHT") {
            throw new FinopsException("DUPLICATE_OPERATION_IN_PROGRESS", "L'approbation de ce transfert est déjà en cours de traitement.");
          }
        }
      }

      const transferSnap = await transaction.get(transferRef);
      if (!transferSnap.exists) {
        throw new FinopsException("TRANSFER_NOT_FOUND", `Le transfert [${transferId}] est introuvable.`);
      }

      const transfer = transferSnap.data() as InternalTransfer;

      if (transfer.business_id !== businessId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Le transfert [${transferId}] n'appartient pas à l'entreprise [${businessId}].`
        );
      }

      if (transfer.status === "EXECUTED" || transfer.status === "REJECTED") {
        throw new FinopsException(
          "TRANSFER_ALREADY_FINALIZED",
          `Le transfert [${transferId}] est déjà finalisé (statut actuel : ${transfer.status}).`
        );
      }

      if (transfer.status !== "PENDING_APPROVAL") {
        throw new FinopsException(
          "INVALID_TRANSFER_STATUS",
          `Le transfert [${transferId}] est dans le statut '${transfer.status}' et ne peut pas être approuvé.`
        );
      }

      // 3. STRICT MAKER-CHECKER ENFORCEMENT
      if (transfer.initiator_id === effectiveApproverId) {
        throw new FinopsException(
          "MAKER_CHECKER_VIOLATION",
          "Séparation des tâches (Maker-Checker) : L'initiateur du transfert ne peut pas approuver sa propre transaction."
        );
      }

      // SAFE -> SAFE Policy Validation (Manager / Owner cross-approval)
      if (transfer.source_type === "SAFE" && transfer.destination_type === "SAFE") {
        const initRole = (transfer.initiator_role || "").trim().toUpperCase();
        if (initRole === "MANAGER" && !["MANAGER", "OWNER", "SUPER_ADMIN", "ADMIN"].includes(normalizedRole)) {
          throw new FinopsException(
            "FORBIDDEN_ROLE",
            "Un transfert de coffre à coffre initié par un Manager nécessite l'approbation d'un autre Manager ou d'un Owner."
          );
        }
        if (initRole === "OWNER" && !["OWNER", "SUPER_ADMIN"].includes(normalizedRole)) {
          throw new FinopsException(
            "FORBIDDEN_ROLE",
            "Un transfert de coffre à coffre initié par un Owner nécessite l'approbation d'un autre Owner ou d'un Super Admin."
          );
        }
      }

      // 4. READ SOURCE & DESTINATION ENTITIES FOR BALANCE REVALIDATION
      let sourceRef: FirebaseFirestore.DocumentReference | null = null;
      let destRef: FirebaseFirestore.DocumentReference | null = null;
      let sourceTillData: CashTill | null = null;
      let sourceSafeData: BranchSafe | null = null;
      let destTillData: CashTill | null = null;
      let destSafeData: BranchSafe | null = null;

      if (transfer.source_type === "TILL") {
        sourceRef = firestore.collection("cash_tills").doc(transfer.source_id);
        const srcSnap = await transaction.get(sourceRef);
        if (!srcSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `La caisse source [${transfer.source_id}] est introuvable.`);
        }
        sourceTillData = srcSnap.data() as CashTill;
        if (sourceTillData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Caisse source appartenant à un autre tenant.");
        }
      } else if (transfer.source_type === "SAFE") {
        sourceRef = firestore.collection("branch_safes").doc(transfer.source_id);
        const srcSnap = await transaction.get(sourceRef);
        if (!srcSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `Le coffre source [${transfer.source_id}] est introuvable.`);
        }
        sourceSafeData = srcSnap.data() as BranchSafe;
        if (sourceSafeData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Coffre source appartenant à un autre tenant.");
        }
      }

      if (transfer.destination_type === "TILL") {
        destRef = firestore.collection("cash_tills").doc(transfer.destination_id);
        const destSnap = await transaction.get(destRef);
        if (!destSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `La caisse destination [${transfer.destination_id}] est introuvable.`);
        }
        destTillData = destSnap.data() as CashTill;
        if (destTillData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Caisse destination appartenant à un autre tenant.");
        }
      } else if (transfer.destination_type === "SAFE") {
        destRef = firestore.collection("branch_safes").doc(transfer.destination_id);
        const destSnap = await transaction.get(destRef);
        if (!destSnap.exists) {
          throw new FinopsException("ENTITY_NOT_FOUND", `Le coffre destination [${transfer.destination_id}] est introuvable.`);
        }
        destSafeData = destSnap.data() as BranchSafe;
        if (destSafeData.business_id !== businessId) {
          throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Coffre destination appartenant à un autre tenant.");
        }
      }

      // Read Active Sessions if Tills are involved
      let sourceSessionData: TillSession | null = null;
      let destSessionData: TillSession | null = null;

      if (sourceTillData && sourceTillData.active_session_id) {
        const sessRef = firestore.collection("till_sessions").doc(sourceTillData.active_session_id);
        const sessSnap = await transaction.get(sessRef);
        if (sessSnap.exists) sourceSessionData = sessSnap.data() as TillSession;
      }

      if (destTillData && destTillData.active_session_id) {
        const sessRef = firestore.collection("till_sessions").doc(destTillData.active_session_id);
        const sessSnap = await transaction.get(sessRef);
        if (sessSnap.exists) destSessionData = sessSnap.data() as TillSession;
      }

      // 5. ENFORCE TILL -> TILL CONDITIONAL RULES (8 Conditions)
      if (transfer.source_type === "TILL" && transfer.destination_type === "TILL") {
        if (!sourceTillData || !destTillData) {
          throw new FinopsException("ENTITY_NOT_FOUND", "Caisses source ou destination introuvables.");
        }
        // 1. Same tenant (verified above)
        // 2. Same branch
        if (sourceTillData.branch_id !== destTillData.branch_id) {
          throw new FinopsException(
            "BRANCH_MISMATCH",
            `Les transferts directs caisse à caisse doivent être dans la même succursale. Source: [${sourceTillData.branch_id}], Dest: [${destTillData.branch_id}].`
          );
        }
        // 3. Same currency
        if (sourceTillData.currency !== destTillData.currency || sourceTillData.currency !== transfer.currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `Incohérence de devise caisse à caisse : Source (${sourceTillData.currency}), Dest (${destTillData.currency}), Transfert (${transfer.currency}).`
          );
        }
        // 4. Source session active
        if (sourceTillData.status !== "OPEN" || !sourceSessionData || sourceSessionData.status !== "ACTIVE") {
          throw new FinopsException(
            "SESSION_NOT_ACTIVE",
            `La caisse source [${sourceTillData.name}] n'a pas de session active ouverte.`
          );
        }
        // 5. Dest session active
        if (destTillData.status !== "OPEN" || !destSessionData || destSessionData.status !== "ACTIVE") {
          throw new FinopsException(
            "SESSION_NOT_ACTIVE",
            `La caisse destination [${destTillData.name}] n'a pas de session active ouverte.`
          );
        }
        // 6. Sufficient balance (revalidated below)
        // 7. Maker-checker strict (verified above)
        // 8. Supervisor role (verified above)
      }

      // 6. REVALIDATE AVAILABLE SOURCE BALANCE (IN TRANSACTION)
      if (sourceTillData) {
        if (sourceTillData.balance_cents < transfer.amount_cents) {
          throw new FinopsException(
            "INSUFFICIENT_FUNDS",
            `Solde insuffisant dans la caisse source "${sourceTillData.name}" (${(sourceTillData.balance_cents / 100).toLocaleString()} ${transfer.currency} disponible, ${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency} requis).`
          );
        }
      } else if (sourceSafeData) {
        if (sourceSafeData.balance_cents < transfer.amount_cents) {
          throw new FinopsException(
            "INSUFFICIENT_FUNDS",
            `Solde insuffisant dans le coffre source "${sourceSafeData.name}" (${(sourceSafeData.balance_cents / 100).toLocaleString()} ${transfer.currency} disponible, ${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency} requis).`
          );
        }
      }

      // 7. CALCULATE NEW BALANCES & WRITE PREPARATION
      const correlationId = `corr_xfer_${transfer.id}_${Date.now()}`;
      const glTxId = `gl_xfer_${transfer.id}`;

      const debitAccount = transfer.debit_account_code || (transfer.destination_type === "SAFE" ? (transfer.currency === "HTG" ? "1015" : "1025") : (transfer.currency === "HTG" ? "1010" : "1020"));
      const creditAccount = transfer.credit_account_code || (transfer.source_type === "SAFE" ? (transfer.currency === "HTG" ? "1015" : "1025") : (transfer.currency === "HTG" ? "1010" : "1020"));

      // 7a. Balance Updates
      if (sourceTillData && sourceRef) {
        const updatedSourceTill: CashTill = {
          ...sourceTillData,
          balance_cents: sourceTillData.balance_cents - transfer.amount_cents,
          updated_at: now
        };
        transaction.set(sourceRef, updatedSourceTill, { merge: true });
      } else if (sourceSafeData && sourceRef) {
        const updatedSourceSafe: BranchSafe = {
          ...sourceSafeData,
          balance_cents: sourceSafeData.balance_cents - transfer.amount_cents,
          updated_at: now
        };
        transaction.set(sourceRef, updatedSourceSafe, { merge: true });
      }

      if (destTillData && destRef) {
        const updatedDestTill: CashTill = {
          ...destTillData,
          balance_cents: destTillData.balance_cents + transfer.amount_cents,
          updated_at: now
        };
        transaction.set(destRef, updatedDestTill, { merge: true });
      } else if (destSafeData && destRef) {
        const updatedDestSafe: BranchSafe = {
          ...destSafeData,
          balance_cents: destSafeData.balance_cents + transfer.amount_cents,
          updated_at: now
        };
        transaction.set(destRef, updatedDestSafe, { merge: true });
      }

      // 7b. General Ledger Transaction Entry
      const ledgerTx: LedgerTransaction = {
        id: glTxId,
        businessId,
        business_id: businessId,
        branchId: transfer.branch_id || actor.branch_id || "MAIN_BRANCH",
        branch_id: transfer.branch_id || actor.branch_id || "MAIN_BRANCH",
        departmentId: "treasury",
        department_id: "treasury",
        date: now.slice(0, 10),
        description: `[TRANSFERT INTERNE EXÉCUTÉ] ${transfer.source_name} ➔ ${transfer.destination_name}`,
        amount: transfer.amount_cents / 100,
        amount_cents: transfer.amount_cents,
        currency: transfer.currency,
        type: "TRANSFER" as any,
        category: transfer.funding_category || "INTERNAL_TRANSFER",
        status: "POSTED",
        debit_account: debitAccount,
        credit_account: creditAccount,
        debit_account_code: debitAccount,
        credit_account_code: creditAccount,
        debit: transfer.amount_cents / 100,
        credit: transfer.amount_cents / 100,
        debit_cents: transfer.amount_cents,
        credit_cents: transfer.amount_cents,
        debit_amount_cents: transfer.amount_cents,
        credit_amount_cents: transfer.amount_cents,
        source: "SYSTEM",
        signerId: effectiveApproverId,
        createdBy: effectiveApproverName,
        referenceTransactionId: transfer.id,
        isImmutable: true,
        metadata: {
          transferId: transfer.id,
          correlationId,
          sourceType: transfer.source_type,
          destinationType: transfer.destination_type,
          initiatorId: transfer.initiator_id,
          approverId: effectiveApproverId,
          executedAt: now
        }
      };

      // 7c. Updated Internal Transfer Record
      const updatedTransfer: InternalTransfer = {
        ...transfer,
        status: "EXECUTED",
        approver_id: effectiveApproverId,
        approver_name: effectiveApproverName,
        approved_at: now,
        executed_at: now,
        gl_transaction_id: glTxId
      };

      // 7d. Forensic Audit Log (v2_server)
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "INTERNAL_TRANSFER_APPROVED_AND_EXECUTED",
        actorId: effectiveApproverId,
        timestamp: now,
        details: `Approbation et exécution du transfert ${transfer.id} de ${transfer.source_name} vers ${transfer.destination_name} (${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency}).`,
        beforeState: { status: transfer.status },
        afterState: { status: "EXECUTED", approverId: effectiveApproverId, glTxId, correlationId },
        keyVersion: "v2_server"
      };
      const signature = computeServerHMACSignature(logPayload);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveApproverId,
        userName: effectiveApproverName,
        userRole: normalizedRole,
        action: "INTERNAL_TRANSFER_APPROVED_AND_EXECUTED",
        details: logPayload.details,
        beforeState: logPayload.beforeState,
        afterState: logPayload.afterState,
        keyVersion: "v2_server",
        timestamp: now,
        signature
      };

      // 7e. Event Outbox Document
      const outboxEvent = {
        eventId: `evt_xfer_${transfer.id}`,
        correlationId,
        businessId,
        module: "TREASURY_CASH",
        aggregate: "InternalTransfer",
        type: "CASH_INTERNAL_TRANSFER_EXECUTED",
        eventType: "CASH_INTERNAL_TRANSFER_EXECUTED",
        source: "ServerInternalTransferEngine",
        payload: {
          transferId: transfer.id,
          sourceId: transfer.source_id,
          destinationId: transfer.destination_id,
          amountCents: transfer.amount_cents,
          currency: transfer.currency,
          approverId: effectiveApproverId,
          businessId
        },
        version: "1.0.0",
        status: "PENDING",
        timestamp: now
      };

      // ATOMIC TRANSACTION WRITES
      transaction.set(transferRef, updatedTransfer, { merge: true });
      transaction.set(firestore.collection("ledger_transactions").doc(glTxId), ledgerTx);
      transaction.set(firestore.collection("forensic_logs").doc(logId), forensicLogRecord);
      transaction.set(firestore.collection("event_outbox").doc(outboxEvent.eventId), outboxEvent);

      if (idempRef) {
        transaction.set(idempRef, {
          id: `ik_${businessId}_approve_${idempotencyKey?.trim()}`,
          business_id: businessId,
          status: "COMPLETED",
          result: updatedTransfer,
          created_at: now
        });
      }

      return updatedTransfer;
    });
  }

  /**
   * Rejects an internal transfer with mandatory rejection reason and Maker-Checker validation.
   */
  public static async rejectTransfer(
    transferId: string,
    params: RejectInternalTransferParams,
    actor: ServerActorContext
  ): Promise<InternalTransfer> {
    const firestore = getAdminFirestore();

    // 1. Identity & Tenant Verification
    this.validateActorContext(actor, params.businessId);

    const { businessId, rejectionReason, idempotencyKey } = params;

    const normalizedRole = (actor.role || "").trim().toUpperCase();
    if (normalizedRole === "MASTER_HEAD_TELLER" || !canApproveInternalTransferRole(normalizedRole) || !SUPERVISOR_TRANSFER_ROLES.has(normalizedRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${actor.role}] n'est pas habilité à rejeter les transferts de trésorerie.`
      );
    }

    try {
      await verifyServerEmployeeOperationalProfile({
        adminDb: firestore,
        uid: actor.uid,
        email: actor.email,
        businessId,
        actorRole: normalizedRole,
        isSuperAdmin: normalizedRole === "SUPER_ADMIN",
        capability: "transfer_approve"
      });
    } catch (err: any) {
      if (err instanceof ServerProfileVerificationError) {
        throw new FinopsException(err.code, err.message);
      }
      throw err;
    }

    if (!rejectionReason || typeof rejectionReason !== "string" || rejectionReason.trim().length < 5) {
      throw new FinopsException(
        "REJECTION_REASON_REQUIRED",
        "Un motif de rejet d'au moins 5 caractères est obligatoire pour refuser un transfert."
      );
    }

    const effectiveApproverId = actor.uid.trim();
    const effectiveApproverName = (actor.name || actor.email || actor.uid).trim();

    return await firestore.runTransaction(async (transaction) => {
      const now = new Date().toISOString();
      const transferRef = firestore.collection("internal_transfers").doc(transferId.trim());

      const transferSnap = await transaction.get(transferRef);
      if (!transferSnap.exists) {
        throw new FinopsException("TRANSFER_NOT_FOUND", `Le transfert [${transferId}] est introuvable.`);
      }

      const transfer = transferSnap.data() as InternalTransfer;

      if (transfer.business_id !== businessId) {
        throw new FinopsException("TENANT_ISOLATION_VIOLATION", "Violation d'isolation multi-tenant.");
      }

      if (transfer.status === "EXECUTED" || transfer.status === "REJECTED") {
        throw new FinopsException(
          "TRANSFER_ALREADY_FINALIZED",
          `Le transfert [${transferId}] est déjà finalisé (statut actuel : ${transfer.status}).`
        );
      }

      if (transfer.status !== "PENDING_APPROVAL") {
        throw new FinopsException(
          "INVALID_TRANSFER_STATUS",
          `Le transfert [${transferId}] ne peut pas être rejeté car son statut est '${transfer.status}'.`
        );
      }

      if (transfer.initiator_id === effectiveApproverId) {
        throw new FinopsException(
          "MAKER_CHECKER_VIOLATION",
          "Séparation des tâches (Maker-Checker) : L'initiateur du transfert ne peut pas rejeter sa propre transaction."
        );
      }

      const updatedTransfer: InternalTransfer = {
        ...transfer,
        status: "REJECTED",
        approver_id: effectiveApproverId,
        approver_name: effectiveApproverName,
        rejection_reason: rejectionReason.trim(),
        approved_at: now
      };

      // Forensic Audit Log
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const logPayload = {
        id: logId,
        business_id: businessId,
        action: "INTERNAL_TRANSFER_REJECTED",
        actorId: effectiveApproverId,
        timestamp: now,
        details: `Rejet du transfert ${transfer.id}. Motif : ${rejectionReason.trim()}`,
        beforeState: { status: transfer.status },
        afterState: { status: "REJECTED", reason: rejectionReason.trim() },
        keyVersion: "v2_server"
      };
      const signature = computeServerHMACSignature(logPayload);

      const forensicLogRecord = {
        id: logId,
        business_id: businessId,
        actorId: effectiveApproverId,
        userName: effectiveApproverName,
        userRole: normalizedRole,
        action: "INTERNAL_TRANSFER_REJECTED",
        details: logPayload.details,
        beforeState: logPayload.beforeState,
        afterState: logPayload.afterState,
        keyVersion: "v2_server",
        timestamp: now,
        signature
      };

      transaction.set(transferRef, updatedTransfer, { merge: true });
      transaction.set(firestore.collection("forensic_logs").doc(logId), forensicLogRecord);

      return updatedTransfer;
    });
  }

  /**
   * Helper for Safe Funding from Bank / Capital Injection by Manager or Owner.
   */
  public static async fundSafe(
    params: FundSafeServerParams,
    actor: ServerActorContext
  ): Promise<InternalTransfer> {
    this.validateActorContext(actor, params.businessId);

    const normalizedRole = (actor.role || "").trim().toUpperCase();
    if (!["MANAGER", "OWNER", "ADMIN", "SUPER_ADMIN"].includes(normalizedRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${actor.role}] n'est pas habilité à exécuter une alimentation directe de coffre.`
      );
    }

    let sourceType: TransferSourceType = "BANK";
    if (params.sourceType === "EQUITY_INJECTION") sourceType = "EQUITY_INJECTION";
    else if (params.sourceType === "SAFE") sourceType = "SAFE";
    else if (params.sourceType === "TILL") sourceType = "TILL";

    const requestParams: RequestInternalTransferParams = {
      businessId: params.businessId,
      sourceType,
      sourceId: params.sourceIdentifier,
      destinationType: "SAFE",
      destinationId: params.safeId,
      amountCents: params.amountCents,
      currency: params.currency,
      reason: params.reason,
      debitAccountCode: params.debitAccountCode,
      creditAccountCode: params.creditAccountCode,
      bankReference: params.referenceNumber,
      fundingCategory: sourceType === "BANK" ? "BANK_WITHDRAWAL" : sourceType === "EQUITY_INJECTION" ? "OWNER_INJECTION" : "INTER_SAFE",
      idempotencyKey: params.idempotencyKey
    };

    const transfer = await this.requestTransfer(requestParams, actor);

    // Auto-execute if requested and source is external funding (BANK or EQUITY_INJECTION)
    const isExternalFunding = sourceType === "BANK" || sourceType === "EQUITY_INJECTION";
    if (params.autoExecute && isExternalFunding) {
      // Create distinct actor context for approval if auto-executing, but Maker-Checker requires approver !== initiator.
      // For external bank/capital injections, auto-execute is allowed by system account or requires separate approver context.
      // If autoExecute requested, approve with actor
      try {
        return await this.approveTransfer(transfer.id, { businessId: params.businessId, approvalNotes: "Auto-exécution alimentation coffre externe" }, actor);
      } catch (e: any) {
        // If Maker-Checker blocks self approval on request, return PENDING_APPROVAL transfer for secondary approval
        if (e instanceof FinopsException && e.code === "MAKER_CHECKER_VIOLATION") {
          return transfer;
        }
        throw e;
      }
    }

    return transfer;
  }

  /**
   * Validates server actor context against requested business ID.
   */
  private static validateActorContext(actor: ServerActorContext, requestedBusinessId: string): void {
    if (!actor || typeof actor !== "object") {
      throw new FinopsException(
        "MISSING_TENANT_CONTEXT",
        "Le contexte d'authentification serveur (actor) est obligatoire."
      );
    }

    if (!actor.uid || typeof actor.uid !== "string" || !actor.uid.trim()) {
      throw new FinopsException(
        "MISSING_TENANT_CONTEXT",
        "L'identifiant de l'utilisateur authentifié (actor.uid) est manquant."
      );
    }

    const actorBizId = (actor.business_id || "").trim();
    const reqBizId = (requestedBusinessId || "").trim();

    if (!actorBizId) {
      throw new FinopsException(
        "MISSING_TENANT_CONTEXT",
        "L'identifiant d'entreprise (actor.business_id) est manquant dans le jeton d'authentification."
      );
    }

    if (!reqBizId) {
      throw new FinopsException(
        "MISSING_TENANT_CONTEXT",
        "L'identifiant d'entreprise (businessId) est obligatoire dans la requête."
      );
    }

    if (actorBizId !== reqBizId) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `Accès inter-tenant refusé : l'utilisateur (${actor.uid}) du tenant [${actorBizId}] tente d'opérer sur le tenant [${reqBizId}].`
      );
    }
  }
}
