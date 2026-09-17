import { z } from "zod";

export const ApprovalInitiateSchema = z.object({
  cycleId: z.string().min(1, "cycleId is required")
});

export const ApprovalDecideSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional()
});

export const ApprovalCancelSchema = z.object({
  reason: z.string().optional()
});
