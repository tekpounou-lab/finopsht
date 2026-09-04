import { ReferenceResolver } from "../services/ReferenceResolver";
import { z } from "zod";
import { Business, Branch, Department, Employee } from "../types";

export const BulkTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  type: z.enum(["INCOME", "EXPENSE", "ADVANCE", "TRANSFER", "REFUND", "CORRECTION"]),
  category: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  amount_htg: z.coerce.number().positive("Amount must be strictly positive"),
  employee_email: z.string().optional(),
  branch_code: z.string().optional(),
  department_code: z.string().optional(),
  payment_method: z.enum(["CASH", "BANK", "MONCASH", "NATCASH", "CARD", "WIRE"]).optional(),
  reference: z.string().optional(),
  notes: z.string().optional()
});

export type CsvTransactionRow = z.infer<typeof BulkTransactionSchema>;

export interface ValidationResult {
  rowIdx: number;
  data: CsvTransactionRow;
  isValid: boolean;
  errors: string[];
}

export function validateTransactions(
  rows: any[],
  currentBusiness: Business,
  branches: Branch[],
  departments: Department[],
  employees: Employee[]
): ValidationResult[] {
  return rows.map((rawRow, idx) => {
    let errors: string[] = [];
    const parsed = BulkTransactionSchema.safeParse(rawRow);
    
    // We add 2 to idx: 1 for 1-based index, 1 for header row
    const rowNumber = idx + 2;

    if (!parsed.success) {
      errors = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
      // return a partially parsed row to display what we can
      return { rowIdx: rowNumber, data: rawRow as any, isValid: false, errors };
    }
    
    const data = parsed.data;

    // Cross-tenant and relationship checks
    if (data.employee_email) {
      const emp = employees.find(
        (e) => e.email.toLowerCase().trim() === data.employee_email?.toLowerCase().trim() &&
        e.business_id === currentBusiness.id
      );
      if (!emp) errors.push(`L'employé avec l'email '${data.employee_email}' est introuvable ou n'appartient pas à ce tenant.`);
    }

    if (data.branch_code) {
      const br = branches.find(
        (b) => b.id === ReferenceResolver.resolveBranch(branches, data.branch_code)?.id &&
        b.business_id === currentBusiness.id
      );
      if (!br) errors.push(`La succursale (branch_code) '${data.branch_code}' est introuvable ou invalide.`);
    }

    if (data.department_code) {
      const dep = departments.find(
        (d) => d.id === ReferenceResolver.resolveDepartment(departments, data.department_code)?.id
      );
      if (!dep) errors.push(`Le département '${data.department_code}' est introuvable.`);
    }

    return { rowIdx: rowNumber, data, isValid: errors.length === 0, errors };
  });
}
