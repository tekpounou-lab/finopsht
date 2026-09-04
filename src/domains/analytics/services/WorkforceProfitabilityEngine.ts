import {
  Employee,
  LedgerTransaction,
  AttendanceRecord,
  PayrollRecord,
  Department,
  Branch,
  EmployeeDepartmentActivity,
} from "../../../types";
import {
  EmployeeProfitabilityRecord,
  DepartmentProfitabilityRecord,
  WorkforceRankings,
  WorkforceAdvisorInsight,
  WorkforceAdvisorRecommendation,
  WorkforceExecutiveSummary,
  WorkforceProfitabilitySnapshot,
} from "../types/workforceProfitability";
import { filterOperationalEmployees } from "../../../services/workforce/EmployeeEligibilityService";
import { RevenueAttributionService } from "../../../services/RevenueAttributionService";

export class WorkforceProfitabilityEngine {
  /**
   * Generates complete Workforce Profitability Intelligence from raw ERP data.
   * Runs deterministically and attaches metrics directly to the Analytics Snapshot.
   */
  static generateWorkforceProfitabilitySnapshot(
    businessId: string,
    period: string,
    employees: Employee[],
    transactions: LedgerTransaction[],
    attendanceLogs: AttendanceRecord[],
    payrollRecords: PayrollRecord[],
    departments: Department[],
    branches: Branch[],
    activities?: EmployeeDepartmentActivity[],
    startDate?: string,
    endDate?: string,
    businessSettings?: any
  ): WorkforceProfitabilitySnapshot {
    const isSocialTaxEnabled = businessSettings?.payroll?.taxes?.enabled !== undefined
      ? Boolean(businessSettings.payroll.taxes.enabled)
      : (businessSettings?.payroll?.enable_social_taxes !== undefined
          ? Boolean(businessSettings.payroll.enable_social_taxes)
          : false);

    const matchesBusiness = (item: any) => {
      if (!businessId) return true;
      const bId = item?.business_id || item?.businessId;
      return !bId || bId === businessId;
    };

    let calculatedExpectedDays = 22;
    if (startDate && endDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
          let workingDays = 0;
          const cur = new Date(s);
          let guard = 0;
          while (cur <= e && guard < 1000) {
            guard++;
            const dayOfWeek = cur.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
              workingDays++;
            }
            cur.setDate(cur.getDate() + 1);
          }
          if (workingDays > 0) calculatedExpectedDays = workingDays;
        }
      } catch (err) {}
    }

    const matchedEmps = filterOperationalEmployees(employees.filter((e) => matchesBusiness(e)));
    const businessEmployees = matchedEmps.length > 0 ? matchedEmps : filterOperationalEmployees(employees);

    const matchedDepts = departments.filter((d) => matchesBusiness(d));
    const businessDepts = matchedDepts.length > 0 ? matchedDepts : departments;

    const matchedBranches = branches.filter((b) => matchesBusiness(b));
    const businessBranches = matchedBranches.length > 0 ? matchedBranches : branches;

    // 1. Calculate Employee Profitability Records
    const employeeRecords: EmployeeProfitabilityRecord[] = businessEmployees.map((emp) => {
      const dept = businessDepts.find((d) => d.id === emp.departmentId || d.id === (emp as any).department_id);
      const branch = businessBranches.find((b) => b.id === emp.branchId || b.id === (emp as any).branch_id);

      const deptName = dept?.name || "Général / Non Assigné";
      const branchName = branch?.name || "Siège Principal";

      // Filter employee-specific data
      const empAttendance = attendanceLogs.filter((a) => a.employeeId === emp.id || (a as any).employee_id === emp.id);
      const empTxs = transactions.filter(
        (t) =>
          matchesBusiness(t) &&
          (t.employeeId === emp.id || (t as any).employee_id === emp.id) &&
          t.status !== "REVERSED"
      );
      const empPayroll = payrollRecords.find((p) => p.employeeId === emp.id || (p as any).employee_id === emp.id);

      const hasActivity = empAttendance.length > 0 || empTxs.length > 0 || empPayroll !== undefined;

      // Financial Calculation
      const monthlySalary = empPayroll
        ? (empPayroll.grossSalary || ((empPayroll as any).gross_salary_cents ? (empPayroll as any).gross_salary_cents / 100 : emp.salaryBaseHtg || emp.baseSalary || 0))
        : (empAttendance.length > 0 ? (emp.salaryBaseHtg || emp.baseSalary || 0) : 0);
      const employerContributions = isSocialTaxEnabled && empPayroll
        ? ((empPayroll.cnss_employer_cents || 0) + (empPayroll.ofatma_employer_cents || 0)) / 100
        : 0;
      const commissions = empPayroll?.commissions || 
        empTxs.filter((t) => t.type === "COMPENSATION" || t.type === "BONUS").reduce((s, t) => s + t.amount, 0);
      const benefitsCost = Math.round(commissions + ((empPayroll as any)?.allowances_cents ? (empPayroll as any).allowances_cents / 100 : 0));
      const totalEmploymentCost = Math.round(monthlySalary + employerContributions + benefitsCost);

      const avgCostPerDay = calculatedExpectedDays > 0 ? Math.round(totalEmploymentCost / calculatedExpectedDays) : 0;
      const avgCostPerHour = (calculatedExpectedDays * 8) > 0 ? Math.round(totalEmploymentCost / (calculatedExpectedDays * 8)) : 0;

      // Attendance Calculation
      const totalExpectedDays = calculatedExpectedDays;
      const expectedHours = calculatedExpectedDays * 8;
      const workedDays = empAttendance.filter((a) => a.status === "NORMAL" || a.status === "LATE" || a.status === "OVERTIME").length;
      const lateArrivals = empAttendance.filter((a) => a.status === "LATE").length;
      const unauthorizedAbsences = empAttendance.filter((a) => a.status === "ABSENT").length;
      const leaveDays = empAttendance.filter((a) => (a.status as string) === "LEAVE" || (a.status as string) === "VACATION").length;
      const workedHours = empAttendance.reduce((sum, a) => {
        const status = a.status as string;
        if (status === "ABSENT" || status === "LEAVE" || status === "VACATION") return sum;
        return sum + (a.realHours || (a.plannedHours || 8));
      }, 0);
      const overtimeHours = empAttendance.reduce((sum, a) => sum + Math.max(0, (a.realHours || 0) - (a.plannedHours || 8)), 0);

      const attendanceRate = expectedHours > 0 ? Math.min(100, Math.round((workedHours / expectedHours) * 100)) : 0;
      const absenceRate = totalExpectedDays > 0 ? Math.min(100, Math.round((unauthorizedAbsences / totalExpectedDays) * 100)) : 0;
      const productivityHours = Math.round(workedHours * (1 - lateArrivals * 0.015));

      // Operational Calculation
      const salesGenerated = empTxs
        .filter((t) => {
          const typeUpper = (t.type || "").toUpperCase();
          const catUpper = (t.category || "").toUpperCase();
          return (
            typeUpper === "INCOME" ||
            typeUpper === "SALES" ||
            typeUpper === "REVENUE" ||
            catUpper === "REVENUE" ||
            catUpper === "SALES" ||
            catUpper === "VENTES" ||
            catUpper === "INCOME"
          );
        })
        .reduce((sum, t) => sum + t.amount, 0);

      const transactionsProcessed = empTxs.length;
      const invoicesProcessed = empTxs.filter((t) => t.type === "INCOME" || t.type === "EXPENSE").length;
      const customersServed = 0;
      const tasksCompleted = 0;
      const projectsAssigned = 0;
      const projectsCompleted = 0;
      const unitsProduced = 0;

      // Revenue Generation Logic (Direct Sales or Role-based Allocation)
      let revenueGenerated = salesGenerated;

      const grossProfitGenerated = revenueGenerated - totalEmploymentCost;

      // Efficiency Metrics
      const revenuePerHour = workedHours > 0 ? Math.round(revenueGenerated / workedHours) : 0;
      const revenuePerDay = Math.round(revenueGenerated / 22);
      const revenuePerPayrollDollar = Number((revenueGenerated / (totalEmploymentCost || 1)).toFixed(2));
      const costPerOutput = Math.round(totalEmploymentCost / (transactionsProcessed || 1));
      const outputPerHour = Number(((transactionsProcessed || 1) / (workedHours || 1)).toFixed(2));

      const productivityScore = hasActivity && expectedHours > 0 ? Math.max(0, Math.min(100, Math.round((workedHours / expectedHours) * 100 - lateArrivals * 2))) : 0;
      const efficiencyScore = hasActivity ? Math.max(0, Math.min(100, Math.round((revenuePerPayrollDollar / 3) * 100))) : 0;
      const performanceScore = hasActivity ? Math.round((productivityScore + efficiencyScore + attendanceRate) / 3) : 0;
      const utilizationRate = expectedHours > 0 ? Math.round((workedHours / expectedHours) * 100) : 0;

      // Profitability Metrics
      const employeeCost = totalEmploymentCost;
      const employeeRevenue = revenueGenerated;
      const employeeGrossMargin = grossProfitGenerated;
      const roi = hasActivity && employeeCost > 0 ? Math.round(((employeeRevenue - employeeCost) / employeeCost) * 100) : 0;
      const profitContribution = employeeGrossMargin;
      const netValueCreated = employeeGrossMargin;
      const profitabilityIndex = Number((employeeRevenue / (employeeCost || 1)).toFixed(2));

      let profitabilityLabel: "Excellent" | "Good" | "Needs Attention" | "Critical" = "Needs Attention";
      if (roi >= 120) profitabilityLabel = "Excellent";
      else if (roi >= 40) profitabilityLabel = "Good";
      else if (roi >= 0) profitabilityLabel = "Needs Attention";
      else profitabilityLabel = "Critical";

      // Health Score Calculation (0-100)
      const attendanceComponent = attendanceRate * 0.25;
      const productivityComponent = productivityScore * 0.25;
      const profitabilityComponent = Math.min(100, Math.max(0, (roi / 200) * 100)) * 0.25;
      const complianceComponent = hasActivity ? Math.max(0, 100 - lateArrivals * 5 - unauthorizedAbsences * 15) * 0.25 : 0;

      const healthScoreValue = hasActivity
        ? Math.round(attendanceComponent + productivityComponent + profitabilityComponent + complianceComponent)
        : 0;

      let healthLabel: "Excellent" | "Good" | "Needs Attention" | "Critical" = "Needs Attention";
      let badgeColor = "bg-slate-800/40 text-slate-400 border-slate-700/40";

      if (hasActivity) {
        if (healthScoreValue >= 90) {
          healthLabel = "Excellent";
          badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
        } else if (healthScoreValue >= 75) {
          healthLabel = "Good";
          badgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
        } else if (healthScoreValue >= 55) {
          healthLabel = "Needs Attention";
          badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/30";
        } else {
          healthLabel = "Critical";
          badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/30";
        }
      }

      // Trends from current period
      const dates = [period];
      const productivityTrend = dates.map((d, idx) => ({
        date: d,
        score: productivityScore,
      }));

      const attendanceTrend = dates.map((d, idx) => ({
        date: d,
        rate: attendanceRate,
      }));

      const payrollVsRevenueTrend = dates.map((d, idx) => ({
        date: d,
        cost: Math.round(totalEmploymentCost),
        revenue: Math.round(revenueGenerated),
      }));

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        email: emp.email || `${emp.id}@entreprise.ht`,
        role: emp.role || "Employé",
        departmentId: emp.departmentId || (emp as any).department_id || "general",
        departmentName: deptName,
        branchId: emp.branchId || (emp as any).branch_id || "main",
        branchName: branchName,
        avatarUrl: (emp as any).avatarUrl,
        employmentType: emp.status || "Plein temps",
        status: "ACTIVE",

        financial: {
          monthlySalary,
          employerContributions,
          benefitsCost,
          totalEmploymentCost,
          payrollCostTrend: "STABLE",
          avgCostPerDay,
          avgCostPerHour,
        },
        attendance: {
          attendanceRate,
          lateArrivals,
          absenceRate,
          unauthorizedAbsences,
          leaveDays,
          overtimeHours,
          expectedHours,
          workedHours,
          productivityHours,
        },
        operational: {
          tasksCompleted,
          projectsAssigned,
          projectsCompleted,
          salesGenerated,
          invoicesProcessed,
          customersServed,
          transactionsProcessed,
          unitsProduced,
          revenueGenerated,
          grossProfitGenerated,
        },
        efficiency: {
          revenuePerHour,
          revenuePerDay,
          revenuePerPayrollDollar,
          costPerOutput,
          outputPerHour,
          productivityScore,
          efficiencyScore,
          performanceScore,
          utilizationRate,
        },
        profitability: {
          employeeCost,
          employeeRevenue,
          employeeGrossMargin,
          roi,
          profitContribution,
          netValueCreated,
          profitabilityIndex,
          profitabilityLabel,
        },
        healthScore: {
          score: healthScoreValue,
          label: healthLabel,
          badgeColor,
          attendanceScore: attendanceRate,
          performanceScore,
          productivityScore,
          profitabilityScore: Math.min(100, Math.round((roi / 200) * 100)),
          complianceScore: Math.max(0, 100 - lateArrivals * 5 - unauthorizedAbsences * 15),
          qualityScore: 92,
        },
        crossDepartmentAttribution: RevenueAttributionService.calculateEmployeeAttribution(emp, transactions, businessDepts, activities).operationalDistribution,
        productivityTrend,
        attendanceTrend,
        payrollVsRevenueTrend,
      };
    });

    // 2. Calculate Department Profitability Records using the new operational attribution model
    const departmentRecords: DepartmentProfitabilityRecord[] = businessDepts.map((dept) => {
      const summary = RevenueAttributionService.calculateDepartmentProfitability(
        dept,
        businessEmployees,
        transactions,
        payrollRecords,
        activities
      );

      // Find employees who had operational sales in this department OR whose home HR department is this department
      const deptEmployees = employeeRecords.filter((e) => {
        const hasSalesInDept = e.crossDepartmentAttribution && e.crossDepartmentAttribution[dept.id] && e.crossDepartmentAttribution[dept.id].revenue > 0;
        const isHome = e.departmentId === dept.id;
        return hasSalesInDept || isHome;
      });

      const totalEmployees = deptEmployees.length;
      const totalPayrollCost = summary.totalDirectLaborCost;
      const revenueGenerated = summary.operationalRevenue;
      const grossMargin = summary.contributionMargin;
      const departmentProfit = summary.contributionMargin;

      const averageProductivity = totalEmployees > 0
        ? Math.round(deptEmployees.reduce((sum, e) => sum + e.efficiency.productivityScore, 0) / totalEmployees)
        : 0;

      const averageAttendance = totalEmployees > 0
        ? Math.round(deptEmployees.reduce((sum, e) => sum + e.attendance.attendanceRate, 0) / totalEmployees)
        : 0;

      const averagePerformance = totalEmployees > 0
        ? Math.round(deptEmployees.reduce((sum, e) => sum + e.efficiency.performanceScore, 0) / totalEmployees)
        : 0;

      const averageSalary = summary.headcountHome > 0 ? Math.round(summary.homeEmployeePayrollCost / summary.headcountHome) : 0;
      const averageRevenuePerEmployee = summary.activeSellingEmployees > 0 ? Math.round(summary.operationalRevenue / summary.activeSellingEmployees) : 0;
      const averageCostPerEmployee = totalEmployees > 0 ? Math.round(summary.totalDirectLaborCost / totalEmployees) : 0;

      const departmentProfitabilityScore = summary.operatingMarginPercentage;

      let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
      if (departmentProfitabilityScore < 40 || averageAttendance < 70) riskLevel = "CRITICAL";
      else if (departmentProfitabilityScore < 60 || averageAttendance < 80) riskLevel = "HIGH";
      else if (departmentProfitabilityScore < 80) riskLevel = "MEDIUM";

      const employeeBreakdown = deptEmployees.map((e) => {
        const deptSales = e.crossDepartmentAttribution?.[dept.id]?.revenue || 0;
        const isHome = e.departmentId === dept.id;
        const actualComm = deptSales * 0.05; // default 5%
        return {
          id: e.employeeId,
          name: e.employeeName,
          cost: Math.round(isHome ? e.financial.totalEmploymentCost : actualComm),
          revenue: Math.round(deptSales),
          profit: Math.round(deptSales - (isHome ? e.financial.totalEmploymentCost : actualComm)),
        };
      });

      const costVsRevenueHistory = [{ period, cost: totalPayrollCost, revenue: revenueGenerated, profit: revenueGenerated - totalPayrollCost }];

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        managerName: "Directeur de Département",
        totalEmployees,
        totalPayrollCost,
        revenueGenerated,
        grossMargin,
        departmentProfit,
        averageProductivity,
        averageAttendance,
        averagePerformance,
        averageSalary,
        averageRevenuePerEmployee,
        averageCostPerEmployee,
        departmentProfitabilityScore,
        trend: "UP",
        riskLevel,
        employeeBreakdown,
        costVsRevenueHistory,
      };
    });

    // 3. Compute Rankings
    const sortedByPerformance = [...employeeRecords].sort((a, b) => b.efficiency.performanceScore - a.efficiency.performanceScore);
    const sortedByProfitability = [...employeeRecords].sort((a, b) => b.profitability.employeeGrossMargin - a.profitability.employeeGrossMargin);
    const sortedByAttendance = [...employeeRecords].sort((a, b) => b.attendance.attendanceRate - a.attendance.attendanceRate);
    const sortedByProductivity = [...employeeRecords].sort((a, b) => b.efficiency.productivityScore - a.efficiency.productivityScore);
    const sortedByRevenue = [...employeeRecords].sort((a, b) => b.profitability.employeeRevenue - a.profitability.employeeRevenue);
    const sortedByRoi = [...employeeRecords].sort((a, b) => b.profitability.roi - a.profitability.roi);
    const sortedByCostPerRevenue = [...employeeRecords].sort((a, b) => a.efficiency.costPerOutput - b.efficiency.costPerOutput);
    const sortedByRiskEmployees = [...employeeRecords].sort((a, b) => a.healthScore.score - b.healthScore.score);

    const sortedDeptsByPerf = [...departmentRecords].sort((a, b) => b.departmentProfitabilityScore - a.departmentProfitabilityScore);
    const sortedDeptsByProfit = [...departmentRecords].sort((a, b) => b.departmentProfit - a.departmentProfit);
    const sortedDeptsByRisk = [...departmentRecords].sort((a, b) => a.departmentProfitabilityScore - b.departmentProfitabilityScore);

    const rankings: WorkforceRankings = {
      topPerformingEmployees: sortedByPerformance.slice(0, 10),
      topPerformingDepartments: sortedDeptsByPerf.slice(0, 10),
      mostProfitableEmployees: sortedByProfitability.slice(0, 10),
      mostProfitableDepartments: sortedDeptsByProfit.slice(0, 10),
      mostImprovedEmployees: sortedByPerformance.slice(0, 10),
      highestAttendanceEmployees: sortedByAttendance.slice(0, 10),
      highestProductivityEmployees: sortedByProductivity.slice(0, 10),
      highestRevenueEmployees: sortedByRevenue.slice(0, 10),
      highestRoiEmployees: sortedByRoi.slice(0, 10),
      lowestCostPerRevenueEmployees: sortedByCostPerRevenue.slice(0, 10),
      highestRiskEmployees: sortedByRiskEmployees.slice(0, 10),
      highestRiskDepartments: sortedDeptsByRisk.slice(0, 10),
    };

    // 4. Generate AI Advisor Insights & Recommendations (Real Data Only)
    const insights: WorkforceAdvisorInsight[] = [];
    const recommendations: WorkforceAdvisorRecommendation[] = [];

    const totalCompanyRevenue = employeeRecords.reduce((sum, e) => sum + e.profitability.employeeRevenue, 0);
    const totalCompanyCost = employeeRecords.reduce((sum, e) => sum + e.financial.totalEmploymentCost, 0);
    const activeWorkedEmployees = employeeRecords.filter((e) => e.attendance.workedHours > 0 || e.profitability.employeeRevenue > 0 || e.financial.totalEmploymentCost > 0);
    const hasCompanyActivity = activeWorkedEmployees.length > 0 || totalCompanyRevenue > 0 || totalCompanyCost > 0;

    // 5. Generate AI Executive Summary
    const avgHealthScore = hasCompanyActivity && activeWorkedEmployees.length > 0
      ? Math.round(activeWorkedEmployees.reduce((s, e) => s + e.healthScore.score, 0) / activeWorkedEmployees.length)
      : 0;

    let healthLabel: "Excellent" | "Good" | "Needs Attention" | "Critical" = "Needs Attention";
    if (hasCompanyActivity) {
      if (avgHealthScore >= 90) healthLabel = "Excellent";
      else if (avgHealthScore >= 75) healthLabel = "Good";
      else if (avgHealthScore >= 55) healthLabel = "Needs Attention";
      else healthLabel = "Critical";
    }

    const totalNetValue = totalCompanyRevenue - totalCompanyCost;
    const overallRoi = hasCompanyActivity && totalCompanyCost > 0 ? Math.round((totalNetValue / totalCompanyCost) * 100) : 0;

    const dataAvailabilityStatus = hasCompanyActivity ? "COMPLETE" : "INSUFFICIENT";

    if (!hasCompanyActivity) {
      insights.push({
        id: "ins_no_data",
        category: "PRODUCTIVITY",
        severity: "WARNING",
        message: "Aucune transaction, pointage ou bulletin de paie n'a été enregistré pour la période sélectionnée.",
        metricProof: "0 pointages • 0 HTG de ventes • 0 bulletin"
      });
      recommendations.push({
        id: "rec_adjust_dates",
        title: "Ajuster la période temporelle",
        type: "REVIEW_SCHEDULES",
        targetType: "DEPARTMENT",
        targetId: "all",
        targetName: "Toute l'organisation",
        impact: "MEDIUM",
        description: "Sélectionnez une période ou une plage de dates comprenant des opérations d'entreprise réelles.",
        metricsReference: "Plage de dates vide"
      });
    }

    const executiveSummary: WorkforceExecutiveSummary = {
      headline: hasCompanyActivity
        ? `Analyse Exécutive de Rentabilité du Capital Humain (${period})`
        : `Aucune activité RH enregistrée sur la période (${period})`,
      currentWorkforceHealthScore: avgHealthScore,
      currentWorkforceHealthLabel: healthLabel,
      totalWorkforceCost: totalCompanyCost,
      totalWorkforceRevenue: totalCompanyRevenue,
      totalNetValueCreated: totalNetValue,
      overallRoi,
      operationalRisksCount: sortedByRiskEmployees.filter((e) => e.healthScore.score > 0 && e.healthScore.score < 65).length,
      keyOpportunitiesCount: sortedByRoi.filter((e) => e.profitability.roi > 150).length,
      recommendedActionsCount: recommendations.length,
      priorityLevel: avgHealthScore < 70 ? "HIGH" : "MEDIUM",
      confidenceScore: hasCompanyActivity ? 96 : 0,
      dataAvailabilityStatus,
      dataAvailabilityMessage: !hasCompanyActivity ? "Aucune donnée enregistrée sur la période sélectionnée." : undefined,
      insights,
      recommendations,
    };

    return {
      generatedAt: new Date().toISOString(),
      businessId,
      period,
      employees: employeeRecords,
      departments: departmentRecords,
      rankings,
      executiveSummary,
    };
  }
}
