import { createClient } from "@/lib/supabase/client";

// Browser-side calls for an attempt in progress. The database functions do all
// the checking (ownership, deadline, scoring); these only carry the payload.

export type SubmitPayload = {
  answers?: Record<string, string>;
  essay?: string;
  transcript?: string;
  audioPath?: string;
  speakingSeconds?: number;
};

export type SubmitResult =
  | { ok: true; late: boolean; raw: number | null; total: number | null; band: number | null }
  | { ok: false; alreadySubmitted: boolean; message: string };

export async function saveDraft(
  attemptId: string,
  draft: { answers?: Record<string, string>; essay?: string },
) {
  const { data, error } = await createClient().rpc("save_attempt_draft", {
    p_attempt_id: attemptId,
    p_answers: draft.answers ?? null,
    p_essay: draft.essay ?? null,
  });
  return !error && data === true;
}

export async function submitAttempt(attemptId: string, payload: SubmitPayload): Promise<SubmitResult> {
  const { data, error } = await createClient().rpc("submit_attempt", {
    p_attempt_id: attemptId,
    p_answers: payload.answers ?? null,
    p_essay: payload.essay ?? null,
    p_transcript: payload.transcript ?? null,
    p_audio_path: payload.audioPath ?? null,
    p_speaking_seconds: payload.speakingSeconds ?? null,
  });
  if (error) {
    const alreadySubmitted = error.message.includes("already_submitted");
    return {
      ok: false,
      alreadySubmitted,
      message: alreadySubmitted ? "Bài này đã được nộp rồi." : "Không nộp được bài. Kiểm tra mạng rồi thử lại.",
    };
  }
  const result = data as { late: boolean; raw: number | null; total: number | null; band: number | null };
  return { ok: true, ...result };
}
