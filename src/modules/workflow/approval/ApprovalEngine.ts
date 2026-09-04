
import { ApprovalInstance, ApprovalPolicy, ApprovalStatus, ApprovalStep } from "./types";
import { ApprovalRepository } from "./ApprovalRepository";
import { NotificationEngine } from "../NotificationEngine";
import { AuditEngine } from "../AuditEngine";
import { EventBus } from "../../runtime/EventBus";

class EnterpriseApprovalEngine {
  private static instance: EnterpriseApprovalEngine;

  private constructor() {}

  public static getInstance(): EnterpriseApprovalEngine {
    if (!EnterpriseApprovalEngine.instance) {
      EnterpriseApprovalEngine.instance = new EnterpriseApprovalEngine();
    }
    return EnterpriseApprovalEngine.instance;
  }

  /**
   * Initiates a multi-step approval process based on business policy.
   */
  public async initiateApproval(params: {
    businessId: string;
    workflowInstanceId: string;
    entityId: string;
    entityType: string;
    initiatorId: string;
  }): Promise<string | null> {
    const policy = await ApprovalRepository.findPolicy(params.businessId, params.entityType);
    
    // If no policy exists, we assume auto-approval (or handled by caller)
    if (!policy) {
      console.log(`[ApprovalEngine] No policy found for ${params.entityType}. Skipping multi-step approval.`);
      return null;
    }

    const instanceId = `app_${Math.random().toString(36).substring(2, 11)}`;
    const steps: ApprovalStep[] = policy.steps.map(s => ({
      id: `step_${s.level}`,
      level: s.level,
      roleRequired: s.roleRequired,
      status: s.level === 1 ? "PENDING" : "PENDING", // All start pending
      assignedTo: []
    }));

    const instance: ApprovalInstance = {
      id: instanceId,
      businessId: params.businessId,
      workflowInstanceId: params.workflowInstanceId,
      entityId: params.entityId,
      entityType: params.entityType,
      policyId: policy.id,
      status: "PENDING",
      currentLevel: 1,
      steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await ApprovalRepository.saveInstance(instance);

    await AuditEngine.log({
      businessId: params.businessId,
      module: "APPROVAL",
      aggregate: "INSTANCE",
      action: "APPROVAL_INITIATED",
      entityId: instanceId,
      metadata: { workflowId: params.workflowInstanceId, entityId: params.entityId },
      severity: "INFO"
    });

    // Notify the first level
    const firstStep = steps[0];
    await NotificationEngine.broadcastToBusiness(
      params.businessId,
      "Approbation Requise",
      `Une nouvelle demande de ${params.entityType} attend votre approbation (Niveau ${firstStep.level}: ${firstStep.roleRequired}).`,
      "APPROVAL"
    );

    return instanceId;
  }

  /**
   * Processes an approval action (Approve/Reject) for a specific step.
   */
  public async processAction(params: {
    instanceId: string;
    actorId: string;
    actorRole: string;
    action: "APPROVE" | "REJECT";
    comment?: string;
  }): Promise<void> {
    const instance = await ApprovalRepository.getInstance(params.instanceId);
    if (!instance) throw new Error("Approval instance not found");

    if (instance.status !== "PENDING") {
      throw new Error(`Approval is already ${instance.status}`);
    }

    // CONSTITUTIONAL GOVERNANCE: Separation of duties
    const reqId = instance.initiatorId || (instance as any).requesterId;
    if (reqId && params.actorId && reqId === params.actorId) {
      throw new Error("Règle de séparation des pouvoirs : Le demandeur ne peut pas autoriser ou refuser sa propre demande. L'aval d'un supérieur est obligatoire.");
    }

    const currentStep = instance.steps.find(s => s.level === instance.currentLevel);
    if (!currentStep) throw new Error("Current level not found in steps");

    // Check Role (Simplified for Phase 4)
    // In a real system, we'd verify actorRole matches currentStep.roleRequired
    
    if (params.action === "REJECT") {
      await this.handleRejection(instance, params);
      return;
    }

    await this.handleApproval(instance, params);
  }

  private async handleApproval(instance: ApprovalInstance, params: any): Promise<void> {
    const steps = [...instance.steps];
    const stepIdx = steps.findIndex(s => s.level === instance.currentLevel);
    
    steps[stepIdx] = {
      ...steps[stepIdx],
      status: "APPROVED",
      actedBy: params.actorId,
      actedAt: new Date().toISOString(),
      comment: params.comment
    };

    let nextStatus: ApprovalStatus = "PENDING";
    let nextLevel = instance.currentLevel;

    if (instance.currentLevel >= instance.steps.length) {
      nextStatus = "APPROVED";
      console.log(`[ApprovalEngine] Final approval reached for ${instance.id}`);
      
      // Emit event that the WHOLE approval process is finished successfully
      EventBus.publish(EventBus.createEvent({
        correlationId: `app_fin_${instance.id}`,
        businessId: instance.businessId,
        module: "APPROVAL",
        aggregate: "INSTANCE",
        type: "ApprovalProcessCompleted",
        payload: { 
          instanceId: instance.id, 
          workflowInstanceId: instance.workflowInstanceId,
          entityId: instance.entityId,
          entityType: instance.entityType
        }
      }));
    } else {
      nextLevel++;
      // Notify next level
      const nextStep = steps.find(s => s.level === nextLevel);
      if (nextStep) {
        await NotificationEngine.broadcastToBusiness(
          instance.businessId,
          "Approbation Requise (Niveau Suivant)",
          `Une demande a été approuvée au niveau ${instance.currentLevel} et attend maintenant le niveau ${nextLevel} (${nextStep.roleRequired}).`,
          "APPROVAL"
        );
      }
    }

    await ApprovalRepository.updateInstance(instance.id, {
      steps,
      currentLevel: nextLevel,
      status: nextStatus
    });

    await AuditEngine.log({
      businessId: instance.businessId,
      module: "APPROVAL",
      aggregate: "INSTANCE",
      action: "STEP_APPROVED",
      entityId: instance.id,
      metadata: { level: instance.currentLevel, actorId: params.actorId },
      severity: "INFO"
    });
  }

  private async handleRejection(instance: ApprovalInstance, params: any): Promise<void> {
    const steps = [...instance.steps];
    const stepIdx = steps.findIndex(s => s.level === instance.currentLevel);

    steps[stepIdx] = {
      ...steps[stepIdx],
      status: "REJECTED",
      actedBy: params.actorId,
      actedAt: new Date().toISOString(),
      comment: params.comment
    };

    await ApprovalRepository.updateInstance(instance.id, {
      steps,
      status: "REJECTED"
    });

    await AuditEngine.log({
      businessId: instance.businessId,
      module: "APPROVAL",
      aggregate: "INSTANCE",
      action: "APPROVAL_REJECTED",
      entityId: instance.id,
      metadata: { level: instance.currentLevel, actorId: params.actorId },
      severity: "WARNING"
    });

    EventBus.publish(EventBus.createEvent({
      correlationId: `app_rej_${instance.id}`,
      businessId: instance.businessId,
      module: "APPROVAL",
      aggregate: "INSTANCE",
      type: "ApprovalProcessRejected",
      payload: { 
        instanceId: instance.id, 
        workflowInstanceId: instance.workflowInstanceId,
        entityId: instance.entityId,
        entityType: instance.entityType
      }
    }));
  }
}

export const ApprovalEngine = EnterpriseApprovalEngine.getInstance();
