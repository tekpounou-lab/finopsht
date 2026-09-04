// src/tests/repositories/CurrencyRateRepository.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CurrencyRateRepository } from "@/repositories/CurrencyRateRepository";
import { StaticDataCacheService } from "@/services/cache/StaticDataCacheService";
import { getDocs } from "firebase/firestore";

// Mock Firestore
vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<any>("firebase/firestore");
  return {
    ...actual,
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    doc: vi.fn(),
    setDoc: vi.fn(() => Promise.resolve()),
    collection: vi.fn()
  };
});

describe("CurrencyRateRepository Test Suite", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear local cache
    (CurrencyRateRepository as any).cache.clear();
    await StaticDataCacheService.clearAll();
  });

  it("should convert identical currencies with 1.0 factor directly", async () => {
    const amount = 500;
    const res = await CurrencyRateRepository.convert(amount, "USD", "USD", "biz_123");
    expect(res).toBe(500);
  });

  it("should fall back to standard DEFAULT_RATE (135) if no records are returned by Firestore", async () => {
    // Mock empty snapshot from firestore
    vi.mocked(getDocs).mockResolvedValue({
      empty: true,
      docs: []
    } as any);

    const rate = await CurrencyRateRepository.getRateAtDate("biz_123", "USD", "HTG", "2026-08-10");
    expect(rate).toBe(135.0);
  });

  it("should resolve rate from query snapshot when present", async () => {
    // Mock rate of 142
    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            rate: 142.5,
            effectiveDate: "2026-08-10"
          })
        }
      ]
    } as any);

    const rate = await CurrencyRateRepository.getRateAtDate("biz_123", "USD", "HTG", "2026-08-10");
    expect(rate).toBe(142.5);
  });

  it("should hit local in-memory cache on subsequent requests", async () => {
    const getDocsMock = vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            rate: 138.0,
            effectiveDate: "2026-08-10"
          })
        }
      ]
    } as any);

    // First request - queries Firestore
    const rate1 = await CurrencyRateRepository.getRateAtDate("biz_123", "USD", "HTG", "2026-08-10");
    expect(rate1).toBe(138.0);
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    // Second request - hits Cache
    const rate2 = await CurrencyRateRepository.getRateAtDate("biz_123", "USD", "HTG", "2026-08-10");
    expect(rate2).toBe(138.0);
    expect(getDocsMock).toHaveBeenCalledTimes(1); // Still 1!
  });

  it("should perform correct conversions using resolved rates", async () => {
    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            rate: 140.0,
            effectiveDate: "2026-08-10"
          })
        }
      ]
    } as any);

    const convertedToHtg = await CurrencyRateRepository.convert(100, "USD", "HTG", "biz_123", "2026-08-10");
    expect(convertedToHtg).toBe(14000); // 100 * 140

    const convertedToUsd = await CurrencyRateRepository.convert(14000, "HTG", "USD", "biz_123", "2026-08-10");
    expect(convertedToUsd).toBe(100); // 14000 / 140
  });
});
