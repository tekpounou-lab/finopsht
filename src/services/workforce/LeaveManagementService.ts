import { LeaveRecord } from "../../types";
import { LeaveRepository } from "../../repositories/LeaveRepository";

export interface LeaveTypeConfig {
  type: string;
  name: string;
  paid: boolean;
  requiresApproval: boolean;
  maxDaysPerYear: number;
  requiresDocument: boolean;
}

export const LEAVE_TYPES_CONFIG: Record<string, LeaveTypeConfig> = {
  ANNUAL_LEAVE: {
    type: "ANNUAL_LEAVE",
    name: "Congé annuel",
    paid: true,
    requiresApproval: true,
    maxDaysPerYear: 15,
    requiresDocument: false
  },
  SICK_LEAVE: {
    type: "SICK_LEAVE",
    name: "Congé maladie",
    paid: true,
    requiresApproval: true,
    maxDaysPerYear: 10,
    requiresDocument: true
  },
  SPECIAL_LEAVE: {
    type: "SPECIAL_LEAVE",
    name: "Congé exceptionnel",
    paid: true,
    requiresApproval: true,
    maxDaysPerYear: 5,
    requiresDocument: true
  },
  MATERNITY_LEAVE: {
    type: "MATERNITY_LEAVE",
    name: "Congé maternité",
    paid: true,
    requiresApproval: true,
    maxDaysPerYear: 90,
    requiresDocument: true
  },
  UNPAID_LEAVE: {
    type: "UNPAID_LEAVE",
    name: "Sans solde",
    paid: false,
    requiresApproval: true,
    maxDaysPerYear: 30,
    requiresDocument: false
  }
};

export type LeaveStatus = 
  | "DRAFT" 
  | "SUBMITTED" 
  | "MANAGER_REVIEW" 
  | "APPROVED" 
  | "PAYROLL_SYNCED" 
  | "REJECTED" 
  | "CANCELLED";

export const VALID_TRANSITIONS: Record<string, LeaveStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["MANAGER_REVIEW", "CANCELLED", "APPROVED", "REJECTED"],
  MANAGER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["PAYROLL_SYNCED", "CANCELLED"],
  REJECTED: [],
  CANCELLED: [],
  PAYROLL_SYNCED: []
};

export function calculateLeaveDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return diffDays;
}

export function mapLegacyLeaveType(type: string): string {
  if (type === "VACATION") return "ANNUAL_LEAVE";
  if (type === "SICK") return "SICK_LEAVE";
  if (type === "PERSONAL") return "SPECIAL_LEAVE";
  return type;
}

export const LeaveManagementService = {
  /**
   * Delegates leave creation directly to SSOT LeaveRepository
   */
  async requestLeave(params: {
    businessId: string;
    employeeId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
    attachmentUrl?: string;
    actor: { id: string; name: string; role: string };
  }): Promise<LeaveRecord> {
    const { businessId, employeeId, leaveType, startDate, endDate, reason, attachmentUrl, actor } = params;
    return await LeaveRepository.createLeaveRequest(
      {
        business_id: businessId,
        employeeId,
        employeeName: actor.name || "Employé",
        type: leaveType,
        leaveType,
        startDate,
        endDate,
        reason,
        attachmentUrl: attachmentUrl || "",
        status: "SUBMITTED"
      },
      actor
    );
  },

  /**
   * Delegates evaluation (Approve / Reject) directly to SSOT LeaveRepository
   */
  async evaluateLeave(params: {
    businessId: string;
    leaveId: string;
    action: "APPROVE" | "REJECT";
    rejectionReason?: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    return await LeaveRepository.evaluateLeave(params);
  },

  /**
   * Delegates cancellation directly to SSOT LeaveRepository
   */
  async cancelLeave(params: {
    businessId: string;
    leaveId: string;
    actor: { id: string; name: string; role: string };
  }): Promise<void> {
    return await LeaveRepository.cancelLeave(params);
  }
};
