import {
  TillSession,
  CashTill,
  InternalTransfer,
  CustomerTransfer,
  TellerTransaction
} from "../../../types/cashManagement";
import { LedgerTransaction } from "../../../types";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import {
  computeHMACSignature,
  getForensicHMACSecretKey
} from "../../../utils/forensicSignature";
import {
  canSuperviseTillLifecycleRole,
  normalizeRole
} from "../../rbac/operationalProfilePolicy";
import {
  isBranchScopedTellerRole,
  verifyServerEmployeeOperationalProfile
} from "../../rbac/serverEmployeeProfileVerifier";
import {
  CloseSessionParams,
  ReopenSessionParams,
  SUPERVISOR_CLOSURE_ROLES,
  acquireTillLocks,
  releaseTillLocks,
  evaluateTillClosure,
  evaluateTillReopen
} from "./TillSessionDomain";

/**
 * Server-only Admin SDK execution for Till Session Closure, Reopening & Forensic Audit.
 * Strictly isolated from browser Firebase SDK (firebase/firestore, src/lib/firebase).
 */
export class TillSessionAdminService {
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
      const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const businessId = args.businessId || "UNKNOWN";
      const afterStatePayload = {
        ...(args.afterState || {}),
        sessionId: args.sessionId,
        tillId: args.tillId,
        result: args.result,
        errorCode: args.errorCode,
        correlationId
      };
      const signaturePayload = {
        id: logId,
        business_id: businessId,
        action: args.action,
        actorId: args.actorId,
        timestamp: now,
        details: args.details,
        beforeState: args.beforeState || null,
        afterState: afterStatePayload,
        keyVersion: "v2_server"
      };
      const signature = await computeHMACSignature(
        signaturePayload,
        getForensicHMACSecretKey(businessId)
      );

      await adminDb.collection("forensic_logs").doc(logId).set({
        id: logId,
        business_id: businessId,
        actorId: args.actorId,
        userName: args.actorName || args.actorId,
        userRole: args.actorRole || "SYSTEM",
        action: args.action,
        details: args.details,
        beforeState: args.beforeState || null,
        afterState: afterStatePayload,
        timestamp: now,
        keyVersion: "v2_server",
        signature,
        _server_timestamp: new Date().toISOString()
      });
    } catch (fErr) {
      console.warn("[TillSessionAdminService.recordAdminForensicEvent] Audit log warning:", fErr);
    }
  }

  public static async closeSessionWithAdmin(
    adminDb: any,
    params: CloseSessionParams
  ): Promise<{ till: CashTill; session: TillSession; varianceLedgerTx?: LedgerTransaction }> {
    const lockKeys = [`session:${params.sessionId}`];
    if (params.tillId) lockKeys.push(`till:${params.tillId}`);

    acquireTillLocks(lockKeys);
    let extraTillLock: string | null = null;

    try {
      const sessionRef = adminDb.doc(`till_sessions/${params.sessionId || "__missing__"}`);
      const preSessionSnap = await sessionRef.get();
      const preSession = preSessionSnap.exists
        ? ({ id: preSessionSnap.id || params.sessionId, ...preSessionSnap.data() } as TillSession)
        : null;

      if (preSession?.till_id && `till:${preSession.till_id}` !== `till:${params.tillId}`) {
        extraTillLock = `till:${preSession.till_id}`;
        acquireTillLocks([extraTillLock]);
      }

      const now = new Date().toISOString();
      const targetBizId = params.businessId || preSession?.business_id;
      const actorRoleNorm = normalizeRole(params.operatorRole);
      const needsSupervisorCap = Boolean(actorRoleNorm && SUPERVISOR_CLOSURE_ROLES.has(actorRoleNorm));
      const verifiedActor = await verifyServerEmployeeOperationalProfile({
        adminDb,
        uid: params.operatorId,
        businessId: targetBizId,
        actorBranchId: params.operatorBranchId,
        requireBranchScope: isBranchScopedTellerRole(actorRoleNorm),
        actorRole: params.operatorRole,
        claimedRole: params.claimedOperatorRole,
        claimedProfile: params.claimedOperatorProfile,
        capability: needsSupervisorCap ? "till_supervise" : "cash"
      });
      const verifiedParams: CloseSessionParams = {
        ...params,
        operatorRole: verifiedActor.role,
        operatorProfile: verifiedActor.operationalProfile ?? undefined,
        operatorBranchId: verifiedActor.branchId
      };
      const isTellerBranchScoped =
        verifiedActor.role !== "SUPER_ADMIN" && isBranchScopedTellerRole(verifiedActor.role);

      const result = await adminDb.runTransaction(async (tx: any) => {
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

        if (
          isTellerBranchScoped &&
          verifiedActor.branchId &&
          currentSession &&
          till &&
          (currentSession.business_id || "").trim() ===
            (verifiedParams.businessId || currentSession.business_id || "").trim() &&
          (till.business_id || "").trim() === (currentSession.business_id || "").trim()
        ) {
          if (currentSession.branch_id && currentSession.branch_id !== verifiedActor.branchId) {
            throw new FinopsException(
              "BRANCH_ISOLATION_VIOLATION",
              `Accès inter-succursale refusé : la session [${currentSession.id}] appartient à '${currentSession.branch_id}', opérateur limité à '${verifiedActor.branchId}'.`
            );
          }
          if (till.branch_id && till.branch_id !== verifiedActor.branchId) {
            throw new FinopsException(
              "BRANCH_ISOLATION_VIOLATION",
              `Accès inter-succursale refusé : la caisse [${till.id}] appartient à '${till.branch_id}', opérateur limité à '${verifiedActor.branchId}'.`
            );
          }
        }

        const evaluated = evaluateTillClosure({
          params: verifiedParams,
          currentSession,
          till,
          tellerTxs,
          internalTransfers,
          customerTransfers,
          existingVarianceGlExists,
          existingVarianceOutboxExists,
          now
        });

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
        releaseTillLocks([extraTillLock]);
      }
      releaseTillLocks(lockKeys);
    }
  }

  public static async reopenSessionWithAdmin(
    adminDb: any,
    params: ReopenSessionParams
  ): Promise<{ till: CashTill; newSession: TillSession }> {
    const lockKeys = [`till:${params.tillId}`, `session:${params.previousSessionId}`];
    acquireTillLocks(lockKeys);

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

      const approverRoleNorm = normalizeRole(params.approverRole);
      if (!approverRoleNorm || !canSuperviseTillLifecycleRole(approverRoleNorm)) {
        throw new FinopsException(
          "UNAUTHORIZED_APPROVER",
          `Rôle [${params.approverRole || "AUCUN"}] non autorisé à rouvrir une session de caisse clôturée.`
        );
      }

      const verifiedApprover = await verifyServerEmployeeOperationalProfile({
        adminDb,
        uid: params.approverId,
        businessId: params.businessId,
        actorBranchId: params.approverBranchId,
        requireBranchScope: isBranchScopedTellerRole(approverRoleNorm),
        actorRole: params.approverRole,
        claimedRole: params.claimedApproverRole,
        claimedProfile: params.claimedApproverProfile,
        capability: "till_supervise"
      });
      const verifiedReopenParams: ReopenSessionParams = {
        ...params,
        approverRole: verifiedApprover.role,
        approverProfile: verifiedApprover.operationalProfile ?? undefined,
        approverBranchId: verifiedApprover.branchId
      };
      const isApproverBranchScoped =
        verifiedApprover.role !== "SUPER_ADMIN" && isBranchScopedTellerRole(verifiedApprover.role);

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

        if (
          isApproverBranchScoped &&
          verifiedApprover.branchId &&
          till &&
          prevSession &&
          (!params.businessId || till.business_id === params.businessId) &&
          till.business_id === prevSession.business_id
        ) {
          if (till.branch_id && till.branch_id !== verifiedApprover.branchId) {
            throw new FinopsException(
              "BRANCH_ISOLATION_VIOLATION",
              `Accès inter-succursale refusé : la caisse [${till.id}] appartient à '${till.branch_id}', superviseur limité à '${verifiedApprover.branchId}'.`
            );
          }
          if (requesterRecord) {
            const reqBranch = String(requesterRecord.branch_id || requesterRecord.branchId || "").trim();
            if (reqBranch && reqBranch !== verifiedApprover.branchId) {
              throw new FinopsException(
                "BRANCH_ISOLATION_VIOLATION",
                `Accès inter-succursale refusé : le demandeur [${cleanReqId}] appartient à '${reqBranch}', superviseur limité à '${verifiedApprover.branchId}'.`
              );
            }
          }
        }

        const { updatedPrevSession, newSession, reopenedTill } = evaluateTillReopen({
          params: verifiedReopenParams,
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
      releaseTillLocks(lockKeys);
    }
  }
}
