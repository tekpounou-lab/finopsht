const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

admin.initializeApp({
  projectId: "finopsht"
});
const db = getFirestore(admin.app(), "ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a");

async function run() {
  const collections = ['businesses', 'employees', 'ledger_transactions', 'attendance_records', 'payroll_records', 'employee_contracts'];
  
  for (const coll of collections) {
    const snap = await db.collection(coll).get();
    console.log(`Collection '${coll}': ${snap.size} documents`);
    if (snap.size > 0) {
      const doc = snap.docs[0].data();
      console.log(`  Sample keys:`, Object.keys(doc));
      if (coll === 'businesses') {
        snap.docs.forEach(d => console.log(`  - Business ID: ${d.id}, Name: ${d.data().name}`));
      }
      if (coll === 'ledger_transactions') {
        const dates = snap.docs.map(d => d.data().date || d.data().transactionDate || d.data().timestamp).filter(Boolean);
        console.log(`  - Dates range: ${dates.length} dates, min: ${dates.sort()[0]}, max: ${dates.sort()[dates.length-1]}`);
      }
      if (coll === 'attendance_records') {
        const dates = snap.docs.map(d => d.data().date || d.data().dateStr || d.data().work_date).filter(Boolean);
        console.log(`  - Dates range: ${dates.length} dates, min: ${dates.sort()[0]}, max: ${dates.sort()[dates.length-1]}`);
      }
      if (coll === 'payroll_records') {
        const statuses = [...new Set(snap.docs.map(d => d.data().status))];
        console.log(`  - Statuses:`, statuses);
        const dates = snap.docs.map(d => d.data().period_start || d.data().paymentDate).filter(Boolean);
        console.log(`  - Dates range: ${dates.length} dates, min: ${dates.sort()[0]}, max: ${dates.sort()[dates.length-1]}`);
      }
    }
  }
}
run().catch(console.error);
