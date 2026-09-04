import React from "react";
import { PayrollRecord, Role } from "../../../types";
import { 
  FileText, 
  DollarSign, 
  UserCheck, 
  Building2, 
  Eye, 
  Trash2, 
  Lock 
} from "lucide-react";

interface PayrollRunTableProps {
  records: PayrollRecord[];
  isLocked: boolean;
  currentRole: Role;
  onViewRecordDetails: (record: PayrollRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
}

export const PayrollRunTable: React.FC<PayrollRunTableProps> = ({
  records,
  isLocked,
  currentRole,
  onViewRecordDetails,
  onDeleteRecord,
}) => {
  if (records.length === 0) {
    return (
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
        <DollarSign className="w-10 h-10 text-slate-600 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-slate-300">Aucun bulletin calculé</h3>
        <p className="text-xs text-slate-500 mt-1">
          Lancez le calcul de paie pour générer les bulletins de ce cycle.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700/80 uppercase text-[11px]">
            <tr>
              <th className="py-3 px-4">Employé</th>
              <th className="py-3 px-4">Salaire Brut (HTG)</th>
              <th className="py-3 px-4">Déductions ONA/OFATMA</th>
              <th className="py-3 px-4">Salaire Net (HTG)</th>
              <th className="py-3 px-4 text-center">Statut</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {records.map((r) => {
              const gross = r.grossSalary || (r.gross_salary_cents ? r.gross_salary_cents / 100 : 0);
              const tax = (r.cnssDeduction || 0) + (r.cnsDeduction || 0);
              const net = r.netPaid || (r.net_salary_cents ? r.net_salary_cents / 100 : gross - tax);

              return (
                <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{r.employeeName || "Employé"}</div>
                    <span className="text-[10px] text-slate-500 font-mono">{r.employeeId}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-white">
                    {gross.toLocaleString("fr-FR")} HTG
                  </td>
                  <td className="py-3 px-4 font-mono text-red-400">
                    -{tax.toLocaleString("fr-FR")} HTG
                  </td>
                  <td className="py-3 px-4 font-mono text-emerald-400 font-bold">
                    {net.toLocaleString("fr-FR")} HTG
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {r.status || "CALCULÉ"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewRecordDetails(r)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="Consulter Bulletin"
                      >
                        <Eye className="w-4 h-4 text-indigo-400" />
                      </button>
                      {!isLocked && onDeleteRecord && (
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(r.id)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
