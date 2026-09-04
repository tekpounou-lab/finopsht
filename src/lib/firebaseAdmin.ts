import { initializeApp, getApp, getApps, cert, applicationDefault, AppOptions, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import firebaseConfig from "../../firebase-applet-config.json";

// Ensure environment variables from .env.local and .env are loaded
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

let adminApp: App | null = null;

/**
 * Returns the initialized Firebase Admin App instance.
 * Automatically resolves credentials in the following order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 2. FIREBASE_SERVICE_ACCOUNT_KEY (raw JSON or base64)
 * 3. Local service account JSON files in workspace (service-account-key.json, *-firebase-adminsdk-*.json)
 * 4. Google Cloud Application Default Credentials (ADC)
 */
export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const targetProjectId = firebaseConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT || "tek-pou-nou-tpn";
  const options: AppOptions = {
    projectId: targetProjectId,
  };

  let credentialLoaded = false;

  // 1. Check GOOGLE_APPLICATION_CREDENTIALS env var
  const envCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envCredPath) {
    const resolvedPath = path.isAbsolute(envCredPath) ? envCredPath : path.resolve(process.cwd(), envCredPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const keyData = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
        if (keyData.type === "service_account" && keyData.private_key) {
          options.credential = cert(keyData);
          credentialLoaded = true;
          console.log(`[Firebase Admin] Loaded credentials from GOOGLE_APPLICATION_CREDENTIALS: ${resolvedPath}`);
        }
      } catch (err) {
        console.warn(`[Firebase Admin] Failed reading GOOGLE_APPLICATION_CREDENTIALS file ${resolvedPath}:`, err);
      }
    }
  }

  // 2. Check FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON string or base64)
  if (!credentialLoaded && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (!raw.startsWith("{")) {
        raw = Buffer.from(raw, "base64").toString("utf-8");
      }
      const keyData = JSON.parse(raw);
      if (keyData.type === "service_account" && keyData.private_key) {
        options.credential = cert(keyData);
        credentialLoaded = true;
        console.log("[Firebase Admin] Loaded credentials from FIREBASE_SERVICE_ACCOUNT_KEY env variable");
      }
    } catch (err) {
      console.warn("[Firebase Admin] Failed parsing FIREBASE_SERVICE_ACCOUNT_KEY env var:", err);
    }
  }

  // 3. Check for local workspace service account files
  if (!credentialLoaded) {
    const candidates = [
      path.resolve(process.cwd(), "service-account-key.json"),
      path.resolve(process.cwd(), "tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json"),
      ...fs.readdirSync(process.cwd())
        .filter(f => f.endsWith(".json") && (f.includes("firebase-adminsdk") || f.includes("service-account")))
        .map(f => path.resolve(process.cwd(), f))
    ];

    for (const keyPath of candidates) {
      if (fs.existsSync(keyPath)) {
        try {
          const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
          if (keyData.type === "service_account" && keyData.private_key) {
            options.credential = cert(keyData);
            credentialLoaded = true;
            console.log(`[Firebase Admin] Loaded service account credential from: ${path.basename(keyPath)}`);
            break;
          }
        } catch (err) {
          console.warn(`[Firebase Admin] Could not parse key file ${keyPath}:`, err);
        }
      }
    }
  }

  // 4. Fallback to Application Default Credentials (ADC) if running in GCP Cloud Run / App Engine
  if (!credentialLoaded) {
    try {
      options.credential = applicationDefault();
      console.log("[Firebase Admin] Using Application Default Credentials (ADC)");
    } catch (e) {
      console.warn("[Firebase Admin] ADC initialization warning:", e);
    }
  }

  adminApp = initializeApp(options);
  console.log(`[Firebase Admin] App initialized successfully for project: ${targetProjectId}`);
  return adminApp;
}

/**
 * Returns the Firestore Admin instance bound to the target project and database.
 */
export function getAdminFirestore(): Firestore {
  const app = getAdminApp();
  const dbId = firebaseConfig.firestoreDatabaseId;
  try {
    if (dbId && dbId !== "YOUR_FIRESTORE_DATABASE_ID" && dbId !== "(default)") {
      return getFirestore(app, dbId);
    }
    return getFirestore(app);
  } catch (e) {
    console.warn("[Firebase Admin] Custom database binding fallback:", e);
    return getFirestore(app);
  }
}

/**
 * Returns the Auth Admin instance.
 */
export function getAdminAuth(): Auth {
  const app = getAdminApp();
  return getAuth(app);
}
