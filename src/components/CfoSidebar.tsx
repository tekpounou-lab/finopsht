import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { safeFetchJson } from "../utils/safeFetch";
import { 
  X, 
  Send, 
  Brain, 
  Sparkles, 
  ShieldAlert, 
  AlertCircle, 
  TrendingUp, 
  User, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Bot,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  Lock
} from "lucide-react";
import { useI18n } from "../i18n";
import { useAnalytics } from "../domains/analytics/context/AnalyticsContext";
import { useBusinessContext } from "../contexts/BusinessContext";
import { 
  useLedgerTransactions, 
  useAttendanceRecords, 
  usePayrollRecords 
} from "../hooks/useRepositories";
import { Business, Branch, Department } from "../types";
import { toast } from "sonner";

interface CfoSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentBusiness: Business;
  currentBranch: Branch | null;
}

interface CFOReport {
  summary: string;
  metrics: {
    cash_flow: string;
    fraud_risk: string;
    profit_ratio: string;
    financial_health_score?: number;
  };
  alerts: { type: "info" | "warning" | "success"; text: string }[];
  recommendations: string[];
  chartsData?: { name: string; value: number }[];
  predictions?: {
    next_fortnight_payroll: number;
    end_of_month_cash_flow: number;
    absenteeism_rate_percentage: number;
    budget_overrun_risk: "FAIBLE" | "MOYEN" | "ÉLEVÉ" | "LOW" | "NORMAL" | "HIGH";
    estimated_monthly_profit: number;
    forecast_justification: string;
  };
}

interface Message {
  id: string;
  sender: "user" | "cfo";
  timestamp: Date;
  text: string;
  report?: CFOReport;
}

export default function CfoSidebar({ isOpen, onClose, currentBusiness, currentBranch }: CfoSidebarProps) {
  const { language } = useI18n();
  const { snapshot } = useAnalytics();
  const { business, branches, departments, employees } = useBusinessContext();
  const currentLang = (language === "fr" || language === "ht" || language === "en") ? language : "fr";

  // Data hook inputs
  const employeesList = employees || [];
  const ledgerTransactions = useLedgerTransactions(business?.id);
  const attendanceRecords = useAttendanceRecords(business?.id);
  const payrollRecords = usePayrollRecords(business?.id);

  // Component States
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Section Accordions
  const [expandedSections, setExpandedSections] = useState<Record<string, Record<string, boolean>>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Localized Dictionaries
  const dict = {
    title: {
      fr: "IA CFO Copilote",
      ht: "Kopilòt IA CFO",
      en: "AI CFO Copilot"
    },
    subtitle: {
      fr: "Auditeur financier & légal instantané",
      ht: "Oditè finans ak lwa travay rapid",
      en: "Real-time legal & financial auditor"
    },
    inputPlaceholder: {
      fr: "Posez votre question financière...",
      ht: "Mande m sou kès oubyen anplwaye yo...",
      en: "Ask your financial question..."
    },
    presetsHeader: {
      fr: "Questions suggérées :",
      ht: "Eseye mande chèf la :",
      en: "Suggested inquiries:"
    },
    welcomeMessage: {
      fr: "Bonjour ! Je suis votre IA CFO. Je peux auditer votre Grand Livre, valider la conformité fiscale de la paie (CNSS 6%, CNS 2%), détecter les anomalies de pointage des employés et prédire vos cycles de trésorerie. Comment puis-je vous guider aujourd'hui ?",
      ht: "Bonjou ! Mwen se asistan finansyè IA CFO ou. Mwen ka kontwole liv kontab ou, tcheke si asirans CNSS ak CNS yo kòrèk, analize reta ak absans travayè yo, epi predi bidjè w. Kijan mwen ka ede w jodi a?",
      en: "Hello! I am your AI CFO. I can audit your General Ledger, validate legal payroll deductions (CNSS 6%, CNS 2%), discover employee timesheet variations, and forecast cash flow. How can I guide you today?"
    },
    scoreLabel: {
      fr: "Score de Santé",
      ht: "Nòt Sante Kès",
      en: "Health Score"
    },
    cashFlowLabel: {
      fr: "Flux de Trésorerie",
      ht: "Mouvman Lajan",
      en: "Cash Flow Status"
    },
    fraudLabel: {
      fr: "Risque de Fraude",
      ht: "Risk Frod / Erè",
      en: "Fraud Risk Level"
    },
    marginLabel: {
      fr: "Marge Bénéficiaire",
      ht: "Maje Benefis",
      en: "Operating Margin"
    },
    alertsHeader: {
      fr: "Signaux & Alertes",
      ht: "Siyal ak Avètisman",
      en: "Signals & Alerts"
    },
    recommendationsHeader: {
      fr: "Directives Stratégiques",
      ht: "Konsèy & Aksyon",
      en: "Strategic Directives"
    },
    predictionsHeader: {
      fr: "Prévisions & Horoscopes IA",
      ht: "Previzyon Finansyè",
      en: "Predictive Projections"
    },
    predPayroll: {
      fr: "Masse Salariale Estimée",
      ht: "Salè pwochen kenzèn",
      en: "Next Fortnight Payroll"
    },
    predCash: {
      fr: "Trésorerie Projetée (Fin de mois)",
      ht: "Kès nan fen mwa a",
      en: "EOM Cash Forecast"
    },
    predProfit: {
      fr: "Bénéfice Mensuel Estimé",
      ht: "Benefis Nèt mwa a",
      en: "Est. Monthly Net"
    },
    predAbsent: {
      fr: "Taux d'Absentéisme",
      ht: "Pousantaj absans",
      en: "Absenteeism Rate"
    },
    predRisk: {
      fr: "Risque de Dépassement",
      ht: "Risk depase bidjè",
      en: "Budget Overrun Risk"
    },
    presetAudits: [
      {
        label: {
          fr: "Analyse Générale de Santé",
          ht: "Sante Finansyè Konpayi an",
          en: "General Health Audit"
        },
        text: {
          fr: "Donne-moi un rapport global sur la rentabilité de l'entreprise et la santé du flux de trésorerie.",
          ht: "Ban m yon analiz rapid sou jan kès la ap mache ak kote nou ka fè plis benefis.",
          en: "Give me an overall report on corporate profitability and cash flow health."
        }
      },
      {
        label: {
          fr: "Contre-Audit des Fraudes (Pointage)",
          ht: "Analiz Frod ak Reta Pointage",
          en: "Timesheet & Fraud Audit"
        },
        text: {
          fr: "Vérifie les anomalies de pointage, les ajustements manuels sans motif et les risques d'absentéisme des employés.",
          ht: "Tcheke si gen travayè ki chanje lè yo te antre san rezon oubyen si gen gwo risk reta.",
          en: "Audit timesheet anomalies, manual overrides without reasons, and employee roster fraud risks."
        }
      },
      {
        label: {
          fr: "Conformité Légale (CNSS/CNS)",
          ht: "Kontwòl Retni Legal CNSS",
          en: "CNSS/CNS Legal Audit"
        },
        text: {
          fr: "Est-ce que les retenues salariales de CNSS (6%) et CNS (2%) sont conformes à la loi haïtienne sur le dernier cycle ?",
          ht: "Èske asirans ak taks CNSS (6%) ak CNS (2%) yo kalkile kòrèk daprè lwa travay Ayiti a?",
          en: "Are employee wage deductions for CNSS (6%) and CNS (2%) compliant with Haitian labour code?"
        }
      }
    ]
  };

  // Scroll chat window to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, loading]);

  // Load welcome message when first opening
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          sender: "cfo",
          timestamp: new Date(),
          text: dict.welcomeMessage[currentLang]
        }
      ]);
    }
  }, []);

  const handleToggleSection = (messageId: string, sectionKey: string) => {
    setExpandedSections(prev => {
      const msgSections = prev[messageId] || {};
      return {
        ...prev,
        [messageId]: {
          ...msgSections,
          [sectionKey]: !msgSections[sectionKey]
        }
      };
    });
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputVal;
    if (!textToSend.trim() || loading) return;

    setInputVal("");
    const userMsgId = "msg_user_" + Math.random().toString(36).substring(2, 9);
    const newMsg: Message = {
      id: userMsgId,
      sender: "user",
      timestamp: new Date(),
      text: textToSend
    };

    setMessages(prev => [...prev, newMsg]);
    setLoading(true);

    try {
      const reportData: CFOReport = await safeFetchJson<CFOReport>("/api/cfo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: currentBusiness,
          branch: currentBranch,
          employees: employeesList,
          ledger: ledgerTransactions,
          attendance: attendanceRecords,
          payroll: payrollRecords,
          userQuestion: textToSend,
          snapshot
        })
      });

      const aiMsgId = "msg_ai_" + Math.random().toString(36).substring(2, 9);
      
      setMessages(prev => [
        ...prev,
        {
          id: aiMsgId,
          sender: "cfo",
          timestamp: new Date(),
          text: reportData.summary || "Synthèse indisponible.",
          report: reportData
        }
      ]);

      // Expand main sections by default for the new response
      setExpandedSections(prev => ({
        ...prev,
        [aiMsgId]: {
          metrics: true,
          alerts: reportData.alerts && reportData.alerts.length > 0,
          recommendations: true,
          predictions: false
        }
      }));

    } catch (err) {
      console.error("CFO Sidebar API error:", err);
      toast.error(currentLang === "fr" ? "Erreur de communication avec l'IA CFO" : "Error querying AI CFO");
      
      // Fallback message
      setMessages(prev => [
        ...prev,
        {
          id: "err_" + Date.now(),
          sender: "cfo",
          timestamp: new Date(),
          text: currentLang === "fr" 
            ? "Oups ! Je n'ai pas pu générer l'analyse financière. Veuillez vérifier votre connexion ou rééssayer." 
            : "Oops! I couldn't perform the financial audit right now. Please try again later."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm cursor-pointer"
            id="cfo-sidebar-backdrop"
          />

          {/* Sidebar drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] md:w-[520px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col font-sans"
            id="cfo-sidebar-drawer"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 backdrop-blur-xl" id="cfo-sidebar-header">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 border border-indigo-400/30">
                  <Brain className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-100 flex items-center gap-2 uppercase tracking-[0.2em]">
                    {dict.title[currentLang]}
                    <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                  </h3>
                  <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.15em] leading-tight mt-0.5">{dict.subtitle[currentLang]}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 text-slate-400 hover:text-slate-100 transition-all active:scale-95 shadow-sm"
                  title="Close"
                  id="cfo-close-btn"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Chat Panel Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/20" id="cfo-sidebar-chats">
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                const sections = expandedSections[msg.id] || {};

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
                    id={`chat-msg-${msg.id}`}
                  >
                    {/* Timestamp & Name */}
                    <div className="flex items-center gap-1 px-1 text-[9px] font-mono text-slate-500">
                      {isUser ? (
                        <>
                          <span className="font-bold text-slate-400">OPERATOR</span>
                          <span>•</span>
                          <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </>
                      ) : (
                        <>
                          <Bot className="w-3 h-3 text-cyan-400" />
                          <span className="font-bold text-indigo-400">IA CFO</span>
                          <span>•</span>
                          <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </>
                      )}
                    </div>

                    {/* Chat Bubble container */}
                    <div className={`max-w-[95%] p-5 rounded-2xl border text-xs leading-relaxed shadow-xl ${
                      isUser
                        ? "bg-slate-800 border-slate-700 text-slate-100 rounded-tr-none font-bold tracking-tight"
                        : "bg-slate-900/90 border-slate-800 text-slate-200 rounded-tl-none backdrop-blur-md"
                    }`}>
                      {/* Message Narrative Body */}
                      <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>

                      {/* AI Report Data Renderer */}
                      {!isUser && msg.report && (
                        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3" id="cfo-analysis-cards">
                          
                          {/* 1. Health Score Ring & Highlight Metrics */}
                          <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/50">
                            <button 
                              onClick={() => handleToggleSection(msg.id, "metrics")}
                              className="w-full flex items-center justify-between text-[11px] font-bold text-slate-350 uppercase font-mono cursor-pointer"
                            >
                              <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Metrics & Score</span>
                              {sections.metrics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>

                            {sections.metrics && (
                              <div className="mt-3 grid grid-cols-12 gap-3.5 items-center">
                                {/* Score Ring */}
                                {typeof msg.report.metrics.financial_health_score === "number" && (
                                  <div className="col-span-4 flex flex-col items-center">
                                    <div className="relative w-14 h-14 flex items-center justify-center">
                                      <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="28" cy="28" r="24" stroke="#1e293b" strokeWidth="4" fill="transparent" />
                                        <circle 
                                          cx="28" 
                                          cy="28" 
                                          r="24" 
                                          stroke={msg.report.metrics.financial_health_score >= 80 ? "#10b981" : msg.report.metrics.financial_health_score >= 50 ? "#f59e0b" : "#f43f5e"} 
                                          strokeWidth="4" 
                                          fill="transparent" 
                                          strokeDasharray={150.7}
                                          strokeDashoffset={150.7 - (150.7 * msg.report.metrics.financial_health_score) / 100}
                                        />
                                      </svg>
                                      <span className="absolute text-xs font-black font-mono text-slate-100">{msg.report.metrics.financial_health_score}%</span>
                                    </div>
                                    <span className="text-[8.5px] uppercase font-bold text-slate-500 font-mono mt-1">{dict.scoreLabel[currentLang]}</span>
                                  </div>
                                )}

                                {/* Metrics indicators */}
                                <div className={typeof msg.report.metrics.financial_health_score === "number" ? "col-span-8 space-y-2" : "col-span-12 space-y-2"}>
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-500 font-mono uppercase">{dict.cashFlowLabel[currentLang]}</span>
                                    <span className="font-bold text-slate-300 font-mono">{msg.report.metrics.cash_flow}</span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-500 font-mono uppercase">{dict.fraudLabel[currentLang]}</span>
                                    <span className={`font-bold font-mono px-2 py-0.5 rounded text-[9px] uppercase ${
                                      msg.report.metrics.fraud_risk.toLowerCase().includes("faible") || msg.report.metrics.fraud_risk.toLowerCase().includes("low")
                                        ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                                        : msg.report.metrics.fraud_risk.toLowerCase().includes("moyen") || msg.report.metrics.fraud_risk.toLowerCase().includes("normal")
                                        ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                                        : "text-rose-450 bg-rose-500/10 border border-rose-500/20"
                                    }`}>
                                      {msg.report.metrics.fraud_risk}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="text-slate-500 font-mono uppercase">{dict.marginLabel[currentLang]}</span>
                                    <span className="font-bold text-cyan-400 font-mono">{msg.report.metrics.profit_ratio}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 2. Signals & Alerts */}
                          {msg.report.alerts && msg.report.alerts.length > 0 && (
                            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/50">
                              <button 
                                onClick={() => handleToggleSection(msg.id, "alerts")}
                                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-350 uppercase font-mono cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> {dict.alertsHeader[currentLang]} ({msg.report.alerts.length})</span>
                                {sections.alerts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              {sections.alerts && (
                                <div className="mt-2.5 space-y-1.5">
                                  {msg.report.alerts.map((alert, index) => (
                                    <div 
                                      key={index} 
                                      className={`p-2 rounded-lg border text-[10.5px] flex items-start gap-1.5 leading-snug ${
                                        alert.type === "warning"
                                          ? "bg-rose-500/5 border-rose-500/15 text-rose-300"
                                          : alert.type === "success"
                                          ? "bg-emerald-500/5 border-emerald-500/15 text-emerald-300"
                                          : "bg-slate-900 border-slate-800 text-slate-400"
                                      }`}
                                    >
                                      <AlertCircle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                                        alert.type === "warning" ? "text-rose-400" : alert.type === "success" ? "text-emerald-400" : "text-slate-500"
                                      }`} />
                                      <span>{alert.text}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 3. Recommendations */}
                          {msg.report.recommendations && msg.report.recommendations.length > 0 && (
                            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/50">
                              <button 
                                onClick={() => handleToggleSection(msg.id, "recommendations")}
                                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-350 uppercase font-mono cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5 text-cyan-400" /> {dict.recommendationsHeader[currentLang]}</span>
                                {sections.recommendations ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              {sections.recommendations && (
                                <div className="mt-2.5 space-y-2">
                                  {msg.report.recommendations.map((rec, index) => (
                                    <div key={index} className="flex gap-2 text-[11px] leading-relaxed text-slate-350">
                                      <span className="w-4 h-4 rounded-full bg-cyan-600/15 border border-cyan-500/20 flex items-center justify-center text-[9px] font-black text-cyan-400 shrink-0 mt-0.5">{index + 1}</span>
                                      <span>{rec}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* 4. Predictions (Phase 13E) */}
                          {msg.report.predictions && (
                            <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/50">
                              <button 
                                onClick={() => handleToggleSection(msg.id, "predictions")}
                                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-350 uppercase font-mono cursor-pointer"
                              >
                                <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> {dict.predictionsHeader[currentLang]}</span>
                                {sections.predictions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              {sections.predictions && (
                                <div className="mt-2.5 space-y-2 border-t border-slate-800/40 pt-2.5">
                                  <div className="grid grid-cols-2 gap-2 text-[10.5px]">
                                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex flex-col gap-0.5">
                                      <span className="text-[8.5px] text-slate-500 uppercase font-semibold leading-none">{dict.predPayroll[currentLang]}</span>
                                      <span className="font-bold text-slate-200 font-mono mt-1">{msg.report.predictions.next_fortnight_payroll.toLocaleString()} HTG</span>
                                    </div>
                                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex flex-col gap-0.5">
                                      <span className="text-[8.5px] text-slate-500 uppercase font-semibold leading-none">{dict.predCash[currentLang]}</span>
                                      <span className="font-bold text-emerald-400 font-mono mt-1">{msg.report.predictions.end_of_month_cash_flow.toLocaleString()} HTG</span>
                                    </div>
                                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex flex-col gap-0.5">
                                      <span className="text-[8.5px] text-slate-500 uppercase font-semibold leading-none">{dict.predProfit[currentLang]}</span>
                                      <span className="font-bold text-cyan-400 font-mono mt-1">{msg.report.predictions.estimated_monthly_profit.toLocaleString()} HTG</span>
                                    </div>
                                    <div className="p-2 bg-slate-900 border border-slate-800 rounded-lg flex flex-col gap-0.5">
                                      <span className="text-[8.5px] text-slate-500 uppercase font-semibold leading-none">{dict.predAbsent[currentLang]}</span>
                                      <span className="font-bold text-slate-200 font-mono mt-1">{msg.report.predictions.absenteeism_rate_percentage}%</span>
                                    </div>
                                  </div>
                                  
                                  <div className="p-2 rounded-lg border border-indigo-950 bg-indigo-500/5 text-[10px] text-indigo-300 italic">
                                    {msg.report.predictions.forecast_justification}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing loader indicator */}
              {loading && (
                <div className="flex flex-col gap-1.5 items-start">
                  <div className="flex items-center gap-1 px-1 text-[9px] font-mono text-slate-500">
                    <Bot className="w-3 h-3 text-cyan-400" />
                    <span className="font-bold text-indigo-400">IA CFO</span>
                  </div>
                  <div className="p-4 bg-slate-900 border border-slate-800 text-slate-400 text-xs rounded-2xl rounded-tl-none flex items-center gap-3">
                    <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-300">Génération du diagnostic IA...</span>
                      <span className="text-[9.5px] text-slate-500 font-mono mt-0.5">Calcul de CNSS, CNS et évaluation du pointage</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Suggestions presets - floating above input */}
            {messages.length === 1 && !loading && (
              <div className="p-3 bg-slate-950/60 border-t border-slate-800/80" id="cfo-sidebar-presets">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider font-mono block mb-2">{dict.presetsHeader[currentLang]}</span>
                <div className="flex flex-col gap-2">
                  {dict.presetAudits.map((preset, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendMessage(preset.text[currentLang])}
                      className="py-2 px-3 text-left bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-xs text-slate-300 font-sans font-medium rounded-xl transition-all cursor-pointer flex items-center gap-2 hover:bg-slate-850"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{preset.label[currentLang]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Bar Form */}
            <div className="p-4 border-t border-slate-800 bg-slate-950" id="cfo-sidebar-inputbar">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={dict.inputPlaceholder[currentLang]}
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
                  id="cfo-sidebar-query-input"
                />
                <button
                  type="submit"
                  disabled={loading || !inputVal.trim()}
                  className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center transition cursor-pointer select-none disabled:cursor-not-allowed disabled:text-slate-500"
                  id="cfo-sidebar-send-btn"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
