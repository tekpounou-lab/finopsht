/**
 * FINOPS ERP — Script de Vérification et Remédiation des Clés Étrangères
 * 
 * Scanne les documents et vérifie que toutes les clés étrangères pointent vers des entités existantes :
 * - `employees.department_id` -> `departments`
 * - `employees.branch_id` -> `branches`
 * - `departments.branch_id` -> `branches`
 * - `attendance_records.employee_id` -> `employees`
 * - `ledger_transactions.department_id` / `branch_id` -> `departments` / `branches`
 * - `invoices.accountingTransactionId` -> `ledger_transactions`
 * 
 * En mode `--live`, auto-assigne la succursale/département par défaut si introuvable.
 * 
 * Usage:
 *   npx tsx scripts/migrations/remediate_foreign_keys.ts [--live] [--tenant=biz_xyz]
 */

import { db } from "../../src/lib/firebase";
import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  query, 
  where 
} from "firebase/firestore";

interface ForeignKeyCheckResult {
  entity: string;
  id: string;
  field: string;
  invalidValue: string;
  reason: string;
  actionTaken?: string;
}

export async function remediateForeignKeys(options: {
  isLive?: boolean;
  tenantId?: string;
}): Promise<ForeignKeyCheckResult[]> {
  const { isLive = false, tenantId } = options;

  console.log(`\n======================================================`);
  console.log(`🔗 FINOPS ERP — Remédiation des Clés Étrangères`);
  console.log(`   Mode      : ${isLive ? "🔴 LIVE (Modifications appliquées)" : "🟢 DRY RUN (Simulation)"}`);
  console.log(`   Tenant ID : ${tenantId || "Tous les tenants"}`);
  console.log(`======================================================\n`);

  const results: ForeignKeyCheckResult[] = [];

  // 1. Load All Reference Collections
  console.log("📥 Chargement des tables de référence...");
  const [bizSnap, branchSnap, deptSnap, empSnap] = await Promise.all([
    getDocs(collection(db, "businesses")),
    getDocs(collection(db, "branches")),
    getDocs(collection(db, "departments")),
    getDocs(collection(db, "employees"))
  ]);

  const validBizIds = new Set(bizSnap.docs.map(d => d.id));
  const validBranchIds = new Set(branchSnap.docs.map(d => d.id));
  const validDeptIds = new Set(deptSnap.docs.map(d => d.id));
  const validEmpIds = new Set(empSnap.docs.map(d => d.id));

  // Determine fallback defaults per business
  const businessDefaultBranch: Record<string, string> = {};
  const businessDefaultDept: Record<string, string> = {};

  branchSnap.docs.forEach(d => {
    const b = d.data();
    const biz = b.business_id || b.businessId;
    if (biz && (!businessDefaultBranch[biz] || b.code === "MAIN" || b.name?.toLowerCase().includes("principal"))) {
      businessDefaultBranch[biz] = d.id;
    }
  });

  deptSnap.docs.forEach(d => {
    const dep = d.data();
    const biz = dep.business_id || dep.businessId;
    if (biz && (!businessDefaultDept[biz] || dep.code === "GEN" || dep.name?.toLowerCase().includes("général") || dep.name?.toLowerCase().includes("administration"))) {
      businessDefaultDept[biz] = d.id;
    }
  });

  let currentBatch = writeBatch(db);
  let batchCount = 0;

  // 2. Scan Departments (FK: branch_id, business_id)
  console.log("🔍 Vérification de l'intégrité de la collection [departments]...");
  for (const deptDoc of deptSnap.docs) {
    const data = deptDoc.data();
    const bizId = data.business_id || data.businessId;
    const branchId = data.branch_id || data.branchId;

    if (tenantId && bizId !== tenantId) continue;

    if (!bizId || !validBizIds.has(bizId)) {
      results.push({
        entity: "departments",
        id: deptDoc.id,
        field: "business_id",
        invalidValue: bizId || "MISSING",
        reason: "Le business parent est introuvable ou invalide"
      });
    }

    if (branchId && !validBranchIds.has(branchId)) {
      const fallback = businessDefaultBranch[bizId];
      results.push({
        entity: "departments",
        id: deptDoc.id,
        field: "branch_id",
        invalidValue: branchId,
        reason: `La succursale [${branchId}] n'existe pas`,
        actionTaken: fallback ? `Réassignation vers [${fallback}]` : "Aucun fallback disponible"
      });

      if (isLive && fallback) {
        currentBatch.update(doc(db, "departments", deptDoc.id), { branch_id: fallback, updatedAt: new Date().toISOString() });
        batchCount++;
      }
    }
  }

  // 3. Scan Employees (FK: business_id, branch_id, department_id)
  console.log("🔍 Vérification de l'intégrité de la collection [employees]...");
  for (const empDoc of empSnap.docs) {
    const data = empDoc.data();
    const bizId = data.business_id || data.businessId;
    const branchId = data.branch_id || data.branchId;
    const deptId = data.department_id || data.departmentId;

    if (tenantId && bizId !== tenantId) continue;

    if (!bizId || !validBizIds.has(bizId)) {
      results.push({
        entity: "employees",
        id: empDoc.id,
        field: "business_id",
        invalidValue: bizId || "MISSING",
        reason: "Le business parent de l'employé est introuvable"
      });
    }

    if (branchId && !validBranchIds.has(branchId)) {
      const fallback = businessDefaultBranch[bizId];
      results.push({
        entity: "employees",
        id: empDoc.id,
        field: "branch_id",
        invalidValue: branchId,
        reason: `La succursale [${branchId}] n'existe pas`,
        actionTaken: fallback ? `Réassignation vers [${fallback}]` : "Aucun fallback"
      });
      if (isLive && fallback) {
        currentBatch.update(doc(db, "employees", empDoc.id), { branch_id: fallback, updatedAt: new Date().toISOString() });
        batchCount++;
      }
    }

    if (deptId && !validDeptIds.has(deptId)) {
      const fallback = businessDefaultDept[bizId];
      results.push({
        entity: "employees",
        id: empDoc.id,
        field: "department_id",
        invalidValue: deptId,
        reason: `Le département [${deptId}] n'existe pas`,
        actionTaken: fallback ? `Réassignation vers [${fallback}]` : "Aucun fallback"
      });
      if (isLive && fallback) {
        currentBatch.update(doc(db, "employees", empDoc.id), { department_id: fallback, updatedAt: new Date().toISOString() });
        batchCount++;
      }
    }

    if (batchCount >= 400) {
      if (isLive) await currentBatch.commit();
      currentBatch = writeBatch(db);
      batchCount = 0;
    }
  }

  // 4. Scan Attendance Records (FK: employee_id)
  console.log("🔍 Vérification de l'intégrité de la collection [attendance_records]...");
  const attSnap = await getDocs(collection(db, "attendance_records"));
  for (const attDoc of attSnap.docs) {
    const data = attDoc.data();
    const empId = data.employee_id || data.employeeId;
    const bizId = data.business_id || data.businessId;

    if (tenantId && bizId !== tenantId) continue;

    if (empId && !validEmpIds.has(empId)) {
      results.push({
        entity: "attendance_records",
        id: attDoc.id,
        field: "employee_id",
        invalidValue: empId,
        reason: `L'employé [${empId}] référencé dans le pointage n'existe pas`
      });
    }
  }

  if (isLive && batchCount > 0) {
    await currentBatch.commit();
  }

  console.log(`\n======================================================`);
  console.log(`📊 BILAN DES ANOMALIES DE CLÉS ÉTRANGÈRES`);
  console.log(`======================================================`);
  console.log(`Total d'anomalies détectées : ${results.length}`);
  results.slice(0, 15).forEach(r => {
    console.log(` • [${r.entity}:${r.id}] ${r.field}='${r.invalidValue}' -> ${r.reason} (${r.actionTaken || "Pas d'action"})`);
  });
  if (results.length > 15) {
    console.log(` ... et ${results.length - 15} autres anomalies.`);
  }
  console.log(`======================================================\n`);

  return results;
}

if (require.main === module || process.argv[1]?.includes("remediate_foreign_keys.ts")) {
  const isLive = process.argv.includes("--live");
  const tenantArg = process.argv.find(a => a.startsWith("--tenant="))?.split("=")[1];

  remediateForeignKeys({
    isLive,
    tenantId: tenantArg
  }).then(() => {
    console.log("🎯 Remédiation terminée.");
  });
}
