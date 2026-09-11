import { useState, useEffect, useMemo, useCallback } from "react";
import { Employee, LedgerTransaction, PayrollRecord, AttendanceRecord, Branch, Department, Business, ForensicLog } from "../../../types";
import { useBusinessContext } from "../../../contexts/BusinessContext";
import { CurrencyRateRepository } from "../../../repositories/CurrencyRateRepository";
import { useAnalytics } from "../../../domains/analytics/context/AnalyticsContext";
import { AnalyticsEngine } from "../../../domains/analytics/services/AnalyticsEngine";
import { RankMetricType } from "./useBIUIState";
import { EnrichedDepartmentMetric, EnrichedBranchMetric, EmployeeScorecard, PayrollAggregates } from "../types";
import { filterOperationalEmployees } from "../../../services/workforce/EmployeeEligibilityService";
import { useDeepCompareMemo } from "../../../hooks/useDeepCompareMemo";
import { TaxPolicyEngine } from "../../../services/payroll/TaxPolicyEngine";

interface UseBIDataAggregationParams {
  currentBusiness?: Business;
  employees: Employee[];
  ledgerTransactions: LedgerTransaction[];
  payrollRecords: PayrollRecord[];
  attendanceRecords: AttendanceRecord[];
  branches: Branch[];
  departments: Department[];
  forensicLogs?: ForensicLog[];
  selectedBranchId: string;
  selectedDeptId: string;
  selectedTxType?: string;
  selectedAttendanceStatus?: string;
  selectedPaymentModel?: string;
  startDate: string;
  endDate: string;
  rankBy?: RankMetricType;
  employeeRankMetric?: RankMetricType;
  language: "fr" | "ht" | "en";
}

export function useBIDataAggregation({
  currentBusiness,
  employees,
  ledgerTransactions,
  payrollRecords,
  attendanceRecords,
  branches = [],
  departments = [],
  selectedBranchId,
  selectedDeptId,
  selectedTxType = "ALL",
  selectedAttendanceStatus = "ALL",
  selectedPaymentModel = "ALL",
  startDate,
  endDate,
  rankBy,
  employeeRankMetric,
  language,
}: UseBIDataAggregationParams) {
  const { snapshot } = useAnalytics();
  const { selectedCurrency, businessSettings } = useBusinessContext();
  const [usdToHtgRate, setUsdToHtgRate] = useState<number>(135.0);

  const isSocialTaxEnabled = useMemo(() => {
    return TaxPolicyEngine.isSocialTaxEnabled({ ...businessSettings, ...currentBusiness?.settings });
  }, [businessSettings, currentBusiness]);

  useEffect(() => {
    let active = true;
    const fetchRate = async () => {
      if (!currentBusiness?.id) return;
      try {
        const rate = await CurrencyRateRepository.getLatestRate(currentBusiness.id, "USD", "HTG");
        if (active && rate) {
          setUsdToHtgRate(rate);
        }
      } catch (err) {
        console.warn("Failed to fetch latest exchange rate:", err);
      }
    };
    fetchRate();
    return () => {
      active = false;
    };
  }, [currentBusiness?.id]);

  // Operational Employees Filtering
  const operationalEmployees = useMemo(() => {
    return filterOperationalEmployees(employees || [], currentBusiness?.id);
  }, [employees, currentBusiness?.id]);

  const filteredEmployees = useMemo(() => {
    return operationalEmployees.filter((emp) => {
      if (selectedBranchId !== "ALL" && emp.branchId !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && emp.departmentId !== selectedDeptId) return false;
      if (selectedPaymentModel !== "ALL" && emp.paymentModel !== selectedPaymentModel) return false;
      return true;
    });
  }, [operationalEmployees, selectedBranchId, selectedDeptId, selectedPaymentModel]);

  const filteredTx = useMemo(() => {
    if (!currentBusiness?.id) return [];
    return ledgerTransactions.filter((tx) => {
      if (tx.business_id !== currentBusiness.id) return false;
      if (tx.status === "REVERSED") return false;
      if (selectedBranchId !== "ALL" && tx.branchId !== selectedBranchId && (tx as any).branch_id !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && tx.departmentId !== selectedDeptId && (tx as any).department_id !== selectedDeptId) return false;
      if (selectedTxType !== "ALL" && tx.type !== selectedTxType) return false;
      if (tx.date) {
        const d = tx.date.split("T")[0];
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
      }
      return true;
    });
  }, [ledgerTransactions, currentBusiness?.id, selectedBranchId, selectedDeptId, selectedTxType, startDate, endDate]);

  const empBranchMap = useMemo(() => {
    const map = new Map<string, string>();
    (employees || []).forEach((e) => {
      if (e.id) {
        map.set(e.id, e.branchId || (e as any).branch_id || "");
      }
    });
    return map;
  }, [employees]);

  const empDeptMap = useMemo(() => {
    const map = new Map<string, string>();
    (employees || []).forEach((e) => {
      if (e.id) {
        map.set(e.id, e.departmentId || (e as any).department_id || "");
      }
    });
    return map;
  }, [employees]);

  const normalizeDateStr = (rawDate: any): string => {
    if (!rawDate) return "";
    let str = "";
    if (typeof rawDate === "string") {
      str = rawDate.trim().split("T")[0];
    } else if (typeof rawDate === "number") {
      str = new Date(rawDate).toISOString().split("T")[0];
    } else if (rawDate instanceof Date) {
      str = rawDate.toISOString().split("T")[0];
    } else if (rawDate?.toDate && typeof rawDate.toDate === "function") {
      str = rawDate.toDate().toISOString().split("T")[0];
    } else if (rawDate?.seconds) {
      str = new Date(rawDate.seconds * 1000).toISOString().split("T")[0];
    } else {
      str = String(rawDate).split("T")[0];
    }

    if (!str) return "";

    if (str.includes("/")) {
      const parts = str.split("/");
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
        } else {
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
    } else if (str.includes("-")) {
      const parts = str.split("-");
      if (parts.length === 3) {
        if (parts[0].length !== 4 && parts[2].length === 4) {
          return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      }
    }
    return str;
  };

  const getAttendanceDate = (a: any): string => {
    if (!a) return "";
    const raw =
      a.date ||
      a.date_str ||
      a.dateStr ||
      a.work_date ||
      a.workDate ||
      a.checkInDate ||
      a.checkIn?.deviceDate ||
      a.created_at ||
      a.createdAt ||
      a.timestamp ||
      a.checkIn?.timestamp ||
      a.checkIn ||
      a.check_in ||
      a.checkInTime ||
      a.check_in_time;
    return normalizeDateStr(raw);
  };

  const getHours = (a: any): number => {
    if (!a) return 0;
    if (typeof a.realHours === "number" && !isNaN(a.realHours) && a.realHours > 0) return a.realHours;
    if (typeof a.hoursWorked === "number" && !isNaN(a.hoursWorked) && a.hoursWorked > 0) return a.hoursWorked;
    if (typeof a.hours_worked === "number" && !isNaN(a.hours_worked) && a.hours_worked > 0) return a.hours_worked;
    if (typeof a.totalHours === "number" && !isNaN(a.totalHours) && a.totalHours > 0) return a.totalHours;
    if (typeof a.workedHours === "number" && !isNaN(a.workedHours) && a.workedHours > 0) return a.workedHours;
    if (typeof a.totalMinutes === "number" && !isNaN(a.totalMinutes) && a.totalMinutes > 0) return Number((a.totalMinutes / 60).toFixed(2));
    
    const rawIn = a.checkIn || a.check_in || a.checkInTime || a.check_in_time;
    const rawOut = a.checkOut || a.check_out || a.checkOutTime || a.check_out_time;

    if (rawIn && rawOut) {
      const dIn = new Date(rawIn);
      const dOut = new Date(rawOut);
      if (!isNaN(dIn.getTime()) && !isNaN(dOut.getTime()) && dOut > dIn) {
        const diffMs = dOut.getTime() - dIn.getTime();
        const hrs = diffMs / 3600000;
        if (hrs > 0 && hrs <= 24) return Number(hrs.toFixed(2));
      }

      const strIn = typeof rawIn === "string" ? rawIn.split("T").pop() || "" : "";
      const strOut = typeof rawOut === "string" ? rawOut.split("T").pop() || "" : "";
      if (strIn.includes(":") && strOut.includes(":")) {
        const [h1, m1] = strIn.split(":").map(Number);
        const [h2, m2] = strOut.split(":").map(Number);
        if (!isNaN(h1) && !isNaN(h2)) {
          const mins1 = h1 * 60 + (m1 || 0);
          const mins2 = h2 * 60 + (m2 || 0);
          if (mins2 > mins1) return Number(((mins2 - mins1) / 60).toFixed(2));
        }
      }
    }

    const st = String(a.status || "").toUpperCase();
    if (st !== "ABSENT" && st !== "CANCELLED" && st !== "VOID" && st !== "REJECTED") {
      if (typeof a.plannedHours === "number" && a.plannedHours > 0) return a.plannedHours;
      return 8;
    }

    return 0;
  };

  const filteredAttendance = useMemo(() => {
    if (!currentBusiness?.id) return [];
    return attendanceRecords.filter((rec) => {
      const recBizId = rec.business_id || (rec as any).businessId;
      if (recBizId && recBizId !== currentBusiness.id) return false;
      
      const rBranch = rec.branchId || (rec as any).branch_id || (rec.employeeId ? empBranchMap.get(rec.employeeId) : undefined);
      if (selectedBranchId !== "ALL" && rBranch && rBranch !== selectedBranchId) return false;
      
      const rDept = rec.departmentId || (rec as any).department_id || (rec.employeeId ? empDeptMap.get(rec.employeeId) : undefined);
      if (selectedDeptId !== "ALL" && rDept && rDept !== selectedDeptId) return false;

      if (selectedAttendanceStatus !== "ALL" && rec.status !== selectedAttendanceStatus) return false;
      
      const dateStr = getAttendanceDate(rec);
      if (dateStr) {
        if (startDate && dateStr < startDate) return false;
        if (endDate && dateStr > endDate) return false;
      }
      return true;
    });
  }, [attendanceRecords, currentBusiness?.id, selectedBranchId, selectedDeptId, empDeptMap, empBranchMap, selectedAttendanceStatus, startDate, endDate]);

  const filteredPayrolls = useMemo(() => {
    if (!currentBusiness?.id) return [];
    return (payrollRecords || []).filter((rec) => {
      if (rec.business_id && rec.business_id !== currentBusiness.id) return false;
      if (rec.isExcluded) return false;
      const emp = (employees || []).find((e) => e.id === (rec.employee_id || rec.employeeId));
      const rBranch = rec.branch_id || (rec as any).branchId || emp?.branchId || (emp as any)?.branch_id;
      const rDept = rec.department_id || (rec as any).departmentId || emp?.departmentId || (emp as any)?.department_id;
      if (selectedBranchId !== "ALL" && rBranch && rBranch !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && rDept && rDept !== selectedDeptId) return false;

      // Period matching - require effective payment or accounting date or period end to fall within range
      const pEffective = (rec as any).paymentDate || (rec as any).effectiveAccountingDate || rec.period_end || (rec as any).periodEnd || (rec as any).endDate;
      if (startDate && endDate) {
        if (!pEffective) return false;
        const normDate = normalizeDateStr(pEffective);
        if (!normDate || normDate < startDate || normDate > endDate) {
          return false;
        }
      }
      return true;
    });
  }, [payrollRecords, employees, currentBusiness?.id, selectedBranchId, selectedDeptId, startDate, endDate]);

  const formatCurrencyValue = (valInHtg: number) => {
    if (selectedCurrency === "USD") {
      const converted = valInHtg / usdToHtgRate;
      return `${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `${Math.round(valInHtg).toLocaleString()} HTG`;
  };

  const formatValueDirectly = (val: number) => {
    if (selectedCurrency === "USD") {
      return `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return `${Math.round(val).toLocaleString()} HTG`;
  };

  // Centralized Snapshot Data with dynamic filter evaluation
  const biSnapshot = snapshot;
  const isFiltered = useDeepCompareMemo(() => Boolean(
    (selectedBranchId && selectedBranchId !== "ALL") ||
    (selectedDeptId && selectedDeptId !== "ALL") ||
    startDate ||
    endDate ||
    (selectedTxType && selectedTxType !== "ALL") ||
    (selectedPaymentModel && selectedPaymentModel !== "ALL") ||
    (selectedAttendanceStatus && selectedAttendanceStatus !== "ALL")
  ), [selectedBranchId, selectedDeptId, startDate, endDate, selectedTxType, selectedPaymentModel, selectedAttendanceStatus]);

  console.debug(`[PIC] [useBIDataAggregation] Aggregating dataset (isFiltered: ${isFiltered}):`, {
    selectedBranchId,
    selectedDeptId,
    startDate,
    endDate,
    filteredEmployeesCount: filteredEmployees.length,
    filteredTxCount: filteredTx.length,
    filteredAttendanceCount: filteredAttendance.length,
    filteredPayrollsCount: filteredPayrolls.length,
  });

  const getTxAmount = (t: any): number => {
    if (typeof t.amount === "number" && !isNaN(t.amount)) return t.amount;
    if (typeof t.amount_cents === "number" && !isNaN(t.amount_cents)) return t.amount_cents / 100;
    if (typeof t.amountCents === "number" && !isNaN(t.amountCents)) return t.amountCents / 100;
    if (typeof t.total === "number" && !isNaN(t.total)) return t.total;
    if (typeof t.debit === "number" && t.debit > 0) return t.debit;
    if (typeof t.credit === "number" && t.credit > 0) return t.credit;
    return 0;
  };

  // Payroll Aggregates calculated early as a source of truth
  const payrollAggregates: PayrollAggregates = useMemo(() => {
    if (!isFiltered && biSnapshot?.payrollAggregates) {
      return biSnapshot.payrollAggregates;
    }
    const records = filteredPayrolls;
    const totalGross = records.reduce((sum, p: any) => sum + (p.grossSalary || (p.gross_salary_cents ? p.gross_salary_cents / 100 : 0) || p.gross || (p.baseSalary || 0)), 0);
    const totalCommissions = records.reduce((sum, p: any) => sum + (p.commissions || (p.commission_cents ? p.commission_cents / 100 : 0) || p.commissionsHTG || 0), 0);
    
    let totalCnss = 0;
    let totalCns = 0;
    let employerCharges = 0;

    if (isSocialTaxEnabled) {
      const recordedCnss = records.reduce((sum, p: any) => {
        const emp = (p.cnss_employee_cents ? p.cnss_employee_cents / 100 : 0) || (p.cnssDeduction || 0) || (p.onaEmployee || 0);
        const er = (p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || (p.onaEmployer || 0);
        return sum + emp + er;
      }, 0);

      const recordedCns = records.reduce((sum, p: any) => {
        const emp = (p.cns_employee_cents ? p.cns_employee_cents / 100 : 0) || (p.cnsDeduction || 0) || (p.ofatmaEmployee || 0);
        const er = (p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || (p.cns_employer_cents ? p.cns_employer_cents / 100 : 0) || (p.ofatmaEmployer || 0);
        return sum + emp + er;
      }, 0);

      const recordedEmployerCharges = records.reduce((sum, p: any) => {
        const erCnss = (p.cnss_employer_cents ? p.cnss_employer_cents / 100 : 0) || (p.onaEmployer || 0);
        const erCns = (p.ofatma_employer_cents ? p.ofatma_employer_cents / 100 : 0) || (p.cns_employer_cents ? p.cns_employer_cents / 100 : 0) || (p.ofatmaEmployer || 0);
        return sum + erCnss + erCns;
      }, 0);

      totalCnss = recordedCnss;
      totalCns = recordedCns;
      employerCharges = recordedEmployerCharges;
    }

    const totalCost = totalGross + employerCharges;

    return {
      payrollPaid: Math.round(totalGross),
      commissionsPaid: Math.round(totalCommissions),
      cnssContributions: Math.round(totalCnss),
      cnsContributions: Math.round(totalCns),
      employerChargesSocials: Math.round(employerCharges),
      totalEmploymentCost: Math.round(totalCost),
    };
  }, [biSnapshot?.payrollAggregates, filteredPayrolls, isSocialTaxEnabled]);

  const totalRevenue = useMemo(() => {
    if (!isFiltered && biSnapshot?.revenue?.currentValue !== undefined) {
      return biSnapshot.revenue.currentValue;
    }
    return filteredTx
      .filter((t) => (t.type === "INCOME" || (t.type as any) === "REVENUE") && t.status !== "REVERSED" && (t.status as any) !== "VOID")
      .reduce((s, t) => s + getTxAmount(t), 0);
  }, [isFiltered, biSnapshot?.revenue?.currentValue, filteredTx]);

  const totalExpenses = useMemo(() => {
    if (!isFiltered && biSnapshot?.expenses?.currentValue !== undefined) {
      return biSnapshot.expenses.currentValue;
    }
    const directExp = filteredTx
      .filter((t) => {
        if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
        if (t.type === "PAYROLL") return true;
        if (t.type === "EXPENSE") {
          if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
          const cat = (t.category || "").toLowerCase();
          const desc = (t.description || "").toLowerCase();
          if (cat.includes("paie") || cat.includes("payroll") || desc.includes("salaire") || desc.includes("payroll")) {
            return false;
          }
          return true;
        }
        return false;
      })
      .reduce((s, t) => s + getTxAmount(t), 0);

    const hasPayrollTx = filteredTx.some(t => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED");
    const payrollExp = hasPayrollTx ? 0 : payrollAggregates.totalEmploymentCost;
    return directExp + payrollExp;
  }, [isFiltered, biSnapshot?.expenses?.currentValue, filteredTx, payrollAggregates.totalEmploymentCost]);

  const netProfit = (!isFiltered && biSnapshot?.profit?.currentValue !== undefined) ? biSnapshot.profit.currentValue : (totalRevenue - totalExpenses);
  const profitMarginPercentage = (!isFiltered && biSnapshot?.profitMargin !== undefined) ? Math.round(biSnapshot.profitMargin) : (totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0);
  const financialStressScore = totalRevenue > 0 ? Math.min(100, Math.max(0, Math.round((totalExpenses / totalRevenue) * 100))) : 100;
  const totalAdvancesPending = (!isFiltered && biSnapshot?.advanceExposure?.currentValue !== undefined) ? biSnapshot.advanceExposure.currentValue : 0;
  const activePresentEmpIds = useMemo(() => {
    return new Set(
      filteredAttendance
        .filter((a) => a.status !== "ABSENT" || getHours(a) > 0)
        .map((a) => a.employeeId || (a as any).employee_id)
        .filter(Boolean)
    );
  }, [filteredAttendance]);

  const activeEmployeesCount = (!isFiltered && biSnapshot?.activeStaff?.currentValue !== undefined) ? biSnapshot.activeStaff.currentValue : (activePresentEmpIds.size > 0 ? activePresentEmpIds.size : filteredEmployees.length);

  const attendanceAggregates = useMemo(() => {
    if (!isFiltered && biSnapshot?.attendanceRate?.currentValue !== undefined) {
      console.debug("[useBIDataAggregation] Using biSnapshot attendanceRate SSOT:", biSnapshot.attendanceRate.currentValue);
      return {
        attendanceRate: biSnapshot.attendanceRate.currentValue ?? 0,
        latenessRate: biSnapshot.latenessRate?.currentValue ?? 0,
        absenceRate: biSnapshot.absenceRate?.currentValue ?? 0,
        avgHours: biSnapshot.avgHoursWorked?.currentValue ?? 0,
        overrides: 0,
      };
    }

    if (filteredAttendance.length > 0) {
      const staffCount = filteredEmployees.length > 0 ? filteredEmployees.length : (employees.length > 0 ? employees.length : 1);
      const expectedHoursPerEmployee = (startDate && endDate) 
        ? AnalyticsEngine.getExpectedWorkingHours(startDate, endDate)
        : 160;
      const expectedTotalHours = staffCount * expectedHoursPerEmployee;

      const totalWorkedHours = filteredAttendance.reduce((acc, a) => acc + getHours(a), 0);
      const lates = filteredAttendance.filter((a) => a.status === "LATE").length;
      const absents = filteredAttendance.filter((a) => a.status === "ABSENT").length;
      const totalRecords = filteredAttendance.length;

      let attRate = 0;
      if (expectedTotalHours > 0 && totalWorkedHours > 0) {
        attRate = Math.min(100, Math.max(0, Math.round((totalWorkedHours / expectedTotalHours) * 100)));
      } else if (totalRecords > 0) {
        const presentCount = filteredAttendance.filter((a) => (a.status as string) !== "ABSENT" && (a.status as string) !== "CANCELLED" && (a.status as string) !== "VOID" && (a.status as string) !== "REJECTED").length;
        attRate = Math.min(100, Math.max(0, Math.round((presentCount / totalRecords) * 100)));
      }

      const explicitAbsenceRate = totalRecords > 0 ? Math.round((absents / totalRecords) * 100) : 0;
      const hoursDeficitAbsenceRate = Math.max(0, 100 - attRate);
      const computedAbsenceRate = Math.max(0, Math.min(100, Math.max(explicitAbsenceRate, hoursDeficitAbsenceRate)));
      const latenessRate = totalRecords > 0 ? Math.max(0, Math.min(100, Math.round((lates / totalRecords) * 100))) : 0;
      const avgHours = totalRecords > 0 ? Math.round((totalWorkedHours / totalRecords) * 10) / 10 : 0;

      console.debug("[useBIDataAggregation] Calculated fallback attendance aggregates:", {
        staffCount,
        expectedTotalHours,
        totalWorkedHours,
        attRate,
      });

      return {
        attendanceRate: attRate,
        latenessRate,
        absenceRate: computedAbsenceRate,
        avgHours,
        overrides: 0,
      };
    }

    return { attendanceRate: 0, latenessRate: 0, absenceRate: 100, avgHours: 0, overrides: 0 };
  }, [biSnapshot, filteredAttendance, filteredEmployees.length, employees.length, startDate, endDate]);

  // Branch Performance Details
  const branchMetrics: EnrichedBranchMetric[] = useMemo(() => {
    if (!isFiltered && biSnapshot?.branchPerformance && biSnapshot.branchPerformance.length > 0) {
      return biSnapshot.branchPerformance.map((b) => ({
        branchId: b.branchId,
        branchName: b.branchName,
        employeeCount: b.employeeCount,
        revenue: b.revenue,
        expenses: b.expenses,
        profit: b.profit,
        margin: b.margin,
        attendanceRate: b.attendanceRate,
        efficiencyScore: b.efficiencyScore,
      }));
    }

    const targetBranches = branches.filter((b) => !currentBusiness?.id || b.business_id === currentBusiness.id);
    return targetBranches.map((br) => {
      const bEmps = filteredEmployees.filter((e) => e.branchId === br.id || (e as any).branch_id === br.id);
      const bTxs = filteredTx.filter((t) => t.branchId === br.id || (t as any).branch_id === br.id);
      const bAtt = filteredAttendance.filter((a) => a.branchId === br.id || (a as any).branch_id === br.id);

      const rev = bTxs
        .filter((t) => (t.type === "INCOME" || (t.type as any) === "REVENUE") && t.status !== "REVERSED" && (t.status as any) !== "VOID")
        .reduce((sum, t) => sum + getTxAmount(t), 0);

      const directExp = bTxs
        .filter((t) => {
          if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
          if (t.type === "PAYROLL") return true;
          if (t.type === "EXPENSE") {
            if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
            return true;
          }
          return false;
        })
        .reduce((sum, t) => sum + getTxAmount(t), 0);

      const hasBPayrollTx = bTxs.some(t => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED");
      const bPayrolls = filteredPayrolls.filter((p) => {
        const emp = (employees || []).find((e) => e.id === (p.employeeId || p.employee_id));
        return (p.branch_id || (p as any).branchId || emp?.branchId || (emp as any)?.branch_id) === br.id;
      });
      const bPayrollCost = bPayrolls.reduce(
        (sum, p: any) => sum + (p.grossSalary || (p.gross_salary_cents ? p.gross_salary_cents / 100 : 0) || (p.baseSalary || 0)),
        0
      );
      const exp = directExp + (hasBPayrollTx ? 0 : bPayrollCost);

      const profit = rev - exp;
      const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;
      const presentCount = bAtt.filter((a) => a.status !== "ABSENT").length;
      const attendanceRate = bAtt.length > 0 ? Math.round((presentCount / bAtt.length) * 100) : 0;

      return {
        branchId: br.id,
        branchName: br.name,
        employeeCount: bEmps.length,
        revenue: rev,
        expenses: exp,
        profit,
        margin,
        attendanceRate,
        efficiencyScore: margin > 15 ? 90 : 75,
      };
    });
  }, [biSnapshot?.branchPerformance, branches, currentBusiness?.id, filteredEmployees, filteredTx, filteredAttendance, filteredPayrolls, employees]);

  const chartBranchData = useMemo(() => {
    return branchMetrics.map((bm) => {
      if (selectedCurrency === "USD") {
        return {
          ...bm,
          revenue: bm.revenue / usdToHtgRate,
          expenses: bm.expenses / usdToHtgRate,
          netProfit: bm.profit / usdToHtgRate,
        };
      }
      return {
        ...bm,
        netProfit: bm.profit,
      };
    });
  }, [branchMetrics, selectedCurrency, usdToHtgRate]);

  // Employee Scorecards with filter propagation
  const employeeScorecards: EmployeeScorecard[] = (biSnapshot?.employeeScorecards || [])
    .filter((sc: any) => {
      if (selectedBranchId !== "ALL" && sc.branchId !== selectedBranchId) return false;
      if (selectedDeptId !== "ALL" && sc.departmentId !== selectedDeptId) return false;
      return true;
    })
    .map((sc: any, idx: number) => ({
      employeeId: sc.employeeId,
      employeeName: sc.employeeName,
      branchId: sc.branchId,
      departmentId: sc.departmentId,
      totalHours: sc.totalHours,
      plannedHours: sc.plannedHours || sc.totalHours || 0,
      hoursVariance: sc.hoursVariance || 0,
      baseSalary: sc.baseSalary || 0,
      commissions: sc.commissions || 0,
      attendanceConsistencyScore: sc.attendanceConsistencyScore || 0,
      latenessScore: sc.latenessScore || 0,
      productivityIndex: sc.productivityIndex || 0,
      hourlyEfficiencyRatio: sc.hourlyEfficiencyRatio || 0,
      rank: idx + 1,
    }));

  // Department Performance details
  const departmentMetrics = biSnapshot?.departmentPerformance || [];

  const enrichedDepartmentMetrics: EnrichedDepartmentMetric[] = useMemo(() => {
    if (!isFiltered && biSnapshot?.departmentPerformance && biSnapshot.departmentPerformance.length > 0) {
      return biSnapshot.departmentPerformance.map((dm: any) => {
        const rev = dm.revenue || 0;
        const exp = dm.expenses || 0;
        const margin = dm.margin !== undefined ? dm.margin : (rev > 0 ? Math.round(((rev - exp) / rev) * 100) : 0);
        return {
          departmentId: dm.departmentId,
          departmentName: dm.departmentName,
          name: dm.departmentName,
          employeeCount: dm.employeeCount,
          totalStaff: dm.employeeCount,
          averageHours: dm.averageHours || 0,
          avgHours: dm.averageHours || 0,
          attendanceRate: dm.attendanceRate || 0,
          productivityScore: dm.attendanceRate > 0 ? Math.round(dm.attendanceRate * 0.8 + (margin > 10 ? 20 : 10)) : 0,
          revenue: rev,
          expenses: exp,
          margin: margin,
          formattedRevenue: formatCurrencyValue(rev),
          formattedExpenses: formatCurrencyValue(exp),
        };
      });
    }

    if (!currentBusiness?.id) return [];
    const targetDepts = departments.filter((d) => !currentBusiness?.id || d.business_id === currentBusiness.id);

    return targetDepts.map((dm: any) => {
      const deptEmployees = filteredEmployees.filter(
        (e) => e.departmentId === dm.id || (e as any).department_id === dm.id
      );
      const deptEmpIds = new Set(deptEmployees.map((e) => e.id));

      const deptTxs = filteredTx.filter((t) => {
        return (
          t.departmentId === dm.id ||
          (t as any).department_id === dm.id ||
          (t.employeeId && deptEmpIds.has(t.employeeId)) ||
          ((t as any).employee_id && deptEmpIds.has((t as any).employee_id))
        );
      });

      const revenue = deptTxs
        .filter((t) => (t.type === "INCOME" || (t.type as any) === "REVENUE") && t.status !== "REVERSED" && (t.status as any) !== "VOID")
        .reduce((s, t) => s + getTxAmount(t), 0);

      const directExp = deptTxs
        .filter((t) => {
          if (t.status === "REVERSED" || (t.status as any) === "VOID" || (t.status as any) === "CANCELLED") return false;
          if (t.type === "PAYROLL") return true;
          if (t.type === "EXPENSE") {
            if (t.metadata?.payrollCycleId || (t as any).metadata?.payroll_cycle_id) return false;
            return true;
          }
          return false;
        })
        .reduce((s, t) => s + getTxAmount(t), 0);

      const hasDeptPayrollTx = deptTxs.some(t => t.type === "PAYROLL" && t.status !== "REVERSED" && (t.status as any) !== "VOID" && (t.status as any) !== "CANCELLED");
      const deptPayrolls = filteredPayrolls.filter((p) => {
        const emp = (employees || []).find((e) => e.id === (p.employeeId || p.employee_id));
        return (
          (p.department_id || (p as any).departmentId || emp?.departmentId || (emp as any)?.department_id) === dm.id ||
          (p.employee_id && deptEmpIds.has(p.employee_id)) ||
          (p.employeeId && deptEmpIds.has(p.employeeId))
        );
      });
      const deptPayrollCost = deptPayrolls.reduce(
        (sum, p: any) => sum + (p.grossSalary || (p.gross_salary_cents ? p.gross_salary_cents / 100 : 0) || (p.baseSalary || 0)),
        0
      );
      const expenses = directExp + (hasDeptPayrollTx ? 0 : deptPayrollCost);
      const margin = revenue > 0 ? Math.round(((revenue - expenses) / revenue) * 100) : 0;

      const deptAtt = filteredAttendance.filter((a) => {
        const emp = (employees || []).find((e) => e.id === (a.employeeId || (a as any).employee_id));
        return (
          (a.departmentId || (a as any).department_id || emp?.departmentId || (emp as any)?.department_id) === dm.id ||
          (a.employeeId && deptEmpIds.has(a.employeeId)) ||
          ((a as any).employee_id && deptEmpIds.has((a as any).employee_id))
        );
      });
      const deptHours = deptAtt.reduce((sum, a) => {
        if (typeof a.realHours === "number" && !isNaN(a.realHours) && a.realHours >= 0) return sum + a.realHours;
        if (typeof (a as any).hoursWorked === "number" && !isNaN((a as any).hoursWorked) && (a as any).hoursWorked >= 0) return sum + (a as any).hoursWorked;
        return sum;
      }, 0);
      const avgHours = deptAtt.length > 0 ? Math.round((deptHours / deptAtt.length) * 10) / 10 : 0;
      const deptPresent = deptAtt.filter((a) => a.status !== "ABSENT").length;
      const attendanceRate = deptAtt.length > 0 ? Math.round((deptPresent / deptAtt.length) * 100) : 0;
      const productivityScore = attendanceRate > 0 ? Math.round(attendanceRate * 0.8 + (margin > 10 ? 20 : 10)) : 0;

      return {
        departmentId: dm.id,
        departmentName: dm.name,
        name: dm.name,
        employeeCount: deptEmployees.length,
        totalStaff: deptEmployees.length,
        averageHours: avgHours,
        avgHours: avgHours,
        attendanceRate: attendanceRate,
        productivityScore: productivityScore,
        revenue,
        expenses,
        margin,
        formattedRevenue: formatCurrencyValue(revenue),
        formattedExpenses: formatCurrencyValue(expenses),
      };
    });
  }, [biSnapshot?.departmentPerformance, departments, filteredEmployees, filteredTx, filteredPayrolls, employees, currentBusiness?.id, formatCurrencyValue]);

  // Ranked Employees
  const effectiveRankMetric = rankBy || employeeRankMetric || "productivity";
  const rankedEmployees = useMemo(() => {
    return [...employeeScorecards].sort((a, b) => {
      if (effectiveRankMetric === "hours") return b.totalHours - a.totalHours;
      if (effectiveRankMetric === "commissions") return b.commissions - a.commissions;
      if (effectiveRankMetric === "attendance") return b.attendanceConsistencyScore - a.attendanceConsistencyScore;
      return b.productivityIndex - a.productivityIndex;
    });
  }, [employeeScorecards, effectiveRankMetric]);

  // Cashflow Timeline
  const cashflowTimeline = useMemo(() => {
    if (!isFiltered && biSnapshot?.historicalTrends && biSnapshot.historicalTrends.length > 0) {
      return biSnapshot.historicalTrends.map((t) => ({
        date: t.label || t.key,
        Revenus: t.gross,
        Dépenses: t.gross - t.net,
        Net: t.net,
      }));
    }

    const dateMap: Record<string, { date: string; Revenus: number; Dépenses: number; Net: number }> = {};
    filteredTx.forEach((tx) => {
      const d = tx.date ? tx.date.split("T")[0] : "";
      if (!d) return;
      if (!dateMap[d]) {
        dateMap[d] = { date: d, Revenus: 0, Dépenses: 0, Net: 0 };
      }
      const amt = getTxAmount(tx);
      if ((tx.type === "INCOME" || (tx.type as any) === "REVENUE") && tx.status !== "REVERSED" && (tx.status as any) !== "VOID") {
        dateMap[d].Revenus += amt;
      } else if (
        tx.status !== "REVERSED" &&
        (tx.status as any) !== "VOID" &&
        (tx.status as any) !== "CANCELLED"
      ) {
        if (tx.type === "PAYROLL") {
          dateMap[d].Dépenses += amt;
        } else if (tx.type === "EXPENSE" && !tx.metadata?.payrollCycleId && !(tx as any).metadata?.payroll_cycle_id) {
          dateMap[d].Dépenses += amt;
        }
      }
    });

    const items = Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        Net: item.Revenus - item.Dépenses,
      }));

    return items;
  }, [biSnapshot?.historicalTrends, filteredTx]);

  // Expense Categories
  const expenseCategoryChartData = useMemo(() => {
    if (!isFiltered && biSnapshot?.expenseBreakdown && biSnapshot.expenseBreakdown.length > 0) {
      return biSnapshot.expenseBreakdown;
    }

    const catMap: Record<string, number> = {};
    filteredTx.forEach((tx) => {
      if (tx.status === "REVERSED" || (tx.status as any) === "VOID" || (tx.status as any) === "CANCELLED") return;
      if (tx.type === "PAYROLL") {
        catMap["Salaires & Masse Salariale"] = (catMap["Salaires & Masse Salariale"] || 0) + getTxAmount(tx);
      } else if (tx.type === "EXPENSE") {
        if (tx.metadata?.payrollCycleId || (tx as any).metadata?.payroll_cycle_id) return;
        const cat = tx.category || tx.description || "Autres Dépenses";
        catMap[cat] = (catMap[cat] || 0) + getTxAmount(tx);
      }
    });

    if (payrollAggregates.totalEmploymentCost > 0 && !catMap["Salaires & Masse Salariale"]) {
      catMap["Salaires & Masse Salariale"] = payrollAggregates.totalEmploymentCost;
    }

    const entries = Object.entries(catMap).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));

    return entries.length > 0 ? entries : [{ name: "Aucune Dépense", value: 1 }];
  }, [biSnapshot?.expenseBreakdown, filteredTx, payrollAggregates.totalEmploymentCost]);

  // Dashboard Chart Data
  const dashboardChartData = useMemo(() => {
    if (!currentBusiness?.id) return [];
    const sourceTxs = isFiltered ? filteredTx : ledgerTransactions;
    const txs = sourceTxs.filter(
      (tx) => (tx.business_id === currentBusiness.id || (tx as any).businessId === currentBusiness.id) && tx.status !== "REVERSED"
    );

    const sortedTxs = [...txs].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const dateMap: Record<string, { date: string; revenue: number; expenses: number; net: number }> = {};

    sortedTxs.forEach((tx) => {
      const dateStr = tx.date || "";
      if (!dateStr) return;
      let formattedDate = dateStr;
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
            day: "numeric",
            month: "short",
          });
        }
      } catch (e) {}

      if (!dateMap[dateStr]) {
        dateMap[dateStr] = {
          date: formattedDate,
          revenue: 0,
          expenses: 0,
          net: 0,
        };
      }

      const amount = getTxAmount(tx);

      if (tx.type === "INCOME") {
        dateMap[dateStr].revenue += amount;
      } else if (tx.type === "PAYROLL") {
        dateMap[dateStr].expenses += amount;
      } else if (tx.type === "EXPENSE") {
        if (!tx.metadata?.payrollCycleId) {
          dateMap[dateStr].expenses += amount;
        }
      }
    });

    const list = Object.keys(dateMap)
      .sort()
      .map((key) => {
        const item = dateMap[key];
        item.net = item.revenue - item.expenses;
        return item;
      });

    return list.slice(-10);
  }, [ledgerTransactions, filteredTx, isFiltered, currentBusiness?.id, language]);

  return {
    biSnapshot,
    snapshot: biSnapshot,
    usdToHtgRate,
    isSocialTaxEnabled,
    selectedCurrency,
    formatCurrencyValue,
    formatValueDirectly,
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMarginPercentage,
    financialStressScore,
    totalAdvancesPending,
    activeEmployeesCount,
    attendanceAggregates,
    attendanceConsistencyPct: attendanceAggregates.attendanceRate,
    payrollAggregates,
    payrollTaxesTotal: payrollAggregates.cnssContributions,
    totalPayrollMass: payrollAggregates.totalEmploymentCost,
    totalCommissionPaid: payrollAggregates.commissionsPaid,
    totalAdvancesIssued: totalAdvancesPending,
    avgHoursClocked: attendanceAggregates.avgHours,
    unplannedAbsenteeismRate: attendanceAggregates.absenceRate,
    burnRatePercentage: totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 100) : 0,
    cnsTaxesAmount: payrollAggregates.cnsContributions,
    cnssTaxesAmount: payrollAggregates.cnssContributions,
    branchMetrics,
    chartBranchData,
    employeeScorecards,
    departmentMetrics,
    enrichedDepartmentMetrics,
    rankedEmployees,
    cashflowTimeline,
    expenseCategoryChartData,
    dashboardChartData,
    filteredEmployees,
    filteredTx,
    filteredAttendance,
  };
}
