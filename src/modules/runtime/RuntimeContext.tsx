
import React, { createContext, useContext, useEffect, useState } from "react";
import { RuntimeEngine } from "./RuntimeEngine";
import { RuntimeState } from "./types";

interface RuntimeContextType {
  state: RuntimeState;
  engine: typeof RuntimeEngine;
}

const RuntimeContext = createContext<RuntimeContextType | null>(null);

export function RuntimeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RuntimeState>(RuntimeEngine.getState());
  const isInitialized = React.useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Initial Bootstrap
    const boot = async () => {
      await RuntimeEngine.bootstrap();
      setState(RuntimeEngine.getState());
    };
    
    boot();

    // Listen for state changes (simple polling or event-based in real world)
    // For Phase 1, we update state periodically to reflect heartbeat
    const interval = setInterval(() => {
      setState(RuntimeEngine.getState());
    }, 5000);

    return () => {
      clearInterval(interval);
      // We don't shutdown in dev strict mode to avoid breaking the second mount
      // In production, the provider mount/unmount is rare and usually terminal
      if (process.env.NODE_ENV === "production") {
        RuntimeEngine.shutdown();
      }
    };
  }, []);

  return (
    <RuntimeContext.Provider value={{ state, engine: RuntimeEngine }}>
      {children}
    </RuntimeContext.Provider>
  );
}

export function useRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useRuntime must be used within a RuntimeProvider");
  }
  return context;
}
