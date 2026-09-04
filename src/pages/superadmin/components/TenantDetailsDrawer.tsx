import React from "react";
import { TenantWithStats, checkIsPending } from "../hooks/useTenantManagement";
import { 
  Building2, 
  X, 
  ShieldCheck, 
  Users, 
  Database, 
  Calendar, 
  DollarSign, 
  Cpu 
} from "lucide-react";

interface TenantDetailsDrawerProps {
  tenant: TenantWithStats | null;
  onClose: () => void;
  onUpdatePlan: (tenantId: string, plan: string) => void;
  onApproveTenant?: (tenantId: string, ownerId?: string) => void;
  onRejectTenant?: (tenantId: string, ownerId?: string) => void;
}

export const TenantDetailsDrawer: React.FC<TenantDetailsDrawerProps> = ({
  tenant,
  onClose,
  onUpdatePlan,
  onApproveTenant,
  onRejectTenant,
}) => {
  if (!tenant) return null;

  const isPending = checkIsPending(tenant);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full p-6 shadow-2xl overflow-y-auto space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">{tenant.name || "Organisation"}</h2>
              <span className="text-[10px] text-slate-500 font-mono">ID: {tenant.id}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tenant Details */}
        <div className="space-y-4 text-xs">
          {isPending && onApproveTenant && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>Demande en attente d'approbation</span>
              </div>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Cette organisation a été créée via le wizard d'onboarding et attend votre validation Super Admin.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onApproveTenant(tenant.id, tenant.ownerId);
                    onClose();
                  }}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition"
                >
                  Approuver & Activer
                </button>
                {onRejectTenant && (
                  <button
                    type="button"
                    onClick={() => {
                      onRejectTenant(tenant.id, tenant.ownerId);
                      onClose();
                    }}
                    className="px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold text-xs transition"
                  >
                    Refuser
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3">
            <h3 className="font-semibold text-slate-200">Configuration de l'organisation</h3>
            <div className="flex justify-between">
              <span className="text-slate-400">Devise de référence :</span>
              <span className="font-mono text-white font-semibold">{tenant.currency || "HTG"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Statut :</span>
              <span className={
                isPending
                  ? "text-amber-400 font-semibold"
                  : tenant.is_suspended
                  ? "text-red-400 font-semibold"
                  : "text-emerald-400 font-semibold"
              }>
                {isPending ? "EN ATTENTE D'APPROBATION" : tenant.is_suspended ? "SUSPENDU" : "ACTIF"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Plan de souscription :</span>
              <span className="text-indigo-400 font-semibold">{tenant.plan || "ENTERPRISE"}</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-2">
            <h3 className="font-semibold text-slate-200">Modifier la Licence</h3>
            <p className="text-[11px] text-slate-400">
              Ajustez instantanément les fonctionnalités débloquées pour ce tenant.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {["STARTER", "PRO", "ENTERPRISE"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onUpdatePlan(tenant.id, p)}
                  className={`py-2 rounded-lg text-xs font-semibold border ${
                    tenant.plan === p
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-md"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-medium"
          >
            Fermer le panneau
          </button>
        </div>
      </div>
    </div>
  );
};
