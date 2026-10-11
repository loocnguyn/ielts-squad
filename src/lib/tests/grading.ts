import { z } from "zod";
import { isValidBand } from "@/lib/bands";
import { extractJson } from "./import-schema";

const band = z.number().refine(isValidBand, "band phải nằm trong 0–9 và theo bước 0.5");
const criterion = z.object({ band, comment: z.string().trim().min(1) });

const shared = {
  attempt_id: z.string(),
  task: z.string(),
  overall_band: band,
  to_reach_8: z.array(z.string().trim().min(1)).min(1).max(8),
  corrections: z
    .array(z.object({ original: z.string(), better: z.string(), why: z.string() }))
    .max(20)
    .default([]),
};

const writingGrade = z.object({
  ...shared,
  criteria: z.object({
    task_response: criterion,
    coherence_cohesion: criterion,
    lexical_resource: criterion,
    grammar: criterion,
  }),
});

// Pronunciation cannot be judged from a transcript; group mates score it by ear.
const speakingGrade = z.object({
  ...shared,
  criteria: z.object({
    fluency_coherence: criterion,
    lexical_resource: criterion,
    grammar: criterion,
  }),
});

export type GradeCriteria = Record<string, { band: number; comment: string }>;
export type ClaudeGrade = {
  overall_band: number;
  criteria: GradeCriteria;
  to_reach_8: string[];
  corrections: { original: string; better: string; why: string }[];
};

/** Labels, listed in the order the criteria are shown. */
export const CRITERIA_LABELS: Record<string, string> = {
  task_response: "Task Achievement / Response",
  fluency_coherence: "Fluency & Coherence",
  coherence_cohesion: "Coherence & Cohesion",
  lexical_resource: "Lexical Resource",
  grammar: "Grammatical Range & Accuracy",
};

export type GradeParseResult = { ok: true; grade: ClaudeGrade } | { ok: false; errors: string[] };

/** Validates the JSON pasted back from Claude Pro for one attempt. */
export function parseClaudeGrade(
  pasted: string,
  expected: { attemptId: string; skill: "writing" | "speaking" },
): GradeParseResult {
  let json: unknown;
  try {
    json = extractJson(pasted);
  } catch {
    return { ok: false, errors: ["Không đọc được JSON. Hãy copy nguyên khối JSON Claude trả về."] };
  }

  const parsed = (expected.skill === "writing" ? writingGrade : speakingGrade).safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join(".") || "JSON"}: ${issue.message}`),
    };
  }

  const grade = parsed.data;
  const errors: string[] = [];
  if (grade.attempt_id !== expected.attemptId) {
    errors.push("attempt_id không khớp bài này. Có thể bạn dán nhầm kết quả của bài khác.");
  }
  const bands = Object.values(grade.criteria).map((c) => c.band);
  const mean = bands.reduce((sum, b) => sum + b, 0) / bands.length;
  if (Math.abs(grade.overall_band - mean) > 0.5) {
    errors.push(
      `overall_band ${grade.overall_band} lệch quá xa trung bình các tiêu chí (${mean.toFixed(2)}).`,
    );
  }
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    grade: {
      overall_band: grade.overall_band,
      criteria: grade.criteria,
      to_reach_8: grade.to_reach_8,
      corrections: grade.corrections,
    },
  };
}

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
