# INVITATION MANAGEMENT ARCHITECTURE (Espace Collaborateur & Onboarding)

**Module:** FINOPS ERP / FINAYITI Fusion - Structure & Organisation  
**Path:** `/src/components/organization/InvitationManagement.tsx`  
**Status:** Active  
**Version:** 1.0  

---

## 1. VISION & PURPOSE

The **Invitation Management Dashboard** provides administrators, owners, and managers with a centralized interface to oversee, track, send, resend, and revoke invitations issued to employees.

It closes the operational gap in user onboarding, guaranteeing:
- **Strict Multi-Tenancy:** All queries, actions, and listeners are scoped by `business_id`.
- **Single Source of Truth (SSOT):** The `/invitations` collection serves as the immutable state engine for onboarding authorizations.
- **Cryptographic Audit Trail:** Every invitation emission, relance, and revocation is cryptographically signed and stored in `/forensic_logs`.
- **RBAC Authority:** Execution rights are limited to `OWNER`, `MANAGER`, `ADMIN`, and `SUPER_ADMIN`.

---

## 2. ARCHITECTURE & REPOSITORY PATTERN

```
[ UI Layer: InvitationManagement.tsx ]
         │
         ├──> [ Hook: useInvitationsManager.ts ]
         │         │ (Realtime Firestore Listener)
         │         └─> [ Firestore: /invitations ]
         │
         └──> [ Repository: InvitationRepository.ts ]
                   │
                   ├──> [ Service: InvitationLifecycleService.ts ]
                   │         ├─> Updates /invitations
                   │         └─> Updates linked /employees (Status: DRAFT ↔ INVITED)
                   │
                   ├──> [ Repository: ForensicLogRepository.ts ]
                   │         └─> Writes signed log to /forensic_logs (SHA-256)
                   │
                   └──> [ Engine: NotificationEngine.ts ]
                             └─> Broadcasts in-app notification to Business Managers
```

---

## 3. FIRESTORE DATA MODEL (`/invitations`)

Each invitation document stored in Firestore follows this canonical schema:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique invitation document ID (e.g., `inv_171234567`) |
| `business_id` / `businessId` | `string` | Tenant isolation scope |
| `email` | `string` | Lowercase normalized email of the invited user |
| `name` | `string` | Full name of the candidate |
| `role` | `Role` | Assigned system role (`OWNER`, `MANAGER`, `HEAD_TELLER`, `EMPLOYEE`, etc.) |
| `branchId` | `string` | Assigned branch location ID |
| `departmentId` | `string` | Assigned department ID |
| `status` | `string` | Status enum (`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`, `REJECTED`) |
| `invitedAt` / `createdAt` | `string` | ISO timestamp of issuance |
| `acceptedAt` | `string?` | ISO timestamp of acceptance |
| `expiresAt` | `string` | Token expiration date (default: +7 days) |
| `token` / `secure_token` | `string` | Cryptographic access token |
| `invitedBy` | `string` | UID / Employee ID of the issuer |

---

## 4. LIFECYCLE OPERATIONS & AUDIT TRAIL

### 4.1 Send Invitation
1. User submits candidate email, role, branch, and department in `InvitationManagement.tsx`.
2. `InvitationRepository.createInvitation` calls `InvitationLifecycleService.createInvitation`.
3. Creates or links employee record with status `INVITED`.
4. Writes `/invitations/{id}` document.
5. Computes SHA-256 sealed log and writes to `/forensic_logs` with action `INVITATION_SENT`.
6. Sends notification via `NotificationEngine`.

### 4.2 Resend Invitation (Relance)
1. Manager clicks **Relancer** on a `PENDING` or `SENT` invitation.
2. `InvitationRepository.resendInvitation` generates a new token and resets `expiresAt` to `now + 7 days`.
3. Sets status back to `PENDING`.
4. Writes `/forensic_logs` entry with action `INVITATION_RESENT`.
5. Sends notification via `NotificationEngine`.

### 4.3 Revoke Invitation
1. Manager clicks **Révoquer** and confirms prompt.
2. `InvitationRepository.revokeInvitation` sets invitation status to `REVOKED`.
3. Updates linked employee record status back to `DRAFT`.
4. Writes `/forensic_logs` entry with action `INVITATION_REVOKED`.
5. Sends warning notification via `NotificationEngine`.

---

## 5. UI FEATURES & FILTERING

The dashboard includes:
1. **KPI Metric Bar:** Total Issued, Pending, Accepted, Revoked, Expired, Rejected.
2. **Real-time Filter Engine:**
   - Text Search (Name, Email)
   - Status Filter dropdown (`PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`, `REJECTED`)
   - Role Filter dropdown (`OWNER`, `MANAGER`, `HEAD_TELLER`, `SENIOR_TELLER`, `JUNIOR_TELLER`, `EMPLOYEE`)
   - Time Window Filter (`ALL`, 7 days, 30 days, 90 days)
3. **Forensic Audit Drawer:** Modal displaying all signed logs associated with the selected invitation, including SHA-256 seals, timestamps, and actor details.

---

## 6. SECURITY & RBAC MATRIX

| Role | View Invitations | Send Invitation | Resend Invitation | Revoke Invitation | View Forensic Seal |
|---|:---:|:---:|:---:|:---:|:---:|
| `SUPER_ADMIN` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `OWNER` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MANAGER` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `HEAD_TELLER` | ❌ / Read-Only | ❌ | ❌ | ❌ | ❌ |
| `EMPLOYEE` | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 7. VERIFICATION & REUSE

This implementation respects the FINOPS ERP Master Constitution (`GEMINI.md`):
- Reused existing `InvitationLifecycleService` and `ForensicLogRepository`.
- Reused `realtimeManager` and `tenantQuery` for subscription efficiency.
- Preserved zero direct uncontrolled Firestore writes from UI components.
