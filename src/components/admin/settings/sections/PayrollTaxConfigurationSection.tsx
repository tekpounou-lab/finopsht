import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Trash2, 
  History, 
  Calculator, 
  Lock, 
  AlertTriangle,
  Percent,
  Info
} from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { useAuth } from "../../../../hooks/useAuth";
import { IdentityRepository } from "../../../../repositories";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../../../../lib/firebase";

export interface CustomTaxRule {
  id: string;
  name: string;
  category: "PENSION" | "HEALTH" | "LOCAL" | "GOVERNMENT" | "OTHER";
  employeeRate: number; // percentage, e.g. 2.5
  employerRate: number; // percentage, e.g. 2.0
  enabled: boolean;
  description?: string;
}

export interface PayrollTaxConfig {
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  additionalTaxes: CustomTaxRule[];
  updatedAt?: string;
  updatedBy?: string;
}

export default function PayrollTaxConfigurationSection() {
  const { currentBusiness, businessSettings } = useBusinessContext();
  const { updateSettings, loading } = useBusinessAdmin();
  const { dbUser, user } = useAuth();

  // Role permissions check: Owner & Manager have full edit rights
  const userRole = (dbUser?.role || "EMPLOYEE").toUpperCase();
  const isAuthorized = userRole === "OWNER" || userRole === "MANAGER";

  // Load existing tax settings with strict fallback to Taxes = OFF (false)
  const existingPayroll = businessSettings?.payroll || {};
  const existingTaxes = existingPayroll.taxes || {};

  const [enabled, setEnabled] = useState<boolean>(() => {
    if (existingTaxes.enabled !== undefined) return Boolean(existingTaxes.enabled);
    if (existingPayroll.enable_social_taxes !== undefined) return Boolean(existingPayroll.enable_social_taxes);
    return false; // DEFAULT OFF
  });

  const [employeeRate, setEmployeeRate] = useState<number>(() => {
    return existingTaxes.employeeRate ?? existingPayroll.tax_cnss_employee ?? 5.0;
  });

  const [employerRate, setEmployerRate] = useState<number>(() => {
    return existingTaxes.employerRate ?? existingPayroll.tax_cnss_employer ?? 5.0;
  });

  const [additionalTaxes, setAdditionalTaxes] = useState<CustomTaxRule[]>(() => {
    if (Array.isArray(existingTaxes.additionalTaxes)) {
      return existingTaxes.additionalTaxes;
    }
    return [
      {
        id: "tax_cnss",
        name: "CNSS (Assurance Vieillesse)",
        category: "PENSION",
        employeeRate: 3.0,
        employerRate: 3.0,
        enabled: true,
        description: "Cotisation sociale légale pour la retraite"
      },
      {
        id: "tax_cns",
        name: "CNS (Contribution Sociale)",
        category: "GOVERNMENT",
        employeeRate: 2.0,
        employerRate: 0.0,
        enabled: true,
        description: "Contribution sociale complémentaire"
      },
      {
        id: "tax_ofatma",
        name: "OFATMA (Accidents & Maternité)",
        category: "HEALTH",
        employeeRate: 0.0,
        employerRate: 3.0,
        enabled: true,
        description: "Assurance accidents du travail et maternité"
      }
    ];
  });

  // Simulator State
  const [simulationGross, setSimulationGross] = useState<number>(50000);

  // New Custom Tax Item Modal / Inline Form
  const [showAddTaxModal, setShowAddTaxModal] = useState(false);
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxCategory, setNewTaxCategory] = useState<CustomTaxRule["category"]>("OTHER");
  const [newTaxEmpRate, setNewTaxEmpRate] = useState<number>(1.0);
  const [newTaxEmployerRate, setNewTaxEmployerRate] = useState<number>(1.0);
  const [newTaxDesc, setNewTaxDesc] = useState("");

  // Confirmation Dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Audit Logs State
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  // Sync state when businessSettings reloads
  useEffect(() => {
    if (existingTaxes.enabled !== undefined) {
      setEnabled(Boolean(existingTaxes.enabled));
    } else if (existingPayroll.enable_social_taxes !== undefined) {
      setEnabled(Boolean(existingPayroll.enable_social_taxes));
    } else {
      setEnabled(false);
    }

    if (existingTaxes.employeeRate !== undefined) setEmployeeRate(existingTaxes.employeeRate);
    if (existingTaxes.employerRate !== undefined) setEmployerRate(existingTaxes.employerRate);
    if (Array.isArray(existingTaxes.additionalTaxes)) setAdditionalTaxes(existingTaxes.additionalTaxes);
  }, [businessSettings]);

  // Fetch Audit History for Tax Config
  const fetchAuditHistory = async () => {
    if (!currentBusiness?.id) return;
    setLoadingAudit(true);
    try {
      const q = query(
        collection(db, "audit_logs"),
        where("business_id", "==", currentBusiness.id),
        where("action", "==", "PAYROLL_TAX_CONFIGURATION_UPDATED"),
        limit(10)
      );
      const snap = await getDocs(q);
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort in-memory to prevent requiring composite indexes
      logs.sort((a: any, b: any) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tB - tA;
      });
      setAuditHistory(logs);
    } catch (e) {
      console.warn("[PayrollTaxConfig] Error loading audit log history:", e);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    fetchAuditHistory();
  }, [currentBusiness?.id]);

  // Calculations for Simulator
  const activeEmpTaxPercentage = enabled
    ? additionalTaxes
        .filter(t => t.enabled)
        .reduce((sum, t) => sum + t.employeeRate, 0)
    : 0;

  const activeEmployerTaxPercentage = enabled
    ? additionalTaxes
        .filter(t => t.enabled)
        .reduce((sum, t) => sum + t.employerRate, 0)
    : 0;

  const simulatedEmpDeductions = Math.round((simulationGross * activeEmpTaxPercentage) / 100);
  const simulatedEmployerContributions = Math.round((simulationGross * activeEmployerTaxPercentage) / 100);
  const simulatedNetPay = simulationGross - simulatedEmpDeductions;

  // Add Custom Tax Handler
  const handleAddCustomTax = () => {
    if (!newTaxName.trim()) return;
    const newTax: CustomTaxRule = {
      id: `tax_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newTaxName.trim(),
      category: newTaxCategory,
      employeeRate: Number(newTaxEmpRate) || 0,
      employerRate: Number(newTaxEmployerRate) || 0,
      enabled: true,
      description: newTaxDesc.trim() || undefined
    };
    setAdditionalTaxes(prev => [...prev, newTax]);
    setNewTaxName("");
    setNewTaxEmpRate(1.0);
    setNewTaxEmployerRate(1.0);
    setNewTaxDesc("");
    setShowAddTaxModal(false);
  };

  const handleToggleTaxRule = (id: string) => {
    setAdditionalTaxes(prev => prev.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  const handleDeleteTaxRule = (id: string) => {
    setAdditionalTaxes(prev => prev.filter(t => t.id !== id));
  };

  // Submit Handler with Confirmation & Audit Log
  const handleSaveTaxConfiguration = async () => {
    if (!currentBusiness?.id) return;
    try {
      const updatedPayroll = {
        ...existingPayroll,
        enable_social_taxes: enabled, // Maintain backward compatibility
        taxes: {
          enabled,
          employeeRate,
          employerRate,
          additionalTaxes,
          updatedAt: new Date().toISOString(),
          updatedBy: dbUser?.displayName || user?.email || "Admin User"
        }
      };

      const beforeState = JSON.stringify({
        enabled: existingTaxes.enabled ?? existingPayroll.enable_social_taxes ?? false,
        employeeRate: existingTaxes.employeeRate ?? existingPayroll.tax_cnss_employee ?? 5.0,
        employerRate: existingTaxes.employerRate ?? existingPayroll.tax_cnss_employer ?? 5.0,
        additionalTaxes: existingTaxes.additionalTaxes || []
      });

      const afterState = JSON.stringify({
        enabled,
        employeeRate,
        employerRate,
        additionalTaxes
      });

      await updateSettings({
        ...businessSettings,
        payroll: updatedPayroll
      });

      // Create Audit Log Entry
      await IdentityRepository.createAuditLog({
        userId: dbUser?.uid || user?.uid || "system",
        userName: dbUser?.displayName || user?.email || "Admin User",
        userRole: userRole,
        business_id: currentBusiness.id,
        action: "PAYROLL_TAX_CONFIGURATION_UPDATED",
        beforeState,
        afterState,
        severity: "warning"
      });

      setShowConfirmDialog(false);
      setSuccessMessage("Configuration des taxes de paie enregistrée avec succès.");
      setTimeout(() => setSuccessMessage(null), 5000);
      fetchAuditHistory();
    } catch (err: any) {
      console.error("[PayrollTaxConfig] Error saving tax settings:", err);
      alert("Erreur lors de l'enregistrement de la configuration: " + err.message);
    }
  };

  return (
    <div className="space-y-8" id="payroll-tax-config-root">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-100 uppercase tracking-tight">
              Configuration des Taxes & Retenues de Paie
            </h3>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest border ${
              isAuthorized 
                ? "bg-emerald-950/60 border-emerald-800/80 text-emerald-400" 
                : "bg-amber-950/60 border-amber-800/80 text-amber-400"
            }`}>
              {userRole}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Gérez l'activation globale des prélèvements fiscaux, les taux cotisables et les règles de retenues légales.
          </p>
        </div>

        {isAuthorized && (
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black rounded-xl transition-all shadow-lg shadow-cyan-500/10 active:scale-95 uppercase tracking-wider shrink-0"
          >
            <Zap className="w-4 h-4" />
            {loading ? "ENREGISTREMENT..." : "ENREGISTRER LA CONFIGURATION"}
          </button>
        )}
      </div>

      {/* Success Banner */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-700/60 text-emerald-300 text-xs font-semibold flex items-center gap-3 animate-in fade-in duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Read-Only Warning if not Authorized */}
      {!isAuthorized && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/50 text-amber-300 text-xs flex items-center gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="font-bold">Accès en Lecture Seule</p>
            <p className="text-[11px] text-amber-400/80">
              Seuls les propriétaires (Owners) et managers habilités peuvent modifier la politique fiscale de la paie.
            </p>
          </div>
        </div>
      )}

      {/* Master Toggle Card */}
      <div className={`p-6 rounded-2xl border transition-all ${
        enabled
          ? "bg-emerald-950/20 border-emerald-800/80 shadow-[0_0_30px_-10px_rgba(16,185,129,0.15)]"
          : "bg-slate-900/40 border-slate-800/80"
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="text-sm font-black text-slate-100 uppercase tracking-wide">
                Statut Régime Fiscal de la Paie
              </span>
              {enabled ? (
                <span className="px-2.5 py-1 rounded-md text-[10px] bg-emerald-950 border border-emerald-600 text-emerald-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  TAXES ACTIVÉES (ON)
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-md text-[10px] bg-amber-950 border border-amber-700 text-amber-400 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-amber-400" />
                  TAXES DÉSACTIVÉES (OFF — DEFAULT)
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {enabled
                ? "Les prélèvements fiscaux et cotisations sociales sont appliqués automatiquement sur les rémunérations brutes lors de chaque génération de paie."
                : "Lorsqu'elles sont désactivées, les calculs de paie ignorent toutes les retenues fiscales et cotisations patronales. Le salaire net calculé sera exempt de toute déduction fiscale."}
            </p>
            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              Note: La modification du régime s'applique uniquement aux futurs calculs et n'affecte pas l'historique verrouillé.
            </div>
          </div>

          <label className={`relative inline-flex items-center cursor-pointer select-none shrink-0 ${!isAuthorized ? "opacity-50 pointer-events-none" : ""}`}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-slate-950 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-checked:border-emerald-500 shadow-inner"></div>
          </label>
        </div>
      </div>

      {/* Main Tax Rates Controls */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${!enabled ? "opacity-60" : ""}`}>
        {/* Employee Tax Percentage */}
        <div className="glass rounded-2xl p-6 space-y-4 border border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Percent className="w-4 h-4 text-cyan-400" />
              Taux Global Retenues Employé (%)
            </h4>
            <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded">
              Total Cumulé: {activeEmpTaxPercentage}%
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            Pourcentage déduit du salaire brut du salarié (ex: CNSS part employé 3% + CNS 2%).
          </p>

          <div className="space-y-2 pt-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Taux de Référence de Base (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                disabled={!isAuthorized || !enabled}
                value={employeeRate}
                onChange={(e) => setEmployeeRate(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-mono text-slate-100 outline-none focus:border-cyan-500/50 disabled:opacity-50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">%</span>
            </div>
          </div>
        </div>

        {/* Employer Tax Percentage */}
        <div className="glass rounded-2xl p-6 space-y-4 border border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              Taux Global Cotisations Patronales (%)
            </h4>
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
              Total Cumulé: {activeEmployerTaxPercentage}%
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            Cotisations à la charge de l'employeur (ex: CNSS part patronale 3% + OFATMA 2-3%).
          </p>

          <div className="space-y-2 pt-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Taux de Référence de Base (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                disabled={!isAuthorized || !enabled}
                value={employerRate}
                onChange={(e) => setEmployerRate(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm font-mono text-slate-100 outline-none focus:border-cyan-500/50 disabled:opacity-50"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Extensible Additional Tax Rules List */}
      <div className={`glass rounded-2xl p-6 space-y-6 border border-slate-800 transition-opacity ${!enabled ? "opacity-60" : ""}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              Règles de Taxes & Cotisations Spécifiques
            </h4>
            <p className="text-[11px] text-slate-400 mt-1">
              Configurez chaque composante fiscale individuellement (Retraite, Santé, Impôt, Cotisations locales).
            </p>
          </div>

          {isAuthorized && enabled && (
            <button
              onClick={() => setShowAddTaxModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-400 text-xs font-bold rounded-xl transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              Ajouter une Taxe / Cotisation
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {additionalTaxes.map((tax) => (
            <div
              key={tax.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                tax.enabled && enabled
                  ? "bg-slate-900/80 border-slate-700/80 shadow-md"
                  : "bg-slate-950/40 border-slate-800/40 opacity-50"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100">{tax.name}</span>
                  <label className={`relative inline-flex items-center cursor-pointer ${!isAuthorized || !enabled ? "pointer-events-none" : ""}`}>
                    <input
                      type="checkbox"
                      checked={tax.enabled}
                      onChange={() => handleToggleTaxRule(tax.id)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-950 border border-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>
                {tax.description && (
                  <p className="text-[10px] text-slate-400 line-clamp-2">{tax.description}</p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 uppercase text-[9px] block">Employé</span>
                  <span className="text-cyan-400 font-bold">{tax.employeeRate}%</span>
                </div>
                <div>
                  <span className="text-slate-500 uppercase text-[9px] block">Employeur</span>
                  <span className="text-emerald-400 font-bold">{tax.employerRate}%</span>
                </div>
                {isAuthorized && enabled && (
                  <button
                    onClick={() => handleDeleteTaxRule(tax.id)}
                    className="p-1 hover:bg-rose-950/50 text-slate-600 hover:text-rose-400 rounded transition-colors"
                    title="Supprimer la règle"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Simulator / Preview Box */}
      <div className="glass rounded-2xl p-6 space-y-6 border border-cyan-500/20 bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <Calculator className="w-4 h-4 text-cyan-400" />
            Simulateur d'Impact Fiscal en Temps Réel
          </h4>
          <span className="text-[10px] text-slate-500 font-mono uppercase">Calculatrice de Paie</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Salaire Brut de Test (HTG)</label>
            <input
              type="number"
              value={simulationGross}
              onChange={(e) => setSimulationGross(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono text-cyan-300 font-black outline-none focus:border-cyan-400"
            />
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Retenues Salariales</span>
            <div className="text-base font-mono font-black text-rose-400">
              -{simulatedEmpDeductions.toLocaleString()} HTG
            </div>
            <span className="text-[9px] text-slate-500">
              ({activeEmpTaxPercentage}% du brut)
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Cotisations Patronales</span>
            <div className="text-base font-mono font-black text-amber-400">
              +{simulatedEmployerContributions.toLocaleString()} HTG
            </div>
            <span className="text-[9px] text-slate-500">
              ({activeEmployerTaxPercentage}% du brut)
            </span>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 space-y-1">
            <span className="text-[10px] font-bold text-emerald-400/80 uppercase block">Salaire Net Résultant</span>
            <div className="text-lg font-mono font-black text-emerald-300">
              {simulatedNetPay.toLocaleString()} HTG
            </div>
            <span className="text-[9px] text-emerald-400/60">
              {enabled ? "Taxes appliquées" : "Taxes désactivées (Exempt)"}
            </span>
          </div>
        </div>
      </div>

      {/* Audit Configuration History */}
      <div className="glass rounded-2xl p-6 space-y-4 border border-slate-800">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            Historique d'Audit des Modifications Fiscales
          </h4>
          <button
            onClick={fetchAuditHistory}
            disabled={loadingAudit}
            className="text-[10px] font-bold text-slate-400 hover:text-cyan-400 transition-colors uppercase tracking-wider"
          >
            {loadingAudit ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>

        {auditHistory.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center italic">
            Aucun historique de modification fiscale enregistré pour le moment.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {auditHistory.map((log) => {
              let afterParsed: any = {};
              try {
                afterParsed = JSON.parse(log.afterState || "{}");
              } catch (e) {}

              const formattedDate = log.timestamp?.seconds
                ? new Date(log.timestamp.seconds * 1000).toLocaleString("fr-FR")
                : "Date inconnue";

              return (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{log.userName || "Admin"}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                        {log.userRole}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Régime: <strong className={afterParsed.enabled ? "text-emerald-400" : "text-amber-400"}>
                        {afterParsed.enabled ? "ACTIVÉ (ON)" : "DÉSACTIVÉ (OFF)"}
                      </strong>
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{formattedDate}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Custom Tax Rule Modal */}
      {showAddTaxModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-sm font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Ajouter une Taxe ou Cotisation Spéciale
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nom de la Taxe / Cotisation</label>
                <input
                  type="text"
                  placeholder="Ex: Assurance Maladie Complémentaire"
                  value={newTaxName}
                  onChange={(e) => setNewTaxName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Catégorie</label>
                <select
                  value={newTaxCategory}
                  onChange={(e) => setNewTaxCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
                >
                  <option value="PENSION">Cotisation Retraite / Pension</option>
                  <option value="HEALTH">Assurance Santé / Maladie</option>
                  <option value="GOVERNMENT">Taxe / Impôt d'État</option>
                  <option value="LOCAL">Taxe Municipale / Locale</option>
                  <option value="OTHER">Autre Retenue Spéciale</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Part Employé (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newTaxEmpRate}
                    onChange={(e) => setNewTaxEmpRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-mono outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Part Employeur (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newTaxEmployerRate}
                    onChange={(e) => setNewTaxEmployerRate(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 font-mono outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Description (Optionnelle)</label>
                <textarea
                  rows={2}
                  placeholder="Détails complémentaires..."
                  value={newTaxDesc}
                  onChange={(e) => setNewTaxDesc(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowAddTaxModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleAddCustomTax}
                disabled={!newTaxName.trim()}
                className="px-4 py-2 bg-cyan-500 text-slate-950 text-xs font-black rounded-xl hover:bg-cyan-400 transition-colors disabled:opacity-50"
              >
                Ajouter la Règle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog before saving */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-100">
                Confirmer la Politique Fiscale de la Paie
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Vous êtes sur le point d'enregistrer la politique fiscale de la paie. Cette modification s'appliquera uniquement aux **prochains cycles de paie**.
            </p>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono space-y-1 text-slate-400">
              <div>Régime: <strong className={enabled ? "text-emerald-400" : "text-amber-400"}>{enabled ? "TAXES ACTIVÉES" : "TAXES DÉSACTIVÉES"}</strong></div>
              <div>Taux Employé Cumulé: <strong className="text-cyan-400">{activeEmpTaxPercentage}%</strong></div>
              <div>Taux Employeur Cumulé: <strong className="text-emerald-400">{activeEmployerTaxPercentage}%</strong></div>
            </div>

            <p className="text-[10px] text-slate-500 italic">
              L'historique des fiches de paie déjà validées reste strictement inchangé.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveTaxConfiguration}
                disabled={loading}
                className="px-5 py-2 bg-cyan-500 text-slate-950 text-xs font-black rounded-xl hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
              >
                {loading ? "Enregistrement..." : "Confirmer & Appliquer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
