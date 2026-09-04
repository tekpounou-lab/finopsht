import React, { useState } from "react";
import { 
  FileSpreadsheet, 
  Plus, 
  Search, 
  Eye, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Trash2, 
  Send,
  Check,
  ChevronDown,
  RefreshCw,
  FileCheck,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { Proforma, ProformaStatus, InvoiceLine, InvoiceTemplate, Lead } from "../../types/crm";
import { ProformaService } from "../../services/crm/ProformaService";
import { ProformaRepository } from "../../repositories/crm/ProformaRepository";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { toast } from "sonner";

interface ProformaManagerProps {
  businessId: string;
  proformas: Proforma[];
  leads: Lead[];
  template: InvoiceTemplate;
  currentRole: string;
  currentUser: any;
  onInvoiceCreated?: () => void;
}

export const ProformaManager: React.FC<ProformaManagerProps> = ({
  businessId,
  proformas,
  leads,
  template,
  currentRole,
  currentUser,
  onInvoiceCreated
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Proforma | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [optimisticStatusMap, setOptimisticStatusMap] = useState<Record<string, ProformaStatus>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [openStatusMenuId, setOpenStatusMenuId] = useState<string | null>(null);

  // Form State
  const [clientSelectionType, setClientSelectionType] = useState<"SELECT_LEAD" | "CUSTOM">("SELECT_LEAD");
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [formData, setFormData] = useState<{
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientAddress: string;
    clientNif: string;
    issueDate: string;
    validUntil: string;
    currency: "HTG" | "USD";
    paymentTerms: string;
    notes: string;
    items: InvoiceLine[];
  }>({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    clientNif: "",
    issueDate: new Date().toISOString().split("T")[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    currency: "HTG",
    paymentTerms: "Paiement à 30 jours net",
    notes: "Offre valable pour une durée de 30 jours à compter de la date d'émission.",
    items: [
      ProformaService.calculateLine("Prestation de services / Fourniture standard", 1, 15000, 0, 10)
    ]
  });

  const effectiveRole = (currentRole || currentUser?.role || "").toUpperCase();
  const canManage = !currentRole || ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "EXECUTIVE", "DIRECTOR"].includes(effectiveRole) || effectiveRole.includes("ADMIN") || effectiveRole.includes("MANAGER");

  const effectiveProformas = proformas
    .filter(p => !deletedIds.has(p.id))
    .map(p => {
      if (optimisticStatusMap[p.id]) {
        return { ...p, status: optimisticStatusMap[p.id] };
      }
      return p;
    });

  const filteredProformas迷 = effectiveProformas.filter((proforma) => {
    const matchesSearch = 
      proforma.proformaNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      proforma.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (proforma.clientEmail && proforma.clientEmail.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || proforma.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totals = ProformaService.calculateTotals(formData.items);

  const handleOpenCreate = () => {
    const now而去 = new Date();
    const issueDate = now而去.toISOString().split("T")[0];
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    setSelectedLeadId("");
    setFormData({
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      clientAddress: "",
      clientNif: "",
      issueDate,
      validUntil,
      currency: "HTG",
      paymentTerms: "Paiement à 30 jours net",
      notes: "Offre valable pour une durée de 30 jours.",
      items: [
        ProformaService.calculateLine("Prestation de conseil & ingénierie", 1, 25000, 0, 10)
      ]
    });
    setIsModalOpen(true);
  };

  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setFormData((prev) => ({
        ...prev,
        clientName: lead.companyName ? `${lead.companyName} (${lead.contactName})` : lead.contactName,
        clientEmail: lead.email || "",
        clientPhone: lead.phone || "",
        clientAddress: lead.address || "",
        currency: lead.currency || "HTG"
      }));
    }
  };

  const handleLineChange不易 = (index: number, field: keyof InvoiceLine, value: any) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      const target = { ...newItems[index], [field]: value };
      newItems[index] = ProformaService.calculateLine(
        target.description,
        target.quantity,
        target.unitPrice,
        target.discountRate,
        target.taxRate,
        target.id
      );
      return { ...prev, items: newItems };
    });
  };

  const handleAddLine = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        ProformaService.calculateLine("Nouvel article / prestation", 1, 1000, 0, 10)
      ]
    }));
  };

  const handleRemoveLine = (index: number) => {
    if (formData.items.length <= 1) {
      toast.error("Un devis doit contenir au moins une ligne.");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSaveProforma = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = ProformaService.validateProforma({
      businessId,
      clientName: formData.clientName,
      items: formData.items
    });

    if (!validation.isValid) {
      toast.error(validation.errors.join(" "));
      return;
    }

    try {
      const now = new Date().toISOString();
      const calculated = ProformaService.calculateTotals(formData.items);
      const proformaNumber = ProformaService.generateProformaNumber(proformas.length);

      const newProforma: Proforma = {
        id: `pro_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        businessId,
        proformaNumber,
        leadId: selectedLeadId || undefined,
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientPhone: formData.clientPhone,
        clientAddress: formData.clientAddress,
        clientNif: formData.clientNif,
        issueDate: formData.issueDate,
        validUntil: formData.validUntil,
        currency: formData.currency,
        items: formData.items,
        subtotal: calculated.subtotal,
        totalDiscount: calculated.totalDiscount,
        taxAmount: calculated.taxAmount,
        totalAmount: calculated.totalAmount,
        status: "DRAFT",
        notes: formData.notes,
        paymentTerms: formData.paymentTerms,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser?.name || "Administrateur"
      };

      await ProformaRepository.saveProforma(newProforma);
      toast.success(`Devis proforma ${proformaNumber} enregistré avec succès !`);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("[ProformaManager] Error creating proforma:", err);
      toast.error("Erreur lors de la création du devis.");
    }
  };

  const handleConvertToInvoice = async (proforma: Proforma) => {
    const targetBusinessId = proforma.businessId || businessId;
    setProcessingId(proforma.id);
    try {
      const result = await ProformaService.convertToInvoice(
        targetBusinessId,
        proforma,
        30,
        currentUser?.name || currentUser?.displayName || "Opérateur CRM"
      );
      setOptimisticStatusMap(prev => ({ ...prev, [proforma.id]: "CONVERTED_TO_INVOICE" }));
      toast.success(`Facture ${result.invoice.invoiceNumber} générée avec succès depuis le devis ${proforma.proformaNumber} !`);
      if (onInvoiceCreated) onInvoiceCreated();
    } catch (err: any) {
      console.error("[ProformaManager] Error converting to invoice:", err);
      toast.error(err.message || "Erreur lors de la conversion en facture.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleStatusUpdate = async (proformaId: string, status: ProformaStatus) => {
    const targetProforma = proformas.find(p => p.id === proformaId);
    const targetBusinessId = targetProforma?.businessId || businessId;
    setOpenStatusMenuId(null);
    
    // Instant optimistic update
    setOptimisticStatusMap(prev => ({ ...prev, [proformaId]: status }));
    setProcessingId(proformaId);
    
    try {
      await ProformaRepository.updateStatus(targetBusinessId, proformaId, status);
      const labels: Record<ProformaStatus, string> = {
        DRAFT: "Brouillon",
        SENT: "Envoyé",
        ACCEPTED: "Accepté",
        CONVERTED_TO_INVOICE: "Facturé",
        EXPIRED: "Expiré",
        REJECTED: "Refusé"
      };
      toast.success(`Statut du devis mis à jour : ${labels[status] || status}`);
    } catch (err: any) {
      console.error("[ProformaManager] Error updating status:", err);
      toast.error("Erreur lors du changement de statut.");
      setOptimisticStatusMap(prev => {
        const next = { ...prev };
        delete next[proformaId];
        return next;
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteProforma = async (proformaId: string, number: string) => {
    const targetProforma = proformas.find(p => p.id === proformaId);
    const targetBusinessId不易 = targetProforma?.businessId || businessId;
    
    // Instant optimistic removal
    setDeletedIds(prev => new Set(prev).add(proformaId));
    setProcessingId(proformaId);
    
    try {
      await ProformaRepository.deleteProforma(targetBusinessId不易, proformaId);
      toast.success(`Devis ${number} supprimé avec succès.`);
    } catch (err: any) {
      console.error("[ProformaManager] Error deleting proforma:", err);
      toast.error("Erreur lors de la suppression du devis.");
      setDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(proformaId);
        return next;
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (proforma: Proforma) => {
    const status = proforma.status;
    const isMenuOpen = openStatusMenuId === proforma.id;

    let badgeClass = "bg-slate-800 text-slate-300 border-slate-700";
    let label = "Brouillon";
    let icon = <Clock className="w-3 h-3 text-slate-400" />;

    if (status === "SENT") {
      badgeClass人士: badgeClass = "bg-sky-500/10 text-sky-400 border-sky-500/30";
      label = "Envoyé";
      icon = <Send className="w-3 h-3 text-sky-400" />;
    } else if (status === "ACCEPTED") {
      badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      label = "Accepté";
      icon = <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
    } else if (status === "CONVERTED_TO_INVOICE") {
      badgeClass = "bg-purple-500/10 text-purple-400 border-purple-500/30";
      label述: label = "Facturé";
      icon = <FileCheck className="w-3 h-3 text-purple-400" />;
    } else if (status === "EXPIRED") {
      badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/30";
      label = "Expiré";
      icon = <AlertTriangle className="w-3 h-3 text-amber-400" />;
    } else if (status === "REJECTED") {
      badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/30";
      label = "Refusé";
      icon = <XCircle className="w-3 h-3 text-rose-400" />;
    }

    return (
      <div className="relative inline-block">
        <button
          type="button"
          id={`btn-status-dropdown-${proforma.id}`}
          onClick={(e) => {
            e.stopPropagation();
            if (canManage) {
              setOpenStatusMenuId(isMenuOpen ? null : proforma.id);
            }
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${badgeClass} ${canManage ? "hover:opacity-80 cursor-pointer shadow-sm" : ""}`}
          title={canManage ? "Cliquer pour changer le statut" : undefined}
        >
          {icon}
          <span>{label}</span>
          {canManage && <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />}
        </button>

        {isMenuOpen && canManage && (
          <>
            <div 
              className="fixed inset-0 z-30" 
              onClick={() => setOpenStatusMenuId(null)}
            />
            <div className="absolute left-0 top-full mt-1.5 z-40 w-44 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 text-xs divide-y divide-slate-800">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Changer le statut
              </div>
              <div className="py-1">
                {(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as ProformaStatus[]).map((st) => (
                  <button
                    key={st}
                    id={`opt-status-${st.toLowerCase()}-${proforma.id}`}
                    type="button"
                    onClick={() => handleStatusUpdate(proforma.id, st)}
                    className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-800 transition ${proforma.status === st ? "text-sky-400 font-bold bg-sky-950/40" : "text-slate-300"}`}
                  >
                    <span>
                      {st === "DRAFT" ? "Brouillon" : 
                       st === "SENT" ? "Envoyé" : 
                       st === "ACCEPTED" ? "Accepté" : 
                       st === "REJECTED" ? "Refusé" : "Expiré"}
                    </span>
                    {proforma.status === st && <Check className="w-3.5 h-3.5 text-sky-400" />}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div id="section-proforma-manager" className="space-y-6">
      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-lg">
            {(["ALL", "DRAFT", "SENT", "ACCEPTED", "CONVERTED_TO_INVOICE"] as const).map((st) => (
              <button
                key={st}
                id={`filter-proforma-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  statusFilter === st 
                    ? "bg-sky-600 text-white shadow-sm font-semibold" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {st === "ALL" ? "Tous" : st === "DRAFT" ? "Brouillons" : st === "SENT" ? "Envoyés" : st === "ACCEPTED" ? "Acceptés" : "Facturés"}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="input-search-proformas"
              type="text"
              placeholder="Rechercher par N° devis, client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {canManage && (
          <button
            id="btn-add-proforma"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Devis Proforma</span>
          </button>
        )}
      </div>

      {/* Proformas Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="table-proformas" className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">N° Devis</th>
                <th className="py-3 px-4">Client / Prospect</th>
                <th className="py-3 px-4">Date d'Émission</th>
                <th className="py-3 px-4">Validité</th>
                <th className="py-3 px-4">Montant Total</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredProformas迷.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-600 opacity-40" />
                    <p>Aucun devis proforma trouvé.</p>
                  </td>
                </tr>
              ) : (
                filteredProformas迷.map((proforma) => {
                  const isProcessing = processingId === proforma.id;

                  return (
                    <tr key={proforma.id} className="hover:bg-slate-800/30 transition group">
                      <td className="py-3 px-4 font-mono font-bold text-sky-400 flex items-center gap-2">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>{proforma.proformaNumber}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{proforma.clientName}</div>
                        {proforma.clientEmail && <div className="text-slate-400 text-[11px]">{proforma.clientEmail}</div>}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        {proforma.issueDate}
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        {proforma.validUntil}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        {proforma.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {proforma.currency}
                      </td>

                      <td className="py-3 px-4">
                        {getStatusBadge(proforma)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview Document Button */}
                          <button
                            type="button"
                            id={`btn-preview-proforma-${proforma.id}`}
                            onClick={() => setPreviewDoc(proforma)}
                            title="Aperçu & Impression"
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Quick Shortcut: Mark as Sent */}
                          {canManage && proforma.status === "DRAFT" && (
                            <button
                              type="button"
                              id={`btn-mark-sent-${proforma.id}`}
                              disabled={isProcessing}
                              onClick={() => handleStatusUpdate(proforma.id, "SENT")}
                              title="Marquer comme Envoyé au client"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-950 text-sky-300 border border-sky-800 hover:bg-sky-900 text-[11px] font-semibold transition shadow-sm active:scale-95"
                            >
                              <Send className="w-3 h-3" />
                              <span>Envoyé</span>
                            </button>
                          )}

                          {/* Quick Shortcut: Mark as Accepted */}
                          {canManage && (proforma.status === "SENT" || proforma.status === "DRAFT") && (
                            <button
                              type="button"
                              id={`btn-mark-accepted-${proforma.id}`}
                              disabled={isProcessing}
                              onClick={() => handleStatusUpdate(proforma.id, "ACCEPTED")}
                              title="Marquer comme Accepté"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 text-[11px] font-semibold transition shadow-sm active:scale-95"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Accepter</span>
                            </button>
                          )}

                          {/* Convert to Invoice Button */}
                          {canManage && (proforma.status === "ACCEPTED" || proforma.status === "SENT" || proforma.status === "DRAFT") && (
                            <button
                              type="button"
                              id={`btn-convert-invoice-${proforma.id}`}
                              disabled={isProcessing}
                              onClick={() => handleConvertToInvoice(proforma)}
                              title="Convertir immédiatement en Facture Officielle"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition shadow-sm active:scale-95"
                            >
                              {isProcessing ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <ArrowRight className="w-3 h-3" />
                              )}
                              <span>Facturer</span>
                            </button>
                          )}

                          {/* Delete Proforma Button */}
                          {canManage && (
                            <button
                              type="button"
                              id={`btn-delete-proforma-${proforma.id}`}
                              disabled={isProcessing}
                              onClick={() => handleDeleteProforma(proforma.id, proforma.proformaNumber)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition active:scale-95"
                              title="Supprimer ce devis"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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

      {/* Modal Create Proforma */}
      {isModalOpen && (
        <div id="modal-proforma-form-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div id="modal-proforma-form-container" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                <span>Nouveau Devis Proforma</span>
              </h3>
              <button
                id="btn-modal-close-proforma"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProforma} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Client Selection */}
              <div className="bg-slate-950/60 p-4 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200">Destinataire / Client</label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      id="btn-client-select-lead"
                      onClick={() => setClientSelectionType("SELECT_LEAD")}
                      className={`px-2.5 py-1 rounded transition ${clientSelectionType === "SELECT_LEAD" ? "bg-sky-600 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
                    >
                      Choisir dans les Contacts CRM
                    </button>
                    <button
                      type="button"
                      id="btn-client-custom"
                      onClick={() => {
                        setClientSelectionType("CUSTOM");
                        setSelectedLeadId("");
                      }}
                      className={`px-2.5 py-1 rounded transition ${clientSelectionType === "CUSTOM" ? "bg-sky-600 text-white font-semibold" : "text-slate-400 hover:text-white"}`}
                    >
                      Saisie manuelle libre
                    </button>
                  </div>
                </div>

                {clientSelectionType === "SELECT_LEAD" && (
                  <div>
                    <select
                      id="select-lead-for-quote"
                      value={selectedLeadId}
                      onChange={(e) => handleLeadSelect(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    >
                      <option value="">-- Sélectionner un Contact / Lead existant --</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.companyName} ({l.contactName}) — {l.status}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Nom / Raison Sociale *</label>
                    <input
                      id="input-proforma-client-name"
                      type="text"
                      required
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                      placeholder="Nom de l'entreprise ou du client"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Email</label>
                    <input
                      id="input-proforma-client-email"
                      type="email"
                      value={formData.clientEmail}
                      onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                      placeholder="client@mail.com"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">NIF / Matricule Fiscal</label>
                    <input
                      id="input-proforma-client-nif"
                      type="text"
                      value={formData.clientNif}
                      onChange={(e) => setFormData({ ...formData, clientNif: e.target.value })}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                      placeholder="000-000-000-0"
                    />
                  </div>
                </div>
              </div>

              {/* Dates & Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Date d'Émission</label>
                  <input
                    id="input-proforma-date"
                    type="date"
                    required
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Date de Validité</label>
                  <input
                    id="input-proforma-valid-until"
                    type="date"
                    required
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Devise</label>
                  <select
                    id="select-proforma-currency"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as "HTG" | "USD" })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="HTG">HTG (Gourdes)</option>
                    <option value="USD">USD (Dollars)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Conditions de Paiement</label>
                  <input
                    id="input-proforma-payment-terms"
                    type="text"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="Paiement à 30 jours net"
                  />
                </div>
              </div>

              {/* Dynamic Line Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200">Articles & Prestations Facturables</label>
                  <button
                    type="button"
                    id="btn-add-proforma-line"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold border border-slate-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter une ligne</span>
                  </button>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Description / Prestation</th>
                        <th className="py-2.5 px-3 w-20 text-right">Qté</th>
                        <th className="py-2.5 px-3 w-32 text-right">Prix Unitaire</th>
                        <th className="py-2.5 px-3 w-20 text-right">Remise %</th>
                        <th className="py-2.5 px-3 w-20 text-right">TVA %</th>
                        <th className="py-2.5 px-3 w-28 text-right">Total Net</th>
                        <th className="py-2.5 px-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                      {formData.items.map((item, index) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              required
                              value={item.description}
                              onChange={(e) => handleLineChange不易(index, "description", e.target.value)}
                              className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white focus:outline-none focus:border-sky-500"
                              placeholder="Désignation du produit ou service"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => handleLineChange不易(index, "quantity", e.target.value)}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white text-right focus:outline-none focus:border-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => handleLineChange不易(index, "unitPrice", e.target.value)}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white text-right focus:outline-none focus:border-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.discountRate}
                              onChange={(e) => handleLineChange不易(index, "discountRate", e.target.value)}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white text-right focus:outline-none focus:border-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.taxRate}
                              onChange={(e) => handleLineChange不易(index, "taxRate", e.target.value)}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-white text-right focus:outline-none focus:border-sky-500"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-white">
                            {item.total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(index)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                              title="Supprimer la ligne"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
                <div className="w-full sm:w-1/2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Notes & Conditions Spécifiques</label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="Instructions de livraison, coordonnées bancaires..."
                  />
                </div>

                <div className="w-full sm:w-1/2 max-w-xs ml-auto bg-slate-950/80 p-4 border border-slate-800 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Sous-Total HT :</span>
                    <span className="font-mono text-white">{totals.subtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                  </div>
                  {totals.totalDiscount > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Remise Totale :</span>
                      <span className="font-mono">-{totals.totalDiscount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-400">
                    <span>TVA / Taxes :</span>
                    <span className="font-mono text-white">+{totals.taxAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-800 font-bold text-sm text-white">
                    <span>TOTAL TTC :</span>
                    <span className="font-mono text-emerald-400">{totals.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  id="btn-cancel-proforma"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  id="btn-save-proforma-submit"
                  className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm"
                >
                  Créer le devis proforma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          document={previewDoc}
          template={template}
          type="PROFORMA"
        />
      )}
    </div>
  );
};
