import { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { collection, query, where, doc, setDoc } from "firebase/firestore";
import { realtimeManager, tenantQuery } from "../services/firestore/realtimeManager";
import { Invitation } from "../types";
import { InvitationLifecycleService } from "../services/auth/InvitationLifecycleService";

export function useInvitationsManager(businessId: string | undefined) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  useEffect(() => {
    if (!businessId) {
      setInvitations([]);
      return;
    }

    const qInvites = tenantQuery(
      collection(db, "invitations"),
      businessId
    );
    
    const unsubscribe = realtimeManager.subscribe(
      `invitations:${businessId}`,
      qInvites,
      (snap) => {
        const dbInvites = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Invitation));
        const inviteMap = new Map<string, Invitation>();
        dbInvites.forEach(item => inviteMap.set(item.id, item));
        setInvitations(Array.from(inviteMap.values()));
      },
      (err) => {
        console.error("[useInvitationsManager] Snapshot error:", err);
      }
    );

    return () => unsubscribe();
  }, [businessId]);

  const handleSendInvite = async (invite: Invitation) => {
    const enrichedInvite: Invitation = {
      ...invite,
      token: "tok_" + Math.random().toString(36).substring(2, 12),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    
    setInvitations((prev) => [enrichedInvite, ...prev]);
    
    try {
      const firestoreData = {
        ...enrichedInvite,
        branch_id: invite.branchId,
        department_id: invite.departmentId,
        invited_email: invite.email,
        expiration: enrichedInvite.expiresAt,
        secure_token: enrichedInvite.token,
      };
      await setDoc(doc(db, "invitations", enrichedInvite.id), firestoreData);
    } catch (e) {
      console.error("[useInvitationsManager] Failed to write invitation:", e);
      throw e;
    }
  };

  const handleAcceptInvitation = async (inviteId: string, userId: string, actor: { id: string; name: string; role: string }) => {
    setInvitations((prev) =>
      prev.map((inv) => (inv.id === inviteId ? { ...inv, status: "ACCEPTED" as const } : inv))
    );
    try {
      await InvitationLifecycleService.acceptInvitation(inviteId, userId, actor);
    } catch (e) {
      console.error("[useInvitationsManager] Failed to accept invitation:", e);
      throw e;
    }
  };

  return {
    invitations,
    setInvitations,
    handleSendInvite,
    handleAcceptInvitation,
  };
}
