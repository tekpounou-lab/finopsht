import React from "react";
import { Brain, Sparkles, Download, FileSpreadsheet, FileText } from "lucide-react";
import { ReportType } from "../hooks/useBIUIState";

interface BIAiReportsTabProps {
  tbi: Record<string, string>;
  aiQuery: string;
  setAiQuery: (val: string) => void;
  aiLoading: boolean;
  aiReport: any | null;
  profitMarginPercentage: number;
  financialStressScore: number;
  reportType: ReportType;
  setReportType: (type: ReportType) => void;
  handleGenerateAiReport: () => void;
  handleExportData: (format: "csv" | "excel" | "pdf") => void;
}

export const BIAiReportsTab: React.FC<BIAiReportsTabProps> = ({
  tbi,
  aiQuery,
  setAiQuery,
  aiLoading,
  aiReport,
  profitMarginPercentage,
  financialStressScore,
  reportType,
  setReportType,
  handleGenerateAiReport,
  handleExportData,
}) => {
  return (
    <div className="flex flex-col gap-6" id="ai-reports-tab-content">
      {/* SECTION: DEEP INTEGRATION AI CFO STRATEGIC ENGINE */}
      <div className="flex flex-col gap-3.5" id="ai-strategic-section">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          {tbi.aiCfoTitle}
        </h3>

        <div className="bg-gradient-to-r from-slate-900 via-cyan-950/10 to-indigo-950/10 border border-slate-850/80 rounded-2xl p-6 shadow-xl flex flex-col gap-5" id="ai-strategic-cfo-card">
          <div className="flex items-start justify-between gap-4" id="ai-strategic-meta">
            <div className="flex gap-3" id="ai-meta-details">
              <div className="w-10 h-10 rounded-xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                <Brain className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                  Strategic Advisor Engine
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-[8.5px] text-cyan-400 font-mono">
                    GEMINI-3.5-FLASH
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400 max-w-xl font-light">
                  Analyse forensique en temps réel connectée aux bases de données du grand livre, du personnel et de la borne de scan FinOps (Tek Pou Nou) pour des audits de conformité automatisés.
                </p>
              </div>
            </div>

            {/* Re-trigger action button */}
            <button
              id="bi-btn-retrigger-ai"
              onClick={handleGenerateAiReport}
              disabled={aiLoading}
              className="py-1.5 px-4 font-bold text-xs rounded-lg bg-cyan-600 hover:bg-cyan-700 text-slate-950 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {tbi.generateAiReport}
            </button>
          </div>

          {/* Prompt custom input row */}
          <div className="flex gap-2.5 bg-slate-950 border border-slate-850 rounded-xl p-2" id="ai-interactive-prompt">
            <input
              id="bi-interactive-ai-prompt"
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder={tbi.aiPromptPlaceholder}
              className="flex-1 bg-transparent border-0 outline-none p-2 text-xs text-slate-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && aiQuery.trim() && !aiLoading) {
                  handleGenerateAiReport();
                }
              }}
            />
            <button
              id="bi-btn-prompt-submit"
              onClick={handleGenerateAiReport}
              disabled={aiLoading || !aiQuery.trim()}
              className="py-1.5 px-4 rounded-lg bg-cyan-700 hover:bg-cyan-800 text-slate-950 font-bold text-xs cursor-pointer flex items-center justify-center"
            >
              Analyse
            </button>
          </div>

          {/* AI Loader */}
          {aiLoading && (
            <div className="bg-slate-900/60 p-6 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center gap-3" id="bi-ai-loading-panel">
              <div className="w-7 h-7 rounded-full border-2 border-slate-800 border-t-cyan-400 animate-spin"></div>
              <p className="text-xs uppercase font-extrabold text-cyan-400 tracking-wider animate-pulse">{tbi.aiLoading}</p>
            </div>
          )}

          {/* AI Insights display output */}
          {aiReport && !aiLoading && (
            <div className="flex flex-col gap-4 mt-2" id="ai-strategic-insights-results">
              {/* Metrics blocks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" id="ai-ratios-summary">
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 hover:border-cyan-500/10">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold tracking-wide">Cash Flow State</span>
                  <div className="text-xs font-semibold text-slate-200 mt-1">{aiReport.metrics?.cash_flow || "Sécurisé"}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 hover:border-cyan-500/10">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold tracking-wide">Risque Opérationnel</span>
                  <div className="text-xs font-semibold text-slate-300 mt-1">{aiReport.metrics?.fraud_risk || "Faibles Ratios d'Écarts"}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 hover:border-cyan-500/10">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold tracking-wide">Marge Rentable</span>
                  <div className="text-xs font-semibold text-slate-200 mt-1">{aiReport.metrics?.profit_ratio || `${profitMarginPercentage}%`}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 hover:border-cyan-500/10">
                  <span className="text-[9.5px] text-slate-500 uppercase font-bold tracking-wide">Health Score</span>
                  <div className="text-xs font-semibold text-slate-200 mt-1">{aiReport.metrics?.financial_health_score || `${financialStressScore.toFixed(0)}/100`}</div>
                </div>
              </div>

              {/* Text summary block */}
              <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl flex flex-col gap-2" id="ai-summary-text">
                <span className="text-[10px] uppercase font-mono tracking-widest text-cyan-400 font-bold block">Synthèse du CFO (Gemini AI feedback)</span>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">{aiReport.summary}</p>
              </div>

              {/* Recommendations */}
              {aiReport.recommendations && aiReport.recommendations.length > 0 && (
                <div className="bg-slate-950/50 border border-slate-850 p-4 rounded-xl" id="ai-recs-text-box">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-cyan-400 font-bold block mb-2">Recommandations Stratégiques Suggérées</span>
                  <ul className="list-inside list-disc text-xs text-slate-400 flex flex-col gap-2">
                    {aiReport.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="leading-relaxed">{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SECTION: EXPORTS AND PROFESSIONAL REPORTS DESK */}
      <div className="flex flex-col gap-3.5" id="bi-export-section">
        <h3 className="text-xs uppercase font-extrabold text-slate-400 tracking-wider flex items-center gap-1.5">
          <span className="w-1.5 h-3.5 bg-cyan-500 rounded-sm"></span>
          {tbi.exportCenter}
        </h3>

        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow flex flex-col md:flex-row gap-6 justify-between items-center" id="bi-reporting-center-card">
          <div className="flex flex-col lg:flex-row items-center gap-4 w-full md:w-auto" id="report-selections">
            <div className="flex flex-col">
              <span className="text-[10.5px] uppercase font-extrabold text-slate-400 block mb-1.5">{tbi.exportHeader} :</span>
              <div className="flex flex-wrap gap-2" id="bi-report-type-chips">
                {[
                  { id: "payroll", label: "Masse Salariale / Paie" },
                  { id: "attendance", label: "Pointage de Présences" },
                  { id: "profitability", label: "Rentabilité Succursales" },
                  { id: "employee", label: "Fiches Pèfòmans" },
                  { id: "audit", label: "Odit Forensic ERP" },
                ].map((chip, _i) => (
                  <button
                    key={`${chip.id}-${_i}`}
                    id={`chip-bt-export-${chip.id}`}
                    onClick={() => setReportType(chip.id as any)}
                    className={`py-1 px-3 rounded-lg text-[10.5px] font-bold cursor-pointer transition select-none ${
                      reportType === chip.id
                        ? "bg-cyan-500/10 border border-cyan-500/40 text-cyan-400"
                        : "bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action triggers */}
          <div className="flex gap-2.5 text-xs font-bold" id="export-action-btns">
            <button
              id="bi-btn-csv-export"
              onClick={() => handleExportData("csv")}
              className="py-2 px-4 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-100 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              {tbi.exportCsv}
            </button>
            <button
              id="bi-btn-excel-export"
              onClick={() => handleExportData("excel")}
              className="py-2 px-4 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-100 flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              {tbi.exportExcel}
            </button>
            <button
              id="bi-btn-pdf-export"
              onClick={() => handleExportData("pdf")}
              className="py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-slate-950 flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-950" />
              {tbi.exportPdf}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
