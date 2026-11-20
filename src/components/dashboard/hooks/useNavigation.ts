import { useState, useMemo, useCallback, useEffect } from "react";
import { Role } from "../../../types";
import { resolveDefaultTabForRole, getAuthorizedTabsForRole, AppTab } from "../../../services/auth/routeResolver";

export interface NavigationBadgeCounts {
  notifications?: number;
  leaves?: number;
  approvals?: number;
  invitations?: number;
  errors?: number;
}

// Map alias tabs to canonical IDs used by DashboardShell & Sidebar
export const TAB_ALIASES: Record<string, string> = {
  bi: "dashboard",
  leave: "leaves",
  aicfo: "cfo",
  pic: "performance",
  workspace: "employeeSpace",
  schedules: "planning",
  tenants: "platform",
  superadmin: "platform",
  "super-admin": "platform",
  "admin/pending-businesses": "platform",
  "admin/pending_businesses": "platform",
  "pending-businesses": "platform",
  "pending_businesses": "platform",
  pending: "platform",
  licences: "plans",
  audit: "forensic",
  dlq: "reliability",
  "system-health": "health",
  "system/health": "health",
  "system/reliability": "reliability",
  "system/forensic": "forensic",
  "system/recovery": "recovery",
  rapports: "reports",
  report: "reports",
  cash_management: "cash",
  "cash-management": "cash",
  caisses: "cash",
  caisse: "cash",
  coffres: "cash",
  accounting: "ledger",
  "general-ledger": "ledger",
  "grand-livre": "ledger",
};

export function normalizeTab(tab?: string): string {
  if (!tab) return "dashboard";
  const lower = tab.toLowerCase();
  return TAB_ALIASES[lower] || tab;
}

export function useNavigation(currentRole: Role, initialTab?: string) {
  const authorizedTabs = useMemo(() => {
    const rawAuthorized = getAuthorizedTabsForRole(currentRole) as string[];
    // Expand authorized tabs with both canonical and aliased forms
    const expanded = new Set<string>();
    rawAuthorized.forEach((t) => {
      expanded.add(t);
      expanded.add(normalizeTab(t));
      // Also add reverse mappings
      Object.entries(TAB_ALIASES).forEach(([alias, canonical]) => {
        if (canonical === t || canonical === normalizeTab(t)) {
          expanded.add(alias);
          expanded.add(canonical);
        }
      });
    });
    return Array.from(expanded);
  }, [currentRole]);

  const requestedTabFromUrl = useMemo(() => {
    if (initialTab) return initialTab;
    if (typeof window !== "undefined" && window.location?.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const tabParam = params.get("tab");
        if (tabParam && tabParam.trim()) return tabParam.trim();
      } catch {
        // Ignore malformed URL search params
      }
    }
    return undefined;
  }, [initialTab]);

  const defaultTab = useMemo(() => {
    const fallback = normalizeTab(resolveDefaultTabForRole(currentRole) || "dashboard");
    const targetTab = initialTab || requestedTabFromUrl;
    if (targetTab) {
      const normalized = normalizeTab(targetTab);
      if (authorizedTabs.includes(targetTab) || authorizedTabs.includes(normalized)) {
        return normalized;
      }
      return fallback;
    }
    return fallback;
  }, [currentRole, initialTab, requestedTabFromUrl, authorizedTabs]);

  const [activeTab, setActiveTabState] = useState<string>(defaultTab);
  const [badgeCounts, setBadgeCounts] = useState<NavigationBadgeCounts>({});

  // Sync if initialTab, URL ?tab=, or currentRole changes with strict authorization gate
  useEffect(() => {
    const targetTab = initialTab || requestedTabFromUrl;
    if (targetTab) {
      const normalized = normalizeTab(targetTab);
      if (authorizedTabs.includes(targetTab) || authorizedTabs.includes(normalized)) {
        setActiveTabState(normalized);
      } else {
        const fallback = normalizeTab(resolveDefaultTabForRole(currentRole) || "dashboard");
        console.warn(`[Navigation] Initial tab "${targetTab}" is not authorized for role "${currentRole}". Redirecting to fallback "${fallback}".`);
        setActiveTabState(fallback);
      }
    }
  }, [initialTab, requestedTabFromUrl, currentRole, authorizedTabs]);

  const isTabAuthorized = useCallback(
    (tab: string) => {
      if (!authorizedTabs || authorizedTabs.length === 0) return false;
      const normalized = normalizeTab(tab);
      return (
        authorizedTabs.includes(tab) ||
        authorizedTabs.includes(normalized) ||
        authorizedTabs.includes(tab.toLowerCase())
      );
    },
    [authorizedTabs]
  );

  const navigateToTab = useCallback(
    (tab: string) => {
      const normalized = normalizeTab(tab);
      if (isTabAuthorized(normalized) || isTabAuthorized(tab)) {
        setActiveTabState(normalized);
        if (typeof window !== "undefined" && window.history?.replaceState) {
          try {
            const url = new URL(window.location.href);
            if (url.pathname === "/dashboard" || url.pathname === "/workspace") {
              url.searchParams.set("tab", normalized);
              window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
            }
          } catch {
            // Safe no-op in non-browser/test environments
          }
        }
      } else {
        console.warn(`[Navigation] Tab "${tab}" (normalized: "${normalized}") is not authorized for role "${currentRole}". Allowed:`, authorizedTabs);
      }
    },
    [isTabAuthorized, currentRole, authorizedTabs]
  );

  return {
    activeTab,
    setActiveTab: navigateToTab,
    authorizedTabs,
    isTabAuthorized,
    badgeCounts,
    setBadgeCounts,
  };
}

