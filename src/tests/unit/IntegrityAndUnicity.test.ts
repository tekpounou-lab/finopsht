import { describe, it, expect, vi, beforeEach } from "vitest";
import { LedgerTransactionIntegritySchema, UserProfileIntegritySchema } from "../../validations/integritySchemas";
import { cleanupObsoleteFields } from "../../scripts/cleanupObsoleteFields";

vi.mock("../../lib/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "anon_test_uid" } }
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn(),
  writeBatch: vi.fn().mockReturnValue({
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(true)
  }),
  deleteField: vi.fn().mockReturnValue("__DELETE__")
}));

describe("Data Integrity & Unicity Verification Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Zod Integrity Schemas Strictness", () => {
    it("should reject LedgerTransaction with snake_case field (e.g. business_id)", () => {
      const payloadWithSnakeCase = {
        id: "tx_001",
        businessId: "biz_123",
        business_id: "biz_123", // Obsolete snake_case field
        type: "INCOME",
        amount: 1000,
        date: "2026-09-03",
        description: "Test transaction",
        category: "SALES"
      };

      const result = LedgerTransactionIntegritySchema.safeParse(payloadWithSnakeCase);
      expect(result.success).toBe(false);
    });

    it("should accept valid LedgerTransaction in pure camelCase", () => {
      const validPayload = {
        id: "tx_001",
        businessId: "biz_123",
        type: "INCOME",
        amount: 1000,
        date: "2026-09-03",
        description: "Test transaction",
        category: "SALES"
      };

      const result = LedgerTransactionIntegritySchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it("should reject UserProfile with obsolete snake_case field (e.g. business_id)", () => {
      const payloadWithSnakeCase = {
        id: "usr_001",
        email: "user@example.com",
        businessId: "biz_123",
        business_id: "biz_123" // Obsolete field
      };

      const result = UserProfileIntegritySchema.safeParse(payloadWithSnakeCase);
      expect(result.success).toBe(false);
    });

    it("should accept valid UserProfile in pure camelCase", () => {
      const validPayload = {
        id: "usr_001",
        email: "user@example.com",
        businessId: "biz_123",
        role: "OWNER"
      };

      const result = UserProfileIntegritySchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });
  });

  describe("Cleanup Obsolete Fields Script", () => {
    it("should run cleanupObsoleteFields in dryRun mode without errors", async () => {
      const results = await cleanupObsoleteFields(true);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
