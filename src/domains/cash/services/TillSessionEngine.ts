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
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { TellerTransactionEngine } from "./TellerTransactionEngine";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { getHaitiDateString } from "../../../utils/dateUtils";
import { LedgerTransaction } from "../../../types";
import {
  canOperateCashTill,
  normalizeRole
} from "../../rbac/operationalProfilePolicy";
import {
  OpenSessionParams,
  CloseSessionParams,
  ReopenSessionParams,
  MAX_CLOSING_AMOUNT_CENTS,
  CANONICAL_HTG_DENOMINATIONS,
  CANONICAL_USD_DENOMINATIONS,
  ALLOWED_HTG_DENOMINATIONS,
  ALLOWED_USD_DENOMINATIONS,
  ALLOWED_CLOSURE_ROLES,
  acquireTillLocks,
  releaseTillLocks,
  validateDenominationBreakdown as domainValidateDenominationBreakdown,
  evaluateTillClosure,
  evaluateTillReopen
} from "./TillSessionDomain";
import { TillSessionAdminService } from "./TillSessionAdminService";

export type { OpenSessionParams, CloseSessionParams, ReopenSessionParams };
export {
  CANONICAL_HTG_DENOMINATIONS,
  CANONICAL_USD_DENOMINATIONS,
  ALLOWED_HTG_DENOMINATIONS,
  ALLOWED_USD_DENOMINATIONS
};

export class TillSessionEngine {
  public static readonly CLOSE_SESSION_API_ENDPOINT = "/api/cash/sessions/close";
  public static readonly REOPEN_SESSION_API_ENDPOINT = "/api/cash/sessions/reopen";

  private static acquireLocks(keys: string[]): void {
    acquireTillLocks(keys);
  }

  private static releaseLocks(keys: string[]): void {
    releaseTillLocks(keys);
  }

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
    return TillSessionAdminService.recordAdminForensicEvent(adminDb, args);
  }

  public static validateDenominationBreakdown(
    currency: CurrencyCode,
    actualClosingCents: number,
    denominationBreakdown?: DenominationBreakdown
  ): void {
    domainValidateDenominationBreakdown(currency, actualClosingCents, denominationBreakdown);
  }

  private static evaluateClosure(
    args: Parameters<typeof evaluateTillClosure>[0]
  ): ReturnType<typeof evaluateTillClosure> {
    return evaluateTillClosure(args);
  }

  private static evaluateReopen(
    args: Parameters<typeof evaluateTillReopen>[0]
  ): ReturnType<typeof evaluateTillReopen> {
    return evaluateTillReopen(args);
  }

  /**
   * Opens a new Till Session with strict state validation (CLOSED -> OPEN).
   */
  public static async openSession(params: OpenSessionParams): Promise<{ till: CashTill; session: TillSession }> {
    const { tillId, operatorId, operatorName, openingBalanceCents } = params;

    const normalizedOpRole = normalizeRole(params.operatorRole);
    if (!normalizedOpRole || !ALLOWED_CLOSURE_ROLES.has(normalizedOpRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${params.operatorRole || "AUCUN"}] n'est pas autorisé à ouvrir une session de caisse.`
      );
    }
    const openDecision = canOperateCashTill(normalizedOpRole, params.operatorProfile, {
      allowExecutiveRoleBypass: true
    });
    if (!openDecision.allowed) {
      throw new FinopsException(openDecision.code || "FORBIDDEN_OPERATIONAL_PROFILE", openDecision.reason);
    }

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
    return TillSessionAdminService.closeSessionWithAdmin(adminDb, params);
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
    return TillSessionAdminService.reopenSessionWithAdmin(adminDb, params);
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

