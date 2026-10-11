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
