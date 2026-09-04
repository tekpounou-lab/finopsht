import React from "react";
import { ShieldAlert, Radio, RefreshCw, Layers, Database, Cpu, Award, ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { useAnalytics } from "../lib/analyticsHooks";
import { MarketingLanguage, marketingTranslations } from "../lib/marketingTranslations";

interface EnterprisePageProps {
  language: MarketingLanguage;
  onNavigateToContact: () => void;
  onNavigateToPortal: () => void;
}

export default function EnterprisePage({ language, onNavigateToContact, onNavigateToPortal }: EnterprisePageProps) {
  const t = marketingTranslations[language];
  const { trackCta } = useAnalytics();

  return (
    <div className="relative py-12 px-6 bg-slate-950 text-slate-100 min-h-screen font-sans overflow-hidden" id="enterprise-specs-screen">
      {/* Background neon elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none -z-10 animate-pulse"></div>

      <div className="max-w-5xl mx-auto">
        {/* Header Block */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold rounded-full uppercase tracking-widest inline-flex items-center gap-1.5 mb-4">
            <Award className="w-3.5 h-3.5" /> Fintech Architecture
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-100 font-sans leading-none">
            {t.enterprise.title}
          </h2>
          <p className="text-slate-400 text-sm mt-4 leading-relaxed max-w-2xl mx-auto">
            {t.enterprise.subtitle}
          </p>
        </div>

        {/* Feature Grid detailed overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16" id="enterprise-pillars-board">
          <div className="bg-slate-900/45 border border-slate-800/70 rounded-2xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-5">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide font-mono">{t.enterprise.securityTitle}</h3>
              <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                {t.enterprise.securityDesc}
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono leading-none">
              AES-256 ENCRYPTED / SHA-256 DIGITAL CHAIN
            </div>
          </div>

          <div className="bg-slate-900/45 border border-slate-800/70 rounded-2xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-5 animate-pulse">
                <Radio className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide font-mono">{t.enterprise.slaTitle}</h3>
              <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                {t.enterprise.slaDesc}
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono leading-none">
              OFFLINE EVENTS QUEUE SPOOL BUFFER
            </div>
          </div>

          <div className="bg-slate-900/45 border border-slate-800/70 rounded-2xl p-6 shadow-xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-5">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide font-mono">{t.enterprise.customTitle}</h3>
              <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                {t.enterprise.customDesc}
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono leading-none">
              SOCIÉTÉ ANONYME COMPLIANCE ARCHITECTS
            </div>
          </div>
        </div>

        {/* Sync flowchart graphic simulation */}
        <div className="bg-slate-900/25 border border-slate-950 p-6 rounded-2xl mb-16 relative overflow-hidden" id="flowchart-sync-diagram">
          <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-[40px] pointer-events-none"></div>
          
          <h3 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-4">{t.enterprise.flowTitle}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-3 bg-slate-950/70 border border-slate-900 rounded-xl p-4 text-center">
              <span className="text-[10px] text-cyan-400 font-bold font-mono">{t.enterprise.step1Title}</span>
              <p className="text-slate-400 text-[11px] mt-1">{t.enterprise.step1Desc}</p>
              <div className="h-0.5 w-12 bg-slate-800 mx-auto my-2 block"></div>
              <span className="text-[9px] text-slate-500 font-mono">{t.enterprise.step1Sub}</span>
            </div>

            <div className="md:col-span-1 text-center text-slate-600 font-bold hidden md:block">➔</div>

            <div className="md:col-span-4 bg-slate-950/70 border border-slate-900 rounded-xl p-4 text-center relative">
              <span className="text-[10px] text-amber-400 font-bold font-mono">{t.enterprise.step2Title}</span>
              <p className="text-slate-400 text-[11px] mt-1">{t.enterprise.step2Desc}</p>
              <div className="h-0.5 w-12 bg-slate-800 mx-auto my-2 block"></div>
              <span className="text-[9px] text-amber-500/80 font-mono">{t.enterprise.step2Sub}</span>
            </div>

            <div className="md:col-span-1 text-center text-slate-600 font-bold hidden md:block">➔</div>

            <div className="md:col-span-3 bg-slate-950/70 border border-slate-900 rounded-xl p-4 text-center">
              <span className="text-[10px] text-emerald-400 font-bold font-mono">{t.enterprise.step3Title}</span>
              <p className="text-slate-400 text-[11px] mt-1">{t.enterprise.step3Desc}</p>
              <div className="h-0.5 w-12 bg-slate-800 mx-auto my-2 block"></div>
              <span className="text-[9px] text-slate-500 font-mono">{t.enterprise.step3Sub}</span>
            </div>
          </div>
        </div>

        {/* Dynamic CTA */}
        <div className="bg-gradient-to-r from-slate-900/80 to-slate-900/40 border border-slate-800 p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left" id="enterprise-final-cta-banner">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{t.enterprise.ctaTitle}</h3>
            <p className="text-slate-450 text-xs mt-1.5 leading-snug text-slate-400">
              {t.enterprise.ctaDesc}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <button
              id="enterprise-cta-contact"
              onClick={() => {
                trackCta("enterprise_spec_contact_sales", "enterprise_page");
                onNavigateToContact();
              }}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold px-6 py-3 rounded-xl transition cursor-pointer text-center whitespace-nowrap"
            >
              {t.enterprise.ctaContact}
            </button>
            <button
              id="enterprise-cta-portal"
              onClick={() => {
                trackCta("enterprise_spec_enter_demo", "enterprise_page");
                onNavigateToPortal();
              }}
              className="bg-slate-950 hover:bg-slate-900 text-slate-300 border border-slate-800 text-xs font-mono font-bold px-6 py-3 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1"
            >
              {t.enterprise.ctaDemo} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
