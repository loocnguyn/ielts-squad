"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { buildSegments } from "@/lib/audio/listening-script";
import { createClient } from "@/lib/supabase/client";
import type { ListeningContent, ListeningTranscript } from "@/lib/tests/types";
import type { TtsMessage, TtsRequest } from "@/workers/tts.worker";

/** Time after the recording ends for checking answers, as in the real test. */
const CHECKING_SECONDS = 120;

type Props = { testId: string; content: ListeningContent; audioPath: string | null };

export function ListeningAudioBuilder({ testId, content, audioPath }: Props) {
  const router = useRouter();
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audioPath) return;
    let cancelled = false;
    createClient()
      .storage.from("test-audio")
      .createSignedUrl(audioPath, 3600)
      .then(({ data }) => {
        if (!cancelled) setAudioUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [audioPath]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  async function generate() {
    setStatus("Đang lấy lời thoại");
    setProgress(0);
    const supabase = createClient();
    const { data: secrets, error } = await supabase.rpc("get_test_secrets", { p_test_id: testId });
    const transcript = (secrets as { transcript: ListeningTranscript } | null)?.transcript;
    if (error || !transcript?.parts) {
      setStatus(null);
      toast.error("Không lấy được lời thoại của đề này.");
      return;
    }

    const worker = new Worker(new URL("../../workers/tts.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = async (event: MessageEvent<TtsMessage>) => {
      const message = event.data;
      if (message.type === "status") setStatus(message.message);
      if (message.type === "progress") setProgress(Math.round((message.done / message.total) * 100));
      if (message.type === "error") {
        worker.terminate();
        setStatus(null);
        toast.error(`Tạo audio thất bại: ${message.message}`);
      }
      if (message.type === "done") {
        worker.terminate();
        setStatus("Đang tải audio lên");
        const path = `${testId}/audio.mp3`;
        const upload = await supabase.storage
          .from("test-audio")
          .upload(path, new Blob([message.mp3], { type: "audio/mpeg" }), {
            contentType: "audio/mpeg",
            upsert: true,
          });
        if (upload.error) {
          setStatus(null);
          toast.error(`Không tải được audio lên: ${upload.error.message}`);
          return;
        }
        const saved = await supabase.rpc("set_test_audio", {
          p_test_id: testId,
          p_audio_path: path,
          p_duration_sec: message.seconds + CHECKING_SECONDS,
        });
        setStatus(null);
        if (saved.error) {
          toast.error("Đã tải audio lên nhưng không lưu được vào đề.");
          return;
        }
        toast.success("Đã tạo audio. Đề này sẵn sàng để phát cho nhóm.");
        router.refresh();
      }
    };

    worker.postMessage({ segments: buildSegments(content, transcript) } satisfies TtsRequest);
  }

  const busy = status !== null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 font-heading font-bold">
        <AudioLines className="size-5 text-skill-listening" /> Audio
      </h2>
      {audioPath ? (
        <>
          <p className="text-sm text-muted-foreground">Đề đã có audio và sẵn sàng để phát cho nhóm.</p>
          {audioUrl && <audio controls preload="none" src={audioUrl} className="w-full" />}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Đề Listening cần audio trước khi được phát cho nhóm. Kokoro sẽ đọc lời thoại bằng nhiều
          giọng ngay trên máy bạn, mất vài phút và chỉ cần làm một lần.
        </p>
      )}
      {busy && (
        <div className="flex flex-col gap-2" role="status">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> {status}
            {progress > 0 && progress < 100 && ` (${progress}%)`}
          </p>
          <Progress value={progress} />
        </div>
      )}
      <Button type="button" variant={audioPath ? "outline" : "default"} className="h-10 w-fit" disabled={busy} onClick={generate}>
        <AudioLines /> {audioPath ? "Tạo lại audio" : "Tạo audio"}
      </Button>
    </section>
  );
}
