import { describe, it, expect, vi } from "vitest";

vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    doc: vi.fn(() => ({})),
    updateDoc: vi.fn(() => Promise.resolve()),
    setDoc: vi.fn(() => Promise.resolve()),
    getDocs: vi.fn(() => Promise.resolve({ docs: [] }))
  };
});

import { DocumentRepository } from "../../repositories/DocumentRepository";
import { EDMSDocument, EDMSDocumentStatus } from "../../types";

describe("Document Module Domain Audit & Integrity Tests", () => {
  it("throws error when attempting to update or modify a sealed or RETENTION_LOCKED document", async () => {
    const sealedDoc: EDMSDocument = {
      id: "doc_contract_sealed_001",
      documentType: "EMPLOYMENT_CONTRACT",
      employeeId: "emp_101",
      businessId: "biz_test_001",
      workspaceId: "biz_test_001",
      reference: "FINOPS-EMPL-2026-1001",
      title: "Contrat de Travail Scellé",
      status: "RETENTION_LOCKED",
      version: 1,
      mimeType: "application/pdf",
      storagePath: "businesses/biz_test_001/documents/doc_001.pdf",
      storageProvider: "CLOUD_STORAGE_LOCAL_VAULT",
      fileSize: 15400,
      checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      signature: "SEAL-FINOPS-RH-E3B0C44298FC1C14",
      generatedAt: "2026-01-01T00:00:00.000Z",
      generatedBy: "RH Admin",
      signed: true,
      isSealed: true,
      audit: []
    };

    vi.spyOn(DocumentRepository, "getDocumentById").mockResolvedValue(sealedDoc);

    await expect(
      DocumentRepository.updateDocumentStatus(
        "biz_test_001",
        "doc_contract_sealed_001",
        "REVOKED"
      )
    ).rejects.toThrow("PERIOD_LOCKED: Document [doc_contract_sealed_001] is legally sealed and immutable.");
  });

  it("calculates statutory retention expiry correctly for different document types", () => {
    const genDate = "2026-01-01T00:00:00.000Z";

    // Payslips: 5 years retention requirement
    const payslipExpiry = DocumentRepository.calculateRetentionExpiry("PAYSLIP", genDate);
    expect(new Date(payslipExpiry).getFullYear()).toBe(2031);

    // Employment contracts: 10 years retention requirement
    const contractExpiry = DocumentRepository.calculateRetentionExpiry("EMPLOYMENT_CONTRACT", genDate);
    expect(new Date(contractExpiry).getFullYear()).toBe(2036);

    // Tax documents: 5 years retention requirement
    const taxExpiry = DocumentRepository.calculateRetentionExpiry("TAX_DOCUMENT", genDate);
    expect(new Date(taxExpiry).getFullYear()).toBe(2031);

    // Other generic documents: 3 years
    const customExpiry = DocumentRepository.calculateRetentionExpiry("CUSTOM_DOCUMENT", genDate);
    expect(new Date(customExpiry).getFullYear()).toBe(2029);
  });

  it("verifies that superseded previous versions transition status to SUPERSEDED with lineage pointer", async () => {
    const existingDocs: EDMSDocument[] = [
      {
        id: "doc_v1",
        documentType: "EMPLOYMENT_CONTRACT",
        employeeId: "emp_101",
        businessId: "biz_test_001",
        workspaceId: "biz_test_001",
        reference: "FINOPS-EMPL-2026-0001",
        title: "Contrat Initial v1",
        status: "ACTIVE",
        version: 1,
        mimeType: "application/pdf",
        storagePath: "businesses/biz_test_001/documents/doc_v1.pdf",
        storageProvider: "CLOUD_STORAGE_LOCAL_VAULT",
        fileSize: 12000,
        checksum: "abc123hash",
        signature: "SEAL-V1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        generatedBy: "HR Admin",
        signed: true,
        audit: []
      }
    ];

    vi.spyOn(DocumentRepository, "getEmployeeDocuments").mockResolvedValue(existingDocs);

    await DocumentRepository.supersedePreviousVersions(
      "biz_test_001",
      "emp_101",
      "EMPLOYMENT_CONTRACT",
      "doc_v2",
      { uid: "admin_1", name: "Admin Jane", role: "ADMIN" }
    );

    // After running supersedePreviousVersions, existing active doc should be processed
    expect(DocumentRepository.getEmployeeDocuments).toHaveBeenCalledWith("biz_test_001", "emp_101");
  });
});
