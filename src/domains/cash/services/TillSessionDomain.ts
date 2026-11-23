import {
  TillSession,
  CashTill,
  CurrencyCode,
  DenominationBreakdown,
  InternalTransfer,
  CustomerTransfer,
  TellerTransaction
} from "../../../types/cashManagement";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { getHaitiDateString } from "../../../utils/dateUtils";
import { sanitizeAndEnrichLedgerTransaction } from "../../../services/accounting/LedgerSanitizer";
import { validateLedgerForeignKeys } from "../../../validations/integritySchemas";
import { RuntimeEvent } from "../../../modules/runtime/types";
import { LedgerTransaction } from "../../../types";
import {
  TELLER_ROLES,
  TILL_SUPERVISOR_ROLES,
  canOperateCashTill,
  canSuperviseTillLifecycleRole,
  extractRawOperationalProfileFromRecord,
  normalizeRole,
  validateRoleOperationalProfileCompatibility
} from "../../rbac/operationalProfilePolicy";

export interface OpenSessionParams {
  tillId: string;
  businessId?: string;
  operatorId: string;
  operatorName: string;
  operatorRole?: string;
  operatorProfile?: string;
  operatorBranchId?: string;
  openingBalanceCents: number;
  businessDate?: string;
}

export interface CloseSessionParams {
  sessionId: string;
  tillId?: string;
  businessId?: string;
  currency?: CurrencyCode;
  actualClosingCents: number;
  denominationBreakdown?: DenominationBreakdown;
  operatorId: string;
  operatorName: string;
  operatorRole?: string;
  operatorProfile?: string;
  operatorBranchId?: string;
  claimedOperatorRole?: unknown;
  claimedOperatorProfile?: unknown;
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
  approverProfile?: string;
  approverBranchId?: string;
  claimedApproverRole?: unknown;
  claimedApproverProfile?: unknown;
  authenticatedApproverUid?: string;
  reason: string;
  idempotencyKey?: string;
}

export const MAX_CLOSING_AMOUNT_CENTS = 100_000_000_000;
export const MAX_DENOMINATION_COUNT = 1_000_000;

export const CANONICAL_HTG_DENOMINATIONS: readonly number[] = [
  1000, 500, 250, 100, 50, 25, 10, 5, 2, 1
];
export const CANONICAL_USD_DENOMINATIONS: readonly number[] = [100, 50, 20, 10, 5, 2, 1];

export const ALLOWED_HTG_DENOMINATIONS = new Set<number>(CANONICAL_HTG_DENOMINATIONS);
export const ALLOWED_USD_DENOMINATIONS = new Set<number>(CANONICAL_USD_DENOMINATIONS);

export const ALLOWED_CLOSURE_ROLES = new Set<string>([
  "TELLER",
  "JUNIOR_TELLER",
  "SENIOR_TELLER",
  "HEAD_TELLER",
  "MASTER_HEAD_TELLER",
  "MANAGER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN"
]);

export const SUPERVISOR_CLOSURE_ROLES = TILL_SUPERVISOR_ROLES;
export const AUTHORIZED_REOPEN_ROLES = TILL_SUPERVISOR_ROLES;

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

/**
 * Shared in-memory concurrency guard across both client and Admin SDK TillSession engines.
 */
const activeTillLocks = new Set<string>();

export function acquireTillLocks(keys: string[]): void {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const k of uniqueKeys) {
    if (activeTillLocks.has(k)) {
      throw new FinopsException(
        "CONCURRENT_CLOSURE_CONFLICT",
        `Une opération concurrente de clôture ou de réouverture est déjà en cours sur [${k}].`
      );
    }
  }
  for (const k of uniqueKeys) {
    activeTillLocks.add(k);
  }
}

export function releaseTillLocks(keys: string[]): void {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  for (const k of uniqueKeys) {
    activeTillLocks.delete(k);
  }
}

export function validateDenominationBreakdown(
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

export function evaluateTillClosure(args: {
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

  if (params.businessId !== undefined) {
    const requestedBizId = String(params.businessId || "").trim();
    if (!requestedBizId || requestedBizId !== sessionBizId) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `Accès inter-tenant refusé : la session [${sessionId}] n'appartient pas au tenant [${requestedBizId}].`
      );
    }
  }

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

  const normalizedRole = normalizeRole(operatorRole);

  if (normalizedRole !== null && !ALLOWED_CLOSURE_ROLES.has(normalizedRole)) {
    throw new FinopsException(
      "FORBIDDEN_ROLE",
      `Le rôle [${operatorRole || "AUCUN"}] n'est pas autorisé à clôturer une session de caisse.`
    );
  }

  if (normalizedRole !== null) {
    const cashClosureDecision = canOperateCashTill(normalizedRole, params.operatorProfile, {
      allowExecutiveRoleBypass: true
    });
    if (!cashClosureDecision.allowed) {
      throw new FinopsException(
        cashClosureDecision.code || "FORBIDDEN_OPERATIONAL_PROFILE",
        cashClosureDecision.reason
      );
    }
  }

  const isSessionTeller = operatorId.trim() === (currentSession.teller_id || "").trim();
  const isSupervisor = normalizedRole !== null && SUPERVISOR_CLOSURE_ROLES.has(normalizedRole);

  if (!isSessionTeller && !isSupervisor) {
    throw new FinopsException(
      "UNAUTHORIZED_SESSION_OPERATOR",
      `L'opérateur [${operatorId}] n'est ni le guichetier titulaire de la session [${currentSession.teller_id}] ni un superviseur habilité.`
    );
  }

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

  validateDenominationBreakdown(till.currency, actualClosingCents, denominationBreakdown);

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

  let varianceLedgerTx: LedgerTransaction | undefined;
  let varianceOutboxEvent: RuntimeEvent | undefined;
  if (discrepancyCents !== 0) {
    const varianceAbsCents = Math.abs(discrepancyCents);
    const varianceAccountCode = CashAccountMapping.ACCOUNTS.CASH_VARIANCE_CLEARING.code;

    let debitAcc = "";
    let creditAcc = "";

    if (varianceType === "SHORTAGE") {
      debitAcc = varianceAccountCode;
      creditAcc = tillAccount.accountCode;
    } else {
      debitAcc = tillAccount.accountCode;
      creditAcc = varianceAccountCode;
    }

    const resolvedVarianceBranchId = (till.branch_id || currentSession.branch_id || "").trim();
    if (!resolvedVarianceBranchId) {
      throw new FinopsException(
        "MISSING_BRANCH_SCOPE",
        "L'identifiant de succursale (branch_id) est obligatoire pour comptabiliser un écart de caisse."
      );
    }

    const varianceGlId = `gl_variance_${sessionId}`;
    const rawVarianceTx: LedgerTransaction = {
      id: varianceGlId,
      business_id: till.business_id,
      businessId: till.business_id,
      branchId: resolvedVarianceBranchId,
      branch_id: resolvedVarianceBranchId,
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

export function evaluateTillReopen(args: {
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

  if (requesterId.trim() === approverId.trim()) {
    throw new FinopsException(
      "MAKER_CHECKER_VIOLATION",
      "Séparation des tâches : L'opérateur qui demande la réouverture ne peut pas approuver sa propre demande."
    );
  }

  const normApproverRole = normalizeRole(approverRole);
  if (!normApproverRole || !canSuperviseTillLifecycleRole(normApproverRole)) {
    throw new FinopsException(
      "UNAUTHORIZED_APPROVER",
      `Rôle [${approverRole || "AUCUN"}] non autorisé à rouvrir une session de caisse clôturée.`
    );
  }
  if (TELLER_ROLES.has(normApproverRole)) {
    const approverCashDecision = canOperateCashTill(normApproverRole, params.approverProfile, {
      allowExecutiveRoleBypass: false
    });
    if (!approverCashDecision.allowed) {
      throw new FinopsException(
        approverCashDecision.code || "FORBIDDEN_OPERATIONAL_PROFILE",
        approverCashDecision.reason
      );
    }
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

    const reqRole = normalizeRole(requesterRecord.role);
    if (reqRole && !ALLOWED_CLOSURE_ROLES.has(reqRole)) {
      throw new FinopsException(
        "UNAUTHORIZED_REQUESTER_ROLE",
        `Le rôle [${reqRole}] du demandeur [${cleanRequesterId}] n'est pas autorisé à opérer une session de caisse.`
      );
    }
    if (reqRole && TELLER_ROLES.has(reqRole)) {
      const reqProfInfo = extractRawOperationalProfileFromRecord(requesterRecord);
      if (reqProfInfo.conflict) {
        throw new FinopsException(
          "CONFLICTING_OPERATIONAL_PROFILE_FIELDS",
          "Incohérence de profil opérationnel sur la fiche du demandeur."
        );
      }
      const compat = validateRoleOperationalProfileCompatibility(reqRole, reqProfInfo.rawValue, {
        allowLegacyBarberAlias: false,
        allowMissingForExecutiveOrOversight: false
      });
      if (!compat.valid) {
        throw new FinopsException(
          "UNAUTHORIZED_REQUESTER_ROLE",
          `Profil opérationnel invalide pour le demandeur [${cleanRequesterId}] : ${compat.reason}`
        );
      }
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
