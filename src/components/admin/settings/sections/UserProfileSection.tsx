import React, { useState } from "react";
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  ShieldCheck, 
  Clock, 
  Edit3, 
  HeartPulse, 
  Globe, 
  Bell, 
  Lock,
  Building2,
  CheckCircle2
} from "lucide-react";
import { useAuth } from "../../../../hooks/useAuth";
import { useIdentity } from "../../../../modules/identity/IdentityContext";
import { EditProfileModal } from "../../../profile/EditProfileModal";
import { SecurityCredentialsManager } from "../../../auth/SecurityCredentialsManager";

export default function UserProfileSection() {
  const { user, dbUser } = useAuth();
  const identityContext = useIdentity();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const emp = identityContext?.identity?.employee || (dbUser as any);
  const biz = identityContext?.identity?.business || (dbUser as any)?.business;

  return (
    <div className="space-y-6" id="user-profile-settings-section">
      {/* HEADER CARD */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/30 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {emp?.avatarUrl ? (
            <img
              src={emp.avatarUrl}
              alt="Avatar"
              className="w-16 h-16 rounded-2xl object-cover border-2 border-cyan-500/40 shadow-lg shadow-cyan-500/10"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-cyan-500/20 font-mono">
              {(emp?.name || dbUser?.name || "U").slice(0, 2).toUpperCase()}
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-100">{emp?.name || dbUser?.name || "Utilisateur FinOps"}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono uppercase">
                {emp?.role || dbUser?.role || "EMPLOYEE"}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Email: <span className="text-cyan-400 font-semibold">{emp?.email || user?.email}</span> | ID: <span className="text-amber-400 font-bold">{emp?.id || user?.uid || "usr_sheet"}</span>
            </p>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                {biz?.name || "Établissement Principal"}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-400 font-mono">
                <ShieldCheck className="w-3.5 h-3.5" />
                Compte Sécurisé SSOT
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/10 hover:brightness-110"
          id="btn-open-edit-profile-section"
        >
          <Edit3 className="w-4 h-4" />
          Modifier mon Profil
        </button>
      </div>

      {/* PROFILE DETAILS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PERSONAL & CONTACT */}
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
            <User className="w-4 h-4 text-cyan-400" />
            Coordonnées & Résidence
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block mb-1">
                Email Professionnel (Identifiant Immuable)
              </span>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-mono flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  {emp?.email || user?.email}
                </span>
                <Lock className="w-3.5 h-3.5 text-slate-600" />
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block mb-1">
                Téléphone Portable
              </span>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-mono flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-500" />
                {emp?.phone || "Non renseigné"}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block mb-1">
                Adresse Résidentielle
              </span>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                {(emp as any)?.address || "Non renseignée"}
              </div>
            </div>
          </div>
        </div>

        {/* PREFERENCES & EMERGENCY */}
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
            <Globe className="w-4 h-4 text-indigo-400" />
            Préférences & Urgence
          </h3>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block mb-1">
                  Langue d'Interface
                </span>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-mono">
                  {(emp as any)?.preferredLanguage === "ht" ? "Kreyòl Ayisyen" : (emp as any)?.preferredLanguage === "en" ? "English" : "Français"}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block mb-1">
                  Fuseau Horaire
                </span>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-mono truncate">
                  {(emp as any)?.timezone || "America/Port-au-Prince"}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-900">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold block mb-1 flex items-center gap-1">
                <HeartPulse className="w-3 h-3 text-rose-400" />
                Contact d'Urgence
              </span>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                <p className="text-slate-200 font-bold font-mono">
                  {(emp as any)?.emergencyContactName || "Non renseigné"}
                </p>
                <p className="text-slate-400 font-mono text-[11px]">
                  {(emp as any)?.emergencyContactPhone 
                    ? `${(emp as any).emergencyContactPhone} (${(emp as any).emergencyContactRelation || "Famille"})`
                    : "Téléphone non spécifié"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECURITY & CREDENTIALS MANAGEMENT */}
      <div className="glass p-6 rounded-2xl border border-slate-800" id="user-profile-credentials-card">
        <SecurityCredentialsManager />
      </div>

      {/* EDIT MODAL */}
      <EditProfileModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentUser={emp}
      />
    </div>
  );
}
