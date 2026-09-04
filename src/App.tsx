import React from "react";
import AppProviders from "./components/AppProviders";
import AppRouter from "./routes/AppRouter";
import { useAuth } from "./hooks/useAuth";

const DebugOverlay = () => {
  const auth = useAuth();
  return (
    <div style={{position: 'fixed', top: 0, left: 0, zIndex: 9999, background: 'black', color: 'lime', padding: 10, fontSize: 12}}>
      <pre>{JSON.stringify({ flowState: auth.flowState, authLoading: auth.authLoading, isResolved: auth.isResolved, error: auth.error, role: auth.role }, null, 2)}</pre>
    </div>
  );
};

export default function App() {
  return (
    <AppProviders>
      <DebugOverlay />
      <AppRouter />
    </AppProviders>
  );
}
