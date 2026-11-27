# FINOPS ERP — Project Directory & Structure Guide

## Overview

FINOPS ERP enforces a modular directory hierarchy that isolates UI components, domain logic, repositories, analytical engines, and utility modules.

---

## Complete Folder Organization

```
/
├── api/                       # Vercel Serverless Function Wrapper (api/index.ts -> api/_server.cjs)
├── docs/                      # Enterprise Knowledge Hub & Architecture Specs
│   ├── README.md              # Documentation table of contents
│   ├── architecture/          # Domain & system architecture specs
│   ├── audit-archive/         # Archived BI & implementation-phase audit bundles
│   ├── audits/                # Categorized audits, matrices & patch diffs
│   │   ├── attendance/        # Attendance P0-P0.2.1 security & rules matrices
│   │   ├── business-intelligence/ # BI P1.8/P1.10 SSOT & KPI reconciliation evidence
│   │   ├── p0-infrastructure/ # Firebase Admin, Vercel/Cloud Run packaging & invitation traces
│   │   └── rbac/              # FINAYITI RBAC Step 1-4 & VULN_01 reports/diffs
│   ├── engineering/           # Engineering audits & manual validation checklists
│   ├── performance/           # Performance optimization guides
│   └── sre/                   # Disaster recovery runbooks
├── functions/                 # Firebase Cloud Functions workspace
├── public/                    # Static public assets
├── scripts/                   # Maintenance, migration, audit & verification scripts
├── src/
│   ├── architecture/          # Client architecture descriptors & registries
│   ├── components/            # UI Components & Modules
│   │   ├── ledger/            # General Ledger & Double-Entry Accounting UI
│   │   ├── payroll/           # Payroll Management & Calculators UI
│   │   ├── observability/     # System Health & Observability consoles
│   │   ├── ui/                # Reusable Design System / Atomic Components
│   │   └── ...                # Feature-specific console components
│   ├── config/                # Client & runtime configuration helpers
│   ├── constants/             # Application Constants & Design Tokens
│   ├── contexts/              # React Context Providers for global state
│   ├── core/                  # Core primitives & shared runtime abstractions
│   ├── domains/               # Domain-Driven Core Modules
│   │   ├── analytics/         # Predictive Analytics & BI Domain Core
│   │   ├── attendance/        # QR Kiosk & Attendance Domain
│   │   ├── cash/              # Cash Management, Tills, Safes & Closures
│   │   ├── dashboard/         # Dashboard domain selectors & models
│   │   ├── ledger/            # General Ledger engines & filters
│   │   ├── organization/      # Branches, departments & cost centers
│   │   ├── payroll/           # Payroll calculation & sealing domain
│   │   ├── performance/       # Performance Intelligence Center (PIC)
│   │   ├── planning/          # Financial planning domain
│   │   ├── rbac/              # RBAC & operational profile enforcement
│   │   └── staff/             # Workforce & employee lifecycle domain
│   ├── hooks/                 # Custom React Hooks & State Orchestrators
│   ├── lib/                   # SDK wrappers (firebase.ts, firebaseAdmin.ts with WIF/ADC)
│   ├── modules/               # Runtime EventBus & approval middleware
│   ├── navigation/            # Navigation topology & route metadata
│   ├── pages/                 # Full Page Routing Components
│   ├── permissions/           # PermissionService & role matrices
│   ├── repositories/          # Data Access Layer & Firestore Encapsulation
│   ├── routes/                # Route definitions & guards
│   ├── services/              # Global Business, Provisioning & Observability Services
│   ├── tests/                 # Unit, integration & security Vitest suites
│   ├── types/                 # Shared TypeScript Definitions & Enums
│   ├── utils/                 # Pure Helper Functions & Formatting Utilities
│   ├── validations/           # Zod & integrity validation schemas
│   └── main.tsx               # Application Entry Point
├── tests/                     # Additional standalone unit tests
├── server.ts                  # Express backend & Vite dev middleware entrypoint
├── Dockerfile                 # Multi-stage Docker image (dev/validation & prod-preview)
├── .dockerignore              # Excludes node_modules, dist, .env*, and Firebase keys
├── GEMINI.md                  # Master Engineering Constitution
├── HANDOFF.md                 # Current state & continuation guide for coding agents
├── README.md                  # Repository quick-start & architecture overview
├── firebase-applet-config.json # Target Firebase project & named Firestore DB config
├── firestore.rules            # Multi-tenant Firestore security rules
├── package.json               # Package Manifest & Scripts
├── vercel.json                # Vercel build & serverless routing configuration
├── vite.config.ts             # Vite & Client Build Configuration
└── vitest.config.ts           # Vitest Configuration
```

---

## Folder Responsibilities

| Directory / File | Responsibility | Guidelines & Constraints |
| :--- | :--- | :--- |
| `server.ts` & `api/` | Express API server & Vercel serverless wrapper (`api/_server.cjs`). | Enforces `authenticateToken` and server-side Admin SDK writes. |
| `src/components/` | Visual layout & interactive UI controls. | Must not perform direct Firestore reads/writes. |
| `src/components/ui/` | Primitive design system components (`Button`, `Card`, `Modal`). | Highly reusable, atomic, stateless or UI-state only. |
| `src/domains/` | Domain-driven logic, engines, adapters, and pure selectors. | Contains core domain services, pure selectors, and domain components. |
| `src/repositories/` | Firestore data persistence & retrieval. | **Strict Rule**: All client Firestore interaction is encapsulated here. |
| `src/services/` | Business rules, calculations, approvals, provisioning, and integrations. | Independent of React state; accepts domain models and returns results. |
| `src/hooks/` | React lifecycle bindings and state subscription logic. | Bridges UI components to Repositories and Domain Services. |
| `src/types/` | TypeScript interfaces, types, and standard `enum` declarations. | No runtime implementation logic; pure type declarations. |
| `src/utils/` | Deterministic formatting, date helpers, string sanitizers. | Pure functions without side effects. |
| `src/lib/` | Low-level SDK wrappers (`firebase.ts`, `firebaseAdmin.ts`). | Lazy initialization, Vercel WIF / Cloud Run ADC auth, named DB enforcement. |
| `src/tests/` | Automated unit, integration, and security regression suites. | Run sequentially via `npx vitest run --maxWorkers=1` in low-memory containers. |
