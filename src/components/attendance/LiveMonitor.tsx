import React from 'react';
import { AttendanceRecord, Employee } from '../../types';
import { Clock, UserCheck, AlertTriangle, Fingerprint } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../../i18n';

interface LiveMonitorProps {
  records: AttendanceRecord[];
  activeEmployeesCount: number;
  lateEmployeesCount: number;
  absentEmployeesCount: number;
}

const monitorDict = {
  fr: {
    activeAgents: "Agents Actifs",
    late: "En Retard",
    absent: "Absents",
    totalLogs: "Total Enregistrements"
  },
  ht: {
    activeAgents: "Ajan ki La yo",
    late: "An Reta",
    absent: "Moun ki Pa Vini",
    totalLogs: "Total Sistèm Pwentaj"
  },
  en: {
    activeAgents: "Active Agents",
    late: "Late Arrivals",
    absent: "Absent Work",
    totalLogs: "Total Clock-Ins"
  }
};

export default function LiveMonitor({ records, activeEmployeesCount, lateEmployeesCount, absentEmployeesCount }: LiveMonitorProps) {
  const { language } = useI18n();
  const d = monitorDict[(language === "ht" || language === "en") ? language : "fr"];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider">{d.activeAgents}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-emerald-300">{activeEmployeesCount}</div>
      </motion.div>
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">{d.late}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-amber-300">{lateEmployeesCount}</div>
      </motion.div>
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span className="text-[10px] text-rose-400/80 font-bold uppercase tracking-wider">{d.absent}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-rose-300">{absentEmployeesCount}</div>
      </motion.div>
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-4 rounded-xl border border-slate-800/60 bg-slate-900/40 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <Fingerprint className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{d.totalLogs}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-slate-200">{records.length}</div>
      </motion.div>
    </div>
  );
}
