import { z } from "zod";
import { expandSpellingVariants, normalizeAnswer } from "./answers";
import {
  COMPLETION_VARIANTS,
  MATCHING_VARIANTS,
  VOICE_KINDS,
  groupQuestionNumbers,
  type AnswerKey,
  type ListeningContent,
  type ListeningTranscript,
  type QuestionGroup,
  type ReadingContent,
  type SpeakingContent,
  type WritingContent,
} from "./types";
import type { Skill } from "@/lib/types";

// ---------------------------------------------------------------------------
// What Claude Pro is asked to return. Answers sit next to their questions here
// (easier for the model to keep consistent); importing splits them off.
// ---------------------------------------------------------------------------

const text = z.string().trim().min(1);
const answerList = z
  .union([text, z.array(text).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]));
const options = z.record(z.string().trim().min(1).max(4), text).refine(
  (o) => Object.keys(o).length >= 2,
  "cần ít nhất 2 lựa chọn",
);
const qn = z.number().int().positive();

const answered = { n: qn, prompt: text, answer: answerList, evidence: z.string().optional() };

const groupSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("multiple_choice"),
    instruction: text,
    questions: z.array(z.object({ ...answered, options })).min(1),
  }),
  z.object({
    type: z.literal("true_false_not_given"),
    instruction: text,
    questions: z.array(z.object(answered)).min(1),
  }),
  z.object({
    type: z.literal("yes_no_not_given"),
    instruction: text,
    questions: z.array(z.object(answered)).min(1),
  }),
  z.object({
    type: z.literal("matching"),
    variant: z.enum(MATCHING_VARIANTS).default("generic"),
    instruction: text,
    options,
    questions: z.array(z.object(answered)).min(1),
  }),
  z.object({
    type: z.literal("completion"),
    variant: z.enum(COMPLETION_VARIANTS).default("summary"),
    instruction: text,
    word_limit: text,
    text,
    word_bank: options.optional(),
    answers: z.record(z.string(), answerList),
    evidence: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("short_answer"),
    instruction: text,
    word_limit: text,
    questions: z.array(z.object(answered)).min(1),
  }),
]);

type RawGroup = z.infer<typeof groupSchema>;

const readingSchema = z.object({
  skill: z.literal("reading"),
  title: text,
  passage: z.object({
    title: text,
    paragraphs: z.array(z.object({ label: z.string().trim().optional(), text })).min(3),
  }),
  groups: z.array(groupSchema).min(1),
});

const listeningSchema = z.object({
  skill: z.literal("listening"),
  title: text,
  parts: z
    .array(
      z.object({
        part: z.number().int().min(1).max(4),
        context: text,
        speakers: z
          .array(z.object({ id: text, name: text, voice: z.enum(VOICE_KINDS) }))
          .min(1)
          .max(4),
        script: z.array(z.object({ speaker: text, text })).min(4),
        groups: z.array(groupSchema).min(1),
      }),
    )
    .min(1)
    .max(4),
});

const numbers = z.array(z.number().finite()).min(1);

const chartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["line", "bar"]),
    title: text,
    x_label: z.string().optional(),
    y_label: z.string().optional(),
    unit: z.string().optional(),
    categories: z.array(z.coerce.string()).min(2).max(12),
    series: z.array(z.object({ name: text, values: numbers })).min(1).max(6),
  }),
  z.object({
    type: z.literal("pie"),
    title: text,
    unit: z.string().optional(),
    slices: z.array(z.object({ name: text, value: z.number().positive() })).min(2).max(8),
  }),
  z.object({
    type: z.literal("table"),
    title: text,
    columns: z.array(text).min(2).max(8),
    rows: z.array(z.array(z.union([z.string(), z.number()]))).min(2).max(12),
  }),
  z.object({
    type: z.literal("process"),
    title: text,
    steps: z.array(z.object({ label: text, detail: z.string().optional() })).min(3).max(12),
  }),
]);

const writingSchema = z.discriminatedUnion("task", [
  z.object({ skill: z.literal("writing"), task: z.literal(1), title: text, prompt: text, chart: chartSchema }),
  z.object({
    skill: z.literal("writing"),
    task: z.literal(2),
    title: text,
    prompt: text,
    essay_type: z.string().trim().default("opinion"),
  }),
]);

const questionList = z.array(text).min(2).max(8);

const speakingSchema = z.discriminatedUnion("part", [
  z.object({
    skill: z.literal("speaking"),
    part: z.literal(1),
    title: text,
    topics: z.array(z.object({ topic: text, questions: questionList })).min(1).max(3),
  }),
  z.object({
    skill: z.literal("speaking"),
    part: z.literal(2),
    title: text,
    cue_card: z.object({
      prompt: text,
      bullets: z.array(text).min(2).max(5),
      closing: z.string().optional(),
    }),
    rounding_off: z.array(text).max(3).default([]),
  }),
  z.object({
    skill: z.literal("speaking"),
    part: z.literal(3),
    title: text,
    theme: text,
    questions: questionList,
  }),
]);

// ---------------------------------------------------------------------------
// Import: validate, cross-check, split content from secrets.
// ---------------------------------------------------------------------------

export type ImportableTest = {
  skill: Skill;
  part: string;
  title: string;
  question_types: string[];
  content: ReadingContent | ListeningContent | WritingContent | SpeakingContent;
  duration_sec: number;
  answer_key: AnswerKey | null;
  transcript: ListeningTranscript | { explanations: Record<string, string> } | null;
};

export type ImportResult =
  | { ok: true; tests: ImportableTest[] }
  | { ok: false; errors: string[] };

const TFNG = ["TRUE", "FALSE", "NOT GIVEN"];
const YNNG = ["YES", "NO", "NOT GIVEN"];

/** Splits one pasted group into what test takers see and what stays secret. */
function splitGroup(raw: RawGroup, where: string, errors: string[]) {
  const key: AnswerKey = {};
  const explanations: Record<string, string> = {};
  let group: QuestionGroup;

  const mustBeOneOf = (n: number, answers: string[], allowed: string[]) => {
    const allowedSet = allowed.map((a) => a.toUpperCase());
    if (!answers.every((a) => allowedSet.includes(a.toUpperCase()))) {
      errors.push(`${where}, câu ${n}: đáp án "${answers.join(" / ")}" không nằm trong ${allowed.join(", ")}.`);
    }
  };

  if (raw.type === "completion") {
    const blanks = [...raw.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
    if (blanks.length === 0) errors.push(`${where}: phần completion không có chỗ trống {{n}} nào.`);
    for (const n of blanks) {
      const answers = raw.answers[n];
      if (!answers) {
        errors.push(`${where}, câu ${n}: thiếu đáp án.`);
        continue;
      }
      if (raw.word_bank) mustBeOneOf(Number(n), answers, Object.keys(raw.word_bank));
      key[n] = raw.word_bank ? answers : expandSpellingVariants(answers);
      if (raw.evidence?.[n]) explanations[n] = raw.evidence[n];
    }
    for (const n of Object.keys(raw.answers)) {
      if (!blanks.includes(n)) errors.push(`${where}: có đáp án cho câu ${n} nhưng không có chỗ trống {{${n}}}.`);
    }
    group = {
      type: "completion",
      variant: raw.variant,
      instruction: raw.instruction,
      word_limit: raw.word_limit,
      text: raw.text,
      ...(raw.word_bank ? { word_bank: raw.word_bank } : {}),
    };
    return { group, key, explanations };
  }

  for (const q of raw.questions) {
    const n = String(q.n);
    if ("options" in q) mustBeOneOf(q.n, q.answer, Object.keys(q.options));
    if (raw.type === "matching") mustBeOneOf(q.n, q.answer, Object.keys(raw.options));
    if (raw.type === "true_false_not_given") mustBeOneOf(q.n, q.answer, TFNG);
    if (raw.type === "yes_no_not_given") mustBeOneOf(q.n, q.answer, YNNG);
    key[n] = raw.type === "short_answer" ? expandSpellingVariants(q.answer) : q.answer;
    if (q.evidence) explanations[n] = q.evidence;
  }

  if (raw.type === "multiple_choice") {
    group = {
      type: raw.type,
      instruction: raw.instruction,
      questions: raw.questions.map(({ n, prompt, options }) => ({ n, prompt, options })),
    };
  } else if (raw.type === "matching") {
    group = {
      type: raw.type,
      variant: raw.variant,
      instruction: raw.instruction,
      options: raw.options,
      questions: raw.questions.map(({ n, prompt }) => ({ n, prompt })),
    };
  } else if (raw.type === "short_answer") {
    group = {
      type: raw.type,
      instruction: raw.instruction,
      word_limit: raw.word_limit,
      questions: raw.questions.map(({ n, prompt }) => ({ n, prompt })),
    };
  } else {
    group = {
      type: raw.type,
      instruction: raw.instruction,
      questions: raw.questions.map(({ n, prompt }) => ({ n, prompt })),
    };
  }
  return { group, key, explanations };
}

function splitGroups(rawGroups: RawGroup[], where: string, errors: string[]) {
  const groups: QuestionGroup[] = [];
  const key: AnswerKey = {};
  const explanations: Record<string, string> = {};
  for (const [i, raw] of rawGroups.entries()) {
    const part = splitGroup(raw, `${where}, nhóm câu ${i + 1}`, errors);
    groups.push(part.group);
    Object.assign(key, part.key);
    Object.assign(explanations, part.explanations);
  }
  return { groups, key, explanations };
}

/** Question numbers must run 1..N with no gaps or repeats. */
function checkNumbering(groups: QuestionGroup[], where: string, errors: string[]) {
  const numbers = groups.flatMap(groupQuestionNumbers);
  const expected = numbers.map((_, i) => i + 1);
  if (numbers.join(",") !== expected.join(",")) {
    errors.push(`${where}: số câu phải chạy liên tục 1–${numbers.length}, đang là ${numbers.join(", ")}.`);
  }
  return numbers.length;
}

/** Typed answers must be copied from the source text, as in the real test. */
function checkAnswersInSource(
  groups: QuestionGroup[],
  key: AnswerKey,
  source: string,
  where: string,
  errors: string[],
) {
  const haystack = ` ${normalizeAnswer(source)} `;
  for (const group of groups) {
    const typed =
      group.type === "short_answer" || (group.type === "completion" && !group.word_bank);
    if (!typed) continue;
    for (const n of groupQuestionNumbers(group)) {
      const accepted = key[String(n)] ?? [];
      if (!accepted.some((a) => haystack.includes(` ${normalizeAnswer(a)} `))) {
        errors.push(`${where}, câu ${n}: đáp án "${accepted[0]}" không xuất hiện nguyên văn trong bài.`);
      }
    }
  }
}

function questionTypes(groups: QuestionGroup[]) {
  return [...new Set(groups.map((g) => ("variant" in g ? `${g.type}:${g.variant}` : g.type)))];
}

function zodErrors(error: z.ZodError, where: string) {
  return error.issues
    .slice(0, 8)
    .map((issue) => `${where}${issue.path.length ? ` › ${issue.path.join(".")}` : ""}: ${issue.message}`);
}

function invalid(error: z.ZodError, where: string, errors: string[]): null {
  errors.push(...zodErrors(error, where));
  return null;
}

function importOne(raw: unknown, where: string, errors: string[]): ImportableTest | null {
  const skill = (raw as { skill?: unknown } | null)?.skill;

  if (skill === "reading") {
    const parsed = readingSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error, where, errors);
    const { title, passage, groups: rawGroups } = parsed.data;
    const { groups, key, explanations } = splitGroups(rawGroups, where, errors);
    const total = checkNumbering(groups, where, errors);
    if (total < 10 || total > 14) errors.push(`${where}: Reading cần 10–14 câu, đang có ${total}.`);
    const passageText = passage.paragraphs.map((p) => p.text).join(" ");
    const words = passageText.split(/\s+/).length;
    if (words < 600) errors.push(`${where}: passage mới ${words} từ, cần khoảng 800–950.`);
    checkAnswersInSource(groups, key, passageText, where, errors);
    return {
      skill: "reading",
      part: "passage",
      title,
      question_types: questionTypes(groups),
      content: { passage, groups },
      duration_sec: 20 * 60,
      answer_key: key,
      transcript: { explanations },
    };
  }

  if (skill === "listening") {
    const parsed = listeningSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error, where, errors);
    const key: AnswerKey = {};
    const explanations: Record<string, string> = {};
    const contentParts: ListeningContent["parts"] = [];
    const transcriptParts: ListeningTranscript["parts"] = [];
    let words = 0;

    for (const part of parsed.data.parts) {
      const partWhere = `${where}, Part ${part.part}`;
      const split = splitGroups(part.groups, partWhere, errors);
      Object.assign(key, split.key);
      Object.assign(explanations, split.explanations);
      const speakerIds = part.speakers.map((s) => s.id);
      for (const line of part.script) {
        if (!speakerIds.includes(line.speaker)) {
          errors.push(`${partWhere}: lời thoại dùng người nói "${line.speaker}" chưa khai báo.`);
          break;
        }
      }
      const script = part.script.map((l) => l.text).join(" ");
      words += script.split(/\s+/).length;
      checkAnswersInSource(split.groups, split.key, script, partWhere, errors);
      contentParts.push({ part: part.part, context: part.context, groups: split.groups });
      transcriptParts.push({ part: part.part, speakers: part.speakers, script: part.script });
    }

    const allGroups = contentParts.flatMap((p) => p.groups);
    const total = checkNumbering(allGroups, where, errors);
    if (total < 10 || total > 20) errors.push(`${where}: Listening cần 10–20 câu, đang có ${total}.`);
    return {
      skill: "listening",
      part: `part${contentParts.map((p) => p.part).join("-")}`,
      title: parsed.data.title,
      question_types: questionTypes(allGroups),
      content: { parts: contentParts },
      // Replaced by the real audio length (plus checking time) once it is generated.
      duration_sec: Math.round((words / 150) * 60) + 120,
      answer_key: key,
      transcript: { parts: transcriptParts, explanations },
    };
  }

  if (skill === "writing") {
    const parsed = writingSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error, where, errors);
    const data = parsed.data;
    if (data.task === 1 && (data.chart.type === "line" || data.chart.type === "bar")) {
      for (const series of data.chart.series) {
        if (series.values.length !== data.chart.categories.length) {
          errors.push(`${where}: series "${series.name}" có ${series.values.length} giá trị nhưng có ${data.chart.categories.length} mốc.`);
        }
      }
    }
    if (data.task === 1 && data.chart.type === "table") {
      const { columns, rows } = data.chart;
      if (rows.some((row) => row.length !== columns.length)) {
        errors.push(`${where}: mỗi dòng của bảng phải có đúng ${columns.length} ô.`);
      }
    }
    return {
      skill: "writing",
      part: `task${data.task}`,
      title: data.title,
      question_types: data.task === 1 ? [data.chart.type] : [data.essay_type],
      content:
        data.task === 1
          ? { task: 1, prompt: data.prompt, chart: data.chart }
          : { task: 2, prompt: data.prompt, essay_type: data.essay_type },
      duration_sec: data.task === 1 ? 20 * 60 : 40 * 60,
      answer_key: null,
      transcript: null,
    };
  }

  if (skill === "speaking") {
    const parsed = speakingSchema.safeParse(raw);
    if (!parsed.success) return invalid(parsed.error, where, errors);
    const data = parsed.data;
    const content: SpeakingContent =
      data.part === 1
        ? { part: 1, topics: data.topics }
        : data.part === 2
          ? { part: 2, cue_card: data.cue_card, rounding_off: data.rounding_off }
          : { part: 3, theme: data.theme, questions: data.questions };
    return {
      skill: "speaking",
      part: `part${data.part}`,
      title: data.title,
      question_types: [`part${data.part}`],
      content,
      // Part 2 is 1 min preparation + 2 min talk; the others are a short interview.
      duration_sec: data.part === 2 ? 4 * 60 : 5 * 60,
      answer_key: null,
      transcript: null,
    };
  }

  errors.push(`${where}: thiếu trường "skill" (reading, listening, writing hoặc speaking).`);
  return null;
}

/** Pulls the JSON out of a pasted reply, with or without a ```json fence. */
export function extractJson(pasted: string): unknown {
  const fenced = pasted.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : pasted).trim();
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("no json");
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Validates a pasted batch: `{ "tests": [...] }`, a bare array, or one test. */
export function parseImport(pasted: string): ImportResult {
  let json: unknown;
  try {
    json = extractJson(pasted);
  } catch {
    return { ok: false, errors: ["Không đọc được JSON. Hãy copy nguyên khối JSON Claude trả về."] };
  }

  const list = Array.isArray(json)
    ? json
    : Array.isArray((json as { tests?: unknown })?.tests)
      ? (json as { tests: unknown[] }).tests
      : [json];

  if (list.length === 0) return { ok: false, errors: ["Không có đề nào trong JSON."] };
  if (list.length > 14) return { ok: false, errors: ["Mỗi lần dán tối đa 14 đề."] };

  const errors: string[] = [];
  const tests: ImportableTest[] = [];
  list.forEach((raw, i) => {
    const test = importOne(raw, list.length > 1 ? `Đề ${i + 1}` : "Đề", errors);
    if (test) tests.push(test);
  });

  return errors.length ? { ok: false, errors } : { ok: true, tests };
}
