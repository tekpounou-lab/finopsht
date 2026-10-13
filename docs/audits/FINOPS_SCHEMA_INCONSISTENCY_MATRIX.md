# FINOPS ERP — MATRIX DE DIAGNOSTIC ET DES INCOHÉRENCES DE SCHÉMA (PHASE 2)

**Version:** 2.0  
**Statut:** Certification d'Audit Technique & Matrice de Preuves  
**Projet:** FINOPS ERP / FINAYITI Fusion  
**Fichier d'audit:** `docs/audits/FINOPS_SCHEMA_INCONSISTENCY_MATRIX.md`  
**Mode:** READ-ONLY (Aucune modification de code ni de base de données effectuée)

---

## 1. EXECUTIVE SUMMARY & MATRICE DE TRIAGE DES INCOHÉRENCES

L'analyse approfondie du code source du projet FINOPS ERP révèle l'existence de divergences structurelles entre la couche de stockage Firestore (`snake_case`), les interfaces TypeScript du domaine (`camelCase`) et les requêtes de filtre directes sur la base de données.

Si le module `src/utils/caseConverter.ts` fournit des fonctions de conversion pour amortir ces écarts en mémoire (`mapEmployee`, `mapPayrollCycle`, `mapDepartment`), **les requêtes Firestore directes (`where("champ", "==", valeur)`) ne bénéficient d'aucun remappage automatique**. L'écriture d'un champ sous le nom `businessId` au lieu de `business_id` dans Firestore rend ce document invisible pour toutes les requêtes filtrant sur `where("business_id", "==", ...)` et inversement.

### Classification des Anomalies :
- **`CONFIRMED`** : Preuve formelle dans le code source d'une rupture de contrat de données ou d'un échec de requête Firestore.
- **`POTENTIAL`** : Incohérence de nommage présente mais atténuée par un mapper mémoire ou un fallback contextuel.
- **`NOT_AN_INCONSISTENCY`** : Différence de nommage ou de type légitime répondant à un besoin métier distinct.
- **`UNVERIFIED`** : Absence de preuves suffisantes dans le périmètre du code inspecté.

---

## 2. PRIORITÉ 1 — MATRICE DÉTAILLÉE : `businessId` vs `business_id`

### Matrice d'Incohérence par Collection et Produit/Consommateur

| Collection | Producteur (Écriture) | Champ écrit | Consommateur (Lecture / Filtre) | Champ lu / Filtre | Incohérence démontrée | Fichier et lignes de preuve |
|---|---|---|---|---|---|---|
| **`payroll_records`** | `PayrollRepository.savePayrollRecords` | `business_id` | `PayrollRepository.updateCycle` (exclusion employé) | `payroll_cycle_id` vs `cycleId` | **`CONFIRMED`** — `updateCycle` filtre sur `payroll_cycle_id` alors que `savePayrollRecords` persiste `cycleId`. Le nettoyage des employés exclus ne trouve aucun enregistrement. | `src/repositories/PayrollRepository.ts` L212 vs L281 |
| **`payroll_records`** | `PayrollRepository.deleteCycle` | `cycleId` | `PayrollRepository.updateCycle` | `payroll_cycle_id` | **`CONFIRMED`** — Conflit interne à `PayrollRepository`: `deleteCycle` filtre sur `cycleId` (L370) tandis que `updateCycle` filtre sur `payroll_cycle_id` (L212). | `src/repositories/PayrollRepository.ts` L212 vs L370 |
| **`analytics_snapshots`** | `AnalyticsSnapshotRepository.create` | `businessId` & `business_id` | `AnalyticsSnapshotRepository.getLatest` / `getByPeriodKey` | `where("businessId", "==", businessId)` | **`CONFIRMED`** — La recherche BI utilise `businessId` (`camelCase`), contrairement à toutes les autres collections de l'ERP qui filtrent sur `business_id` (`snake_case`). | `src/repositories/AnalyticsRepository.ts` L37, L50, L63, L74, L90 |
| **`ledger_transactions`** | `LedgerRepository.save` | `tx.business_id` (fallback `"biz_default"`) | `LedgerRepository.listByBusiness` | `where("business_id", "==", businessId)` | **`CONFIRMED`** — Si une transaction est passée avec `businessId` sans `business_id`, le fallback assigne `"biz_default"`. La transaction est enregistrée dans une mauvaise entreprise/outbox. | `src/repositories/LedgerRepository.ts` L112, L196, L231 |
| **`employees`** | Formulaires d'ajout employé | `businessId` / `business_id` | `PayrollService.processPayrollCycle` | `(!e.business_id \|\| e.business_id === businessId)` | **`CONFIRMED`** — Si un objet employé n'a que `businessId` (sans `business_id`), `!e.business_id` vaut `true`. L'employé d'une autre entreprise est inclus à tort dans le calcul de paie. | `src/services/payroll/PayrollService.ts` L149-150 |
| **`forensic_logs`** | `ForensicLogRepository.createAndSignLog` | `business_id` | `ForensicLogRepository.listByBusiness` | `where("business_id", "==", businessId)` | **`NOT_AN_INCONSISTENCY`** — Alignement parfait sur `business_id` en écriture et en lecture. | `src/repositories/ForensicLogRepository.ts` L45, L82 |
| **`users`** | `UserProfileRepository.updateAccountStatus` | `business_id` & `businessId` | `firestore.rules` (`getUserBusinessId`) | `request.auth.token.businessId` / `getMyProfile().business_id` | **`POTENTIAL`** — Géré par règles Firestore avec cascades de fallback mais risque de désynchronisation des claims JWT. | `firestore.rules` L38-50, `src/repositories/UserProfileRepository.ts` L82 |

---

## 3. PRIORITÉ 2 — AUTRES VARIANTES DE CHAMPS ET CONVERGENCES DE TYPES

### 3.1. `baseSalary` vs `salaryBaseHtg` vs `base_salary_cents`
- **Producteurs** :
  - `src/types.ts` (`Employee`) : définit `baseSalary: number` et `salaryBaseHtg?: number`.
  - `mapEmployee` (`src/utils/caseConverter.ts` L213) : extrait `data.baseSalary ?? raw.salary_base_htg ?? raw.salaryBaseHtg ?? raw.baseSalary ?? 0`.
  - `PayrollRepository.validateEmployeeContractsForPayroll` (L492) : extrait `contract?.baseSalary ?? emp.baseSalary ?? emp.salaryBaseHtg ?? emp.base_salary_cents / 100`.
- **Classification** : **`CONFIRMED`**
- **Impact & Preuve** : Quatre représentations différentes coexistent pour le salaire de base : montant direct en Gourdes (`baseSalary`, `salaryBaseHtg`), montant en centimes (`base_salary_cents`), et champ dans le sous-document contrat (`contract.baseSalary`). Un composant UI lisant uniquement `emp.baseSalary` affichera `0 HTG` si le document Firestore ne contient que `salary_base_htg`.
- **Fichiers** : `src/types.ts` (L117-118), `src/utils/caseConverter.ts` (L213), `src/repositories/PayrollRepository.ts` (L492).

### 3.2. `employeeId` vs `employee_id`
- **Producteurs & Consommateurs** :
  - `AttendanceRecord` : utilise `employeeId` dans `src/types.ts` (L197), mais la collection `attendance_records` est requêtée avec `where("business_id", "==", businessId)` dans `PayrollService.ts` (L129).
  - `EmployeeDepartmentAssignment` : contient à la fois `employeeId` (L50) et `employee_id` (L51).
  - `mapAttendanceRecord` (`caseConverter.ts` L249-261) : fait correspondre les deux champs dans l'objet retourné.
- **Classification** : **`POTENTIAL`**
- **Impact** : L'accès direct aux propriétés d'un document Firestore sans passer par `mapAttendanceRecord` cause des valeurs `undefined` dans les calculs d'heures de présence.

### 3.3. `branchId` / `branch_id` & `departmentId` / `department_id`
- **Producteurs & Consommateurs** :
  - `LedgerRepository.listByBusiness` (L120, L125) : exécute des requêtes Firestore `where("branchId", "in", branchIds)` et `where("departmentId", "in", deptIds)` (`camelCase`).
  - `LedgerRepository.save` (L206-209) : enregistre à la fois `branchId` et `branch_id`, ainsi que `departmentId` et `department_id`.
  - `EmployeeRepository.ts` (L31, L83) : enregistre `branchId` et `departmentId`.
- **Classification** : **`NOT_AN_INCONSISTENCY`**
- **Justification** : Le repository du Grand Livre écrit systématiquement les deux formes (`branchId` et `branch_id`, `departmentId` et `department_id`) lors du `save` (L206-209), garantissant que la requête `where("branchId", "in", ...)` trouve les documents.

### 3.4. `createdAt` / `created_at` & `updatedAt` / `updated_at`
- **Analyse** :
  - `PayrollRepository.createCycle` (L164-165) : écrit `created_at: serverTimestamp()` et `updated_at: serverTimestamp()` (`snake_case`).
  - `PayrollRepository.deleteCycle` (L422) : écrit `deletedAt: string` (`camelCase`) et `updated_at: serverTimestamp()` (`snake_case`).
  - `UserProfileRepository.updateUserProfile` (L29-30) : écrit simultanément `updatedAt` et `updated_at`.
  - `AnalyticsSnapshotRepository.create` (L92-93) : écrit simultanément `createdAt` et `updatedAt`.
- **Classification** : **`POTENTIAL`**
- **Impact** : Mélange de types entre `FieldValue` (`serverTimestamp()`) et `string` (`ISO 8601`). Si un composant tente de sérialiser un `serverTimestamp()` Firestore non résolu (objet `{_methodName: "serverTimestamp"}`) en JSON avant écriture, la sérialisation plante.

### 3.5. `periodStart` / `period_start` & `periodEnd` / `period_end`
- **Producteurs & Consommateurs** :
  - `PayrollCycle` dans `src/types.ts` : utilise `startDate` et `endDate` !
  - `mapPayrollCycle` (`caseConverter.ts` L269-282) : convertit `startDate` / `start_date` et `endDate` / `end_date`.
  - `PayrollService.ts` (L67, L86, L100) : utilise `cycle.startDate` et `cycle.endDate`.
  - `docs/audits/FINOPS_PAYROLL_END_TO_END_WORKFLOW_P03_8.md` : mentionne `periodStart` et `periodEnd`.
- **Classification** : **`CONFIRMED`**
- **Impact & Preuve** : Divergence entre la documentation/spécifications (`periodStart` / `periodEnd`) et le code réel (`startDate` / `endDate`). Si une API externe ou un DTO envoie `periodStart`, le champ est ignoré par `mapPayrollCycle` qui cherche `startDate` ou `start_date`.

---

## 4. PRIORITÉ 3 — FLUX DE DONNÉES INTER-MODULES ET CONTRATS

```
 [Employés] ---> (baseSalary, status, business_id) ---> [Paie (PayrollEngine)]
                                                                |
                                                      (payslips / records)
                                                                v
 [Trésorerie] -> (cash_settlements) -> [Comptabilité] <--- (JournalEntry)
                                              |
                                              v
                                   [BI / Analytics Snapshots]
```

### 4.1. Employés → Paie
- **Contrat** : `Employee` (salaire, modèle de paiement, statut, tenant).
- **Problème de contrat** : `PayrollService.processPayrollCycle` (L149-150) vérifie `(!e.business_id || e.business_id === businessId)`. Si l'objet employé ne contient que `businessId` (sans `business_id`), la condition `!e.business_id` est vraie, ce qui autorise l'inclusion d'un employé n'appartenant pas au tenant dans la paie !
- **Statut** : **`CONFIRMED`**

### 4.2. Paie → Comptabilité (Grand Livre)
- **Contrat** : `PayrollRepository.sealCycleAtomic` (L565-574) génère et persiste des `LedgerTransaction` dans la collection `ledger_transactions`.
- **Analyse du contrat** : `sealCycleAtomic` injecte `business_id: businessId` et `status: "POSTED"`. Les écritures respectent la partie double (Débit/Crédit) via `applyDoubleEntryRules`.
- **Statut** : **`NOT_AN_INCONSISTENCY`** (Contrat comptable respecté).

### 4.3. Trésorerie → Comptabilité
- **Contrat** : `CashSettlementRepository.getByBusiness` lit la collection `cash_settlements` avec `where("business_id", "==", businessId)`.
- **Analyse** : Les objets `CashSettlement` utilisent exclusivement des montants entiers en centimes (`amount_cents`), évitant les erreurs d'arrondi décimal en Gourdes.
- **Statut** : **`NOT_AN_INCONSISTENCY`** (Contrat financier propre).

### 4.4. Transactions → BI & Snapshots
- **Contrat** : `AnalyticsSnapshotRepository` (L37, L50, L63, L74) requiert la collection `analytics_snapshots` en utilisant `where("businessId", "==", businessId)` (camelCase).
- **Incompatibilité** : Toutes les autres collections d'enregistrements (paie, journal, employés) sont requêtées avec `business_id` (snake_case). Un script d'indexation générique cherchant `business_id` dans `analytics_snapshots` échoue.
- **Statut** : **`CONFIRMED`**

---

## 5. PROPOSITIONS DE CORRECTIONS MINIMALES DE SÉCURITÉ

### Anomalie #1 (CRITIQUE) : Incohérence de filtrage des bulletins dans `PayrollRepository.ts`
- **Preuve** : 
  - L212: `where("payroll_cycle_id", "==", cycleId)`
  - L281: `recRef = doc(db, "payroll_records", rec.id); batch.set(recRef, { ...rec, business_id })` où `rec` contient `cycleId`.
  - L370: `where("cycleId", "==", cycleId)`
- **Correction minimale proposée** :
  Harmoniser le nom du champ de requête dans `PayrollRepository.ts` (L212) pour utiliser `cycleId` ou enregistrer à la fois `cycleId` et `payroll_cycle_id` lors du `savePayrollRecords` (L281-286) :
  ```typescript
  // Dans savePayrollRecords (L281-286) :
  batch.set(recRef, {
    ...rec,
    cycleId: rec.cycleId,
    payroll_cycle_id: rec.cycleId,
    business_id: businessId,
    updated_at: serverTimestamp()
  }, { merge: true });
  ```

### Anomalie #2 (CRITIQUE) : Risque de fuite Multi-Tenant dans `PayrollService.ts`
- **Preuve** : `src/services/payroll/PayrollService.ts` L149-150 :
  `(!e.business_id || e.business_id === businessId)`
- **Correction minimale proposée** :
  Utiliser les deux variantes de nommage avec un opérateur ET explicite pour empêcher l'inclusion d'employés sans tenant :
  ```typescript
  // Dans PayrollService.ts (L149-150) :
  const empBusinessId = e.business_id || e.businessId;
  const activeEmployees = (employees || []).filter(
    (e) => empBusinessId === businessId && (e.status === "ACTIVE" || !e.status)
  );
  ```

### Anomalie #3 (ÉLEVÉE) : Fallback Tenant indésirable `"biz_default"` dans `LedgerRepository.ts`
- **Preuve** : `src/repositories/LedgerRepository.ts` L196 :
  `const businessId = tx.business_id || "biz_default";`
- **Correction minimale proposée** :
  Résoudre d'abord `tx.businessId` avant d'avoir recours au fallback, ou lever une exception stricte d'isolation multi-tenant :
  ```typescript
  // Dans LedgerRepository.ts (L196) :
  const businessId = tx.business_id || tx.businessId;
  if (!businessId) {
    throw new Error("Multi-Tenancy Violation: business_id is strictly required for LedgerTransaction.");
  }
  ```

---

## 6. LES TROIS INCOHÉRENCES LES PLUS PRIORITAIRES

### 1. Incohérence des filtres de recherche `payroll_records` (`cycleId` vs `payroll_cycle_id`)
* **Preuve dans le code** : `PayrollRepository.ts` L212 utilise `where("payroll_cycle_id", "==", cycleId)` alors que `savePayrollRecords` (L281) écrit `cycleId` et que `deleteCycle` (L370) cherche `where("cycleId", "==", cycleId)`.
* **Impact** : L'exclusion d'un employé lors de la modification d'un cycle de paie ne supprime pas ses bulletins existants dans Firestore, créant des doublons et de fausses fiches de paie.
* **Correction minimale** : Écrire à la fois `cycleId` et `payroll_cycle_id` dans `savePayrollRecords`.

### 2. Condition de filtrage Multi-Tenant permissive dans `PayrollService.ts`
* **Preuve dans le code** : `PayrollService.ts` L149 (`(!e.business_id || e.business_id === businessId)`).
* **Impact** : Tout objet employé dont le champ `business_id` est omis (par exemple s'il utilise uniquement la propriété TypeScript `businessId`) est inclus par erreur dans les calculs de paie de n'importe quelle entreprise.
* **Correction minimale** : Évaluer `(e.business_id || e.businessId) === businessId`.

### 3. Divergence de nommage du filtre Tenant BI (`analytics_snapshots`)
* **Preuve dans le code** : `AnalyticsRepository.ts` L37 (`where("businessId", "==", businessId)`) versus `PayrollRepository.ts` L48 (`where("business_id", "==", businessId)`).
* **Impact** : Incompatibilité avec les règles d'indexation et d'audit global ERP. Les snapshots BI sont isolés sur `businessId` tandis que les écritures sous-jacentes sont isolées sur `business_id`.
* **Correction minimale** : Écrire et requêter les deux clés `businessId` et `business_id` dans `AnalyticsSnapshotRepository`.
