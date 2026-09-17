import { auth } from "../../../lib/firebase";
import { ApprovalRepository } from "./ApprovalRepository";
import { ApprovalInstance, ApprovalStatus } from "./types";

export class ApprovalGatewayClient {
  private static async getAuthToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("UNAUTHENTICATED: User is not signed in.");
    }
    return await user.getIdToken();
  }

  /**
   * Initiates payroll approval via trusted backend Gateway.
   */
  public static async initiatePayrollApproval(cycleId: string): Promise<{
    instanceId: string;
    status: ApprovalStatus;
    lockId: string;
  }> {
    const token = await this.getAuthToken();
    const response = await fetch("/api/approvals/payroll/initiate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ cycleId })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || "Failed to initiate payroll approval.");
    }

    ApprovalRepository.invalidateCache();
    return data;
  }

  /**
   * Submits a step decision (APPROVE/REJECT) via trusted backend Gateway.
   */
  public static async submitStepDecision(
    instanceId: string,
    action: "APPROVE" | "REJECT",
    comment?: string
  ): Promise<{
    instanceId: string;
    status: ApprovalStatus;
    currentLevel: number;
    actedLevel: number;
    finalApproved: boolean;
    rejected: boolean;
  }> {
    const token = await this.getAuthToken();
    const response = await fetch(`/api/approvals/${instanceId}/decide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action, comment })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || "Failed to submit approval decision.");
    }

    ApprovalRepository.invalidateCache();
    return data;
  }

  /**
   * Cancels a pending approval workflow via trusted backend Gateway.
   */
  public static async cancelApproval(
    instanceId: string,
    reason?: string
  ): Promise<{
    instanceId: string;
    status: "CANCELLED";
  }> {
    const token = await this.getAuthToken();
    const response = await fetch(`/api/approvals/${instanceId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || "Failed to cancel approval.");
    }

    ApprovalRepository.invalidateCache();
    return data;
  }

  /**
   * Fetches an approval instance by ID (delegating to ApprovalRepository cache & client reads).
   */
  public static async getInstance(instanceId: string): Promise<ApprovalInstance | null> {
    return await ApprovalRepository.getInstance(instanceId);
  }
}
