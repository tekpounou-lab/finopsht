import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

let appHandler: any = null;
let appHandlerPromise: Promise<any> | null = null;

const require = createRequire(import.meta.url);

class InvalidJsonBodyError extends Error {
  statusCode = 400;
  code = "INVALID_JSON_BODY";
  constructor() {
    super("Invalid JSON request body.");
    this.name = "InvalidJsonBodyError";
  }
}

function isMissingBundleError(err: any, bundleName: string): boolean {
  const code = String(err?.code || "");
  const msg = String(err?.message || "");
  return (
    (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") &&
    msg.includes(bundleName)
  );
}

function sanitizeInitErrorSummary(err: any): string {
  const code = typeof err?.code === "string" || typeof err?.code === "number" ? String(err.code) : "";
  const rawMsg = typeof err?.message === "string" ? err.message : String(err || "unknown");
  const redacted = rawMsg
    .replace(/([?&](?:token|inviteId|code|key|secret)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]")
    .replace(/-----BEGIN[^-]+-----[\s\S]*?-----END[^-]+-----/g, "[REDACTED_KEY]");
  return code ? `[${code}] ${redacted}` : redacted;
}

async function resolveAppHandler(): Promise<any> {
  if (appHandler) return appHandler;
  if (appHandlerPromise) return appHandlerPromise;

  appHandlerPromise = (async () => {
    // 1. Static literal require so @vercel/nft statically traces api/_server.cjs into the serverless bundle
    try {
      const staticMod = require("./_server.cjs");
      if (typeof staticMod?.createApp === "function") {
        appHandler = await staticMod.createApp();
        return appHandler;
      }
    } catch (err: any) {
      if (!isMissingBundleError(err, "_server.cjs")) {
        throw err;
      }
    }

    // 2. Fallback path resolution for custom CWD or standalone dist builds
    const candidates = [
      path.resolve(process.cwd(), "api/_server.cjs"),
      path.resolve(process.cwd(), "dist/server.cjs")
    ];

    for (const bundlePath of candidates) {
      if (fs.existsSync(bundlePath)) {
        const mod = require(bundlePath);
        if (typeof mod?.createApp === "function") {
          appHandler = await mod.createApp();
          return appHandler;
        }
      }
    }

    // 3. Development / tsx / Vitest fallback
    const devEntry = "../server.ts";
    const mod = await import(/* @vite-ignore */ devEntry);
    appHandler = await mod.createApp();
    return appHandler;
  })();

  try {
    return await appHandlerPromise;
  } catch (err) {
    appHandlerPromise = null;
    throw err;
  }
}

function normalizeVercelRequest(req: any): void {
  const currentUrl = typeof req.url === "string" ? req.url : "/";
  const queryIndex = currentUrl.indexOf("?");
  const existingQuery = queryIndex >= 0 ? currentUrl.slice(queryIndex) : "";

  const rawHeaderPath = req.headers?.["x-invoke-path"] || req.headers?.["x-matched-path"];
  const headerPath = Array.isArray(rawHeaderPath) ? rawHeaderPath[0] : rawHeaderPath;

  if (
    headerPath &&
    typeof headerPath === "string" &&
    headerPath !== "/api" &&
    headerPath !== "/"
  ) {
    const hasQueryInHeader = headerPath.includes("?");
    req.url = hasQueryInHeader || !existingQuery ? headerPath : `${headerPath}${existingQuery}`;
  }

  // When Vercel pre-parses the HTTP body before invoking the handler, express body-parser
  // must see req._body = true so it does not hang waiting on an already-consumed stream.
  if (req.body !== undefined && req._body === undefined) {
    if (Buffer.isBuffer(req.body)) {
      const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const raw = req.body.toString("utf8").trim();
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          throw new InvalidJsonBodyError();
        }
      }
    } else if (typeof req.body === "string") {
      const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const trimmed = req.body.trim();
        try {
          req.body = trimmed ? JSON.parse(trimmed) : {};
        } catch {
          throw new InvalidJsonBodyError();
        }
      }
    }
    req._body = true;
  }
}

export default async function handler(req: any, res: any) {
  try {
    normalizeVercelRequest(req);
    const expressApp = await resolveAppHandler();

    return await new Promise<void>((resolve, reject) => {
      res.on("finish", () => resolve());
      res.on("close", () => resolve());
      res.on("error", (err: any) => reject(err));
      expressApp(req, res);
    });
  } catch (err: any) {
    if (err instanceof InvalidJsonBodyError) {
      if (!res.headersSent) {
        const payload = {
          error: "INVALID_JSON_BODY",
          message: "Invalid JSON request body.",
          success: false
        };
        if (typeof res.status === "function" && typeof res.json === "function") {
          res.status(400).json(payload);
        } else {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        }
      }
      return;
    }

    console.error("[Vercel Serverless Function Invocation Error]:", sanitizeInitErrorSummary(err));
    if (!res.headersSent) {
      const payload = JSON.stringify({
        error: "FUNCTION_INVOCATION_ERROR",
        message: "Internal server initialization error.",
        success: false
      });
      if (typeof res.status === "function" && typeof res.json === "function") {
        res.status(500).json(JSON.parse(payload));
      } else {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(payload);
      }
    }
  }
}
