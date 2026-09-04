import React, { useState, useEffect } from "react";
import { 
  Briefcase, 
  Users, 
  FileSpreadsheet, 
  FileText, 
  Palette, 
  TrendingUp, 
  DollarSign, 
  RefreshCw,
  Building2
} from "lucide-react";
import { Lead, Proforma, Invoice, InvoiceTemplate } from "../../types/crm";
import { LeadRepository } from "../../repositories/crm/LeadRepository";
import { ProformaRepository } from "../../repositories/crm/ProformaRepository";
import { InvoiceRepository } from "../../repositories/crm/InvoiceRepository";
import { InvoiceTemplateRepository } from "../../repositories/crm/InvoiceTemplateRepository";
import { LeadsManager } from "./LeadsManager";
import { ProformaManager } from "./ProformaManager";
import { InvoiceManager } from "./InvoiceManager";
import { TemplateCustomizer } from "./TemplateCustomizer";
import { toast } from "sonner";

interface CrmCenterProps {
  businessId: string;
  currentRole: string;
  currentUser: any;
  currentBusiness?: any;
  initialSubTab?: "LEADS" | "PROFORMAS" | "INVOICES" | "TEMPLATES";
  onAddTransaction?: (tx: any) => void;
  onAddForensicLog?: (log: any) => void;
  onAddEvent?: (event: any) => void;
}

export const CrmCenter: React.FC<CrmCenterProps> = ({
  businessId,
  currentRole,
  currentUser,
  currentBusiness,
  initialSubTab,
  onAddTransaction,
  onAddForensicLog,
  onAddEvent
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"LEADS" | "PROFORMAS" | "INVOICES" | "TEMPLATES">(initialSubTab || "LEADS");

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [template, setTemplate] = useState<InvoiceTemplate>(() => 
    InvoiceTemplateRepository.getDefaultTemplate(businessId)
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Subscribe to real-time collections for this business
  useEffect(() => {
    if (!businessId) return;
    setIsLoading(true);

    const unsubLeads = LeadRepository.subscribeToLeads(businessId, (data) => {
      setLeads(data);
      setIsLoading(false);
    });

    const unsubProformas = ProformaRepository.subscribeToProformas(businessId, (data) => {
      setProformas(data);
    });

    const unsubInvoices = InvoiceRepository.subscribeToInvoices(businessId, (data) => {
      setInvoices(data);
    });

    // Load active template
    InvoiceTemplateRepository.getActiveTemplate(businessId).then((tmpl) => {
      if (tmpl) {
        setTemplate(tmpl);
      } else if (currentBusiness) {
        setTemplate(prev => ({
          ...prev,
          companyName: currentBusiness.name || prev.companyName,
          companyAddress: currentBusiness.address || prev.companyAddress,
          companyPhone: currentBusiness.phone || prev.companyPhone,
          companyEmail: currentBusiness.email || prev.companyEmail,
          companyNif: currentBusiness.nif || prev.companyNif
        }));
      }
    });

    return () => {
      unsubLeads();
      unsubProformas();
      unsubInvoices();
    };
  }, [businessId, currentBusiness]);

  const handleSelectLeadForQuote = (lead: Lead) => {
    setActiveSubTab("PROFORMAS");
  };

  const handleInvoiceCreated = () => {
    setActiveSubTab("INVOICES");
  };

  return (
    <div id="view-crm-center" className="flex flex-col flex-1 min-h-0 w-full p-4 sm:p-6 space-y-6 overflow-y-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-600/10 text-sky-400 border border-sky-500/30 shadow-inner">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <span>CRM & Facturation</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20">
                Cycle de Vente ERP
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestion de la prospection, conversion en clients, devis proforma, émission de factures et écritures comptables.
            </p>
          </div>
        </div>

        {/* Global Sub-tabs */}
        <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto">
          <button
            id="tab-sub-leads"
            onClick={() => setActiveSubTab("LEADS")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeSubTab === "LEADS" 
                ? "bg-sky-600 text-white shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Contacts & Leads</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {leads.length}
            </span>
          </button>

          <button
            id="tab-sub-proformas"
            onClick={() => setActiveSubTab("PROFORMAS")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeSubTab === "PROFORMAS" 
                ? "bg-sky-600 text-white shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Devis Proforma</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {proformas.length}
            </span>
          </button>

          <button
            id="tab-sub-invoices"
            onClick={() => setActiveSubTab("INVOICES")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeSubTab === "INVOICES" 
                ? "bg-sky-600 text-white shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Factures & Règlements</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300">
              {invoices.length}
            </span>
          </button>

          <button
            id="tab-sub-templates"
            onClick={() => setActiveSubTab("TEMPLATES")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition whitespace-nowrap ${
              activeSubTab === "TEMPLATES" 
                ? "bg-sky-600 text-white shadow-sm" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Modèles de Documents</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0">
        {activeSubTab === "LEADS" && (
          <LeadsManager
            businessId={businessId}
            leads={leads}
            currentRole={currentRole}
            currentUser={currentUser}
            onSelectLeadForQuote={handleSelectLeadForQuote}
          />
        )}

        {activeSubTab === "PROFORMAS" && (
          <ProformaManager
            businessId={businessId}
            proformas={proformas}
            leads={leads}
            template={template}
            currentRole={currentRole}
            currentUser={currentUser}
            onInvoiceCreated={handleInvoiceCreated}
          />
        )}

        {activeSubTab === "INVOICES" && (
          <InvoiceManager
            businessId={businessId}
            invoices={invoices}
            leads={leads}
            template={template}
            currentRole={currentRole}
            currentUser={currentUser}
            onAddTransaction={onAddTransaction}
          />
        )}

        {activeSubTab === "TEMPLATES" && (
          <TemplateCustomizer
            businessId={businessId}
            template={template}
            onTemplateSaved={(updated) => setTemplate(updated)}
            currentRole={currentRole}
          />
        )}
      </div>
    </div>
  );
};

export default CrmCenter;
