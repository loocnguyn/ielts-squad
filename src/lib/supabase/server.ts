import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

export async function createClient() {
  const cookieStore = await cookies();
  // Everything read through this client is live, per-user data, and the auth
  // library checks token expiry against the clock. Wait for the real request
  // so none of it is rendered into a prefetched, per-session shell.
  await connection();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies; the proxy refreshes the
          // session on every request, so the write can be skipped here.
        }
      },
    },
  });
}
