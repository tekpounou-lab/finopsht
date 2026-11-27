# FINOPS ERP — P0 RAPPORT DE REMÉDIATION CLOUD RUN : PACKAGING ET ADC

**Date :** 11 Novembre 2026  
**Projet :** FINOPS ERP / FINAYITI FUSION  
**Projet Firebase :** `finopsht`  
**Compte de service Cloud Run :** `finops-backend-sa@finopsht.iam.gserviceaccount.com`  
**Base Firestore :** `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`  

---

## VERDICT FINAL

```text
PASS WITH BLOCKERS
```

**Justification :**
- **P0-1 (Packaging) :** `PASS`. Le fichier `/.gcloudignore` a été créé. Le fichier de clé externe `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json`, les fichiers `.env*` de secrets et les scripts de test scratch sont rigoureusement exclus du contexte de build, tout en conservant `package.json`, `package-lock.json` et les configurations déclaratives requises.
- **P0-2 (Firebase Admin ADC) :** `PASS`. `src/lib/firebaseAdmin.ts` a été durci : la présence de `process.env.K_SERVICE` force désormais l'exécution exclusive de `applicationDefault()` (ADC). Aucune clé locale ne peut court-circuiter l'ADC en production Cloud Run. Les clés locales résiduelles d'autres projets sont rejetées par validation de `targetProjectId`. En cas d'échec d'ADC sous Cloud Run, une exception explicite `ADC_INITIALIZATION_FAILED` est levée sans aucun fallback client ni fuite d'informations.
- **Bloqueurs restants (externes à la base de code locale) :** `PASS WITH BLOCKERS` en raison des prérequis d'infrastructure GCP externes non encore provisionnés sur le projet `finopsht` (API Secret Manager non activée, secrets `GEMINI_API_KEY` et `FORENSIC_HMAC_SECRET` non créés sur GCP).

---

## 1. FICHIERS MODIFIÉS ET CRÉÉS

1. **Création :** `/.gcloudignore` (Règles d'isolation de packaging Cloud Build).
2. **Modification :** `/src/lib/firebaseAdmin.ts` (Sécurisation et priorisation absolue d'ADC sur Cloud Run).
3. **Création test :** `/src/tests/unit/security/CloudRunPackagingAndAdcIntegrity.test.ts` (Suite de validation P0).

---

## 2. DIFF COMPLET DES MODIFICATIONS

### A. Création de `/.gcloudignore`
```diff
--- /dev/null
+++ .gcloudignore
@@ -0,0 +1,30 @@
+# .gcloudignore — FINOPS ERP Cloud Build Packaging Rules
+# Excludes development artifacts, local keys, and temporary files from Cloud Run build context.
+
+.gcloudignore
+.git/
+.cache/
+node_modules/
+dist/
+coverage/
+scratch/
+.aistudio/
+
+# Mandatory P0 Isolation: Service account keys and private credentials
+*-firebase-adminsdk-*.json
+service-account*.json
+tek-pou-nou-tpn-*.json
+
+# Environment variables containing secrets
+.env
+.env.*
+!.env.example
+
+# Temporary scripts and reports
+test-*.js
+patch*.cjs
+fix*.cjs
+*.log
+*.debug.log
+phase3_cleanup_report_*.json
+
+# Documentation
+/docs/
+*.md
+!README.md
```

### B. Modification de `/src/lib/firebaseAdmin.ts`
```diff
--- src/lib/firebaseAdmin.ts (antérieur)
+++ src/lib/firebaseAdmin.ts (remédié)
@@ -15,10 +15,12 @@
 /**
  * Returns the initialized Firebase Admin App instance.
- * Automatically resolves credentials in the following order:
- * 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
- * 2. FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON or base64)
- * 3. Local service account JSON files in workspace (service-account-key.json, *-firebase-adminsdk-*.json)
- * 4. Google Cloud Application Default Credentials (ADC)
+ * Automatically resolves credentials:
+ * - On Cloud Run (process.env.K_SERVICE is set): Strictly enforces Application Default Credentials (ADC).
+ * - In local development: Resolves in order:
+ *   1. GOOGLE_APPLICATION_CREDENTIALS environment variable
+ *   2. FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON or base64)
+ *   3. Local service account JSON files matching targetProjectId
+ *   4. Application Default Credentials (ADC) fallback
  */
 export function getAdminApp(): App {
   if (getApps().length > 0) {
@@ -31,6 +33,23 @@
   const options: AppOptions = {
     projectId: targetProjectId,
   };
 
+  const isCloudRun = Boolean(process.env.K_SERVICE);
+
+  // In Cloud Run (K_SERVICE is set), strictly enforce Application Default Credentials (ADC)
+  if (isCloudRun) {
+    try {
+      options.credential = applicationDefault();
+      console.log(`[Firebase Admin] Cloud Run environment detected (K_SERVICE=${process.env.K_SERVICE}): Enforcing Application Default Credentials (ADC) for project: ${targetProjectId}`);
+    } catch (err: any) {
+      console.error("[Firebase Admin] Fatal: Failed initializing Application Default Credentials (ADC) in Cloud Run:", err?.message || String(err));
+      throw new Error(`ADC_INITIALIZATION_FAILED: Cloud Run runtime failed to load Application Default Credentials for project ${targetProjectId}. Verify attached service account and IAM permissions.`);
+    }
+
+    adminApp = initializeApp(options);
+    console.log(`[Firebase Admin] App initialized successfully in Cloud Run for project: ${targetProjectId}`);
+    return adminApp;
+  }
+
   let credentialLoaded = false;
 
-  // 1. Check GOOGLE_APPLICATION_CREDENTIALS env var
+  // 1. Check GOOGLE_APPLICATION_CREDENTIALS env var (local dev only)
   const envCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
   if (envCredPath) {
     const resolvedPath = path.isAbsolute(envCredPath) ? envCredPath : path.resolve(process.cwd(), envCredPath);
@@ -42,9 +61,13 @@
       try {
         const keyData = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
         if (keyData.type === "service_account" && keyData.private_key) {
-          options.credential = cert(keyData);
-          credentialLoaded = true;
-          console.log(`[Firebase Admin] Loaded credentials from GOOGLE_APPLICATION_CREDENTIALS: ${resolvedPath}`);
+          if (keyData.project_id && keyData.project_id !== targetProjectId) {
+            console.warn(`[Firebase Admin] Skipping GOOGLE_APPLICATION_CREDENTIALS file: project_id mismatch (${keyData.project_id} !== ${targetProjectId})`);
+          } else {
+            options.credential = cert(keyData);
+            credentialLoaded = true;
+            console.log(`[Firebase Admin] Loaded credentials from GOOGLE_APPLICATION_CREDENTIALS: ${resolvedPath}`);
+          }
         }
       } catch (err) {
         console.warn(`[Firebase Admin] Failed reading GOOGLE_APPLICATION_CREDENTIALS file ${resolvedPath}:`, err);
@@ -52,7 +75,7 @@
     }
   }
 
-  // 2. Check FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON string or base64)
+  // 2. Check FIREBASE_SERVICE_ACCOUNT_KEY env var (local dev only, raw JSON string or base64)
   if (!credentialLoaded && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
     try {
       let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
@@ -60,9 +83,13 @@
       }
       const keyData = JSON.parse(raw);
       if (keyData.type === "service_account" && keyData.private_key) {
-        options.credential = cert(keyData);
-        credentialLoaded = true;
-        console.log("[Firebase Admin] Loaded credentials from FIREBASE_SERVICE_ACCOUNT_KEY env variable");
+        if (keyData.project_id && keyData.project_id !== targetProjectId) {
+          console.warn(`[Firebase Admin] Skipping FIREBASE_SERVICE_ACCOUNT_KEY: project_id mismatch (${keyData.project_id} !== ${targetProjectId})`);
+        } else {
+          options.credential = cert(keyData);
+          credentialLoaded = true;
+          console.log("[Firebase Admin] Loaded credentials from FIREBASE_SERVICE_ACCOUNT_KEY env variable");
+        }
       }
     } catch (err) {
       console.warn("[Firebase Admin] Failed parsing FIREBASE_SERVICE_ACCOUNT_KEY env var:", err);
@@ -70,7 +97,7 @@
   }
 
-  // 3. Check for local workspace service account files
+  // 3. Check for local workspace service account files (local dev only)
   if (!credentialLoaded) {
     const candidates = [
       path.resolve(process.cwd(), "service-account-key.json"),
@@ -83,6 +110,11 @@
         try {
           const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
           if (keyData.type === "service_account" && keyData.private_key) {
+            // Guard: Only load local keys if project_id matches targetProjectId
+            if (keyData.project_id && keyData.project_id !== targetProjectId) {
+              console.warn(`[Firebase Admin] Skipping local key file ${path.basename(keyPath)}: project_id mismatch (${keyData.project_id} !== ${targetProjectId})`);
+              continue;
+            }
             options.credential = cert(keyData);
             credentialLoaded = true;
             console.log(`[Firebase Admin] Loaded service account credential from: ${path.basename(keyPath)}`);
```

---

## 3. PREUVE D'EXCLUSION DU FICHIER DE CLÉ ÉTRANGÈRE DU CONTEXTE DE BUILD

1. **Nom du fichier cible étranger :** `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json`
2. **Règles d'exclusion dans `.gcloudignore` :**
   - `*-firebase-adminsdk-*.json` (exclut tous les fichiers nommés selon le format standard Firebase Admin)
   - `tek-pou-nou-tpn-*.json` (exclut spécifiquement tout fichier rattaché au projet étranger)
   - `service-account*.json` (exclut les clés de comptes de service GCP)
3. **Validation automatisée :**
   Le test unitaire `CloudRunPackagingAndAdcIntegrity.test.ts` (test 6) valide formellement par pattern matching que `tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json` est couvert et exclu par les règles de `.gcloudignore`.
4. **Préservation des fichiers requis :**
   Le test unitaire vérifie formellement que `package.json`, `package-lock.json`, `firebase-applet-config.json`, `firebase-blueprint.json`, `firestore.indexes.json`, `firebase.json`, `tsconfig.json` et `server.ts` **ne sont pas exclus**.

---

## 4. RÉSULTATS DES TESTS ET COMMANDES EXACTES

### A. Suite de tests ciblée Cloud Run & Packaging
```bash
npx vitest run src/tests/unit/security/CloudRunPackagingAndAdcIntegrity.test.ts
```
**Résultat :** 7 passed (7/7 tests) en 4.47s.
- `✓ 1. Verifies getAdminApp binds strictly to finopsht and does not load foreign project credentials`
- `✓ 2. Verifies Admin Firestore is bound to the exact named database id`
- `✓ 3. Confirms getAdminFirestore returns a native Admin Firestore instance without Client SDK proxying`
- `✓ 4. Ensures getAdminAuth returns native Firebase Admin Auth instance`
- `✓ 5. .gcloudignore exists at root and contains strict exclusion patterns for service account keys`
- `✓ 6. .gcloudignore strictly matches and excludes the foreign service account key file`
- `✓ 7. .gcloudignore does NOT exclude required configuration and source files`

### B. Suites d'intégrité Firebase Admin SDK & Claims
```bash
npx vitest run src/tests/unit/security/FirebaseAdminSdkP0Integrity.test.ts src/tests/unit/security/P0FinalHardeningInvitationClaims.test.ts
```
**Résultat :** 14 passed (14/14 tests).

### C. Suites de régression de sécurité
```bash
npx vitest run src/tests/unit/security/PhaseD1AuthMultiTenant.test.ts src/tests/unit/security/P0SecurityRemediation.test.ts src/tests/unit/security/PhaseD3TillClosureSecurityAndIntegrity.test.ts
```
**Résultat :** 62 passed (62/62 tests).
- Total des tests unitaires exécutés : **83 passed / 83 (100% SUCCÈS)**.

---

## 5. RÉSULTAT DU BUILD DE PRODUCTION

```bash
npm run build
```
**Commande exécutée :** `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --define:import.meta=undefined --sourcemap --outfile=dist/server.cjs`

**Sortie de build :**
- `dist/index.html` : 1.60 kB
- `dist/assets/*.js` et `dist/assets/*.css` : 2596 modules transformés avec succès
- `dist/server.cjs` : 135.2 kB (généré avec succès en 93ms)
- `dist/server.cjs.map` : 316.0 kB
- **Vérification linter (`tsc --noEmit`) :** 0 erreur.

---

## 6. CONFIRMATION DE RESPECT DU PÉRIMÈTRE STRICT

- **Déploiement Cloud Run :** AUCUN.
- **Commande gcloud modifiant IAM :** AUCUNE.
- **Commit ou push Git :** AUCUN.
- **Suppression de fichiers :** AUCUNE (la clé étrangère a été préservée dans l'espace local et isolée du packaging via `.gcloudignore`).
- **Règles Firestore :** AUCUNE modification.
- **Services métier (paie, transferts, caisse, comptabilité) :** AUCUNE modification.

---

## 7. BLOQUEURS RESTANTS ET RECOMMANDATIONS

Pour procéder au premier déploiement Cloud Run lorsque l'utilisateur le décidera :
1. **Activer l'API Secret Manager sur `finopsht` :**
   ```bash
   gcloud services enable secretmanager.googleapis.com --project=finopsht
   ```
2. **Créer les secrets `GEMINI_API_KEY` et `FORENSIC_HMAC_SECRET` sur `finopsht` :**
   ```bash
   gcloud secrets create GEMINI_API_KEY --replication-policy="automatic" --project=finopsht
   gcloud secrets create FORENSIC_HMAC_SECRET --replication-policy="automatic" --project=finopsht
   ```
3. **Accorder l'accès en lecture au compte de service dédié au niveau de chaque secret :**
   ```bash
   gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
       --project=finopsht \
       --member="serviceAccount:finops-backend-sa@finopsht.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"

   gcloud secrets add-iam-policy-binding FORENSIC_HMAC_SECRET \
       --project=finopsht \
       --member="serviceAccount:finops-backend-sa@finopsht.iam.gserviceaccount.com" \
       --role="roles/secretmanager.secretAccessor"
   ```
4. **Vérifier les droits du déployeur :** S'assurer que le compte déployeur dispose du rôle `roles/iam.serviceAccountUser` sur `finops-backend-sa@finopsht.iam.gserviceaccount.com`.
