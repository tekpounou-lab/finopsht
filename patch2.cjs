const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

code = code.replace(
  '  async saveRecord(record: AttendanceRecord, actor?: { uid: string; name?: string; role?: string }): Promise<void> {',
  `  async updateRecord(id: string, data: Partial<AttendanceRecord>, actor: any): Promise<void> {
    const ref = doc(db, "attendance_logs", id);
    await updateDoc(ref, { ...data, updatedAt: serverTimestamp(), updatedBy: actor.id });
  },

  async batchSaveRecords(records: AttendanceRecord[], actor: any): Promise<void> {
    const batch = writeBatch(db);
    for (const rec of records) {
      const ref = doc(db, "attendance_logs", rec.id);
      batch.set(ref, { ...rec, updatedAt: serverTimestamp(), updatedBy: actor.id }, { merge: true });
    }
    await batch.commit();
  },

  async saveRecord(record: AttendanceRecord, actor?: { uid: string; name?: string; role?: string }): Promise<void> {`
);

fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
