import { BusinessFact } from '../types';
import { KPIRegistry } from '../KPIs/registry';

export class RevenueEngine {
  calculateRevenueBreakdown(facts: BusinessFact[]) {
    const incomeFacts = facts.filter(f => f.type === 'transaction' && (f.category === 'INCOME' || f.metadata.type === 'INCOME'));
    
    const byCategory: Record<string, number> = {};
    const byProduct: Record<string, number> = {};
    const byService: Record<string, number> = {};

    incomeFacts.forEach(fact => {
      const cat = fact.subcategory || fact.metadata.subcategory || 'Autres';
      const prod = fact.product || fact.metadata.product || 'Aucun';
      const serv = fact.service || fact.metadata.service || 'Aucun';

      byCategory[cat] = (byCategory[cat] || 0) + fact.amount;
      if (prod !== 'Aucun') byProduct[prod] = (byProduct[prod] || 0) + fact.amount;
      if (serv !== 'Aucun') byService[serv] = (byService[serv] || 0) + fact.amount;
    });

    return {
      total: KPIRegistry.revenue.formula(facts),
      byCategory,
      byProduct,
      byService,
      averageTicket: KPIRegistry.averageTicket.formula(facts),
      count: incomeFacts.length
    };
  }

  calculateMonthlyTrends(facts: BusinessFact[]) {
    const monthlyData: Record<string, { revenue: number; expenses: number; profit: number }> = {};

    facts.forEach(fact => {
      const date = new Date(fact.date);
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData[yearMonth]) {
        monthlyData[yearMonth] = { revenue: 0, expenses: 0, profit: 0 };
      }

      if (fact.type === 'transaction') {
        if (fact.category === 'INCOME' || fact.metadata.type === 'INCOME') {
          monthlyData[yearMonth].revenue += fact.amount;
        } else if (fact.category === 'EXPENSE' || fact.metadata.type === 'EXPENSE') {
          // Disbursements (EXPENSE with payrollCycleId) are NOT expenses (they are liability reductions)
          const isDisbursement = !!fact.metadata.payrollCycleId;
          if (!isDisbursement) {
            monthlyData[yearMonth].expenses += fact.amount;
          }
        } else if (fact.category === 'PAYROLL' || fact.metadata.type === 'PAYROLL') {
          monthlyData[yearMonth].expenses += fact.amount;
        }
      }
    });

    // Calculate profits
    Object.keys(monthlyData).forEach(key => {
      monthlyData[key].profit = monthlyData[key].revenue - monthlyData[key].expenses;
    });

    return Object.keys(monthlyData).sort().map(month => ({
      month,
      ...monthlyData[month]
    }));
  }

  calculateAdvancedFinancials(allFacts: BusinessFact[], periodFacts: BusinessFact[]) {
    // 1. Running Balances (all-time)
    let cash = 0;
    let bank = 0;
    let mobile = 0;
    let bankSogebank = 0;
    let bankUnibank = 0;
    
    allFacts.filter(f => f.type === 'transaction').forEach(tx => {
      const amt = tx.amount;
      const isIncoming = tx.category === 'INCOME';
      const isOutgoing = (tx.category === 'EXPENSE' || tx.category === 'PAYROLL' || tx.category === 'ADVANCE' || tx.category === 'REFUND') && tx.metadata?.payment_method !== 'NON_CASH';
      
      let delta = 0;
      if (isIncoming) delta = amt;
      else if (isOutgoing) delta = -amt;

      const pm = tx.metadata?.payment_method || 'CASH';
      if (pm === 'CASH') cash += delta;
      else if (pm === 'BANK' || pm === 'WIRE') {
        bank += delta;
        const desc = (tx.metadata?.description || '').toLowerCase();
        if (desc.includes('sogebank')) bankSogebank += delta;
        else if (desc.includes('unibank')) bankUnibank += delta;
        else bankUnibank += delta; // Default fallback to unibank based on original logic
      } else if (pm === 'MONCASH' || pm === 'NATCASH') {
        mobile += delta;
      }
    });

    // 2. Top Clients (period only)
    const clientMap: Record<string, number> = {};
    periodFacts.filter(f => f.type === 'transaction' && f.category === 'INCOME').forEach(tx => {
      let clientName = tx.metadata?.description || '';
      clientName = clientName
        .replace(/^\[IMPORT\]\s*/i, '')
        .replace(/^\[REVERSE\]\s*/i, '')
        .replace(/^(vente - |facturation - |facture - |encaissement - |paiement - )/i, '')
        .split('#')[0]
        .trim();
      if (!clientName) clientName = tx.metadata?.employeeName || 'Client Divers';
      clientMap[clientName] = (clientMap[clientName] || 0) + tx.amount;
    });
    
    const sortedClients = Object.entries(clientMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
    const totalIncome = sortedClients.reduce((sum, c) => sum + c.amount, 0);
    const topClients = sortedClients.map((c, idx) => ({
      rank: idx + 1,
      name: c.name,
      amount: c.amount,
      pct: totalIncome > 0 ? `${Math.round((c.amount / totalIncome) * 100)}%` : '0%'
    }));

    // 3. Opex Breakdown (period only)
    const categoryMap: Record<string, number> = {};
    periodFacts.filter(f => f.type === 'transaction' && (
      f.category === 'PAYROLL' || 
      (f.category === 'EXPENSE' && !f.metadata?.payrollCycleId) ||
      f.category === 'ADVANCE' ||
      f.category === 'REFUND'
    )).forEach(tx => {
      let cat = tx.subcategory || 'Autres';
      if (tx.category === 'PAYROLL') cat = 'Masse Salariale';
      if (tx.category === 'ADVANCE') cat = 'Avances sur Salaire';
      categoryMap[cat] = (categoryMap[cat] || 0) + tx.amount;
    });
    
    const sortedOpex = Object.entries(categoryMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    const totalOpex = sortedOpex.reduce((sum, c) => sum + c.amount, 0);
    const opexBreakdown = sortedOpex.map(c => ({
      name: c.name,
      amount: c.amount,
      pct: totalOpex > 0 ? `${Math.round((c.amount / totalOpex) * 100)}%` : '0%'
    }));

    // 4. Advances Sum (period only)
    const advancesSum = periodFacts
      .filter(f => f.type === 'transaction' && f.category === 'ADVANCE')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      runningBalances: { cash, bank, mobile, bankSogebank, bankUnibank },
      topClients,
      opexBreakdown,
      advancesSum
    };
  }

}