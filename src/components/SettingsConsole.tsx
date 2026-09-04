import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Business, ForensicLog, ERPEvent, Role } from "../types";
import { useI18n } from "../i18n";
import { Settings, Shield, RefreshCw, Key, Wifi, WifiOff, FileCode2, Sliders, Check, Link, AlertTriangle } from "lucide-react";
import { ThemeSegmentedControl } from "./ThemeSwitcher";
import { useAuth } from "../hooks/useAuth";
import { motion, AnimatePresence } from "motion/react";
import { SecurityCredentialsManager } from "./auth/SecurityCredentialsManager";

interface SettingsProps {
  currentRole: Role;
  currentUser?: { name: string; id: string };
  onRoleChange: (r: Role) => void;
  currentBusiness: Business;
  isOffline: boolean;
  onOfflineToggle: (val: boolean) => void;
  onResetDb: () => void;
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
}

const settingsDict: Record<"fr" | "ht" | "en", {
  subtitle: string;
  nifLabel: string;
  forensicPrefixLabel: string;
  saving: string;
  saveVariablesBtn: string;
  googleLinkTitle: string;
  googleLinkDesc: string;
  googleBtnLink: string;
  googleBtnLinking: string;
  themeTitle: string;
  themeDesc: string;
  fixtureResetTitle: string;
  fixtureResetDesc: string;
  nifFormatError: string;
  saltMinError: string;
  roleSwitchedAlert: string;
  googleLinkSuccess: string;
  googleLinkAlreadyLinked: string;
  googleLinkCredentialInUse: string;
  googleLinkErrorPrefix: string;
  tenantSavedSuccess: string;
  dbResetSuccess: string;
  networkDesc: string;
}> = {
  fr: {
    subtitle: "Configuration des options opérationnelles avancées, habilitations multi-tenant et simulateurs réseau.",
    nifLabel: "NIF de l'Établissement (Haïti)",
    forensicPrefixLabel: "Préfixe Forensic de Signature Cryptographique",
    saving: "Enregistrement...",
    saveVariablesBtn: "Sauvegarder Variables de Caisse",
    googleLinkTitle: "Liaison de Comptes (Google)",
    googleLinkDesc: "Associez votre compte Google à votre profil FinOps existant de façon à pouvoir vous connecter en un clic la prochaine fois.",
    googleBtnLink: "Lier mon compte Google",
    googleBtnLinking: "Association en cours...",
    themeTitle: "Thème de l'application",
    themeDesc: "Personnalisez l'affichage de votre ERP de manière globale. Choisissez entre le mode clair, sombre, ou laissez le système décider.",
    fixtureResetTitle: "Réinitialisation Forcée des Fixtures",
    fixtureResetDesc: "Réinitialiser l'entièreté du Grand Livre ERP local et restaurer les états initiaux des employés de démonstration.",
    nifFormatError: "Le format du NIF haïtien doit être XXX-XXX-XXX-X (ex: 004-129-301-4)",
    saltMinError: "Le préfixe de chiffrement doit comporter au moins 2 caractères.",
    roleSwitchedAlert: "Multi-Tenant Simulateur : Rôle basculé vers \"{role}\" avec succès !",
    googleLinkSuccess: "Votre compte Google a été lié avec succès ! Vous pouvez désormais vous connecter directement avec Google.",
    googleLinkAlreadyLinked: "Ce fournisseur Google est déjà lié à ce compte.",
    googleLinkCredentialInUse: "Ce compte Google est déjà lié à un autre compte d'utilisateur. Veuillez utiliser un autre compte Google ou fusionner d'abord.",
    googleLinkErrorPrefix: "Erreur de liaison : ",
    tenantSavedSuccess: "Paramètres du locataire modifiés avec succès !",
    dbResetSuccess: "Base de données réinitialisée avec succès !",
    networkDesc: "Simulez la déconnexion internet pour tester la synchronisation d'écriture hors-ligne de la file d'attente (Local Queue)."
  },
  ht: {
    subtitle: "Konfigirasyon opsyon avanse kès la, nivo aksè pou chak moun ak simulation rezo.",
    nifLabel: "NIF Konpayi an (Ayiti)",
    forensicPrefixLabel: "Prefiks Kodaj Sekirite Odit Trail",
    saving: "Ap Sove...",
    saveVariablesBtn: "Sove Varyab Kès yo",
    googleLinkTitle: "Koneksyon Kont (Google)",
    googleLinkDesc: "Konekte kont Google ou a ak pwofil FinOps ou a pou ou ka konekte pi fasil lòt fwa yo.",
    googleBtnLink: "Konekte Kont Google mwen",
    googleBtnLinking: "Ap konekte...",
    themeTitle: "Koulè aplikasyon an",
    themeDesc: "Chwazi koulè ou vle pou aplikasyon an. Ou ka mete li sou klè, nwa, oswa kite sistèm nan deside otomatikman.",
    fixtureResetTitle: "Repati Fixtures yo a Zewo",
    fixtureResetDesc: "Efase tout liv kòb la ak anplwaye yo epi mete sistèm nan jan l te ye okòmansman depi premye jou.",
    nifFormatError: "Fòma NIF la dwe XXX-XXX-XXX-X (egz: 004-129-301-4)",
    saltMinError: "Prefiks sekirite a dwe genyen omwen 2 lèt.",
    roleSwitchedAlert: "Simulatè : Ou vin gen aksè kòm \"{role}\" !",
    googleLinkSuccess: "Kont Google ou a konekte byen pwòp! Depi koulye a ou ka konekte dirèkteman avèk Google.",
    googleLinkAlreadyLinked: "Kont Google sa a deja konekte ak pwofil ou.",
    googleLinkCredentialInUse: "Kont Google sa a deja konekte ak yon lòt kont. Tanpri itilize yon lòt.",
    googleLinkErrorPrefix: "Erreur koneksyon : ",
    tenantSavedSuccess: "Paramèt yo sove avèk siksè !",
    dbResetSuccess: "Sistèm nan repati a zewo avèk siksè !",
    networkDesc: "Simile dekoneksyon entènèt pou wè jan sistèm nan ap sove travay yo nan memwa lokal la (Local Queue) lè w pa gen liy."
  },
  en: {
    subtitle: "Configure advanced operational options, multi-tenant permissions, and network simulators.",
    nifLabel: "Establishment NIF (Haiti)",
    forensicPrefixLabel: "Cryptographic Forensic Signature Prefix",
    saving: "Saving...",
    saveVariablesBtn: "Save Cash Settings",
    googleLinkTitle: "Account Linking (Google)",
    googleLinkDesc: "Associate your Google account with your existing FinOps profile so you can log in with one click next time.",
    googleBtnLink: "Link my Google Account",
    googleBtnLinking: "Linking...",
    themeTitle: "App Theme",
    themeDesc: "Personalize your ERP theme. Choose between light, dark, or let the ERP sync with your preferences automatically.",
    fixtureResetTitle: "Force Fixtures Purge",
    fixtureResetDesc: "Reset the entire local general ledger and restore original mock employee schemas.",
    nifFormatError: "Haitian NIF format must be XXX-XXX-XXX-X (e.g. 004-129-301-4)",
    saltMinError: "Cryptographic salt prefix must be at least 2 characters.",
    roleSwitchedAlert: "Multi-Tenant Simulator: Role switched to \"{role}\" successfully!",
    googleLinkSuccess: "Your Google account has been linked successfully! You can now log in directly using Google.",
    googleLinkAlreadyLinked: "This Google provider is already linked to this account.",
    googleLinkCredentialInUse: "This Google account is already linked to another user. Please use another Google account or merge first.",
    googleLinkErrorPrefix: "Linking error: ",
    tenantSavedSuccess: "Tenant configuration updated successfully!",
    dbResetSuccess: "Database reset to original fixtures successfully!",
    networkDesc: "Simulate offline state to test the background synchronization schema and offline local write queue."
  }
};

const prompts = {
  cancel: {
    fr: "Annuler",
    ht: "Anile",
    en: "Cancel",
  },
};

export default function SettingsConsole({
  currentRole,
  currentUser,
  onRoleChange,
  currentBusiness,
  isOffline,
  onOfflineToggle,
  onResetDb,
  onAddEvent,
  onAddForensicLog,
}: SettingsProps) {
  const { t, language } = useI18n();
  const d = settingsDict[language as "fr" | "ht" | "en"] || settingsDict.fr;

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText: string;
    type: "info" | "danger";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    confirmText: "",
    type: "info",
    onConfirm: () => {},
  });

  const nifPrefixSchema = React.useMemo(() => z.object({
    customNif: z.string().regex(/^\d{3}-\d{3}-\d{3}-\d{1}$/, {
      message: d.nifFormatError,
    }),
    securityPrefix: z.string().min(2, { message: d.saltMinError }),
  }), [d]);

  type NifFormValues = { customNif: string; securityPrefix: string };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<NifFormValues>({
    resolver: zodResolver(nifPrefixSchema),
    defaultValues: {
      customNif: currentBusiness.nif || "003-456-789-1",
      securityPrefix: "TEK_SEC_SALT_v3",
    },
  });

  const { user, dbUser } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const isGoogleLinked = user?.providerData?.some((p) => p.providerId === "google.com") || false;

  const handleLinkGoogle = async () => {
    if (!user) return;
    setIsLinkingGoogle(true);
    setSuccessToast(null);
    try {
      const { linkWithPopup } = await import("firebase/auth");
      const { auth: firebaseAuth, googleProvider, db } = await import("../lib/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      
      await linkWithPopup(firebaseAuth.currentUser!, googleProvider);
      
      // Update user doc with new auth provider metadata
      const userRef = doc(db, "users", firebaseAuth.currentUser!.uid);
      await setDoc(userRef, {
        auth_provider: "google.com",
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      // Add forensic log entry
      onAddForensicLog({
        id: "f_lnk_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: user.uid,
        userName: dbUser?.name || user.email?.split("@")[0] || "User Google",
        userRole: currentRole,
        business_id: currentBusiness?.id || "",
        action: "AUTH_LINK_GOOGLE_SUCCESS",
        beforeState: JSON.stringify({ linkedProviders: user.providerData?.map(p => p.providerId) || [] }),
        afterState: JSON.stringify({ linkedProviders: ["password", "google.com"] }),
        ipAddress: "190.115.34.12",
        userAgent: window.navigator.userAgent,
        signature: "seal_link_" + Math.random().toString(36).substring(2, 9),
      });

      alert(d.googleLinkSuccess);
      setSuccessToast(d.googleLinkSuccess);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error("[SettingsConsole] Failed to link Google account:", err);
      let errorMsg = err.message || "Une erreur est survenue lors de la liaison du compte.";
      if (err.code === "auth/provider-already-linked") {
        errorMsg = d.googleLinkAlreadyLinked;
      } else if (err.code === "auth/credential-already-in-use") {
        errorMsg = d.googleLinkCredentialInUse;
      }
      alert(`${d.googleLinkErrorPrefix}${errorMsg}`);
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const onSubmitNif = (data: NifFormValues) => {
    const activeLang = (language === "fr" || language === "ht" || language === "en") ? language : "fr";
    setConfirmModal({
      isOpen: true,
      title: settingsDict[activeLang].saveVariablesBtn,
      description: activeLang === "ht" 
        ? "Èske ou vle sove chanjman sa yo? Nouvo valè yo pral aplike imedyatman nan kès la." 
        : (activeLang === "en" ? "Do you want to overwrite the current tenant parameters? New values will immediately take effect on the active payroll cycle." : "Voulez-vous vraiment écraser les paramètres du locataire ? Les nouvelles valeurs seront immédiatement appliquées sur la quinzaine active."),
      confirmText: settingsDict[activeLang].saveVariablesBtn,
      type: "info",
      onConfirm: () => {
        setLoading(true);
        setSuccessToast(null);

        // Simulate database updates
        setTimeout(() => {
          // Modify business NIF locally represented
          currentBusiness.nif = data.customNif;

          // Forensic log
          onAddForensicLog({
            id: "f_st_" + Math.random().toString(36).substring(2, 9),
            timestamp: new Date().toISOString(),
            userId: "e1",
            userName: currentUser?.name || "System",
            userRole: "OWNER",
            business_id: currentBusiness.id,
            action: "SETTINGS_UPDATE_NIF",
            beforeState: JSON.stringify({ oldNif: "003-456-789-1" }),
            afterState: JSON.stringify(data),
            ipAddress: "190.115.34.12",
            userAgent: window.navigator.userAgent,
            signature: "seal_sett_" + Math.random().toString(36).substring(2, 9),
          });

          setLoading(false);
          setSuccessToast(d.tenantSavedSuccess);
          setTimeout(() => setSuccessToast(null), 4000);
        }, 600);
      }
    });
  };

  const triggerResetDb = () => {
    const activeLang = (language === "fr" || language === "ht" || language === "en") ? language : "fr";
    setConfirmModal({
      isOpen: true,
      title: settingsDict[activeLang].fixtureResetTitle,
      description: activeLang === "ht"
        ? "⚠️ Èske ou sèten ou vle efase tout liv kòb la ak anplwaye yo? Sa pral mete sistèm nan jan l te ye okòmansman depi premye jou."
        : (activeLang === "en" ? "⚠️ Are you sure you want to reset the entire general ledger? This operation will simulate a purge of all records and reload default mock employee schemas." : "⚠️ Êtes-vous sûr de vouloir réinitialiser l'entièreté de la base de caisse locale ? Cette opération simulera un effacement de tous les registres comptables et rechargera les fiches de démonstration d'origine."),
      confirmText: activeLang === "ht" ? "Repati a Zewo" : (activeLang === "en" ? "Confirm Reset" : "Réinitialiser"),
      type: "danger",
      onConfirm: () => {
        onResetDb();
        setSuccessToast(d.dbResetSuccess);
        setTimeout(() => setSuccessToast(null), 4000);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6" id="settings-tab-container">
      <div>
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
          <Settings className="w-5 h-5 text-cyan-400" />
          {t.settings.title}
        </h2>
        <p className="text-xs text-slate-400 font-light mt-0.5">
          {d.subtitle}
        </p>
      </div>

      {successToast && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold animate-fadeIn flex items-center gap-2" id="st-success-alert">
          <Check className="w-4 h-4" />
          {successToast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="settings-grid">
        {/* Left Column: Security Switcher */}
        <div className="lg:col-span-6 flex flex-col gap-4" id="settings-left-col">
          <div className="glass rounded-xl p-5" id="settings-role-box">
            <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider mb-3 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-cyan-400" />
              {t.settings.profile}
            </h4>
            <p className="text-xs text-slate-400 font-light mb-4 leading-relaxed">
              {t.settings.switchPrompt}
            </p>

            <div className="grid grid-cols-2 gap-2.5" id="roles-grid">
              {(["OWNER", "MANAGER", "SUPERVISOR", "EMPLOYEE", "SUPER_ADMIN"] as Role[]).map((r) => (
                <button
                  key={r}
                  id={`btn-set-role-${r}`}
                  onClick={() => {
                    onRoleChange(r);
                    alert(d.roleSwitchedAlert.replace("{role}", r));
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer transition text-left flex items-center justify-between ${
                    currentRole === r
                      ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-400"
                      : "bg-slate-950/40 border-slate-900 text-slate-400 hover:border-slate-800 hover:text-slate-300"
                  }`}
                >
                  <span>{r === "SUPER_ADMIN" ? "SUPER ADMIN" : r}</span>
                  {currentRole === r && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-slate-500 font-mono mt-4 leading-normal">
              {t.settings.sandboxDesc}
            </p>
          </div>

          {/* Account Security & Multi-Provider Credentials Box */}
          <div className="glass rounded-xl p-5" id="settings-linking-box">
            <SecurityCredentialsManager />
          </div>

          {/* Theme Selection Box */}
          <div className="glass rounded-xl p-5" id="settings-theme-box">
            <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider mb-3 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-cyan-400" />
              {d.themeTitle}
            </h4>
            <p className="text-xs text-slate-400 font-light mb-4 leading-relaxed">
              {d.themeDesc}
            </p>
            <ThemeSegmentedControl className="w-full justify-between bg-slate-950/40" />
          </div>

          <div className="glass rounded-xl p-5 flex flex-col gap-3" id="settings-network-box">
            <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider flex items-center gap-1.5">
              <Wifi className="w-4 h-4 text-cyan-400" />
              {t.settings.networkSimTitle}
            </h4>

            <p className="text-xs text-slate-400 leading-normal">
              {d.networkDesc}
            </p>

            <div className="flex gap-2 mt-2" id="offline-toggles-row">
              <button
                id="btn-settings-force-offline"
                onClick={() => onOfflineToggle(true)}
                disabled={isOffline}
                className="flex-1 py-2 px-3 bg-rose-600/10 hover:bg-rose-600/25 border border-rose-500/35 rounded-lg text-rose-400 font-bold text-xs cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-30"
              >
                <WifiOff className="w-3.5 h-3.5" />
                {t.settings.simulateOffline}
              </button>

              <button
                id="btn-settings-force-online"
                onClick={() => onOfflineToggle(false)}
                disabled={!isOffline}
                className="flex-1 py-2 px-3 bg-emerald-600/10 hover:bg-emerald-600/25 border border-emerald-500/35 rounded-lg text-emerald-400 font-bold text-xs cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-30"
              >
                <Wifi className="w-3.5 h-3.5" />
                {t.settings.goOnline}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Tenant Specific Config & Database reset */}
        <div className="lg:col-span-6 flex flex-col gap-4" id="settings-right-col">
          <div className="glass rounded-xl p-5" id="settings-form-box">
            <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider mb-4 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-cyan-400" />
              {language === "ht" ? "Mesaj Legal Multi-Tenant" : (language === "en" ? "Multi-Tenant Legal Input" : "Saisie Légale Multi-Tenant")}
            </h4>

            <form onSubmit={handleSubmit(onSubmitNif)} className="flex flex-col gap-3.5" id="settings-actual-form">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{d.nifLabel}</label>
                <input
                  id="st-form-customNif"
                  type="text"
                  {...register("customNif")}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500"
                />
                {errors.customNif && (
                  <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.customNif.message}</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{d.forensicPrefixLabel}</label>
                <input
                  id="st-form-securityPrefix"
                  type="text"
                  {...register("securityPrefix")}
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500"
                />
                {errors.securityPrefix && (
                  <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.securityPrefix.message}</p>
                )}
              </div>

              <button
                id="btn-settings-submit"
                type="submit"
                disabled={loading}
                className="py-2 px-4 bg-cyan-600 hover:bg-cyan-700 text-slate-950 text-xs font-bold rounded cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {d.saving}
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5 animate-pulse" />
                    {d.saveVariablesBtn}
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 flex flex-col gap-3" id="settings-reset-box">
            <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider flex items-center gap-1.5">
              <FileCode2 className="w-4 h-4 text-rose-450" />
              {d.fixtureResetTitle}
            </h4>
            <p className="text-xs text-slate-400 leading-normal">
              {d.fixtureResetDesc}
            </p>

            <button
              id="btn-settings-reset-db"
              onClick={triggerResetDb}
              className="py-2.5 px-4 rounded bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/45 text-rose-400 font-bold text-xs cursor-pointer transition flex items-center justify-center gap-1.5 mt-2"
            >
              <RefreshCw className="w-4 h-4 animate-spin-reverse" />
              {t.settings.resetDatabase}
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Animated Confirmation Modal */}
      {confirmModal.isOpen && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden"
              id="settings-confirm-modal"
            >
              <div className={`absolute top-0 inset-x-0 h-1.5 ${confirmModal.type === "danger" ? "bg-rose-500" : "bg-cyan-500"}`}></div>
              
              <div className="flex gap-4 items-start pt-2">
                <div className={`p-2.5 rounded-xl shrink-0 ${confirmModal.type === "danger" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                    {confirmModal.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed" id="confirm-modal-description">
                    {confirmModal.description}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 border-t border-slate-800/60 pt-4">
                <button
                  type="button"
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold cursor-pointer transition"
                  id="btn-confirm-cancel"
                >
                  {prompts.cancel[language as "fr" | "ht" | "en"] || "Annuler"}
                </button>
                <button
                  type="button"
                  id="btn-confirm-action"
                  onClick={() => {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    confirmModal.onConfirm();
                  }}
                  className={`px-4 py-2 rounded text-xs font-bold cursor-pointer transition ${
                    confirmModal.type === "danger"
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : "bg-cyan-400 hover:bg-cyan-550 text-slate-950"
                  }`}
                >
                  {confirmModal.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
