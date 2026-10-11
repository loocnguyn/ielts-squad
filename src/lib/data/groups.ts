import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Group, MemberRole, Profile } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID.test(value);
}

export type MemberProfile = Pick<
  Profile,
  "id" | "display_name" | "avatar_url" | "current_band" | "target_band"
>;

export type GroupMemberWithProfile = {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile: MemberProfile;
};

export type MyGroup = Group & { role: MemberRole; member_count: number };

export const getMyGroups = cache(async (userId: string): Promise<MyGroup[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select("role, joined_at, groups(*, group_members(count))")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);

  type Row = {
    role: MemberRole;
    groups: (Group & { group_members: { count: number }[] }) | null;
  };
  return (data as unknown as Row[])
    .filter((row) => row.groups)
    .map((row) => {
      const { group_members, ...group } = row.groups!;
      return { ...group, role: row.role, member_count: group_members[0]?.count ?? 0 };
    });
});

/** Null when the group does not exist or the caller is not a member (RLS). */
export const getGroup = cache(async (groupId: string): Promise<Group | null> => {
  if (!isUuid(groupId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("groups").select("*").eq("id", groupId).maybeSingle();
  return (data as Group | null) ?? null;
});

export const getGroupMembers = cache(
  async (groupId: string): Promise<GroupMemberWithProfile[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("group_members")
      .select(
        "user_id, role, joined_at, profile:profiles(id, display_name, avatar_url, current_band, target_band)",
      )
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data as unknown as GroupMemberWithProfile[];
  },
);
