/**
 * FINOPS ERP - Organization Code Service
 * 
 * Centralizes the automatic generation, normalization, and validation
 * of enterprise codes for Succursales (Branches) and Départements (Departments).
 * 
 * Rules:
 * - Codes are NEVER created or required from the end user.
 * - Codes are generated systematically on the FinOps side.
 * - Sequential numbering with 3-digit padding (SUC-001, DEP-001).
 * - Guaranteed collision-free across both individual creations and massive bulk imports.
 */

import { Branch, Department } from "../../types";

export class OrganizationCodeService {
  private static readonly BRANCH_PREFIX = "SUC";
  private static readonly DEPT_PREFIX = "DEP";

  /**
   * Formats a sequential number into a standard FinOps Branch code (e.g. SUC-001).
   */
  public static formatBranchCode(sequence: number): string {
    const padded = String(Math.max(1, sequence)).padStart(3, "0");
    return `${this.BRANCH_PREFIX}-${padded}`;
  }

  /**
   * Formats a sequential number into a standard FinOps Department code (e.g. DEP-001).
   */
  public static formatDepartmentCode(sequence: number): string {
    const padded = String(Math.max(1, sequence)).padStart(3, "0");
    return `${this.DEPT_PREFIX}-${padded}`;
  }

  /**
   * Extracts the highest numeric sequence from a set of existing codes matching a prefix.
   */
  private static extractMaxSequence(codes: (string | undefined)[], prefix: string): number {
    let max = 0;
    const regex = new RegExp(`^${prefix}[-_]?0*(\\d+)`, "i");

    for (const rawCode of codes) {
      if (!rawCode) continue;
      const match = rawCode.trim().match(regex);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val) && val > max) {
          max = val;
        }
      }
    }
    return max;
  }

  /**
   * Automatically generates the next unique Branch code for an enterprise.
   */
  public static generateBranchCode(existingBranches: Branch[]): string {
    const codes = existingBranches.map((b) => b.code);
    const existingCodeSet = new Set(
      codes.filter(Boolean).map((c) => c!.trim().toUpperCase())
    );

    // Check highest index for SUC or BR
    const maxSuc = this.extractMaxSequence(codes, this.BRANCH_PREFIX);
    const maxBr = this.extractMaxSequence(codes, "BR");
    let nextNum = Math.max(maxSuc, maxBr, existingBranches.length) + 1;

    let candidate = this.formatBranchCode(nextNum);
    while (existingCodeSet.has(candidate.toUpperCase())) {
      nextNum++;
      candidate = this.formatBranchCode(nextNum);
    }

    return candidate;
  }

  /**
   * Automatically generates the next unique Department code for an enterprise.
   */
  public static generateDepartmentCode(existingDepartments: Department[]): string {
    const codes = existingDepartments.map((d) => d.code);
    const existingCodeSet = new Set(
      codes.filter(Boolean).map((c) => c!.trim().toUpperCase())
    );

    const maxDept = this.extractMaxSequence(codes, this.DEPT_PREFIX);
    let nextNum = Math.max(maxDept, existingDepartments.length) + 1;

    let candidate = this.formatDepartmentCode(nextNum);
    while (existingCodeSet.has(candidate.toUpperCase())) {
      nextNum++;
      candidate = this.formatDepartmentCode(nextNum);
    }

    return candidate;
  }

  /**
   * Generates a contiguous array of unique Branch codes for a batch/massive import.
   */
  public static generateBatchBranchCodes(existingBranches: Branch[], count: number): string[] {
    const result: string[] = [];
    const simulatedList = [...existingBranches];

    for (let i = 0; i < count; i++) {
      const code = this.generateBranchCode(simulatedList);
      result.push(code);
      simulatedList.push({ id: `sim_${i}`, name: `Sim ${i}`, code } as Branch);
    }

    return result;
  }

  /**
   * Generates a contiguous array of unique Department codes for a batch/massive import.
   */
  public static generateBatchDepartmentCodes(existingDepartments: Department[], count: number): string[] {
    const result: string[] = [];
    const simulatedList = [...existingDepartments];

    for (let i = 0; i < count; i++) {
      const code = this.generateDepartmentCode(simulatedList);
      result.push(code);
      simulatedList.push({ id: `sim_d_${i}`, name: `Sim Dept ${i}`, code } as Department);
    }

    return result;
  }
}
