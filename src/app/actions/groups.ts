"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const RPC_ERRORS: Record<string, string> = {
  invalid_code: "Mã mời không đúng. Kiểm tra lại 6 ký tự nhé.",
  group_full: "Nhóm này đã đủ 10 người.",
  too_many_groups: "Bạn đã ở tối đa 10 nhóm.",
  not_owner: "Chỉ chủ nhóm mới làm được việc này.",
  not_authenticated: "Phiên đăng nhập đã hết. Hãy đăng nhập lại.",
};

function describeError(message: string | undefined, fallback: string) {
  const key = Object.keys(RPC_ERRORS).find((k) => message?.includes(k));
  return key ? RPC_ERRORS[key] : fallback;
}

const groupName = z
  .string()
  .trim()
  .min(1, "Đặt tên cho nhóm.")
  .max(60, "Tên nhóm tối đa 60 ký tự.");

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = groupName.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", { p_name: parsed.data });
  if (error) return { error: describeError(error.message, "Không tạo được nhóm.") };
  redirect(`/groups/${data}`);
}

export async function joinGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { error: "Mã mời gồm 6 ký tự chữ và số." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error) return { error: describeError(error.message, "Không vào được nhóm.") };
  redirect(`/groups/${data}`);
}

const settingsSchema = z.object({
  group_id: z.uuid(),
  name: groupName,
  cutoff_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ chốt không hợp lệ."),
  full_test_sunday: z.boolean(),
});

export async function updateGroupSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const parsed = settingsSchema.safeParse({
    group_id: formData.get("group_id"),
    name: formData.get("name"),
    cutoff_time: formData.get("cutoff_time"),
    full_test_sunday: formData.get("full_test_sunday") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { group_id, ...values } = parsed.data;
  const supabase = await createClient();
  // RLS limits this to the owner; zero rows back means the caller is not it.
  const { data, error } = await supabase
    .from("groups")
    .update(values)
    .eq("id", group_id)
    .select("id");
  if (error) return { error: "Không lưu được cài đặt." };
  if (!data?.length) return { error: RPC_ERRORS.not_owner };

  refresh();
  return { ok: true };
}

export async function regenerateInviteCode(groupId: string): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("regenerate_invite_code", { p_group_id: groupId });
  if (error) return { error: describeError(error.message, "Không đổi được mã mời.") };
  refresh();
  return { ok: true };
}

export async function removeMember(groupId: string, userId: string): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { error: "Không xóa được thành viên này." };
  refresh();
  return { ok: true };
}

export async function leaveGroup(groupId: string): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .select("user_id");
  if (error || !data?.length) {
    return { error: "Chủ nhóm không rời nhóm được. Hãy xóa nhóm nếu không dùng nữa." };
  }
  redirect("/groups");
}

export async function deleteGroup(groupId: string): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select("id");
  if (error || !data?.length) return { error: RPC_ERRORS.not_owner };
  redirect("/groups");
}
