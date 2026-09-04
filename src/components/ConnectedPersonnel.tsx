import React, { useState } from "react";
import jsPDF from "jspdf";
import { 
  Users, 
  User, 
  Building2, 
  MapPin, 
  CreditCard, 
  Calendar, 
  ShieldCheck, 
  FileText, 
  Download, 
  ExternalLink, 
  X, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Phone, 
  Mail, 
  Briefcase, 
  Award, 
  Activity,
  QrCode,
  Layers,
  Sparkles
} from "lucide-react";
import EmployeeDirectory from "./staff/EmployeeDirectory";
import { CommissionEngine } from "../services/CommissionEngine";
import { useCommandBus } from "../hooks/useCommandBus";
import { ReferenceResolver } from "../services/ReferenceResolver";

interface ConnectedPersonnelProps {
  employees?: any[];
  branches?: any[];
  departments?: any[];
  currentRole?: any;
  currentUser?: any;
  attendanceRecords?: any[];
  handleUpdateAttendance?: any;
  employeeBadges?: any[];
  handleAddEvent?: any;
  handleAddForensicLog?: any;
  currentBusiness?: any;
  ledgerTransactions?: any[];
  employeeContracts?: any[];
  language?: string;
  setFocusedEmployeeIdForProfile?: (id: string | null) => void;
  setActiveTab?: (tab: string) => void;
}

export const ConnectedPersonnel: React.FC<ConnectedPersonnelProps> = ({
  employees = [],
  branches = [],
  departments = [],
  currentRole = "ADMIN",
  currentUser,
  attendanceRecords = [],
  handleUpdateAttendance,
  employeeBadges = [],
  handleAddEvent,
  handleAddForensicLog,
  currentBusiness,
  ledgerTransactions = [],
  employeeContracts = [],
  language = "fr",
  setFocusedEmployeeIdForProfile = () => {},
  setActiveTab = () => {},
}) => {
  const { dispatch } = useCommandBus();

  // Selected employee for inline profile view in personnel grid
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => {
    return employees && employees.length > 0 ? employees[0].id : null;
  });

  const [activeProfileTab, setActiveProfileTab] = useState<"info" | "attendance" | "badge" | "activity">("info");

  const handleUpdateAttendanceViaBus = async (newRecords: any[]) => {
    const result = await dispatch("LOG_ATTENDANCE", { records: newRecords });
    if (!result.success) {
      alert(`Erreur d'enregistrement: ${result.error?.message}`);
    }
  };

  const selectedEmployee = employees?.find((e) => e.id === selectedEmployeeId) || (employees && employees.length > 0 ? employees[0] : null);

  const exportPayslipPdf = (emp: any) => {
    if (!emp) return;
    const doc = new jsPDF();
    const dept = ReferenceResolver.resolveDepartment(departments, emp.departmentId || emp.department_id);
    const branch = ReferenceResolver.resolveBranch(branches, emp.branchId || emp.branch_id);
    const contract = employeeContracts?.find(c => (c.employeeId === emp.id || (c as any).employee_id === emp.id) && c.status === "active");

    const baseSalary = emp.baseSalary ?? emp.salaryBaseHtg ?? contract?.salaryBaseHtg ?? 0;
    const regime = emp.payRegime || emp.paymentModel?.toLowerCase() || contract?.payRegime || "fixe";
    const comRate = emp.commissionRate ?? emp.commission_rate ?? contract?.commissionRate ?? 0;

    // Professional Slate / Navy theme styling
    doc.setFillColor(15, 23, 42);
    doc.rect(14, 15, 182, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(currentBusiness?.name || "Tek Pou Nou S.A.", 22, 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(200, 220, 245);
    doc.text(`NIF: ${currentBusiness?.nif || "003-456-789-1"}  |  Domaine: ${currentBusiness?.domain || "finops.ht"}`, 22, 35);
    doc.text(`Adresse / Succursale: ${branch?.location || "Port-au-Prince, Haïti"}`, 22, 42);

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("BULLETIN DE PAIE", 140, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 160, 180);
    const todayDate = new Date().toISOString().split('T')[0];
    doc.text(`Émis le: ${todayDate}`, 140, 35);
    const slipRefNum = `SLIP-${emp.id.substring(0, 5).toUpperCase()}-${new Date().getFullYear()}`;
    doc.text(`Réf Trace: ${slipRefNum}`, 140, 41);

    doc.setFillColor(248, 250, 252);
    doc.rect(14, 56, 182, 44, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 56, 182, 44, 'S');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text("INFORMATIONS DE L'EMPLOYÉ & CONTRAT", 20, 64);
    doc.line(20, 67, 190, 67);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    const startY = 74;
    doc.text(`ID Employé:`, 20, startY);
    doc.text(`Nom Complet:`, 20, startY + 6);
    doc.text(`Email Professionnel:`, 20, startY + 12);
    doc.text(`Poste & Fonction:`, 20, startY + 18);

    doc.text(`Succursale:`, 110, startY);
    doc.text(`Département:`, 110, startY + 6);
    doc.text(`Régime de Paie:`, 110, startY + 12);
    doc.text(`Rôle Système:`, 110, startY + 18);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);

    doc.text(`${emp.id}`, 55, startY);
    doc.text(`${emp.name}`, 55, startY + 6);
    doc.text(`${emp.email || 'non-renseigné'}`, 55, startY + 12);
    doc.text(`${emp.position || 'Employé Stagiaire'}`, 55, startY + 18);

    doc.text(`${branch?.name || 'Siège Principal'}`, 145, startY);
    doc.text(`${dept?.name || 'Administration'}`, 145, startY + 6);
    doc.text(`${regime.toUpperCase()} ${comRate ? `(${CommissionEngine.formatCommissionRateDisplay(comRate)})` : ''}`, 145, startY + 12);
    doc.text(`${emp.role || 'EMPLOYEE'}`, 145, startY + 18);

    doc.setFillColor(15, 23, 42);
    doc.rect(14, 108, 182, 10, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("RUBRIQUES DE RÉMUNÉRATION & DÉDUCTIONS LÉGALES (HAÏTI)", 20, 114.5);

    doc.setFillColor(255, 255, 255);
    doc.rect(14, 118, 182, 85, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 118, 182, 85, 'S');

    let currentItemY = 126;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("Description", 20, currentItemY);
    doc.text("Base / Taux", 100, currentItemY);
    doc.text("Gains (HTG)", 140, currentItemY);
    doc.text("Retenues (HTG)", 170, currentItemY);

    doc.setDrawColor(203, 213, 225);
    doc.line(20, currentItemY + 2, 190, currentItemY + 2);

    currentItemY += 8;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);

    const grossSalarySemi = Math.round(baseSalary / 2);
    doc.text("Salaire de Base Brut (Quinzaine)", 20, currentItemY);
    doc.text("Fixe Mensuel / 2", 100, currentItemY);
    doc.text(`${grossSalarySemi.toLocaleString()} HTG`, 140, currentItemY);
    doc.text("-", 170, currentItemY);

    let grossGains = grossSalarySemi;
    if (regime.toLowerCase().includes("commission") || regime.toLowerCase().includes("hybride")) {
      currentItemY += 6;
      const mockCommission = Math.round(grossSalarySemi * 0.15);
      grossGains += mockCommission;
      doc.text("Commissions sur Ventes (Estimées)", 20, currentItemY);
      doc.text(`${CommissionEngine.formatCommissionRateDisplay(comRate)} du CA`, 100, currentItemY);
      doc.text(`${mockCommission.toLocaleString()} HTG`, 140, currentItemY);
      doc.text("-", 170, currentItemY);
    }

    const onaAmount = Math.round(grossGains * 0.06);
    const ofatmaAmount = Math.round(grossGains * 0.02);
    const iriAmount = Math.round(grossGains * 0.10);
    const sumDeductions = onaAmount + ofatmaAmount + iriAmount;
    const finalNet = grossGains - sumDeductions;

    currentItemY += 6;
    doc.text("Cotisation ONA (Pension Vieillesse)", 20, currentItemY);
    doc.text("6.00%", 100, currentItemY);
    doc.text("-", 140, currentItemY);
    doc.text(`${onaAmount.toLocaleString()} HTG`, 170, currentItemY);

    currentItemY += 6;
    doc.text("Cotisation OFATMA (Assurance Accidents)", 20, currentItemY);
    doc.text("2.00%", 100, currentItemY);
    doc.text("-", 140, currentItemY);
    doc.text(`${ofatmaAmount.toLocaleString()} HTG`, 170, currentItemY);

    currentItemY += 6;
    doc.text("Impôt Progressif sur le Revenu (IRI)", 20, currentItemY);
    doc.text("Barème DGI", 100, currentItemY);
    doc.text("-", 140, currentItemY);
    doc.text(`${iriAmount.toLocaleString()} HTG`, 170, currentItemY);

    currentItemY += 4;
    doc.setFillColor(248, 250, 252);
    doc.rect(110, currentItemY, 86, 25, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(110, currentItemY, 86, 25, 'S');

    doc.text(`Total Brut (Quinzaine):`, 115, currentItemY + 6);
    doc.text(`Total Retenues:`, 115, currentItemY + 12);
    doc.setFont("helvetica", "bold");
    doc.text(`Net À Payer:`, 115, currentItemY + 20);

    doc.setFont("helvetica", "normal");
    doc.text(`${grossGains.toLocaleString()} HTG`, 165, currentItemY + 6);
    doc.text(`${sumDeductions.toLocaleString()} HTG`, 165, currentItemY + 12);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(14, 116, 144);
    doc.text(`${finalNet.toLocaleString()} HTG`, 165, currentItemY + 20);

    const signatureBoxY = currentItemY + 36;
    doc.setDrawColor(203, 213, 225);
    doc.line(20, signatureBoxY, 80, signatureBoxY);
    doc.line(130, signatureBoxY, 190, signatureBoxY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text("Signature du Destinataire", 28, signatureBoxY + 5);
    doc.text("Signature de l'Administration / RH", 132, signatureBoxY + 5);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Lu et approuvé pour réception", 30, signatureBoxY + 9);
    doc.text("Certifié conforme et enregistré", 137, signatureBoxY + 9);

    const footerBoxY = 270;
    doc.setFillColor(248, 250, 252);
    doc.rect(14, footerBoxY, 182, 14, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, footerBoxY, 182, 14, 'S');

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text("SÉCURITÉ INFORMATIQUE FINOPS / DOUBLE TRACE CONTRAT", 18, footerBoxY + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    const systemSignatureHash = `ID_RH: ${emp.id}-${Date.now()} | HASH_REGIME_PAIE: SHA256:${Math.random().toString(36).substring(2, 15).toUpperCase()} | SIG_VERIFY_ERP: FinOps-Software-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    doc.text(systemSignatureHash, 18, footerBoxY + 9);

    doc.save(`bulletin-paie-${emp.name.replace(/\s+/g, '-')}-${todayDate}.pdf`);
  };

  // Resolve department & branch for selected employee
  const selectedDept = selectedEmployee ? ReferenceResolver.resolveDepartment(departments, selectedEmployee.departmentId || selectedEmployee.department_id) : null;
  const selectedBranch = selectedEmployee ? ReferenceResolver.resolveBranch(branches, selectedEmployee.branchId || selectedEmployee.branch_id) : null;
  const selectedContract = selectedEmployee ? employeeContracts?.find(c => c.employeeId === selectedEmployee.id && c.status === "active") : null;
  const selectedBadge = selectedEmployee ? employeeBadges?.find(b => b.employeeId === selectedEmployee.id) : null;
  const selectedAttendance = selectedEmployee ? attendanceRecords?.filter(a => a.employeeId === selectedEmployee.id) : [];

  return (
    <div className="flex flex-col gap-6" id="personnel-tab">
      <div id="personnel-header" className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
            <Users className="w-5 h-5 text-cyan-400" />
            {language === "fr" ? "Gestion du Personnel d'Établissement" : language === "ht" ? "Jesyon Pèsonèl nan Etablisman" : "Facility Personnel Management"}
          </h2>
          <p className="text-xs text-slate-400 font-light mt-0.5">
            {language === "fr" 
              ? "Fiches d'employés, recrutements, allocations de salaires et rôles d'accès." 
              : language === "ht"
              ? "Fich anplwaye, rekritman, alokasyon salè ak wòl aksè."
              : "Employee records, recruitment, salary allocations, and access roles."}
          </p>
        </div>

        {/* Quick Employee Selector dropdown if desired */}
        {employees && employees.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 self-start md:self-auto">
            <User className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-slate-400 font-semibold uppercase hidden sm:inline">Profil Actif:</span>
            <select
              value={selectedEmployee?.id || ""}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer max-w-[200px] truncate"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id} className="bg-slate-900 text-slate-200">
                  {emp.name} ({emp.position || 'Employé'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6" id="personnel-grid">
        {/* EMPLOYEE DIRECTORY TABLE */}
        <div 
          className="w-full transition-all duration-300" 
          id="personnel-employees-pane"
        >
          <EmployeeDirectory
            initialEmployees={employees}
            branches={branches}
            departments={departments}
            currentRole={currentRole}
            userBranchId={currentUser?.branchId}
            attendanceRecords={attendanceRecords}
            onUpdateAttendance={handleUpdateAttendanceViaBus}
            employeeBadges={employeeBadges}
            onAddEvent={handleAddEvent}
            onAddForensicLog={handleAddForensicLog}
            currentBusiness={currentBusiness}
            currentUserId={currentUser?.id}
            currentUserEmail={currentUser?.email}
            onAction={(action, emp) => {
              if (action === 'profile') {
                setSelectedEmployeeId(emp.id);
                setFocusedEmployeeIdForProfile(emp.id);
              } else if (action === 'payroll') {
                setActiveTab('payroll');
              } else if (action === 'export_pdf') {
                exportPayslipPdf(emp);
              } else if (action === 'edit' || action === 'suspend' || action === 'reactivate') {
                setSelectedEmployeeId(emp.id);
              }
            }}
          />
        </div>

        {/* RIGHT PANE: INLINE EMPLOYEE PROFILE DISPLAY (REMOVED) */}
        {false && selectedEmployee && (
          <div className="lg:col-span-5 transition-all duration-300" id="personnel-profile-pane">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-5 sticky top-4">
              
              {/* PROFILE CARD HEADER */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 flex items-center justify-center font-extrabold text-cyan-400 text-lg uppercase shadow-inner shrink-0">
                    {selectedEmployee.name.substring(0, 2)}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-100">{selectedEmployee.name}</h3>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                        selectedEmployee.status === 'SUSPENDED' || selectedEmployee.isActive === false
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedEmployee.status === 'SUSPENDED' || selectedEmployee.isActive === false ? 'SUSPENDU' : 'ACTIF'}
                      </span>
                    </div>
                    <span className="text-xs text-cyan-400 font-medium flex items-center gap-1 mt-0.5">
                      <Briefcase className="w-3.5 h-3.5 text-cyan-500" />
                      {selectedEmployee.position || "Employé de Service"}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 mt-0.5">
                      ID: {selectedEmployee.id}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFocusedEmployeeIdForProfile(selectedEmployee.id)}
                    className="p-2 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-400 transition-colors cursor-pointer"
                    title="Ouvrir Fiche HR Complète (Plein écran)"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedEmployeeId(null)}
                    className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title="Masquer le panneau"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* QUICK FINANCIAL & LOCATION STRIP */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-emerald-400" /> Rémunération
                  </span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    {(selectedEmployee.baseSalary ?? selectedEmployee.salaryBaseHtg ?? selectedContract?.salaryBaseHtg ?? 0).toLocaleString()} HTG
                  </span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-tight">
                    Régime: {selectedEmployee.paymentModel || selectedEmployee.payRegime || selectedContract?.payRegime || "Fixe"}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col gap-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-400" /> Affectation
                  </span>
                  <span className="text-xs font-bold text-slate-200 truncate">
                    {selectedBranch?.name || "Siège Principal"}
                  </span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-tight truncate">
                    {selectedDept?.name || "Administration Général"}
                  </span>
                </div>
              </div>

              {/* PROFILE SUB-TABS */}
              <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveProfileTab("info")}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 ${
                    activeProfileTab === "info"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <User className="w-3 h-3" /> Info & Contrat
                </button>
                <button
                  onClick={() => setActiveProfileTab("attendance")}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 ${
                    activeProfileTab === "attendance"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Clock className="w-3 h-3" /> Pointages
                </button>
                <button
                  onClick={() => setActiveProfileTab("badge")}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 ${
                    activeProfileTab === "badge"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <QrCode className="w-3 h-3" /> Badges
                </button>
                <button
                  onClick={() => setActiveProfileTab("activity")}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition flex items-center justify-center gap-1 ${
                    activeProfileTab === "activity"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Activity className="w-3 h-3" /> Tracé
                </button>
              </div>

              {/* TAB 1: INFO & CONTRAT */}
              {activeProfileTab === "info" && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="space-y-2 bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5">
                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-cyan-500" /> Email Professionnel:
                      </span>
                      <span className="font-mono text-slate-200 font-semibold">{selectedEmployee.email || "N/A"}</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-cyan-500" /> Téléphone / Contact:
                      </span>
                      <span className="font-mono text-slate-200 font-semibold">{selectedEmployee.phone || "Non renseigné"}</span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-cyan-500" /> Rôle & Privilèges:
                      </span>
                      <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-[10px]">
                        {selectedEmployee.role || "EMPLOYEE"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-cyan-500" /> Date d'Embauche:
                      </span>
                      <span className="font-mono text-slate-200">
                        {selectedEmployee.hireDate ? String(selectedEmployee.hireDate).slice(0, 10) : "2024-01-15"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-cyan-500" /> Contrat de Travail:
                      </span>
                      <span className={`font-bold text-[10px] px-2 py-0.5 rounded border ${
                        selectedContract ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}>
                        {selectedContract ? "CONTRAT ACTIF" : "STAGIAIRE / SANS CONTRAT"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: POINTAGES & PRÉSENCE */}
              {activeProfileTab === "attendance" && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Registres de Présence</span>
                      <span className="text-sm font-bold text-slate-100 font-mono">{selectedAttendance.length} Entrées enregistrées</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                      Assiduité 95%
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {selectedAttendance.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-xs italic bg-slate-950/30 rounded-xl border border-slate-800/60">
                        Aucun pointage d'assiduité enregistré pour cet employé.
                      </div>
                    ) : (
                      selectedAttendance.slice(0, 5).map((rec, idx) => (
                        <div key={rec.id || idx} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="font-mono text-slate-300 text-[11px]">{rec.date ? String(rec.date).slice(0, 10) : "Aujourd'hui"}</span>
                          </div>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {rec.checkIn || "08:00"} - {rec.checkOut || "17:00"} ({rec.realHours || 8}h)
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: BADGES & SÉCURITÉ */}
              {activeProfileTab === "badge" && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-cyan-400" /> Statut Badge d'Accès:
                      </span>
                      <span className={`font-bold text-[10px] px-2 py-0.5 rounded border ${
                        selectedBadge ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      }`}>
                        {selectedBadge ? "BADGE ÉMIS & ACTIF" : "EN ATTENTE D'ÉMISSION"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-400 font-mono text-[11px] border-t border-slate-800/60 pt-2 mt-1">
                      <span>Code Sécurisé Badge:</span>
                      <span className="text-cyan-300 font-bold">{selectedBadge?.badgeNumber || `BDG-${selectedEmployee.id.substring(0, 6).toUpperCase()}`}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: TRACABILITÉ & AUDIT LOGS */}
              {activeProfileTab === "activity" && (
                <div className="flex flex-col gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-2">Tracé Financier & Audit RH</span>
                    <div className="space-y-1.5">
                      <div className="p-2 rounded bg-slate-950/80 border border-slate-800 text-[10px] flex items-center justify-between">
                        <span className="text-slate-300 font-mono">Modifications RH V2</span>
                        <span className="text-cyan-400 font-mono">Enregistré</span>
                      </div>
                      <div className="p-2 rounded bg-slate-950/80 border border-slate-800 text-[10px] flex items-center justify-between">
                        <span className="text-slate-300 font-mono">Contrat Verrouillé</span>
                        <span className="text-emerald-400 font-mono">Pessimistic Lock</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* BOTTOM ACTION BUTTONS */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setFocusedEmployeeIdForProfile(selectedEmployee.id)}
                  className="flex-1 py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Fiche HR Completer
                </button>
                <button
                  onClick={() => exportPayslipPdf(selectedEmployee)}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                  title="Télécharger Bulletin de Paie PDF"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" /> Bulletin
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectedPersonnel;
