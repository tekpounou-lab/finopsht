import { useState, useEffect } from "react";

export interface AnalyticsEvent {
  id: string;
  timestamp: string;
  category: "CTA" | "ONBOARDING" | "PRICING" | "DEMO" | "GENERAL";
  action: string;
  label?: string;
  value?: number;
  metadata?: any;
}

// Global analytics listeners for simulation
type AnalyticsListener = (event: AnalyticsEvent) => void;
const listeners = new Set<AnalyticsListener>();

export function trackEvent(
  category: "CTA" | "ONBOARDING" | "PRICING" | "DEMO" | "GENERAL",
  action: string,
  label?: string,
  value?: number,
  metadata?: any
) {
  const event: AnalyticsEvent = {
    id: "track_" + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    category,
    action,
    label,
    value,
    metadata,
  };
  
  // Log elegantly to the system console with distinctive fintech styling
  console.log(
    `%c[FinOps-Analytics] %c${category} %c${action} ${label ? `(${label})` : ""}`,
    "color: #06b6d4; font-weight: bold;",
    "color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.1); padding: 1px 4px; border-radius: 3px;",
    "color: #f1f5f9;"
  );

  // Trigger all registered local telemetry listeners
  listeners.forEach((listener) => listener(event));
}

export function useAnalytics() {
  const [lastEvent, setLastEvent] = useState<AnalyticsEvent | null>(null);

  useEffect(() => {
    const handleEvent = (event: AnalyticsEvent) => {
      setLastEvent(event);
    };
    listeners.add(handleEvent);
    return () => {
      listeners.delete(handleEvent);
    };
  }, []);

  return {
    lastEvent,
    trackCta: (label: string, location: string) => {
      trackEvent("CTA", "click_cta", label, undefined, { location });
    },
    trackOnboarding: (status: string, details?: any) => {
      trackEvent("ONBOARDING", `onboarding_${status}`, undefined, undefined, details);
    },
    trackPricing: (planId: string, billingCycle: string, valHtg: number) => {
      trackEvent("PRICING", "select_plan", planId, valHtg, { billingCycle });
    },
    trackDemo: (demoType: string) => {
      trackEvent("DEMO", "open_demo_simulation", demoType);
    },
  };
}
