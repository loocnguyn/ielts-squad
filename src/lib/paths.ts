/** Only same-origin paths are allowed as a post-login destination. */
export function safeNextPath(next: string | null | undefined, fallback = "/groups") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
