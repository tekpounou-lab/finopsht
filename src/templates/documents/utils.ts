import { Employee } from "../../types";

/**
 * Resolves and formats a human-readable department name for documents, certificates, and badges,
 * ensuring raw database IDs (e.g., "d_auto_barbershop_btmd5", "DEP_DEFAULT") are NEVER exposed.
 */
export function formatDepartmentName(
  employee?: Partial<Employee> | null,
  additionalData?: Record<string, any> | null
): string {
  // 1. Explicit department name from additionalData or employee
  const explicitName =
    additionalData?.departmentName ||
    additionalData?.deptName ||
    additionalData?.department_name ||
    employee?.department_name ||
    (employee as any)?.departmentName ||
    (employee as any)?.deptName;

  if (
    explicitName &&
    typeof explicitName === "string" &&
    !explicitName.startsWith("d_") &&
    !explicitName.startsWith("dept_")
  ) {
    return explicitName;
  }

  // 2. Inspect departmentId or department_id
  const rawId =
    employee?.departmentId ||
    employee?.department_id ||
    additionalData?.departmentId ||
    additionalData?.department_id;

  if (!rawId || typeof rawId !== "string") {
    return "Ressources Humaines";
  }

  // If rawId is already a clean readable name
  if (!rawId.startsWith("d_") && !rawId.startsWith("dept_") && !rawId.startsWith("DEP_")) {
    return rawId;
  }

  if (rawId === "DEP_DEFAULT" || rawId === "d_default") {
    return "Direction Générale & RH";
  }

  // Clean raw coded ID e.g. "d_auto_barbershop_btmd5" -> "Barbershop"
  const cleaned = rawId
    .replace(/^d_auto_/, "")
    .replace(/^d_/, "")
    .replace(/^dept_/, "")
    .replace(/_[a-z0-9]{4,10}$/i, "") // remove trailing hash like _btmd5
    .replace(/_/g, " ")
    .trim();

  if (cleaned) {
    return cleaned
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return "Ressources Humaines";
}

/**
 * Resolves and formats a human-readable branch name for documents and certificates.
 */
export function formatBranchName(
  employee?: Partial<Employee> | null,
  additionalData?: Record<string, any> | null
): string {
  const explicitName =
    additionalData?.branchName ||
    additionalData?.branch_name ||
    employee?.branch_name ||
    (employee as any)?.branchName;

  if (
    explicitName &&
    typeof explicitName === "string" &&
    !explicitName.startsWith("b_") &&
    !explicitName.startsWith("branch_")
  ) {
    return explicitName;
  }

  const rawId =
    employee?.branchId ||
    employee?.branch_id ||
    additionalData?.branchId ||
    additionalData?.branch_id;

  if (!rawId || typeof rawId !== "string") {
    return "Siège Principal";
  }

  if (!rawId.startsWith("b_") && !rawId.startsWith("branch_") && !rawId.startsWith("BR_")) {
    return rawId;
  }

  const cleaned = rawId
    .replace(/^b_auto_/, "")
    .replace(/^b_/, "")
    .replace(/^branch_/, "")
    .replace(/_[a-z0-9]{4,10}$/i, "")
    .replace(/_/g, " ")
    .trim();

  if (cleaned) {
    return cleaned
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return "Siège Principal";
}
