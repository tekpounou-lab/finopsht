import { CustomerTransfer } from "../types/cashManagement";
import { TransferIntakeEngine } from "../domains/cash/services/TransferIntakeEngine";

/**
 * Utility to seed a test customer transfer for payout development with complete Leg 1 GL liability entry.
 */
export async function seedTestTransfer(businessId: string): Promise<CustomerTransfer> {
  if (typeof window !== "undefined" && (import.meta.env.PROD || import.meta.env.MODE === "production")) {
    throw new Error("ENVIRONMENT_SAFETY_VIOLATION: Seeding test customer transfers is strictly prohibited in production.");
  }

  const result = await TransferIntakeEngine.recordInboundTransfer(
    {
      businessId,
      branchId: "MAIN_BRANCH",
      senderName: "Jean Dupont",
      senderPhone: "+509 3700-1122",
      senderCountry: "Haiti",
      beneficiaryName: "Marie Rose",
      beneficiaryPhone: "+509 3800-3344",
      amountCents: 1500000, // 15,000 HTG
      currency: "HTG",
      operatorId: "emp_system_seeder",
      operatorName: "Système Seeder",
      notes: "Transfert de test avec obligation initiale au compte 2400"
    },
    {
      id: "emp_system_seeder",
      name: "Système Seeder",
      role: "TELLER"
    }
  );

  console.log(`Test Transfer Created with GL Liability: ${result.transfer.reference} (GL: ${result.intakeGlTxId})`);
  return result.transfer;
}

