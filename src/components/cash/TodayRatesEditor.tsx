import React, { useState, useEffect, useCallback } from "react";
import { 
  CurrencyRateRepository, 
  DailyExchangeRateGrid, 
  DEFAULT_RATE_GRID_VALUES, 
  RateTypology, 
  getHaitiDateString 
} from "../../repositories/CurrencyRateRepository";
import { 
  Coins, 
  RefreshCw, 
  Save, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Clock, 
  History, 
  Lock, 
  Check, 
  ArrowRight,
  Info
} from "lucide-react";
import { toast } from "sonner";
import { ForensicLog } from "../../types";
import { ForensicLogRepository } from "../../repositories/ForensicLogRepository";

interface TodayRatesEditorProps {
  businessId: string;
  currentUser: { id: string; name: string; role: string };
  onAddForensicLog?: (log: ForensicLog) => void;
}

interface RateRowConfig {
  key: RateTypology;
  category: string;
  fromCurrency: string;
  toCurrency: string;
  description: string;
  isReadOnly?: boolean;
}

const RATE_ROWS: RateRowConfig[] = [
  {
    key: "ACHAT_CLIENT",
    category: "Guichet Client (USD)",
    fromCurrency: "USD",
    toCurrency: "HTG",
    description: "Taux d'Achat USD proposé aux clients au guichet"
  },
  {
    key: "VENTE_CLIENT",
    category: "Guichet Client (USD)",
    fromCurrency: "HTG",
    toCurrency: "USD",
    description: "Taux de Vente USD appliqué aux clients au guichet"
  },
  {
    key: "ACHAT_ENVOIE",
    category: "Transferts & Envois",
    fromCurrency: "USD",
    toCurrency: "HTG",
    description: "Taux appliqué pour les envois de fonds sortants"
  },
  {
    key: "VENTE_ENVOIE",
    category: "Transferts & Envois",
    fromCurrency: "USD",
    toCurrency: "HTG",
    description: "Taux appliqué pour la réception de transferts"
  },
  {
    key: "BRH",
    category: "Taux Officiel de Référence",
    fromCurrency: "USD",
    toCurrency: "HTG",
    description: "Taux moyen pondéré d'acquisition BRH (Banque de la République d'Haïti)"
  },
  {
    key: "CANADA",
    category: "Devises Internationales",
    fromCurrency: "CAD",
    toCurrency: "HTG",
    description: "Taux de conversion Dollar Canadien vers Gourde"
  },
  {
    key: "EURO",
    category: "Devises Internationales",
    fromCurrency: "EUR",
    toCurrency: "HTG",
    description: "Taux de conversion Euro vers Gourde"
  },
  {
    key: "PESO",
    category: "Devises Internationales",
    fromCurrency: "DOP",
    toCurrency: "HTG",
    description: "Taux de conversion Peso Dominicain vers Gourde"
  },
  {
    key: "LOCAL",
    category: "Monnaie Locale (Verrouillée)",
    fromCurrency: "HTG",
    toCurrency: "HTG",
    description: "Fixe et immuable : 1.00 Gourde = 1.00 Gourde",
    isReadOnly: true
  }
];

export const TodayRatesEditor: React.FC<TodayRatesEditorProps> = ({
  businessId,
  currentUser,
  onAddForensicLog
}) => {
  const [grid, setGrid] = useState<DailyExchangeRateGrid | null>(null);
  const [editedRates, setEditedRates] = useState<Record<RateTypology, string>>({
    ACHAT_CLIENT: String(DEFAULT_RATE_GRID_VALUES.ACHAT_CLIENT),
    VENTE_CLIENT: String(DEFAULT_RATE_GRID_VALUES.VENTE_CLIENT),
    ACHAT_ENVOIE: String(DEFAULT_RATE_GRID_VALUES.ACHAT_ENVOIE),
    VENTE_ENVOIE: String(DEFAULT_RATE_GRID_VALUES.VENTE_ENVOIE),
    BRH: String(DEFAULT_RATE_GRID_VALUES.BRH),
    CANADA: String(DEFAULT_RATE_GRID_VALUES.CANADA),
    EURO: String(DEFAULT_RATE_GRID_VALUES.EURO),
    PESO: String(DEFAULT_RATE_GRID_VALUES.PESO),
    LOCAL: "1.0000"
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isInheriting, setIsInheriting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showAuditLogs, setShowAuditLogs] = useState<boolean>(false);
  const [auditHistory, setAuditHistory] = useState<ForensicLog[]>([]);

  const todayStr = getHaitiDateString();
  const userRole = (currentUser.role || "").toUpperCase();
  const isAuthorized = ["OWNER", "MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  // Fetch today's rate grid with fallback
  const loadRates = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeGrid = await CurrencyRateRepository.getTodayRatesWithFallback(businessId, todayStr);
      setGrid(activeGrid);

      const ratesObj: Record<RateTypology, string> = {
        ACHAT_CLIENT: String(activeGrid.rates.ACHAT_CLIENT ?? DEFAULT_RATE_GRID_VALUES.ACHAT_CLIENT),
        VENTE_CLIENT: String(activeGrid.rates.VENTE_CLIENT ?? DEFAULT_RATE_GRID_VALUES.VENTE_CLIENT),
        ACHAT_ENVOIE: String(activeGrid.rates.ACHAT_ENVOIE ?? DEFAULT_RATE_GRID_VALUES.ACHAT_ENVOIE),
        VENTE_ENVOIE: String(activeGrid.rates.VENTE_ENVOIE ?? DEFAULT_RATE_GRID_VALUES.VENTE_ENVOIE),
        BRH: String(activeGrid.rates.BRH ?? DEFAULT_RATE_GRID_VALUES.BRH),
        CANADA: String(activeGrid.rates.CANADA ?? DEFAULT_RATE_GRID_VALUES.CANADA),
        EURO: String(activeGrid.rates.EURO ?? DEFAULT_RATE_GRID_VALUES.EURO),
        PESO: String(activeGrid.rates.PESO ?? DEFAULT_RATE_GRID_VALUES.PESO),
        LOCAL: "1.0000"
      };
      setEditedRates(ratesObj);
    } catch (err: any) {
      console.error("Error loading exchange rates:", err);
      toast.error("Erreur lors du chargement des taux de change.");
    } finally {
      setIsLoading(false);
    }
  }, [businessId, todayStr]);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  // Handle Input Changes with strict numerical checks
  const handleRateChange = (key: RateTypology, valStr: string) => {
    if (key === "LOCAL") return; // Read-only
    setEditedRates((prev) => ({
      ...prev,
      [key]: valStr
    }));
  };

  // Inherit rates from preceding business day
  const handleInheritRates = async () => {
    setIsInheriting(true);
    try {
      const inherited = await CurrencyRateRepository.syncYesterdayRatesToToday(businessId, currentUser.id);
      setGrid(inherited);
      setEditedRates({
        ACHAT_CLIENT: String(inherited.rates.ACHAT_CLIENT),
        VENTE_CLIENT: String(inherited.rates.VENTE_CLIENT),
        ACHAT_ENVOIE: String(inherited.rates.ACHAT_ENVOIE),
        VENTE_ENVOIE: String(inherited.rates.VENTE_ENVOIE),
        BRH: String(inherited.rates.BRH),
        CANADA: String(inherited.rates.CANADA),
        EURO: String(inherited.rates.EURO),
        PESO: String(inherited.rates.PESO),
        LOCAL: "1.0000"
      });
      toast.success("Taux de la veille recopilés avec succès (marqués comme hérités).");
    } catch (err: any) {
      toast.error(err.message || "Erreur lors de la recopie des taux.");
    } finally {
      setIsInheriting(false);
    }
  };

  // Submit Bulk Update
  const handleConfirmSave = async () => {
    if (!isAuthorized) {
      toast.error("Seuls les Propriétaires et Managers peuvent valider la grille des taux.");
      return;
    }

    // Validate inputs locally before firing transaction
    const parsedRates: Partial<DailyExchangeRateGrid["rates"]> = {};
    for (const row of RATE_ROWS) {
      if (row.key === "LOCAL") {
        parsedRates.LOCAL = 1.0000;
        continue;
      }
      const val = parseFloat(editedRates[row.key]);
      if (isNaN(val) || !isFinite(val) || val <= 0) {
        toast.error(`Le taux pour "${row.category} - ${row.key}" doit être un nombre strictement positif.`);
        return;
      }
      parsedRates[row.key] = Math.round(val * 10000) / 10000;
    }

    setIsSaving(true);
    try {
      const updatedGrid = await CurrencyRateRepository.upsertExchangeRates(
        businessId,
        parsedRates,
        { uid: currentUser.id, name: currentUser.name, role: currentUser.role },
        todayStr
      );

      setGrid(updatedGrid);
      setShowConfirmModal(false);
      toast.success(`Grille des taux de change validée avec succès pour le ${todayStr} !`);

      if (onAddForensicLog) {
        const log = await ForensicLogRepository.createAndSignLog({
          business_id: businessId,
          actorId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          action: "EXCHANGE_RATE_GRID_UPSERTED",
          details: `Grille de change enregistrée pour ${todayStr}. BRH: ${updatedGrid.rates.BRH}, Achat: ${updatedGrid.rates.ACHAT_CLIENT}, Vente: ${updatedGrid.rates.VENTE_CLIENT}.`,
          afterState: updatedGrid,
          timestamp: new Date().toISOString()
        });
        onAddForensicLog(log);
      }
    } catch (err: any) {
      console.error("Failed to save exchange rates:", err);
      toast.error(err.message || "Échec de l'enregistrement de la grille des taux.");
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch Forensic Logs for Exchange Rates Audit
  const handleFetchAuditLogs = async () => {
    setShowAuditLogs(true);
    try {
      const logs = await CurrencyRateRepository.getExchangeRateAuditLogs(businessId);
      setAuditHistory(logs);
    } catch (err) {
      console.error("Failed to fetch rate audit logs:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-slate-400 font-mono text-xs">
        <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
        <span>Chargement de la grille des taux de change...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl" id="today-rates-editor">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-base uppercase font-extrabold text-slate-100 tracking-wider flex items-center gap-2">
            <Coins className="w-5 h-5 text-cyan-400" />
            Gestion Centrale des Taux de Change (Grille Quotidienne)
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Définition des taux officiels de conversion en gourdes (HTG). Utilisés pour les caisses, le grand livre et la paie.
          </p>
        </div>

        {/* Date & Action controls */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-mono text-cyan-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Date d'Effet : <strong className="text-white">{todayStr}</strong> (Port-au-Prince)</span>
          </div>

          <button
            onClick={handleFetchAuditLogs}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Consulter l'historique des modifications"
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            Audit Log
          </button>
        </div>
      </div>

      {/* Status Warning / Inherited Rate Banner */}
      {grid?.is_inherited ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-amber-300 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold uppercase tracking-wider block">
              ATTENTION : Taux de Change Hérités de la Veille
            </span>
            <p className="text-slate-300 leading-relaxed font-sans">
              La grille ci-dessous est actuellement basée sur les taux de la journée antérieure (Hérité de {grid.effectiveDate}). 
              Veuillez réviser les cours et cliquer sur <strong>"Valider et Appliquer la Grille"</strong> pour certifier les taux manuels d'aujourd'hui.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between text-emerald-300 text-xs font-mono">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="font-bold">Grille Officielle du Jour Confirmée (Saisie Manuelle Certifiée)</span>
          </div>
          <span className="text-[11px] text-emerald-400/80">Dernière MàJ par {grid?.actorId || "Manager"} le {grid?.updatedAt ? new Date(grid.updatedAt).toLocaleTimeString() : todayStr}</span>
        </div>
      )}

      {/* Read-Only Notice for Unauthorized Users */}
      {!isAuthorized && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center gap-2 text-xs text-slate-400 font-mono">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Mode lecture seule : Seuls les utilisateurs avec le rôle Manager ou Propriétaire peuvent soumettre de nouveaux taux.</span>
        </div>
      )}

      {/* Rates Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left border-collapse font-sans text-xs">
          <thead>
            <tr className="bg-slate-950 text-slate-400 font-mono uppercase tracking-wider text-[11px] border-b border-slate-800">
              <th className="py-3.5 px-4">Typologie / Catégorie</th>
              <th className="py-3.5 px-4">Paire de Devises</th>
              <th className="py-3.5 px-4 text-right">Taux de Conversion (HTG)</th>
              <th className="py-3.5 px-4 text-center">Origine</th>
              <th className="py-3.5 px-4">Description Opérationnelle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {RATE_ROWS.map((row) => {
              const currentValStr = editedRates[row.key] || "";
              const isReadOnlyRow = row.isReadOnly || !isAuthorized;

              return (
                <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-200">
                    <span className="font-mono text-cyan-400">{row.key}</span>
                    <span className="block text-[11px] text-slate-400 font-normal font-sans">{row.category}</span>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-300">
                    {row.fromCurrency} <ArrowRight className="w-3 h-3 inline mx-1 text-slate-500" /> {row.toCurrency}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {isReadOnlyRow ? (
                      <span className="font-mono text-sm font-bold text-slate-200 px-3 py-1 bg-slate-950 rounded-lg border border-slate-800 inline-block min-w-[6rem]">
                        {parseFloat(currentValStr || "0").toFixed(4)} <span className="text-[10px] text-slate-500">HTG</span>
                      </span>
                    ) : (
                      <div className="inline-flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          value={currentValStr}
                          onChange={(e) => handleRateChange(row.key, e.target.value)}
                          className="w-32 bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-right font-mono text-sm font-bold text-white outline-none transition"
                        />
                        <span className="text-[10px] text-slate-400 font-mono">HTG</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {row.key === "LOCAL" ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        FIXE (1.0000)
                      </span>
                    ) : grid?.is_inherited ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        HÉRITÉ
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        MANUEL
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-400 text-xs">
                    {row.description}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action Footer Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-800 pt-5">
        <button
          onClick={handleInheritRates}
          disabled={isInheriting || !isAuthorized}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 text-cyan-400 ${isInheriting ? "animate-spin" : ""}`} />
          Recopier Taux de la Veille
        </button>

        {isAuthorized && (
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isSaving}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Valider et Appliquer la Grille
          </button>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/30 text-cyan-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Confirmation de la Grille des Taux</h3>
                <p className="text-xs text-slate-400 mt-0.5">Date d'effet : {todayStr}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Vous allez enregistrer la grille officielle des taux de change pour aujourd'hui. Ces taux seront immédiatement appliqués aux ouvertures de caisse, transactions au guichet, calculs de paie et écritures comptables du Grand Livre.
            </p>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-slate-400 border-b border-slate-800/80 pb-1 font-bold">
                <span>Catégorie</span>
                <span>Taux Soumis</span>
              </div>
              {RATE_ROWS.filter((r) => r.key !== "LOCAL").map((r) => (
                <div key={r.key} className="flex justify-between text-slate-200">
                  <span>{r.key} ({r.fromCurrency}/{r.toCurrency})</span>
                  <span className="font-bold text-cyan-300">{editedRates[r.key]} HTG</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-mono transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono rounded-xl shadow flex items-center gap-2 transition cursor-pointer"
              >
                {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirmer & Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Drawer / Modal */}
      {showAuditLogs && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase font-mono text-slate-100 flex items-center gap-2">
                <History className="w-4 h-4 text-cyan-400" />
                Journal d'Audit Forensic — Taux de Change
              </h3>
              <button
                onClick={() => setShowAuditLogs(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                Fermer [X]
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-3 font-mono text-xs">
              {auditHistory.length === 0 ? (
                <div className="p-6 text-center text-slate-500">Aucun enregistrement d'audit récent trouvé.</div>
              ) : (
                auditHistory.map((log) => (
                  <div key={log.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span className="text-cyan-400 font-bold">{log.userName} ({log.userRole})</span>
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-slate-200 font-sans">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
