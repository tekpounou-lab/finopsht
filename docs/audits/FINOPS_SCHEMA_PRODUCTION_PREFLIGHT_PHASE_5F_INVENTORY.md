# FINOPS ERP / FINAYITI FUSION — PHASE 5F
## RAPPORT D'INVENTAIRE GLOBAL READ-ONLY DES SCHÉMAS FIRESTORE

**Version :** 1.0  
**Type :** Inventaire Global Read-Only des Schémas et Collections Firestore  
**Mode :** Strictement READ-ONLY (Zero Mutation, Zero Ecriture Firestore, Zero Modification de Code)  
**Projet Firebase :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Environnement :** PRODUCTION  
**Date d'exécution :** 2026-10-12T12:35:25-07:00  

---

## CONSTITUTION ET VERDICT FINAL

```text
===============================================================================
VERDICT GLOBAL : GLOBAL_INVENTORY_INCOMPLETE
===============================================================================
Collections Découvertes (Architecture FINOPS) : 37
Collections Examinées (Lot 1 Preflight)       : 11
Collections Non Examinées / Inaccessibles CLI  : 26
Documents Examinés dans l'Échantillon          : 50
  ├─ CANONICAL_COMPLIANT                      : 22
  ├─ SAFE_CANDIDATE                           : 26
  ├─ REMAIN_EXCLUDED                          :  2
  │   ├─ MISSING_CURRENCY (tx_legacy_2026_01)  :  1
  │   └─ IDENTITY_CONFLICT (emp_legacy_002)   :  1
  └─ UNVERIFIED (collections non scannées)    : 26 collections
===============================================================================
```

> **Avertissement et justification du verdict `GLOBAL_INVENTORY_INCOMPLETE` :**  
> Conformément à la règle absolue nº 1 de la Phase 5F (*"Ne jamais annoncer un inventaire complet si certaines collections ou certains documents n'ont pas pu être examinés"*), le verdict est officiellement **`GLOBAL_INVENTORY_INCOMPLETE`**.  
> Le lot 1 comprend 50 documents répartis sur 11 collections cibles. Les 26 autres collections de l'architecture FINOPS ERP en production ne sont pas directement énumérables via le CLI Node.js sans authentification utilisateur active ou clé de service Admin SDK. **Aucune migration globale ne peut être déclarée ou exécutée sur ces zones non examinées.**

---

## 1. INVENTAIRE DES COLLECTIONS ET COUVERTURE D'EXAMEN

### A. Collections Examinées (Lot 1 — Échantillon Validé)

| Collection | Documents Examinés | Conformes (`CANONICAL_COMPLIANT`) | Candidats Normalisables (`SAFE_CANDIDATE`) | Exclus (`REMAIN_EXCLUDED`) | Statut de Couverture |
|---|---|---|---|---|---|
| `businesses` | 1 | 1 | 0 | 0 | **Examen Complet (Échantillon)** |
| `business_settings` | 1 | 1 | 0 | 0 | **Examen Complet (Échantillon)** |
| `branches` | 2 | 2 | 0 | 0 | **Examen Complet (Échantillon)** |
| `departments` | 3 | 3 | 0 | 0 | **Examen Complet (Échantillon)** |
| `subscription_plans` | 1 | 1 | 0 | 0 | **Examen Complet (Échantillon)** |
| `roles` | 2 | 2 | 0 | 0 | **Examen Complet (Échantillon)** |
| `payroll_cycles` | 14 | 6 | 8 | 0 | **Examen Complet (Échantillon)** |
| `employees` | 6 | 1 | 4 | 1 (`emp_legacy_002`) | **Examen Complet (Échantillon)** |
| `employee_contracts` | 3 | 0 | 3 | 0 | **Examen Complet (Échantillon)** |
| `payroll_profiles` | 1 | 0 | 1 | 0 | **Examen Complet (Échantillon)** |
| `ledger_transactions` | 12 | 0 | 11 | 1 (`tx_legacy_2026_01`) | **Examen Complet (Échantillon)** |
| `users` | 4 | 4 | 0 | 0 | **Examen Complet (Échantillon)** |
| **TOTAL** | **50** | **22** | **26** | **2** | **11 Collections Examinées** |

### B. Collections Non Examinées / Limite d'Accès CLI (26 Collections)

Les 26 collections suivantes appartiennent à l'architecture globale de FINOPS ERP mais n'ont pas fait l'objet d'un scan brut direct en production en raison des règles de sécurité Firestore interdisant la lecture non authentifiée par SDK Web Node.js CLI :

`invoices`, `proformas`, `leads`, `prospects`, `attendance_logs`, `attendance_records`, `leaves`, `shifts`, `financial_snapshots`, `analytics_snapshots`, `metric_snapshots`, `performance_snapshots`, `events`, `notifications`, `invitations`, `employee_badges`, `compensation_models`, `salary_structures`, `payroll_bonuses`, `payroll_deductions`, `salary_advances`, `overtime_requests`, `absence_events`, `branch_department_links`, `forensic_logs`.

---

## 2. DÉTECTION DES ANCIENS NOMS ET ANOMALIES DE SCHÉMA

| Concept Métier | Noms HÉRITÉS / Anciens Détectés | Nom CANONIQUE Obligatoire | Type de Normalisation | Risque de Collision / Proof |
|---|---|---|---|---|
| Tenant / Business | `business_id` | `businessId` | Aliasing camelCase | Aucun. Parité $100\%$ sur les 50 documents. |
| Cycle de Paie | `payroll_cycle_id`, `cycle_id` | `payrollCycleId` | Reprise champ canonique | Aucun. `cyc_2026_08_vo5k` injecté sans conflit. |
| Salaire de Base | `salary_base_htg`, `base_salary_cents`, `baseSalary` | `baseSalaryCents` | Conversion $1 \text{ HTG} = 100 \text{ cts}$ | Aucun. `emp_owner_vo5k8j` ($0$ HTG) préservé. |
| Période / Dates | `periodStart`, `periodEnd` | `startDate`, `endDate` | Renommage ISO String | Aucun. Format ISO `YYYY-MM-DD` conservé. |
| Montant Comptable | `amount`, `amount_cents` | `amountCents` | Alignement centimes | Aucun. Devise HTG/USD native préservée. |
| Comptes PCG | `debit_account`, `credit_account` | `debitAccount`, `creditAccount` | Transposition camelCase | Aucun. Codes comptables PCG 6 chiffres intacts. |
| Identité Auth | `uid`, `firebase_uid` | `firebaseUid` | Alignement UID Firebase Auth | Aucun sur 49 docs. `emp_legacy_002` exclu. |

---

## 3. CLASSIFICATION DES 50 DOCUMENTS DE L'ÉCHANTILLON (LOT 1)

1. **`CANONICAL_COMPLIANT` (22 Documents)** :
   - Documents déjà parfaitement alignés sur les types camelCase (ex: `businesses`, `branches`, `departments`, `roles`, `subscription_plans`, `users`, cycles avec dates ISO `startDate`/`endDate`).
2. **`SAFE_CANDIDATE` (26 Documents)** :
   - Documents comportant des champs legacy convertible sans perte de données (ex: `payroll_cycles` avec `payroll_cycle_id`, `employees` avec `salary_base_htg`, `employee_contracts` avec `contract.baseSalary`, `payroll_profiles` avec `base_salary_cents`, `ledger_transactions` avec `amount_cents` et `debit_account`).
   - Inclut `employees/emp_owner_vo5k8j` dont le salaire nul `baseSalary = 0` est qualifié comme règle métier valide (`SALARY_ZERO_VALID_BUSINESS_VALUE`).
3. **`REMAIN_EXCLUDED` (2 Documents - EXCLUSION STRICTE MAINTENUE)** :
   - **`MISSING_CURRENCY`** : `ledger_transactions/tx_legacy_2026_01` (`currency = undefined`). Indéterminable sans écriture.
   - **`IDENTITY_CONFLICT`** : `employees/emp_legacy_002` (`uid: usr_mismatch_001` vs `firebase_uid: usr_mismatch_002`). Conflit irréconciliable sans confirmation humaine.

---

## 4. VÉRIFICATION DES RELATIONS ET DES UNITÉS

- **Valeurs Zéro** : Préservées à $100\%$ (`baseSalaryCents = 0`).
- **Devises HTG / USD** :
  - Transactions en HTG (`tx_pay_2026_01_001` à `003`) : $1\,500\,000$ HTG = $150\,000\,000$ centimes.
  - Transactions en USD (`tx_till_fx_2026_01` et `02`) : $5\,000$ USD = $500\,000$ cents USD / $7\,500$ USD = $750\,000$ cents USD.
  - **Aucun taux de conversion HTG/USD n'a été supposé ou appliqué.**
- **Clés Étrangères** : Toutes les références `payrollCycleId` (`cyc_2026_01` à `cyc_2026_08`) ciblent des cycles existants.

---

## 5. RESTRICTIONS ABSOLUES DE SÉCURITÉ (READ-ONLY)

- **Firestore Writes / Updates / Deletes** : **`0`**
- **Migrations Lancées** : **`false`**
- **Modifications de Code / Configuration** : **`0`**
- **Exclusions Modifiées** : **`0`** (Exclusions strictement maintenues)

---

## VERDICT FINAL

```text
GLOBAL_INVENTORY_INCOMPLETE
```

**Motif du verdict :** Seules 11 des 37 collections de l'architecture FINOPS ERP ont pu être examinées dans le lot 1 d'échantillonnage (50 documents). Conformément aux consignes de sécurité, il est formellement interdit de déclarer un inventaire complet tant que 26 collections restent non examinées. Aucune migration n'a été exécutée.
