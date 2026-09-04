import React, { useState, useEffect } from "react";
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Shield, 
  Save, 
  X, 
  Check, 
  AlertCircle, 
  Camera, 
  Globe, 
  Clock, 
  Bell, 
  Lock,
  Building2,
  RefreshCw,
  HeartPulse
} from "lucide-react";
import { motion } from "motion/react";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Employee } from "../../types";
import { useI18n } from "../../i18n";
import { useAuth } from "../../hooks/useAuth";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { AuditService } from "../../services/audit/AuditService";
import { EventBus } from "../../modules/runtime/EventBus";
import { toast } from "sonner";
import { SecurityCredentialsManager } from "../auth/SecurityCredentialsManager";

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: Employee | null;
}

const AVATAR_PRESETS = [
  { id: "preset_1", label: "Initiales", url: "" },
  { id: "preset_2", label: "Opérateur Cyan", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80" },
  { id: "preset_3", label: "Exec Indigo", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&q=80" },
  { id: "preset_4", label: "FinOps Emerald", url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&q=80" },
  { id: "preset_5", label: "Analyste Amber", url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&q=80" }
];

const TIMEZONE_OPTIONS = [
  { value: "America/Port-au-Prince", label: "Haïti (Port-au-Prince, UTC-5)" },
  { value: "America/New_York", label: "New York / Est (UTC-5)" },
  { value: "Europe/Paris", label: "Paris / Europe Centrale (UTC+1)" },
  { value: "UTC", label: "Temps Universel Coordonné (UTC)" }
];

function sanitizeInput(val: string): string {
  return val.replace(/<[^>]*>?/gm, "").trim();
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, currentUser }) => {
  const { language, setLanguage } = useI18n();
  const { user, dbUser } = useAuth();
  const identityContext = useIdentity();

  // Active employee object from context or props
  const emp = currentUser || identityContext?.identity?.employee;

  // Form states
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("Famille");
  const [preferredLang, setPreferredLang] = useState<"fr" | "ht" | "en">(language as any || "fr");
  const [timezone, setTimezone] = useState("America/Port-au-Prince");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [customAvatarInput, setCustomAvatarInput] = useState("");

  // Notification preferences
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Sync initial values when modal opens or user updates
  useEffect(() => {
    if (emp || dbUser) {
      const e = emp || (dbUser as any);
      setPhone(e?.phone || "");
      setAddress((e as any)?.address || "");
      setEmergencyName((e as any)?.emergencyContactName || "");
      setEmergencyPhone((e as any)?.emergencyContactPhone || "");
      setEmergencyRelation((e as any)?.emergencyContactRelation || "Famille");
      setPreferredLang((e as any)?.preferredLanguage || (language as any) || "fr");
      setTimezone((e as any)?.timezone || "America/Port-au-Prince");
      setAvatarUrl((e as any)?.avatarUrl || (e as any)?.photoURL || "");
      
      const notifs = (e as any)?.notificationPreferences || {};
      setEmailAlerts(notifs.emailAlerts !== undefined ? notifs.emailAlerts : true);
      setSecurityAlerts(notifs.securityAlerts !== undefined ? notifs.securityAlerts : true);
      setSmsAlerts(notifs.smsAlerts !== undefined ? notifs.smsAlerts : false);
    }
  }, [emp, dbUser, isOpen, language]);

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};

    if (phone && phone.trim().length > 0 && !/^[+\d\s\-.()]{7,20}$/.test(phone.trim())) {
      errs.phone = "Format de numéro de téléphone invalide (ex: +509 3700-0000).";
    }

    if (emergencyPhone && emergencyPhone.trim().length > 0 && !/^[+\d\s\-.()]{7,20}$/.test(emergencyPhone.trim())) {
      errs.emergencyPhone = "Format de téléphone d'urgence invalide.";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    setErrorMsg(null);

    if (!validateForm()) {
      return;
    }

    setSaving(true);

    const cleanPhone = sanitizeInput(phone);
    const cleanAddress = sanitizeInput(address);
    const cleanEmergName = sanitizeInput(emergencyName);
    const cleanEmergPhone = sanitizeInput(emergencyPhone);
    const cleanEmergRel = sanitizeInput(emergencyRelation);
    const selectedAvatar = customAvatarInput.trim() || avatarUrl;

    const previousValues = {
      phone: emp?.phone || "",
      address: (emp as any)?.address || "",
      emergencyContactName: (emp as any)?.emergencyContactName || "",
      emergencyContactPhone: (emp as any)?.emergencyContactPhone || "",
      emergencyContactRelation: (emp as any)?.emergencyContactRelation || "",
      preferredLanguage: (emp as any)?.preferredLanguage || language,
      timezone: (emp as any)?.timezone || "America/Port-au-Prince",
      avatarUrl: (emp as any)?.avatarUrl || ""
    };

    const updates = {
      phone: cleanPhone,
      address: cleanAddress,
      emergencyContactName: cleanEmergName,
      emergencyContactPhone: cleanEmergPhone,
      emergencyContactRelation: cleanEmergRel,
      preferredLanguage: preferredLang,
      timezone: timezone,
      avatarUrl: selectedAvatar,
      notificationPreferences: {
        emailAlerts,
        securityAlerts,
        smsAlerts
      },
      updatedAt: new Date().toISOString()
    };

    const targetEmpId = emp?.id || (dbUser as any)?.employee_id || (dbUser as any)?.id;
    const businessId = emp?.business_id || (dbUser as any)?.business_id || "biz_demo";
    const actorUid = user?.uid || targetEmpId || "usr_current";
    const correlationId = `prof_upd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      // 1. Update Firestore Employee record if employee ID exists
      if (targetEmpId) {
        const empRef = doc(db, "employees", targetEmpId);
        await updateDoc(empRef, updates);
      }

      // 2. Update Firestore User record if user UID exists
      if (user?.uid) {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
          phone: cleanPhone,
          address: cleanAddress,
          avatarUrl: selectedAvatar,
          preferredLanguage: preferredLang,
          timezone: timezone,
          notificationPreferences: updates.notificationPreferences,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      // 3. Sync i18n language preference across app
      if (preferredLang !== language) {
        setLanguage(preferredLang);
      }

      // 4. Generate Immutable Audit Log Entry
      const changedFields = Object.keys(updates).filter(
        key => JSON.stringify((previousValues as any)[key]) !== JSON.stringify((updates as any)[key])
      );

      await AuditService.writeLog({
        id: correlationId,
        timestamp: new Date().toISOString(),
        userId: actorUid,
        userName: emp?.name || dbUser?.name || user?.email?.split("@")[0] || "Utilisateur",
        userRole: emp?.role || dbUser?.role || "EMPLOYEE",
        business_id: businessId,
        action: "PROFILE_UPDATED",
        changedFields,
        previousValues,
        newValues: updates,
        correlation_id: correlationId
      });

      // 5. Emit EventBus Event
      EventBus.publish(EventBus.createEvent({
        correlationId,
        actorId: actorUid,
        businessId,
        module: "IDENTITY",
        aggregate: "USER_PROFILE",
        type: "ProfileUpdated",
        payload: { userId: actorUid, employeeId: targetEmpId, changes: updates }
      }));

      // 6. Refresh Identity Context
      if (identityContext?.refresh) {
        await identityContext.refresh();
      }

      toast.success("Profil mis à jour avec succès dans le SSOT !");
      onClose();
    } catch (err: any) {
      console.error("[EditProfileModal] Failed to update profile:", err);
      setErrorMsg("Erreur lors de l'enregistrement : " + (err.message || "Permissions insuffisantes"));
      toast.error("Échec de la mise à jour du profil");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Édition du Profil Utilisateur
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Mise à jour des informations personnelles & préférences SSOT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ERROR ALERT */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {/* MODAL BODY (SCROLLABLE) */}
        <div id="form-edit-profile" className="p-6 overflow-y-auto space-y-6 text-xs font-sans flex-1">
          {/* AVATAR & IDENTITY BADGE */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative group">
              {avatarUrl || customAvatarInput ? (
                <img
                  src={customAvatarInput || avatarUrl}
                  alt="Avatar"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-500/40 shadow-lg"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-cyan-500/20 font-mono">
                  {(emp?.name || "U").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-slate-900 border border-slate-700 text-cyan-400">
                <Camera className="w-3 h-3" />
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-sm font-bold text-slate-100">{emp?.name || dbUser?.name || "Utilisateur FinOps"}</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase font-mono">
                  {emp?.role || dbUser?.role || "EMPLOYEE"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                {emp?.email || user?.email}
              </p>
            </div>
          </div>

          {/* AVATAR SELECTION PRESETS */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block">
              Choix de l'Avatar / Photo de Profil
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setAvatarUrl(preset.url);
                    setCustomAvatarInput("");
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    avatarUrl === preset.url && !customAvatarInput
                      ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {preset.url ? (
                    <img src={preset.url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customAvatarInput}
              onChange={(e) => setCustomAvatarInput(e.target.value)}
              placeholder="Ou collez une URL d'image personnalisée (https://...)"
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none font-mono mt-1"
            />
          </div>

          {/* RESTRICTED FIELDS NOTICE */}
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-400 text-[11px] flex items-start gap-2">
            <Lock className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Champs Protégés de l'Identité :</span> L'adresse email, le nom officiel et le rôle hiérarchique sont verrouillés depuis les paramètres utilisateur pour garantir l'intégrité de l'authentification et de la paie.
            </div>
          </div>

          {/* CONTACT & RESIDENCE */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-cyan-400" />
              Coordonnées Personnelles
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Téléphone Portable
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+509 XXXX-XXXX"
                  className={`w-full p-2.5 rounded-xl bg-slate-950 border ${fieldErrors.phone ? "border-rose-500" : "border-slate-800"} text-slate-200 text-xs focus:border-cyan-500 outline-none font-mono`}
                />
                {fieldErrors.phone && (
                  <p className="text-rose-400 text-[10px] mt-1 font-mono">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Email Identifiant (Lecture Seule)
                </label>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-500 font-mono flex items-center justify-between">
                  <span>{emp?.email || user?.email || "Non disponible"}</span>
                  <Lock className="w-3.5 h-3.5 text-slate-600" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                Adresse Résidentielle
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={2}
                placeholder="Numéro, Rue, Quartier, Ville, Département (ex: Pétion-Ville, Ouest)"
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none"
              />
            </div>
          </div>

          {/* EMERGENCY CONTACT */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
              Contact en Cas d'Urgence
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Nom du Contact
                </label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  placeholder="Nom complet"
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Téléphone Urgence
                </label>
                <input
                  type="text"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="+509 XXXX-XXXX"
                  className={`w-full p-2.5 rounded-xl bg-slate-950 border ${fieldErrors.emergencyPhone ? "border-rose-500" : "border-slate-800"} text-slate-200 text-xs focus:border-cyan-500 outline-none font-mono`}
                />
                {fieldErrors.emergencyPhone && (
                  <p className="text-rose-400 text-[10px] mt-1 font-mono">{fieldErrors.emergencyPhone}</p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Lien de Parenté
                </label>
                <input
                  type="text"
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                  placeholder="ex: Époux(se), Parent, Frère"
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* PREFERENCES (LANG, TIMEZONE) */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-indigo-400" />
              Langue & Fuseau Horaire
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Langue Préférée de l'Interface
                </label>
                <select
                  value={preferredLang}
                  onChange={(e) => setPreferredLang(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none cursor-pointer"
                >
                  <option value="fr">Français (Haïti / International)</option>
                  <option value="ht">Kreyòl Ayisyen</option>
                  <option value="en">English (US)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                  Fuseau Horaire de Référence
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none cursor-pointer"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* NOTIFICATION PREFERENCES */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-emerald-400" />
              Préférences de Notifications
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700">
                <span className="text-[11px] font-semibold text-slate-300">Alertes Email</span>
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="accent-cyan-500 w-4 h-4 rounded cursor-pointer"
                />
              </label>

              <label className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700">
                <span className="text-[11px] font-semibold text-slate-300">Sécurité & Connexions</span>
                <input
                  type="checkbox"
                  checked={securityAlerts}
                  onChange={(e) => setSecurityAlerts(e.target.checked)}
                  className="accent-cyan-500 w-4 h-4 rounded cursor-pointer"
                />
              </label>

              <label className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700">
                <span className="text-[11px] font-semibold text-slate-300">SMS / WhatsApp (Urgence)</span>
                <input
                  type="checkbox"
                  checked={smsAlerts}
                  onChange={(e) => setSmsAlerts(e.target.checked)}
                  className="accent-cyan-500 w-4 h-4 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* SECURITY & CREDENTIALS SECTION */}
          <div className="pt-2 border-t border-slate-800/80">
            <SecurityCredentialsManager />
          </div>

          {/* FOOTER ACTIONS */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold cursor-pointer transition"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 font-bold font-mono text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/10 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Mise à jour SSOT...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Enregistrer les modifications
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
