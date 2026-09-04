import React from "react";
import { useForm } from "react-hook-form";
import { Building2, Globe, Mail, Phone, MapPin, Hash, Briefcase, Zap } from "lucide-react";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { Business } from "../../../../types";

export default function BusinessProfileSection() {
  const { currentBusiness } = useBusinessContext();
  const { updateProfile, loading } = useBusinessAdmin();
  
  const { register, handleSubmit } = useForm<Partial<Business>>({
    defaultValues: {
      name: currentBusiness?.name || "",
      nif: currentBusiness?.nif || "",
      domain: currentBusiness?.domain || "",
      industry: currentBusiness?.industry || "",
      // Add other fields as per Business interface or extend it
    }
  });

  const onSubmit = async (data: Partial<Business>) => {
    await updateProfile(data);
  };

  return (
    <div className="space-y-8" id="profile-section-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Profil de l'Entreprise</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Identité légale et informations de contact de votre établissement.</p>
        </div>
        <button 
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-xs font-bold rounded-lg transition-all disabled:opacity-50"
        >
          {loading ? <Zap className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          ENREGISTRER LE PROFIL
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            Informations Générales
          </h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Nom de l'Entreprise</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input 
                  {...register("name")}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Secteur d'Activité</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input 
                  {...register("industry")}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                  placeholder="Ex: Technologie, Commerce, etc."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">NIF (Identifiant Fiscal)</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input 
                    {...register("nif")}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 font-mono outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Domaine Web</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input 
                    {...register("domain")}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 font-mono outline-none focus:border-cyan-500/50 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-2">
            <Mail className="w-4 h-4 text-cyan-400" />
            Coordonnées & Siège Social
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Email Professionnel</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input 
                  type="email"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                  placeholder="contact@entreprise.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Téléphone Principal</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input 
                  type="tel"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                  placeholder="+509 XXXX-XXXX"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Adresse Siège Social</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input 
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 outline-none focus:border-cyan-500/50 transition-all"
                  placeholder="Numéro, Rue, Ville, Pays"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Additional sections for localized branding can go here */}
    </div>
  );
}
