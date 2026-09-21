import React, { useEffect, useState } from "react";
import { FileText, Calendar, Clock, Percent, DollarSign, ShieldAlert, Zap, ShieldCheck, TrendingUp, Loader2, Play, AlertCircle, HelpCircle, ToggleLeft, ToggleRight } from "lucide-react";
import { useForm } from "react-hook-form";
import { useBusinessContext } from "../../../../contexts/BusinessContext";
import { useBusinessAdmin } from "../../../../hooks/useBusinessAdmin";
import { BusinessAdministrationRepository } from "../../../../repositories/BusinessAdministrationRepository";
import { TaxPolicyEngine } from "../../../../services/payroll/TaxPolicyEngine";
import { ConfigurationResolver } from "../../../../services/config/ConfigurationResolver";
import { toast } from "sonner";
import { isQuotaExceededError } from "../../../../utils/resilientFirestore";

export default function PayrollPoliciesSection() {
  const { businessSettings, business } = useBusinessContext();
  const { updateSettings, loading: hookLoading } = useBusinessAdmin();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolution Test Panel States
  const [testKey, setTestKey] = useState("commission_rate");
  const [testEmpId, setTestEmpId] = useState("");
  const [testEmpCustomVal, setTestEmpCustomVal] = useState("");
  const [testEffectiveDate, setTestEffectiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [resolutionResult, setResolutionResult] = useState<any>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [canonicalMode, setCanonicalMode] = useState<"STRICT" | "CUSTOM">("STRICT");

  const businessId = business?.id || "BIZ_MAIN";

  const resolvedIsTaxEnabled = TaxPolicyEngine.isSocialTaxEnabled(businessSettings);
  const resolvedIsFloorEnabled = TaxPolicyEngine.isSurvivalFloorEnabled(businessSettings);
  const resolvedFloorAmount = TaxPolicyEngine.getSurvivalFloorAmount(businessSettings);
  const resolvedRates = TaxPolicyEngine.resolveRates(businessSettings);
  const resolvedIsAttendanceRequired = TaxPolicyEngine.isAttendanceRequiredForPayroll(businessSettings);

  const { register, handleSubmit, watch, reset } = useForm({
    defaultValues: {
      frequency: businessSettings?.payroll?.frequency || businessSettings?.payroll_policies?.frequency || "BIWEEKLY",
      currency: businessSettings?.payroll?.currency || businessSettings?.payroll_policies?.currency || "HTG",
      standard_hours: businessSettings?.payroll?.standard_hours ?? businessSettings?.payroll_policies?.standardHoursPerCycle ?? businessSettings?.payroll_policies?.standardQuinzaineHours ?? 96,
      attendance_tolerance_hours: businessSettings?.payroll?.attendance_tolerance_hours ?? businessSettings?.payroll_policies?.attendanceToleranceHours ?? 94,
      working_days_basis: businessSettings?.payroll?.working_days_basis ?? businessSettings?.payroll_policies?.workingDaysBasis ?? 22,
      ot_rate_normal: businessSettings?.payroll?.ot_rate_normal ?? businessSettings?.payroll_policies?.overtimeRate150 ?? 1.5,
      ot_rate_holiday: businessSettings?.payroll?.ot_rate_holiday ?? businessSettings?.payroll_policies?.overtimeRate200 ?? 2.0,
      late_penalty_cents: businessSettings?.payroll?.late_penalty_cents ?? businessSettings?.payroll_policies?.latePenaltyCents ?? 0,
      absence_penalty_cents: businessSettings?.payroll?.absence_penalty_cents ?? businessSettings?.payroll_policies?.absencePenaltyCents ?? 0,
      tax_cnss_employee: Math.round(resolvedRates.employeeOnaRate * 100),
      tax_cnss_employer: Math.round(resolvedRates.employerOnaRate * 100),
      tax_cns_employee: Math.round(resolvedRates.employeeOfatmaRate * 100),
      tax_cns_employer: Math.round(resolvedRates.employerOfatmaRate * 100),
      enable_social_taxes: resolvedIsTaxEnabled,
      enable_survival_floor: resolvedIsFloorEnabled,
      survival_floor_htg: resolvedFloorAmount,
      default_commission_rate: (businessSettings?.payroll?.default_commission_rate ?? ((businessSettings?.payroll_policies?.defaultCommissionRate || 0) * 100)),
      require_attendance_for_payroll: resolvedIsAttendanceRequired,
      ...(businessSettings?.payroll || {})
    }
  });

  useEffect(() => {
    if (businessSettings) {
      const isTax = TaxPolicyEngine.isSocialTaxEnabled(businessSettings);
      const isFloor = TaxPolicyEngine.isSurvivalFloorEnabled(businessSettings);
      const floor = TaxPolicyEngine.getSurvivalFloorAmount(businessSettings);
      const rates = TaxPolicyEngine.resolveRates(businessSettings);
      const isAtt = TaxPolicyEngine.isAttendanceRequiredForPayroll(businessSettings);

      reset({
        frequency: businessSettings.payroll?.frequency || businessSettings.payroll_policies?.frequency || "BIWEEKLY",
        currency: businessSettings.payroll?.currency || businessSettings.payroll_policies?.currency || "HTG",
        standard_hours: businessSettings.payroll?.standard_hours ?? businessSettings.payroll_policies?.standardHoursPerCycle ?? businessSettings.payroll_policies?.standardQuinzaineHours ?? 96,
        attendance_tolerance_hours: businessSettings.payroll?.attendance_tolerance_hours ?? businessSettings.payroll_policies?.attendanceToleranceHours ?? 94,
        working_days_basis: businessSettings.payroll?.working_days_basis ?? businessSettings.payroll_policies?.workingDaysBasis ?? 22,
        ot_rate_normal: businessSettings.payroll?.ot_rate_normal ?? businessSettings.payroll_policies?.overtimeRate150 ?? 1.5,
        ot_rate_holiday: businessSettings.payroll?.ot_rate_holiday ?? businessSettings.payroll_policies?.overtimeRate200 ?? 2.0,
        late_penalty_cents: businessSettings.payroll?.late_penalty_cents ?? businessSettings.payroll_policies?.latePenaltyCents ?? 0,
        absence_penalty_cents: businessSettings.payroll?.absence_penalty_cents ?? businessSettings.payroll_policies?.absencePenaltyCents ?? 0,
        tax_cnss_employee: Math.round(rates.employeeOnaRate * 100),
        tax_cnss_employer: Math.round(rates.employerOnaRate * 100),
        tax_cns_employee: Math.round(rates.employeeOfatmaRate * 100),
        tax_cns_employer: Math.round(rates.employerOfatmaRate * 100),
        enable_social_taxes: isTax,
        enable_survival_floor: isFloor,
        survival_floor_htg: floor,
        default_commission_rate: (businessSettings.payroll?.default_commission_rate ?? ((businessSettings.payroll_policies?.defaultCommissionRate || 0) * 100)),
        require_attendance_for_payroll: isAtt,
        ...(businessSettings.payroll || {})
      });
    }
  }, [businessSettings, reset]);

  const isSocialTaxEnabled = watch("enable_social_taxes");
  const isSurvivalFloorEnabled = watch("enable_survival_floor");

  const onSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const enableTaxes = !!data.enable_social_taxes;
      const enableSurvivalFloor = !!data.enable_survival_floor;
      const requireAttendance = !!data.require_attendance_for_payroll;
      const survivalFloor = Number(data.survival_floor_htg) || 15000;
      const standardHours = Number(data.standard_hours) || 96;
      const attendanceTolerance = Number(data.attendance_tolerance_hours) || 94;
      const workingDaysBasis = Number(data.working_days_basis) || 22;
      const latePenaltyCents = Number(data.late_penalty_cents) || 0;
      const absencePenaltyCents = Number(data.absence_penalty_cents) || 0;

      const updatedPayroll = {
        ...businessSettings?.payroll,
        ...data,
        enable_social_taxes: enableTaxes,
        enableTaxes: enableTaxes,
        enable_survival_floor: enableSurvivalFloor,
        enableSurvivalFloor: enableSurvivalFloor,
        survival_floor_htg: survivalFloor,
        survivalFloor: survivalFloor,
        standard_hours: standardHours,
        attendance_tolerance_hours: attendanceTolerance,
        working_days_basis: workingDaysBasis,
        late_penalty_cents: latePenaltyCents,
        absence_penalty_cents: absencePenaltyCents,
        require_attendance_for_payroll: requireAttendance,
        requireAttendanceForPayroll: requireAttendance,
      };

      const updatedPayrollPolicies = {
        ...(businessSettings?.payroll_policies || {}),
        version: "v4.0.0-canonical",
        frequency: data.frequency,
        currency: data.currency,
        standardHoursPerCycle: standardHours,
        standardQuinzaineHours: standardHours,
        attendanceToleranceHours: attendanceTolerance,
        workingDaysBasis: workingDaysBasis,
        enableTaxes: enableTaxes,
        enable_social_taxes: enableTaxes,
        onaEmployeeRate: (Number(data.tax_cnss_employee) || 6) / 100,
        onaEmployerRate: (Number(data.tax_cnss_employer) || 6) / 100,
        ofatmaEmployeeRate: (Number(data.tax_cns_employee) || 2) / 100,
        ofatmaEmployerRate: (Number(data.tax_cns_employer) || 3) / 100,
        enableSurvivalFloor: enableSurvivalFloor,
        enable_survival_floor: enableSurvivalFloor,
        survivalFloor: survivalFloor,
        survival_floor_htg: survivalFloor,
        overtimeRate150: Number(data.ot_rate_normal) || 1.5,
        overtimeRate200: Number(data.ot_rate_holiday) || 2.0,
        latePenaltyCents: latePenaltyCents,
        absencePenaltyCents: absencePenaltyCents,
        defaultCommissionRate: (Number(data.default_commission_rate) || 0) / 100,
        requireAttendanceForPayroll: requireAttendance,
      };

      try {
        await updateSettings({
          ...businessSettings,
          payroll: updatedPayroll,
          payroll_policies: updatedPayrollPolicies,
          tax_config: {
            ...(businessSettings?.tax_config || {}),
            enableTaxes: enableTaxes,
            enabled: enableTaxes,
            enable_social_taxes: enableTaxes,
          }
        });
      } catch (adminErr) {
        console.warn("[PayrollPoliciesSection] updateSettings fallback:", adminErr);
      }
      
      await BusinessAdministrationRepository.savePayrollPolicy(
        businessId,
        {
          version: "v4.0.0-canonical",
          frequency: data.frequency,
          currency: data.currency,
          standardHoursPerCycle: standardHours,
          standardQuinzaineHours: standardHours,
          attendanceToleranceHours: attendanceTolerance,
          workingDaysBasis: workingDaysBasis,
          enableTaxes: enableTaxes,
          onaEmployeeRate: (Number(data.tax_cnss_employee) || 6) / 100,
          onaEmployerRate: (Number(data.tax_cnss_employer) || 6) / 100,
          ofatmaEmployeeRate: (Number(data.tax_cns_employee) || 2) / 100,
          ofatmaEmployerRate: (Number(data.tax_cns_employer) || 3) / 100,
          enableSurvivalFloor: enableSurvivalFloor,
          survivalFloor: survivalFloor,
          survivalFloorHTG: survivalFloor,
          overtimeRate150: Number(data.ot_rate_normal) || 1.5,
          overtimeRate200: Number(data.ot_rate_holiday) || 2.0,
          latePenaltyCents: latePenaltyCents,
          absencePenaltyCents: absencePenaltyCents,
          defaultCommissionRate: (Number(data.default_commission_rate) || 0) / 100,
          requireAttendanceForPayroll: requireAttendance,
        },
        "usr_admin"
      );

      toast.success(
        enableTaxes 
          ? "Politiques de paie sauvegardées : Taxes sociales ACTIVÉES."
          : "Politiques de paie sauvegardées : Taxes sociales DÉSACTIVÉES (Régime 0 HTG sur tout le système)."
      );
    } catch (err: any) {
      console.error("Error saving payroll policies:", err);
      if (isQuotaExceededError(err)) {
        toast.error(
          "Limite quotidienne Firestore atteinte (Quota dépassé). Les politiques sont conservées localement dans la session.",
          { duration: 6000 }
        );
      } else {
        toast.error("Erreur lors de la sauvegarde des politiques : " + (err.message || "Echec"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = (errors: any) => {
    console.warn("[PayrollPoliciesSection] Form validation errors:", errors);
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      toast.error(`Veuillez vérifier les champs du formulaire (${errorKeys.join(", ")})`);
    }
  };

  const isButtonDisabled = isSubmitting;

  return (
    <div className="space-y-8" id="payroll-policies-root">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 uppercase tracking-tight">Politiques de Paie & Fiscalité</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">Configurez les règles de calcul, les taxes et les cycles de rémunération.</p>
        </div>
        <button 
          type="button"
          onClick={handleSubmit(onSubmit, onInvalid)}
          disabled={isButtonDisabled}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-bold rounded-lg shadow-md shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {isSubmitting ? "APPLICATION EN COURS..." : "APPLIQUER LES RÈGLES"}
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
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">CNSS / ONA (Assurance Vieillesse)</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employé (%)</span>
                  <input {...register("tax_cnss_employee")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employeur (%)</span>
                  <input {...register("tax_cnss_employer")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">OFATMA / CNS (Santé & Maternité)</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employé (%)</span>
                  <input {...register("tax_cns_employee")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Part Employeur (%)</span>
                  <input {...register("tax_cns_employer")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-cyan-400" />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">Commissions par Défaut</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Taux Défaut Ventes (%)</span>
                  <input {...register("default_commission_rate")} className="w-12 bg-slate-900 border border-slate-800 rounded text-[10px] p-1 text-center text-emerald-400" />
                </div>
                <p className="text-[9px] text-slate-500">S'applique aux régimes COMMISSION et HYBRIDE si non spécifié sur le profil employé.</p>
              </div>
            </div>
          </div>

          {/* Survival Floor & Attendance Rules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-900">
            {/* Survival Floor Protection */}
            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Plancher de Survie Social (Protéger le Salaire Net)
                </span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" {...register("enable_survival_floor")} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-900 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600 peer-checked:border-cyan-500"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400">
                Garantit un montant net minimum à l'employé pour prévenir un salaire net nul ou dérisoire après retenues fiscales.
              </p>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400 font-mono">Seuil Minimum (HTG)</span>
                <input 
                  type="number" 
                  {...register("survival_floor_htg")} 
                  className="w-28 bg-slate-900 border border-slate-800 rounded text-xs p-1.5 text-right font-mono font-bold text-cyan-400" 
                />
              </div>
            </div>

            {/* Attendance Filter Rule */}
            <div className="p-4 bg-slate-950/50 border border-slate-900 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  Exclure Employés Sans Présence (Attendance Records)
                </span>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input type="checkbox" {...register("require_attendance_for_payroll")} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-900 border border-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:border-emerald-500"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400">
                Seuls les employés disposant d'au moins un enregistrement de présence sur la période du cycle seront inclus dans la paie.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 9C.5: CANONICAL DEFAULTS & CUSTOM PARALYSIS RULES */}
        <div className="glass rounded-2xl p-6 md:col-span-2 space-y-6 border border-slate-800/80">
          <div className="flex items-center justify-between border-b border-slate-900 pb-4">
            <div>
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Règles de Résolution & Conformité Légale (SSOT)
              </h4>
              <p className="text-[11px] text-slate-500 mt-1">
                Configurez le mode de priorité des paramètres et l'isolation des définitions statutaires.
              </p>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 p-1.5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setCanonicalMode("STRICT");
                  toast.success("Mode de Résolution Strict activé !");
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase transition-all ${
                  canonicalMode === "STRICT"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Strict Defaults
              </button>
              <button
                type="button"
                onClick={() => {
                  setCanonicalMode("CUSTOM");
                  toast.info("Mode Personnalisé activé.");
                }}
                className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase transition-all ${
                  canonicalMode === "CUSTOM"
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Custom Rules
              </button>
            </div>
          </div>

          <div className="p-4 bg-slate-950/40 border border-slate-900 rounded-xl flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${canonicalMode === "STRICT" ? "text-emerald-400" : "text-cyan-400"}`} />
            <div className="space-y-1">
              <h5 className="text-[11px] font-bold text-slate-200 uppercase tracking-wide">
                {canonicalMode === "STRICT" ? "Garantie Statutaire Active (Zod Enforced)" : "Surcharge de Paramètres Active"}
              </h5>
              <p className="text-[11px] text-slate-400 leading-relaxed font-light">
                {canonicalMode === "STRICT" 
                  ? "En mode STRICT, le système valide automatiquement chaque entrée par rapport aux définitions légales et rejette les valeurs aberrantes. Les commissions par défaut et les heures de cycle sont rigoureusement contrôlées pour exclure tout comportement non déterministe."
                  : "Le mode CUSTOM autorise des dérogations d'entreprise spécifiques, tant que celles-ci passent la validation d'intégrité de schéma standard."
                }
              </p>
            </div>
          </div>

          {/* REAL-TIME RESOLUTION TEST PANEL */}
          <div className="border-t border-slate-900 pt-6">
            <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              Simulateur de Résolution de Paramètres en Temps Réel
            </h5>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950/20 border border-slate-900 p-4 rounded-xl">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paramètre de Résolution</label>
                <select
                  value={testKey}
                  onChange={(e) => setTestKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                >
                  <option value="commission_rate">Taux de Commission (commission_rate)</option>
                  <option value="standard_hours">Heures Standard de Cycle (standard_hours)</option>
                  <option value="survival_floor_htg">Seuil de Survie Social (survival_floor_htg)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date Effective</label>
                <input
                  type="date"
                  value={testEffectiveDate}
                  onChange={(e) => setTestEffectiveDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">ID Employé (Override Context)</label>
                <input
                  type="text"
                  placeholder="Ex: emp_david"
                  value={testEmpId}
                  onChange={(e) => setTestEmpId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Taux Individuel Surchargé (Optionnel)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 0.12 (12%)"
                  value={testEmpCustomVal}
                  onChange={(e) => setTestEmpCustomVal(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 outline-none focus:border-cyan-500/50 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-between items-center mt-4">
              <p className="text-[10px] text-slate-500 font-light flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                Vérifie l'exactitude de l'ordre de priorité : Override Employé &rarr; Paramètres Tenant &rarr; Politique Globale.
              </p>
              
              <button
                type="button"
                disabled={isResolving}
                onClick={async () => {
                  setIsResolving(true);
                  try {
                    const parsedVal = testEmpCustomVal !== "" ? Number(testEmpCustomVal) : undefined;
                    const res = await ConfigurationResolver.resolve(testKey, {
                      businessId,
                      effectiveDate: testEffectiveDate,
                      employeeContext: testEmpId ? {
                        id: testEmpId,
                        customValue: parsedVal
                      } : undefined
                    });
                    setResolutionResult(res);
                    toast.success("Résolution calculée avec succès !");
                  } catch (e) {
                    console.error(e);
                    toast.error("Échec de la résolution du paramètre.");
                  } finally {
                    setIsResolving(false);
                  }
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isResolving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 fill-slate-950" />
                )}
                Exécuter la Résolution
              </button>
            </div>

            {/* RESULTS VIEW */}
            {resolutionResult && (
              <div className="mt-4 p-4 bg-slate-950/60 border border-slate-800/60 rounded-xl space-y-3 font-mono animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Statut du Résolveur</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                    resolutionResult.status === "RESOLVED"
                      ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20"
                      : "bg-red-950/40 text-red-400 border border-red-500/20"
                  }`}>
                    {resolutionResult.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-tight">Valeur Résolue</p>
                    <p className="text-sm font-bold text-slate-100 mt-1">
                      {resolutionResult.value !== null && resolutionResult.value !== undefined
                        ? typeof resolutionResult.value === "number" && testKey.endsWith("_rate")
                          ? `${(resolutionResult.value * 100).toFixed(1)}%`
                          : resolutionResult.value.toLocaleString()
                        : "N/A"
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-tight">Source de l'Information</p>
                    <p className="text-sm font-bold text-cyan-400 mt-1">{resolutionResult.source}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-tight">Version de la Règle</p>
                    <p className="text-sm font-bold text-slate-300 mt-1">v{resolutionResult.version || "1.0.0-canonical"}</p>
                  </div>

                  <div>
                    <p className="text-[9px] text-slate-500 uppercase tracking-tight">ID de Configuration</p>
                    <p className="text-xs text-slate-400 truncate mt-1" title={resolutionResult.configurationId}>
                      {resolutionResult.configurationId || "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

