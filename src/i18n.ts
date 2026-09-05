import { createContext, useContext, useState, useEffect } from "react";
import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

// Languages supported: Français, Kreyòl Ayisyen, English
export type Language = "fr" | "ht" | "en";

export interface TranslationSchema {
  navigation: {
    dashboard: string;
    personnel: string;
    attendance: string;
    payroll: string;
    ledger: string;
    forensic: string;
    reliability: string;
    settings: string;
    language: string;
    roleSelector: string;
    tenantSelector: string;
    logout: string;
    bi: string;
    notifications: string;
    health: string;
    recovery: string;
    aicfo: string;
    employeeSpace: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    totalRevenue: string;
    totalExpenses: string;
    staffCount: string;
    activeToday: string;
    profitability: string;
    recentActivity: string;
    ledgerBalance: string;
    syncStatus: string;
    branchPerformance: string;
    eventsTreated: string;
    gourdes: string;
    employees: string;
    viewAll: string;
  };
  payroll: {
    title: string;
    cycleSelect: string;
    quinzaineRange: string;
    grossSalary: string;
    cnssDeduction: string;
    cnsDeduction: string;
    commissions: string;
    advancesTreated: string;
    netPaid: string;
    status: string;
    lockCycle: string;
    validatePayroll: string;
    lockedStatus: string;
    immutableNotice: string;
    successLocked: string;
    fixedModel: string;
    commissionModel: string;
    hybridModel: string;
    model: string;
    action: string;
  };
  attendance: {
    title: string;
    kioskTitle: string;
    scanQRHelp: string;
    employeeSelect: string;
    checkInBtn: string;
    checkOutBtn: string;
    hoursPlanned: string;
    hoursReal: string;
    variance: string;
    status: string;
    manualAdjustment: string;
    reasonPlaceholder: string;
    saveBtn: string;
    normalStatus: string;
    lateStatus: string;
    absentStatus: string;
    overtimeStatus: string;
    pendingStatus: string;
    statusCol: string;
    employeeCol: string;
    dateCol: string;
    checkInCol: string;
    checkOutCol: string;
    hoursWorkedCol: string;
    varianceCol: string;
    approvedByCol: string;
    actionsCol: string;
    noRecordFound: string;
    systemLabel: string;
    adjustBtn: string;
    restrictedLabel: string;
    hoursLabelMobile: string;
  };
  ledger: {
    title: string;
    addTransaction: string;
    typeLabel: string;
    income: string;
    expense: string;
    advance: string;
    amount: string;
    description: string;
    category: string;
    selectEmployee: string;
    submitBtn: string;
    recentTx: string;
    immutableAuditHeader: string;
    signer: string;
    noUpdateNotice: string;
    gourdes: string;
  };
  notifications: {
    authSuccess: string;
    authFailed: string;
    unauthorized: string;
    eventReplayed: string;
    dlqCleared: string;
    payrollLockedMessage: string;
    ledgerAddedSuccess: string;
    attendanceSaved: string;
  };
  organization: {
    title: string;
    businessName: string;
    nif: string;
    branches: string;
    departments: string;
    addNewBranch: string;
    branchName: string;
    branchLocation: string;
    saveBranch: string;
    addNewDept: string;
    deptName: string;
    saveDept: string;
    assignDept: string;
    empName: string;
    selectBranch: string;
    selectDept: string;
    assignBtn: string;
    invitationsTitle: string;
    inviteEmail: string;
    inviteRole: string;
    sendInviteBtn: string;
    inviteStatus: string;
    roleLabel: string;
    authTitle: string;
    loginBtn: string;
    googleLoginBtn: string;
    emailLabel: string;
    passLabel: string;
    unauthorizedMsg: string;
    onboardingCompleteMsg: string;
  };
  reliability: {
    title: string;
    eventOrchestrator: string;
    dlqTitle: string;
    eventsList: string;
    replayBtn: string;
    replayAllBtn: string;
    compensationTable: string;
    idempotentNotice: string;
    retryCount: string;
    processedStatus: string;
    failedStatus: string;
    dlqStatus: string;
    replayedStatus: string;
  };
  settings: {
    title: string;
    searchPlaceholder: string;
    profile: string;
    currentRole: string;
    switchPrompt: string;
    networkSimTitle: string;
    onlineStatus: string;
    offlineStatus: string;
    simulateOffline: string;
    goOnline: string;
    sandboxDesc: string;
    resetDatabase: string;
  };
  leave: {
    title: string;
    requestBtn: string;
    approveBtn: string;
    rejectBtn: string;
    typeLabel: string;
    statusLabel: string;
    remainingLabel: string;
    reasonPlaceholder: string;
    successCreated: string;
    successApproved: string;
  };
  planning: {
    title: string;
    teamSelect: string;
    shiftTime: string;
    assignedBranch: string;
    saveSchedule: string;
    successScheduled: string;
    realtimeOps: string;
    activeRollover: string;
    clockInQrBtn: string;
    aiAutoPlanBtn: string;
    massImportBtn: string;
    newShiftBtn: string;
    copyWeekBtn: string;
    exportExcelBtn: string;
    exportPdfBtn: string;
    qrAttendanceTitle: string;
    qrBadgeScannedAlert: string;
    presentBadgeInstructions: string;
  };
  documents: {
    title: string;
    uploadContract: string;
    contractType: string;
    salaryBase: string;
    generatePdf: string;
    statusActive: string;
    fileUrl: string;
  };
}

export const translations: Record<Language, TranslationSchema> = {
  fr: {
    navigation: {
      dashboard: "Tableau de Bord",
      personnel: "Personnel (HR)",
      attendance: "Pointage Kiosk",
      payroll: "Paie Quinzaine",
      ledger: "Grand Livre",
      forensic: "Forensic Audit",
      reliability: "Résilience & DLQ",
      settings: "Paramètres",
      language: "Langue",
      roleSelector: "Rôle de Session",
      tenantSelector: "Entreprise Multi-Tenant",
      logout: "Déconnexion",
      bi: "Analyse d'Entreprise",
      notifications: "Alerte & Intel",
      health: "Santé du Système",
      recovery: "Restauration Catastrophe",
      aicfo: "Assistant CFO Gemini",
      employeeSpace: "Mon Espace",
    },
    dashboard: {
      title: "FinOps CFO de Tek Pou Nou",
      subtitle: "Gestion ERP financière intelligente et audit de conformité immuable pour Haïti",
      totalRevenue: "Recettes Totales",
      totalExpenses: "Dépenses Totales",
      staffCount: "Personnel Actif",
      activeToday: "Présences Aujourd'hui",
      profitability: "Marge Bénéficiaire",
      recentActivity: "Flux d'Événements Récents",
      ledgerBalance: "Solde de Caisse",
      syncStatus: "Statut Synchro Offline",
      branchPerformance: "Performance des Succursales (Gourdes)",
      eventsTreated: "Événements Traités",
      gourdes: "HTG",
      employees: "employés",
      viewAll: "Voir tous",
    },
    payroll: {
      title: "Moteur de Paie Quinzaine",
      cycleSelect: "Cycle de Paie Actif",
      quinzaineRange: "Date de Quinzaine",
      grossSalary: "Salaire Brut",
      cnssDeduction: "CNSS (6% Part Patronale/Employé)",
      cnsDeduction: "CNS (2% Sécurité)",
      commissions: "Commissions",
      advancesTreated: "Avances Déduites",
      netPaid: "Net Versé (HTG)",
      status: "Statut",
      lockCycle: "Verrouiller le Cycle (Quinzaine)",
      validatePayroll: "Valider la Paie",
      lockedStatus: "CADENASSÉ & IMMUABLE",
      immutableNotice: "Attention: Une fois verrouillée, la paie de cette quinzaine ne peut plus être modifiée et est scellée dans le journal forensic.",
      successLocked: "La paie de la quinzaine a été validée et enregistrée cryptographiquement !",
      fixedModel: "Fixe",
      commissionModel: "Commission",
      hybridModel: "Hybride",
      model: "Modèle",
      action: "Opération",
    },
    attendance: {
      title: "Pointage de Présences & Heures",
      kioskTitle: "Borne de Pointage QR (Kiosk Intelligent)",
      scanQRHelp: "Sélectionnez un employé pour simuler le scan de son QR Code d'identité à la borne d'entrée/sortie.",
      employeeSelect: "Choisir un Employé",
      checkInBtn: "Pointer ARRIVÉE (Check-In)",
      checkOutBtn: "Pointer DÉPART (Check-Out)",
      hoursPlanned: "Heures Planifiées",
      hoursReal: "Heures Réelles",
      variance: "Écart de Pointage",
      status: "État",
      manualAdjustment: "Ajustement Manuel (Audité)",
      reasonPlaceholder: "Motif obligatoire de la correction manuelle...",
      saveBtn: "Valider l'ajustement",
      normalStatus: "Normal",
      lateStatus: "En Retard",
      absentStatus: "Absent",
      overtimeStatus: "Heures Sup",
      pendingStatus: "À Vérifier",
      statusCol: "Statut",
      employeeCol: "Employé",
      dateCol: "Date",
      checkInCol: "Heure Entrée",
      checkOutCol: "Heure Sortie",
      hoursWorkedCol: "Heures Travaillées",
      varianceCol: "Variance (Retard/Sup)",
      approvedByCol: "Validé Par",
      actionsCol: "Actions",
      noRecordFound: "Aucun pointage trouvé pour cette sélection.",
      systemLabel: "SYSTÈME",
      adjustBtn: "Ajuster",
      restrictedLabel: "Lock",
      hoursLabelMobile: "Heures:",
    },
    ledger: {
      title: "Grand Livre ERP : Livre de Comptes",
      addTransaction: "Ajouter une Transaction Événementielle",
      typeLabel: "Type de Mouvement",
      income: "Entrée (Revenu)",
      expense: "Sortie (Dépense/Achat)",
      advance: "Avance sur Salaire",
      amount: "Montant (HTG - Entier)",
      description: "Description de la transaction",
      category: "Catégorie Financière",
      selectEmployee: "Associer à un employé (Optionnel)",
      submitBtn: "Enregistrer Immuablement",
      recentTx: "Journal Temporel Mandataire (Transactions Immutables)",
      immutableAuditHeader: "Contrôle Forensic Actif",
      signer: "Signataire de l'Événement",
      noUpdateNotice: "Toute correction s'effectue exclusivement par des transactions de compensation. Aucune suppression n'est autorisée.",
      gourdes: "HTG",
    },
    notifications: {
      authSuccess: "Connexion réussie au locataire.",
      authFailed: "Authentification rejetée.",
      unauthorized: "Accès refusé pour ce rôle.",
      eventReplayed: "Événement rejoué avec succès depuis la file DLQ !",
      dlqCleared: "DLQ vidée avec succès.",
      payrollLockedMessage: "Cycle de paie verrouillé définitivement.",
      ledgerAddedSuccess: "Transaction enregistrée du Grand Livre.",
      attendanceSaved: "Pointage enregistré avec succès.",
    },
    organization: {
      title: "Structure de l'Organisation",
      businessName: "Raison Sociale de l'Entreprise",
      nif: "NIF de l'Établissement",
      branches: "Succursales (Multi-Locations)",
      departments: "Départements",
      addNewBranch: "Ajouter une Succursale",
      branchName: "Nom de la succursale",
      branchLocation: "Adresse physique",
      saveBranch: "Créer Succursale",
      addNewDept: "Créer un Département",
      deptName: "Nom du département",
      saveDept: "Créer Département",
      assignDept: "Assigner Département à la Succursale",
      empName: "Nom du Personnel",
      selectBranch: "Sélectionner la Succursale",
      selectDept: "Sélectionner le Département",
      assignBtn: "Mettre à jour la structure de l'employé",
      invitationsTitle: "Système d'Invitations d'Onboarding (RBAC)",
      inviteEmail: "Email du destinataire",
      inviteRole: "Rôle assigné (RBAC)",
      sendInviteBtn: "Générer & Envoyer l'Invitation",
      inviteStatus: "Statut d'Onboarding de l'Invitation",
      roleLabel: "Rôle de session",
      authTitle: "Portail d'Authentification Unifié & Onboarding FinOps",
      loginBtn: "Se connecter avec Email",
      googleLoginBtn: "Continuer avec Google",
      emailLabel: "Adresse Email d'Entreprise",
      passLabel: "Mot de passe",
      unauthorizedMsg: "⚠️ Erreur de privilèges : Rôle insuffisant pour modifier la structure.",
      onboardingCompleteMsg: "Félicitations ! Votre invitation a été auto-liée, rôle et succursale rattachés avec succès.",
    },
    reliability: {
      title: "Orchestration & Compensation des Événements",
      eventOrchestrator: "Orchestre fX (Deterministic Reliability Layer)",
      dlqTitle: "File d'Échecs - Dead Letter Queue (DLQ)",
      eventsList: "Flux Total des Événements (Idempotent Logs)",
      replayBtn: "Rejouer (Retry)",
      replayAllBtn: "Tout Rejouer",
      compensationTable: "Historique Forensique de Compensation",
      idempotentNotice: "Chaque action critique génère un événement signé. En cas d'échec de synchronisation offline, l'événement est sérialisé et routé vers le tampon local.",
      retryCount: "Tentatives",
      processedStatus: "Traité",
      failedStatus: "Échoué",
      dlqStatus: "Dans DLQ",
      replayedStatus: "Rétabli",
    },
    settings: {
      title: "Paramètres",
      searchPlaceholder: "Rechercher un paramètre...",
      profile: "Utilisateur Actif",
      currentRole: "Rôle de Session Actuel",
      switchPrompt: "Sélectionnez un rôle pour simuler les restrictions d'accès du système multi-tenant.",
      networkSimTitle: "Simulateur Mode Offline-First",
      onlineStatus: "Réseau en Ligne (Sync Directe)",
      offlineStatus: "Mode Hors-ligne (Stockage Indéterminé Local)",
      simulateOffline: "Couper Connexion (Force Offline)",
      goOnline: "Rétablir Connexion (Force Sync Queue)",
      sandboxDesc: "Rôles dispo: OWNER (Accès total), MANAGER (Branche locale), SUPERVISOR (Consultation), EMPLOYEE (Libre-Service simple).",
      resetDatabase: "Réinitialiser la Base d'Événements",
    },
    leave: {
      title: "Gestion des Congés & Absences",
      requestBtn: "Demander un Congé",
      approveBtn: "Approuver le congé",
      rejectBtn: "Rejeter le congé",
      typeLabel: "Type de congé",
      statusLabel: "État de la demande",
      remainingLabel: "Solde de congés restant",
      reasonPlaceholder: "Motif ou raison de l'absence...",
      successCreated: "Votre demande de congé a été enregistrée conformement.",
      successApproved: "Le congé a été approuvé et loggé forensic-ready.",
    },
    planning: {
      title: "Planning & Gestion des Shifts",
      teamSelect: "Agent de l'Équipe",
      shiftTime: "Horaire de Shift",
      assignedBranch: "Succursale assignée",
      saveSchedule: "Enregistrer l'horaire",
      successScheduled: "Plannification de shift enregistrée et répliquée.",
      realtimeOps: "Opérations en temps réel • Sync Payroll Active • Moteur de Détection de Conflits •",
      activeRollover: "Auto-Reconduction Activée",
      clockInQrBtn: "Clock-in QR",
      aiAutoPlanBtn: "IA Auto-Planifier",
      massImportBtn: "Import Massif",
      newShiftBtn: "Nouveau Tour",
      copyWeekBtn: "Copier Semaine",
      exportExcelBtn: "Export Excel",
      exportPdfBtn: "Export PDF",
      qrAttendanceTitle: "Pointage via QR (Shifts)",
      qrBadgeScannedAlert: "Badge scanné : {code} - Heure de pointage enregistrée.",
      presentBadgeInstructions: "Présentez le badge employé devant la caméra pour confirmer la prise de poste.",
    },
    documents: {
      title: "Gestion Immobilière des Documents CNC",
      uploadContract: "Souscrire un contrat local",
      contractType: "Catégorie de contrat",
      salaryBase: "Salaire d'engagement",
      generatePdf: "Générer le PDF Mandataire",
      statusActive: "En vigueur",
      fileUrl: "Lien d'archivage Cloud",
    },
  },
  ht: {
    navigation: {
      dashboard: "Tablo Kid",
      personnel: "Anplwaye (HR)",
      attendance: "Pwentaj Kiosk",
      payroll: "Peman Kinzèn",
      ledger: "Gran Liv",
      forensic: "Forensic Audit",
      reliability: "Rezilans & DLQ",
      settings: "Paramèt",
      language: "Lang",
      roleSelector: "Wòl sesyon",
      tenantSelector: "Konpayi Multi-Tenant",
      logout: "Dekonekte",
      bi: "Analiz Antrepriz",
      notifications: "Alèt ak Intel",
      health: "Sante Sistèm nan",
      recovery: "Sove Done / Katastwòf",
      aicfo: "Asistan CFO Gemini",
      employeeSpace: "Espas Mwen",
    },
    dashboard: {
      title: "FinOps CFO de Tek Pou Nou",
      subtitle: "Jesyon ERP finansye entelijan ak odit konfòmite imuiab pou Ayiti",
      totalRevenue: "Revni Total",
      totalExpenses: "Depans Total",
      staffCount: "Anplwaye ki Aktiv",
      activeToday: "Prezans Jodi a",
      profitability: "Marge Benefis",
      recentActivity: "Dènye Evènman ki Pase",
      ledgerBalance: "Sol de Kès",
      syncStatus: "Estati Offline Synchro",
      branchPerformance: "Rendman Sikisal yo (Gourdes)",
      eventsTreated: "Evènman ki Trete",
      gourdes: "HTG",
      employees: "moun",
      viewAll: "Gade tout",
    },
    payroll: {
      title: "Motè Peman Kinzèn",
      cycleSelect: "Sik Peman ki Aktiv",
      quinzaineRange: "Dat Kinzèn nan",
      grossSalary: "Salè Brit",
      cnssDeduction: "CNSS (6% Pati Patwon/Anplwaye)",
      cnsDeduction: "CNS (2% Sekirite)",
      commissions: "Komisyon yo",
      advancesTreated: "Avans ki Dedui",
      netPaid: "Nèt Peye (HTG)",
      status: "Estati",
      lockCycle: "Kadenase Sik la (Kinzèn)",
      validatePayroll: "Valide Peman an",
      lockedStatus: "KADENASE & IMUIAB",
      immutableNotice: "Atansyon: Yon fwa li kadenase, peman pou kinzèn sa pa ka chanje ankò epi li anrejistre nan liv forensic la san chanjman.",
      successLocked: "Peman kinzèn nan valide ak siyen kòrèkteman !",
      fixedModel: "Fiks",
      commissionModel: "Komisyon",
      hybridModel: "Ibrid",
      model: "Modèl",
      action: "Operasyon",
    },
    attendance: {
      title: "Pwentaj Kontwòl Lè",
      kioskTitle: "Kiosk QR Pwentaj (Sistèm Entelijan)",
      scanQRHelp: "Chwazi yon anplwaye pou wè kijan pwentaj QR la ap mache lè l ap antre oswa l ap soti.",
      employeeSelect: "Chwazi yon Anplwaye",
      checkInBtn: "PwenTE ANTREE (Check-In)",
      checkOutBtn: "PwenTE SOTI (Check-Out)",
      hoursPlanned: "Lè ki te Planifye",
      hoursReal: "Lè li Reyèlman Travay",
      variance: "Diferans Lè",
      status: "Kondisyon",
      manualAdjustment: "Ajisteman Manyèl (Ak Odit)",
      reasonPlaceholder: "Ekri rezon ki fè gen chanjman manyèl sa...",
      saveBtn: "Valide chanjman an",
      normalStatus: "Nòmal",
      lateStatus: "An Reta",
      absentStatus: "Absan",
      overtimeStatus: "Lè siplemantè",
      pendingStatus: "Pou verifye",
      statusCol: "Estati",
      employeeCol: "Anplwaye",
      dateCol: "Dat",
      checkInCol: "Lè li Antre",
      checkOutCol: "Lè li Soti",
      hoursWorkedCol: "Lè li Travay",
      varianceCol: "Diferans Lè",
      approvedByCol: "Validasyon",
      actionsCol: "Aksyon yo",
      noRecordFound: "Pa gen okenn pwentaj yo jwenn pou seleksyon sa a.",
      systemLabel: "SISTÈM",
      adjustBtn: "Ajiste",
      restrictedLabel: "Bloke",
      hoursLabelMobile: "Lè:",
    },
    ledger: {
      title: "Gran Liv ERP : Kont ak Tranzaksyon",
      addTransaction: "Ajoute yon Tranzaksyon nan Liv la",
      typeLabel: "Jan de Mouvman",
      income: "Revni (Lajan ki Antre)",
      expense: "Depans (Lajan ki Soti)",
      advance: "Avans sou Salè",
      amount: "Kantite Lajan (HTG - Nonb Entye)",
      description: "Sa ki te fèt la",
      category: "Kategori Finansye",
      selectEmployee: "Konekte ak yon anplwaye (Si genyen)",
      submitBtn: "Anrejistre pou Toujou",
      recentTx: "Istorik Tranzaksyon ki Siyen (Imuiab)",
      immutableAuditHeader: "Kontwòl Forensic Aktiv",
      signer: "Moun ki Siyen Tranzaksyon an",
      noUpdateNotice: "Nenpòt koreksyon fèt sèlman pa tranzaksyon konpansasyon. Pa gen dwa efase anyen.",
      gourdes: "HTG",
    },
    notifications: {
      authSuccess: "Koneksyon fèt ak siksè !",
      authFailed: "Sistèm nan refize koneksyon sa.",
      unauthorized: "Ou pa gen dwa pou wè pati sa a avèk wòl ou genyen an.",
      eventReplayed: "Evènman an rejoue ak siksè depi nan DLQ !",
      dlqCleared: "Nou vide DLQ a kòrèkteman.",
      payrollLockedMessage: "Sik peman sa a kadenase nèt pou l pa ka chanje.",
      ledgerAddedSuccess: "Tranzaksyon anrejistre nan Gran Liv la.",
      attendanceSaved: "Pwentaj anrejistre ak siksè.",
    },
    organization: {
      title: "Estrikti Konpayi an",
      businessName: "Non Konpayi an",
      nif: "NIF Konpayi an",
      branches: "Sikisal yo (Tout Kote)",
      departments: "Depatman yo",
      addNewBranch: "Ajoute yon Sikisal nèf",
      branchName: "Non sikisal",
      branchLocation: "Adrès kote l ye",
      saveBranch: "Kreye Sikisal",
      addNewDept: "Kreye yon Depatman nèf",
      deptName: "Non Depatman",
      saveDept: "Kreye Depatman",
      assignDept: "Mete Depatman anba yon Sikisal",
      empName: "Non Anplwaye",
      selectBranch: "Chwazi Sikisal",
      selectDept: "Chwazi Depatman",
      assignBtn: "Mete anplwaye nan estrikti a",
      invitationsTitle: "Sistèm Envitasyon Onboarding (RBAC)",
      inviteEmail: "Imel moun nan",
      inviteRole: "Wòl anplwaye (RBAC)",
      sendInviteBtn: "Kreye epi Voye Envitasyon",
      inviteStatus: "Nan ki Eta Envitasyon an ye",
      roleLabel: "Wòl sesyon",
      authTitle: "Pòtay Koneksyon Pwofesyonèl & Envitasyon FinOps",
      loginBtn: "Konekte ak Imel",
      googleLoginBtn: "Continuer avec Google",
      emailLabel: "Adrès Imel Konpayi",
      passLabel: "Modpas sekirite",
      unauthorizedMsg: "⚠️ Ou pa gen dwa : sèlman OWNER ak MANAGER ka chanje estrikti sa a.",
      onboardingCompleteMsg: "Konpliman ! Envitasyon w la konekte otomatikman, wòl ak sikisal anrejistre avèk siksè.",
    },
    reliability: {
      title: "Orkestrasyon Evènman & Rezilans",
      eventOrchestrator: "Orkèst fX (Deterministic Reliability Layer)",
      dlqTitle: "Kès Erè - Dead Letter Queue (DLQ)",
      eventsList: "Tout Evènman yo (Idempotent Logs)",
      replayBtn: "Rejoue",
      replayAllBtn: "Rejoue Tout",
      compensationTable: "Istorik Forensic Konpansasyon",
      idempotentNotice: "Chak aksyon enpòtan kreye yon evènman ki siyen. Si pa gen rezo, li sove nan ti memwa telefòn oswa òdinatè a pou senkronize pita.",
      retryCount: "EsaYE plizyè fwa",
      processedStatus: "Trete kòrèkteman",
      failedStatus: "Echwe",
      dlqStatus: "Nan DLQ",
      replayedStatus: "Repare",
    },
    settings: {
      title: "Paramèt",
      searchPlaceholder: "Chache yon paramèt...",
      profile: "Moun k ap Sèvi an",
      currentRole: "Wòl ou kounye a",
      switchPrompt: "Chwazi yon wòl pou wè kijan sistèm multi-tenant an bloke oswa ouvè dwa aksè.",
      networkSimTitle: "Simulatè Offline-First",
      onlineStatus: "Entènèt konekte (Sync Dirèk)",
      offlineStatus: "Dekonekte (Sove nan òdinatè w)",
      simulateOffline: "Koupe Entènèt (Fors-Offline)",
      goOnline: "Remete Entènèt (Konekte pou senkronize)",
      sandboxDesc: "Dwa: OWNER (Tout bagay), MANAGER (Sikisal pa l sèlman), SUPERVISOR (Gade sèlman), EMPLOYEE (Travay pa l sèlman).",
      resetDatabase: "Remete tout Evènman yo a zewo",
    },
    leave: {
      title: "Jesyon Konje ak Absans yo",
      requestBtn: "Mande yon Konje",
      approveBtn: "Apwouve konje",
      rejectBtn: "Refize konje",
      typeLabel: "Kalite konje",
      statusLabel: "Estati demand lan",
      remainingLabel: "Konje ki rete a",
      reasonPlaceholder: "Rezon ki fè w ap mande konje sa a...",
      successCreated: "Demand konje ou a anrejistre kòrèkteman nan sistèm nan.",
      successApproved: "Konje a apwouve nèt epi siyen nan liv forensic la.",
    },
    planning: {
      title: "Planifikasyon & Chanjman Lè (Shifts)",
      teamSelect: "Chwazi Anplwaye",
      shiftTime: "Lè Travay (Shift)",
      assignedBranch: "Sikisal rache",
      saveSchedule: "Anrejistre orè sa",
      successScheduled: "Planifikasyon orè anrejistre kòrèkteman.",
      realtimeOps: "Operasyon jodi a • Sync Payroll Aktif • Deteksyon konfli lè travay •",
      activeRollover: "Auto-Reconduction Aktif",
      clockInQrBtn: "Pwentaj QR",
      aiAutoPlanBtn: "IA Planifikasyon",
      massImportBtn: "Enpòtasyon Massif",
      newShiftBtn: "Nouvo Shift",
      copyWeekBtn: "Kopye Semèn nan",
      exportExcelBtn: "Fè Excel",
      exportPdfBtn: "Fè PDF",
      qrAttendanceTitle: "Pwentaj pa QR (Shifts)",
      qrBadgeScannedAlert: "Badge eskane: {code} - Lè pwentaj la anrejistre.",
      presentBadgeInstructions: "Mete badge anplwaye a devan kamera a pou valide lè li kòmanse travay la.",
    },
    documents: {
      title: "Jesyon Dokiman & Kontra CNC yo",
      uploadContract: "Kreye yon nouvo kontra",
      contractType: "Jan de kontra",
      salaryBase: "Salè angajman",
      generatePdf: "Générer PDF Kontra",
      statusActive: "Aktif kounye a",
      fileUrl: "Lyen achiv Cloud",
    },
  },
  en: {
    navigation: {
      dashboard: "Dashboard",
      personnel: "Personnel (HR)",
      attendance: "Attendance Kiosk",
      payroll: "Payroll Quinzaine",
      ledger: "Ledger",
      forensic: "Forensic Audit",
      reliability: "Resilience & DLQ",
      settings: "Settings",
      language: "Language",
      roleSelector: "Session Role",
      tenantSelector: "Multi-Tenant Business",
      logout: "Log Out",
      bi: "Business Intelligence",
      notifications: "Intel & Notifications",
      health: "System Health",
      recovery: "Disaster Recovery",
      aicfo: "AI CFO Assistant",
      employeeSpace: "My Workspace",
    },
    dashboard: {
      title: "FinOps AI CFO (Tek Pou Nou)",
      subtitle: "Intelligent ERP & Immutable Forensic Compliance Platform for Haiti",
      totalRevenue: "Total Revenue",
      totalExpenses: "Total Expenses",
      staffCount: "Active Personnel",
      activeToday: "Scanned In Today",
      profitability: "Profit Margin",
      recentActivity: "Recent Event Logs",
      ledgerBalance: "Ledger Balance",
      syncStatus: "Offline-First Status",
      branchPerformance: "Branch Performance (Gourdes)",
      eventsTreated: "Events Processed",
      gourdes: "HTG",
      employees: "employees",
      viewAll: "View all",
    },
    payroll: {
      title: "Quinzaine Payroll Engine",
      cycleSelect: "Active Payroll Cycle",
      quinzaineRange: "Quinzaine Period",
      grossSalary: "Gross Salary",
      cnssDeduction: "CNSS (6% Employer/Employee)",
      cnsDeduction: "CNS (2% Security)",
      commissions: "Commissions",
      advancesTreated: "Advances Settled",
      netPaid: "Net Paid (HTG)",
      status: "Status",
      lockCycle: "Lock Cycle (Quinzaine)",
      validatePayroll: "Validate Payroll",
      lockedStatus: "LOCKED & IMMUTABLE",
      immutableNotice: "Warning: Once locked, the payroll for this quinzaine becomes immutable and is sealed in the forensic audit logs forever.",
      successLocked: "Quinzaine payroll locked and cryptographically signed successfully!",
      fixedModel: "Fixed",
      commissionModel: "Commission",
      hybridModel: "Hybrid",
      model: "Model",
      action: "Operation",
    },
    attendance: {
      title: "Time & Attendance Tracking",
      kioskTitle: "Smart QR Attendance Kiosk",
      scanQRHelp: "Select an employee to simulate scanning their corporate QR identity card at the entry/exit terminal.",
      employeeSelect: "Choose Employee",
      checkInBtn: "Punch CHECK-IN",
      checkOutBtn: "Punch CHECK-OUT",
      hoursPlanned: "Hours Planned",
      hoursReal: "Hours Clocked",
      variance: "Shift Variance",
      status: "Shift Plan Status",
      manualAdjustment: "Audited Manual Overrides",
      reasonPlaceholder: "Mandatory override reason...",
      saveBtn: "Save Overrides",
      normalStatus: "Normal",
      lateStatus: "Late",
      absentStatus: "Absent",
      overtimeStatus: "Overtime",
      pendingStatus: "Pending",
      statusCol: "Status",
      employeeCol: "Employee",
      dateCol: "Date",
      checkInCol: "Check-In Time",
      checkOutCol: "Check-Out Time",
      hoursWorkedCol: "Hours Worked",
      varianceCol: "Variance / Difference",
      approvedByCol: "Approved By",
      actionsCol: "Actions",
      noRecordFound: "No attendance records found for this selection.",
      systemLabel: "SYSTEM",
      adjustBtn: "Adjust",
      restrictedLabel: "Locked",
      hoursLabelMobile: "Hours:",
    },
    ledger: {
      title: "ERP Ledger & Bookkeeping",
      addTransaction: "Log Immutable Transaction Event",
      typeLabel: "Transaction Nature",
      income: "Inflow (Income)",
      expense: "Outflow (Expense)",
      advance: "Employee Salary Advance",
      amount: "Amount (HTG - Whole Number)",
      description: "Transaction details memo",
      category: "Accounting Code Category",
      selectEmployee: "Link to Employee (Optional)",
      submitBtn: "Log Immutably",
      recentTx: "Mandated Ledger Records (Immutable Stream)",
      immutableAuditHeader: "Forensic Integrity Enforced",
      signer: "Event Signatory",
      noUpdateNotice: "Corrections are executed via compensation transactions. Destructive updates or deletes are strictly forbidden.",
      gourdes: "HTG",
    },
    notifications: {
      authSuccess: "Successfully connected to tenant tenant-space.",
      authFailed: "Authentication rejected.",
      unauthorized: "Access denied under current security role permissions.",
      eventReplayed: "Event successfully replayed from DLQ queue!",
      dlqCleared: "DLQ queue successfully cleared.",
      payrollLockedMessage: "Payroll cycle locked successfully and made immutable.",
      ledgerAddedSuccess: "Transaction recorded in the General Ledger.",
      attendanceSaved: "Attendance logged successfully.",
    },
    organization: {
      title: "Organization Structure",
      businessName: "Business Registered Legal Name",
      nif: "National NIF",
      branches: "Operating Branches",
      departments: "Corporate Departments",
      addNewBranch: "Add Operating Branch",
      branchName: "Branch workspace name",
      branchLocation: "Physical address",
      saveBranch: "Add Branch",
      addNewDept: "Create Corporate Department",
      deptName: "Department name",
      saveDept: "Create Department",
      assignDept: "Link Department to Branch",
      empName: "Employee Name",
      selectBranch: "Select Branch",
      selectDept: "Select Department",
      assignBtn: "Assign Employee to Structure",
      invitationsTitle: "Invitation & Onboarding System (RBAC)",
      inviteEmail: "Recipient Professional Email",
      inviteRole: "Assigned RBAC Role",
      sendInviteBtn: "Generate & Dispatch Invitation",
      inviteStatus: "Onboarding Assignment Status",
      roleLabel: "Session Role",
      authTitle: "Unified Auth Portal & Enterprise Onboarding",
      loginBtn: "Sign In with Email",
      googleLoginBtn: "Continue with Google",
      emailLabel: "Active Corporate Email Address",
      passLabel: "Access Password",
      unauthorizedMsg: "⚠️ Security restriction: Insufficient privileges to manipulate structure.",
      onboardingCompleteMsg: "Congratulations! Your invitation has been successfully auto-linked with appropriate role/tenancy details.",
    },
    reliability: {
      title: "Event Orchestration & Compensation",
      eventOrchestrator: "fX Orchestrator (Deterministic Reliability Layer)",
      dlqTitle: "Dead Letter Queue Buffer (DLQ)",
      eventsList: "Total Event Streams (Idempotent Logs)",
      replayBtn: "Replay Event",
      replayAllBtn: "Replay All",
      compensationTable: "Compensating Event Log",
      idempotentNotice: "Every transaction triggers a signed, idempotent event. When offline, events buffer natively until connection is re-established.",
      retryCount: "Retries",
      processedStatus: "Processed",
      failedStatus: "Failed",
      dlqStatus: "In DLQ",
      replayedStatus: "Recovered",
    },
    settings: {
      title: "Settings",
      searchPlaceholder: "Search a setting...",
      profile: "Authenticated Active User",
      currentRole: "Current Security Role Group",
      switchPrompt: "Change simulated roles to inspect robust multi-tenant domain rule execution.",
      networkSimTitle: "Simulate Offline-First Network State",
      onlineStatus: "Connected to Cloud Run Ingress",
      offlineStatus: "Offline Buffer Active",
      simulateOffline: "Disconect (Force Offline Buffer)",
      goOnline: "Reconnect (Trigger Buffer Sync)",
      sandboxDesc: "Available Roles: OWNER (Global control), MANAGER (Branch restricted), SUPERVISOR (Read-only monitoring), EMPLOYEE (Self-service only).",
      resetDatabase: "Reset Local Ledger & Events",
    },
    leave: {
      title: "Leaves & Time-Off Management",
      requestBtn: "Request Time-Off",
      approveBtn: "Approve Time-Off",
      rejectBtn: "Reject Time-Off",
      typeLabel: "Leave Category Type",
      statusLabel: "Approval Status",
      remainingLabel: "Remaining Leave Balance",
      reasonPlaceholder: "Reason or details for the time-off...",
      successCreated: "Your time-off request was saved successfully.",
      successApproved: "Leave request approved and logged forensic-ready.",
    },
    planning: {
      title: "Planning & Shift Scheduling",
      teamSelect: "Team Member Staff",
      shiftTime: "Shift Time Frame",
      assignedBranch: "Operating Branch Assignee",
      saveSchedule: "Save Shift Schedule",
      successScheduled: "Shift schedule recorded and replicated.",
      realtimeOps: "Real-time Operations • Sync Payroll Active • Shift Conflict Detection Engine •",
      activeRollover: "Weekly Auto-Rollover Active",
      clockInQrBtn: "Clock-in QR",
      aiAutoPlanBtn: "AI Auto-Planner",
      massImportBtn: "Bulk Shift Import",
      newShiftBtn: "New Shift Tour",
      copyWeekBtn: "Copy Past Week",
      exportExcelBtn: "Export Excel",
      exportPdfBtn: "Export PDF",
      qrAttendanceTitle: "QR Shift Clock-In",
      qrBadgeScannedAlert: "Badge scanned: {code} - Clocking time recorded successfully.",
      presentBadgeInstructions: "Present the employee badge in front of the camera to confirm shift starting time.",
    },
    documents: {
      title: "CNC Corporate Documents Manager",
      uploadContract: "Issue New Employment Contract",
      contractType: "Contract Framework",
      salaryBase: "Base Committed Salary",
      generatePdf: "Generate Secure PDF",
      statusActive: "In Force / Active",
      fileUrl: "Cloud Storage Link Archive",
    },
  },
};

export const globalDictionary: Record<string, Record<Language, string>> = {
  "Aucun pointage trouvé pour cette sélection.": {
    fr: "Aucun pointage trouvé pour cette sélection.",
    ht: "Pa gen okenn pwentaj yo jwenn pou seleksyon sa a.",
    en: "No attendance records found for this selection."
  },
  "Aucun employé trouvé": {
    fr: "Aucun employé trouvé",
    ht: "Pa jwenn okenn anplwaye",
    en: "No employees found"
  },
  "Aucun événement financier traçable pour cet employé.": {
    fr: "Aucun événement financier traçable pour cet employé.",
    ht: "Pa gen okenn evènman finansye pou anplwaye sa a.",
    en: "No traceable financial events for this employee."
  },
  "Aucunes transactions trouvées.": {
    fr: "Aucunes transactions trouvées.",
    ht: "Pa gen okenn tranzaksyon yo jwenn.",
    en: "No transactions found."
  },
  "Aucune transaction trouvée.": {
    fr: "Aucune transaction trouvée.",
    ht: "Pa gen okenn tranzaksyon yo jwenn.",
    en: "No transactions found."
  },
  "Aucun contrat enregistré.": {
    fr: "Aucun contrat enregistré.",
    ht: "Pa gen kontra ki anrejistre.",
    en: "No registered contract found."
  },
  "Aucune anomalie critique de paie détectée. La répartition territoriale de la main d’œuvre respecte les limites CNSS (6%) imposées.": {
    fr: "Aucune anomalie critique de paie détectée. La répartition territoriale de la main d’œuvre respecte les limites CNSS (6%) imposées.",
    ht: "Pa gen okenn anomali kritik yo detekte nan peman an. Tout travay fèt respekti limit CNSS (6%) yo bay la.",
    en: "No critical payroll anomalies detected. Territorial workforce distribution complies with the mandated 6% CNSS limits."
  },
  "Aucune anomalie de liaison ou d'en-tête présente dans la Dead Letter Queue.": {
    fr: "Aucune anomalie de liaison ou d'en-tête présente dans la Dead Letter Queue.",
    ht: "Pa gen okenn anomali oubyen lyezon ki nan Dead Letter Queue (DLQ).",
    en: "No binding or header anomalies present in the Dead Letter Queue."
  },
  "Aucun contrat CNC actif n'est associé à cette fiche de poste.": {
    fr: "Aucun contrat CNC actif n'est associé à cette fiche de poste.",
    ht: "Pa gen okenn kontra CNC aktif ki lye ak fich travay sa a.",
    en: "No active CNC contract is associated with this job sheet."
  },
  "Aucun pointage enregistré pour cette quinzaine.": {
    fr: "Aucun pointage enregistré pour cette quinzaine.",
    ht: "Pa gen okenn pwentaj ki sove pou kinzèn sa.",
    en: "No attendance clock-ins recorded for this quinzaine period."
  },
  "Aucune donnée disponible pour ce filtre.": {
    fr: "Aucune donnée disponible pour ce filtre.",
    ht: "Pa gen okenn done ki disponib pou filtè sa.",
    en: "No data available for this filter."
  },
  "Aucune transaction de dépense directe (EXPENSE/ADVANCE) n'a été enregistrée pour ce département sur cette période.": {
    fr: "Aucune transaction de dépense directe (EXPENSE/ADVANCE) n'a été enregistrée pour ce département sur cette période.",
    ht: "Pa gen okenn depans dirèk (EXPENSE/ADVANCE) ki sove pou depatman sa a nan peryòd sa a.",
    en: "No direct expenses or salary advances registered for this department in this period."
  },
  "Aucun collaborateur configuré ou sélectionné pour visualiser son badge.": {
    fr: "Aucun collaborateur configuré ou sélectionné pour visualiser son badge.",
    ht: "Konfigire oswa chwazi yon anplwaye pou wè badge li.",
    en: "No employee configured or selected to display badge visualization."
  },
  "Aucun profil existant ou sélectionné pour formuler un contrat de travail.": {
    fr: "Aucun profil existant ou sélectionné pour formuler un contrat de travail.",
    ht: "Chwazi yon anplwaye pou kreye yon kontra travay.",
    en: "No profile exists or selected to formulate an employment contract."
  },
  "Aucun département configuré": {
    fr: "Aucun département configuré",
    ht: "Pa gen depatman ki konfigire",
    en: "No department configured"
  },
  "Aucun personnel affecté": {
    fr: "Aucun personnel affecté",
    ht: "Pa gen anplwaye nan pati sa",
    en: "No assigned personnel"
  },
  "Aucun personnel enregistré dans cette succursale": {
    fr: "Aucun personnel enregistré dans cette succursale",
    ht: "Pa gen okenn personnel ki sove nan sikisal sa a",
    en: "No active personnel registered in this branch location"
  },
  "Aucun département lié à cette succursale": {
    fr: "Aucun département lié à cette succursale",
    ht: "Pa gen okenn depatman ki lye ak sikisal sa a",
    en: "No departments linked to this branch location"
  },
  "Aucun département répertorié.": {
    fr: "Aucun département répertorié.",
    ht: "Pa gen okenn depatman ki jwenn.",
    en: "No departments catalogued."
  },
  "Aucun employé actuellement affecté à ce département.": {
    fr: "Aucun employé actuellement affecté à ce département.",
    ht: "Pa gen pyès moun ki nan depatman sa a kounye a.",
    en: "No employees currently assigned to this department."
  },
  "Aucune invitation active ou émise pour le moment.": {
    fr: "Aucune invitation active ou émise pour le moment.",
    ht: "Pa gen okenn envitasyon ki aktif kounye a.",
    en: "No active or pending onboarding invitations for now."
  },
  "Aucun congé programmé pour cette entreprise.": {
    fr: "Aucun congé programmé pour cette entreprise.",
    ht: "Pa gen okenn konje ki planifye pou konpayi sa a.",
    en: "No leaves scheduled for this company."
  },
  "Je déclare solennellement avoir audité ces écritures et je valide la création automatique de compensations pour préserver la balance d'ajustement du Grand Livre.": {
    fr: "Je déclare solennellement avoir audité ces écritures et je valide la création automatique de compensations pour préserver la balance d'ajustement du Grand Livre.",
    ht: "Mwen deklare ke mwen verifye papye sa yo epi mwen aksepte kreye tranzaksyon konpansasyon pou balanse Gran Liv la.",
    en: "I solemnly declare that I have audited these records and approve the auto-generation of compensating ledger entries to preserve ledger balances."
  },
  "Signature d'audit copiée dans le presse-papiers !": {
    fr: "Signature d'audit copiée dans le presse-papiers !",
    ht: "Siyati odit la kopye nan nòt ou yo !",
    en: "Audit cryptographic signature copied to clipboard!"
  },
  "PROTOCOLE D'INTÉGRITÉ COMPTABLE (PRÉCAUTIONS STRICTES)": {
    fr: "PROTOCOLE D'INTÉGRITÉ COMPTABLE (PRÉCAUTIONS STRICTES)",
    ht: "PWOTOKÒL INTEGRITE KONTAB (PREKOSYON STRIKT)",
    en: "LEDGER INTEGRITY AUDIT PROTOCOL (STRICT MANDATES)"
  },
  "Les registres existants resteront non modifiés dans la base de données.": {
    fr: "Les registres existants resteront non modifiés dans la base de données.",
    ht: "Tranzaksyon ki la deja yo ap rete san okenn chanjman nan baz done a.",
    en: "Existing database records will remain completely unchanged."
  },
  "Un journal de d'audit de sécurité médico-légal (Forensic Log) immuable sera généré avec votre adresse IP, votre clé de sécurité et votre motif d'explication obligatoire.": {
    fr: "Un journal d'audit de sécurité médico-légal (Forensic Log) immuable sera généré avec votre adresse IP, votre clé de sécurité et votre motif d'explication obligatoire.",
    ht: "Yon dosye odit sekirite forensic imiyab ap kreye ak adrès IP ou, kle sekirite ak rezon espesyal ou.",
    en: "An immutable security Forensic Log will be generated with your IP metadata, user security key, and explanation motif."
  },
  "Toutes les relations de flux d'affectation de trésorerie (comme les fiches de paie et les indemnités fiscales) recevront un événement système pour corriger leurs totaux réels prévisionnels.": {
    fr: "Toutes les relations de flux d'affectation de trésorerie (comme les fiches de paie et les indemnités fiscales) recevront un événement système pour corriger leurs totaux réels prévisionnels.",
    ht: "Tout koneksyon avèk kòb yo (tankou fich pae ak taks) ap resevwa yon siyal sistèm pou korije total yo.",
    en: "All active cash allocation relationships (such as pay slips and tax records) will propagate a correction event."
  },
  "DÉBETS À COMPENSER (Sorties)": {
    fr: "DÉBETS À COMPENSER (Sorties)",
    ht: "DEBE POU AJISTE (Denye)",
    en: "DEBITS TO SECURE (Outflow Reversal)"
  },
  "CRÉDITS À COMPENSER (Entrées)": {
    fr: "CRÉDITS À COMPENSER (Entrées)",
    ht: "KREDI POU AJISTE (Antre)",
    en: "CREDITS TO SECURE (Inflow Reversal)"
  },
  "Enregistrements Comptables Sélectionnés": {
    fr: "Enregistrements Comptables Sélectionnés",
    ht: "Dosye Kontab yo Chwazi",
    en: "Target Ledger Records Selected"
  },
  "Total sélectionné:": {
    fr: "Total sélectionné:",
    ht: "Konte li chwazi:",
    en: "Total items selected:"
  },
  "Motif d'Explication et Justification de Contrepassation Groupée": {
    fr: "Motif d'Explication et Justification de Contrepassation Groupée",
    ht: "Rezon Eksplikasyon ak Jistifikasyon ranvèsman an mès",
    en: "Structured Explanation & Audit Reason for Bulk Ledger Reversal"
  },
  "Mot de Passe d'Autorisation de Registre": {
    fr: "Mot de Passe d'Autorisation de Registre",
    ht: "Kòd sekirite pou debloke Gran Liv la",
    en: "Compensating Ledger Security Credentials"
  },
  "CONTREPASSER": {
    fr: "CONTREPASSER",
    ht: "REVERSE",
    en: "REVERSE"
  },
  "Annuler": {
    fr: "Annuler",
    ht: "Anile",
    en: "Cancel"
  },
  "DÉVERROUILLER & CONTREPASSER": {
    fr: "DÉVERROUILLER & CONTREPASSER",
    ht: "DEBLOKE & RANVÈSE",
    en: "DECRYPT & REVERSE"
  },
  "Fermer": {
    fr: "Fermer",
    ht: "Fèmen",
    en: "Close"
  },
  "Imprimer": {
    fr: "Imprimer",
    ht: "Enprime",
    en: "Print"
  },
  "Modifier": {
    fr: "Modifier",
    ht: "Chanje",
    en: "Edit"
  },
  "Date & Heure": {
    fr: "Date & Heure",
    ht: "Dat ak Lè",
    en: "Date & Time"
  },
  "ID Ref": {
    fr: "Réf ID",
    ht: "ID Ref",
    en: "Ref ID"
  },
  "Type": {
    fr: "Type",
    ht: "Kategori",
    en: "Type"
  },
  "Source": {
    fr: "Source",
    ht: "Sous",
    en: "Source"
  },
  "Debit": {
    fr: "Débit",
    ht: "Debi",
    en: "Debit"
  },
  "Credit": {
    fr: "Crédit",
    ht: "Kredi",
    en: "Credit"
  },
  "Solde (HTG)": {
    fr: "Solde (HTG)",
    ht: "Sol (HTG)",
    en: "Balance (HTG)"
  },
  "Audit": {
    fr: "Audit",
    ht: "Odit",
    en: "Audit"
  },
  "Actions": {
    fr: "Actions",
    ht: "Aksyon",
    en: "Actions"
  },
  "Date": {
    fr: "Date",
    ht: "Dat",
    en: "Date"
  },
  "Montant": {
    fr: "Montant",
    ht: "Montan",
    en: "Amount"
  },
  "Grand Livre à Double Entrée": {
    fr: "Grand Livre à Double Entrée",
    ht: "Gran Liv Doub Antre",
    en: "Double-Entry General Ledger"
  },
  "Score Santé:": {
    fr: "Score Santé:",
    ht: "Kalite Sante:",
    en: "Health Score:"
  },
  "Trésorerie:": {
    fr: "Trésorerie:",
    ht: "Trézori:",
    en: "Treasury:"
  },
  "Immuable (Audit Grade)": {
    fr: "Immuable (Audit Grade)",
    ht: "Imuiab (Audit Grade)",
    en: "Immutable (Audit Grade)"
  },
  "Nouvelle Transaction": {
    fr: "Nouvelle Transaction",
    ht: "Nouvo Tranzaksyon",
    en: "New Transaction"
  },
  "Import CSV": {
    fr: "Import CSV",
    ht: "Enpòte CSV",
    en: "Import CSV"
  },
  "Audit d'Intégrité": {
    fr: "Audit d'Intégrité",
    ht: "Odit Entegrite",
    en: "Integrity Audit"
  },
  "Compensation": {
    fr: "Compensation",
    ht: "Konpansasyon",
    en: "Compensation"
  },
  "AI CFO Analysis": {
    fr: "AI CFO Analysis",
    ht: "Analiz CFO IA",
    en: "AI CFO Analysis"
  },
  "Export Excel": {
    fr: "Export Excel",
    ht: "Ekspòte nan Excel",
    en: "Export Excel"
  },
  "Rechercher transaction, ID, description...": {
    fr: "Rechercher transaction, ID, description...",
    ht: "Chache tranzaksyon, ID, deskripsyon...",
    en: "Search transaction, ID, description..."
  },
  "Tous types": {
    fr: "Tous types",
    ht: "Tout kalite",
    en: "All types"
  },
  "Revenu": {
    fr: "Revenu",
    ht: "Revni",
    en: "Income"
  },
  "Dépense": {
    fr: "Dépense",
    ht: "Depans",
    en: "Expense"
  },
  "Avance": {
    fr: "Avance",
    ht: "Avans",
    en: "Advance"
  },
  "Transfert": {
    fr: "Transfert",
    ht: "Transfè",
    en: "Transfer"
  },
  "Paie": {
    fr: "Paie",
    ht: "Kinzèn",
    en: "Payroll"
  },
  "Correction": {
    fr: "Correction",
    ht: "Koreksyon",
    en: "Correction"
  },
  "Toutes succursales": {
    fr: "Toutes succursales",
    ht: "Tout sikisal",
    en: "All branches"
  },
  "Tous départements": {
    fr: "Tous départements",
    ht: "Tout depatman",
    en: "All departments"
  },
  "Date de début": {
    fr: "Date de début",
    ht: "Dat kòmansman",
    en: "Start date"
  },
  "Date de fin": {
    fr: "Date de fin",
    ht: "Dat fen",
    en: "End date"
  },
  "Période (Mois)": {
    fr: "Période (Mois)",
    ht: "Peryòd (Mwa)",
    en: "Period (Month)"
  },
  "Accès refusé. Vous ne pouvez pas annuler de transaction.": {
    fr: "Accès refusé. Vous ne pouvez pas annuler de transaction.",
    ht: "Aksè refize. Ou pa gen otorizasyon pou anile tranzaksyon sa a.",
    en: "Access denied. You cannot reverse this transaction."
  },
  "Accès refusé. Vous ne pouvez pas annuler de transactions.": {
    fr: "Accès refusé. Vous ne pouvez pas annuler de transactions.",
    ht: "Aksè refize. Ou pa gen otorizasyon pou anile tranzaksyon sa yo.",
    en: "Access denied. You cannot reverse these transactions."
  },
  "Accès refusé.": {
    fr: "Accès refusé.",
    ht: "Aksè refize.",
    en: "Access denied."
  },
  "transactions ont été contrepassées avec succès !": {
    fr: "transactions ont été contrepassées avec succès !",
    ht: "tranzaksyon ranvèse avèk siksè !",
    en: "transactions reversed successfully!"
  },
  "transactions importées avec succès.": {
    fr: "transactions importées avec succès.",
    ht: "tranzaksyon enpòte avèk siksè.",
    en: "transactions imported successfully."
  }
};

// Initialize i18next
i18next
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        translation: {
          ...translations.fr,
          ...Object.keys(globalDictionary).reduce((acc, key) => {
            acc[key] = globalDictionary[key].fr;
            return acc;
          }, {} as Record<string, string>)
        }
      },
      ht: {
        translation: {
          ...translations.ht,
          ...Object.keys(globalDictionary).reduce((acc, key) => {
            acc[key] = globalDictionary[key].ht;
            return acc;
          }, {} as Record<string, string>)
        }
      },
      en: {
        translation: {
          ...translations.en,
          ...Object.keys(globalDictionary).reduce((acc, key) => {
            acc[key] = globalDictionary[key].en;
            return acc;
          }, {} as Record<string, string>)
        }
      }
    },
    lng: "fr",
    fallbackLng: "fr",
    interpolation: {
      escapeValue: false
    }
  });

export function useTranslate() {
  const context = useContext(I18nContext);
  return (text: string) => {
    if (!text) return "";
    const trimmed = text.trim();
    if (i18next.isInitialized && i18next.exists(trimmed)) {
      return i18next.t(trimmed);
    }
    if (context && context.language && globalDictionary[trimmed]) {
      return globalDictionary[trimmed][context.language] || trimmed;
    }
    return trimmed;
  };
}

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationSchema;
}

export const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
