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
  public readonly code: string = "FOREIGN_KEY_INTEGRITY_VIOLATION";
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
  }) {
    super(params.message);
    this.name = "ForeignKeyIntegrityViolationError";
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

  /**
   * Validates that the business exists.
   */
  public async validateBusinessExists(businessId: string): Promise<void> {
    if (!businessId || businessId === "global") return;

    const cacheKey = `biz_${businessId}`;
    const cached = this.getCached(cacheKey);
    if (cached === true) return;

    const docSnap = await resilientGetDoc(doc(db, "businesses", businessId), {
      timeoutMs: 2500,
      maxRetries: 1,
      fallbackToCache: true,
      throwOnNetworkFailure: false
    });

    if (!docSnap || !docSnap.exists()) {
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
  public async validateDepartmentExists(businessId: string, departmentId: string): Promise<void> {
    if (!departmentId || departmentId === "DEPT_DEFAULT" || departmentId === "d_admin") return;

    const cacheKey = `dept_${businessId}_${departmentId}`;
    const cached = this.getCached(cacheKey);
    if (cached === true) return;

    // Check root departments collection
    let deptSnap = await resilientGetDoc(doc(db, "departments", departmentId), {
      timeoutMs: 2500,
      maxRetries: 1,
      fallbackToCache: true,
      throwOnNetworkFailure: false
    });

    // Fallback check subcollection
    if (!deptSnap || !deptSnap.exists()) {
      deptSnap = await resilientGetDoc(doc(db, "businesses", businessId, "departments", departmentId), {
        timeoutMs: 2500,
        maxRetries: 1,
        fallbackToCache: true,
        throwOnNetworkFailure: false
      });
    }

    if (!deptSnap || !deptSnap.exists()) {
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
    const docBizId = data?.business_id || data?.businessId;
    if (docBizId && businessId && docBizId !== businessId && docBizId !== "global") {
      throw new ForeignKeyIntegrityViolationError({
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
  public async validateEmployeeExists(businessId: string, employeeId: string): Promise<void> {
    if (!employeeId || employeeId === "SYSTEM" || employeeId === "UNASSIGNED") return;

    const cacheKey = `emp_${businessId}_${employeeId}`;
    const cached = this.getCached(cacheKey);
    if (cached === true) return;

    let empSnap = await resilientGetDoc(doc(db, "employees", employeeId), {
      timeoutMs: 2500,
      maxRetries: 1,
      fallbackToCache: true,
      throwOnNetworkFailure: false
    });

    if (!empSnap || !empSnap.exists()) {
      empSnap = await resilientGetDoc(doc(db, "businesses", businessId, "employees", employeeId), {
        timeoutMs: 2500,
        maxRetries: 1,
        fallbackToCache: true,
        throwOnNetworkFailure: false
      });
    }

    if (!empSnap || !empSnap.exists()) {
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
    const docBizId = data?.business_id || data?.businessId;
    if (docBizId && businessId && docBizId !== businessId && docBizId !== "global") {
      throw new ForeignKeyIntegrityViolationError({
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
  public async validateBranchExists(businessId: string, branchId: string): Promise<void> {
    if (!branchId || branchId === "BRANCH_DEFAULT" || branchId === "b_main") return;

    const cacheKey = `branch_${businessId}_${branchId}`;
    const cached = this.getCached(cacheKey);
    if (cached === true) return;

    let branchSnap = await resilientGetDoc(doc(db, "branches", branchId), {
      timeoutMs: 2500,
      maxRetries: 1,
      fallbackToCache: true,
      throwOnNetworkFailure: false
    });

    if (!branchSnap || !branchSnap.exists()) {
      branchSnap = await resilientGetDoc(doc(db, "businesses", businessId, "branches", branchId), {
        timeoutMs: 2500,
        maxRetries: 1,
        fallbackToCache: true,
        throwOnNetworkFailure: false
      });
    }

    if (!branchSnap || !branchSnap.exists()) {
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
    const docBizId = data?.business_id || data?.businessId;
    if (docBizId && businessId && docBizId !== businessId && docBizId !== "global") {
      throw new ForeignKeyIntegrityViolationError({
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
    entityType: string
  ): Promise<void> {
    const bizId = entity.businessId || entity.business_id || businessId;
    const branchId = entity.branchId || entity.branch_id;
    const departmentId = entity.departmentId || entity.department_id;
    const employeeId = entity.employeeId || entity.employee_id;

    const validations: Promise<void>[] = [];

    if (bizId) {
      validations.push(this.validateBusinessExists(bizId));
    }
    if (branchId) {
      validations.push(this.validateBranchExists(bizId, branchId));
    }
    if (departmentId) {
      validations.push(this.validateDepartmentExists(bizId, departmentId));
    }
    if (employeeId) {
      validations.push(this.validateEmployeeExists(bizId, employeeId));
    }

    await Promise.all(validations);
  }
}

export const IntegrityValidator = ForeignKeyIntegrityValidator.getInstance();
