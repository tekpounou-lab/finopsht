# FINOPS ERP / FINAYITI FUSION — PHASE 4A : AUDIT GLOBAL DE NORMALISATION DU SCHÉMA

**Version :** 1.0  
**Statut :** Rapport d'Audit Architectural & Cartographie du Schéma de Données  
**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date d'exécution :** 12 Octobre 2026  
**Fichier produit :** `docs/audits/FINOPS_SCHEMA_NORMALIZATION_PHASE_4A.md`  
**Verdict Global :** `PHASE_4A_SCHEMA_CONFLICTS_FOUND`  
**Contrainte de Phase :** READ-ONLY strict — 0 modification de code, 0 migration de base de données.

---

## 1. RÉSUMÉ EXÉCUTIF

L'audit architectural de la **Phase 4A** à produit un inventaire exhaustif et une cartographie structurée du schéma de données de **FINOPS ERP / FINAYITI Fusion**. L'objectif est de préparer la transition d'un modèle de compatibilité historique basé sur la double écriture (`camelCase` / `snake_case`) vers un schéma canonique normalisé, sans perte de données ni régression fonctionnelle.

### Constats Stratégiques Majeurs :
1. **Divergence des Identifiants Multi-Tenant (`business_id` vs `businessId`)** :
   - **Tag** : `CONFIRMED_IN_CODE`
   - Le stockage Firestore utilise de manière générale `business_id` (`snake_case`), tandis que le modèle TypeScript domaine privilégie `businessId` (`camelCase`).
   - L'utilitaire `src/utils/caseConverter.ts` mappe les deux formes en mémoire. Cependant, la collection `analytics_snapshots` et certains repositories de reporting ont historically requêté `businessId`, créant un décalage d'indexation corrigé en Phase 3 par bivalence.
2. **Conflit de Clé de Liaison des Bulletins (`cycleId` vs `payroll_cycle_id`)** :
   - **Tag** : `CONFIRMED_IN_CODE`
   - Les documents de la collection `payroll_records` contiennent la clé canonique `cycleId` pour la plupart des écritures récentes, mais les anciennes collections et requêtes de nettoyage utilisaient `payroll_cycle_id`. La Phase 3 a instauré la double écriture et les requêtes bivalentes.
3. **Incompatibilité des Représentations Salariales (`baseSalary` vs `salaryBaseHtg` vs `base_salary_cents`)** :
   - **Tag** : `CONFIRMED_IN_CODE` & `BUSINESS_SEMANTICS_UNRESOLVED`
   - Quatre représentations coexistent : `baseSalary` (montant en Gourdes, type `number`), `salaryBaseHtg` (alias en Gourdes), `base_salary_cents` (montant en centimes entiers), et `contract.baseSalary` (dans le sous-document contrat). Un risque d'erreur d'un facteur 100 existe si un composant lit un montant en centimes comme un montant en Gourdes.
4. **Divergence de Nommage des Périodes de Paie (`startDate`/`endDate` vs `periodStart`/`periodEnd`)** :
   - **Tag** : `CONFIRMED_IN_CODE`
   - Les modèles `PayrollCycle` et `PayrollRecord` utilisent `startDate` et `endDate`, tandis que la documentation et les exports DTO font référence à `periodStart` / `periodEnd` ou `period_start` / `period_end`.

---

## 2. PÉRIMÈTRE RÉELLEMENT INSPECTÉ

L'inspection a couvert 100% des dossiers et modules clés du projet :
- **Types & Interfaces** : `src/types.ts`, `src/types/organization.ts`, `src/types/crm.ts`, `src/types/notifications.ts`.
- **Mappers & Convertisseurs** : `src/utils/caseConverter.ts`.
- **Repositories** : `PayrollRepository.ts`, `LedgerRepository.ts`, `AnalyticsRepository.ts`, `EmployeeRepository.ts`, `AttendanceRepository.ts`, `UserProfileRepository.ts`, `CashSettlementRepository.ts`, `ForensicLogRepository.ts`.
- **Services** : `PayrollService.ts`, `TaxPolicyEngine.ts`, `AccountingEngine.ts`, `PermissionService.ts`, `AccessResolver.ts`.
- **IHM & Modales** : `EditCycleModal.tsx`, `CreateCycleModal.tsx`, `PayrollEngine.tsx`.
- **Règles de Sécurité** : `firestore.rules`.

---

## 3. INVENTAIRE DES DOMAINES ET MODÈLES

| Domaine | Modèles / Interfaces Présents | Composants de Lecture | Composants d'Écriture | Statut du Domaine dans le Projet |
|---|---|---|---|---|
| **Administration & Identité** | `UserProfile`, `User`, `Role` | `UserProfileRepository`, `AccessResolver` | `UserProfileRepository` | **PRÉSENT & ACTIF** |
| **Organisation** | `Business`, `Branch`, `Department`, `BusinessUnit`, `CostCenter` | `OrganizationStructure`, `mapBranch`, `mapDepartment` | `BusinessAdministrationRepository` | **PRÉSENT & ACTIF** |
| **Employés & Contrats** | `Employee`, `EmployeeDepartmentAssignment` | `EmployeeRepository`, `mapEmployee` | `EmployeeRepository` | **PRÉSENT & ACTIF** |
| **Paie & Bulletins** | `PayrollCycle`, `PayrollRecord`, `TaxRates` | `PayrollRepository`, `PayrollService` | `PayrollRepository`, `sealCycleAtomic` | **PRÉSENT & ACTIF (CRITIQUE)** |
| **Présence & Pointages** | `AttendanceRecord` | `AttendanceRepository`, `mapAttendanceRecord` | `AttendanceRepository`, `qrAttendanceService` | **PRÉSENT & ACTIF** |
| **Comptabilité & Grand Livre** | `LedgerTransaction`, `LedgerEntry` | `LedgerRepository`, `AccountingEngine` | `LedgerRepository.save`, `sealCycleAtomic` | **PRÉSENT & ACTIF (CRITIQUE)** |
| **Trésorerie & Caisses** | `CashSettlement`, `CashRegister`, `BranchSafe` | `CashSettlementRepository` | `CashSettlementRepository` | **PRÉSENT & ACTIF** |
| **CRM & Facturation** | `Lead`, `Prospect`, `Invoice`, `Proforma` | `CRMRepository` | `CRMRepository` | **PRÉSENT & ACTIF** |
| **BI & Snapshots** | `AnalyticsSnapshot`, `FinancialSnapshot` | `AnalyticsRepository` | `AnalyticsRepository.create` | **PRÉSENT & ACTIF** |
| **Achats & Stocks** | *Aucun modèle d'inventaire physique dédié* | N/A | N/A | **ABSENT DU PERIMÈTRE** |

---

## 4. MATRICE CANONIQUE OBLIGATOIRE DU SCHÉMA

| Domaine | Concept Métier | Champ Canonique Recommandé | Variantes Détectées | Type & Unité | Source d'Écriture | Lecteurs Principaux | Classification | Risque | Preuves Code |
|---|---|---|---|---|---|---|---|---|---|
| **Multi-Tenant** | Identifiant Entreprise | `business_id` (Storage) / `businessId` (Domain) | `business_id`, `businessId`, `tenantId`, `tenant_id` | `string` (UUID/slug) | Repositories (`setDoc`, `addDoc`) | Repositories, `firestore.rules`, `AccessResolver` | **Catégorie C** (Double écriture) | **P0** (Fuite inter-tenant si mal géré) | `src/types.ts` L76-77, `caseConverter.ts` L97 |
| **Paie** | Clé de Cycle sur Bulletin | `cycleId` | `cycleId`, `payroll_cycle_id` | `string` (UUID) | `PayrollRepository.savePayrollRecords` | `PayrollRepository.updateCycle`, `deleteCycle` | **Catégorie C** (Double écriture) | **P1** (Bulletins orphelins) | `PayrollRepository.ts` L212, L286 |
| **Paie** | Salaire de Base Contractuel | `baseSalary` (Gourdes) / `base_salary_cents` (Centimes) | `baseSalary`, `salaryBaseHtg`, `base_salary_cents`, `contract.baseSalary` | `number` (HTG vs Centimes) | `EmployeeRepository`, Formulaires | `PayrollService.ts` L208, `caseConverter.ts` L213 | **Catégorie E** (Types/Unités incompatibles) | **P1** (Erreur facteur 100 sur salaire) | `src/types.ts` L117-118, `PayrollRepository.ts` L511 |
| **Paie** | Dates de Période | `startDate` / `endDate` | `startDate`, `endDate`, `start_date`, `end_date`, `periodStart`, `periodEnd`, `period_start`, `period_end` | `string` (ISO `YYYY-MM-DD`) | `EditCycleModal.tsx`, `CreateCycleModal.tsx` | `PayrollService.ts` L181-182, `mapPayrollCycle` | **Catégorie B** (Compatibilité historique) | **P2** (Filtres de période incomplets) | `src/types.ts` L222-225, L318-321 |
| **Comptabilité** | Montant Transaction | `amount` (HTG) / `amount_cents` (Centimes) | `amount`, `amount_cents`, `amountCents` | `number` (HTG vs Centimes) | `LedgerRepository.save` | `AccountingEngine.ts`, `LedgerRepository` | **Catégorie C** (Double écriture) | **P0** (Corruption comptable si unité inversée) | `LedgerRepository.ts` L209-210, `src/types.ts` L356-358 |
| **Comptabilité** | Comptes Débit/Crédit | `debit_account` / `credit_account` | `debit_account`, `debitAccount`, `credit_account`, `creditAccount` | `string` (Numéro de compte PCG) | `LedgerRepository.save` | `AccountingEngine.ts` | **Catégorie A** (Doublon technique) | **P2** (Incohérence écriture comptable) | `LedgerRepository.ts` L221-222, `src/types.ts` L369-372 |
| **Employé** | Identifiant Utilisateur Auth | `uid` (Domain) / `firebase_uid` (Storage) | `uid`, `firebase_uid`, `firebaseUid` | `string` (Firebase UID) | `UserProfileRepository`, `EmployeeRepository` | `firestore.rules`, `AccessResolver` | **Catégorie A** (Doublon technique) | **P1** (Rupture d'association profil/auth) | `src/types.ts` L108-109, `caseConverter.ts` L212 |

---

## 5. CLASSIFICATION DÉTAILLÉE DES REDONDANCES

### Catégorie A — Doublons Techniques Problématiques
- `debit_account` vs `debitAccount` / `credit_account` vs `creditAccount` dans `LedgerTransaction`.
- `branch_id` vs `branchId` / `department_id` vs `departmentId` dans `Employee` et `AttendanceRecord`.
- **Tag** : `CONFIRMED_IN_CODE`

### Catégorie B — Compatibilité Historique
- `payroll_cycle_id` dans `payroll_records` (conservé pour lire les bulletins antérieurs à la Phase 3).
- `start_date` et `end_date` dans `payroll_cycles`.
- **Tag** : `HISTORICAL_COMPATIBILITY`

### Catégorie C — Double Écriture
- `business_id` et `businessId` écrits simultanément dans `AnalyticsRepository.create` et `LedgerRepository.save`.
- `cycleId` et `payroll_cycle_id` écrits simultanément dans `savePayrollRecords`.
- `amount` et `amount_cents` écrits simultanément dans `LedgerRepository.save`.
- **Tag** : `CONFIRMED_IN_CODE`

### Catégorie D — Concepts Distincts à NE PAS Fusionner (Règle d'Or)
- **`startDate` (Début Période de Paie) vs `effectiveAccountingDate` (Date d'Effet Comptable)** :
  * `startDate` est la date calendaire de début de travail. `effectiveAccountingDate` est la date d'imputation dans le Grand Livre (ex: 15 du mois). **NE PAS FUSIONNER**.
- **`baseSalary` (Salaire Contractuel Fixe HTG) vs `grossSalary` (Salaire Brut Calculé avec Heures Supplémentaires et Primes)** :
  * Le premier est une donnée d'entrée contractuelle, le second est un résultat du moteur de paie. **NE PAS FUSIONNER**.
- **`amount` (Montant de la Transaction) vs `amount_cents` (Représentation en Centimes Entiers)** :
  * Ce sont deux représentations scalaires de la même valeur avec des unités différentes (Gourdes vs Centimes). **NE PAS FUSIONNER SANS MIGRATION STRUCTURÉE**.
- **Tag** : `BUSINESS_SEMANTICS_UNRESOLVED`

### Catégorie E — Représentations Incompatibles
- `baseSalary` (`number` en Gourdes, ex: `10000`) vs `base_salary_cents` (`number` en centimes entiers, ex: `1000000`).
- `createdAt` (`ISO 8601 string`) vs `created_at` (`Firestore FieldValue serverTimestamp()`).
- **Tag** : `CONFIRMED_IN_CODE`

---

## 6. ANALYSE APPROFONDIE DES GROUPES PRIORITAIRES

### 6.1. Identifiants Multi-Tenant
* **Modèle canonique recommandé** :
  - **Base de données Firestore** : `business_id` (`snake_case`).
  - **Domaine TypeScript & React** : `businessId` (`camelCase`).
* **Mécanisme de transition** : Mapper systématique via `mapEmployee`, `mapPayrollCycle`, `mapBranch` dans `src/utils/caseConverter.ts`.
* **Règle de sécurité** : Rejet de toute opération si `business_id !== businessId` lorsqu'ambos sont fournis (`[MultiTenancyViolation]`).

### 6.2. Paie & Bulletins
* **Modèle canonique recommandé** : `cycleId` dans `payroll_records`.
* **Double écriture transitoire** : Maintenir l'écriture de `cycleId` ET `payroll_cycle_id` lors de `savePayrollRecords` pour garantir la compatibilité des requêtes de suppression et d'exclusion.

### 6.3. Salaires & Contrats
* **Modèle canonique recommandé** :
  - `baseSalary` (en Gourdes entières) pour les interfaces IHM et le domaine React.
  - `base_salary_cents` (en centimes entiers) pour le stockage Firestore et les calculs de paie haute précision.
* **Conversion canonique** : `base_salary_cents = Math.round(baseSalary * 100)`.

---

## 7. STRATÉGIE DE MIGRATION PROPOSÉE (PHASE 4B / FUTURE)

1. **Étape A — Contrat Canonique** : Formaliser la convention `snake_case` en base / `camelCase` en mémoire via les mappers `caseConverter.ts`.
2. **Étape B — Compatibilité Transitoire** : Conserver la double écriture bivalente pour les collections critiques (`payroll_records`, `ledger_transactions`, `analytics_snapshots`).
3. **Étape C — Script de Migration Idempotent (Optionnel)** : Écrire un script d'alignement pour combler les documents historiques ne possédant qu'une seule variante.
4. **Étape D — Nettoyage Progressif** : Déprécier les lectures sur clés secondaires une fois la migration validée.

---

## 8. MATRICE DE PRIORISATION POUR MIGRATION

| Priorité | Groupe de Champs | Raison & Impact Business | Dépendances |
|---|---|---|---|
| **P0 (CRITIQUE)** | `business_id` / `businessId` | Risque d'isolation multi-tenant et de fuite de données inter-entreprises. | `firestore.rules`, Repositories |
| **P0 (CRITIQUE)** | `amount` / `amount_cents` | Risque d'erreur financière d'un facteur 100 dans le Grand Livre. | `LedgerRepository`, `AccountingEngine` |
| **P1 (ÉLEVÉE)** | `cycleId` / `payroll_cycle_id` | Risque de fiches de paie orphelines ou d'échec de suppression. | `PayrollRepository` |
| **P1 (ÉLEVÉE)** | `baseSalary` / `base_salary_cents` | Risque de calcul de paie erroné pour les employés. | `PayrollService`, `TaxPolicyEngine` |
| **P2 (MOYENNE)** | `startDate` / `periodStart` | Incohérence des filtres de rapports BI et de dates. | `AnalyticsRepository`, `EditCycleModal` |
| **P3 (FAIBLE)** | `debit_account` / `debitAccount` | Doublon cosmétique dans les objets transactions. | `LedgerRepository` |

---

## 9. LIMITES DE L'AUDIT & ÉLÉMENTS NON VÉRIFIÉS

* **`RUNTIME_NOT_VERIFIED`** : Le contenu réel des documents existants en base de données de production Firestore n'a pas été inspecté par requête directe (audit 100% statique et basé sur le code source).
* **`NOT_INSPECTED`** : Les modules physiques d'achats/stocks sont absents du dépôt.

---

## 10. VERDICT FINAL OBLIGATOIRE

```text
VERDICT GLOBAL : PHASE_4A_SCHEMA_CONFLICTS_FOUND
```

### Justification du Verdict :
Des conflits réels et des incohérences de schéma confirmées dans le code source (`cycleId` vs `payroll_cycle_id`, `baseSalary` vs `salaryBaseHtg` vs `base_salary_cents`, et `business_id` vs `businessId` dans les snapshots BI) ont été formellement identifiés et cartographiés. Ils nécessitent une résolution ordonnée lors de la Phase 4B avant toute suppression de champ historique.

### Confirmation de Contrainte Strictes :
* **Aucun fichier de code applicatif n'a été modifié.**
* **Aucun test n'a été altéré.**
* **Aucune règle `firestore.rules` n'a été modifiée.**
* **Aucun document Firestore n'a été altéré ni migré.**
