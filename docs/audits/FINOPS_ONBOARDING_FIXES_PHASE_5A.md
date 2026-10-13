# FINOPS ERP / FINAYITI FUSION — PHASE 5A
## CORRECTIFS CIBLÉS D'ONBOARDING ET D'ACTIVATION — RAPPORT DE VÉRIFICATION

**Version :** 1.0  
**Type :** Correctifs Applicatifs Ciblés & Validation par Tests Automatisés  
**Projet :** FINOPS ERP / FINAYITI FUSION  
**Date d'exécution :** 12 Octobre 2026  
**Mode :** Code Fix & Unit Testing (0 Firestore Database Migration)  
**Rapport produit :** `docs/audits/FINOPS_ONBOARDING_FIXES_PHASE_5A.md`  
**Verdict Global :** `PHASE_5A_FIXES_PASS_STATIC_VALIDATION`

---

## 1. RÉSUMÉ EXÉCUTIF

La **Phase 5A** a implémenté avec succès les deux correctifs applicatifs ciblés d'onboarding et d'activation identifiés lors des audits des Phases 4D, 4D.1 et 4E :

1. **`P0-ONBOARDING-PLAN` (Transmission du Plan d'Abonnement Sélectionné)** :
   * **Incohérence résolue** : L'approbation d'une demande d'entreprise par le Super Admin écrasait le plan demandé (ex. `PROFESSIONAL`) avec la valeur par défaut `"FREE_TIER"`.
   * **Correctif appliqué** : `PendingBusinessRepository.approve()` transmet désormais explicitement `selectedPlan` à `WorkspaceProvisioningService.provision()`. `WorkspaceProvisioningService.ts` et `ServerProvisioningService.ts` valident le plan via `resolveAndValidateSubscriptionPlan()` et l'inscrivent dans le document `subscriptions/{bizId}`.
2. **`P1-ACTIVATION-OWNER` (Résolution Sécurisée du Propriétaire)** :
   * **Incohérence résolue** : `BusinessActivationService.activate()` lisait `bizData.owner_id`, ce qui retournait `undefined` sur les documents créés en `camelCase` (`ownerId`), provoquant la création de références `users/undefined` et la rupture d'association du propriétaire.
   * **Correctif appliqué** : Création de la fonction d'extraction déterministe `resolveOwnerInfo()`. Elle résout et valide `ownerUid` et `ownerEmployeeId` en supportant la bivalence (`ownerId` / `owner_id`), lève des erreurs d'incohérence explicites (`OwnerResolutionError`) en cas de contradiction ou d'absence, et interrompt la transaction d'activation **avant** l'écriture de branches ou départements.

---

## 2. FICHIERS MODIFIÉS ET COMPORTEMENTS AVANT / APRÈS

### 2.1. `src/services/business/WorkspaceProvisioningService.ts`
* **Modification** :
  - Ajout des champs optionnels `selectedPlan?: string` et `plan?: string` dans l'interface `ProvisioningOptions`.
  - Implémentation de la fonction `resolveAndValidateSubscriptionPlan(rawPlan?: string): string`.
  - Inscription du plan validé dans le document `subscriptions/{businessId}` lors du batch client et dans les options transmises à l'API serveur.
* **Avant** : Le document `subscriptions` était systématiquement créé avec `plan: "FREE_TIER"`.
* **Après** : Le plan demandé (ex: `PROFESSIONAL`, `ENTERPRISE`) est validé par le catalogue et inscrit directement dans `subscriptions`.

### 2.2. `src/services/business/ServerProvisioningService.ts`
* **Modification** :
  - Extraction et validation de `options.plan || options.selectedPlan`.
  - Inscription du plan résolu dans la transaction du serveur SDK Admin.
* **Avant** : `plan: "FREE_TIER"` codé en dur.
* **Après** : `plan` dynamique validé contre le catalogue des plans d'abonnement.

### 2.3. `src/repositories/PendingBusinessRepository.ts`
* **Modification** :
  - Transmission explicite de `{ selectedPlan: beforeData.selectedPlan, plan: beforeData.selectedPlan }` lors de l'appel à `WorkspaceProvisioningService.provision()`.
  - Mise à jour du document `subscriptions/{finalBusinessId}` avec `plan: beforeData.selectedPlan` lors du passage à `status = "APPROVED"`.
* **Avant** : `selectedPlan` était omis lors de l'appel `provision()`.
* **Après** : `selectedPlan` est conservé de bout en bout de l'onboarding jusqu'à la souscription active.

### 2.4. `src/services/business/BusinessActivationService.ts`
* **Modification** :
  - Création de la classe d'exception `OwnerResolutionError`.
  - Implémentation de la fonction déterministe `resolveOwnerInfo(bizData: Record<string, any>)`.
  - Intégration dans `BusinessActivationService.activate()` pour résoudre `ownerUid` et `ownerEmployeeId` au début de la transaction d'activation.
* **Avant** : `bizData.owner_id` retournait `undefined` sur les documents enregistrés en `ownerId` (camelCase).
* **Après** : Bivalence gérée de manière étanche. Si les deux sont présents et contradictoires ou tous deux absents, l'activation s'interrompt avec une erreur explicite avant toute écriture.

---

## 3. TESTS ET VALIDATION AUTOMATISÉE

### 3.1. Nouveaux Tests Unitaires Créés :
1. **`src/tests/unit/OnboardingPlanFixPhase5A.test.ts`** (**5/5 PASSED**) :
   - Test 1 : Demande `PROFESSIONAL` conserve `PROFESSIONAL`.
   - Test 2 : Demande `FREE_TIER` conserve `FREE_TIER`.
   - Test 3 : Demande `ENTERPRISE` conserve `ENTERPRISE`.
   - Test 4 : Demande vide applique le plan par défaut `STARTER` sans altérer `PROFESSIONAL`.
   - Test 5 : Plan invalide lève une erreur explicite `INVALID_SUBSCRIPTION_PLAN`.
2. **`src/tests/unit/ActivationOwnerResolutionPhase5A.test.ts`** (**6/6 PASSED**) :
   - Test 1 : `ownerId` présent et `owner_id` absent résout vers `ownerId`.
   - Test 2 : `owner_id` présent et `ownerId` absent résout vers `owner_id`.
   - Test 3 : `ownerId` et `owner_id` présents et égaux après normalisation résolvent vers la valeur.
   - Test 4 : `ownerId` et `owner_id` contradictoires lèvent `OWNER_ID_COHERENCE_MISMATCH`.
   - Test 5 : `ownerId` et `owner_id` absents lèvent `MISSING_OWNER_ID` et interrompent l'activation.
   - Test 6 : `ownerEmployeeId` contradictoire lève `OWNER_EMPLOYEE_ID_COHERENCE_MISMATCH`.

### 3.2. Exécution et Commandes Réelles :

| # | Commande Exécutée | Code Sortie | Résultat (Passed / Failed) | Description / Périmètre |
|---|---|---|---|---|
| 1 | `npx vitest run src/tests/unit/OnboardingPlanFixPhase5A.test.ts src/tests/unit/ActivationOwnerResolutionPhase5A.test.ts` | 0 | **11 passed / 11 (100%)** | Validation intégrale des 11 scénarios des correctifs Phase 5A |
| 2 | `npx vitest run src/tests/unit/PayrollSecurityFixPhase4C.test.ts src/tests/unit/SchemaMigrationDryRun.test.ts` | 0 | **20 passed / 20 (100%)** | Validation des suites de sécurité P0 Phase 4C et Dry-Run 4E (non-régression) |
| 3 | `compile_applet` | 0 | **BUILD SUCCEEDED** | Succès de la compilation applicative (Vite + TypeScript) |
| 4 | `lint_applet` (`tsc --noEmit`) | 0 | **LINT SUCCEEDED (0 erreur)** | Validation 100% de la vérification des types statiques |

---

## 4. CONFIRMATION DE ZÉRO MIGRATION FIRESTORE

* **Aucune migration de schéma n'a été exécutée.**
* **Aucun document de production n'a été modifié, créé ou supprimé dans Firestore.**
* **Aucun champ historique n'a été supprimé.**
* **Aucun changement n'a été apporté aux règles de sécurité `firestore.rules` ou au registre comptable.**

---

## 5. LIMITES NON RÉSOLUES ET DISTINCTION DES TESTS

* **Distinction des Niveaux de Vérification** :
  - **Tests Unitaires Applicatifs** : **`100% PASSED (31/31 tests)`**.
  - **Validation Statique du Code** : **`100% PASSED (0 erreur TypeScript)`**.
  - **Vérification Runtime / Émulateur Firestore** : **`PENDING`** (L'émulateur Firestore local demeure indisponible par absence du runtime Java `sh: 1: java: not found` dans le conteneur).
* **Raison du Verdict** : Le verdict `PHASE_5A_FIXES_PASS_STATIC_VALIDATION` certifie formellement la conformité du code et le succès des tests automatisés, tout en reconnaissant avec rigueur la limite de l'émulateur runtime.

---

## 6. VERDICT FINAL OBLIGATOIRE

```text
VERDICT GLOBAL : PHASE_5A_FIXES_PASS_STATIC_VALIDATION
```

---

### ARRÊT OBLIGATOIRE
*Le travail est arrêté. Aucune Phase 5B, aucune migration de données réelles et aucune suppression de champ n'ont été engagées. En attente de votre approbation explicite.*
