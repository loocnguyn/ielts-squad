"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SKILL_META } from "@/lib/skills";
import { createClient } from "@/lib/supabase/client";
import type { Skill } from "@/lib/types";

export type SkillDoneEvent = { user_id: string; name: string; skill: Skill };

export const groupChannel = (groupId: string) => `group:${groupId}`;

/** Tells the rest of the group a skill was just finished. Best effort. */
export async function announceSkillDone(groupId: string, payload: SkillDoneEvent) {
  const supabase = createClient();
  await supabase.realtime.setAuth();
  const channel = supabase.channel(groupChannel(groupId), { config: { private: true } });
  try {
    // A one-off message needs no socket: deliver it over HTTP.
    await channel.httpSend("skill_done", payload);
  } finally {
    await supabase.removeChannel(channel);
  }
}

/**
 * Keeps the board fresh: a toast and refresh when a group mate finishes a
 * skill, plus a slow poll in case a realtime message is missed.
 */
export function GroupLive({ groupId, userId }: { groupId: string; userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(groupChannel(groupId), { config: { private: true } })
        .on("broadcast", { event: "skill_done" }, ({ payload }) => {
          const event = payload as SkillDoneEvent;
          if (event.user_id !== userId) {
            toast(`${event.name} vừa xong ${SKILL_META[event.skill]?.label ?? event.skill}`);
          }
          router.refresh();
        })
        .subscribe();
    });

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, userId, router]);

  return null;
}
