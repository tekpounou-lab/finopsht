import React, { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, MessageSquare, ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../../../hooks/useAuth";
import { UserProfileRepository } from "../../../../repositories/UserProfileRepository";
import { toast } from "sonner";

export default function NotificationSection() {
  const { user, dbUser } = useAuth();
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(true);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (dbUser) {
      const isEnabled = (dbUser as any).emailNotificationsEnabled !== undefined 
        ? (dbUser as any).emailNotificationsEnabled 
        : (dbUser as any).notificationPreferences?.emailAlerts !== undefined
          ? (dbUser as any).notificationPreferences?.emailAlerts
          : true;
      setEmailNotificationsEnabled(isEnabled);
      setSmsAlertsEnabled(Boolean((dbUser as any).notificationPreferences?.smsAlerts));
    }
  }, [dbUser]);

  const handleToggleEmail = async () => {
    const nextState = !emailNotificationsEnabled;
    setEmailNotificationsEnabled(nextState);
    if (!user?.uid) return;

    setUpdating(true);
    try {
      await UserProfileRepository.setEmailNotificationsEnabled(user.uid, nextState);
      toast.success(
        nextState 
          ? "Notifications par email activées avec succès !" 
          : "Notifications par email désactivées."
      );
    } catch (err) {
      console.error("Failed to update email notification preferences:", err);
      toast.error("Erreur lors de la mise à jour de la préférence email");
      setEmailNotificationsEnabled(!nextState); // Rollback
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-8" id="notifications-section-root">
      <div>
        <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Centre de Notifications</h3>
        <p className="text-xs text-slate-500 font-medium mt-1">Configurez les canaux et les déclencheurs de notifications pour vos équipes.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Mail className="w-4 h-4 text-cyan-400" />
            Canaux de Diffusion
          </h4>
          
          <div className="space-y-4">
            {/* EMAIL CHANNEL */}
            <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Email Professionnel</span>
                  <span className="text-[10px] text-slate-500">Envoi automatique via Cloud Functions (key events)</span>
                </div>
              </div>
              <button
                onClick={handleToggleEmail}
                disabled={updating}
                type="button"
                className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${emailNotificationsEnabled ? "bg-cyan-600" : "bg-slate-800"} ${updating ? "opacity-50" : ""}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${emailNotificationsEnabled ? "right-1" : "left-1"}`}></div>
              </button>
            </div>

            {/* IN-APP CHANNEL */}
            <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-indigo-400" />
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Notifications In-App</span>
                  <span className="text-[10px] text-slate-500">Centre d'alertes temps réel dans la barre supérieure</span>
                </div>
              </div>
              <div className="w-10 h-5 rounded-full relative bg-cyan-600">
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white right-1"></div>
              </div>
            </div>

            {/* SMS CHANNEL */}
            <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <div className="flex items-center gap-3">
                <Smartphone className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="text-xs font-bold text-slate-300 block">SMS (Alertes Critiques)</span>
                  <span className="text-[10px] text-slate-500">Reservé aux événements haute priorité</span>
                </div>
              </div>
              <div className="w-10 h-5 rounded-full relative bg-slate-800">
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white left-1"></div>
              </div>
            </div>

            {/* WHATSAPP CHANNEL */}
            <div className="flex items-center justify-between p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <div>
                  <span className="text-xs font-bold text-slate-300 block">WhatsApp (Beta)</span>
                  <span className="text-[10px] text-slate-500">Diffusion sécurisée via API officielle</span>
                </div>
              </div>
              <div className="w-10 h-5 rounded-full relative bg-slate-800">
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white left-1"></div>
              </div>
            </div>
          </div>
        </div>

        {/* STATUS CARD */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Statut du Service de Messagerie Cloud
          </h4>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">Trigger Cloud Function:</span>
              <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                onNotificationCreated (Active)
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">Préférence Utilisateur:</span>
              <span className={`font-mono font-bold ${emailNotificationsEnabled ? "text-cyan-400" : "text-rose-400"}`}>
                {emailNotificationsEnabled ? "Email Activé (emailNotificationsEnabled: true)" : "Email Désactivé"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">Fournisseur d'Email:</span>
              <span className="text-indigo-400 font-mono">Resend / SendGrid / Custom SMTP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
