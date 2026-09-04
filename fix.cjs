const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');
code = code.replace(
  '   composite index (business_id + employeeId + date)\n   */\n  async listByEmployeeAndDate(',
  '  /**\n   * Queries attendance records leveraging composite index (business_id + employeeId + date)\n   */\n  async listByEmployeeAndDate('
);
fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
