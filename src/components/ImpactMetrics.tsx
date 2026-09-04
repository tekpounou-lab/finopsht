import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Users, CreditCard, Clock, Building2 } from "lucide-react";
import { MarketingLanguage } from "../lib/marketingTranslations";

interface CountUpProps {
  end: number;
  duration?: number;
  formatter?: (val: number) => string;
}

const CountUp: React.FC<CountUpProps> = ({ end, duration = 2000, formatter = (v) => v.toString() }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [end, duration]);

  return <span>{formatter(count)}</span>;
};

interface ImpactMetricsProps {
  language: MarketingLanguage;
}

export default function ImpactMetrics({ language }: ImpactMetricsProps) {
  const translations = {
    fr: {
      title: "L'Impact de FinOps en Chiffres",
      subtitle: "Nous accélérons l'inclusion financière et modernisons la gestion des équipes partout en Haïti.",
      metric1Label: "Entreprises Haïtiennes",
      metric1Sub: "SMEs & Franchises actives",
      metric2text: "Volume de Transactions",
      metric2Sub: "Sécurisé sur la plateforme",
      metric3Label: "Pwentaj & Check-ins",
      metric3Sub: "Heures réelles validées",
    },
    ht: {
      title: "Enpak FinOps an Chif",
      subtitle: "Nou akselere enklizyon finansyè ak modènizasyon jesyon ekip yo toupatou nan peyi Ayiti.",
      metric1Label: "Biznis Ayisyen",
      metric1Sub: "PME & Sikisal ki aktif",
      metric2text: "Volim Tranzaksyon Yo",
      metric2Sub: "Ki fèt nan sistèm nan",
      metric3Label: "Pwentaj & Check-ins",
      metric3Sub: "Kantite lè ki eskanè",
    },
    en: {
      title: "FinOps Impact in Numbers",
      subtitle: "Accelerating financial inclusion and modernizing shift management across Haiti.",
      metric1Label: "Haitian Businesses",
      metric1Sub: "Active SMEs & Franchises",
      metric2text: "Transaction Volume",
      metric2Sub: "Secured on the platform",
      metric3Label: "QR Check-ins Issued",
      metric3Sub: "Actual real hours verified",
    }
  };

  const current = translations[language] || translations["fr"];

  return (
    <section 
      className="relative py-20 px-6 max-w-6xl mx-auto border-t border-slate-900/60" 
      id="finance-impact-numbers-section"
    >
      {/* Background glow gradient */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-cyan-500/5 rounded-full blur-[110px] pointer-events-none" />

      <div className="text-center max-w-2xl mx-auto mb-16">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-950/40 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono rounded-full uppercase tracking-widest mb-4">
          <Building2 className="w-3.5 h-3.5" />
          <span>FinOps Nation Impact</span>
        </div>
        <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white font-sans" id="impact-title">
          {current.title}
        </h3>
        <p className="text-slate-400 text-xs mt-3 leading-relaxed max-w-lg mx-auto font-sans">
          {current.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center" id="impact-metrics-grid">
        {/* Metric 1 - Businesses */}
        <motion.div
          whileHover={{ y: -4 }}
          className="bg-slate-900/20 border border-slate-900 rounded-2xl p-8 backdrop-blur-md flex flex-col justify-center items-center shadow-lg"
          id="metric-card-businesses"
        >
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight flex items-center justify-center">
            <CountUp end={480} />
            <span className="text-cyan-400 ml-1">+</span>
          </div>
          <h4 className="text-sm font-bold text-slate-200 mt-3 font-sans">{current.metric1Label}</h4>
          <p className="text-slate-500 text-[11px] mt-1 font-mono uppercase tracking-wider">{current.metric1Sub}</p>
        </motion.div>

        {/* Metric 2 - Transactions */}
        <motion.div
          whileHover={{ y: -4 }}
          className="bg-slate-900/20 border border-slate-900 rounded-2xl p-8 backdrop-blur-md flex flex-col justify-center items-center shadow-lg"
          id="metric-card-transactions"
        >
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
            <CreditCard className="w-5 h-5" />
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight flex items-center justify-center">
            <CountUp end={28159430} formatter={(v) => v.toLocaleString() + " HTG"} />
          </div>
          <h4 className="text-sm font-bold text-slate-200 mt-3 font-sans">{current.metric2text}</h4>
          <p className="text-slate-500 text-[11px] mt-1 font-mono uppercase tracking-wider">{current.metric2Sub}</p>
        </motion.div>

        {/* Metric 3 - Checkins */}
        <motion.div
          whileHover={{ y: -4 }}
          className="bg-slate-900/20 border border-slate-900 rounded-2xl p-8 backdrop-blur-md flex flex-col justify-center items-center shadow-lg"
          id="metric-card-checkins"
        >
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight flex items-center justify-center">
            <CountUp end={82400} />
            <span className="text-cyan-400 ml-1">h+</span>
          </div>
          <h4 className="text-sm font-bold text-slate-200 mt-3 font-sans">{current.metric3Label}</h4>
          <p className="text-slate-500 text-[11px] mt-1 font-mono uppercase tracking-wider">{current.metric3Sub}</p>
        </motion.div>
      </div>
    </section>
  );
}
