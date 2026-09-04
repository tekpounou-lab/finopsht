import React, { useState, useEffect } from "react";
import { X, Check, Shield, Save, Sliders } from "lucide-react";
import { FeatureRepository, FeatureMatrix } from "../../repositories";
import { toast } from "sonner";

interface TenantFeatureOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: { id: string; name: string; plan?: string } | null;
  onSaveSuccess?: () => void;
}

const ALL_MODULES = [
  { id: "attendance", label: "Pointage QR & Gestion des Présences", description: "Badges QR, HMAC, journaux de présence" },
  { id: "payroll", label: "Moteur de Paie V3", description: "Barèmes ONA (6%), OFATMA (2%), bulletins de paie" },
  { id: "accounting", label: "Grand Livre & Comptabilité Double-Entrée", description: "Plan comptable, écritures, états financiers" },
  { id: "hr", label: "RH & Gestion des Contrats", description: "Dossiers employés, congés, avantages social" },
  { id: "bi", label: "Business Intelligence & KPIs", description: "Dashboards d'analyse financière et analytique" },
  { id: "aiCfo", label: "Assistant IA CFO & Copilote", description: "Prédictions de trésorerie, détection d'anomalies" },
  { id: "pos", label: "Caisse & Point de Vente (POS)", description: "Terminaux de vente directes et reçus" },
  { id: "crm", label: "CRM & Ventes", description: "Pipeline commercial et fiches clients" }
];

export default function TenantFeatureOverrideModal({
  isOpen,
  onClose,
  tenant,
  onSaveSuccess
}: TenantFeatureOverrideModalProps) {
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && tenant?.id) {
      setLoading(true);
      FeatureRepository.getWorkspaceFeatures(tenant.id)
        .then((f) => {
          setFeatures(f as unknown as Record<string, boolean>);
        })
        .catch((err) => {
          console.error("Failed to load tenant features:", err);
          toast.error("Échec du chargement de la matrice de fonctionnalités.");
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, tenant]);

  if (!isOpen || !tenant) return null;

  const handleToggle = (moduleId: string) => {
    setFeatures((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await FeatureRepository.saveFeatures(tenant.id, features as unknown as FeatureMatrix);
      toast.success(`Matrice de modules mise à jour pour ${tenant.name}`);
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to save feature override:", err);
      toast.error("Erreur lors de la sauvegarde des surcharges.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100 font-sans">
                Surcharge des Modules — {tenant.name}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              Forfait : <span className="text-cyan-400 font-bold">{tenant.plan || "STARTER"}</span> — Surcharges manuelles Super Admin
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400 font-mono">
              Chargement de la matrice de fonctionnalités...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {ALL_MODULES.map((mod) => {
                const isEnabled = !!features[mod.id];
                return (
                  <div
                    key={mod.id}
                    onClick={() => handleToggle(mod.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isEnabled
                        ? "bg-cyan-950/30 border-cyan-500/40 text-slate-100"
                        : "bg-slate-950/40 border-slate-850 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold font-sans block">{mod.label}</span>
                      <span className="text-[10px] font-mono text-slate-400">{mod.description}</span>
                    </div>

                    <button
                      type="button"
                      className={`w-6 h-6 rounded-lg flex items-center justify-center transition ${
                        isEnabled
                          ? "bg-cyan-500 text-slate-950"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-bold rounded-xl transition"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saving ? "Enregistrement..." : "Appliquer la Surcharge"}
          </button>
        </div>
      </div>
    </div>
  );
}
