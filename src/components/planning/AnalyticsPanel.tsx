import React from 'react';
import { Shift } from './types';
import { motion } from 'motion/react';
import { Clock, CheckCircle, AlertTriangle, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { SafeChartContainer } from '../ui/SafeChartContainer';
import { format, parseISO, getDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useTheme } from "../../contexts/ThemeContext";

interface AnalyticsPanelProps {
  shifts: Shift[];
}

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ shifts }) => {
  const { resolvedTheme } = useTheme();
  const totalPlanned = shifts.reduce((acc, s) => acc + s.plannedHours, 0);
  const totalWorked = shifts.reduce((acc, s) => acc + (s.workedHours || 0), 0);
  const overtimeShifts = shifts.filter(s => s.isOvertime).length;
  
  const completed = shifts.filter(s => s.status === 'COMPLETED').length;
  const compliance = shifts.length > 0 ? Math.round((completed / shifts.length) * 100) : 0;

  // Prepare data for line chart
  const daysMap = new Map<string, { name: string; overtime: number }>();
  // init with 7 days of the week?
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  shifts.forEach(s => {
     let hr = 0;
     if (s.isOvertime) {
        hr = Math.max(0, (s.workedHours || 0) - s.plannedHours);
     }
     // fallback if it just marked as overtime without workedHours
     if (s.isOvertime && hr === 0) hr = 2; // simulated
     
     if (hr > 0 && s.date) {
        const d = parseISO(s.date);
        if (!isNaN(d.getTime())) {
           const dayIdx = getDay(d);
           const dayName = dayNames[dayIdx];
           const exists = daysMap.get(dayName);
           if (exists) {
              exists.overtime += hr;
           } else {
              daysMap.set(dayName, { name: dayName, overtime: hr });
           }
        }
     }
  });
  
  // ensure ordered
  const orderedDays = [1,2,3,4,5,6,0].map(idx => dayNames[idx]); // Lun to Dim
  const chartData = orderedDays.map(name => daysMap.get(name) || { name, overtime: 0 });

  return (
    <div className="flex flex-col gap-4 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="glass p-4 rounded-xl border border-slate-800/60 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Heures Prévues</span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-200">{totalPlanned}h</div>
        </motion.div>
        <motion.div
          whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="glass p-4 rounded-xl border border-slate-800/60 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Conformité</span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-200">{compliance}%</div>
        </motion.div>
        <motion.div
          whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="glass p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="text-[10px] text-rose-400/80 font-bold uppercase tracking-wider">Alertes Heures Sup.</span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-rose-300">{overtimeShifts}</div>
        </motion.div>
        <motion.div
          whileHover={{ y: -3, scale: 1.02, boxShadow: "0 10px 20px -6px rgba(0, 0, 0, 0.45)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="glass p-4 rounded-xl border border-slate-800/60 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tours Actifs</span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-200">{shifts.filter(s => s.status === 'SCHEDULED' || s.status === 'COMPLETED').length}</div>
        </motion.div>
      </div>

      <div className="glass p-4 rounded-xl border border-slate-800/60">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Heures Supplémentaires par Jour</h4>
        <div className="h-48 w-full">
          <SafeChartContainer height="100%" minHeight={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={resolvedTheme === "light" ? "#cbd5e1" : "#334155"} vertical={false} />
              <XAxis dataKey="name" stroke={resolvedTheme === "light" ? "#475569" : "#94a3b8"} fontSize={10} tickLine={false} axisLine={false} />
              <YAxis stroke={resolvedTheme === "light" ? "#475569" : "#94a3b8"} fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={resolvedTheme === "light" 
                  ? { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', fontSize: '12px' }
                  : { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#cbd5e1', fontSize: '12px' }}
                itemStyle={{ color: '#38bdf8' }}
              />
              <Line type="monotone" dataKey="overtime" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4, fill: resolvedTheme === "light" ? '#ffffff' : '#0f172a', stroke: '#38bdf8', strokeWidth: 2 }} activeDot={{ r: 6 }} name="Heures Sup" />
            </LineChart>
          </SafeChartContainer>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPanel;
