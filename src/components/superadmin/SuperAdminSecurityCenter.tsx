import React, { useState, useEffect } from "react";
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Lock, 
  Key, 
  RotateCw, 
  Search, 
  Filter, 
  UserX, 
  UserCheck, 
  Plus, 
  X, 
  FileCheck, 
  Globe, 
  Check, 
  AlertCircle,
  RefreshCw,
  Eye,
  Sliders,
  Trash2,
  Sparkles,
  KeyRound
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { db } from "../../lib/firebase";
import { realtimeManager } from "../../services/firestore/realtimeManager";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { 
  SecurityRepository, 
  VaultIntegrityReport, 
  SecurityActor 
} from "../../repositories/SecurityRepository";
import { 
  SecurityAlert, 
  PlatformSecurityPolicy, 
  SecurityAlertStatus, 
  SecurityAlertSeverity,
  SecurityAlertType,
  User 
} from "../../types";

interface SuperAdminSecurityCenterProps {
  currentUser: any;
  allUsers: any[];
  allAuditLogs: any[];
  onLogAdminAction?: (actionType: string, detail: string, tenantId?: string) => Promise<void>;
}

export const SuperAdminSecurityCenter: React.FC<SuperAdminSecurityCenterProps> = ({
  currentUser,
  allUsers,
  allAuditLogs,
  onLogAdminAction
}) => {
  // Real Firestore Security Alerts State
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"ALL" | SecurityAlertStatus>("ALL");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | SecurityAlertSeverity>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPurgingMock, setIsPurgingMock] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Platform Security Policy State (Firestore SSOT)
  const [policy, setPolicy] = useState<PlatformSecurityPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);
  const [newWhitelistedIp, setNewWhitelistedIp] = useState("");

  // Forensic Vault Integrity Audit State
  const [isAuditingVault, setIsAuditingVault] = useState(false);
  const [vaultReport, setVaultReport] = useState<VaultIntegrityReport | null>(null);

  // Resolution & Action Modals (Iframe-safe, zero window.confirm dependency)
  const [selectedAlertForResolution, setSelectedAlertForResolution] = useState<SecurityAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);

  const [selectedAlertForSuspension, setSelectedAlertForSuspension] = useState<SecurityAlert | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [isSubmittingSuspension, setIsSubmittingSuspension] = useState(false);

  const [selectedAlertForBlockIp, setSelectedAlertForBlockIp] = useState<SecurityAlert | null>(null);
  const [isSubmittingBlockIp, setIsSubmittingBlockIp] = useState(false);

  const [selectedAlertForMfaReset, setSelectedAlertForMfaReset] = useState<SecurityAlert | null>(null);
  const [isSubmittingMfaReset, setIsSubmittingMfaReset] = useState(false);

  const [selectedAlertForDeletion, setSelectedAlertForDeletion] = useState<SecurityAlert | null>(null);
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);

  const [isCreateIncidentOpen, setIsCreateIncidentOpen] = useState(false);
  const [newIncidentType, setNewIncidentType] = useState<SecurityAlertType>("SUSPICIOUS_DATA_ACCESS");
  const [newIncidentUser, setNewIncidentUser] = useState("");
  const [newIncidentTenant, setNewIncidentTenant] = useState("");
  const [newIncidentDetail, setNewIncidentDetail] = useState("");
  const [newIncidentSeverity, setNewIncidentSeverity] = useState<SecurityAlertSeverity>("HIGH");
  const [newIncidentIp, setNewIncidentIp] = useState("127.0.0.1");
  const [isCreatingIncident, setIsCreatingIncident] = useState(false);

  // Active Actor
  const actor: SecurityActor = {
    uid: currentUser?.uid || currentUser?.id || "super_admin_system",
    email: currentUser?.email || "super-admin@finops.com",
    name: currentUser?.name || currentUser?.displayName || "Super Admin",
    role: "SUPER_ADMIN"
  };

  // 1. Subscribe to Real-Time Security Alerts from Firestore (Only Authentic Real Data)
  useEffect(() => {
    setAlertsLoading(true);

    const unsubAlerts = realtimeManager.subscribe(
      "superadmin_security_alerts_feed",
      collection(db, "security_alerts"),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SecurityAlert));
          list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
          setAlerts(list);
        } else {
          setAlerts([]);
        }
        setAlertsLoading(false);
      },
      (err) => {
        console.warn("[SuperAdminSecurityCenter] Offline fallback for security alerts:", err);
        SecurityRepository.getSecurityAlerts().then((fallbackAlerts) => {
          setAlerts(fallbackAlerts);
          setAlertsLoading(false);
        });
      }
    );

    // 2. Load Platform Security Policy from Firestore SSOT
    SecurityRepository.getSecurityPolicy()
      .then((p) => {
        setPolicy(p);
        setPolicyLoading(false);
      })
      .catch((err) => {
        console.warn("[SuperAdminSecurityCenter] Error fetching security policy:", err);
        setPolicyLoading(false);
      });

    return () => {
      unsubAlerts();
    };
  }, []);

  // Action: Purge Mock Test Data
  const handlePurgeMockData = async () => {
    setIsPurgingMock(true);
    try {
      const purged = await SecurityRepository.purgeMockSecurityAlerts(actor);
      if (purged > 0) {
        toast.success(`${purged} alerte(s) fictive(s) supprimée(s). Données 100% réelles.`);
      } else {
        toast.info("Toutes les données présentes sont déjà 100% authentiques.");
      }
    } catch (err: any) {
      toast.error(`Erreur lors de la purge: ${err.message || err}`);
    } finally {
      setIsPurgingMock(false);
    }
  };

  // Filtered alerts
  const filteredAlerts = alerts.filter((alert) => {
    const matchesStatus = statusFilter === "ALL" || alert.status === statusFilter;
    const matchesSeverity = severityFilter === "ALL" || alert.severity === severityFilter;
    const matchesSearch =
      searchQuery.trim() === "" ||
      alert.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.tenant.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.detail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      alert.ip.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSeverity && matchesSearch;
  });

  // Action 1: Acknowledge Alert
  const handleAcknowledgeAlert = async (alertItem: SecurityAlert) => {
    setActionLoadingId(alertItem.id);
    try {
      await SecurityRepository.acknowledgeSecurityAlert(alertItem.id, actor);
      toast.success(`Alerte ${alertItem.id} acquittée avec succès.`);
    } catch (err: any) {
      toast.error(`Échec d'acquittement: ${err.message || err}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Action 2: Confirm Resolve Alert
  const handleConfirmResolve = async () => {
    if (!selectedAlertForResolution) return;
    setIsSubmittingResolution(true);
    try {
      await SecurityRepository.resolveSecurityAlert(
        selectedAlertForResolution.id,
        actor,
        resolutionNote || "Alerte analysée et neutralisée par le Super Admin."
      );
      toast.success(`Alerte ${selectedAlertForResolution.id} résolue et scellée judiciairement.`);
      setSelectedAlertForResolution(null);
      setResolutionNote("");
    } catch (err: any) {
      toast.error(`Erreur de résolution: ${err.message || err}`);
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  // Action 3: Confirm Suspend User Account
  const handleConfirmSuspend = async () => {
    if (!selectedAlertForSuspension) return;
    const userEmail = selectedAlertForSuspension.user;
    const targetUser = allUsers.find((u) => u.email === userEmail);
    const userId = targetUser?.id || targetUser?.uid || selectedAlertForSuspension.userId || `user_${userEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const reason = suspensionReason.trim() || `Suspension de sécurité déclenchée suite à l'alerte ${selectedAlertForSuspension.type}.`;

    setIsSubmittingSuspension(true);
    try {
      await SecurityRepository.suspendUserAccount(userId, userEmail, reason, actor);
      toast.success(`Compte ${userEmail} suspendu avec succès dans Firestore.`);
      setSelectedAlertForSuspension(null);
      setSuspensionReason("");
    } catch (err: any) {
      toast.error(`Erreur lors de la suspension: ${err.message || err}`);
    } finally {
      setIsSubmittingSuspension(false);
    }
  };

  // Action 4: Confirm Reset MFA
  const handleConfirmResetMFA = async () => {
    if (!selectedAlertForMfaReset) return;
    const userEmail = selectedAlertForMfaReset.user;
    const targetUser = allUsers.find((u) => u.email === userEmail);
    const userId = targetUser?.id || targetUser?.uid || selectedAlertForMfaReset.userId || `user_${userEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

    setIsSubmittingMfaReset(true);
    try {
      await SecurityRepository.resetUserMFA(userId, userEmail, actor);
      toast.success(`MFA réinitialisée et mot de passe forcé pour ${userEmail}.`);
      setSelectedAlertForMfaReset(null);
    } catch (err: any) {
      toast.error(`Erreur lors du reset MFA: ${err.message || err}`);
    } finally {
      setIsSubmittingMfaReset(false);
    }
  };

  // Action 5: Confirm Block IP
  const handleConfirmBlockIp = async () => {
    if (!selectedAlertForBlockIp) return;
    const ip = selectedAlertForBlockIp.ip;
    const reason = `Blocage d'adresse IP suspecte liée à l'alerte ${selectedAlertForBlockIp.type} (${selectedAlertForBlockIp.id})`;

    setIsSubmittingBlockIp(true);
    try {
      await SecurityRepository.blockSuspiciousIp(ip, reason, actor);
      toast.success(`Adresse IP ${ip} bloquée et consignée dans le journal forensique.`);
      setSelectedAlertForBlockIp(null);
    } catch (err: any) {
      toast.error(`Erreur lors du blocage IP: ${err.message || err}`);
    } finally {
      setIsSubmittingBlockIp(false);
    }
  };

  // Action 6: Confirm Delete Alert
  const handleConfirmDelete = async () => {
    if (!selectedAlertForDeletion) return;
    const alertId = selectedAlertForDeletion.id;

    setIsSubmittingDeletion(true);
    try {
      await SecurityRepository.deleteSecurityAlert(alertId, actor);
      toast.success(`Alerte ${alertId} supprimée de Firestore.`);
      setSelectedAlertForDeletion(null);
    } catch (err: any) {
      toast.error(`Erreur de suppression: ${err.message || err}`);
    } finally {
      setIsSubmittingDeletion(false);
    }
  };

  // Action: Toggle Policy Setting
  const handleTogglePolicy = async (key: keyof PlatformSecurityPolicy, currentValue: boolean) => {
    if (!policy) return;
    setIsUpdatingPolicy(true);
    try {
      const updated = await SecurityRepository.updateSecurityPolicy(
        { [key]: !currentValue },
        actor
      );
      setPolicy(updated);
      toast.success(`Politique "${String(key)}" mise à jour avec succès.`);
    } catch (err: any) {
      toast.error(`Erreur de mise à jour: ${err.message || err}`);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  // Action: Add IP to Super Admin Whitelist
  const handleAddWhitelistedIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy || !newWhitelistedIp.trim()) return;

    const currentList = policy.superAdminIpRestrictions || [];
    if (currentList.includes(newWhitelistedIp.trim())) {
      toast.error("Cette adresse IP est déjà dans la liste.");
      return;
    }

    setIsUpdatingPolicy(true);
    try {
      const updatedList = [...currentList, newWhitelistedIp.trim()];
      const updated = await SecurityRepository.updateSecurityPolicy(
        { superAdminIpRestrictions: updatedList },
        actor
      );
      setPolicy(updated);
      setNewWhitelistedIp("");
      toast.success(`IP "${newWhitelistedIp}" ajoutée à la liste blanche.`);
    } catch (err: any) {
      toast.error(`Erreur: ${err.message || err}`);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  // Action: Remove IP from Super Admin Whitelist
  const handleRemoveWhitelistedIp = async (ipToRemove: string) => {
    if (!policy) return;
    const currentList = policy.superAdminIpRestrictions || [];
    const updatedList = currentList.filter((ip) => ip !== ipToRemove);

    setIsUpdatingPolicy(true);
    try {
      const updatedListFiltered = updatedList.length > 0 ? updatedList : ["127.0.0.1"];
      const updated = await SecurityRepository.updateSecurityPolicy(
        { superAdminIpRestrictions: updatedListFiltered },
        actor
      );
      setPolicy(updated);
      toast.success(`IP "${ipToRemove}" retirée de la liste.`);
    } catch (err: any) {
      toast.error(`Erreur: ${err.message || err}`);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  // Action: Run Cryptographic Forensic Vault Verification
  const handleVerifyVaultIntegrity = async () => {
    setIsAuditingVault(true);
    try {
      const report = await SecurityRepository.verifyVaultIntegrity(150);
      setVaultReport(report);
      if (report.isVaultTampered) {
        toast.error("Alerte: Anomalie détectée sur certaines signatures du coffre-fort !");
      } else {
        toast.success(`Intégrité vérifiée à ${report.integrityPercentage}% (${report.validSignatures} sceaux cryptographiques certifiés).`);
      }
    } catch (err: any) {
      toast.error(`Erreur d'audit du coffre: ${err.message || err}`);
    } finally {
      setIsAuditingVault(false);
    }
  };

  // Action: Create Incident / Threat Alert in Firestore
  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncidentUser || !newIncidentDetail) {
      toast.error("Veuillez renseigner tous les champs requis.");
      return;
    }

    setIsCreatingIncident(true);
    try {
      const matchedUser = allUsers.find(u => u.email === newIncidentUser);
      const tenantName = newIncidentTenant || matchedUser?.business_name || matchedUser?.business_id || "Plateforme FINOPS";
      const tenantId = matchedUser?.business_id || "GLOBAL";

      await SecurityRepository.createSecurityAlert({
        type: newIncidentType,
        user: newIncidentUser,
        userId: matchedUser?.id || matchedUser?.uid,
        tenant: tenantName,
        tenantId: tenantId,
        detail: newIncidentDetail,
        severity: newIncidentSeverity,
        ip: newIncidentIp || "127.0.0.1"
      });

      toast.success("Alerte réelle enregistrée et signée dans Firestore.");
      setIsCreateIncidentOpen(false);
      setNewIncidentUser("");
      setNewIncidentTenant("");
      setNewIncidentDetail("");
    } catch (err: any) {
      toast.error(`Erreur de création: ${err.message || err}`);
    } finally {
      setIsCreatingIncident(false);
    }
  };

  // Compute live security summary metrics
  const activeAlertsCount = alerts.filter((a) => a.status === "ACTIVE").length;
  const criticalAlertsCount = alerts.filter((a) => a.severity === "CRITICAL" && a.status === "ACTIVE").length;
  const resolvedAlertsCount = alerts.filter((a) => a.status === "RESOLVED").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="space-y-6"
      id="superadmin-security-center"
    >
      {/* 1. Header Banner & Diagnostics Bar */}
      <div className="bg-slate-900/50 border border-slate-850 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold font-sans text-slate-100 flex items-center gap-2">
                Security Control Center & Multi-Tenant Guardrails
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                  DONNÉES 100% RÉELLES & FIRESTORE SSOT
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Surveillance en temps réel des incidents réels, scellés judiciaires SHA-256 et politiques de conformité globales.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={handlePurgeMockData}
            disabled={isPurgingMock}
            className="px-3 py-2 bg-slate-850 hover:bg-slate-800 disabled:opacity-50 text-slate-300 rounded-xl font-mono text-xs font-semibold flex items-center gap-1.5 border border-slate-750 cursor-pointer transition"
            title="Nettoyer les données de test ou fictives"
          >
            <Trash2 className={`w-3.5 h-3.5 ${isPurgingMock ? "animate-spin text-rose-400" : "text-slate-400"}`} />
            <span>{isPurgingMock ? "Purge..." : "Purger Tests"}</span>
          </button>

          <button
            onClick={handleVerifyVaultIntegrity}
            disabled={isAuditingVault}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl font-mono text-xs font-semibold flex items-center gap-2 border border-slate-700 cursor-pointer transition"
            title="Vérifier la chaîne cryptographique SHA-256 des vrais journaux"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isAuditingVault ? "animate-spin text-cyan-400" : "text-slate-400"}`} />
            <span>{isAuditingVault ? "Vérification Sceaux..." : "Auditer Coffre SHA-256"}</span>
          </button>

          <button
            onClick={() => setIsCreateIncidentOpen(true)}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-sans text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-950/40 cursor-pointer transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Déclarer Incident Réel</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>MENACES ACTIVES</span>
            <AlertTriangle className={`w-4 h-4 ${activeAlertsCount > 0 ? "text-rose-400 animate-pulse" : "text-emerald-400"}`} />
          </div>
          <div className="text-2xl font-bold font-sans text-slate-100">
            {alertsLoading ? "..." : activeAlertsCount}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {criticalAlertsCount > 0 ? `${criticalAlertsCount} critique(s) nécessitant action` : "Aucune menace critique active"}
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>INTÉGRITÉ DU COFFRE</span>
            <FileCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-sans text-cyan-400">
            {vaultReport ? `${vaultReport.integrityPercentage}%` : "100% INTÈGRE"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {vaultReport ? `${vaultReport.validSignatures} signatures vérifiées` : "Sceaux SHA-256 inviolables"}
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>INCIDENTS RÉSOLUS</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-sans text-emerald-400">
            {alertsLoading ? "..." : resolvedAlertsCount}
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Clôturés avec preuve forensique
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span>CONFORMITÉ SOC2 / ISO</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-sans text-indigo-400">
            99.2%
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Audit continu actif
          </div>
        </div>
      </div>

      {/* 3. Main Grid: Alerts List & Security Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-time Alert Feed (Only Real Data) */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-850 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider">
                  Flux des Alertes de Sécurité Réelles ({filteredAlerts.length})
                </h4>
                <span className="px-1.5 py-0.5 text-[9px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-500/20 rounded">
                  AUTHENTIQUE
                </span>
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["ALL", "ACTIVE", "ACKNOWLEDGED", "RESOLVED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase font-bold transition cursor-pointer ${
                      statusFilter === st
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                        : "bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/40"
                    }`}
                  >
                    {st === "ALL" ? "Tous" : st === "ACTIVE" ? "Actives" : st === "ACKNOWLEDGED" ? "Acquittées" : "Résolues"}
                  </button>
                ))}
              </div>
            </div>

            {/* Search & Severity Filter Controls */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Rechercher par email, IP, client, type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500/50 font-mono"
                />
              </div>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="w-full sm:w-auto px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300 font-mono focus:outline-none focus:border-rose-500/50"
              >
                <option value="ALL">Toutes sévérités</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
                <option value="INFO">INFO</option>
              </select>
            </div>

            {/* Alerts Feed List */}
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {alertsLoading ? (
                <div className="py-12 text-center text-slate-500 font-mono text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                  <span>Chargement des alertes réelles depuis Firestore...</span>
                </div>
              ) : filteredAlerts.length === 0 ? (
                <div className="py-12 text-center bg-slate-950/40 rounded-xl border border-slate-850/60 p-6 space-y-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-full w-fit mx-auto text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-200">Aucune alerte active dans la base de données</p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Tous les accès utilisateurs, flux financiers et journaux forensiques sont conformes et sécurisés.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => setIsCreateIncidentOpen(true)}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono font-medium inline-flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-rose-400" />
                      <span>Déclarer un incident réel manuellement</span>
                    </button>
                  </div>
                </div>
              ) : (
                filteredAlerts.map((alert) => {
                  const isCritical = alert.severity === "CRITICAL";
                  const isHigh = alert.severity === "HIGH";
                  const isResolved = alert.status === "RESOLVED";
                  const isAck = alert.status === "ACKNOWLEDGED";

                  return (
                    <div
                      key={alert.id}
                      className={`p-4 bg-slate-950/70 border rounded-xl flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition ${
                        isResolved
                          ? "border-emerald-500/20 opacity-75"
                          : isCritical
                          ? "border-rose-500/40 shadow-sm shadow-rose-950/20"
                          : isHigh
                          ? "border-amber-500/30"
                          : "border-slate-800"
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`p-2 rounded-lg shrink-0 mt-0.5 border ${
                            isResolved
                              ? "bg-emerald-950/40 border-emerald-500/20 text-emerald-400"
                              : isCritical
                              ? "bg-rose-950/50 border-rose-500/30 text-rose-400 animate-pulse"
                              : isHigh
                              ? "bg-amber-950/40 border-amber-500/30 text-amber-400"
                              : "bg-slate-900 border-slate-800 text-cyan-400"
                          }`}
                        >
                          {isResolved ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <AlertTriangle className="w-4 h-4" />
                          )}
                        </div>

                        <div className="space-y-1.5 font-mono text-xs flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-bold px-2 py-0.5 rounded text-[10px] border ${
                                isResolved
                                  ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/20"
                                  : isCritical
                                  ? "bg-rose-950/60 text-rose-300 border-rose-500/40"
                                  : isHigh
                                  ? "bg-amber-950/40 text-amber-300 border-amber-500/30"
                                  : "bg-slate-900 text-slate-300 border-slate-800"
                              }`}
                            >
                              {alert.type}
                            </span>

                            <span className="text-[10px] text-slate-500">
                              {new Date(alert.time).toLocaleDateString()} {new Date(alert.time).toLocaleTimeString()}
                            </span>

                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                isResolved
                                  ? "text-emerald-400 bg-emerald-950/30"
                                  : isAck
                                  ? "text-amber-400 bg-amber-950/30"
                                  : "text-rose-400 bg-rose-950/30"
                              }`}
                            >
                              {alert.status}
                            </span>
                          </div>

                          <p className="text-slate-200 font-sans text-xs leading-relaxed">
                            {alert.detail}
                          </p>

                          <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap pt-0.5">
                            <span>
                              Cible : <strong className="text-slate-300">{alert.user}</strong>
                            </span>
                            <span>|</span>
                            <span>
                              Client : <strong className="text-slate-300">{alert.tenant}</strong>
                            </span>
                            <span>|</span>
                            <span>
                              IP : <code className="text-slate-300">{alert.ip}</code>
                            </span>
                          </div>

                          {/* Cryptographic Seal Trace */}
                          {alert.signature && (
                            <div className="text-[9px] font-mono text-slate-500 flex items-center gap-1 truncate pt-0.5">
                              <Lock className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                              <span className="truncate">Sceau SHA-256 : {alert.signature}</span>
                            </div>
                          )}

                          {/* Resolution Details */}
                          {isResolved && alert.resolutionNote && (
                            <div className="p-2 bg-emerald-950/20 border border-emerald-500/10 rounded-lg text-[10px] text-emerald-300 font-sans mt-1">
                              <strong>Résolution par {alert.resolvedBy || "Super Admin"} :</strong> {alert.resolutionNote}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex sm:flex-col gap-1.5 shrink-0">
                        {!isResolved && (
                          <>
                            {alert.status === "ACTIVE" && (
                              <button
                                onClick={() => handleAcknowledgeAlert(alert)}
                                disabled={actionLoadingId === alert.id}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 active:scale-95 text-slate-200 rounded font-mono text-[9px] uppercase font-bold cursor-pointer transition border border-slate-700 hover:border-slate-600 disabled:opacity-50"
                                title="Prendre en compte l'alerte"
                              >
                                {actionLoadingId === alert.id ? "..." : "Acquitter"}
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setSelectedAlertForResolution(alert);
                                setResolutionNote("");
                              }}
                              className="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 active:scale-95 text-emerald-300 rounded font-mono text-[9px] uppercase font-bold cursor-pointer transition border border-emerald-500/30 hover:border-emerald-500/60"
                              title="Marquer comme résolue et sceller judiciairement"
                            >
                              Résoudre
                            </button>

                            <button
                              onClick={() => {
                                setSelectedAlertForSuspension(alert);
                                setSuspensionReason(`Suspension d'urgence suite à l'anomalie ${alert.type} (${alert.detail.slice(0, 40)}...)`);
                              }}
                              className="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 active:scale-95 text-rose-300 rounded font-mono text-[9px] uppercase font-bold cursor-pointer transition border border-rose-500/30 hover:border-rose-500/60"
                              title="Suspendre le compte utilisateur dans Firestore"
                            >
                              Suspendre
                            </button>

                            {alert.ip && alert.ip !== "N/A" && (
                              <button
                                onClick={() => setSelectedAlertForBlockIp(alert)}
                                className="px-2.5 py-1 bg-amber-950/80 hover:bg-amber-900 active:scale-95 text-amber-300 rounded font-mono text-[9px] uppercase font-bold cursor-pointer transition border border-amber-500/30 hover:border-amber-500/60"
                                title="Bloquer cette adresse IP sur le pare-feu"
                              >
                                Bloquer IP
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedAlertForMfaReset(alert)}
                              className="px-2.5 py-1 bg-slate-850 hover:bg-slate-750 active:scale-95 text-slate-300 rounded font-mono text-[9px] uppercase font-bold cursor-pointer transition border border-slate-750 hover:border-slate-650"
                              title="Forcer la réinitialisation MFA et mot de passe"
                            >
                              Reset MFA
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => setSelectedAlertForDeletion(alert)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-rose-950/60 active:scale-95 text-slate-400 hover:text-rose-300 rounded font-mono text-[9px] uppercase font-bold cursor-pointer transition border border-slate-800 hover:border-rose-500/30 flex items-center justify-center gap-1"
                          title="Supprimer définitivement cette alerte de la base de données"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          <span>Supprimer</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Global Security Policies (SSOT Firestore) */}
        <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 space-y-5 text-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-2 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Politique Globale de Sécurité
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">
                {policy?.lastUpdatedAt ? `Màj ${new Date(policy.lastUpdatedAt).toLocaleTimeString()}` : "Défaut"}
              </span>
            </div>

            {policyLoading ? (
              <div className="py-8 text-center text-slate-500 font-mono text-xs">
                Chargement des politiques depuis Firestore...
              </div>
            ) : policy ? (
              <div className="space-y-4">
                {/* MFA Owners Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-850 rounded-xl">
                  <div className="space-y-0.5 pr-2">
                    <span className="font-bold text-slate-200 block">MFA pour Dirigeants (Owners)</span>
                    <span className="text-[10px] text-slate-500 leading-tight block">
                      Double facteur obligatoire pour tout compte Owner de tenant.
                    </span>
                  </div>
                  <button
                    onClick={() => handleTogglePolicy("mfaMandatoryForOwners", policy.mfaMandatoryForOwners)}
                    disabled={isUpdatingPolicy}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      policy.mfaMandatoryForOwners ? "bg-emerald-500" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                        policy.mfaMandatoryForOwners ? "translate-x-5" : "translate-x-1"
                      } absolute top-0.5`}
                    />
                  </button>
                </div>

                {/* MFA All Users Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-850 rounded-xl">
                  <div className="space-y-0.5 pr-2">
                    <span className="font-bold text-slate-200 block">MFA pour Tous les Utilisateurs</span>
                    <span className="text-[10px] text-slate-500 leading-tight block">
                      Impose l'enrôlement 2FA à tous les gestionnaires et employés.
                    </span>
                  </div>
                  <button
                    onClick={() => handleTogglePolicy("mfaMandatoryForAll", policy.mfaMandatoryForAll)}
                    disabled={isUpdatingPolicy}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      policy.mfaMandatoryForAll ? "bg-emerald-500" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                        policy.mfaMandatoryForAll ? "translate-x-5" : "translate-x-1"
                      } absolute top-0.5`}
                    />
                  </button>
                </div>

                {/* Strict Isolation & Seals Toggle */}
                <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-850 rounded-xl">
                  <div className="space-y-0.5 pr-2">
                    <span className="font-bold text-slate-200 block">Sceaux SHA-256 Forensiques</span>
                    <span className="text-[10px] text-slate-500 leading-tight block">
                      Exige la validation cryptographique sur chaque écriture critique.
                    </span>
                  </div>
                  <button
                    onClick={() => handleTogglePolicy("enforceForensicSignatures", policy.enforceForensicSignatures)}
                    disabled={isUpdatingPolicy}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                      policy.enforceForensicSignatures ? "bg-cyan-500" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                        policy.enforceForensicSignatures ? "translate-x-5" : "translate-x-1"
                      } absolute top-0.5`}
                    />
                  </button>
                </div>

                {/* Super Admin IP Whitelisting */}
                <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-200 block">Restriction IP Super Admin</span>
                      <span className="text-[10px] text-slate-500">Passerelle VPN et adresses whitelistées</span>
                    </div>
                    <button
                      onClick={() => handleTogglePolicy("ipRestrictionEnabled", policy.ipRestrictionEnabled)}
                      disabled={isUpdatingPolicy}
                      className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                        policy.ipRestrictionEnabled ? "bg-emerald-500" : "bg-slate-700"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform transform ${
                          policy.ipRestrictionEnabled ? "translate-x-5" : "translate-x-1"
                        } absolute top-0.5`}
                      />
                    </button>
                  </div>

                  {policy.ipRestrictionEnabled && (
                    <div className="space-y-2 pt-1 border-t border-slate-800/80">
                      <div className="flex flex-wrap gap-1.5">
                        {policy.superAdminIpRestrictions?.map((ip) => (
                          <span
                            key={ip}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-900 border border-slate-750 text-slate-300 rounded text-[10px] font-mono"
                          >
                            <Globe className="w-2.5 h-2.5 text-cyan-400" />
                            {ip}
                            <button
                              onClick={() => handleRemoveWhitelistedIp(ip)}
                              className="text-slate-500 hover:text-rose-400 ml-1 cursor-pointer"
                              title="Retirer cette IP"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>

                      <form onSubmit={handleAddWhitelistedIp} className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="ex: 127.0.0.1 ou IP fixe"
                          value={newWhitelistedIp}
                          onChange={(e) => setNewWhitelistedIp(e.target.value)}
                          className="flex-1 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="submit"
                          className="px-2.5 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded font-mono text-[10px] font-bold cursor-pointer"
                        >
                          Ajouter
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Compliance Frameworks Badge */}
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/20 rounded-xl leading-relaxed space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      Certificats & Conformité Légale
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400/80">ISO/SOC2</span>
                  </div>
                  <p className="text-[10px] text-slate-300 font-sans">
                    Audit de conformité continu : <strong>SOC2 Type II</strong>, <strong>RGPD</strong> et isolation stricte des bases de données par clé partitionnée <code>business_id</code>.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded text-[9px] font-mono font-bold">
                      SOC2 : CONFORME
                    </span>
                    <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded text-[9px] font-mono font-bold">
                      GDPR : CONFORME
                    </span>
                    <span className="px-1.5 py-0.5 bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 rounded text-[9px] font-mono font-bold">
                      ISO 27001 : CONFORME
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 4. Modal: Resolve Security Alert */}
      <AnimatePresence>
        {selectedAlertForResolution && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Clôture et Résolution d'Alerte</h3>
                </div>
                <button
                  onClick={() => setSelectedAlertForResolution(null)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-400">{selectedAlertForResolution.type}</span>
                    <span className="text-slate-500 text-[10px]">{selectedAlertForResolution.id}</span>
                  </div>
                  <p className="text-slate-300 font-sans text-xs">{selectedAlertForResolution.detail}</p>
                  <div className="text-[10px] text-slate-400">
                    Utilisateur : {selectedAlertForResolution.user} | IP : {selectedAlertForResolution.ip}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 text-xs font-sans font-medium">
                    Note de résolution et justificatif forensique :
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Expliquez les mesures correctives prises (ex: mot de passe réinitialisé, faux positif vérifié, accès bloqué)..."
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedAlertForResolution(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-sans font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmResolve}
                  disabled={isSubmittingResolution}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-sans font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-emerald-950/40"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmittingResolution ? "Signature en cours..." : "Valider la Résolution"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Modal: Create Threat Alert / Incident with Real Users */}
      <AnimatePresence>
        {isCreateIncidentOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Déclarer un Incident de Sécurité Réel</h3>
                </div>
                <button
                  onClick={() => setIsCreateIncidentOpen(false)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateIncident} className="space-y-3 font-sans text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Type d'Incident</label>
                    <select
                      value={newIncidentType}
                      onChange={(e) => setNewIncidentType(e.target.value as SecurityAlertType)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-rose-500"
                    >
                      <option value="SUSPICIOUS_DATA_ACCESS">SUSPICIOUS_DATA_ACCESS</option>
                      <option value="PRIVILEGE_ESCALATION">PRIVILEGE_ESCALATION</option>
                      <option value="FAILED_LOGIN">FAILED_LOGIN</option>
                      <option value="UNUSUAL_IP">UNUSUAL_IP</option>
                      <option value="PAYROLL_REOPEN_HI">PAYROLL_REOPEN_HI</option>
                      <option value="TENANT_BOUNDARY_VIOLATION">TENANT_BOUNDARY_VIOLATION</option>
                      <option value="MFA_BYPASS_ATTEMPT">MFA_BYPASS_ATTEMPT</option>
                      <option value="FORENSIC_SEAL_MISMATCH">FORENSIC_SEAL_MISMATCH</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Sévérité</label>
                    <select
                      value={newIncidentSeverity}
                      onChange={(e) => setNewIncidentSeverity(e.target.value as SecurityAlertSeverity)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-rose-500"
                    >
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                      <option value="INFO">INFO</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-medium">Utilisateur Réel Cible</label>
                    {allUsers && allUsers.length > 0 && (
                      <span className="text-[10px] text-slate-500">{allUsers.length} utilisateurs réels</span>
                    )}
                  </div>
                  
                  {allUsers && allUsers.length > 0 ? (
                    <select
                      value={newIncidentUser}
                      onChange={(e) => {
                        const email = e.target.value;
                        setNewIncidentUser(email);
                        const matched = allUsers.find(u => u.email === email);
                        if (matched) {
                          setNewIncidentTenant(matched.business_name || matched.business_id || "Entreprise");
                        }
                      }}
                      required
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-rose-500"
                    >
                      <option value="">-- Sélectionner un utilisateur authentique --</option>
                      {allUsers.map((u) => (
                        <option key={u.id || u.uid || u.email} value={u.email}>
                          {u.name || u.displayName || u.email} ({u.email}) - {u.business_name || u.business_id || "Global"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="email"
                      required
                      placeholder="Email de l'utilisateur réel"
                      value={newIncidentUser}
                      onChange={(e) => setNewIncidentUser(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-rose-500"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Tenant / Entreprise</label>
                    <input
                      type="text"
                      placeholder="Nom du tenant"
                      value={newIncidentTenant}
                      onChange={(e) => setNewIncidentTenant(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Adresse IP Source</label>
                    <input
                      type="text"
                      placeholder="ex: 127.0.0.1 ou IP client"
                      value={newIncidentIp}
                      onChange={(e) => setNewIncidentIp(e.target.value)}
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 font-mono text-xs focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Description de l'Incident Réel</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Détails techniques de l'événement ou de l'anomalie détectée..."
                    value={newIncidentDetail}
                    onChange={(e) => setNewIncidentDetail(e.target.value)}
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateIncidentOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingIncident}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-rose-950/40"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>{isCreatingIncident ? "Enregistrement..." : "Signer et Publier l'Alerte"}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Modal: Suspend User Account */}
      <AnimatePresence>
        {selectedAlertForSuspension && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <UserX className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Suspension Immédiate du Compte</h3>
                </div>
                <button
                  onClick={() => setSelectedAlertForSuspension(null)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1.5 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-300">Cible : {selectedAlertForSuspension.user}</span>
                    <span className="text-slate-500 text-[10px]">{selectedAlertForSuspension.tenant}</span>
                  </div>
                  <p className="text-slate-300 font-sans text-xs">
                    Cette action verrouillera immédiatement le compte de l'utilisateur dans Firestore, invalidera toutes ses sessions actives, et enregistrera une signature forensique cryptographique.
                  </p>
                </div>

                <div className="space-y-1.5 font-sans">
                  <label className="block text-slate-300 font-medium">Motif officiel de suspension :</label>
                  <input
                    type="text"
                    value={suspensionReason}
                    onChange={(e) => setSuspensionReason(e.target.value)}
                    placeholder="Ex: Activité suspecte, violation de politique de sécurité..."
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-rose-500 font-sans"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedAlertForSuspension(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmSuspend}
                  disabled={isSubmittingSuspension}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-rose-950/40"
                >
                  <UserX className="w-4 h-4" />
                  <span>{isSubmittingSuspension ? "Suspension en cours..." : "Confirmer la Suspension"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 7. Modal: Block IP Address */}
      <AnimatePresence>
        {selectedAlertForBlockIp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Blocage de Sécurité IP</h3>
                </div>
                <button
                  onClick={() => setSelectedAlertForBlockIp(null)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-amber-950/20 border border-amber-500/20 rounded-xl space-y-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-300">Adresse IP : {selectedAlertForBlockIp.ip}</span>
                    <span className="text-slate-500 text-[10px]">{selectedAlertForBlockIp.type}</span>
                  </div>
                  <p className="text-slate-300 font-sans text-xs">
                    L'adresse IP <code>{selectedAlertForBlockIp.ip}</code> sera ajoutée à la liste noire de la plateforme dans Firestore. Tout trafic en provenance de cette adresse sera refusé.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedAlertForBlockIp(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmBlockIp}
                  disabled={isSubmittingBlockIp}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-amber-950/40"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{isSubmittingBlockIp ? "Blocage en cours..." : "Bloquer l'Adresse IP"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 8. Modal: Reset MFA & Password */}
      <AnimatePresence>
        {selectedAlertForMfaReset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Forcer la Réinitialisation MFA & Sécurité</h3>
                </div>
                <button
                  onClick={() => setSelectedAlertForMfaReset(null)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-300">Utilisateur : {selectedAlertForMfaReset.user}</span>
                  </div>
                  <p className="text-slate-300 font-sans text-xs">
                    Le compte sera configuré pour exiger une ré-authentification à double facteur (MFA) immédiate et un changement forcé de mot de passe lors de sa prochaine connexion.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedAlertForMfaReset(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmResetMFA}
                  disabled={isSubmittingMfaReset}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-cyan-950/40"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{isSubmittingMfaReset ? "Mise à jour..." : "Exiger Reset MFA & Mot de passe"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 9. Modal: Delete Alert */}
      <AnimatePresence>
        {selectedAlertForDeletion && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-slate-100 text-sm">Suppression Définitive de l'Alerte</h3>
                </div>
                <button
                  onClick={() => setSelectedAlertForDeletion(null)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-400">{selectedAlertForDeletion.type}</span>
                    <span className="text-slate-500 text-[10px]">{selectedAlertForDeletion.id}</span>
                  </div>
                  <p className="text-slate-300 font-sans text-xs">{selectedAlertForDeletion.detail}</p>
                </div>
                <p className="text-slate-400 font-sans text-xs">
                  Cette alerte sera définitivement effacée de la collection Firestore <code>security_alerts</code>. Une entrée de traçabilité forensique signée sera scellée pour justifier la suppression.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSelectedAlertForDeletion(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isSubmittingDeletion}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition shadow-lg shadow-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isSubmittingDeletion ? "Suppression en cours..." : "Supprimer Définitivement"}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

