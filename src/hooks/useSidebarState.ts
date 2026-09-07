import { useState, useEffect, useCallback } from "react";

const STORAGE_COLLAPSED_KEY = "finops-sidebar-collapsed";
const STORAGE_CATEGORIES_KEY = "finops-sidebar-expanded-categories";

export function useSidebarState() {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_COLLAPSED_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CATEGORIES_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Fallback
    }
    return {
      dashboard_group: true,
      hr_group: true,
      finance_group: true,
      intelligence_group: true,
      tools_group: true,
      admin_group: true,
      sre_group: true,
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_COLLAPSED_KEY, String(isCollapsed));
    } catch (e) {
      console.warn("[useSidebarState] Failed to persist sidebar collapsed state", e);
    }
  }, [isCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CATEGORIES_KEY, JSON.stringify(expandedCategories));
    } catch (e) {
      console.warn("[useSidebarState] Failed to persist sidebar categories state", e);
    }
  }, [expandedCategories]);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: prev[categoryId] === undefined ? false : !prev[categoryId],
    }));
  }, []);

  const expandCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryId]: true,
    }));
  }, []);

  return {
    isCollapsed,
    toggleSidebar,
    setIsCollapsed,
    expandedCategories,
    toggleCategory,
    expandCategory,
  };
}
