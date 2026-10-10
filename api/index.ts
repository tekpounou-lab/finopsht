import { createApp } from "../server";

let appHandler: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appHandler) {
      appHandler = await createApp();
    }

    // Restore original path if rewritten by Vercel routing
    const originalPath = req.headers["x-invoke-path"] || req.headers["x-matched-path"] || req.url;
    if (originalPath && typeof originalPath === "string" && originalPath !== "/api" && originalPath !== "/") {
      req.url = originalPath;
    }

    return new Promise<void>((resolve, reject) => {
      res.on("finish", () => resolve());
      res.on("close", () => resolve());
      res.on("error", (err: any) => reject(err));
      appHandler(req, res);
    });
  } catch (err: any) {
    console.error("[Vercel Serverless Function Invocation Error]:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Erreur interne lors de l'exécution de la fonction serveur.",
        details: err?.message || "Serverless Function Handler Initialization Error",
        success: false
      });
    }
  }
}
