/**
 * FINOPS ERP — Script de Remédiation des Transactions Orphelines du Grand Livre
 *
 * Usage:
 *   npx tsx scripts/remediate_ledger_orphans.ts <businessId> [defaultBranchId] [defaultDepartmentId]
 *
 * Fonctionnalités:
 *   1. Scanne toutes les transactions sans departmentId ou branchId pour le businessId spécifié.
 *   2. Résout les valeurs par défaut depuis business_settings.
 *   3. Corrige les transactions dans Firestore (batch update).
 *   4. Scelle l'opération dans forensic_logs avec signature cryptographique SHA-256.
 *   5. Affiche le rapport complet de l'exécution.
 */

import { LedgerOrphanRemediationService } from "../src/services/accounting/LedgerOrphanRemediationService";

async function main() {
  const args = process.argv.slice(2);
  const businessId = args[0] || process.env.BUSINESS_ID;
  const defaultBranchId = args[1];
  const defaultDepartmentId = args[2];

  if (!businessId) {
    console.error("❌ Erreur: businessId requis.");
    console.error("Usage: npx tsx scripts/remediate_ledger_orphans.ts <businessId> [defaultBranchId] [defaultDepartmentId]");
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`🚀 FINOPS ERP — Démarrage Remédiation Orphelines`);
  console.log(`   Tenant (BusinessId) : ${businessId}`);
  console.log(`======================================================\n`);

  try {
    console.log(`🔍 1. Détection des transactions orphelines...`);
    const orphans = await LedgerOrphanRemediationService.findOrphans(businessId);
    console.log(`   Nombre d'orphelines trouvées : ${orphans.length}`);

    if (orphans.length === 0) {
      console.log(`\n✅ Aucune transaction orpheline détectée pour ce tenant. Le Grand Livre est intègre.\n`);
      process.exit(0);
    }

    console.log(`\n🛠️  2. Application des corrections et résolution des defaults...`);
    const report = await LedgerOrphanRemediationService.remediateOrphans({
      businessId,
      defaultBranchId,
      defaultDepartmentId,
      actor: {
        uid: "script_remediation_cli",
        email: "system@finops.internal",
        name: "CLI Remediation Runner"
      },
      persistToDb: true
    });

    console.log(`\n======================================================`);
    console.log(`📊 RAPPORT DE REMÉDIATION`);
    console.log(`======================================================`);
    console.log(`   • Total transactions scannées : ${report.totalScanned}`);
    console.log(`   • Orphelines identifiées       : ${report.orphanCount}`);
    console.log(`   • Transactions corrigées       : ${report.correctedCount}`);
    console.log(`   • Succursale par défaut        : ${report.defaultBranchId}`);
    console.log(`   • Département par défaut       : ${report.defaultDepartmentId}`);
    console.log(`   • Forensic Log ID              : ${report.forensicLogId}`);
    console.log(`   • Signature SHA-256            : ${report.signature}`);
    console.log(`   • Horodatage                   : ${report.timestamp}`);
    console.log(`======================================================\n`);

    console.log(`✅ Opération terminée avec succès.`);
  } catch (error) {
    console.error("❌ Échec de la remédiation:", error);
    process.exit(1);
  }
}

if (require.main === module || process.argv[1]?.endsWith("remediate_ledger_orphans.ts")) {
  main();
}

export { main };
