
import React, { useEffect, useState } from "react";
import { Cpu, Play, Pause, RotateCcw, Clock, AlertCircle } from "lucide-react";
import { JobEngine, Job } from "../../modules/runtime/JobEngine";

export const JobCenter: React.FC = () => {
  const [snapshot, setSnapshot] = useState(JobEngine.getSnapshot());

  useEffect(() => {
    const interval = setInterval(() => {
      setSnapshot(JobEngine.getSnapshot());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 bg-slate-950 min-h-screen text-slate-200">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Cpu className="text-purple-500" />
            Enterprise Job Center
          </h1>
          <p className="text-slate-400">Background task orchestration and scheduling</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${snapshot.isProcessing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-sm font-mono text-slate-300">
              {snapshot.isProcessing ? 'PROCESSING' : 'IDLE'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center">
              <h2 className="font-semibold">Queue ({snapshot.queue.length})</h2>
              <span className="text-xs text-slate-500">Sorted by Priority</span>
            </div>
            <div className="divide-y divide-slate-800">
              {snapshot.queue.length === 0 ? (
                <div className="p-12 text-center text-slate-500 italic">Job queue is currently empty.</div>
              ) : (
                snapshot.queue.map((job) => (
                  <div key={job.id} className="p-5 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-1 h-8 rounded-full ${
                        job.priority === 'HIGH' ? 'bg-rose-500' : 
                        job.priority === 'NORMAL' ? 'bg-blue-500' : 'bg-slate-500'
                      }`} />
                      <div>
                        <div className="font-mono text-sm text-white font-bold">{job.type}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{job.id}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs font-mono text-slate-400">
                          {job.scheduledFor ? `Scheduled: ${new Date(job.scheduledFor).toLocaleTimeString()}` : 'Ready'}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Attempts: {job.attempts}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.priority === 'HIGH' ? 'bg-rose-500/20 text-rose-400' : 
                        job.priority === 'NORMAL' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400'
                      }`}>
                        {job.priority}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Scheduler Stats
            </h3>
            <div className="space-y-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Jobs Today</span>
                <span className="text-white font-mono">1,204</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Success Rate</span>
                <span className="text-emerald-400 font-mono">99.8%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Avg Execution Time</span>
                <span className="text-blue-400 font-mono">245ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Dead Jobs</span>
                <span className="text-rose-500 font-mono">0</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              Retry Policy
            </h3>
            <div className="text-[11px] text-slate-400 space-y-2">
              <p>• Max Attempts: <b>3</b></p>
              <p>• Backoff: <b>Exponential (5s, 15s, 60s)</b></p>
              <p>• DLQ Routing: <b>Automatic after final failure</b></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
