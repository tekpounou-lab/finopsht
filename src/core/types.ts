
import { Role } from "../types";

export interface Command<T = any> {
  type: string;
  payload: T;
  metadata: {
    userId: string;
    business_id: string;
    role: Role;
    timestamp: string;
    correlationId: string;
  };
}

export interface Query<T = any> {
  type: string;
  params: T;
  business_id: string;
}

export interface UseCaseResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  events?: DomainEvent[];
}

export interface DomainEvent<T = any> {
  type: string;
  payload: T;
  occurredAt: string;
  business_id: string;
  correlationId: string;
}

export interface IUseCase<TCommand extends Command, TResponse> {
  execute(command: TCommand): Promise<UseCaseResponse<TResponse>>;
}
