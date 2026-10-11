"use client";

import { useSyncExternalStore, useTransition } from "react";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { regenerateInviteCode } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/** The page origin, read on the client only so the link matches where the app is hosted. */
function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Trình duyệt không cho copy. Hãy bôi đen rồi copy tay.");
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

export function InviteCard({
  groupId,
  code,
  isOwner,
}: {
  groupId: string;
  code: string;
  isOwner: boolean;
}) {
  const origin = useOrigin();
  const link = `${origin}/join/${code}`;
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-heading font-bold">Mời bạn bè</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Gửi link hoặc mã này qua Messenger, Zalo, Discord. Nhóm tối đa 10 người.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{origin ? link : `/join/${code}`}</span>
          </div>
          <CopyButton value={link} label="Copy link mời" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border bg-background px-3 py-2 text-center font-mono text-xl font-bold tracking-[0.35em]">
            {code}
          </div>
          <CopyButton value={code} label="Copy mã mời" />
        </div>
      </div>

      {isOwner && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 text-muted-foreground"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await regenerateInviteCode(groupId);
              if (result?.error) toast.error(result.error);
              else toast.success("Đã đổi mã mời. Link cũ không còn dùng được.");
            })
          }
        >
          <RefreshCw className={pending ? "animate-spin" : undefined} />
          Đổi mã mời
        </Button>
      )}
    </section>
  );
}
