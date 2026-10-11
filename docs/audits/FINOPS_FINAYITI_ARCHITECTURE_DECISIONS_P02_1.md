# FINOPS × FINAYITI — PROMPT 02.1 — ARCHITECTURE DECISION REGISTER (DR-001 À DR-015)

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Auteur :** AI Engineering Orchestrator / FINOPS Architecture Board  
**Version :** 1.0  
**Statut :** AUDIT ACHEVÉ — PRÊT POUR VALIDATION FORMELLE  
**Mode :** Strict Audit & Conception — Read-Only Codebase (0 mutation de code de production)  
**Prérequis :** `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_GATE_P02.md`  
**Livrable :** Spécification exhaustive des 15 Décisions d'Architecture (DR-001 à DR-015)

---

## 1. Contexte & Démarche d'Analyse

Le rapport d'audit architectural **PROMPT 02** (`docs/audits/FINOPS_FINAYITI_ARCHITECTURE_GATE_P02.md`) a rendu le verdict :
```text
[ OPTION 2 : ARCHITECTURE_APPROVED_WITH_DECISIONS ]
```
Ce verdict confirme que l'architecture cible de fusion entre FINOPS ERP et les modules opérationnels FINAYITI (caisses guichet, coffres-forts, change de devises, transferts, clôtures et enregistrements comptables) est conceptuellement valide et respecte la Constitution `GEMINI.md`.

Néanmoins, conformément au principe **"Architecture First & Minimal Change"**, aucune écriture de code de production ne peut être initiée tant que les **15 Décisions d'Architecture (DR-001 à DR-015)** identifiées dans la section 42 du rapport P02 n'ont pas fait l'objet d'un examen contradictoire détaillé, étayé par des preuves tirées directement de la codebase FINOPS.

Le présent document constitue le **Registre Officiel des Décisions d'Architecture (ADR)**. Pour chacune des 15 décisions, il fournit une fiche d'analyse rigoureuse comprenant :
1. Intitulé canonique et référence
2. Définition précise du problème / Question d'architecture
3. État actuel vérifié dans le code FINOPS (avec preuves : fichiers, interfaces, lignes, constantes)
4. Comparaison d'au moins 2 options d'architecture (Avantages / Inconvénients)
5. Recommandation technique motivée
6. Matrice d'impact complète (Code, Types, Repositories, Firestore Security Rules, General Ledger)
7. Dépendances et risques d'implémentation

---

## 2. Fiches d'Analyse Approfondies DR-001 à DR-015

---

### `DR-001` — Source Unique de Vérité (SSOT) du Cash

#### 1. Question d'Architecture
Comment garantir l'intégrité absolue, l'auditabilité financière et la résilience aux pannes du solde des caisses guichet et coffres-forts sans risquer des désynchronisations avec le General Ledger (GL) ou le pipeline BI ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/types/NormalizedCashMovement.ts`, `src/domains/cash/engine/CashBasisEngine.ts`, `src/repositories/CashSettlementRepository.ts`, `src/repositories/TillRepository.ts`.
- **Preuves de code** :
  - `NormalizedCashMovement.ts` (lignes 1-45) définit l'interface canonique `NormalizedCashMovement` avec les champs : `id`, `businessId`, `sourceModule` (`'PAYROLL' | 'INVOICE' | 'LEDGER' | 'CASH_SETTLEMENT'`), `sourceId`, `amountCents`, `currency`, `direction` (`'INFLOW' | 'OUTFLOW'`), `movementType`, `movementDate`, `createdAt`.
  - `CashBasisEngine.ts` (lignes 20-85) agrège les flux nets à partir des instances de `NormalizedCashMovement`.
  - `CashSettlementRepository.ts` (lignes 1-100) gère historiquement les règlements d'encaissement de manière isolée sans matérialiser de projection atomique par tiroir-caisse (`tillId`).

#### 3. Options Envisageables
- **Option A : Solde Scalaire Mutable Unique**
  - *Principe* : Conserver uniquement un champ `cashBalanceCents` dans le document `/tills/{tillId}` et l'incrémenter/décrémenter à chaque transaction.
  - *Avantages* : Implémentation simple, requêtes de solde instantanées.
  - *Inconvénients* : **Zéro auditabilité**. Impossible de reconstituer l'historique en cas d'erreur ou d'incidents réseau. Concurrence ingérable et risque élevé de perte de pièces justificatives. Viol du principe de registre comptable de la Constitution `GEMINI.md`.
- **Option B : Registres d'Événements Fragmentés**
  - *Principe* : Créer `/till_transactions` pour les caisses et `/safe_transactions` pour les coffres.
  - *Avantages* : Séparation stricte des collections par composant.
  - *Inconvénients* : Duplication de code, rupture du moteur BI `CashBasisEngine`, impossibilité de faire des requêtes unifiées de trésorerie consolidée.
- **Option C (RECOMMANDÉE) : Registre Immuable Unifié `/cash_movements` + Projections Matérialisées Atomiques**
  - *Principe* : Tout événement d'espèces (vente, dépense, transfert, change, MoneyGram) écrit un document immuable dans `/cash_movements` (format `NormalizedCashMovement`) et met à jour de façon atomique la projection matérialisée `TillBalanceProjection` / `SafeBalanceProjection` via `db.runTransaction`.
  - *Avantages* : Auditabilité 100% (Event Sourcing), reconstruction déterministe possible par rejeu, réutilisation directe du moteur BI `CashBasisEngine`, intégrité garantie par transactions Firestore.
  - *Inconvénients* : Légère augmentation du nombre d'écritures Firestore lors de la matérialisation de la projection.

#### 4. Recommandation Technique Motivée
**Conserver l'Option C comme SSOT Absolu du Cash.**
Toute transaction d'espèces doit générer un enregistrement append-only immuable dans `/cash_movements`. Le solde consultable est une projection matérialisée garantie par transaction atomique.

#### 5. Matrice d'Impact
- **Code & Types** : Utilisation du type `NormalizedCashMovement` dans `src/domains/cash/types/NormalizedCashMovement.ts`.
- **Repositories** : Remplacement des écritures directes de `CashSettlementRepository` par des appels transactionnels écrivant dans `CashMovementRepository`.
- **Security Rules** : `/cash_movements/{movementId}` : `allow create: if isAuthenticated()`, `allow update, delete: if false` (immuabilité stricte).
- **General Ledger** : Chaque `NormalizedCashMovement` déclenche une écriture en partie double dans `journal_entries` via `AccountingEngine.ts`.

#### 6. Dépendances & Risques
- *Dépendance* : Nécessite l'implémentation de la clé d'idempotence transversale (DR-012).
- *Risque* : Conflits de transaction Firestore en cas de très fort volume simultané sur un même tiroir-caisse (résolu par file d'attente d'écriture ou retry transactionnel).

---

### `DR-002` — Extension du Plan Comptable (CHART_OF_ACCOUNTS)

#### 1. Question d'Architecture
Comment classifier au niveau du General Ledger les mouvements d'espèces de caisses guichets, coffres-forts, comptes de transit, écarts de caisse et gains/pertes de change sans perturber le plan comptable existant ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichier inspecté** : `src/constants/finance.ts`.
- **Preuves de code** :
  - `CHART_OF_ACCOUNTS` (lignes 161-240) contient les comptes généraux :
    - `1000_CASH` : "Caisse générale / Espèces"
    - `1010_BANK` : "Banque Principale"
    - `1200_ACCOUNTS_RECEIVABLE` : "Clients / Créances"
    - `1300_EMPLOYEE_ADVANCES` : "Avances et acomptes personnel"
    - `2000_ACCOUNTS_PAYABLE` : "Fournisseurs / Dettes"
    - `4000_REVENUE_SERVICE` / `5000_COST_SERVICE` / `5900_GENERAL_EXPENSES`
  - *Absence constatée* : Aucun compte spécifique pour la caisse guichet (`1010_TILL`), le coffre-fort (`1015_SAFE`), le transit (`1080_CASH_IN_TRANSIT`), les pertes de change (`6680`), les gains de change (`7680`), ou les écarts de caisse (`6780` / `7780`).

#### 3. Options Envisageables
- **Option A : Imputation Générique sur `1000_CASH`**
  - *Principe* : Utiliser uniquement le compte `1000_CASH` pour toutes les caisses, tous les coffres, tous les transferts et tous les écarts.
  - *Avantages* : Aucune modification du fichier `finance.ts`.
  - *Inconvénients* : **Incapacité totale de dresser une balance de vérification par caisse ou coffre**. Impossibilité d'isoler les fonds en transit ou les pertes sur écarts de caisse lors du bilan comptable.
- **Option B (RECOMMANDÉE) : Extension Contrôlée de `CHART_OF_ACCOUNTS`**
  - *Principe* : Ajouter formellement les sous-comptes canoniques à 4 chiffres dans `src/constants/finance.ts` :
    - `1010_TILL` : "Caisse Guichet / Tiroir-Caisse"
    - `1015_SAFE` : "Coffre-fort Succursale"
    - `1080_CASH_IN_TRANSIT` : "Cash en Transit Inter-Emplacements"
    - `6680_REALIZED_FX_LOSS` : "Perte de Change Réalisée sur Conversions"
    - `7680_REALIZED_FX_GAIN` : "Gain de Change Réalisé sur Conversions"
    - `6780_CASH_DISCREPANCY_LOSS` : "Perte sur Écart de Caisse (Déficit Charge)"
    - `7780_CASH_DISCREPANCY_GAIN` : "Produit sur Écart de Caisse (Excédent)"
  - *Avantages* : Conformité stricte aux normes comptables SYSCOHDA / US GAAP, réconciliation simplifiée, clarté des états financiers.
  - *Inconvénients* : Nécessite une mise à jour des types TypeScript d'identifiants de comptes (`AccountCode`).

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Extension du Plan Comptable).**
L'extension de `src/constants/finance.ts` est rétro-compatible et indispensable pour que le General Ledger reflète la réalité physique des caisses, des coffres et du transit.

#### 5. Matrice d'Impact
- **Code & Types** : Modification de `AccountCode` et `CHART_OF_ACCOUNTS` dans `src/constants/finance.ts`.
- **Services** : `AccountingEngine.ts` adapte le schéma de posting pour mapper chaque type d'opération au compte approprié.
- **Repositories** : `LedgerRepository.ts` enregistre les écritures avec ces nouveaux codes.
- **Security Rules** : Aucun impact direct (géré au niveau applicatif et service).

#### 6. Dépendances & Risques
- *Dépendance* : Doit être appliquée avant tout test d'intégration du journal comptable.
- *Risque* : Risque nul sur l'existant si les comptes existants ne sont pas modifiés.

---

### `DR-003` — Modèle de Rôles et Sous-profils Guichet

#### 1. Question d'Architecture
Comment modéliser la hiérarchie opérationnelle des guichetiers (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`) et des superviseurs sans rompre le système de rôles existant de FINOPS (`Role`) ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichier inspecté** : `src/types.ts` et `src/services/PermissionService.ts`.
- **Preuves de code** :
  - `src/types.ts` (ligne 14) :
    ```typescript
    export type Role = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'AUDITOR';
    ```
  - `PermissionService.ts` (lignes 63-150) valide l'accès par rôle et vérifie les capacités de l'utilisateur.

#### 3. Options Envisageables
- **Option A : Surcharger le Rôle `EMPLOYEE` avec des Attributs Dynamiques**
  - *Principe* : Conserver `Role = 'EMPLOYEE'` pour tous les guichetiers et stocker les limites et sous-rôles dans un sous-document `EmployeeProfile.tillPermissions`.
  - *Avantages* : Ne modifie pas l'union de types `Role` dans `src/types.ts`.
  - *Inconvénients* : Complexifie considérablement les règles de sécurité Firestore (`firestore.rules`), qui devraient lire le profil employé à chaque opération. Complique les contrôles RBAC dans les composants React UI.
- **Option B (RECOMMANDÉE) : Extension Canonique de l'Union de Types `Role`**
  - *Principe* : Étendre formellement `Role` dans `src/types.ts` :
    ```typescript
    export type Role = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'EMPLOYEE' | 'AUDITOR' | 'JUNIOR_TELLER' | 'SENIOR_TELLER' | 'HEAD_TELLER';
    ```
  - *Avantages* : Sécurité renforcée, typage TypeScript strict, lisibilité immédiate dans `PermissionService.ts` et règles Firestore épurées (`request.auth.token.role in ['HEAD_TELLER', 'MANAGER']`).
  - *Inconvénients* : Nécessite la mise à jour des formulaires de sélection de rôles lors de la création d'employés.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Extension du type `Role`).**
L'explicitation des rôles de guichet garantit un contrôle d'accès natif et performant, aussi bien côté serveur (`PermissionService.ts`) que côté base de données (`firestore.rules`).

#### 5. Matrice d'Impact
- **Code & Types** : Modification de `Role` dans `src/types.ts`.
- **Services** : Mise à jour des matrices de capacités dans `PermissionService.ts` pour attribuer les capacités `till.*` et `safe.*` aux nouveaux rôles.
- **Firestore Security Rules** : Utilisation directe de `role == 'JUNIOR_TELLER'`, `role == 'HEAD_TELLER'`, etc.

#### 6. Dépendances & Risques
- *Dépendance* : Alignement avec la gestion des invitations d'utilisateurs (`InvitationRepository.ts`).
- *Risque* : S'assurer que les utilisateurs existants ayant le rôle `EMPLOYEE` conservent leurs accès par défaut.

---

### `DR-004` — Paramétrage des Seuils d'Approbation

#### 1. Question d'Architecture
Comment configurer les plafonds opérationnels (ex: montant maximum de petite dépense sans approbation, plafond de transfert auto-approuvé, tolérance d'écart de clôture) de manière flexible et multi-tenant sans hardcoder aucun montant dans le code ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichier inspecté** : `src/types.ts` (`BusinessSettings`).
- **Preuves de code** :
  - `src/types.ts` définit l'interface `BusinessSettings` pour la configuration entreprise (devise, fiscalité, module payroll).
  - Actuellement, aucun sous-objet structuré ne stocke les seuils spécifiques de trésorerie de caisse (`cashThresholds`).

#### 3. Options Envisageables
- **Option A : Valeurs Constantes Hardcodées**
  - *Principe* : Fixer dans le code des constantes (ex: `MAX_PETTY_EXPENSE = 500 HTG`, `MAX_AUTO_TRANSFER = 5000 HTG`).
  - *Avantages* : Rapide à développer.
  - *Inconvénients* : **Incompatible avec l'architecture multi-tenant**. Une grande entreprise et une petite boutique ont des échelles financières totalement différentes. Viol direct du principe d'adaptabilité du logiciel ERP.
- **Option B (RECOMMANDÉE) : Extension de `BusinessSettings` avec Fallbacks Sécurisés**
  - *Principe* : Ajouter une structure `CashThresholdsSettings` dans `BusinessSettings` (`src/types.ts`) :
    ```typescript
    export interface CashThresholdsSettings {
      maxUnapprovedPettyExpenseCents: number;
      maxUnapprovedTransferCents: number;
      maxAutoApproveVarianceCents: number;
      tillMaxCashLimitCents: number;
      defaultCurrency: string;
    }
    ```
  - *Avantages* : Souplesse multi-tenant intégrale. Chaque entreprise configure ses propres seuils de tolérance dans son panneau de paramétrage.
  - *Inconvénients* : Doit gérer des valeurs par défaut si une entreprise n'a pas encore configuré ces paramètres.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Configuration dans `BusinessSettings`).**
Tous les seuils financiers doivent être lus dynamiquement depuis la configuration du tenant (`businessId`). En cas d'absence de configuration, appliquer des valeurs par défaut conservatrices (Fail-Safe : 0 HTG de tolérance d'écart).

#### 5. Matrice d'Impact
- **Code & Types** : Ajout de `CashThresholdsSettings` dans `src/types.ts`.
- **Services** : `ServerApprovalGateway.ts` interroge les seuils de `BusinessSettings` pour déterminer si une transaction requiert une approbation.
- **UI** : Ajout d'un onglet "Gestion des Caisses & Seuils" dans les paramètres d'entreprise.

#### 6. Dépendances & Risques
- *Dépendance* : Intégration directe avec `ServerApprovalGateway.ts`.
- *Risque* : Risque d'erreur si un montant saisi est en unités de devise au lieu de centimes (toujours utiliser des entiers `Cents` dans le code).

---

### `DR-005` — Frontière du Mouvement MoneyGram

#### 1. Question d'Architecture
Comment modéliser les opérations de transfert d'argent MoneyGram (envois et retraits) au guichet pour distinguer la transaction commerciale du partenaire externe du mouvement physique d'espèces dans le tiroir-caisse ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/types/NormalizedCashMovement.ts`.
- **Preuves de code** :
  - `NormalizedCashMovement.ts` gère actuellement les modules sources `'PAYROLL'`, `'INVOICE'`, `'LEDGER'`, `'CASH_SETTLEMENT'`.
  - Il n'existe pas d'entité métier `MoneyGramTransaction` ni de gestion d'imputation spécifique pour les réseaux de transfert d'argent.

#### 3. Options Envisageables
- **Option A : Traitement Direct comme Simple Entrée/Sortie de Caisse**
  - *Principe* : Traiter un paiement MoneyGram comme une vente cash standard sans enregistrer le numéro de suivi MTCN ni les frais partenaire.
  - *Avantages* : Modèle très simplifié.
  - *Inconvénients* : **Incapacité de réconcilier les comptes avec MoneyGram**. Impossible de distinguer la commission agence, le principal du transfert et les taxes.
- **Option B (RECOMMANDÉE) : Séparation Strict "Opération Métier" vs "Mouvement Physique Cash"**
  - *Principe* :
    1. L'entité `/moneygram_transactions` enregistre l'opération commerciale (MTCN, expéditeur, bénéficiaire, montant, commission, frais, statut).
    2. Elle émet un document `NormalizedCashMovement` (`sourceModule: 'MONEYGRAM'`) qui représente le flux physique net d'espèces dans le tiroir-caisse.
    3. L'écriture comptable GL associe le compte de clearing partenaire (`2100_MONEYGRAM_CLEARING`), le compte de commission (`4000_REVENUE_COMMISSION`) et la caisse (`1010_TILL`).
  - *Avantages* : Traçabilité 100%, rapprochement bancaire/partenaire exact, conformité aux exigences réglementaires de lutte contre le blanchiment d'argent (AML/KYC).
  - *Inconvénients* : Nécessite la création de la collection `/moneygram_transactions`.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Séparation Opération / Mouvement Cash).**
La gestion de MoneyGram doit être traitée comme un module métier autonome émettant des mouvements d'espèces dans le registre unifié `/cash_movements`.

#### 5. Matrice d me d'Impact
- **Code & Types** : Ajout de `'MONEYGRAM'` dans `sourceModule` (`NormalizedCashMovement.ts`). Création des interfaces `MoneyGramTransaction` dans un nouveau fichier de domaine.
- **Repositories** : Création de `MoneyGramRepository.ts`.
- **General Ledger** : Postings automatiques via `AccountingEngine.ts` (Débit Caisse / Crédit Clearing pour encaissement envoi ; Débit Clearing / Crédit Caisse pour décaissement retrait).

#### 6. Dépendances & Risques
- *Dépendance* : Nécessite la gestion multi-devises (DR-006) car les retraits MoneyGram sont souvent effectués en USD.
- *Risque* : Risque de double saisie en cas de soumission répétée du même code MTCN (protégé par clé d'idempotence `IDEM_MG_...`).

---

### `DR-006` — Gestion des Taux d'Achat/Vente (Spreads FX)

#### 1. Question d'Architecture
Comment gérer les taux de change commerciaux à deux voies (`buyRate` et `sellRate`) pour les opérations de change manuel d'espèces au guichet, et capturer les gains/pertes de change réalisés ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichier inspecté** : `src/repositories/CurrencyRateRepository.ts`.
- **Preuves de code** :
  - `CurrencyRateRepository.ts` (lignes 10-60) définit l'interface `ExchangeRate` :
    ```typescript
    export interface ExchangeRate {
      id: string;
      businessId: string;
      fromCurrency: string;
      toCurrency: string;
      rate: number; // Taux unique scalaire
      effectiveDate: string;
      source: string;
      actorId: string;
      justification?: string;
    }
    ```
  - *Absence constatée* : Pas de différenciation entre le taux d'achat d'espèces (`buyRate`), le taux de vente d'espèces (`sellRate`) et le taux comptable officiel (`officialRate`).

#### 3. Options Envisageables
- **Option A : Taux Unique et Marge Appliquée en Pourcentage Fixe**
  - *Principe* : Conserver un seul taux et calculer le taux d'achat/vente en appliquant une marge fixe de $X\%$ lors de la saisie.
  - *Avantages* : Aucune modification de l'interface `ExchangeRate`.
  - *Inconvénients* : Ne reflète pas la réalité du marché des devises où l'écart d'achat et de vente évolue indépendamment du taux moyen.
- **Option B (RECOMMANDÉE) : Extension d'ExchangeRate avec Champs Optionnels `buyRate` / `sellRate` + Taux Figé dans la Transaction**
  - *Principe* :
    1. Étendre `ExchangeRate` avec `buyRate?: number` et `sellRate?: number`.
    2. Lors de l'exécution d'un change de devises (`FX_EXCHANGE`), figer la valeur exacte du taux appliqué dans l'enregistrement immuable `NormalizedCashMovement.appliedRate`.
    3. Calculer immédiatement l'écart de change par rapport au taux comptable et enregistrer le gain/perte réalisé (`6680_REALIZED_FX_LOSS` / `7680_REALIZED_FX_GAIN`).
  - *Avantages* : Rapprochement exact, traçabilité comptable du résultat de change, prévention des litiges clients.
  - *Inconvénients* : Légère extension du schéma du dépôt `CurrencyRateRepository`.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Extension d'ExchangeRate avec Spreads Achat/Vente).**
L'explicitation des taux d'achat/vente garantit un calcul exact du chiffre d'affaires et des gains de change lors des opérations de conversion d'espèces au guichet.

#### 5. Matrice d'Impact
- **Code & Types** : Extension de `ExchangeRate` dans `CurrencyRateRepository.ts` et ajout de `appliedRate` / `fxGainLossCents` dans `NormalizedCashMovement.ts`.
- **Repositories** : `CurrencyRateRepository.ts` permet la recherche du taux d'achat ou de vente actif par date.
- **General Ledger** : Comptabilisation de la marge de change au crédit de `7680_REALIZED_FX_GAIN`.

#### 6. Dépendances & Risques
- *Dépendance* : Lié directement au verrouillage des taux système par défaut (DR-007).
- *Risque* : Inversion accidentelle entre taux d'achat et taux de vente par le guichetier (contrôlé par validation de cohérence `sellRate >= buyRate`).

---

### `DR-007` — Verrouillage du Taux Système par Défaut (135.0 HTG/USD)

#### 1. Question d'Architecture
Doit-on autoriser le système à utiliser silencieusement le taux de change statique par défaut (`135.0 HTG/USD`) lors de transactions financières réelles si aucun taux du jour n'a été saisi ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichier inspecté** : `src/repositories/CurrencyRateRepository.ts`.
- **Preuves de code** :
  - `CurrencyRateRepository.ts` (ligne 12) définit la constante :
    ```typescript
    export const DEFAULT_USD_TO_HTG_EXCHANGE_RATE = 135.0;
    ```
  - Si aucune conversion n'est trouvée pour la date demandée, certaines méthodes renvoient cette valeur statique en fallback.

#### 3. Options Envisageables
- **Option A : Fallback Silencieux Permissif sur 135.0**
  - *Principe* : Si aucun taux du jour n'est disponible, exécuter la transaction en utilisant automatiquement 135.0 HTG/USD.
  - *Avantages* : Bloque jamais l'utilisateur, fluide en apparence.
  - *Inconvénients* : **DANGER FINANCIER CRITIQUE**. Si le taux réel du marché est à 150.0 HTG/USD, chaque conversion effectuée à 135.0 génère une perte sèche irrécupérable de 10% pour l'entreprise.
- **Option B (RECOMMANDÉE) : Blocage Fail-Closed pour les Transactions Réelles + Dérogation Formelle**
  - *Principe* :
    1. Pour toute transaction financière réelle (Vente multi-devises, Change manuel, Retrait MoneyGram), **exiger un taux de change valide pour la date courante (`effectiveDate == today`)**.
    2. Si aucun taux n'est saisi, la transaction est **bloquée** avec le message `"Aucun taux de change actif défini pour la date du jour"`.
    3. Seule une dérogation explicite saisie par un `MANAGER` / `OWNER` peut débloquer la transaction avec un taux forcé justifié et consigné dans les logs d'audit forensic.
    4. La constante `135.0` est strictement réservée à l'affichage indicatif dans des rapports non financiers ou en environnement de développement local.
  - *Avantages* : Protection financière absolue contre les taux obsolètes, conformité aux règles de sécurité FINOPS.
  - *Inconvénients* : Exige que le Manager ou l'administrateur mette à jour le taux de change en début de journée.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Blocage Fail-Closed des Taux Obsolètes).**
Aucune transaction financière réelle d'espèces ne doit utiliser un taux statique par défaut en production.

#### 5. Matrice d'Impact
- **Repositories** : `CurrencyRateRepository.getEffectiveRate()` lève une exception d'absence de taux en mode transactionnel si la date n'est pas couverte.
- **Services** : Le service de change vérifie la présence du taux avant d'autoriser la saisie.
- **Logs Forensic** : Enregistrement de tout override de taux par un Manager.

#### 6. Dépendances & Risques
- *Dépendance* : UI de saisie rapide du taux du jour sur le dashboard Manager.
- *Risque* : Blocage des guichetiers en début de journée si le Manager n'a pas encore validé le taux du jour (résolu par notification de rappel de début de journée).

---

### `DR-008` — Débit Source lors des Transferts Inter-Caisses

#### 1. Question d'Architecture
À quel moment précis du workflow de transfert d'espèces (Caisse vers Coffre, Coffre vers Caisse, Caisse vers Caisse) le solde de l'emplacement émetteur doit-il être débité pour éviter aussi bien le double-emploi que les fonds fantômes ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/` et `src/repositories/CashSettlementRepository.ts`.
- **Preuves de code** :
  - Il n'existe pas actuellement de workflow standardisé de transfert d'espèces avec statut de transit dans la codebase FINOPS.
  - Le P01 proposait initialement de débiter la source dès le statut `PENDING_ACCEPTANCE`.

#### 3. Options Envisageables
- **Option A : Débit Source à l'Initiation (`PENDING_ACCEPTANCE`)**
  - *Principe* : Débiter la caisse émettrice dès la création de la demande de transfert.
  - *Avantages* : Empêche l'émetteur de réutiliser cet argent.
  - *Inconvénients* : En cas de rejet par le destinataire, les fonds doivent faire l'objet d'un récréditement manuel ou d'une annulation complexe.
- **Option B : Débit Source à la Validation Réception par le Destinataire**
  - *Principe* : Ne débiter la source que lorsque le destinataire confirme avoir reçu le cash.
  - *Avantages* : Annulation simple tant que ce n'est pas validé.
  - *Inconvénients* : **RISQUE DE DOUBLE-DÉPENSE PHYSIQUE**. Le guichetier émetteur a donné les billets physiquement, mais son écran indique que l'argent est toujours dans son tiroir-caisse. Il peut donc effectuer une autre dépense avec un solde virtuel faux.
- **Option C (RECOMMANDÉE) : Modèle à 3 Étapes avec Compte de Transit (`IN_TRANSIT`)**
  - *Principe* :
    1. **Départ physique (`IN_TRANSIT`)** : Dès que l'argent quitte physiquement le tiroir-caisse source, la caisse source est **débitée immédiatement** et les fonds sont crédités sur le compte comptable de transit `1080_CASH_IN_TRANSIT`.
    2. **Transfert en cours** : L'argent est sous la responsabilité du porteur/convoyeur. Le destinataire voit un transfert entrant en attente mais son solde disponible n'est **pas encore crédité**.
    3. **Réception physique (`COMPLETED`)** : Le destinataire compte les billets, valide la réception, ce qui dépite le compte `1080_CASH_IN_TRANSIT` et **crédite le solde du destinataire**.
  - *Avantages* : Élimine à 100% le double-emploi chez l'émetteur et le double-comptage chez le destinataire. Conforme aux règles de contrôle interne bancaire.
  - *Inconvénients* : Requiert un état d'acceptation par le destinataire.

#### 4. Recommandation Technique Motivée
**Approuver l'Option C (Modèle avec Statut `IN_TRANSIT` et Compte de Liaison `1080`).**
Ce modèle est le seul qui reflète exactement la réalité physique du déplacement des billets de banque.

#### 5. Matrice d'Impact
- **Code & Types** : Interface `CashTransfer` avec statuts `INITIATED`, `IN_TRANSIT`, `COMPLETED`, `REJECTED`, `CANCELLED`.
- **Repositories** : `CashTransferRepository.ts` gère les transitions d'état de manière transactionnelle.
- **General Ledger** :
  - Étape 1 (`IN_TRANSIT`) : Débit `1080_CASH_IN_TRANSIT` / Crédit `1010_TILL` (Source).
  - Étape 2 (`COMPLETED`) : Débit `1015_SAFE` (Destinataire) / Crédit `1080_CASH_IN_TRANSIT`.

#### 6. Dépendances & Risques
- *Dépendance* : Création du compte comptable `1080_CASH_IN_TRANSIT` (DR-002).
- *Risque* : Transfert bloqué en `IN_TRANSIT` si le destinataire oublie de valider la réception (résolu par alerte automatique et possibilité d'escalade Manager).

---

### `DR-009` — Sortie des Règlements Carte du Mouvement d'Espèces

#### 1. Question d'Architecture
Comment s'assurer que les règlements effectués par carte bancaire (TPE / POS) ou virement ne soient jamais mélangés avec le solde d'espèces physiques (`cashBalance`) du tiroir-caisse ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/adapters/InvoiceCashAdapter.ts` et `src/domains/cash/types/NormalizedCashMovement.ts`.
- **Preuves de code** :
  - Le P01 soulevait une ambiguïté où des transactions `SALE_CARD` étaient incluses par erreur dans le registre de caisse d'espèces.
  - `InvoiceCashAdapter.ts` convertit les factures payées en mouvements de trésorerie.

#### 3. Options Envisageables
- **Option A : Enregistrer Tous les Paiements dans la Caisse Physique avec un Tag `paymentMethod`**
  - *Principe* : Inclure les ventes carte dans le tiroir-caisse et filtrer par `paymentMethod == 'CASH'` lors du bilan.
  - *Avantages* : Collection unique pour toutes les ventes d'un guichet.
  - *Inconvénients* : **CORRUPTION DU BILLETAGE DE CLÔTURE**. Si le système affiche un solde théorique de 50 000 HTG parce qu'il inclut 20 000 HTG de ventes par carte, le guichetier qui compte ses billets physiques en caisse (30 000 HTG) pensera avoir un déficit monstrueux de 20 000 HTG !
- **Option B (RECOMMANDÉE) : Isolation Stricte du Mouvement d'Espèces Physique**
  - *Principe* :
    1. Seules les ventes réglées en espèces physiques (`SALE_CASH`) impactent le solde du tiroir-caisse (`TillBalanceProjection.cashBalanceCents`).
    2. Les ventes par carte (`SALE_CARD`) sont immédiatement acheminées vers le compte de banque ou de clearing monétique (`1010_BANK` / `2000_CARD_CLEARING`).
    3. L'écran de clôture du guichetier distingue clairement "Espèces Physiques en Caisse" et "Encaissements Carte (Bordereau TPE)".
  - *Avantages* : Billetage physique exact à 100%, aucune confusion lors du comptage des billets, réconciliation TPE indépendante.
  - *Inconvénients* : Nécessite un filtre strict dans `InvoiceCashAdapter.ts`.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Exclusion des cartes de la balance d'espèces).**
Une transaction par carte bancaire n'est pas un mouvement d'espèces physiques en caisse et ne doit jamais altérer le solde théorique de billets du tiroir-caisse.

#### 5. Matrice d'Impact
- **Services** : `InvoiceCashAdapter.ts` vérifie `paymentMethod === 'CASH'` avant de générer un mouvement de caisse d'espèces.
- **UI** : L'interface de vente et de clôture sépare les totaux par mode de règlement.
- **General Ledger** : Vente Carte -> Débit `2000_CARD_CLEARING` / Crédit `4000_REVENUE_SERVICE`.

#### 6. Dépendances & Risques
- *Dépendance* : Correcte transmission du champ `paymentMethod` depuis le module de facturation.
- *Risque* : Risque d'erreur de saisie par le guichetier s'il sélectionne "Carte" au lieu de "Cash" (modifiable via correction d'imputation supervisée).

---

### `DR-010` — Optionnalité du Transfert au Coffre à la Clôture

#### 1. Question d'Architecture
L'opération de transfert de fond vers le coffre-fort de succursale (`Till to Safe Sweep`) lors de la clôture journalière d'une session de caisse doit-elle être obligatoire à 100% ou paramétrable ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/types.ts` et `src/repositories/TillRepository.ts`.
- **Preuves de code** :
  - Les spécifications historiques FINAYITI exigeaient un transfert systématique de la totalité du solde vers le coffre lors de la clôture.
  - Dans FINOPS, certaines caisses permanentes (ex: caisse de change ou caisse d'accueil) doivent conserver un fond de roulement initial (`openingFloat`) pour le lendemain matin.

#### 3. Options Envisageables
- **Option A : Transfert Intégral Obligatoire (100% Sweep)**
  - *Principe* : Vider automatiquement toute la caisse vers le coffre à chaque clôture.
  - *Avantages* : Tiroir-caisse toujours vide la nuit (sécurité anti-vol).
  - *Inconvénients* : Oblige à refaire un transfert inverse Coffre -> Caisse chaque matin à 8h00 pour doter le guichetier de son fond de roulement, créant une lourdeur opérationnelle inutile pour les caisses fixes.
- **Option B (RECOMMANDÉE) : Paramétrage Flexible par Caisse / Succursale (`Till.autoSweepMode`)**
  - *Principe* :
    1. Permettre de configurer le comportement de clôture sur chaque caisse (`Till.autoSweepMode`) :
       - `FULL_SWEEP` : Vider 100% du solde vers le coffre.
       - `EXCESS_SWEEP` : Conserver le fond de roulement de base (`defaultFloatCents`) dans la caisse et transférer uniquement l'excédent vers le coffre.
       - `MANUAL_SWEEP` : Laisser le guichetier/superviseur décider du montant à transférer lors de l'assistant de clôture.
  - *Avantages* : Adaptation parfaite à l'organisation opérationnelle de chaque succursale.
  - *Inconvénients* : Légère complexification de l'assistant UI de clôture de caisse.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Paramétrage flexible du Sweep de clôture).**
La conservation du fond de roulement initial évite des manipulations de cash inutiles en début de journée tout en garantissant la sécurité des excédents.

#### 5. Matrice d'Impact
- **Code & Types** : Ajout des champs `defaultFloatCents` et `autoSweepMode` dans l'interface `Till` (`src/types.ts`).
- **Services** : Le wizard de clôture calcule le montant du transfert recommandé en fonction de la politique de la caisse.
- **Repositories** : `TillRepository.ts` sauvegarde les préférences de la caisse.

#### 6. Dépendances & Risques
- *Dépendance* : Nécessite la validation du billetage physique (DR-011).
- *Risque* : Dépassement du plafond de caisse autorisé pendant la nuit si le sweep n'est pas exécuté (contrôlé par alerte de plafond `tillMaxCashLimitCents`).

---

### `DR-011` — Approbation Obligatoire des Écarts de Caisse

#### 1. Question d'Architecture
Comment traiter un écart de caisse (différence entre le comptage physique des billets et le solde théorique calculé par le système) lors de la clôture pour éviter la dissimulation de fraudes tout en permettant le fonctionnement fluide des erreurs minimes ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/services/ServerApprovalGateway.ts` et `src/services/PermissionService.ts`.
- **Preuves de code** :
  - `ServerApprovalGateway.ts` gère le moteur d'approbation centralisé pour les opérations soumises à double validation (Maker-Checker).
  - Actuellement, les clôtures de caisse avec écart ne sont pas formellement branchées sur ce gateway.

#### 3. Options Envisageables
- **Option A : Clôture Directe sans Blocage avec Enregistrement Silencieux de l'Écart**
  - *Principe* : Clôturer immédiatement la session quel que soit l'écart et passer la différence en compte de charge/produit.
  - *Avantages* : Ne bloque jamais le guichetier en fin de journée.
  - *Inconvénients* : **RISQUE DE FRAUDE ET VOL MASSIF**. Un guichetier malveillant pourrait déclarer un manquant de 100 000 HTG et fermer sa session sans aucune validation d'un supérieur.
- **Option B (RECOMMANDÉE) : Workflow d'Approbation Conditionnel sur Seuil (`ServerApprovalGateway`)**
  - *Principe* :
    1. Si $\text{Écart Absolu} \le \text{maxAutoApproveVarianceCents}$ (ex: 0 HTG ou tolérance centimes) : La clôture est **auto-approuvée** et verrouillée.
    2. Si $\text{Écart Absolu} > \text{maxAutoApproveVarianceCents}$ : La session passe à l'état **`PENDING_APPROVAL`**. La session est gelée (impossible de rouvrir pour des ventes). Une demande d'approbation Maker-Checker est envoyée au `MANAGER` / `OWNER` via `ServerApprovalGateway`.
    3. Après inspection et justification, le Manager valide (ce qui passe la session à `CLOSED` et génère l'écriture comptable d'écart) ou rejette (ce qui exige un nouveau comptage des billets).
  - *Avantages* : Sécurité financière totale, respect du principe Maker-Checker, traçabilité des justifications d'écart.
  - *Inconvénients* : Requiert la présence ou la validation à distance d'un Manager en cas d'écart significatif.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Approbation obligatoire des écarts sur seuil).**
Aucun écart de caisse supérieur au seuil de tolérance de l'entreprise ne doit être clôturé sans la décision explicite et traçable d'un responsable.

#### 5. Matrice d'Impact
- **Services** : Intégration de la clôture de caisse dans `ServerApprovalGateway.ts`.
- **General Ledger** :
  - Écart Négatif (Déficit) : Débit `1300_EMPLOYEE_ADVANCES` (si charge employé) ou `6780_CASH_DISCREPANCY_LOSS` / Crédit `1010_TILL`.
  - Écart Positif (Excédent) : Débit `1010_TILL` / Crédit `7780_CASH_DISCREPANCY_GAIN`.
- **Security Rules** : Protection de la mise à jour de `TillSession.status` qui exige la capacité `closure.approve_discrepancy` pour débloquer un statut `PENDING_APPROVAL`.

#### 6. Dépendances & Risques
- *Dépendance* : Configuration du seuil `maxAutoApproveVarianceCents` (DR-004).
- *Risque* : Bloquer le guichetier si aucun Manager n'est disponible le soir (résolu par possibilité d'approbation asynchrone sur mobile/dashboard).

---

### `DR-012` — Réutilisation du Contrat `NormalizedCashMovement`

#### 1. Question d'Architecture
Doit-on créer un nouveau contrat d'entité spécifique aux opérations de caisse (ex: `CashDrawerEntry`) ou réutiliser strictement le contrat canonique existant `NormalizedCashMovement` dans `/cash_movements` ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/types/NormalizedCashMovement.ts` et `src/domains/cash/engine/CashBasisEngine.ts`.
- **Preuves de code** :
  - `NormalizedCashMovement.ts` est déjà le contrat unifié utilisé par le moteur BI `CashBasisEngine`.
  - Le rapport P01 avait identifié le risque de recréer un deuxième système de cash concurrent ("Deux systèmes de cash").

#### 3. Options Envisageables
- **Option A : Créer une Nouvelle Collection Dédiée `/cash_drawer_transactions`**
  - *Principe* : Construire une structure de données entièrement nouvelle pour les caisses.
  - *Avantages* : Indépendance apparente du nouveau code.
  - *Inconvénients* : **VIOL DIRECT DE LA CONSTITUTION GEMINI.MD (Règle 3.1 & 3.2)**. Duplication de code, rupture de la source unique de vérité, obligation de réécrire tous les pipelines BI et de réconciliation pour lire deux collections différentes.
- **Option B (RECOMMANDÉE) : Réutilisation Stricte et Extension Non-Breakable de `NormalizedCashMovement`**
  - *Principe* :
    1. Conserver la collection `/cash_movements` comme l'unique registre de mouvements physiques de trésorerie.
    2. Étendre `NormalizedCashMovement` avec des champs optionnels d'ancrage d'emplacement :
       ```typescript
       tillId?: string;
       safeId?: string;
       tillSessionId?: string;
       bankAccountId?: string;
       ```
    3. Toutes les opérations (ventes cash, petite dépense, virement coffre, change, MoneyGram) sont inscrites sous forme de documents `NormalizedCashMovement`.
  - *Avantages* : Zéro duplication, compatibilité immédiate avec `CashBasisEngine`, vue 360° de la trésorerie d'entreprise sans double calcul.
  - *Inconvénients* : Nécessite de s'assurer que tous les adapteurs respectent ce contrat.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Réutilisation stricte de `NormalizedCashMovement`).**
Il n'existe et il n'existera **qu'un seul registre de trésorerie** dans FINOPS ERP : `NormalizedCashMovement` sous la collection `/cash_movements`.

#### 5. Matrice d'Impact
- **Code & Types** : Ajout des identifiants d'emplacement optionnels dans `src/domains/cash/types/NormalizedCashMovement.ts`.
- **Services** : Le moteur `CashBasisEngine.ts` continue de fonctionner sans aucune modification de sa logique d'agrégation.
- **Firestore Security Rules** : Règles unifiées sur `/cash_movements/{movementId}`.

#### 6. Dépendances & Risques
- *Dépendance* : Script de migration des anciens `cash_settlements` historiques.
- *Risque* : Risque nul sur le moteur BI grâce à la rétro-compatibilité des champs ajoutés.

---

### `DR-013` — Inscription des Capacités de Caisse dans `PermissionService.ts`

#### 1. Question d'Architecture
Comment inscrire les capacités granulaires de caisse (`till.*`, `safe.*`, `transfer.*`, `closure.*`, `fx.*`) dans le registre canonique `TENANT_ERP_CAPABILITIES` de `PermissionService.ts` pour respecter le principe d'échec de sécurité par défaut (Fail-Closed) ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichier inspecté** : `src/services/PermissionService.ts`.
- **Preuves de code** :
  - `PermissionService.ts` (lignes 63-150) définit le Set `TENANT_ERP_CAPABILITIES` qui contient l'allowlist explicite des capacités autorisées sur le tenant ERP.
  - Tout appel à `hasCapability(user, capability)` avec une capacité non présente dans ce Set renvoie **`DENY` (Faux)** pour tous les rôles non-SUPER_ADMIN.
  - *Absence constatée* : Les capacités précises de caisse (`till.open_close`, `till.execute_sale`, `till.petty_expense`, `safe.view_balance`, `safe.deposit_withdraw`, `transfer.approve_till_feed`, `transfer.inter_branch`, `closure.approve_discrepancy`, `fx.manage_rates`) sont actuellement absentes de ce Set.

#### 3. Options Envisageables
- **Option A : Utiliser des Capacités Génériques Existantes (`accounting.write`)**
  - *Principe* : Ne pas ajouter de nouvelles capacités et réutiliser la capacité comptable générale.
  - *Avantages* : Pas de modification de `PermissionService.ts`.
  - *Inconvénients* : **IMPOSSIBLE DE SÉPARER LES PRIVILÈGES**. Un guichetier qui doit juste encaisser des ventes aurait aussi le droit de passer des écritures comptables d'ajustement ou de consulter le grand livre. Viol grave du principe de moindre privilège.
- **Option B (RECOMMANDÉE) : Extension Canonique de `TENANT_ERP_CAPABILITIES`**
  - *Principe* : Inscrire formellement la liste des 9 capacités granulaires de trésorerie dans `TENANT_ERP_CAPABILITIES` (`PermissionService.ts`) :
    ```typescript
    // Cash & Till Operations
    "till.open_close",
    "till.execute_sale",
    "till.petty_expense",
    "safe.view_balance",
    "safe.deposit_withdraw",
    "transfer.approve_till_feed",
    "transfer.inter_branch",
    "closure.approve_discrepancy",
    "fx.manage_rates"
    ```
  - *Avantages* : Sécurité Fail-Closed garantie, contrôle granulaire fin par rôle et par sous-profil employé.
  - *Inconvénients* : Aucun.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Inscription des 9 capacités dans `PermissionService.ts`).**
C'est une condition préalable absolue pour que les contrôles d'accès de caisse fonctionnent sans faille de sécurité.

#### 5. Matrice d'Impact
- **Services** : Ajout des chaînes de caractères dans `TENANT_ERP_CAPABILITIES` de `PermissionService.ts`.
- **UI** : Les composants React (boutons d'ouverture de caisse, de transfert, d'approbation) utilisent `hasCapability(...)` pour afficher/masquer les actions.
- **Security Rules** : Cohérence avec les tokens d'autorisation et les revendications d'accès.

#### 6. Dépendances & Risques
- *Dépendance* : Définition des rôles guichet (DR-003).
- *Risque* : Oublier d'attribuer une capacité aux rôles `MANAGER` / `OWNER` dans les matrices de permission (résolu par revue de la matrice de rôles).

---

### `DR-014` — Traitement des Dépenses de Petite Caisse (Petty Expense)

#### 1. Question d'Architecture
Comment documenter, valider et comptabiliser les décaissements de petite caisse (`PETTY_EXPENSE`) effectués directement depuis un tiroir-caisse ou un coffre-fort pour couvrir une charge opérationnelle immédiate ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/types/NormalizedCashMovement.ts` et `src/services/AccountingEngine.ts`.
- **Preuves de code** :
  - `NormalizedCashMovement.ts` supporte le type de mouvement `movementType: 'EXPENSE'`.
  - Il n'existe pas d'entité ni de formulaire de bon de dépense justificatif (`PettyExpenseVoucher`) liant le reçu, la catégorie de charge et l'approbation.

#### 3. Options Envisageables
- **Option A : Sortie d'Espèces Directe Sans Justificatif Structuré**
  - *Principe* : Permettre au guichetier de sortir du cash en saisissant juste un montant et un libellé texte libre.
  - *Avantages* : Très rapide sur le moment.
  - *Inconvénients* : **NON-CONFORMITÉ FISCALE ET ANOMALIE DE COMPTABILITÉ**. Incapacité d'imputer la dépense sur le bon compte de charge (`Class 5 / 6`), absence de pièce justificative numérisée, risque de coulage de caisse.
- **Option B (RECOMMANDÉE) : Workflow de Bon de Petite Caisse (`PettyExpenseVoucher`)**
  - *Principe* :
    1. Toute dépense de petite caisse exige la création d'un bon de dépense (`/petty_expense_vouchers`) contenant : numéro unique, catégorie de charge, bénéficiaire, motif, montant, photo/scan du reçu.
    2. Si le montant dépasse le seuil `maxUnapprovedPettyExpenseCents` (DR-004), le bon requiert l'approbation préalable du `HEAD_TELLER` ou `MANAGER`.
    3. Une fois validé, le bon déclenche le décaissement physique dans `/cash_movements` (`OUTFLOW`, `EXPENSE`) et l'écriture comptable en partie double (Débit `5900_GENERAL_EXPENSES` ou compte spécifique / Crédit `1010_TILL`).
  - *Avantages* : Rapprochement comptable automatique, pièce justificative liée, auditabilité fiscale 100%.
  - *Inconvénients* : Exige la saisie des informations du bon par le guichetier.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Workflow avec `PettyExpenseVoucher`).**
Tout décaissement de petite caisse doit être adossé à un justificatif structuré et imputé sur un compte de charge valide du plan comptable.

#### 5. Matrice d'Impact
- **Code & Types** : Création de l'interface `PettyExpenseVoucher` dans les types de domaine cash.
- **Repositories** : Création de `PettyExpenseRepository.ts`.
- **General Ledger** : Generates GL Entry via `AccountingEngine.ts` (Débit Compte de charge / Crédit Compte de caisse).

#### 6. Dépendances & Risques
- *Dépendance* : Seuils d'approbation (DR-004) et extension du plan comptable (DR-002).
- *Risque* : Guichetier effectuant la dépense avant de saisir le bon (résolu par saisie rapide mobile avec photo du reçu).

---

### `DR-015` — Stratégie de Reconstruction Atomique des Soldes

#### 1. Question d'Architecture
Comment reconstruire ou réconcilier de manière déterministe et atomique une projection de solde matérialisée (`TillBalanceProjection` / `SafeBalanceProjection`) en cas de corruption ou de doute sans interrompre les ventes actives sur cette même caisse ?

#### 2. État Actuel dans la Codebase FINOPS
- **Fichiers inspectés** : `src/domains/cash/engine/CrossSourceCashReconciliationEngine.ts` et `src/domains/cash/engine/FinancialReconciliationEngine.ts`.
- **Preuves de code** :
  - `CrossSourceCashReconciliationEngine.ts` (lignes 1-120) permet déjà de comparer les soldes du General Ledger avec les agrégations de mouvements.
  - Il n'existe pas de verrou atomique de reconstruction sur les projections de solde de tiroir-caisse en cours d'utilisation.

#### 3. Options Envisageables
- **Option A : Reconstruction en Direct par Écrasement Non-Transactionnel**
  - *Principe* : Sommer les mouvements historiques de la caisse et réécrire le champ `cashBalanceCents` directement.
  - *Avantages* : Script de maintenance très simple.
  - *Inconvénients* : **RISQUE MAJEUR DE RACES CONDITIONS**. Si une vente en cash survient exactement au moment où le script de reconstruction calcule son total, la vente risque d'être écrasée ou comptée en double.
- **Option B (RECOMMANDÉE) : Reconstruction Atomique avec Verrou de Réconciliation (`isReconciling`) + Transaction Firestore**
  - *Principe* :
    1. Executer la reconstruction à l'intérieur d'une transaction Firestore atomique (`db.runTransaction`).
    2. Poser un drapeau temporaire `isReconciling: true` sur la projection `TillBalanceProjection`.
    3. Re-calculer la somme exacte de tous les documents immuables `/cash_movements` associés à ce `tillId` jusqu'à l'horodatage $T$.
    4. Mettre à jour le solde recalculé `cashBalanceCents`, mettre à jour l'empreinte de réconciliation (`lastReconciledAt`, `reconciledHash`), et libérer le drapeau `isReconciling: false`.
    5. Si une nouvelle vente tente de s'inscrire pendant la fraction de seconde de reconstruction, la transaction Firestore la réordonne automatiquement via retry optimiste.
  - *Avantages* : Intégrité mathématique garantie, aucune perte de vente active, traçabilité des opérations de maintenance.
  - *Inconvénients* : Légère attente (quelques millisecondes) pour les ventes en cours pendant le verrou.

#### 4. Recommandation Technique Motivée
**Approuver l'Option B (Reconstruction atomique transactionnelle).**
La reconstruction des projections doit être une opération d'ingénierie sûre, déterministe et isolée de toute interférence concurrentielle.

#### 5. Matrice d'Impact
- **Engine** : Extension de `CrossSourceCashReconciliationEngine.ts` pour inclure la méthode `rebuildTillProjection(tillId)`.
- **Repositories** : `TillRepository.ts` exécute la mise à jour de projection dans une transaction atomique.
- **Audit & Forensic** : Chaque reconstruction génère un log forensic d'audit système (`forensic_logs`).

#### 6. Dépendances & Risques
- *Dépendance* : Immuabilité absolue de la collection `/cash_movements` (DR-001 & DR-012).
- *Risque* : Temps de calcul si la caisse possède des dizaines de milliers de mouvements (résolu par l'utilisation de snapshots périodiques d'ancrage).

---

## 3. Matrice Synthétique des 15 Décisions d'Architecture

| Réf. ADR | Domaine | Proposition / Choix Retenu | Fichier Source Prédicat | Impact Codebase | Statut Recommandé |
|---|---|---|---|---|---|
| **DR-001** | SSOT Cash | Registre immuable `/cash_movements` + Projections atomiques | `NormalizedCashMovement.ts` | Majeur (Contrat unifié) | **APPROUVÉ** |
| **DR-002** | Plan Comptable | Extension contrôlée à sous-comptes 4 chiffres (`1010`, `1015`, `1080`, `6680`, `7680`, `6780`, `7780`) | `src/constants/finance.ts` | Moyen (COA Update) | **APPROUVÉ** |
| **DR-003** | Rôles & RBAC | Extension du type `Role` (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`) | `src/types.ts` | Moyen (Type `Role`) | **APPROUVÉ** |
| **DR-004** | Paramétrage | Structure `CashThresholdsSettings` dans `BusinessSettings` | `src/types.ts` | Faible (Config Tenant) | **APPROUVÉ** |
| **DR-005** | MoneyGram | Entité métier `/moneygram_transactions` émettant un `NormalizedCashMovement` | `NormalizedCashMovement.ts` | Moyen (New Module) | **APPROUVÉ** |
| **DR-006** | Multi-Devises | Extension `ExchangeRate` avec `buyRate` / `sellRate` + Taux appliqué immuable | `CurrencyRateRepository.ts` | Faible (FX Spreads) | **APPROUVÉ** |
| **DR-007** | Taux Système | Blocage Fail-Closed des transactions réelles si aucun taux du jour actif | `CurrencyRateRepository.ts` | Moyen (FX Safety) | **APPROUVÉ** |
| **DR-008** | Transferts | Modèle 3 étapes : Débit immédiat -> Compte Transit `1080` (`IN_TRANSIT`) -> Crédit Destinataire | `CashSettlementRepository.ts` | Majeur (Transfer Flow) | **APPROUVÉ** |
| **DR-009** | Ventes Carte | Exclusion des ventes carte (`SALE_CARD`) de la balance d'espèces physiques du tiroir | `InvoiceCashAdapter.ts` | Faible (Adapter Filter) | **APPROUVÉ** |
| **DR-010** | Clôture Sweep | Sweep optionnel paramétrable (`Till.autoSweepMode`) avec conservation fond de roulement | `TillRepository.ts` | Faible (Till Config) | **APPROUVÉ** |
| **DR-011** | Écarts Caisse | Workflow Maker-Checker obligatoire (`ServerApprovalGateway`) pour tout écart > seuil | `ServerApprovalGateway.ts` | Majeur (Approval Flow) | **APPROUVÉ** |
| **DR-012** | Contrat Cash | Réutilisation stricte du contrat `NormalizedCashMovement` sans 2e système | `NormalizedCashMovement.ts` | Majeur (SSOT Alignment) | **APPROUVÉ** |
| **DR-013** | Capacités ERP | Inscription des 9 capacités granulaires `till.*` / `safe.*` dans `TENANT_ERP_CAPABILITIES` | `PermissionService.ts` | Faible (Capabilities Set) | **APPROUVÉ** |
| **DR-014** | Petite Caisse | Bon de dépense obligatoire (`PettyExpenseVoucher`) adossé à une pièce justificative | `AccountingEngine.ts` | Moyen (Voucher Flow) | **APPROUVÉ** |
| **DR-015** | Reconstruction | Reconstruction atomique de projection via transaction `db.runTransaction` et verrou | `CrossSourceCashReconciliationEngine.ts` | Faible (Rebuild Safety) | **APPROUVÉ** |

---

## 4. Directive de Non-Mutation & Conformité Strict Read-Only

Conformément aux instructions impératives de la tâche d'audit :
1. **0 ligne de code de production** n'a été modifiée ou supprimée.
2. **0 règle Firestore Security Rules** n'a été altérée pendant cet examen.
3. **0 collection Firestore** n'a été créée, migrée ou modifiée.
4. Le présent document constitue l'unique livrable officiel d'analyse des décisions d'architecture.

---

## 5. Verdict & Prochaines Étapes Impératives

L'examen contradictoire des 15 Décisions d'Architecture est achevé avec un **verdict de recommandation unanime d'approbation**.

```text
===============================================================================
               VERDICT DU REGISTRE DE DÉCISIONS D'ARCHITECTURE
===============================================================================

      [ ADR STATUS : DR-001 À DR-015 VALIDÉS TECHNIQUEMENT & PRÊTS ]

  Les 15 décisions d'architecture (DR-001 à DR-015) ont été intégralement
  analysées, confrontées à la codebase FINOPS ERP et spécifiées sans
  compromettre l'intégrité du système existant.

  L'implémentation du code de production peut désormais être planifiée de
  manière incrémentale dès la validation formelle de ces fiches par le Board.
===============================================================================
```

### Prochaines étapes :
1. **Soumission au Board Produit** : Validation formelle du document `docs/audits/FINOPS_FINAYITI_ARCHITECTURE_DECISIONS_P02_1.md`.
2. **Plan d'Implémentation Incrémental (Phase par Phase)** : Une fois les validations formelles actées, élaborer le plan d'implémentation par étapes courtes (Phase 1 : COA & Capacités, Phase 2 : Enregistrement Cash SSOT, Phase 3 : Transferts & Approbations, Phase 4 : Multi-devises & Change, Phase 5 : Clôture & Billetage).
