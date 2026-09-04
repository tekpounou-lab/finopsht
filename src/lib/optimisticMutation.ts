import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

interface OptimisticMutationParams<T> {
  optimisticUpdate: () => void;
  rollback: () => void;
  mutation: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
  mutationName: string;
  business_id: string;
}

export const runOptimisticMutation = async <T>({
  optimisticUpdate,
  rollback,
  mutation,
  onSuccess,
  onError,
  mutationName,
  business_id
}: OptimisticMutationParams<T>): Promise<void> => {
  // Snapshot mechanism goes via the provided rollback function
  
  // Apply optimistic state
  try {
    optimisticUpdate();
  } catch (err) {
    console.error(`[${mutationName}] Failed to apply optimistic update`, err);
    if (onError) onError(err);
    return;
  }

  // Execute mutation
  try {
    const result = await mutation();
    if (onSuccess) onSuccess(result);
  } catch (error) {
    console.error(`[${mutationName}] Firestore mutation failed, rolling back.`, error);
    
    // Rollback
    rollback();
    
    // Emit audit log to Reliability Layer
    try {
      await addDoc(collection(db, "events"), {
        type: "MUTATION_FAILURE",
        business_id,
        payload: { mutationName, error: String(error) },
        status: "DLQ",
        timestamp: serverTimestamp(),
        retryCount: 0
      });
    } catch (auditErr) {
      console.warn("Could not write mutation failure to DLQ", auditErr);
    }
    
    if (onError) onError(error);
  }
};
