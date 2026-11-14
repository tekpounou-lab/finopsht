import {
  InternalTransfer,
  CashTill,
  BranchSafe,
  TransferSourceType,
  TransferDestinationType
} from "../../../types/cashManagement";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import {
  canApproveInternalTransferRole,
  EXECUTIVE_RBAC_ROLES,
  TELLER_ROLES,
  normalizeRole,
  validateRoleOperationalProfileCompatibility
} from "../../rbac/operationalProfilePolicy";

export interface TransferUserContext {
  id: string;
  name: string;
  role: string; // e.g. 'SENIOR_TELLER', 'HEAD_TELLER', 'MASTER_HEAD_TELLER', 'MANAGER', 'OWNER'
  operational_profile?: string;
}

export interface FundSafeParams {
  safeId: string;
  safeName: string;
  currency: "HTG" | "USD";
  amountCents: number;
  fundingCategory: "BANK_WITHDRAWAL" | "INTER_SAFE" | "OWNER_INJECTION" | "TILL_RELIEF";
  sourceId: string;
  sourceName: string;
  bankReference?: string;
  debitAccountCode: string;
  debitAccountName: string;
  creditAccountCode: string;
  creditAccountName: string;
  description: string;
  autoExecute?: boolean;
}

export class CashTransferEngine {
  /**
   * Initiates a new internal transfer request (caisse ↔ coffre ↔ banque ↔ apport)
   */
  static async initiateTransfer(
    businessId: string,
    branchId: string,
    source: { type: TransferSourceType; id: string; name: string },
    destination: { type: TransferDestinationType; id: string; name: string },
    amountCents: number,
    currency: "HTG" | "USD",
    description: string,
    user: TransferUserContext,
    options?: {
      debitAccountCode?: string;
      debitAccountName?: string;
      creditAccountCode?: string;
      creditAccountName?: string;
      bankReference?: string;
      fundingCategory?: "BANK_WITHDRAWAL" | "INTER_SAFE" | "OWNER_INJECTION" | "TILL_RELIEF";
    }
  ): Promise<InternalTransfer> {
    const initiatorRole = normalizeRole(user?.role);
    if (
      !initiatorRole ||
      initiatorRole === "JUNIOR_TELLER" ||
      (!TELLER_ROLES.has(initiatorRole) && !EXECUTIVE_RBAC_ROLES.has(initiatorRole))
    ) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${user?.role || "UNKNOWN"}] n'est pas autorisé à initier un transfert interne.`
      );
    }
    if (user.operational_profile !== undefined) {
      const compat = validateRoleOperationalProfileCompatibility(initiatorRole, user.operational_profile, {
        allowLegacyBarberAlias: false,
        allowMissingForExecutiveOrOversight: true
      });
      if (!compat.valid) {
        throw new FinopsException(compat.code, compat.reason);
      }
    }

    if (amountCents <= 0) {
      throw new FinopsException(
        "INVALID_TRANSFER_AMOUNT",
        "Le montant du transfert doit être supérieur à zéro."
      );
    }

    if (source.type === destination.type && source.id === destination.id) {
      throw new FinopsException(
        "SAME_SOURCE_DESTINATION",
        "La source et la destination ne peuvent pas être identiques."
      );
    }

    // Verify Mono-Currency Invariant on Source and Destination
    const tills = await CashManagementRepository.getTillsByBusiness(businessId);
    const safes = await CashManagementRepository.getSafesByBusiness(businessId);

    if (source.type === "TILL") {
      const srcTill = tills.find((t) => t.id === source.id);
      if (srcTill && srcTill.currency !== currency) {
        throw new FinopsException(
          "CURRENCY_MISMATCH",
          `La caisse source ${srcTill.name} est en ${srcTill.currency}, incompatible avec un transfert en ${currency}.`
        );
      }
      if (srcTill && srcTill.balance_cents < amountCents) {
        throw new FinopsException(
          "INSUFFICIENT_SOURCE_BALANCE",
          `Solde insuffisant dans la caisse source (${(srcTill.balance_cents / 100).toLocaleString()} ${currency} disponible).`
        );
      }
    } else if (source.type === "SAFE") {
      const srcSafe = safes.find((s) => s.id === source.id);
      if (srcSafe && srcSafe.currency !== currency) {
        throw new FinopsException(
          "CURRENCY_MISMATCH",
          `Le coffre source ${srcSafe.name} est en ${srcSafe.currency}, incompatible avec un transfert en ${currency}.`
        );
      }
      if (srcSafe && srcSafe.balance_cents < amountCents) {
        throw new FinopsException(
          "INSUFFICIENT_SOURCE_BALANCE",
          `Solde insuffisant dans le coffre source (${(srcSafe.balance_cents / 100).toLocaleString()} ${currency} disponible).`
        );
      }
    }

    if (destination.type === "TILL") {
      const destTill = tills.find((t) => t.id === destination.id);
      if (destTill && destTill.currency !== currency) {
        throw new FinopsException(
          "CURRENCY_MISMATCH",
          `La caisse destination ${destTill.name} est en ${destTill.currency}, incompatible avec un transfert en ${currency}.`
        );
      }
    } else if (destination.type === "SAFE") {
      const destSafe = safes.find((s) => s.id === destination.id);
      if (destSafe && destSafe.currency !== currency) {
        throw new FinopsException(
          "CURRENCY_MISMATCH",
          `Le coffre destination ${destSafe.name} est en ${destSafe.currency}, incompatible avec un transfert en ${currency}.`
        );
      }
    }

    // Default accounts resolution if not explicitly provided
    const defaultDebit =
      options?.debitAccountCode ||
      (destination.type === "SAFE"
        ? currency === "HTG"
          ? "1015"
          : "1025"
        : currency === "HTG"
        ? "1010"
        : "1020");

    const defaultCredit =
      options?.creditAccountCode ||
      (source.type === "BANK"
        ? currency === "HTG"
          ? "1110"
          : "1120"
        : source.type === "EQUITY_INJECTION"
        ? "3010"
        : source.type === "SAFE"
        ? currency === "HTG"
          ? "1015"
          : "1025"
        : currency === "HTG"
        ? "1010"
        : "1020");

    const transferId = `trf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const transfer: InternalTransfer = {
      id: transferId,
      business_id: businessId,
      branch_id: branchId,
      source_type: source.type,
      source_id: source.id,
      source_name: source.name,
      destination_type: destination.type,
      destination_id: destination.id,
      destination_name: destination.name,
      amount_cents: amountCents,
      currency,
      status: "PENDING_APPROVAL",
      initiator_id: user.id,
      initiator_name: user.name,
      initiator_role: user.role,
      description,
      created_at: new Date().toISOString(),
      debit_account_code: defaultDebit,
      debit_account_name: options?.debitAccountName || (destination.type === "SAFE" ? `Coffre ${currency}` : `Caisse ${currency}`),
      credit_account_code: defaultCredit,
      credit_account_name: options?.creditAccountName || source.name,
      bank_reference: options?.bankReference,
      funding_category: options?.fundingCategory
    };

    await CashManagementRepository.saveTransfer(transfer);

    // Write forensic log
    try {
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        actorId: user.id,
        userName: user.name,
        userRole: user.role,
        action: "INTERNAL_TRANSFER_INITIATED",
        details: `Initiation transfert de ${source.name} vers ${destination.name} : ${(amountCents / 100).toLocaleString()} ${currency} (D: ${defaultDebit} / C: ${defaultCredit}).`,
        afterState: { transferId, status: "PENDING_APPROVAL" },
        timestamp: new Date().toISOString()
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (e) {
      console.warn("Could not write forensic log for transfer initiation", e);
    }

    return transfer;
  }

  /**
   * Dedicated Safe Funding Mechanism directly connected to General Ledger & Chart of Accounts
   */
  static async fundSafe(
    businessId: string,
    branchId: string,
    params: FundSafeParams,
    user: TransferUserContext
  ): Promise<InternalTransfer> {
    if (params.amountCents <= 0) {
      throw new FinopsException(
        "INVALID_AMOUNT",
        "Le montant d'alimentation du coffre doit être strictement supérieur à zéro."
      );
    }

    let sourceType: TransferSourceType = "BANK";
    if (params.fundingCategory === "INTER_SAFE") sourceType = "SAFE";
    else if (params.fundingCategory === "OWNER_INJECTION") sourceType = "EQUITY_INJECTION";
    else if (params.fundingCategory === "TILL_RELIEF") sourceType = "TILL";

    const transfer = await this.initiateTransfer(
      businessId,
      branchId,
      { type: sourceType, id: params.sourceId, name: params.sourceName },
      { type: "SAFE", id: params.safeId, name: params.safeName },
      params.amountCents,
      params.currency,
      params.description,
      user,
      {
        debitAccountCode: params.debitAccountCode,
        debitAccountName: params.debitAccountName,
        creditAccountCode: params.creditAccountCode,
        creditAccountName: params.creditAccountName,
        bankReference: params.bankReference,
        fundingCategory: params.fundingCategory
      }
    );

    // Auto-execution is strictly allowed ONLY for external bank or owner injections (Maker-Checker invariant)
    const isExternalFunding = sourceType === "BANK" || sourceType === "EQUITY_INJECTION";
    const canAutoExecute = isExternalFunding && ["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(
      (user.role || "").toUpperCase()
    );

    if (params.autoExecute && canAutoExecute) {
      return await this.executeTransferDirectly(transfer, user);
    }

    return transfer;
  }

  /**
   * Direct execution helper for Manager/Owner authorized operations (e.g. initial safe capital injection or direct bank fund)
   */
  private static async executeTransferDirectly(
    transfer: InternalTransfer,
    operator: TransferUserContext
  ): Promise<InternalTransfer> {
    const now = new Date().toISOString();
    const updatedTransfer: InternalTransfer = {
      ...transfer,
      status: "EXECUTED",
      approver_id: operator.id,
      approver_name: operator.name,
      approved_at: now,
      executed_at: now
    };

    // 1. Update balances
    await this.applyTransferBalances(updatedTransfer);

    // 2. Post to General Ledger (GL)
    await this.postGeneralLedgerEntry(updatedTransfer, operator);

    // 3. Save transfer state
    await CashManagementRepository.saveTransfer(updatedTransfer);

    // 4. Forensic log
    try {
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: transfer.business_id,
        actorId: operator.id,
        userName: operator.name,
        userRole: operator.role,
        action: "SAFE_FUNDING_EXECUTED_DIRECT",
        details: `Alimentation coffre ${transfer.destination_name} de ${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency} depuis ${transfer.source_name} (GL D:${transfer.debit_account_code} / C:${transfer.credit_account_code}).`,
        afterState: { status: "EXECUTED", amount: transfer.amount_cents },
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (fErr) {
      console.warn("Could not write forensic log for direct execution", fErr);
    }

    return updatedTransfer;
  }

  /**
   * Approves and executes an internal transfer with STRICT MAKER-CHECKER ENFORCEMENT
   */
  static async approveAndExecuteTransfer(
    transferOrId: InternalTransfer | string,
    approverOrId: TransferUserContext | string,
    approverName?: string,
    approverRole?: string
  ): Promise<any> {
    let transfer: InternalTransfer;
    if (typeof transferOrId === "string") {
      const snap = await getDoc(doc(db, "internal_transfers", transferOrId));
      if (!snap.exists()) {
        throw new FinopsException("TRANSFER_NOT_FOUND", `Transfert [${transferOrId}] introuvable.`);
      }
      transfer = snap.data() as InternalTransfer;
    } else {
      transfer = transferOrId;
    }

    let approver: TransferUserContext;
    if (typeof approverOrId === "string") {
      approver = {
        id: approverOrId,
        name: approverName || approverOrId,
        role: approverRole || "MANAGER"
      };
    } else {
      approver = approverOrId;
    }

    // 1. STRICT MAKER-CHECKER RULE
    if (transfer.initiator_id === approver.id) {
      throw new FinopsException(
        "MAKER_CHECKER_VIOLATION",
        "[MAKER_CHECKER_VIOLATION] Règle de Sécurité Maker-Checker : Vous ne pouvez pas approuver un transfert dont vous êtes l'initiateur."
      );
    }

    // 2. Role Permission Check (Step 3 Mandatory Correction: MASTER_HEAD_TELLER strictly denied)
    const normalizedApproverRole = normalizeRole(approver.role);
    if (!normalizedApproverRole || normalizedApproverRole === "MASTER_HEAD_TELLER" || !canApproveInternalTransferRole(normalizedApproverRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${approver.role || "UNKNOWN"}] n'est pas autorisé à approuver les transferts de fonds.`
      );
    }

    if (transfer.status !== "PENDING_APPROVAL") {
      throw new FinopsException(
        "INVALID_TRANSFER_STATUS",
        `Le transfert ${transfer.id} est déjà dans le statut '${transfer.status}' et ne peut plus être approuvé.`
      );
    }

    // 3. Concurrency / Double-execution Guard
    try {
      const snap = await getDoc(doc(db, "internal_transfers", transfer.id));
      if (snap.exists()) {
        const latest = snap.data() as InternalTransfer;
        if (latest.status !== "PENDING_APPROVAL") {
          throw new FinopsException(
            "TRANSFER_ALREADY_PROCESSED",
            `Ce transfert a déjà été traité (statut actuel : ${latest.status}). Opération concurrente rejetée.`
          );
        }
        if (latest.initiator_id === approver.id) {
          throw new FinopsException(
            "MAKER_CHECKER_VIOLATION",
            "[MAKER_CHECKER_VIOLATION] Règle de Sécurité Maker-Checker : Vous ne pouvez pas approuver un transfert dont vous êtes l'initiateur."
          );
        }
      }
    } catch (concurrencyErr: any) {
      if (concurrencyErr instanceof FinopsException) throw concurrencyErr;
    }

    const now = new Date().toISOString();
    const updatedTransfer: InternalTransfer = {
      ...transfer,
      status: "EXECUTED",
      approver_id: approver.id,
      approver_name: approver.name,
      approved_at: now,
      executed_at: now
    };

    // 3. Atomically update balances
    await this.applyTransferBalances(updatedTransfer);

    // 4. Post General Ledger Entry
    await this.postGeneralLedgerEntry(updatedTransfer, approver);

    // 5. Save transfer state
    await CashManagementRepository.saveTransfer(updatedTransfer);

    // 6. Write forensic audit log
    try {
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: transfer.business_id,
        actorId: approver.id,
        userName: approver.name,
        userRole: approver.role,
        action: "INTERNAL_TRANSFER_APPROVED_AND_EXECUTED",
        details: `Approbation Maker-Checker et exécution du transfert ${transfer.id} de ${(transfer.amount_cents / 100).toLocaleString()} ${transfer.currency} (D: ${transfer.debit_account_code} / C: ${transfer.credit_account_code}).`,
        beforeState: { status: transfer.status },
        afterState: { status: "EXECUTED", approverId: approver.id },
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (fErr) {
      console.warn("Could not write forensic log for transfer execution", fErr);
    }

    // Fetch updated source and destination
    const tills = await CashManagementRepository.getTillsByBusiness(transfer.business_id);
    const safes = await CashManagementRepository.getSafesByBusiness(transfer.business_id);

    const source = (transfer.source_type === "TILL"
      ? tills.find((t) => t.id === transfer.source_id)
      : safes.find((s) => s.id === transfer.source_id)) || ({} as any);

    const destination = (transfer.destination_type === "TILL"
      ? tills.find((t) => t.id === transfer.destination_id)
      : safes.find((s) => s.id === transfer.destination_id)) || ({} as any);

    const debitAcc =
      transfer.debit_account_code ||
      (transfer.destination_type === "SAFE"
        ? transfer.currency === "HTG"
          ? "1015"
          : "1025"
        : transfer.currency === "HTG"
        ? "1010"
        : "1020");

    const creditAcc =
      transfer.credit_account_code ||
      (transfer.source_type === "SAFE"
        ? transfer.currency === "HTG"
          ? "1015"
          : "1025"
        : transfer.currency === "HTG"
        ? "1010"
        : "1020");

    const glTx = {
      debit_account: debitAcc,
      credit_account: creditAcc,
      debit_account_code: debitAcc,
      credit_account_code: creditAcc,
      debit_amount_cents: transfer.amount_cents,
      credit_amount_cents: transfer.amount_cents,
      currency: transfer.currency
    };

    return Object.assign(updatedTransfer, {
      transfer: updatedTransfer,
      source,
      destination,
      ledgerTransaction: glTx
    });
  }

  /**
   * Posts double-entry balanced transaction to General Ledger (Grand Livre)
   */
  private static async postGeneralLedgerEntry(
    transfer: InternalTransfer,
    actor: TransferUserContext
  ): Promise<string> {
    const glTxId = `tx_${transfer.id}`;
    const now = new Date().toISOString();

    const debitAcc =
      transfer.debit_account_code ||
      (transfer.destination_type === "SAFE"
        ? transfer.currency === "HTG"
          ? "1015"
          : "1025"
        : transfer.currency === "HTG"
        ? "1010"
        : "1020");

    const creditAcc =
      transfer.credit_account_code ||
      (transfer.source_type === "BANK"
        ? transfer.currency === "HTG"
          ? "1110"
          : "1120"
        : transfer.source_type === "EQUITY_INJECTION"
        ? "3010"
        : transfer.source_type === "SAFE"
        ? transfer.currency === "HTG"
          ? "1015"
          : "1025"
        : transfer.currency === "HTG"
        ? "1010"
        : "1020");

    const desc =
      transfer.description ||
      `Transfert de trésorerie : ${transfer.source_name} ➔ ${transfer.destination_name}${
        transfer.bank_reference ? ` (Réf: ${transfer.bank_reference})` : ""
      }`;

    try {
      await LedgerRepository.save({
        id: glTxId,
        business_id: transfer.business_id,
        businessId: transfer.business_id,
        branchId: transfer.branch_id || "MAIN_BRANCH",
        branch_id: transfer.branch_id || "MAIN_BRANCH",
        departmentId: "treasury",
        department_id: "treasury",
        date: now.slice(0, 10),
        description: desc,
        amount: transfer.amount_cents / 100,
        amount_cents: transfer.amount_cents,
        currency: transfer.currency,
        type: "TRANSFER" as any,
        category: transfer.funding_category || "TRANSFER",
        status: "POSTED",
        debit_account: debitAcc,
        credit_account: creditAcc,
        debit_account_code: debitAcc,
        credit_account_code: creditAcc,
        debit: transfer.amount_cents / 100,
        credit: transfer.amount_cents / 100,
        debit_cents: transfer.amount_cents,
        credit_cents: transfer.amount_cents,
        debit_amount_cents: transfer.amount_cents,
        credit_amount_cents: transfer.amount_cents,
        source: "SYSTEM",
        signerId: actor.id,
        createdBy: actor.name,
        referenceTransactionId: transfer.id,
        isImmutable: true,
        metadata: {
          transferId: transfer.id,
          fundingCategory: transfer.funding_category,
          bankReference: transfer.bank_reference,
          debitAccountCode: debitAcc,
          creditAccountCode: creditAcc,
          sourceType: transfer.source_type,
          destinationType: transfer.destination_type,
          executedBy: actor.name,
          executedAt: now
        }
      });
      transfer.gl_transaction_id = glTxId;
      return glTxId;
    } catch (glErr) {
      console.warn("[CashTransferEngine] Could not post GL entry for transfer execution:", glErr);
      return glTxId;
    }
  }

  /**
   * Rejects an internal transfer with mandatory reason
   */
  static async rejectTransfer(
    transfer: InternalTransfer,
    rejector: TransferUserContext,
    reason: string
  ): Promise<InternalTransfer> {
    const normalizedRejectorRole = normalizeRole(rejector?.role);
    if (!normalizedRejectorRole || normalizedRejectorRole === "MASTER_HEAD_TELLER" || !canApproveInternalTransferRole(normalizedRejectorRole)) {
      throw new FinopsException(
        "FORBIDDEN_ROLE",
        `Le rôle [${rejector?.role || "UNKNOWN"}] n'est pas autorisé à rejeter les transferts de fonds.`
      );
    }

    if (transfer.initiator_id === rejector.id) {
      throw new FinopsException(
        "MAKER_CHECKER_VIOLATION",
        "Séparation des tâches (Maker-Checker) : L'initiateur ne peut pas rejeter sa propre demande de transfert."
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new FinopsException(
        "REJECTION_REASON_REQUIRED",
        "Un motif de rejet est obligatoire pour refuser un transfert de fonds."
      );
    }

    if (transfer.status !== "PENDING_APPROVAL") {
      throw new FinopsException(
        "INVALID_TRANSFER_STATUS",
        `Le transfert ${transfer.id} ne peut pas être rejeté car son statut est '${transfer.status}'.`
      );
    }

    const updatedTransfer: InternalTransfer = {
      ...transfer,
      status: "REJECTED",
      approver_id: rejector.id,
      approver_name: rejector.name,
      rejection_reason: reason.trim(),
      approved_at: new Date().toISOString()
    };

    await CashManagementRepository.saveTransfer(updatedTransfer);

    // Forensic audit log
    try {
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: transfer.business_id,
        actorId: rejector.id,
        userName: rejector.name,
        userRole: rejector.role,
        action: "INTERNAL_TRANSFER_REJECTED",
        details: `Rejet du transfert ${transfer.id}. Motif : ${reason}`,
        beforeState: { status: transfer.status },
        afterState: { status: "REJECTED", reason },
        timestamp: new Date().toISOString()
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (e) {
      console.warn("Could not write forensic log for transfer rejection", e);
    }

    return updatedTransfer;
  }

  /**
   * Updates balance of source and destination
   */
  private static async applyTransferBalances(transfer: InternalTransfer): Promise<void> {
    const tills = await CashManagementRepository.getTillsByBusiness(transfer.business_id);
    const safes = await CashManagementRepository.getSafesByBusiness(transfer.business_id);

    // 1. Deduct from Source (only if source is a physical till or safe)
    if (transfer.source_type === "TILL") {
      const sourceTill = tills.find((t) => t.id === transfer.source_id);
      if (sourceTill) {
        if (sourceTill.balance_cents < transfer.amount_cents) {
          throw new FinopsException(
            "INSUFFICIENT_TILL_BALANCE",
            `Solde insuffisant dans la caisse source (${(sourceTill.balance_cents / 100).toLocaleString()} ${transfer.currency} disponible).`
          );
        }
        sourceTill.balance_cents -= transfer.amount_cents;
        sourceTill.updated_at = new Date().toISOString();
        await CashManagementRepository.saveTill(sourceTill);
      }
    } else if (transfer.source_type === "SAFE") {
      const sourceSafe = safes.find((s) => s.id === transfer.source_id);
      if (sourceSafe) {
        if (sourceSafe.balance_cents < transfer.amount_cents) {
          throw new FinopsException(
            "INSUFFICIENT_SAFE_BALANCE",
            `Solde insuffisant dans le coffre source (${(sourceSafe.balance_cents / 100).toLocaleString()} ${transfer.currency} disponible).`
          );
        }
        sourceSafe.balance_cents -= transfer.amount_cents;
        sourceSafe.updated_at = new Date().toISOString();
        await CashManagementRepository.saveSafe(sourceSafe);
      }
    }
    // If source_type === "BANK" or "EQUITY_INJECTION", funds are injected externally from the bank/capital into the enterprise cash reserve

    // 2. Add to Destination
    if (transfer.destination_type === "TILL") {
      const destTill = tills.find((t) => t.id === transfer.destination_id);
      if (destTill) {
        destTill.balance_cents += transfer.amount_cents;
        destTill.updated_at = new Date().toISOString();
        await CashManagementRepository.saveTill(destTill);
      }
    } else if (transfer.destination_type === "SAFE") {
      const destSafe = safes.find((s) => s.id === transfer.destination_id);
      if (destSafe) {
        destSafe.balance_cents += transfer.amount_cents;
        destSafe.updated_at = new Date().toISOString();
        await CashManagementRepository.saveSafe(destSafe);
      }
    }
  }

  /**
   * Convenience wrapper to request an internal transfer.
   */
  static async requestTransfer(params: {
    business_id: string;
    branch_id?: string;
    source_id: string;
    destination_id: string;
    amount_cents: number;
    currency: "HTG" | "USD";
    initiator_id: string;
    initiator_name: string;
    initiator_role?: string;
    initiator_profile?: string;
    description: string;
    debit_account_code?: string;
    credit_account_code?: string;
  }): Promise<InternalTransfer> {
    const tills = await CashManagementRepository.getTillsByBusiness(params.business_id);
    const safes = await CashManagementRepository.getSafesByBusiness(params.business_id);

    const srcTill = tills.find((t) => t.id === params.source_id);
    const srcSafe = safes.find((s) => s.id === params.source_id);
    const destTill = tills.find((t) => t.id === params.destination_id);
    const destSafe = safes.find((s) => s.id === params.destination_id);

    const sourceType: TransferSourceType = srcTill ? "TILL" : srcSafe ? "SAFE" : "BANK";
    const sourceName = srcTill ? srcTill.name : srcSafe ? srcSafe.name : "Compte Bancaire";

    const destType: TransferDestinationType = destTill ? "TILL" : destSafe ? "SAFE" : "BANK";
    const destName = destTill ? destTill.name : destSafe ? destSafe.name : "Compte Bancaire";

    return this.initiateTransfer(
      params.business_id,
      params.branch_id || srcTill?.branch_id || srcSafe?.branch_id || "MAIN_BRANCH",
      { type: sourceType, id: params.source_id, name: sourceName },
      { type: destType, id: params.destination_id, name: destName },
      params.amount_cents,
      params.currency,
      params.description,
      {
        id: params.initiator_id,
        name: params.initiator_name,
        role: params.initiator_role || "",
        operational_profile: params.initiator_profile
      },
      {
        debitAccountCode: params.debit_account_code,
        creditAccountCode: params.credit_account_code
      }
    );
  }
}
