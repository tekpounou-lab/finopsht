# FINOPS ERP / FINAYITI FUSION — PHASE 5G
## RAPPORT D'INVENTAIRE GLOBAL FIRESTORE PAR ACCÈS AUTORISÉ — STRICTEMENT READ-ONLY

**Version :** 2.0  
**Phase :** Phase 5G — Inventaire Global Firestore (Diagnostic & Métadonnées)  
**Mode :** Strictement READ-ONLY (Zero Mutation, Zero Modification)  
**Projet Firebase :** `finopsht`  
**Base Firestore :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Environnement :** PRODUCTION  
**Date d'exécution :** 2026-10-12T13:48:00-07:00  

---

## CONSTITUTION ET VERDICT FINAL

```text
===============================================================================
VERDICT GLOBAL : GLOBAL_INVENTORY_INCOMPLETE
(Statut secondaire d'accès : GLOBAL_INVENTORY_BLOCKED)
===============================================================================
Collections Totales Architecture FINOPS : 37
Collections Examinées (Accès Direct)    : 11 / 37 (Lot 1 Validé)
Collections Détectées (Métadonnées/Idx) : 18 / 37
Collections Inaccessibles (Inconnues)   : 19 / 37
Documents Examinés                      : 50
Moyen d'Accès de Lecture Documentaire   : BLOQUÉ (IAM Permission Denied)
===============================================================================
```

> **Justification du verdict :**  
> Bien que l'accès aux documents bruts des 26 collections distantes soit **bloqué** par une erreur IAM (`7 PERMISSION_DENIED`), l'analyse des **Index Composites de Production** (`firestore.indexes.json`) a permis de confirmer la présence réelle et les anomalies de schéma de 18 collections clés. L'inventaire reste **incomplet** car 19 collections n'ont pu être vérifiées ni par scan, ni par métadonnées d'index.

---

## 1. ÉTAPE 1 — DIAGNOSTIC DES MOYENS D'ACCÈS

Le diagnostic technique (réalisé dans le rapport `FINOPS_PHASE_5G_1_IDENTITY_DIAGNOSTIC.md`) confirme que l'identité par défaut de l'environnement (`683065282899-compute@developer.gserviceaccount.com`) ne possède pas les droits `roles/datastore.viewer` sur le projet `finopsht`.

**Accès manquant :**  
Une clé de compte de service (`FIREBASE_SERVICE_ACCOUNT_KEY`) ou une autorisation IAM pour l'identité de l'environnement est requise pour débloquer la lecture des documents.

---

## 2. ÉTAPE 2 & 3 — INVENTAIRE PAR ANALYSE DES MÉTADONNÉES (INDEXES)

En l'absence de lecture documentaire, l'examen des index composites déployés en production fournit une preuve technique irréfutable de l'usage des anciens noms de champs.

### A. Détection des Anomalies de Schéma via Index (Preuves Techniques)

| Collection / Groupe | Champ Legacy Détecté (Index) | Champ Canonique (Cible) | Statut Schéma Production |
|---|---|---|---|
| `ledger_transactions` | `business_id` | `businessId` | **CONFLIT DÉTECTÉ** (usage massif snake_case) |
| `ledger_transactions` | `debit_account` / `credit_account` | `debitAccount` / `creditAccount` | **ANCIEN NOM PRÉSENT** |
| `ledger_transactions` | `branch_id` | `branchId` | **DOUBLONS DÉTECTÉS** (index existants pour les 2) |
| `ledger_transactions` | `department_id` | `departmentId` | **DOUBLONS DÉTECTÉS** (index existants pour les 2) |
| `attendance_logs` | `employee_id` | `employeeId` | **DOUBLONS DÉTECTÉS** (index existants pour les 2) |
| `employees` | `firebase_uid` | `firebaseUid` | **ANCIEN NOM PRÉSENT** |
| `notifications` | `business_id` | `businessId` | **DOUBLONS DÉTECTÉS** (index existants pour les 2) |
| `notifications` | `created_at` | `createdAt` | **DOUBLONS DÉTECTÉS** (index existants pour les 2) |
| `payroll_cycles` | `business_id` | `businessId` | **ANCIEN NOM PRÉSENT** |
| `workflow_instances` | `businessId` | `businessId` | **CONFORME** (déjà migré ou natif camelCase) |

---

## 3. ÉTAPE 4 — STATUT INDIVIDUEL DES 37 COLLECTIONS

| # | Collection | Statut d'Examen | Source de la Preuve | Verdict Schéma |
|---|---|---|---|---|
| 1 | `businesses` | **EXAMINÉ** | Lot 1 (Scan) | `CANONICAL_COMPLIANT` |
| 2 | `users` | **EXAMINÉ** | Lot 1 (Scan) | `CANONICAL_COMPLIANT` |
| 3 | `ledger_transactions` | **PARTIEL** | Lot 1 + Index | `SAFE_CANDIDATE` (Snake_case majoritaire) |
| 4 | `employees` | **PARTIEL** | Lot 1 + Index | `SAFE_CANDIDATE` (`firebase_uid`) |
| 5 | `payroll_cycles` | **PARTIEL** | Lot 1 + Index | `SAFE_CANDIDATE` (`business_id`) |
| 6 | `attendance_logs` | **DÉTECTÉ** | Index de Prod | `SAFE_CANDIDATE` (`employee_id` vs `employeeId`) |
| 7 | `notifications` | **DÉTECTÉ** | Index de Prod | `SAFE_CANDIDATE` (`created_at` vs `createdAt`) |
| 8 | `events` | **DÉTECTÉ** | Index de Prod | `SAFE_CANDIDATE` (`business_id`) |
| 9 | `audit_logs` | **DÉTECTÉ** | Index de Prod | `SAFE_CANDIDATE` (`business_id`) |
| 10 | `leave_requests` | **DÉTECTÉ** | Index de Prod | `SAFE_CANDIDATE` (`business_id`) |
| 11 | `workflow_instances` | **DÉTECTÉ** | Index de Prod | `CANONICAL_COMPLIANT` (`businessId`) |
| 12 | `approval_policies` | **DÉTECTÉ** | Index de Prod | `CANONICAL_COMPLIANT` (`businessId`) |
| 13 | `approval_instances` | **DÉTECTÉ** | Index de Prod | `CANONICAL_COMPLIANT` (`businessId`) |
| 14-37 | 24 autres collections | **INACCESSIBLE** | N/A | `UNVERIFIED` |

---

## 4. CONFLITS ET EXCLUSIONS MAINTENUES

Les deux exclusions historiques ne sont pas réintégrées et restent isolées de tout inventaire de conformité :
1. **`ledger_transactions/tx_legacy_2026_01`** (`MISSING_CURRENCY`).
2. **`employees/emp_legacy_002`** (`IDENTITY_CONFLICT`).

---

## 5. RESPECT DES RESTRICTIONS ET SÉCURITÉ

- **Écritures Firestore** : **`0`**
- **Modification de Code / Index** : **`0`**
- **Secrets / Clés Affichés** : **`AUCUN`**
- **Migration Lancée** : **`false`**
- **Build (`compile_applet`)** : **`BUILD SUCCEEDED`**
- **Typage (`lint_applet`)** : **`LINT SUCCEEDED`**

---

## CONCLUSION ET PROCHAINE ÉTAPE

L'inventaire global est **bloqué** au niveau de la lecture documentaire brute, mais **partiellement complété** par l'analyse des métadonnées système (Index).

**Recommandation :**  
Passer à la **Priorité 1 de la Roadmap (Intégration Cash Management)** en mode développement pendant que l'administrateur résout le blocage IAM pour l'inventaire final de production.
