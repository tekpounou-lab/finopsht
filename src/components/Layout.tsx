import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Toaster, toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { useSidebarState } from "../hooks/useSidebarState";
import { useTheme } from "../contexts/ThemeContext";

// Icons
import {
  Menu,
  Building2,
  MapPin,
  Layers,
  Shield,
  Wifi,
  WifiOff,
  Globe,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  EyeOff,
  ChevronDown,
  ChevronRight,
  X,
  Brain,
  Sparkles,
  Bell,
} from "lucide-react";

// Context & Theme helpers
import LanguageSelector from "./LanguageSelector";
import { ThemeDropdownToggle, ThemeSegmentedControl } from "./ThemeSwitcher";
import UserProfileDropdown from "./UserProfileDropdown";
import OnboardingAssistant from "./guidance/OnboardingAssistant";
import CfoSidebar from "./CfoSidebar";
import { EditProfileModal } from "./profile/EditProfileModal";
import { BottomNav } from "./navigation/BottomNav";

import { Business, Branch, Department, Employee, Role } from "../types";

export interface LayoutProps {
  children: React.ReactNode;
  currentRole: Role;
  authRole: Role | null;
  currentUser: Employee | null;
  authUser: any;
  currentBusiness: Business;
  currentBranch: Branch | null;
  currentDept: Department | null;
  branches: Branch[];
  departments: Department[];
  isOffline: boolean;
  setIsOffline: (v: boolean) => void;
  pendingQueueCount: number;
  unreadNotificationsCount: number;
  onToggleNotifications: () => void;
  wizardActive: boolean;
  onLogout: () => void;
  onRoleChange: (role: Role) => void;
  systemTime: string;
  realtimeHealth: { isRealtimeConnected: boolean };
  activeTab: string;
  setActiveTab: (tab: string) => void;
  allowedTabs: any[];
  GROUP_CONFIG: any;
  handleReplayEvent: (id: string) => void;
  events: any[];
}

export default function Layout({
  children,
  currentRole,
  authRole,
  currentUser,
  authUser,
  currentBusiness,
  currentBranch,
  currentDept,
  branches,
  departments,
  isOffline,
  setIsOffline,
  pendingQueueCount,
  unreadNotificationsCount,
  onToggleNotifications,
  wizardActive,
  onLogout,
  onRoleChange,
  systemTime,
  realtimeHealth,
  activeTab,
  setActiveTab,
  allowedTabs,
  GROUP_CONFIG,
  handleReplayEvent,
  events,
}: LayoutProps) {
  const { language, setLanguage, t } = useI18n();
  const { isCollapsed, toggleSidebar, setIsCollapsed } = useSidebarState();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAutoHide, setIsAutoHide] = useState<boolean>(() => {
    return localStorage.getItem("finops-sidebar-autohide") === "true";
  });

  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isHelpCenterModalOpen, setIsHelpCenterModalOpen] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const keys = Object.keys(GROUP_CONFIG);
    const initial: Record<string, boolean> = {};
    keys.forEach((k) => {
      initial[k] = true;
    });
    return initial;
  });

  const navigate = useNavigate();
  const [isCfoSidebarOpen, setIsCfoSidebarOpen] = useState(false);
  const [isCfoButtonDismissed, setIsCfoButtonDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Removed automatic collapse logic to respect user intent: "it cant autohide"
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);



  return (
    <>
      <Toaster theme="dark" position="top-right" />
      <div className="h-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden max-w-full pt-14" id="finops-root-container">
        {/* Top Navbar */}
        <header className="fixed top-0 left-0 right-0 z-[60] bg-slate-950/90 border-b border-slate-800/60 backdrop-blur-md px-4 sm:px-6 h-14 flex items-center justify-between" id="finops-navbar">
          <div className="flex items-center gap-2 sm:gap-3" id="nav-brand-area">
            <button 
              className="md:hidden p-2 -ml-2 hover:bg-slate-800/50 rounded-lg text-slate-400 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <Menu className="w-5 h-5 sm:w-6 s-6" />
            </button>
            <button 
              onClick={() => { navigate("/landing"); }}
              className="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center font-black text-slate-950 text-base shadow-lg shadow-cyan-500/20 hover:bg-cyan-500 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer shrink-0" 
              id="brand-logo-mark"
              title="Page d'accueil / Landing Page"
            >
              F
            </button>
            <div className="hidden xs:flex flex-col">
              <h1 className="text-[10px] sm:text-xs font-black tracking-tighter text-slate-100 uppercase leading-tight">
                FinOps <span className="text-cyan-500 select-none hidden sm:inline">Tek Pou Nou</span>
              </h1>
              <p className="text-[8px] sm:text-[9px] text-slate-500 uppercase tracking-widest leading-none font-mono font-bold">
                ERP v3.1
              </p>
            </div>

            <button
              id="nav-btn-landing-page"
              onClick={() => navigate("/landing")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 text-[10px] sm:text-xs font-mono font-bold transition-all cursor-pointer ml-1 shadow-sm"
              title="Page d'accueil / Landing Page"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Accueil</span>
            </button>
            
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/5 border border-emerald-500/10 ml-2" id="reliability-active-badge">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[9px] text-emerald-500/80 font-black tracking-widest font-mono">
                RELIABILITY_OK
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4" id="nav-right-controls">
            {/* Sync connection Simulator toggles */}
            <button
              id="btn-toggle-offline"
              onClick={() => {
                setIsOffline(!isOffline);
                if (isOffline) {
                  events.forEach((ev) => {
                    if (ev.status === "DLQ") handleReplayEvent(ev.id);
                  });
                }
              }}
              className={`h-8 sm:h-9 px-2 sm:px-3 rounded-xl border flex items-center gap-2 text-[10px] font-mono font-black cursor-pointer transition-all shrink-0 active:scale-95 ${
                isOffline
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              }`}
              title={isOffline ? "Offline Mode" : "Online Mode"}
            >
              {isOffline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                  <span className="hidden sm:inline">OFFLINE</span>
                  <span className="bg-rose-500 text-slate-950 px-1 rounded-sm ml-0.5">{pendingQueueCount}</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline uppercase">Sync Active</span>
                  <span className="sm:hidden text-[8px] uppercase font-bold">Online</span>
                </>
              )}
            </button>

            {/* AI CFO Sidebar Toggle Button - Primary Action on Mobile/Desktop */}
            <button
              id="btn-toggle-cfo-sidebar"
              onClick={() => setIsCfoSidebarOpen((prev) => !prev)}
              className={`h-8 sm:h-9 px-2 sm:px-3 rounded-xl border text-[10px] font-black tracking-widest cursor-pointer transition-all flex items-center gap-2 shrink-0 active:scale-95 ${
                isCfoSidebarOpen
                  ? "bg-indigo-500/20 border-indigo-400 text-indigo-200 shadow-md shadow-indigo-500/25 ring-1 ring-indigo-500/50"
                  : "border-indigo-500/30 hover:border-indigo-400 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 hover:text-indigo-300 shadow-sm"
              }`}
              title={
                isCfoSidebarOpen
                  ? language === "fr"
                    ? "Fermer le panneau IA CFO"
                    : language === "ht"
                    ? "Fèmen panèl IA CFO"
                    : "Close AI CFO Panel"
                  : language === "fr"
                  ? "Ouvrir le panneau IA CFO"
                  : language === "ht"
                  ? "Louvri panèl IA CFO"
                  : "Open AI CFO Panel"
              }
              aria-expanded={isCfoSidebarOpen}
              aria-controls="cfo-sidebar-drawer"
            >
              <Brain className={`w-4 h-4 ${isCfoSidebarOpen ? "text-indigo-300 animate-bounce" : "text-indigo-400 animate-pulse"}`} />
              <span className="hidden sm:inline">IA CFO</span>
              <span className={`w-1.5 h-1.5 rounded-full ${isCfoSidebarOpen ? "bg-emerald-400 animate-ping" : "bg-cyan-400 animate-pulse"} hidden sm:inline-block`}></span>
            </button>

            <div className="h-6 w-px bg-slate-800/60 mx-1 hidden sm:block"></div>

            <div className="hidden sm:flex items-center gap-2 sm:gap-4">
              <LanguageSelector />
              <ThemeDropdownToggle />
            </div>

            {/* Notification Bell */}
            <button
              onClick={onToggleNotifications}
              className="relative p-2 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 transition-all active:scale-95 group shadow-sm shrink-0"
              title="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-cyan-600 border border-slate-950 text-slate-100 text-[8px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {authRole && currentRole !== authRole && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                id="btn-restore-auth-role"
                onClick={() => {
                  onRoleChange(authRole as Role);
                  toast.success(
                    language === "fr" 
                      ? `Rôle d'origine restauré : ${authRole} !` 
                      : language === "ht"
                        ? `Wòl orijinal retounen : ${authRole} !`
                        : `Original role restored: ${authRole}!`
                  );
                }}
                className="px-2.5 py-1 sm:py-1.5 h-8 rounded-lg bg-pink-500 hover:bg-pink-400 text-slate-950 font-mono font-bold text-[9px] sm:text-[10px] cursor-pointer transition-all flex items-center gap-1.5 shrink-0 border border-pink-300 shadow-lg shadow-pink-500/25 animate-pulse"
                title={
                  language === "fr"
                    ? `Restaurer mon rôle d'origine (${authRole})`
                    : language === "ht"
                      ? `Retounen nan wòl orijinal mwen (${authRole})`
                      : `Restore original role (${authRole})`
                }
              >
                <Shield className="w-3.5 h-3.5 text-slate-950" />
                <span className="hidden leading-none md:inline">
                  {language === "fr" ? "REVENIR AU RÔLE INITIAL" : language === "ht" ? "RETOUNEN WÒL CHÈF" : "RESTORE REAL ROLE"}
                </span>
                <span className="md:hidden">
                  {language === "fr" ? "QUITT." : language === "ht" ? "KITE" : "REST."}
                </span>
              </motion.button>
            )}

            <UserProfileDropdown 
              name={currentUser?.name || (currentRole === "OWNER" ? "Propriétaire" : currentRole === "MANAGER" ? "Gérant" : "Utilisateur")}
              role={currentRole}
              language={language}
              onLogout={onLogout}
              onEditProfile={() => setIsEditProfileModalOpen(true)}
              onHelpCenter={() => setIsHelpCenterModalOpen(true)}
            />
          </div>
        </header>

        {/* PROFILE MODALS */}
        <AnimatePresence>
          {isEditProfileModalOpen && (
            <EditProfileModal
              isOpen={isEditProfileModalOpen}
              onClose={() => setIsEditProfileModalOpen(false)}
              currentUser={currentUser}
            />
          )}
          {isHelpCenterModalOpen && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60" onClick={() => setIsHelpCenterModalOpen(false)} />
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl w-full max-w-md">
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider mb-4">Help Center</h3>
                <p className="text-xs text-slate-400 mb-6">Need assistance? Contact us at support@finops.com for technical help.</p>
                <button onClick={() => setIsHelpCenterModalOpen(false)} className="w-full py-2 bg-slate-800 text-slate-200 text-xs uppercase font-bold rounded-lg hover:bg-slate-700">Close</button>
              </motion.div>
            </div>,
            document.body
          )}
        </AnimatePresence>

        {/* SIMULATION BANNER */}
        {authRole && currentRole !== authRole && (
          <div className="w-full bg-gradient-to-r from-pink-905/40 via-rose-950/40 to-purple-900/40 border-b border-pink-700/25 p-2 text-center text-[10px] sm:text-xs flex flex-col sm:flex-row items-center justify-center gap-2 text-slate-200" id="simulation-indicator-banner">
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider uppercase bg-pink-650 text-pink-300 px-2 py-0.5 rounded border border-pink-500/15 text-[8.5px] animate-pulse">
                {language === "fr" ? "MODE SIMULATION SÉCURISÉ" : language === "ht" ? "MÒD SIMILASYON SEKIYÈ" : "SECURE SIMULATION MODE"}
              </span>
              <span className="text-slate-300 font-medium">
                {language === "fr" 
                  ? `Simulation: ${currentRole}` 
                  : language === "ht"
                    ? `Similasyon: ${currentRole}`
                    : `Simulation: ${currentRole}`}
              </span>
            </div>
            <button
              id="banner-restore-auth-role"
              onClick={() => {
                onRoleChange(authRole as Role);
                toast.success(
                  language === "fr" 
                    ? `Rôle d'origine restauré : ${authRole} !` 
                    : language === "ht"
                      ? `Wòl orijinal retounen : ${authRole} !`
                      : `Original role restored: ${authRole}!`
                );
              }}
              className="px-3 py-1 bg-pink-600 hover:bg-pink-500 text-slate-950 font-sans font-black text-[9px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all border border-pink-400/30 rounded-lg shadow-md active:scale-95"
            >
              <Shield className="w-3 h-3" />
              {language === "fr" ? "Restaurer mon Rôle Principal" : language === "ht" ? "Retounen nan Wòl Mwen" : "Restore Primary Role"}
            </button>
          </div>
        )}

        {wizardActive ? (
          <main className="flex-1 p-6 flex flex-col justify-start" id="wizard-viewport">
            {children}
          </main>
        ) : (
          <div className="flex-1 flex flex-row overflow-hidden max-w-full" id="finops-app-shell-body">
            {/* Mobile Drawer Overlay */}
            <AnimatePresence>
              {isMobile && isMobileMenuOpen && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden"
                />
              )}
            </AnimatePresence>

            {/* Vertical Navigation Bar (Left Side) */}
            <aside 
              className={`
                ${isMobile 
                  ? `fixed top-14 bottom-0 left-0 z-50 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} w-[280px]` 
                  : `${isCollapsed ? "w-20" : "w-72"} relative`
                } 
                bg-slate-950 border-r border-slate-900 flex flex-col shrink-0 transition-all duration-300 ease-in-out
              `} 
              id="global-nav-container"
            >
              {/* Sidebar Header with Toggle */}
              <div className={`p-4 border-b border-slate-900 flex items-center ${isCollapsed && !isMobile ? "justify-center" : "justify-between"}`}>
                {(!isCollapsed || isMobile) && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest leading-none">Enterprise</span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter mt-1 leading-none">Navigation</span>
                  </div>
                )}
                {isMobile ? (
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 hover:text-cyan-400 transition-all active:scale-95"
                  >
                    <X className="w-5 h-5" />
                  </button>
                ) : (
                  <button 
                    onClick={toggleSidebar}
                    className="p-2 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 transition-all active:scale-95 shadow-lg"
                    title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                  >
                    {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {/* Grouped Tabs List */}
              <div className="flex-1 p-3 flex flex-col gap-6 overflow-y-auto" id="nav-tabs-vertical">
                {/* Landing Page Quick Access Button */}
                <button
                  id="sidebar-btn-landing-page"
                  onClick={() => {
                    navigate("/landing");
                    if (isMobile) setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer bg-slate-900/80 hover:bg-cyan-950/60 border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 font-mono text-xs font-bold ${
                    isCollapsed && !isMobile ? "justify-center px-0" : ""
                  }`}
                  title="Retour à la page d'accueil"
                >
                  <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
                  {(!isCollapsed || isMobile) && (
                    <span className="truncate">Page d'Accueil</span>
                  )}
                </button>
                {(() => {
                  const groupedTabIds = Object.values(GROUP_CONFIG).flatMap((c: any) => c.tabs);
                  const otherTabs = allowedTabs.filter(t => !groupedTabIds.includes(t.id));
                  
                  const renderGroup = (label: string, tabs: any[], key: string) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      {!isCollapsed && (
                        <h3 className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 select-none">
                          {label}
                        </h3>
                      )}
                      
                      {tabs.map((tab) => {
                        const IconComp = tab.icon;
                        const isActive = activeTab === tab.id;
                        
                        return (
                          <button
                            key={tab.id}
                            id={`tab-btn-${tab.id}`}
                            onClick={() => {
                              if (tab.id === "notifications") {
                                onToggleNotifications();
                              } else {
                                setActiveTab(tab.id);
                              }
                              if (isMobile) setIsMobileMenuOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative flex items-center ${isCollapsed && !isMobile ? "justify-center" : "gap-3.5"} group shrink-0 ${
                              isActive
                                ? tab.highlights
                                  ? "bg-gradient-to-tr from-cyan-500/15 to-indigo-500/15 text-cyan-300 border border-cyan-500/30 shadow-lg shadow-cyan-500/5"
                                  : "bg-slate-900 text-cyan-400 border border-slate-800 shadow-md"
                                : "text-slate-500 hover:text-slate-200 hover:bg-slate-900/50 border border-transparent"
                            }`}
                            title={isCollapsed && !isMobile ? tab.label : undefined}
                          >
                            <IconComp className={`w-5 h-5 transition-colors shrink-0 ${isActive ? "text-cyan-400" : "text-slate-600 group-hover:text-slate-400"}`} />
                            
                            {(!isCollapsed || isMobile) && (
                              <span className="flex-1 text-left truncate">{tab.label}</span>
                            )}
                            
                            {/* Badges */}
                            {tab.id === "reliability" && typeof pendingQueueCount === 'number' && pendingQueueCount > 0 && (
                              <span className={`rounded-full bg-rose-500 text-slate-950 font-black font-mono animate-pulse ${isCollapsed && !isMobile ? "absolute -top-1 -right-1 px-1 text-[8px]" : "px-2 py-0.5 text-[10px]"}`}>
                                {pendingQueueCount}
                              </span>
                            )}
                            {tab.id === "notifications" && typeof unreadNotificationsCount === 'number' && unreadNotificationsCount > 0 && (
                              <span className={`rounded-full bg-cyan-600/30 border border-cyan-500/40 text-cyan-400 font-bold font-mono animate-pulse ${isCollapsed && !isMobile ? "absolute -top-1 -right-1 px-1 text-[8px]" : "px-2 py-0.5 text-[10px]"}`}>
                                {unreadNotificationsCount}
                              </span>
                            )}
                            {tab.id === "aicfo" && (
                              <span className={`rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)] shrink-0 ${isCollapsed && !isMobile ? "absolute top-1 right-1 w-1.5 h-1.5" : "w-2 h-2"}`}></span>
                            )}
                            
                            {isActive && (
                              <motion.div 
                                layoutId="activeGlobalTab"
                                className="absolute inset-y-1.5 left-0 w-1 bg-cyan-500 rounded-full"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );

                  const groups = Object.entries(GROUP_CONFIG).map(([groupKey, config]: [string, any]) => {
                    const groupTabs = allowedTabs.filter(t => config.tabs.includes(t.id));
                    if (groupTabs.length === 0) return null;
                    return renderGroup(config.label, groupTabs, groupKey);
                  });

                  if (otherTabs.length > 0) {
                    groups.push(renderGroup(language === "fr" ? "Général" : language === "ht" ? "Jeneral" : "General", otherTabs, "others"));
                  }

                  return groups;
                })()}
              </div>

              {/* Bottom sidebar info if needed */}
              <div className="mt-auto p-4 border-t border-slate-900/50">
                 <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"} px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800/50 transition-all`}>
                    <Activity className={`w-4 h-4 text-emerald-400 shrink-0 ${isCollapsed ? "" : ""}`} />
                    {!isCollapsed && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">System Health</span>
                        <span className="text-[9px] text-emerald-500/80 font-mono">STABLE_200_OK</span>
                      </div>
                    )}
                 </div>
              </div>
            </aside>

            {/* Content Area with Identity Pane and Main Frame */}
            <div className="flex-1 flex flex-col overflow-y-auto w-full max-w-full bg-slate-950" id="finops-content-scroller">
              {/* Global Identity, Tenancy Real-time Context Panel */}
              <section className="p-4 sm:p-6 bg-slate-950/40 border-b border-slate-900/60 flex flex-col gap-6 w-full max-w-full" id="filter-identity-pane">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    {/* Entity Information */}
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
                      </div>
                      <div>
                        <h2 className="text-[10px] uppercase font-black text-slate-500 tracking-widest leading-none mb-1.5">
                          {t.navigation.tenantSelector}
                        </h2>
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base font-black text-slate-100 uppercase leading-none">
                            {currentBusiness ? currentBusiness.name : "..."}
                          </span>
                          {currentBusiness?.nif && (
                            <span className="hidden xs:inline-block text-[9px] tracking-wider px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-900/40 text-cyan-400 font-mono font-bold">
                              NIF: {currentBusiness.nif}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      {/* Branch Details */}
                      {currentBranch && (
                        <div className="flex items-center gap-3 bg-slate-900/30 border border-slate-800/60 p-2 sm:p-2.5 rounded-xl transition-all hover:bg-slate-900/50">
                          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                            <MapPin className="w-4 h-4 text-indigo-400" />
                          </div>
                          <div>
                            <h2 className="text-[9px] uppercase font-black text-slate-500 tracking-wider leading-none mb-1">
                              {language === "fr" ? "Succursale" : language === "ht" ? "Sikisal" : "Branch"}
                            </h2>
                            <span className="text-xs font-bold text-slate-200 block leading-none">
                              {currentBranch.name}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Department Details */}
                      {currentDept && (
                        <div className="flex items-center gap-3 bg-slate-900/30 border border-slate-800/60 p-2 sm:p-2.5 rounded-xl transition-all hover:bg-slate-900/50">
                          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                            <Layers className="w-4 h-4 text-teal-400" />
                          </div>
                          <div>
                            <h2 className="text-[9px] uppercase font-black text-slate-500 tracking-wider leading-none mb-1">
                              {language === "fr" ? "Département" : language === "ht" ? "Depatman" : "Dept."}
                            </h2>
                            <span className="text-xs font-bold text-slate-200 block leading-none">
                              {currentDept.name}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role Information */}
                  <div className="flex items-center justify-between lg:justify-end gap-4 w-full lg:w-auto">
                    <div className="flex flex-col items-start lg:items-end">
                      <span className="text-[9px] uppercase font-black text-slate-500 tracking-widest leading-none mb-1">
                        {t.settings.currentRole}
                      </span>
                      <span className="text-[10px] text-slate-500 italic leading-none">
                        {language === "fr" 
                          ? "Sécurité active" 
                          : language === "ht" 
                            ? "Sekirite aktif" 
                            : "Security active"}
                      </span>
                    </div>
                    <div className={`px-4 py-2.5 rounded-xl border font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2.5 shadow-sm ${
                      currentRole === "OWNER"
                        ? "text-rose-400 border-rose-500/30 bg-rose-500/10 shadow-rose-900/20"
                        : currentRole === "MANAGER"
                        ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10 shadow-cyan-900/20"
                        : currentRole === "SUPERVISOR"
                        ? "text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-amber-900/20"
                        : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-emerald-900/20"
                    }`}>
                      <Shield className="w-4 h-4" />
                      <span>{currentRole}</span>
                    </div>
                  </div>
                </div>

                <OnboardingAssistant currentRole={currentRole} language={language} />
              </section>

              {/* Main Layout Frame */}
              <main className="flex-1 flex flex-col min-h-0 w-full max-w-full" id="finops-main-grid-frame">
                {/* Active Screen Rendering Pane */}
                <div 
                  className="flex-1 flex flex-col w-full max-w-full min-h-[300px] relative group/viewport" 
                  id="screen-viewport"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-full flex-1 flex flex-col min-h-0"
                      id={`tab-viewport-${activeTab}`}
                    >
                      {children}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </main>
            </div>
          </div>
        )}

        {/* Safe Premium High Density Footer with Deterministic Clock */}
        <footer className="hidden md:flex h-8 border-t border-slate-800/60 bg-slate-950 px-6 items-center justify-between text-[10px] text-slate-500 font-medium shrink-0" id="finops-footer">
          <div className="flex gap-4">
            <span>{language === "fr" ? "ORGANISATION" : language === "ht" ? "ÒGANIZASYON" : "ORGANIZATION"}: <span className="text-slate-300 uppercase">{currentBusiness?.name || "FINOPS ERP"}</span></span>
            <span>{language === "fr" ? "SUCCURSALE" : language === "ht" ? "SIKISAL" : "BRANCH"}: <span className="text-slate-300 uppercase">{currentBranch ? currentBranch.name : (language === "fr" ? "SIÈGE SOCIAL" : language === "ht" ? "BIWO PRENSIPAL" : "HEADQUARTERS")}</span></span>
          </div>
          <div className="flex gap-4 items-center">
            {realtimeHealth.isRealtimeConnected ? (
              <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 text-[9px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {language === "fr" ? "EN_LIGNE_SYNC" : language === "ht" ? "AN_LIY_SINK" : "ONLINE_SYNC"}
              </span>
            ) : (
              <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20 text-[9px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {language === "fr" ? "HORS_LIGNE_FILE" : language === "ht" ? "DEKONEKTE_FIL" : "OFFLINE_QUEUED"}
              </span>
            )}
            <span>{language === "fr" ? "HORLOGE_DÉTERMINISTE" : language === "ht" ? "LÈ_PRESI_SISTÈM" : "DETERMINISTIC_CLOCK"}: <span className="text-cyan-500 font-mono tracking-tighter">{systemTime}</span></span>
          </div>
        </footer>

        <BottomNav 
          allowedTabs={allowedTabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
        />

        {/* Floating action button to toggle IA CFO Sidebar */}
        <AnimatePresence>
          {!isCfoButtonDismissed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.2 }}
              className="fixed bottom-12 right-6 z-40 group/cfo-container"
              id="floating-cfo-container"
            >
              {/* Sleek Close / Dismiss 'X' Button */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCfoButtonDismissed(true);
                }}
                className="absolute -top-1.5 -left-1.5 z-50 w-5 h-5 rounded-full bg-slate-900/95 border border-slate-700/80 hover:border-rose-500/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 flex items-center justify-center transition-all duration-150 shadow-md backdrop-blur-sm cursor-pointer opacity-80 hover:opacity-100"
                title={language === "fr" ? "Fermer le bouton IA CFO" : language === "ht" ? "Fèmen bouton IA CFO" : "Close AI CFO button"}
                id="floating-cfo-close-button"
                aria-label="Close AI CFO floating button"
              >
                <X className="w-3 h-3 stroke-[2.5]" />
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsCfoSidebarOpen((prev) => !prev)}
                className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-xl shadow-indigo-500/20 flex items-center justify-center cursor-pointer relative group border border-white/10"
                title={language === "fr" ? "Discuter avec l'IA CFO" : language === "ht" ? "Pale ak IA CFO" : "Chat with AI CFO"}
                id="floating-cfo-button"
              >
                <Brain className="w-5 h-5 text-white" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
                
                {/* Tooltip on hover */}
                <span className="absolute right-14 bg-slate-900 border border-slate-800 text-[10.5px] font-sans font-black text-indigo-400 px-3 py-1 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-md uppercase tracking-wider">
                  {language === "fr" ? "IA CFO En ligne" : language === "ht" ? "IA CFO Disponib" : "AI CFO Online"}
                </span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CFO Sidebar Component */}
        <CfoSidebar 
          isOpen={isCfoSidebarOpen} 
          onClose={() => setIsCfoSidebarOpen(false)} 
          currentBusiness={currentBusiness} 
          currentBranch={currentBranch} 
        />
      </div>
    </>
  );
}
