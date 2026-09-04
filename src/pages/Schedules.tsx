import React, { useState, useEffect } from 'react';
import { Employee, Branch, Department, Role, ERPEvent, ForensicLog } from '../types';
import { Shift, ShiftFilters, ShiftStatus } from '../components/planning/types';
import FilterToolbar from '../components/planning/FilterToolbar';
import AnalyticsPanel from '../components/planning/AnalyticsPanel';
import ShiftMatrix from '../components/planning/ShiftMatrix';
import CreateShiftDialog from '../components/planning/CreateShiftDialog';
import AutoScheduleDialog from '../components/planning/AutoScheduleDialog';
import CopyWeekDialog from '../components/planning/CopyWeekDialog';
import MassImportShiftModal from '../components/planning/MassImportShiftModal';
import ShiftTemplateManager from '../components/planning/ShiftTemplateManager';
import EmployeeAssignmentPanel from '../components/planning/EmployeeAssignmentPanel';
import ConflictResolver from '../components/planning/ConflictResolver';
import { useI18n } from '../i18n';
import { ScheduleRepository } from '../repositories/ScheduleRepository';
import { PlanningDomainService } from '../domains/planning/services/PlanningDomainService';
import { db } from '../lib/firebase';
import { CalendarRange, Sparkles, Plus, Download, FileSpreadsheet, Copy, Upload } from 'lucide-react';
import { format, startOfWeek, addDays, differenceInDays } from 'date-fns';
import * as xlsx from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { QrCode, X } from 'lucide-react';
import CameraQrScanner from '../components/attendance/CameraQrScanner';
import { toast } from 'sonner';

interface SchedulesProps {
  currentRole: Role;
  current_business_id: string;
  currentUser: Employee;
  employees: Employee[];
  branches: Branch[];
  departments: Department[];
  shifts?: Shift[];
  onAddEvent?: (ev: ERPEvent) => void;
  onAddForensicLog?: (log: ForensicLog) => void;
}

// Validation function to flag overlapping shifts at different locations
function validateOverlappingShifts(rawShifts: Shift[]): Shift[] {
  // We deep clone to avoid mutating state directly, though we only mutate status
  const enriched = rawShifts.map(s => ({ ...s }));
  const grouped: Record<string, Shift[]> = {};
  enriched.forEach(s => {
    const k = `${s.employeeId}_${s.date}`;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(s);
  });

  Object.values(grouped).forEach(dayShifts => {
    if (dayShifts.length > 1) {
      for (let i = 0; i < dayShifts.length; i++) {
        for (let j = i + 1; j < dayShifts.length; j++) {
          const s1 = dayShifts[i];
          const s2 = dayShifts[j];
          if (s1.branchId !== s2.branchId) {
            const start1 = parseFloat(s1.startTime.replace(':', '.'));
            const end1 = parseFloat(s1.endTime.replace(':', '.'));
            const start2 = parseFloat(s2.startTime.replace(':', '.'));
            const end2 = parseFloat(s2.endTime.replace(':', '.'));
            // If overlap exists
            if (Math.max(start1, start2) < Math.min(end1, end2)) {
              s1.status = 'CONFLICT';
              s2.status = 'CONFLICT';
            }
          }
        }
      }
    }
  });
  return enriched;
}

export default function Schedules({
  currentRole,
  current_business_id,
  currentUser,
  employees,
  branches,
  departments,
  shifts: shiftsProp,
  onAddEvent,
  onAddForensicLog
}: SchedulesProps) {
  const { language, t } = useI18n();
  const shifts = React.useMemo(() => validateOverlappingShifts(shiftsProp || []), [shiftsProp, employees, current_business_id]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [filters, setFilters] = useState<ShiftFilters>({
    branchId: 'ALL',
    departmentId: 'ALL',
    status: 'ALL',
    search: '',
    dateRange: null
  });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [isMassImportOpen, setIsMassImportOpen] = useState(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [processedWeeks, setProcessedWeeks] = useState<string[]>([]);
  const [isRolloverInProgress, setIsRolloverInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState<'calendar' | 'templates' | 'assignments' | 'conflicts'>('calendar');

  // Sync with shifts prop and validate conflicts
  // We compute shifts via useMemo now, so this useEffect is removed.

  // Engine for Automatic Weekly Rollover of Active Employees' Schedules
  useEffect(() => {
    if (!['OWNER', 'MANAGER'].includes(currentRole)) return;
    if (employees.length === 0 || isRolloverInProgress || shifts.length === 0) return;

    const startOfTargetWeek = startOfWeek(currentDate, { weekStartsOn: 1 });
    const targetWeekKey = format(startOfTargetWeek, 'yyyy-MM-dd');

    // Skip if already processed in this component session
    if (processedWeeks.includes(targetWeekKey)) return;

    const runRollover = async () => {
      setIsRolloverInProgress(true);
      try {
        const startOfWeekStr = targetWeekKey;
        const endOfWeekStr = format(addDays(startOfTargetWeek, 6), 'yyyy-MM-dd');

        // Active employees of the current business
        const activeEmployees = employees.filter(e => 
          e.business_id === current_business_id && e.isActive !== false
        );

        const newShiftsToSave: Shift[] = [];

        for (const emp of activeEmployees) {
          // Check if the employee has any manual shifts defined in the target week
          const hasTargetWeekShifts = shifts.some(s => 
            s.employeeId === emp.id && 
            s.date >= startOfWeekStr && 
            s.date <= endOfWeekStr
          );

          if (hasTargetWeekShifts) {
            continue;
          }

          // Search back for previous week's shifts (offset by 1 week up to 4 weeks)
          let foundPriorShifts: Shift[] = [];
          for (let offset = 1; offset <= 4; offset++) {
            const checkWeekStart = addDays(startOfTargetWeek, -7 * offset);
            const checkWeekEnd = addDays(checkWeekStart, 6);
            const checkWeekStartStr = format(checkWeekStart, 'yyyy-MM-dd');
            const checkWeekEndStr = format(checkWeekEnd, 'yyyy-MM-dd');

            const priorShifts = shifts.filter(s => 
              s.employeeId === emp.id && 
              s.date >= checkWeekStartStr && 
              s.date <= checkWeekEndStr
            );

            if (priorShifts.length > 0) {
              foundPriorShifts = priorShifts;
              break; // Found the most recent week with shifts!
            }
          }

          if (foundPriorShifts.length > 0) {
            // Copy the format from the found week to the target week
            foundPriorShifts.forEach(s => {
              const prevDate = new Date(s.date);
              const prevWeekStartOfThatShift = startOfWeek(prevDate, { weekStartsOn: 1 });
              const dayDiff = differenceInDays(prevDate, prevWeekStartOfThatShift);
              const targetDate = addDays(startOfTargetWeek, dayDiff);
              const targetDateStr = format(targetDate, 'yyyy-MM-dd');

              const newShiftId = `shf_auto_${emp.id}_${targetDateStr}_${Math.random().toString(36).substring(2, 9)}`;
              newShiftsToSave.push({
                id: newShiftId,
                business_id: current_business_id,
                employeeId: emp.id,
                branchId: s.branchId || emp.branchId,
                departmentId: s.departmentId || emp.departmentId,
                date: targetDateStr,
                startTime: s.startTime,
                endTime: s.endTime,
                status: 'SCHEDULED',
                plannedHours: s.plannedHours,
                notes: '[Reconduit automatiquement]'
              });
            });
          } else {
            // No history found at all (new active employee) -> Generate a standard Mon-Fri 08:00 - 16:00 planning template!
            for (let i = 0; i < 5; i++) {
              const targetDateStr = format(addDays(startOfTargetWeek, i), 'yyyy-MM-dd');
              const newShiftId = `shf_auto_${emp.id}_${targetDateStr}_${Math.random().toString(36).substring(2, 9)}`;
              newShiftsToSave.push({
                id: newShiftId,
                business_id: current_business_id,
                employeeId: emp.id,
                branchId: emp.branchId,
                departmentId: emp.departmentId,
                date: targetDateStr,
                startTime: '08:00',
                endTime: '16:00',
                status: 'SCHEDULED',
                plannedHours: 8,
                notes: '[Généré auto - Template standard]'
              });
            }
          }
        }

        if (newShiftsToSave.length > 0) {
          console.log(`Auto-rolling over ${newShiftsToSave.length} shifts for ${targetWeekKey}...`);
          // Save all shifted records to Firestore
          await ScheduleRepository.bulkSaveShifts(newShiftsToSave, { id: currentUser.id, name: currentUser.name || "Auto System", role: currentRole });
          
          if (onAddForensicLog) {
            onAddForensicLog({
              id: `fLog_auto_${Math.random().toString(36).substring(2, 9)}`,
              timestamp: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name || "Auto System",
              userRole: currentRole,
              business_id: current_business_id,
              action: "AUTO_ROLLOVER_WEEK",
              beforeState: "{}",
              afterState: JSON.stringify({ week: targetWeekKey, shiftCount: newShiftsToSave.length }),
              ipAddress: "127.0.0.1",
              userAgent: navigator.userAgent,
              signature: "verified"
            });
          }
        }

        setProcessedWeeks(prev => [...prev, targetWeekKey]);
      } catch (err) {
        console.error("Failed to automatically roll over shifts:", err);
      } finally {
        setIsRolloverInProgress(false);
      }
    };

    runRollover();
  }, [shifts, employees, currentDate, currentRole, current_business_id, processedWeeks, isRolloverInProgress]);

  const handleShiftMove = async (shiftId: string, newDate: string, newEmployeeId: string) => {
    if (currentRole === 'EMPLOYEE' || currentRole === 'SUPERVISOR') {
      toast.error(language === "fr" ? "Accès refusé. Vous ne pouvez pas modifier les shifts." : language === "ht" ? "Aksè refize. Ou pa ka modifye chanjman yo." : "Access denied. You cannot modify shifts.");
      return;
    }

    try {
      const employee = employees.find(e => e.id === newEmployeeId);
      PlanningDomainService.validateShiftAssignment(employee);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }

    const shiftIndex = shifts.findIndex(s => s.id === shiftId);
    if (shiftIndex > -1) {
      const updatedShift = { ...shifts[shiftIndex], date: newDate, employeeId: newEmployeeId };
      try {
        await ScheduleRepository.updateShift(shiftId, { date: newDate, employeeId: newEmployeeId }, { id: currentUser.id, name: currentUser.name || "Unknown", role: currentRole });
      } catch (err) {
        console.warn("Could not save to firestore", err);
      }
      if (onAddForensicLog) {
         onAddForensicLog({
            id: `fLog_${Math.random().toString(36).substr(2,9)}`,
            timestamp: new Date().toISOString(),
            userId: currentUser.id,
            userName: currentUser.name || "Unknown",
            userRole: currentRole,
            business_id: current_business_id,
            action: "UPDATE_SHIFT",
            beforeState: JSON.stringify(shifts[shiftIndex]),
            afterState: JSON.stringify(updatedShift),
            ipAddress: "127.0.0.1",
            userAgent: navigator.userAgent,
            signature: "verified"
         });
      }
    }
  };

  const handleSaveShift = async (newShift: Omit<Shift, 'id'>, existingId?: string) => {
    try {
      const employee = employees.find(e => e.id === newShift.employeeId);
      PlanningDomainService.validateShiftAssignment(employee);
    } catch (e: any) {
      toast.error(e.message);
      return;
    }

    const shiftId = existingId || `shf_${Math.random().toString(36).substring(2, 9)}`;
    const fullShift = { ...newShift, id: shiftId } as Shift;
    
    try {
      await ScheduleRepository.createShift(fullShift, { id: currentUser.id, name: currentUser.name || "Unknown", role: currentRole });
    } catch (err) {
      console.warn("Could not save to firestore", err);
    }

    if (onAddForensicLog) {
       onAddForensicLog({
          id: `fLog_${Math.random().toString(36).substr(2,9)}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name || "Unknown",
          userRole: currentRole,
          business_id: current_business_id,
          action: existingId ? "UPDATE_SHIFT" : "CREATE_SHIFT",
          beforeState: existingId ? "unknown" : "{}",
          afterState: JSON.stringify(fullShift),
          ipAddress: "127.0.0.1",
          userAgent: navigator.userAgent,
          signature: "verified"
       });
    }
  };

    const handleAppleAIDraft = async (draft: any[]) => {
    if (currentRole !== 'OWNER' && currentRole !== 'MANAGER') { return; }
    
    // Process draft and save
    const newShifts = draft.map(d => ({ 
       ...d, 
       id: `shf_ai_${Math.random().toString(36).substr(2, 9)}`,
       business_id: current_business_id
    }));
    
    try {
      await ScheduleRepository.bulkSaveShifts(newShifts, { id: currentUser.id, name: currentUser.name || "AI System", role: currentRole });
    } catch (e) {
      console.warn("Failed to save AI shifts", e);
    }
    
    if (onAddForensicLog) {
       onAddForensicLog({
          id: `fLog_${Math.random().toString(36).substr(2,9)}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name || "Unknown",
          userRole: currentRole,
          business_id: current_business_id,
          action: "AUTO_SCHEDULE",
          beforeState: "{}",
          afterState: JSON.stringify(newShifts),
          ipAddress: "127.0.0.1",
          userAgent: navigator.userAgent,
          severity: "info",
          signature: "verified"
       });
    }
    toast.success(language === "fr" ? "Planning IA appliqué avec succès !" : language === "ht" ? "Planifikatè IA aplike avèk siksè !" : "AI Schedule applied successfully!");
  };

  const handleCopyWeek = async (sourceWeekDate: Date, targetWeekDate: Date, options: any) => {
     if (currentRole !== 'OWNER' && currentRole !== 'MANAGER') { return; }
     
     const sourceStart = startOfWeek(sourceWeekDate, { weekStartsOn: 1 });
     const sourceEnd = addDays(sourceStart, 6);
     const sourceStartStr = format(sourceStart, 'yyyy-MM-dd');
     const sourceEndStr = format(sourceEnd, 'yyyy-MM-dd');

     const targetStart = startOfWeek(targetWeekDate, { weekStartsOn: 1 });
     const targetStartStr = format(targetStart, 'yyyy-MM-dd');
     const targetEndStr = format(addDays(targetStart, 6), 'yyyy-MM-dd');

     // Find shifts in source week
     const schedulableEmployeeIds = PlanningDomainService.getSchedulableEmployees(employees, current_business_id).map(e => e.id);
     const sourceShifts = shifts.filter(s => 
       s.business_id === current_business_id && 
       s.date >= sourceStartStr && 
       s.date <= sourceEndStr &&
       schedulableEmployeeIds.includes(s.employeeId)
     );

     if (sourceShifts.length === 0) {
       alert("Aucun shift trouvé pour la semaine source choisie.");
       return;
     }

     const targetShifts = shifts.filter(s =>
       s.business_id === current_business_id &&
       s.date >= targetStartStr &&
       s.date <= targetEndStr
     );

     let copiedCount = 0;
     try {
       for (const s of sourceShifts) {
         const prevDate = new Date(s.date);
         const dayDiff = differenceInDays(prevDate, sourceStart);
         const targetDateStr = format(addDays(targetStart, dayDiff), 'yyyy-MM-dd');

         // Check if a shift already exists on that day for that employee to avoid duplication
         const alreadyExists = targetShifts.some(ts => ts.employeeId === s.employeeId && ts.date === targetDateStr && ts.startTime === s.startTime);
         if (alreadyExists) continue;

         const newShiftId = `shf_copy_${s.employeeId}_${targetDateStr}_${Math.random().toString(36).substring(2, 9)}`;
         const newShift: Shift = {
           id: newShiftId,
           business_id: current_business_id,
           employeeId: s.employeeId,
           branchId: s.branchId,
           departmentId: s.departmentId,
           date: targetDateStr,
           startTime: s.startTime,
           endTime: s.endTime,
           status: 'SCHEDULED',
           plannedHours: s.plannedHours,
           notes: options.copyNotes && s.notes ? s.notes : '[Copié de la semaine source]'
         };

         await ScheduleRepository.createShift(newShift, { id: currentUser.id, name: currentUser.name || "Unknown", role: currentRole });
         copiedCount++;
       }

       if (onAddForensicLog) {
          onAddForensicLog({
             id: `fLog_${Math.random().toString(36).substr(2,9)}`,
             timestamp: new Date().toISOString(),
             userId: currentUser.id,
             userName: currentUser.name || "Unknown",
             userRole: currentRole,
             business_id: current_business_id,
             action: "COPY_WEEK",
             beforeState: JSON.stringify({ sourceWeek: sourceStartStr }),
             afterState: JSON.stringify({ targetWeek: targetStartStr, copiedCount }),
             ipAddress: "127.0.0.1",
             userAgent: navigator.userAgent,
             signature: "verified"
          });
       }
       alert(`${copiedCount} shifts copiés avec succès pour la semaine du ${format(targetStart, 'dd/MM/yyyy')}.`);
     } catch (err) {
       console.error("Error copy week:", err);
       alert("Une erreur est survenue lors de la duplication des shifts.");
     }
  };

  const handleExportExcel = () => {
    if (shifts.length === 0) {
      toast.error(language === "fr" ? "Aucune donnée à exporter." : language === "ht" ? "Pa gen okenn done pou ekspòte." : "No data to export.");
      return;
    }
    
    const exportData = shifts.map(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      const br = branches.find(b => b.id === s.branchId);
      const dp = departments.find(d => d.id === s.departmentId);
      
      return {
        'Date': s.date,
        'Employé': emp ? emp.name : s.employeeId,
        'Début': s.startTime,
        'Fin': s.endTime,
        'Heures Plannifiées': s.plannedHours,
        'Succursale': br ? br.name : s.branchId,
        'Département': dp ? dp.name : s.departmentId,
        'Statut': s.status
      };
    });

    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Plannings");

    // Format headers
    const range = xlsx.utils.decode_range(ws['!ref'] as string);
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = xlsx.utils.encode_col(C) + "1";
      if (!ws[address]) continue;
      ws[address].v = String(ws[address].v).toUpperCase();
    }
    
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    xlsx.writeFile(wb, `finops-planning-${dateStr}.xlsx`);
    
    if (onAddForensicLog) {
       onAddForensicLog({
          id: `fLog_${Math.random().toString(36).substr(2,9)}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name || "Unknown",
          userRole: currentRole,
          business_id: current_business_id,
          action: "EXPORT_EXCEL",
          beforeState: "{}",
          afterState: `{"exportedRecords": ${exportData.length}}`,
          ipAddress: "127.0.0.1",
          userAgent: navigator.userAgent,
          signature: "verified"
       });
    }
  };

  const handleExportPDF = () => {
    if (shifts.length === 0) {
      toast.error(language === "fr" ? "Aucune donnée à exporter." : language === "ht" ? "Pa gen okenn done pou ekspòte." : "No data to export.");
      return;
    }
    
    const doc = new jsPDF('landscape');
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // Group shifts by branch
    const shiftsByBranchId: Record<string, Shift[]> = {};
    const businessBranches = branches.filter(b => b.business_id === current_business_id);
    
    shifts.forEach(s => {
      if (!shiftsByBranchId[s.branchId]) {
        shiftsByBranchId[s.branchId] = [];
      }
      shiftsByBranchId[s.branchId].push(s);
    });

    const tableColumn = ["Date", "Employé", "Département", "Début", "Fin", "Heures"];
    let isFirstPage = true;

    // Use specific selected branches to include in PDF.
    const branchIds = Object.keys(shiftsByBranchId);
    if (branchIds.length === 0) return;

    branchIds.forEach((branchId) => {
      if (!isFirstPage) {
        doc.addPage();
      }
      isFirstPage = false;

      const branchObj = branches.find(b => b.id === branchId);
      const branchName = branchObj ? branchObj.name : "Succursale Inconnue";
      
      // Branding Header
      doc.setFontSize(22);
      doc.text('FinOps ERP', 14, 20);
      doc.setFontSize(14);
      doc.text(`Planning Semaine - ${branchName}`, 14, 30);
      
      doc.setFontSize(10);
      doc.text(`Généré le: ${dateStr}`, 14, 40);
      doc.text(`Par: ${currentUser.name || 'Utilisateur'}`, 14, 45);

      const tableRows: any[] = [];
      const branchShifts = shiftsByBranchId[branchId].sort((a, b) => a.date.localeCompare(b.date));

      branchShifts.forEach(s => {
        const emp = employees.find(e => e.id === s.employeeId);
        const dp = departments.find(d => d.id === s.departmentId);
        
        tableRows.push([
          s.date,
          emp ? emp.name : s.employeeId,
          dp ? dp.name : s.departmentId,
          s.startTime,
          s.endTime,
          s.plannedHours.toString()
        ]);
      });

      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [79, 70, 229] } // indigo-600
      });
    });

    doc.save(`finops-planning-${dateStr}.pdf`);
    
    if (onAddForensicLog) {
       onAddForensicLog({
          id: `fLog_${Math.random().toString(36).substr(2,9)}`,
          timestamp: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name || "Unknown",
          userRole: currentRole,
          business_id: current_business_id,
          action: "EXPORT_PDF",
          beforeState: "{}",
          afterState: `{"exportedRecords": ${shifts.length}, "branches": ${branchIds.length}}`,
          ipAddress: "127.0.0.1",
          userAgent: navigator.userAgent,
          signature: "verified"
       });
    }
  };

  // Filter shifts and employees
  const businessEmployees = PlanningDomainService.getSchedulableEmployees(employees, current_business_id);

  const baseEmployees = businessEmployees.filter(e => {
    if (currentRole === 'EMPLOYEE') {
      return e.id === currentUser.id;
    }
    if (currentRole === 'SUPERVISOR') {
      // Supervisor can now see all employees as requested
      return true;
    }
    return true;
  });

  const filteredEmployees = baseEmployees.filter(emp => {
    if (filters.branchId !== 'ALL' && emp.branchId !== filters.branchId) return false;
    if (filters.departmentId !== 'ALL' && emp.departmentId !== filters.departmentId) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!emp.name.toLowerCase().includes(q) && !emp.id.includes(q)) return false;
    }
    return true;
  });

  const filteredShifts = React.useMemo(() => {
    return shifts.filter(s => {
      if (filters.branchId !== 'ALL' && s.branchId !== filters.branchId) return false;
      if (filters.departmentId !== 'ALL' && s.departmentId !== filters.departmentId) return false;
      if (filters.status !== 'ALL' && s.status !== filters.status) return false;
      
      const isEmployeeInScope = baseEmployees.some(e => e.id === s.employeeId);
      if (!isEmployeeInScope) return false;

      if (filters.search) {
        return filteredEmployees.some(e => e.id === s.employeeId);
      }
      return true;
    });
  }, [shifts, filters, baseEmployees, filteredEmployees]);

  return (
    <div className="flex flex-col gap-4 font-sans animate-in fade-in duration-300 w-full" id="schedules-page-wrapper">
      
      {/* HEADER CONTROL BAR */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/60 p-4 border border-slate-800/80 rounded-xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <CalendarRange className="w-6 h-6 text-cyan-400" />
            {t.planning.title}
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-light flex items-center gap-2 flex-wrap">
             <span>{t.planning.realtimeOps}</span>
             <span className="bg-cyan-500/10 text-cyan-455 border border-cyan-500/20 text-[10px] font-semibold px-2 py-0.5 rounded font-mono animate-pulse">
               {t.planning.activeRollover}
             </span>
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {['OWNER', 'MANAGER'].includes(currentRole) && (
            <>
              <button onClick={() => setIsQrScannerOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition">
                <QrCode className="w-3.5 h-3.5" /> {t.planning.clockInQrBtn}
              </button>
              <button onClick={() => setIsAIOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition">
                <Sparkles className="w-3.5 h-3.5" /> {t.planning.aiAutoPlanBtn}
              </button>
              {['OWNER', 'MANAGER'].includes(currentRole) && (
                <button 
                  onClick={() => setIsMassImportOpen(true)} 
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5" /> {t.planning.massImportBtn}
                </button>
              )}
              <button 
                onClick={() => {
                  setEditingShift(null);
                  setIsCreateOpen(true);
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition shadow-lg shadow-cyan-900/20"
              >
                <Plus className="w-3.5 h-3.5" /> {t.planning.newShiftBtn}
              </button>
              <button 
                onClick={() => setIsCopyOpen(true)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
              >
                <Copy className="w-3.5 h-3.5" /> {t.planning.copyWeekBtn}
              </button>
            </>
          )}
          <button 
            onClick={handleExportExcel}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {t.planning.exportExcelBtn}
          </button>
          <button 
            onClick={handleExportPDF}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] uppercase tracking-wider px-3 py-2 rounded flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" /> {t.planning.exportPdfBtn}
          </button>
        </div>
      </div>

      {/* MODULE WORKFORCE TABS */}
      {['OWNER', 'MANAGER', 'SUPERVISOR'].includes(currentRole) && (
        <div className="flex border-b border-slate-800 bg-slate-950/20 px-1 pt-1 gap-2 md:gap-4 overflow-x-auto select-none" id="workforce-sub-tabs">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`pb-3 text-[10px] md:text-xs uppercase font-bold tracking-wider transition shrink-0 px-2 ${
              activeTab === 'calendar' ? 'text-cyan-400 border-b-2 border-cyan-400 font-black' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Planning & Calendrier
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`pb-3 text-[10px] md:text-xs uppercase font-bold tracking-wider transition shrink-0 px-2 ${
              activeTab === 'templates' ? 'text-cyan-400 border-b-2 border-cyan-400 font-black' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modèles d'Horaires (Shift Templates)
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`pb-3 text-[10px] md:text-xs uppercase font-bold tracking-wider transition shrink-0 px-2 ${
              activeTab === 'assignments' ? 'text-cyan-400 border-b-2 border-cyan-400 font-black' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Affectations Récurrentes
          </button>
          <button
            onClick={() => setActiveTab('conflicts')}
            className={`pb-3 text-[10px] md:text-xs uppercase font-bold tracking-wider transition shrink-0 px-2 flex items-center gap-1.5 ${
              activeTab === 'conflicts' ? 'text-cyan-400 border-b-2 border-cyan-400 font-black' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Conflits & Alertes
          </button>
        </div>
      )}

      {/* CONDITIONAL COMPONENT RENDERING */}
      {activeTab === 'calendar' && (
        <>
          {/* ANALYTICS PANE */}
          <AnalyticsPanel shifts={filteredShifts} />

          {/* FILTER PANE */}
          <FilterToolbar 
            branches={branches} 
            departments={departments} 
            filters={filters} 
            onFilterChange={setFilters} 
          />

          {/* SHIFT MATRIX */}
          <ShiftMatrix 
            employees={filteredEmployees}
            shifts={filteredShifts}
            departments={departments}
            branches={branches}
            currentDate={currentDate}
            onShiftMove={handleShiftMove}
            onShiftCopy={(s) => handleSaveShift(s)}
            onShiftClick={(s) => {
              if (currentRole === 'EMPLOYEE' || currentRole === 'SUPERVISOR') return; // Read-only for non-admins
              setEditingShift(s);
              setIsCreateOpen(true);
            }}
            dateRange={filters.dateRange}
          />
        </>
      )}

      {activeTab === 'templates' && (
        <ShiftTemplateManager 
          businessId={current_business_id} 
          branches={branches} 
        />
      )}

      {activeTab === 'assignments' && (
        <EmployeeAssignmentPanel 
          businessId={current_business_id} 
          employees={businessEmployees} 
          branches={branches} 
          departments={departments} 
          onAddForensicLog={onAddForensicLog} 
        />
      )}

      {activeTab === 'conflicts' && (
        <ConflictResolver 
          businessId={current_business_id} 
          shifts={shifts} 
          employees={businessEmployees} 
          branches={branches} 
        />
      )}

      <AutoScheduleDialog 
         isOpen={isAIOpen}
         onClose={() => setIsAIOpen(false)}
         onApply={handleAppleAIDraft}
      />

      <CopyWeekDialog 
        isOpen={isCopyOpen}
        onClose={() => setIsCopyOpen(false)}
        onCopy={handleCopyWeek}
      />

      <MassImportShiftModal
        isOpen={isMassImportOpen}
        onClose={() => setIsMassImportOpen(false)}
        employees={businessEmployees}
        shifts={shifts}
        currentRole={currentRole}
        current_business_id={current_business_id}
        branches={branches}
        departments={departments}
        onAddEvent={(ev) => {}}
        onAddForensicLog={(log) => {}}
        onUpdateShifts={() => {}}
      />

      {isCreateOpen && (
        <CreateShiftDialog 
          onClose={() => setIsCreateOpen(false)}
          onSave={handleSaveShift}
          employees={businessEmployees}
          branches={branches.filter(b => b.business_id === current_business_id)}
          departments={departments}
          current_business_id={current_business_id}
          initialShift={editingShift || undefined}
        />
      )}

      {isQrScannerOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-4 flex flex-col items-center">
            <div className="flex justify-between w-full mb-4">
              <h3 className="text-sm font-bold text-slate-200">{t.planning.qrAttendanceTitle}</h3>
              <button onClick={() => setIsQrScannerOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full flex items-center justify-center">
              <CameraQrScanner 
                onScanSuccess={(code) => {
                  toast.info(t.planning.qrBadgeScannedAlert.replace("{code}", code));
                  setIsQrScannerOpen(false);
                }}
              />
            </div>
            <p className="mt-3 text-xs text-slate-400 text-center">{t.planning.presentBadgeInstructions}</p>
          </div>
        </div>
      )}

    </div>
  );
}
