/**
 * FINOPS ERP — Financial Reconciliation Engine
 * Phase 5 SSOT Dual-Basis Reconciliation Engine
 *
 * Consumes canonical CashBasisViewModel and Accrual metrics to produce
 * a deterministic, audit-ready FinancialReconciliation model.
 */

import type { CashBasisViewModel } from '../viewmodel/cashViewModel.types';
import type {
  FinancialReconciliation,
  FinancialBasisMetrics,
  FinancialVariance,
  ReconciliationItem,
  ReconciliationExplanation,
  ReconciliationCategory,
  ReconciliationQuality,
} from './financialReconciliation.types';

export interface AccrualBasisInput {
  revenue: number;
  personnelCost: number;
  operatingExpenses: number;
  netResult: number;
  uncollectedInvoices?: { id: string; invoiceNumber: string; clientName: string; amount: number; economicDate: string }[];
  unpaidPayrolls?: { id: string; employeeName: string; grossSalary: number; netSalary: number; economicDate: string }[];
  unpaidExpenses?: { id: string; label: string; amount: number; economicDate: string }[];
}

export class FinancialReconciliationEngine {
  /**
   * Reconciles Cash Basis (Mode Simple) and Accrual Basis (Mode Expert) metrics.
   * Variance = Accrual - Cash
   */
  public static reconcile(
    cashVm: CashBasisViewModel,
    accrualInput: AccrualBasisInput
  ): FinancialReconciliation {
    const { businessId, period, currency, executive, payroll } = cashVm;

    const cashMetrics: FinancialBasisMetrics = {
      revenue: executive.totalCashIn,
      personnelCost: payroll.totalPersonnelCashOut,
      operatingExpenses: Math.max(0, executive.totalCashOut - payroll.totalPersonnelCashOut),
      netResult: executive.netCashFlow,
    };

    const accrualMetrics: FinancialBasisMetrics = {
      revenue: accrualInput.revenue,
      personnelCost: accrualInput.personnelCost,
      operatingExpenses: accrualInput.operatingExpenses,
      netResult: accrualInput.netResult,
    };

    const variance: FinancialVariance = {
      revenue: accrualMetrics.revenue - cashMetrics.revenue,
      personnelCost: accrualMetrics.personnelCost - cashMetrics.personnelCost,
      operatingExpenses: accrualMetrics.operatingExpenses - cashMetrics.operatingExpenses,
      netResult: accrualMetrics.netResult - cashMetrics.netResult,
    };

    const items: ReconciliationItem[] = [];
    const explanationsMap = new Map<ReconciliationCategory, { items: ReconciliationItem[]; totalImpact: number }>();

    const addExplanationItem = (category: ReconciliationCategory, item: ReconciliationItem) => {
      items.push(item);
      const curr = explanationsMap.get(category) || { items: [], totalImpact: 0 };
      curr.items.push(item);
      curr.totalImpact += item.variance;
      explanationsMap.set(category, curr);
    };

    // 1. Process Uncollected Invoices
    if (accrualInput.uncollectedInvoices && accrualInput.uncollectedInvoices.length > 0) {
      for (const inv of accrualInput.uncollectedInvoices) {
        addExplanationItem('UNPAID_REVENUE', {
          id: `rec_inv_${inv.id}`,
          category: 'UNPAID_REVENUE',
          sourceModule: 'INVOICE',
          sourceId: inv.id,
          label: `Facture non encaissée: ${inv.invoiceNumber} (${inv.clientName})`,
          cashAmount: 0,
          accrualAmount: inv.amount,
          variance: inv.amount,
          currency,
          economicDate: inv.economicDate,
          status: 'PENDING_SETTLEMENT',
        });
      }
    } else if (variance.revenue > 0) {
      addExplanationItem('UNPAID_REVENUE', {
        id: 'rec_inv_summary',
        category: 'UNPAID_REVENUE',
        sourceModule: 'INVOICE',
        sourceId: 'summary_inv',
        label: 'Créances clients / Factures émises non encore encaissées',
        cashAmount: 0,
        accrualAmount: variance.revenue,
        variance: variance.revenue,
        currency,
        status: 'PENDING_SETTLEMENT',
      });
    }

    // 2. Process Unpaid Payrolls
    if (accrualInput.unpaidPayrolls && accrualInput.unpaidPayrolls.length > 0) {
      for (const p of accrualInput.unpaidPayrolls) {
        addExplanationItem('UNPAID_PAYROLL', {
          id: `rec_pay_${p.id}`,
          category: 'UNPAID_PAYROLL',
          sourceModule: 'PAYROLL',
          sourceId: p.id,
          label: `Masse salariale engagée non encore réglée: ${p.employeeName}`,
          cashAmount: 0,
          accrualAmount: p.netSalary,
          variance: p.netSalary,
          currency,
          economicDate: p.economicDate,
          status: 'PENDING_SETTLEMENT',
        });
      }
    } else if (variance.personnelCost > 0) {
      addExplanationItem('UNPAID_PAYROLL', {
        id: 'rec_pay_summary',
        category: 'UNPAID_PAYROLL',
        sourceModule: 'PAYROLL',
        sourceId: 'summary_pay',
        label: 'Masse salariale et charges RH engagées non encore décaissées',
        cashAmount: 0,
        accrualAmount: variance.personnelCost,
        variance: variance.personnelCost,
        currency,
        status: 'PENDING_SETTLEMENT',
      });
    }

    // 3. Process Unpaid Operating Expenses
    if (accrualInput.unpaidExpenses && accrualInput.unpaidExpenses.length > 0) {
      for (const exp of accrualInput.unpaidExpenses) {
        addExplanationItem('UNPAID_EXPENSE', {
          id: `rec_exp_${exp.id}`,
          category: 'UNPAID_EXPENSE',
          sourceModule: 'LEDGER',
          sourceId: exp.id,
          label: `Dépense engagée non décaissée: ${exp.label}`,
          cashAmount: 0,
          accrualAmount: exp.amount,
          variance: exp.amount,
          currency,
          economicDate: exp.economicDate,
          status: 'PENDING_SETTLEMENT',
        });
      }
    } else if (variance.operatingExpenses > 0) {
      addExplanationItem('UNPAID_EXPENSE', {
        id: 'rec_exp_summary',
        category: 'UNPAID_EXPENSE',
        sourceModule: 'LEDGER',
        sourceId: 'summary_exp',
        label: 'Dépenses d\'exploitation reconnues non encore payées',
        cashAmount: 0,
        accrualAmount: variance.operatingExpenses,
        variance: variance.operatingExpenses,
        currency,
        status: 'PENDING_SETTLEMENT',
      });
    }

    // Build Explanations List
    const explanations: ReconciliationExplanation[] = [];
    for (const [cat, data] of explanationsMap.entries()) {
      let title = '';
      let description = '';

      switch (cat) {
        case 'UNPAID_REVENUE':
          title = 'Factures & Créances non encaissées';
          description = `Un écart de +${data.totalImpact.toLocaleString()} ${currency} correspond à des produits reconnus comptablement mais dont le règlement n'a pas encore été perçu en trésorerie.`;
          break;
        case 'UNPAID_PAYROLL':
          title = 'Salaires & Coûts RH non encore décaissés';
          description = `Un écart de +${data.totalImpact.toLocaleString()} ${currency} correspond à des charges de paie engagées sur la période sans décaissement effectif.`;
          break;
        case 'UNPAID_EXPENSE':
          title = 'Dépenses d\'exploitation engagées non décaissées';
          description = `Un écart de +${data.totalImpact.toLocaleString()} ${currency} représente des factures fournisseurs ou charges constatées en attente de décaissement.`;
          break;
        default:
          title = 'Décalage temporel ou ajustement de période';
          description = `Un écart de ${data.totalImpact.toLocaleString()} ${currency} est constaté en raison du décalage entre la date économique et la date de règlement.`;
          break;
      }

      explanations.push({
        category: cat,
        title,
        description,
        impactAmount: data.totalImpact,
        direction: data.totalImpact > 0 ? 'ACCRUAL_HIGHER' : data.totalImpact < 0 ? 'CASH_HIGHER' : 'BALANCED',
        itemCount: data.items.length,
      });
    }

    const quality: ReconciliationQuality = items.length > 0 ? 'COMPLETE' : 'PARTIAL';

    return {
      businessId,
      period,
      currency,
      cash: cashMetrics,
      accrual: accrualMetrics,
      variance,
      items,
      explanations,
      quality,
      generatedAt: new Date().toISOString(),
    };
  }
}
