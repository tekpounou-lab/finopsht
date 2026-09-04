import { jsPDF } from "jspdf";
import { EDMSDocumentType } from "../../types";
import { DocumentTemplateData, DocumentTemplateRenderer } from "./types";

import { renderEmploymentContract } from "./EmploymentContract.template";
import { renderPayslip } from "./Payslip.template";
import { renderEmploymentCertificate } from "./EmploymentCertificate.template";
import { renderSalaryCertificate } from "./SalaryCertificate.template";
import { renderLeaveApproval } from "./LeaveApproval.template";
import { renderVacationApproval } from "./VacationApproval.template";
import { renderPromotionLetter } from "./PromotionLetter.template";
import { renderTransferLetter } from "./TransferLetter.template";
import { renderTerminationLetter } from "./TerminationLetter.template";
import { renderTrainingCertificate } from "./TrainingCertificate.template";
import { renderDisciplinaryLetter } from "./DisciplinaryLetter.template";
import { renderPolicyAcceptance } from "./PolicyAcceptance.template";
import { renderGenericReport } from "./GenericReport.template";

export * from "./types";
export * from "./BaseDocumentHeaderFooter";

/**
 * Registry mapping each EDMSDocumentType to its dedicated template renderer.
 */
const TEMPLATE_REGISTRY: Record<EDMSDocumentType, DocumentTemplateRenderer> = {
  EMPLOYMENT_CONTRACT: renderEmploymentContract,
  PAYSLIP: renderPayslip,
  EMPLOYMENT_CERTIFICATE: renderEmploymentCertificate,
  SERVICE_RECORD: renderEmploymentCertificate,
  SALARY_CERTIFICATE: renderSalaryCertificate,
  LEAVE_APPROVAL: renderLeaveApproval,
  VACATION_APPROVAL: renderVacationApproval,
  PROMOTION_LETTER: renderPromotionLetter,
  TRANSFER_LETTER: renderTransferLetter,
  TERMINATION_LETTER: renderTerminationLetter,
  TRAINING_CERTIFICATE: renderTrainingCertificate,
  DISCIPLINARY_LETTER: renderDisciplinaryLetter,
  POLICY_ACCEPTANCE: renderPolicyAcceptance,
  TAX_DOCUMENT: renderGenericReport,
  CNSS_DOCUMENT: renderGenericReport,
  PERFORMANCE_REVIEW: renderGenericReport,
  CUSTOM_DOCUMENT: renderGenericReport,
  SYSTEM_REPORT: renderGenericReport
};

export const DocumentTemplateLibrary = {
  /**
   * Renders a document onto a jsPDF instance using its dedicated template.
   */
  renderDocument(pdf: jsPDF, data: DocumentTemplateData): void {
    const renderer = TEMPLATE_REGISTRY[data.meta.documentType] || renderGenericReport;
    renderer(pdf, data);
  }
};
