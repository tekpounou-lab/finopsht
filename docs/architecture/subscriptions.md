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
3. **Upgrades & Auto-Sync**:
   When a Super Admin changes a tenant's plan in the "Plans & Licences" console:
   - `Business.plan` is updated in `businesses/{businessId}`.
   - `subscriptions/{businessId}` is synchronized via `SubscriptionRepository.syncSubscriptionWithPlan`.
   - Feature flags in `businesses/{businessId}/settings/features` are updated to match the plan's default modules.
   - `FeatureResolver.clearCache(businessId)` invalidates in-memory cache immediately.

---

## 4. SUPER ADMIN CONSOLE

Accessible via the **Plans & Licences** tab in the Super Admin Platform:
1. **Catalogue des Forfaits**: Full CRUD operations for plans, multi-currency pricing (USD & HTG), and payment gateway mapping.
2. **Souscriptions Tenants**: Live table displaying seat usage (`Seats Used / Seats Limit`), compliance percentage, expiration alerts, and instant plan upgrades.
3. **Surcharge des Modules**: Modal dialog allowing manual module toggling per tenant.
4. **Audit & Diagnostic Intégrité**: One-click execution of `SubscriptionAuditService.auditAndHealAllTenants()` with auto-repair logging.
