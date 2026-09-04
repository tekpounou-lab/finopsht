const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

code = code.replace(
  /method:\s*"QR"\s*\|\s*"NFC"\s*\|\s*"MANUAL"/g,
  'method: "QR" | "NFC" | "MANUAL" | "BIOMETRIC"'
);

fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
