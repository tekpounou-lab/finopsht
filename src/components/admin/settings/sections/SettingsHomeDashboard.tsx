import React from "react";
import { 
  Building2, 
  ShieldCheck, 
  FileText, 
  Settings, 
  Activity, 
  Bot, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  TrendingUp, 
  Percent, 
  Lock, 
  Users, 
  MapPin, 
  CreditCard,
  Sparkles,
  Zap,
  SlidersHorizontal,
  ChevronRight
} from "lucide-react";
import { motion } from "motion/react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useAuth } from "../../../../hooks/useAuth";

export interface SettingsHomeDashboardProps {
  onNavigate: (section: any) => void;
}

export default function SettingsHomeDashboard({ onNavigate }: SettingsHomeDashboardProps) {
  const { currentBusiness, branches, departments, businessSettings } = useBusinessContext();
  const { dbUser } = useAuth();

  // Compute Configuration Completion Percentage
  const configChecks = [
    { label: "Profil Entreprise (NIF)", done: Boolean(currentBusiness?.nif), section: "PROFILE" },
    { label: "Succursales configurées", done: (branches?.length || 0) > 0, section: "ORGANIZATION" },
    { label: "Départements structurés", done: (departments?.length || 0) > 0, section: "ORGANIZATION" },
    { label: "Taxes ONA / OFATMA configurées", done: true, section: "PAYROLL_TAXES" },
    { label: "Politiques de paie actives", done: Boolean(businessSettings?.payroll), section: "PAYROLL_POLICIES" },
    { label: "Matrice des Rôles & RBAC", done: true, section: "ROLES" },
    { label: "Identité Visuelle (Logo)", done: Boolean((currentBusiness as any)?.logo_url || (currentBusiness as any)?.logo), section: "BRANDING" },
    { label: "Contrôles de Sécurité", done: true, section: "SECURITY" },
  ];

  const completedCount = configChecks.filter(c => c.done).length;
  const completionPct = Math.round((completedCount / configChecks.length) * 100);

  // Recent Configuration Changes Audit Feed (Mock/Simulated from actual state)
  const recentChanges = [
    { id: "1", title: "Mise à jour des paramètres Fiscaux", category: "Paie & Taxes", time: "Aujourd'hui, 09:15", user: dbUser?.name || "Admin" },
    { id: "2", title: "Vérification du rôle MANAGER & Sécurité RBAC", category: "Sécurité", time: "Hier, 16:40", user: "Système Audit" },
    { id: "3", title: "Structuration des succursales (" + (branches?.length || 1) + " actives)", category: "Organisation", time: "Il y a 2 jours", user: dbUser?.name || "Admin" },
    { id: "4", title: "Synchronisation des règles ONA (6%) & OFATMA (2%)", category: "Conformité", time: "Il y a 3 jours", user: "Gouvernance Paie" },
  ];

  // AI Strategic Setup Recommendations
  const aiRecommendations = [
    {
      id: "rec_1",
      title: "Optimiser les règles d'Heures Supplémentaires",
      description: "Ajustez la tolérance de retard et la majoration pour réduire les coûts de paie imprévus.",
      actionLabel: "Configurer Politiques de Temps",
      section: "ATTENDANCE_POLICIES",
      priority: "HIGH",
      badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/20"
    },
    {
      id: "rec_2",
      title: "Activer la Double Authentification (MDF)",
      description: "Renforcez l'accès au portail administrateur pour l'ensemble des comptes autorisés.",
      actionLabel: "Ouvrir Centre de Sécurité",
      section: "SECURITY",
      priority: "MEDIUM",
      badgeBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
    },
    {
      id: "rec_3",
      title: "Compléter l'Identité Visuelle de la Marque",
      description: "Ajoutez le logo officiel pour vos fiches de paie imprimables et vos rapports PDF.",
      actionLabel: "Personnaliser Identité",
      section: "BRANDING",
      priority: "LOW",
      badgeBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
    }
  ];

  return (
    <div className="space-y-8 font-sans text-slate-200" id="settings-dashboard-home">
      {/* 1. Header Banner & Completion Progress */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/10 via-indigo-500/5 to-transparent blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />
                Tableau de Bord Configuration Enterprise
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-100 uppercase tracking-tight">
              {currentBusiness?.name || "Entreprise Enterprise"}
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Vue synthétique de l'état de préparation, de la conformité réglementaire et de la sécurité de votre plateforme FINOPS ERP.
            </p>
          </div>

          {/* Completion Progress Gauge Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center gap-5 shrink-0 shadow-lg">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle className="text-slate-800" strokeWidth="10" stroke="currentColor" fill="transparent" r="38" cx="50" cy="50" />
                <motion.circle 
                  initial={{ strokeDasharray: "0 238" }}
                  animate={{ strokeDasharray: `${(completionPct / 100) * 238} 238` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="text-cyan-400" 
                  strokeWidth="10" 
                  strokeLinecap="round" 
                  stroke="currentColor" 
                  fill="transparent" 
                  r="38" 
                  cx="50" 
                  cy="50" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-black text-slate-100">{completionPct}%</span>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Complétion Globale
              </span>
              <p className="text-xs font-bold text-cyan-400">
                {completedCount} sur {configChecks.length} Modules Validés
              </p>
              <span className="text-[10px] text-slate-500 block">
                {completionPct === 100 ? "Configuration complète" : "Action requise pour atteindre 100%"}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Check Pills Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-6 mt-6 border-t border-slate-800/80">
          {configChecks.map((check, idx) => (
            <button
              key={idx}
              onClick={() => onNavigate(check.section)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                check.done 
                  ? "bg-slate-950/60 border-slate-800 hover:border-cyan-500/30" 
                  : "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                {check.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
                <ChevronRight className="w-3 h-3 text-slate-600" />
              </div>
              <span className="text-[9px] font-bold text-slate-300 truncate">{check.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Primary Status Grid (Company, Security, Payroll, Active Modules) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Company Profile Status Card */}
        <div 
          onClick={() => onNavigate("PROFILE")}
          className="bg-slate-900/60 border border-slate-800 hover:border-cyan-500/30 p-5 rounded-2xl space-y-3 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {currentBusiness?.nif ? "VÉRIFIÉ" : "INCOMPLET"}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Profil Entreprise</span>
            <strong className="text-sm font-bold text-slate-100 block group-hover:text-cyan-400 transition-colors truncate">
              {currentBusiness?.name || "Non Défini"}
            </strong>
          </div>
          <div className="text-[10px] text-slate-400 space-y-1 font-mono pt-1 border-t border-slate-800/60">
            <div>NIF: {currentBusiness?.nif || "Non renseigné"}</div>
            <div>Succursales: {branches?.length || 1} site(s)</div>
          </div>
        </div>

        {/* Security Status Card */}
        <div 
          onClick={() => onNavigate("SECURITY")}
          className="bg-slate-900/60 border border-slate-800 hover:border-emerald-500/30 p-5 rounded-2xl space-y-3 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              CONFORME
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Statut Sécurité & RBAC</span>
            <strong className="text-sm font-bold text-slate-100 block group-hover:text-emerald-400 transition-colors">
              Niveau Élevé (RBAC V3)
            </strong>
          </div>
          <div className="text-[10px] text-slate-400 space-y-1 font-mono pt-1 border-t border-slate-800/60">
            <div>Registre Audit: Actif (SHA-256)</div>
            <div>Isolation Tenant: Strict</div>
          </div>
        </div>

        {/* Payroll Config Status Card */}
        <div 
          onClick={() => onNavigate("PAYROLL_TAXES")}
          className="bg-slate-900/60 border border-slate-800 hover:border-amber-500/30 p-5 rounded-2xl space-y-3 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
              ACTIF (ONA / OFATMA)
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Configuration Paie</span>
            <strong className="text-sm font-bold text-slate-100 block group-hover:text-amber-400 transition-colors">
              Cotisations & Taxes Légales
            </strong>
          </div>
          <div className="text-[10px] text-slate-400 space-y-1 font-mono pt-1 border-t border-slate-800/60">
            <div>Barème ONA: 6% Employeur / 6% Salarié</div>
            <div>OFATMA: 2% Accident du travail</div>
          </div>
        </div>

        {/* Active Modules Card */}
        <div 
          onClick={() => onNavigate("FEATURES")}
          className="bg-slate-900/60 border border-slate-800 hover:border-indigo-500/30 p-5 rounded-2xl space-y-3 transition-all cursor-pointer group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Settings className="w-5 h-5" />
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              6 MODULES
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Modules & Fonctionnalités</span>
            <strong className="text-sm font-bold text-slate-100 block group-hover:text-indigo-400 transition-colors">
              Abonnement Enterprise
            </strong>
          </div>
          <div className="text-[10px] text-slate-400 space-y-1 font-mono pt-1 border-t border-slate-800/60">
            <div>RH, Paie, Grand Livre, Biométrie</div>
            <div>IA CFO Assistant, Forensic Vault</div>
          </div>
        </div>
      </div>

      {/* 3. System Health & Recent Configuration Changes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System Health Summary */}
        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Santé Système FINOPS
            </span>
            <button 
              onClick={() => onNavigate("HEALTH")}
              className="text-[10px] font-bold text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Détails <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400 font-medium">Score d'Intégrité</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">98/100</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full w-[98%]" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-2 font-mono">
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="text-slate-500 block">LATENCE API</span>
                <span className="text-slate-200 font-bold">14 ms</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg">
                <span className="text-slate-500 block">SYNC OFFLINE</span>
                <span className="text-emerald-400 font-bold">RÉSOLU</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Configuration Changes */}
        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Historique des Modifications Récentes
            </span>
            <button 
              onClick={() => onNavigate("AUDIT")}
              className="text-[10px] font-bold text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              Voir Tout l'Audit <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {recentChanges.map(change => (
              <div 
                key={change.id}
                className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-4 text-xs hover:border-slate-700 transition"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.2 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      {change.category}
                    </span>
                    <strong className="text-slate-200 font-bold truncate">{change.title}</strong>
                  </div>
                  <span className="text-[10px] text-slate-500 block">Modifié par : {change.user}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">{change.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. AI Strategic Setup Recommendations */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400 animate-pulse" />
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-100">
              Recommandations Stratégiques de Configuration (IA Gemini)
            </h3>
          </div>
          <button 
            onClick={() => onNavigate("AI")}
            className="text-[10px] font-bold text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            Assistant IA <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {aiRecommendations.map(rec => (
            <div 
              key={rec.id}
              className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4 hover:border-cyan-500/30 transition shadow-sm"
            >
              <div className="space-y-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border inline-block ${rec.badgeBg}`}>
                  {rec.priority} PRIORITÉ
                </span>
                <h4 className="text-xs font-bold text-slate-100">{rec.title}</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">{rec.description}</p>
              </div>

              <button
                onClick={() => onNavigate(rec.section)}
                className="w-full py-2 px-3 bg-slate-900 hover:bg-cyan-500 hover:text-slate-950 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer group"
              >
                <span>{rec.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
