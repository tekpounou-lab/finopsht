# FinOps (Tek Pou Nou) — FINOPS ERP / FINAYITI Fusion

Multi-tenant SaaS Financial & Operational ERP platform for SMEs (`finopsht`), built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS**, **Express**, and **Firebase / Firestore** (named database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a`).

> **AI Coding Agents & New Contributors:** Read [`GEMINI.md`](./GEMINI.md) and [`HANDOFF.md`](./HANDOFF.md) first before modifying any code, then browse [`docs/README.md`](./docs/README.md).

---

## Core Capabilities

- **HR, Staff & Attendance**: Employee lifecycle, organizational hierarchy, QR kiosk attendance (`America/Port-au-Prince`), waiting room onboarding, and invitation acceptance (`/api/invitations/lookup`, `/api/invitations/accept`).
- **Payroll & Statutory Compliance**: Haitian statutory payroll engine (ONA / OFATMA), survival floor protection, payslip PDF generation, cryptographic SHA-256 sealing, and employee receivables.
- **Double-Entry General Ledger & Multi-Currency**: Immutable `ledger_transactions` (SSOT), append-only reversals, CSV bulk import, HTG/USD exchange rates.
- **Cash Management (FINAYITI Fusion)**: Tills, till sessions & denomination counts, branch safes, internal/customer transfers, Maker-Checker closures & reopenings.
- **Business Intelligence & AI CFO**: Cash-basis vs. accrual analytics (`AnalyticsEngine`), Performance Intelligence Center (PIC), and Gemini-backed AI CFO endpoints (`/api/cfo/*`) with deterministic heuristic fallback.
- **Security & Observability**: Multi-tenant isolation (`business_id`), 7-tier RBAC (`PermissionService` + `firestore.rules`), forensic audit vault (`forensic_logs`), and 8 runtime observability consoles.

---

## Tech Stack & Runtime Topology

- **Frontend**: React 19, Vite 6, Tailwind CSS 4, React Router 7, Recharts, i18next, Zod.
- **Backend (`server.ts`)**: Express server mounted with Vite middlewares in development (`npm run dev`), bundled with `esbuild` to:
  - `dist/server.cjs` (Node / Cloud Run standalone server via `npm start`)
  - `api/_server.cjs` (wrapped by `api/index.ts` and `vercel.json` for Vercel Serverless Functions)
- **Database & Auth**: Firebase Auth + Firestore named database `ai-studio-finopserp-ef001fee-dd79-4547-8e51-9e59e365e98a` (configured in `firebase-applet-config.json`).
  - **Vercel**: Passwordless **Vercel OIDC / Google Workload Identity Federation (WIF)** via `src/lib/firebaseAdmin.ts` (`@vercel/oidc`, `google-auth-library`, `@google-cloud/firestore`), with static credential fallbacks preserved.
  - **Cloud Run**: Strict Application Default Credentials (`cloud_run_adc`).
  - **Client**: Firebase Web SDK (`src/lib/firebase.ts`) with offline IndexedDB persistence / resilient deduplication (`resilientFirestore.ts`).

---

## Repository Layout

| Path | Purpose |
|---|---|
| `src/` | Frontend React app, domain engines (`src/domains/`), repositories (`src/repositories/`), services (`src/services/`), RBAC, and Vitest suites (`src/tests/`) |
| `server.ts` | Main Express backend API & Vite dev server entrypoint |
| `api/` | Vercel serverless adapter (`api/index.ts` -> `api/_server.cjs`) |
| `functions/` | Firebase Cloud Functions package |
| `scripts/` | Migration, audit, and verification scripts |
| `docs/` | Architecture specifications, ADRs, certified baseline, changelog, and organized audit archive (`docs/audits/`) |
| `tests/` | Additional standalone unit test directory |
| `GEMINI.md` | Engineering constitution & non-negotiable architectural rules |
| `HANDOFF.md` | Current project state, recent WIF auth changes, gotchas, and next steps for coding agents |

---

## Quick Start & Commands

```bash
# Install dependencies (see HANDOFF.md regarding bun.lock vs package-lock.json)
npm install

# Copy environment template (never commit real secrets)
cp .env.example .env.local

# Start full-stack development server (Express + Vite on port 3000)
npm run dev

# Type-check (also mapped to "lint" in package.json)
npx tsc --noEmit

# Build client (dist/) + server bundles (dist/server.cjs & api/_server.cjs)
npm run build

# Run Vitest sequentially in low-memory environments
npx vitest run --maxWorkers=1
```

---

## Docker (Local Development & Validation)

> Production deployment remains on **Vercel** (`api/index.ts` + `api/_server.cjs` + `dist/`). Docker is strictly for reproducible local development and validation using pinned **Node.js `22.14.0-bookworm-slim`** and `npm ci`. No secrets, `.env` files, or Firebase keys are baked into the image (`.dockerignore`).

```bash
# 1. Build the default development & validation image (runs npm ci + npm run build verification)
docker build -t finops-erp:dev .

# Optional: build the lean built-runtime preview image (node dist/server.cjs)
docker build --target prod-preview -t finops-erp:preview .

# 2. Start the container (binds 0.0.0.0 and respects PORT; inject env vars at runtime only)
docker run -d --name finops-dev \
  -p 3000:3000 \
  -e PORT=3000 \
  --env-file .env.local \
  finops-erp:dev

# 3. Validate endpoints & run checks inside the running container
curl -i http://localhost:3000/api/health
curl -I http://localhost:3000/
curl -I http://localhost:3000/src/main.tsx
docker exec finops-dev npx tsc --noEmit
docker exec finops-dev npx vitest run --maxWorkers=1 src/tests/unit/security/VercelWifFirebaseAdmin.test.ts

# 4. Stop and remove the container
docker stop finops-dev && docker rm finops-dev
```

---

## Key Documentation

- [`HANDOFF.md`](./HANDOFF.md) — Current implementation status & exact continuation guide
- [`GEMINI.md`](./GEMINI.md) — Engineering & security constitution
- [`docs/README.md`](./docs/README.md) — Full `/docs/` directory index
- [`docs/FINOPS_CERTIFIED_BASELINE.md`](./docs/FINOPS_CERTIFIED_BASELINE.md) — Frozen financial core governance rules (v4.0)
- [`docs/decision-log.md`](./docs/decision-log.md) — Architecture Decision Records (`ADR-001` – `ADR-019`)
- [`docs/changelog.md`](./docs/changelog.md) — Chronological engineering changelog
