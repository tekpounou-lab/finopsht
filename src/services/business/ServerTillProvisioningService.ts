import { getAdminFirestore } from "../../lib/firebaseAdmin";
import { isInvalidTenantId } from "../../modules/workflow/approval/serverAuthMiddleware";
import { CashTill, BranchSafe, CurrencyCode } from "../../types/cashManagement";
import { Employee } from "../../types";
import { CashAccountMapping } from "../../domains/cash/validation/cashAccountMapping";
import { EmployeeCashEligibilityService } from "../../domains/cash/services/EmployeeCashEligibilityService";

export const TILL_PROVISIONING_AUTHORIZED_ROLES = new Set<string>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "HEAD_TELLER",
  "SUPER_ADMIN"
]);

export interface TillProvisioningActor {
  uid: string;
  email?: string;
  name?: string;
  role: string;
  business_id: string;
  isSuperAdmin?: boolean;
}

export interface AutoProvisionTillsOptions {
  branchId?: string;
  initialEmployees?: any[];
  requestedTillIds?: string[];
  requestedSafeIds?: string[];
}

export interface AutoProvisionTillsResult {
  tillsCreated: number;
  safesCreated: number;
  existingTillsCount: number;
  existingSafesCount: number;
  totalTills: number;
  tills: CashTill[];
  safes: BranchSafe[];
  createdTills: CashTill[];
  existingTills: CashTill[];
  createdSafes: BranchSafe[];
  existingSafes: BranchSafe[];
}

const VALID_CURRENCIES = new Set<string>(["HTG", "USD"]);
const tenantProvisioningLocks = new Map<string, Promise<any>>();

async function withTenantProvisioningLock<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
  const prev = tenantProvisioningLocks.get(businessId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => current, () => current);
  tenantProvisioningLocks.set(businessId, chained);

  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (tenantProvisioningLocks.get(businessId) === chained) {
      tenantProvisioningLocks.delete(businessId);
    }
  }
}

function isValidIdentifier(id: unknown, maxLen = 128): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > maxLen) return false;
  if (trimmed.includes("/") || trimmed.includes("..") || trimmed.includes("\\")) return false;
  if (isInvalidTenantId(trimmed)) return false;
  return true;
}

function extractAndVerifyTenantFromDoc(
  data: Record<string, any>,
  expectedBusinessId: string,
  errorCodeOnMismatch: string = "TENANT_OVERWRITE_FORBIDDEN"
): string {
  const b1 = typeof data.businessId === "string" ? data.businessId.trim() : "";
  const b2 = typeof data.business_id === "string" ? data.business_id.trim() : "";
  const c1 = typeof data.companyId === "string" ? data.companyId.trim() : "";
  const c2 = typeof data.company_id === "string" ? data.company_id.trim() : "";

  const nonEmpty = [b1, b2, c1, c2].filter(Boolean);
  if (nonEmpty.length === 0) {
    throw new Error(errorCodeOnMismatch);
  }
  const unique = new Set(nonEmpty);
  if (unique.size > 1) {
    throw new Error(errorCodeOnMismatch);
  }
  const resolved = nonEmpty[0];
  if (isInvalidTenantId(resolved) || resolved !== expectedBusinessId) {
    throw new Error(errorCodeOnMismatch);
  }
  return resolved;
}

function validateExistingCashDocIntegrity(data: Record<string, any>, docType: "TILL" | "SAFE"): void {
  const currency = data.currency;
  if (typeof currency !== "string" || !VALID_CURRENCIES.has(currency)) {
    throw new Error("MALFORMED_EXISTING_DOCUMENT");
  }
  if (
    data.balance_cents !== undefined &&
    (typeof data.balance_cents !== "number" || !Number.isFinite(data.balance_cents))
  ) {
    throw new Error("MALFORMED_EXISTING_DOCUMENT");
  }
  if (docType === "TILL" && data.status !== undefined) {
    const validStatuses = new Set(["OPEN", "CLOSED", "CLOSURE_REQUESTED", "LOCKED"]);
    if (typeof data.status !== "string" || !validStatuses.has(data.status)) {
      throw new Error("MALFORMED_EXISTING_DOCUMENT");
    }
  }
}

export class ServerTillProvisioningService {
  static async autoProvisionTillsForBusiness(
    businessIdRaw: string,
    actor: TillProvisioningActor,
    options: AutoProvisionTillsOptions = {},
    customAdminDb?: any
  ): Promise<AutoProvisionTillsResult> {
    if (!actor || typeof actor.uid !== "string" || !actor.uid.trim()) {
      throw new Error("UNAUTHORIZED");
    }

    const normalizedRole = (actor.role || "").trim().toUpperCase();
    if (!actor.isSuperAdmin && !TILL_PROVISIONING_AUTHORIZED_ROLES.has(normalizedRole)) {
      throw new Error("FORBIDDEN_ROLE");
    }

    if (!isValidIdentifier(businessIdRaw)) {
      throw new Error("INVALID_BUSINESS_ID");
    }
    const businessId = businessIdRaw.trim();

    if (!actor.isSuperAdmin) {
      const actorBiz = typeof actor.business_id === "string" ? actor.business_id.trim() : "";
      if (!actorBiz || isInvalidTenantId(actorBiz) || actorBiz !== businessId) {
        throw new Error("FORBIDDEN_TENANT_ACCESS");
      }
    }

    const rawBranchId = options.branchId !== undefined ? options.branchId : "MAIN_BRANCH";
    if (typeof rawBranchId !== "string" || !rawBranchId.trim() || rawBranchId.includes("/") || rawBranchId.includes("..")) {
      throw new Error("INVALID_PROVISIONING_PARAMS");
    }
    const branchId = rawBranchId.trim();

    if (options.initialEmployees !== undefined && !Array.isArray(options.initialEmployees)) {
      throw new Error("INVALID_PROVISIONING_PARAMS");
    }

    if (options.requestedTillIds !== undefined) {
      if (!Array.isArray(options.requestedTillIds) || options.requestedTillIds.some((id) => !isValidIdentifier(id))) {
        throw new Error("INVALID_PROVISIONING_PARAMS");
      }
    }

    if (options.requestedSafeIds !== undefined) {
      if (!Array.isArray(options.requestedSafeIds) || options.requestedSafeIds.some((id) => !isValidIdentifier(id))) {
        throw new Error("INVALID_PROVISIONING_PARAMS");
      }
    }

    // Validate all client-supplied initialEmployees before touching Firestore
    const validatedInitialEmployees: Array<Employee & { htgTillId?: string; usdTillId?: string }> = [];
    if (Array.isArray(options.initialEmployees)) {
      for (const rawEmp of options.initialEmployees) {
        if (!rawEmp || typeof rawEmp !== "object" || Array.isArray(rawEmp)) {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (!isValidIdentifier(rawEmp.id)) {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.name !== undefined && typeof rawEmp.name !== "string") {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.displayName !== undefined && typeof rawEmp.displayName !== "string") {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.role !== undefined && typeof rawEmp.role !== "string") {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.status !== undefined && typeof rawEmp.status !== "string") {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.branchId !== undefined && (typeof rawEmp.branchId !== "string" || rawEmp.branchId.includes("/") || rawEmp.branchId.includes(".."))) {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.branch_id !== undefined && (typeof rawEmp.branch_id !== "string" || rawEmp.branch_id.includes("/") || rawEmp.branch_id.includes(".."))) {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.htgTillId !== undefined && !isValidIdentifier(rawEmp.htgTillId)) {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }
        if (rawEmp.usdTillId !== undefined && !isValidIdentifier(rawEmp.usdTillId)) {
          throw new Error("INVALID_PROVISIONING_PARAMS");
        }

        // Strict dual-field and tenant isolation check on candidate employee
        const empBiz1 = typeof rawEmp.businessId === "string" ? rawEmp.businessId.trim() : "";
        const empBiz2 = typeof rawEmp.business_id === "string" ? rawEmp.business_id.trim() : "";
        const empComp1 = typeof rawEmp.companyId === "string" ? rawEmp.companyId.trim() : "";
        const empComp2 = typeof rawEmp.company_id === "string" ? rawEmp.company_id.trim() : "";

        const providedEmpTenants = [empBiz1, empBiz2, empComp1, empComp2].filter(Boolean);
        if (providedEmpTenants.length > 1 && new Set(providedEmpTenants).size > 1) {
          throw new Error("FORBIDDEN_TENANT_ACCESS");
        }
        if (providedEmpTenants.length > 0) {
          if (isInvalidTenantId(providedEmpTenants[0])) {
            throw new Error("INVALID_PROVISIONING_PARAMS");
          }
          if (providedEmpTenants[0] !== businessId) {
            throw new Error("FORBIDDEN_TENANT_ACCESS");
          }
        }

        validatedInitialEmployees.push({
          ...rawEmp,
          id: rawEmp.id.trim(),
          business_id: businessId,
          businessId: businessId
        });
      }
    }

    const db = customAdminDb || getAdminFirestore();

    return withTenantProvisioningLock(businessId, async () => {
      // Discover persisted tenant employees, tills, and safes prior to transaction
      const [
        empBySnakeSnap,
        empByCamelSnap,
        empSubcolSnap,
        tillsBySnakeSnap,
        tillsByCamelSnap,
        safesBySnakeSnap,
        safesByCamelSnap
      ] = await Promise.all([
        db.collection("employees").where("business_id", "==", businessId).get(),
        db.collection("employees").where("businessId", "==", businessId).get(),
        db.collection(`businesses/${businessId}/employees`).get(),
        db.collection("cash_tills").where("business_id", "==", businessId).get(),
        db.collection("cash_tills").where("businessId", "==", businessId).get(),
        db.collection("branch_safes").where("business_id", "==", businessId).get(),
        db.collection("branch_safes").where("businessId", "==", businessId).get()
      ]);

      const discoveredEmpIds = new Set<string>();
      const preloadedSubcolEmployees = new Map<string, Employee>();

      for (const snap of [empBySnakeSnap, empByCamelSnap]) {
        for (const docSnap of snap.docs || []) {
          const data = docSnap.data() || {};
          extractAndVerifyTenantFromDoc(data, businessId, "FORBIDDEN_TENANT_ACCESS");
          discoveredEmpIds.add(docSnap.id);
        }
      }
      for (const docSnap of empSubcolSnap.docs || []) {
        const data = docSnap.data() || {};
        if (data.business_id || data.businessId) {
          extractAndVerifyTenantFromDoc(data, businessId, "FORBIDDEN_TENANT_ACCESS");
        }
        discoveredEmpIds.add(docSnap.id);
        preloadedSubcolEmployees.set(docSnap.id, { id: docSnap.id, business_id: businessId, ...data } as Employee);
      }

      for (const initEmp of validatedInitialEmployees) {
        discoveredEmpIds.add(initEmp.id);
      }

      const discoveredTillIds = new Set<string>();
      for (const snap of [tillsBySnakeSnap, tillsByCamelSnap]) {
        for (const docSnap of snap.docs || []) {
          const data = docSnap.data() || {};
          extractAndVerifyTenantFromDoc(data, businessId, "TENANT_OVERWRITE_FORBIDDEN");
          validateExistingCashDocIntegrity(data, "TILL");
          discoveredTillIds.add(docSnap.id);
        }
      }

      const discoveredSafeIds = new Set<string>();
      for (const snap of [safesBySnakeSnap, safesByCamelSnap]) {
        for (const docSnap of snap.docs || []) {
          const data = docSnap.data() || {};
          extractAndVerifyTenantFromDoc(data, businessId, "TENANT_OVERWRITE_FORBIDDEN");
          validateExistingCashDocIntegrity(data, "SAFE");
          discoveredSafeIds.add(docSnap.id);
        }
      }

      // Execute atomic read-verify-write inside Firestore Transaction
      return await db.runTransaction(async (transaction: any) => {
        // 1. READ PHASE: Read all candidate employee docs inside transaction to prevent cross-tenant spoofing
        const candidateEmployeesMap = new Map<string, Employee & { htgTillId?: string; usdTillId?: string }>();
        for (const initEmp of validatedInitialEmployees) {
          candidateEmployeesMap.set(initEmp.id, initEmp);
        }

        const empIdList = Array.from(discoveredEmpIds);
        const empSnapshots = await Promise.all(
          empIdList.map((empId) => transaction.get(db.doc(`employees/${empId}`)))
        );

        for (let i = 0; i < empIdList.length; i++) {
          const empId = empIdList[i];
          const empSnap = empSnapshots[i];
          if (empSnap && empSnap.exists) {
            const empData = empSnap.data() || {};
            extractAndVerifyTenantFromDoc(empData, businessId, "TENANT_OVERWRITE_FORBIDDEN");
            const clientProvided = candidateEmployeesMap.get(empId);
            // Persisted Firestore employee data is authoritative over client-supplied attributes
            candidateEmployeesMap.set(empId, {
              ...(clientProvided || {}),
              ...empData,
              id: empId,
              business_id: businessId,
              htgTillId: clientProvided?.htgTillId,
              usdTillId: clientProvided?.usdTillId
            } as Employee & { htgTillId?: string; usdTillId?: string });
          } else if (preloadedSubcolEmployees.has(empId)) {
            const subEmp = preloadedSubcolEmployees.get(empId)!;
            const clientProvided = candidateEmployeesMap.get(empId);
            candidateEmployeesMap.set(empId, {
              ...(clientProvided || {}),
              ...subEmp,
              id: empId,
              business_id: businessId
            });
          }
        }

        const allCandidateEmployees = Array.from(candidateEmployeesMap.values());

        // Filter eligible employees using authoritative domain service
        const eligibleEmployees = allCandidateEmployees.filter((emp) => {
          const eligibility = EmployeeCashEligibilityService.isEligibleForTillAssignment(
            emp,
            [],
            "HTG",
            businessId
          );
          return eligibility.isEligible;
        });

        // 2. Collect all target safe IDs and till IDs to read transactionally
        const targetSafeHtgId = `safe_${businessId}_htg`;
        const targetSafeUsdId = `safe_${businessId}_usd`;

        const allSafeIdsToRead = new Set<string>([
          ...Array.from(discoveredSafeIds),
          targetSafeHtgId,
          targetSafeUsdId,
          ...(options.requestedSafeIds || [])
        ]);

        const allTillIdsToRead = new Set<string>([
          ...Array.from(discoveredTillIds),
          ...(options.requestedTillIds || [])
        ]);

        for (const emp of eligibleEmployees) {
          const htgId = emp.htgTillId || `till_${businessId}_${emp.id}_htg`;
          const usdId = emp.usdTillId || `till_${businessId}_${emp.id}_usd`;
          allTillIdsToRead.add(htgId);
          allTillIdsToRead.add(usdId);
        }

        const safeIdArray = Array.from(allSafeIdsToRead);
        const tillIdArray = Array.from(allTillIdsToRead);

        const [safeSnapshots, tillSnapshots] = await Promise.all([
          Promise.all(safeIdArray.map((id) => transaction.get(db.doc(`branch_safes/${id}`)))),
          Promise.all(tillIdArray.map((id) => transaction.get(db.doc(`cash_tills/${id}`))))
        ]);

        // 3. Verify every existing safe and till belongs strictly to this tenant
        const existingSafesById = new Map<string, BranchSafe>();
        for (let i = 0; i < safeIdArray.length; i++) {
          const sId = safeIdArray[i];
          const snap = safeSnapshots[i];
          if (snap && snap.exists) {
            const data = snap.data() || {};
            extractAndVerifyTenantFromDoc(data, businessId, "TENANT_OVERWRITE_FORBIDDEN");
            validateExistingCashDocIntegrity(data, "SAFE");
            existingSafesById.set(sId, { id: sId, ...data } as BranchSafe);
          }
        }

        const existingTillsById = new Map<string, CashTill>();
        for (let i = 0; i < tillIdArray.length; i++) {
          const tId = tillIdArray[i];
          const snap = tillSnapshots[i];
          if (snap && snap.exists) {
            const data = snap.data() || {};
            extractAndVerifyTenantFromDoc(data, businessId, "TENANT_OVERWRITE_FORBIDDEN");
            validateExistingCashDocIntegrity(data, "TILL");
            existingTillsById.set(tId, { id: tId, ...data } as CashTill);
          }
        }

        const nowIso = new Date().toISOString();
        const allSafes: BranchSafe[] = Array.from(existingSafesById.values());
        const createdSafes: BranchSafe[] = [];
        const existingSafesList: BranchSafe[] = [...allSafes];

        const allTills: CashTill[] = Array.from(existingTillsById.values());
        const createdTills: CashTill[] = [];
        const existingTillsList: CashTill[] = [...allTills];

        // 4. Provision missing Branch Safes (HTG & USD) without overwriting existing safes
        const hasHtgSafe =
          existingSafesById.has(targetSafeHtgId) ||
          allSafes.some((s) => s.currency === "HTG");

        if (!hasHtgSafe) {
          const resolvedSafeHtg = CashAccountMapping.resolveSafeAccount("HTG");
          CashAccountMapping.validateCashLocationMapping("SAFE", "HTG", resolvedSafeHtg.accountCode);
          const safeHtg: BranchSafe & { businessId: string } = {
            id: targetSafeHtgId,
            business_id: businessId,
            businessId: businessId,
            branch_id: branchId,
            name: "SAFE-HTG-01 (Coffre Principal HTG)",
            code: "SAFE-HTG-01",
            type: "SAFE",
            currency: "HTG",
            linked_account_code: resolvedSafeHtg.accountCode,
            linked_account_name: resolvedSafeHtg.accountName,
            manager_name: "Responsable Coffre / Head Teller",
            balance_cents: 0,
            min_limit_cents: 5000000, // 50,000 HTG
            max_limit_cents: 500000000, // 5,000,000 HTG
            status: "ACTIVE",
            created_by: actor.uid,
            created_at: nowIso,
            updated_at: nowIso
          };
          transaction.set(db.doc(`branch_safes/${targetSafeHtgId}`), safeHtg);
          allSafes.push(safeHtg);
          createdSafes.push(safeHtg);
        }

        const hasUsdSafe =
          existingSafesById.has(targetSafeUsdId) ||
          allSafes.some((s) => s.currency === "USD");

        if (!hasUsdSafe) {
          const resolvedSafeUsd = CashAccountMapping.resolveSafeAccount("USD");
          CashAccountMapping.validateCashLocationMapping("SAFE", "USD", resolvedSafeUsd.accountCode);
          const safeUsd: BranchSafe & { businessId: string } = {
            id: targetSafeUsdId,
            business_id: businessId,
            businessId: businessId,
            branch_id: branchId,
            name: "SAFE-USD-01 (Coffre Principal USD)",
            code: "SAFE-USD-01",
            type: "SAFE",
            currency: "USD",
            linked_account_code: resolvedSafeUsd.accountCode,
            linked_account_name: resolvedSafeUsd.accountName,
            manager_name: "Responsable Coffre / Head Teller",
            balance_cents: 0,
            min_limit_cents: 50000, // 500 USD
            max_limit_cents: 5000000, // 50,000 USD
            status: "ACTIVE",
            created_by: actor.uid,
            created_at: nowIso,
            updated_at: nowIso
          };
          transaction.set(db.doc(`branch_safes/${targetSafeUsdId}`), safeUsd);
          allSafes.push(safeUsd);
          createdSafes.push(safeUsd);
        }

        // 5. Provision missing Employee Tills (HTG & USD) without overwriting existing tills
        const currencies: CurrencyCode[] = ["HTG", "USD"];
        for (const emp of eligibleEmployees) {
          const empName = emp.name || emp.displayName || `Employé ${emp.id}`;
          const empBranch = emp.branchId || (emp as any).branch_id || branchId || "MAIN_BRANCH";

          for (const currency of currencies) {
            const targetTillId =
              currency === "HTG"
                ? emp.htgTillId || `till_${businessId}_${emp.id}_htg`
                : emp.usdTillId || `till_${businessId}_${emp.id}_usd`;

            const alreadyExistsById = existingTillsById.has(targetTillId);
            const alreadyAssignedInCurrency = allTills.some(
              (t) => t.assigned_teller_id === emp.id && t.currency === currency
            );

            if (alreadyExistsById || alreadyAssignedInCurrency) {
              // Strictly idempotent: never overwrite existing till balance, status, session, or metadata
              continue;
            }

            const existingCodes = new Set(allTills.map((t) => t.code).filter(Boolean));
            let nextIndex = allTills.filter((t) => t.currency === currency).length + 1;
            let code = `TILL-${currency}-${String(nextIndex).padStart(3, "0")}`;
            while (existingCodes.has(code)) {
              nextIndex++;
              code = `TILL-${currency}-${String(nextIndex).padStart(3, "0")}`;
            }

            const resolvedTillAccount = CashAccountMapping.resolveTillAccount(currency);
            CashAccountMapping.validateCashLocationMapping("TILL", currency, resolvedTillAccount.accountCode);

            const newTill: CashTill & { businessId: string } = {
              id: targetTillId,
              business_id: businessId,
              businessId: businessId,
              branch_id: empBranch,
              name: `${code} - ${empName}`,
              code,
              type: "TILL",
              assigned_teller_id: emp.id,
              assigned_teller_name: empName,
              currency,
              linked_account_code: resolvedTillAccount.accountCode,
              linked_account_name: resolvedTillAccount.accountName,
              balance_cents: 0,
              status: "CLOSED",
              created_by: actor.uid,
              created_at: nowIso,
              updated_at: nowIso
            };

            transaction.set(db.doc(`cash_tills/${targetTillId}`), newTill);
            existingTillsById.set(targetTillId, newTill);
            allTills.push(newTill);
            createdTills.push(newTill);
          }
        }

        return {
          tillsCreated: createdTills.length,
          safesCreated: createdSafes.length,
          existingTillsCount: existingTillsList.length,
          existingSafesCount: existingSafesList.length,
          totalTills: allTills.length,
          tills: allTills,
          safes: allSafes,
          createdTills,
          existingTills: existingTillsList,
          createdSafes,
          existingSafes: existingSafesList
        };
      });
    });
  }
}
