# FINOPS — P1-4C : Rapport de Vérification de Persistance Distante et de Réhydratation des Politiques de Paie

**Version :** 1.0.0  
**Date :** 2026-10-20  
**Statut :** PASS  
**Périmètre audité et validé :**
- `src/repositories/PayrollPolicyRepository.ts`
- `src/components/admin/settings/sections/PayrollPoliciesSection.tsx`
- `src/contexts/BusinessContext.tsx`
- `src/services/payroll/TaxPolicyEngine.ts`
- `src/repositories/BusinessAdministrationRepository.ts`
- `src/services/payroll/PayrollPolicyResolver.ts`

---

## 1. Synthèse Exécutive & Verdict

| Domaine audité | Statut | Preuve / Fichiers |
|---|---|---|
| Invariants de persistance bout-en-bout | **PASS** | UI → validation Zod → `saveAndActivatePolicy` → atomic `batch.commit()` → `resilientGetDocs` / rechargement Firestore → `PayrollPolicyResolver` → `TaxPolicyEngine` → moteur de paie. |
| Test A — Sauvegarde distante confirmée | **PASS** | Tous les paramètres (3 toggles, taux ONA/OFATMA employé/employeur, plancher de survie 22 000 HTG, tolérances, devises, fréquences) sont conservés sans aucune régression vers les valeurs par défaut. |
| Test B — Échec de Firestore | **PASS** | `batch.commit()` rejeté → `ExceptionOrchestrator.handle` enregistre l'échec dans les diagnostics, l'UI affiche une erreur sans prétendre au succès, la copie locale est marquée `syncStatus: "UNSYNCHRONIZED"`, le resolver refuse de la consommer comme source de vérité, et la reprise s'exécute sans doublon ni saut de version. |
| Test C — Résolution du tenant & BIZ_MAIN | **PASS** | `businessId` vide ou absent bloque l'enregistrement avec `TENANT_UNRESOLVED`. Toute substitution silencieuse par `BIZ_MAIN` est formellement interdite et rejetée. Changement de tenant et transitions asynchrones isolés à 100%. |
| Test D — Synchronisation asynchrone | **PASS** | L'arrivée asynchrone de `businessSettings` n'écrase pas une saisie en cours (`isDirty`). Les payloads nuls ou absents n'effacent pas les données existantes. Les valeurs `false` et `0` (notamment taux à 0% et plancher à 0 HTG) sont strictement conservées. |
| Test E — Isolation du cache local | **PASS** | Les clés locales sont préfixées par `businessId`. La clé `finops_payroll_policy_latest` ne sert plus jamais de source d'autorité inter-entreprises (filtrage strict par tenant). Aucune fuite entre Tenant A et Tenant B. |
| Section 3 — Concurrence et versionnement | **PASS** | Détection de concurrence via contrôle de version de base (`CONCURRENT_MODIFICATION_DETECTED`). Idempotence vérifiée : une sauvegarde répétée de paramètres identiques ne génère aucun document de version redondant. Rétroactivité interdite : les versions précédentes sont scellées `SUPERSEDED` avec `effectiveTo`. |
| Section 4 — Non-régression fonctionnelle | **PASS** | 50 tests exécutés avec succès sur 6 suites de tests. `tsc --noEmit` et compilation de production Vite réussies à 100%. |

---

## 2. Invariants de Persistance Vérifiés

Pour toute politique de paie, la chaîne complète a été vérifiée :
```
[UI Form (PayrollPoliciesSection)]
         │
         ▼
[Validation Zod (PayrollPolicySchema)]
         │
         ▼
[PayrollPolicyRepository.saveAndActivatePolicy]
         │
         ▼
[writeBatch: Atomic Firestore Write (3 collections)]
 ├── businesses/{businessId}/payrollPolicies/{policyId} (vN ACTIVE)
 ├── businesses/{businessId}/payrollPolicies/{prevPolicyId} (SUPERSEDED)
 ├── businesses/{businessId}/settings/payroll_policies (SSOT Canonical)
 └── businesses/{businessId}/settings/tax_config (Legacy Sync)
         │
         ▼
[batch.commit() Confirmation Distante]
         │
         ▼
[Rechargement Firestore (resilientGetDocs / StaticDataCacheService)]
         │
         ▼
[Résolution SSOT (PayrollPolicyResolver.resolveParameter)]
         │
         ▼
[Réhydratation Interface (PayrollPoliciesSection)]
         │
         ▼
[Consommation Moteur de Paie (PayrollService / TaxPolicyEngine)]
```

### Paramètres vérifiés et confirmés persistants :
1. `enable_social_taxes` / `enableTaxes` : booléen (`false` et `true` respectés sans fallback par défaut).
2. `enable_survival_floor` : booléen (`false` et `true` respectés).
3. `require_attendance_for_payroll` : booléen (`false` et `true` respectés).
4. `cnss_ona_employee_rate` / `onaEmployeeRate` : taux employé (ex. 8% ou 0%).
5. `cnss_ona_employer_rate` / `onaEmployerRate` : taux employeur (ex. 8% ou 0%).
6. `ofatma_cns_employee_rate` / `ofatmaEmployeeRate` : taux employé (ex. 3% ou 0%).
7. `ofatma_cns_employer_rate` / `ofatmaEmployerRate` : taux employeur (ex. 4% ou 0%).
8. `survival_floor_htg` / `survivalFloor` : montant seuil en HTG (ex. 22 000 HTG ou 0 HTG).
9. `frequency` : cycle (`WEEKLY`, `BIWEEKLY`, `MONTHLY`).
10. `currency` : devise (`HTG`, `USD`).
11. `standardHoursPerCycle` : heures normales par cycle (ex. 96h, 192h).
12. `attendanceToleranceHours` : seuil de tolérance de présence (ex. 94h, 188h).
13. `workingDaysBasis` : base de jours ouvrés (ex. 22j, 24j).
14. `overtime` : taux majorés normaux et fériés (ex. 1.75x, 2.25x).
15. `penalties` : pénalités de retard et d'absence en centimes.
16. `commissions` : taux de commission par défaut.
17. `businessId` / `business_id` : identifiant canonique du tenant.
18. `version` et `versionLabel` : numéro séquentiel et label canonique (ex. `v1.0.0-canonical`).
19. `effectiveFrom` et `effectiveTo` : fenêtres de validité temporelle.

---

## 3. Matrice Détaillée des Résultats de Tests

### Test A — Sauvegarde distante confirmée
- **Statut :** `PASS`
- **Fichier :** `src/tests/unit/PayrollPolicyPersistenceVerification.test.ts`
- **Scénario exécuté :**
  1. Modification des 3 toggles : `enable_social_taxes: false`, `enable_survival_floor: false`, `require_attendance_for_payroll: false`.
  2. Modification des taux : ONA employé 8%, employeur 8% ; OFATMA employé 3%, employeur 4% ; plancher de survie 22 000 HTG ; fréquence `MONTHLY` ; 192 heures standard.
  3. Soumission et confirmation effective par Firestore `batch.commit()`.
  4. Réhydratation complète par `getEffectivePolicy`.
  5. Résolution par `PayrollPolicyResolver.resolveParameter`.
  6. Calcul des déductions par `TaxPolicyEngine.calculateDualSideContributions`.
- **Preuve observée :**
  `rehydrated.socialContributions.enabled === false`, `rehydrated.survivalFloor.enabled === false`, `rehydrated.attendance.excludeWithoutRecords === false`, `rehydrated.socialContributions.cnssOna.employeeRate === 0.08`, `rehydrated.survivalFloor.minimumNetHTG === 22000`. Les résolutions retournent la source `TENANT_POLICY` et le calcul de cotisations retourne `0 HTG` conformément à la désactivation explicite. Aucune valeur n'est revenue aux valeurs statutaires par défaut.

### Test B — Échec de Firestore
- **Statut :** `PASS`
- **Fichier :** `src/tests/unit/PayrollPolicyPersistenceVerification.test.ts`
- **Scénario exécuté :**
  1. Simulation d'un refus de permission / erreur réseau (`PERMISSION_DENIED`) lors de `batch.commit()`.
  2. Vérification que l'exception `FIRESTORE_PERSISTENCE_FAILED` est levée.
  3. Vérification de l'appel à `ExceptionOrchestrator.handle` avec sévérité `HIGH` et contexte d'opération `SAVE_POLICY_BATCH_COMMIT`.
  4. Vérification que la copie locale de secours est isolée sous `finops_payroll_policy_draft_${businessId}` avec `syncStatus: "UNSYNCHRONIZED"`.
  5. Vérification que `PayrollPolicyRepository.getEffectivePolicy` et le moteur de paie retournent `null` / ne consomment pas la copie non confirmée.
  6. Reprise ("retry") après rétablissement : la sauvegarde réussit sous `v1` sans générer de version fantôme ou de trou dans la numérotation.
- **Preuve observée :**
  `saveAndActivatePolicy` rejette avec `FIRESTORE_PERSISTENCE_FAILED`. `ExceptionOrchestrator.handle` enregistre l'événement. Le resolver ignore le brouillon non synchronisé. La reprise crée exactement la version attendue.

### Test C — Résolution du tenant
- **Statut :** `PASS`
- **Fichiers :** `src/components/admin/settings/sections/PayrollPoliciesSection.tsx`, `src/repositories/PayrollPolicyRepository.ts`, `src/tests/unit/PayrollPolicyPersistenceVerification.test.ts`
- **Scénario exécuté :**
  1. `businessId` absent ou non résolu : l'enregistrement est rejeté immédiatement avec `TENANT_UNRESOLVED`.
  2. Tentative de substitution par `BIZ_MAIN` : strictement interdite et bloquée par une exception `TENANT_UNRESOLVED: businessId is required to persist payroll policy. Substitution with BIZ_MAIN is forbidden.`
  3. Le bouton « APPLIQUER LES RÈGLES » est désactivé tant que `businessId` n'est pas un tenant résolu.
  4. Bascule entre Entreprise Alpha et Entreprise Bêta : les politiques sont enregistrées et lues dans leurs sous-collections et namespaces respectifs, avec des devises et des taux indépendants (`HTG` vs `USD`).
- **Preuve observée :**
  Les tests démontrent l'isolation totale des namespaces Firestore (`businesses/biz_test_tenant_alpha/...` vs `businesses/biz_test_tenant_beta/...`).

### Test D — Synchronisation asynchrone
- **Statut :** `PASS`
- **Fichiers :** `src/components/admin/settings/sections/PayrollPoliciesSection.tsx`, `src/contexts/BusinessContext.tsx`, `src/services/payroll/TaxPolicyEngine.ts`
- **Scénario exécuté :**
  1. Arrivée de `businessSettings` ou événements `BUSINESS_Synced` alors que l'utilisateur a modifié le formulaire (`isDirty = true`) : le hook `useEffect` vérifie `isTenantChanged || !isDirty` et préserve les modifications utilisateur en cours.
  2. Arrivée d'un événement `BUSINESS_Synced` avec `settings` absent ou nul : `BusinessContext` conserve l'état existant (`prev => ({ ...(prev || {}), ...event.payload.settings })`).
  3. Préservation des valeurs `false` et `0` : un plancher de survie de `0 HTG` et des pénalités à `0 HTG` ne sont pas écrasés par le fallback de `15 000 HTG`.
- **Preuve observée :**
  `TaxPolicyEngine.getSurvivalFloorAmount(zeroPolicy)` retourne `0` (et non `15000`). Les taux à `0` rapportent l'état `VALID_ZERO`.

### Test E — Isolation du cache local
- **Statut :** `PASS`
- **Fichiers :** `src/repositories/PayrollPolicyRepository.ts`, `src/components/admin/settings/sections/PayrollPoliciesSection.tsx`
- **Scénario exécuté :**
  1. Entreprise A enregistre une politique personnalisée en localStorage et dans `finops_payroll_policy_latest`.
  2. Entreprise B (sans politique locale ni distante) interroge `getEffectivePolicy(tenantB)`.
  3. Vérification que la politique d'Entreprise A n'est pas retournée pour Entreprise B.
  4. Vérification que le résolveur pour Entreprise B applique le standard global légal (`GLOBAL_POLICY`), sans pollution croisée.
- **Preuve observée :**
  `getEffectivePolicy(tenantB)` retourne `null`. Le résolveur pour `tenantB` retourne `GLOBAL_POLICY` avec le taux ONA standard de `6%`, et non le taux de `10%` de l'Entreprise A.

---

## 4. Concurrence et Versionnement

- **Statut :** `PASS`
- **Fichier :** `src/repositories/PayrollPolicyRepository.ts`
- **Mécanismes validés :**
  1. **Détection de conflit concurrent :** `saveAndActivatePolicy` accepte `{ baseVersion?: number }`. Si un autre utilisateur a déjà commis et incrémenté la version active en arrière-plan (`currentActive.version !== baseVersion`), l'opération est refusée avec l'erreur explicite :
     `CONCURRENT_MODIFICATION_DETECTED: La politique a été modifiée par un autre utilisateur (version actuelle: vN, version attendue: vM). Veuillez recharger la page.`
  2. **Idempotence des sauvegardes :** Si un utilisateur clique plusieurs fois sur « APPLIQUER LES RÈGLES » sans modifier les paramètres effectifs, la méthode compare les 19 dimensions de la politique et renvoie la version active existante sans créer de document `v(N+1)` inutile.
  3. **Immutabilité historique :** L'ancienne politique active n'est jamais écrasée. Elle passe au statut `SUPERSEDED` avec `effectiveTo = effectiveFromDate`, garantissant que les calculs de paies passées restent 100% fidèles à leur instantané temporel.

---

## 5. Non-Régression Fonctionnelle & Compilation

### Résultats des Tests Unitaires et d'Intégration
Commande exécutée :
```bash
npm test -- \
  src/tests/unit/PayrollPolicyPersistenceVerification.test.ts \
  src/tests/unit/PayrollPolicyOperational.test.ts \
  src/tests/unit/PayrollCalculationRules.test.ts \
  src/tests/unit/DualSidePayrollContributionsPhase13.test.ts \
  src/tests/unit/PayrollDeduplicationAndTax.test.ts \
  src/tests/unit/PayrollCalculationEngine.test.ts
```
**Résultat :**
- **Test Files :** 6 passed (6/6)
- **Tests :** 50 passed (50/50, 100%)
- **Durée :** 14.27s

### Validation TypeScript & Lint
Commande exécutée :
```bash
npm run lint (tsc --noEmit)
```
**Résultat :** 0 erreur de typage.

### Validation Compilation Vite
Commande exécutée :
```bash
npm run build
```
**Résultat :** Compilation réussie (`Build succeeded - the applet is compiled`).

---

## 6. État Final Obligatoire (Strict Conformance)

- Données de production modifiées : **NON**
- Paie de production exécutée : **NON**
- Paiement réel exécuté : **NON**
- Déploiement effectué : **NON**
- Migration de production exécutée : **NON**

---
*Arrêt strict effectué après ce rapport. En attente de validation humaine pour toute phase ultérieure.*
