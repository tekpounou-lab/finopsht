# FINOPS ERP — Security, Audit & Cryptographic Standards

## Overview

Security in FINOPS ERP covers multi-tenant isolation, cryptographically signed forensic audit logs, sensitive action verification, and strict Firestore Security Rules.

---

## 1. SHA-256 Forensic Audit Vault

- All high-security actions (Payroll locking, manual salary override, ledger posting, system configuration edits) emit a signed `ForensicLog` record.
- **Hash Signature Format**:
  $$\text{Signature} = \text{SHA256::}(\text{businessId} + \text{userId} + \text{action} + \text{timestamp} + \text{payload})$$
- The `SaaSLicensingConsole.tsx` (Phase 5 Vault) provides an automated integrity verification tool to detect tampered log chains.

---

## 2. Pessimistic Locking Strategy & Safety Interlocks

- During final payroll calculation, the tenant's payroll cycle transitions to `PESSIMISTIC_LOCKED`.
- While in `PESSIMISTIC_LOCKED` state, timecard modifications, bonus additions, and leave approvals are rejected at both the UI and Repository levels.
- **Auto-Expiration Timeout**: To prevent indefinite lockouts due to network failures or abandoned sessions, the locking mechanism implements an active TTL. The duration is configurable by an administrator (default 30 minutes, options from 5 minutes to 2 hours). A background cleanup daemon (SRE Cron Daemon) monitors active locks and automatically releases stale locks, logging `CYCLE_LOCK_AUTO_EXPIRED` to the Forensic Audit Vault with a SHA-256 seal.
- **Emergency Bypass & Override**: In critical situations (e.g., synchronization failure or force majeure), an authorized system administrator can invoke an emergency bypass. This manual override requires entering a legal justification, which immediately forces a lock release and publishes a cryptographically signed `CYCLE_LOCK_FORCE_RELEASED` log to the Forensic Vault.

---

## 3. Firestore Security Enforcement

- Security rules in `firestore.rules` prohibit cross-tenant access (`resource.data.business_id == request.auth.token.business_id`).
- Write operations on sealed records (e.g. sealed payroll cycles, posted ledger transactions) are rejected at the database engine level.

---

## 4. Super Admin Security Center & SecurityRepository (SSOT)

- **Collection**: `/security_alerts/{alertId}` (Firestore SSOT).
- **System Config**: `/system_config/platform_security_policy` (Global multi-tenant security policies).
- **SecurityRepository API**:
  - `getSecurityAlerts()`, `createSecurityAlert()`, `acknowledgeSecurityAlert()`, `resolveSecurityAlert()`
  - `suspendUserAccount()`, `resetUserMFA()`
  - `getSecurityPolicy()`, `updateSecurityPolicy()`
  - `verifyVaultIntegrity()`: real-time SHA-256 validation across forensic log entries.
- **Zero Mock Data Directive**: All alerts, incident resolutions, user suspensions, and global policies are persisted directly to Firestore with cryptographically signed forensic audit logs.

