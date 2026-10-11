# FINOPS × FINAYITI — PROMPT 02 — ARCHITECTURE GATE & CHALLENGE AUDIT
**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Auteur :** AI Engineering Orchestrator / FINOPS Architecture Board  
**Statut :** AUDIT ACHEVÉ — VERDICT ARCHITECTURAL RENDU  
**Mode :** AUDIT ARCHITECTURAL STRICT — LECTURE SEULE (Aucune modification de code ni de base de données)

---

## 1. Executive Summary

Le présent rapport constitue l'audit contradictoire (Architecture Gate P02) du document produit lors de la phase précédente (*PROMPT 01 RÉVISÉ — Audit architectural et spécification d'intégration des caisses, coffres, transactions spécialisées, taux de change et clôtures journalières*).

Conformément à la Constitution FINOPS ERP (GEMINI.md) et aux directives de cette phase, le rapport P01 a été traité comme **une proposition à auditer, et non comme une spécification validée**. 

Toutes les affirmations du rapport P01 ont été re-confrontées directement au code source de FINOPS (`src/`), aux constantes comptables (`src/constants/finance.ts`), au service de permissions (`src/services/PermissionService.ts`), au moteur de taux de change (`src/repositories/CurrencyRateRepository.ts`), au domaine existant de trésorerie (`src/domains/cash/`) ainsi qu'aux règles de sécurité Firestore (`firestore.rules`).

### Principaux résultats de l'audit
1. **Comptes comptables** : La majorité des comptes spécifiques proposés dans le P01 (`1010_TILL`, `1010_SAFE`, `1080_CASH_IN_TRANSIT`, `6680_REALIZED_FX_LOSS`, `6780_CASH_DISCREPANCY_LOSS`, `7680_REALIZED_FX_GAIN`, `7780_CASH_DISCREPANCY_GAIN`, `1250_EMPLOYEE_RECEIVABLES`) **n'existent pas dans le Plan Comptable actuel de FINOPS** (`CHART_OF_ACCOUNTS` dans `src/constants/finance.ts`). Seuls `1000_CASH`, `1010_BANK`, `1200_ACCOUNTS_RECEIVABLE`, `1300_EMPLOYEE_ADVANCES` et `2200_TAXES_PAYABLE` existent dans le code.
2. **Rôles et permissions** : Le type TypeScript `Role` canonique dans `src/types.ts` est limité à `"OWNER" | "ADMIN" | "MANAGER" | "SUPERVISOR" | "EMPLOYEE" | "SUPER_ADMIN" | "UNASSIGNED"`. Les sous-rôles de guichet (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`) sont partiellement référencés dans certains composants UI et tests d'intégration, mais **aucune des permissions spécifiques aux caisses** (`till.open_close`, `safe.deposit_withdraw`, `transfer.approve_till_feed`, etc.) n'est actuellement définie dans `PermissionService.ts`.
3. **Taux de change par défaut (135.0 HTG/USD)** : Ce taux existe dans `src/constants/finance.ts` et `CurrencyRateRepository.ts`, mais constitue un **fallback technique pur** en cas d'erreur Firestore ou de quota dépassé. Il **ne doit en aucun cas** être utilisé comme taux commercial de caisse.
4. **Source Unique de Vérité (SSOT) de la Caisse** : Le rapport P01 proposait un modèle monolithique `CashTransaction` combinant opération métier, mouvement physique, écriture comptable et solde mutable. L'audit confirme qu'il faut obligatoirement adopter un **Ledger de mouvements de trésorerie (SSOT) couplé à une projection de solde matérialisée** et un moteur de reconstruction (Option C).
5. **Prévention du double système** : FINOPS possède déjà un domaine cash mature dans `src/domains/cash/` articulé autour du contrat `NormalizedCashMovement` et du moteur `CashBasisEngine`. La nouvelle architecture de caisses et coffres doit s'intégrer directement dans `NormalizedCashMovement` sans créer de deuxième journal concurrent.

---

## 2. Scope

L'audit couvre l'intégralité des périmètres suivants :
- Plan comptable (Chart of Accounts - COA) et règles d'imputation GL.
- Matrice de rôles, sous-rôles et permissions granulaires RBAC.
- Seuils d'approbation et plafonds de caisse (500 HTG, 5 000 HTG, 250 000 HTG, 2 000 USD).
- Architecture du taux de change (BRH, taux commercial, taux comptable, spreads).
- Critiques du modèle d'entité `CashTransaction` et découplage opération/trésorerie/comptabilité.
- Modélisation de la Source Unique de Vérité (SSOT) du Cash et stratégie de reconstruction du solde.
- Architecture fonctionnelle des Caisses (Tills), Sessions de caisse, Coffres (Safes), Transferts et Clôtures.
- Traitement spécialisé de MoneyGram, Vente Carte, Dépenses de petite caisse (Petty Expense) et Écarts de caisse.
- Intégration avec `AccountingEngine`, `NormalizedCashMovement`, `CashBasisEngine` et le pipeline BI.
- Idempotence, concurrence Firestore et transactions atomiques.

---

## 3. Evidence Classification

Conformément aux directives strictes de cette phase, chaque affirmation, compte, rôle, permission ou mécanisme analysé est classé sous l'une des six catégories normatives :

- **`EVIDENCED_IN_FINOPS`** : Élément présent et formellement vérifié dans le code source, les types ou la configuration FINOPS existante.
- **`EVIDENCED_IN_FINAYITI_SOURCE`** : Élément figurant formellement dans les spécifications ou le contexte historique FINAYITI transmis.
- **`DERIVED`** : Déduction architecturale logique basée sur plusieurs éléments vérifiés.
- **`PROPOSED`** : Nouvelle décision d'architecture ou proposition d'ingénierie introduite lors de l'audit.
- **`UNVERIFIED`** : Élément mentionné dans les prompts sans preuve formelle dans le code ni les spécifications.
- **`CONFLICT`** : Contradiction manifeste entre le code FINOPS, les règles FINAYITI ou des propositions internes.

---

## 4. P01 Claim Audit

Tableau récapitulatif d'audit des principales affirmations contenues dans le rapport P01 :

| Affirmation du rapport P01 | Source initiale | Classification | Preuve exacte dans la codebase | Niveau de confiance | Action corrective |
|---|---|---|---|---|---|
| Le plan comptable contient `1010_TILL` et `1010_SAFE` | Proposition P01 | `PROPOSED` | Absent de `CHART_OF_ACCOUNTS` (`src/constants/finance.ts`). Le COA contient `1000_CASH` et `1010_BANK`. | 100% | Conserver `1000_CASH` / `1010_BANK` ou étendre formellement le COA via ADR. |
| Le compte `1080_CASH_IN_TRANSIT` est disponible | Proposition P01 | `PROPOSED` | Absent de `CHART_OF_ACCOUNTS` (`src/constants/finance.ts`). | 100% | Proposer l'ajout de `1080_CASH_IN_TRANSIT` ou utiliser `2100_PAYROLL_CLEARING` / clearing générique. |
| Les rôles `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER` sont des rôles système canoniques | Directive/P01 | `PARTIAL` | Référencés dans `InvitationManagement.tsx` et tests, mais absents de `type Role` (`src/types.ts`) et de `PermissionService.ts`. | 100% | Clarifier : `Role` canonique reste `EMPLOYEE`/`MANAGER` avec sous-rôle métier ou étendre le type `Role`. |
| Les permissions `till.open_close`, `safe.deposit_withdraw` existent | Proposition P01 | `PROPOSED` | Absentes de `TENANT_ERP_CAPABILITIES` dans `PermissionService.ts`. | 100% | Ajouter formellement ces capacités à `TENANT_ERP_CAPABILITIES` dans `PermissionService.ts`. |
| Le taux 135.0 HTG/USD est le taux commercial par défaut | Constante P01 | `EVIDENCED_IN_FINOPS` | `DEFAULT_USD_TO_HTG_EXCHANGE_RATE = 135.0` dans `src/constants/finance.ts` et `CurrencyRateRepository.ts`. | 100% | Isoler ce taux comme fallback technique strict. Interdire son utilisation pour le change commercial en caisse. |
| Les seuils d'approbation (500 HTG / 5 000 HTG) sont des règles métier absolues | Proposition P01 | `PROPOSED` | Aucune constante ni référence dans `src/`. Exemple illustratif. | 100% | Rendre ces seuils paramétrables par entreprise dans `BusinessSettings`. |
| Les plafonds de caisse sont fixés à 250 000 HTG / 2 000 USD | Proposition P01 | `PROPOSED` | Aucune trace dans la codebase. Exemple illustratif. | 100% | Intégrer ces plafonds dans la configuration de la caisse (`Till.maxBalance`). |
| `CashTransaction` est le modèle unique de cash | Proposition P01 | `PROPOSED` | Incompatible avec `NormalizedCashMovement` (`src/domains/cash/types/NormalizedCashMovement.ts`). | 100% | Abandonner l'entité monolithique `CashTransaction`. Aligner les mouvements de caisse sur `NormalizedCashMovement`. |
| Le solde de la caisse doit être débité au statut `PENDING_ACCEPTANCE` | Proposition P01 | `PROPOSED` | Risque d'incohérence si le transfert est annulé ou rejeté sans rollback. | 100% | Débit immédiat dès le passage en `IN_TRANSIT` vers un compte de transit avec gestion atomique des rejets. |

---

## 5. Accounting Account Verification

Audit détaillé de l'existence réelle dans FINOPS des comptes comptables mentionnés dans le rapport P01 :

| Account Code | Libellé proposé | Existe dans FINOPS ? | Existe dans FINAYITI ? | Utilisé par `AccountingEngine` ? | Source réelle | Classification | Action requise |
|---|---|---|---|---|---|---|---|
| `1010_TILL` | Caisse Guichet | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Soit associer les caisses à `1000_CASH` avec sous-compte/dimension, soit ajouter `1010_TILL` au COA. |
| `1010_SAFE` | Coffre-fort Succursale | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Soit associer les coffres à `1000_CASH`, soit ajouter `1010_SAFE` au COA. |
| `1080_CASH_IN_TRANSIT` | Cash en Transit | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Ajouter `1080_CASH_IN_TRANSIT` au Plan Comptable pour les transferts inter-caisses/coffres. |
| `1250_EMPLOYEE_RECEIVABLES` | Créances Employés | **NON** (FINOPS a `1300_EMPLOYEE_ADVANCES`) | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Recommander la réutilisation de `1300_EMPLOYEE_ADVANCES` ou `1200_ACCOUNTS_RECEIVABLE`. |
| `6680_REALIZED_FX_LOSS` | Perte de Change Réalisée | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Ajouter au groupe des charges financières (Classe 6) dans `src/constants/finance.ts`. |
| `6780_CASH_DISCREPANCY_LOSS` | Perte sur Écart de Caisse | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Ajouter au groupe des charges exceptionnelles / opérationnelles (Classe 6). |
| `7680_REALIZED_FX_GAIN` | Gain de Change Réalisé | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Ajouter au groupe des produits financiers (Classe 7) dans `src/constants/finance.ts`. |
| `7780_CASH_DISCREPANCY_GAIN` | Gain sur Écart de Caisse | **NON** | `PROPOSED` | NON | Proposition P01 | `PROPOSED` | Ajouter au groupe des produits exceptionnels / opérationnels (Classe 7). |
| `2200_TAX_PAYABLE` | Taxes à Payer | **OUI** (`2200_TAXES_PAYABLE`) | `EVIDENCED_IN_FINOPS` | OUI | `src/constants/finance.ts` | `EVIDENCED_IN_FINOPS` | Validé. Utiliser le symbole exact `2200_TAXES_PAYABLE`. |

---

## 6. Role Verification

Audit de la structure des rôles dans le système FINOPS existant vs le rapport P01 :

| Role | Existe dans `type Role` (`src/types.ts`) ? | Référencé dans UI / Tests ? | Permissions actuelles dans `PermissionService.ts` | Source | Classification | Verdict & Action |
|---|---|---|---|---|---|---|
| `JUNIOR_TELLER` | **NON** | OUI (`InvitationManagement.tsx`, `Phase6AApprovalGateway.integration.test.ts`) | Aucune permission dédiée. Hérite du niveau de base. | FINAYITI / Test | `PARTIAL` | **PROPOSED** comme rôle/sous-rôle. Nécessite extension du type `Role` ou gestion par sous-profil. |
| `SENIOR_TELLER` | **NON** | OUI (`InvitationManagement.tsx`, UI) | Aucune permission dédiée. | FINAYITI / Test | `PARTIAL` | **PROPOSED** comme rôle/sous-rôle. |
| `HEAD_TELLER` | **NON** | OUI (`InvitationManagement.tsx`, UI, `PAYROLL_V3_ARCHITECTURE.md`) | Consultation seule de la paie. | FINAYITI / Test | `PARTIAL` | **PROPOSED** comme rôle/sous-rôle. |
| `MANAGER` | **OUI** | OUI | Gestion des employés, approbation paie, rapports succursale. | FINOPS Core | `EVIDENCED_IN_FINOPS` | **EXISTING**. Rôle d'encadrement valide. |
| `OWNER` | **OUI** | OUI | Contrôle total du tenant entreprise, suppression, paramètres financiers. | FINOPS Core | `EVIDENCED_IN_FINOPS` | **EXISTING**. Rôle d'administration entreprise. |
| `AUDITOR` | **NON** | OUI (`GEMINI.md`) | Lecture seule globale entreprise. | GEMINI.md | `PROPOSED` | Ajouter `AUDITOR` dans `type Role` si nécessaire pour la conformité. |
| `SUPER_ADMIN` | **OUI** | OUI | Contrôle multi-tenant, plateforme, bypass de sécurité d'urgence. | FINOPS Core | `EVIDENCED_IN_FINOPS` | **EXISTING**. Rôle de plateforme. |

---

## 7. Permission Verification

Audit de la présence des permissions proposées dans `PermissionService.ts` (`TENANT_ERP_CAPABILITIES`) :

| Permission proposée | Présente dans `PermissionService.ts` ? | Statut réel | Classification | Action corrective |
|---|---|---|---|---|
| `till.open_close` | **NON** | `MISSING` | `PROPOSED` | Ajouter `till.open_close` à `TENANT_ERP_CAPABILITIES`. |
| `till.execute_sale` | **NON** | `MISSING` | `PROPOSED` | Ajouter `till.execute_sale` à `TENANT_ERP_CAPABILITIES`. |
| `till.petty_expense` | **NON** | `MISSING` | `PROPOSED` | Ajouter `till.petty_expense` à `TENANT_ERP_CAPABILITIES`. |
| `till.request_feed` | **NON** | `MISSING` | `PROPOSED` | Ajouter `till.request_feed` à `TENANT_ERP_CAPABILITIES`. |
| `safe.view_balance` | **NON** | `MISSING` | `PROPOSED` | Ajouter `safe.view_balance` à `TENANT_ERP_CAPABILITIES`. |
| `safe.deposit_withdraw` | **NON** | `MISSING` | `PROPOSED` | Ajouter `safe.deposit_withdraw` à `TENANT_ERP_CAPABILITIES`. |
| `transfer.approve_till_feed` | **NON** | `MISSING` | `PROPOSED` | Ajouter `transfer.approve_till_feed` à `TENANT_ERP_CAPABILITIES`. |
| `transfer.inter_branch` | **NON** | `MISSING` | `PROPOSED` | Ajouter `transfer.inter_branch` à `TENANT_ERP_CAPABILITIES`. |
| `closure.approve_discrepancy` | **NON** | `MISSING` | `PROPOSED` | Ajouter `closure.approve_discrepancy` à `TENANT_ERP_CAPABILITIES`. |
| `fx_rate.override_spread` | **NON** | `MISSING` | `PROPOSED` | Ajouter `fx_rate.override_spread` à `TENANT_ERP_CAPABILITIES`. |

---

## 8. Seuils de 500 / 5 000 HTG

- **Analyse d'origine** : Les seuils d'approbation proposés dans le P01 (<= 500 HTG pour `HEAD_TELLER`, 500-5 000 HTG pour `MANAGER`, > 5 000 HTG pour `OWNER`) **ne proviennent d'aucune loi statutaire ni d'aucun code existant dans FINOPS**. Il s'agit d'une proposition illustrative pure.
- **Classification** : `PROPOSED`.
- **Exigence d'ingénierie** : Aucune constante hardcodée ne doit imposer ces montants dans le code. Ces seuils doivent obligatoirement être configurables par entreprise dans le document `BusinessSettings` (`approvalThresholds: { headTellerMaxHtg, managerMaxHtg }`).

---

## 9. Plafonds de Caisse

- **Analyse d'origine** : Les plafonds de caisse mentionnés à titre d'exemple dans le P01 (250 000 HTG et 2 000 USD) ne sont présents ni dans les règles d'entreprise ni dans la base Firestore.
- **Classification** : `PROPOSED`.
- **Exigence d'ingénierie** : Les plafonds de caisse doivent être stockés sur l'entité `Till` elle-même (`maxBalanceHtg`, `maxBalanceUsd`) pour permettre à chaque succursale de définir ses limites physiques de sécurité.

---

## 10. Taux par Défaut 135 HTG/USD

- **Analyse d'existence** : `DEFAULT_USD_TO_HTG_EXCHANGE_RATE = 135.0` est formellement défini dans `src/constants/finance.ts` (ligne 183) et `CurrencyRateRepository.ts` (ligne 41).
- **Rôle réel** : Il s'agit exclusivement d'un **fallback d'urgence de la couche d'infrastructure** (utilisé uniquement lorsque Firestore est inaccessible ou en dépassement de quota de lecture). Il n'est actuellement utilisé par aucun moteur de calcul financier réel dans `src/`.
- **Conclusion impérative** :
  > **Le taux système par défaut de 135.0 HTG/USD NE PEUT PAS être utilisé comme taux commercial de caisse.**
- **Protection requise** : Toute transaction d'échange de devises en caisse doit obligatoirement exiger un taux actif valide provenant de la collection `/exchange_rates` pour la date du jour. Si aucun taux n'est défini pour le jour J, la transaction de change en caisse doit être **bloquée** jusqu'à saisie d'un taux officiel ou d'un override autorisé.

---

## 11. Currency Rate Architecture

Audit approfondi de `CurrencyRateRepository.ts` et de la collection `/exchange_rates` :

### Fonctionnalités existantes (`EVIDENCED_IN_FINOPS`) :
- Conversion simple USD <-> HTG (`convert()`).
- Traversée historique rétrograde pour trouver le dernier taux effectif à une date `effectiveDate` (`getRateAtDate()`).
- Double niveau de portée : Taux spécifique au Tenant entreprise (`businessId`), avec fallback sur le taux global `"SYSTEM"`.
- Cache mémoire local (TTL 5 minutes) avec invalidation d'urgence.
- Traçabilité forensic lors de la mise à jour d'un taux (`setRate()`).

### Évaluation du support des exigences de change opérationnel :

| Exigence de Change | Statut dans FINOPS | Classification | Gap & Action requise |
|---|---|---|---|
| Taux BRH (Banque Centrale) | **EXISTING** | `EVIDENCED_IN_FINOPS` | Supporté via `source: "BRH"`. |
| Mid Rate (Taux Moyen) | **EXISTING** | `EVIDENCED_IN_FINOPS` | Représenté par le champ `rate` unique. |
| Buy Rate (Taux d'Achat) | **MISSING** | `PROPOSED` | Absent. À ajouter (`buyRate`). |
| Sell Rate (Taux de Vente) | **MISSING** | `PROPOSED` | Absent. À ajouter (`sellRate`). |
| Taux Commercial Guichet | **MISSING** | `PROPOSED` | Absent. Nécessite l'introduction de la notion de taux commercial vs taux comptable. |
| Taux Comptable Valuation | **PARTIAL** | `DERIVED` | Actuellement confondu avec le taux unique. |
| Snapshot Historique par Transaction | **MISSING** | `PROPOSED` | Requis : chaque transaction doit figer le taux appliqué au moment T. |
| Taux Spécifique par Succursale | **MISSING** | `PROPOSED` | Le dépôt ne gère actuellement que `businessId` ou `"SYSTEM"`. |
| Override Manager / Owner | **PARTIAL** | `EVIDENCED_IN_FINOPS` | Géré génériquement via `source: "ADMIN_OVERRIDE"`. |

---

## 12. Critique du Modèle `CashTransaction`

Le rapport P01 proposait une collection unique `/cash_transactions` regroupant sous une même entité : `SALE_CASH`, `SALE_CARD`, `PETTY_EXPENSE`, `SAFE_DEPOSIT`, `SAFE_WITHDRAWAL`, `TILL_FEED`, `TILL_SWEEP`, `INTER_SAFE_TRANSFER`, `FX_EXCHANGE`, `CLOSURE_ADJUSTMENT`.

### Challenge Architectural & Risques :
> **Question :** Est-ce que `CashTransaction` représente une opération métier, un mouvement de trésorerie, un journal opérationnel ou une écriture comptable ?  
> **Réponse de l'audit :** Elle tente de représenter **les quatre à la fois**, ce qui constitue une **violation majeure du principe de responsabilité unique (SRP)** et crée un risque d'architecture critique.

### Risques identifiés du modèle monolithique :
1. **Couplage fort et rigidité** : Une vente, un virement inter-caisses et un transfert MoneyGram obéissent à des cycles de vie métier totalement différents. Tenter de les forcer dans un schéma unique provoque la prolifération de champs optionnels incohérents.
2. **Risque de double comptabilisation (Double Posting)** : Si la création d'un `CashTransaction` génère directement une écriture comptable, et que la vente ou le règlement source déclenche séparément le moteur `AccountingEngine`, le même flux financier sera enregistré deux fois au Grand Livre.
3. **Incompatibilité avec le domaine Cash existant** : FINOPS possède déjà un modèle canonique de mouvement de trésorerie (`NormalizedCashMovement` dans `src/domains/cash/types/NormalizedCashMovement.ts`). Créer `CashTransaction` à côté créerait deux systèmes de trésorerie concurrents.

---

## 13. Séparation Obligatoire des Concepts

Pour garantir une architecture robuste, maintenable et auditable, l'architecture cible doit formellement séparer les 5 entités conceptuelles suivantes :

```text
BUSINESS OPERATION (Vente, Transfert, MoneyGram, Dépense)
        ↓
TREASURY OPERATION (Événement de Règlement / Cash Event)
        ↓
CASH MOVEMENT LEDGER (Mouvement Physique de Caisse/Coffre - SSOT)
        ↓
BALANCE PROJECTION (Solde Matérialisé / Snapshot)
        ↓
ACCOUNTING POSTING (Écriture Comptable / Journal General Ledger)
```

1. **`BusinessOperation`** : L'intention métier (ex: Facture #1042, Vente Comptoir #55, Ordre de Transfert #TR-88). Contient la logique domaine métier.
2. **`TreasuryOperation`** : L'événement d'encaissement ou de décaissement rattaché (ex: Règlement par Cash de 10 000 HTG).
3. **`CashMovement`** : L'entrée *immuable* dans le registre de la caisse ou du coffre spécifique (`tillId` / `safeId`). Il s'agit de la **Source Unique de Vérité (SSOT) physique**.
4. **`BalanceProjection`** : Le solde calculé et matérialisé de la caisse pour accès ultra-rapide (projection en lecture seule).
5. **`AccountingPosting`** : La pièce comptable en partie double transmise au `General Ledger` (`AccountingEngine`).

---

## 14. SSOT du Cash

Analyse comparative des trois options d'architecture pour le solde de caisse/coffre :

### OPTION A : Balance Mutable = SSOT
- **Principe** : Le champ `currentBalanceCents` mis à jour directement lors de chaque opération est la source de vérité.
- **Évaluation** : **REJETÉE**. Très vulnérable aux erreurs de concurrence, à la corruption de données et offre une traçabilité nulle en cas de litige.

### OPTION B : Cash Movement Ledger = SSOT (Pure Event Sourcing)
- **Principe** : Aucun solde n'est persisté. Le solde est recalculé à la volée en sommant l'ensemble des mouvements immuables depuis l'origine.
- **Évaluation** : **REJETÉE**. Auditabilité et sécurité à 100%, mais performances inacceptables lors de requêtes fréquentes sur des caisses ayant des milliers de mouvements.

### OPTION C : Cash Movement Ledger (SSOT) + Materialized Balance (Projection) + Rebuild Engine
- **Principe** : 
  - **Le registre immuable des mouvements (`cash_movements` / `NormalizedCashMovement`) est l'unique source d'autorité (SSOT).**
  - Les soldes affichés (`TillBalanceProjection`, `SafeBalanceProjection`) sont des **projections matérialisées** mises à jour de manière atomique lors de chaque mouvement.
  - Un moteur de reconstruction (`RebuildEngine`) permet de recalculer et vérifier à tout moment la projection à partir du registre.
- **Évaluation** : **RECOMMANDÉE ET ADOPTÉE (100% Conforme à la Constitution FINOPS)**.

---

## 15. Test de Reconstruction

> **Question critique :** Si `currentBalanceCents` d'une caisse ou d'un coffre est corrompu ou supprimé, peut-on reconstruire exactement la balance ?  
> **Réponse : OUI, À 100%.**

### Algorithme de Reconstruction Normatif :
1. Verrouiller temporairement la projection de la caisse pour écriture (`isReconciling = true`).
2. Récupérer le dernier snapshot de clôture validé (`TillSession` fermée avec billetage vérifié) précédant la date cible.
3. Sélectionner l'ensemble des documents immuables `cash_movements` associés au `tillId` dont `movementDate` / `timestamp` est supérieur au snapshot de clôture.
4. Filtrer les mouvements ayant un statut actif (`status IN ['POSTED', 'SETTLED', 'PAID']`), en excluant les mouvements annulés (`VOIDED`, `REVERSED`).
5. Exécuter la somme déterministe pour chaque devise (`HTG`, `USD`) :
   $$\text{Solde Reconstruit} = \text{Solde Clôture} + \sum \text{INFLOWS} - \sum \text{OUTFLOWS}$$
6. Mettre à jour la projection matérialisée `TillBalanceProjection` et enregistrer un log d'audit forensic de la reconstruction.

---

## 16. MoneyGram Architecture

Analyse du traitement de l'opération MoneyGram (Transfert d'argent international) :

### Challenge de l'approche P01 :
Le P01 réduisait MoneyGram à un simple type de transaction cash. En réalité, une opération MoneyGram implique simultanément :
- Un versement ou un retrait d'espèces au guichet (Cash Movement).
- Une commission perçue par l'entreprise (Revenue).
- Une créance/dette envers l'opérateur MoneyGram (Clearing Account).

### Modélisation Découplée de MoneyGram :
1. **`BusinessOperation`** : `MoneyGramTransaction` (détails opérateur, référence MoneyGram, devises source/cible, commission, frais).
2. **`TreasuryOperation`** : 
   - Pour un **Envoi** (Payout par le client) : Inflow Cash au guichet = Montant + Frais.
   - Pour un **Paiement** (Payin au client) : Outflow Cash du guichet = Montant versé au client.
3. **`AccountingPosting`** :
   - *Envoi* : Débit `1000_CASH` / Crédit `2000_MONEYGRAM_CLEARING` + Crédit `4000_COMMISSION_REVENUE`.
   - *Paiement* : Débit `2000_MONEYGRAM_CLEARING` / Crédit `1000_CASH`.

### Clé d'idempotence MoneyGram :
Afin d'éviter qu'une re-soumission réseau génère un double mouvement de caisse, la clé d'idempotence unique est construite comme suit :
$$\text{IdempotencyKey} = \text{`MG_` + businessId + `_` + providerReference + `_` + actionType}$$

---

## 17. FX / Change Architecture

### Distinction des Taux :
1. **Taux Commercial Guichet (`commercialRate`)** : Taux de change négocié ou appliqué directement au client au guichet (Achat/Vente d'espèces).
2. **Taux Comptable de Valorisation (`accountingRate`)** : Taux officiel de référence (ex: Taux moyen de la Banque Centrale BRH du jour) utilisé pour la comptabilisation dans le General Ledger.

### Traitement du Snapshot de Taux :
Toute transaction d'échange de devises en caisse (`FX_EXCHANGE`) doit figer dans son document immuable les données suivantes :
- `commercialRate` : Taux effectivement appliqué au client.
- `accountingRate` : Taux officiel BRH au moment de l'opération.
- `rateSource` : `"BRH"` ou `"ADMIN_OVERRIDE"`.
- `realizedFxGainLossCents` : Écart calculé entre le taux commercial et le taux comptable.

---

## 18. Gain / Perte de Change

### Processus de valorisation comptable :
Lors d'une opération de change d'espèces au guichet (ex: Achat de $100\text{ USD}$ à $130\text{ HTG/USD}$, alors que le taux officiel BRH est de $135\text{ HTG/USD}$) :
1. **Flux Cash Réel (Mouvement Guichet)** :
   - Entrée en caisse : $+100\text{ USD}$ ($10\ 000\text{ cents USD}$).
   - Sortie de caisse : $-13\ 000\text{ HTG}$ ($1\ 300\ 000\text{ cents HTG}$).
2. **Valorisation au Taux BRH ($135\text{ HTG}$)** :
   - La valeur officielle des $100\text{ USD}$ reçus est de $13\ 500\text{ HTG}$.
3. **Écriture Comptable (General Ledger)** :
   - Débit `1000_CASH_USD` : $13\ 500\text{ HTG}$ (valeur officielle).
   - Crédit `1000_CASH_HTG` : $13\ 000\text{ HTG}$ (cash déboursé).
   - Crédit `7680_REALIZED_FX_GAIN` : $500\text{ HTG}$ (gain de change réalisé).

*Remarque : Les comptes `7680_REALIZED_FX_GAIN` et `6680_REALIZED_FX_LOSS` sont actuellement des propositions et doivent être formellement ajoutés au Plan Comptable (`CHART_OF_ACCOUNTS`).*

---

## 19. Till / Caisse Architecture

Challenge de l'entité `Till` :

### Définition des Concepts :
- **Emplacement physique (`Till`)** : Représente le tiroir-caisse physique ou le poste de travail attribué à une succursale (`branchId`). Possède un identifiant unique immuable (`tillId`).
- **Portefeuille multi-devises** : Une caisse physique peut détenir simultanément des coupures en `HTG` et en `USD`. Les soldes sont suivis par devise séparée via des projections matérialisées (`TillBalanceProjection`).
- **Session d'utilisateur (`TillSession`)** : Représente la période opérationnelle couverte par un guichetier spécifique. 

### Réponses aux questions d'architecture :
- *Une caisse peut-elle changer d'utilisateur dans la journée ?* **OUI**, mais chaque changement d'utilisateur exige la fermeture de la `TillSession` précédente (avec comptage physique/billetage) et l'ouverture d'une nouvelle `TillSession`.
- *Plusieurs sessions simultanées sur une même caisse ?* **NON**. Une caisse physique ne peut avoir qu'une seule `TillSession` à l'état `OPEN` à un instant T.
- *Une caisse peut-elle être fermée sans transfert au coffre ?* **OUI**. Le transfert du solde de caisse vers le coffre-fort à la clôture est une option configurable (`transferToSafeOnClose`), et non une obligation système absolue.

---

## 20. Session de Caisse

Modélisation formelle des entités de caisse et de leurs relations :

```text
Till (Emplacement / Equipement physique)
  └── TillSession (Période opérationnelle active)
        ├── TillAssignment (Guichetier affecté + Rôle)
        ├── OpeningBilletage (Comptage initial)
        ├── CashMovements (Mouvements de trésorerie de la session)
        └── ClosingBilletage & Variance (Comptage final & Écart)
```

1. **`Till`** : `{ id, businessId, branchId, code, name, status: 'ACTIVE' | 'MAINTENANCE' }`
2. **`TillSession`** : `{ id, tillId, businessId, branchId, openedBy, openedAt, closedAt, status: 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED', openingBalanceCents: { HTG, USD }, closingBalanceCents: { HTG, USD }, varianceCents: { HTG, USD } }`

---

## 21. Safe / Coffre Architecture

### Principes directeurs pour les Coffres-forts (`Safe`) :
- Le coffre-fort de la succursale ou du siège est géré comme une entité de trésorerie de haut niveau.
- Il supporte nativement la tenue multi-devises (`HTG`, `USD`).
- **Règle absolue** : La balance du coffre ne doit pas reposer uniquement sur un champ mutable. Le solde du coffre est une projection matérialisée (`SafeBalanceProjection`) garantie par le registre immuable des mouvements de coffre (`cash_movements` ciblés sur le `safeId`).

---

## 22. Transferts Lifecycle

Définition normative des états du cycle de vie des transferts de fonds (Caisses, Coffres, Succursales) :

```text
[INITIATED] ──(Si approbation requise)──> [PENDING_APPROVAL]
     │                                           │
(Approuvé ou Direct)                      (Approuvé)
     │                                           │
     ▼                                           ▼
[IN_TRANSIT] ──(Réception par destinataire)──> [RECEIVED] ──> [COMPLETED]
     │                                           │
 (Annulé)                                    (Rejeté)
     │                                           │
     ▼                                           ▼
[CANCELLED] <───────────────────────────── [REJECTED]
```

- **`INITIATED`** : Le transfert est demandé par l'émetteur.
- **`PENDING_APPROVAL`** : En attente d'approbation par le Chef Caissier ou le Manager (si le montant dépasse le seuil paramétré).
- **`IN_TRANSIT`** : Le montant est **débité de la source** et placé en compte de transit.
- **`RECEIVED` / `COMPLETED`** : Le destinataire a compté et accepté les fonds. Le montant est **crédité sur le destinataire**.
- **`REJECTED` / `CANCELLED`** : Le destinataire refuse le transfert ou l'émetteur l'annule. Les fonds en transit sont **restitués à la source**.

---

## 23. Question Critique : Quand le Solde Source est-il Débité ?

> **Challenge de la décision P01 :** Le P01 proposait de débiter la caisse source dès le statut `PENDING_ACCEPTANCE`.

### Analyse des 3 Modèles :
- **Modèle 1 (Débit à l'initiation)** : Risque de blocage et de complexité lors des rejets.
- **Modèle 2 (Réservation logique)** : Complique le suivi du cash physique réel en caisse.
- **Modèle 3 (Débit source lors du passage en `IN_TRANSIT` → transit → Crédit destination à la réception)** : **MODÈLE RETENU**.

### Justification du Modèle Retenu (Modèle 3) :
Dès que les fonds quittent physiquement le tiroir-caisse de la source, la caisse source est **débitée immédiatement** et les fonds entrent dans l'état `IN_TRANSIT` (portés par le compte de transit `1080_CASH_IN_TRANSIT`). Cela garantit que :
1. Le guichetier émetteur n'a plus ce cash dans son solde théorique (empêche le double-emploi / double-spending).
2. Le destinataire ne voit pas les fonds dans son solde disponible tant qu'il n'a pas physiquement validé la réception (empêche le double-comptage / phantom funds).

---

## 24. Cash-in-Transit

- **Distinction conceptuelle** :
  - **Statut Opérationnel (`IN_TRANSIT`)** : État du workflow métier indiquant que les fonds sont en déplacement entre deux emplacements physiques.
  - **Représentation Comptable (`1080_CASH_IN_TRANSIT`)** : Compte de liaison de classe 1 utilisé au General Ledger lors de la comptabilisation en partie double.
- **Indépendance opérationnelle** : Le transfert opérationnel peut être exécuté et suivi dans le registre de trésorerie même si le compte comptable spécifique `1080_CASH_IN_TRANSIT` n'est pas encore déployé au Plan Comptable (en utilisant temporairement un compte de clearing générique).

---

## 25. Closure / Clôture Lifecycle

Définition du workflow normatif de clôture journalière de caisse :

1. **Initiation (`PENDING_CLOSURE`)** : Le guichetier stoppe les opérations d'encaissement.
2. **Billetage physique (`Physical Count`)** : Saisie obligatoire du détail des coupures en caisse pour chaque devise.
3. **Calcul d'écart (`Variance Calculation`)** :
   $$\text{Écart} = \text{Montant Billeté (Physique)} - \text{Solde Théorique (Système)}$$
4. **Validation / Approbation (`Approval Workflow`)** :
   - Si l'écart est inférieur au seuil de tolérance (ex: 0 HTG ou seuil configuré) : Clôture automatique.
   - Si l'écart dépasse la tolérance : La session passe en `PENDING_APPROVAL` (nécessite décision du Manager/Owner).
5. **Transfert Optionnel au Coffre (`Safe Sweep`)** : Transfert de tout ou partie du cash vers le coffre-fort.
6. **Clôture Finale (`CLOSED`)** : La session est verrouillée de manière immuable.

---

## 26. Billetage Architecture

- **Nature du Billetage** : Le billetage est une **observation physique auditable** du cash présent à un instant donné. Il ne constitue en aucun cas une source d'écriture comptable directe.
- **Formule de vérification** :
  $$\text{Montant Physique Saisi} = \sum_{d} (\text{Valeur Coupure}_d \times \text{Quantité}_d)$$
- **Auditabilité** : Chaque relevé de billetage est conservé sous forme de sous-document immuable dans la `TillSession` avec signature de l'opérateur et horodatage serveur.

---

## 27. Écart de Caisse

Gestion normative des écarts de caisse (Surplus ou Déficit) :

1. **Écart Positif (Surplus / Excedent)** :
   - Saisie dans `TillSession.varianceCents`.
   - Nécessite l'approbation du Manager si > tolérance.
   - Écriture comptable : Débit `1000_CASH` / Crédit `7780_CASH_DISCREPANCY_GAIN` (ou compte de produit exceptionnel).
2. **Écart Négatif (Déficit / Manquant)** :
   - Saisie dans `TillSession.varianceCents`.
   - Si la politique entreprise met l'écart à la charge du guichetier : Écriture de créance employé (Débit `1300_EMPLOYEE_ADVANCES` / Crédit `1000_CASH`).
   - Si l'écart est pris en charge par l'entreprise : Écriture de charge (Débit `6780_CASH_DISCREPANCY_LOSS` / Crédit `1000_CASH`).

---

## 28. SALE_CARD (Transactions par Carte)

- **Challenge P01** : Le P01 incluait `SALE_CARD` dans la collection des transactions de caisse d'espèces.
- **Règle absolue d'architecture** :
  > **Une transaction par carte bancaire (POS/TPE) N'EST PAS un mouvement d'espèces physiques en caisse.**
- **Acheminement correct** : Les règlements par carte bancaire doivent être enregistrés comme des encaissements de banque ou des comptes de clearing monétique (`1010_BANK` / `2000_CARD_CLEARING`). Ils ne doivent jamais impacter le solde d'espèces physiques du tiroir-caisse (`Till.cashBalance`).

---

## 29. Petty Expense (Petty Cash)

- **Nature de l'opération** : Une dépense de petite caisse (`PETTY_EXPENSE`) est un décaissement d'espèces du tiroir-caisse ou du coffre pour couvrir une charge opérationnelle immédiate.
- **Découpage conceptuel** :
  1. `BusinessOperation` : `PettyExpenseVoucher` (justificatif, reçu, catégorie de dépense, bénéficiaire).
  2. `CashMovement` : Outflow physique sur la caisse/coffre (`direction: 'OUTFLOW'`, `movementType: 'EXPENSE'`).
  3. `AccountingPosting` : Débit `5900_GENERAL_EXPENSES` (ou compte de charge spécifique) / Crédit `1000_CASH`.

---

## 30. Double Posting Prevention

Afin de prévenir tout risque de double comptabilisation lorsqu'une opération est initiée depuis le guichet :

1. **Clé d'Idempotence Unique Transversale** : Toute écriture transmise au General Ledger (`AccountingEngine`) doit inclure une clé d'idempotence stricte :
   $$\text{GLIdempotencyKey} = \text{`GL_` + sourceModule + `_` + sourceId + `_` + movementType}$$
2. **Garde-fou dans `AccountingEngine`** : Avant toute création de pièce comptable dans `journal_entries`, `AccountingEngine` vérifie l'existence d'un document portant la même clé d'idempotence. Si la clé existe déjà, la requête renvoie le résultat existant sans régénérer d'écritures.

---

## 31. Idempotency Analysis

Matrice normative des clés d'idempotence par workflow opérationnel :

| Workflow | Clé d'idempotence canonique | Comportement en cas de re-soumission |
|---|---|---|
| `SALE_CASH` | `IDEM_SALE_{businessId}_{invoiceId/saleId}` | Renvoie le mouvement cash existant sans re-débiter. |
| `PETTY_EXPENSE` | `IDEM_EXP_{businessId}_{voucherId}` | Ignore la saisie en double et conserve l'écriture initiale. |
| `FX_EXCHANGE` | `IDEM_FX_{businessId}_{tillSessionId}_{timestamp}` | Maintient la transaction de change unique. |
| `MONEYGRAM` | `IDEM_MG_{businessId}_{providerReference}_{action}` | Bloque la répétition de l'envoi/retrait d'espèces. |
| `TILL_TO_SAFE` | `IDEM_TR_TS_{businessId}_{transferId}` | Empêche le double débit de la caisse émettrice. |
| `SAFE_TO_TILL` | `IDEM_TR_ST_{businessId}_{transferId}` | Empêche le double débit du coffre-fort. |
| `SAFE_TO_SAFE` | `IDEM_TR_SS_{businessId}_{transferId}` | Garantit un transfert unique inter-coffres. |
| `CLOSURE` | `IDEM_CLOSE_{businessId}_{tillSessionId}` | Garantit la clôture unique de la session. |

---

## 32. Concurrency Analysis

Afin de garantir l'intégrité absolue des soldes lors d'opérations simultanées sur la même caisse ou le même coffre, **toute modification de solde ou enregistrement de mouvement doit impérativement s'exécuter dans une transaction Firestore atomique (`db.runTransaction`)**.

### Étapes obligatoires à l'intérieur de la transaction Firestore :
```text
1. Read Till document & TillBalanceProjection document
2. Read active TillSession document
3. Assert isAuthenticated() & Tenant Isolation (businessId)
4. Assert TillSession.status == 'OPEN'
5. Assert TillBalanceProjection.currentBalanceCents >= OutflowAmount (si décaissement)
6. Write immutable document in /cash_movements
7. Update TillBalanceProjection document
8. Write audit record
```

---

## 33. Maker-Checker Analysis

Matrice d'exigence Maker-Checker (Double validation) par type d'opération :

| Opération | Maker-Checker Obligatoire ? | Approbateur requis | Seuil d'application |
|---|---|---|---|
| Vente Cash Standard (`SALE_CASH`) | **NON** (Exécution directe) | N/A | Montant < Plafond caisse. |
| Petite dépense (`PETTY_EXPENSE`) | **SOUMIS À SEUIL** | `HEAD_TELLER` / `MANAGER` | Si montant > `pettyExpenseThreshold`. |
| Échange de devises (`FX_EXCHANGE`) | **SOUMIS À SEUIL** | `MANAGER` | Si dérogation sur le taux commercial (> spread autorisé). |
| Transfert Caisse -> Coffre | **SOUMIS À SEUIL** | `HEAD_TELLER` / `MANAGER` | Si montant > `transferAutoApproveLimit`. |
| Transfert Coffre -> Coffre | **OUI** | `MANAGER` / `OWNER` | Toujours obligatoire. |
| Transfert Inter-Succursales | **OUI** | `OWNER` / `ADMIN` | Toujours obligatoire. |
| Clôture avec Écart (`CLOSURE_VARIANCE`) | **OUI** | `MANAGER` / `OWNER` | Si écart > `maxAutoApproveVariance`. |

---

## 34. Firestore Architecture

Structure minimale, optimisée et étanche des collections Firestore cibles :

```text
/tills/{tillId} (Projections & Métadonnées Caisse)
/till_sessions/{sessionId} (Sessions opérationnelles & Billetage)
/safes/{safeId} (Projections & Métadonnées Coffre)
/cash_movements/{movementId} (REGISTRE IMMUABLE SSOT - Partagé Caisses & Coffres)
/cash_transfers/{transferId} (Workflows de transfert)
```

### Élimination des collections redondantes :
- **Abandon de la collection monolithique `/cash_transactions`** : Remplacée par `/cash_movements` (qui réutilise le contrat `NormalizedCashMovement`).
- **Fusion des mouvements Caisses et Coffres** : La collection `/cash_movements` héberge l'ensemble des mouvements physiques de trésorerie (caisses, coffres, banques) différenciés par le champ `cashAccountId` (`tillId`, `safeId`, `bankAccountId`).

---

## 35. Target Architecture

Schéma global de l'architecture cible minimale et unifiée :

```text
               ┌─────────────────────────────────────────┐
               │    BUSINESS OPERATION (Vente/Transfert) │
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐
               │  TREASURY EVENT (Règlement / Cash Event)│
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
               ┌─────────────────────────────────────────┐
               │ CASH MOVEMENT LEDGER (/cash_movements)  │ <─── [SSOT ABSOLU]
               └────────────────────┬────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────────────┐         ┌─────────────────────────────────┐
│ BALANCE PROJECTION            │         │ ACCOUNTING ENGINE (General L.) │
│ (Till/SafeBalanceProjection)  │         │ (Journal Entries Partie Double) │
└──────────────┬────────────────┘         └────────────────┬────────────────┘
               │                                           │
               ▼                                           ▼
┌───────────────────────────────┐         ┌─────────────────────────────────┐
│ RECONCILIATION & REBUILD ENG. │         │ FINANCIAL STATEMENTS / GL       │
└───────────────────────────────┘         └────────────────┬────────────────┘
                                                           │
                                                           ▼
                                          ┌─────────────────────────────────┐
                                          │ CONSOLIDATED BI PIPELINE        │
                                          └─────────────────────────────────┘
```

---

## 36. Intégration avec FINOPS Existant

Stratégie de réutilisation des composants FINOPS existants :

| Composant FINOPS Existant | Emplacement Codebase | Décision de Réutilisation | Justification & Action |
|---|---|---|---|
| `AccountingEngine` | `src/services/AccountingEngine.ts` | **REUSE & EXTEND** | Moteur central du GL. Réutiliser pour la génération d'écritures en partie double. Élégamment étendre avec les règles d'écart et de change. |
| `LedgerRepository` | `src/repositories/LedgerRepository.ts` | **REUSE** | Dépôt central des pièces comptables. Réutiliser tel quel. |
| `PermissionService` | `src/services/PermissionService.ts` | **EXTEND** | Ajouter les nouvelles capacités granulaires de caisse (`till.*`, `safe.*`) dans `TENANT_ERP_CAPABILITIES`. |
| `ServerApprovalGateway` | `src/services/` | **REUSE** | Moteur central d'approbation et de Maker-Checker. Réutiliser pour les validations de transferts et d'écarts. |
| `CurrencyRateRepository` | `src/repositories/CurrencyRateRepository.ts` | **EXTEND** | Étendre pour gérer les taux d'achat/vente (`buyRate`/`sellRate`) et les snapshots de taux commercial. |
| `CashSettlementRepository` | `src/repositories/CashSettlementRepository.ts` | **ADAPTER** | Encapsuler / adapter les anciens règlements vers le modèle canonique `NormalizedCashMovement`. |
| `NormalizedCashMovement` | `src/domains/cash/types/` | **REUSE & CANONICAL SSOT** | Modèle canonique de trésorerie. À réutiliser comme contrat d'entrée pour tous les mouvements de caisse et coffre. |
| `CashBasisEngine` | `src/domains/cash/engine/` | **REUSE** | Moteur de calcul de trésorerie BI. Réutiliser directement sur la collection unifiée des mouvements. |

---

## 37. Ne Pas Créer Deux Systèmes de Cash

- **Constat d'audit** : FINOPS possède déjà la collection et les adapteurs `NormalizedCashMovement` dans `src/domains/cash/`.
- **Décision d'architecture absolue** :
  > **Il n'existait et il n'existera QU'UN SEUL registre canonique de mouvements de cash dans FINOPS : `NormalizedCashMovement` (stocké sous `/cash_movements`).**
- Tout mouvement physique en caisse (Vente cash, Dépense, Transfert vers coffre, Change) est instancié comme un document `NormalizedCashMovement` enrichi des métadonnées d'emplacement (`tillId`, `safeId`, `sessionId`).

---

## 38. BI Integration

Le pipeline BI (moteur `CashBasisEngine`, hook `useCashBasisBI` et vues analytiques) consomme directement la collection unifiée `/cash_movements`.
- Aucune donnée du solde de caisse n'est recalculée par une deuxième logique dans le module BI.
- Le module BI filtre les mouvements par `businessId`, `branchId` et `movementDate` pour produire la trésorerie nette et les flux de trésorerie consolidés.

---

## 39. Migration

Plan de migration sans perte de données ni distorsion comptable :

1. **Phase 1 : Backfill & Normalisation** : Script de migration transformant les anciens enregistrements `cash_settlements` historiques en documents `NormalizedCashMovement` conformes.
2. **Phase 2 : Initialisation des Snapshots** : Génération des projections de solde initiales (`TillBalanceProjection`, `SafeBalanceProjection`) à partir des totaux recalculés.
3. **Phase 3 : Bascule en Lecture/Écriture Unifiée** : Routing de toutes les nouvelles opérations de caisse vers `/cash_movements`.
4. **Validation de Réconciliation** : Exécution de `CrossSourceCashReconciliationEngine` pour vérifier l'exactitude à 100% entre le GL et les mouvements de caisse.

---

## 40. Test de Non-Régression Strategy

Inventaire des suites de tests à exécuter lors de la future phase d'implémentation :

### 1. Tests Unitaires (Unit Tests)
- Calcul de conversion de devises avec spreads d'achat/vente.
- Validation des schémas Zod de billetage physique et détection d'écarts.
- Classification et détection de la direction des flux (INFLOW, OUTFLOW, TRANSFER).

### 2. Tests d'Intégration (Integration Tests)
- Workflow complet d'une vente cash : Vente -> Cash Movement -> Update Projection -> Accounting Posting.
- Workflow complet de transfert Caisse -> Coffre avec approbation et étape `IN_TRANSIT`.
- Workflow de clôture de caisse avec approbation d'écart par le Manager.

### 3. Tests de Concurrence (Concurrency Tests)
- Exécution simultanée de 10 encaissements sur la même caisse via `db.runTransaction` (vérification de l'exactitude du solde final).
- Tentatives de double-soumission de la même opération avec la même clé d'idempotence.

### 4. Tests de Sécurité & Tenant Isolation (Security Tests)
- Tentative d'accès ou de virement vers une caisse d'un autre tenant `businessId` (Vérification du rejet par `firestore.rules`).
- Tentative de contournement du Maker-Checker par un rôle non autorisé.

### 5. Tests de Reconstruction (Reconstruction Tests)
- Corruption volontaire d'une projection `TillBalanceProjection` et exécution du `RebuildEngine` pour restaurer le solde exact.

---

## 41. INVENTED_OR_UNVERIFIED_DECISIONS

Inventaire exhaustif des décisions, règles ou valeurs du rapport P01 qui se sont révélées être des propositions non démontrées dans le code actuel :

1. **`1010_TILL` (Compte comptable Caisse Guichet)** : Proposition P01. Inexistant dans `CHART_OF_ACCOUNTS`.
2. **`1010_SAFE` (Compte comptable Coffre-fort)** : Proposition P01. Inexistant dans `CHART_OF_ACCOUNTS`.
3. **`1080_CASH_IN_TRANSIT` (Compte Cash en Transit)** : Proposition P01. Inexistant dans `CHART_OF_ACCOUNTS`.
4. **`6680_REALIZED_FX_LOSS` / `7680_REALIZED_FX_GAIN`** : Propositions P01. Inexistants dans `CHART_OF_ACCOUNTS`.
5. **`6780_CASH_DISCREPANCY_LOSS` / `7780_CASH_DISCREPANCY_GAIN`** : Propositions P01. Inexistants dans `CHART_OF_ACCOUNTS`.
6. **`1250_EMPLOYEE_RECEIVABLES`** : Proposition P01. FINOPS utilise `1300_EMPLOYEE_ADVANCES`.
7. **Seuils d'approbation (500 HTG / 5 000 HTG)** : Valeurs arbitraires de l'exemple P01.
8. **Plafonds de caisse (250 000 HTG / 2 000 USD)** : Valeurs arbitraires de l'exemple P01.
9. **`CashTransaction` comme modèle d'entité monolithique** : Proposition P01 en conflit avec `NormalizedCashMovement`.
10. **Débit source au statut `PENDING_ACCEPTANCE`** : Règle P01 rejetée au profit du débit à l'état `IN_TRANSIT`.
11. **Obligation absolue du transfert au coffre à la clôture** : Règle P01 révisée en option paramétrable.
12. **Permissions `till.*` et `safe.*` présentées comme existantes** : Propositions P01 absentes de `PermissionService.ts`.

---

## 42. DECISIONS_REQUIRED_BEFORE_IMPLEMENTATION

Registre des 15 Décisions d'Architecture (Decision Records - DR) devant être formellement validées par les parties prenantes avant d'autoriser toute écriture de code :

### `DR-001` — Source Unique de Vérité du Cash
- **Question** : Le solde de caisse repose-t-il sur un champ mutable ou sur un registre d'événements immuables ?
- **Assumption** : L'Option C (Registre immuable `/cash_movements` + Projections matérialisées) est le SSOT.
- **Option recommandée** : Option C.
- **Impact** : Garantit 100% d'auditabilité et de récupérabilité.

### `DR-002` — Extension du Plan Comptable (COA)
- **Question** : Faut-il ajouter formellement les comptes `1010_TILL`, `1010_SAFE`, `1080_CASH_IN_TRANSIT`, `6680`, `7680`, `6780`, `7780` au Plan Comptable `CHART_OF_ACCOUNTS` ?
- **Assumption** : Oui, extension contrôlée de `src/constants/finance.ts`.
- **Option recommandée** : Ajouter ces comptes dans `CHART_OF_ACCOUNTS`.
- **Impact** : Alignement strict entre la tenue des caisses et le General Ledger.

### `DR-003` — Modèle de Rôles et Sous-profils Guichet
- **Question** : Faut-il étendre le type TypeScript `Role` avec `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER` ou utiliser le rôle `EMPLOYEE` avec des profils de compétences ?
- **Assumption** : Étendre le type `Role` ou formaliser la sous-attributisation dans `EmployeeProfile`.
- **Option recommandée** : Étendre `Role` dans `src/types.ts` pour supporter la hiérarchie de caisse.
- **Impact** : Sécurisation du RBAC dans `PermissionService.ts`.

### `DR-004` — Paramétrage des Seuils d'Approbation
- **Question** : Les seuils (ex: 500 HTG, 5 000 HTG) doivent-ils être configurables dans `BusinessSettings` ?
- **Assumption** : Oui, aucun montant ne doit être hardcodé.
- **Option recommandée** : Ajouter les seuils d'approbation dans l'entité `BusinessSettings`.
- **Impact** : Souplesse multi-tenant pour adapter les règles selon la taille de chaque entreprise.

### `DR-005` — Frontière du Mouvement MoneyGram
- **Question** : MoneyGram génère-t-il une entité métier dédiée distincte des mouvements de caisse ?
- **Assumption** : Oui, `MoneyGramTransaction` génère un ou deux flux dans `/cash_movements`.
- **Option recommandée** : Séparer l'opération métier MoneyGram du mouvement physique de caisse.
- **Impact** : Évite les conflits d'imputation comptable et facilite le rapprochement avec l'opérateur.

### `DR-006` — Gestion des Taux d'Achat/Vente (Spreads FX)
- **Question** : La collection `/exchange_rates` doit-elle intégrer les champs `buyRate` et `sellRate` ?
- **Assumption** : Oui, pour couvrir le change commercial au guichet.
- **Option recommandée** : Étendre `ExchangeRate` dans `CurrencyRateRepository.ts`.
- **Impact** : Calcul exact des gains/pertes de change lors des conversions d'espèces.

### `DR-007` — Verrouillage du Taux Système par Défaut (135.0 HTG/USD)
- **Question** : Le taux par défaut (135.0) peut-il servir en cas d'absence de taux du jour ?
- **Assumption** : Non, bloquer le change commercial en caisse si aucun taux effectif du jour n'est présent.
- **Option recommandée** : Exiger la présence d'un taux actif ou un override explicite du Manager.
- **Impact** : Évite les distorsions financières majeures liées à un taux par défaut obsolète.

### `DR-008` — Débit Source lors des Transferts Inter-Caisses
- **Question** : À quel moment le solde de la caisse émettrice est-il débité lors d'un transfert ?
- **Assumption** : Débit immédiat lors du passage à l'état `IN_TRANSIT`.
- **Option recommandée** : Débit immédiat + fonds placés en compte de transit `1080_CASH_IN_TRANSIT`.
- **Impact** : Élimine les risques de double-dépense physique au guichet.

### `DR-009` — Sortie des Règlements Carte du Mouvement d'Espèces
- **Question** : Les encaissements par carte bancaire (`SALE_CARD`) doivent-ils impacter la balance de caisse physique ?
- **Assumption** : Non, acheminement vers la banque ou compte de clearing monétique.
- **Option recommandée** : Exclure `SALE_CARD` de la balance d'espèces du tiroir-caisse.
- **Impact** : Préserve l'exactitude du solde d'espèces physiques en caisse.

### `DR-010` — Optionnalité du Transfert au Coffre à la Clôture
- **Question** : Le transfert du solde de caisse vers le coffre-fort à la clôture est-il obligatoire ?
- **Assumption** : Optionnel et paramétrable par caisse/succursale.
- **Option recommandée** : Rendre le transfert vers le coffre configurable dans `Till.transferToSafeOnClose`.
- **Impact** : Permet aux caisses permanentes de conserver leur fond de roulement initial pour le lendemain.

### `DR-011` — Approbation Obligatoire des Écarts de Caisse
- **Question** : Un écart de caisse supérieur au seuil de tolérance bloque-t-il la clôture en attente d'approbation ?
- **Assumption** : Oui, passage de la session en `PENDING_APPROVAL`.
- **Option recommandée** : Exiger la validation d'un Manager/Owner via `ServerApprovalGateway`.
- **Impact** : Empêche la dissimulation d'écarts de caisse non autorisés.

### `DR-012` — Réutilisation du Contrat `NormalizedCashMovement`
- **Question** : Les mouvements de caisse et coffre doivent-ils adopter le contrat existant `NormalizedCashMovement` ?
- **Assumption** : Oui, réutilisation stricte sans recréer un deuxième système.
- **Option recommandée** : Utiliser `/cash_movements` basé sur `NormalizedCashMovement`.
- **Impact** : Alignement direct avec le moteur BI `CashBasisEngine`.

### `DR-013` — Inscription des Capacités de Caisse dans `PermissionService.ts`
- **Question** : Les capacités granulaires (`till.open_close`, `safe.deposit_withdraw`, etc.) doivent-elles être ajoutées au registre canonique ?
- **Assumption** : Oui, ajout dans `TENANT_ERP_CAPABILITIES`.
- **Option recommandée** : Étendre `TENANT_ERP_CAPABILITIES` dans `PermissionService.ts`.
- **Impact** : Garantie du principe de moindre privilège et échec de sécurité par défaut (Fail-Closed).

### `DR-014` — Traitement des Dépenses de Petite Caisse (Petty Expense)
- **Question** : Les dépenses de petite caisse nécessitent-elles un bon de dépense (`PettyExpenseVoucher`) préalable ?
- **Assumption** : Oui, toute sortie de caisse pour dépense exige un justificatif signé.
- **Option recommandée** : Lier tout mouvement `PETTY_EXPENSE` à un justificatif approuvé.
- **Impact** : Rapprochement comptable et justification fiscale des pièces de caisse.

### `DR-015` — Stratégie de Reconstruction Atomique des Soldes
- **Question** : Le moteur de reconstruction peut-il être exécuté en arrière-plan sans perturber les ventes actives ?
- **Assumption** : Oui, en appliquant un verrouillage temporaire de réconciliation sur la projection.
- **Option recommandée** : Isoler les reconstructions dans un job de maintenance ou de clôture.
- **Impact** : Maintien des performances de caisse en heures de pointe.

---

## 43. Target Architecture Summary

L'architecture cible validée par ce gate garantit :
1. **Un Seul Registre Trésorerie (SSOT)** : Toutes les opérations d'espèces (ventes, dépenses, transferts, change, MoneyGram) sont inscrites de manière immuable sous la collection unique `/cash_movements` (format `NormalizedCashMovement`).
2. **Un Seul Grand Livre (GL SSOT)** : L'ensemble des écritures comptables est centralisé sous `journal_entries` via l'unique moteur `AccountingEngine`.
3. **Un Seul Moteur BI** : Les rapports de trésorerie et d'analyse BI s'alimentent directement du registre unifié sans double calcul.
4. **Intégrité Multi-tenant & RBAC** : Isolisme tenant strict via `businessId` et contrôle d'accès garanti par `PermissionService.ts` et `firestore.rules`.

---

## 44. Final Architecture Gate Verdict

Conformément aux critères de validation définis dans la section 43 du prompt d'audit :

```text
===============================================================================
                       VERDICT FINAL DU ARCHITECTURE GATE
===============================================================================

             [ OPTION 2 : ARCHITECTURE_APPROVED_WITH_DECISIONS ]

  L'architecture cible est conceptuellement solide, parfaitement alignée sur
  la Constitution FINOPS ERP (GEMINI.md) et garantit l'unicité de la Source
  de Vérité de trésorerie (NormalizedCashMovement) ainsi que du General Ledger.

  Cependant, l'implémentation du code de production NE DOIT PAS DÉBUTER tant
  que les 15 Décisions d'Architecture (DR-001 à DR-015) listées dans la
  section 42 n'ont pas été formellement validées par les parties prenantes.
===============================================================================
```

### Prochaines étapes autorisées :
1. Soumettre la liste des 15 Décisions d'Architecture (`DR-001` à `DR-015`) pour validation formelle par le Board Produit.
2. Une fois les choix arrêtés sur les DRs, préparer le plan d'implémentation incrémental phase par phase (sans jamais violer les contraintes de non-régression ni la Constitution GEMINI.md).
3. Aucun code de production n'a été modifié lors de cette phase d'audit (100% Read-Only respecté).
