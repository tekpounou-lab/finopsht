
import { EventBus } from "../runtime/EventBus";
import { WorkflowRepository } from "./WorkflowRepository";
import { WorkflowDLQRepository } from "./WorkflowDLQRepository";
import { WorkflowInstance, WorkflowStatus } from "./types";
import { NotificationEngine } from "./NotificationEngine";
import { AuditEngine } from "./AuditEngine";
import { LeaveRepository } from "../../repositories/LeaveRepository";
import { EmployeeRepository } from "../../repositories/EmployeeRepository";
import { ApprovalEngine } from "./approval/ApprovalEngine";
import { ApprovalRepository } from "./approval/ApprovalRepository";
import { AdminRepository } from "../admin/AdminRepository";
import { auth } from "../../lib/firebase";

class EnterpriseWorkflowEngine {
  private static instance: EnterpriseWorkflowEngine;

  private constructor() {}

  public static getInstance(): EnterpriseWorkflowEngine {
    if (!EnterpriseWorkflowEngine.instance) {
      EnterpriseWorkflowEngine.instance = new EnterpriseWorkflowEngine();
    }
    return EnterpriseWorkflowEngine.instance;
  }

  /**
   * Initializes the engine and subscribes to core triggers.
   */
  public async start(): Promise<void> {
    console.log("[WorkflowEngine] Orchestration & Approval Engine Starting...");
    
    // Subscribe to ALL events to track process flows and orchestrate requests
    EventBus.subscribe("*", async (event) => {
      this.handleEvent(event);
    });
  }

  public async seedForBusiness(businessId: string): Promise<void> {
    if (!auth.currentUser) {
      console.log("[WorkflowEngine] Deferring tenant workflow seed: User not authenticated.");
      return;
    }

    try {
      await WorkflowRepository.seedDefaultWorkflows(businessId);
      const existing = await ApprovalRepository.findPolicy(businessId, "LEAVE");
      if (!existing) {
        await ApprovalRepository.seedPolicy({
          id: `pol_leave_${businessId}`,
          businessId,
          name: "Default Leave Approval Policy",
          entityType: "LEAVE",
          minLevels: 2,
          steps: [
            { level: 1, roleRequired: "MANAGER" },
            { level: 2, roleRequired: "HR" }
          ]
        });
        console.log(`[WorkflowEngine] Seeded multi-step Leave Approval Policy for ${businessId}.`);
      }
    } catch (err: any) {
      console.warn(`[WorkflowEngine] Seeding deferred for ${businessId}:`, err.message);
    }
  }

  private async handleEvent(event: any): Promise<void> {
    if (!auth.currentUser || !event?.businessId) {
      return;
    }
    // --- 1. SHADOW / AUTOMATION TRIGGERS ---
    
    if (event.type === "EmployeeCreated") {
      await this.createInstance({
        definitionId: "WF_ONBOARDING",
        businessId: event.businessId,
        entityId: event.payload.employee.id,
        entityType: "EMPLOYEE",
        correlationId: event.correlationId,
        metadata: { employeeName: event.payload.employee.fullName }
      });
      
      await NotificationEngine.broadcastToBusiness(
        event.businessId,
        "Nouvel employé créé",
        `Le processus d'onboarding pour ${event.payload.employee.fullName} a commencé.`,
        "WORKFORCE"
      );
    }

    if (event.type === "LeaveRequested") {
      const workflowInstanceId = await this.createInstance({
        definitionId: "WF_LEAVE_APPROVAL",
        businessId: event.businessId,
        entityId: event.payload.id,
        entityType: "LEAVE",
        correlationId: event.correlationId,
        metadata: { type: event.payload.type, employeeId: event.payload.employeeId }
      });

      // PHASE 4: Initiate Multi-Step Approval
      const approvalInstanceId = await ApprovalEngine.initiateApproval({
        businessId: event.businessId,
        workflowInstanceId,
        entityId: event.payload.id,
        entityType: "LEAVE",
        initiatorId: event.payload.employeeId
      });

      if (approvalInstanceId) {
        // Update workflow to waiting
        const instances = await WorkflowRepository.findActiveByEntity(event.payload.id, event.businessId);
        const inst = instances.find(i => i.id === workflowInstanceId);
        if (inst) {
          await WorkflowRepository.saveInstance({
            ...inst,
            status: "WAITING_APPROVAL",
            metadata: { ...inst.metadata, approvalInstanceId }
          });
        }
      }

      await AuditEngine.log({
        businessId: event.businessId,
        module: "LEAVE",
        aggregate: "LEAVE",
        action: "REQUEST_RECEIVED",
        entityId: event.payload.id,
        metadata: event.payload,
        severity: "INFO"
      });
    }

    // --- 2. ORCHESTRATION COMMANDS (PHASE 3/4) ---

    if (event.type === "LeaveStatusChangeRequested") {
      await this.orchestrateLeaveStatusChange(event);
    }

    if (event.type === "InvitationAcceptanceRequested") {
      await this.orchestrateInvitationAcceptance(event);
    }

    // --- 3. APPROVAL ENGINE CALLBACKS ---
    if (event.type === "ApprovalProcessCompleted") {
      await this.handleApprovalCompletion(event);
    }

    if (event.type === "ApprovalProcessRejected") {
      await this.handleApprovalRejection(event);
    }

    // --- 4. ERROR & DLQ HANDLING ---
    if (event.type === "WorkflowExecutionFailed") {
      await this.handleWorkflowFailure(event);
    }

    // --- 5. STATE TRACKING ---
    await this.updateActiveWorkflows(event);
  }

  private async handleWorkflowFailure(event: any): Promise<void> {
    const { instance, error } = event.payload;
    console.error(`[WorkflowEngine] [FAIL-SAFE] Workflow ${instance.id} failed: ${error}`);

    // Log to DLQ
    await WorkflowDLQRepository.capture({
      id: `dlq_${Math.random().toString(36).substring(2, 11)}`,
      workflowInstanceId: instance.id,
      businessId: instance.businessId,
      error: error || "Unknown execution error",
      lastState: instance,
      timestamp: new Date().toISOString(),
      resolved: false
    });

    // Determine if automatic compensation is required
    // In Phase 5, we look for metadata.compensationRequired
    if (instance.metadata?.compensationRequired) {
      await this.triggerRollback(instance);
    }
  }

  private async triggerRollback(instance: WorkflowInstance): Promise<void> {
    console.log(`[WorkflowEngine] [ROLLBACK] Initiating compensation for ${instance.id}`);
    
    await WorkflowRepository.saveInstance({
      ...instance,
      status: "ROLLBACK_IN_PROGRESS",
      history: [...instance.history, {
        timestamp: new Date().toISOString(),
        type: "COMPENSATION_STARTED",
        message: "Automatic compensation initiated due to execution failure."
      }]
    });

    try {
      if (instance.entityType === "LEAVE") {
        // Business Rule: If a leave workflow fails after some stages, revert to PENDING or CANCELLED
        await LeaveRepository._applyStatusChange(instance.entityId, "CANCELLED", {
          id: "SYSTEM",
          name: "Workflow Compensation",
          role: "SYSTEM"
        });
      }

      await WorkflowRepository.saveInstance({
        ...instance,
        status: "ROLLED_BACK",
        history: [...instance.history, {
          timestamp: new Date().toISOString(),
          type: "COMPENSATION_COMPLETED",
          message: "Workflow state successfully compensated."
        }]
      });

      console.log(`[WorkflowEngine] [ROLLBACK] Compensation complete for ${instance.id}`);
    } catch (err: any) {
      console.error(`[WorkflowEngine] [CRITICAL] Compensation failed for ${instance.id}:`, err);
      // Even if compensation fails, we mark as FAILED and it stays in DLQ
      await WorkflowRepository.saveInstance({
        ...instance,
        status: "FAILED",
        history: [...instance.history, {
          timestamp: new Date().toISOString(),
          type: "ERROR",
          message: `Critical: Compensation failed: ${err.message}`
        }]
      });
    }
  }

  private async handleApprovalCompletion(event: any): Promise<void> {
    const { workflowInstanceId, entityId, entityType } = event.payload;
    console.log(`[WorkflowEngine] Approval completed for ${entityType}:${entityId}. Applying final state.`);

    if (entityType === "LEAVE") {
      // Apply the final "APPROVED" state
      await LeaveRepository._applyStatusChange(entityId, "APPROVED", { 
        id: "SYSTEM", 
        name: "Workflow Engine", 
        role: "SYSTEM" 
      });

      // Complete the workflow instance
      const instances = await WorkflowRepository.findActiveByEntity(entityId, event.businessId);
      const instance = instances.find(i => i.id === workflowInstanceId);
      if (instance) {
        await WorkflowRepository.saveInstance({
          ...instance,
          status: "COMPLETED",
          history: [...instance.history, {
            timestamp: new Date().toISOString(),
            type: "STATUS_CHANGED",
            message: "Workflow completed after multi-level approval."
          }]
        });
      }
    }
  }

  private async handleApprovalRejection(event: any): Promise<void> {
    const { workflowInstanceId, entityId, entityType } = event.payload;
    console.log(`[WorkflowEngine] Approval rejected for ${entityType}:${entityId}.`);

    if (entityType === "LEAVE") {
      await LeaveRepository._applyStatusChange(entityId, "REJECTED", { 
        id: "SYSTEM", 
        name: "Workflow Engine", 
        role: "SYSTEM" 
      });

      const instances = await WorkflowRepository.findActiveByEntity(entityId, event.businessId);
      const instance = instances.find(i => i.id === workflowInstanceId);
      if (instance) {
        await WorkflowRepository.saveInstance({
          ...instance,
          status: "FAILED",
          history: [...instance.history, {
            timestamp: new Date().toISOString(),
            type: "STATUS_CHANGED",
            message: "Workflow failed due to approval rejection."
          }]
        });
      }
    }
  }

  private async orchestrateLeaveStatusChange(event: any): Promise<void> {
    const { leaveId, status, actor, approvalInstanceId } = event.payload;
    
    // Phase 4: If an approval instance is specified, we route through Approval Engine
    if (approvalInstanceId) {
      await ApprovalEngine.processAction({
        instanceId: approvalInstanceId,
        actorId: actor.id,
        actorRole: actor.role,
        action: status === "APPROVED" ? "APPROVE" : "REJECT"
      });
      return;
    }

    // Default Phase 3 behavior (direct orchestration if no multi-step policy active)
    console.log(`[WorkflowEngine] Direct Orchestration for Leave: ${leaveId} -> ${status}`);

    try {
      // Execute the actual repository update
      await LeaveRepository._applyStatusChange(leaveId, status, actor);

      // Publish the FINAL DOMAIN EVENT
      EventBus.publish(EventBus.createEvent({
        correlationId: event.correlationId,
        businessId: event.businessId,
        module: "LEAVE",
        aggregate: "LEAVE",
        type: status === "APPROVED" ? "LeaveApproved" : "LeaveRejected",
        payload: { leaveId, status }
      }));
    } catch (err: any) {
      console.error(`[WorkflowEngine] Orchestration failed for Leave ${leaveId}:`, err);
    }
  }

  private async orchestrateInvitationAcceptance(event: any): Promise<void> {
    const params = event.payload;
    console.log(`[WorkflowEngine] Orchestrating Invitation Acceptance: ${params.invitationId}`);

    try {
      await EmployeeRepository._applyInvitationAcceptance(params);

      EventBus.publish(EventBus.createEvent({
        correlationId: event.correlationId,
        businessId: event.businessId,
        module: "WORKFORCE",
        aggregate: "INVITATION",
        type: "InvitationAccepted",
        payload: { employeeId: params.employeeId, invitationId: params.invitationId }
      }));
    } catch (err: any) {
      console.error(`[WorkflowEngine] Orchestration failed for Invitation ${params.invitationId}:`, err);
    }
  }

  private async createInstance(params: {
    definitionId: string;
    businessId: string;
    entityId: string;
    entityType: string;
    correlationId: string;
    metadata?: any;
  }): Promise<string> {
    const id = `wfi_${Math.random().toString(36).substring(2, 11)}`;
    const instance: WorkflowInstance = {
      id,
      definitionId: params.definitionId,
      businessId: params.businessId,
      entityId: params.entityId,
      entityType: params.entityType,
      status: "RUNNING",
      currentStep: "START",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      correlationId: params.correlationId,
      history: [{
        timestamp: new Date().toISOString(),
        type: "STATUS_CHANGED",
        message: `Workflow started by event ${params.correlationId}`,
        payload: params.metadata
      }],
      metadata: params.metadata
    };

    await WorkflowRepository.saveInstance(instance);
    
    // Automation: Audit Workflow Start
    await AuditEngine.log({
      businessId: params.businessId,
      module: "WORKFLOW",
      aggregate: "INSTANCE",
      action: "WORKFLOW_STARTED",
      entityId: id,
      metadata: { definitionId: params.definitionId, correlationId: params.correlationId },
      severity: "INFO"
    });

    console.log(`[WorkflowEngine] [ORCHESTRATION] Started Workflow ${id} for ${params.entityType}:${params.entityId}`);
    return id;
  }

  private async updateActiveWorkflows(event: any): Promise<void> {
    const entityId = event.payload?.employeeId || event.payload?.id || event.payload?.leaveId;
    if (!entityId || !event.businessId) return;

    const activeWorkflows = await WorkflowRepository.findActiveByEntity(entityId, event.businessId);

    for (const workflow of activeWorkflows) {
      let shouldUpdate = false;
      let newStatus: WorkflowStatus = workflow.status;
      let message = "";

      if (event.type === "InvitationAccepted" && workflow.definitionId === "WF_ONBOARDING") {
        newStatus = "COMPLETED";
        message = "Onboarding completed via InvitationAccepted";
        shouldUpdate = true;
        
        // Automation: Notify completion
        await NotificationEngine.broadcastToBusiness(
          workflow.businessId,
          "Onboarding terminé",
          `L'employé a accepté son invitation et le profil est actif.`,
          "WORKFORCE"
        );
      }

      if ((event.type === "LeaveApproved" || event.type === "LeaveRejected") && workflow.definitionId === "WF_LEAVE_APPROVAL") {
        newStatus = "COMPLETED";
        message = `Leave process completed via ${event.type}`;
        shouldUpdate = true;

        // Automation: Audit result
        await AuditEngine.log({
          businessId: workflow.businessId,
          module: "LEAVE",
          aggregate: "LEAVE",
          action: event.type.toUpperCase(),
          entityId: workflow.entityId,
          severity: "INFO"
        });
      }

      if (shouldUpdate) {
        await WorkflowRepository.saveInstance({
          ...workflow,
          status: newStatus,
          history: [...workflow.history, {
            timestamp: new Date().toISOString(),
            type: "STATUS_CHANGED",
            message,
            payload: event.payload
          }]
        });

        // Automation: Audit Status Change
        await AuditEngine.log({
          businessId: workflow.businessId,
          module: "WORKFLOW",
          aggregate: "INSTANCE",
          action: "STATUS_CHANGED",
          entityId: workflow.id,
          afterState: { status: newStatus },
          severity: "INFO"
        });

        console.log(`[WorkflowEngine] [ORCHESTRATION] Updated Workflow ${workflow.id} to ${newStatus}`);
      }
    }
  }

  public shutdown(): void {
    console.log("[WorkflowEngine] Engine stopped.");
  }
}

export const WorkflowEngine = EnterpriseWorkflowEngine.getInstance();
