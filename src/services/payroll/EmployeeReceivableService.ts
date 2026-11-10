import {
  EmployeeReceivable,
  EmployeeReceivableRepayment,
  EmployeeReceivableStatus,
  LedgerTransaction,
  User,
} from "../../types";
import { JournalEntry } from "../AccountingEngine";
import { CHART_OF_ACCOUNTS } from "../../constants/finance";
import { FinopsException } from "../../modules/runtime/FinopsException";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";

export interface CreateProposalParams {
  businessId: string;
  originalPayrollCycleId: string;
  originalPayrollRecordId: string;
  reversalCycleId?: string;
  reversalPayrollRecordId?: string;
  employeeId: string;
  employeeName?: string;
  recoverableAmount: number; // HTG or currency unit
  currency?: "HTG" | "USD";
  creator: { id: string; name?: string; role?: string };
  notes?: string;
}

export interface ApproveProposalParams {
  receivableId?: string;
  businessId: string;
  approver: { id: string; name?: string; role?: string };
  approvalReason?: string;
  receivableAccount?: string; // default "1310_EMPLOYEE_RECEIVABLES"
  existingReceivables?: EmployeeReceivable[];
}

export interface RecordRepaymentParams {
  receivableId?: string;
  businessId: string;
  amount: number;
  paymentMethod: "CASH" | "BANK" | "MONCASH" | "NATCASH" | "CARD" | "WIRE" | "DEDUCTION";
  treasuryAccount?: string; // e.g. "1010_BANK" or "1000_CASH"
  repaymentDate?: string;
  receiptNumber?: string;
  recordedBy: { id: string; name?: string; role?: string };
  notes?: string;
  existingReceivables?: EmployeeReceivable[];
}

export const RECEIVABLE_READ_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
  "FINANCE",
  "HEAD_TELLER",
  "AUDITOR",
  "SUPER_ADMIN",
] as const;

export const RECEIVABLE_APPROVE_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "HEAD_TELLER",
  "SUPER_ADMIN",
] as const;

export const RECEIVABLE_REPAYMENT_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "ACCOUNTANT",
  "FINANCE",
  "HEAD_TELLER",
  "SUPER_ADMIN",
] as const;

export function resolveReceivableTenantId(doc: {
  businessId?: string;
  business_id?: string;
  id?: string;
}): string {
  const b1 = typeof doc?.businessId === "string" ? doc.businessId.trim() : "";
  const b2 = typeof doc?.business_id === "string" ? doc.business_id.trim() : "";
  if (b1 && b2 && b1 !== b2) {
    throw new FinopsException(
      "TENANT_ISOLATION_VIOLATION",
      `[MultiTenancyViolation] Contradiction entre businessId ('${b1}') et business_id ('${b2}') sur la créance '${doc?.id || ""}'.`
    );
  }
  return b1 || b2;
}

export class EmployeeReceivableService {
  /**
   * 1. Creates a recovery proposal for an overpaid employee record (Case B).
   * Initial status is PENDING_HUMAN_APPROVAL. No journal entry or cash effect is created yet.
   */
  static createProposal(params: CreateProposalParams): EmployeeReceivable {
    const {
      businessId,
      originalPayrollCycleId,
      originalPayrollRecordId,
      reversalCycleId,
      reversalPayrollRecordId,
      employeeId,
      employeeName,
      recoverableAmount,
      currency = "HTG",
      creator,
      notes,
    } = params;

    if (!businessId || !originalPayrollRecordId || !employeeId) {
      throw new FinopsException(
        "INVALID_RECOVERY_PROPOSAL",
        "[MultiTenancyViolation] businessId, originalPayrollRecordId, et employeeId sont requis."
      );
    }

    if (recoverableAmount <= 0) {
      throw new FinopsException(
        "INVALID_RECOVERABLE_AMOUNT",
        "[ValidationViolation] Le montant recouvrable doit être strictement supérieur à zéro."
      );
    }

    const recoverableCents = Math.round(recoverableAmount * 100);
    const now = new Date().toISOString();
    const id = `rec_prop_${originalPayrollRecordId}`;

    const receivable: EmployeeReceivable = {
      id,
      businessId,
      employeeId,
      employeeName: employeeName || employeeId,
      originalPayrollCycleId,
      originalPayrollRecordId,
      reversalCycleId,
      reversalPayrollRecordId,
      currency,
      approvedRecoverableAmount: recoverableAmount,
      approvedRecoverableCents: recoverableCents,
      recoveredAmount: 0,
      recoveredCents: 0,
      outstandingAmount: recoverableAmount,
      outstandingCents: recoverableCents,
      status: "PENDING_HUMAN_APPROVAL",
      createdById: creator.id || "SYSTEM",
      createdByName: creator.name || "SYSTEM",
      createdAt: now,
      repayments: [],
      receivableAccount: CHART_OF_ACCOUNTS.ASSETS.EMPLOYEE_RECEIVABLES || "1310_EMPLOYEE_RECEIVABLES",
      idempotencyKey: `idemp_rec_${originalPayrollRecordId}`,
      notes: notes || "Proposition de recouvrement de trop-perçu salarial en attente d'approbation.",
      updatedAt: now,
    };

    return receivable;
  }

  /**
   * 2. Human Approval of a recovery proposal.
   * Enforces Maker-Checker rules (approver cannot be creator) and posts balanced GL entries.
   */
  static approveProposal(
    proposal: EmployeeReceivable,
    params: ApproveProposalParams
  ): {
    approvedReceivable: EmployeeReceivable;
    journalEntry: JournalEntry;
    ledgerTransactions: LedgerTransaction[];
  } {
    const { businessId, approver, approvalReason, receivableAccount, existingReceivables } = params;

    const proposalBizId = resolveReceivableTenantId(proposal as any);
    if (!proposalBizId || proposalBizId !== businessId) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `[MultiTenancyViolation] Créance ${proposal.id} appartient au tenant '${proposalBizId}', pas à '${businessId}'.`
      );
    }

    if (proposal.status !== "PENDING_HUMAN_APPROVAL") {
      throw new FinopsException(
        "INVALID_STATUS_TRANSITION",
        `[StatusViolation] Seule une proposition en attente (PENDING_HUMAN_APPROVAL) peut être approuvée. Statut actuel: ${proposal.status}`
      );
    }

    // Segregation of Duties / Maker-Checker
    const normalizedApproverRole = approver.role ? approver.role.trim().toUpperCase() : "";
    if (
      approver.id !== "SYSTEM" &&
      proposal.createdById &&
      approver.id === proposal.createdById &&
      normalizedApproverRole !== "SUPER_ADMIN"
    ) {
      throw new FinopsException(
        "SEGREGATION_OF_DUTIES_VIOLATION",
        `[SegregationOfDutiesViolation] L'utilisateur '${approver.id}' ne peut pas approuver sa propre proposition de recouvrement.`
      );
    }

    // Validate approver role against canonical RECEIVABLE_APPROVE_ROLES
    if (
      normalizedApproverRole &&
      !(RECEIVABLE_APPROVE_ROLES as readonly string[]).includes(normalizedApproverRole)
    ) {
      throw new FinopsException(
        "UNAUTHORIZED_APPROVER",
        `[AuthorizationViolation] Le rôle '${approver.role}' n'a pas la permission d'approuver un recouvrement.`
      );
    }

    // Validate account code in Chart of Accounts
    const targetAccount = receivableAccount || proposal.receivableAccount || "1310_EMPLOYEE_RECEIVABLES";
    if (!targetAccount.startsWith("13") && !targetAccount.startsWith("12")) {
      throw new FinopsException(
        "INVALID_ACCOUNT_MAPPING",
        `[AccountingViolation] Le compte de créance '${targetAccount}' n'est pas un compte d'actif valide (Classe 12/13).`
      );
    }

    const now = new Date().toISOString();
    const txDate = now.split("T")[0];
    const amtCents = proposal.approvedRecoverableCents;
    const amtHtg = proposal.approvedRecoverableAmount;

    // Construct Balanced Journal Entry:
    // Debit 1310_EMPLOYEE_RECEIVABLES (Asset increase)
    // Credit 2100_PAYROLL_CLEARING (Payroll debt settlement offset)
    const txId = `tx_rec_appr_${proposal.id}_${Date.now().toString(36)}`;
    const tx: LedgerTransaction = {
      id: txId,
      business_id: businessId,
      businessId,
      branchId: "MAIN",
      type: "PAYROLL",
      amount: amtHtg,
      amount_cents: amtCents,
      date: txDate,
      description: `Constat Créance Trop-Perçu Salarial - Employé ${proposal.employeeName || proposal.employeeId}`,
      category: "PAYROLL",
      signerId: approver.id,
      currency: proposal.currency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: targetAccount,
      credit_account: "2100_PAYROLL_CLEARING",
      debit: amtHtg,
      credit: amtHtg,
      debit_cents: amtCents,
      credit_cents: amtCents,
      metadata: {
        receivableId: proposal.id,
        employeeId: proposal.employeeId,
        originalPayrollCycleId: proposal.originalPayrollCycleId,
        approvedBy: approver.id,
        approvedAt: now,
      },
      created_at: now,
      updated_at: now,
    };

    const journalEntry: JournalEntry = {
      id: `je_rec_appr_${proposal.id}_${Date.now().toString(36)}`,
      businessId,
      date: txDate,
      reference: `REC-${proposal.id}`,
      source: "PAYROLL",
      sourceId: proposal.id,
      description: `Constat Créance Trop-Perçu Salarial Approuvé - ${proposal.employeeName || proposal.employeeId}`,
      currency: proposal.currency,
      lines: [
        {
          accountId: targetAccount,
          accountCode: targetAccount.split("_")[0],
          accountName: targetAccount,
          debitCents: amtCents,
          creditCents: 0,
          description: `Créance Salariale à Recouvrer - ${proposal.employeeName}`,
        },
        {
          accountId: "2100_PAYROLL_CLEARING",
          accountCode: "2100",
          accountName: "2100 - Payroll Clearing",
          debitCents: 0,
          creditCents: amtCents,
          description: `Apurement Dette Salariale Trop-Perçue`,
        },
      ],
      totalDebitCents: amtCents,
      totalCreditCents: amtCents,
      isBalanced: true,
      isLocked: true,
      createdBy: approver.id,
      createdAt: now,
    };

    const approvedReceivable: EmployeeReceivable = {
      ...proposal,
      businessId,
      ...( { business_id: businessId } as any ),
      status: "APPROVED_PENDING_RECOVERY",
      approverId: approver.id,
      approverName: approver.name || approver.id,
      approverRole: normalizedApproverRole || "OWNER",
      approvedAt: now,
      approvalReason: approvalReason || "Recouvrement du trop-perçu approuvé",
      receivableAccount: targetAccount,
      journalEntryId: journalEntry.id,
      updatedAt: now,
    };

    return { approvedReceivable, journalEntry, ledgerTransactions: [tx] };
  }

  /**
   * 3. Reconciles an actual employee repayment against an approved receivable.
   * Tracks partial repayments, outstanding balance in integer cents, and posts cash receipt GL entries.
   */
  static recordRepayment(
    receivable: EmployeeReceivable,
    params: RecordRepaymentParams
  ): {
    updatedReceivable: EmployeeReceivable;
    repayment: EmployeeReceivableRepayment;
    journalEntry: JournalEntry;
    ledgerTransaction: LedgerTransaction;
  } {
    const {
      businessId,
      amount,
      paymentMethod,
      treasuryAccount = "1010_BANK",
      repaymentDate,
      receiptNumber,
      recordedBy,
      notes,
    } = params;

    const recBizId = resolveReceivableTenantId(receivable as any);
    if (!recBizId || recBizId !== businessId) {
      throw new FinopsException(
        "TENANT_ISOLATION_VIOLATION",
        `[MultiTenancyViolation] Créance ${receivable.id} appartient au tenant '${recBizId}', pas à '${businessId}'.`
      );
    }

    if (recordedBy?.role) {
      const normalizedRecorderRole = recordedBy.role.trim().toUpperCase();
      if (!(RECEIVABLE_REPAYMENT_ROLES as readonly string[]).includes(normalizedRecorderRole)) {
        throw new FinopsException(
          "FORBIDDEN_ROLE",
          `[AuthorizationViolation] Le rôle '${recordedBy.role}' n'est pas autorisé à enregistrer un remboursement de créance salariale.`
        );
      }
    }

    if (
      receivable.status !== "APPROVED_PENDING_RECOVERY" &&
      receivable.status !== "PARTIALLY_RECOVERED"
    ) {
      throw new FinopsException(
        "RECEIVABLE_NOT_ACTIVE",
        `[StatusViolation] Impossible d'enregistrer un remboursement sur une créance en statut '${receivable.status}'.`
      );
    }

    if (amount <= 0) {
      throw new FinopsException(
        "INVALID_REPAYMENT_AMOUNT",
        "[ValidationViolation] Le montant du remboursement doit être strictement supérieur à zéro."
      );
    }

    const repaymentCents = Math.round(amount * 100);

    if (repaymentCents > receivable.outstandingCents) {
      throw new FinopsException(
        "OVERPAYMENT_REJECTED",
        `[ValidationViolation] Le montant (${amount} ${receivable.currency}) dépasse le solde restant dû (${receivable.outstandingAmount} ${receivable.currency}).`
      );
    }

    const now = new Date().toISOString();
    const txDate = repaymentDate || now.split("T")[0];
    const repaymentId = `repay_${receivable.id}_${Date.now().toString(36)}`;

    const repayment: EmployeeReceivableRepayment = {
      id: repaymentId,
      receivableId: receivable.id,
      businessId,
      employeeId: receivable.employeeId,
      amount,
      amountCents: repaymentCents,
      currency: receivable.currency,
      repaymentDate: txDate,
      paymentMethod,
      receiptNumber: receiptNumber || `RCP-${Date.now().toString(36).toUpperCase()}`,
      status: "CONFIRMED",
      recordedBy: recordedBy.id,
      recordedAt: now,
      notes: notes || "Remboursement effectif de trop-perçu salarial",
    };

    // Recalculate outstanding in integer minor cents
    const newRecoveredCents = receivable.recoveredCents + repaymentCents;
    const newOutstandingCents = receivable.approvedRecoverableCents - newRecoveredCents;

    let newStatus: EmployeeReceivableStatus = "PARTIALLY_RECOVERED";
    if (newOutstandingCents === 0) {
      newStatus = "RECOVERED";
    }

    // Construct Balanced Journal Entry:
    // Debit Treasury (1010_BANK or 1000_CASH) - Real cash inflow
    // Credit 1310_EMPLOYEE_RECEIVABLES - Asset reduction
    const txId = `tx_repay_${repaymentId}`;
    const ledgerTransaction: LedgerTransaction = {
      id: txId,
      business_id: businessId,
      businessId,
      branchId: "MAIN",
      type: "INCOME",
      amount,
      amount_cents: repaymentCents,
      date: txDate,
      description: `Encaissement Remboursement Trop-Perçu - Employé ${receivable.employeeName || receivable.employeeId}`,
      category: "PAYROLL_RECOVERY",
      signerId: recordedBy.id,
      currency: receivable.currency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: treasuryAccount,
      credit_account: receivable.receivableAccount,
      debit: amount,
      credit: amount,
      debit_cents: repaymentCents,
      credit_cents: repaymentCents,
      metadata: {
        receivableId: receivable.id,
        repaymentId,
        employeeId: receivable.employeeId,
        recordedBy: recordedBy.id,
      },
      created_at: now,
      updated_at: now,
    };

    const journalEntry: JournalEntry = {
      id: `je_repay_${repaymentId}`,
      businessId,
      date: txDate,
      reference: repayment.receiptNumber || repaymentId,
      source: "PAYROLL",
      sourceId: repaymentId,
      description: `Encaissement Effectif Remboursement - ${receivable.employeeName || receivable.employeeId}`,
      currency: receivable.currency,
      lines: [
        {
          accountId: treasuryAccount,
          accountCode: treasuryAccount.split("_")[0],
          accountName: treasuryAccount,
          debitCents: repaymentCents,
          creditCents: 0,
          description: `Entrée de Trésorerie (${paymentMethod}) - Remboursement`,
        },
        {
          accountId: receivable.receivableAccount,
          accountCode: receivable.receivableAccount.split("_")[0],
          accountName: receivable.receivableAccount,
          debitCents: 0,
          creditCents: repaymentCents,
          description: `Extinction Créance Trop-Perçu Salarial`,
        },
      ],
      totalDebitCents: repaymentCents,
      totalCreditCents: repaymentCents,
      isBalanced: true,
      isLocked: true,
      createdBy: recordedBy.id,
      createdAt: now,
    };

    const updatedReceivable: EmployeeReceivable = {
      ...receivable,
      businessId,
      ...( { business_id: businessId } as any ),
      recoveredCents: newRecoveredCents,
      recoveredAmount: newRecoveredCents / 100,
      outstandingCents: newOutstandingCents,
      outstandingAmount: newOutstandingCents / 100,
      status: newStatus,
      lastReconciledAt: now,
      lastReconciledBy: recordedBy.id,
      repayments: [...receivable.repayments, repayment],
      updatedAt: now,
    };

    return { updatedReceivable, repayment, journalEntry, ledgerTransaction };
  }

  /**
   * 4. Reverses a repayment (e.g. bounced check or voided receipt)
   * Restores outstanding balance and creates GL correction entry.
   */
  static reverseRepayment(
    receivable: EmployeeReceivable,
    repaymentId: string,
    reversedBy: { id: string; role?: string },
    reason?: string
  ): { updatedReceivable: EmployeeReceivable; correctionTx: LedgerTransaction } {
    const targetRepayment = receivable.repayments.find((r) => r.id === repaymentId);
    if (!targetRepayment || targetRepayment.status !== "CONFIRMED") {
      throw new FinopsException(
        "REPAYMENT_NOT_FOUND",
        `[ValidationViolation] Le remboursement ${repaymentId} est introuvable ou déjà annulé.`
      );
    }

    const now = new Date().toISOString();
    const updatedRepayments = receivable.repayments.map((r) =>
      r.id === repaymentId ? { ...r, status: "REVERSED" as const } : r
    );

    const activeRepaymentsCents = updatedRepayments
      .filter((r) => r.status === "CONFIRMED")
      .reduce((acc, r) => acc + r.amountCents, 0);

    const newOutstandingCents = receivable.approvedRecoverableCents - activeRepaymentsCents;
    let newStatus: EmployeeReceivableStatus = "APPROVED_PENDING_RECOVERY";
    if (activeRepaymentsCents > 0) {
      newStatus = "PARTIALLY_RECOVERED";
    }

    const amtCents = targetRepayment.amountCents;
    const amtHtg = targetRepayment.amount;

    const correctionTx: LedgerTransaction = {
      id: `tx_rev_repay_${repaymentId}_${Date.now().toString(36)}`,
      business_id: receivable.businessId,
      businessId: receivable.businessId,
      branchId: "MAIN",
      type: "REVERSAL",
      amount: amtHtg,
      amount_cents: amtCents,
      date: now.split("T")[0],
      description: `Annulation Remboursement Trop-Perçu - ${reason || "Rejet Chèque / Receipt Void"}`,
      category: "PAYROLL_RECOVERY",
      signerId: reversedBy.id,
      currency: receivable.currency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: receivable.receivableAccount,
      credit_account: "1010_BANK",
      debit: amtHtg,
      credit: amtHtg,
      debit_cents: amtCents,
      credit_cents: amtCents,
      isReversal: true,
      metadata: {
        receivableId: receivable.id,
        reversedRepaymentId: repaymentId,
        reversedBy: reversedBy.id,
      },
      created_at: now,
      updated_at: now,
    };

    const updatedReceivable: EmployeeReceivable = {
      ...receivable,
      recoveredCents: activeRepaymentsCents,
      recoveredAmount: activeRepaymentsCents / 100,
      outstandingCents: newOutstandingCents,
      outstandingAmount: newOutstandingCents / 100,
      status: newStatus,
      repayments: updatedRepayments,
      lastReconciledAt: now,
      lastReconciledBy: reversedBy.id,
      updatedAt: now,
    };

    return { updatedReceivable, correctionTx };
  }
}
