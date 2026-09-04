
import React, { useEffect, useState } from "react";
import { Workflow, Search, Filter, Play, RotateCcw, AlertCircle, CheckCircle, Clock, RefreshCw } from "lucide-react";
import { WorkflowRepository } from "../../modules/workflow/WorkflowRepository";
import { WorkflowInstance } from "../../modules/workflow/types";
import { realtimeManager, tenantQuery } from "../../services/firestore/realtimeManager";
import { collection } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";

export const WorkflowCenter: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [filter, setFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const loadInstances = async () => {
    if (!businessId || !auth.currentUser) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await WorkflowRepository.listInstances(businessId, filter, 100);
      setInstances(data);
    } catch (err) {
      console.error("[WorkflowCenter] Error loading workflow instances:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!businessId || !auth.currentUser) {
      setLoading(false);
      return;
    }
    loadInstances();

    const q = tenantQuery(collection(db, "workflow_instances"), businessId);
    const key = `workflow_instances:${businessId}`;

    const unsubscribe = realtimeManager.subscribe(
      key,
      q,
      (snap: any) => {
        const arr: WorkflowInstance[] = [];
        snap.forEach((d: any) => arr.push({ id: d.id, ...d.data() } as WorkflowInstance));
        setInstances(arr);
        setLoading(false);
      },
      (error) => {
        console.warn("[WorkflowCenter] Realtime subscription warning:", error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [businessId, filter, auth.currentUser?.uid]);

  const filtered = instances.filter(i => {
    const matchesFilter = filter === "ALL" ? true : i.status === filter;
    const matchesSearch = searchTerm === "" ? true : (
      (i.correlationId && i.correlationId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (i.entityId && i.entityId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (i.id && i.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-slate-200">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Workflow className="text-blue-500" />
            Workflow Engine Center
          </h1>
          <p className="text-slate-400">Manage and monitor orchestration flows</p>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={loadInstances}
            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <select 
            className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All States</option>
            <option value="RUNNING">Running</option>
            <option value="WAITING_APPROVAL">Waiting Approval</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="ROLLED_BACK">Rolled Back</option>
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search Correlation/Entity ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-900/50 border-b border-slate-800">
            <tr>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Instance ID</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Entity</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Step</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Started</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">No workflow instances found for current filters.</td>
              </tr>
            ) : (
              filtered.map((inst) => (
                <tr key={inst.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-mono text-sm text-blue-400 font-bold">{inst.id}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{inst.correlationId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-white">{inst.entityType}</div>
                    <div className="text-xs text-slate-500">{inst.entityId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider
                      ${inst.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400' : ''}
                      ${inst.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : ''}
                      ${inst.status === 'FAILED' ? 'bg-rose-500/20 text-rose-400' : ''}
                      ${inst.status === 'WAITING_APPROVAL' ? 'bg-amber-500/20 text-amber-400' : ''}
                      ${inst.status === 'ROLLED_BACK' ? 'bg-purple-500/20 text-purple-400' : ''}
                    `}>
                      {inst.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-slate-300">
                    {inst.currentStep || "INITIAL"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-slate-400">{new Date(inst.startedAt).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Replay">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Details">
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
