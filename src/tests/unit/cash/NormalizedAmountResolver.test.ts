import { describe, it, expect } from "vitest";
import { NormalizedAmountResolver, NormalizationContext } from "../../../domains/analytics/utils/NormalizedAmountResolver";

describe("NormalizedAmountResolver — BI-P1.3.2 Remediation Tests", () => {
  const mockContext: NormalizationContext = {
    "2026-08-10": {
      id: "grid_test",
      businessId: "biz_1",
      effectiveDate: "2026-08-10",
      is_inherited: false,
      source: "manual",
      rates: {
        ACHAT_CLIENT: 135.0,
        VENTE_CLIENT: 135.0,
        ACHAT_ENVOIE: 135.0,
        VENTE_ENVOIE: 135.0,
        BRH: 135.0,
        CANADA: 98.5,
        EURO: 145.0,
        PESO: 2.25,
        LOCAL: 1.0000
      },
      actorId: "tester",
      updatedAt: new Date().toISOString()
    }
  };

  it("converts positive USD to HTG correctly", () => {
    const result = NormalizedAmountResolver.resolveToHTG(100, "USD", "2026-08-10", mockContext, "BRH");
    expect(result).toBe(13500);
  });

  it("preserves negative sign for USD (P1 requirement)", () => {
    const result = NormalizedAmountResolver.resolveToHTG(-100, "USD", "2026-08-10", mockContext, "BRH");
    expect(result).toBe(-13500);
  });

  it("handles zero correctly", () => {
    const result = NormalizedAmountResolver.resolveToHTG(0, "USD", "2026-08-10", mockContext, "BRH");
    expect(result).toBe(0);
  });

  it("passes through HTG without conversion (no double conversion)", () => {
    const result = NormalizedAmountResolver.resolveToHTG(13500, "HTG", "2026-08-10", mockContext, "BRH");
    expect(result).toBe(13500);
  });

  it("preserves negative sign for HTG", () => {
    const result = NormalizedAmountResolver.resolveToHTG(-13500, "HTG", "2026-08-10", mockContext, "BRH");
    expect(result).toBe(-13500);
  });
});
