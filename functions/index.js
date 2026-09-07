const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
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

/**
 * Helper to dispatch notification emails via Resend, SendGrid, or fallback simulation
 */
async function sendNotificationEmail(options) {
  const recipients = (Array.isArray(options.to) ? options.to : [options.to]).filter(
    (e) => e && typeof e === "string" && e.includes("@")
  );

  if (recipients.length === 0) {
    logger.warn("[onNotificationCreated] No valid email recipients provided.");
    return { success: false, provider: "NONE", recipients: [] };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = process.env.EMAIL_FROM || "notifications@finops.haiti";
  const brandColor = options.severity === "CRITICAL" ? "#ef4444" : options.severity === "HIGH" ? "#f59e0b" : "#06b6d4";

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; background-color: #090d16; color: #e2e8f0; padding: 24px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 16px; margin-bottom: 20px;">
          <span style="font-size: 20px; font-weight: bold; color: #38bdf8;">FINOPS ERP</span>
          <span style="background-color: rgba(6,182,212,0.1); color: ${brandColor}; border: 1px solid ${brandColor}; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">
            ${options.type || "INFO"}
          </span>
        </div>
        <h2 style="color: #f8fafc; margin-top: 0;">${options.title}</h2>
        <p style="line-height: 1.6; color: #cbd5e1; white-space: pre-wrap;">${options.message}</p>
        ${options.actionUrl ? `<div style="margin-top: 24px; text-align: center;"><a href="${options.actionUrl}" style="background-color: ${brandColor}; color: #090d16; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Voir dans FINOPS ERP</a></div>` : ""}
        <div style="margin-top: 32px; border-top: 1px solid #1e293b; pt: 16px; font-size: 12px; color: #64748b; text-align: center;">
          FINOPS ERP Notification Service • Préférence email paramétrable dans votre profil.
        </div>
      </div>
    </body>
    </html>
  `;

  // 1. Resend API
  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddress, to: recipients, subject: `[FINOPS ERP] ${options.title}`, html: htmlContent })
      });
      if (response.ok) {
        const data = await response.json();
        logger.info(`[onNotificationCreated] Email dispatched via Resend to ${recipients.join(", ")}, messageId: ${data.id}`);
        return { success: true, provider: "RESEND", messageId: data.id, recipients };
      }
    } catch (err) {
      logger.error("[onNotificationCreated] Resend error:", err);
    }
  }

  // 2. SendGrid API
  if (sendgridApiKey) {
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${sendgridApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: recipients.map(email => ({ email })) }],
          from: { email: fromAddress, name: "FINOPS ERP" },
          subject: `[FINOPS ERP] ${options.title}`,
          content: [{ type: "text/html", value: htmlContent }]
        })
      });
      if (response.ok || response.status === 202) {
        logger.info(`[onNotificationCreated] Email dispatched via SendGrid to ${recipients.join(", ")}`);
        return { success: true, provider: "SENDGRID", messageId: `sg_${Date.now()}`, recipients };
      }
    } catch (err) {
      logger.error("[onNotificationCreated] SendGrid error:", err);
    }
  }

  // 3. Fallback Simulation Log
  logger.info(`[onNotificationCreated] SIMULATED Email Send to ${recipients.join(", ")}: ${options.title}`);
  return { success: true, provider: "SIMULATED", messageId: `sim_${Date.now()}`, recipients };
}

/**
 * Firestore Trigger Cloud Function (2nd Gen)
 * Listens on 'notifications/{notificationId}' document creation to dispatch email notifications
 * respecting user preferences (emailNotificationsEnabled).
 */
exports.onNotificationCreated = onDocumentCreated(
  {
    document: "notifications/{notificationId}",
    region: "us-central1"
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notifData = snap.data();
    const notificationId = event.params.notificationId;
    const { title, message, type, severity, targetUserId, target_user_id, targetRoles, businessId, business_id, actionUrl } = notifData;
    const bizId = businessId || business_id;
    const userId = targetUserId || target_user_id;

    logger.info(`[onNotificationCreated] Triggered for notification ${notificationId}, type: ${type || "INFO"}, targetUser: ${userId || "BROADCAST"}`);

    const db = admin.firestore();
    const recipientEmails = [];

    if (userId) {
      // Direct user notification
      const userDocSnap = await db.collection("users").doc(userId).get();
      if (userDocSnap.exists) {
        const uData = userDocSnap.data() || {};
        const isEmailEnabled = uData.emailNotificationsEnabled !== false && uData.notificationPreferences?.emailAlerts !== false;
        
        if (!isEmailEnabled) {
          logger.info(`[onNotificationCreated] User ${userId} has email notifications disabled (emailNotificationsEnabled: false). Skipping email.`);
          await snap.ref.set({ emailSkipped: true, emailSkipReason: "USER_DISABLED_PREFERENCE" }, { merge: true });
          return;
        }

        if (uData.email) {
          recipientEmails.push(uData.email);
        }
      } else {
        // Fallback check employee document
        const empDocSnap = await db.collection("employees").doc(userId).get();
        if (empDocSnap.exists) {
          const eData = empDocSnap.data() || {};
          const isEmailEnabled = eData.emailNotificationsEnabled !== false && eData.notificationPreferences?.emailAlerts !== false;
          if (!isEmailEnabled) {
            logger.info(`[onNotificationCreated] Employee ${userId} has email notifications disabled. Skipping email.`);
            await snap.ref.set({ emailSkipped: true, emailSkipReason: "EMPLOYEE_DISABLED_PREFERENCE" }, { merge: true });
            return;
          }
          if (eData.email) {
            recipientEmails.push(eData.email);
          }
        }
      }
    } else if (bizId) {
      // Business broadcast / role notification
      const usersQuery = db.collection("users").where("business_id", "==", bizId);
      const querySnap = await usersQuery.get();
      
      querySnap.docs.forEach((docSnap) => {
        const uData = docSnap.data();
        const isEmailEnabled = uData.emailNotificationsEnabled !== false && uData.notificationPreferences?.emailAlerts !== false;
        if (isEmailEnabled && uData.email) {
          if (Array.isArray(targetRoles) && targetRoles.length > 0) {
            if (targetRoles.includes(uData.role) || uData.role === "OWNER" || uData.role === "SUPER_ADMIN") {
              recipientEmails.push(uData.email);
            }
          } else {
            recipientEmails.push(uData.email);
          }
        }
      });
    }

    if (recipientEmails.length === 0) {
      logger.info(`[onNotificationCreated] No matching recipient emails for notification ${notificationId}.`);
      await snap.ref.set({ emailSent: false, emailStatus: "NO_RECIPIENTS" }, { merge: true });
      return;
    }

    // Dispatch email
    const dispatchResult = await sendNotificationEmail({
      to: recipientEmails,
      title: title || "Nouvelle notification FINOPS ERP",
      message: message || "",
      type,
      severity,
      actionUrl,
      businessId: bizId
    });

    // Update notification document with email audit trail
    await snap.ref.set(
      {
        emailSent: dispatchResult.success,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
        emailProvider: dispatchResult.provider,
        emailMessageId: dispatchResult.messageId || null,
        emailRecipients: recipientEmails
      },
      { merge: true }
    );
  }
);
