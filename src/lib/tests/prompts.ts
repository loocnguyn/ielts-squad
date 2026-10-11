import { countWords } from "./grading";
import type { SpeakingContent, WritingContent } from "./types";
import type { Skill } from "@/lib/types";

// Prompts the user copies into Claude Pro. Written in English: the tests and
// the examiner feedback are English-language material.

export type AuthoringRequest = {
  skill: Skill;
  /** writing: "task1" | "task2"; speaking: "part1" | "part2" | "part3". */
  part?: string;
  count: number;
  /** Titles already in the bank, so new sets pick different topics. */
  avoidTitles?: string[];
};

const GROUP_FORMAT = `Question groups ("groups" array). Use 2-3 different types per test. Number questions
continuously from 1 across all groups. Every group has "type" and "instruction".

  { "type": "true_false_not_given" | "yes_no_not_given", "instruction": "...",
    "questions": [ { "n": 1, "prompt": "...", "answer": "TRUE", "evidence": "where the answer is" } ] }

  { "type": "multiple_choice", "instruction": "...",
    "questions": [ { "n": 4, "prompt": "...", "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
                     "answer": "B", "evidence": "..." } ] }

  { "type": "matching", "variant": "headings" | "information" | "features" | "sentence_endings" | "map_labelling" | "generic",
    "instruction": "...", "options": { "i": "...", "ii": "...", "iii": "..." },
    "questions": [ { "n": 7, "prompt": "Paragraph B", "answer": "iii", "evidence": "..." } ] }

  { "type": "completion", "variant": "summary" | "note" | "table" | "flow_chart" | "sentence" | "form" | "diagram_label",
    "instruction": "...", "word_limit": "NO MORE THAN TWO WORDS AND/OR A NUMBER",
    "text": "Text with a blank written as {{9}} and another as {{10}}. Use line breaks for notes, forms and tables.",
    "answers": { "9": ["exact words"], "10": ["first accepted form", "second accepted form"] },
    "evidence": { "9": "...", "10": "..." } }

  { "type": "short_answer", "instruction": "...", "word_limit": "NO MORE THAN THREE WORDS",
    "questions": [ { "n": 12, "prompt": "...", "answer": ["..."], "evidence": "..." } ] }

Rules for answers:
- completion and short_answer answers must appear word for word in the passage / script and respect the word limit.
- true_false_not_given answers are exactly TRUE, FALSE or NOT GIVEN; yes_no_not_given are YES, NO or NOT GIVEN.
- multiple_choice and matching answers are an option key. Give matching more options than questions.
- Do not write the answer anywhere in a prompt or instruction.`;

const OUTPUT_RULES = `Return ONLY one JSON object inside a single \`\`\`json code block, shaped as { "tests": [ ... ] },
with no commentary before or after. Use straight double quotes and valid JSON (no trailing commas, no comments).`;

function avoidLine(titles: string[] | undefined) {
  if (!titles?.length) return "";
  return `\nChoose topics different from these existing sets: ${titles.slice(0, 30).join("; ")}.\n`;
}

function readingPrompt(req: AuthoringRequest) {
  return `You are an experienced IELTS Academic test writer. Write ${req.count} original IELTS Academic Reading
practice set(s), each on a different academic topic (science, history, psychology, environment, technology,
linguistics, economics...). Never reuse or adapt published Cambridge / IDP / British Council material.
${avoidLine(req.avoidTitles)}
Each set:
- One passage of 850-950 words in 6-8 paragraphs labelled A, B, C..., in the register of a real Academic passage.
- 13 or 14 questions in 2-3 groups, to be done in 20 minutes.
- Difficulty band 7.5-8.5: answers depend on paraphrase, not matching words; True/False/Not Given must include
  convincing NOT GIVEN traps; distractors in multiple choice should all be plausible from the passage.

JSON shape of one set:
{
  "skill": "reading",
  "title": "Short title of the set",
  "passage": { "title": "Passage headline", "paragraphs": [ { "label": "A", "text": "..." } ] },
  "groups": [ ... ]
}

${GROUP_FORMAT}

${OUTPUT_RULES}`;
}

function listeningPrompt(req: AuthoringRequest) {
  return `You are an experienced IELTS test writer. Write ${req.count} original IELTS Listening practice set(s).
Each set has exactly two parts and 20 questions (10 per part), numbered 1-20. Alternate what the two parts are
between sets: either Part 1 (everyday conversation between two people) + Part 2 (everyday monologue), or
Part 3 (academic discussion between 2-3 people) + Part 4 (academic lecture, one speaker).
Never reuse or adapt published Cambridge / IDP / British Council material.
${avoidLine(req.avoidTitles)}
The script is read aloud by text-to-speech, so:
- Write natural spoken English at normal speed: contractions, hesitations kept light, no stage directions,
  no sound effects, no text in brackets. Spell out anything that must be heard (numbers, names letter by letter).
- Each part's script is 550-700 words. Questions follow the order of the recording.
- Difficulty band 7.5-8.5: include distractors (a speaker corrects themselves, an option is mentioned then rejected).
- Every speaker has a "voice": "female_uk", "male_uk", "female_us" or "male_us". Give speakers in one
  conversation different voices.

JSON shape of one set:
{
  "skill": "listening",
  "title": "Short title of the set",
  "parts": [
    {
      "part": 1,
      "context": "One sentence the candidate reads first, e.g. You will hear a student calling a sports centre.",
      "speakers": [ { "id": "A", "name": "Receptionist", "voice": "female_uk" }, { "id": "B", "name": "Student", "voice": "male_uk" } ],
      "script": [ { "speaker": "A", "text": "..." }, { "speaker": "B", "text": "..." } ],
      "groups": [ ... ]
    }
  ]
}

${GROUP_FORMAT}
Listening uses form / note / table / flow_chart / sentence completion, multiple choice, matching and short answer.
For "map_labelling", describe the plan in the instruction in words (there is no image) and use lettered options.

${OUTPUT_RULES}`;
}

function writingPrompt(req: AuthoringRequest) {
  if (req.part === "task1") {
    return `You are an experienced IELTS Academic test writer. Write ${req.count} original IELTS Academic Writing
Task 1 prompt(s). Vary the visual type across the batch: line graph, bar chart, pie chart, table, process.
The app draws the visual from your data, so the numbers must be complete, realistic and internally consistent,
with clear trends and a few notable features worth comparing. Never reuse published test material.
${avoidLine(req.avoidTitles)}
JSON shape of one prompt:
{
  "skill": "writing",
  "task": 1,
  "title": "Short title",
  "prompt": "The chart below shows ... Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
  "chart": one of:
    { "type": "line" | "bar", "title": "...", "x_label": "Year", "y_label": "...", "unit": "%",
      "categories": ["1990", "2000", "2010", "2020"],
      "series": [ { "name": "Country A", "values": [12, 18, 25, 31] } ] }       (2-5 series, 4-8 categories)
    { "type": "pie", "title": "...", "unit": "%", "slices": [ { "name": "...", "value": 35 } ] }   (4-7 slices)
    { "type": "table", "title": "...", "columns": ["Country", "2010", "2020"], "rows": [ ["Japan", 12.5, 14.1] ] }
    { "type": "process", "title": "...", "steps": [ { "label": "Step name", "detail": "what happens" } ] }  (6-10 steps)
}
Every series must have exactly one value per category; every table row one cell per column.

${OUTPUT_RULES}`;
  }
  return `You are an experienced IELTS Academic test writer. Write ${req.count} original IELTS Academic Writing
Task 2 essay question(s), in the exact style of the real test. Vary the essay type across the batch
(opinion, discussion, problem_solution, advantages_disadvantages, two_part) and the topic area
(education, technology, environment, work, health, society, government, culture). Never reuse published questions.
${avoidLine(req.avoidTitles)}
JSON shape of one question:
{
  "skill": "writing",
  "task": 2,
  "title": "Short title",
  "prompt": "Full question as printed on the test paper, ending with the instruction line and: Give reasons for your answer and include any relevant examples from your own knowledge or experience.",
  "essay_type": "opinion"
}

${OUTPUT_RULES}`;
}

function speakingPrompt(req: AuthoringRequest) {
  const intro = `You are an IELTS Speaking examiner. Write ${req.count} original IELTS Speaking`;
  if (req.part === "part1") {
    return `${intro} Part 1 set(s). Each set has 2 familiar topics with 3 questions each (6 questions,
about 4 minutes), phrased exactly as an examiner would ask them.
${avoidLine(req.avoidTitles)}
JSON shape of one set:
{ "skill": "speaking", "part": 1, "title": "Short title",
  "topics": [ { "topic": "Hometown", "questions": ["...", "...", "..."] } ] }

${OUTPUT_RULES}`;
  }
  if (req.part === "part2") {
    return `${intro} Part 2 cue card(s): a topic the candidate talks about for 1-2 minutes after 1 minute
of preparation, with 3-4 bullet points and a closing "and explain..." line, plus 1-2 short rounding-off questions.
${avoidLine(req.avoidTitles)}
JSON shape of one cue card:
{ "skill": "speaking", "part": 2, "title": "Short title",
  "cue_card": { "prompt": "Describe a ...", "bullets": ["what it was", "when ...", "who ..."], "closing": "and explain why ..." },
  "rounding_off": ["..."] }

${OUTPUT_RULES}`;
  }
  return `${intro} Part 3 discussion set(s): 5 abstract, analytical questions on one theme, increasing in
difficulty, of the kind that follow a Part 2 cue card on that theme (compare, speculate, evaluate, give reasons).
${avoidLine(req.avoidTitles)}
JSON shape of one set:
{ "skill": "speaking", "part": 3, "title": "Short title", "theme": "The Part 2 topic this follows",
  "questions": ["...", "...", "...", "...", "..."] }

${OUTPUT_RULES}`;
}

export function buildAuthoringPrompt(req: AuthoringRequest) {
  if (req.skill === "reading") return readingPrompt(req);
  if (req.skill === "listening") return listeningPrompt(req);
  if (req.skill === "writing") return writingPrompt(req);
  return speakingPrompt(req);
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

const WRITING_RUBRIC = `Score each criterion from 0 to 9 in steps of 0.5, applying the public IELTS Writing band
descriptors strictly, as a trained examiner would:
- task_response: Task 1 = Task Achievement (overview, key features selected and compared, accurate data, 150+ words).
  Task 2 = Task Response (all parts addressed, clear position throughout, ideas extended and supported, 250+ words).
- coherence_cohesion: logical organisation, clear progression, paragraphing, natural (not mechanical) cohesion.
- lexical_resource: range, precision, collocation, less common items, spelling and word formation.
- grammar: range of structures, proportion of error-free sentences, punctuation.
Penalise under-length answers and memorised or off-topic content. Band 8 needs only occasional, non-systematic slips.`;

const SPEAKING_RUBRIC = `You only have a machine transcript, so do NOT score pronunciation (group mates score it by ear)
and do not penalise likely transcription errors, missing punctuation or odd capitalisation.
Score each criterion from 0 to 9 in steps of 0.5 using the public IELTS Speaking band descriptors:
- fluency_coherence: length and development of turns, hesitation and self-correction, connectives, topic development.
  Use the speaking time and word count to judge speech rate and how fully the time was used.
- lexical_resource: range, idiomatic and less common language, paraphrase, precision.
- grammar: range of structures and accuracy as far as the transcript shows it.`;

function gradingJson(attemptId: string, task: string, criteria: string[]) {
  const lines = criteria.map((c) => `    "${c}": { "band": 0, "comment": "2-3 sentences with examples quoted from the answer" }`);
  return `{
  "attempt_id": "${attemptId}",
  "task": "${task}",
  "overall_band": 0,
  "criteria": {
${lines.join(",\n")}
  },
  "to_reach_8": ["3-5 specific, actionable changes that would lift this answer to band 8"],
  "corrections": [ { "original": "phrase copied from the answer", "better": "improved version", "why": "short reason" } ]
}`;
}

function describeChart(content: Extract<WritingContent, { task: 1 }>) {
  return `The candidate saw this data, drawn as a ${content.chart.type}:\n${JSON.stringify(content.chart)}`;
}

export function buildWritingGradingPrompt(args: {
  attemptId: string;
  content: WritingContent;
  essay: string;
}) {
  const { attemptId, content, essay } = args;
  const task = `writing_task${content.task}`;
  return `You are a certified IELTS Writing examiner. Grade the answer below to IELTS Academic Writing Task ${content.task}.

${WRITING_RUBRIC}

overall_band is the mean of the four criteria, rounded down to the nearest half band.
Write comments in English. List up to 8 corrections of real errors or weak phrasing.

TASK
${content.prompt}
${content.task === 1 ? `\n${describeChart(content)}\n` : ""}
CANDIDATE'S ANSWER (${countWords(essay)} words)
"""
${essay.trim()}
"""

Return ONLY this JSON object inside a single \`\`\`json code block, with every band filled in and nothing before or after it:
${gradingJson(attemptId, task, ["task_response", "coherence_cohesion", "lexical_resource", "grammar"])}`;
}

export function speakingQuestions(content: SpeakingContent): string[] {
  if (content.part === 1) return content.topics.flatMap((t) => t.questions);
  if (content.part === 2) {
    const card = content.cue_card;
    return [[card.prompt, ...card.bullets.map((b) => `- ${b}`), card.closing ?? ""].filter(Boolean).join("\n")];
  }
  return content.questions;
}

export function buildSpeakingGradingPrompt(args: {
  attemptId: string;
  content: SpeakingContent;
  transcript: string;
  speakingSeconds: number | null;
}) {
  const { attemptId, content, transcript, speakingSeconds } = args;
  const words = countWords(transcript);
  const timing = speakingSeconds
    ? `Speaking time: ${speakingSeconds} seconds; ${words} words (about ${Math.round((words / speakingSeconds) * 60)} words per minute).`
    : `${words} words.`;
  return `You are a certified IELTS Speaking examiner. Grade the candidate's IELTS Speaking Part ${content.part} answer
from the transcript below. The candidate answered all questions in one continuous recording.

${SPEAKING_RUBRIC}

overall_band is the mean of the three criteria, rounded down to the nearest half band.
Write comments in English. List up to 8 corrections of real errors or unnatural phrasing.

EXAMINER'S QUESTIONS
${speakingQuestions(content).map((q, i) => `${i + 1}. ${q}`).join("\n")}

TRANSCRIPT (speech-to-text, may contain recognition errors)
${timing}
"""
${transcript.trim()}
"""

Return ONLY this JSON object inside a single \`\`\`json code block, with every band filled in and nothing before or after it:
${gradingJson(attemptId, `speaking_part${content.part}`, ["fluency_coherence", "lexical_resource", "grammar"])}`;
}
