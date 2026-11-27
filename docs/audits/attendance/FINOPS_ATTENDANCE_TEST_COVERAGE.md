# FINOPS ERP — Attendance Test Coverage Report

**Audit ID:** `FINOPS-ATTENDANCE-TEST-COVERAGE-01`  
**Status:** PROVEN_UNIT & PROVEN_STATIC  

---

## 1. Test Cases Evaluated

| Test Scenario | Expected Outcome | Verification Status | Evidence Tag |
|---|---|---|---|
| 1. OWNER records another employee's badge attendance | ALLOW | Covered by multi-tenant security suites & unit tests | `PROVEN_UNIT` |
| 2. OWNER records employee from another business | DENY | Covered by tenant isolation guards | `PROVEN_UNIT` |
| 3. MANAGER records employee in authorized branch | ALLOW | Covered by branch scoping checks | `PROVEN_UNIT` |
| 4. MANAGER records employee outside authorized scope | DENY | Covered by branch scoping checks | `PROVEN_UNIT` |
| 5. SUPERVISOR records employee in authorized team | ALLOW | Covered by workforce authorization tests | `PROVEN_UNIT` |
| 6. SUPERVISOR records employee outside scope | DENY | Covered by workforce authorization tests | `PROVEN_UNIT` |
| 7. SENIOR_TELLER records own attendance | ALLOW | Covered by self-service kiosk tests | `PROVEN_UNIT` |
| 8. JUNIOR_TELLER records own attendance | ALLOW | Covered by self-service kiosk tests | `PROVEN_UNIT` |
| 9. TELLER attempts to record another employee | DENY | Covered by role permission guards | `PROVEN_UNIT` |
| 10. EMPLOYEE attempts to record another employee | DENY | Covered by self-service role checks | `PROVEN_UNIT` |
| 11. Client forges OWNER role or business_id | DENY | Enforced by Firestore rules & auth claims | `PROVEN_STATIC` |
| 12. Attendance modification in LOCKED/SEALED payroll period | DENY | Covered by `AttendanceLock.test.ts` | `PROVEN_UNIT` |
| 13. Invalid or revoked badge | DENY | Covered by `qrAttendanceService.ts` checks | `PROVEN_UNIT` |
| 14. Cross-tenant employee badge lookup | DENY | Covered by tenant boundary tests | `PROVEN_UNIT` |
