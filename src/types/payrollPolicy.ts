import { z } from "zod";

export const PayrollPolicySchema = z.object({
  id: z.string().optional(),
  policyId: z.string().optional(),
  businessId: z.string().optional(),
  business_id: z.string().optional(),
  tenantId: z.string().optional(),

  version: z.number().int().min(1).default(1),
  versionLabel: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "SUPERSEDED"]).default("ACTIVE"),

  effectiveFrom: z.string(), // YYYY-MM-DD
  effectiveTo: z.string().nullable().optional(),

  // Cycle & Frequency
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).default("BIWEEKLY"),
  currency: z.enum(["HTG", "USD"]).default("HTG"),
  standardHoursPerCycle: z.number().min(0).max(744).default(96),
  attendanceToleranceHours: z.number().min(0).max(744).default(94),
  workingDaysBasis: z.number().min(1).max(31).default(22),

  // Overtime & Penalties
  overtime: z.object({
    normalRate: z.number().min(1.0).max(3.0).default(1.5),
    holidayRate: z.number().min(1.0).max(4.0).default(2.0),
  }).default({ normalRate: 1.5, holidayRate: 2.0 }),

  penalties: z.object({
    lateFixedCents: z.number().min(0).default(0),
    absencePerDayCents: z.number().min(0).default(0),
  }).default({ lateFixedCents: 0, absencePerDayCents: 0 }),

  // Social Contributions
  socialContributions: z.object({
    enabled: z.boolean().default(true),
    cnssOna: z.object({
      employeeRate: z.number().min(0).max(0.5).default(0.06),
      employerRate: z.number().min(0).max(0.5).default(0.06),
    }).default({ employeeRate: 0.06, employerRate: 0.06 }),
    ofatmaCns: z.object({
      employeeRate: z.number().min(0).max(0.5).default(0.02),
      employerRate: z.number().min(0).max(0.5).default(0.03),
    }).default({ employeeRate: 0.02, employerRate: 0.03 }),
  }).default({
    enabled: true,
    cnssOna: { employeeRate: 0.06, employerRate: 0.06 },
    ofatmaCns: { employeeRate: 0.02, employerRate: 0.03 },
  }),

  // Commissions
  commissions: z.object({
    defaultSalesRate: z.number().min(0).max(1.0).default(0.05),
  }).default({ defaultSalesRate: 0.05 }),

  // Survival Floor Protection
  survivalFloor: z.object({
    enabled: z.boolean().default(true),
    minimumNetHTG: z.number().min(0).default(15000),
  }).default({ enabled: true, minimumNetHTG: 15000 }),

  // Attendance Exclusion
  attendance: z.object({
    excludeWithoutRecords: z.boolean().default(true),
  }).default({ excludeWithoutRecords: true }),

  // Resolution Mode
  resolution: z.object({
    mode: z.enum(["STRICT", "CUSTOM"]).default("STRICT"),
  }).default({ mode: "STRICT" }),

  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
});

export type PayrollPolicyInput = z.input<typeof PayrollPolicySchema>;
export type PayrollPolicy = z.infer<typeof PayrollPolicySchema>;

export interface PolicyResolutionResult<T = any> {
  status: "RESOLVED" | "INVALID" | "NOT_EFFECTIVE" | "NO_DATA";
  value: T;
  source: "EMPLOYEE_OVERRIDE" | "TENANT_POLICY" | "GLOBAL_POLICY" | "SYSTEM_DEFAULT";
  version?: number | string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  policyId?: string;
}
