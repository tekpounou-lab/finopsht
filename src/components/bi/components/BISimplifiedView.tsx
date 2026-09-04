import React from "react";
import { Sparkles, Database, Building, Layers, Calendar, Activity, Info, Brain } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { SafeChartContainer } from "../../ui/SafeChartContainer";
import { Branch, Department, Role, Business } from "../../../types";

interface BISimplifiedViewProps {
  language: string;
  isSimplifiedMode: boolean;
  setIsSimplifiedMode: (val: boolean) => void;
  currentRole: Role;
  currentBusiness?: Business;
  branches: Branch[];
  departments: Department[];
  selectedBranchId: string;
  setSelectedBranchId: (id: string) => void;
  selectedDeptId: string;
  setSelectedDeptId: (id: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  allBranchesLabel: string;
  allDepartmentsLabel: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMarginPercentage: number;
  attendanceAggregates: {
    attendanceRate: number;
    latenessRate: number;
    absenceRate: number;
    avgHours: number;
    overrides: number;
  };
  aiQuery: string;
  setAiQuery: (val: string) => void;
  aiReport: any | null;
  aiLoading: boolean;
  handleGenerateAiReport: () => void;
}

export const BISimplifiedView: React.FC<BISimplifiedViewProps> = ({
  language,
  setIsSimplifiedMode,
  currentRole,
  currentBusiness,
  branches,
  departments,
  selectedBranchId,
  setSelectedBranchId,
  selectedDeptId,
  setSelectedDeptId,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  allBranchesLabel,
  allDepartmentsLabel,
  totalRevenue,
  totalExpenses,
  netProfit,
  profitMarginPercentage,
  attendanceAggregates,
  aiQuery,
  setAiQuery,
  aiReport,
  aiLoading,
  handleGenerateAiReport,
}) => {
  let healthStatus = {
    label: language === "ht" ? "Ki estab" : "Stable",
    color: "text-amber-400 font-bold",
    bgColor: "bg-amber-400/10",
    borderColor: "border-amber-400/20",
    iconColor: "text-amber-400",
    desc: language === "ht"
      ? "Revni ou yo kouvri depans ou yo, men benefis ou yo toujou piti. Siveye depans ki pa nesesè yo."
      : "Vos revenus couvrent vos dépenses, mais votre marge bénéficiaire reste mince. Pensez à surveiller les frais d'exploitation superflus.",
  };

  if (netProfit > 0 && profitMarginPercentage >= 15) {
    healthStatus = {
      label: language === "ht" ? "Ekselan !" : "Excellente !",
      color: "text-emerald-400 font-bold",
      bgColor: "bg-emerald-400/10",
      borderColor: "border-emerald-400/20",
      iconColor: "text-emerald-400",
      desc: language === "ht"
        ? "Felisitasyon ! Biznis ou ap fè bèl benefis. Se bon moman pou ou fè ekonomize oswa envesti nan nouvo pwojè."
        : "Félicitations ! Votre entreprise génère de confortables bénéfices. C'est le moment idéal pour économiser ou investir dans de nouveaux projets.",
    };
  } else if (netProfit <= 0) {
    healthStatus = {
      label: language === "ht" ? "Pou siveye de prè" : "À surveiller de près",
      color: "text-rose-400 font-bold",
      bgColor: "bg-rose-400/10",
      borderColor: "border-rose-400/20",
      iconColor: "text-rose-400",
      desc: language === "ht"
        ? "Atansyon, depans ou yo depase oswa egal ak revni ou yo pou mwa sa a. Eseye diminye depans fiks ak ranfòse lavant ou yo."
        : "Attention, vos dépenses dépassent ou égalent vos revenus ce mois-ci. Essayez d'optimiser vos charges fixes et de dynamiser vos activités commerciales.",
    };
  }

  const simpleChartData = [
    { name: language === "ht" ? "Revni" : "Argent Gagné", montant: totalRevenue, fill: "#10b981" },
    { name: language === "ht" ? "Depans" : "Argent Dépensé", montant: totalExpenses, fill: "#f43f5e" },
    { name: language === "ht" ? "Benefis" : "Bénéfice Réel", montant: Math.max(0, netProfit), fill: netProfit >= 0 ? "#06b6d4" : "#f43f5e" },
  ];

  return (
    <div className="flex flex-col gap-6" id="simplified-performance-module">
      {/* Simplified Header */}
      <div className="flex flex-wrap lg:items-center lg:justify-between border-b border-slate-900 pb-5 gap-4" id="bi-header-simple">
        <div className="flex flex-col md:flex-row md:items-center justify-between lg:justify-start gap-4 w-full lg:w-auto">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
              <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
              {language === "ht" ? "Tablo de Bò Senp" : "Tableau de Bord Simplifié"}
            </h2>
            <p className="text-xs text-slate-400 font-light mt-0.5">
              {language === "ht" ? "Sante finansye ak ekip ou a eksplike yon fason trè senp." : "La santé financière et d'équipe de votre entreprise expliquée simplement."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Mode Toggle Switch */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800/80 p-1 rounded-xl shadow-lg shrink-0" id="bi-mode-toggle-simple">
            <button
              onClick={() => setIsSimplifiedMode(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all bg-gradient-to-r from-cyan-500/10 to-teal-500/10 text-cyan-400 border border-cyan-500/30 shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              💡 {language === "ht" ? "Mòd Senp" : "Mode Simplifié"}
            </button>
            <button
              onClick={() => setIsSimplifiedMode(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all text-slate-500 hover:text-slate-300 border border-transparent"
            >
              <Database className="w-3.5 h-3.5" />
              📊 {language === "ht" ? "Mòd" : "Mode"} Expert (Finances)
            </button>
          </div>

          {/* Simple filters */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-900/40 border border-slate-800 p-3 rounded-xl shadow-sm backdrop-blur-sm" id="bi-filter-panel-simple">
            <div className="flex items-center gap-1.5" id="branch-select-box-simple">
              <Building className="w-3.5 h-3.5 text-cyan-400" />
              <select
                id="bi-branch-selector-simple"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                disabled={currentRole === "MANAGER"}
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-medium transition-colors outline-none cursor-pointer"
              >
                <option value="ALL">{allBranchesLabel}</option>
                {branches
                  .filter((b) => !currentBusiness?.id || b.business_id === currentBusiness.id)
                  .map((b, _i) => (
                    <option key={`${b.id}-${_i}`} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5" id="dept-select-box-simple">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <select
                id="bi-dept-selector-simple"
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/30 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-medium transition-colors outline-none cursor-pointer"
              >
                <option value="ALL">{allDepartmentsLabel}</option>
                {departments.map((d, _i) => (
                  <option key={`${d.id}-${_i}`} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300" id="date-range-inputs-simple">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <input
                id="bi-start-date-simple"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 rounded-lg px-2 py-1 outline-none text-slate-200 font-sans text-xs transition-colors"
              />
              <span className="text-slate-500 font-bold">-</span>
              <input
                id="bi-end-date-simple"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 rounded-lg px-2 py-1 outline-none text-slate-200 font-sans text-xs transition-colors"
              />
            </div>

            {/* Quick date range preset buttons */}
            <div className="flex items-center gap-1 text-[10px] font-mono border-l border-slate-800 pl-2">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]);
                  setEndDate(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]);
                }}
                className="px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors"
              >
                {language === "fr" ? "Ce Mois" : language === "ht" ? "Mwa Sa a" : "This Month"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setEndDate(now.toISOString().split("T")[0]);
                  setStartDate(new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0]);
                }}
                className="px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors"
              >
                30D
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  setStartDate(new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0]);
                  setEndDate(new Date(now.getFullYear(), 11, 31).toISOString().split("T")[0]);
                }}
                className="px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors"
              >
                {language === "fr" ? "Cette Année" : language === "ht" ? "Ane Sa a" : "This Year"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Global health explanation */}
      <div className={`p-5 rounded-2xl border ${healthStatus.borderColor} ${healthStatus.bgColor} flex flex-col md:flex-row items-start md:items-center justify-between gap-4`} id="health-check-card">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/40 mt-1">
            <Activity className={`w-6 h-6 ${healthStatus.iconColor} animate-pulse`} />
          </div>
          <div>
            <span className="text-[10px] tracking-wider uppercase font-extrabold text-slate-400">
              {language === "ht" ? "Sante biznis la" : "Santé de l'entreprise"}
            </span>
            <h3 className="text-lg font-black flex items-center gap-2 mt-0.5">
              {language === "ht" ? "Sitiyasyon an se : " : "La situation est : "}
              <span className={healthStatus.color}>{healthStatus.label}</span>
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl mt-1">{healthStatus.desc}</p>
          </div>
        </div>

        {/* Simple Meter */}
        <div className="flex flex-col items-end min-w-[120px] shrink-0 w-full md:w-auto mt-2 md:mt-0">
          <span className="text-[10px] text-slate-400 font-extrabold uppercase">
            {language === "ht" ? "Endikatè Trézori" : "Indicateur de Trésorerie"}
          </span>
          <div className="w-full bg-slate-950/50 rounded-full h-3.5 mt-2 overflow-hidden border border-slate-850 p-[2px]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${netProfit > 0 ? "bg-gradient-to-r from-teal-500 to-emerald-400" : "bg-gradient-to-r from-rose-600 to-rose-400"}`}
              style={{ width: `${Math.max(5, Math.min(100, totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 10))}%` }}
            ></div>
          </div>
          <span className="text-[10px] text-slate-500 font-mono mt-1">
            {language === "ht" ? "Marge reyèl : " : "Marge réelle : "}{profitMarginPercentage}%
          </span>
        </div>
      </div>

      {/* 2. Simple KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4" id="simple-kpi-grid">
        {/* Revenue */}
        <div className="glass p-5 rounded-2xl border-l-4 border-emerald-500 flex flex-col justify-between min-h-[140px] md:h-[150px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                {language === "ht" ? "Lajan Reçu 📥" : "Argent Reçu 📥"}
              </span>
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">
                {language === "ht" ? "Vant / Revni" : "Ventes / Recettes"}
              </span>
            </div>
            <h4 className="font-mono text-xl font-black text-emerald-400 mt-3 truncate">
              {(totalRevenue || 0).toLocaleString()} <span className="text-xs font-normal">HTG</span>
            </h4>
          </div>
          <p className="text-[10.5px] text-slate-400 leading-relaxed mt-2 border-t border-slate-850/60 pt-2">
            {language === "ht"
              ? "Tout lajan biznis ou an touche nan men kliyan li yo nan mwa sa a."
              : "Tout l'argent encaissé auprès de vos clients pour cette période."}
          </p>
        </div>

        {/* Expenses */}
        <div className="glass p-5 rounded-2xl border-l-4 border-rose-500 flex flex-col justify-between min-h-[140px] md:h-[150px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                {language === "ht" ? "Lajan Peye 📤" : "Argent Payé 📤"}
              </span>
              <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold">
                {language === "ht" ? "Depans ak Lòt" : "Frais & Achats"}
              </span>
            </div>
            <h4 className="font-mono text-xl font-black text-rose-400 mt-3 truncate">
              {(totalExpenses || 0).toLocaleString()} <span className="text-xs font-normal">HTG</span>
            </h4>
          </div>
          <p className="text-[10.5px] text-slate-400 leading-relaxed mt-2 border-t border-slate-850/60 pt-2">
            {language === "ht"
              ? "Lajan ou depanse pou fonksyone (acha materyèl, salè anplwaye yo)."
              : "Le montant dépensé pour fonctionner (fournisseurs, salaires, achats)."}
          </p>
        </div>

        {/* Net Profit */}
        <div className={`glass p-5 rounded-2xl border-l-4 ${netProfit >= 0 ? "border-cyan-400" : "border-rose-600"} flex flex-col justify-between min-h-[140px] md:h-[150px]`}>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                {language === "ht" ? "Benefis Reyèl 💰" : "Bénéfice Réel 💰"}
              </span>
              <span className={`p-1.5 rounded-lg text-[10px] font-bold ${netProfit >= 0 ? "bg-cyan-500/10 text-cyan-400" : "bg-rose-500/10 text-rose-500"}`}>
                {language === "ht" ? "Lajan ki rale nan pòch" : "Ce qui vous reste !"}
              </span>
            </div>
            <h4 className={`font-mono text-xl font-black mt-3 truncate ${netProfit >= 0 ? "text-cyan-400" : "text-rose-500"}`}>
              {netProfit >= 0 ? "+" : ""}{(netProfit || 0).toLocaleString()} <span className="text-xs font-normal">HTG</span>
            </h4>
          </div>
          <p className="text-[10.5px] text-slate-400 leading-relaxed mt-2 border-t border-slate-850/60 pt-2">
            {language === "ht"
              ? "Lajan reyèl ki rete nan pòch ou lè ou fin peye tout lòt chaj yo !"
              : "L'argent réel qui reste dans votre poche une fois les frais payés !"}
          </p>
        </div>

        {/* Team Attendance */}
        <div className="glass p-5 rounded-2xl border-l-4 border-indigo-500 flex flex-col justify-between min-h-[140px] md:h-[150px]">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                {language === "ht" ? "Prezans Ekip 👥" : "Présence Équipe 👥"}
              </span>
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-[10px] font-bold">
                {language === "ht" ? "Pousantaj Prezans" : "Taux de présence"}
              </span>
            </div>
            <h4 className="font-mono text-xl font-black text-indigo-400 mt-3 truncate">
              {attendanceAggregates.attendanceRate.toFixed(1)}%
            </h4>
          </div>
          <p className="text-[10.5px] text-slate-400 leading-relaxed mt-2 border-t border-slate-850/60 pt-2">
            {language === "ht"
              ? "Mwayèn prezans anplwaye yo. Si li pre 100%, ekip ou a trè motive !"
              : "Taux moyen d'assiduité. Un chiffre proche de 100% est excellent !"}
          </p>
        </div>
      </div>

      {/* 3. Simple Visual Chart & Explanation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch" id="simple-viz-section">
        {/* Left Chart Block */}
        <div className="glass p-5 rounded-2xl border border-slate-800/60 flex flex-col justify-between lg:col-span-7" id="simple-chart-container">
          <div>
            <h3 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider">
              {language === "ht" ? "Konparezon Fasil : Lajan Antre vs Lajan Soti" : "Comparatif Facile : Argent Gagné vs Dépensé"}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {language === "ht" ? "Gade byen balans finans ou yo yon sèl kou." : "Visualisez immédiatement la balance de vos finances."}
            </p>
          </div>

          <div className="h-[220px] mt-6 w-full">
            <SafeChartContainer height="100%" minHeight={220}>
              <BarChart data={simpleChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => val.toLocaleString() + " HTG"} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#020617", borderColor: "#1e293b", borderRadius: "8px" }}
                  labelClassName="text-xs font-bold text-slate-400"
                  formatter={(val: any) => [val.toLocaleString() + " HTG", "Montant"]}
                />
                <Bar dataKey="montant" radius={[8, 8, 0, 0]} barSize={55}>
                  {simpleChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </SafeChartContainer>
          </div>

          <div className="mt-4 p-3 bg-slate-950/40 rounded-xl border border-slate-850/60 flex items-start gap-2 text-slate-400 text-xs leading-relaxed">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              {language === "ht" ? (
                <>
                  <strong>Kouman pou li graf sa a ?</strong> Liy vèt la montre lajan ou touche a, liy wouj la se lajan ou depanse. Si vèt la pi wo pase wouj la, ou ap fè benefis !
                </>
              ) : (
                <>
                  <strong>Comment lire ce graphique ?</strong> La barre verte représente l'argent gagné, la rouge représente les dépenses. Si la verte est plus haute, vous faites des bénéfices !
                </>
              )}
            </span>
          </div>
        </div>

        {/* Right Friendly CFO advice */}
        <div className="glass p-5 rounded-2xl border border-slate-800/60 flex flex-col justify-between lg:col-span-5" id="simple-cfo-advice">
          <div>
            <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              {language === "ht" ? "Konsèy Zanmitay CFO Virtuel la" : "Le Conseil d'Ami du CFO Virtuel"}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {language === "ht" ? "Aksyon ak analiz senp pou ede biznis ou a grandi." : "Analyses et actions simples pour optimiser votre entreprise."}
            </p>

            <div className="flex flex-col gap-3.5 mt-5">
              {/* Rule 1 */}
              <div className="flex gap-3 items-start bg-slate-950/20 p-3 rounded-xl border border-slate-900">
                <span className="text-xl shrink-0">💵</span>
                <div>
                  <h5 className="text-xs font-bold text-slate-200">{language === "ht" ? "Kontwòl Lajan Trézori" : "Suivi de Trésorerie"}</h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    {netProfit > 0
                      ? language === "ht"
                        ? `Sòl ou pozitif ak ${(netProfit || 0).toLocaleString()} HTG. Sere yon ti rezèv pou ka ijan yo.`
                        : `Votre solde est positif de ${(netProfit || 0).toLocaleString()} HTG. Conservez une réserve d'au moins 3 mois de dépenses pour pallier les imprévus.`
                      : language === "ht"
                        ? `Ou gen yon ti mankman pwovizwa de ${(Math.abs(netProfit || 0)).toLocaleString()} HTG. Evite lòt gwo depans ki pa ijan kounye a.`
                        : `Vous avez un déficit temporaire de ${(Math.abs(netProfit || 0)).toLocaleString()} HTG. Reportez les investissements non prioritaires et surveillez vos factures clients.`}
                  </p>
                </div>
              </div>

              {/* Rule 2 */}
              <div className="flex gap-3 items-start bg-slate-950/20 p-3 rounded-xl border border-slate-900">
                <span className="text-xl shrink-0">👥</span>
                <div>
                  <h5 className="text-xs font-bold text-slate-200">{language === "ht" ? "Prezans Ekip la" : "Assiduité de l'Équipe"}</h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    {attendanceAggregates.attendanceRate >= 90
                      ? language === "ht"
                        ? `Bèl nivo prezans anplwaye yo (${attendanceAggregates.attendanceRate.toFixed(1)}%). Ekip ou a trè serye ak ponktyèl.`
                        : `Excellent taux de présence (${attendanceAggregates.attendanceRate.toFixed(1)}%). Votre équipe est ponctuelle et montre une très belle dynamique de travail.`
                      : language === "ht"
                        ? `Pousantaj prezans lan se ${attendanceAggregates.attendanceRate.toFixed(1)}%. Fè yon ti pale ak ekip la pou konprann si gen pwoblèm transpò.`
                        : `Le taux d'assiduité est de ${attendanceAggregates.attendanceRate.toFixed(1)}%. Organisez un point convivial pour identifier et résoudre d'éventuels soucis de transport ou d'horaires.`}
                  </p>
                </div>
              </div>

              {/* Rule 3 */}
              <div className="flex gap-3 items-start bg-slate-950/20 p-3 rounded-xl border border-slate-900">
                <span className="text-xl shrink-0">📈</span>
                <div>
                  <h5 className="text-xs font-bold text-slate-200">{language === "ht" ? "Balanse Depans yo" : "Équilibre d'Exploitation"}</h5>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    {totalRevenue > 0
                      ? language === "ht"
                        ? `Sou chak 100 HTG ou touche, ou depanse ${Math.round((totalExpenses / totalRevenue) * 100)} HTG. Marge pwofi ou se ${profitMarginPercentage}%. Kenbe konsa !`
                        : `Pour chaque 100 HTG encaissé, vous dépensez ${Math.round((totalExpenses / totalRevenue) * 100)} HTG. Votre marge est de ${profitMarginPercentage}%. Gardez ce cap !`
                      : language === "ht"
                        ? "Pa gen okenn tranzaksyon ki fèt ankò. Antre lavant ou yo pou wè analiz yo."
                        : "Aucune transaction enregistrée pour l'instant. Saisissez vos fiches de vente pour mettre à jour l'analyse de rentabilité."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-850 flex items-center justify-between text-[11px] text-slate-400">
            <span>{language === "ht" ? "Analiz yo mete a jou rapidman" : "Analyse mise à jour instantanément"}</span>
            <button
              onClick={() => setIsSimplifiedMode(false)}
              className="text-cyan-400 font-bold hover:underline cursor-pointer"
            >
              {language === "ht" ? "Gade chif teknik yo →" : "Voir les chiffres techniques →"}
            </button>
          </div>
        </div>
      </div>

      {/* 4. Simple Chat Copilot Option */}
      <div className="glass p-5 rounded-2xl border border-slate-800/60" id="simple-cfo-copilot">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
          <div>
            <h3 className="text-xs uppercase font-extrabold text-slate-300 tracking-wider flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-cyan-400" />
              {language === "ht" ? "Konseyè Virtuel IA" : "Conseiller Virtuel Simple & Interactif"}
            </h3>
            <p className="text-[11px] text-slate-500">
              {language === "ht" ? "Poze nenpòt kesyon an kreyòl oswa fransè, entèlijans atifisyèl la ap reponn ou san mo finansye difisil." : "Posez une question en français ou en créole simple, l'intelligence artificielle vous répondra sans jargon financier."}
            </p>
          </div>
        </div>

        <div className="flex gap-2.5 bg-slate-950 border border-slate-850 rounded-xl p-2" id="ai-interactive-prompt-simple">
          <input
            id="bi-interactive-ai-prompt-simple"
            type="text"
            value={aiQuery}
            onChange={(e) => setAiQuery(e.target.value)}
            placeholder={language === "ht" ? "Egz: Kijan m ka fè plis pwofi mwa sa a ? oswa Fè m yon ti rezime senp." : "Ex : Comment puis-je économiser de l'argent ce mois-ci ? ou Fais-moi un résumé simple."}
            className="flex-1 bg-transparent border-0 outline-none p-2 text-xs text-slate-200"
            onKeyDown={(e) => {
              if (e.key === "Enter" && aiQuery.trim() && !aiLoading) {
                handleGenerateAiReport();
              }
            }}
          />
          <button
            id="bi-btn-prompt-submit-simple"
            onClick={handleGenerateAiReport}
            disabled={aiLoading || !aiQuery.trim()}
            className="py-1.5 px-4 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-slate-950 font-bold text-xs cursor-pointer flex items-center justify-center transition disabled:opacity-40"
          >
            {language === "ht" ? "Poze Kesyon" : "Poser la question"}
          </button>
        </div>

        {/* AI Loader */}
        {aiLoading && (
          <div className="bg-slate-900/60 p-6 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-3 mt-4" id="bi-ai-loading-panel-simple">
            <div className="w-7 h-7 rounded-full border-2 border-slate-800 border-t-cyan-400 animate-spin"></div>
            <p className="text-xs uppercase font-extrabold text-cyan-400 tracking-wider animate-pulse">
              {language === "ht" ? "Sistèm nan ap kalkile, tanpri tann yon ti moman..." : "Le conseiller étudie vos données, merci de patienter..."}
            </p>
          </div>
        )}

        {/* AI Insights display output */}
        {aiReport && !aiLoading && (
          <div className="flex flex-col gap-4 mt-4 p-4 bg-slate-950/50 rounded-xl border border-slate-850/60" id="simple-ai-cfo-answer">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>{language === "ht" ? "Repons konseyè a :" : "La réponse de votre conseiller :"}</span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line bg-slate-950/40 p-3.5 rounded-lg border border-slate-900 font-sans">
              {aiReport.summary}
            </p>

            {aiReport.recommendations && aiReport.recommendations.length > 0 && (
              <div className="mt-2">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {language === "ht" ? "Aksyon rekòmande :" : "Actions simples suggérées :"}
                </h5>
                <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1.5">
                  {aiReport.recommendations.map((rec: string, idx: number) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
