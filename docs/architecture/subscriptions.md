# Subscriptions, Plans, & Licensing Subsystem Specification

**Version**: 2.0  
**Status**: Active  
**Domain**: Billing, Licensing & Tenancy Rights  

---

## 1. OVERVIEW & ARCHITECTURE

The Subscriptions subsystem governs multi-tenant licensing, plan tiers, seating quotas, and feature module activations for FINOPS ERP.

### Key Components
1. **`subscription_plans`**: Global catalog of plans (`STARTER`, `PROFESSIONAL`, `BUSINESS`, `ENTERPRISE`, and custom plans).
2. **`subscriptions/{businessId}`**: Per-tenant subscription contract storing status (`ACTIVE`, `TRIAL`, `EXPIRED`, `BLOCKED`), expiration dates, and `allowedLimits` (`maxEmployees`, `maxTransactions`, `featuresEnabled`).
3. **`businesses/{businessId}/settings/features` & `features/{businessId}`**: Feature flags matrix determining activated modules.
4. **`FeatureResolver`**: Runtime resolver with 5-minute cache TTL that evaluates active features and subscription status.
5. **`EmployeeRepository.assertSeatLimitNotExceeded`**: Strict data-layer seat limit enforcement preventing employee creation when `seatsUsed >= maxEmployees`.
6. **`SubscriptionAuditService`**: Diagnostic engine that scans tenants, heals missing subscription documents, and flags seat overages and expirations.

---

## 2. PLAN CATALOGUE & DATA STRUCTURES

### `SubscriptionPlanDocument`
- `id`: Plan identifier (`STARTER`, `PROFESSIONAL`, `BUSINESS`, `ENTERPRISE` or `PLAN_...`).
- `name`: Display name.
- `userLimit`: Maximum allowed active collaborators included in base plan.
- `extraUserPriceUsd`: Price per extra seat beyond quota.
- `featuresEnabled`: Array of feature codes enabled by default (`["attendance", "payroll", "hr", "accounting", "bi", "aiCfo"]`).
- `supportedGateways`: Supported payment providers (`stripe`, `moncash`, `natcash`, `bank_transfer`).

---

## 3. SEAT LIMIT ENFORCEMENT & RULES

1. **Employee Creation Check**:
   Before writing a new `employees` document, `EmployeeRepository.assertSeatLimitNotExceeded` counts active employees in Firestore (`status != TERMINATED`).
2. **Quota Exceeded Behavior**:
   If `activeCount + newCount > maxEmployees`, throws a `FinopsException` (code `SEAT_LIMIT_EXCEEDED`, status `403`) blocking creation.
3. **Upgrades & Auto-Sync Workflow**:
   - **Self-Service Upgrades (`OWNER` & `SUPER_ADMIN`)**:
     Workspace Owners (`OWNER`) can initiate plan upgrades (e.g. from `STARTER` to `PROFESSIONAL`, `BUSINESS`, or `ENTERPRISE`) directly from the **Business Admin Center > Modules & Abonnement** section using `SubscriptionService.upgradePlan(businessId, newPlanId)`.
   - **SSOT Synchronization**:
     When an upgrade is confirmed:
     1. `businesses/{businessId}`: `plan`, `subscription.plan`, `subscription.status`, `subscription.userLimit`, and `seats` are updated.
     2. `subscriptions/{businessId}`: Contract state synchronized via `SubscriptionRepository.syncSubscriptionWithPlan`.
     3. `business_settings/{businessId}`: Updated with active plan and status.
     4. `businesses/{businessId}/settings/features`: Feature flags matrix synchronized with default plan capabilities via `FeatureRepository.syncFeaturesWithPlan`.
   - **Cache Invalidation**:
     In-memory and sessionStorage caches are invalidated immediately via `FeatureResolver.clearCache(businessId)` and `BusinessResolver.invalidateCache(businessId)`.
   - **Forensic Audit Logging**:
     Every plan modification generates a cryptographically signed, immutable record in `forensic_logs` via `ForensicLogRepository.createAndSignLog` with action `UPGRADE_SUBSCRIPTION_PLAN`.
   - **Tenant Boundary Enforcement**:
     Multi-tenancy constraints enforce that `OWNER` users can only upgrade their own active workspace (`business_id`). Cross-tenant modifications are strictly blocked. `SUPER_ADMIN` users maintain sovereign override capabilities across all workspaces.

---

## 4. SUPER ADMIN CONSOLE

Accessible via the **Plans & Licences** tab in the Super Admin Platform:
1. **Catalogue des Forfaits**: Full CRUD operations for plans, multi-currency pricing (USD & HTG), and payment gateway mapping.
2. **Souscriptions Tenants**: Live table displaying seat usage (`Seats Used / Seats Limit`), compliance percentage, expiration alerts, and instant plan upgrades.
3. **Surcharge des Modules**: Modal dialog allowing manual module toggling per tenant.
4. **Audit & Diagnostic Intégrité**: One-click execution of `SubscriptionAuditService.auditAndHealAllTenants()` with auto-repair logging.
