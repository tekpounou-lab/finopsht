import { db } from "../../../lib/firebase";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import {
  TellerTransaction,
  TellerTransactionType,
  CashTill,
  CurrencyCode
} from "../../../types/cashManagement";
import { CurrencyRateRepository, RateTypology, getHaitiDateString } from "../../../repositories/CurrencyRateRepository";
import { LedgerRepository } from "../../../repositories/LedgerRepository";
import { CashManagementRepository } from "../../../repositories/CashManagementRepository";
import { ForensicLogRepository } from "../../../repositories/ForensicLogRepository";
import { CashAccountMapping } from "../validation/cashAccountMapping";
import { FinopsException } from "../../../modules/runtime/FinopsException";
import { LedgerTransaction } from "../../../types";

export interface PostTellerTransactionParams {
  businessId: string;
  branchId: string;
  tillId: string;
  sessionId: string;
  operatorId: string;
  operatorName: string;
  operatorRole?: string;
  transactionTypeCode: string;
  transactionTypeName: string;
  flowBehavior: 1 | -1 | 0; // 1 = Cash In, -1 = Cash Out
  currency: CurrencyCode;
  amountCents: number;
  
  // Cross-currency & FX details
  isCrossCurrency?: boolean;
  targetCurrency?: CurrencyCode;
  targetAmountCents?: number;
  rateTypology?: RateTypology;
  manualExchangeRate?: number; // Only if authorized by policy, otherwise fetched from central grid
  
  // Custom accounting legs override (optional, defaults to TransactionType and Till account)
  debitAccountCode?: string;
  debitAccountName?: string;
  creditAccountCode?: string;
  creditAccountName?: string;
  
  customerName?: string;
  customerPhone?: string;
  customerIdDocument?: string;
  notes?: string;
  idempotencyKey?: string;
  businessDate?: string;
}

export class TellerTransactionEngine {
  /**
   * Resolves the appropriate FX rate category based on operation type and cash movement direction.
   */
  public static resolveFxRateType(
    flowBehavior: 1 | -1 | 0,
    tillCurrency: CurrencyCode,
    targetCurrency?: CurrencyCode,
    categoryName?: string
  ): RateTypology {
    const cat = (categoryName || "").toUpperCase();
    if (cat.includes("ENVOI") || cat.includes("REMITTANCE")) {
      return flowBehavior === 1 ? "ACHAT_ENVOIE" : "VENTE_ENVOIE";
    }

    // Directional FX Resolution:
    // If Till is USD:
    //   - Flow 1 (Inflow USD): Bank is buying USD -> ACHAT_CLIENT
    //   - Flow -1 (Outflow USD): Bank is selling USD -> VENTE_CLIENT
    // If Till is HTG:
    //   - Flow 1 (Inflow HTG): Bank is selling USD -> VENTE_CLIENT
    //   - Flow -1 (Outflow HTG): Bank is buying USD -> ACHAT_CLIENT
    if (tillCurrency === "USD") {
      return flowBehavior === 1 ? "ACHAT_CLIENT" : "VENTE_CLIENT";
    } else {
      return flowBehavior === 1 ? "VENTE_CLIENT" : "ACHAT_CLIENT";
    }
  }

  /**
   * Posts an operational teller transaction at the till with atomic balanced Ledger entry.
   * Supports multi-currency bridge accounting for FX transactions using account 1920.
   */
  public static async postTransaction(
    params: PostTellerTransactionParams
  ): Promise<{ transaction: TellerTransaction; ledgerTransactions: LedgerTransaction[] }> {
    const { businessId, tillId, amountCents, currency, flowBehavior, operatorId, operatorName } = params;

    if (amountCents <= 0) {
      throw new FinopsException(
        "INVALID_AMOUNT",
        "Le montant de l'opération doit être strictement supérieur à zéro."
      );
    }

    // 1. Idempotency Guard (Anti-duplication)
    if (params.idempotencyKey) {
      const qIdemp = query(
        collection(db, "teller_transactions"),
        where("business_id", "==", businessId),
        where("idempotency_key", "==", params.idempotencyKey)
      );
      const snap = await getDocs(qIdemp);
      if (!snap.empty) {
        const existing = snap.docs[0].data() as TellerTransaction;
        const ledgerSnap = await LedgerRepository.listByBusiness(businessId, { search: existing.id });
        return {
          transaction: existing,
          ledgerTransactions: ledgerSnap
        };
      }
    }

    // 2. Fetch and Validate Till Status
    const till = await CashManagementRepository.getTillById(tillId);
    if (!till) {
      throw new FinopsException("TILL_NOT_FOUND", `La caisse [${tillId}] est introuvable.`);
    }

    if (till.status !== "OPEN") {
      throw new FinopsException(
        "TILL_NOT_OPEN",
        `La caisse "${till.name}" est fermée (${till.status}). Une session active est requise pour passer des écritures.`
      );
    }

    // Invariant: Mono-currency physical till
    if (till.currency !== currency) {
      throw new FinopsException(
        "MONO_CURRENCY_VIOLATION",
        `Incohérence de devise : Cette caisse physique est strictement configurée en [${till.currency}]. Vous ne pouvez pas y enregistrer directement des espèces en [${currency}]. Utilisez le tiroir-caisse dédié ou le module de change FX.`
      );
    }

    // 3. Liquidity Check for Cash Outflow
    if (flowBehavior === -1 && till.balance_cents < amountCents) {
      throw new FinopsException(
        "INSUFFICIENT_TILL_LIQUIDITY",
        `Encaisse insuffisante dans la caisse ${till.name} (${(till.balance_cents / 100).toLocaleString()} ${currency} disponible, tentative de décaissement de ${(amountCents / 100).toLocaleString()} ${currency}).`
      );
    }

    const businessDate = params.businessDate || getHaitiDateString();
    const now = new Date().toISOString();

    // 4. Cross-Currency & FX Rate Resolution
    let appliedRate: number | undefined;
    let rateTypeUsed: RateTypology | undefined;
    let htgEquivalentCents: number = amountCents;
    let resolvedTargetAmountCents: number = params.targetAmountCents || 0;

    if (params.isCrossCurrency) {
      rateTypeUsed =
        params.rateTypology ||
        this.resolveFxRateType(flowBehavior, till.currency, params.targetCurrency, params.transactionTypeName);

      if (params.manualExchangeRate && params.manualExchangeRate > 0) {
        appliedRate = params.manualExchangeRate;
      } else {
        // Central Exchange Rate lookup
        const dailyGrid = await CurrencyRateRepository.getTodayRatesWithFallback(businessId, businessDate);
        appliedRate = dailyGrid.rates[rateTypeUsed] || (currency === "USD" ? 131.5 : 1.0);
      }

      if (currency === "USD") {
        htgEquivalentCents = Math.round(amountCents * (appliedRate || 131.5));
        resolvedTargetAmountCents = resolvedTargetAmountCents || htgEquivalentCents;
      } else {
        htgEquivalentCents = amountCents;
        resolvedTargetAmountCents = resolvedTargetAmountCents || Math.round(amountCents / (appliedRate || 131.5));
      }
    } else {
      if (currency === "USD") {
        const dailyGrid = await CurrencyRateRepository.getTodayRatesWithFallback(businessId, businessDate);
        const refRate = dailyGrid.rates.BRH || 131.5;
        htgEquivalentCents = Math.round(amountCents * refRate);
      }
    }

    // 5. Chart of Accounts Debit / Credit Resolution (Dual Leg for FX)
    const tillAccount = CashAccountMapping.resolveTillAccount(till.currency);
    const fxClearingCode = CashAccountMapping.ACCOUNTS.FX_CLEARING.code;
    
    const ledgerTransactions: LedgerTransaction[] = [];
    const txId = `tx_teller_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    if (params.isCrossCurrency) {
      // BRIDGE ACCOUNTING (Multicurrency Safe) with Realized Gain/Loss recognition
      const targetCurrency = params.targetCurrency || (currency === "HTG" ? "USD" : "HTG");
      const dailyGrid = await CurrencyRateRepository.getTodayRatesWithFallback(businessId, businessDate);
      const refRate = dailyGrid.rates.BRH || 131.5;

      // Leg A: Till Primary Movement (Balanced in Primary Currency)
      const glTxIdA = `gl_${txId}_A`;
      const debitAccA = flowBehavior === 1 ? tillAccount.accountCode : fxClearingCode;
      const creditAccA = flowBehavior === 1 ? fxClearingCode : tillAccount.accountCode;
      
      const ledgerTxA: LedgerTransaction = {
        id: glTxIdA,
        businessId,
        business_id: businessId,
        branchId: params.branchId || till.branch_id || "MAIN_BRANCH",
        branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
        departmentId: "counter",
        date: businessDate,
        description: `[FX LEG A] ${params.transactionTypeName} - ${till.name} (${currency})`,
        amount: amountCents / 100,
        amount_cents: amountCents,
        currency,
        type: flowBehavior === 1 ? "INCOME" : "EXPENSE",
        category: "FX_BRIDGE",
        status: "POSTED",
        debit_account: debitAccA,
        credit_account: creditAccA,
        debit_account_code: debitAccA,
        credit_account_code: creditAccA,
        debit_cents: amountCents,
        credit_cents: amountCents,
        debit_amount_cents: amountCents,
        credit_amount_cents: amountCents,
        source: "SYSTEM",
        signerId: operatorId,
        createdBy: operatorName,
        referenceTransactionId: txId,
        isImmutable: true,
        metadata: { tellerTransactionId: txId, leg: "PRIMARY", tillId: till.id }
      };
      ledgerTransactions.push(ledgerTxA);

      // Leg B: Counter-leg in Target Currency (Balanced in Target Currency)
      const glTxIdB = `gl_${txId}_B`;
      const targetReserve = CashAccountMapping.resolveTillAccount(targetCurrency);
      const debitAccB = flowBehavior === 1 ? fxClearingCode : targetReserve.accountCode;
      const creditAccB = flowBehavior === 1 ? targetReserve.accountCode : fxClearingCode;
      const targetAmt = resolvedTargetAmountCents;

      const ledgerTxB: LedgerTransaction = {
        id: glTxIdB,
        businessId,
        business_id: businessId,
        branchId: params.branchId || till.branch_id || "MAIN_BRANCH",
        branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
        departmentId: "counter",
        date: businessDate,
        description: `[FX LEG B] ${params.transactionTypeName} - Liaison Change (${targetCurrency})`,
        amount: targetAmt / 100,
        amount_cents: targetAmt,
        currency: targetCurrency,
        type: flowBehavior === 1 ? "EXPENSE" : "INCOME",
        category: "FX_BRIDGE",
        status: "POSTED",
        debit_account: debitAccB,
        credit_account: creditAccB,
        debit_account_code: debitAccB,
        credit_account_code: creditAccB,
        debit_cents: targetAmt,
        credit_cents: targetAmt,
        debit_amount_cents: targetAmt,
        credit_amount_cents: targetAmt,
        source: "SYSTEM",
        signerId: operatorId,
        createdBy: operatorName,
        referenceTransactionId: txId,
        isImmutable: true,
        metadata: { tellerTransactionId: txId, leg: "SECONDARY", exchangeRate: appliedRate }
      };
      ledgerTransactions.push(ledgerTxB);

      // Leg C: Realized FX Gain/Loss (Calculated in Base Currency: HTG)
      // The bridge account 1920 must be zeroed in HTG at the Reference Rate.
      const usdAmount = currency === "USD" ? amountCents : resolvedTargetAmountCents;
      const marginResult = CurrencyRateRepository.calculateExchangeMargin({
        amountUsd: usdAmount / 100,
        appliedRate: appliedRate || 131.5,
        officialBrhRate: refRate,
        operationType: flowBehavior === 1 ? (currency === "USD" ? "ACHAT" : "VENTE") : (currency === "USD" ? "VENTE" : "ACHAT")
      });

      const realizedResultCents = Math.round(marginResult.marginHtg * 100);

      if (realizedResultCents !== 0) {
        const glTxIdC = `gl_${txId}_C`;
        const isGain = marginResult.accountCode === CashAccountMapping.ACCOUNTS.FX_GAIN.code;
        
        // To clear 1920:
        // Gain (Bank perspective): Asset Inflow Value > Asset Outflow Value.
        // If Gain, 1920 has a residual balance that needs to be cleared to the Gain account.
        const debitAccC = isGain ? fxClearingCode : marginResult.accountCode;
        const creditAccC = isGain ? marginResult.accountCode : fxClearingCode;

        const ledgerTxC: LedgerTransaction = {
          id: glTxIdC,
          businessId,
          business_id: businessId,
          branchId: params.branchId || till.branch_id || "MAIN_BRANCH",
          branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
          departmentId: "counter",
          date: businessDate,
          description: `[FX LEG C] ${marginResult.accountName}`,
          amount: realizedResultCents / 100,
          amount_cents: realizedResultCents,
          currency: "HTG",
          type: isGain ? "INCOME" : "EXPENSE",
          category: "FX_RESULT",
          status: "POSTED",
          debit_account: debitAccC,
          credit_account: creditAccC,
          debit_account_code: debitAccC,
          credit_account_code: creditAccC,
          debit_amount_cents: realizedResultCents,
          credit_amount_cents: realizedResultCents,
          source: "SYSTEM",
          signerId: operatorId,
          createdBy: operatorName,
          referenceTransactionId: txId,
          isImmutable: true,
          metadata: { tellerTransactionId: txId, leg: "REALIZED_RESULT", refRate }
        };
        ledgerTransactions.push(ledgerTxC);
      }
    } else {
      // STANDARD SINGLE-CURRENCY TRANSACTION
      const glTxId = `gl_${txId}`;
      let debitAccountCode = params.debitAccountCode;
      let creditAccountCode = params.creditAccountCode;

      if (flowBehavior === 1) {
        debitAccountCode = tillAccount.accountCode;
        creditAccountCode = creditAccountCode || (params.transactionTypeCode === "3001" ? "4010" : "1200");
      } else {
        const isExpense = params.transactionTypeCode === "6001" || params.transactionTypeCode === "2001";
        debitAccountCode = debitAccountCode || (isExpense ? "6010" : "1200");
        creditAccountCode = tillAccount.accountCode;
      }

      const ledgerTx: LedgerTransaction = {
        id: glTxId,
        businessId,
        business_id: businessId,
        branchId: params.branchId || till.branch_id || "MAIN_BRANCH",
        branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
        departmentId: "counter",
        date: businessDate,
        description: `[GUICHET] ${params.transactionTypeName} - ${till.name}`,
        amount: amountCents / 100,
        amount_cents: amountCents,
        currency,
        type: flowBehavior === 1 ? "INCOME" : "EXPENSE",
        category: params.transactionTypeName,
        status: "POSTED",
        debit_account: debitAccountCode,
        credit_account: creditAccountCode,
        debit_account_code: debitAccountCode,
        credit_account_code: creditAccountCode,
        debit_cents: amountCents,
        credit_cents: amountCents,
        debit_amount_cents: amountCents,
        credit_amount_cents: amountCents,
        source: "SYSTEM",
        signerId: operatorId,
        createdBy: operatorName,
        referenceTransactionId: txId,
        isImmutable: true,
        metadata: { tellerTransactionId: txId, tillId: till.id }
      };
      ledgerTransactions.push(ledgerTx);
    }

    // 6. Build Teller Transaction Record
    const primaryLeg = ledgerTransactions[0];
    const tellerTx: TellerTransaction = {
      id: txId,
      business_id: businessId,
      branch_id: params.branchId || till.branch_id || "MAIN_BRANCH",
      till_id: till.id,
      session_id: params.sessionId || till.active_session_id || "default_session",
      operator_id: operatorId,
      operator_name: operatorName,
      business_date: businessDate,
      transaction_type_code: params.transactionTypeCode,
      transaction_type_name: params.transactionTypeName,
      flow_behavior: flowBehavior,
      currency,
      amount_cents: amountCents,
      is_cross_currency: params.isCrossCurrency,
      target_currency: params.targetCurrency,
      target_amount_cents: resolvedTargetAmountCents,
      exchange_rate_type: rateTypeUsed,
      applied_exchange_rate: appliedRate,
      htg_equivalent_cents: htgEquivalentCents,
      debit_account_code: primaryLeg.debit_account_code!,
      debit_account_name: params.debitAccountName || (primaryLeg.debit_account_code === fxClearingCode ? "Liaison FX" : till.name),
      credit_account_code: primaryLeg.credit_account_code!,
      credit_account_name: params.creditAccountName || (primaryLeg.credit_account_code === fxClearingCode ? "Liaison FX" : till.name),
      ledger_transaction_id: primaryLeg.id,
      notes: params.notes,
      idempotency_key: params.idempotencyKey,
      status: "POSTED",
      created_at: now
    };

    // 7. Atomic Writes
    for (const lTx of ledgerTransactions) {
      await LedgerRepository.save(lTx);
    }
    await setDoc(doc(db, "teller_transactions", txId), tellerTx);

    // 8. Update Till Balance
    if (flowBehavior === 1) {
      till.balance_cents += amountCents;
    } else if (flowBehavior === -1) {
      till.balance_cents -= amountCents;
    }
    till.updated_at = now;
    await CashManagementRepository.saveTill(till);

    // 9. Forensic Audit Log
    try {
      const glSummary = ledgerTransactions.map((l) => `${l.id} (${l.currency})`).join(", ");
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: businessId,
        actorId: operatorId,
        userName: operatorName,
        userRole: params.operatorRole || "TELLER",
        action: "TELLER_TRANSACTION_POSTED",
        details: `Opération guichet ${params.transactionTypeName} sur ${till.name} : ${(amountCents / 100).toLocaleString()} ${currency} (GL: ${glSummary}).`,
        afterState: { txId, tillId: till.id, newBalanceCents: till.balance_cents },
        timestamp: now
      });
      await ForensicLogRepository.writeForensicLog(log);
    } catch (fErr) {
      console.warn("[TellerTransactionEngine] Forensic log warning:", fErr);
    }

    return { transaction: tellerTx, ledgerTransactions };
  }

  /**
   * Fetches all transactions posted in a specific till session.
   */
  public static async getTransactionsBySession(
    sessionId: string,
    businessId: string
  ): Promise<TellerTransaction[]> {
    if (!sessionId || !businessId) return [];
    try {
      const q = query(
        collection(db, "teller_transactions"),
        where("business_id", "==", businessId),
        where("session_id", "==", sessionId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return [];
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TellerTransaction));
    } catch (e) {
      console.error("[TellerTransactionEngine.getTransactionsBySession] Error:", e);
      return [];
    }
  }

  /**
   * Fetches all transactions posted on a specific till within a date range.
   */
  public static async getTransactionsByTill(
    tillId: string,
    businessId: string,
    startDate?: string,
    endDate?: string
  ): Promise<TellerTransaction[]> {
    if (!tillId || !businessId) return [];
    try {
      const constraints: any[] = [
        where("business_id", "==", businessId),
        where("till_id", "==", tillId)
      ];
      if (startDate) constraints.push(where("business_date", ">=", startDate));
      if (endDate) constraints.push(where("business_date", "<=", endDate));

      const q = query(collection(db, "teller_transactions"), ...constraints);
      const snap = await getDocs(q);
      if (snap.empty) return [];
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TellerTransaction));
      return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } catch (e) {
      console.error("[TellerTransactionEngine.getTransactionsByTill] Error:", e);
      return [];
    }
  }

  /**
   * Convenience wrapper supporting both UI modal and scenario test parameters.
   */
  public static async postTellerTransaction(
    params: any
  ): Promise<{ transaction: TellerTransaction; ledgerTransaction: LedgerTransaction; ledgerTransactions: LedgerTransaction[]; till: CashTill }> {
    const till = await CashManagementRepository.getTillById(params.tillId);
    const resolvedBusinessId = params.businessId || till?.business_id || "";
    const resolvedBranchId = params.branchId || till?.branch_id || "MAIN_BRANCH";
    const resolvedCurrency = params.currency || till?.currency || "HTG";

    const res = await this.postTransaction({
      businessId: resolvedBusinessId,
      branchId: resolvedBranchId,
      tillId: params.tillId,
      sessionId: params.sessionId,
      operatorId: params.operatorId,
      operatorName: params.operatorName,
      operatorRole: params.operatorRole,
      transactionTypeCode:
        params.transactionTypeCode ||
        (params.transactionType === "COLLECTION_CLIENT"
          ? "1001"
          : params.transactionType === "DISBURSEMENT_OPERATION"
          ? "2001"
          : "80001"),
      transactionTypeName: params.transactionTypeName || params.description || "Opération Guichet",
      flowBehavior: params.flowBehavior,
      currency: resolvedCurrency,
      amountCents: params.amountCents,
      isCrossCurrency: params.isCrossCurrency,
      targetCurrency: params.targetCurrency,
      targetAmountCents: params.targetAmountCents,
      manualExchangeRate: params.appliedExchangeRate || params.manualExchangeRate,
      rateTypology: params.exchangeRateType as any,
      customerName: params.counterpartyName || params.customerName,
      notes: params.notes,
      idempotencyKey: params.idempotencyKey,
      businessDate: params.businessDate
    });

    const updatedTill = (await CashManagementRepository.getTillById(params.tillId))!;
    return {
      transaction: res.transaction,
      ledgerTransaction: res.ledgerTransactions[0],
      ledgerTransactions: res.ledgerTransactions,
      till: updatedTill
    };
  }
}
