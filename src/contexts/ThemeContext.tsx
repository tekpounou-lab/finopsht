import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("finops-theme") as ThemeMode | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
    return "dark";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    localStorage.setItem("finops-theme", newTheme);
  };

  useEffect(() => {
    const handleThemeChange = () => {
      let activeTheme: "light" | "dark" = "dark";

      if (theme === "system") {
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        activeTheme = mql.matches ? "dark" : "light";
      } else {
        activeTheme = theme;
      }

      setResolvedTheme(activeTheme);

      const root = window.document.documentElement;
      if (activeTheme === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    handleThemeChange();

    const systemThemeMql = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (theme === "system") {
        handleThemeChange();
      }
    };

    systemThemeMql.addEventListener("change", listener);

    const storageListener = (e: StorageEvent) => {
      if (e.key === "finops-theme" && e.newValue) {
        setThemeState(e.newValue as ThemeMode);
      }
    };
    window.addEventListener("storage", storageListener);

    return () => {
      systemThemeMql.removeEventListener("change", listener);
      window.removeEventListener("storage", storageListener);
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
