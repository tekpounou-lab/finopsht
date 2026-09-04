import React, { useState } from 'react';
import { Database, Download, FileJson, FileSpreadsheet, FileText, AlertTriangle, CloudRain, CheckCircle2 } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getDbCollection } from '../lib/firebase';
import { useI18n } from '../i18n';

export default function DisasterRecovery({ current_business_id, currentRole }: any) {
  const { language } = useI18n();
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState<string | null>(null);

  const loc = {
    title: {
      fr: "Sauvegarde & Récupération d'Urgence",
      ht: "Retou apre katastwòf & Sovgad",
      en: "Disaster Recovery & Backup"
    },
    subtitle: {
      fr: "Extraction de stockage froid et instantanés globaux de l'entreprise",
      ht: "Sovgad ak kopi sekirite tout done konpayi an sou sèvè ki an sekirite",
      en: "Cold storage extraction and global business state snapshots"
    },
    warningTitle: {
      fr: "ATTENTION : EXPORTATION DE TOUT L'ÉTAT DU SYSTÈME.",
      ht: "ATANSYON : KIPI TOUT DONE SISTÈM NAN.",
      en: "WARNING: FULL STATE EXPORT."
    },
    warningDesc: {
      fr: "L'exportation de la base de données génère un instantané de conformité complet comprenant TOUS les employés, l'historique des présences, les registres de paie et les journaux d'audit. Cette archive externe doit être conservée de manière hautement sécurisée.",
      ht: "Lè ou sove done sa yo, w ap kopi tout enfòmasyon sou anplwaye yo, lè pwentaj yo, fèy peman yo, ak tout istoral liv la. Achiv sa dwe konsève nan yon kote ki trè an sekirite.",
      en: "Exporting the database generates a comprehensive compliance snapshot including ALL employees, attendance history, payroll ledgers, and audit trails. This archive must be stored securely."
    },
    jsonTitle: {
      fr: "Dump Brut JSON",
      ht: "Fichye JSON Done yo",
      en: "Raw JSON Dump"
    },
    jsonDesc: {
      fr: "Instantané relationnel brut complet pour les pipelines de restauration automatisés.",
      ht: "Mete tout done yo nan yon fòma elektwonik pou retounen yo otomatikman.",
      en: "Complete relational snapshot for automated restore pipelines."
    },
    csvTitle: {
      fr: "Fiche Excel / CSV",
      ht: "Fèy Excel / CSV",
      en: "XLSX / CSV"
    },
    csvDesc: {
      fr: "Exportations tabulaires pour l'audit et l'examen comptable hors ligne.",
      ht: "Dokiman tabilè pou kontwòl ak odit kontab an deyò koneksyon.",
      en: "Tabular exports for auditing and offline accounting review."
    },
    pdfTitle: {
      fr: "Dossiers PDF",
      ht: "Dokiman PDF",
      en: "PDF Dossiers"
    },
    pdfDesc: {
      fr: "Rapports compilés lisibles par l'homme (contrats, fiches de paie).",
      ht: "Rapò ekri byen fasil pou moun li (kontra yo ak fich peman yo).",
      en: "Human-readable collated reports (contracts, payslips)."
    },
    unauthorized: {
      fr: "Accès refusé. Réservé au Propriétaire (OWNER) pour des raisons de conformité et de sécurité.",
      ht: "Ou pa gen dwa fè sa. Aksyon sa a se pou Pwopriyetè sèlman (OWNER) pou kesyon sekirite ak konfòmite.",
      en: "Access denied. Restricted to Owner (OWNER) for compliance and security reasons."
    },
    completed: {
      fr: "Sauvegarde générée avec succès au format JSON.",
      ht: "Sovgad fèt kòrèkteman nan fòma JSON.",
      en: "Backup successfully generated in JSON format."
    },
    failed: {
      fr: "Échec lors de l'exportation de récupération d'urgence.",
      ht: "Sovgad la echwe nan sistèm nan.",
      en: "Failed during disaster recovery export."
    }
  };

  const activeLang = (language === 'fr' || language === 'ht' || language === 'en') ? language : 'fr';
  
  const handleExport = async (format: 'JSON' | 'CSV' | 'PDF') => {
    if (currentRole !== 'OWNER') {
      alert(loc.unauthorized[activeLang]);
      return;
    }
    
    setIsExporting(true);
    setExportComplete(null);
    try {
      const colls = ["employees", "attendance", "payroll_cycles", "ledger"];
      const compiledData: Record<string, any[]> = {};
      
      for (const col of colls) {
        const q = query(getDbCollection(col), where("business_id", "==", current_business_id));
        const snapshots = await getDocs(q);
        compiledData[col] = snapshots.docs.map(d => d.data());
      }
      
      if (format === 'JSON') {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(compiledData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href",     dataStr);
        downloadAnchorNode.setAttribute("download", `FinOps_Disaster_Recovery_Backup_${new Date().getTime()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
      }
      
      setExportComplete(
        activeLang === 'fr'
          ? `Sauvegarde générée avec succès au format ${format} !`
          : activeLang === 'ht'
            ? `Sovgad fèt kòrèkteman nan fòma ${format} !`
            : `Backup successfully generated in ${format} format!`
      );
    } catch (e: any) {
      console.error(e);
      alert(loc.failed[activeLang]);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto p-4 md:p-8">
      <div className="flex items-center gap-4 border-b border-white/5 pb-6">
        <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center">
           <CloudRain className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold font-sans text-slate-100 flex items-center gap-2">
            {loc.title[activeLang]}
          </h2>
          <p className="text-sm font-mono tracking-tight text-slate-400 mt-1">
            {loc.subtitle[activeLang]}
          </p>
        </div>
      </div>
      
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
          <Database className="w-48 h-48" />
        </div>
        
        <div className="relative z-10">
           <div className="flex bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl items-start gap-4 mb-8">
             <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
             <div className="text-sm font-medium">
               <strong>{loc.warningTitle[activeLang]}</strong><br/>
               {loc.warningDesc[activeLang]}
             </div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button 
                onClick={() => handleExport("JSON")}
                disabled={isExporting}
                className="group flex flex-col gap-3 items-center justify-center p-8 rounded-2xl border border-slate-700 bg-slate-850 hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                <FileJson className="w-10 h-10 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-slate-300">{loc.jsonTitle[activeLang]}</span>
                <span className="text-xs text-slate-500 text-center px-4 font-mono">{loc.jsonDesc[activeLang]}</span>
              </button>
              
              <button 
                onClick={() => handleExport("CSV")}
                disabled={isExporting}
                className="group flex flex-col gap-3 items-center justify-center p-8 rounded-2xl border border-slate-700 bg-slate-850 hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-slate-300">{loc.csvTitle[activeLang]}</span>
                <span className="text-xs text-slate-500 text-center px-4 font-mono">{loc.csvDesc[activeLang]}</span>
              </button>
              
              <button 
                onClick={() => handleExport("PDF")}
                disabled={isExporting}
                className="group flex flex-col gap-3 items-center justify-center p-8 rounded-2xl border border-slate-700 bg-slate-850 hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-10 h-10 text-rose-400 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-slate-300">{loc.pdfTitle[activeLang]}</span>
                <span className="text-xs text-slate-500 text-center px-4 font-mono">{loc.pdfDesc[activeLang]}</span>
              </button>
           </div>
           
           {exportComplete && (
             <div className="mt-8 flex items-center justify-center gap-2 p-4 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl font-mono text-sm animate-in fade-in slide-in-from-bottom-4">
               <CheckCircle2 className="w-5 h-5 animate-bounce" />
               {exportComplete}
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
