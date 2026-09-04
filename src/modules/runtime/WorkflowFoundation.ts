
import { EventBus } from "./EventBus";
import { RuntimeEngine } from "./RuntimeEngine";

export interface WorkflowStep {
  name: string;
  onEvent: string;
  action: (payload: any) => Promise<void>;
  condition?: (payload: any) => boolean;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStep[];
}

class EnterpriseWorkflowFoundation {
  private static instance: EnterpriseWorkflowFoundation;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private activeSubscriptions: (() => void)[] = [];

  private constructor() {}

  public static getInstance(): EnterpriseWorkflowFoundation {
    if (!EnterpriseWorkflowFoundation.instance) {
      EnterpriseWorkflowFoundation.instance = new EnterpriseWorkflowFoundation();
    }
    return EnterpriseWorkflowFoundation.instance;
  }

  public registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.name, workflow);
    console.log(`[WorkflowFoundation] Registered Workflow: ${workflow.name}`);

    // Subscribe to triggers
    workflow.steps.forEach(step => {
      const unsub = EventBus.subscribe(step.onEvent, async (event) => {
        if (step.condition && !step.condition(event.payload)) return;

        console.log(`[WorkflowFoundation] [${workflow.name}] Triggered step: ${step.name} by ${event.type}`);
        
        EventBus.publish(EventBus.createEvent({
          correlationId: event.correlationId,
          businessId: event.businessId,
          module: "WORKFLOW",
          aggregate: "STEP",
          type: "WorkflowStepStarted",
          payload: { workflow: workflow.name, step: step.name }
        }));

        try {
          await step.action(event.payload);
          
          EventBus.publish(EventBus.createEvent({
            correlationId: event.correlationId,
            businessId: event.businessId,
            module: "WORKFLOW",
            aggregate: "STEP",
            type: "WorkflowStepCompleted",
            payload: { workflow: workflow.name, step: step.name }
          }));
        } catch (err: any) {
          RuntimeEngine.reportError("MEDIUM", `Workflow step ${step.name} failed: ${err.message}`, "WORKFLOW");
          
          EventBus.publish(EventBus.createEvent({
            correlationId: event.correlationId,
            businessId: event.businessId,
            module: "WORKFLOW",
            aggregate: "STEP",
            type: "WorkflowStepFailed",
            payload: { workflow: workflow.name, step: step.name, error: err.message }
          }));
        }
      });
      this.activeSubscriptions.push(unsub);
    });
  }

  public shutdown(): void {
    this.activeSubscriptions.forEach(unsub => unsub());
    this.activeSubscriptions = [];
  }
}

export const WorkflowFoundation = EnterpriseWorkflowFoundation.getInstance();
