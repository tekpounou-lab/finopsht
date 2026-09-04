import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Employee, EmployeeContract, ForensicLog, ERPEvent, Role } from "../types";
import { useI18n } from "../i18n";
import { FolderOpen, Plus, FileSpreadsheet, Eye, Trash2, X, Sparkles, Building2, Download, Printer, Check, RefreshCw, Pencil } from "lucide-react";
import { DocumentGenerationService } from "../services/DocumentGenerationService";
import { DocumentRepository } from "../repositories/DocumentRepository";

interface DocumentsProps {
  currentRole?: Role | string;
  currentUser?: { name: string; id: string };
  currentUserId?: string;
  current_business_id?: string;
  employees?: Employee[];
  employeeContracts?: EmployeeContract[];
  onAddEmployeeContract?: (contract: EmployeeContract) => void;
  onUpdateEmployeeContract?: (contract: Partial<EmployeeContract> & { id: string }) => void;
  onDeleteEmployeeContract?: (id: string) => void;
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
}

const contractSchema = z.object({
  employeeId: z.string().min(1, { message: "Veuillez désigner un employé signataire." }),
  contractType: z.enum(["cdi", "cdd", "freelance"], { message: "Type de contrat invalide." }),
  payRegime: z.enum(["fixe", "commission", "hybrid"], { message: "Régime salarial invalide." }),
  salaryBaseHtg: z.coerce.number().min(1000, { message: "Salaire de base minimum : 1,000 HTG." }),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
});

const docDict = {
  fr: {
    description: "Saisie légale des contrats de travail de la Direction Générale du Travail et des Affaires Sociales (Haiti).",
    editContract: "Modifier le contrat",
    restrictedRights: "Droits Bloqués : Seul un administrateur ou un chef d'établissement peut souscrire un contrat local ou imposer des modifications salariales.",
    employeeSignatory: "Employé Signataire",
    selectPlaceholder: "-- Choisir --",
    payRegime: "Régime de paie",
    saving: "Sauvegarde...",
    saveBtn: "Enregistrer",
    cancelBtn: "Annuler",
    registryTitle: "Registre Local des Contrats Mandataires",
    employeeLabel: "Anplwaye / Signataire",
    categoryLabel: "Catégorie",
    dateLabel: "Date d'effet",
    actionsLabel: "Actions",
    noContracts: "Aucun contrat enregistré.",
    viewPdf: "Voir PDF",
    deleteBtn: "Supprimer",
    pdfTitle: "Viseur de Pièce d'Archive :",
    betweenSigned: "ENTRE LES SOUSSIGNÉS :",
    employerText: "L'établissement comercial désigné sous la marque corporate <strong>TEK POU NOU S.A.</strong>, enregistré sous la juridiction locale haïtienne, aux fins de la présente représentée par son administrateur de succursale d'Haiti, ci-après dénommée l'<strong>\"Employeur\"</strong>, d'une part.",
    employeeText: "Et le citoyen(ne) <strong>{name}</strong>, domicilié(e) fiscalement à Port-au-Prince, Haiti, ci-après dénommé(e) l'<strong>\"Employé\"</strong>, d'autre part.",
    agreedAndResolved: "IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :",
    article1Title: "Article 1 : Engagement & Objet du Contrat",
    article1Text: "L'employeur engage l'employé pour accomplir des tâches professionnelles au poste désigné de <em>{role}</em>. Le présent contrat est conclu sous la convention de type <strong>{type}</strong>.",
    article2Title: "Article 2 : Rémunération Légale des Ratios",
    article2Text: "En contrepartie, l'employeur s'engage à verser un salaire de base mensuel brut consolidé d'un montant de <strong>{salary} HTG</strong> (Gourdes haïtiennes). Les retenues légales de protection du travailleur (avec un prélèvement obligatoire CNSS d'un taux global cumulé de 6% et CNS à hauteur de 2%) seront déduites sur chaque quinzaine répliquée.",
    article3Title: "Article 3 : Durée & Heures de Service",
    article3Text: "Le temps effectif planifié de shift est de 8 heures par jour, conformément au planning enregistré dans le système ERP de la succursale d'affectation.",
    forEmployer: "Pour l'Employeur,",
    immutableSeal: "Scellé immuable TEK POU NOU",
    forEmployee: "L'Employé(e),",
    readApproved: "Lu et Approuvé",
    printBtn: "Imprimer",
    downloadBtn: "Télécharger",
    deleteConfirmTitle: "Supprimer ce contrat ?",
    deleteConfirmDesc: "Cette action est irréversible. Êtes-vous sûr de vouloir supprimer définitivement ce document ?",
    haitianRepublic: "RÉPUBLIQUE D'HAÏTI",
    ministryLabel: "Ministère des Affaires Sociales et du Travail",
    commissionRate: "Taux Comm. (%)",
    choosePlaceholder: "-- Choisir --",
  },
  ht: {
    description: "Saisie legal kontra travay yo pou Ministè Afè Sosyal ak Travay (Ayiti).",
    editContract: "Modifye kontra a",
    restrictedRights: "Aksè Bloke: Se yon administratè oswa yon chèf etablisman sèlman ki gen dwa kreye yon pwojè kontra oswa chanje salè anplwaye yo.",
    employeeSignatory: "Anplwaye ki pou siyen an",
    selectPlaceholder: "-- Chwazi --",
    payRegime: "Rejim peman",
    saving: "Ap sove...",
    saveBtn: "Anrejistre",
    cancelBtn: "Anile",
    registryTitle: "Rejis Lokal Kontra Mandatè yo",
    employeeLabel: "Anplwaye / Siyatè",
    categoryLabel: "Kategori",
    dateLabel: "Dat kontra a kòmanse",
    actionsLabel: "Aksyon yo",
    noContracts: "Pa gen okenn kontra anrejistre kounye a.",
    viewPdf: "Gade PDF",
    deleteBtn: "Supprimer",
    pdfTitle: "Kat Idantite Archivo: ",
    betweenSigned: "ANTRE DE SOUYEN YO:",
    employerText: "Etablisman komèsyal ki rele <strong>TEK POU NOU S.A.</strong>, ki anrejistre anba lalwa peyi Dayiti, repwezante pa administratè sikisal li an Ayiti, ke yo rele isit la <strong>\"Anplwayè a\"</strong>, yon bò.",
    employeeText: "Ak sitwayen(n) <strong>{name}</strong>, ki rete Pòtoprens, Ayiti, isit la ki rele <strong>\"Anplwaye a\"</strong>, yon lòt bò.",
    agreedAndResolved: "DE PATI YO DAKÒ SOU SA KI ANBA LA A:",
    article1Title: "Atik 1 : Angajman ak bi kontra a",
    article1Text: "Anplwayè a pran anplwaye a pou li fè travay nan bwat la kòm <em>{role}</em>. Kontra sa a fèt sou fòma <strong>{type}</strong>.",
    article2Title: "Atik 2 : Peman ak taks yo",
    article2Text: "Pou travay sa a, anplwayè a dakò peye yon salè de baz chak mwa ki vo <strong>{salary} HTG</strong> (Goud ayisyen). Tout taks legal yo (tankou 6% pou CNSS ak 2% pou CNS) ap koupe nan salè a jan lalwa mande li.",
    article3Title: "Atik 3 : Lè travay yo",
    article3Text: "Lè travay planifye a se 8 èdtan pa jou, dapre planifikasyon ki fèt nan sistèm ERP a pou sikisal la.",
    forEmployer: "Pou Anplwayè a,",
    immutableSeal: "Siyati sekirize TEK POU NOU",
    forEmployee: "Anplwaye a,",
    readApproved: "Li ak Apwouve",
    printBtn: "Enprime",
    downloadBtn: "Telechaje",
    deleteConfirmTitle: "Efase kontra sa a?",
    deleteConfirmDesc: "Aksyon sa a pa gen retou. Èske ou sèten ou vle efase kontra sa a nèt?",
    haitianRepublic: "REPIBLIK DAYITI",
    ministryLabel: "Ministè Afè Sosyal ak Travay",
    commissionRate: "Chaj Komisyon (%)",
    choosePlaceholder: "-- Chwazi --",
  },
  en: {
    description: "Legal drafting and logging of employment contracts in compliance with the Ministry of Social Affairs and Labor (Haiti).",
    editContract: "Modify Contract",
    restrictedRights: "Access Denied: Only an Administrator or a Branch Manager can draft a new contract or apply salary modifications.",
    employeeSignatory: "Signatory Employee",
    selectPlaceholder: "-- Choose --",
    payRegime: "Payroll Regime",
    saving: "Saving...",
    saveBtn: "Save",
    cancelBtn: "Cancel",
    registryTitle: "Local Agent Contract Registry",
    employeeLabel: "Employee / Signatory",
    categoryLabel: "Category",
    dateLabel: "In Force Date",
    actionsLabel: "Actions",
    noContracts: "No contracts recorded.",
    viewPdf: "View PDF",
    deleteBtn: "Delete",
    pdfTitle: "Document Archive Viewer: ",
    betweenSigned: "BETWEEN THE UNDERSIGNED:",
    employerText: "The business establishment operating under the corporate brand <strong>TEK POU NOU S.A.</strong>, registered under Haitian jurisdiction, represented for this agreement by its Haiti Branch Manager, hereinafter referred to as the <strong>\"Employer\"</strong>, of the first part.",
    employeeText: "And citizen <strong>{name}</strong>, residing fiscally in Port-au-Prince, Haiti, hereinafter referred to as the <strong>\"Employee\"</strong>, of the second part.",
    agreedAndResolved: "IT HAS BEEN MUTUALLY AGREED AND DECLARED AS FOLLOWS:",
    article1Title: "Article 1: Object of Engagement & Contract Framework",
    article1Text: "The Employer hires the Employee to carry out professional duties in the position of <em>{role}</em>. This agreement is typed as a <strong>{type}</strong> framework.",
    article2Title: "Article 2: Salary & Mandatory Regulatory Deductions",
    article2Text: "In consideration, the Employer agrees to pay a gross monthly base salary of <strong>{salary} HTG</strong> (Haitian Gourdes). Standard legal worker protections (a mandatory 6% CNSS and 2% CNS) will be deducted from each payroll cycle.",
    article3Title: "Article 3: Term & Hours of Service",
    article3Text: "The scheduled active shift is 8 hours per day, strictly matching the shift schedules logged in the ERP branch system.",
    forEmployer: "For the Employer,",
    immutableSeal: "TEK POU NOU Immutable Seal",
    forEmployee: "The Employee,",
    readApproved: "Read and Approved",
    printBtn: "Print",
    downloadBtn: "Download",
    deleteConfirmTitle: "Delete this Contract?",
    deleteConfirmDesc: "This action is completely irreversible. Are you sure you want to permanently delete this legal document?",
    haitianRepublic: "REPUBLIC OF HAITI",
    ministryLabel: "Ministry of Social Affairs and Labor",
    commissionRate: "Comm. Rate (%)",
    choosePlaceholder: "-- Choose --",
  }
};

type ContractFormValues = z.infer<typeof contractSchema>;

export default function DocumentsManager({
  currentRole = "EMPLOYEE",
  currentUser,
  currentUserId,
  current_business_id = "BIZ_MAIN",
  employees = [],
  employeeContracts = [],
  onAddEmployeeContract,
  onUpdateEmployeeContract,
  onDeleteEmployeeContract,
  onAddEvent,
  onAddForensicLog,
}: DocumentsProps) {
  const { t, language } = useI18n();
  const activeLang = (language === "fr" || language === "ht" || language === "en") ? language : "fr";
  const d = docDict[activeLang];
  const [loading, setLoading] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractToDelete, setContractToDelete] = useState<string | null>(null);

  // Modal Viewer State for Contract PDF Overlay
  const [activeViewerContract, setActiveViewerContract] = useState<EmployeeContract | null>(null);

  const safeEmployees = employees || [];
  const safeEmployeeContracts = employeeContracts || [];

  const businessEmployees = safeEmployees.filter((e) => e.business_id === current_business_id);
  
  // RBAC for Contracts Register
  const businessContracts = safeEmployeeContracts.filter((c) => {
    if (c.business_id !== current_business_id) return false;
    if (currentRole === "OWNER" || currentRole === "MANAGER" || currentRole === "SUPER_ADMIN") return true;
    return c.employeeId === currentUserId;
  });

  // Close modal on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveViewerContract(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Trap body scroll when modal is open
  useEffect(() => {
    if (activeViewerContract) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeViewerContract]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema) as any,
    defaultValues: {
      employeeId: "",
      contractType: "cdi",
      payRegime: "fixe",
      salaryBaseHtg: 30000,
      commissionRate: 0,
    },
  });

  const selectedPayRegime = watch("payRegime");

  const onSubmit = async (data: ContractFormValues) => {
    setLoading(true);
    setSuccessToast(null);

    try {
      const targetEmp = safeEmployees.find((e) => e.id === data.employeeId);
      const randomStr = Math.random().toString(36).substring(2, 8);
      const initials = targetEmp ? targetEmp.name.toLowerCase().replace(/\s+/g, "_") : "employee";

      // If targetEmp exists, generate official EDMS Document with SHA256 Checksum & PDF
      if (targetEmp) {
        await DocumentGenerationService.generateDocument({
          employee: targetEmp,
          documentType: "EMPLOYMENT_CONTRACT",
          actor: {
            uid: currentUserId || "admin",
            name: currentUser?.name || "RH Administrateur",
            role: currentRole as any
          },
          additionalData: {
            title: `Contrat de Travail ${data.contractType.toUpperCase()}`,
            salary: data.salaryBaseHtg
          }
        });
      }

      if (editingContractId) {
        onUpdateEmployeeContract?.({
          id: editingContractId,
          ...data
        });

        onAddEvent?.({
          id: "ev_con_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          type: "HR",
          business_id: current_business_id,
          payload: { action: "CONTRACT_MODIFIED", contractId: editingContractId, employeeId: data.employeeId },
          status: "PROCESSED",
          retryCount: 0,
        });

        onAddForensicLog?.({
          id: "f_con_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: currentRole === "OWNER" ? "e1" : "e2",
          userName: currentUser?.name || "Validator",
          userRole: currentRole as any,
          business_id: current_business_id,
          action: "HR_CONTRACT_MODIFIED",
          beforeState: "{}",
          afterState: JSON.stringify(data),
          ipAddress: "190.115.34.12",
          userAgent: window.navigator.userAgent,
          signature: "seal_con_mod_" + Math.random().toString(36).substring(2, 9),
        });

        setSuccessToast("Contrat mis à jour avec succès et certifié EDMS !");
      } else {
        const newContract: EmployeeContract = {
          id: "con_" + randomStr,
          employeeId: data.employeeId,
          business_id: current_business_id,
          fileUrl: `https://storage.googleapis.com/finops-contracts/${initials}-cdi-${randomStr}.pdf`,
          contractType: data.contractType,
          payRegime: data.payRegime,
          salaryBaseHtg: data.salaryBaseHtg,
          commissionRate: data.commissionRate,
          generatedAt: new Date().toISOString(),
          status: "active",
        };

        onAddEmployeeContract?.(newContract);

        // Event stream dispatch
        onAddEvent?.({
          id: "ev_con_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          type: "HR",
          business_id: current_business_id,
          payload: { action: "CONTRACT_ISSUED", contractId: newContract.id, employeeId: data.employeeId },
          status: "PROCESSED",
          retryCount: 0,
        });

        // Forensic transaction recording
        onAddForensicLog?.({
          id: "f_con_" + Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toISOString(),
          userId: currentRole === "OWNER" ? "e1" : "e2",
          userName: currentUser?.name || "Validator",
          userRole: currentRole as any,
          business_id: current_business_id,
          action: "HR_CONTRACT_ISSUE",
          beforeState: "{}",
          afterState: JSON.stringify(newContract),
          ipAddress: "190.115.34.12",
          userAgent: window.navigator.userAgent,
          signature: "seal_con_issued_" + Math.random().toString(36).substring(2, 9),
        });

        setSuccessToast("Contrat certifié EDMS enregistré et prêt à l'impression !");
      }

      setLoading(false);
      reset();
      setEditingContractId(null);
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (e) {
      console.error("[DocumentsManager] Error processing contract submit:", e);
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingContractId(null);
    reset();
  };

  const handleEditClick = (contract: EmployeeContract) => {
    setEditingContractId(contract.id);
    reset({
      employeeId: contract.employeeId,
      contractType: contract.contractType,
      payRegime: contract.payRegime || "fixe",
      salaryBaseHtg: contract.salaryBaseHtg,
      commissionRate: contract.commissionRate || 0,
    });
  };

  const handleDeleteClick = (contractId: string) => {
    setContractToDelete(contractId);
  };

  const confirmDelete = () => {
    if (contractToDelete) {
      if (editingContractId === contractToDelete) {
        cancelEdit();
      }
      onDeleteEmployeeContract?.(contractToDelete);
      setContractToDelete(null);
    }
  };

  const cancelDelete = () => {
    setContractToDelete(null);
  };

  const selectedSigner = safeEmployees.find(
    (e) => e.id === (activeViewerContract ? activeViewerContract.employeeId : "")
  );

  return (
    <div className="flex flex-col gap-6" id="documents-tab-container">
      <div>
        <h2 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
          <FolderOpen className="w-5 h-5 text-cyan-400" />
          {t.documents.title}
        </h2>
        <p className="text-xs text-slate-400 font-light mt-0.5">
          {d.description}
        </p>
      </div>

      {successToast && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold animate-fadeIn flex items-center gap-2" id="docs-success-toast">
          <Check className="w-4 h-4 shrink-0" />
          {successToast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="documents-grid">
        {/* Form panel to create / issue new contract */}
        <div className="lg:col-span-5" id="contracts-form-pane">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5" id="contracts-form-card">
            <h4 className="text-xs uppercase font-extrabold text-slate-100 tracking-wider mb-4 flex items-center gap-1.5" id="contracts-form-header">
              <Plus className="w-4 h-4 text-cyan-400" />
              {editingContractId ? d.editContract : t.documents.uploadContract}
            </h4>

            {currentRole !== "OWNER" && currentRole !== "MANAGER" ? (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs" id="con-access-restricted">
                {d.restrictedRights}
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3.5" id="contracts-actual-form">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{d.employeeSignatory}</label>
                  <select
                    id="doc-form-employeeId"
                    {...register("employeeId")}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                  >
                    <option value="">{d.choosePlaceholder}</option>
                    {businessEmployees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  {errors.employeeId && (
                    <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.employeeId.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3" id="doc-categories-row">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{t.documents.contractType}</label>
                    <select
                      id="doc-form-contractType"
                      {...register("contractType")}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                    >
                      <option value="cdi">{activeLang === 'fr' ? "CDI (Indéterminée)" : activeLang === 'ht' ? "CDI (Endetèmine)" : "CDI (Permanent)"}</option>
                      <option value="cdd">{activeLang === 'fr' ? "CDD (Déterminée)" : activeLang === 'ht' ? "CDD (Detèmine)" : "CDD (Contractual)"}</option>
                      <option value="freelance">{activeLang === 'fr' ? "Freelance / Externe" : activeLang === 'ht' ? "Freelance (Ekstèn)" : "Freelance / External"}</option>
                    </select>
                    {errors.contractType && (
                      <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.contractType.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{d.payRegime}</label>
                    <select
                      id="doc-form-payRegime"
                      {...register("payRegime")}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
                    >
                      <option value="fixe">{activeLang === 'fr' ? "Fixe Mensuel" : activeLang === 'ht' ? "Règilè fiks pa mwa" : "Fixed Monthly"}</option>
                      <option value="commission">{activeLang === 'fr' ? "Commission pure" : activeLang === 'ht' ? "Komisyon sèlman" : "Pure Commission"}</option>
                      <option value="hybrid">{activeLang === 'fr' ? "Hybride mixte" : activeLang === 'ht' ? "Ibrid Melanje" : "Hybrid Mix"}</option>
                    </select>
                    {errors.payRegime && (
                      <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.payRegime.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3" id="doc-salary-row">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{t.documents.salaryBase} (HTG)</label>
                    <input
                      id="doc-form-salaryBaseHtg"
                      type="number"
                      {...register("salaryBaseHtg")}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500"
                    />
                    {errors.salaryBaseHtg && (
                      <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.salaryBaseHtg.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{d.commissionRate}</label>
                    <input
                      id="doc-form-commissionRate"
                      type="number"
                      step="0.1"
                      disabled={selectedPayRegime === "fixe"}
                      {...register("commissionRate")}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-500 disabled:opacity-30"
                    />
                    {errors.commissionRate && (
                      <p className="text-rose-500 text-[10px] mt-1 font-semibold">{errors.commissionRate.message}</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    id="btn-contract-submit"
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-700 text-slate-950 text-xs font-bold rounded cursor-pointer transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        {d.saving}
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        {editingContractId ? d.saveBtn : t.documents.generatePdf}
                      </>
                    )}
                  </button>
                  {editingContractId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded transition"
                    >
                      {d.cancelBtn}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Existing Contracts Registry Grid */}
        <div className="lg:col-span-7 flex flex-col gap-4" id="contracts-list-pane">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl overflow-hidden" id="contracts-table-box">
            <div className="p-3 bg-slate-950/60 border-b border-slate-800/80" id="contracts-table-header">
              <span className="text-xs uppercase font-extrabold text-slate-200 tracking-wide">{d.registryTitle}</span>
            </div>

            <div className="overflow-x-auto" id="contracts-table-scroll">
              <table className="hidden md:table w-full text-left font-sans text-xs" id="con-list-table">
                <thead>
                  <tr className="bg-slate-950/40 border-b border-slate-850 text-[10px] uppercase text-slate-400 tracking-wide font-bold">
                    <th className="py-2.5 px-3">{d.employeeLabel}</th>
                    <th className="py-2.5 px-3">{d.categoryLabel}</th>
                    <th className="py-2.5 px-3 text-right">{activeLang === 'fr' ? "Salaire Brut (HTG)" : activeLang === 'ht' ? "Salè Brvit (HTG)" : "Gross Salary (HTG)"}</th>
                    <th className="py-2.5 px-3">{d.dateLabel}</th>
                    <th className="py-2.5 px-3 text-right">{d.actionsLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {businessContracts.map((con) => {
                    const empRef = safeEmployees.find((e) => e.id === con.employeeId);
                    return (
                      <tr key={con.id} className="hover:bg-slate-900/20 text-slate-350" id={`con-row-${con.id}`}>
                        <td className="py-2.5 px-3">
                          <p className="font-semibold text-slate-200">{empRef ? empRef.name : "Employee"}</p>
                          <p className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">{con.id}</p>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-semibold text-cyan-400 uppercase">
                            {con.contractType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200">
                          {con.salaryBaseHtg.toLocaleString()} HTG
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                          {con.generatedAt.substring(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              id={`btn-view-pdf-con-${con.id}`}
                              onClick={() => setActiveViewerContract(con)}
                              className="p-1 px-2.5 rounded bg-slate-950/50 hover:bg-cyan-600 hover:text-slate-950 border border-slate-850 text-[10px] text-cyan-300 font-bold transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Voir le document juridique complet"
                            >
                              <Eye className="w-3 h-3" />
                              Voir PDF
                            </button>
                            {(currentRole === "OWNER" || currentRole === "MANAGER") && (
                              <>
                                <button
                                  onClick={() => handleEditClick(con)}
                                  className="p-1.5 rounded bg-slate-950/50 hover:bg-cyan-600 hover:text-slate-950 border border-slate-850 text-cyan-300 transition-colors"
                                  title="Modifier le contrat"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(con.id)}
                                  className="p-1.5 rounded bg-slate-950/50 hover:bg-rose-600 hover:text-slate-50 border border-slate-850 text-rose-400 transition-colors"
                                  title="Supprimer le contrat"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {businessContracts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Aucun contrat enregistré.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="md:hidden flex flex-col gap-3">
                {businessContracts.map((con) => {
                  const empRef = safeEmployees.find((e) => e.id === con.employeeId);
                  return (
                    <div key={con.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm p-3 flex flex-col gap-3">
                      <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                        <div>
                           <p className="font-bold text-slate-200">{empRef ? empRef.name : "Employee"}</p>
                           <p className="text-[10px] text-slate-500 font-mono truncate">{con.id}</p>
                        </div>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-semibold text-cyan-400 uppercase">
                           {con.contractType}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                         <div className="flex flex-col">
                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">{activeLang === 'fr' ? "Salaire Brut" : activeLang === 'ht' ? "Salè Brvit" : "Gross Salary"}</span>
                            <span className="font-mono font-bold text-slate-200">{con.salaryBaseHtg.toLocaleString()} HTG</span>
                         </div>
                         <div className="flex flex-col text-right">
                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Date</span>
                            <span className="font-mono text-slate-400">{con.generatedAt.substring(0, 10)}</span>
                         </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          onClick={() => setActiveViewerContract(con)}
                          className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-cyan-300 font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-4 h-4" />
                          {d.viewPdf}
                        </button>
                        {(currentRole === "OWNER" || currentRole === "MANAGER") && (
                          <>
                            <button
                              onClick={() => handleEditClick(con)}
                              className="p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(con.id)}
                              className="p-2 rounded bg-slate-800 hover:bg-rose-900 border border-slate-700 text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {businessContracts.length === 0 && (
                  <div className="py-8 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                    Aucun contrat enregistré.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RENDER MODAL: Contract PDF Preview Overlay (QA Compliant: ESC key, scroll lock, responsive) */}
      {activeViewerContract && createPortal(
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          id="pdf-contract-viewer-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 w-full max-w-2xl h-[92vh] rounded-xl flex flex-col shadow-2xl relative border border-slate-300/80 overflow-hidden" id="pdf-viewer-bounds">
            {/* Modal Title / Action Bar */}
            <header className="bg-slate-100 border-b border-slate-200 p-4 h-12 flex items-center justify-between" id="pdf-viewer-header">
              <span className="text-xs uppercase font-extrabold text-slate-700 tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-700" />
                {d.pdfTitle} {activeViewerContract.id}.pdf
              </span>
              <button
                id="btn-close-pdf"
                onClick={() => setActiveViewerContract(null)}
                className="w-6 h-6 rounded bg-slate-200 hover:bg-slate-350 flex items-center justify-center cursor-pointer text-slate-600 transition-colors"
                title={d.cancelBtn}
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Official Legal Document simulation */}
            <div className="flex-1 overflow-y-auto p-8 font-serif leading-relaxed text-sm bg-stone-50 select-text" id="pdf-scrollable-paper">
              <div className="border border-stone-200/80 p-8 min-h-[800px] flex flex-col justify-between shadow-sm bg-white" id="pdf-inner-bounds">
                <div id="pdf-watermark-top">
                  {/* Haitian Coat of Arms Placeholder */}
                  <div className="text-center font-sans tracking-tight mb-6" id="haitian-state-badge">
                    <p className="text-xs font-bold leading-none uppercase">{d.haitianRepublic}</p>
                    <p className="text-[10px] font-medium leading-none tracking-widest text-slate-500 uppercase mt-1">{d.ministryLabel}</p>
                    <p className="text-[8px] font-mono text-slate-400 mt-2">DGT-NIF: 000-004-921-2</p>
                    <div className="h-0.5 w-[150px] bg-red-650 mx-auto mt-3"></div>
                  </div>

                  <h3 className="text-center font-black text-lg tracking-tight uppercase mb-6" id="pdf-doc-title">
                    {activeViewerContract.contractType === 'cdi' ? (activeLang === 'en' ? "INDIVIDUAL EMPLOYMENT CONTRACT (CDI)" : activeLang === 'ht' ? "KONTRA TRAVAY DIRE ENDETÈMINE (CDI)" : "CONTRAT DE TRAVAIL INDIVIDUEL (CDI)") : activeLang === 'en' ? "INDIVIDUAL EMPLOYMENT CONTRACT" : activeLang === 'ht' ? "KONTRA TRAVAY" : "CONTRAT DE TRAVAIL"}
                  </h3>

                  <div className="flex flex-col gap-4 font-sans text-xs text-slate-800" id="pdf-body-paragraphs">
                    <p>
                      <strong>{d.betweenSigned}</strong>
                    </p>
                    <p className="pl-4" dangerouslySetInnerHTML={{ __html: d.employerText }} />
                    <p className="pl-4" dangerouslySetInnerHTML={{ __html: d.employeeText.replace("{name}", selectedSigner ? selectedSigner.name : "Loveline Altidor") }} />

                    <p>
                      <strong>{d.agreedAndResolved}</strong>
                    </p>
                    <div>
                      <p className="font-bold">{d.article1Title}</p>
                      <p className="pl-3.5 mt-1 text-slate-700 leading-normal" dangerouslySetInnerHTML={{ 
                        __html: d.article1Text
                          .replace("{role}", selectedSigner ? selectedSigner.role : "EMPLOYEE")
                          .replace("{type}", activeViewerContract.contractType.toUpperCase())
                      }} />
                    </div>

                    <div>
                      <p className="font-bold">{d.article2Title}</p>
                      <p className="pl-3.5 mt-1 text-slate-705 leading-normal" dangerouslySetInnerHTML={{
                        __html: d.article2Text
                          .replace("{salary}", activeViewerContract.salaryBaseHtg.toLocaleString())
                      }} />
                    </div>

                    <div>
                      <p className="font-bold">{d.article3Title}</p>
                      <p className="pl-3.5 mt-1 text-slate-700 leading-normal">
                        {d.article3Text}
                      </p>
                    </div>
                  </div>
                </div>

                <div id="pdf-signatures-footer" className="mt-14 pt-6 border-t border-dashed border-stone-300">
                  <div className="grid grid-cols-2 text-center text-xs font-sans text-slate-600" id="signatures-grid">
                    <div>
                      <p className="font-bold">{d.forEmployer}</p>
                      <p className="italic mt-5 font-mono text-cyan-700 text-[10px]">{d.immutableSeal}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-1 pr-2">SIG: {activeViewerContract.id}_ADMIN_SEAL</p>
                    </div>
                    <div>
                      <p className="font-bold">{d.forEmployee}</p>
                      <p className="italic mt-5 font-mono text-indigo-700 text-[10px]">{d.readApproved}</p>
                      <p className="text-[9px] text-slate-500 font-mono mt-1 pr-2">SIG: {activeViewerContract.id}_EMP_SEAL</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Print & Download bottom toolbar buttons */}
            <footer className="bg-slate-100 border-t border-slate-200 p-3 h-14 flex items-center justify-between" id="pdf-viewer-footer">
              <button
                id="btn-print-pdf"
                onClick={() => window.print()}
                className="py-1.5 px-4 rounded bg-slate-900 border border-slate-750 text-slate-200 text-xs font-bold font-sans cursor-pointer hover:bg-slate-800 hover:text-white transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                {d.printBtn}
              </button>
              <button
                id="btn-download-pdf"
                onClick={() => {
                  const msg = activeLang === 'fr' 
                    ? "Impression du PDF simulée avec succès d'archive : " 
                    : activeLang === 'ht' 
                      ? "Enpresyon dokiman an fèt ak siksè : " 
                      : "Document print simulation completed successfully: ";
                  alert(msg + activeViewerContract.fileUrl);
                }}
                className="py-1.5 px-4 rounded bg-cyan-600 text-slate-950 text-xs font-bold font-sans cursor-pointer hover:bg-cyan-500 transition flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                {d.downloadBtn}
              </button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {contractToDelete && createPortal(
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl max-w-sm w-full text-center">
            <h3 className="text-lg font-bold text-slate-100 mb-2">{d.deleteConfirmTitle}</h3>
            <p className="text-sm text-slate-400 mb-6">
              {d.deleteConfirmDesc}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={cancelDelete}
                className="py-2 px-4 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
              >
                {d.cancelBtn}
              </button>
              <button
                onClick={confirmDelete}
                className="py-2 px-4 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {d.deleteBtn}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
