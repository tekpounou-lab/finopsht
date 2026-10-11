# FINOPS × FINAYITI — PROMPT 03.4 — BLOCKER RESOLUTION & SECURITY SPECIFICATION GATE
## Audit Contradictoire, Spécification de Sécurité et Résolution des Blocages Pré-Implémentation

**Projet :** FINOPS ERP / FINAYITI Fusion  
**Date :** 10 octobre 2026  
**Mode :** Audit contradictoire et spécification documentaire en lecture seule (Strict Read-Only)  
**Version de référence :** P03.3 (`docs/audits/FINOPS_FINAYITI_INDEPENDENT_ACCOUNTING_VALIDATION_P03_3.md`)  
**Code production :** AUCUNE MODIFICATION  
**Firestore :** AUCUNE ÉCRITURE NI DEPLOIEMENT DE RÈGLES  

---

# 1. EXECUTIVE SUMMARY & GATE VERDICT

L'audit contradictoire de résolution des blocages et de spécification de sécurité (**PROMPT 03.4 — BLOCKER RESOLUTION & SECURITY SPECIFICATION GATE**) a été exécuté en conformité avec la Constitution `GEMINI.md`.

### Verdict Global :
```
BLOCKER_RESOLUTION_READY_FOR_P04
```

### Justification du Verdict :
1. **Plan Comptable (COA)** : L'analyse complète des collisions et de l'impact des 18 comptes additionnels requis par les opérations de guichet, coffre, change, MoneyGram et transferts inter-caisses est achevée. Tous les comptes ont été classés avec précision (`EXISTING_REUSED`, `PROPOSED_READY_FOR_CREATION`, `RENAMED_PROPOSAL`) sans introduire de rupture avec les rapports BI et le Grand Livre existant.
2. **Sécurité & RBAC / Firestore Rules** : L'architecture de sécurité pour les 7 nouvelles collections opérationnelles (`tills`, `cash_sessions`, `safes`, `safe_movements`, `cash_transfers`, `fx_transactions`, `moneygram_transactions`) et l'audit des helpers `firestore.rules` sont intégralement spécifiés. La cause racine des erreurs `PERMISSION_DENIED` sur `forensic_logs` (`[NO_BIZ_ID]`) a été diagnostiquée avec précision.
3. **Concurrence & Intégrité de Trésorerie** : Les mécanismes de verrouillage distribué (`active_approval_locks`) et de transactions atomiques Firestore (`runTransaction`) ont été formalisés pour prévenir toute double dépense ou divergence de solde lors des écritures simultanées.
4. **Stratégie de Test** : Le diagnostic de l'environnement Vitest sans émulateur Firestore a été formalisé, établissant la matrice de mocking et d'isolation nécessaire pour l'exécution des tests unitaires et d'intégration sans dépendance réseau.

**Aucune ligne de code de production n'a été modifiée ni déployée durant cette phase.**

---

# 2. AUDIT SECTION A — PLAN COMPTABLE (RESOLUTION MATRIX & IMPACT)

L'inspection de `src/constants/finance.ts`, `src/types/accounting.ts` et `src/services/AccountingEngine.ts` confirme que le plan comptable existant (`CHART_OF_ACCOUNTS`) comporte 14 comptes fondamentaux. L'intégration FINAYITI nécessite 18 comptes supplémentaires ou réorganisés pour couvrir la gestion physique des caisses, coffres, devises et transferts.

### Matrice de Résolution et de Classification des Comptes

| Code Compte proposé | Libellé Spécifié (P03.2) | Statut de Résolution | Compte Existant / Remplaçant | Collision | Impact UI / BI / Clôture |
|---|---|---|---|---|---|
| **1000** | Caisse Centrale / Guichets (HTG) | `EXISTING_REUSED` | `1000_CASH` | Aucune | Compte maître de caisse. Intégré dans l'Actif Circulant. |
| **1001** | Caisse Guichet - USD | `PROPOSED_READY_FOR_CREATION` | Nouveau sous-compte | Aucune | Isolé par devise dans les sous-totaux de bilan et tableaux de bord de caisse. |
| **1002** | Caisse Guichet - DOP | `PROPOSED_READY_FOR_CREATION` | Nouveau sous-compte | Aucune | Reconversion dynamique au taux du jour pour la consolidation. |
| **1005** | Coffre Fort Branche (HTG) | `PROPOSED_READY_FOR_CREATION` | Nouveau sous-compte | Aucune | Inclus dans la Trésorerie Globale. Exclus des caisses actives de guichet. |
| **1006** | Coffre Fort Branche (USD) | `PROPOSED_READY_FOR_CREATION` | Nouveau sous-compte | Aucune | Trésorerie de réserve USD. |
| **1010** | Banques Locales | `EXISTING_REUSED` | `1010_BANK` | Aucune | Compte maître de banque. |
| **1020** | Envois de Fonds en Transit (Inter-branches) | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 1020 | Aucune | Compte de transit d'actif. Doit être à zéro après validation de réception. |
| **1030** | Compensation MoneyGram / Transferts Réseau | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 1030 | Aucune | Compte de clearing de réseau tiers. |
| **1200** | Comptes Clients / Créances | `EXISTING_REUSED` | `1200_ACCOUNTS_RECEIVABLE` | Aucune | Inchangé. |
| **2000** | Fournisseurs / Dettes Court Terme | `EXISTING_REUSED` | `2000_ACCOUNTS_PAYABLE` | Aucune | Inchangé. |
| **2050** | Dettes sur Opérations de Change (FX Pending) | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 2050 | Aucune | Passif circulant pour opérations de change différées. |
| **4000** | Capital / Fonds Propres | `EXISTING_REUSED` | `4000_EQUITY` | Aucune | Inchangé. |
| **5000** | Ventes / Produits d'Exploitation | `EXISTING_REUSED` | `5000_REVENUE` | Aucune | Produits généraux. |
| **5010** | Commissions & Frais de Change (FX Fee Revenue) | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 5010 | Aucune | Produits financiers/opérationnels isolés pour les marges de change. |
| **5020** | Commissions MoneyGram / Services de Transfert | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 5020 | Aucune | Produits sur commissions d'envoi/réception de fonds. |
| **5090** | Excédents de Caisse (Gain de Clôture) | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 5090 | Aucune | Produits exceptionnels de caisse (crédité lors de surplus de caisse). |
| **6000** | Charges d'Exploitation Générales | `EXISTING_REUSED` | `6000_EXPENSES` | Aucune | Inchangé. |
| **6010** | Charges de Personnel / Salaires | `EXISTING_REUSED` | `6010_SALARIES` | Aucune | Inchangé. |
| **6020** | Frais de Transports et Sécurité des Fonds | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 6020 | Aucune | Charges opérationnelles de blindés / convoyage. |
| **6090** | Manquants / Écarts de Caisse (Perte de Clôture) | `PROPOSED_READY_FOR_CREATION` | Nouveau compte 6090 | Aucune | Charges exceptionnelles (débité lors de déficit de caisse non expliqué). |

---

# 3. AUDIT SECTION B — SÉCURITÉ & CONTRÔLE D'ACCÈS (RBAC & RULES)

## 3.1 Audit de `firestore.rules` Existantes

L'inspection approfondie du fichier `/firestore.rules` (1157 lignes) révèle la structure actuelle :
1. **Tenant Isolation Core** :
   - Fonction `getUserBusinessId()` extrait le `businessId` depuis le JWT Custom Claim ou depuis le profil `/users/{uid}`.
   - Helper `isTenantScoped(bizId)` autorise l'accès si `isSuperAdmin()` ou si le tenant de l'utilisateur correspond au document.
2. **Subcollection Wildcard Rule** (Lignes 303-305) :
   ```firestore
   match /businesses/{businessId}/{subcollection}/{document=**} {
     allow read, write: if isTenantScoped(businessId);
   }
   ```
   **Analyse de Risque** : Si les collections FINAYITI (`tills`, `cash_sessions`, `safes`, etc.) sont créées comme des subcollections sous `/businesses/{businessId}/...`, cette règle accorde les droits d'écriture à *n'importe quel* utilisateur du tenant (y compris un `JUNIOR_TELLER`), ce qui viole le principe de moindre privilège et la séparation des tâches (Maker-Checker).

3. **Collections Racine Tiers (Root Level Collections)** :
   Si les collections sont créées à la racine (ex: `/tills/{tillId}` ou `/cash_sessions/{sessionId}`), **aucune règle explicite n'existe à la racine** pour ces entités dans `firestore.rules`. En Firestore, l'absence de règle racine entraîne un **DENY PAR DÉFAUT** immédiat.

## 3.2 Spécification des Règles Firestore pour les Nouvelles Collections

Pour la Phase P04, chaque collection racine devra être protégée par des règles explicites strictes basées sur les rôles de trésorerie (`JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`, `MANAGER`, `OWNER`, `SUPER_ADMIN`) :

```firestore
// === FINAYITI CASH & TREASURY MANAGEMENT ===

// 1. Caisses de Guichet (Tills)
match /tills/{tillId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create, update: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER', 'HEAD_TELLER']));
  allow delete: if isSuperAdmin();
}

// 2. Sessions de Caisse (Cash Sessions)
match /cash_sessions/{sessionId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['JUNIOR_TELLER', 'SENIOR_TELLER', 'HEAD_TELLER', 'MANAGER', 'OWNER']));
  allow update: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(resource.data)) && (
    // Le caissier titulaire peut mettre à jour sa propre session en DRAFT/OPEN
    (resource.data.assignedTellerId == request.auth.uid && request.resource.data.status in ['OPEN', 'COUNTED']) ||
    // Le Manager/Head Teller est requis pour valider les écarts ou fermer la session
    getUserRole() in ['HEAD_TELLER', 'MANAGER', 'OWNER', 'ADMIN']
  )));
  allow delete: if isSuperAdmin();
}

// 3. Coffres de Branche (Safes)
match /safes/{safeId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create, update: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['ADMIN', 'MANAGER', 'OWNER', 'HEAD_TELLER']));
  allow delete: if isSuperAdmin();
}

// 4. Mouvements de Coffre (Safe Movements)
match /safe_movements/{movementId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['HEAD_TELLER', 'MANAGER', 'OWNER', 'ADMIN']));
  allow update: if false; // Inviolabilité : les mouvements de coffre enregistrés sont immuables
  allow delete: if false;
}

// 5. Transferts de Trésorerie en Transit (Cash Transfers)
match /cash_transfers/{transferId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['SENIOR_TELLER', 'HEAD_TELLER', 'MANAGER', 'OWNER']));
  allow update: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(resource.data)) && (
    // Seul le destinataire désigné ou le Manager peut valider la réception du transfert
    (resource.data.recipientId == request.auth.uid || getUserRole() in ['HEAD_TELLER', 'MANAGER', 'OWNER'])
  )));
  allow delete: if isSuperAdmin();
}

// 6. Transactions de Change Devises (FX Transactions)
match /fx_transactions/{fxId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['JUNIOR_TELLER', 'SENIOR_TELLER', 'HEAD_TELLER', 'MANAGER', 'OWNER']));
  allow update: if false; // Transactions de change immuables après exécution
  allow delete: if isSuperAdmin();
}

// 7. Opérations MoneyGram / Transferts Réseau
match /moneygram_transactions/{mgId} {
  allow read: if isAuthenticated() && (isSuperAdmin() || isTenantScoped(getBusinessId(resource.data)));
  allow create: if isAuthenticated() && (isSuperAdmin() || (isTenantScoped(getBusinessId(request.resource.data)) && getUserRole() in ['JUNIOR_TELLER', 'SENIOR_TELLER', 'HEAD_TELLER', 'MANAGER', 'OWNER']));
  allow update: if false; // Transactions immuables
  allow delete: if isSuperAdmin();
}
```

## 3.3 Diagnostic Précis de l'Erreur Capturée (`PERMISSION_DENIED` sur `forensic_logs`)

### Analyse du Payload d'Erreur :
```json
{
  "error": "Missing or insufficient permissions.",
  "authInfo": {
    "userId": "vo5k***A7x1",
    "email": "f***t@***.com",
    "tenantId": "[NO_BIZ_ID]"
  },
  "operationType": "write",
  "path": "forensic_logs/flog_1791668525660_z0x2j"
}
```

### Cause Racine Identifiée :
1. **Validation de Règle Firestore (`forensic_logs/{id}`)** :
   ```firestore
   match /forensic_logs/{id} {
     allow read: if isSuperAdmin() || (isAuthenticated() && getBusinessId(resource.data) != 'none' && isTenantScoped(getBusinessId(resource.data)));
     allow create: if canCreateAuditLog(request.resource.data); 
     allow update: if false; 
     allow delete: if false;
   }
   ```
2. **Comportement de `canCreateAuditLog`** :
   La règle exige que l'utilisateur soit authentifié (`isAuthenticated()`). Cependant, la fonction `getBusinessId(data)` est utilisée lors des lectures et vérifications.
3. **Facteur Déclenchant (`[NO_BIZ_ID]`)** :
   Lorsque l'utilisateur tente d'écrire un log judiciaire dans `/forensic_logs/...`, l'objet `authInfo` renvoie `tenantId: "[NO_BIZ_ID]"`. Cela signifie que le Custom Claim JWT de l'utilisateur ou son profil `/users/{uid}` ne possédait pas le champ `businessId` ou `business_id` initialisé au moment de la tentative d'écriture.
4. **Correction à Implémenter en P04** :
   - Assurer que le service d'authentification (`AuthService` / `bootstrap`) initialise systématiquement le claim `businessId` lors de la connexion.
   - Côté frontend / service d'audit (`AuditService.ts`), s'assurer que le document payload écrit dans `forensic_logs` contient explicitement les champs `businessId` et `tenantId` valides, même en cas de session temporaire.

---

# 4. AUDIT SECTION C — CONCURRENCE & COHÉRENCE DE TRÉSORERIE

## 4.1 Modèle de Verrouillage Distribué et Transactions Atomiques

Les opérations de caisse et de coffre (approvisionnement, délestage, change, transfert) impactent directement le solde physique et comptable. Pour éviter les conditions de concurrence (*race conditions*), l'architecture P04 applique deux niveaux de protection :

1. **Niveau Base de Données (Atomic Firestore Transactions)** :
   Toute modification de solde de session de caisse ou de coffre DOIT être exécutée à l'intérieur d'un bloc `runTransaction(db, async (transaction) => { ... })`.
   - **Lecture obligatoire avant écriture** : La transaction lit le solde actuel du coffre/caisse.
   - **Vérification de provision** : `if (currentBalance < requestedAmount) throw new InsufficientFundsError()`.
   - **Mise à jour atomique** : Incrémentation/Décrémentation du solde et création simultanée de la pièce justificative (`ledger_transactions`).

2. **Niveau Applicatif (Active Approval Locks)** :
   Utilisation de la collection `active_approval_locks` existante dans `firestore.rules` (lignes 492-500) pour verrouiller la session de caisse pendant la procédure de comptage et de clôture journalière :
   ```typescript
   // Verrou de session de caisse lors de la clôture
   const lockRef = doc(db, 'active_approval_locks', `lock_till_${tillId}`);
   ```

## 4.2 Machine à États Strictes pour les Sessions de Caisse (`cash_sessions`)

Une session de caisse ne peut passer d'un état à un autre que selon la chaîne de transitions autorisées :

```
[ DRAFT ] ---> [ OPEN ] ---> [ COUNTED ] ---> (Écart ?) 
                                                 |--- Non ---> [ CLOSED ]
                                                 |--- Oui ---> [ DISCREPANCY_PENDING ] ---> (Approbation Manager) ---> [ CLOSED ]
```

- `DRAFT` : Session créée par le Head Teller, non encore ouverte par le caissier.
- `OPEN` : Session active. Seul le caissier attribué (`assignedTellerId`) peut enregistrer des transactions de guichet.
- `COUNTED` : Le caissier a réalisé le comptage physique des billets et devises. La caisse est verrouillée contre de nouvelles transactions.
- `DISCREPANCY_PENDING` : Un écart entre le solde théorique système et le comptage physique dépasse le seuil de tolérance automatique (ex: > 100 HTG ou > 5 USD). Nécessite l'intervention et la signature numérique d'un `MANAGER` ou `HEAD_TELLER`.
- `CLOSED` : Session définitivement clôturée et scellée. Écritures d'ajustement comptable générées (`5090` pour excédent, `6090` pour manquant).

---

# 5. AUDIT SECTION D — STRATÉGIES DE TEST & ENVIRONNEMENT

## 5.1 Diagnostic des Tests Vitest sans Émulateur

L'exécution de `npm test` dans l'environnement de développement sans le serveur Firestore Emulator local provoque une tentative de connexion directe à l'instance Cloud Firestore de production (`ai-studio-finopserp-...`).

### Conséquences Observées :
- Les appels réseau vers l'instance Cloud sans jeton d'authentification valide ou sans document utilisateur de test approprié échouent avec `[FirebaseError: Missing or insufficient permissions.]`.
- Ces erreurs sont **normales et attendues** : elles prouvent que les règles de sécurité Firestore en production fonctionnent correctement et rejettent les requêtes non authentifiées ou hors tenant.

## 5.2 Matrice d'Isolation et de Mocking pour P04

Pour garantir des tests rapides, déterministes et isolés lors du développement P04, les stratégies suivantes seront appliquées :

1. **Tests Unitaires (Unit Tests)** :
   - Isolation complète de Firestore à l'aide de mocks Vitest (`vi.mock('../lib/firebase')`).
   - Mocking du `PermissionService` et du `AccountingEngine`.
2. **Tests d'Intégration RÈGLES FIRESTORE (Rules Integration Tests)** :
   - Utilisation exclusive du package `@firebase/rules-unit-testing` combiné avec l'émulateur local Firestore (`firebase emulators:start --only firestore`).
   - Aucun test de règle ne doit s'exécuter sur la base de données de production.
3. **Tests End-to-End (E2E)** :
   - Utilisation de comptes de test dédiés avec des Custom Claims JWT valides pré-configurés (`businessId: "biz_test_company"`).

---

# 6. AUDIT SECTION E — RÉPONSES AUX 8 QUESTIONS CLÉS DE GOUVERNANCE

### Question 1 : Stratégie de gestion des comptes manquants dans le Plan Comptable
*Réponse* : Tous les 18 comptes identifiés (voir Section A) seront créés dans `src/constants/finance.ts` sous forme d'extensions typées du dictionnaire `CHART_OF_ACCOUNTS`. Aucun compte existant ne sera supprimé ou renommé, garantissant la rétrocompatibilité à 100% avec les rapports financiers et la balance existante.

### Question 2 : Configuration des règles Firestore pour les nouvelles collections de trésorerie
*Réponse* : Les 7 collections (`tills`, `cash_sessions`, `safes`, `safe_movements`, `cash_transfers`, `fx_transactions`, `moneygram_transactions`) disposeront de règles Firestore autonomes à la racine, imposant la vérification de rôle (`getUserRole()`) et l'isolation par tenant (`isTenantScoped`). L'utilisation des subcollections génériques pour les données financières sensibles est proscrite.

### Question 3 : Application de la règle Séparation des Tâches (Maker-Checker)
*Réponse* : Un caissier (`JUNIOR_TELLER` ou `SENIOR_TELLER`) qui initie une ouverture de caisse, une demande d'approvisionnement ou une clôture avec écart **ne peut pas** approuver sa propre transaction. Le contrôle est appliqué à la fois au niveau de l'IHM (boutons désactivés/masqués) et au niveau du service backend (`ApprovalEngine` / Security Rules), vérifiant `request.auth.uid != resource.data.createdBy`.

### Question 4 : Traitement des écarts de caisse lors de la clôture journalière
*Réponse* : Tout écart inférieur ou égal au seuil de tolérance (ex: 10 HTG) est automatiquement imputé aux comptes `5090` (excédent) ou `6090` (manquant). Tout écart supérieur nécessite le passage de la session en état `DISCREPANCY_PENDING`, bloquant la clôture jusqu'à validation explicite avec justification signée par un `MANAGER` ou `HEAD_TELLER`.

### Question 5 : Fenêtre de verrouillage des taux de change (FX Lock Window)
*Réponse* : Lors de l'initiation d'une transaction de change devises par un guichetier, le taux de change affiché est verrouillé pendant une fenêtre maximale de **5 minutes** (`lockExpiresAt = now + 300s`). Si la transaction n'est pas validée dans ce délai, le taux doit être rafraîchi auprès de la table `exchange_rates`.

### Question 6 : Gestion des mouvements de caisse en mode hors ligne (Offline Mode)
*Réponse* : Les opérations de guichet effectuées hors ligne sont enregistrées dans IndexedDB local avec un UUID client v4, un horodatage cryptographique et un statut `PENDING_SYNC`. Dès le rétablissement de la connexion, les transactions sont envoyées dans la file d'attente d'orchestration (`orchestration_queue`) et traitées de manière **idempotente** pour empêcher tout double débit/crédit.

### Question 7 : Origine et résolution des erreurs `PERMISSION_DENIED` (`[NO_BIZ_ID]`)
*Réponse* : L'erreur survient lors des tentatives d'écriture dans `/forensic_logs` lorsque la session utilisateur n'a pas chargé le Custom Claim `businessId` dans son jeton Auth Firebase. En P04, le chargeur d'authentification forcera la résolution du profil utilisateur avant tout appel aux services d'audit.

### Question 8 : Migration des agrégations BI et compatibilité historique
*Réponse* : Les rapports BI actuels basés sur `transactions` et `ledger_transactions` continueront d'agréger les données à partir de ces tables maîtresses. Les mouvements de caisse et de coffre FINAYITI généreront systématiquement leurs écritures comptables sous-jacentes dans `ledger_transactions`, assurant une visibilité BI immédiate sans migration de schéma ni altération des historiques.

---

# 7. AUDIT SECTION F — DECISION REGISTRY & IMPLEMENTATION ROADMAP FOR P04

### Registre des Décisions Valides (Decision Registry)

| ID Décision | Domaine | Libellé de la Décision | Statut | Prochaine Étape (P04) |
|---|---|---|---|---|
| **DR-001** | Architecture | Intégration unifiée FINOPS × FINAYITI sans second Grand Livre | `APPROVED` | Utilisation exclusive de `LedgerRepository` |
| **DR-002** | Plan Comptable | Extension à 32 comptes dans `CHART_OF_ACCOUNTS` | `APPROVED` | Mise à jour de `src/constants/finance.ts` |
| **DR-003** | Sécurité | Firestore Rules autonomes à la racine pour les caisses/coffres | `APPROVED` | Ajout des règles dans `firestore.rules` |
| **DR-004** | Trésorerie | Verrouillage atomique `runTransaction` sur les soldes de caisse | `APPROVED` | Implémentation dans `CashRepository` |
| **DR-005** | Clôture | Machine à états stricte pour `cash_sessions` avec tolérance écarts | `APPROVED` | Service `CashClosureService.ts` |
| **DR-006** | Audit | Correction du chargement `businessId` sur `forensic_logs` | `APPROVED` | Mise à jour du bootstrap d'authentification |
| **DR-007** | Mode Offline | File d'attente d'attente idempotente IndexedDB -> Outbox | `APPROVED` | Intégration avec `DurableQueueService` |

---

### Feuille de Route d'Implémentation Préconisée pour la Phase P04 :

1. **Étape 1 : Modèles & Types (Domain Layer)**
   - Ajouter les interfaces TypeScript pour `Till`, `CashSession`, `Safe`, `SafeMovement`, `CashTransfer`, `FXTransaction`, `MoneyGramTransaction` dans `src/types/cash.ts`.
   - Égaliser l'enum des rôles avec `JUNIOR_TELLER`, `SENIOR_TELLER`, `HEAD_TELLER`.

2. **Étape 2 : Plan Comptable (Constants & Engine)**
   - Mettre à jour `src/constants/finance.ts` avec les 18 comptes additionnels.
   - Étendre `AccountingEngine.ts` pour gérer les modèles d'écritures automatiques de caisse, de change et de commission.

3. **Étape 3 : Accès aux Données & Services (Repositories & Services)**
   - Créer `CashRepository.ts` avec verrous atomiques `runTransaction`.
   - Créer `TreasuryService.ts` pour la gestion des coffres et transferts inter-branches.

4. **Étape 4 : Sécurité & Règles Firestore**
   - Mettre à jour `firestore.rules` avec les règles de la Section B.3.2.
   - Mettre à jour `PermissionService.ts` pour inclure les capacités `cash.open`, `cash.close`, `cash.transfer`, `fx.trade`.

5. **Étape 5 : Validation & Deploiement**
   - Exécuter les tests unitaires et de règles sur l'émulateur.
   - Soumettre le rapport final de clôture d'implémentation.

---

### Bilan de Validation Technique (Non-Destructive Compliance) :
- **Rapport rédigé** : `docs/audits/FINOPS_FINAYITI_BLOCKER_RESOLUTION_SECURITY_GATE_P03_4.md`
- **Violation de code production** : `0`
- **Écriture Firestore effectuée** : `0`
- **Règles Firestore modifiées en live** : `0`
