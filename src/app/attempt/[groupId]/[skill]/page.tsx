import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ListeningRunner } from "@/components/attempt/listening-runner";
import { ReadingRunner } from "@/components/attempt/reading-runner";
import { SpeakingRunner } from "@/components/attempt/speaking-runner";
import { StartScreen } from "@/components/attempt/start-screen";
import type { AttemptContext } from "@/components/attempt/use-attempt";
import { WritingRunner } from "@/components/attempt/writing-runner";
import { requireProfile } from "@/lib/auth";
import { getTest } from "@/lib/data/bank";
import { ensureTodaySet, getMyAttempt, testIdFor } from "@/lib/data/daily";
import { getGroup } from "@/lib/data/groups";
import { isSkill } from "@/lib/skills";
import { createClient } from "@/lib/supabase/server";
import type {
  ListeningContent,
  ReadingContent,
  SpeakingContent,
  WritingContent,
} from "@/lib/tests/types";

export const metadata: Metadata = { title: "Làm bài" };

/** Checking time after the recording, matching what the audio builder adds. */
const LISTENING_CHECK_SECONDS = 120;

// An attempt is live by nature: the clock and the draft come from the server.
export const instant = false;

export default function AttemptPage({ params }: PageProps<"/attempt/[groupId]/[skill]">) {
  return (
    <Suspense fallback={<div className="grid min-h-dvh place-items-center text-muted-foreground">Đang tải đề…</div>}>
      <Attempt params={params} />
    </Suspense>
  );
}

async function Attempt({ params }: Pick<PageProps<"/attempt/[groupId]/[skill]">, "params">) {
  const { groupId, skill } = await params;
  if (!isSkill(skill)) notFound();

  const profile = await requireProfile(`/attempt/${groupId}/${skill}`);
  const group = await getGroup(groupId);
  if (!group) notFound();
  const set = await ensureTodaySet(group.id);
  const testId = set && testIdFor(set, skill);
  if (!set || !testId) redirect(`/groups/${group.id}`);

  const [test, attempt] = await Promise.all([getTest(testId), getMyAttempt(set.id, profile.id, skill)]);
  if (!test) redirect(`/groups/${group.id}`);
  if (attempt?.submitted_at) redirect(`/groups/${group.id}/results/${skill}`);

  const serverNow = new Date();
  if (!attempt) {
    return (
      <StartScreen
        groupId={group.id}
        dailySetId={set.id}
        skill={skill}
        title={test.title}
        minutes={Math.round(test.duration_sec / 60)}
        closed={Date.parse(set.closes_at) <= serverNow.getTime()}
      />
    );
  }

  const deadline = new Date(
    Math.min(Date.parse(attempt.started_at) + test.duration_sec * 1000, Date.parse(set.closes_at)),
  );
  const ctx: AttemptContext = {
    attemptId: attempt.id,
    groupId: group.id,
    skill,
    userId: profile.id,
    userName: profile.display_name || "Một bạn",
    startedAt: attempt.started_at,
    deadline: deadline.toISOString(),
    serverNow: serverNow.toISOString(),
  };

  if (skill === "reading") {
    return (
      <ReadingRunner ctx={ctx} title={test.title} content={test.content as ReadingContent} draft={attempt.answers ?? {}} />
    );
  }
  if (skill === "listening") {
    let audioUrl: string | null = null;
    if (test.audio_path) {
      const supabase = await createClient();
      const { data } = await supabase.storage
        .from("test-audio")
        .createSignedUrl(test.audio_path, test.duration_sec + 600);
      audioUrl = data?.signedUrl ?? null;
    }
    return (
      <ListeningRunner
        ctx={ctx}
        title={test.title}
        content={test.content as ListeningContent}
        draft={attempt.answers ?? {}}
        audioUrl={audioUrl}
        audioSeconds={Math.max(1, test.duration_sec - LISTENING_CHECK_SECONDS)}
      />
    );
  }
  if (skill === "writing") {
    return (
      <WritingRunner ctx={ctx} title={test.title} content={test.content as WritingContent} draft={attempt.essay_text ?? ""} />
    );
  }
  return <SpeakingRunner ctx={ctx} title={test.title} content={test.content as SpeakingContent} />;
}
