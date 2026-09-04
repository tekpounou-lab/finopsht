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

  // Global window error handler for benign media lifecycle events
  window.onerror = (message) => {
    const msg = typeof message === "string" ? message : "";
    if (
      msg.includes("interrupted") ||
      msg.includes("RenderedCameraImpl") ||
      msg.includes("video surface onabort") ||
      msg.includes("media was removed from the document") ||
      msg.includes("AbortError")
    ) {
      return true; // Suppress error
    }
    return false;
  };

  window.addEventListener("error", (event) => {
    const message = event.message || (event.error && event.error.message) || "";
    if (
      message.includes("The play() request was interrupted") ||
      message.includes("RenderedCameraImpl") ||
      message.includes("video surface onabort") ||
      message.includes("media was removed from the document") ||
      message.includes("AbortError")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return true;
    }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = (typeof reason === "string" ? reason : reason?.message) || "";
    if (
      message.includes("The play() request was interrupted") ||
      message.includes("RenderedCameraImpl") ||
      message.includes("video surface onabort") ||
      message.includes("media was removed from the document") ||
      message.includes("AbortError")
    ) {
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

