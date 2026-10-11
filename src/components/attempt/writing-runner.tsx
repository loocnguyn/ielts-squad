"use client";

import { useCallback, useState } from "react";
import { WritingPromptView } from "@/components/tests/test-views";
import { countWords } from "@/lib/tests/grading";
import type { WritingContent } from "@/lib/tests/types";
import { cn } from "@/lib/utils";
import { AttemptShell } from "./attempt-shell";
import { useAttemptClock, useAutosave, useSubmit, type AttemptContext } from "./use-attempt";

type Props = { ctx: AttemptContext; title: string; content: WritingContent; draft: string };

export function WritingRunner({ ctx, title, content, draft }: Props) {
  const [essay, setEssay] = useState(draft);
  const { remainingMs } = useAttemptClock(ctx);
  const { submit, submitting } = useSubmit(ctx);
  const saveState = useAutosave(ctx.attemptId, essay, (text) => ({ essay: text }));

  const minimum = content.task === 1 ? 150 : 250;
  const words = countWords(essay);
  const onSubmit = useCallback(() => submit({ essay }), [submit, essay]);

  return (
    <AttemptShell
      skill="writing"
      title={title}
      remainingMs={remainingMs}
      saveState={saveState}
      submitting={submitting}
      warning={words < minimum ? `Bài mới có ${words} từ, đề yêu cầu ít nhất ${minimum}.` : null}
      onSubmit={onSubmit}
    >
      <div className="grid flex-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 lg:sticky lg:top-[4.75rem] lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          <WritingPromptView content={content} />
        </div>
        <div className="flex min-h-[60dvh] flex-col gap-2">
          <textarea
            aria-label="Bài viết của bạn"
            className="flex-1 resize-none rounded-2xl border border-input bg-card p-5 leading-7 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Viết bài của bạn ở đây…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="sentences"
            value={essay}
            onChange={(e) => setEssay(e.target.value)}
          />
          <p className="flex items-center justify-between text-sm text-muted-foreground" aria-live="polite">
            <span>
              <span className={cn("font-semibold tabular-nums", words >= minimum ? "text-success" : "text-foreground")}>
                {words}
              </span>{" "}
              từ
            </span>
            <span>Tối thiểu {minimum} từ</span>
          </p>
        </div>
      </div>
    </AttemptShell>
  );
}
