import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { getAdminApp, getAdminFirestore, getAdminAuth } from "../../../lib/firebaseAdmin";
import firebaseConfig from "../../../../firebase-applet-config.json";

describe("Cloud Run Packaging and ADC Integrity Tests", () => {
  const gcloudignorePath = path.resolve(process.cwd(), ".gcloudignore");

  describe("Firebase Admin SDK Configuration", () => {
    it("1. Verifies getAdminApp binds strictly to finopsht and does not load foreign project credentials", () => {
      const app = getAdminApp();
      expect(app).toBeDefined();
      expect(app.name).toBe("[DEFAULT]");
      expect(app.options.projectId).toBe("finopsht");
    });

    it("2. Verifies Admin Firestore is bound to the exact named database id", () => {
      const firestore = getAdminFirestore();
      expect(firestore).toBeDefined();
      // Named database verification
      expect(firestore.databaseId).toBe("ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a");
    });

    it("3. Confirms getAdminFirestore returns a native Admin Firestore instance without Client SDK proxying", () => {
      const firestore = getAdminFirestore();
      // Native Admin Firestore has collectionGroup, batch, runTransaction
      expect(typeof firestore.collectionGroup).toBe("function");
      expect(typeof firestore.batch).toBe("function");
      expect(typeof firestore.runTransaction).toBe("function");
      // Check that it's not a dummy client adapter
      expect((firestore as any)._isClientSdkFallback).toBeUndefined();
    });

    it("4. Ensures getAdminAuth returns native Firebase Admin Auth instance", () => {
      const auth = getAdminAuth();
      expect(auth).toBeDefined();
      expect(typeof auth.setCustomUserClaims).toBe("function");
      expect(typeof auth.verifyIdToken).toBe("function");
      expect(typeof auth.getUser).toBe("function");
    });
  });

  describe("Packaging & .gcloudignore Rules Verification", () => {
    it("5. .gcloudignore exists at root and contains strict exclusion patterns for service account keys", () => {
      expect(fs.existsSync(gcloudignorePath)).toBe(true);
      const content = fs.readFileSync(gcloudignorePath, "utf-8");
      
      expect(content).toContain("*-firebase-adminsdk-*.json");
      expect(content).toContain("service-account*.json");
      expect(content).toContain("tek-pou-nou-tpn-*.json");
      expect(content).toContain(".env");
      expect(content).toContain("scratch/");
      expect(content).toContain(".aistudio/");
    });

    it("6. .gcloudignore strictly matches and excludes the foreign service account key file", () => {
      const foreignKeyFileName = "tek-pou-nou-tpn-firebase-adminsdk-fbsvc-8987873e95.json";
      const content = fs.readFileSync(gcloudignorePath, "utf-8");
      const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

      // Helper function matching gitignore wildcards
      const matchesPattern = (filename: string, pattern: string): boolean => {
        const regexStr = "^" + pattern
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") + "$";
        return new RegExp(regexStr).test(filename);
      };

      const matchedPatterns = lines.filter(p => matchesPattern(foreignKeyFileName, p));
      expect(matchedPatterns.length).toBeGreaterThan(0);
      expect(matchedPatterns).toContain("*-firebase-adminsdk-*.json");
      expect(matchedPatterns).toContain("tek-pou-nou-tpn-*.json");
    });

    it("7. .gcloudignore does NOT exclude required configuration and source files", () => {
      const requiredFiles = [
        "package.json",
        "package-lock.json",
        "firebase-applet-config.json",
        "firebase-blueprint.json",
        "firestore.indexes.json",
        "firebase.json",
        "tsconfig.json",
        "server.ts"
      ];

      const content = fs.readFileSync(gcloudignorePath, "utf-8");
      const lines = content.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));

      const matchesPattern = (filename: string, pattern: string): boolean => {
        const regexStr = "^" + pattern
          .replace(/\./g, "\\.")
          .replace(/\*/g, ".*")
          .replace(/\?/g, ".") + "$";
        return new RegExp(regexStr).test(filename);
      };

      for (const reqFile of requiredFiles) {
        const matchingLines = lines.filter(p => !p.startsWith("!") && matchesPattern(reqFile, p));
        expect(matchingLines.length, `Required file ${reqFile} must NOT be excluded by .gcloudignore`).toBe(0);
      }
    });
  });
});
