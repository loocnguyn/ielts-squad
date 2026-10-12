import { describe, expect, it } from "vitest";
import { parseImport } from "@/lib/tests/import-schema";
import { buildSpeakingGradingPrompt } from "@/lib/tests/prompts";
import type { FullSpeakingContent } from "@/lib/tests/types";
import { PREP_SECONDS, TALK_SECONDS, buildExamSteps, formatTranscript } from "./script";

const raw = {
  skill: "speaking",
  part: "full",
  title: "A teacher who influenced you",
  part1: {
    topics: [
      { topic: "Work or study", questions: ["Do you work or study?", "Why did you choose it?"] },
      { topic: "Music", questions: ["Do you like music?", "Do you play an instrument?"] },
    ],
  },
  part2: {
    cue_card: {
      prompt: "Describe a teacher who has influenced you.",
      bullets: ["who this teacher was", "what they taught"],
      closing: "and explain how this teacher has influenced you.",
    },
    rounding_off: ["Are you still in contact with this teacher?"],
  },
  part3: { theme: "Teachers", questions: ["What makes a good teacher?", "Will technology replace teachers?"] },
};

function importFull() {
  const result = parseImport(JSON.stringify(raw));
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.tests[0];
}

describe("full speaking tests", () => {
  it("imports as one test for the speaking room", () => {
    const test = importFull();
    expect(test.part).toBe("full");
    expect(test.duration_sec).toBe(14 * 60);
    expect(test.answer_key).toBeNull();
  });

  it("runs Part 1, the timed long turn, rounding off, then Part 3", () => {
    const steps = buildExamSteps(importFull().content as FullSpeakingContent);
    expect(steps.map((s) => `${s.part}${s.kind[0]}`).join(" ")).toBe("1q 1q 1q 1q 2p 2t 2q 3q 3q");
    expect(steps[4].timer).toBe(PREP_SECONDS);
    expect(steps[5].timer).toBe(TALK_SECONDS);
    expect(steps[5].prompt).toContain("You should say:");
  });

  it("sets the candidate's words under each question and leaves preparation out", () => {
    const steps = buildExamSteps(importFull().content as FullSpeakingContent);
    const transcript = formatTranscript(
      steps.map((step, i) => ({ ...step, answer: step.kind === "prep" ? "notes" : i === 1 ? "" : `answer ${i}` })),
    );
    expect(transcript.startsWith("PART 1\nExaminer: Do you work or study?\nCandidate: answer 0")).toBe(true);
    expect(transcript).toContain("Candidate: (no answer)");
    expect(transcript).toContain("PART 2\nCue card: Describe a teacher");
    expect(transcript).toContain("Candidate (long turn): answer 5");
    expect(transcript).not.toContain("notes");
    expect(transcript).toContain("PART 3\nExaminer: What makes a good teacher?");
  });

  it("asks the grader for one band over the whole test", () => {
    const prompt = buildSpeakingGradingPrompt({
      attemptId: "a1",
      content: importFull().content as FullSpeakingContent,
      transcript: "PART 1\nExaminer: Do you work or study?\nCandidate: I study.",
      speakingSeconds: 600,
    });
    expect(prompt).toContain("complete IELTS Speaking test");
    expect(prompt).toContain('"task": "speaking_full"');
    expect(prompt).not.toContain("EXAMINER'S QUESTIONS");
  });
});
