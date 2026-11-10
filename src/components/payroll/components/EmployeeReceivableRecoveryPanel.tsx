import React, { useState, useEffect } from "react";
import {
  EmployeeReceivable,
  EmployeeReceivableStatus,
  Role,
} from "../../../types";
import { EmployeeReceivableRepository } from "../../../repositories/EmployeeReceivableRepository";
import { EmployeeReceivableService } from "../../../services/payroll/EmployeeReceivableService";
import { toast } from "sonner";
import {
  DollarSign,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Plus,
  ArrowRight,
  UserCheck,
  FileText,
  CreditCard,
  Building,
  RefreshCw,
} from "lucide-react";

export interface EmployeeReceivableRecoveryPanelProps {
  currentBusinessId: string;
  currentRole: Role;
  currentUser?: { id: string; name: string; role?: string };
  initialReceivables?: EmployeeReceivable[];
  onRefreshLedger?: () => void;
}

export const EmployeeReceivableRecoveryPanel: React.FC<EmployeeReceivableRecoveryPanelProps> = ({
  currentBusinessId,
  currentRole,
  currentUser = { id: "usr_current", name: "Opérateur FinOps", role: currentRole },
  initialReceivables = [],
  onRefreshLedger,
}) => {
  const [receivables, setReceivables] = useState<EmployeeReceivable[]>(initialReceivables);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"ALL" | EmployeeReceivableStatus>("ALL");

  // Approval Modal State
  const [approvalModalItem, setApprovalModalItem] = useState<EmployeeReceivable | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  // Repayment Modal State
  const [repaymentModalItem, setRepaymentModalItem] = useState<EmployeeReceivable | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK" | "MONCASH" | "NATCASH" | "WIRE">("BANK");
  const [repaymentNotes, setRepaymentNotes] = useState("");
  const [isSubmittingRepayment, setIsSubmittingRepayment] = useState(false);

  // Fetch from Firestore or local props
  const fetchReceivables = async () => {
    if (!currentBusinessId) return;
    setLoading(true);
    try {
      const items = await EmployeeReceivableRepository.listReceivablesByBusiness(currentBusinessId);
      if (items && items.length > 0) {
        setReceivables(items);
      } else {
        setReceivables(initialReceivables);
      }
    } catch (err) {
      console.warn("[EmployeeReceivablePanel] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceivables();
  }, [currentBusinessId]);

  useEffect(() => {
    if (initialReceivables && initialReceivables.length > 0) {
      setReceivables((prev) => {
        const merged = [...prev];
        for (const item of initialReceivables) {
          if (!merged.find((m) => m.id === item.id)) {
            merged.unshift(item);
          }
        }
        return merged;
      });
    }
  }, [initialReceivables]);

  // Handle Proposal Approval (Maker-Checker)
  const handleConfirmApprove = async () => {
    if (!approvalModalItem) return;
    setIsApproving(true);
    const approver = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role || currentRole,
    };

    try {
      // Execute approval logic (verifies segregation of duties)
      const { approvedReceivable } = await EmployeeReceivableRepository.approveProposal(
        approvalModalItem.id,
        {
          businessId: currentBusinessId,
          approver,
          approvalReason: approvalReason.trim() || "Approbation deuxième regard (Maker-Checker)",
        },
        approvalModalItem
      );

      // Update local UI state
      setReceivables((prev) =>
        prev.map((r) => (r.id === approvedReceivable.id ? approvedReceivable : r))
      );

      toast.success(
        `Créance approuvée avec succès ! Entrée comptable au Grand Livre générée (Dr 1310_EMPLOYEE_RECEIVABLES).`
      );
      setApprovalModalItem(null);
      setApprovalReason("");
      if (onRefreshLedger) onRefreshLedger();
    } catch (err: any) {
      console.error("[EmployeeReceivablePanel] Approval error:", err);
      const msg = err.message || "Erreur lors de l'approbation.";
      if (msg.includes("SegregationOfDutiesViolation") || msg.includes("propre proposition")) {
        toast.error(`[Alerte Ségrégation des Fonctions] Vous ne pouvez pas approuver une proposition que vous avez vous-même créée. Un deuxième utilisateur autorisé doit approuver.`);
      } else {
        toast.error(`Échec d'approbation: ${msg}`);
      }
    } finally {
      setIsApproving(false);
    }
  };

  // Handle Repayment Recording
  const handleConfirmRepayment = async () => {
    if (!repaymentModalItem) return;
    const amt = parseFloat(repaymentAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Veuillez saisir un montant valide supérieur à 0.");
      return;
    }

    if (amt > repaymentModalItem.outstandingAmount) {
      toast.error(
        `Le montant (${amt.toLocaleString()} ${repaymentModalItem.currency}) dépasse le solde restant dû (${repaymentModalItem.outstandingAmount.toLocaleString()} ${repaymentModalItem.currency}).`
      );
      return;
    }

    setIsSubmittingRepayment(true);
    const recordedBy = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role || currentRole,
    };

    try {
      const { updatedReceivable } = await EmployeeReceivableRepository.recordRepayment(
        repaymentModalItem.id,
        {
          businessId: currentBusinessId,
          amount: amt,
          paymentMethod,
          treasuryAccount: paymentMethod === "CASH" ? "1000_CASH" : "1010_BANK",
          recordedBy,
          notes: repaymentNotes.trim() || "Encaissement effectif remboursement trop-perçu",
        },
        repaymentModalItem
      );

      // Update local UI state
      setReceivables((prev) =>
        prev.map((r) => (r.id === updatedReceivable.id ? updatedReceivable : r))
      );

      toast.success(
        `Remboursement de ${amt.toLocaleString()} ${updatedReceivable.currency} enregistré ! Solde restant: ${updatedReceivable.outstandingAmount.toLocaleString()} ${updatedReceivable.currency}.`
      );
      setRepaymentModalItem(null);
      setRepaymentAmount("");
      setRepaymentNotes("");
      if (onRefreshLedger) onRefreshLedger();
    } catch (err: any) {
      console.error("[EmployeeReceivablePanel] Repayment error:", err);
      toast.error(`Échec du remboursement: ${err.message || "Erreur"}`);
    } finally {
      setIsSubmittingRepayment(false);
    }
  };

  // KPI Calculations
  const filteredReceivables = receivables.filter((r) => {
    if (activeFilter === "ALL") return true;
    return r.status === activeFilter;
  });

  const totalRecoverableHTG = receivables.reduce((sum, r) => sum + r.approvedRecoverableAmount, 0);
  const totalRecoveredHTG = receivables.reduce((sum, r) => sum + r.recoveredAmount, 0);
  const totalOutstandingHTG = receivables.reduce((sum, r) => sum + r.outstandingAmount, 0);
  const pendingApprovalCount = receivables.filter((r) => r.status === "PENDING_HUMAN_APPROVAL").length;

  const getStatusBadge = (status: EmployeeReceivableStatus) => {
    switch (status) {
      case "PENDING_HUMAN_APPROVAL":
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-xs flex items-center gap-1.5 w-fit">
            <Clock className="w-3.5 h-3.5" /> En attente d'approbation (Maker-Checker)
          </span>
        );
      case "APPROVED_PENDING_RECOVERY":
        return (
          <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs flex items-center gap-1.5 w-fit">
            <ShieldCheck className="w-3.5 h-3.5" /> Approuvée (En attente de remboursement)
          </span>
        );
      case "PARTIALLY_RECOVERED":
        return (
          <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-mono text-xs flex items-center gap-1.5 w-fit">
            <RefreshCw className="w-3.5 h-3.5" /> Partiellement Recouvrée
          </span>
        );
      case "RECOVERED":
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs flex items-center gap-1.5 w-fit">
            <CheckCircle2 className="w-3.5 h-3.5" /> Totalement Soldée & Recouvrée
          </span>
        );
      case "WRITTEN_OFF":
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono text-xs flex items-center gap-1.5 w-fit">
            Abandonnée (Passée en perte)
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 text-slate-100" id="employee-receivable-panel">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Créances Émises Total</span>
            <FileText className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-bold font-mono text-white">
            {totalRecoverableHTG.toLocaleString("fr-FR")} HTG
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Montant Recouvré</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {totalRecoveredHTG.toLocaleString("fr-FR")} HTG
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Solde Restant Dû</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-amber-400">
            {totalOutstandingHTG.toLocaleString("fr-FR")} HTG
          </div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>En Attente d'Approbation</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-amber-400">
            {pendingApprovalCount} Proposition{pendingApprovalCount > 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeFilter === "ALL"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-800/60 text-slate-400 hover:text-white"
            }`}
          >
            Tous ({receivables.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("PENDING_HUMAN_APPROVAL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeFilter === "PENDING_HUMAN_APPROVAL"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-slate-800/60 text-slate-400 hover:text-amber-300"
            }`}
          >
            En Attente d'Approbation ({pendingApprovalCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("APPROVED_PENDING_RECOVERY")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeFilter === "APPROVED_PENDING_RECOVERY"
                ? "bg-cyan-600 text-white shadow-sm"
                : "bg-slate-800/60 text-slate-400 hover:text-cyan-300"
            }`}
          >
            Approuvés
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("PARTIALLY_RECOVERED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeFilter === "PARTIALLY_RECOVERED"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-slate-800/60 text-slate-400 hover:text-indigo-300"
            }`}
          >
            Partiellement Recouvrés
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("RECOVERED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              activeFilter === "RECOVERED"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-slate-800/60 text-slate-400 hover:text-emerald-300"
            }`}
          >
            Soldés
          </button>
        </div>

        <button
          type="button"
          onClick={fetchReceivables}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Actualiser
        </button>
      </div>

      {/* Receivables List */}
      {filteredReceivables.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-2xl text-center text-slate-400 space-y-2">
          <ShieldCheck className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-medium">Aucune créance salariale ne correspond aux critères.</p>
          <p className="text-xs text-slate-500">
            Lorsqu'un cycle de paie déboursé est contre-passé, les propositions de recouvrement s'affichent automatiquement ici.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredReceivables.map((item) => (
            <div
              key={item.id}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition shadow-lg space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-white">
                      {item.employeeName || item.employeeId}
                    </span>
                    <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      Employé: {item.employeeId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Origine: Cycle de paie <span className="font-mono text-cyan-400">{item.originalPayrollCycleId}</span> | Compte: <span className="font-mono text-indigo-300">{item.receivableAccount}</span>
                  </p>
                </div>

                <div>{getStatusBadge(item.status)}</div>
              </div>

              {/* Amounts Grid */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 font-mono text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Montant Intégral Approuvé</span>
                  <span className="font-bold text-slate-200">
                    {item.approvedRecoverableAmount.toLocaleString("fr-FR")} {item.currency}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Déjà Recouvré</span>
                  <span className="font-bold text-emerald-400">
                    {item.recoveredAmount.toLocaleString("fr-FR")} {item.currency}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Solde Restant Dû</span>
                  <span className="font-bold text-amber-400">
                    {item.outstandingAmount.toLocaleString("fr-FR")} {item.currency}
                  </span>
                </div>
              </div>

              {/* Approval Info / Notes */}
              <div className="text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1">
                <div>
                  <span>Créé par: </span>
                  <span className="text-slate-200 font-medium">{item.createdByName || item.createdById}</span>
                  <span className="text-slate-500"> ({new Date(item.createdAt).toLocaleDateString()})</span>
                  {item.approverName && (
                    <span className="ml-3">
                      Approuvé par: <span className="text-cyan-300 font-medium">{item.approverName}</span>
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {item.status === "PENDING_HUMAN_APPROVAL" && (
                    <button
                      type="button"
                      onClick={() => {
                        setApprovalModalItem(item);
                        setApprovalReason("");
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Approuver (Maker-Checker)
                    </button>
                  )}

                  {(item.status === "APPROVED_PENDING_RECOVERY" || item.status === "PARTIALLY_RECOVERED") && (
                    <button
                      type="button"
                      onClick={() => {
                        setRepaymentModalItem(item);
                        setRepaymentAmount(item.outstandingAmount.toString());
                        setRepaymentNotes("");
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Enregistrer un Remboursement
                    </button>
                  )}
                </div>
              </div>

              {/* Repayments History */}
              {item.repayments && item.repayments.length > 0 && (
                <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800 space-y-2 mt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Historique des Remboursements Confirmés ({item.repayments.length})
                  </span>
                  <div className="space-y-1.5">
                    {item.repayments.map((rep) => (
                      <div
                        key={rep.id}
                        className="flex items-center justify-between text-xs font-mono bg-slate-900/60 p-2 rounded border border-slate-800"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-slate-300">{new Date(rep.repaymentDate).toLocaleDateString()}</span>
                          <span className="text-slate-500">| Mode: {rep.paymentMethod}</span>
                          {rep.recordedBy && (
                            <span className="text-slate-400">| Opérateur: {rep.recordedBy}</span>
                          )}
                        </div>
                        <span className="font-bold text-emerald-400">
                          +{rep.amount.toLocaleString("fr-FR")} {rep.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approval Modal (Maker-Checker) */}
      {approvalModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Approbation de Créance (Maker-Checker)</h3>
                <p className="text-xs text-slate-400">Valider la récupération du trop-perçu salarial</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Employé:</span>
                <span className="font-bold text-white">{approvalModalItem.employeeName || approvalModalItem.employeeId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Montant Recouvrable:</span>
                <span className="font-bold text-amber-400 font-mono">
                  {approvalModalItem.approvedRecoverableAmount.toLocaleString()} {approvalModalItem.currency}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Proposé par:</span>
                <span className="font-medium text-slate-200">{approvalModalItem.createdByName || approvalModalItem.createdById}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Compte d'Actif Cible:</span>
                <span className="font-mono text-indigo-300">{approvalModalItem.receivableAccount}</span>
              </div>
              <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2.5 rounded border border-amber-500/20 mt-2">
                <strong>Règle Ségrégation des Fonctions :</strong> L'approbateur doit être un utilisateur distinct de la personne ayant créé la contre-passation ({approvalModalItem.createdByName}).
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Motif / Justification d'Approbation
              </label>
              <textarea
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                placeholder="Ex: Validation RH du trop-perçu suite à erreur de saisine sur heures supp."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 outline-none focus:border-indigo-500 h-20"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApprovalModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isApproving}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-amber-900/30 cursor-pointer"
              >
                {isApproving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                <span>Confirmer l'Approbation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {repaymentModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center gap-3 text-emerald-400">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Enregistrer un Remboursement Employé</h3>
                <p className="text-xs text-slate-400">Encaissement de trop-perçu salarial</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs text-slate-300 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Employé:</span>
                <span className="font-bold text-white">{repaymentModalItem.employeeName || repaymentModalItem.employeeId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Solde Restant Dû:</span>
                <span className="font-bold text-amber-400">
                  {repaymentModalItem.outstandingAmount.toLocaleString()} {repaymentModalItem.currency}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Montant du Remboursement ({repaymentModalItem.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={repaymentModalItem.outstandingAmount}
                  value={repaymentAmount}
                  onChange={(e) => setRepaymentAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-emerald-400 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mode de Paiement & Compte Trésorerie
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="BANK">Virement Bancaire (Compte 1010_BANK)</option>
                  <option value="CASH">Caisse / Cash (Compte 1000_CASH)</option>
                  <option value="MONCASH">MonCash / NatCash</option>
                  <option value="WIRE">Transfert / Chèque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Remarques / Référence Reçu
                </label>
                <input
                  type="text"
                  value={repaymentNotes}
                  onChange={(e) => setRepaymentNotes(e.target.value)}
                  placeholder="Ex: Reçu #REC-2026-004 / Dépôt direct en banque"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRepaymentModalItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmRepayment}
                disabled={isSubmittingRepayment}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-lg shadow-emerald-900/30 cursor-pointer"
              >
                {isSubmittingRepayment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>Valider le Remboursement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
