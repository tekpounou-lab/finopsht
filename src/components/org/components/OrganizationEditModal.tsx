import React from "react";
import { Branch, Department, Role, ERPEvent, ForensicLog, Business } from "../../../types";
import { MapPin, Layers, X, Plus, AlertCircle } from "lucide-react";
import { generateSignature, getLocalIP } from "../../../data";
import { db } from "../../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";

interface OrganizationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "BRANCH" | "DEPARTMENT";
  currentBusiness: Business;
  branches: Branch[];
  departments: Department[];
  currentUser?: { name: string; id: string };
  onAddBranch: (b: Branch) => void;
  onAddDept: (d: Department) => void;
  onAddEvent: (ev: ERPEvent) => void;
  onAddForensicLog: (log: ForensicLog) => void;
}

export const OrganizationEditModal: React.FC<OrganizationEditModalProps> = ({
  isOpen,
  onClose,
  type,
  currentBusiness,
  branches,
  departments,
  currentUser,
  onAddBranch,
  onAddDept,
  onAddEvent,
  onAddForensicLog,
}) => {
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [selectedBranchId, setSelectedBranchId] = React.useState(branches[0]?.id || "");
  const [error, setError] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      if (type === "BRANCH") {
        const newBranchId = "br_" + Math.random().toString(36).substring(2, 9);
        const newBranch: Branch = {
          id: newBranchId,
          business_id: currentBusiness.id,
          name: name.trim(),
          location: location.trim() || "Principal",
          status: "ACTIVE",
          is_active: true,
          created_at: new Date().toISOString(),
        };

        const branchDocRef = doc(db, "branches", newBranchId);
        await setDoc(branchDocRef, newBranch);
        onAddBranch(newBranch);

        const ev: ERPEvent = {
          id: "ev_" + Math.random().toString(36).substring(2, 9),
          business_id: currentBusiness.id,
          timestamp: new Date().toISOString(),
          type: "BRANCH_CREATED",
          payload: { message: `Création de la succursale ${newBranch.name}` },
          checksum: generateSignature(newBranch.id),
        };
        onAddEvent(ev);
      } else {
        const newDeptId = "d_" + Math.random().toString(36).substring(2, 9);
        const newDept: Department = {
          id: newDeptId,
          business_id: currentBusiness.id,
          branchId: selectedBranchId,
          branch_id: selectedBranchId,
          name: name.trim(),
          code: code.trim().toUpperCase() || undefined,
          status: "ACTIVE",
          is_active: true,
          created_at: new Date().toISOString(),
        };

        const deptDocRef = doc(db, "departments", newDeptId);
        await setDoc(deptDocRef, newDept);
        onAddDept(newDept);

        const ev: ERPEvent = {
          id: "ev_" + Math.random().toString(36).substring(2, 9),
          business_id: currentBusiness.id,
          timestamp: new Date().toISOString(),
          type: "DEPARTMENT_CREATED",
          payload: { message: `Création du département ${newDept.name}` },
          checksum: generateSignature(newDept.id),
        };
        onAddEvent(ev);
      }

      onClose();
    } catch (err: any) {
      console.error("Error creating organization entity:", err);
      setError(err.message || "Erreur lors de la création.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            {type === "BRANCH" ? (
              <>
                <MapPin className="w-5 h-5 text-emerald-400" />
                <span>Nouvelle Succursale</span>
              </>
            ) : (
              <>
                <Layers className="w-5 h-5 text-sky-400" />
                <span>Nouveau Département</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1">
              Nom de {type === "BRANCH" ? "la succursale" : "du département"} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "BRANCH" ? "Ex: Siège Social Pétion-Ville" : "Ex: Opérations & Logistique"}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {type === "BRANCH" ? (
            <div>
              <label className="block text-slate-400 font-medium mb-1">Localisation / Ville</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Port-au-Prince, HT"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Succursale de rattachement</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.location || "Principal"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">Code Département (Optionnel)</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Ex: OPS-01"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? "Création..." : "Confirmer"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
