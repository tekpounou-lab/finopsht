import React, { useState } from "react";
import { 
  FileText, 
  Plus, 
  Search, 
  Eye, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  DollarSign, 
  CreditCard, 
  BookOpen, 
  Trash2,
  Lock,
  RotateCcw,
  Sparkles
} from "lucide-react";
import { Invoice, InvoiceStatus, InvoiceLine, InvoiceTemplate, InvoicePayment, Lead } from "../../types/crm";
import { InvoiceService } from "../../services/crm/InvoiceService";
import { InvoiceRepository } from "../../repositories/crm/InvoiceRepository";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { toast } from "sonner";

interface InvoiceManagerProps {
  businessId: string;
  invoices: Invoice[];
  leads: Lead[];
  template: InvoiceTemplate;
  currentRole: string;
  currentUser: any;
  onRefresh?: () => void;
  onAddTransaction?: (tx: any) => void;
}

export const InvoiceManager: React.FC<InvoiceManagerProps> = ({
  businessId,
  invoices,
  leads,
  template,
  currentRole,
  currentUser,
  onRefresh,
  onAddTransaction
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Invoice | null>(null);

  // Payment Modal State
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"BANK_TRANSFER" | "CASH" | "CHECK" | "MONCASH" | "NATCASH" | "CARD" | "OTHER">("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentNotes, setPaymentNotes] = useState<string>("");

  // Create Invoice Form State
  const [selectedLeadId, setSelectedLeadId] = useState<string>("");
  const [formData, setFormData] = useState<{
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientAddress: string;
    clientNif: string;
    issueDate: string;
    dueDate: string;
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
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    currency: "HTG",
    paymentTerms: "Paiement à réception",
    notes: "Merci de votre confiance.",
    items: [
      InvoiceService.calculateLine({ description: "Vente de matériel / Prestation informatique", quantity: 1, unitPrice: 20000, discountRate: 0, taxRate: 10 })
    ]
  });

  const canManage = ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"].includes(currentRole);

  const getPaidAmount = (inv: Invoice): number => {
    if (inv.amountPaid !== undefined && inv.amountPaid !== null) return inv.amountPaid;
    return inv.isPaid ? inv.totalAmount : 0;
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.clientEmail && inv.clientEmail.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const invoiceMetrics = {
    totalBilled: invoices.reduce((sum, i) => sum + (i.status !== "CANCELLED" ? i.totalAmount : 0), 0),
    totalCollected: invoices.reduce((sum, i) => sum + getPaidAmount(i), 0),
    totalOutstanding: invoices.reduce((sum, i) => sum + (i.status !== "CANCELLED" ? (i.totalAmount - getPaidAmount(i)) : 0), 0)
  };

  const handleOpenCreate = () => {
    setSelectedLeadId("");
    setFormData({
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      clientAddress: "",
      clientNif: "",
      issueDate: new Date().toISOString().split("T")[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      currency: "HTG",
      paymentTerms: "Paiement à réception",
      notes: "Merci de votre confiance.",
      items: [
        InvoiceService.calculateLine({ description: "Vente de matériel / Prestation informatique", quantity: 1, unitPrice: 20000, discountRate: 0, taxRate: 10 })
      ]
    });
    setIsCreateModalOpen(true);
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

  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      const target = { ...newItems[index], [field]: value };
      newItems[index] = InvoiceService.calculateLine(target);
      return { ...prev, items: newItems };
    });
  };

  const handleAddLine = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        InvoiceService.calculateLine({ description: "Nouvel article / prestation", quantity: 1, unitPrice: 1000, discountRate: 0, taxRate: 10 })
      ]
    }));
  };

  const handleRemoveLine = (index: number) => {
    if (formData.items.length <= 1) {
      toast.error("Une facture doit contenir au moins une ligne.");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName) {
      toast.error("Veuillez renseigner le nom du client.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const calculated = InvoiceService.calculateTotals(formData.items);
      const invoiceNumber = InvoiceService.generateInvoiceNumber(invoices.length);

      const newInvoice: Invoice = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        businessId,
        invoiceNumber,
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientPhone: formData.clientPhone,
        clientAddress: formData.clientAddress,
        clientNif: formData.clientNif,
        issueDate: formData.issueDate,
        dueDate: formData.dueDate,
        currency: formData.currency,
        items: formData.items,
        subtotal: calculated.subtotal,
        totalDiscount: calculated.totalDiscount,
        taxAmount: calculated.taxAmount,
        totalAmount: calculated.totalAmount,
        amountPaid: 0,
        status: "ISSUED",
        accountingStatus: "DRAFT",
        isPaid: false,
        notes: formData.notes,
        paymentTerms: formData.paymentTerms,
        createdAt: now,
        updatedAt: now,
        createdBy: currentUser?.name || "Administrateur"
      };

      await InvoiceRepository.saveInvoice(newInvoice);
      toast.success(`Facture ${invoiceNumber} créée avec succès !`);
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error("[InvoiceManager] Error creating invoice:", err);
      toast.error("Erreur lors de la création de la facture.");
    }
  };

  const handlePostToLedger = async (invoice: Invoice) => {
    try {
      const actor = currentUser ? { uid: currentUser.id || currentUser.uid, email: currentUser.email || "", name: currentUser.name || "Comptable" } : undefined;
      const result = await InvoiceService.postInvoiceToLedger(
        invoice,
        undefined,
        undefined,
        actor
      );
      if (onAddTransaction) {
        onAddTransaction(result);
      }
      toast.success(`Écriture comptable générée dans le Grand Livre (Réf: ${result.id}) !`);
    } catch (err: any) {
      console.error("[InvoiceManager] Error posting to ledger:", err);
      toast.error(err.message || "Erreur lors de l'enregistrement comptable.");
    }
  };

  const handleOpenPaymentModal = (invoice: Invoice) => {
    const paid = getPaidAmount(invoice);
    setPaymentModalInvoice(invoice);
    setPaymentAmount(Math.max(0, invoice.totalAmount - paid));
    setPaymentMethod("BANK_TRANSFER");
    setPaymentReference(`VIR-${Date.now().toString().substring(6)}`);
    setPaymentNotes("");
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;
    if (paymentAmount <= 0) {
      toast.error("Le montant du règlement doit être supérieur à zéro.");
      return;
    }

    try {
      const actor = currentUser ? { uid: currentUser.id || currentUser.uid, email: currentUser.email || "", name: currentUser.name || "Comptable" } : undefined;
      const result = await InvoiceService.recordInvoicePayment(
        businessId,
        paymentModalInvoice.id,
        paymentMethod,
        undefined,
        undefined,
        actor
      );

      if (onAddTransaction && result.paymentTransaction) {
        onAddTransaction(result.paymentTransaction);
      }

      toast.success(`Paiement de ${paymentAmount.toLocaleString("fr-FR")} ${paymentModalInvoice.currency} enregistré et lettré en comptabilité !`);
      setPaymentModalInvoice(null);
    } catch (err: any) {
      console.error("[InvoiceManager] Error recording payment:", err);
      toast.error(err.message || "Erreur lors de l'enregistrement du règlement.");
    }
  };

  const handleDeleteInvoice = async (invoiceId: string, number: string) => {
    if (!window.confirm(`Supprimer définitivement la facture ${number} ?`)) return;
    try {
      await InvoiceRepository.deleteInvoice(businessId, invoiceId);
      toast.success("Facture supprimée.");
    } catch (err: any) {
      toast.error("Erreur lors de la suppression.");
    }
  };

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">Brouillon</span>;
      case "ISSUED":
      case "SENT":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">Émise</span>;
      case "PAID":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Payée</span>;
      case "PARTIALLY_PAID":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Partiellement Payée</span>;
      case "OVERDUE":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">En Retard</span>;
      case "CANCELLED":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">Annulée</span>;
      default:
        return null;
    }
  };

  const totals = InvoiceService.calculateTotals(formData.items);

  return (
    <div id="section-invoice-manager" className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Chiffre d'Affaires Facturé</p>
            <h3 className="text-2xl font-black text-white mt-1">
              {invoiceMetrics.totalBilled.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} HTG
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Encaissé / Recouvré</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">
              {invoiceMetrics.totalCollected.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} HTG
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Créances Clients en Attente</p>
            <h3 className="text-2xl font-black text-amber-400 mt-1">
              {invoiceMetrics.totalOutstanding.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} HTG
            </h3>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="input-search-invoices"
              type="text"
              placeholder="Rechercher par n° de facture, client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            id="select-filter-invoice-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ISSUED">Émises</option>
            <option value="PAID">Payées</option>
            <option value="OVERDUE">En retard</option>
            <option value="DRAFT">Brouillons</option>
            <option value="CANCELLED">Annulées</option>
          </select>
        </div>

        {canManage && (
          <button
            id="btn-create-invoice"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Facture</span>
          </button>
        )}
      </div>

      {/* Invoices Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">N° Facture</th>
                <th className="py-3.5 px-4">Client</th>
                <th className="py-3.5 px-4">Date / Échéance</th>
                <th className="py-3.5 px-4">Montant TTC</th>
                <th className="py-3.5 px-4">Encaissé</th>
                <th className="py-3.5 px-4">Statut</th>
                <th className="py-3.5 px-4">Grand Livre</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucune facture trouvée.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const paid = getPaidAmount(inv);
                  const remaining = Math.max(0, inv.totalAmount - paid);
                  const isPosted = inv.accountingStatus === "POSTED" || Boolean(inv.accountingTransactionId);

                  return (
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition group">
                      <td className="py-3 px-4 font-mono font-bold text-sky-400 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{inv.invoiceNumber}</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{inv.clientName}</div>
                        {inv.clientNif && <div className="text-slate-500 font-mono text-[10px]">NIF: {inv.clientNif}</div>}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-300">{inv.issueDate}</div>
                        <div className="text-slate-500 text-[10px]">Échéance : {inv.dueDate}</div>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {inv.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {inv.currency}
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <span className={paid > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                          {paid.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {inv.currency}
                        </span>
                        {remaining > 0 && (
                          <div className="text-[10px] text-amber-400">Reste : {remaining.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        {getStatusBadge(inv.status)}
                      </td>

                      <td className="py-3 px-4">
                        {isPosted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Comptabilisée</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            <Clock className="w-3 h-3" />
                            <span>Non Lettrée</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview Document */}
                          <button
                            id={`btn-preview-invoice-${inv.id}`}
                            onClick={() => setPreviewDoc(inv)}
                            title="Aperçu & Impression PDF"
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Post to Ledger button if unposted */}
                          {canManage && !isPosted && (
                            <button
                              id={`btn-post-ledger-${inv.id}`}
                              onClick={() => handlePostToLedger(inv)}
                              title="Enregistrer au Grand Livre (Partie Double)"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/80 hover:bg-emerald-900 text-[11px] font-medium transition"
                            >
                              <BookOpen className="w-3 h-3" />
                              <span>Comptabiliser</span>
                            </button>
                          )}

                          {/* Record Payment Button */}
                          {canManage && inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                            <button
                              id={`btn-pay-invoice-${inv.id}`}
                              onClick={() => handleOpenPaymentModal(inv)}
                              title="Encaisser un règlement"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold transition shadow-sm"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>Encaisser</span>
                            </button>
                          )}

                          {canManage && inv.status === "DRAFT" && (
                            <button
                              id={`btn-delete-invoice-${inv.id}`}
                              onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="Supprimer"
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

      {/* Record Payment Modal */}
      {paymentModalInvoice && (
        <div id="modal-payment-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div id="modal-payment-container" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Enregistrement de Règlement</span>
              </h3>
              <button
                id="btn-close-payment-modal"
                onClick={() => setPaymentModalInvoice(null)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Facture :</span>
                  <span className="font-mono font-bold text-white">{paymentModalInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Client :</span>
                  <span className="text-white font-medium">{paymentModalInvoice.clientName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Reste à payer :</span>
                  <span className="font-mono font-bold text-amber-400">
                    {(paymentModalInvoice.totalAmount - getPaidAmount(paymentModalInvoice)).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {paymentModalInvoice.currency}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Montant Reçu ({paymentModalInvoice.currency}) *</label>
                <input
                  id="input-payment-amount"
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  max={paymentModalInvoice.totalAmount - getPaidAmount(paymentModalInvoice)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono font-bold text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Mode de Paiement *</label>
                <select
                  id="select-payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="BANK_TRANSFER">Virement Bancaire</option>
                  <option value="CHECK">Chèque</option>
                  <option value="CASH">Espèces / Caisse</option>
                  <option value="MONCASH">MonCash</option>
                  <option value="NATCASH">NatCash</option>
                  <option value="CARD">Carte Bancaire</option>
                  <option value="OTHER">Autre</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Référence Transaction / Pièce</label>
                <input
                  id="input-payment-ref"
                  type="text"
                  placeholder="Ex: CHQ-928374, VIR-102938"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Observations</label>
                <textarea
                  id="input-payment-notes"
                  rows={2}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  placeholder="Notes sur le règlement..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  id="btn-cancel-payment"
                  onClick={() => setPaymentModalInvoice(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  id="btn-submit-payment"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Valider l'Encaissement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {isCreateModalOpen && (
        <div id="modal-create-invoice-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div id="modal-create-invoice-container" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                <span>Création d'une Facture Client</span>
              </h3>
              <button
                id="btn-close-create-modal"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Client Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Destinataire & Client</h4>
                  {leads.length > 0 && (
                    <select
                      id="select-import-lead"
                      value={selectedLeadId}
                      onChange={(e) => handleLeadSelect(e.target.value)}
                      className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-sky-400 focus:outline-none focus:border-sky-500"
                    >
                      <option value="">-- Importer depuis les Contacts CRM --</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.companyName ? `${l.companyName} (${l.contactName})` : l.contactName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Nom / Raison Sociale *</label>
                    <input
                      id="input-invoice-client-name"
                      type="text"
                      required
                      value={formData.clientName}
                      onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">NIF / CIF (Identifiant fiscal)</label>
                    <input
                      id="input-invoice-client-nif"
                      type="text"
                      value={formData.clientNif}
                      onChange={(e) => setFormData({ ...formData, clientNif: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                    <input
                      id="input-invoice-client-email"
                      type="email"
                      value={formData.clientEmail}
                      onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Téléphone</label>
                    <input
                      id="input-invoice-client-phone"
                      type="tel"
                      value={formData.clientPhone}
                      onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Devise</label>
                    <select
                      id="select-invoice-currency"
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    >
                      <option value="HTG">HTG (Gourdes)</option>
                      <option value="USD">USD (Dollars)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Adresse Facturation</label>
                  <input
                    id="input-invoice-client-address"
                    type="text"
                    value={formData.clientAddress}
                    onChange={(e) => setFormData({ ...formData, clientAddress: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Dates & Terms */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Date d'Émission</label>
                  <input
                    id="input-invoice-issue-date"
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Date d'Échéance</label>
                  <input
                    id="input-invoice-due-date"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Conditions de Paiement</label>
                  <input
                    id="input-invoice-payment-terms"
                    type="text"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Items Lines */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider">Lignes d'Articles & Prestations</h4>
                  <button
                    type="button"
                    id="btn-add-invoice-line"
                    onClick={handleAddLine}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter une Ligne</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.items.map((line, idx) => (
                    <div key={line.id || idx} className="grid grid-cols-12 gap-2 p-3 bg-slate-950/60 border border-slate-800 rounded-xl items-center">
                      <div className="col-span-12 sm:col-span-4">
                        <label className="block text-[10px] text-slate-500 sm:hidden">Désignation</label>
                        <input
                          type="text"
                          required
                          placeholder="Désignation / Produit / Service"
                          value={line.description}
                          onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-[10px] text-slate-500 sm:hidden">Quantité</label>
                        <input
                          type="number"
                          min="1"
                          placeholder="Qté"
                          value={line.quantity}
                          onChange={(e) => handleLineChange(idx, "quantity", Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500 text-right"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-[10px] text-slate-500 sm:hidden">Prix Unitaire</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Prix U."
                          value={line.unitPrice}
                          onChange={(e) => handleLineChange(idx, "unitPrice", Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500 text-right"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-1">
                        <label className="block text-[10px] text-slate-500 sm:hidden">Remise %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="Rem %"
                          value={line.discountRate}
                          onChange={(e) => handleLineChange(idx, "discountRate", Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500 text-right"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-1">
                        <label className="block text-[10px] text-slate-500 sm:hidden">TVA %</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          placeholder="TVA %"
                          value={line.taxRate}
                          onChange={(e) => handleLineChange(idx, "taxRate", Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500 text-right"
                        />
                      </div>

                      <div className="col-span-6 sm:col-span-1 text-right font-mono font-bold text-xs text-sky-400">
                        {line.total.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                      </div>

                      <div className="col-span-2 sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
                          title="Supprimer la ligne"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals Summary */}
                <div className="flex justify-end pt-4">
                  <div className="w-full sm:w-72 bg-slate-950 p-4 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Sous-Total HT :</span>
                      <span className="font-mono text-white">{totals.subtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                    </div>
                    {totals.totalDiscount > 0 && (
                      <div className="flex justify-between text-rose-400">
                        <span>Remise Globale :</span>
                        <span className="font-mono">-{totals.totalDiscount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-400">
                      <span>TVA (Taxes) :</span>
                      <span className="font-mono text-white">+{totals.taxAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                    </div>
                    <div className="flex justify-between text-base font-extrabold text-sky-400 pt-2 border-t border-slate-800">
                      <span>Total TTC :</span>
                      <span className="font-mono">{totals.totalAmount.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {formData.currency}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes & Coordonnées de Paiement</label>
                <textarea
                  id="textarea-invoice-notes"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  id="btn-cancel-create-invoice"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  id="btn-submit-create-invoice"
                  className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Enregistrer la Facture</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document PDF / Print Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          isOpen={Boolean(previewDoc)}
          document={previewDoc}
          type="FACTURE"
          template={template}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
};
