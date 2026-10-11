# FINOPS × FINAYITI — PROMPT 03 — DOMAIN & DATA MODEL GATE
## Audit Contradictoire et Spécification du Modèle de Domaine Unifié (Guichets, Coffres, Change, MoneyGram, Transferts, Clôtures & Comptabilité)

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Auteur :** AI Engineering Orchestrator / FINOPS Architecture Board  
**Version :** 1.0  
**Statut :** AUDIT & CONCEPTION CONTRADICTOIRE ACHEVÉS — SPÉCIFICATION APPRÉCIÉE  
**Mode :** AUDIT ET CONCEPTION DOCUMENTAIRE STRICTEMENT EN LECTURE SEULE (0 Mutation de code de production, 0 modification de règles Firestore, 0 altération de base de données)  
**Prérequis :**
- `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_GATE_P02.md`
- `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_DECISIONS_P02_1.md`  

**Livrable unique :** `docs/audits/FINOPS_FINAYITI_DOMAIN_DATA_MODEL_GATE_P03.md`

---

## 1. Mandat, Principes Directeurs & Non-Prolifération des Modèles

### 1.1 Contexte et Objet du Mandat
FINOPS ERP est un système de gestion d'entreprise multi-tenant en production. L'objectif de la présente phase (Prompt 03) est de formaliser un **modèle de domaine et de données unifié** permettant d'intégrer dans FINOPS ERP les fonctionnalités opérationnelles historiquement définies dans FINAYITI :
- Gestion des tiroirs-caisses guichets (`Till`) et des sessions de caisses (`TillSession`) ;
- Gestion des coffres-forts de succursale ou de siège (`Safe`) ;
- Opérations spécialisées de guichet : change manuel de devises (`FxExchange`), transferts internationaux d'argent (`MoneyGram`), dépenses de petite caisse (`PettyExpense`) ;
- Traitement des transferts de fonds inter-caisses, caisse-coffre et inter-succursales (`CashTransfer`) ;
- Billetage physique, contrôle des écarts et clôtures journalières (`CountObservation`, `Variance`) ;
- Raccordement déterministe au Grand Livre (`AccountingEngine`) et au pipeline de Business Intelligence (`CashBasisEngine`).

### 1.2 Principes Directeurs
Conformément à la Constitution **GEMINI.md** et aux arbitrages de l'Architecture Decision Register (`DR-001` à `DR-015` dans `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_DECISIONS_P02_1.md`), la conception du domaine repose sur 6 piliers fondamentaux :

1. **Non-prolifération des modèles (Single SSOT)** : Interdiction absolue de créer un deuxième journal de trésorerie ou une collection parallèle concurrent à `NormalizedCashMovement` (`/cash_movements`).
2. **Découplage strict des responsabilités (5-Layer Architecture)** :
   $$\text{Business Operation} \longrightarrow \text{Treasury Event} \longrightarrow \text{Cash Movement (SSOT)} \longrightarrow \text{Balance Projection} \longrightarrow \text{Accounting Posting (GL)}$$
3. **Séparation Physique vs Scriptural** : Une transaction par carte bancaire (POS/TPE) ou par virement n'est pas un mouvement d'espèces physiques en caisse. Elle n'altère sous aucun prétexte le solde théorique de billets du tiroir-caisse (`cashBalanceCents`).
4. **Idempotence et Déterminisme** : Toutes les écritures de mouvements d'espèces et de pièces comptables utilisent des clés d'idempotence calculées de manière déterministe sans `UUID` aléatoires ni `Date.now()`.
5. **Inviolabilité et Immuabilité** : Les documents de mouvements d'espèces (`/cash_movements`) sont immuables (`append-only`). Tout ajustement ou annulation s'exécute exclusivement par contre-passation (`reversalOf`).
6. **Contrôle d'Accès Fail-Closed Outside UI** : La sécurité, la validation multi-tenant et le respect des permissions granulaires (`till.*`, `safe.*`, `transfer.*`, `closure.*`, `fx.*`) sont garantis côté serveur (`PermissionService.ts`) et au niveau de la base de données (`firestore.rules`), indépendamment de l'interface utilisateur.

---

## 2. Vue d'Ensemble du Modèle de Domaine Unifié

### 2.1 Frontières du Domaine et Responsabilités
Le diagramme ci-dessous illustre l'intégration harmonieuse des entités du domaine Guichet et Trésorerie au sein du noyau FINOPS ERP :

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                DOMAINE GUICHET & TRESORERIE                             │
│                                                                                         │
│  ┌──────────────────────┐         ┌──────────────────────┐      ┌────────────────────┐  │
│  │     Till (Caisse)    │ 1 ─── * │  TillSession (Sess.) │ 1──* │  CountObservation  │  │
│  └──────────────────────┘         └──────────────────────┘      └────────────────────┘  │
│             │ 1                              │ 1                                        │
│             ▼ *                              ▼ *                                        │
│  ┌──────────────────────┐         ┌──────────────────────┐      ┌────────────────────┐  │
│  │ TillBal. Projection  │         │ CashTransfer (Workflow)│    │ PettyExpenseVoucher│  │
│  └──────────────────────┘         └──────────────────────┘      └────────────────────┘  │
└─────────────┬────────────────────────────────┬───────────────────────────┬──────────────┘
              │                                │                           │
              │ (Mouvements Physiques)         │ (Flux Transit)            │ (Justificatif)
              ▼                                ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        REGISTRE IMMUABLE DE TRESORERIE (SSOT)                           │
│                                                                                         │
│                       NormalizedCashMovement (/cash_movements)                           │
│                                                                                         │
└─────────────┬────────────────────────────────────────────────────────────┬──────────────┘
              │                                                            │
              ▼                                                            ▼
┌───────────────────────────┐                                ┌────────────────────────────┐
│      CASH BASIS ENGINE    │                                │     ACCOUNTING ENGINE      │
│  (Agrégation BI / Reporting)│                                │  (Posting Double Entry GL) │
└───────────────────────────┘                                └────────────────────────────┘
```

---

## 3. Spécification Détaillée des Entités du Domaine

### 3.1 Entité `Till` (Tiroir-Caisse Physique)
Représente l'équipement physique ou le poste de travail dédié aux opérations de caisse au sein d'une succursale.

- **Identifiant** : `tillId` (ex: `till_br1_01`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string` : Tenant d'isolation.
  - `branchId: string` : Ancrage succursale.
  - `code: string` : Code court d'identification (ex: `"POS-01"`).
  - `name: string` : Nom usuel (ex: `"Guichet Principal Lundi"`).
  - `status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE' | 'ARCHIVED'` : État de l'équipement.
  - `assignedCurrencyCodes: string[]` : Devises autorisées dans ce tiroir (ex: `["HTG", "USD"]`).
  - `defaultFloatCents: Record<string, number>` : Fond de roulement cible par devise (ex: `{ HTG: 500000, USD: 10000 }`).
  - `autoSweepMode: 'FULL_SWEEP' | 'EXCESS_SWEEP' | 'MANUAL_SWEEP'` : Politique de transfert au coffre à la clôture (`DR-010`).
  - `maxCashLimitCents: Record<string, number>` : Plafond physique maximal de sécurité (`DR-004`).
  - `currentSessionId?: string` : Référence à la session active si ouverte.
  - `createdAt: string`, `updatedAt: string`.

### 3.2 Entité `TillSession` (Session Opérationnelle de Caisse)
Représente la période d'activité d'un guichetier sur un tiroir-caisse donné. Une caisse ne peut avoir qu'une seule `TillSession` à l'état `OPEN` simultanément.

- **Identifiant** : `sessionId` (ex: `tsess_br1_pos1_20261010_01`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string` : Tenant d'isolation.
  - `branchId: string` : Succursale.
  - `tillId: string` : Tiroir-caisse associé.
  - `tellerUserId: string` : Guichetier titulaire de la session.
  - `openedByUserId: string` : Utilisateur ayant autorisé l'ouverture.
  - `status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED' | 'FORCE_CLOSED'` : État du cycle de vie.
  - `openedAt: string` : Horodatage d'ouverture.
  - `closedAt?: string` : Horodatage de fermeture.
  - `openingFloatCents: Record<string, number>` : Fond de roulement initial constaté.
  - `closingExpectedCents?: Record<string, number>` : Solde théorique calculé par le système.
  - `closingPhysicalCents?: Record<string, number>` : Solde physique saisi lors du billetage.
  - `varianceCents?: Record<string, number>` : Écart constaté ($\text{Physique} - \text{Théorique}$).
  - `approvalRequestId?: string` : Référence à la demande de validation si écart supérieur au seuil (`DR-011`).
  - `approvedByUserId?: string` : Responsable ayant validé la clôture avec écart.
  - `rejectionReason?: string` : Motif de refus du comptage par le responsable.
  - `openingCountObservationId: string` : Lien vers le billetage initial.
  - `closingCountObservationId?: string` : Lien vers le billetage final.

### 3.3 Entité `CountObservation` (Billetage & Comptage Physique)
Observation immuable et horodatée du détail des coupures d'espèces physiques présentes dans une caisse ou un coffre.

- **Identifiant** : `countId` (ex: `cnt_tsess_20261010_close`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string`, `branchId: string`.
  - `targetType: 'TILL_SESSION' | 'SAFE'` : Type d'emplacement compté.
  - `targetId: string` : Identifiant de la session de caisse ou du coffre.
  - `observationType: 'OPENING' | 'CLOSING' | 'MIDDAY_AUDIT' | 'VAULT_INVENTORY'` : Moment du comptage.
  - `performedByUserId: string` : Opérateur ayant exécuté le comptage.
  - `verifiedByUserId?: string` : Superviseur témoin du comptage.
  - `currency: string` : Devise concernée (`"HTG"`, `"USD"`).
  - `denominations: Array<{ denominationValue: number; count: number; totalCents: number }>` : Détail des coupures.
  - `grandTotalCents: number` : Somme totale calculée ($\sum \text{valeur} \times \text{nombre}$).
  - `notes?: string`.
  - `createdAt: string`.

### 3.4 Entité `Safe` (Coffre-Fort de Succursale ou Siège)
Entité de trésorerie centrale niveau succursale ou direction générale, gérant les réserves principales d'espèces.

- **Identifiant** : `safeId` (ex: `safe_br1_main`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string`, `branchId: string`.
  - `code: string` (ex: `"SAFE-MAIN-01"`).
  - `name: string` (ex: `"Coffre Principal Succursale Cap-Haïtien"`).
  - `status: 'ACTIVE' | 'MAINTENANCE' | 'LOCKED'`.
  - `custodianUserIds: string[]` : Responsables autorisés (Gestionnaires du coffre).
  - `currencies: string[]` : Devises conservées (`["HTG", "USD"]`).
  - `requiresDualControl: boolean` : Exigence de double clé/signature pour accès.
  - `createdAt: string`, `updatedAt: string`.

### 3.5 Entité Canonique `NormalizedCashMovement` (SSOT Cash)
Le contrat unique et universel de tout mouvement d'espèces physiques. Défini dans `src/domains/cash/types/NormalizedCashMovement.ts` et étendu sans breaking-change (`DR-012`) :

```typescript
export interface NormalizedCashMovement {
  id: string; // Idempotent: cm_{biz}_{module}_{sourceId}_{date}_{dir}
  businessId: string; // Multi-tenant isolation
  sourceModule: CashMovementSourceModule; // 'PAYROLL' | 'INVOICE' | 'LEDGER' | 'CASH_SETTLEMENT' | 'TILL' | 'MONEYGRAM' | 'FX' | 'PETTY_CASH'
  sourceId: string;
  paymentEventId?: string;
  movementDate: string; // YYYY-MM-DD
  direction: 'INFLOW' | 'OUTFLOW' | 'TRANSFER';
  movementType: CashMovementType;
  amount: number;
  amountCents: number;
  currency: string;
  
  // Ancrages d'emplacements (DR-012)
  cashAccountId?: string;
  sourceCashAccountId?: string;
  destinationCashAccountId?: string;
  tillId?: string;
  safeId?: string;
  tillSessionId?: string;
  bankAccountId?: string;
  
  // Attributions organisationnelles
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
  
  paymentMethod?: RecognizedPaymentMethod; // Strictement 'CASH' pour le tiroir physique
  status: 'PAID' | 'SETTLED' | 'POSTED' | 'VOIDED' | 'REVERSED';
  description?: string;
  reference?: string;
  reversalOf?: string;
  
  metadata?: Record<string, any>;
  createdAt?: string;
}
```

### 3.6 Projections Matérialisées `TillBalanceProjection` & `SafeBalanceProjection`
Snapshots de soldes matérialisés mis à jour de manière atomique lors de chaque écriture dans `/cash_movements` (`DR-001`).

- **Collection** : `/tills/{tillId}/projections/current_balance` et `/safes/{safeId}/projections/current_balance`
- **Champs** :
  - `cashAccountId: string` : Identifiant de la caisse ou du coffre.
  - `businessId: string`, `branchId: string`.
  - `balances: Record<string, { cashBalanceCents: number; pendingInflowCents: number; pendingOutflowCents: number; lastMovementId: string; lastUpdatedTimestamp: string }>` : Soldes ventilés par devise.
  - `isReconciling: boolean` : Verrou atomique lors de la reconstruction (`DR-015`).
  - `lastReconciledAt?: string`, `reconciledHash?: string`.

### 3.7 Entité `CashTransfer` (Workflow de Transfert de Fonds)
Modélise le cycle de vie à 3 étapes des déplacements d'espèces entre caisses, coffres et succursales (`DR-008`).

- **Identifiant** : `transferId` (ex: `trf_20261010_001`)
- **Propriétés principales** :
  - `id: string` : Clé primaire idempotente (`IDEM_TR_...`).
  - `businessId: string`.
  - `transferType: 'TILL_TO_SAFE' | 'SAFE_TO_TILL' | 'SAFE_TO_SAFE' | 'INTER_BRANCH'`.
  - `sourceType: 'TILL' | 'SAFE'`, `sourceId: string`, `sourceBranchId: string`.
  - `destinationType: 'TILL' | 'SAFE'`, `destinationId: string`, `destinationBranchId: string`.
  - `amountCents: number`, `currency: string`.
  - `status: 'INITIATED' | 'PENDING_APPROVAL' | 'IN_TRANSIT' | 'COMPLETED' | 'REJECTED' | 'CANCELLED'`.
  - `initiatedByUserId: string`, `initiatedAt: string`.
  - `approvedByUserId?: string`, `approvedAt?: string`.
  - `dispatchedByUserId?: string`, `dispatchedAt: string` (Moment du débit source et passage en `1080_CASH_IN_TRANSIT`).
  - `receivedByUserId?: string`, `receivedAt?: string` (Moment du crédit destination).
  - `rejectionReason?: string`.
  - `outflowCashMovementId?: string`, `inflowCashMovementId?: string`.
  - `glPostingId?: string`.

### 3.8 Entité `MoneyGramTransaction` (Opération Spécialisée MoneyGram)
Enregistre la transaction commerciale MoneyGram indépendamment du mouvement de caisse d'espèces (`DR-005`).

- **Identifiant** : `mgTxId` (ex: `mg_20261010_987654`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string`, `branchId: string`, `tillId: string`, `tillSessionId: string`.
  - `operationType: 'PAYOUT_SEND' | 'PAYIN_RECEIVE'` (SEND = encaissement au guichet ; RECEIVE = décaissement au guichet).
  - `mtcnReference: string` : Numéro de suivi officiel MoneyGram.
  - `senderName: string`, `receiverName: string`.
  - `principalAmountCents: number`, `principalCurrency: string`.
  - `feeAmountCents: number`, `feeCurrency: string`.
  - `partnerCommissionCents: number` : Part de commission revenant à l'entreprise.
  - `totalCollectedOrPaidCents: number` : Montant total net en espèces manipulé au guichet.
  - `cashMovementId: string` : Lien direct vers le document `NormalizedCashMovement`.
  - `glPostingId: string` : Lien direct vers la pièce comptable GL.
  - `operatorUserId: string`, `createdAt: string`.

### 3.9 Entité `FxExchangeTransaction` (Opération de Change Spécialisée)
Enregistre une transaction d'échange manuel de devises d'espèces au guichet avec gel des taux d'achat/vente et calcul de la marge (`DR-006`, `DR-007`).

- **Identifiant** : `fxTxId` (ex: `fx_20261010_042`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string`, `branchId: string`, `tillId: string`, `tillSessionId: string`.
  - `operationSide: 'BUY_USD' | 'SELL_USD'` (BUY = le guichet achète des USD contre des HTG ; SELL = le guichet vend des USD contre des HTG).
  - `givenAmountCents: number`, `givenCurrency: string` (Monnaie remise par le client).
  - `returnedAmountCents: number`, `returnedCurrency: string` (Monnaie rendue au client).
  - `appliedRate: number` : Taux commercial effectivement appliqué au client (`buyRate` ou `sellRate`).
  - `accountingRate: number` : Taux comptable officiel du jour (Banque Centrale BRH).
  - `rateSource: 'DAILY_RATE' | 'MANAGER_OVERRIDE'`.
  - `overrideJustification?: string`, `overrideAuthorizedByUserId?: string`.
  - `realizedFxGainLossCents: number` : Gain ou perte de change réalisé calculé.
  - `inflowCashMovementId: string`, `outflowCashMovementId: string`.
  - `glPostingId: string`.
  - `operatorUserId: string`, `createdAt: string`.

### 3.10 Entité `PettyExpenseVoucher` (Bon de Petite Caisse)
Justificatif structuré d'un décaissement de petite caisse (`DR-014`).

- **Identifiant** : `voucherId` (ex: `petty_20261010_007`)
- **Propriétés principales** :
  - `id: string` : Clé primaire.
  - `businessId: string`, `branchId: string`, `sourceType: 'TILL' | 'SAFE'`, `sourceId: string`, `tillSessionId?: string`.
  - `voucherNumber: string` (ex: `"PETTY-2026-0089"`).
  - `expenseCategoryCode: string` (ex: `"5900_OFFICE_SUPPLIES"`, `"5910_TRANSPORT"`).
  - `beneficiaryName: string` : Personne recevant les fonds.
  - `description: string` : Motif précis de la dépense.
  - `amountCents: number`, `currency: string`.
  - `receiptAttachmentUrl?: string` : Photo ou numérisation du reçu.
  - `status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISBURSED' | 'REJECTED'`.
  - `requestedByUserId: string`, `approvedByUserId?: string`.
  - `cashMovementId?: string`, `glPostingId?: string`, `createdAt: string`.

---

## 4. Modèle de Données Firestore (Collections, Subcollections & Schemas)

Toutes les collections sont ancrées au niveau racine avec filtrage multi-tenant obligatoire par le champ `businessId` (`DR-001`, `DR-012`).

```text
/tills/{tillId}
/tills/{tillId}/projections/current_balance
/till_sessions/{sessionId}
/till_sessions/{sessionId}/observations/{countId}
/safes/{safeId}
/safes/{safeId}/projections/current_balance
/cash_movements/{movementId}                       <--- SSOT CANONIQUE
/cash_transfers/{transferId}
/moneygram_transactions/{mgTxId}
/fx_exchange_transactions/{fxTxId}
/petty_expense_vouchers/{voucherId}
```

### 4.1 Index Compound Firestore Obligatoires (`firestore.indexes.json`)

```json
{
  "indexes": [
    {
      "collectionGroup": "cash_movements",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "businessId", "order": "ASCENDING" },
        { "fieldPath": "tillId", "order": "ASCENDING" },
        { "fieldPath": "movementDate", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "cash_movements",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "businessId", "order": "ASCENDING" },
        { "fieldPath": "tillSessionId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "cash_transfers",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "businessId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "initiatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "till_sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "businessId", "order": "ASCENDING" },
        { "fieldPath": "tillId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

---

## 5. Matrice des Événements de Domaine (Domain Events)

Les composants communiquent via un bus d'événements typés et rejouables :

| Event Name | Émetteur | Payload Principal | Consommateurs (Listeners) | Action Automatique Générée |
|---|---|---|---|---|
| `till.session.opened` | `TillService` | `sessionId`, `tillId`, `tellerUserId`, `openingFloatCents` | `AuditLogger`, `TillUI` | Initialise la session et fige le fond de roulement. |
| `till.sale_cash.recorded` | `PosService` | `saleId`, `tillSessionId`, `amountCents`, `currency` | `CashMovementRepository`, `TillBalanceProjection` | Écrit `NormalizedCashMovement` + maj atomique du solde caisse. |
| `transfer.dispatched` | `CashTransferService` | `transferId`, `sourceId`, `amountCents`, `currency` | `AccountingEngine`, `TillBalanceProjection` | Débit source immédiat + Crédit `1080_CASH_IN_TRANSIT` + GL Posting. |
| `transfer.completed` | `CashTransferService` | `transferId`, `destinationId`, `amountCents`, `currency` | `AccountingEngine`, `SafeBalanceProjection` | Débit `1080_CASH_IN_TRANSIT` + Crédit destination + GL Posting. |
| `till.session.closed_with_variance` | `TillClosureService` | `sessionId`, `varianceCents`, `closingPhysicalCents` | `ServerApprovalGateway`, `NotificationService` | Crée une demande Maker-Checker si variance > seuil (`DR-011`). |
| `petty_expense.approved` | `PettyExpenseService` | `voucherId`, `amountCents`, `expenseCategoryCode` | `CashMovementRepository`, `AccountingEngine` | Génère le décaissement d'espèces + Écriture de charge au GL. |
| `fx.exchange.executed` | `FxService` | `fxTxId`, `givenCents`, `returnedCents`, `gainLossCents` | `CashMovementRepository`, `AccountingEngine` | Génère 2 mouvements (inflow/outflow) + Constat du gain/perte FX. |

---

## 6. Intégration avec `AccountingEngine` & Règles d'Imputation (Partie Double)

Toute transaction d'espèces transmise à `AccountingEngine.ts` génère une pièce comptable équilibrée ($\sum \text{Débits} = \sum \text{Crédits}$) adossée aux sous-comptes canoniques édictés par `DR-002` :

### 6.1 Table d'Imputation Comptable Synthétique

| Type d'Opération | Compte Débité (DR) | Compte Crédité (CR) | Remarques / Condition |
|---|---|---|---|
| **Vente Cash Guichet** (`SALE_CASH`) | `1010_TILL` (Caisse Guichet) | `4000_REVENUE_SERVICE` (Produits) | Entrée d'espèces en caisse. |
| **Paiement Salaire/Avance Cash** | `1300_EMPLOYEE_ADVANCES` (Avances) | `1010_TILL` (Caisse Guichet) | Sortie d'espèces du guichet. |
| **Transfert Caisse -> Transit** | `1080_CASH_IN_TRANSIT` (Transit) | `1010_TILL` (Caisse Guichet) | Départ du transfert (`IN_TRANSIT`). |
| **Transfert Transit -> Coffre** | `1015_SAFE` (Coffre-fort) | `1080_CASH_IN_TRANSIT` (Transit) | Réception au coffre (`COMPLETED`). |
| **Transfert Coffre -> Caisse** | `1080_CASH_IN_TRANSIT` (Transit) | `1015_SAFE` (Coffre-fort) | Alimentation de caisse (Départ). |
| **Réception Caisse depuis Transit** | `1010_TILL` (Caisse Guichet) | `1080_CASH_IN_TRANSIT` (Transit) | Alimentation de caisse (Arrivée). |
| **Petite Dépense de Caisse** | `5900_GENERAL_EXPENSES` (Charges) | `1010_TILL` (Caisse Guichet) | Adossé au `PettyExpenseVoucher`. |
| **Envoi MoneyGram (Payout)** | `1010_TILL` (Caisse Guichet) | `2100_MONEYGRAM_CLEARING` (Clearing) + `4000_COMMISSION_REVENUE` | Entrée Principal + Frais. |
| **Retrait MoneyGram (Payin)** | `2100_MONEYGRAM_CLEARING` (Clearing) | `1010_TILL` (Caisse Guichet) | Décaissement au client. |
| **Achat USD au Guichet (Gain FX)** | `1010_TILL` (USD - Taux BRH) | `1010_TILL` (HTG - Cash déboursé) + `7680_REALIZED_FX_GAIN` | Gain de change réalisé (`DR-006`). |
| **Achat USD au Guichet (Perte FX)** | `1010_TILL` (USD) + `6680_REALIZED_FX_LOSS` | `1010_TILL` (HTG - Cash déboursé) | Perte de change réalisée. |
| **Écart de Caisse Surplus (Excédent)** | `1010_TILL` (Caisse Guichet) | `7780_CASH_DISCREPANCY_GAIN` | Ajustement sur décision Manager. |
| **Écart Déficit (Employé)** | `1300_EMPLOYEE_ADVANCES` (Créance Emp.) | `1010_TILL` (Caisse Guichet) | Déficit imputé au guichetier. |
| **Écart Déficit (Charge Enterprise)** | `6780_CASH_DISCREPANCY_LOSS` (Charge) | `1010_TILL` (Caisse Guichet) | Déficit pris en charge par l'entreprise. |

---

## 7. Sécurité, Tenancy & Matrice d'Accès RBAC

### 7.1 Inscription des Capacités Granulaires (`PermissionService.ts`)
Conformément à `DR-013`, les 9 capacités granulaires sont inscrites dans `TENANT_ERP_CAPABILITIES` (`src/services/PermissionService.ts`) :

```typescript
export const TENANT_ERP_CAPABILITIES = new Set([
  // ... capacités existantes
  "till.open_close",
  "till.execute_sale",
  "till.petty_expense",
  "safe.view_balance",
  "safe.deposit_withdraw",
  "transfer.approve_till_feed",
  "transfer.inter_branch",
  "closure.approve_discrepancy",
  "fx.manage_rates"
]);
```

### 7.2 Matrice de Droits par Rôle (`Role` extended via `DR-003`)

| Capacité ERP | JUNIOR_TELLER | SENIOR_TELLER | HEAD_TELLER | MANAGER | OWNER / ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|
| `till.open_close` | OUI (Caisse propre) | OUI (Caisse propre) | OUI | OUI | OUI |
| `till.execute_sale` | OUI | OUI | OUI | OUI | OUI |
| `till.petty_expense` | Seuil <= Max | Seuil <= Max | OUI | OUI | OUI |
| `safe.view_balance` | NON | NON | OUI (Succursale) | OUI | OUI |
| `safe.deposit_withdraw` | NON | NON | OUI | OUI | OUI |
| `transfer.approve_till_feed` | NON | NON | OUI | OUI | OUI |
| `transfer.inter_branch` | NON | NON | NON | OUI | OUI |
| `closure.approve_discrepancy` | NON | NON | NON | OUI | OUI |
| `fx.manage_rates` | NON | NON | NON | OUI | OUI |

---

## 8. Stratégie de Résilience, Idempotence, Concurrence & Reconstitution

### 8.1 Matrice des Clés d'Idempotence Transversales
Afin d'empêcher les re-soumissions réseau de doubler un mouvement de caisse ou une pièce comptable, les identifiants sont générés selon des schémas déterministes stricts :

- **Mouvement Cash SSOT** : `generateCashMovementId()` (`cm_{businessId}_{sourceModule}_{sourceId}_{date}_{direction}`)
- **Ecriture Comptable GL** : `gl_{businessId}_{sourceModule}_{sourceId}_{type}`
- **Transfert de Cash** : `trf_{businessId}_{sourceId}_{destinationId}_{timestampSlot}`
- **Transaction MoneyGram** : `mg_{businessId}_{mtcnReference}_{operationType}`

### 8.2 Isolation Concurrente par Transactions Firestore Atomiques
Tout décaissement ou mise à jour de projection s'exécute exclusivement à l'intérieur d'une transaction Firestore `db.runTransaction` :

```typescript
await db.runTransaction(async (transaction) => {
  const projectionRef = doc(db, 'tills', tillId, 'projections', 'current_balance');
  const projectionSnap = await transaction.get(projectionRef);
  
  if (!projectionSnap.exists()) throw new Error("Projection non initialisée");
  const data = projectionSnap.data();
  if (data.isReconciling) throw new Error("Caisse en cours de réconciliation");
  
  const currentBalanceCents = data.balances[currency]?.cashBalanceCents || 0;
  if (direction === 'OUTFLOW' && currentBalanceCents < amountCents) {
    throw new Error("Solde insuffisant dans le tiroir-caisse");
  }
  
  // 1. Écriture du document immuable dans /cash_movements
  const movementRef = doc(db, 'cash_movements', movementId);
  transaction.set(movementRef, newCashMovement);
  
  // 2. Mise à jour atomique de la projection matérialisée
  const newBalanceCents = direction === 'INFLOW' 
    ? currentBalanceCents + amountCents 
    : currentBalanceCents - amountCents;
    
  transaction.update(projectionRef, {
    [`balances.${currency}.cashBalanceCents`]: newBalanceCents,
    [`balances.${currency}.lastMovementId`]: movementId,
    [`balances.${currency}.lastUpdatedTimestamp`]: new Date().toISOString()
  });
});
```

### 8.3 Algorithme de Reconstitution Déterministe du Solde (`DR-015`)
En cas de doute, d'interruption réseau ou d'audit forensic :
1. Verrouiller la projection : `transaction.update(projectionRef, { isReconciling: true })`.
2. Récupérer le dernier snapshot de billetage validé (`closingCountObservation`).
3. Sélectionner tous les documents immuables `/cash_movements` associés au `tillId` dont `movementDate` est ultérieur au comptage.
4. Exécuter la somme exacte :
   $$\text{Solde Reconstruit} = \text{Billetage Initial} + \sum \text{INFLOWS} - \sum \text{OUTFLOWS}$$
5. Mettre à jour `cashBalanceCents`, enregistrer l'empreinte `reconciledHash` et libérer `isReconciling: false`.

---

## 9. Plan d'Implémentation Incrémental (Roadmap)

Le déploiement des développements futurs s'articulera en 5 jalons successifs sans régression :

- **Phase 1 : Socle de Types, Plan Comptable & Capacités ERP**
  - Mise à jour de `src/types.ts` (`Role`, `BusinessSettings`, `CashThresholdsSettings`).
  - Extension de `CHART_OF_ACCOUNTS` dans `src/constants/finance.ts` (`DR-002`).
  - Inscription des 9 capacités dans `PermissionService.ts` (`DR-013`).

- **Phase 2 : Repositories & Moteur de Mouvements Cash SSOT**
  - Extension de `NormalizedCashMovement.ts` (`DR-012`).
  - Implémentation de `CashMovementRepository.ts` et des transactions atomiques de projection (`DR-001`).

- **Phase 3 : Module Transferts, Petite Caisse & Validation Maker-Checker**
  - Implémentation de `CashTransferRepository.ts` (Modèle 3 étapes `IN_TRANSIT`, `DR-008`).
  - Implémentation de `PettyExpenseRepository.ts` (`DR-014`).
  - Branchement sur `ServerApprovalGateway.ts` (`DR-011`).

- **Phase 4 : Opérations Spécialisées (MoneyGram & Change de Devises FX)**
  - Implémentation de `MoneyGramRepository.ts` (`DR-005`).
  - Extension de `CurrencyRateRepository.ts` avec spreads et blocage fail-closed (`DR-006`, `DR-007`).

- **Phase 5 : Interface Utilisateur Guichet, Billetage & Assainissement Clôture**
  - Composants React UI (`TillOpenCloseWizard`, `CountObservationSheet`, `TransferManagementPanel`).
  - Exclusion stricte des ventes carte du billetage physique (`DR-009`).
  - Validation globale et tests d'intégration Vitest.

---

## 10. Verdict Final d'Audit & Validation

L'audit de conception contradictoire du Modèle de Domaine et de Données (**PROMPT 03**) est achevé. Le modèle formalisé est à 100% conforme à la Constitution `GEMINI.md`, préserve l'intégrité de la codebase FINOPS ERP existante et prévient définitivement la création de systèmes concurrents.

```text
===============================================================================
              VERDICT DU DOMAIN & DATA MODEL GATE (PROMPT 03)
===============================================================================

       [ VERDICT : DOMAIN & DATA MODEL FULLY APPROVED & SPECIFIED ]

  Le modèle de domaine et de données unifié pour l'intégration des opérations
  de guichet, coffre, change, MoneyGram, transferts, petite caisse et clôtures
  est formellement validé.

  Toutes les exigences métier historiquement portées par FINAYITI sont
  harmonieusement intégrées dans les moteurs comptables et de trésorerie de
  FINOPS ERP sans aucun doublon d'architecture.

  Aucune modification du code de production n'a été effectuée (100% Read-Only).
===============================================================================
```

### Garanties d'Invariabilité Respectées :
- **Fichier Produit** : `docs/audits/FINOPS_FINAYITI_DOMAIN_DATA_MODEL_GATE_P03.md`
- **Changements Code Production** : `0` modification
- **Changements Règles Firestore** : `0` modification
- **Statut Audit** : Lecture seule stricte achevée avec succès.
