import React, { useState } from "react";
import { Check, Sparkles, HelpCircle, ArrowRight, ShieldCheck, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useAnalytics } from "../lib/analyticsHooks";
import { SAAS_PLANS, PlanTier } from "../services/billing/billingEngine";
import { MarketingLanguage, marketingTranslations } from "../lib/marketingTranslations";

interface PricingPageProps {
  language: MarketingLanguage;
  onSelectPlan: (plan: PlanTier) => void;
  onNavigateToContact: () => void;
}

export default function PricingPage({ language, onSelectPlan, onNavigateToContact }: PricingPageProps) {
  const t = marketingTranslations[language];
  const { trackPricing, trackCta } = useAnalytics();
  
  // Choose currency denomination billing
  const [currency, setCurrency] = useState<"HTG" | "USD">("HTG");
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("business");

  const handleSelectPlan = (tier: PlanTier) => {
    setSelectedPlan(tier);
    const plan = SAAS_PLANS[tier];
    const val = currency === "HTG" ? plan.priceHtg : plan.priceUsd;
    trackPricing(tier, currency, val);
    onSelectPlan(tier);
  };

  return (
    <div className="relative py-12 px-6 overflow-hidden md:px-12" id="finops-saas-pricing-screen bg-slate-950">
      {/* Background Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-cyan-500/5 rounded-full blur-[110px] pointer-events-none -z-10 animate-pulse"></div>

      <div className="max-w-6xl mx-auto flex flex-col items-center">
        {/* Header Block */}
        <div className="text-center max-w-2xl mb-12">
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 text-xs font-mono font-bold rounded-full uppercase tracking-widest inline-flex items-center gap-1.5 mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Tek Pou Nou SaaS Pricing
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-100 font-sans leading-tight">
            {t.pricing.title}
          </h2>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            {t.pricing.subtitle}
          </p>
        </div>

        {/* Currency Denomination Controller */}
        <div className="flex bg-slate-900/80 border border-slate-800/80 p-1 rounded-xl mb-12 shadow-lg" id="currency-pricing-switcher">
          <button
            onClick={() => {
              setCurrency("HTG");
              trackCta("currency_switch_htg", "pricing_page");
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all duration-200 cursor-pointer ${
              currency === "HTG"
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            HTG (Gourdes local)
          </button>
          <button
            onClick={() => {
              setCurrency("USD");
              trackCta("currency_switch_usd", "pricing_page");
            }}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-bold transition-all duration-200 cursor-pointer ${
              currency === "USD"
                ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-100"
            }`}
          >
            USD (Dollar index)
          </button>
        </div>

        {/* Dynamic Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl items-stretch mb-16" id="pricing-plans-grid">
          {/* STARTER CARD */}
          <motion.div
            whileHover={{ y: -4 }}
            className={`flex flex-col rounded-2xl p-6 backdrop-blur-md transition-all duration-300 relative border ${
              selectedPlan === "starter"
                ? "bg-slate-900/60 border-cyan-500/50 shadow-lg shadow-cyan-500/5"
                : "bg-slate-900/30 border-slate-800/60 hover:border-slate-700"
            }`}
            onClick={() => setSelectedPlan("starter")}
          >
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-100">{t.pricing.starterName}</h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed min-h-[36px]">
                {t.pricing.starterTarget}
              </p>
              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold text-slate-100 font-mono">0</span>
                <span className="text-slate-400 text-sm font-mono ml-1">{currency} {t.pricing.monthly}</span>
              </div>
            </div>

            <hr className="border-slate-800/60 my-5" />

            <div className="flex-1">
              <ul className="space-y-3.5">
                {SAAS_PLANS.starter.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              id="btn-starter-select"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectPlan("starter");
              }}
              className="mt-8 w-full py-2.5 px-4 rounded-xl text-xs font-bold transition duration-200 cursor-pointer bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/40 text-center"
            >
              {t.pricing.ctaStart}
            </button>
          </motion.div>

          {/* BUSINESS CARD (RECOMMENDED) */}
          <motion.div
            whileHover={{ y: -4 }}
            className={`flex flex-col rounded-2xl p-6 backdrop-blur-md transition-all duration-300 relative border ${
              selectedPlan === "business"
                ? "bg-slate-900/70 border-cyan-400 shadow-xl shadow-cyan-500/10"
                : "bg-slate-900/30 border-slate-800/60 hover:border-slate-700"
            }`}
            onClick={() => setSelectedPlan("business")}
          >
            {/* Pop badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-100 text-[10px] font-extrabold uppercase tracking-widest rounded-full shadow-md flex items-center gap-1">
              <Sparkles className="w-3 h-3 animate-pulse" /> Populaire
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
                {t.pricing.businessName}
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed min-h-[36px]">
                {t.pricing.businessTarget}
              </p>
              <div className="mt-4 flex items-baseline">
                <span className="text-3xl font-extrabold text-cyan-400 font-mono">
                  {currency === "HTG" ? "2,500" : "$20"}
                </span>
                <span className="text-slate-400 text-sm font-mono ml-1">{currency} {t.pricing.monthly}</span>
              </div>
            </div>

            <hr className="border-slate-800/60 my-5" />

            <div className="flex-1 font-sans">
              <ul className="space-y-3.5">
                {SAAS_PLANS.business.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              id="btn-business-select"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectPlan("business");
              }}
              className="mt-8 w-full py-2.5 px-4 rounded-xl text-xs font-bold transition duration-200 cursor-pointer bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-lg shadow-cyan-500/10 text-center flex items-center justify-center gap-1.5"
            >
              🚀 {t.pricing.ctaStart} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>

          {/* ENTERPRISE CARD */}
          <motion.div
            whileHover={{ y: -4 }}
            className={`flex flex-col rounded-2xl p-6 backdrop-blur-md transition-all duration-300 relative border ${
              selectedPlan === "enterprise"
                ? "bg-slate-900/60 border-cyan-500/50 shadow-lg shadow-cyan-500/5"
                : "bg-slate-900/30 border-slate-800/60 hover:border-slate-700"
            }`}
            onClick={() => setSelectedPlan("enterprise")}
          >
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-100">{t.pricing.enterpriseName}</h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed min-h-[36px]">
                {t.pricing.enterpriseTarget}
              </p>
              <div className="mt-4 flex items-baseline">
                <span className="text-2xl font-extrabold text-slate-100 font-mono">
                  {t.pricing.enterprisePrice}
                </span>
              </div>
            </div>

            <hr className="border-slate-800/60 my-5" />

            <div className="flex-1">
              <ul className="space-y-3.5">
                {SAAS_PLANS.enterprise.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              id="btn-enterprise-contact"
              onClick={(e) => {
                e.stopPropagation();
                trackCta("contact_sales_pricing", "pricing_page");
                onNavigateToContact();
              }}
              className="mt-8 w-full py-2.5 px-4 rounded-xl text-xs font-bold transition duration-200 cursor-pointer bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 text-center flex items-center justify-center gap-1.5"
            >
              <Mail className="w-3.5 h-3.5" /> {t.pricing.ctaContact}
            </button>
          </motion.div>
        </div>

        {/* Security / Compliance Guarantee block */}
        <div className="w-full max-w-5xl bg-slate-900/20 border border-slate-900 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6" id="compliance-pricing-banner">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-slate-200 font-bold text-sm">Garantie d'Audits Réglementaires CNC / CNSS</h4>
              <p className="text-slate-400 text-xs mt-1 leading-snug">
                FinOps assure la compatibilité avec toutes les obligations légales de retenues et de rapports du Ministère des Affaires Sociales d'Haïti.
              </p>
            </div>
          </div>
          <p className="text-slate-500 text-[11px] font-mono leading-tight max-w-[280px] bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
            SECURE SHA256 CORRECTION TRAICE //
            IDEMPOTENT PAYROLL ASSURANCE ENGINE
          </p>
        </div>
      </div>
    </div>
  );
}
