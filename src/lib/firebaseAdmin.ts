import {
  initializeApp,
  getApp,
  getApps,
  cert,
  applicationDefault,
  AppOptions,
  App
} from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Ensure environment variables from .env.local and .env are loaded in local dev
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

export interface FirebaseAdminResolutionResult {
  projectId: string;
  firestoreDatabaseId?: string;
  runtime: "cloud_run" | "vercel" | "local";
  credentialSource:
    | "cloud_run_adc"
    | "env_split_key"
    | "google_application_credentials"
    | "service_account_json_env"
    | "local_key_file"
    | "local_adc_fallback";
  options: AppOptions;
}

const DEFAULT_PROJECT_ID = "finopsht";
const DEFAULT_FIRESTORE_DATABASE_ID =
  "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a";

let cachedAppletConfig: FirebaseAppletConfig | null = null;
let adminApp: App | null = null;

/**
 * Dynamically reads firebase-applet-config.json without ESM static JSON imports
 * (required for Node 22 ESM compatibility and CJS server bundling).
 */
export function readFirebaseAppletConfig(): FirebaseAppletConfig {
  if (cachedAppletConfig) {
    return cachedAppletConfig;
  }

  const candidatePaths = [
    path.resolve(process.cwd(), "firebase-applet-config.json"),
    typeof __dirname !== "undefined"
      ? path.resolve(__dirname, "firebase-applet-config.json")
      : "",
    typeof __dirname !== "undefined"
      ? path.resolve(__dirname, "../firebase-applet-config.json")
      : "",
    typeof __dirname !== "undefined"
      ? path.resolve(__dirname, "../../firebase-applet-config.json")
      : ""
  ].filter(Boolean);

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf-8"));
        cachedAppletConfig = {
          projectId: typeof parsed?.projectId === "string" ? parsed.projectId.trim() : undefined,
          firestoreDatabaseId:
            typeof parsed?.firestoreDatabaseId === "string"
              ? parsed.firestoreDatabaseId.trim()
              : undefined
        };
        return cachedAppletConfig;
      }
    } catch {
      // Continue trying fallback paths
    }
  }

  cachedAppletConfig = {
    projectId: DEFAULT_PROJECT_ID,
    firestoreDatabaseId: DEFAULT_FIRESTORE_DATABASE_ID
  };
  return cachedAppletConfig;
}

/**
 * Normalizes PEM private keys stored in Vercel / dotenv environments
 * where newlines are escaped as literal `\n` sequences.
 */
export function normalizeAdminPrivateKey(rawKey: string): string {
  let normalized = rawKey.trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  normalized = normalized.replace(/\\n/g, "\n");
  return normalized;
}

/**
 * Resolves Firebase Admin SDK AppOptions across Cloud Run, Vercel, and Local runtimes.
 * Never logs or exposes private keys or sensitive secrets in errors.
 */
export function resolveFirebaseAdminConfig(
  env: NodeJS.ProcessEnv = process.env
): FirebaseAdminResolutionResult {
  const firebaseConfig = readFirebaseAppletConfig();
  const targetProjectId =
    firebaseConfig.projectId || env.GOOGLE_CLOUD_PROJECT || DEFAULT_PROJECT_ID;
  const firestoreDatabaseId =
    firebaseConfig.firestoreDatabaseId || DEFAULT_FIRESTORE_DATABASE_ID;

  const explicitAdminProjectId = env.FIREBASE_ADMIN_PROJECT_ID?.trim();
  if (explicitAdminProjectId && explicitAdminProjectId !== targetProjectId) {
    throw new Error(
      `FIREBASE_ADMIN_PROJECT_MISMATCH: Configured FIREBASE_ADMIN_PROJECT_ID (${explicitAdminProjectId}) does not match target Firebase project (${targetProjectId}).`
    );
  }

  const isCloudRun = Boolean(env.K_SERVICE) && !String(env.K_SERVICE).startsWith("ais-");
  const isVercel = env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
  const runtime: "cloud_run" | "vercel" | "local" = isCloudRun
    ? "cloud_run"
    : isVercel
    ? "vercel"
    : "local";

  const options: AppOptions = {
    projectId: targetProjectId
  };

  // 0. Cloud Run: strictly enforce Application Default Credentials (ADC)
  if (isCloudRun) {
    try {
      options.credential = applicationDefault();
    } catch (err: any) {
      throw new Error(
        `ADC_INITIALIZATION_FAILED: Cloud Run runtime failed to load Application Default Credentials for project ${targetProjectId}.`
      );
    }
    return {
      projectId: targetProjectId,
      firestoreDatabaseId,
      runtime,
      credentialSource: "cloud_run_adc",
      options
    };
  }

  // 1. Explicit split environment variables (documented Vercel standard)
  const rawClientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
  const rawPrivateKey = env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (rawClientEmail || rawPrivateKey) {
    if (!rawClientEmail || !rawPrivateKey) {
      throw new Error(
        "FIREBASE_ADMIN_INCOMPLETE_ENV: Both FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY must be configured together."
      );
    }
    const normalizedPrivateKey = normalizeAdminPrivateKey(rawPrivateKey);
    if (
      !normalizedPrivateKey.includes("-----BEGIN") ||
      !normalizedPrivateKey.includes("PRIVATE KEY-----")
    ) {
      throw new Error(
        "FIREBASE_ADMIN_INVALID_KEY_FORMAT: FIREBASE_ADMIN_PRIVATE_KEY does not appear to be a valid PEM private key."
      );
    }
    options.credential = cert({
      projectId: targetProjectId,
      clientEmail: rawClientEmail,
      privateKey: normalizedPrivateKey
    });
    return {
      projectId: targetProjectId,
      firestoreDatabaseId,
      runtime,
      credentialSource: "env_split_key",
      options
    };
  }

  // 2. GOOGLE_APPLICATION_CREDENTIALS file path (local / container dev)
  const envCredPath = env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envCredPath) {
    const resolvedPath = path.isAbsolute(envCredPath)
      ? envCredPath
      : path.resolve(process.cwd(), envCredPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const keyData = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));
        if (keyData.type === "service_account" && keyData.private_key) {
          if (keyData.project_id && keyData.project_id !== targetProjectId) {
            console.warn(
              `[Firebase Admin] Skipping GOOGLE_APPLICATION_CREDENTIALS file: project_id mismatch (${keyData.project_id} !== ${targetProjectId})`
            );
          } else {
            keyData.private_key = normalizeAdminPrivateKey(String(keyData.private_key));
            options.credential = cert(keyData);
            return {
              projectId: targetProjectId,
              firestoreDatabaseId,
              runtime,
              credentialSource: "google_application_credentials",
              options
            };
          }
        }
      } catch {
        console.warn(`[Firebase Admin] Failed reading GOOGLE_APPLICATION_CREDENTIALS file.`);
      }
    }
  }

  // 3. FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON or base64 JSON)
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      let raw = env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (!raw.startsWith("{")) {
        raw = Buffer.from(raw, "base64").toString("utf-8");
      }
      const keyData = JSON.parse(raw);
      if (keyData.type === "service_account" && keyData.private_key) {
        if (keyData.project_id && keyData.project_id !== targetProjectId) {
          throw new Error(
            `FIREBASE_ADMIN_PROJECT_MISMATCH: Service account key project (${keyData.project_id}) does not match target project (${targetProjectId}).`
          );
        }
        keyData.private_key = normalizeAdminPrivateKey(String(keyData.private_key));
        options.credential = cert(keyData);
        return {
          projectId: targetProjectId,
          firestoreDatabaseId,
          runtime,
          credentialSource: "service_account_json_env",
          options
        };
      }
    } catch (err: any) {
      if (String(err?.message || "").startsWith("FIREBASE_ADMIN_PROJECT_MISMATCH")) {
        throw err;
      }
      if (isVercel) {
        throw new Error(
          "FIREBASE_ADMIN_INVALID_SERVICE_ACCOUNT_KEY: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON or base64 payload."
        );
      }
      console.warn("[Firebase Admin] Failed parsing FIREBASE_SERVICE_ACCOUNT_KEY env var.");
    }
  }

  // 4. Fail fast on Vercel if no explicit credentials are present (avoid hanging on GCP metadata server)
  if (isVercel) {
    throw new Error(
      "FIREBASE_ADMIN_NOT_CONFIGURED: Firebase Admin credentials are missing in Vercel runtime. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_KEY)."
    );
  }

  // 5. Local workspace service account files (local dev only)
  try {
    const candidates = [
      path.resolve(process.cwd(), "service-account-key.json"),
      ...fs
        .readdirSync(process.cwd())
        .filter(
          (f) =>
            f.endsWith(".json") &&
            (f.includes("firebase-adminsdk") || f.includes("service-account"))
        )
        .map((f) => path.resolve(process.cwd(), f))
    ];

    for (const keyPath of candidates) {
      if (fs.existsSync(keyPath)) {
        try {
          const keyData = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
          if (keyData.type === "service_account" && keyData.private_key) {
            if (keyData.project_id && keyData.project_id !== targetProjectId) {
              console.warn(
                `[Firebase Admin] Skipping local key file ${path.basename(keyPath)}: project_id mismatch (${keyData.project_id} !== ${targetProjectId})`
              );
              continue;
            }
            keyData.private_key = normalizeAdminPrivateKey(String(keyData.private_key));
            options.credential = cert(keyData);
            return {
              projectId: targetProjectId,
              firestoreDatabaseId,
              runtime,
              credentialSource: "local_key_file",
              options
            };
          }
        } catch {
          console.warn(`[Firebase Admin] Could not parse local key file ${path.basename(keyPath)}.`);
        }
      }
    }
  } catch {
    // Directory scan skipped
  }

  // 6. Local fallback to Application Default Credentials (ADC)
  try {
    options.credential = applicationDefault();
  } catch (e: any) {
    console.warn("[Firebase Admin] ADC initialization warning:", e?.message || e);
  }

  return {
    projectId: targetProjectId,
    firestoreDatabaseId,
    runtime,
    credentialSource: "local_adc_fallback",
    options
  };
}

/**
 * Returns the initialized Firebase Admin App instance.
 */
export function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const resolved = resolveFirebaseAdminConfig(process.env);
  adminApp = initializeApp(resolved.options);
  console.log(
    `[Firebase Admin] App initialized (${resolved.runtime}/${resolved.credentialSource}) for project: ${resolved.projectId}`
  );
  return adminApp;
}

/**
 * Returns the Firestore Admin instance bound exclusively to the target project and database.
 * Strictly uses Firebase Admin SDK without client fallback.
 */
export function getAdminFirestore(): Firestore {
  const app = getAdminApp();
  const dbId = readFirebaseAppletConfig().firestoreDatabaseId;
  if (dbId && dbId !== "YOUR_FIRESTORE_DATABASE_ID" && dbId !== "(default)") {
    return getFirestore(app, dbId);
  }
  return getFirestore(app);
}

/**
 * Returns the Auth Admin instance.
 */
export function getAdminAuth(): Auth {
  const app = getAdminApp();
  return getAuth(app);
}
