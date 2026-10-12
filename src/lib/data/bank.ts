import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Skill, TestRow } from "@/lib/types";

export type BankSummaryRow = { skill: Skill; part: string; total: number; ready: number };

export const getBankSummary = cache(async (): Promise<BankSummaryRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bank_summary");
  if (error) throw new Error(error.message);
  return data as BankSummaryRow[];
});

export type MyTest = Pick<
  TestRow,
  "id" | "skill" | "part" | "title" | "question_types" | "duration_sec" | "audio_path" | "created_at"
>;

/** Tests the caller authored. RLS also returns tests dealt to their groups, hence the filter. */
export const getMyTests = cache(async (userId: string): Promise<MyTest[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tests")
    .select("id, skill, part, title, question_types, duration_sec, audio_path, created_at")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data as MyTest[];
});

export const getTest = cache(async (testId: string): Promise<TestRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
  return (data as TestRow | null) ?? null;
});

export type BankStatus = {
  /** Tests in the pre-written bank that ship with this build. */
  available: number;
  loaded: number;
  missingAudio: { id: string; key: string }[];
};

/** Null for people who do not own a group: only owners load the pre-written bank. */
export const getBankStatus = cache(async (): Promise<BankStatus | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("bank_status");
  const status = data as { keys: string[]; missing_audio: BankStatus["missingAudio"] } | null;
  if (!status) return null;
  const { bankTests } = await import("@/lib/data/bank-content");
  const loaded = new Set(status.keys);
  return {
    available: bankTests.length,
    loaded: bankTests.filter((t) => loaded.has(t.key)).length,
    missingAudio: status.missing_audio,
  };
});
