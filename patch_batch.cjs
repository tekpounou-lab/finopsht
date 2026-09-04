const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

code = code.replace(
  'async batchSaveRecords(records: AttendanceRecord[], actor: any): Promise<void> {',
  'async batchSaveRecords(businessId: string, records: AttendanceRecord[], actor: any): Promise<void> {'
);

code = code.replace(
  'method: "QR" | "NFC" | "MANUAL"',
  'method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC"'
).replace(
  'method: "QR" | "NFC" | "MANUAL"',
  'method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC"'
).replace(
  'method: "QR" | "NFC" | "MANUAL"',
  'method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC"'
);

// Also verify writeBatch is imported
if (!code.includes('writeBatch')) {
  code = code.replace(
    'runTransaction, GeoPoint } from "firebase/firestore";',
    'runTransaction, GeoPoint, writeBatch } from "firebase/firestore";'
  );
}

fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
