# FINOPS ERP — Coding & Development Standards

## 1. File & Component Guidelines

### File Size Limits
- Component files must be modularized and kept under **400 lines**.
- Service and repository files must stay under **500 lines**.
- Large files must be extracted into dedicated hooks, sub-components, or utility files.

### Naming Conventions
- **Components**: `PascalCase.tsx` (e.g., `SaaSLicensingConsole.tsx`)
- **Services & Repositories**: `PascalCase.ts` (e.g., `PayrollCalculationEngine.ts`, `EmployeeRepository.ts`)
- **Hooks**: `camelCase.ts` starting with `use` (e.g., `usePayrollData.ts`)
- **Utilities & Helpers**: `camelCase.ts` (e.g., `formatCurrency.ts`)
- **Types**: `PascalCase.ts` or inside `src/types.ts`

---

## 2. TypeScript & Code Style

- **Strict Typing**: Avoid using `any`. Use explicitly defined interfaces or type aliases from `src/types.ts`.
- **Enums**: Standard TypeScript `enum` declarations are required. Do NOT use `const enum`.
- **Type Imports**: Place all imports at the top level. Use named imports instead of default imports where applicable.
- **Null Safety**: Use optional chaining (`?.`) and nullish coalescing (`??`) for defensive programming.

---

## 3. React Best Practices

- **Functional Components**: Use standard functional components with hooks.
- **Dependency Arrays**: Ensure `useEffect`, `useCallback`, and `useMemo` dependency arrays include only primitive or stabilized references to prevent infinite render loops.
- **UI State vs Domain State**: Form inputs and UI toggle states stay inside component state (`useState`). Persisted business data is managed via Repositories and Hooks.

---

## 4. Import Ordering Standard & Path Aliases

To avoid messy deeply-nested relative paths (`../../`), the codebase utilizes **TypeScript path aliases** configured relative to the `src` directory. All local references must use the `@/` prefix (e.g., `@/components/`, `@/repositories/`, `@/services/`).

Imports should be ordered cleanly as follows:

1. React & Framework Core (`react`, `react-dom`)
2. Third-Party Libraries (`lucide-react`, `motion/react`, `recharts`)
3. Repositories & Services (`@/repositories/`, `@/services/`)
4. Custom Hooks & Contexts (`@/hooks/`, `@/contexts/`)
5. Components & UI Primitives (`@/components/`)
6. Types & Utilities (`@/types.ts`, `@/utils/`)

---

## 5. Refactoring Philosophy

- **Incremental Evolution**: Refactor in safe, testable passes.
- **Never Break Existing APIs**: Preserve export signatures when moving code into extracted modules.
- **Lint Verification**: Always execute `lint_applet` / `compile_applet` after modularization passes.

---

## 6. Logging & Telemetry Standards

- **Zero Clutter in Production**: Production console output is restricted strictly to critical system alerts and errors.
- **Mock Service Logging**: Simulated services (`MockServiceManager`, `KioskSimulator`, `QRAttendanceSimulator`) must route logs via `MockServiceManager.getLogger(service)` using `console.debug`. They are silenced by default and enabled only in development when `VITE_ENABLE_MOCK_LOGS=true`.
- **Database Transport Logging**: Resilient Firestore operations (`resilientGetDoc`, `resilientGetDocs`) output debug traces only when `VITE_DEBUG_FIRESTORE=true`.
- **Structured Error Logging**: All system anomalies must be captured via `FinopsException` and contextual forensic records rather than raw unstructured strings.

---

## 7. Connected Component Self-Containment & Fallback Pattern

Connected page wrappers (`ConnectedOrganizationStructure`, `ConnectedPersonnel`, `ConnectedForensicLogs`, `ConnectedBusinessIntelligence`, `ConnectedFinanceLedger`) must enforce **autonomous state resolution**:
- **Zero-Prop Invocability**: Connected wrappers must be callable without props (e.g. `<ConnectedOrganizationStructure />` inside `DashboardShell.tsx`).
- **Context Fallbacks**: Missing props (`currentRole`, `currentUser`, `branches`, `departments`, `employees`, `business`) must automatically fallback to `useBusinessContext()` and `useAuth()`.
- **Callback Fallbacks**: Required callback props (`onAddBranch`, `onSendInvite`, etc.) must default to noop functions (`() => {}`) or dispatch via `useCommandBus()` to prevent `TypeError: props.func is not a function` runtime crashes.
- **Safe Array Scoping**: All `.filter()`, `.map()`, and `.reduce()` operations on domain collections must wrap targets in safe array guards (`(items || []).filter(...)`).
