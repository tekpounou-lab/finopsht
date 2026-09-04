import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Sparkles,
  ArrowRight,
  QrCode,
  Wallet,
  BookOpen,
  Cpu,
  Check,
  ShieldCheck,
  Menu,
  X,
  Languages,
  ArrowUpRight,
  ChevronRight,
  Terminal,
  Activity,
  BarChart3,
  Flame,
  Globe,
  Phone,
  Mail,
  MapPin,
  Shield
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAnalytics } from "../lib/analyticsHooks";
import { MarketingLanguage, marketingTranslations } from "../lib/marketingTranslations";

// Import Page Views
import PricingPage from "./PricingPage";
import DemoPage from "./DemoPage";
import ContactSales from "./ContactSales";
import EnterprisePage from "./EnterprisePage";
import Hero from "../components/Hero";
import SocialProof from "../components/SocialProof";
import ImpactMetrics from "../components/ImpactMetrics";
import { ThemeDropdownToggle } from "../components/ThemeSwitcher";

interface LandingPageProps {
  onEnterApp: () => void;
  allowLoggedIn?: boolean;
}

export default function LandingPage({ onEnterApp, allowLoggedIn = false }: LandingPageProps) {
  const { trackCta } = useAnalytics();
  const { user, flowState } = useAuth();

  // Active sub-page tab routing inside the marketing landing experience
  // "home" | "pricing" | "enterprise" | "contact_sales" | "interactive_demo"
  const [activeTab, setActiveTab] = useState<"home" | "pricing" | "enterprise" | "contact_sales" | "interactive_demo">("home");

  // Multi-lingual locale switching
  const [language, setLanguage] = useState<MarketingLanguage>(() => {
    const saved = localStorage.getItem("finops_marketing_lang");
    return (saved as MarketingLanguage) || "fr";
  });

  const t = marketingTranslations[language];

  const handleLanguageChange = (lang: MarketingLanguage) => {
    setLanguage(lang);
    localStorage.setItem("finops_marketing_lang", lang);
    trackCta(`lang_switch_to_${lang}`, "navbar");
  };

  // Mobile drawer state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  // Scroll position & auto-hide indicator
  const [scrolled, setScrolled] = useState(false);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrolled(currentScrollY > 15);
      
      if (currentScrollY < 10) {
        setIsNavbarVisible(true);
      } else if (currentScrollY > lastScrollY) {
        // Scrolling down
        setIsNavbarVisible(false);
      } else {
        // Scrolling up
        setIsNavbarVisible(true);
      }
      setLastScrollY(currentScrollY);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  if (!allowLoggedIn && flowState !== "LOADING" && user && flowState !== "LOGGED_OUT" && flowState !== "LANDING") {
    return <Navigate to="/resolve" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-205 overflow-x-hidden" id="landing-master-viewport">
      
      {/* Animated Glowing Grid Ambient Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-20"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.08),transparent_60%)] pointer-events-none -z-20"></div>

      {/* Top Header Navbar */}
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          scrolled
            ? "bg-slate-950/80 border-b border-slate-900/80 backdrop-blur-xl py-3"
            : "bg-transparent border-b border-transparent py-5"
        } ${isNavbarVisible ? "translate-y-0" : "-translate-y-full"}`}
        id="marketing-top-navbar"
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => {
              setActiveTab("home");
              trackCta("navbar_logo_click", "navbar");
            }}
          >
            <div className="w-9 h-9 bg-gradient-to-tr from-cyan-600 to-cyan-400 rounded-xl flex items-center justify-center font-black text-slate-950 text-lg shadow-lg shadow-cyan-500/20 active:scale-95 transition">
              F
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-100 uppercase leading-none">
                FinOps <span className="text-cyan-400 font-semibold select-none text-[10px]">Tek Pou Nou</span>
              </h1>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest leading-none font-mono mt-0.5">
                Fintech ERP Engine
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-bold tracking-tight">
            {[
              { id: "home", label: language === "fr" ? "Accueil" : language === "ht" ? "Paj Byenveni" : "Home" },
              { id: "enterprise", label: "Enterprise" },
              { id: "pricing", label: "Pricing" },
              { id: "interactive_demo", label: language === "fr" ? "Interactive Demo" : language === "ht" ? "Ese l Konsa" : "Interactive Demo" },
            ].map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  setActiveTab(link.id as any);
                  trackCta(`navigate_to_${link.id}`, "navbar");
                }}
                className={`transition-colors cursor-pointer ${
                  activeTab === link.id
                    ? "text-cyan-400"
                    : "text-slate-400 hover:text-slate-205"
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Language Selector & Portal Access */}
          <div className="hidden md:flex items-center gap-4">
            {/* Theme Switcher Toggle */}
            <ThemeDropdownToggle />

            {/* Quick Language switcher dropdown */}
            <div className="relative inline-block text-left" id="marketing-lang-dropdown">
              <button
                type="button"
                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-cyan-500/30 rounded-lg text-xs font-mono font-bold text-slate-400 hover:text-cyan-400 transition-all cursor-pointer h-8"
                id="lang-switcher-trigger"
                title={language === "fr" ? "Changer la langue" : language === "ht" ? "Chanje lang" : "Change language"}
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span className="uppercase">{language}</span>
                <span className="text-[9px] text-slate-500 font-sans select-none ml-0.5">▼</span>
              </button>

              {isLangDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40 bg-transparent" 
                    onClick={() => setIsLangDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-32 bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-50 py-1 font-mono text-[11px] overflow-hidden">
                    {(["fr", "ht", "en"] as MarketingLanguage[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          handleLanguageChange(lang);
                          setIsLangDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                          language === lang
                            ? "text-cyan-400 bg-slate-800/80 font-bold"
                            : "text-slate-400 hover:text-cyan-400 hover:bg-slate-800/30"
                        }`}
                      >
                        <span className="capitalize">
                          {lang === "fr" ? "Français" : lang === "ht" ? "Kreyòl" : "English"}
                        </span>
                        {language === lang && <Check className="w-3.5 h-3.5 text-cyan-400 font-bold" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button
              id="navbar-portal-connection"
              onClick={() => {
                trackCta("portal_connection_click", "navbar");
                onEnterApp();
              }}
              className="bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-800 hover:border-cyan-400/20 text-xs font-mono font-bold px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1"
            >
              {language === "fr" ? "Se connecter" : language === "ht" ? "Konekte" : "Log In"}{" "}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile menu trigger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-slate-105 transition"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-slate-950/95 border-b border-slate-900 backdrop-blur-xl px-6 py-6 space-y-5"
            id="mobile-nav-drawer"
          >
            <div className="flex flex-col gap-4 text-sm font-mono font-bold tracking-tight">
              <button
                onClick={() => {
                  setActiveTab("home");
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left ${activeTab === "home" ? "text-cyan-400" : "text-slate-400"}`}
              >
                Home
              </button>
              <button
                onClick={() => {
                  setActiveTab("enterprise");
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left ${activeTab === "enterprise" ? "text-cyan-400" : "text-slate-400"}`}
              >
                Enterprise Specification
              </button>
              <button
                onClick={() => {
                  setActiveTab("pricing");
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left ${activeTab === "pricing" ? "text-cyan-400" : "text-slate-400"}`}
              >
                Subscription Pricing
              </button>
              <button
                onClick={() => {
                  setActiveTab("interactive_demo");
                  setIsMobileMenuOpen(false);
                }}
                className={`text-left ${activeTab === "interactive_demo" ? "text-cyan-400" : "text-slate-400"}`}
              >
                Playground Sandbox
              </button>
            </div>

            <hr className="border-slate-800/80" />

            {/* Language switcher & Quick Login */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-mono">THÈME :</span>
              <ThemeDropdownToggle />
            </div>

            {/* Language switcher & Quick Login */}
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-500 font-mono">LANGUE :</span>
              <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono font-bold">
                {(["fr", "ht", "en"] as MarketingLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => {
                      handleLanguageChange(lang);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`px-2.5 py-1 rounded cursor-pointer transition uppercase ${
                      language === lang ? "bg-cyan-500 text-slate-950 font-extrabold" : "text-slate-400"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onEnterApp();
              }}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-extrabold py-2.5 rounded-xl transition text-center"
            >
              Lancer le Portail ERP complète
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Pages Router Controller */}
      <main className="flex-1">
        {activeTab === "home" && (
          <div id="finops-landing-homepage">
            
            {/* HERO SECTION */}
            <Hero 
              language={language}
              onEnterApp={() => {
                trackCta("create_company_hero", "hero_section");
                onEnterApp();
              }}
              onNavigateToDemo={() => {
                trackCta("open_sandbox_demo_hero", "hero_section");
                setActiveTab("interactive_demo");
              }}
            />

            {/* SOCIAL PROOF TESTIMONIALS SECTION */}
            <SocialProof language={language} />

            {/* IMPACT METRICS SECTION */}
            <ImpactMetrics language={language} />

            {/* FEATURES SECTION */}
            <section className="relative py-20 px-6 max-w-6xl mx-auto border-t border-slate-900/40" id="marketing-features-section">
              <div className="text-center max-w-2xl mx-auto mb-16">
                <h3 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                  {t.features.sectionTitle}
                </h3>
                <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                  {t.features.sectionSubtitle}
                </p>
              </div>

              {/* Bento styled Feature Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch" id="features-bento-grid">
                
                {/* Feature 1 — Attendance QR */}
                <div className="bg-slate-900/30 border border-slate-900 hover:border-cyan-500/20 rounded-2xl p-6 transition-all duration-300 backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px]">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                      <QrCode className="w-5 h-5 animate-pulse" />
                    </div>
                    <h4 className="text-base font-bold text-slate-200">{t.features.qrTitle}</h4>
                    <p className="text-slate-450 text-xs mt-2 leading-relaxed text-slate-400">
                      {t.features.qrDesc}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 select-none">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" /> GPS_VERIFIED_CHECK_IN // SIG_OK
                  </div>
                </div>

                {/* Feature 2 — Paie Localisé */}
                <div className="bg-slate-900/30 border border-slate-900 hover:border-cyan-500/20 rounded-2xl p-6 transition-all duration-300 backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px]">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <h4 className="text-base font-bold text-slate-200">{t.features.payrollTitle}</h4>
                    <p className="text-slate-450 text-xs mt-2 leading-relaxed text-slate-400">
                      {t.features.payrollDesc}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 select-none">
                    <Activity className="w-3.5 h-3.5 text-cyan-450" /> CNSS 6% + CNS 2% CALCULATED AUTO
                  </div>
                </div>

                {/* Feature 3 — Ledger & Debts */}
                <div className="bg-slate-900/30 border border-slate-900 hover:border-cyan-500/20 rounded-2xl p-6 transition-all duration-300 backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px]">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <h4 className="text-base font-bold text-slate-200">{t.features.ledgerTitle}</h4>
                    <p className="text-slate-450 text-xs mt-2 leading-relaxed text-slate-400">
                      {t.features.ledgerDesc}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 select-none">
                    <BarChart3 className="w-3.5 h-3.5 text-cyan-400" /> TRACING_IMMUTABLE_DELTA // LEDGER V3
                  </div>
                </div>

                {/* Feature 4 — AI CFO Gemini */}
                <div className="bg-slate-900/30 border border-slate-900 hover:border-cyan-500/20 rounded-2xl p-6 transition-all duration-300 backdrop-blur-md flex flex-col justify-between hover:translate-y-[-2px]">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 text-cyan-300 flex items-center justify-center mb-4 shadow-inner">
                      <Cpu className="w-5 h-5 text-cyan-405 animate-spin" />
                    </div>
                    <h4 className="text-base font-bold text-slate-200">{t.features.aiTitle}</h4>
                    <p className="text-slate-450 text-xs mt-2 leading-relaxed text-slate-400">
                      {t.features.aiDesc}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500 font-mono uppercase bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 select-none">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" /> GEMINI 3.5 FLASH CO-PILOT ACTIVE
                  </div>
                </div>

              </div>
            </section>

            {/* QUICK VALUE BANNER */}
            <section className="bg-slate-900/20 border-t border-b border-slate-900/60 py-16 px-6" id="quick-conversion-ribbon">
              <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-white mb-2">Conçu pour toutes les tailles d'entreprises</h3>
                  <p className="text-slate-400 text-xs leading-relaxed max-w-xl">
                    Salons, restaurants, retail, concessionnaires, écoles, administrations ou agences de sécurité indépendantes : Finops possède la flexibilité requise pour vos shifts de personnel complexes.
                  </p>
                </div>
                <button
                  id="btn-bottom-ribbon-cta"
                  onClick={() => {
                    trackCta("create_company_ribbon", "footer_ribbon");
                    onEnterApp();
                  }}
                  className="w-full md:w-auto p-2 bg-gradient-to-r from-cyan-550 to-cyan-500 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-mono font-extrabold px-6 py-3 rounded-xl transition shadow-lg shadow-cyan-500/10 cursor-pointer text-center whitespace-nowrap active:scale-95"
                >
                  {t.hero.ctaPrimary}
                </button>
              </div>
            </section>
          </div>
        )}

        {activeTab === "pricing" && (
          <PricingPage
            language={language}
            onSelectPlan={(plan) => {
              // Redirect directly to the ERP portal, with a mock upgrade prompt if needed
              onEnterApp();
            }}
            onNavigateToContact={() => setActiveTab("contact_sales")}
          />
        )}

        {activeTab === "enterprise" && (
          <EnterprisePage
            language={language}
            onNavigateToContact={() => setActiveTab("contact_sales")}
            onNavigateToPortal={onEnterApp}
          />
        )}

        {activeTab === "interactive_demo" && (
          <DemoPage
            language={language}
            onNavigateToPortal={onEnterApp}
            onBackToWeb={() => setActiveTab("home")}
          />
        )}

        {activeTab === "contact_sales" && (
          <ContactSales
            language={language}
            onBackToWeb={() => setActiveTab("home")}
          />
        )}
      </main>

      {/* Footer footer-layout */}
      <footer className="bg-slate-950 border-t border-slate-900/80 pt-16 pb-12 px-6 relative overflow-hidden" id="finops-landing-footer">
        {/* Subtle decorative glow */}
        <div className="absolute bottom-0 left-0 w-[240px] h-[240px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-6xl mx-auto">
          {/* Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-slate-900/80 text-xs text-slate-400">
            {/* Column 1 — Brand info */}
            <div className="space-y-4" id="footer-col-brand">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-cyan-500 rounded-xl flex items-center justify-center font-black text-slate-950 text-xs shadow-md shadow-cyan-500/20">
                  F
                </div>
                <span className="text-sm font-black tracking-wider text-white font-sans uppercase">FinOps</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {language === "ht"
                  ? "Premye sistèm ERP Fintech djanm pou jesyon peman, pwentaj QR ak konfòmite sosyal an Ayiti."
                  : language === "en"
                  ? "The premier trusted Fintech ERP platform for payroll automation, QR attendance, and social compliance in Haiti."
                  : "Premier système ERP Fintech de confiance pour la gestion de paie, pointage QR et conformité sociale en Haïti."
                }
              </p>
              <div className="text-[10px] text-slate-500 font-mono space-y-1">
                <div className="flex items-start gap-1.5 matches-icon">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 text-cyan-500 flex-shrink-0" />
                  <span>42, Rue Metellus, Pétion-Ville & Delmas 33, Port-au-Prince, Haïti</span>
                </div>
              </div>
            </div>

            {/* Column 2 — Quick links */}
            <div className="space-y-3" id="footer-col-links">
              <h4 className="text-xs font-bold text-white font-mono uppercase tracking-widest text-[#7dd3fc]">
                {language === "ht" ? "Lyen Rapid Yo" : language === "en" ? "Quick Links" : "Liens Rapides"}
              </h4>
              <ul className="space-y-2 text-[11px] font-medium">
                <li>
                  <button onClick={() => { setActiveTab("home"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="hover:text-cyan-400 transition cursor-pointer text-left block">
                    {language === "ht" ? "Paj Akèy" : language === "en" ? "Home Portal" : "Page d'Accueil"}
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveTab("enterprise")} className="hover:text-cyan-400 transition cursor-pointer text-left block">
                    {language === "ht" ? "Solisyon Enterprise SLA" : language === "en" ? "Enterprise SLA Solutions" : "Solutions Enterprise SLA"}
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveTab("pricing")} className="hover:text-cyan-400 transition cursor-pointer text-left block">
                    {language === "ht" ? "Forfè ak Pri" : language === "en" ? "Subscription Packages" : "Tarifs & Forfaits"}
                  </button>
                </li>
                <li>
                  <button onClick={() => setActiveTab("interactive_demo")} className="hover:text-cyan-400 transition cursor-pointer text-left block">
                    {language === "ht" ? "Playground Sandbox" : language === "en" ? "Playground Sandbox" : "Bac à Sable Démo"}
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3 — Regulatory Information */}
            <div className="space-y-3" id="footer-col-compliance">
              <h4 className="text-xs font-bold text-white font-mono uppercase tracking-widest text-[#7dd3fc] flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                {language === "ht" ? "Konfòmite & Legal" : language === "en" ? "Compliance & Legal" : "Conformité & Légal"}
              </h4>
              <ul className="space-y-1.5 text-[10px] text-slate-500 font-mono">
                <li className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-cyan-500 rounded-full" />
                  {language === "ht" ? "Kalkilasyon CNSS (6% legal)" : language === "en" ? "CNSS Calculation (6% legal)" : "Calculateur CNSS (6% légal)"}
                </li>
                <li className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-cyan-500 rounded-full" />
                  {language === "ht" ? "Kontribisyon CNS (2% Solidarite)" : language === "en" ? "CNS Contribution (2% Solidarity)" : "Cotisation CNS (2% Solidarité)"}
                </li>
                <li className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-cyan-500 rounded-full" />
                  {language === "ht" ? "Kòd Travay Ayisyen Konfòm" : language === "en" ? "Haitian Labor Law Compliant" : "Conforme Code du Travail"}
                </li>
                <li className="flex items-center gap-1">
                  <span className="w-1 h-1 bg-cyan-500 rounded-full" />
                  {language === "ht" ? "Sètifika DGI & Fich Sekirize" : language === "en" ? "DGI Rates & Certified PDF Payslips" : "Normes DGI & Fiches Sécurisées"}
                </li>
              </ul>
            </div>

            {/* Column 4 — Contact info */}
            <div className="space-y-3" id="footer-col-contact">
              <h4 className="text-xs font-bold text-white font-mono uppercase tracking-widest text-[#7dd3fc]">
                {language === "ht" ? "Sipò & Biwo" : language === "en" ? "Support & Offices" : "Soutien & Bureaux"}
              </h4>
              <ul className="space-y-2 text-[10px] font-mono">
                <li className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                  <span className="text-slate-350">+509 3804-0010</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
                  <span className="text-slate-350 hover:text-cyan-400 select-all">contact@finops.tekpounou</span>
                </li>
                <li className="pt-1 text-slate-500">
                  {language === "ht" ? "Len - Van: 8:00 AM - 4:00 PM" : language === "en" ? "Mon - Fri: 8:00 AM - 4:00 PM" : "Lun - Ven: 8h00 - 16h00"}
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom attribution belt */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-8 text-[10px] text-slate-500 font-mono">
            <p>
              {language === "ht"
                ? "© 2026 FinOps Tek Pou Nou. Enfrastrikti Fintech pou Ayiti. Tout dwa rezève."
                : language === "en"
                ? "© 2026 FinOps Tek Pou Nou. Fintech Infrastructure for Haiti. All rights reserved."
                : "© 2026 FinOps Tek Pou Nou. Réalisation Fintech pour Haïti. Tous droits réservés."
              }
            </p>
            <div className="flex gap-4">
              <span className="text-[10px] text-slate-600">v1.2.0 Stable Build</span>
              <span className="text-cyan-500/80 font-bold">Teknoloji Pou Nou, Pa Nou.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
