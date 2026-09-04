import { collection, query, where, getDocs, limit, doc, serverTimestamp, writeBatch, runTransaction } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { LedgerTransaction, ForensicLog } from "../types";
import { PaginatedRepository, PaginatedResult } from "./PaginatedRepository";
import { MessageQueue } from "../modules/runtime/EnterpriseMessageQueue";
import { RuntimeEvent } from "../modules/runtime/types";
import { EventBus } from "../modules/runtime/EventBus";
import { CacheInvalidationService } from "../services/performance/CacheInvalidationService";
import { SnapshotRebuildService } from "../services/SnapshotRebuildService";
import { applyDoubleEntryRules, DEFAULT_CHART_OF_ACCOUNTS, detectOrphanTransactions, COST_CENTER_DEFAULT } from "../services/AccountingEngine";
import { durableQueueService } from "../services/queue/DurableQueueService";
import { validateLedgerForeignKeys } from "../validations/integritySchemas";

export interface LedgerQueryOptions {
  startDate?: string;
  endDate?: string;
  period?: string;
  branchId?: string | string[];
  departmentId?: string | string[];
  employeeId?: string | string[];
  type?: string | string[];
  category?: string;
  status?: string | string[];
  search?: string;
  limitTo?: number;
}

/**
 * Constructs a balanced double-entry reversal transaction for a given original transaction.
 * Mirrors and inverts the debit and credit legs of the original transaction while strictly
 * preserving the original accounting date, amounts, and metadata linkage.
 */
export function createReversalEntry(
  originalTx: LedgerTransaction,
  reason?: string,
  userId?: string,
  userName?: string,
  userRole?: string
): LedgerTransaction {
  // 1. Resolve debit and credit accounts on original transaction (with fallbacks if legacy)
  let origDebitAccount = originalTx.debit_account;
  let origCreditAccount = originalTx.credit_account;

  if (!origDebitAccount || !origCreditAccount) {
    const resolved = applyDoubleEntryRules(originalTx);
    origDebitAccount = origDebitAccount || resolved.debit_account || DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK;
    origCreditAccount = origCreditAccount || resolved.credit_account || DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING;
  }

  // 2. Mirror and invert the accounts for double-entry reversal
  // e.g. Original: Debit Bank (1010), Credit Revenue (4000)
  //      Reversal: Debit Revenue (4000), Credit Bank (1010)
  const reversalDebitAccount = origCreditAccount;
  const reversalCreditAccount = origDebitAccount;

  const amount = originalTx.amount;
  const amountCents = originalTx.amount_cents ?? Math.round((originalTx.amount || 0) * 100);

  const reversalTx: LedgerTransaction = {
    ...originalTx,
    id: "tx_rev_" + Math.random().toString(36).substring(2, 9),
    type: "REVERSAL",
    description: reason ? `[REVERSE] ${originalTx.description} (Motif: ${reason})` : `[REVERSE] ${originalTx.description}`,
    // Strictly preserve original transaction date to respect the "independence of exercises" principle
    date: originalTx.date,
    amount: amount,
    amount_cents: amountCents,
    // Populated double-entry legs (Debit & Credit fields and accounts)
    debit_account: reversalDebitAccount,
    credit_account: reversalCreditAccount,
    debit: amount,
    credit: amount,
    debit_cents: amountCents,
    credit_cents: amountCents,
    status: "POSTED",
    source: "SYSTEM",
    isImmutable: true,
    referenceTransactionId: originalTx.id,
    metadata: {
      ...(originalTx.metadata || {}),
      reversalOf: originalTx.id,
      originalTransactionId: originalTx.id,
      referenceTransactionId: originalTx.id,
      reversedByUserId: userId,
      reversedByUserName: userName,
      reversedByUserRole: userRole,
      reason: reason || undefined,
      reversedAt: new Date().toISOString()
    }
  };

  return reversalTx;
}

export const LedgerRepository = {
  createReversalEntry,

  /**
   * Fetches all General Ledger transactions for a business tenant from Firestore.
   */
  async listByBusiness(businessId: string, options: LedgerQueryOptions = {}): Promise<LedgerTransaction[]> {
    if (!businessId) {
      console.warn("[LedgerRepository] listByBusiness called with empty businessId");
      return [];
    }

    const path = `ledger_transactions`;
    console.debug(`[LedgerRepository] listByBusiness | Collection: ${path} | BusinessId: ${businessId} | Options:`, options);

    try {
      const constraints: any[] = [where("business_id", "==", businessId)];

      if (options.limitTo) {
        constraints.push(limit(options.limitTo));
      }
      
      if (options.branchId && options.branchId !== 'ALL') {
        const branchIds = Array.isArray(options.branchId) ? options.branchId : [options.branchId];
        constraints.push(where("branchId", "in", branchIds));
      }
      
      if (options.departmentId && options.departmentId !== 'ALL') {
        const deptIds = Array.isArray(options.departmentId) ? options.departmentId : [options.departmentId];
        constraints.push(where("departmentId", "in", deptIds));
      }

      const q = query(collection(db, path), ...constraints);
      console.debug(`[LedgerRepository] Executing query on ${path} with constraints:`, constraints);
      
      const snap = await getDocs(q);
      const txs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerTransaction));
      
      console.debug(`[LedgerRepository] Found ${txs.length} transactions for business ${businessId}`);
      
      if (txs.length === 0) {
        console.info("[LedgerRepository] Suggestion: No transactions found. Try resetting filters or checking business context.");
      }

      let filtered = txs;

      if (options.startDate && options.endDate) {
        const start = new Date(options.startDate).getTime();
        const end = new Date(options.endDate).getTime();

        filtered = filtered.filter((tx) => {
          const dateStr = tx.date || (tx as any).transaction_date || (tx as any).createdAt;
          const date = new Date(dateStr).getTime();
          return !isNaN(date) && date >= start && date <= end;
        });
      } else if (options.period && options.period !== 'ALL') {
        filtered = filtered.filter((tx) => {
          const dateStr = tx.date || (tx as any).transaction_date || (tx as any).createdAt || '';
          return dateStr.startsWith(options.period!);
        });
      }

      if (options.type && options.type.length > 0 && !options.type.includes('ALL')) {
        const allowedTypes = Array.isArray(options.type) ? options.type : [options.type];
        filtered = filtered.filter((tx) => allowedTypes.includes(tx.type));
      }

      if (options.status && options.status.length > 0 && !options.status.includes('ALL')) {
        const allowedStatuses = Array.isArray(options.status) ? options.status : [options.status];
        filtered = filtered.filter((tx) => allowedStatuses.includes((tx as any).status || 'POSTED'));
      }

      if (options.search && options.search.trim()) {
        const queryTerm = options.search.toLowerCase().trim();
        filtered = filtered.filter((tx) => 
          (tx.description || '').toLowerCase().includes(queryTerm) ||
          (tx.id || '').toLowerCase().includes(queryTerm) ||
          String(tx.amount || '').includes(queryTerm)
        );
      }

      return filtered;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
      return [];
    }
  },

  /**
   * Fetches General Ledger transactions using Firestore cursor-based pagination.
   */
  async listByBusinessPaginated(
    businessId: string,
    options: LedgerQueryOptions & { pageSize?: number; lastDoc?: any } = {}
  ): Promise<PaginatedResult<LedgerTransaction>> {
    if (!businessId) {
      return { items: [], lastDoc: null, hasMore: false, totalFetched: 0 };
    }

    const constraints: any[] = [where("business_id", "==", businessId)];

    if (options.branchId && options.branchId !== 'ALL') {
      const branchIds = Array.isArray(options.branchId) ? options.branchId : [options.branchId];
      constraints.push(where("branchId", "in", branchIds));
    }

    if (options.departmentId && options.departmentId !== 'ALL') {
      const deptIds = Array.isArray(options.departmentId) ? options.departmentId : [options.departmentId];
      constraints.push(where("departmentId", "in", deptIds));
    }

    return await PaginatedRepository.getPaginated<LedgerTransaction>({
      collectionPath: "ledger_transactions",
      constraints,
      pageSize: options.pageSize || 50,
      lastDoc: options.lastDoc,
      orderByField: "date",
      orderDirection: "desc",
      transform: (d) => ({ id: d.id, ...d.data() } as LedgerTransaction)
    });
  },

  /**
   * Saves a single Ledger transaction into Firestore atomically alongside its Outbox Event.
   */
  async save(tx: LedgerTransaction, customEvent?: RuntimeEvent): Promise<void> {
    const businessId = tx.business_id || "biz_default";
    const validation = validateLedgerForeignKeys(tx as any);
    if (!validation.isValid) {
      console.error(`[LedgerRepository] Validation failed for transaction ${tx.id}:`, validation.errors);
      throw new Error(`[LedgerRepository] Integrity check failed: ${validation.errors.join("; ")}`);
    }

    const now = new Date().toISOString();
    const event: RuntimeEvent = customEvent || {
      eventId: `evt_tx_${tx.id}_${Date.now()}`,
      correlationId: `corr_tx_${tx.id}`,
      businessId,
      module: "FINANCIAL_LEDGER",
      aggregate: "LedgerTransaction",
      type: "LEDGER_TRANSACTION_RECORDED",
      eventType: "LEDGER_TRANSACTION_RECORDED",
      source: "LedgerRepository",
      payload: { transactionId: tx.id, amount: tx.amount, type: tx.type, businessId },
      version: "1.0.0",
      status: "PENDING",
      timestamp: now
    };

    try {
      await MessageQueue.persistAndPublishWithTransaction(
        businessId,
        async (transaction) => {
          const txRef = doc(db, "ledger_transactions", tx.id);
          transaction.set(txRef, {
            ...tx,
            updatedAt: serverTimestamp()
          }, { merge: true });
        },
        event
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `ledger_transactions/${tx.id}`);
    }
  },

  /**
   * Reverses a General Ledger transaction atomically.
   * Creates a balanced double-entry mirror entry with inverted debit and credit accounts,
   * preserving the exact original amount and accounting date.
   * Emits LEDGER_TRANSACTION_REVERSED, triggers CacheInvalidationService, and triggers SnapshotRebuildService.
   */
  async reverseTransaction(
    originalTx: LedgerTransaction,
    userId: string,
    userName: string,
    userRole: string,
    reason?: string
  ): Promise<LedgerTransaction> {
    const businessId = originalTx.business_id || "biz_default";
    const now = new Date().toISOString();
    
    // 1. Create balanced double-entry reversal transaction
    const reversalTx = createReversalEntry(originalTx, reason, userId, userName, userRole);

    const updatedOriginalTx: LedgerTransaction = {
      ...originalTx,
      status: "REVERSED",
      metadata: {
        ...(originalTx.metadata || {}),
        reversedBy: reversalTx.id,
        reversedAt: now,
        reversedByUserId: userId,
        reversalReason: reason
      }
    };

    const forensicLog: ForensicLog = {
      id: "f_" + Math.random().toString(36).substring(2, 9),
      timestamp: now,
      userId: userId,
      userName: userName,
      userRole: userRole as any,
      business_id: businessId,
      action: "REVERSAL_ENTRY_CREATED",
      beforeState: JSON.stringify(originalTx),
      afterState: JSON.stringify(reversalTx),
      ipAddress: typeof window !== "undefined" ? window.location.hostname : "127.0.0.1",
      signature: "PENDING"
    };

    const event: RuntimeEvent = {
      eventId: `evt_tx_rev_${reversalTx.id}_${Date.now()}`,
      correlationId: `corr_tx_rev_${originalTx.id}`,
      businessId,
      module: "FINANCIAL_LEDGER",
      aggregate: "LedgerTransaction",
      type: "LEDGER_TRANSACTION_REVERSED",
      eventType: "LEDGER_TRANSACTION_REVERSED",
      source: "LedgerRepository",
      payload: { 
        transactionId: originalTx.id, 
        reversalId: reversalTx.id, 
        amount: originalTx.amount, 
        amount_cents: originalTx.amount_cents,
        businessId 
      },
      version: "1.0.0",
      status: "PENDING",
      timestamp: now
    };

    try {
      await MessageQueue.persistAndPublishWithBatch(
        businessId,
        (batch) => {
          const revRef = doc(db, "ledger_transactions", reversalTx.id);
          batch.set(revRef, { ...reversalTx, updatedAt: serverTimestamp() }, { merge: true });
          
          const origRef = doc(db, "ledger_transactions", originalTx.id);
          batch.set(origRef, { ...updatedOriginalTx, updatedAt: serverTimestamp() }, { merge: true });

          const logRef = doc(db, "forensic_logs", forensicLog.id);
          batch.set(logRef, { ...forensicLog, _server_timestamp: serverTimestamp() });
        },
        event
      );

      // 2. Explicitly publish event on EventBus for local in-memory subscribers
      EventBus.publish(EventBus.createEvent({
        correlationId: `corr_tx_rev_${originalTx.id}`,
        businessId,
        module: "FINANCIAL_LEDGER",
        aggregate: "LedgerTransaction",
        type: "LEDGER_TRANSACTION_REVERSED",
        source: "LedgerRepository",
        payload: {
          transactionId: originalTx.id,
          reversalId: reversalTx.id,
          businessId,
          reversalTx
        }
      }));

      // 3. Trigger unified Cache Invalidation & Snapshot Rebuild for instant real-time UI synchronization
      try {
        CacheInvalidationService.sweepLocal(businessId);
        await SnapshotRebuildService.rebuildActivityTable(businessId);
      } catch (invalidationErr) {
        console.warn("[LedgerRepository] Non-blocking cache/snapshot invalidation warning:", invalidationErr);
      }

      return reversalTx;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `ledger_transactions_reversal`);
      throw error;
    }
  },

  /**
   * Batch writes multiple transactions into Firestore atomically alongside an Outbox Event.
   */
  async batchSave(txs: LedgerTransaction[], customEvent?: RuntimeEvent): Promise<void> {
    if (txs.length === 0) return;
    const businessId = txs[0].business_id || "biz_default";
    const now = new Date().toISOString();
    const event: RuntimeEvent = customEvent || {
      eventId: `evt_batch_tx_${Date.now()}`,
      correlationId: `corr_batch_tx_${Date.now()}`,
      businessId,
      module: "FINANCIAL_LEDGER",
      aggregate: "LedgerTransaction",
      type: "LEDGER_BATCH_TRANSACTIONS_RECORDED",
      eventType: "LEDGER_BATCH_TRANSACTIONS_RECORDED",
      source: "LedgerRepository",
      payload: { count: txs.length, businessId },
      version: "1.0.0",
      status: "PENDING",
      timestamp: now
    };

    try {
      await MessageQueue.persistAndPublishWithBatch(
        businessId,
        (batch) => {
          txs.forEach((tx) => {
            const txRef = doc(db, "ledger_transactions", tx.id);
            batch.set(txRef, {
              ...tx,
              updatedAt: serverTimestamp()
            }, { merge: true });
          });
        },
        event
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `ledger_transactions`);
    }
  },

  /**
   * Enterprise Bulk Import with chunked Firestore Batches (Max 400 ops/batch)
   * Includes transient error retries, atomic Forensic Audit trail logging, AND Outbox Event atomicity.
   */
  async bulkImportWithAudit(
    txs: LedgerTransaction[],
    forensicLog: ForensicLog,
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ success: number; failed: number; errors: any[] }> {
    const MAX_BATCH_SIZE = 400; // Leave space for audit log + outbox event within 500 limit
    const chunks: LedgerTransaction[][] = [];
    
    for (let i = 0; i < txs.length; i += MAX_BATCH_SIZE) {
      chunks.push(txs.slice(i, i + MAX_BATCH_SIZE));
    }

    let successCount = 0;
    let failedCount = 0;
    const errors: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const businessId = chunk[0]?.business_id || forensicLog.business_id || "biz_default";
      const now = new Date().toISOString();
      const deterministicEventId = durableQueueService.generateDeterministicEventId(
        businessId,
        "LEDGER",
        forensicLog.id,
        `bulk_chunk_${i}`,
        { totalChunks: chunks.length, count: chunk.length }
      );

      try {
        await durableQueueService.executeWithRetry(
          async () => {
            const chunkEvent: RuntimeEvent = {
              eventId: deterministicEventId,
              correlationId: `corr_bulk_import_${forensicLog.id}_${i}`,
              businessId,
              module: "FINANCIAL_LEDGER",
              aggregate: "LedgerTransaction",
              type: "LEDGER_BULK_IMPORT_CHUNK_RECORDED",
              eventType: "LEDGER_BULK_IMPORT_CHUNK_RECORDED",
              source: "LedgerRepository",
              payload: { chunkIndex: i, totalChunks: chunks.length, count: chunk.length, businessId },
              version: "1.0.0",
              status: "PENDING",
              timestamp: now
            };

            await MessageQueue.persistAndPublishWithBatch(
              businessId,
              (batch) => {
                chunk.forEach(tx => {
                  const txRef = doc(db, "ledger_transactions", tx.id);
                  batch.set(txRef, {
                    ...tx,
                    updatedAt: serverTimestamp()
                  }, { merge: true });
                });

                // If this is the last chunk, add the forensic log
                if (i === chunks.length - 1) {
                  const logRef = doc(db, "forensic_logs", forensicLog.id);
                  batch.set(logRef, {
                    ...forensicLog,
                    _server_timestamp: serverTimestamp()
                  });
                }
              },
              chunkEvent
            );
          },
          { maxRetries: 3, baseDelayMs: 300, jitterStrategy: "FULL" },
          `LedgerRepository:importBatch:chunk_${i}`
        );

        successCount += chunk.length;
      } catch (error) {
        failedCount += chunk.length;
        errors.push({ chunkIndex: i, error });
        console.error(`Batch import failed for chunk ${i} after retries:`, error);
      }

      if (onProgress) {
        onProgress(Math.min(successCount + failedCount, txs.length), txs.length);
      }
    }

    return { success: successCount, failed: failedCount, errors };
  },

  async batchDeleteTransactions(transactionIds: string[], actor: any): Promise<void> {
    if (!transactionIds.length) return;
    
    // Chunking to handle potential large deletions (Firestore limit is 500 per batch)
    const chunkSize = 400;
    for (let i = 0; i < transactionIds.length; i += chunkSize) {
      const chunk = transactionIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      
      chunk.forEach(id => {
        const ref = doc(db, "ledger_transactions", id);
        batch.delete(ref);
      });
      
      await batch.commit();
    }

    EventBus.publish(EventBus.createEvent({
      correlationId: `bulk_del_gl_${Math.random().toString(36).substr(2, 9)}`,
      actorId: actor?.uid || actor?.id || "SYSTEM",
      businessId: actor?.business_id || "UNKNOWN",
      module: "FINANCE",
      aggregate: "LEDGER",
      type: "LedgerTransactionsDeleted",
      payload: { deletedCount: transactionIds.length, transactionIds }
    }));
  },

  /**
   * Identifies and remediates orphan transactions for a business tenant
   * by assigning the default cost center and balancing double-entry accounts.
   */
  async cleanOrphanTransactions(
    businessId: string,
    defaultCostCenterId: string = COST_CENTER_DEFAULT,
    actor?: any
  ): Promise<{ fixedCount: number; fixedIds: string[] }> {
    if (!businessId) return { fixedCount: 0, fixedIds: [] };

    const transactions = await this.listByBusiness(businessId, { limitTo: 500 });
    const orphans = detectOrphanTransactions(transactions, businessId);

    if (orphans.length === 0) {
      return { fixedCount: 0, fixedIds: [] };
    }

    const fixedIds: string[] = [];
    const chunkSize = 400;

    for (let i = 0; i < orphans.length; i += chunkSize) {
      const chunk = orphans.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach((tx) => {
        const docRef = doc(db, "ledger_transactions", tx.id);
        const resolvedTx = applyDoubleEntryRules(tx);
        const currentCc = (tx as any).cost_center_id || (tx as any).costCenterId;
        const validCc = (!currentCc || currentCc === "none" || currentCc === "ORPHAN" || currentCc === "UNASSIGNED")
          ? defaultCostCenterId
          : currentCc;

        const updatedFields: any = {
          cost_center_id: validCc,
          debit_account: resolvedTx.debit_account || DEFAULT_CHART_OF_ACCOUNTS.ASSETS.BANK,
          credit_account: resolvedTx.credit_account || DEFAULT_CHART_OF_ACCOUNTS.REVENUE.OPERATING,
          isLocked: true,
          updated_at: new Date().toISOString(),
          metadata: {
            ...(tx.metadata || {}),
            orphanRemediatedAt: new Date().toISOString(),
            remediatedBy: actor?.uid || actor?.id || "SYSTEM"
          }
        };
        batch.update(docRef, updatedFields);
        fixedIds.push(tx.id);
      });

      await batch.commit();
    }

    EventBus.publish(EventBus.createEvent({
      correlationId: `remediate_orphan_gl_${Date.now()}`,
      actorId: actor?.uid || actor?.id || "SYSTEM",
      businessId,
      module: "FINANCE",
      aggregate: "LEDGER",
      type: "LEDGER_ORPHAN_TRANSACTIONS_REMEDIATED",
      payload: { remediatedCount: fixedIds.length, defaultCostCenterId, fixedIds }
    }));

    return { fixedCount: fixedIds.length, fixedIds };
  }
};
