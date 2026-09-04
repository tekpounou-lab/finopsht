import React, { useState } from "react";
import { User, Phone, Mail, MapPin, Building, ShieldCheck, Clock, Save, Edit3, HeartPulse, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { Employee } from "../../../types";
import { EmployeeRepository } from "../../../repositories/EmployeeRepository";
import { SecurityCredentialsManager } from "../../../components/auth/SecurityCredentialsManager";

interface MyProfileSectionProps {
  employee: Employee;
  deptName: string;
  branchName: string;
  supervisorName?: string;
  tw: any;
}

export const MyProfileSection: React.FC<MyProfileSectionProps> = ({
  employee,
  deptName,
  branchName,
  supervisorName = "Non assigné",
  tw,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [phone, setPhone] = useState(employee.phone || "");
  const [address, setAddress] = useState((employee as any).address || "");
  const [emergencyName, setEmergencyName] = useState((employee as any).emergencyContactName || "");
  const [emergencyPhone, setEmergencyPhone] = useState((employee as any).emergencyContactPhone || "");
  const [emergencyRelation, setEmergencyRelation] = useState((employee as any).emergencyContactRelation || "Famille");
  
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      await EmployeeRepository.updateSelfServiceProfile(
        employee.id,
        {
          phone,
          address,
          emergencyContactName: emergencyName,
          emergencyContactPhone: emergencyPhone,
          emergencyContactRelation: emergencyRelation
        },
        { uid: employee.id, name: employee.name, role: employee.role }
      );

      setSuccessMsg("Informations de profil mises à jour avec succès dans le SSOT.");
      setIsEditing(false);
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setErrorMsg("Erreur lors de la mise à jour du profil: " + (err.message || "Accès refusé"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" id="view-profile-section">
      {/* HEADER CARD */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/30 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-cyan-500/20 font-mono">
            {(employee?.name || "EM").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-100">{employee.name}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono uppercase">
                {employee.role}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              ID: <span className="text-amber-400 font-bold">{employee.id}</span> | {employee.position || "Poste Opérationnel"}
            </p>
            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Building className="w-3.5 h-3.5 text-cyan-400" />
                {branchName}
              </span>
              <span>•</span>
              <span>{deptName}</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsEditing(!isEditing)}
          className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-400 text-xs font-bold font-mono transition flex items-center gap-2 cursor-pointer"
        >
          <Edit3 className="w-4 h-4" />
          {isEditing ? "Annuler l'édition" : "Modifier mes informations"}
        </button>
      </div>

      {/* MESSAGES */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2 font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* MAIN CONTENT GRID */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PERSONAL & CONTACT INFO */}
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2 border-b border-slate-800 pb-3">
            <User className="w-4 h-4 text-cyan-400" />
            Informations Personnelles & Contact
          </h3>

          <div className="space-y-3 font-sans text-xs">
            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                Email Professionnel (Immuable)
              </label>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-mono flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                {employee.email}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                Téléphone Personnel
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+509 XXXX-XXXX"
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:border-cyan-500 outline-none font-mono text-xs"
                />
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-mono flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  {employee.phone || "Non renseigné"}
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">
                Adresse Résidentielle
              </label>
              {isEditing ? (
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                  placeholder="Rue, Ville, Département..."
                  className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:border-cyan-500 outline-none text-xs"
                />
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  {(employee as any).address || "Non renseignée"}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ORGANIZATIONAL & EMERGENCY INFO */}
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2 border-b border-slate-800 pb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Affectation RH & Contact d'Urgence
          </h3>

          <div className="space-y-3 font-sans text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">Superviseur Direct</span>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-slate-300 font-bold">
                  {supervisorName}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block mb-1">Statut d'Emploi</span>
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-900 text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  {employee.isActive !== false ? "ACTIF" : "INACTIF"}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-900">
              <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-tight flex items-center gap-1.5 mb-2">
                <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                Contact en Cas d'Urgence
              </h4>

              {isEditing ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="Nom complet du contact"
                    className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      placeholder="Téléphone d'urgence"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none font-mono"
                    />
                    <input
                      type="text"
                      value={emergencyRelation}
                      onChange={(e) => setEmergencyRelation(e.target.value)}
                      placeholder="Lien (ex: Époux, Parent)"
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:border-cyan-500 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-900 space-y-1">
                  <p className="text-slate-200 font-bold">{emergencyName || "Non renseigné"}</p>
                  <p className="text-slate-400 font-mono text-[11px]">
                    {emergencyPhone ? `${emergencyPhone} (${emergencyRelation})` : "Téléphone non spécifié"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 font-bold font-mono text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/10 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? "Enregistrement..." : "Enregistrer dans le SSOT"}
              </button>
            </div>
          )}
        </div>
      </form>

      {/* SECURITY & AUTHENTICATION CREDENTIALS */}
      <div className="glass p-6 rounded-2xl border border-slate-800" id="employee-security-credentials-card">
        <SecurityCredentialsManager />
      </div>
    </div>
  );
};
