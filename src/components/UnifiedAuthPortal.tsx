import React, { useState } from "react";
import { useI18n } from "../i18n";
import { useNavigate } from "react-router-dom";
import { Role, Invitation, Business, Branch, Department } from "../types";
import { 
  Shield, Mail, Lock, Sparkles, LogIn, Laptop, Info, User, Check, Eye, EyeOff, 
  ArrowLeft, Home, RefreshCw, Building2, Globe, ShieldCheck, TrendingUp, Cpu 
} from "lucide-react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  linkWithCredential, 
  GoogleAuthProvider
} from "firebase/auth";
import { auth, db, getDbDoc, getDbCollection } from "../lib/firebase";
import { doc, setDoc, query, collection, where, getDocs, limit } from "firebase/firestore";
import { EnterpriseIdentityOrchestrator } from "../modules/identity/EnterpriseIdentityOrchestrator";
import { isNetworkError } from "../utils/resilientFirestore";

interface UnifiedAuthPortalProps {
  invitations: Invitation[];
  businesses: Business[];
  branches: Branch[];
  departments: Department[];
  onLoginSuccess: (user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    business_id: string;
    branchId: string;
    departmentId: string;
  }) => void;
  onAddForensicLog: (log: any) => void;
  onAddEvent: (ev: any) => void;
}

const authDict = {
  fr: {
    processing: "Traitement...",
    signUp: "S'inscrire",
    hasAccount: "Déjà un compte ? Se connecter",
    noAccount: "Pas encore de compte ? S'inscrire",
    or: "OU",
    linkSuccess: "Comptes liés avec succès ! Votre session Google est maintenant fusionnée.",
    incorrectPasswordTitle: "Mot de passe incorrect",
    incorrectPasswordMessage: "Le mot de passe saisi est incorrect pour l'adresse mail sélectionnée. Veuillez réessayer.",
    passwordsMismatchTitle: "Mots de passe non identiques",
    passwordsMismatchMessage: "Veuillez vous assurer que le mot de passe et sa confirmation correspondent.",
    passwordTooShortTitle: "Mot de passe trop court",
    passwordTooShortMessage: "Le mot de passe doit contenir au moins 6 caractères pour des raisons de sécurité FinOps.",
    emailTakenTitle: "Email déjà utilisé",
    emailTakenMessage: "Cette adresse email possède déjà un compte d'entreprise actif. Veuillez vous connecter au lieu de créer un nouveau compte."
  },
  ht: {
    processing: "Ap trete...",
    signUp: "Enskri",
    hasAccount: "Ou gen yon kont deja? Konekte",
    noAccount: "Poko gen yon kont? Enskri",
    or: "OSWA",
    linkSuccess: "Kont yo lye avèk siksè! Sesyon Google ou fize kounye a.",
    incorrectPasswordTitle: "Modpas pa kòrèk",
    incorrectPasswordMessage: "Modpas ou bay la pa kòrèk pou adrès imèl sa a. Tanpri reyeseye.",
    passwordsMismatchTitle: "Modpas yo pa menm",
    passwordsMismatchMessage: "Tanpri asire modpas la ak konfimasyon an koresponn.",
    passwordTooShortTitle: "Modpas la twò kout",
    passwordTooShortMessage: "Modpas la dwe genyen omwen 6 karaktè pou rezon sekirite finops.",
    emailTakenTitle: "Imèl sa a deja itilize",
    emailTakenMessage: "Adrès imèl sa a deja gen yon kont konpayi ki aktif. Tanpri konekte pito."
  },
  en: {
    processing: "Processing...",
    signUp: "Sign Up",
    hasAccount: "Already have an account? Sign In",
    noAccount: "No account yet? Sign Up",
    or: "OR",
    linkSuccess: "Accounts linked successfully! Your Google session is now merged.",
    incorrectPasswordTitle: "Incorrect password",
    incorrectPasswordMessage: "The password entered is incorrect for the selected email address. Please try again.",
    passwordsMismatchTitle: "Passwords do not match",
    passwordsMismatchMessage: "Please make sure that the password and its confirmation match.",
    passwordTooShortTitle: "Password too short",
    passwordTooShortMessage: "The password must contain at least 6 characters for FinOps security reasons.",
    emailTakenTitle: "Email already in use",
    emailTakenMessage: "This email address already has an active enterprise account. Please log in instead."
  }
};

export default function UnifiedAuthPortal({
  invitations,
  businesses,
  branches,
  departments,
  onLoginSuccess,
  onAddForensicLog,
  onAddEvent,
}: UnifiedAuthPortalProps) {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const activeLang = (language === 'fr' || language === 'ht' || language === 'en') ? language : 'fr';
  const a = authDict[activeLang];

  // Mode toggling
  const [isSignUp, setIsSignUp] = useState(false);

  // Input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Linking states (for merging manual and google auth seamlessly)
  const [pendingLinking, setPendingLinking] = useState<{ email: string; credential: any } | null>(null);
  const [linkingPassword, setLinkingPassword] = useState("");
  const [showLinkingPassword, setShowLinkingPassword] = useState(false);

  // UI state controllers
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<{ title: string; message: string; isDomainError?: boolean; isNetworkRetry?: boolean } | null>(null);

  const retryResolution = async () => {
    if (!auth.currentUser) return;
    setIsEmailLoading(true);
    setAuthError(null);
    try {
      const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(auth.currentUser);
      if (snapshot.orchestratorState === "ERROR" || snapshot.terminalError === "NETWORK_OFFLINE" || snapshot.terminalError === "TIMEOUT_ERROR") {
        const isTimeout = snapshot.terminalError === "TIMEOUT_ERROR";
        setAuthError({
          title: isTimeout ? "Délai d'attente dépassé (10s)" : "Problème de connexion",
          message: isTimeout 
            ? "L'orchestration de votre profil a pris plus de 10 secondes en raison d'une instabilité du réseau. Veuillez réessayer."
            : "Impossible de récupérer votre profil en raison d'une indisponibilité du réseau. Veuillez réessayer.",
          isNetworkRetry: true
        });
        return;
      }
      onLoginSuccess(null as any);
    } catch (err: any) {
      setAuthError({
        title: "Problème de connexion",
        message: "Délai de connexion dépassé lors du chargement de votre profil. Veuillez réessayer.",
        isNetworkRetry: true
      });
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Combined Email Submit for Manual SignUp, Manual SignIn, and Google Account Linking
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEmailLoading) return;
    setAuthError(null);
    setAuthSuccessMsg(null);

    // Flow 1: Account Linking with password confirmation
    if (pendingLinking) {
      if (!linkingPassword) return;
      setIsEmailLoading(true);
      try {
        console.log("[UnifiedAuthPortal] User attempting linking. Email:", pendingLinking.email);
        const userCred = await signInWithEmailAndPassword(auth, pendingLinking.email, linkingPassword);
        await linkWithCredential(userCred.user, pendingLinking.credential);
        
        setAuthSuccessMsg("Comptes liés avec succès ! Votre session Google est maintenant fusionnée.");

        // Forensic Action Audit Log
        const forensic = {
          id: "f_auth_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: userCred.user.uid,
          userName: userCred.user.displayName || pendingLinking.email.split("@")[0],
          userRole: "OWNER",
          business_id: "",
          action: "AUTH_LINK_CREDENTIAL_SUCCESS",
          beforeState: JSON.stringify({ email: pendingLinking.email }),
          afterState: JSON.stringify({ uid: userCred.user.uid, mergedProviders: ["google.com", "password"] }),
          ipAddress: "190.115.34.20",
          userAgent: window.navigator.userAgent,
          signature: "auth_link_seal_" + Math.floor(Math.random() * 99999),
        };
        onAddForensicLog(forensic);

        setPendingLinking(null);
        setLinkingPassword("");
        
        setTimeout(() => {
          onLoginSuccess(null as any);
        }, 1000);
      } catch (err: any) {
        console.warn("[UnifiedAuthPortal] Account linking failure:", err);
        setAuthError({
          title: a.incorrectPasswordTitle,
          message: a.incorrectPasswordMessage
        });
      } finally {
        setIsEmailLoading(false);
      }
      return;
    }

    if (!email) return;

    // Flow 2: Manual Sign Up registration (iCloud / Standard Email)
    if (isSignUp) {
      if (password !== confirmPassword) {
        setAuthError({
          title: a.passwordsMismatchTitle,
          message: a.passwordsMismatchMessage
        });
        return;
      }
      if (password.length < 6) {
        setAuthError({
          title: a.passwordTooShortTitle,
          message: a.passwordTooShortMessage
        });
        return;
      }

      setIsEmailLoading(true);
      try {
        const emailToFind = email.trim().toLowerCase();
        console.log("[UnifiedAuthPortal] Running manual employee registration for email:", emailToFind);

        const userCred = await createUserWithEmailAndPassword(auth, emailToFind, password);
        console.log("[UnifiedAuthPortal] Firebase Auth user created:", userCred.user.uid);

        const userDocRef = doc(db, "users", userCred.user.uid);
        const resolvedName = fullName.trim() || emailToFind.split("@")[0];
        
        let activeInv: any = null;
        try {
          const qInv = query(collection(db, "invitations"), where("email", "==", emailToFind), limit(5));
          const qNormInv = query(collection(db, "invitations"), where("normalizedEmail", "==", emailToFind), limit(5));
          const [snapInv, snapNormInv] = await Promise.all([
            getDocs(qInv).catch(() => null),
            getDocs(qNormInv).catch(() => null)
          ]);

          const allInvDocs = [...(snapInv?.docs || []), ...(snapNormInv?.docs || [])];
          activeInv = allInvDocs
            .map(d => ({ id: d.id, ...d.data() }))
            .find((inv: any) => inv.status === "PENDING" || inv.status === "ACTIVE" || !inv.status);
        } catch (invErr) {
          console.warn("[UnifiedAuthPortal] Invitation lookup warning:", invErr);
        }

        const initialRole = activeInv ? (activeInv.role || "EMPLOYEE") : "EMPLOYEE";
        const initialBizId = activeInv ? (activeInv.business_id || activeInv.businessId || "") : "";
        const initialBranchId = activeInv ? (activeInv.branchId || activeInv.branch_id || "") : "";
        const initialDeptId = activeInv ? (activeInv.departmentId || activeInv.department_id || "") : "";

        await setDoc(userDocRef, {
          id: userCred.user.uid,
          uid: userCred.user.uid,
          email: emailToFind,
          name: resolvedName,
          displayName: resolvedName,
          role: initialRole,
          business_id: initialBizId,
          businessId: initialBizId,
          branchId: initialBranchId,
          departmentId: initialDeptId,
          accountStatus: "ACTIVE",
          status: "ACTIVE",
          createdAt: new Date().toISOString()
        }, { merge: true });

        setAuthSuccessMsg("Compte créé avec succès ! Redirection en cours...");
        onAddEvent({
          id: "ev_reg_" + Date.now(),
          type: "USER_REGISTERED",
          description: `Inscription manuelle réussie pour ${emailToFind}`,
          timestamp: new Date().toISOString()
        });

        setTimeout(() => {
          onLoginSuccess({
            id: userCred.user.uid,
            email: emailToFind,
            name: resolvedName,
            role: initialRole as Role,
            business_id: initialBizId,
            branchId: initialBranchId,
            departmentId: initialDeptId
          });
        }, 800);
      } catch (err: any) {
        console.error("[UnifiedAuthPortal] Registration error:", err);
        let msg = err.message || "Erreur lors de la création du compte.";
        if (err.code === 'auth/email-already-in-use') {
          msg = a.emailTakenMessage;
        }
        setAuthError({
          title: "Erreur d'inscription",
          message: msg
        });
      } finally {
        setIsEmailLoading(false);
      }
      return;
    }

    // Flow 3: Manual Sign In
    setIsEmailLoading(true);
    try {
      const emailToLogin = email.trim();
      console.log("[UnifiedAuthPortal] Attempting sign-in for:", emailToLogin);

      const userCred = await signInWithEmailAndPassword(auth, emailToLogin, password);
      console.log("[UnifiedAuthPortal] Sign-in successful. UID:", userCred.user.uid);

      setAuthSuccessMsg("Connexion réussie ! Chargement de votre session...");

      if (auth.currentUser) {
        const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(auth.currentUser);
        if (snapshot.orchestratorState === "ERROR" || snapshot.terminalError === "NETWORK_OFFLINE" || snapshot.terminalError === "TIMEOUT_ERROR") {
          const isTimeout = snapshot.terminalError === "TIMEOUT_ERROR";
          setAuthError({
            title: isTimeout ? "Délai d'attente dépassé (10s)" : "Problème de connexion",
            message: isTimeout 
              ? "L'orchestration de votre profil a pris plus de 10 secondes en raison d'une instabilité du réseau. Veuillez réessayer."
              : "Impossible de récupérer votre profil en raison d'une indisponibilité du réseau. Veuillez réessayer.",
            isNetworkRetry: true
          });
          setIsEmailLoading(false);
          return;
        }
      }

      setTimeout(() => {
        onLoginSuccess(null as any);
      }, 600);
    } catch (err: any) {
      console.warn("[UnifiedAuthPortal] Sign-in error:", err);
      let errMsg = err.message || "Identifiants invalides.";
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        errMsg = "Email ou mot de passe incorrect. Veuillez vérifier vos identifiants.";
      }
      setAuthError({
        title: a.incorrectPasswordTitle,
        message: errMsg
      });
    } finally {
      setIsEmailLoading(false);
    }
  };

  // Google Login popup authentication with account recovery and provider merging
  const handleGoogleAuthPopup = async () => {
    if (isGoogleLoading || isRedirecting) return;
    setAuthError(null);
    setAuthSuccessMsg(null);
    
    try {
      setIsGoogleLoading(true);
      const { loginWithGooglePopup } = await import("../lib/firebase");
      const result = await loginWithGooglePopup();
      if (result && result.user) {
        handleSelectGoogleProfile(result.user.email || "", result.user.displayName || "Utilisateur Google");
      }
    } catch (error: any) {
      console.log("[UnifiedAuthPortal] Google auth error caught:", error.code, error.message);
      
      if (error.code === 'auth/account-exists-with-different-credential' || error.message?.includes('different-credential')) {
        const provEmail = error.customData?.email || error.email || (error as any).email || email;
        const provCred = GoogleAuthProvider.credentialFromError(error);
        if (provEmail && provCred) {
          setPendingLinking({ email: provEmail, credential: provCred });
          setAuthError({
            title: "Fusion de comptes requise",
            message: `L'email ${provEmail} possède déjà un mot de passe enregistré. Veuillez saisir votre mot de passe pour lier votre compte Google à votre profil FinOps existant.`
          });
        }
        return;
      }

      if (error.code === 'auth/unauthorized-domain') {
        setAuthError({
          title: "Domaine non autorisé",
          message: `L'URL de cette application (${window.location.hostname}) n'est pas autorisée dans votre projet Firebase. Veuillez l'ajouter dans la console Firebase (Authentication > Paramètres > Domaines autorisés).`,
          isDomainError: true
        });
        return;
      }
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        return;
      }
      
      console.warn("Popup authentication failed, attempting redirect fallback...", error);
      handleGoogleRedirectFallback();
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSelectGoogleProfile = async (gEmail: string, gName: string) => {
    setIsPopupOpen(false);
    setAuthSuccessMsg("Session Google établie !");

    const forensic = {
      id: "f_auth_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      userId: auth.currentUser?.uid || "google_std",
      userName: gName,
      userRole: "MAPPED",
      business_id: "",
      action: "AUTH_GOOGLE_SUCCESS",
      beforeState: "{}",
      afterState: JSON.stringify({ email: gEmail }),
      ipAddress: "24.23.45.10",
      userAgent: window.navigator.userAgent,
      signature: "google_auth_seal_" + Math.floor(Math.random() * 99999),
    };
    onAddForensicLog(forensic);

    if (auth.currentUser) {
      try {
        const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(auth.currentUser);
        if (snapshot.orchestratorState === "ERROR" || snapshot.terminalError === "NETWORK_OFFLINE" || snapshot.terminalError === "TIMEOUT_ERROR") {
          const isTimeout = snapshot.terminalError === "TIMEOUT_ERROR";
          setAuthError({
            title: isTimeout ? "Délai d'attente dépassé (10s)" : "Problème de connexion au profil",
            message: isTimeout
              ? "L'orchestration de votre profil a pris plus de 10 secondes en raison d'une instabilité du réseau. Veuillez réessayer."
              : "Impossible de récupérer votre profil en raison d'une indisponibilité du réseau. Veuillez réessayer.",
            isNetworkRetry: true
          });
          return;
        }
      } catch (resErr: any) {
        if (isNetworkError(resErr)) {
          setAuthError({
            title: "Problème de connexion au profil",
            message: "Délai de connexion dépassé lors du chargement de votre profil. Veuillez vérifier votre connexion et réessayer.",
            isNetworkRetry: true
          });
          return;
        }
      }
    }

    setTimeout(() => {
      onLoginSuccess(null as any);
    }, 500);
  };

  const handleGoogleRedirectFallback = async () => {
    try {
      setIsRedirecting(true);
      const { auth, googleProvider } = await import("../lib/firebase");
      const { signInWithRedirect } = await import("firebase/auth");
      await signInWithRedirect(auth, googleProvider);
    } catch (error: any) {
      console.warn("[UnifiedAuthPortal] Redirect fallback error:", error);
      setIsRedirecting(false);
      if (error.code === 'auth/unauthorized-domain') {
        setAuthError({
          title: "Domaine non autorisé",
          message: `L'URL de cette application (${window.location.hostname}) n'est pas autorisée dans votre projet Firebase.`,
          isDomainError: true
        });
      }
    }
  };

  React.useEffect(() => {
    import("../lib/firebase").then(({ handleRedirectResult }) => {
      handleRedirectResult().then(result => {
        if (result && result.user) {
          handleSelectGoogleProfile(result.user.email || "", result.user.displayName || "Utilisateur");
        }
      }).catch((error: any) => {
        console.error("Redirect check failed:", error);
        if (error.code === 'auth/unauthorized-domain') {
           setAuthError({
             title: "Domaine non autorisé",
             message: `L'URL de cette application (${window.location.hostname}) n'est pas autorisée dans votre projet Firebase.`,
             isDomainError: true
           });
        }
      });
    });
  }, []);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#071426] text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950" id="auth-portal-wrapper">
      
      {/* LEFT PANEL — BRAND & FINANCIAL TECHNOLOGY EXPERIENCE (~55%) */}
      <div className="lg:col-span-7 xl:col-span-7 relative overflow-hidden bg-gradient-to-br from-[#071426] via-[#0B1F35] to-[#040D1A] p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800/80">
        
        {/* Background abstract financial network pattern glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(8,166,197,0.15),transparent_50%)] pointer-events-none"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(22,199,232,0.08),transparent_40%)] pointer-events-none"></div>
        
        {/* Top Header Identity */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { navigate("/"); }}
              className="w-10 h-10 bg-gradient-to-tr from-cyan-600 to-cyan-400 rounded-xl flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group"
              id="launch-logo"
              title={language === "en" ? "Back to Home" : "Retour à l'accueil"}
            >
              F
            </button>
            <div>
              <h1 className="text-sm font-bold tracking-tight uppercase text-white font-mono">
                FinOps <span className="text-cyan-400">Tek Pou Nou</span>
              </h1>
              <p className="text-[10px] text-cyan-300/80 uppercase tracking-widest leading-none font-mono">
                Fintech Enterprise OS
              </p>
            </div>
          </div>

          <button 
            onClick={() => { navigate("/"); }}
            className="flex items-center gap-1.5 text-[11px] text-slate-300 hover:text-cyan-400 transition-colors uppercase tracking-wider font-mono bg-slate-900/80 border border-slate-700/80 px-3 py-1.5 rounded-lg cursor-pointer hover:border-cyan-500/50 shadow-sm"
            id="back-home-button"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
            <span>{language === "en" ? "Home" : language === "ht" ? "Lakay" : "Accueil"}</span>
          </button>
        </div>

        {/* Center Promotional & Strategic Narrative */}
        <div className="relative z-10 my-auto py-12 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-[11px] font-mono mb-6 shadow-inner">
            <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Plateforme financière souveraine & unifiée</span>
          </div>

          <h2 className="text-3xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.15] mb-6">
            La finance intelligente. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-cyan-500">
              Une nouvelle dimension.
            </span>
          </h2>

          <p className="text-sm lg:text-base text-slate-300 leading-relaxed mb-8">
            Pilotez vos finances, maîtrisez vos opérations et prenez de meilleures décisions grâce à une plateforme financière conçue pour votre entreprise.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-slate-200">Gestion financière intégrée</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-slate-200">Contrôle des opérations</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-slate-200">Intelligence décisionnelle</span>
            </div>
          </div>
        </div>

        {/* Bottom Footer Notice */}
        <div className="relative z-10 pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 font-mono gap-3">
          <span>FINOPS — FINTECH ENTERPRISE OS</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-cyan-400" /> Sécurisé par RBAC & ISO</span>
            <span>v4.0 Enterprise</span>
          </div>
        </div>
      </div>


      {/* RIGHT PANEL — CLEAN ENTERPRISE AUTHENTICATION FORM (~45%) */}
      <div className="lg:col-span-5 xl:col-span-5 bg-[#F5F8FC] text-[#172B42] p-8 lg:p-12 flex flex-col justify-center items-center relative">
        
        <div className="w-full max-w-[420px] mx-auto flex flex-col gap-6">

          {/* Form Header */}
          <div className="text-left" id="auth-right-header">
            <div className="inline-block p-2.5 bg-cyan-600/10 rounded-xl text-cyan-700 mb-3 border border-cyan-600/20">
              <Shield className="w-6 h-6 text-cyan-600" />
            </div>
            <h3 className="text-xl lg:text-2xl font-bold text-[#172B42] tracking-tight">
              Bienvenue sur FINOPS
            </h3>
            <p className="text-xs text-[#718096] mt-1 font-sans">
              Connectez-vous à votre espace professionnel et gérez vos flux.
            </p>
          </div>

          {/* NOTIFICATION BANNER */}
          {authSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3.5 rounded-xl flex gap-2 items-center shadow-sm" id="auth-success-banner">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="font-semibold">{authSuccessMsg}</p>
            </div>
          )}

          {/* ERROR DISPLAY COMPONENT */}
          {authError && (
            <div className={`bg-rose-50 border text-xs p-4 rounded-xl flex gap-3 items-start shadow-sm ${authError.isDomainError ? 'border-rose-300' : 'border-rose-200'}`} id="auth-error-banner">
              <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1.5 flex-1">
                <span className="font-bold text-rose-900 uppercase tracking-wider font-mono text-[10px]">{authError.title}</span>
                <p className="text-rose-700 leading-relaxed text-xs">
                  {authError.message?.includes("network-request-failed") || authError.message?.includes("auth/network-request-failed")
                    ? "Impossible de contacter le serveur d'authentification. Veuillez vérifier votre connexion Internet et réessayer."
                    : authError.message?.replace(/^Firebase:\s*/i, "").replace(/Error\s*\(auth\/[^)]+\)\.?/gi, "").trim() || authError.message
                  }
                </p>
                {authError.isNetworkRetry && (
                  <button
                    type="button"
                    onClick={retryResolution}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold w-fit transition-colors cursor-pointer shadow-sm"
                    id="auth-retry-btn"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Réessayer la connexion</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* MAIN AUTHENTICATION CARD */}
          <div className="bg-white p-6 lg:p-8 rounded-2xl flex flex-col gap-5 border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden" id="auth-glass-box">
            
            {isRedirecting ? (
              <div className="py-12 flex flex-col items-center gap-3 text-center" id="redirect-loader">
                <div className="w-8 h-8 rounded-full border-2 border-cyan-600 border-t-transparent animate-spin"></div>
                <span className="text-xs text-cyan-700 font-mono uppercase tracking-wide">
                  Redirection vers l'authentification Google...
                </span>
              </div>
            ) : (
              <>
                {/* MODE SWITCHER TABS */}
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1" id="auth-mode-tabs">
                  <button
                    type="button"
                    id="tab-mode-signin"
                    onClick={() => {
                      setIsSignUp(false);
                      setAuthError(null);
                      setAuthSuccessMsg(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
                      !isSignUp && !pendingLinking
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                    }`}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Connexion</span>
                  </button>
                  <button
                    type="button"
                    id="tab-mode-signup"
                    onClick={() => {
                      setIsSignUp(true);
                      setAuthError(null);
                      setAuthSuccessMsg(null);
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider font-mono transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
                      isSignUp && !pendingLinking
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Inscription</span>
                  </button>
                </div>

                {/* INFO CALLOUT FOR ICLOUD / MANUAL REGISTRATION */}
                {isSignUp && !pendingLinking && (
                  <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-[11px] text-cyan-900 leading-relaxed flex items-start gap-2.5" id="icloud-info-box">
                    <Info className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block text-cyan-950 mb-0.5">Inscription directe employé</span>
                      <span>Utilisez votre email et un mot de passe sécurisé. Si vous avez une invitation active, vous rejoindrez votre entreprise.</span>
                    </div>
                  </div>
                )}

                {pendingLinking ? (
                  /* LINKING FORM */
                  <form onSubmit={handleEmailAuth} className="flex flex-col gap-4" id="email-linking-form">
                    <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl mb-1 text-[11px] text-cyan-900 leading-relaxed">
                       Entrez le mot de passe de votre compte existant pour lier la connexion Google : <strong>{pendingLinking.email}</strong>
                    </div>
                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1 font-mono">
                        {t.organization.passLabel}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input
                          id="linking-password-input"
                          type={showLinkingPassword ? "text" : "password"}
                          value={linkingPassword}
                          onChange={(e) => setLinkingPassword(e.target.value)}
                          placeholder="Mot de passe existant"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 pl-10 pr-10 text-xs text-slate-900 outline-none focus:border-cyan-600 focus:bg-white transition"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowLinkingPassword(!showLinkingPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
                        >
                          {showLinkingPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingLinking(null);
                          setLinkingPassword("");
                          setAuthError(null);
                        }}
                        className="w-1/3 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition font-mono uppercase tracking-wide"
                      >
                        Annuler
                      </button>
                      <button
                        id="btn-confirm-linking"
                        type="submit"
                        disabled={isEmailLoading}
                        className={`flex-1 py-3 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl cursor-pointer transition font-mono uppercase tracking-wide flex items-center justify-center gap-2 shadow-md shadow-cyan-600/20 ${
                          isEmailLoading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {isEmailLoading ? (
                          <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                        ) : (
                          <Check className="w-4 h-4 text-white" />
                        )}
                        {isEmailLoading ? "Fusion..." : "FUSIONNER"}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* MAIN LOGIN OR SIGNUP FORM */
                  <form onSubmit={handleEmailAuth} className="flex flex-col gap-4" id="email-login-form">
                    {isSignUp && (
                      <div>
                        <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1 font-mono">
                          Nom complet
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                          <input
                            id="register-fullname-input"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Jean-Baptiste Estimé"
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 pl-10 text-xs text-slate-900 outline-none focus:border-cyan-600 focus:bg-white transition font-sans"
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] uppercase font-bold text-slate-700 font-mono">
                          {t.organization.emailLabel}
                        </label>
                        {(!email || !email.includes("@")) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (email) {
                                setEmail(`${email}@icloud.com`);
                              } else {
                                setEmail("@icloud.com");
                              }
                            }}
                            className="text-[10px] font-mono text-cyan-700 hover:text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors font-semibold"
                            id="btn-quick-icloud"
                          >
                            + @icloud.com
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input
                          id="login-email-input"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="nom@entreprise.com"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 pl-10 text-xs text-slate-900 outline-none focus:border-cyan-600 focus:bg-white transition font-sans"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1 font-mono">
                        {t.organization.passLabel}
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input
                          id="login-password-input"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 pl-10 pr-10 text-xs text-slate-900 outline-none focus:border-cyan-600 focus:bg-white transition font-sans"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {isSignUp && (
                      <div>
                        <label className="block text-[11px] uppercase font-bold text-slate-700 mb-1 font-mono">
                          Confirmer le mot de passe
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                          <input
                            id="register-confirm-password-input"
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••••••"
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 pl-10 pr-10 text-xs text-slate-900 outline-none focus:border-cyan-600 focus:bg-white transition font-sans"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-3 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      id="btn-login-email-submit"
                      type="submit"
                      disabled={isEmailLoading}
                      className={`w-full py-3.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl cursor-pointer transition font-mono uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-cyan-600/25 mt-2 ${
                        isEmailLoading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {isEmailLoading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                      ) : (
                        <LogIn className="w-4 h-4 text-white" />
                      )}
                      {isEmailLoading 
                        ? a.processing 
                        : isSignUp 
                          ? "Créer mon compte" 
                          : "SE CONNECTER"
                      }
                    </button>

                    <div className="text-center mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSignUp(!isSignUp);
                          setAuthError(null);
                          setAuthSuccessMsg(null);
                        }}
                        className="text-xs text-cyan-700 hover:text-cyan-900 transition underline tracking-wide font-medium cursor-pointer"
                      >
                        {isSignUp 
                          ? a.hasAccount 
                          : a.noAccount
                        }
                      </button>
                    </div>
                  </form>
                )}

                {/* Divider */}
                <div className="flex items-center gap-3 text-[10px] text-slate-400 uppercase font-bold tracking-widest my-1" id="auth-form-divider">
                  <div className="flex-1 h-[1px] bg-slate-200"></div>
                  <span>{a.or}</span>
                  <div className="flex-1 h-[1px] bg-slate-200"></div>
                </div>

                {/* Google Button Controls */}
                <div className="flex flex-col gap-2.5" id="social-login-tray">
                  <button
                    id="btn-google-auth-popup"
                    onClick={handleGoogleAuthPopup}
                    disabled={isGoogleLoading || isRedirecting}
                    className={`w-full py-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold cursor-pointer text-slate-700 transition flex items-center justify-center gap-2.5 shadow-sm ${
                      isGoogleLoading || isRedirecting ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {isGoogleLoading ? (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-slate-700 animate-spin"></div>
                    ) : (
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.63 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02C6.21 7.57 8.87 5.04 12 5.04z" />
                        <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.46c-.28 1.48-1.12 2.74-2.38 3.58l3.69 2.87c2.16-1.99 3.42-4.93 3.42-8.56z" />
                        <path fill="#FBBC05" d="M5.28 14.78C5.04 14.07 4.9 13.3 4.9 12.5s.14-1.57.38-2.28L1.39 7.2C.5 8.98 0 10.98 0 13.1s.5 4.12 1.39 5.9l3.89-3.22z" />
                        <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.69-2.87c-1.02.68-2.33 1.09-3.9 1.09-3.13 0-5.79-2.53-6.74-5.54L.74 15.79C2.72 19.68 6.7 23 12 23z" />
                      </svg>
                    )}
                    {isGoogleLoading ? "Connexion..." : "Continuer avec Google"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Right Panel Footer */}
          <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-4 font-mono pt-2">
            <span className="hover:text-slate-800 cursor-pointer transition">Confidentialité</span>
            <span>•</span>
            <span className="hover:text-slate-800 cursor-pointer transition">Assistance</span>
            <span>•</span>
            <span className="hover:text-slate-800 cursor-pointer transition">Sécurité</span>
          </div>

        </div>
      </div>

    </div>
  );
}
