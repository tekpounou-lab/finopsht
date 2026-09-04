import React, { useState, useEffect } from 'react';
import { AttendanceRecord, Role, Employee } from '../../types';
import { ShieldAlert, AlertTriangle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useI18n } from '../../i18n';
import { 
  formatAttendanceVariance, 
  getAttendanceVarianceColorClass,
  findEmployeeByQrPayload
} from '../../lib/attendanceSSOT';

interface AttendanceGridProps {
  records: AttendanceRecord[];
  currentRole: Role;
  employees?: Employee[];
  onOverrideClick: (record: AttendanceRecord) => void;
  selectedIds?: string[];
  onToggleSelection?: (id: string) => void;
  onToggleSelectAll?: () => void;
}

export default function AttendanceGrid({ 
  records, 
  currentRole, 
  employees = [],
  onOverrideClick,
  selectedIds = [],
  onToggleSelection,
  onToggleSelectAll
}: AttendanceGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const totalPages = Math.max(1, Math.ceil(records.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentRecords = records.slice(startIndex, startIndex + itemsPerPage);

  const { t } = useI18n();

  return (
    <div className="mt-4 glass rounded-xl overflow-hidden backdrop-blur-md bg-slate-900/40 border border-slate-800/60">
      
      {/* DESKTOP TABLE */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-left font-sans text-xs whitespace-nowrap min-w-max">
          <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800">
            <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-extrabold child:py-3 child:px-4">
              <th className="w-8 text-center px-4">
                {(currentRole === "OWNER" || currentRole === "MANAGER") && (
                  <input 
                    type="checkbox" 
                    className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500/20 cursor-pointer w-3.5 h-3.5"
                    checked={records.length > 0 && selectedIds.length === records.length}
                    onChange={onToggleSelectAll}
                  />
                )}
              </th>
              <th className="w-10">{t.attendance.statusCol}</th>
              <th>{t.attendance.employeeCol}</th>
              <th>{t.attendance.dateCol}</th>
              <th className="text-center">{t.attendance.checkInCol}</th>
              <th className="text-center">{t.attendance.checkOutCol}</th>
              <th className="text-center">{t.attendance.hoursWorkedCol}</th>
              <th className="text-center">{t.attendance.varianceCol}</th>
              <th className="text-center">{t.attendance.approvedByCol}</th>
              <th className="text-center">{t.attendance.actionsCol}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono relative">
            <AnimatePresence initial={false} mode="popLayout">
              {currentRecords.length === 0 ? (
                <motion.tr
                  key="empty-state"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                    {t.attendance.noRecordFound}
                  </td>
                </motion.tr>
              ) : (
                currentRecords.map((item) => {
                  let statusClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  let statusLabel = (item.status as string) || "NORMAL";

                  if (item.checkIn && !item.checkOut) {
                    statusClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
                    statusLabel = "PRÉSENT";
                  } else if (item.status === "LATE") {
                    statusClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                  } else if (item.status === "ABSENT") {
                    statusClass = "bg-rose-500/10 text-rose-450 border-rose-500/20";
                  } else if (item.status === "PENDING_VERIFICATION") {
                    statusClass = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
                  }

                  // Check for manual overrides via the presence of overrideBy
                  const isOverridden = !!item.overrideBy;
                  if (isOverridden) {
                    statusClass += " border border-amber-500";
                    statusLabel = "OVERRIDE";
                  }

                  const matchedEmp = employees.length > 0 ? findEmployeeByQrPayload(item.employeeId, employees) : null;
                  const displayName = matchedEmp?.name || item.employeeName || item.employeeId;
                  const regCode = (matchedEmp as any)?.registrationNumber || (matchedEmp as any)?.registration_number || (matchedEmp as any)?.badgeNumber || (matchedEmp as any)?.code || (item as any).badgeNumber || (item as any).employee_id || item.employeeId;

                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="hover:bg-slate-900/60 transition-colors group"
                    >
                      <td className="w-8 text-center px-4 py-2.5">
                        {(currentRole === "OWNER" || currentRole === "MANAGER") && (
                          <input 
                            type="checkbox" 
                            className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500/20 cursor-pointer w-3.5 h-3.5"
                            checked={selectedIds.includes(item.id)}
                            onChange={() => onToggleSelection?.(item.id)}
                          />
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-200">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-100">{displayName}</span>
                          <span className="text-[10px] text-cyan-400 font-mono font-normal flex items-center gap-1">
                            <span className="text-slate-500">REG:</span> {regCode}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">
                        {item.date}
                      </td>
                      <td className="py-2.5 px-4 text-center text-cyan-400 font-bold">
                        {item.checkIn || "--:--:--"}
                      </td>
                      <td className="py-2.5 px-4 text-center text-indigo-400 font-bold">
                        {item.checkOut || "--:--:--"}
                      </td>
                      <td className="py-2.5 px-4 text-center font-bold text-slate-100">
                        {item.checkOut ? `${item.realHours} h` : <span className="text-cyan-400 text-xs font-normal">En cours</span>} <span className="text-slate-600 text-[10px]">/ {item.plannedHours}h</span>
                      </td>
                      <td className={`py-2.5 px-4 text-center font-bold ${item.checkOut ? getAttendanceVarianceColorClass(item.variance) : "text-slate-500"}`}>
                        {item.checkOut ? formatAttendanceVariance(item.variance) : "--"}
                      </td>
                      <td className="py-2.5 px-4 text-center text-[10px] text-slate-500">
                        {item.overrideBy ? (
                          <div className="flex items-center justify-center gap-1 text-amber-500">
                            <AlertTriangle className="w-3 h-3" /> {item.overrideBy}
                          </div>
                        ) : (
                          t.attendance.systemLabel
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {(currentRole === "OWNER" || currentRole === "MANAGER") ? (
                          <button
                            onClick={() => onOverrideClick(item)}
                            className="bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold px-2 py-1 rounded text-[9.5px] font-sans transition-all cursor-pointer"
                          >
                            {t.attendance.adjustBtn}
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-600 flex items-center justify-center gap-0.5" title="Modification restreinte">
                            <ShieldAlert className="w-3.5 h-3.5" /> {t.attendance.restrictedLabel}
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="flex flex-col md:hidden divide-y divide-slate-800/60 font-mono text-xs">
        <AnimatePresence initial={false} mode="popLayout">
          {currentRecords.length === 0 ? (
            <motion.div
              key="empty-mobile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="py-12 text-center text-slate-500 font-sans italic"
            >
              {t.attendance.noRecordFound}
            </motion.div>
          ) : (
            currentRecords.map((item) => {
              let statusClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              let statusLabel = (item.status as string) || "NORMAL";

              if (item.checkIn && !item.checkOut) {
                statusClass = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
                statusLabel = "PRÉSENT";
              } else if (item.status === "LATE") {
                statusClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              } else if (item.status === "ABSENT") {
                statusClass = "bg-rose-500/10 text-rose-450 border-rose-500/20";
              } else if (item.status === "PENDING_VERIFICATION") {
                statusClass = "bg-cyan-400/10 text-cyan-400 border-cyan-500/20";
              }

              const isOverridden = !!item.overrideBy;
              if (isOverridden) {
                statusClass += " border border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.2)]";
                statusLabel = "OVERRIDE";
              }

              const matchedEmpMobile = employees.length > 0 ? findEmployeeByQrPayload(item.employeeId, employees) : null;
              const mobileDisplayName = matchedEmpMobile?.name || item.employeeName || item.employeeId;
              const mobileRegCode = (matchedEmpMobile as any)?.registrationNumber || (matchedEmpMobile as any)?.registration_number || (matchedEmpMobile as any)?.badgeNumber || (matchedEmpMobile as any)?.code || (item as any).badgeNumber || (item as any).employee_id || item.employeeId;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.2 }}
                  className="p-5 flex flex-col gap-4 hover:bg-slate-900/40 transition-colors group relative"
                >
                  {(currentRole === "OWNER" || currentRole === "MANAGER") && (
                    <div className="absolute top-5 right-5 z-10">
                      <input 
                        type="checkbox" 
                        className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-500/20 cursor-pointer w-4 h-4"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => onToggleSelection?.(item.id)}
                      />
                    </div>
                  )}
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-2 pr-8">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black font-sans w-max uppercase tracking-wider border ${statusClass}`}>
                        {statusLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        <h4 className="font-sans font-black text-slate-100 text-sm leading-tight tracking-tight mt-1">{mobileDisplayName}</h4>
                        <span className="text-[10px] text-cyan-400 font-mono font-normal bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                          REG: {mobileRegCode}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                        <Clock className="w-3 h-3" />
                        <span>{item.date}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none">Réel</span>
                        <span className="text-sm font-black text-slate-100 leading-none">{item.checkOut ? `${item.realHours}h` : "En cours"}</span>
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${item.checkOut ? getAttendanceVarianceColorClass(item.variance) : "text-slate-500"}`}>
                        {item.checkOut ? formatAttendanceVariance(item.variance) : "--"}
                      </span>
                      {item.overrideBy && (
                        <div className="mt-1 flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="text-[9px] font-black uppercase">{item.overrideBy}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-3 bg-slate-950/50 rounded-xl border border-slate-800/40 shadow-inner">
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Check In</span>
                      <span className="text-cyan-400 font-black text-xs">{item.checkIn || "--:--:--"}</span>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Check Out</span>
                      <span className="text-indigo-400 font-black text-xs">{item.checkOut || "--:--:--"}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-slate-600 text-[9px] font-black uppercase tracking-widest">Planifié</span>
                      <span className="text-slate-400 font-bold text-xs">{item.plannedHours}h</span>
                    </div>
                    {(currentRole === "OWNER" || currentRole === "MANAGER") ? (
                      <button
                        onClick={() => onOverrideClick(item)}
                        className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-black px-4 py-2 rounded-xl text-[10px] font-sans transition-all active:scale-95 shadow-sm uppercase tracking-wider"
                      >
                        {t.attendance.adjustBtn}
                      </button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center gap-2 bg-slate-950/50 py-2 rounded-xl border border-slate-900 text-[9px] text-slate-600 font-black uppercase tracking-widest">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Lecture Seule
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* PAGINATION UI */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-t border-slate-800/60">
          <div className="text-xs font-mono text-slate-500">
            Page {currentPage} sur {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all bg-slate-900 border border-slate-700 text-slate-300 hover:bg-cyan-900 hover:text-cyan-400 hover:border-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Précédent
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold font-sans transition-all bg-slate-900 border border-slate-700 text-slate-300 hover:bg-cyan-900 hover:text-cyan-400 hover:border-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
