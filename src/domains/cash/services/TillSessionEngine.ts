import { db } from "../../../lib/firebase";
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, where, deleteDoc } from "firebase/firestore";
import {
  TillSession,
  CashTill,
  CurrencyCode,
  DenominationBreakdown,
  TillStatement,
  TillStatementMovement,
  InternalTransfer,
  CustomerTransfer,
  TellerTransaction
} from "../../../types/cashManagement";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";
import { TellerTransactionEngine } from "./TellerTransactionEngine";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { getHaitiDateString } from "../../../repositories/CurrencyRateRepository";
import { sanitizeAndEnrichLedgerTransaction } from "../../../services/AccountingEngine";
import { validateLedgerForeignKeys } from "../../../validations/integritySchemas";
import { RuntimeEvent } from "../../../modules/runtime/types";
import { LedgerTransaction } from "../../../types";

export interface OpenSessionParams {
  tillId: string;
  businessId?: string;
  operatorId: string;
  operatorName: string;
  operatorRole?: string;
  openingBalanceCents: number;
  businessDate?: string;
}

export interface CloseSessionParams {
  sessionId: string;
  tillId?: string;
  businessId?: string;
  currency?: CurrencyCode;
  actualClosingCents: number; // Physical count in integer cents
  denominationBreakdown?: DenominationBreakdown;
  operatorId: string;
  operatorName: string;
  operatorRole?: string;
  authenticatedUid?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface ReopenSessionParams {
  tillId: string;
  previousSessionId: string;
  businessId?: string;
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  approverRole: string;
  authenticatedApproverUid?: string;
  reason: string;
  idempotencyKey?: string;
}

const MAX_CLOSING_AMOUNT_CENTS = 100_000_000_000; // 1,000,000,000.00 max bound
const MAX_DENOMINATION_COUNT = 1_000_000;

export const CANONICAL_HTG_DENOMINATIONS: readonly number[] = [1000, 500, 250, 100, 50, 25, 10, 5, 2, 1];
export const CANONICAL_USD_DENOMINATIONS: readonly number[] = [100, 50, 20, 10, 5, 2, 1];

export const ALLOWED_HTG_DENOMINATIONS = new Set<number>(CANONICAL_HTG_DENOMINATIONS);
export const ALLOWED_USD_DENOMINATIONS = new Set<number>(CANONICAL_USD_DENOMINATIONS);

const ALLOWED_CLOSURE_ROLES = new Set<string>([
  "TELLER",
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "CASHIER",
  "HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

const SUPERVISOR_CLOSURE_ROLES = new Set<string>([
  "HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

const AUTHORIZED_REOPEN_ROLES = new Set<string>([
  "HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "SUPER_ADMIN"
]);

const TERMINAL_INTERNAL_TRANSFER_STATUSES = new Set<string>([
  "EXECUTED",
  "REJECTED",
  "CANCELLED"
]);

const PENDING_CUSTOMER_TRANSFER_STATUSES = new Set<string>([
  "PENDING_APPROVAL",
  "PENDING",
  "PROCESSING",
  "IN_PROGRESS",
  "IN_TRANSIT",
  "ON_HOLD"
]);

const INACTIVE_ENTITY_STATUSES = new Set<string>([
  "INACTIVE",
  "SUSPENDED",
  "TERMINATED",
  "DISABLED",
  "REVOKED",
  "ARCHIVED"
]);

export class TillSessionEngine {
  public static readonly CLOSE_SESSION_API_ENDPOINT = "/api/cash/sessions/close";
  public static readonly REOPEN_SESSION_API_ENDPOINT = "/api/cash/sessions/reopen";

  /**
   * Per-session and per-till in-memory concurrency guard to prevent parallel race conditions
   * within the same Node/runtime process before Firestore transactions commit.
   */
  private static activeLocks = new Set<string>();

  private static acquireLocks(keys: string[]): void {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    for (const k of uniqueKeys) {
      if (this.activeLocks.has(k)) {
        throw new FinopsException(
          "CONCURRENT_CLOSURE_CONFLICT",
          `Une opération concurrente de clôture ou de réouverture est déjà en cours sur [${k}].`
        );
      }
    }
    for (const k of uniqueKeys) {
      this.activeLocks.add(k);
    }
  }

  private static releaseLocks(keys: string[]): void {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    for (const k of uniqueKeys) {
      this.activeLocks.delete(k);
    }
  }

  /**
   * Canonical helper to record cryptographically signed ForensicLog entries on Admin SDK paths (D3.1-H).
   * Non-blocking so an audit sink failure never corrupts or partially rolls back committed financial state.
   */
  public static async recordAdminForensicEvent(
    adminDb: any,
    args: {
      businessId: string;
      actorId: string;
      actorName: string;
      actorRole: string;
      action:
        | "TILL_SESSION_CLOSED"
        | "TILL_SESSION_CLOSE_REFUSED"
        | "TILL_SESSION_REOPENED"
        | "TILL_SESSION_REOPEN_REFUSED";
      sessionId: string;
      tillId?: string;
      result: "SUCCESS" | "REFUSED";
      errorCode?: string;
      details: string;
      beforeState?: Record<string, any> | null;
      afterState?: Record<string, any> | null;
      timestamp?: string;
    }
  ): Promise<void> {
    if (!adminDb) return;
    try {
      const now = args.timestamp || new Date().toISOString();
      const correlationId = `corr_${args.action.toLowerCase()}_${args.sessionId}_${Date.now()}`;
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: args.businessId || "UNKNOWN",
        actorId: args.actorId,
        userName: args.actorName || args.actorId,
        userRole: args.actorRole || "SYSTEM",
        action: args.action,
        details: args.details,
        beforeState: args.beforeState || null,
        afterState: {
          ...(args.afterState || {}),
          sessionId: args.sessionId,
          tillId: args.tillId,
          result: args.result,
          errorCode: args.errorCode,
          correlationId
        },
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log, adminDb);
    } catch (fErr) {
      console.warn("[TillSessionEngine.recordAdminForensicEvent] Audit log warning:", fErr);
    }
  }

  /**
   * Validates denomination breakdown against currency rules and actualClosingCents (D3-C / D3.1-E).
   * When actualClosingCents > 0, denominationBreakdown is strictly mandatory.
   */
  public static validateDenominationBreakdown(
    currency: CurrencyCode,
    actualClosingCents: number,
    denominationBreakdown?: DenominationBreakdown
  ): void {
    const allowedSet =
      currency === "HTG"
        ? ALLOWED_HTG_DENOMINATIONS
        : currency === "USD"
        ? ALLOWED_USD_DENOMINATIONS
        : null;

    if (!allowedSet) {
      throw new FinopsException(
        "UNSUPPORTED_CURRENCY",
        `Devise [${currency}] non supportée pour le billetage de caisse.`
      );
    }

    if (denominationBreakdown === undefined) {
      if (actualClosingCents > 0) {
        throw new FinopsException(
          "INVALID_DENOMINATION_BREAKDOWN",
          "Le détail du billetage (denominationBreakdown) est obligatoire lorsque le montant physique de clôture est supérieur à zéro."
        );
      }
      return;
    }

    if (
      denominationBreakdown === null ||
      typeof denominationBreakdown !== "object" ||
      Array.isArray(denominationBreakdown)
    ) {
      throw new FinopsException(
        "INVALID_DENOMINATION_BREAKDOWN",
        "Le détail du billetage (denominationBreakdown) doit être un objet valide."
      );
    }

    let computedTotalCents = 0;
    const entries = Object.entries(denominationBreakdown);

    for (const [denomKey, rawCount] of entries) {
      if (!/^\d+$/.test(denomKey)) {
        throw new FinopsException(
          "INVALID_DENOMINATION",
          `Coupure invalide [${denomKey}] pour la devise ${currency}.`
        );
      }

      const denomValue = Number(denomKey);
      if (!Number.isSafeInteger(denomValue) || !allowedSet.has(denomValue)) {
        throw new FinopsException(
          "INVALID_DENOMINATION",
          `La coupure [${denomKey}] n'est pas valide pour la devise ${currency}.`
        );
      }

      if (
        typeof rawCount !== "number" ||
        !Number.isFinite(rawCount) ||
        !Number.isSafeInteger(rawCount) ||
        rawCount < 0 ||
        rawCount > MAX_DENOMINATION_COUNT
      ) {
        throw new FinopsException(
          "INVALID_DENOMINATION_COUNT",
          `Quantité de coupures invalide [${rawCount}] pour le billet/pièce ${denomKey} ${currency}.`
        );
      }

      const lineCents = denomValue * rawCount * 100;
      if (!Number.isSafeInteger(lineCents) || lineCents < 0) {
        throw new FinopsException(
          "INVALID_DENOMINATION_COUNT",
          `Débordement arithmétique sur la coupure ${denomKey} ${currency}.`
        );
      }

      computedTotalCents += lineCents;
      if (!Number.isSafeInteger(computedTotalCents)) {
        throw new FinopsException(
          "INVALID_CLOSING_AMOUNT",
          "Le total cumulé du billetage dépasse la limite entière sécurisée."
        );
      }
    }

    if (computedTotalCents !== actualClosingCents) {
      throw new FinopsException(
        "DENOMINATION_TOTAL_MISMATCH",
        `Incohérence de billetage : la somme des coupures (${(computedTotalCents / 100).toFixed(2)} ${currency}) ne correspond pas au montant physique déclaré (${(actualClosingCents / 100).toFixed(2)} ${currency}).`
      );
    }
  }

  /**
   * Pure validation and calculation core for Till Session Closure (D3-A, D3-B, D3-C, D3.1-A, D3.1-C, D3.1-E).
   * Shared by both client/domain engine and server-side Admin SDK transactional execution.
   */
  private static evaluateClosure(args: {
    params: CloseSessionParams;
    currentSession: TillSession | null;
    till: CashTill | null;
    tellerTxs: TellerTransaction[];
    internalTransfers: InternalTransfer[];
    customerTransfers: CustomerTransfer[];
    existingVarianceGlExists: boolean;
    existingVarianceOutboxExists?: boolean;
    now: string;
  }): {
    closedSession: TillSession;
    closedTill: CashTill;
    varianceLedgerTx?: LedgerTransaction;
    varianceOutboxEvent?: RuntimeEvent;
    expectedClosingCents: number;
    discrepancyCents: number;
    varianceType: "ZERO" | "OVERAGE" | "SHORTAGE";
  } {
    const {
      params,
      currentSession,
      till,
      tellerTxs,
      internalTransfers,
      customerTransfers,
      existingVarianceGlExists,
      existingVarianceOutboxExists,
      now
    } = args;

    const {
      sessionId,
      actualClosingCents,
      denominationBreakdown,
      operatorId,
      operatorName,
      operatorRole,
      authenticatedUid,
      notes
    } = params;

    // 1. Validate raw parameters & authenticated operator identity (D3-C / D3.1-A)
    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      throw new FinopsException("INVALID_SESSION_ID", "Identifiant de session manquant ou invalide.");
    }

    if (
      !operatorId ||
      typeof operatorId !== "string" ||
      !operatorId.trim() ||
      !operatorName ||
      typeof operatorName !== "string" ||
      !operatorName.trim()
    ) {
      throw new FinopsException(
        "UNAUTHORIZED_SESSION_OPERATOR",
        "Identité de l'opérateur de clôture manquante ou invalide."
      );
    }

    if (authenticatedUid !== undefined && operatorId.trim() !== authenticatedUid.trim()) {
      throw new FinopsException(
        "IDENTITY_SPOOFING_DETECTED",
        `L'identifiant opérateur (${operatorId}) ne correspond pas à l'utilisateur authentifié (${authenticatedUid}).`
      );
    }

    if (
      typeof actualClosingCents !== "number" ||
      !Number.isFinite(actualClosingCents) ||
      !Number.isSafeInteger(actualClosingCents) ||
      actualClosingCents < 0 ||
      actualClosingCents > MAX_CLOSING_AMOUNT_CENTS
    ) {
      throw new FinopsException(
        "INVALID_CLOSING_AMOUNT",
        `Montant physique de clôture invalide [${actualClosingCents}]. Le montant doit être un entier positif ou nul en centimes.`
      );
    }

    // 2. Verify Session Existence (D3-B)
    if (!currentSession) {
      throw new FinopsException(
        "SESSION_NOT_FOUND",
        `La session de caisse [${sessionId}] est introuvable.`
      );
    }

    const sessionBizId = (currentSession.business_id || "").trim();
    if (!sessionBizId) {
      throw new FinopsException(
        "MALFORMED_SESSION_TENANT",
        `La session [${sessionId}] ne possède pas de business_id valide.`
      );
    }

    // 3. Enforce Multi-Tenant Isolation on Session (D3-B)
    if (params.businessId !== undefined) {
      const requestedBizId = String(params.businessId || "").trim();
      if (!requestedBizId || requestedBizId !== sessionBizId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Accès inter-tenant refusé : la session [${sessionId}] n'appartient pas au tenant [${requestedBizId}].`
        );
      }
    }

    // 4. Verify Session Status & Idempotency BEFORE Till status check (D3-B)
    if (
      currentSession.status === "CLOSED_MATCHED" ||
      currentSession.status === "CLOSED_DISCREPANCY" ||
      currentSession.status === "REOPENED"
    ) {
      throw new FinopsException(
        "SESSION_ALREADY_CLOSED",
        `La session de caisse [${sessionId}] est déjà clôturée (statut : '${currentSession.status}').`
      );
    }

    if (
      currentSession.status !== "ACTIVE" &&
      currentSession.status !== "CLOSURE_REQUESTED" &&
      currentSession.status !== "PENDING_APPROVAL"
    ) {
      throw new FinopsException(
        "SESSION_NOT_ACTIVE",
        `La session de caisse [${sessionId}] est déjà dans le statut '${currentSession.status}'.`
      );
    }

    if (existingVarianceGlExists || existingVarianceOutboxExists) {
      throw new FinopsException(
        "DUPLICATE_VARIANCE_GL_ENTRY",
        `Une écriture comptable d'écart [gl_variance_${sessionId}] existe déjà pour cette session.`
      );
    }

    // 5. Verify Till Existence, Tenant Ownership & Session Binding (D3-B)
    if (!till) {
      throw new FinopsException(
        "TILL_NOT_FOUND",
        `Caisse [${currentSession.till_id}] introuvable.`
      );
    }

    const tillBizId = (till.business_id || "").trim();
    if (!tillBizId || tillBizId !== sessionBizId) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `Incohérence multi-tenant entre la session [${sessionId}] (${sessionBizId}) et la caisse [${till.id}] (${tillBizId}).`
      );
    }

    if (params.tillId !== undefined && params.tillId.trim() !== till.id) {
      throw new FinopsException(
        "SESSION_TILL_MISMATCH",
        `La session [${sessionId}] est rattachée à la caisse [${till.id}] et non à [${params.tillId}].`
      );
    }

    if (currentSession.till_id !== till.id) {
      throw new FinopsException(
        "SESSION_TILL_MISMATCH",
        `Incohérence de rattachement entre session.till_id [${currentSession.till_id}] et till.id [${till.id}].`
      );
    }

    if (till.status !== "OPEN") {
      throw new FinopsException(
        "TILL_NOT_OPEN",
        `La caisse [${till.id}] n'est pas ouverte (statut : '${till.status}').`
      );
    }

    if (till.active_session_id && till.active_session_id !== sessionId) {
      throw new FinopsException(
        "ACTIVE_SESSION_MISMATCH",
        `La caisse [${till.id}] a pour session active [${till.active_session_id}], différente de [${sessionId}].`
      );
    }

    // 6. Operator Identity & RBAC Enforcement (D3-B / D3.1-A)
    const normalizedRole =
      operatorRole !== undefined && operatorRole !== null && String(operatorRole).trim() !== ""
        ? String(operatorRole).trim().toUpperCase()
        : undefined;

    if (normalizedRole !== undefined && !ALLOWED_CLOSURE_ROLES.has(normalizedRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${operatorRole}] n'est pas autorisé à clôturer une session de caisse.`
      );
    }

    const isSessionTeller = operatorId.trim() === (currentSession.teller_id || "").trim();
    const isSupervisor = normalizedRole !== undefined && SUPERVISOR_CLOSURE_ROLES.has(normalizedRole);

    if (!isSessionTeller && !isSupervisor) {
      throw new FinopsException(
        "UNAUTHORIZED_SESSION_OPERATOR",
        `L'opérateur [${operatorId}] n'est ni le guichetier titulaire de la session [${currentSession.teller_id}] ni un superviseur habilité.`
      );
    }

    // 7. Strict Currency & Account Mapping Validation (D3-C)
    if (till.currency !== "HTG" && till.currency !== "USD") {
      throw new FinopsException(
        "UNSUPPORTED_CURRENCY",
        `Devise de caisse invalide [${till.currency}]. Seules HTG et USD sont autorisées.`
      );
    }

    if (currentSession.currency !== till.currency) {
      throw new FinopsException(
        "CURRENCY_MISMATCH",
        `Conflit de devise entre la session (${currentSession.currency}) et la caisse (${till.currency}).`
      );
    }

    if (params.currency !== undefined && params.currency !== till.currency) {
      throw new FinopsException(
        "CURRENCY_MISMATCH",
        `La devise de clôture demandée (${params.currency}) ne correspond pas à la devise de la caisse (${till.currency}).`
      );
    }

    const tillAccount = CashAccountMapping.resolveTillAccount(till.currency);
    CashAccountMapping.validateCashLocationMapping(
      "TILL",
      till.currency,
      till.linked_account_code || tillAccount.accountCode
    );

    // 8. Denomination Breakdown Verification (D3-C / D3.1-E)
    this.validateDenominationBreakdown(till.currency, actualClosingCents, denominationBreakdown);

    // 9. Pending Operations & Transfers Blockade Check (D3-A)
    for (const trf of internalTransfers) {
      if (trf.source_id === till.id || trf.destination_id === till.id) {
        if (trf.business_id && trf.business_id !== sessionBizId) {
          throw new FinopsException(
            "TENANT_ISOLATION_VIOLATION",
            `Transfert interne [${trf.id}] appartenant à un tenant étranger détecté.`
          );
        }
        const statusUpper = String(trf.status || "").trim().toUpperCase();
        if (!TERMINAL_INTERNAL_TRANSFER_STATUSES.has(statusUpper)) {
          throw new FinopsException(
            "PENDING_TRANSFERS_BLOCKADE",
            `Impossible de clôturer la caisse "${till.name}" : le transfert interne [${trf.id}] est encore en cours (statut : '${trf.status}').`
          );
        }
      }
    }

    for (const ct of customerTransfers) {
      const ctAny = ct as any;
      const isLinkedToTillOrSession =
        ctAny.till_id === till.id ||
        ctAny.session_id === sessionId ||
        ct.paid_at_till_id === till.id ||
        ct.paid_at_session_id === sessionId ||
        ctAny.intake_till_id === till.id ||
        ctAny.intake_session_id === sessionId ||
        ctAny.payout_till_id === till.id ||
        ctAny.payout_session_id === sessionId;

      if (isLinkedToTillOrSession) {
        const ctStatus = String(ct.status || "").trim().toUpperCase();
        if (PENDING_CUSTOMER_TRANSFER_STATUSES.has(ctStatus)) {
          throw new FinopsException(
            "PENDING_TRANSFERS_BLOCKADE",
            `Impossible de clôturer la caisse "${till.name}" : l'opération de transfert client [${ct.id}] est encore en statut '${ct.status}'.`
          );
        }
      }
    }

    for (const tx of tellerTxs) {
      const txStatus = String(tx.status || "").trim().toUpperCase();
      if (txStatus !== "POSTED" && txStatus !== "REVERSED" && txStatus !== "CANCELLED") {
        throw new FinopsException(
          "PENDING_TRANSFERS_BLOCKADE",
          `Impossible de clôturer la caisse "${till.name}" : la transaction guichet [${tx.id}] est encore en statut '${tx.status}'.`
        );
      }
    }

    // 10. Reconstruct Authoritative Expected Closing Balance S_theo (D3-C)
    const openingCents = currentSession.opening_balance_cents ?? 0;
    if (
      typeof openingCents !== "number" ||
      !Number.isFinite(openingCents) ||
      !Number.isSafeInteger(openingCents) ||
      openingCents < 0
    ) {
      throw new FinopsException(
        "INVALID_OPENING_BALANCE",
        `Solde d'ouverture de session invalide [${openingCents}].`
      );
    }

    let totalInflowsCents = 0;
    let totalOutflowsCents = 0;

    for (const tx of tellerTxs) {
      if (tx.business_id !== sessionBizId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Transaction guichet [${tx.id}] appartenant à un autre tenant détectée.`
        );
      }
      if (tx.till_id && tx.till_id !== till.id) {
        throw new FinopsException(
          "SESSION_TILL_MISMATCH",
          `Transaction guichet [${tx.id}] rattachée à une autre caisse [${tx.till_id}].`
        );
      }
      if (tx.status === "POSTED") {
        if (tx.currency !== till.currency) {
          throw new FinopsException(
            "CURRENCY_MISMATCH",
            `Conflit de devise sur la transaction [${tx.id}] : ${tx.currency} dans une caisse ${till.currency}.`
          );
        }
        if (
          typeof tx.amount_cents !== "number" ||
          !Number.isFinite(tx.amount_cents) ||
          !Number.isSafeInteger(tx.amount_cents) ||
          tx.amount_cents <= 0
        ) {
          throw new FinopsException(
            "CORRUPT_MOVEMENT_AMOUNT",
            `Montant de transaction guichet invalide sur [${tx.id}] : ${tx.amount_cents}.`
          );
        }
        if (tx.flow_behavior === 1) {
          totalInflowsCents += tx.amount_cents;
        } else if (tx.flow_behavior === -1) {
          totalOutflowsCents += tx.amount_cents;
        } else {
          throw new FinopsException(
            "INVALID_MOVEMENT_FLOW",
            `Sens de flux invalide (${tx.flow_behavior}) sur la transaction [${tx.id}].`
          );
        }
      }
    }

    const sessionOpenedTime = new Date(currentSession.opened_at).getTime();
    const tillTransfers = internalTransfers.filter(
      (t) =>
        t.status === "EXECUTED" &&
        (t.source_id === till.id || t.destination_id === till.id) &&
        new Date(t.created_at).getTime() >= sessionOpenedTime
    );

    for (const trf of tillTransfers) {
      if (trf.currency !== till.currency) {
        throw new FinopsException(
          "CURRENCY_MISMATCH",
          `Conflit de devise sur le transfert interne [${trf.id}] : ${trf.currency} dans une caisse ${till.currency}.`
        );
      }
      if (
        typeof trf.amount_cents !== "number" ||
        !Number.isFinite(trf.amount_cents) ||
        !Number.isSafeInteger(trf.amount_cents) ||
        trf.amount_cents <= 0
      ) {
        throw new FinopsException(
          "CORRUPT_MOVEMENT_AMOUNT",
          `Montant de transfert interne invalide sur [${trf.id}] : ${trf.amount_cents}.`
        );
      }
      if (trf.destination_id === till.id) {
        totalInflowsCents += trf.amount_cents;
      } else if (trf.source_id === till.id) {
        totalOutflowsCents += trf.amount_cents;
      }
    }

    const expectedClosingCents = openingCents + totalInflowsCents - totalOutflowsCents;
    if (!Number.isSafeInteger(expectedClosingCents) || expectedClosingCents < 0) {
      throw new FinopsException(
        "NEGATIVE_EXPECTED_BALANCE",
        `Solde théorique de clôture invalide ou négatif (${expectedClosingCents} centimes).`
      );
    }

    if (
      typeof till.balance_cents !== "number" ||
      !Number.isFinite(till.balance_cents) ||
      !Number.isSafeInteger(till.balance_cents) ||
      till.balance_cents < 0
    ) {
      throw new FinopsException(
        "INVALID_TILL_BALANCE",
        `Le solde enregistré de la caisse [${till.id}] est invalide (${till.balance_cents}).`
      );
    }

    if (till.balance_cents !== expectedClosingCents) {
      throw new FinopsException(
        "TILL_BALANCE_DIVERGENCE",
        `Incohérence critique entre le solde de la caisse (${till.balance_cents} ¢) et le solde théorique reconstitué (${expectedClosingCents} ¢).`
      );
    }

    const discrepancyCents = actualClosingCents - expectedClosingCents;
    let varianceType: "ZERO" | "OVERAGE" | "SHORTAGE" = "ZERO";
    if (discrepancyCents > 0) varianceType = "OVERAGE";
    else if (discrepancyCents < 0) varianceType = "SHORTAGE";

    if (discrepancyCents !== 0 && (!notes || notes.trim().length === 0)) {
      throw new FinopsException(
        "VARIANCE_JUSTIFICATION_REQUIRED",
        `Un motif d'explication est obligatoire en présence d'un écart de caisse (${(discrepancyCents / 100).toLocaleString()} ${till.currency}).`
      );
    }

    // 11. Build Balanced Variance Entry to General Ledger on Account 2910 if Discrepancy Exists (D3-C / D3.1-C)
    let varianceLedgerTx: LedgerTransaction | undefined;
    let varianceOutboxEvent: RuntimeEvent | undefined;
    if (discrepancyCents !== 0) {
      const varianceAbsCents = Math.abs(discrepancyCents);
      const varianceAccountCode = CashAccountMapping.ACCOUNTS.CASH_VARIANCE_CLEARING.code; // "2910"

      let debitAcc = "";
      let creditAcc = "";

      if (varianceType === "SHORTAGE") {
        // Manquant : Debit 2910 (Compte d'Attente Écarts de Caisse), Credit Caisse (1010/1020)
        debitAcc = varianceAccountCode;
        creditAcc = tillAccount.accountCode;
      } else {
        // Excédent : Debit Caisse (1010/1020), Credit 2910 (Compte d'Attente Écarts de Caisse)
        debitAcc = tillAccount.accountCode;
        creditAcc = varianceAccountCode;
      }

      const varianceGlId = `gl_variance_${sessionId}`;
      const rawVarianceTx: LedgerTransaction = {
        id: varianceGlId,
        business_id: till.business_id,
        businessId: till.business_id,
        branchId: till.branch_id || "MAIN_BRANCH",
        branch_id: till.branch_id || "MAIN_BRANCH",
        departmentId: "counter",
        department_id: "counter",
        date: (currentSession.business_date || now).slice(0, 10),
        description: `[ÉCART DE CAISSE ${varianceType}] Clôture ${till.name} - Écart : ${(discrepancyCents / 100).toLocaleString()} ${till.currency} (Physique: ${(actualClosingCents / 100).toLocaleString()}, Théorique: ${(expectedClosingCents / 100).toLocaleString()})`,
        amount: varianceAbsCents / 100,
        amount_cents: varianceAbsCents,
        currency: till.currency,
        type: varianceType === "SHORTAGE" ? "EXPENSE" : "INCOME",
        category: "CASH_VARIANCE",
        status: "POSTED",
        debit_account: debitAcc,
        credit_account: creditAcc,
        debit_account_code: debitAcc,
        credit_account_code: creditAcc,
        debit: varianceAbsCents / 100,
        credit: varianceAbsCents / 100,
        debit_cents: varianceAbsCents,
        credit_cents: varianceAbsCents,
        debit_amount_cents: varianceAbsCents,
        credit_amount_cents: varianceAbsCents,
        source: "SYSTEM",
        signerId: operatorId.trim(),
        createdBy: operatorName.trim(),
        referenceTransactionId: sessionId,
        isImmutable: true,
        metadata: {
          sessionId,
          tillId: till.id,
          business_id: till.business_id,
          currency: till.currency,
          varianceType,
          discrepancyCents,
          expectedClosingCents,
          actualClosingCents,
          notes: notes?.trim()
        }
      };

      const enrichedVarianceTx = sanitizeAndEnrichLedgerTransaction(rawVarianceTx, till.business_id);
      const fkValidation = validateLedgerForeignKeys(enrichedVarianceTx as any);
      if (!fkValidation.isValid) {
        throw new FinopsException(
          "INVALID_VARIANCE_LEDGER_ENTRY",
          `Échec de validation comptable de l'écriture d'écart : ${fkValidation.errors.join("; ")}`
        );
      }

      varianceLedgerTx = enrichedVarianceTx;
      varianceOutboxEvent = {
        eventId: `evt_tx_${varianceGlId}`,
        correlationId: `corr_tx_${varianceGlId}`,
        businessId: till.business_id,
        module: "FINANCIAL_LEDGER",
        aggregate: "LedgerTransaction",
        type: "LEDGER_TRANSACTION_RECORDED",
        eventType: "LEDGER_TRANSACTION_RECORDED",
        source: "TillSessionEngine",
        payload: {
          transactionId: varianceGlId,
          sessionId,
          tillId: till.id,
          amount: varianceLedgerTx.amount,
          amount_cents: varianceLedgerTx.amount_cents,
          type: varianceLedgerTx.type,
          businessId: till.business_id
        },
        version: "1.0.0",
        status: "PENDING",
        timestamp: now
      };
    }

    const finalSessionStatus = discrepancyCents === 0 ? "CLOSED_MATCHED" : "CLOSED_DISCREPANCY";
    const closedSession: TillSession = {
      ...currentSession,
      closed_at: now,
      total_inflows_cents: totalInflowsCents,
      total_outflows_cents: totalOutflowsCents,
      expected_closing_cents: expectedClosingCents,
      actual_closing_cents: actualClosingCents,
      discrepancy_cents: discrepancyCents,
      variance_type: varianceType,
      variance_ledger_tx_id: varianceLedgerTx?.id,
      variance_account_code: discrepancyCents !== 0 ? "2910" : undefined,
      denomination_breakdown: denominationBreakdown,
      status: finalSessionStatus,
      notes: notes?.trim()
    };

    const closedTill: CashTill = {
      ...till,
      type: "TILL",
      linked_account_code: till.linked_account_code || tillAccount.accountCode,
      linked_account_name: till.linked_account_name || tillAccount.accountName,
      status: "CLOSED",
      balance_cents: actualClosingCents,
      active_session_id: undefined,
      updated_at: now
    };

    return {
      closedSession,
      closedTill,
      varianceLedgerTx,
      varianceOutboxEvent,
      expectedClosingCents,
      discrepancyCents,
      varianceType
    };
  }

  /**
   * Pure validation and state construction for Till Session Reopening (D3-D / D3.1-G).
   * Explicitly distinguishes and validates:
   * - requesterId: employee/teller requesting the reopen and becoming newSession.teller_id
   * - approverId: authenticated supervisor approving the reopen (must != requesterId and != prevSession.teller_id)
   */
  private static evaluateReopen(args: {
    params: ReopenSessionParams;
    till: CashTill | null;
    prevSession: TillSession | null;
    existingReopenedSessionExists: boolean;
    requesterRecord?: Record<string, any> | null;
    requireVerifiedRequesterRecord?: boolean;
    now: string;
  }): {
    updatedPrevSession: TillSession;
    newSession: TillSession;
    reopenedTill: CashTill;
  } {
    const {
      params,
      till,
      prevSession,
      existingReopenedSessionExists,
      requesterRecord,
      requireVerifiedRequesterRecord,
      now
    } = args;
    const {
      tillId,
      previousSessionId,
      requesterId,
      requesterName,
      approverId,
      approverName,
      approverRole,
      authenticatedApproverUid,
      reason
    } = params;

    if (!tillId || typeof tillId !== "string" || !tillId.trim()) {
      throw new FinopsException("INVALID_TILL_ID", "Identifiant de caisse manquant ou invalide.");
    }

    if (!previousSessionId || typeof previousSessionId !== "string" || !previousSessionId.trim()) {
      throw new FinopsException("INVALID_SESSION_ID", "Identifiant de session précédente manquant ou invalide.");
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      throw new FinopsException(
        "REOPEN_REASON_REQUIRED",
        "Un motif explicite est strictement obligatoire pour rouvrir une caisse déjà clôturée."
      );
    }

    if (!requesterId || typeof requesterId !== "string" || !requesterId.trim()) {
      throw new FinopsException(
        "INVALID_REQUESTER_ID",
        "Identifiant du demandeur (requesterId) manquant ou invalide."
      );
    }

    if (!approverId || typeof approverId !== "string" || !approverId.trim()) {
      throw new FinopsException(
        "UNAUTHORIZED_APPROVER",
        "Identifiant de l'approbateur (approverId) requis pour la réouverture."
      );
    }

    if (
      authenticatedApproverUid !== undefined &&
      approverId.trim() !== authenticatedApproverUid.trim()
    ) {
      throw new FinopsException(
        "IDENTITY_SPOOFING_DETECTED",
        `L'approbateur déclaré (${approverId}) ne correspond pas à l'utilisateur authentifié (${authenticatedApproverUid}).`
      );
    }

    // Maker-checker separation on reopening
    if (requesterId.trim() === approverId.trim()) {
      throw new FinopsException(
        "MAKER_CHECKER_VIOLATION",
        "Séparation des tâches : L'opérateur qui demande la réouverture ne peut pas approuver sa propre demande."
      );
    }

    const normApproverRole = String(approverRole || "").trim().toUpperCase();
    if (!AUTHORIZED_REOPEN_ROLES.has(normApproverRole)) {
      throw new FinopsException(
        "UNAUTHORIZED_APPROVER",
        `Rôle [${approverRole}] non autorisé à rouvrir une session de caisse clôturée.`
      );
    }

    if (!till) {
      throw new FinopsException("TILL_NOT_FOUND", `Caisse [${tillId}] introuvable.`);
    }

    if (!prevSession) {
      throw new FinopsException("PREVIOUS_SESSION_NOT_FOUND", "Session précédente introuvable.");
    }

    const tillBizId = (till.business_id || "").trim();
    const sessionBizId = (prevSession.business_id || "").trim();
    if (!tillBizId || !sessionBizId || tillBizId !== sessionBizId) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        "Incohérence multi-tenant entre la caisse et la session précédente."
      );
    }

    if (params.businessId !== undefined) {
      const reqBizId = String(params.businessId || "").trim();
      if (!reqBizId || reqBizId !== tillBizId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Accès inter-tenant refusé : la caisse [${tillId}] n'appartient pas au tenant [${reqBizId}].`
        );
      }
    }

    if (prevSession.till_id !== till.id) {
      throw new FinopsException(
        "SESSION_TILL_MISMATCH",
        `La session [${previousSessionId}] n'appartient pas à la caisse [${till.id}].`
      );
    }

    if (approverId.trim() === (prevSession.teller_id || "").trim()) {
      throw new FinopsException(
        "MAKER_CHECKER_VIOLATION",
        "Séparation des tâches : Le guichetier titulaire de la session clôturée ne peut pas approuver sa propre réouverture."
      );
    }

    // D3.1-G: Validate requesterId existence, tenant membership, active status, and role
    const cleanRequesterId = requesterId.trim();
    const isPrevSessionTeller =
      cleanRequesterId === (prevSession.teller_id || "").trim() ||
      cleanRequesterId === (till.assigned_teller_id || "").trim();

    if (requesterRecord) {
      const reqRecordBizId = String(
        requesterRecord.business_id || requesterRecord.businessId || ""
      ).trim();
      if (!reqRecordBizId || reqRecordBizId !== tillBizId) {
        throw new FinopsException(
          "TENANT_ISOLATION_VIOLATION",
          `Le demandeur [${cleanRequesterId}] n'appartient pas au tenant [${tillBizId}].`
        );
      }

      const rawStatus = String(
        requesterRecord.status || requesterRecord.employmentStatus || "ACTIVE"
      )
        .trim()
        .toUpperCase();
      if (
        INACTIVE_ENTITY_STATUSES.has(rawStatus) ||
        requesterRecord.isActive === false ||
        requesterRecord.disabled === true
      ) {
        throw new FinopsException(
          "INACTIVE_REQUESTER",
          `Le demandeur [${cleanRequesterId}] est inactif ou suspendu (statut : '${rawStatus}').`
        );
      }

      const reqRole = String(requesterRecord.role || "").trim().toUpperCase();
      if (reqRole && !ALLOWED_CLOSURE_ROLES.has(reqRole)) {
        throw new FinopsException(
          "UNAUTHORIZED_REQUESTER_ROLE",
          `Le rôle [${reqRole}] du demandeur [${cleanRequesterId}] n'est pas autorisé à opérer une session de caisse.`
        );
      }
    } else if (requireVerifiedRequesterRecord || !isPrevSessionTeller) {
      throw new FinopsException(
        "REQUESTER_NOT_FOUND",
        `Le demandeur [${cleanRequesterId}] est introuvable dans le référentiel des employés/utilisateurs du tenant [${tillBizId}].`
      );
    }

    if (prevSession.status === "REOPENED" || existingReopenedSessionExists) {
      throw new FinopsException(
        "SESSION_ALREADY_REOPENED",
        `La session [${previousSessionId}] a déjà été rouverte.`
      );
    }

    if (prevSession.status !== "CLOSED_MATCHED" && prevSession.status !== "CLOSED_DISCREPANCY") {
      throw new FinopsException(
        "SESSION_NOT_CLOSED",
        `La session [${previousSessionId}] n'est pas dans un statut clôturé ('${prevSession.status}').`
      );
    }

    if (till.status === "OPEN") {
      throw new FinopsException(
        "TILL_ALREADY_OPEN",
        `La caisse [${till.id}] est déjà ouverte (session active : ${till.active_session_id}).`
      );
    }

    const resolvedRequesterName =
      (requesterRecord?.name ||
        requesterRecord?.displayName ||
        requesterName ||
        cleanRequesterId).trim();

    // 1. Mark previous session as REOPENED without erasing its historical figures or variance GL link
    const updatedPrevSession: TillSession = {
      ...prevSession,
      status: "REOPENED",
      reopened_at: now,
      reopened_by_id: cleanRequesterId,
      reopened_by_name: resolvedRequesterName,
      reopen_approver_id: approverId.trim(),
      reopen_approver_name: (approverName || approverId).trim(),
      reopen_reason: reason.trim()
    };

    // 2. Deterministic ID for the reopened session to prevent duplicate reopened sessions on retry
    const newSessionId = `sess_reopen_${previousSessionId}`;
    const newSession: TillSession = {
      id: newSessionId,
      business_id: till.business_id,
      branch_id: till.branch_id,
      till_id: till.id,
      till_name: till.name,
      teller_id: cleanRequesterId,
      teller_name: resolvedRequesterName,
      currency: till.currency,
      business_date: prevSession.business_date || getHaitiDateString(),
      opened_at: now,
      opening_balance_cents: till.balance_cents,
      total_inflows_cents: 0,
      total_outflows_cents: 0,
      expected_closing_cents: till.balance_cents,
      previous_session_id: previousSessionId,
      reopened_from_session_id: previousSessionId,
      status: "ACTIVE",
      notes: `Session rouverte sur autorisation de ${(approverName || approverId).trim()}. Motif : ${reason.trim()}`
    };

    const reopenedTill: CashTill = {
      ...till,
      status: "OPEN",
      active_session_id: newSessionId,
      updated_at: now
    };

    return { updatedPrevSession, newSession, reopenedTill };
  }

  /**
   * Opens a new Till Session with strict state validation (CLOSED -> OPEN).
   */
  public static async openSession(params: OpenSessionParams): Promise<{ till: CashTill; session: TillSession }> {
    const { tillId, operatorId, operatorName, openingBalanceCents } = params;

    if (
      typeof openingBalanceCents !== "number" ||
      !Number.isFinite(openingBalanceCents) ||
      !Number.isSafeInteger(openingBalanceCents) ||
      openingBalanceCents < 0 ||
      openingBalanceCents > MAX_CLOSING_AMOUNT_CENTS
    ) {
      throw new FinopsException(
        "INVALID_OPENING_BALANCE",
        "Le solde d'ouverture doit être un entier positif ou nul en centimes."
      );
    }

    const till = await CashManagementRepository.getTillById(tillId);
    if (!till) {
      throw new FinopsException("TILL_NOT_FOUND", `La caisse [${tillId}] est introuvable.`);
    }

    if (params.businessId && params.businessId.trim() !== till.business_id) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `La caisse [${tillId}] n'appartient pas au tenant [${params.businessId}].`
      );
    }

    if (till.status === "OPEN") {
      throw new FinopsException(
        "TILL_ALREADY_OPEN",
        `La caisse "${till.name}" a déjà une session active ouverte (${till.active_session_id}). Clôturez-la avant d'ouvrir une nouvelle session.`
      );
    }

    const now = new Date().toISOString();
    const businessDate = params.businessDate || getHaitiDateString();
    const sessionId = `sess_${till.business_id}_${till.id}_${Date.now()}`;

    const newSession: TillSession = {
      id: sessionId,
      business_id: till.business_id,
      branch_id: till.branch_id,
      till_id: till.id,
      till_name: till.name,
      teller_id: operatorId,
      teller_name: operatorName,
      currency: till.currency,
      business_date: businessDate,
      opened_at: now,
      opening_balance_cents: openingBalanceCents,
      total_inflows_cents: 0,
      total_outflows_cents: 0,
      expected_closing_cents: openingBalanceCents,
      status: "ACTIVE"
    };

    const updatedTill: CashTill = {
      ...till,
      status: "OPEN",
      assigned_teller_id: operatorId,
      assigned_teller_name: operatorName,
      balance_cents: openingBalanceCents,
      active_session_id: sessionId,
      updated_at: now
    };

    await CashManagementRepository.saveSession(newSession);
    await CashManagementRepository.saveTill(updatedTill);

    // Forensic audit log
    try {
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: till.business_id,
        actorId: operatorId,
        userName: operatorName,
        userRole: params.operatorRole || "TELLER",
        action: "TILL_SESSION_OPENED",
        details: `Ouverture officielle de la caisse ${till.name} pour la journée d'exploitation ${businessDate}. Solde initial déclaré : ${(openingBalanceCents / 100).toLocaleString()} ${till.currency}.`,
        afterState: { sessionId, tillId: till.id, openingBalanceCents, status: "OPEN" },
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (fErr) {
      console.warn("[TillSessionEngine] Audit log warning:", fErr);
    }

    return { till: updatedTill, session: newSession };
  }

  /**
   * Controlled Frontend-to-Server API method for Till Session Closure (D3.1-B).
   * Eliminates direct client-side Firestore writes in the UI closure workflow.
   */
  public static async closeSessionViaApi(
    params: CloseSessionParams
  ): Promise<{ till: CashTill; session: TillSession; varianceLedgerTx?: LedgerTransaction }> {
    const { auth } = await import("../../../lib/firebase");
    const currentUser = auth?.currentUser;
    const token = currentUser ? await currentUser.getIdToken() : "";

    if (!token) {
      const authErr = new FinopsException(
        "UNAUTHORIZED",
        "Authentification requise pour clôturer la session de caisse."
      );
      (authErr as any).status = 401;
      throw authErr;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
    if (params.businessId && params.businessId.trim()) {
      headers["x-business-id"] = params.businessId.trim();
    }

    const response = await fetch(this.CLOSE_SESSION_API_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sessionId: params.sessionId,
        tillId: params.tillId,
        businessId: params.businessId,
        currency: params.currency,
        actualClosingCents: params.actualClosingCents,
        denominationBreakdown: params.denominationBreakdown,
        operatorName: params.operatorName,
        notes: params.notes,
        idempotencyKey: params.idempotencyKey
      })
    });

    let payload: any = null;
    const rawText = await response.text();
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }

    if (!response.ok || !payload || payload.success !== true) {
      const errCode = payload?.error || payload?.code || `HTTP_${response.status}`;
      const errMsg =
        payload?.message ||
        payload?.error ||
        `Échec de la clôture serveur (HTTP ${response.status}).`;
      const serverErr = new FinopsException(errCode, errMsg);
      (serverErr as any).status = response.status;
      throw serverErr;
    }

    return {
      till: payload.till as CashTill,
      session: payload.session as TillSession,
      varianceLedgerTx: payload.varianceLedgerTx as LedgerTransaction | undefined
    };
  }

  /**
   * Controlled Frontend-to-Server API method for Till Session Reopening (D3.1-B / D3.1-G).
   */
  public static async reopenSessionViaApi(
    params: ReopenSessionParams
  ): Promise<{ till: CashTill; newSession: TillSession }> {
    const { auth } = await import("../../../lib/firebase");
    const currentUser = auth?.currentUser;
    const token = currentUser ? await currentUser.getIdToken() : "";

    if (!token) {
      const authErr = new FinopsException(
        "UNAUTHORIZED",
        "Authentification requise pour rouvrir la session de caisse."
      );
      (authErr as any).status = 401;
      throw authErr;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
    if (params.businessId && params.businessId.trim()) {
      headers["x-business-id"] = params.businessId.trim();
    }

    const response = await fetch(this.REOPEN_SESSION_API_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tillId: params.tillId,
        previousSessionId: params.previousSessionId,
        businessId: params.businessId,
        requesterId: params.requesterId,
        requesterName: params.requesterName,
        approverName: params.approverName,
        reason: params.reason,
        idempotencyKey: params.idempotencyKey
      })
    });

    let payload: any = null;
    const rawText = await response.text();
    if (rawText && rawText.trim().startsWith("{")) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }

    if (!response.ok || !payload || payload.success !== true) {
      const errCode = payload?.error || payload?.code || `HTTP_${response.status}`;
      const errMsg =
        payload?.message ||
        payload?.error ||
        `Échec de la réouverture serveur (HTTP ${response.status}).`;
      const serverErr = new FinopsException(errCode, errMsg);
      (serverErr as any).status = response.status;
      throw serverErr;
    }

    return {
      till: payload.till as CashTill,
      newSession: payload.newSession as TillSession
    };
  }

  /**
   * Closes a Till Session (domain/unit-test method) by deriving expected balance from authoritative transactions,
   * verifying zero pending operations (D3-A), enforcing atomic & idempotent writes (D3-B / D3.1-C),
   * validating denomination & currency invariants (D3-C / D3.1-E), and posting balanced variance GL entry on 2910.
   */
  public static async closeSession(
    params: CloseSessionParams
  ): Promise<{ till: CashTill; session: TillSession; varianceLedgerTx?: LedgerTransaction }> {
    const lockKeys = [`session:${params.sessionId}`];
    if (params.tillId) lockKeys.push(`till:${params.tillId}`);

    this.acquireLocks(lockKeys);
    let extraTillLock: string | null = null;

    try {
      // 1. Fetch Session directly (propagate read errors without swallowing)
      const sessionRef = doc(db, "till_sessions", params.sessionId || "__missing__");
      const sessionSnap = await getDoc(sessionRef);
      const currentSession = sessionSnap.exists()
        ? ({ id: sessionSnap.id || params.sessionId, ...sessionSnap.data() } as TillSession)
        : null;

      if (currentSession?.till_id && `till:${currentSession.till_id}` !== `till:${params.tillId}`) {
        extraTillLock = `till:${currentSession.till_id}`;
        this.acquireLocks([extraTillLock]);
      }

      // 2. Fetch Till directly (without swallowing errors)
      let till: CashTill | null = null;
      if (currentSession?.till_id) {
        const tillRef = doc(db, "cash_tills", currentSession.till_id);
        const tillSnap = await getDoc(tillRef);
        if (tillSnap.exists()) {
          till = { id: tillSnap.id || currentSession.till_id, ...tillSnap.data() } as CashTill;
        }
      }

      // 3. Check if variance GL entry or deterministic outbox event already exists
      const varianceGlId = `gl_variance_${params.sessionId}`;
      const varianceGlRef = doc(db, "ledger_transactions", varianceGlId);
      const existingVarianceGlSnap = await getDoc(varianceGlRef);
      const existingVarianceGlExists = existingVarianceGlSnap.exists();

      const outboxEventId = `evt_tx_${varianceGlId}`;
      const outboxRef = currentSession?.business_id
        ? doc(db, "businesses", currentSession.business_id, "event_outbox", outboxEventId)
        : null;
      const existingOutboxSnap = outboxRef ? await getDoc(outboxRef) : null;
      const existingVarianceOutboxExists = Boolean(existingOutboxSnap?.exists());

      // 4. Query authoritative movements & transfers (NEVER swallow read errors during closure)
      let tellerTxs: TellerTransaction[] = [];
      let internalTransfers: InternalTransfer[] = [];
      let customerTransfers: CustomerTransfer[] = [];

      if (currentSession?.business_id) {
        const tellerQuery = query(
          collection(db, "teller_transactions"),
          where("business_id", "==", currentSession.business_id),
          where("session_id", "==", params.sessionId)
        );
        const tellerSnap = await getDocs(tellerQuery);
        tellerTxs = tellerSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TellerTransaction));

        const transfersQuery = query(
          collection(db, "internal_transfers"),
          where("business_id", "==", currentSession.business_id)
        );
        const transfersSnap = await getDocs(transfersQuery);
        internalTransfers = transfersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as InternalTransfer));

        const custTransfersQuery = query(
          collection(db, "customer_transfers"),
          where("business_id", "==", currentSession.business_id)
        );
        const custTransfersSnap = await getDocs(custTransfersQuery);
        customerTransfers = custTransfersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerTransfer));
      }

      const now = new Date().toISOString();

      // 5. Evaluate all D3-A, D3-B, D3-C, D3.1-E invariants before any write occurs
      const evaluated = this.evaluateClosure({
        params,
        currentSession,
        till,
        tellerTxs,
        internalTransfers,
        customerTransfers,
        existingVarianceGlExists,
        existingVarianceOutboxExists,
        now
      });

      const {
        closedSession,
        closedTill,
        varianceLedgerTx,
        varianceOutboxEvent,
        expectedClosingCents,
        discrepancyCents,
        varianceType
      } = evaluated;

      // Capture exact pre-commit state snapshots to guarantee atomic rollback if any step fails
      const sessionBeforeSnapshot = structuredClone(currentSession!);
      const tillBeforeSnapshot = structuredClone(till!);
      let sessionWritten = false;
      let tillWritten = false;
      let glWritten = false;
      let outboxWritten = false;

      try {
        await runTransaction(db, async (tx) => {
          const freshSessionSnap = await tx.get(sessionRef);
          if (!freshSessionSnap.exists()) {
            throw new FinopsException("SESSION_NOT_FOUND", `La session [${params.sessionId}] est introuvable.`);
          }
          const freshSession = freshSessionSnap.data() as TillSession;
          if (
            freshSession.status !== "ACTIVE" &&
            freshSession.status !== "CLOSURE_REQUESTED" &&
            freshSession.status !== "PENDING_APPROVAL"
          ) {
            throw new FinopsException(
              "SESSION_ALREADY_CLOSED",
              `La session [${params.sessionId}] a été modifiée concurremment (statut : '${freshSession.status}').`
            );
          }

          const tillRef = doc(db, "cash_tills", closedTill.id);
          const freshTillSnap = await tx.get(tillRef);
          if (!freshTillSnap.exists()) {
            throw new FinopsException("TILL_NOT_FOUND", `Caisse [${closedTill.id}] introuvable.`);
          }
          const freshTill = freshTillSnap.data() as CashTill;
          if (freshTill.status !== "OPEN" || freshTill.balance_cents !== expectedClosingCents) {
            throw new FinopsException(
              "CONCURRENT_CLOSURE_CONFLICT",
              `L'état de la caisse [${closedTill.id}] a changé concurremment pendant la clôture.`
            );
          }

          if (varianceLedgerTx) {
            const freshGlSnap = await tx.get(varianceGlRef);
            if (freshGlSnap.exists()) {
              throw new FinopsException(
                "DUPLICATE_VARIANCE_GL_ENTRY",
                `L'écriture d'écart [${varianceGlId}] existe déjà.`
              );
            }
            if (outboxRef) {
              const freshOutboxSnap = await tx.get(outboxRef);
              if (freshOutboxSnap.exists()) {
                throw new FinopsException(
                  "DUPLICATE_VARIANCE_GL_ENTRY",
                  `L'événement outbox [${outboxEventId}] existe déjà.`
                );
              }
            }
          }

          // All reads completed; execute writes in deterministic order
          tx.set(sessionRef, closedSession);
          sessionWritten = true;

          tx.set(tillRef, closedTill);
          tillWritten = true;

          if (varianceLedgerTx && varianceOutboxEvent) {
            glWritten = true;
            outboxWritten = true;
            await LedgerRepository.save(varianceLedgerTx, varianceOutboxEvent);
            tx.set(varianceGlRef, varianceLedgerTx);
            if (outboxRef) {
              tx.set(outboxRef, {
                ...varianceOutboxEvent,
                status: "PENDING",
                createdAt: now
              });
            }
          }
        });
      } catch (commitErr) {
        // Compensating rollback in case a non-transactional mock mutated state before failure (including event_outbox)
        try {
          if (tillWritten || sessionWritten || glWritten || outboxWritten) {
            await setDoc(sessionRef, sessionBeforeSnapshot);
            await setDoc(doc(db, "cash_tills", tillBeforeSnapshot.id), tillBeforeSnapshot);
            if (glWritten && !existingVarianceGlExists) {
              await deleteDoc(varianceGlRef);
            }
            if (outboxWritten && outboxRef && !existingVarianceOutboxExists) {
              await deleteDoc(outboxRef);
            }
          }
        } catch (rollbackErr) {
          console.error("[TillSessionEngine.closeSession] Rollback error:", rollbackErr);
        }
        throw commitErr;
      }

      // 6. Forensic Audit Log (non-blocking)
      try {
        const log = await ForensicLogRepository.createAndSignLog({
          business_id: closedTill.business_id,
          actorId: params.operatorId,
          userName: params.operatorName,
          userRole: params.operatorRole || "TELLER",
          action: "TILL_SESSION_CLOSED",
          details: `Clôture officielle caisse ${closedTill.name}. Comptage physique certifié : ${(params.actualClosingCents / 100).toLocaleString()} ${closedTill.currency}. Théorique GL : ${(expectedClosingCents / 100).toLocaleString()} ${closedTill.currency}. Écart : ${(discrepancyCents / 100).toLocaleString()} ${closedTill.currency} (${varianceType}).`,
          afterState: {
            sessionId: params.sessionId,
            tillId: closedTill.id,
            status: closedSession.status,
            expectedClosingCents,
            actualClosingCents: params.actualClosingCents,
            discrepancyCents,
            result: "SUCCESS"
          },
          timestamp: now
        });
        await ForensicLogRepository.writeForensicLog(log);
      } catch (fErr) {
        console.warn("[TillSessionEngine] Audit log warning:", fErr);
      }

      return { till: closedTill, session: closedSession, varianceLedgerTx };
    } finally {
      if (extraTillLock) {
        this.releaseLocks([extraTillLock]);
      }
      this.releaseLocks(lockKeys);
    }
  }

  /**
   * Server-side Admin SDK transactional execution for Till Session Closure (D3-A, D3-B, D3-C, D3.1-A, D3.1-C, D3.1-D, D3.1-E, D3.1-H).
   * Executes all document and query reads (via tx.get) BEFORE all writes (till_sessions, cash_tills, ledger_transactions, event_outbox)
   * inside a single native Firebase Admin SDK transaction.
   */
  public static async closeSessionWithAdmin(
    adminDb: any,
    params: CloseSessionParams
  ): Promise<{ till: CashTill; session: TillSession; varianceLedgerTx?: LedgerTransaction }> {
    const lockKeys = [`session:${params.sessionId}`];
    if (params.tillId) lockKeys.push(`till:${params.tillId}`);

    this.acquireLocks(lockKeys);
    let extraTillLock: string | null = null;

    try {
      const sessionRef = adminDb.doc(`till_sessions/${params.sessionId || "__missing__"}`);
      const preSessionSnap = await sessionRef.get();
      const preSession = preSessionSnap.exists
        ? ({ id: preSessionSnap.id || params.sessionId, ...preSessionSnap.data() } as TillSession)
        : null;

      if (preSession?.till_id && `till:${preSession.till_id}` !== `till:${params.tillId}`) {
        extraTillLock = `till:${preSession.till_id}`;
        this.acquireLocks([extraTillLock]);
      }

      const now = new Date().toISOString();

      const result = await adminDb.runTransaction(async (tx: any) => {
        // 1. All Transactional Reads First (D3.1-D)
        const sessionSnap = await tx.get(sessionRef);
        const currentSession = sessionSnap.exists
          ? ({ id: sessionSnap.id || params.sessionId, ...sessionSnap.data() } as TillSession)
          : null;

        let till: CashTill | null = null;
        let tillRef: any = null;
        if (currentSession?.till_id) {
          tillRef = adminDb.doc(`cash_tills/${currentSession.till_id}`);
          const tillSnap = await tx.get(tillRef);
          if (tillSnap.exists) {
            till = { id: tillSnap.id || currentSession.till_id, ...tillSnap.data() } as CashTill;
          }
        }

        const varianceGlId = `gl_variance_${params.sessionId}`;
        const varianceGlRef = adminDb.doc(`ledger_transactions/${varianceGlId}`);
        const existingGlSnap = await tx.get(varianceGlRef);
        const existingVarianceGlExists = Boolean(existingGlSnap.exists);

        const outboxEventId = `evt_tx_${varianceGlId}`;
        const outboxRef = currentSession?.business_id
          ? adminDb.doc(`businesses/${currentSession.business_id}/event_outbox/${outboxEventId}`)
          : null;
        const existingOutboxSnap = outboxRef ? await tx.get(outboxRef) : null;
        const existingVarianceOutboxExists = Boolean(existingOutboxSnap?.exists);

        let tellerTxs: TellerTransaction[] = [];
        let internalTransfers: InternalTransfer[] = [];
        let customerTransfers: CustomerTransfer[] = [];

        if (currentSession?.business_id) {
          const tellerQuery = adminDb
            .collection("teller_transactions")
            .where("business_id", "==", currentSession.business_id);
          const tellerSnap = await tx.get(tellerQuery);
          tellerTxs = (tellerSnap.docs || [])
            .map((d: any) => ({ id: d.id, ...d.data() } as TellerTransaction))
            .filter((t: TellerTransaction) => t.session_id === params.sessionId);

          const trfQuery = adminDb
            .collection("internal_transfers")
            .where("business_id", "==", currentSession.business_id);
          const trfSnap = await tx.get(trfQuery);
          internalTransfers = (trfSnap.docs || []).map(
            (d: any) => ({ id: d.id, ...d.data() } as InternalTransfer)
          );

          const custQuery = adminDb
            .collection("customer_transfers")
            .where("business_id", "==", currentSession.business_id);
          const custSnap = await tx.get(custQuery);
          customerTransfers = (custSnap.docs || []).map(
            (d: any) => ({ id: d.id, ...d.data() } as CustomerTransfer)
          );
        }

        // 2. Pure Validation & Variance / Balance Calculation
        const evaluated = this.evaluateClosure({
          params,
          currentSession,
          till,
          tellerTxs,
          internalTransfers,
          customerTransfers,
          existingVarianceGlExists,
          existingVarianceOutboxExists,
          now
        });

        // 3. All Transactional Writes in a Single Atomic Transaction (D3.1-C)
        tx.set(sessionRef, evaluated.closedSession);
        tx.set(tillRef, evaluated.closedTill);

        if (evaluated.varianceLedgerTx && evaluated.varianceOutboxEvent && outboxRef) {
          tx.set(varianceGlRef, evaluated.varianceLedgerTx);
          tx.set(outboxRef, {
            ...evaluated.varianceOutboxEvent,
            status: "PENDING",
            createdAt: now
          });
        }

        return {
          till: evaluated.closedTill,
          session: evaluated.closedSession,
          varianceLedgerTx: evaluated.varianceLedgerTx,
          expectedClosingCents: evaluated.expectedClosingCents,
          discrepancyCents: evaluated.discrepancyCents,
          varianceType: evaluated.varianceType
        };
      });

      // 4. Emit Cryptographically Signed ForensicLog on Admin SDK Path (D3.1-H)
      await this.recordAdminForensicEvent(adminDb, {
        businessId: result.till.business_id,
        actorId: params.operatorId,
        actorName: params.operatorName,
        actorRole: params.operatorRole || "TELLER",
        action: "TILL_SESSION_CLOSED",
        sessionId: params.sessionId,
        tillId: result.till.id,
        result: "SUCCESS",
        details: `Clôture officielle caisse ${result.till.name}. Comptage physique certifié : ${(params.actualClosingCents / 100).toLocaleString()} ${result.till.currency}. Théorique GL : ${(result.expectedClosingCents / 100).toLocaleString()} ${result.till.currency}. Écart : ${(result.discrepancyCents / 100).toLocaleString()} ${result.till.currency} (${result.varianceType}).`,
        afterState: {
          sessionId: params.sessionId,
          tillId: result.till.id,
          status: result.session.status,
          expectedClosingCents: result.expectedClosingCents,
          actualClosingCents: params.actualClosingCents,
          discrepancyCents: result.discrepancyCents,
          varianceLedgerTxId: result.varianceLedgerTx?.id || null
        },
        timestamp: now
      });

      return {
        till: result.till,
        session: result.session,
        varianceLedgerTx: result.varianceLedgerTx
      };
    } finally {
      if (extraTillLock) {
        this.releaseLocks([extraTillLock]);
      }
      this.releaseLocks(lockKeys);
    }
  }

  /**
   * Reopens a closed till with mandatory authorization, Maker-Checker separation,
   * requester validation, tenant isolation, idempotency protection, and immutable audit trail (D3-D / D3.1-G).
   * Does NOT delete or mutate historical closure figures or variance GL entries.
   */
  public static async reopenSession(
    params: ReopenSessionParams
  ): Promise<{ till: CashTill; newSession: TillSession }> {
    const lockKeys = [`till:${params.tillId}`, `session:${params.previousSessionId}`];
    this.acquireLocks(lockKeys);

    try {
      const tillRef = doc(db, "cash_tills", params.tillId || "__missing__");
      const tillSnap = await getDoc(tillRef);
      const till = tillSnap.exists()
        ? ({ id: tillSnap.id || params.tillId, ...tillSnap.data() } as CashTill)
        : null;

      const prevSessionRef = doc(db, "till_sessions", params.previousSessionId || "__missing__");
      const prevSnap = await getDoc(prevSessionRef);
      const prevSession = prevSnap.exists()
        ? ({ id: prevSnap.id || params.previousSessionId, ...prevSnap.data() } as TillSession)
        : null;

      const newSessionId = `sess_reopen_${params.previousSessionId}`;
      const newSessionRef = doc(db, "till_sessions", newSessionId);
      const existingReopenedSnap = await getDoc(newSessionRef);
      const existingReopenedSessionExists = existingReopenedSnap.exists();

      let requesterRecord: Record<string, any> | null = null;
      const cleanReqId = typeof params.requesterId === "string" ? params.requesterId.trim() : "";
      if (cleanReqId) {
        const empSnap = await getDoc(doc(db, "employees", cleanReqId));
        if (empSnap.exists()) {
          requesterRecord = { id: empSnap.id, ...empSnap.data() };
        } else {
          const usrSnap = await getDoc(doc(db, "users", cleanReqId));
          if (usrSnap.exists()) {
            requesterRecord = { id: usrSnap.id, ...usrSnap.data() };
          }
        }
      }

      const now = new Date().toISOString();

      const { updatedPrevSession, newSession, reopenedTill } = this.evaluateReopen({
        params,
        till,
        prevSession,
        existingReopenedSessionExists,
        requesterRecord,
        requireVerifiedRequesterRecord: false,
        now
      });

      const prevSessionBefore = structuredClone(prevSession!);
      const tillBefore = structuredClone(till!);
      let prevWritten = false;
      let newWritten = false;
      let tillWritten = false;

      try {
        await runTransaction(db, async (tx) => {
          const freshPrevSnap = await tx.get(prevSessionRef);
          if (!freshPrevSnap.exists()) {
            throw new FinopsException("PREVIOUS_SESSION_NOT_FOUND", "Session précédente introuvable.");
          }
          const freshPrev = freshPrevSnap.data() as TillSession;
          if (freshPrev.status === "REOPENED") {
            throw new FinopsException(
              "SESSION_ALREADY_REOPENED",
              `La session [${params.previousSessionId}] a déjà été rouverte.`
            );
          }

          const freshTillSnap = await tx.get(tillRef);
          if (!freshTillSnap.exists()) {
            throw new FinopsException("TILL_NOT_FOUND", `Caisse [${params.tillId}] introuvable.`);
          }
          const freshTill = freshTillSnap.data() as CashTill;
          if (freshTill.status === "OPEN") {
            throw new FinopsException(
              "TILL_ALREADY_OPEN",
              `La caisse [${params.tillId}] est déjà ouverte.`
            );
          }

          tx.set(prevSessionRef, updatedPrevSession);
          prevWritten = true;

          tx.set(newSessionRef, newSession);
          newWritten = true;

          tx.set(tillRef, reopenedTill);
          tillWritten = true;
        });
      } catch (commitErr) {
        try {
          if (prevWritten || newWritten || tillWritten) {
            await setDoc(prevSessionRef, prevSessionBefore);
            await setDoc(tillRef, tillBefore);
            if (newWritten && !existingReopenedSessionExists) {
              await deleteDoc(newSessionRef);
            }
          }
        } catch (rollbackErr) {
          console.error("[TillSessionEngine.reopenSession] Rollback error:", rollbackErr);
        }
        throw commitErr;
      }

      // Cryptographic Forensic Audit Log
      try {
        const log = await ForensicLogRepository.createAndSignLog({
          business_id: reopenedTill.business_id,
          actorId: params.approverId,
          userName: params.approverName,
          userRole: params.approverRole,
          action: "TILL_SESSION_REOPENED",
          details: `Réouverture exceptionnelle de la caisse ${reopenedTill.name} demandée par ${newSession.teller_name} (${newSession.teller_id}) et approuvée par ${params.approverName}. Motif : ${params.reason.trim()} (Session précédente : ${params.previousSessionId}).`,
          afterState: {
            newSessionId: newSession.id,
            previousSessionId: params.previousSessionId,
            requesterId: newSession.teller_id,
            approverId: params.approverId,
            status: "OPEN",
            result: "SUCCESS"
          },
          timestamp: now
        });
        await ForensicLogRepository.writeForensicLog(log);
      } catch (fErr) {
        console.warn("[TillSessionEngine] Audit log warning:", fErr);
      }

      return { till: reopenedTill, newSession };
    } finally {
      this.releaseLocks(lockKeys);
    }
  }

  /**
   * Server-side Admin SDK transactional execution for Till Session Reopening (D3-D / D3.1-G / D3.1-H).
   */
  public static async reopenSessionWithAdmin(
    adminDb: any,
    params: ReopenSessionParams
  ): Promise<{ till: CashTill; newSession: TillSession }> {
    const lockKeys = [`till:${params.tillId}`, `session:${params.previousSessionId}`];
    this.acquireLocks(lockKeys);

    try {
      const now = new Date().toISOString();
      const tillRef = adminDb.doc(`cash_tills/${params.tillId || "__missing__"}`);
      const prevSessionRef = adminDb.doc(`till_sessions/${params.previousSessionId || "__missing__"}`);
      const newSessionId = `sess_reopen_${params.previousSessionId}`;
      const newSessionRef = adminDb.doc(`till_sessions/${newSessionId}`);
      const cleanReqId =
        typeof params.requesterId === "string" && params.requesterId.trim()
          ? params.requesterId.trim()
          : "__missing__";
      const reqEmpRef = adminDb.doc(`employees/${cleanReqId}`);
      const reqUserRef = adminDb.doc(`users/${cleanReqId}`);

      const result = await adminDb.runTransaction(async (tx: any) => {
        const tillSnap = await tx.get(tillRef);
        const till = tillSnap.exists
          ? ({ id: tillSnap.id || params.tillId, ...tillSnap.data() } as CashTill)
          : null;

        const prevSnap = await tx.get(prevSessionRef);
        const prevSession = prevSnap.exists
          ? ({ id: prevSnap.id || params.previousSessionId, ...prevSnap.data() } as TillSession)
          : null;

        const existingReopenedSnap = await tx.get(newSessionRef);
        const existingReopenedSessionExists = Boolean(existingReopenedSnap.exists);

        const reqEmpSnap = await tx.get(reqEmpRef);
        const reqUserSnap = await tx.get(reqUserRef);
        const requesterRecord = reqEmpSnap.exists
          ? { id: reqEmpSnap.id || cleanReqId, ...reqEmpSnap.data() }
          : reqUserSnap.exists
          ? { id: reqUserSnap.id || cleanReqId, ...reqUserSnap.data() }
          : null;

        const { updatedPrevSession, newSession, reopenedTill } = this.evaluateReopen({
          params,
          till,
          prevSession,
          existingReopenedSessionExists,
          requesterRecord,
          requireVerifiedRequesterRecord: true,
          now
        });

        tx.set(prevSessionRef, updatedPrevSession);
        tx.set(newSessionRef, newSession);
        tx.set(tillRef, reopenedTill);

        return { till: reopenedTill, newSession };
      });

      // Emit Cryptographically Signed ForensicLog on Admin SDK Path (D3.1-H)
      await this.recordAdminForensicEvent(adminDb, {
        businessId: result.till.business_id,
        actorId: params.approverId,
        actorName: params.approverName,
        actorRole: params.approverRole,
        action: "TILL_SESSION_REOPENED",
        sessionId: result.newSession.id,
        tillId: result.till.id,
        result: "SUCCESS",
        details: `Réouverture exceptionnelle de la caisse ${result.till.name} demandée par ${result.newSession.teller_name} (${result.newSession.teller_id}) et approuvée par ${params.approverName}. Motif : ${params.reason.trim()} (Session précédente : ${params.previousSessionId}).`,
        afterState: {
          newSessionId: result.newSession.id,
          previousSessionId: params.previousSessionId,
          requesterId: result.newSession.teller_id,
          approverId: params.approverId,
          status: "OPEN"
        },
        timestamp: now
      });

      return result;
    } finally {
      this.releaseLocks(lockKeys);
    }
  }

  /**
   * Reconstructs the complete authoritative Till Statement from ledger movements and transactions.
   */
  public static async getTillStatement(
    tillId: string,
    businessId: string,
    startDate?: string,
    endDate?: string
  ): Promise<TillStatement> {
    const till = await CashManagementRepository.getTillById(tillId);
    if (!till) {
      throw new FinopsException("TILL_NOT_FOUND", `Caisse [${tillId}] introuvable.`);
    }

    const tellerTxs = await TellerTransactionEngine.getTransactionsByTill(tillId, businessId, startDate, endDate);
    const transfers = await CashManagementRepository.getTransfersByBusiness(businessId);

    const relevantTransfers = transfers.filter(
      (t) =>
        t.status === "EXECUTED" &&
        (t.source_id === tillId || t.destination_id === tillId) &&
        (!startDate || t.created_at.slice(0, 10) >= startDate) &&
        (!endDate || t.created_at.slice(0, 10) <= endDate)
    );

    const movements: TillStatementMovement[] = [];
    let runningBalanceCents = 0;

    // 1. Resolve Opening Balance for the period (either from a specific session or previous closure)
    let openingCents = 0;
    const sessionRef = doc(db, "till_sessions", tellerTxs[0]?.session_id || "none");
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      openingCents = (sessionSnap.data() as TillSession).opening_balance_cents || 0;
    }
    runningBalanceCents = openingCents;

    // Merge transactions and transfers in chronological order
    const events: Array<{
      date: string;
      type: "TRANSACTION" | "STT" | "TTS";
      item: any;
    }> = [];

    tellerTxs.forEach((tx) => events.push({ date: tx.created_at, type: "TRANSACTION", item: tx }));
    relevantTransfers.forEach((trf) =>
      events.push({
        date: trf.executed_at || trf.created_at,
        type: trf.destination_id === tillId ? "STT" : "TTS",
        item: trf
      })
    );

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let totalInflowsCents = 0;
    let totalOutflowsCents = 0;

    for (const ev of events) {
      if (ev.type === "TRANSACTION") {
        const tx = ev.item;
        const inflow = tx.flow_behavior === 1 ? tx.amount_cents : 0;
        const outflow = tx.flow_behavior === -1 ? tx.amount_cents : 0;
        totalInflowsCents += inflow;
        totalOutflowsCents += outflow;
        runningBalanceCents += inflow - outflow;

        movements.push({
          id: tx.id,
          date: tx.created_at,
          type: "TRANSACTION",
          description: `${tx.transaction_type_name}${tx.customer_name ? ` (Client: ${tx.customer_name})` : ""}`,
          referenceId: tx.ledger_transaction_id,
          inflow_cents: inflow,
          outflow_cents: outflow,
          running_balance_cents: runningBalanceCents,
          currency: till.currency,
          operatorName: tx.operator_name,
          glAccountDebit: tx.debit_account_code,
          glAccountCredit: tx.credit_account_code
        });
      } else if (ev.type === "STT") {
        const trf = ev.item;
        totalInflowsCents += trf.amount_cents;
        runningBalanceCents += trf.amount_cents;

        movements.push({
          id: trf.id,
          date: trf.executed_at || trf.created_at,
          type: "STT",
          description: `Approvisionnement depuis ${trf.source_name}`,
          referenceId: trf.gl_transaction_id || trf.id,
          inflow_cents: trf.amount_cents,
          outflow_cents: 0,
          running_balance_cents: runningBalanceCents,
          currency: till.currency,
          operatorName: trf.initiator_name,
          glAccountDebit: trf.debit_account_code,
          glAccountCredit: trf.credit_account_code
        });
      } else if (ev.type === "TTS") {
        const trf = ev.item;
        totalOutflowsCents += trf.amount_cents;
        runningBalanceCents -= trf.amount_cents;

        movements.push({
          id: trf.id,
          date: trf.executed_at || trf.created_at,
          type: "TTS",
          description: `Versement vers ${trf.destination_name}`,
          referenceId: trf.gl_transaction_id || trf.id,
          inflow_cents: 0,
          outflow_cents: trf.amount_cents,
          running_balance_cents: runningBalanceCents,
          currency: till.currency,
          operatorName: trf.initiator_name,
          glAccountDebit: trf.debit_account_code,
          glAccountCredit: trf.credit_account_code
        });
      }
    }

    return {
      tillId,
      tillName: till.name,
      currency: till.currency,
      startDate: startDate || "",
      endDate: endDate || "",
      openingBalanceCents: openingCents,
      totalInflowsCents,
      totalOutflowsCents,
      closingBalanceCents: runningBalanceCents,
      movements
    };
  }
}

