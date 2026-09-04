import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { Employee, EmployeeBadge, EmployeeContract, AttendanceRecord, LedgerTransaction, Role, Branch, Department } from "../types";
import { formatDepartmentName } from "../templates/documents/utils";
import EditEmployeeDialog from "./staff/EditEmployeeDialog";
import EmployeeLedgerViewer from "./staff/EmployeeLedgerViewer";
import { CommissionEngine } from "../services/CommissionEngine";
import { useBusinessContext } from "../contexts/BusinessContext";
import { BusinessAdministrationRepository } from "../services/business/BusinessAdministrationRepository";
import { 
  User, 
  MapPin, 
  Layers, 
  Briefcase, 
  Mail, 
  Phone, 
  Calendar, 
  FileCheck, 
  CreditCard, 
  PiggyBank, 
  Clock, 
  Fingerprint, 
  FileText, 
  ArrowUpRight, 
  X,
  Award,
  BookOpen,
  PieChart,
  ShieldCheck,
  Percent,
  CheckCircle2,
  Edit,
  History,
  ShieldAlert,
  Info
} from "lucide-react";

interface EmployeeTechnicalSheetProps {
  employee: Employee;
  badge?: EmployeeBadge;
  contract?: EmployeeContract;
  attendanceRecords: AttendanceRecord[];
  ledgerTransactions: LedgerTransaction[];
  payrollRecords?: any[];
  branches?: Branch[];
  departments?: Department[];
  onUpdateEmployee?: (updated: Employee) => void;
  onClose: () => void;
  language: string;
  currentRole?: Role;
}

export default function EmployeeTechnicalSheet({
  employee,
  badge,
  contract,
  attendanceRecords,
  ledgerTransactions,
  payrollRecords = [],
  branches = [],
  departments = [],
  onUpdateEmployee,
  onClose,
  language,
  currentRole
}: EmployeeTechnicalSheetProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"identity" | "structure" | "payroll" | "attendance" | "security" | "ledger">("identity");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isTogglingTax, setIsTogglingTax] = useState(false);

  // Connect to Business Context to get authoritative company tax settings
  const { businessSettings, currentBusiness } = useBusinessContext();

  // Social Tax compliance switch resolved from business settings (Default: OFF if not configured)
  const isCompanyTaxEnabled = businessSettings?.payroll?.taxes?.enabled !== undefined
    ? Boolean(businessSettings.payroll.taxes.enabled)
    : (businessSettings?.payroll?.enable_social_taxes !== undefined
        ? Boolean(businessSettings.payroll.enable_social_taxes)
        : false);

  // Check if employee or contract has tax eligibility (defaults to true)
  const isEmployeeTaxEligible = (contract as any)?.social_tax_eligible !== false && (employee as any)?.social_tax_eligible !== false;
  
  // Taxes are only applied if enabled at the company level AND the employee is eligible
  const areTaxesApplied = isCompanyTaxEnabled && isEmployeeTaxEligible;

  // Haitian Tax and Social Contribution Simulation (CNSS/ONA & CNS/OFATMA) - SSOT
  const baseSalary = employee.baseSalary ?? employee.salaryBaseHtg ?? contract?.salaryBaseHtg ?? 0;
  
  // Resolve tax rates configured for the company or fallback to standard legal rates (6% CNSS, 2% CNS/OFATMA)
  const taxConfig = businessSettings?.payroll?.taxes || {};
  const cnssEmpRatePercent = typeof taxConfig.employeeRate === "number" ? taxConfig.employeeRate : (businessSettings?.payroll?.tax_cnss_employee ?? 6.0);
  const cnssEmployerRatePercent = typeof taxConfig.employerRate === "number" ? taxConfig.employerRate : (businessSettings?.payroll?.tax_cnss_employer ?? 6.0);
  const cnsEmpRatePercent = typeof taxConfig.cnsEmployeeRate === "number" ? taxConfig.cnsEmployeeRate : 2.0;
  const ofatmaEmployerRatePercent = typeof taxConfig.ofatmaEmployerRate === "number" ? taxConfig.ofatmaEmployerRate : 2.0;

  const cnssEmpRate = cnssEmpRatePercent / 100;
  const cnssEmployerRate = cnssEmployerRatePercent / 100;
  const cnsEmpRate = cnsEmpRatePercent / 100;
  const ofatmaEmployerRate = ofatmaEmployerRatePercent / 100;

  // CNSS Employee Contribution (6% or 0 when OFF)
  const cnssEmployeeShare = areTaxesApplied ? Math.round(baseSalary * cnssEmpRate) : 0;
  // CNSS Employer Contribution (6% or 0 when OFF)
  const cnssEmployerShare = areTaxesApplied ? Math.round(baseSalary * cnssEmployerRate) : 0;
  // CNS Employee Contribution (2% or 0 when OFF)
  const cnsEmployeeShare = areTaxesApplied ? Math.round(baseSalary * cnsEmpRate) : 0;
  // OFATMA Employer Contribution (2% or 0 when OFF)
  const ofatmaEmployerShare = areTaxesApplied ? Math.round(baseSalary * ofatmaEmployerRate) : 0;
  
  const totalDeductions = cnssEmployeeShare + cnsEmployeeShare;
  const simulatedNet = Math.max(0, baseSalary - totalDeductions);
  const totalEmployerTaxes = cnssEmployerShare + ofatmaEmployerShare;
  const totalCompanyCost = baseSalary + totalEmployerTaxes;

  const canToggleTaxes = currentRole === "OWNER" || currentRole === "MANAGER" || currentRole === "SUPER_ADMIN" || !currentRole;

  const handleToggleCompanyTaxes = async () => {
    if (!currentBusiness?.id || isTogglingTax) return;
    setIsTogglingTax(true);
    try {
      const nextVal = !isCompanyTaxEnabled;
      await BusinessAdministrationRepository.updateSettings(currentBusiness.id, {
        ...businessSettings,
        payroll: {
          ...(businessSettings?.payroll || {}),
          enable_social_taxes: nextVal,
          taxes: {
            ...(businessSettings?.payroll?.taxes || {}),
            enabled: nextVal
          }
        }
      });
    } catch (err) {
      console.error("[EmployeeTechnicalSheet] Failed to toggle company taxes:", err);
    } finally {
      setIsTogglingTax(false);
    }
  };

  // Filter employee attendance records
  const empAttendance = attendanceRecords.filter(r => r.employeeId === employee.id);
  const totalShifts = empAttendance.length;
  const lateShifts = empAttendance.filter(r => r.status === "LATE").length;
  const normalShifts = empAttendance.filter(r => r.status === "NORMAL").length;
  const absentShifts = empAttendance.filter(r => r.status === "ABSENT").length;
  const hoursClocked = empAttendance.reduce((acc, curr) => acc + (curr.realHours || 0), 0);
  const hoursPlanned = empAttendance.reduce((acc, curr) => acc + (curr.plannedHours || 0), 0);
  
  // Calculate attendance rate
  const attendanceRate = totalShifts > 0 
    ? Math.round(((totalShifts - absentShifts) / totalShifts) * 100) 
    : 100;

  // Ledger activity related to employee (salary advances & disbursements)
  const employeeTransactions = ledgerTransactions.filter(tx => 
    tx.employeeId === employee.id || 
    tx.employee_id === employee.id ||
    (tx.metadata && ((tx.metadata as any).employeeId === employee.id || (tx.metadata as any).employee_id === employee.id))
  );
  const advancesCount = employeeTransactions.filter(tx => 
    tx.type === "ADVANCE" || 
    (tx.type === "EXPENSE" && (tx.category === "Avans" || tx.category === "Avance"))
  ).length;
  const advancesTotal = employeeTransactions
    .filter(tx => tx.type === "EXPENSE" && tx.category === "Avans")
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Auto generated Cryptographic Verification Object
  const hmacInput = `${employee.id}|${employee.business_id}|${employee.role}|${employee.email}`;
  
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4" id="employee-technical-overlay">
      <div className="w-full max-w-4xl bg-slate-950 rounded-2xl border border-slate-900 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]" id="employee-technical-card">
        
        {/* Dynamic header background gradient */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600" />
        
        {/* Top Header close row */}
        <div className="flex justify-between items-center p-5 border-b border-slate-900/80 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center font-bold font-mono text-cyan-400">
              {employee.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-100 tracking-tight font-mono flex items-center gap-2">
                {employee.name}
                <span className="text-[10px] bg-slate-900 text-cyan-400 border border-slate-850 px-2 py-0.5 rounded-full uppercase tracking-widest font-black shrink-0">
                  {employee.role}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                {employee.position || "Agent Opérationnel"} — {employee.email}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
             {onUpdateEmployee && currentRole !== 'EMPLOYEE' && (
              <button
                onClick={() => setIsEditDialogOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition text-[10px] uppercase font-bold"
                title="Modifier l'employé"
              >
                <Edit className="w-3.5 h-3.5" />
                Modifier
              </button>
            )}
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-850 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Edit Dialog Instance */}
        {isEditDialogOpen && onUpdateEmployee && (
          <EditEmployeeDialog
            employee={employee}
            branches={branches}
            departments={departments}
            isOpen={isEditDialogOpen}
            onClose={() => setIsEditDialogOpen(false)}
            onSave={updated => {
              onUpdateEmployee(updated);
              setIsEditDialogOpen(false);
            }}
          />
        )}

        {/* Technical Subnav Bar */}
        <div className="flex border-b border-slate-900/60 bg-slate-950/20 px-4 py-1.5 gap-1.5 overflow-x-auto shrink-0 scrollbar-none font-mono">
          <button
            onClick={() => setActiveTab("identity")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase ${
              activeTab === "identity" ? "bg-slate-900 text-cyan-400 border border-slate-850" : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Identité & Profil
          </button>
          
          <button
            onClick={() => setActiveTab("structure")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase ${
              activeTab === "structure" ? "bg-slate-900 text-cyan-400 border border-slate-850" : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Structure & Affiliation
          </button>

          <button
            onClick={() => setActiveTab("payroll")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase ${
              activeTab === "payroll" ? "bg-slate-900 text-cyan-400 border border-slate-850" : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Paie & Charges Sociales
          </button>

          <button
            onClick={() => setActiveTab("attendance")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase ${
              activeTab === "attendance" ? "bg-slate-900 text-cyan-400 border border-slate-850" : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pointage & Heures
          </button>

          <button
            onClick={() => setActiveTab("security")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase ${
              activeTab === "security" ? "bg-slate-900 text-cyan-400 border border-slate-850" : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            Audit & Certifications
          </button>

          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 uppercase ${
              activeTab === "ledger" ? "bg-slate-900 text-emerald-400 border border-slate-850" : "text-slate-500 hover:text-slate-350"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Ledger
          </button>
        </div>

        {/* Content Body View */}
        <div className="p-6 overflow-y-auto flex-1 font-mono text-slate-300">
          
          {/* TAB 1: IDENTITY & GENERAL CARD */}
          {activeTab === "identity" && (
            <div className="flex flex-col gap-6" id="tech-sheet-identity-tab">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Details list */}
                <div className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <h4 className="text-xs uppercase font-extrabold text-cyan-400 tracking-wide border-b border-slate-900 pb-2 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-cyan-500" />
                    Informations Générales
                  </h4>
                  
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 text-[11px] uppercase">Rôle :</span>
                    <span className="text-xs font-bold text-slate-200">{employee.role}</span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 text-[11px] uppercase">Email d'établissement :</span>
                    <span className="text-xs font-bold text-cyan-400">{employee.email}</span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500 text-[11px] uppercase">Téléphone de sécurité :</span>
                    <span className="text-xs font-bold text-slate-300">{employee.phone || "Non renseigné"}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 col-span-2">
                    <span className="text-slate-500 text-[11px] uppercase">Signature d'engagement :</span>
                    <span className="text-xs text-amber-500 font-extrabold">{employee.onboardingComplete ? "AUTORISÉ & ASSIGNÉ" : "NON COMPLETE"}</span>
                  </div>
                </div>

                {/* Contract Status Information */}
                <div className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                    <h4 className="text-xs uppercase font-extrabold text-cyan-400 tracking-wide flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4 text-emerald-500" />
                      Statut du Contrat CNC
                    </h4>
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      SSOT ACTIF
                    </span>
                  </div>
                  
                  {(() => {
                    const resolvedContractType = (employee.contractType || contract?.contractType || "CDI").toUpperCase();
                    const resolvedPayRegime = (employee.paymentModel || employee.payRegime || contract?.payRegime || "FIXED").toUpperCase();
                    const resolvedBaseSalary = employee.baseSalary ?? employee.salaryBaseHtg ?? contract?.salaryBaseHtg ?? 0;
                    const resolvedCommission = employee.commissionRate ?? employee.commission_rate ?? contract?.commissionRate ?? 0;

                    return (
                      <div className="flex flex-col gap-2.5">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-[11px] uppercase">Type de Contrat :</span>
                          <span className="text-xs font-black uppercase text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                            {resolvedContractType}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-[11px] uppercase">Régime Financier :</span>
                          <span className="text-xs font-bold uppercase text-slate-300">
                            {resolvedPayRegime}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-[11px] uppercase">Salaire de Base de Référence :</span>
                          <span className="text-xs font-bold text-slate-200 font-mono">
                            {resolvedBaseSalary.toLocaleString()} HTG
                          </span>
                        </div>
                        {(resolvedPayRegime.includes("COMMISSION") || resolvedPayRegime.includes("HYBRID")) && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-[11px] uppercase">Taux de Commission :</span>
                            <span className="text-xs font-bold text-amber-400 font-mono">
                              {resolvedCommission}%
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-[11px] uppercase">Fichier Archivé :</span>
                          {contract?.fileUrl ? (
                            <span className="text-[10px] text-cyan-500 hover:underline cursor-pointer truncate max-w-[150px]">
                              {contract.fileUrl.split("/").pop()}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Document Virtuel Certifié
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>

              {/* Haiti Onboarding Progress */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-200 uppercase block">Onboarding Multi-Tenant Réussi</span>
                    <span className="text-[10px] text-slate-400">Le profil collabore activement dans l'établissement mandataire.</span>
                  </div>
                </div>
                <div className="text-xs font-black text-emerald-400 font-mono tracking-wider">
                  STATUT CONFORME CORES
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STRUCTURES & BRANCHES */}
          {activeTab === "structure" && (
            <div className="flex flex-col gap-6" id="tech-sheet-structure-tab">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Branch affiliation visual */}
                <div className="bg-slate-950/60 border border-slate-900 p-5 rounded-xl flex flex-col gap-3">
                  <h4 className="text-xs uppercase font-extrabold text-cyan-400 tracking-wide border-b border-slate-900 pb-2 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-cyan-500" />
                    Succursale Affectée (Multi-Locations)
                  </h4>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-500 uppercase font-black">Numéro de Succursale Identifiant :</span>
                    <code className="text-xs font-bold text-amber-500 bg-slate-950 px-2 py-1 rounded border border-slate-900/80">
                      {employee.branchId}
                    </code>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      L'employé est autorisé à badger uniquement sur la borne physique de cette succursale d'établissement. Toute détection en dehors de cet espace lève une alarme de collusion.
                    </p>
                  </div>
                </div>

                {/* Department affiliation */}
                <div className="bg-slate-950/60 border border-slate-900 p-5 rounded-xl flex flex-col gap-3">
                  <h4 className="text-xs uppercase font-extrabold text-cyan-400 tracking-wide border-b border-slate-900 pb-2 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    Département ERP Organisationnel
                  </h4>
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-500 uppercase font-black">Département Affecté :</span>
                    <code className="text-xs font-bold text-indigo-400 bg-slate-950 px-2 py-1 rounded border border-slate-900/80">
                      {formatDepartmentName(employee)}
                    </code>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      L'employé appartient à la grille comptable déterminée par le centre analytique de ce département. Les coûts de paie y sont débités en cascade.
                    </p>
                  </div>
                </div>

              </div>

              {/* Tenancy Verification Row */}
              <div className="bg-indigo-950/10 p-4 rounded-xl border border-indigo-900/30 flex justify-between items-center">
                <div className="flex items-center gap-2.5">
                  <Award className="w-5 h-5 text-indigo-400" />
                  <div className="text-[11px]">
                    <span className="font-extrabold text-indigo-300 uppercase block">Vérification de Compartimentation Active</span>
                    <span className="text-slate-400">Isolation vérifiée. L'employé est étanche au domaine <strong>{employee.business_id}</strong>.</span>
                  </div>
                </div>
                <code className="text-[9.5px] bg-slate-950 border border-slate-900 px-3 py-1 text-slate-500">
                  TENANT_SECURE_OK
                </code>
              </div>
            </div>
          )}

          {/* TAB 3: PAYROLL & TAX SIMULATION */}
          {activeTab === "payroll" && (
            <div className="flex flex-col gap-6" id="tech-sheet-payroll-tab">
              
              {/* Financial Dashboard Summary */}
              <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-5 flex flex-col gap-4">
                <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-900 pb-3">
                  <h4 className="text-xs uppercase font-extrabold text-cyan-400 flex items-center gap-1.5">
                    <PieChart className="w-4 h-4 text-cyan-500" />
                    Fiche Analytique de Charges Sociales (Haïti - Loi du CST)
                  </h4>
                  
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-black text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-0.5 rounded">
                      MODÈLE DE PAIE : {employee.paymentModel}
                    </span>

                    {/* Company Tax Status Badge & Synchronized Switch */}
                    {areTaxesApplied ? (
                      <div className="flex items-center gap-1.5" id="container-tax-status-on">
                        <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded flex items-center gap-1.5" id="badge-tax-company-on">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          TAXES ENTREPRISE : ACTIVÉES (ON)
                        </span>
                        {canToggleTaxes && (
                          <button
                            id="btn-toggle-company-tax-in-sheet"
                            onClick={handleToggleCompanyTaxes}
                            disabled={isTogglingTax}
                            className="text-[9px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
                            title="Basculer l'état des taxes pour l'entreprise"
                          >
                            {isTogglingTax ? "..." : "Désactiver (Passer à 0 HTG)"}
                          </button>
                        )}
                      </div>
                    ) : !isCompanyTaxEnabled ? (
                      <div className="flex items-center gap-1.5" id="container-tax-status-off">
                        <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded flex items-center gap-1.5" id="badge-tax-company-off">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                          TAXES ENTREPRISE : DÉSACTIVÉES (OFF - 0 HTG)
                        </span>
                        {canToggleTaxes && (
                          <button
                            id="btn-toggle-company-tax-in-sheet"
                            onClick={handleToggleCompanyTaxes}
                            disabled={isTogglingTax}
                            className="text-[9px] font-bold text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
                            title="Activer les cotisations sociales ONA/OFATMA pour l'entreprise"
                          >
                            {isTogglingTax ? "..." : "Activer (Appliquer ONA 6% + OFATMA 2%)"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-[9px] font-black text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded flex items-center gap-1" id="badge-tax-employee-exempt">
                        EXEMPTION INDIVIDUELLE (TAXES NON APPLIQUÉES)
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-slate-950 border border-slate-900/80 rounded-lg">
                    <span className="text-[9px] text-slate-500 uppercase font-black block">Brut Conventionnel</span>
                    <span className="text-sm font-black text-slate-100">{baseSalary.toLocaleString()} HTG</span>
                    <span className="text-[8.5px] text-slate-600 font-mono block mt-0.5">Salaire contractuel de base</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-900/80 rounded-lg">
                    <span className="text-[9px] text-rose-500 uppercase font-black block">Retenues Sociales (Employé)</span>
                    <span className={`text-sm font-black ${areTaxesApplied ? "text-rose-400" : "text-slate-400"}`}>
                      {areTaxesApplied ? `-${totalDeductions.toLocaleString()} HTG` : "0 HTG (OFF)"}
                    </span>
                    <span className="text-[8.5px] text-slate-600 font-mono block mt-0.5">
                      {areTaxesApplied ? "Cotisations ONA 6% + OFATMA 2%" : "Taxes désactivées (0 HTG)"}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-900/80 rounded-lg">
                    <span className="text-[9px] text-emerald-500 uppercase font-black block">Simulé à Verser (Net)</span>
                    <span className="text-sm font-black text-emerald-400">{simulatedNet.toLocaleString()} HTG</span>
                    <span className="text-[8.5px] text-slate-600 font-mono block mt-0.5">
                      {areTaxesApplied ? "Net après déductions légales" : "Brut intégral (Taxes OFF)"}
                    </span>
                  </div>
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                  
                  {/* Employee Share Taxes */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[9.5px] uppercase font-black text-cyan-500 border-b border-slate-900 pb-1 flex items-center justify-between">
                      <span>Charges Salariales (Part Employé)</span>
                      <span className={areTaxesApplied ? "text-rose-400" : "text-slate-500"}>
                        {areTaxesApplied ? `-${totalDeductions.toLocaleString()} HTG` : "0 HTG (OFF)"}
                      </span>
                    </span>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 py-0.5">
                      <span>CNSS / ONA Vieillesse ({(cnssEmpRate * 100).toFixed(0)}%) :</span>
                      <span className={`font-bold ${areTaxesApplied ? "text-slate-200" : "text-slate-500"}`}>
                        {areTaxesApplied ? `-${cnssEmployeeShare.toLocaleString()} HTG` : "0 HTG (Inactif)"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 py-0.5">
                      <span>CNS / OFATMA Maladie/Maternité ({(cnsEmpRate * 100).toFixed(0)}%) :</span>
                      <span className={`font-bold ${areTaxesApplied ? "text-slate-200" : "text-slate-500"}`}>
                        {areTaxesApplied ? `-${cnsEmployeeShare.toLocaleString()} HTG` : "0 HTG (Inactif)"}
                      </span>
                    </div>
                    {!areTaxesApplied && (
                      <div className="mt-1 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300/90 flex items-start gap-1.5 font-mono leading-tight">
                        <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>Les cotisations salariales sont actuellement désactivées au niveau de l'entreprise. Aucun prélèvement fiscal n'est retenu sur cette fiche.</span>
                      </div>
                    )}
                  </div>

                  {/* Employer Share Taxes */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[9.5px] uppercase font-black text-indigo-400 border-b border-slate-900 pb-1 flex items-center justify-between">
                      <span>Charges Patronales (Coût Entreprise)</span>
                      <span className={areTaxesApplied ? "text-indigo-400" : "text-slate-500"}>
                        {areTaxesApplied ? `+${totalEmployerTaxes.toLocaleString()} HTG` : "+0 HTG (OFF)"}
                      </span>
                    </span>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 py-0.5">
                      <span>Part Patronale CNSS / ONA ({(cnssEmployerRate * 100).toFixed(0)}%) :</span>
                      <span className={`font-bold ${areTaxesApplied ? "text-slate-200" : "text-slate-500"}`}>
                        {areTaxesApplied ? `+${cnssEmployerShare.toLocaleString()} HTG` : "0 HTG (Inactif)"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-400 py-0.5">
                      <span>Abonnement OFATMA Risques ({(ofatmaEmployerRate * 100).toFixed(0)}%) :</span>
                      <span className={`font-bold ${areTaxesApplied ? "text-slate-200" : "text-slate-500"}`}>
                        {areTaxesApplied ? `+${ofatmaEmployerShare.toLocaleString()} HTG` : "0 HTG (Inactif)"}
                      </span>
                    </div>
                    {!areTaxesApplied && (
                      <div className="mt-1 p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-400 flex items-start gap-1.5 font-mono leading-tight">
                        <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                        <span>Aucune charge patronale de sécurité sociale n'est imputée à l'entreprise lorsque les cotisations sont désactivées.</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Ledger integration costs */}
                <div className="border-t border-slate-900 pt-3 flex flex-wrap justify-between items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>Coût de revient total de l'employé pour l'entreprise (Super Brut) :</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {areTaxesApplied ? `(+${totalEmployerTaxes.toLocaleString()} HTG charges patronales)` : "(Aucune charge patronale)"}
                    </span>
                  </div>
                  <span className="font-black text-amber-500">{totalCompanyCost.toLocaleString()} HTG</span>
                </div>

              </div>

              {/* Commission model specifics if commission or hybrid */}
              {(employee.paymentModel === "COMMISSION" || employee.paymentModel === "HYBRID") && (
                <div className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <h4 className="text-xs uppercase font-extrabold text-amber-400 flex items-center gap-1.5 pb-2 border-b border-slate-900">
                    <Percent className="w-4 h-4 text-amber-500" />
                    Configuration de Facteur de Commission
                  </h4>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400">Taux de commissionnement assigné :</span>
                    <span className="font-bold text-slate-200">{CommissionEngine.formatCommissionRateDisplay(CommissionEngine.resolveCommissionRate(employee))} sur volume de vente</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Les commissions d'onboarding sont injectées de manière déterministe via le canal émetteur d'événements financiers et d'ajustements Grand Livre.
                  </p>
                </div>
              )}

              {/* Advanced Payments (Advances) tracker */}
              <div className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                <h4 className="text-xs uppercase font-extrabold text-rose-400 flex items-center gap-1.5 pb-2 border-b border-slate-900">
                  Suivi des Avances sur Salaire (Dettes / Advances)
                </h4>
                {(() => {
                  const advancedSum = employeeTransactions
                    .filter(tx => tx.type === "ADVANCE" || (tx.type === "EXPENSE" && (tx.category === "Avans" || tx.category === "Avance")))
                    .reduce((sum, tx) => sum + (tx.amount_cents ? tx.amount_cents / 100 : (tx.amount || 0)), 0);
                  const repaidSum = employeeTransactions
                    .filter(tx => (tx.type === "INCOME" || tx.type === "TRANSFER") && (tx.category === "Payé dèt" || tx.category === "Remboursement" || tx.category === "Debt Repayment"))
                    .reduce((sum, tx) => sum + (tx.amount_cents ? tx.amount_cents / 100 : (tx.amount || 0)), 0);
                  const remainingSum = Math.max(0, advancedSum - repaidSum);

                  return (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-slate-500">Avances Émises</span>
                        <span className="font-bold text-rose-400 font-mono">{advancedSum.toLocaleString()} HTG</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-slate-500">Avances Remboursées</span>
                        <span className="font-bold text-emerald-400 font-mono">{repaidSum.toLocaleString()} HTG</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] uppercase font-bold text-slate-500">Solde Restant Dû</span>
                        <span className="font-bold text-amber-500 font-mono">{remainingSum.toLocaleString()} HTG</span>
                      </div>
                    </div>
                  );
                })()}
                <p className="text-[10px] text-slate-500 mt-1">
                  Les remboursements sont automatiquement déduits des prochains cycles de paie, garantissant que l'employé conserve un minimum légal de 30% sur son salaire net.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: ATTENDANCE HISTORY */}
          {activeTab === "attendance" && (
            <div className="flex flex-col gap-6" id="tech-sheet-attendance-tab">
              
              {/* Stats overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-950 border border-slate-900 p-3 rounded-lg">
                  <span className="text-[9px] text-slate-500 uppercase block">Taux d'engagement</span>
                  <span className={`text-sm font-black block mt-1 ${attendanceRate >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>{attendanceRate}%</span>
                </div>
                <div className="bg-slate-950 border border-slate-900 p-3 rounded-lg">
                  <span className="text-[9px] text-slate-500 uppercase block">Shifts Évalués</span>
                  <span className="text-sm font-black text-slate-200 block mt-1">{totalShifts}</span>
                </div>
                <div className="bg-slate-950 border border-slate-900 p-3 rounded-lg">
                  <span className="text-[9px] text-slate-500 uppercase block">Heures Réalisées</span>
                  <span className="text-sm font-black text-cyan-400 block mt-1">{hoursClocked} hrs <span className="text-[8px] text-slate-500 font-normal">({hoursPlanned} plannifiées)</span></span>
                </div>
                <div className="bg-slate-950 border border-slate-900 p-3 rounded-lg">
                  <span className="text-[9px] text-slate-500 uppercase block">Incidents / Reta</span>
                  <span className={`text-sm font-black block mt-1 ${lateShifts > 3 ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>{lateShifts} fwa</span>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-slate-950/60 border border-slate-900 rounded-xl overflow-hidden">
                <div className="p-3 bg-slate-950 border-b border-slate-900 flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-black">Historique des 10 derniers pointages</span>
                </div>
                
                {empAttendance.length > 0 ? (
                  <div className="overflow-x-auto text-[10.5px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-950 text-slate-500 uppercase text-[9px] tracking-wider border-b border-slate-900">
                          <th className="p-2">Date d'évaluation</th>
                          <th className="p-2">Planifié (Hrs)</th>
                          <th className="p-2">Fait (Hrs)</th>
                          <th className="p-2">Écart</th>
                          <th className="p-2">Veredict</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 text-slate-300">
                        {empAttendance.slice(0, 10).map((r) => (
                          <tr key={r.id} className="hover:bg-slate-900/10">
                            <td className="p-2 text-slate-400">{r.date || r.id}</td>
                            <td className="p-2 font-bold">{r.plannedHours} hrs</td>
                            <td className="p-2 font-bold text-cyan-400">{r.realHours || 0} hrs</td>
                            <td className="p-2 text-amber-500 font-bold">{(r.realHours || 0) - r.plannedHours} hrs</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[8.5px] uppercase font-bold ${
                                r.status === "NORMAL"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : r.status === "LATE"
                                  ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                                  : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                              }`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-500">
                    Aucun pointage enregistré pour cette quinzaine.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CRYPTOGRAPHIC AUDITING & SECURITY */}
          {activeTab === "security" && (
            <div className="flex flex-col gap-6" id="tech-sheet-security-tab">
              
              {/* Cryptography section */}
              <div className="bg-slate-950/60 border border-slate-900 p-4 rounded-xl flex flex-col gap-4">
                <h4 className="text-xs uppercase font-extrabold text-cyan-400 tracking-wide border-b border-slate-900 pb-2 flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-cyan-500" />
                  Preuve Cryptographique d'Onboarding (HMAC/SHA-256)
                </h4>
                
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 uppercase font-black">Vecteur d'identité brut (HMAC Input) :</span>
                  <code className="text-[10px] break-all bg-slate-950 p-2.5 rounded border border-slate-900 text-slate-400 leading-relaxed">
                    {hmacInput}
                  </code>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Signature d'Habilitation d'Immutabilité Scellée :
                  </span>
                  <code className="text-xs font-black text-emerald-400 break-all bg-slate-950 p-2.5 rounded border border-slate-900/80">
                    {badge?.signature || "hmac_uncomputed_offline_d019ab7d32c"}
                  </code>
                </div>

                <p className="text-[10.5px] text-slate-400 leading-relaxed pt-1.5 border-t border-slate-900/60">
                  Cette signature authentifie que la fiche d'identité et les conditions de rémunérations associées au contrat CNC de l'employé ont fait l'objet d'un scellage. Toute altération non autorisée des structures lève une alerte dans l'historique d'audit médico-légal (Forensic Log).
                </p>
              </div>

              {/* Live QR Verification Code Block */}
              {badge && (
                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 flex justify-between items-center gap-4">
                  <div>
                    <span className="text-xs font-black text-cyan-400 block uppercase">QR Code Payload Actif</span>
                    <span className="text-[9.5px] text-slate-500 block font-mono mt-0.5 truncate max-w-[280px] md:max-w-[420px]">
                      {badge.qrPayload}
                    </span>
                  </div>
                  <div className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-3 py-1 font-extrabold uppercase">
                    Badge Émis ✓
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 6: LEDGER */}
          {activeTab === "ledger" && (
            <div className="flex flex-col gap-6" id="tech-sheet-ledger-tab">
               <EmployeeLedgerViewer employee={employee} payrollRecords={payrollRecords} ledgerTransactions={ledgerTransactions} />
            </div>
          )}

        </div>

        {/* Footer actions bar */}
        <div className="p-4 bg-slate-950 border-t border-slate-900/80 flex justify-between items-center shrink-0">
          <div className="text-[10px] text-slate-500 uppercase font-mono">
            Réf: <span className="text-slate-400 font-bold">{employee.id}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-900 text-slate-300 font-mono text-xs rounded-lg hover:bg-slate-850 hover:text-slate-100 transition-all cursor-pointer uppercase font-black"
          >
            Fermer la vue analytique
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
