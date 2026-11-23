import type { Firestore } from "firebase-admin/firestore";
import { ForensicLog, PayrollCycle, PayrollRecord } from "../../types";
import { FinopsException } from "../../modules/runtime/FinopsException";
import { EventBus } from "../../modules/runtime/EventBus";
import { createPayrollJournalEntry } from "../accounting/PayrollJournalBuilder";
import { computeHMACSignature, getForensicHMACSecretKey } from "../../utils/forensicSignature";
import { hasPermission } from "../../permissions/role.permissions";

export async function sealPayrollCycleWithAdmin(
  cycle: PayrollCycle,
  records: PayrollRecord[],
  businessId: string,
  options: {
    currentUser?: { name: string; id: string; role?: string };
    firestoreAdmin: Firestore;
    skipMakerChecker?: boolean;
  }
): Promise<void> {
  if (!businessId) {
    throw new Error("Multi-Tenancy Violation: business_id is required for sealing payroll cycle.");
  }

  if (cycle.status === "SEALED" || (cycle.status as string) === "PAID") {
    throw new FinopsException(
      "CYCLE_ALREADY_SEALED",
      `Le cycle de paie "${cycle.cycleName || cycle.label || cycle.id}" est déjà scellé et immuable.`
    );
  }

  const actorRole = options.currentUser?.role;
  if (actorRole && !hasPermission(actorRole, "canValidatePayroll")) {
    throw new Error(
      `[SegregationOfDutiesViolation] User with role '${actorRole}' is not authorized to validate or seal payroll cycles. Required permission: canValidatePayroll.`
    );
  }

  const initiatorId = cycle.generated_by || (cycle as any).createdBy || (cycle as any).calculatedBy;
  const actorId = options.currentUser?.id;
  if (actorId && initiatorId && actorId === initiatorId && options.currentUser?.role !== "SYSTEM" && !options.skipMakerChecker) {
    throw new FinopsException(
      "MAKER_CHECKER_VIOLATION",
      "Séparation des pouvoirs : la personne ayant initié ou calculé le cycle de paie ne peut pas effectuer son scellement ou son paiement."
    );
  }

  const totalGross = records.reduce(
    (acc, r) => acc + (r.grossSalary || (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0)),
    0
  );
  const totalNet = records.reduce(
    (acc, r) => acc + (r.netPaid || (r.net_salary_cents ? r.net_salary_cents / 100 : 0)),
    0
  );

  const nowIso = new Date().toISOString();
  const logId = `flog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const details = `Cycle de paie scellé avec empreinte SHA-256. Total Brut: ${totalGross.toLocaleString()} HTG, Net: ${totalNet.toLocaleString()} HTG, Effectif: ${records.length}`;
  const beforeState = { status: cycle.status };
  const afterState = { status: "SEALED", totalGross, totalNet, recordsCount: records.length };

  const signaturePayload = {
    id: logId,
    business_id: businessId,
    action: "PAYROLL_CYCLE_SEALED",
    actorId: options.currentUser?.id || "SYSTEM",
    timestamp: nowIso,
    details,
    beforeState,
    afterState,
    keyVersion: "v2_server"
  };

  const key = getForensicHMACSecretKey(businessId);
  const signature = await computeHMACSignature(signaturePayload, key);

  const forensicLog: ForensicLog = {
    id: logId,
    business_id: businessId,
    actorId: options.currentUser?.id || "SYSTEM",
    userName: options.currentUser?.name || "SYSTEM",
    userRole: (options.currentUser?.role || "SYSTEM") as any,
    action: "PAYROLL_CYCLE_SEALED",
    details,
    beforeState,
    afterState,
    timestamp: nowIso,
    keyVersion: "v2_server",
    signature
  };

  const sealedRecords = records.map((rec) => ({
    ...rec,
    status: "SEALED" as any,
    hashSignature: rec.hashSignature || forensicLog.signature
  }));

  const { transactions: glTransactions } = createPayrollJournalEntry(
    cycle,
    records,
    businessId,
    { uid: options.currentUser?.id || "SYSTEM", name: options.currentUser?.name || "SYSTEM" }
  );

  const db = options.firestoreAdmin;
  const batch = db.batch();

  const cycleRef = db.collection("payroll_cycles").doc(cycle.id);
  batch.set(
    cycleRef,
    {
      ...cycle,
      sealSignature: forensicLog.signature,
      sealedBy: options.currentUser?.name || "SYSTEM",
      business_id: businessId,
      status: "SEALED",
      sealedAt: nowIso,
      updated_at: nowIso
    },
    { merge: true }
  );

  sealedRecords.forEach((payslip) => {
    const psId = payslip.id || `ps_${cycle.id}_${payslip.employeeId}`;
    const payslipRef = db.collection("payslips").doc(psId);
    batch.set(
      payslipRef,
      {
        ...payslip,
        business_id: businessId,
        payroll_cycle_id: cycle.id,
        status: "SEALED",
        updated_at: nowIso
      },
      { merge: true }
    );
  });

  glTransactions.forEach((tx) => {
    const txRef = db.collection("ledger_transactions").doc(tx.id);
    batch.set(
      txRef,
      {
        ...tx,
        business_id: businessId,
        businessId,
        payroll_cycle_id: cycle.id,
        payrollCycleId: cycle.id,
        date: cycle.effectiveAccountingDate || cycle.endDate || tx.date,
        status: "POSTED",
        updatedAt: nowIso
      },
      { merge: true }
    );
  });

  const logRef = db.collection("forensic_logs").doc(forensicLog.id);
  batch.set(logRef, {
    ...forensicLog,
    business_id: businessId,
    _server_timestamp: nowIso
  });

  await batch.commit();

  EventBus.publish(
    EventBus.createEvent({
      type: "PAYROLL_CYCLE_SEALED",
      businessId,
      module: "PAYROLL",
      aggregate: "PayrollCycle",
      payload: {
        cycleId: cycle.id,
        cycleName: cycle.cycleName || cycle.label,
        totalGross,
        totalNet,
        recordsCount: records.length,
        signature: forensicLog.signature,
        business_id: businessId
      }
    })
  );
}
