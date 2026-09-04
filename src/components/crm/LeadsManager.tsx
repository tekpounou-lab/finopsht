import React, { useState } from "react";
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  UserCheck, 
  ArrowRight, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Star, 
  Edit, 
  Trash2, 
  TrendingUp,
  Briefcase,
  Sliders,
  DollarSign
} from "lucide-react";
import { Lead, LeadStatus, LeadSource, Prospect } from "../../types/crm";
import { LeadRepository } from "../../repositories/crm/LeadRepository";
import { toast } from "sonner";

interface LeadsManagerProps {
  businessId: string;
  leads: Lead[];
  currentRole: string;
  currentUser: any;
  onRefresh?: () => void;
  onSelectLeadForQuote?: (lead: Lead) => void;
}

export const LeadsManager: React.FC<LeadsManagerProps> = ({
  businessId,
  leads,
  currentRole,
  currentUser,
  onSelectLeadForQuote
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Lead>>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    sector: "",
    source: "DIRECT",
    status: "LEAD",
    leadScore: 50,
    estimatedValue: 0,
    currency: "HTG",
    notes: ""
  });

  const canManage = ["SUPER_ADMIN", "OWNER", "ADMIN", "MANAGER"].includes(currentRole);

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (lead.sector && lead.sector.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || lead.status === statusFilter;
    const matchesSource = sourceFilter === "ALL" || lead.source === sourceFilter;

    return matchesSearch && matchesStatus && matchesSource;
  });

  const countByStatus = {
    all: leads.length,
    leads: leads.filter((l) => l.status === "LEAD").length,
    prospects: leads.filter((l) => l.status === "PROSPECT").length,
    clients: leads.filter((l) => l.status === "CLIENT").length
  };

  const handleOpenCreateModal = () => {
    setEditingLead(null);
    setFormData({
      companyName: "",
      contactName: "",
      email: "",
      phone: "",
      address: "",
      sector: "",
      source: "DIRECT",
      status: "LEAD",
      leadScore: 50,
      estimatedValue: 0,
      currency: "HTG",
      notes: ""
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (lead: Lead) => {
    setEditingLead(lead);
    setFormData({ ...lead });
    setIsModalOpen(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.contactName) {
      toast.error("Veuillez renseigner le nom de l'entreprise et le contact.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const leadToSave: Lead = {
        id: editingLead ? editingLead.id : `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        businessId,
        companyName: formData.companyName || "",
        contactName: formData.contactName || "",
        email: formData.email || "",
        phone: formData.phone || "",
        address: formData.address || "",
        sector: formData.sector || "",
        source: (formData.source as LeadSource) || "DIRECT",
        status: (formData.status as LeadStatus) || "LEAD",
        leadScore: Number(formData.leadScore) || 50,
        estimatedValue: Number(formData.estimatedValue) || 0,
        currency: (formData.currency as "HTG" | "USD") || "HTG",
        notes: formData.notes || "",
        assignedTo: formData.assignedTo || currentUser?.id,
        createdAt: editingLead ? editingLead.createdAt : now,
        updatedAt: now
      };

      await LeadRepository.saveLead(leadToSave);
      toast.success(editingLead ? "Contact CRM mis à jour !" : "Nouveau lead créé avec succès !");
      setIsModalOpen(false);
    } catch (err: any) {
      console.error("[LeadsManager] Error saving lead:", err);
      toast.error("Erreur lors de l'enregistrement du lead.");
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      await LeadRepository.convertLeadStatus(businessId, leadId, newStatus);
      toast.success(`Statut mis à jour : ${newStatus}`);
    } catch (err: any) {
      toast.error("Erreur lors de la mise à jour du statut.");
    }
  };

  const handleScoreChange = async (leadId: string, newScore: number) => {
    try {
      await LeadRepository.qualifyLead(businessId, leadId, newScore);
      toast.success(`Score de qualification ajusté à ${newScore}%`);
    } catch (err: any) {
      toast.error("Erreur lors de l'ajustement du score.");
    }
  };

  const handleDelete = async (leadId: string, name: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le contact "${name}" ?`)) return;
    try {
      await LeadRepository.deleteLead(businessId, leadId);
      toast.success("Contact supprimé.");
    } catch (err: any) {
      toast.error("Erreur lors de la suppression.");
    }
  };

  const getStatusBadge = (status: LeadStatus) => {
    switch (status) {
      case "LEAD":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Lead Brut</span>;
      case "PROSPECT":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">Prospect Qualifié</span>;
      case "CLIENT":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Client Actif</span>;
      case "LOST":
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Perdu</span>;
      default:
        return null;
    }
  };

  return (
    <div id="section-leads-manager" className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Contacts CRM</p>
            <h3 className="text-2xl font-black text-white mt-1">{countByStatus.all}</h3>
          </div>
          <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Leads Bruts</p>
            <h3 className="text-2xl font-black text-amber-400 mt-1">{countByStatus.leads}</h3>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Prospects Qualifiés</p>
            <h3 className="text-2xl font-black text-sky-400 mt-1">{countByStatus.prospects}</h3>
          </div>
          <div className="p-3 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Clients Convertis</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">{countByStatus.clients}</h3>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <UserCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-4 border border-slate-800/80 rounded-xl">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-lg">
            {(["ALL", "LEAD", "PROSPECT", "CLIENT"] as const).map((st) => (
              <button
                key={st}
                id={`filter-status-${st.toLowerCase()}`}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  statusFilter === st 
                    ? "bg-sky-600 text-white shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {st === "ALL" ? "Tous" : st === "LEAD" ? "Leads" : st === "PROSPECT" ? "Prospects" : "Clients"}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              id="input-search-leads"
              type="text"
              placeholder="Rechercher par société, nom, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {canManage && (
          <button
            id="btn-add-lead"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Contact / Lead</span>
          </button>
        )}
      </div>

      {/* Leads Table / Grid */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="table-leads" className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Entreprise & Contact</th>
                <th className="py-3 px-4">Coordonnées</th>
                <th className="py-3 px-4">Secteur / Source</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Lead Score</th>
                <th className="py-3 px-4">Valeur Est.</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Aucun contact ne correspond à vos critères de recherche.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-800/30 transition group">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-sky-400" />
                        <span>{lead.companyName}</span>
                      </div>
                      <div className="text-slate-400 mt-0.5">{lead.contactName}</div>
                    </td>

                    <td className="py-3 px-4">
                      {lead.email && (
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <span>{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1.5 text-slate-400 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span>{lead.phone}</span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-slate-200">{lead.sector || "Non spécifié"}</div>
                      <div className="text-slate-500 text-[10px] uppercase font-mono">{lead.source}</div>
                    </td>

                    <td className="py-3 px-4">
                      {getStatusBadge(lead.status)}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-full ${
                              lead.leadScore >= 75 ? "bg-emerald-500" : lead.leadScore >= 40 ? "bg-sky-500" : "bg-amber-500"
                            }`} 
                            style={{ width: `${lead.leadScore}%` }}
                          />
                        </div>
                        <span className="font-mono text-slate-300 text-[11px] font-bold">{lead.leadScore}%</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                      {lead.estimatedValue ? `${lead.estimatedValue.toLocaleString("fr-FR")} ${lead.currency}` : "-"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onSelectLeadForQuote && (
                          <button
                            id={`btn-quote-lead-${lead.id}`}
                            onClick={() => onSelectLeadForQuote(lead)}
                            title="Créer un devis pour ce contact"
                            className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 transition"
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManage && lead.status === "LEAD" && (
                          <button
                            id={`btn-convert-prospect-${lead.id}`}
                            onClick={() => handleStatusChange(lead.id, "PROSPECT")}
                            title="Convertir en Prospect"
                            className="px-2 py-1 rounded bg-sky-950 text-sky-400 border border-sky-800/80 hover:bg-sky-900 text-[11px] font-medium transition"
                          >
                            &rarr; Prospect
                          </button>
                        )}

                        {canManage && lead.status === "PROSPECT" && (
                          <button
                            id={`btn-convert-client-${lead.id}`}
                            onClick={() => handleStatusChange(lead.id, "CLIENT")}
                            title="Convertir en Client Définitif"
                            className="px-2 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/80 hover:bg-emerald-900 text-[11px] font-medium transition"
                          >
                            &rarr; Client
                          </button>
                        )}

                        {canManage && (
                          <button
                            id={`btn-edit-lead-${lead.id}`}
                            onClick={() => handleOpenEditModal(lead)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="Modifier"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManage && (
                          <button
                            id={`btn-delete-lead-${lead.id}`}
                            onClick={() => handleDelete(lead.id, lead.companyName)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Create / Edit Lead */}
      {isModalOpen && (
        <div id="modal-lead-form-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div id="modal-lead-form-container" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-400" />
                <span>{editingLead ? "Modifier le contact CRM" : "Nouveau Lead / Prospect"}</span>
              </h3>
              <button
                id="btn-modal-close-lead"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveLead} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nom de l'entreprise *</label>
                  <input
                    id="input-lead-company"
                    type="text"
                    required
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="Ex: Société Générale d'Haïti"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nom du contact principal *</label>
                  <input
                    id="input-lead-contact"
                    type="text"
                    required
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="Ex: Jean-Baptiste Pierre"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                  <input
                    id="input-lead-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="contact@entreprise.ht"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Téléphone</label>
                  <input
                    id="input-lead-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="+509 3000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Secteur d'activité</label>
                  <input
                    id="input-lead-sector"
                    type="text"
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="Ex: Commerce de gros, Industrie, IT"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Source du contact</label>
                  <select
                    id="select-lead-source"
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value as LeadSource })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="DIRECT">Prospection directe</option>
                    <option value="WEBSITE">Site Web / Formulaire</option>
                    <option value="REFERRAL">Recommandation / Partenaire</option>
                    <option value="COLD_CALL">Appel téléphonique</option>
                    <option value="CAMPAIGN">Campagne Marketing</option>
                    <option value="EVENT">Salon / Événement</option>
                    <option value="OTHER">Autre</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Statut initial</label>
                  <select
                    id="select-lead-status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="LEAD">Lead Brut</option>
                    <option value="PROSPECT">Prospect Qualifié</option>
                    <option value="CLIENT">Client Actif</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Valeur Estimée</label>
                  <input
                    id="input-lead-value"
                    type="number"
                    value={formData.estimatedValue}
                    onChange={(e) => setFormData({ ...formData, estimatedValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    placeholder="50000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Devise</label>
                  <select
                    id="select-lead-currency"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value as "HTG" | "USD" })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="HTG">HTG (Gourdes)</option>
                    <option value="USD">USD (Dollars)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-300">Score de Qualification : {formData.leadScore}%</label>
                </div>
                <input
                  id="input-lead-score-range"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={formData.leadScore}
                  onChange={(e) => setFormData({ ...formData, leadScore: Number(e.target.value) })}
                  className="w-full accent-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Adresse</label>
                <input
                  id="input-lead-address"
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  placeholder="Rue, Ville, Pays"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes & Historique</label>
                <textarea
                  id="textarea-lead-notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  placeholder="Besoins exprimés, historique des échanges..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  id="btn-cancel-lead"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  id="btn-save-lead-submit"
                  className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm"
                >
                  {editingLead ? "Sauvegarder" : "Créer le contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
