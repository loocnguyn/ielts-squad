import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildSegments } from "@/lib/audio/listening-script";
import { normalizeAnswer } from "@/lib/tests/answers";
import { parseImport, type ImportableTest } from "@/lib/tests/import-schema";
import { contentGroups, groupQuestionNumbers, type ListeningContent, type ListeningTranscript, type ReadingContent } from "@/lib/tests/types";
import { DslError, parseBankFile, type ParsedTest } from "./dsl.mts";

// Tooling for the pre-written test bank in content/bank.
//   check         validate every test with the app's own importer, plus extra QA
//   build         write src/content/bank/*.json, which the in-app bank loader imports
//   serve-audio   hand listening scripts to the browser renderer and save its MP3s

const ROOT = process.cwd();
const BANK = join(ROOT, "content", "bank");
/** Rendered listening audio, uploaded later from the Bank page. Git-ignored. */
const AUDIO = join(ROOT, "bank-audio");

type Loaded = ParsedTest & { test: ImportableTest };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readBank() {
  const parsed: ParsedTest[] = [];
  const errors: string[] = [];
  for (const path of walk(BANK).sort()) {
    const file = relative(BANK, path).replace(/\\/g, "/");
    const text = readFileSync(path, "utf8");
    try {
      if (path.endsWith(".txt")) parsed.push(...parseBankFile(text, file));
      else if (path.endsWith(".jsonl")) {
        text.split(/\r?\n/).forEach((line, index) => {
          if (!line.trim()) return;
          const raw = JSON.parse(line) as Record<string, unknown> & { key?: string };
          const key = String(raw.key ?? `${file}:${index + 1}`);
          delete raw.key;
          parsed.push({ key, file, raw });
        });
      }
    } catch (error) {
      if (!(error instanceof DslError || error instanceof SyntaxError)) throw error;
      errors.push(`${file}: ${error.message}`);
    }
  }
  return { parsed, errors };
}

const WORD_LIMITS: Record<string, { words: number; number: boolean }> = {
  "ONE WORD ONLY": { words: 1, number: false },
  "NO MORE THAN TWO WORDS": { words: 2, number: false },
  "NO MORE THAN THREE WORDS": { words: 3, number: false },
  "A NUMBER": { words: 0, number: true },
  "ONE WORD AND/OR A NUMBER": { words: 1, number: true },
  "NO MORE THAN TWO WORDS AND/OR A NUMBER": { words: 2, number: true },
  "NO MORE THAN THREE WORDS AND/OR A NUMBER": { words: 3, number: true },
};

function breaksLimit(answer: string, limit: string) {
  const rule = WORD_LIMITS[limit];
  if (!rule) return false;
  const tokens = normalizeAnswer(answer).replace(/[£$€%]/g, "").split(" ").filter(Boolean);
  const numbers = tokens.filter((t) => /^\d+([./]\d+)?(st|nd|rd|th|am|pm)?$/.test(t)).length;
  const words = tokens.length - numbers;
  return words > rule.words || numbers > (rule.number ? 1 : 0);
}

function load() {
  const { parsed, errors } = readBank();
  const warnings: string[] = [];
  const loaded: Loaded[] = [];
  const keys = new Set<string>();
  const titles = new Set<string>();

  for (const item of parsed) {
    if (keys.has(item.key)) errors.push(`${item.key}: duplicate key`);
    keys.add(item.key);
    const result = parseImport(JSON.stringify(item.raw));
    if (!result.ok) {
      errors.push(...result.errors.map((e) => `${item.key}: ${e}`));
      continue;
    }
    const test = result.tests[0];
    const titleKey = `${test.skill}|${test.part === "full" ? "full" : ""}|${test.title.toLowerCase()}`;
    if (titles.has(titleKey)) errors.push(`${item.key}: duplicate title "${test.title}"`);
    titles.add(titleKey);
    loaded.push({ ...item, test });

    if (test.skill !== "reading" && test.skill !== "listening") continue;
    const content = test.content as ReadingContent | ListeningContent;
    const key = test.answer_key ?? {};
    const groups = contentGroups(content);
    const total = Object.keys(key).length;
    const want = test.skill === "reading" ? [13, 14] : [20];
    if (!want.includes(total)) warnings.push(`${item.key}: ${total} questions`);

    for (const group of groups) {
      const typed = group.type === "short_answer" || (group.type === "completion" && !group.word_bank);
      for (const n of groupQuestionNumbers(group)) {
        const accepted = key[String(n)] ?? [];
        if (typed && breaksLimit(accepted[0], group.word_limit)) {
          errors.push(`${item.key} q${n}: "${accepted[0]}" breaks the limit ${group.word_limit}`);
        }
      }
      if (group.type === "multiple_choice") {
        const size = test.skill === "listening" ? 3 : 4;
        for (const q of group.questions) {
          if (Object.keys(q.options).length !== size) warnings.push(`${item.key} q${q.n}: ${Object.keys(q.options).length} options`);
        }
      }
      if (group.type === "matching" && group.variant !== "information" && Object.keys(group.options).length <= group.questions.length) {
        warnings.push(`${item.key}: matching group has no spare option`);
      }
    }

    if (test.skill === "reading") {
      const passage = (content as ReadingContent).passage;
      const words = passage.paragraphs.map((p) => p.text).join(" ").split(/\s+/).length;
      if (words < 660 || words > 1000) warnings.push(`${item.key}: passage is ${words} words`);
    } else {
      const transcript = test.transcript as ListeningTranscript;
      for (const part of transcript.parts) {
        const script = part.script.map((l) => l.text).join(" ");
        const words = script.split(/\s+/).length;
        if (words < 380 || words > 720) warnings.push(`${item.key} part ${part.part}: script is ${words} words`);
        if (/\d/.test(script)) warnings.push(`${item.key} part ${part.part}: script contains digits (spell numbers out)`);
        // Answers must come up in the order of the questions.
        const haystack = ` ${normalizeAnswer(script)} `;
        let last = -1;
        const partGroups = (content as ListeningContent).parts.find((p) => p.part === part.part)?.groups ?? [];
        for (const group of partGroups) {
          const typed = group.type === "short_answer" || (group.type === "completion" && !group.word_bank);
          if (!typed) continue;
          for (const n of groupQuestionNumbers(group)) {
            // The first time the answer is heard after the previous answer.
            const positions = (key[String(n)] ?? []).map((a) => haystack.indexOf(` ${normalizeAnswer(a)} `, last + 1)).filter((p) => p >= 0);
            if (positions.length === 0) warnings.push(`${item.key} q${n}: answer is heard before the previous one`);
            else last = Math.min(...positions);
          }
        }
      }
    }
  }
  return { loaded, errors, warnings };
}

function distribution(loaded: Loaded[]) {
  const counts: Record<string, Record<string, number>> = {};
  for (const { test } of loaded) {
    if (!test.answer_key) continue;
    for (const group of contentGroups(test.content as ReadingContent | ListeningContent)) {
      if (group.type === "completion" || group.type === "short_answer" || group.type === "matching") continue;
      const bucket = (counts[`${test.skill} ${group.type}`] ??= {});
      for (const n of groupQuestionNumbers(group)) {
        const answer = test.answer_key[String(n)]?.[0]?.toUpperCase() ?? "?";
        bucket[answer] = (bucket[answer] ?? 0) + 1;
      }
    }
  }
  return counts;
}

function check() {
  const { loaded, errors, warnings } = load();
  const bySkill: Record<string, number> = {};
  for (const { test } of loaded) {
    const label = test.skill === "writing" || test.skill === "speaking" ? `${test.skill} ${test.part}` : test.skill;
    bySkill[label] = (bySkill[label] ?? 0) + 1;
  }
  console.log("tests:", bySkill);
  console.log("answers:", distribution(loaded));
  for (const warning of warnings) console.log("warn  ", warning);
  for (const error of errors) console.log("ERROR ", error);
  console.log(`${loaded.length} valid, ${warnings.length} warnings, ${errors.length} errors`);
  if (errors.length) process.exit(1);
  return loaded;
}

/** Writes what the in-app bank loader ships with: validated tests, one file per skill. */
function build() {
  const loaded = check();
  const out = join(ROOT, "src", "content", "bank");
  mkdirSync(out, { recursive: true });
  for (const skill of ["listening", "reading", "writing", "speaking"]) {
    const tests = loaded.filter((l) => l.test.skill === skill).map((l) => ({ key: l.key, ...l.test }));
    writeFileSync(join(out, `${skill}.json`), JSON.stringify(tests));
    console.log(`${skill}: ${tests.length} tests`);
  }
}

function listeningTests() {
  return load().loaded.filter((l) => l.test.skill === "listening");
}

/** The browser page (WebGPU is far faster than Node on CPU) polls this for work. */
function serveAudio() {
  mkdirSync(AUDIO, { recursive: true });
  // A claim lapses after a while, so a render lost to a page reload is handed out again.
  const claimed = new Map<string, number>();
  const isClaimed = (key: string) => Date.now() - (claimed.get(key) ?? 0) < 8 * 60_000;
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
  createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "OPTIONS") return response.writeHead(204, cors).end();
    if (url.pathname === "/next") {
      const next = listeningTests().find((l) => !existsSync(join(AUDIO, `${l.key}.mp3`)) && !isClaimed(l.key));
      if (!next) return response.writeHead(200, { ...cors, "Content-Type": "application/json" }).end("{}");
      claimed.set(next.key, Date.now());
      const segments = buildSegments(next.test.content as ListeningContent, next.test.transcript as ListeningTranscript);
      return response
        .writeHead(200, { ...cors, "Content-Type": "application/json" })
        .end(JSON.stringify({ key: next.key, segments }));
    }
    if (url.pathname === "/file") {
      const key = url.searchParams.get("key") ?? "";
      const file = join(AUDIO, `${key}.mp3`);
      if (!/^L\d+$/.test(key) || !existsSync(file)) return response.writeHead(404, cors).end();
      return response.writeHead(200, { ...cors, "Content-Type": "audio/mpeg" }).end(readFileSync(file));
    }
    if (url.pathname === "/done" && request.method === "POST") {
      const key = url.searchParams.get("key") ?? "";
      const seconds = Number(url.searchParams.get("seconds"));
      if (!/^L\d+$/.test(key)) return response.writeHead(400, cors).end();
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        writeFileSync(join(AUDIO, `${key}.mp3`), Buffer.concat(chunks));
        console.log("saved", key, `${seconds}s`);
        response.writeHead(200, cors).end("ok");
      });
      return;
    }
    response.writeHead(404, cors).end();
  }).listen(4777, "127.0.0.1", () => console.log("audio helper on http://127.0.0.1:4777"));
}

async function main() {
  const command = process.argv[2];
  if (command === "check") check();
  else if (command === "build") build();
  else if (command === "serve-audio") serveAudio();
  else {
    console.log("usage: tsx scripts/bank/cli.mts check | build | serve-audio");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
