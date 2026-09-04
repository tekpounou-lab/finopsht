import React, { useState } from "react";
import { 
  Lock, 
  ShieldCheck, 
  Key, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Mail, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  Link as LinkIcon
} from "lucide-react";
import { 
  EmailAuthProvider, 
  linkWithCredential, 
  updatePassword, 
  reauthenticateWithPopup,
  linkWithPopup 
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useI18n } from "../../i18n";
import { AuditService } from "../../services/audit/AuditService";
import { toast } from "sonner";

interface SecurityCredentialsManagerProps {
  onSuccess?: () => void;
  className?: string;
  variant?: "full" | "compact";
}

const dict = {
  fr: {
    title: "Sécurité & Méthodes d'Authentification",
    desc: "Gérez vos accès et configurez un mot de passe pour vous connecter sans dépendre uniquement de Google.",
    googleProvider: "Compte Google",
    passwordProvider: "Mot de passe d'Entreprise",
    linked: "Lié & Actif",
    notConfigured: "Non configuré (Google uniquement)",
    addPasswordTitle: "Définir un Mot de Passe Personnel",
    addPasswordDesc: "Vous vous êtes initialement connecté avec Google. Définissez un mot de passe pour vous connecter également avec votre adresse email.",
    changePasswordTitle: "Modifier votre Mot de Passe",
    changePasswordDesc: "Mettez à jour le mot de passe associé à votre compte.",
    emailLabel: "Adresse email (Immuable)",
    newPassLabel: "Nouveau mot de passe",
    confirmPassLabel: "Confirmer le mot de passe",
    savePassBtn: "Enregistrer mon mot de passe",
    updatePassBtn: "Mettre à jour le mot de passe",
    cancelBtn: "Annuler",
    btnOpenAdd: "Ajouter un mot de passe",
    btnOpenChange: "Modifier le mot de passe",
    passwordsMismatch: "Les deux mots de passe ne correspondent pas.",
    passwordTooShort: "Le mot de passe doit comporter au moins 6 caractères.",
    successAdded: "Mot de passe configuré avec succès ! Vous pouvez désormais vous connecter soit avec Google, soit avec votre email et ce mot de passe.",
    successUpdated: "Mot de passe mis à jour avec succès !",
    linkGoogleBtn: "Lier mon compte Google",
    linkGoogleSuccess: "Compte Google lié avec succès !"
  },
  ht: {
    title: "Sekirite ak Metòd Koneksyon",
    desc: "Jere fason ou konekte epi mete yon modpas pou ou ka konekte san ou pa bezwen Google sèlman.",
    googleProvider: "Kont Google",
    passwordProvider: "Modpas Konpayi",
    linked: "Lye & Aktif",
    notConfigured: "Poko gen modpas (Google sèlman)",
    addPasswordTitle: "Mete yon Modpas Pèsonèl",
    addPasswordDesc: "Ou te konekte okòmansman ak Google. Ou ka mete yon modpas kounye a pou w ka konekte ak imèl ou tou.",
    changePasswordTitle: "Chanje Modpas Ou",
    changePasswordDesc: "Mete yon nouvo modpas pou kont ou.",
    emailLabel: "Adrès imèl (Pa ka chanje)",
    newPassLabel: "Nouvo modpas",
    confirmPassLabel: "Konfime modpas la",
    savePassBtn: "Sove Modpas la",
    updatePassBtn: "Mete Modpas la a Jou",
    cancelBtn: "Anile",
    btnOpenAdd: "Ajoute yon modpas",
    btnOpenChange: "Chanje modpas",
    passwordsMismatch: "De modpas yo pa menm.",
    passwordTooShort: "Modpas la dwe genyen omwen 6 lèt.",
    successAdded: "Modpas la anrejistre avèk siksè! Kounye a ou ka konekte swa ak Google, swa ak imèl ak modpas sa a.",
    successUpdated: "Modpas la chanje avèk siksè !",
    linkGoogleBtn: "Lye kont Google mwen",
    linkGoogleSuccess: "Kont Google lye avèk siksè !"
  },
  en: {
    title: "Security & Authentication Methods",
    desc: "Manage your sign-in methods and set a password to log in without relying exclusively on Google.",
    googleProvider: "Google Account",
    passwordProvider: "Enterprise Password",
    linked: "Linked & Active",
    notConfigured: "Not set (Google only)",
    addPasswordTitle: "Set a Personal Password",
    addPasswordDesc: "You originally signed in with Google. Set a password now to also sign in using your email address and password.",
    changePasswordTitle: "Update your Password",
    changePasswordDesc: "Update the password associated with your account.",
    emailLabel: "Email address (Immutable)",
    newPassLabel: "New password",
    confirmPassLabel: "Confirm password",
    savePassBtn: "Save Password",
    updatePassBtn: "Update Password",
    cancelBtn: "Cancel",
    btnOpenAdd: "Add a password",
    btnOpenChange: "Change password",
    passwordsMismatch: "Passwords do not match.",
    passwordTooShort: "Password must be at least 6 characters.",
    successAdded: "Password successfully configured! You can now sign in using either Google or your email and this password.",
    successUpdated: "Password updated successfully!",
    linkGoogleBtn: "Link Google account",
    linkGoogleSuccess: "Google account linked successfully!"
  }
};

export const SecurityCredentialsManager: React.FC<SecurityCredentialsManagerProps> = ({
  onSuccess,
  className = "",
  variant = "full"
}) => {
  const { user, dbUser } = useAuth();
  const { language } = useI18n();
  const activeLang = (language === "fr" || language === "ht" || language === "en") ? language : "fr";
  const t = dict[activeLang];

  const providers = user?.providerData || [];
  const hasGoogle = providers.some((p: any) => p.providerId === "google.com");
  const hasPassword = providers.some((p: any) => p.providerId === "password");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLinkGoogle = async () => {
    if (!auth.currentUser) return;
    setIsLinkingGoogle(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await linkWithPopup(auth.currentUser, googleProvider);
      const userRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userRef, {
        auth_provider: "google.com",
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await AuditService.writeLog({
        id: `f_lnk_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email || "User",
        userRole: dbUser?.role || "EMPLOYEE",
        business_id: dbUser?.business_id || "biz_default",
        action: "AUTH_LINK_GOOGLE_SUCCESS"
      });

      toast.success(t.linkGoogleSuccess);
      setSuccessMsg(t.linkGoogleSuccess);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("[SecurityCredentialsManager] Link Google error:", err);
      if (err.code === "auth/provider-already-linked") {
        setErrorMsg("Ce compte Google est déjà associé.");
      } else if (err.code === "auth/credential-already-in-use") {
        setErrorMsg("Ce compte Google est déjà utilisé par un autre profil.");
      } else {
        setErrorMsg(err.message || "Erreur de liaison Google.");
      }
    } finally {
      setIsLinkingGoogle(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 6) {
      setErrorMsg(t.passwordTooShort);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg(t.passwordsMismatch);
      return;
    }

    setLoading(true);

    try {
      const emailToUse = auth.currentUser.email;
      if (!emailToUse) {
        throw new Error("Aucune adresse email trouvée sur votre profil de session.");
      }

      if (!hasPassword) {
        // User originally signed in with Google -> Link Email & Password credential
        const credential = EmailAuthProvider.credential(emailToUse, newPassword);
        try {
          await linkWithCredential(auth.currentUser, credential);
        } catch (linkErr: any) {
          // If recent login is required, re-authenticate via Google popup first
          if (linkErr.code === "auth/requires-recent-login" && hasGoogle) {
            console.log("[SecurityCredentialsManager] Session stale, re-authenticating with Google popup...");
            await reauthenticateWithPopup(auth.currentUser, googleProvider);
            await linkWithCredential(auth.currentUser, credential);
          } else {
            throw linkErr;
          }
        }
      } else {
        // User already has password -> update password
        try {
          await updatePassword(auth.currentUser, newPassword);
        } catch (updErr: any) {
          if (updErr.code === "auth/requires-recent-login" && hasGoogle) {
            console.log("[SecurityCredentialsManager] Session stale, re-authenticating with Google popup...");
            await reauthenticateWithPopup(auth.currentUser, googleProvider);
            await updatePassword(auth.currentUser, newPassword);
          } else {
            throw updErr;
          }
        }
      }

      // Update Firestore user document
      const userRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userRef, {
        has_password: true,
        auth_providers: auth.currentUser.providerData.map((p: any) => p.providerId),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // Audit Log
      await AuditService.writeLog({
        id: `f_auth_pwd_${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "User",
        userRole: dbUser?.role || "EMPLOYEE",
        business_id: dbUser?.business_id || "biz_default",
        action: hasPassword ? "AUTH_PASSWORD_UPDATED" : "AUTH_PASSWORD_ADDED_FOR_GOOGLE_USER",
        email: emailToUse
      });

      const message = hasPassword ? t.successUpdated : t.successAdded;
      toast.success(message);
      setSuccessMsg(message);
      setNewPassword("");
      setConfirmPassword("");
      setIsFormOpen(false);

      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("[SecurityCredentialsManager] Password save error:", err);
      if (err.code === "auth/requires-recent-login") {
        setErrorMsg("Votre session est expirée. Veuillez vous reconnecter pour valider la modification.");
      } else if (err.code === "auth/weak-password") {
        setErrorMsg(t.passwordTooShort);
      } else if (err.code === "auth/provider-already-linked") {
        setErrorMsg("Un mot de passe est déjà associé à ce compte.");
      } else {
        setErrorMsg(err.message || "Erreur lors de la configuration du mot de passe.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`} id="security-credentials-manager-root">
      {/* HEADER SUMMARY */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
            <Lock className="w-4 h-4 text-cyan-400" />
            {t.title}
          </h4>
          <p className="text-[11px] text-slate-400 font-sans mt-0.5">
            {t.desc}
          </p>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-mono animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 font-mono animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* PROVIDERS STATUS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* GOOGLE STATUS CARD */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.63 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.89 3.02C6.21 7.57 8.87 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.47h6.46c-.28 1.48-1.12 2.74-2.38 3.58l3.69 2.87c2.16-1.99 3.42-4.93 3.42-8.56z" />
                <path fill="#FBBC05" d="M5.28 14.78C5.04 14.07 4.9 13.3 4.9 12.5s.14-1.57.38-2.28L1.39 7.2C.5 8.98 0 10.98 0 13.1s.5 4.12 1.39 5.9l3.89-3.22z" />
                <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.69-2.87c-1.02.68-2.33 1.09-3.9 1.09-3.13 0-5.79-2.53-6.74-5.54L.74 15.79C2.72 19.68 6.7 23 12 23z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200 font-sans">{t.googleProvider}</p>
              <p className="text-[10px] text-slate-400 font-mono">
                {hasGoogle ? (user?.email || "Connecté") : "Non lié"}
              </p>
            </div>
          </div>

          {hasGoogle ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1">
              <Check className="w-3 h-3" />
              {t.linked}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleLinkGoogle}
              disabled={isLinkingGoogle}
              className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isLinkingGoogle ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
              {t.linkGoogleBtn}
            </button>
          )}
        </div>

        {/* PASSWORD STATUS CARD */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
              <Key className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200 font-sans">{t.passwordProvider}</p>
              <p className="text-[10px] text-slate-400 font-mono">
                {hasPassword ? "Actif & Protégé" : t.notConfigured}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsFormOpen(!isFormOpen);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer flex items-center gap-1.5 ${
              hasPassword
                ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20"
            }`}
            id="btn-toggle-password-form"
          >
            <Key className="w-3 h-3" />
            {hasPassword ? t.btnOpenChange : t.btnOpenAdd}
          </button>
        </div>
      </div>

      {/* SPECIAL NOTICE FOR GOOGLE USERS WITHOUT PASSWORD */}
      {hasGoogle && !hasPassword && !isFormOpen && (
        <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-cyan-200">
                {t.addPasswordTitle}
              </p>
              <p className="text-[11px] text-slate-300 font-sans mt-0.5 leading-relaxed">
                {t.addPasswordDesc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono uppercase tracking-wider shrink-0 cursor-pointer shadow-md shadow-cyan-500/20 flex items-center gap-1.5"
          >
            <span>{t.btnOpenAdd}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PASSWORD CREATION / UPDATE EXPANDABLE FORM */}
      {isFormOpen && (
        <form
          onSubmit={handleSavePassword}
          className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 shadow-xl space-y-3 animate-fadeIn"
          id="form-add-manual-password"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-900">
            <h5 className="text-xs font-bold text-cyan-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              {hasPassword ? t.changePasswordTitle : t.addPasswordTitle}
            </h5>
            <span className="text-[10px] text-slate-500 font-mono">
              {user?.email}
            </span>
          </div>

          <div>
            <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
              {t.emailLabel}
            </label>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 font-mono text-xs flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>{user?.email || "Non renseigné"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                {t.newPassLabel}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none pr-9 font-sans"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                {t.confirmPassLabel}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className="w-full p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none pr-9 font-sans"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setNewPassword("");
                setConfirmPassword("");
                setErrorMsg(null);
              }}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold cursor-pointer transition font-mono"
            >
              {t.cancelBtn}
            </button>
            <button
              type="submit"
              disabled={loading || !newPassword}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              id="btn-submit-save-password"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  <span>{hasPassword ? t.updatePassBtn : t.savePassBtn}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
