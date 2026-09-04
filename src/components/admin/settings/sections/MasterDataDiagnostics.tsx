import React, { useState, useEffect } from "react";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ArrowRight, 
  Combine, 
  Activity, 
  UserX, 
  DollarSign, 
  ShieldAlert,
  Loader2,
  Trash2,
  Check
} from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { MasterDataSynchronizationService, MasterAuditReport } from "../../../../domains/organization/services/MasterDataSynchronizationService";
import { useI18n } from "../../../../i18n";
import { motion, AnimatePresence } from "motion/react";

export default function MasterDataDiagnostics() {
  const { 
    currentBusiness, 
    branches, 
    departments, 
    employees, 
    ledgerTransactions, 
    isRefreshing 
  } = useBusinessContext();
  
  const { t } = useI18n();

  const [auditReport, setAuditReport] = useState<MasterAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Merge modal states
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeType, setMergeType] = useState<"DEPT" | "BRANCH">("DEPT");
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const runAudit = async () => {
    if (!currentBusiness) return;
    setLoading(true);
    try {
      const report = await MasterDataSynchronizationService.auditMasterData(
        currentBusiness.id,
        departments,
        branches,
        employees,
        ledgerTransactions
      );
      setAuditReport(report);
    } catch (err: any) {
      console.error("Audit failed", err);
      setLogs(prev => [...prev, `[Erreur] Échec de l'audit: ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [currentBusiness, branches, departments, employees, ledgerTransactions]);

  const handleAutoRepair = async () => {
    if (!currentBusiness) return;
    setRepairing(true);
    setLogs(prev => [...prev, "Lancement de la réparation automatique des références..."]);
    try {
      await MasterDataSynchronizationService.autoRepairReferences(currentBusiness.id);
      setLogs(prev => [...prev, "[Succès] Réparation des références achevée. Synchronisation des données en cours."]);
      await runAudit();
    } catch (err: any) {
      setLogs(prev => [...prev, `[Erreur] Échec de la réparation: ${err.message}`]);
    } finally {
      setRepairing(false);
    }
  };

  const handleMerge = async () => {
    if (!currentBusiness || !mergeSourceId || !mergeTargetId) return;
    if (mergeSourceId === mergeTargetId) {
      alert("Le département/succursale source et cible ne peuvent pas être identiques.");
      return;
    }

    setMerging(true);
    setLogs(prev => [...prev, `Lancement de la fusion (${mergeType})...`]);
    try {
      if (mergeType === "DEPT") {
        await MasterDataSynchronizationService.mergeDepartments(
          currentBusiness.id,
          mergeSourceId,
          mergeTargetId
        );
        setLogs(prev => [...prev, `[Succès] Départements fusionnés avec succès.`]);
      } else {
        await MasterDataSynchronizationService.mergeBranches(
          currentBusiness.id,
          mergeSourceId,
          mergeTargetId
        );
        setLogs(prev => [...prev, `[Succès] Succursales fusionnées avec succès.`]);
      }
      setShowMergeModal(false);
      setMergeSourceId("");
      setMergeTargetId("");
      await runAudit();
    } catch (err: any) {
      setLogs(prev => [...prev, `[Erreur] Échec de la fusion: ${err.message}`]);
    } finally {
      setMerging(false);
    }
  };

  if (!currentBusiness) return null;

  const totalAnomalies = auditReport 
    ? (auditReport.unlinkedEmployees.length + 
       auditReport.unlinkedTransactions.length + 
       auditReport.duplicatesDetected.departments.length + 
       auditReport.duplicatesDetected.branches.length)
    : 0;

  const healthScore = auditReport 
    ? (auditReport.isValid ? 100 : Math.max(0, 100 - totalAnomalies * 12))
    : 100;

  return (
    <div className="space-y-6" id="master-diagnostics-root">
      {/* Upper Status Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden border border-slate-900">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2.5 py-1 rounded-full">
                Enterprise Integrity Engine
              </span>
              <h4 className="text-base font-extrabold text-slate-100 mt-3">Rapport d'Intégrité de la Structure</h4>
              <p className="text-xs text-slate-500 max-w-md">
                Analyse sémantique complète de la cohérence des liaisons entre les employés, les transactions comptables et la structure organisationnelle.
              </p>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Score de Santé</span>
              <p className={`text-4xl font-black mt-1 ${healthScore === 100 ? "text-emerald-400" : healthScore > 75 ? "text-amber-400" : "text-rose-400"}`}>
                {healthScore}%
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 items-center justify-between border-t border-slate-900 pt-4">
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase">Anomalies</p>
                <p className={`text-lg font-black mt-0.5 ${totalAnomalies === 0 ? "text-slate-400" : "text-rose-400"}`}>
                  {totalAnomalies}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase">Succursales Actives</p>
                <p className="text-lg font-black text-slate-200 mt-0.5">{branches.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase">Départements</p>
                <p className="text-lg font-black text-slate-200 mt-0.5">{departments.length}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={runAudit}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold rounded-lg hover:bg-slate-850 hover:text-white transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                RÉANALYSER
              </button>

              {totalAnomalies > 0 && (
                <button 
                  onClick={handleAutoRepair}
                  disabled={repairing}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg hover:bg-amber-500/20 transition-all shadow-lg shadow-amber-500/5"
                >
                  {repairing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      RÉPARATION...
                    </>
                  ) : (
                    <>
                      <Activity className="w-3.5 h-3.5" />
                      RÉPARER AUTOMATIQUEMENT
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Logs & Feed Panel */}
        <div className="glass rounded-2xl p-6 border border-slate-900 flex flex-col justify-between">
          <div className="space-y-3">
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Console de Diagnostic</h5>
            <div className="bg-slate-950/80 rounded-xl p-4 border border-slate-900 h-32 overflow-y-auto font-mono text-[9px] text-slate-400 space-y-2">
              {logs.length === 0 ? (
                <p className="text-slate-600 italic">Aucune action récente. Prêt à auditer.</p>
              ) : (
                logs.map((log, idx) => (
                  <p key={idx} className={log.startsWith("[Succès]") ? "text-emerald-400" : log.startsWith("[Erreur]") ? "text-rose-400" : "text-slate-400"}>
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
          <div className="text-[9px] text-slate-500 leading-relaxed mt-4">
            * L'auto-réparation lie automatiquement les collaborateurs et transactions orphelins aux succursales ou départements par défaut de l'entreprise.
          </div>
        </div>
      </div>

      {/* Main Analysis Section */}
      {loading ? (
        <div className="glass rounded-2xl p-12 text-center border border-slate-900">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto mb-4" />
          <p className="text-xs text-slate-400 font-medium">Audit en cours de la base de données ERP...</p>
        </div>
      ) : auditReport ? (
        <div className="space-y-6">
          {/* 1. Potential Duplicates Detected */}
          <div className="glass rounded-2xl p-6 border border-slate-900 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Combine className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-extrabold text-slate-100 uppercase tracking-tight">Détection de Doublons Sémantiques</h4>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                auditReport.duplicatesDetected.departments.length + auditReport.duplicatesDetected.branches.length === 0 
                  ? "bg-emerald-500/10 text-emerald-400" 
                  : "bg-rose-500/10 text-rose-400"
              }`}>
                {auditReport.duplicatesDetected.departments.length + auditReport.duplicatesDetected.branches.length === 0 
                  ? "AUCUN DOUBLON" 
                  : `${auditReport.duplicatesDetected.departments.length + auditReport.duplicatesDetected.branches.length} GROUPES DÉTECTÉS`}
              </span>
            </div>

            {auditReport.duplicatesDetected.departments.length + auditReport.duplicatesDetected.branches.length === 0 ? (
              <div className="bg-slate-900/10 border border-slate-900 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <p className="text-xs text-slate-400">Toutes les succursales et départements possèdent des identifiants et des structures sémantiques uniques.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Department Duplicates */}
                {auditReport.duplicatesDetected.departments.map((dupIds, idx) => {
                  const dups = dupIds.map(id => departments.find(d => d.id === id)).filter(Boolean);
                  if (dups.length === 0) return null;
                  return (
                    <div key={`dept-dup-${idx}`} className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Doublons Départementaux Potentiels</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {dups.map(d => (
                            <span key={d?.id} className="text-xs font-bold text-slate-300 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                              {d?.name} <span className="text-[9px] font-mono text-slate-500 ml-1">({d?.code || "SANS CODE"})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setMergeType("DEPT");
                          setMergeSourceId(dupIds[1]);
                          setMergeTargetId(dupIds[0]);
                          setShowMergeModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500 text-slate-950 text-[10px] font-extrabold rounded-lg hover:bg-cyan-400 transition-all shadow-md shadow-cyan-500/10"
                      >
                        <Combine className="w-3.5 h-3.5" />
                        FUSIONNER
                      </button>
                    </div>
                  );
                })}

                {/* Branch Duplicates */}
                {auditReport.duplicatesDetected.branches.map((dupIds, idx) => {
                  const dups = dupIds.map(id => branches.find(b => b.id === id)).filter(Boolean);
                  if (dups.length === 0) return null;
                  return (
                    <div key={`branch-dup-${idx}`} className="bg-slate-900/30 border border-slate-900 rounded-xl p-4 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Doublons de Succursale Potentiels</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {dups.map(b => (
                            <span key={b?.id} className="text-xs font-bold text-slate-300 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                              {b?.name} <span className="text-[9px] font-mono text-slate-500 ml-1">({b?.code || "SANS CODE"})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setMergeType("BRANCH");
                          setMergeSourceId(dupIds[1]);
                          setMergeTargetId(dupIds[0]);
                          setShowMergeModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-slate-950 text-[10px] font-extrabold rounded-lg hover:bg-amber-400 transition-all shadow-md shadow-amber-500/10"
                      >
                        <Combine className="w-3.5 h-3.5" />
                        FUSIONNER
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Unlinked Employees & Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Unlinked Employees Card */}
            <div className="glass rounded-2xl p-6 border border-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserX className="w-4 h-4 text-slate-400" />
                  <h4 className="text-xs font-extrabold text-slate-100 uppercase tracking-tight">Collaborateurs Sans Liaison Valide</h4>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  auditReport.unlinkedEmployees.length === 0 
                    ? "bg-emerald-500/10 text-emerald-400" 
                    : "bg-rose-500/10 text-rose-400"
                }`}>
                  {auditReport.unlinkedEmployees.length === 0 ? "COHÉRENT" : `${auditReport.unlinkedEmployees.length} ORPHELINS`}
                </span>
              </div>

              {auditReport.unlinkedEmployees.length === 0 ? (
                <div className="bg-slate-900/10 border border-slate-900 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-slate-400">Chaque collaborateur actif de l'entreprise est correctement affecté à une succursale et un département.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditReport.unlinkedEmployees.map(emp => (
                    <div key={emp.id} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl flex items-center justify-between">
                      <div>
                        <p className="text-xs font-extrabold text-slate-300">{emp.name}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          Dept: <span className="text-rose-400/80 font-semibold">{emp.departmentId || "Aucun"}</span> | 
                          Succ: <span className="text-rose-400/80 font-semibold">{emp.branchId || "Aucune"}</span>
                        </p>
                      </div>
                      <span className="text-[8px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                        NON RECONNU
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Unlinked Transactions Card */}
            <div className="glass rounded-2xl p-6 border border-slate-900 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-slate-400" />
                  <h4 className="text-xs font-extrabold text-slate-100 uppercase tracking-tight">Transactions Sans Liaison Valide</h4>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  auditReport.unlinkedTransactions.length === 0 
                    ? "bg-emerald-500/10 text-emerald-400" 
                    : "bg-rose-500/10 text-rose-400"
                }`}>
                  {auditReport.unlinkedTransactions.length === 0 ? "COHÉRENT" : `${auditReport.unlinkedTransactions.length} ORPHELINES`}
                </span>
              </div>

              {auditReport.unlinkedTransactions.length === 0 ? (
                <div className="bg-slate-900/10 border border-slate-900 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <p className="text-xs text-slate-400">Chaque transaction comptable de l'ERP est correctement rattachée à un centre de coût ou département.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditReport.unlinkedTransactions.map(tx => (
                    <div key={tx.id} className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl flex items-center justify-between">
                      <div className="max-w-[70%]">
                        <p className="text-xs font-bold text-slate-300 truncate">{tx.description}</p>
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          Montant: <span className="text-cyan-400 font-bold">{tx.amount.toLocaleString()} HTG</span> | 
                          Dept ID: <span className="text-rose-400/80 font-semibold">{tx.departmentId || "Aucun"}</span>
                        </p>
                      </div>
                      <span className="text-[8px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                        NON LIÉ
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Merge Modal Dialog */}
      <AnimatePresence>
        {showMergeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div>
                  <h4 className="text-sm font-bold text-slate-100 uppercase tracking-tight">
                    FUSIONNER DEUX {mergeType === "DEPT" ? "DÉPARTEMENTS" : "SUCCURSALES"}
                  </h4>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1">Regroupement Master Data</p>
                </div>
                <button onClick={() => setShowMergeModal(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 transition-colors">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-xs text-amber-300">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span className="font-extrabold">Avertissement de Cascade</span>
                  </div>
                  <p className="leading-relaxed text-[11px] text-amber-400/90">
                    Cette action réaffectera de manière irréversible tous les collaborateurs, contrats, salaires et transactions comptables du premier élément vers le second, puis supprimera le premier.
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Élément à supprimer (Source)
                    </label>
                    <select 
                      value={mergeSourceId}
                      onChange={(e) => setMergeSourceId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                    >
                      <option value="">Sélectionner la source...</option>
                      {mergeType === "DEPT" ? (
                        departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.code || "DEPT"})</option>
                        ))
                      ) : (
                        branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.code || "BRANCH"})</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="flex items-center justify-center py-1">
                    <ArrowRight className="w-5 h-5 text-slate-600 rotate-90" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Élément à conserver (Master Target)
                    </label>
                    <select 
                      value={mergeTargetId}
                      onChange={(e) => setMergeTargetId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                    >
                      <option value="">Sélectionner la cible...</option>
                      {mergeType === "DEPT" ? (
                        departments.filter(d => d.id !== mergeSourceId).map(d => (
                          <option key={d.id} value={d.id}>{d.name} ({d.code || "DEPT"})</option>
                        ))
                      ) : (
                        branches.filter(b => b.id !== mergeSourceId).map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.code || "BRANCH"})</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowMergeModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-800 text-xs font-bold text-slate-400 hover:bg-slate-800 transition-all"
                  >
                    ANNULER
                  </button>
                  <button 
                    onClick={handleMerge}
                    disabled={merging || !mergeSourceId || !mergeTargetId}
                    className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-500/10 flex items-center justify-center gap-2"
                  >
                    {merging ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        FUSION...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        CONFIRMER LA FUSION
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
