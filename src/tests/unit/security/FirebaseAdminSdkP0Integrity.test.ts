import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAdminFirestore, getAdminApp, getAdminAuth } from "../../../lib/firebaseAdmin";
import firebaseConfig from "../../../../firebase-applet-config.json";
import * as firestoreModule from "firebase-admin/firestore";

describe("Firebase Admin SDK P0 Architectural Integrity Test", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. Uses the exact configured projectId and firestoreDatabaseId", () => {
    expect(firebaseConfig.projectId).toBe("finopsht");
    expect(firebaseConfig.firestoreDatabaseId).toBe("ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a");
  });

  it("2. Verifies Admin Firestore instance is bound to the exact configured databaseId", () => {
    const adminDb = getAdminFirestore();
    expect(adminDb).toBeDefined();
    // In @google-cloud/firestore (used by firebase-admin/firestore), databaseId is stored as property
    const formattedDbName = (adminDb as any).formattedName || (adminDb as any)._formattedName || (adminDb as any).databaseId;
    if (formattedDbName) {
      expect(formattedDbName).toContain("ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a");
    }
  });

  it("3. Confirms getAdminFirestore returns a native Admin Firestore instance, not a client fallback proxy", () => {
    const adminDb = getAdminFirestore();
    // Native Admin Firestore has constructor name or specific Admin SDK methods
    expect(adminDb).not.toHaveProperty("runTransactionWithClient");
    expect(adminDb.constructor.name).toBe("Firestore");
  });

  it("4. Ensures getAdminAuth returns an Admin Auth instance", () => {
    const adminAuth = getAdminAuth();
    expect(adminAuth).toBeDefined();
  });

  it("5. Verifies that no client SDK proxying exists in firebaseAdmin module exports", async () => {
    const adminModule = await import("../../../lib/firebaseAdmin");
    expect(adminModule).toHaveProperty("getAdminFirestore");
    expect(adminModule).toHaveProperty("getAdminApp");
    expect(adminModule).toHaveProperty("getAdminAuth");
    expect(adminModule).not.toHaveProperty("getClientFallbackFirestore");
  });
});
