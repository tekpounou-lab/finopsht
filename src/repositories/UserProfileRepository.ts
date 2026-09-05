import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { UserProfile } from "../types";
import { ForensicLogRepository } from "./ForensicLogRepository";

export const UserProfileRepository = {
  /**
   * Retrieves user profile by UID
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as UserProfile;
    } catch (error) {
      throw handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }
  },

  /**
   * Updates fields on user profile document with serverTimestamp
   */
  async updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<void> {
    try {
      const userRef = doc(db, "users", uid);
      const payload: Record<string, any> = {
        ...data,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      // Clean undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      await setDoc(userRef, payload, { merge: true });
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  },

  /**
   * Updates account_status and accountStatus on user profile
   */
  async updateAccountStatus(
    uid: string, 
    status: "NEW_USER" | "PENDING_MEMBER" | "PENDING_OWNER" | "ACTIVE" | "REJECTED",
    extra: Record<string, any> = {}
  ): Promise<void> {
    try {
      const userRef = doc(db, "users", uid);
      const payload: Record<string, any> = {
        account_status: status,
        accountStatus: status,
        ...extra,
        updatedAt: serverTimestamp(),
        updated_at: serverTimestamp()
      };
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      await setDoc(userRef, payload, { merge: true });

      // Audit status transition
      const log = await ForensicLogRepository.createAndSignLog({
        business_id: extra.business_id || extra.businessId || "global",
        action: `USER_ACCOUNT_STATUS_${status}`,
        actorId: uid,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({ uid, status, ...extra })
      });
      await ForensicLogRepository.writeForensicLog(log).catch(err =>
        console.warn("[UserProfileRepository] Forensic log write warning:", err)
      );
    } catch (error) {
      throw handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    }
  },

  /**
   * Registers personal info when user chooses 'Devenir Membre d'une entreprise'
   */
  async registerMemberInfo(
    uid: string,
    info: {
      firstName: string;
      lastName: string;
      phone: string;
      companyCode?: string;
      email: string;
    }
  ): Promise<void> {
    const fullName = `${info.firstName.trim()} ${info.lastName.trim()}`.trim();
    return this.updateAccountStatus(uid, "PENDING_MEMBER", {
      name: fullName,
      displayName: fullName,
      phoneNumber: info.phone.trim(),
      phone: info.phone.trim(),
      email: info.email.toLowerCase().trim(),
      requested_role: "MEMBER",
      requestedRole: "MEMBER",
      company_code: info.companyCode?.trim() || null,
      companyCode: info.companyCode?.trim() || null,
      onboarding_completed: true,
      onboardingComplete: true
    });
  },

  /**
   * Registers application info when user chooses 'Créer une entreprise'
   */
  async registerOwnerApplication(
    uid: string,
    info: {
      name: string;
      phone?: string;
      email: string;
    }
  ): Promise<void> {
    return this.updateAccountStatus(uid, "PENDING_OWNER", {
      name: info.name.trim(),
      displayName: info.name.trim(),
      phoneNumber: info.phone?.trim() || "",
      phone: info.phone?.trim() || "",
      email: info.email.toLowerCase().trim(),
      requested_role: "OWNER",
      requestedRole: "OWNER",
      onboarding_completed: true,
      onboardingComplete: true
    });
  }
};
