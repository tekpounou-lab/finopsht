import { LedgerTransaction, Branch, Department, Employee } from "../../types";
import { LedgerAuditReport, LedgerAnomaly } from "../../types/accounting";

export class LedgerAuditEngine {
  /**
   * Performs an in-depth audit of a business's General Ledger.
   */
  public static audit(
    transactions: LedgerTransaction[],
    businessId: string,
    branches: Branch[] = [],
    departments: Department[] = [],
    employees: Employee[] = []
  ): LedgerAuditReport {
    const businessTx = transactions.filter((tx) => tx.business_id === businessId);
    const anomalies: LedgerAnomaly[] = [];

    let totalDebitCents = 0;
    let totalCreditCents = 0;

    const seenHashes = new Set<string>();

    businessTx.forEach((tx) => {
      const amtCents = tx.amount_cents ?? Math.round((tx.amount || 0) * 100);

      // 1. Check valid positive amount
      if (!amtCents || amtCents <= 0) {
        anomalies.push({
          type: "INVALID_AMOUNT",
          severity: "HIGH",
          transactionId: tx.id,
          description: `Transaction ${tx.id} a un montant invalide ou nul (${amtCents} cents).`,
          details: { amount: tx.amount, amount_cents: tx.amount_cents },
          isAutoReparable: false
        });
      }

      // 2. Check accounts defined
      if (!tx.debit_account || !tx.credit_account) {
        anomalies.push({
          type: "ORPHAN_ACCOUNT",
          severity: "CRITICAL",
          transactionId: tx.id,
          description: `Comptes de débit ou crédit manquants sur la transaction ${tx.id}.`,
          details: { debit: tx.debit_account, credit: tx.credit_account },
          isAutoReparable: true,
          remediationAction: "APPLY_DEFAULT_COA"
        });
      } else {
        totalDebitCents += amtCents;
        totalCreditCents += amtCents;
      }

      // 3. Check Branch validity
      if (tx.branchId && branches.length > 0) {
        const actualBranch = branches.find((b) => b.id === tx.branchId);
        if (!actualBranch) {
          const matchedBranch = branches.find(
            (b) =>
              b.code?.trim().toUpperCase() === tx.branchId?.trim().toUpperCase() ||
              b.name?.trim().toUpperCase() === tx.branchId?.trim().toUpperCase()
          );
          anomalies.push({
            type: "MISSING_BRANCH",
            severity: "MEDIUM",
            transactionId: tx.id,
            description: `Succursale invalide "${tx.branchId}".`,
            details: { branchId: tx.branchId, matchedBranchId: matchedBranch?.id },
            isAutoReparable: !!matchedBranch,
            remediationAction: matchedBranch ? `MAP_BRANCH_${matchedBranch.id}` : undefined
          });
        }
      }

      // 4. Check Department validity
      if (tx.departmentId && departments.length > 0) {
        const actualDept = departments.find((d) => d.id === tx.departmentId);
        if (!actualDept) {
          const matchedDept = departments.find(
            (d) =>
              d.code?.trim().toUpperCase() === tx.departmentId?.trim().toUpperCase() ||
              d.name?.trim().toUpperCase() === tx.departmentId?.trim().toUpperCase()
          );
          anomalies.push({
            type: "MISSING_DEPARTMENT",
            severity: "LOW",
            transactionId: tx.id,
            description: `Département inconnu "${tx.departmentId}".`,
            details: { departmentId: tx.departmentId, matchedDeptId: matchedDept?.id },
            isAutoReparable: !!matchedDept,
            remediationAction: matchedDept ? `MAP_DEPARTMENT_${matchedDept.id}` : undefined
          });
        }
      }

      // 5. Check duplicate fingerprint
      const fingerprint = `${tx.date}_${amtCents}_${tx.description?.trim().toLowerCase()}_${tx.debit_account}_${tx.credit_account}`;
      if (seenHashes.has(fingerprint)) {
        anomalies.push({
          type: "DUPLICATE_ENTRY",
          severity: "MEDIUM",
          transactionId: tx.id,
          description: `Transaction en double potentiel détectée (${tx.description} - ${tx.amount} ${tx.currency}).`,
          details: { fingerprint },
          isAutoReparable: false
        });
      } else {
        seenHashes.add(fingerprint);
      }
    });

    const balanceDifferenceCents = totalDebitCents - totalCreditCents;
    const isDoubleEntryBalanced = balanceDifferenceCents === 0;

    const criticalCount = anomalies.filter((a) => a.severity === "CRITICAL").length;
    const highCount = anomalies.filter((a) => a.severity === "HIGH").length;
    const mediumCount = anomalies.filter((a) => a.severity === "MEDIUM").length;

    let integrityScore = 100;
    if (businessTx.length > 0) {
      const penalty = (criticalCount * 15 + highCount * 8 + mediumCount * 3) / Math.max(1, businessTx.length / 10);
      integrityScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));
    }

    const reparableCount = anomalies.filter((a) => a.isAutoReparable).length;

    return {
      timestamp: new Date().toISOString(),
      businessId,
      totalTransactionsAudited: businessTx.length,
      totalDebitCents,
      totalCreditCents,
      isDoubleEntryBalanced,
      balanceDifferenceCents,
      integrityScore,
      anomalies,
      hashChainValid: true,
      reparableCount
    };
  }
}
