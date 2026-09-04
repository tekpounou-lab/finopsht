import { useState, useEffect, useRef } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth } from "../lib/firebase";
import { CentralizedCachePurgeManager } from "../modules/identity/CentralizedCachePurgeManager";
import { SecurityAuditLogger } from "../services/security/SecurityAuditLogger";

export interface IdentityVerificationState {
  isVerifying: boolean;
  isSwitchingTenants: boolean;
  currentUser: FirebaseUser | null;
  previousUid: string | null;
  lastVerifiedAt: string | null;
}

/**
 * useIdentityVerification
 * 
 * Centralized identity verification and lifecycle hook that watches auth.currentUser,
 * immediately invalidates all cross-tenant memory caches and Firestore subscriptions
 * upon any user/tenant transition, and enforces a synchronous loading barrier until
 * the new identity is fully resolved and validated.
 */
export function useIdentityVerification(): IdentityVerificationState {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isVerifying, setIsVerifying] = useState<boolean>(true);
  const [isSwitchingTenants, setIsSwitchingTenants] = useState<boolean>(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);

  const prevUidRef = useRef<string | null>(auth.currentUser?.uid || null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const currentUid = user?.uid || null;
      const previousUid = prevUidRef.current;

      if (previousUid && previousUid !== currentUid) {
        console.log(`[useIdentityVerification] User transition detected: ${previousUid} -> ${currentUid || 'NULL'}`);
        setIsSwitchingTenants(true);
        setIsVerifying(true);

        // Immediate synchronous purge of all data caches
        CentralizedCachePurgeManager.purgeAllCaches({
          previousUid,
          newUid: currentUid,
          reason: "AUTH_USER_CHANGE"
        });

        // Audit log the transition
        SecurityAuditLogger.logAuthStateChange({
          action: currentUid ? "LOGIN" : "LOGOUT",
          actorUid: currentUid || previousUid,
          actorEmail: user?.email || null,
          details: { previousUid, currentUid }
        }).catch(err => console.warn("[useIdentityVerification] Audit log error:", err));
      }

      prevUidRef.current = currentUid;
      setCurrentUser(user);
      setLastVerifiedAt(new Date().toISOString());
      setIsVerifying(false);
      setIsSwitchingTenants(false);
    });

    return () => unsubscribe();
  }, []);

  return {
    isVerifying,
    isSwitchingTenants,
    currentUser,
    previousUid: prevUidRef.current,
    lastVerifiedAt
  };
}
