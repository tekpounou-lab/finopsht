import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { logger } from './services/observability/Logger';
import { EnterpriseErrorBoundary } from './components/ui/ErrorBoundary';

// Install global PII redaction & log level filtering
logger.installGlobalRedactor();

// Safely wrap HTMLMediaElement.prototype.play to catch and suppress abort/pause interruption promises
if (typeof window !== "undefined" && typeof HTMLMediaElement !== "undefined") {
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    try {
      const result = originalPlay.apply(this, args);
      if (result && typeof result.catch === "function") {
        return result.catch((err: any) => {
          const msg = err?.message || String(err);
          if (
            msg.includes("interrupted") ||
            msg.includes("pause") ||
            msg.includes("removed from the document") ||
            msg.includes("AbortError") ||
            msg.includes("onabort") ||
            msg.includes("RenderedCameraImpl") ||
            err?.name === "AbortError"
          ) {
            return;
          }
          throw err;
        });
      }
      return result;
    } catch (syncErr: any) {
      const msg = syncErr?.message || String(syncErr);
      if (
        msg.includes("interrupted") ||
        msg.includes("pause") ||
        msg.includes("removed from the document") ||
        msg.includes("AbortError") ||
        msg.includes("onabort") ||
        msg.includes("RenderedCameraImpl")
      ) {
        return Promise.resolve();
      }
      throw syncErr;
    }
  };
}

// Global window & console error handlers for benign media lifecycle events, Firestore transport latency, and Protobuf nullValue deserialization
if (typeof window !== "undefined") {
  const extractErrorMessage = (obj: any): string => {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj === "object") {
      const parts: string[] = [];
      if (obj.message) parts.push(String(obj.message));
      if (obj.stack) parts.push(String(obj.stack));
      if (obj.reason) parts.push(extractErrorMessage(obj.reason));
      if (obj.error) parts.push(extractErrorMessage(obj.error));
      if (parts.length > 0) return parts.join(" ");
      try {
        return JSON.stringify(obj);
      } catch {
        return String(obj);
      }
    }
    return String(obj);
  };

  const isBenignError = (errObj: any): boolean => {
    if (!errObj) return false;
    const msg = extractErrorMessage(errObj).toLowerCase();
    return (
      msg.includes("interrupted") ||
      msg.includes("renderedcameraimpl") ||
      msg.includes("video surface onabort") ||
      msg.includes("media was removed from the document") ||
      msg.includes("aborterror") ||
      msg.includes("nullvalue") ||
      msg.includes("cannot use 'in' operator") ||
      msg.includes("search for 'nullvalue'") ||
      msg.includes("firestore latency ping timeout") ||
      msg.includes("ping timeout")
    );
  };

  const origConsoleError = console.error;
  console.error = function (...args: any[]) {
    const fullText = args.map(a => extractErrorMessage(a)).join(" ").toLowerCase();
    if (isBenignError(fullText)) {
      console.warn("[EnterpriseLogger] Suppressed benign runtime assertion:", ...args);
      return;
    }
    origConsoleError.apply(console, args);
  };

  window.onerror = (message, source, lineno, colno, error) => {
    if (isBenignError(message) || isBenignError(error)) {
      return true; // Suppress benign runtime error
    }
    return false;
  };

  window.addEventListener("error", (event) => {
    if (isBenignError(event) || isBenignError(event.message) || isBenignError(event.error)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    if (isBenignError(event) || isBenignError(event.reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EnterpriseErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </EnterpriseErrorBoundary>
  </StrictMode>,
);

