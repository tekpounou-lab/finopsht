# FINOPS ERP — Project Directory & Structure Guide

## Overview

FINOPS ERP enforces a modular directory hierarchy that isolates UI components, domain logic, repositories, analytical engines, and utility modules.

---

## Complete Folder Organization

```
/
├── docs/                      # Enterprise Knowledge Hub & Architecture Specs
│   ├── architecture/          # Multi-Tenant & Workforce Performance architecture specs
│   └── ...                    # Domain-specific specifications (payroll.md, repositories.md, etc.)
├── src/
│   ├── components/            # UI Components & Modules
│   │   ├── ledger/            # General Ledger & Double-Entry Accounting UI
│   │   ├── payroll/           # Payroll Management & Calculators UI
│   │   │   ├── components/    # Sub-header & Summary Card widgets
│   │   │   ├── modals/        # Action modals (Structure, Bonus, Advance)
│   │   │   ├── services/      # Payroll calculation & tax engines
│   │   │   └── tabs/          # Tabbed views (Payslips, Advances, Adjustments)
│   │   ├── ui/                # Reusable Design System / Atomic Components
│   │   └── ...                # Feature-specific console components
│   ├── domains/               # Domain-Driven Core Modules
│   │   └── analytics/         # Predictive Analytics & BI Domain Core
│   │       ├── components/    # Analytics panels and visualization views
│   │       ├── selectors/     # Pure selectors for analytical metrics
│   │       └── services/      # Comparison & predictive intelligence engines
│   ├── repositories/          # Data Access Layer & Firestore Encapsulation
│   │   ├── organization/      # Organization structure repositories
│   │   └── *.ts               # Entity Repositories (Employee, Attendance, etc.)
│   ├── services/              # Global Business & Domain Services
│   │   └── business/          # Core Business Services & Snapshot Engine
│   ├── hooks/                 # Custom React Hooks & State Orchestrators
│   ├── contexts/              # React Context Providers for global state
│   ├── pages/                 # Full Page Routing Components
│   ├── types/                 # Shared TypeScript Definitions & Enums
│   ├── constants/             # Application Constants & Design Tokens
│   ├── utils/                 # Pure Helper Functions & Formatting Utilities
│   ├── lib/                   # External Library Wrappers (Firebase, etc.)
│   └── main.tsx               # Application Entry Point
├── GEMINI.md                  # Master Orchestrator for AI & Developers
├── package.json               # Package Manifest & Scripts
└── vite.config.ts             # Vite & Dev Server Configuration
```

---

## Folder Responsibilities

| Directory | Responsibility | Guidelines & Constraints |
| :--- | :--- | :--- |
| `src/components/` | Visual layout & interactive UI controls. | Must not perform direct Firestore reads/writes. |
| `src/components/ui/` | Primitive design system components (`Button`, `Card`, `Modal`). | Highly reusable, atomic, stateless or UI-state only. |
| `src/domains/` | Domain-driven logic, analytics engines, domain models. | Contains core domain services, pure selectors, and domain components. |
| `src/repositories/` | Firestore data persistence & retrieval. | **Strict Rule**: All Firestore interaction is encapsulated here. |
| `src/services/` | Business rules, calculations, approvals, and integrations. | Independent of React state; accepts domain models and returns results. |
| `src/hooks/` | React lifecycle bindings and state subscription logic. | Bridges UI components to Repositories and Domain Services. |
| `src/types/` | TypeScript interfaces, types, and standard `enum` declarations. | No runtime implementation logic; pure type declarations. |
| `src/utils/` | Deterministic formatting, date helpers, string sanitizers. | Pure functions without side effects. |
| `src/lib/` | Low-level configuration for SDKs (Firebase, etc.). | Lazy initialization and error handling. |
