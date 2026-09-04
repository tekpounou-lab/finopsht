import React, { useState, useEffect } from "react";
import { Sparkles, Play, Plus, QrCode, RefreshCw, BarChart, CheckCircle2, ShieldEllipsis, ShieldAlert, Cpu } from "lucide-react";
import { motion } from "motion/react";
import { useAnalytics } from "../lib/analyticsHooks";
import { MarketingLanguage, marketingTranslations } from "../lib/marketingTranslations";

interface DemoPageProps {
  language: MarketingLanguage;
  onNavigateToPortal: () => void;
  onBackToWeb: () => void;
}

interface DemoLog {
  id: string;
  timestamp: string;
  module: string;
  message: string;
  status: "success" | "warning" | "info";
}

export default function DemoPage({ language, onNavigateToPortal, onBackToWeb }: DemoPageProps) {
  const t = marketingTranslations[language];
  const { trackDemo, trackCta } = useAnalytics();

  // Dynamic state simulation
  const [revenue, setRevenue] = useState(2450000);
  const [qrScans, setQrScans] = useState(18420);
  const [isSimulating, setIsSimulating] = useState(true);
  const [activeBranch, setActiveBranch] = useState("Delmas (Siège)");
  const [demoLogs, setDemoLogs] = useState<DemoLog[]>([
    { id: "1", timestamp: "19:10:05", module: "SYSTEM", message: "Initialisation du moteur de gouvernance déterministe fX OK", status: "success" },
    { id: "2", timestamp: "19:12:15", module: "QR_ATTENDANCE", message: "Scan de carte d'identité QR validé pour Loveline Altidor", status: "success" },
    { id: "3", timestamp: "19:14:20", module: "LEDGER", message: "Tranche d'avance de 7,500 HTG enregistrée immuablement", status: "info" }
  ]);

  // Contribution validation values
  const [testSalary, setTestSalary] = useState(45000);
  
  const calculatedCnss = Math.round(testSalary * 0.06);
  const calculatedCns = Math.round(testSalary * 0.02);
  const calculatedNet = testSalary - calculatedCnss - calculatedCns;

  useEffect(() => {
    if (!isSimulating) return;
    const interval = setInterval(() => {
      // Small simulated increases
      setRevenue((prev) => prev + Math.floor(Math.random() * 1500) + 100);
      setQrScans((prev) => prev + (Math.random() > 0.4 ? 1 : 0));
      
      // Add random logs to simulate actual live systems
      if (Math.random() > 0.7) {
        const modules = ["PAYROLL_ENGINE", "LEDGER", "QR_ATTENDANCE", "AI_CFO_GEMINI"];
        const selectedModule = modules[Math.floor(Math.random() * modules.length)];
        let message = "";
        let status: "success" | "warning" | "info" = "info";

        if (selectedModule === "PAYROLL_ENGINE") {
          message = "Contrôle d'écarts réglementaires CNSS automatique achevé : aucun écart détecté";
          status = "success";
        } else if (selectedModule === "LEDGER") {
          message = `Enregistrement immuable d'un reçu de vente : +${(Math.floor(Math.random() * 12000) + 500).toLocaleString()} HTG`;
          status = "success";
        } else if (selectedModule === "QR_ATTENDANCE") {
          const names = ["Cédric Milien", "Fritz-Gerald", "Theresa Jean", "Anselme Belance"];
          message = `Check-In QR approuvé pour ${names[Math.floor(Math.random() * names.length)]}`;
          status = "success";
        } else {
          message = "Gemini AI CFO : Optimisation recommandée de la masse salariale delmas-2";
          status = "warning";
        }

        const timeString = new Date().toTimeString().split(" ")[0];
        setDemoLogs((prev) => [
          { id: Math.random().toString(), timestamp: timeString, module: selectedModule, message, status },
          ...prev.slice(0, 5)
        ]);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const triggerManualScan = () => {
    trackDemo("manual_qr_scan_trigger");
    setQrScans((prev) => prev + 1);
    const timeString = new Date().toTimeString().split(" ")[0];
    setDemoLogs((prev) => [
      { id: Math.random().toString(), timestamp: timeString, module: "QR_ATTENDANCE", message: "Scan de carte d'identité QR FORCÉ MANUELLEMENT : Empreinte signature validée", status: "success" },
      ...prev
    ]);
  };

  const triggerManualTx = () => {
    trackDemo("manual_tx_creation");
    const bonus = Math.floor(Math.random() * 15000) + 5000;
    setRevenue((prev) => prev + bonus);
    const timeString = new Date().toTimeString().split(" ")[0];
    setDemoLogs((prev) => [
      { id: Math.random().toString(), timestamp: timeString, module: "LEDGER", message: `Tracé cryptographique enregistré pour un versement de +${bonus.toLocaleString()} HTG`, status: "success" },
      ...prev
    ]);
  };

  return (
    <div className="relative py-12 px-6 bg-slate-950 text-slate-100 min-h-screen font-sans overflow-hidden" id="demo-interactive-screen">
      {/* Dynamic Background Design Elements */}
      <div className="absolute top-10 right-10 w-96 h-96 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none -z-10 animate-pulse"></div>
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none -z-10"></div>

      <div className="max-w-6xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-900 pb-4">
          <button
            onClick={onBackToWeb}
            className="text-slate-400 hover:text-slate-200 text-xs font-mono font-bold uppercase cursor-pointer flex items-center gap-1.5"
          >
            ← {t.liveDemo.backBtn}
          </button>
          <button
            onClick={() => {
              trackCta("enter_full_erp_from_demo", "demo_page");
              onNavigateToPortal();
            }}
            className="bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/20 text-xs font-mono font-bold px-4 py-1.5 rounded-xl cursor-pointer transition uppercase"
          >
            Accéder au Portail ERP Complet Live →
          </button>
        </div>

        {/* Header Block */}
        <div className="text-center md:text-left max-w-3xl mb-12">
          <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold rounded-full uppercase tracking-wider inline-flex items-center gap-1 mb-3">
            <Cpu className="w-3.5 h-3.5 text-cyan-450 animate-spin" /> Interactive Sandbox Mode
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-100">
            {t.liveDemo.title}
          </h2>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            {t.liveDemo.subtitle}
          </p>
        </div>

        {/* Live ERP Indicators Header board */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8" id="live-erp-kpis-board">
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{t.liveDemo.revenue}</span>
            <span className="text-lg md:text-xl font-bold font-mono text-emerald-400 mt-1.5">
              HTG {revenue.toLocaleString()}
            </span>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{t.liveDemo.activeStaff}</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-200 mt-1.5">
              128
            </span>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{t.liveDemo.accuracy}</span>
            <span className="text-lg md:text-xl font-bold font-mono text-cyan-400 mt-1.5">
              99.97%
            </span>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between shadow-lg backdrop-blur-md">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{t.liveDemo.qrScans}</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-200 mt-1.5">
              {qrScans.toLocaleString()}
            </span>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between shadow-lg backdrop-blur-md col-span-2 md:col-span-1">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">{t.liveDemo.branches}</span>
            <span className="text-lg md:text-xl font-bold font-mono text-slate-200 mt-1.5">
              12
            </span>
          </div>
        </div>

        {/* Multi-Section Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left panel: Simulated actions & interactive controllers */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Live Controller Card */}
            <div className="bg-slate-900/55 border border-slate-800/70 rounded-2xl p-5 shadow-xl backdrop-blur-md">
              <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                <span>Centrale de Commandes de Simulation</span>
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`p-1.5 rounded-lg border text-xs font-mono font-bold transition cursor-pointer ${
                    isSimulating
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                  }`}
                  title={isSimulating ? "Mise à jour automatique ON" : "Simulation en pause"}
                >
                  {isSimulating ? "STREAMS ACTIVE ●" : "PAUSED ⏸"}
                </button>
              </h3>
              <p className="text-slate-400 text-xs mt-1.5">
                Cliquez sur les déclencheurs ci-dessous pour injecter des événements réels d'entreprise et observer la réactivité de l'ERP.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  id="btn-trigger-scan"
                  onClick={triggerManualScan}
                  className="w-full flex items-center justify-between text-left py-2 px-3.5 rounded-xl border border-slate-800 hover:border-cyan-400/40 bg-slate-950/60 text-slate-200 hover:text-cyan-400 transition cursor-pointer text-xs font-mono font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-cyan-450" /> Simuler un Scan de Badge QR
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Incursion GPS OK</span>
                </button>

                <button
                  id="btn-trigger-tx"
                  onClick={triggerManualTx}
                  className="w-full flex items-center justify-between text-left py-2 px-3.5 rounded-xl border border-slate-800 hover:border-emerald-400/40 bg-slate-950/60 text-slate-200 hover:text-emerald-400 transition cursor-pointer text-xs font-mono font-semibold"
                >
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-400" /> Insérer un Encaissement Client
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Ledger +fX</span>
                </button>
              </div>

              <div className="mt-6 border-t border-slate-800/60 pt-4">
                <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider mb-2">Succursale Active d'Analyse :</p>
                <div className="grid grid-cols-2 gap-2">
                  {["Delmas (Siège)", "Pétion-Ville branch-3", "Cap-Haïtien branch-1", "Carrefour depot-4"].map((br) => (
                    <button
                      key={br}
                      onClick={() => {
                        setActiveBranch(br);
                        trackDemo(`switch_branch_to_${br}`);
                      }}
                      className={`text-[10px] font-mono font-bold p-2 border rounded-lg text-center transition cursor-pointer ${
                        activeBranch === br
                          ? "bg-cyan-500/10 border-cyan-400 text-cyan-400 shadow-md"
                          : "bg-slate-950/20 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {br}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Local Payroll Rule Explainer Playground */}
            <div className="bg-slate-900/55 border border-slate-800/70 rounded-2xl p-5 shadow-xl backdrop-blur-md">
              <span className="text-[10px] text-cyan-400 font-bold font-mono uppercase bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-400/20 mb-3 inline-block">Moteur Legal d'Impôts de Paie</span>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                Calculateur Quinzaine Certifié
              </h3>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                Testez la distribution légale haïtienne de la CNSS (6% réparti) et CNS (2% contribution sécurité) calculée nativement par FinOps.
              </p>

              <div className="mt-4">
                <label className="text-[11px] text-slate-500 uppercase font-bold tracking-wider block mb-1">Salaire d'Engagement (HTG) :</label>
                <input
                  type="range"
                  min="15000"
                  max="150000"
                  step="5000"
                  value={testSalary}
                  onChange={(e) => setTestSalary(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-1">
                  <span>15 000 HTG</span>
                  <span className="text-cyan-400 font-bold">{testSalary.toLocaleString()} HTG</span>
                  <span>150 000 HTG</span>
                </div>
              </div>

              <div className="mt-4 space-y-2.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800 dev-calculations-board text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Cotisation CNSS (6%) :</span>
                  <span className="text-amber-400 font-bold">-{calculatedCnss.toLocaleString()} HTG</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Impôt CNS Sécurité (2%) :</span>
                  <span className="text-rose-400 font-bold">-{calculatedCns.toLocaleString()} HTG</span>
                </div>
                <hr className="border-slate-800" />
                <div className="flex justify-between items-center">
                  <span className="text-slate-200">Net Estimé Reçu :</span>
                  <span className="text-emerald-400 font-bold">{calculatedNet.toLocaleString()} HTG</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Real-time Event Ledger Feed */}
          <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-5 shadow-xl backdrop-blur-md flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between">
                <span>Flux d'Événements ERP Orchestré (Live Sandbox Feed)</span>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-450 animate-ping"></span>
                  <span className="text-[9px] text-slate-500 font-mono uppercase font-bold tracking-widest">fX Stream</span>
                </span>
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Visualisez la journalisation des transactions immuables traitées sur la succursale active <span className="text-cyan-400 font-semibold">{activeBranch}</span>.
              </p>

              <div className="mt-5 space-y-3" id="live-simulation-logs-feed">
                {demoLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-950/70 border border-slate-900 rounded-xl flex items-start gap-3 transition-all leading-normal"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      log.status === "success" ? "bg-emerald-400" : log.status === "warning" ? "bg-amber-400" : "bg-cyan-400"
                    }`} />
                    <div className="flex-1 font-mono text-[11px]">
                      <div className="flex items-center justify-between mb-0.5 text-slate-500">
                        <span className="font-bold text-slate-400 uppercase tracking-wide">[{log.module}]</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <p className="text-slate-300">{log.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom prompt action CTA */}
            <div className="mt-6 pt-4 border-t border-slate-900 bg-slate-900/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <h4 className="text-slate-200 text-xs font-bold leading-none">Prêt à tester avec vos propres équipes ?</h4>
                <p className="text-slate-400 text-[10px] mt-1 leading-tight">
                  La création de votre entreprise prend 45 secondes et est sans frais.
                </p>
              </div>
              <button
                id="btn-goto-portal-from-sandbox"
                onClick={() => {
                  trackCta("enterprise_onboarding_from_demo", "demo_page");
                  onNavigateToPortal();
                }}
                className="w-full sm:w-auto p-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-cyan-500/10 cursor-pointer text-center"
              >
                Lancer l'ERP Maintenant
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
