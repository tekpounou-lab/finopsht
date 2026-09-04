import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../../lib/firebase";
import { InvoiceTemplate, DEFAULT_INVOICE_TEMPLATE_HTML } from "../../types/crm";

export const InvoiceTemplateRepository = {
  /**
   * Returns a standard fallback default template object
   */
  getDefaultTemplate(businessId: string, companyName?: string): InvoiceTemplate {
    return {
      id: "default",
      businessId,
      templateName: "Modèle Standard FINOPS ERP",
      contentHtml: DEFAULT_INVOICE_TEMPLATE_HTML,
      htmlContent: DEFAULT_INVOICE_TEMPLATE_HTML,
      primaryColor: "#0ea5e9",
      footerText: "Merci pour votre confiance. Paiement exigible selon les termes stipulés.",
      companyName: companyName || "FINOPS Entreprise S.A.",
      companyAddress: "12, Rue des Affaires, Port-au-Prince, Haïti",
      companyPhone: "+509 3000-0000",
      companyEmail: "facturation@finops-erp.ht",
      companyNif: "000-111-222-3",
      bankDetails: "Banque: Sogebank / Compte: 100-293-8472",
      legalMentions: "Facture régie par la législation fiscale en vigueur. Retard de paiement sujet à pénalités.",
      isDefault: true,
      updatedAt: new Date().toISOString()
    };
  },

  /**
   * Retrieves the active or default invoice template for a business
   */
  async getTemplate(businessId: string): Promise<InvoiceTemplate> {
    const path = `businesses/${businessId}/settings/invoice_template`;
    try {
      const docRef = doc(db, "businesses", businessId, "settings", "invoice_template");
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as InvoiceTemplate;
        return {
          ...this.getDefaultTemplate(businessId),
          ...data
        };
      }
    } catch (error) {
      console.warn("[InvoiceTemplateRepository] Could not fetch custom template, returning default:", error);
    }

    // Default template fallback
    return this.getDefaultTemplate(businessId);
  },

  /**
   * Alias for getTemplate
   */
  async getActiveTemplate(businessId: string): Promise<InvoiceTemplate> {
    return this.getTemplate(businessId);
  },

  /**
   * Saves or updates the invoice template for a business
   */
  async saveTemplate(template: InvoiceTemplate): Promise<void> {
    const path = `businesses/${template.businessId}/settings/invoice_template`;
    try {
      const docRef = doc(db, "businesses", template.businessId, "settings", "invoice_template");
      await setDoc(docRef, {
        ...template,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  /**
   * Resets template to system default for a business
   */
  async resetToDefault(businessId: string, companyName?: string): Promise<InvoiceTemplate> {
    const defaultTemplate: InvoiceTemplate = {
      id: "default",
      businessId,
      templateName: "Modèle Standard FINOPS ERP",
      contentHtml: DEFAULT_INVOICE_TEMPLATE_HTML,
      primaryColor: "#0ea5e9",
      footerText: "Merci pour votre confiance. Document généré par FINOPS ERP.",
      companyHeader: companyName ? { companyName } : undefined,
      isDefault: true,
      updatedAt: new Date().toISOString()
    };
    await this.saveTemplate(defaultTemplate);
    return defaultTemplate;
  }
};
