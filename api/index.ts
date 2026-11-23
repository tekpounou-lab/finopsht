import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

let appHandler: any = null;
let appHandlerPromise: Promise<any> | null = null;

const require = createRequire(import.meta.url);

async function resolveAppHandler(): Promise<any> {
  if (appHandler) return appHandler;
  if (appHandlerPromise) return appHandlerPromise;

  appHandlerPromise = (async () => {
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

    // Development / tsx / Vitest fallback
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
        req.body = raw ? JSON.parse(raw) : {};
      }
    } else if (typeof req.body === "string") {
      const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const trimmed = req.body.trim();
        req.body = trimmed ? JSON.parse(trimmed) : {};
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
    console.error("[Vercel Serverless Function Invocation Error]:", err?.message || err);
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
