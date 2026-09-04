const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * List of authorized explicit origins for FINOPS ERP
 */
const ALLOWED_ORIGINS = [
  "https://finops-tek-pou-nou.ai.studio",
  "http://localhost:3000",
  "http://localhost:5173",
  /https:\/\/.*\.ai\.studio$/,
  /https:\/\/.*\.run\.app$/,
];

/**
 * Helper to check if an incoming origin is permitted
 */
function isOriginAllowed(origin) {
  if (!origin) return true; // allow same-origin or server-to-server calls
  return ALLOWED_ORIGINS.some((allowed) => {
    if (typeof allowed === "string") {
      return origin === allowed;
    }
    return allowed.test(origin);
  });
}

/**
 * finopsEventOrchestrator HTTP Cloud Function (2nd Gen)
 * 
 * Handles event orchestration with strict CORS preflight and response header support.
 * Configured with concurrency and maxInstances limits to ensure stability.
 */
exports.finopsEventOrchestrator = onRequest(
  {
    region: "us-central1",
    cors: [
      /https:\/\/.*\.ai\.studio$/,
      /https:\/\/.*\.run\.app$/,
      "https://finops-tek-pou-nou.ai.studio",
      "http://localhost:3000",
      "http://localhost:5173",
    ],
    concurrency: 80,
    maxInstances: 50,
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (req, res) => {
    const origin = req.headers.origin;

    // Set CORS headers dynamically based on request origin
    if (origin && isOriginAllowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "https://finops-tek-pou-nou.ai.studio");
    }

    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, PATCH");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Accept, X-Requested-With, Origin, x-client-version, x-firebase-gmpid"
    );
    res.setHeader("Access-Control-Max-Age", "3600");

    // 1. Handle HTTP OPTIONS preflight request immediately with 204 No Content
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // 2. Enforce POST method for actual orchestration payload
    if (req.method !== "POST") {
      res.status(405).json({
        error: {
          message: "Method Not Allowed. Use POST for event orchestration.",
          status: "METHOD_NOT_ALLOWED",
        },
      });
      return;
    }

    try {
      // Support both Firebase Callable wrapper format ({ data: { ... } }) and direct JSON body
      const body = req.body || {};
      const payloadData = body.data ? body.data : body;
      const { eventId, type, event, business_id, payload } = payloadData;

      const eventType = type || event || "UNKNOWN";

      logger.info(
        `[finopsEventOrchestrator] Processing event: ${eventId || "unassigned"}, type: ${eventType}, business_id: ${business_id || "none"}`
      );

      // If eventId is provided, update its status in Firestore
      if (eventId) {
        const db = admin.firestore();
        const eventRef = db.collection("events").doc(eventId);
        await eventRef.set(
          {
            status: "PROCESSED",
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            orchestrationDetails: {
              handledBy: "finopsEventOrchestrator",
              type: eventType,
              business_id: business_id || null,
              payloadSummary: payload ? JSON.stringify(payload).slice(0, 500) : null,
            },
          },
          { merge: true }
        );
      }

      // Return success response formatted for both Firebase callable and direct HTTP
      const responseBody = {
        result: {
          success: true,
          eventId: eventId || `evt_${Date.now()}`,
          type: eventType,
          business_id: business_id || null,
          status: "PROCESSED",
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responseBody);
    } catch (err) {
      logger.error("[finopsEventOrchestrator] Error processing event:", err);
      res.status(500).json({
        error: {
          message: err.message || "Internal Server Error during event orchestration",
          status: "INTERNAL",
        },
      });
    }
  }
);
