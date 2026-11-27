import {
  initializeApp,
  getApp,
  getApps,
  deleteApp,
  cert,
  applicationDefault,
  AppOptions,
  App,
  Credential,
  GoogleOAuthAccessToken
} from "firebase-admin/app";
import { getFirestore as getAdminSdkFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import {
  ExternalAccountClient,
  BaseExternalAccountClient,
  GoogleAuth,
  IdentityPoolClientOptions
} from "google-auth-library";
import { Firestore as CloudFirestore } from "@google-cloud/firestore";
import { getVercelOidcToken } from "@vercel/oidc";
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

export type FirebaseCredentialSource =
  | "cloud_run_adc"
  | "vercel_wif"
  | "env_split_key"
  | "google_application_credentials"
  | "service_account_json_env"
  | "local_key_file"
  | "local_adc_fallback";

export interface VercelWifConfigSummary {
  projectNumber: string;
  poolId: string;
  providerId: string;
  serviceAccountEmail: string;
  audience: string;
  impersonationUrl: string;
}

export interface FirebaseAdminResolutionResult {
  projectId: string;
  firestoreDatabaseId?: string;
  runtime: "cloud_run" | "vercel" | "local";
  credentialSource: FirebaseCredentialSource;
  options: AppOptions;
  wifConfig?: VercelWifConfigSummary;
  wifAuthClient?: BaseExternalAccountClient;
}

export interface ResolveFirebaseAdminOptions {
  oidcTokenSupplier?: () => Promise<string>;
}

const DEFAULT_PROJECT_ID = "finopsht";
const DEFAULT_FIRESTORE_DATABASE_ID =
  "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a";

export const VERCEL_WIF_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/userinfo.email"
];

let cachedAppletConfig: FirebaseAppletConfig | null = null;
let adminApp: App | null = null;
let cachedResolvedConfig: FirebaseAdminResolutionResult | null = null;
let cachedWifFirestore: Firestore | null = null;

/**
 * Resets cached Firebase Admin state (intended strictly for isolated unit tests).
 */
export async function resetFirebaseAdminStateForTests(): Promise<void> {
  cachedAppletConfig = null;
  adminApp = null;
  cachedResolvedConfig = null;
  cachedWifFirestore = null;
  const apps = getApps();
  await Promise.all(apps.map((app) => deleteApp(app).catch(() => undefined)));
}

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
 * Validates and builds the Google ExternalAccountClient JSON configuration for Vercel OIDC WIF.
 * Never invokes the OIDC token supplier during construction.
 */
export function buildVercelWifExternalAccountConfig(
  params: {
    projectNumber: string;
    poolId: string;
    providerId: string;
    serviceAccountEmail: string;
  },
  oidcTokenSupplier?: () => Promise<string>
): {
  summary: VercelWifConfigSummary;
  externalAccountConfig: IdentityPoolClientOptions;
} {
  const projectNumber = params.projectNumber.trim();
  const poolId = params.poolId.trim();
  const providerId = params.providerId.trim();
  const serviceAccountEmail = params.serviceAccountEmail.trim();

  if (!/^\d+$/.test(projectNumber)) {
    throw new Error("FIREBASE_ADMIN_INVALID_WIF_CONFIG: GCP_PROJECT_NUMBER must be numeric.");
  }
  if (!/^[a-zA-Z0-9-]+$/.test(poolId)) {
    throw new Error(
      "FIREBASE_ADMIN_INVALID_WIF_CONFIG: GCP_WORKLOAD_IDENTITY_POOL_ID contains invalid characters."
    );
  }
  if (!/^[a-zA-Z0-9-]+$/.test(providerId)) {
    throw new Error(
      "FIREBASE_ADMIN_INVALID_WIF_CONFIG: GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID contains invalid characters."
    );
  }
  if (!/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(serviceAccountEmail)) {
    throw new Error(
      "FIREBASE_ADMIN_INVALID_WIF_CONFIG: GCP_SERVICE_ACCOUNT_EMAIL is not a valid email address."
    );
  }

  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  const impersonationUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`;
  const resolveOidcToken = oidcTokenSupplier ?? (() => getVercelOidcToken());

  const externalAccountConfig: IdentityPoolClientOptions = {
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: impersonationUrl,
    scopes: VERCEL_WIF_OAUTH_SCOPES,
    subject_token_supplier: {
      getSubjectToken: async () => {
        try {
          const oidcToken = await resolveOidcToken();
          if (!oidcToken || typeof oidcToken !== "string") {
            throw new Error(
              "VERCEL_WIF_OIDC_UNAVAILABLE: Unable to acquire Vercel OIDC token from request context."
            );
          }
          return oidcToken;
        } catch (err: any) {
          const rawMessage = typeof err?.message === "string" ? err.message : "";
          if (rawMessage.startsWith("VERCEL_WIF_OIDC_UNAVAILABLE")) {
            throw err;
          }
          throw new Error(
            "VERCEL_WIF_OIDC_UNAVAILABLE: Failed to retrieve Vercel OIDC token from runtime context."
          );
        }
      }
    }
  };

  return {
    summary: {
      projectNumber,
      poolId,
      providerId,
      serviceAccountEmail,
      audience,
      impersonationUrl
    },
    externalAccountConfig
  };
}

/**
 * Firebase Admin Credential adapter wrapping Google's BaseExternalAccountClient.
 * Maps { token } + credentials.expiry_date into Firebase Admin's { access_token, expires_in }.
 */
export class VercelWifCredential implements Credential {
  constructor(private readonly externalAccountClient: BaseExternalAccountClient) {}

  async getAccessToken(): Promise<GoogleOAuthAccessToken> {
    let tokenResponse: { token?: string | null };
    try {
      tokenResponse = await this.externalAccountClient.getAccessToken();
    } catch (err: any) {
      const code = typeof err?.code === "string" ? ` (${err.code})` : "";
      throw new Error(
        `VERCEL_WIF_TOKEN_EXCHANGE_FAILED: Failed to exchange Vercel OIDC token for impersonated Google access token${code}.`
      );
    }

    const accessToken = tokenResponse?.token;
    if (!accessToken || typeof accessToken !== "string") {
      throw new Error(
        "VERCEL_WIF_TOKEN_ERROR: ExternalAccountClient did not return a valid Google access token."
      );
    }

    const expiryDate = this.externalAccountClient.credentials?.expiry_date;
    const expiresIn =
      typeof expiryDate === "number" && Number.isFinite(expiryDate)
        ? Math.max(1, Math.ceil((expiryDate - Date.now()) / 1000))
        : 3600;

    return {
      access_token: accessToken,
      expires_in: expiresIn
    };
  }
}

function inspectVercelWifEnv(env: NodeJS.ProcessEnv): {
  complete: boolean;
  anyProvided: boolean;
  missing: string[];
  params?: {
    projectNumber: string;
    poolId: string;
    providerId: string;
    serviceAccountEmail: string;
  };
} {
  const entries = [
    ["GCP_PROJECT_NUMBER", env.GCP_PROJECT_NUMBER?.trim() || ""],
    ["GCP_WORKLOAD_IDENTITY_POOL_ID", env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim() || ""],
    [
      "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
      env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim() || ""
    ],
    ["GCP_SERVICE_ACCOUNT_EMAIL", env.GCP_SERVICE_ACCOUNT_EMAIL?.trim() || ""]
  ] as const;

  const missing = entries.filter(([, val]) => !val).map(([key]) => key);
  const anyProvided = missing.length < entries.length;
  const complete = missing.length === 0;

  if (!complete) {
    return { complete: false, anyProvided, missing };
  }

  return {
    complete: true,
    anyProvided: true,
    missing: [],
    params: {
      projectNumber: entries[0][1],
      poolId: entries[1][1],
      providerId: entries[2][1],
      serviceAccountEmail: entries[3][1]
    }
  };
}

/**
 * Resolves Firebase Admin SDK AppOptions across Cloud Run, Vercel (WIF or static fallback), and Local runtimes.
 * Never logs or exposes OIDC tokens, access tokens, private keys, or sensitive secrets in errors.
 */
export function resolveFirebaseAdminConfig(
  env: NodeJS.ProcessEnv = process.env,
  resolveOptions?: ResolveFirebaseAdminOptions
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
    } catch {
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

  // 1. Passwordless Vercel OIDC / Google Workload Identity Federation (preferred when configured)
  const wifEnv = inspectVercelWifEnv(env);
  if (wifEnv.complete && wifEnv.params) {
    const { summary, externalAccountConfig } = buildVercelWifExternalAccountConfig(
      wifEnv.params,
      resolveOptions?.oidcTokenSupplier
    );
    const authClient = ExternalAccountClient.fromJSON(externalAccountConfig);
    if (!authClient) {
      throw new Error(
        "FIREBASE_ADMIN_INVALID_WIF_CONFIG: ExternalAccountClient.fromJSON failed to construct a WIF client."
      );
    }
    options.credential = new VercelWifCredential(authClient);
    return {
      projectId: targetProjectId,
      firestoreDatabaseId,
      runtime,
      credentialSource: "vercel_wif",
      options,
      wifConfig: summary,
      wifAuthClient: authClient
    };
  }

  // 2. Explicit split environment variables (legacy / local static credential path)
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

  // 3. GOOGLE_APPLICATION_CREDENTIALS file path (local / container dev)
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

  // 4. FIREBASE_SERVICE_ACCOUNT_KEY env var (raw JSON or base64 JSON)
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

  // 5. Fail fast on Vercel if neither WIF nor explicit static credentials are present
  if (isVercel) {
    if (wifEnv.anyProvided) {
      throw new Error(
        `FIREBASE_ADMIN_NOT_CONFIGURED: Incomplete Vercel WIF configuration. Missing: ${wifEnv.missing.join(", ")}.`
      );
    }
    throw new Error(
      "FIREBASE_ADMIN_NOT_CONFIGURED: Firebase Admin credentials are missing in Vercel runtime. Configure Vercel WIF (GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL) or set static fallback credentials."
    );
  }

  // 6. Local workspace service account files (local dev only)
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

  // 7. Local fallback to Application Default Credentials (ADC)
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
  cachedResolvedConfig = resolved;
  adminApp = initializeApp(resolved.options);
  console.log(
    `[Firebase Admin] App initialized (${resolved.runtime}/${resolved.credentialSource}) for project: ${resolved.projectId}`
  );
  return adminApp;
}

/**
 * Returns the Firestore Admin instance bound exclusively to the target project and named database.
 * Uses dedicated @google-cloud/firestore with GoogleAuth + ExternalAccountClient when WIF is active
 * (because firebase-admin/firestore rejects custom Credential instances), and never falls back to (default).
 */
export function getAdminFirestore(): Firestore {
  const app = getAdminApp();
  const dbId =
    cachedResolvedConfig?.firestoreDatabaseId ||
    readFirebaseAppletConfig().firestoreDatabaseId ||
    DEFAULT_FIRESTORE_DATABASE_ID;

  if (!dbId || dbId === "YOUR_FIRESTORE_DATABASE_ID" || dbId === "(default)") {
    throw new Error(
      "FIRESTORE_DATABASE_ID_REQUIRED: Explicit named Firestore database ID is missing or invalid; refusing fallback to (default)."
    );
  }

  if (cachedResolvedConfig?.credentialSource === "vercel_wif" && cachedResolvedConfig.wifAuthClient) {
    if (!cachedWifFirestore) {
      const googleAuth = new GoogleAuth({
        projectId: cachedResolvedConfig.projectId,
        authClient: cachedResolvedConfig.wifAuthClient,
        scopes: VERCEL_WIF_OAUTH_SCOPES
      });
      cachedWifFirestore = new CloudFirestore({
        projectId: cachedResolvedConfig.projectId,
        databaseId: dbId,
        auth: googleAuth
      }) as unknown as Firestore;
    }
    return cachedWifFirestore;
  }

  return getAdminSdkFirestore(app, dbId);
}

/**
 * Returns the Auth Admin instance.
 */
export function getAdminAuth(): Auth {
  const app = getAdminApp();
  return getAuth(app);
}

