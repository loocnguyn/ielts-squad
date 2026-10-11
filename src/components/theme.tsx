"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Theme = "dark" | "light";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Private mode: the choice just won't survive a reload.
  }
  listeners.forEach((listener) => listener());
}

/** Dark is the default; the inline script in the root layout applies a saved "light". */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "dark");
}

export function ThemeToggle() {
  const theme = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

/** Runs before first paint on hard loads; inert when React re-renders it on the client. */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `try{if(localStorage.getItem("theme")==="light")document.documentElement.classList.remove("dark")}catch(e){}`,
      }}
    />
  );
}
