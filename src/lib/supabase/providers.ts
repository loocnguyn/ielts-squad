"use client";

import { useEffect, useState } from "react";
import type { Provider } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

export const OAUTH_PROVIDERS = ["google", "github", "discord"] as const satisfies readonly Provider[];
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

let cached: Promise<OAuthProvider[]> | null = null;

/** Which OAuth providers the Supabase project has switched on (public auth settings). */
function fetchEnabledProviders(): Promise<OAuthProvider[]> {
  cached ??= fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error("settings"))))
    .then((settings: { external?: Record<string, boolean> }) =>
      OAUTH_PROVIDERS.filter((provider) => settings.external?.[provider] === true),
    )
    .catch(() => {
      // Unknown is treated as "none": a missing button is better than one that
      // lands on the provider's error page.
      cached = null;
      return [];
    });
  return cached;
}

/** Enabled providers, or null while the answer is loading. */
export function useEnabledProviders() {
  const [providers, setProviders] = useState<OAuthProvider[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEnabledProviders().then((enabled) => {
      if (!cancelled) setProviders(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}
