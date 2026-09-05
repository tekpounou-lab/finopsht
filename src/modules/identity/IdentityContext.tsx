import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { IdentitySnapshot } from "./types";
import { EnterpriseIdentityOrchestrator } from "./EnterpriseIdentityOrchestrator";
import { clearResilientCache } from "../../utils/resilientFirestore";
import { auth, db, logFirestoreError, OperationType } from "../../lib/firebase";
import { realtimeManager } from "../../services/firestore/realtimeManager";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, query, collection, where, limit } from "firebase/firestore";
import { RuntimeEngine } from "../runtime/RuntimeEngine";
import { PermissionService } from "../../services/PermissionService";
import { CentralizedCachePurgeManager } from "./CentralizedCachePurgeManager";
import { SecurityAuditLogger } from "../../services/security/SecurityAuditLogger";

export type IdentityResolutionStage = 
  | "NOT_STARTED"
  | "LOADING"
  | "PROFILE_FOUND"
  | "PROFILE_NOT_FOUND"
  | "READY"
  | "ERROR";

export interface IdentityContextState {
  identity: IdentitySnapshot | null;
  loading: boolean;
  stage: IdentityResolutionStage;
  isResolved: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshIdentity: (uid?: string) => Promise<void>;
  setRequestedRole: (role: any) => Promise<void>;
  createBusiness: (name: string, options?: any) => Promise<any>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  rejectInvitation: (invitationId: string) => Promise<void>;
}

const IdentityContext = createContext<IdentityContextState | null>(null);

export const IdentityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const resolvedUidRef = React.useRef<string | null>(null);
  const inFlightResolveRef = React.useRef<string | null>(null);

  const [stage, setStage] = useState<IdentityResolutionStage>(() => {
    const hydrated = EnterpriseIdentityOrchestrator.getHydratedSessionSnapshot(auth.currentUser?.uid);
    if (hydrated && (hydrated.onboardingStatus === "COMPLETED" || hydrated.role === "SUPER_ADMIN")) {
      return "READY";
    }
    return auth.currentUser ? "LOADING" : "NOT_STARTED";
  });
  
  const [identity, setIdentity] = useState<IdentitySnapshot | null>(() => {
    const hydrated = EnterpriseIdentityOrchestrator.getHydratedSessionSnapshot(auth.currentUser?.uid);
    if (hydrated && (hydrated.onboardingStatus === "COMPLETED" || hydrated.role === "SUPER_ADMIN")) {
      const bizSnapshot: any = hydrated.businessSnapshot;
      PermissionService.init(
        hydrated.role,
        hydrated.permissions || [],
        bizSnapshot?.featureFlags || bizSnapshot?.data?.settings?.featureFlags || {},
        bizSnapshot?.subscription?.plan || "STARTER",
        bizSnapshot?.subscription?.status || "ACTIVE",
        hydrated.business?.id,
        bizSnapshot?.data?.settings?.roleModuleMatrix || bizSnapshot?.settings?.roleModuleMatrix || bizSnapshot?.roleModuleMatrix
      );
    }
    return hydrated;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    const hydrated = EnterpriseIdentityOrchestrator.getHydratedSessionSnapshot(auth.currentUser?.uid);
    return !hydrated && !!auth.currentUser;
  });
  
  const [error, setError] = useState<string | null>(null);

  // 0. Register with Runtime Engine
  useEffect(() => {
    RuntimeEngine.registerModule({
      name: "IDENTITY",
      version: "3.6.0",
      onInitialize: async () => console.log("[IdentityContext] Identity module initialized")
    });
  }, []);

  // 1. Authoritative Identity Resolution via Orchestrator
  const resolve = useCallback(async (u: FirebaseUser, background = false) => {
    if (!u || !u.uid) return;

    // Coalesce in-flight resolution for the same user
    if (inFlightResolveRef.current === u.uid && background) {
      console.log(`[IdentityContext] Skipping redundant background resolution for ${u.uid} (already in-flight)`);
      return;
    }

    inFlightResolveRef.current = u.uid;
    const correlationId = `res_${Date.now().toString(36)}`;

    try {
      if (!background) {
        setLoading(true);
        setStage("LOADING");
      }
      console.log(`[Resolver][${correlationId}] Orchestration started for UID: ${u.uid} (email: ${u.email})`);
      const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(u);
      
      if (snapshot.orchestratorState === "ERROR" || snapshot.terminalError === "NETWORK_OFFLINE" || snapshot.terminalError === "TIMEOUT_ERROR") {
        console.warn(`[Resolver][${correlationId}] Orchestration terminated with error: ${snapshot.terminalError}`);
        setStage("ERROR");
        setError(snapshot.terminalError || "NETWORK_OFFLINE");
        setIdentity(snapshot);
        return;
      }

      // Check whether profile document was found or not
      if (snapshot.identityStatus === "NEW_USER" && !snapshot.business && !snapshot.employee && !snapshot.invitation) {
        console.log(`[Resolver][${correlationId}] Result: PROFILE_NOT_FOUND (genuine new registration)`);
        setStage("PROFILE_NOT_FOUND");
      } else {
        console.log(`[Resolver][${correlationId}] Result: PROFILE_FOUND (role=${snapshot.role}, biz=${snapshot.business?.id || "none"}, status=${snapshot.identityStatus})`);
        setStage("PROFILE_FOUND");
      }

      // Synchronize permissions immediately before setting state
      if (!auth.currentUser || auth.currentUser.uid !== u.uid) {
        console.log(`[Resolver][${correlationId}] Aborting state update: User state changed during orchestration`);
        return;
      }

      if (snapshot.onboardingStatus === "COMPLETED" || snapshot.role === "SUPER_ADMIN") {
        const bizSnapshot: any = snapshot.businessSnapshot;
        PermissionService.init(
          snapshot.role,
          snapshot.permissions || [],
          bizSnapshot?.featureFlags || bizSnapshot?.data?.settings?.featureFlags || {},
          bizSnapshot?.subscription?.plan || "STARTER",
          bizSnapshot?.subscription?.status || "ACTIVE",
          snapshot.business?.id,
          bizSnapshot?.data?.settings?.roleModuleMatrix || bizSnapshot?.settings?.roleModuleMatrix || bizSnapshot?.roleModuleMatrix
        );
      }

      setIdentity(snapshot);
      setStage("READY");
      setError(null);
      resolvedUidRef.current = u.uid;
      console.log(`[IdentityContext][${correlationId}] State READY: role=${snapshot.role}, onboarding=${snapshot.onboardingStatus}, identityStatus=${snapshot.identityStatus}`);
    } catch (err: any) {
      if (!auth.currentUser || auth.currentUser.uid !== u.uid) return;
      console.error(`[Resolver][${correlationId}] Orchestration failed:`, err);
      setStage("ERROR");
      setError(err.message || "RESOLUTION_FAILED");
    } finally {
      inFlightResolveRef.current = null;
      if (auth.currentUser && auth.currentUser.uid === u.uid) {
        setLoading(false);
      }
    }
  }, []);

  // 2. Auth State Observer with Instant Cache Hydration & Guarded Lifecycle
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      console.log(`[Auth] onAuthStateChanged fired: ${u ? `User ${u.uid} (${u.email})` : "Null (Logged out)"}`);
      if (!u) {
        resolvedUidRef.current = null;
        inFlightResolveRef.current = null;
        CentralizedCachePurgeManager.purgeAllCaches({ reason: "AUTH_SIGNOUT" });
        EnterpriseIdentityOrchestrator.clearSessionCache();
        setUser(null);
        setIdentity(null);
        setStage("NOT_STARTED");
        setLoading(false);
        setError(null);
      } else {
        // If the exact same user is already active and resolved, avoid duplicate resolution cycles
        if (resolvedUidRef.current === u.uid && stage === "READY" && identity?.user_uid === u.uid) {
          console.log(`[IdentityContext] Session already established and active for UID: ${u.uid}. Bypassing redundant resolution.`);
          return;
        }

        setUser((prevUser) => {
          if (prevUser && prevUser.uid !== u.uid) {
            console.log(`[Auth] User switched (${prevUser.uid} -> ${u.uid}). Purging old session caches.`);
            resolvedUidRef.current = null;
            CentralizedCachePurgeManager.purgeAllCaches({ previousUid: prevUser.uid, newUid: u.uid, reason: "AUTH_USER_SWITCH" });
            EnterpriseIdentityOrchestrator.clearSessionCache();
            setIdentity(null);

            SecurityAuditLogger.log({
              eventType: "IDENTITY_RESOLUTION",
              actor_uid: u.uid,
              details: {
                previous_uid: prevUser.uid,
                new_uid: u.uid,
                action: "ACCOUNT_SWITCH_PURGE_SUCCESS"
              }
            }).catch(console.warn);
          }
          return u;
        });

        const cached = EnterpriseIdentityOrchestrator.getCachedSnapshot(u.uid);
        if (cached && cached.user_uid === u.uid) {
          console.log(`[IdentityContext] Hydrating from valid cache for UID: ${u.uid}`);
          setIdentity(cached);
          setStage("READY");
          resolvedUidRef.current = u.uid;
          if (cached.onboardingStatus === "COMPLETED" || cached.role === "SUPER_ADMIN") {
            const bizSnapshot: any = cached.businessSnapshot;
            PermissionService.init(
              cached.role,
              cached.permissions || [],
              bizSnapshot?.featureFlags || bizSnapshot?.data?.settings?.featureFlags || {},
              bizSnapshot?.subscription?.plan || "STARTER",
              bizSnapshot?.subscription?.status || "ACTIVE",
              cached.business?.id,
              bizSnapshot?.data?.settings?.roleModuleMatrix || bizSnapshot?.settings?.roleModuleMatrix || bizSnapshot?.roleModuleMatrix
            );
          }
          setLoading(false);
          // Background revalidation if stale or needed
          if (!cached.lastResolvedAt || (Date.now() - new Date(cached.lastResolvedAt).getTime() > 60000)) {
            resolve(u, true);
          }
        } else {
          setIdentity(null);
          setStage("LOADING");
          resolve(u, false);
        }
      }
    });
  }, [resolve]);

  // 3. Keep static PermissionService synchronized
  useEffect(() => {
    if (identity && (identity.onboardingStatus === "COMPLETED" || identity.role === "SUPER_ADMIN")) {
      const bizSnapshot: any = identity.businessSnapshot;
      PermissionService.init(
        identity.role,
        identity.permissions || [],
        bizSnapshot?.featureFlags || bizSnapshot?.data?.settings?.featureFlags || {},
        bizSnapshot?.subscription?.plan || "STARTER",
        bizSnapshot?.subscription?.status || "ACTIVE",
        identity.business?.id,
        bizSnapshot?.data?.settings?.roleModuleMatrix || bizSnapshot?.settings?.roleModuleMatrix || bizSnapshot?.roleModuleMatrix
      );
    }
  }, [identity]);

  // 3b. SWR Tenant cache update events
  useEffect(() => {
    const handleTenantCacheUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { businessId, context } = customEvent.detail || {};
      if (context && context.business && identity && (identity.business?.id === businessId || !identity.business)) {
        setIdentity((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            business: context.business || prev.business,
            businessSnapshot: context.businessSnapshot || prev.businessSnapshot,
            permissions: context.permissions && context.permissions.length > 0 ? context.permissions : prev.permissions,
          };
        });
      }
    };

    window.addEventListener("finops:tenant_cache_updated", handleTenantCacheUpdated);
    return () => {
      window.removeEventListener("finops:tenant_cache_updated", handleTenantCacheUpdated);
    };
  }, [identity]);

  // 4. Real-Time Listener: User Document (Single Source of Truth Protection)
  useEffect(() => {
    // REQUIREMENT C: Only attach when auth is ready and UID matches
    if (!user || !auth.currentUser || user.uid !== auth.currentUser.uid || stage === "NOT_STARTED") {
      return;
    }

    console.log(`[FirestoreListener] Subscribing to users/${user.uid}`);
    const unsub = realtimeManager.subscribe(
      `user_profile_doc:${user.uid}`,
      doc(db, "users", user.uid),
      (docSnap) => {
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;

        // REQUIREMENT D: Correctly check docSnap.exists()
        if (!docSnap.exists()) {
          console.log(`[FirestoreListener] Document users/${user.uid} not found on Firestore`);
          return;
        }

        const data = docSnap.data();
        console.log(`[FirestoreListener] Real-time sync for users/${user.uid}:`, {
          account_status: data.account_status,
          role: data.role,
          business_id: data.business_id,
          onboarding_completed: data.onboarding_completed
        });

        setIdentity(prev => {
          if (!prev) return null;

          // REQUIREMENT B: Never overwrite valid resolved role with UNASSIGNED fallback
          let nextRole = prev.role;
          if (data.role && data.role !== "UNASSIGNED") {
            nextRole = data.role;
          } else if (prev.employee?.role) {
            nextRole = prev.employee.role;
          } else if (prev.business && prev.business.owner_id === user.uid) {
            nextRole = "OWNER";
          }

          // Account status safety: Never downgrade ACTIVE to NEW_USER
          let nextIdentityStatus = prev.identityStatus;
          if (data.account_status === "ACTIVE" || data.status === "ACTIVE" || prev.employee?.status === "ACTIVE" || nextRole === "SUPER_ADMIN" || prev.onboardingStatus === "COMPLETED") {
            nextIdentityStatus = "ACTIVE";
          } else if (data.account_status === "PENDING_OWNER" || data.account_status === "PENDING_MEMBER") {
            nextIdentityStatus = "INITIAL_IDENTITY";
          } else if (data.account_status === "SUSPENDED" || data.status === "SUSPENDED") {
            nextIdentityStatus = "SUSPENDED";
          } else if (data.account_status === "INVITED") {
            nextIdentityStatus = "INVITED";
          }

          // Onboarding status safety
          const isCompleted = (data.onboarding_completed === true || prev.onboardingStatus === "COMPLETED" || !!prev.employee) && 
                              (prev.business?.status === "ACTIVE" || !prev.business || nextRole === "SUPER_ADMIN");
          const nextOnboarding = isCompleted ? "COMPLETED" : prev.onboardingStatus;

          const updated: IdentitySnapshot = {
            ...prev,
            role: nextRole,
            requested_role: data.requested_role || prev.requested_role,
            identityStatus: nextIdentityStatus,
            onboardingStatus: nextOnboarding as any
          };

          EnterpriseIdentityOrchestrator.cacheSnapshot(user.uid, updated);

          // If relational pointers changed, coordinate a full background re-orchestration
          const businessChanged = data.business_id && prev.business?.id && data.business_id !== prev.business.id;
          const employeeChanged = data.employee_id && prev.employee?.id && data.employee_id !== prev.employee.id;
          if (businessChanged || employeeChanged) {
            console.log(`[FirestoreListener] Relational change detected for ${user.uid}, re-orchestrating in background`);
            resolve(user, true);
          }

          return updated;
        });
      },
      (error) => logFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    );

    return () => {
      console.log(`[FirestoreListener] Unsubscribing from users/${user.uid}`);
      unsub();
    };
  }, [user?.uid, resolve]);

  // 5. Real-Time Listener: Employee Document
  useEffect(() => {
    if (!user || !identity?.employee?.id || !auth.currentUser || user.uid !== auth.currentUser.uid || stage === "NOT_STARTED") {
      return;
    }
    const employeeId = identity.employee.id;
    console.log(`[FirestoreListener] Subscribing to employees/${employeeId}`);

    const unsub = realtimeManager.subscribe(
      `employee_doc:${employeeId}`,
      doc(db, "employees", employeeId),
      (docSnap) => {
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log(`[FirestoreListener] Employee doc update for ${employeeId}:`, data.role, data.status);
          setIdentity(prev => {
            if (!prev) return null;
            const updatedRole = prev.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : (data.role || prev.role);
            const updatedStatus = data.status === "ACTIVE" ? "ACTIVE" : prev.identityStatus;
            const updated: IdentitySnapshot = {
              ...prev,
              role: updatedRole,
              identityStatus: updatedStatus as any,
              employee: { id: docSnap.id, ...data } as any
            };
            EnterpriseIdentityOrchestrator.cacheSnapshot(user.uid, updated);
            return updated;
          });
        }
      },
      (error) => logFirestoreError(error, OperationType.GET, `employees/${employeeId}`)
    );

    return () => {
      unsub();
    };
  }, [user?.uid, identity?.employee?.id]);

  // 6. Real-Time Listener: Business Document & Snapshot
  useEffect(() => {
    if (!user || !identity?.business?.id || !auth.currentUser || user.uid !== auth.currentUser.uid || stage === "NOT_STARTED") {
      return;
    }
    const businessId = identity.business.id;

    const unsubSnap = realtimeManager.subscribe(
      `business_snapshots:${businessId}`,
      doc(db, "business_snapshots", businessId),
      (docSnap) => {
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log(`[FirestoreListener] Business snapshot updated for ${businessId}`);
          setIdentity(prev => {
            if (!prev) return null;
            const updated: IdentitySnapshot = {
              ...prev,
              businessSnapshot: { id: docSnap.id, ...data } as any,
              permissions: data.permissions && data.permissions.length > 0 ? data.permissions : prev.permissions
            };
            EnterpriseIdentityOrchestrator.cacheSnapshot(user.uid, updated);
            return updated;
          });
        }
      },
      (error) => logFirestoreError(error, OperationType.GET, `business_snapshots/${businessId}`)
    );

    const unsubDoc = realtimeManager.subscribe(
      `business_doc:${businessId}`,
      doc(db, "businesses", businessId),
      (docSnap) => {
        if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log(`[FirestoreListener] Business document updated for ${businessId}:`, data.status);
          setIdentity(prev => {
            if (!prev) return null;
            const isBizActive = data.status === "ACTIVE" || data.status === "APPROVED";
            const newOnboarding = isBizActive ? "COMPLETED" : ((data.status === "PENDING" || data.status === "PENDING_APPROVAL") ? "WAITING" : prev.onboardingStatus);
            const updated: IdentitySnapshot = {
              ...prev,
              business: { id: docSnap.id, ...data } as any,
              onboardingStatus: newOnboarding as any
            };
            EnterpriseIdentityOrchestrator.cacheSnapshot(user.uid, updated);
            return updated;
          });
        }
      },
      (error) => logFirestoreError(error, OperationType.GET, `businesses/${businessId}`)
    );

    return () => {
      unsubSnap();
      unsubDoc();
    };
  }, [user?.uid, identity?.business?.id, stage]);

  // 7. Real-Time Listener: Active Invitations
  useEffect(() => {
    if (!user?.email || !auth.currentUser || user.uid !== auth.currentUser.uid || stage === "NOT_STARTED") {
      return;
    }

    const emailLower = user.email.toLowerCase().trim();
    const qInvNorm = query(
      collection(db, "invitations"),
      where("normalizedEmail", "==", emailLower),
      where("status", "in", ["SENT", "PENDING"]),
      limit(5)
    );

    const handleInvitationSnapshot = (snapshot: any) => {
      if (!snapshot.empty) {
        const activeInv = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        console.log(`[FirestoreListener] Real-time invitation detected: ${activeInv.id}`);
        setIdentity(prev => {
          if (!prev) return null;
          if (prev.invitation?.id === activeInv.id && prev.invitation?.status === activeInv.status) {
            return prev;
          }
          return {
            ...prev,
            invitation: activeInv,
            identityStatus: prev.identityStatus === "ACTIVE" ? "ACTIVE" : ("INVITED" as const)
          };
        });
      }
    };

    const unsubNorm = realtimeManager.subscribe(
      `user_invitations_norm:${user.uid}`,
      qInvNorm,
      handleInvitationSnapshot,
      (error) => console.warn("[IdentityContext] Invitations listener notice:", error)
    );

    return () => {
      unsubNorm();
    };
  }, [user?.email, user?.uid, stage]);

  // User Actions
  const setRequestedRole = useCallback(async (role: any) => {
    if (!user) return;
    setIdentity(prev => {
      const base = prev || {
        user_uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        employee: null,
        business: null,
        businessSnapshot: null,
        role: "UNASSIGNED",
        identityStatus: "NEW_USER" as const,
        onboardingStatus: "PENDING_IDENTITY" as const,
        orchestratorState: "ROLE_RESOLVED" as const,
        invitation: null,
        permissions: [],
        lastResolvedAt: new Date().toISOString()
      };
      return {
        ...base,
        requested_role: role
      };
    });

    try {
      await EnterpriseIdentityOrchestrator.setRequestedRole(user, role);
      await resolve(user, true);
    } catch (err: any) {
      console.error("[IdentityContext] setRequestedRole error:", err);
      setError(err.message);
    }
  }, [user, resolve]);

  const createBusiness = useCallback(async (name: string, options: any = {}) => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await EnterpriseIdentityOrchestrator.createBusiness(user, name, options);
      
      setIdentity(prev => {
        const base = prev || {
          user_uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
          employee: null,
          business: null,
          businessSnapshot: null,
          role: "OWNER",
          identityStatus: "ACTIVE" as const,
          onboardingStatus: "WAITING" as const,
          orchestratorState: "READY" as const,
          invitation: null,
          permissions: [],
          lastResolvedAt: new Date().toISOString()
        };
        return {
          ...base,
          role: "OWNER",
          requested_role: "OWNER",
          onboardingStatus: "WAITING" as const,
          business: {
            id: result.businessId,
            name: name,
            status: "PENDING",
            owner_id: user.uid
          } as any
        };
      });

      await resolve(user, false);
      return result;
    } catch (err: any) {
      if (err.message === "BUSINESS_ALREADY_EXISTS") {
        console.log("[IdentityContext] Business already exists for user. Resolving existing workspace...");
        await resolve(user, false);
        setLoading(false);
        return { businessId: `biz_${user.uid}`, employeeId: `emp_${user.uid}` };
      }
      setError(err.message);
      setLoading(false);
      throw err;
    }
  }, [user, resolve]);

  const acceptInvitation = useCallback(async (invitationId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await EnterpriseIdentityOrchestrator.acceptInvitation(invitationId, user);
      await resolve(user);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [user, resolve]);

  const rejectInvitation = useCallback(async (invitationId: string) => {
    if (!user) return;
    setLoading(true);
    try {
      await EnterpriseIdentityOrchestrator.rejectInvitation(invitationId, user);
      await resolve(user);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, [user, resolve]);

  const refreshIdentity = useCallback(async (targetUid?: string) => {
    const activeUser = user || auth.currentUser;
    const target = targetUid || activeUser?.uid;
    console.log(`[IdentityContext] refreshIdentity initiated for UID: ${target || "unknown"}`);
    if (target) {
      EnterpriseIdentityOrchestrator.invalidateCache(target);
      clearResilientCache();
    } else {
      EnterpriseIdentityOrchestrator.clearSessionCache();
      clearResilientCache();
    }
    if (activeUser) {
      inFlightResolveRef.current = null;
      resolvedUidRef.current = null;
      setLoading(true);
      await resolve(activeUser, false);
    }
  }, [user, resolve]);

  const refresh = useCallback(async () => {
    await refreshIdentity(user?.uid);
  }, [refreshIdentity, user?.uid]);

  const value = useMemo(() => ({
    identity,
    loading,
    stage,
    isResolved: stage === "READY",
    error,
    refresh,
    refreshIdentity,
    setRequestedRole,
    createBusiness,
    acceptInvitation,
    rejectInvitation
  }), [identity, loading, stage, error, refresh, refreshIdentity, setRequestedRole, createBusiness, acceptInvitation, rejectInvitation]);

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
};

export const useIdentity = () => {
  const ctx = useContext(IdentityContext);
  return ctx || ({
    identity: null,
    loading: false,
    stage: "NOT_STARTED" as IdentityResolutionStage,
    isResolved: false,
    error: null,
    refresh: async () => {},
    refreshIdentity: async () => {},
    setRequestedRole: async () => {},
    createBusiness: async () => ({}),
    acceptInvitation: async () => {},
    rejectInvitation: async () => {}
  } as IdentityContextState);
};
