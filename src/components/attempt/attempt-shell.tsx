"use client";

import { useEffect, useRef, useState } from "react";
import { CloudOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SKILL_META } from "@/lib/skills";
import type { Skill } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatClock } from "./use-attempt";

type Props = {
  skill: Skill;
  title: string;
  remainingMs: number;
  saveState?: "idle" | "saving" | "saved" | "error";
  submitting: boolean;
  /** Shown in the confirm dialog, e.g. "3 câu chưa trả lời". */
  warning?: string | null;
  /** Hide the submit button when the runner submits on its own (speaking). */
  canSubmit?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
};

/** Focus mode: no navigation, just the countdown, the save state and Submit. */
export function AttemptShell({
  skill,
  title,
  remainingMs,
  saveState = "idle",
  submitting,
  warning,
  canSubmit = true,
  onSubmit,
  children,
}: Props) {
  const meta = SKILL_META[skill];
  const [confirming, setConfirming] = useState(false);
  const expired = useRef(false);

  // Time's up: hand in whatever is on the page.
  useEffect(() => {
    if (remainingMs <= 0 && !expired.current && canSubmit) {
      expired.current = true;
      onSubmit();
    }
  }, [remainingMs, canSubmit, onSubmit]);

  const urgent = remainingMs < 2 * 60_000;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4">
          <meta.icon className={cn("size-5 shrink-0", meta.text)} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {saveState === "saving" && "Đang lưu…"}
              {saveState === "saved" && "Đã lưu tự động"}
              {saveState === "error" && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <CloudOff className="size-3" /> Chưa lưu được, sẽ thử lại
                </span>
              )}
              {saveState === "idle" && meta.label}
            </p>
          </div>
          <div
            role="timer"
            aria-label="Thời gian còn lại"
            className={cn(
              "rounded-lg border px-3 py-1 font-mono text-lg font-bold tabular-nums",
              urgent && "border-destructive text-destructive",
            )}
          >
            {formatClock(remainingMs)}
          </div>
          {canSubmit && (
            <Button className="h-9" disabled={submitting} onClick={() => setConfirming(true)}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              Nộp bài
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5">{children}</main>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nộp bài {meta.label}?</DialogTitle>
            <DialogDescription>
              {warning ? `${warning} ` : ""}Nộp rồi thì không sửa được nữa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Làm tiếp</Button>
            </DialogClose>
            <Button
              disabled={submitting}
              onClick={() => {
                setConfirming(false);
                onSubmit();
              }}
            >
              Nộp bài
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
