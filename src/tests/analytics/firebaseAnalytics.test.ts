import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/analytics
vi.mock("firebase/analytics", () => {
  return {
    getAnalytics: vi.fn(() => ({ type: "mock_analytics_instance" })),
    isSupported: vi.fn(async () => true),
    logEvent: vi.fn(),
    setAnalyticsCollectionEnabled: vi.fn(),
    setUserId: vi.fn(),
    setUserProperties: vi.fn(),
  };
});

import { 
  initAnalytics, 
  sendEvent, 
  formatGA4EventName, 
  sanitizeGA4Params, 
  setAnalyticsConsent, 
  setAnalyticsUser, 
  trackPageView,
  resetAnalyticsForTesting
} from "../../lib/analytics";
import * as firebaseAnalytics from "firebase/analytics";

describe("Firebase GA4 Analytics Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAnalyticsForTesting();
    // Simulate browser window environment for Node unit test runner
    if (typeof window === "undefined") {
      (global as any).window = {
        location: { href: "http://localhost/dashboard" }
      };
      (global as any).document = {
        title: "FINOPS ERP"
      };
    }
  });

  describe("formatGA4EventName", () => {
    it("converts spaces, hyphens and special characters to snake_case", () => {
      expect(formatGA4EventName("Click CTA Button")).toBe("click_cta_button");
      expect(formatGA4EventName("select-plan-123")).toBe("select_plan_123");
      expect(formatGA4EventName("  User Signed Up!! ")).toBe("user_signed_up");
    });

    it("prefixes event names that start with numbers", () => {
      expect(formatGA4EventName("123_test")).toBe("ev_123_test");
    });

    it("truncates names longer than 40 characters", () => {
      const longName = "this_is_a_very_long_event_name_that_exceeds_forty_characters_limit";
      expect(formatGA4EventName(longName).length).toBe(40);
    });

    it("returns default fallback for empty strings", () => {
      expect(formatGA4EventName("")).toBe("custom_event");
    });
  });

  describe("sanitizeGA4Params", () => {
    it("strips null and undefined parameters", () => {
      const input = { valid: "hello", empty: null, missing: undefined };
      const output = sanitizeGA4Params(input);
      expect(output).toEqual({ valid: "hello" });
    });

    it("serializes nested objects safely to JSON string", () => {
      const input = { meta: { role: "ADMIN", branch: "Main" } };
      const output = sanitizeGA4Params(input);
      expect(output.meta).toBe('{"role":"ADMIN","branch":"Main"}');
    });

    it("sanitizes parameter keys to valid lowercase GA4 keys", () => {
      const input = { "User Role": "Owner", "Location-ID": "branch_1" };
      const output = sanitizeGA4Params(input);
      expect(output).toEqual({
        user_role: "Owner",
        location_id: "branch_1",
      });
    });
  });

  describe("initAnalytics & sendEvent", () => {
    it("initializes singleton analytics instance when supported", async () => {
      vi.mocked(firebaseAnalytics.isSupported).mockResolvedValueOnce(true);
      const instance = await initAnalytics();
      expect(instance).toBeDefined();
      expect(firebaseAnalytics.getAnalytics).toHaveBeenCalled();
    });

    it("sends event correctly to logEvent", async () => {
      vi.mocked(firebaseAnalytics.isSupported).mockResolvedValueOnce(true);
      
      const success = await sendEvent("login_success", { role: "MANAGER", attempt: 1 });
      expect(success).toBe(true);
      expect(firebaseAnalytics.logEvent).toHaveBeenCalledWith(
        expect.anything(),
        "login_success",
        { role: "MANAGER", attempt: 1 }
      );
    });

    it("handles fallback gracefully when isSupported returns false", async () => {
      vi.mocked(firebaseAnalytics.isSupported).mockResolvedValueOnce(false);
      const success = await sendEvent("test_event");
      expect(success).toBe(false);
    });

    it("tracks page views with trackPageView", async () => {
      vi.mocked(firebaseAnalytics.isSupported).mockResolvedValueOnce(true);
      const success = await trackPageView("/dashboard", "Tableau de Bord");
      expect(success).toBe(true);
      expect(firebaseAnalytics.logEvent).toHaveBeenCalledWith(
        expect.anything(),
        "page_view",
        expect.objectContaining({
          page_path: "/dashboard",
          page_title: "Tableau de Bord",
        })
      );
    });

    it("sets consent and user properties without throwing", async () => {
      vi.mocked(firebaseAnalytics.isSupported).mockResolvedValueOnce(true);
      
      const consentResult = await setAnalyticsConsent(true);
      expect(consentResult).toBe(true);
      expect(firebaseAnalytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), true);

      const userResult = await setAnalyticsUser("usr_123", { plan: "Enterprise" });
      expect(userResult).toBe(true);
      expect(firebaseAnalytics.setUserId).toHaveBeenCalledWith(expect.anything(), "usr_123");
      expect(firebaseAnalytics.setUserProperties).toHaveBeenCalledWith(expect.anything(), { plan: "Enterprise" });
    });
  });
});
