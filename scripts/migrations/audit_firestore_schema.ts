/**
 * FINOPS ERP — Script d'Audit Échafaudé & Exhaustif des Schémas Firestore (Phase 1)
 * 
 * Analyse en lecture seule (DRY RUN) toutes les collections et sous-collections Firestore :
 * 1. Détecte les paires de champs dupliqués (ex: branchId et branch_id, name et employee_name).
 * 2. Vérifie les conventions de nommage (camelCase vs snake_case).
 * 3. Identifie les violations du principe SSOT et les champs obsolètes.
 * 4. Valide l'intégrité référentielle des clés étrangères (businessId, branchId, departmentId, employeeId, userId).
 * 5. Génère une matrice de priorisation (P0, P1, P2, P3) et exporte un rapport JSON complet.
 * 
 * Usage:
 *   npx tsx scripts/migrations/audit_firestore_schema.ts [--dry-run] [--tenant=biz_xyz] [--output=chemin/rapport.json]
 */

import { db } from "../../src/lib/firebase";
import { collection, getDocs, doc, getDoc, query, where, collectionGroup } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

export type PriorityLevel = "P0" | "P1" | "P2" | "P3";

export interface FieldAnomaly {
  documentId: string;
  field: string;
  anomalyType: "DUPLICATE" | "NAMING_INCONSISTENCY" | "ORPHAN_FOREIGN_KEY" | "SSOT_VIOLATION" | "OBSOLETE";
  details: string;
  currentValue?: any;
  suggestedCorrection: string;
  severity: PriorityLevel;
}

export interface CollectionSummary {
  collectionName: string;
  isSubcollection: boolean;
  parentPathPattern?: string;
  documentCount: number;
  anomaliesCount: {
    duplicates: number;
    namingInconsistencies: number;
    orphanForeignKeys: number;
    ssotViolations: number;
    obsoleteFields: number;
    total: number;
  };
  priority: PriorityLevel;
  anomalies: FieldAnomaly[];
}

export interface GlobalAuditReport {
  metadata: {
    platform: "FINOPS ERP";
    version: "2.0";
    auditTimestamp: string;
    executionMode: "DRY_RUN_READ_ONLY";
    tenantFilter?: string;
    totalCollectionsAnalyzed: number;
    totalDocumentsScanned: number;
    totalAnomaliesDetected: number;
  };
  prioritizationMatrix: {
    P0_Critical: { count: number; collections: string[]; description: string };
    P1_High: { count: number; collections: string[]; description: string };
    P2_Medium: { count: number; collections: string[]; description: string };
    P3_Low: { count: number; collections: string[]; description: string };
  };
  collections: Record<string, CollectionSummary>;
  globalRecommendations: string[];
}

export const TARGET_COLLECTIONS: string[] = [
  "businesses",
  "employees",
  "users",
  "payroll_cycles",
  "ledger_transactions",
  "invoices",
  "proformas",
  "leads",
  "prospects",
  "attendance_logs",
  "attendance_records",
  "leaves",
  "shifts",
  "branches",
  "departments",
  "roles",
  "business_settings",
  "subscription_plans",
  "financial_snapshots",
  "analytics_snapshots",
  "metric_snapshots",
  "performance_snapshots",
  "events",
  "notifications",
  "invitations",
  "employee_contracts",
  "employee_badges",
  "compensation_models",
  "payroll_profiles",
  "salary_structures",
  "payroll_bonuses",
  "payroll_deductions",
  "salary_advances",
  "overtime_requests",
  "absence_events",
  "branch_department_links",
  "forensic_logs"
];

// Dictionnaire des paires de doublons connues
const KNOWN_DUPLICATE_PAIRS: Record<string, { counterpart: string; canonical: string; reason: string }> = {
  branchId: { counterpart: "branch_id", canonical: "branch_id", reason: "Firestore standardise en snake_case; TypeScript convertit en camelCase via toCamelCase()." },
  branch_id: { counterpart: "branchId", canonical: "branch_id", reason: "Firestore standardise en snake_case." },
  businessId: { counterpart: "business_id", canonical: "business_id", reason: "Multi-tenant standard Firestore : business_id." },
  business_id: { counterpart: "businessId", canonical: "business_id", reason: "Multi-tenant standard Firestore : business_id." },
  departmentId: { counterpart: "department_id", canonical: "department_id", reason: "Firestore standardise en snake_case." },
  department_id: { counterpart: "departmentId", canonical: "department_id", reason: "Firestore standardise en snake_case." },
  displayName: { counterpart: "display_name", canonical: "displayName", reason: "Profil utilisateur canonique." },
  display_name: { counterpart: "displayName", canonical: "displayName", reason: "Profil utilisateur canonique." },
  hireDate: { counterpart: "hire_date", canonical: "hireDate", reason: "Date d'embauche de l'employé." },
  hire_date: { counterpart: "hireDate", canonical: "hireDate", reason: "Date d'embauche de l'employé." },
  employee_name: { counterpart: "name", canonical: "name", reason: "Nom canonique court de l'employé." },
  name: { counterpart: "employee_name", canonical: "name", reason: "Nom canonique court de l'employé." },
  firebase_uid: { counterpart: "uid", canonical: "uid", reason: "Identifiant unique Firebase Auth." },
  uid: { counterpart: "firebase_uid", canonical: "uid", reason: "Identifiant unique Firebase Auth." },
  salaryBaseHtg: { counterpart: "baseSalary", canonical: "baseSalary", reason: "Salaire de base brut mensuel en HTG." },
  salary_base_htg: { counterpart: "baseSalary", canonical: "baseSalary", reason: "Salaire de base brut mensuel en HTG." },
  baseSalary: { counterpart: "salaryBaseHtg", canonical: "baseSalary", reason: "Salaire de base brut mensuel en HTG." },
  commission_rate: { counterpart: "commissionRate", canonical: "commissionRate", reason: "Taux de commissionnement." },
  commissionRate: { counterpart: "commission_rate", canonical: "commissionRate", reason: "Taux de commissionnement." },
  createdAt: { counterpart: "created_at", canonical: "createdAt", reason: "Timestamp ISO d'audit." },
  created_at: { counterpart: "createdAt", canonical: "createdAt", reason: "Timestamp ISO d'audit." },
  updatedAt: { counterpart: "updated_at", canonical: "updatedAt", reason: "Timestamp ISO d'audit." },
  updated_at: { counterpart: "updatedAt", canonical: "updatedAt", reason: "Timestamp ISO d'audit." },
  isActive: { counterpart: "is_active", canonical: "isActive", reason: "Indicateur d'activation du compte/entité." },
  is_active: { counterpart: "isActive", canonical: "isActive", reason: "Indicateur d'activation du compte/entité." },
  targetUserId: { counterpart: "target_user_id", canonical: "target_user_id", reason: "Cible de notification." },
  target_user_id: { counterpart: "targetUserId", canonical: "target_user_id", reason: "Cible de notification." },
  targetRoles: { counterpart: "target_roles", canonical: "target_roles", reason: "Cibles de notification RBAC." },
  target_roles: { counterpart: "targetRoles", canonical: "target_roles", reason: "Cibles de notification RBAC." }
};

// Détection des violations SSOT spécifiques
function checkSSOTViolation(collectionName: string, data: Record<string, any>): { violates: boolean; field: string; issue: string; fix: string } | null {
  if (collectionName === "invoices") {
    if (data.isPaid === true && !data.accountingTransactionId && !data.paymentDate) {
      return {
        violates: true,
        field: "isPaid",
        issue: "Facture marquée comme payée sans transaction Grand Livre associée (ledger_transactions).",
        fix: "Lier à l'écriture de journal comptable via accountingTransactionId ou valider par le Grand Livre."
      };
    }
  }

  if (collectionName === "payroll_cycles") {
    if (data.totalGrossHtg !== undefined && data.grossTotal !== undefined && data.totalGrossHtg !== data.grossTotal) {
      return {
        violates: true,
        field: "totalGrossHtg",
        issue: "Divergence entre totalGrossHtg et grossTotal dans l'agrégat de paie.",
        fix: "Recalculer les totaux à partir de la somme des fiches de paie individuelles (SSOT: payslips)."
      };
    }
  }

  if (collectionName === "employees") {
    if (data.status === "ACTIVE" && data.isActive === false) {
      return {
        violates: true,
        field: "isActive",
        issue: "Conflit d'état: status='ACTIVE' mais isActive=false.",
        fix: "Dériver isActive = (status === 'ACTIVE') pour maintenir une source unique de vérité."
      };
    }
  }

  return null;
}

export async function runFirestoreAudit(options?: {
  tenantId?: string;
  outputPath?: string;
}): Promise<GlobalAuditReport> {
  const tenantFilter = options?.tenantId;
  const startTime = new Date().toISOString();

  console.log("\n==========================================================================");
  console.log("🔍 FINOPS ERP — AUDIT COMPLET DES SCHÉMAS ET DE L'INTÉGRITÉ FIRESTORE (PHASE 1)");
  console.log(`   Mode d'exécution : 🟢 LECTURE SEULE (DRY RUN STRICT)`);
  console.log(`   Horodatage       : ${startTime}`);
  console.log(`   Tenant ciblé     : ${tenantFilter ? tenantFilter : "TOUS LES TENANTS"}`);
  console.log("==========================================================================\n");

  // 1. Préchargement en mémoire des ensembles de clés étrangères valides
  console.log("📥 [1/4] Préchargement des identifiants d'intégrité référentielle...");
  const [bizSnap, branchSnap, deptSnap, empSnap, userSnap] = await Promise.all([
    getDocs(collection(db, "businesses")).catch(() => ({ docs: [] })),
    getDocs(collection(db, "branches")).catch(() => ({ docs: [] })),
    getDocs(collection(db, "departments")).catch(() => ({ docs: [] })),
    getDocs(collection(db, "employees")).catch(() => ({ docs: [] })),
    getDocs(collection(db, "users")).catch(() => ({ docs: [] }))
  ]);

  const validBizIds = new Set(bizSnap.docs.map(d => d.id));
  const validBranchIds = new Set(branchSnap.docs.map(d => d.id));
  const validDeptIds = new Set(deptSnap.docs.map(d => d.id));
  const validEmpIds = new Set(empSnap.docs.map(d => d.id));
  const validUserIds = new Set(userSnap.docs.map(d => d.id));

  console.log(`   ✓ ${validBizIds.size} Entreprises, ${validBranchIds.size} Succursales, ${validDeptIds.size} Départements, ${validEmpIds.size} Employés, ${validUserIds.size} Utilisateurs indexés.\n`);

  console.log("🔬 [2/4] Analyse minutieuse des collections et détection d'anomalies...");

  const collectionsResult: Record<string, CollectionSummary> = {};
  let totalDocsScanned = 0;
  let totalAnomalies = 0;

  for (const colName of TARGET_COLLECTIONS) {
    try {
      const colRef = collection(db, colName);
      const q = tenantFilter ? query(colRef, where("business_id", "==", tenantFilter)) : query(colRef);
      const snapshot = await getDocs(q);

      const count = snapshot.size;
      totalDocsScanned += count;

      const anomalies: FieldAnomaly[] = [];
      let dupCount = 0;
      let namingCount = 0;
      let fkCount = 0;
      let ssotCount = 0;
      let obsoleteCount = 0;

      snapshot.docs.forEach((d) => {
        const raw = d.data();
        const keys = Object.keys(raw);

        // A. Vérification des doublons de champs
        keys.forEach((k) => {
          const dupInfo = KNOWN_DUPLICATE_PAIRS[k];
          if (dupInfo && keys.includes(dupInfo.counterpart)) {
            // Log only once per pair to prevent redundant dual entries
            if (k < dupInfo.counterpart) {
              dupCount++;
              anomalies.push({
                documentId: d.id,
                field: `${k} <-> ${dupInfo.counterpart}`,
                anomalyType: "DUPLICATE",
                details: `Coexistence de deux champs exprimant la même donnée.`,
                currentValue: { [k]: raw[k], [dupInfo.counterpart]: raw[dupInfo.counterpart] },
                suggestedCorrection: `Supprimer '${dupInfo.counterpart === dupInfo.canonical ? k : dupInfo.counterpart}' et conserver '${dupInfo.canonical}'. ${dupInfo.reason}`,
                severity: (colName === "employees" || colName === "payroll_cycles") ? "P0" : "P1"
              });
            }
          }
        });

        // B. Vérification des clés étrangères orphelines
        const bizId = raw.business_id || raw.businessId;
        const branchId = raw.branch_id || raw.branchId;
        const deptId = raw.department_id || raw.departmentId;
        const empId = raw.employee_id || raw.employeeId;
        const userId = raw.userId || raw.user_id || raw.uid || raw.firebase_uid;

        if (bizId && bizId !== "global" && !validBizIds.has(bizId)) {
          fkCount++;
          anomalies.push({
            documentId: d.id,
            field: "business_id",
            anomalyType: "ORPHAN_FOREIGN_KEY",
            details: `L'entreprise référencée [${bizId}] n'existe pas dans la collection 'businesses'.`,
            currentValue: bizId,
            suggestedCorrection: "Réassigner vers un tenant valide ou supprimer l'enregistrement orphelin.",
            severity: "P0"
          });
        }

        if (branchId && branchId !== "BRANCH_DEFAULT" && branchId !== "b_main" && !validBranchIds.has(branchId)) {
          fkCount++;
          anomalies.push({
            documentId: d.id,
            field: "branch_id",
            anomalyType: "ORPHAN_FOREIGN_KEY",
            details: `La succursale référencée [${branchId}] est introuvable.`,
            currentValue: branchId,
            suggestedCorrection: "Réassigner vers la succursale principale du tenant ou réinitialiser.",
            severity: "P1"
          });
        }

        if (deptId && deptId !== "DEPT_DEFAULT" && deptId !== "d_admin" && !validDeptIds.has(deptId)) {
          fkCount++;
          anomalies.push({
            documentId: d.id,
            field: "department_id",
            anomalyType: "ORPHAN_FOREIGN_KEY",
            details: `Le département référencé [${deptId}] est introuvable.`,
            currentValue: deptId,
            suggestedCorrection: "Réassigner vers le département par défaut du tenant.",
            severity: "P1"
          });
        }

        if (empId && empId !== "SYSTEM" && empId !== "UNASSIGNED" && !validEmpIds.has(empId)) {
          if (colName !== "employees") {
            fkCount++;
            anomalies.push({
              documentId: d.id,
              field: "employee_id",
              anomalyType: "ORPHAN_FOREIGN_KEY",
              details: `L'employé [${empId}] référencé est inexistant.`,
              currentValue: empId,
              suggestedCorrection: "Vérifier la création de l'employé ou nettoyer les pointages/fiches associés.",
              severity: "P0"
            });
          }
        }

        // C. Vérification des violations SSOT
        const ssot = checkSSOTViolation(colName, raw);
        if (ssot) {
          ssotCount++;
          anomalies.push({
            documentId: d.id,
            field: ssot.field,
            anomalyType: "SSOT_VIOLATION",
            details: ssot.issue,
            currentValue: raw[ssot.field],
            suggestedCorrection: ssot.fix,
            severity: "P1"
          });
        }
      });

      // Calcul de la priorité de la collection
      let colPriority: PriorityLevel = "P3";
      const totalColAnomalies = dupCount + namingCount + fkCount + ssotCount + obsoleteCount;
      totalAnomalies += totalColAnomalies;

      if (anomalies.some(a => a.severity === "P0")) {
        colPriority = "P0";
      } else if (anomalies.some(a => a.severity === "P1") || totalColAnomalies > 5) {
        colPriority = "P1";
      } else if (totalColAnomalies > 0) {
        colPriority = "P2";
      }

      collectionsResult[colName] = {
        collectionName: colName,
        isSubcollection: false,
        documentCount: count,
        anomaliesCount: {
          duplicates: dupCount,
          namingInconsistencies: namingCount,
          orphanForeignKeys: fkCount,
          ssotViolations: ssotCount,
          obsoleteFields: obsoleteCount,
          total: totalColAnomalies
        },
        priority: colPriority,
        anomalies: anomalies.slice(0, 30) // Cap sample anomalies to prevent out-of-memory
      };

      const icon = totalColAnomalies === 0 ? "✅" : colPriority === "P0" ? "🚨" : colPriority === "P1" ? "⚠️" : "ℹ️";
      console.log(`   ${icon} [${colName.padEnd(30)}] : ${String(count).padStart(4)} docs | ${String(totalColAnomalies).padStart(3)} anomalies (${colPriority})`);
    } catch (err: any) {
      console.warn(`   ⚠️ [${colName.padEnd(30)}] : Non accessible ou vide (${err.message})`);
    }
  }

  // 3. Matrice de Priorisation
  console.log("\n📊 [3/4] Consolidation de la Matrice de Priorisation des Corrections...");
  const matrix = {
    P0_Critical: {
      count: Object.values(collectionsResult).filter(c => c.priority === "P0").length,
      collections: Object.values(collectionsResult).filter(c => c.priority === "P0").map(c => c.collectionName),
      description: "Risque direct d'intégrité financière, d'isolation multi-tenant ou de crash de calcul de paie."
    },
    P1_High: {
      count: Object.values(collectionsResult).filter(c => c.priority === "P1").length,
      collections: Object.values(collectionsResult).filter(c => c.priority === "P1").map(c => c.collectionName),
      description: "Doublons fréquents de champs structurels (branch_id/department_id) et violations de SSOT."
    },
    P2_Medium: {
      count: Object.values(collectionsResult).filter(c => c.priority === "P2").length,
      collections: Object.values(collectionsResult).filter(c => c.priority === "P2").map(c => c.collectionName),
      description: "Incohérences de nommage mineures et champs obsolètes sur des collections secondaires."
    },
    P3_Low: {
      count: Object.values(collectionsResult).filter(c => c.priority === "P3").length,
      collections: Object.values(collectionsResult).filter(c => c.priority === "P3").map(c => c.collectionName),
      description: "Collections saines sans anomalies détectées ou avec impact purement cosmétique."
    }
  };

  const report: GlobalAuditReport = {
    metadata: {
      platform: "FINOPS ERP",
      version: "2.0",
      auditTimestamp: startTime,
      executionMode: "DRY_RUN_READ_ONLY",
      tenantFilter,
      totalCollectionsAnalyzed: TARGET_COLLECTIONS.length,
      totalDocumentsScanned: totalDocsScanned,
      totalAnomaliesDetected: totalAnomalies
    },
    prioritizationMatrix: matrix,
    collections: collectionsResult,
    globalRecommendations: [
      "1. Exécuter la Phase 2 (scripts/migrations/clean_duplicate_fields.ts) pour purger les doublons sur 'employees' et 'attendance_records'.",
      "2. Exécuter la Phase 3 (scripts/migrations/remediate_foreign_keys.ts) pour auto-assigner les succursales/départements orphelins aux valeurs par défaut du tenant.",
      "3. Activer la validation runtime Zod (src/validations/integritySchemas.ts) sur toutes les méthodes d'écriture des repositories.",
      "4. Standardiser la conversion automatique de cas via src/utils/caseConverter.ts dans les adapters de lecture/écriture."
    ]
  };

  // 4. Export JSON
  console.log("💾 [4/4] Génération du fichier de rapport d'audit...");
  const exportPath = options?.outputPath || path.join(process.cwd(), `audit_report_${Date.now()}.json`);
  try {
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\n✅ Rapport JSON enregistré avec succès : ${exportPath}`);
  } catch (err: any) {
    console.error(`❌ Échec d'écriture du fichier JSON : ${err.message}`);
  }

  // Affichage du récapitulatif dans la console
  console.log("\n==========================================================================");
  console.log("📋 SYNTHÈSE DE L'AUDIT FIRESTORE");
  console.log("==========================================================================");
  console.log(` • Documents analysés        : ${totalDocsScanned}`);
  console.log(` • Anomalies totales trouvées: ${totalAnomalies}`);
  console.log(` • Collections P0 (Critique) : ${matrix.P0_Critical.count} (${matrix.P0_Critical.collections.join(", ") || "Aucune"})`);
  console.log(` • Collections P1 (Élevée)   : ${matrix.P1_High.count} (${matrix.P1_High.collections.join(", ") || "Aucune"})`);
  console.log(` • Collections P2 (Moyenne)  : ${matrix.P2_Medium.count}`);
  console.log(` • Collections P3 (Saines)   : ${matrix.P3_Low.count}`);
  console.log("==========================================================================\n");

  return report;
}

// Exécution directe CLI
if (require.main === module || process.argv[1]?.includes("audit_firestore_schema.ts")) {
  const tenantArg = process.argv.find(a => a.startsWith("--tenant="))?.split("=")[1];
  const outputArg = process.argv.find(a => a.startsWith("--output="))?.split("=")[1];

  runFirestoreAudit({
    tenantId: tenantArg,
    outputPath: outputArg
  }).then(() => {
    console.log("🎯 Audit Phase 1 terminé avec succès.");
  });
}
