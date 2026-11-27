import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  buildVercelWifExternalAccountConfig,
  getAdminApp,
  getAdminAuth,
  getAdminFirestore,
  resetFirebaseAdminStateForTests,
  resolveFirebaseAdminConfig,
  VercelWifCredential
} from "../../../lib/firebaseAdmin";

const { privateKey: TEST_PEM_PRIVATE_KEY } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

const VERIFIED_WIF_ENV = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  GCP_PROJECT_NUMBER: "231531725507",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel-finops",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-finops",
  GCP_SERVICE_ACCOUNT_EMAIL: "finops-backend-sa@finopsht.iam.gserviceaccount.com",
  FIREBASE_ADMIN_PROJECT_ID: "finopsht"
};

const EXPECTED_EXTERNAL_ACCOUNT_AUDIENCE =
  "//iam.googleapis.com/projects/231531725507/locations/global/workloadIdentityPools/vercel-finops/providers/vercel-finops";

const VERCEL_REQ_CTX_SYMBOL = Symbol.for("@vercel/request-context");

describe("FINOPS P0 — Vercel OIDC / Google WIF Firebase Admin Suite", () => {
  const originalEnv = { ...process.env };
  const originalReqCtx = (globalThis as any)[VERCEL_REQ_CTX_SYMBOL];

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.K_SERVICE;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.GCP_PROJECT_NUMBER;
    delete process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
    delete process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
    delete process.env.GCP_SERVICE_ACCOUNT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    delete process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    delete process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete (globalThis as any)[VERCEL_REQ_CTX_SYMBOL];
    await resetFirebaseAdminStateForTests();
  });

  afterEach(async () => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
    if (originalReqCtx === undefined) {
      delete (globalThis as any)[VERCEL_REQ_CTX_SYMBOL];
    } else {
      (globalThis as any)[VERCEL_REQ_CTX_SYMBOL] = originalReqCtx;
    }
    await resetFirebaseAdminStateForTests();
  });

  it("1. Selects vercel_wif on Vercel without requiring static private keys", () => {
    const res = resolveFirebaseAdminConfig(VERIFIED_WIF_ENV as NodeJS.ProcessEnv);

    expect(res.runtime).toBe("vercel");
    expect(res.credentialSource).toBe("vercel_wif");
    expect(res.projectId).toBe("finopsht");
    expect(res.firestoreDatabaseId).toBe(
      "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"
    );
    expect(res.options.credential).toBeInstanceOf(VercelWifCredential);
    expect(res.wifAuthClient).toBeDefined();
    expect(res.wifConfig?.serviceAccountEmail).toBe(
      "finops-backend-sa@finopsht.iam.gserviceaccount.com"
    );
  });

  it("2. Fails fast on Vercel when both WIF and static credentials are missing (or WIF is incomplete)", () => {
    expect(() =>
      resolveFirebaseAdminConfig({
        VERCEL: "1",
        VERCEL_ENV: "production"
      } as NodeJS.ProcessEnv)
    ).toThrowError(/FIREBASE_ADMIN_NOT_CONFIGURED/);

    expect(() =>
      resolveFirebaseAdminConfig({
        VERCEL: "1",
        VERCEL_ENV: "production",
        GCP_PROJECT_NUMBER: "231531725507",
        GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel-finops"
      } as NodeJS.ProcessEnv)
    ).toThrowError(/FIREBASE_ADMIN_NOT_CONFIGURED.*Incomplete Vercel WIF/);
  });

  it("3. Builds ExternalAccountClient config with the exact verified WIF provider audience and impersonation URL", () => {
    const { summary, externalAccountConfig } = buildVercelWifExternalAccountConfig({
      projectNumber: "231531725507",
      poolId: "vercel-finops",
      providerId: "vercel-finops",
      serviceAccountEmail: "finops-backend-sa@finopsht.iam.gserviceaccount.com"
    });

    expect(summary.audience).toBe(EXPECTED_EXTERNAL_ACCOUNT_AUDIENCE);
    expect(externalAccountConfig.type).toBe("external_account");
    expect(externalAccountConfig.audience).toBe(EXPECTED_EXTERNAL_ACCOUNT_AUDIENCE);
    expect(externalAccountConfig.subject_token_type).toBe(
      "urn:ietf:params:oauth:token-type:jwt"
    );
    expect(externalAccountConfig.token_url).toBe("https://sts.googleapis.com/v1/token");
    expect(externalAccountConfig.service_account_impersonation_url).toBe(
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/finops-backend-sa@finopsht.iam.gserviceaccount.com:generateAccessToken"
    );
  });

  it("4. Acquires Vercel OIDC token lazily (never at module init or getAdminApp/getAdminFirestore/getAdminAuth)", async () => {
    const supplierSpy = vi.fn(async () => "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ2ZXJjZWwifQ.sig");

    const resolved = resolveFirebaseAdminConfig(VERIFIED_WIF_ENV as NodeJS.ProcessEnv, {
      oidcTokenSupplier: supplierSpy
    });
    expect(supplierSpy).not.toHaveBeenCalled();

    Object.assign(process.env, VERIFIED_WIF_ENV);
    const app = getAdminApp();
    const firestore = getAdminFirestore();
    const auth = getAdminAuth();

    expect(app).toBeDefined();
    expect(firestore).toBeDefined();
    expect(auth).toBeDefined();
    // Module/App/Firestore/Auth initialization must NOT eagerly invoke OIDC token supplier
    expect(supplierSpy).not.toHaveBeenCalled();

    // Now simulate an active Vercel request context and verify @vercel/oidc default lazy resolution
    const nowSec = Math.floor(Date.now() / 1000);
    const headerPayload = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
    const claimsPayload = Buffer.from(
      JSON.stringify({
        iss: "https://oidc.vercel.com/tekpounou-labs-projects",
        aud: "https://vercel.com/tekpounou-labs-projects",
        sub: "owner:tekpounou-labs-projects:project:finopsht:environment:production",
        exp: nowSec + 3600
      })
    ).toString("base64url");
    const fakeVercelJwt = `${headerPayload}.${claimsPayload}.fakesig`;

    (globalThis as any)[VERCEL_REQ_CTX_SYMBOL] = {
      get: () => ({
        headers: {
          "x-vercel-oidc-token": fakeVercelJwt
        }
      })
    };

    const { externalAccountConfig } = buildVercelWifExternalAccountConfig({
      projectNumber: "231531725507",
      poolId: "vercel-finops",
      providerId: "vercel-finops",
      serviceAccountEmail: "finops-backend-sa@finopsht.iam.gserviceaccount.com"
    });
    const supplied = await externalAccountConfig.subject_token_supplier!.getSubjectToken({} as any);
    expect(supplied).toBe(fakeVercelJwt);
  });

  it("5. Firebase Auth Credential adapter maps ExternalAccountClient response to { access_token, expires_in }", async () => {
    const futureExpiry = Date.now() + 3600 * 1000;
    const mockExternalClient = {
      credentials: { expiry_date: futureExpiry },
      getAccessToken: vi.fn(async () => ({ token: "ya29.mock-impersonated-gcp-token" }))
    } as any;

    const adapter = new VercelWifCredential(mockExternalClient);
    const result = await adapter.getAccessToken();

    expect(result.access_token).toBe("ya29.mock-impersonated-gcp-token");
    expect(typeof result.expires_in).toBe("number");
    expect(result.expires_in).toBeGreaterThanOrEqual(3595);
    expect(result.expires_in).toBeLessThanOrEqual(3600);
  });

  it("6. Handles STS + impersonation exchange, caches unexpired tokens, and refreshes expired tokens", async () => {
    vi.useFakeTimers();
    const t0 = new Date("2026-11-26T12:00:00.000Z");
    vi.setSystemTime(t0);

    let oidcCounter = 0;
    const resolved = resolveFirebaseAdminConfig(VERIFIED_WIF_ENV as NodeJS.ProcessEnv, {
      oidcTokenSupplier: async () => `mock.vercel.oidc.${++oidcCounter}`
    });

    const authClient = resolved.wifAuthClient!;
    expect(oidcCounter).toBe(0);

    const stsMock = vi
      .spyOn((authClient as any).stsCredential, "exchangeToken")
      .mockImplementation(async () => ({
        access_token: `sts-token-${oidcCounter}`,
        expires_in: 3600
      }));

    const transporterMock = vi
      .spyOn((authClient as any).transporter, "request")
      .mockImplementation(async () => {
        const expireTime = new Date(Date.now() + 3600 * 1000).toISOString();
        return {
          data: {
            accessToken: `impersonated-gcp-token-${oidcCounter}`,
            expireTime
          }
        } as any;
      });

    const adapter = resolved.options.credential as VercelWifCredential;

    // 1st call: triggers OIDC -> STS -> IAM Credentials impersonation
    const first = await adapter.getAccessToken();
    expect(first.access_token).toBe("impersonated-gcp-token-1");
    expect(first.expires_in).toBe(3600);
    expect(oidcCounter).toBe(1);
    expect(stsMock).toHaveBeenCalledTimes(1);
    expect(transporterMock).toHaveBeenCalledTimes(1);

    // 2nd call 10 minutes later: uses cached impersonated token without refreshing
    vi.advanceTimersByTime(10 * 60 * 1000);
    const second = await adapter.getAccessToken();
    expect(second.access_token).toBe("impersonated-gcp-token-1");
    expect(second.expires_in).toBe(3000);
    expect(oidcCounter).toBe(1);
    expect(stsMock).toHaveBeenCalledTimes(1);

    // 3rd call inside the 5-minute eager refresh threshold (at 56 minutes): refreshes token
    vi.advanceTimersByTime(46 * 60 * 1000);
    const third = await adapter.getAccessToken();
    expect(third.access_token).toBe("impersonated-gcp-token-2");
    expect(third.expires_in).toBe(3600);
    expect(oidcCounter).toBe(2);
    expect(stsMock).toHaveBeenCalledTimes(2);
    expect(transporterMock).toHaveBeenCalledTimes(2);
  });

  it("7. Binds @google-cloud/firestore exclusively to the exact named database ID under WIF (no fallback to default)", () => {
    Object.assign(process.env, VERIFIED_WIF_ENV);

    const firestore = getAdminFirestore();
    expect(firestore.constructor.name).toBe("Firestore");
    expect((firestore as any).projectId).toBe("finopsht");
    expect(firestore.databaseId).toBe("ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a");
    expect((firestore as any).formattedName).toBe(
      "projects/finopsht/databases/ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"
    );
  });

  it("8. Validates WIF Firestore API compatibility for transactions, doc/collection refs, queries, batches, FieldValue & Timestamp", () => {
    Object.assign(process.env, VERIFIED_WIF_ENV);

    const firestore = getAdminFirestore();
    const docRef = firestore.doc("businesses/biz_1");
    const colRef = firestore.collection("invitations");
    const groupQuery = firestore.collectionGroup("event_outbox");
    const query = colRef.where("business_id", "==", "biz_1").limit(5);

    expect(docRef.path).toBe("businesses/biz_1");
    expect(colRef.path).toBe("invitations");
    expect(typeof firestore.runTransaction).toBe("function");
    expect(typeof query.get).toBe("function");
    expect(typeof groupQuery.get).toBe("function");

    // Exercise real @google-cloud/firestore WriteBatch + Serializer with FieldValue & Timestamp from firebase-admin/firestore
    const batch = firestore.batch();
    expect(() =>
      batch.set(
        docRef,
        {
          updatedAt: FieldValue.serverTimestamp(),
          retries: FieldValue.increment(1),
          effectiveAt: Timestamp.fromMillis(1700000000000)
        },
        { merge: true }
      )
    ).not.toThrow();
  });

  it("9. Preserves Cloud Run ADC behavior", () => {
    const res = resolveFirebaseAdminConfig({
      K_SERVICE: "finops-erp-service",
      NODE_ENV: "production"
    } as NodeJS.ProcessEnv);

    expect(res.runtime).toBe("cloud_run");
    expect(res.credentialSource).toBe("cloud_run_adc");
    expect(res.projectId).toBe("finopsht");
    expect(res.firestoreDatabaseId).toBe(
      "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a"
    );
  });

  it("10. Preserves local and fallback static credential behavior", () => {
    const escapedKey = TEST_PEM_PRIVATE_KEY.replace(/\n/g, "\\n");
    const splitRes = resolveFirebaseAdminConfig({
      FIREBASE_ADMIN_PROJECT_ID: "finopsht",
      FIREBASE_ADMIN_CLIENT_EMAIL: "firebase-adminsdk@finopsht.iam.gserviceaccount.com",
      FIREBASE_ADMIN_PRIVATE_KEY: escapedKey
    } as NodeJS.ProcessEnv);

    expect(splitRes.runtime).toBe("local");
    expect(splitRes.credentialSource).toBe("env_split_key");

    const saJson = JSON.stringify({
      type: "service_account",
      project_id: "finopsht",
      client_email: "firebase-adminsdk@finopsht.iam.gserviceaccount.com",
      private_key: TEST_PEM_PRIVATE_KEY
    });
    const jsonRes = resolveFirebaseAdminConfig({
      VERCEL: "1",
      VERCEL_ENV: "production",
      FIREBASE_SERVICE_ACCOUNT_KEY: Buffer.from(saJson, "utf-8").toString("base64")
    } as NodeJS.ProcessEnv);

    expect(jsonRes.runtime).toBe("vercel");
    expect(jsonRes.credentialSource).toBe("service_account_json_env");
  });

  it("11. Preserves existing Firebase Admin initialization failure behavior for mismatched project or invalid keys", () => {
    expect(() =>
      resolveFirebaseAdminConfig({
        ...VERIFIED_WIF_ENV,
        FIREBASE_ADMIN_PROJECT_ID: "wrong-project-id"
      } as NodeJS.ProcessEnv)
    ).toThrowError(/FIREBASE_ADMIN_PROJECT_MISMATCH/);

    expect(() =>
      resolveFirebaseAdminConfig({
        VERCEL: "1",
        GCP_PROJECT_NUMBER: "not-a-number",
        GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel-finops",
        GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-finops",
        GCP_SERVICE_ACCOUNT_EMAIL: "finops-backend-sa@finopsht.iam.gserviceaccount.com"
      } as NodeJS.ProcessEnv)
    ).toThrowError(/FIREBASE_ADMIN_INVALID_WIF_CONFIG/);
  });

  it("12. Never leaks OIDC tokens, Google access tokens, or private credentials in logs or errors", async () => {
    const secretOidc = "eyJ_SUPER_SECRET_VERCEL_OIDC_JWT_VALUE_999";
    const secretGcpToken = "ya29.SUPER_SECRET_GCP_ACCESS_TOKEN_888";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    Object.assign(process.env, VERIFIED_WIF_ENV);
    getAdminApp();

    // Case A: OIDC supplier throws an error containing a raw token -> must be scrubbed
    const failingSupplierClient = buildVercelWifExternalAccountConfig(
      {
        projectNumber: "231531725507",
        poolId: "vercel-finops",
        providerId: "vercel-finops",
        serviceAccountEmail: "finops-backend-sa@finopsht.iam.gserviceaccount.com"
      },
      async () => {
        throw new Error(`OIDC fetch error for token=${secretOidc}`);
      }
    );
    await expect(
      failingSupplierClient.externalAccountConfig.subject_token_supplier!.getSubjectToken({} as any)
    ).rejects.toThrow(/VERCEL_WIF_OIDC_UNAVAILABLE/);

    try {
      await failingSupplierClient.externalAccountConfig.subject_token_supplier!.getSubjectToken(
        {} as any
      );
    } catch (err: any) {
      expect(String(err?.message)).not.toContain(secretOidc);
    }

    // Case B: ExternalAccountClient exchange throws an error embedding a token -> adapter must scrub
    const failingExchangeAdapter = new VercelWifCredential({
      credentials: {},
      getAccessToken: async () => {
        throw new Error(`STS exchange failed Bearer ${secretGcpToken}`);
      }
    } as any);

    try {
      await failingExchangeAdapter.getAccessToken();
      expect.unreachable("Expected getAccessToken to fail");
    } catch (err: any) {
      expect(String(err?.message)).toContain("VERCEL_WIF_TOKEN_EXCHANGE_FAILED");
      expect(String(err?.message)).not.toContain(secretGcpToken);
    }

    const allLoggedText = [
      ...logSpy.mock.calls.flat(),
      ...warnSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat()
    ]
      .map((item) => String(item))
      .join("\n");

    expect(allLoggedText).not.toContain(secretOidc);
    expect(allLoggedText).not.toContain(secretGcpToken);
  });
});
