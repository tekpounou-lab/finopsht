import { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../../../lib/firebase";
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { Business } from "../../../types";
import { toast } from "sonner";

export interface TenantWithStats extends Business {
  plan?: string;
  is_suspended?: boolean;
  isTrial?: boolean;
  userCount?: number;
  lastActive?: string;
  databaseUsageBytes?: number;
  businessStatus?: string;
  business_status?: string;
}

export function checkIsPending(t: any): boolean {
  if (!t) return false;
  if (t.isApproved === false || t.approved === false || t.is_approved === false) {
    return true;
  }
  if (t.isPending === true || t.pending === true) {
    return true;
  }

  const statusCandidates = [
    t.status,
    t.businessStatus,
    t.business_status,
    t.accountStatus,
    t.account_status,
    t.approvalStatus,
    t.approval_status,
    t.state,
    t.flowState,
  ].filter(Boolean);

  for (const statusVal of statusCandidates) {
    const norm = String(statusVal).trim().toUpperCase();
    if (
      norm === "PENDING" ||
      norm === "PENDING_APPROVAL" ||
      norm === "PENDING_ACCEPTANCE" ||
      norm === "WAITING_APPROVAL" ||
      norm === "WAITING_SUPERADMIN_APPROVAL" ||
      norm === "BUSINESS_PENDING" ||
      norm === "REQUEST_PENDING" ||
      norm === "WAITING_ROOM" ||
      norm === "IN_ONBOARDING" ||
      norm === "DRAFT"
    ) {
      return true;
    }
  }
  return false;
}

export function checkIsSuspended(t: any): boolean {
  if (!t) return false;
  if (t.is_suspended || t.isSuspended || t.suspended) return true;
  const norm = String(t.status || t.businessStatus || t.business_status || "").trim().toUpperCase();
  return norm === "SUSPENDED" || norm === "BLOCKED" || norm === "DISABLED";
}

export function checkIsActive(t: any): boolean {
  if (!t) return false;
  if (checkIsPending(t) || checkIsSuspended(t)) return false;
  const norm = String(t.status || t.businessStatus || t.business_status || "").trim().toUpperCase();
  return norm === "ACTIVE" || norm === "APPROVED" || !norm;
}

export function useTenantManagement() {
  const [tenants, setTenants] = useState<TenantWithStats[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "ACTIVE" | "SUSPENDED" | "TRIAL">("ALL");
  const [selectedTenant, setSelectedTenant] = useState<TenantWithStats | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    let bizTenants: TenantWithStats[] = [];
    let userPendingTenants: TenantWithStats[] = [];
    let currentUsers: any[] = [];
    let currentEmployees: any[] = [];

    const mergeTenants = (bizList: TenantWithStats[], userList: TenantWithStats[]) => {
      const bizMap = new Map<string, TenantWithStats>();
      bizList.forEach(b => bizMap.set(b.id, b));

      userList.forEach(uBiz => {
        if (!bizMap.has(uBiz.id)) {
          bizMap.set(uBiz.id, uBiz);
        } else {
          // If business exists but status was missing/not pending, elevate if user is pending
          const existing = bizMap.get(uBiz.id)!;
          if (checkIsPending(uBiz) && !checkIsPending(existing) && !checkIsSuspended(existing)) {
            bizMap.set(uBiz.id, { ...existing, status: "PENDING_APPROVAL", ownerId: existing.ownerId || uBiz.ownerId });
          }
        }
      });

      const combined = Array.from(bizMap.values()).map(t => {
        const uCount = currentUsers.filter(u => (u.business_id || u.businessId || u.companyId) === t.id).length;
        const eCount = currentEmployees.filter(e => (e.business_id || e.businessId) === t.id).length;
        return {
          ...t,
          userCount: uCount > 0 ? uCount : 1,
          employeeCount: eCount,
        };
      });

      console.debug("[useTenantManagement] Merged tenants list (SSOT):", {
        total: combined.length,
        totalUsers: currentUsers.length,
        totalEmployees: currentEmployees.length,
        pendingCount: combined.filter(checkIsPending).length,
        activeCount: combined.filter(checkIsActive).length,
        suspendedCount: combined.filter(checkIsSuspended).length,
      });

      setTenants(combined);
      setLoading(false);
    };

    const unsubBiz = onSnapshot(
      collection(db, "businesses"),
      (snapshot) => {
        bizTenants = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        } as TenantWithStats));
        console.log("[useTenantManagement] Fetched bizTenants:", bizTenants.length, bizTenants);
        mergeTenants(bizTenants, userPendingTenants);
      },
      (error: any) => {
        console.error("Error loading businesses:", error);
        setError(error.message || String(error));
        toast.error("Erreur de chargement des organisations.");
        setLoading(false);
      }
    );

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const userDocs = snapshot.docs.map(d => ({ uid: d.id, id: d.id, ...d.data() }));
        currentUsers = userDocs;
        setAllUsers(userDocs);

        const pendingSynthesized: TenantWithStats[] = [];

        userDocs.forEach((u: any) => {
          if (checkIsPending(u)) {
            const bizId = u.businessId || u.business_id || `b_${u.uid}`;
            const bizName = u.companyName || u.businessName || u.organizationName || u.displayName || u.email?.split("@")[0] || "Nouvelle Organisation";
            pendingSynthesized.push({
              id: bizId,
              name: bizName,
              status: "PENDING_APPROVAL",
              ownerId: u.uid,
              currency: u.currency || "HTG",
              plan: u.plan || "ENTERPRISE",
              createdAt: u.createdAt || new Date().toISOString(),
            });
          }
        });

        userPendingTenants = pendingSynthesized;
        mergeTenants(bizTenants, userPendingTenants);
      },
      (error) => {
        console.warn("[useTenantManagement] Users snapshot listener warning:", error);
      }
    );

    const unsubEmployees = onSnapshot(
      collection(db, "employees"),
      (snapshot) => {
        const empDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        currentEmployees = empDocs;
        setAllEmployees(empDocs);
        mergeTenants(bizTenants, userPendingTenants);
      },
      (error) => {
        console.warn("[useTenantManagement] Employees snapshot listener warning:", error);
      }
    );

    return () => {
      unsubBiz();
      unsubUsers();
      unsubEmployees();
    };
  }, []);

  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        !searchQuery ||
        t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const isPending = checkIsPending(t);
      const isSuspended = checkIsSuspended(t);
      const isActive = checkIsActive(t);
      const isTrial = t.plan === "TRIAL" || t.isTrial;
      
      if (statusFilter === "PENDING") return matchSearch && isPending;
      if (statusFilter === "ACTIVE") return matchSearch && isActive;
      if (statusFilter === "SUSPENDED") return matchSearch && isSuspended;
      if (statusFilter === "TRIAL") return matchSearch && isTrial;
      return matchSearch;
    });
  }, [tenants, searchQuery, statusFilter]);

  const approveTenant = useCallback(async (tenantId: string, ownerId?: string) => {
    try {
      console.debug("[useTenantManagement] Approving tenant:", tenantId, "Owner ID:", ownerId);
      const tenantRef = doc(db, "businesses", tenantId);
      await updateDoc(tenantRef, {
        status: "ACTIVE",
        businessStatus: "ACTIVE",
        business_status: "ACTIVE",
        is_suspended: false,
        isSuspended: false,
        updated_at: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(async () => {
        const found = tenants.find(t => t.id === tenantId);
        await setDoc(tenantRef, {
          id: tenantId,
          name: found?.name || "Organisation Approuvée",
          status: "ACTIVE",
          businessStatus: "ACTIVE",
          business_status: "ACTIVE",
          is_suspended: false,
          ownerId: ownerId || found?.ownerId || "",
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }, { merge: true });
      });

      const targetOwnerUid = ownerId || tenants.find(t => t.id === tenantId)?.ownerId;
      if (targetOwnerUid) {
        const userRef = doc(db, "users", targetOwnerUid);
        await updateDoc(userRef, {
          businessStatus: "ACTIVE",
          business_status: "ACTIVE",
          accountStatus: "ACTIVE",
          account_status: "ACTIVE",
          updatedAt: serverTimestamp()
        }).catch(err => console.warn("[useTenantManagement] User status update warning:", err));
      }

      toast.success("Organisation approuvée et activée avec succès !");
    } catch (err) {
      console.error("Failed to approve tenant:", err);
      toast.error("Échec de l'approbation de l'organisation");
    }
  }, [tenants]);

  const rejectTenant = useCallback(async (tenantId: string, ownerId?: string) => {
    try {
      console.debug("[useTenantManagement] Rejecting tenant:", tenantId, "Owner ID:", ownerId);
      const tenantRef = doc(db, "businesses", tenantId);
      await updateDoc(tenantRef, {
        status: "REJECTED",
        businessStatus: "REJECTED",
        business_status: "REJECTED",
        updated_at: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(async () => {
        const found = tenants.find(t => t.id === tenantId);
        await setDoc(tenantRef, {
          id: tenantId,
          name: found?.name || "Organisation Refusée",
          status: "REJECTED",
          businessStatus: "REJECTED",
          business_status: "REJECTED",
          ownerId: ownerId || found?.ownerId || "",
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }, { merge: true });
      });

      const targetOwnerUid = ownerId || tenants.find(t => t.id === tenantId)?.ownerId;
      if (targetOwnerUid) {
        const userRef = doc(db, "users", targetOwnerUid);
        await updateDoc(userRef, {
          businessStatus: "REJECTED",
          business_status: "REJECTED",
          accountStatus: "REJECTED",
          account_status: "REJECTED",
          updatedAt: serverTimestamp()
        }).catch(err => console.warn("[useTenantManagement] User status update warning:", err));
      }

      toast.success("Demande d'organisation refusée");
    } catch (err) {
      console.error("Failed to reject tenant:", err);
      toast.error("Échec du refus de l'organisation");
    }
  }, [tenants]);

  const toggleTenantStatus = useCallback(async (tenantId: string, currentSuspended: boolean) => {
    try {
      const tenantRef = doc(db, "businesses", tenantId);
      await updateDoc(tenantRef, {
        is_suspended: !currentSuspended,
        status: !currentSuspended ? "SUSPENDED" : "ACTIVE",
        updated_at: serverTimestamp(),
      });
      toast.success(!currentSuspended ? "Organisation suspendue" : "Organisation réactivée");
    } catch (err) {
      console.error("Failed to toggle tenant status:", err);
      toast.error("Échec de la mise à jour du statut");
    }
  }, []);

  const updateTenantPlan = useCallback(async (tenantId: string, plan: string) => {
    try {
      const tenantRef = doc(db, "businesses", tenantId);
      await updateDoc(tenantRef, {
        plan,
        updated_at: serverTimestamp(),
      });
      toast.success(`Plan mis à jour : ${plan}`);
    } catch (err) {
      console.error("Failed to update plan:", err);
      toast.error("Échec de la modification du plan");
    }
  }, []);

  const createTenant = useCallback(async (name: string, plan: string, currency: string) => {
    try {
      const docRef = await addDoc(collection(db, "businesses"), {
        name,
        plan,
        currency: currency || "HTG",
        status: "ACTIVE",
        is_suspended: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      toast.success("Organisation créée avec succès !");
      setIsCreateModalOpen(false);
      return docRef.id;
    } catch (err) {
      console.error("Failed to create tenant:", err);
      toast.error("Échec de la création de l'organisation");
      throw err;
    }
  }, []);

  return {
    tenants,
    allUsers,
    allEmployees,
    filteredTenants,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    selectedTenant,
    setSelectedTenant,
    isCreateModalOpen,
    setIsCreateModalOpen,
    toggleTenantStatus,
    approveTenant,
    rejectTenant,
    updateTenantPlan,
    createTenant,
  };
}
