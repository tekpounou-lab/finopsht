import React from "react";
import { TenantWithStats, checkIsPending, checkIsSuspended } from "../hooks/useTenantManagement";
import { 
  Building2, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  Eye, 
  ToggleLeft, 
  ToggleRight, 
  Shield,
  Clock,
  Check,
  XCircle
} from "lucide-react";

interface TenantListTableProps {
  tenants: TenantWithStats[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  statusFilter: "ALL" | "PENDING" | "ACTIVE" | "SUSPENDED" | "TRIAL";
  onStatusFilterChange: (val: "ALL" | "PENDING" | "ACTIVE" | "SUSPENDED" | "TRIAL") => void;
  onSelectTenant: (tenant: TenantWithStats) => void;
  onToggleStatus: (tenantId: string, currentSuspended: boolean) => void;
  onApproveTenant?: (tenantId: string, ownerId?: string) => void;
  onRejectTenant?: (tenantId: string, ownerId?: string) => void;
}

export const TenantListTable: React.FC<TenantListTableProps> = ({
  tenants,
  loading,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onSelectTenant,
  onToggleStatus,
  onApproveTenant,
  onRejectTenant,
}) => {
  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher une organisation / ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as any)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="PENDING">En attente d'approbation</option>
            <option value="ACTIVE">Actifs uniquement</option>
            <option value="SUSPENDED">Suspendus</option>
            <option value="TRIAL">Période d'essai</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700/80 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Organisation</th>
                <th className="py-3 px-4">Plan / Licence</th>
                <th className="py-3 px-4">Devise</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Chargement des organisations...
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Aucune organisation trouvée.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => {
                  const isPending = checkIsPending(t);
                  const isSuspended = checkIsSuspended(t);
                  const isRejected = t.status === "REJECTED" || t.businessStatus === "REJECTED";

                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-indigo-400" />
                          <span>{t.name || "Organisation sans nom"}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">{t.id}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold text-[11px]">
                          {t.plan || "ENTERPRISE"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">{t.currency || "HTG"}</td>
                      <td className="py-3 px-4 text-center">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                            <Clock className="w-3 h-3 text-amber-400" /> En attente
                          </span>
                        ) : isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <AlertTriangle className="w-3 h-3" /> Suspendu
                          </span>
                        ) : isRejected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="w-3 h-3" /> Refusé
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Actif
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && onApproveTenant ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onApproveTenant(t.id, t.ownerId)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center gap-1 shadow-md shadow-emerald-900/30 transition"
                                title="Approuver l'organisation"
                              >
                                <Check className="w-3.5 h-3.5" /> Approuver
                              </button>
                              {onRejectTenant && (
                                <button
                                  type="button"
                                  onClick={() => onRejectTenant(t.id, t.ownerId)}
                                  className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                  title="Refuser l'organisation"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => onSelectTenant(t)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                                title="Inspecter Tenant"
                              >
                                <Eye className="w-4 h-4 text-indigo-400" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleStatus(t.id, isSuspended)}
                                className={`p-1.5 rounded-lg ${
                                  isSuspended
                                    ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                    : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                }`}
                                title={isSuspended ? "Réactiver" : "Suspendre"}
                              >
                                {isSuspended ? (
                                  <ToggleLeft className="w-4 h-4" />
                                ) : (
                                  <ToggleRight className="w-4 h-4" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
