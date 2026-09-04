// src/config/proxy.config.ts

export interface ProxyRouteConfig {
  path: string;
  target: string;
  rewritePath?: string;
  changeOrigin: boolean;
}

export interface ProxyConfiguration {
  targetServer: string;
  routes: Record<string, ProxyRouteConfig>;
  fallbackMode: "direct" | "proxy" | "queue";
  timeoutMs: number;
}

export const ProxyConfig: ProxyConfiguration = {
  targetServer: "https://us-central1-tek-pou-nou-tpn.cloudfunctions.net",
  routes: {
    "/api/orchestrator": {
      path: "/api/orchestrator",
      target: "https://us-central1-tek-pou-nou-tpn.cloudfunctions.net/finopsEventOrchestrator",
      rewritePath: "",
      changeOrigin: true,
    },
    "/api/telemetry": {
      path: "/api/telemetry",
      target: "https://us-central1-tek-pou-nou-tpn.cloudfunctions.net/finopsTelemetryIngressor",
      rewritePath: "",
      changeOrigin: true,
    }
  },
  fallbackMode: "proxy",
  timeoutMs: 5000,
};

/**
 * Returns the resolved endpoint URL based on current routing rules and fallback configuration.
 */
export function resolveEndpoint(path: string): string {
  const route = ProxyConfig.routes[path];
  if (!route) {
    return `${ProxyConfig.targetServer}${path}`;
  }
  
  if (ProxyConfig.fallbackMode === "proxy") {
    // In production/local development, if we have a proxy path setup on port 3000, we route locally
    return route.path;
  }
  
  return route.target;
}
