import React, { useState } from "react";
import { 
  BookOpen, 
  HelpCircle, 
  Search, 
  ArrowRight, 
  Calculator, 
  Fingerprint, 
  ShieldCheck, 
  Cpu, 
  DollarSign, 
  Calendar, 
  Bot, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  QrCode
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useI18n } from "../i18n";

export default function InstructionConsole() {
  const { language } = useI18n();
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Interactive sandbox states
  const [debitVal, setDebitVal] = useState<number>(15000);
  const [creditVal, setCreditVal] = useState<number>(15000);
  const [grossWageInput, setGrossWageInput] = useState<number>(30000);
  const [empStatus, setEmpStatus] = useState<string>("LEAVE");
  const [hoursPlanned, setHoursPlanned] = useState<number>(10);

  const cnssEmployeeRate = 0.06;
  const cnssEmployerRate = 0.06;
  const cnsEmployeeRate = 0.02;

  const currentLang = (language === 'fr' || language === 'ht' || language === 'en') ? language : 'fr';

  const sections = [
    {
      id: "overview",
      icon: BookOpen,
      title: {
        fr: "Prise en main ERP & Rôles",
        ht: "Kòmansman ERP ak Wòl yo",
        en: "ERP Onboarding & Roles"
      },
      tag: "CORE"
    },
    {
      id: "ledger",
      icon: ShieldCheck,
      title: {
        fr: "Grand Livre & Débits/Crédits",
        ht: "Gran Liv ak Debi/Kredi",
        en: "General Ledger & Double-Entry"
      },
      tag: "FINANCE"
    },
    {
      id: "payroll",
      icon: DollarSign,
      title: {
        fr: "Moteur de Paie & Charges CNSS",
        ht: "Sistèm Peman ak Chaj CNSS",
        en: "Payroll & CNSS Deductions"
      },
      tag: "HAITI LAW"
    },
    {
      id: "planning",
      icon: Calendar,
      title: {
        fr: "Planning & Filtre Conflits",
        ht: "Planifikasyon ak Deteksyon Konfli",
        en: "Scheduling & Collision Engine"
      },
      tag: "OPS"
    },
    {
      id: "attendance",
      icon: Fingerprint,
      title: {
        fr: "Pointage Kiosque & QR Badges",
        ht: "Pwentaj Kiosk ak Badge QR",
        en: "QR Attendance & Badges"
      },
      tag: "HARDWARE"
    },
    {
      id: "resilience",
      icon: Cpu,
      title: {
        fr: "Résilience, DLQ & Forensic",
        ht: "Rezilans, Ke DLQ ak Odit fòrensik",
        en: "Resilience, DLQ & Forensic logs"
      },
      tag: "SYSTEM"
    }
  ];

  const filteredSections = sections.filter(sec => {
    const textToSearch = `${sec.title.fr} ${sec.title.ht} ${sec.title.en} ${sec.tag}`.toLowerCase();
    return textToSearch.includes(searchQuery.toLowerCase());
  });

  const simulatedCnssEmp = Math.round(grossWageInput * cnssEmployeeRate);
  const simulatedCnssPatron = Math.round(grossWageInput * cnssEmployerRate);
  const simulatedCnsEmp = Math.round(grossWageInput * cnsEmployeeRate);
  const netTakeHome = grossWageInput - (simulatedCnssEmp + simulatedCnsEmp);

  const getConflictDiagnosis = () => {
    if (empStatus === "LEAVE") {
      return {
        severity: "CRITICAL",
        message: {
          fr: "CONFLIT CRITIQUE : Cet employé est actuellement en CONGÉ approuvé pour cette période. Affectation impossible.",
          ht: "OLÈY PWOBLEM : Anplwaye sa a nan KONJE nèt kounye a. Ou pa kapab mete li nan plan an.",
          en: "CRITICAL CONFLICT: Employee is currently on approved LEAVE. Shift scheduling blocked."
        },
        code: "ERR_RULE_LEAVE_OVERLAP"
      };
    }
    if (hoursPlanned > 8) {
      return {
        severity: "WARNING",
        message: {
          fr: "AVERTISSEMENT : Durée de poste supérieure aux 8 heures réglementaires. Risque d'Heures Supplémentaires.",
          ht: "AVÈTISMAN : Lè travay sa a depase 8 èdtan legal la. Li pral fè lè siplemantè.",
          en: "WARNING: Shift duration exceeds standard 8-hour shift. May incur Overtime charges."
        },
        code: "WARN_MAX_SHIFT_LIMIT"
      };
    }
    if (empStatus === "DOUBLE") {
      return {
        severity: "CRITICAL",
        message: {
          fr: "CONFLIT CRITIQUE : Double affectation détectée. Risque de collision d'horaires.",
          ht: "OLÈY PWOBLEM : Anplwaye sa a genyen de (2) pòs nan menm jounen an.",
          en: "CRITICAL CONFLICT: Double-scheduling detected. Shift overlap."
        },
        code: "ERR_COLLISION_DETECTED"
      };
    }
    return {
      severity: "SUCCESS",
      message: {
        fr: "CONFORME : Aucune anomalie détectée. Le poste est parfaitement conforme.",
        ht: "KONFÒM : Pa gen okenn pwoblèm ki detekte sou travayè sa a.",
        en: "COMPLIANT: No schedule anomalies detected. Post is ready."
      },
      code: "OK_COMPLIANCE_PASS"
    };
  };

  const currentConflictResult = getConflictDiagnosis();

  const dict = {
    title: {
      fr: "Guide FinOps ERP & Manuel d'Instruction",
      ht: "Gid Enstriksyon FinOps ERP",
      en: "FinOps ERP Manual & Guides"
    },
    subtitle: {
      fr: "Sélectionnez un sujet pour afficher les calculs légaux d'Haïti et les protocoles de résilience du système.",
      ht: "Chwazi yon sijè pou aprann kijan kalkil ak lwa travay an Ayiti mache anndan platfòm ERP a.",
      en: "Select a topic to view Haitian legal formulas, system rules, and database resilience guides."
    },
    search: {
      fr: "Rechercher...",
      ht: "Chache...",
      en: "Search..."
    },
    subjects: {
      fr: "SUJETS DE FORMATION",
      ht: "SIJÈ FÒMASYON",
      en: "TRAINING TOPICS"
    },
    aiAssist: {
      fr: "Assistance IA",
      ht: "Asistan AI",
      en: "AI CFO Copilot"
    },
    aiDesc: {
      fr: "Ouvrez l'Espace AI CFO pour analyser automatiquement l'historique de votre grand livre en temps réel.",
      ht: "Klike sou asistan AI a pou kontwole liv kòb yo epi reponn kesyon ou yo otomatik.",
      en: "Open the AI CFO Assistant tab to analyze ledger integrity and audit logs in real time."
    },
    
    // Overview
    overviewHeader: {
      fr: "Architecture ERP & Permissions Multi-Tenant",
      ht: "Estrikti ERP ak Dwa pou chak Wòl",
      en: "ERP Architecture & Multi-Tenant RBAC Framework"
    },
    matrixTitle: {
      fr: "Matrice de Sécurité des Rôles (RBAC)",
      ht: "Sekirite ak Limit pou chak Worl yo",
      en: "Secure Role Matrix Limits"
    },
    matrixDesc: {
      fr: "Le système filtre l'accès aux données sensibles du locataire selon une échelle hiérarchique de rôles :",
      ht: "Sistèm lan limite aksè done enpòtan yo pou sekirite konpayi an :",
      en: "The ERP enforces tight security matrices to defend tenant database endpoints:"
    },
    roles: {
      owner: {
        fr: "PROP (OWNER) : Accès complet (Comptabilité, Salaires, Forensic audit, Gestion d'Onboarding).",
        ht: "OWNER : Tout dwa nèt (Sekirite, Istorik, Peman, Forex, Onboarding).",
        en: "OWNER: Universal clearance (Ledgers, Payroll, Database recovery, Tenant Onboarding)."
      },
      manager: {
        fr: "GERANT (MANAGER) : Planification d'équipes, validation des fiches de paie, rapports BI.",
        ht: "MANAGER : Planifikasyon orè, fèy peman sikisal, ak gade rapò BI.",
        en: "MANAGER: Team schedules, localized employee rosters, and business intelligence."
      },
      supervisor: {
        fr: "SUP (SUPERVISOR) : Gestion des présences, pointage et validation des fiches collaborateurs.",
        ht: "SUPERVISOR : Kontwole pwentaj, gade lè anplwaye yo bay, ak siyen rapò senp.",
        en: "SUPERVISOR: Timesheets audits, attendance logs verify, and shift rosters review."
      },
      employee: {
        fr: "COLLAB (EMPLOYEE) : Consultation de ses fiches de paie, pointage via Kiosque QR.",
        ht: "EMPLOYEE : Gade pwòp fich pa l, siyen kontra li, epi pwentnte nan kiosk.",
        en: "EMPLOYEE: Self-service access, pay slips view, contract signing, and QR scan."
      }
    },
    guideStepsTitle: {
      fr: "Guide d'Initialisation Rapide",
      ht: "Kijan pou kòmanse byen fasil",
      en: "Quick Onboarding Setup Guide"
    },
    guideStepsDesc: {
      fr: "Initialisez l'instance de votre client en suivant ces trois étapes obligatoires :",
      ht: "Swiv ti bèl etap sa yo pou vinn pare pou kliyan ou :",
      en: "Synthesize the tenant setup structure by fulfilling these core steps:"
    },
    step1: {
      fr: "1. Configurez les succursales et départements dans l'onglet Organisation.",
      ht: "1. Kreye sikisal yo ak depatman nan estrikti konpayi an.",
      en: "1. Declare branch locations and departments in the Organization screen."
    },
    step2: {
      fr: "2. Créez des collaborateurs sous l'onglet Personnel ou utilisez le système d'Invitation.",
      ht: "2. Ajoute moun yo nan paj Personnel oubyen voye lyen envitasyon otomatik.",
      en: "2. Add active employees under Staff directory or dispatch Onboarding invites."
    },
    step3: {
      fr: "3. Formulez les contrats de travail en spécifiant les salaires fixes de base (HTG).",
      ht: "3. Fè kontra travay yo ak salè de baz la an Goud Ayisyen (HTG).",
      en: "3. Generate formal employment agreements with base wages in Gourdes (HTG)."
    },
    opsTitle: {
      fr: "Fiche d'Événements du Cycle Opérationnel :",
      ht: "Egzanp senp jan travay la mache otomatik :",
      en: "Standard Operational Lifecycle Flow Model:"
    },
    ops1: { fr: "1. ORÈ", ht: "1. ORÈ", en: "1. SCHEDULE" },
    ops1Desc: { fr: "Shifts gérés", ht: "Plan orè", en: "Shift planned" },
    ops2: { fr: "2. PWENTAJ", ht: "2. PWENTAJ", en: "2. ATTENDANCE" },
    ops2Desc: { fr: "Scan QR", ht: "Scan badge", en: "QR scanned" },
    ops3: { fr: "3. PAIE", ht: "3. PAIE", en: "3. PAYROLL" },
    ops3Desc: { fr: "Calcul CNSS / CNS", ht: "Chaj taks", en: "Tax deductions" },
    ops4: { fr: "4. LIVRE", ht: "4. LIVRE", en: "4. LEDGER" },
    ops4Desc: { fr: "Balances doubles", ht: "Balans kont", en: "Dual entry logged" },
    guidance: true,
    payrollBadge: { fr: "RÉGULATION DE LA PAIE", ht: "DWA SOU PEMAN YO", en: "PAYROLL LAWS" },
    payrollItalic: { fr: "Remarque : Les tranches IRI s'appliquent automatiquement après abattements selon les barèmes nationaux.", ht: "Nòt : Taks IRI a kalkile pou anplwaye yo otomatikman dapre lalwa travay la.", en: "Notice: Income tax brackets (IRI) are applied dynamically in accordance with national laws." },
    planningBadge: { fr: "RÈGLEMENT DE PLANIFICATION", ht: "PRENSIP ORÈ AK SHIFT YO", en: "SCHEDULING POLICIES" },
    cardDlqTitle: { fr: "Système de file d'attente (DLQ)", ht: "Sistèm keu ak offline (DLQ)", en: "Dead Letter Queue (DLQ)" },
    cardForensicTitle: { fr: "Audit Forensic Immuable", ht: "Odit Forensic imuiab", en: "Immutable Forensic Ledger" },

    // Ledger Tab
    ledgerTitle: {
      fr: "Règles d'Équilibre Général & Partie Double",
      ht: "Gran Liv ak Prensip Balans Kont Doub",
      en: "Double-Entry Ledger Balancing Compliance"
    },
    ledgerDesc1: {
      fr: "Le Grand Livre ERP valide chaque transaction en temps réel. Pour garantir l'intégrité, l'équation universelle doit être équilibrée :",
      ht: "Gran Liv la tcheke tout aksyon nan menm lè a. Tout operasyon dwe balanse pafè :",
      en: "The ledger engine audits commits dynamically. The core equation must satisfy:"
    },
    ledgerEquation: {
      fr: "TOTAL DÉBITS = TOTAL CRÉDITS",
      ht: "TOTAL DEBI YO = TOTAL KREDI YO",
      en: "TOTAL DEBITS = TOTAL CREDITS"
    },
    ledgerDesc2: {
      fr: "Protocole d'Intégrité : Les écritures validées ne sont jamais modifiées ou supprimées. Pour rectifier une imputation, l'administrateur procède à une Contrepassation (Reversal) pour générer des transactions de compensation équilibrées avec signature cryptographique.",
      ht: "Prensip Sekirite : Done yo pa ka efase nèt kote yo sove a. Si gen erè, ou dwe kreye yon Ranvèsman (Reversal) pou anrejistre yon aksyon konpansasyon.",
      en: "Safety Blueprint: Signed entries are immutable. To correct errors, operators dispatch a compensating double-entry (Reversal) forming a matching offset trace."
    },
    sandboxLedger: {
      fr: "Simulateur Interactif Débits vs Crédits",
      ht: "Similatè Debi ak Kredi otomatik",
      en: "Interactive Ledger Entry Balance Tester"
    },
    sandboxLedgerDesc: {
      fr: "Testez l'éligibilité d'une transaction complexe d'ajustement :",
      ht: "Eseye mete chif yo pou wè si liv kontab la ap aksepte operasyon an :",
      en: "Input values to simulate immediate transaction clearance verification:"
    },
    debitLabel: { fr: "Total Débits (HTG)", ht: "Total Debi (HTG)", en: "Total Debits (HTG)" },
    creditLabel: { fr: "Total Crédits (HTG)", ht: "Total Kredi (HTG)", en: "Total Credits (HTG)" },
    balancedSuccess: {
      fr: "TRANSACTION VALIDE : Balance parfaite détectée. Clôture autorisée.",
      ht: "TRANZAKSYON VALIDE : Done yo balanse byen. Anrejistrement konfòm.",
      en: "TRANSACTION VALID: Ledger matches perfectly. Commit authorized."
    },
    balancedErr: {
      fr: "ERREUR DE BALANCE : Déséquilibre de {val} HTG. Clôture interdite.",
      ht: "ERÈ BALANCE : Gen yon dekalaj de {val} HTG. Blokaj aktif.",
      en: "IMBALANCE ERROR: Difference of {val} HTG found. Write blocked."
    },
    typExample: {
      fr: "Exemple de transaction d'achat de fournitures :",
      ht: "Yon egzanp senp sou achte founiti biwo :",
      en: "Sample Double-Entry (Purchasing of supplies) :"
    },
    tCode: { fr: "Compte", ht: "Kont", en: "Account" },
    tLabel: { fr: "Libellé", ht: "Rezon", en: "Memo Label" },
    tDeb: { fr: "Débit", ht: "Debi", en: "Debit" },
    tCred: { fr: "Crédit", ht: "Kredi", en: "Credit" },
    rowSupplies: { fr: "6120_FOURNITURES bureau", ht: "Depans founiti biwo", en: "6120_OFFICE_supplies" },
    rowCashout: { fr: "1010_CAISSE_SORTIE", ht: "Lajan ki soti nan Kès", en: "1010_CASH_out_account" },

    // Payroll Tab
    taxTitle: {
      fr: "Moteur CNSS (6%) & CNS (2%) en Haïti",
      ht: "Retni ak Chaj legal yo (CNSS ak CNS)",
      en: "Tax Deductions & Payroll Laws (Haiti)"
    },
    taxDesc: {
      fr: "Le calcul des salaires nets s'applique sur la quinzaine active ou mensuellement :",
      ht: "Sistèm nan aplike kalkil legal sa yo sou salè chak travayè Ayisyen otomatikman :",
      en: "The system automates regional compliance deductions over gross payroll ledger lines:"
    },
    taxList: {
      cnss: {
        fr: "CNSS ONA (Pension) : 6% prélevés sur le brut de l'employé, doublés par 6% de part patronale de l'entreprise.",
        ht: "CNSS ONA (Retret) : 6% soti nan salè anplwaye a, epi patwon a gen 6% pa l tou pou bay leta Ayisyen.",
        en: "CNSS ONA (Retirement Account): 6% deducted from gross base, paired with a 6% match paid separately by employer."
      },
      cns: {
        fr: "CNS (Aide Sociale) : Prélèvement obligatoire de 2% appliqué sur le salaire brut standard.",
        ht: "CNS (Asistans Sosyal) : Kontribisyon obligatwa de 2% sou salè brit la pou ka ijans medikal ak koperasyon.",
        en: "CNS (Assistance Fund): Uniform 2% deduction from base salary towards general assistance insurance."
      },
      iri: {
        fr: "IRI (Impôt Revenu) : Barème progressif calculé dynamiquement par le moteur analytique.",
        ht: "IRI (Taks sou Revni) : Kalkile otomatik selon tab barèm ofisyèl Direksyon Jeneral Taks (DGI).",
        en: "IRI (Income Tax): Automated brackets calculations on accumulated earnings."
      }
    },
    taxSimTitle: {
      fr: "Simulateur instantané de Prélèvements",
      ht: "Similatè Chaj CNSS ak CNS (Lwa Ayiti)",
      en: "Instant CNSS & CNS Calculator Tool"
    },
    grossLabel: { fr: "Salaire Brut (HTG)", ht: "Salè Brit (HTG)", en: "Gross Salary (HTG)" },
    boxEmp: { fr: "Part Employé (DÉDUCTIONS)", ht: "Retni sou Anplwaye a", en: "Employee Cuts (DEDUCTIONS)" },
    boxPatron: { fr: "Part Employeur (CHARGES)", ht: "Kòb legal Patwon an dwe bay", en: "Employer Costs (ADDITIONS)" },
    lblCnss: { fr: "CNSS ONA (6%) :", ht: "ONA Retret (6%) :", en: "CNSS ONA Share (6%):" },
    lblCns: { fr: "Assurance CNS (2%) :", ht: "CNS Asistance (2%) :", en: "CNS Assistance Cut (2%):" },
    totalDed: { fr: "Total Déductions :", ht: "Total sa yo retire :", en: "Total Deductions:" },
    netEst: { fr: "Salaire Net Estimé :", ht: "Salè Nèt la estimé :", en: "Estimated Take-Home:" },
    lblEmployerCnss: { fr: "Part Patronale CNSS (6%) :", ht: "Part CNSS Patwon an (6%) :", en: "Employer CNSS Match (6%):" },
    lblOfatma: { fr: "Sécurité OFATMA (3%) :", ht: "Asirans OFATMA (3%) :", en: "OFATMA Safety Fund (3%):" },
    totalPatron: { fr: "Total Charges Patronales :", ht: "Total Chaj Patwon :", en: "Total Employer Additions:" },

    // Planning Tab
    planTitle: {
      fr: "Moteur Anti-Collision de Planning",
      ht: "Sistèm Planifikasyon ak Deteksyon Konfli",
      en: "Roster Rules & Overlap Diagnosis Core"
    },
    planDesc: {
      fr: "L'ERP valide les affectations de quarts immédiatement pour bloquer les conflits programmatiques :",
      ht: "Paj orè a gen kontwòl deteksyon konfli lè ak dat otomatik pou mèt travay yo toujou konfòm :",
      en: "The scheduling sub-system runs real-time rule assertions to detect scheduling failures:"
    },
    planList: {
      overlap: {
        fr: "Conflits d'horaires : Interdit de lier un employé sur deux Shifts simultanés d'une succursale.",
        ht: "Lè doub : Bloke planifikasyon anplwaye yo si yo deja gen yon lòt pòs pou menm lè a.",
        en: "Double Booking Overlaps: Disallows placing a staff detail in overlapping time bounds."
      },
      leave: {
        fr: "Vérification des Absences : Bloque l'attribution de poste si un congé est approuvé à cette date.",
        ht: "Vakans ak Konje : Si yon moun gen konje, sistèm nan anpeche mete li nan plan orè a.",
        en: "Approved Leaves: Automatically references active leave logs, blocking booking requests."
      },
      overtime: {
        fr: "Alerte de surdosage : Signalement si le Shift configuré outrepasse les 8h légales de travail.",
        ht: "Anomalie Reta / Heures : Avèti administratè a lè orè a depase 8 èdtan legal pa jou.",
        en: "Overtime alerts: Triggers warning notices if a shift exceeds the regulatory 8-hour shift."
      }
    },
    planSim: {
      fr: "Simulateur d'Outils Anti-collision",
      ht: "Similatè Deteksyon Konfli Orè",
      en: "Schedule Diagnostics simulator"
    },
    planSimDesc: {
      fr: "Ajustez le profil du collaborateur pour voir l'alerte du validateur :",
      ht: "Chwazi opsyon sa yo pou wè kijan kòd la ap detekte chanjman orè :",
      en: "Adjust parameters to simulate compliance diagnostics feedback:"
    },
    currentStatus: { fr: "Statut actuel de l'employé", ht: "Kondisyon anplwaye a kounye a", en: "Current Employee Status" },
    optAvailable: { fr: "Actif / Disponible", ht: "Disponib (Pa gen lòt plan)", en: "Active & Available" },
    optLeave: { fr: "En congé approuvé pour la quinzaine", ht: "Nan konje pou de semèn sa", en: "On approved quinzaine leave" },
    optDouble: { fr: "Déjà assigné sur un shift concurrent", ht: "Li planifye nan yon lòt kote deja", en: "Already assigned to a slot" },
    shiftDuration: { fr: "Heures Planifiées pour ce nouveau Shift", ht: "Lè orè chwazi (Èdtan)", en: "Shift Hours Planned" },
    diagnosisLabel: { fr: "Diagnostic du moteur : ", ht: "Estati analizè a: ", en: "Validator Outcome: " },

    // Attendance Tab
    attTitle: {
      fr: "Pointeuse Kiosque, QR Code & Badges",
      ht: "Pointaj QR, bèl Badges ak Kiosk Kòd",
      en: "QR Badge Scanners & Entry Points"
    },
    attDesc: {
      fr: "Le Kiosque de pointage offre un mécanisme rapide et auditable de prise de poste :",
      ht: "Kiosk QR a pèmèt tout ekip la fè pointaj sekirize lè y ap antre ak soti nan travay :",
      en: "The workspace entry terminal supports scanning physical identity badges and QR codes:"
    },
    attList: {
      badges: {
        fr: "Badge Employé unique : Génère automatiquement un Badge avec QR sécurisé unique.",
        ht: "Badge elektwonik : Paj personnel la kreye bèl kat idantite ak bainte inik.",
        en: "Automated Badges: Instantly generates formal physical vectors containing verified QR targets."
      },
      recording: {
        fr: "Prise de Temps instantanée : Ouverture de la caméra pour scanner son identité et valider l'heure.",
        ht: "Hardware Kiosk pointaj : Louvri zouti kamera QR pou kontwole lè antre ak soti byen fasil.",
        en: "Kiosk Scan Stream: Activates web-camera capture bounds to log entry or exit parameters."
      },
      variance: {
        fr: "Calcul d'écart : Compare en temps réel l'enregistrement aux heures prévues du planning.",
        ht: "Kalkil dekalaj : Tcheke diferans lè travayè a parèt avèk lè li te sipoze kòmanse a.",
        en: "Roster Variance Math: Automatically records and compares timesheet to scheduled slots."
      }
    },
    attSim: {
      fr: "Simulateur de Badge Collaborateur (FinOps ID Card)",
      ht: "Similatè Badge QR Anplwaye (Ayiti)",
      en: "Personnel QR Interactive Badge Mockup"
    },
    badgeHeader: { fr: "ID CARTE COLLABORATEUR", ht: "KAID ANPLWAYE", en: "EMPLOYEE ID BADGE" },
    badgeSub: { fr: "Département Administration & FinOps", ht: "Asistans Jeneral & FinOps", en: "FinOps & Administrative Unit" },

    // Resilience Tab
    resTitle: {
      fr: "Résilience d'Échanges Offlines & Redondance DLQ",
      ht: "Rezilans done DLQ, Forensic Logs ak Rezo",
      en: "Local Buffers, DLQ Queues & Fraud Security"
    },
    resDesc: {
      fr: "Le système s'adapte aux instabilités d'Internet en Haïti pour sécuriser chaque centime loggé :",
      ht: "Machin ERP a pare pou travay menm si pa gen entènèt pou nou pa pèdi pyès enfòmasyon finansye :",
      en: "The architecture defends database mutations against poor regional network dropouts:"
    },
    resList: {
      dlq: {
        fr: "Dead Letter Queue (DLQ) : En cas de coupure de réseau, les événements sont mis en mémoire locale temporaire, puis reversés dans la DLQ de l'ERP pour être synchronisés d'un seul clic à la reconnexion.",
        ht: "Ke DLQ (Kès Erè) : Si pa gen entènèt, done yo sove nan memwa telefòn lan. Lè entènèt konekte ankò, ou voye yo tout ansanm kòrèkteman nan yon sèl klik.",
        en: "Offline Event Logs (DLQ): If server commits fail during offline operations, entries buffer securely inside regional client-side Dead Letter Queues for deferred replay."
      },
      forensic: {
        fr: "Forensic Audit Trail : Toutes les interventions financières de correction manuelle (comme la modification de pointages ou la contrepassation) génèrent un Forensic Log immuable avec IP de capture, timestamp précis et signature cryptologique unique.",
        ht: "Istorik Forensic (Odit) : Tout chanjman kòb oswa lè yo sove otomatikman nan yon liv sekirite ki pa kapab modifye pou anpeche frod nan konpayi an.",
        en: "Forensic logs: Core modifications write into locked, tamper-resistant system logs documenting provenance IP addresses, exact timestamps, operator IDs, and hash validations."
      }
    },
    logSampleTitle: {
      fr: "Structure de trace d'audit d'un log forensic :",
      ht: "Ti fòma done ki ekri nan dosye Forensic la :",
      en: "Standard Structured Forensic differential payload:"
    }
  };

  return (
    <div className="flex flex-col gap-6" id="instructions-tab">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-950/80 backdrop-blur-xl p-8 rounded-3xl border border-white/5 shadow-2xl shadow-indigo-500/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-100 uppercase tracking-[0.2em]">
              {dict.title[currentLang]}
            </h2>
            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1 leading-relaxed max-w-2xl">
              {dict.subtitle[currentLang]}
            </p>
          </div>
        </div>

        {/* SEARCH BOX */}
        <div className="relative w-full md:w-80 group">
          <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
          <input
            type="text"
            placeholder={dict.search[currentLang]}
            className="w-full bg-slate-900 border border-white/10 focus:border-cyan-500/50 rounded-2xl pl-11 pr-4 py-3.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 font-black uppercase tracking-widest transition-all shadow-inner"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* DOUBLE COMPONENT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* SIDE BAR NAVIGATION */}
        <div className="md:col-span-3 flex flex-col gap-3">
          <span className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] px-3 block mb-2">
            {dict.subjects[currentLang]}
          </span>
          {filteredSections.map((sec) => {
            const Icon = sec.icon;
            const isSel = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(sec.id)}
                className={`w-full text-left p-4 rounded-2xl transition-all border flex items-center justify-between group cursor-pointer active:scale-[0.98] ${
                  isSel 
                    ? "bg-indigo-600/10 border-indigo-500/40 text-indigo-400 shadow-lg shadow-indigo-500/5"
                    : "bg-slate-950/30 border-white/5 text-slate-500 hover:text-slate-200 hover:bg-slate-900/40"
                }`}
              >
                <div className="flex items-center gap-4">
                  <Icon className={`w-4 h-4 shrink-0 transition-colors ${isSel ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest truncate leading-none">
                    {sec.title[currentLang]}
                  </span>
                </div>
                <span className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-lg bg-slate-950 border border-white/5 text-slate-600 uppercase">
                  {sec.tag}
                </span>
              </button>
            );
          })}

          <div className="bg-slate-950/40 border border-slate-900 p-4 rounded-xl mt-4">
            <h4 className="text-[10px] uppercase font-black text-cyan-500 tracking-wider mb-2 flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5" />
              {dict.aiAssist[currentLang]}
            </h4>
            <p className="text-[10.5px] text-slate-400 leading-relaxed font-light">
              {dict.aiDesc[currentLang]}
            </p>
          </div>
        </div>

        {/* DETAILS VIEWER AREA */}
        <div className="md:col-span-9 bg-slate-900/20 border border-slate-900 rounded-2xl p-6 min-h-[520px] transition-all relative">
          <AnimatePresence mode="wait">
            {activeSection === "overview" && (
              <motion.div
                key="sec-overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9.5px] uppercase font-extrabold text-cyan-400 tracking-widest bg-cyan-950/50 px-2.5 py-1 rounded border border-cyan-900/60 font-mono">
                    {dict.ops1[currentLang]} - {dict.guidance ? "SYSTEM" : "CORE"}
                  </span>
                  <h3 className="text-lg font-black text-slate-100 mt-3">
                    {dict.overviewHeader[currentLang]}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                    <h4 className="font-extrabold text-xs text-slate-200 mb-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {dict.matrixTitle[currentLang]}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-light mb-2">
                      {dict.matrixDesc[currentLang]}
                    </p>
                    <ul className="list-disc pl-4 text-[10.5px] text-slate-400 space-y-1.5 font-mono">
                      <li>{dict.roles.owner[currentLang]}</li>
                      <li>{dict.roles.manager[currentLang]}</li>
                      <li>{dict.roles.supervisor[currentLang]}</li>
                      <li>{dict.roles.employee[currentLang]}</li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                    <h4 className="font-extrabold text-xs text-slate-200 mb-1.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {dict.guideStepsTitle[currentLang]}
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-light mb-2">
                      {dict.guideStepsDesc[currentLang]}
                    </p>
                    <ol className="list-decimal pl-4 text-[10.5px] text-slate-400 space-y-1.5 font-sans font-light">
                      <li>{dict.step1[currentLang]}</li>
                      <li>{dict.step2[currentLang]}</li>
                      <li>{dict.step3[currentLang]}</li>
                    </ol>
                  </div>
                </div>

                <div className="bg-slate-950/20 border border-slate-850 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-2">{dict.opsTitle[currentLang]}</h4>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 font-mono text-[10px] text-slate-400">
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900 text-center flex-1">
                      <span className="text-cyan-400 block font-bold mb-1">{dict.ops1[currentLang]}</span>
                      {dict.ops1Desc[currentLang]}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-700 hidden sm:block shrink-0" />
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900 text-center flex-1">
                      <span className="text-cyan-400 block font-bold mb-1">{dict.ops2[currentLang]}</span>
                      {dict.ops2Desc[currentLang]}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-700 hidden sm:block shrink-0" />
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900 text-center flex-1">
                      <span className="text-cyan-400 block font-bold mb-1">{dict.ops3[currentLang]}</span>
                      {dict.ops3Desc[currentLang]}
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-700 hidden sm:block shrink-0" />
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-900 text-center flex-1">
                      <span className="text-cyan-400 block font-bold mb-1">{dict.ops4[currentLang]}</span>
                      {dict.ops4Desc[currentLang]}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === "ledger" && (
              <motion.div
                key="sec-ledger"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9.5px] uppercase font-extrabold text-cyan-400 tracking-widest bg-cyan-950/50 px-2.5 py-1 rounded border border-cyan-900/60 font-mono">
                    LEDGER VERIFIER
                  </span>
                  <h3 className="text-lg font-black text-slate-100 mt-3">
                    {dict.ledgerTitle[currentLang]}
                  </h3>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-850 space-y-3">
                  <p className="text-xs text-slate-300 leading-relaxed font-light">
                    {dict.ledgerDesc1[currentLang]}
                  </p>
                  <div className="bg-slate-950 p-3 rounded border border-slate-900 font-mono text-center text-xs text-emerald-400 font-bold max-w-md mx-auto">
                    {dict.ledgerEquation[currentLang]}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-light">
                    {dict.ledgerDesc2[currentLang]}
                  </p>
                </div>

                <div className="bg-slate-950 p-5 rounded-xl border border-cyan-955/45 space-y-4">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                    <Calculator className="w-4 h-4 text-cyan-400" />
                    {dict.sandboxLedger[currentLang]}
                  </h4>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed font-light">
                    {dict.sandboxLedgerDesc[currentLang]}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 bg-slate-900/50 p-3 rounded border border-slate-850/80">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{dict.debitLabel[currentLang]}</label>
                      <input
                        type="number"
                        className="bg-slate-950 font-mono font-bold text-sm text-rose-450 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-rose-500"
                        value={debitVal}
                        onChange={(e) => setDebitVal(Number(e.target.value))}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5 bg-slate-900/50 p-3 rounded border border-slate-855">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{dict.creditLabel[currentLang]}</label>
                      <input
                        type="number"
                        className="bg-slate-950 font-mono font-bold text-sm text-emerald-400 border border-slate-800 rounded p-1.5 focus:outline-none focus:border-emerald-500"
                        value={creditVal}
                        onChange={(e) => setCreditVal(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className={`p-3 rounded border text-xs font-mono font-bold flex items-center justify-between transition-colors ${
                    debitVal === creditVal 
                      ? "bg-emerald-950/20 border-emerald-900/50 text-emerald-400" 
                      : "bg-red-950/20 border-red-900/50 text-red-400"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      {debitVal === creditVal ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      <span>
                        {debitVal === creditVal 
                          ? dict.balancedSuccess[currentLang] 
                          : dict.balancedErr[currentLang].replace("{val}", (debitVal - creditVal).toLocaleString())}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850">
                  <h4 className="text-xs font-semibold text-slate-350 mb-2 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> {dict.typExample[currentLang]}</h4>
                  <table className="w-full text-left font-mono text-[10.5px] whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="pb-1.5">{dict.tCode[currentLang]}</th>
                        <th className="pb-1.5">{dict.tLabel[currentLang]}</th>
                        <th className="pb-1.5 text-right">{dict.tDeb[currentLang]}</th>
                        <th className="pb-1.5 text-right">{dict.tCred[currentLang]}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      <tr>
                        <td className="py-2 text-slate-400">6120_OFFICE_GEN</td>
                        <td className="py-2 text-slate-200">{dict.rowSupplies[currentLang]}</td>
                        <td className="py-2 text-right text-rose-450 font-bold">12,500.00 HTG</td>
                        <td className="py-2 text-right text-slate-600">0.00</td>
                      </tr>
                      <tr>
                        <td className="py-2 text-slate-400">1010_CASH</td>
                        <td className="py-2 text-slate-200">{dict.rowCashout[currentLang]}</td>
                        <td className="py-2 text-right text-slate-600">0.00</td>
                        <td className="py-2 text-right text-emerald-400 font-bold">12,500.00 HTG</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeSection === "payroll" && (
              <motion.div
                key="sec-payroll"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9.5px] uppercase font-extrabold text-cyan-400 tracking-widest bg-cyan-950/50 px-2.5 py-1 rounded border border-cyan-900/60 font-mono">
                    {dict.payrollBadge[currentLang]}
                  </span>
                  <h3 className="text-lg font-black text-slate-100 mt-3">
                    {dict.taxTitle[currentLang]}
                  </h3>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <p className="text-xs text-slate-350 leading-relaxed font-light">
                    {dict.taxDesc[currentLang]}
                  </p>
                  <ul className="list-disc pl-4 text-xs text-slate-400 space-y-2 font-sans font-light">
                    <li>{dict.taxList.cnss[currentLang]}</li>
                    <li>{dict.taxList.cns[currentLang]}</li>
                    <li>{dict.taxList.iri[currentLang]}</li>
                  </ul>
                  <p className="text-xs text-slate-400 italic">
                    {dict.payrollItalic[currentLang]}
                  </p>
                </div>

                {/* PAYROLL INTERACTIVE SIMULATOR */}
                <div className="bg-slate-950 p-5 rounded-xl border border-cyan-955/40 space-y-4">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                    <Calculator className="w-4 h-4 text-cyan-400" />
                    {dict.taxSimTitle[currentLang]}
                  </h4>

                  <div className="flex flex-col gap-1 w-full max-w-sm">
                    <label className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">{dict.grossLabel[currentLang]}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-sm font-bold text-slate-100 placeholder:text-slate-700 w-full"
                        value={grossWageInput}
                        onChange={(e) => setGrossWageInput(Math.max(0, Number(e.target.value)))}
                      />
                      <span className="text-xs font-bold text-slate-400 font-mono">HTG</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-slate-900/60 p-3 rounded border border-slate-850/80 space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase pb-1 border-b border-slate-850">
                        {dict.boxEmp[currentLang]}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{dict.lblCnss[currentLang]}</span>
                        <span className="text-rose-400 font-extrabold font-mono">-{simulatedCnssEmp.toLocaleString()} HTG</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{dict.lblCns[currentLang]}</span>
                        <span className="text-rose-400 font-extrabold font-mono">-{simulatedCnsEmp.toLocaleString()} HTG</span>
                      </div>
                      <div className="pt-2 border-t border-slate-850 flex justify-between font-bold text-slate-300">
                        <span>{dict.totalDed[currentLang]}</span>
                        <span>-{(simulatedCnssEmp + simulatedCnsEmp).toLocaleString()} HTG</span>
                      </div>
                      <div className="pt-1.5 flex justify-between font-black text-emerald-400 text-[12px]">
                        <span>{dict.netEst[currentLang]}</span>
                        <span>{netTakeHome.toLocaleString()} HTG</span>
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-3 rounded border border-slate-850/80 space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold uppercase pb-1 border-b border-slate-850">
                        {dict.boxPatron[currentLang]}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">{dict.lblEmployerCnss[currentLang]}</span>
                        <span className="text-cyan-400 font-extrabold font-mono">+{simulatedCnssPatron.toLocaleString()} HTG</span>
                      </div>
                      <div className="flex justify-between text-slate-500 italic">
                        <span>{dict.lblOfatma[currentLang]}</span>
                        <span>+{Math.round(grossWageInput * 0.03).toLocaleString()} HTG</span>
                      </div>
                      <div className="pt-2 border-t border-slate-855 flex justify-between font-bold text-slate-400">
                        <span>{dict.totalPatron[currentLang]}</span>
                        <span>{(simulatedCnssPatron + Math.round(grossWageInput * 0.03)).toLocaleString()} HTG</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === "planning" && (
              <motion.div
                key="sec-planning"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9.5px] uppercase font-extrabold text-cyan-400 tracking-widest bg-cyan-950/50 px-2.5 py-1 rounded border border-cyan-900/60 font-mono">
                    {dict.planningBadge[currentLang]}
                  </span>
                  <h3 className="text-lg font-black text-slate-100 mt-3">
                    {dict.planTitle[currentLang]}
                  </h3>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-855 space-y-3">
                  <p className="text-xs text-slate-350 leading-relaxed font-light">
                    {dict.planDesc[currentLang]}
                  </p>
                  <ul className="list-disc pl-4 text-xs text-slate-400 space-y-1.5 font-light font-sans">
                    <li>{dict.planList.overlap[currentLang]}</li>
                    <li>{dict.planList.leave[currentLang]}</li>
                    <li>{dict.planList.overtime[currentLang]}</li>
                  </ul>
                </div>

                {/* CONFLICT INTERACTIVE SIMULATOR */}
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-850/80 space-y-4">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                    <Calendar className="w-4 h-4 text-cyan-400" />
                    {dict.planSim[currentLang]}
                  </h4>
                  <p className="text-[10.5px] text-slate-400 leading-relaxed font-light">
                    {dict.planSimDesc[currentLang]}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 bg-slate-900/50 p-3 rounded border border-slate-850/80">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{dict.currentStatus[currentLang]}</label>
                      <select 
                        className="bg-slate-950 border border-slate-805 rounded p-2 text-xs font-sans text-slate-200 focus:outline-none"
                        value={empStatus}
                        onChange={(e) => setEmpStatus(e.target.value)}
                      >
                        <option value="AVAILABLE">{dict.optAvailable[currentLang]}</option>
                        <option value="LEAVE">{dict.optLeave[currentLang]}</option>
                        <option value="DOUBLE">{dict.optDouble[currentLang]}</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 bg-slate-900/50 p-3 rounded border border-slate-850/80">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{dict.shiftDuration[currentLang]}</label>
                      <input 
                        type="number"
                        className="bg-slate-950 border border-slate-805 rounded p-2 text-xs font-mono font-bold text-slate-200 focus:outline-none"
                        min={1}
                        max={16}
                        value={hoursPlanned}
                        onChange={(e) => setHoursPlanned(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl border flex gap-3 text-xs font-sans leading-relaxed transition-all ${
                    currentConflictResult.severity === "CRITICAL" 
                      ? "bg-rose-950/20 border-rose-900/40 text-rose-300"
                      : currentConflictResult.severity === "WARNING"
                      ? "bg-amber-950/20 border-amber-900/45 text-amber-300"
                      : "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
                  }`}>
                    <AlertTriangle className={`w-5 h-5 shrink-0 ${
                      currentConflictResult.severity === "CRITICAL" 
                        ? "text-rose-400"
                        : currentConflictResult.severity === "WARNING"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`} />
                    <div className="flex-1">
                      <div className="font-extrabold text-[10px] uppercase tracking-wider mb-0.5 flex items-center justify-between">
                        <span>{dict.diagnosisLabel[currentLang]}{currentConflictResult.severity}</span>
                        <span className="font-mono text-[9px] text-slate-500">{currentConflictResult.code}</span>
                      </div>
                      <p className="text-[11px] font-medium leading-normal">{currentConflictResult.message[currentLang]}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === "attendance" && (
              <motion.div
                key="sec-attendance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9.5px] uppercase font-extrabold text-cyan-400 tracking-widest bg-cyan-950/50 px-2.5 py-1 rounded border border-cyan-900/60 font-mono">
                    {dict.ops2[currentLang]} - {dict.guidance ? "ENGINE" : "READER"}
                  </span>
                  <h3 className="text-lg font-black text-slate-100 mt-3">
                    {dict.attTitle[currentLang]}
                  </h3>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-855 space-y-3">
                  <p className="text-xs text-slate-350 leading-relaxed font-light">
                    {dict.attDesc[currentLang]}
                  </p>
                  <ol className="list-decimal pl-4 text-xs text-slate-400 space-y-1.5 font-light font-sans">
                    <li>{dict.attList.badges[currentLang]}</li>
                    <li>{dict.attList.recording[currentLang]}</li>
                    <li>{dict.attList.variance[currentLang]}</li>
                  </ol>
                </div>

                {/* SHOWING INTERACTIVE BADGE PREVIEW */}
                <div className="bg-slate-950 p-5 rounded-xl border border-slate-850/80 space-y-3">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5 font-sans">
                    <QrCode className="w-4 h-4 text-cyan-400" />
                    {dict.attSim[currentLang]}
                  </h4>

                  <div className="flex justify-center pt-3">
                    <div className="w-64 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center relative overflow-hidden shadow-2xl">
                      <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-cyan-500 to-indigo-500"></div>
                      
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{dict.badgeHeader[currentLang]}</div>
                      <div className="w-16 h-16 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-cyan-400 text-lg mt-3 shadow-inner">
                        EP
                      </div>

                      <div className="mt-2 text-center">
                        <div className="text-xs font-bold text-slate-100">Etienne Pierre</div>
                        <div className="text-[9px] text-slate-500 uppercase font-mono font-bold">{dict.badgeSub[currentLang]}</div>
                      </div>

                      {/* QR Placeholder representation */}
                      <div className="mt-4 bg-slate-950 border-2 border-slate-800 p-2 rounded-lg relative group">
                        <div className="grid grid-cols-4 gap-1 w-16 h-16">
                          <div className="bg-cyan-400 rounded-sm"></div>
                          <div className="bg-slate-950"></div>
                          <div className="bg-cyan-400 rounded-sm"></div>
                          <div className="bg-cyan-400 rounded-sm"></div>
                          
                          <div className="bg-slate-950"></div>
                          <div className="bg-cyan-400 rounded-sm"></div>
                          <div className="bg-slate-950"></div>
                          <div className="bg-cyan-400 rounded-sm"></div>
                        </div>
                        <div className="absolute inset-0 bg-cyan-600/10 flex items-center justify-center rounded animate-pulse"></div>
                      </div>

                      <div className="text-[8px] font-mono text-slate-500 mt-3">ID: EMP_HT_92039_PROD</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === "resilience" && (
              <motion.div
                key="sec-resilience"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div>
                  <span className="text-[9.5px] uppercase font-extrabold text-cyan-400 tracking-widest bg-cyan-950/50 px-2.5 py-1 rounded border border-cyan-900/60 font-mono">
                    {dict.ops4[currentLang]} - AUDIT
                  </span>
                  <h3 className="text-lg font-black text-slate-100 mt-3">
                    {dict.resTitle[currentLang]}
                  </h3>
                </div>

                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 space-y-3">
                  <p className="text-xs text-slate-350 leading-relaxed font-light">
                    {dict.resDesc[currentLang]}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 space-y-2">
                      <span className="text-xs font-extrabold text-cyan-400 block">{dict.cardDlqTitle[currentLang]}</span>
                      <p className="text-[11px] text-slate-400 font-light leading-relaxed">{dict.resList.dlq[currentLang]}</p>
                    </div>
                    <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 space-y-2">
                      <span className="text-xs font-extrabold text-emerald-400 block">{dict.cardForensicTitle[currentLang]}</span>
                      <p className="text-[11px] text-slate-400 font-light leading-relaxed">{dict.resList.forensic[currentLang]}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-300 mb-2">{dict.logSampleTitle[currentLang]}</h4>
                  <div className="bg-slate-950 border border-slate-900 rounded p-3 font-mono text-[10px] text-slate-400 leading-relaxed space-y-1 overflow-x-auto">
                    <div>{"{"}</div>
                    <div className="pl-4">"action": "ATTENDANCE_OVERRIDE",</div>
                    <div className="pl-4">"user_id": "e_92_owner",</div>
                    <div className="pl-4">"provenance_ip": "190.115.35.22",</div>
                    <div className="pl-4">"before_state": "<span className="text-rose-400">{'{"realHours": 0, "status": "ABSENT"}'}</span>",</div>
                    <div className="pl-4">"after_state": "<span className="text-emerald-400">{'{"realHours": 8.5, "status": "NORMAL"}'}</span>",</div>
                    <div className="pl-4">"signature": "<span className="text-cyan-400">hsh_att_override_ff9a92a2a</span>"</div>
                    <div>{"}"}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
