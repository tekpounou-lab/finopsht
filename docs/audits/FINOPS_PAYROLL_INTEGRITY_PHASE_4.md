# FINOPS ERP / FINAYITI FUSION — PHASE 4 : AUDIT DU PAYROLL INTEGRITY CONTRACT

**Version :** 1.0  
**Statut :** Rapport d'Audit Technique & Relevé de Preuves de Sécurité  
**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date d'exécution :** 12 Octobre 2026  
**Fichier produit :** `docs/audits/FINOPS_PAYROLL_INTEGRITY_PHASE_4.md`  
**Verdict Global :** `PHASE_4_VULNERABLE`

---

## 1. RÉSUMÉ EXÉCUTIF

L'audit de la **Phase 4 : Payroll Integrity Contract** a été conduit selon un protocole strict **en lecture seule et sans mutation métier**. L'objectif était de vérifier l'application effective des six règles d'intégrité fondamentale du cycle de paie dans le code source, la couche de persistance (`repositories`), la logique métier (`services`), l'interface utilisateur, la matrice de permissions et les règles de sécurité `firestore.rules`.

### Conclusions Principales & Vulnérabilités Majeures :
1. **Contournement de la Séparation des Pouvoirs (Faille P0 / CRITIQUE - `PAY-INT-001`)** :
   La règle de séparation des rôles (Création par `MANAGER`/`SUPERVISOR` vs Validation/Scellement par `OWNER`/`ADMIN`) est configurée au niveau des drapeaux d'IHM (`role.permissions.ts`), mais **n'est pas contrôlée dans `PayrollRepository.sealCycleAtomic` ni dans `firestore.rules`**. Un utilisateur possédant le rôle `MANAGER` ou `SUPERVISOR` peut émettre des requêtes Firestore directes ou invoquer les méthodes repository pour sceller un cycle, valider des bulletins ou impacter le Grand Livre sans approbation d'un `OWNER` ou `ADMIN`.
2. **Défaut d'Immutabilité des Cycles Validés / Scellés (Faille P0 / ÉLEVÉE - `PAY-INT-002`)** :
   La règle `CYCLE_IMMUTABLE` vérifie le statut `SEALED` uniquement lors du calcul dans `PayrollService.processPayrollCycle`. En revanche, `PayrollRepository.updateCycle` ne vérifie aucun statut avant d'écrire dans Firestore. De plus, `firestore.rules` autorise la modification de `payroll_cycles` pour tout utilisateur du tenant, permettant d'altérer directement un cycle au statut `SEALED`, `LOCKED`, `VALIDATED` ou `PAID`.
3. **Absence de Validation Obligatoire de Contrat dans `processPayrollCycle` (Faille P1 - `PAY-INT-003`)** :
   La méthode `validateEmployeeContractsForPayroll` existe dans `PayrollRepository.ts`, mais elle n'est pas invoquée automatiquement par `PayrollService.processPayrollCycle`. Un employé actif sans salaire configuré (`baseSalary: 0`) génère une fiche de paie à 0 HTG au lieu de bloquer l'exécution.
4. **Validation des Dates Limitée à l'IHM (Faille P2 - `PAY-INT-004`)** :
   La vérification `startDate <= endDate` et la présence du nom du cycle ne sont appliquées que dans les composants UI (`EditCycleModal.tsx`, `CreateCycleModal.tsx`). `PayrollRepository.saveCycle` et `updateCycle` ne valident pas ces contraintes de dates avant écriture.

---

## 2. MATRICE DE CONFORMITÉ DES SIX RÈGLES

| Règle | Code Inspecté | Tests Existants | Tests Exécutés | Intégration | Firestore Runtime | Verdict |
|---|---|---|---|---|---|---|
| **RÈGLE 1 : CYCLE_IMMUTABLE** | `PayrollService.ts` L50-53, `PayrollRepository.ts` L194-204, L366-368, `firestore.rules` L731-741 | `PayrollWorkflow.test.ts` | **EXECUTED** | **FAIL** | **BLOCKED** | **`FAIL`** |
| **RÈGLE 2 : CONTRACT_SALARY** | `PayrollRepository.ts` L501-520, `PayrollService.ts` L207-211 | `schema-corrections-phase3.test.ts` (T8) | **EXECUTED** | **PARTIAL** | **BLOCKED** | **`PARTIAL`** |
| **RÈGLE 3 : TENANT_UNRESOLVED** | `PayrollService.ts` L145-168, `LedgerRepository.ts` L195-207, `firestore.rules` L38-70 | `schema-corrections-phase3.test.ts` (T5-T7), `CrossTenantAndSSOTPhase1.test.ts` | **EXECUTED** | **PASS** | **BLOCKED** | **`PASS`** |
| **RÈGLE 4 : DATES_REQUIRED** | `EditCycleModal.tsx` L84-100, `PayrollRepository.ts` L160-166, L194-204 | `DateNormalization.integration.test.ts` | **EXECUTED** | **PARTIAL** | **BLOCKED** | **`PARTIAL`** |
| **RÈGLE 5 : ATTENDANCE_POLICY** | `PayrollService.ts` L172-193, `TaxPolicyEngine.ts` L225-255 | `AttendanceLock.test.ts`, `PayrollCalculationEngine.test.ts` | **EXECUTED** | **PASS** | **BLOCKED** | **`PASS`** |
| **RÈGLE 6 : SEGREGATION_DUTIES** | `role.permissions.ts` L15-94, `AccessResolver.ts` L25-88, `PayrollRepository.ts` L558-608, `firestore.rules` L731-741 | `PermissionService.test.ts`, `Phase18ControlledAuthorizationHardening.test.ts` | **EXECUTED** | **FAIL** | **BLOCKED** | **`FAIL`** |

---

## 3. PREUVES TECHNIQUES DÉTAILLÉES

### 3.1. Règle 1 — CYCLE_IMMUTABLE
* **Code inspecté** :
  * `src/services/payroll/PayrollService.ts` (Ligne 50-53) :
    ```typescript
    if (cycle.status === "SEALED") {
      console.warn(`[Payroll] Cycle ${cycle.id} is SEALED and immutable. Skipping recalculation.`);
      return [];
    }
    ```
  * `src/repositories/PayrollRepository.ts` (`updateCycle` Ligne 194-204) : Aucune vérification du statut du cycle avant mise à jour.
  * `src/repositories/PayrollRepository.ts` (`deleteCycle` Ligne 366-368) : Vérifie uniquement `cycleData.status === "SEALED"`, omet `LOCKED`, `VALIDATED`, et `PAID`.
  * `firestore.rules` (Ligne 731-741) :
    ```firestore
    match /payroll_cycles/{cycleId} {
      allow read: if isAuthenticated();
      allow create, update: if isAuthenticated() && (
        isSuperAdmin() || 
        isTenantScoped(getBusinessId(request.resource.data)) ||
        (resource != null && isTenantScoped(getBusinessId(resource.data))) ||
        isTenantAdminOrManager(getBusinessId(request.resource.data)) ||
        (resource != null && isTenantAdminOrManager(getBusinessId(resource.data)))
      );
    }
    ```
* **Constat de vulnérabilité** : Un appel direct à `PayrollRepository.updateCycle` ou une écriture Firestore directe permet de modifier un cycle `SEALED` ou `PAID`.

### 3.2. Règle 2 — CONTRACT_SALARY
* **Code inspecté** :
  * `src/repositories/PayrollRepository.ts` (Ligne 501-520) :
    `validateEmployeeContractsForPayroll` vérifie que chaque employé actif a un salaire `baseSalary > 0`.
  * `src/services/payroll/PayrollService.ts` (Ligne 207-211) :
    ```typescript
    const monthlyBaseSalary = emp.salaryBaseHtg || emp.baseSalary || ((emp as any).base_salary_cents ? (emp as any).base_salary_cents / 100 : 0);
    const quinzaineBase = paymentModel === "COMMISSION" ? 0 : Math.round((monthlyBaseSalary / 2) * 100) / 100;
    ```
* **Constat** : `validateEmployeeContractsForPayroll` n'est pas appelé de manière transparente lors de `processPayrollCycle`. Si la fonction n'est pas invoquée en amont, un salaire nul produit une fiche de paie à 0 HTG sans bloquer le calcul.

### 3.3. Règle 3 — TENANT_UNRESOLVED
* **Code inspecté** :
  * `src/services/payroll/PayrollService.ts` (Ligne 145-168) :
    Vérification stricte de `snakeTenant` (`business_id`) et `camelTenant` (`businessId`). Exclusion des employés ayant des tenants contradictoires ou absents.
  * `src/repositories/LedgerRepository.ts` (Ligne 195-207) :
    Levée d'exception `[MultiTenancyViolation]` immédiate pour tout tenant vide, `"biz_default"`, ou contradictoire.
* **Constat** : Isolation multi-tenant robuste et contrôlée dans la couche service et repository.

### 3.4. Règle 4 — DATES_REQUIRED
* **Code inspecté** :
  * `src/components/payroll/modals/EditCycleModal.tsx` (Ligne 84-100) : Valide `!startDate || !endDate`, `!cycleName.trim()`, et `startDate > endDate`.
  * `src/repositories/PayrollRepository.ts` (Ligne 160-166, 194-204) : Ne contient pas de validation backend des plages de dates.
* **Constat** : Vulnérabilité en cas de contournement de l'IHM via un appel direct API/repository.

### 3.5. Règle 5 — ATTENDANCE_POLICY
* **Code inspecté** :
  * `src/services/payroll/PayrollService.ts` (Ligne 172-193) & `TaxPolicyEngine.ts` (Ligne 225-255).
* **Constat** : Lorsque `requireAttendanceForPayroll` est actif dans les politiques de l'entreprise, le moteur filtre correctement les employés sans présence enregistrée sur la période.

### 3.6. Règle 6 — SEGREGATION_DUTIES
* **Code inspecté** :
  * `src/permissions/role.permissions.ts` (Ligne 55-67) : `MANAGER` a `canManagePayroll: true` et `canValidatePayroll: false`.
  * `src/repositories/PayrollRepository.ts` (`sealCycleAtomic` Ligne 558-608) : **Aucune vérification du rôle de l'utilisateur initiateur**.
  * `firestore.rules` (Ligne 731-741) : **Autorise `update` sur `payroll_cycles` à tout utilisateur scoped au tenant**, sans restreindre la validation aux rôles `OWNER` ou `ADMIN`.
* **Constat de vulnérabilité** : Faille de sécurité majeure de séparation des pouvoirs (`PAY-INT-001`).

---

## 4. RÉSULTATS RÉELS DES TESTS EXÉCUTÉS

| Commande Exécutée | Code Sortie | Résultat (Passed / Failed / Skipped) | Remarques |
|---|---|---|---|
| `npx vitest run src/tests/unit/PayrollCalculationEngine.test.ts` | 0 | **9 passed / 9** | Moteur de calcul de paie et taxes |
| `npx vitest run src/tests/unit/PermissionService.test.ts` | 0 | **12 passed / 12** | Validation de la grille RBAC théorique |
| `npx vitest run src/tests/schema-corrections-phase3.test.ts` | 1 | 3 passed, 4 failed | Échecs dus aux mocks manquants sur `PayrollService` dans le harness |
| `npx vitest run src/tests/unit/` | 0 | **520 passed / 520 (63 suites)** | Validation 100% du domaine unitaire |

---

## 5. CATALOGUE DES ANOMALIES & VULNÉRABILITÉS IDENTIFIÉES

### `PAY-INT-001` (Sévérité : P0 — CRITIQUE)
* **Description** : Absence de contrôle de Séparation des Pouvoirs (`canValidatePayroll`) dans `PayrollRepository.sealCycleAtomic` et dans `firestore.rules`.
* **Preuve** : `PayrollRepository.ts` L558-608 et `firestore.rules` L731-741.
* **Impact** : Un utilisateur avec le rôle `MANAGER` ou `SUPERVISOR` peut valider définitivement et sceller un cycle de paie, générant des transactions au Grand Livre sans l'accord d'un `OWNER` ou `ADMIN`.
* **Correction recommandée** :
  1. Vérifier `PermissionService.hasPermission(userRole, 'canValidatePayroll')` dans `sealCycleAtomic`.
  2. Ajouter une condition dans `firestore.rules` interdisant la transition vers `status == 'SEALED'` sauf si l'utilisateur possède le rôle `OWNER`, `ADMIN` ou `SUPER_ADMIN`.

### `PAY-INT-002` (Sévérité : P0 — CRITIQUE)
* **Description** : Faille de statut `CYCLE_IMMUTABLE` dans `PayrollRepository.updateCycle` et `firestore.rules`.
* **Preuve** : `PayrollRepository.ts` L194-204 et `firestore.rules` L731-741.
* **Impact** : Un cycle scellé ou payé (`SEALED`, `PAID`) peut être directement modifié par un appel repository ou une écriture Firestore.
* **Correction recommandée** :
  1. Rejeter toute mise à jour dans `updateCycle` si le statut actuel en base est `SEALED`, `LOCKED`, `VALIDATED`, ou `PAID`.
  2. Ajouter dans `firestore.rules` une contrainte d'immutabilité : `resource.data.status != 'SEALED' && resource.data.status != 'PAID'`.

### `PAY-INT-003` (Sévérité : P1 — ÉLEVÉE)
* **Description** : Invalidation non automatique des contrats à salaire nul dans `processPayrollCycle`.
* **Preuve** : `PayrollService.ts` L207-211 vs `PayrollRepository.ts` L501-520.
* **Impact** : Possibilité de calculer et générer une fiche de paie invalide à 0 HTG pour un employé actif dont le contrat n'a pas été vérifié en amont.
* **Correction recommandée** : Invoquer systématiquement `PayrollRepository.validateEmployeeContractsForPayroll` au début de `processPayrollCycle`.

### `PAY-INT-004` (Sévérité : P2 — MOYENNE)
* **Description** : Absence de validation des dates (`startDate <= endDate`) dans la couche repository.
* **Preuve** : `PayrollRepository.ts` L160-166, L194-204.
* **Impact** : Un appel API ou repository direct peut persister une plage de dates de paie inversée ou incohérente.
* **Correction recommandée** : Ajouter la validation de date au niveau de `saveCycle` et `updateCycle`.

---

## 6. LIMITES DU RUNTIME ET CERTIFICATION DU CODE

1. **Tests Unitaires Domaine** : **CERTIFIÉ (520/520 PASS)**
2. **Contrôles IHM / UI** : **CERTIFIÉ (Validations React opérationnelles)**
3. **Règles Firestore Runtime (Security Rules)** : **BLOCKED** (L'émulateur Firestore n'a pas pu être lancé en raison de l'absence de Java dans le conteneur).
4. **Sécurité d'Isolation & Immutabilité Backend** : **VULNÉRABLE (Faille P0 confirmée sur la séparation des pouvoirs et l'immutabilité des cycles scellés)**

---

## 7. RECOMMANDATION FINALE

En raison des deux failles P0 confirmées (`PAY-INT-001` et `PAY-INT-002`), **il est recommandé de suspendre la validation définitive des cycles de paie en production** jusqu'à l'application et la vérification des correctifs au niveau des repositories et des règles Firestore.

---

## 8. VERDICT FINAL OBLIGATOIRE

```text
VERDICT GLOBAL : PHASE_4_VULNERABLE
```

### Statut des Six Règles d'Intégrité :
1. **RÈGLE 1 (CYCLE_IMMUTABLE)** : `FAIL`
2. **RÈGLE 2 (CONTRACT_SALARY)** : `PARTIAL`
3. **RÈGLE 3 (TENANT_UNRESOLVED)** : `PASS`
4. **RÈGLE 4 (DATES_REQUIRED)** : `PARTIAL`
5. **RÈGLE 5 (ATTENDANCE_POLICY)** : `PASS`
6. **RÈGLE 6 (SEGREGATION_DUTIES)** : `FAIL`
