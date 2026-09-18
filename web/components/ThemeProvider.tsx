"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getResolvedTheme(stored: Theme | null): "light" | "dark" {
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return getSystemTheme();
}

function loadStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: "light" | "dark";
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    const resolvedNext = next === "system" ? getSystemTheme() : next;
    setResolved(resolvedNext);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(resolvedNext);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      const stored = loadStoredTheme();
      setThemeState(stored);
      const res = getResolvedTheme(stored);
      setResolved(res);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(res);
    });
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handle = () => {
      const res = getSystemTheme();
      setResolved(res);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(res);
    };
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
