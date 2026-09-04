import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, flowState } = useAuth();

  if (flowState === "LOADING") {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-slate-950 text-slate-200">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Redirect to landing if there is no session
  if (!user || flowState === "LOGGED_OUT" || flowState === "LANDING") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
