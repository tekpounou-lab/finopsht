import React, { useState } from "react";
import { useI18n } from "../i18n";
import { useNavigate } from "react-router-dom";
import { Role, Invitation, Business, Branch, Department } from "../types";
import { Shield, Mail, Lock, Sparkles, LogIn, Laptop, Info, User, Check, Eye, EyeOff, ArrowLeft, Home, RefreshCw } from "lucide-react";
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

        // 1. Authenticate with Firebase Auth
        const userCred = await createUserWithEmailAndPassword(auth, emailToFind, password);
        console.log("[UnifiedAuthPortal] Firebase Auth user created:", userCred.user.uid);

        // 2. Base user profile document
        const userDocRef = doc(db, "users", userCred.user.uid);
        const resolvedName = fullName.trim() || emailToFind.split("@")[0];
        
        // 3. Check for existing owner invitation matching this email
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
            .find((inv: any) => inv.status === "SENT" || inv.status === "PENDING");
        } catch (invScanErr) {
          console.warn("[UnifiedAuthPortal] Invitation check notice:", invScanErr);
        }

        const initialRole = activeInv ? (activeInv.role || "EMPLOYEE") : "UNASSIGNED";
        const initialStatus = activeInv ? "INVITED" : "NEW_USER";

        await setDoc(userDocRef, {
          id: userCred.user.uid,
          uid: userCred.user.uid,
          email: emailToFind,
          normalizedEmail: emailToFind,
          name: resolvedName,
          displayName: resolvedName,
          role: initialRole,
          account_status: initialStatus,
          onboarding_completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }, { merge: true });

        if (activeInv) {
          console.log("[UnifiedAuthPortal] Existing invitation from owner detected:", activeInv.id);
          try {
            await EnterpriseIdentityOrchestrator.acceptInvitation(activeInv.id, userCred.user);
            setAuthSuccessMsg("Invitation trouvée ! Accès immédiat à votre tableau de bord entreprise...");
          } catch (accErr) {
            console.warn("[UnifiedAuthPortal] Invitation auto-acceptance error:", accErr);
            setAuthSuccessMsg("Compte créé ! Accès à votre espace de travail...");
          }
        } else {
          console.log("[UnifiedAuthPortal] Genuine new user registration. Routing to deployment choice.");
          setAuthSuccessMsg("Compte créé avec succès ! Initialisation de votre espace...");
        }

        // Orchestrate identity
        await EnterpriseIdentityOrchestrator.orchestrate(userCred.user).catch((e) => {
          console.warn("[UnifiedAuthPortal] Post-registration orchestration warning:", e);
        });

        // Forensic audit log
        const forensic = {
          id: "f_auth_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: userCred.user.uid,
          userName: resolvedName,
          userRole: activeInv ? "EMPLOYEE" : "NEW_USER",
          business_id: activeInv?.business_id || "",
          action: activeInv ? "AUTH_MANUAL_SIGNUP_INVITE_MATCHED" : "AUTH_MANUAL_SIGNUP_WAITING_ROOM",
          beforeState: "{}",
          afterState: JSON.stringify({ email: emailToFind, hadInvite: Boolean(activeInv) }),
          ipAddress: "190.115.34.12",
          userAgent: window.navigator.userAgent,
          signature: "auth_signup_seal_" + Math.floor(Math.random() * 99999),
        };
        onAddForensicLog(forensic);

        setTimeout(() => {
          onLoginSuccess(null as any);
        }, 1000);

      } catch (err: any) {
        console.warn("[UnifiedAuthPortal] Manual signup failed:", err);
        let title = "Échec de l'inscription";
        let message = err.message || "Une erreur inconnue est survenue.";
        if (err.code === "auth/email-already-in-use") {
          title = "Email déjà utilisé";
          message = "Cette adresse email possède déjà un compte. Veuillez vous connecter avec votre mot de passe.";
        } else if (err.code === "auth/invalid-email") {
          title = "Adresse email invalide";
          message = "Veuillez saisir une adresse email valide (ex: utilisateur@icloud.com).";
        } else if (err.code === "auth/network-request-failed") {
          title = "Échec de l'inscription";
          message = "Firebase: Error (auth/network-request-failed).";
        }
        setAuthError({ title, message });
      } finally {
        setIsEmailLoading(false);
      }
      return;
    }

    // Flow 3: Manual Sign In
    setIsEmailLoading(true);
    try {
      console.log("[UnifiedAuthPortal] Running manual sign in for email:", email);
      const userCred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      setAuthSuccessMsg("Authentification manuelle réussie !");

      const forensic = {
        id: "f_auth_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: userCred.user.uid,
        userName: userCred.user.displayName || email.split("@")[0].toUpperCase(),
        userRole: "MAPPED",
        business_id: "",
        action: "AUTH_MANUAL_SIGNIN_SUCCESS",
        beforeState: "{}",
        afterState: JSON.stringify({ email: userCred.user.email }),
        ipAddress: "190.115.34.12",
        userAgent: window.navigator.userAgent,
        signature: "auth_signin_seal_" + Math.floor(Math.random() * 99999),
      };
      onAddForensicLog(forensic);

      try {
        const snapshot = await EnterpriseIdentityOrchestrator.orchestrate(userCred.user);
        if (snapshot.orchestratorState === "ERROR" || snapshot.terminalError === "NETWORK_OFFLINE" || snapshot.terminalError === "TIMEOUT_ERROR") {
          const isTimeout = snapshot.terminalError === "TIMEOUT_ERROR";
          setAuthError({
            title: isTimeout ? "Délai d'attente dépassé (10s)" : "Problème de connexion au profil",
            message: isTimeout
              ? "L'orchestration de votre profil a pris plus de 10 secondes en raison d'une instabilité du réseau. Veuillez réessayer."
              : "Impossible de récupérer votre profil en raison d'une indisponibilité du réseau. Veuillez réessayer.",
            isNetworkRetry: true
          });
          setIsEmailLoading(false);
          return;
        }
      } catch (resErr: any) {
        if (isNetworkError(resErr)) {
          setAuthError({
            title: "Problème de connexion au profil",
            message: "Délai de connexion dépassé lors du chargement de votre profil. Veuillez vérifier votre connexion et réessayer.",
            isNetworkRetry: true
          });
          setIsEmailLoading(false);
          return;
        }
      }

      setTimeout(() => {
        onLoginSuccess(null as any);
      }, 500);

    } catch (err: any) {
      console.warn("[UnifiedAuthPortal] Manual signin failed:", err);
      let title = "Échec de connexion";
      let message = "Impossible de se connecter avec ces identifiants.";
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.code === "auth/user-not-found") {
        message = "Identifiant ou mot de passe incorrect. Veuillez vérifier vos entrées.";
      }
      setAuthError({ title, message });
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
      
      // Handle scenario: manual account already exists with same email address
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
        return; // User manually cancelled, do not redirect
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

    // Forensic Log
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
    // Look for fallback redirect results upon component mount
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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative font-sans text-slate-100" id="auth-portal-wrapper">
      <div className="absolute inset-0 bg-radial-gradient from-cyan-900/10 via-transparent to-transparent pointer-events-none"></div>

      <div className="w-full max-w-md flex flex-col gap-5 relative z-10" id="auth-card-block">
        
        {/* LOGO AREA */}
        <div className="text-center flex flex-col items-center" id="auth-header-identity">
          <button
            onClick={() => { navigate("/"); }}
            className="w-12 h-12 bg-cyan-600 rounded-xl flex items-center justify-center font-black text-slate-950 text-2xl mx-auto shadow-lg shadow-cyan-500/20 mb-3 hover:bg-cyan-500 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group relative"
            id="launch-logo"
            title={language === "en" ? "Back to Home / Retour à l'accueil" : "Retour à l'accueil / Back to Home"}
          >
            F
            <span className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-700 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Home className="w-2.5 h-2.5 text-cyan-400" />
            </span>
          </button>

          <button 
            onClick={() => { navigate("/"); }}
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-cyan-400 transition-colors uppercase tracking-wider font-mono bg-slate-900/60 border border-slate-800/80 px-3 py-1 rounded-md mb-3 cursor-pointer hover:border-cyan-500/30 shadow-sm animate-pulse"
            id="back-home-button"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-cyan-500" />
            <span>{language === "en" ? "Back & Home" : language === "ht" ? "Retounen Lakay" : "Retour à l'Accueil"}</span>
          </button>

          <h1 className="text-base font-bold tracking-tight uppercase">
            FinOps <span className="text-cyan-500">Tek Pou Nou</span>
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-none font-mono mt-1">
            Fintech Enterprise OS
          </p>
        </div>

        {/* NOTIFICATION BANNER */}
        {authSuccessMsg && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs p-3.5 rounded-xl flex gap-2 items-center animate-pulse" id="auth-success-banner">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="font-semibold">{authSuccessMsg}</p>
          </div>
        )}

        {/* ERROR DISPLAY COMPONENT */}
        {authError && (
          <div className={`bg-rose-500/15 border text-[10.5px] p-4 rounded-xl flex gap-3 items-start animate-fadeIn ${authError.isDomainError ? 'border-rose-500' : 'border-rose-500/30'}`} id="auth-error-banner">
            <Info className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2 flex-1">
              <div>
                <span className="font-bold text-rose-400 uppercase tracking-wider font-mono">{authError.title}</span>
                <p className="text-rose-300 leading-relaxed mt-0.5">{authError.message}</p>
              </div>
              {authError.isNetworkRetry && (
                <button
                  type="button"
                  onClick={retryResolution}
                  className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 rounded-lg text-[11px] font-semibold w-fit transition-colors cursor-pointer"
                  id="auth-retry-btn"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span>{language === "en" ? "Retry Connection" : language === "ht" ? "Reyeseye Koneksyon" : "Réessayer la connexion"}</span>
                </button>
              )}
              {authError.isDomainError && (
                <div className="mt-2 bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[9px] text-slate-400 selection:bg-rose-900 overflow-x-auto">
                  {window.location.hostname}
                </div>
              )}
            </div>
            <button onClick={() => setAuthError(null)} className="text-rose-500 hover:text-rose-400 cursor-pointer p-1 rounded-full hover:bg-rose-500/10 transition-colors shrink-0 ml-auto" aria-label="Close error">
              &times;
            </button>
          </div>
        )}

        {/* MAIN AUTHENTICATION INTERFACE */}
        <div className="glass p-6 rounded-2xl flex flex-col gap-5 border border-slate-900 shadow-2xl relative overflow-hidden" id="auth-glass-box">
          
          {isRedirecting ? (
            <div className="py-12 flex flex-col items-center gap-3 text-center" id="redirect-loader">
              <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin"></div>
              <span className="text-xs text-cyan-400 font-mono uppercase tracking-wide">
                Redirecting to accounts.google fallback...
              </span>
            </div>
          ) : (
            <>
              {/* MODE SWITCHER TABS */}
              <div className="flex bg-slate-900/90 p-1 rounded-xl border border-slate-800/80 gap-1" id="auth-mode-tabs">
                <button
                  type="button"
                  id="tab-mode-signin"
                  onClick={() => {
                    setIsSignUp(false);
                    setAuthError(null);
                    setAuthSuccessMsg(null);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider font-mono transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
                    !isSignUp && !pendingLinking
                      ? "bg-cyan-600 text-slate-950 shadow-md font-bold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
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
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider font-mono transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
                    isSignUp && !pendingLinking
                      ? "bg-cyan-600 text-slate-950 shadow-md font-bold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Inscription Employé</span>
                </button>
              </div>

              {/* INFO CALLOUT FOR ICLOUD / MANUAL REGISTRATION */}
              {isSignUp && !pendingLinking && (
                <div className="p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl text-[11px] text-cyan-300 leading-relaxed flex items-start gap-2.5" id="icloud-info-box">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block text-cyan-200 mb-0.5">Inscription directe sans AuthProvider</span>
                    <span>Utilisez votre compte iCloud (ou autre email) et votre mot de passe. Si votre employeur vous a invité, vous accéderez directement à votre tableau de bord. Sinon, vous serez placé en salle d'attente.</span>
                  </div>
                </div>
              )}

              {pendingLinking ? (
                /* LINKING FORM */
                <form onSubmit={handleEmailAuth} className="flex flex-col gap-4" id="email-linking-form">
                  <div className="p-3 bg-cyan-950/30 border border-cyan-800/30 rounded-xl mb-1 text-[11px] text-cyan-300 leading-relaxed">
                     Entrez le mot de passe de votre compte existant pour lier la connexion Google : <strong>{pendingLinking.email}</strong>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      {t.organization.passLabel}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                      <input
                        id="linking-password-input"
                        type={showLinkingPassword ? "text" : "password"}
                        value={linkingPassword}
                        onChange={(e) => setLinkingPassword(e.target.value)}
                        placeholder="Mot de passe existant"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-9 pr-10 text-xs text-slate-200 outline-none focus:border-cyan-500"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLinkingPassword(!showLinkingPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                      >
                        {showLinkingPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingLinking(null);
                        setLinkingPassword("");
                        setAuthError(null);
                      }}
                      className="w-1/3 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-bold rounded-lg cursor-pointer transition font-mono uppercase tracking-wide"
                    >
                      Annuler
                    </button>
                    <button
                      id="btn-confirm-linking"
                      type="submit"
                      disabled={isEmailLoading}
                      className={`flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition font-mono uppercase tracking-wide flex items-center justify-center gap-2 ${
                        isEmailLoading ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      {isEmailLoading ? (
                        <div className="w-4 h-4 rounded-full border border-slate-900 border-t-transparent animate-spin"></div>
                      ) : (
                        <Check className="w-4 h-4 text-slate-950" />
                      )}
                      {isEmailLoading ? "Linking..." : "FUSIONNER"}
                    </button>
                  </div>
                </form>
              ) : (
                /* MAIN LOGIN OR SIGNUP FORM */
                <form onSubmit={handleEmailAuth} className="flex flex-col gap-4" id="email-login-form">
                  {isSignUp && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Nom complet
                      </label>
                      <div className="relative">
                        <User className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                        <input
                          id="register-fullname-input"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Jean-Baptiste Estimé"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-9 text-xs text-slate-200 outline-none focus:border-cyan-500 font-mono"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400">
                        {t.organization.emailLabel} {isSignUp && "(iCloud ou Email)"}
                      </label>
                      {/* ICLOUD HELPER CHIP */}
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
                          className="text-[9.5px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                          id="btn-quick-icloud"
                        >
                          + @icloud.com
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                      <input
                        id="login-email-input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="employe@icloud.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-9 text-xs text-slate-200 outline-none focus:border-cyan-500 font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                      {t.organization.passLabel}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                      <input
                        id="login-password-input"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-9 pr-10 text-xs text-slate-200 outline-none focus:border-cyan-500 font-sans"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isSignUp && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Confirmer le mot de passe
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-500" />
                        <input
                          id="register-confirm-password-input"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-9 pr-10 text-xs text-slate-200 outline-none focus:border-cyan-500 font-sans"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
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
                    className={`w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition font-mono uppercase tracking-wide flex items-center justify-center gap-2 ${
                      isEmailLoading ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {isEmailLoading ? (
                      <div className="w-4 h-4 rounded-full border border-slate-900 border-t-transparent animate-spin"></div>
                    ) : (
                      <LogIn className="w-4 h-4 text-slate-950" />
                    )}
                    {isEmailLoading 
                      ? a.processing 
                      : isSignUp 
                        ? "Créer mon compte" 
                        : t.organization.loginBtn
                    }
                  </button>

                  <div className="text-center mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setAuthError(null);
                        setAuthSuccessMsg(null);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 transition underline tracking-wide font-mono"
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
              <div className="flex items-center gap-3 text-[10px] text-slate-600 uppercase font-bold tracking-widest my-2" id="auth-form-divider">
                <div className="flex-1 h-[1px] bg-slate-900"></div>
                <span>{a.or}</span>
                <div className="flex-1 h-[1px] bg-slate-900"></div>
              </div>

              {/* Google Button Controls */}
              <div className="flex flex-col gap-2.5" id="social-login-tray">
                <button
                  id="btn-google-auth-popup"
                  onClick={handleGoogleAuthPopup}
                  disabled={isGoogleLoading || isRedirecting}
                  className={`w-full py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-xs font-semibold cursor-pointer text-slate-200 transition flex items-center justify-center gap-2 ${
                    isGoogleLoading || isRedirecting ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  {isGoogleLoading ? (
                    <div className="w-4 h-4 rounded-full border border-slate-500 border-t-slate-200 animate-spin"></div>
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.63 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02C6.21 7.57 8.87 5.04 12 5.04z" />
                      <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.46c-.28 1.48-1.12 2.74-2.38 3.58l3.69 2.87c2.16-1.99 3.42-4.93 3.42-8.56z" />
                      <path fill="#FBBC05" d="M5.28 14.78C5.04 14.07 4.9 13.3 4.9 12.5s.14-1.57.38-2.28L1.39 7.2C.5 8.98 0 10.98 0 13.1s.5 4.12 1.39 5.9l3.89-3.22z" />
                      <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.69-2.87c-1.02.68-2.33 1.09-3.9 1.09-3.13 0-5.79-2.53-6.74-5.54L.74 15.79C2.72 19.68 6.7 23 12 23z" />
                    </svg>
                  )}
                  {isGoogleLoading ? "Connecting..." : t.organization.googleLoginBtn}
                </button>
              </div>
            </>
          )}
        </div>

      </div>

    </div>
  );
}
