# FINOPS ERP / FINAYITI FUSION — AUDIT REPORT RH-PROFILE-01
## Guichet Opérationnel : Profil RH et Pilotage Dynamique du Formulaire de Transaction

**Référence :** BUG-RH-PROFILE-01  
**ADR associé :** ADR-013 (`docs/decision-log.md`)  
**Date :** 23 Octobre 2026  
**Auteur :** AI Engineering Orchestrator / FINOPS ERP  
**Statut :** ACCEPTED & RESOLVED  
**Verdict :** `PASS — PROFILE-DRIVEN WORKFLOW VERIFIED`

---

## 1. Executive Summary & Verdict

Sur l'écran « Guichet Opérationnel — Nouvelle Transaction » (`src/components/ledger/CreateTransactionDialog.tsx`), les profils RH opérationnels (`VENDEUR`, `TELLER`, `POLYVALENT`, `HEAD`) étaient affichés sous forme de badges de sélection, mais ils ne pilotaient pas dynamiquement le formulaire de saisie :
- Le formulaire démarrait avec des valeurs codées en dur (`INCOME`, `Sales`, `1111`, `4000`), affichant un faux flux « Entrée en caisse (+1) » et un badge « Imputation Automatique » avant même qu'aucune opération métier ne soit sélectionnée.
- Cliquer sur un autre profil RH modifiait uniquement l'état cosmétique `operationalProfile` sans réinitialiser ni filtrer le formulaire.
- Un caissier (`TELLER`) pouvait soumettre une vente ou prestation de service (réservée au `VENDEUR`), et un vendeur pouvait initier un transfert d'argent sans blocage.
- N'importe quel utilisateur, quel que soit son rôle hiérarchique, pouvait cliquer sur les boutons de profil pour contourner les restrictions.

### Verdict : PASS — PROFILE-DRIVEN WORKFLOW VERIFIED
La remédiation ciblée a restauré l'intégrité opérationnelle de bout en bout :
1. **Pilotage strict par le catalogue** : Aucune valeur par défaut arbitraire. Le formulaire démarre vierge avec indicateur « En attente de sélection d'une opération » et « Sélection requise ».
2. **Matrice de ségrégation des tâches (SoD)** : Les opérations sont cloisonnées par profil RH selon la nomenclature de `TransactionMappingEngine`.
3. **Réinitialisation automatique en cas de changement de profil** : Tout changement de profil nettoie les opérations interdites et réinitialise les champs d'imputation.
4. **Verrouillage anti-escalade** : Seuls les superviseurs et la direction (`HEAD_TELLER`, `MANAGER`, `OWNER`, `SUPER_ADMIN`) peuvent basculer de profil en mode supervision. Les caissiers et vendeurs sont verrouillés sur leur profil d'assignation.
5. **Défense en profondeur au niveau page / backend** : `FinanceLedger.tsx` valide les limites du profil RH avant toute persistance dans le Grand Livre.
6. **Couverture de tests exhaustive** : 23 tests unitaires dédiés passent à 100% (`OperationalProfileWorkflow.test.ts`), portant la suite globale trésorerie à 137 tests réussis (0 régression). Compilation TypeScript et Linting passent à 100%.

---

## 2. Description du Problème (Bug RH-PROFILE-01)

### Symptômes Constatés
1. **Préremplissage décorrélé** :
   À l'ouverture du dialogue, l'état initial était :
   ```typescript
   // ANCIEN CODE VULNERABLE
   type: 'INCOME',
   category: 'Sales',
   debit_account: '1111',
   credit_account: '4000',
   transaction_type_code: ''
   ```
   Bien que `selectedTypeId` fût vide, la fonction calculait `flowInfo` sur `debit_account: '1111'` et affichait `+1 Entrée en caisse` et `Imputation Automatique`.
2. **Inertie du changement de profil** :
   Le clic sur `TELLER` ou `HEAD` exécutait seulement `setOperationalProfile(p)`. Les valeurs `type: 'INCOME'` et `category: 'Sales'` restaient dans le formulaire.
3. **Absence de validation à la soumission** :
   `handleSubmit` vérifiait uniquement le schéma Zod général sans contrôler si l'opération était autorisée pour `operationalProfile`.
4. **Vulnérabilité d'escalade horizontale** :
   Les boutons de sélection de profil étaient cliquables sans contrôle des droits du rôle connecté (`currentRole`).

---

## 3. Architecture & Flux de Données

### Avant Correction (Inerte)
```text
Utilisateur (Guichetier)
       ↓
Ouvre CreateTransactionDialog (formulaire prérempli en 'Sales' / 'INCOME')
       ↓
Clique sur bouton [TELLER] → setOperationalProfile('teller')
       ↓
Formulaire inchangé (category = 'Sales', type = 'INCOME')
       ↓
Enregistrement → Vente enregistrée par un caissier (Violation SoD)
```

### Après Correction (Pilotage Dynamique & Sécurisé)
```text
Utilisateur (Guichetier avec role = 'JUNIOR_TELLER')
       ↓
1. Résolution automatique : resolveOperationalProfile('JUNIOR_TELLER') → 'teller'
2. Contrôle anti-escalade : canSwitchProfile('JUNIOR_TELLER') = false → Boutons autres profils verrouillés (Cadenas)
3. État initial propre : type='', category='', débit='', crédit='' → "En attente de sélection"
       ↓
Filtrage Catalogue : filterTypesByProfile(allTypes, 'teller')
→ Seules les opérations Money Transfer, Mobile Transfer, FX apparaissent dans le dropdown
       ↓
Sélection Opération (ex. 1001 Dépôt Cash)
       ↓
Validation profil : isOperationAllowedForProfile(1001, 'teller') → OK
Auto-imputation : type='TRANSFER', category='Money Transfer', débit='1111', crédit='1200'
Indicateur de trésorerie : +1 Entrée en caisse (Imputation Automatique Validée)
       ↓
Soumission : handleSubmit
→ Validation Zod + Validation isOperationAllowedForProfile + Validation Règle Classe 1 / 4
       ↓
Enregistrement Page : handleSaveTransaction (FinanceLedger)
→ Validation rôle + Validation opérationnelle par TransactionMappingEngine
       ↓
Grand Livre (LedgerRepository.save) — Intégrité comptable garantie
```

---

## 4. Matrice de Résolution du Profil RH (`resolveOperationalProfile`)

Le profil RH est résolu de manière déterministe à partir du rôle système (`currentRole`) ou de l'intitulé du poste (`position`) :

| Rôle Système (`currentRole`) | Intitulé de Poste (`position`) | Profil RH Résolu | Justification |
|---|---|---|---|
| `OWNER`, `ADMIN`, `SUPER_ADMIN`, `MANAGER` | *N'importe lequel* | `polyvalent` | Accès superviseur complet aux opérations guichet |
| `HEAD_TELLER` | *N'importe lequel* | `head_teller` | Responsable guichet / coffre |
| *Tout rôle* | "Chef Caissier", "Head Teller", "Resp. Guichet" | `head_teller` | Détection par fonction métier RH |
| `SENIOR_TELLER`, `JUNIOR_TELLER` | *N'importe lequel* | `teller` | Caissier / Guichetier de guichet |
| *Tout rôle* | "Caissier", "Guichetier", "Teller" | `teller` | Détection par fonction métier RH |
| *Tout rôle* | "Vendeur", "Commercial", "Sales" | `vendeur` | Vendeur comptoir / commercial |
| Non défini / Rôle général | *N'importe lequel* | `vendeur` | **Moindre privilège** par défaut |

---

## 5. Matrice des Droits par Profil RH (`isOperationAllowedForProfile`)

| Catégorie Métier | Exemples de Codes | Vendeur | Teller | Polyvalent | Head Teller | Manager / Owner |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **Sales (Ventes Comptant)** | `3001` | **OUI** | **NON** | **OUI** | **OUI** | **OUI** |
| **Services (Prestations)** | `3101` | **OUI** | **NON** | **OUI** | **OUI** | **OUI** |
| **Money Transfer (Dépôts / Retraits / Envois)** | `1001`, `2001`, `4001`, `4002` | **NON** | **OUI** | **OUI** | **OUI** | **OUI** |
| **Mobile Transfer (Recharge Mobile)** | `5001` | **NON** | **OUI** | **OUI** | **OUI** | **OUI** |
| **Currency Exchange (Achat / Vente Devises)** | `80001` | **NON** | **OUI** | **OUI** | **OUI** | **OUI** |
| **Operating Expenses (Menues Dépenses)** | `6001` | **NON** | **NON** | **NON** | **OUI** | **OUI** |
| **Internal Transfers (Coffre / Caisse)** | `1910` | **NON** | **NON** | **NON** | **OUI** | **OUI** |
| **Clearing (Compensation Générale)** | `2910` | **NON** | **NON** | **NON** | **NON** | **OUI** |

---

## 6. Sécurité du Changement de Profil (`canSwitchProfile` & `isProfileSwitchAllowed`)

Pour empêcher l'usurpation de profil et l'escalade de privilèges :

1. **Opérateurs de guichet (`JUNIOR_TELLER`, `SENIOR_TELLER`, `EMPLOYEE`)** :
   - `canSwitchProfile()` renvoie `false`.
   - Les boutons de profil non attribués sont grisés avec une icône de cadenas `Lock`.
   - Les tentatives de clic direct sont rejetées avec toast d'accès refusé.
2. **Superviseur Guichet (`HEAD_TELLER`)** :
   - `canSwitchProfile()` renvoie `true`.
   - Peut naviguer entre `vendeur`, `teller`, et `head_teller` pour assister ou remplacer les opérateurs de son guichet.
   - Ne peut pas basculer sur les opérations de direction générale.
3. **Direction (`OWNER`, `MANAGER`, `SUPER_ADMIN`)** :
   - Accès de supervision universel.
   - Si une opération est sélectionnée et que le profil est basculé vers un profil qui l'interdit, l'opération est **immédiatement purgée** du formulaire.

---

## 7. Rapprochement Comptable et Préservation de la Partie Double

Le moteur vérifie en temps réel les règles fondamentales de la comptabilité générale :
1. **Sens du flux de trésorerie (`calculateFlowBehavior`)** :
   - Débit compte `1111` / `1121` (Trésorerie) $\rightarrow$ `+1` (Entrée en caisse).
   - Crédit compte `1111` / `1121` (Trésorerie) $\rightarrow$ `-1` (Sortie de caisse).
   - Aucun compte de trésorerie mouvementé $\rightarrow$ `0` (Sans mouvement de trésorerie).
2. **Validation des Ventes et Services (`validateSalesAndServicesRule`)** :
   - Débit obligatoire sur un compte de Classe 1 (Actifs disponibles / Caisse).
   - Crédit obligatoire sur un compte de Classe 4 ou 7 (Revenus / Produits d'exploitation).
   - Débit et Crédit doivent être strictement distincts.

---

## 8. Détail des Fichiers Modifiés et Créés

| Fichier | Nature | Modifications apportées |
|---|---|---|
| `src/services/cash/transactionMappingEngine.ts` | **Modification** | Ajout de `resolveOperationalProfile`, `canSwitchProfile`, `isProfileSwitchAllowed`, `isOperationAllowedForProfile`, et signature générique pour `filterTypesByProfile`. |
| `src/components/ledger/CreateTransactionDialog.tsx` | **Modification** | Élimination du préremplissage en dur ; réinitialisation complète de l'état ; intégration des contrôles de profil RH ; verrouillage visuel des profils non autorisés ; gestion du flux en attente ; validation `handleSubmit`. |
| `src/pages/FinanceLedger.tsx` | **Modification** | Défense en profondeur dans `handleSaveTransaction` vérifiant les limites opérationnelles avant écriture. |
| `docs/decision-log.md` | **Documentation** | Enregistrement formel de l'ADR-013. |
| `src/tests/unit/cash/OperationalProfileWorkflow.test.ts` | **Création** | Suite de tests unitaires (23 tests) validant la résolution, le filtrage, les interdictions, les permissions de switch et la comptabilité. |
| `docs/audits/FINOPS_RH_PROFILE_OPERATIONAL_DESK_AUDIT.md` | **Documentation** | Rapport d'audit complet RH-PROFILE-01. |

---

## 9. Résultats de Validation Automatisée

### 1. Tests Unitaires Dédiés (`OperationalProfileWorkflow.test.ts`)
```bash
npx vitest run src/tests/unit/cash/OperationalProfileWorkflow.test.ts
```
```text
 ✓ src/tests/unit/cash/OperationalProfileWorkflow.test.ts (23 tests) 16ms
 Test Files  1 passed (1)
      Tests  23 passed (23)
   Duration  456ms
```

### 2. Régression Complète du Domaine Cash (`src/tests/unit/cash/`)
```bash
npx vitest run src/tests/unit/cash/
```
```text
 ✓ src/tests/unit/cash/CashAdapters.test.ts (21 tests)
 ✓ src/tests/unit/cash/CashSettlementAndMultiCurrency.test.ts (13 tests)
 ✓ src/tests/unit/cash/Phase16BankReconciliationOperationalValidation.test.ts (8 tests)
 ✓ src/tests/unit/cash/Phase15BankReconciliationAudit.test.ts (9 tests)
 ✓ src/tests/unit/cash/NormalizedCashMovement.test.ts (25 tests)
 ✓ src/tests/unit/cash/OperationalProfileWorkflow.test.ts (23 tests)
 ✓ src/tests/unit/cash/CashBasisEngine.test.ts (8 tests)
 ✓ src/tests/unit/cash/Phase17BankReconciliationEndToEndValidation.test.ts (5 tests)
 ✓ src/tests/unit/cash/BIHarmonizationNonRegression.test.ts (6 tests)
 ✓ src/tests/unit/cash/P11CashClosureRemediation.test.ts (7 tests)
 ✓ src/tests/unit/cash/P12MockDataRemediation.test.ts (5 tests)
 ✓ src/tests/unit/cash/FinancialReconciliation.test.ts (4 tests)
 ✓ src/tests/unit/cash/CashViewModel.test.ts (3 tests)

 Test Files  13 passed (13)
      Tests  137 passed (137)
   Duration  9.88s
```

### 3. Compilation TypeScript & Vérification du Build
```text
Build succeeded - the applet is compiled.
```

### 4. Contrôle Linter & Typage Strict (`npm run lint` / `tsc --noEmit`)
```text
Linting completed successfully.
Exit code: 0
```

---

## 10. Conclusion et Recommandations

L'anomalie **RH-PROFILE-01** est intégralement résolue. Le profil RH opérationnel pilote désormais de manière déterministe et sécurisée la liste des opérations disponibles, les comptes comptables débit/crédit, les flux de caisse, et empêche toute violation des règles de ségrégation des tâches.

Aucune modification de schéma Firestore ni de règle de sécurité n'a été nécessaire, préservant la compatibilité descendante et l'isolation des données de production.
