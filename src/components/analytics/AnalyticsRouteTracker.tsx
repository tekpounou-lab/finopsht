import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "../../lib/analytics";

/**
 * React Component that listens to react-router navigation changes
 * and automatically dispatches page_view events to Firebase GA4 Analytics.
 */
export const AnalyticsRouteTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    if (location && location.pathname) {
      trackPageView(location.pathname).catch((err) => {
        console.warn("[AnalyticsRouteTracker] Error tracking page view:", err);
      });
    }
  }, [location.pathname, location.search]);

  return null;
};
