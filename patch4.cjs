const fs = require('fs');
let code = fs.readFileSync('src/repositories/AttendanceRepository.ts', 'utf8');

code = code.replace(
  '  async checkIn(params: {',
  `  async processSecureScan(params: {
    token: string;
    method: "QR" | "NFC" | "MANUAL";
    deviceId: string;
    location: string;
    locationGeo?: { latitude: number; longitude: number; accuracy?: number } | null;
  }): Promise<any> {
    const payload = JSON.parse(params.token);
    if (!payload.employee_id || !payload.business_id || !payload.signature) {
      throw new Error("Invalid token payload");
    }
    
    // In a real server, verify signature here.
    
    // Check if employee already has active session
    const activeSessionId = await this.getActiveSession(payload.employee_id);
    if (activeSessionId) {
      return this.checkOut({
        sessionId: activeSessionId,
        method: params.method,
        locationGeo: params.locationGeo,
        actor: { id: payload.employee_id, name: "System", role: "EMPLOYEE" }
      });
    } else {
      return this.checkIn({
        employeeId: payload.employee_id,
        businessId: payload.business_id,
        branchId: payload.branch_id,
        method: params.method,
        deviceId: params.deviceId,
        location: params.location,
        locationGeo: params.locationGeo,
        actor: { id: payload.employee_id, name: "System", role: "EMPLOYEE" }
      });
    }
  },

  async checkIn(params: {`
);

fs.writeFileSync('src/repositories/AttendanceRepository.ts', code);
