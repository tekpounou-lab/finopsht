
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAuth } from "./useAuth";
import { globalCommandBus } from "../core/bus/CommandBus";
import { Command, UseCaseResponse } from "../core/types";

export function useCommandBus() {
  const { currentBusiness } = useBusinessContext();
  const { user, role } = useAuth();

  const dispatch = async <TResponse>(type: string, payload: any, overrideRole?: string): Promise<UseCaseResponse<TResponse>> => {
    const command: Command = {
      type,
      payload,
      metadata: {
        userId: user?.uid || "SYSTEM",
        business_id: currentBusiness?.id || "N/A",
        role: (overrideRole || (role && role !== "UNASSIGNED" ? role : "OWNER")) as any,
        timestamp: new Date().toISOString(),
        correlationId: Math.random().toString(36).substring(2, 15)
      }
    };

    return globalCommandBus.dispatch<TResponse>(command);
  };

  return { dispatch };
}
