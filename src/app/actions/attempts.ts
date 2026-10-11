"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { isSkill } from "@/lib/skills";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  day_closed: "Ngày hôm nay đã chốt, không bắt đầu bài mới được nữa.",
  no_test: "Kỹ năng này hôm nay chưa có đề.",
  not_found: "Không tìm thấy bộ đề này.",
};

/** Starts the server-side clock for one skill of today's set. */
export async function startAttempt(dailySetId: string, skill: string): Promise<{ error?: string }> {
  await requireUser();
  if (!isSkill(skill)) return { error: ERRORS.not_found };

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_attempt", { p_daily_set_id: dailySetId, p_skill: skill });
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
    return { error: key ? ERRORS[key] : "Không bắt đầu được bài. Thử lại nhé." };
  }
  refresh();
  return {};
}
