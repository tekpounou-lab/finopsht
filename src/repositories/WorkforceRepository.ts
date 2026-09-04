
import { db } from "../lib/firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  doc, 
  serverTimestamp,
  updateDoc,
  deleteDoc
} from "firebase/firestore";

export interface CompensationModelConfig {
  id?: string;
  employeeId: string;
  business_id: string;
  type: "FIXED" | "HOURLY" | "COMMISSION" | "PERCENTAGE" | "HYBRID";
  baseSalaryHtg: number;
  hourlyRateHtg: number;
  commissionRate: number;
  revenuePercentage: number;
  updatedAt?: any;
}

export interface PayrollPolicyConfig {
  id: string;
  business_id: string;
  scope: "COMPANY" | "DEPARTMENT" | "ROLE";
  scopeId: string;
  expectedHours: number;
  latenessToleranceMinutes: number;
  overtimeMultiplier: number;
  lateDeductionHtg: number;
  absenceDeductionHtg: number;
  updatedAt?: any;
}

export interface RoleKpi {
  id: string;
  name: string;
  weight: number;
  target: string;
  description: string;
  currentValue?: number;
}

export interface RoleProfile {
  id: string;
  business_id: string;
  title: string;
  kpis: RoleKpi[];
  updatedAt?: any;
}

export const WorkforceRepository = {
  // Compensation Models
  async getCompensationModels(businessId: string): Promise<CompensationModelConfig[]> {
    const q = query(collection(db, "compensation_models"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CompensationModelConfig));
  },

  async saveCompensationModel(config: CompensationModelConfig): Promise<void> {
    const id = config.id || `comp_${config.employeeId}`;
    await setDoc(doc(db, "compensation_models", id), {
      ...config,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },

  // Payroll Policies
  async getPayrollPolicies(businessId: string): Promise<PayrollPolicyConfig[]> {
    const q = query(collection(db, "payroll_policies"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollPolicyConfig));
  },

  async savePayrollPolicy(policy: PayrollPolicyConfig): Promise<void> {
    await setDoc(doc(db, "payroll_policies", policy.id), {
      ...policy,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },

  async deletePayrollPolicy(id: string): Promise<void> {
    await deleteDoc(doc(db, "payroll_policies", id));
  },

  // Role Profiles
  async getRoleProfiles(businessId: string): Promise<RoleProfile[]> {
    const q = query(collection(db, "role_profiles"), where("business_id", "==", businessId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as RoleProfile));
  },

  async saveRoleProfile(profile: RoleProfile): Promise<void> {
    await setDoc(doc(db, "role_profiles", profile.id), {
      ...profile,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
};
