import React from "react";
import AppProviders from "./components/AppProviders";
import AppRouter from "./routes/AppRouter";
import { ExecutiveFilterProvider } from "./domains/analytics/context/ExecutiveFilterContext";
import { AnalyticsFilterProvider } from "./contexts/AnalyticsFilterContext";

export default function App() {
  return (
    <ExecutiveFilterProvider>
      <AnalyticsFilterProvider>
        <AppProviders>
          <AppRouter />
        </AppProviders>
      </AnalyticsFilterProvider>
    </ExecutiveFilterProvider>
  );
}
