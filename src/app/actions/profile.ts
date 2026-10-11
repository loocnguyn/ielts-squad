"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isValidBand } from "@/lib/bands";
import { safeNextPath } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const band = z.coerce.number().refine(isValidBand, "Band không hợp lệ.");

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, "Nhập tên hiển thị.")
    .max(40, "Tên hiển thị tối đa 40 ký tự."),
  current_band: z.preprocess((v) => (v === "" || v == null ? null : v), band.nullable()),
  target_band: band,
  exam_date: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.iso.date("Ngày thi không hợp lệ.").nullable(),
  ),
});

export async function saveProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    display_name: formData.get("display_name"),
    current_band: formData.get("current_band"),
    target_band: formData.get("target_band"),
    exam_date: formData.get("exam_date"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ." };
  }

  const onboarding = formData.get("onboarding") === "1";
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      ...parsed.data,
      ...(onboarding ? { onboarded_at: new Date().toISOString() } : {}),
    })
    .eq("id", user.id);

  if (error) return { error: "Không lưu được hồ sơ. Thử lại nhé." };

  if (onboarding) redirect(safeNextPath(formData.get("next") as string | null));
  refresh();
  return { ok: true };
}
