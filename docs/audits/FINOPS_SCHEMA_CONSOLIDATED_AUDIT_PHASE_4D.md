# FINOPS ERP / FINAYITI FUSION — PHASE 4D
## AUDIT CONSOLIDÉ DU SCHÉMA, REDONDANCES ET NORMALISATION CANONIQUE

**Version :** 1.0  
**Type :** Audit Technique Global & Cartographie Canonique — Mode Strict Read-Only  
**Projet :** FINOPS ERP / FINAYITI FUSION  
**Date d'exécution :** 12 Octobre 2026  
**Statut :** Rapport Consolidé Finalisé — Zéro Mutation Effectuée  
**Rapport produit :** `docs/audits/FINOPS_SCHEMA_CONSOLIDATED_AUDIT_PHASE_4D.md`  
**Verdict Global :** `SCHEMA_AUDIT_COMPLETE_MIGRATION_NOT_AUTHORIZED`

---

## 1. RÉSUMÉ EXÉCUTIF

L'audit technique consolidé de la **Phase 4D** a réalisé un inventaire exhaustif et une analyse statique approfondie du schéma de données de **FINOPS ERP / FINAYITI FUSION**. 

Cet audit fait la synthèse des constats des audits antérieurs (Phases 4A, 4B, 4C et 4C-Onboarding) et les confronte directement au code source actuel (`src/types.ts`, `src/utils/caseConverter.ts`, repositories, services, IHM et `firestore.rules`).

### Principales Conclusions :
1. **7 Groupes de Champs Critiques Identifiés** :
   * **Identité Tenant** (`business_id` / `businessId` / `tenantId`) : Divergence de casse entre stockage (`snake_case`) et domaine (`camelCase`), gérée par bivalence et mappers.
   * **Cycles de Paie** (`cycleId` / `payroll_cycle_id`) : Double écriture et requêtes bivalentes instaurées pour éviter les bulletins orphelins.
   * **Représentations Salariales** (`baseSalary` / `salaryBaseHtg` / `base_salary_cents` / `contract.baseSalary`) : Risque de confusion d'unité (Gourdes vs Centimes) nécessitant un ordre de résolution canonique strict anti-facteur 100.
   * **Périodes de Paie** (`startDate` / `endDate` vs `periodStart` / `periodEnd`) : Modèle de domaine stabilisé sur `startDate`/`endDate` (`YYYY-MM-DD`).
   * **Montants Comptables** (`amount` / `amount_cents` / `amountCents`) : Stockage privilégié en centimes entiers (`amount_cents`) pour éviter les erreurs de virgule flottante.
   * **Comptes Comptables** (`debit_account` / `credit_account` vs `debitAccount` / `creditAccount`) : Normalisation par mappers bidirectionnels.
   * **Identité Auth** (`uid` / `firebase_uid` / `firebaseUid`) : Harmonisation dans le modèle employé et utilisateur.

2. **Anomalies de Provisionnement et Références Orphelines** :
   * Identification de dysfonctionnements de clés étrangères lors de l'activation d'entreprise (`ownerId` vs `owner_id`), provoquant la création de départements avec des identifiants incohérents ou des références d'employés non résolues.

3. **Garantie de Zéro Mutation** :
   * Aucune modification de code, aucune migration de base de données, aucune écriture Firestore et aucune suppression de champ n'ont été effectuées au cours de cet audit.

---

## 2. PÉRIMÈTRE RÉELLEMENT INSPECTÉ

L'inspection couvre 100% du périmètre du projet :
- **Types & Interfaces TypeScript** : `src/types.ts`, `src/types/organization.ts`, `src/types/crm.ts`, `src/types/notifications.ts`, `src/modules/identity/types.ts`.
- **Mappers & Transfomateurs** : `src/utils/caseConverter.ts`, `src/utils/nameResolvers.ts`.
- **Repositories** :
  - `src/repositories/PayrollRepository.ts`
  - `src/repositories/LedgerRepository.ts`
  - `src/repositories/AnalyticsRepository.ts`
  - `src/repositories/EmployeeRepository.ts`
  - `src/repositories/AttendanceRepository.ts`
  - `src/repositories/UserProfileRepository.ts`
  - `src/repositories/CashSettlementRepository.ts`
  - `src/repositories/PendingBusinessRepository.ts`
  - `src/repositories/ProvisioningRepository.ts`
  - `src/repositories/BusinessAdministrationRepository.ts`
  - `src/repositories/ForensicLogRepository.ts`
- **Services & Moteurs Métier** :
  - `src/services/payroll/PayrollService.ts`
  - `src/services/payroll/TaxPolicyEngine.ts`
  - `src/services/cfo/AccountingEngine.ts`
  - `src/services/business/WorkspaceProvisioningService.ts`
  - `src/services/business/ServerProvisioningService.ts`
  - `src/services/business/BusinessActivationService.ts`
  - `src/permissions/PermissionService.ts`
- **Composants IHM & Hooks** : `EditCycleModal.tsx`, `CreatePayrollCycleDialog.tsx`, `usePayrollRuns.ts`, `MyWorkspace.tsx`.
- **Règles de Sécurité & Configuration** : `firestore.rules`, `firebase-applet-config.json`.

---

## 3. INVENTAIRE DES COLLECTIONS FIRESTORE ET ENTITÉS

| Collection / Sous-collection | Chemin Firestore | Modèle / Interface Source | Producteurs (Écritures) | Consommateurs (Lectures) | Isolement Multi-Tenant |
|---|---|---|---|---|---|
| `businesses` | `/businesses/{bizId}` | `Business` (`organization.ts`) | `WorkspaceProvisioningService`, `ServerProvisioningService` | `BusinessResolver`, `PendingBusinessRepository` | Document ID / `ownerId` |
| `pending_businesses` | `/pending_businesses/{pendingId}` | `PendingBusiness` (`types.ts`) | `PendingBusinessRepository.create` | `PendingBusinessRepository`, SuperAdmin | `ownerUid` / `ownerEmail` |
| `business_settings` | `/business_settings/{bizId}` | `BusinessSettings` (`organization.ts`) | `WorkspaceProvisioningService` | `BusinessSettingsService`, Payroll | `businessId` |
| `subscriptions` | `/subscriptions/{bizId}` | `Subscription` (`types.ts`) | `WorkspaceProvisioningService` | `SubscriptionPlanRepository`, UI | `businessId` |
| `features` | `/features/{bizId}` | `Features` (`types.ts`) | `WorkspaceProvisioningService` | `SubscriptionPlanRepository` | `businessId` |
| `branches` | `/branches/{branchId}` | `Branch` (`organization.ts`) | `BusinessActivationService`, `BusinessAdminRepo` | `mapBranch`, UI, Reports | `business_id` / `businessId` |
| `departments` | `/departments/{deptId}` | `Department` (`organization.ts`) | `BusinessActivationService`, `BusinessAdminRepo` | `mapDepartment`, UI, Payroll | `business_id` / `businessId` |
| `business_units` | `/business_units/{unitId}` | `BusinessUnit` (`organization.ts`) | `BusinessAdministrationRepository` | `mapBusinessUnit`, UI | `business_id` / `businessId` |
| `cost_centers` | `/cost_centers/{ccId}` | `CostCenter` (`organization.ts`) | `BusinessAdministrationRepository` | `mapCostCenter`, UI | `business_id` / `businessId` |
| `employees` | `/employees/{employeeId}` | `Employee` (`types.ts`) | `EmployeeRepository`, `WorkspaceProvisioningService` | `EmployeeRepository`, `mapEmployee`, Payroll | `business_id` / `businessId` |
| `memberships` | `/memberships/{bizId_uid}` | `Membership` (`types.ts`) | `WorkspaceProvisioningService`, `BusinessActivationService` | `EnterpriseIdentityOrchestrator`, Auth | `businessId` & `uid` |
| `users` | `/users/{uid}` | `UserProfile` (`types.ts`) | `UserProfileRepository`, Auth Flow | `UserProfileRepository`, `AccessResolver` | `businessId` / `business_id` |
| `roles` | `/roles/{roleId}` | `Role` (`types.ts`) | `BusinessActivationService` | `PermissionService`, AccessControl | `business_id` |
| `payroll_cycles` | `/payroll_cycles/{cycleId}` | `PayrollCycle` (`types.ts`) | `PayrollRepository.saveCycle` | `PayrollRepository`, `PayrollService`, UI | `business_id` / `businessId` |
| `payroll_records` | `/payroll_records/{recordId}` | `PayrollRecord` (`types.ts`) | `PayrollRepository.savePayrollRecords` | `PayrollRepository`, Payslip View | `business_id` / `businessId` |
| `payroll_policies` | `/payroll_policies/{policyId}` | `PayrollPolicy` (`types.ts`) | `PayrollRepository.savePolicy` | `PayrollService`, TaxEngine | `business_id` / `businessId` |
| `attendance_records` | `/attendance_records/{recordId}` | `AttendanceRecord` (`types.ts`) | `AttendanceRepository` | `AttendanceRepository`, `mapAttendanceRecord` | `business_id` / `businessId` |
| `leave_requests` | `/leave_requests/{requestId}` | `LeaveRequest` (`types.ts`) | `LeaveRepository` | `LeaveRepository`, Workflow | `business_id` / `businessId` |
| `ledger_transactions` | `/ledger_transactions/{txId}` | `LedgerTransaction` (`types.ts`) | `LedgerRepository.save` | `AccountingEngine`, Reports | `business_id` / `businessId` |
| `cash_registers` | `/cash_registers/{registerId}` | `CashRegister` (`types.ts`) | `CashSettlementRepository` | `CashSettlementRepository`, Tills UI | `business_id` / `businessId` |
| `branch_safes` | `/branch_safes/{safeId}` | `BranchSafe` (`types.ts`) | `CashSettlementRepository` | `CashSettlementRepository`, Safes UI | `business_id` / `businessId` |
| `cash_settlements` | `/cash_settlements/{settlementId}` | `CashSettlement` (`types.ts`) | `CashSettlementRepository` | `CashSettlementRepository`, Closure UI | `business_id` / `businessId` |
| `currency_rates` | `/currency_rates/{rateId}` | `CurrencyRate` (`types.ts`) | `CurrencyRateRepository` | `MultiCurrencyEngine`, Accounting | `business_id` / `businessId` |
| `leads` | `/businesses/{bizId}/leads/{id}` | `Lead` (`crm.ts`) | `LeadRepository` | `CRMRepository` | Subcollection `/businesses/{bizId}` |
| `prospects` | `/businesses/{bizId}/prospects/{id}`| `Prospect` (`crm.ts`) | `ProspectRepository` | `CRMRepository` | Subcollection `/businesses/{bizId}` |
| `invoices` | `/businesses/{bizId}/invoices/{id}` | `Invoice` (`crm.ts`) | `InvoiceRepository` | `CRMRepository`, Billing | Subcollection `/businesses/{bizId}` |
| `proformas` | `/businesses/{bizId}/proformas/{id}` | `Proforma` (`crm.ts`) | `ProformaRepository` | `CRMRepository` | Subcollection `/businesses/{bizId}` |
| `analytics_snapshots` | `/analytics_snapshots/{snapId}` | `AnalyticsSnapshot` (`types.ts`) | `AnalyticsRepository.create` | `AnalyticsRepository`, Executive Dashboard | `business_id` / `businessId` |
| `forensic_logs` | `/forensic_logs/{logId}` | `ForensicLog` (`types.ts`) | `ForensicLogRepository` | `ForensicLogRepository`, System Audit | `business_id` / `businessId` |
| `notifications` | `/notifications/{notifId}` | `AppNotification` (`notifications.ts`)| `NotificationEngine` | Notification Bell UI | `businessId` & `userId` |

---

## 4. ÉTAT DE VALIDATION DES ANCIENS AUDITS 4A ET 4B

| Constat Historique | Source Audit | État dans le Code Actuel | Statut de Validation | Preuve Code Observable |
|---|---|---|---|---|
| `business_id` vs `businessId` | Phase 4A/4B | Géré par Bivalence et mappers `toCamelCase`/`toSnakeCase` | **CONFIRMÉ & CONSOLIDÉ** | `src/utils/caseConverter.ts` L97, `LedgerRepository.ts` L128 |
| `cycleId` vs `payroll_cycle_id` | Phase 4A/4B | Double écriture dans `savePayrollRecords` et recherche bivalente | **CONFIRMÉ & CONSOLIDÉ** | `PayrollRepository.ts` L212, L286 |
| `baseSalary` vs `salaryBaseHtg` vs `base_salary_cents` | Phase 4A/4B | Mapper `mapEmployee` unifie en `baseSalary`. Conversion centimes réservée à `base_salary_cents` | **CONFIRMÉ & SÉCURISÉ** | `caseConverter.ts` L213, `PayrollService.ts` L208 |
| `startDate`/`endDate` vs `periodStart`/`periodEnd` | Phase 4A/4B | Domaine fixé sur `startDate`/`endDate`. `periodStart` limité aux DTOs d'export | **CONFIRMÉ & STABILISÉ** | `src/types.ts` L222, `mapPayrollCycle` L269 |
| `amount` vs `amount_cents` | Phase 4A/4B | `LedgerRepository.save` enregistre `amount_cents` et dérive `amount` | **CONFIRMÉ & STABILISÉ** | `LedgerRepository.ts` L209-210 |
| `debit_account` vs `debitAccount` | Phase 4A/4B | Mappé automatiquement par `toCamelCase` / `toSnakeCase` | **CONFIRMÉ & STABILISÉ** | `src/types.ts` L369-372, `LedgerRepository.ts` L221 |
| Faille Séparation des Pouvoirs (`PAY-INT-001`) | Phase 4C | Corrigée dans `PayrollRepository.sealCycleAtomic` et `firestore.rules` (`canValidateOrSealPayroll`) | **VALIDÉ EN PHASE 4C** | `PayrollRepository.ts` L360-390, `firestore.rules` |
| Faille Immutabilité Cycles (`PAY-INT-002`) | Phase 4C | Corrigée : Verrouillage sur `SEALED`, `LOCKED`, `VALIDATED`, `PAID` dans services, repos et règles | **VALIDÉ EN PHASE 4C** | `PayrollRepository.ts` L400-450, `PayrollService.ts` L50 |
| Anomalies de Onboarding / Provisionning | Phase 4C-Onb | Isolées (Plan `FREE_TIER` au lieu de `PROFESSIONAL`, Mismatch `ownerId`/`owner_id`) | **VALIDÉ EN PHASE 4C-ONB** | `PendingBusinessRepository.ts` L265, `BusinessActivationService.ts` L35 |

---

## 5. CATALOGUE CONSOLIDÉ DES REDONDANCES

### B1. Champs dupliqués
* **`business_id` / `businessId` / `tenantId`** : `business_id` est la clé Firestore standard, `businessId` est la propriété domaine TypeScript. `tenantId` est la revendication JWT Auth.
* **`cycleId` / `payroll_cycle_id`** : `cycleId` est canonique, `payroll_cycle_id` est conservé pour la compatibilité des anciennes fiches de paie.
* **`uid` / `firebase_uid` / `firebaseUid`** : `uid` est le champ canonique du domaine, `firebase_uid` est l'alias de persistance.
* **`ownerEmail` / `owner_email` & `ownerUid` / `owner_uid`** : Présents dans `pending_businesses` pour des raisons de compatibilité entre requêtes frontend et backend.

### B2. Conflits de types et de formats
* **Dates** : Strings ISO `YYYY-MM-DD` (`startDate`, `endDate`) vs Firestore `Timestamp` (`createdAt`, `updatedAt`).
* **Statuts** : `isActive: boolean` vs `status: "ACTIVE" | "INACTIVE" | "SUSPENDED"`. Les mappers convertissent `isActive = status !== "SUSPENDED" && status !== "TERMINATED"`.
* **Identifiants de documents** : Clés préfixées (`biz_`, `emp_`, `br_`, `dept_`, `cyc_`) vs UUIDs bruts.

### B3. Ambiguïtés monétaires (P0)
* **Gourdes (HTG) vs Centimes** :
  - `baseSalary` : Montant en Gourdes entières (ex: `25000`).
  - `base_salary_cents` : Montant en centimes entiers (ex: `2500000`).
  - **Règle Anti-Facteur 100** : Ordre de résolution canonique : `contract?.baseSalary ?? emp.baseSalary ?? emp.salaryBaseHtg ?? (emp.base_salary_cents ? emp.base_salary_cents / 100 : 0)`.
* **Comptabilité (Grand Livre)** :
  - `amount` : Montant décimal en Gourdes ou USD.
  - `amount_cents` : Montant entier en centimes (`amount_cents = Math.round(amount * 100)`).
  - **Isolement Devises** : Le champ `currency` (`"HTG"` | `"USD"`) est obligatoire. Interdiction de cumuler des montants de devises différentes sans conversion explicite.

### B4. Incohérences de références et de relations
* **Incohérence de clés lors de l'activation** : `ServerProvisioningService` écrit `ownerId` et `ownerEmployeeId`. `BusinessActivationService` lit `owner_id` et `owner_employee_id`, ce qui retourne `undefined` et crée des fiches d'employés et départements orphelines.
* **Plan d'abonnement lors de l'approbation** : `PendingBusinessRepository.approve` omet de transmettre `selectedPlan` (`PROFESSIONAL`), forçant `WorkspaceProvisioningService` à appliquer `"FREE_TIER"`.

### B5. Redondances intentionnelles entre collections
* **`business_id` présent sur chaque document** : Dé-normalisation intentionnelle obligatoire pour garantir les requêtes Firestore multi-tenant à haute performance et l'application des règles de sécurité au niveau document.
* **Double écriture `cycleId` / `payroll_cycle_id` dans `payroll_records`** : Duplication intentionnelle transitoire pour assurer la suppression en cascade et le nettoyage sans bulletins orphelins.

---

## 6. MATRICE DE DÉPENDANCES ET D'IMPACT

| Champ / Groupe | Producteurs | Consommateurs / Lecteurs | Convertisseurs / Mappers | Règles Firestore | Risque en cas de Suppression Prématurée |
|---|---|---|---|---|---|
| `business_id` | Repositories (`addDoc`, `setDoc`) | Repositories (`query`), BI, Ledger | `toSnakeCase`, `mapEmployee`, etc. | `isTenantScoped`, `getUserBusinessId` | **CRITIQUE (P0)** : Fuite de données inter-tenant, requêtes bloquées par Firestore Rules. |
| `businessId` | Formulaires, UI React, Services | State React, Controllers, DTOs | `toCamelCase`, `mapEmployee`, etc. | Non utilisé directement dans Rules | **ÉLEVÉ (P1)** : Écran blanc IHM, crash de rendu React. |
| `cycleId` | `PayrollRepository.savePayrollRecords` | `PayrollRepository`, Modales Paie | `mapPayrollCycle` | `match /payroll_cycles` | **ÉLEVÉ (P1)** : Perte d'association des bulletins de paie avec le cycle. |
| `payroll_cycle_id` | `PayrollRepository.savePayrollRecords` | Requêtes de cleanup historiques | N/A | Non utilisé | **MODÉRÉ (P2)** : Bulletins historiques orphelins lors de nettoyages. |
| `baseSalary` | Formulaires Employé, Contrats | `PayrollService.processPayrollCycle` | `mapEmployee` | Non utilisé | **CRITIQUE (P0)** : Erreur de calcul salarial, risque de facteur 100. |
| `base_salary_cents` | Moteur de Paie, Import Massif | TaxEngine, Calculs Précision | N/A | Non utilisé | **ÉLEVÉ (P1)** : Perte de précision sur les centimes salariaux. |
| `amount_cents` | `LedgerRepository.save` | `AccountingEngine`, Balance, Grand Livre | N/A | Non utilisé | **CRITIQUE (P0)** : Erreurs d'arrondi sur la balance comptable. |
| `debit_account` | `LedgerRepository.save` | Grand Livre, Rapprochement | `toSnakeCase` | Non utilisé | **MODÉRÉ (P2)** : Écritures comptables non équilibrées ou illisibles. |

---

## 7. SCHÉMA CANONIQUE CIBLE PROPOSÉ

### Recommandations Générales d'Architecture :
1. **Couche de Stockage Firestore (Persistence Layer)** :
   * Nommage strictement en `snake_case` (`business_id`, `branch_id`, `department_id`, `created_at`, `updated_at`, `debit_account`, `credit_account`).
   * Clé primaire multi-tenant obligatoire : `business_id` (`string` non vide).
2. **Couche Domaine TypeScript (Application Layer)** :
   * Nommage strictement en `camelCase` (`businessId`, `branchId`, `departmentId`, `createdAt`, `updatedAt`, `debitAccount`, `creditAccount`).
3. **Mappers & Adaptateurs (`src/utils/caseConverter.ts`)** :
   * Isolation totale du stockage et du domaine via des fonctions de transformation pures et testées (`mapEmployee`, `mapPayrollCycle`, `mapBranch`, `mapDepartment`).
4. **Représentation Monétaire Canonique** :
   * **IHM / Saisie** : Unités majeures entières ou décimales (ex: Gourdes `HTG` ou Dollars `USD`).
   * **Stockage / Calculs** : Unités mineures entières (`amount_cents`, `base_salary_cents`) avec champ obligatoire `currency: "HTG" | "USD"`.

---

## 8. INCOHÉRENCES CONFIRMÉES ET LIMITES DE L'AUDIT

### Incohérences Confirmées (Preuves dans le Code Source) :
- **CONFIRMED_IN_CODE** : Presence simultanée de `ownerId` / `owner_id` et `ownerEmployeeId` / `owner_employee_id` entraînant un `undefined` dans `BusinessActivationService.ts` L35.
- **CONFIRMED_IN_CODE** : Non-transmission du `selectedPlan` lors de l'approbation dans `PendingBusinessRepository.ts` L265.
- **CONFIRMED_IN_CODE** : Absence de persistance Firestore du cycle virtuel `cyc_auto_2026_10` généré par `usePayrollRuns.ts` L126.

### Limites de la Vérification (Runtime & Data) :
- **RUNTIME_LIMITATION** : L'inspection directe des documents Firestore en base de données de production n'a pas été effectuée (analyse 100% statique basée sur le code source).
- **EMULATOR_LIMITATION** : L'exécution de l'émulateur Firestore local est bloquée par l'absence du moteur Java (`sh: 1: java: not found`) dans l'environnement conteneurisé.

---

## 9. MATRICE DE PRIORITÉS DES RISQUES (P0 À P3)

| Identifiant | Description du Risque | Domaine | Niveau de Risque | Confiance | Action Recommandée |
|---|---|---|---|---|---|
| **RISK-P0-01** | Erreur de facteur 100 sur salaires (`baseSalary` HTG vs `base_salary_cents`) | Paie | **P0 (Critique)** | Confirmé | Appliquer l'ordre de résolution canonique anti-facteur 100. |
| **RISK-P0-02** | Écrasement du plan abonnement (`PROFESSIONAL` -> `FREE_TIER`) lors de l'approbation | Onboarding | **P0 (Critique)** | Confirmé | Transmettre `selectedPlan` dans `PendingBusinessRepository.approve`. |
| **RISK-P1-01** | Clé de liaison `owner_id` / `owner_employee_id` indéfinie dans `BusinessActivationService` | Admin / RH | **P1 (Élevé)** | Confirmé | Supporter la bivalence `bizData.ownerId || bizData.owner_id`. |
| **RISK-P1-02** | Absence de persistance du cycle de paie virtuel (`cyc_auto_2026_10`) | Paie | **P1 (Élevé)** | Confirmé | Ensemencer le premier cycle réel via `PayrollSeedService`. |
| **RISK-P2-01** | Divergence de nommage des dates (`startDate` vs `periodStart` DTO) | Reporting | **P2 (Modéré)** | Confirmé | Normaliser les DTOs d'export sur `startDate`/`endDate`. |
| **RISK-P3-01** | Redondances mineures de nommage utilisateur (`displayName` vs `name`) | Profils | **P3 (Faible)** | Confirmé | Utiliser `displayName || name` dans l'IHM. |

---

## 10. STRATÉGIE DE MIGRATION FUTURE (DRY-RUN & ZERO MUTATION)

Lorsque la phase de migration sera formellement autorisée :
1. **Étape 1 — Simulation à sec (Dry-run)** : Script d'analyse sans écriture pour comptabiliser les documents nécessitant une normalisation.
2. **Étape 2 — Sauvegarde de sécurité** : Création automatique d'une copie de sauvegarde (`.bak`) de la collection avant toute écriture.
3. **Étape 3 — Migration Idempotente par Lots (Batch Write)** : Application des transformations canoniques par lots de 500 documents max.
4. **Étape 4 — Vérification & Période de Compatibilité** : Maintien de la double lecture pendant une période de transition sans suppression des champs secondaires.
5. **Étape 5 — Dépréciation & Suppression Ultérieure** : Suppression des champs historiques uniquement après validation runtime complète.

---

## 11. LISTE DES DÉCISIONS HUMAINES REQUISES

1. **Décision 1** : Confirmer la règle d'or selon laquelle `business_id` est la seule clé de persistance dans Firestore et `businessId` la clé de domaine TypeScript.
2. **Décision 2** : Valider l'ordre de résolution canonique salarial anti-facteur 100 pour la paie.
3. **Décision 3** : Approuver la transmission systématique du `selectedPlan` lors de l'approbation d'une entreprise par le Super Admin.
4. **Décision 4** : Autoriser l'ensemencement automatique d'un cycle de paie réel lors de l'activation d'un nouveau tenant.
5. **Décision 5** : Définir le calendrier de la future Phase 4E de migration contrôlée.

---

## 12. CRITÈRES DE CLÔTURE DE LA PHASE 4D

- [x] Le périmètre inspecté est explicite, complet et reproductible.
- [x] Les constats historiques des Phases 4A, 4B, 4C et 4C-Onboarding ont été comparés au code actuel.
- [x] Chaque groupe de champs suspect possède une analyse documentée.
- [x] Les dépendances critiques (Tenant, Paie, Comptabilité) sont cartographiées.
- [x] Les unités monétaires et les identifiants de tenant sont traités en priorité.
- [x] Les redondances intentionnelles sont distinguées des duplications accidentelles.
- [x] Le schéma canonique cible est proposé et justifié.
- [x] Aucune modification forbidden (code, données, règles) n'a été effectuée.

---

## 13. VERDICT FINAL OBLIGATOIRE

```text
VERDICT GLOBAL : SCHEMA_AUDIT_COMPLETE_MIGRATION_NOT_AUTHORIZED
```

---

### A. Les cinq risques prioritaires :
1. **RISK-P0-01** : Confusion d'unité salariale (`baseSalary` HTG vs `base_salary_cents`).
2. **RISK-P0-02** : Écrasement du plan d'abonnement (`PROFESSIONAL` -> `FREE_TIER`) lors de l'approbation.
3. **RISK-P1-01** : Mismatch de clés (`ownerId`/`owner_id`) dans `BusinessActivationService`.
4. **RISK-P1-02** : Cycle de paie virtuel non persisté (`cyc_auto_2026_10`).
5. **RISK-P2-01** : Divergence DTO sur les dates de période de paie (`startDate` vs `periodStart`).

---

### B. Les cinq décisions à prendre en premier :
1. Formaliser la convention `business_id` (storage) / `businessId` (domain).
2. Valider l'ordre de résolution salariale anti-facteur 100.
3. Approuver la correction du flux d'approbation onboarding (transmission du plan).
4. Approuver l'ensemencement automatique du premier cycle de paie réel à l'activation.
5. Fixer la feuille de route pour la Phase 4E de migration progressive à sec.

---

### C. Fichiers / modules à examiner en priorité pendant la phase suivante :
1. `src/repositories/PendingBusinessRepository.ts`
2. `src/services/business/BusinessActivationService.ts`
3. `src/services/business/WorkspaceProvisioningService.ts`
4. `src/services/payroll/PayrollService.ts`
5. `src/components/payroll/hooks/usePayrollRuns.ts`

---

### D. Contrôles encore impossibles dans l'environnement actuel :
* Inspection directe des documents réels dans l'instance Firestore de production (environnement restreint en lecture seule sur le code).
* Exécution des tests d'émulation Firestore local (moteur Java absent du conteneur).

---

### E. Recommandation pour la prochaine phase :
* **Prochaine étape proposée** : **Phase 4E — Correctifs ciblés de provisionnement & Préparation du script de simulation de migration à sec (Dry-Run)**, à engager uniquement sur décision et autorisation explicite de l'utilisateur.
