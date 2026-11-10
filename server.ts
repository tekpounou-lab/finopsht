import express from "express";
import cors from "cors";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { z } from "zod";

import { AICFOPermissionEngine } from "./src/services/cfo/AICFOPermissionEngine";
import { AICFODataMasking } from "./src/services/cfo/AICFODataMasking";
import { AICFOSecureContextBuilder } from "./src/services/cfo/AICFOSecureContextBuilder";
import { AICFOResponseFilter } from "./src/services/cfo/AICFOResponseFilter";
import { AICFOAuditService } from "./src/services/cfo/AICFOAuditService";
import { IdentityUserContext } from "./src/services/cfo/AICFOGovernanceTypes";
import { FinancialRatioEngine } from "./src/services/cfo/FinancialRatioEngine";
import { getAdminApp, getAdminFirestore } from "./src/lib/firebaseAdmin";
import { ServerProvisioningService } from "./src/services/business/ServerProvisioningService";
import {
  ServerTillProvisioningService,
  TILL_PROVISIONING_AUTHORIZED_ROLES
} from "./src/services/business/ServerTillProvisioningService";
import { TillSessionEngine } from "./src/domains/cash/services/TillSessionEngine";
import { BusinessActivationService } from "./src/services/business/BusinessActivationService";
import { InvitationService, ASSIGNABLE_INVITE_ROLES, INVITE_SENDER_ROLES } from "./src/services/business/InvitationService";
import {
  RECEIVABLE_READ_ROLES as CANONICAL_RECEIVABLE_READ_ROLES,
  RECEIVABLE_APPROVE_ROLES as CANONICAL_RECEIVABLE_APPROVE_ROLES,
  RECEIVABLE_REPAYMENT_ROLES as CANONICAL_RECEIVABLE_REPAYMENT_ROLES,
  resolveReceivableTenantId
} from "./src/services/payroll/EmployeeReceivableService";
import { approvalRouter } from "./src/modules/workflow/approval/serverApprovalRoutes";
import { transferRouter } from "./src/routes/transferRoutes";
import {
  authenticateToken,
  authenticateIdentityOnly,
  requireSuperAdmin,
  AuthenticatedRequest,
  isInvalidTenantId
} from "./src/modules/workflow/approval/serverAuthMiddleware";
import firebaseConfig from "./firebase-applet-config.json";

import crypto from "crypto";
import { LogSanitizer } from "./src/services/security/LogSanitizer";

dotenv.config();

// Server-side Log Level Configuration
const LOG_LEVEL = (process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "warn" : "info")).toLowerCase();
const isDebugEnabled = LOG_LEVEL === "debug";
const isInfoEnabled = LOG_LEVEL === "debug" || LOG_LEVEL === "info";

function serverLog(message: string, ...args: any[]) {
  if (isInfoEnabled) {
    const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
    console.log(...sanitized);
  }
}

function serverWarn(message: string, ...args: any[]) {
  if (LOG_LEVEL !== "silent") {
    const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
    console.warn(...sanitized);
  }
}

function serverError(message: string, ...args: any[]) {
  if (LOG_LEVEL !== "silent") {
    const sanitized = LogSanitizer.sanitizeArgs([message, ...args]);
    console.error(...sanitized);
  }
}

// In-Memory API Rate Limiter
const apiRateLimitMap = new Map<string, number[]>();
function checkRateLimit(ip: string, maxRequests = 120, windowMs = 60000): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const timestamps = (apiRateLimitMap.get(ip) || []).filter(t => t > cutoff);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  apiRateLimitMap.set(ip, timestamps);
  return true;
}

// Initialize Firebase Admin SDK with robust project discovery & service account binding
try {
  getAdminApp();
} catch (e: any) {
  console.error("❌ Firebase Admin initialization failed:", e);
}

// Extract clean, human-readable helper from Gemini API wrapped JSON string
function getCleanErrorMessage(error: any): string {
  if (!error) return "Unknown API Error";
  if (error?.error?.message) return error.error.message;
  const msg = error.message || "";
  if (typeof msg === "string" && msg.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.error?.message) {
        return parsed.error.message;
      }
    } catch (e) {
      // Ignore parsing error
    }
  }
  return typeof error === "string" ? error : (error.message || error.toString());
}

// Exponential backoff retry helper specifically designed to handle rate-limiting (429 / Quota Exhaustion) & 503 Service Unavailable / High Demand
async function executeWithBackoff<T>(
  fn: (modelName?: string) => Promise<T>,
  retries = 2,
  delay = 800,
  fallbackModels: string[] = []
): Promise<T> {
  const currentModel = fallbackModels[0];
  try {
    return await fn(currentModel);
  } catch (error: any) {
    const errorMsg = String(error.message || error).toLowerCase();
    const isTransientError = 
      error.status === 429 || 
      error.statusCode === 429 ||
      error.status === 503 ||
      error.statusCode === 503 ||
      error.status === 500 ||
      error.status === 502 ||
      error.status === 504 ||
      errorMsg.includes("429") || 
      errorMsg.includes("503") ||
      errorMsg.includes("unavailable") ||
      errorMsg.includes("high demand") ||
      errorMsg.includes("temporary") ||
      errorMsg.includes("overloaded") ||
      errorMsg.includes("quota") || 
      errorMsg.includes("exhausted") ||
      errorMsg.includes("rate limit") ||
      errorMsg.includes("too many requests") ||
      errorMsg.includes("try again later");

    const isSpendCap = 
      errorMsg.includes("spending cap") || 
      errorMsg.includes("spend cap") || 
      errorMsg.includes("billing");

    if (isTransientError && !isSpendCap && retries > 0) {
      const nextFallbackModels = fallbackModels.length > 1 ? fallbackModels.slice(1) : fallbackModels;
      console.info(`[Gemini API] Retrying request with model '${nextFallbackModels[0] || 'gemini-2.5-flash'}'... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return executeWithBackoff(fn, retries - 1, Math.round(delay * 1.5), nextFallbackModels);
    }
    throw error;
  }
}

// Initialize server-side Gemini client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("⚠️ Warning: GEMINI_API_KEY environment variable is not set. AI CFO will fall back to rule-based mock insights.");
}

// Zod Schema to validate Gemini AI CFO Response
const cfoResponseSchema = z.object({
  summary: z.string(),
  metrics: z.object({
    cash_flow: z.string(),
    fraud_risk: z.string(),
    profit_ratio: z.string(),
    financial_health_score: z.number().min(0).max(100)
  }),
  alerts: z.array(z.object({
    type: z.enum(["info", "warning", "success"]),
    text: z.string()
  })),
  recommendations: z.array(z.string())
});

const cfoGeminiSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    metrics: {
      type: Type.OBJECT,
      properties: {
        cash_flow: { type: Type.STRING },
        fraud_risk: { type: Type.STRING },
        profit_ratio: { type: Type.STRING },
        financial_health_score: { type: Type.NUMBER }
      },
      required: ["cash_flow", "fraud_risk", "profit_ratio", "financial_health_score"]
    },
    alerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["info", "warning", "success"] },
          text: { type: Type.STRING }
        },
        required: ["type", "text"]
      }
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: [
    "summary",
    "metrics",
    "alerts",
    "recommendations"
  ]
};

// Robust defensive JSON repair helper
function repairJsonString(jsonStr: string): string {
  let cleaned = jsonStr.trim();
  
  // Remove markdown block wraps if any
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();

  // 1. Remove trailing commas in objects and arrays
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  // 2. Fix missing double-quotes around keys if generated loosely
  cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

  // 3. Add missing commas between properties
  cleaned = cleaned.replace(/"\s+(?="[a-zA-Z0-9_]+":)/g, '", ');

  return cleaned;
}

export async function createApp() {
  const app = express();

  // CORS configuration to allow requests from localhost, cloud run, and production domains
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, mobile, curl)
      if (!origin) return callback(null, true);
      
      const isAllowed = 
        origin.includes("localhost") || 
        origin.includes("127.0.0.1") || 
        origin.includes(".run.app") || 
        origin.includes(".web.app") || 
        origin.includes(".firebaseapp.com") ||
        origin.includes(".vercel.app") ||
        origin.includes("ai.studio");

      if (isAllowed) {
        callback(null, true);
      } else {
        // Fallback for custom tenant domains
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "X-Requested-With", 
      "X-CSRF-Token",
      "X-Client-Session-Id",
      "x-business-id", 
      "x-correlation-id",
      "x-client-version"
    ]
  }));

  // Handle explicit preflight requests
  app.options("*", cors());

  // Security HTTP Headers Middleware (Enterprise Grade)
  app.use((req, res, next) => {
    // 1. Content Security Policy (permitting AI Studio & Cloud Run iframe embedding and direct preview)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https: wss:; frame-ancestors 'self' https://aistudio.google.com https://*.google.com https://*.googleusercontent.com https://ai.studio https://*.run.app https://*.web.app https://*.cloud.google.com; object-src 'none'; base-uri 'self';"
    );
    // 2. MIME Sniffing Protection
    res.setHeader("X-Content-Type-Options", "nosniff");
    // 3. XSS Protection
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // 4. Referrer Policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // 5. Device Permissions Policy
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");

    // 6. Secure Session Cookie
    const sessionId = req.headers["x-client-session-id"] || crypto.randomBytes(16).toString("hex");
    res.setHeader("Set-Cookie", `finops_sess=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Partitioned`);

    next();
  });

  // Server-Side Request Sanitization & Rate Limiting Middleware
  app.use("/api", (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress || "unknown_ip";
    
    // Check rate limit (120 reqs/min)
    if (!checkRateLimit(clientIp, 120, 60000)) {
      serverWarn(`[RateLimiter] IP ${clientIp} exceeded rate limit on ${req.originalUrl}`);
      return res.status(429).json({ error: "Too many requests. Please try again in a moment." });
    }

    if (isDebugEnabled) {
      serverLog(`[API Request] ${req.method} ${req.originalUrl} from IP: ${clientIp}`);
    }

    next();
  });

  // Parse JSON payloads with generous limit to avoid PayloadTooLargeError for large ERP database datasets
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ limit: "100mb", extended: true }));

  // Anti-CSRF Token Generation & Handshake Endpoint
  app.get("/api/auth/csrf-token", (req, res) => {
    const csrfToken = crypto.randomBytes(32).toString("hex");
    res.setHeader("X-CSRF-Token", csrfToken);
    res.json({ csrfToken, timestamp: new Date().toISOString() });
  });

  // Anti-CSRF Protection Middleware for State-Changing Requests
  app.use("/api", (req, res, next) => {
    const method = req.method.toUpperCase();
    const isStateChanging = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

    if (isStateChanging) {
      const clientCsrfToken = req.headers["x-csrf-token"];
      const requestedWith = req.headers["x-requested-with"];
      const hasCookieSession = Boolean(req.headers.cookie);

      // Verify presence of anti-CSRF or AJAX token when a cookie session is present
      if (hasCookieSession && !clientCsrfToken && !requestedWith && !req.headers["authorization"]) {
        serverWarn(`[CSRF Protection] State-changing ${method} request to ${req.originalUrl} rejected: missing CSRF token`);
        return res.status(403).json({ error: "Invalid or missing anti-CSRF security token." });
      }

      // Rotate token on successful validation
      const rotatedCsrfToken = crypto.randomBytes(32).toString("hex");
      res.setHeader("X-CSRF-Token", rotatedCsrfToken);
    }

    next();
  });

  // API endpoint: Event Orchestrator Handler
  app.post("/api/orchestrator", async (req, res) => {
    try {
      const { event } = req.body || {};
      console.log(`[Server Orchestrator API] Received event: ${event || "PING"}`);
      res.json({
        success: true,
        received: true,
        event: event || "PING",
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Server Orchestrator API] Error:", err);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to process orchestrator event."
      });
    }
  });

  // API endpoint: Telemetry Ingestor Handler
  app.post("/api/telemetry", async (req, res) => {
    try {
      const telemetryData = req.body || {};
      res.json({
        success: true,
        received: true,
        count: Array.isArray(telemetryData) ? telemetryData.length : 1,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Server Telemetry API] Error:", err);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to process telemetry."
      });
    }
  });

  // API endpoint: Status checks
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      offlineReady: true,
      service: "FinOps Enterprise ERP Engine",
    });
  });

  function resolveServerRouteTenant(
    req: AuthenticatedRequest,
    res: express.Response,
    explicitBizId?: string
  ): string | null {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
      return null;
    }

    const explicitStr = typeof explicitBizId === "string" ? explicitBizId.trim() : "";
    const bodyBizCamel = typeof req.body?.businessId === "string" ? req.body.businessId.trim() : "";
    const bodyBizSnake = typeof req.body?.business_id === "string" ? req.body.business_id.trim() : "";
    const queryBizCamel = typeof req.query?.businessId === "string" ? req.query.businessId.trim() : "";
    const queryBizSnake = typeof req.query?.business_id === "string" ? req.query.business_id.trim() : "";
    const headerBizRaw = req.headers["x-business-id"];
    const headerBiz = typeof headerBizRaw === "string" ? headerBizRaw.trim() : "";

    const providedTenants = [
      explicitStr,
      bodyBizCamel,
      bodyBizSnake,
      queryBizCamel,
      queryBizSnake,
      headerBiz
    ].filter(Boolean);

    if (providedTenants.length > 1) {
      const uniqueTenants = new Set(providedTenants);
      if (uniqueTenants.size > 1) {
        res.status(403).json({
          error: "FORBIDDEN_TENANT_ACCESS",
          message: "Contradictory tenant identifiers (businessId vs business_id or header) in request."
        });
        return null;
      }
    }

    const requestedBizId = providedTenants[0] || "";

    if (user.isSuperAdmin) {
      const targetBiz = requestedBizId || user.business_id || "";
      if (!targetBiz || isInvalidTenantId(targetBiz)) {
        res.status(400).json({
          error: "MISSING_TENANT_CONTEXT",
          message: "SuperAdmin must specify a valid target businessId."
        });
        return null;
      }
      return targetBiz;
    }

    if (requestedBizId && requestedBizId !== user.business_id) {
      res.status(403).json({
        error: "FORBIDDEN_TENANT_ACCESS",
        message: "Client is not authorized to operate on another tenant."
      });
      return null;
    }

    if (!user.business_id || isInvalidTenantId(user.business_id)) {
      res.status(403).json({
        error: "TENANT_BINDING_REQUIRED",
        message: "No verified business/tenant association found for this user."
      });
      return null;
    }

    return user.business_id;
  }

  const MAINTENANCE_ADMIN_ROLES = new Set(["OWNER", "ADMIN", "SUPER_ADMIN"]);
  const INTEGRITY_VALIDATION_ROLES = new Set([
    "OWNER",
    "ADMIN",
    "MANAGER",
    "ACCOUNTANT",
    "FINANCE",
    "HEAD_TELLER",
    "AUDITOR",
    "SUPER_ADMIN"
  ]);
  const RECEIVABLE_READ_ROLES = new Set<string>(CANONICAL_RECEIVABLE_READ_ROLES);
  const RECEIVABLE_APPROVE_ROLES = new Set<string>(CANONICAL_RECEIVABLE_APPROVE_ROLES);
  const RECEIVABLE_REPAYMENT_ROLES = new Set<string>(CANONICAL_RECEIVABLE_REPAYMENT_ROLES);

  // API endpoint: Snapshot Retention Pruning (Scheduled Cron / Cloud Function endpoint)
  // Prunes snapshots older than 30 days across metric_snapshots and performance collections
  app.post("/api/maintenance/prune-snapshots", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const businessId = resolveServerRouteTenant(req, res, req.body?.businessId);
      if (!businessId) return;

      const userRole = (req.user!.role || "").toUpperCase();
      if (!req.user!.isSuperAdmin && !MAINTENANCE_ADMIN_ROLES.has(userRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE",
          message: "Only tenant Owners/Admins or SuperAdmins can prune snapshots."
        });
      }

      const rawRetention = req.body?.retentionDays;
      const retentionDays =
        rawRetention !== undefined ? Number(rawRetention) : 30;
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
        return res.status(400).json({
          error: "INVALID_RETENTION_DAYS",
          message: "retentionDays must be a valid integer between 1 and 3650."
        });
      }

      const { SnapshotRetentionManager } = await import("./src/services/business/snapshot/SnapshotRetentionManager");
      const adminFirestore = getAdminFirestore();
      const result = await SnapshotRetentionManager.getInstance().purgeExpiredSnapshots(
        businessId,
        {
          retentionDays,
          dailyRetentionDays: retentionDays,
          weeklyRetentionDays: 90
        },
        adminFirestore
      );

      console.log(`[Maintenance API] Snapshot purge completed for ${businessId}:`, result);
      res.json({
        success: true,
        businessId,
        message: `Purged snapshots older than ${retentionDays} days`,
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Maintenance API] Snapshot prune error:", err);
      const code = err?.code || err?.message || "";
      if (code === "TENANT_ISOLATION_VIOLATION") {
        return res.status(403).json({
          error: "TENANT_ISOLATION_VIOLATION",
          message: "Tenant isolation violation detected during snapshot purge."
        });
      }
      if (code === "MISSING_TENANT_CONTEXT") {
        return res.status(400).json({
          error: "MISSING_TENANT_CONTEXT",
          message: "Valid businessId is required."
        });
      }
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to prune snapshots."
      });
    }
  });

  // API endpoint: SSOT Data Redundancy Cleanup Migration (Phase 1.2)
  app.post("/api/maintenance/ssot-cleanup", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const businessId = resolveServerRouteTenant(req, res, req.body?.businessId);
      if (!businessId) return;

      const userRole = (req.user!.role || "").toUpperCase();
      if (!req.user!.isSuperAdmin && !MAINTENANCE_ADMIN_ROLES.has(userRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE",
          message: "Only tenant Owners/Admins or SuperAdmins can run SSOT cleanup."
        });
      }

      const { DataCleanupAndSSOTService } = await import("./src/services/business/DataCleanupAndSSOTService");
      const adminFirestore = getAdminFirestore();
      const summary = await DataCleanupAndSSOTService.getInstance().runSSOTCleanupMigration(
        businessId,
        adminFirestore
      );

      console.log(`[Maintenance API] SSOT cleanup completed for ${businessId}:`, summary);
      res.json({
        success: true,
        summary
      });
    } catch (err: any) {
      console.error("[Maintenance API] SSOT cleanup error:", err);
      const code = err?.code || err?.message || "";
      if (code === "TENANT_ISOLATION_VIOLATION") {
        return res.status(403).json({
          error: "TENANT_ISOLATION_VIOLATION",
          message: "Tenant isolation violation detected during SSOT cleanup."
        });
      }
      if (code === "MISSING_TENANT_CONTEXT") {
        return res.status(400).json({
          error: "MISSING_TENANT_CONTEXT",
          message: "Valid businessId is required."
        });
      }
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to execute SSOT cleanup."
      });
    }
  });

  // API endpoint: Referential & Foreign Key Integrity Validator (Phase 2.2 Trigger & Scan)
  app.post("/api/integrity/validate-foreign-keys", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const businessId = resolveServerRouteTenant(req, res, req.body?.businessId);
      if (!businessId) return;

      const userRole = (req.user!.role || "").toUpperCase();
      if (!req.user!.isSuperAdmin && !INTEGRITY_VALIDATION_ROLES.has(userRole)) {
        return res.status(403).json({
          valid: false,
          error: "FORBIDDEN_ROLE",
          message: "Your role is not authorized to run referential integrity checks."
        });
      }

      const { entityType, entityData } = req.body || {};
      if (!entityType || typeof entityType !== "string" || !entityData || typeof entityData !== "object") {
        return res.status(400).json({
          valid: false,
          error: "INVALID_INTEGRITY_PAYLOAD",
          message: "Both entityType (string) and entityData (object) are required when validating an entity."
        });
      }

      const entityBiz1 = typeof entityData.businessId === "string" ? entityData.businessId.trim() : "";
      const entityBiz2 = typeof entityData.business_id === "string" ? entityData.business_id.trim() : "";
      if (entityBiz1 && entityBiz2 && entityBiz1 !== entityBiz2) {
        return res.status(403).json({
          valid: false,
          error: "FORBIDDEN_TENANT_ACCESS",
          message: "Contradictory businessId and business_id on entityData."
        });
      }

      const entityBiz = entityBiz1 || entityBiz2;
      if (entityBiz && entityBiz !== businessId) {
        return res.status(403).json({
          valid: false,
          error: "FORBIDDEN_TENANT_ACCESS",
          message: "Entity businessId does not match authorized tenant."
        });
      }

      const { IntegrityValidator } = await import("./src/services/integrity/ForeignKeyIntegrityValidator");
      const adminFirestore = getAdminFirestore();
      await IntegrityValidator.validateEntityForeignKeys(businessId, entityData, entityType, adminFirestore);

      return res.json({
        valid: true,
        businessId,
        entityType,
        message: "Foreign key referential constraints satisfied."
      });
    } catch (err: any) {
      console.error("[Integrity API] Foreign key integrity violation:", err);
      if (err?.code === "FORBIDDEN_TENANT_ACCESS") {
        return res.status(403).json({
          valid: false,
          error: "FORBIDDEN_TENANT_ACCESS",
          code: "FORBIDDEN_TENANT_ACCESS",
          message: "Cross-tenant foreign key reference is forbidden.",
          fieldName: err.fieldName,
          missingId: err.missingId,
          referencedCollection: err.referencedCollection
        });
      }
      if (
        err?.name === "ForeignKeyIntegrityViolationError" ||
        err?.code === "FOREIGN_KEY_INTEGRITY_VIOLATION"
      ) {
        return res.status(400).json({
          valid: false,
          error: "FOREIGN_KEY_VIOLATION",
          code: err.code || "FOREIGN_KEY_VIOLATION",
          message: "Referential integrity constraint failed.",
          fieldName: err.fieldName,
          missingId: err.missingId,
          referencedCollection: err.referencedCollection
        });
      }
      res.status(500).json({
        valid: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to validate referential integrity."
      });
    }
  });

  // API endpoint: Phase 6A Approval Gateway
  app.use("/api/approvals", approvalRouter);

  // API endpoints: Phase 3 Transfer Intake & Payout Gateway & Forensic Verification
  app.use("/api/cash/transfers", transferRouter);
  app.use("/api/audit", transferRouter);

  // API endpoint: Phase D2 — Controlled Server-Side Auto-Provisioning of Tills & Safes (Firebase Admin SDK)
  app.post("/api/cash/tills/auto-provision", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      const body = req.body || {};
      if (
        (body.businessId !== undefined && typeof body.businessId !== "string") ||
        (body.business_id !== undefined && typeof body.business_id !== "string")
      ) {
        return res.status(400).json({
          success: false,
          error: "INVALID_PROVISIONING_PARAMS",
          message: "businessId and business_id must be valid strings when provided."
        });
      }

      if (
        (body.actorUid && body.actorUid !== req.user.uid) ||
        (body.userId && body.userId !== req.user.uid) ||
        (body.actor?.uid && body.actor.uid !== req.user.uid)
      ) {
        return res.status(403).json({
          success: false,
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "Actor UID must match the authenticated user."
        });
      }

      const businessId = resolveServerRouteTenant(req, res, body.businessId);
      if (!businessId) return;

      const userRole = (req.user.role || "").trim().toUpperCase();
      if (!req.user.isSuperAdmin && !TILL_PROVISIONING_AUTHORIZED_ROLES.has(userRole)) {
        return res.status(403).json({
          success: false,
          error: "FORBIDDEN_ROLE",
          message: "Your role is not authorized to auto-provision tills."
        });
      }

      const actor = {
        uid: req.user.uid,
        email: req.user.email || "",
        name: req.user.email || req.user.uid,
        role: req.user.isSuperAdmin ? "SUPER_ADMIN" : userRole,
        business_id: businessId,
        isSuperAdmin: Boolean(req.user.isSuperAdmin)
      };

      const result = await ServerTillProvisioningService.autoProvisionTillsForBusiness(
        businessId,
        actor,
        {
          branchId: body.branchId,
          initialEmployees: body.initialEmployees,
          requestedTillIds: body.requestedTillIds,
          requestedSafeIds: body.requestedSafeIds
        }
      );

      serverLog(
        `[Cash Provisioning API] Auto-provisioned tills for ${businessId}: created=${result.tillsCreated}, existing=${result.existingTillsCount}`
      );

      return res.json({
        success: true,
        businessId,
        ...result
      });
    } catch (error: any) {
      serverError("[Cash Provisioning API] Error:", error);
      const code = error?.code || error?.message || "";
      if (code === "UNAUTHORIZED") {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }
      if (
        code === "FORBIDDEN_ROLE" ||
        code === "FORBIDDEN_TENANT_ACCESS" ||
        code === "TENANT_OVERWRITE_FORBIDDEN" ||
        code === "TENANT_ISOLATION_VIOLATION" ||
        code === "IDENTITY_SPOOFING_DETECTED"
      ) {
        return res.status(403).json({
          success: false,
          error: code,
          code,
          message:
            code === "FORBIDDEN_ROLE"
              ? "Your role is not authorized to auto-provision tills."
              : code === "TENANT_OVERWRITE_FORBIDDEN"
              ? "Target till or safe identifier is already bound to another tenant."
              : "Cross-tenant till provisioning is forbidden."
        });
      }
      if (
        code === "INVALID_BUSINESS_ID" ||
        code === "INVALID_PROVISIONING_PARAMS" ||
        code === "MALFORMED_EXISTING_DOCUMENT" ||
        code === "MISSING_ACCOUNT_MAPPING" ||
        code === "CURRENCY_ACCOUNT_MISMATCH" ||
        code === "INVALID_SAFE_ACCOUNT"
      ) {
        return res.status(400).json({
          success: false,
          error: code,
          code,
          message: "Invalid or malformed till provisioning parameters."
        });
      }
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to auto-provision tills."
      });
    }
  });

  // API endpoint: Transactional Server-Side Till Session Closure (Phase D3 / D3.1)
  app.post("/api/cash/sessions/close", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    let resolvedBusinessId: string | null = null;
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      if (
        (body.businessId !== undefined && typeof body.businessId !== "string") ||
        (body.business_id !== undefined && typeof body.business_id !== "string")
      ) {
        return res.status(400).json({
          success: false,
          error: "INVALID_BUSINESS_ID",
          message: "businessId and business_id must be valid strings when provided."
        });
      }

      const businessId = resolveServerRouteTenant(req, res, body.businessId);
      if (!businessId) return;
      resolvedBusinessId = businessId;

      const userRole = (req.user.role || "").trim().toUpperCase();
      const effectiveRole = req.user.isSuperAdmin ? "SUPER_ADMIN" : userRole;

      // D3.1-A: Strict operator identity enforcement — never trust client-supplied operatorId
      if (
        body.operatorId !== undefined &&
        body.operatorId !== null &&
        (typeof body.operatorId !== "string" ||
          (body.operatorId.trim() !== "" && body.operatorId.trim() !== req.user.uid))
      ) {
        await TillSessionEngine.recordAdminForensicEvent(getAdminFirestore(), {
          businessId,
          actorId: req.user.uid,
          actorName: req.user.email || req.user.uid,
          actorRole: effectiveRole,
          action: "TILL_SESSION_CLOSE_REFUSED",
          sessionId: typeof body.sessionId === "string" ? body.sessionId : "UNKNOWN",
          tillId: typeof body.tillId === "string" ? body.tillId : undefined,
          result: "REFUSED",
          errorCode: "IDENTITY_SPOOFING_DETECTED",
          details: `Tentative d'usurpation d'identité bloquée sur /api/cash/sessions/close : operatorId fourni (${String(body.operatorId)}) différent de req.user.uid (${req.user.uid}).`
        });
        return res.status(403).json({
          success: false,
          error: "IDENTITY_SPOOFING_DETECTED",
          code: "IDENTITY_SPOOFING_DETECTED",
          message: "operatorId must match the authenticated user."
        });
      }

      const operatorId = req.user.uid;
      const operatorName =
        typeof body.operatorName === "string" && body.operatorName.trim()
          ? body.operatorName.trim()
          : req.user.email || req.user.uid;

      const adminDb = getAdminFirestore();
      const result = await TillSessionEngine.closeSessionWithAdmin(adminDb, {
        sessionId: body.sessionId,
        tillId: body.tillId,
        businessId,
        currency: body.currency,
        actualClosingCents: body.actualClosingCents,
        denominationBreakdown: body.denominationBreakdown,
        operatorId,
        operatorName,
        operatorRole: effectiveRole,
        authenticatedUid: req.user.uid,
        notes: body.notes,
        idempotencyKey: body.idempotencyKey
      });

      return res.json({
        success: true,
        businessId,
        ...result
      });
    } catch (error: any) {
      serverError("[Cash Session Close API] Error:", error);
      const code = error?.code || "";
      if (
        req.user &&
        (code === "TENANT_ISOLATION_VIOLATION" ||
          code === "FORBIDDEN_TENANT_ACCESS" ||
          code === "FORBIDDEN_ROLE" ||
          code === "UNAUTHORIZED_SESSION_OPERATOR" ||
          code === "IDENTITY_SPOOFING_DETECTED")
      ) {
        await TillSessionEngine.recordAdminForensicEvent(getAdminFirestore(), {
          businessId: resolvedBusinessId || req.user.business_id || "UNKNOWN",
          actorId: req.user.uid,
          actorName: req.user.email || req.user.uid,
          actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : (req.user.role || "USER").trim().toUpperCase(),
          action: "TILL_SESSION_CLOSE_REFUSED",
          sessionId: typeof body.sessionId === "string" ? body.sessionId : "UNKNOWN",
          tillId: typeof body.tillId === "string" ? body.tillId : undefined,
          result: "REFUSED",
          errorCode: code,
          details: `Refus de sécurité lors de la clôture de session [${String(body.sessionId || "UNKNOWN")}] (${code}).`
        });
      }
      if (code === "SESSION_NOT_FOUND" || code === "TILL_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          error: code,
          code,
          message: "Requested till session or till does not exist."
        });
      }
      if (
        code === "TENANT_ISOLATION_VIOLATION" ||
        code === "FORBIDDEN_TENANT_ACCESS" ||
        code === "FORBIDDEN_ROLE" ||
        code === "UNAUTHORIZED_SESSION_OPERATOR" ||
        code === "IDENTITY_SPOOFING_DETECTED"
      ) {
        return res.status(403).json({
          success: false,
          error: code,
          code,
          message: "Forbidden session closure operation."
        });
      }
      if (
        code === "SESSION_ALREADY_CLOSED" ||
        code === "SESSION_NOT_ACTIVE" ||
        code === "TILL_NOT_OPEN" ||
        code === "ACTIVE_SESSION_MISMATCH" ||
        code === "DUPLICATE_VARIANCE_GL_ENTRY" ||
        code === "PENDING_TRANSFERS_BLOCKADE" ||
        code === "CONCURRENT_CLOSURE_CONFLICT" ||
        code === "TILL_BALANCE_DIVERGENCE"
      ) {
        return res.status(409).json({
          success: false,
          error: code,
          code,
          message: "Session closure conflict or pending operations detected."
        });
      }
      if (
        code === "INVALID_SESSION_ID" ||
        code === "INVALID_CLOSING_AMOUNT" ||
        code === "INVALID_DENOMINATION_BREAKDOWN" ||
        code === "INVALID_DENOMINATION" ||
        code === "INVALID_DENOMINATION_COUNT" ||
        code === "DENOMINATION_TOTAL_MISMATCH" ||
        code === "CURRENCY_MISMATCH" ||
        code === "CURRENCY_ACCOUNT_MISMATCH" ||
        code === "UNSUPPORTED_CURRENCY" ||
        code === "VARIANCE_JUSTIFICATION_REQUIRED" ||
        code === "SESSION_TILL_MISMATCH" ||
        code === "MALFORMED_SESSION_TENANT" ||
        code === "INVALID_OPENING_BALANCE" ||
        code === "CORRUPT_MOVEMENT_AMOUNT" ||
        code === "INVALID_MOVEMENT_FLOW" ||
        code === "NEGATIVE_EXPECTED_BALANCE" ||
        code === "INVALID_TILL_BALANCE" ||
        code === "INVALID_VARIANCE_LEDGER_ENTRY"
      ) {
        return res.status(400).json({
          success: false,
          error: code,
          code,
          message: "Invalid or inconsistent session closure parameters."
        });
      }
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to close till session."
      });
    }
  });

  // API endpoint: Transactional Server-Side Till Session Reopen (Phase D3 / D3.1)
  app.post("/api/cash/sessions/reopen", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    let resolvedBusinessId: string | null = null;
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "UNAUTHORIZED",
          message: "Authentication required."
        });
      }

      if (
        (body.businessId !== undefined && typeof body.businessId !== "string") ||
        (body.business_id !== undefined && typeof body.business_id !== "string")
      ) {
        return res.status(400).json({
          success: false,
          error: "INVALID_BUSINESS_ID",
          message: "businessId and business_id must be valid strings when provided."
        });
      }

      const businessId = resolveServerRouteTenant(req, res, body.businessId);
      if (!businessId) return;
      resolvedBusinessId = businessId;

      const userRole = (req.user.role || "").trim().toUpperCase();
      const effectiveRole = req.user.isSuperAdmin ? "SUPER_ADMIN" : userRole;

      if (
        body.approverId !== undefined &&
        body.approverId !== null &&
        (typeof body.approverId !== "string" ||
          (body.approverId.trim() !== "" && body.approverId.trim() !== req.user.uid))
      ) {
        await TillSessionEngine.recordAdminForensicEvent(getAdminFirestore(), {
          businessId,
          actorId: req.user.uid,
          actorName: req.user.email || req.user.uid,
          actorRole: effectiveRole,
          action: "TILL_SESSION_REOPEN_REFUSED",
          sessionId: typeof body.previousSessionId === "string" ? body.previousSessionId : "UNKNOWN",
          tillId: typeof body.tillId === "string" ? body.tillId : undefined,
          result: "REFUSED",
          errorCode: "IDENTITY_SPOOFING_DETECTED",
          details: `Tentative d'usurpation d'identité bloquée sur /api/cash/sessions/reopen : approverId fourni (${String(body.approverId)}) différent de req.user.uid (${req.user.uid}).`
        });
        return res.status(403).json({
          success: false,
          error: "IDENTITY_SPOOFING_DETECTED",
          code: "IDENTITY_SPOOFING_DETECTED",
          message: "approverId must match the authenticated user."
        });
      }

      const adminDb = getAdminFirestore();
      const result = await TillSessionEngine.reopenSessionWithAdmin(adminDb, {
        tillId: body.tillId,
        previousSessionId: body.previousSessionId,
        businessId,
        requesterId: body.requesterId,
        requesterName: body.requesterName,
        approverId: req.user.uid,
        approverName: body.approverName || req.user.email || req.user.uid,
        approverRole: effectiveRole,
        authenticatedApproverUid: req.user.uid,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey
      });

      return res.json({
        success: true,
        businessId,
        ...result
      });
    } catch (error: any) {
      serverError("[Cash Session Reopen API] Error:", error);
      const code = error?.code || "";
      if (req.user && code) {
        await TillSessionEngine.recordAdminForensicEvent(getAdminFirestore(), {
          businessId: resolvedBusinessId || req.user.business_id || "UNKNOWN",
          actorId: req.user.uid,
          actorName: req.user.email || req.user.uid,
          actorRole: req.user.isSuperAdmin ? "SUPER_ADMIN" : (req.user.role || "USER").trim().toUpperCase(),
          action: "TILL_SESSION_REOPEN_REFUSED",
          sessionId: typeof body.previousSessionId === "string" ? body.previousSessionId : "UNKNOWN",
          tillId: typeof body.tillId === "string" ? body.tillId : undefined,
          result: "REFUSED",
          errorCode: code,
          details: `Refus lors de la tentative de réouverture de la session [${String(body.previousSessionId || "UNKNOWN")}] (${code}).`
        });
      }
      if (
        code === "TILL_NOT_FOUND" ||
        code === "PREVIOUS_SESSION_NOT_FOUND" ||
        code === "REQUESTER_NOT_FOUND"
      ) {
        return res.status(404).json({
          success: false,
          error: code,
          code,
          message: "Requested till, previous session, or requester does not exist."
        });
      }
      if (
        code === "TENANT_ISOLATION_VIOLATION" ||
        code === "FORBIDDEN_TENANT_ACCESS" ||
        code === "UNAUTHORIZED_APPROVER" ||
        code === "MAKER_CHECKER_VIOLATION" ||
        code === "IDENTITY_SPOOFING_DETECTED" ||
        code === "INACTIVE_REQUESTER" ||
        code === "UNAUTHORIZED_REQUESTER_ROLE"
      ) {
        return res.status(403).json({
          success: false,
          error: code,
          code,
          message: "Forbidden session reopen operation."
        });
      }
      if (
        code === "SESSION_ALREADY_REOPENED" ||
        code === "SESSION_NOT_CLOSED" ||
        code === "TILL_ALREADY_OPEN" ||
        code === "CONCURRENT_CLOSURE_CONFLICT"
      ) {
        return res.status(409).json({
          success: false,
          error: code,
          code,
          message: "Session cannot be reopened in its current state."
        });
      }
      if (
        code === "INVALID_TILL_ID" ||
        code === "INVALID_SESSION_ID" ||
        code === "INVALID_REQUESTER_ID" ||
        code === "REOPEN_REASON_REQUIRED" ||
        code === "SESSION_TILL_MISMATCH"
      ) {
        return res.status(400).json({
          success: false,
          error: code,
          code,
          message: "Invalid session reopen parameters."
        });
      }
      return res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to reopen till session."
      });
    }
  });

  // API endpoint: Enterprise Provisioning (Bypasses rules, updates claims)
  app.post("/api/provisioning/create-business", authenticateIdentityOnly, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
      }

      const { founder, businessName, options } = req.body || {};
      if (!businessName || !String(businessName).trim()) {
        return res.status(400).json({ error: "INVALID_REQUEST", message: "Missing business name." });
      }

      // Reject spoofing of founder UID or email
      if (founder?.uid && founder.uid !== req.user.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "founder.uid must match the authenticated user."
        });
      }

      const tokenEmail = (req.user.email || "").toLowerCase().trim();
      const bodyEmail = (founder?.email || "").toLowerCase().trim();
      if (tokenEmail && bodyEmail && tokenEmail !== bodyEmail) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "founder.email must match the authenticated user email."
        });
      }

      // Prevent users already bound to an active tenant (via Custom Claims or Firestore) from provisioning a second tenant (D1.1-R-02)
      const targetBizId =
        typeof options?.businessId === "string" && options.businessId.trim()
          ? options.businessId.trim()
          : `biz_${req.user.uid}`;

      if (
        req.user.business_id &&
        !isInvalidTenantId(req.user.business_id) &&
        !req.user.isSuperAdmin &&
        targetBizId !== req.user.business_id
      ) {
        return res.status(403).json({
          error: "USER_ALREADY_BOUND_TO_TENANT",
          message: "Authenticated user is already bound to another tenant."
        });
      }

      const verifiedFounder = {
        uid: req.user.uid,
        email: tokenEmail || bodyEmail,
        name: founder?.name || tokenEmail.split("@")[0] || "Propriétaire",
        existingBusinessId: req.user.business_id,
        isSuperAdmin: req.user.isSuperAdmin
      };

      if (!verifiedFounder.email) {
        return res.status(400).json({
          error: "MISSING_FOUNDER_EMAIL",
          message: "A valid founder email is required."
        });
      }

      // Perform atomic server provisioning
      const result = await ServerProvisioningService.provision(
        verifiedFounder,
        String(businessName).trim(),
        options || {}
      );

      console.log(`[Provisioning API] Successfully provisioned business ${result.businessId} for user ${verifiedFounder.uid}`);

      res.json({
        success: true,
        businessId: result.businessId,
        employeeId: result.employeeId
      });
    } catch (error: any) {
      console.error("[Provisioning API] Error:", error);
      const msg = error?.message || "";
      if (
        msg === "TENANT_OVERWRITE_FORBIDDEN" ||
        msg === "USER_ALREADY_BOUND_TO_TENANT"
      ) {
        return res.status(403).json({ error: msg, code: msg });
      }
      if (msg === "BUSINESS_ALREADY_EXISTS") {
        return res.status(409).json({ error: msg, code: msg });
      }
      if (msg === "INVALID_BUSINESS_ID" || msg === "INVALID_PROVISIONING_PARAMS") {
        return res.status(400).json({ error: msg, code: msg });
      }
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        code: "INTERNAL_ERROR",
        message: "Failed to provision business."
      });
    }
  });

  // API endpoint: Business Activation (Phase 2 - Superadmin Only)
  app.post("/api/provisioning/activate-business", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { businessId } = req.body || {};
      if (!businessId) {
        return res.status(400).json({ error: "Missing businessId" });
      }
      
      // Enforce actor identity EXCLUSIVELY from verified Bearer token
      const actor = {
        uid: req.user!.uid,
        email: req.user!.email || ""
      };

      await BusinessActivationService.activate(businessId, actor);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Activation API] Error:", error);
      res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "Failed to activate business."
      });
    }
  });

  // API endpoint: Send Colleague Invitation
  app.post("/api/invitations/send", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
      }

      const { businessId: bodyBizId, email, role, sender } = req.body || {};
      if (sender?.uid && sender.uid !== req.user.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "sender.uid must match the authenticated user."
        });
      }

      const businessId = resolveServerRouteTenant(req, res, bodyBizId);
      if (!businessId) return;

      const senderRole = (req.user.role || "").trim().toUpperCase();
      if (!req.user.isSuperAdmin && !INVITE_SENDER_ROLES.has(senderRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE",
          message: "Your role is not authorized to send invitations."
        });
      }

      const targetRole = (role || "EMPLOYEE").trim().toUpperCase();
      if (targetRole === "SUPER_ADMIN" || !ASSIGNABLE_INVITE_ROLES.has(targetRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE_ASSIGNMENT",
          message: "Cannot assign SUPER_ADMIN or unapproved role via invitation."
        });
      }

      if (
        !req.user.isSuperAdmin &&
        senderRole === "MANAGER" &&
        (targetRole === "OWNER" || targetRole === "ADMIN")
      ) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE_ASSIGNMENT",
          message: "Managers cannot invite OWNER or ADMIN roles."
        });
      }

      if (!email || !String(email).trim()) {
        return res.status(400).json({ error: "MISSING_INVITATION_DETAILS", message: "Missing recipient email." });
      }

      const verifiedSender = {
        uid: req.user.uid,
        name: sender?.name || req.user.email || req.user.uid,
        role: senderRole,
        business_id: businessId,
        isSuperAdmin: req.user.isSuperAdmin
      };

      const inviteId = await InvitationService.sendInvitation(
        businessId,
        String(email).trim(),
        targetRole,
        verifiedSender
      );
      res.json({ success: true, inviteId });
    } catch (error: any) {
      console.error("[Invitation API] Send Error:", error);
      const msg = error?.message || "";
      if (
        msg === "FORBIDDEN_TENANT_ACCESS" ||
        msg === "FORBIDDEN_ROLE" ||
        msg === "FORBIDDEN_ROLE_ASSIGNMENT"
      ) {
        return res.status(403).json({ error: msg });
      }
      if (msg === "MISSING_INVITATION_DETAILS") {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to send invitation." });
    }
  });

  // API endpoint: Accept Colleague Invitation
  app.post("/api/invitations/accept", authenticateIdentityOnly, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
      }

      const { inviteId, user } = req.body || {};
      if (!inviteId) {
        return res.status(400).json({ error: "MISSING_INVITE_ID", message: "Missing inviteId." });
      }

      if (user?.uid && user.uid !== req.user.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "user.uid must match the authenticated user."
        });
      }

      const tokenEmail = (req.user.email || "").toLowerCase().trim();
      if (!tokenEmail || req.user.emailVerified !== true) {
        return res.status(403).json({
          error: "EMAIL_VERIFICATION_REQUIRED",
          message: "A verified email on the authentication token is required to accept an invitation."
        });
      }

      if (user?.email && String(user.email).toLowerCase().trim() !== tokenEmail) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "user.email must match the authenticated user email."
        });
      }

      const verifiedUser = {
        uid: req.user.uid,
        email: tokenEmail,
        name: user?.name || tokenEmail.split("@")[0] || "Collaborateur",
        emailVerified: req.user.emailVerified,
        existingBusinessId: req.user.business_id,
        isSuperAdmin: req.user.isSuperAdmin
      };

      await InvitationService.acceptInvitation(inviteId, verifiedUser);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Invitation API] Accept Error:", error);
      const msg = error?.message || "";
      if (
        msg === "INVITATION_RECIPIENT_MISMATCH" ||
        msg === "FORBIDDEN_ROLE_ASSIGNMENT" ||
        msg === "TENANT_CONFLICT_EXISTING_MEMBERSHIP" ||
        msg === "EMAIL_VERIFICATION_REQUIRED" ||
        msg === "INVALID_INVITATION_TENANT"
      ) {
        return res.status(403).json({ error: msg });
      }
      if (msg === "INVITATION_NOT_FOUND") {
        return res.status(404).json({ error: msg });
      }
      if (msg === "INVITATION_NOT_PENDING" || msg === "INVITATION_EXPIRED") {
        return res.status(409).json({ error: msg });
      }
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to accept invitation." });
    }
  });

  // API endpoint: Reject Colleague Invitation
  app.post("/api/invitations/reject", authenticateIdentityOnly, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required." });
      }

      const { inviteId, userId } = req.body || {};
      if (!inviteId) {
        return res.status(400).json({ error: "MISSING_INVITE_ID", message: "Missing inviteId." });
      }

      if (userId && userId !== req.user.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "userId must match the authenticated user."
        });
      }

      await InvitationService.rejectInvitation(inviteId, {
        uid: req.user.uid,
        email: req.user.email,
        emailVerified: req.user.emailVerified,
        role: req.user.role,
        business_id: req.user.business_id,
        isSuperAdmin: req.user.isSuperAdmin
      });
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Invitation API] Reject Error:", error);
      const msg = error?.message || "";
      if (msg === "UNAUTHORIZED_INVITATION_ACTION" || msg === "EMAIL_VERIFICATION_REQUIRED") {
        return res.status(403).json({ error: msg });
      }
      if (msg === "INVITATION_NOT_FOUND") {
        return res.status(404).json({ error: msg });
      }
      if (msg === "INVITATION_NOT_PENDING") {
        return res.status(409).json({ error: msg });
      }
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to reject invitation." });
    }
  });

  // API endpoint: Get & Seed Subscription Plans in Firestore
  app.get("/api/subscriptions/plans", async (req, res) => {
    try {
      const { SubscriptionPlanRepository } = await import("./src/repositories/SubscriptionPlanRepository");
      const plans = await SubscriptionPlanRepository.getAllPlans();
      res.json({ success: true, plans });
    } catch (error: any) {
      console.error("[Subscription Plans API] Error:", error);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to fetch plans." });
    }
  });

  // API endpoints: Employee Overpayment Receivables & Recovery Workflow (POST-ENG-05)
  app.get("/api/payroll/receivables", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const businessId = resolveServerRouteTenant(req, res, req.query.businessId as string);
      if (!businessId) return;

      const userRole = (req.user!.role || "").toUpperCase();
      if (!req.user!.isSuperAdmin && !RECEIVABLE_READ_ROLES.has(userRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE",
          message: "Your role is not authorized to view employee receivables."
        });
      }

      const { EmployeeReceivableRepository } = await import("./src/repositories/EmployeeReceivableRepository");
      const adminFirestore = getAdminFirestore();
      const receivables = await EmployeeReceivableRepository.listReceivablesByBusiness(businessId, adminFirestore);
      res.json({ success: true, receivables });
    } catch (error: any) {
      console.error("[Receivables API] Fetch error:", error);
      if (error?.code === "TENANT_ISOLATION_VIOLATION") {
        return res.status(403).json({
          error: "TENANT_ISOLATION_VIOLATION",
          message: "Tenant isolation violation detected on employee receivable record."
        });
      }
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to fetch receivables." });
    }
  });

  app.post("/api/payroll/receivables/approve", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { receivableId, businessId: bodyBizId, approver, approvalReason } = req.body || {};
      if (!receivableId || typeof receivableId !== "string") {
        return res.status(400).json({ error: "MISSING_RECEIVABLE_ID", message: "Missing receivableId." });
      }

      const businessId = resolveServerRouteTenant(req, res, bodyBizId);
      if (!businessId) return;

      const userRole = (req.user!.role || "").toUpperCase();
      if (!req.user!.isSuperAdmin && !RECEIVABLE_APPROVE_ROLES.has(userRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE",
          message: `Role '${req.user!.role}' is not authorized to approve employee receivable proposals.`
        });
      }

      if (approver?.id && approver.id !== req.user!.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "approver.id must match the authenticated user."
        });
      }

      const verifiedApprover = {
        id: req.user!.uid,
        name: req.user!.email || req.user!.uid,
        role: req.user!.isSuperAdmin ? "SUPER_ADMIN" : userRole
      };

      const { EmployeeReceivableService } = await import("./src/services/payroll/EmployeeReceivableService");
      const { FinopsException } = await import("./src/modules/runtime/FinopsException");
      const firestore = getAdminFirestore();

      const result = await firestore.runTransaction(async (transaction) => {
        const recRef = firestore.collection("employee_receivables").doc(receivableId);
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          throw new FinopsException("RECEIVABLE_NOT_FOUND", `Proposition de recouvrement ${receivableId} introuvable.`);
        }
        const proposal = { id: recSnap.id, ...recSnap.data() } as any;
        const proposalBizId = resolveReceivableTenantId(proposal);
        if (!proposalBizId || proposalBizId !== businessId) {
          throw new FinopsException(
            "TENANT_ISOLATION_VIOLATION",
            `La créance (${receivableId}) n'appartient pas à l'entreprise (${businessId}).`
          );
        }

        const approved = EmployeeReceivableService.approveProposal(proposal, {
          receivableId,
          businessId,
          approver: verifiedApprover,
          approvalReason
        });

        transaction.set(recRef, approved.approvedReceivable, { merge: true });
        if (approved.journalEntry) {
          transaction.set(
            firestore.collection("journal_entries").doc(approved.journalEntry.id),
            approved.journalEntry,
            { merge: true }
          );
        }
        for (const tx of approved.ledgerTransactions) {
          transaction.set(firestore.collection("ledger_transactions").doc(tx.id), tx, { merge: true });
        }
        return approved;
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Receivables API] Approval error:", error);
      const code = error?.code || "";
      if (
        code === "TENANT_ISOLATION_VIOLATION" ||
        code === "SEGREGATION_OF_DUTIES_VIOLATION" ||
        code === "UNAUTHORIZED_APPROVER"
      ) {
        return res.status(403).json({ error: code, message: "Approval forbidden by security policy." });
      }
      if (code === "RECEIVABLE_NOT_FOUND") {
        return res.status(404).json({ error: code, message: "Receivable proposal not found." });
      }
      if (code === "INVALID_STATUS_TRANSITION" || code === "INVALID_ACCOUNT_MAPPING") {
        return res.status(400).json({ error: code, message: "Invalid receivable status or account mapping." });
      }
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to approve receivable proposal." });
    }
  });

  app.post("/api/payroll/receivables/repayment", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { receivableId, businessId: bodyBizId, amount, amountCents, paymentMethod, method, recordedBy, notes } = req.body || {};
      const numericAmount =
        amount !== undefined
          ? Number(amount)
          : amountCents !== undefined
            ? Number(amountCents) / 100
            : NaN;
      if (!receivableId || typeof receivableId !== "string" || !Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "MISSING_REPAYMENT_PARAMS", message: "Valid receivableId and positive amount are required." });
      }

      const businessId = resolveServerRouteTenant(req, res, bodyBizId);
      if (!businessId) return;

      const userRole = (req.user!.role || "").toUpperCase();
      if (!req.user!.isSuperAdmin && !RECEIVABLE_REPAYMENT_ROLES.has(userRole)) {
        return res.status(403).json({
          error: "FORBIDDEN_ROLE",
          message: `Role '${req.user!.role}' is not authorized to record employee receivable repayments.`
        });
      }

      if (recordedBy?.id && recordedBy.id !== req.user!.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "recordedBy.id must match the authenticated user."
        });
      }

      const verifiedRecorder = {
        id: req.user!.uid,
        name: req.user!.email || req.user!.uid,
        role: req.user!.isSuperAdmin ? "SUPER_ADMIN" : userRole
      };

      const { EmployeeReceivableService } = await import("./src/services/payroll/EmployeeReceivableService");
      const { FinopsException } = await import("./src/modules/runtime/FinopsException");
      const firestore = getAdminFirestore();

      const result = await firestore.runTransaction(async (transaction) => {
        const recRef = firestore.collection("employee_receivables").doc(receivableId);
        const recSnap = await transaction.get(recRef);
        if (!recSnap.exists) {
          throw new FinopsException("RECEIVABLE_NOT_FOUND", `Créance employé ${receivableId} introuvable.`);
        }
        const existingReceivable = { id: recSnap.id, ...recSnap.data() } as any;
        const recBizId = resolveReceivableTenantId(existingReceivable);
        if (!recBizId || recBizId !== businessId) {
          throw new FinopsException(
            "TENANT_ISOLATION_VIOLATION",
            `La créance (${receivableId}) n'appartient pas à l'entreprise (${businessId}).`
          );
        }

        const reconciled = EmployeeReceivableService.recordRepayment(existingReceivable, {
          receivableId,
          businessId,
          amount: numericAmount,
          paymentMethod: paymentMethod || method || "BANK",
          recordedBy: verifiedRecorder,
          notes
        });

        transaction.set(recRef, reconciled.updatedReceivable, { merge: true });
        if (reconciled.journalEntry) {
          transaction.set(
            firestore.collection("journal_entries").doc(reconciled.journalEntry.id),
            reconciled.journalEntry,
            { merge: true }
          );
        }
        if (reconciled.ledgerTransaction) {
          transaction.set(
            firestore.collection("ledger_transactions").doc(reconciled.ledgerTransaction.id),
            reconciled.ledgerTransaction,
            { merge: true }
          );
        }
        return reconciled;
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Receivables API] Repayment error:", error);
      const code = error?.code || "";
      if (code === "TENANT_ISOLATION_VIOLATION" || code === "FORBIDDEN_ROLE") {
        return res.status(403).json({ error: code, message: "Repayment forbidden by security policy." });
      }
      if (code === "RECEIVABLE_NOT_FOUND") {
        return res.status(404).json({ error: code, message: "Receivable not found." });
      }
      if (
        code === "RECEIVABLE_NOT_ACTIVE" ||
        code === "INVALID_REPAYMENT_AMOUNT" ||
        code === "OVERPAYMENT_REJECTED"
      ) {
        return res.status(400).json({ error: code, message: "Invalid repayment parameters or state." });
      }
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: "Failed to record repayment." });
    }
  });

  // API endpoint: AI CFO Insights utilizing Gemini 3.5 Flash & Role-Based Governance (D1.1-R-03 Hardened)
  app.post("/api/cfo/analyze", authenticateToken, async (req: AuthenticatedRequest, res) => {
    let resolvedUserContext: IdentityUserContext | undefined;
    let userQuestion: string = "";
    let evaluation: any = undefined;

    try {
      const { business, branch, employees, ledger, attendance, payroll, userQuestion: rawQuestion, snapshot, userContext } = req.body || {};
      userQuestion = rawQuestion || "";

      if (userContext?.userId && userContext.userId !== req.user!.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "userContext.userId must match the authenticated user."
        });
      }

      const candidateBizId =
        req.body?.businessId ??
        req.body?.business_id ??
        userContext?.businessId ??
        business?.id;
      const businessId = resolveServerRouteTenant(req, res, candidateBizId);
      if (!businessId) return;

      if (
        !req.user!.isSuperAdmin &&
        ((userContext?.businessId && userContext.businessId !== businessId) ||
          (business?.id && business.id !== businessId))
      ) {
        return res.status(403).json({
          error: "FORBIDDEN_TENANT_ACCESS",
          message: "Client is not authorized to analyze another tenant."
        });
      }

      const effectiveRole = req.user!.isSuperAdmin
        ? "SUPER_ADMIN"
        : (req.user!.role || "EMPLOYEE").toUpperCase();

      resolvedUserContext = {
        userId: req.user!.uid,
        userName: req.user!.email || req.user!.uid,
        userEmail: req.user!.email || "",
        role: effectiveRole as any,
        businessId,
        branchId: userContext?.branchId || branch?.id || null,
        departmentId: userContext?.departmentId || null
      };

      // 1. GOVERNANCE INTERCEPTION & EVALUATION
      evaluation = AICFOPermissionEngine.evaluate(resolvedUserContext, userQuestion);

      if (!evaluation.allowed) {
        await AICFOAuditService.logAudit({
          business_id: resolvedUserContext.businessId,
          user_id: resolvedUserContext.userId,
          user_name: resolvedUserContext.userName,
          role: resolvedUserContext.role,
          branch_id: resolvedUserContext.branchId,
          department_id: resolvedUserContext.departmentId,
          question: userQuestion || "",
          data_accessed: evaluation.dataAccessed,
          permission_result: "DENIED",
          ai_response_type: "SECURITY_REFUSAL",
          security_level: evaluation.securityLevel,
          refusal_reason: evaluation.refusalReason
        }).catch(() => {});

        return res.json({
          summary: evaluation.refusalMessage || "🛡️ [SÉCURITÉ AI CFO] : Accès refusé en vertu de vos droits RBAC.",
          metrics: {
            cash_flow: "[ACCÈS REFUSÉ]",
            fraud_risk: "LOW",
            profit_ratio: "[MASQUÉ]",
            financial_health_score: 0
          },
          alerts: [
            {
              type: "warning",
              text: `Accès non autorisé aux données de niveau ${evaluation.securityLevel} pour le rôle ${resolvedUserContext.role}.`
            }
          ],
          recommendations: [
            `Périmètre d'intelligence autorisé pour le rôle ${resolvedUserContext.role} : ${evaluation.policy.allowedDataCategories.join(", ")}.`
          ],
          chartsData: [
            { name: "REVENUE", value: 0 },
            { name: "EXPENSE", value: 0 }
          ],
          predictions: {
            next_fortnight_payroll: 0,
            end_of_month_cash_flow: 0,
            absenteeism_rate_percentage: 0,
            budget_overrun_risk: "FAIBLE",
            estimated_monthly_profit: 0,
            forecast_justification: "Accès refusé par la gouvernance de sécurité AI CFO."
          }
        });
      }

      // 2. DATA MASKING & CONTEXT PREPARATION
      const maskedSnapshot = AICFODataMasking.maskSnapshot(snapshot, resolvedUserContext);
      const maskedLists = AICFODataMasking.maskRawDataLists({
        employees,
        ledger,
        attendance,
        payroll
      }, resolvedUserContext);

      if (!ai) {
        // Fallback intelligence if API Key is not set or shared
        const fallback = FinancialRatioEngine.calculate(req.body, "Non Activée");

        await AICFOAuditService.logAudit({
          business_id: resolvedUserContext.businessId,
          user_id: resolvedUserContext.userId,
          user_name: resolvedUserContext.userName,
          role: resolvedUserContext.role,
          branch_id: resolvedUserContext.branchId,
          department_id: resolvedUserContext.departmentId,
          question: userQuestion || "",
          data_accessed: evaluation.dataAccessed,
          permission_result: evaluation.permissionResult,
          ai_response_type: "HEURISTIC_FALLBACK",
          security_level: evaluation.securityLevel
        });

        return res.json(fallback);
      }

      // Defensively clean and compress raw lists to prevent huge prompt text payloads
      const cleanEmployees = Array.isArray(maskedLists.employees)
        ? maskedLists.employees.slice(0, 50).map((e: any) => ({
            name: e.name || e.displayName,
            role: e.role,
            department: e.department,
            status: e.status,
            salary: e.salary || e.baseSalaryHtg || e.baseSalary
          }))
        : [];

      const cleanLedger = Array.isArray(maskedLists.ledger)
        ? maskedLists.ledger.slice(0, 50).map((t: any) => ({
            date: t.date,
            type: t.type,
            amount: t.amount,
            status: t.status,
            description: t.description ? t.description.slice(0, 50) : ""
          }))
        : [];

      const cleanAttendance = Array.isArray(maskedLists.attendance)
        ? maskedLists.attendance.slice(0, 50).map((a: any) => ({
            date: a.date,
            status: a.status,
            variance: a.variance
          }))
        : [];

      const cleanPayroll = Array.isArray(maskedLists.payroll)
        ? maskedLists.payroll.slice(0, 50).map((p: any) => ({
            employeeName: p.employeeName,
            baseSalary: p.baseSalaryHtg || p.baseSalary,
            netPaid: p.netPaid || p.netPaidHtg,
            cnss: p.cnssHtg || p.cnss,
            status: p.status
          }))
        : [];
        
      const deterministicMetrics = FinancialRatioEngine.calculate(req.body);

      const { systemInstruction, contextPayload } = AICFOSecureContextBuilder.buildPromptContext(
        resolvedUserContext,
        userQuestion || "",
        maskedSnapshot,
        { 
          employees: cleanEmployees, 
          ledger: cleanLedger, 
          attendance: cleanAttendance, 
          payroll: cleanPayroll,
          deterministicMetrics // Feed accurate math directly to the AI
        }
      );

      // Construct a highly detailed prompt containing all ERP active memory state
      const prompt = `${systemInstruction}

CONTEXT DATA PAYLOAD:
${contextPayload}

User Custom Inquiry/Question:
"${userQuestion || 'Procure-moi une analyse forensique globale de la rentabilité, d\'anomalies et d\'optimisation de la main d\'œuvre.'}"

Rules for the Haitian legal framework & ERP governance:
- Employer + Employee total CNSS is 6%.
- CNS contribution is 2%.
- Look closely at variance in hours: Negative variance means lost productivity, positive means overtime expense.
- Search for fraud risk: manual adjustments without reason, advances exceeding limits, unusual commissions.
- Respect all data masking rules in the context payload (do not invent unmasked values if marked [MASQUÉ]).

Respond ONLY with a structured JSON object in French/Kreyol matching this exact schema:
{
  "summary": "string - global expert synthesis, referencing the deterministic metrics provided in context",
  "metrics": {
    "cash_flow": "string",
    "fraud_risk": "string",
    "profit_ratio": "string",
    "financial_health_score": "number 0-100"
  },
  "alerts": [
    { "type": "info" | "warning" | "success", "text": "string" }
  ],
  "recommendations": [
    "string - actionable advice for expense optimization, salary forecasting, etc."
  ]
}`;

      let attempts = 0;
      let success = false;
      let finalParsedData: any = null;
      let lastError: any = null;

      while (attempts < 3 && !success) {
        attempts++;
        try {
          if (attempts > 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempts - 1)));
          }
          const attemptPrompt = prompt + (attempts > 1 
            ? `\n\n(IMPORTANT RETRY INSTRUCTION: The previous attempt failed validation/parsing with error: "${lastError?.message || 'Invalid JSON'}".\nEnsure your response is absolutely valid JSON matching the exact schema with no trailing commas, no missing quotes, and no extra brackets.)`
            : "");

          const response = await executeWithBackoff(
            (modelOverride) =>
              ai!.models.generateContent({
                model: modelOverride || "gemini-2.5-flash",
                contents: attemptPrompt,
                config: {
                  responseMimeType: "application/json",
                  responseSchema: cfoGeminiSchema,
                  temperature: 0.2,
                },
              }),
            2,
            800,
            ["gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]
          );

          let responseText = response.text?.trim() || "{}";
          let parsedData: any = null;
          
          try {
            parsedData = JSON.parse(responseText);
          } catch (parseErr) {
            console.warn("[CFO Parse] Standard JSON parse failed, trying repair...", parseErr);
            // Apply defensive cleaning and repair before matching braces
            let repairedText = repairJsonString(responseText);
            
            // Super-robust extraction of the first top-level matched JSON object
            const firstBrace = repairedText.indexOf('{');
            if (firstBrace !== -1) {
              let braceCount = 0;
              let inString = false;
              let escape = false;
              let foundEnd = false;
              let jsonEndIndex = -1;

              for (let i = firstBrace; i < repairedText.length; i++) {
                const char = repairedText[i];
                if (escape) {
                  escape = false;
                  continue;
                }
                if (char === '\\') {
                  escape = true;
                  continue;
                }
                if (char === '"') {
                  inString = !inString;
                  continue;
                }
                if (!inString) {
                  if (char === '{') {
                    braceCount++;
                  } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      jsonEndIndex = i;
                      foundEnd = true;
                      break;
                    }
                  }
                }
              }

              if (foundEnd && jsonEndIndex !== -1) {
                repairedText = repairedText.substring(firstBrace, jsonEndIndex + 1);
              } else {
                // Fallback to substring from first to last brace
                const lastBrace = repairedText.lastIndexOf('}');
                if (lastBrace !== -1 && lastBrace >= firstBrace) {
                  repairedText = repairedText.substring(firstBrace, lastBrace + 1);
                }
              }
            }

            // Final cleanup step for trailing commas in extracted object
            repairedText = repairedText.replace(/,\s*([\]}])/g, '$1');
            parsedData = JSON.parse(repairedText);
          }

          // Zod schema validation pass
          const validationResult = cfoResponseSchema.safeParse(parsedData);
          if (validationResult.success) {
            finalParsedData = validationResult.data;
            finalParsedData.chartsData = deterministicMetrics.chartsData;
            finalParsedData.predictions = deterministicMetrics.predictions;
            success = true;
          } else {
            const formattedErrors = validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            throw new Error(`Zod validation failed: ${formattedErrors}`);
          }

        } catch (error: any) {
          lastError = error;
          const errMsg = String(error.message || error).toLowerCase();
          const isNetworkOrQuotaError = 
            errMsg.includes("fetch failed") ||
            errMsg.includes("failed to fetch") ||
            errMsg.includes("network") ||
            errMsg.includes("econnreset") ||
            errMsg.includes("etimedout") ||
            errMsg.includes("enotfound") ||
            errMsg.includes("socket hang up") ||
            errMsg.includes("connection") ||
            errMsg.includes("spending cap") || 
            errMsg.includes("spend cap") || 
            errMsg.includes("billing") || 
            errMsg.includes("quota") || 
            errMsg.includes("exceeded") || 
            errMsg.includes("resource_exhausted") || 
            errMsg.includes("429") ||
            errMsg.includes("503") ||
            errMsg.includes("unavailable") ||
            errMsg.includes("high demand") ||
            errMsg.includes("overloaded");

          if (isNetworkOrQuotaError) {
            console.info("[AI CFO Analysis] Transient rate limit or network event encountered. Activating local FinancialRatioEngine deterministic analysis.");
            break;
          }
          console.info(`[AI CFO Analysis Attempt ${attempts} Retry]: ${getCleanErrorMessage(error)}`);
        }
      }

      if (success && finalParsedData) {
        // Post-generation response filter pass
        finalParsedData.summary = AICFOResponseFilter.sanitizeResponseText(finalParsedData.summary, resolvedUserContext);
        if (Array.isArray(finalParsedData.recommendations)) {
          finalParsedData.recommendations = finalParsedData.recommendations.map((rec: string) =>
            AICFOResponseFilter.sanitizeResponseText(rec, resolvedUserContext)
          );
        }

        // Log successful audit
        await AICFOAuditService.logAudit({
          business_id: resolvedUserContext.businessId,
          user_id: resolvedUserContext.userId,
          user_name: resolvedUserContext.userName,
          role: resolvedUserContext.role,
          branch_id: resolvedUserContext.branchId,
          department_id: resolvedUserContext.departmentId,
          question: userQuestion || "",
          data_accessed: evaluation.dataAccessed,
          permission_result: evaluation.permissionResult,
          ai_response_type: "GEMINI_AI",
          security_level: evaluation.securityLevel
        });

        res.json(finalParsedData);
      } else {
        throw lastError || new Error("Failed to generate valid JSON meeting the schema requirements after 3 attempts.");
      }

    } catch (error: any) {
      const cleanMessage = getCleanErrorMessage(error);
      const lowerClean = cleanMessage.toLowerCase();
      const isSpendCap = lowerClean.includes("spending cap") || lowerClean.includes("spend cap") || lowerClean.includes("resource_exhausted") || lowerClean.includes("429") || lowerClean.includes("quota") || lowerClean.includes("exceeded") || lowerClean.includes("rate-limits");
      if (isSpendCap) {
        console.info("[AI CFO Service] API quota / monthly spending cap reached. Activating local deterministic FinancialRatioEngine fallback.");
      } else {
        console.info("[AI CFO Service] Activating local deterministic FinancialRatioEngine fallback:", cleanMessage);
      }
      try {
        const fallbackPayload = FinancialRatioEngine.calculate(req.body || {}, cleanMessage);
        await AICFOAuditService.logAudit({
          business_id: resolvedUserContext?.businessId || "biz_demo",
          user_id: resolvedUserContext?.userId || "usr_current",
          user_name: resolvedUserContext?.userName || "Opérateur FinOps",
          role: resolvedUserContext?.role || "OWNER",
          branch_id: resolvedUserContext?.branchId || null,
          department_id: resolvedUserContext?.departmentId || null,
          question: userQuestion || "",
          data_accessed: evaluation?.dataAccessed || [],
          permission_result: evaluation?.permissionResult || "ALLOWED",
          ai_response_type: "HEURISTIC_FALLBACK",
          security_level: evaluation?.securityLevel || "L1_PUBLIC"
        }).catch(() => {});

        return res.json(fallbackPayload);
      } catch (fatalError: any) {
        console.error("Fatal unhandled error in /api/cfo/analyze:", fatalError);
        return res.status(500).json({
          error: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate AI CFO analysis."
        });
      }
    }
  });

  // Dedicated endpoint to generate 3-paragraph executive narratives with semantic formatting and NO technical IDs (D1.1-R-03 Hardened)
  app.post("/api/cfo/narrative", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { snapshot, business, branch, userContext } = req.body || {};

      if (userContext?.userId && userContext.userId !== req.user!.uid) {
        return res.status(403).json({
          error: "IDENTITY_SPOOFING_DETECTED",
          message: "userContext.userId must match the authenticated user."
        });
      }

      const candidateBizId =
        req.body?.businessId ??
        req.body?.business_id ??
        userContext?.businessId ??
        business?.id;
      const businessId = resolveServerRouteTenant(req, res, candidateBizId);
      if (!businessId) return;

      if (
        !req.user!.isSuperAdmin &&
        ((userContext?.businessId && userContext.businessId !== businessId) ||
          (business?.id && business.id !== businessId))
      ) {
        return res.status(403).json({
          error: "FORBIDDEN_TENANT_ACCESS",
          message: "Client is not authorized to generate narrative for another tenant."
        });
      }

      const effectiveRole = req.user!.isSuperAdmin
        ? "SUPER_ADMIN"
        : (req.user!.role || "EMPLOYEE").toUpperCase();

      const resolvedUserContext: IdentityUserContext = {
        userId: req.user!.uid,
        userName: req.user!.email || req.user!.uid,
        userEmail: req.user!.email || "",
        role: effectiveRole as any,
        businessId,
        branchId: userContext?.branchId || branch?.id || null,
        departmentId: userContext?.departmentId || null
      };

      const evaluation = AICFOPermissionEngine.evaluate(resolvedUserContext, "narrative executive analysis");

      if (!evaluation.allowed) {
        return res.json({
          paragraphs: [
            `🛡️ [SÉCURITÉ AI CFO] : Consultation du rapport exécutif restreinte.`,
            `En vertu de votre rôle (${resolvedUserContext.role}), l'accès aux synthèses financières consolidees nécessite des privilèges étendus.`,
            `Veuillez consulter votre responsable hiérarchique ou l'administrateur du compte.`
          ]
        });
      }

      const maskedSnapshot = AICFODataMasking.maskSnapshot(snapshot, resolvedUserContext);
      if (!ai) {
        // High fidelity rule-based narrative fallback when offline or no API key is set
        return res.json({
          paragraphs: [
            `L'analyseur opérationnel FinOps (Moteur Heuristique locale) indique que pour la période de ${snapshot?.period || "ce mois"}, les revenus s'élèvent à ${(snapshot?.revenue?.currentValue || 0).toLocaleString()} HTG et les charges à ${(snapshot?.expenses?.currentValue || 0).toLocaleString()} HTG, dégageant un résultat de ${(snapshot?.profit?.currentValue || 0).toLocaleString()} HTG.`,
            `L'efficacité globale de vos succursales s'accompagne d'un taux de présence moyen de ${(snapshot?.attendanceRate?.currentValue || 85).toFixed(1)}%. Le taux d'absence reste contenu à ${(snapshot?.absenceRate?.currentValue || 5).toFixed(1)}%.`,
            `Recommandation stratégique locale : Continuez de surveiller l'évolution du taux d'heures supplémentaires par département et planifiez la validation de tous les pointages suspects avant la prochaine quinzaine.`
          ]
        });
      }

      const snapshotSummary = `
        - Période: ${snapshot?.period || "Non définie"}
        - Revenus: ${snapshot?.revenue?.currentValue || 0} HTG (Tendance: ${snapshot?.revenue?.trend || "Stable"})
        - Dépenses: ${snapshot?.expenses?.currentValue || 0} HTG (Tendance: ${snapshot?.expenses?.trend || "Stable"})
        - Profit Net: ${snapshot?.profit?.currentValue || 0} HTG (Tendance: ${snapshot?.profit?.trend || "Stable"})
        - Effectif Actif: ${snapshot?.activeStaff?.currentValue || 0} employés
        - Taux de Présence: ${snapshot?.attendanceRate?.currentValue || 0}%
        - Taux de Retard: ${snapshot?.latenessRate?.currentValue || 0}%
        - Taux d'Absence: ${snapshot?.absenceRate?.currentValue || 0}%
        - Coût de la Paie: ${snapshot?.payrollCost?.currentValue || 0} HTG
        - Performance des succursales: ${JSON.stringify(snapshot?.branchPerformance || [])}
        - Performance des départements: ${JSON.stringify(snapshot?.departmentPerformance || [])}
        - Anomalies détectées: ${JSON.stringify(snapshot?.anomalies || [])}
      `;

      const prompt = `You are the Lead Enterprise CFO for Haitian SMEs running on the FinOps 'Tek Pou Nou' ERP platform.
Analyse this consolidated business analytics snapshot for the enterprise:
Business Name: "${business?.name || 'Client Enterprise'}"
Branch Filter Context: "${branch?.name || 'Toutes les succursales'}"

SNAPSHOT CONSOLIDATED PERFORMANCE MEMORY:
${snapshotSummary}

CRITICAL EXECUTION RULES:
1. Provide exactly three (3) distinct, highly professional, action-oriented, and analytical paragraphs summarizing the operational insights, financial performance, and HR/attendance situation.
2. The narrative language must be professional French (or Haitian Creole if extremely context-appropriate, but default to French).
3. STRICT CONSTRAINT ON TECHNICAL IDENTIFIERS: You MUST NOT output any technical database IDs, keys, or UUIDs (such as "b_1", "d_k", "branch_2", "emp_50", "dep_b_k", etc.). Use clean, semantic, and human-readable names for departments, branches, and employees. Translate any technical keys into elegant human-readable references.
4. Output your response as a JSON array of exactly 3 strings (the 3 paragraphs) under the key "paragraphs".
Do not include any Markdown wrap, just raw valid JSON.

Schema:
{
  "paragraphs": ["Paragraph 1 text", "Paragraph 2 text", "Paragraph 3 text"]
}`;

      if (!ai) {
        throw new Error("Gemini AI client is not initialized.");
      }

      const response = await executeWithBackoff(
        (modelOverride) =>
          ai!.models.generateContent({
            model: modelOverride || "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              temperature: 0.3,
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  paragraphs: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["paragraphs"]
              }
            }
          }),
        2,
        800,
        ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]
      );

      const responseText = response.text?.trim() || "{}";
      const parsedData = JSON.parse(responseText);
      
      if (parsedData && Array.isArray(parsedData.paragraphs)) {
        return res.json(parsedData);
      } else {
        throw new Error("Response validation failed: expected 'paragraphs' array");
      }
    } catch (error: any) {
      const cleanMessage = getCleanErrorMessage(error);
      const lowerClean = cleanMessage.toLowerCase();
      const isSpendCap = lowerClean.includes("spending cap") || lowerClean.includes("spend cap") || lowerClean.includes("resource_exhausted") || lowerClean.includes("429") || lowerClean.includes("quota") || lowerClean.includes("exceeded") || lowerClean.includes("rate-limits");
      if (isSpendCap) {
        console.info("[CFO Narrative Endpoint] Monthly AI quota or spending cap reached. Activating local heuristic fallback narrative.");
      } else {
        console.info("[CFO Narrative Endpoint] Using local heuristic fallback narrative:", cleanMessage);
      }
      const snapshot = req.body?.snapshot;
      return res.json({
        paragraphs: [
          `L'analyseur opérationnel FinOps (Moteur Heuristique locale) indique que pour la période de ${snapshot?.period || "ce mois"}, les revenus s'élèvent à ${(snapshot?.revenue?.currentValue || 0).toLocaleString()} HTG et les charges à ${(snapshot?.expenses?.currentValue || 0).toLocaleString()} HTG, dégageant un résultat de ${(snapshot?.profit?.currentValue || 0).toLocaleString()} HTG.`,
          `L'efficacité globale de vos succursales s'accompagne d'un taux de présence moyen de ${(snapshot?.attendanceRate?.currentValue || 85).toFixed(1)}%. Le taux d'absence reste contenu à ${(snapshot?.absenceRate?.currentValue || 5).toFixed(1)}%.`,
          `Recommandation stratégique locale : Continuez de surveiller l'évolution du taux d'heures supplémentaires par département et planifiez la validation de tous les pointages suspects avant la prochaine quinzaine.`
        ]
      });
    }
  });

  // Catch-all for API endpoints to ensure JSON response instead of HTML SPA fallback
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `Endpoint ${req.method} ${req.originalUrl} not found`, success: false });
  });

  // Global Express JSON Error Handler to guarantee sanitized JSON responses for all /api requests (D1.1-R-06)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[API Error Handler] ${req.method} ${req.originalUrl}:`, err);
    if (res.headersSent) {
      return next(err);
    }
    const statusCode =
      typeof err?.status === "number"
        ? err.status
        : typeof err?.statusCode === "number"
          ? err.statusCode
          : 500;
    res.status(statusCode).json({
      error: statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR",
      message: statusCode >= 500 ? "An unexpected server error occurred." : "Invalid request.",
      success: false
    });
  });

  // Serve static files and integrate Vite middlewares (when not running inside Vercel serverless functions or Vitest)
  if (!process.env.VERCEL && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { 
          middlewareMode: true,
          hmr: false,
          ws: false
        },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return app;
}

export async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const app = await createApp();

  const listenWithRetry = (retriesLeft = 5, delayMs = 1000): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 FinOps Server running on http://0.0.0.0:${PORT}`);
        resolve();
      });

      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE" && retriesLeft > 0) {
          console.warn(`⚠️ Port ${PORT} is currently in use, retrying in ${delayMs}ms... (${retriesLeft} retries left)`);
          setTimeout(() => {
            listenWithRetry(retriesLeft - 1, delayMs)
              .then(resolve)
              .catch(reject);
          }, delayMs);
        } else if (err.code === "EADDRINUSE") {
          console.error(`❌ Critical server startup error: Port ${PORT} is already in use.`);
          reject(err);
        } else {
          console.error("❌ Critical server startup error:", err);
          reject(err);
        }
      });

      process.on("SIGTERM", () => {
        server.close(() => process.exit(0));
      });
      process.on("SIGINT", () => {
        server.close(() => process.exit(0));
      });
    });
  };

  return listenWithRetry();
}

// Auto-boot standalone server if not in Vercel serverless runtime or Vitest test runner
if (!process.env.VERCEL && !process.env.VITEST && process.env.NODE_ENV !== "test") {
  startServer().catch(err => {
    console.error("CRITICAL SERVER STARTUP ERROR:", err);
    process.exit(1);
  });
}
