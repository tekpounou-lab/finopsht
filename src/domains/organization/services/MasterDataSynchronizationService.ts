import { collection, doc, setDoc, updateDoc, getDocs, query, where, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { Branch, Department, Employee, LedgerTransaction } from "../../../types";
import { DepartmentNormalizer } from "./DepartmentNormalizer";
import { BranchNormalizer } from "./BranchNormalizer";
import { BranchRepository, DepartmentRepository } from "../../../repositories/organization";

export interface MasterAuditReport {
  businessId: string;
  departments: Array<{
    id: string;
    name: string;
    code: string;
    employeeCount: number;
    transactionCount: number;
    revenue: number;
    payrollCost: number;
    profitability: number;
    origin: string;
    isDuplicate: boolean;
    duplicateOf?: string;
  }>;
  branches: Array<{
    id: string;
    name: string;
    code: string;
    employeeCount: number;
    transactionCount: number;
    revenue: number;
    payrollCost: number;
    attendanceCount: number;
    departments: string[];
  }>;
  unlinkedEmployees: Array<{ id: string; name: string; departmentId?: string; branchId?: string }>;
  unlinkedTransactions: Array<{ id: string; description: string; amount: number; departmentId?: string; branchId?: string }>;
  duplicatesDetected: {
    departments: string[][];
    branches: string[][];
  };
  isValid: boolean;
}

export class MasterDataSynchronizationService {
  /**
   * Normalizes and cleans names/codes
   */
  public static normalizeDepartment(name: string): string {
    return DepartmentNormalizer.normalize(name);
  }

  public static normalizeBranch(name: string): string {
    return BranchNormalizer.normalize(name);
  }

  /**
   * Resolves a department by name or code. If missing, creates it.
   */
  public static async resolveOrCreateDepartment(
    businessId: string,
    rawName: string,
    rawCode?: string,
    branchId?: string
  ): Promise<Department> {
    const name = rawName ? rawName.trim() : "";
    if (!name) {
      throw new Error("Le nom du département ne peut pas être vide.");
    }
    const normalized = DepartmentNormalizer.normalize(name);
    const canonical = DepartmentNormalizer.getCanonicalId(name);
    const code = rawCode ? rawCode.trim().toUpperCase() : canonical.substring(0, 10).toUpperCase();

    // Search existing departments
    const list = await DepartmentRepository.listByBusiness(businessId);
    const existing = list.find(d => 
      (d.normalizedName && d.normalizedName === normalized) ||
      (d.normalized_name && d.normalized_name === normalized) ||
      DepartmentNormalizer.getCanonicalId(d.name) === canonical ||
      (d.code && d.code.toUpperCase() === code) ||
      (d.aliases && d.aliases.some(a => DepartmentNormalizer.getCanonicalId(a) === canonical))
    );

    if (existing) {
      // If code was missing, update it if possible
      if (!existing.code && code) {
        await DepartmentRepository.update(existing.id, { code });
        existing.code = code;
      }
      return existing;
    }

    // Create missing department
    const newDept: any = {
      businessId,
      name,
      normalizedName: normalized,
      code,
      branchId: branchId || "",
      status: "ACTIVE",
      isActive: true,
      source: "SYSTEM_IMPORT",
      isSystemGenerated: true,
      createdBy: "SYSTEM_IMPORT",
      aliases: [canonical, code.toLowerCase()]
    };

    const newId = await DepartmentRepository.create(newDept);
    return {
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...newDept
    };
  }

  /**
   * Resolves a branch by name or code. If missing, creates it.
   */
  public static async resolveOrCreateBranch(
    businessId: string,
    rawName: string,
    rawCode?: string
  ): Promise<Branch> {
    const name = rawName ? rawName.trim() : "";
    if (!name) {
      throw new Error("Le nom de la succursale ne peut pas être vide.");
    }
    const normalized = BranchNormalizer.normalize(name);
    const canonical = BranchNormalizer.getCanonicalId(name);
    const code = rawCode ? rawCode.trim().toUpperCase() : canonical.substring(0, 10).toUpperCase();

    const list = await BranchRepository.listByBusiness(businessId);
    const existing = list.find(b =>
      (b.name && BranchNormalizer.normalize(b.name) === normalized) ||
      BranchNormalizer.getCanonicalId(b.name) === canonical ||
      (b.code && b.code.toUpperCase() === code) ||
      ((b as any).aliases && ((b as any).aliases as string[]).some(a => BranchNormalizer.getCanonicalId(a) === canonical))
    );

    if (existing) {
      if (!existing.code && code) {
        await BranchRepository.update(existing.id, { code });
        existing.code = code;
      }
      return existing;
    }

    const newBranch: any = {
      businessId,
      name,
      code,
      isActive: true,
      status: "ACTIVE",
      address: "Adresse Générée par l'importateur",
      location: "Généré",
      managerId: "",
      aliases: [canonical, code.toLowerCase()],
      normalizedName: normalized,
      source: "SYSTEM_IMPORT",
      isSystemGenerated: true,
    };

    const newId = await BranchRepository.create(newBranch);
    return {
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...newBranch
    } as any;
  }

  /**
   * Safe Renaming & Cascade Updates
   */
  public static async cascadeRenameDepartment(
    businessId: string,
    departmentId: string,
    newName: string,
    newCode?: string
  ): Promise<void> {
    const normalized = DepartmentNormalizer.normalize(newName);
    const code = newCode ? newCode.trim().toUpperCase() : undefined;

    // 1. Update Master Department
    await DepartmentRepository.update(departmentId, {
      name: newName.trim(),
      normalizedName: normalized,
      code,
      updatedAt: new Date().toISOString()
    });

    // 2. Cascade update to all other referenced collections
    // Employees
    let empSnap = await getDocs(query(collection(db, "employees"), where("businessId", "==", businessId)));
    if (empSnap.empty) {
      empSnap = await getDocs(query(collection(db, "employees"), where("business_id", "==", businessId)));
    }
    const batch = writeBatch(db);
    let count = 0;

    empSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.departmentId === departmentId || data.department_id === departmentId) {
        batch.update(docSnap.ref, {
          departmentId: departmentId,
          departmentName: newName,
          departmentCode: code || data.departmentCode || data.department_code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    // General Ledger
    let txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("businessId", "==", businessId)));
    if (txSnap.empty) {
      txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("business_id", "==", businessId)));
    }
    txSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.departmentId === departmentId || data.department_id === departmentId) {
        batch.update(docSnap.ref, {
          departmentId: departmentId,
          departmentName: newName,
          departmentCode: code || data.departmentCode || data.department_code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
  }

  public static async cascadeRenameBranch(
    businessId: string,
    branchId: string,
    newName: string,
    newCode?: string
  ): Promise<void> {
    const normalized = BranchNormalizer.normalize(newName);
    const code = newCode ? newCode.trim().toUpperCase() : undefined;

    await BranchRepository.update(branchId, {
      name: newName.trim(),
      code,
      updatedAt: new Date().toISOString()
    });

    let empSnap = await getDocs(query(collection(db, "employees"), where("businessId", "==", businessId)));
    if (empSnap.empty) {
      empSnap = await getDocs(query(collection(db, "employees"), where("business_id", "==", businessId)));
    }
    const batch = writeBatch(db);
    let count = 0;

    empSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.branchId === branchId || data.branch_id === branchId) {
        batch.update(docSnap.ref, {
          branchId: branchId,
          branchName: newName,
          branchCode: code || data.branchCode || data.branch_code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    let txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("businessId", "==", businessId)));
    if (txSnap.empty) {
      txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("business_id", "==", businessId)));
    }
    txSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.branchId === branchId || data.branch_id === branchId) {
        batch.update(docSnap.ref, {
          branchId: branchId,
          branchName: newName,
          branchCode: code || data.branchCode || data.branch_code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
  }

  /**
   * Safe Merging tool
   */
  public static async mergeDepartments(
    businessId: string,
    sourceDeptId: string,
    targetDeptId: string
  ): Promise<void> {
    if (sourceDeptId === targetDeptId) return;

    const sourceDept = await DepartmentRepository.getById(sourceDeptId);
    const targetDept = await DepartmentRepository.getById(targetDeptId);

    if (!sourceDept || !targetDept) {
      throw new Error("Le département source ou cible est introuvable.");
    }

    // Combine aliases
    const combinedAliases = Array.from(new Set([
      ...(sourceDept.aliases || []),
      ...(targetDept.aliases || []),
      DepartmentNormalizer.getCanonicalId(sourceDept.name),
      sourceDept.code?.toLowerCase() || ""
    ].filter(Boolean)));

    await DepartmentRepository.update(targetDeptId, {
      aliases: combinedAliases
    });

    // Reassign all employees
    let empSnap = await getDocs(query(collection(db, "employees"), where("businessId", "==", businessId)));
    if (empSnap.empty) {
      empSnap = await getDocs(query(collection(db, "employees"), where("business_id", "==", businessId)));
    }
    const batch = writeBatch(db);
    let count = 0;

    empSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.departmentId === sourceDeptId || data.department_id === sourceDeptId) {
        batch.update(docSnap.ref, {
          departmentId: targetDeptId,
          departmentName: targetDept.name,
          departmentCode: targetDept.code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    // Reassign transactions
    let txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("businessId", "==", businessId)));
    if (txSnap.empty) {
      txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("business_id", "==", businessId)));
    }
    txSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.departmentId === sourceDeptId || data.department_id === sourceDeptId) {
        batch.update(docSnap.ref, {
          departmentId: targetDeptId,
          departmentName: targetDept.name,
          departmentCode: targetDept.code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }

    // Delete source department
    await deleteDoc(doc(db, "departments", sourceDeptId));
  }

  public static async mergeBranches(
    businessId: string,
    sourceBranchId: string,
    targetBranchId: string
  ): Promise<void> {
    if (sourceBranchId === targetBranchId) return;

    const sourceBranch = await BranchRepository.getById(sourceBranchId);
    const targetBranch = await BranchRepository.getById(targetBranchId);

    if (!sourceBranch || !targetBranch) {
      throw new Error("La succursale source ou cible est introuvable.");
    }

    // Reassign all employees
    let empSnap = await getDocs(query(collection(db, "employees"), where("businessId", "==", businessId)));
    if (empSnap.empty) {
      empSnap = await getDocs(query(collection(db, "employees"), where("business_id", "==", businessId)));
    }
    const batch = writeBatch(db);
    let count = 0;

    empSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.branchId === sourceBranchId || data.branch_id === sourceBranchId) {
        batch.update(docSnap.ref, {
          branchId: targetBranchId,
          branchName: targetBranch.name,
          branchCode: targetBranch.code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    // Reassign transactions
    let txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("businessId", "==", businessId)));
    if (txSnap.empty) {
      txSnap = await getDocs(query(collection(db, "ledger_transactions"), where("business_id", "==", businessId)));
    }
    txSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.branchId === sourceBranchId || data.branch_id === sourceBranchId) {
        batch.update(docSnap.ref, {
          branchId: targetBranchId,
          branchName: targetBranch.name,
          branchCode: targetBranch.code || "",
          updatedAt: new Date().toISOString()
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }

    // Delete source branch
    await deleteDoc(doc(db, "branches", sourceBranchId));
  }

  /**
   * Master Data Audit & Report
   */
  public static async auditMasterData(
    businessId: string,
    departments: Department[],
    branches: Branch[],
    employees: Employee[],
    transactions: LedgerTransaction[]
  ): Promise<MasterAuditReport> {
    const activeDepts = departments.filter(d => (d.businessId || (d as any).business_id) === businessId);
    const activeBranches = branches.filter(b => (b.businessId || (b as any).business_id) === businessId);

    const deptMap = new Map<string, typeof activeDepts[0]>();
    activeDepts.forEach(d => deptMap.set(d.id, d));

    const branchMap = new Map<string, typeof activeBranches[0]>();
    activeBranches.forEach(b => branchMap.set(b.id, b));

    const deptStats = new Map<string, { employeeCount: number; transactionCount: number; revenue: number; payrollCost: number }>();
    activeDepts.forEach(d => {
      deptStats.set(d.id, { employeeCount: 0, transactionCount: 0, revenue: 0, payrollCost: 0 });
    });

    const branchStats = new Map<string, { employeeCount: number; transactionCount: number; revenue: number; payrollCost: number; attendanceCount: number; departments: Set<string> }>();
    activeBranches.forEach(b => {
      branchStats.set(b.id, { employeeCount: 0, transactionCount: 0, revenue: 0, payrollCost: 0, attendanceCount: 0, departments: new Set() });
    });

    const unlinkedEmployees: MasterAuditReport["unlinkedEmployees"] = [];
    employees.forEach(emp => {
      const docBizId = emp.businessId || (emp as any).business_id;
      if (docBizId && docBizId !== businessId) return;

      const dId = emp.departmentId || (emp as any).department_id || "";
      const bId = emp.branchId || (emp as any).branch_id || "";

      let hasIssue = false;
      if (!dId || !deptMap.has(dId)) hasIssue = true;
      if (!bId || !branchMap.has(bId)) hasIssue = true;

      if (hasIssue) {
        unlinkedEmployees.push({ id: emp.id, name: emp.name, departmentId: dId, branchId: bId });
      }

      if (deptMap.has(dId)) {
        const dStat = deptStats.get(dId)!;
        dStat.employeeCount++;
        dStat.payrollCost += emp.baseSalary || 0;
      }

      if (branchMap.has(bId)) {
        const bStat = branchStats.get(bId)!;
        bStat.employeeCount++;
        bStat.payrollCost += emp.baseSalary || 0;
        if (dId && deptMap.has(dId)) {
          bStat.departments.add(dId);
        }
      }
    });

    const unlinkedTransactions: MasterAuditReport["unlinkedTransactions"] = [];
    transactions.forEach(tx => {
      const docBizId = tx.businessId || (tx as any).business_id;
      if (docBizId && docBizId !== businessId) return;

      const dId = tx.departmentId || (tx as any).department_id || "";
      const bId = tx.branchId || (tx as any).branch_id || "";

      let hasIssue = false;
      if (!dId || !deptMap.has(dId)) hasIssue = true;
      if (!bId || !branchMap.has(bId)) hasIssue = true;

      if (hasIssue) {
        unlinkedTransactions.push({
          id: tx.id,
          description: tx.description || "Tx GL",
          amount: tx.amount || 0,
          departmentId: dId,
          branchId: bId
        });
      }

      const amount = tx.amount || 0;
      const isRevenue = tx.type === "INCOME" || (tx as any).direction === "IN" || (tx as any).payment_method; // revenue indicators

      if (deptMap.has(dId)) {
        const dStat = deptStats.get(dId)!;
        dStat.transactionCount++;
        if (isRevenue) dStat.revenue += amount;
      }

      if (branchMap.has(bId)) {
        const bStat = branchStats.get(bId)!;
        bStat.transactionCount++;
        if (isRevenue) bStat.revenue += amount;
      }
    });

    // Detect duplicates based on normalized names
    const duplicateDepts: string[][] = [];
    const deptNorms = new Map<string, string[]>();
    activeDepts.forEach(d => {
      const norm = DepartmentNormalizer.normalize(d.name);
      const existing = deptNorms.get(norm) || [];
      existing.push(d.id);
      deptNorms.set(norm, existing);
    });
    deptNorms.forEach(ids => {
      if (ids.length > 1) duplicateDepts.push(ids);
    });

    const duplicateBranches: string[][] = [];
    const branchNorms = new Map<string, string[]>();
    activeBranches.forEach(b => {
      const norm = BranchNormalizer.normalize(b.name);
      const existing = branchNorms.get(norm) || [];
      existing.push(b.id);
      branchNorms.set(norm, existing);
    });
    branchNorms.forEach(ids => {
      if (ids.length > 1) duplicateBranches.push(ids);
    });

    const deptsList = activeDepts.map(d => {
      const stats = deptStats.get(d.id) || { employeeCount: 0, transactionCount: 0, revenue: 0, payrollCost: 0 };
      const profitability = stats.revenue - stats.payrollCost;
      const isDup = duplicateDepts.some(ids => ids.includes(d.id));
      const duplicateOf = isDup ? duplicateDepts.find(ids => ids.includes(d.id))?.find(id => id !== d.id) : undefined;

      return {
        id: d.id,
        name: d.name,
        code: d.code || "N/A",
        employeeCount: stats.employeeCount,
        transactionCount: stats.transactionCount,
        revenue: stats.revenue,
        payrollCost: stats.payrollCost,
        profitability,
        origin: (d as any).source || "Manual",
        isDuplicate: isDup,
        duplicateOf
      };
    });

    const branchesList = activeBranches.map(b => {
      const stats = branchStats.get(b.id) || { employeeCount: 0, transactionCount: 0, revenue: 0, payrollCost: 0, attendanceCount: 0, departments: new Set() };
      return {
        id: b.id,
        name: b.name,
        code: b.code || "N/A",
        employeeCount: stats.employeeCount,
        transactionCount: stats.transactionCount,
        revenue: stats.revenue,
        payrollCost: stats.payrollCost,
        attendanceCount: stats.attendanceCount,
        departments: Array.from(stats.departments).map(id => deptMap.get(id)?.name || id)
      };
    });

    const totalViolationsCount = unlinkedEmployees.length + unlinkedTransactions.length + duplicateDepts.length + duplicateBranches.length;

    return {
      businessId,
      departments: deptsList,
      branches: branchesList,
      unlinkedEmployees,
      unlinkedTransactions,
      duplicatesDetected: {
        departments: duplicateDepts,
        branches: duplicateBranches
      },
      isValid: totalViolationsCount === 0
    };
  }

  /**
   * Reference Repair
   */
  public static async autoRepairReferences(businessId: string): Promise<void> {
    let deptsSnap = await getDocs(query(collection(db, "departments"), where("businessId", "==", businessId)));
    if (deptsSnap.empty) {
      deptsSnap = await getDocs(query(collection(db, "departments"), where("business_id", "==", businessId)));
    }
    let branchesSnap = await getDocs(query(collection(db, "branches"), where("businessId", "==", businessId)));
    if (branchesSnap.empty) {
      branchesSnap = await getDocs(query(collection(db, "branches"), where("business_id", "==", businessId)));
    }

    const depts = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));
    const branches = branchesSnap.docs.map(b => ({ id: b.id, ...b.data() } as Branch));

    if (depts.length === 0) {
      await this.resolveOrCreateDepartment(businessId, "Administration & Finance", "FIN");
    }
    if (branches.length === 0) {
      await this.resolveOrCreateBranch(businessId, "Siège Social", "HQ");
    }

    const refreshedDepts = await DepartmentRepository.listByBusiness(businessId);
    const refreshedBranches = await BranchRepository.listByBusiness(businessId);

    const defaultDept = refreshedDepts[0];
    const defaultBranch = refreshedBranches[0];

    let empSnap = await getDocs(query(collection(db, "employees"), where("businessId", "==", businessId)));
    if (empSnap.empty) {
      empSnap = await getDocs(query(collection(db, "employees"), where("business_id", "==", businessId)));
    }
    const batch = writeBatch(db);
    let count = 0;

    empSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const currentDeptId = data.departmentId || data.department_id;
      const currentBranchId = data.branchId || data.branch_id;

      const validDept = refreshedDepts.some(d => d.id === currentDeptId);
      const validBranch = refreshedBranches.some(b => b.id === currentBranchId);

      const updates: any = {};
      if (!currentDeptId || !validDept) {
        updates.departmentId = defaultDept.id;
        updates.departmentName = defaultDept.name;
        updates.departmentCode = defaultDept.code || "";
      }
      if (!currentBranchId || !validBranch) {
        updates.branchId = defaultBranch.id;
        updates.branchName = defaultBranch.name;
        updates.branchCode = defaultBranch.code || "";
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date().toISOString();
        batch.update(docSnap.ref, updates);
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }
  }
}
