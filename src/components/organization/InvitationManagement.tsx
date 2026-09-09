import React, { useState, useMemo } from "react";
import { 
  Invitation, 
  Business, 
  Branch, 
  Department, 
  Role, 
  Employee 
} from "../../types";
import { 
  Mail, 
  UserPlus, 
  RefreshCw, 
  RotateCcw, 
  XCircle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Search, 
  Filter, 
  Calendar, 
  Building2, 
  Key, 
  ShieldCheck, 
  FileText, 
  AlertCircle,
  Eye,
  Send,
  User,
  Sparkles
} from "lucide-react";
import { InvitationRepository } from "../../repositories/InvitationRepository";
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";
import { toast } from "sonner";

interface InvitationManagementProps {
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  invitations: Invitation[];
  currentRole: Role;
  currentUser: { name: string; id: string };
  onRefresh?: () => void;
  setInvitations?: React.Dispatch<React.SetStateAction<Invitation[]>>;
}

export const InvitationManagement: React.FC<InvitationManagementProps> = ({
  currentBusiness,
  branches,
  departments,
  invitations = [],
  currentRole,
  currentUser,
  onRefresh,
  setInvitations
}) => {
  // Filtering states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [timeRangeFilter, setTimeRangeFilter] = useState<string>("ALL");

  // Action loading states
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [auditLogModalInvite, setAuditLogModalInvite] = useState<Invitation | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Send Form states
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("EMPLOYEE");
  const [newBranchId, setNewBranchId] = useState(branches[0]?.id || "");
  const [newDeptId, setNewDeptId] = useState(departments[0]?.id || "");
  const [newPosition, setNewPosition] = useState("");
  const [newBaseSalary, setNewBaseSalary] = useState<number>(32000);
  const [isSubmittingSend, setIsSubmittingSend] = useState(false);

  const canManageInvitations = ["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentRole);

  // Filter logic
  const filteredInvitations = useMemo(() => {
    return invitations.filter((inv) => {
      // Search query (email, name)
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        (inv.email && inv.email.toLowerCase().includes(q)) ||
        (inv.name && inv.name.toLowerCase().includes(q));

      // Status
      const matchStatus = statusFilter === "ALL" || inv.status === statusFilter;

      // Role
      const matchRole = roleFilter === "ALL" || inv.role === roleFilter;

      // Date Range
      let matchTime = true;
      if (timeRangeFilter !== "ALL" && inv.invitedAt) {
        const inviteDate = new Date(inv.invitedAt).getTime();
        const now = Date.now();
        const daysInMs = (days: number) => days * 24 * 60 * 60 * 1000;

        if (timeRangeFilter === "7D") matchTime = now - inviteDate <= daysInMs(7);
        else if (timeRangeFilter === "30D") matchTime = now - inviteDate <= daysInMs(30);
        else if (timeRangeFilter === "90D") matchTime = now - inviteDate <= daysInMs(90);
      }

      return matchSearch && matchStatus && matchRole && matchTime;
    });
  }, [invitations, searchQuery, statusFilter, roleFilter, timeRangeFilter]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = invitations.length;
    const pending = invitations.filter((i) => i.status === "PENDING" || i.status === "SENT").length;
    const accepted = invitations.filter((i) => i.status === "ACCEPTED").length;
    const revoked = invitations.filter((i) => i.status === "REVOKED").length;
    const expired = invitations.filter((i) => i.status === "EXPIRED").length;
    const rejected = invitations.filter((i) => i.status === "REJECTED").length;

    return { total, pending, accepted, revoked, expired, rejected };
  }, [invitations]);

  // Action: Resend
  const handleResend = async (invitationId: string) => {
    if (!canManageInvitations) {
      toast.error("Vous n'avez pas la permission de relancer les invitations.");
      return;
    }

    setLoadingActionId(invitationId);
    try {
      const updated = await InvitationRepository.resendInvitation(invitationId, {
        id: currentUser.id,
        name: currentUser.name,
        role: currentRole
      });

      if (setInvitations) {
        setInvitations((prev) =>
          prev.map((i) => (i.id === invitationId ? updated : i))
        );
      }

      toast.success(`Invitation relancée avec succès pour ${updated.email}`);
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error("[InvitationManagement] Resend error:", error);
      toast.error(error.message || "Échec de la relance de l'invitation.");
    } finally {
      setLoadingActionId(null);
    }
  };

  // Action: Revoke
  const handleRevoke = async (invitationId: string) => {
    if (!canManageInvitations) {
      toast.error("Vous n'avez pas la permission de révoquer les invitations.");
      return;
    }

    if (!window.confirm("Êtes-vous sûr de vouloir révoquer cette invitation ? Le lien d'activation deviendra immédiatement invalide.")) {
      return;
    }

    setLoadingActionId(invitationId);
    try {
      await InvitationRepository.revokeInvitation(invitationId, {
        id: currentUser.id,
        name: currentUser.name,
        role: currentRole
      });

      if (setInvitations) {
        setInvitations((prev) =>
          prev.map((i) => (i.id === invitationId ? { ...i, status: "REVOKED" as const } : i))
        );
      }

      toast.success("L'invitation a été révoquée avec succès.");
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error("[InvitationManagement] Revoke error:", error);
      toast.error(error.message || "Échec de la révocation.");
    } finally {
      setLoadingActionId(null);
    }
  };

  // Action: Open Audit Modal
  const handleOpenAudit = async (invitation: Invitation) => {
    setAuditLogModalInvite(invitation);
    setIsLoadingAudit(true);
    try {
      const logs = await ForensicLogRepository.listByBusiness(currentBusiness.id);
      const inviteLogs = logs.filter((log) => {
        if (!log.details) return false;
        return log.details.includes(invitation.id) || (invitation.email && log.details.includes(invitation.email));
      });
      setAuditLogs(inviteLogs);
    } catch (err) {
      console.warn("[InvitationManagement] Failed to fetch forensic logs:", err);
      setAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Action: Submit New Invitation
  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newName) {
      toast.error("Veuillez renseigner le nom et l'adresse e-mail.");
      return;
    }

    setIsSubmittingSend(true);
    try {
      const result = await InvitationRepository.createInvitation(
        {
          businessId: currentBusiness.id,
          email: newEmail,
          name: newName,
          role: newRole,
          branchId: newBranchId || branches[0]?.id || "",
          departmentId: newDeptId || departments[0]?.id || "",
          position: newPosition,
          baseSalary: newBaseSalary
        },
        {
          id: currentUser.id,
          name: currentUser.name,
          role: currentRole
        }
      );

      if (setInvitations) {
        setInvitations((prev) => [result.invitation, ...prev]);
      }

      toast.success(`Invitation envoyée à ${result.invitation.email}`);
      setIsSendModalOpen(false);
      setNewEmail("");
      setNewName("");
      setNewPosition("");
      if (onRefresh) onRefresh();
    } catch (error: any) {
      console.error("[InvitationManagement] Send error:", error);
      toast.error(error.message || "Erreur lors de l'envoi de l'invitation.");
    } finally {
      setIsSubmittingSend(false);
    }
  };

  // Helpers for formatting
  const getBranchName = (bId?: string) => {
    if (!bId) return "Succursale Principale";
    return branches.find((b) => b.id === bId)?.name || bId;
  };

  const getDeptName = (dId?: string) => {
    if (!dId) return "Général";
    return departments.find((d) => d.id === dId)?.name || dId;
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
      case "SENT":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold rounded-full">
            <Clock className="w-3 h-3" /> En Attente
          </span>
        );
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Acceptée
          </span>
        );
      case "REVOKED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-full">
            <XCircle className="w-3 h-3" /> Révoquée
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-500/10 border border-slate-500/20 text-slate-400 text-xs font-semibold rounded-full">
            <AlertCircle className="w-3 h-3" /> Expirée
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold rounded-full">
            <ShieldAlert className="w-3 h-3" /> Refusée
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 text-slate-400 text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Total Émises</span>
            <Mail className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-white">{stats.total}</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">En Attente</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400">{stats.pending}</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Acceptées</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400">{stats.accepted}</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Révoquées</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400">{stats.revoked}</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Expirées</span>
            <AlertCircle className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-300">{stats.expired}</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs">Refusées</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-xl font-bold text-red-400">{stats.rejected}</div>
        </div>
      </div>

      {/* Control & Filter Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Tableau de Bord des Invitations</span>
                <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  SSOT & Multi-Tenant
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Gérez le cycle de vie des accès utilisateurs, révoquez ou relancez les invitations en attente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-1.5 border border-slate-700 transition"
                title="Rafraîchir la liste"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Rafraîchir</span>
              </button>
            )}

            {canManageInvitations && (
              <button
                type="button"
                onClick={() => setIsSendModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Inviter un Collaborateur</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher nom, email..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Statut:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer w-full"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">Tous les statuts</option>
              <option value="PENDING" className="bg-slate-900 text-amber-400">En Attente (PENDING)</option>
              <option value="ACCEPTED" className="bg-slate-900 text-emerald-400">Acceptées (ACCEPTED)</option>
              <option value="REVOKED" className="bg-slate-900 text-rose-400">Révoquées (REVOKED)</option>
              <option value="EXPIRED" className="bg-slate-900 text-slate-400">Expirées (EXPIRED)</option>
              <option value="REJECTED" className="bg-slate-900 text-red-400">Refusées (REJECTED)</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Rôle:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer w-full"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">Tous les rôles</option>
              <option value="OWNER" className="bg-slate-900 text-slate-200">Propriétaire (OWNER)</option>
              <option value="MANAGER" className="bg-slate-900 text-slate-200">Manager</option>
              <option value="HEAD_TELLER" className="bg-slate-900 text-slate-200">Chef Caissier</option>
              <option value="SENIOR_TELLER" className="bg-slate-900 text-slate-200">Caissier Senior</option>
              <option value="JUNIOR_TELLER" className="bg-slate-900 text-slate-200">Caissier Junior</option>
              <option value="EMPLOYEE" className="bg-slate-900 text-slate-200">Employé</option>
            </select>
          </div>

          {/* Time Range Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Période:</span>
            <select
              value={timeRangeFilter}
              onChange={(e) => setTimeRangeFilter(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer w-full"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">Historique complet</option>
              <option value="7D" className="bg-slate-900 text-slate-200">7 derniers jours</option>
              <option value="30D" className="bg-slate-900 text-slate-200">30 derniers jours</option>
              <option value="90D" className="bg-slate-900 text-slate-200">90 derniers jours</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3.5">Destinataire</th>
                <th className="p-3.5">Rôle & Structure</th>
                <th className="p-3.5">Statut</th>
                <th className="p-3.5">Date d'Envoi</th>
                <th className="p-3.5">Expiration</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredInvitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-mono">
                    <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    Aucune invitation ne correspond aux critères sélectionnés.
                  </td>
                </tr>
              ) : (
                filteredInvitations.map((invite) => {
                  const isLoadingThis = loadingActionId === invite.id;
                  const isPendingOrSent = invite.status === "PENDING" || invite.status === "SENT";

                  return (
                    <tr key={invite.id} className="hover:bg-slate-800/40 transition">
                      {/* Recipient */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 text-xs">
                            {(invite.name || invite.email || "I").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{invite.name || "Collaborateur"}</span>
                            </div>
                            <div className="text-slate-400 font-mono text-[11px]">{invite.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Assignment */}
                      <td className="p-3.5 space-y-1">
                        <span className="inline-block px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold rounded text-[11px]">
                          {invite.role || "EMPLOYEE"}
                        </span>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          <span>{getBranchName(invite.branchId)}</span>
                          <span className="text-slate-600">•</span>
                          <span>{getDeptName(invite.departmentId)}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3.5">{renderStatusBadge(invite.status)}</td>

                      {/* Invited At */}
                      <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                        {invite.invitedAt ? new Date(invite.invitedAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        }) : "N/A"}
                      </td>

                      {/* Expires At / Accepted At */}
                      <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                        {invite.status === "ACCEPTED" ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {invite.acceptedAt ? new Date(invite.acceptedAt).toLocaleDateString("fr-FR") : "Validée"}
                          </span>
                        ) : invite.expiresAt ? (
                          <span>
                            {new Date(invite.expiresAt).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric"
                            })}
                          </span>
                        ) : (
                          "7 jours"
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Resend Action */}
                          {isPendingOrSent && canManageInvitations && (
                            <button
                              type="button"
                              disabled={isLoadingThis}
                              onClick={() => handleResend(invite.id)}
                              className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-medium text-[11px] flex items-center gap-1 transition disabled:opacity-50"
                              title="Renvoyer l'invitation (relancer le lien de 7 jours)"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isLoadingThis ? "animate-spin" : ""}`} />
                              <span>Relancer</span>
                            </button>
                          )}

                          {/* Revoke Action */}
                          {isPendingOrSent && canManageInvitations && (
                            <button
                              type="button"
                              disabled={isLoadingThis}
                              onClick={() => handleRevoke(invite.id)}
                              className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg font-medium text-[11px] flex items-center gap-1 transition disabled:opacity-50"
                              title="Révoquer l'invitation"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Révoquer</span>
                            </button>
                          )}

                          {/* Forensic Audit Action */}
                          <button
                            type="button"
                            onClick={() => handleOpenAudit(invite)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition"
                            title="Consulter les logs d'audit forensique"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
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

      {/* Modal: Send New Invitation */}
      {isSendModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Envoyer une Invitation d'Onboarding</h3>
                  <p className="text-xs text-slate-400">Le destinataire recevra un token d'accès temporaire.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSendModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nom Complet du Collaborateur *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ex: Jean Dupont"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Adresse E-mail Professionnelle *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jean.dupont@entreprise.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Rôle Rattaché (RBAC) *</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as Role)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="EMPLOYEE">Employé</option>
                    <option value="JUNIOR_TELLER">Guichetier Junior</option>
                    <option value="SENIOR_TELLER">Guichetier Senior</option>
                    <option value="HEAD_TELLER">Chef Caissier</option>
                    <option value="MANAGER">Manager</option>
                    <option value="OWNER">Propriétaire</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Intitulé du Poste</label>
                  <input
                    type="text"
                    value={newPosition}
                    onChange={(e) => setNewPosition(e.target.value)}
                    placeholder="ex: Chargé d'Opérations"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Succursale de Rattachement</label>
                  <select
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Département Affecté</label>
                  <select
                    value={newDeptId}
                    onChange={(e) => setNewDeptId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Salaire de Base Mensuel (HTG)</label>
                <input
                  type="number"
                  min="0"
                  value={newBaseSalary}
                  onChange={(e) => setNewBaseSalary(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSendModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSend}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmittingSend ? "Envoi en cours..." : "Générer & Envoyer"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Forensic Audit Drawer/Modal */}
      {auditLogModalInvite && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Audit Forensique d'Invitation</span>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded-full">
                      SHA-256 Seal
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Historique cryptographique des événements pour {auditLogModalInvite.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAuditLogModalInvite(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto text-xs">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between text-slate-400">
                  <span>ID Invitation:</span>
                  <span className="font-mono text-white">{auditLogModalInvite.id}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Token d'accès:</span>
                  <span className="font-mono text-indigo-400">{auditLogModalInvite.token || "Mass Import"}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Entreprise (Tenant):</span>
                  <span className="font-mono text-slate-300">{currentBusiness.name} ({currentBusiness.id})</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>Sceau de Traçabilité (forensic_logs)</span>
                </h4>

                {isLoadingAudit ? (
                  <div className="p-6 text-center text-slate-500">
                    Chargement des journaux forensiques...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-500 text-center">
                    Aucun journal forensique direct trouvé pour cet identifiant.
                  </div>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-bold text-emerald-400">{log.action}</span>
                        <span className="text-slate-500">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString("fr-FR") : ""}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        Acteur: <span className="text-slate-200">{log.userName || log.actorId}</span> ({log.userRole || "USER"})
                      </div>
                      {log.signature && (
                        <div className="text-[10px] font-mono text-slate-500 truncate pt-1 border-t border-slate-900">
                          Sceau: {log.signature}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 text-right">
              <button
                type="button"
                onClick={() => setAuditLogModalInvite(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
