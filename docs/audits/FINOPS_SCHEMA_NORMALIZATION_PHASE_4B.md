# FINOPS ERP / FINAYITI FUSION — PHASE 4B : PRÉPARATION DE LA NORMALISATION ET PLAN DE MIGRATION CONTRÔLÉE

**Version :** 1.0  
**Statut :** Rapport d'Audit Approfondi & Spécification des Contrats Canoniques  
**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date d'exécution :** 12 Octobre 2026  
**Fichier produit :** `docs/audits/FINOPS_SCHEMA_NORMALIZATION_PHASE_4B.md`  
**Verdict Global :** `PHASE_4B_PLAN_WITH_LIMITATIONS`  
**Contrainte de Phase :** READ-ONLY strict — 0 mutation métier, 0 modification de code, 0 migration de base de données.

---

## 1. RÉSUMÉ EXÉCUTIF

Le présent rapport de la **Phase 4B** formalise la préparation technique et le plan de migration contrôlée pour la normalisation globale du schéma de données de **FINOPS ERP / FINAYITI Fusion**. Il s'appuie sur la cartographie de la Phase 4A et définit, pour chacun des sept groupes de champs identifiés, les contrats canoniques de référence, les dépendances à préserver, le protocole de détection de conflits à sec (dry-run) et la stratégie de dépréciation progressive.

### Statut Général & Limites Dûment Reconnues :
* **Précision Statique du Code (100% OK)** : Les 7 groupes de champs ont été rigoureusement analysés dans leurs types (`src/types.ts`), leurs convertisseurs (`src/utils/caseConverter.ts`), leurs repositories et leurs règles de sécurité.
* **Limites de Validation Runtime (`PHASE_4B_PLAN_WITH_LIMITATIONS`)** :
  1. L'inspection des documents réels stockés en base de données de production n'a pas été effectuée directement (analyse 100% basée sur le code source).
  2. L'exécution des tests d'intégration des règles Firestore via l'émulateur demeure bloquée par l'absence de l'environnement Java (`sh: 1: java: not found`) dans le conteneur.
  3. Les vulnérabilités P0 de la Phase 4 (`PAY-INT-001` et `PAY-INT-002` sur la séparation des pouvoirs et l'immutabilité des cycles) demeurent ouvertes tant que les correctifs ne sont pas appliqués en Phase 4C.

---

## 2. LES SEPT CONTRATS CANONIQUES SPÉCIFIÉS

### GROUPE 1 (P0) — IDENTITÉ DU TENANT (`business_id` / `businessId` / `tenantId`)
* **Analyse de Sémantique** :
  - `business_id` (`snake_case`) : Identifiant persistant primaire du document entreprise dans Firestore.
  - `businessId` (`camelCase`) : Propriété de domaine TypeScript primaire dans les objets React et services.
  - `tenantId` : Clé historique utilisée dans les revendications JWT (`request.auth.token.tenantId`) et comme alias de fallback dans `getUserBusinessId()` (`firestore.rules` L46-49).
* **Contrat Canonique Spécifié** :
  - **Firestore Storage** : `business_id` (obligatoire, non vide).
  - **Domaine Application** : `businessId` (obligatoire, non vide).
  - **Conversion** : Via `toCamelCase` / `toSnakeCase` (`src/utils/caseConverter.ts`).
  - **Protection Multi-Tenant** : Si `business_id` et `businessId` sont tous deux fournis, ils doivent être strictement égaux (`business_id === businessId`). Tout décalage lève immédiatement `[MultiTenancyViolation]` et rejette l'opération.
  - **Règle d'Or** : `tenantId` ne doit JAMAIS être sélectionné silencieusement s'il diverge de `business_id`.

### GROUPE 2 (P1) — IDENTIFIANTS DES CYCLES DE PAIE (`cycleId` / `payroll_cycle_id`)
* **Analyse de Sémantique** :
  - `cycleId` : Clé de liaison canonique dans le modèle `PayrollRecord` (`src/types.ts` L258).
  - `payroll_cycle_id` : Variante `snake_case` historique dans la collection `payroll_records` et `payslips`.
* **Contrat Canonique Spécifié** :
  - **Champ Canonique** : `cycleId`.
  - **Double Écriture Transitoire (Phase B/C)** :
    Lors de `savePayrollRecords`, écrire `cycleId: cycleIdVal` ET `payroll_cycle_id: cycleIdVal` pour garantir que les requêtes historiques de suppression ou de nettoyage ne laissent pas de bulletins orphelins.
  - **Recherche Bivalente** :
    ```typescript
    let snap = await getDocs(query(colRef, where("business_id", "==", bizId), where("cycleId", "==", cycleId)));
    if (snap.empty) {
      snap = await getDocs(query(colRef, where("business_id", "==", bizId), where("payroll_cycle_id", "==", cycleId)));
    }
    ```

### GROUPE 3 (P1) — SALAIRES ET CONTRATS (`baseSalary` / `salaryBaseHtg` / `base_salary_cents` / `contract.baseSalary`)
* **Analyse de Sémantique & Incompatibilité d'Unités** :
  - `baseSalary` : Salaire contractuel de base exprimé en Gourdes entières (`number`, ex: `15000`).
  - `salaryBaseHtg` : Alias explicite en Gourdes dans les formulaires d'employés (`src/types.ts` L118).
  - `base_salary_cents` : Représentation en centimes entiers pour les calculs de paie de précision (`number`, ex: `1500000`).
  - `contract.baseSalary` : Propriété dans le sous-document contrat de travail.
* **Contrat Canonique Spécifié** :
  - **Domaine IHM / Modèle Employee** : `baseSalary` (exprimé en Gourdes entières, HTG).
  - **Domaine Calcul / Stockage Haute Précision** : `base_salary_cents = Math.round(baseSalary * 100)`.
  - **Règle d'Or anti-facteur 100** : Interdiction absolue d'assigner directement `base_salary_cents` à `baseSalary` sans division par 100.
  - **Ordre de Résolution Canonique** :
    `contract?.baseSalary ?? emp.baseSalary ?? emp.salaryBaseHtg ?? (emp.base_salary_cents ? emp.base_salary_cents / 100 : 0)`.

### GROUPE 4 (P2) — DATES DE PÉRIODE (`startDate` / `endDate` / `periodStart` / `periodEnd`)
* **Analyse de Sémantique** :
  - `startDate` & `endDate` : Dates calendaires canoniques de la période de paie (`YYYY-MM-DD`).
  - `periodStart` & `periodEnd` (ou `period_start` / `period_end`) : Libellés historiques dans les DTO d'export PDF et fiches de paie.
  - `effectiveAccountingDate` : Date d'effet comptable de la transaction dans le Grand Livre (ex: 15 du mois). **CONCEPT DISTINCT — NE PAS FUSIONNER AVEC `startDate`**.
* **Contrat Canonique Spécifié** :
  - **Canonique Domaine** : `startDate` et `endDate` au format ISO 8601 (`YYYY-MM-DD`).
  - **Contrainte de Cohérence Backend** : Obligation d'appliquer la validation `new Date(startDate) <= new Date(endDate)` dans `PayrollRepository.saveCycle` et `updateCycle`.

### GROUPE 5 (P0) — MONTANTS COMPTABLES DU GRAND LIVRE (`amount` / `amount_cents` / `amountCents`)
* **Analyse de Sémantique** :
  - `amount` : Montant en Gourdes ou USD (`number`, ex: `1250.50`).
  - `amount_cents` : Montant en centimes entiers (`number`, ex: `125050`), évitant toute erreur d'arrondi à la virgule flottante.
* **Contrat Monétaire Canonique Spécifié** :
  - **Stockage Persistant & Rapprochement** : `amount_cents` (`number` entier).
  - **Représentation Rétrocompatible Domaine** : `amount = amount_cents / 100`.
  - **Contrainte Anti-Corruption** :
    ```typescript
    const amount_cents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);
    const amount = tx.amount || (amount_cents / 100);
    ```
  - **Devise** : Doit être portée par le champ explicite `currency: "HTG" | "USD"`. Interdiction de fusionner des montants de devises différentes.

### GROUPE 6 (P2) — COMPTES DÉBIT ET CRÉDIT (`debit_account` / `debitAccount` / `credit_account` / `creditAccount`)
* **Analyse de Sémantique** :
  - Simple différence de convention de nommage (`snake_case` pour Firestore, `camelCase` pour TypeScript).
* **Contrat Canonique Spécifié** :
  - **Storage** : `debit_account` et `credit_account` (Numéros du Plan Comptable Général, ex: `"6110"`, `"5120"`).
  - **Domain** : `debitAccount` et `creditAccount`.
  - **Validation d'Équilibre** : Chaque écriture du Grand Livre doit être équilibrée (`Total Débits = Total Crédits`).

### GROUPE 7 (P1) — IDENTITÉ UTILISATEUR & AUTH (`uid` / `firebase_uid` / `firebaseUid`)
* **Analyse de Sémantique** :
  - Identifiant unique d'authentification Firebase Auth (`request.auth.uid`).
* **Contrat Canonique Spécifié** :
  - **Storage** : `firebase_uid`.
  - **Domain** : `uid`.
  - **Alignement Mapper** : `mapEmployee` et `mapUserProfile` garantissent la présence des deux clés lors des lectures/écritures.

---

## 3. PLAN DE MIGRATION FUTURE EN 7 ÉTAPES (INSPECTÉ & NON EXÉCUTÉ)

1. **Étape A — Formalisation des Contrats Canoniques** : Publication des interfaces de types à double écriture.
2. **Étape B — Rapport de Conflit à Sec (Dry-Run)** : Exécution d'un script d'audit en lecture seule comptabilisant les documents conformes, historiques et contradictoires.
3. **Étape C — Prévisualisation des Transformations** : Génération d'un journal d'impact montrant les modifications prévues sans altérer la base de données.
4. **Étape D — Migration Isolée & Idempotente par Lots** : Traitement par lots (batches de 500 documents max) avec système de sauvegarde et de reprise sur erreur.
5. **Étape E — Contrôle d'Intégrité post-Migration** : Vérification du rapprochement financier et de l'isolation multi-tenant.
6. **Étape F — Période de Dépréciation** : Maintien des lectures sur champs historiques pendant une fenêtre d'observation.
7. **Étape G — Suppression des Champs Secondaires** : Retrait définitif des colonnes historiques uniquement après autorisation formelle.

---

## 4. TESTS REQUIS POUR LES PHASES ULTÉRIEURES

* **Tests de Cohérence d'Unité Monétaire** : Vérifier que `amount_cents = Math.round(amount * 100)` sans jamais altérer les montants d'un facteur 100.
* **Tests de Rejet des Conflits Multi-Tenant** : Vérifier la levée de `[MultiTenancyViolation]` lorsque `business_id !== businessId`.
* **Tests d'Immutabilité et de Séparation des Pouvoirs** : Vérifier qu'un `MANAGER` ne peut pas exécuter `sealCycleAtomic` ni modifier un cycle scellé (Correctifs Phase 4C requis).
* **Tests de Non-Régression de la Paie** : Vérifier le calcul exact des fiches de paie sur le jeu de données étalon.

---

## 5. VERDICT FINAL OBLIGATOIRE

```text
VERDICT GLOBAL : PHASE_4B_PLAN_WITH_LIMITATIONS
```

### Justification du Verdict :
Les contrats canoniques et les plans de migration des 7 groupes de champs ont été entièrement définis et documentés avec une rigueur absolue, en garantissant l'absence totale de mutation. La qualification `WITH_LIMITATIONS` reflète la neutralité scientifique face à l'impossibilité d'inspecter les documents réels de production et d'exécuter l'émulateur Firestore en l'absence du runtime Java.

### Confirmation des Engagements :
* **Aucun code source n'a été modifié.**
* **Aucun test n'a été altéré.**
* **Aucun champ n'a été renommé ni supprimé.**
* **Aucun document Firestore n'a été créé, modifié ou supprimé.**
* **Aucune règle `firestore.rules` n'a été modifiée.**
