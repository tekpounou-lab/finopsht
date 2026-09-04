/**
 * FINOPS ERP — Centralized Mock & Simulation Configuration
 * 
 * Defines global flags and logger controls for all mock services, simulators,
 * and demo data generators.
 * 
 * Rules:
 * 1. Production builds (import.meta.env.PROD) ALWAYS have mocks disabled.
 * 2. In development (import.meta.env.DEV), mocks are only enabled if explicitly toggled via VITE_ENABLE_MOCKS === 'true'.
 * 3. In development with mocks enabled, logs are demoted to console.debug (or silenced) to keep the console clean.
 */

// Build-time check for development mode (stripped by bundlers in production)
const IS_DEV_BUILD: boolean = 
  (typeof process !== "undefined" && process.env.NODE_ENV === "development") || 
  Boolean(import.meta.env.DEV);

// Central flag: strictly false in production builds, requiring explicit opt-in in dev
export const MOCKS_ENABLED: boolean = 
  IS_DEV_BUILD && 
  (import.meta.env.VITE_ENABLE_MOCKS === "true" || import.meta.env.REACT_APP_ENABLE_MOCKS === "true");

// Control whether mock logs output to console.debug (strictly false in production)
export const MOCK_LOGS_ENABLED: boolean = 
  MOCKS_ENABLED && 
  IS_DEV_BUILD &&
  (import.meta.env.VITE_MOCK_LOG_LEVEL !== "silent" && import.meta.env.VITE_ENABLE_MOCK_LOGS === "true");

/**
 * Check if mock services are currently active
 */
export function isMockEnabled(): boolean {
  return MOCKS_ENABLED;
}

/**
 * Check if mock logs are allowed (outputs to console.debug)
 */
export function isMockLogEnabled(): boolean {
  return MOCK_LOGS_ENABLED;
}

export interface MockLogger {
  log: (...args: any[]) => void;
  debug: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

/**
 * Creates a scoped mock logger that silences in production and demotes to console.debug in dev.
 */
export function createMockLogger(serviceName: string): MockLogger {
  return {
    log: (...args: any[]) => {
      if (MOCK_LOGS_ENABLED) {
        console.debug(`[Mock:${serviceName}]`, ...args);
      }
    },
    debug: (...args: any[]) => {
      if (MOCK_LOGS_ENABLED) {
        console.debug(`[Mock:${serviceName}]`, ...args);
      }
    },
    warn: (...args: any[]) => {
      if (MOCK_LOGS_ENABLED) {
        console.debug(`[Mock:${serviceName} WARN]`, ...args);
      }
    },
    error: (...args: any[]) => {
      if (MOCK_LOGS_ENABLED) {
        console.debug(`[Mock:${serviceName} ERROR]`, ...args);
      }
    },
  };
}
