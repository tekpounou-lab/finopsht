import { LogSanitizer } from "../security/LogSanitizer";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

type LogLevelString = "debug" | "info" | "warn" | "error" | "silent";

class EnterpriseLogger {
  private currentLevel: LogLevel = LogLevel.INFO;
  private isGlobalRedactorInstalled = false;
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  } | null = null;

  constructor() {
    this.initLogLevel();
  }

  private initLogLevel() {
    let envLevel: string | undefined;

    if (typeof import.meta !== "undefined" && (import.meta as any).env) {
      envLevel = (import.meta as any).env.VITE_LOG_LEVEL;
    } else if (typeof process !== "undefined" && process.env) {
      envLevel = process.env.LOG_LEVEL || process.env.VITE_LOG_LEVEL;
    }

    if (envLevel) {
      this.setLevel(envLevel as LogLevelString);
    } else {
      // Default to INFO in dev, WARN in prod
      const isProd = 
        (typeof process !== "undefined" && process.env?.NODE_ENV === "production") ||
        (typeof import.meta !== "undefined" && (import.meta as any).env?.PROD);
      this.currentLevel = isProd ? LogLevel.WARN : LogLevel.INFO;
    }
  }

  public setLevel(level: LogLevel | LogLevelString) {
    if (typeof level === "string") {
      switch (level.toLowerCase()) {
        case "debug":
          this.currentLevel = LogLevel.DEBUG;
          break;
        case "info":
          this.currentLevel = LogLevel.INFO;
          break;
        case "warn":
          this.currentLevel = LogLevel.WARN;
          break;
        case "error":
          this.currentLevel = LogLevel.ERROR;
          break;
        case "silent":
          this.currentLevel = LogLevel.SILENT;
          break;
        default:
          this.currentLevel = LogLevel.INFO;
      }
    } else {
      this.currentLevel = level;
    }
  }

  public getLevel(): LogLevel {
    return this.currentLevel;
  }

  public debug(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.DEBUG) {
      const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
      const targetConsole = this.originalConsole?.debug || console.debug;
      targetConsole.apply(console, sanitized as [any, ...any[]]);
    }
  }

  public info(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.INFO) {
      const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
      const targetConsole = this.originalConsole?.info || console.info;
      targetConsole.apply(console, sanitized as [any, ...any[]]);
    }
  }

  public warn(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.WARN) {
      const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
      const targetConsole = this.originalConsole?.warn || console.warn;
      targetConsole.apply(console, sanitized as [any, ...any[]]);
    }
  }

  public error(message: string, ...args: any[]) {
    if (this.currentLevel <= LogLevel.ERROR) {
      const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
      const targetConsole = this.originalConsole?.error || console.error;
      targetConsole.apply(console, sanitized as [any, ...any[]]);
    }
  }

  /**
   * Dedicated Security Log Channel for high-auditing events
   */
  public security(eventType: string, details: Record<string, any>) {
    if (this.currentLevel <= LogLevel.INFO) {
      const sanitizedDetails = LogSanitizer.sanitizePayload(details);
      const targetConsole = this.originalConsole?.info || console.info;
      targetConsole.call(
        console,
        `[SECURITY_EVENT] [${eventType}]`,
        sanitizedDetails
      );
    }
  }

  /**
   * Installs global redaction on standard console methods to guarantee zero PII leakage
   * even from 3rd party libraries or legacy code calling console.log directly.
   */
  public installGlobalRedactor() {
    if (this.isGlobalRedactorInstalled || typeof console === "undefined") {
      return;
    }

    this.originalConsole = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      debug: console.debug.bind(console),
    };

    console.debug = (...args: any[]) => {
      if (this.currentLevel <= LogLevel.DEBUG) {
        this.originalConsole?.debug(...LogSanitizer.sanitizeArgs(args));
      }
    };

    console.log = (...args: any[]) => {
      if (this.currentLevel <= LogLevel.INFO) {
        this.originalConsole?.log(...LogSanitizer.sanitizeArgs(args));
      }
    };

    console.info = (...args: any[]) => {
      if (this.currentLevel <= LogLevel.INFO) {
        this.originalConsole?.info(...LogSanitizer.sanitizeArgs(args));
      }
    };

    console.warn = (...args: any[]) => {
      if (this.currentLevel <= LogLevel.WARN) {
        this.originalConsole?.warn(...LogSanitizer.sanitizeArgs(args));
      }
    };

    console.error = (...args: any[]) => {
      if (this.currentLevel <= LogLevel.ERROR) {
        this.originalConsole?.error(...LogSanitizer.sanitizeArgs(args));
      }
    };

    this.isGlobalRedactorInstalled = true;
    this.info("[EnterpriseLogger] Global PII Redaction & Log Level Filter Installed.");
  }
}

export const logger = new EnterpriseLogger();
