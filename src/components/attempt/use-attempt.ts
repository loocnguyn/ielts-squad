"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { announceSkillDone } from "@/components/daily/group-live";
import { saveDraft, submitAttempt, type SubmitPayload } from "@/lib/attempt-client";
import type { Skill } from "@/lib/types";
import { useServerNow } from "@/lib/use-server-now";

export type AttemptContext = {
  attemptId: string;
  groupId: string;
  skill: Skill;
  userId: string;
  userName: string;
  /** ISO timestamps from the server; the countdown never trusts the device clock. */
  startedAt: string;
  deadline: string;
  serverNow: string;
};

/** Milliseconds since the attempt started and until its deadline, on the server's clock. */
export function useAttemptClock(ctx: Pick<AttemptContext, "startedAt" | "deadline" | "serverNow">) {
  const now = useServerNow(ctx.serverNow, 250);
  return {
    elapsedMs: now - Date.parse(ctx.startedAt),
    remainingMs: Math.max(0, Date.parse(ctx.deadline) - now),
  };
}

export function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Submits once, tells the group, then moves to the results page. Resolves false if it could not submit. */
export function useSubmit(ctx: AttemptContext) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const done = useRef(false);

  const submit = useCallback(
    async (payload: SubmitPayload): Promise<boolean> => {
      if (done.current) return true;
      done.current = true;
      setSubmitting(true);

      const result = await submitAttempt(ctx.attemptId, payload);
      if (!result.ok && !result.alreadySubmitted) {
        done.current = false;
        setSubmitting(false);
        toast.error(result.message);
        return false;
      }
      if (result.ok && result.late) {
        toast.warning("Hết giờ: bài được tính theo bản lưu tự động gần nhất.");
      }
      // Fire and forget: the board also polls, so a lost message only delays the update.
      announceSkillDone(ctx.groupId, { user_id: ctx.userId, name: ctx.userName, skill: ctx.skill }).catch(() => {});
      router.replace(`/groups/${ctx.groupId}/results/${ctx.skill}`);
      return true;
    },
    [ctx, router],
  );

  return { submit, submitting };
}

/** Saves the draft a few seconds after the last change, and once more on the way out. */
export function useAutosave<T>(
  attemptId: string,
  value: T,
  toDraft: (value: T) => { answers?: Record<string, string>; essay?: string },
) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latest = useRef(value);
  const dirty = useRef(false);
  const first = useRef(true);
  const toDraftRef = useRef(toDraft);

  useEffect(() => {
    latest.current = value;
    toDraftRef.current = toDraft;
  });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    dirty.current = true;
    const timer = setTimeout(async () => {
      setState("saving");
      const ok = await saveDraft(attemptId, toDraftRef.current(latest.current));
      dirty.current = !ok;
      setState(ok ? "saved" : "error");
    }, 2500);
    return () => clearTimeout(timer);
  }, [attemptId, value]);

  useEffect(() => {
    const flush = () => {
      if (dirty.current && document.visibilityState === "hidden") {
        void saveDraft(attemptId, toDraftRef.current(latest.current));
      }
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [attemptId]);

  return state;
}
