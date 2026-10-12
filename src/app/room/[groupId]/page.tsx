import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SpeakingRoom, type SpeakingTurn } from "@/components/room/speaking-room";
import { requireProfile } from "@/lib/auth";
import { todayInVietnam } from "@/lib/data/daily";
import { getGroup, getGroupMembers } from "@/lib/data/groups";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Phòng nói" };

// A live call: nothing here can be prepared ahead of the request.
export const instant = false;

export default function RoomPage({ params }: PageProps<"/room/[groupId]">) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-muted-foreground">Đang mở phòng…</div>}>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: Pick<PageProps<"/room/[groupId]">, "params">) {
  const { groupId } = await params;
  const profile = await requireProfile(`/room/${groupId}`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  const date = todayInVietnam();
  const supabase = await createClient();
  const [members, turns] = await Promise.all([
    getGroupMembers(group.id),
    supabase
      .from("speaking_turns")
      .select("id, candidate_id, examiner_id, attempt_id, started_at, finished_at")
      .eq("group_id", group.id)
      .eq("date", date),
  ]);

  return (
    <SpeakingRoom
      group={{ id: group.id, name: group.name }}
      me={{ id: profile.id, name: profile.display_name || "Bạn" }}
      members={members.map((m) => ({ id: m.user_id, name: m.profile.display_name || "Chưa đặt tên" }))}
      date={date}
      initialTurns={(turns.data ?? []) as SpeakingTurn[]}
    />
  );
}
