import { getAdminFirestore } from "../../lib/firebaseAdmin";

export class ForeignKeyIntegrityViolationError extends Error {
  public readonly code: string;
  public readonly businessId: string;
  public readonly fieldName: string;
  public readonly referencedCollection: string;
  public readonly missingId: string;

  constructor(params: {
    message: string;
    businessId: string;
    fieldName: string;
    referencedCollection: string;
    missingId: string;
    code?: string;
  }) {
    super(params.message);
    this.name = "ForeignKeyIntegrityViolationError";
    this.code = params.code || "FOREIGN_KEY_INTEGRITY_VIOLATION";
    this.businessId = params.businessId;
    this.fieldName = params.fieldName;
    this.referencedCollection = params.referencedCollection;
    this.missingId = params.missingId;
    Object.setPrototypeOf(this, ForeignKeyIntegrityViolationError.prototype);
  }
}

async function fetchAdminDocSnapshot(
  collectionName: string,
  docId: string,
  businessId?: string,
  adminDb?: any
): Promise<{ exists: boolean; data: () => any }> {
  const resolvedAdminDb = adminDb || getAdminFirestore();
  const rootSnap = await resolvedAdminDb.doc(`${collectionName}/${docId}`).get();
  if (rootSnap && rootSnap.exists) {
    return {
      exists: true,
      data: () => (typeof rootSnap.data === "function" ? rootSnap.data() : rootSnap)
    };
  }
  if (businessId && collectionName !== "businesses") {
    const subSnap = await resolvedAdminDb
      .doc(`businesses/${businessId}/${collectionName}/${docId}`)
      .get();
    if (subSnap && subSnap.exists) {
      return {
        exists: true,
        data: () => (typeof subSnap.data === "function" ? subSnap.data() : subSnap)
      };
    }
  }
  return { exists: false, data: () => null };
}

function resolveDocTenantOrThrow(
  data: any,
  businessId: string,
  fieldName: string,
  referencedCollection: string,
  entityId: string
): string {
  const b1 = typeof data?.business_id === "string" ? data.business_id.trim() : "";
  const b2 = typeof data?.businessId === "string" ? data.businessId.trim() : "";
  if (b1 && b2 && b1 !== b2) {
    throw new ForeignKeyIntegrityViolationError({
      code: "FORBIDDEN_TENANT_ACCESS",
      message: `Erreur d'isolation multi-tenant : Contradiction business_id/businessId sur ${referencedCollection}/${entityId}.`,
      businessId,
      fieldName,
      referencedCollection,
      missingId: entityId
    });
  }
  return b1 || b2;
}

export async function validateBusinessExistsWithAdmin(
  businessId: string,
  adminDb?: any
): Promise<void> {
  if (!businessId || businessId === "global") return;
  const docSnap = await fetchAdminDocSnapshot("businesses", businessId, undefined, adminDb);
  if (!docSnap.exists) {
    throw new ForeignKeyIntegrityViolationError({
      message: `Erreur d'intégrité référentielle : L'entreprise [${businessId}] n'existe pas dans le système.`,
      businessId,
      fieldName: "businessId",
      referencedCollection: "businesses",
      missingId: businessId
    });
  }
}

export async function validateDepartmentExistsWithAdmin(
  businessId: string,
  departmentId: string,
  adminDb?: any
): Promise<void> {
  if (!departmentId || departmentId === "DEPT_DEFAULT" || departmentId === "d_admin") return;
  const deptSnap = await fetchAdminDocSnapshot("departments", departmentId, businessId, adminDb);
  if (!deptSnap.exists) {
    throw new ForeignKeyIntegrityViolationError({
      message: `Erreur d'intégrité référentielle : Le département [${departmentId}] est introuvable pour l'entreprise [${businessId}].`,
      businessId,
      fieldName: "departmentId",
      referencedCollection: "departments",
      missingId: departmentId
    });
  }
  const docBizId = resolveDocTenantOrThrow(
    deptSnap.data(),
    businessId,
    "departmentId",
    "departments",
    departmentId
  );
  if (docBizId && businessId && docBizId !== businessId && docBizId !== "global") {
    throw new ForeignKeyIntegrityViolationError({
      code: "FORBIDDEN_TENANT_ACCESS",
      message: `Erreur d'isolation multi-tenant : Le département [${departmentId}] appartient à un autre tenant (${docBizId} != ${businessId}).`,
      businessId,
      fieldName: "departmentId",
      referencedCollection: "departments",
      missingId: departmentId
    });
  }
}

export async function validateEmployeeExistsWithAdmin(
  businessId: string,
  employeeId: string,
  adminDb?: any
): Promise<void> {
  if (!employeeId || employeeId === "SYSTEM" || employeeId === "UNASSIGNED") return;
  const empSnap = await fetchAdminDocSnapshot("employees", employeeId, businessId, adminDb);
  if (!empSnap.exists) {
    throw new ForeignKeyIntegrityViolationError({
      message: `Erreur d'intégrité référentielle : L'employé [${employeeId}] est introuvable pour l'entreprise [${businessId}].`,
      businessId,
      fieldName: "employeeId",
      referencedCollection: "employees",
      missingId: employeeId
    });
  }
  const docBizId = resolveDocTenantOrThrow(
    empSnap.data(),
    businessId,
    "employeeId",
    "employees",
    employeeId
  );
  if (docBizId && businessId && docBizId !== businessId && docBizId !== "global") {
    throw new ForeignKeyIntegrityViolationError({
      code: "FORBIDDEN_TENANT_ACCESS",
      message: `Erreur d'isolation multi-tenant : L'employé [${employeeId}] appartient à un autre tenant (${docBizId} != ${businessId}).`,
      businessId,
      fieldName: "employeeId",
      referencedCollection: "employees",
      missingId: employeeId
    });
  }
}

export async function validateBranchExistsWithAdmin(
  businessId: string,
  branchId: string,
  adminDb?: any
): Promise<void> {
  if (!branchId || branchId === "BRANCH_DEFAULT" || branchId === "b_main") return;
  const branchSnap = await fetchAdminDocSnapshot("branches", branchId, businessId, adminDb);
  if (!branchSnap.exists) {
    throw new ForeignKeyIntegrityViolationError({
      message: `Erreur d'intégrité référentielle : La succursale [${branchId}] est introuvable pour l'entreprise [${businessId}].`,
      businessId,
      fieldName: "branchId",
      referencedCollection: "branches",
      missingId: branchId
    });
  }
  const docBizId = resolveDocTenantOrThrow(
    branchSnap.data(),
    businessId,
    "branchId",
    "branches",
    branchId
  );
  if (docBizId && businessId && docBizId !== businessId && docBizId !== "global") {
    throw new ForeignKeyIntegrityViolationError({
      code: "FORBIDDEN_TENANT_ACCESS",
      message: `Erreur d'isolation multi-tenant : La succursale [${branchId}] appartient à un autre tenant (${docBizId} != ${businessId}).`,
      businessId,
      fieldName: "branchId",
      referencedCollection: "branches",
      missingId: branchId
    });
  }
}

/**
 * Server-only Admin SDK Foreign Key Integrity Validator.
 * Zero browser Firebase SDK dependencies.
 */
export async function validateEntityForeignKeysWithAdmin(
  businessId: string,
  entity: Record<string, any>,
  _entityType: string,
  adminDb?: any
): Promise<void> {
  const entityBiz1 = typeof entity?.businessId === "string" ? entity.businessId.trim() : "";
  const entityBiz2 = typeof entity?.business_id === "string" ? entity.business_id.trim() : "";
  if (entityBiz1 && entityBiz2 && entityBiz1 !== entityBiz2) {
    throw new ForeignKeyIntegrityViolationError({
      code: "FORBIDDEN_TENANT_ACCESS",
      message: "Erreur d'isolation multi-tenant : Contradiction entre businessId et business_id.",
      businessId,
      fieldName: "businessId",
      referencedCollection: "businesses",
      missingId: entityBiz1
    });
  }

  const entityBiz = entityBiz1 || entityBiz2;
  if (entityBiz && businessId && entityBiz !== businessId) {
    throw new ForeignKeyIntegrityViolationError({
      code: "FORBIDDEN_TENANT_ACCESS",
      message: `Erreur d'isolation multi-tenant : L'entité appartient au tenant [${entityBiz}] et non à [${businessId}].`,
      businessId,
      fieldName: "businessId",
      referencedCollection: "businesses",
      missingId: entityBiz
    });
  }

  const bizId = entityBiz || businessId;
  const branchId = entity.branchId || entity.branch_id;
  const departmentId = entity.departmentId || entity.department_id;
  const employeeId = entity.employeeId || entity.employee_id;

  const validations: Promise<void>[] = [];
  if (bizId) validations.push(validateBusinessExistsWithAdmin(bizId, adminDb));
  if (branchId) validations.push(validateBranchExistsWithAdmin(bizId, branchId, adminDb));
  if (departmentId) validations.push(validateDepartmentExistsWithAdmin(bizId, departmentId, adminDb));
  if (employeeId) validations.push(validateEmployeeExistsWithAdmin(bizId, employeeId, adminDb));

  await Promise.all(validations);
}
