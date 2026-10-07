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
  "disaster-recovery": "recovery",
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

  const defaultTab = useMemo(() => {
    const fallback = normalizeTab(resolveDefaultTabForRole(currentRole) || "dashboard");
    if (initialTab) {
      const normalized = normalizeTab(initialTab);
      if (authorizedTabs.includes(initialTab) || authorizedTabs.includes(normalized)) {
        return normalized;
      }
      return fallback;
    }
    return fallback;
  }, [currentRole, initialTab, authorizedTabs]);

  const [activeTab, setActiveTabState] = useState<string>(defaultTab);
  const [badgeCounts, setBadgeCounts] = useState<NavigationBadgeCounts>({});

  // Sync if initialTab or currentRole changes with strict authorization gate
  useEffect(() => {
    if (initialTab) {
      const normalized = normalizeTab(initialTab);
      if (authorizedTabs.includes(initialTab) || authorizedTabs.includes(normalized)) {
        setActiveTabState(normalized);
      } else {
        const fallback = normalizeTab(resolveDefaultTabForRole(currentRole) || "dashboard");
        console.warn(`[Navigation] Initial tab "${initialTab}" is not authorized for role "${currentRole}". Redirecting to fallback "${fallback}".`);
        setActiveTabState(fallback);
      }
    }
  }, [initialTab, currentRole, authorizedTabs]);

  const isTabAuthorized = useCallback(
    (tab: string) => {
      if (!authorizedTabs || authorizedTabs.length === 0) return true;
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

