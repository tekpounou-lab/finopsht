import React from "react";
import { CalendarRange, Clock } from "lucide-react";
import { Employee } from "../../../types";
import { format, startOfWeek, addDays } from "date-fns";

interface Shift {
  id: string;
  business_id: string;
  employeeId: string;
  branchId: string;
  departmentId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  status: "SCHEDULED" | "COMPLETED" | "CONFLICT" | string;
  plannedHours: number;
}

interface ShiftScheduleTimelineProps {
  employee: Employee;
  shifts: Shift[];
  tw: any;
}

export const ShiftScheduleTimeline: React.FC<ShiftScheduleTimelineProps> = ({
  employee,
  shifts,
  tw,
}) => {
  const baseDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(baseDate, i));

  const employeeShifts = shifts.filter((s) => s.employeeId === employee.id);

  const getShiftForDay = (dateStr: string) => {
    return employeeShifts.find((s) => s.date === dateStr);
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80" id="workspace-schedule-timeline">
      <h3 className="text-xs font-black font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-5 pb-2 border-b border-slate-800/50">
        <CalendarRange className="w-4.5 h-4.5 text-cyan-400" />
        {tw.planificationTitle || "PLANNING HEBDOMADAIRE DES POSTES"}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-7 gap-3">
        {weekDays.map((day, idx) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayName = format(day, "EEEE");
          const formattedDate = format(day, "dd MMM");
          const shift = getShiftForDay(dateStr);

          return (
            <div
              key={idx}
              className={`p-4 rounded-xl border flex flex-col justify-between min-h-[120px] transition-all duration-250 ${
                shift
                  ? "bg-slate-950 border-cyan-500/20 hover:border-cyan-500/40 shadow-lg shadow-cyan-500/2"
                  : "bg-slate-950/40 border-slate-800/60 hover:border-slate-800"
              }`}
            >
              <div>
                <p className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-wider truncate">
                  {dayName}
                </p>
                <p className="text-[11px] font-bold text-slate-300 mt-0.5">{formattedDate}</p>
              </div>

              <div className="mt-4">
                {shift ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 font-bold">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{shift.startTime} - {shift.endTime}</span>
                    </div>
                    <span className="inline-block text-[8px] font-mono font-black tracking-widest bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded uppercase">
                      {shift.status}
                    </span>
                  </div>
                ) : (
                  <span className="text-[9px] font-mono text-slate-600 font-medium italic block">
                    {tw.repos || "REPOS / OFF"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
