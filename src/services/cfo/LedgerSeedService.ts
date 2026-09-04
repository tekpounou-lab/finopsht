import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { LedgerTransaction } from "../../types";

export interface SeedResult {
  success: number;
  failed: number;
  demoTransactions: LedgerTransaction[];
  error?: string;
}

export class LedgerSeedService {
  /**
   * Generates a set of realistic initial demo transactions for a business
   * and commits them atomically to Firestore via writeBatch.
   */
  static async seedDemoTransactions(
    businessIdInput?: string,
    branchId?: string,
    departmentId?: string,
    employeeId?: string
  ): Promise<SeedResult> {
    const businessId = businessIdInput || "biz_x4icfpmei";
    console.log(`Seeding started for business ${businessId}`);

    const today = new Date().toISOString().split("T")[0];
    const pastDate1 = new Date(Date.now() - 3 * 86400000).toISOString().split("T")[0];
    const pastDate2 = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const pastDate3 = new Date(Date.now() - 14 * 86400000).toISOString().split("T")[0];
    const pastDate4 = new Date(Date.now() - 25 * 86400000).toISOString().split("T")[0];

    const targetBranch = branchId || "br_demo_main";
    const targetDept = departmentId || "dept_demo_finance";
    const targetEmp = employeeId || "emp_demo_owner";

    const demoTransactions: LedgerTransaction[] = [
      {
        id: `tx_seed_${Math.random().toString(36).substring(2, 9)}`,
        business_id: businessId,
        branchId: targetBranch,
        departmentId: targetDept,
        employeeId: targetEmp,
        type: "INCOME",
        amount: 1250000,
        amount_cents: 125000000,
        description: "Paiement Contrat Client - Prestation de Services IT & Dev",
        date: today,
        category: "Prestation Service",
        debit_account: "1010-CASH-HTG",
        credit_account: "7010-PRESTATIONS-SERVICE",
        status: "POSTED",
        isImmutable: true,
        currency: "HTG",
        source: "SYSTEM",
        signerId: "sys_seed_signer"
      },
      {
        id: `tx_seed_${Math.random().toString(36).substring(2, 9)}`,
        business_id: businessId,
        branchId: targetBranch,
        departmentId: targetDept,
        employeeId: targetEmp,
        type: "EXPENSE",
        amount: 350000,
        amount_cents: 35000000,
        description: "Achat Equipements Informatiques & Routeurs Réseau",
        date: pastDate1,
        category: "Achat Equipement",
        debit_account: "2150-EQUIPEMENTS-INFORMATIQUES",
        credit_account: "1010-CASH-HTG",
        status: "POSTED",
        isImmutable: true,
        currency: "HTG",
        source: "SYSTEM",
        signerId: "sys_seed_signer"
      },
      {
        id: `tx_seed_${Math.random().toString(36).substring(2, 9)}`,
        business_id: businessId,
        branchId: targetBranch,
        departmentId: targetDept,
        employeeId: targetEmp,
        type: "PAYROLL",
        amount: 780000,
        amount_cents: 78000000,
        description: "Traitement Régulier de la Paie Personnel - Quinzaine",
        date: pastDate2,
        category: "Salaires & Charges",
        debit_account: "6410-SALAIRES-BRUTS",
        credit_account: "1020-BANQUE-SOGEBANK",
        status: "POSTED",
        isImmutable: true,
        currency: "HTG",
        source: "PAYROLL_ENGINE",
        signerId: "sys_seed_signer"
      },
      {
        id: `tx_seed_${Math.random().toString(36).substring(2, 9)}`,
        business_id: businessId,
        branchId: targetBranch,
        departmentId: targetDept,
        employeeId: targetEmp,
        type: "INCOME",
        amount: 890000,
        amount_cents: 89000000,
        description: "Vente Licences ERP SaaS & Configuration Logiciel",
        date: pastDate3,
        category: "Vente SaaS",
        debit_account: "1020-BANQUE-SOGEBANK",
        credit_account: "7020-LICENCES-SAAS",
        status: "POSTED",
        isImmutable: true,
        currency: "HTG",
        source: "SYSTEM",
        signerId: "sys_seed_signer"
      },
      {
        id: `tx_seed_${Math.random().toString(36).substring(2, 9)}`,
        business_id: businessId,
        branchId: targetBranch,
        departmentId: targetDept,
        employeeId: targetEmp,
        type: "EXPENSE",
        amount: 120000,
        amount_cents: 12000000,
        description: "Facture Carburant Générateur & Service Maintenance Siège",
        date: pastDate4,
        category: "Frais Généraux",
        debit_account: "6060-ENERGIE-CARBURANT",
        credit_account: "1010-CASH-HTG",
        status: "POSTED",
        isImmutable: true,
        currency: "HTG",
        source: "MANUAL",
        signerId: "sys_seed_signer"
      }
    ];

    console.log(`Creating batch with ${demoTransactions.length} transactions`);

    try {
      const batch = writeBatch(db);
      demoTransactions.forEach((tx) => {
        // Path 1: root collection ledger_transactions
        const docRef1 = doc(db, "ledger_transactions", tx.id);
        const data = {
          ...tx,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        batch.set(docRef1, data);

        // Path 2: subcollection businesses/{businessId}/ledger_transactions
        const docRef2 = doc(db, "businesses", businessId, "ledger_transactions", tx.id);
        batch.set(docRef2, data);

        console.log(`[LedgerSeedService] Added transaction ${tx.id} ("${tx.description}") to writeBatch.`);
      });

      console.log(`Executing batch.commit()...`);
      await batch.commit();
      console.log("Batch commit successful");

      return {
        success: demoTransactions.length,
        failed: 0,
        demoTransactions
      };
    } catch (err: any) {
      console.error("Batch commit failed with error", err);
      return {
        success: 0,
        failed: demoTransactions.length,
        demoTransactions: [],
        error: err?.message || String(err)
      };
    }
  }
}
