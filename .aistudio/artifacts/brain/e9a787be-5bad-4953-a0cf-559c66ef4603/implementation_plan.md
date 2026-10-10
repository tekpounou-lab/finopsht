# FINOPS — Universal Date Normalization & Attendance Validation Engine

## Overview & Executive Summary

This architecture blueprint specifies the implementation for universal date normalization and attendance validation across all FINOPS ERP import pipelines. The primary objective is to guarantee that every accepted imported date is normalized to the canonical `YYYY-MM-DD` format before persistence to the Single Source of Truth (SSOT) Firestore database, while preserving all existing attendance status rules (`NORMAL`/`PRESENT`, `RETARD`, `ABSENT`, `CONGE`/`LEAVE`, `PARTIEL`, `OVERTIME`, `SICK`, `HOLIDAY`, `EXCUSED`), punch time validation, and multi-tenant security boundaries.

---

> [!IMPORTANT]
> **User Review & Critical Decision Gates**
> 1. **Ambiguity Resolution Policy**: Slash dates with ambiguous day/month order (e.g. `03/08/2026`) will check explicit import config or organization locale first. If unresolved, the parser will return `AMBIGUOUS_DATE` with error code `DATE_AMBIGUOUS` requesting user format selection, rather than silently inferring US vs. EU order.
> 2. **Explicit Status Non-Punch Discipline**: Imported records containing explicit non-punch statuses (`ABSENT`, `CONGE`, `LEAVE`, `SICK`, `HOLIDAY`, `EXCUSED`) with zero/empty check-in/out times will be accepted as valid non-punch records rather than falsely rejected with `MISSING_CHECKIN` or `MISSING_CHECKOUT` errors.
> 3. **Production Protection**: No production deployments or Cloud Function publishes will occur. All changes will be verified locally via unit, integration, and build scripts.

---

## 1. Initial Audit & Repository Dependency Map

An initial repository audit was conducted across all import paths, validators, and repository layers:

### A. Codebase Artifacts Audited
- `src/utils/dateNormalization.ts` — Central SSOT date normalization module (`toDateOnly`, `normalizeCsvDate`, `isValidIsoDateStr`, `normalizeDatesInObject`).
- `src/components/attendance/MassImportModal.tsx` — Mass import interface for workforce attendance records. Uses an isolated helper `cleanDateString` that partially parses regexes but misses dot formats, text dates, and ambiguity handling.
- `src/services/workforce/BulkEmployeeImportService.ts` — Bulk employee import orchestrator that parses hire dates and contract dates.
- `src/repositories/AttendanceRepository.ts` — Authoritative Firestore repository for `attendance_logs` collection (`saveRecord`, `batchSaveRecords`).
- `src/validations/integritySchemas.ts` — Zod runtime integrity schema validator (`IsoDateSchema`, `AttendanceRecordIntegritySchema`).
- `src/lib/attendanceSSOT.ts` — Core attendance calculations (`calculateAttendanceVariance`, `normalizeDateStr`, `findAttendanceRecordForEmployee`).
- `src/utils/caseConverter.ts` — DTO mapper (`mapAttendanceRecord`).

### B. Dependency Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Import Source Files                              │
│                      (CSV / XLSX / JSON Payload)                            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Import Pipeline Layers                             │
│  ├── MassImportModal.tsx (Attendance CSV/XLSX)                              │
│  └── BulkEmployeeImportService.ts (Employee CSV/XLSX)                       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Calls (To be Unified)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    src/utils/dateNormalization.ts                           │
│     Functions: normalizeCsvDate(), toDateOnly(), isValidIsoDateStr()        │
│     Contracts: Returns { status, dateStr, errorCode, rawInput }             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Validated Output ("YYYY-MM-DD")
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   src/validations/integritySchemas.ts                       │
│     Zod Schema: AttendanceRecordIntegritySchema (IsoDateSchema)            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Enforced Integrity
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  src/repositories/AttendanceRepository.ts                   │
│     Firestore Collection: `attendance_logs`                                 │
│     Document ID: `rec_${employeeId}_${canonicalDateStr}`                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Canonical Date Contract & Ambiguity Policy

### A. Authoritative Shared Module: `src/utils/dateNormalization.ts`

`src/utils/dateNormalization.ts` serves as the single authoritative date normalization module.

#### Standardized Result Type:
```typescript
export type DateNormalizationResult = 
  | { success: true; status: 'VALID_NORMALIZED'; dateStr: string; rawInput: unknown }
  | { success: false; status: 'MISSING_DATE'; error: string; code: 'DATE_MISSING'; rawInput: unknown }
  | { success: false; status: 'INVALID_DATE'; error: string; code: 'DATE_INVALID'; rawInput: unknown }
  | { success: false; status: 'AMBIGUOUS_DATE'; error: string; code: 'DATE_AMBIGUOUS'; rawInput: unknown }
  | { success: false; status: 'UNSUPPORTED_FORMAT'; error: string; code: 'DATE_UNSUPPORTED'; rawInput: unknown };
```

### B. Canonical Output Format
The accepted canonical output for date-only SSOT fields is strictly `YYYY-MM-DD`, validated as a real Gregorian calendar date.
- Timezone-dependent conversions (e.g. `toISOString().slice(0, 10)`) are strictly forbidden for date-only fields to prevent day-shift errors across local time zones.
- Calendar component validation ensures impossible dates (e.g. `2026-02-31`, month `13`, day `00`) are rejected.

### C. Supported Input Formats
1. **ISO 8601 Date**: `YYYY-MM-DD` (e.g. `2026-08-03`).
2. **ISO 8601 Datetime**: `YYYY-MM-DDTHH:mm:ssZ` or `YYYY-MM-DDTHH:mm:ss+HH:MM` (extracts local calendar day without UTC shifting).
3. **Year-First Forms**: `YYYY/MM/DD`, `YYYY.MM.DD`, `YYYY-M-D`.
4. **Day-First Forms**: `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY` (when `preferDayFirst: true` or unambiguous like `25/08/2026`).
5. **US Month-First Forms**: `MM/DD/YYYY`, `MM-DD-YYYY`, `MM.DD.YYYY` (when `preferDayFirst: false` or unambiguous like `08/25/2026`).
6. **Two-Digit Years**: `DD/MM/YY` or `MM/DD/YY` using a documented 80/20 pivot rule ($YY \le 30 \rightarrow 20YY$, $YY > 30 \rightarrow 19YY$).
7. **Textual Month Names**: English and French month names (e.g., `3 Aug 2026`, `August 3, 2026`, `3 août 2026`).
8. **Excel Serials**: Numeric Excel serial numbers (e.g., `45872` or `45872.5`) with support for the 1900 date system (including 1900 leap year bug offset) and 1904 date system.

### D. Ambiguity Precedence
For ambiguous numeric slash/dash/dot dates where both parts are $\le 12$ (e.g. `03/08/2026`):
1. Use explicit `dateFormat` option provided in import options (e.g., `'DD/MM/YYYY'` vs `'MM/DD/YYYY'`).
2. Use organization locale setting from `currentBusiness` or system defaults (`preferDayFirst: true` for French/Haitian ERP context).
3. If no configuration is available and `strictAmbiguityCheck: true`, return `AMBIGUOUS_DATE` with error code `DATE_AMBIGUOUS` requesting format selection.

---

## 3. Integration Across Import Pipelines

### A. Mass Attendance Import (`MassImportModal.tsx`)
- Replace the inline `cleanDateString` helper in `MassImportModal.tsx` with calls to `normalizeCsvDate` from `src/utils/dateNormalization.ts`.
- Previews will display the exact normalized `YYYY-MM-DD` date.
- Rows with date validation errors (`DATE_MISSING`, `DATE_INVALID`, `DATE_AMBIGUOUS`) will be highlighted in the preview table with clear row-level error messages and stable error codes.

### B. Bulk Employee Import (`BulkEmployeeImportService.ts`)
- Update employee hire date, birth date, and contract date parsers to call `toDateOnly` / `normalizeCsvDate`.
- Reject invalid or ambiguous employee dates during CSV/XLSX row validation.

---

## 4. Preservation of Attendance Status & Punch Validation Rules

All existing attendance status definitions, precedence rules, and calculations in `src/lib/attendanceSSOT.ts` and `src/validations/integritySchemas.ts` will be preserved:

### A. Supported Status Spectrum
- **`NORMAL` / `PRESENT`**: On-time shift completion with both check-in and check-out present.
- **`LATE` / `RETARD`**: Check-in time exceeds shift start schedule.
- **`ABSENT`**: Employee did not report for shift or record explicitly flagged as absent.
- **`ON_LEAVE` / `CONGE`**: Approved leave/vacation period.
- **`EARLY_DEPARTURE` / `PARTIEL`**: Incomplete shift or early departure.
- **`OVERTIME`**: Worked hours exceed planned hours (`variance > 0`).
- **`EXCUSED` / `SICK` / `HOLIDAY`**: Recognized non-punch status categories.

### B. Non-Punch Status Discipline
1. **Explicit Status Exemption**: An imported row with an explicit recognized non-punch status (`ABSENT`, `CONGE`, `ON_LEAVE`, `SICK`, `HOLIDAY`, `EXCUSED`) and empty check-in/check-out times is a valid non-punch record. It must **not** trigger `MISSING_CHECKIN` or `MISSING_CHECKOUT` errors.
2. **Active Work Validation**: Records representing active work without an explicit non-punch status retain strict punch time checks (e.g. both punches required for `NORMAL`/`COMPLETED`, missing check-in/out flags warning/error).
3. **Variance & Hours Calculation**: Worked hours and variance calculations strictly follow `calculateAttendanceVariance(realHours, plannedHours)` in `attendanceSSOT.ts`. Explicit non-punch records use 0 worked hours as defined by domain rules. Active work never invents 0 worked hours.
4. **Unknown Status Rejection**: Unrecognized status strings (e.g. `INVALID_STATUS_xyz`) are flagged with error code `STATUS_UNRECOGNIZED`.

---

## 5. SSOT & Repository Persistence Integrity

### A. Authoritative Write Path (`AttendanceRepository.ts`)
- `AttendanceRepository.saveRecord()` and `AttendanceRepository.batchSaveRecords()` enforce runtime validation via `AttendanceRecordIntegritySchema` in `src/validations/integritySchemas.ts` before executing Firestore writes.
- Deterministic document keys are constructed using the canonical normalized date string: `rec_${employeeId}_${canonicalDate.replace(/-/g, '')}` to guarantee idempotency and prevent duplicate records.
- Business/tenant scoping (`businessId`) and audit metadata (`createdBy`, `updatedAt`, `overrideReason`) are strictly preserved.

---

## 6. Comprehensive Regression Test Plan

A comprehensive suite of unit and integration tests will be created in `src/tests/`:

1. **Date Parsing Unit Suite** (`src/tests/unit/DateNormalization.test.ts`):
   - Valid canonical ISO dates, ISO datetimes with offsets and `Z`.
   - Slash/dot year-first (`2026/08/03`), day-first (`03/08/2026`), and US month-first (`08/03/2026`).
   - Textual month names (`3 Aug 2026`, `August 3, 2026`, `3 août 2026`).
   - Excel serial numbers (`45872`, 1900/1904 date system).
   - Leap day on leap year (`2024-02-29`) vs invalid leap day on non-leap year (`2026-02-29`).
   - Impossible calendar dates (`2026-02-31`, `2026-13-01`, day `00`).
   - Ambiguous slash dates with strict ambiguity checking.
   - Non-date numeric strings (e.g. employee IDs `100245`) that must NOT be interpreted as Excel serials.

2. **Attendance Behavior Unit Suite** (`src/tests/unit/AttendanceValidation.test.ts`):
   - Valid active-work record with both punches.
   - Missing check-in and missing check-out handling for active work.
   - Explicit `ABSENT` with no punches accepted as valid.
   - Explicit `CONGE`/`ON_LEAVE` with no punches accepted as valid.
   - Unknown status string rejection (`STATUS_UNRECOGNIZED`).
   - Worked hours and variance calculations matching `attendanceSSOT.ts`.

3. **End-to-End Import Pipeline Integration Suite** (`src/tests/integration/UniversalImportIntegrity.test.ts`):
   - End-to-end import flow from raw CSV/XLSX row to preview, validation, Zod schema check, and `AttendanceRepository` payload structure.
   - Verification that canonical dates persist identically without timezone drift.

---

## 7. Execution Commands & Verification Protocol

Once approved, implementation will be executed and verified using these workspace scripts:

```bash
# 1. Run Unit & Integration Tests
npm run test

# 2. Run TypeScript Static Analysis
npm run lint

# 3. Build Web Application & Production Server
npm run build
```

---

> **Plan Status**: Updated and presented for review (`Plan action: revise`). Zero source code files have been modified. Execution will begin upon user approval.
