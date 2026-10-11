import type { Metadata } from "next";
import { Award, CalendarDays, Flame, Target } from "lucide-react";
import { BandTrend, type TrendPoint } from "@/components/charts/band-trend";
import { ProfileForm } from "@/components/profile-form";
import { requireProfile } from "@/lib/auth";
import { formatBand } from "@/lib/bands";
import { getBandHistory, todayInVietnam } from "@/lib/data/daily";
import { BADGES, addDays } from "@/lib/progress";
import { SKILLS, SKILL_META } from "@/lib/skills";
import { createClient } from "@/lib/supabase/server";
import type { Badge, Skill, Streak } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Hồ sơ" };

const HISTORY_DAYS = 60;

function StatTile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 font-heading text-3xl font-bold">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default async function ProfilePage() {
  const profile = await requireProfile("/profile");
  const today = todayInVietnam();
  const supabase = await createClient();

  const [history, streaksResult, badgesResult] = await Promise.all([
    getBandHistory({ userId: profile.id, since: addDays(today, -HISTORY_DAYS) }),
    supabase.from("streaks").select("*").eq("user_id", profile.id),
    supabase.from("badges").select("*").eq("user_id", profile.id).order("earned_at"),
  ]);
  const streaks = (streaksResult.data ?? []) as Streak[];
  const badges = (badgesResult.data ?? []) as Badge[];

  // A person in two groups can have two bands for a skill on one day: keep the higher.
  const trendFor = (skill: Skill): TrendPoint[] => {
    const best = new Map<string, number>();
    for (const row of history) {
      if (row.skill === skill) best.set(row.date, Math.max(best.get(row.date) ?? 0, row.band));
    }
    return [...best].map(([date, band]) => ({ date, band })).sort((a, b) => a.date.localeCompare(b.date));
  };

  const bestStreak = Math.max(0, ...streaks.map((s) => s.best));
  const daysToExam = profile.exam_date
    ? Math.round((Date.parse(profile.exam_date) - Date.parse(today)) / 86_400_000)
    : null;
  const earned = new Set(badges.map((b) => b.code));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold">Hồ sơ & tiến độ</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Target className="size-4" />}
          label="Mục tiêu"
          value={formatBand(profile.target_band)}
          note={`Hiện tại ${formatBand(profile.current_band)}`}
        />
        <StatTile
          icon={<Flame className="size-4 text-streak" />}
          label="Chuỗi dài nhất"
          value={String(bestStreak)}
          note="ngày liên tiếp"
        />
        <StatTile
          icon={<CalendarDays className="size-4" />}
          label="Ngày thi"
          value={daysToExam == null ? "–" : daysToExam >= 0 ? String(daysToExam) : "Đã thi"}
          note={daysToExam != null && daysToExam >= 0 ? "ngày nữa" : daysToExam == null ? "chưa đặt" : undefined}
        />
        <StatTile
          icon={<Award className="size-4" />}
          label="Huy hiệu"
          value={`${badges.length}/${Object.keys(BADGES).length}`}
        />
      </div>

      <section>
        <h2 className="mb-3 font-heading font-bold">Band theo kỹ năng, {HISTORY_DAYS} ngày qua</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {SKILLS.map((skill) => (
            <BandTrend
              key={skill}
              title={SKILL_META[skill].label}
              color={SKILL_META[skill].color}
              points={trendFor(skill)}
              target={profile.target_band}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading font-bold">Huy hiệu</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(BADGES).map(([code, badge]) => {
            const has = earned.has(code);
            return (
              <li
                key={code}
                className={cn("flex items-start gap-3 rounded-xl border bg-background p-3", !has && "opacity-50")}
              >
                <Award className={cn("mt-0.5 size-5 shrink-0", has ? "text-streak" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-semibold">{badge.label}</p>
                  <p className="text-xs text-muted-foreground">{has ? badge.description : "Chưa đạt"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="max-w-md rounded-2xl border bg-card p-5">
        <h2 className="mb-4 font-heading font-bold">Thông tin của bạn</h2>
        <ProfileForm profile={profile} />
      </section>
    </div>
  );
}
