/**
 * FINOPS ERP — ESLint Configuration for Strict TypeScript & Schema Integrity
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  rules: {
    // 1. Naming Conventions (camelCase in TS domain, exceptions for system prefixes)
    "@typescript-eslint/naming-convention": [
      "warn",
      {
        selector: "default",
        format: ["camelCase"]
      },
      {
        selector: "variable",
        format: ["camelCase", "UPPER_CASE", "PascalCase"],
        leadingUnderscore: "allow"
      },
      {
        selector: "parameter",
        format: ["camelCase", "PascalCase"],
        leadingUnderscore: "allow"
      },
      {
        selector: "typeLike",
        format: ["PascalCase"]
      },
      {
        selector: "enumMember",
        format: ["UPPER_CASE", "PascalCase"]
      },
      {
        selector: "property",
        format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
        filter: {
          regex: "^(_id|_v|created_at|updated_at|business_id|branch_id|department_id|owner_id|employee_id|cycle_id|debit_account|credit_account|amount_cents|debit_cents|credit_cents)$",
          match: true
        }
      }
    ],

    // 2. Strict Code Quality & Bug Prevention
    "no-duplicate-imports": "error",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  }
};
