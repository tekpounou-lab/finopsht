# FINOPS × FINAYITI — PROMPT 03.1 — FINANCIAL INVARIANTS & PRE-IMPLEMENTATION GATE
## Audit Contradictoire d'Équilibre Financier, Idempotence, Concurrence & Pré-Implémentation

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Auteur :** AI Engineering Orchestrator / FINOPS Financial Integrity Board  
**Version :** 1.0  
**Statut :** AUDIT INVARIANT ACHEVÉ — BLOCAGE DE SÉCURITÉ COMPTABLE CONSTATÉ  
**Mode :** AUDIT CONTRADICTOIRE STRICTEMENT EN LECTURE SEULE (0 Mutation de code, 0 modification de règles Firestore, 0 altération de base de données, 0 simulation de test non exécuté)  
**Prérequis :**
- `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_GATE_P02.md`
- `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_DECISIONS_P02_1.md`
- `docs/audits/FINOPS_FINAYITI_DOMAIN_DATA_MODEL_GATE_P03.md`

**Livrable unique :** `docs/audits/FINOPS_FINAYITI_FINANCIAL_INVARIANTS_GATE_P03_1.md`

---

## 1. Résumé Exécutif

Le présent rapport constitue l'audit contradictoire d'intégrité financière (**Financial Invariants Gate P03.1**) du modèle de domaine et de données formalisé dans le document P03 (`docs/audits/FINOPS_FINAYITI_DOMAIN_DATA_MODEL_GATE_P03.md`).

Conformément à la Constitution **GEMINI.md** (Règles 3.1, 3.4 et 10) et au principe de réserve comptable, **le verdict favorable de la phase P03 ne constitue en aucun cas une preuve d'exécutabilité**. Chaque invariant financier, règle d'imputation et mécanisme de concurrence a été confronté directement aux structures réelles de la codebase FINOPS ERP (`src/constants/finance.ts`, `src/services/AccountingEngine.ts`, `src/domains/cash/`, `src/services/PermissionService.ts`, `src/types.ts`).

### Résultats Majeurs de l'Audit :
1. **Collision Bloquante du Plan Comptable (P0 - CRITIQUE)** : Le code de compte `1010_BANK` ("Banque Principale") est formellement défini et utilisé dans `src/constants/finance.ts` et `src/services/AccountingEngine.ts`. La proposition P01/P02/P03 d'introduire le compte `1010_TILL` ("Caisse Guichet") crée une **collision directe sur le code numérique à 4 chiffres `1010`**. Toute tentative d'imputation par préfixe ou masque numérique `1010` fusionnerait les avoirs bancaires et les espèces physiques en caisse.
2. **Absence de Comptes de Classe 6 et 7 (P1 - MAJEUR)** : Les comptes d'écart de caisse (`6780_CASH_DISCREPANCY_LOSS`, `7780_CASH_DISCREPANCY_GAIN`) et de gain/perte de change (`6680_REALIZED_FX_LOSS`, `7680_REALIZED_FX_GAIN`) proposés n'existent pas dans `CHART_OF_ACCOUNTS`. Actuellement, `CHART_OF_ACCOUNTS` dans `src/constants/finance.ts` ne contient **aucune définition de classe 6 ou 7**.
3. **Plafond de Passage Transactionnel Firestore (P1 - MAJEUR)** : La stratégie de reconstruction des soldes P03/DR-015 reposant sur le rejeu de l'historique complet `/cash_movements` dans une transaction `db.runTransaction` échouera sur les caisses à fort volume en raison de la limite stricte de 500 documents par transaction Firestore et de la limite de taille de payload de 10 Mo.
4. **Non-Activation des Rôles & Capacités Guichet (P1 - MAJEUR)** : Les sous-rôles `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER` et les 9 capacités granulaires `till.*` / `safe.*` ne sont pas encore actifs dans les fichiers de type `src/types.ts` et `PermissionService.ts`. Les contrôles de sécurité Firestore et applicatifs ne peuvent donc pas être démontrés comme fonctionnels à ce stade.

---

## 2. Périmètre & Limites

### 2.1 Cadre Strict Read-Only
- **0 ligne de code de production** n'a été créée, modifiée ou supprimée.
- **0 règle de sécurité Firestore** (`firestore.rules`) n'a été altérée.
- **0 écriture en base de données** n'a été réalisée.
- **0 test automatisé simulé** : Aucun test n'est déclaré comme "PASS" s'il n'a pas été réellement exécuté dans l'environnement de runtime de cette turn.

### 2.2 Distinctions Méthodologiques Impératives
- **Preuve en Codebase (`EVIDENCED_IN_FINOPS`)** : Élément formellement vérifié dans le code source existant.
- **Proposition Documentaire (`PROPOSED`)** : Élément figurant dans les rapports P01/P02/P03 mais absent du code compilé.
- **Démonstration Théorique** : Calcul arithmétique exact montrant le comportement attendu d'un scénario sans valider son exécution réelle par le code.

---

## 3. Références aux Décisions d'Architecture P02 / P02.1 / P03

L'audit s'appuie explicitement sur les jalons établis :
- **`P02`** : Audit Gate initial (`docs/audits/FINOPS_FINAYITI_ARCHITECTURE_GATE_P02.md`).
- **`P02.1`** : Registre ADR des 15 Décisions d'Architecture (`DR-001` à `DR-015` dans `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_DECISIONS_P02_1.md`).
- **`P03`** : Spécification du modèle de domaine (`docs/audits/FINOPS_FINAYITI_DOMAIN_DATA_MODEL_GATE_P03.md`).

---

## 4. Audit des Collisions du Plan Comptable (Chart of Accounts Audit)

Inspection directe du fichier `src/constants/finance.ts` (`CHART_OF_ACCOUNTS`, lignes 138-169) et du moteur `src/services/AccountingEngine.ts` :

| Code Compte Requis | Libellé Fonctionnel | Statut Réel dans `src/constants/finance.ts` | Code Numérique / Clé Technique | Statut Collision & Bloqueur |
|---|---|---|---|---|
| `1000_CASH` | Caisse Générale / Espèces | **`EVIDENCED_IN_FINOPS`** | Prefix: `1000` / Key: `ASSETS.CASH` | Valide. Aucune collision. |
| `1010_BANK` | Banque Principale | **`EVIDENCED_IN_FINOPS`** | Prefix: `1010` / Key: `ASSETS.BANK` | Valide dans l'existant. |
| `1010_TILL` | Caisse Guichet / Tiroir | `PROPOSED` (Absent) | Prefix: `1010` / Key: N/A | **COLLISION P0 CRITIQUE** avec `1010_BANK` ! Mème préfixe `1010`. |
| `1015_SAFE` | Coffre-Fort Succursale | `PROPOSED` (Absent) | Prefix: `1015` / Key: N/A | Pas de collision directe, mais absent du COA. |
| `1080_CASH_IN_TRANSIT` | Cash en Transit Inter-Emplacements | `PROPOSED` (Absent) | Prefix: `1080` / Key: N/A | Pas de collision directe, mais absent du COA. |
| `2000_CARD_CLEARING` | Clearing Monétique Carte | `PROPOSED` (Absent) | Prefix: `2000` / Key: N/A | **COLLISION P0** avec `2000_ACCOUNTS_PAYABLE` (Fournisseurs) ! |
| `2100_MONEYGRAM_CLEARING` | Clearing Opérateur MoneyGram | `PROPOSED` (Absent) | Prefix: `2100` / Key: N/A | **COLLISION P0** avec `2100_PAYROLL_CLEARING` et `2100_ONA_TAXES_PAYABLE` ! |
| `5900_GENERAL_EXPENSES` | Charges Générales / Petite Caisse | **`EVIDENCED_IN_FINOPS`** | Prefix: `5900` / Key: `EXPENSES.GENERAL` | Valide. Déjà utilisé par `AccountingEngine`. |
| `6680_REALIZED_FX_LOSS` | Perte de Change Réalisée | `PROPOSED` (Absent) | Prefix: `6680` / Key: N/A | Classe 6 absente de `src/constants/finance.ts`. |
| `6780_CASH_DISCREPANCY_LOSS` | Perte sur Écart de Caisse (Déficit) | `PROPOSED` (Absent) | Prefix: `6780` / Key: N/A | Classe 6 absente de `src/constants/finance.ts`. |
| `7680_REALIZED_FX_GAIN` | Gain de Change Réalisé | `PROPOSED` (Absent) | Prefix: `7680` / Key: N/A | Classe 7 absente de `src/constants/finance.ts`. |
| `7780_CASH_DISCREPANCY_GAIN` | Produit sur Écart de Caisse (Surplus) | `PROPOSED` (Absent) | Prefix: `7780` / Key: N/A | Classe 7 absente de `src/constants/finance.ts`. |

### Analyse d'Impossibilité Technique sans Arbitrage :
- **Règle d'Immutabilité** : La Constitution `GEMINI.md` interdit de renommer ou de renuméroter arbitrairement des comptes comptables existants sans arbitrage formel.
- **Blocage constaté** : `CHART_OF_ACCOUNTS.ASSETS.BANK` est égal à la chaîne `"1010_BANK"`. Si `1010_TILL` est inséré avec le code `"1010_TILL"`, les filtres comptables basés sur `code.startsWith("1010")` regrouperont la Banque et la Caisse Guichet sous la même masse de bilan, ce qui viole la séparation des comptes d'actifs liquides.
- **Résolution requise avant écriture de code** : Un arbitrage de numérotation comptable doit attribuer des sous-comptes distincts à 4 chiffres non-collisionnels (ex: `1010_BANK`, `1020_TILL`, `1030_SAFE`, `1080_CASH_IN_TRANSIT`, `2050_CARD_CLEARING`, `2150_MONEYGRAM_CLEARING`).

---

## 5. Épreuve des Invariants par Scénarios Arithmétiques Chiffrés

*Avertissement : Les calculs ci-dessous représentent la démonstration arithmétique théorique exigée par la méthodologie de l'audit et ne constituent pas une preuve d'exécution par du code compilé.*

### Scénario A — Vente en Espèces (Cash Sale)
- **Données hypothétiques de test** : Solde d'ouverture caisse = 10 000 HTG. Vente comptoir encaissée = 2 500 HTG (dont TVA 18% = 381.36 HTG, Vente HT = 2 118.64 HTG).
- **Invariants physiques & de projection** :
  - `TillBalanceProjection.cashBalanceCents` initial = 1 000 000 cents.
  - Inflow cash = +250 000 cents.
  - Nouveau solde théorique calculé = **1 250 000 cents (12 500.00 HTG)**.
- **Schéma d'Imputation Comptable (General Ledger)** :
  - Débit : `1000_CASH` (ou `1020_TILL` après résolution) = 250 000 cents (2 500.00 HTG).
  - Crédit : `4000_OPERATING_REVENUE` = 211 864 cents (2 118.64 HTG).
  - Crédit : `2200_TAXES_PAYABLE` = 38 136 cents (381.36 HTG).
- **Vérification d'Idempotence** :
  - `generateCashMovementId({ businessId, sourceModule: 'INVOICE', sourceId: 'inv_104', movementDate: '2026-10-10', direction: 'INFLOW' })` génère la clé déterministe `cm_biz1_INVOICE_inv_104_2026-10-10_INFLOW`.
  - Une re-soumission du même paiement d'invoice renvoie le document `cash_movement` existant sans ré-incrémenter le solde.

### Scénario B — Paiement par Carte Bancaire (Card Payment)
- **Données hypothétiques de test** : Solde d'espèces physique d'ouverture = 10 000 HTG. Vente réglée par carte POS/TPE = 2 500 HTG.
- **Invariants physiques & de projection** :
  - **Le solde physique d'espèces RESTE STRICTEMENT À 10 000 HTG (1 000 000 cents)**.
  - Aucun document `NormalizedCashMovement` avec `paymentMethod === 'CASH'` n'est émis sur le tiroir-caisse.
- **Schéma d'Imputation Comptable (General Ledger)** :
  - Débit : `2050_CARD_CLEARING` (Compte de clearing monétique TPE) = 250 000 cents.
  - Crédit : `4000_OPERATING_REVENUE` = 250 000 cents.
- **Rapprochement TPE** : Lors du virement d'acquittement de la banque partenaire (ex: commission monétique 1.5% = 37.50 HTG) :
  - Débit : `1010_BANK` = 246 250 cents (2 462.50 HTG).
  - Débit : `5900_GENERAL_EXPENSES` (Frais bancaires TPE) = 3 750 cents (37.50 HTG).
  - Crédit : `2050_CARD_CLEARING` = 250 000 cents (Solder le clearing).

### Scénario C — Dépôt de Caisse au Coffre (Till to Safe Sweep)
- **Données hypothétiques de test** : Solde guichet = 12 500 HTG. Dépôt physique au coffre = 7 000 HTG.
- **Invariants physiques & de projection** :
  - Solde Guichet après dépôt = $12\ 500 - 7\ 000 = \mathbf{5\ 500\text{ HTG}}$ (550 000 cents).
  - Solde Coffre après dépôt = $\text{Solde Initial Coffre} + \mathbf{7\ 000\text{ HTG}}$ (+700 000 cents).
  - **Trésorerie Consolidée de la Succursale** = $\text{Guichet} + \text{Coffre} = \text{Inchangée}$.
- **Imputation Comptable GL** :
  - Étape 1 (Départ Caisse) : Débit `1080_CASH_IN_TRANSIT` (700 000 cents) / Crédit `1000_CASH` (Caisse: 700 000 cents).
  - Étape 2 (Réception Coffre) : Débit `1015_SAFE` (Coffre: 700 000 cents) / Crédit `1080_CASH_IN_TRANSIT` (700 000 cents).
  - **Effet sur le Résultat (P&L)** : **0.00 HTG** (Mouvement d'actif pur, aucun compte de produit ou de charge impacté).

### Scénario D — Transfert en Transit Inter-Succursales (In-Transit Lifecycle)
- **Données hypothétiques de test** : Solde Source (Cap-Haïtien) = 12 500 HTG. Transfert physique initié vers Siège (Port-au-Prince) = 4 000 HTG.
- **Analyse Étape par Étape des Invariants** :
  1. *Avant Transfert* : Source = 12 500 HTG, Destination = 0 HTG, Transit = 0 HTG. Total = 12 500 HTG.
  2. *Après Départ Physique (`IN_TRANSIT`)* :
     - Source débitée immédiatement : $12\ 500 - 4\ 000 = \mathbf{8\ 500\text{ HTG}}$. (Empêche le double-emploi par le guichetier émetteur).
     - Compte de Transit `1080_CASH_IN_TRANSIT` crédité : $\mathbf{4\ 000\text{ HTG}}$.
     - Solde Destination disponible : $\mathbf{0\text{ HTG}}$ (Empêche l'utilisation de fonds non encore reçus).
     - Total Trésorerie globale = $8\ 500 + 4\ 000 + 0 = \mathbf{12\ 500\text{ HTG}}$ (Conservation intégrale de la masse monétaire).
  3. *Après Réception Réelle (`COMPLETED`)* :
     - Compte de Transit `1080_CASH_IN_TRANSIT` débité et soldé à $\mathbf{0\text{ HTG}}$.
     - Destination créditée de $\mathbf{4\ 000\text{ HTG}}$.
     - Total = Source (8 500) + Destination (4 000) = $\mathbf{12\ 500\text{ HTG}}$.
  4. *Tentative de Réception Dupliquée* : Bloquée car le transfert porte l'état `COMPLETED`. La transaction Firestore rejette la mutation avec l'erreur `ALREADY_COMPLETED`.
  5. *Interruption/Panne Réseau pendant le Transit* : Les fonds restent identifiables dans `/cash_transfers` sous le statut `IN_TRANSIT` adossés au compte `1080_CASH_IN_TRANSIT` lors du rapprochement financier.

### Scénario E — Change Manuel de Devises HTG/USD
- **Données hypothétiques de test** :
  - Le client remet $13\ 500\text{ HTG}$ en espèces au guichet.
  - Le guichet remet $100.00\text{ USD}$ en espèces au client.
  - Taux commercial d'achat appliqué au guichet = $135.00\text{ HTG/USD}$.
  - Taux comptable officiel du jour (Banque Centrale BRH) = $132.00\text{ HTG/USD}$.
- **Invariants physiques & de projection** :
  - Caisse HTG : $+1\ 350\ 000\text{ cents HTG}$ ($+13\ 500\text{ HTG}$).
  - Caisse USD : $-10\ 000\text{ cents USD}$ ($-100.00\text{ USD}$).
- **Analyse d'Écart de Conversion & Marge Commerciale** :
  - La valeur officielle au taux BRH ($132.00\text{ HTG}$) des $100.00\text{ USD}$ déboursés est de $13\ 200.00\text{ HTG}$.
  - Le cash HTG reçu du client est de $13\ 500.00\text{ HTG}$.
  - **Marge brute de change réalisée au guichet** = $13\ 500 - 13\ 200 = \mathbf{300.00\text{ HTG}}$ ($30\ 000\text{ cents HTG}$).
- **Schéma d'Imputation Comptable (General Ledger)** :
  - Débit : `1000_CASH_HTG` = 1 350 000 cents (13 500.00 HTG).
  - Crédit : `1000_CASH_USD` (Valorisé au taux BRH 132.00) = 1 320 000 cents (13 200.00 HTG).
  - Crédit : `7680_REALIZED_FX_GAIN` (Produit financier / Gain FX réalisé) = 30 000 cents (300.00 HTG).
  - **Équilibre Comptable Strict** : $\text{Débits (1 350 000)} = \text{Crédits (1 320 000 + 30 000)} = 1\ 350\ 000\text{ cents}$.
- **Test d'Absence de Taux Commercial Valide** : Si aucun taux du jour n'est enregistré dans `/exchange_rates`, l'opération est **stritement bloquée** (`FAIL-CLOSED`). Il est interdit d'utiliser silencieusement le taux fallback d'infrastructure `135.0` (`DR-007`).

### Scénario F — Clôture de Caisse avec Écart (Closure & Variance)
- **Données hypothétiques de test** : Solde théorique système = 12 500 HTG. Billetage physique compté = 12 300 HTG. Écart constaté = −200 HTG (Déficit).
- **Invariants de Clôture** :
  - Écart calculé de manière déterministe : $\text{Physique} - \text{Théorique} = 12\ 300 - 12\ 500 = \mathbf{-200\text{ HTG}}$ (-20 000 cents).
  - Billetage physique conservé comme preuve immuable dans `CountObservation` (`grandTotalCents: 1230000`).
  - **Transfert Maximale au Coffre (Sweep Limit)** : Le montant transférable au coffre lors de la clôture ne peut **jamais dépasser le montant physique disponible (12 300 HTG)**. Tenter de transférer le solde théorique (12 500 HTG) créerait un solde négatif fantôme de −200 HTG sur la caisse.
- **Workflow d'Approbation Conditionnelle (`DR-011`)** :
  - Si le seuil `maxAutoApproveVarianceCents` configuré dans `BusinessSettings` est de 0 HTG : L'écart de −200 HTG gèle la session à l'état **`PENDING_APPROVAL`**.
  - La session ne peut pas générer d'écriture d'écart tant que le `MANAGER` n'a pas approuvé la justification.
- **Imputation Comptable après Approbation Manager** :
  - *Option 1 (Charge Employé / Retenue)* : Débit `1300_EMPLOYEE_ADVANCES` (20 000 cents) / Crédit `1000_CASH` (20 000 cents).
  - *Option 2 (Charge Entreprise)* : Débit `6780_CASH_DISCREPANCY_LOSS` (20 000 cents) / Crédit `1000_CASH` (20 000 cents).

### Scénario G — Petite Dépense de Caisse (Petty Expense)
- **Données hypothétiques de test** : Solde ouverture = 10 000 HTG. Bon de dépense fournitures de bureau = 750 HTG.
- **Invariants physiques** :
  - Solde physique réduit de 750 HTG -> **9 250 HTG** (925 000 cents).
  - Mouvement physical cash : `direction: 'OUTFLOW'`, `movementType: 'EXPENSE'`.
- **Raccordement Trésorerie-Comptabilité** :
  - Document justificatif : `PettyExpenseVoucher` (`id: petty_007`, `receiptAttachmentUrl` présent, `expenseCategoryCode: '5900_GENERAL_EXPENSES'`).
  - Écriture Comptable GL : Débit `5900_GENERAL_EXPENSES` (75 000 cents) / Crédit `1000_CASH` (75 000 cents).
  - Clé d'idempotence : `cm_biz1_PETTY_CASH_petty_007_2026-10-10_OUTFLOW`.
- **Dépense Rejetée / Annulée** : Si le bon de dépense est rejeté par le Manager avant décaissement, aucun document `NormalizedCashMovement` n'est créé et le solde physique de la caisse demeure intact à 10 000 HTG.

### Scénario H — Transfert International MoneyGram
- **Données hypothétiques de test** :
  - Retrait MoneyGram au guichet (Payin au client) : Principal = $100.00\text{ USD}$ ($13\ 500\text{ HTG}$ au taux du jour $135\text{ HTG/USD}$).
  - Frais perçus = $0.00\text{ USD}$ (payés par l'expéditeur à l'étranger). Commission agence FINOPS = $2.00\text{ USD}$ ($270\text{ HTG}$).
- **Séparation Statut Partenaire vs Mouvement Cash (`DR-005`)** :
  - Le dossier partenaire MoneyGram enregistre la référence MTCN `987-654-321` et le statut `DISBURSED`.
  - Le tiroir-caisse subit un décaissement physique net d'espèces : Outflow $100.00\text{ USD}$ ($10\ 000\text{ cents USD}$).
- **Schéma d'Imputation Comptable (General Ledger)** :
  - Débit : `2150_MONEYGRAM_CLEARING` (Créance sur l'opérateur MoneyGram) = 13 500 cents USD (ou équivalent HTG 13 500 HTG).
  - Crédit : `1000_CASH_USD` (Cash versé au client) = 10 000 cents USD (13 500 HTG).
  - (La commission partenaire de 270 HTG est créditée par relevé de compensation mensuel au compte `4000_OPERATING_REVENUE`).
- **Idempotence de Reprise Réseau** : Clé déterministe `mg_biz1_987654321_PAYIN_RECEIVE`. Si le terminal MoneyGram tente de re-soumettre la transaction après un timeout réseau, la transaction Firestore retrouve la clé existante et renvoie le reçu sans décaisser $100.00\text{ USD}$ une seconde fois.

---

## 6. Audit de l'Idempotence, de la Concurrence & des Limites Firestore

### 6.1 Matrice des Risques Concurrents & Garanties Techniques

| Scénario de Concurrence / Panne | Comportement Proposé P03 | Évaluation Technique Réelle | Vulnérabilité / Limitation Constatée | Mesure Corrective Impérative |
|---|---|---|---|---|
| **Deux requêtes simultanées de vente cash sur la même caisse** | `db.runTransaction` sur la projection matérialisée | **Conforme**. Firestore exécute un verrouillage optimiste avec retry automatique. | Risque de rejet par timeout si plus de 1 écriture/seconde sur le même document de projection. | File d'attente d'écriture locale ou agrégation périodique si très fort débit. |
| **Deux guichetiers dépensant le même solde disponible** | Vérification `currentBalanceCents >= amountCents` dans la transaction | **Conforme**. La transaction relit le solde à jour avant d'autoriser le décaissement. | Aucune. Le second appel échouera avec `Solde Insuffisant`. | Maintenir la vérification obligatoire du solde dans la transaction. |
| **Réponse réseau perdue après écriture Firestore réussie** | Le client ré-essaie la requête | **Conforme**. L'utilisation d'identifiants déterministes (`cm_biz_module_sourceId_...`) retrouve le document sans doublon. | Le client doit utiliser la clé déterministe et ne jamais laisser Firestore générer des ID aléatoires. | Forcer l'utilisation de `doc(db, 'cash_movements', deterministicId)` avec `transaction.set()`. |
| **Mouvement enregistré mais échec de mise à jour de la projection** | Écriture du mouvement et de la projection dans la même transaction | **Conforme**. Atomicité intégrale de Firestore : soit les deux documents sont écrits, soit aucun. | Aucun risque de désynchronisation partielle dans Firestore. | Toujours inclure l'écriture du mouvement ET de la projection dans la même `db.runTransaction`. |
| **Reconstruction du solde pendant l'arrivée de nouvelles ventes** | Drapeau `isReconciling: true` posé sur la projection | **Partiellement Conforme**. Rejette temporairement les ventes actives pendant la reconstruction. | Interrompt les encaissements au guichet pendant la durée du recalcul. | Poser le verrou uniquement sur la fraction de seconde de mise à jour finale du snapshot. |

### 6.2 Contraintes & Limites d'Infrastructure Firestore (Invariants Système)
1. **Limite de 500 documents par Batch/Transaction** : Une transaction Firestore ne peut pas lire ou modifier plus de 500 documents. **Conséquence directe** : Reconstruire le solde d'une caisse ayant plus de 500 mouvements historiques en une seule transaction `db.runTransaction` **est physiquement impossible et provoquera une exception runtime**.
2. **Limite de Taille de Payload de 10 Mo** : Une transaction ne peut pas dépasser 10 Mo de données transférées.
3. **Plafond de Contention (1 écriture / seconde / document)** : Si un guichet très fréquenté tente d'exécuter 5 ventes par seconde, la mise à jour séquentielle du document unique `TillBalanceProjection` subira des rejets pour contention optimiste.

---

## 7. Audit de la Stratégie de Reconstruction des Soldes (`P03 / DR-015`)

### 7.1 Analyse des Anomlies de la Stratégie P03
La stratégie P03/DR-015 proposait de sommer la totalité des documents `/cash_movements` associés à un `tillId` à l'intérieur d'une transaction Firestore.

### 7.2 Defauts Majeurs Identifiés :
1. **Dépassement du Quota de Documents (500 docs Limit)** : Dès qu'une caisse dépasse 500 opérations, la reconstruction transactionnelle crash.
2. **Déni de Service Financier (Denial of Wallet)** : Lire 10 000 mouvements historiques à chaque reconstruction consomme des milliers d'unités de lecture Firestore inutilement.

### 7.3 Solution d'Ingénierie Corrective (Invariants de Reconstruction par Ancrage) :
To guarantee scalability and correctness, the reconstruction MUST use **Periodical Billetage Anchor Snapshots**:
$$\text{Solde Reconstruit} = \text{Solde Clôture du Dernier Billetage Validé} + \sum_{t = t_{\text{billetage}}}^{T} \text{INFLOWS} - \sum_{t = t_{\text{billetage}}}^{T} \text{OUTFLOWS}$$
- L'algorithme ne remonte jamais plus loin que la dernière session fermée (`TillSession.status == 'CLOSED'`).
- La requête de rejeu est strictement bornée par `movementDate >= lastClosedSessionDate`, ce qui garantit de rester bien en dessous du plafond de 500 documents.

---

## 8. Audit de Séparation Trésorerie – Comptabilité – Business Intelligence (BI)

Tracing de la chaîne de traitement pour un événement d'encaissement d'espèces :

```text
[1. Opération Métier] Invoice #104 Payée en Cash (Module Facturation)
        │
        ├──> [2. Mouvement Cash SSOT] NormalizedCashMovement (/cash_movements)
        │        ├── ID: cm_biz1_INVOICE_inv104_2026-10-10_INFLOW
        │        └── Inflow: +2,500 HTG sur till_01
        │
        ├──> [3. Projection Matérialisée] TillBalanceProjection (/tills/till_01/projections/current_balance)
        │        └── Solde Caisse mis à jour de manière atomique (+2,500 HTG)
        │
        ├──> [4. Écriture Comptable GL] AccountingEngine (Journal Entries)
        │        ├── Débit: 1000_CASH (2,500 HTG)
        │        └── Crédit: 4000_OPERATING_REVENUE (2,500 HTG)
        │
        └──> [5. Représentation BI] CashBasisEngine (Analytics Dashboard)
                 └── Calcule les flux de trésorerie réels depuis /cash_movements (SSOT)
```

### Garanties Anti-Double Comptage (Anti-Double Counting Invariants) :
1. **Isolation des Ventes Carte** : Les rapports de trésorerie physique lisent uniquement `/cash_movements` où `paymentMethod === 'CASH'`. Les ventes carte n'alimentent que la trésorerie banques/clearing.
2. **Transparence des Transferts Internes** : Les transferts inter-caisses/coffres ont la direction `TRANSFER` ou `getFlowImpact() === 0`. Ils n'augmentent ni ne diminuent le Chiffre d'Affaires ni les flux nets de trésorerie consolidée de l'entreprise.
3. **Traçabilité des Annulations** : Les contre-passations (`REVERSED`, `VOIDED`) sont conservées comme pièces d'audit avec référence `reversalOf`. Elles neutralisent l'effet financier sans effacer l'historique de la base de données.

---

## 9. Audit de Sécurité, Matrice RBAC & Séparation des Tâches (Maker-Checker)

Inspection de la couverture des contrôles de sécurité :

| Opération sensible | Contrôle Côté Serveur (`PermissionService.ts`) | Contrôle Côté Base de Données (`firestore.rules`) | Règle de Séparation Maker-Checker | Statut Actuel dans le Code |
|---|---|---|---|---|
| **Ouverture/Fermeture Session Caisse** | Exige `till.open_close` | Requiert `request.auth.token.role in ['TELLER', 'MANAGER']` | L'opérateur ouvre sa propre session. | `NOT_TESTED` (Capacité non active dans `PermissionService.ts`) |
| **Dépense de Petite Caisse** | Exige `till.petty_expense` | Validation du schéma du bon et du rôle. | Si montant > seuil, l'initiateur ne peut pas approuver son propre bon. | `BLOCKED_BY_DESIGN` (Code de charge absent du COA) |
| **Validation d'un Écart de Clôture** | Exige `closure.approve_discrepancy` | Verrouille `TillSession.status == 'CLOSED'` uniquement si `request.auth.uid != tellerUserId`. | **Maker-Checker Stricte** : Le guichetier titulaire ne peut pas valider son propre écart. | `NOT_TESTED` (Capacité non active) |
| **Approbation d'un Transfert de Cash** | Exige `transfer.approve_till_feed` | Exige signature d'un rôle supérieur (`HEAD_TELLER`, `MANAGER`). | **Maker-Checker Stricte** : L'émetteur du transfert ne peut pas approuver la réception. | `NOT_TESTED` (Capacité non active) |
| **Override de Taux de Change** | Exige `fx.manage_rates` | Enregistrement obligatoire du responsable et du motif dans les logs forensic. | Seul un `MANAGER` / `OWNER` peut autoriser une dérogation de taux. | `NOT_TESTED` (Capacité non active) |
| **Reconstruction d'un Solde** | Exige rôle `SUPER_ADMIN` ou `OWNER` | Mutation restreinte aux scripts de maintenance autorisés. | L'exécution génère un événement d'audit inaltérable dans `forensic_logs`. | `NOT_TESTED` (Script non déployé) |

---

## 10. Matrice d'Évaluation des Invariants

| Scénario / Périmètre | Invariant Financier & Opérationnel | Résultat Attendu | Preuve Existante dans la Codebase | Écart Constaté | Gravité |
|---|---|---|---|---|---|
| **Collision Plan Comptable** | Unicité stricte des codes à 4 chiffres du Plan Comptable | `1010_BANK` et `1010_TILL` ne doivent pas entrer en collision | `CHART_OF_ACCOUNTS` (`src/constants/finance.ts`) | Collision directe sur le préfixe `1010` | **`P0` (BLOQUANT)** |
| **Collision Comptes Clearing** | Separation des comptes de clearing | `2000_CARD_CLEARING` et `2000_ACCOUNTS_PAYABLE` distincts | `CHART_OF_ACCOUNTS` (`src/constants/finance.ts`) | Collision sur le préfixe `2000` | **`P0` (BLOQUANT)** |
| **Absence Classes 6 & 7** | Saisie des charges/produits d'écarts et de change | Existence de `6680`, `6780`, `7680`, `7780` | `CHART_OF_ACCOUNTS` (`src/constants/finance.ts`) | Classes 6 et 7 absentes du COA | **`P1` (MAJEUR)** |
| **Scénario A (Vente Cash)** | Incrementation exacte du solde + Imputation GL | Solde devient 12 500 HTG + Écriture équilibrée | `AccountingEngine.ts` (Factures) | Imputation caisse guichet non câblée | `INSUFFICIENT_EVIDENCE` |
| **Scénario B (Vente Carte)** | Solde physique d'espèces inchangé à 10 000 HTG | Solde physique reste 10 000 HTG, Vente en Clearing | `InvoiceCashAdapter.ts` | Filtre `paymentMethod === 'CASH'` partiel | `INSUFFICIENT_EVIDENCE` |
| **Scénario C (Dépôt Coffre)** | Conservation de la trésorerie globale (12 500 HTG) | Guichet 5 500 HTG, Coffre +7 000 HTG, P&L 0.00 HTG | Inexistant dans le code actuel | Repository de transfert non implémenté | `NOT_TESTED` |
| **Scénario D (Transit 3-Steps)** | Non-disponibilité des fonds pendant le transit | Source débitée à `IN_TRANSIT`, Destination crédité à `COMPLETED` | Inexistant dans le code actuel | Modèle de transit non câblé | `NOT_TESTED` |
| **Scénario E (Change FX)** | Isolation du gain FX (300 HTG) au Crédit de 7680 | Constat du gain FX sans altérer l'équilibre GL | `CurrencyRateRepository.ts` | Spreads `buyRate`/`sellRate` absents | `NOT_TESTED` |
| **Scénario F (Clôture Écart)** | Rejet/Gel si écart > 0 HTG + Sweep <= physique (12 300) | Session passe à `PENDING_APPROVAL`, Sweep <= 12 300 HTG | `ServerApprovalGateway.ts` | Clôture de caisse non branchée au Gateway | `NOT_TESTED` |
| **Scénario G (Petty Expense)** | Réduction solde physique + Bon justificatif obligatoire | Solde devient 9 250 HTG + Bon adossé | `NormalizedCashMovement.ts` | Bon `PettyExpenseVoucher` non créé | `NOT_TESTED` |
| **Scénario H (MoneyGram)** | Reprise réseau sans double décaissement ($100 USD) | Clé idempotente bloque la répétition | Inexistant dans le code actuel | Module MoneyGram non implémenté | `NOT_TESTED` |
| **Limite Transaction 500 Docs** | Reconstruction solde sur historique > 500 mouvements | Reconstruction fonctionnelle sans crash | `CrossSourceCashReconciliationEngine.ts` | Transaction Firestore dépassera la limite de 500 docs | **`P1` (MAJEUR)** |

---

## 11. Critères de Sortie & Conditions Préalables à l'Implémentation

Avant d'autoriser la moindre écriture de code de production ou de script de migration, **les 6 conditions préalables suivantes doivent impérativement être remplies et validées par le Board** :

1. **Arbitrage et Numérotation du Plan Comptable (Résolution P0)** :
   - Attribuer des codes à 4 chiffres non-collisionnels dans `src/constants/finance.ts` :
     - `1020_TILL` : Caisse Guichet (au lieu de `1010_TILL` qui entre en collision avec `1010_BANK`).
     - `1030_SAFE` : Coffre-Fort Succursale.
     - `1080_CASH_IN_TRANSIT` : Cash en Transit.
     - `2050_CARD_CLEARING` : Clearing Monétique Carte (au lieu de `2000`).
     - `2150_MONEYGRAM_CLEARING` : Clearing MoneyGram (au lieu de `2100`).
     - Ajouter formellement la Classe 6 (Charges : `6680_REALIZED_FX_LOSS`, `6780_CASH_DISCREPANCY_LOSS`) et la Classe 7 (Produits : `7680_REALIZED_FX_GAIN`, `7780_CASH_DISCREPANCY_GAIN`).
2. **Activation des Rôles & Capacités dans le Code (Résolution P1)** :
   - Mettre à jour l'union de types `Role` dans `src/types.ts`.
   - Activer les 9 capacités `till.*` / `safe.*` dans `TENANT_ERP_CAPABILITIES` (`PermissionService.ts`).
3. **Correction de la Stratégie de Reconstruction (Résolution P1)** :
   - Modifier l'algorithme de reconstruction pour utiliser l'ancrage sur le dernier billetage de clôture validé (`TillSession.closingCountObservation`), afin de ne jamais lire plus de 500 documents par transaction.
4. **Validation des Règles de Double-Entrée par un Expert Comptable** :
   - Obtenir la validation formelle de la grille d'imputation comptable pour le change FX, MoneyGram et les écarts de caisse.
5. **Configuration Multi-Tenant des Seuils d'Approbation** :
   - Valider la structure `CashThresholdsSettings` dans `BusinessSettings`.
6. **Banc de Tests d'Intégration sur Firestore Emulator** :
   - Écrire et exécuter la suite de tests d'intégration sur éulateur Firestore réel pour valider l'idempotence et les transactions sous forte concurrence avant tout déploiement.

---

## 12. Tests Non Exécutés & Preuves Manquantes

Conformément aux règles de déontologie d'audit de la Constitution `GEMINI.md`, nous déclarons formellement que **les tests suivants N'ONT PAS ÉTÉ EXÉCUTÉS** lors de cette phase en raison du mode strict lecture seule :

- Test de charge concurrentielle sur Firestore Émulateur (simulation de 50 ventes simultanées sur le même tiroir-caisse).
- Test de tentative d'injection d'écart de caisse négatif sans privilège de super-utilisateur via SDK Client.
- Test de rupture réseau pendant l'exécution d'un transfert inter-succursales `IN_TRANSIT`.
- Test de réconciliation automatique entre le relevé partenaire MoneyGram et le compte `2150_MONEYGRAM_CLEARING`.

Ces tests devront être obligatoirement exécutés et validés lors de la phase de test dynamique d'implémentation.

---

## 13. Verdict Final Obligatoire

L'audit contradictoire d'intégrité financière (**PROMPT 03.1**) conclut à l'existence de blocages d'architecture comptable majeurs et critiques (`P0` et `P1`) qui interdisent le passage direct à l'écriture du code de production.

```text
===============================================================================
        VERDICT DU FINANCIAL INVARIANTS GATE (PROMPT 03.1)
===============================================================================

       [ VERDICT : IMPLEMENTATION_BLOCKED_BY_P0_OR_P1 ]

  L'implémentation du code de production est BLOQUÉE en raison de collisions
  critiques sur le Plan Comptable (P0 - Collision 1010_BANK / 1010_TILL) et
  de l'absence des comptes de charges/produits de Classe 6 et 7 (P1).

  L'écriture du code pourra être autorisée dès la résolution formelle de la
  numérotation comptable et la mise à jour de src/constants/finance.ts.
===============================================================================
```

### Synthèse des Actions Bloquantes à Réaliser :
1. **Résoudre la collision du Plan Comptable** : Assigner des codes 4 chiffres uniques (`1020_TILL`, `1030_SAFE`, `2050_CARD_CLEARING`, `2150_MONEYGRAM_CLEARING`, `6680`, `6780`, `7680`, `7780`).
2. **Soumettre la numérotation au Board** pour validation formelle.
3. **Passer à la préparation du plan d'implémentation** une fois les constantes ajustées.
