import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, browserSessionPersistence, setPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, doc, collection, writeBatch, serverTimestamp, setLogLevel } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
// import { getPerformance } from "firebase/performance";
import firebaseConfig from "../../firebase-applet-config.json";
import { LogSanitizer } from "../services/security/LogSanitizer";
import { logger } from "../services/observability/Logger";

// Set Firestore log level to silent to prevent noisy backend timeout notices in sandboxed/iframe environments
try {
  setLogLevel("silent");
} catch {}

// Merge configuration with environment variables if present (safe for both browser & node)
const env: Record<string, string | undefined> = 
  (typeof import.meta !== "undefined" && (import.meta as any).env) 
    ? (import.meta as any).env 
    : (typeof process !== "undefined" && process.env ? process.env : {});

const effectiveConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: env.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  apiKey: env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
};

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(effectiveConfig);
export const auth = getAuth(app);

// Use session persistence across domains in browser environment
if (typeof window !== "undefined") {
  setPersistence(auth, browserSessionPersistence).catch(() => {});
}

// Initialize Firestore explicitly specifying the custom databaseId and persistent cache
let cacheStrategy;
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('__storage_test__', 'test');
    window.localStorage.removeItem('__storage_test__');
    cacheStrategy = persistentLocalCache({ tabManager: persistentMultipleTabManager() });
  } else {
    cacheStrategy = memoryLocalCache();
  }
} catch (e) {
  cacheStrategy = memoryLocalCache();
}

export const db = initializeFirestore(
  app,
  {
    localCache: cacheStrategy,
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
  },
  effectiveConfig.firestoreDatabaseId
);

// Explicitly export serverTimestamp for SSOT consistency
export { serverTimestamp };

export const functions = getFunctions(app);
export const storage = getStorage(app);

// Guard Firebase Performance Monitoring against unsupported/local domains
export const perf = null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const loginWithGooglePopup = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (error.code === 'auth/unauthorized-domain') {
       throw error;
    }
    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
       throw error;
    }
    if (error.code === 'auth/popup-blocked' || error.message.includes('COOP')) {
      logger.warn('Popup blocked, falling back to redirect...');
      return await signInWithRedirect(auth, googleProvider);
    }
    throw error;
  }
};

export const handleRedirectResult = async () => {
  try {
    return await getRedirectResult(auth);
  } catch (error) {
    logger.error("Redirect auth error:", error);
    throw error;
  }
};

// Explicit ABAC/Zero-Trust Error Handlers compliance definitions
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function logFirestoreError(error: unknown, operationType: OperationType, path: string | null): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: LogSanitizer.maskUid(auth.currentUser?.uid),
      email: LogSanitizer.maskEmail(auth.currentUser?.email),
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: LogSanitizer.maskBusinessId(auth.currentUser?.tenantId),
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: LogSanitizer.maskEmail(provider.email),
      })) || []
    },
    operationType,
    path: path ? LogSanitizer.sanitizeString(path) : null
  };
  logger.warn('[Firestore Listener Issue]', errInfo);
  return errInfo;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: LogSanitizer.maskUid(auth.currentUser?.uid),
      email: LogSanitizer.maskEmail(auth.currentUser?.email),
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: LogSanitizer.maskBusinessId(auth.currentUser?.tenantId),
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: LogSanitizer.maskEmail(provider.email),
      })) || []
    },
    operationType,
    path: path ? LogSanitizer.sanitizeString(path) : null
  };
  logger.error('Firestore Error Captured:', errInfo);
  throw new Error(JSON.stringify(errInfo));
}

// Global safe database accessor helpers
export function getDbDoc(path: string, ...pathSegments: string[]) {
  return doc(db, path, ...pathSegments);
}

export function getDbCollection(path: string) {
  return collection(db, path);
}

export function getDbWriteBatch() {
  return writeBatch(db);
}

// Resilient Firestore retry & backoff utilities
export { withFirestoreRetry, isRetriableFirestoreError, calculateBackoffDelay } from "../services/firestore/firestoreRetry";
