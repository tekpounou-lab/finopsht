# FINOPS ERP — Identity Mapping & Multi-Tenant Isolation

## Overview

FINOPS ERP enforces strict, cryptographically auditable **multi-tenant isolation**. Every transaction, attendance log, payroll cycle, and employee record is isolated at the database level by a `business_id`. 

This document defines how an authenticated user's identity is resolved, linked to a specific company/tenant, assigned an Enterprise Role, and propagated to the client.

---

## 1. The Single Source of Truth (SSOT) Models

Two primary document collections in Firestore establish user-tenant linkage:
1. **User Profile (`/users/{uid}`)**: Represents the authenticated user across all devices.
2. **Employee (`/employees/{employeeId}`)**: Represents the legal/contractual employee record within a specific business.

### 1.1 `/users/{uid}` Schema
The `/users/{uid}` document is bound to the Firebase Auth User ID (`uid`).

```typescript
export interface UserProfile {
  id: string;                    // Firebase Auth UID
  email: string;                 // Authenticated user email
  name: string;                  // Display name
  role: Role;                    // Resolved business role
  business_id?: string;          // Scoped Business ID (Tenant partition key)
  employee_id?: string;          // Linked Employee document ID
  account_status?: string;       // "ACTIVE" | "SUSPENDED" | "NEW_USER"
  onboarding_completed?: boolean;// Onboarding state flag
  createdAt: any;
  updatedAt: any;
}
```

### 1.2 `/employees/{employeeId}` Schema
The employee record belongs to a specific business and is physically stored within `/employees/` with a reference to `business_id`.

```typescript
export interface Employee {
  id: string;                    // Immutable employeeId (Firestore doc ID)
  firebase_uid?: string;         // Maps to UserProfile.id when linked
  business_id: string;           // Partition Key for tenant isolation
  name: string;
  email: string;                 // Corporate email
  normalizedEmail?: string;      // Lowercase email for collision-free index searches
  email_history?: string[];      // Multi-email tracking for historic transitions
  role: Role;                    // Contractual role within the business
  status?: "DRAFT" | "INVITED" | "PENDING_ACCEPTANCE" | "ACTIVE" | "SUSPENDED" | "TERMINATED";
  createdAt: any;
  updatedAt: any;
}
```

---

## 2. Linkage Resolution Workflow

The linkage is established dynamically through two primary architectural paths:

### 2.1 Scenario A: New Tenant Workspace Creation (Top-Down)
When an entrepreneurial user creates a new business (Owner/Founder flow):
1. **Provisioning Request**: The client calls `WorkspaceProvisioningService.provision()`.
2. **Business Creation**: A new `/businesses/{businessId}` document is generated.
3. **Workspace Initialization**: Default branches, departments, settings, and standard role permissions are compiled into `business_snapshots/{businessId}`.
4. **User Record Promotion**: The user's `/users/{uid}` document is directly updated:
   - `role` is promoted to `"OWNER"` (which maps to client-side permissions like `ADMIN`).
   - `business_id` is assigned to the newly created `businessId`.
   - `onboarding_completed` is set to `true`.

### 2.2 Scenario B: Employee Onboarding via Invitation (Bottom-Up)
When an administrator invites an employee to join an existing workspace:
1. **Invitation Generation**: An admin issues an invitation, creating:
   - An `/employees/{employeeId}` record in status `"INVITED"`.
   - An `/invitations/{invitationId}` record in status `"SENT"`.
2. **User Registration**: The employee logs in via Firebase Authentication.
3. **High-Fidelity 5-Tier Resolution Lookup**:
   Upon authentication, the `EnterpriseIdentityOrchestrator` runs a comprehensive, prioritized query sequence to find pending invitations:
   - **Tier 1 (Direct UID)**: Query `/invitations` where `firebase_uid == user.uid`.
   - **Tier 2 (Direct Employee ID)**: Query `/invitations` where `employee_id == userProfile.employee_id`.
   - **Tier 3 (Current Email)**: Query `/invitations` where `email == user.email`.
   - **Tier 4 (Normalized Email)**: Query `/invitations` where `normalizedEmail == user.email.toLowerCase()`.
   - **Tier 5 (Historical Email)**: Query `/invitations` where `email_history` array contains `user.email`.
4. **Accepting & Linking Transaction**:
   When the user accepts the invitation, a **pessimistic Firestore Transaction** completes the linking:
   - Mark invitation as `"ACCEPTED"`.
   - Activate the employee record, changing status to `"ACTIVE"` and binding `firebase_uid = user.uid`.
   - Reconcile and repair the `/users/{uid}` profile, setting:
     - `employee_id = employee.id`
     - `business_id = employee.business_id`
     - `role = invitation.role`
     - `onboarding_completed = true`
   - Generate a forensic audit log of the transition.

### 2.3 Scenario C: Direct Manual Employee Self-Registration (iCloud / Password & Waiting Room)
When an employee registers directly without a prior invitation link:
1. **Direct Credential Creation**: The employee enters their full name, email (including iCloud domains `@icloud.com`, `@me.com`), and creates a password in `UnifiedAuthPortal`.
2. **Profile Generation & Role Request**:
   - Creates a base `/users/{uid}` profile with `requested_role: "EMPLOYEE"`, `account_status: "ACTIVE"`, and `onboarding_completed: false`.
   - Stamps the requested role in `EnterpriseIdentityOrchestrator.setRequestedRole(user, "EMPLOYEE")`.
3. **Dual-Path Routing**:
   - **Pre-Invited Case**: If the employer had already issued an invitation matching the email, the system automatically accepts it immediately, transitions the user to `ACTIVE`, and routes them directly to `/workspace`.
   - **Uninvited Case**: If no invitation exists, the state machine resolves to `BUSINESS_PENDING`, routing the user to `/waiting-room`.
4. **Real-time Waiting Room**:
   - The `/waiting-room` component opens a real-time listener on `/invitations` for the user's email.
   - As soon as the business administrator issues an invitation or approves the pending employee, the client transitions instantly to `/workspace`.

---

## 3. Real-time Client-Side Propagation

The client propagates identity and permissions with sub-millisecond perceived latency, using a zero-blocking cached architecture.

```
+--------------------------------------------------------+
|                 onAuthStateChanged                     |
+---------------------------+----------------------------+
                            |
                            v
+--------------------------------------------------------+
|      Check sessionStorage / localStorage Cache         |
+---------------------------+----------------------------+
       |                                          |
       | (Cache Hit: Instant Boot)                | (Cache Miss: Wait)
       v                                          v
+-------------------------------+       +------------------------------------+
| Bootstrap PermissionService   |       | Enter Loading State                |
| Render Workspace Instantly    |       | Run IdentityOrchestrator           |
+---------------+---------------+       +-----------------+------------------+
                |                                         |
                | (Background Refresh)                    |
                +-------------------> + <-----------------+
                                      |
                                      v
                        +----------------------------+
                        |   Enterprise Orchestrator  |
                        |      (Resolves SSOT)       |
                        +-------------+--------------+
                                      |
                                      v
                        +----------------------------+
                        |  Update React Context      |
                        |  Sync PermissionService    |
                        +-------------+--------------+
                                      |
                                      v
                        +----------------------------+
                        | Real-time Firestore Sync   |
                        | (Listen: Employee & Snapshot)|
                        +----------------------------+
```

### 3.1 Step 1: Zero-Latency Local Cache Bypass
On application start, the `IdentityProvider` check's the browser's storage (`sessionStorage` and `localStorage`) for a recently serialized `IdentitySnapshot` (valid for 10 minutes).
- **If hit**: The UI renders instantly, bootstrapping the static `PermissionService` with the cached role and permissions. This prevents "flash of unauthenticated/unauthorized screen" glitches.
- **If miss**: The application displays a centered, visually elegant loader while executing the orchestrator.

### 3.2 Step 2: Background Re-Orchestration
Concurrently, the `IdentityProvider` launches `EnterpriseIdentityOrchestrator.orchestrate(user)` to verify the current tenant records asynchronously.
- The resolved `IdentitySnapshot` is pushed into the React Context state.
- If changes to the role, permissions, or license status are detected, the local cache is overwritten.

### 3.3 Step 3: Global Service Synchronization
Whenever a new `IdentitySnapshot` is resolved, `PermissionService` is re-initialized statically:
```typescript
PermissionService.init(
  snapshot.role,
  snapshot.permissions,
  snapshot.businessSnapshot?.featureFlags,
  snapshot.businessSnapshot?.subscription?.plan,
  snapshot.businessSnapshot?.subscription?.status,
  snapshot.business?.id
);
```

### 3.4 Step 4: Real-time Persistence Synchronization (Reactive Stream Pool)
To guarantee real-time updates when an administrator changes a user's role or updates subscription limits:
1. **Employee Listener**: A listener is attached to `doc(db, "employees", employee.id)`. If an administrator suspends the employee, the status change is received instantly, and the client reacts immediately.
2. **Business Snapshot Listener**: A listener is attached to `doc(db, "business_snapshots", business.id)`. Changes to tenant-wide configurations or features instantly apply to the active user session.

---

## 4. Multi-Tenant Query Isolation

All repositories and services must scope database operations using the resolved tenant context.

### 4.1 Client-Side Query Scoping
When querying data, developers must retrieve the active tenant partition key from `PermissionService` or `useIdentity()` and inject it as a filter:

```typescript
const activeBusinessId = PermissionService.getBusinessId();

const transactionsQuery = query(
  collection(db, "transactions"),
  where("business_id", "==", activeBusinessId),
  orderBy("date", "desc")
);
```

### 4.2 Server-Side Security Rules Enforcement (`firestore.rules`)
To guarantee that malicious client calls cannot bypass tenant scoping, Firestore Security Rules validate that:
1. The user's authenticated token carries matching tenant credentials, or
2. The query is strictly filtered by the user's mapped `business_id` in their `/users/{uid}` document.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper to resolve the authenticated user's profile
    function getUserProfile(auth) {
      return get(/databases/$(database)/documents/users/$(auth.uid)).data;
    }

    match /businesses/{businessId}/ledger_transactions/{txId} {
      allow read, write: if request.auth != null && 
        getUserProfile(request.auth).business_id == businessId;
    }
  }
}
```

---

## 5. Enterprise Status & Activation Lifecycle (`isBizActive`)

### 5.1 Resolution Rules for `isBizActive`
The enterprise workspace is determined active (`isBizActive = true`) if ANY of the following criteria are met:
1. `identityStatus === "ACTIVE"`
2. `business.status === "ACTIVE"` or `"APPROVED"`
3. `onboardingStatus === "COMPLETED"`
4. `role === "SUPER_ADMIN"`

### 5.2 SuperAdmin Approval Workflow (`PENDING_OWNER` → `ACTIVE`)
Upon SuperAdmin approval of a pending business request in `PendingBusinessRepository.approve()`:
1. The `pending_businesses` document is marked as `"APPROVED"`.
2. The founder's user profile (`/users/{uid}`) is updated with `accountStatus: "ACTIVE"`, `account_status: "ACTIVE"`, and assigned `business_id`.
3. The provisioned business document (`/businesses/{businessId}`) and subscription (`/subscriptions/{businessId}`) are set to `status: "ACTIVE"`.
4. `useAuth.flowState` transitions from `"BUSINESS_PENDING"` to `"OWNER_ACTIVE"`, granting immediate access to `/workspace` and full dashboard modules.
