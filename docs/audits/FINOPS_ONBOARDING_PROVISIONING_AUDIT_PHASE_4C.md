# FINOPS ERP / FINAYITI FUSION — PHASE 4C-ONBOARDING
## Audit de cohérence du provisionnement Firestore — Finans Ayiti

**Version :** 1.0  
**Type :** Audit Technique Approfondi — Mode Strict Read-Only  
**Projet :** FINOPS ERP / FINAYITI FUSION  
**Date d'exécution :** 12 Octobre 2026  
**Statut :** Rapport Finalisé — Zéro Mutation Effectuée  
**Target File :** `docs/audits/FINOPS_ONBOARDING_PROVISIONING_AUDIT_PHASE_4C.md`

---

## 1. SYNTHÈSE GLOBALE & VERDICT

```text
VERDICT : PHASE_4C_ONBOARDING_AUDIT_COMPLETE_READ_ONLY
```

L'audit de cohérence du provisionnement Firestore pour le tenant **Finans Ayiti** (`biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1`) a été réalisé avec succès en mode **lecture seule stricte**.

L'inspection de la chaîne de provisionnement (`WorkspaceProvisioningService.ts`, `ServerProvisioningService.ts`, `BusinessActivationService.ts`, `PendingBusinessRepository.ts`, `usePayrollRuns.ts`) a permis d'isoler avec précision la cause racine de chacune des **6 anomalies identifiées**.

Aucune donnée de production n'a été modifiée, aucun document Firestore n'a été altéré et le code source est resté 100% intact conformément à la directive d'audit.

---

## 2. ANALYSE DÉTAILLÉE DES 6 ANOMALIES

### Anomalie A — Discordance entre le plan d'abonnement demandé et le plan provisionné
* **Observation** : Le document `/pending_businesses/pbiz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1` indique `selectedPlan = "PROFESSIONAL"`. Cependant, le document `/subscriptions/biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1` est initialisé avec `plan = "FREE_TIER"`.
* **Cause racine** :
  1. Lors de l'approbation de la demande par le Super Admin, `PendingBusinessRepository.approve` appelle `WorkspaceProvisioningService.provision(founder, beforeData.businessName, { nif: beforeData.taxId, domain: beforeData.industry })`.
  2. Le champ `selectedPlan` de `pending_businesses` n'est pas transmis dans le troisième argument d'options.
  3. `WorkspaceProvisioningService.ts` et `ServerProvisioningService.ts` appliquent la valeur codée en dur `plan: "FREE_TIER"` lors de l'écriture du document `subscriptions`.
* **Impact** : L'entreprise se voit attribuer des limites "FREE_TIER" (ex. restrictions de fonctionnalités) en contradiction directe avec son contrat sélectionné.

---

### Anomalie B — Incohérence des identifiants Utilisateur / Employé et rupture de propriété
* **Observation** : L'ID utilisateur est `vo5k8jqo33cZoYzZdbzu4MmA0A7x1` et l'ID employé fondateur est `emp_vo5k8jqo33cZoYzZdbzu4MmA0A7x1`. Lors de l'activation, la mise à jour de l'employé fondateur échoue ou pointe sur un document inexistant.
* **Cause racine** :
  1. Conflit de convention de nommage (camelCase vs snake_case) entre les services : `ServerProvisioningService` enregistre le document d'entreprise avec `ownerId` et `ownerEmployeeId`.
  2. Lors de l'activation par `BusinessActivationService.activate`, le service tente de lire `bizData.owner_id` et `bizData.owner_employee_id`.
  3. Comme ces clés snake_case n'existent pas sur le document créé en camelCase, `ownerEmployeeId` vaut `undefined`.
  4. L'opération `transaction.update(db.doc("employees/undefined"), ...)` échoue ou met à jour un chemin corrompu.
* **Impact** : La fiche employé du propriétaire ne passe pas au statut `ACTIVE` et n'est pas liée correctement aux rôles et départements d'activation.

---

### Anomalie C — Incohérence de référence du département principal
* **Observation** : Le département référencé sur l'employé ou la sous-structure apparaît sous la forme `dept_biz_vo5k8jqo33cZoYzZdbzu4MmA0A0A7x1` (présence d'un `0` surnuméraire) alors que le tenant ID réel est `biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1`.
* **Cause racine** :
  1. `WorkspaceProvisioningService.ts` génère un département déterministe `dept_${businessId}` (`dept_biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1`).
  2. `BusinessActivationService.ts` ré-instancie un second département avec un ID aléatoire `dept_${Math.random().toString(36).substring(2, 11)}`.
  3. Des générateurs de données secondaires ou des scripts d'ensemencement ont effectué une concaténation manuelle ou une substitution de chaîne incorrecte sur la clé du tenant, injectant le segment corrompu `A0A7x1`.
* **Impact** : Clé étrangère orpheline (`departmentId`), empêchant les filtres d'organisation, l'attribution analytique et la validation de la paie par département.

---

### Anomalie D — Cycle de paie fantôme / synthétique (`cyc_auto_2026_10`)
* **Observation** : La paie affiche un cycle `cyc_auto_2026_10` avec des dates du 01/10/2026 au 15/10/2026 et le statut `DRAFT`, sans qu'aucun document n'existe dans la collection `/payroll_cycles/`.
* **Cause racine** :
  1. Le workflow de provisionnement n'écrit aucun document `payroll_cycles` en base lors de la création de l'entreprise.
  2. Le hook UI `usePayrollRuns.ts` contient un mécanisme de secours automatique (lignes 126-139) : en l'absence de cycles retournés par Firestore, il génère dynamiquement en mémoire un objet synthétique `id: cyc_auto_${year}_${month}` (`cyc_auto_2026_10`).
  3. Ce cycle virtuel est affiché dans l'IHM mais n'est jamais persisté dans Firestore tant qu'un utilisateur n'interagit pas avec lui.
* **Impact** : Confusion pour l'utilisateur et les auditeurs qui perçoivent un cycle "existant" alors qu'aucun document réel n'est enregistré en base de données.

---

### Anomalie E — Rupture de la séquence des événements d'onboarding
* **Observation** : Le journal des événements d'onboarding s'arrête à l'événement `onboarding_prov_biz_vo5k8jqo33cZoYzZdbzu4MmA0A7x1` avec `currentState = "WAITING_APPROVAL"`, malgré le passage du document de la demande à `status = "APPROVED"`.
* **Cause racine** :
  1. `WorkspaceProvisioningService.provision` émet un événement `ONBOARDING_STATE_TRANSITION` initial avec la valeur `"WAITING_APPROVAL"`.
  2. Lorsque le Super Admin exécute `PendingBusinessRepository.approve`, la méthode met à jour Firestore (`status: "APPROVED"`) et émet une notification, mais **omet d'émettre l'événement de transition d'état** `ONBOARDING_STATE_TRANSITION` vers `"APPROVED"` ou `"COMPLETED"`.
* **Impact** : L'Event Bus et les modules d'orchestration de processus restent bloqués sur l'état `"WAITING_APPROVAL"`, empêchant les déclencheurs automatiques post-approbation.

---

### Anomalie F — Non-initialisation des structures de paie lors du provisionnement
* **Observation** : L'espace de paie du nouveau tenant ne contient ni règles fiscales, ni grille de salaires, ni cycle réel initial, et l'employé propriétaire a un salaire de base à `0`.
* **Cause racine** :
  1. Ni `WorkspaceProvisioningService`, ni `ServerProvisioningService`, ni `BusinessActivationService` ne contiennent de logique d'ensemencement pour le module de paie (`PayrollRepository`, `TaxPolicyEngine`).
  2. Le provisionnement se limite à créer la structure d'entreprise, la branche, le département et l'employé générique avec `baseSalary: 0`.
* **Impact** : Le module de paie nécessite une configuration manuelle complète avant de pouvoir effectuer le moindre calcul, générant des erreurs de validation ou des paies à zéro.

---

## 3. MATRICE DE TRAÇABILITÉ DES CAUSES RACINES

| Anomalie | Composant Incriminé | Ligne / Méthode | Nature du Défaut |
|---|---|---|---|
| **A (Plan/Abonnement)** | `PendingBusinessRepository.ts` | `approve()` (l. 265) | Omission de transmettre `selectedPlan` à `provision()` |
| **B (User/Emp ID)** | `BusinessActivationService.ts` | `activate()` (l. 35-36) | Mismatch snake_case (`owner_id`) vs camelCase (`ownerId`) |
| **C (Département ID)** | `BusinessActivationService.ts` | `activate()` (l. 38) | Régénération aléatoire d'ID au lieu de réutiliser `dept_${businessId}` |
| **D (Cycle Auto)** | `usePayrollRuns.ts` | `usePayrollRuns()` (l. 126-139) | Génération d'un fallback virtuel non-persisté en base |
| **E (Événements)** | `PendingBusinessRepository.ts` | `approve()` (l. 273-280) | Absence d'émission `ONBOARDING_STATE_TRANSITION` vers `APPROVED` |
| **F (Paie Vierge)** | `WorkspaceProvisioningService.ts` | `provision()` (l. 194-216) | Inexistence de la phase de seeding de la paie et `baseSalary: 0` |

---

## 4. RECOMMANDATIONS POUR LA PHASE CORRECTIVE (REMEDIATION PLAN)

Lors de la phase de correction formelle (post-audit) :

1. **Correction Anomalie A** :
   * Modifier `PendingBusinessRepository.approve` pour transmettre `{ plan: beforeData.selectedPlan }` dans les options de provisionnement.
   * Prendre en compte `options.plan` dans `WorkspaceProvisioningService` et `ServerProvisioningService`.
2. **Correction Anomalie B** :
   * Normaliser `BusinessActivationService` pour lire `bizData.ownerId || bizData.owner_id` et `bizData.ownerEmployeeId || bizData.owner_employee_id`.
3. **Correction Anomalie C** :
   * Garantir la réutilisation stricte de `dept_${businessId}` et `br_${businessId}` dans `BusinessActivationService` sans réinvention d'identifiants aléatoires.
4. **Correction Anomalies D & F** :
   * Ajouter une étape `PayrollSeedService.seedTenantDefaults(businessId)` lors du provisionnement/activation pour créer le premier cycle réel, la politique de paie par défaut et initialiser la structure fiscale.
5. **Correction Anomalie E** :
   * Émettre systématiquement `ONBOARDING_STATE_TRANSITION` avec `action: "APPROVED"` / `currentState: "COMPLETED"` lors de l'exécution de `PendingBusinessRepository.approve`.

---

## 5. RELEVÉ D'ENGAGEMENT EN LECTURE SEULE

* **Fichiers de code source modifiés** : 0
* **Documents Firestore altérés ou supprimés** : 0
* **Mutations de base de données effectuées** : 0
* **Verdict de l'audit** : `PHASE_4C_ONBOARDING_AUDIT_COMPLETE_READ_ONLY`
