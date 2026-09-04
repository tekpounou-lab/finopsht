/**
 * FINOPS ERP — Suite de Migration, Nettoyage et Intégrité Firestore (Orchestrateur Central)
 * 
 * Point d'entrée unifié pour exécuter :
 * - Phase 1 : Audit complet en lecture seule (--audit)
 * - Phase 2 & 3 : Nettoyage multi-tenant et remédiation SSOT (--clean / --clean-duplicates)
 * - Remédiation ciblée des clés étrangères (--remediate-fk)
 * - Exécution de la suite complète (--all)
 * 
 * Options supportées :
 *   --audit             : Exécute l'audit en lecture seule (Phase 1)
 *   --clean             : Exécute le nettoyage des doublons et réparation de schéma (Phase 2 & 3)
 *   --clean-duplicates  : Alias pour --clean
 *   --remediate-fk      : Exécute la remédiation autonome des clés étrangères
 *   --all               : Exécute le nettoyage / remédiation sur l'ensemble des tenants
 *   --dry-run           : Mode simulation sans écriture (par défaut)
 *   --live              : Applique les modifications effectives dans Firestore
 *   --confirm           : Valide formellement l'exécution en production
 *   --delay=<ms>        : Intervalle de temporisation en ms entre les lots et les tenants (défaut: 300ms)
 *   --tenant=<id>       : Filtre l'exécution sur un identifiant d'entreprise précis
 *   --collections=<c1>  : Liste des collections cibles séparées par des virgules
 *   --output=<path>     : Chemin d'export du fichier de rapport JSON
 *   --help              : Affiche l'aide
 * 
 * Exemples:
 *   npx tsx scripts/migrations/index.ts --clean --dry-run --all
 *   npx tsx scripts/migrations/index.ts --clean --live --all --confirm
 *   npx tsx scripts/migrations/index.ts --clean --live --all --confirm --delay=2000
 *   npx tsx scripts/migrations/index.ts --clean --live --tenant=biz_tekpounou_01 --output=rapport.json
 */

import { runFirestoreAudit } from "./audit_firestore_schema";
import { cleanDuplicateFields } from "./clean_duplicate_fields";
import { remediateForeignKeys } from "./remediate_foreign_keys";

export function showHelp(): void {
  console.log(`
================================================================================
FINOPS ERP — Master Migration & Schema Integrity Orchestrator (Phase 3)
================================================================================

COMMANDES PRINCIPALES :
  --audit             Exécuter l'audit complet des schémas Firestore en lecture seule.
  --clean             Exécuter le nettoyage des doublons & normalisation des schémas (Phases 2 & 3).
  --clean-duplicates  Alias pour --clean.
  --remediate-fk      Exécuter la remédiation dédiée des clés étrangères.
  --help              Afficher ce menu d'aide.

OPTIONS & GARDE-FOUS DE SÉCURITÉ :
  --all               Cibler l'ensemble de tous les tenants en production.
  --confirm           Confirmation explicite requise pour l'exécution LIVE multi-tenant.
  --delay=<ms>        Délai en millisecondes entre les lots et les tenants (ex: --delay=1000).
  --dry-run           Exécution en mode simulation (aucune écriture en base).
  --live              Application effective des modifications en base de données.
  --tenant=<id>       Filtrer les opérations sur une entreprise spécifique.
  --collections=<c>   Restreindre aux collections listées (ex: --collections=employees,invoices).
  --output=<path>     Chemin personnalisé pour exporter le rapport JSON.

EXEMPLES D'UTILISATION :
  1. Simulation multi-tenant complète :
     npx tsx scripts/migrations/index.ts --clean --dry-run --all

  2. Déploiement réel sécurisé en production sur tous les tenants :
     npx tsx scripts/migrations/index.ts --clean --live --all --confirm

  3. Déploiement réel avec limitation de débit (2 secondes entre chaque tenant) :
     npx tsx scripts/migrations/index.ts --clean --live --all --confirm --delay=2000

  4. Nettoyage ciblé sur un seul tenant :
     npx tsx scripts/migrations/index.ts --clean --live --tenant=biz_tekpounou_01
================================================================================
`);
}

export async function runOrchestrator() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  const isAudit = args.includes("--audit");
  const isClean = args.includes("--clean") || args.includes("--clean-duplicates");
  const isRemediate = args.includes("--remediate-fk");
  const isAll = args.includes("--all");
  const isLive = args.includes("--live");
  const isConfirmed = args.includes("--confirm");
  
  const tenantArg = args.find(a => a.startsWith("--tenant="))?.split("=")[1];
  const collectionsArg = args.find(a => a.startsWith("--collections="))?.split("=")[1]?.split(",");
  const delayArg = args.find(a => a.startsWith("--delay="))?.split("=")[1];
  const outputArg = args.find(a => a.startsWith("--output="))?.split("=")[1];

  const parsedDelay = delayArg ? parseInt(delayArg, 10) : undefined;

  // Mode d'action effectif
  const effectiveAudit = isAudit && !isClean && !isRemediate;
  const effectiveClean = isClean || (isAll && !isAudit && !isRemediate);

  console.log("\n================================================================================");
  console.log("🚀 FINOPS ERP — ORCHESTRATEUR DE MIGRATION & INTÉGRITÉ");
  console.log(`   Mode d'exécution : ${isLive ? "🔴 LIVE (Écritures actives)" : "🟢 DRY RUN (Simulation / Lecture seule)"}`);
  console.log(`   Portée des baux  : ${tenantArg ? `Tenant ciblé [${tenantArg}]` : (isAll ? "🌍 TOUS LES TENANTS (--all)" : "Tenant(s) par défaut")}`);
  console.log(`   Confirmation     : ${isConfirmed ? "✅ Validée (--confirm)" : "⚠️ Non fournie"}`);
  if (parsedDelay !== undefined) {
    console.log(`   Limitation débit : ${parsedDelay} ms`);
  }
  console.log(`   Collections      : ${collectionsArg ? collectionsArg.join(", ") : "Toutes les collections cibles"}`);
  console.log("================================================================================\n");

  // 1. Audit (Phase 1)
  if (effectiveAudit) {
    console.log(">>> [PHASE 1] Lancement de l'Audit en lecture seule...");
    await runFirestoreAudit({
      tenantId: tenantArg,
      outputPath: outputArg
    });
    console.log("🎯 Audit Phase 1 terminé avec succès.");
    return;
  }

  // 2. Nettoyage & Remédiation Multi-Tenant (Phase 2 & Phase 3)
  if (effectiveClean) {
    console.log("\n>>> [PHASE 3] Lancement du Nettoyage & Normalisation Multi-Tenant...");
    await cleanDuplicateFields({
      isLive,
      isAll,
      isConfirmed,
      tenantId: tenantArg,
      targetCollections: collectionsArg,
      delayMs: parsedDelay,
      outputPath: outputArg
    });
    return;
  }

  // 3. Remédiation dédiée Clés Étrangères
  if (isRemediate) {
    console.log("\n>>> [REMEDIATION] Lancement de la Remédiation des Clés Étrangères...");
    await remediateForeignKeys({
      isLive,
      tenantId: tenantArg
    });
    return;
  }

  // Par défaut, si aucun argument, afficher l'aide ou exécuter l'audit
  showHelp();
}

if (require.main === module || process.argv[1]?.includes("index.ts")) {
  runOrchestrator().catch((err) => {
    console.error("❌ Arrêt du processus :", err.message);
    process.exit(1);
  });
}
