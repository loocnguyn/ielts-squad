"use client";

import { useState, useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { savePeerReview } from "@/app/actions/grades";
import { Button } from "@/components/ui/button";
import { BAND_OPTIONS } from "@/lib/bands";
import type { PeerReview } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  attemptId: string;
  /** What the band means here: overall for Writing, Pronunciation for Speaking. */
  bandLabel: string;
  existing: Pick<PeerReview, "band" | "comment" | "vote"> | null;
  /** Attempts of the same skill and day by other people, for the single "best answer" vote. */
  siblingAttemptIds: string[];
  allowVote: boolean;
};

export function PeerReviewForm({ attemptId, bandLabel, existing, siblingAttemptIds, allowVote }: Props) {
  const [band, setBand] = useState(existing?.band != null ? String(existing.band) : "");
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [vote, setVote] = useState(existing?.vote ?? false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await savePeerReview({
            attemptId,
            band: band ? Number(band) : null,
            comment,
            vote,
            siblingAttemptIds,
          });
          if (result.error) toast.error(result.error);
          else toast.success("Đã lưu nhận xét của bạn.");
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          {bandLabel}
          <select
            className="h-8 rounded-md border border-input bg-card px-2 text-sm"
            value={band}
            onChange={(e) => setBand(e.target.value)}
          >
            <option value="">Chưa chấm</option>
            {BAND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
        {allowVote && (
          <button
            type="button"
            aria-pressed={vote}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium",
              vote && "border-streak bg-streak/15",
            )}
            onClick={() => setVote((v) => !v)}
          >
            <Star className={cn("size-4", vote && "fill-streak text-streak")} />
            Hay nhất hôm nay
          </button>
        )}
      </div>
      <textarea
        aria-label="Nhận xét cho bạn"
        className="min-h-20 rounded-lg border border-input bg-card p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        placeholder="Điểm mạnh, chỗ cần sửa…"
        maxLength={2000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button type="submit" variant="secondary" className="w-fit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {existing ? "Cập nhật nhận xét" : "Gửi nhận xét"}
      </Button>
    </form>
  );
}
