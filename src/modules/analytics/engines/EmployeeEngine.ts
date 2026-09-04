import { BusinessFact } from '../types';
import { KPIRegistry } from '../KPIs/registry';

export interface EmployeePerformance {
  employeeId: string;
  name: string;
  revenueGenerated: number;
  attendanceRate: number;
  payrollCost: number;
  productivityScore: number; // calculated ratio
}

export class EmployeeEngine {
  calculateEmployeeMetrics(facts: BusinessFact[]) {
    const employeeIds = Array.from(new Set(facts.map(f => f.employeeId).filter(Boolean))) as string[];
    
    const employees: Record<string, EmployeePerformance> = {};

    employeeIds.forEach(empId => {
      const empFacts = facts.filter(f => f.employeeId === empId);
      
      const revenueGenerated = empFacts
        .filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME'))
        .reduce((sum, f) => sum + f.amount, 0);

      const payrollCost = empFacts
        .filter(f => f.type === 'payroll' || f.category === 'PAYROLL')
        .reduce((sum, f) => sum + f.amount, 0);

      const attFacts = empFacts.filter(f => f.type === 'attendance');
      let attendanceRate = 100;
      if (attFacts.length > 0) {
        const present = attFacts.filter(f => f.metadata.status === 'PRESENT' || f.metadata.status === 'present' || f.metadata.isPresent === true).length;
        attendanceRate = (present / attFacts.length) * 100;
      }

      // Productivity = Revenue generated / (Payroll Cost + 1) or simple ranking score
      const productivityScore = payrollCost > 0 ? (revenueGenerated / payrollCost) * 100 : revenueGenerated;

      const empName = empFacts[0]?.metadata?.employeeName || `Employé ${empId.substring(0, 5)}`;

      employees[empId] = {
        employeeId: empId,
        name: empName,
        revenueGenerated,
        attendanceRate,
        payrollCost,
        productivityScore
      };
    });

    const list = Object.values(employees).sort((a, b) => b.productivityScore - a.productivityScore);

    return {
      activeCount: employeeIds.length,
      revenuePerEmployee: KPIRegistry.revenuePerEmployee.formula(facts),
      attendanceRate: KPIRegistry.attendanceRate.formula(facts),
      absenteeism: KPIRegistry.absenteeism.formula(facts),
      ranking: list
    };
  }
}
