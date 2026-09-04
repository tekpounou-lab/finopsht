import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment, writeBatch } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { EmployeeDepartmentLink } from "../../types/organization";

export interface PendingLinkItem {
  employeeId: string;
  departmentId: string;
  transactionDate: string;
  saleAmount: number;
}

export const EmployeeDepartmentLinkingService = {
  async linkEmployeeToDepartment(
    businessId: string, 
    employeeId: string, 
    departmentId: string, 
    relationType: "PRIMARY" | "SECONDARY" | "SALES" | "SUPERVISION", 
    transactionDate: string, 
    saleAmount: number
  ) {
    if (!businessId || !employeeId || !departmentId) return;

    // Use a unique ID for the link
    const linkId = `${businessId}_${employeeId}_${departmentId}`;
    const linkRef = doc(db, "employee_departments", linkId);
    
    const docSnap = await getDoc(linkRef);

    if (docSnap.exists()) {
      const existing = docSnap.data() as EmployeeDepartmentLink;
      
      const isFirstOlder = new Date(transactionDate) < new Date(existing.first_transaction || transactionDate);
      const isLastNewer = new Date(transactionDate) > new Date(existing.last_transaction || transactionDate);

      // Update existing
      await updateDoc(linkRef, {
        sales_count: increment(1),
        sales_amount: increment(saleAmount),
        last_transaction: isLastNewer ? transactionDate : (existing.last_transaction || transactionDate),
        first_transaction: isFirstOlder ? transactionDate : (existing.first_transaction || transactionDate),
        updated_at: serverTimestamp()
      });
    } else {
      // Create new link
      const newLink: EmployeeDepartmentLink = {
        business_id: businessId,
        employee_id: employeeId,
        department_id: departmentId,
        relation_type: relationType as any,
        first_transaction: transactionDate,
        last_transaction: transactionDate,
        sales_count: 1,
        sales_amount: saleAmount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await setDoc(linkRef, newLink);
    }
  },

  /**
   * Enterprise In-Memory Aggregation and Batched Firestore Writes (Max 400 ops/batch)
   * Consolidates N transaction events into unique (employee, department) links.
   */
  async batchLinkEmployeesToDepartments(
    businessId: string,
    items: PendingLinkItem[]
  ): Promise<void> {
    if (!businessId || items.length === 0) return;

    // 1. In-memory consolidation
    const aggregatedMap = new Map<string, {
      employeeId: string;
      departmentId: string;
      totalSalesCount: number;
      totalSalesAmount: number;
      minDate: string;
      maxDate: string;
    }>();

    for (const item of items) {
      if (!item.employeeId || !item.departmentId) continue;
      const key = `${item.employeeId}_${item.departmentId}`;
      const existing = aggregatedMap.get(key);

      if (existing) {
        existing.totalSalesCount += 1;
        existing.totalSalesAmount += item.saleAmount;
        if (item.transactionDate < existing.minDate) existing.minDate = item.transactionDate;
        if (item.transactionDate > existing.maxDate) existing.maxDate = item.transactionDate;
      } else {
        aggregatedMap.set(key, {
          employeeId: item.employeeId,
          departmentId: item.departmentId,
          totalSalesCount: 1,
          totalSalesAmount: item.saleAmount,
          minDate: item.transactionDate,
          maxDate: item.transactionDate
        });
      }
    }

    const uniqueLinks = Array.from(aggregatedMap.values());
    if (uniqueLinks.length === 0) return;

    // 2. Sequenced Batched Writes (Max 400 per batch)
    const BATCH_SIZE = 400;
    for (let i = 0; i < uniqueLinks.length; i += BATCH_SIZE) {
      const chunk = uniqueLinks.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const link of chunk) {
        const linkId = `${businessId}_${link.employeeId}_${link.departmentId}`;
        const linkRef = doc(db, "employee_departments", linkId);

        batch.set(
          linkRef,
          {
            business_id: businessId,
            employee_id: link.employeeId,
            department_id: link.departmentId,
            relation_type: "SALES",
            sales_count: increment(link.totalSalesCount),
            sales_amount: increment(link.totalSalesAmount),
            last_transaction: link.maxDate,
            first_transaction: link.minDate,
            updated_at: serverTimestamp()
          },
          { merge: true }
        );
      }

      await batch.commit();
    }
  }
};
