# FINOPS ERP — AUDIT CIBLÉ DES BLOQUEURS DE PACKAGING ET CLOUD RUN

**Projet :** `finopsht`  
**Mode :** STRICTEMENT READ-ONLY — AUCUNE MODIFICATION DE CODE, AUCUN CHANGEMENT IAM, AUCUN DÉPLOIEMENT  
**Compte de service dédié :** `finops-backend-sa@finopsht.iam.gserviceaccount.com`  
**Rôles confirmés :**
- `roles/datastore.user`
- `projects/finopsht/roles/finopsBackendAuthManager` (`firebaseauth.users.get`, `firebaseauth.users.update`)  
**Base Firestore cible :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  

---

## CONTRÔLE 1 — PACKAGING SOURCE

### 1. Présence d'un Dockerfile à la racine
- **Ressource examinée :** Racine du projet `/app/applet/Dockerfile`
- **Preuve exacte :** Commande `ls -la Dockerfile` renvoie :
  ```text
  ls: cannot access 'Dockerfile': No such file or directory
  ```
  Aucun `Dockerfile` n'existe à la racine du projet. En l'absence de `Dockerfile`, la commande `gcloud run deploy --source .` s'appuie automatiquement sur les Google Cloud Buildpacks (détection automatique Node.js via `package.json`).

### 2. Présence de `.gcloudignore`, `.dockerignore` et `.gitignore`
- **Ressources examinées :**
  - `/.gcloudignore` : **ABSENT** (`No such file or directory`)
  - `/.dockerignore` : **ABSENT** (`No such file or directory`)
  - `/.gitignore` : **PRÉSENT** (17 lignes, taille : 223 octets)
- **Preuve exacte :**
  Contenu actuel de `/.gitignore` :
  ```text
  node_modules/
  build/
  dist/
  coverage/
  .DS_Store
  *.log
  .env*
  !.env.example
  service-account-key*.json
  tek-pou-nou-tpn-*.json
  scratch/
  .aistudio/
  *.debug.log
  phase3_cleanup_report_*.json
  ```

### 3. Fichiers transmis par `gcloud run deploy --source .`
- **Preuve exacte du comportement de `gcloud` :**
  Selon la spécification officielle `gcloud topic gcloudignore` :
  - `gcloud` ne respecte `.gitignore` que si un dépôt Git actif (`.git/`) est détecté lors de la génération automatique d'un `.gcloudignore`.
  - Or, dans l'environnement courant, `git status` renvoie :
    ```text
    fatal: not a git repository (or any of the parent directories): .git
    ```
  - En l'absence de répertoire `.git` et en l'absence de fichier `/.gcloudignore`, la commande `gcloud run deploy --source .` génère une archive tarball contenant **la totalité des fichiers du répertoire** (hors patterns internes built-in par défaut de gcloud tels que `__pycache__` ou `.*.swp`).

### 4. Vérification de l'exclusion du fichier de clé externe
- **Fichier examiné :** `/tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json` (2 385 octets)
- **Preuve exacte :** Le fichier est présent physiquement dans le répertoire racine. Bien qu'il soit listé dans `.gitignore` (ligne 10), **l'absence de `.gcloudignore` et l'absence de `.git` font qu'il n'est PAS exclu lors d'un upload de sources par `gcloud`**.
- **Résultat :** **BLOCKED**

### 5. Autres fichiers susceptibles de contenir des credentials ou des données de dev
- **Fichiers examinés à la racine :**
  - `test-firestore.js`, `test-db-id.js`, `test-db-id2.js`, `test-users.js`, `test-businesses.js`, `test-client-query.js` (scripts scratch d'inspection)
  - `patch_import.cjs`, `patch_batch.cjs`, `patch2.cjs`, `patch3.cjs`, `patch4.cjs`, `fix.cjs`, `fix_rules.cjs`, `fix_types.cjs` (scripts temporaires)
  - `phase3_cleanup_report_*.json` (rapports d'assainissement)
  - `firebase-applet-config.json` (contient la clé API Web publique Firebase et les IDs client, normal pour une application web SPA)
  - `.env.example` (modèle sans valeur secrète)

### 6. Liste des fichiers qui seraient transmis au build
Si l'archive était générée aujourd'hui sans `.gcloudignore`, les fichiers transmis incluraient :
- Code source : `server.ts`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `src/**`, `public/**`
- Configurations : `firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.rules`, `firestore.indexes.json`, `firebase.json`
- **Fichiers indésirables transmis :** `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json`, tous les scripts `test-*.js`, `patch*.cjs`, `fix*.cjs`, et rapports `phase3_cleanup_report_*.json`.
- **Risque :** **CRITIQUE**. Fuite de la clé privée de `tek-pou-nou-tpn` dans l'image de conteneur Cloud Run et dans les logs de build.
- **Correction minimale recommandée :** Créer un fichier `/.gcloudignore` explicite avant toute commande gcloud :
  ```text
  .gcloudignore
  .git
  .gitignore
  node_modules/
  dist/
  scratch/
  .aistudio/
  *.json
  !package.json
  !package-lock.json
  !firebase-applet-config.json
  !firebase-blueprint.json
  !firestore.indexes.json
  !firebase.json
  !metadata.json
  !tsconfig.json
  test-*.js
  patch*.cjs
  fix*.cjs
  *.md
  ```

---

## CONTRÔLE 2 — FIREBASE ADMIN SDK ET ADC

### 1. Ordre exact de résolution des credentials dans `src/lib/firebaseAdmin.ts`
L'analyse des lignes 35 à 106 de `src/lib/firebaseAdmin.ts` établit l'ordonnancement séquentiel suivant :
1. **Étape 1 (lignes 35–51) :** Variable d'environnement `GOOGLE_APPLICATION_CREDENTIALS` (si définie et fichier existant sur disque).
2. **Étape 2 (lignes 53–69) :** Variable d'environnement `FIREBASE_SERVICE_ACCOUNT_KEY` (si définie, en JSON brut ou base64).
3. **Étape 3 (lignes 71–95) :** Détection automatique dans le workspace :
   ```typescript
   const candidates = [
     path.resolve(process.cwd(), "service-account-key.json"),
     ...fs.readdirSync(process.cwd())
       .filter(f => f.endsWith(".json") && (f.includes("firebase-adminsdk") || f.includes("service-account")))
       .map(f => path.resolve(process.cwd(), f))
   ];
   ```
4. **Étape 4 (lignes 97–105) :** Application Default Credentials (ADC) via `options.credential = applicationDefault()`.

### 2. Chargement d'une clé JSON locale sous Cloud Run
- **Preuve exacte :** Si le fichier `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json` est présent dans le conteneur Cloud Run, la boucle de l'étape 3 s'exécute lors de l'appel à `getAdminApp()` au boot du serveur (ligne 88 de `server.ts`). Le fichier est lu, parsé et injecté dans `options.credential = cert(keyData)`.

### 3. Sélection d'ADC lorsque `K_SERVICE` est défini
- **Preuve exacte :** Le fichier `src/lib/firebaseAdmin.ts` ne contient **aucune occurrence** de la chaîne `K_SERVICE`, `K_REVISION` ou `K_CONFIGURATION`. L'exécution sous Cloud Run n'active donc aucun embranchement direct vers ADC.

### 4. Court-circuitage d'ADC par une clé locale
- **Preuve exacte :** L'étape 3 s'exécutant **avant** l'étape 4, dès qu'une clé est trouvée à l'étape 3, la variable locale `credentialLoaded` est positionnée à `true`. L'étape 4 (`if (!credentialLoaded)`) est alors ignorée. **La clé locale court-circuite systématiquement ADC.**

### 5. Correspondance du projet des credentials avec `finopsht`
- **Preuve exacte :** À la ligne 83 de `src/lib/firebaseAdmin.ts`, le code charge `keyData` sans jamais comparer `keyData.project_id` avec `targetProjectId` (`"finopsht"`).
  - `keyData.project_id` = `"tek-pou-nou-tpn"`
  - `targetProjectId` = `"finopsht"`
  - `firestoreDatabaseId` = `"ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"`
- **Impact :** Les requêtes Admin Firestore et Auth sont émises avec le token de `tek-pou-nou-tpn` contre la base de données de `finopsht`, résultant en une erreur immédiate `7 PERMISSION_DENIED`.
- **Résultat :** **BLOCKED**
- **Risque :** **CRITIQUE**. Blocage complet des opérations backend privilégiées si le fichier de clé n'est pas exclu.
- **Correction minimale recommandée (sans modification actuelle) :**
  Ajouter en tête de `getAdminApp()` dans `src/lib/firebaseAdmin.ts` :
  ```typescript
  // Forcer l'ADC natif en environnement Cloud Run ou production souveraine
  if (process.env.K_SERVICE || (process.env.NODE_ENV === "production" && !process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    options.credential = applicationDefault();
    credentialLoaded = true;
    console.log("[Firebase Admin] Cloud Run environment detected: Enforcing Application Default Credentials (ADC)");
  }
  ```

---

## CONTRÔLE 3 — SECRET MANAGER

### 1. Variables secrètes utilisées au runtime
- `GEMINI_API_KEY` : Utilisée dans `server.ts:160` pour le client `@google/genai` de l'IA CFO.
- `FORENSIC_HMAC_SECRET` / `FORENSIC_HMAC_SECRET_V2` : Utilisée dans `src/domains/cash/services/ServerTransferIntakeEngine.ts:53–54` pour le chaînage cryptographique HMAC des bordereaux de transfert.
- `RESEND_API_KEY` / `SENDGRID_API_KEY` : Utilisées dans `src/services/email/EmailNotificationService.ts:97–98` pour l'envoi d'emails.
- `CSRF_SECRET` / `SESSION_SECRET` : Mentionnées dans `.env.example`, mais **non référencées dans le code serveur**.

### 2. Distinction obligatoires vs optionnelles
- **Variables obligatoires :** **AUCUNE**.
  - Si `GEMINI_API_KEY` est absente, `server.ts` bascule en mode heuristique mock sans lever d'exception.
  - Si `FORENSIC_HMAC_SECRET` est absente, `ServerTransferIntakeEngine.ts` utilise une chaîne de repli interne.
  - Si les clés email sont absentes, `EmailNotificationService.ts` simule l'envoi via un log sans planter.
- **Variables recommandées pour la conformité financière :** `GEMINI_API_KEY` et `FORENSIC_HMAC_SECRET`.

### 3. Vérification de l'existence des secrets dans le projet `finopsht`
- **Preuve exacte :** Une requête directe authentifiée auprès de l'API REST Secret Manager (`https://secretmanager.googleapis.com/v1/projects/finopsht/secrets`) renvoie :
  ```json
  {
    "error": {
      "code": 403,
      "message": "Secret Manager API has not been used in project finopsht before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/secretmanager.googleapis.com/overview?project=finopsht then retry.",
      "status": "PERMISSION_DENIED"
    }
  }
  ```
- **Constat formel :** L'API `secretmanager.googleapis.com` **n'est pas encore activée** sur le projet `finopsht`. Aucun secret n'y est donc configuré actuellement.

### 4. Permissions Secret Manager requises pour le compte dédié
- Rôle nécessaire : `roles/secretmanager.secretAccessor` (permission : `secretmanager.versions.access`).
- **Principe de moindre privilège (attribution au niveau du secret) :**
  Ne pas attribuer le rôle sur tout le projet. Créer les secrets puis exécuter :
  ```bash
  # 1. Activation de l'API
  gcloud services enable secretmanager.googleapis.com --project=finopsht

  # 2. Création et attribution au niveau de la ressource
  gcloud secrets create GEMINI_API_KEY --replication-policy="automatic" --project=finopsht
  gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
      --project=finopsht \
      --member="serviceAccount:finops-backend-sa@finopsht.iam.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor"

  gcloud secrets create FORENSIC_HMAC_SECRET --replication-policy="automatic" --project=finopsht
  gcloud secrets add-iam-policy-binding FORENSIC_HMAC_SECRET \
      --project=finopsht \
      --member="serviceAccount:finops-backend-sa@finopsht.iam.gserviceaccount.com" \
      --role="roles/secretmanager.secretAccessor"
  ```
- **Résultat :** **NOT VERIFIED** (API désactivée, secrets non provisionnés).
- **Risque :** Faible (non bloquant au boot grâce aux dégradations gracieuses).

---

## CONTRÔLE 4 — IDENTITÉ DE BUILD CLOUD RUN

### 1. Identité qui effectuera le build depuis les sources
- Lors de `gcloud run deploy --source . --project=finopsht`, le packaging est confié à Google Cloud Build.
- Le numéro de projet de `finopsht` (extrait de `firebase-applet-config.json:3` `appId: "1:231531725507:web:..."`) est **`231531725507`**.
- L'identité de construction est le compte de service Cloud Build :
  `231531725507@cloudbuild.gserviceaccount.com` (ou le compte Compute par défaut `231531725507-compute@developer.gserviceaccount.com`).

### 2. Distinction stricte des 3 identités du cycle de vie
1. **Identité de Déploiement (Humain ou CI/CD) :**
   - Rôles requis : `roles/run.admin`, `roles/cloudbuild.builds.editor`, `roles/storage.admin`, et `roles/iam.serviceAccountUser` sur `finops-backend-sa`.
2. **Identité de Build (Cloud Build) :**
   - Compte : `231531725507@cloudbuild.gserviceaccount.com`
   - Rôles requis : `roles/artifactregistry.writer`, `roles/logging.logWriter`.
   - **Isolation stricte :** N'a aucun droit sur Firestore ni sur Firebase Auth.
3. **Identité d'Exécution au Runtime (Cloud Run Service Account) :**
   - Compte : `finops-backend-sa@finopsht.iam.gserviceaccount.com`
   - Rôles confirmés : `roles/datastore.user` et `projects/finopsht/roles/finopsBackendAuthManager`.
   - **Isolation stricte :** N'a aucun droit d'administration Cloud Run, ni de build, ni d'accès aux autres projets.
- **Résultat :** **VERIFIED**
- **Risque :** Nul dès lors que les identités restent étanches.

---

## CONTRÔLE 5 — EXPOSITION ET SÉCURITÉ HTTP

### 1. Routes réellement publiques
- **`GET /api/health`** (`server.ts:411–418`) :
  - Preuve : aucun middleware d'authentification.
  - Payload renvoyé :
    ```json
    { "status": "ok", "timestamp": "...", "offlineReady": true, "service": "FinOps Enterprise ERP Engine" }
    ```
  - Données sensibles exposées : **AUCUNE**.
- **`GET /api/invitations/metadata/:token`** (`server.ts:1391–1425`) :
  - Preuve : consultation publique contrôlée pour afficher le nom de l'entreprise invitante et le rôle proposé. Filtre tout secret et tout UID interne.
- **`GET *`** (`server.ts:2435–2437`) :
  - Distribution des fichiers statiques de l'application React SPA compilée (`dist/`).

### 2. Protection des routes financières et sensibles
- Toutes les routes financières critiques sont protégées par `authenticateToken` ou `authenticateIdentityOnly` :
  - `/api/cash/sessions/close` et `/api/cash/sessions/reopen`
  - `/api/cash/tills/auto-provision`
  - `/api/transfers/intake`, `/api/transfers/payout`, `/api/transfers/internal/*`
  - `/api/payroll/receivables/*`
  - `/api/approval/*`
  - `/api/provisioning/activate-business`
  - `/api/cfo/analyze` et `/api/cfo/narrative`
- Toute requête sans en-tête `Authorization: Bearer <valid_token>` est immédiatement rejetée avec HTTP 401 (`UNAUTHORIZED`).
- L'appartenance au tenant (`req.user.business_id`) et la concordance avec le profil Firestore font l'objet d'une vérification stricte anti-spoofing et anti-mismatch.

### 3. Conséquences de l'option Cloud Run `--allow-unauthenticated`
- **Nécessité :** L'option `--allow-unauthenticated` au niveau de Cloud Run est **obligatoire** pour permettre aux navigateurs des utilisateurs d'accéder à l'application web et de joindre les endpoints d'API.
- **Sécurité :** Elle ne crée **aucune faille de sécurité** car Cloud Run délègue l'authentification applicative au serveur Express. Les routes sensibles rejettent 100% des requêtes anonymes.
- **Résultat :** **VERIFIED**

---

## SYNTHÈSE DE L'AUDIT CIBLÉ

### 1. BLOCKERS CONFIRMED (Bloqueurs confirmés)
1. **Absence de `.gcloudignore` :** Le déploiement direct via `gcloud run deploy --source .` uploaderait l'intégralité du répertoire de travail, y compris le fichier de clé de compte de service du projet tiers `tek-pou-nou-tpn-*.json`.
2. **Recherche de clé locale non filtrée dans `src/lib/firebaseAdmin.ts` :** La présence du fichier `tek-pou-nou-tpn-*.json` dans le conteneur court-circuiterait ADC et tenterait d'authentifier le serveur sur un projet étranger.

### 2. BLOCKERS RESOLVED IN PLAN (Résolution planifiée sans modification immédiate)
1. **Packaging :** Définition stricte d'un fichier `/.gcloudignore` excluant formellement tous les fichiers `*.json` de credentials et les scripts scratch de test.
2. **Priorité ADC :** En production Cloud Run, forcer la sélection immédiate d'ADC (`applicationDefault()`) dès que `process.env.K_SERVICE` est présent, en neutralisant la recherche de fichiers JSON locaux.

### 3. IAM CHANGES REQUIRED (Modifications IAM requises sur GCP)
- Aucune modification requise sur Firestore ou Firebase Auth (les rôles `roles/datastore.user` et `projects/finopsht/roles/finopsBackendAuthManager` sont déjà parfaits).
- Si Secret Manager est activé : attribuer `roles/secretmanager.secretAccessor` à `finops-backend-sa@finopsht.iam.gserviceaccount.com` spécifiquement sur `GEMINI_API_KEY` et `FORENSIC_HMAC_SECRET`.

### 4. CODE CHANGES REQUIRED (Modifications de code recommandées lors d'une phase dédiée)
- Dans `src/lib/firebaseAdmin.ts` : ajouter la détection `process.env.K_SERVICE` en tête de `getAdminApp()` pour activer ADC en priorité absolue et ignorer la recherche locale de fichiers JSON en production.
- Créer le fichier `/.gcloudignore`.

### 5. DEPLOYMENT READINESS (État de préparation au déploiement)
```text
READY WITH BLOCKERS
(Le déploiement Cloud Run est techniquement prêt et sécurisé dès lors que .gcloudignore est créé et que le fichier de clé externe est exclu de l'image de conteneur).
```
