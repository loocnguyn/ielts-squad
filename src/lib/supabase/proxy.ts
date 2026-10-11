import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PREFIXES = ["/login", "/auth"];

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Refreshes an expired token. This is an optimistic check for redirects only;
  // pages and actions verify the user again next to the data.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  // A redirect has to carry any refreshed session cookies with it.
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!isSignedIn && !isPublicPath(pathname)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }
  if (isSignedIn && (pathname === "/" || pathname === "/login")) {
    return redirectTo("/groups");
  }
  return response;
}
