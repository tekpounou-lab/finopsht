import React from "react";
import { History, Clock, QrCode, MapPin, CheckCircle2, ShieldCheck, Zap } from "lucide-react";
import { useForm } from "react-hook-form";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";

export default function AttendancePoliciesSection() {
  const { businessSettings } = useBusinessContext();
  const { updateSettings, loading } = useBusinessAdmin();

  const { register, handleSubmit, watch } = useForm({
    defaultValues: businessSettings?.attendance || {
      standard_start: "08:00",
      standard_end: "17:00",
      late_threshold_minutes: 15,
      early_checkout_threshold_minutes: 30,
      break_duration_minutes: 60,
      qr_scan_required: true,
      geo_fencing_enabled: false,
      auto_checkout_enabled: true
    }
  });

  const onSubmit = async (data: any) => {
    await updateSettings({ ...businessSettings, attendance: data });
  };

  return (
    <div className="space-y-8" id="attendance-policies-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Politiques de Temps & Présence</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Configurez les horaires standards, les tolérances et les méthodes de validation.</p>
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
        {/* Working Hours */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Horaires Standards
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Début de Journée</label>
              <input 
                type="time"
                {...register("standard_start")}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Fin de Journée</label>
              <input 
                type="time"
                {...register("standard_end")}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Durée de Pause (Minutes)</label>
              <input 
                type="number"
                {...register("break_duration_minutes")}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              />
            </div>
          </div>
        </div>

        {/* Tolerance & Rules */}
        <div className="glass rounded-2xl p-6 space-y-6">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            Tolérances & Contrôles
          </h4>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Marge de retard autorisée (min)</label>
              <input 
                type="number"
                {...register("late_threshold_minutes")}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-900 rounded-xl">
              <div className="flex items-center gap-3">
                <QrCode className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-300">Validation QR Code Requise</span>
              </div>
              <button 
                type="button"
                className={`w-8 h-4 rounded-full transition-colors relative ${watch("qr_scan_required") ? "bg-cyan-600" : "bg-slate-800"}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${watch("qr_scan_required") ? "right-1" : "left-1"}`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-950/50 border border-slate-900 rounded-xl">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-300">Géolocalisation (Mobile App)</span>
              </div>
              <button 
                type="button"
                className={`w-8 h-4 rounded-full transition-colors relative ${watch("geo_fencing_enabled") ? "bg-cyan-600" : "bg-slate-800"}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${watch("geo_fencing_enabled") ? "right-1" : "left-1"}`}></div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
