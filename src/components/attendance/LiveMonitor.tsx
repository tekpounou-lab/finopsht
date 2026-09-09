import React from 'react';
import { AttendanceRecord } from '../../types';
import { Clock, UserCheck, AlertTriangle, Fingerprint, Timer, TrendingUp, TrendingDown, Scale } from 'lucide-react';
import { motion } from 'motion/react';
import { useI18n } from '../../i18n';
import { calculateAttendanceVariance, formatAttendanceVariance } from '../../lib/attendanceSSOT';

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
    hoursWorked: "Heures Travaillées",
    hoursVariance: "Écart / Variance",
    totalLogs: "Total Pointages"
  },
  ht: {
    activeAgents: "Ajan ki La yo",
    late: "An Reta",
    absent: "Moun ki Pa Vini",
    hoursWorked: "Lè Travay Total",
    hoursVariance: "Eka / Varyans Lè",
    totalLogs: "Total Pwentaj"
  },
  en: {
    activeAgents: "Active Agents",
    late: "Late Arrivals",
    absent: "Absent Work",
    hoursWorked: "Hours Worked",
    hoursVariance: "Hours Variance",
    totalLogs: "Total Clock-Ins"
  }
};

export default function LiveMonitor({ records, activeEmployeesCount, lateEmployeesCount, absentEmployeesCount }: LiveMonitorProps) {
  const { language } = useI18n();
  const d = monitorDict[(language === "ht" || language === "en") ? language : "fr"];

  // Calculate total worked hours and variance SSOT across current filtered records
  const totalWorkedHours = records.reduce((sum, r) => sum + (Number(r.realHours) || 0), 0);
  const totalPlannedHours = records.reduce((sum, r) => sum + (Number(r.plannedHours) > 0 ? Number(r.plannedHours) : (r.checkIn ? 8 : 0)), 0);
  const totalVariance = calculateAttendanceVariance(totalWorkedHours, totalPlannedHours);

  const formattedHours = `${Math.round(totalWorkedHours * 10) / 10}h`;
  const formattedVariance = formatAttendanceVariance(totalVariance);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mt-4">
      {/* 1. Agents Actifs */}
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-3.5 sm:p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider truncate">{d.activeAgents}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-emerald-300">{activeEmployeesCount}</div>
      </motion.div>

      {/* 2. En Retard */}
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-3.5 sm:p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider truncate">{d.late}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-amber-300">{lateEmployeesCount}</div>
      </motion.div>

      {/* 3. Absents */}
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-3.5 sm:p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-[10px] text-rose-400/80 font-bold uppercase tracking-wider truncate">{d.absent}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-rose-300">{absentEmployeesCount}</div>
      </motion.div>

      {/* 4. Heures Travaillées */}
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-3.5 sm:p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <Timer className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-[10px] text-indigo-400/80 font-bold uppercase tracking-wider truncate">{d.hoursWorked}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-1">
          <span className="text-2xl font-black font-mono text-indigo-200">{formattedHours}</span>
          <span className="text-[9px] font-mono text-indigo-400/70 font-semibold truncate">
            {totalPlannedHours > 0 ? `/ ${Math.round(totalPlannedHours)}h plan` : ''}
          </span>
        </div>
      </motion.div>

      {/* 5. Écart / Variance */}
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={`glass p-3.5 sm:p-4 rounded-xl border flex flex-col justify-between ${
          totalVariance > 0
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : totalVariance < 0
            ? 'border-rose-500/40 bg-rose-500/10'
            : 'border-slate-800 bg-slate-900/40'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          {totalVariance > 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : totalVariance < 0 ? (
            <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Scale className="w-4 h-4 text-slate-400 shrink-0" />
          )}
          <span className={`text-[10px] font-bold uppercase tracking-wider truncate ${
            totalVariance > 0 ? 'text-emerald-400/90' : totalVariance < 0 ? 'text-rose-400/90' : 'text-slate-400'
          }`}>
            {d.hoursVariance}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-1">
          <span className={`text-2xl font-black font-mono ${
            totalVariance > 0 ? 'text-emerald-300' : totalVariance < 0 ? 'text-rose-300' : 'text-slate-300'
          }`}>
            {formattedVariance}
          </span>
          <span className={`text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded ${
            totalVariance > 0
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
              : totalVariance < 0
              ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
              : 'bg-slate-800 text-slate-400'
          }`}>
            {totalVariance > 0 ? 'Surplus' : totalVariance < 0 ? 'Déficit' : 'Neutre'}
          </span>
        </div>
      </motion.div>

      {/* 6. Total Enregistrements */}
      <motion.div
        whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="glass p-3.5 sm:p-4 rounded-xl border border-slate-800/60 bg-slate-900/40 flex flex-col justify-between"
      >
        <div className="flex items-center gap-2 mb-1">
          <Fingerprint className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate">{d.totalLogs}</span>
        </div>
        <div className="mt-2 text-2xl font-black font-mono text-slate-200">{records.length}</div>
      </motion.div>
    </div>
  );
}
