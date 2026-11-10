import { db } from "../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  deleteDoc,
  orderBy
} from "firebase/firestore";
import {
  CashTill,
  BranchSafe,
  TillSession,
  InternalTransfer
} from "../types/cashManagement";
import { Employee } from "../types";
import { EmployeeRepository } from "./EmployeeRepository";
import { CashAccountMapping } from "../domains/cash/validation/cashAccountMapping";
import { EmployeeCashEligibilityService } from "../domains/cash/services/EmployeeCashEligibilityService";

export class CashManagementRepository {
  // --- CASH TILLS (NIVEAU 3) ---
  static async getTillsByBusiness(businessId: string): Promise<CashTill[]> {
    if (!db || !businessId) return [];
    try {
      const q = query(
        collection(db, "cash_tills"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return [];
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTill));
    } catch (err) {
      console.error("Firestore cash_tills read error:", err);
      return [];
    }
  }

  static async getTillById(tillId: string): Promise<CashTill | null> {
    if (!db || !tillId) return null;
    try {
      const ref = doc(db, "cash_tills", tillId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as CashTill;
    } catch (err) {
      console.error("Firestore getTillById error:", err);
      return null;
    }
  }

  static async saveTill(till: CashTill): Promise<void> {
    if (!db || !till.id) return;
    try {
      // Ensure authoritative accounting account mapping
      if (!till.linked_account_code) {
        const resolved = CashAccountMapping.resolveTillAccount(till.currency);
        till.linked_account_code = resolved.accountCode;
        till.linked_account_name = resolved.accountName;
      }
      till.type = "TILL";
      // Validate mapping integrity (prevent currency mismatch)
      CashAccountMapping.validateCashLocationMapping("TILL", till.currency, till.linked_account_code);

      const ref = doc(db, "cash_tills", till.id);
      await setDoc(ref, till, { merge: true });
    } catch (err) {
      console.error("Firestore save cash till error:", err);
      throw err;
    }
  }

  static async deleteTill(tillId: string): Promise<void> {
    if (!db || !tillId) return;
    try {
      const ref = doc(db, "cash_tills", tillId);
      await deleteDoc(ref);
    } catch (err) {
      console.error("Firestore delete cash till error:", err);
      throw err;
    }
  }

  // --- BRANCH SAFES (NIVEAUX 1 & 2) ---
  static async getSafesByBusiness(businessId: string): Promise<BranchSafe[]> {
    if (!db || !businessId) return [];
    try {
      const q = query(
        collection(db, "branch_safes"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return [];
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BranchSafe));
    } catch (err) {
      console.error("Firestore branch_safes read error:", err);
      return [];
    }
  }

  static async getSafeById(safeId: string): Promise<BranchSafe | null> {
    if (!db || !safeId) return null;
    try {
      const ref = doc(db, "branch_safes", safeId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as BranchSafe;
    } catch (err) {
      console.error("Firestore getSafeById error:", err);
      return null;
    }
  }

  static async saveSafe(safe: BranchSafe): Promise<void> {
    if (!db || !safe.id) return;
    try {
      // Ensure authoritative accounting account mapping
      if (!safe.linked_account_code) {
        const resolved = CashAccountMapping.resolveSafeAccount(safe.currency);
        safe.linked_account_code = resolved.accountCode;
        safe.linked_account_name = resolved.accountName;
      }
      safe.type = "SAFE";
      // Validate mapping integrity (prevent customer receivables or revenue on safes)
      CashAccountMapping.validateCashLocationMapping("SAFE", safe.currency, safe.linked_account_code);

      const ref = doc(db, "branch_safes", safe.id);
      await setDoc(ref, safe, { merge: true });
    } catch (err) {
      console.error("Firestore save branch safe error:", err);
      throw err;
    }
  }

  static async deleteSafe(safeId: string): Promise<void> {
    if (!db || !safeId) return;
    try {
      const ref = doc(db, "branch_safes", safeId);
      await deleteDoc(ref);
    } catch (err) {
      console.error("Firestore delete branch safe error:", err);
      throw err;
    }
  }

  // --- TILL SESSIONS ---
  static async getSessionsByBusiness(
    businessId: string
  ): Promise<TillSession[]> {
    if (!db || !businessId) return [];
    try {
      const q = query(
        collection(db, "till_sessions"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return [];
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TillSession));
    } catch (err) {
      console.error("Firestore till_sessions read error:", err);
      return [];
    }
  }

  static async saveSession(session: TillSession): Promise<void> {
    if (!db || !session.id) return;
    try {
      const ref = doc(db, "till_sessions", session.id);
      await setDoc(ref, session, { merge: true });
    } catch (err) {
      console.error("Firestore save till session error:", err);
      throw err;
    }
  }

  // --- INTERNAL TRANSFERS ---
  static async getTransfersByBusiness(
    businessId: string
  ): Promise<InternalTransfer[]> {
    if (!db || !businessId) return [];
    try {
      const q = query(
        collection(db, "internal_transfers"),
        where("business_id", "==", businessId)
      );
      const snap = await getDocs(q);
      if (snap.empty) return [];
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as InternalTransfer)
      );
      // Sort newest first
      return list.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (err) {
      console.error("Firestore internal_transfers read error:", err);
      return [];
    }
  }

  static async saveTransfer(transfer: InternalTransfer): Promise<void> {
    if (!db || !transfer.id) return;
    try {
      const ref = doc(db, "internal_transfers", transfer.id);
      await setDoc(ref, transfer, { merge: true });
    } catch (err) {
      console.error("Firestore save internal transfer error:", err);
      throw err;
    }
  }

  static async assignTillTeller(tillId: string, tellerId: string, tellerName: string): Promise<void> {
    if (!db || !tillId) return;
    try {
      const ref = doc(db, "cash_tills", tillId);
      await setDoc(
        ref,
        {
          assigned_teller_id: tellerId,
          assigned_teller_name: tellerName,
          updated_at: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Firestore assignTillTeller error:", err);
      throw err;
    }
  }

  // --- AUTO PROVISIONING & ASSIGNMENT WITH EXISTING EMPLOYEES (SERVER-SIDE ADMIN SDK PATH - PHASE D2) ---
  static PROVISIONING_API_ENDPOINT = "/api/cash/tills/auto-provision";

  static async autoProvisionTillsForBusiness(
    businessId: string,
    branchId: string = "MAIN_BRANCH",
    initialEmployees?: Employee[]
  ): Promise<{
    tillsCreated: number;
    safesCreated: number;
    existingTillsCount?: number;
    existingSafesCount?: number;
    totalTills: number;
    tills: CashTill[];
    safes: BranchSafe[];
    createdTills?: CashTill[];
    existingTills?: CashTill[];
  }> {
    if (!businessId || typeof businessId !== "string" || !businessId.trim()) {
      const err: any = new Error("INVALID_BUSINESS_ID: Un identifiant d'entreprise valide est requis.");
      err.code = "INVALID_BUSINESS_ID";
      throw err;
    }

    const cleanBusinessId = businessId.trim();
    const cleanBranchId =
      typeof branchId === "string" && branchId.trim() ? branchId.trim() : "MAIN_BRANCH";

    try {
      // 1. Gather candidate employees from initialEmployees and EmployeeRepository
      let candidateEmployees: Employee[] =
        Array.isArray(initialEmployees) && initialEmployees.length > 0 ? [...initialEmployees] : [];

      const firestoreEmployees = await EmployeeRepository.listAll(cleanBusinessId);
      if (firestoreEmployees && firestoreEmployees.length > 0) {
        const existingIds = new Set(candidateEmployees.map((e) => e.id));
        for (const fe of firestoreEmployees) {
          if (!existingIds.has(fe.id)) {
            candidateEmployees.push(fe);
            existingIds.add(fe.id);
          }
        }
      }

      // Filter candidate employees using authoritative EmployeeCashEligibilityService
      const activeEmployees = candidateEmployees.filter((e) => {
        const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment(
          e,
          [],
          "HTG",
          cleanBusinessId
        );
        return eligibility.isEligible;
      });

      // 2. Obtain verified Firebase ID token (zero unauthenticated or client-side write fallback)
      const { auth } = await import("../lib/firebase");
      const currentUser = auth?.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : "";

      if (!token) {
        const authErr: any = new Error(
          "UNAUTHORIZED: Authentification requise pour le provisionnement automatique des caisses."
        );
        authErr.code = "UNAUTHORIZED";
        authErr.status = 401;
        throw authErr;
      }

      // 3. Invoke controlled server-side endpoint (Firebase Admin SDK)
      const response = await fetch(this.PROVISIONING_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "x-business-id": cleanBusinessId
        },
        body: JSON.stringify({
          businessId: cleanBusinessId,
          branchId: cleanBranchId,
          initialEmployees: activeEmployees
        })
      });

      let payload: any = null;
      const rawText = await response.text();
      if (rawText && rawText.trim().startsWith("{")) {
        try {
          payload = JSON.parse(rawText);
        } catch {
          payload = null;
        }
      }

      if (!response.ok || !payload || payload.success !== true) {
        const errCode = payload?.error || payload?.code || `HTTP_${response.status}`;
        const errMsg =
          payload?.message ||
          payload?.error ||
          `Échec du provisionnement serveur (HTTP ${response.status}).`;
        const serverErr: any = new Error(errMsg);
        serverErr.code = errCode;
        serverErr.status = response.status;
        throw serverErr;
      }

      return {
        tillsCreated: Number(payload.tillsCreated ?? 0),
        safesCreated: Number(payload.safesCreated ?? 0),
        existingTillsCount: Number(payload.existingTillsCount ?? 0),
        existingSafesCount: Number(payload.existingSafesCount ?? 0),
        totalTills: Number(
          payload.totalTills ?? (Array.isArray(payload.tills) ? payload.tills.length : 0)
        ),
        tills: Array.isArray(payload.tills) ? payload.tills : [],
        safes: Array.isArray(payload.safes) ? payload.safes : [],
        createdTills: Array.isArray(payload.createdTills) ? payload.createdTills : [],
        existingTills: Array.isArray(payload.existingTills) ? payload.existingTills : []
      };
    } catch (err) {
      console.warn("[CashManagementRepository.autoProvisionTillsForBusiness] Warning:", err);
      throw err;
    }
  }
}
