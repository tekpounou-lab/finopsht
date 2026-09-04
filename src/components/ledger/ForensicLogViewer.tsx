import React, { useState, useMemo } from 'react';
import { ForensicLog } from '../../types';
import { ShieldCheck, User, Clock, FileJson, X, Terminal, Search, RefreshCw, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { usePaginatedForensicLogs } from '../../hooks/usePaginatedForensicLogs';
import { VirtualizedTable } from '../ui/VirtualizedTable';
import { Column } from '../ui/EnterpriseTables';

interface ForensicLogViewerProps {
  business_id: string;
}

export default function ForensicLogViewer({ business_id }: ForensicLogViewerProps) {
  const [selectedLog, setSelectedLog] = useState<ForensicLog | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const {
    items: logs,
    loading,
    loadingMore,
    hasMore,
    totalFetched,
    loadMore,
    refresh
  } = usePaginatedForensicLogs({
    businessId: business_id,
    pageSize: 50,
    autoLoad: true
  });

  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return logs;
    const term = searchTerm.toLowerCase();
    return logs.filter(log => 
      (log.action || '').toLowerCase().includes(term) || 
      (log.userName || '').toLowerCase().includes(term) ||
      (log.id || '').toLowerCase().includes(term) ||
      (log.signature || '').toLowerCase().includes(term)
    );
  }, [logs, searchTerm]);

  const columns: Column<ForensicLog>[] = useMemo(() => [
    {
      key: 'timestamp',
      header: 'Timestamp',
      width: '25%',
      accessor: (log: ForensicLog) => (
        <div className="flex items-center gap-2 text-slate-300 font-mono text-xs">
          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>{log.timestamp ? format(new Date(log.timestamp), 'dd MMM yyyy, HH:mm:ss', { locale: fr }) : '-'}</span>
        </div>
      )
    },
    {
      key: 'action',
      header: 'Action',
      width: '20%',
      accessor: (log: ForensicLog) => (
        <span className="px-2.5 py-1 bg-indigo-900/40 text-indigo-300 border border-indigo-500/30 font-bold text-xs rounded-md uppercase tracking-wider">
          {log.action}
        </span>
      )
    },
    {
      key: 'userName',
      header: 'Acteur',
      width: '25%',
      accessor: (log: ForensicLog) => (
        <div>
          <div className="flex items-center gap-1.5 text-slate-200 font-medium">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span>{log.userName || log.userId}</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono ml-5">{log.ipAddress}</div>
        </div>
      )
    },
    {
      key: 'signature',
      header: 'Signature (SHA-256)',
      width: '20%',
      accessor: (log: ForensicLog) => (
        <div className="max-w-[160px] truncate font-mono text-xs text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800" title={log.signature}>
          {log.signature || 'N/A'}
        </div>
      )
    },
    {
      key: 'details',
      header: 'Détails',
      align: 'right',
      width: '10%',
      accessor: (log: ForensicLog) => (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLog(log);
          }}
          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
          title="Voir les détails JSON"
        >
          <FileJson className="w-4 h-4" />
        </button>
      )
    }
  ], []);

  return (
    <div className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950/60">
        <div>
          <h3 className="text-lg font-black text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            Audit & Forensic Logs
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 uppercase font-bold tracking-widest">
            Registre des opérations certifiées ({totalFetched} chargés)
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Rechercher par action, acteur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-950 text-slate-200 placeholder-slate-500"
            />
          </div>

          <button
            onClick={() => refresh()}
            disabled={loading}
            className="p-2 border border-slate-700 hover:bg-slate-800 rounded-xl text-slate-300 transition shrink-0"
            title="Rafraîchir les logs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Virtualized Table Container */}
      <div className="p-4">
        <VirtualizedTable<ForensicLog>
          data={filteredLogs}
          columns={columns}
          keyExtractor={(row) => row.id}
          rowHeight={64}
          containerHeight={460}
          loading={loading}
          emptyMessage="Aucun enregistrement d'audit trouvé"
          onRowClick={(row) => setSelectedLog(row)}
          onEndReached={loadMore}
          footerContent={
            hasMore ? (
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{totalFetched} entrées affichées</span>
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-4 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg flex items-center gap-1.5 transition font-semibold"
                >
                  {loadingMore ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Chargement...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Charger la page suivante
                    </>
                  )}
                </button>
              </div>
            ) : totalFetched > 0 ? (
              <div className="text-center text-xs text-slate-500 py-1">
                Fin du registre des logs (Toutes les {totalFetched} entrées sont chargées)
              </div>
            ) : null
          }
        />
      </div>
      
      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <h3 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                <Terminal className="w-4 h-4 text-indigo-400" />
                Détails du Sceau Forensic
              </h3>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 grid grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto bg-slate-950 text-slate-300 font-mono text-xs">
              <div className="col-span-2 flex flex-col gap-2 p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-emerald-400">
                <div><span className="text-slate-500">ID:</span> {selectedLog.id}</div>
                <div><span className="text-slate-500">ACTION:</span> {selectedLog.action}</div>
                <div><span className="text-slate-500">USER:</span> {selectedLog.userName || selectedLog.userId}</div>
                <div><span className="text-slate-500">IP:</span> {selectedLog.ipAddress}</div>
                <div><span className="text-slate-500">SIGNATURE:</span> {selectedLog.signature}</div>
              </div>
              
              <div>
                <div className="text-slate-400 font-bold mb-2 uppercase tracking-widest text-[10px]">État Précédent (Before)</div>
                <pre className="bg-slate-900 p-4 rounded-xl border border-slate-800 overflow-x-auto text-[11px] text-slate-300 max-h-60 custom-scrollbar">
                  {formatJson(selectedLog.beforeState)}
                </pre>
              </div>
              
              <div>
                <div className="text-slate-400 font-bold mb-2 uppercase tracking-widest text-[10px]">Nouvel État (After)</div>
                <pre className="bg-slate-900 p-4 rounded-xl border border-slate-800 overflow-x-auto text-[11px] text-slate-300 max-h-60 custom-scrollbar">
                  {formatJson(selectedLog.afterState)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatJson(str: any) {
  if (!str) return '{}';
  if (typeof str === 'object') {
    try {
      return JSON.stringify(str, null, 2);
    } catch {
      return String(str);
    }
  }
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch (e) {
    return str || '{}';
  }
}
