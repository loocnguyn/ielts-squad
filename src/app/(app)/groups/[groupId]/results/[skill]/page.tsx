import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Star } from "lucide-react";
import { ClaudeGradePanel } from "@/components/results/claude-grade-panel";
import { GradeDisplay } from "@/components/results/grade-display";
import { PeerReviewForm } from "@/components/results/peer-review-form";
import { QuestionGroups } from "@/components/tests/question-groups";
import { PassageView, SpeakingPreview, WritingPromptView } from "@/components/tests/test-views";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth";
import { formatBand } from "@/lib/bands";
import { getTest } from "@/lib/data/bank";
import {
  ensureTodaySet,
  getSetByDate,
  getVisibleAttempts,
  isIsoDate,
  testIdFor,
  todayInVietnam,
  type AttemptWithGrades,
} from "@/lib/data/daily";
import { getGroup, getGroupMembers } from "@/lib/data/groups";
import { SKILL_META, isSkill } from "@/lib/skills";
import { createClient } from "@/lib/supabase/server";
import { countWords } from "@/lib/tests/grading";
import { buildSpeakingGradingPrompt, buildWritingGradingPrompt } from "@/lib/tests/prompts";
import type {
  AnswerKey,
  ListeningContent,
  ListeningTranscript,
  ReadingContent,
  SpeakingContent,
  WritingContent,
} from "@/lib/tests/types";
import type { Grade, GradeSource } from "@/lib/types";

export const metadata: Metadata = { title: "Kết quả" };

type ReviewData = {
  answer_key: AnswerKey | null;
  transcript: (ListeningTranscript & { explanations?: Record<string, string> }) | null;
};

const gradeOf = (attempt: AttemptWithGrades, source: GradeSource) =>
  attempt.grades.find((grade) => grade.source === source);

/** The band shown for an attempt: auto, then Claude Pro, then peers. */
function headlineGrade(attempt: AttemptWithGrades): Grade | undefined {
  return gradeOf(attempt, "auto") ?? gradeOf(attempt, "claude-pro") ?? gradeOf(attempt, "peer");
}

export default async function ResultsPage({
  params,
  searchParams,
}: PageProps<"/groups/[groupId]/results/[skill]">) {
  const [{ groupId, skill }, query] = await Promise.all([params, searchParams]);
  if (!isSkill(skill)) notFound();
  const profile = await requireProfile(`/groups/${groupId}/results/${skill}`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  const today = todayInVietnam();
  const date = typeof query.date === "string" && isIsoDate(query.date) ? query.date : today;
  const set = date === today ? await ensureTodaySet(group.id) : await getSetByDate(group.id, date);
  const testId = set && testIdFor(set, skill);
  if (!set || !testId) notFound();

  const [test, attempts, members] = await Promise.all([
    getTest(testId),
    getVisibleAttempts(set.id, skill),
    getGroupMembers(group.id),
  ]);
  if (!test) notFound();

  const meta = SKILL_META[skill];
  const mine = attempts.find((attempt) => attempt.user_id === profile.id);
  const others = attempts.filter((attempt) => attempt.user_id !== profile.id);
  const closed = Date.parse(set.closes_at) <= new Date().getTime();
  const nameOf = (userId: string) =>
    members.find((m) => m.user_id === userId)?.profile.display_name || "Thành viên cũ";
  const avatarOf = (userId: string) => members.find((m) => m.user_id === userId)?.profile.avatar_url;

  const supabase = await createClient();

  // The key and transcript are released for any attempt the caller may see.
  const reviewAttempt = mine ?? others[0];
  let review: ReviewData | null = null;
  if (reviewAttempt && (skill === "reading" || skill === "listening")) {
    const { data } = await supabase.rpc("get_attempt_review", { p_attempt_id: reviewAttempt.id });
    review = (data as ReviewData | null) ?? null;
  }

  const signed = async (bucket: string, path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };
  const recordingUrls = new Map<string, string | null>();
  if (skill === "speaking") {
    await Promise.all(
      attempts.map(async (attempt) => {
        recordingUrls.set(attempt.id, await signed("recordings", attempt.audio_path));
      }),
    );
  }
  const listeningAudioUrl =
    skill === "listening" && attempts.length > 0 ? await signed("test-audio", test.audio_path) : null;

  const dateLabel = new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${set.date}T00:00:00Z`),
  );
  const ranked = [...attempts].sort(
    (a, b) => (headlineGrade(b)?.band ?? -1) - (headlineGrade(a)?.band ?? -1),
  );
  const objective = skill === "reading" || skill === "listening";
  const myVisibleAnswers = mine?.answers ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/groups/${group.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Bảng ngày
        </Link>
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <meta.icon className={`size-4 ${meta.text}`} /> {meta.label} · {dateLabel}
        </p>
        <h2 className="mt-1 font-heading text-xl font-bold">{test.title}</h2>
      </div>

      {!mine && !closed && (
        <section className="flex flex-col items-start gap-3 rounded-2xl border bg-card p-5">
          <p className="flex items-center gap-2 font-medium">
            <Lock className="size-4" /> Bạn chưa nộp {meta.label} hôm nay
          </p>
          <p className="text-sm text-muted-foreground">
            Bài và điểm của cả nhóm sẽ mở khi bạn nộp kỹ năng này, hoặc sau giờ chốt ngày.
          </p>
          <Button asChild>
            <Link href={`/attempt/${group.id}/${skill}`} prefetch={false}>
              Làm bài
            </Link>
          </Button>
        </section>
      )}

      {ranked.length > 0 && (
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="font-heading font-bold">So điểm trong nhóm</h3>
          <ol className="mt-3 divide-y">
            {ranked.map((attempt, i) => {
              const grade = headlineGrade(attempt);
              const votes = attempt.peer_reviews.filter((r) => r.vote).length;
              return (
                <li key={attempt.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 text-center text-sm font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                  <UserAvatar name={nameOf(attempt.user_id)} src={avatarOf(attempt.user_id)} className="size-8" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {nameOf(attempt.user_id)}
                    {attempt.user_id === profile.id && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bạn)</span>
                    )}
                  </span>
                  {votes > 0 && (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <Star className="size-4 fill-streak text-streak" /> {votes}
                    </span>
                  )}
                  {grade?.raw_total != null && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {grade.raw_score}/{grade.raw_total}
                    </span>
                  )}
                  <span className="w-12 text-right font-heading text-lg font-bold tabular-nums">
                    {grade ? formatBand(grade.band) : "–"}
                  </span>
                </li>
              );
            })}
          </ol>
          {!objective && (
            <p className="mt-2 text-xs text-muted-foreground">
              Dấu gạch nghĩa là bài chưa được chấm. Band lấy từ Claude Pro, nếu chưa có thì lấy điểm chấm chéo.
            </p>
          )}
        </section>
      )}

      {objective && mine && (
        <section className="flex flex-col gap-5">
          <div className="rounded-2xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Kết quả của bạn</p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="font-heading text-4xl font-bold">{formatBand(gradeOf(mine, "auto")?.band)}</span>
              <span className="text-muted-foreground">
                {gradeOf(mine, "auto")?.raw_score}/{gradeOf(mine, "auto")?.raw_total} câu đúng · band ước tính
              </span>
            </p>
          </div>

          {skill === "reading" ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border bg-card p-5 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
                <PassageView passage={(test.content as ReadingContent).passage} />
              </div>
              <QuestionGroups
                groups={(test.content as ReadingContent).groups}
                answers={myVisibleAnswers}
                review={review?.answer_key ? { key: review.answer_key, explanations: review.transcript?.explanations } : undefined}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {listeningAudioUrl && (
                <div className="rounded-2xl border bg-card p-5">
                  <p className="mb-2 text-sm font-semibold">Nghe lại</p>
                  <audio controls preload="none" src={listeningAudioUrl} className="w-full" />
                </div>
              )}
              {(test.content as ListeningContent).parts.map((part) => {
                const script = review?.transcript?.parts?.find((p) => p.part === part.part);
                return (
                  <section key={part.part} className="flex flex-col gap-4">
                    <h3 className="font-heading text-lg font-bold">Part {part.part}</h3>
                    <QuestionGroups
                      groups={part.groups}
                      answers={myVisibleAnswers}
                      review={review?.answer_key ? { key: review.answer_key, explanations: review.transcript?.explanations } : undefined}
                    />
                    {script && (
                      <details className="rounded-2xl border bg-card p-5">
                        <summary className="cursor-pointer font-semibold">Transcript Part {part.part}</summary>
                        <div className="mt-3 flex flex-col gap-2 text-sm leading-6">
                          {script.script.map((line, i) => (
                            <p key={i}>
                              <span className="font-semibold">
                                {script.speakers.find((s) => s.id === line.speaker)?.name ?? line.speaker}:
                              </span>{" "}
                              {line.text}
                            </p>
                          ))}
                        </div>
                      </details>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!objective && (mine || others.length > 0) && (
        <section className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 font-heading font-bold">Đề bài</h3>
          {skill === "writing" ? (
            <WritingPromptView content={test.content as WritingContent} />
          ) : (
            <SpeakingPreview content={test.content as SpeakingContent} />
          )}
        </section>
      )}

      {!objective && mine && (
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-heading font-bold">Bài của bạn</h3>
            <Submission attempt={mine} skill={skill} recordingUrl={recordingUrls.get(mine.id) ?? null} />
            {gradeOf(mine, "claude-pro") && (
              <div className="mt-5 border-t pt-5">
                <GradeDisplay grade={gradeOf(mine, "claude-pro")!} />
              </div>
            )}
            <PeerFeedback attempt={mine} nameOf={nameOf} skill={skill} />
          </div>
          <ClaudeGradePanel
            attemptId={mine.id}
            skill={skill}
            hasGrade={Boolean(gradeOf(mine, "claude-pro"))}
            prompt={
              skill === "writing"
                ? buildWritingGradingPrompt({
                    attemptId: mine.id,
                    content: test.content as WritingContent,
                    essay: mine.essay_text ?? "",
                  })
                : buildSpeakingGradingPrompt({
                    attemptId: mine.id,
                    content: test.content as SpeakingContent,
                    transcript: mine.transcript ?? "",
                    speakingSeconds: mine.speaking_seconds,
                  })
            }
          />
        </section>
      )}

      {!objective && others.length > 0 && (
        <section className="flex flex-col gap-4">
          <h3 className="font-heading text-lg font-bold">Bài của bạn bè</h3>
          {others.map((attempt) => {
            const myReview = attempt.peer_reviews.find((r) => r.reviewer_id === profile.id) ?? null;
            const claude = gradeOf(attempt, "claude-pro");
            return (
              <article key={attempt.id} className="rounded-2xl border bg-card p-5">
                <header className="flex items-center gap-3">
                  <UserAvatar name={nameOf(attempt.user_id)} src={avatarOf(attempt.user_id)} className="size-8" />
                  <span className="flex-1 font-semibold">{nameOf(attempt.user_id)}</span>
                  {claude && <span className="font-heading text-xl font-bold">{formatBand(claude.band)}</span>}
                </header>
                <Submission attempt={attempt} skill={skill} recordingUrl={recordingUrls.get(attempt.id) ?? null} />
                {claude && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                      Xem nhận xét của Claude
                    </summary>
                    <div className="mt-3">
                      <GradeDisplay grade={claude} />
                    </div>
                  </details>
                )}
                <div className="mt-4">
                  <PeerReviewForm
                    attemptId={attempt.id}
                    bandLabel={skill === "speaking" ? "Pronunciation" : "Band"}
                    existing={myReview}
                    siblingAttemptIds={others.filter((o) => o.id !== attempt.id).map((o) => o.id)}
                    allowVote={skill === "speaking"}
                  />
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Submission({
  attempt,
  skill,
  recordingUrl,
}: {
  attempt: AttemptWithGrades;
  skill: "writing" | "speaking";
  recordingUrl: string | null;
}) {
  if (skill === "writing") {
    const essay = attempt.essay_text?.trim();
    return essay ? (
      <>
        <p className="mt-3 leading-7 whitespace-pre-line text-pretty">{essay}</p>
        <p className="mt-2 text-sm text-muted-foreground">{countWords(essay)} từ</p>
      </>
    ) : (
      <p className="mt-3 text-sm text-muted-foreground">Bài nộp trống.</p>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-3">
      {recordingUrl ? (
        <audio controls preload="none" src={recordingUrl} className="w-full" />
      ) : (
        <p className="text-sm text-muted-foreground">Không có bản ghi âm.</p>
      )}
      {attempt.transcript ? (
        <p className="leading-7 text-pretty">{attempt.transcript}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Không có bản chữ.</p>
      )}
      {attempt.speaking_seconds != null && attempt.speaking_seconds > 0 && (
        <p className="text-sm text-muted-foreground">
          Nói {Math.floor(attempt.speaking_seconds / 60)} phút {attempt.speaking_seconds % 60} giây
          {attempt.transcript ? ` · ${countWords(attempt.transcript)} từ` : ""}
        </p>
      )}
    </div>
  );
}

function PeerFeedback({
  attempt,
  nameOf,
  skill,
}: {
  attempt: AttemptWithGrades;
  nameOf: (userId: string) => string;
  skill: "writing" | "speaking";
}) {
  const reviews = attempt.peer_reviews.filter((r) => r.band != null || r.comment || r.vote);
  if (reviews.length === 0) return null;
  return (
    <div className="mt-5 border-t pt-5">
      <h4 className="text-sm font-semibold">
        {skill === "speaking" ? "Bạn bè chấm Pronunciation" : "Bạn bè chấm chéo"}
      </h4>
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
