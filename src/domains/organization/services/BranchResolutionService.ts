import { Branch } from "../../../types/organization";
import { BranchNormalizer } from "./BranchNormalizer";
import { BranchRepository } from "../../../repositories/organization";

export class BranchResolutionService {
  /**
   * Resolves a branch by name. If it does not exist, creates it.
   * Ensures that no duplicates are created by normalizing the name.
   */
  public static async resolveOrCreate(
    businessId: string,
    rawBranchName: string,
    rawBranchCode?: string
  ): Promise<Branch> {
    const trimmed = (rawBranchName || "").trim();
    if (!trimmed) {
      throw new Error("Le nom de la succursale ne peut pas être vide.");
    }

    const normalized = BranchNormalizer.normalize(trimmed);
    const canonical = BranchNormalizer.getCanonicalId(trimmed);
    const code = rawBranchCode ? rawBranchCode.trim().toUpperCase() : canonical.substring(0, 10).toUpperCase();

    // 1. Search existing branches
    const branches = await BranchRepository.listByBusiness(businessId);
    
    // Exact or canonical match
    const existing = branches.find(b => 
      (b.name && BranchNormalizer.normalize(b.name) === normalized) ||
      BranchNormalizer.getCanonicalId(b.name) === canonical ||
      (b.code && b.code.toUpperCase() === code) ||
      ((b as any).aliases && ((b as any).aliases as string[]).some((a: string) => BranchNormalizer.getCanonicalId(a) === canonical))
    );

    if (existing) {
      return existing;
    }

    // 2. Create missing branch automatically
    const newBranch: Omit<Branch, "id" | "created_at" | "updated_at"> = {
      business_id: businessId,
      name: trimmed,
      code,
      status: "ACTIVE",
      is_active: true,
      address: "Adresse Principale",
      location: trimmed,
    };

    const newId = await BranchRepository.create(newBranch);
    
    return {
      id: newId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...newBranch
    };
  }
}
