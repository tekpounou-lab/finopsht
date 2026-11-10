import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalExecutionWorker } from "../../modules/workflow/approval/ApprovalExecutionWorker";
import { ApprovalHashingService } from "../../modules/workflow/approval/ApprovalHashingService";

describe("P1-3 ApprovalExecutionWorker Remediation Unit Suite", () => {
  let mockAdminDb: any;
  let docsMap: Map<string, any>;
  let worker: ApprovalExecutionWorker;

  beforeEach(() => {
    docsMap = new Map();

    const createDocRef = (collName: string, docId: string) => ({
      id: docId,
      path: `${collName}/${docId}`,
      get: async () => ({
        exists: docsMap.has(`${collName}/${docId}`),
        id: docId,
        data: () => docsMap.get(`${collName}/${docId}`),
      }),
      update: async (data: any) => {
        const existing = docsMap.get(`${collName}/${docId}`) || {};
        docsMap.set(`${collName}/${docId}`, { ...existing, ...data });
      },
      set: async (data: any) => {
        docsMap.set(`${collName}/${docId}`, { ...data, id: docId });
      },
    });

    const createQuery = (collName: string, filters: Array<{ field: string; op: string; val: any }> = []) => ({
      where: (field: string, op: string, val: any) => createQuery(collName, [...filters, { field, op, val }]),
      get: async () => {
        const matches: any[] = [];
        for (const [key, val] of docsMap.entries()) {
          if (!key.startsWith(`${collName}/`)) continue;
          let pass = true;
          for (const f of filters) {
            if (f.op === "==" && val[f.field] !== f.val) pass = false;
          }
          if (pass) {
            matches.push({
              id: val.id || key.split("/")[1],
              data: () => val,
              exists: true,
            });
          }
        }
        return {
          empty: matches.length === 0,
          docs: matches,
          forEach: (cb: any) => matches.forEach(cb),
        };
      },
    });

    mockAdminDb = {
      collection: (collName: string) => ({
        doc: (docId: string) => createDocRef(collName, docId),
        where: (field: string, op: string, val: any) => createQuery(collName, [{ field, op, val }]),
      }),
      runTransaction: async (updateFunction: any) => {
        const transaction = {
          get: async (docRef: any) => docRef.get(),
          update: (docRef: any, data: any) => {
            const existing = docsMap.get(docRef.path) || {};
            docsMap.set(docRef.path, { ...existing, ...data });
          },
          set: (docRef: any, data: any) => {
            docsMap.set(docRef.path, { ...data, id: docRef.id });
          },
        };
        return updateFunction(transaction);
      },
      batch: () => {
        const operations: Array<() => void> = [];
        return {
          set: (docRef: any, data: any) => {
            operations.push(() => {
              const fullPath = docRef.path || `${docRef.id}`;
              docsMap.set(fullPath, { ...data, id: docRef.id });
            });
          },
          update: (docRef: any, data: any) => {
            operations.push(() => {
              const fullPath = docRef.path || `${docRef.id}`;
              const existing = docsMap.get(fullPath) || {};
              docsMap.set(fullPath, { ...existing, ...data });
            });
          },
          commit: async () => {
            operations.forEach((op) => op());
          },
        };
      },
    };

    worker = new ApprovalExecutionWorker(mockAdminDb);
  });

  it("P1-3-01: Correctly claims and processes an approved payroll instance", async () => {
    const businessId = "biz_test_001";
    const cycleId = "cycle_test_001";
    const instanceId = "instance_test_001";

    const snapshot = {
      business_id: businessId,
      cycleId,
      currency: "HTG",
      effectiveAccountingDate: "2026-03-31",
      totalGrossCents: 50000000,
      totalNetCents: 42000000,
      totalEmployerDeductionsCents: 8000000,
      employees: [
        {
          employeeId: "emp_01",
          employeeName: "Employee 1",
          grossCents: 25000000,
          netCents: 21000000,
          employerTaxesCents: 4000000,
          employeeDeductionsCents: 4000000,
          advancesCents: 0,
        },
        {
          employeeId: "emp_02",
          employeeName: "Employee 2",
          grossCents: 25000000,
          netCents: 21000000,
          employerTaxesCents: 4000000,
          employeeDeductionsCents: 4000000,
          advancesCents: 0,
        },
      ],
    };
    const expectedHash = ApprovalHashingService.computePayrollSourceHash(snapshot);

    docsMap.set(`approval_instances/${instanceId}`, {
      id: instanceId,
      business_id: businessId,
      entity_type: "PAYROLL_CYCLE",
      entity_id: cycleId,
      status: "APPROVED",
      execution_status: "PENDING",
      payload: snapshot,
      payload_hash: expectedHash,
    });

    docsMap.set(`payroll_cycles/${cycleId}`, {
      id: cycleId,
      business_id: businessId,
      period: "2026-03",
      effectiveAccountingDate: "2026-03-31",
      status: "LOCKED",
      totalGrossSalary: 500000,
      totalNetSalary: 420000,
      employeesCount: 2,
    });

    docsMap.set(`payroll_records/rec_01`, {
      id: "rec_01",
      payroll_cycle_id: cycleId,
      business_id: businessId,
      employeeId: "emp_01",
      gross_salary_cents: 25000000,
      net_salary_cents: 21000000,
      employer_deductions_cents: 4000000,
      employee_deductions_cents: 4000000,
      advances_cents: 0,
    });
    docsMap.set(`payroll_records/rec_02`, {
      id: "rec_02",
      payroll_cycle_id: cycleId,
      business_id: businessId,
      employeeId: "emp_02",
      gross_salary_cents: 25000000,
      net_salary_cents: 21000000,
      employer_deductions_cents: 4000000,
      employee_deductions_cents: 4000000,
      advances_cents: 0,
    });

    const result = await worker.executeApprovedPayroll(instanceId, "user_approver_01");
    expect(result.success).toBe(true);
    expect(result.status).toBe("EXECUTED");

    const instanceDoc = docsMap.get(`approval_instances/${instanceId}`);
    expect(instanceDoc.execution_status).toBe("EXECUTED");

    const cycleDoc = docsMap.get(`payroll_cycles/${cycleId}`);
    expect(cycleDoc.status).toBe("SEALED");
  });

  it("P1-3-02: Rejects execution if payload hash is mutated", async () => {
    const instanceId = "instance_mutated";
    docsMap.set(`approval_instances/${instanceId}`, {
      id: instanceId,
      business_id: "biz_test",
      entity_type: "PAYROLL_CYCLE",
      entity_id: "cycle_tampered",
      status: "APPROVED",
      execution_status: "PENDING",
      payload: {
        business_id: "biz_test",
        cycleId: "cycle_tampered",
        currency: "HTG",
        effectiveAccountingDate: "2026-03-31",
        totalGrossCents: 99999999,
        totalNetCents: 80000000,
        totalEmployerDeductionsCents: 19999999,
        employees: [],
      },
      payload_hash: "invalid_hash_value",
    });

    const result = await worker.executeApprovedPayroll(instanceId, "user_approver_01");
    expect(result.success).toBe(false);
    expect(result.status).toBe("EXECUTION_FAILED");
  });
});
