import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Attempt,
  DailySet,
  Grade,
  GradeSource,
  PeerReview,
  ProgressRow,
  Skill,
  Streak,
  TestRow,
} from "@/lib/types";

export const VN_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Today's date in Vietnam as YYYY-MM-DD, the same day boundary the database deals on. */
export function todayInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TIMEZONE }).format(now);
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function testIdFor(set: DailySet, skill: Skill) {
  return set[`${skill}_test_id`];
}

/** Deals today's set if needed (idempotent) and returns it. */
export const ensureTodaySet = cache(async (groupId: string): Promise<DailySet | null> => {
  const supabase = await createClient();
  const { data: setId, error } = await supabase.rpc("ensure_daily_set", { p_group_id: groupId });
  if (error || !setId) return null;
  const { data } = await supabase.from("daily_sets").select("*").eq("id", setId).maybeSingle();
  return (data as DailySet | null) ?? null;
});

export const getSetByDate = cache(async (groupId: string, date: string): Promise<DailySet | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_sets")
    .select("*")
    .eq("group_id", groupId)
    .eq("date", date)
    .maybeSingle();
  return (data as DailySet | null) ?? null;
});

export type TestSummary = Pick<TestRow, "id" | "skill" | "part" | "title" | "duration_sec">;

export const getSetTests = cache(async (set: DailySet): Promise<Partial<Record<Skill, TestSummary>>> => {
  const ids = [set.reading_test_id, set.listening_test_id, set.writing_test_id, set.speaking_test_id].filter(
    (id): id is string => Boolean(id),
  );
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("tests").select("id, skill, part, title, duration_sec").in("id", ids);
  return Object.fromEntries(((data ?? []) as TestSummary[]).map((test) => [test.skill, test]));
});

export const getProgress = cache(async (dailySetId: string): Promise<ProgressRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("daily_set_progress", { p_daily_set_id: dailySetId });
  return (data ?? []) as ProgressRow[];
});

export type SkillBand = {
  attempt_id: string;
  daily_set_id: string;
  group_id: string;
  date: string;
  user_id: string;
  skill: Skill;
  band: number;
  source: GradeSource;
};

/** Bands the caller is allowed to see for one set (their own, plus mates' once unlocked). */
export const getSetBands = cache(async (dailySetId: string): Promise<SkillBand[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("daily_skill_bands").select("*").eq("daily_set_id", dailySetId);
  return (data ?? []) as SkillBand[];
});

export const getGroupStreaks = cache(async (groupId: string): Promise<Streak[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("streaks").select("*").eq("group_id", groupId);
  return (data ?? []) as Streak[];
});

/** A streak only counts while its last full day is today or yesterday. */
export function liveStreak(streak: Streak | undefined, today: string) {
  if (!streak?.last_full_day) return 0;
  const gap = (Date.parse(today) - Date.parse(streak.last_full_day)) / 86_400_000;
  return gap <= 1 ? streak.current : 0;
}

export const getMyAttempt = cache(
  async (dailySetId: string, userId: string, skill: Skill): Promise<Attempt | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("attempts")
      .select("*")
      .eq("daily_set_id", dailySetId)
      .eq("user_id", userId)
      .eq("skill", skill)
      .maybeSingle();
    return (data as Attempt | null) ?? null;
  },
);

export type AttemptWithGrades = Attempt & { grades: Grade[]; peer_reviews: PeerReview[] };

/** Every submitted attempt of one skill the caller may see, with grades and reviews. */
export const getVisibleAttempts = cache(
  async (dailySetId: string, skill: Skill): Promise<AttemptWithGrades[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("attempts")
      .select("*, grades(*), peer_reviews(*)")
      .eq("daily_set_id", dailySetId)
      .eq("skill", skill)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: true });
    return (data ?? []) as AttemptWithGrades[];
  },
);

export type BandHistoryRow = { date: string; user_id: string; skill: Skill; band: number; group_id: string };

/** Per-skill bands over time: one user's (all groups) or a whole group's. */
export const getBandHistory = cache(
  async (filter: { userId?: string; groupId?: string; since: string }): Promise<BandHistoryRow[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("daily_skill_bands")
      .select("date, user_id, skill, band, group_id")
      .gte("date", filter.since)
      .order("date", { ascending: true });
    if (filter.userId) query = query.eq("user_id", filter.userId);
    if (filter.groupId) query = query.eq("group_id", filter.groupId);
    const { data } = await query;
    return (data ?? []) as BandHistoryRow[];
  },
);
