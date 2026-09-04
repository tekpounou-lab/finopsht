import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileText, Download, Filter, Search, FileSignature, ShieldCheck, 
  Eye, RefreshCw, CheckCircle2, History, QrCode, Lock, FileSpreadsheet, 
  Sparkles, AlertCircle, X, Printer, ShieldAlert, BadgeCheck
} from "lucide-react";
import { Employee, EDMSDocument, EDMSDocumentType, PayrollRecord } from "../../../types";
import { DocumentRepository } from "../../../repositories/DocumentRepository";
import { DocumentGenerationService } from "../../../services/DocumentGenerationService";

interface MyDocumentsSectionProps {
  employee: Employee;
  employeeContracts?: any[];
  payrollRecords?: PayrollRecord[];
  deptName?: string;
  branchName?: string;
  tw?: any;
}

export const MyDocumentsSection: React.FC<MyDocumentsSectionProps> = ({
  employee,
  payrollRecords = [],
  deptName,
  branchName
}) => {
  const [documents, setDocuments] = useState<EDMSDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generatingType, setGeneratingType] = useState<EDMSDocumentType | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal State
  const [selectedDoc, setSelectedDoc] = useState<EDMSDocument | null>(null);
  const [activeTab, setActiveTab] = useState<"PREVIEW" | "DETAILS" | "VERSIONS" | "AUDIT" | "VERIFY">("PREVIEW");
  
  // Verification Tool State
  const [verifyQuery, setVerifyQuery] = useState("");
  const [verifyResult, setVerifyResult] = useState<EDMSDocument | null | "NOT_FOUND">(null);
  const [verifying, setVerifying] = useState(false);

  // Load employee documents from Firestore Repository
  const loadDocuments = async () => {
    setLoading(true);
    try {
      let docs = await DocumentRepository.getEmployeeDocuments(employee.business_id, employee.id);
      
      // Auto-bootstrap baseline contract & attestation if no documents exist for this employee
      if (docs.length === 0) {
        const actor = {
          uid: employee.id,
          name: employee.name,
          role: employee.role || "EMPLOYEE"
        };

        // Auto-generate Contract & Employment Certificate
        const resolvedDeptName = deptName || employee.department_name || (employee as any).departmentName;
        const resolvedBranchName = branchName || employee.branch_name || (employee as any).branchName;

        const contractDoc = await DocumentGenerationService.generateDocument({
          employee,
          documentType: "EMPLOYMENT_CONTRACT",
          actor,
          additionalData: {
            title: `Contrat de Travail ${employee.contractType?.toUpperCase() || "CDI"}`,
            salary: employee.baseSalary || 35000,
            departmentName: resolvedDeptName,
            branchName: resolvedBranchName
          }
        });

        const attestationDoc = await DocumentGenerationService.generateDocument({
          employee,
          documentType: "EMPLOYMENT_CERTIFICATE",
          actor,
          additionalData: {
            title: "Attestation Officielle d'Emploi et de Fonctions",
            departmentName: resolvedDeptName,
            branchName: resolvedBranchName
          }
        });

        docs = [attestationDoc, contractDoc];
      }

      setDocuments(docs);
    } catch (e) {
      console.error("[MyDocumentsSection] Error loading EDMS documents:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employee && employee.id) {
      loadDocuments();
    }
  }, [employee.id, employee.business_id]);

  // Handle Quick On-Demand Document Generation
  const handleGenerateDocument = async (docType: EDMSDocumentType, title?: string, additionalData?: any) => {
    setGeneratingType(docType);
    try {
      const actor = {
        uid: employee.id,
        name: employee.name,
        role: employee.role || "EMPLOYEE"
      };

      const newDoc = await DocumentGenerationService.generateDocument({
        employee,
        documentType: docType,
        actor,
        additionalData: {
          title,
          departmentName: deptName || employee.department_name || (employee as any).departmentName,
          branchName: branchName || employee.branch_name || (employee as any).branchName,
          ...additionalData
        }
      });

      // Reload list
      await loadDocuments();
      setSelectedDoc(newDoc);
      setActiveTab("PREVIEW");
    } catch (error) {
      console.error("[MyDocumentsSection] Generation failed:", error);
    } finally {
      setGeneratingType(null);
    }
  };

  // Handle Download Action
  const handleDownload = async (doc: EDMSDocument) => {
    // Audit download
    await DocumentRepository.addAuditEntry(doc.businessId, doc.id, {
      action: "DOWNLOADED",
      userId: employee.id,
      userName: employee.name,
      userRole: employee.role || "EMPLOYEE",
      timestamp: new Date().toISOString(),
      version: doc.version,
      details: "Téléchargement sécurisé depuis le coffre-fort numérique"
    });

    // Initiate file download
    if (doc.dataUrl) {
      const link = document.createElement("a");
      link.href = doc.dataUrl;
      link.download = `FINOPS_${doc.title.replace(/[^a-zA-Z0-9]/g, "_")}_v${doc.version}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // Re-generate on the fly if cached data URL expired
      await handleGenerateDocument(doc.documentType, doc.title);
    }
  };

  // Handle Verification Search
  const handleVerifySearch = async () => {
    if (!verifyQuery.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const found = await DocumentRepository.getDocumentByChecksumOrRef(verifyQuery.trim());
      setVerifyResult(found || "NOT_FOUND");
    } catch (e) {
      setVerifyResult("NOT_FOUND");
    } finally {
      setVerifying(false);
    }
  };

  // Filter list
  const filteredDocs = documents.filter(doc => {
    if (selectedCategory !== "ALL") {
      if (selectedCategory === "CONTRACT" && doc.documentType !== "EMPLOYMENT_CONTRACT") return false;
      if (selectedCategory === "PAYSLIP" && doc.documentType !== "PAYSLIP") return false;
      if (selectedCategory === "ATTESTATION" && !["EMPLOYMENT_CERTIFICATE", "SERVICE_RECORD", "SALARY_CERTIFICATE"].includes(doc.documentType)) return false;
      if (selectedCategory === "POLICY" && !["POLICY_ACCEPTANCE", "CNSS_DOCUMENT", "TAX_DOCUMENT"].includes(doc.documentType)) return false;
    }
    if (searchQuery && !doc.title.toLowerCase().includes(searchQuery.toLowerCase()) && !doc.reference.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6" id="view-documents-section">
      {/* HEADER BANNER */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/30 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-slate-100 uppercase tracking-tight flex items-center gap-2">
                Coffre-Fort Numérique RH (EDMS)
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Empreintes SHA256 Immuables | Horodatage Certifié | Conformité MAST & CNSS
              </p>
            </div>
          </div>
        </div>

        {/* QUICK GENERATION & ACTION CONTROLS */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => handleGenerateDocument("EMPLOYMENT_CERTIFICATE", "Attestation Officielle d'Emploi")}
            disabled={generatingType !== null}
            className="px-3 py-2 bg-purple-600/90 hover:bg-purple-600 text-white text-xs font-bold rounded-xl border border-purple-500/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {generatingType === "EMPLOYMENT_CERTIFICATE" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Attestation d'Emploi
          </button>

          <button
            onClick={() => {
              // Find most recent payroll record if available
              const validPayrolls = payrollRecords.filter(p => ["VALIDATED", "APPROVED", "PAID", "LOCKED", "POSTED", "SEALED", "DRAFT", "PENDING", "CORRECTED"].includes(p.status || ""));
              const latestPayroll = validPayrolls.length > 0
                ? validPayrolls.slice().sort((a, b) => {
                    const dateA = (a as any).paymentDate || (a as any).generated_at || (a as any).created_at || "";
                    const dateB = (b as any).paymentDate || (b as any).generated_at || (b as any).created_at || "";
                    return String(dateB).localeCompare(String(dateA));
                  })[0]
                : null;

              const lastPayrollPayload = latestPayroll ? {
                cycleName: latestPayroll.cycleId || (latestPayroll as any).payroll_cycle_id || (latestPayroll as any).cycleName || "Dernière Quinzaine / Mois Clôturé",
                grossSalary: latestPayroll.grossSalary ?? ((latestPayroll as any).gross_salary_cents ? (latestPayroll as any).gross_salary_cents / 100 : 0),
                netSalary: (latestPayroll as any).netSalary ?? ((latestPayroll as any).net_salary_cents ? (latestPayroll as any).net_salary_cents / 100 : ((latestPayroll as any).netPaid ?? 0)),
                commission: latestPayroll.commissions ?? ((latestPayroll as any).commission_cents ? (latestPayroll as any).commission_cents / 100 : 0),
                commissionRate: (latestPayroll as any).commission_rate_used ?? (latestPayroll as any).commissionRate ?? employee.commissionRate ?? employee.commission_rate ?? 0,
                paymentModel: latestPayroll.pay_profile || employee.paymentModel || (employee.payRegime ? employee.payRegime.toUpperCase() : "FIXED"),
                cnssDeduction: latestPayroll.cnssDeduction ?? ((latestPayroll as any).cnss_employee_cents ? (latestPayroll as any).cnss_employee_cents / 100 : 0),
              } : null;

              handleGenerateDocument("SALARY_CERTIFICATE", "Attestation de Salaire Bancaire", {
                lastPayroll: lastPayrollPayload,
                paymentModel: employee.paymentModel || (employee.payRegime ? employee.payRegime.toUpperCase() : "FIXED"),
                commissionRate: employee.commissionRate ?? employee.commission_rate ?? 0,
                salary: employee.baseSalary || (employee as any).salaryBaseHtg || 0
              });
            }}
            disabled={generatingType !== null}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-200 text-xs font-bold rounded-xl border border-slate-800 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {generatingType === "SALARY_CERTIFICATE" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            )}
            Attestation de Salaire
          </button>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par titre ou référence..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-purple-500 font-sans"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-purple-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-slate-200">Tous les Documents</option>
              <option value="CONTRACT" className="bg-slate-900 text-slate-200">Contrats de Travail</option>
              <option value="PAYSLIP" className="bg-slate-900 text-slate-200">Bulletins de Paie</option>
              <option value="ATTESTATION" className="bg-slate-900 text-slate-200">Attestations RH</option>
              <option value="POLICY" className="bg-slate-900 text-slate-200">Affiliations & Reglements</option>
            </select>
          </div>

          <button
            onClick={loadDocuments}
            className="p-2 bg-slate-950 hover:bg-slate-900 text-slate-300 rounded-xl border border-slate-800 transition"
            title="Actualiser les documents"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* VERIFICATION SEARCH TOOL ACCORDION */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Module de Verification de Sceau Immuable
            </h4>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">
            Saisissez un ID, code de référence ou empreinte SHA256 pour vérifier l'authenticité.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={verifyQuery}
            onChange={(e) => setVerifyQuery(e.target.value)}
            placeholder="Ex: FINOPS-EMPL-2026-8912 ou empreinte SHA256..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleVerifySearch}
            disabled={verifying || !verifyQuery.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {verifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Vérifier
          </button>
        </div>

        {verifyResult && verifyResult !== "NOT_FOUND" && (
          <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-mono text-emerald-300 flex items-start gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">DOCUMENT AUTHENTIQUE & CERTIFIE</p>
              <p className="text-[11px] text-slate-300 mt-1">
                Titre: {verifyResult.title} | Titulaire: {verifyResult.employeeName} | Version: v{verifyResult.version}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                SHA256: {verifyResult.checksum}
              </p>
            </div>
          </div>
        )}

        {verifyResult === "NOT_FOUND" && (
          <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-mono text-rose-300 flex items-center gap-2 animate-fadeIn">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Document non trouvé ou empreinte numérique non enregistrée dans le registre d'entreprise.</span>
          </div>
        )}
      </div>

      {/* DOCUMENTS GRID DISPLAY */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(n => (
            <div key={n} className="bg-slate-900/40 p-6 rounded-2xl border border-slate-800 animate-pulse h-48"></div>
          ))}
        </div>
      ) : filteredDocs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => (
            <div 
              key={doc.id} 
              className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 hover:border-purple-500/40 transition group relative overflow-hidden"
            >
              <div className="space-y-2.5">
                <div className="flex justify-between items-start">
                  <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {doc.documentType === "EMPLOYMENT_CONTRACT" ? (
                      <FileSignature className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-950 text-purple-300 border border-purple-500/30 uppercase">
                      v{doc.version}.0
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-950 text-slate-400 border border-slate-800 uppercase">
                      {doc.documentType.split("_")[0]}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-100 group-hover:text-purple-300 transition line-clamp-1">
                    {doc.title}
                  </h4>
                  <p className="text-[10px] font-mono text-slate-400 mt-1">
                    Réf: <span className="text-slate-300">{doc.reference}</span>
                  </p>
                </div>

                <div className="p-2 rounded-xl bg-slate-950 border border-slate-850 font-mono text-[9.5px] text-slate-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Emise le:</span>
                    <span className="text-slate-200">{new Date(doc.generatedAt).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Empreinte SHA256:</span>
                    <span className="text-emerald-400 truncate max-w-[120px]">{doc.checksum}</span>
                  </div>
                </div>
              </div>

              {/* CARD FOOTER BUTTONS */}
              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-[10px] font-mono gap-2">
                <button 
                  onClick={() => {
                    setSelectedDoc(doc);
                    setActiveTab("PREVIEW");
                  }}
                  className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-850 text-slate-300 rounded-xl border border-slate-800 transition flex items-center gap-1 font-bold cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-purple-400" /> Aperçu
                </button>

                <button 
                  onClick={() => handleDownload(doc)}
                  className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white rounded-xl border border-purple-500/30 transition cursor-pointer flex items-center gap-1 font-bold"
                >
                  <Download className="w-3.5 h-3.5" /> Télécharger
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass p-12 rounded-2xl border border-slate-800 text-center font-mono text-xs text-slate-400 space-y-3">
          <FileText className="w-8 h-8 text-slate-600 mx-auto" />
          <p>Aucun document disponible dans le coffre-fort pour cette recherche.</p>
        </div>
      )}

      {/* INSPECTION / PREVIEW MODAL */}
      <AnimatePresence>
        {selectedDoc && (
          <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-4xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
            >
            {/* MODAL HEADER */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    {selectedDoc.title}
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      v{selectedDoc.version}.0
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    Réf: {selectedDoc.reference} | SHA256: {selectedDoc.checksum.substring(0, 16)}...
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDoc(null)}
                className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* TAB NAVIGATION */}
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-xs font-mono">
              <button
                onClick={() => setActiveTab("PREVIEW")}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 font-bold cursor-pointer ${
                  activeTab === "PREVIEW" ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-900"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Aperçu PDF
              </button>

              <button
                onClick={() => setActiveTab("DETAILS")}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 font-bold cursor-pointer ${
                  activeTab === "DETAILS" ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-900"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Sceau & Métadonnées
              </button>

              <button
                onClick={() => setActiveTab("AUDIT")}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 font-bold cursor-pointer ${
                  activeTab === "AUDIT" ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-900"
                }`}
              >
                <History className="w-3.5 h-3.5" /> Registre d'Audite ({selectedDoc.audit?.length || 1})
              </button>
            </div>

            {/* TAB CONTENT BODY */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-950/30">
              {activeTab === "PREVIEW" && (
                <div className="h-full flex flex-col items-center justify-center">
                  {selectedDoc.dataUrl ? (
                    <iframe
                      src={selectedDoc.dataUrl}
                      className="w-full h-full rounded-xl border border-slate-800 bg-white"
                      title={selectedDoc.title}
                    />
                  ) : (
                    <div className="text-center space-y-3 font-mono text-xs text-slate-400">
                      <AlertCircle className="w-8 h-8 text-purple-400 mx-auto" />
                      <p>Visualisation directe non disponible dans le cache local.</p>
                      <button
                        onClick={() => handleDownload(selectedDoc)}
                        className="px-4 py-2 bg-purple-600 text-white font-bold rounded-xl"
                      >
                        Télécharger le document
                      </button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "DETAILS" && (
                <div className="space-y-4 font-mono text-xs text-slate-200 max-w-2xl mx-auto py-4">
                  <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-2">
                    <h4 className="font-bold text-purple-300 uppercase tracking-wider text-[11px] mb-3">
                      Sceau Cryptographique d'Authenticité
                    </h4>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Titre Officiel:</span>
                      <span className="font-bold">{selectedDoc.title}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Version Actuelle:</span>
                      <span className="text-purple-400 font-bold">v{selectedDoc.version}.0</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Code de Référence:</span>
                      <span className="text-slate-200">{selectedDoc.reference}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Généré le:</span>
                      <span>{new Date(selectedDoc.generatedAt).toLocaleString("fr-FR")}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span className="text-slate-400">Signataire RH:</span>
                      <span className="text-emerald-400 font-bold">{selectedDoc.generatedBy}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Empreinte SHA256:</span>
                      <span className="text-emerald-400 font-mono text-[10px] break-all">{selectedDoc.checksum}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "AUDIT" && (
                <div className="space-y-3 font-mono text-xs max-w-2xl mx-auto py-4">
                  <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] mb-2">
                    Journal d'Audite & Traçabilité Immuable
                  </h4>
                  {selectedDoc.audit?.map((log, idx) => (
                    <div key={idx} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-start gap-3">
                      <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 mt-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex justify-between items-center text-slate-200">
                          <span className="font-bold uppercase text-[10px] text-purple-300">{log.action}</span>
                          <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleString("fr-FR")}</span>
                        </div>
                        <p className="text-[11px] text-slate-300">{log.details}</p>
                        <p className="text-[10px] text-slate-500">Par: {log.userName} ({log.userRole})</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center">
              <span className="text-[10px] font-mono text-slate-500">
                Sceau FINOPS ERP-2026 | Sceau Haïtien DGT & CNSS Certifié
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(selectedDoc)}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-purple-900/20 active:scale-95"
                >
                  <Download className="w-4 h-4" /> Télécharger PDF Officiel
                </button>
              </div>
            </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
