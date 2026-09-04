
import { Command, UseCaseResponse, IUseCase } from "../types";

class CommandBus {
  private handlers: Map<string, IUseCase<any, any>> = new Map();

  register(commandType: string, handler: IUseCase<any, any>) {
    if (this.handlers.has(commandType)) {
      console.warn(`[CommandBus] Handler for ${commandType} already registered. Skipping.`);
      return;
    }
    this.handlers.set(commandType, handler);
    console.log(`[CommandBus] Registered handler for: ${commandType}`);
  }

  async dispatch<TResponse>(command: Command): Promise<UseCaseResponse<TResponse>> {
    const handler = this.handlers.get(command.type);
    
    if (!handler) {
      return {
        success: false,
        error: {
          code: "HANDLER_NOT_FOUND",
          message: `No handler registered for command type: ${command.type}`
        }
      };
    }

    try {
      console.log(`[CommandBus] Executing: ${command.type}`, { correlationId: command.metadata.correlationId });
      const result = await handler.execute(command);
      
      if (result.success) {
        console.log(`[CommandBus] Success: ${command.type}`);
      } else {
        console.error(`[CommandBus] Failed: ${command.type}`, result.error);
      }
      
      return result;
    } catch (error: any) {
      console.error(`[CommandBus] Critical Error: ${command.type}`, error);
      return {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error.message || "An unexpected error occurred during command execution"
        }
      };
    }
  }
}

export const globalCommandBus = new CommandBus();
