import React, { useState, useMemo } from "react";
import {
  Building2,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Scale,
  DollarSign,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  XCircle,
  FileText,
  ShieldCheck,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { LedgerTransaction } from "../../types";
import { BankStatementImportService, BankStatementImportResult } from "../../services/accounting/BankStatementImportService";
import { BankReconciliationEngine } from "../../services/accounting/BankReconciliationEngine";
import { BankReconciliation } from "../../types/accounting";
import { toast } from "sonner";

interface BankReconciliationConsoleProps {
  businessId: string;
  ledgerTransactions: LedgerTransaction[];
  currency?: string;
}

const DEMO_SYNTHETIC_CSV = `Date,Libelle,Debit,Credit,Ref
01/10/2026,Vente Client Depot Comptant,,5000.00,REF-001
02/10/2026,Paiement Fournisseur Papeterie,1200.00,,REF-002
05/10/2026,Recette Journaliere Caisse Consolidee,,15000.00,REF-DEP-003
12/10/2026,Frais de tenue de compte mensuel,150.00,,AGIOS-1026
15/10/2026,Prelevement Inconnu Contestation,450.00,,DISP-999
INVALID_ROW_FORMAT,Ligne Sans Date,0,0,
01/10/2026,Vente Client Depot Comptant,,5000.00,REF-001`;

export const BankReconciliationConsole: React.FC<BankReconciliationConsoleProps> = ({
  businessId,
  ledgerTransactions,
  currency = "HTG"
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<"HTG" | "USD">(currency as "HTG" | "USD");
  const [bankAccount, setBankAccount] = useState<string>(selectedCurrency === "USD" ? "1020_BANK_USD" : "1010_BANK_HTG");
  const [csvContent, setCsvContent] = useState<string>("");
  const [importResult, setImportResult] = useState<BankStatementImportResult | null>(null);
  const [reconciliation, setReconciliation] = useState<BankReconciliation | null>(null);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [closingStatementBalance, setClosingStatementBalance] = useState<number>(18200); // 18,200 HTG net
  const [selectedTxForMatch, setSelectedTxForMatch] = useState<string>("");
  const [activeLineForMatch, setActiveLineForMatch] = useState<string | null>(null);

  // Filter ledger transactions by business and currency
  const availableLedgerTxs = useMemo(() => {
    return ledgerTransactions.filter(
      (tx) => tx.business_id === businessId && tx.currency === selectedCurrency
    );
  }, [ledgerTransactions, businessId, selectedCurrency]);

  const handleLoadDemoCSV = () => {
    setCsvContent(DEMO_SYNTHETIC_CSV);
    toast.info("Relevé bancaire synthétique de test chargé dans l'éditeur.");
  };

  const handleParseCSV = () => {
    if (!csvContent.trim()) {
      toast.error("Veuillez saisir ou importer un fichier CSV.");
      return;
    }

    try {
      const res = BankStatementImportService.parseCSVString(csvContent, {
        businessId,
        currency: selectedCurrency,
      });

      setImportResult(res);
      toast.success(
        `Importation réussie : ${res.validCount} ligne(s) valide(s), ${res.invalidCount} invalide(s), ${res.duplicateCount} doublon(s).`
      );
    } catch (err: any) {
      toast.error(`Erreur d'importation : ${err?.message || "Format invalide"}`);
    }
  };

  const handleRunReconciliation = () => {
    if (!importResult || importResult.validLines.length === 0) {
      toast.error("Veuillez d'abord importer un relevé bancaire valide.");
      return;
    }

    const session = BankReconciliationEngine.reconcile(
      importResult.validLines,
      availableLedgerTxs,
      businessId,
      bankAccount,
      openingBalance * 100,
      closingStatementBalance * 100
    );

    setReconciliation(session);
    if (session.isBalanced) {
      toast.success("Rapprochement bancaire exécuté : Session parfaitement ÉQUILIBRÉE (Écart inexpliqué = 0) !");
    } else {
      toast.warning(
        `Rapprochement exécuté : Incomplet avec un écart de ${(session.breakdown.unexplainedDifferenceCents / 100).toLocaleString()} ${selectedCurrency}.`
      );
    }
  };

  const handleManualMatch = (lineId: string) => {
    if (!reconciliation || !selectedTxForMatch) {
      toast.error("Veuillez sélectionner une transaction comptable.");
      return;
    }

    const updated = BankReconciliationEngine.manualMatchLine(reconciliation, lineId, selectedTxForMatch);
    setReconciliation(updated);
    setActiveLineForMatch(null);
    setSelectedTxForMatch("");
    toast.success("Rapprochement manuel appliqué avec succès.");
  };

  const handleManualUnmatch = (lineId: string) => {
    if (!reconciliation) return;
    const updated = BankReconciliationEngine.manualUnmatchLine(reconciliation, lineId);
    setReconciliation(updated);
    toast.info("Ligne dissociée. Statut repassé à NON RAPPROCHÉ.");
  };

  const handleMarkDisputed = (lineId: string) => {
    if (!reconciliation) return;
    const reason = prompt("Raison de la contestation / du litige bancaire :", "Prelevé à tort - Dossier envoyé à la banque");
    if (!reason) return;

    const updated = BankReconciliationEngine.markLineDisputed(reconciliation, lineId, reason);
    setReconciliation(updated);
    toast.warning("Ligne marquée comme CONTESTÉE / EN LITIGE.");
  };

  return (
    <div className="flex flex-col gap-6 w-full text-slate-100 font-sans">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-5 rounded-2xl backdrop-blur-md shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              Rapprochement Bancaire & Trésorerie
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Phase 1.7 E2E
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Confrontation automatisée du relevé bancaire avec le Grand Livre (SSOT Multi-Tenant)
            </p>
          </div>
        </div>

        {/* Currency & Bank Account Selector */}
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setSelectedCurrency("HTG");
                setBankAccount("1010_BANK_HTG");
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                selectedCurrency === "HTG"
                  ? "bg-cyan-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              HTG (Gourdes)
            </button>
            <button
              onClick={() => {
                setSelectedCurrency("USD");
                setBankAccount("1020_BANK_USD");
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                selectedCurrency === "USD"
                  ? "bg-cyan-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              USD (Dollars)
            </button>
          </div>
        </div>
      </div>

      {/* Step 1 & 2: Statement Import Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CSV Editor / Import Controls */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-cyan-400" />
              1. Importation du Relevé Bancaire (CSV)
            </h3>
            <button
              onClick={handleLoadDemoCSV}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Charger Relevé Synthétique (E2E)
            </button>
          </div>

          <textarea
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="Collez ici le contenu CSV de votre relevé bancaire (ex: Date, Libelle, Debit, Credit, Ref)..."
            className="w-full h-36 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition resize-none"
          />

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Compte Bancaire : <strong className="text-slate-200 font-mono">{bankAccount}</strong></span>
            </div>
            <button
              onClick={handleParseCSV}
              className="px-4 py-2 text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" /> Analyser & Valider le Relevé
            </button>
          </div>
        </div>

        {/* Import Summary Card */}
        <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Rapport d'Analyse du Relevé
            </h3>

            {importResult ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Lignes Valides :</span>
                  <span className="font-mono font-bold text-emerald-400">{importResult.validCount}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Lignes Invalides :</span>
                  <span className="font-mono font-bold text-rose-400">{importResult.invalidCount}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Doublons Ignorés :</span>
                  <span className="font-mono font-bold text-amber-400">{importResult.duplicateCount}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Total Crédits (Dépôts) :</span>
                  <span className="font-mono font-bold text-emerald-300">
                    +{(importResult.totalDepositsCents / 100).toLocaleString()} {selectedCurrency}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Total Débits (Retraits) :</span>
                  <span className="font-mono font-bold text-rose-300">
                    -{(importResult.totalWithdrawalsCents / 100).toLocaleString()} {selectedCurrency}
                  </span>
                </div>
                <div className="flex justify-between py-1 pt-2 font-bold text-sm">
                  <span className="text-slate-200">Variation Nette :</span>
                  <span className="font-mono text-cyan-400">
                    {(importResult.netChangeCents / 100).toLocaleString()} {selectedCurrency}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">
                Aucun relevé analysé. Chargez ou collez un CSV puis cliquez sur "Analyser & Valider".
              </p>
            )}
          </div>

          {importResult && (
            <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Solde Clôture Banque ({selectedCurrency}) :</span>
                <input
                  type="number"
                  value={closingStatementBalance}
                  onChange={(e) => setClosingStatementBalance(Number(e.target.value))}
                  className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right font-mono text-xs text-white"
                />
              </div>

              <button
                onClick={handleRunReconciliation}
                className="w-full py-2.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" /> Executer le Moteur de Rapprochement
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Reconciliation Execution & KPI Cards */}
      {reconciliation && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
          {/* Status Bar */}
          <div
            className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
              reconciliation.isBalanced
                ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                : "bg-amber-950/30 border-amber-500/30 text-amber-200"
            }`}
          >
            <div className="flex items-center gap-3">
              {reconciliation.isBalanced ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />
              )}
              <div>
                <span className="text-xs font-bold uppercase tracking-wider block">
                  Statut de la Session : {reconciliation.isBalanced ? "ÉQUILIBRÉ & RAPPROCHÉ" : "RÉSOLUTION INCOMPLÈTE / ÉCART RÉSIDUEL"}
                </span>
                <span className="text-xs opacity-80">
                  {reconciliation.isBalanced
                    ? "Toutes les variations bancaires sont justifiées par le Grand Livre ou les éléments en transit."
                    : `Écart inexpliqué résiduel : ${(reconciliation.breakdown.unexplainedDifferenceCents / 100).toLocaleString()} ${selectedCurrency}.`}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold">
              <span>Rapprochées : {reconciliation.reconciledCount} / {reconciliation.statementLines.length}</span>
              <span>Non Rapprochées : {reconciliation.unreconciledCount}</span>
            </div>
          </div>

          {/* Detailed Breakdown Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Solde Clôture Relevé</span>
              <span className="text-sm font-mono font-black text-white">
                {(reconciliation.statementClosingBalanceCents / 100).toLocaleString()} {selectedCurrency}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Chèques en Transit</span>
              <span className="text-sm font-mono font-black text-amber-400">
                -{(reconciliation.breakdown.outstandingChecksCents / 100).toLocaleString()} {selectedCurrency}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Dépôts en Transit</span>
              <span className="text-sm font-mono font-black text-cyan-400">
                +{(reconciliation.breakdown.depositsInTransitCents / 100).toLocaleString()} {selectedCurrency}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Frais Non Enregistrés</span>
              <span className="text-sm font-mono font-black text-rose-400">
                -{(reconciliation.breakdown.unrecordedBankFeesCents / 100).toLocaleString()} {selectedCurrency}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Lignes Contestées</span>
              <span className="text-sm font-mono font-black text-purple-400">
                {(reconciliation.breakdown.disputedItemsCents / 100).toLocaleString()} {selectedCurrency}
              </span>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Écart Inexpliqué</span>
              <span className={`text-sm font-mono font-black ${reconciliation.breakdown.unexplainedDifferenceCents === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {(reconciliation.breakdown.unexplainedDifferenceCents / 100).toLocaleString()} {selectedCurrency}
              </span>
            </div>
          </div>

          {/* Statement Lines Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                Lignes du Relevé Bancaire & Appariement au Grand Livre
              </h3>
              <span className="text-xs text-slate-400">
                {reconciliation.statementLines.length} ligne(s) au relevé | {availableLedgerTxs.length} transaction(s) au GL
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase text-[10px] font-mono">
                    <th className="p-3">Date</th>
                    <th className="p-3">Libellé</th>
                    <th className="p-3 text-right">Débit (-)</th>
                    <th className="p-3 text-right">Crédit (+)</th>
                    <th className="p-3 text-center">Statut Appariement</th>
                    <th className="p-3">Correspondance Grand Livre</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {reconciliation.statementLines.map((line) => {
                    const matchedTx = availableLedgerTxs.find((t) => t.id === line.matchedTransactionId);

                    return (
                      <tr key={line.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 font-mono text-slate-300">{line.date}</td>
                        <td className="p-3 font-medium text-white">{line.description}</td>
                        <td className="p-3 text-right font-mono text-rose-400">
                          {line.amountCents < 0 ? `${(Math.abs(line.amountCents) / 100).toLocaleString()}` : "-"}
                        </td>
                        <td className="p-3 text-right font-mono text-emerald-400">
                          {line.amountCents > 0 ? `${(line.amountCents / 100).toLocaleString()}` : "-"}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              line.reconciliationStatus === "EXACT_MATCH"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : line.reconciliationStatus === "SUGGESTED_MATCH"
                                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                                : line.reconciliationStatus === "MANUAL_MATCH"
                                ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                                : line.reconciliationStatus === "DISPUTED"
                                ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {line.reconciliationStatus}
                          </span>
                        </td>
                        <td className="p-3 text-xs">
                          {matchedTx ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-200">{matchedTx.description}</span>
                              <span className="text-[10px] font-mono text-slate-400">
                                ID: {matchedTx.id} | Montant: {matchedTx.amount.toLocaleString()} {matchedTx.currency}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic text-[11px]">Aucune transaction associée</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {line.matchedTransactionId ? (
                              <button
                                onClick={() => handleManualUnmatch(line.id)}
                                className="px-2 py-1 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition cursor-pointer"
                              >
                                Dissocier
                              </button>
                            ) : (
                              <button
                                onClick={() => setActiveLineForMatch(activeLineForMatch === line.id ? null : line.id)}
                                className="px-2 py-1 text-[10px] font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded border border-cyan-500/40 transition cursor-pointer"
                              >
                                Associer
                              </button>
                            )}

                            {line.reconciliationStatus !== "DISPUTED" && (
                              <button
                                onClick={() => handleMarkDisputed(line.id)}
                                className="px-2 py-1 text-[10px] font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded border border-purple-500/40 transition cursor-pointer"
                              >
                                Litige
                              </button>
                            )}
                          </div>

                          {/* Manual Match Popover Selector */}
                          {activeLineForMatch === line.id && (
                            <div className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-2 text-left z-10 shadow-2xl">
                              <select
                                value={selectedTxForMatch}
                                onChange={(e) => setSelectedTxForMatch(e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px] text-white flex-1 focus:outline-none"
                              >
                                <option value="">-- Sélectionner une transaction GL --</option>
                                {availableLedgerTxs.map((tx) => (
                                  <option key={tx.id} value={tx.id}>
                                    {tx.date} — {tx.description} ({tx.amount.toLocaleString()} {tx.currency})
                                  </option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleManualMatch(line.id)}
                                className="px-2.5 py-1 text-[11px] font-bold bg-cyan-500 text-slate-950 rounded hover:bg-cyan-400 transition cursor-pointer"
                              >
                                OK
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
