# FINOPS ERP — UI & Design System Specification

> **Full Component Registry**: For detailed component lists, tokens (`tokens.ts`), and high-level ERP layout patterns, consult [`docs/design-system/UI_REGISTRY.md`](/docs/design-system/UI_REGISTRY.md).

## Overview

FINOPS ERP relies on a sophisticated, high-contrast, modern UI design system built on **Tailwind CSS**, **Lucide Icons**, and **Motion** (Framer Motion). The design avoids generic AI templates ("AI Slop") in favor of mathematical spacing, elegant typography, and clear visual hierarchy.

---

## 1. Design Philosophy & Token System

### 1.1 Color Palette
- **Base Canvas**: Dark slate/navy (`bg-slate-950`, `bg-slate-900`) and high-contrast light neutrals (`bg-white`, `bg-slate-50`).
- **Accent Tokens**:
  - `emerald`: Success, positive metrics, verified seals, payroll approvals (`text-emerald-400`, `bg-emerald-500/10`).
  - `amber`: Warnings, pending approvals, pessimistic locks (`text-amber-400`, `bg-amber-500/10`).
  - `indigo` / `violet`: Primary actions, analytics, system tools (`text-indigo-400`, `bg-indigo-600`).
  - `rose`: Errors, revoked licenses, deductions, critical alerts (`text-rose-400`, `bg-rose-500/10`).

### 1.2 Typography
- Body minimum size: 14px - 16px (`text-sm`, `text-base`).
- Labels & Badges: Single-line uppercase text with letter spacing (`text-[10px] font-bold uppercase tracking-wider`).
- Monospace Data: Used for transaction IDs, SHA-256 hashes, currency amounts, and audit timestamps (`font-mono`).

---

## 2. UI Component Categories (`src/components/ui/`)

| Category | Component | When to Use | Guidelines |
| :--- | :--- | :--- | :--- |
| **Buttons** | `Button` | Triggering actions, submitting forms. | High contrast, padding scales with text, 2x horizontal padding. |
| **Containers** | `Card`, `Panel` | Grouping related business metrics or data tables. | No nested cards inside cards. Border radii capped at 12–16px. |
| **Modals** | `Modal`, `Dialog` | Action workflows (Creating cycles, bonuses, structures). | Backdropped overlay, explicit close buttons, auto-focused input. |
| **Badges & Tags** | `Badge`, `StatusPill` | Displaying statuses (Active, Locked, Pending, Sealed). | Single-line wrapping (`whitespace-nowrap`), distinct state colors. |
| **Data Tables** | `Table`, `DoubleEntryTable` | Ledger entries, payroll line items, employee rosters. | Monospace numeric alignment, zebra striping on hover, sticky headers. |

---

## 3. Responsive & Accessibility Rules

- **Mobile First**: All layouts adapt dynamically using standard Tailwind breakpoints (`sm:`, `md:`, `lg:`, `xl:`).
- **Touch Target**: Touch targets on mobile interfaces must be at least 44px high.
- **Contrast**: All text satisfies WCAG AA contrast standards (> 4.5:1 ratio).
- **Icons**: Exclusively imported from `lucide-react`. Custom SVGs are prohibited.

---

## 4. Internationalization (i18n) & Localized Haiti Operations

To ensure full accessibility across all corporate hierarchies and regional operations, FINOPS ERP implements a custom, high-performance internationalization layer. Because the platform primarily serves business users and staff in Haiti, the system fully supports native localizations alongside global configurations.

### 4.1 Supported Languages & Locale Selection

The system provides live, reactive switching between three key locales:
1. **Français (`fr`)** (Default): The standard corporate and legal language of administration in Haiti.
2. **Kreyòl Ayisyen (`ht`)**: The universally spoken language of Haiti, crucial for frontline employee pointage kiosks and personnel transparency.
3. **English (`en`)**: Supported for global administrative, investor, and audit interfaces.

### 4.2 Translation Engine Architecture (`src/i18n.ts`)

The translation layer is built using **`react-i18next`** and a custom React context to provide synchronous, safe, and thread-safe translations across all sub-modules.

- **Static Translation Schema**: All UI labels, navigation buttons, and system alerts are structured within the comprehensive `TranslationSchema` interface. This ensures full type-safety and eliminates runtime undefined errors when introducing new screens.
- **Dynamic Fallback Dictionary (`globalDictionary`)**: For data or messages produced dynamically at runtime (such as server error logs or audit responses), the system relies on an optimized dynamic lookup dictionary.
- **The `useI18n` and `useTranslate` Hooks**:
  - `useI18n()`: Accesses the active language code, setter, and the current static translation schema (e.g., `const { t, language } = useI18n()`).
  - `useTranslate()`: Resolves a dynamic or raw string safely by referencing the fallback dictionary (e.g., `const translate = useTranslate(); translate("Total Revenue")`).

### 4.3 Haitian Financial and Operational Terminology Guidelines

All localizations must adhere strictly to Haitian tax code, financial regulations, and cultural spelling standards:

| Code / Concept | French Term | Haitian Creole (Kreyòl) Term | English Term |
| :--- | :--- | :--- | :--- |
| **HTG** | HTG (Gourdes) | HTG (Goud) | HTG (Gourdes) |
| **Quinzaine** | Quinzaine | Kinzèn | Bi-Weekly Period |
| **CNSS** | CNSS (Part Patronale/Employé) | CNSS (Pati Patwon/Anplwaye) | CNSS |
| **OFATMA** | OFATMA | OFATMA | OFATMA |
| **Pointage** | Pointage Kiosk | Pwentaj Kiosk | Attendance Kiosk |
| **Grand Livre** | Grand Livre ERP | Gran Liv ERP | Ledger ERP |

