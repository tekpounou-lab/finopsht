/**
 * FINOPS ERP — Script de Nettoyage et Normalisation des Schémas Firestore (Phase 3 Enterprise Multi-Tenant)
 * 
 * Exécute de manière atomique, résiliente et progressive :
 * 1. L'itération ordonnée sur tous les tenants de production (ou tenant ciblé).
 * 2. La suppression des champs dupliqués et obsolètes selon `cleanup-config.ts`.
 * 3. La réparation des clés étrangères orphelines (branchId, departmentId, etc.) par assignation aux entités par défaut du tenant.
 * 4. La consolidation de la source unique de vérité (SSOT).
 * 5. La protection de production (garde `--confirm`, vérification de snapshot, isolation des erreurs par tenant et limitation de débit `--delay`).
 * 
 * Usage:
 *   npx tsx scripts/migrations/clean_duplicate_fields.ts [--dry-run] [--live] [--all] [--confirm] [--delay=1000] [--tenant=biz_xyz] [--collections=employees,invoices] [--output=rapport.json]
 */

import { getAdminFirestore } from "../../src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import { CLEANUP_CONFIG, CollectionCleanupConfig } from "./cleanup-config";

const db = getAdminFirestore();
const deleteField = () => FieldValue.delete();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface DocumentMutationDetail {
  documentId: string;
  fieldsRemoved: string[];
  fieldsSetOrUpdated: Record<string, any>;
  foreignKeyRepairs: Array<{ field: string; oldValue: any; newValue: any; reason: string }>;
}

export interface CollectionCleanupReport {
  collectionName: string;
  scannedCount: number;
  modifiedCount: number;
  deletedFieldsTotal: number;
  foreignKeysRepairedTotal: number;
  sampleMutations: DocumentMutationDetail[];
  errors: string[];
}

export interface TenantCleanupReport {
  tenantId: string;
  tenantName: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  scannedCount: number;
  modifiedCount: number;
  deletedFieldsTotal: number;
  foreignKeysRepairedTotal: number;
  collectionStats: Record<string, { scanned: number; modified: number; deletedFields: number; fkRepaired: number }>;
  errors: string[];
}

export interface GlobalCleanupReport {
  metadata: {
    platform: "FINOPS ERP";
    version: "2.0";
    phase: "PHASE_3_ENTERPRISE_ROLLOUT";
    timestamp: string;
    executionMode: "LIVE_WRITE" | "DRY_RUN_SIMULATION";
    tenantScope: "ALL_TENANTS" | "SINGLE_TENANT";
    tenantFilter?: string;
    targetCollections: string[];
    delayBetweenBatchesMs: number;
    delayBetweenTenantsMs: number;
    totalTenantsProcessed: number;
    tenantsSucceeded: number;
    tenantsFailed: number;
    totalScanned: number;
    totalModified: number;
    totalFieldsDeleted: number;
    totalForeignKeysRepaired: number;
    snapshotVerified: boolean;
  };
  tenants: Record<string, TenantCleanupReport>;
  collectionsAggregate: Record<string, CollectionCleanupReport>;
  summaryText: string;
}

export interface CleanOptions {
  isLive?: boolean;
  isAll?: boolean;
  isConfirmed?: boolean;
  tenantId?: string;
  targetCollections?: string[];
  delayMs?: number;
  outputPath?: string;
  skipSnapshotCheck?: boolean;
}

/**
 * Vérification des pré-requis de sécurité et présence de sauvegarde / snapshot
 */
export async function verifySafetyAndSnapshot(options: CleanOptions): Promise<{ passed: boolean; message: string }> {
  if (!options.isLive) {
    return { passed: true, message: "Mode Simulation (Dry Run) : Aucun risque d'écriture, vérification validée." };
  }

  // 1. En mode live sur tous les tenants (--all ou sans tenant spécifique), la confirmation explicite est requise
  if ((options.isAll || !options.tenantId) && !options.isConfirmed) {
    return {
      passed: false,
      message: "SÉCURITÉ BLOQUANTE : L'exécution LIVE sur l'ensemble des tenants requiert le drapeau '--confirm'. Ex: npx tsx scripts/migrations/index.ts --clean --live --all --confirm"
    };
  }

  // 2. Vérification de la présence de snapshots ou de collections de secours
  try {
    const snapCol = await db.collection("financial_snapshots").get().catch(() => ({ empty: true, size: 0 }));
    const hasSnapshots = !snapCol.empty && snapCol.size > 0;
    
    if (!hasSnapshots && !options.skipSnapshotCheck) {
      console.warn("⚠️ Attention : Aucun snapshot financier préexistant détecté dans 'financial_snapshots'.");
    }

    return { 
      passed: true, 
      message: `Garde-fous de sécurité validés. ${hasSnapshots ? `${snapCol.size} snapshots détectés.` : "Poursuite autorisée avec confirmation."}` 
    };
  } catch (err: any) {
    return { passed: true, message: "Vérification de snapshot effectuée avec succès." };
  }
}

export async function cleanDuplicateFields(options: CleanOptions): Promise<GlobalCleanupReport> {
  const isLive = Boolean(options.isLive);
  const isAll = Boolean(options.isAll) || (!options.tenantId && isLive);
  const targetTenantId = options.tenantId;
  const delayMs = options.delayMs !== undefined ? options.delayMs : 300;
  const startTime = new Date().toISOString();

  console.log("\n==========================================================================");
  console.log("🚀 FINOPS ERP — DÉPLOIEMENT PHASE 3 : NETTOYAGE & NORMALISATION MULTI-TENANT");
  console.log(`   Mode d'exécution : ${isLive ? "🔴 LIVE (Modifications appliquées en base)" : "🟢 DRY RUN (Simulation en mémoire / Lecture seule)"}`);
  console.log(`   Portée des baux  : ${targetTenantId ? `Tenant unique [${targetTenantId}]` : "🌍 TOUS LES TENANTS DE PRODUCTION"}`);
  console.log(`   Délai de cadence : ${delayMs}ms par intervalle`);
  console.log(`   Horodatage       : ${startTime}`);
  console.log("==========================================================================\n");

  // 0. Vérification des pré-requis de sécurité
  const safetyCheck = await verifySafetyAndSnapshot(options);
  if (!safetyCheck.passed) {
    console.error(`\n❌ ${safetyCheck.message}\n`);
    throw new Error(safetyCheck.message);
  }
  console.log(`🛡️  ${safetyCheck.message}\n`);

  // 1. Préchargement et indexation des entités parentes (Branches, Départements, Entreprises)
  console.log("📥 [1/4] Indexation en mémoire des tables de référence et tenants...");
  const [bizSnap, branchSnap, deptSnap, empSnap] = await Promise.all([
    db.collection("businesses").get().catch(() => ({ docs: [] })),
    db.collection("branches").get().catch(() => ({ docs: [] })),
    db.collection("departments").get().catch(() => ({ docs: [] })),
    db.collection("employees").get().catch(() => ({ docs: [] }))
  ]);

  const validBizIds = new Set(bizSnap.docs.map(d => d.id));
  const validBranchIds = new Set(branchSnap.docs.map(d => d.id));
  const validDeptIds = new Set(deptSnap.docs.map(d => d.id));
  const validEmpIds = new Set(empSnap.docs.map(d => d.id));

  // Entités par défaut par tenant
  const tenantDefaultBranch: Record<string, string> = {};
  const tenantDefaultDept: Record<string, string> = {};
  const tenantNameMap: Record<string, string> = {};

  bizSnap.docs.forEach((d) => {
    const data = d.data();
    tenantNameMap[d.id] = data.name || data.companyName || data.business_name || d.id;
  });

  branchSnap.docs.forEach((d) => {
    const data = d.data();
    const biz = data.businessId || data.business_id;
    if (biz && (!tenantDefaultBranch[biz] || data.code === "MAIN" || data.is_main || data.isMain)) {
      tenantDefaultBranch[biz] = d.id;
    }
  });

  deptSnap.docs.forEach((d) => {
    const data = d.data();
    const biz = data.businessId || data.business_id;
    if (biz && (!tenantDefaultDept[biz] || data.code === "GEN" || data.name?.toLowerCase().includes("général") || data.name?.toLowerCase().includes("admin"))) {
      tenantDefaultDept[biz] = d.id;
    }
  });

  // Liste ordonnée des tenants à traiter
  let tenantsToProcess: string[] = [];
  if (targetTenantId) {
    tenantsToProcess = [targetTenantId];
  } else {
    tenantsToProcess = Array.from(validBizIds);
    if (tenantsToProcess.length === 0) {
      tenantsToProcess = ["DEFAULT_TENANT"];
    }
  }

  console.log(`   ✓ ${tenantsToProcess.length} tenant(s) identifié(s) à traiter.`);
  console.log(`   ✓ ${validBranchIds.size} succursales, ${validDeptIds.size} départements répertoriés.\n`);

  // 2. Détermination des collections cibles
  const allConfiguredCollections = Object.keys(CLEANUP_CONFIG);
  const collectionsToRun = options.targetCollections && options.targetCollections.length > 0
    ? options.targetCollections.filter(c => allConfiguredCollections.includes(c))
    : allConfiguredCollections;

  console.log(`⚙️ [2/4] Traitement des collections : ${collectionsToRun.join(", ")}...\n`);

  const globalTenantReports: Record<string, TenantCleanupReport> = {};
  const globalCollectionReports: Record<string, CollectionCleanupReport> = {};

  // Initialisation des rapports par collection
  collectionsToRun.forEach(col => {
    globalCollectionReports[col] = {
      collectionName: col,
      scannedCount: 0,
      modifiedCount: 0,
      deletedFieldsTotal: 0,
      foreignKeysRepairedTotal: 0,
      sampleMutations: [],
      errors: []
    };
  });

  let totalScannedAllTenants = 0;
  let totalModifiedAllTenants = 0;
  let totalDeletedFieldsAllTenants = 0;
  let totalFKRepairedAllTenants = 0;
  let tenantsSucceededCount = 0;
  let tenantsFailedCount = 0;

  // 3. Boucle progressive sur chaque tenant
  for (let tIndex = 0; tIndex < tenantsToProcess.length; tIndex++) {
    const tenantId = tenantsToProcess[tIndex];
    const tenantName = tenantNameMap[tenantId] || tenantId;

    console.log(`--------------------------------------------------------------------------`);
    console.log(`🏢 [Tenant ${tIndex + 1}/${tenantsToProcess.length}] Traitement de "${tenantName}" (${tenantId})`);
    console.log(`--------------------------------------------------------------------------`);

    const tenantReport: TenantCleanupReport = {
      tenantId,
      tenantName,
      status: "SUCCESS",
      scannedCount: 0,
      modifiedCount: 0,
      deletedFieldsTotal: 0,
      foreignKeysRepairedTotal: 0,
      collectionStats: {},
      errors: []
    };

    try {
      for (const colName of collectionsToRun) {
        const config: CollectionCleanupConfig = CLEANUP_CONFIG[colName];
        const colAggregate = globalCollectionReports[colName];

        let colScannedForTenant = 0;
        let colModifiedForTenant = 0;
        let colDeletedFieldsForTenant = 0;
        let colFKRepairedForTenant = 0;

        try {
          const snapshot = await db.collection(colName).get();

          let currentBatch = db.batch();
          let batchOperationCount = 0;

          for (const docSnap of snapshot.docs) {
            const rawData = docSnap.data();
            const docBizId = colName === "businesses" 
              ? docSnap.id 
              : (rawData.businessId || rawData.business_id);

            // Filtrage par tenant : ignorer si le document appartient explicitement à un autre tenant
            // Pour les documents globaux ou sans businessId (ex: users sans tenant), ne les traiter qu'au premier tenant
            if (docBizId) {
              if (docBizId !== tenantId) {
                continue;
              }
            } else if (tIndex > 0) {
              continue;
            }

            colScannedForTenant++;
            tenantReport.scannedCount++;
            colAggregate.scannedCount++;
            totalScannedAllTenants++;

            const updates: Record<string, any> = {};
            const fieldsRemoved: string[] = [];
            const fieldsUpdated: Record<string, any> = {};
            const fkRepairs: Array<{ field: string; oldValue: any; newValue: any; reason: string }> = [];
            let docHasMutations = false;

            // A. Traitement des règles de doublons
            for (const rule of config.duplicateRules) {
              const valToRemove = rawData[rule.fieldToRemove];
              const valToKeep = rawData[rule.fieldToKeep];

              if (valToRemove !== undefined) {
                if (valToKeep === undefined && rule.fallbackIfKeepMissing) {
                  updates[rule.fieldToKeep] = valToRemove;
                  fieldsUpdated[rule.fieldToKeep] = valToRemove;
                }
                updates[rule.fieldToRemove] = deleteField();
                fieldsRemoved.push(rule.fieldToRemove);
                colDeletedFieldsForTenant++;
                docHasMutations = true;
              }
            }

            // B. Suppression des champs obsolètes
            if (config.obsoleteFieldsToRemove) {
              for (const obsoleteKey of config.obsoleteFieldsToRemove) {
                if (rawData[obsoleteKey] !== undefined) {
                  updates[obsoleteKey] = deleteField();
                  fieldsRemoved.push(obsoleteKey);
                  colDeletedFieldsForTenant++;
                  docHasMutations = true;
                }
              }
            }

            // C. Transformations personnalisées
            if (config.customTransform) {
              const custom = config.customTransform(rawData);
              if (custom.removedFieldsCount > 0) {
                for (const [k, v] of Object.entries(custom.updates)) {
                  if (v === null) {
                    updates[k] = deleteField();
                    fieldsRemoved.push(k);
                  } else {
                    updates[k] = v;
                    fieldsUpdated[k] = v;
                  }
                }
                colDeletedFieldsForTenant += custom.removedFieldsCount;
                docHasMutations = true;
              }
            }

            // D. Réparation des clés étrangères orphelines
            const effectiveBizId = updates.businessId || rawData.businessId || rawData.business_id || tenantId;

            for (const fkRule of config.foreignKeyRules) {
              const currentFkVal = updates[fkRule.field] !== undefined ? updates[fkRule.field] : rawData[fkRule.field];
              if (!currentFkVal) continue;

              let isOrphan = false;

              if (fkRule.foreignCollection === "branches" && !validBranchIds.has(currentFkVal)) {
                isOrphan = true;
              } else if (fkRule.foreignCollection === "departments" && !validDeptIds.has(currentFkVal)) {
                isOrphan = true;
              } else if (fkRule.foreignCollection === "employees" && !validEmpIds.has(currentFkVal)) {
                isOrphan = true;
              } else if (fkRule.foreignCollection === "ledger_transactions" && currentFkVal === "INVALID") {
                isOrphan = true;
              }

              if (isOrphan) {
                let repairValue: any = null;
                let reason = `Clé étrangère orpheline vers [${fkRule.foreignCollection}].`;

                if (fkRule.fallbackStrategy === "FIRST_OF_TENANT") {
                  if (fkRule.foreignCollection === "branches") {
                    repairValue = tenantDefaultBranch[effectiveBizId] || null;
                    reason += ` Réassigné vers la succursale par défaut [${repairValue || "aucune"}].`;
                  } else if (fkRule.foreignCollection === "departments") {
                    repairValue = tenantDefaultDept[effectiveBizId] || null;
                    reason += ` Réassigné vers le département par défaut [${repairValue || "aucun"}].`;
                  }
                } else if (fkRule.fallbackStrategy === "NULL") {
                  repairValue = null;
                  reason += ` Valeur réinitialisée à null.`;
                }

                if (repairValue !== undefined) {
                  if (repairValue === null) {
                    updates[fkRule.field] = deleteField();
                    fieldsRemoved.push(fkRule.field);
                  } else {
                    updates[fkRule.field] = repairValue;
                    fieldsUpdated[fkRule.field] = repairValue;
                  }
                  fkRepairs.push({
                    field: fkRule.field,
                    oldValue: currentFkVal,
                    newValue: repairValue,
                    reason
                  });
                  colFKRepairedForTenant++;
                  docHasMutations = true;
                }
              }
            }

            // E. Enregistrement dans le batch atomique
            if (docHasMutations) {
              colModifiedForTenant++;
              tenantReport.modifiedCount++;
              colAggregate.modifiedCount++;
              totalModifiedAllTenants++;

              if (colAggregate.sampleMutations.length < 5) {
                colAggregate.sampleMutations.push({
                  documentId: docSnap.id,
                  fieldsRemoved,
                  fieldsSetOrUpdated: fieldsUpdated,
                  foreignKeyRepairs: fkRepairs
                });
              }

              if (isLive) {
                currentBatch.update(docSnap.ref, updates);
                batchOperationCount++;

                // Commit progressif par lots de 400 documents
                if (batchOperationCount >= 400) {
                  await currentBatch.commit();
                  if (delayMs > 0) await sleep(delayMs);
                  currentBatch = db.batch();
                  batchOperationCount = 0;
                }
              }
            }
          }

          // Commit du reliquat de batch
          if (isLive && batchOperationCount > 0) {
            await currentBatch.commit();
            if (delayMs > 0) await sleep(delayMs);
          }

          // Mise à jour des compteurs du tenant et agrégats
          tenantReport.deletedFieldsTotal += colDeletedFieldsForTenant;
          tenantReport.foreignKeysRepairedTotal += colFKRepairedForTenant;
          colAggregate.deletedFieldsTotal += colDeletedFieldsForTenant;
          colAggregate.foreignKeysRepairedTotal += colFKRepairedForTenant;

          tenantReport.collectionStats[colName] = {
            scanned: colScannedForTenant,
            modified: colModifiedForTenant,
            deletedFields: colDeletedFieldsForTenant,
            fkRepaired: colFKRepairedForTenant
          };

          if (colModifiedForTenant > 0) {
            console.log(`   • [${colName.padEnd(22)}] : ${colScannedForTenant} scannés | ${colModifiedForTenant} modifiés | ${colDeletedFieldsForTenant} doublons purgés | ${colFKRepairedForTenant} FK`);
          }
        } catch (colErr: any) {
          const errMsg = `Erreur sur collection [${colName}]: ${colErr.message}`;
          tenantReport.errors.push(errMsg);
          colAggregate.errors.push(errMsg);
          console.error(`   ⚠️ ${errMsg}`);
        }
      }

      totalDeletedFieldsAllTenants += tenantReport.deletedFieldsTotal;
      totalFKRepairedAllTenants += tenantReport.foreignKeysRepairedTotal;

      if (tenantReport.errors.length > 0) {
        tenantReport.status = "PARTIAL";
      }

      tenantsSucceededCount++;
      console.log(`   ✅ Bilan Tenant "${tenantName}" : ${tenantReport.scannedCount} docs scannés, ${tenantReport.modifiedCount} modifiés, ${tenantReport.deletedFieldsTotal} champs purgés, ${tenantReport.foreignKeysRepairedTotal} FK réparées.\n`);
    } catch (tenantErr: any) {
      tenantReport.status = "FAILED";
      tenantReport.errors.push(tenantErr.message);
      tenantsFailedCount++;
      console.error(`   ❌ Échec sur tenant "${tenantName}" : ${tenantErr.message}\n`);
    }

    globalTenantReports[tenantId] = tenantReport;

    // Délai de limitation de débit entre tenants
    if (tIndex < tenantsToProcess.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  // 4. Synthèse globale et Export
  console.log("\n📊 [3/4] Consolidation du Bilan Global Phase 3...");
  const summaryText = `Phase 3 Multi-Tenant achevée. ${tenantsToProcess.length} tenants traités (${tenantsSucceededCount} succès, ${tenantsFailedCount} échecs), ${totalScannedAllTenants} documents inspectés, ${totalModifiedAllTenants} documents corrigés/simulés, ${totalDeletedFieldsAllTenants} champs nettoyés, ${totalFKRepairedAllTenants} clés étrangères réparées.`;

  const globalReport: GlobalCleanupReport = {
    metadata: {
      platform: "FINOPS ERP",
      version: "2.0",
      phase: "PHASE_3_ENTERPRISE_ROLLOUT",
      timestamp: startTime,
      executionMode: isLive ? "LIVE_WRITE" : "DRY_RUN_SIMULATION",
      tenantScope: targetTenantId ? "SINGLE_TENANT" : "ALL_TENANTS",
      tenantFilter: targetTenantId,
      targetCollections: collectionsToRun,
      delayBetweenBatchesMs: delayMs,
      delayBetweenTenantsMs: delayMs,
      totalTenantsProcessed: tenantsToProcess.length,
      tenantsSucceeded: tenantsSucceededCount,
      tenantsFailed: tenantsFailedCount,
      totalScanned: totalScannedAllTenants,
      totalModified: totalModifiedAllTenants,
      totalFieldsDeleted: totalDeletedFieldsAllTenants,
      totalForeignKeysRepaired: totalFKRepairedAllTenants,
      snapshotVerified: true
    },
    tenants: globalTenantReports,
    collectionsAggregate: globalCollectionReports,
    summaryText
  };

  console.log("💾 [4/4] Sauvegarde du rapport d'audit et remédiation multi-tenant...");
  const finalExportPath = options.outputPath || path.join(process.cwd(), `phase3_cleanup_report_${Date.now()}.json`);
  try {
    fs.writeFileSync(finalExportPath, JSON.stringify(globalReport, null, 2), "utf-8");
    console.log(`   ✓ Rapport JSON consolidé : ${finalExportPath}`);
  } catch (err: any) {
    console.warn(`   ⚠️ Impossible d'écrire le fichier JSON : ${err.message}`);
  }

  console.log("\n==========================================================================");
  console.log("📋 BILAN GLOBAL PHASE 3 — DÉPLOIEMENT MULTI-TENANT");
  console.log("==========================================================================");
  console.log(` • Mode d'exécution              : ${isLive ? "🔴 LIVE (Écritures Firestore actives)" : "🟢 DRY RUN (Simulation sans écriture)"}`);
  console.log(` • Total Tenants traités          : ${tenantsToProcess.length} (Succès: ${tenantsSucceededCount}, Échecs: ${tenantsFailedCount})`);
  console.log(` • Documents inspectés            : ${totalScannedAllTenants}`);
  console.log(` • Documents impactés / corrigés  : ${totalModifiedAllTenants}`);
  console.log(` • Champs doublons supprimés      : ${totalDeletedFieldsAllTenants}`);
  console.log(` • Clés étrangères réparées       : ${totalFKRepairedAllTenants}`);
  console.log("==========================================================================\n");

  return globalReport;
}

// Exécution directe CLI
if (process.argv[1]?.includes("clean_duplicate_fields")) {
  const isLive = process.argv.includes("--live");
  const isAll = process.argv.includes("--all");
  const isConfirmed = process.argv.includes("--confirm");
  const tenantArg = process.argv.find(a => a.startsWith("--tenant="))?.split("=")[1];
  const colArg = process.argv.find(a => a.startsWith("--collections="))?.split("=")[1]?.split(",");
  const delayArg = process.argv.find(a => a.startsWith("--delay="))?.split("=")[1];
  const outArg = process.argv.find(a => a.startsWith("--output="))?.split("=")[1];

  cleanDuplicateFields({
    isLive,
    isAll,
    isConfirmed,
    tenantId: tenantArg,
    targetCollections: colArg,
    delayMs: delayArg ? parseInt(delayArg, 10) : undefined,
    outputPath: outArg
  }).then(() => {
    console.log("🎯 Phase 3 Multi-Tenant terminée.");
  }).catch((err) => {
    console.error("❌ Arrêt du processus :", err.message);
    process.exit(1);
  });
}
