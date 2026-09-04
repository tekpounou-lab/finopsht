import { Employee, LedgerTransaction, AttendanceRecord, PayrollCycle, PayrollRecord, ForensicLog, ERPEvent, Business, Branch, Department } from "./types";

// Constant initial ERP dimensions
export const sampleBusinesses: Business[] = [
  { id: "b1", name: "Tek Pou Nou Solutions", nif: "000-123-456-7", domain: "tekpounou.net", status: "ACTIVE", created_at: "", updated_at: "" },
  { id: "b2", name: "Kokoye Agriservice S.A.", nif: "000-987-654-3", domain: "kokoye.com", status: "ACTIVE", created_at: "", updated_at: "" },
  { id: "b3", name: "Anba Tonèl Restaurants", nif: "000-444-555-1", domain: "anbatonel.ht", status: "ACTIVE", created_at: "", updated_at: "" }
];

export const sampleBranches: Branch[] = [
  { id: "br1", business_id: "b1", name: "Port-au-Prince Centre", location: "Rue du Centre, Port-au-Prince" },
  { id: "br2", business_id: "b1", name: "Pétion-Ville Headquarters", location: "Rue Panachée, Pétion-Ville" },
  { id: "br3", business_id: "b2", name: "Cap-Haïtien Distri", location: "Avenue Jean-Jacques Dessalines, Cap-Haïtien" },
  { id: "br4", business_id: "b3", name: "Delmas Gourmet", location: "Delmas 48, Port-au-Prince" }
];

export const sampleDepartments: Department[] = [
  { id: "d1", business_id: "b1", name: "Direction & Finance" },
  { id: "d2", business_id: "b1", name: "Technologie & Dev" },
  { id: "d3", business_id: "b1", name: "Logistique & Ventes" },
  { id: "d4", business_id: "b1", name: "Restauration & Cuisine" }
];

export const sampleEmployees: Employee[] = [
  { id: "e1", business_id: "b1", branchId: "br2", departmentId: "d1", name: "Manoel Lhérisson", email: "manoel@tekpounou.net", role: "OWNER", baseSalary: 75000, paymentModel: "FIXED" },
  { id: "e2", business_id: "b1", branchId: "br2", departmentId: "d2", name: "Fabienne Jean-Gilles", email: "fabienne@tekpounou.net", role: "MANAGER", baseSalary: 64000, paymentModel: "HYBRID" },
  { id: "e3", business_id: "b1", branchId: "br1", departmentId: "d3", name: "Jean-Claude Pierre", email: "jean-claude@tekpounou.net", role: "SUPERVISOR", baseSalary: 45000, paymentModel: "FIXED" },
  { id: "e4", business_id: "b1", branchId: "br1", departmentId: "d3", name: "Loveline Altidor", email: "loveline@tekpounou.net", role: "EMPLOYEE", baseSalary: 32000, paymentModel: "COMMISSION" },
  { id: "e5", business_id: "b1", branchId: "br2", departmentId: "d2", name: "Ephraïm Destiné", email: "ephraim@tekpounou.net", role: "EMPLOYEE", baseSalary: 38000, paymentModel: "HYBRID" },
  
  // Kokoye
  { id: "e6", business_id: "b2", branchId: "br3", departmentId: "d3", name: "Dieudonné Joseph", email: "dieudonne@kokoye.com", role: "MANAGER", baseSalary: 55000, paymentModel: "FIXED" },
  { id: "e7", business_id: "b2", branchId: "br3", departmentId: "d3", name: "Marie-Maud Charles", email: "mariemaud@kokoye.com", role: "EMPLOYEE", baseSalary: 28000, paymentModel: "FIXED" },

  // Anba Tonèl
  { id: "e8", business_id: "b3", branchId: "br4", departmentId: "d4", name: "Chef Ronald Latortue", email: "ronald@anbatonel.ht", role: "MANAGER", baseSalary: 48000, paymentModel: "FIXED" },
  { id: "e9", business_id: "b3", branchId: "br4", departmentId: "d4", name: "Rose-Marlene Hyppolite", email: "rosemarlene@anbatonel.ht", role: "EMPLOYEE", baseSalary: 22000, paymentModel: "HYBRID" }
];

export const sampleLedgerTransactions: LedgerTransaction[] = [
  {
    id: "t1",
    business_id: "b1",
    branchId: "br2",
    type: "INCOME",
    amount: 1545000,
    amount_cents: 154500000,
    description: "Paiement Facture Client #8949 Gasy-Dev",
    date: "2026-05-15",
    category: "Prestation Service",
    isImmutable: true,
    signerId: "e1",
    currency: "HTG",
    status: "POSTED",
    source: "MANUAL"
  },
  {
    id: "t2",
    business_id: "b1",
    branchId: "br2",
    type: "EXPENSE",
    amount: 480000,
    amount_cents: 48000000,
    description: "Achat serveurs d'administration et routeurs",
    date: "2026-05-18",
    category: "Équipements",
    isImmutable: true,
    signerId: "e1",
    currency: "HTG",
    status: "POSTED",
    source: "MANUAL"
  },
  {
    id: "t3",
    business_id: "b1",
    branchId: "br1",
    type: "ADVANCE",
    employeeId: "e4",
    employeeName: "Loveline Altidor",
    amount: 6000,
    amount_cents: 600000,
    description: "Avance approuvée quinzaine Mai pour frais de santé",
    date: "2026-05-20",
    category: "Avance",
    isImmutable: true,
    signerId: "e2",
    currency: "HTG",
    status: "POSTED",
    source: "MANUAL"
  },
  {
    id: "t4",
    business_id: "b2",
    branchId: "br3",
    type: "INCOME",
    amount: 980000,
    amount_cents: 98000000,
    description: "Vente en gros cacao fermenté biologique SÉCHÉ",
    date: "2026-05-12",
    category: "Marchandise",
    isImmutable: true,
    signerId: "e6",
    currency: "HTG",
    status: "POSTED",
    source: "MANUAL"
  },
  {
    id: "t5",
    business_id: "b3",
    branchId: "br4",
    type: "EXPENSE",
    amount: 125000,
    amount_cents: 12500000,
    description: "Approvisionnement Cuisine (Bananes, Viande Cabrit, Épices)",
    date: "2026-05-22",
    category: "Restauration Ingrédients",
    isImmutable: true,
    signerId: "e8",
    currency: "HTG",
    status: "POSTED",
    source: "MANUAL"
  }
];

export const samplePayrollCycles: PayrollCycle[] = [
  { id: "c1", business_id: "b1", cycleName: "Quinzaine 1 - Mai 2026", cycleType: "REGULAR_FIRST_HALF", effectiveAccountingDate: "2026-05-15", startDate: "2026-05-01", endDate: "2026-05-15", status: "PAID", validatedBy: "Manoel Lhérisson", validatedAt: "2026-05-15T18:00:00Z" },
  { id: "c2", business_id: "b1", cycleName: "Quinzaine 2 - Mai 2026", cycleType: "REGULAR_SECOND_HALF", effectiveAccountingDate: "2026-05-31", startDate: "2026-05-16", endDate: "2026-05-31", status: "DRAFT" },
  { id: "c3", business_id: "b2", cycleName: "Quinzaine 1 - Mai 2026", cycleType: "REGULAR_FIRST_HALF", effectiveAccountingDate: "2026-05-15", startDate: "2026-05-01", endDate: "2026-05-15", status: "PAID", validatedBy: "Dieudonné Joseph", validatedAt: "2026-05-15T17:30:00Z" }
];

export const samplePayrollRecords: PayrollRecord[] = [
  { id: "pr1", cycleId: "c1", business_id: "b1", employeeId: "e1", employeeName: "Manoel Lhérisson", grossSalary: 37500, cnssDeduction: 2250, cnsDeduction: 750, commissions: 0, advancesTreated: 0, netPaid: 34500, status: "PAID", hashSignature: "f9ea8d-9da39-39981" },
  { id: "pr2", cycleId: "c1", business_id: "b1", employeeId: "e2", employeeName: "Fabienne Jean-Gilles", grossSalary: 32000, cnssDeduction: 1920, cnsDeduction: 640, commissions: 5000, advancesTreated: 0, netPaid: 34440, status: "PAID", hashSignature: "a1cd89-98ff2-211a7" },
  { id: "pr3", cycleId: "c2", business_id: "b1", employeeId: "e4", employeeName: "Loveline Altidor", grossSalary: 16000, cnssDeduction: 960, cnsDeduction: 320, commissions: 4500, advancesTreated: 6000, netPaid: 13220, status: "PENDING", hashSignature: "t_pending_04938" }
];

export const sampleAttendanceRecords: AttendanceRecord[] = [
  { id: "a1", employeeId: "e4", employeeName: "Loveline Altidor", business_id: "b1", branchId: "br1", date: "2026-05-24", checkIn: "07:54:12", checkOut: "16:02:11", plannedHours: 8, realHours: 8.1, variance: 0.1, status: "NORMAL" },
  { id: "a2", employeeId: "e5", employeeName: "Ephraïm Destiné", business_id: "b1", branchId: "br2", date: "2026-05-24", checkIn: "08:45:00", checkOut: "17:00:22", plannedHours: 8, realHours: 8.25, variance: 0.25, status: "LATE", overrideReason: "Retard justifié par blocage routier à Nazon, validé par HR MANAGER", overrideBy: "Fabienne Jean-Gilles" },
  { id: "a3", employeeId: "e4", employeeName: "Loveline Altidor", business_id: "b1", branchId: "br1", date: "2026-05-25", checkIn: "08:12:00", checkOut: null, plannedHours: 8, realHours: 0, variance: -8, status: "PENDING_VERIFICATION" }
];

export const sampleForensicLogs: ForensicLog[] = [
  { id: "f1", timestamp: "2026-05-15T18:00:00Z", userId: "e1", userName: "Manoel Lhérisson", userRole: "OWNER", business_id: "b1", action: "PAYROLL_LOCK", beforeState: '{"cycleId":"c1","status":"DRAFT"}', afterState: '{"cycleId":"c1","status":"PAID"}', ipAddress: "190.115.34.18", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", signature: "hsh_c1_lock_39ae84c98f" },
  { id: "f2", timestamp: "2026-05-20T14:22:11Z", userId: "e2", userName: "Fabienne Jean-Gilles", userRole: "MANAGER", business_id: "b1", action: "ATTENDANCE_OVERRIDE", beforeState: '{"attendanceId":"a2","status":"LATE","overrideBy":null}', afterState: '{"attendanceId":"a2","status":"NORMAL","overrideBy":"e2","overrideReason":"Retard Nazon"}', ipAddress: "190.115.35.22", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)", signature: "hsh_att_override_ff9a92a2a" }
];

export const sampleEvents: ERPEvent[] = [
  { id: "ev1", timestamp: "2026-05-24T07:54:12Z", type: "ATTENDANCE", business_id: "b1", payload: { employeeId: "e4", checkIn: "07:54:12", date: "2026-05-24" }, status: "PROCESSED", retryCount: 0 },
  { id: "ev2", timestamp: "2026-05-24T16:02:11Z", type: "ATTENDANCE", business_id: "b1", payload: { employeeId: "e4", checkOut: "16:02:11", date: "2026-05-24" }, status: "PROCESSED", retryCount: 0 },
  { id: "ev3", timestamp: "2026-05-24T08:45:00Z", type: "ATTENDANCE", business_id: "b1", payload: { employeeId: "e5", checkIn: "08:45:00", date: "2026-05-24" }, status: "PROCESSED", retryCount: 1 }
];

// Helper functions for math and crypto signatures
export function calculateCNSS(grossSalary: number): number {
  // CNSS (6% based on legal mandates in Haiti)
  return Math.round(grossSalary * 0.06);
}

export function calculateCNS(grossSalary: number): number {
  // CNS (2% based on national security fund/other models)
  return Math.round(grossSalary * 0.02);
}

export function generateSignature(data: any): string {
  const serialized = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    const char = serialized.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `hsh_gen_${Math.abs(hash).toString(16)}`;
}
export function getLocalIP(): string {
  return "200.222.45." + Math.floor(Math.random() * 254 + 1);
}
