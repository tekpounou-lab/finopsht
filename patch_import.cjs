const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

if (!code.includes(', writeBatch } from')) {
  code = code.replace(
    /\} from "firebase\/firestore";/,
    ', writeBatch } from "firebase/firestore";'
  );
}

fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
