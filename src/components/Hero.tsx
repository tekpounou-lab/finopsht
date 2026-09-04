import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  ArrowRight,
  QrCode,
  Wallet,
  Activity,
  Cpu,
  TrendingUp,
  Flame,
  ArrowUpRight,
  ShieldCheck,
  Check,
  X,
  Send,
  RefreshCw,
  Clock,
  Download
} from "lucide-react";
import { MarketingLanguage, marketingTranslations } from "../lib/marketingTranslations";

interface HeroProps {
  language: MarketingLanguage;
  onEnterApp: () => void;
  onNavigateToDemo: () => void;
}

const mockCollaborators = [
  { name: "Marie-Marthe Desrosiers", time: "08:14:02", status: "GPS_VALID", loc: "Branche Pétion-Ville" },
  { name: "Jean-Baptiste Pierre", time: "08:15:45", status: "GPS_VALID", loc: "Branche Delmas" },
  { name: "Peterson Joseph", time: "08:17:11", status: "GPS_VALID", loc: "Branche Carrefour" },
  { name: "Esther Chery", time: "08:21:03", status: "GPS_VALID", loc: "Centrale Cap-Haïtien" }
];

// Presets for the Gemini AI CFO Assistant
const cfoPrompts = [
  {
    icon: "📈",
    label: {
      ht: "Kilès ki pi rentab semenn sa?",
      fr: "Quelle est la branche la plus rentable?",
      en: "Which branch is most profitable?"
    },
    prompt: "which_profitable",
    response: {
      ht: "Sikisal Petyonvil la parèt pi devan semenn sa a ak yon revni de +18% (yon total 382,450 HTG) gras ak nouvo kòmand dijital yo ak mwens depans operasyonèl. Delmas ap swiv dèyè byen pre.",
      fr: "La succursale de Pétion-Ville est en tête cette semaine avec une hausse de +18% (total 382 450 HTG) grâce à l'augmentation des commandes digitales et une baisse des dépenses opérationnelles.",
      en: "The Pétion-Ville branch is leading this week with a +18% increase (totaling 382,450 HTG) driven by digital order growth and lower operational expenses."
    }
  },
  {
    icon: "💸",
    label: {
      ht: "Èske gen depans sispèk?",
      fr: "Y a-t-il des dépenses suspectes?",
      en: "Are there any suspicious expenses?"
    },
    prompt: "suspicious_expenses",
    response: {
      ht: "Sistèm lan analize tranzaksyon yo: Pa gen okenn gwo anomali depisté jodi a, men gen yon frè transpò ki depase limit abityèl la pa 4.5% nan branch Dèlma. Yo rekòmande pou verifye liv jistifikatif la.",
      fr: "Le système a analysé les transactions : aucune anomalie majeure détectée aujourd'hui. Cependant, des frais de transport dépassent la limite habituelle de 4.5% à Delmas. Vérification conseillée.",
      en: "The system analyzed transactions: no major anomalies detected today. However, transport fees exceed the usual threshold by 4.5% at the Delmas branch. Verification is recommended."
    }
  },
  {
    icon: "📊",
    label: {
      ht: "Prévision lajan kach mwa a",
      fr: "Prévision de trésorerie ce mois",
      en: "Cash flow prediction this month"
    },
    prompt: "cashflow_prediction",
    response: {
      ht: "Avèk ritm aktyèl la, n ap kapab fèbman rive nan yon depase fonksyònman pozitif de 850,000 HTG nan dat 30 jen. Nou konseye retade kòmand gwo materyèl ki pa ijan pou sekirize kès la.",
      fr: "Au rythme actuel, nous prévoyons un excédent d'exploitation positif de 850 000 HTG d'ici le 30 juin. Nous conseillons de reporter les achats matériels non urgents pour sécuriser la trésorerie.",
      en: "Based on the current rate, we forecast a positive operating surplus of 850,000 HTG by June 30. We advise delaying non-urgent equipment purchases to preserve cash reserves."
    }
  }
];

export default function Hero({ language, onEnterApp, onNavigateToDemo }: HeroProps) {
  const t = marketingTranslations[language];

  // Specific 3D title text for Creole and other languages
  const headlineParts = {
    ht: {
      part1: "Kòmande Finans Ou.",
      part2: "Otomatize Operasyon Ou.",
      part3: "Fè Biznis Ou Grandi."
    },
    fr: {
      part1: "Pilotez vos Finances.",
      part2: "Automatisez vos Opérations.",
      part3: "Faites Grandir votre Entreprise."
    },
    en: {
      part1: "Command your Finances.",
      part2: "Automate your Operations.",
      part3: "Grow your Business."
    }
  };

  const activeHeadline = headlineParts[language] || headlineParts["ht"];

  // Mouse tracking state for ambient radial gradient background
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
  };

  // Framer Motion staggered entrance container and children variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2
      }
    }
  };

  const card1Variants = {
    hidden: { opacity: 0, x: -50, y: 30, rotateY: -10 },
    visible: { 
      opacity: 1, 
      x: 0, 
      y: 0,
      rotateY: 0,
      transition: { type: "spring", stiffness: 90, damping: 15 }
    }
  } as const;

  const card2Variants = {
    hidden: { opacity: 0, y: 50, scale: 0.9 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { type: "spring", stiffness: 100, damping: 13 }
    }
  } as const;

  const card3Variants = {
    hidden: { opacity: 0, x: 50, y: 40, rotateY: 10 },
    visible: { 
      opacity: 1, 
      x: 0, 
      y: 0,
      rotateY: 0,
      transition: { type: "spring", stiffness: 90, damping: 15 }
    }
  } as const;

  const card4Variants = {
    hidden: { opacity: 0, y: -40, scale: 0.8 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { type: "spring", stiffness: 110, damping: 14 }
    }
  } as const;

  // State for Interactive QR Attendance Card
  const [currentUserIdx, setCurrentUserIdx] = useState(0);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "success">("idle");
  const [attendanceLogs, setAttendanceLogs] = useState<string[]>([
    "08:02:14 - Connecté avec GPS ID",
    "08:10:00 - Système synchronisé"
  ]);

  // State for Gemini AI CFO Modal
  const [isGeminiOpen, setIsGeminiOpen] = useState(false);

  // Snapshot exporter service for PDF / CSV
  const exportDoc = (type: "ledger" | "payroll", format: "csv" | "pdf") => {
    let filename = "";
    let content = "";
    let mimeType = "";

    if (type === "ledger") {
      filename = `delta_ledger_snapshot_${new Date().toISOString().split("T")[0]}`;
      if (format === "csv") {
        filename += ".csv";
        mimeType = "text/csv;charset=utf-8;";
        content = [
          "Code de Transaction,Branche,Devise,Recettes,Dépenses,Date",
          "TX-LEDG091,Branche Pétion-Ville,HTG,382450.00,0.00,2026-06-19",
          "TX-LEDG092,Branche Delmas,HTG,0.00,140500.00,2026-06-19",
          "TOTAL,,HTG,382450.00,140500.00,",
          "SOLDE GENERAL,,HTG,241950.00,,",
        ].join("\n");
      } else {
        filename += ".pdf";
        mimeType = "application/pdf";
        content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 200 >>\nstream\nBT\n/F1 12 Tf\n40 750 Td\n(FINOPS FINTECH ERP REPORT) Tj\nT*\n(Delta Ledger Financial Snapshot) Tj\nT*\n(Date: 2026-06-19) Tj\nT*\n(Recettes: 382,450.00 HTG) Tj\nT*\n(Depenses: 140,500.00 HTG) Tj\nT*\n(Solde General Net: 241,950.00 HTG) Tj\nT*\n(Growth Rate: +42.1% [SUPERIOR]) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000212 00000 n\n0000000293 00000 n\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n545\n%%EOF`;
      }
    } else {
      filename = `payroll_snapshot_${new Date().toISOString().split("T")[0]}`;
      if (format === "csv") {
        filename += ".csv";
        mimeType = "text/csv;charset=utf-8;";
        content = [
          "Description,Cotisation employeur,Part Salarie,Montant Global",
          "Cotisations CNSS (6%),2490000.00,149400.00,",
          "Fonds CNS (2%),2490000.00,49800.00,",
          "Paiement Global Net,0.00,0.00,2490000.00",
          "Verification Status,,,,100% OK",
        ].join("\n");
      } else {
        filename += ".pdf";
        mimeType = "application/pdf";
        content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 200 >>\nstream\nBT\n/F1 12 Tf\n40 750 Td\n(FINOPS FINTECH ERP REPORT) Tj\nT*\n(Payroll Compliance & Deduction Snapshot) Tj\nT*\n(Date: 2026-06-19) Tj\nT*\n(Cotisations CNSS (6%): 149,400.00 HTG) Tj\nT*\n(Fonds CNS (2%): 49,800.00 HTG) Tj\nT*\n(Paiement Global: 2,490,000.00 HTG) Tj\nT*\n(Status: CNSS/CNS Compliant) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000111 00000 n\n0000000212 00000 n\n0000000293 00000 n\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n545\n%%EOF`;
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "model"; text: string }>>([
    {
      role: "model",
      text: language === "ht"
        ? "Saloutasyon! Mwen se Gemini AI Asistan Finansye ou. Mwen pare pou m kouri metrik ak done ledger ou yo. Kisa w ta renmen m verifye pou ou jodi a?"
        : "Salutations ! Je suis votre assistant financier Gemini IA. Je suis prêt à analyser vos métriques et données de comptabilité. Que voulez-vous que je vérifie aujourd'hui ?"
    }
  ]);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Auto scan simulation effect
  useEffect(() => {
    const interval = setInterval(() => {
      triggerScan();
    }, 8000);
    return () => clearInterval(interval);
  }, [currentUserIdx]);

  // Global Keyboard Shortcut: Ctrl+K / Cmd+K to open Gemini AI CFO Assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsGeminiOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const triggerScan = () => {
    if (scanState === "scanning") return;
    setScanState("scanning");
    setTimeout(async () => {
      const nextIdx = (currentUserIdx + 1) % mockCollaborators.length;
      setCurrentUserIdx(nextIdx);
      setScanState("success");
      
      const coll = mockCollaborators[nextIdx];
      let logMessage = `${coll.time} - ARRIVÉE VALIDÉE ✓ ${coll.name} (${coll.loc})`;

      // In development mode only: dynamically load simulation diagnostics without leaking into production bundles
      if (typeof process !== "undefined" && process.env.NODE_ENV === "development" || Boolean(import.meta.env.DEV)) {
        try {
          const { generateMockBadgePayload, processQRScanSimulation } = await import("../services/qrAttendanceService");
          const { MockServiceManager } = await import("../services/mock");
          
          const fakeEmployee = {
            id: `e_demo_${nextIdx}`,
            name: coll.name,
            business_id: "b1",
            branchId: "br1",
            departmentId: "d1",
            role: "EMPLOYEE" as const,
            baseSalary: 28500,
            paymentModel: "FIXED" as const,
            email: "demo@finops.corp",
            phone: "+509-3442-1100",
          };

          const payload = generateMockBadgePayload(fakeEmployee, "signed_hmac_123_" + nextIdx);
          const scanResult = processQRScanSimulation({
            qrPayload: payload,
            currentBusinessId: "b1",
            employees: [fakeEmployee],
            badges: [{
              id: `bad_demo_${nextIdx}`,
              employeeId: fakeEmployee.id,
              business_id: "b1",
              branchId: fakeEmployee.branchId,
              departmentId: "d1",
              role: "EMPLOYEE" as const,
              issuedAt: new Date().toISOString(),
              signature: "signed_hmac_123_" + nextIdx,
              qrPayload: payload
            }],
            existingRecords: []
          });

          MockServiceManager.getLogger("KioskSimulator").debug("fX Kiosk Simulated Service Log:", scanResult);
          if (scanResult.message) {
            logMessage = `${coll.time} - ${scanResult.message}`;
          }
        } catch {}
      }
      
      setAttendanceLogs(prev => [logMessage, ...prev.slice(0, 3)]);

      setTimeout(() => {
        setScanState("idle");
      }, 1800);
    }, 1200);
  };

  const handleCfoQuery = (promptId: string, queryText: string, exactResponse: string) => {
    if (isAiLoading) return;
    
    // Add user message
    setChatHistory(prev => [...prev, { role: "user", text: queryText }]);
    setIsAiLoading(true);

    setTimeout(() => {
      setChatHistory(prev => [...prev, { role: "model", text: exactResponse }]);
      setIsAiLoading(false);
    }, 1000);
  };

  const handleCustomQuerySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim() || isAiLoading) return;

    const userText = customPrompt;
    setCustomPrompt("");
    setChatHistory(prev => [...prev, { role: "user", text: userText }]);
    setIsAiLoading(true);

    // Dynamic responses based on keywords in Creole/French/English
    setTimeout(() => {
      let aiText = "";
      const queryLower = userText.toLowerCase();

      if (queryLower.includes("salè") || queryLower.includes("paie") || queryLower.includes("payroll")) {
        aiText = language === "ht" 
          ? "Sistèm nan kalkile chaj pou mwa sa a nan yon nivo 2,490,000 HTG pou 32 anplwaye. Tout taks leta ak asirans ONA (6%) gen fòmil otomatik yo aplike."
          : "Les charges salariales totales sont estimées à 2 490 000 HTG pour 32 employés ce mois-ci. Les prélèvements d'impôts et d'assurance sociale sont automatiquement calculés.";
      } else if (queryLower.includes("taks") || queryLower.includes("impôt") || queryLower.includes("tax")) {
        aiText = language === "ht"
          ? "Taks CNSS, asirans kòporasyon, ak dividann yo prepare nan tiliv fiskal la. Kounye a ou pare pou deklarasyon an san erè."
          : "Les retenues fiscales (CNSS, impôts sur le revenu) sont calculées en temps réel sur toutes vos factures et fiches de paie courantes.";
      } else {
        aiText = language === "ht"
          ? "Mwen resevwa kesyon ou an. Kòm asistan finansye an premye, mwen kapab di ke sikisal yo ap fonksyone byen epi sekirite done ou yo garanti nan nivo militè 256-bit AES."
          : "J'ai bien reçu votre question. En tant qu'assistant de gestion, je vous confirme que les agences physiques fonctionnent à plein régime et vos données financières sont chiffrées en AES-256.";
      }

      setChatHistory(prev => [...prev, { role: "model", text: aiText }]);
      setIsAiLoading(false);
    }, 1200);
  };

  const activeUser = mockCollaborators[currentUserIdx];

  return (
    <section 
      className="relative pt-12 pb-24 px-4 sm:px-6 max-w-7xl mx-auto overflow-hidden group/hero" 
      id="finops-premium-hero-3d"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Interactive mouse-glowing radial light source */}
      <motion.div 
        className="absolute pointer-events-none -z-20 rounded-full"
        animate={{
          x: mousePos.x,
          y: mousePos.y,
          opacity: isHovering ? 1 : 0.35,
        }}
        transition={{ type: "spring", damping: 30, stiffness: 120, mass: 0.8 }}
        style={{
          width: "600px",
          height: "600px",
          position: "absolute",
          top: 0,
          left: 0,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(6,182,212,0.18) 0%, rgba(20,184,166,0.05) 40%, rgba(15,23,42,0) 70%)",
        }}
        id="bg-mouse-glowing-light"
      />

      {/* Absolute Ambient Background Lights */}
      <div 
        className="absolute top-1/4 -left-1/4 w-[280px] sm:w-[400px] h-[280px] sm:h-[400px] bg-cyan-500/10 rounded-full blur-[100px] sm:blur-[120px] pointer-events-none -z-10" 
        id="bg-ambient-light-left"
      />
      <div 
        className="absolute top-1/3 -right-1/4 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bg-teal-500/10 rounded-full blur-[120px] sm:blur-[140px] pointer-events-none -z-10" 
        id="bg-ambient-light-right"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        
        {/* Left Side: Copywriting & Content */}
        <div className="lg:col-span-7 flex flex-col items-start text-left z-10" id="hero-left-content">
          
          {/* Version / Release Badge */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-950/80 to-slate-900 border border-cyan-500/30 text-cyan-400 text-[10px] sm:text-xs font-mono font-extrabold rounded-full uppercase tracking-widest inline-flex items-center gap-2 mb-6 shadow-lg shadow-cyan-950/20 backdrop-blur-md"
            id="hero-badge-container"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
            <span>FinOps Tek Pou Nou v3.1 Complète</span>
          </motion.div>

          {/* Dynamic 3D-Inspired Glass Title */}
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.10] font-sans" id="hero-headline">
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="block text-slate-150 drop-shadow-md"
            >
              {activeHeadline.part1}
            </motion.span>
            
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="block bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-500 bg-clip-text text-transparent drop-shadow-sm font-extrabold py-1"
            >
              {activeHeadline.part2}
            </motion.span>
            
            <motion.span
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="block text-slate-200"
            >
              {activeHeadline.part3}
            </motion.span>
          </h2>

          {/* Localized detailed description */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-slate-400 text-sm sm:text-base mt-6 leading-relaxed max-w-xl font-normal"
            id="hero-subtitle"
          >
            {t.hero.subtitle}
          </motion.p>

          {/* Dual Action Buttons (Interactive CTA) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
            id="hero-cta-group"
          >
            <button
              id="hero-3d-primary-cta"
              onClick={onEnterApp}
              className="group relative w-full sm:w-auto bg-gradient-to-r from-cyan-500 via-cyan-400 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 text-xs font-mono font-black px-8 py-4 rounded-xl transition duration-300 shadow-xl shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98] overflow-hidden"
            >
              {/* Button light sheen animated effect */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
              
              <span>🚀 {t.hero.ctaPrimary}</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              id="hero-3d-secondary-cta"
              onClick={onNavigateToDemo}
              className="w-full sm:w-auto bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 text-xs font-mono font-bold px-8 py-4 rounded-xl transition duration-200 cursor-pointer text-center flex items-center justify-center gap-2"
            >
              <span>{t.hero.ctaSecondary}</span>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
            </button>
          </motion.div>

          {/* Trust points line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 py-4 px-5 border border-slate-900 bg-slate-950/40 rounded-2xl w-full max-w-xl text-[11px] font-mono font-bold text-slate-500"
            id="hero-trust-indicators"
          >
            <div className="flex items-center gap-2 hover:text-cyan-300 transition duration-150">
              <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{t.hero.trustFast}</span>
            </div>
            <div className="flex items-center gap-2 hover:text-cyan-300 transition duration-150">
              <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{t.hero.trustCompliance}</span>
            </div>
            <div className="flex items-center gap-2 hover:text-cyan-300 transition duration-150">
              <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <span>{t.hero.trustQr}</span>
            </div>
          </motion.div>

        </div>

        {/* Right Side: 3D Isometric Floating Interactive Glass Workstation */}
        <div 
          className="lg:col-span-12 xl:col-span-5 relative w-full mt-8 lg:mt-0 xl:min-h-[580px] flex items-center justify-center py-6"
          id="hero-right-3d-canvas"
        >
          {/* Subtle glow for the right section */}
          <div className="absolute inset-0 bg-radial-gradient-to-c from-cyan-500/5 to-transparent pointer-events-none" />

          {/* Desktop/Tablet Isometric View vs Mobile Stacked Deck */}
          <div className="w-full max-w-lg xl:max-w-none flex flex-col md:grid md:grid-cols-2 xl:flex xl:flex-row [perspective:1400px] relative items-center justify-center gap-6 xl:gap-0">
            
            {/* Background dashed graphic only visible on larger viewports */}
            <div className="absolute inset-0 hidden xl:flex items-center justify-center pointer-events-none">
              <div className="w-[420px] h-[420px] rounded-full border border-dashed border-cyan-500/10 animate-[spin_120s_linear_infinite]" />
              <div className="absolute w-[300px] h-[300px] rounded-full border border-double border-teal-500/5 animate-[spin_80s_linear_infinite_reverse]" />
            </div>

            {/* MASTER CONTAINER FOR INTERACTIVE DECK CARDS */}
            <motion.div
              style={{ transformStyle: "preserve-3d" }}
              className="relative w-full xl:w-[480px] min-h-[460px] xl:h-[480px] flex flex-col xl:block items-center justify-center gap-4 xl:gap-0"
              id="node-3d-rotator"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              
              {/* CARD 1: BACKPLANE LEDGER DELTA PROGRESS CHANGER */}
              <motion.div
                variants={card1Variants}
                className="w-full sm:w-[280px] xl:absolute xl:top-4 xl:left-0 z-10"
              >
                <motion.div
                  // Continuous Float animation
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                  whileHover={{ 
                    scale: 1.05, 
                    rotateX: 8, 
                    rotateY: -6, 
                    z: 20,
                    transition: { type: "spring", stiffness: 300, damping: 20 }
                  }}
                  className="bg-slate-950/75 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md origin-center"
                  style={{ transformStyle: "preserve-3d" }}
                  id="hero-card-ledger-delta"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg flex items-center justify-center">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 font-bold tracking-tight uppercase">Delta Ledger</span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded font-extrabold">+42.1%</span>
                  </div>

                  <div className="space-y-2 font-mono">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[11px] text-slate-500">Recettes</span>
                      <span className="text-xs text-slate-100 font-extrabold text-right">382,450 HTG</span>
                    </div>
                    <div className="flex justify-between items-baseline border-t border-slate-900 pt-1.5">
                      <span className="text-[11px] text-slate-500">Dépenses</span>
                      <span className="text-xs text-slate-100 font-bold text-right text-red-400">140,500 HTG</span>
                    </div>
                    
                    {/* Small Bar Visualizer */}
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden mt-3">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: "63%" }} />
                    </div>

                    {/* Action buttons for Export */}
                    <div className="flex gap-2 mt-4 pt-2 border-t border-slate-900/40">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportDoc("ledger", "csv");
                        }}
                        className="flex-1 py-1 px-1.5 bg-slate-900/60 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/20 rounded text-[9px] font-mono font-bold tracking-tight transition cursor-pointer flex items-center justify-center gap-1"
                        title="Exporter en format CSV (Delta Ledger)"
                      >
                        <Download className="w-2.5 h-2.5" /> CSV
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportDoc("ledger", "pdf");
                        }}
                        className="flex-1 py-1 px-1.5 bg-slate-900/60 hover:bg-cyan-500/10 text-slate-400 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/20 rounded text-[9px] font-mono font-bold tracking-tight transition cursor-pointer flex items-center justify-center gap-1"
                        title="Exporter en format PDF (Delta Ledger)"
                      >
                        <Download className="w-2.5 h-2.5" /> PDF
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>


              {/* CARD 2: CENTRIC MAIN KIOSK SCANNER - HIGHLY INTERACTIVE */}
              <motion.div
                variants={card2Variants}
                className="w-full sm:w-[320px] xl:absolute xl:top-1/4 xl:left-12 xl:-translate-x-4 z-20"
              >
                <motion.div
                  // Continuous Float animation
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
                  whileHover={{ 
                    scale: 1.04, 
                    rotateX: -6, 
                    rotateY: 8, 
                    z: 35,
                    transition: { type: "spring", stiffness: 300, damping: 20 }
                  }}
                  onClick={triggerScan}
                  className="bg-gradient-to-b from-slate-900/80 to-slate-950/95 border border-cyan-500/30 rounded-2xl p-5 shadow-[0_20px_50px_rgba(6,182,212,0.18)] backdrop-blur-xl cursor-pointer group relative overflow-hidden origin-center"
                  style={{ transformStyle: "preserve-3d" }}
                  id="hero-card-kiosk-qr"
                >
                  {/* CSS-based 'scanning laser' overlay effect powered by Framer Motion */}
                  <AnimatePresence>
                    {scanState === "scanning" && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none z-10"
                      >
                        {/* Glow tint overlay */}
                        <div className="absolute inset-0 bg-cyan-500/[0.04] backdrop-blur-[0.5px]" />
                        
                        {/* Scanning Laser Line */}
                        <motion.div
                          initial={{ top: "0%" }}
                          animate={{ top: "100%" }}
                          transition={{
                            repeat: Infinity,
                            repeatType: "reverse",
                            duration: 1.8,
                            ease: "easeInOut"
                          }}
                          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee]"
                        >
                          {/* Laser glow flare tail */}
                          <div className="absolute inset-x-0 -bottom-10 h-10 bg-cyan-400/5 blur-sm" />
                          <div className="absolute inset-x-0 -top-10 h-10 bg-cyan-400/5 blur-sm" />
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Visual scan bar active states for non-scan situations */}
                  {scanState !== "scanning" && (
                    <div 
                      className={`absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent transition-all duration-350 ${
                        scanState === "success" 
                          ? "top-1/2 opacity-100 bg-emerald-400" 
                          : "opacity-30 top-1/4"
                      }`} 
                    />
                  )}

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-inner transition-all duration-305 ${
                        scanState === "scanning" 
                          ? "bg-cyan-500/25 text-cyan-300 rotate-180" 
                          : "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
                      }`}>
                        <QrCode className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-100 uppercase">Borne Kiosque fX</h4>
                        <p className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Prezan & Verifikasyon</p>
                      </div>
                    </div>
                    
                    {/* Glowing Status badge */}
                    <motion.span 
                      animate={{ scale: scanState === "scanning" ? [1, 1.08, 1] : 1 }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className={`text-[9px] font-mono px-2 py-0.5 rounded font-black uppercase tracking-wider transition-colors duration-200 ${
                        scanState === "scanning" 
                          ? "bg-amber-500/15 border border-amber-500/25 text-amber-400" 
                          : scanState === "success" 
                          ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400" 
                          : "bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                      }`}
                    >
                      {scanState === "scanning" ? "Y AP ESCANNE..." : scanState === "success" ? "OK ✓" : "EN ATANT..."}
                    </motion.span>
                  </div>

                  {/* Simulated Terminal Readout */}
                  <div className="bg-slate-950/90 border border-slate-900 rounded-xl p-3.5 space-y-2.5 font-mono text-[10px]">
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="text-slate-550">Collaborateur :</span>
                      <span className="font-bold text-slate-200 truncate max-w-[150px]">
                        {scanState === "scanning" ? "Vérification..." : activeUser.name}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="text-slate-550">Heure & GPS :</span>
                      <span className="text-cyan-400 font-extrabold flex items-center gap-1">
                        <Clock className="w-3" /> {activeUser.time}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-900 pt-2 text-[9px]">
                      <span className="text-slate-550 uppercase tracking-tight truncate max-w-[130px]">{activeUser.loc}</span>
                      <span className="text-emerald-400 flex items-center gap-1 font-bold">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" /> {activeUser.status}
                      </span>
                    </div>
                  </div>

                  {/* Micro interactivity trigger helper */}
                  <div className="mt-3 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1 text-cyan-455 font-bold">
                      <Activity className="w-3 h-3 animate-pulse" /> Klike pou simile scan
                    </span>
                    <span className="text-slate-500 text-[8px] uppercase">v3.1 IP-GPS</span>
                  </div>
                </motion.div>
              </motion.div>


              {/* CARD 3: FORENSIC PAYROLL CRUNCHER CARD (High Outside Depth Z-Index) */}
              <motion.div
                variants={card3Variants}
                className="w-full sm:w-[280px] xl:absolute xl:bottom-4 xl:right-6 z-10"
              >
                <motion.div
                  // Continuous Float animation
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                  whileHover={{ 
                    scale: 1.05, 
                    rotateX: 6, 
                    rotateY: 8, 
                    z: 18,
                    transition: { type: "spring", stiffness: 300, damping: 20 }
                  }}
                  className="bg-gradient-to-tr from-slate-950 to-slate-900/80 border border-teal-500/20 rounded-2xl p-4.5 shadow-[0_25px_60px_rgba(20,184,166,0.12)] backdrop-blur-md origin-center"
                  style={{ transformStyle: "preserve-3d" }}
                  id="hero-card-payroll-calculator"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded font-black uppercase">Calcul Paie</span>
                    <div className="w-6 h-6 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-md flex items-center justify-center">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs font-sans">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">Charges Fiscales</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[11px] text-slate-300 font-medium">Cotisations CNSS (6%)</span>
                        <span className="text-[11px] font-mono text-slate-200 font-bold">Calculé</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[11px] text-slate-300 font-medium">Fonds CNS (2%)</span>
                        <span className="text-[11px] font-mono text-slate-200 font-bold">Calculé</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-900 pt-2">
                      <span className="text-[9px] font-mono text-slate-500 uppercase block tracking-wider">Paiement Global</span>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-xs text-white font-extrabold">2,490,000 HTG</span>
                        <span className="text-[10px] font-mono text-slate-400">100% OK</span>
                      </div>
                    </div>

                    {/* Action buttons for Export */}
                    <div className="flex gap-2 mt-4 pt-2 border-t border-slate-900/40">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportDoc("payroll", "csv");
                        }}
                        className="flex-1 py-1 px-1.5 bg-slate-900/60 hover:bg-teal-500/10 text-slate-400 hover:text-teal-400 border border-slate-800 hover:border-teal-500/20 rounded text-[9px] font-mono font-bold tracking-tight transition cursor-pointer flex items-center justify-center gap-1"
                        title="Exporter en format CSV (Calcul Paie)"
                      >
                        <Download className="w-2.5 h-2.5" /> CSV
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportDoc("payroll", "pdf");
                        }}
                        className="flex-1 py-1 px-1.5 bg-slate-900/60 hover:bg-teal-500/10 text-slate-400 hover:text-teal-400 border border-slate-800 hover:border-teal-500/20 rounded text-[9px] font-mono font-bold tracking-tight transition cursor-pointer flex items-center justify-center gap-1"
                        title="Exporter en format PDF (Calcul Paie)"
                      >
                        <Download className="w-2.5 h-2.5" /> PDF
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>


              {/* CARD 4: GEMINI AI CFO HELPER BUBBLE */}
              <motion.div
                variants={card4Variants}
                className="w-full sm:w-[240px] xl:absolute xl:-top-10 xl:right-4 z-30"
              >
                <motion.div
                  // Continuous Float animation
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
                  whileHover={{ 
                    scale: 1.08, 
                    rotateX: -8, 
                    rotateY: -6, 
                    z: 32,
                    transition: { type: "spring", stiffness: 300, damping: 20 }
                  }}
                  onClick={() => setIsGeminiOpen(true)}
                  className="bg-gradient-to-r from-cyan-950/40 via-slate-900/95 to-teal-950/40 border border-cyan-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-xl cursor-pointer group hover:shadow-cyan-500/20 transition-all duration-300 text-left origin-center"
                  style={{ transformStyle: "preserve-3d" }}
                  id="hero-card-gemini-bubble"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded bg-gradient-to-tr from-cyan-400 to-teal-400 flex items-center justify-center text-slate-950">
                        <Cpu className="w-3 h-3 text-slate-950 animate-spin" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-200 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-cyan-300 animate-pulse" /> Gemini AI CFO
                      </span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  </div>
                  <p className="text-[9.5px] font-mono text-slate-350 leading-relaxed group-hover:text-cyan-150 transition-colors">
                    "Petyonvil gen <strong className="text-cyan-300">+18% randman</strong>. Klike pou w mande m nenpòt bagay sou finans ou."
                  </p>
                  <div className="mt-2.5 pt-1.5 border-t border-slate-900/80 flex items-center justify-between text-[8px] text-cyan-400 font-mono font-bold uppercase tracking-wider">
                    <span>Poze m kesyon</span>
                    <ArrowUpRight className="w-3 h-3 text-cyan-400" />
                  </div>
                </motion.div>
              </motion.div>

            </motion.div>
          </div>
        </div>

      </div>

      {/* FLOATING DIALOG: GEMINI AI CFO ASSISTANT MODAL */}
      <AnimatePresence>
        {isGeminiOpen && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="gemini-assistant-portal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900/95 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl shadow-cyan-500/10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-500 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-slate-100 font-sans flex items-center gap-1.5">
                      Gemini AI CFO Assistant 
                      <span className="bg-cyan-500/15 text-cyan-400 text-[8px] font-mono py-0.5 px-2 rounded-full uppercase font-bold text-right tracking-tight">Active Beta</span>
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono truncate max-w-[250px]">Konekte ak Done Ledger Enpòte</p>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setIsGeminiOpen(false);
                  }}
                  className="w-8 h-8 rounded-full bg-slate-950/80 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat Canvas Section */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin scrollbar-thumb-slate-800 max-h-[50vh]">
                
                {/* Greeting / Initial assistant text */}
                <div className="flex gap-3 text-left">
                  <div className="w-7 h-7 rounded bg-cyan-950 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-3.5 max-w-[85%]">
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {language === "ht" 
                        ? "Bonjou! Mwen se asistan AI CFO ou. Chwazi yon opsyon byen rapid anba a oswa ekri yon kesyon pou m analize bidjè ak anplwaye yo."
                        : "Bonjour ! Je suis votre assistant virtuel IA CFO. Sélectionnez une question rapide ci-dessous ou saisissez votre requête personnalisée."
                      }
                    </p>
                  </div>
                </div>

                {/* Question Suggestion Pills (Rapid Actions) */}
                <div className="pt-2">
                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-2 text-left">Gid Kezyon rapid :</span>
                  <div className="space-y-2 flex flex-col items-start">
                    {cfoPrompts.map((p, idx) => {
                      const localLabel = p.label[language] || p.label["ht"];
                      const localResponse = p.response[language] || p.response["ht"];
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleCfoQuery(p.prompt, localLabel, localResponse)}
                          className="bg-slate-950 hover:bg-slate-950/40 border border-slate-850 hover:border-cyan-500/30 text-slate-300 hover:text-cyan-300 text-xs py-2.5 px-4 rounded-xl text-left transition duration-150 flex items-center gap-2.5 w-full font-sans cursor-pointer"
                        >
                          <span className="text-base shrink-0">{p.icon}</span>
                          <span>{localLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dialog thread */}
                {chatHistory.map((chat, idx) => (
                  <div key={idx} className={`flex gap-3 text-left ${chat.role === "user" ? "justify-end" : "justify-start"}`}>
                    {chat.role === "model" && (
                      <div className="w-7 h-7 rounded bg-teal-950 border border-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                      chat.role === "user" 
                        ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-right" 
                        : "bg-slate-950/60 border border-slate-850 text-slate-200"
                    }`}>
                      <p className="font-sans whitespace-pre-wrap">{chat.text}</p>
                    </div>
                  </div>
                ))}

                {/* Loading State Spinner */}
                {isAiLoading && (
                  <div className="flex gap-3 text-left items-center pt-2">
                    <div className="w-7 h-7 rounded bg-cyan-950 text-cyan-400 flex items-center justify-center shrink-0">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-505 animate-pulse">Gemini ap kouri analiz operasyon...</span>
                  </div>
                )}
              </div>

              {/* Input Form Footer */}
              <form onSubmit={handleCustomQuerySubmit} className="p-4 border-t border-slate-800/80 bg-slate-950/40" id="gemini-modal-form">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={
                      language === "ht" 
                        ? "Mande sou salè, taks oswa anplwaye..." 
                        : "Posez une question sur la paie, impôts..."
                    }
                    className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 flex-1 font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!customPrompt.trim() || isAiLoading}
                    className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 rounded-xl flex items-center justify-center transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Send className="w-4 h-4 text-slate-950" />
                  </button>
                </div>
              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
