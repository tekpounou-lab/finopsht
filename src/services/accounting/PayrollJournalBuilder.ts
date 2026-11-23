import { LedgerTransaction, PayrollCycle, PayrollRecord } from "../../types";
import { JournalEntry } from "../../types/accounting";

export interface CreatePayrollJournalOptions {
  settlementAccount?: string;
  isAccrualOnly?: boolean;
}

export const createPayrollJournalEntry = (
  cycle: PayrollCycle,
  records: PayrollRecord[],
  businessId: string,
  actor?: { uid?: string; id?: string; email?: string; name?: string },
  options?: CreatePayrollJournalOptions
): { transactions: LedgerTransaction[]; journalEntry: JournalEntry } => {
  const now = new Date().toISOString();
  const txDate = cycle.effectiveAccountingDate || cycle.endDate || now.split("T")[0];
  const cycleLabel = cycle.cycleName || cycle.label || cycle.id;
  const cycleCurrency: "HTG" | "USD" = (cycle.currency as any) === "USD" ? "USD" : "HTG";
  const txIdBase = `tx_pay_${cycle.id}`;

  const netCreditAccount = options?.isAccrualOnly
    ? (options.settlementAccount || "2100_PAYROLL_CLEARING")
    : (options?.settlementAccount || "1010_BANK");
  const netDescription = options?.isAccrualOnly
    ? `Paie ${cycleLabel} - Salaires Nets Dûs aux Collaborateurs (Dette Salariale Constatée)`
    : `Paie ${cycleLabel} - Virement Salaires Nets (Banque)`;
  const netComponent = options?.isAccrualOnly ? "ACCRUED_NET_SALARIES" : "NET_PAYOUT";

  let totalGrossCents = 0;
  let totalOnaCents = 0;
  let totalOfatmaCents = 0;
  let totalAdvancesCents = 0;
  let totalNetCents = 0;
  let totalOnaEmployerCents = 0;
  let totalOfatmaEmployerCents = 0;
  let totalEmployerContribCents = 0;

  records.forEach((r) => {
    const grossC = r.gross_salary_cents ?? Math.round((r.grossSalary || 0) * 100);
    const onaC = r.cnss_employee_cents ?? Math.round((r.cnssDeduction || 0) * 100);
    const ofatmaC = r.cns_employee_cents ?? Math.round((r.cnsDeduction || 0) * 100);
    const advC = r.debts_deduction_cents ?? Math.round((r.advancesTreated || 0) * 100);
    const netC = r.net_salary_cents ?? Math.round((r.netPaid || 0) * 100);

    const onaEmprC = r.cnss_employer_cents ?? Math.round(((r as any).onaEmployer || 0) * 100);
    const ofatmaEmprC = (r as any).cns_employer_cents ?? Math.round(((r as any).ofatmaEmployer || 0) * 100);
    const empContribC = (r as any).employer_contributions_cents !== undefined && (r as any).employer_contributions_cents !== null
      ? (r as any).employer_contributions_cents
      : (onaEmprC + ofatmaEmprC);

    totalGrossCents += grossC;
    totalOnaCents += onaC;
    totalOfatmaCents += ofatmaC;
    totalAdvancesCents += advC;
    totalNetCents += netC;

    totalOnaEmployerCents += onaEmprC;
    totalOfatmaEmployerCents += ofatmaEmprC;
    totalEmployerContribCents += empContribC;
  });

  const transactions: LedgerTransaction[] = [];
  const actorId = actor?.uid || actor?.id || "SYSTEM";

  if (totalNetCents > 0) {
    const netHtg = totalNetCents / 100;
    transactions.push({
      id: `${txIdBase}_net`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: netHtg,
      amount_cents: totalNetCents,
      date: txDate,
      description: netDescription,
      category: "PAYROLL",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5100_PAYROLL_EXPENSE",
      credit_account: netCreditAccount,
      debit: netHtg,
      credit: netHtg,
      debit_cents: totalNetCents,
      credit_cents: totalNetCents,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: netComponent,
        accountDebit: "5100 - Payroll Expense",
        accountCredit: netCreditAccount
      },
      created_at: now,
      updated_at: now
    });
  }

  if (totalOnaCents > 0) {
    const onaHtg = totalOnaCents / 100;
    transactions.push({
      id: `${txIdBase}_ona`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: onaHtg,
      amount_cents: totalOnaCents,
      date: txDate,
      description: `Paie ${cycleLabel} - Retenues Sociales ONA Salariés à Décaisser`,
      category: "TAX",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5100_PAYROLL_EXPENSE",
      credit_account: "2100_ONA_TAXES_PAYABLE",
      debit: onaHtg,
      credit: onaHtg,
      debit_cents: totalOnaCents,
      credit_cents: totalOnaCents,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: "ONA_TAX",
        accountDebit: "5100 - Payroll Expense",
        accountCredit: "2100 - ONA Payable"
      },
      created_at: now,
      updated_at: now
    });
  }

  if (totalOfatmaCents > 0) {
    const ofatmaHtg = totalOfatmaCents / 100;
    transactions.push({
      id: `${txIdBase}_ofatma`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: ofatmaHtg,
      amount_cents: totalOfatmaCents,
      date: txDate,
      description: `Paie ${cycleLabel} - Retenues Risques OFATMA Salariés à Décaisser`,
      category: "TAX",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5100_PAYROLL_EXPENSE",
      credit_account: "2110_OFATMA_TAXES_PAYABLE",
      debit: ofatmaHtg,
      credit: ofatmaHtg,
      debit_cents: totalOfatmaCents,
      credit_cents: totalOfatmaCents,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: "OFATMA_TAX",
        accountDebit: "5100 - Payroll Expense",
        accountCredit: "2110 - OFATMA Payable"
      },
      created_at: now,
      updated_at: now
    });
  }

  if (totalAdvancesCents > 0) {
    const advHtg = totalAdvancesCents / 100;
    transactions.push({
      id: `${txIdBase}_adv`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: advHtg,
      amount_cents: totalAdvancesCents,
      date: txDate,
      description: `Paie ${cycleLabel} - Recouvrement Avances sur Salaires`,
      category: "ADVANCE",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5100_PAYROLL_EXPENSE",
      credit_account: "1300_EMPLOYEE_ADVANCES",
      debit: advHtg,
      credit: advHtg,
      debit_cents: totalAdvancesCents,
      credit_cents: totalAdvancesCents,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: "ADVANCE_RECOVERY",
        accountDebit: "5100 - Payroll Expense",
        accountCredit: "1300 - Employee Advances"
      },
      created_at: now,
      updated_at: now
    });
  }

  if (totalOnaEmployerCents > 0) {
    const onaEmprHtg = totalOnaEmployerCents / 100;
    transactions.push({
      id: `${txIdBase}_ona_employer`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: onaEmprHtg,
      amount_cents: totalOnaEmployerCents,
      date: txDate,
      description: `Paie ${cycleLabel} - Charges Sociales Patronales ONA à Décaisser`,
      category: "TAX",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5110_EMPLOYER_TAX_EXPENSE",
      credit_account: "2100_ONA_TAXES_PAYABLE",
      debit: onaEmprHtg,
      credit: onaEmprHtg,
      debit_cents: totalOnaEmployerCents,
      credit_cents: totalOnaEmployerCents,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: "EMPLOYER_ONA_TAX",
        accountDebit: "5110 - Employer Tax Expense",
        accountCredit: "2100 - ONA Payable"
      },
      created_at: now,
      updated_at: now
    });
  }

  if (totalOfatmaEmployerCents > 0) {
    const ofatmaEmprHtg = totalOfatmaEmployerCents / 100;
    transactions.push({
      id: `${txIdBase}_ofatma_employer`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: ofatmaEmprHtg,
      amount_cents: totalOfatmaEmployerCents,
      date: txDate,
      description: `Paie ${cycleLabel} - Charges Risques Patronales OFATMA à Décaisser`,
      category: "TAX",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5110_EMPLOYER_TAX_EXPENSE",
      credit_account: "2110_OFATMA_TAXES_PAYABLE",
      debit: ofatmaEmprHtg,
      credit: ofatmaEmprHtg,
      debit_cents: totalOfatmaEmployerCents,
      credit_cents: totalOfatmaEmployerCents,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: "EMPLOYER_OFATMA_TAX",
        accountDebit: "5110 - Employer Tax Expense",
        accountCredit: "2110 - OFATMA Payable"
      },
      created_at: now,
      updated_at: now
    });
  }

  const rawDebits = totalGrossCents + totalEmployerContribCents;
  const rawCredits = totalNetCents + totalOnaCents + totalOfatmaCents + totalAdvancesCents + totalOnaEmployerCents + totalOfatmaEmployerCents;
  const floorSubsidyCents = Math.max(0, rawCredits - rawDebits);

  if (floorSubsidyCents > 0) {
    const subsidyHtg = floorSubsidyCents / 100;
    transactions.push({
      id: `${txIdBase}_floor_subsidy`,
      business_id: businessId,
      businessId: businessId,
      branchId: "MAIN",
      branch_id: "MAIN",
      departmentId: "operations",
      department_id: "operations",
      cost_center_id: "MAIN",
      costCenterId: "MAIN",
      type: "PAYROLL",
      amount: subsidyHtg,
      amount_cents: floorSubsidyCents,
      date: txDate,
      description: `Paie ${cycleLabel} - Complément Plancher de Survie Employeur`,
      category: "PAYROLL",
      signerId: actorId,
      currency: cycleCurrency,
      source: "PAYROLL_ENGINE",
      status: "POSTED",
      isImmutable: true,
      debit_account: "5100_PAYROLL_EXPENSE",
      credit_account: netCreditAccount,
      debit: subsidyHtg,
      credit: 0,
      debit_cents: floorSubsidyCents,
      credit_cents: 0,
      metadata: {
        cycleId: cycle.id,
        cycleName: cycleLabel,
        recordsCount: records.length,
        component: "SURVIVAL_FLOOR_SUBSIDY",
        accountDebit: "5100 - Payroll Expense",
        accountCredit: netCreditAccount
      },
      created_at: now,
      updated_at: now
    });
  }

  const totalDebitSumCents = rawDebits + floorSubsidyCents;
  const totalCreditSumCents = rawCredits;

  const journalLines: any[] = [
    {
      accountId: "5100_PAYROLL_EXPENSE",
      accountCode: "5100",
      accountName: "5100 - Payroll Expense",
      debitCents: totalGrossCents + floorSubsidyCents,
      creditCents: 0,
      description: `Masse Salariale Brute - ${cycleLabel}`
    },
    ...(totalEmployerContribCents > 0
      ? [
          {
            accountId: "5110_EMPLOYER_TAX_EXPENSE",
            accountCode: "5110",
            accountName: "5110 - Employer Tax Expense",
            debitCents: totalEmployerContribCents,
            creditCents: 0,
            description: `Charges Sociales Patronales - ${cycleLabel}`
          }
        ]
      : []),
    ...((totalOnaCents + totalOnaEmployerCents) > 0
      ? [
          {
            accountId: "2100_ONA_TAXES_PAYABLE",
            accountCode: "2100",
            accountName: "2100 - ONA Payable",
            debitCents: 0,
            creditCents: totalOnaCents + totalOnaEmployerCents,
            description: `Cotisations ONA (Salariés + Patronales) - ${cycleLabel}`
          }
        ]
      : []),
    ...((totalOfatmaCents + totalOfatmaEmployerCents) > 0
      ? [
          {
            accountId: "2110_OFATMA_TAXES_PAYABLE",
            accountCode: "2110",
            accountName: "2110 - OFATMA Payable",
            debitCents: 0,
            creditCents: totalOfatmaCents + totalOfatmaEmployerCents,
            description: `Cotisations OFATMA (Salariés + Patronales) - ${cycleLabel}`
          }
        ]
      : []),
    ...(totalAdvancesCents > 0
      ? [
          {
            accountId: "1300_EMPLOYEE_ADVANCES",
            accountCode: "1300",
            accountName: "1300 - Employee Advances",
            debitCents: 0,
            creditCents: totalAdvancesCents,
            description: `Recouvrement Avances sur Salaires - ${cycleLabel}`
          }
        ]
      : []),
    ...(totalNetCents > 0
      ? [
          {
            accountId: netCreditAccount,
            accountCode: netCreditAccount.split("_")[0],
            accountName: netCreditAccount === "2100_PAYROLL_CLEARING" ? "2100 - Payroll Clearing / Net Salaries Payable" : "1010 - Bank",
            debitCents: 0,
            creditCents: totalNetCents,
            description: netDescription
          }
        ]
      : [])
  ];

  const journalEntry: JournalEntry = {
    id: `je_pay_${cycle.id}`,
    businessId,
    date: txDate,
    reference: cycleLabel,
    source: "PAYROLL",
    sourceId: cycle.id,
    description: `Écriture Comptable de Clôture Paie (SEALED) - ${cycleLabel}`,
    currency: cycleCurrency,
    lines: journalLines,
    totalDebitCents: totalDebitSumCents,
    totalCreditCents: totalCreditSumCents,
    isBalanced: totalDebitSumCents === totalCreditSumCents,
    isLocked: true,
    createdBy: actorId,
    createdAt: now
  };

  return { transactions, journalEntry };
};
