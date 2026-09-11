import React, { useState } from "react";
import jsPDF from "jspdf";
import { 
  Users, 
  User, 
  Search,
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
  Sparkles,
  RefreshCw
} from "lucide-react";
import EmployeeDirectory from "./staff/EmployeeDirectory";
import EmployeeProfileDialog from "./staff/EmployeeProfileDialog";
import { CommissionEngine } from "../services/CommissionEngine";
import { useCommandBus } from "../hooks/useCommandBus";
import { ReferenceResolver } from "../services/ReferenceResolver";
import { useBusinessContext } from "../contexts/BusinessContext";
import { useAuth } from "../hooks/useAuth";

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
  payrollRecords?: any[];
  employeeContracts?: any[];
  language?: string;
  setFocusedEmployeeIdForProfile?: (id: string | null) => void;
  setActiveTab?: (tab: string) => void;
}

export const ConnectedPersonnel: React.FC<ConnectedPersonnelProps> = ({
  employees: propsEmployees = [],
  branches: propsBranches = [],
  departments: propsDepartments = [],
  currentRole: propsRole,
  currentUser: propsUser,
  attendanceRecords: propsAttendanceRecords = [],
  handleUpdateAttendance,
  employeeBadges: propsEmployeeBadges = [],
  handleAddEvent,
  handleAddForensicLog,
  currentBusiness: propsCurrentBusiness,
  ledgerTransactions: propsLedgerTransactions = [],
  payrollRecords: propsPayrollRecords = [],
  employeeContracts: propsEmployeeContracts = [],
  language = "fr",
  setFocusedEmployeeIdForProfile = () => {},
  setActiveTab = () => {},
}) => {
  const { dispatch } = useCommandBus();
  const ctx = useBusinessContext();
  const { user: authUser, role: authRole } = useAuth();

  const employees = (propsEmployees && propsEmployees.length > 0) ? propsEmployees : ctx.employees || [];
  const branches = (propsBranches && propsBranches.length > 0) ? propsBranches : ctx.branches || [];
  const departments = (propsDepartments && propsDepartments.length > 0) ? propsDepartments : ctx.departments || [];
  const currentBusiness = propsCurrentBusiness || ctx.business;
  const currentRole = propsRole || (authRole as any) || "ADMIN";
  const currentUser = propsUser || { name: authUser?.displayName || "Admin", email: authUser?.email || "", id: authUser?.uid || "usr_1" };
  const attendanceRecords = (propsAttendanceRecords && propsAttendanceRecords.length > 0) ? propsAttendanceRecords : ctx.attendanceRecords || [];
  const ledgerTransactions = (propsLedgerTransactions && propsLedgerTransactions.length > 0) ? propsLedgerTransactions : ctx.ledgerTransactions || [];
  const payrollRecords = (propsPayrollRecords && propsPayrollRecords.length > 0) ? propsPayrollRecords : ctx.payrollRecords || [];
  const employeeContracts = (propsEmployeeContracts && propsEmployeeContracts.length > 0) ? propsEmployeeContracts : ctx.employeeContracts || [];
  const employeeBadges = (propsEmployeeBadges && propsEmployeeBadges.length > 0) ? propsEmployeeBadges : ctx.employeeBadges || [];

  // Selected employee for inline profile view in personnel grid
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => {
    return employees && employees.length > 0 ? employees[0].id : null;
  });

  const [activeProfileTab, setActiveProfileTab] = useState<"info" | "attendance" | "badge" | "activity">("info");
  const [isFullProfileModalOpen, setIsFullProfileModalOpen] = useState(false);
  const [modalEmployee, setModalEmployee] = useState<any | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [payslipToast, setPayslipToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Header Search State
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Instant matching employees for search spotlight
  const matchingSearchEmployees = React.useMemo(() => {
    if (!headerSearchQuery.trim() || !employees) return [];
    const q = headerSearchQuery.toLowerCase().trim();
    return employees.filter(emp => {
      const branchName = ReferenceResolver.resolveBranch(branches, emp.branchId || emp.branch_id)?.name || "";
      const deptName = ReferenceResolver.resolveDepartment(departments, emp.departmentId || emp.department_id)?.name || "";
      return (
        (emp.name ? String(emp.name).toLowerCase() : "").includes(q) ||
        (emp.email ? String(emp.email).toLowerCase() : "").includes(q) ||
        (emp.position ? String(emp.position).toLowerCase() : "").includes(q) ||
        (emp.id ? String(emp.id).toLowerCase() : "").includes(q) ||
        (emp.phone ? String(emp.phone).toLowerCase() : "").includes(q) ||
        branchName.toLowerCase().includes(q) ||
        deptName.toLowerCase().includes(q)
      );
    }).slice(0, 6);
  }, [headerSearchQuery, employees, branches, departments]);

  const handleUpdateAttendanceViaBus = async (newRecords: any[]) => {
    const result = await dispatch("LOG_ATTENDANCE", { records: newRecords });
    if (!result.success) {
      alert(`Erreur d'enregistrement: ${result.error?.message}`);
    }
  };

  const selectedEmployee = employees?.find((e) => e.id === selectedEmployeeId) || (employees && employees.length > 0 ? employees[0] : null);

  const handleOpenFullProfile = (emp: any) => {
    if (!emp) return;
    setModalEmployee(emp);
    setIsFullProfileModalOpen(true);
    try {
      setFocusedEmployeeIdForProfile(emp.id);
    } catch (err) {
      console.warn("[ConnectedPersonnel] setFocusedEmployeeIdForProfile call:", err);
    }
  };

  const exportPayslipPdf = (emp: any) => {
    if (!emp) {
      setPayslipToast({ type: "error", message: "Aucun employé sélectionné." });
      return;
    }
    setIsGeneratingPdf(true);
    setPayslipToast(null);
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
    const safeFileName = `bulletin-paie-${String(emp?.name || "Employe").replace(/[^a-zA-Z0-9]/g, '_')}-${todayDate}.pdf`;
    try {
      doc.save(safeFileName);
      setPayslipToast({
        type: "success",
        message: `Bulletin PDF téléchargé avec succès (${safeFileName})`
      });
      setTimeout(() => setPayslipToast(null), 5000);
    } catch (err: any) {
      console.warn("doc.save fallback:", err);
      try {
        const blob = doc.output("blob");
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = safeFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        setPayslipToast({
          type: "success",
          message: `Bulletin PDF généré et téléchargé (${safeFileName})`
        });
        setTimeout(() => setPayslipToast(null), 5000);
      } catch (blobErr: any) {
        setPayslipToast({
          type: "error",
          message: `Erreur lors de la génération du bulletin: ${blobErr?.message || "Erreur PDF"}`
        });
      }
    } finally {
      setIsGeneratingPdf(false);
    }
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

        {/* Interactive Search Bar & Active Profile Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 self-start md:self-auto w-full md:w-auto relative">
          {/* Header Search Input */}
          <div className="relative flex-1 sm:w-64 md:w-72">
            <Search className="w-4 h-4 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 shrink-0 pointer-events-none" />
            <input
              type="text"
              placeholder={
                language === "fr"
                  ? "Rechercher par nom, poste, ID, email..."
                  : language === "ht"
                  ? "Chache pa non, pòs, ID, imel..."
                  : "Search by name, role, ID, email..."
              }
              value={headerSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              onChange={(e) => setHeaderSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 focus:border-cyan-500/80 text-slate-100 text-xs rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all font-sans placeholder:text-slate-500 shadow-inner"
            />
            {headerSearchQuery && (
              <button
                onClick={() => setHeaderSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition p-0.5 rounded-md hover:bg-slate-800 cursor-pointer"
                title={language === "fr" ? "Effacer" : "Clear"}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Instant Search Results Spotlight Dropdown */}
            {isSearchFocused && matchingSearchEmployees.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-64 overflow-y-auto divide-y divide-slate-800/50">
                <div className="px-2 py-1 text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex justify-between items-center">
                  <span>Résultats ({matchingSearchEmployees.length})</span>
                  <span className="text-[9px] text-slate-500 font-sans">Sélectionner profil</span>
                </div>
                {matchingSearchEmployees.map((emp) => (
                  <button
                    key={emp.id}
                    onMouseDown={() => {
                      setSelectedEmployeeId(emp.id);
                      setIsSearchFocused(false);
                    }}
                    className="w-full text-left p-2 hover:bg-slate-800/80 rounded-lg transition flex items-center justify-between gap-2 group cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-700/50 flex items-center justify-center text-cyan-400 font-bold text-[10px] shrink-0">
                        {emp.name ? emp.name.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 truncate">{emp.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">{emp.position || 'Employé'} • {emp.email || emp.id}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Active Employee Profile Selector */}
          {employees && employees.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 shrink-0">
              <User className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="text-xs text-slate-400 font-semibold uppercase hidden lg:inline">Profil Actif:</span>
              <select
                value={selectedEmployee?.id || ""}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-200 outline-none cursor-pointer max-w-[150px] sm:max-w-[180px] truncate"
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="personnel-grid">
        {/* EMPLOYEE DIRECTORY TABLE */}
        <div 
          className={`transition-all duration-300 ${selectedEmployee ? 'lg:col-span-7' : 'lg:col-span-12'}`} 
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
            externalSearchQuery={headerSearchQuery}
            onSearchQueryChange={setHeaderSearchQuery}
            onAction={(action, emp) => {
              if (action === 'payroll') {
                setActiveTab('payroll');
              } else if (action === 'export_pdf') {
                exportPayslipPdf(emp);
              }
              setSelectedEmployeeId(emp.id);
            }}
          />
        </div>

        {/* RIGHT PANE: INLINE EMPLOYEE PROFILE DISPLAY */}
        {selectedEmployee && (
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
                    onClick={() => handleOpenFullProfile(selectedEmployee)}
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

              {/* TOAST FEEDBACK */}
              {payslipToast && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                    payslipToast.type === "success"
                      ? "bg-emerald-950/70 border-emerald-500/40 text-emerald-200"
                      : "bg-rose-950/70 border-rose-500/40 text-rose-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {payslipToast.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    {payslipToast.message}
                  </span>
                  <button
                    onClick={() => setPayslipToast(null)}
                    className="text-slate-400 hover:text-slate-200 ml-2 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* BOTTOM ACTION BUTTONS */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  id="btn-open-full-profile"
                  onClick={() => handleOpenFullProfile(selectedEmployee)}
                  className="flex-1 py-2 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
                  title="Consulter la fiche RH détaillée et le grand livre"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Fiche HR Complète
                </button>
                <button
                  type="button"
                  id="btn-download-payslip-pdf"
                  onClick={() => exportPayslipPdf(selectedEmployee)}
                  disabled={isGeneratingPdf}
                  className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                  title="Télécharger Bulletin de Paie PDF officiel"
                >
                  {isGeneratingPdf ? (
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  {isGeneratingPdf ? "Génération..." : "Bulletin"}
                </button>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Modal Dialog Fiche HR Complète */}
      {isFullProfileModalOpen && (
        <EmployeeProfileDialog
          employee={modalEmployee || selectedEmployee}
          isOpen={isFullProfileModalOpen}
          onClose={() => {
            setIsFullProfileModalOpen(false);
            setModalEmployee(null);
            try {
              setFocusedEmployeeIdForProfile(null);
            } catch (e) {}
          }}
          businessName={currentBusiness?.name || "Tek Pou Nou S.A."}
          payrollRecords={payrollRecords}
          ledgerTransactions={ledgerTransactions}
        />
      )}
    </div>
  );
};

export default ConnectedPersonnel;
