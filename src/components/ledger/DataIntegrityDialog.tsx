import React, { useState, useMemo } from 'react';
import { X, ShieldAlert, CheckCircle, AlertTriangle, Play, RefreshCw, Heart, Info, FileCheck } from 'lucide-react';
import { getDbDoc } from '../../lib/firebase';
import { setDoc } from 'firebase/firestore';
import { LedgerTransaction, Branch, Department, Employee, ForensicLog } from '../../types';
import { generateSignature, getLocalIP } from '../../data';
import { LedgerAuditEngine } from '../../services/accounting/LedgerAuditEngine';
import { AccountingEngine } from '../../services/AccountingEngine';

interface DataIntegrityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ledgerTransactions: LedgerTransaction[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  current_business_id: string;
  onAddForensicLog: (log: ForensicLog) => void | Promise<void>;
}

export default function DataIntegrityDialog({
  isOpen,
  onClose,
  ledgerTransactions,
  branches,
  departments,
  employees,
  current_business_id,
  onAddForensicLog
}: DataIntegrityDialogProps) {
  const [repairing, setRepairing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen) return null;

  const businessTransactions = ledgerTransactions.filter(tx => tx.business_id === current_business_id);
  const totalTxCount = businessTransactions.length;

  // Audit calculations
  const auditResults = businessTransactions.map(tx => {
    const issues: string[] = [];
    let isReparable = false;
    let repairDetails: any = {};

    // 1. Branch check
    const actualBranch = branches.find(b => b.id === tx.branchId);
    if (!actualBranch) {
      const matchedBranch = branches.find(
        b => b.code?.trim().toUpperCase() === tx.branchId?.trim().toUpperCase() || 
             b.name?.trim().toUpperCase() === tx.branchId?.trim().toUpperCase()
      );
      if (matchedBranch) {
        isReparable = true;
        repairDetails.branchId = matchedBranch.id;
        issues.push(`Succursale à résoudre : Code "${tx.branchId}" → ID "${matchedBranch.id}" (${matchedBranch.name})`);
      } else {
        issues.push(`Lien succursale rompu ou inconnu : "${tx.branchId || 'SANS_SUCCURSALE'}"`);
      }
    }

    // 2. Department check
    if (tx.departmentId !== undefined) {
      if (tx.departmentId === "") {
        isReparable = true;
        repairDetails.departmentId = null; // value to remove
        issues.push(`Ajustement champ vide : "" → nettoyage en "indéfini"`);
      } else {
        const actualDept = departments.find(d => d.id === tx.departmentId);
        if (!actualDept) {
          const matchedDept = departments.find(
            d => d.code?.trim().toUpperCase() === tx.departmentId?.trim().toUpperCase() || 
                 d.name?.trim().toUpperCase() === tx.departmentId?.trim().toUpperCase()
          );
          if (matchedDept) {
            isReparable = true;
            repairDetails.departmentId = matchedDept.id;
            issues.push(`Département à résoudre : Code "${tx.departmentId}" → ID "${matchedDept.id}" (${matchedDept.name})`);
          } else {
            issues.push(`Lien département rompu ou inconnu : "${tx.departmentId}"`);
          }
        }
      }
    }

    // 3. Employee check
    if (tx.employeeId !== undefined) {
      if (tx.employeeId === "") {
        isReparable = true;
        repairDetails.employeeId = null; // value to remove
        issues.push(`Ajustement champ employé vide : "" → nettoyage en "indéfini"`);
      } else {
        const actualEmp = employees.find(e => e.id === tx.employeeId);
        if (!actualEmp) {
          const matchedEmp = employees.find(
            e => e.email?.trim().toLowerCase() === tx.employeeId?.trim().toLowerCase() ||
                 e.name?.trim().toLowerCase() === tx.employeeId?.trim().toLowerCase()
          );
          if (matchedEmp) {
            isReparable = true;
            repairDetails.employeeId = matchedEmp.id;
            issues.push(`Employé à résoudre : Id/Email "${tx.employeeId}" → ID "${matchedEmp.id}" (${matchedEmp.name})`);
          } else {
            issues.push(`Lien personnel rompu ou inconnu : "${tx.employeeId}"`);
          }
        }
      }
    }

    // 4. Alignment / Coherence with Active RH Department & Position
    if (tx.employeeId && tx.employeeId !== "") {
      const actualEmp = employees.find(e => e.id === tx.employeeId);
      if (actualEmp) {
        if (actualEmp.departmentId && tx.departmentId !== actualEmp.departmentId) {
          isReparable = true;
          repairDetails.departmentId = actualEmp.departmentId;
          const currentDeptName = departments.find(d => d.id === tx.departmentId)?.name || 'Inexistant/Autre';
          const targetDeptName = departments.find(d => d.id === actualEmp.departmentId)?.name || 'Inconnu';
          issues.push(`Cohérence RH-Livre de Compte : Décalage département détecté pour ${actualEmp.name} (Poste: ${actualEmp.position || 'Employé'}). Correction automatique : "${currentDeptName}" → réaligné sur "${targetDeptName}"`);
        }
        if (actualEmp.branchId && tx.branchId !== actualEmp.branchId) {
          isReparable = true;
          repairDetails.branchId = actualEmp.branchId;
          const currentBranchName = branches.find(b => b.id === tx.branchId)?.name || 'Autre';
          const targetBranchName = branches.find(b => b.id === actualEmp.branchId)?.name || 'Inconnu';
          issues.push(`Cohérence RH-Livre de Compte : Décalage succursale détecté pour ${actualEmp.name}. Correction automatique : "${currentBranchName}" → réaligné sur "${targetBranchName}"`);
        }
      }
    }

    return {
      tx,
      isReparable,
      repairDetails,
      issues
    };
  }).filter(res => res.issues.length > 0);

  const reparableItems = auditResults.filter(item => item.isReparable);
  const healthScore = totalTxCount > 0 
    ? Math.max(0, Math.round(100 - (auditResults.length / totalTxCount) * 100)) 
    : 100;

  const handleRunRepair = async () => {
    if (reparableItems.length === 0) return;
    setRepairing(true);
    setSuccessMsg("");
    setErrorMsg("");

    let successCount = 0;
    try {
      for (const item of reparableItems) {
        const updatedTx = { ...item.tx };
        
        // Apply branch correction
        if (item.repairDetails.branchId) {
          updatedTx.branchId = item.repairDetails.branchId;
        }

        // Apply department correction
        if (item.repairDetails.departmentId === null) {
          delete (updatedTx as any).departmentId;
          delete (updatedTx as any).department_id;
        } else if (item.repairDetails.departmentId) {
          updatedTx.departmentId = item.repairDetails.departmentId;
          (updatedTx as any).department_id = item.repairDetails.departmentId;
        }

        // Apply employee correction
        if (item.repairDetails.employeeId === null) {
          delete (updatedTx as any).employeeId;
        } else if (item.repairDetails.employeeId) {
          updatedTx.employeeId = item.repairDetails.employeeId;
        }

        // Apply automatic double-entry COA mapping if missing
        if (!updatedTx.debit_account || !updatedTx.credit_account) {
          const balanced = AccountingEngine.applyDoubleEntryRules(updatedTx);
          updatedTx.debit_account = balanced.debit_account;
          updatedTx.credit_account = balanced.credit_account;
        }

        // Double check cents
        if (!updatedTx.amount_cents && updatedTx.amount) {
          updatedTx.amount_cents = Math.round(updatedTx.amount * 100);
        }

        // Persist to Firebase
        const txToSave = { ...updatedTx };
        if (txToSave.employeeId === undefined) {
          delete txToSave.employeeId;
        }
        await setDoc(getDbDoc("transactions", txToSave.id), txToSave);
        successCount++;
      }

      // Log forensic trail
      const repairLog: ForensicLog = {
        id: "f_rep_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: "admin_sys",
        userName: "Système de Réparation FinOps",
        userRole: "OWNER",
        business_id: current_business_id,
        action: "DATA_INTEGRITY_REPAIR_EXECUTED",
        beforeState: JSON.stringify({ reparableCount: reparableItems.length }),
        afterState: JSON.stringify({ correctedCount: successCount }),
        ipAddress: getLocalIP(),
        userAgent: window.navigator.userAgent,
        signature: "audit_repair_seal_" + Math.floor(Math.random() * 99999)
      };
      await onAddForensicLog(repairLog);

      setSuccessMsg(`Succès : ${successCount} transactions de l'historique ont été corrigées avec succès dans la base de données.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("Une erreur est survenue lors de l'application des modifications.");
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-rose-500/10 rounded-t-xl">
          <h3 className="font-bold text-rose-400 uppercase tracking-wider text-sm flex items-center gap-2 font-mono">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Module d'Audit & Réparation d'Intégrité des Données
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* Top Score Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center shadow-inner">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">Score Intégrité</span>
              <span className={`text-5xl font-black font-sans mt-3 leading-none tracking-tighter ${healthScore > 90 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {healthScore}%
              </span>
              <span className="text-[9px] text-slate-400 mt-3 font-black uppercase tracking-widest leading-none">
                {healthScore === 100 ? "Zéro anomalie" : `${auditResults.length} anomalies`}
              </span>
            </div>

            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col justify-center text-left">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-4 leading-none">Statistiques d'Audit</span>
              <div className="space-y-3 text-[11px] font-black uppercase tracking-widest">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Total Transactions</span>
                  <span className="text-slate-100">{totalTxCount}</span>
                </div>
                <div className="flex justify-between items-center text-rose-500">
                  <span className="opacity-80">Anomalies Actives</span>
                  <span className="bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">{auditResults.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col justify-center text-left sm:col-span-2 lg:col-span-1">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-4 leading-none">Actions de Récupération</span>
              <div className="space-y-3 text-[11px] font-black uppercase tracking-widest">
                <div className="flex justify-between items-center text-emerald-500">
                  <span className="opacity-80">Corrigibles</span>
                  <span className="bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">{reparableItems.length}</span>
                </div>
                <div className="flex justify-between items-center text-amber-500">
                  <span className="opacity-80">Saisie Manuelle</span>
                  <span className="bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">{auditResults.length - reparableItems.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Guidelines notes */}
          <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800 flex items-start gap-4 shadow-sm">
            <Info className="w-6 h-6 text-cyan-400 shrink-0" />
            <div className="text-[11px] text-slate-500 leading-relaxed font-sans font-medium uppercase tracking-wider">
              <strong className="text-slate-200 font-black">Comment se produisent ces écarts ? </strong> 
              Historiquement, l'importateur CSV a pu stocker des codes textuels bruts au lieu des identifiants techniques Firestore stables. Ce module scanne ces codes, les apparie avec les codes du personnel et de la structure HR FinOps, puis réécrit les transactions de manière propre.
            </div>
          </div>

          {/* Messages */}
          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-450 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Audit report lists */}
          {auditResults.length > 0 ? (
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                Livre d'incidents d'intégrité ({auditResults.length} anomalies)
              </h4>
              <div className="bg-slate-950 rounded-2xl border border-slate-800 max-h-72 overflow-y-auto divide-y divide-slate-800/60 shadow-inner">
                {auditResults.map((item) => (
                  <div key={item.tx.id} className="p-4 text-[10.5px] font-sans text-slate-300 hover:bg-slate-900/30 transition-colors flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono font-black border border-slate-700/50">#{item.tx.id.substring(0, 8)}</span>
                        <span className="text-slate-100 font-black uppercase tracking-tight">{item.tx.description}</span>
                        <span className="text-slate-600 text-[9px] font-mono">{new Date(item.tx.date).toLocaleDateString()}</span>
                      </div>
                      <div className="space-y-1.5 pl-3 border-l-2 border-rose-500/30">
                        {item.issues.map((issue, idx) => (
                          <div key={idx} className="text-rose-400/90 flex items-start gap-2 font-medium leading-relaxed">
                            <span className="text-rose-500 mt-1 shrink-0">●</span> 
                            <span>{issue}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="shrink-0 mt-2 sm:mt-0">
                      {item.isReparable ? (
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 py-1 px-2 rounded-lg font-black uppercase tracking-widest shadow-sm">
                          Réparable
                        </span>
                      ) : (
                        <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 py-1 px-2 rounded-lg font-black uppercase tracking-widest shadow-sm">
                          Manuel Requis
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-8 bg-slate-950 flex flex-col items-center text-center justify-center gap-3 rounded-lg border border-slate-850/60">
              <Heart className="w-10 h-10 text-emerald-400 animate-pulse" />
              <div className="font-bold text-slate-200">Excellente intégrité des données comptables !</div>
              <p className="text-xs text-slate-500 max-w-sm">Toutes les transactions passées correspondent parfaitement à vos structures de département, succursales et personnel.</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div className="text-xs text-slate-500">
            {reparableItems.length > 0 && `${reparableItems.length} corrections automatisées prêtes à l'exécution.`}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold rounded text-slate-400 hover:text-slate-200 transition">
              Fermer
            </button>
            {reparableItems.length > 0 && (
              <button
                onClick={handleRunRepair}
                disabled={repairing}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 text-xs font-bold rounded transition disabled:opacity-50 shadow-lg shadow-rose-900/20"
              >
                {repairing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Correction en cours...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Lancer Réparation ({reparableItems.length})
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
