# FINOPS ERP / FINAYITI FUSION
# P0 — AUDIT FORENSIQUE DES PERMISSIONS FIREBASE AUTHENTICATION / ADMIN SDK

**Date :** 11 Novembre 2026  
**Mode :** STRICTEMENT READ-ONLY — AUCUNE MODIFICATION DE CODE NI IAM  
**Projet Firebase cible :** `finopsht`  
**Base Firestore :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  
**Compte de service backend :** `finops-backend-sa@finopsht.iam.gserviceaccount.com`  
**Rôle IAM actuellement attribué :** `roles/datastore.user`  

---

## VERDICT TECHNIQUE OFFICIEL

```text
FIREBASE AUTH ADMIN REQUIRED
(ALTERNATIVE MOINDRE PRIVILÈGE : CUSTOM IAM ROLE RECOMMENDED)
```

**Justification synthétique :**
Le backend FINOPS ERP invoque la méthode `adminAuth.setCustomUserClaims()` à trois endroits critiques du cycle de vie des utilisateurs (`ServerProvisioningService.provision`, `InvitationService.acceptInvitation`, et `InvitationService.reconcileCustomClaims`).  
Dans l'arborescence des rôles prédéfinis Google Cloud IAM, le rôle `roles/datastore.user` ne confère **aucune** permission sur le service d'authentification (`firebaseauth.*`), et le rôle `roles/firebaseauth.viewer` est en lecture seule (`firebaseauth.users.get`, `firebaseauth.users.list`). Seul le rôle prédéfini **`roles/firebaseauth.admin`** inclut la permission requise **`firebaseauth.users.update`** indispensable pour définir ou modifier les Custom Claims d'un utilisateur Firebase.

---

## 1. RÉSUMÉ EXÉCUTIF

Cet audit forensique a pour objectif d'inventorier de manière exhaustive l'ensemble des interactions entre le backend FINOPS ERP et le SDK Firebase Admin Authentication (`firebase-admin/auth`), et d'identifier avec exactitude les permissions IAM Google Cloud indispensables pour le compte de service dédié `finops-backend-sa@finopsht.iam.gserviceaccount.com`.

### Constats majeurs :
1. **Étendue réelle des appels Auth Admin :** Seules **deux méthodes distinctes** du SDK Firebase Admin Auth sont effectivement appelées dans le code source de l'application :
   - `adminAuth.verifyIdToken(token, checkRevoked)` (avec `checkRevoked = true`, et fallback `false`)
   - `auth.setCustomUserClaims(uid, claims)`
2. **Absence d'autres opérations administratives :** Le backend n'effectue aucune opération de création de compte utilisateur (`createUser`), de suppression (`deleteUser`), de listage (`listUsers`), de gestion de cookies de session (`createSessionCookie`, `verifySessionCookie`), ni de génération de liens d'authentification par email. La gestion des comptes est déléguée au Firebase Client SDK côté frontend (Google Auth Popup).
3. **Insuffisance du rôle `roles/datastore.user` :** Ce rôle donne un accès complet aux données Firestore mais n'accorde strictement aucun droit sur l'API Identity Toolkit / Firebase Auth.
4. **Insuffisance de `roles/firebaseauth.viewer` :** Ce rôle suffirait pour `verifyIdToken(token, true)` (lecture du profil), mais ferait immédiatement échouer `setCustomUserClaims()` avec une erreur `7 PERMISSION_DENIED`.

---

## 2. INVENTAIRE EXHAUSTIF DES MÉTHODES FIREBASE ADMIN AUTHENTICATION

| Méthode inspectée | Statut dans FINOPS ERP | Emplacement / Commentaire |
|---|---|---|
| `verifyIdToken()` | **PRÉSENT** | Invoqué dans `src/modules/workflow/approval/serverAuthMiddleware.ts` (lignes 88 et 100). |
| `setCustomUserClaims()` | **PRÉSENT** | Invoqué dans `InvitationService.ts` (l. 388 et l. 469) et `ServerProvisioningService.ts` (l. 342). |
| `getAuth()` | **PRÉSENT** | Encapsulé dans la factory `getAdminAuth()` (`src/lib/firebaseAdmin.ts:128`). |
| `verifySessionCookie()` | **ABSENT** | Non utilisé. L'application utilise des Bearer ID Tokens et non des cookies de session Firebase. |
| `createSessionCookie()` | **ABSENT** | Non utilisé. |
| `getUser()` | **ABSENT (Direct)** | Non appelé directement dans le code applicatif (appelé en interne par `verifyIdToken` si `checkRevoked=true`). |
| `getUserByEmail()` | **ABSENT** | Non utilisé. L'identité repose sur le document Firestore `users/{uid}`. |
| `createUser()` | **ABSENT** | Non utilisé. Les utilisateurs sont créés par le flux client Firebase Auth (Google Sign-In). |
| `updateUser()` | **ABSENT** | Non utilisé directement (seuls les custom claims sont mis à jour via `setCustomUserClaims`). |
| `deleteUser()` | **ABSENT** | Non utilisé. La suspension est gérée de manière logique dans Firestore (`accountStatus: "SUSPENDED"`). |
| `revokeRefreshTokens()`| **ABSENT** | Non utilisé directement. |
| `listUsers()` | **ABSENT** | Non utilisé. Les listes d'employés/utilisateurs proviennent de Firestore. |
| `generatePasswordResetLink()` | **ABSENT** | Non utilisé. |
| `generateEmailVerificationLink()` | **ABSENT** | Non utilisé. |
| `importUsers()` | **ABSENT** | Non utilisé. |

---

## 3. MATRICE DES PREUVES D'APPEL ET DE PERMISSION IAM

| Méthode | Fichier:ligne | Appelant | Route/API | Usage métier | Permission IAM nécessaire | Preuve |
|---|---|---|---|---|---|---|
| `verifyIdToken(token, true)` | `src/modules/workflow/approval/serverAuthMiddleware.ts:88` | `verifyIdTokenWithRevocationFallback` via `authenticateIdentityOnly` et `authenticateToken` | Toutes les routes protégées de l'application (`/api/provisioning/*`, `/api/invitations/*`, `/api/maintenance/*`, `/api/cash/*`, `/api/transfers/*`, `/api/approval/*`, etc.) | Vérification d'authenticité cryptographique du JWT + contrôle de révocation en temps réel auprès d'Identity Toolkit. | `firebaseauth.users.get` | La vérification de révocation (`checkRevoked = true`) force le SDK Admin à interroger l'API REST Identity Toolkit (`getAccountInfo`) pour comparer `auth_time` avec `validSince`. |
| `verifyIdToken(token, false)` | `src/modules/workflow/approval/serverAuthMiddleware.ts:100` | `verifyIdTokenWithRevocationFallback` | Fallback si Identity Toolkit API indisponible | Vérification de signature cryptographique RS256 locale via les certificats publics Google (`robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`). | **Aucune permission IAM** | Validation cryptographique locale de JWT sans appel réseau authentifié à l'API Firebase Admin. |
| `setCustomUserClaims(user.uid, claims)` | `src/services/business/InvitationService.ts:388` | `InvitationService.acceptInvitation` | `POST /api/invitations/accept` | Injection des claims de souveraineté (`business_id`, `businessId`, `role`) dans le jeton Auth du nouvel utilisateur après acceptation d'invitation. | `firebaseauth.users.update` | Requête HTTP REST vers l'API Identity Toolkit `setAccountInfo` avec payload `customAttributes`. Échoue avec 403 `PERMISSION_DENIED` si cette permission manque. |
| `setCustomUserClaims(targetUid, claims)` | `src/services/business/InvitationService.ts:469` | `InvitationService.reconcileCustomClaims` | `POST /api/invitations/reconcile-claims` | Réconciliation idempotente et réparation des claims lorsque la synchronisation a échoué lors de l'acceptation (`customClaimsSynced: false`). | `firebaseauth.users.update` | Requête HTTP REST vers l'API Identity Toolkit `setAccountInfo`. Requiert l'autorisation d'écriture sur le compte utilisateur. |
| `setCustomUserClaims(founder.uid, claims)` | `src/services/business/ServerProvisioningService.ts:342` | `ServerProvisioningService.provision` | `POST /api/provisioning/create-business` | Attribution des claims fondateurs (`business_id`, `businessId`, `role: "OWNER"`) lors du provisionnement initial d'une entreprise. | `firebaseauth.users.update` | Requête HTTP REST vers l'API Identity Toolkit `setAccountInfo`. Requiert l'autorisation d'écriture sur le compte utilisateur. |

---

## 4. ANALYSE COMPARATIVE DES RÔLES IAM GOOGLE CLOUD

### A. Rôle actuel : `roles/datastore.user`
- **Permissions couvertes :** `datastore.databases.get`, `datastore.entities.*`.
- **Permissions Auth couvertes :** **0**.
- **Conclusion :** Indispensable pour Firestore, mais totalement inopérant pour Firebase Authentication.

### B. Rôle : `roles/firebaseauth.viewer` (Firebase Authentication Viewer)
- **Permissions couvertes :**
  - `firebaseauth.users.get`
  - `firebaseauth.users.list`
  - `firebaseauth.configs.get`
- **Méthodes autorisées :** `adminAuth.verifyIdToken(token, true)`.
- **Méthodes bloquées :** `adminAuth.setCustomUserClaims(...)` (Erreur HTTP 403 / gRPC 7 `PERMISSION_DENIED`).
- **Conclusion :** **INSUFFISANT**. Ne permet pas le provisionnement d'entreprises ni l'acceptation d'invitations.

### C. Rôle standard recommandé : `roles/firebaseauth.admin` (Firebase Authentication Admin)
- **Permissions couvertes :**
  - `firebaseauth.users.get` (Valide `verifyIdToken(..., true)`)
  - `firebaseauth.users.update` (Valide `setCustomUserClaims`)
  - `firebaseauth.users.create`
  - `firebaseauth.users.delete`
  - `firebaseauth.configs.get`
  - `firebaseauth.configs.update`
- **Conclusion :** **SUCCÈS TECHNIQUE GARANTI**. C'est le rôle prédéfini officiel Google Cloud pour les backends gérant des Custom Claims.
- **Risque associé :** Rôle légèrement plus large que le besoin strict (permet potentiellement la suppression ou la création d'utilisateurs si le code était compromis).

### D. Rôle sur mesure : `CUSTOM IAM ROLE` (Moindre Privilège Strict)
Si la politique de sécurité de l'entreprise interdit les rôles prédéfinis `admin`, un rôle IAM personnalisé peut être créé au niveau du projet `finopsht` :
- **Nom suggéré :** `projects/finopsht/roles/finopsBackendAuthManager`
- **Permissions minimales strictes :**
  ```text
  firebaseauth.users.get
  firebaseauth.users.update
  ```
- **Avantage :** Répond exactement aux deux besoins identifiés (vérification de révocation + mise à jour des claims), sans accorder de droit de suppression ou d'export global des utilisateurs.

---

## 5. ANALYSE APPROFONDIE DES RISQUES DE SÉCURITÉ

### 1. Comportement en cas d'échec de `setCustomUserClaims()`
- **Dans `InvitationService.acceptInvitation` :**  
  L'écriture Firestore des entités (`employees`, `memberships`, `users`) est exécutée dans une transaction préalable réussie. Si `setCustomUserClaims` échoue, le catch met à jour `users/{uid}` et `memberships/{id}` avec `customClaimsSynced: false`, horodate l'échec, enregistre le message d'erreur, et lève l'exception `CUSTOM_CLAIMS_SYNC_FAILED`.
- **Dans `ServerProvisioningService.provision` :**  
  L'échec est intercepté comme un avertissement non bloquant (`console.warn`) afin de ne pas bloquer l'initialisation des documents de l'entreprise.

### 2. Risque d'accès accordé avant synchronisation des claims
- **Mitigation architecturale robuste :**  
  Dans `serverAuthMiddleware.ts` (lignes 432–448), le backend n'accorde jamais aveuglément les droits sur la base exclusive des claims du token. Si `business_id` est absent du token, le middleware interroge le document `users/{uid}` dans Firestore et en extrait le `business_id` et le `role`.
- **Impact côté Client :**  
  Tant que les claims ne sont pas synchronisés dans le jeton JWT (délai de renouvellement pouvant atteindre 1 heure si le client n'invoque pas `getIdToken(true)`), les règles de sécurité Firestore qui s'appuient sur `request.auth.token.business_id` rejetteront les requêtes directes du frontend.

### 3. Tokens obsolètes & invalidation
- Les ID Tokens Firebase sont des jetons JWT d'une durée de vie de 60 minutes.
- Après l'acceptation d'une invitation ou la modification d'un rôle, le frontend doit obligatoirement invoquer `auth.currentUser.getIdToken(true)` pour forcer la regénération du token avec les nouveaux claims.
- `serverAuthMiddleware` détecte les contradictions : si le token porte un `business_id` différent de celui inscrit dans `users/{uid}`, la requête est immédiatement rejetée avec `403 TENANT_MISMATCH`.

### 4. Résilience de `verifyIdTokenWithRevocationFallback`
- Le middleware tente d'abord `verifyIdToken(token, true)`.
- Si l'API Identity Toolkit est inaccessible (problème réseau transitoire ou API non activée dans le projet hôte), il bascule sur `verifyIdToken(token, false)`.
- **Analyse du risque résiduel :** En mode local (`checkRevoked = false`), un token révoqué avant sa date d'expiration (60 min) reste cryptographiquement valide. Toutefois, `serverAuthMiddleware` interroge le document `users/{uid}` et bloque l'accès si `accountStatus === "SUSPENDED"`, ce qui comble la quasi-totalité de la fenêtre de risque.

### 5. Mécanisme de réconciliation (`reconcileCustomClaims`)
- La route `POST /api/invitations/reconcile-claims` permet à l'utilisateur ou à un SuperAdmin de relancer la synchronisation des claims depuis l'état faisant autorité (SSOT) de Firestore (`users` + `memberships`).

---

## 6. TESTS ET LIMITES DE VALIDATION

### Classification des tests existants :
1. **Tests unitaires avec Mocks (`src/tests/unit/security/P0FinalHardeningInvitationClaims.test.ts`) :**
   - 9 tests sur 9 réussis.
   - Ces tests simulent `setCustomUserClaims` via `vi.fn()` et `vi.spyOn()` pour vérifier le comportement d'erreur et le flag `customClaimsSynced: false`.
   - **Limite :** Ne testent aucun appel réseau réel vers l'API Google Cloud Identity Toolkit.
2. **Tests d'intégrité SDK (`src/tests/unit/security/FirebaseAdminSdkP0Integrity.test.ts`) :**
   - 5 tests sur 5 réussis.
   - Vérifient que `getAdminAuth()` et `getAdminFirestore()` utilisent le SDK Admin natif et ciblent la base nommée `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`.
   - **Limite :** Ne vérifient pas les autorisations IAM d'un compte de service spécifique en environnement de production.
3. **Environnement Sandbox AI Studio :**
   - L'identité active dans le conteneur est `ais-sandbox@ais-us-east1-ba7a4385c35a4dd2b.iam.gserviceaccount.com`. Elle n'a aucun droit sur `finopsht`.
   - **Conclusion méthodologique :** *NO EVIDENCE = NOT VERIFIED*. Les permissions IAM du compte `finops-backend-sa` ne peuvent être validées que lors de son exécution dans l'environnement souverain (Cloud Run) ou via l'émulateur Firebase.

---

## 7. ACTIONS MANUELLES RECOMMANDÉES SUR GOOGLE CLOUD (FINOPSHT)

Pour activer les droits du compte de service backend `finops-backend-sa@finopsht.iam.gserviceaccount.com` sur le projet Firebase `finopsht`, l'administrateur du projet doit exécuter :

### Option 1 — Rôle Standard Google Cloud (Immédiat)
```bash
gcloud projects add-iam-policy-binding finopsht \
    --member="serviceAccount:finops-backend-sa@finopsht.iam.gserviceaccount.com" \
    --role="roles/firebaseauth.admin"
```

### Option 2 — Moindre Privilège Strict (Rôle Personnalisé)
```bash
# 1. Création du rôle personnalisé
gcloud iam roles create finopsBackendAuthManager \
    --project=finopsht \
    --title="FINOPS Backend Auth Manager" \
    --description="Autorise la lecture de révocation et la mise à jour des Custom Claims" \
    --permissions="firebaseauth.users.get,firebaseauth.users.update" \
    --stage=GA

# 2. Attribution du rôle au compte de service backend
gcloud projects add-iam-policy-binding finopsht \
    --member="serviceAccount:finops-backend-sa@finopsht.iam.gserviceaccount.com" \
    --role="projects/finopsht/roles/finopsBackendAuthManager"
```

---

## 8. RÉCAPITULATIF DES POLITIQUES IAM DU COMPTE BACKEND

| Ressource GCP / Firebase | Rôle Actuel | Rôle Requis Complémentaire | Statut |
|---|---|---|---|
| **Cloud Firestore / Datastore** (`finopsht`) | `roles/datastore.user` | *Aucun* (Déjà attribué et suffisant pour Firestore) | **CONFORME** |
| **Firebase Authentication** (`finopsht`) | *Aucun* | `roles/firebaseauth.admin` (ou `finopsBackendAuthManager`) | **ACTION REQUISE CÔTÉ GCP** |
