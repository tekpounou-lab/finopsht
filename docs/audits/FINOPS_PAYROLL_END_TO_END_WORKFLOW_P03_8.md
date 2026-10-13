# FINOPS × FINAYITI — PAYROLL END-TO-END WORKFLOW AUDIT & CONTROL CERTIFICATION
## Rapport d'Audit Complet du Workflow de Paie et Certification des Contrôles (Phase P03.8)

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 11 octobre 2026  
**Phase :** P03.8 — Payroll End-to-End Workflow Audit & Control Certification  
**Auteur :** AI Engineering Orchestrator / Software Architect  
**Verdict Officiel :** `PAYROLL_WORKFLOW_FUNCTIONAL_PASS_SECURITY_PENDING`  
**Statut Certification Security Runtime :** `RUNTIME_SECURITY_CERTIFICATION_BLOCKED` (Absence de runtime Java pour Firebase Emulator local)

---

## 1. RÉSUMÉ EXÉCUTIF

L'audit complet de la chaîne d'exécution de la paie (**End-to-End Payroll Workflow**) a été mené de manière rigoureuse sur le code source, les règles de sécurité Firestore (`firestore.rules`), la couche de persistance (`PayrollRepository.ts`, `LedgerRepository.ts`), le moteur de calcul (`PayrollService.ts`), ainsi que les suites de tests automatisées du projet FINOPS ERP.

### Principales Conclusions :
1. **Intégrité Fonctionnelle & Calculs :** Le moteur de paie (`PayrollService.ts`, `PayrollCalculationEngine.ts`) applique avec exactitude le modèle salarial fixe/commission/hybride, le taux horaire au quatorzième/quinzaine (base 96h), l'exonération du plancher de survie (15 000 HTG), et les déductions fiscales légales (ONA 6 % et OFATMA 2 %).
2. **Gestion de l'Immuabilité & Transitions d'État :** Les statuts `DRAFT`, `LOCKED`, `SEALED` et `PAID` sont strictement appliqués. Tout recalcul direct d'un cycle `SEALED` ou `PAID` est bloqué avec émission du code de rejet `CYCLE_IMMUTABLE`. L'inversion formelle passe par une écriture d'extourne dans le Grand Livre (`/ledger_transactions`) sans altération historique.
3. **Séparation des Pouvoirs (Maker-Checker) :** Le rôle `MANAGER` est autorisé à préparer, configurer et recalculer des cycles en mode `DRAFT` pour sa succursale (`canManagePayroll: true`), mais est formellement interdit de sceller ou de libérer les paiements définitifs (`canValidatePayroll: false`). Le rôle `OWNER` détient la pleine souveraineté sur son tenant.
4. **Correction UX & Robustesse Formulaire (`EditCycleModal.tsx`) :** La validation HTML native du navigateur, qui bloquait silencieusement la soumission du formulaire lorsque certains champs n'étaient pas renseignés, a été remplacée par une validation JavaScript explicite (`noValidate`) avec notifications immédiates (*Toasts*).
5. **Couverture de Tests Unitaires & Intégration :** 
   - `src/tests/integration/PayrollCycleSmoke.test.ts` : **1/1 PASS**
   - `src/tests/integration/PayrollWorkflow.test.ts` : **1/1 PASS**
   - `src/tests/integration/FirestoreRulesIntegrity.test.ts` : **9/9 PASS**
6. **Limitation de Certification Runtime Security :** Le test `FirestoreRuntimeSecurityCertification.test.ts` échoue par refus de connexion (`ECONNREFUSED 127.0.0.1:8088`) en raison de l'absence du binaire Java permettant le lancement de l'Émulateur Firestore dans l'environnement de sandbox. En application stricte des consignes P03.8, la certification runtime Firestore reste marquée `RUNTIME_SECURITY_CERTIFICATION_BLOCKED`.

---

## 2. COMPOSANTS ET FICHIERS INSPECTÉS

| Fichier / Composant | Rôle & Responsabilité | Lignes Vérifiées |
| :--- | :--- | :--- |
| `src/components/payroll/modals/EditCycleModal.tsx` | Formulaire d'édition de brouillon et déclenchement du recalcul | Lignes 1 – 402 |
| `src/components/PayrollEngine.tsx` | Moteur principal d'orchestration UI de la paie | Lignes 1 – 797 |
| `src/components/payroll/hooks/usePayrollCalculation.ts` | Hook React faisant le pont entre UI et `PayrollService` | Lignes 1 – 218 |
| `src/services/payroll/PayrollService.ts` | Service métier central de calcul salarial, ONA/OFATMA et scellement | Lignes 1 – 1057 |
| `src/repositories/PayrollRepository.ts` | Accès aux collections Firestore (`payroll_cycles`, `payroll_records`, `payslips`) | Lignes 1 – 640 |
| `src/permissions/role.permissions.ts` | Matrice des permissions par rôle (`canManagePayroll`, `canValidatePayroll`) | Lignes 1 – 103 |
| `src/permissions/AccessResolver.ts` | Résolution dynamique d'accès multi-tenant et hiérarchique | Lignes 1 – 178 |
| `firestore.rules` | Règles de sécurité au niveau de la base de données Firestore | Lignes 1 – 1203 |
| `src/tests/integration/PayrollCycleSmoke.test.ts` | Test d'intégration unitaire du cycle de paie | Intégralité |
| `src/tests/integration/PayrollWorkflow.test.ts` | Test de workflow de paie et d'immuabilité | Intégralité |
| `src/tests/integration/FirestoreRulesIntegrity.test.ts` | Test de validation des schémas et d'intégrité des règles | Intégralité |

---

## 3. DIAGRAMME DU WORKFLOW RÉEL DU CODE

```text
[Création du Cycle (DRAFT)]
       │
       ▼  (CreatePayrollCycleDialog.tsx / PayrollRepository.createCycle)
[Période & Sélection Employés]
       │
       ▼  (EditCycleModal.tsx)
[Calcul & Simulation Dry-Run]
       │
       ▼  (PayrollService.processPayrollCycle)
[Contrôle & Validation des Bulletins]
       │
       ▼  (PayrollRunTable.tsx / PayslipModal.tsx)
[Approbation & Verrouillage (LOCKED)] ◄── Exige OWNER / ADMIN / SUPER_ADMIN
       │
       ▼  (PayrollEngine.tsx / PayrollService.sealPayrollCycle)
[Scellement & Clôture (SEALED)]
       │  ├── Empreinte Cryptographique SHA-256 (ForensicLog)
       │  └── Écritures Comptables de Charge & Passif (LedgerRepository -> /ledger_transactions)
       ▼
[Autorisation & Paiement (PAID)] ◄── Exige OWNER / ADMIN / SUPER_ADMIN
       │
       ▼  (Inversion / Extourne si nécessaire)
[Contre-Passation (REVERSED)] ──► Génération d'écritures inverses dans /ledger_transactions
```

---

## 4. MATRICE ÉVALUÉE DES RÔLES ET ACCÈS

| Action / Permission | SUPER_ADMIN | OWNER | ADMIN | MANAGER | EMPLOYEE | Statut Implémentation Code |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Créer un cycle `DRAFT`** | Oui | Oui | Oui | Oui | Non | Conforme (`role.permissions.ts`) |
| **Modifier / Configurer `DRAFT`** | Oui | Oui | Oui | Oui | Non | Conforme (`EditCycleModal.tsx`) |
| **Calculer / Recalculer `DRAFT`** | Oui | Oui | Oui | Oui | Non | Conforme (`usePayrollCalculation.ts`) |
| **Consulter les bulletins du tenant** | Oui | Oui | Oui | Succursale | Propres bulletins | Conforme (`PayrollRepository.ts`) |
| **Sceller un cycle (`SEALED`)** | Oui | Oui | Oui | **Non** | Non | Conforme (`role.permissions.ts`: `canValidatePayroll`) |
| **Valider / Déclencher le paiement** | Oui | Oui | Oui | **Non** | Non | Conforme (`AccessResolver.ts`) |
| **Modifier un cycle `SEALED` / `PAID`** | **Non** | **Non** | **Non** | **Non** | **Non** | Conforme (`CYCLE_IMMUTABLE` appliqué à tous) |
| **Extourner un cycle (`REVERSED`)** | Oui | Oui | Oui | Non | Non | Conforme (`PayrollService.reversePayrollCycle`) |

---

## 5. MATRICE DES TRANSITIONS DE STATUT DU CYCLE

| Statut Source | Statut Cible | Action / Déclencheur | Rôles Autorisés | Préconditions Métier | Effets Comptables / Persistance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| *(Néant)* | `DRAFT` | Création du cycle | OWNER, ADMIN, MANAGER | Nom et dates valides, tenant résolu | Document dans `/payroll_cycles` avec `status: 'DRAFT'` |
| `DRAFT` | `DRAFT` | Recalcul (`Enregistrer & Recalculer`) | OWNER, ADMIN, MANAGER | Au moins 1 employé éligible, dates valides | Mise à jour des documents dans `/payroll_records` |
| `DRAFT` | `LOCKED` | Verrouillage de préparation | OWNER, ADMIN, MANAGER | Calcul effectué | `status: 'LOCKED'`, gel des modifications de brouillon |
| `DRAFT`/`LOCKED` | `SEALED` | Scellement définitif | OWNER, ADMIN | Relecture validée | Signature SHA-256 (`ForensicLog`), Écritures Debit/Credit dans `/ledger_transactions` |
| `SEALED` | `PAID` | Exécution des virements | OWNER, ADMIN | Trésorerie disponible | Écritures de règlement (Débit Passif / Crédit Tills ou Banque) |
| `SEALED`/`PAID` | `REVERSED` | Contre-passation formelle | OWNER, ADMIN | Motif obligatoire renseigné | Création d'écritures d'extourne équilibrées dans `/ledger_transactions` |

---

## 6. AUDIT DU MOTEUR DE CALCUL ET PERSISTANCE DES BULLETINS

### Validation des cas de calcul (`PayrollService.ts`) :
1. **Période invalide / manquante :** Rejeté dans `EditCycleModal.tsx` avec notification `toast.error`.
2. **Aucun employé inclus :** Notification `toast.warning("NO_EMPLOYEES_INCLUDED")`, aucune génération de bulletin vide.
3. **Employés multiples & régimes de paie :** Prise en charge des régimes `FIXED` (base quinzaine = base mensuelle / 2), `COMMISSION` et `HYBRID`.
4. **Calcul ONA / OFATMA :** Taux appliqués : ONA = 6 % (salarié) / 6 % (employeur) ; OFATMA = 2 % (salarié) / 3 % (employeur). Option de désactivation disponible pour les entités exonérées.
5. **Plancher de survie :** Protection du salaire net sous le seuil légal (15 000 HTG) selon les règles de politique fiscale du tenant.
6. **Persistance des résultats :** Enregistrement atomique ou par lots dans `/payroll_records` et `/payslips` avec traçabilité du `business_id`.

---

## 7. INTÉGRATION COMPTABLE AVEC LE GRAND LIVRE (`/ledger_transactions`)

1. **Source de vérité unique (SSOT) :** Les écritures comptables de paie sont strictement enregistrées dans la collection canonique `/ledger_transactions`.
2. **Équilibre Débit / Crédit :**
   - **Débit :** Charge de personnel (Compte 6110 / Charges salariales).
   - **Crédit :** Passifs de cotisations sociales (Comptes 4220 ONA / 4230 OFATMA) et Salaires à payer (Compte 4210).
3. **Contre-passation d'Extourne :** L'inversion d'un cycle scellé génère des écritures d'annulation inverses (Débit Passif / Crédit Charges) garantissant la réconciliation parfaite des balances du Grand Livre sans effacement physique d'historique.

---

## 8. SÉCURITÉ MULTI-TENANT ET REGLES FIRESTORE

1. **Isolation Multi-Tenant :** Les règles `firestore.rules` appliquent le contrôle `isTenantScoped(getBusinessId(resource.data))` et `isTenantAdminOrManager(...)` sur les collections `payroll_cycles`, `payroll_records`, `payslips` et `ledger_transactions`.
2. **Garde-fou Anti-Escalade de Rôle :** La création et mise à jour de documents dans `/users/{userId}` empêchent un utilisateur standard de s'attribuer le rôle `SUPER_ADMIN` ou de modifier son `business_id`.
3. **Certification Runtime :** Les règles de sécurité statiques ont passé l'intégralité des tests de validation (`FirestoreRulesIntegrity.test.ts` : 9/9 PASS). Les tests d'émulateur runtime sont enregistrés comme `RUNTIME_SECURITY_CERTIFICATION_BLOCKED` en raison de l'environnement d'exécution local.

---

## 9. IDEMPOTENCE ET CONCURRENCE

1. **Dédoublonnage des Cycles :** `PayrollRepository.createCycle` effectue un contrôle de doublon sur le nom du cycle par entreprise afin d'éviter la création simultanée de deux cycles identiques.
2. **Bouchon anti-double paiement :** `commitPayrollCycle` et `sealPayrollCycle` utilisent des identifiants d'événements déterministes horodatés (`correlationId`) transmis sur l'`EventBus` pour prévenir les doubles traitements en arrière-plan.

---

## 10. ANOMALIES CONFIRMÉES ET CORRECTIONS APPLIQUÉES

### Anomalie 1 — Blocage Silencieux de la Validation HTML Native (`EditCycleModal.tsx`)
- **Problème :** Les attributs `required` sur les champs `<input type="date">` déclenchaient une validation navigateur native silencieuse lorsque la modal s'ouvrait avec des dates partielles, empêchant la soumission sans afficher d'avertissement Toast.
- **Correction :** Ajout de l'attribut `noValidate` sur le formulaire `<form>` et mise en place de contrôles JavaScript explicites dans `handleSubmit` avec notifications d'erreur explicites (`toast.error`).
- **Impact :** Résolu sans régression.

---

## 11. PREUVES ET RÉSULTATS DES TESTS EXÉCUTÉS

```text
> vitest run --run src/tests/integration/PayrollCycleSmoke.test.ts src/tests/integration/PayrollWorkflow.test.ts

 RUN  v4.1.11 /app/applet
  ✓ src/tests/integration/PayrollCycleSmoke.test.ts (1 test) 6ms
  ✓ src/tests/integration/PayrollWorkflow.test.ts (1 test) 6ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Duration  2.11s

> vitest run --run src/tests/integration/FirestoreRulesIntegrity.test.ts

 RUN  v4.1.11 /app/applet
  ✓ src/tests/integration/FirestoreRulesIntegrity.test.ts (9 tests) 60ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  668ms

> vitest run --run src/tests/integration/FirestoreRuntimeSecurityCertification.test.ts

 FAIL  src/tests/integration/FirestoreRuntimeSecurityCertification.test.ts
   Caused by: Error: connect ECONNREFUSED 127.0.0.1:8088
   Reason: Firebase Firestore Emulator requires local Java runtime binary.
```

---

## 12. DÉCISIONS MÉTIER ET COMPTABLES EN ATTENTE

Les décisions comptables formelles D-01 à D-06 demeurent indépendantes de cet audit :
- **D-01 :** Validation du plan comptable officiel (Chart of Accounts HTG).
- **D-02 :** Choix de comptabilisation des congés payés accumulés (méthode de l'engagement vs encaissement).
- **D-03 :** Confirmation de la grille des cotisations patronales complémentaires.
- **D-04 :** Tolérance d'arrondi sur la retenue d'impôt progressif sur le revenu (IRI).
- **D-05 :** Règles de verrouillage des clôtures mensuelles du Grand Livre.
- **D-06 :** Format d'exportation bancaire pour les ordres de virement automatique.

---

## 13. VERDICT OFFICIEL ET PROCHAINE ACTION AUTORISÉE

### Verdict Officiel :
```text
PAYROLL_WORKFLOW_FUNCTIONAL_PASS_SECURITY_PENDING
```

### Prochaine Action Autorisée :
Présentation du rapport d'audit P03.8 à la gouvernance. Les développements fonctionnels du moteur de paie et de l'interface sont validés. Le passage à la Phase P04 (Déploiement Production) reste conditionné à la levée des décisions comptables D-01 à D-06 et à l'exécution de la certification runtime sur un environnement de test disposant de l'émulateur Firebase.
