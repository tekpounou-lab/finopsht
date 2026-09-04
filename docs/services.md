# FINOPS ERP — Domain & Business Services Specification

## Overview

Services in FINOPS ERP house pure business calculations, tax engines, snapshot aggregation, and complex authorization workflows. They are decoupled from React rendering logic and execute deterministically.

---

## 1. Core Service Inventory

### 1.1 `PayrollCalculationEngine` (`src/components/payroll/services/PayrollCalculationEngine.ts`)
- **Responsibility**: Calculates gross pay, tax deductions (CNSS/ONA 6%, CNS/OFATMA 2%), overtime rates (1.5x and 2.0x), survival floor adjustments, and SHA-256 seal generation.
- **Dependencies**: Tax configuration inputs, timecard summaries.

### 1.2 `PermissionService` (`src/services/PermissionService.ts`)
- **Responsibility**: Evaluates user roles (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `EMPLOYEE`) against the Enterprise Permission Matrix. Resolves granular access rights (`can(action)`).

### 1.3 `SnapshotEngine` (`src/services/business/snapshot/SnapshotEngine.ts`)
- **Responsibility**: Computes immutable ledger and workforce snapshots (`BusinessSnapshot`), calculating rolling totals, gross margins, and cryptographic checksums for high-speed reporting.

### 1.4 `AnalyticsComparisonEngine` (`src/domains/analytics/services/AnalyticsComparisonEngine.ts`)
- **Responsibility**: Compares multi-period financial and workforce analytics, calculating percentage variance and trends for executive dashboards.

### 1.5 `FinancialRatioEngine` (`src/services/cfo/FinancialRatioEngine.ts`)
- **Responsibility**: Computes standard financial liquidity ratios, solvency metrics, operational cash flow projections, and runway analysis. Serves as the deterministic offline/quota fallback engine for the AI CFO when API spending caps or 429 limits are met.

### 1.6 `qrAttendanceService` (`src/services/qrAttendanceService.ts`)
- **Responsibility**: Processes QR badge scans for both individual employee mobile check-ins and physical kiosk pointage terminals (`KioskAttendance.tsx`). Integrates local device hardware timestamping with strict timezone anchoring (`America/Port-au-Prince`) and anti-clock-tampering validations.

### 1.7 `EnterpriseIdentityOrchestrator` (`src/modules/identity/EnterpriseIdentityOrchestrator.ts`)
- **Responsibility**: Single Source of Truth (SSOT) coordinator for tenant identity resolution, multi-tier invitation linking, role mapping, and real-time state machine routing (`/dashboard`, `/workspace`, `/manager`, `/supervisor`, `/waiting-room`).

---

## 2. Calculation Engine Integration Rules

- **Pure Functional Design**: Calculation functions must accept explicit parameter structures and return calculated results without side effects.
- **No Direct DOM or Storage Dependencies**: Services accept domain entities and return calculated models or event payloads.
- **Auditable Outputs**: High-value calculation outputs (e.g., payroll calculations, snapshot rolls) generate cryptographic verification signatures (`SHA256::...`).
