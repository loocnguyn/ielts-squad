// Shapes stored in tests.content. Answers never appear here: they are split
// off into test_secrets when a test is imported.

export type Options = Record<string, string>;

export type ChoiceQuestion = { n: number; prompt: string; options: Options };
export type PlainQuestion = { n: number; prompt: string };

export type QuestionGroup =
  | { type: "multiple_choice"; instruction: string; questions: ChoiceQuestion[] }
  | { type: "true_false_not_given"; instruction: string; questions: PlainQuestion[] }
  | { type: "yes_no_not_given"; instruction: string; questions: PlainQuestion[] }
  | {
      type: "matching";
      variant: MatchingVariant;
      instruction: string;
      options: Options;
      questions: PlainQuestion[];
    }
  | {
      type: "completion";
      variant: CompletionVariant;
      instruction: string;
      word_limit: string;
      /** Text with {{n}} where question n's blank goes. */
      text: string;
      /** Present when blanks are filled from a lettered list instead of typed. */
      word_bank?: Options;
    }
  | { type: "short_answer"; instruction: string; word_limit: string; questions: PlainQuestion[] };

export const MATCHING_VARIANTS = [
  "headings",
  "information",
  "features",
  "sentence_endings",
  "map_labelling",
  "generic",
] as const;
export type MatchingVariant = (typeof MATCHING_VARIANTS)[number];

export const COMPLETION_VARIANTS = [
  "summary",
  "note",
  "table",
  "flow_chart",
  "sentence",
  "form",
  "diagram_label",
] as const;
export type CompletionVariant = (typeof COMPLETION_VARIANTS)[number];

export type ReadingContent = {
  passage: { title: string; paragraphs: { label?: string; text: string }[] };
  groups: QuestionGroup[];
};

export type ListeningContent = {
  parts: { part: number; context: string; groups: QuestionGroup[] }[];
};

type XYChart<T extends "line" | "bar"> = {
  type: T;
  title: string;
  x_label?: string;
  y_label?: string;
  unit?: string;
  categories: string[];
  series: { name: string; values: number[] }[];
};

export type ChartSpec =
  | XYChart<"line">
  | XYChart<"bar">
  | { type: "pie"; title: string; unit?: string; slices: { name: string; value: number }[] }
  | { type: "table"; title: string; columns: string[]; rows: (string | number)[][] }
  | { type: "process"; title: string; steps: { label: string; detail?: string }[] };

export type WritingContent =
  | { task: 1; prompt: string; chart: ChartSpec }
  | { task: 2; prompt: string; essay_type: string };

export type SpeakingContent =
  | { part: 1; topics: { topic: string; questions: string[] }[] }
  | {
      part: 2;
      cue_card: { prompt: string; bullets: string[]; closing?: string };
      rounding_off: string[];
    }
  | { part: 3; theme: string; questions: string[] };

export type Speaker = { id: string; name: string; voice: VoiceKind };
export const VOICE_KINDS = ["female_uk", "male_uk", "female_us", "male_us"] as const;
export type VoiceKind = (typeof VOICE_KINDS)[number];

/** Listening script, kept in test_secrets until the listener has submitted. */
export type ListeningTranscript = {
  parts: { part: number; speakers: Speaker[]; script: { speaker: string; text: string }[] }[];
  explanations?: Record<string, string>;
};

export type AnswerKey = Record<string, string[]>;

/** Every blank / question number in a group, in order. */
export function groupQuestionNumbers(group: QuestionGroup): number[] {
  if (group.type === "completion") {
    return [...group.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  }
  return group.questions.map((q) => q.n);
}

export function contentGroups(content: ReadingContent | ListeningContent): QuestionGroup[] {
  return "parts" in content ? content.parts.flatMap((p) => p.groups) : content.groups;
}

export function countQuestions(content: ReadingContent | ListeningContent) {
  return contentGroups(content).reduce((sum, g) => sum + groupQuestionNumbers(g).length, 0);
}
