import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Crown } from "lucide-react";
import { GroupSettingsForm } from "@/components/groups/group-settings-form";
import { InviteCard } from "@/components/groups/invite-card";
import {
  DeleteGroupButton,
  LeaveGroupButton,
  RemoveMemberButton,
} from "@/components/groups/member-actions";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth";
import { formatBand } from "@/lib/bands";
import { getGroup, getGroupMembers } from "@/lib/data/groups";

export const metadata: Metadata = { title: "Thành viên" };

export default async function MembersPage({ params }: PageProps<"/groups/[groupId]/members">) {
  const { groupId } = await params;
  const profile = await requireProfile(`/groups/${groupId}/members`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  const members = await getGroupMembers(group.id);
  const isOwner = group.owner_id === profile.id;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading font-bold">
          Thành viên <span className="font-normal text-muted-foreground">{members.length}/10</span>
        </h2>
        <ul className="mt-3 divide-y">
          {members.map((member) => {
            const name = member.profile.display_name || "Chưa đặt tên";
            return (
              <li key={member.user_id} className="flex items-center gap-3 py-3">
                <UserAvatar name={name} src={member.profile.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{name}</span>
                    {member.user_id === profile.id && (
                      <span className="text-xs text-muted-foreground">(bạn)</span>
                    )}
                    {member.role === "owner" && (
                      <Badge variant="secondary" className="gap-1">
                        <Crown className="size-3 text-streak" /> Chủ nhóm
                      </Badge>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Band {formatBand(member.profile.current_band)} → mục tiêu{" "}
                    {formatBand(member.profile.target_band)}
                  </p>
                </div>
                {isOwner && member.user_id !== profile.id && (
                  <RemoveMemberButton groupId={group.id} userId={member.user_id} name={name} />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-4">
        <InviteCard groupId={group.id} code={group.invite_code} isOwner={isOwner} />

        {isOwner && (
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-4 font-heading font-bold">Cài đặt nhóm</h2>
            <GroupSettingsForm group={group} />
          </section>
        )}

        <section className="rounded-2xl border border-destructive/30 bg-card p-5">
          <h2 className="font-heading font-bold">{isOwner ? "Xóa nhóm" : "Rời nhóm"}</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            {isOwner
              ? "Chủ nhóm không rời nhóm được. Nếu nhóm không dùng nữa, bạn có thể xóa hẳn."
              : "Bạn có thể vào lại bất cứ lúc nào bằng mã mời."}
          </p>
          {isOwner ? (
            <DeleteGroupButton groupId={group.id} name={group.name} />
          ) : (
            <LeaveGroupButton groupId={group.id} />
          )}
        </section>
      </div>
    </div>
  );
}
