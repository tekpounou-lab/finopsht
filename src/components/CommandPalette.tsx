import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Brain, 
  Sparkles, 
  Command, 
  ArrowRight, 
  Activity, 
  FileSpreadsheet, 
  Fingerprint, 
  BookOpen, 
  Users, 
  Settings, 
  Cpu, 
  HelpCircle, 
  ShieldAlert, 
  X,
  VolumeX,
  Volume2,
  AlertCircle,
  Lightbulb,
  CheckCircle,
  Clock,
  GripHorizontal
} from "lucide-react";
import { useI18n } from "../i18n";
import { Business, Branch, Employee, LedgerTransaction, AttendanceRecord, PayrollRecord, Department } from "../types";
import { AICFOChatService, CFOReport } from "../services/AICFOChatService";
import { useIdentity } from "../modules/identity/IdentityContext";

interface CommandPaletteProps {
  currentBusiness: Business | null;
  currentBranch: Branch | null;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  attendanceRecords: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  departments?: Department[];
  branches?: Branch[];
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  allowedTabs?: { id: string; label: string; icon: any }[];
}

export default function CommandPalette({
  currentBusiness,
  currentBranch,
  employees,
  ledgerTransactions,
  attendanceRecords,
  payrollRecords,
  departments = [],
  branches = [],
  activeTab,
  setActiveTab,
  allowedTabs = []
}: CommandPaletteProps) {
  const { language, t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // AI CFO query state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<CFOReport | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiInquiryText, setAiInquiryText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Monitor keys for Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Autofocus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      setSearchQuery("");
      setSelectedIndex(0);
      setAiReport(null);
      setAiError(null);
      setAiInquiryText("");
    }
  }, [isOpen]);

  const navigationCommands = useMemo(() => {
    const defaultCommands = [
      { id: "dashboard", label: t.navigation?.dashboard || "Tableau de Bord", desc: "Suivi des indices d'excellence", icon: Activity },
      { id: "aicfo", label: t.navigation?.aicfo || "CFO Intelligence Artificielle", desc: "Consultations financières Gemini", icon: Brain, highlight: true },
      { id: "attendance", label: t.navigation?.attendance || "Registre de Présences QR", desc: "Pointage biométrique et conformité", icon: Fingerprint },
      { id: "payroll", label: t.navigation?.payroll || "Moteur de Liquidation Paie", desc: "Cycle CNSS, CNS et fiches de paie", icon: FileSpreadsheet },
      { id: "ledger", label: t.navigation?.ledger || "Grand Livre Comptable", desc: "Contrôle des flux financiers", icon: BookOpen },
      { id: "personnel", label: t.navigation?.personnel || "Gestion des Collaborateurs", desc: "Dossiers d'agents et rôles", icon: Users },
      { id: "planning", label: t.planning?.title || "Horaires & Shifts", desc: "Planification des tours de rôles", icon: Clock },
      { id: "forensic", label: t.navigation?.forensic || "Forensic Audit Trail", desc: "Sécurité d'état et vérification cryptographique", icon: ShieldAlert },
      { id: "settings", label: t.navigation?.settings || "Settings", desc: "Paramètres de l'entreprise locale", icon: Settings },
    ];

    if (allowedTabs && allowedTabs.length > 0) {
      return defaultCommands.filter(cmd => allowedTabs.some(t => t.id === cmd.id));
    }
    return defaultCommands;
  }, [allowedTabs]);

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return navigationCommands;
    const query = searchQuery.toLowerCase();
    return navigationCommands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.desc.toLowerCase().includes(query) ||
        cmd.id.toLowerCase().includes(query)
    );
  }, [searchQuery, navigationCommands]);

  const identityCtx = useIdentity();
  const identitySnap: any = identityCtx?.identity || null;

  const handleAiInquiry = async (customText?: string) => {
    const textToSend = customText || searchQuery;
    if (!textToSend.trim() || !currentBusiness) return;

    setIsAiLoading(true);
    setAiReport(null);
    setAiError(null);
    setAiInquiryText(textToSend);

    const userContext = identitySnap ? {
      userId: identitySnap.user_uid || identitySnap.employee?.id || "usr_cmd",
      userName: identitySnap.employee?.name || identitySnap.displayName || "Opérateur FinOps",
      userEmail: identitySnap.email || "",
      role: identitySnap.role || "OWNER",
      businessId: currentBusiness.id,
      branchId: currentBranch?.id || identitySnap.employee?.branchId || null,
      departmentId: identitySnap.employee?.departmentId || null
    } : undefined;

    try {
      const report = await AICFOChatService.queryCFO({
        business: currentBusiness,
        branch: currentBranch,
        employees,
        ledger: ledgerTransactions,
        attendance: attendanceRecords,
        payroll: payrollRecords,
        userQuestion: textToSend,
        userContext
      });
      setAiReport(report);
    } catch (err: any) {
      setAiError(err.message || "Impossible de compléter l'analyse.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSelectCommand = (cmd: typeof navigationCommands[0]) => {
    setActiveTab(cmd.id);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredCommands.length + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length + 1) % (filteredCommands.length + 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex === filteredCommands.length) {
        handleAiInquiry();
      } else if (filteredCommands[selectedIndex]) {
        handleSelectCommand(filteredCommands[selectedIndex]);
      }
    }
  };

  const content = (
    <>
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 pointer-events-none">
        <motion.div
          drag
          dragMomentum={false}
          className="pointer-events-auto cursor-grab active:cursor-grabbing"
        >
          <motion.button
            onClick={() => setIsOpen(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-3 px-6 py-3 bg-slate-900/95 border border-slate-700/50 text-slate-200 rounded-full shadow-[0_8px_40px_rgba(0,0,0,0.6)] hover:bg-slate-800 hover:border-cyan-500/50 hover:text-white transition-all duration-300 backdrop-blur-2xl text-xs font-bold border-glow group relative"
            id="kbd-command-trigger"
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripHorizontal className="w-3 h-3 text-slate-500" />
            </div>
            <div className="relative">
              <Command className="w-4 h-4 text-cyan-400" />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-cyan-400 rounded-full blur-sm"
              />
            </div>
            <span>Commandes Système</span>
            <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-slate-700/50 group-hover:border-cyan-500/30">
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 font-sans font-semibold text-[10px] bg-slate-950/80 border border-slate-800 text-slate-400 rounded-md">
                ⌘
              </kbd>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 font-sans font-semibold text-[10px] bg-slate-950/80 border border-slate-800 text-slate-400 rounded-md">
                K
              </kbd>
            </div>
          </motion.button>
        </motion.div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[10000] flex items-start justify-center pt-[10vh] px-4 pointer-events-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              ref={containerRef}
              className="relative w-full max-w-2xl bg-slate-900/95 border border-slate-800/80 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[75vh] backdrop-blur-md"
              id="global-command-palette"
            >
              <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/80 bg-slate-950/40">
                <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={
                    language === "en" 
                      ? "Search modules or ask AI (e.g. 'explain CNSS errors')..." 
                      : "Rechercher un module ou interroger l'IA (ex: 'vérifier la trésorerie')..."
                  }
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent border-none text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-0 text-sm"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <div className="flex items-center gap-1 flex-shrink-0 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">CFO Core</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {(isAiLoading || aiReport || aiError) && (
                  <div className="m-2 p-4 rounded-xl bg-slate-950/50 border border-slate-800/60 flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <span className="text-xs font-semibold text-slate-300">Auditeur Instantané CFO Intelligence</span>
                      </div>
                      <button 
                        onClick={() => {
                          setAiReport(null);
                          setAiError(null);
                          setIsAiLoading(false);
                        }}
                        className="text-slate-500 hover:text-slate-300 text-[11px]"
                      >
                        Fermer l'analyse
                      </button>
                    </div>

                    {isAiLoading && (
                      <div className="py-6 flex flex-col items-center justify-center space-y-3">
                        <div className="relative w-12 h-12 flex items-center justify-center">
                          <div className="absolute inset-0 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                          <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-300 font-medium">Analyse en temps réel de votre base de données...</p>
                          <p className="text-[10px] text-slate-500 mt-1">Interrogation des grands livres, de l'assiduité et des cotisations CNSS</p>
                        </div>
                      </div>
                    )}

                    {aiError && (
                      <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-lg flex gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-300">{aiError}</p>
                      </div>
                    )}

                    {aiReport && (
                      <div className="space-y-3 text-slate-300">
                        <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/40 p-2.5 rounded-lg border border-slate-800">{aiReport.summary}</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2 bg-slate-900/50 rounded border border-slate-800 text-center">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Flux de Trésorerie</span>
                            <span className="text-xs font-bold text-slate-200 mt-0.5 block">{aiReport.metrics?.cash_flow || "N/A"}</span>
                          </div>
                          <div className="p-2 bg-slate-900/50 rounded border border-slate-800 text-center">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Niveau Risque Frod</span>
                            <span className={`${aiReport.metrics?.fraud_risk === 'HIGH' ? 'text-rose-400' : 'text-emerald-400'} text-xs font-bold mt-0.5 block`}>{aiReport.metrics?.fraud_risk || "Faible"}</span>
                          </div>
                          <div className="p-2 bg-slate-900/50 rounded border border-slate-800 text-center">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Indice de Santé</span>
                            <span className="text-xs font-bold text-cyan-400 mt-0.5 block">{aiReport.metrics?.financial_health_score ?? 85}/100</span>
                          </div>
                        </div>

                        {aiReport.recommendations?.length > 0 && (
                          <div className="space-y-1 bg-slate-900/25 p-2.5 rounded-lg border border-slate-800/40">
                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Stratégies de Gestion Recommandées :</span>
                            <div className="space-y-1">
                              {aiReport.recommendations.map((rec, idx) => (
                                <div key={idx} className="flex gap-2 text-xs text-slate-300">
                                  <span className="text-cyan-400 flex-shrink-0">•</span>
                                  <p>{rec}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isAiLoading && (
                  <div className="space-y-1">
                    {filteredCommands.map((cmd, idx) => {
                      const isSelected = idx === selectedIndex;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => handleSelectCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all duration-150 relative ${
                            isSelected 
                              ? "bg-slate-800 text-slate-100 ring-1 ring-cyan-500/20" 
                              : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-md ${cmd.highlight ? "bg-cyan-950/60 border border-cyan-800 text-cyan-400" : "bg-slate-950/60 border border-slate-800 text-slate-400"}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-200">{cmd.label}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{cmd.desc}</p>
                            </div>
                          </div>
                          {isSelected && (
                            <ArrowRight className="w-3.5 h-3.5 text-cyan-400 animate-pulse mr-1" />
                          )}
                        </button>
                      );
                    })}

                    {searchQuery.trim().length > 0 && (
                      <button
                        onClick={() => handleAiInquiry()}
                        onMouseEnter={() => setSelectedIndex(filteredCommands.length)}
                        className={`w-full text-left p-3 rounded-lg flex items-center justify-between transition-all duration-150 ${
                          selectedIndex === filteredCommands.length
                            ? "bg-cyan-950/30 border border-cyan-800 text-cyan-300 ring-1 ring-cyan-500/20"
                            : "bg-slate-950/20 border border-slate-800/40 text-slate-400"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-md bg-cyan-950/80 border border-cyan-900 text-cyan-400">
                            <Brain className="w-4 h-4 animate-bounce" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-cyan-300">
                              Demander au CFO IA Gemini...
                            </p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Exécuter l'évaluation de : "{searchQuery.slice(0, 50)}{searchQuery.length > 50 ? '...' : ''}"
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] bg-cyan-950 border border-cyan-800 text-cyan-400 px-2 py-0.5 rounded uppercase font-semibold">
                          Entrée
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/40 text-[10px] text-slate-500 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-900 ring-1 ring-slate-800 rounded">Esc</kbd> Fermer
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-900 ring-1 ring-slate-800 rounded">↑ ↓</kbd> Naviguer
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-900 ring-1 ring-slate-800 rounded">Enter</kbd> Ouvrir Commandes
                  </span>
                </div>
                <span>FinOps "Tek Pou Nou" v1.2</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  return createPortal(content, document.body);
}
