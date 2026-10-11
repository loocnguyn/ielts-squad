"use server";

import { createClient } from "@/lib/supabase/server";

/** Ends the session. The caller then does a full page load, see SignOutItem. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
