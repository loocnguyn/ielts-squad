"use client";

import { Clock } from "lucide-react";
import { useServerNow } from "@/lib/use-server-now";

function describe(msLeft: number) {
  if (msLeft <= 0) return "Đã chốt ngày";
  const minutes = Math.ceil(msLeft / 60_000);
  if (minutes < 60) return `Còn ${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Còn ${hours} giờ ${rest} phút` : `Còn ${hours} giờ`;
}

/** Time left until the day closes, on the server's clock. */
export function Countdown({ closesAt, serverNow }: { closesAt: string; serverNow: string }) {
  const msLeft = Date.parse(closesAt) - useServerNow(serverNow, 15_000);
  const urgent = msLeft > 0 && msLeft < 60 * 60_000;

  return (
    <span className={`inline-flex items-center gap-1.5 ${urgent ? "font-semibold text-streak" : ""}`}>
      <Clock className="size-4" /> {describe(msLeft)}
    </span>
  );
}
