# FINOPS ERP — Repository Layer Specification (`src/repositories/`)

## Overview

The Repository Layer encapsulates all Firestore database interactions behind clean, asynchronous TypeScript interfaces. Components and business services never invoke Firestore SDK methods directly.

---

## 1. Repository Directory & Index

All repositories are exported from `src/repositories/index.ts`:

- `EmployeeRepository`: Manages employee profiles, job statuses, base salaries, and departmental assignments.
- `AttendanceRepository`: Handles clock-in/out timestamps, geolocation, and timecard validations.
- `BadgeRepository`: Manages RFID/NFC physical badge serial numbers and access cards.
- `ScheduleRepository`: Configures shift schedules, work hours, and rotation rules.
- `LeaveRepository`: Tracks paid time off, sick leave balances, and leave approval workflows.
- `WorkforceRepository`: Aggregates employee metrics, active headcount, and organizational rosters.
- `BusinessAdministrationRepository`: Manages tax configurations (ONA/OFATMA rates), currency settings, and business metadata.
- `SubscriptionRepository`: Controls SaaS licensing, plan tiers, and feature flags.

---

## 2. Standard Repository Pattern Example

```typescript
// src/repositories/EmployeeRepository.ts
import { doc, getDoc, setDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../lib/firebase";
import { Employee } from "../types";

export const EmployeeRepository = {
  async getById(businessId: string, employeeId: string): Promise<Employee | null> {
    const path = `businesses/${businessId}/employees/${employeeId}`;
    try {
      const snap = await getDoc(doc(db, "businesses", businessId, "employees", employeeId));
      return snap.exists() ? ({ id: snap.id, ...snap.data() } as Employee) : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.READ, path);
      return null;
    }
  },

  async listAll(businessId: string): Promise<Employee[]> {
    const path = `businesses/${businessId}/employees`;
    try {
      const q = query(collection(db, "businesses", businessId, "employees"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee));
    } catch (error) {
      handleFirestoreError(error, OperationType.READ, path);
      return [];
    }
  }
};
```

---

## 3. Strict Rules for Developers & AI

1. **No Direct Firestore in Views**: Never write `doc(db, ...)`, `getDocs(...)`, or `onSnapshot(...)` inside React views or components.
2. **Standard Error Handling**: All repository methods wrap Firestore operations in `try/catch` and utilize `handleFirestoreError`.
3. **Business Isolation**: Every repository method requires a `businessId` parameter to guarantee multi-tenant scoping.
