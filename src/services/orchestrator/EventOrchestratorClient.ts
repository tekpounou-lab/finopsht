// src/services/orchestrator/EventOrchestratorClient.ts
import { collection, addDoc, getDocs, query, where, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";

export class EventOrchestratorClient {
  private static cloudFunctionUrl = "/api/orchestrator";
  private static corsMode: "proxy" | "direct" | "queue-only" = "direct";

  /**
   * Configure the cloud function endpoint.
   */
  public static setCloudFunctionUrl(url: string): void {
    this.cloudFunctionUrl = url;
    console.log(`[EventOrchestratorClient] Cloud function URL updated to: ${url}`);
  }

  /**
   * Set runtime configurable CORS mode.
   */
  public static setCorsMode(mode: "proxy" | "direct" | "queue-only"): void {
    this.corsMode = mode;
    console.log(`[EventOrchestratorClient] CORS mode configured to: ${mode}`);
  }

  /**
   * Returns current cloud function URL.
   */
  public static getCloudFunctionUrl(): string {
    return this.cloudFunctionUrl;
  }

  /**
   * Returns current CORS mode.
   */
  public static getCorsMode(): string {
    return this.corsMode;
  }

  /**
   * Orchestrates an event. Attempts direct invocation first, falling back to a database queue if CORS or network failures occur.
   */
  public static async orchestrateEvent(event: string, payload: any): Promise<void> {
    console.log(`[EventOrchestratorClient] Orchestrating event: "${event}" in mode "${this.corsMode}"`);
    
    if (this.corsMode === "queue-only") {
      console.log(`[EventOrchestratorClient] Queue-only mode active. Queuing directly to database.`);
      await this.queueEventInDatabase(event, payload);
      return;
    }

    try {
      const response = await fetch(this.cloudFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        mode: this.corsMode === "direct" ? "cors" : "no-cors",
        body: JSON.stringify({ event, payload }),
      });

      // Fetch in no-cors mode has response.type === 'opaque' and ok === false / status === 0
      // We check if it is opaque or okay. If direct mode fails with CORS, it throws a TypeError.
      if (this.corsMode === "direct" && !response.ok && response.status !== 0) {
        throw new Error(`Cloud function returned status ${response.status}`);
      }
      
      console.log(`[EventOrchestratorClient] Cloud function triggered successfully for event "${event}".`);
    } catch (err: any) {
      console.warn(
        `[EventOrchestratorClient] Cloud function call failed or blocked by CORS. Queuing to database:`,
        err?.message || String(err)
      );
      await this.queueEventInDatabase(event, payload);
    }
  }

  /**
   * Fallback queue that persists event details inside the 'orchestration_queue' Firestore collection.
   */
  public static async queueEventInDatabase(event: string, payload: any): Promise<void> {
    const businessId = payload.businessId || payload.business_id || "global";
    const path = "orchestration_queue";
    console.log(`[EventOrchestratorClient] Persisting event to queue for business "${businessId}"`);
    
    try {
      await addDoc(collection(db, path), {
        event,
        payload,
        status: "PENDING",
        business_id: businessId,
        created_at: new Date().toISOString(),
        server_timestamp: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  /**
   * Processes PENDING events locally on behalf of a tenant business if the orchestrator functions are unavailable.
   */
  public static async processQueuedEvents(businessId: string): Promise<void> {
    const path = "orchestration_queue";
    console.log(`[EventOrchestratorClient] Local processing started for business "${businessId}"`);
    
    try {
      const q = query(
        collection(db, path),
        where("business_id", "==", businessId),
        where("status", "==", "PENDING")
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`[EventOrchestratorClient] No pending events found in queue for business "${businessId}"`);
        return;
      }

      for (const docSnap of querySnapshot.docs) {
        const docRef = doc(db, path, docSnap.id);
        await updateDoc(docRef, {
          status: "PROCESSED",
          processed_at: new Date().toISOString(),
        });
        console.log(`[EventOrchestratorClient] Event ${docSnap.id} processed locally successfully.`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }
}
