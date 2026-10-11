"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { CueCard } from "@/components/tests/test-views";
import { Button } from "@/components/ui/button";
import {
  decodeTo16kMono,
  shouldUseLiveRecognition,
  startLiveRecognition,
  transcribe,
} from "@/lib/audio/recording";
import { createClient } from "@/lib/supabase/client";
import type { SubmitPayload } from "@/lib/attempt-client";
import type { SpeakingContent } from "@/lib/tests/types";
import { AttemptShell } from "./attempt-shell";
import { formatClock, useAttemptClock, useSubmit, type AttemptContext } from "./use-attempt";

type Props = { ctx: AttemptContext; title: string; content: SpeakingContent };
type Phase = "ready" | "prep" | "recording" | "processing";

const PREP_SECONDS = 60;
const LONG_TURN_SECONDS = 120;

function questionsOf(content: SpeakingContent) {
  if (content.part === 1) return content.topics.flatMap((t) => t.questions.map((q) => ({ topic: t.topic, q })));
  if (content.part === 3) return content.questions.map((q) => ({ topic: content.theme, q }));
  return [];
}

export function SpeakingRunner({ ctx, title, content }: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [status, setStatus] = useState("");
  const [index, setIndex] = useState(0);
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [spoken, setSpoken] = useState(0);
  /** Set when the recording is processed but handing it in failed, so it can be retried. */
  const [unsent, setUnsent] = useState<SubmitPayload | null>(null);
  const { remainingMs } = useAttemptClock(ctx);
  const { submit } = useSubmit(ctx);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const live = useRef<ReturnType<typeof startLiveRecognition>>(null);
  const finishing = useRef(false);
  const starting = useRef(false);
  const prepStartedAt = useRef(0);
  const remainingRef = useRef(remainingMs);
  useEffect(() => {
    remainingRef.current = remainingMs;
  });

  const questions = questionsOf(content);
  const isLongTurn = content.part === 2;

  const finish = useCallback(
    async (blob: Blob | null, seconds: number) => {
      if (finishing.current) return;
      finishing.current = true;
      setPhase("processing");
      const liveText = live.current?.stop() ?? "";
      stream.current?.getTracks().forEach((track) => track.stop());

      const handIn = async (payload: SubmitPayload) => {
        setStatus("Đang nộp bài");
        setUnsent(null);
        if (!(await submit(payload))) setUnsent(payload);
      };

      if (!blob || blob.size === 0) {
        await handIn({ transcript: "", speakingSeconds: 0 });
        return;
      }

      let transcript = liveText;
      try {
        setStatus("Đang xử lý bản ghi");
        const samples = await decodeTo16kMono(blob);
        transcript = await transcribe(samples, setStatus);
      } catch {
        if (!liveText) {
          toast.warning("Không chuyển được giọng nói thành chữ. Bản ghi âm vẫn được nộp để nhóm nghe.");
        }
      }

      setStatus("Đang tải bản ghi lên");
      const path = `${ctx.userId}/${ctx.attemptId}.webm`;
      const upload = await createClient()
        .storage.from("recordings")
        .upload(path, blob, { contentType: blob.type.split(";")[0] || "audio/webm", upsert: false });
      // "Already exists" means an earlier try got the file up before failing to submit.
      const uploaded = !upload.error || upload.error.message.toLowerCase().includes("exist");
      if (!uploaded) toast.warning("Không tải được bản ghi âm lên; chỉ nộp phần chữ.");

      await handIn({
        transcript,
        audioPath: uploaded ? path : undefined,
        speakingSeconds: Math.round(seconds),
      });
    },
    [ctx.attemptId, ctx.userId, submit],
  );

  const stopRecording = useCallback(() => {
    const active = recorder.current;
    if (active && active.state !== "inactive") active.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Cần quyền dùng micro để làm Speaking. Hãy cho phép rồi thử lại.");
      starting.current = false;
      setPhase("ready");
      return;
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const mediaRecorder = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) chunks.current.push(event.data);
    };
    mediaRecorder.onstop = () => {
      const seconds = (performance.now() - startedAt.current) / 1000;
      void finish(new Blob(chunks.current, { type: mediaRecorder.mimeType }), seconds);
    };
    recorder.current = mediaRecorder;
    if (shouldUseLiveRecognition()) live.current = startLiveRecognition();
    startedAt.current = performance.now();
    mediaRecorder.start(1000);
    setPhase("recording");
  }, [finish]);

  // Part 2: one minute to prepare, then the recording starts by itself.
  useEffect(() => {
    if (phase !== "prep") return;
    const timer = setInterval(() => {
      const left = PREP_SECONDS - Math.floor((performance.now() - prepStartedAt.current) / 1000);
      setPrepLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(timer);
        void startRecording();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase, startRecording]);

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => setSpoken((performance.now() - startedAt.current) / 1000), 500);
    return () => clearInterval(timer);
  }, [phase]);

  // Stop at the two-minute mark of a long turn, or just before the attempt's deadline.
  useEffect(() => {
    if (phase === "recording" && ((isLongTurn && spoken >= LONG_TURN_SECONDS) || remainingMs <= 3000)) {
      stopRecording();
    }
  }, [phase, isLongTurn, spoken, remainingMs, stopRecording]);

  // The clock ran out before any recording started: hand in an empty attempt.
  useEffect(() => {
    if (phase !== "ready" && phase !== "prep") return;
    const timer = setTimeout(() => void finish(null, 0), remainingRef.current);
    return () => clearTimeout(timer);
  }, [phase, finish]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const current = questions[index];
  const isLast = index >= questions.length - 1;

  return (
    <AttemptShell
      skill="speaking"
      title={title}
      remainingMs={remainingMs}
      submitting={phase === "processing"}
      canSubmit={false}
      onSubmit={stopRecording}
    >
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 py-6">
        {phase === "ready" && (
          <div className="flex flex-col items-center gap-5 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-skill-speaking/15">
              <Mic className="size-8 text-skill-speaking" />
            </span>
            <div>
              <h2 className="font-heading text-xl font-bold">Speaking Part {content.part}</h2>
              <p className="mt-2 text-muted-foreground text-pretty">
                {isLongTurn
                  ? "Bạn có 1 phút đọc cue card và chuẩn bị, sau đó máy tự ghi âm tối đa 2 phút."
                  : `Có ${questions.length} câu hỏi, hiện từng câu một. Trả lời liền mạch như đang nói với giám khảo, xong câu nào bấm sang câu tiếp.`}{" "}
                Ghi âm xong sẽ được chuyển thành chữ ngay trên máy bạn.
              </p>
            </div>
            <Button
              className="h-11 px-6 text-base"
              onClick={() => {
                if (!isLongTurn) return void startRecording();
                prepStartedAt.current = performance.now();
                setPhase("prep");
              }}
            >
              <Mic /> {isLongTurn ? "Xem cue card" : "Bắt đầu ghi âm"}
            </Button>
          </div>
        )}

        {isLongTurn && (phase === "prep" || phase === "recording") && content.part === 2 && (
          <>
            <CueCard card={content.cue_card} />
            {phase === "prep" ? (
              <div className="flex flex-col items-center gap-3">
                <p className="font-mono text-4xl font-bold tabular-nums" role="timer" aria-label="Thời gian chuẩn bị">
                  {formatClock(prepLeft * 1000)}
                </p>
                <p className="text-sm text-muted-foreground">Chuẩn bị ý trong đầu hoặc ghi ra giấy.</p>
                <Button variant="secondary" onClick={() => void startRecording()}>
                  Tôi sẵn sàng, ghi âm luôn
                </Button>
              </div>
            ) : (
              <RecordingBar seconds={spoken} limit={LONG_TURN_SECONDS}>
                <Button variant="secondary" disabled={spoken < 20} onClick={stopRecording}>
                  <Square /> Nói xong
                </Button>
              </RecordingBar>
            )}
          </>
        )}

        {!isLongTurn && phase === "recording" && current && (
          <>
            <div className="rounded-2xl border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {current.topic} · Câu {index + 1}/{questions.length}
              </p>
              <p className="mt-3 font-heading text-2xl font-bold text-balance">{current.q}</p>
            </div>
            <RecordingBar seconds={spoken}>
              {isLast ? (
                <Button onClick={stopRecording}>
                  <Square /> Kết thúc
                </Button>
              ) : (
                <Button onClick={() => setIndex((i) => i + 1)}>
                  Câu tiếp <ChevronRight />
                </Button>
              )}
            </RecordingBar>
          </>
        )}

        {phase === "processing" && unsent && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="font-medium">Chưa nộp được bài</p>
            <p className="text-sm text-muted-foreground">
              Bản ghi của bạn vẫn còn ở đây. Kiểm tra mạng rồi nộp lại.
            </p>
            <Button
              onClick={async () => {
                const payload = unsent;
                setUnsent(null);
                if (!(await submit(payload))) setUnsent(payload);
              }}
            >
              Nộp lại
            </Button>
          </div>
        )}

        {phase === "processing" && !unsent && (
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Loader2 className="size-8 animate-spin text-skill-speaking" />
            <p className="font-medium">{status || "Đang xử lý"}</p>
            <p className="text-sm text-muted-foreground">Đừng đóng trang này. Lần đầu cần tải model nên sẽ lâu hơn.</p>
          </div>
        )}
      </div>
    </AttemptShell>
  );
}

function RecordingBar({
  seconds,
  limit,
  children,
}: {
  seconds: number;
  limit?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border bg-card px-5 py-3">
      <span className="inline-flex items-center gap-2.5 font-mono font-bold tabular-nums">
        <span className="size-3 animate-pulse rounded-full bg-destructive" aria-hidden />
        <span aria-label="Đang ghi âm">
          {formatClock(seconds * 1000)}
          {limit ? ` / ${formatClock(limit * 1000)}` : ""}
        </span>
      </span>
      {children}
    </div>
  );
}
