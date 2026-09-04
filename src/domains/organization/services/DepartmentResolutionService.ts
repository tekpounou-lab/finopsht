import { Department } from "../../../types/organization";
import { DepartmentNormalizer } from "./DepartmentNormalizer";
import { DepartmentRepository } from "../../../repositories/organization";

export class DepartmentResolutionService {
  /**
   * Resolves a department by name. If it does not exist, creates it.
   * Ensures that no duplicates are created by normalizing the name.
   */
  public static async resolveOrCreate(
    businessId: string,
    rawDepartmentName: string,
    branchId?: string
  ): Promise<Department> {
    const normalized = DepartmentNormalizer.normalize(rawDepartmentName);
    const canonical = DepartmentNormalizer.getCanonicalId(rawDepartmentName);

    // 1. Search existing departments
    const departments = await DepartmentRepository.listByBusiness(businessId);
    
    // Exact or canonical match
    const existing = departments.find(d => 
      (d.normalized_name && d.normalized_name === normalized) ||
      DepartmentNormalizer.getCanonicalId(d.name) === canonical ||
      (d.code && DepartmentNormalizer.getCanonicalId(d.code) === canonical) ||
      (d.aliases && d.aliases.some(a => DepartmentNormalizer.getCanonicalId(a) === canonical))
    );

    if (existing) {
      return existing;
    }

    // 2. Create missing department automatically
    const newDept: Omit<Department, "id" | "created_at" | "updated_at"> = {
      business_id: businessId,
      name: rawDepartmentName.trim(),
      normalized_name: normalized,
      code: canonical.substring(0, 10).toUpperCase(),
      branch_id: branchId,
      status: "ACTIVE",
      is_active: true,
      source: "GL_IMPORT",
      is_system_generated: true,
      created_by: "SYSTEM_IMPORT",
      aliases: [canonical]
    };

    const newId = await DepartmentRepository.create(newDept);
    
    return {
      id: newId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...newDept
    };
  }
}
