import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type SessionUser = { id: string; email: string | null };

/** Verified user for this request, or null. Deduped per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Signed-in user who has finished onboarding. Pass the current path so a
 * first-time visitor (e.g. from an invite link) returns to it afterwards.
 */
export async function requireProfile(returnTo?: string): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded_at) {
    redirect(returnTo ? `/onboarding?next=${encodeURIComponent(returnTo)}` : "/onboarding");
  }
  return profile;
}
