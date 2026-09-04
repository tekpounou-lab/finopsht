import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { logger } from "../observability/Logger";

export interface ShardConfig {
  numShards: number;
}

const DEFAULT_NUM_SHARDS = 10;

/**
 * DistributedCounterService
 * 
 * Solves the Firestore 1 write/sec per document limit by spreading high-frequency
 * writes (e.g. payroll disbursements, bank balances, attendance tallies) across N shards.
 */
export class DistributedCounterService {
  /**
   * Initializes sharded counter sub-collection for a parent document.
   */
  public static async initCounter(
    parentDocPath: string,
    counterName: string,
    numShards: number = DEFAULT_NUM_SHARDS
  ): Promise<void> {
    try {
      const batch = writeBatch(db);
      const shardsColRef = collection(db, `${parentDocPath}/${counterName}_shards`);

      for (let i = 0; i < numShards; i++) {
        const shardRef = doc(shardsColRef, i.toString());
        batch.set(
          shardRef,
          {
            count: 0,
            shardId: i,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
      logger.info(`[DistributedCounter] Initialized ${numShards} shards for ${parentDocPath}/${counterName}`);
    } catch (err) {
      logger.error(`[DistributedCounter] Failed to init shards for ${parentDocPath}/${counterName}`, { err });
      throw err;
    }
  }

  /**
   * Increments a distributed counter by picking a random shard to avoid contention.
   */
  public static async incrementCounter(
    parentDocPath: string,
    counterName: string,
    amount: number = 1,
    numShards: number = DEFAULT_NUM_SHARDS
  ): Promise<void> {
    if (amount === 0) return;

    const shardId = Math.floor(Math.random() * numShards).toString();
    const shardRef = doc(db, `${parentDocPath}/${counterName}_shards`, shardId);

    try {
      await updateDoc(shardRef, {
        count: increment(amount),
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      // If the shard does not exist yet, create and increment via setDoc with merge
      if (err?.code === "not-found" || err?.message?.includes("No document to update")) {
        await setDoc(
          shardRef,
          {
            count: increment(amount),
            shardId: parseInt(shardId, 10),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        logger.error(`[DistributedCounter] Error incrementing shard ${shardId} for ${parentDocPath}/${counterName}`, { err });
        throw err;
      }
    }
  }

  /**
   * Reads all shards and aggregates the total value.
   */
  public static async getCount(
    parentDocPath: string,
    counterName: string
  ): Promise<number> {
    try {
      const shardsColRef = collection(db, `${parentDocPath}/${counterName}_shards`);
      const snapshot = await getDocs(shardsColRef);

      let total = 0;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (typeof data.count === "number") {
          total += data.count;
        }
      });

      return total;
    } catch (err) {
      logger.error(`[DistributedCounter] Failed to get total count for ${parentDocPath}/${counterName}`, { err });
      return 0;
    }
  }

  /**
   * Reconciles all shards into a single consolidated total field on the parent document,
   * typically executed at period closing or cycle sealing.
   */
  public static async consolidateToParent(
    parentDocPath: string,
    counterName: string,
    targetFieldName: string
  ): Promise<number> {
    const total = await this.getCount(parentDocPath, counterName);
    const parentDocRef = doc(db, parentDocPath);

    await updateDoc(parentDocRef, {
      [targetFieldName]: total,
      [`${targetFieldName}_lastConsolidatedAt`]: serverTimestamp(),
    });

    logger.info(`[DistributedCounter] Consolidated ${counterName} (${total}) to ${parentDocPath}.${targetFieldName}`);
    return total;
  }
}
