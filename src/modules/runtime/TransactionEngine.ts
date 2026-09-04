
import { db } from "../../lib/firebase";
import { runTransaction, Transaction } from "firebase/firestore";
import { EventBus } from "./EventBus";
import { RuntimeEngine } from "./RuntimeEngine";

class EnterpriseTransactionEngine {
  private static instance: EnterpriseTransactionEngine;

  private constructor() {}

  public static getInstance(): EnterpriseTransactionEngine {
    if (!EnterpriseTransactionEngine.instance) {
      EnterpriseTransactionEngine.instance = new EnterpriseTransactionEngine();
    }
    return EnterpriseTransactionEngine.instance;
  }

  /**
   * Executes a business transaction with built-in auditing and event publishing.
   */
  public async execute<T>(
    operationName: string,
    businessId: string,
    work: (transaction: Transaction) => Promise<T>,
    metadata?: any
  ): Promise<T> {
    const correlationId = `tx_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    console.log(`[TransactionEngine] Starting: ${operationName} (CID: ${correlationId})`);

    try {
      const result = await runTransaction(db, async (transaction) => {
        return await work(transaction);
      });

      // Post-commit event publishing
      EventBus.publish(EventBus.createEvent({
        correlationId,
        businessId,
        module: "RUNTIME",
        aggregate: "TRANSACTION",
        type: "TransactionCompleted",
        payload: { operationName, metadata }
      }));

      return result;
    } catch (error: any) {
      RuntimeEngine.reportError("HIGH", `Transaction ${operationName} failed: ${error.message}`, "TX_ENGINE");
      
      EventBus.publish(EventBus.createEvent({
        correlationId,
        businessId,
        module: "RUNTIME",
        aggregate: "TRANSACTION",
        type: "TransactionFailed",
        payload: { operationName, error: error.message }
      }));
      
      throw error;
    }
  }
}

export const TransactionEngine = EnterpriseTransactionEngine.getInstance();
