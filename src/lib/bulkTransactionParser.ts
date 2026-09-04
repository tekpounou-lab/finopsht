import Papa from "papaparse";
import { LedgerTransaction, Business, Branch, Employee, Department } from "../types";
import { CsvTransactionRow } from "./bulkTransactionValidator";
import { ReferenceResolver } from "../services/ReferenceResolver";

export interface ParseResult {
  data: any[];
  errors: any[];
}

export function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          data: results.data,
          errors: results.errors,
        });
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

export function buildLedgerTransactions(
  validRows: CsvTransactionRow[],
  currentBusiness: Business,
  branches: Branch[],
  departments: Department[],
  employees: Employee[],
  signerId: string
): LedgerTransaction[] {
  return validRows.map((row, idx) => {
    let resolvedBranchId = currentBusiness.id + "_branch"; // fallback
    let resolvedBranchName = undefined;
    if (row.branch_code) {
      const br = ReferenceResolver.resolveBranch(branches, row.branch_code);
      if (br) {
        resolvedBranchId = br.id;
        resolvedBranchName = br.name;
      }
    }

    let resolvedDepId = undefined;
    let resolvedDepName = undefined;
    if (row.department_code) {
      const dep = ReferenceResolver.resolveDepartment(departments, row.department_code);
      if (dep) {
        resolvedDepId = dep.id;
        resolvedDepName = dep.name;
      }
    }

    let resolvedEmpId = undefined;
    let resolvedEmpName = undefined;
    let resolvedEmpEmail = undefined;
    if (row.employee_email) {
      const emp = ReferenceResolver.resolveEmployee(employees, row.employee_email);
      if (emp) {
        resolvedEmpId = emp.id;
        resolvedEmpName = emp.name;
        resolvedEmpEmail = emp.email;
        
        // Reinforce alignment: HR Personnel is the SSOT for employee department affiliation
        if (emp.departmentId || (emp as any).department_id) {
          resolvedDepId = emp.departmentId || (emp as any).department_id;
          const edep = departments.find(d => d.id === resolvedDepId);
          if (edep) resolvedDepName = edep.name;
        }
        // If branch is the fallback and employee has a specific branch, use it
        if (resolvedBranchId === currentBusiness.id + "_branch" && (emp.branchId || (emp as any).branch_id)) {
          resolvedBranchId = emp.branchId || (emp as any).branch_id;
          const ebr = branches.find(b => b.id === resolvedBranchId);
          if (ebr) resolvedBranchName = ebr.name;
        }
      }
    }

    const ts = new Date().toISOString();
    const amountInCents = Math.round(row.amount_htg * 100);

    return {
      id: "txn_bulk_" + ts.replace(/\D/g, "") + "_" + idx,
      business_id: currentBusiness.id,
      branchId: resolvedBranchId,
      branch_id: resolvedBranchId,
      branch_code: row.branch_code,
      branch_name: resolvedBranchName,
      departmentId: resolvedDepId,
      department_id: resolvedDepId,
      department_code: row.department_code,
      department_name: resolvedDepName,
      employeeId: resolvedEmpId,
      employee_id: resolvedEmpId,
      employee_email: resolvedEmpEmail || row.employee_email,
      employeeName: resolvedEmpName,
      employee_name: resolvedEmpName,
      type: row.type,
      amount: row.amount_htg,
      amount_cents: amountInCents,
      description: row.description + (row.notes ? ` | Notes: ${row.notes}` : ""),
      date: row.date,
      category: row.category,
      isImmutable: true,
      signerId,
      currency: "HTG",
      status: "POSTED",
      payment_method: row.payment_method || "CASH",
    } as LedgerTransaction;
  });
}
