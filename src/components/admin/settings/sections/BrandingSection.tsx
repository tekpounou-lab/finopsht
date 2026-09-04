import React from "react";
import { Palette, Image, Type, Moon, Sun, Smartphone, Mail, FileText, Zap, Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";

export default function BrandingSection() {
  const { businessSettings } = useBusinessContext();
  const { updateSettings, loading } = useBusinessAdmin();

  const { register, handleSubmit, watch } = useForm({
    defaultValues: businessSettings?.branding || {
      primary_color: "#06b6d4",
      accent_color: "#3b82f6",
      theme: "DARK",
      font_family: "Inter",
      logo_url: "",
      invoice_footer: "Merci de votre confiance."
    }
  });

  const onSubmit = async (data: any) => {
    await updateSettings({ ...businessSettings, branding: data });
    alert("Identité visuelle mise à jour.");
  };

  return (
    <div className="space-y-8" id="branding-section-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Identité Visuelle & Branding</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Personnalisez l'apparence de votre interface, de vos emails et de vos documents officiels.</p>
        </div>
        <button 
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-xs font-bold rounded-lg transition-all"
        >
          <Zap className="w-4 h-4" />
          PUBLIER LA CHARTE
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Colors & Theme */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Palette className="w-4 h-4 text-cyan-400" />
            Couleurs & Thème
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Couleur Primaire</label>
              <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-800">
                <input type="color" {...register("primary_color")} className="w-8 h-8 rounded border-none bg-transparent" />
                <span className="text-xs font-mono text-slate-400 uppercase">{watch("primary_color")}</span>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Accentuation</label>
              <div className="flex items-center gap-3 bg-slate-900 p-2 rounded-xl border border-slate-800">
                <input type="color" {...register("accent_color")} className="w-8 h-8 rounded border-none bg-transparent" />
                <span className="text-xs font-mono text-slate-400 uppercase">{watch("accent_color")}</span>
              </div>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Mode d'Affichage Par Défaut</label>
              <div className="flex gap-3">
                {["LIGHT", "DARK"].map(t => (
                  <label key={t} className="flex-1">
                    <input type="radio" {...register("theme")} value={t} className="hidden peer" />
                    <div className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-800 bg-slate-950 text-xs font-bold text-slate-500 cursor-pointer peer-checked:bg-cyan-500/10 peer-checked:border-cyan-500/40 peer-checked:text-cyan-400 transition-all">
                      {t === "LIGHT" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      {t === "LIGHT" ? "CLAIR" : "SOMBRE"}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Assets & Typography */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Image className="w-4 h-4 text-cyan-400" />
            Logo & Typographie
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Logo de l'Entreprise (PNG/SVG)</label>
              <div className="border-2 border-dashed border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 hover:border-cyan-500/30 transition-colors cursor-pointer group">
                <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-slate-600 group-hover:text-cyan-400 group-hover:bg-cyan-500/10 transition-all">
                  <Image className="w-6 h-6" />
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cliquez pour téléverser</p>
                <p className="text-[9px] text-slate-600">Recommandé : 512x512px, fond transparent</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Famille de Police</label>
              <div className="relative">
                <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <select 
                  {...register("font_family")}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-xs text-slate-200 outline-none focus:border-cyan-500/50 appearance-none"
                >
                  <option value="Inter">Inter Enterprise</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  <option value="Geist">Geist Mono</option>
                  <option value="Satoshi">Satoshi Pro</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Documents Branding */}
        <div className="glass rounded-2xl p-6 md:col-span-2 space-y-6">
           <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Personnalisation des Documents
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2">Templates PDF</p>
              <div className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-900 rounded-xl opacity-50 cursor-not-allowed">
                <FileText className="w-4 h-4 text-slate-600" />
                <span className="text-[10px] font-bold text-slate-500">Factures & Reçus</span>
                <span className="ml-auto text-[8px] font-bold bg-slate-900 px-1.5 py-0.5 rounded">PRO</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-900 rounded-xl">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-bold text-slate-300">Fiches de Paie</span>
                <Check className="ml-auto w-3.5 h-3.5 text-emerald-500" />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2">Communication</p>
              <div className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-900 rounded-xl">
                <Mail className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-bold text-slate-300">Emails Transactionnels</span>
                <Check className="ml-auto w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="flex items-center gap-3 p-3 bg-slate-950/50 border border-slate-900 rounded-xl">
                <Smartphone className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-bold text-slate-300">Portail Employé</span>
                <Check className="ml-auto w-3.5 h-3.5 text-emerald-500" />
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2">Pied de Page</p>
              <textarea 
                {...register("invoice_footer")}
                className="w-full h-24 bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 outline-none focus:border-cyan-500/50 resize-none"
                placeholder="Texte apparaissant en bas de vos factures et documents..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
