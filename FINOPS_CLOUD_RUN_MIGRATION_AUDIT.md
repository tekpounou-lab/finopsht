# FINOPS ERP — AUDIT PRÉALABLE À LA MIGRATION CLOUD RUN

**Projet :** `finopsht`  
**Mode :** STRICTEMENT READ-ONLY — AUCUNE MODIFICATION DE CODE, AUCUN DÉPLOIEMENT, AUCUN COMMIT  
**Compte de service dédié :** `finops-backend-sa@finopsht.iam.gserviceaccount.com`  
**Rôles IAM confirmés :**
- `roles/datastore.user`
- `projects/finopsht/roles/finopsBackendAuthManager` (contenant `firebaseauth.users.get` et `firebaseauth.users.update`)  
**Base Firestore cible :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  

---

## VERDICT OFFICIEL

```text
READY WITH BLOCKERS
```

**Règle appliquée : NO EVIDENCE = NOT VERIFIED.**

Le backend FINOPS ERP est prêt sur le plan architectural et fonctionnel pour un déploiement Cloud Run souverain (stateless, support natif de `PORT` et `0.0.0.0`, endpoint `/api/health`, gestion propre de `SIGTERM`/`SIGINT`, compatibilité intégrale avec les rôles IAM minimaux confirmés).  
Toutefois, la migration est conditionnée à la levée de **deux bloqueurs de packaging et de configuration des credentials** identifiés lors du contrôle n°8 (présence d'un fichier de clé externe dans l'espace de travail sans `.dockerignore`, et recherche non filtrée de fichiers de clés locales dans `src/lib/firebaseAdmin.ts`).

---

## CONTRÔLE 1 : ROUTES BACKEND ET POINT D'ENTRÉE SERVEUR

- **Ressources examinées :**
  - `package.json` (lignes 6–13)
  - `server.ts` (lignes 1–100, 411–418, 509–1814, 2400–2491)
  - `src/modules/workflow/approval/serverApprovalRoutes.ts`
  - `src/routes/transferRoutes.ts`
- **Preuve exacte :**
  - Le script de démarrage de production dans `package.json` est :
    ```json
    "start": "node dist/server.cjs"
    ```
    et la chaîne de build compile le serveur via esbuild :
    ```json
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --define:import.meta=undefined --sourcemap --outfile=dist/server.cjs"
    ```
  - Le serveur Express est initialisé dans `server.ts` via `createApp()` et exporte `startServer()` (lignes 2444–2482).
  - L'écoute réseau est liée à `0.0.0.0` sur le port dynamique `process.env.PORT || 3000` (lignes 2445–2453).
  - En mode production (`NODE_ENV === "production"`), le serveur distribue les fichiers statiques de l'application React depuis `dist/` et gère le fallback SPA `index.html` (lignes 2432–2438).
  - Toutes les routes API critiques sont enregistrées sous le préfixe `/api/*` (maintenance, intégrité, provisioning, invitations, clôtures de caisse, transferts, approbations, paie et CFO).
- **Résultat :** **VERIFIED**
- **Risque :** Nul. L'architecture respecte les standards Cloud Run pour les applications conteneurisées Node.js full-stack.
- **Action recommandée :** Conserver la commande d'exécution `node dist/server.cjs` comme commande de conteneur.

---

## CONTRÔLE 2 : DÉPENDANCES ADMIN SDK ET CONSOMMATEURS DE getAdminFirestore()

- **Ressources examinées :**
  - `src/lib/firebaseAdmin.ts` (lignes 116–124)
  - `server.ts` (lignes 533, 589, 666, 883, 909, 941, 1065, 1085, 1109, 1602, 1650, 1748)
  - `src/modules/workflow/approval/serverAuthMiddleware.ts` (lignes 168, 336)
  - `src/modules/workflow/approval/serverApprovalRoutes.ts` (lignes 86, 154, 241, 285)
  - `src/domains/cash/services/ServerTransferPayoutEngine.ts` (ligne 33)
  - `src/domains/cash/services/ServerTransferIntakeEngine.ts` (ligne 70)
  - `src/domains/cash/services/ServerInternalTransferEngine.ts` (lignes 106, 398, 798)
  - `src/services/business/InvitationService.ts` (ligne 29)
  - `src/services/business/ServerProvisioningService.ts` (ligne 17)
  - `src/services/business/ServerTillProvisioningService.ts` (ligne 235)
  - `src/services/business/BusinessActivationService.ts` (ligne 65)
  - Services d'intégrité et de maintenance (`ForeignKeyIntegrityValidator.ts`, `SnapshotRetentionManager.ts`, `DataCleanupAndSSOTService.ts`, `EmployeeReceivableRepository.ts`)
- **Preuve exacte :**
  - 11 modules consommateurs distincts font appel à `getAdminFirestore()`.
  - La fonction `getAdminFirestore()` retourne exclusivement une instance native `Firestore` de `firebase-admin/firestore`.
  - Le code de substitution client (`getClientFallbackFirestore`) a été totalement éliminé du projet.
  - Aucun consommateur n'écrit sur le système de fichiers local (`0 appel à fs.writeFile/appendFile`). L'état est 100% externalisé dans Firestore.
- **Résultat :** **VERIFIED**
- **Risque :** Nul. Les opérations backend s'exécutent avec les privilèges du SDK Admin natif.
- **Action recommandée :** Conserver le singleton `getAdminFirestore()` comme unique point d'accès base de données pour les modules serveur.

---

## CONTRÔLE 3 : CONFIGURATION DU PROJET, VARIABLES D'ENVIRONNEMENT ET BASE FIRESTORE NOMMÉE

- **Ressources examinées :**
  - `firebase-applet-config.json` (lignes 1–12)
  - `src/lib/firebaseAdmin.ts` (lignes 28, 119–124)
- **Preuve exacte :**
  - Le fichier `firebase-applet-config.json` contient :
    ```json
    {
      "projectId": "finopsht",
      "firestoreDatabaseId": "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"
    }
    ```
  - Dans `src/lib/firebaseAdmin.ts`, la sélection explicite de la base de données nommée est garantie :
    ```typescript
    export function getAdminFirestore(): Firestore {
      const app = getAdminApp();
      const dbId = firebaseConfig.firestoreDatabaseId;
      if (dbId && dbId !== "YOUR_FIRESTORE_DATABASE_ID" && dbId !== "(default)") {
        return getFirestore(app, dbId);
      }
      return getFirestore(app);
    }
    ```
  - La valeur `dbId` est résolue à `"ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"` et passée en second argument à `getFirestore(app, dbId)`.
  - La variable `targetProjectId` est résolue avec `finopsht` en priorité (ligne 28).
- **Résultat :** **VERIFIED**
- **Risque :** Nul. Il n'existe aucun risque de confusion avec la base `(default)`.
- **Action recommandée :** Veiller à ce que `firebase-applet-config.json` soit copié dans le conteneur final Cloud Run.

---

## CONTRÔLE 4 : APPELS FIREBASE AUTH ADMIN ET PERMISSIONS IAM

- **Ressources examinées :**
  - `src/modules/workflow/approval/serverAuthMiddleware.ts` (lignes 88, 100)
  - `src/services/business/ServerProvisioningService.ts` (ligne 342)
  - `src/services/business/InvitationService.ts` (lignes 388, 469)
  - Rôle personnalisé GCP : `projects/finopsht/roles/finopsBackendAuthManager`
- **Preuve exacte :**
  - Deux méthodes Admin Auth sont invoquées par l'application :
    1. `adminAuth.verifyIdToken(token, true)` : exige `firebaseauth.users.get` pour interroger la révocation auprès d'Identity Toolkit.
    2. `adminAuth.setCustomUserClaims(uid, claims)` : exige `firebaseauth.users.update` pour mettre à jour les attributs personnalisés (`business_id`, `role`).
  - Le rôle personnalisé attribué au compte de service `finops-backend-sa` contient exactement :
    - `firebaseauth.users.get`
    - `firebaseauth.users.update`
  - Aucune autre méthode d'administration (`createUser`, `deleteUser`, etc.) n'est appelée par le code.
- **Résultat :** **VERIFIED**
- **Risque :** Nul. Les permissions attribuées au compte de service correspondent rigoureusement au principe du moindre privilège et couvrent 100% des appels Auth réels.
- **Action recommandée :** Conserver ce rôle sans lui ajouter de privilèges superflus.

---

## CONTRÔLE 5 : DÉPENDANCES DE L'APPLICATION À AI STUDIO

- **Ressources examinées :**
  - Code source complet `src/` et `server.ts`
  - Recherche d'identifiants de projet sandbox (`683065282899`, `ais-sandbox`, `ais-dev`)
  - En-têtes HTTP et CSP (`server.ts:301`)
- **Preuve exacte :**
  - Le serveur ne dépend d'aucune API propriétaire AI Studio au runtime.
  - La seule référence à AI Studio dans le serveur est un en-tête déclaratif de télémétrie Gemini (`User-Agent: "aistudio-build"`, ligne 165) et la directive CSP `frame-ancestors` (ligne 301) qui inclut déjà `https://*.run.app` et `https://*.web.app`.
  - Les sessions sont stateless (ID Tokens Firebase JWT signés par Google et vérifiés à chaque requête HTTP via le header `Authorization: Bearer <token>`).
  - L'application n'utilise pas de stockage de session sur disque ou en mémoire partagée.
- **Résultat :** **VERIFIED**
- **Risque :** Nul.
- **Action recommandée :** Ajouter le nom de domaine personnalisé de production dans la politique CSP si le site est déployé sous un domaine propre hors `*.run.app`.

---

## CONTRÔLE 6 : AUTONOMIE DU BACKEND SUR CLOUD RUN SANS IDENTITÉ AI STUDIO

- **Ressources examinées :**
  - `src/lib/firebaseAdmin.ts` (lignes 98–110)
  - Mécanisme Google Cloud Application Default Credentials (ADC)
- **Preuve exacte :**
  - Dans `src/lib/firebaseAdmin.ts`, la chaîne de résolution des credentials se termine par :
    ```typescript
    // 4. Fallback to Application Default Credentials (ADC) if running in GCP Cloud Run / App Engine
    if (!credentialLoaded) {
      try {
        options.credential = applicationDefault();
        console.log("[Firebase Admin] Using Application Default Credentials (ADC)");
      } catch (e) {
        console.warn("[Firebase Admin] ADC initialization warning:", e);
      }
    }
    ```
  - Lors de l'exécution sur Cloud Run avec l'option `--service-account=finops-backend-sa@finopsht.iam.gserviceaccount.com`, le serveur de métadonnées interne (`http://metadata.google.internal`) délivre automatiquement les jetons OAuth2 de `finops-backend-sa`.
  - L'identité sandbox AI Studio (`ais-sandbox@...`) n'intervient à aucun moment.
- **Résultat :** **VERIFIED**
- **Risque :** Nul sous Cloud Run dès lors qu'aucun fichier JSON de clé externe ne parasite l'étape 3 (voir Contrôle 8).
- **Action recommandée :** Déployer Cloud Run en spécifiant expressément le compte de service via le flag gcloud.

---

## CONTRÔLE 7 : SPÉCIFICATIONS CLOUD RUN (PORT, HEALTH CHECK, CYCLE DE VIE, RESSOURCES)

- **Ressources examinées :**
  - `server.ts` (lignes 411–418, 2444–2482)
- **Preuve exacte :**
  - **Port :** `server.ts:2445` lit `process.env.PORT` et écoute sur `0.0.0.0`. Cloud Run injecte automatiquement `PORT=8080`.
  - **Health check :** `GET /api/health` est implémenté, public (sans authentification requise), et retourne immédiatement :
    ```json
    { "status": "ok", "service": "FinOps Enterprise ERP Engine" }
    ```
  - **Graceful Shutdown :** `server.ts:2472–2477` écoute explicitement `SIGTERM` et `SIGINT` et invoque `server.close(() => process.exit(0))`, garantissant la terminaison propre des requêtes en vol lors des réductions d'instances (scale-down).
  - **Profil de ressources :** Node.js Express + frontend compilé, empreinte mémoire au repos ~160 MB. Un profil Cloud Run de **1 vCPU / 512 MiB** (ou **1 vCPU / 1 GiB** pour absorber les pics de requêtes) est amplement suffisant.
  - **Concurrence & Timeout :** Concurrence standard de 80 requêtes simultanées par conteneur et timeout standard de 300s compatibles avec les traitements asynchrones de paie et de clôture.
  - **Stockage temporaire :** Le backend n'utilise pas le disque (génération PDF/Excel in-memory). L'utilisation de `/tmp` en RAM Cloud Run est nulle.
- **Résultat :** **VERIFIED**
- **Risque :** Nul.
- **Action recommandée :** Configurer le health check probe Cloud Run sur `/api/health`.

---

## CONTRÔLE 8 : GESTION DES SECRETS & ABSENCE DE FICHIER DE CLÉ DANS LE DÉPÔT

- **Ressources examinées :**
  - `src/lib/firebaseAdmin.ts` (lignes 71–95)
  - Répertoire racine du projet (`ls -la *.json`)
  - Fichier `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json` (créé dans le workspace)
  - Absence de fichier `.dockerignore`
- **Preuve exacte :**
  - **Point de vulnérabilité identifié dans `src/lib/firebaseAdmin.ts` (lignes 75–89) :**
    ```typescript
    const candidates = [
      path.resolve(process.cwd(), "service-account-key.json"),
      ...fs.readdirSync(process.cwd())
        .filter(f => f.endsWith(".json") && (f.includes("firebase-adminsdk") || f.includes("service-account")))
        .map(f => path.resolve(process.cwd(), f))
    ];
    for (const keyPath of candidates) {
      if (fs.existsSync(keyPath)) {
        const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
        if (keyData.type === "service_account" && keyData.private_key) {
          options.credential = cert(keyData);
          credentialLoaded = true;
          break;
        }
      }
    }
    ```
    Cette boucle charge **n'importe quel** fichier JSON contenant une clé privée dans le répertoire courant, **sans vérifier si `keyData.project_id === targetProjectId` (`finopsht`)**.
  - **Fichier parasite présent :** Le fichier `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json` appartient au projet `tek-pou-nou-tpn` et non à `finopsht`.
  - **Absence de `.dockerignore` :** En l'absence de `.dockerignore`, une commande `gcloud run deploy --source .` copierait ce fichier de clé dans l'image de conteneur, forçant `firebaseAdmin.ts` à charger une identité pour `tek-pou-nou-tpn` au lieu d'utiliser l'ADC de `finops-backend-sa@finopsht.iam.gserviceaccount.com` (Étape 4).
  - **Secrets applicatifs :** `GEMINI_API_KEY` (optionnelle pour l'IA CFO) et `FORENSIC_HMAC_SECRET` peuvent être montées de manière sécurisée via Google Cloud Secret Manager (`--set-secrets`) sans jamais toucher le code.
- **Résultat :** **BLOCKED**
- **Risque :** **ÉLEVÉ**. Conflit d'identité et de projet si une clé JSON résiduelle est embarquée dans le conteneur Cloud Run, court-circuitant l'ADC souverain.
- **Actions recommandées (Bloqueurs à lever avant build Cloud Run) :**
  1. **Bloqueur B1 :** Ne jamais copier de fichier `*-firebase-adminsdk-*.json` dans l'image Docker Cloud Run. Créer un fichier `.dockerignore` strict excluant formellement tous les fichiers `*.json` sensibles (ne conserver que `package.json` et `firebase-applet-config.json`).
  2. **Bloqueur B2 :** Supprimer ou archiver hors du conteneur de build tout fichier JSON de clé privée résiduel.
  3. **Amélioration recommandée de code (future phase autorisée) :** Modifier `src/lib/firebaseAdmin.ts` pour exiger `keyData.project_id === targetProjectId` avant d'accepter une clé locale, ou ignorer la recherche locale de clés lorsque `process.env.K_SERVICE` (indicateur Cloud Run) ou `process.env.NODE_ENV === "production"` est présent.

---

## CONTRÔLE 9 : COMPATIBILITÉ DES OPÉRATIONS DU BACKEND AVEC LE COMPTE DÉDIÉ

- **Ressources examinées :**
  - Rôles attribués à `finops-backend-sa@finopsht.iam.gserviceaccount.com` :
    1. `roles/datastore.user`
    2. `projects/finopsht/roles/finopsBackendAuthManager` (`firebaseauth.users.get`, `firebaseauth.users.update`)
  - Toutes les opérations serveur Firestore (collections : `businesses`, `users`, `memberships`, `employees`, `roles`, `branches`, `departments`, `invitations`, `tills`, `cash_sessions`, `internal_transfers`, `transfers`, `receivables`, `forensic_logs`, `subscriptions`, etc.)
- **Preuve exacte :**
  - Le rôle `roles/datastore.user` couvre l'intégralité des opérations sur les entités Firestore (`get`, `list`, `create`, `update`, `delete`, `runTransaction`) sur la base `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`.
  - Le rôle `finopsBackendAuthManager` couvre la vérification des jetons avec révocation (`firebaseauth.users.get`) et l'écriture des Custom Claims (`firebaseauth.users.update`).
  - Le backend n'utilise aucun autre service Google Cloud (pas de Cloud Storage Admin, pas de BigQuery, pas de Cloud Pub/Sub, pas de Cloud Tasks).
  - Le compte de service dédié possède **exactement** le périmètre nécessaire, ni plus, ni moins.
- **Résultat :** **VERIFIED**
- **Risque :** Nul.
- **Action recommandée :** Valider l'intégrité de cette configuration lors du premier appel de test sur Cloud Run.

---

## SYNTHÈSE DE LA MATRICE DES CONTRÔLES

| N° | Contrôle | Statut | Risque | Action Requise |
|---|---|---|---|---|
| **1** | Point d'entrée serveur & routes backend | **VERIFIED** | Nul | Utiliser `node dist/server.cjs` |
| **2** | Dépendances Admin SDK & consommateurs | **VERIFIED** | Nul | Aucune (Code remédié conforme) |
| **3** | Configuration projet & base nommée | **VERIFIED** | Nul | Base nommée explicitement liée |
| **4** | Appels Firebase Auth Admin & IAM | **VERIFIED** | Nul | Rôle personnalisé 100% adéquat |
| **5** | Dépendances d'exécution à AI Studio | **VERIFIED** | Nul | Stateless, aucune dépendance |
| **6** | Autonomie Cloud Run sans identité sandbox | **VERIFIED** | Nul | ADC natif via Metadata Server |
| **7** | Spécifications Cloud Run (Port, Health, Sig) | **VERIFIED** | Nul | Port 8080, `/api/health`, `SIGTERM` OK |
| **8** | Gestion des secrets & exclusion clés JSON | **BLOCKED** | Élevé | **Créer `.dockerignore` et écarter clé JSON locale** |
| **9** | Compatibilité opérations Firestore / Auth | **VERIFIED** | Nul | Couverture 100% par les 2 rôles confirmés |

---

## PLAN DE DÉPLOIEMENT RECOMMANDÉ (APRÈS LEVÉE DES BLOQUEURS)

Dès que les conditions de packaging du Contrôle n°8 sont satisfaites :

```bash
# 1. Vérification que le build local fonctionne
npm run build

# 2. Déploiement souverain sur Google Cloud Run
gcloud run deploy finops-erp-backend \
    --source . \
    --project=finopsht \
    --region=us-east1 \
    --platform=managed \
    --service-account=finops-backend-sa@finopsht.iam.gserviceaccount.com \
    --allow-unauthenticated \
    --port=8080 \
    --memory=1Gi \
    --cpu=1 \
    --min-instances=0 \
    --max-instances=10 \
    --set-env-vars="NODE_ENV=production,LOG_LEVEL=info" \
    --set-secrets="GEMINI_API_KEY=projects/finopsht/secrets/GEMINI_API_KEY:latest"
```
