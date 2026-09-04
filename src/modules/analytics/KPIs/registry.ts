import { KPI } from '../types';

export const KPIRegistry: Record<string, KPI> = {
  revenue: {
    id: 'revenue',
    name: 'Chiffre d\'Affaires (Revenue)',
    description: 'Total des revenus générés par l\'entreprise',
    category: 'revenue',
    dimensions: ['business', 'branch', 'department', 'date', 'category', 'product', 'service'],
    frequency: 'monthly',
    format: 'currency',
    color: 'emerald',
    target: 5000000,
    tolerance: 500000,
    importance: 'critical',
    owner: 'CFO',
    source: 'ledger',
    formula: (facts) => facts
      .filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME'))
      .reduce((sum, f) => sum + f.amount, 0),
  },
  expenses: {
    id: 'expenses',
    name: 'Dépenses Opérationnelles (Expenses)',
    description: 'Total des charges et dépenses courantes (P&L)',
    category: 'expense',
    dimensions: ['business', 'branch', 'department', 'date', 'category'],
    frequency: 'monthly',
    format: 'currency',
    color: 'rose',
    target: 2000000,
    tolerance: 200000,
    importance: 'high',
    owner: 'CFO',
    source: 'ledger',
    formula: (facts) => facts
      .filter(f => {
        if (f.type !== 'transaction') return false;
        
        const cat = (f.category || '').toUpperCase();
        const metaType = (f.metadata?.type || '').toUpperCase();
        const desc = (f.metadata?.description || '').toLowerCase();
        const hasCycleId = !!(f.metadata?.payrollCycleId || f.metadata?.payroll_cycle_id);

        const isExpense = cat === 'EXPENSE' || metaType === 'EXPENSE';
        const isPayrollAccrual = cat === 'PAYROLL' || metaType === 'PAYROLL';
        
        // 1. Payroll Accruals are always expenses
        if (isPayrollAccrual) return true;

        // 2. Regular Expenses
        if (isExpense) {
          // Exclude disbursements (linked to cycle)
          if (hasCycleId) return false;

          // Exclude manual payroll expenses to avoid double counting with accruals
          const lowerCat = cat.toLowerCase();
          if (lowerCat.includes('paie') || lowerCat.includes('payroll') || desc.includes('salaire') || desc.includes('payroll')) {
            return false;
          }
          return true;
        }

        // 3. Other P&L items (Bonus, Penalty, Compensation)
        // Only count if NOT already part of a payroll cycle accrual
        const isOtherPnL = ['BONUS', 'PENALTY', 'COMPENSATION'].includes(cat) || ['BONUS', 'PENALTY', 'COMPENSATION'].includes(metaType);
        if (isOtherPnL) {
          return !hasCycleId;
        }

        return false;
      })
      .reduce((sum, f) => {
        const isPenalty = f.category === 'PENALTY' || f.metadata?.type === 'PENALTY';
        return sum + (isPenalty ? -f.amount : f.amount);
      }, 0),
  },
  payrollCost: {
    id: 'payrollCost',
    name: 'Masse Salariale (Payroll Cost)',
    description: 'Coût total des rémunérations et charges sociales',
    category: 'expense',
    dimensions: ['business', 'department', 'employee', 'date'],
    frequency: 'monthly',
    format: 'currency',
    color: 'amber',
    target: 1500000,
    tolerance: 100000,
    importance: 'high',
    owner: 'HR',
    source: 'payroll',
    formula: (facts) => facts
      .filter(f => f.type === 'transaction' && (f.category === 'PAYROLL' || f.metadata.type === 'PAYROLL'))
      .reduce((sum, f) => sum + f.amount, 0),
  },
  profit: {
    id: 'profit',
    name: 'Bénéfice Net (Net Profit)',
    description: 'Résultat net (Revenus - Dépenses)',
    category: 'profitability',
    dimensions: ['business', 'branch', 'department', 'date'],
    frequency: 'monthly',
    format: 'currency',
    color: 'indigo',
    target: 1500000,
    tolerance: 150000,
    importance: 'critical',
    owner: 'CFO',
    source: 'ledger',
    formula: (facts) => {
      const rev = KPIRegistry.revenue.formula(facts);
      const exp = KPIRegistry.expenses.formula(facts);
      return rev - exp;
    },
  },
  netProfit: {
    id: 'netProfit',
    name: 'Marge Opérationnelle',
    description: 'Pourcentage de rentabilité opérationnelle',
    category: 'profitability',
    dimensions: ['business', 'branch', 'department', 'date'],
    frequency: 'monthly',
    format: 'percentage',
    color: 'cyan',
    target: 20,
    tolerance: 5,
    importance: 'critical',
    owner: 'CFO',
    source: 'ledger',
    formula: (facts) => {
      const rev = KPIRegistry.revenue.formula(facts);
      const profit = KPIRegistry.profit.formula(facts);
      return rev > 0 ? (profit / rev) * 100 : 0;
    },
  },
  cashBalance: {
    id: 'cashBalance',
    name: 'Flux de Trésorerie (Net Cash Flow)',
    description: 'Variation nette des liquidités sur la période',
    category: 'profitability',
    dimensions: ['business', 'date'],
    frequency: 'daily',
    format: 'currency',
    color: 'teal',
    importance: 'critical',
    owner: 'CFO',
    source: 'ledger',
    formula: (facts) => {
      // Cash Flow = Actual Cash In - Actual Cash Out
      const cashIn = facts
        .filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME') && f.metadata.payment_method !== 'NON_CASH')
        .reduce((sum, f) => sum + f.amount, 0);
      
      const cashOut = facts
        .filter(f => f.type === 'transaction' && 
          (f.category === 'EXPENSE' || f.metadata.type === 'EXPENSE' || f.category === 'ADVANCE' || f.metadata.type === 'ADVANCE') && 
          f.metadata.payment_method !== 'NON_CASH'
        )
        .reduce((sum, f) => sum + f.amount, 0);

      return cashIn - cashOut;
    },
  },
  attendanceRate: {
    id: 'attendanceRate',
    name: 'Taux de Présence (Attendance Rate)',
    description: 'Proportion de jours de présence effective',
    category: 'efficiency',
    dimensions: ['business', 'branch', 'department', 'employee', 'date'],
    frequency: 'weekly',
    format: 'percentage',
    color: 'emerald',
    target: 95,
    tolerance: 2,
    importance: 'high',
    owner: 'Operations',
    source: 'attendance',
    formula: (facts) => {
      const atts = facts.filter(f => f.type === 'attendance');
      if (atts.length === 0) return 100;
      const present = atts.filter(f => 
        f.metadata.status === 'PRESENT' || 
        f.metadata.status === 'present' || 
        f.metadata.isPresent === true
      ).length;
      return (present / atts.length) * 100;
    },
  },
  absenteeism: {
    id: 'absenteeism',
    name: 'Taux d\'Absentéisme (Absenteeism)',
    description: 'Proportion d\'absences injustifiées ou non',
    category: 'hr',
    dimensions: ['business', 'branch', 'department', 'employee', 'date'],
    frequency: 'weekly',
    format: 'percentage',
    color: 'rose',
    target: 3,
    tolerance: 1,
    importance: 'medium',
    owner: 'HR',
    source: 'attendance',
    formula: (facts) => {
      const rate = KPIRegistry.attendanceRate.formula(facts);
      return 100 - rate;
    },
  },
  revenuePerEmployee: {
    id: 'revenuePerEmployee',
    name: 'Productivité par Collaborateur',
    description: 'Chiffre d\'affaires moyen généré par employé actif',
    category: 'efficiency',
    dimensions: ['business', 'branch', 'department', 'date'],
    frequency: 'monthly',
    format: 'currency',
    color: 'violet',
    target: 120000,
    tolerance: 10000,
    importance: 'high',
    owner: 'CEO',
    source: 'ledger',
    formula: (facts) => {
      const rev = KPIRegistry.revenue.formula(facts);
      const uniqueEmployees = new Set(
        facts.filter(f => f.employeeId).map(f => f.employeeId)
      );
      return uniqueEmployees.size > 0 ? rev / uniqueEmployees.size : rev;
    },
  },
  averageTicket: {
    id: 'averageTicket',
    name: 'Panier Moyen',
    description: 'Montant moyen des transactions entrantes',
    category: 'revenue',
    dimensions: ['business', 'branch', 'date'],
    frequency: 'monthly',
    format: 'currency',
    color: 'sky',
    target: 1500,
    tolerance: 100,
    importance: 'medium',
    owner: 'CFO',
    source: 'ledger',
    formula: (facts) => {
      const incomeFacts = facts.filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME'));
      if (incomeFacts.length === 0) return 0;
      const rev = incomeFacts.reduce((sum, f) => sum + f.amount, 0);
      return rev / incomeFacts.length;
    },
  },
  transactionsCount: {
    id: 'transactionsCount',
    name: 'Volume de Transactions',
    description: 'Nombre total de transactions financières enregistrées',
    category: 'revenue',
    dimensions: ['business', 'branch', 'date'],
    frequency: 'daily',
    format: 'number',
    color: 'slate',
    importance: 'medium',
    owner: 'Operations',
    source: 'ledger',
    formula: (facts) => facts.filter(f => f.type === 'transaction').length,
  }
};
