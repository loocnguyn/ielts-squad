"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Library, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadBank } from "@/app/actions/bank";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BankStatus } from "@/lib/data/bank";
import { createClient } from "@/lib/supabase/client";

/** Time after the recording ends for checking answers, as in the real test. */
const CHECKING_SECONDS = 120;

function audioSeconds(file: File) {
  return new Promise<number>((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable"));
    };
    audio.src = url;
  });
}

/** Loads the pre-written bank and uploads the listening audio rendered for it. */
export function BankLoader({ status }: { status: BankStatus }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [loading, startLoading] = useTransition();
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);

  const waiting = status.available - status.loaded;
  const missing = status.missingAudio;

  function load() {
    startLoading(async () => {
      const result = await loadBank();
      if (result.error) toast.error(result.error);
      else toast.success(result.imported ? `Đã nạp ${result.imported} đề vào ngân hàng.` : "Ngân hàng đã có đủ bộ đề soạn sẵn.");
    });
  }

  async function uploadAudio(files: FileList) {
    const byKey = new Map([...files].map((file) => [file.name.replace(/\.mp3$/i, ""), file]));
    const jobs = missing.flatMap((test) => {
      const file = byKey.get(test.key);
      return file ? [{ ...test, file }] : [];
    });
    if (jobs.length === 0) {
      toast.error("Không thấy file nào khớp. File audio có tên như L01.mp3.");
      return;
    }

    const supabase = createClient();
    setUpload({ done: 0, total: jobs.length });
    let done = 0;
    for (const job of jobs) {
      const path = `${job.id}/audio.mp3`;
      try {
        const seconds = await audioSeconds(job.file);
        const stored = await supabase.storage.from("test-audio").upload(path, job.file, { contentType: "audio/mpeg" });
        if (stored.error && !/exists|duplicate/i.test(stored.error.message)) throw new Error(stored.error.message);
        const saved = await supabase.rpc("set_test_audio", {
          p_test_id: job.id,
          p_audio_path: path,
          p_duration_sec: Math.round(seconds) + CHECKING_SECONDS,
        });
        if (saved.error) throw new Error(saved.error.message);
        done += 1;
        setUpload({ done, total: jobs.length });
      } catch (error) {
        toast.error(`${job.key}: không tải lên được (${error instanceof Error ? error.message : "lỗi"}).`);
        break;
      }
    }
    setUpload(null);
    if (done) toast.success(`Đã tải lên audio cho ${done} đề Listening.`);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <h2 className="flex items-center gap-2 font-heading font-bold">
        <Library className="size-5" /> Bộ đề soạn sẵn
      </h2>
      <p className="text-sm text-muted-foreground">
        {status.loaded}/{status.available} đề đã vào ngân hàng. Đề soạn sẵn không hiện nội dung ở đây, nên
        không ai xem trước được đề của ngày sau.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" className="h-10" disabled={loading || waiting === 0} onClick={load}>
          {loading ? <Loader2 className="animate-spin" /> : <Library />}
          {waiting > 0 ? `Nạp ${waiting} đề soạn sẵn` : "Đã nạp đủ"}
        </Button>
        {missing.length > 0 && (
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={upload !== null}
              onClick={() => input.current?.click()}
            >
              <AudioLines /> Tải audio cho {missing.length} đề Listening
            </Button>
            <input
              ref={input}
              type="file"
              accept=".mp3,audio/mpeg"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files?.length) void uploadAudio(event.target.files);
                event.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {missing.length > 0 && !upload && (
        <p className="text-sm text-muted-foreground">
          Đề Listening chỉ được phát khi đã có audio. Chọn tất cả file MP3 trong thư mục audio đã đọc sẵn
          (tên file như L01.mp3).
        </p>
      )}
      {upload && (
        <div className="flex flex-col gap-2" role="status">
          <p className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Đang tải audio lên ({upload.done}/{upload.total})
          </p>
          <Progress value={(upload.done / upload.total) * 100} />
        </div>
      )}
    </section>
  );
}
