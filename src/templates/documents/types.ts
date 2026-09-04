import { jsPDF } from "jspdf";
import { Employee, EDMSDocumentType } from "../../types";

export interface DocumentTemplateBusiness {
  id?: string;
  name: string;
  nif: string;
  domain: string;
  address?: string;
  phone?: string;
  logo_url?: string;
  primaryColor?: string;
}

export interface DocumentTemplateMeta {
  docId: string;
  docTitle: string;
  documentType: EDMSDocumentType;
  reference: string;
  version: number;
  generatedAt: string;
  generatedBy: string;
  signature: string;
  checksum: string;
}

export interface DocumentTemplateData {
  employee: Employee;
  business: DocumentTemplateBusiness;
  meta: DocumentTemplateMeta;
  qrDataUrl: string;
  additionalData?: Record<string, any>;
}

export type DocumentTemplateRenderer = (pdf: jsPDF, data: DocumentTemplateData) => void;
