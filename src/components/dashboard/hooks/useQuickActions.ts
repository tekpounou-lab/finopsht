import { useState, useEffect, useCallback } from "react";

export interface QuickActionItem {
  id: string;
  title: string;
  category: "NAVIGATION" | "ACTION" | "SEARCH";
  iconName?: string;
  tabTarget?: string;
  action?: () => void;
}

export function useQuickActions(onNavigateTab: (tab: string) => void) {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const quickActions: QuickActionItem[] = [
    { id: "nav_platform", title: "Organisations & Tenants Multi-Entreprises (Super Admin)", category: "NAVIGATION", tabTarget: "platform" },
    { id: "nav_plans", title: "Plans Tarifaires & Licences SaaS (Super Admin)", category: "NAVIGATION", tabTarget: "plans" },
    { id: "nav_health", title: "Santé Système, Métriques & SRE (Super Admin)", category: "NAVIGATION", tabTarget: "health" },
    { id: "nav_reliability", title: "Flux Événements & File DLQ (Super Admin)", category: "NAVIGATION", tabTarget: "reliability" },
    { id: "nav_recovery", title: "Plan de Reprise d'Activité / DRP (Super Admin)", category: "NAVIGATION", tabTarget: "recovery" },
    { id: "nav_dash", title: "Tableau de bord (Vue d'ensemble / BI)", category: "NAVIGATION", tabTarget: "dashboard" },
    { id: "nav_org", title: "Structure Organisationnelle (Branches/Dépts)", category: "NAVIGATION", tabTarget: "organization" },
    { id: "nav_personnel", title: "Effectifs & Personnel", category: "NAVIGATION", tabTarget: "personnel" },
    { id: "nav_payroll", title: "Moteur de Paie & Traitements", category: "NAVIGATION", tabTarget: "payroll" },
    { id: "nav_ledger", title: "Grand Livre & Écritures Comptables", category: "NAVIGATION", tabTarget: "ledger" },
    { id: "nav_attendance", title: "Gestion des Présences & Pointages", category: "NAVIGATION", tabTarget: "attendance" },
    { id: "nav_planning", title: "Planning & Horaires des Équipes", category: "NAVIGATION", tabTarget: "planning" },
    { id: "nav_leaves", title: "Demandes de Congés & Absences", category: "NAVIGATION", tabTarget: "leaves" },
    { id: "nav_performance", title: "Performance Commerciale & CRM", category: "NAVIGATION", tabTarget: "performance" },
    { id: "nav_cfo", title: "Assistant IA Directeur Financier (CFO)", category: "NAVIGATION", tabTarget: "cfo" },
    { id: "nav_documents", title: "Gestion Documentaire & Fiches", category: "NAVIGATION", tabTarget: "documents" },
    { id: "nav_workspace", title: "Mon Espace Collaborateur", category: "NAVIGATION", tabTarget: "employeeSpace" },
    { id: "nav_audit", title: "Journal d'Audit Forensique SHA-256", category: "NAVIGATION", tabTarget: "forensic" },
    { id: "nav_settings", title: "Paramètres & Administration Système", category: "NAVIGATION", tabTarget: "settings" },
  ];

  // Shortcut key listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === "Escape" && isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen]);

  const executeAction = useCallback(
    (item: QuickActionItem) => {
      if (item.tabTarget) {
        onNavigateTab(item.tabTarget);
      }
      if (item.action) {
        item.action();
      }
      setIsCommandPaletteOpen(false);
      setSearchQuery("");
    },
    [onNavigateTab]
  );

  const filteredActions = quickActions.filter((a) =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    searchQuery,
    setSearchQuery,
    filteredActions,
    executeAction,
  };
}
