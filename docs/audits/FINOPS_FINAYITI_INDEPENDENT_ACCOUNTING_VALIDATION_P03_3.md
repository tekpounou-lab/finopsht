# FINOPS × FINAYITI — PROMPT 03.3 — INDEPENDENT ACCOUNTING VALIDATION GATE
## Rapport d'Audit Comptable Indépendant et Contradictoire de la Spécification P03.2

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Mode :** Audit indépendant, strictement en lecture seule (READ-ONLY)  
**Référence directe :** `docs/audits/FINOPS_FINAYITI_CHART_OF_ACCOUNTS_RESOLUTION_P03_2.md`  
**Livrable unique :** `docs/audits/FINOPS_FINAYITI_INDEPENDENT_ACCOUNTING_VALIDATION_P03_3.md`

---

## 1. RÉSUMÉ EXÉCUTIF

Le présent rapport constitue l'audit contradictoire et indépendant de la proposition de résolution du plan comptable et du modèle d'écritures rédigés dans le document **PROMPT 03.2** (`docs/audits/FINOPS_FINAYITI_CHART_OF_ACCOUNTS_RESOLUTION_P03_2.md`).

L'objectif de cet audit est d'évaluer la validité théorique, technique et pratique des propositions de P03.2 en les confrontant directement au code source (`src/`), aux types TypeScript, aux repositories Firestore, aux moteurs comptables et à la suite de tests Vitest réellement présents dans le dépôt.

### Verdict Global Choisis
```
===============================================================================
VERDICT FINAL : ACCOUNTING_VALIDATION_READY_WITH_BLOCKERS
===============================================================================
Explication : Le modèle théorique de résolution du plan comptable et les schémas
d'écritures en partie double définis dans P03.2 sont scientifiquement et
comptablement COHÉRENTS. Cependant, des CONDITIONS BLOQUANTES (P0/P1) doivent
être résolues avant tout démarrage d'implémentation (P04) :
 1. Les comptes proposés (1020, 1030, 1080, 2010, 2150, 2210, 2220, 2300, 6680,
    6780, 7680, 7780) n'existent PAS ENCORE dans le code de production (src/constants/finance.ts).
 2. La couche d'alias dynamique pour la rétrocompatibilité n'est pas encore codée.
 3. Les règles de sécurité Firestore côté serveur (firestore.rules) pour les guichets
    et coffres doivent être spécifiées.
 4. Les tests d'intégration en environnement réel échouent sans émulateur Firestore (PERMISSION_DENIED).
===============================================================================
```

---

## 2. PÉRIMÈTRE ET LIMITES DE L'AUDIT

### 2.1 Périmètre d'Inspection Code & Tests
L'audit a procédé à la lecture intégrale et à l'analyse statique/dynamique des fichiers suivants :
- **Constantes financières & SSOT** : `src/constants/finance.ts`
- **Types & Schémas comptables** : `src/types/accounting.ts`, `src/types.ts`
- **Moteur comptable & Équilibre** : `src/services/AccountingEngine.ts`
- **Accès données Grand Livre** : `src/repositories/LedgerRepository.ts`
- **Domaine Caisse & Normalisation** : `src/domains/cash/types/NormalizedCashMovement.ts`, `src/domains/cash/adapters/*`
- **Filtres & Rapports CFO/BI** : `src/services/cfo/LedgerFilterEngine.ts`, `src/services/FinancialSnapshotBuilder.ts`
- **Suite de tests Vitest** : `src/tests/unit/AccountingEngine.test.ts`, `src/tests/unit/FinanceConstants.test.ts`, `src/tests/unit/cash/*`

### 2.2 Strict Respect du Mode Lecture Seule (Read-Only)
- **Aucune modification de code de production** n'a été effectuée.
- **Aucune écriture ou mutation dans Firestore** n'a été exécutée.
- **Aucune règle de sécurité** `firestore.rules` n'a été altérée.
- **Aucun déploiement** n'a été déclenché.

### 2.3 Limites Méthodologiques Observées dans l'Environnement
- **Indisponibilité de l'Émulateur Firestore Local (`@firebase/rules-unit-testing`)** : L'exécution directe de `vitest run` sur les tests d'intégration tentant des accès réseau non-mockés à Firestore échoue avec l'erreur `7 PERMISSION_DENIED: Missing or insufficient permissions.`.
- **Preuve par Anayse du Code et Tests Unitaires Pures** : En l'absence d'émulateur Firestore actif, les assertions transactionnelles Firestore (concurrence, verrous distributed) sont documentées comme **non vérifiées sur émulateur** mais validées par analyse logique du code du `LedgerRepository`.

---

## 3. INVENTAIRE DES PREUVES ET CLASSIFICATION DES AFFIRMATIONS DE P03.2

Chaque affirmation contenue dans le rapport P03.2 a été rigoureusement classée selon la grille du protocole P03.3.

| N° | Affirmation du Rapport P03.2 | Classification P03.3 | Preuve dans le Dépôt / Fichier & Ligne | Justification Détaillée |
|---|---|---|---|---|
| **1** | Le plan comptable actuel de FINOPS (`CHART_OF_ACCOUNTS`) contient des collisions sur les préfixes 2100, 3000, 5100, 5200. | `VERIFIED` | `src/constants/finance.ts` (L. 138-169) | Vérifié. `2100_PAYROLL_CLEARING` et `2100_ONA_TAXES_PAYABLE` partagent le même préfixe string `2100`. De même pour 3000, 5100 et 5200. |
| **2** | Les nouveaux comptes `1020_TILL_CASH`, `1030_SAFE_CASH`, `1080_CASH_IN_TRANSIT`, `2010_CARD_CLEARING`, `2150_MONEYGRAM_CLEARING`, `2210_ONA_TAXES_PAYABLE`, `2220_OFATMA_TAXES_PAYABLE`, `2300_PAYROLL_CLEARING`, `6680_REALIZED_FX_LOSS`, `6780_CASH_DISCREPANCY_LOSS`, `7680_REALIZED_FX_GAIN`, `7780_CASH_DISCREPANCY_GAIN` existent dans l'application. | `CONTRADICTED` / `NOT_VERIFIED` | `src/constants/finance.ts` (L. 138-169) | Ces comptes sont présentés dans la proposition P03.2 mais n'existent **PAS ENCORE** dans le code TS de production. `src/constants/finance.ts` contient toujours `2100_ONA_TAXES_PAYABLE` et `2110_OFATMA_TAXES_PAYABLE`. |
| **3** | Un calque d'alias dynamique existe dans le code pour préserver la rétrocompatibilité. | `CONTRADICTED` | `src/services/AccountingEngine.ts` (L. 40-90) | Aucune fonction d'alias dynamique (`resolveLegacyAccountCode`) n'est actuellement présente dans `AccountingEngine.ts`. |
| **4** | Le succès du build (`compile_applet`) et du lint (`lint_applet`) prouve la conformité et l'exactitude comptables. | `CONTRADICTED` | `package.json` (L. 11 `tsc --noEmit`) | L'analyse TypeScript vérifie la syntaxe et la typographie, mais ne valide pas l'équilibre Débit = Crédit ou la logique métier financière. |
| **5** | Les transactions du grand livre sont immuables et leur annulation s'effectue par contre-passation équilibrée. | `VERIFIED` | `src/repositories/LedgerRepository.ts` (L. 34-94 `createReversalEntry`) | Vérifié. La fonction `createReversalEntry` inverse strictement les comptes Débit/Crédit et conserve les montants et dates. |
| **6** | La classification des comptes de trésorerie s'appuie sur le préfixe de classe 10. | `VERIFIED` | `src/domains/cash/types/NormalizedCashMovement.ts` (L. 104-120 `TreasuryClassification`) | Vérifié. Le moteur de classification identifie `1000_CASH`, `1010_BANK` et tout code commençant par `10`. |

---

## 4. AUDIT A — EXISTENCE ET EXHAUSTIVITÉ DU PLAN COMPTABLE

Analyse détaillée du statut réel de chaque compte dans le dépôt :

| Code de Compte Audité | Libellé dans P03.2 | Statut de Présence dans le Code | Emplacement Exact / Symbole | Référencé par Services / Tests |
|---|---|---|---|---|
| `1000_CASH` | Caisse Générale | **EXISTE** | `src/constants/finance.ts` L.140 | `AccountingEngine`, `NormalizedCashMovement`, Tests |
| `1010_BANK` | Banque | **EXISTE** | `src/constants/finance.ts` L.141 | `AccountingEngine`, `LedgerRepository`, Tests |
| `1020_TILL_CASH` | Caisse Guichet | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `1030_SAFE_CASH` | Coffre-Fort | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `1080_CASH_IN_TRANSIT` | Fonds en Transit | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `1200_ACCOUNTS_RECEIVABLE` | Clients / Créances | **EXISTE** | `src/constants/finance.ts` L.142 | `AccountingEngine` (Invoice Journal) |
| `1300_EMPLOYEE_ADVANCES` | Avances Personnel | **EXISTE** | `src/constants/finance.ts` L.143 | `AccountingEngine` (Payroll Journal) |
| `2000_ACCOUNTS_PAYABLE` | Fournisseurs | **EXISTE** | `src/constants/finance.ts` L.146 | `AccountingEngine` |
| `2010_CARD_CLEARING` | Compensation Cartes | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `2150_MONEYGRAM_CLEARING` | Clearing MoneyGram | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `2200_TAXES_PAYABLE` | Taxes à Payer | **EXISTE** | `src/constants/finance.ts` L.150 | `AccountingEngine` (TVA Invoice) |
| `2210_ONA_TAXES_PAYABLE` | Retenues ONA | **PROPOSÉ (Code actuel: 2100)** | `src/constants/finance.ts` L.148 | Utilise actuellement `2100_ONA_TAXES_PAYABLE` |
| `2220_OFATMA_TAXES_PAYABLE` | Cotisations OFATMA | **PROPOSÉ (Code actuel: 2110)** | `src/constants/finance.ts` L.149 | Utilise actuellement `2110_OFATMA_TAXES_PAYABLE` |
| `2300_PAYROLL_CLEARING` | Attente Paie | **PROPOSÉ (Code actuel: 2100)** | `src/constants/finance.ts` L.147 | Utilise actuellement `2100_PAYROLL_CLEARING` |
| `5000_PAYROLL_EXPENSE` | Masse Salariale Brute | **EXISTE** | `src/constants/finance.ts` L.161 | `AccountingEngine` (Payroll Journal) |
| `5010_EMPLOYER_TAX_EXPENSE` | Charges Patronales | **PROPOSÉ (Code actuel: 5110)** | `src/services/AccountingEngine.ts` L.513 | Utilise actuellement `5110_EMPLOYER_TAX_EXPENSE` |
| `5100_RENT_EXPENSE` | Loyer | **EXISTE** | `src/constants/finance.ts` L.164 | `src/constants/finance.ts` |
| `5200_UTILITIES` | Eau / Électricité | **EXISTE** | `src/constants/finance.ts` L.165 | `src/constants/finance.ts` |
| `5210_ADMINISTRATIVE_EXPENSE`| Frais Administratifs | **PROPOSÉ (Code actuel: 5200)** | `src/constants/finance.ts` L.166 | Utilise actuellement `5200_ADMINISTRATIVE_EXPENSE` |
| `5900_GENERAL_EXPENSES` | Dépenses Générales | **EXISTE** | `src/constants/finance.ts` L.167 | `AccountingEngine` (Default Expense) |
| `6680_REALIZED_FX_LOSS` | Perte de Change FX | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `6780_CASH_DISCREPANCY_LOSS` | Manquant de Caisse | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `7680_REALIZED_FX_GAIN` | Gain de Change FX | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |
| `7780_CASH_DISCREPANCY_GAIN` | Excédent de Caisse | **PROPOSÉ (NON PRÉSENT)** | Absent du code TS | Uniquement cité dans `P03.2.md` |

---

## 5. AUDIT B — VALIDITÉ DES ÉCRITURES EN PARTIE DOUBLE

L'audit a vérifié la cohérence arithmétique et comptable des 7 schémas d'écritures proposés dans P03.2. Chaque schéma est illustré par un exemple numérique hypothétique.

### B1. Approvisionnement du Guichet depuis le Coffre (Till Replenishment)
- **Événement déclencheur** : Demande d'ouverture ou rechargement de caisse guichet `$till_01`.
- **Formule Débit / Crédit** :
  - **Débit** : `1020_TILL_CASH` (Caisse Guichet `$till_01`) : `$amount`
  - **Crédit** : `1030_SAFE_CASH` (Coffre-Fort `$safe_01`) : `$amount`
- **Exemple hypothétique** : 50,000 HTG transférés du coffre au guichet.
  - Débit `1020_TILL_CASH` = 50,000 HTG | Crédit `1030_SAFE_CASH` = 50,000 HTG.
  - **Équilibre** : Débit (50,000) = Crédit (50,000). Total liquidité entreprise inchangé.

### B2. Versement du Guichet au Coffre (Vault Sweep)
- **Événement déclencheur** : Délestage de fin de journée du guichet `$till_01`.
- **Formule Débit / Crédit** :
  - **Débit** : `1030_SAFE_CASH` (Coffre-Fort `$safe_01`) : `$amount`
  - **Crédit** : `1020_TILL_CASH` (Caisse Guichet `$till_01`) : `$amount`
- **Exemple hypothétique** : 120,000 HTG versés au coffre.
  - Débit `1030_SAFE_CASH` = 120,000 HTG | Crédit `1020_TILL_CASH` = 120,000 HTG.
  - **Équilibre** : Débit (120,000) = Crédit (120,000).

### B3. Transfert Inter-Succursales (Inter-Branch via Cash-in-Transit)
- **Événement déclencheur** : Transfert de fonds de la Succursale A vers la Succursale B.
- **Étape 1 (Expédition)** :
  - Débit `1080_CASH_IN_TRANSIT` = `$amount` | Crédit `1030_SAFE_CASH` (Succursale A) = `$amount`
- **Étape 2 (Réception)** :
  - Débit `1030_SAFE_CASH` (Succursale B) = `$amount` | Crédit `1080_CASH_IN_TRANSIT` = `$amount`
- **Exemple hypothétique** : 200,000 HTG en transit.
  - Solde net de `1080_CASH_IN_TRANSIT` après réception = **0.00 HTG**. Aucun gain ni perte généré.

### B4. Change USD/HTG (Manuel au Guichet)
- **Événement déclencheur** : Vente de 100 USD au client à 135 HTG/USD (Taux officiel comptable = 132 HTG/USD).
- **Formule Débit / Crédit (Écritures Multi-Devises isolées)** :
  - Débit `1020_TILL_CASH` [Devise: HTG] = 13,500 HTG (Encaissement client)
  - Crédit `1020_TILL_CASH` [Devise: USD] = 100 USD (Valorisé à 13,200 HTG au taux officiel)
  - Crédit `7680_REALIZED_FX_GAIN` [Devise: HTG] = 300 HTG (Marge de change réalisée)
- **Équilibre** : Débit (13,500) = Crédit (13,200 + 300) = 13,500 HTG.

### B5. Opérations MoneyGram (Clearing)
- **Événement déclencheur** : Envoi d'un mandat de 10,000 HTG avec 500 HTG de frais de commission.
- **Formule Débit / Crédit** :
  - Débit `1020_TILL_CASH` = 10,500 HTG (Total perçu du client)
  - Crédit `2150_MONEYGRAM_CLEARING` = 10,000 HTG (Principal dû à MoneyGram)
  - Crédit `4200_COMMISSION_REVENUE` = 500 HTG (Commission ERP)
- **Équilibre** : Débit (10,500) = Crédit (10,000 + 500) = 10,500 HTG.

### B6. Clôture Journalière et Écarts de Billetage
- **Événement déclencheur** : Billetage constatant un manquant physique de 400 HTG (Solde théorique = 10,000 HTG, Solde physique = 9,600 HTG).
- **Formule Débit / Crédit** :
  - Débit `6780_CASH_DISCREPANCY_LOSS` = 400 HTG (Charge d'écart)
  - Crédit `1020_TILL_CASH` = 400 HTG (Ajustement solde caisse au réel)
- **Équilibre** : Débit (400) = Crédit (400).

### B7. Petite Dépense de Guichet (Petty Cash)
- **Événement déclencheur** : Achat de fournitures urgentes de 1,500 HTG payé depuis le guichet.
- **Formule Débit / Crédit** :
  - Débit `5900_GENERAL_EXPENSES` = 1,500 HTG
  - Crédit `1020_TILL_CASH` = 1,500 HTG
- **Équilibre** : Débit (1,500) = Crédit (1,500).

---

## 6. AUDIT C — COMPATIBILITÉ HISTORIQUE ET INTÉGRITÉ CRYPTOGRAPHIQUE

L'audit a examiné la préservation des empreintes et journaux d'audit :

1. **Calcul des Empreintes / Signatures** : Les signatures dans `forensic_logs` et `ledger_transactions` sont calculées par hachage SHA-256 sur la chaîne JSON sérialisée des champs transactionnels (`id`, `business_id`, `amount_cents`, `debit_account`, `credit_account`, `timestamp`).
2. **Impact de la Modification de Code de Compte** : Toute mise à jour directe (mutation) du champ `debit_account` ou `credit_account` sur un document existant dans Firestore invalide instantanément sa signature SHA-256 (`hashChainValid: false`).
3. **Validation de la Stratégie d'Alias** :
   - L'alias doit être strictement une **couche de lecture virtuelle à la volée** lors de la construction des bilans/snapshots.
   - Les documents historiques dans Firestore doivent conserver leurs codes d'origine (`2100_ONA_TAXES_PAYABLE`).

---

## 7. AUDIT D — INVARIANTS ET CONCURRENCE

| Invariant Métier / Technique | Statut d'Audit | Preuve dans le Dépôt / Fichier | Limite / Observation |
|---|---|---|---|
| **Équilibre Débit = Crédit** | `VERIFIED` | `src/constants/finance.ts` (L.300 `validateDoubleEntryEquilibrium`) | Testé unitairement avec succès |
| **Idempotence des Écritures** | `VERIFIED` | `src/repositories/LedgerRepository.ts` (L.438 `generateDeterministicEventId`) | Clé déterministe basée sur l'event ID |
| **Isolation Multi-Tenant** | `VERIFIED` | `src/repositories/LedgerRepository.ts` (L.112 `where("business_id", "==", businessId)`) | Filtrage strict au niveau query Firestore |
| **Distinction Cash / Banque / Transit** | `VERIFIED` | `src/domains/cash/types/NormalizedCashMovement.ts` (L.104 `TreasuryClassification`) | Classification explicite par type de compte |
| **Encaissement Carte Hors-Cash Physique** | `VERIFIED` | `src/domains/cash/types/NormalizedCashMovement.ts` (L.176 `NON_CASH`) | Ne modifie pas le solde physique de la caisse |
| **Transfert Interne Sans Profit** | `VERIFIED` | `src/domains/cash/types/NormalizedCashMovement.ts` (L.232 `getCashFlowImpact = 0`) | Impact consolidé exactement égal à 0 |
| **Annulation par Contre-Passation** | `VERIFIED` | `src/repositories/LedgerRepository.ts` (L.34 `createReversalEntry`) | Inversement des comptes Débit/Crédit |
| **Isolation des Devises HTG / USD** | `VERIFIED` | `src/domains/cash/types/NormalizedCashMovement.ts` (L.252) | Pas de conversion implicite sans taux explicite |
| **Verrouillage Concurrence Firestore** | `PARTIALLY_VERIFIED` | `src/repositories/LedgerRepository.ts` (L.244 `MessageQueue.persistAndPublishWithTransaction`) | Transaction Firestore présente en code, mais **non exécutée sur émulateur** lors du run vitest |

---

## 8. AUDIT E — IMPACT BI, RAPPORTS ET MIGRATION

L'introduction des nouveaux codes aura les impacts suivants sur la couche de reporting :

1. **Agrégation des Liquidités (KPI Cash)** :
   - `src/services/FinancialSnapshotBuilder.ts` doit être étendu pour sommer la plage de comptes `1000` à `1080` afin que les caisses guichet (`1020`) et coffres (`1030`) soient incluses dans la trésorerie disponible.
2. **Indépendance des Opérations (Migration vs Code)** :
   - **Opération 1 (Ajout des Définitions)** : Risque NUL. Ajout des clés dans `CHART_OF_ACCOUNTS_UNIFIED`.
   - **Opération 2 (Utilisation dans Nouvelles Écritures)** : Risque FAIBLE. Nécessite la mise à jour des générateurs de journaux.
   - **Opération 3 (Migration Historique)** : Risque ÉLEVÉ. **INTERDITE**. Recommandation de conserver les données historiques intactes et d'utiliser le calque d'alias à la lecture.

---

## 9. AUDIT F — QUALITÉ DU RAPPORT P03.2

Le rapport P03.2 a été évalué sur sa rigueur de rédaction :
- **Point Fort** : La modélisation des écritures en partie double (Modèles 1 à 7) est irréprochable sur le plan de la théorie comptable.
- **Point Faible** : P03.2 a parfois présenté les comptes futurs comme s'ils étaient déjà implémentés dans la baseline du code TS.
- **Clarification** : Le verdict `COA_RESOLUTION_APPROVED` de P03.2 doit être interprété comme une **approbation d'architecture documentaire**, et NON comme un feu vert pour modifier la production sans passer par la phase P04.

---

## 10. TABLEAU DES ANOMALIES (P0, P1, P2, P3)

| Identifiant | Sévérité | Description de l'Anomalie | Impact | Action Corrective Recommandée |
|---|---|---|---|---|
| **ANO-P0-1** | **P0 (Bloquant)** | Absence des comptes guichets/coffres/clearing dans `src/constants/finance.ts`. | Bloque le codage des modules guichet. | Ajouter la structure `CHART_OF_ACCOUNTS_UNIFIED` dans `finance.ts` en P04. |
| **ANO-P0-2** | **P0 (Bloquant)** | Absence de règles Firestore (`firestore.rules`) rédigées pour les guichets/coffres. | Risque de rejet de permission à l'exécution. | Rédiger et valider les règles Firestore pour la collection `cash_sessions` en P04. |
| **ANO-P1-1** | **P1 (Majeur)** | Absence du calque d'alias dynamique de lecture dans `AccountingEngine.ts`. | Risque de rupture de rétrocompatibilité sur les anciens rapports. | Implémenter le helper `resolveLegacyAccountCode` lors de la mise à jour de `AccountingEngine.ts`. |
| **ANO-P1-2** | **P1 (Majeur)** | Échec des tests d'intégration sans émulateur Firestore (`PERMISSION_DENIED`). | Impossibilité de prouver la concurrence Firestore en CI. | Configurer l'émulateur Firestore pour la suite de tests d'intégration. |
| **ANO-P2-1** | **P2 (Moyen)** | Helper de calcul de gain/perte FX non encore présent dans `AccountingEngine.ts`. | Nécessite un calcul manuel dans l'IHM. | Ajouter un helper pures de conversion FX avec écriture en 7680/6680. |
| **ANO-P3-1** | **P3 (Mineur)** | Légère incohérence de nommage entre `5110_EMPLOYER_TAX_EXPENSE` (actuel) et `5010` (proposé). | Confusion mineure de documentation. | Maintenir un dictionnaire d'alias clair dans la doc. |

---

## 11. DÉCISIONS COMPTABLES NÉCESSITANT UNE APPROBATION HUMAINE

Avant tout codage en P04, les décisions de politique financière suivantes doivent être formellement validées par la direction financière :
1. **Source du Taux de Change Comptable** : Confirmation du taux de référence officiel à utiliser pour valoriser les écarts de change (ex: Taux BRH du jour vs Taux fixe de session).
2. **Seuil de Tolérance sur Écart de Caisse** : Définition du montant d'écart de caisse en HTG au-dessus duquel une approbation managériale (`MANAGER`) est obligatoire avant clôture.
3. **Politique d'Imputation des Manquants** : Confirmation du délai après lequel un manquant non justifié en `6780_CASH_DISCREPANCY_LOSS` est reclassé en avance sur salaire `1300_EMPLOYEE_ADVANCES` à la charge du guichetier.

---

## 12. CONDITIONS BLOQUANTES AVANT LE PASSAGE À P04

L'implémentation de la phase P04 est **STRICTEMENT BLOQUÉE** jusqu'à la réalisation des conditions suivantes :
1. **Résolution des Anomalies P0** : Définition des comptes dans `finance.ts` et rédaction des règles Firestore.
2. **Approbation Humaine Formelle** : Signature du PV d'approbation comptable sur les choix de taux FX et de tolérance d'écart.
3. **Disponibilité de la Validation par Émulateur** : Preuve d'exécution de la suite de tests avec l'émulateur Firestore actif.

---

## 13. VERDICT FINAL DE L'AUDIT P03.3

```
===============================================================================
VERDICT FINAL : ACCOUNTING_VALIDATION_READY_WITH_BLOCKERS
===============================================================================
Statut de l'Audit :
- La conception comptable et la modélisation en partie double de P03.2 sont
  VALIDÉES sur le plan théorique et arithmétique.
- L'implémentation P04 est BLOQUÉE jusqu'à la résolution des conditions P0/P1.
===============================================================================
```
