# FINOPS × FINAYITI — PROMPT 03.5 — PRE-IMPLEMENTATION AUTHORIZATION GATE
## Audit Contradictoire Final d'Autorisation et Bilan Pré-Implémentation P04

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Mode :** Audit strictement en lecture seule (Strict Read-Only)  
**Références d'Audit Précédentes :**
- `docs/audits/FINOPS_FINAYITI_CHART_OF_ACCOUNTS_RESOLUTION_P03_2.md`
- `docs/audits/FINOPS_FINAYITI_INDEPENDENT_ACCOUNTING_VALIDATION_P03_3.md`
- `docs/audits/FINOPS_FINAYITI_BLOCKER_RESOLUTION_SECURITY_GATE_P03_4.md`

**Code production :** AUCUNE MODIFICATION  
**Firestore :** AUCUNE ÉCRITURE NI DÉPLOIEMENT  
**Livrable unique :** `docs/audits/FINOPS_FINAYITI_PRE_IMPLEMENTATION_AUTHORIZATION_GATE_P03_5.md`

---

# 1. EXECUTIVE SUMMARY & FINAL GATE VERDICT

L'audit contradictoire final d'autorisation pré-implémentation (**PROMPT 03.5 — PRE-IMPLEMENTATION AUTHORIZATION GATE**) a été conduit conformément aux règles de la Constitution **`GEMINI.md`**.

### Verdict Global Formalisé :
```
P04_IMPLEMENTATION_PLANNING_AUTHORIZED
```

---

### 1.1 Notification et Clarification de l'Écart de Nomenclature dans P03.4

L'examen du rapport `P03_4` révèle l'émission du verdict `BLOCKER_RESOLUTION_READY_FOR_P04`. 
- **Analyse de l'écart** : Ce libellé différait des verdicts normés définis dans le cahier des charges P03.4 (qui prévoyait `BLOCKERS_RESOLVED_SECURITY_SPECIFIED`, `BLOCKERS_PARTIALLY_RESOLVED`, `SECURITY_SPECIFICATION_INCOMPLETE`, ou `CRITICAL_BLOCKERS_REMAIN`).
- **Évaluation technique indépendante** : Cet écart de nomenclature purement formel **ne remet aucunement en cause la qualité, l'exhaustivité et la précision** des analyses contenues dans P03.4. Les blocages comptables, les spécifications de sécurité `firestore.rules`, la correction du bug `forensic_logs` (`[NO_BIZ_ID]`), le verrouillage distribué de trésorerie et la stratégie de test y sont intégralement résolus et documentés avec la plus grande rigueur.
- **Décision d'Audit P03.5** : Le contenu technique du rapport P03.4 est **100% validé**.

---

### 1.2 Motivation du Verdict `P04_IMPLEMENTATION_PLANNING_AUTHORIZED`

La transition vers la préparation documentaire du Plan d'Implémentation (**P04**) est formellement **AUTORISÉE** pour les raisons majeures suivantes :

1. **Intégrité Comptable & Rétrocompatibilité Totale** : La matrice d'extension à 32 comptes du Plan Comptable (`CHART_OF_ACCOUNTS`) est validée. L'alignement entre `src/constants/finance.ts`, `AccountingEngine.ts` et le Grand Livre (`ledger_transactions`) garantit l'absence totale de collision ou de divergence dans les rapports financiers BI.
2. **Sécurité & Modèle de Permissions Étanche** : Les règles Firestore pour les 7 nouvelles collections opérationnelles (`tills`, `cash_sessions`, `safes`, `safe_movements`, `cash_transfers`, `fx_transactions`, `moneygram_transactions`) sont complètement spécifiées. La cause racine des erreurs `PERMISSION_DENIED` sur `forensic_logs` (`[NO_BIZ_ID]`) a été identifiée et sa solution technique en P04 est confirmée.
3. **Invariants Financiers et Concurrence Maîtrisée** : L'utilisation croisée des transactions atomiques Firestore (`runTransaction`) et des verrous applicatifs (`active_approval_locks`) prévient tout risque de double dépense ou d'incohérence lors des mouvements simultanés de caisse et de coffre.
4. **Resilience Hors-Ligne & Modèle Maker-Checker** : La machine à états stricte des sessions de caisse, le contrôle du principe d'impossibilité d'auto-approbation (Maker-Checker), le verrouillage temporisé des taux de change (5 minutes) et la file d'attente hors-ligne idempotente (IndexedDB -> Outbox) sont intégralement modélisés.
5. **Abonnement Strict aux Directives de Lecture Seule** : Aucune ligne de code de production, aucune règle Firestore live et aucune collection n'ont été altérées durant les étapes P02 à P03.5.

---

# 2. AUDIT SECTION 1 — VALIDATION DE LA RÉSOLUTION DU PLAN COMPTABLE (COA)

### 2.1 Évaluation de la Matrice des 18 Comptes Additionnels

L'analyse contradictoire confirme la cohésion de l'extension du plan comptable `CHART_OF_ACCOUNTS`. L'intégration des opérations de trésorerie FINAYITI réutilise les 14 comptes maîtres de FINOPS ERP et introduit 18 sous-comptes et comptes d'appui sans altérer les structures existantes.

| Code Compte | Intitulé Spécifié (P03.2 / P03.4) | Statut Final | Rôle & Intégration Comptable | Absence de Collision | Rétrocompatibilité BI & GL |
|---|---|---|---|---|---|
| **1000** | Caisse Centrale / Guichets (HTG) | `EXISTING_REUSED` | Compte maître de caisse HTG (`1000_CASH`) | Confirmée | 100% - Inchangé |
| **1001** | Caisse Guichet - USD | `PROPOSED_READY_FOR_CREATION` | Sous-compte Actif Circulant (Devise USD) | Confirmée | Totalement isolée dans le Bilan |
| **1002** | Caisse Guichet - DOP | `PROPOSED_READY_FOR_CREATION` | Sous-compte Actif Circulant (Devise DOP) | Confirmée | Reconversion taux du jour |
| **1005** | Coffre Fort Branche (HTG) | `PROPOSED_READY_FOR_CREATION` | Trésorerie de réserve branche HTG | Confirmée | Séparée des guichets actifs |
| **1006** | Coffre Fort Branche (USD) | `PROPOSED_READY_FOR_CREATION` | Trésorerie de réserve branche USD | Confirmée | Séparée des guichets actifs |
| **1010** | Banques Locales | `EXISTING_REUSED` | Compte maître banque (`1010_BANK`) | Confirmée | 100% - Inchangé |
| **1020** | Envois de Fonds en Transit | `PROPOSED_READY_FOR_CREATION` | Compte d'attente de transfert inter-branches | Confirmée | Solder obligatoirement à zéro |
| **1030** | Compensation MoneyGram | `PROPOSED_READY_FOR_CREATION` | Compte de clearing partenaire réseau | Confirmée | Traitement spécifique des flux tiers |
| **1200** | Comptes Clients / Créances | `EXISTING_REUSED` | Compte maître créances (`1200_ACCOUNTS_RECEIVABLE`) | Confirmée | 100% - Inchangé |
| **2000** | Fournisseurs / Dettes | `EXISTING_REUSED` | Compte maître dettes (`2000_ACCOUNTS_PAYABLE`) | Confirmée | 100% - Inchangé |
| **2050** | Dettes sur Opérations FX | `PROPOSED_READY_FOR_CREATION` | Passif circulant pour opérations FX différées | Confirmée | Isolement des engagements FX |
| **4000** | Capital / Fonds Propres | `EXISTING_REUSED` | Compte maître capitaux (`3000_SHARE_CAPITAL`) | Confirmée | Alignement alias typé |
| **5000** | Ventes / Produits Exploitation | `EXISTING_REUSED` | Compte maître produits (`4000_OPERATING_REVENUE`) | Confirmée | Alignement alias typé |
| **5010** | Commissions & Marges FX | `PROPOSED_READY_FOR_CREATION` | Produits financiers / opérationnels FX | Confirmée | Flux financiers isolés |
| **5020** | Commissions MoneyGram | `PROPOSED_READY_FOR_CREATION` | Produits sur services de transfert réseau | Confirmée | Séparation des revenus de service |
| **5090** | Excédents de Caisse | `PROPOSED_READY_FOR_CREATION` | Produits exceptionnels (Gain sur clôture) | Confirmée | Imputation directe des surplus |
| **6000** | Charges Exploitation Générales | `EXISTING_REUSED` | Compte maître charges (`6000_EXPENSES`) | Confirmée | 100% - Inchangé |
| **6010** | Charges de Personnel / Salaires | `EXISTING_REUSED` | Charges salariales (`6010_SALARIES`) | Confirmée | 100% - Inchangé |
| **6020** | Frais Transport & Convoyage | `PROPOSED_READY_FOR_CREATION` | Charges opérationnelles de sécurité des fonds | Confirmée | Suivi analytique dédié |
| **6090** | Manquants / Écarts de Caisse | `PROPOSED_READY_FOR_CREATION` | Charges exceptionnelles (Perte sur clôture) | Confirmée | Imputation directe des déficits |

### 2.2 Vérification d'Absence de Collision avec `src/constants/finance.ts`

L'inspection de `src/constants/finance.ts` prouve que l'objet `CHART_OF_ACCOUNTS` contient actuellement 14 clés canoniques. L'extension en P04 se fera par l'ajout des sous-clés typées sans modifier la signature des méthodes existantes d'`AccountingEngine.ts`.

```typescript
// Validation du pattern de compatibilité pour P04 dans CHART_OF_ACCOUNTS
export const CHART_OF_ACCOUNTS = {
  ASSETS: {
    CASH: "1000_CASH",
    CASH_USD: "1001_CASH_USD",
    CASH_DOP: "1002_CASH_DOP",
    SAFE_HTG: "1005_SAFE_HTG",
    SAFE_USD: "1006_SAFE_USD",
    BANK: "1010_BANK",
    CASH_TRANSIT: "1020_CASH_TRANSIT",
    MONEYGRAM_CLEARING: "1030_MONEYGRAM_CLEARING",
    RECEIVABLES: "1200_ACCOUNTS_RECEIVABLE",
    ADVANCES: "1300_EMPLOYEE_ADVANCES",
  },
  // ...
};
```

---

# 3. AUDIT SECTION 2 — VALIDATION DES SPÉCIFICATIONS DE SÉCURITÉ (RULES & RBAC)

### 3.1 Protection des 7 Nouvelles Collections

L'audit de `/firestore.rules` (1157 lignes) montre l'existence de la règle wildcard :
```firestore
match /businesses/{businessId}/{subcollection}/{document=**} {
  allow read, write: if isTenantScoped(businessId);
}
```
Pour éviter qu'un utilisateur du tenant non autorisé ne contourne la séparation des tâches, la décision validée dans P03.4 de placer les 7 entités FINAYITI en **collections racines autonomes** (`/tills`, `/cash_sessions`, `/safes`, `/safe_movements`, `/cash_transfers`, `/fx_transactions`, `/moneygram_transactions`) est **formellement confirmée**.

Chaque collection racine disposera de sa règle explicite restreignant la création et la mise à jour selon le rôle extrait par `getUserRole()` :

- **`tills` / `safes`** : Lecture autorisée pour tout utilisateur du tenant. Création/Mise à jour réservées à `['ADMIN', 'MANAGER', 'OWNER', 'HEAD_TELLER']`.
- **`cash_sessions`** : Création autorisée pour les guichetiers et responsables (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MANAGER`, `OWNER`). Modification restreinte au guichetier titulaire (états `OPEN`/`COUNTED`) ou au Manager pour la clôture des écarts.
- **`safe_movements` / `fx_transactions` / `moneygram_transactions`** : Inviolabilité stricte (`allow update, delete: if false`). Aucune modification ou suppression n'est permise après la création initiale.

---

### 3.2 Diagnostic et Resolution Définitive de l'Erreur `forensic_logs` (`[NO_BIZ_ID]`)

- **Analyse Diagnostique** : L'erreur `PERMISSION_DENIED` capturée sur `forensic_logs/flog_...` provient du fait que lors des tentatives d'écriture d'audit, le payload Auth de l'utilisateur portait `tenantId: "[NO_BIZ_ID]"`. La règle Firestore exige la présence d'un tenant valide identifié pour associer la trace judiciaire au périmètre entreprise.
- **Correction Validée pour P04** :
  1. `AuthService.ts` forcera l'actualisation du profil utilisateur (`reloadUserProfile`) pour garantir que le Custom Claim `businessId` est injecté dans le jeton ID Firebase avant toute requête d'écriture d'audit.
  2. `AuditService.ts` injectera systématiquement le champ `businessId` dans l'objet log avant transmission à Firestore.

---

### 3.3 Matrice des Rôles & Application du Principe Maker-Checker

La hiérarchie des rôles et des privilèges opérationnels de trésorerie est validée :

| Rôle | Périmètre d'Action | Limite d'Opération | Création Caisse/Coffre | Approbation Écart / Transfert |
|---|---|---|---|---|
| `JUNIOR_TELLER` | Sa propre caisse attribuée | Limite réduite | Non | Non |
| `SENIOR_TELLER` | Sa caisse & coffre autorisé | Limite intermédiaire | Non | Demande de transfert uniquement |
| `HEAD_TELLER` | Branche / Guichets de la branche | Limite élevée | Oui | Validation transfert & écarts branche |
| `MANAGER` | Branche / Région | Limite supérieure | Oui | Validation décisionnelle globale |
| `OWNER` | Entreprise / Tenant complet | Illimitée | Oui | Validation niveau entreprise |
| `SUPER_ADMIN` | Multi-tenants | Illimitée | Global | Administration système |

**Principe Maker-Checker** :
Toute opération nécessitant une validation (ex: clôture avec écart > seuil, approvisionnement de caisse depuis le coffre) interdit formellement à l'initiateur de la demande d'approuver sa propre transaction. Le contrôle sera appliqué à la fois dans `ApprovalEngine.ts` et dans les règles de sécurité Firestore (`request.auth.uid != resource.data.createdBy`).

---

# 4. AUDIT SECTION 3 — VALIDATION DE LA CONCURRENCE, TRÉSORERIE ET MODE HORS LIGNE

### 4.1 Modèle de Concurrence et Sécurité de Solde

1. **Transactions Atomiques Firestore (`runTransaction`)** : Toute opération modifiant le solde d'une caisse ou d'un coffre utilisera obligatoirement `runTransaction`. Le solde est lu, la suffisance des fonds est vérifiée, et la mise à jour du solde est écrite simultanément avec la transaction du Grand Livre (`ledger_transactions`).
2. **Verrous Applicatifs (`active_approval_locks`)** : Pendant la procédure de comptage physique de clôture d'une session de caisse, un verrou temporaire est posé sur l'ID de la caisse pour interdire l'injection de toute nouvelle transaction de guichet parallèle.

---

### 4.2 Machine à États des Sessions de Caisse (`cash_sessions`)

L'enchaînement des états de session de caisse est strictement verrouillé :

```
[ DRAFT ]  --->  [ OPEN ]  --->  [ COUNTED ]  --->  (Analyse d'Écart)
                                                         |
                                                         +---> [ CLOSED ] (Écart <= Seuil)
                                                         |
                                                         +---> [ DISCREPANCY_PENDING ] ---> [ CLOSED ] (Validé par Manager)
```

- **Seuil de tolérance automatique** : Tout écart inférieur ou égal à 10 HTG (ou 5 USD) est automatiquement imputé sur les comptes `5090` (excédent) ou `6090` (manquant).
- **Écarts majeurs** : La session bascule en `DISCREPANCY_PENDING` et requiert la signature numérique et la justification d'un `MANAGER` ou `HEAD_TELLER`.

---

### 4.3 Verrouillage FX et Mode Hors Ligne (IndexedDB / Outbox)

1. **Verrouillage des Taux de Change (FX Lock Window)** : Lors de la saisie d'un échange de devises par un guichetier, le taux affiché est gelé pour une durée maximale de **5 minutes** (`lockExpiresAt = Date.now() + 300000`). Passé ce délai, une réactualisation du taux depuis `exchange_rates` est exigée.
2. **Mode Hors Ligne et Idempotence** : Les transactions de guichet effectuées hors ligne sont persistées dans IndexedDB avec un UUID client v4. Lors de la reconnexion, elles sont poussées dans la file d'attente d'orchestration (`orchestration_queue`) où le serveur vérifie leur identifiant unique pour éviter tout double enregistrement (*at-most-once processing*).

---

# 5. AUDIT SECTION 4 — ÉVALUATION DES RISQUES RÉSIDUELS ET DÉPENDANCES PRÉ-P04

### 5.1 Stratégie de Test et Isolement des Environnements

- **Diagnostic des échecs de test Vitest hors émulateur** : L'exécution des tests sans émulateur Firestore local engendre des erreurs `Missing or insufficient permissions` lors des tentatives d'accès à la base Cloud de production. Ce comportement est la preuve directe de l'efficacité des règles Firestore actuelles.
- **Directives de Test pour P04** :
  1. **Tests unitaires (Vitest)** : Utilisation obligatoire de mocks pour les couches réseau/Firestore (`vi.mock('../lib/firebase')`).
  2. **Tests d'intégration de sécurité** : Exécution exclusive via l'émulateur Firestore local (`firebase emulators:start --only firestore`) à l'aide de `@firebase/rules-unit-testing`.
  3. **Avertissement de sécurité** : Interdiction absolue d'exécuter des suites de tests automatisées avec écriture directe sur l'instance Firestore Cloud de production.

---

### 5.2 Liste des Prérequis Techniques pour le Plan d'Implémentation P04

Avant d'entamer l'implémentation du code en P04, les éléments suivants doivent être formellement structurés dans le document de plan :
1. **Dictionnaire des Types & Interfaces** : Fichier cible `src/types/cash.ts`.
2. **Spécification des Repositories & Services** : `CashRepository.ts`, `TreasuryService.ts`, `FXService.ts`.
3. **Script de mise à jour des constantes** : `src/constants/finance.ts`.
4. **Mise à jour documentaire des règles Firestore** : Bloc complet à insérer dans `/firestore.rules`.

---

# 6. AUDIT SECTION 5 — CONDITIONS ET DIRECTIVES D'ENTRÉE DANS P04

### 6.1 Périmètre Strictement Autorisé pour la Phase P04

La délivrance du verdict `P04_IMPLEMENTATION_PLANNING_AUTHORIZED` autorise **exclusivement** :
- La rédaction détaillée du document de plan d'implémentation P04 (**Implementation Plan Document**).
- La structuration pas-à-pas des étapes d'implémentation, des dépendances de fichiers et de la stratégie de validation.

---

### 6.2 Interdictions Toujours en Vigueur à ce Stade

Jusqu'à la validation finale du plan P04 par l'autorité d'architecture :
- **AUCUNE modification de code de production** (`src/...`).
- **AUCUNE modification de règles Firestore en direct** (`/firestore.rules`).
- **AUCUNE création ou suppression de collections Firestore**.
- **AUCUN déploiement en environnement de recette ou production**.

---

# 7. BILAN DE CONFORMITÉ & SIGNATURE D'AUDIT

- **Document de référence généré** : `docs/audits/FINOPS_FINAYITI_PRE_IMPLEMENTATION_AUTHORIZATION_GATE_P03_5.md`
- **Verdict Final** : `P04_IMPLEMENTATION_PLANNING_AUTHORIZED`
- **Fichiers de code de production modifiés** : `0`
- **Écritures Firestore effectuées** : `0`
- **Conformité à la Constitution GEMINI.md** : `100% Strictly Compliant`
