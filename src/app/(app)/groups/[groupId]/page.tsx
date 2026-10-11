import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Flame, Library, Play, Timer } from "lucide-react";
import { Confetti } from "@/components/daily/confetti";
import { Countdown } from "@/components/daily/countdown";
import { GroupLive } from "@/components/daily/group-live";
import { ProgressRing } from "@/components/daily/progress-ring";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth";
import { formatBand, roundBand } from "@/lib/bands";
import {
  ensureTodaySet,
  getGroupStreaks,
  getProgress,
  getSetBands,
  getSetTests,
  liveStreak,
  testIdFor,
} from "@/lib/data/daily";
import { getGroup, getGroupMembers } from "@/lib/data/groups";
import { SKILLS, SKILL_META } from "@/lib/skills";
import type { Skill } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hôm nay" };

const PART_LABEL: Record<string, string> = {
  passage: "1 passage",
  task1: "Task 1",
  task2: "Task 2",
  part1: "Part 1",
  part2: "Part 2",
  part3: "Part 3",
};

function partLabel(part: string) {
  return PART_LABEL[part] ?? part.replace(/^part/, "Part ").replace("-", " & ");
}

export default async function GroupTodayPage({ params }: PageProps<"/groups/[groupId]">) {
  const { groupId } = await params;
  const profile = await requireProfile(`/groups/${groupId}`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  const set = await ensureTodaySet(group.id);
  if (!set) notFound();

  const [members, tests, progress, bands, streaks] = await Promise.all([
    getGroupMembers(group.id),
    getSetTests(set),
    getProgress(set.id),
    getSetBands(set.id),
    getGroupStreaks(group.id),
  ]);

  const serverNow = new Date().toISOString();
  const closed = Date.parse(set.closes_at) <= Date.parse(serverNow);
  const dealtSkills = SKILLS.filter((skill) => testIdFor(set, skill));
  const stateOf = (userId: string, skill: Skill) =>
    progress.find((row) => row.user_id === userId && row.skill === skill);
  const bandOf = (userId: string, skill: Skill) =>
    bands.find((row) => row.user_id === userId && row.skill === skill)?.band;

  const myDone = dealtSkills.filter((skill) => stateOf(profile.id, skill)?.submitted_at);
  const allDone = dealtSkills.length > 0 && myDone.length === dealtSkills.length;
  const myBands = dealtSkills.map((skill) => bandOf(profile.id, skill)).filter((b) => b != null);
  const myStreak = liveStreak(
    streaks.find((s) => s.user_id === profile.id),
    set.date,
  );
  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${set.date}T00:00:00Z`));

  return (
    <div className="flex flex-col gap-6">
      <GroupLive groupId={group.id} userId={profile.id} />
      {allDone && <Confetti storageKey={`confetti:${set.id}:${profile.id}`} />}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="font-heading text-lg font-bold first-letter:uppercase">{dateLabel}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
            <Countdown closesAt={set.closes_at} serverNow={serverNow} />
            <span>
              {myDone.length}/{dealtSkills.length} kỹ năng xong
            </span>
          </p>
        </div>
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Flame className={cn("size-5", myStreak > 0 ? "text-streak" : "text-muted-foreground")} />
            <span className="font-heading text-xl font-bold">{myStreak}</span>
            <span className="text-muted-foreground">ngày</span>
          </span>
          {allDone && myBands.length > 0 && (
            <span className="text-sm">
              <span className="text-muted-foreground">Band hôm nay </span>
              <span className="font-heading text-xl font-bold">
                {formatBand(roundBand(myBands.reduce((a, b) => a + b, 0) / myBands.length))}
              </span>
              {myBands.length < dealtSkills.length && (
                <span className="text-muted-foreground"> (chờ chấm {dealtSkills.length - myBands.length})</span>
              )}
            </span>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SKILLS.map((skill) => {
          const meta = SKILL_META[skill];
          const test = tests[skill];
          const mine = stateOf(profile.id, skill);
          const doneCount = members.filter((m) => stateOf(m.user_id, skill)?.submitted_at).length;
          const band = bandOf(profile.id, skill);
          const submitted = Boolean(mine?.submitted_at);
          const href = submitted
            ? `/groups/${group.id}/results/${skill}`
            : `/attempt/${group.id}/${skill}`;

          const body = (
            <>
              <ProgressRing
                value={members.length ? doneCount / members.length : 0}
                color={meta.color}
                label={`${meta.label}: ${doneCount} trên ${members.length} người đã xong`}
              >
                {submitted ? (
                  <span className="grid size-12 place-items-center rounded-full" style={{ background: meta.color }}>
                    <Check className="size-6 text-white" strokeWidth={3} />
                  </span>
                ) : (
                  <meta.icon className={cn("size-8", meta.text)} />
                )}
              </ProgressRing>
              <div className="flex flex-col items-center gap-0.5 text-center">
                <h3 className="font-heading font-bold">{meta.label}</h3>
                <p className="text-xs text-muted-foreground">
                  {test
                    ? `${partLabel(test.part)} · ${Math.round(test.duration_sec / 60)} phút`
                    : "Ngân hàng hết đề"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doneCount}/{members.length} người xong
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold",
                  submitted || !test || closed ? "bg-secondary" : "text-white",
                )}
                style={submitted || !test || closed ? undefined : { background: meta.color }}
              >
                {!test ? (
                  <>
                    <Library className="size-4" /> Soạn thêm đề
                  </>
                ) : submitted ? (
                  band != null ? (
                    `Band ${formatBand(band)}`
                  ) : (
                    "Chờ chấm"
                  )
                ) : mine ? (
                  <>
                    <Timer className="size-4" /> Làm tiếp
                  </>
                ) : closed ? (
                  "Đã chốt"
                ) : (
                  <>
                    <Play className="size-4" /> Bắt đầu
                  </>
                )}
              </span>
            </>
          );

          const cardClass =
            "flex h-full flex-col items-center gap-3 rounded-2xl border bg-card p-4 transition-colors sm:p-5";
          return (
            <li key={skill}>
              {!test ? (
                <Link href="/bank" className={cn(cardClass, "hover:border-ring")}>
                  {body}
                </Link>
              ) : !submitted && !mine && closed ? (
                <div className={cn(cardClass, "opacity-60")}>{body}</div>
              ) : (
                // No prefetch: opening an attempt should be a deliberate click.
                <Link href={href} prefetch={false} className={cn(cardClass, "hover:border-ring")}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading font-bold">Cả nhóm hôm nay</h2>
        <ul className="mt-3 divide-y">
          {members.map((member) => {
            const name = member.profile.display_name || "Chưa đặt tên";
            const done = dealtSkills.filter((skill) => stateOf(member.user_id, skill)?.submitted_at).length;
            const streak = liveStreak(
              streaks.find((s) => s.user_id === member.user_id),
              set.date,
            );
            return (
              <li key={member.user_id} className="flex items-center gap-3 py-3">
                <UserAvatar name={name} src={member.profile.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {name}
                    {member.user_id === profile.id && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bạn)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {done === dealtSkills.length && done > 0 ? "Xong cả ngày" : `${done}/${dealtSkills.length} kỹ năng`}
                  </p>
                </div>
                <ul className="flex items-center gap-1.5" aria-label={`Tiến độ của ${name}`}>
                  {SKILLS.map((skill) => {
                    const state = stateOf(member.user_id, skill);
                    const meta = SKILL_META[skill];
                    const memberBand = bandOf(member.user_id, skill);
                    const status = state?.submitted_at ? "đã xong" : state ? "đang làm" : "chưa làm";
                    return (
                      <li
                        key={skill}
                        title={`${meta.label}: ${status}${memberBand != null ? `, band ${formatBand(memberBand)}` : ""}`}
                        className="flex flex-col items-center gap-1"
                      >
                        <span
                          aria-label={`${meta.label}: ${status}`}
                          className={cn(
                            "size-3.5 rounded-full border-2",
                            !state && "border-border",
                            state && !state.submitted_at && "animate-pulse",
                          )}
                          style={
                            state
                              ? {
                                  borderColor: meta.color,
                                  background: state.submitted_at ? meta.color : "transparent",
                                }
                              : undefined
                          }
                        />
                        <span className="w-7 text-center text-[10px] text-muted-foreground tabular-nums">
                          {memberBand != null ? formatBand(memberBand) : "·"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <span className="inline-flex w-10 items-center justify-end gap-1 text-sm tabular-nums">
                  <Flame className={cn("size-4", streak > 0 ? "text-streak" : "text-muted-foreground/50")} />
                  {streak}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Chấm tròn đầy là đã nộp, viền nhấp nháy là đang làm. Điểm của bạn bè chỉ hiện khi bạn đã
          nộp kỹ năng đó.
        </p>
      </section>
    </div>
  );
}
