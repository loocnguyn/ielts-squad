import { roundBand } from "@/lib/bands";

export type DayBandInput = { date: string; user_id: string; band: number };

/** YYYY-MM-DD shifted by a number of days (UTC arithmetic on a plain date). */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function weekStart(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

export function dateRange(from: string, to: string) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** One band per user per day: the IELTS-rounded mean of that day's graded skills. */
export function dailyBands(rows: DayBandInput[]) {
  const byKey = new Map<string, number[]>();
  for (const row of rows) {
    const key = `${row.user_id}|${row.date}`;
    byKey.set(key, [...(byKey.get(key) ?? []), row.band]);
  }
  const result = new Map<string, Map<string, number>>();
  for (const [key, bands] of byKey) {
    const [userId, date] = key.split("|");
    const mean = bands.reduce((sum, band) => sum + band, 0) / bands.length;
    if (!result.has(userId)) result.set(userId, new Map());
    result.get(userId)!.set(date, roundBand(mean));
  }
  return result;
}

export type Standing = { userId: string; average: number | null; days: number };

/** Ranks users by mean daily band over `dates`; people with no graded day go last. */
export function standings(userIds: string[], perUser: Map<string, Map<string, number>>, dates: string[]): Standing[] {
  return userIds
    .map((userId) => {
      const bands = dates.map((d) => perUser.get(userId)?.get(d)).filter((b): b is number => b != null);
      return {
        userId,
        days: bands.length,
        average: bands.length ? bands.reduce((sum, b) => sum + b, 0) / bands.length : null,
      };
    })
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || b.days - a.days);
}

export const BADGES: Record<string, { label: string; description: string }> = {
  first_full_day: { label: "Ngày đầu trọn vẹn", description: "Xong đủ các kỹ năng trong một ngày" },
  streak_3: { label: "Chuỗi 3 ngày", description: "3 ngày liền xong đủ bộ đề" },
  streak_7: { label: "Chuỗi 7 ngày", description: "Một tuần không bỏ ngày nào" },
  streak_30: { label: "Chuỗi 30 ngày", description: "Một tháng bền bỉ" },
  band8_reading: { label: "Band 8 Reading", description: "Lần đầu chạm band 8 Reading" },
  band8_listening: { label: "Band 8 Listening", description: "Lần đầu chạm band 8 Listening" },
  band8_writing: { label: "Band 8 Writing", description: "Lần đầu chạm band 8 Writing" },
  band8_speaking: { label: "Band 8 Speaking", description: "Lần đầu chạm band 8 Speaking" },
};
