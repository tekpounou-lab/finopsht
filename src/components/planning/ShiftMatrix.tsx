import React from 'react';
import { Employee, Department, Branch } from '../../types';
import { Shift } from './types';
import { addDays, format, startOfWeek, differenceInDays, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ShiftMatrixProps {
  employees: Employee[];
  shifts: Shift[];
  departments: Department[];
  branches: Branch[];
  currentDate: Date;
  onShiftMove: (shiftId: string, newDate: string, newEmployeeId: string) => void;
  onShiftClick: (shift: Shift) => void;
  onShiftCopy?: (shift: Omit<Shift, "id">) => void;
  dateRange?: { start: string; end: string } | null;
}

const DraggableShift = ({ 
  shift, 
  onCopy 
}: { 
  shift: Shift; 
  onCopy: (e: React.MouseEvent) => void; 
}) => {
  const [isDragging, setIsDragging] = React.useState(false);

  let bgClass = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
  if (shift.status === 'COMPLETED') bgClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  if (shift.status === 'ABSENT') bgClass = "bg-rose-500/10 text-rose-400 border-rose-500/30";
  if (shift.status === 'LATE') bgClass = "bg-amber-500/10 text-amber-400 border-amber-500/30";
  if (shift.status === 'CONFLICT') bgClass = "bg-rose-500/10 text-rose-400 border-rose-500 border-2";

  return (
    <div 
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData("text/plain", shift.id);
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onContextMenu={onCopy}
      className={`relative group p-1.5 rounded-md border text-[9px] font-bold font-mono shadow-sm hover:opacity-80 transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40 scale-95' : ''} ${bgClass}`}
      title="Glissez-déposez pour déplacer | Clic droit pour copier"
    >
      {shift.startTime} - {shift.endTime}
    </div>
  );
};

const DroppableCell = ({ 
  shifts, 
  onShiftClick, 
  onPaste, 
  canPaste, 
  onCopy,
  onDropShift
}: { 
  id: string; 
  shifts: Shift[]; 
  onShiftClick: (s: Shift) => void; 
  onPaste: () => void; 
  canPaste: boolean; 
  onCopy: (s: Shift) => (e: React.MouseEvent) => void;
  onDropShift: (shiftId: string) => void;
}) => {
  const [isOver, setIsOver] = React.useState(false);
  
  return (
    <div 
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const shiftId = e.dataTransfer.getData("text/plain");
        if (shiftId) {
          onDropShift(shiftId);
        }
      }}
      className={`group/cell relative min-h-[60px] p-1.5 border-b border-r border-slate-800/50 transition-colors ${isOver ? 'bg-cyan-900/30 ring-1 ring-cyan-500/50' : 'hover:bg-slate-800/30'}`}
    >
      {canPaste && (
        <div 
          onClick={(e) => { e.stopPropagation(); onPaste(); }}
          className="absolute inset-0 z-10 hidden group-hover/cell:flex items-center justify-center bg-cyan-900/40 backdrop-blur-[1px] cursor-pointer"
        >
          <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider bg-slate-900 px-2 py-1 rounded shadow-lg border border-cyan-500/30">
            Coller Shift
          </span>
        </div>
      )}
      <div className="flex flex-col gap-1.5 relative z-20">
        {shifts.map(s => (
          <div key={s.id} onClick={(e) => { e.stopPropagation(); onShiftClick(s); }}>
             <DraggableShift shift={s} onCopy={onCopy(s)} />
          </div>
        ))}
      </div>
    </div>
  );
};

const ShiftMatrix: React.FC<ShiftMatrixProps> = ({ employees, shifts, departments, branches, currentDate, onShiftMove, onShiftClick, onShiftCopy, dateRange }) => {
  let displayDays: Date[] = [];
  
  if (dateRange && dateRange.start && dateRange.end) {
    const startD = parseISO(dateRange.start);
    const endD = parseISO(dateRange.end);
    const diff = differenceInDays(endD, startD);
    if (diff >= 0 && diff <= 31) { // Limit to 31 max days to avoid massive DOM
      displayDays = Array.from({ length: diff + 1 }).map((_, i) => addDays(startD, i));
    }
  }

  if (displayDays.length === 0) {
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
    displayDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  }

  const [copiedShift, setCopiedShift] = React.useState<Shift | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCopiedShift(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const wrapContextMenu = (shift: Shift) => (e: React.MouseEvent) => {
    e.preventDefault();
    setCopiedShift(shift);
  };

  const handlePaste = (dateStr: string, empId: string) => {
    if (copiedShift && onShiftCopy) {
      const { id, ...shiftWithoutId } = copiedShift;
      onShiftCopy({ ...shiftWithoutId, date: dateStr, employeeId: empId });
      setCopiedShift(null);
    }
  };

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name || id;

  return (
    <div className="mt-4 bg-slate-900/40 border border-slate-800/60 rounded-xl backdrop-blur-md">
      {copiedShift && (
        <div className="p-2 bg-indigo-900/30 border-b border-indigo-500/20 text-center flex items-center justify-center gap-2">
          <span className="text-xs text-indigo-200">
            Un shift est copié ({copiedShift.startTime} - {copiedShift.endTime}). 
            Cliquez sur un jour vide pour <strong className="text-cyan-400">Coller</strong>.
          </span>
          <button onClick={() => setCopiedShift(null)} className="text-[10px] text-rose-400 font-bold uppercase hover:underline ml-2">Annuler (Echap)</button>
        </div>
      )}
      {/* DESKTOP MATRIX */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-left font-sans text-xs min-w-[900px]">
          <thead className="bg-slate-950/80 sticky top-0 z-10">
            <tr className="text-[10px] uppercase text-slate-400 tracking-wider font-extrabold child:py-3 child:px-3 border-b border-slate-800/60">
              <th className="w-48 border-r border-slate-800/50">Employé</th>
              {displayDays.map(d => (
                <th key={d.toISOString()} className="w-32 border-r border-slate-800/50 text-center">
                  <span className="block text-slate-300">{format(d, 'EEEE', { locale: fr })}</span>
                  <span className="text-slate-500 font-mono text-[9px]">{format(d, 'dd MMM')}</span>
                </th>
              ))}
              <th className="w-24 text-center">Total (H)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {employees.map(emp => {
              const empShifts = shifts.filter(s => s.employeeId === emp.id);
              const weeklyHours = empShifts.reduce((acc, s) => acc + s.plannedHours, 0);
              
              return (
                <tr key={emp.id} className="group hover:bg-slate-900/40 transition-colors">
                  <td className="py-2 px-3 border-r border-slate-800/50 bg-slate-950/40">
                    <div className="font-bold text-slate-200 truncate">{emp.name}</div>
                    <div className="text-[9px] font-mono text-slate-500 truncate">{getDeptName(emp.departmentId)}</div>
                  </td>
                  {displayDays.map(d => {
                    const dateStr = format(d, 'yyyy-MM-dd');
                    const cellId = `${emp.id}|${dateStr}`;
                    const dayShifts = empShifts.filter(s => s.date === dateStr);
                    return (
                      <td key={d.toISOString()} className="p-0 align-top">
                        <DroppableCell 
                          id={cellId} 
                          shifts={dayShifts} 
                          onShiftClick={onShiftClick} 
                          onPaste={() => handlePaste(dateStr, emp.id)}
                          canPaste={copiedShift !== null}
                          onCopy={wrapContextMenu}
                          onDropShift={(shiftId) => onShiftMove(shiftId, dateStr, emp.id)}
                        />
                      </td>
                    );
                  })}
                  <td className="py-2 px-3 text-center align-middle bg-slate-950/40">
                    <span className={`font-mono text-xs font-bold ${weeklyHours > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {weeklyHours}h
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="flex flex-col md:hidden divide-y divide-slate-800/60 p-2 gap-3">
          {employees.map(emp => {
              const empShifts = shifts.filter(s => s.employeeId === emp.id);
              const weeklyHours = empShifts.reduce((acc, s) => acc + s.plannedHours, 0);
              
              return (
                 <div key={emp.id} className="bg-slate-950/50 rounded-xl border border-slate-800 p-3 flex flex-col gap-3">
                    <div className="flex justify-between items-start border-b border-slate-800/50 pb-2">
                      <div className="flex flex-col">
                         <span className="font-bold text-slate-200">{emp.name}</span>
                         <span className="text-[10px] font-mono text-slate-500">{getDeptName(emp.departmentId)}</span>
                      </div>
                      <div className="flex flex-col items-end">
                         <span className={`font-mono text-xs font-bold ${weeklyHours > 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {weeklyHours}h <span className="text-slate-500 font-sans font-normal text-[9px]">cumulées</span>
                         </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                       {displayDays.map(d => {
                          const dateStr = format(d, 'yyyy-MM-dd');
                          const dayShifts = empShifts.filter(s => s.date === dateStr);
                          if (dayShifts.length === 0) return null;
                          return (
                             <div key={dateStr} className="flex flex-col gap-1.5 p-2 bg-slate-900/40 rounded-lg">
                                <span className="text-[10px] text-slate-400 font-bold uppercase">{format(d, 'EEEE dd MMM', { locale: fr })}</span>
                                <div className="flex flex-wrap gap-2">
                                   {dayShifts.map(s => {
                                      let bgClass = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
                                      if (s.status === 'COMPLETED') bgClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
                                      if (s.status === 'ABSENT') bgClass = "bg-rose-500/10 text-rose-400 border-rose-500/30";
                                      if (s.status === 'LATE') bgClass = "bg-amber-500/10 text-amber-400 border-amber-500/30";
                                      if (s.status === 'CONFLICT') bgClass = "bg-rose-500/10 text-rose-400 border-rose-500 border-2";

                                      return (
                                         <div key={s.id} onClick={(e) => { e.stopPropagation(); onShiftClick(s); }} className={`px-2 py-1 rounded-md border text-[10px] font-bold font-mono shadow-sm cursor-pointer ${bgClass}`}>
                                            {s.startTime} - {s.endTime}
                                         </div>
                                      )
                                   })}
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 </div>
              );
          })}
      </div>
    </div>
  );
};

export default ShiftMatrix;
