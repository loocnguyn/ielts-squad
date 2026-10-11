"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Volume2 } from "lucide-react";
import { QuestionGroups, type Answers } from "@/components/tests/question-groups";
import { Button } from "@/components/ui/button";
import { countQuestions, type ListeningContent } from "@/lib/tests/types";
import { AttemptShell } from "./attempt-shell";
import { unansweredWarning } from "./reading-runner";
import { formatClock, useAttemptClock, useAutosave, useSubmit, type AttemptContext } from "./use-attempt";

type Props = {
  ctx: AttemptContext;
  title: string;
  content: ListeningContent;
  draft: Answers;
  audioUrl: string | null;
  /** Length of the recording; the rest of the time limit is for checking answers. */
  audioSeconds: number;
};

/**
 * The recording plays once, locked to the attempt clock: wherever the page is
 * (re)opened, playback resumes at "time since the attempt started". Pausing,
 * reloading or losing the tab can only skip audio, never replay it.
 */
export function ListeningRunner({ ctx, title, content, draft, audioUrl, audioSeconds }: Props) {
  const [answers, setAnswers] = useState<Answers>(draft);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { elapsedMs, remainingMs } = useAttemptClock(ctx);
  const { submit, submitting } = useSubmit(ctx);
  const saveState = useAutosave(ctx.attemptId, answers, (a) => ({ answers: a }));

  const elapsedSeconds = elapsedMs / 1000;
  const audioOver = elapsedSeconds >= audioSeconds;
  const elapsedRef = useRef(elapsedSeconds);
  useEffect(() => {
    elapsedRef.current = elapsedSeconds;
  });

  /** Jumps to "now" on the attempt clock and plays. Returns false if there is nothing left to play. */
  const playFromClock = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || elapsedRef.current >= audioSeconds) return null;
    audio.currentTime = Math.max(0, elapsedRef.current);
    return audio.play();
  }, [audioSeconds]);

  // Autoplay on arrival. If the browser refuses, the button below is the gesture it needs.
  useEffect(() => {
    playFromClock()?.catch(() => setBlocked(true));
  }, [playFromClock]);

  const play = useCallback(() => {
    playFromClock()
      ?.then(() => setBlocked(false))
      .catch(() => setBlocked(true));
  }, [playFromClock]);

  const onChange = useCallback((n: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [String(n)]: value }));
  }, []);
  const onSubmit = useCallback(() => submit({ answers }), [submit, answers]);

  return (
    <AttemptShell
      skill="listening"
      title={title}
      remainingMs={remainingMs}
      saveState={saveState}
      submitting={submitting}
      warning={unansweredWarning(countQuestions(content), answers)}
      onSubmit={onSubmit}
    >
      <div className="sticky top-[4.25rem] z-20 mb-5 rounded-2xl border bg-card p-4 shadow-sm">
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="auto"
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-skill-listening/15">
            {playing ? (
              <Volume2 className="size-5 animate-pulse text-skill-listening" />
            ) : (
              <Headphones className="size-5 text-skill-listening" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {!audioUrl
                ? "Không tải được audio của đề này."
                : audioOver
                  ? "Audio đã phát xong. Dùng thời gian còn lại để soát đáp án."
                  : playing
                    ? "Đang phát. Audio chỉ phát một lần."
                    : "Audio chỉ phát một lần và không dừng được."}
            </p>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-skill-listening/20"
              role="progressbar"
              aria-label="Tiến độ audio"
              aria-valuemin={0}
              aria-valuemax={audioSeconds}
              aria-valuenow={Math.min(audioSeconds, Math.round(elapsedSeconds))}
            >
              <div
                className="h-full rounded-full bg-skill-listening"
                style={{ width: `${Math.min(100, (elapsedSeconds / audioSeconds) * 100)}%` }}
              />
            </div>
          </div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {formatClock(Math.min(audioSeconds, elapsedSeconds) * 1000)} / {formatClock(audioSeconds * 1000)}
          </span>
          {audioUrl && !audioOver && !playing && (
            <Button size="sm" onClick={play}>
              {blocked ? "Bấm để nghe" : "Nghe tiếp"}
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {content.parts.map((part) => (
          <section key={part.part} className="flex flex-col gap-4">
            <div>
              <h2 className="font-heading text-lg font-bold">Part {part.part}</h2>
              <p className="text-sm text-muted-foreground">{part.context}</p>
            </div>
            <QuestionGroups groups={part.groups} answers={answers} onChange={onChange} />
          </section>
        ))}
      </div>
    </AttemptShell>
  );
}
