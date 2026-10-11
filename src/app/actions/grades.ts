"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidBand } from "@/lib/bands";
import { createClient } from "@/lib/supabase/server";
import { parseClaudeGrade } from "@/lib/tests/grading";

/** Re-validates the JSON pasted from Claude Pro and stores it as the attempt's grade. */
export async function saveClaudeGrade(
  attemptId: string,
  skill: "writing" | "speaking",
  pasted: string,
): Promise<{ errors?: string[] }> {
  await requireUser();
  if (pasted.length > 100_000) return { errors: ["Khối JSON quá lớn."] };

  const parsed = parseClaudeGrade(pasted, { attemptId, skill });
  if (!parsed.ok) return { errors: parsed.errors };

  const { overall_band, criteria, to_reach_8, corrections } = parsed.grade;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_claude_grade", {
    p_attempt_id: attemptId,
    p_band: overall_band,
    p_criteria: criteria,
    p_feedback: { to_reach_8, corrections },
  });
  if (error) return { errors: ["Không lưu được điểm. Bài này có phải của bạn và đã nộp chưa?"] };

  refresh();
  return {};
}

const reviewSchema = z.object({
  attemptId: z.uuid(),
  band: z.number().refine(isValidBand).nullable(),
  comment: z.string().trim().max(2000),
  vote: z.boolean(),
  /** Other attempts of the same skill and day: a reviewer has one "best answer" vote among them. */
  siblingAttemptIds: z.array(z.uuid()).max(20),
});

export async function savePeerReview(input: z.input<typeof reviewSchema>): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Nhận xét chưa hợp lệ." };
  const { attemptId, band, comment, vote, siblingAttemptIds } = parsed.data;
  if (band == null && !comment && !vote) return { error: "Hãy chấm điểm, viết nhận xét hoặc bình chọn." };

  const supabase = await createClient();
  const values = { band, comment: comment || null, vote };

  const { data: existing } = await supabase
    .from("peer_reviews")
    .select("id")
    .eq("attempt_id", attemptId)
    .eq("reviewer_id", user.id)
    .maybeSingle();

  // RLS only lets this through for a visible attempt that is not the reviewer's own.
  const { error } = existing
    ? await supabase.from("peer_reviews").update(values).eq("id", existing.id)
    : await supabase.from("peer_reviews").insert({ attempt_id: attemptId, ...values });
  if (error) return { error: "Không lưu được nhận xét." };

  if (vote && siblingAttemptIds.length > 0) {
    await supabase
      .from("peer_reviews")
      .update({ vote: false })
      .eq("reviewer_id", user.id)
      .in("attempt_id", siblingAttemptIds);
  }

  refresh();
  return {};
}
