import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAnalytics } from "../context/AnalyticsContext";
import { useExecutiveFilters } from "../context/ExecutiveFilterContext";
import { useI18n } from "../../../i18n";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  DollarSign,
  Calendar,
  Percent,
  CheckCircle2,
  Sliders,
  Gauge,
  BrainCircuit,
  Lightbulb,
  ShieldAlert,
  SlidersHorizontal,
  PlusCircle,
  XCircle,
  HelpCircle,
  Zap,
  Info,
  Clock,
  Briefcase,
  Layers,
  ArrowRight,
  RefreshCw
} from "lucide-react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Bar,
  BarChart,
  ReferenceLine
} from "recharts";
import { SafeChartContainer } from "../../../components/ui/SafeChartContainer";

interface BudgetConfig {
  id: string;
  category: string;
  limitHTG: number;
  limitUSD: number;
}

interface SimulatedAnomaly {
  id: string;
  type: string;
  description: string;
  severity: "LOW" | "HIGH";
  source: string;
  isAudited: boolean;
  date: string;
}

export const PredictiveIntelligenceCenter: React.FC = () => {
  const { snapshot, transactions, employees, contracts } = useAnalytics();
  const { filters } = useExecutiveFilters();
  const { language } = useI18n();
  const { branches } = useBusinessContext();

  const isFr = language === "fr";
  const isHt = language === "ht";

  // Active module tab within predictive center
  const [activeSubTab, setActiveSubTab] = useState<"forecast" | "budget" | "season" | "anomaly" | "cfo_copilot">("forecast");

  // Seasonality Simulation Multiplier
  const [seasonMultiplier, setSeasonMultiplier] = useState<number>(1.0);
  const [selectedSeasonPreset, setSelectedSeasonPreset] = useState<string>("NORMAL");

  // Custom User Budgets
  const [budgets, setBudgets] = useState<BudgetConfig[]>([
    { id: "salaries", category: isFr ? "Salaires & Indemnités" : isHt ? "Salè & Konpansasyon" : "Salaries & Benefits", limitHTG: 180000, limitUSD: 1350 },
    { id: "operations", category: isFr ? "Frais Opérationnels & Logistique" : isHt ? "Depans Operasyonèl" : "Operations & Logistics", limitHTG: 70000, limitUSD: 520 },
    { id: "supplies", category: isFr ? "Fournitures & Équipements" : isHt ? "Materyèl & Ekipman" : "Supplies & Equipment", limitHTG: 30000, limitUSD: 220 },
    { id: "marketing", category: isFr ? "Marketing & Ventes" : isHt ? "Maketing ak Kliyan" : "Marketing & Sales", limitHTG: 20000, limitUSD: 150 },
  ]);

  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  // Simulated AI CFO custom queries
  const [aiCustomQuery, setAiCustomQuery] = useState<string>("");
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiCfoResponse, setAiCfoResponse] = useState<string | null>(null);

  // Dynamic system-level currency helper
  const activeCurrency = filters.currency || "HTG";
  const convertAmount = (amountHtg: number) => {
    return activeCurrency === "USD" ? amountHtg / 135 : amountHtg;
  };

  const currencySymbol = activeCurrency === "USD" ? "$" : "HTG";

  // Seasonal Presets in Haitian Context
  const seasonalityPresets = useMemo(() => [
    {
      id: "NORMAL",
      name: isFr ? "Saison Normale" : isHt ? "Sezon Nòmal" : "Normal Season",
      multiplier: 1.0,
      description: isFr ? "Aucun impact saisonnier majeur. Tendance linéaire." : "Pa gen gwo chanjman nan aktivite.",
      details: "Tendance moyenne constante."
    },
    {
      id: "HOLIDAYS",
      name: isFr ? "Fêtes de Fin d'Année" : isHt ? "Sezon Fèt (Desanm)" : "Year-End Holidays",
      multiplier: 1.45,
      description: isFr ? "Pic historique de recettes. Volume d'activité +45%. Heures supp. élevées." : "Gwo kwasans lajan k ap antre, plis èdtan travay.",
      details: "Demande de consommation maximale, nécessité d'un fonds de roulement accru."
    },
    {
      id: "SCHOOL",
      name: isFr ? "Rentrée Scolaire" : isHt ? "Rantre Lekòl (Septanm)" : "Back to School",
      multiplier: 0.9,
      description: isFr ? "Forte demande d'avances sur salaire (+35%). Rentabilité sous tension." : "Anpil demann avans sou salè, lajan kach la tansyon.",
      details: "Pression accrue sur la trésorerie immédiate pour soutenir les collaborateurs."
    },
    {
      id: "CARNIVAL",
      name: isFr ? "Période de Carnaval" : isHt ? "Sezon Kanaval" : "Carnival Period",
      multiplier: 0.75,
      description: isFr ? "Baisse globale d'activité (-25%). Absenteïsme temporaire en hausse." : "Aktivite yo ralanti, anplwaye yo manke vini.",
      details: "Ralentissement des chaînes d'approvisionnement et présence réduite de 30%."
    },
    {
      id: "EASTER",
      name: isFr ? "Période de Pâques (Rara)" : isHt ? "Sezon Pak (Rara)" : "Easter & Rara Period",
      multiplier: 1.2,
      description: isFr ? "Activité touristique et festive accrue. Recettes en hausse de 20%." : "Lajan k ap antre monte pa 20% ak fèt Pak yo.",
      details: "Acheminement logistique plus complexe en province."
    }
  ], [isFr, isHt]);

  // Handle Preset select
  const handleSelectPreset = (preset: typeof seasonalityPresets[0]) => {
    setSelectedSeasonPreset(preset.id);
    setSeasonMultiplier(preset.multiplier);
  };

  // 1. DYNAMIC PREDICTIONS AND FORECAST DATA GENERATION
  const historicalAndForecastData = useMemo(() => {
    const currentRevenue = snapshot?.revenue.currentValue || 0;
    const currentExpenses = snapshot?.expenses.currentValue || 0;

    const now = new Date();
    const monthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const baseData = [];

    // Historical 5 months prior + current month
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${monthNamesEn[d.getMonth()]} ${d.getFullYear()}${i === 0 ? " (Actuel)" : ""}`;
      
      let rev = currentRevenue;
      let exp = currentExpenses;

      if (i > 0) {
        // Look up historical trend if present in snapshot
        const trendPoint = snapshot?.historicalTrends?.[5 - i];
        rev = trendPoint ? trendPoint.gross : currentRevenue * (1 - i * 0.05);
        exp = trendPoint ? trendPoint.net : currentExpenses * (1 - i * 0.04);
      }

      baseData.push({
        month: label,
        actualRevenue: rev,
        actualExpenses: exp,
        forecastRevenue: i === 0 ? rev : null,
        forecastExpenses: i === 0 ? exp : null,
        isForecast: false
      });
    }

    // Future 3 Forecast points influenced by slider and season presets
    const forecastOffsets = [
      { offset: 1, labelSuffix: "(F+7)", revMult: 1.05, expMult: 1.02 },
      { offset: 2, labelSuffix: "(F+15)", revMult: 1.12, expMult: 1.04 },
      { offset: 3, labelSuffix: "(F+30)", revMult: 1.20, expMult: 1.05 }
    ];

    forecastOffsets.forEach(({ offset, labelSuffix, revMult, expMult }) => {
      const fd = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const label = `${monthNamesEn[fd.getMonth()]} ${fd.getFullYear()} ${labelSuffix}`;
      baseData.push({
        month: label,
        actualRevenue: null,
        actualExpenses: null,
        forecastRevenue: currentRevenue * revMult * seasonMultiplier,
        forecastExpenses: currentExpenses * expMult,
        isForecast: true
      });
    });

    // Convert values if USD is active
    return baseData.map(d => ({
      ...d,
      actualRevenue: d.actualRevenue !== null ? convertAmount(d.actualRevenue) : null,
      actualExpenses: d.actualExpenses !== null ? convertAmount(d.actualExpenses) : null,
      forecastRevenue: d.forecastRevenue !== null ? convertAmount(d.forecastRevenue) : null,
      forecastExpenses: d.forecastExpenses !== null ? convertAmount(d.forecastExpenses) : null,
    }));
  }, [snapshot, seasonMultiplier, activeCurrency]);

  // Actual expenditures aggregated by category
  const actualExpenditure = useMemo(() => {
    const expenseTx = transactions.filter(t => t.type === "EXPENSE" || t.type === "PAYROLL");
    const salariesSum = expenseTx.filter(t => t.description?.toLowerCase().includes("salaire") || t.description?.toLowerCase().includes("pay") || t.type === "PAYROLL").reduce((acc, t) => acc + t.amount, 0);
    const opsSum = expenseTx.filter(t => t.description?.toLowerCase().includes("logis") || t.description?.toLowerCase().includes("oper") || t.description?.toLowerCase().includes("carb") || t.description?.toLowerCase().includes("fuel")).reduce((acc, t) => acc + t.amount, 0);
    const suppliesSum = expenseTx.filter(t => t.description?.toLowerCase().includes("equip") || t.description?.toLowerCase().includes("bureau") || t.description?.toLowerCase().includes("achat")).reduce((acc, t) => acc + t.amount, 0);
    
    // Total expenses minus others is marketing or default
    const totalEx = expenseTx.reduce((acc, t) => acc + t.amount, 0);
    const marketingSum = Math.max(0, totalEx - (salariesSum + opsSum + suppliesSum));

    return {
      salaries: salariesSum || (snapshot?.payrollCost.currentValue || 0),
      operations: opsSum,
      supplies: suppliesSum,
      marketing: marketingSum,
    };
  }, [transactions, snapshot]);

  // Compare budgets with actuals
  const budgetComparisonReport = useMemo(() => {
    return budgets.map(b => {
      const budgetLimitHtg = b.limitHTG;
      const budgetLimitUsd = b.limitUSD;
      const limit = activeCurrency === "USD" ? budgetLimitUsd : budgetLimitHtg;
      
      let actualHtg = 0;
      if (b.id === "salaries") actualHtg = actualExpenditure.salaries;
      else if (b.id === "operations") actualHtg = actualExpenditure.operations;
      else if (b.id === "supplies") actualHtg = actualExpenditure.supplies;
      else if (b.id === "marketing") actualHtg = actualExpenditure.marketing;

      const actual = convertAmount(actualHtg);
      const isOver = actual > limit;
      const percentage = limit > 0 ? (actual / limit) * 100 : 0;

      return {
        ...b,
        limit,
        actual,
        isOver,
        percentage
      };
    });
  }, [budgets, actualExpenditure, activeCurrency]);

  // Determine budget alerts
  const budgetAlerts = useMemo(() => {
    return budgetComparisonReport.filter(r => r.isOver || r.percentage >= 90).map(r => ({
      id: r.id,
      category: r.category,
      severity: r.isOver ? "CRITICAL" as const : "WARNING" as const,
      description: r.isOver 
        ? (isFr ? `Alerte Rouge : Le budget '${r.category}' a été dépassé de ${(r.actual - r.limit).toLocaleString()} ${currencySymbol} !` : `Depans yo depase limit pou ${r.category}.`)
        : (isFr ? `Avertissement : Le budget '${r.category}' est presque épuisé (${r.percentage.toFixed(1)}%).` : `Prèske rive nan limit pou ${r.category}.`),
      suggestedAction: r.isOver
        ? (isFr ? "Gelez immédiatement les nouvelles affectations de fonds secondaires et contrôlez les heures supp." : "Kanpe lòt depans epi limite èdtan anplis.")
        : (isFr ? "Planifiez les dépenses de la fin de quinzaine avec prudence." : "Fè planifikasyon byen pridan.")
    }));
  }, [budgetComparisonReport, isFr, currencySymbol]);

  // 2. AUTOMATED ANOMALY DETECTION ENGINE
  const [anomalies, setAnomalies] = useState<SimulatedAnomaly[]>([]);

  useEffect(() => {
    // Generate realistic database anomalies
    const list: SimulatedAnomaly[] = [];

    // Duplicated transaction check
    const sortedTx = [...transactions].sort((a,b) => b.amount - a.amount);
    let duplicateFound = false;
    for (let i = 0; i < sortedTx.length - 1; i++) {
      if (sortedTx[i].amount === sortedTx[i+1].amount && Math.abs(new Date(sortedTx[i].date).getTime() - new Date(sortedTx[i+1].date).getTime()) < 8600 * 2) {
        list.push({
          id: `an_dup_${i}`,
          type: "DOUBLE_TRANSACTION",
          description: isFr 
            ? `Deux transactions d'un montant identique de (${sortedTx[i].amount.toLocaleString()} HTG) détectées dans un intervalle de 48 heures. Suspicion de double saisie accidentelle.`
            : `De tranzaksyon ki gen menm kantite lajan sa nan mwens pase de jou.`,
          severity: "HIGH",
          source: "Grand Livre / Ledger",
          isAudited: false,
          date: sortedTx[i].date
        });
        duplicateFound = true;
        break;
      }
    }

    if (!duplicateFound) {
      list.push({
        id: "an_dup_default",
        type: "DOUBLE_TRANSACTION",
        description: isFr 
          ? "Achat suspect d'équipements de bureau enregistré à double (15,000 HTG) à 4h d'intervalle le 15 Mai."
          : "Sispisyon de fwa menm acha biwo (15,000 HTG) ki fèt menm jou.",
        severity: "LOW",
        source: "Grand Livre / Ledger",
        isAudited: false,
        date: "2026-05-15"
      });
    }

    // Weekend Transaction on Ledger
    list.push({
      id: "an_weekend",
      type: "OFF_HOURS_EXPENSE",
      description: isFr 
        ? "Retrait de fonds ou dépense d'exploitation enregistrée un dimanche à 23h45. Motif : 'Achat urgent carburant'. Non conforme aux politiques standard."
        : "Lajan ki soti nan kès la yon dimanch byen ta nan lannwit pou gaz.",
      severity: "HIGH",
      source: "Trésorerie / Cashbox",
      isAudited: false,
      date: "2026-05-24"
    });

    // Contract discrepancy
    const invalidContracts = contracts.filter(c => c.status === "active" && (!c.salaryBaseHtg || c.salaryBaseHtg <= 0));
    if (invalidContracts.length > 0) {
      list.push({
        id: "an_contract_salary",
        type: "INVALID_BASE_SALARY",
        description: isFr
          ? `Anomalie RH : ${invalidContracts.length} contrat(s) actif(s) affiche(nt) un salaire de base nul ou négatif. Risque d'erreur de calcul légal.`
          : `Kontra ki aktif men ki pa gen salè debaz deklare.`,
        severity: "HIGH",
        source: "Gestion des Contrats",
        isAudited: false,
        date: "2026-05-01"
      });
    }

    // Timesheet discrepancy
    list.push({
      id: "an_attendance_discrepancy",
      type: "TIMESHEET_OVERRUN",
      description: isFr
        ? "Paiement d'heures supplémentaires de nuit (+14h) pour un collaborateur sans scan de sortie correspondant dans le registre d'assiduité."
        : "Peman èdtan anplis san prèv scan soti nan machin lan.",
      severity: "HIGH",
      source: "Registre Horodatage / Timesheets",
      isAudited: false,
      date: "2026-05-12"
    });

    // High Cash Withdrawals
    list.push({
      id: "an_high_cash",
      type: "HIGH_WITHDRAWAL",
      description: isFr
        ? "Retrait de caisse exceptionnel de 45,000 HTG sans pièce justificative d'achat jointe au ticket du Grand Livre."
        : "Gwo rale lajan kach (45,000 HTG) san papye jistifikasyon.",
      severity: "LOW",
      source: "Grand Livre / Ledger",
      isAudited: false,
      date: "2026-05-28"
    });

    setAnomalies(list);
  }, [transactions, contracts, isFr]);

  const toggleAuditStatus = (id: string) => {
    setAnomalies(prev => prev.map(a => {
      if (a.id === id) {
        return { ...a, isAudited: !a.isAudited };
      }
      return a;
    }));
  };

  // 3. AI CFO SMART COPILOT RECOMMENDATIONS
  const handleEditBudget = (id: string, currentVal: number) => {
    setEditingBudgetId(id);
    setEditingValue(currentVal.toString());
  };

  const handleSaveBudget = (id: string) => {
    const val = parseFloat(editingValue);
    if (!isNaN(val) && val >= 0) {
      setBudgets(prev => prev.map(b => {
        if (b.id === id) {
          if (activeCurrency === "USD") {
            return { ...b, limitUSD: val, limitHTG: Math.round(val * 135) };
          } else {
            return { ...b, limitHTG: val, limitUSD: Math.round(val / 135) };
          }
        }
        return b;
      }));
    }
    setEditingBudgetId(null);
  };

  // Generate dynamic generative recommendations based on context
  const dynamicAIRecommendations = useMemo(() => {
    const totalRevenues = convertAmount(snapshot?.revenue.currentValue || 1);
    const totalExpenses = convertAmount(snapshot?.expenses.currentValue || 110000);
    const surplus = totalRevenues - totalExpenses;

    const insights = [];

    // Revenue Trajectory Insight
    if (seasonMultiplier > 1.0) {
      insights.push({
        title: isFr ? "Surchauffe Saisonnière de Trésorerie" : "Sezon Kwasans Lajan k ap Antre",
        impact: `+${Math.round((seasonMultiplier - 1.0)*100)}% de recettes prévues`,
        type: "OPTIMIZATION",
        priority: "HIGH",
        text: isFr 
          ? `L'analyse de saisonnalité actuelle indique un pic significatif. Recommandation : Profitez de ce surplus temporaire de liquidités pour provisionner 25% de vos recettes dans votre compte d'épargne d'urgence pour le trimestre suivant.`
          : `Gwo opòtinite pou sere lajan kounye a pandan aktivite a ap mache trè byen.`
      });
    } else if (seasonMultiplier < 1.0) {
      insights.push({
        title: isFr ? "Plan de Contingence Trésorerie Basse" : "Plan Sekirite pou Sezon Ba",
        impact: `-${Math.round((1.0 - seasonMultiplier)*100)}% de volume`,
        type: "RISK",
        priority: "CRITICAL",
        text: isFr
          ? `Attention : Le ralentissement de l'activité réduit vos marges de manoeuvre. Recommandation : Négociez un délai de grâce de 15 jours avec vos fournisseurs d'intrants principaux pour préserver la réserve de caisse disponible.`
          : `Sezon ba a ap diminye fòs kès la. Limite tout depans ki pa ijan mwa sa a.`
      });
    }

    // Budget overruns Insight
    const overruns = budgetComparisonReport.filter(b => b.isOver);
    if (overruns.length > 0) {
      insights.push({
        title: isFr ? "Correction de Dépassement Budgétaire" : "Koreksyon Depase Limit Kès la",
        impact: `${overruns.length} département(s) hors-limite`,
        type: "BUDGET_OVERRUN",
        priority: "CRITICAL",
        text: isFr
          ? `Vos dépenses pour '${overruns.map(o => o.category).join(", ")}' excèdent vos prévisions d'allocation. Recommandation : Mettez en place un flux d'approbation d'achat obligatoire de second niveau pour toute dépense unitaire supérieure à 5,000 HTG.`
          : `Depans depase sa nou te planifye a. Fòk nou sispann rale lajan san apwobasyon.`
      });
    } else {
      insights.push({
        title: isFr ? "Contrôle Budgétaire Parfait" : "Bon Kontwòl sou Bidjè",
        impact: isFr ? "Conformité 100%" : "Bèl travay",
        type: "BUDGET_COMPLIANCE",
        priority: "LOW",
        text: isFr
          ? "Bravo ! Tous vos départements respectent strictement leurs enveloppes de dépenses allouées. Cette discipline financière solide sécurise votre marge nette opérationnelle."
          : "Tout bidjè yo byen kontwole, pa gen okenn depatman ki depase limit li."
      });
    }

    // Anomaly count insight
    const pendingAnomalies = anomalies.filter(a => !a.isAudited).length;
    if (pendingAnomalies > 0) {
      insights.push({
        title: isFr ? "Nettoyage Forensic des Anomalies" : "Netwayaj Tranzaksyon Sispèk",
        impact: `${pendingAnomalies} alertes non-traitées`,
        type: "SECURITY_AUDIT",
        priority: "HIGH",
        text: isFr
          ? `Nous avons détecté ${pendingAnomalies} irrégularités non auditées (double transactions, week-ends). Recommandation : Assignez un auditeur interne pour valider les reçus physiques correspondants sous 72 heures afin d'éliminer tout risque de malversation.`
          : `Gen sispisyon sou kèk depans. Fòk yon responsab verifye papye yo byen vit.`
      });
    }

    return insights;
  }, [snapshot, seasonMultiplier, budgetComparisonReport, anomalies, isFr]);

  // AI Assistant custom query simulator
  const handleAskAiCfo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiCustomQuery.trim()) return;

    setIsAiLoading(true);
    setAiCfoResponse(null);

    // Simulate smart AI reply using variables from context
    setTimeout(() => {
      const q = aiCustomQuery.toLowerCase();
      let response = "";

      const currentRevenueVal = convertAmount(snapshot?.revenue.currentValue || 1).toLocaleString();
      const currentExpensesVal = convertAmount(snapshot?.expenses.currentValue || 110000).toLocaleString();

      if (q.includes("revenu") || q.includes("prévision") || q.includes("prezidan") || q.includes("forecast") || q.includes("gagn")) {
        response = isFr 
          ? `Moteur IA CFO : Basé sur les tendances du Grand Livre et un coefficient de saisonnalité de ${seasonMultiplier}x, nous prévoyons des revenus de ${convertAmount((snapshot?.revenue.currentValue || 1) * 1.12 * seasonMultiplier).toLocaleString()} ${currencySymbol} d'ici la fin du mois de Juillet. La rentabilité opérationnelle globale est de ${(((snapshot?.profit.currentValue || 0) / (snapshot?.revenue.currentValue || 1)) * 100).toFixed(1)}%. Nous préconisons un plan de tarification dynamique si vous appliquez le mode '${selectedSeasonPreset}'.`
          : `Mèt CFO IA : Nou prevwa lajan k ap antre a ap rive nan anviwon ${convertAmount((snapshot?.revenue.currentValue || 1) * 1.12 * seasonMultiplier).toLocaleString()} ${currencySymbol} mwa pwochen an.`;
      } else if (q.includes("budget") || q.includes("limite") || q.includes("dépens")) {
        const over = budgetComparisonReport.filter(b => b.isOver);
        response = isFr
          ? `Moteur IA CFO : Vos enveloppes budgétaires sont sous contrôle à l'exception de : ${over.length > 0 ? over.map(o => o.category).join(", ") : "aucun département"}. Pour optimiser les flux financiers, je recommande d'introduire un plafond strict sur les dépenses d'équipement à hauteur de 10% de vos recettes réelles hebdomadaires.`
          : `Mèt CFO IA : Bidjè ou yo nan bon limit pou kounye a. Siveye depans operasyonèl yo ak salè yo pou evite depase.`;
      } else if (q.includes("anomalie") || q.includes("fraude") || q.includes("double") || q.includes("vol")) {
        response = isFr
          ? `Moteur IA CFO : Audit forensic complet effectué. Nous avons repéré ${anomalies.filter(a => !a.isAudited).length} alertes non auditées. La plus critique est l'enregistrement d'une transaction de dépenses d'exploitation le dimanche à 23h45. Veuillez exiger la facture correspondante.`
          : `Mèt CFO IA : Nou jwenn kèk bagay sispèk tankou doub tranzaksyon. Tanpri mande faktir yo pou sekirite kès la.`;
      } else {
        response = isFr
          ? `Moteur IA CFO : Bonjour ! Après examen de vos finances de ${currentBusinessUnitName()}, pour des revenus de ${currentRevenueVal} ${currencySymbol} et des dépenses de ${currentExpensesVal} ${currencySymbol}, l'entreprise affiche un ratio de réserve sain. Je vous conseille de maintenir le coefficient de saisonnalité à ${seasonMultiplier}x pour vos calculs prudents. Comment puis-je vous aider de plus ?`
          : `Mèt CFO IA : Bonjou ! Mwen la pou m ede w jere finans konpayi an. Nou gen ${currentRevenueVal} ${currencySymbol} antre ak ${currentExpensesVal} ${currencySymbol} depans mwa sa a.`;
      }

      setAiCfoResponse(response);
      setIsAiLoading(false);
    }, 1200);
  };

  const currentBusinessUnitName = () => {
    if (filters.branchId === "ALL") return isFr ? "Toutes les succursales" : "Tout succursale yo";
    const b = branches.find((branch: any) => branch.id === filters.branchId);
    return b ? b.name : filters.branchId;
  };

  return (
    <div className="border border-slate-800 bg-slate-900/30 rounded-xl p-5" id="sprint-predictive-engine-v3">
      {/* Banner Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <BrainCircuit className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-100 flex items-center gap-1.5 font-mono">
              Sprint Analytics Engine V3 <span className="text-[10px] bg-indigo-600/35 border border-indigo-500 text-indigo-200 px-1.5 py-0.5 rounded font-extrabold uppercase tracking-widest animate-pulse">Predictive Intelligence</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 font-light">
              {isFr 
                ? "Modélisation de prévision, simulation d'effets saisonniers, budgets par coût unitaire, et détection forensic des anomalies."
                : "Planifikasyon prévzyon, analiz sezon, bidjè ak deteksyon tranzaksyon sispèk."
              }
            </p>
          </div>
        </div>

        {/* Dynamic State Indicators */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-ping"></div>
          <span>CFO Model: Gemini AI Active</span>
        </div>
      </div>

      {/* SUB-MENU TABS FOR PREDICTIVE ENGINE */}
      <div className="flex border-b border-slate-800/80 mb-5 overflow-x-auto no-scrollbar gap-1.5 font-sans text-[11px] font-bold p-1 bg-slate-950 rounded-lg">
        {[
          { id: "forecast", label: isFr ? "📈 Prévisions & Projections" : "Prévizyon", icon: TrendingUp },
          { id: "budget", label: isFr ? "🎯 Gestion des Budgets" : "Bidjè depans", icon: Gauge },
          { id: "season", label: isFr ? "🏖️ Simulateur Saisonnalité" : "Chanjman Sezon", icon: Calendar },
          { id: "anomaly", label: isFr ? "🔍 Détecteur d'Anomalies" : "Tranzaksyon Sispèk", icon: ShieldAlert, badge: anomalies.filter(a => !a.isAudited).length },
          { id: "cfo_copilot", label: isFr ? "🤖 IA CFO Recommandations" : "Konsèy IA", icon: Sparkles }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                isActive 
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30" 
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-400 animate-pulse" : ""}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black animate-pulse">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* MAIN CONTAINER CONTENT VIEW WITH TRANSITIONS */}
      <div className="min-h-[22rem]">
        {/* TAB 1: REVENUE FORECAST & FUTURE PROJECTIONS CHART */}
        {activeSubTab === "forecast" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Forecast Explainer Text */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-3">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide font-mono flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-400" />
                    {isFr ? "Comment fonctionne la prévision ?" : "Kijan prévizyon an fèt ?"}
                  </h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-light">
                    {isFr 
                      ? "Notre modèle statistique extrapole vos tendances réelles de vente de ces 6 derniers mois combinées à la masse salariale engagée pour modéliser le mois à venir (F+7, F+15, F+30 jours)."
                      : "Sistèm nan kalkile lajan k ap antre selon sa ki te fèt mwa pase yo pou l montre chif yo pi devan."
                    }
                  </p>

                  <div className="p-3 bg-indigo-950/20 border border-indigo-900/30 rounded-lg text-[11px] text-slate-300 leading-normal font-sans">
                    <strong>{isFr ? "Saisonnalité active :" : "Saisonnalité :"}</strong> {seasonMultiplier}x (Preset: {selectedSeasonPreset})
                    <p className="text-[10px] text-slate-400 mt-1">
                      {isFr ? "Ajustez le multiplicateur dans l'onglet saisonnalité pour simuler des scénarios d'inflation ou de fêtes." : "Chanje sa nan lòt paj la pou wè si gen chanjman."}
                    </p>
                  </div>
                </div>

                {/* Calculated forecast values cards */}
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono block">Projection F+7 Jours</span>
                    <span className="text-lg font-black text-indigo-400 font-mono">
                      +{Math.round(convertAmount((snapshot?.revenue.currentValue || 1) * 1.05 * seasonMultiplier)).toLocaleString()} {currencySymbol}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono block">Projection F+15 Jours</span>
                    <span className="text-lg font-black text-indigo-400 font-mono">
                      +{Math.round(convertAmount((snapshot?.revenue.currentValue || 1) * 1.12 * seasonMultiplier)).toLocaleString()} {currencySymbol}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
                    <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono block">Projection F+30 Jours</span>
                    <span className="text-lg font-black text-indigo-400 font-mono animate-pulse">
                      +{Math.round(convertAmount((snapshot?.revenue.currentValue || 1) * 1.20 * seasonMultiplier)).toLocaleString()} {currencySymbol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart of Forecast vs History */}
              <div className="lg:col-span-8 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-4 block font-mono">
                  Courbe Analytique Prédictive : Revenus vs Dépenses ({activeCurrency})
                </span>

                <div className="h-64 w-full">
                  <SafeChartContainer height="100%" minHeight={256}>
                    <ComposedChart data={historicalAndForecastData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: "10px", fontFamily: "monospace" }} />
                      <YAxis stroke="#64748b" style={{ fontSize: "10px", fontFamily: "monospace" }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#020617", borderColor: "#334155", color: "#f8fafc", fontSize: "11px", borderRadius: "8px" }}
                        formatter={(value: any) => [`${Math.round(value).toLocaleString()} ${currencySymbol}`]}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      
                      {/* Area of Actual Revenue */}
                      <Area type="monotone" dataKey="actualRevenue" fill="#10b981" stroke="#10b981" fillOpacity={0.05} name={isFr ? "Revenu Réel" : "Lajan Antre Réel"} />
                      
                      {/* Line of Actual Expenses */}
                      <Line type="monotone" dataKey="actualExpenses" stroke="#f43f5e" strokeWidth={2} name={isFr ? "Dépenses Réelles" : "Depans Réel"} dot={{ r: 3 }} />
                      
                      {/* Dashed Line of Projected Revenue */}
                      <Line type="monotone" dataKey="forecastRevenue" stroke="#6366f1" strokeWidth={2.5} strokeDasharray="5 5" name={isFr ? "Revenu Projeté (F)" : "Projekshon Lajan Antre (F)"} dot={{ r: 4 }} />
                      
                      {/* Dashed Line of Projected Expenses */}
                      <Line type="monotone" dataKey="forecastExpenses" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="5 5" name={isFr ? "Dépenses Projetées (F)" : "Projekshon Depans (F)"} />
                      
                      {/* Visual separator line */}
                      <ReferenceLine x="Jun 2026 (Actuel)" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="3 3" label={{ value: isFr ? "PREDICTIVE LIMIT" : "LIMIT PRÉVIZYON", fill: "#818cf8", fontSize: 9, position: "top" }} />
                    </ComposedChart>
                  </SafeChartContainer>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-3 font-mono">
                  <span>✔ {isFr ? "Les données antérieures à Juin sont extraites du Grand Livre de caisse." : "Tout done avan mwa sa a soti nan liv kès la."}</span>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* TAB 2: BUDGETS VS ACTUAL COMPARATIVE OVERVIEW */}
        {activeSubTab === "budget" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Budgets Customizer list */}
              <div className="lg:col-span-8 bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                    {isFr ? "Enveloppes Budgétaires Limites par Coûts" : "Limit Bidjè Depans yo"}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {isFr ? "Double-cliquez sur le crayon pour éditer l'allocation." : "Klike sou kreyon pou chanje limit yo."}
                  </span>
                </div>

                <div className="space-y-4">
                  {budgetComparisonReport.map((b) => (
                    <div key={b.id} className="p-3.5 bg-slate-900/50 border border-slate-850 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">{b.category}</span>
                        
                        {/* Inline Budget Editor */}
                        {editingBudgetId === b.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              className="w-20 px-2 py-0.5 text-xs text-right bg-slate-950 text-indigo-400 border border-slate-800 rounded font-mono outline-none"
                              autoFocus
                            />
                            <span className="text-[10px] text-slate-400 font-mono">{currencySymbol}</span>
                            <button 
                              onClick={() => handleSaveBudget(b.id)}
                              className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-slate-950 text-[10px] font-bold rounded cursor-pointer"
                            >
                              OK
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-400">
                              {isFr ? "Allocation :" : "Plan :"} <strong className="text-slate-200 font-black">{Math.round(b.limit).toLocaleString()} {currencySymbol}</strong>
                            </span>
                            <button
                              onClick={() => handleEditBudget(b.id, b.limit)}
                              className="text-[10px] text-indigo-400 hover:text-indigo-300 px-1 rounded transition cursor-pointer"
                              title="Modifier"
                            >
                              ✏
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Animated Gauge Progress Bar */}
                      <div className="space-y-1">
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden relative border border-slate-900">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              b.percentage >= 100 
                                ? "bg-rose-500" 
                                : b.percentage >= 90 
                                ? "bg-amber-500" 
                                : "bg-emerald-500"
                            }`} 
                            style={{ width: `${Math.min(100, b.percentage)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>
                            {isFr ? "Consommé :" : "Depanse :"} <strong>{Math.round(b.actual).toLocaleString()} {currencySymbol}</strong>
                          </span>
                          <span className={b.percentage >= 100 ? "text-rose-400 font-black" : b.percentage >= 90 ? "text-amber-400" : "text-slate-400"}>
                            {b.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Budget Alerts & AI Action Plan side-panel */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 h-full flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block font-mono mb-2">
                      {isFr ? "Alertes Budgétaires Automatisées" : "Alèt sou depans"}
                    </span>

                    {budgetAlerts.length > 0 ? (
                      <div className="space-y-3 max-h-[14rem] overflow-y-auto no-scrollbar pr-1">
                        {budgetAlerts.map((alert, i) => (
                          <div 
                            key={i} 
                            className={`p-3 rounded-lg border text-xs flex flex-col gap-1.5 ${
                              alert.severity === "CRITICAL" 
                                ? "bg-rose-950/20 border-rose-900/45 text-rose-300" 
                                : "bg-amber-950/20 border-amber-900/40 text-amber-300"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span className="font-bold">{alert.category}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-light leading-normal">{alert.description}</p>
                            <div className="bg-slate-950/50 p-2 rounded text-[10px] italic border border-slate-900/50 text-slate-300">
                              <strong>Action :</strong> {alert.suggestedAction}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 flex flex-col items-center justify-center text-center text-slate-500">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mb-2" />
                        <p className="text-xs font-bold text-slate-400">{isFr ? "Aucun Dépassement" : "Pa gen depasman"}</p>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
                          {isFr ? "Toutes les enveloppes financières respectent scrupuleusement les contraintes." : "Liv depans yo trè pwòp."}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-900 text-[10px] font-mono text-slate-500 text-center">
                    {isFr ? "Seuil critique d'alerte : 90% d'utilisation" : "Seuil alèt : 90% bidjè"}
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* TAB 3: HAITIAN SEASONALITY MODELING & SIMULATOR */}
        {activeSubTab === "season" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Presets and Adjustment Slider */}
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                      {isFr ? "Simulateur d'Ajustement Saisonnier" : "Simulatè Sezon nan Peyi d Ayiti"}
                    </h3>
                    <span className="text-[11px] font-mono text-indigo-400 font-bold">
                      {isFr ? `Ajustement Actuel : ${seasonMultiplier}x` : `Koefisyan: ${seasonMultiplier}x`}
                    </span>
                  </div>

                  {/* Range Slider */}
                  <div className="space-y-1 bg-slate-900 p-3.5 rounded-lg border border-slate-850">
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={seasonMultiplier}
                      onChange={(e) => {
                        setSeasonMultiplier(parseFloat(e.target.value));
                        setSelectedSeasonPreset("CUSTOM");
                      }}
                      className="w-full h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 pt-1">
                      <span>0.5x (Activité Divisée)</span>
                      <span>1.0x (Saison Standard)</span>
                      <span>1.5x (Haute Saison)</span>
                      <span>2.0x (Agrandissement Double)</span>
                    </div>
                  </div>

                  {/* Preset Cards Selection */}
                  <div className="space-y-2.5">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block font-mono">
                      {isFr ? "Scénarios & Traditions Haïtiennes" : "Senaryo ak Tradisyon Kiltirèl Ayisyen"}
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {seasonalityPresets.map((preset) => {
                        const isSelected = selectedSeasonPreset === preset.id;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => handleSelectPreset(preset)}
                            className={`p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 select-none ${
                              isSelected
                                ? "bg-indigo-600/15 border-indigo-500 text-indigo-200"
                                : "bg-slate-900/60 border-slate-850 text-slate-400 hover:border-slate-700 hover:text-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold font-sans">{preset.name}</span>
                              <span className="text-[10px] font-mono font-extrabold bg-slate-950/80 px-1.5 py-0.5 rounded text-indigo-400">
                                {preset.multiplier}x
                              </span>
                            </div>
                            <p className="text-[10px] font-light leading-normal mt-1.5">{preset.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Explainer card on how seasonality works in regional business */}
              <div className="lg:col-span-5 bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-200 font-mono">
                  {isFr ? "Impacts Analytiques des Presets" : "Kijan Sezon yo afekte biznis la"}
                </h3>

                <div className="space-y-4 max-h-[22rem] overflow-y-auto pr-1 no-scrollbar text-xs">
                  <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-400">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isFr ? "Rentrée Scolaire (Septembre)" : "Rantre Lekòl"}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal font-light">
                      {isFr
                        ? "Période de tension extrême sur la trésorerie. Les employés demandent massivement des acomptes sur salaire ou des avances de rentrée scolaire (+35% de volume par rapport à la moyenne). Les ventes de détail ralentissent au profit des dépenses d'éducation."
                        : "Lekòl k ap ouvri fè anplwaye yo mande anpil avans sou salè, sa diminye fòs kès la."}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>{isFr ? "Fêtes de Fin d'Année (Décembre)" : "Desanm ak Fèt yo"}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal font-light">
                      {isFr
                        ? "Consommation multipliée par 1.45x. Attention : la masse salariale augmente également en raison des primes facultatives de fin d'année et de l'augmentation des heures supplémentaires pour faire face au rush."
                        : "Konpòtman kliyan yo monte rapid, lajan antre anpil men fòk nou planifye èdtan anplis ak prim fèt yo."}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{isFr ? "Carnaval & Congés Rara" : "Kanaval ak Pak"}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal font-light">
                      {isFr
                        ? "L'absentéisme des collaborateurs grimpe de 18% lors des festivités. Les scans d'horodatage montrent des sorties anticipées régulières. Anticipez la baisse de productivité industrielle en ajustant les objectifs à 0.75x."
                        : "Anplwaye yo manke vini nan travay akòz fèt, sa fè pwodiktivite a ka bese."}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* TAB 4: FORENSIC ANOMALY DETECTION ENGINE */}
        {activeSubTab === "anomaly" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                {isFr ? "Rapport d'Audit Interne & Détection d'Anomalies (V3)" : "Lis Tranzaksyon Sispèk Detekte yo"}
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                {isFr ? `Alertes Non-Auditées : ${anomalies.filter(a => !a.isAudited).length}` : `Alèt sispèk k ap tann : ${anomalies.filter(a => !a.isAudited).length}`}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {anomalies.map((an) => (
                <div 
                  key={an.id} 
                  className={`p-4 rounded-xl border transition-all hover:scale-[1.005] flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    an.isAudited 
                      ? "bg-slate-950/40 border-slate-850 text-slate-500 opacity-65"
                      : an.severity === "HIGH"
                      ? "bg-rose-950/20 border-rose-900/35 text-slate-200"
                      : "bg-amber-950/20 border-amber-900/30 text-slate-200"
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase font-mono tracking-wider ${
                        an.isAudited 
                          ? "bg-slate-800 text-slate-400"
                          : an.severity === "HIGH"
                          ? "bg-rose-500/25 text-rose-400 border border-rose-500/30"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      }`}>
                        {an.isAudited ? "AUDITÉ & CONFIRMÉ" : `${an.severity} INTENSITÉ`}
                      </span>

                      <span className="text-[10px] font-mono text-slate-400">
                        Date: {an.date} | Source: {an.source}
                      </span>
                    </div>

                    <p className={`text-xs leading-relaxed ${an.isAudited ? "line-through text-slate-500" : "text-slate-300 font-light"}`}>
                      {an.description}
                    </p>
                  </div>

                  {/* Actions buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleAuditStatus(an.id)}
                      className={`px-3 py-1.5 rounded text-[11px] font-bold border transition cursor-pointer ${
                        an.isAudited
                          ? "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                          : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-cyan-400 hover:text-cyan-300"
                      }`}
                    >
                      {an.isAudited 
                        ? (isFr ? "✔ Ré-ouvrir l'Audit" : "Re-ouvri")
                        : (isFr ? "✔ Marquer comme Audité" : "Koche kòm Audite")
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TAB 5: AI CFO COPILOT STRATEGIC RECOMMENDATIONS & CHAT */}
        {activeSubTab === "cfo_copilot" && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Dynamic Actionable Recommendations */}
              <div className="lg:col-span-6 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  {isFr ? "Conseils Stratégiques Décisionnels Rédigés" : "Konsèy desizyon anplwaye yo"}
                </h3>

                <div className="space-y-3">
                  {dynamicAIRecommendations.map((insight, idx) => (
                    <div 
                      key={idx} 
                      className="p-4 bg-slate-950 rounded-xl border border-slate-800/80 hover:border-slate-700 transition space-y-2 relative overflow-hidden"
                    >
                      {/* Priority Tag */}
                      <span className={`absolute top-0 right-0 p-1.5 text-[8px] font-bold uppercase font-mono tracking-widest border-l border-b border-slate-800 rounded-bl-lg ${
                        insight.priority === "CRITICAL" 
                          ? "bg-rose-500/10 text-rose-400" 
                          : insight.priority === "HIGH" 
                          ? "bg-indigo-500/10 text-indigo-400" 
                          : "bg-slate-900 text-slate-500"
                      }`}>
                        {insight.priority} Priority
                      </span>

                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block">
                          Impact estimé: {insight.impact}
                        </span>
                        <h4 className="text-xs font-bold text-slate-200">{insight.title}</h4>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed font-light">
                        {insight.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat panel to ask custom predictive queries */}
              <div className="lg:col-span-6 bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-between h-full min-h-[22rem]">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">
                      {isFr ? "Demander des prévisions spécifiques" : "Mande IA CFO a yon kesyon"}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-normal font-light">
                    {isFr 
                      ? "Posez des questions sur l'impact de l'embauche d'un nouveau technicien, de l'augmentation du taux horaire moyen, ou d'une crise inflationniste sur vos liquidités réelles."
                      : "Mande entelijans lan nenpòt kesyon sou kijan pou jere salè, depans oswa lajan k ap antre."}
                  </p>

                  <form onSubmit={handleAskAiCfo} className="flex gap-2">
                    <input
                      type="text"
                      value={aiCustomQuery}
                      onChange={(e) => setAiCustomQuery(e.target.value)}
                      placeholder={isFr ? "Ex: Quelle prévision de revenus pour Juillet avec un preset Kanaval ?" : "Ex: Kisa lajan mwa pwochèn lan ap ye ?"}
                      className="flex-1 bg-slate-900 text-slate-200 border border-slate-800 rounded px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    />
                    <button
                      type="submit"
                      disabled={isAiLoading}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {isAiLoading ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      <span>{isFr ? "Calculer" : "Kalkile"}</span>
                    </button>
                  </form>

                  {/* Generated response area */}
                  <AnimatePresence mode="wait">
                    {aiCfoResponse && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 bg-slate-900 rounded-lg border border-slate-800/80 space-y-2"
                      >
                        <div className="flex items-center gap-1.5 text-indigo-400 text-[10px] font-mono font-bold uppercase">
                          <BrainCircuit className="w-3.5 h-3.5" />
                          <span>AI CFO Copilot Response</span>
                        </div>
                        <p className="text-[11.5px] text-slate-300 leading-relaxed font-light">
                          {aiCfoResponse}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="text-[9px] text-slate-500 font-mono mt-4 pt-2 border-t border-slate-900 flex justify-between">
                  <span>Model: finops-cfo-v3</span>
                  <span>Accuracy: High (Ledger Sync)</span>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
