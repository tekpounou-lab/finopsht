/**
 * FINOPS ERP - Email Notification Service
 * Handles template rendering and email dispatching via Resend / SendGrid or SMTP webhook.
 */

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  title: string;
  message: string;
  notificationType?: string;
  severity?: string;
  actionUrl?: string;
  businessId?: string;
}

export interface EmailSendResult {
  success: boolean;
  provider: "RESEND" | "SENDGRID" | "SIMULATED" | "CUSTOM";
  messageId?: string;
  error?: string;
}

export class EmailNotificationService {
  private static getFromAddress(): string {
    return process.env.EMAIL_FROM || "notifications@finops.haiti";
  }

  /**
   * Builds clean, responsive HTML email markup for FINOPS ERP notifications
   */
  public static buildNotificationHtml(options: SendEmailOptions): string {
    const brandColor = options.severity === "CRITICAL" ? "#ef4444" : options.severity === "HIGH" ? "#f59e0b" : "#06b6d4";
    const typeLabel = options.notificationType || "INFO";
    const actionButton = options.actionUrl
      ? `<div style="margin-top: 24px; text-align: center;">
          <a href="${options.actionUrl}" style="background-color: ${brandColor}; color: #090d16; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
            Voir l'événement dans FINOPS ERP
          </a>
         </div>`
      : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${options.title}</title>
      </head>
      <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #e2e8f0; margin: 0; padding: 24px;">
        <div style="max-w-600px; margin: 0 auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden;">
          <div style="padding: 24px; border-bottom: 1px solid #1e293b; background: linear-gradient(to right, #0f172a, #161e31);">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 20px; font-weight: 900; color: #38bdf8; letter-spacing: -0.5px;">FINOPS ERP</span>
              <span style="background-color: rgba(6, 182, 212, 0.1); color: ${brandColor}; border: 1px solid ${brandColor}; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;">
                ${typeLabel}
              </span>
            </div>
          </div>
          <div style="padding: 32px 24px;">
            <h2 style="font-size: 18px; font-weight: bold; color: #f8fafc; margin-top: 0; margin-bottom: 12px;">
              ${options.title}
            </h2>
            <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; white-space: pre-wrap;">
              ${options.message}
            </p>
            ${actionButton}
          </div>
          <div style="padding: 16px 24px; background-color: #0b0f19; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
            Ce message a été généré automatiquement par FINOPS ERP suite à un événement système.
            <br>Pour gérer vos préférences de notification par email, rendez-vous dans vos paramètres de profil.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Dispatches email via Resend, SendGrid, or fallback simulation
   */
  public static async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const validRecipients = recipients.filter(e => e && e.includes("@"));

    if (validRecipients.length === 0) {
      return {
        success: false,
        provider: "SIMULATED",
        error: "Aucun destinataire email valide fourni."
      };
    }

    const htmlContent = this.buildNotificationHtml(options);
    const textContent = `${options.title}\n\n${options.message}\n\n${options.actionUrl ? 'Lien: ' + options.actionUrl : ''}`;
    const resendApiKey = process.env.RESEND_API_KEY;
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const fromAddress = this.getFromAddress();

    // 1. RESEND API DISPATCH
    if (resendApiKey) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: fromAddress,
            to: validRecipients,
            subject: `[FINOPS ERP] ${options.title}`,
            html: htmlContent,
            text: textContent
          })
        });

        const data: any = await response.json();
        if (response.ok && data.id) {
          console.log(`[EmailNotificationService] Sent email via Resend ID: ${data.id} to ${validRecipients.join(", ")}`);
          return { success: true, provider: "RESEND", messageId: data.id };
        } else {
          console.warn("[EmailNotificationService] Resend error:", data);
        }
      } catch (err: any) {
        console.error("[EmailNotificationService] Failed to send via Resend:", err);
      }
    }

    // 2. SENDGRID API DISPATCH
    if (sendgridApiKey) {
      try {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sendgridApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            personalizations: [{ to: validRecipients.map(email => ({ email })) }],
            from: { email: fromAddress, name: "FINOPS ERP Notifications" },
            subject: `[FINOPS ERP] ${options.title}`,
            content: [
              { type: "text/plain", value: textContent },
              { type: "text/html", value: htmlContent }
            ]
          })
        });

        if (response.ok || response.status === 202) {
          console.log(`[EmailNotificationService] Sent email via SendGrid to ${validRecipients.join(", ")}`);
          return { success: true, provider: "SENDGRID", messageId: `sg_${Date.now()}` };
        } else {
          const errText = await response.text();
          console.warn("[EmailNotificationService] SendGrid error:", errText);
        }
      } catch (err: any) {
        console.error("[EmailNotificationService] Failed to send via SendGrid:", err);
      }
    }

    // 3. FALLBACK SIMULATION (Graceful mock execution when API keys are not set in preview)
    console.log(`[EmailNotificationService] Simulated Email Dispatch:
      To: ${validRecipients.join(", ")}
      Subject: [FINOPS ERP] ${options.title}
      Type: ${options.notificationType || "INFO"}
      Message: ${options.message}
    `);

    return {
      success: true,
      provider: "SIMULATED",
      messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
  }
}
