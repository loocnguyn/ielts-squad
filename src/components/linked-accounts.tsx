"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Provider } from "@supabase/supabase-js";
import { DiscordIcon, GitHubIcon, GoogleIcon } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode }[] = [
  { id: "google", label: "Google", icon: <GoogleIcon /> },
  { id: "github", label: "GitHub", icon: <GitHubIcon /> },
  { id: "discord", label: "Discord", icon: <DiscordIcon /> },
];

/** Lets one person attach several sign-in methods to the same account. */
export function LinkedAccounts() {
  const [linked, setLinked] = useState<string[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUserIdentities()
      .then(({ data }) => {
        if (!cancelled) setLinked(data?.identities.map((identity) => identity.provider) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function link(provider: Provider) {
    setPending(provider);
    const { error } = await createClient().auth.linkIdentity({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/profile` },
    });
    if (error) {
      setPending(null);
      toast.error(
        error.message.toLowerCase().includes("manual linking")
          ? "Supabase chưa bật liên kết tài khoản (Auth › Sign In / Providers › Allow manual linking)."
          : "Không liên kết được tài khoản này.",
      );
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {PROVIDERS.map((provider) => {
        const isLinked = linked?.includes(provider.id) ?? false;
        return (
          <li key={provider.id} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            {provider.icon}
            <span className="flex-1 text-sm font-medium">{provider.label}</span>
            {linked === null ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : isLinked ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Check className="size-4 text-success" /> Đã liên kết
              </span>
            ) : (
              <Button variant="secondary" size="sm" disabled={pending !== null} onClick={() => link(provider.id)}>
                {pending === provider.id && <Loader2 className="animate-spin" />}
                Liên kết
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
