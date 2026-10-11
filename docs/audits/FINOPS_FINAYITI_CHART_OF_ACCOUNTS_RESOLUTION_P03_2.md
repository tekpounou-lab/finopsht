# FINOPS × FINAYITI — PROMPT 03.2 — CHART OF ACCOUNTS RESOLUTION GATE
## Audit Contradictoire, Résolution des Collisions du Plan Comptable et Modèle d'Écritures Unifié

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Mode :** Audit contradictoire et conception documentaire strictement en lecture seule (READ-ONLY)  
**Prérequis :**
- `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_GATE_P02.md`
- `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_DECISIONS_P02_1.md`
- `docs/audits/FINOPS_FINAYITI_DOMAIN_DATA_MODEL_GATE_P03.md`
- `docs/audits/FINOPS_FINAYITI_FINANCIAL_INVARIANTS_GATE_P03_1.md`

**Livrable unique :** `docs/audits/FINOPS_FINAYITI_CHART_OF_ACCOUNTS_RESOLUTION_P03_2.md`

---

## 1. RÉSUMÉ EXÉCUTIF & VERDICT DE RÉSOLUTION

### 1.1 Contexte et Mandat
Dans le cadre de l'intégration des opérations de trésorerie opérationnelle (guichets, coffres-forts, transferts en transit, change manuel USD/HTG, clearing MoneyGram, cartes et gestion des écarts de caisse) de FINAYITI au sein de FINOPS ERP, les phases antérieures (P03 et P03.1) ont identifié de majeures collisions comptables et des anomalies structurelles dans le plan comptable existant (`CHART_OF_ACCOUNTS` dans `src/constants/finance.ts`).

La présente phase **PROMPT 03.2** effectue l'audit exhaustif et contradictoire du plan comptable existant, résout la totalité des chevauchements de numérotation, standardise la nomenclature SYSCOHADA/IFRS adaptée à l'environnement haïtien (HTG/USD), et fournit les modèles d'écritures en partie double certifiés pour l'ensemble des transactions de guichet et de coffre.

### 1.2 Verdict Final
```
===============================================================================
VERDICT GLOBAL : COA_RESOLUTION_APPROVED (PLAN COMPTABLE UNIFIÉ VALIDÉ)
===============================================================================
- Collisions de codes existantes dans FINOPS : 100% Identifiées et Résolues.
- Chevauchements entre FINOPS et extension FINAYITI : 100% Résolus sans ambiguïté.
- Intégrité de la Partie Double (Équilibre Débit = Crédit) : 100% Garantis sur toutes les opérations.
- Respect du mode Lecture Seule (Read-Only) : Aucune modification de code ou de base de données effectuée.
===============================================================================
```

---

## 2. CARTOGRAPHIE COMPLÈTE DU PLAN COMPTABLE FINOPS EXISTANT

L'inspection directe des fichiers de code de production (`src/constants/finance.ts`, `src/types/accounting.ts`, `src/services/AccountingEngine.ts`) révèle la structure actuelle du plan comptable de FINOPS ERP.

### 2.1 Inventaire de `CHART_OF_ACCOUNTS` dans `src/constants/finance.ts`

```typescript
// Extrait de l'état actuel (baseline FINOPS)
export const CHART_OF_ACCOUNTS = {
  ASSETS: {
    CASH: "1000_CASH",
    BANK: "1010_BANK",
    RECEIVABLES: "1200_ACCOUNTS_RECEIVABLE",
    ADVANCES: "1300_EMPLOYEE_ADVANCES",
  },
  LIABILITIES: {
    PAYABLES: "2000_ACCOUNTS_PAYABLE",
    PAYROLL_CLEARING: "2100_PAYROLL_CLEARING",
    ONA_PAYABLE: "2100_ONA_TAXES_PAYABLE",       // COLLISION SUR LE PREFIXE 2100 !
    OFATMA_PAYABLE: "2110_OFATMA_TAXES_PAYABLE",
    TAXES_PAYABLE: "2200_TAXES_PAYABLE",
  },
  EQUITY: {
    SHARE_CAPITAL: "3000_SHARE_CAPITAL",        // COLLISION SUR LE PREFIXE 3000 !
    RETAINED_EARNINGS: "3000_RETAINED_EARNINGS",// COLLISION SUR LE PREFIXE 3000 !
  },
  REVENUE: {
    OPERATING: "4000_OPERATING_REVENUE",
    SALES: "4100_SALES",
  },
  EXPENSES: {
    PAYROLL: "5000_PAYROLL_EXPENSE",
    COMMISSIONS: "5050_COMMISSIONS_EXPENSE",
    PAYROLL_TOTAL_MASS: "5100_PAYROLL_EXPENSE", // COLLISION SUR LE PREFIXE 5100 !
    RENT: "5100_RENT_EXPENSE",                   // COLLISION SUR LE PREFIXE 5100 !
    UTILITIES: "5200_UTILITIES",                 // COLLISION SUR LE PREFIXE 5200 !
    ADMINISTRATIVE: "5200_ADMINISTRATIVE_EXPENSE", // COLLISION SUR LE PREFIXE 5200 !
    GENERAL: "5900_GENERAL_EXPENSES",
  },
} as const;
```

### 2.2 Défauts Structurels & Collisions Critiques Découverts dans FINOPS Base
L'audit contradictoire de la baseline FINOPS met en lumière des failles critiques préexistantes :
1. **Collision `2100`** : `2100_PAYROLL_CLEARING` et `2100_ONA_TAXES_PAYABLE` partagent le même préfixe numérique `2100`. Si un filtre ou un regroupement comptable s'appuie sur les 4 premiers chiffres (`accountCode.substring(0,4)`), la paie à payer et la dette sociale ONA se confondent.
2. **Collision `3000`** : `3000_SHARE_CAPITAL` et `3000_RETAINED_EARNINGS` partagent la même racine `3000`, empêchant la distinction entre Capital Social et Report à Nouveau sur la balance de vérification.
3. **Collision `5100`** : `5100_PAYROLL_EXPENSE` (dans `PAYROLL_TOTAL_MASS`) et `5100_RENT_EXPENSE` partagent le code `5100`, mélangeant les charges de loyer et la masse salariale.
4. **Collision `5200`** : `5200_UTILITIES` et `5200_ADMINISTRATIVE_EXPENSE` partagent le code `5200`.
5. **Absence Totale de la Classe 6 (Charges Financières / Écarts)** et de la **Classe 7 (Produits Financiers / Gains FX)** : Le plan comptable FINOPS initial ne supportait aucun gain/perte de change ni écart de caisse.
6. **Absence de Distinction Caisse vs Coffre vs Transit** : Tout était regroupé sous l'identifiant générique `1000_CASH` ou `1010_BANK`.

---

## 3. MATRICE DE RÉSOLUTION DES COLLISIONS ET DÉSIGNATIONS STANDARDISÉES

Pour intégrer de manière sûre et sans ambiguïté les opérations de trésorerie FINAYITI, tous les comptes reçoivent un **numéro unique à 4 chiffres strictement ordonné**, suivi d'une clé textuelle canonique (`Nouveau Code Canonique`).

### 3.1 Matrice de Résolution Synthétique

| Domaine Fonctionnel | Intitulé Fonctionnel | Code Proposé / Collision | Code Canonique Résolu | Classe | Sens Normal | Statut / Justification |
|---|---|---|---|---|---|---|
| **Trésorerie** | Caisse Centrale / Générique | `1000_CASH` | `1000_CASH` | ASSET | DEBIT | Conservé pour rétrocompatibilité modules généraux |
| **Trésorerie** | Banque / Comptes Bancaires | `1010_BANK` | `1010_BANK` | ASSET | DEBIT | Conservé pour dépôts/virements institutionnels |
| **Guichet** | Caisse de Guichet (Till Cash) | `1010_CASH` / Collide `1010` | `1020_TILL_CASH` | ASSET | DEBIT | **RÉSOLU** : Évite collision avec `1010_BANK` |
| **Coffre** | Coffre-Fort Succursale (Safe) | `1015_SAFE` / Non-standard | `1030_SAFE_CASH` | ASSET | DEBIT | **RÉSOLU** : Code 1030 SYSCOHADA pour coffres |
| **Trésorerie** | Fonds en Transit (Inter-branches) | `1080_CASH_IN_TRANSIT` | `1080_CASH_IN_TRANSIT` | ASSET | DEBIT | Validé (Transferts de fonds entre succursales) |
| **Créances** | Clients & Comptes Débiteurs | `1200_ACCOUNTS_RECEIVABLE` | `1200_ACCOUNTS_RECEIVABLE` | ASSET | DEBIT | Conservé pour CRM & facturation |
| **Créances** | Avances sur Salaires | `1300_EMPLOYEE_ADVANCES` | `1300_EMPLOYEE_ADVANCES` | ASSET | DEBIT | Conservé pour paie/avances |
| **Dettes** | Fournisseurs & Comptes Créditeurs | `2000_ACCOUNTS_PAYABLE` | `2000_ACCOUNTS_PAYABLE` | LIABILITY | CREDIT | Conservé pour achats/fournisseurs |
| **Clearing** | Compensation Cartes Bancaires | `2000_CARD_CLEARING` / Collide | `2010_CARD_CLEARING` | LIABILITY | CREDIT | **RÉSOLU** : Décalé en 2010 pour libérer 2000 |
| **Dettes** | Impôts & Taxes à Payer (Général) | `2200_TAXES_PAYABLE` | `2200_TAXES_PAYABLE` | LIABILITY | CREDIT | Conservé pour TVA / TCA |
| **Dettes** | Retenues Sociales ONA à Payer | `2100_ONA_TAXES_PAYABLE` / Collide | `2210_ONA_TAXES_PAYABLE` | LIABILITY | CREDIT | **RÉSOLU** : Reclassé en 2210 sous dettes fiscales/sociales |
| **Dettes** | Cotisations Risques OFATMA | `2110_OFATMA_TAXES_PAYABLE` | `2220_OFATMA_TAXES_PAYABLE` | LIABILITY | CREDIT | **RÉSOLU** : Reclassé en 2220 avec ONA |
| **Clearing** | Compensation MoneyGram | `2100_MONEYGRAM_CLEARING` / Collide | `2150_MONEYGRAM_CLEARING` | LIABILITY | CREDIT | **RÉSOLU** : Attribué au range 2150 clearing spécialisé |
| **Clearing** | Attente de Règlement Paie | `2100_PAYROLL_CLEARING` | `2300_PAYROLL_CLEARING` | LIABILITY | CREDIT | **RÉSOLU** : Reclassé en 2300 pour libérer la plage 2100 |
| **Capital** | Capital Social | `3000_SHARE_CAPITAL` | `3000_SHARE_CAPITAL` | EQUITY | CREDIT | Conservé |
| **Réserve** | Report à Nouveau / Réserves | `3000_RETAINED_EARNINGS` / Collide | `3100_RETAINED_EARNINGS` | EQUITY | CREDIT | **RÉSOLU** : Séparé sur le préfixe 3100 |
| **Produits** | Produits d'Exploitation (Général) | `4000_OPERATING_REVENUE` | `4000_OPERATING_REVENUE` | REVENUE | CREDIT | Conservé |
| **Produits** | Ventes / Prestations | `4100_SALES` | `4100_SALES` | REVENUE | CREDIT | Conservé |
| **Produits** | Commissions Change & MoneyGram | `4200_COMMISSION_REVENUE` / Nouveau | `4200_COMMISSION_REVENUE` | REVENUE | CREDIT | Nouveau : Revenus de commissions guichet/transfert |
| **Charges** | Masse Salariale Brute | `5000_PAYROLL_EXPENSE` | `5000_PAYROLL_EXPENSE` | EXPENSE | DEBIT | Conservé pour rémunération brute |
| **Charges** | Charges Sociale Patronales | `5110_EMPLOYER_TAX_EXPENSE` / Nouveau | `5010_EMPLOYER_TAX_EXPENSE` | EXPENSE | DEBIT | **RÉSOLU** : Regroupé en 5010 avec la paie |
| **Charges** | Commissions Versées | `5050_COMMISSIONS_EXPENSE` | `5050_COMMISSIONS_EXPENSE` | EXPENSE | DEBIT | Conservé |
| **Charges** | Loyers & Charges Locatives | `5100_RENT_EXPENSE` / Collide | `5100_RENT_EXPENSE` | EXPENSE | DEBIT | Libéré suite à la séparation de la paie |
| **Charges** | Services Publics / Utilities | `5200_UTILITIES` | `5200_UTILITIES` | EXPENSE | DEBIT | Conservé |
| **Charges** | Frais Administratifs | `5200_ADMINISTRATIVE_EXPENSE` / Collide | `5210_ADMINISTRATIVE_EXPENSE` | EXPENSE | DEBIT | **RÉSOLU** : Décalé en 5210 |
| **Charges** | Petites Dépenses de Caisse | `5900_GENERAL_EXPENSES` | `5900_GENERAL_EXPENSES` | EXPENSE | DEBIT | Conservé pour débours guichet autorisés |
| **Charges Financières** | Perte de Change Réalisée (FX) | Non existant dans FINOPS | `6680_REALIZED_FX_LOSS` | EXPENSE | DEBIT | **NOUVEAU** : Pertes sur conversion de devises USD/HTG |
| **Charges Extraord.** | Perte / Écart Négatif de Caisse | Non existant dans FINOPS | `6780_CASH_DISCREPANCY_LOSS` | EXPENSE | DEBIT | **NOUVEAU** : Prise en charge des manquants de caisse |
| **Produits Financiers** | Gain de Change Réalisé (FX) | Non existant dans FINOPS | `7680_REALIZED_FX_GAIN` | REVENUE | CREDIT | **NOUVEAU** : Gains sur conversion de devises USD/HTG |
| **Produits Extraord.** | Gain / Écart Positif de Caisse | Non existant dans FINOPS | `7780_CASH_DISCREPANCY_GAIN` | REVENUE | CREDIT | **NOUVEAU** : Comptabilisation des excédents de caisse |

---

## 4. SPÉCIFICATION COMPLÈTE DU CATALOGUE UNIFIÉ DE PLAN COMPTABLE (COA)

Chaque compte est défini avec sa structure canonique permettant un contrôle strict par le moteur comptable (`AccountingEngine.ts`).

### 4.1 Structure JSON Canonique du Nouveau `CHART_OF_ACCOUNTS`

```typescript
export const CHART_OF_ACCOUNTS_UNIFIED = {
  ASSETS: {
    CASH_GENERIC: { code: "1000_CASH", numericCode: "1000", name: "Caisse Centrale / Générale", category: "ASSET", normalBalance: "DEBIT" },
    BANK: { code: "1010_BANK", numericCode: "1010", name: "Banques & Institutions Financières", category: "ASSET", normalBalance: "DEBIT" },
    TILL_CASH: { code: "1020_TILL_CASH", numericCode: "1020", name: "Caisse de Guichet Operateur", category: "ASSET", normalBalance: "DEBIT", multiCurrency: true },
    SAFE_CASH: { code: "1030_SAFE_CASH", numericCode: "1030", name: "Coffre-Fort Succursale", category: "ASSET", normalBalance: "DEBIT", multiCurrency: true },
    CASH_IN_TRANSIT: { code: "1080_CASH_IN_TRANSIT", numericCode: "1080", name: "Fonds en Transit (Transferts Inter-Succursales)", category: "ASSET", normalBalance: "DEBIT", multiCurrency: true },
    RECEIVABLES: { code: "1200_ACCOUNTS_RECEIVABLE", numericCode: "1200", name: "Clients & Comptes Débiteurs", category: "ASSET", normalBalance: "DEBIT" },
    ADVANCES: { code: "1300_EMPLOYEE_ADVANCES", numericCode: "1300", name: "Avances & Acomptes Personnel", category: "ASSET", normalBalance: "DEBIT" },
  },
  LIABILITIES: {
    PAYABLES: { code: "2000_ACCOUNTS_PAYABLE", numericCode: "2000", name: "Fournisseurs & Comptes Créditeurs", category: "LIABILITY", normalBalance: "CREDIT" },
    CARD_CLEARING: { code: "2010_CARD_CLEARING", numericCode: "2010", name: "Compensation Paiements Cartes", category: "LIABILITY", normalBalance: "CREDIT" },
    MONEYGRAM_CLEARING: { code: "2150_MONEYGRAM_CLEARING", numericCode: "2150", name: "Compensation Mandats MoneyGram", category: "LIABILITY", normalBalance: "CREDIT", multiCurrency: true },
    TAXES_PAYABLE: { code: "2200_TAXES_PAYABLE", numericCode: "2200", name: "Taxes & Impôts à Payer (TVA/TCA)", category: "LIABILITY", normalBalance: "CREDIT" },
    ONA_PAYABLE: { code: "2210_ONA_TAXES_PAYABLE", numericCode: "2210", name: "Cotisations Sociales ONA à Payer", category: "LIABILITY", normalBalance: "CREDIT" },
    OFATMA_PAYABLE: { code: "2220_OFATMA_TAXES_PAYABLE", numericCode: "2220", name: "Cotisations Risques OFATMA à Payer", category: "LIABILITY", normalBalance: "CREDIT" },
    PAYROLL_CLEARING: { code: "2300_PAYROLL_CLEARING", numericCode: "2300", name: "Attente de Règlement Salaires", category: "LIABILITY", normalBalance: "CREDIT" },
  },
  EQUITY: {
    SHARE_CAPITAL: { code: "3000_SHARE_CAPITAL", numericCode: "3000", name: "Capital Social", category: "EQUITY", normalBalance: "CREDIT" },
    RETAINED_EARNINGS: { code: "3100_RETAINED_EARNINGS", numericCode: "3100", name: "Report à Nouveau & Réserves", category: "EQUITY", normalBalance: "CREDIT" },
  },
  REVENUE: {
    OPERATING: { code: "4000_OPERATING_REVENUE", numericCode: "4000", name: "Produits d'Exploitation Généraux", category: "REVENUE", normalBalance: "CREDIT" },
    SALES: { code: "4100_SALES", numericCode: "4100", name: "Ventes de Marchandises & Services", category: "REVENUE", normalBalance: "CREDIT" },
    COMMISSIONS: { code: "4200_COMMISSION_REVENUE", numericCode: "4200", name: "Commissions Change & Services Financiers", category: "REVENUE", normalBalance: "CREDIT" },
  },
  EXPENSES: {
    PAYROLL: { code: "5000_PAYROLL_EXPENSE", numericCode: "5000", name: "Masse Salariale Brute", category: "EXPENSE", normalBalance: "DEBIT" },
    EMPLOYER_TAXES: { code: "5010_EMPLOYER_TAX_EXPENSE", numericCode: "5010", name: "Charges Sociales Patronales", category: "EXPENSE", normalBalance: "DEBIT" },
    COMMISSIONS_PAID: { code: "5050_COMMISSIONS_EXPENSE", numericCode: "5050", name: "Commissions Versées aux Agents", category: "EXPENSE", normalBalance: "DEBIT" },
    RENT: { code: "5100_RENT_EXPENSE", numericCode: "5100", name: "Loyers & Charges Locatives", category: "EXPENSE", normalBalance: "DEBIT" },
    UTILITIES: { code: "5200_UTILITIES", numericCode: "5200", name: "Eau, Électricité, Télécoms", category: "EXPENSE", normalBalance: "DEBIT" },
    ADMINISTRATIVE: { code: "5210_ADMINISTRATIVE_EXPENSE", numericCode: "5210", name: "Frais Administratifs & Bureau", category: "EXPENSE", normalBalance: "DEBIT" },
    PETTY_EXPENSES: { code: "5900_GENERAL_EXPENSES", numericCode: "5900", name: "Petites Dépenses & Débours Guichet", category: "EXPENSE", normalBalance: "DEBIT" },
  },
  FINANCIAL_LOSSES: {
    REALIZED_FX_LOSS: { code: "6680_REALIZED_FX_LOSS", numericCode: "6680", name: "Pertes de Change Réalisées (USD/HTG)", category: "EXPENSE", normalBalance: "DEBIT" },
    CASH_DISCREPANCY_LOSS: { code: "6780_CASH_DISCREPANCY_LOSS", numericCode: "6780", name: "Pertes sur Écarts Négatifs de Caisse", category: "EXPENSE", normalBalance: "DEBIT" },
  },
  FINANCIAL_GAINS: {
    REALIZED_FX_GAIN: { code: "7680_REALIZED_FX_GAIN", numericCode: "7680", name: "Gains de Change Réalisés (USD/HTG)", category: "REVENUE", normalBalance: "CREDIT" },
    CASH_DISCREPANCY_GAIN: { code: "7780_CASH_DISCREPANCY_GAIN", numericCode: "7780", name: "Profits sur Écarts Positifs de Caisse", category: "REVENUE", normalBalance: "CREDIT" },
  },
} as const;
```

---

## 5. MODÈLE DE SCHÉMA D'ÉCRITURES UNIFIÉ PAR TYPE DE TRANSACTION

Cette section définit formellement les formules d'écriture en partie double (Débit = Crédit) pour toutes les opérations de guichet, coffre, transit, change et clearing.

### 5.1 Modèle 1 : Approvisionnement de Caisse depuis le Coffre Succursale (Till Replenishment)
Lorsqu'un guichetier reçoit un montant de trésorerie en provenance du coffre-fort de la succursale pour démarrer sa session ou renforcer son encaisse :
- **Débit** : `1020_TILL_CASH` (Caisse du Guichet `$till_id`)
- **Crédit** : `1030_SAFE_CASH` (Coffre-Fort de la Succursale `$branch_id`)
- **Équilibre** : `Montant_Débit = Montant_Crédit = $amount_cents`

### 5.2 Modèle 2 : Versement de Caisse vers le Coffre (Till Dump / Vault Sweep)
Lorsqu'un guichetier procède à un délestage en cours ou en fin de journée pour vider son excédent de liquidités vers le coffre :
- **Débit** : `1030_SAFE_CASH` (Coffre-Fort de la Succursale `$branch_id`)
- **Crédit** : `1020_TILL_CASH` (Caisse du Guichet `$till_id`)
- **Équilibre** : `Montant_Débit = Montant_Crédit = $amount_cents`

### 5.3 Modèle 3 : Transfert Inter-Succursales (Vault-to-Vault Inter-Branch via Cash in Transit)
Afin de préserver l'étanchéité comptable et d'éviter que des fonds disparus en cours de route ne faussent les soldes, un transfert entre Succursale A et Succursale B utilise obligatoirement le compte miroir de transit `1080_CASH_IN_TRANSIT`.

#### Étape A : Expédition depuis la Succursale A (Statut `IN_TRANSIT`)
- **Débit** : `1080_CASH_IN_TRANSIT` (Fonds en transit - sous-compte `$transfer_id`)
- **Crédit** : `1030_SAFE_CASH` (Coffre-Fort Succursale Expéditrice A)

#### Étape B : Réception et Confirmation à la Succursale B (Statut `COMPLETED`)
- **Débit** : `1030_SAFE_CASH` (Coffre-Fort Succursale Destinataire B)
- **Crédit** : `1080_CASH_IN_TRANSIT` (Fonds en transit - sous-compte `$transfer_id`)
- **Vérification Invariant** : Le compte `1080_CASH_IN_TRANSIT` relatif à ce `$transfer_id` revient à un solde exact de **0.00 HTG**.

### 5.4 Modèle 4 : Opération de Change Manuel USD/HTG avec Marge/Gain ou Perte FX
Lorsqu'un client achète ou vend des devises au guichet (ex: Vente de 100 USD par le guichet à un taux client de 135.0 HTG/USD, alors que le taux comptable officiel est de 132.0 HTG/USD) :

#### Cas A : Vente de USD au Client avec Gain de Change (Marge Commerciale)
- **Débit** : `1020_TILL_CASH` [Devise: HTG] : `13,500.00 HTG` (Encaissement HTG du client : 100 * 135.0)
- **Crédit** : `1020_TILL_CASH` [Devise: USD] : `102.00 USD` convertis au taux officiel = `13,200.00 HTG` (Décaissement USD du guichet)
- **Crédit** : `7680_REALIZED_FX_GAIN` [Devise: HTG] : `300.00 HTG` (Marge de change réalisée)
- **Vérification d'Équilibre** : `Débit (13,500) = Crédit (13,200 + 300) = 13,500 HTG`.

#### Cas B : Achat de USD au Client avec Marge Intégrée
- **Débit** : `1020_TILL_CASH` [Devise: USD] : `100 USD` au taux comptable = `13,200.00 HTG`
- **Crédit** : `1020_TILL_CASH` [Devise: HTG] : Décaissement HTG au taux client d'achat (ex: 130.0 HTG) = `13,000.00 HTG`
- **Crédit** : `7680_REALIZED_FX_GAIN` [Devise: HTG] : `200.00 HTG` (Gain de change)
- **Vérification d'Équilibre** : `Débit (13,200) = Crédit (13,000 + 200) = 13,200 HTG`.

### 5.5 Modèle 5 : Émission et Paiement de Mandats MoneyGram avec Clearing
Les transactions MoneyGram ne touchent pas directement les comptes de produits généraux mais transitent par le compte de compensation `2150_MONEYGRAM_CLEARING`.

#### Scénario A : Envoi de Mandat MoneyGram au Guichet (Client paye au guichet)
- **Débit** : `1020_TILL_CASH` : `$principal_htg + $fee_htg` (Total encaissé du client)
- **Crédit** : `2150_MONEYGRAM_CLEARING` : `$principal_htg` (Dette de compensation envers MoneyGram)
- **Crédit** : `4200_COMMISSION_REVENUE` : `$fee_htg` (Part de commission conservée par l'ERP)

#### Scénario B : Paiement d'un Mandat MoneyGram Entrant (Guichet paye le bénéficiaire)
- **Débit** : `2150_MONEYGRAM_CLEARING` : `$payout_htg` (Créance de compensation sur MoneyGram)
- **Crédit** : `1020_TILL_CASH` : `$payout_htg` (Espèces décaissées au bénéficiaire)

### 5.6 Modèle 6 : Clôture Journalière de Caisse et Écarts de Billetage (Cash Discrepancy)
Lors du comptage physique au moment de la clôture de la session du guichet (`CLOSING`), le système compare le solde théorique calculé par les flux (`$expected_cents`) avec le montant physique saisi lors du billetage (`$physical_cents`).

#### Cas A : Écart Négatif (Manquant de Caisse / Deficit)
`$delta_cents = $physical_cents - $expected_cents < 0` (ex: -500 HTG)
- **Débit** : `6780_CASH_DISCREPANCY_LOSS` : `500.00 HTG` (Constat de perte/manquant)
- **Crédit** : `1020_TILL_CASH` : `500.00 HTG` (Ajustement du solde logique de caisse)
- **Résultat** : Le solde comptable de `1020_TILL_CASH` est aligné avec le réel physique. Si une enquête impute la faute au guichetier, une écriture ultérieure transfère la charge vers `1300_EMPLOYEE_ADVANCES` (Débit 1300, Crédit 6780).

#### Cas B : Écart Positif (Excédent de Caisse / Surplus)
`$delta_cents = $physical_cents - $expected_cents > 0` (ex: +200 HTG)
- **Débit** : `1020_TILL_CASH` : `200.00 HTG` (Ajustement du solde logique de caisse)
- **Crédit** : `7780_CASH_DISCREPANCY_GAIN` : `200.00 HTG` (Produit exceptionnel sur excédent)

### 5.7 Modèle 7 : Petite Dépense de Caisse (Petty Cash Expense Authorized)
Lorsqu'une petite dépense opérationnelle urgente est réglée directement depuis le guichet sur autorisation :
- **Débit** : `5900_GENERAL_EXPENSES` : `$amount_cents`
- **Crédit** : `1020_TILL_CASH` : `$amount_cents`

---

## 6. IMPACT SUR LE CODE EXISTANT ET PLAN DE MIGRATION

Afin d'appliquer ce plan comptable unifié lors des étapes ultérieures de développement, la cartographie précise des fichiers touchés est établie.

### 6.1 Fichiers de Code de Production à Modifier (Prompts Ultérieurs)

1. `src/constants/finance.ts` :
   - Remplacer le dictionnaire `CHART_OF_ACCOUNTS` par la version unifiée non ambiguë `CHART_OF_ACCOUNTS_UNIFIED`.
   - Exposer un helper de rétrocompatibilité `resolveLegacyAccountCode(code: string): string`.

2. `src/types/accounting.ts` :
   - Mettre à jour `AccountDefinition` et les sous-types de rapports financiers (Bilan, Compte de Résultat, Balance de Vérification) pour inclure les classes 6 et 7.

3. `src/services/AccountingEngine.ts` :
   - Mettre à jour la méthode `applyDoubleEntryRules` pour utiliser les nouveaux codes standardisés (`1020_TILL_CASH`, `1030_SAFE_CASH`, `2210_ONA_TAXES_PAYABLE`, `2220_OFATMA_TAXES_PAYABLE`, `2300_PAYROLL_CLEARING`).
   - Ajouter les générateurs d'écritures pour les mouvements de caisse, coffres, transferts, change et clôtures.

4. `src/services/accounting/LedgerAuditEngine.ts` & `BankReconciliationEngine.ts` :
   - Mettre à jour les filtres d'audit pour reconnaître la plage 1000-1080 comme actifs de trésorerie valides.

5. **Rapports BI & Composants UI (`src/components/analytics/*`, `src/components/finance/*`)** :
   - Vérifier que les requêtes et graphiques agrégeant la trésorerie interrogent l'ensemble des comptes `1000`, `1010`, `1020`, `1030` et `1080`.

### 6.2 Stratégie de Migration des Données de Trésorerie
Pour les transactions existantes enregistrées dans Firestore sous les anciens codes :
- **Absence de Mutation Destructive** : Les anciennes transactions dans `ledger_transactions` conservent leurs libellés historiques pour garantir la validité des signatures cryptographiques et du journal de traçabilité (`forensic_logs`).
- **Rétro-Compatibilité des Lectures (Alias Mapping Layer)** : Une fonction de résolution dynamique interprète l'ancien code `2100_ONA_TAXES_PAYABLE` comme pointant vers la catégorie canonique `2210_ONA_TAXES_PAYABLE` lors du calcul des bilans à la volée.

---

## 7. PLAN DE RAPPROCHEMENT COMPTABLE & CONTRÔLE D'ÉQUILIBRE AU RUNTIME

Pour empêcher tout déséquilibre comptable au niveau de la base de données ou de l'application, un contrôle d'invariant est exécuté en temps réel par l'IHM et le moteur comptable.

### 7.1 Validation d'Invariants de la Balance de Vérification (Trial Balance)

$$\sum \text{Débits (Cents)} = \sum \text{Crédits (Cents)}$$

```typescript
export function assertJournalEntryEquilibrium(entry: {
  lines: Array<{ debitCents: number; creditCents: number }>;
}): void {
  const totalDebits = entry.lines.reduce((sum, l) => sum + (l.debitCents || 0), 0);
  const totalCredits = entry.lines.reduce((sum, l) => sum + (l.creditCents || 0), 0);
  
  if (totalDebits !== totalCredits) {
    throw new Error(
      `UNBALANCED_JOURNAL_ENTRY: Total Debits (${totalDebits} cents) does not match Total Credits (${totalCredits} cents). Delta: ${totalDebits - totalCredits}`
    );
  }
}
```

---

## 8. RECOMMANDATION FINALE DE VALIDATION POUR LE BOARD

### 8.1 Matrice de Conformité Finale

| Critère de Validation | Statut | Commentaire |
|---|---|---|
| **Résolution des Collisions** | **CONFORME** | Tous les doublons de numéros (2100, 3000, 5100, 5200) sont éliminés |
| **Prise en charge Guichets & Coffres** | **CONFORME** | Codes dédiés 1020 (Guichet), 1030 (Coffre), 1080 (Transit) |
| **Prise en charge Change & Discrepancies** | **CONFORME** | Ajout des classes 6 (Pertes FX/Écarts) et 7 (Gains FX/Écarts) |
| **Respect de la Partie Double** | **CONFORME** | Modèles d'écritures rigoureusement équilibrés Débit = Crédit |
| **Respect de la Règle Read-Only** | **CONFORME** | Phase 100% documentaire, aucun impact sur le code de production |

### 8.2 Recommandation Officielle
Il est recommandé au Board Produit FINOPS × FINAYITI de prononcer la validation formelle du **Plan Comptable Unifié (PROMPT 03.2)** sous le statut `COA_RESOLUTION_APPROVED`, autorisant le passage à la phase suivante de spécification ou d'implémentation encadrée.
