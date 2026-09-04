import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, Quote, Sparkles } from "lucide-react";
import { MarketingLanguage } from "../lib/marketingTranslations";

interface Testimonial {
  name: string;
  role: {
    fr: string;
    ht: string;
    en: string;
  };
  company: string;
  location: string;
  text: {
    fr: string;
    ht: string;
    en: string;
  };
}

const testimonials: Testimonial[] = [
  {
    name: "Marie-Marthe Desrosiers",
    role: {
      fr: "Fondatrice & Propriétaire",
      ht: "Fondatris & Pwopriyetè",
      en: "Founder & Owner"
    },
    company: "Belle Fleur Boutique",
    location: "Pétion-Ville, Haïti",
    text: {
      fr: "FinOps a complètement révolutionné notre boutique ! Grâce aux pointages QR simples, je ne perds plus des heures à calculer les retards et la paie de mes 12 collaborateurs chaque quinzaine.",
      ht: "FinOps chanje jan n ap dirije boutik nou an nèt ale! Mèsi ak eskanè QR senp lan, mwen pa pase gwo nwit ankò ap kalkile reta ak peman pou 12 anplwaye m yo chak kinzèn.",
      en: "FinOps completely transformed how we run our boutique! Thanks to the simple QR attendance tracking, I no longer spend hours calculating late arrivals and bi-weekly payroll for my 12 staff members."
    }
  },
  {
    name: "Jean-Baptiste Pierre",
    role: {
      fr: "Directeur des Opérations",
      ht: "Direktè Operasyon yo",
      en: "Director of Operations"
    },
    company: "Capital Security S.A.",
    location: "Delmas, Haïti",
    text: {
      fr: "Gérer la logistique de 45 gardes répartis sur plusieurs succursales sans connexion stable était un enfer sanitaire. La file d'attente offline de FinOps résout tout. Tout se synchronise dès que le réseau revient !",
      ht: "Kòdone sekirite pou 45 gad ki gaye nan divès branch san bon rezo te yon gwo tèt chaje. Sistèm offline FinOps la rezoud tout bagay nèt. Done yo senkronize lè entènèt la tounen!",
      en: "Managing shift protocols for 45 security guards distributed across multiple locations with unstable internet was a nightmare. FinOps offline queue fixed everything. It syncs automatically once the link is back!"
    }
  },
  {
    name: "Peterson Joseph",
    role: {
      fr: "Gérant",
      ht: "Manadjè Jeneral",
      en: "General Manager"
    },
    company: "Atelier Bois d'Ébène",
    location: "Cap-Haïtien, Haïti",
    text: {
      fr: "L'intelligence artificielle Gemini intégrée dans l'ERP nous aide à anticiper nos besoins en fonds de roulement et à payer nos charges CNSS/CNS sans aucune complexité. C'est le futur des PME haïtiennes.",
      ht: "Gemini AI ki entegre nan sistèm ERP a ede nou konprann depans nou yo, asire sekirite finans nou epi peye CNSS san tèt chaje. Sa se lavni tout PME an Ayiti.",
      en: "The integrated Gemini artificial intelligence helps us forecast our working capital needs and pay social contributions with zero complexity. This is the future for Haitian businesses."
    }
  }
];

interface SocialProofProps {
  language: MarketingLanguage;
}

export default function SocialProof({ language }: SocialProofProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % testimonials.length);
    }, 8500);
    return () => clearInterval(timer);
  }, []);

  const handlePrev = () => {
    setIndex((prevIndex) => (prevIndex - 1 + testimonials.length) % testimonials.length);
  };

  const handleNext = () => {
    setIndex((prevIndex) => (prevIndex + 1) % testimonials.length);
  };

  const current = testimonials[index];
  const activeRole = current.role[language] || current.role["fr"];
  const activeText = current.text[language] || current.text["fr"];

  const sectionHeadings = {
    fr: {
      title: "Ils font confiance à FinOps",
      subtitle: "Découvrez les vécus de dirigeants de PME locales qui ont numérisé leurs processus financiers et ressources humaines."
    },
    ht: {
      title: "Yo fè FinOps konfyans",
      subtitle: "Dekouvri istwa ak eksperyans lòt lidè biznis lokal ki chanje fason y ap kalkile kòb ak jere anplwaye yo."
    },
    en: {
      title: "Trusted by Local Leaders",
      subtitle: "Discover how top operations managers and business owners revolutionized their HR compliance and finances."
    }
  };

  const heading = sectionHeadings[language] || sectionHeadings["fr"];

  return (
    <section 
      className="relative py-20 px-6 max-w-5xl mx-auto border-t border-slate-900/60" 
      id="finops-social-proof-section"
    >
      <div className="absolute top-0 right-1/4 w-72 h-72 bg-teal-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400 rounded-full uppercase tracking-widest mb-4">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Siyay Konfyans</span>
        </div>
        <h3 className="text-2xl md:text-3xl font-black tracking-tight text-white font-sans" id="testimonials-title">
          {heading.title}
        </h3>
        <p className="text-slate-400 text-xs mt-3 leading-relaxed max-w-lg mx-auto font-sans">
          {heading.subtitle}
        </p>
      </div>

      {/* Testimonials Sliding Wrapper Card */}
      <div className="relative bg-slate-900/40 border border-slate-900 rounded-3xl p-8 md:p-12 backdrop-blur-xl shadow-xl max-w-3xl mx-auto min-h-[300px] flex flex-col justify-between" id="testimonial-carousel-container">
        <Quote className="absolute top-6 left-6 text-slate-800 w-12 h-12 -z-10 opacity-40" />

        <div className="overflow-hidden min-h-[160px] flex items-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -25 }}
              transition={{ duration: 0.4 }}
              className="text-center md:text-left space-y-4"
              id={`slide-${index}`}
            >
              <p className="text-sm md:text-base text-slate-200 leading-relaxed font-sans italic">
                "{activeText}"
              </p>
              
              <div className="pt-2">
                <h4 className="text-xs md:text-sm font-extrabold text-white font-sans tracking-tight">
                  {current.name}
                </h4>
                <p className="text-[10px] md:text-xs font-mono text-cyan-400 font-medium uppercase tracking-wider mt-0.5">
                  {activeRole}, <span className="text-slate-400">{current.company}</span> — <span className="text-slate-500 font-semibold">{current.location}</span>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Carousel Navigation Toolbar */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-900/80">
          <div className="flex gap-1.5" id="carousel-bullets">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === index ? "bg-cyan-400 w-6" : "bg-slate-850 hover:bg-slate-600"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="w-10 h-10 rounded-full bg-slate-950 border border-slate-850 flex items-center justify-center text-slate-400 hover:text-white hover:border-cyan-500/20 active:scale-95 transition cursor-pointer"
              aria-label="Previous Testimonial"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              className="w-10 h-10 rounded-full bg-slate-950 border border-slate-850 flex items-center justify-center text-slate-400 hover:text-white hover:border-cyan-500/20 active:scale-95 transition cursor-pointer"
              aria-label="Next Testimonial"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
