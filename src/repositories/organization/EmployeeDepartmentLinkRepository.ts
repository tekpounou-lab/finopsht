import { collection, query, where, getDocs, setDoc, doc, updateDoc, increment, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { EmployeeDepartmentLink } from "../../types/organization";

export class EmployeeDepartmentLinkRepository {
  public static async linkSalesTransaction(
    businessId: string,
    employeeId: string,
    departmentId: string,
    date: string,
    amount_cents: number
  ): Promise<void> {
    const linkId = `${employeeId}_${departmentId}`;
    const docRef = doc(db, "employee_departments", linkId);
    
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const existing = snap.data() as EmployeeDepartmentLink;
      
      const isFirstOlder = new Date(date) < new Date(existing.first_transaction || date);
      const isLastNewer = new Date(date) > new Date(existing.last_transaction || date);

      await updateDoc(docRef, {
        sales_amount: increment(amount_cents),
        sales_count: increment(1),
        last_transaction: isLastNewer ? date : existing.last_transaction,
        first_transaction: isFirstOlder ? date : existing.first_transaction,
        updated_at: new Date().toISOString()
      });
    } else {
      const newLink: EmployeeDepartmentLink = {
        business_id: businessId,
        employee_id: employeeId,
        department_id: departmentId,
        relation_type: "SALES",
        first_transaction: date,
        last_transaction: date,
        sales_amount: amount_cents,
        sales_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await setDoc(docRef, newLink);
    }
  }

  public static async establishPrimaryLink(
    businessId: string,
    employeeId: string,
    departmentId: string
  ): Promise<void> {
    const linkId = `${employeeId}_${departmentId}`;
    const docRef = doc(db, "employee_departments", linkId);
    
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      const newLink: EmployeeDepartmentLink = {
        business_id: businessId,
        employee_id: employeeId,
        department_id: departmentId,
        relation_type: "PRIMARY",
        sales_amount: 0,
        sales_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await setDoc(docRef, newLink);
    } else {
      const existing = snap.data() as EmployeeDepartmentLink;
      if (existing.relation_type !== "PRIMARY") {
        await updateDoc(docRef, {
          relation_type: "PRIMARY",
          updated_at: new Date().toISOString()
        });
      }
    }
  }
}
