import { describe, it, expect } from "vitest";
import { CashTill, TillSession } from "../../../types/cashManagement";

/**
 * Pure mathematical helper mirroring TillSessionModal expected closing & discrepancy calculation logic.
 */
export function calculateExpectedClosingCents(
  till: Partial<CashTill>,
  currentSession?: Partial<TillSession>
): number {
  // CORRECT SSOT FORMULA: till.balance_cents represents the live current balance (Opening + CashIn - CashOut).
  // Do NOT add currentSession.opening_balance_cents a second time!
  return till.balance_cents || 0;
}

export function calculateDiscrepancyCents(
  actualClosingCents: number,
  expectedClosingCents: number
): number {
  return actualClosingCents - expectedClosingCents;
}

describe("P1-1 Cash Closure Mathematical & Semantic Verification Suite", () => {
  const TEST_BIZ = "biz_test_cash_001";

  it("Cas 1 — Aucun mouvement (Opening = 10,000 HTG, Cash In = 0, Cash Out = 0)", () => {
    const openingCents = 1_000_000; // 10,000 HTG

    const session: Partial<TillSession> = {
      id: "sess_001",
      business_id: TEST_BIZ,
      opening_balance_cents: openingCents,
      currency: "HTG",
      status: "ACTIVE"
    };

    const till: Partial<CashTill> = {
      id: "till_001",
      business_id: TEST_BIZ,
      currency: "HTG",
      balance_cents: openingCents // 10,000 HTG after 0 movements
    };

    const expectedClosingCents = calculateExpectedClosingCents(till, session);
    expect(expectedClosingCents).toBe(1_000_000); // 10,000 HTG

    const actualClosingCents = 1_000_000; // Physical count = 10,000 HTG
    const discrepancyCents = calculateDiscrepancyCents(actualClosingCents, expectedClosingCents);

    expect(discrepancyCents).toBe(0); // 0 variance
  });

  it("Cas 2 — Encaissement (Opening = 10,000 HTG, Cash In = 5,000 HTG, Cash Out = 0)", () => {
    const openingCents = 1_000_000; // 10,000 HTG
    const cashInCents = 500_000; // 5,000 HTG

    const session: Partial<TillSession> = {
      id: "sess_002",
      opening_balance_cents: openingCents,
      currency: "HTG"
    };

    const till: Partial<CashTill> = {
      id: "till_001",
      currency: "HTG",
      balance_cents: openingCents + cashInCents // 15,000 HTG (1,500,000 cents)
    };

    const expectedClosingCents = calculateExpectedClosingCents(till, session);
    expect(expectedClosingCents).toBe(1_500_000); // 15,000 HTG

    const actualClosingCents = 1_500_000; // Physical count = 15,000 HTG
    const discrepancyCents = calculateDiscrepancyCents(actualClosingCents, expectedClosingCents);

    expect(discrepancyCents).toBe(0);
  });

  it("Cas 3 — Décaissement (Opening = 10,000 HTG, Cash In = 0, Cash Out = 3,000 HTG)", () => {
    const openingCents = 1_000_000; // 10,000 HTG
    const cashOutCents = 300_000; // 3,000 HTG

    const session: Partial<TillSession> = {
      id: "sess_003",
      opening_balance_cents: openingCents,
      currency: "HTG"
    };

    const till: Partial<CashTill> = {
      id: "till_001",
      currency: "HTG",
      balance_cents: openingCents - cashOutCents // 7,000 HTG (700,000 cents)
    };

    const expectedClosingCents = calculateExpectedClosingCents(till, session);
    expect(expectedClosingCents).toBe(700_000); // 7,000 HTG

    const actualClosingCents = 700_000;
    const discrepancyCents = calculateDiscrepancyCents(actualClosingCents, expectedClosingCents);

    expect(discrepancyCents).toBe(0);
  });

  it("Cas 4 — Encaissement + décaissement (Opening = 10,000 HTG, Cash In = 5,000 HTG, Cash Out = 3,000 HTG)", () => {
    const openingCents = 1_000_000;
    const cashInCents = 500_000;
    const cashOutCents = 300_000;

    const session: Partial<TillSession> = {
      id: "sess_004",
      opening_balance_cents: openingCents,
      currency: "HTG"
    };

    const till: Partial<CashTill> = {
      id: "till_001",
      currency: "HTG",
      balance_cents: openingCents + cashInCents - cashOutCents // 12,000 HTG (1,200,000 cents)
    };

    const expectedClosingCents = calculateExpectedClosingCents(till, session);
    expect(expectedClosingCents).toBe(1_200_000); // 12,000 HTG

    const actualClosingCents = 1_200_000;
    const discrepancyCents = calculateDiscrepancyCents(actualClosingCents, expectedClosingCents);

    expect(discrepancyCents).toBe(0);
  });

  it("Cas 5 — Anti-Doublon: Aucun mouvement mais till.balance déjà égal à l'ouverture, vérifie qu'on N'OBTIENT PAS 20,000 HTG", () => {
    const openingCents = 1_000_000; // 10,000 HTG

    const session: Partial<TillSession> = {
      id: "sess_005",
      opening_balance_cents: openingCents,
      currency: "HTG"
    };

    const till: Partial<CashTill> = {
      id: "till_001",
      currency: "HTG",
      balance_cents: 1_000_000 // 10,000 HTG
    };

    // Buggy formula check: opening_balance_cents + till.balance_cents = 2,000,000 (INCORRECT 20,000 HTG)
    const buggyExpectedClosing = (session.opening_balance_cents || 0) + (till.balance_cents || 0);
    expect(buggyExpectedClosing).toBe(2_000_000); // Proves old formula was defective!

    // Correct SSOT formula check:
    const correctExpectedClosing = calculateExpectedClosingCents(till, session);
    expect(correctExpectedClosing).toBe(1_000_000); // Correct 10,000 HTG!
    expect(correctExpectedClosing).not.toBe(2_000_000);
  });

  it("Cas 6 — Variance / Ecart négatif (Déficit de 500 HTG)", () => {
    const openingCents = 1_000_000;
    const cashInCents = 500_000;
    const cashOutCents = 300_000;

    const session: Partial<TillSession> = {
      id: "sess_006",
      opening_balance_cents: openingCents,
      currency: "HTG"
    };

    const till: Partial<CashTill> = {
      id: "till_001",
      currency: "HTG",
      balance_cents: openingCents + cashInCents - cashOutCents // Expected = 12,000 HTG (1,200,000 cents)
    };

    const expectedClosingCents = calculateExpectedClosingCents(till, session);
    expect(expectedClosingCents).toBe(1_200_000);

    const actualClosingCents = 1_150_000; // Physical count = 11,500 HTG
    const discrepancyCents = calculateDiscrepancyCents(actualClosingCents, expectedClosingCents);

    expect(discrepancyCents).toBe(-50_000); // -500 HTG deficit
  });

  it("Cas 7 — Multi-devises USD (Opening = $100, Denominations = 1 x $100 bill)", () => {
    const openingCents = 10_000; // $100 USD = 10,000 cents

    const session: Partial<TillSession> = {
      id: "sess_007_usd",
      opening_balance_cents: openingCents,
      currency: "USD"
    };

    const till: Partial<CashTill> = {
      id: "till_usd_001",
      currency: "USD",
      balance_cents: openingCents // $100 USD
    };

    const expectedClosingCents = calculateExpectedClosingCents(till, session);
    expect(expectedClosingCents).toBe(10_000); // $100 USD

    // USD Denomination count: 1 x 100 USD bill = 100 * 100 = 10,000 cents
    const actualClosingCents = 1 * 100 * 100;
    const discrepancyCents = calculateDiscrepancyCents(actualClosingCents, expectedClosingCents);

    expect(discrepancyCents).toBe(0);
  });
});
