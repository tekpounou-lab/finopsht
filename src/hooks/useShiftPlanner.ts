import { useState, useEffect } from "react";
import { format, startOfWeek, addDays } from "date-fns";
import { Shift, ShiftFilters } from "../components/planning/types";
import { Employee } from "../types";
import { MockServiceManager } from "../services/mock";

export function useShiftPlanner(
  initialShifts: Shift[],
  employees: Employee[],
  currentBusinessId: string
) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [filters, setFilters] = useState<ShiftFilters>({
    branchId: 'ALL',
    departmentId: 'ALL',
    status: 'ALL',
    search: '',
    dateRange: null
  });

  // Validation function to flag overlapping shifts at different locations
  const validateOverlappingShifts = (rawShifts: Shift[]): Shift[] => {
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
  };

  useEffect(() => {
    if (initialShifts && initialShifts.length > 0) {
      setShifts(validateOverlappingShifts(initialShifts));
    } else if (initialShifts) {
      setShifts([]);
    } else if (MockServiceManager.isEnabled()) {
      setupMockShifts();
    } else {
      setShifts([]);
    }
  }, [initialShifts, employees, currentBusinessId]);

  const setupMockShifts = () => {
    const mockShifts: Shift[] = [];
    const baseDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    
    employees.slice(0, 5).forEach((e, idx) => {
      for(let i=0; i<3; i++) {
        const d = format(addDays(baseDate, i + (idx % 2)), 'yyyy-MM-dd');
        mockShifts.push({
          id: `shf_${e.id}_${i}`,
          business_id: currentBusinessId,
          employeeId: e.id,
          branchId: e.branchId,
          departmentId: e.departmentId,
          date: d,
          startTime: '08:00',
          endTime: '16:00',
          status: 'SCHEDULED',
          plannedHours: 8,
        });
      }
    });

    setShifts(mockShifts);
  };

  return {
    shifts,
    setShifts,
    currentDate,
    setCurrentDate,
    filters,
    setFilters,
    validateOverlappingShifts,
    setupMockShifts,
  };
}
