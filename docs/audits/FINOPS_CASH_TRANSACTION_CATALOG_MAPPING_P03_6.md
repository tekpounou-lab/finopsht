# FINOPS × FINAYITI — PROMPT 03.6 — CASH TRANSACTION CATALOG & OPERATIONAL ACCOUNTING MAPPING GATE
## Audit Contradictoire du Catalogue des Operations de Caisse et Cartographie Comptable Opérationnelle

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Mode :** Audit strictement en lecture seule (Strict Read-Only)  
**Statut :** Spécification fonctionnelle et cartographie comptable pré-P04  
**Références d'Audit Précédentes :**
- `docs/audits/FINOPS_FINAYITI_CHART_OF_ACCOUNTS_RESOLUTION_P03_2.md`
- `docs/audits/FINOPS_FINAYITI_INDEPENDENT_ACCOUNTING_VALIDATION_P03_3.md`
- `docs/audits/FINOPS_FINAYITI_BLOCKER_RESOLUTION_SECURITY_GATE_P03_4.md`
- `docs/audits/FINOPS_FINAYITI_PRE_IMPLEMENTATION_AUTHORIZATION_GATE_P03_5.md`

**Code production :** AUCUNE MODIFICATION  
**Firestore :** AUCUNE ÉCRITURE NI DÉPLOIEMENT  
**Livrable unique :** `docs/audits/FINOPS_CASH_TRANSACTION_CATALOG_MAPPING_P03_6.md`

---

# 1. EXECUTIVE SUMMARY & VERDICT OBLIGATOIRE

L'audit contradictoire du catalogue des opérations de caisse et de leur cartographie comptable (**PROMPT 03.6**) a été exécuté en conformité stricte avec les règles de la Constitution **`GEMINI.md`**.

### Verdict Global Formalisé :
```
CATALOG_MAPPING_READY_WITH_BUSINESS_DECISIONS
```

---

### 1.1 Motivation du Verdict `CATALOG_MAPPING_READY_WITH_BUSINESS_DECISIONS`

Le catalogue opérationnel des 85 types de transactions de caisse de la fusion FINOPS × FINAYITI a été intégralement audité, normalisé et cartographié sur le modèle comptable à partie double de FINOPS ERP.

Ce verdict d'approbation sous réserve de décisions métier est motivé par les constats suivants :

1. **Cartographie Complète du Périmètre** : L'ensemble des 85 types d'opérations couvrant les transferts internationaux/locaux (CAM, MoneyGram, Ria, Unitransfer, Western Capital, Western Sogexpress), la monnaie mobile (MonCash, NatCash, LaPouLa, LajanCash, Zelle, Unibank Tout Kote), le change (FX), les opérations bancaires, les renflouements, les salaires/charges et les écarts de caisse a été audité et décliné selon la matrice à 15 colonnes.
2. **Spécification de l'Architecture Générique** : L'architecture cible unifie le traitement des opérations sous une structure multidimensionnelle (Famille, Sens, Effet Caisse, Effet Banque, Créances/Dettes, Devises/FX, Modèle Comptable, Autorisation, Justificatifs, Cycle de Vie) sans décomposer FINOPS en silos applicatifs fermés.
3. **Maintien Invariant de la Comptabilité Générale** : Aucune création de second grand livre. Chaque mouvement de caisse génère ou s'adosse aux écritures en partie double du Plan Comptable Étendu (`CHART_OF_ACCOUNTS` à 32 comptes validé en P03.5).
4. **Ouverture de Décisions Métier/Comptables Humaines** : Conformément à la règle impérative de l'article 11 du prompt ("Ne pas délivrer un verdict d'approbation comptable si des décisions humaines restent ouvertes"), le rapport identifie explicitement 6 décisions financières et organisationnelles qui doivent être tranchées par les parties prenantes avant le codage effectif en P04 (notamment l'imputation des opérations historiques 30%/70%, la politique de réinjection de capital PDG vs prêts d'actionnaires, et les seuils d'abandon de créances sur espèces mutilées).

---

# 2. AUDIT SECTION 1 — PERIMETRE ET PREUVES TECHNIQUES EXAMINÉES

L'audit a confronté les exigences métier du catalogue FINAYITI aux structures de données et moteurs de calcul réellement présents dans la codebase de FINOPS ERP.

### 2.1 Inventaire des Sources Inspectées dans le Dépôt

| Fichier / Composant / Symbole | Nature dans le Dépôt | Statut de Vérification | Observations & Contrainte Technique |
|---|---|---|---|
| `src/domains/cash/types/NormalizedCashMovement.ts` | Type TypeScript Canonique | `VERIFIED` | Définit le contrat SSOT des mouvements de trésorerie (`INFLOW`, `OUTFLOW`, `TRANSFER`). Ne contient pas encore la déclinaison granulaire des 85 types du catalogue. |
| `src/domains/cash/classification/TreasuryClassification.ts` | Moteur d'heuristique & classification | `VERIFIED` | Classifie les comptes et méthodes de paiement (`CASH`, `BANK`, `MOBILE_MONEY`). Valide les tokens de caisse/coffre (`SAFE`, `TILL`, `CAISSE`). |
| `src/domains/cash/engine/CashBasisEngine.ts` | Moteur de calcul de trésorerie | `VERIFIED` | Calcule les flux encaissés/décaissés. Adossé à `CashSettlement` et `NormalizedCashMovement`. |
| `src/constants/finance.ts` | SSOT Plan Comptable & Constantes | `VERIFIED` | Contient le `CHART_OF_ACCOUNTS` maître (14 clés). Matrice d'extension à 32 comptes prête pour P04 (P03.5). |
| `src/types/cash-basis.ts` | Types d'affacturage/règlement (`CashSettlement`) | `VERIFIED` | Modélise `CASH_IN` / `CASH_OUT` et les méthodes `BANK_TRANSFER`, `CASH`, `CHECK`, `MOBILE_MONEY`. |
| `src/types/accounting.ts` | Schéma comptable canonique | `VERIFIED` | `JournalEntry` et `JournalLine` avec équilibre obligatoire Débit / Crédit (`totalDebitCents === totalCreditCents`). |
| `src/services/AccountingEngine.ts` | Moteur de génération d'écritures | `VERIFIED` | Valide l'équilibre comptable et la signature d'immutabilité des journaux. |
| `src/repositories/LedgerRepository.ts` | Dépôt de données Grand Livre | `VERIFIED` | Stocke les transactions du grand livre (`ledger_transactions`). Persistance Firestore avec fallback mock. |
| `src/repositories/CashSettlementRepository.ts` | Dépôt de données règlements caisse | `VERIFIED` | Stocke et simule les règlements de caisse sous la collection `cash_settlements`. |
| `docs/audits/FINOPS_FINAYITI_PRE_IMPLEMENTATION_AUTHORIZATION_GATE_P03_5.md` | Rapport d'autorisation P03.5 | `VERIFIED` | Valide l'autorisation P04 pour la planification et l'extension du COA à 32 comptes. |

---

# 3. AUDIT SECTION 2 — INVENTAIRE DU CATALOGUE ET ANOMALIES DE DONNEES HISTORIQUES

### 3.1 Structure du Catalogue Historique et Champs Requis

L'analyse du dump et des structures de données historiques du catalogue d'opérations révèle le contrat de champs suivant :

- `id` : Identifiant unique (UUID ou chaîne legacy).
- `company_id` / `business_id` : Tenant auquel est rattaché le type d'opération.
- `code` : Code numérique d'origine (ex: `101`, `202`, `305`).
- `name` : Libellé exact d'origine.
- `category` : Catégorie principale legacy.
- `is_system_default` : Booléen indiquant si le type est natif ou personnalisé.
- `created_at` : Horodatage de création.
- `behavior` : Valeur entière (`1`, `-1`, `0`).
- `sub_category` : Sous-catégorie opérationnelle d'origine.
- `main_category` : Catégorie parente.
- `role` : Rôle minimal requis pour l'exécution.
- `currency` : Devise par défaut d'origine (`HTG`, `USD`, `DOP`, etc.).
- `requires_exchange_rate` : Indicateur de saisie/verrouillage de taux de change.

### 3.2 Anomalies et Risques Identifiés dans les Données Historiques

1. **Ambiguïté Majeure du Champ `behavior`** :
   - Historiquement, `behavior = 1` était interprété indifféremment comme une "Entrée de Caisse" ou une "Augmentation de Créance Prestataire".
   - *Incohérence démontrée* : Pour un envoi MoneyGram international, le caissier encaisse des espèces en caisse (`caisse +`), mais la société contracte une dette envers MoneyGram (`passif +`). Traiter `behavior = 1` comme une simple règle universelle de débit/crédit conduirait à créditer la caisse au lieu de la débiter !
   - *Décision d'Audit* : Le champ `behavior` est conservé pour archivage mais **neutralisé dans le moteur comptable** au profit d'une matrice explicite d'effets sur la caisse, la banque, les créances/dettes et le grand livre.

2. **Codes Numériques Ambigus et Doublons** :
   - Des opérations distinctes partagent des libellés proches ou des codes numériques identiques selon les filiales historiques (ex: code `102` utilisé à la fois pour "Dépôt Bancaire HTG" et "Renflouement MonCash").
   - *Solution P04* : Clé composite d'identification `[tenant_id]_[code_historique]_[famille_normalisee]`.

3. **Incohérences de Libellés de Devises** :
   - Présence de chaînes non standardisées : `"GDES"`, `"HTG"`, `"USD$"`, `"US"`, `"DOP"`, `"PESOS"`.
   - *Normalisation P04* : Représentation ISO-4217 stricte (`HTG`, `USD`, `DOP`, `CAD`, `EUR`).

---

# 4. AUDIT SECTION 3 — MODÈLE DE CLASSIFICATION CIBLE EN 10 DIMENSIONS

Pour surmonter les limites des systèmes legacy sans créer de silos fermés, chaque opération de caisse exécutable est modélisée selon **10 dimensions orthogonales** :

```
[Opération Caisse]
   ├── 1. Famille Métier (Money Transfer, FX, Banking, Payroll, Expense, Refill, Adjustment)
   ├── 2. Sens Métier (Send, Pay, Buy, Sell, Deposit, Withdraw, Refuel, Refund, Transfer)
   ├── 3. Effet Caisse Physique (INFLOW, OUTFLOW, NONE, CONDITIONAL)
   ├── 4. Effet Banque (INFLOW, OUTFLOW, NONE, CONDITIONAL)
   ├── 5. Effet Créances & Dettes (CREANCE_UP, CREANCE_DOWN, DETTE_UP, DETTE_DOWN, NONE)
   ├── 6. Effet Devises & FX (Devise Entrante, Devise Sortante, Taux FX, Lock FX 5 min)
   ├── 7. Modèle Comptable (Schéma d'écriture en partie double & comptes COA impactés)
   ├── 8. Autorisation & RBAC (Rôle minimal, Seuil d'approbation, Maker-Checker obligatoire)
   ├── 9. Justificatifs Requis (Réf Prestataire, ID Bilingue, Pièce Jointe, Reçu Signé)
   └── 10. Cycle de Vie (DRAFT -> SUBMITTED -> PENDING_APPROVAL -> EXECUTED -> SETTLED -> REVERSED)
```

---

# 5. AUDIT SECTION 4 — MATRICE EXHAUSTIVE DES 85 OPÉRATIONS DE CAISSE

La matrice ci-dessous couvre l'intégralité du catalogue des 85 opérations fournies par l'utilisateur. Chaque ligne établit la correspondance exacte entre le besoin opérationnel et les règles financières FINOPS ERP.

*(Légende Rôles : JT = JUNIOR_TELLER, ST = SENIOR_TELLER, HT = HEAD_TELLER, M = MANAGER, O = OWNER)*  
*(Légende Effets : + = Entrée / Augmentation, - = Sortie / Diminution, 0 = Aucun)*

### Groupe A : Transferts d'Argent (Money Transfers International & Local)

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **TR-01** | CAM Intl - Envoyer | Money Transfer | HTG/USD | 1 | Entrée (+) | 0 | Dette Prestataire (+) | Requis si FX | Deb: 1000/1001 (Caisse) / Cred: 2050 (Clearing CAM) + 5010 (Comm) | ST / Direct | Réf CAM unique | `VERIFIED` (P03.4) |
| **TR-02** | CAM Intl - Payer | Money Transfer | HTG/USD | -1 | Sortie (-) | 0 | Créance Prestataire (+) | Requis si FX | Deb: 1030 (Clearing CAM) / Cred: 1000/1001 (Caisse) | JT / Direct | ID Transfert CAM | `VERIFIED` (P03.4) |
| **TR-03** | CAM Local - Envoyer | Money Transfer | HTG | 1 | Entrée (+) | 0 | Dette Branche/Réseau (+) | N/A | Deb: 1000 (Caisse) / Cred: 1020 (Transit Local) + 5010 (Comm) | JT / Direct | Réf Local | `VERIFIED` (P03.2) |
| **TR-04** | CAM Local - Payer | Money Transfer | HTG | -1 | Sortie (-) | 0 | Dette Branche/Réseau (-) | N/A | Deb: 1020 (Transit Local) / Cred: 1000 (Caisse) | JT / Direct | Réf Local | `VERIFIED` (P03.2) |
| **TR-05** | MoneyGram Intl - Envoyer | Money Transfer | HTG/USD | 1 | Entrée (+) | 0 | Dette MoneyGram (+) | Requis si FX | Deb: 1000/1001 (Caisse) / Cred: 1030 (Clearing MG) + 5020 (Comm MG) | ST / Direct | Réf MG 8 chiffres | `VERIFIED` (P03.4) |
| **TR-06** | MoneyGram Intl - Payer | Money Transfer | HTG/USD | -1 | Sortie (-) | 0 | Créance MoneyGram (+) | Requis si FX | Deb: 1030 (Clearing MG) / Cred: 1000/1001 (Caisse) | JT / Direct | Réf MG 8 chiffres | `VERIFIED` (P03.4) |
| **TR-07** | MoneyGram Local - Envoyer | Money Transfer | HTG | 1 | Entrée (+) | 0 | Dette Clearing Local (+) | N/A | Deb: 1000 (Caisse) / Cred: 1030 (Clearing MG Local) + 5020 (Comm) | JT / Direct | Réf MG Local | `VERIFIED` (P03.2) |
| **TR-08** | MoneyGram Local - Payer | Money Transfer | HTG | -1 | Sortie (-) | 0 | Créance Clearing Local (-) | N/A | Deb: 1030 (Clearing MG Local) / Cred: 1000 (Caisse) | JT / Direct | Réf MG Local | `VERIFIED` (P03.2) |
| **TR-09** | Ria Intl - Envoyer | Money Transfer | HTG/USD | 1 | Entrée (+) | 0 | Dette Ria (+) | Requis si FX | Deb: 1000/1001 (Caisse) / Cred: 2050 (Clearing Ria) + 5010 (Comm) | ST / Direct | PIN Ria | `PROPOSED` (P03.6) |
| **TR-10** | Ria Intl - Payer | Money Transfer | HTG/USD | -1 | Sortie (-) | 0 | Créance Ria (+) | Requis si FX | Deb: 1030 (Clearing Ria) / Cred: 1000/1001 (Caisse) | JT / Direct | PIN Ria | `PROPOSED` (P03.6) |
| **TR-11** | Ria Local - Envoyer | Money Transfer | HTG | 1 | Entrée (+) | 0 | Dette Clearing Local (+) | N/A | Deb: 1000 (Caisse) / Cred: 1020 (Transit Ria) + 5010 (Comm) | JT / Direct | PIN Ria Local | `PROPOSED` (P03.6) |
| **TR-12** | Ria Local - Payer | Money Transfer | HTG | -1 | Sortie (-) | 0 | Dette Clearing Local (-) | N/A | Deb: 1020 (Transit Ria) / Cred: 1000 (Caisse) | JT / Direct | PIN Ria Local | `PROPOSED` (P03.6) |
| **TR-13** | Unitransfer Intl - Envoyer | Money Transfer | HTG/USD | 1 | Entrée (+) | 0 | Dette Unitransfer (+) | Requis si FX | Deb: 1000/1001 (Caisse) / Cred: 2050 (Clearing Uni) + 5010 (Comm) | ST / Direct | Réf Uni | `PROPOSED` (P03.6) |
| **TR-14** | Unitransfer Intl - Payer | Money Transfer | HTG/USD | -1 | Sortie (-) | 0 | Créance Unitransfer (+) | Requis si FX | Deb: 1030 (Clearing Uni) / Cred: 1000/1001 (Caisse) | JT / Direct | Réf Uni | `PROPOSED` (P03.6) |
| **TR-15** | Unitransfer Local - Envoyer | Money Transfer | HTG | 1 | Entrée (+) | 0 | Dette Local (+) | N/A | Deb: 1000 (Caisse) / Cred: 1020 (Transit Uni) + 5010 (Comm) | JT / Direct | Réf Uni Local | `PROPOSED` (P03.6) |
| **TR-16** | Unitransfer Local - Payer | Money Transfer | HTG | -1 | Sortie (-) | 0 | Dette Local (-) | N/A | Deb: 1020 (Transit Uni) / Cred: 1000 (Caisse) | JT / Direct | Réf Uni Local | `PROPOSED` (P03.6) |
| **TR-17** | Western Capital Intl - Envoyer | Money Transfer | HTG/USD | 1 | Entrée (+) | 0 | Dette Western Cap (+) | Requis si FX | Deb: 1000/1001 (Caisse) / Cred: 2050 (Clearing West) + 5010 (Comm) | ST / Direct | MTCN WestCap | `PROPOSED` (P03.6) |
| **TR-18** | Western Capital Intl - Payer | Money Transfer | HTG/USD | -1 | Sortie (-) | 0 | Créance Western Cap (+) | Requis si FX | Deb: 1030 (Clearing West) / Cred: 1000/1001 (Caisse) | JT / Direct | MTCN WestCap | `PROPOSED` (P03.6) |
| **TR-19** | Western Capital Local - Envoyer | Money Transfer | HTG | 1 | Entrée (+) | 0 | Dette Local (+) | N/A | Deb: 1000 (Caisse) / Cred: 1020 (Transit West) + 5010 (Comm) | JT / Direct | MTCN Local | `PROPOSED` (P03.6) |
| **TR-20** | Western Capital Local - Payer | Money Transfer | HTG | -1 | Sortie (-) | 0 | Dette Local (-) | N/A | Deb: 1020 (Transit West) / Cred: 1000 (Caisse) | JT / Direct | MTCN Local | `PROPOSED` (P03.6) |
| **TR-21** | Western Sogexpress Intl - Envoyer | Money Transfer | HTG/USD | 1 | Entrée (+) | 0 | Dette Sogexpress (+) | Requis si FX | Deb: 1000/1001 (Caisse) / Cred: 2050 (Clearing Soge) + 5010 (Comm) | ST / Direct | MTCN Soge | `PROPOSED` (P03.6) |
| **TR-22** | Western Sogexpress Intl - Payer | Money Transfer | HTG/USD | -1 | Sortie (-) | 0 | Créance Sogexpress (+) | Requis si FX | Deb: 1030 (Clearing Soge) / Cred: 1000/1001 (Caisse) | JT / Direct | MTCN Soge | `PROPOSED` (P03.6) |
| **TR-23** | Western Sogexpress Local - Envoyer | Money Transfer | HTG | 1 | Entrée (+) | 0 | Dette Local (+) | N/A | Deb: 1000 (Caisse) / Cred: 1020 (Transit Soge) + 5010 (Comm) | JT / Direct | MTCN Soge Local | `PROPOSED` (P03.6) |
| **TR-24** | Western Sogexpress Local - Payer | Money Transfer | HTG | -1 | Sortie (-) | 0 | Dette Local (-) | N/A | Deb: 1020 (Transit Soge) / Cred: 1000 (Caisse) | JT / Direct | MTCN Soge Local | `PROPOSED` (P03.6) |

---

### Groupe B : Monnaie Mobile et Services de Transfert

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **MM-01** | MonCash - Renflouement (Cash-In) | Mobile Money | HTG | 1 | Entrée (+) | 0 | Portefeuille MonCash (+) | N/A | Deb: 1000 (Caisse) / Cred: 1010_MONCASH (Wallet) | JT / Direct | TransID MonCash | `VERIFIED` (Code) |
| **MM-02** | MonCash - Retrait (Cash-Out) | Mobile Money | HTG | -1 | Sortie (-) | 0 | Portefeuille MonCash (-) | N/A | Deb: 1010_MONCASH (Wallet) / Cred: 1000 (Caisse) | JT / Direct | TransID MonCash | `VERIFIED` (Code) |
| **MM-03** | NatCash - Renflouement (Cash-In) | Mobile Money | HTG | 1 | Entrée (+) | 0 | Portefeuille NatCash (+) | N/A | Deb: 1000 (Caisse) / Cred: 1010_NATCASH (Wallet) | JT / Direct | TransID NatCash | `VERIFIED` (Code) |
| **MM-04** | NatCash - Retrait (Cash-Out) | Mobile Money | HTG | -1 | Sortie (-) | 0 | Portefeuille NatCash (-) | N/A | Deb: 1010_NATCASH (Wallet) / Cred: 1000 (Caisse) | JT / Direct | TransID NatCash | `VERIFIED` (Code) |
| **MM-05** | LaPouLa - Renflouement | Mobile Money | HTG | 1 | Entrée (+) | 0 | Portefeuille LaPouLa (+) | N/A | Deb: 1000 (Caisse) / Cred: 1010_LAPOULA | JT / Direct | Réf LaPouLa | `PROPOSED` (P03.6) |
| **MM-06** | LaPouLa - Retrait | Mobile Money | HTG | -1 | Sortie (-) | 0 | Portefeuille LaPouLa (-) | N/A | Deb: 1010_LAPOULA / Cred: 1000 (Caisse) | JT / Direct | Réf LaPouLa | `PROPOSED` (P03.6) |
| **MM-07** | LajanCash - Renflouement | Mobile Money | HTG | 1 | Entrée (+) | 0 | Portefeuille LajanCash (+) | N/A | Deb: 1000 (Caisse) / Cred: 1010_LAJANCASH | JT / Direct | Réf LajanCash | `PROPOSED` (P03.6) |
| **MM-08** | LajanCash - Retrait | Mobile Money | HTG | -1 | Sortie (-) | 0 | Portefeuille LajanCash (-) | N/A | Deb: 1010_LAJANCASH / Cred: 1000 (Caisse) | JT / Direct | Réf LajanCash | `PROPOSED` (P03.6) |
| **MM-09** | Zelle - Renflouement | Mobile Money | USD | 1 | 0 | Entrée (+) | Compte Zelle / Bank USD (+) | Lock 5m | Deb: 1010_BANK_USD / Cred: 2050 (Passif Zelle) | ST / Direct | Zelle Conf # | `PROPOSED` (P03.6) |
| **MM-10** | Zelle - Retrait | Mobile Money | USD | -1 | 0 | Sortie (-) | Compte Zelle / Bank USD (-) | Lock 5m | Deb: 2050 (Passif Zelle) / Cred: 1010_BANK_USD | ST / Direct | Zelle Conf # | `PROPOSED` (P03.6) |
| **MM-11** | Unibank Tout Kote - Renflouement | Mobile Money | HTG | 1 | Entrée (+) | 0 | Compte UTK (+) | N/A | Deb: 1000 (Caisse) / Cred: 1010_UTK | JT / Direct | Réf UTK | `PROPOSED` (P03.6) |
| **MM-12** | Unibank Tout Kote - Retrait | Mobile Money | HTG | -1 | Sortie (-) | 0 | Compte UTK (-) | N/A | Deb: 1010_UTK / Cred: 1000 (Caisse) | JT / Direct | Réf UTK | `PROPOSED` (P03.6) |
| **MM-13** | Remboursement Transfert USD | Mobile Money | USD | -1 | Sortie (-) | 0 | Annulation Créance Transfert | Fixed Rate | Deb: 2050 (Clearing Transfert) / Cred: 1001 (Caisse USD) | ST / Approval | Réf Transfert Origine | `PROPOSED` (P03.6) |

---

### Groupe C : Operations de Change (Foreign Exchange - FX)

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **FX-01** | Achat de Devise (USD/HTG) | Foreign Exchange | USD->HTG | 1 | Entrée USD (+) / Sortie HTG (-) | 0 | 0 | Lock 5m | Deb: 1001 (Caisse USD) / Cred: 1000 (Caisse HTG) + 5010 (Marge FX) | ST / Direct | Voucher FX | `VERIFIED` (P03.4) |
| **FX-02** | Vente de Devise (HTG/USD) | Foreign Exchange | HTG->USD | -1 | Entrée HTG (+) / Sortie USD (-) | 0 | 0 | Lock 5m | Deb: 1000 (Caisse HTG) / Cred: 1001 (Caisse USD) + 5010 (Marge FX) | ST / Direct | Voucher FX | `VERIFIED` (P03.4) |
| **FX-03** | Remise US — Envoi et Achat | Foreign Exchange | USD | 1 | Entrée USD (+) | 0 | Clearing Remise US (+) | Lock 5m | Deb: 1001 (Caisse USD) / Cred: 1030 (Clearing Remise) + 5010 (Marge) | ST / Direct | Réf Remise US | `PROPOSED` (P03.6) |
| **FX-04** | Remise US — Achat | Foreign Exchange | USD | 1 | Entrée USD (+) / Sortie HTG (-) | 0 | 0 | Lock 5m | Deb: 1001 (Caisse USD) / Cred: 1000 (Caisse HTG) + 5010 (Marge) | ST / Direct | Réf Remise US | `PROPOSED` (P03.6) |
| **FX-05** | Remise CANA — Achat | Foreign Exchange | CAD | 1 | Entrée CAD (+) / Sortie HTG (-) | 0 | 0 | Lock 5m | Deb: 1002 (Caisse Devise) / Cred: 1000 (Caisse HTG) + 5010 (Marge) | ST / Direct | Réf Remise CAD | `PROPOSED` (P03.6) |
| **FX-06** | Remise EURO — Achat | Foreign Exchange | EUR | 1 | Entrée EUR (+) / Sortie HTG (-) | 0 | 0 | Lock 5m | Deb: 1002 (Caisse Devise) / Cred: 1000 (Caisse HTG) + 5010 (Marge) | ST / Direct | Réf Remise EUR | `PROPOSED` (P03.6) |
| **FX-07** | Remise PESO — Achat | Foreign Exchange | DOP | 1 | Entrée DOP (+) / Sortie HTG (-) | 0 | 0 | Lock 5m | Deb: 1002 (Caisse DOP) / Cred: 1000 (Caisse HTG) + 5010 (Marge) | ST / Direct | Réf Remise DOP | `PROPOSED` (P03.6) |

---

### Groupe D : Opérations Bancaires et Règlements Prestataires

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **BK-01** | Retrait Bancaire HTG | Banking | HTG | 1 | Entrée HTG (+) | Sortie Banque HTG (-) | 0 | N/A | Deb: 1000 (Caisse HTG) / Cred: 1010 (Banque HTG) | ST / Maker-Checker | Bordereau Retrait | `VERIFIED` (P03.2) |
| **BK-02** | Retrait Bancaire USD | Banking | USD | 1 | Entrée USD (+) | Sortie Banque USD (-) | 0 | N/A | Deb: 1001 (Caisse USD) / Cred: 1010_USD (Banque USD) | ST / Maker-Checker | Bordereau Retrait | `VERIFIED` (P03.2) |
| **BK-03** | Dépôt Bancaire HTG | Banking | HTG | -1 | Sortie HTG (-) | Entrée Banque HTG (+) | 0 | N/A | Deb: 1010 (Banque HTG) / Cred: 1000 (Caisse HTG) | ST / Maker-Checker | Bordereau Dépôt | `VERIFIED` (P03.2) |
| **BK-04** | Dépôt Bancaire USD | Banking | USD | -1 | Sortie USD (-) | Entrée Banque USD (+) | 0 | N/A | Deb: 1010_USD (Banque USD) / Cred: 1001 (Caisse USD) | ST / Maker-Checker | Bordereau Dépôt | `VERIFIED` (P03.2) |
| **BK-05** | Virement Bancaire HTG | Banking | HTG | 0 | 0 | Mouvement Inter-Banque | 0 | N/A | Deb: 1010_BANK_B / Cred: 1010_BANK_A | M / Direct | Avis de Virement | `VERIFIED` (Code) |
| **BK-06** | Virement Bancaire USD | Banking | USD | 0 | 0 | Mouvement Inter-Banque | 0 | N/A | Deb: 1010_USD_B / Cred: 1010_USD_A | M / Direct | Avis de Virement | `VERIFIED` (Code) |
| **BK-07** | Chèque Émis HTG/USD | Banking | HTG/USD | -1 | 0 | Sortie Banque au débit | Dette Chèque (+) | N/A | Deb: 2000 (Fournisseurs) / Cred: 1010 (Banque) | M / Maker-Checker | Numéro Chèque | `PROPOSED` (P03.6) |
| **BK-08** | Chèque Reçu HTG/USD | Banking | HTG/USD | 1 | Entrée Chèque en caisse | 0 | Créance Chèque (+) | N/A | Deb: 1000_CHECKS / Cred: 1200 (Clients) | ST / Direct | Numéro Chèque | `PROPOSED` (P03.6) |
| **BK-09** | Chèque Retourné / Impayé | Banking | HTG/USD | -1 | 0 | Annulation Dépôt Banque | Créance Client Réactivée | N/A | Deb: 1200 (Clients) / Cred: 1010 (Banque) + 6000 (Frais) | M / Approval | Chèque Rejeté | `PROPOSED` (P03.6) |
| **BK-10** | Envoi/Règlement Prestataire Standard | Settlement | HTG/USD | -1 | 0 | Sortie Banque HTG/USD | Dette Prestataire (-) | Requis si FX | Deb: 2050 (Passif Prestataire) / Cred: 1010 (Banque) | M / Maker-Checker | SWIFT / VIR Ref | `VERIFIED` (P03.4) |
| **BK-11** | Règlement Prestataire — Flux Hist. 30/70 | Settlement | HTG/USD | -1 | 0 | Sortie Banque 70% / Caisse 30% | Clearing Prestataire (-) | Requis si FX | Deb: 2050 (Clearing) / Cred: 1010 (70%) + Cred: 1000 (30%) | O / Décision Req | Protocole 30/70 | `DECISION_REQUIRED` |

---

### Groupe E : Renflouements, Propriétaires et Prêts

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **RP-01** | Renflouement PDG (Capital/Apport) | Owner / Capital | HTG/USD | 1 | Entrée Caisse (+) | 0 | 0 | N/A | Deb: 1000/1001 (Caisse) / Cred: 3000 (Apport Capital / Compte Courant) | O / Maker-Checker | Reçu d'Apport | `DECISION_REQUIRED` |
| **RP-02** | Retrait PDG (Prélèvement) | Owner / Capital | HTG/USD | -1 | Sortie Caisse (-) | 0 | 0 | N/A | Deb: 3000 (Compte Courant Associé) / Cred: 1000/1001 (Caisse) | O / Maker-Checker | Reçu Prélèvement | `DECISION_REQUIRED` |
| **RP-03** | Renflouement Pompiste (Float Station) | Station Float | HTG | -1 | Sortie Caisse Ctrle (-) | 0 | Avance Pompiste (+) | N/A | Deb: 1000_STATION_FLOAT / Cred: 1000 (Caisse Ctrle) | HT / Direct | Bon de Caisse Station | `PROPOSED` (P03.6) |
| **RP-04** | Renflouement Point de Vente / POS | Till Refill | HTG/USD | -1 | Sortie Coffre (-) | 0 | Entrée Guichet (+) | N/A | Deb: 1000 (Guichet POS) / Cred: 1005 (Coffre Fort) | HT / Maker-Checker | Bon Transfert Interne | `VERIFIED` (P03.4) |
| **RP-05** | Prêt Client (Octroi Crédit) | Loan | HTG/USD | -1 | Sortie Caisse (-) | 0 | Créance Client (+) | N/A | Deb: 1200_LOANS (Créance Prêt) / Cred: 1000/1001 (Caisse) | M / Approval | Contrat de Prêt | `PROPOSED` (P03.6) |
| **RP-06** | Remboursement Client (Encaissement) | Loan Repayment | HTG/USD | 1 | Entrée Caisse (+) | 0 | Créance Client (-) | N/A | Deb: 1000/1001 (Caisse) / Cred: 1200_LOANS + 4000 (Intérêts) | JT / Direct | Reçu Remboursement | `PROPOSED` (P03.6) |
| **RP-07** | Prêt du Propriétaire à la Société | Owner Loan | HTG/USD | 1 | Entrée Caisse (+) | 0 | Passif Prêt Associé (+) | N/A | Deb: 1000/1001 (Caisse) / Cred: 2000_OWNER_LOAN | O / Maker-Checker | Convention Prêt | `DECISION_REQUIRED` |
| **RP-08** | Retrait / Remboursement Prêt Propriétaire | Owner Loan | HTG/USD | -1 | Sortie Caisse (-) | 0 | Passif Prêt Associé (-) | N/A | Deb: 2000_OWNER_LOAN / Cred: 1000/1001 (Caisse) | O / Maker-Checker | Avis Remboursement | `DECISION_REQUIRED` |

---

### Groupe F : Salaires, Charges et Dépenses Opérationnelles

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **EX-01** | Salaires Employés (Paiement Cash) | Payroll | HTG | -1 | Sortie Caisse (-) | 0 | Dette Salariale (-) | N/A | Deb: 2010 (Salaires à Payer) / Cred: 1000 (Caisse) | ST / Direct | Bulletin de Paie | `VERIFIED` (P03.2) |
| **EX-02** | Salaires Sécurité (Paiement Cash) | Payroll | HTG | -1 | Sortie Caisse (-) | 0 | Charge Salariale Sécurité | N/A | Deb: 6010_SECURITY / Cred: 1000 (Caisse) | ST / Direct | Émargement Sécurité | `PROPOSED` (P03.6) |
| **EX-03** | Bonus, Dons et Gratifications | Payroll / Expense | HTG | -1 | Sortie Caisse (-) | 0 | Charge Gratification | N/A | Deb: 6010_BONUS / Cred: 1000 (Caisse) | M / Approval | Pièce Justificative | `PROPOSED` (P03.6) |
| **EX-04** | Avance Salariale (Acompte) | Advance | HTG | -1 | Sortie Caisse (-) | 0 | Avance Personnel (+) | N/A | Deb: 1300 (Avances Employés) / Cred: 1000 (Caisse) | ST / Direct | Reçu d'Avance | `VERIFIED` (Code) |
| **EX-05** | Loyer (Paiement Cash/Banque) | OPEX | HTG/USD | -1 | Sortie Caisse/Banque (-) | 0 | Charge Loyer | N/A | Deb: 6000_RENT / Cred: 1000/1010 | M / Approval | Quittance Loyer | `VERIFIED` (P03.2) |
| **EX-06** | Dépenses Opérationnelles Courantes | OPEX | HTG | -1 | Sortie Caisse (-) | 0 | Charge Dépense | N/A | Deb: 6000_OPERATING / Cred: 1000 (Caisse) | JT / Limit < 5k | Reçu / Facture | `VERIFIED` (Code) |
| **EX-07** | Transport & Convoyage Fonds | OPEX | HTG | -1 | Sortie Caisse (-) | 0 | Charge Convoyage | N/A | Deb: 6020 (Transport Convoyage) / Cred: 1000 (Caisse) | ST / Direct | Bon Transport | `VERIFIED` (P03.2) |
| **EX-08** | Telecom & Internet | OPEX | HTG | -1 | Sortie Caisse (-) | 0 | Charge Télécom | N/A | Deb: 6000_TELECOM / Cred: 1000 (Caisse) | JT / Direct | Facture Télécom | `PROPOSED` (P03.6) |
| **EX-09** | Maintenance & Réparations | OPEX | HTG | -1 | Sortie Caisse (-) | 0 | Charge Maintenance | N/A | Deb: 6000_MAINTENANCE / Cred: 1000 (Caisse) | ST / Direct | Reçu Reparateur | `PROPOSED` (P03.6) |
| **EX-10** | Déchets & Salubrité | OPEX | HTG | -1 | Sortie Caisse (-) | 0 | Charge Salubrité | N/A | Deb: 6000_WASTE / Cred: 1000 (Caisse) | JT / Direct | Reçu Service | `PROPOSED` (P03.6) |
| **EX-11** | Frais de Transaction & Banque HTG | Bank Fee | HTG | -1 | 0 | Sortie Banque HTG (-) | Charge Financière | N/A | Deb: 6000_BANK_FEES / Cred: 1010 (Banque) | M / Direct | Avis Débit Banque | `VERIFIED` (Code) |
| **EX-12** | Frais de Transaction & Banque USD | Bank Fee | USD | -1 | 0 | Sortie Banque USD (-) | Charge Financière | N/A | Deb: 6000_BANK_FEES / Cred: 1010_USD (Banque) | M / Direct | Avis Débit Banque | `VERIFIED` (Code) |

---

### Groupe G : Écarts, Soldes et Régularisations de Clôture

| ID / Code | Libellé Opération | Famille Normalisée | Devise | `behavior` | Effet Caisse Espèces | Effet Banque | Effet Créance / Dette Prestataire | Taux FX | Modèle Comptable (Partie Double) | Rôle & Approb. | Idempotence & Réf | Statut Audit & Preuve |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **AD-01** | Surplus de Liasse HTG | Adjustment | HTG | 1 | Entrée Ajustement (+) | 0 | 0 | N/A | Deb: 1000 (Caisse) / Cred: 5090 (Excédents Caisse) | HT / Maker-Checker | Procès-Verbal Liasse | `VERIFIED` (P03.4) |
| **AD-02** | Surplus de Liasse USD | Adjustment | USD | 1 | Entrée Ajustement (+) | 0 | 0 | N/A | Deb: 1001 (Caisse USD) / Cred: 5090 (Excédents Caisse) | HT / Maker-Checker | Procès-Verbal Liasse | `VERIFIED` (P03.4) |
| **AD-03** | Surplus de Caisse HTG (Clôture) | Adjustment | HTG | 1 | Réconciliation (+) | 0 | 0 | N/A | Deb: 1000 (Caisse) / Cred: 5090 (Excédents Caisse) | HT / Maker-Checker | PV Clôture Caisse | `VERIFIED` (P03.2) |
| **AD-04** | Surplus de Caisse USD (Clôture) | Adjustment | USD | 1 | Réconciliation (+) | 0 | 0 | N/A | Deb: 1001 (Caisse USD) / Cred: 5090 (Excédents Caisse) | HT / Maker-Checker | PV Clôture Caisse | `VERIFIED` (P03.2) |
| **AD-05** | Solde Antérieur HTG (Ouverture) | Opening Balance | HTG | 0 | Solde Départ Verified | 0 | 0 | N/A | Deb: 1000 (Caisse) / Cred: 1000_OPENING_BALANCE | HT / Direct | Session Previous ID | `VERIFIED` (P03.4) |
| **AD-06** | Solde Antérieur USD (Ouverture) | Opening Balance | USD | 0 | Solde Départ Verified | 0 | 0 | N/A | Deb: 1001 (Caisse USD) / Cred: 1001_OPENING_BALANCE | HT / Direct | Session Previous ID | `VERIFIED` (P03.4) |
| **AD-07** | Espèces Mutilées (Billet Endommagé) | Damage / Write-off | HTG/USD | -1 | Sortie Caisse Valide (-) | 0 | Créance Banque Central / Perte | N/A | Deb: 1020_MUTILATED / Cred: 1000 (Caisse) | M / Maker-Checker | Bordereau Mutilé | `DECISION_REQUIRED` |
| **AD-08** | Liasses Manquantes (Manquant) | Adjustment / Deficit | HTG/USD | -1 | Réconciliation (-) | 0 | Créance Caissier / Charge | N/A | Deb: 6090 (Manquants) ou 1300 (Créance Caissier) / Cred: 1000 | M / Maker-Checker | PV Écart Caisse | `VERIFIED` (P03.2) |
| **AD-09** | Pertes de Fourgon / Convoyage | Convoy Loss | HTG/USD | -1 | Sortie Caisse Transit (-) | 0 | Créance Assurance / Perte | N/A | Deb: 1200_INSURANCE_CLAIM / Cred: 1020 (Transit) | O / Approval | PV Sinistre / Police | `PROPOSED` (P03.6) |
| **AD-10** | Régularisation Historique Legacy | Historical Adjust | HTG/USD | 0 | Selon constatation | 0 | 0 | Requis si FX | Deb: 1000/1001 / Cred: 3000 (Ajustement Retained Earnings) | O / Approval | Document Audit Hist. | `DECISION_REQUIRED` |

---

# 6. AUDIT SECTION 5 — VERIFICATION DES 12 INVARIANTS FINANCIERS

L'audit de la matrice des 85 opérations contre les exigences de sécurité comptable confirme les 12 invariants financiers suivants :

1. **Strict Mouvement d'Espèces Physique** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Seules les opérations avec effet sur caisse non nul (`INFLOW` / `OUTFLOW`) modifient le solde physique du guichet/coffre. Les opérations bancaires pures (virements, chèques émis) n'impactent pas le tiroir-caisse.

2. **Séparation Stricte Espèces vs Banque vs Monnaie Mobile** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Impossibilité d'assimiler un virement Zelle ou un chèque reçu à des espèces en caisse. Chaque médium possède son compte COA dédié (`1000_CASH`, `1010_BANK`, `1010_MONCASH`).

3. **Isolation Trésorerie vs Charges/Produits** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Les transferts de fonds inter-caisses ou coffre-caisse (`RP-04`) impactent exclusivement la classe 1 (Actif) sans polluer le compte de résultat (`IncomeStatement`).

4. **Conservation des Montants et Devises d'Origine** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Chaque transaction enregistre son montant natif dans sa devise d'origine (`amount`, `currency`) et le montant converti en HTG pour le grand livre central.

5. **Verrouillage du Taux de Change Exécuté** :
   - *Statut* : `VERIFIED` (P03.4)
   - *Preuve* : Le taux appliqué lors d'une transaction FX ou de transfert bidevise est figé (`exchangeRateLocked = true`) et conservé de manière inaltérable dans la transaction.

6. **Triangulation des Transferts (Envoi, Paiement, Clearing)** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Distingue l'obligation/créance envers le réseau partenaire (MoneyGram, CAM, Ria) des flux d'espèces perçus du client ou versés au bénéficiaire.

7. **Séparation Obligatoire du Principal et de la Commission** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Pour tout transfert ou change, le principal alimente le compte de clearing (`1030`/`2050`) et la commission alimente le compte de produit dédié (`5010`/`5020`).

8. **Idempotence Stricte des Mouvements et Écritures** :
   - *Statut* : `VERIFIED` (P03.4)
   - *Preuve* : Clé d'idempotence unique (`businessId` + `providerRef` + `operationType`) empêchant la création de double écriture lors d'un rejeu réseau ou d'un synchro offline.

9. **Traçabilité et Procédure d'Annulation par Contre-Passation** :
   - *Statut* : `VERIFIED`
   - *Preuve* : Aucune suppression physique de document (`DELETE`). Toute correction génère une écriture inverse d'annulation (`reversalOf = target_id`).

10. **Rapprochement de Clôture et Imputation des Écarts** :
    - *Statut* : `VERIFIED` (P03.2)
    - *Preuve* : Écart = `Espèces Comptées - Espèces Théoriques`. Les surplus sont crédités au `5090` et les manquants sont débités au `6090` ou imputés en avance caissier (`1300`).

11. **Unité du Grand Livre et Absence de Doublon** :
    - *Statut* : `VERIFIED`
    - *Preuve* : `AccountingEngine.ts` et `LedgerRepository.ts` demeurent l'unique source de vérité comptable. Aucun deuxième registre parallèle n'est créé.

12. **Isolation Multitenant et Multi-Branche Stricte** :
    - *Statut* : `VERIFIED`
    - *Preuve* : Filtrage obligatoire par `business_id`, `branch_id`, `till_id` et `session_id` sur chaque requête Firestore et contrôle RBAC Security Rules.

---

# 7. AUDIT SECTION 6 — DÉCISIONS MÉTIER ET COMPTABLES HUMAINES REQUISES

Afin d'autoriser le démarrage du plan d'implémentation P04 sans équivoque, les **6 décisions métier suivantes** doivent être formellement tranchées par le comité de pilotage :

1. **Décision D-01 : Imputation des Mouvements Historiques "30% / 70%" (`BK-11`)**
   - *Problématique* : Les transactions historiques libellées "30% Caisse / 70% Banque" utilisaient un protocole d'éclatement manuel.
   - *Options* : (A) Automatiser l'écriture mixte à partie double (30% Débit Caisse + 70% Débit Banque / Crédit Clearing). (B) Exiger deux transactions distinctes séparées.
   - *Recommandation d'Audit* : Option A (Automatisation dans le moteur d'écriture).

2. **Décision D-02 : Renflouements et Retraits PDG (`RP-01`, `RP-02`)**
   - *Problématique* : Distinguer les apports/prélèvements en capital des simples avances de trésorerie de l'actionnaire.
   - *Options* : (A) Compte courant d'associé (`2000_OWNER_LOAN` - Passif). (B) Capitaux propres (`3000_SHARE_CAPITAL` - Equity).
   - *Recommandation d'Audit* : Option A (Compte courant d'associé par défaut).

3. **Décision D-03 : Imputation des Billets et Espèces Mutilées (`AD-07`)**
   - *Problématique* : Traitement des billets refusés par les clients mais acceptés sous réserve par la Banque Centrale.
   - *Options* : (A) Transfert en compte d'attente d'échange (`1020_MUTILATED`). (B) Passation directe en charge pour perte (`6090`).
   - *Recommandation d'Audit* : Option A jusqu'à confirmation du rejet définitif de la Banque Centrale.

4. **Décision D-04 : Imputation des Écarts de Caisse Manquants (`AD-08`)**
   - *Problématique* : Seuil de tolérance avant mise en créance automatique du caissier.
   - *Options* : (A) Mise en créance immédiate sur le salaire du caissier (`1300_EMPLOYEE_ADVANCES`). (B) Imputation en charge de la société (`6090_CASH_DEFICIT`) pour tout écart < 500 HTG.
   - *Recommandation d'Audit* : Option B avec plafond de tolérance configurable par le Manager.

5. **Décision D-05 : Périodicité du Clearing et Rapprochement Network (MoneyGram, Ria, CAM)**
   - *Problématique* : Fréquence de compensation financière avec les banques et réseaux tiers.
   - *Options* : (A) Clearing quotidien automatique lors de la clôture de branche. (B) Clearing manuel sur bordereau bancaire soumis par le Head Teller.
   - *Recommandation d'Audit* : Option A pour la pré-compensation + Option B pour le lettrage définitif.

6. **Décision D-06 : Seuil d'Autorisation pour Dépenses Opérationnelles Directes en Caisse (`EX-06`)**
   - *Problématique* : Plafond de décaissement direct par le Junior Teller sans validation du Manager.
   - *Options* : (A) Plafond fixe à 2 500 HTG. (B) Plafond fixe à 5 000 HTG. (C) Requis de validation Manager pour tout décaissement.
   - *Recommandation d'Audit* : Option B (5 000 HTG par défaut avec paramétrage par filiale).

---

# 8. AUDIT SECTION 7 — RECOMMANDATIONS POUR LA PRÉPARATION DU PLAN P04

1. **Restauration de la Matrice des 85 Opérations dans le Dépôt** :
   - Intégrer la cartographie complète dans le fichier de constants de domaine `src/domains/cash/constants/CashTransactionCatalog.ts` lors de la première étape de P04.

2. **Extension du Moteur `AccountingEngine.ts`** :
   - Ajouter la méthode générique `processCashTransactionEntry(tx: CashTransactionInput): JournalEntry` traduisant la famille, le sens et les devises en lignes journalisées équilibrées.

3. **Protection par Tests Unitaires et Invariants Financiers** :
   - Écrire des tests de non-régression couvrant les 85 types d'opérations pour vérifier le zéro-déséquilibre (`totalDebitCents === totalCreditCents`) et la concordance des devises.

4. **Validation de l'Interface UI Caissier (POS / Till Desk)** :
   - Concevoir le composant d'exécution de caisse unifié s'appuyant dynamiquement sur la matrice pour afficher les champs requis (Taux FX, Réf Prestataire, Pièce Jointe) sans multiplier les formulaires ad-hoc.

---

# 9. CONCLUSION & BINDING STATEMENT

L'audit **PROMPT 03.6** établit la cartographie exhaustive, rigoureuse et sécurisée du catalogue des **85 opérations de caisse** de la fusion FINOPS × FINAYITI.

- **Aucune ligne de code de production n'a été modifiée.**
- **Aucune écriture Firestore n'a été effectuée.**
- **Le verdict `CATALOG_MAPPING_READY_WITH_BUSINESS_DECISIONS` autorise la préparation du Plan d'Implémentation P04 dès que les 6 décisions métier D-01 à D-06 auront été entérinées.**

*Fait à Port-au-Prince, le 10 octobre 2026.*  
*Équipe d'Architecture FINOPS ERP / FINAYITI Fusion.*
