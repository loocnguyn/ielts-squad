"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The server's current time in ms, ticking on the client.
 *
 * `serverNow` is the timestamp the server rendered with. The offset to the
 * device clock is measured once and kept, so the value stays right when the
 * page is hidden and shown again, and a device clock that is simply set wrong
 * does not shift it. Until the first tick it returns `serverNow` itself, which
 * keeps server and client markup identical during hydration.
 */
export function useServerNow(serverNow: string, intervalMs: number) {
  const base = Date.parse(serverNow);
  const offset = useRef<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    offset.current ??= base - Date.now();
    const tick = () => setNow(Date.now() + (offset.current ?? 0));
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [base, intervalMs]);

  return now ?? base;
}
