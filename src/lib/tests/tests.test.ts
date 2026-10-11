import { describe, expect, it } from "vitest";
import starter from "@/content/starter-tests.json";
import { roundBand } from "@/lib/bands";
import { expandSpellingVariants, isCorrect, normalizeAnswer } from "./answers";
import { parseClaudeGrade } from "./grading";
import { extractJson, parseImport } from "./import-schema";
import {
  buildAuthoringPrompt,
  buildSpeakingGradingPrompt,
  buildWritingGradingPrompt,
} from "./prompts";
import {
  countQuestions,
  type ListeningContent,
  type ReadingContent,
  type SpeakingContent,
  type WritingContent,
} from "./types";

function importStarter() {
  const result = parseImport(JSON.stringify(starter));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.tests;
}

type LooseGroup = {
  type: string;
  questions?: { answer: string }[];
  answers?: Record<string, string[]>;
  text?: string;
};

/** A deep copy of the starter reading test for a test to break. */
function reading() {
  return structuredClone(starter.tests[0]) as unknown as { groups: LooseGroup[] };
}

describe("normalizeAnswer", () => {
  it("ignores case, punctuation, hyphens and spacing", () => {
    expect(normalizeAnswer("  The  Well-Known “Nile”. ")).toBe("the well known nile");
    expect(normalizeAnswer("1,500")).toBe("1500");
  });

  it("marks answers against the accepted list", () => {
    expect(isCorrect("carbon  dioxide", ["Carbon dioxide", "CO2"])).toBe(true);
    expect(isCorrect("", ["x"])).toBe(false);
    expect(isCorrect("nile", ["the Nile"])).toBe(false);
  });
});

describe("expandSpellingVariants", () => {
  it("adds the other spelling in both directions", () => {
    expect(expandSpellingVariants(["colour"])).toEqual(["colour", "color"]);
    expect(expandSpellingVariants(["urban centers"])).toEqual(["urban centers", "urban centres"]);
  });

  it("leaves words without a variant alone, and never invents misspellings", () => {
    expect(expandSpellingVariants(["killer whale"])).toEqual(["killer whale"]);
    expect(expandSpellingVariants(["four hours"])).toEqual(["four hours"]);
  });
});

describe("parseImport", () => {
  it("accepts the starter pack and splits answers out of the content", () => {
    const tests = importStarter();
    expect(tests.map((t) => `${t.skill}/${t.part}`)).toEqual([
      "reading/passage",
      "listening/part1-2",
      "writing/task1",
      "writing/task2",
      "speaking/part1",
      "speaking/part2",
      "speaking/part3",
    ]);

    const [read, listen] = tests;
    expect(countQuestions(read.content as ReadingContent)).toBe(13);
    expect(Object.keys(read.answer_key!)).toHaveLength(13);
    expect(read.duration_sec).toBe(1200);
    expect(countQuestions(listen.content as ListeningContent)).toBe(12);
    expect(listen.answer_key!["3"]).toEqual(["38", "thirty-eight"]);

    // Nothing a test taker receives may contain an answer or the script.
    for (const test of [read, listen]) {
      const visible = JSON.stringify(test.content);
      expect(visible).not.toContain('"answer"');
      expect(visible).not.toContain('"answers"');
      expect(visible).not.toContain('"evidence"');
      expect(visible).not.toContain('"script"');
    }
    expect(JSON.stringify(listen.transcript)).toContain("Riverside Leisure Centre");
  });

  it("reads JSON wrapped in a code fence and surrounding chatter", () => {
    const pasted = `Here you go!\n\`\`\`json\n${JSON.stringify(starter.tests[3])}\n\`\`\`\nGood luck.`;
    const result = parseImport(pasted);
    expect(result.ok && result.tests[0].part).toBe("task2");
    expect(extractJson('noise {"a": 1} noise')).toEqual({ a: 1 });
  });

  it("rejects text that is not JSON", () => {
    const result = parseImport("Sorry, I can't help with that.");
    expect(result.ok).toBe(false);
  });

  it("rejects an answer outside the allowed set", () => {
    const test = reading();
    test.groups[0].questions![0].answer = "MAYBE";
    const result = parseImport(JSON.stringify(test));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join(" ")).toContain("MAYBE");
  });

  it("rejects a matching answer that is not one of the options", () => {
    const test = reading();
    test.groups[1].questions![0].answer = "Z";
    expect(parseImport(JSON.stringify(test)).ok).toBe(false);
  });

  it("rejects a completion answer that is not in the passage", () => {
    const test = reading();
    test.groups[2].answers!["13"] = ["serotonin"];
    const result = parseImport(JSON.stringify(test));
    expect(!result.ok && result.errors.join(" ")).toContain("serotonin");
  });

  it("rejects a blank with no answer and broken numbering", () => {
    const missing = reading();
    delete missing.groups[2].answers!["12"];
    expect(parseImport(JSON.stringify(missing)).ok).toBe(false);

    const gap = reading();
    gap.groups[2].text = gap.groups[2].text!.replace("{{13}}", "{{15}}");
    gap.groups[2].answers!["15"] = ["melatonin"];
    delete gap.groups[2].answers!["13"];
    const result = parseImport(JSON.stringify(gap));
    expect(!result.ok && result.errors.join(" ")).toContain("liên tục");
  });

  it("rejects a chart whose series do not match its categories", () => {
    const chart = structuredClone(starter.tests[2]) as { chart: { series: { values: number[] }[] } };
    chart.chart.series[0].values.pop();
    expect(parseImport(JSON.stringify(chart)).ok).toBe(false);
  });
});

describe("parseClaudeGrade", () => {
  const criterion = (band: number) => ({ band, comment: "Clear position, well extended." });
  const writing = {
    attempt_id: "a1",
    task: "writing_task2",
    overall_band: 7.5,
    criteria: {
      task_response: criterion(7.5),
      coherence_cohesion: criterion(8),
      lexical_resource: criterion(7),
      grammar: criterion(7.5),
    },
    to_reach_8: ["Vary sentence openings."],
    corrections: [{ original: "more easier", better: "easier", why: "double comparative" }],
  };
  const expected = { attemptId: "a1", skill: "writing" as const };

  it("accepts a well-formed writing grade", () => {
    const result = parseClaudeGrade("```json\n" + JSON.stringify(writing) + "\n```", expected);
    expect(result.ok && result.grade.overall_band).toBe(7.5);
  });

  it("rejects a grade pasted for a different attempt", () => {
    expect(parseClaudeGrade(JSON.stringify({ ...writing, attempt_id: "zz" }), expected).ok).toBe(false);
  });

  it("rejects bands off the half-band scale and missing criteria", () => {
    expect(parseClaudeGrade(JSON.stringify({ ...writing, overall_band: 7.3 }), expected).ok).toBe(false);
    const threeCriteria = Object.fromEntries(
      Object.entries(writing.criteria).filter(([name]) => name !== "grammar"),
    );
    expect(parseClaudeGrade(JSON.stringify({ ...writing, criteria: threeCriteria }), expected).ok).toBe(false);
  });

  it("rejects an overall band far from the criteria", () => {
    expect(parseClaudeGrade(JSON.stringify({ ...writing, overall_band: 9 }), expected).ok).toBe(false);
  });

  it("expects three criteria for speaking", () => {
    const speaking = {
      ...writing,
      task: "speaking_part2",
      criteria: {
        fluency_coherence: criterion(7),
        lexical_resource: criterion(7.5),
        grammar: criterion(7),
      },
      overall_band: 7,
    };
    expect(parseClaudeGrade(JSON.stringify(speaking), { attemptId: "a1", skill: "speaking" }).ok).toBe(true);
    expect(parseClaudeGrade(JSON.stringify(speaking), expected).ok).toBe(false);
  });
});

describe("prompts", () => {
  it("builds an authoring prompt for every skill and part", () => {
    for (const [skill, part] of [
      ["reading", undefined],
      ["listening", undefined],
      ["writing", "task1"],
      ["writing", "task2"],
      ["speaking", "part1"],
      ["speaking", "part2"],
      ["speaking", "part3"],
    ] as const) {
      const prompt = buildAuthoringPrompt({ skill, part, count: 7, avoidTitles: ["Old title"] });
      expect(prompt).toContain(`"skill": "${skill}"`);
      expect(prompt).toContain("Old title");
      expect(prompt).toContain('{ "tests": [ ... ] }');
    }
  });

  it("puts the attempt id, task and answer into grading prompts", () => {
    const tests = importStarter();
    const writing = buildWritingGradingPrompt({
      attemptId: "att-42",
      content: tests[2].content as WritingContent,
      essay: "The line graph compares internet access.",
    });
    expect(writing).toContain('"attempt_id": "att-42"');
    expect(writing).toContain('"task": "writing_task1"');
    expect(writing).toContain("(6 words)");
    expect(writing).toContain("Asia-Pacific");

    const speaking = buildSpeakingGradingPrompt({
      attemptId: "att-43",
      content: tests[5].content as SpeakingContent,
      transcript: "I would like to talk about learning to swim",
      speakingSeconds: 30,
    });
    expect(speaking).toContain('"task": "speaking_part2"');
    expect(speaking).toContain("18 words per minute");
    expect(speaking).toContain("Describe a skill");
  });
});

describe("roundBand", () => {
  it("follows IELTS rounding", () => {
    expect([6.25, 6.75, 6.125, 7.5].map(roundBand)).toEqual([6.5, 7, 6, 7.5]);
  });
});
