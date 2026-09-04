import React from "react";
import { FileText, Calendar, Clock, Percent, DollarSign, ShieldAlert, Zap } from "lucide-react";
import { useForm } from "react-hook-form";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";

export default function PayrollPoliciesSection() {
  const { businessSettings } = useBusinessContext();
  const { updateSettings, loading } = useBusinessAdmin();

  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      frequency: "BIWEEKLY",
      currency: "HTG",
      ot_rate_normal: 1.5,
      ot_rate_holiday: 2.0,
      late_penalty_cents: 500,
      absence_penalty_cents: 2500,
      tax_cnss_employee: 3,
      tax_cnss_employer: 3,
      tax_cns_employee: 2,
      enable_social_taxes: false,
      ...(businessSettings?.payroll || {})
    }
  });

  const isSocialTaxEnabled = watch("enable_social_taxes");

  const onSubmit = async (data: any) => {
    await updateSettings({ ...businessSettings, payroll: data });
  };

  return (
    <div className="space-y-8" id="payroll-policies-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Politiques de Paie & Fiscalité</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Configurez les règles de calcul, les taxes et les cycles de rémunération.</p>
        </div>
        <button 
          onClick={handleSubmit(onSubmit)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 text-xs font-bold rounded-lg transition-all"
        >
          <Zap className="w-4 h-4" />
          APPLIQUER LES RÈGLES
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cycle Configuration */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            Cycle de Paie
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Fréquence de Versement</label>
              <select 
                {...register("frequency")}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              >
                <option value="WEEKLY">Hebdomadaire</option>
                <option value="BIWEEKLY">Quinzaine (Bimensuel)</option>
                <option value="MONTHLY">Mensuel</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Devise de Calcul Primaire</label>
              <div className="flex gap-2">
                {["HTG", "USD"].map(curr => (
                  <label key={curr} className="flex-1">
                    <input type="radio" {...register("currency")} value={curr} className="hidden peer" />
                    <div className="text-center py-2 rounded-lg border border-slate-800 bg-slate-950 text-[10px] font-bold text-slate-500 cursor-pointer peer-checked:bg-cyan-500/10 peer-checked:border-cyan-500/40 peer-checked:text-cyan-400 transition-all">
                      {curr}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Overtime & Penalties */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Heures Supplémentaires & Retards
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Taux HS (Normal)</label>
              <div className="relative">
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                <input 
                  type="number" step="0.1"
                  {...register("ot_rate_normal")}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Taux HS (Férié)</label>
              <div className="relative">
                <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                <input 
                  type="number" step="0.1"
                  {...register("ot_rate_holiday")}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Pénalité Retard (Fixe)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                <input 
                  type="number"
                  {...register("late_penalty_cents")}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-8 pr-3 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Pénalité Absence (Jour)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                <input 
                  type="number"
                  {...register("absence_penalty_cents")}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2.5 pl-8 pr-3 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Taxes & Contributions */}
        <div className="glass rounded-2xl p-6 md:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              Retenues Légales & Cotisations Sociales
            </h4>
          </div>

          {/* Master Enable/Disable Social Taxes Banner */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
            isSocialTaxEnabled 
              ? "bg-emerald-950/20 border-emerald-800/60" 
              : "bg-amber-950/20 border-amber-800/60"
          }`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                  Prélèvements des Taxes Sociales (CNSS / CNS / OFATMA)
                </span>
                {isSocialTaxEnabled ? (
                  <span className="px-2 py-0.5 rounded text-[9px] bg-emerald-950 border border-emerald-700 text-emerald-400 font-bold uppercase">
                    RÉGIME ACTIF
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[9px] bg-amber-950 border border-amber-700 text-amber-400 font-bold uppercase">
                    RÉGIME DESACTIVÉ (0 HTG)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-light">
                Détermine si les retenues de CNSS (6%), CNS (2%) et cotisations patronales sont automatiquement déduites lors des calculs de paie.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input 
                type="checkbox" 
                {...register("enable_social_taxes")}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-900 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 peer-checked:border-emerald-500"></div>
            </label>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-6 transition-opacity ${!isSocialTaxEnabled ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">CNSS (Assurance Vieillesse)</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employé</span>
                  <input {...register("tax_cnss_employee")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employeur</span>
                  <input {...register("tax_cnss_employer")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">CNS (Contribution Sociale)</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employé</span>
                  <input {...register("tax_cns_employee")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Exonération</span>
                  <span className="text-[9px] font-bold text-emerald-500/70 uppercase">Actif</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">OFATMA (Accidents Travail)</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employeur</span>
                  <span className="text-[10px] font-bold text-slate-200">2%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Maternité</span>
                  <span className="text-[10px] font-bold text-slate-200">1%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
