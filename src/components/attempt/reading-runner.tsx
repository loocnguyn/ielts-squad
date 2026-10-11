"use client";

import { useCallback, useState } from "react";
import { QuestionGroups, type Answers } from "@/components/tests/question-groups";
import { PassageView } from "@/components/tests/test-views";
import { countQuestions, type ReadingContent } from "@/lib/tests/types";
import { cn } from "@/lib/utils";
import { AttemptShell } from "./attempt-shell";
import { useAttemptClock, useAutosave, useSubmit, type AttemptContext } from "./use-attempt";

type Props = { ctx: AttemptContext; title: string; content: ReadingContent; draft: Answers };

export function unansweredWarning(total: number, answers: Answers) {
  const missing = total - Object.values(answers).filter((a) => a.trim()).length;
  return missing > 0 ? `Còn ${missing} câu chưa trả lời.` : null;
}

export function ReadingRunner({ ctx, title, content, draft }: Props) {
  const [answers, setAnswers] = useState<Answers>(draft);
  const [pane, setPane] = useState<"passage" | "questions">("passage");
  const { remainingMs } = useAttemptClock(ctx);
  const { submit, submitting } = useSubmit(ctx);
  const saveState = useAutosave(ctx.attemptId, answers, (a) => ({ answers: a }));

  const onChange = useCallback((n: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [String(n)]: value }));
  }, []);
  const onSubmit = useCallback(() => submit({ answers }), [submit, answers]);

  return (
    <AttemptShell
      skill="reading"
      title={title}
      remainingMs={remainingMs}
      saveState={saveState}
      submitting={submitting}
      warning={unansweredWarning(countQuestions(content), answers)}
      onSubmit={onSubmit}
    >
      {/* Phones show one pane at a time; from lg up it is the split screen of the computer test. */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:hidden" role="tablist">
        {(["passage", "questions"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={pane === value}
            className={cn(
              "rounded-md py-1.5 text-sm font-medium",
              pane === value ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
            onClick={() => setPane(value)}
          >
            {value === "passage" ? "Bài đọc" : "Câu hỏi"}
          </button>
        ))}
      </div>

      <div className="grid flex-1 gap-5 lg:grid-cols-2">
        <div
          className={cn(
            "rounded-2xl border bg-card p-5 lg:sticky lg:top-[4.75rem] lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto",
            pane !== "passage" && "hidden",
          )}
        >
          <PassageView passage={content.passage} />
        </div>
        <div className={cn("lg:block", pane !== "questions" && "hidden")}>
          <QuestionGroups groups={content.groups} answers={answers} onChange={onChange} />
        </div>
      </div>
    </AttemptShell>
  );
}
