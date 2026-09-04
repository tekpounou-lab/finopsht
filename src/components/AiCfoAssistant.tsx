import { useState, useEffect, useMemo } from "react";
import { Employee, LedgerTransaction, AttendanceRecord, PayrollRecord, Business, Branch, Department } from "../types";
import { useI18n } from "../i18n";
import { useAnalytics } from "../domains/analytics/context/AnalyticsContext";
import { safeFetchJson } from "../utils/safeFetch";
import { 
  Sparkles, 
  Send, 
  Brain, 
  AlertCircle, 
  TrendingUp, 
  Lightbulb, 
  Calendar, 
  Layers, 
  Users, 
  ShieldAlert, 
  MapPin,
  Clock,
  Scale
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { SafeChartContainer } from "./ui/SafeChartContainer";

interface AiCfoProps {
  currentBusiness?: Business | null;
  currentBranch?: Branch | null;
  employees?: Employee[];
  ledgerTransactions?: LedgerTransaction[];
  attendanceRecords?: AttendanceRecord[];
  payrollRecords?: PayrollRecord[];
  departments?: Department[];
  branches?: Branch[];
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

export default function AiCfoAssistant({
  currentBusiness,
  currentBranch,
  employees = [],
  ledgerTransactions = [],
  attendanceRecords = [],
  payrollRecords = [],
  departments = [],
  branches = []
}: AiCfoProps) {
  const { language } = useI18n();
  const { snapshot } = useAnalytics();
  const [activeSegmentTab, setActiveSegmentTab] = useState<'copilot' | 'profitability' | 'forecasting'>('copilot');
  const [userInquiry, setUserInquiry] = useState<string>("");
  const [report, setReport] = useState<CFOReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Profitability selector
  const [profitabilityFocus, setProfitabilityFocus] = useState<'branch' | 'department' | 'employee'>('branch');

  const currentLang = (language === 'fr' || language === 'ht' || language === 'en') ? language : 'fr';

  const dict = {
    suiteTitle: {
      fr: "Suite d'Intelligence Analytique CFO",
      ht: "Sistèm Entèlijans Finansyè CFO",
      en: "CFO Business Intelligence Suite"
    },
    suiteDesc: {
      fr: "Direction financière, pilotage prédictif & rentabilité légale en Haïti",
      ht: "Jesyon kontabilite, previzyon ak kontwòl lwa travay an Ayiti",
      en: "Financial stewardship, predictive forecasting & Haitian legal payroll validation"
    },
    copilotTab: {
      fr: "Copilote IA Gemini",
      ht: "Kopilòt IA Gemini",
      en: "Gemini AI Copilot"
    },
    profitabilityTab: {
      fr: "Moteur de Rentabilité (13D)",
      ht: "Kalkilatè Rentabilite (13D)",
      en: "Profitability Engine (13D)"
    },
    forecastingTab: {
      fr: "Prédictions & Horoscopes IA (13E)",
      ht: "Previzyon ak Trajektwa IA (13E)",
      en: "Predictive Forecasting (13E)"
    },
    promptSectionTitle: {
      fr: "Assistant Virtuel FinOps",
      ht: "Asistan Virtiyèl FinOps",
      en: "FinOps CFO Copilot"
    },
    promptSectionSubtitle: {
      fr: "Détecter les structures, risques & anomalies",
      ht: "Eseye jwenn erè ak risk frod",
      en: "Identify ledger structures, trends & anomalies"
    },
    presetHeader: {
      fr: "Requêtes de contre-audit programmées :",
      ht: "Chwazi yon tès analiz otomatik :",
      en: "Pre-configured audit questions:"
    },
    inputPlaceholder: {
      fr: "Posez une question financière au CFO...",
      ht: "Mande CFO a yon kesyon sou kòb konpayi an...",
      en: "Ask your AI CFO a financial question..."
    },
    loadingText: {
      fr: "Audit profond Gemini en cours...",
      ht: "Modèl Gemini ap travay sou analiz la kounye a...",
      en: "Deep Gemini financial auditing in progress..."
    },
    loadingSubText: {
      fr: "Calcul de CNSS et diagnostic des signatures numériques",
      ht: "Kalkile taks CNSS ak kontwòl sekirite siyati yo",
      en: "Validating CNSS quotas & checking system signatures"
    },
    cashflowLabel: {
      fr: "Trésorerie",
      ht: "Lajan Travay",
      en: "Cash Flow"
    },
    fraudLabel: {
      fr: "Risque Fraude",
      ht: "Risk Frod",
      en: "Fraud Risk"
    },
    marginLabel: {
      fr: "Marge",
      ht: "Maje Benefis",
      en: "Margin Ratio"
    },
    synthesisTitle: {
      fr: "Synthèse Décisionnelle CFO",
      ht: "Rapò ak Analiz Jeneral CFO",
      en: "Back-Office CFO Synthesis"
    },
    indexLabel: {
      fr: "Index : gemini-1.5-flash",
      ht: "Modèl : gemini-1.5-flash",
      en: "Engine: gemini-1.5-flash"
    },
    directivesTitle: {
      fr: "Directives du Comité de Direction HTG",
      ht: "Konsèy pou Direktè yo (HTG)",
      en: "Strategic Boardroom Directives"
    },
    segmentedProfitabilityTitle: {
      fr: "Moteur Analytique de Rentabilité Segmenté (Phase 13D)",
      ht: "Kalkilatè Rentabilite selon chak Depatman (13D)",
      en: "Segmented Growth & Profitability Engine (Phase 13D)"
    },
    segmentedProfitabilityDesc: {
      fr: "Évaluation des contributions nettes de valeur par dimensions stratégiques de l'ERP.",
      ht: "Kontwole konbyen benefis oswa depans chak pati nan konpayi an pote.",
      en: "Evaluates exact direct income vs expenses normalized by ERP branches."
    },
    dimensionBranch: { fr: "Succursale", ht: "Sikisal", en: "Branch" },
    dimensionDept: { fr: "Département", ht: "Depatman", en: "Department" },
    dimensionStaff: { fr: "Collaborateur", ht: "Travayè", en: "Staff" },
    chartTitle: {
      fr: "Balance Revenus vs Charges (Gourdes HTG)",
      ht: "Balans Lajan Antre vs Depans (an Goud HTG)",
      en: "Revenue Inflow vs Expense Outflow Balance (HTG)"
    },
    chartIncome: { fr: "Revenus", ht: "Entré", en: "Revenues" },
    chartExpense: { fr: "Dépenses", ht: "Depans", en: "Expenses" },
    subTitleBranch: { fr: "Ventilation des Soldes de Succursale", ht: "Balans pou chak Sikisal yo", en: "Branch Location Financial Matrix" },
    subTitleDept: { fr: "Ventilation des Équilibres de Départements", ht: "Balans pou chak Depatman", en: "Operating Department Profit Splits" },
    subTitleStaff: { fr: "Tableau de Charge Salariale & Allocation de Fonds", ht: "Pil salè ak tout Lajan travayè yo koute", en: "Staff direct wage cost allocation" },
    
    // Roster tables headers
    thBranch: { fr: "Succursale", ht: "Sikisal", en: "Branch" },
    thDept: { fr: "Département", ht: "Depatman", en: "Department" },
    thIn: { fr: "Revenus", ht: "Lajan Antre", en: "Revenues" },
    thOut: { fr: "Dépenses", ht: "Depans", en: "Expenses" },
    thProfit: { fr: "Bénéfice Net", ht: "Benefis Nèt", en: "Net Profit" },
    thRatio: { fr: "Ratio Rentabilité", ht: "Ratio", en: "Ratio" },
    thStaff: { fr: "Collaborateur", ht: "Anplwaye", en: "Employee" },
    thRole: { fr: "Rôle", ht: "Wòl", en: "Company Role" },
    thBase: { fr: "Salaire de Base", ht: "Salè de baz", en: "Base Salary" },
    thAdvances: { fr: "Avances", ht: "Avans kòb", en: "Advances Active" },
    thPaid: { fr: "Payroll Liquidé", ht: "Salè Peye", en: "Payroll Disbursed" },
    thTotalCost: { fr: "Coût Brut Total", ht: "Total kòb li koute", en: "Total Gross Cost" },

    // Predictive forecasting
    predTitle: {
      fr: "Directives Financières Prédictives FinOps (Phase 13E)",
      ht: "Vizyon ak Previzyon Finansyè FinOps (13E)",
      en: "Strategic Predictive Forecast Ledger (Phase 13E)"
    },
    predDesc: {
      fr: "Notre modèle a analysé l'historique du Grand Livre pour prédire les trajectoires de trésorerie.",
      ht: "Modèl entèlijans nou an analize tout liv kontab sot pase yo pou predi vwa kès konpayi an.",
      en: "Our heuristic algorithms analyzed general ledgers to estimate financial health prospects."
    },
    predPayroll: { fr: "Payroll Prochaine Quinzaine", ht: "Peman de semèn k ap vini", en: "Next Fortnight Payroll Spend" },
    predPayrollSubtitle: { fr: "Heures validées & commissions", ht: "Lè konfime ak komisyon yo", en: "Rostered timesheets & bonus estimate" },
    predCash: { fr: "Trésorerie Projetée (Fin du Mois)", ht: "Trésoreri nan fen mwa a", en: "Projected Cash Flow (End of Month)" },
    predCashSubtitle: { fr: "Mouvements de fonds anticipés", ht: "Lajan k ap antre ak soti", en: "Expected periodic revenue movements" },
    predProfit: { fr: "Résultat Net Mensuel Estimé", ht: "Benefis Nèt pou mwa a", en: "Estimated Monthly Net Income" },
    predProfitSubtitle: { fr: "Calcul après taxes réglementaires", ht: "Salè apre tout taks ak CNSS", en: "Calculated with tax regulations offset" },
    predAbsent: { fr: "Taux d'Absentéisme Prédit", ht: "Pousantaj reta ak absans", en: "Predicted Roster Absenteeism Rate" },
    predAbsentDesc: {
      fr: "Volume d'absences projeté selon l'assiduité historique des collaborateurs.",
      ht: "Pousantaj moun ki ka pa vini selon istorik prezans yo.",
      en: "Likely missed shifts based on legacy timesheets adherence stats."
    },
    predAbsentBadge: { fr: "Ajustement Paie Prévu", ht: "Taks chanje pa reta", en: "Roster Risk Adjusted" },
    predOverrun: { fr: "Risque de Dépassement Budgétaire", ht: "Risk pou depanse twòp", en: "Operational Overrun Budget Risk" },
    predOverrunDesc: {
      fr: "Risque de dépassement du fonds de roulement d'exploitation fixé.",
      ht: "Risk pou nou depase kòb nou te mete pou depans jeneral yo.",
      en: "Chances of exceeding the authorized operational threshold limit."
    },
    predOverrunBadge: { fr: "Fonds sous Contrôle", ht: "Kès la an sekirite", en: "Safety checks safe" },
    modelNote: { fr: "Note du Modèle Gemini : ", ht: "Mesaj ki soti nan asistan Gemini : ", en: "Gemini Model Advice Note: " },
    noDataTitle: { fr: "Pas de données prédictives", ht: "Pa gen chif previzyon kounye a", en: "No Forecast Data Computed" },
    noDataDesc: {
      fr: "Veuillez d'abord solliciter une analyse d'intelligibilité sur l'onglet Copilote.",
      ht: "Tanpri voye yon kesyon finansye nan bwat asistan Copilote la anvan pou pare previzyon yo.",
      en: "Please execute a deep financial inquiry under the Copilot tab to build predictive projections."
    }
  };

  const presetInquiries = useMemo(() => {
    return [
      { 
        label: {
          fr: "Analyse des Risques & Fraudes",
          ht: "Analiz gwo risk ak frod",
          en: "Risk & Fraud Analysis"
        }, 
        text: {
          fr: "Détecte s'il y a des anomalies, des fraudes de pointage, ou des écarts de paie pour mes employés.",
          ht: "Tcheke si gen pwoblèm, fòs pwentaj, oubyen erè nan fich peman anplwaye yo.",
          en: "Detect if there are performance anomalies, timesheet fraud, or payroll variances for my staff."
        }
      },
      { 
        label: {
          fr: "Performances Générales de l'Entreprise",
          ht: "Pèfòmans Jeneral Konpayi an",
          en: "Overall Company Performance"
        }, 
        text: {
          fr: "Résume-moi l'état de la trésorerie locale et les leviers d'amélioration opérationnelle prioritaires.",
          ht: "Bay yon rezime sou lajan ki nan kès la ak fason nou ka amelyore travay la byen vit.",
          en: "Summarize current local cash flow state and prioritize operational improvement levers."
        }
      },
      { 
        label: {
          fr: "Vérification CNSS & CNS",
          ht: "Verifikasyon Retni legal CNSS & CNS",
          en: "CNSS & CNS Deductions Compliance"
        }, 
        text: {
          fr: "Est-ce que mes calculs de retenues CNSS (6%) et CNS (2%) sont légalement corrects sur le cycle de paie ?",
          ht: "Èske kalkil pou asirans CNSS (6%) ak CNS (2%) yo fèt kòrèk daprè lwa peyi a?",
          en: "Are my calculated employee CNSS (6%) and CNS (2%) deductions legally secure for current payroll cycle?"
        }
      },
    ];
  }, []);

  const handleInquirySubmit = async (customPrompt?: string) => {
    const promptToSend = customPrompt || userInquiry;
    if (!promptToSend.trim()) return;

    setLoading(true);
    setReport(null);

    try {
      // Optimization: Slice extremely large lists to prevent PayloadTooLargeError (100mb)
      // and stay within Gemini context limits. The server also performs slicing.
      const safeBusiness = currentBusiness || {
        id: "PLATFORM_ROOT",
        name: "Instance Racine Multi-Tenant",
        currency: "HTG",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const payload = {
        business: safeBusiness,
        branch: currentBranch || null,
        employees: employees?.slice(0, 500) || [],
        ledger: ledgerTransactions?.slice(0, 1000) || [],
        attendance: attendanceRecords?.slice(0, 1000) || [],
        payroll: payrollRecords?.slice(0, 500) || [],
        userQuestion: promptToSend,
        snapshot,
      };

      const data = await safeFetchJson("/api/cfo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setReport(data);
    } catch (error: any) {
      console.error("[AiCfoAssistant] Error:", error);
      // Optional: show toast or error UI
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleInquirySubmit("Fais une analyse forensique de rentabilité globale de la PME.");
  }, [currentBusiness?.id]);

  const branchProfitabilityData = useMemo(() => {
    const activeBranches = branches.length > 0 ? branches : [{ id: "main_b", name: "Succursale Centrale" }];
    return activeBranches.map(b => {
      const txs = ledgerTransactions.filter(tx => tx.branchId === b.id || (!tx.branchId && b.id === "main_b"));
      const revenues = txs.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const expenses = txs.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + (tx.amount || 0), 0);
      return {
        id: b.id,
        name: b.name,
        revenues,
        expenses,
        profit: revenues - expenses,
        margin: revenues > 0 ? Math.round(((revenues - expenses) / revenues) * 100) : 0
      };
    });
  }, [branches, ledgerTransactions]);

  const departmentProfitabilityData = useMemo(() => {
    const activeDepts = departments.length > 0 ? departments : [
      { id: "dept_coiffure", name: "Salon Coiffure" },
      { id: "dept_onglerie", name: "Stylisme Ongulaire" }
    ];
    return activeDepts.map(d => {
      const txs = ledgerTransactions.filter(tx => tx.departmentId === d.id);
      const revenues = txs.filter(tx => tx.type === 'INCOME').reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const expenses = txs.filter(tx => tx.type === 'EXPENSE').reduce((sum, tx) => sum + (tx.amount || 0), 0);
      return {
        id: d.id,
        name: d.name,
        revenues,
        expenses,
        profit: revenues - expenses,
        margin: revenues > 0 ? Math.round(((revenues - expenses) / revenues) * 100) : 0
      };
    });
  }, [departments, ledgerTransactions]);

  const employeeCostData = useMemo(() => {
    return employees.map(emp => {
      const txs = ledgerTransactions.filter(tx => tx.employeeId === emp.id);
      const payrollTotal = payrollRecords
        .filter(pay => pay.employeeId === emp.id)
        .reduce((sum, pay) => sum + (pay.netPaid || 0), 0);

      const advancesSum = txs.filter(tx => tx.type === 'ADVANCE').reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const externalBonusSum = txs.filter(tx => tx.type === 'BONUS').reduce((sum, tx) => sum + (tx.amount || 0), 0);

      const totalDirectCost = (emp.baseSalary || 0) + payrollTotal + advancesSum + externalBonusSum;

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        baseSalary: emp.baseSalary || 0,
        advances: advancesSum,
        payrollCost: payrollTotal,
        totalDirectCost
      };
    });
  }, [employees, ledgerTransactions, payrollRecords]);

  return (
    <div className="flex flex-col gap-6 w-full" id="cfo-parent-container">

      {/* Segment controls header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 bg-slate-950/80 backdrop-blur-xl p-6 border border-white/5 rounded-3xl shadow-2xl" id="cfo-nav-bar">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 border border-indigo-400/30">
            <Brain className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-100 uppercase tracking-[0.2em]">{dict.suiteTitle[currentLang]}</h2>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-0.5">{dict.suiteDesc[currentLang]}</p>
          </div>
        </div>

        <div className="flex bg-slate-900/80 p-1.5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-inner">
          <button
            onClick={() => setActiveSegmentTab('copilot')}
            className={`px-5 py-2.5 rounded-xl transition-all duration-300 ${activeSegmentTab === 'copilot' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-200'}`}
          >
            {dict.copilotTab[currentLang]}
          </button>
          <button
            onClick={() => setActiveSegmentTab('profitability')}
            className={`px-5 py-2.5 rounded-xl transition-all duration-300 ${activeSegmentTab === 'profitability' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-100'}`}
          >
            {dict.profitabilityTab[currentLang]}
          </button>
          <button
            onClick={() => setActiveSegmentTab('forecasting')}
            className={`px-5 py-2.5 rounded-xl transition-all duration-300 ${activeSegmentTab === 'forecasting' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-100'}`}
          >
            {dict.forecastingTab[currentLang]}
          </button>
        </div>
      </div>

      {/* ==================== SEGMENT 1: CO-PILOT GEMINI ==================== */}
      {activeSegmentTab === 'copilot' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-fade-in" id="copilot-workspace">
          
          {/* Prompter console (Left) */}
          <div className="xl:col-span-5 flex flex-col gap-4">
            <div className="bg-slate-950 p-8 rounded-3xl border border-white/5 shadow-2xl" id="ai-prompter-box">
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.2em]">{dict.promptSectionTitle[currentLang]}</span>
              <h4 className="font-black text-xs text-slate-100 mt-2 mb-6 flex items-center gap-2 uppercase tracking-widest">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                {dict.promptSectionSubtitle[currentLang]}
              </h4>

              <div className="flex flex-col gap-3 mb-6" id="preset-chips">
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">{dict.presetHeader[currentLang]}</span>
                {presetInquiries.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setUserInquiry(preset.text[currentLang]);
                      handleInquirySubmit(preset.text[currentLang]);
                    }}
                    className="py-3 px-4 rounded-2xl bg-slate-900/50 border border-white/5 hover:border-cyan-500/30 text-left text-[10px] text-slate-400 font-black uppercase tracking-widest cursor-pointer transition-all hover:bg-slate-800/80 hover:text-slate-100 flex items-center gap-3 active:scale-[0.98]"
                  >
                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    </div>
                    <span>{preset.label[currentLang]}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3" id="query-submit-bar">
                <input
                  id="cfo-interactive-query"
                  type="text"
                  value={userInquiry}
                  onChange={(e) => setUserInquiry(e.target.value)}
                  placeholder={dict.inputPlaceholder[currentLang]}
                  className="flex-1 bg-slate-900 border border-white/10 rounded-2xl p-4 text-xs text-slate-100 outline-none focus:border-cyan-500/50 transition-all font-black uppercase tracking-widest placeholder:text-slate-600"
                />
                <button
                  onClick={() => handleInquirySubmit()}
                  disabled={loading || !userInquiry.trim()}
                  className="p-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs cursor-pointer flex items-center justify-center disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Results Analysis Panel (Right) */}
          <div className="xl:col-span-7 flex flex-col gap-4">
            {loading && (
              <div className="bg-slate-950 p-8 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-3 text-slate-400 font-mono" id="ai-loading-box">
                <div className="w-8 h-8 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin"></div>
                <p className="text-xs uppercase font-extrabold tracking-widest text-indigo-400 animate-pulse">{dict.loadingText[currentLang]}</p>
                <p className="text-[10px] text-slate-500 italic max-w-sm text-center">{dict.loadingSubText[currentLang]}</p>
              </div>
            )}

            {report && !loading && (
              <div className="flex flex-col gap-4 animate-fade-in" id="ai-results">
                {/* Score & quick details row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950 rounded-xl p-3 flex flex-col border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase font-bold flex items-center gap-1 font-mono">
                      <TrendingUp className="w-3 h-3 text-cyan-400" /> {dict.cashflowLabel[currentLang]}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200 mt-1">{report.metrics.cash_flow}</span>
                  </div>
                  <div className="bg-slate-950 rounded-xl p-3 flex flex-col border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase font-bold flex items-center gap-1 font-mono">
                      <ShieldAlert className="w-3 h-3 text-rose-500" /> {dict.fraudLabel[currentLang]}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200 mt-1">{report.metrics.fraud_risk}</span>
                  </div>
                  <div className="bg-slate-950 rounded-xl p-3 flex flex-col border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase font-bold flex items-center gap-1 font-mono">
                      <Scale className="w-3 h-3 text-indigo-400" /> {dict.marginLabel[currentLang]}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200 mt-1">{report.metrics.profit_ratio}</span>
                  </div>
                </div>

                {/* Synthesis view */}
                <div className="bg-slate-950 rounded-3xl p-8 border border-white/5 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Brain className="w-32 h-32 text-indigo-500" />
                  </div>
                  <div className="flex justify-between items-center mb-6 relative z-10">
                    <span className="text-[11px] uppercase font-black text-indigo-400 tracking-[0.2em]">{dict.synthesisTitle[currentLang]}</span>
                    <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest bg-slate-900 px-2 py-1 rounded-lg border border-white/5">{dict.indexLabel[currentLang]}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-loose relative z-10 font-medium">
                    {report.summary}
                  </p>
                </div>

                {/* Alerts */}
                {report.alerts && report.alerts.length > 0 && (
                  <div className="flex flex-col gap-2 font-mono text-xs">
                    {report.alerts.map((alt, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex gap-2.5 items-center ${
                          alt.type === "warning"
                            ? "bg-rose-500/5 border-rose-500/10 text-rose-400"
                            : alt.type === "success"
                            ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400"
                            : "bg-cyan-500/5 border-cyan-500/10 text-cyan-400"
                        }`}
                      >
                        <AlertCircle className={`w-4 h-4 shrink-0 ${alt.type === "warning" ? "text-rose-400" : "text-emerald-450"}`} />
                        <p>{alt.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action recommendations */}
                {report.recommendations && report.recommendations.length > 0 && (
                  <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 flex flex-col gap-3">
                    <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1 font-mono">
                      <Lightbulb className="w-3.5 h-3.5" /> {dict.directivesTitle[currentLang]}
                    </span>
                    <ul className="list-decimal list-inside text-xs text-slate-400 flex flex-col gap-2 font-mono">
                      {report.recommendations.map((rec, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SEGMENT 2: PROFITABILITY ENGINE (Phase 13D) ==================== */}
      {activeSegmentTab === 'profitability' && (
        <div className="bg-slate-950 rounded-2xl p-6 border border-white/5 space-y-6 animate-fade-in font-mono" id="profitability-workspace">
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-400" />
                {dict.segmentedProfitabilityTitle[currentLang]}
              </h3>
              <p className="text-xs text-slate-400 mt-1">{dict.segmentedProfitabilityDesc[currentLang]}</p>
            </div>

            {/* Select active Profitability Dimensions */}
            <div className="flex bg-slate-900 border border-white/5 rounded-lg p-1 text-xs">
              <button
                onClick={() => setProfitabilityFocus('branch')}
                className={`px-3 py-1 rounded transition flex items-center gap-1 ${profitabilityFocus === 'branch' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400'}`}
              >
                <MapPin className="w-3.5 h-3.5" /> {dict.dimensionBranch[currentLang]}
              </button>
              <button
                onClick={() => setProfitabilityFocus('department')}
                className={`px-3 py-1 rounded transition flex items-center gap-1 ${profitabilityFocus === 'department' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400'}`}
              >
                <Layers className="w-3.5 h-3.5" /> {dict.dimensionDept[currentLang]}
              </button>
              <button
                onClick={() => setProfitabilityFocus('employee')}
                className={`px-3 py-1 rounded transition flex items-center gap-1 ${profitabilityFocus === 'employee' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400'}`}
              >
                <Users className="w-3.5 h-3.5" /> {dict.dimensionStaff[currentLang]}
              </button>
            </div>
          </div>

          {/* Graphical representation */}
          {profitabilityFocus !== 'employee' && (
            <div className="bg-slate-900/40 border border-white/5 p-4 rounded-xl">
              <span className="text-[10px] text-slate-500 uppercase font-bold block mb-4">{dict.chartTitle[currentLang]}</span>
              <div className="w-full h-64 text-xs font-mono">
                <SafeChartContainer height="100%" minHeight={240}>
                  <BarChart 
                    data={profitabilityFocus === 'branch' ? branchProfitabilityData : departmentProfitabilityData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" stroke="#64748b" />
                    <YAxis stroke="#64748b" />
                    <Tooltip contentStyle={{ backgroundColor: '#050510', border: '1px solid rgba(255,255,255,0.1)' }} />
                    <Legend />
                    <Bar dataKey="revenues" name={dict.chartIncome[currentLang]} fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name={dict.chartExpense[currentLang]} fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </SafeChartContainer>
              </div>
            </div>
          )}

          {/* Grid list details */}
          <div className="bg-slate-950 rounded-xl border border-white/5 overflow-hidden">
            <div className="bg-slate-900/60 px-4 py-3 border-b border-white/5 text-xs font-bold text-slate-300">
              {profitabilityFocus === 'branch' && dict.subTitleBranch[currentLang]}
              {profitabilityFocus === 'department' && dict.subTitleDept[currentLang]}
              {profitabilityFocus === 'employee' && dict.subTitleStaff[currentLang]}
            </div>

            {/* Render table according to option */}
            {profitabilityFocus === 'branch' && (
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-3">{dict.thBranch[currentLang]}</th>
                    <th className="p-3">{dict.thIn[currentLang]}</th>
                    <th className="p-3">{dict.thOut[currentLang]}</th>
                    <th className="p-3">{dict.thProfit[currentLang]}</th>
                    <th className="p-3">{dict.thRatio[currentLang]}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-mono">
                  {branchProfitabilityData.map(b => (
                    <tr key={b.id} className="hover:bg-white/5">
                      <td className="p-3 text-white font-bold">{b.name}</td>
                      <td className="p-3 text-emerald-400">+{b.revenues.toLocaleString()} HTG</td>
                      <td className="p-3 text-rose-400">-{b.expenses.toLocaleString()} HTG</td>
                      <td className={`p-3 font-semibold ${b.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {b.profit >= 0 ? "+" : ""}{b.profit.toLocaleString()} HTG
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${b.margin >= 30 ? "bg-emerald-500/10 text-emerald-400" : b.margin > 0 ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-450"}`}>
                          {b.margin}% Net
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {profitabilityFocus === 'department' && (
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-3">{dict.thDept[currentLang]}</th>
                    <th className="p-3">{dict.thIn[currentLang]}</th>
                    <th className="p-3">{dict.thOut[currentLang]}</th>
                    <th className="p-3">{dict.thProfit[currentLang]}</th>
                    <th className="p-3">{dict.thRatio[currentLang]}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-mono">
                  {departmentProfitabilityData.map(d => (
                    <tr key={d.id} className="hover:bg-white/5">
                      <td className="p-3 text-white font-bold">{d.name}</td>
                      <td className="p-3 text-emerald-400">+{d.revenues.toLocaleString()} HTG</td>
                      <td className="p-3 text-rose-400">-{d.expenses.toLocaleString()} HTG</td>
                      <td className={`p-3 font-semibold ${d.profit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {d.profit >= 0 ? "+" : ""}{d.profit.toLocaleString()} HTG
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${d.margin >= 35 ? "bg-emerald-500/10 text-emerald-400" : d.margin > 0 ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-450"}`}>
                          {d.margin}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {profitabilityFocus === 'employee' && (
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-3">{dict.thStaff[currentLang]}</th>
                    <th className="p-3">{dict.thRole[currentLang]}</th>
                    <th className="p-3">{dict.thBase[currentLang]}</th>
                    <th className="p-3">{dict.thAdvances[currentLang]}</th>
                    <th className="p-3">{dict.thPaid[currentLang]}</th>
                    <th className="p-3">{dict.thTotalCost[currentLang]}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs font-mono">
                  {employeeCostData.map(emp => (
                    <tr key={emp.id} className="hover:bg-white/5">
                      <td className="p-3 text-white font-bold">{emp.name}</td>
                      <td className="p-3 text-slate-400 text-[10px] uppercase font-semibold">{emp.role}</td>
                      <td className="p-3 text-slate-300">{emp.baseSalary.toLocaleString()} HTG</td>
                      <td className="p-3 text-rose-400">{emp.advances > 0 ? `${emp.advances.toLocaleString()} HTG` : "0 HTG"}</td>
                      <td className="p-3 text-cyan-400">{emp.payrollCost > 0 ? `${emp.payrollCost.toLocaleString()} HTG` : "0 HTG"}</td>
                      <td className="p-3 text-indigo-400 font-bold">{emp.totalDirectCost.toLocaleString()} HTG</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ==================== SEGMENT 3: FORECASTING ENGINE (Phase 13E) ==================== */}
      {activeSegmentTab === 'forecasting' && (
        <div className="space-y-6 animate-fade-in font-mono text-xs" id="forecasting-workspace">
          
          {/* Main predictive dashboard cards */}
          {report && report.predictions ? (
            <div className="space-y-6">
              
              {/* Header card info */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-white/5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-slate-100 uppercase">
                    {dict.predTitle[currentLang]}
                  </h3>
                </div>
                <p className="text-slate-400 leading-relaxed text-xs">
                  {dict.predDesc[currentLang]}
                </p>
              </div>

              {/* Bento Grid layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Next Fortnight payroll pred */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col justify-between hover:scale-[1.01] transition duration-200">
                  <div className="space-y-2">
                    <span className="text-[10px] text-indigo-400 uppercase font-bold block">{dict.predPayroll[currentLang]}</span>
                    <strong className="text-3xl font-extrabold text-white block">
                      {report.predictions.next_fortnight_payroll.toLocaleString()} HTG
                    </strong>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-4 border-t border-white/5 pt-2">
                    {dict.predPayrollSubtitle[currentLang]}
                  </span>
                </div>

                {/* 2. End of Month Cash Flow trajectory */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col justify-between hover:scale-[1.01] transition duration-200">
                  <div className="space-y-2">
                    <span className="text-[10px] text-indigo-400 uppercase font-bold block">{dict.predCash[currentLang]}</span>
                    <strong className={`text-3xl font-extrabold block ${report.predictions.end_of_month_cash_flow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {report.predictions.end_of_month_cash_flow.toLocaleString()} HTG
                    </strong>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-4 border-t border-white/5 pt-2">
                    {dict.predCashSubtitle[currentLang]}
                  </span>
                </div>

                {/* 3. Estimé profit mensuel */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col justify-between hover:scale-[1.01] transition duration-200">
                  <div className="space-y-2">
                    <span className="text-[10px] text-indigo-400 uppercase font-bold block">{dict.predProfit[currentLang]}</span>
                    <strong className="text-3xl font-extrabold text-cyan-400 block">
                      {report.predictions.estimated_monthly_profit.toLocaleString()} HTG
                    </strong>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-4 border-t border-white/5 pt-2">
                    {dict.predProfitSubtitle[currentLang]}
                  </span>
                </div>

              </div>

              {/* Second row secondary indicators */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Absenteeism rates index card */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs uppercase font-bold text-slate-300 flex items-center gap-1.5 mb-2">
                      <Clock className="w-4 h-4 text-amber-500" /> {dict.predAbsent[currentLang]}
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-4">
                      {dict.predAbsentDesc[currentLang]}
                    </p>
                  </div>
                  <div className="flex items-end justify-between border-t border-white/5 pt-4">
                    <span className="text-3xl font-bold font-mono text-amber-400">
                      {report.predictions.absenteeism_rate_percentage}%
                    </span>
                    <span className="text-[10px] text-slate-50 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 select-none">
                      {dict.predAbsentBadge[currentLang]}
                    </span>
                  </div>
                </div>

                {/* Overrun Risk card */}
                <div className="bg-slate-950 p-6 rounded-2xl border border-white/5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs uppercase font-bold text-slate-300 flex items-center gap-1.5 mb-2">
                      <ShieldAlert className="w-4 h-4 text-indigo-450" /> {dict.predOverrun[currentLang]}
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-4">
                      {dict.predOverrunDesc[currentLang]}
                    </p>
                  </div>
                  <div className="flex items-end justify-between border-t border-white/5 pt-4">
                    <span className={`text-2xl font-bold font-mono uppercase ${
                      (report.predictions.budget_overrun_risk === 'ÉLEVÉ' || report.predictions.budget_overrun_risk === 'HIGH') ? "text-rose-500" :
                      (report.predictions.budget_overrun_risk === 'MOYEN' || report.predictions.budget_overrun_risk === 'NORMAL') ? "text-amber-500" : "text-emerald-400"
                    }`}>
                      {report.predictions.budget_overrun_risk === 'ÉLEVÉ' ? 'ÉLEVÉ' : 
                       report.predictions.budget_overrun_risk === 'MOYEN' ? 'MOYEN' : 
                       report.predictions.budget_overrun_risk === 'FAIBLE' ? 'FAIBLE' : 
                       report.predictions.budget_overrun_risk}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {dict.predOverrunBadge[currentLang]}
                    </span>
                  </div>
                </div>

              </div>

              {/* Justification quote footer */}
              {report.predictions.forecast_justification && (
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-slate-300 italic flex items-start gap-3 leading-relaxed">
                  <Brain className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-xs">
                    <strong>{dict.modelNote[currentLang]}</strong> "{report.predictions.forecast_justification}"
                  </p>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-slate-950 p-8 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center gap-3">
              <span className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 text-indigo-400">
                <Brain className="w-5 h-5" />
              </span>
              <strong className="text-white text-sm font-sans">{dict.noDataTitle[currentLang]}</strong>
              <p className="text-slate-400 text-xs max-w-sm">
                {dict.noDataDesc[currentLang]}
              </p>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
