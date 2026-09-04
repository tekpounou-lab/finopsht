import React, { useState } from "react";
import {
  Building2,
  MapPin,
  CheckCircle2,
  Users,
  Wallet,
  Coins,
  ArrowRight,
  ArrowLeft,
  Briefcase,
  Plus,
  Trash2,
  Languages,
  Sparkles,
  ShieldCheck,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { Business, Branch, Department, Employee, Role } from "../../types";
import { query, collection, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../hooks/useAuth";
import { useIdentity } from "../../modules/identity/IdentityContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BusinessSetupService } from "../../services/business/BusinessSetupService";

interface WizardProps {
  userEmail?: string;
  userName?: string;
  userId?: string;
  onComplete?: (data: {
    business: Business;
    branch: Branch;
    departments: Department[];
    employees: Employee[];
    payrollConfig: any;
  }) => void;
  language?: "fr" | "ht" | "en";
}

const STEP_LABELS = {
  fr: ["Structure", "Première Succursale", "Départements", "Paramètres Paie", "Équipe"],
  ht: ["Estrikti", "Premye Sikisal", "Depatman", "Konfigirasyon Pèy", "Ekip"],
  en: ["Structure", "First Branch", "Departments", "Payroll Laws", "Team Team"],
};

export default function EnterpriseSetupWizard({
  userEmail = "",
  userName = "",
  userId,
  onComplete,
  language = "fr",
}: WizardProps) {
  const { user } = useAuth();
  const { refreshIdentity } = useIdentity();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isInviteChecking, setIsInviteChecking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Enterprise Info
  const [ownerNameState, setOwnerNameState] = useState(userName || user?.displayName || "");
  const [bizName, setBizName] = useState("");
  const [bizNif, setBizNif] = useState("");
  const [bizDomain, setBizDomain] = useState("SaaS Provider");
  const [bizCurrency, setBizCurrency] = useState("HTG");
  const [bizAddress, setBizAddress] = useState("");
  const [bizPhone, setBizPhone] = useState("");

  // Step 2: Branch Info
  const [branchName, setBranchName] = useState("Sikisal Santral");
  const [branchLocation, setBranchLocation] = useState("Pétion-Ville, Port-au-Prince");

  // Step 3: Departments Config
  const [selectedDepts, setSelectedDepts] = useState<string[]>([
    "Accounting",
    "HR",
  ]);
  const predefinedDepts = [
    "Barber Shop",
    "Nail Studio",
    "Accounting",
    "Kitchen",
    "HR",
    "Customer Care",
  ];
  const [customDept, setCustomDept] = useState("");

  // Step 4: Payroll Laws Config
  const [cnssRate, setCnssRate] = useState("6");
  const [cnsRate, setCnsRate] = useState("2");
  const [ofatmaRate, setOfatmaRate] = useState("3");
  const [payCycle, setPayCycle] = useState("BI_WEEKLY");

  // Step 5: Invite initial team
  const [teamInvites, setTeamInvites] = useState<
    { name: string; email: string; baseSalary: number; role: Role }[]
  >([]);
  const [newInviteName, setNewInviteName] = useState("");
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteSalary, setNewInviteSalary] = useState("35000");
  const [newInviteRole, setNewInviteRole] = useState<Role>("EMPLOYEE");

  // Add customized department
  const handleAddDept = () => {
    if (customDept.trim()) {
      if (!selectedDepts.includes(customDept.trim())) {
        setSelectedDepts((prev) => [...prev, customDept.trim()]);
      }
      setCustomDept("");
    }
  };

  // Add invitee
  const handleAddInvite = async () => {
    if (newInviteName.trim() && newInviteEmail.trim()) {
      const emailToValidate = newInviteEmail.trim().toLowerCase();

      if (emailToValidate === userEmail.toLowerCase()) {
        alert("⚠️ L'adresse email de l'invité ne peut pas être la même que celle du propriétaire principal (Admin).");
        return;
      }

      if (teamInvites.some(inv => inv.email.toLowerCase() === emailToValidate)) {
        alert("⚠️ Cet email est déjà présent dans votre liste de membres programmés.");
        return;
      }

      setIsInviteChecking(true);
      try {
        // Query users globally across all businesses
        const qUsers = query(collection(db, "users"), where("email", "==", emailToValidate));
        const snapUsers = await getDocs(qUsers);
        
        // Query employees globally across all businesses
        const qEmployees = query(collection(db, "employees"), where("email", "==", emailToValidate));
        const snapEmployees = await getDocs(qEmployees);

        if (!snapUsers.empty || !snapEmployees.empty) {
          alert(`⚠️ Impossible d'ajouter : L'adresse email ${emailToValidate} est déjà associée à un utilisateur ou employé enregistré dans le système.`);
          setIsInviteChecking(false);
          return;
        }

        // Also check if they have a pending invitation globally in another business
        const qInvites = query(collection(db, "invitations"), where("email", "==", emailToValidate));
        const snapInvites = await getDocs(qInvites);
        const hasPendingOtherInvite = snapInvites.docs.some(doc => {
          const d = doc.data();
          const s = (d.status || d.invitation_status || "").toUpperCase();
          return s === "PENDING";
        });
        if (hasPendingOtherInvite) {
          alert(`⚠️ Impossible d'ajouter : Cet email possède déjà une invitation active dans une autre entreprise.`);
          setIsInviteChecking(false);
          return;
        }

        setTeamInvites((prev) => [
          ...prev,
          {
            name: newInviteName.trim(),
            email: emailToValidate,
            baseSalary: parseInt(newInviteSalary) || 30000,
            role: newInviteRole,
          },
        ]);
        setNewInviteName("");
        setNewInviteEmail("");
        setNewInviteSalary("35000");
        setNewInviteRole("EMPLOYEE");
      } catch (err) {
        console.error("Error validating email in team invitation step:", err);
      } finally {
        setIsInviteChecking(false);
      }
    }
  };

  // CSV Import simulation
  const handleCSVImportSim = () => {
    const mockEmployees = [
      { name: "Jean-Mary Desrosiers", email: "jeanmary@tekpounou.net", baseSalary: 45000, role: "EMPLOYEE" as Role },
      { name: "Carline Gedeon", email: "carline@tekpounou.net", baseSalary: 55000, role: "MANAGER" as Role },
    ];
    setTeamInvites((prev) => [...prev, ...mockEmployees]);
  };

  const handleFinish = async () => {
    if (isSubmitting || isCreating) return;
    if (!bizName.trim()) return;

    // Guard: Prevent multiple business creations if user already has one
    const existingBizId = (user as any)?.businessId || (user as any)?.business_id || (user as any)?.tenantId;
    if (existingBizId && existingBizId !== "none" && existingBizId !== "global") {
      toast.error("Vous appartenez déjà à une entreprise. Redirection vers la salle d'attente...");
      navigate("/waiting-room");
      return;
    }

    setIsSubmitting(true);
    setIsCreating(true);
    try {
      const newBusinessId = "b_" + Math.random().toString(36).substring(2, 9);
      const newBranchId = "br_" + Math.random().toString(36).substring(2, 9);
      const currentUserId = userId || user?.uid;

      const businessData: Business = {
        id: newBusinessId,
        name: bizName.trim(),
        nif: bizNif ? bizNif.trim() : "000-000-000-0",
        domain: bizDomain || "SME",
        status: "PENDING_APPROVAL",
        ownerId: currentUserId,
        currency: (bizCurrency as any) || "HTG"
      };

      const branchData: Branch = {
        id: newBranchId,
        businessId: newBusinessId,
        name: branchName.trim() || "Siège Social",
        location: branchLocation.trim() || "Port-au-Prince",
        isActive: true,
        status: "ACTIVE",
      };

      // Construct departments with unique IDs - strictly camelCase
      const deptObjects: Department[] = selectedDepts.map((d, index) => ({
        id: `d_${newBusinessId}_${index}`,
        businessId: newBusinessId,
        branchId: newBranchId,
        name: d,
        isActive: true,
        status: "ACTIVE",
      }));

      // Construct invited employees - strictly camelCase
      const createdEmployees: Employee[] = [
        // Create owner employee profile too
        {
          id: "e_" + (currentUserId || "owner_" + Math.random().toString(36).substring(2, 9)),
          businessId: newBusinessId,
          branchId: newBranchId,
          departmentId: deptObjects[0]?.id || `d_${newBusinessId}_0`,
          name: ownerNameState.trim() || userName || "Propriétaire",
          displayName: ownerNameState.trim() || userName || "Propriétaire",
          email: userEmail || user?.email || "",
          role: "OWNER",
          position: "Propriétaire / Directeur Général",
          baseSalary: 120000,
          paymentModel: "FIXED",
          contractType: "cdi",
          payRegime: "fixe",
          isActive: true,
          status: "ACTIVE",
          onboardingComplete: true,
        },
        ...teamInvites.map((inv, idx) => ({
          id: `e_inv_${newBusinessId}_${idx}`,
          businessId: newBusinessId,
          branchId: newBranchId,
          departmentId: deptObjects[1]?.id || deptObjects[0]?.id || `d_${newBusinessId}_0`,
          name: inv.name.trim(),
          displayName: inv.name.trim(),
          email: inv.email.toLowerCase().trim(),
          role: inv.role,
          position: "Collaborateur",
          baseSalary: inv.baseSalary || 0,
          paymentModel: "FIXED" as const,
          contractType: "cdi" as const,
          payRegime: "fixe" as const,
          isActive: false,
          status: "PENDING_ACCEPTANCE" as const,
          onboardingComplete: false,
        })),
      ];

      const payload = {
        business: businessData,
        branch: branchData,
        departments: deptObjects,
        employees: createdEmployees,
        payrollConfig: {
          cnssRate: parseFloat(cnssRate) || 6,
          cnsRate: parseFloat(cnsRate) || 2,
          ofatmaRate: parseFloat(ofatmaRate) || 3,
          payCycle,
          currency: bizCurrency,
        },
        userId: currentUserId
      };

      // Persist via BusinessSetupService with strict Zod validation
      await BusinessSetupService.completeOnboarding(payload);

      console.debug("[EnterpriseSetupWizard] Onboarding persisted. Triggering refreshIdentity for UID:", currentUserId);
      if (currentUserId) {
        await refreshIdentity(currentUserId);
      }

      if (onComplete) {
        onComplete(payload);
      }

      toast.success("Entreprise créée avec succès ! Redirection vers la salle d'attente...");
      navigate("/waiting-room");
    } catch (err: any) {
      console.error("[EnterpriseSetupWizard] Erreur lors de la finalisation:", err);
      if (err.message === "BUSINESS_ALREADY_EXISTS") {
        toast.info("Une entreprise est déjà associée à votre compte. Redirection...");
        navigate("/waiting-room");
      } else {
        toast.error(err.message || "Erreur lors de la création de l'entreprise");
      }
    } finally {
      setIsSubmitting(false);
      setIsCreating(false);
    }
  };

  const currentStepLabel = STEP_LABELS[language] || STEP_LABELS.fr;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 font-sans bg-slate-950 text-slate-100 rounded-2xl border border-slate-900 shadow-2xl relative overflow-hidden" id="biz-create-wizard-root">
      {/* Background radial highlight */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header Info */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-5 mb-8" id="wizard-header">
        <div>
          <span className="text-[10px] bg-cyan-950/40 text-cyan-400 font-mono font-bold px-2 py-1 rounded-sm border border-cyan-800/30 uppercase tracking-widest">
            Onboarding Workspace
          </span>
          <h2 className="text-xl md:text-2xl font-black text-slate-100 uppercase tracking-tight font-mono mt-1.5">
            Initialisez Votre Écosystème FinOps
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Établissez votre tenant d'entreprise multi-succursales en Haïti.
          </p>
        </div>
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl hidden md:block">
          <p className="text-[10px] text-slate-500 font-mono">CRÉATEUR EN COURS</p>
          <p className="text-xs font-bold text-slate-350">{userName}</p>
        </div>
      </div>

      {/* Steps Visual Progress Row */}
      <div className="grid grid-cols-5 gap-2 mb-8" id="visual-steps-row">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex flex-col gap-1.5 flex-1">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s <= step
                  ? "bg-cyan-500 shadow-sm shadow-cyan-500/50"
                  : "bg-slate-900"
              }`}
            ></div>
            <span className={`text-[9px] font-bold font-mono uppercase truncate hidden sm:inline ${
              s === step ? "text-cyan-400" : "text-slate-500"
            }`}>
              {s}. {currentStepLabel[s - 1]}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1: BUSINESS STRUCTURE INFO */}
      {step === 1 && (
        <div className="flex flex-col gap-4 animate-fadeIn" id="builder-step1">
          <div className="flex items-center gap-3 border-l-2 border-cyan-500 pl-3 py-1">
            <Building2 className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-slate-200 tracking-wider font-mono">
              Étape 1 : Identité & Cadre Légal de l'Entreprise
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Configurez les détails légaux de l'organisation pour la génération automatique du NIF et rapports CNSS.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Nom du Propriétaire / Fondateur *</label>
              <input
                type="text"
                value={ownerNameState}
                onChange={(e) => setOwnerNameState(e.target.value)}
                placeholder="Ex. Jean Baptiste"
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
                id="biz-owner-name-input"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Nom de l'Entreprise *</label>
              <input
                type="text"
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="Ex. NetShop Haïti S.A."
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
                id="biz-name-input"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">NIF (Numéro de Fisc) *</label>
              <input
                type="text"
                value={bizNif}
                onChange={(e) => setBizNif(e.target.value)}
                placeholder="Ex. 000-123-456-7"
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
                id="biz-nif-input"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Secteur d'Activité</label>
              <select
                value={bizDomain}
                onChange={(e) => setBizDomain(e.target.value)}
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
              >
                <option value="SaaS Provider">Fintech & Services</option>
                <option value="Barber & Spa">Salon de Coiffure & Esthétique</option>
                <option value="Retail">Distribution & Vente</option>
                <option value="Food & Restaurant">Restauration & Cuisine</option>
                <option value="Microfinance">Crédit & Coopération</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Devise Principale</label>
              <select
                value={bizCurrency}
                onChange={(e) => setBizCurrency(e.target.value)}
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
              >
                <option value="HTG">HTG (Gourde Haïtienne)</option>
                <option value="USD">USD (Dollar Américain)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Adresse du Siège Social</label>
              <input
                type="text"
                value={bizAddress}
                onChange={(e) => setBizAddress(e.target.value)}
                placeholder="Ex. 45, Rue Panaméricaine, Pétion-Ville"
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: FIRST BRANCH */}
      {step === 2 && (
        <div className="flex flex-col gap-4 animate-fadeIn" id="builder-step2">
          <div className="flex items-center gap-3 border-l-2 border-cyan-500 pl-3 py-1">
            <MapPin className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-slate-200 tracking-wider font-mono">
              Étape 2 : Votre Première Succursale Opérationnelle
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Puisque FinOps est multi-succursales, vous commencez avec un établissement d'ancrage local.
          </p>

          <div className="grid grid-cols-1 gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Nom de la Succursale</label>
              <input
                type="text"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Ex. Bureau de Delmas / Succursale Sud"
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-mono font-bold uppercase">Localisation / Ville</label>
              <input
                type="text"
                value={branchLocation}
                onChange={(e) => setBranchLocation(e.target.value)}
                placeholder="Ex. Delmas 33, King's Plaza"
                className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono focus:border-cyan-500/70 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: DEPARTMENTS */}
      {step === 3 && (
        <div className="flex flex-col gap-4 animate-fadeIn" id="builder-step3">
          <div className="flex items-center gap-3 border-l-2 border-cyan-500 pl-3 py-1">
            <Briefcase className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-slate-200 tracking-wider font-mono">
              Étape 3 : Structure des Départements
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Attribuez des départements d'affectation pour segmenter intelligemment les rapports financiers et de paie.
          </p>

          <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl mt-2 flex flex-col gap-3">
            <div>
              <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">Départements Sélectionnés :</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedDepts.map((d) => (
                  <span
                    key={d}
                    className="px-2.5 py-1 text-xs border border-cyan-800/40 bg-cyan-950/20 text-cyan-400 rounded-lg flex items-center gap-2 font-mono"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() => setSelectedDepts(selectedDepts.filter((x) => x !== d))}
                      className="text-rose-400 hover:text-rose-300 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <hr className="border-slate-900 my-1" />

            <div>
              <span className="text-[10px] text-slate-500 font-mono uppercase">Suggestions standards du secteur :</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {predefinedDepts
                  .filter((item) => !selectedDepts.includes(item))
                  .map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSelectedDepts((prev) => [...prev, item])}
                      className="px-2 py-0.5 border border-slate-800 hover:border-slate-705 text-[10px] rounded bg-slate-900 hover:bg-slate-850 text-slate-400 font-mono transition"
                    >
                      + {item}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={customDept}
                onChange={(e) => setCustomDept(e.target.value)}
                placeholder="Créer un département personnalisé..."
                className="p-2 rounded bg-slate-950/60 border border-slate-900 text-xs font-mono focus:border-cyan-500/70 focus:outline-none flex-1"
              />
              <button
                type="button"
                onClick={handleAddDept}
                className="px-3 bg-cyan-600 hover:bg-cyan-550 text-slate-950 font-bold text-xs rounded transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: PAYROLL CONFIG */}
      {step === 4 && (
        <div className="flex flex-col gap-4 animate-fadeIn" id="builder-step4">
          <div className="flex items-center gap-3 border-l-2 border-cyan-500 pl-3 py-1">
            <Wallet className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-slate-200 tracking-wider font-mono">
              Étape 4 : Paramétrage Égalitaire FinOps (Lois Sociales)
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Ajustez les pourcentages de cotisations de sécurité sociale d'Haïti appliqués de manière transparente.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-850/80 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] text-slate-300 font-bold font-mono uppercase">Retenue CNSS (%)</span>
              </div>
              <input
                type="number"
                value={cnssRate}
                onChange={(e) => setCnssRate(e.target.value)}
                className="p-2 rounded bg-slate-950 border border-slate-850 text-xs font-mono text-cyan-400"
              />
              <p className="text-[9px] text-slate-500">
                Plafond légal 6% pour les cotisations d'assurance vieillesse.
              </p>
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-850/80 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] text-slate-300 font-bold font-mono uppercase">Prélèvement CNS (%)</span>
              </div>
              <input
                type="number"
                value={cnsRate}
                onChange={(e) => setCnsRate(e.target.value)}
                className="p-2 rounded bg-slate-950 border border-slate-850 text-xs font-mono text-cyan-400"
              />
              <p className="text-[9px] text-slate-500">
                Base habituelle de 2% retenue à la source.
              </p>
            </div>

            <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-850/80 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-slate-300 font-bold font-mono uppercase">OFATMA Employeurs (%)</span>
              </div>
              <input
                type="number"
                value={ofatmaRate}
                onChange={(e) => setOfatmaRate(e.target.value)}
                className="p-2 rounded bg-slate-950 border border-slate-850 text-xs font-mono text-emerald-400"
              />
              <p className="text-[9px] text-slate-500">
                Cotisation patronale 3% d'assurance accident.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-xl mt-2 flex flex-col gap-1.5">
            <span className="text-[10px] text-slate-400 font-mono font-bold uppercase">Fréquence Standard de Paie</span>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <button
                type="button"
                onClick={() => setPayCycle("BI_WEEKLY")}
                className={`p-3 rounded-lg border text-xs font-semibold font-mono tracking-wide flex flex-col gap-1 transition ${
                  payCycle === "BI_WEEKLY"
                    ? "bg-cyan-950/30 border-cyan-500/50 text-cyan-400"
                    : "bg-slate-950 border-slate-900 text-slate-400"
                }`}
              >
                <span>Chaque Quinzaine</span>
                <span className="text-[8px] text-slate-500 uppercase">Double cycle mensuel (standard)</span>
              </button>
              <button
                type="button"
                onClick={() => setPayCycle("MONTHLY")}
                className={`p-3 rounded-lg border text-xs font-semibold font-mono tracking-wide flex flex-col gap-1 transition-all ${
                  payCycle === "MONTHLY"
                    ? "bg-cyan-950/30 border-cyan-500/50 text-cyan-400"
                    : "bg-slate-950 border-slate-900 text-slate-400"
                }`}
              >
                <span>Chaque Mois</span>
                <span className="text-[8px] text-slate-500 uppercase">Cycle unique à terme échu</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: INVITE TEAM */}
      {step === 5 && (
        <div className="flex flex-col gap-4 animate-fadeIn" id="builder-step5">
          <div className="flex items-center gap-3 border-l-2 border-cyan-500 pl-3 py-1">
            <Users className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold uppercase text-slate-200 tracking-wider font-mono">
              Étape 5 : Intégrez et Invitez vos Collaborateurs
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Importez votre liste d'équipe ou tapez quelques adresses pour déployer leurs badges nominatifs d'un clic.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-2">
            {/* Input invite */}
            <div className="md:col-span-5 p-3.5 bg-slate-900/40 border border-slate-900 rounded-xl flex flex-col gap-3">
              <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">Saisie Manuelle</span>

              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={newInviteName}
                  onChange={(e) => setNewInviteName(e.target.value)}
                  placeholder="Nom complet"
                  className="p-2 rounded bg-slate-950 border border-slate-900 text-xs font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  placeholder="Adresse Email"
                  className="p-2 rounded bg-slate-950 border border-slate-900 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <input
                    type="number"
                    value={newInviteSalary}
                    onChange={(e) => setNewInviteSalary(e.target.value)}
                    placeholder="Salaire (HTG)"
                    className="p-2 rounded bg-slate-950 border border-slate-900 text-xs font-mono text-cyan-400"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <select
                    value={newInviteRole}
                    onChange={(e) => setNewInviteRole(e.target.value as Role)}
                    className="p-2 rounded bg-slate-950 border border-slate-900 text-xs font-mono"
                  >
                    <option value="EMPLOYEE">EMPLOYÉ</option>
                    <option value="MANAGER">MANAGER</option>
                    <option value="SUPERVISOR">SUPERVISEUR</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddInvite}
                disabled={isInviteChecking}
                className="w-full mt-1.5 py-2 bg-slate-900 hover:bg-slate-850 text-cyan-400 border border-cyan-800/30 text-xs font-mono font-black uppercase rounded-lg transition-all cursor-pointer disabled:opacity-55"
              >
                {isInviteChecking ? "Vérification..." : "+ Ajouter à la Liste"}
              </button>

              <div className="text-center my-1.5 text-[9px] text-slate-500 font-mono">OU</div>

              <button
                type="button"
                onClick={handleCSVImportSim}
                className="w-full py-2 bg-cyan-900/10 hover:bg-cyan-900/20 text-cyan-400 border border-cyan-500/15 text-[10px] font-mono uppercase rounded flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Simulation Import CSV
              </button>
            </div>

            {/* List to invite */}
            <div className="md:col-span-7 flex flex-col gap-2">
              <span className="text-[10px] text-slate-400 font-bold font-mono uppercase">
                Invitations de Remplacement Planifiées : ({teamInvites.length})
              </span>

              <div className="flex-1 bg-slate-950 border border-slate-900 rounded-xl p-3 h-48 overflow-y-auto flex flex-col gap-2">
                {teamInvites.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-slate-600 font-mono italic">
                    Aucun invité programmé pour l'onboarding initial.
                  </div>
                ) : (
                  teamInvites.map((inv, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-slate-900/40 border border-slate-900 rounded flex items-center justify-between text-xs"
                    >
                      <div className="font-mono text-[11px]">
                        <span className="font-bold text-slate-200">{inv.name}</span>
                        <span className="text-slate-500 block text-[9.5px]">{inv.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-cyan-950 border border-cyan-900 text-cyan-400 rounded">
                          {inv.role}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          {(inv.baseSalary || 0).toLocaleString()} Gourdes
                        </span>
                        <button
                          type="button"
                          onClick={() => setTeamInvites(teamInvites.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-450 p-1"
                          title="Retirer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Navigation Row */}
      <div className="flex justify-between items-center border-t border-slate-900 pt-5 mt-8" id="wizard-navigation-footer">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1 || isSubmitting || isCreating}
          className={`px-4 py-2 border rounded-lg text-xs font-bold font-mono uppercase tracking-wide flex items-center gap-1.5 transition-all cursor-pointer ${
            step === 1 || isSubmitting || isCreating
              ? "border-slate-950 text-slate-700 cursor-not-allowed"
              : "border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200"
          }`}
        >
          <ArrowLeft className="w-4 h-4" /> Précédent
        </button>

        {step < 5 ? (
          <button
            type="button"
            disabled={isSubmitting || isCreating}
            onClick={() => {
              // Simple validation
              if (step === 1 && !bizName.trim()) {
                alert("⚠️ Veuillez saisir le nom de l'entreprise.");
                return;
              }
              setStep((s) => Math.min(5, s + 1));
            }}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-550 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-lg text-xs font-black font-mono uppercase tracking-wide flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-cyan-500/10"
          >
            Suivant <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            id="btn-wizard-finish"
            onClick={handleFinish}
            disabled={isSubmitting || isCreating}
            className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-lg text-xs font-black font-mono uppercase tracking-wide flex items-center gap-1.5 cursor-pointer transition shadow-lg shadow-emerald-500/20"
          >
            {isSubmitting || isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Création et verrouillage en cours...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-slate-950" /> Créer le Workspace <Sparkles className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
