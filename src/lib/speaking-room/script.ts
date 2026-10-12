import { cueCardText } from "@/lib/tests/prompts";
import type { FullSpeakingContent } from "@/lib/tests/types";

// The running order of a full mock Speaking test, as the examiner works
// through it in the speaking room.

export const PREP_SECONDS = 60;
export const TALK_SECONDS = 120;

export type ExamStep = {
  part: 1 | 2 | 3;
  /** question: asked aloud. prep / talk: the two halves of the Part 2 long turn. */
  kind: "question" | "prep" | "talk";
  /** Shown above the question on the examiner's sheet, e.g. the Part 1 topic. */
  heading?: string;
  /** What the examiner reads out; for Part 2, the cue card. */
  prompt: string;
  /** Countdown for this step, in seconds. */
  timer?: number;
};

export function buildExamSteps(content: FullSpeakingContent): ExamStep[] {
  const steps: ExamStep[] = [];
  for (const topic of content.part1.topics) {
    for (const question of topic.questions) {
      steps.push({ part: 1, kind: "question", heading: topic.topic, prompt: question });
    }
  }
  const card = cueCardText(content.part2.cue_card);
  steps.push({ part: 2, kind: "prep", prompt: card, timer: PREP_SECONDS });
  steps.push({ part: 2, kind: "talk", prompt: card, timer: TALK_SECONDS });
  for (const question of content.part2.rounding_off) {
    steps.push({ part: 2, kind: "question", heading: "Rounding off", prompt: question });
  }
  for (const question of content.part3.questions) {
    steps.push({ part: 3, kind: "question", heading: content.part3.theme, prompt: question });
  }
  return steps;
}

/** What the examiner says to move the test along; not part of the transcript. */
export const EXAMINER_LINES: Record<string, string> = {
  opening: "Good morning. Can you tell me your full name, please? … Thank you. In this first part, I'd like to ask you some questions about yourself.",
  prep: "Now I'm going to give you a topic, and I'd like you to talk about it for one to two minutes. Before you talk, you'll have one minute to think about what you're going to say. You can make some notes if you wish.",
  talk: "All right? Remember, you have one to two minutes for this, so don't worry if I stop you. I'll tell you when the time is up. Can you start speaking now, please?",
  part3: "We've been talking about the topic on your card, and I'd like to discuss with you one or two more general questions related to this.",
  closing: "Thank you. That is the end of the speaking test.",
};

/** One answered step: what was asked, and what the candidate said. */
export type AnsweredStep = Pick<ExamStep, "part" | "kind" | "prompt"> & { answer: string };

/** The transcript handed to the grader: the candidate's words under each question. */
export function formatTranscript(answers: AnsweredStep[]) {
  const lines: string[] = [];
  let part = 0;
  for (const step of answers) {
    if (step.kind === "prep") continue;
    if (step.part !== part) {
      part = step.part;
      lines.push("", `PART ${part}`);
    }
    if (step.kind === "talk") lines.push(`Cue card: ${step.prompt.replace(/\n/g, " ")}`, `Candidate (long turn): ${step.answer || "(no answer)"}`);
    else lines.push(`Examiner: ${step.prompt}`, `Candidate: ${step.answer || "(no answer)"}`);
  }
  return lines.join("\n").trim();
}
