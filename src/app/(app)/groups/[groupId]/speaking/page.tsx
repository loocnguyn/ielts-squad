import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Lock, Star, Video } from "lucide-react";
import { ClaudeGradePanel } from "@/components/results/claude-grade-panel";
import { GradeDisplay } from "@/components/results/grade-display";
import { PeerReviewForm } from "@/components/results/peer-review-form";
import { SpeakingPreview } from "@/components/tests/test-views";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth";
import { formatBand } from "@/lib/bands";
import {
  ensureTodaySet,
  getSetByDate,
  getVisibleAttempts,
  isIsoDate,
  todayInVietnam,
  type AttemptWithGrades,
} from "@/lib/data/daily";
import { getGroup, getGroupMembers } from "@/lib/data/groups";
import { createClient } from "@/lib/supabase/server";
import { countWords } from "@/lib/tests/grading";
import { buildSpeakingGradingPrompt } from "@/lib/tests/prompts";
import type { SpeakingContent } from "@/lib/tests/types";

export const metadata: Metadata = { title: "Buổi nói" };

type Turn = { id: string; candidate_id: string; examiner_id: string | null; test_id: string; attempt_id: string | null; finished_at: string | null };
type TestRow = { id: string; title: string; content: SpeakingContent };

/** Results of the day's speaking room: recordings, transcripts and grading. */
export default async function SpeakingSessionPage({
  params,
  searchParams,
}: PageProps<"/groups/[groupId]/speaking">) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const profile = await requireProfile(`/groups/${groupId}/speaking`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  const today = todayInVietnam();
  const date = typeof query.date === "string" && isIsoDate(query.date) ? query.date : today;
  const supabase = await createClient();

  const [set, members, turnsResult] = await Promise.all([
    date === today ? ensureTodaySet(group.id) : getSetByDate(group.id, date),
    getGroupMembers(group.id),
    supabase
      .from("speaking_turns")
      .select("id, candidate_id, examiner_id, test_id, attempt_id, finished_at")
      .eq("group_id", group.id)
      .eq("date", date),
  ]);
  const turns = ((turnsResult.data ?? []) as Turn[]).filter((turn) => turn.finished_at && turn.attempt_id);
  const turnOfAttempt = new Map(turns.map((turn) => [turn.attempt_id!, turn]));

  // Only attempts made in the room; RLS hides mates' attempts until the caller has done theirs.
  const attempts = set ? (await getVisibleAttempts(set.id, "speaking")).filter((a) => turnOfAttempt.has(a.id)) : [];
  const testIds = attempts.map((a) => turnOfAttempt.get(a.id)!.test_id);
  const { data: testRows } = testIds.length
    ? await supabase.from("tests").select("id, title, content").in("id", testIds)
    : { data: [] };
  const tests = new Map(((testRows ?? []) as TestRow[]).map((test) => [test.id, test]));

  const recordingUrls = new Map<string, string | null>();
  await Promise.all(
    attempts.map(async (attempt) => {
      if (!attempt.audio_path) return;
      const { data } = await supabase.storage.from("recordings").createSignedUrl(attempt.audio_path, 3600);
      recordingUrls.set(attempt.id, data?.signedUrl ?? null);
    }),
  );

  const nameOf = (userId: string | null) =>
    members.find((m) => m.user_id === userId)?.profile.display_name || "Thành viên cũ";
  const avatarOf = (userId: string) => members.find((m) => m.user_id === userId)?.profile.avatar_url;
  const mine = attempts.find((attempt) => attempt.user_id === profile.id);
  const others = attempts.filter((attempt) => attempt.user_id !== profile.id);
  const hiddenCount = turns.length - attempts.length;
  const dateLabel = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold first-letter:uppercase">Buổi nói · {dateLabel}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Thi nói theo cặp qua video: một người hỏi, một người trả lời, mỗi người một đề đủ Part 1, 2 và 3.
          </p>
        </div>
        {date === today && (
          <Button asChild className="h-10">
            <Link href={`/room/${group.id}`} prefetch={false}>
              <Video /> Vào phòng nói
            </Link>
          </Button>
        )}
      </div>

      {attempts.length === 0 && (
        <p className="rounded-2xl border bg-card p-5 text-muted-foreground">
          {hiddenCount > 0
            ? "Đã có bạn thi xong. Bài của bạn bè sẽ hiện khi bạn thi xong lượt của mình."
            : "Chưa có lượt thi nào trong ngày này."}
        </p>
      )}

      {mine && (
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-heading font-bold">Lượt thi của bạn</h3>
            <p className="text-sm text-muted-foreground">Giám khảo: {nameOf(turnOfAttempt.get(mine.id)!.examiner_id)}</p>
            <Turn attempt={mine} test={tests.get(turnOfAttempt.get(mine.id)!.test_id)} recordingUrl={recordingUrls.get(mine.id) ?? null} date={date} />
            {grade(mine) && (
              <div className="mt-5 border-t pt-5">
                <GradeDisplay grade={grade(mine)!} />
              </div>
            )}
            <PeerFeedback attempt={mine} nameOf={nameOf} />
          </div>
          {tests.get(turnOfAttempt.get(mine.id)!.test_id) && (
            <ClaudeGradePanel
              attemptId={mine.id}
              skill="speaking"
              hasGrade={Boolean(grade(mine))}
              prompt={buildSpeakingGradingPrompt({
                attemptId: mine.id,
                content: tests.get(turnOfAttempt.get(mine.id)!.test_id)!.content,
                transcript: mine.transcript ?? "",
                speakingSeconds: mine.speaking_seconds,
              })}
            />
          )}
        </section>
      )}

      {others.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="font-heading text-lg font-bold">Lượt thi của bạn bè</h3>
          {others.map((attempt) => {
            const claude = grade(attempt);
            return (
              <article key={attempt.id} className="rounded-2xl border bg-card p-5">
                <header className="flex items-center gap-3">
                  <UserAvatar name={nameOf(attempt.user_id)} src={avatarOf(attempt.user_id)} className="size-8" />
                  <span className="flex-1 font-semibold">{nameOf(attempt.user_id)}</span>
                  {claude && <span className="font-heading text-xl font-bold">{formatBand(claude.band)}</span>}
                </header>
                <Turn attempt={attempt} test={tests.get(turnOfAttempt.get(attempt.id)!.test_id)} recordingUrl={recordingUrls.get(attempt.id) ?? null} date={date} />
                {claude && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Xem nhận xét của Claude</summary>
                    <div className="mt-3">
                      <GradeDisplay grade={claude} />
                    </div>
                  </details>
                )}
                <div className="mt-4">
                  <PeerReviewForm
                    attemptId={attempt.id}
                    bandLabel="Pronunciation"
                    existing={attempt.peer_reviews.find((r) => r.reviewer_id === profile.id) ?? null}
                    siblingAttemptIds={others.filter((o) => o.id !== attempt.id).map((o) => o.id)}
                    allowVote
                  />
                </div>
              </article>
            );
          })}
        </section>
      )}

      {mine && hiddenCount > 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" /> Còn {hiddenCount} lượt thi chưa xem được.
        </p>
      )}
    </div>
  );
}

const grade = (attempt: AttemptWithGrades) => attempt.grades.find((g) => g.source === "claude-pro");

function Turn({
  attempt,
  test,
  recordingUrl,
  date,
}: {
  attempt: AttemptWithGrades;
  test: TestRow | undefined;
  recordingUrl: string | null;
  date: string;
}) {
  const transcript = attempt.transcript?.trim();
  return (
    <div className="mt-3 flex flex-col gap-3">
      {recordingUrl ? (
        <audio controls preload="none" src={recordingUrl} className="w-full" />
      ) : (
        <p className="text-sm text-muted-foreground">Không có bản ghi âm.</p>
      )}
      {transcript ? (
        <p className="leading-7 whitespace-pre-line text-pretty">{transcript}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Không có transcript.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {attempt.speaking_seconds != null && attempt.speaking_seconds > 0 && (
          <span>
            Nói {Math.floor(attempt.speaking_seconds / 60)} phút {attempt.speaking_seconds % 60} giây
            {transcript ? ` · ${countWords(transcript)} từ` : ""}
          </span>
        )}
        {transcript && (
          <a
            download={`ielts-speaking-${date}.txt`}
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(transcript)}`}
            className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
          >
            <Download className="size-4" /> Tải transcript
          </a>
        )}
      </div>
      {test && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">Xem đề: {test.title}</summary>
          <div className="mt-3">
            <SpeakingPreview content={test.content} />
          </div>
        </details>
      )}
    </div>
  );
}

function PeerFeedback({ attempt, nameOf }: { attempt: AttemptWithGrades; nameOf: (userId: string) => string }) {
  const reviews = attempt.peer_reviews.filter((r) => r.band != null || r.comment || r.vote);
  if (reviews.length === 0) return null;
  return (
    <div className="mt-5 border-t pt-5">
      <h4 className="text-sm font-semibold">Bạn bè chấm Pronunciation</h4>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {reviews.map((review) => (
          <li key={review.id} className="rounded-lg border bg-background p-3">
            <p className="flex items-center gap-2 font-medium">
              {nameOf(review.reviewer_id)}
              {review.band != null && <span className="tabular-nums">· {formatBand(review.band)}</span>}
              {review.vote && <Star aria-label="Bình chọn hay nhất" className="size-4 fill-streak text-streak" />}
            </p>
            {review.comment && <p className="mt-1 text-muted-foreground text-pretty">{review.comment}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
