import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame, Trophy } from "lucide-react";
import { Sparkline } from "@/components/charts/band-trend";
import { UserAvatar } from "@/components/user-avatar";
import { requireProfile } from "@/lib/auth";
import { formatBand } from "@/lib/bands";
import { getBandHistory, getGroupStreaks, liveStreak, todayInVietnam } from "@/lib/data/daily";
import { getGroup, getGroupMembers } from "@/lib/data/groups";
import { addDays, dailyBands, dateRange, standings, weekStart } from "@/lib/progress";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Xếp hạng" };

const TREND_DAYS = 14;

export default async function LeaderboardPage({ params }: PageProps<"/groups/[groupId]/leaderboard">) {
  const { groupId } = await params;
  const profile = await requireProfile(`/groups/${groupId}/leaderboard`);
  const group = await getGroup(groupId);
  if (!group) notFound();

  const today = todayInVietnam();
  const monday = weekStart(today);
  const trendFrom = addDays(today, -(TREND_DAYS - 1));
  const since = monday < trendFrom ? monday : trendFrom;

  const [members, history, streaks] = await Promise.all([
    getGroupMembers(group.id),
    getBandHistory({ groupId: group.id, since }),
    getGroupStreaks(group.id),
  ]);

  const perUser = dailyBands(history);
  const week = dateRange(monday, today);
  const trend = dateRange(trendFrom, today);
  const ranking = standings(
    members.map((m) => m.user_id),
    perUser,
    week,
  );
  const member = (userId: string) => members.find((m) => m.user_id === userId)!;
  const podium = ranking
    .filter((row) => row.average != null)
    .slice(0, 3)
    .map((row, i) => ({ ...row, place: i + 1 }));
  // Second place stands on the left, first in the middle, third on the right.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const stepHeight: Record<number, string> = { 1: "h-32", 2: "h-24", 3: "h-16" };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 font-heading font-bold">
          <Trophy className="size-5 text-streak" /> Band trung bình tuần này
        </h2>
        {podium.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Tuần này chưa ai có điểm. Bảng xếp hạng tính từ thứ Hai, dựa trên những điểm bạn đã được xem.
          </p>
        ) : (
          <ol className="mt-6 flex items-end justify-center gap-3 sm:gap-6">
            {podiumOrder.map((row) => {
              const info = member(row.userId).profile;
              const name = info.display_name || "Chưa đặt tên";
              return (
                <li key={row.userId} className="flex w-24 flex-col items-center gap-2 sm:w-28">
                  <UserAvatar name={name} src={info.avatar_url} className={row.place === 1 ? "size-14" : "size-11"} />
                  <span className="w-full truncate text-center text-sm font-semibold">{name}</span>
                  <div
                    className={cn(
                      "flex w-full flex-col items-center justify-start rounded-t-xl border border-b-0 bg-secondary pt-2",
                      stepHeight[row.place],
                      row.place === 1 && "border-streak/60 bg-streak/15",
                    )}
                  >
                    <span className="font-heading text-2xl font-bold tabular-nums">{row.average!.toFixed(2)}</span>
                    <span className="text-xs text-muted-foreground">Hạng {row.place}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading font-bold">Cả nhóm</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 py-2 font-medium">#</th>
                <th className="py-2 font-medium">Thành viên</th>
                <th className="py-2 text-right font-medium">TB tuần</th>
                <th className="py-2 text-right font-medium">Ngày có điểm</th>
                <th className="py-2 text-right font-medium">Streak</th>
                <th className="py-2 pl-4 font-medium">{TREND_DAYS} ngày qua</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, i) => {
                const info = member(row.userId).profile;
                const name = info.display_name || "Chưa đặt tên";
                const streak = liveStreak(
                  streaks.find((s) => s.user_id === row.userId),
                  today,
                );
                const values = trend.map((d) => perUser.get(row.userId)?.get(d) ?? null);
                return (
                  <tr key={row.userId} className="border-b last:border-0">
                    <td className="py-2.5 font-bold text-muted-foreground tabular-nums">{row.average != null ? i + 1 : "–"}</td>
                    <td className="py-2.5">
                      <span className="flex items-center gap-2.5">
                        <UserAvatar name={name} src={info.avatar_url} className="size-8" />
                        <span className="font-medium">
                          {name}
                          {row.userId === profile.id && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bạn)</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-heading text-base font-bold tabular-nums">
                      {row.average != null ? row.average.toFixed(2) : "–"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.days}/{week.length}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Flame className={cn("size-4", streak > 0 ? "text-streak" : "text-muted-foreground/50")} />
                        {streak}
                      </span>
                    </td>
                    <td className="py-2.5 pl-4">
                      <Sparkline
                        values={values}
                        label={`Band theo ngày của ${name}: ${values.map((v) => (v == null ? "không có" : formatBand(v))).join(", ")}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Band mỗi ngày là trung bình các kỹ năng đã có điểm, làm tròn kiểu IELTS. Điểm của bạn bè chỉ
          tính những bài bạn đã được xem.
        </p>
      </section>
    </div>
  );
}
