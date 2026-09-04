/**
 * FINOPS ERP — Centralized Mock Service Manager
 * 
 * Manages the lifecycle, conditional execution, and diagnostics of mock services.
 * All mock data generators, kiosk simulators, and dummy event emitters MUST
 * route through this manager to guarantee zero overhead in production.
 */

import { MOCKS_ENABLED, MOCK_LOGS_ENABLED, createMockLogger, MockLogger } from "./mockConfig";

export interface MockServiceDefinition {
  name: string;
  description: string;
  isEnabled: boolean;
}

const SILENT_LOGGER: MockLogger = {
  log: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

export class MockServiceManager {
  private static registeredServices = new Map<string, MockServiceDefinition>();
  private static loggers = new Map<string, MockLogger>();

  /**
   * Check if the global mock environment is enabled
   */
  public static isEnabled(): boolean {
    return MOCKS_ENABLED;
  }

  /**
   * Check if mock logging is enabled
   */
  public static isLogEnabled(): boolean {
    return MOCK_LOGS_ENABLED;
  }

  /**
   * Get or create a scoped logger for a mock service
   */
  public static getLogger(serviceName: string): MockLogger {
    if (!MOCK_LOGS_ENABLED) {
      return SILENT_LOGGER;
    }
    if (!this.loggers.has(serviceName)) {
      this.loggers.set(serviceName, createMockLogger(serviceName));
    }
    return this.loggers.get(serviceName)!;
  }

  /**
   * Register a mock service for diagnostics and telemetry
   */
  public static registerService(name: string, description: string, overrideEnabled?: boolean): void {
    if (!MOCKS_ENABLED) return;
    this.registeredServices.set(name, {
      name,
      description,
      isEnabled: overrideEnabled !== undefined ? (overrideEnabled && MOCKS_ENABLED) : MOCKS_ENABLED,
    });
  }

  /**
   * Conditionally execute a mock routine.
   * If mocks are disabled (e.g. Production), executes nothing and returns fallback.
   */
  public static run<T>(serviceName: string, mockExecutor: (logger: MockLogger) => T, fallback: T): T {
    if (!MOCKS_ENABLED) {
      return fallback;
    }

    const logger = this.getLogger(serviceName);
    try {
      return mockExecutor(logger);
    } catch (err) {
      logger.error("Error executing mock routine:", err);
      return fallback;
    }
  }

  /**
   * Conditionally execute an asynchronous mock routine.
   */
  public static async runAsync<T>(
    serviceName: string,
    mockExecutor: (logger: MockLogger) => Promise<T>,
    fallback: T
  ): Promise<T> {
    if (!MOCKS_ENABLED) {
      return fallback;
    }

    const logger = this.getLogger(serviceName);
    try {
      return await mockExecutor(logger);
    } catch (err) {
      logger.error("Error executing async mock routine:", err);
      return fallback;
    }
  }

  /**
   * Log an event through the mock logger
   */
  public static log(serviceName: string, ...args: any[]): void {
    if (!MOCK_LOGS_ENABLED) return;
    this.getLogger(serviceName).log(...args);
  }

  /**
   * List all registered mock services and their active statuses
   */
  public static getServices(): MockServiceDefinition[] {
    if (!MOCKS_ENABLED) return [];
    return Array.from(this.registeredServices.values());
  }
}
