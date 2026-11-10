/**
 * FINOPS ERP — Foreign Key & Relational Integrity Validation Service (Phase 2.2)
 * 
 * Enforces strict foreign key integrity constraints across ERP domain entities:
 * 1. `businessId` MUST exist in `businesses/{businessId}`.
 * 2. `departmentId` MUST exist in `departments/{departmentId}` and match the tenant.
 * 3. `employeeId` MUST exist in `employees/{employeeId}` and match the tenant.
 * 4. `branchId` MUST exist in `branches/{branchId}` and match the tenant.
 * 5. Rejects non-compliant writes before Firestore commit with explicit forensic diagnostics.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { resilientGetDoc } from "../../utils/resilientFirestore";

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

export class ForeignKeyIntegrityValidator {
  private static instance: ForeignKeyIntegrityValidator;

  // Short-lived in-memory caches to prevent latency spikes
  private cache = new Map<string, { exists: boolean; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 15000; // 15 seconds

  private constructor() {}

  public static getInstance(): ForeignKeyIntegrityValidator {
    if (!ForeignKeyIntegrityValidator.instance) {
      ForeignKeyIntegrityValidator.instance = new ForeignKeyIntegrityValidator();
    }
    return ForeignKeyIntegrityValidator.instance;
  }

  private getCached(key: string): boolean | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.exists;
  }

  private setCache(key: string, exists: boolean): void {
    this.cache.set(key, { exists, expiresAt: Date.now() + this.CACHE_TTL_MS });
  }

  private async fetchDocSnapshot(
    collectionName: string,
    docId: string,
    businessId?: string,
    adminDb?: any
  ): Promise<{ exists: boolean; data: () => any }> {
    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    if (isServerRuntime) {
      let resolvedAdminDb = adminDb;
      if (!resolvedAdminDb) {
        const adminModulePath = "../../lib/firebaseAdmin";
        const { getAdminFirestore } = await import(/* @vite-ignore */ adminModulePath);
        resolvedAdminDb = getAdminFirestore();
      }
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

    let snap = await resilientGetDoc(doc(db, collectionName, docId), {
      timeoutMs: 2500,
      maxRetries: 1,
      fallbackToCache: true,
      throwOnNetworkFailure: false
    });

    if ((!snap || !snap.exists()) && businessId && collectionName !== "businesses") {
      snap = await resilientGetDoc(doc(db, "businesses", businessId, collectionName, docId), {
        timeoutMs: 2500,
        maxRetries: 1,
        fallbackToCache: true,
        throwOnNetworkFailure: false
      });
    }

    if (!snap || !snap.exists()) {
      return { exists: false, data: () => null };
    }
    return { exists: true, data: () => snap.data() };
  }

  private resolveDocTenantOrThrow(
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

  /**
   * Validates that the business exists.
   */
  public async validateBusinessExists(businessId: string, adminDb?: any): Promise<void> {
    if (!businessId || businessId === "global") return;

    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    const cacheKey = `biz_${businessId}`;
    if (!isServerRuntime) {
      const cached = this.getCached(cacheKey);
      if (cached === true) return;
    }

    const docSnap = await this.fetchDocSnapshot("businesses", businessId, undefined, adminDb);

    if (!docSnap.exists) {
      this.setCache(cacheKey, false);
      throw new ForeignKeyIntegrityViolationError({
        message: `Erreur d'intégrité référentielle : L'entreprise [${businessId}] n'existe pas dans le système.`,
        businessId,
        fieldName: "businessId",
        referencedCollection: "businesses",
        missingId: businessId
      });
    }

    this.setCache(cacheKey, true);
  }

  /**
   * Validates that the department exists and belongs to the business tenant.
   */
  public async validateDepartmentExists(
    businessId: string,
    departmentId: string,
    adminDb?: any
  ): Promise<void> {
    if (!departmentId || departmentId === "DEPT_DEFAULT" || departmentId === "d_admin") return;

    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    const cacheKey = `dept_${businessId}_${departmentId}`;
    if (!isServerRuntime) {
      const cached = this.getCached(cacheKey);
      if (cached === true) return;
    }

    const deptSnap = await this.fetchDocSnapshot("departments", departmentId, businessId, adminDb);

    if (!deptSnap.exists) {
      this.setCache(cacheKey, false);
      throw new ForeignKeyIntegrityViolationError({
        message: `Erreur d'intégrité référentielle : Le département [${departmentId}] est introuvable pour l'entreprise [${businessId}].`,
        businessId,
        fieldName: "departmentId",
        referencedCollection: "departments",
        missingId: departmentId
      });
    }

    const data = deptSnap.data();
    const docBizId = this.resolveDocTenantOrThrow(
      data,
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

    this.setCache(cacheKey, true);
  }

  /**
   * Validates that the employee exists and belongs to the business tenant.
   */
  public async validateEmployeeExists(
    businessId: string,
    employeeId: string,
    adminDb?: any
  ): Promise<void> {
    if (!employeeId || employeeId === "SYSTEM" || employeeId === "UNASSIGNED") return;

    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    const cacheKey = `emp_${businessId}_${employeeId}`;
    if (!isServerRuntime) {
      const cached = this.getCached(cacheKey);
      if (cached === true) return;
    }

    const empSnap = await this.fetchDocSnapshot("employees", employeeId, businessId, adminDb);

    if (!empSnap.exists) {
      this.setCache(cacheKey, false);
      throw new ForeignKeyIntegrityViolationError({
        message: `Erreur d'intégrité référentielle : L'employé [${employeeId}] est introuvable pour l'entreprise [${businessId}].`,
        businessId,
        fieldName: "employeeId",
        referencedCollection: "employees",
        missingId: employeeId
      });
    }

    const data = empSnap.data();
    const docBizId = this.resolveDocTenantOrThrow(
      data,
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

    this.setCache(cacheKey, true);
  }

  /**
   * Validates that the branch exists and belongs to the business tenant.
   */
  public async validateBranchExists(
    businessId: string,
    branchId: string,
    adminDb?: any
  ): Promise<void> {
    if (!branchId || branchId === "BRANCH_DEFAULT" || branchId === "b_main") return;

    const isServerRuntime = Boolean(adminDb) || typeof window === "undefined";
    const cacheKey = `branch_${businessId}_${branchId}`;
    if (!isServerRuntime) {
      const cached = this.getCached(cacheKey);
      if (cached === true) return;
    }

    const branchSnap = await this.fetchDocSnapshot("branches", branchId, businessId, adminDb);

    if (!branchSnap.exists) {
      this.setCache(cacheKey, false);
      throw new ForeignKeyIntegrityViolationError({
        message: `Erreur d'intégrité référentielle : La succursale [${branchId}] est introuvable pour l'entreprise [${businessId}].`,
        businessId,
        fieldName: "branchId",
        referencedCollection: "branches",
        missingId: branchId
      });
    }

    const data = branchSnap.data();
    const docBizId = this.resolveDocTenantOrThrow(
      data,
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

    this.setCache(cacheKey, true);
  }

  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Validates all foreign keys present on an arbitrary entity before creation or update.
   */
  public async validateEntityForeignKeys(
    businessId: string,
    entity: Record<string, any>,
    entityType: string,
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

    if (bizId) {
      validations.push(this.validateBusinessExists(bizId, adminDb));
    }
    if (branchId) {
      validations.push(this.validateBranchExists(bizId, branchId, adminDb));
    }
    if (departmentId) {
      validations.push(this.validateDepartmentExists(bizId, departmentId, adminDb));
    }
    if (employeeId) {
      validations.push(this.validateEmployeeExists(bizId, employeeId, adminDb));
    }

    await Promise.all(validations);
  }
}

export const IntegrityValidator = ForeignKeyIntegrityValidator.getInstance();
