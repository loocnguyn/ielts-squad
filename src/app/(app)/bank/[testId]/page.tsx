import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ListeningAudioBuilder } from "@/components/bank/listening-audio-builder";
import { TestPreview } from "@/components/tests/test-preview";
import { requireProfile } from "@/lib/auth";
import { getTest } from "@/lib/data/bank";
import { isUuid } from "@/lib/data/groups";
import { SKILL_META } from "@/lib/skills";
import { createClient } from "@/lib/supabase/server";
import type { AnswerKey, ListeningContent } from "@/lib/tests/types";

export const metadata: Metadata = { title: "Xem trước đề" };

export default async function TestPage({ params }: PageProps<"/bank/[testId]">) {
  const { testId } = await params;
  const profile = await requireProfile(`/bank/${testId}`);
  const test = isUuid(testId) ? await getTest(testId) : null;
  // Only the author gets the preview: it shows the answers.
  if (!test || test.created_by !== profile.id) notFound();

  const supabase = await createClient();
  const { data: secrets } = await supabase.rpc("get_test_secrets", { p_test_id: test.id });
  const answerKey = (secrets as { answer_key: AnswerKey | null } | null)?.answer_key ?? null;
  const meta = SKILL_META[test.skill];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/bank" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Ngân hàng đề
      </Link>
      <div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <meta.icon className={`size-4 ${meta.text}`} /> {meta.label} · {test.part} ·{" "}
          {Math.round(test.duration_sec / 60)} phút
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold">{test.title}</h1>
      </div>

      {test.skill === "listening" && (
        <ListeningAudioBuilder
          testId={test.id}
          content={test.content as ListeningContent}
          audioPath={test.audio_path}
        />
      )}

      <section className="rounded-2xl border bg-card p-5">
        <TestPreview skill={test.skill} content={test.content} answerKey={answerKey} />
      </section>
    </div>
  );
}
