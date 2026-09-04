import { LucideIcon } from "lucide-react";
import { 
  BarChart3, 
  Users, 
  Target, 
  Network, 
  CalendarRange, 
  Calendar, 
  Fingerprint, 
  Wallet, 
  BookOpen, 
  FolderOpen, 
  History, 
  Sparkles, 
  Settings, 
  UserCheck,
  Activity,
  Cpu,
  Database,
  Briefcase
} from "lucide-react";

export interface ErpModuleDefinition {
  id: string;
  code: string;
  name: string;
  shortDesc: string;
  fullDesc: string;
  category: "hr" | "finance" | "ops" | "intelligence" | "admin";
  categoryLabel: string;
  icon: LucideIcon;
  color: string;
  defaultRoles: string[];
}

export interface PermissionDefinition {
  id: string;
  label: string;
  desc: string;
  category: "hr" | "finance" | "ops" | "intelligence" | "admin";
}

export interface RolePreset {
  id: string;
  name: string;
  desc: string;
  icon: string;
  enabledModules: string[];
  enabledPermissions: string[];
}

export const ERP_MODULES: ErpModuleDefinition[] = [
  // 1. HR & Organization
  {
    id: "personnel",
    code: "HR_PERSONNEL",
    name: "Directoire du Personnel (RH)",
    shortDesc: "Dossiers salariés, contrats et matricules",
    fullDesc: "Gestion intégrale des profils collaborateurs, fiches techniques, contrats de travail et historique d'embauche.",
    category: "hr",
    categoryLabel: "Ressources Humaines & Organisation",
    icon: Users,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "organization",
    code: "HR_ORGANIZATION",
    name: "Structure d'Entreprise",
    shortDesc: "Succursales, départements et unités",
    fullDesc: "Modélisation hiérarchique des filiales, succursales, départements et centres de coûts de l'organisation.",
    category: "hr",
    categoryLabel: "Ressources Humaines & Organisation",
    icon: Network,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "performance",
    code: "HR_PERFORMANCE",
    name: "Performance & Commissions",
    shortDesc: "Objectifs, paliers et commissions de vente",
    fullDesc: "Moteur de calcul des commissions commerciales, suivi des objectifs et attribution départementale double.",
    category: "hr",
    categoryLabel: "Ressources Humaines & Organisation",
    icon: Target,
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "documents",
    code: "HR_DOCUMENTS",
    name: "Coffre-Fort & Documents RH",
    shortDesc: "Archivage légal et contrats signés",
    fullDesc: "Coffre-fort numérique d'entreprise pour les pièces d'identité, attestations d'emploi, et documents légaux.",
    category: "hr",
    categoryLabel: "Ressources Humaines & Organisation",
    icon: FolderOpen,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "employeespace",
    code: "HR_PORTAL",
    name: "Espace Collaborateur (Self-Service)",
    shortDesc: "Portail personnel, bulletins et pointage",
    fullDesc: "Accès individuel sécurisé pour consultation des fiches de paie, plannings et saisie des demandes de congés.",
    category: "hr",
    categoryLabel: "Ressources Humaines & Organisation",
    icon: UserCheck,
    color: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"]
  },

  // 2. Operations & Time Management
  {
    id: "planning",
    code: "OPS_PLANNING",
    name: "Plannings Opérationnels",
    shortDesc: "Grilles horaires, rotations et shifts",
    fullDesc: "Planification des équipes, gestion des quarts de travail et calendrier opérationnel des départements.",
    category: "ops",
    categoryLabel: "Temps & Opérations",
    icon: CalendarRange,
    color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EMPLOYEE"]
  },
  {
    id: "attendance",
    code: "OPS_ATTENDANCE",
    name: "Badgeuse & Suivi des Temps",
    shortDesc: "Pointage biométrique, retards et présences",
    fullDesc: "Gestion du registre de présence en temps réel, QR Code scanner, pointage sécurisé et détection des retards.",
    category: "ops",
    categoryLabel: "Temps & Opérations",
    icon: Fingerprint,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR"]
  },
  {
    id: "leave",
    code: "OPS_LEAVES",
    name: "Gestion des Congés & Absences",
    shortDesc: "Soldes légaux, demandes et approbations",
    fullDesc: "Workflow de validation des congés payés, congés maladie, absences justifiées et suivi des compteurs.",
    category: "ops",
    categoryLabel: "Temps & Opérations",
    icon: Calendar,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR"]
  },

  // 3. Finance & Payroll
  {
    id: "payroll",
    code: "FIN_PAYROLL",
    name: "Calculateur de Paie V3",
    shortDesc: "Paie brute/nette, ONA, OFATMA et bulletins",
    fullDesc: "Moteur de calcul salarial déterministe conforme aux règles fiscales haïtiennes (ONA 6%, OFATMA 2%, seuils de survie).",
    category: "finance",
    categoryLabel: "Finance, Paie & Comptabilité",
    icon: Wallet,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "ledger",
    code: "FIN_LEDGER",
    name: "Grand Livre & Comptabilité",
    shortDesc: "Écritures comptables, journal et balance",
    fullDesc: "Comptabilité générale en partie double, plan comptable conforme, journal d'écritures et états financiers.",
    category: "finance",
    categoryLabel: "Finance, Paie & Comptabilité",
    icon: BookOpen,
    color: "text-green-400 bg-green-500/10 border-green-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "crm",
    code: "COM_CRM",
    name: "CRM, Devis & Factures",
    shortDesc: "Gestion commerciale, leads, devis et facturation",
    fullDesc: "Cycle de vente complet : prospection, conversion en clients, devis proforma, émission de factures et intégration comptable.",
    category: "finance",
    categoryLabel: "Finance, Paie & Comptabilité",
    icon: Briefcase,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },

  // 4. Intelligence & Forensic Safety
  {
    id: "bi",
    code: "INTEL_BI",
    name: "Analyse Décisionnelle (BI)",
    shortDesc: "KPIs exécutifs, graphiques et métriques",
    fullDesc: "Tableaux de bord d'aide à la décision, analyses de rentabilité, taux de rotation RH et suivi de masse salariale.",
    category: "intelligence",
    categoryLabel: "Intelligence & Audit Forensique",
    icon: BarChart3,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "aicfo",
    code: "INTEL_AICFO",
    name: "Intelligence CFO Assistée",
    shortDesc: "Conseiller financier IA et détection d'écarts",
    fullDesc: "Assistant exécutif IA analysant les tendances de flux de trésorerie, la trésorerie prévisionnelle et les anomalies.",
    category: "intelligence",
    categoryLabel: "Intelligence & Audit Forensique",
    icon: Sparkles,
    color: "text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"]
  },
  {
    id: "forensic",
    code: "SYS_FORENSIC",
    name: "Pistes d'Audit Forensique",
    shortDesc: "Journaux d'événements signés SHA-256",
    fullDesc: "Registre d'audit infalsifiable médico-légal garantissant la traçabilité intégrale multi-tenant. Réservé à la gouvernance Super Admin.",
    category: "admin",
    categoryLabel: "Administration & Sécurité Système",
    icon: History,
    color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    defaultRoles: ["SUPER_ADMIN"]
  },
  {
    id: "health",
    code: "SYS_HEALTH",
    name: "Santé du Système (SRE Metrics)",
    shortDesc: "Télémétrie, intégrité et état des services",
    fullDesc: "Console de supervision globale de l'état des nœuds, latence Firestore, santé des micro-services. Réservé à la gouvernance Super Admin.",
    category: "admin",
    categoryLabel: "Administration & Sécurité Système",
    icon: Activity,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    defaultRoles: ["SUPER_ADMIN"]
  },
  {
    id: "reliability",
    code: "SYS_RELIABILITY",
    name: "Résilience & DLQ (Flux d'Événements)",
    shortDesc: "Gestion de la Dead Letter Queue et rejeu",
    fullDesc: "Surveillance du flux d'événements asynchrones, isolation des messages en échec et politique de rejeu transactionnel. Réservé Super Admin.",
    category: "admin",
    categoryLabel: "Administration & Sécurité Système",
    icon: Cpu,
    color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    defaultRoles: ["SUPER_ADMIN"]
  },
  {
    id: "recovery",
    code: "SYS_RECOVERY",
    name: "Restauration Catastrophe (Disaster Recovery)",
    shortDesc: "Plan de continuité et snapshots système",
    fullDesc: "Gestion des sauvegardes immuables à chaud, restauration d'urgence et tests de basculement de sinistre. Réservé Super Admin.",
    category: "admin",
    categoryLabel: "Administration & Sécurité Système",
    icon: Database,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    defaultRoles: ["SUPER_ADMIN"]
  },

  // 5. Administration & Security
  {
    id: "settings",
    code: "SYS_SETTINGS",
    name: "Administration & Paramètres",
    shortDesc: "Configuration globale, licences et sécurité",
    fullDesc: "Centre d'administration de l'entreprise, gestion des succursales, licences, habilitations et intégrations.",
    category: "admin",
    categoryLabel: "Administration & Sécurité",
    icon: Settings,
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    defaultRoles: ["SUPER_ADMIN", "OWNER", "ADMIN"]
  }
];

export const AVAILABLE_PERMISSIONS: PermissionDefinition[] = [
  { id: "employees.read", label: "Lecture Employés", desc: "Consulter les fiches techniques et matricules", category: "hr" },
  { id: "employees.write", label: "Modification Employés", desc: "Créer, modifier les contrats et informations RH", category: "hr" },
  { id: "attendance.scan", label: "Scanner Présence", desc: "Autoriser l'utilisation du scanner QR Code terrain", category: "ops" },
  { id: "attendance.manage", label: "Gestion des Temps", desc: "Corriger les anomalies, valider les retards", category: "ops" },
  { id: "leaves.approve", label: "Approbation des Congés", desc: "Valider ou rejeter les demandes d'absence", category: "ops" },
  { id: "payroll.run", label: "Calcul de Paie", desc: "Générer les calculs salariaux et brouillons", category: "finance" },
  { id: "payroll.lock", label: "Clôture & Verrouillage Paie", desc: "Verrouiller une période et finaliser les décaissements", category: "finance" },
  { id: "finance.view", label: "Visualisation Comptable", desc: "Consulter le grand livre et les journaux financiers", category: "finance" },
  { id: "finance.write", label: "Écritures Comptables", desc: "Passer des écritures manuelles au journal", category: "finance" },
  { id: "analytics.view", label: "Accès Analytics Exécutif", desc: "Accéder aux indicateurs décisionnels stratégiques", category: "intelligence" },
  { id: "admin.settings", label: "Administration Système", desc: "Gérer l'organisation, les rôles et configurations", category: "admin" }
];

export const STANDARD_ROLE_METADATA: Record<string, { label: string; desc: string; isSystem?: boolean; badgeColor: string }> = {
  "SUPER_ADMIN": {
    label: "Super Administrateur",
    desc: "Contrôle absolu et souverain de toute la plateforme, des infrastructures et des audits multi-entreprises.",
    isSystem: true,
    badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/30"
  },
  "OWNER": {
    label: "Propriétaire / CEO",
    desc: "Contrôle souverain et total de son entreprise (tous les modules, RH, paie, finances et configurations).",
    isSystem: true,
    badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/30"
  },
  "ADMIN": {
    label: "Administrateur Général",
    desc: "Pilotage complet de l'entreprise, des habilitations et des modules métiers.",
    isSystem: true,
    badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
  },
  "MANAGER": {
    label: "Manager Opérationnel",
    desc: "Supervision d'une succursale, gestion du personnel, plannings et validation paie.",
    isSystem: true,
    badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30"
  },
  "SUPERVISOR": {
    label: "Superviseur d'Équipe",
    desc: "Pointage terrain, suivi des shifts, des plannings et validation des présences.",
    isSystem: true,
    badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
  },
  "EMPLOYEE": {
    label: "Collaborateur / Salarié",
    desc: "Accès au portail collaborateur, consultation des fiches de paie et plannings.",
    isSystem: true,
    badgeColor: "bg-slate-500/10 text-slate-400 border-slate-500/30"
  }
};

export const getRoleKey = (role: any): string => {
  if (!role) return "";
  if (typeof role === "string") return role.trim();
  if (typeof role === "object") {
    return (role.name || role.id || role.role || "").toString().trim();
  }
  return String(role);
};

export const getRoleMetadata = (role: any): { label: string; desc: string; isSystem?: boolean; badgeColor: string } => {
  const key = getRoleKey(role);
  if (STANDARD_ROLE_METADATA[key]) {
    return STANDARD_ROLE_METADATA[key];
  }
  return {
    label: key || "Rôle personnalisé",
    desc: typeof role === "object" && role.desc ? role.desc : "Profil de sécurité et habilitations métier",
    isSystem: false,
    badgeColor: "bg-slate-800 text-slate-300 border-slate-700"
  };
};

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: "cfo_preset",
    name: "Directeur Financier & Trésorier",
    desc: "Accès complet aux modules Paie, Grand Livre, Décisionnel BI et Assistant IA CFO",
    icon: "Wallet",
    enabledModules: ["payroll", "ledger", "bi", "aicfo", "documents", "employeespace"],
    enabledPermissions: ["payroll.run", "payroll.lock", "finance.view", "finance.write", "analytics.view"]
  },
  {
    id: "hr_director_preset",
    name: "Directeur des Ressources Humaines",
    desc: "Gestion complète du personnel, paie, congés, structure et coffre-fort documentaire",
    icon: "Users",
    enabledModules: ["personnel", "organization", "performance", "leave", "attendance", "payroll", "documents", "employeespace"],
    enabledPermissions: ["employees.read", "employees.write", "attendance.manage", "leaves.approve", "payroll.run", "payroll.lock"]
  },
  {
    id: "operations_lead_preset",
    name: "Superviseur Opérationnel & Terrain",
    desc: "Gestion des plannings d'équipes, badgeuse de pointage et validation des absences",
    icon: "Fingerprint",
    enabledModules: ["planning", "attendance", "leave", "employeespace"],
    enabledPermissions: ["attendance.scan", "attendance.manage", "leaves.approve"]
  },
  {
    id: "accountant_preset",
    name: "Comptable d'Entreprise",
    desc: "Saisie et consultation du Grand Livre, préparation des clôtures et consultation paie",
    icon: "BookOpen",
    enabledModules: ["ledger", "payroll", "documents", "bi", "employeespace"],
    enabledPermissions: ["finance.view", "finance.write", "payroll.run", "analytics.view"]
  },
  {
    id: "standard_employee_preset",
    name: "Collaborateur Standard",
    desc: "Accès restreint au portail collaborateur, suivi des shifts et demandes de congés",
    icon: "UserCheck",
    enabledModules: ["employeespace", "planning"],
    enabledPermissions: []
  }
];

