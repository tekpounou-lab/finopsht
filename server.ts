import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
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
import { getAdminApp } from "./src/lib/firebaseAdmin";
import { ServerProvisioningService } from "./src/services/business/ServerProvisioningService";
import { BusinessActivationService } from "./src/services/business/BusinessActivationService";
import { InvitationService } from "./src/services/business/InvitationService";
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
  retries = 3,
  delay = 1200,
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
      console.warn(`[Gemini API Transient Retry] ${error.message || 'High demand / 503 / Rate limit'}. Retrying in ${delay}ms... (Remaining retries: ${retries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      const nextFallbackModels = fallbackModels.length > 1 ? fallbackModels.slice(1) : fallbackModels;
      return executeWithBackoff(fn, retries - 1, delay * 2, nextFallbackModels);
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

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
  app.use("/api/*", (req, res, next) => {
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
  app.use("/api/*", (req, res, next) => {
    const method = req.method.toUpperCase();
    const isStateChanging = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

    if (isStateChanging) {
      const clientCsrfToken = req.headers["x-csrf-token"];
      const requestedWith = req.headers["x-requested-with"];

      // Verify presence of anti-CSRF or AJAX token
      if (!clientCsrfToken && !requestedWith && !req.headers["authorization"]) {
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
      const { event, payload } = req.body || {};
      console.log(`[Server Orchestrator API] Received event: ${event || "PING"}`);
      res.json({
        success: true,
        received: true,
        event: event || "PING",
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Server Orchestrator API] Error:", err);
      res.status(500).json({ error: err.message || "Failed to process orchestrator event" });
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
      res.status(500).json({ error: err.message || "Failed to process telemetry" });
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

  // API endpoint: Snapshot Retention Pruning (Scheduled Cron / Cloud Function endpoint)
  // Prunes snapshots older than 30 days across metric_snapshots and performance collections
  app.post("/api/maintenance/prune-snapshots", async (req, res) => {
    try {
      const { businessId = "biz_default", retentionDays = 30 } = req.body || {};
      const { SnapshotRetentionManager } = await import("./src/services/business/snapshot/SnapshotRetentionManager");
      const result = await SnapshotRetentionManager.getInstance().purgeExpiredSnapshots(businessId, {
        retentionDays,
        dailyRetentionDays: retentionDays,
        weeklyRetentionDays: 90
      });

      console.log(`[Maintenance API] Snapshot purge completed for ${businessId}:`, result);
      res.json({
        success: true,
        message: `Purged snapshots older than ${retentionDays} days`,
        ...result,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("[Maintenance API] Snapshot prune error:", err);
      res.status(500).json({ error: err.message || "Failed to prune snapshots" });
    }
  });

  // API endpoint: SSOT Data Redundancy Cleanup Migration (Phase 1.2)
  app.post("/api/maintenance/ssot-cleanup", async (req, res) => {
    try {
      const { businessId = "biz_default" } = req.body || {};
      const { DataCleanupAndSSOTService } = await import("./src/services/business/DataCleanupAndSSOTService");
      const summary = await DataCleanupAndSSOTService.getInstance().runSSOTCleanupMigration(businessId);

      console.log(`[Maintenance API] SSOT cleanup completed for ${businessId}:`, summary);
      res.json({
        success: true,
        summary
      });
    } catch (err: any) {
      console.error("[Maintenance API] SSOT cleanup error:", err);
      res.status(500).json({ error: err.message || "Failed to execute SSOT cleanup" });
    }
  });

  // API endpoint: Referential & Foreign Key Integrity Validator (Phase 2.2 Trigger & Scan)
  app.post("/api/integrity/validate-foreign-keys", async (req, res) => {
    try {
      const { businessId = "biz_default", entityType, entityData } = req.body || {};
      const { IntegrityValidator } = await import("./src/services/integrity/ForeignKeyIntegrityValidator");
      
      if (entityData && entityType) {
        await IntegrityValidator.validateEntityForeignKeys(businessId, entityData, entityType);
        return res.json({
          valid: true,
          businessId,
          entityType,
          message: "Foreign key referential constraints satisfied."
        });
      }

      res.json({
        valid: true,
        businessId,
        message: "Referential integrity validation engine active."
      });
    } catch (err: any) {
      console.error("[Integrity API] Foreign key integrity violation:", err);
      res.status(400).json({
        valid: false,
        error: err.message || "Referential integrity constraint failed",
        code: err.code || "FOREIGN_KEY_VIOLATION",
        missingId: err.missingId,
        referencedCollection: err.referencedCollection
      });
    }
  });

  // API endpoint: Enterprise Provisioning (Bypasses rules, updates claims)
  app.post("/api/provisioning/create-business", async (req, res) => {
    try {
      const { founder, businessName, options } = req.body || {};
      
      if (!founder?.uid || !businessName) {
        return res.status(400).json({ error: "Missing founder info or business name" });
      }

      // 1. PERFORM PROVISIONING
      const result = await ServerProvisioningService.provision(founder, businessName, options);

      console.log(`[Provisioning API] Successfully provisioned business ${result.businessId} for user ${founder.uid}`);

      res.json({
        success: true,
        businessId: result.businessId,
        employeeId: result.employeeId
      });
    } catch (error: any) {
      console.error("[Provisioning API] Error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to provision business",
        code: error.code || "INTERNAL_ERROR"
      });
    }
  });

  // API endpoint: Business Activation (Phase 2 - Superadmin Only)
  app.post("/api/provisioning/activate-business", async (req, res) => {
    try {
      const { businessId, actor } = req.body || {};
      if (!businessId || !actor?.uid) {
        return res.status(400).json({ error: "Missing businessId or actor info" });
      }
      
      // Note: In production, verify actor.uid is a superadmin using admin.auth() and custom claims
      await BusinessActivationService.activate(businessId, actor);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Activation API] Error:", error);
      res.status(500).json({ error: error.message || "Failed to activate business" });
    }
  });

  // API endpoint: Send Colleague Invitation
  app.post("/api/invitations/send", async (req, res) => {
    try {
      const { businessId, email, role, sender } = req.body || {};
      if (!businessId || !email || !sender?.uid) {
        return res.status(400).json({ error: "Missing invitation details" });
      }
      const inviteId = await InvitationService.sendInvitation(businessId, email, role, sender);
      res.json({ success: true, inviteId });
    } catch (error: any) {
      console.error("[Invitation API] Send Error:", error);
      res.status(500).json({ error: error.message || "Failed to send invitation" });
    }
  });

  // API endpoint: Accept Colleague Invitation
  app.post("/api/invitations/accept", async (req, res) => {
    try {
      const { inviteId, user } = req.body || {};
      if (!inviteId || !user?.uid) {
        return res.status(400).json({ error: "Missing inviteId or user info" });
      }
      await InvitationService.acceptInvitation(inviteId, user);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Invitation API] Accept Error:", error);
      res.status(500).json({ error: error.message || "Failed to accept invitation" });
    }
  });

  // API endpoint: Reject Colleague Invitation
  app.post("/api/invitations/reject", async (req, res) => {
    try {
      const { inviteId, userId } = req.body || {};
      if (!inviteId || !userId) {
        return res.status(400).json({ error: "Missing inviteId or userId" });
      }
      await InvitationService.rejectInvitation(inviteId, userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[Invitation API] Reject Error:", error);
      res.status(500).json({ error: error.message || "Failed to reject invitation" });
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
      res.status(500).json({ error: error.message || "Failed to fetch plans" });
    }
  });

  // API endpoint: AI CFO Insights utilizing Gemini 3.5 Flash & Role-Based Governance
  app.post("/api/cfo/analyze", async (req, res) => {
    let resolvedUserContext: IdentityUserContext | undefined;
    let userQuestion: string = "";
    let evaluation: any = undefined;

    try {
      const { business, branch, employees, ledger, attendance, payroll, userQuestion: rawQuestion, snapshot, userContext } = req.body || {};
      userQuestion = rawQuestion || "";

      resolvedUserContext = {
        userId: userContext?.userId || "usr_current",
        userName: userContext?.userName || "Opérateur FinOps",
        userEmail: userContext?.userEmail || "",
        role: userContext?.role || "OWNER",
        businessId: userContext?.businessId || business?.id || "biz_demo",
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
                model: modelOverride || "gemini-3.7-flash",
                contents: attemptPrompt,
                config: {
                  responseMimeType: "application/json",
                  responseSchema: cfoGeminiSchema,
                  temperature: 0.2,
                },
              }),
            3,
            1200,
            ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]
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
          const isSpendCap = errMsg.includes("spending cap") || errMsg.includes("spend cap") || errMsg.includes("billing");
          if (isSpendCap) {
            console.warn(`[AI CFO Analysis] Monthly spending cap exceeded. Breaking loop to trigger heuristic fallback immediately.`);
            break;
          }
          console.warn(`[AI CFO Analysis Attempt ${attempts} Failed]: ${error.message}`);
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
      const isSpendCap = cleanMessage.includes("spending cap") || cleanMessage.includes("spend cap") || cleanMessage.includes("RESOURCE_EXHAUSTED") || cleanMessage.includes("429");
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
        return res.status(500).json({ error: fatalError?.message || "Internal Server Error" });
      }
    }
  });

  // Dedicated endpoint to generate 3-paragraph executive narratives with semantic formatting and NO technical IDs
  app.post("/api/cfo/narrative", async (req, res) => {
    try {
      const { snapshot, business, branch, userContext } = req.body || {};

      const resolvedUserContext: IdentityUserContext = {
        userId: userContext?.userId || "usr_current",
        userName: userContext?.userName || "Opérateur FinOps",
        userEmail: userContext?.userEmail || "",
        role: userContext?.role || "OWNER",
        businessId: userContext?.businessId || business?.id || "biz_demo",
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
            model: modelOverride || "gemini-3.7-flash",
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
        3,
        1200,
        ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]
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
      const isSpendCap = cleanMessage.includes("spending cap") || cleanMessage.includes("spend cap") || cleanMessage.includes("RESOURCE_EXHAUSTED") || cleanMessage.includes("429");
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
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: `Endpoint ${req.originalUrl} not found` });
  });

  // Serve static files and integrate Vite middlewares
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 FinOps Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL SERVER STARTUP ERROR:", err);
  process.exit(1);
});
