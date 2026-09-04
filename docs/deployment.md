# FINOPS ERP — Hosting, CI/CD, and Multi-Environment Deployment Specification

## Overview

FINOPS ERP employs a secure, fully automated, and isolated multi-environment deployment model. To guarantee continuous availability, risk mitigation, and compliance with financial regulations, all staging boundaries are strictly isolated, and production deployments are fully automated via secure CI/CD pipelines.

---

## 1. Multi-Environment Topology

The system maintains three distinct environments with independent cloud infrastructures to prevent cross-pollution of financial and operational datasets.

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│    Dev Environment     │      │  Staging Environment   │      │ Production Environment │
├────────────────────────┤      ├────────────────────────┤      ├────────────────────────┤
│ • Branch: dev          │      │ • Branch: main         │      │ • Branch: release/*    │
│ • Db: finops-erp-dev   │      │ • Db: finops-erp-stage │      │ • Db: finops-erp-prod  │
│ • Auth: Isolated-Dev   │      │ • Auth: Isolated-Stage │      │ • Auth: Enterprise-Prod│
│ • Local emulator dev   │      │ • Client-acceptance    │      │ • Live transactions    │
└───────────┬────────────┘      └───────────┬────────────┘      └───────────┬────────────┘
            │                               │                               │
            ▼                               ▼                               ▼
     Continuous Build               Automated Regression             Blue/Green Release
```

### 1.1 Environment Isolation Parameters

| Feature / Resource | Development (`dev`) | Staging (`staging`) | Production (`production`) |
| :--- | :--- | :--- | :--- |
| **GCP Project ID** | `finops-erp-dev` | `finops-erp-staging` | `finops-erp-production` |
| **Firestore Database ID**| `(default)` | `(default)` | `(default)` |
| **OAuth Redirect URIs** | `http://localhost:3000/oauth` | `https://stage.finopserp.com/oauth`| `https://app.finopserp.com/oauth` |
| **Security Rule Strictness**| Permissive testing rules | Mirrored Production | Maximum (Strict Locked) |
| **Backup Cadence** | None | Weekly | Daily (Automated snapshot with PITR) |
| **Downtime Tolerance** | High | Low | Zero (Highly available multi-region) |

---

## 2. CI/CD Build Pipelines

All code transitions from commit to delivery are governed by **GitHub Actions** workflows. No developer has permission to deploy directly to Production from a local machine.

### 2.1 The Standard Verification Pipeline (Pre-Merge Gate)

Triggered on any pull request targeting the `dev` or `main` branches.

```yaml
name: Continuous Integration Gate

on:
  pull_request:
    branches: [ dev, main ]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Setup Node.js Environment
        uses: actions/setup-node@v4
        with:
          node-size: 18
          cache: 'npm'

      - name: Install Base Dependencies
        run: npm ci

      - name: Static Analysis & Code Linting
        run: npm run lint

      - name: Run Unit Tests
        run: npm run test:unit

      - name: Run End-to-End Smoke Tests (Firebase Emulator)
        run: |
          npm install -g firebase-tools
          firebase emulators:exec "npm run test:integration" --project finops-erp-emulator
```

### 2.2 CD Pipeline: Automated Multi-Environment Release

Triggered on direct commits/merges to key integration branches.

```yaml
name: Continuous Delivery Pipeline

on:
  push:
    branches:
      - dev       # Deploys to Development Environment
      - main      # Deploys to Staging Environment
    tags:
      - 'v*.*.*'  # Deploys to Production Environment on Tag Release

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source Code
        uses: actions/checkout@v4

      - name: Set Environment Target
        id: target
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/dev" ]]; then
            echo "env=dev" >> $GITHUB_OUTPUT
            echo "project=finops-erp-dev" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "env=stage" >> $GITHUB_OUTPUT
            echo "project=finops-erp-staging" >> $GITHUB_OUTPUT
          else
            echo "env=prod" >> $GITHUB_OUTPUT
            echo "project=finops-erp-production" >> $GITHUB_OUTPUT
          fi

      - name: Install & Build Static Assets
        run: |
          npm ci
          npm run build

      - name: Deploy to Google Cloud / Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets[format('FIREBASE_SERVICE_ACCOUNT_{0}', steps.target.outputs.env)] }}'
          projectId: '${{ steps.target.outputs.project }}'
          channelId: live

---

## 3. Environment-Specific Configurations & Secrets

FINOPS ERP separates non-sensitive environmental parameters from highly sensitive credentials.

### 3.1 Non-Sensitive Configurations (`.env` vs `.env.example`)

Environmental variables required for execution are documented in `.env.example`. During build-time, Vite bundles configurations prefixed with `VITE_` into the compiled static client assets.

```env
# Non-Sensitive Configuration Keys
VITE_FIREBASE_API_KEY=AIzaSyA...
VITE_FIREBASE_AUTH_DOMAIN=finops-erp-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=finops-erp-production
VITE_FIREBASE_STORAGE_BUCKET=finops-erp-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=8492048201
VITE_FIREBASE_APP_ID=1:8492048201:web:abc123xyz
VITE_APP_ENV=production
```

### 3.2 Enterprise Secrets Management (GCP Secret Manager)

Highly sensitive server-side variables (e.g., Google Workspace OAuth credentials, custom backend private keys, central bank API tokens, or session signing keys) **must never** be stored in `.env` files or checked into repository branches. 

1. **Storage**: All production-tier secrets are stored inside **GCP Secret Manager** with encryption at rest using Customer-Managed Encryption Keys (CMEK).
2. **Access Control**: Workloads running in Cloud Run or serverless environments are assigned a specific **IAM Service Account** possessing the minimal role `roles/secretmanager.secretAccessor` targeting only the specific required secrets.
3. **Reference Injection**: Secrets are resolved at boot-time or injected dynamically as secure environment variables inside Cloud Run containers.

---

## 4. Feature Flags & Dynamic Release Control

To enable progressive delivery, canary testing, and quick feature rollback without initiating complete redeployment pipelines, FINOPS ERP integrates a strict **Feature Flag Engine**.

### 4.1 Feature Flag Definition Schema

Feature flags are loaded during client initialization from the `/businesses/{businessId}/feature_flags` collection, with system-wide defaults managed in the `SYSTEM` partition.

```typescript
export interface FeatureFlag {
  key: string;               // e.g., "ENABLE_DRY_RUN_FORENSIC"
  description: string;
  isEnabled: boolean;
  percentageRollout: number; // 0 to 100 for canary rollouts
  targetingRules?: {
    allowedBusinessIds?: string[];
    allowedRoles?: string[];
  };
  updatedAt: string;
}
```

### 4.2 Standard Core Feature Flags

* `ENABLE_PESSIMISTIC_LOCK_OVERRIDE`: Allows system administrators to override locked cycles manually (requires legal justification log).
* `ENABLE_DYNAMIC_EXCHANGE_RATE`: Connects the real-time daily BRH Exchange rate feed. If disabled, fallback rates (135) are strictly enforced.
* `ENABLE_FORENSIC_HASH_VERIFIER`: Activates the automated SHA-256 integrity reporting suite inside the Saas Licensing Tab.

---

## 5. Enterprise Scaling & Resiliency

To meet the high availability demands of multi-tenant enterprise processing:

1. **Firestore Scaling**: Employs document-level transaction backoffs and localized event queuing. Database index updates are pre-validated against the local Firestore Emulator to avoid hotspotting.
2. **Global CDN Distribution**: Built static client bundles are cached and served globally via edge nodes close to end-users, ensuring sub-100ms response latencies for visual elements.
3. **Automatic Micro-Scaling**: Server-side microservices (such as the PDF generation engines or asynchronous calculation queues) scale automatically from 0 to N instances based on CPU utilization metrics, maintaining zero idle cost while handling peak quinzaine payroll calculations smoothly.

