import React from "react";
import { FileText, Award, Calendar, Download, Briefcase, ChevronRight, ShieldCheck, DollarSign } from "lucide-react";
import { Employee, EmployeeContract } from "../../../types";

interface MyEmploymentSectionProps {
  employee: Employee;
  contract?: EmployeeContract;
  employeeContracts: EmployeeContract[];
  deptName: string;
  branchName: string;
  tw: any;
}

export const MyEmploymentSection: React.FC<MyEmploymentSectionProps> = ({
  employee,
  contract,
  employeeContracts,
  deptName,
  branchName,
  tw,
}) => {
  // Seniority Calculation
  const hireDateStr = employee.createdAt
    ? (typeof employee.createdAt === "string" ? employee.createdAt : new Date(employee.createdAt.seconds * 1000).toISOString())
    : "2025-01-01T00:00:00.000Z";

  const calculateSeniority = (startDateStr: string) => {
    const start = new Date(startDateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const years = Math.floor(diffDays / 365);
    const months = Math.floor((diffDays % 365) / 30);
    const days = Math.floor((diffDays % 365) % 30);

    return { years, months, days, totalDays: diffDays };
  };

  const seniority = calculateSeniority(hireDateStr);

  const personalContracts = employeeContracts.filter(c => c.employeeId === employee.id);

  const effectiveBaseSalary = employee.baseSalary ?? employee.salaryBaseHtg ?? contract?.salaryBaseHtg ?? 0;
  const effectivePayRegime = employee.paymentModel || employee.payRegime || contract?.payRegime || "FIXED";
  const effectiveContractType = employee.contractType || contract?.contractType || "CDI";

  return (
    <div className="space-y-6" id="view-employment-section">
      {/* TOP SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CONTRACT TYPE */}
        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold tracking-wider">Type de Contrat</span>
            <Briefcase className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-black text-slate-100 uppercase font-mono">
            {effectiveContractType.toUpperCase()}
          </div>
          <p className="text-[10px] text-emerald-400 font-mono">Contrat enregistré dans le SSOT</p>
        </div>

        {/* SENIORITY */}
        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold tracking-wider">Ancienneté Cumulée</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-slate-100 font-mono">
            {seniority.years > 0 ? `${seniority.years} ans ` : ""}{seniority.months} mois {seniority.days}j
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Depuis le {new Date(hireDateStr).toLocaleDateString("fr-FR")}</p>
        </div>

        {/* REMUNERATION MODEL */}
        <div className="glass p-5 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-mono uppercase font-bold tracking-wider">Régime Salarial</span>
            <DollarSign className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-black text-slate-100 font-mono uppercase">
            {effectivePayRegime}
          </div>
          <p className="text-[10px] text-cyan-400 font-mono">Base HTG : {effectiveBaseSalary.toLocaleString()} HTG</p>
        </div>
      </div>

      {/* DETAILED CONTRACT CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CONTRACT PARAMETERS */}
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2 border-b border-slate-800 pb-3">
            <FileText className="w-4 h-4 text-cyan-400" />
            Paramètres Contractuels Officiels
          </h3>

          <div className="space-y-3 font-sans text-xs">
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Poste Officiel</span>
              <span className="font-bold text-slate-200 font-mono">{employee.position || "Opérateur ERP"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Département</span>
              <span className="font-bold text-slate-200">{deptName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Succursale de Rattachement</span>
              <span className="font-bold text-slate-200">{branchName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Volume Horaire Contractuel</span>
              <span className="font-bold text-cyan-400 font-mono">40 Heures / Semaine</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-850">
              <span className="text-slate-400">Période d'Essai</span>
              <span className="font-bold text-emerald-400 font-mono">Validée</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400">Preavis / Termes de Rupture</span>
              <span className="font-mono text-slate-300">30 Jours Ouvrés (Code du Travail)</span>
            </div>
          </div>
        </div>

        {/* CAREER PROGRESSION TIMELINE */}
        <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center gap-2 border-b border-slate-800 pb-3">
            <Calendar className="w-4 h-4 text-amber-400" />
            Historique & Évolution de Carrière
          </h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
            {/* MILESTONE 1 */}
            <div className="relative">
              <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-cyan-400 ring-4 ring-slate-900"></div>
              <div>
                <span className="text-[10px] font-mono text-cyan-400 font-bold">
                  {new Date(hireDateStr).toLocaleDateString("fr-FR")}
                </span>
                <p className="text-xs font-bold text-slate-200 mt-0.5">Embauche & Signature du Contrat</p>
                <p className="text-[11px] text-slate-400">Intégration dans le département {deptName} à {branchName}.</p>
              </div>
            </div>

            {/* MILESTONE 2 */}
            <div className="relative">
              <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-slate-900"></div>
              <div>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">Période Active</span>
                <p className="text-xs font-bold text-slate-200 mt-0.5">Validation de la Période d'Essai</p>
                <p className="text-[11px] text-slate-400">Confirmation du statut d'employé permanent et attribution du badge digital.</p>
              </div>
            </div>

            {/* MILESTONE 3 */}
            <div className="relative">
              <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-400 ring-4 ring-slate-900"></div>
              <div>
                <span className="text-[10px] font-mono text-indigo-400 font-bold">Statut Actuel</span>
                <p className="text-xs font-bold text-slate-200 mt-0.5">Mise en Conformité FINOPS ERP</p>
                <p className="text-[11px] text-slate-400">Badge QR actif, signature HMAC vérifiée et habilitations RBAC configurées.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTRACT HISTORY TABLE */}
      <div className="glass p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-tight flex items-center justify-between border-b border-slate-800 pb-3">
          <span>Avenants & Documents Contractuels</span>
          <span className="text-xs text-slate-400 font-mono">{personalContracts.length || 1} Document(s)</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-bold font-mono text-[10px] uppercase">
                <th className="pb-3">Réf / Identifiant</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Régime</th>
                <th className="pb-3">Salaire de Base</th>
                <th className="pb-3">Date Génération</th>
                <th className="pb-3">Statut</th>
                <th className="pb-3 text-right">Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {personalContracts.length > 0 ? (
                personalContracts.map((c, idx) => (
                  <tr key={idx} className="text-slate-300 hover:bg-slate-950/20">
                    <td className="py-3 font-mono text-cyan-400 font-bold">{c.id}</td>
                    <td className="py-3 font-mono uppercase">{employee.contractType || c.contractType}</td>
                    <td className="py-3 font-mono uppercase">{employee.paymentModel || employee.payRegime || c.payRegime}</td>
                    <td className="py-3 font-mono">{(employee.baseSalary ?? employee.salaryBaseHtg ?? c.salaryBaseHtg ?? 0).toLocaleString()} HTG</td>
                    <td className="py-3 font-mono">{new Date(c.generatedAt).toLocaleDateString("fr-FR")}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-cyan-400 rounded text-[10px] font-mono hover:bg-slate-800 transition cursor-pointer flex items-center gap-1 ml-auto">
                        <Download className="w-3 h-3" /> PDF
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="text-slate-300 hover:bg-slate-950/20">
                  <td className="py-3 font-mono text-cyan-400 font-bold">{contract?.id || `CTR-${(employee?.id || "EMP").slice(0, 6)}`}</td>
                  <td className="py-3 font-mono uppercase">{effectiveContractType}</td>
                  <td className="py-3 font-mono uppercase">{effectivePayRegime}</td>
                  <td className="py-3 font-mono">{effectiveBaseSalary.toLocaleString()} HTG</td>
                  <td className="py-3 font-mono">{new Date(hireDateStr).toLocaleDateString("fr-FR")}</td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ACTIF
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-cyan-400 rounded text-[10px] font-mono hover:bg-slate-800 transition cursor-pointer flex items-center gap-1 ml-auto">
                      <Download className="w-3 h-3" /> PDF
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
