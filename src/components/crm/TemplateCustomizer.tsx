import React, { useState, useEffect, useMemo } from "react";
import { 
  Palette, 
  Save, 
  Eye, 
  RotateCcw, 
  Building2, 
  Code, 
  CheckCircle2, 
  Sparkles,
  Layers,
  HelpCircle,
  Zap
} from "lucide-react";
import { InvoiceTemplate, Proforma, Invoice, DEFAULT_INVOICE_TEMPLATE_HTML } from "../../types/crm";
import { InvoiceTemplateRepository } from "../../repositories/crm/InvoiceTemplateRepository";
import { PDFGeneratorService } from "../../services/crm/PDFGeneratorService";
import { toast } from "sonner";

interface TemplateCustomizerProps {
  businessId: string;
  template: InvoiceTemplate;
  onTemplateSaved?: (updated: InvoiceTemplate) => void;
  currentRole: string;
}

const COLOR_PRESETS = [
  { name: "Bleu Océan", value: "#0284c7" },
  { name: "Indigo Entreprise", value: "#4f46e5" },
  { name: "Émeraude Finance", value: "#059669" },
  { name: "Cyan Moderne", value: "#0891b2" },
  { name: "Ardoise Sombre", value: "#334155" },
  { name: "Violet Royal", value: "#7c3aed" }
];

export const TemplateCustomizer: React.FC<TemplateCustomizerProps> = ({
  businessId,
  template,
  onTemplateSaved,
  currentRole
}) => {
  const [formData, setFormData] = useState<InvoiceTemplate>(() => ({
    ...template,
    htmlContent: template.htmlContent || template.contentHtml || DEFAULT_INVOICE_TEMPLATE_HTML,
    contentHtml: template.contentHtml || template.htmlContent || DEFAULT_INVOICE_TEMPLATE_HTML,
    companyName: template.companyName || template.companyHeader?.companyName || "FINOPS ERP Enterprise",
    companyAddress: template.companyAddress || template.companyHeader?.address || "14, Rue des Affaires, Port-au-Prince",
    companyNif: template.companyNif || template.companyHeader?.taxId || "000-111-222-3",
    companyPhone: template.companyPhone || template.companyHeader?.phone || "+509 3000-0000",
    companyEmail: template.companyEmail || template.companyHeader?.email || "facturation@finops-erp.ht"
  }));

  const [activeTab, setActiveTab] = useState<"SETTINGS" | "HTML_CODE">("SETTINGS");
  const [isSaving, setIsSaving] = useState(false);

  // Sync formData when template prop changes
  useEffect(() => {
    if (template) {
      setFormData(prev => ({
        ...prev,
        ...template,
        htmlContent: template.htmlContent || template.contentHtml || prev.htmlContent || DEFAULT_INVOICE_TEMPLATE_HTML,
        contentHtml: template.contentHtml || template.htmlContent || prev.contentHtml || DEFAULT_INVOICE_TEMPLATE_HTML,
        companyName: template.companyName || template.companyHeader?.companyName || prev.companyName,
        companyAddress: template.companyAddress || template.companyHeader?.address || prev.companyAddress,
        companyNif: template.companyNif || template.companyHeader?.taxId || prev.companyNif,
        companyPhone: template.companyPhone || template.companyHeader?.phone || prev.companyPhone,
        companyEmail: template.companyEmail || template.companyHeader?.email || prev.companyEmail,
      }));
    }
  }, [template]);

  const canManage = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentRole);

  const updateField = (field: keyof InvoiceTemplate, value: any) => {
    setFormData(prev => {
      const next: InvoiceTemplate = { ...prev, [field]: value };
      if (field === "htmlContent") {
        next.contentHtml = value;
      } else if (field === "contentHtml") {
        next.htmlContent = value;
      }

      // Sync companyHeader object to maintain consistency
      next.companyHeader = {
        companyName: field === "companyName" ? value : (next.companyName || prev.companyHeader?.companyName || ""),
        address: field === "companyAddress" ? value : (next.companyAddress || prev.companyHeader?.address || ""),
        taxId: field === "companyNif" ? value : (next.companyNif || prev.companyHeader?.taxId || ""),
        phone: field === "companyPhone" ? value : (next.companyPhone || prev.companyHeader?.phone || ""),
        email: field === "companyEmail" ? value : (next.companyEmail || prev.companyHeader?.email || ""),
      };

      return next;
    });
  };

  // Mock Document for Live Preview
  const sampleDoc: Proforma = useMemo(() => ({
    id: "sample_1",
    businessId,
    proformaNumber: "DEV-2026-0042",
    clientName: "Entreprise Commerciale Caraïbes S.A.",
    clientEmail: "direction@caraibes-sa.ht",
    clientPhone: "+509 3700-1122",
    clientAddress: "14, Rue Pan Américaine, Pétion-Ville",
    clientNif: "001-928-374-5",
    issueDate: new Date().toISOString().split("T")[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    currency: "HTG",
    items: [
      {
        id: "l1",
        description: "Abonnement ERP Entreprise & Support Dédié (Annuel)",
        quantity: 1,
        unitPrice: 150000,
        discountRate: 5,
        discountAmount: 7500,
        subtotal: 142500,
        taxRate: 10,
        taxAmount: 14250,
        total: 156750
      },
      {
        id: "l2",
        description: "Formation Utilisateurs & Paramétrage Grand Livre (2 jours)",
        quantity: 2,
        unitPrice: 25000,
        discountRate: 0,
        discountAmount: 0,
        subtotal: 50000,
        taxRate: 10,
        taxAmount: 5000,
        total: 55000
      }
    ],
    subtotal: 192500,
    totalDiscount: 7500,
    taxAmount: 19250,
    totalAmount: 211750,
    status: "ACCEPTED",
    paymentTerms: "Paiement à 30 jours net",
    notes: "Exemple de devis proforma généré avec votre modèle en direct.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }), [businessId]);

  // Instantaneous live preview computation
  const renderedPreviewHtml = useMemo(() => {
    return PDFGeneratorService.renderTemplateHtml(formData, sampleDoc, "PROFORMA");
  }, [formData, sampleDoc]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updated: InvoiceTemplate = {
        ...formData,
        contentHtml: formData.htmlContent || formData.contentHtml || DEFAULT_INVOICE_TEMPLATE_HTML,
        htmlContent: formData.htmlContent || formData.contentHtml || DEFAULT_INVOICE_TEMPLATE_HTML,
        updatedAt: new Date().toISOString()
      };
      await InvoiceTemplateRepository.saveTemplate(updated);
      toast.success("Modèle de document enregistré avec succès !");
      if (onTemplateSaved) onTemplateSaved(updated);
    } catch (err: any) {
      console.error("[TemplateCustomizer] Error saving template:", err);
      toast.error("Erreur lors de l'enregistrement du modèle.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!window.confirm("Rétablir les paramètres par défaut du modèle standard ?")) return;
    const def = InvoiceTemplateRepository.getDefaultTemplate(businessId);
    setFormData(def);
    toast.info("Modèle réinitialisé aux valeurs par défaut.");
  };

  return (
    <div id="section-template-customizer" className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Palette className="w-5 h-5 text-sky-400" />
            <span>Personnalisation des Devis & Factures</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configurez l'en-tête de votre entreprise, vos couleurs de marque, mentions légales et coordonnées bancaires.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <button
              id="btn-reset-template"
              onClick={handleResetToDefault}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>

            <button
              id="btn-save-template"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? "Sauvegarde..." : "Sauvegarder le Modèle"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Editor & Live Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Settings / Code Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-2 bg-slate-950 p-1 border border-slate-800 rounded-lg">
            <button
              id="tab-template-settings"
              onClick={() => setActiveTab("SETTINGS")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                activeTab === "SETTINGS" ? "bg-sky-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Paramètres de Marque</span>
            </button>
            <button
              id="tab-template-html"
              onClick={() => setActiveTab("HTML_CODE")}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                activeTab === "HTML_CODE" ? "bg-sky-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Code HTML Avancé</span>
            </button>
          </div>

          {activeTab === "SETTINGS" ? (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nom du modèle</label>
                <input
                  id="input-template-name"
                  type="text"
                  value={formData.templateName || ""}
                  onChange={(e) => updateField("templateName", e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Color Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Couleur Principale</label>
                <div className="flex items-center gap-2 mb-2">
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => updateField("primaryColor", preset.value)}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        formData.primaryColor === preset.value ? "border-white scale-110" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.name}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.primaryColor || "#0ea5e9"}
                    onChange={(e) => updateField("primaryColor", e.target.value)}
                    className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer ml-2"
                  />
                </div>
              </div>

              {/* Company Info Fields */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <h4 className="text-xs font-bold text-sky-400">Coordonnées de l'Entreprise Émettrice</h4>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Raison Sociale</label>
                  <input
                    id="input-company-name"
                    type="text"
                    value={formData.companyName || ""}
                    onChange={(e) => updateField("companyName", e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Email</label>
                    <input
                      id="input-company-email"
                      type="email"
                      value={formData.companyEmail || ""}
                      onChange={(e) => updateField("companyEmail", e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Téléphone</label>
                    <input
                      id="input-company-phone"
                      type="tel"
                      value={formData.companyPhone || ""}
                      onChange={(e) => updateField("companyPhone", e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Adresse Siège Social</label>
                  <input
                    id="input-company-address"
                    type="text"
                    value={formData.companyAddress || ""}
                    onChange={(e) => updateField("companyAddress", e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">NIF / Matricule Fiscal</label>
                  <input
                    id="input-company-nif"
                    type="text"
                    value={formData.companyNif || ""}
                    onChange={(e) => updateField("companyNif", e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Bank Details & Legal */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <h4 className="text-xs font-bold text-sky-400">Coordonnées Bancaires & Bas de Page</h4>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Coordonnées Bancaires (RIB / Compte)</label>
                  <textarea
                    id="textarea-bank-details"
                    rows={2}
                    value={formData.bankDetails || ""}
                    onChange={(e) => updateField("bankDetails", e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                    placeholder="Banque: Sogebank / Compte: 102-993-882"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Texte de Pied de Page</label>
                  <input
                    id="input-footer-text"
                    type="text"
                    value={formData.footerText || ""}
                    onChange={(e) => updateField("footerText", e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Mentions Légales</label>
                  <input
                    id="input-legal-mentions"
                    type="text"
                    value={formData.legalMentions || ""}
                    onChange={(e) => updateField("legalMentions", e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-sky-400">Modèle HTML / Variables</span>
                <span className="text-[10px]">Utilisez les balises {'{{VARIABLE}}'} ou {'{variable}'}</span>
              </div>
              <textarea
                id="textarea-html-template"
                rows={18}
                value={formData.htmlContent || formData.contentHtml || ""}
                onChange={(e) => updateField("htmlContent", e.target.value)}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 leading-relaxed"
              />
              <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <p className="font-bold text-slate-300">Variables Disponibles :</p>
                <div className="flex flex-wrap gap-1 font-mono text-[10px] text-sky-400">
                  <span>{`{{DOC_TYPE}}`}</span>, <span>{`{{DOC_NUMBER}}`}</span>, <span>{`{{COMPANY_NAME}}`}</span>, <span>{`{{CLIENT_NAME}}`}</span>, <span>{`{{ISSUE_DATE}}`}</span>, <span>{`{{TOTAL_AMOUNT}}`}</span>, <span>{`{{ITEMS_ROWS}}`}</span>, <span>{`{{BANK_DETAILS}}`}</span>, <span>{`{{LEGAL_MENTIONS}}`}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live Preview Column (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Eye className="w-4 h-4 text-sky-400" />
              <span>Aperçu en Direct (Données d'Exemple)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-[11px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>En direct • Instantané</span>
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-6 overflow-y-auto max-h-[80vh] flex justify-center shadow-inner">
            <div 
              id="live-rendered-preview"
              className="w-full max-w-2xl bg-white text-slate-900 rounded-lg shadow-2xl p-6 sm:p-8 transition-all duration-150"
              dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

