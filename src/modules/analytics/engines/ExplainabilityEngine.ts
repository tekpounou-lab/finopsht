import { BusinessFact, DrilldownResult, DimensionType } from '../types';
import { KPIRegistry } from '../KPIs/registry';
import { resolveDepartmentName, resolveBranchName } from '../../../utils/nameResolvers';

export class ExplainabilityEngine {
  explainMetric(
    kpiId: string,
    facts: BusinessFact[],
    dimension: DimensionType = 'department',
    departmentsList: any[] = [],
    branchesList: any[] = []
  ): DrilldownResult {
    const kpi = KPIRegistry[kpiId];
    if (!kpi) {
      throw new Error(`KPI definition not found for: ${kpiId}`);
    }

    const totalValue = kpi.formula(facts);
    
    // Group facts by the chosen dimension
    const groups: Record<string, { id: string; name: string; value: number }> = {};

    facts.forEach(fact => {
      let dimId = 'unknown';
      let dimName = 'Inconnu';

      if (dimension === 'department') {
        dimId = fact.departmentId || 'unassigned';
        if (dimId === 'unassigned') {
          dimName = 'Non Assigné';
        } else {
          dimName = resolveDepartmentName(dimId, fact.metadata.departmentName, departmentsList);
        }
      } else if (dimension === 'branch') {
        dimId = fact.branchId || 'unassigned';
        if (dimId === 'unassigned') {
          dimName = 'Non Assigné';
        } else {
          dimName = resolveBranchName(dimId, fact.metadata.branchName, branchesList);
        }
      } else if (dimension === 'employee') {
        dimId = fact.employeeId || 'unassigned';
        dimName = fact.metadata.employeeName || (dimId === 'unassigned' ? 'Non Assigné' : `Collaborateur ${dimId.substring(0, 5)}`);
      } else if (dimension === 'category') {
        dimId = fact.category || 'unassigned';
        dimName = fact.subcategory || fact.category || 'Non Classé';
      } else if (dimension === 'product') {
        dimId = fact.product || 'unassigned';
        dimName = fact.product || 'Aucun Produit';
      } else if (dimension === 'service') {
        dimId = fact.service || 'unassigned';
        dimName = fact.service || 'Aucun Service';
      }

      if (!groups[dimId]) {
        groups[dimId] = { id: dimId, name: dimName, value: 0 };
      }

      // Calculate contribution of this fact to this group
      // By running formula on single fact, or simple aggregation
      if (kpiId === 'revenue' && (fact.category === 'INCOME' || fact.metadata.type === 'INCOME')) {
        groups[dimId].value += fact.amount;
      } else if (kpiId === 'expenses' && (fact.category === 'EXPENSE' || fact.metadata.type === 'EXPENSE')) {
        groups[dimId].value += fact.amount;
      } else if (kpiId === 'payrollCost' && (fact.type === 'payroll' || fact.category === 'PAYROLL')) {
        groups[dimId].value += fact.amount;
      } else if (kpiId === 'profit' || kpiId === 'netProfit') {
        if (fact.category === 'INCOME' || fact.metadata.type === 'INCOME') {
          groups[dimId].value += fact.amount;
        } else if (fact.category === 'EXPENSE' || fact.metadata.type === 'EXPENSE' || fact.type === 'payroll' || fact.category === 'PAYROLL') {
          groups[dimId].value -= fact.amount;
        }
      } else {
        // Fallback: run formula on single fact
        groups[dimId].value += kpi.formula([fact]);
      }
    });

    // Format breakdown
    const breakdown = Object.values(groups)
      .map(g => ({
        id: g.id,
        name: g.name,
        value: g.value,
        percentage: totalValue > 0 ? Math.round((g.value / totalValue) * 100) : 0
      }))
      .sort((a, b) => b.value - a.value);

    // Generate dynamic semantic description
    let justification = '';
    const topContributor = breakdown[0];

    if (totalValue === 0) {
      justification = `Aucune donnée disponible pour calculer ${kpi.name} pour la période et les dimensions sélectionnées.`;
    } else {
      const formatVal = (v: number) => v.toLocaleString('fr-FR') + ' HTG';
      justification = `Le KPI [${kpi.name}] affiche un total consolidé de ${formatVal(totalValue)}. `;
      
      if (topContributor && topContributor.value > 0) {
        justification += `L'analyse du drill-down par [${dimension}] révèle que le principal contributeur est "${topContributor.name}" avec un montant de ${formatVal(topContributor.value)}, représentant ainsi ${topContributor.percentage}% du total global.`;
      } else {
        justification += `Les contributions sont réparties de manière uniforme à travers les différentes dimensions sélectionnées.`;
      }
    }

    return {
      kpiId,
      dimension,
      totalValue,
      breakdown,
      justification
    };
  }
}
