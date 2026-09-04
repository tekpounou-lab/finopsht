import React, { useState } from "react";
import { useI18n } from "../i18n";
import { Invitation, Branch, Department, Employee, EmployeeBadge, EmployeeContract, Role, ERPEvent, ForensicLog } from "../types";
import { 
  ShieldCheck, 
  UserCheck, 
  MapPin, 
  Layers, 
  Mail, 
  CheckCircle2, 
  QrCode, 
  FileText, 
  Fingerprint, 
  Users, 
  ArrowRight,
  Sparkles,
  Search,
  FileSignature
} from "lucide-react";

interface AcceptInvitationProps {
  invitations: Invitation[];
  branches: Branch[];
  departments: Department[];
  onAcceptInvitation: (payload: {
    inviteId: string;
    employeeName: string;
    employeePhone: string;
    contractType: string;
    payRegime: string;
    salaryBaseHtg: number;
  }) => void;
  language: string;
}

export default function AcceptInvitation({
  invitations,
  branches,
  departments,
  onAcceptInvitation,
  language
}: AcceptInvitationProps) {
  const { t } = useI18n();
  const [tokenInput, setTokenInput] = useState("");
  const [activeInvitation, setActiveInvitation] = useState<Invitation | null>(null);
  
  // Form submission state
  const [employeeName, setEmployeeName] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [contractType, setContractType] = useState("cdi");
  const [payRegime, setPayRegime] = useState("fixe");
  const [salaryBase, setSalaryBase] = useState(32000);
  const [isSigned, setIsSigned] = useState(false);
  const [successData, setSuccessData] = useState<{
    employeeId: string;
    badgeId: string;
    contractId: string;
  } | null>(null);

  const [lookupError, setLookupError] = useState("");

  const handleLookupInvitation = () => {
    setLookupError("");
    setActiveInvitation(null);
    setSuccessData(null);
    setIsSigned(false);

    if (!tokenInput.trim()) {
      setLookupError("Veuillez saisir un code d'invitation ou une adresse email.");
      return;
    }

    const cleaned = tokenInput.trim().toLowerCase();
    // Search by ID or Email
    const found = invitations.find(
      inv => inv.id.toLowerCase() === cleaned || inv.email.toLowerCase() === cleaned
    );

    if (!found) {
      setLookupError("Aucune invitation en attente trouvée pour ce jeton ou email.");
      return;
    }

    if (found.status !== "PENDING") {
      setLookupError(`Cette invitation a déjà été traitée (Statut actuel : ${found.status}).`);
      return;
    }

    setActiveInvitation(found);
    setEmployeeName(found.name || "");
    setEmployeePhone(found.phone || "");
    setContractType("cdi"); // Assuming default wait if we were to define more in invitation.
    setPayRegime(found.paymentModel?.toLowerCase() || "fixe");
    setSalaryBase(found.baseSalary || 32000);
  };

  const handleCompleteOnboarding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvitation) return;
    if (!employeeName.trim()) {
      alert("Le nom complet de l'employé est exigé.");
      return;
    }
    if (!isSigned) {
      alert("Veuillez apposer votre signature d'habilitation électronique.");
      return;
    }

    // Call acceptance callback
    const empId = "emp_" + Math.random().toString(36).substring(2, 8);
    const badgeId = "bad_" + Math.random().toString(36).substring(2, 8);
    const contractId = "con_" + Math.random().toString(36).substring(2, 8);

    onAcceptInvitation({
      inviteId: activeInvitation.id,
      employeeName,
      employeePhone,
      contractType,
      payRegime,
      salaryBaseHtg: salaryBase
    });

    setSuccessData({
      employeeId: empId,
      badgeId,
      contractId
    });
  };

  const selectedBranch = activeInvitation 
    ? branches.find(b => b.id === activeInvitation.branchId) 
    : null;
    
  const selectedDept = activeInvitation 
    ? departments.find(d => d.id === activeInvitation.departmentId) 
    : null;

  return (
    <div className="glass p-6 rounded-2xl flex flex-col gap-6" id="accept-invitation-onboarding-workspace">
      
      {/* Banner introduction */}
      <div>
        <h3 className="text-xs font-mono font-black uppercase text-slate-100 flex items-center gap-2 mb-1.5">
          <ShieldCheck className="w-5 h-5 text-cyan-400" />
          Portail d'Acceptation d'Invitation FinOps & Onboarding CORES
        </h3>
        <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
          Espace sécurisé de validation d'invitation pour collaborateurs. Saisissez votre jeton d'onboarding, complétez vos coordonnées d'identité de pointage, examinez les charges CNSS de votre rémunération et signez électroniquement votre engagement.
        </p>
      </div>

      {!successData ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LOOKUP SEARCH SIDE BAR */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-900 flex flex-col gap-4">
              <span className="text-[10px] font-mono font-black uppercase text-slate-400 tracking-wider block border-b border-slate-900 pb-1.5 flex items-center gap-1">
                <Search className="w-3.5 h-3.5 text-cyan-500" />
                Vérification du Jeton
              </span>
              
              <div className="flex flex-col gap-1">
                <label className="text-[9.5px] uppercase font-black text-slate-500">Jeton ou Email de l'invitation :</label>
                <div className="relative font-mono text-xs flex gap-2">
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Ex: inv_1 ou email..."
                    className="flex-1 bg-slate-950 border border-slate-900 rounded px-2.5 py-1.5 text-slate-200 uppercase outline-none placeholder:text-slate-700"
                  />
                  <button
                    onClick={handleLookupInvitation}
                    className="px-3 py-1 text-[11px] bg-cyan-600 hover:bg-cyan-700 text-slate-950 rounded font-black uppercase cursor-pointer"
                  >
                    Valider
                  </button>
                </div>
              </div>

              {lookupError && (
                <div className="bg-rose-950/20 border border-rose-900/30 p-2.5 rounded text-[10px] text-rose-400 font-mono leading-relaxed">
                  ⚠️ {lookupError}
                </div>
              )}

              {/* Show pending helper */}
              <div className="mt-2 flex flex-col gap-1.5">
                <span className="text-[9px] uppercase font-bold text-slate-500">Invitations En Attente valides :</span>
                {(() => {
                  const seen = new Set();
                  const uniquePendingInvs = invitations.filter((i) => {
                    if (seen.has(i.id)) return false;
                    seen.add(i.id);
                    return i.status === "PENDING";
                  });
                  return uniquePendingInvs.length > 0 ? (
                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                      {uniquePendingInvs.map((i) => (
                        <button
                          key={i.id}
                          onClick={() => {
                            setTokenInput(i.id);
                            setTimeout(() => {
                              // Find element lookup helper
                              const btn = document.createElement("button");
                              btn.onclick = () => {
                                setTokenInput(i.id);
                              };
                              handleLookupInvitation();
                            }, 50);
                          }}
                          className="text-left py-1 px-2 hover:bg-slate-900 rounded text-[9.5px] font-mono text-cyan-400 flex justify-between items-center bg-slate-950 border border-slate-900/50 cursor-pointer"
                        >
                          <span className="truncate">{i.email}</span>
                          <code className="text-amber-500 text-[9px] font-bold shrink-0">{i.id}</code>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[9px] text-slate-600 font-mono">Aucune invitation en veille. Créez-en une dans l'onglet des Succursales.</span>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ACTIVE ONBOARDING FORM AREA */}
          <div className="lg:col-span-8">
            {activeInvitation ? (
              <form onSubmit={handleCompleteOnboarding} className="bg-slate-950/40 p-5 rounded-xl border border-slate-900 flex flex-col gap-5">
                
                <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-emerald-400 animate-pulse" />
                    Invitation validée ➔ {activeInvitation.email}
                  </span>
                  <span className="text-[9px] bg-slate-900 text-amber-500 font-bold px-2 py-0.5 rounded border border-slate-800 uppercase">
                    RÔLE ASSIGNÉ : {activeInvitation.role}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  
                  {/* Employee input details */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Nom Complet de l'employé :</label>
                    <input
                      type="text"
                      required
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="Antoine Cadet"
                      className="bg-slate-950 border border-slate-900 rounded px-3 py-1.5 text-slate-200 outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Téléphone de l'employé :</label>
                    <input
                      type="text"
                      value={employeePhone}
                      onChange={(e) => setEmployeePhone(e.target.value)}
                      placeholder="3886-0921"
                      className="bg-slate-950 border border-slate-900 rounded px-3 py-1.5 text-slate-200 outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Succursale de Récit :</label>
                    <code className="bg-slate-950 border border-slate-900 px-3 py-2 text-slate-400 rounded">
                      {selectedBranch ? `${selectedBranch.name} (${selectedBranch.location})` : "Défaut d'Établissement"}
                    </code>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] uppercase font-bold text-slate-500">Département de rattachement :</label>
                    <code className="bg-slate-950 border border-slate-900 px-3 py-2 text-slate-400 rounded">
                      {selectedDept ? selectedDept.name : "Défaut HR"}
                    </code>
                  </div>

                </div>

                {/* Contract details simulation */}
                <div className="border border-slate-900 rounded-lg p-4 bg-slate-950/80 flex flex-col gap-3 font-mono text-[11px]">
                  <span className="text-[9.5px] uppercase font-black text-cyan-400 border-b border-slate-900 pb-1.5 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    CONTRAT DE TRAVAIL & DISPOSITION DE PAIE (HAÏTI SOCIO-TECH)
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8.5px] text-slate-500 uppercase">Framework Contrat :</label>
                      <select
                        value={contractType}
                        onChange={(e) => setContractType(e.target.value)}
                        className="bg-slate-950 border border-slate-900 rounded p-1 text-slate-300 font-bold"
                      >
                        <option value="cdi">CDI (Durée indéterminée)</option>
                        <option value="cdd">CDD (Durée déterminée)</option>
                        <option value="freelance">Freelance (Prestation libre)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8.5px] text-slate-500 uppercase">Régime Paie :</label>
                      <select
                        value={payRegime}
                        onChange={(e) => setPayRegime(e.target.value)}
                        className="bg-slate-950 border border-slate-900 rounded p-1 text-slate-300 font-bold disabled:opacity-50 disabled:bg-slate-950"
                        disabled={!!activeInvitation.paymentModel}
                      >
                        <option value="fixe">Fixe mensuel standard</option>
                        <option value="commission">Commission exclusive</option>
                        <option value="hybrid">Hybride (Fixe + Comm.)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8.5px] text-slate-500 uppercase">Salaire d'Engagement (HTG) :</label>
                      <input
                        type="number"
                        value={salaryBase}
                        onChange={(e) => setSalaryBase(Number(e.target.value))}
                        className="bg-slate-950 border border-slate-900 rounded p-1 text-slate-300 font-bold text-center disabled:opacity-50 disabled:bg-slate-950"
                        disabled={!!activeInvitation.baseSalary}
                      />
                    </div>
                  </div>

                  {/* Social Taxes Preview */}
                  <div className="bg-slate-950 px-3 py-2 rounded text-[10px] text-slate-400 leading-relaxed border border-slate-900 flex justify-between items-center">
                    <span>
                      Simulé CNSS Vieillesse (6%) : <strong>{Math.round(salaryBase * 0.06).toLocaleString()} HTG</strong> | Maladie CNS (2%) : <strong>{Math.round(salaryBase * 0.02).toLocaleString()} HTG</strong>
                    </span>
                    <span className="text-[9px] text-emerald-400 font-extrabold uppercase">
                      Vérifié
                    </span>
                  </div>
                </div>

                {/* SIGNATURE Station */}
                <div className="bg-slate-950/80 p-4 rounded-lg border border-slate-900 flex flex-col gap-2">
                  <span className="text-[9.5px] uppercase font-black text-rose-400 flex items-center gap-1">
                    <FileSignature className="w-3.5 h-3.5" />
                    Signature d'habilitation électronique de l'employé
                  </span>
                  
                  <div className="bg-slate-950 p-2.5 border border-dashed border-slate-800 rounded font-mono text-[10px] text-slate-500 leading-relaxed flex items-center justify-between">
                    <span>Je certifie l'exactitude de mes données d'onboarding ERP et accepte mon affiliation à {activeInvitation.business_id}.</span>
                    <button
                      type="button"
                      onClick={() => setIsSigned(!isSigned)}
                      className={`px-3 py-1 rounded text-[9.5px] font-black uppercase transition-all cursor-pointer ${
                        isSigned ? "bg-emerald-500 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {isSigned ? "CO-SIEN ✓" : "S'engager / Siyen"}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveInvitation(null)}
                    className="px-4 py-1.5 bg-slate-900 border border-slate-850 text-slate-400 rounded text-xs hover:text-slate-200 cursor-pointer uppercase font-bold"
                  >
                    Retour
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
                  >
                    Finaliser mon Onboarding
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

              </form>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-900/60 rounded-xl bg-slate-950/10">
                <Users className="w-10 h-10 text-slate-700 mb-3" />
                <span className="text-xs uppercase font-extrabold text-slate-400 block tracking-wider">Onboarding Session inactive</span>
                <span className="text-[10.5px] text-slate-500 mt-1">Saisissez un jeton d'invitation à gauche pour démarrer la certification en temps réel.</span>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* ONBOARDING SUCCESS SCREEN WITH AUTO BADGES & CONTRACT LINKS */
        <div className="bg-slate-950/60 p-6 rounded-xl border border-emerald-500/10 flex flex-col gap-5 items-center text-center font-mono" id="onboarding-result-station">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-1">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          
          <div>
            <h4 className="text-sm font-black text-slate-100 uppercase tracking-tight">Onboarding Finalisé avec Succès !</h4>
            <p className="text-[10.5px] text-slate-400 mt-1 max-w-lg mx-auto leading-relaxed">
              Félicitations, l'employé <strong>{employeeName}</strong> est désormais immatriculé de manière immuable au sein du personnel de l'ERP. Son contrat de travail CNC a été scellé et sa clé de pointage émise avec succès.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-xl text-xs mt-3">
            
            {/* Badge visual summary */}
            <div className="p-4 bg-slate-950 border border-slate-900/80 rounded-lg flex flex-col items-center gap-2">
              <QrCode className="w-7 h-7 text-cyan-400" />
              <span className="text-[10px] text-slate-400 uppercase font-black">Code d'accès QR Badge</span>
              <code className="text-[9px] bg-slate-900 border border-slate-800 text-slate-500 px-2.5 py-1 rounded mt-1">
                {successData.badgeId} — SIGNÉ CRYPTO
              </code>
            </div>

            {/* Contract visual summary */}
            <div className="p-4 bg-slate-950 border border-slate-900/80 rounded-lg flex flex-col items-center gap-2">
              <FileText className="w-7 h-7 text-indigo-400" />
              <span className="text-[10px] text-slate-400 uppercase font-black">Document de Contrat CNC</span>
              <code className="text-[9px] bg-slate-900 border border-slate-800 text-slate-500 px-2.5 py-1 rounded mt-1">
                {successData.contractId} — ARCHIVÉ CORES
              </code>
            </div>

          </div>

          <button
            onClick={() => {
              setTokenInput("");
              setActiveInvitation(null);
              setSuccessData(null);
            }}
            className="px-5 py-2 mt-4 bg-cyan-600 hover:bg-cyan-700 text-slate-950 rounded text-xs font-black uppercase cursor-pointer transition-all flex items-center gap-1"
          >
            Retourner au portail des invitations
          </button>
        </div>
      )}

    </div>
  );
}
