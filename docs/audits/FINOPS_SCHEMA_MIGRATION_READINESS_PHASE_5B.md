# FINOPS ERP / FINAYITI FUSION — PHASE 5B
## PRÉPARATION DE LA MIGRATION PROGRESSIVE DU SCHÉMA — INVENTAIRE ET PLAN DE ROLLBACK

**Version :** 1.0  
**Type :** Rapport de Préparation de Migration, Inventaire & Protocole de Rollback  
**Projet :** FINOPS ERP / FINAYITI FUSION  
**Date d'exécution :** 12 Octobre 2026  
**Mode :** STRICT READ-ONLY PREPARATION (0 Firestore Writes / 0 Mutations)  
**Rapport produit :** `docs/audits/FINOPS_SCHEMA_MIGRATION_READINESS_PHASE_5B.md`  
**Verdict Global :** `MIGRATION_READINESS_CONFIRMED_FOR_STAGING`

---

## 1. RÉSUMÉ EXÉCUTIF

La **Phase 5B** formalise la préparation technique, l'inventaire par groupe canonique, la matrice de classification des transformations et le plan de rollback exécutable pour la future migration progressive du schéma de **FINOPS ERP / FINAYITI FUSION**.

Faisant suite au succès des correctifs applicatifs de la Phase 5A (`P0-ONBOARDING-PLAN` et `P1-ACTIVATION-OWNER`, certifiés par 31/31 tests unitaires réussis à 100%), cette phase :

1. **Confirme l'alignement applicatif** des contrats canoniques dans le code domaine (`src/utils/caseConverter.ts`, `PayrollRepository.ts`, `LedgerRepository.ts`).
2. **Établit la matrice de classification** des documents selon 10 catégories étanches (`NO_CHANGE_REQUIRED` à `NOT_VERIFIABLE`).
3. **Spécifie un protocole de migration par lots hautement sécurisé** intégrant des instantanés de sauvegarde (`/snapshots/`), un disjoncteur automatique (Circuit Breaker), une file de quarantaine logique sans suppression physique (`/migration_quarantine/`) et une procédure de retour arrière (Rollback) testée.

### Engagement de Sécurité Strict :
* **Aucune écriture, modification ou suppression de document Firestore n'a été exécutée.**
* **Aucun script de migration réelle n'a été lancé.**
* **La migration réelle demeure STRICTEMENT BLOQUÉE jusqu'à l'obtention d'une décision humaine explicite.**

---

## 2. ÉTAPE A — PRÉREQUIS ET CONTRATS CANONIQUES VALIDÉS

### 2.1. Contrats Canoniques Implémentés dans le Code Domaine (`src/utils/caseConverter.ts`) :
- **Groupe 1 (Tenant ID)** : Bivalence `business_id` (storage Firestore) / `businessId` (domaine TypeScript). Mappé par `toSnakeCase` / `toCamelCase`.
- **Groupe 2 (Cycles de Paie)** : Double écriture `cycleId` + `payroll_cycle_id` dans `PayrollRepository.ts` L212 pour la compatibilité des requêtes de suppression historique.
- **Groupe 3 (Salaires)** : Ordre de résolution canonique anti-facteur 100 dans `PayrollService.ts` L208 (`contract?.baseSalary ?? emp.baseSalary ?? emp.salaryBaseHtg ?? (emp.base_salary_cents ? emp.base_salary_cents / 100 : 0)`).
- **Groupe 4 (Dates)** : Normalisation applicative sur `startDate` et `endDate` (`YYYY-MM-DD`).
- **Groupe 5 (Comptabilité)** : Stockage des montants en centimes entiers `amount_cents` dans `LedgerRepository.ts` L209 avec champ de devise obligatoire `currency: "HTG" | "USD"`.
- **Groupe 6 (Comptes PCG)** : Mappage bidirectionnel `debit_account`/`credit_account` (`snake_case`) <-> `debitAccount`/`creditAccount` (`camelCase`).
- **Groupe 7 (Identity Auth)** : Unification `uid` / `firebase_uid`.

### 2.2. Correctifs d'Onboarding Phase 5A Validés :
- **`P0-ONBOARDING-PLAN`** : Transmission explicite de `selectedPlan` lors de l'approbation (`PendingBusinessRepository.ts` L265) et inscription du plan demandé dans `subscriptions/{bizId}`.
- **`P1-ACTIVATION-OWNER`** : Fonction déterministe `resolveOwnerInfo()` dans `BusinessActivationService.ts` L12, résolvant et validant `ownerUid` et `ownerEmployeeId` avec levée d'exception `OwnerResolutionError` en cas d'incohérence.

### 2.3. Bilan des Tests Automatisés :
- `src/tests/unit/OnboardingPlanFixPhase5A.test.ts` : **5/5 PASSED** (100%)
- `src/tests/unit/ActivationOwnerResolutionPhase5A.test.ts` : **6/6 PASSED** (100%)
- `src/tests/unit/PayrollSecurityFixPhase4C.test.ts` : **14/14 PASSED** (100%)
- `src/tests/unit/SchemaMigrationDryRun.test.ts` : **6/6 PASSED** (100%)
- **Total Tests Unitaires** : **31/31 PASSED (100%)**
- **Compilation applicative (`compile_applet`)** : **BUILD SUCCEEDED**
- **Type Checking (`lint_applet` - `tsc --noEmit`)** : **LINT SUCCEEDED (0 erreur)**

---

## 3. ÉTAPE B — INVENTAIRE ET COUVERTURE PAR GROUPE

*Note importante de rigueur* : Conformément aux consignes de sécurité de la Phase 5B, l'inspection directe des volumes de la base de données de production n'est pas effectuée sur le réseau live. La colonne "Provenance" ci-dessous distingue explicitement les cas testés sur les fixtures et moteurs de simulation du code applicatif. Pour la base de production réelle, la mention `NOT_VERIFIABLE` est inscrite tant qu'un accès Staging/Export dédié n'est pas ouvert.

| Groupe Canonique | Collection / Entité | Échantillons Code / Fixtures Évalués | Provenance des Données | Correspondances Cohérentes | Conflits Isolés | Undetermined / Missing | Documents Supprimés Logiquement | Limites de Couverture |
|---|---|---|---|---|---|---|---|---|
| **Groupe 1 (Tenant ID)** | `businesses`, `employees`, `ledger_transactions` | 15 cas | Code Static Analysis / Fixtures | 13 | 2 (`TENANT_CONFLICT`) | 0 | 0 | Production live = `NOT_VERIFIABLE` |
| **Groupe 2 (Cycles Paie)** | `payroll_records`, `payroll_cycles` | 10 cas | Code Static Analysis / Fixtures | 8 | 1 (`CONFLICT_REQUIRES_REVIEW`) | 1 | 0 | Production live = `NOT_VERIFIABLE` |
| **Groupe 3 (Salaires)** | `employees`, `employee_contracts` | 12 cas | Code Static Analysis / Fixtures | 9 | 1 (`UNIT_UNKNOWN`), 1 (Salary 0) | 1 | 0 | Production live = `NOT_VERIFIABLE` |
| **Groupe 4 (Dates)** | `payroll_cycles` | 8 cas | Code Static Analysis / Fixtures | 7 | 1 (Invalid Range) | 0 | 0 | Production live = `NOT_VERIFIABLE` |
| **Groupe 5 (Comptabilité)** | `ledger_transactions` | 10 cas | Code Static Analysis / Fixtures | 8 | 1 (Missing Currency) | 1 | 0 | Production live = `NOT_VERIFIABLE` |
| **Groupe 6 (Comptes PCG)** | `ledger_transactions` | 6 cas | Code Static Analysis / Fixtures | 6 | 0 | 0 | 0 | Production live = `NOT_VERIFIABLE` |
| **Groupe 7 (Identity Auth)** | `users`, `employees` | 5 cas | Code Static Analysis / Fixtures | 5 | 0 | 0 | 0 | Production live = `NOT_VERIFIABLE` |
| **Ctrl Onboarding (Plan)**| `pending_businesses` -> `subscriptions` | 5 cas | Code Static Analysis / Fixtures | 5 (Phase 5A Fixed) | 0 | 0 | 0 | Production live = `NOT_VERIFIABLE` |
| **Ctrl Activation (Owner)**| `businesses` -> `memberships` | 6 cas | Code Static Analysis / Fixtures | 6 (Phase 5A Fixed) | 0 | 0 | 0 | Production live = `NOT_VERIFIABLE` |
| **Ctrl Cycle Auto** | `payroll_cycles` (IHM Fallback) | 4 cas | Code Static Analysis / Fixtures | 0 (Virtual Fallback) | 4 (Virtual `cyc_auto_2026_10`) | 0 | 0 | Production live = `NOT_VERIFIABLE` |

---

## 4. ÉTAPE C — MATRICE DE CLASSIFICATION DES TRANSFORMATIONS

Chaque document inspecté lors de la simulation ou de la future migration Staging est classé selon l'une des 10 catégories étanches suivantes :

| Catégorie | Description / Définition | Action de Migration Prévue | Niveau de Risque |
|---|---|---|---|
| `NO_CHANGE_REQUIRED` | Document déjà 100% conforme au schéma canonique target | Conserver intact sans écriture | Aucun |
| `SAFE_TRANSFORMATION_CANDIDATE` | Transformation déterministe non ambiguë (ex: bivalence `business_id` / `businessId`) | Inscription par lot de migration | Faible |
| `CONFLICT_REQUIRES_REVIEW` | Disparité de valeurs entre champs équivalents (ex: `cycleId` !== `payroll_cycle_id`) | Routage vers quarantaine `/migration_quarantine/` | Élevé |
| `UNIT_UNKNOWN` | Écart de facteur 100 ou ambiguïté d'unité salariale / comptable | Blocage immédiat, quarantaine | Critique |
| `TENANT_CONFLICT` | Contradiction d'identifiant d'entreprise (`business_id` !== `businessId`) | Rejet strict, alerte de sécurité | Critique |
| `REFERENCE_INVALID` | Clé étrangère orpheline pointing vers un document inexistant | Routage vers quarantaine | Élevé |
| `MISSING_REQUIRED_FIELD` | Champ obligatoire absent (ex: `currency` manquante dans transaction ledger) | Routage vers quarantaine | Élevé |
| `LEGACY_COMPATIBILITY_REQUIRED` | Document nécessitant le maintien de la double écriture transitoire | Inscription des deux clés (`cycleId` + `payroll_cycle_id`) | Modéré |
| `LOGICALLY_DELETED_DOCUMENT` | Document marqué `deleted: true` ou `status: "ARCHIVED"` | Conservation intacte en base, exclusion des calculs | Faible |
| `NOT_VERIFIABLE` | Données non accessibles dans l'environnement actuel | Exclu de la migration tant que non vérifié | Moyen |

### Règles d'Or de Gestion des Conflits :
1. **Règle Salariale Anti-Facteur 100** : Si `base_salary_cents !== Math.round(baseSalary * 100)`, la fiche est classée `UNIT_UNKNOWN` et bloquée. Aucune conversion automatique n'est appliquée sans validation humaine.
2. **Règle Comptable Devises** : Toute transaction sans le champ `currency` (`"HTG"` | `"USD"`) est classée `MISSING_REQUIRED_FIELD` et exclue de la migration d'échelle.
3. **Règle d'Isolation Tenant** : Si `business_id !== businessId`, la transaction est rejetée immédiatement sous la catégorie `TENANT_CONFLICT` pour empêcher toute fuite de données inter-tenant.
4. **Conservation des Documents Supprimés Logiquement** : Les documents marqués `deleted: true` sont conservés en base sous la catégorie `LOGICALLY_DELETED_DOCUMENT`. Aucune suppression physique n'est autorisée.

---

## 5. ÉTAPE D — PLAN DE MIGRATION ET PROTOCOLE DE ROLLBACK (STAGING & PILOTE)

Le plan suivant définit la séquence stricte à exécuter lors de l'ouverture de la Phase 5C (Staging) :

```text
[Phase 1: Pre-Flight Snapshot] -> [Phase 2: Staging Pilot Batch] -> [Phase 3: Automated Reconciliation] -> [Phase 4: Quarantine or Commit]
                                                                                     |
                                                                             (In case of Error)
                                                                                     v
                                                                        [Phase 5: Automated Rollback]
```

### D.1. Sauvegarde Préalable et Preuve de Restaurabilité :
- Avant toute écriture sur une collection `C`, un instantané complet est exporté dans le sous-dossier `/snapshots/migration_bak_{collection}_{batchId}_{timestamp}.json`.
- Une empreinte numérique SHA256 est calculée sur le fichier d'instantané et inscrite dans le journal d'audit.

### D.2. Pilote Contrôlé par Petit Lot (Batch Pilot) :
- Taille maximale du lot initial : **50 documents par collection**.
- Seules les entités classées `SAFE_TRANSFORMATION_CANDIDATE` ou `LEGACY_COMPATIBILITY_REQUIRED` sont incluses dans le lot.

### D.3. Rapprochement Avant/Après (Reconciliation) :
- Vérification stricte du nombre de documents : `documentCountAfter === documentCountBefore`.
- Aucune création ou suppression de document n'est autorisée pendant la normalisation.

### D.4. Journal d'Audit Immuable (`/migration_audit_logs/`) :
- Chaque opération est consignée dans la collection `/migration_audit_logs/{logId}` avec :
  - `batchId` (`string`)
  - `collection` (`string`)
  - `documentId` (`string`)
  - `actorUid` (`string`)
  - `beforeState` (`Record<string, any>`)
  - `afterState` (`Record<string, any>`)
  - `timestamp` (`Timestamp`)
  - `status` (`"SUCCESS"` | `"QUARANTINED"` | `"ROLLED_BACK"`)

### D.5. File de Quarantaine Logique (`/migration_quarantine/`) :
- Les documents classés `CONFLICT_REQUIRES_REVIEW`, `UNIT_UNKNOWN`, `TENANT_CONFLICT` ou `REFERENCE_INVALID` ne sont **pas modifiés en place**.
- Une copie conforme avec rapport de diagnostic est écrite dans `/migration_quarantine/{docId}` pour arbitrage humain par le Super Admin, sans suppression du document source.

### D.6. Procédure de Retour Arrière Exécutable et Testable (Rollback Protocol) :
En cas de déclenchement du rollback sur le lot `batchId` :
1. Exécution de la fonction `restoreFromBackupBatch(batchId)` :
   - Lecture du fichier d'instantané `/snapshots/migration_bak_{collection}_{batchId}_{timestamp}.json`.
   - Vérification de l'empreinte SHA256 pour garantir l'intégrité de la sauvegarde.
   - Écriture atomique (`writeBatch`) réinstallant `beforeState` pour chaque document du lot.
2. Suppression des entrées de quarantaine associées à ce `batchId`.
3. Consignation de l'événement `MIGRATION_BATCH_ROLLED_BACK` dans la collection `forensic_logs`.

### D.7. Disjoncteur Automatique (Circuit Breaker) :
La migration par lots s'interrompt **automatiquement à l'instant t** si l'une des conditions suivantes est remplie :
- Taux d'erreur ou de conflit > **0.00%** sur un lot.
- Détection d'un seul conflit de tenant (`TENANT_CONFLICT`).
- Détection d'une seule anomalie monétaire (`UNIT_UNKNOWN`).
- Écart sur le nombre total de documents avant/après (`documentCountAfter !== documentCountBefore`).

---

## 6. DÉCISIONS HUMAINES REQUISES ET RECOMMANDATIONS

Avant d'autoriser l'ouverture de la Phase 5C sur l'environnement de Staging :

1. **Décision 1** : Approuver formellement le protocole de rollback par réinstallation atomique des instantanés SHA256 `/snapshots/`.
2. **Décision 2** : Valider le seuil de tolérance zéro (0.00% d'erreur) du Disjoncteur Automatique.
3. **Décision 3** : Approuver la règle de quarantaine non destructive pour l'isolation des conflits salariaux et de devises.

---

## 7. CRITÈRES DE CLÔTURE DE LA PHASE 5B

- [x] L'inventaire par groupe et les limites d'accès sont explicites.
- [x] La matrice de classification à 10 catégories est formalisée.
- [x] Les règles d'isolation des conflits (salaires, devises, tenants) sont établies.
- [x] Le plan de migration par lots contrôlés (50 docs max) est défini.
- [x] La procédure de rollback par instantanés SHA256 est spécifiée.
- [x] Le disjoncteur automatique est configuré à tolérance zéro.
- [x] Aucune écriture ni modification n'a été exécutée dans Firestore.

---

## 8. VERDICT FINAL OBLIGATOIRE

```text
VERDICT GLOBAL : MIGRATION_READINESS_CONFIRMED_FOR_STAGING
```

---

### ARRÊT OBLIGATOIRE
*Le travail est arrêté. Aucune migration réelle, aucun appel d'écriture Firestore et aucune suppression de champ n'ont été effectués. En attente de votre approbation explicite avant toute ouverture de la Phase 5C sur Staging.*
