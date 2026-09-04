export interface MarketingTranslationSchema {
  hero: {
    title1: string;
    title2: string;
    title3: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trustFast: string;
    trustCompliance: string;
    trustQr: string;
    trustNoCard: string;
    trustBranches: string;
  };
  features: {
    sectionTitle: string;
    sectionSubtitle: string;
    qrTitle: string;
    qrDesc: string;
    payrollTitle: string;
    payrollDesc: string;
    ledgerTitle: string;
    ledgerDesc: string;
    aiTitle: string;
    aiDesc: string;
  };
  liveDemo: {
    title: string;
    subtitle: string;
    metricsTitle: string;
    revenue: string;
    activeStaff: string;
    accuracy: string;
    qrScans: string;
    branches: string;
    backBtn: string;
  };
  pricing: {
    title: string;
    subtitle: string;
    monthly: string;
    starterName: string;
    starterPrice: string;
    starterTarget: string;
    businessName: string;
    businessPrice: string;
    businessTarget: string;
    enterpriseName: string;
    enterprisePrice: string;
    enterpriseTarget: string;
    premiumGate: string;
    upgradePrompt: string;
    ctaStart: string;
    ctaContact: string;
    saasPricingTitle: string;
    htgLabel: string;
    usdLabel: string;
    popular: string;
    warrantyTitle: string;
    warrantyDesc: string;
  };
  enterprise: {
    title: string;
    subtitle: string;
    securityTitle: string;
    securityDesc: string;
    slaTitle: string;
    slaDesc: string;
    customTitle: string;
    customDesc: string;
    flowTitle: string;
    step1Title: string;
    step1Desc: string;
    step1Sub: string;
    step2Title: string;
    step2Desc: string;
    step2Sub: string;
    step3Title: string;
    step3Desc: string;
    step3Sub: string;
    ctaTitle: string;
    ctaDesc: string;
    ctaContact: string;
    ctaDemo: string;
  };
  contactSales: {
    back: string;
    branding: string;
    title: string;
    subtitle: string;
    supportTitle: string;
    supportDesc: string;
    auditTitle: string;
    auditDesc: string;
    formTitle: string;
    name: string;
    email: string;
    phone: string;
    company: string;
    teamSize: string;
    message: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successDesc: (name: string, email: string) => string;
    backBtn: string;
  };
}

export type MarketingLanguage = "fr" | "ht" | "en";

export const marketingTranslations: Record<MarketingLanguage, MarketingTranslationSchema> = {
  fr: {
    hero: {
      title1: "Pilotez votre entreprise.",
      title2: "Automatisez votre paie.",
      title3: "Zéro erreur.",
      subtitle: "La première plateforme ERP Fintech conçue pour les PME en Haïti et dans les Caraïbes. Centralisez vos équipes, succursales, pointages QR, paie quinzaine, ledger financier et analytics intelligents IA dans un tableau de bord unifié.",
      ctaPrimary: "Commencer avec Finops",
      ctaSecondary: "Voir la démo de l'ERP",
      trustFast: "Configuration rapide",
      trustCompliance: "Conforme CNSS / CNS",
      trustQr: "Pointage QR intégré",
      trustNoCard: "Sans carte de crédit",
      trustBranches: "Opère sur multi-succursales"
    },
    features: {
      sectionTitle: "Le système opérationnel complet des PME modernes",
      sectionSubtitle: "FinTech de pointe conçue spécifiquement pour le contexte haïtien de conformité et d'activité hors-ligne.",
      qrTitle: "Présences Intelligentes QR",
      qrDesc: "Les employés scannent leur badge QR à la borne physique. FinOps calcule instantanément : retards, cumul d'heures réelles, variances et retenues sur salaires au taux exact.",
      payrollTitle: "Moteur de Paie Localisé",
      payrollDesc: "Automatisez vos quinzaines : calcul instantané des charges CNSS (6%), CNS (2%), commissions sur ventes, avances accordées et fiches de paie PDF certifiées conformes.",
      ledgerTitle: "ERP Ledger & Dettes",
      ledgerDesc: "Suivi temporel de vos entrées, sorties de caisse, balances courantes et détections automatiques de dettes d'employés avec prélèvement automatisé à l'onboarding.",
      aiTitle: "AI CFO avec Gemini 3.5",
      aiDesc: "Une intelligence financière qui ausculte vos indicateurs clés, évalue votre rentabilité réelle, signale les anomalies opérationnelles et prévient la fraude sans intervention humaine."
    },
    liveDemo: {
      title: "Simulation Interactive ERP de FinOps",
      subtitle: "Visualisez en temps réel l'orchestration financière d'une chaîne multi-succursales d'envergure nationale.",
      metricsTitle: "Métriques en Direct de l'ERP",
      revenue: "Recettes Globales",
      activeStaff: "Collaborateurs Actifs",
      accuracy: "Précision de Paie",
      qrScans: "Pointages Enregistrés",
      branches: "Succursales Connectées",
      backBtn: "Retourner au site"
    },
    pricing: {
      title: "Un pricing transparent adapté à votre croissance",
      subtitle: "Aucun frais caché. Commencez gratuitement avec une succursale locale, escaladez vers le multi-site unifié lorsque vous êtes prêt.",
      monthly: "/ mois",
      starterName: "Starter Local",
      starterPrice: "0 HTG",
      starterTarget: "Pour les petites équipes et commerces locaux.",
      businessName: "Business Croissance",
      businessPrice: "2 500 HTG",
      businessTarget: "Pour les PME établies exigeant des calculs de cotisations légaux.",
      enterpriseName: "Enterprise Multi-Site",
      enterprisePrice: "Sur mesure",
      enterpriseTarget: "Pour les chaînes, franchises et organisations complexes multisites.",
      premiumGate: "Fonctionnalité réservée aux plans supérieurs. Veuillez passer à un forfait Business ou Enterprise pour déverrouiller.",
      upgradePrompt: "Mise à niveau requise",
      ctaStart: "Commencer FinOps",
      ctaContact: "Contacter les ventes",
      saasPricingTitle: "Tarification SaaS Flexible",
      htgLabel: "HTG",
      usdLabel: "USD",
      popular: "Populaire",
      warrantyTitle: "Garantie 1 an",
      warrantyDesc: "Inclus avec support technique"
    },
    enterprise: {
      title: "FinOps pour les Grandes Entreprises",
      subtitle: "Une résilience éprouvée en production avec gestion des échecs réseau, chiffrement complet et audit forensic.",
      securityTitle: "Piste d'Audit Forensic",
      securityDesc: "Technologie de journalisation immuable. Chaque check-in, correction manuelle, virement ou écriture est scellé cryptographiquement pour bloquer toute fraude.",
      slaTitle: "Mode Synchro Offline-First",
      slaDesc: "Vos bornes et terminaux fonctionnent sans connexion Internet grâce à notre file d'attente d'événements locale robuste. Synchronisation automatique dès le rétablissement du réseau.",
      customTitle: "Soutien Caribéen Direct",
      customDesc: "Ingénieurs dédiés basés localement pour paramétrer vos règles d'entreprise complexes et garantir une intégration harmonieuse.",
      flowTitle: "Orchestration de Synchronisation Offline-First fX",
      step1Title: "1. BORNE KIODE QR",
      step1Desc: "Eskanè badj san fil",
      step1Sub: "Génération jeton local",
      step2Title: "2. ÉVÉNEMENT LOCAL BUFFERISÉ",
      step2Desc: "Stockage direct indexé IndexedDB",
      step2Sub: "Résistance aux coupures",
      step3Title: "3. SERVEUR CLOUD RUN",
      step3Desc: "Dépôt dans le Grand Livre ERP",
      step3Sub: "Consolidation immuable",
      ctaTitle: "Besoin d'une démonstration personnalisée de l'infrastructure ?",
      ctaDesc: "Discutez avec nos FinTech UX Strategists de l'architecture fX Déterministe et de nos options d'hébergement privatif.",
      ctaContact: "Contacter les ventes",
      ctaDemo: "Voir la démo de paie"
    },
    contactSales: {
      back: "Retour",
      branding: "FinOps Enterprise Solutions",
      title: "Passez à la vitesse supérieure",
      subtitle: "Notre équipe d'ingénierie et d'architectes FinTech vous accompagne pour migrer vos anciens fichiers Excel ou registres physiques vers la conformité de notre plateforme unifiée.",
      supportTitle: "Soutien Commercial Direct",
      supportDesc: "+509 3804-0010 // contact@finops.tekpounou",
      auditTitle: "Audit d'Onboarding Inclus",
      auditDesc: "Un consultant FinOps configure vos règles de pénalités, d'heures supplémentaires, et paramètre vos premières quinzaines.",
      formTitle: "Formulaire d'information",
      name: "Nom Complet",
      email: "Email Professionnel",
      phone: "Téléphone de Contact",
      company: "Raison Sociale Entreprise",
      teamSize: "Taille du Personnel estimée",
      message: "Message optionnel / Besoins particuliers",
      submit: "Transmettre ma demande",
      submitting: "Enregistrement...",
      successTitle: "Demande enregistrée avec succès !",
      successDesc: (name: string, email: string) => `Merci ${name}. Un spécialiste FinOps prendra contact avec vous par courriel à ${email} sous 2 heures ouvrables pour planifier votre séance d'audit d'onboarding.`,
      backBtn: "Retourner au site principal"
    }
  },
  ht: {
    hero: {
      title1: "Pilote konpayi ou.",
      title2: "Otomatize peman ou.",
      title3: "Grenn erè zero.",
      subtitle: "Premye platfòm Fintech ERP ki fèt espesyalman pou PME an Ayiti ak nan Karayib la. Rasanble tout ekip ou yo, tout sikisal yo, pwentaj QR, peman kinzèn, gran liv finansye ak djanm AI nan yon sèl kote.",
      ctaPrimary: "Kòmanse ak Finops",
      ctaSecondary: "Gade kijan sistèm lan mache",
      trustFast: "Konfigirasyon rapid",
      trustCompliance: "Konfòm ak lalwa CNSS / CNS",
      trustQr: "Kiosk QR entegre",
      trustNoCard: "Pa bezwen kat kredi",
      trustBranches: "Mache pou plizyè sikisal"
    },
    features: {
      sectionTitle: "Sistèm operasyonèl total pou konpayi modèn yo",
      sectionSubtitle: "FinTech ki pi avanse, konstwi pou bezwen ak rezo biznis yo an Ayiti.",
      qrTitle: "Pwentaj QR Entelijan",
      qrDesc: "Anplwaye yo jis eskane badj yo sou telefòn oubyen yon tablèt. FinOps kalkile otomatikman: reta yo, kantite lè yo travay tout bon, ak penalite yo san pèdi tan.",
      payrollTitle: "Kalkil Paie Ayisyen nèt al kole",
      payrollDesc: "Fè kalkil kinzèn san tèt chaje: kalkil CNSS (6%), CNS (2%), komisyon sou vant, vòl ak avans ki te pran, ansanm ak fich peman PDF ki klè nèt.",
      ledgerTitle: "Gran Liv ERP & Dèt yo",
      ledgerDesc: "Swiv lajan k ap antre, lajan k ap soti, ak dèt anplwaye yo otomatikman. Kat pwentaj la ak peman yo makonnen dirèkteman ak kontab la.",
      aiTitle: "AI CFO avèk Gemini 3.5",
      aiDesc: "Gemini ap analize pou ou: konbyen benefis ou fè, kote ki gen gaspiyaj, si gen sispèk fraud, ak kisa pou w korije pou w fè plis lajan."
    },
    liveDemo: {
      title: "Gade Kijan FinOps Travay",
      subtitle: "Swiv an dirèk operasyon yon biznis ki gen plizyè sikisal k ap fonksyone nan peyi a.",
      metricsTitle: "Done an Dirèk depi nan ERP a",
      revenue: "Revni Konpayi an",
      activeStaff: "Anplwaye Aktiv yo",
      accuracy: "Presizyon Kalkil la",
      qrScans: "Kantite Pwentaj QR",
      branches: "Sikisal ki Konekte",
      backBtn: "Tounen sou sit la"
    },
    pricing: {
      title: "Plan pri ki klè pou tout nivo biznis",
      subtitle: "Pa gen okenn frè kache. Kòmanse gratis nèt ak premye sikisal ou, epi chanje plan lè biznis ou ap grandi.",
      monthly: "/ mwa",
      starterName: "Starter Lokal",
      starterPrice: "0 HTG",
      starterTarget: "Pou ti biznis ak boutik k ap kòmanse.",
      businessName: "Business Croissance",
      businessPrice: "2 500 HTG",
      businessTarget: "Pou PME ki vle kalkile CNSS ak taks legal yo kòrèkteman.",
      enterpriseName: "Enterprise Multi-Site",
      enterprisePrice: "Pri Customized",
      enterpriseTarget: "Pou gwo konpayi, franchiz, ak biznis ki gen anpil lokal.",
      premiumGate: "Seksyon sa rezève pou plan ki pi wo yo. Tanpri chwazi yon plan Business oubyen Enterprise pou debloke li.",
      upgradePrompt: "Chanje Forfè w la",
      ctaStart: "Kòmanse FinOps",
      ctaContact: "Pale ak ekip nou an",
      saasPricingTitle: "Pricing SaaS fleksib",
      htgLabel: "HTG",
      usdLabel: "USD",
      popular: "Popilè",
      warrantyTitle: "Garantie 1 an",
      warrantyDesc: "Enkli ak sipò teknik"
    },
    enterprise: {
      title: "Solisyon pou Gwo Konpayi yo",
      subtitle: "Gwo djanm sekirite, deteksyon offline lè pa gen rezo, ak odit forensic pou pi gwo konfyans.",
      securityTitle: "Liv Audit Forensic",
      securityDesc: "Nenpòt pwentaj, chanjman manyèl, oubyen tranzaksyon siyen ak yon kle sekirite ki anpeche okenn moun vòlè oubyen modifye done yo.",
      slaTitle: "Fonksyon Offline-First djanm",
      slaDesc: "Eskanè QR ou a ap travay menm lè pa gen entènèt. Lè rezo a tounen, done yo senkronize otomatikman san anyen pa pèdi.",
      customTitle: "Sipò Lokal 24/7",
      customDesc: "Ekip enjenyè nou yo pare pou ede ou konstwi règ jesyon pa w la epi asire sistèm nan adapte ak biznis ou.",
      flowTitle: "Orchestration Synkronizasyon Offline-First fX",
      step1Title: "1. BORNE KIODE QR",
      step1Desc: "Eskanè badj san fil",
      step1Sub: "Jenerasyon jeton lokal",
      step2Title: "2. EVÈNMAN LOKAL BUFFERIZE",
      step2Desc: "Depo dirèk indexé IndexedDB",
      step2Sub: "Rezistans kont koupe rezo",
      step3Title: "3. SÈVÈ CLOUD RUN",
      step3Desc: "Depoze nan Gran Liv ERP",
      step3Sub: "Konsolidasyon imètab",
      ctaTitle: "Èske ou bezwen yon demonstrasyon pèsonalize sou infrastrikti a?",
      ctaDesc: "Pale ak FinTech UX Strategists nou yo sou Achitekti fX Detèminist ak opsyon hébergement prive nou yo.",
      ctaContact: "Kontakte lavant",
      ctaDemo: "Gade demo peman an"
    },
    contactSales: {
      back: "Retounen",
      branding: "FinOps Enterprise Solutions",
      title: "Pran yon lòt vitès",
      subtitle: "Ekip enjenyè ak achitèk FinTech nou yo la pou ede w transfere ansyen fichye Excel oswa rejis fizik ou yo sou platfòm nou an ki konfòm ak tout lalwa.",
      supportTitle: "Sipò Komèsyal Dirèk",
      supportDesc: "+509 3804-0010 // contact@finops.tekpounou",
      auditTitle: "Odit Onboarding Enkliz",
      auditDesc: "Yon konsiltan FinOps ap konfigire penalite, lè siplemantè, ak premye kinzèn ou yo.",
      formTitle: "Fòmilè enfòmasyon",
      name: "Non konplè",
      email: "Imèl pwofesyonèl",
      phone: "Telefòn kontak",
      company: "Non konpayi",
      teamSize: "Kantite anplwaye",
      message: "Mesaj opsyonèl / Bezwen espesyal",
      submit: "Voye demann mwen an",
      submitting: "Ap anrejistre...",
      successTitle: "Demann anrejistre avèk siksè !",
      successDesc: (name: string, email: string) => `Mèsi ${name}. Yon espesyalis FinOps ap kontakte w pa imèl nan ${email} nan mwens pase 2 zèdtan pou planifye odit onboarding ou a.`,
      backBtn: "Tounen sou sit la"
    }
  },
  en: {
    hero: {
      title1: "Drive your business.",
      title2: "Automate your payroll.",
      title3: "Zero errors.",
      subtitle: "The premier Fintech ERP designed for SMEs in Haiti and the Caribbean. Centralize your team, branches, QR attendance clock, quinzaine payroll, secure general ledger, and smart AI CFO insights into a unified workspace.",
      ctaPrimary: "Start with Finops",
      ctaSecondary: "View Live ERP Demo",
      trustFast: "Instant setup",
      trustCompliance: "CNSS / CNS Compliant",
      trustQr: "Integrated QR Clock",
      trustNoCard: "No credit card required",
      trustBranches: "Supports multi-branches"
    },
    features: {
      sectionTitle: "The complete operational system for modern SMEs",
      sectionSubtitle: "Next-gen fintech built for high compliance, secure audit logs, and resilience in offline environments.",
      qrTitle: "Smart QR Attendance",
      qrDesc: "Employees check-in using their secured QR badge at physical terminals. FinOps calculates hours, late arrivals, variances, and payroll deductions automatically.",
      payrollTitle: "Localized Payroll Engine",
      payrollDesc: "Automate bi-weekly payroll: automated calculations of 6% CNSS, 2% CNS, commissions, advances, and certified PDF payslips.",
      ledgerTitle: "ERP Ledger & Debts",
      ledgerDesc: "Real-time ledger tracking of company revenue, expenses, balances, and automated employees' debt deduction upon paycheck compilation.",
      aiTitle: "Gemini 3.5 AI CFO",
      aiDesc: "An AI-powered financial expert inspecting your cashflow, profitability trends, potential fraud alarms, and local branch metrics instantly."
    },
    liveDemo: {
      title: "Interactive ERP Playground",
      subtitle: "Simulate live corporate orchestration for a nationwide multi-branch operating franchise.",
      metricsTitle: "Realtime ERP Statistics",
      revenue: "Global Revenue",
      activeStaff: "Active Staff",
      accuracy: "Payroll Precision",
      qrScans: "QR Code Scans",
      branches: "Operating Branches",
      backBtn: "Back to website"
    },
    pricing: {
      title: "Simple, transparent pricing built for growth",
      subtitle: "No hidden fees. Begin free with your single local branch, and scale to unified multi-location operations when ready.",
      monthly: "/ month",
      starterName: "Starter Free",
      starterPrice: "0 HTG",
      starterTarget: "Perfect for micro-SMEs, single shops, and small teams.",
      businessName: "Business Growth",
      businessPrice: "2,500 HTG",
      businessTarget: "For medium-sized growing companies needing legal compliance.",
      enterpriseName: "Enterprise Multi-Site",
      enterprisePrice: "Custom",
      enterpriseTarget: "For franchises, chains, and large multi-branch organizations.",
      premiumGate: "This module requires a higher tiered plan. Please upgrade to a Business or Enterprise package to unlock access.",
      upgradePrompt: "Subscription Upgrade Required",
      ctaStart: "Get Started Free",
      ctaContact: "Contact Sales",
      saasPricingTitle: "Flexible SaaS Pricing",
      htgLabel: "HTG",
      usdLabel: "USD",
      popular: "Popular",
      warrantyTitle: "1-year Warranty",
      warrantyDesc: "Includes technical support"
    },
    enterprise: {
      title: "FinOps Enterprise Solutions",
      subtitle: "Robust event sourcing, multi-tenant databases, offline failover queues, and secure forensic logging.",
      securityTitle: "Immutable Forensic Trails",
      securityDesc: "Every check-in, manual adjustment, or ledger entry yields signed events, preventing physical modifications or financial tampering.",
      slaTitle: "Offline-First Sync Engine",
      slaDesc: "Physical kiosks track logs without an active internet connection, automatically flushing local buffers back to Cloud Run when network re-establishes.",
      customTitle: "Dedicated On-Site Engineering",
      customDesc: "Our regional solutions division sets up custom operational boundaries and integrates physical tablets at your sites.",
      flowTitle: "Offline-First Synchronization Orchestration",
      step1Title: "1. QR KIOSK TERMINAL",
      step1Desc: "Wireless badge scanning",
      step1Sub: "Local token generation",
      step2Title: "2. BUFFERED LOCAL EVENT",
      step2Desc: "Direct storage via IndexedDB",
      step2Sub: "Resilience against outages",
      step3Title: "3. CLOUD RUN SERVER",
      step3Desc: "Deposit into ERP General Ledger",
      step3Sub: "Immutable consolidation",
      ctaTitle: "Need a personalized infrastructure demonstration?",
      ctaDesc: "Talk to our FinTech UX Strategists about fX Deterministic architecture and our private hosting options.",
      ctaContact: "Contact Sales",
      ctaDemo: "See payroll demo"
    },
    contactSales: {
      back: "Back",
      branding: "FinOps Enterprise Solutions",
      title: "Go to the next level",
      subtitle: "Our FinTech engineering and architectural team will assist you in migrating your legacy Excel files or physical registers to the compliance of our unified platform.",
      supportTitle: "Direct Sales Support",
      supportDesc: "+509 3804-0010 // contact@finops.tekpounou",
      auditTitle: "Onboarding Audit Included",
      auditDesc: "A FinOps consultant will configure your penalty rules, overtime, and set up your first pay periods.",
      formTitle: "Information form",
      name: "Full Name",
      email: "Professional Email",
      phone: "Contact Phone",
      company: "Company Name",
      teamSize: "Estimated staff size",
      message: "Optional message / special needs",
      submit: "Submit my request",
      submitting: "Recording...",
      successTitle: "Request recorded successfully!",
      successDesc: (name: string, email: string) => `Thank you ${name}. A FinOps specialist will contact you via email at ${email} within 2 business hours to schedule your onboarding audit session.`,
      backBtn: "Back to main site"
    }
  }
};
