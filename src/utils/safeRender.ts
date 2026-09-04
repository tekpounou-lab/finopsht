import React from "react";

/**
 * Enterprise Safe Render & Object Sanitizer Utilities
 * Prevents React Error #31 ("Objects are not valid as a React child")
 * by guaranteeing that values passed to JSX are safe primitives or formatted strings.
 */

export function safeRenderString(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.label === "string") return value.label;
    if (typeof value.name === "string") return value.name;
    if (typeof value.title === "string") return value.title;
    if (typeof value.id === "string") return value.id;
    return JSON.stringify(value);
  }
  return String(value);
}

export function safeRenderNumber(value: any, fallback = 0): number {
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

export function safeRenderNode(value: any, fallback: React.ReactNode = null): React.ReactNode {
  if (value === null || value === undefined) return fallback;
  if (React.isValidElement(value)) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      React.createElement(React.Fragment, { key: index }, safeRenderNode(item, fallback))
    );
  }
  if (typeof value === "object") {
    return safeRenderString(value, String(fallback || ""));
  }
  return fallback;
}
