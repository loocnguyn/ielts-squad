// Compact authoring format for the test bank (content/bank). Each file holds
// several tests; this turns them into the JSON the app's importer accepts, so
// every test still goes through the same validation as a pasted one.
//
//   # L01 | Set title                 a test; the key's first letter is the skill (L, R)
//   ## 1 | Context sentence           listening part        (## Passage headline for reading)
//   @A Receptionist female_uk         listening speaker
//   A: A line of the script           listening line
//   [A] A paragraph of the passage    reading paragraph
//   == tfng | ynng | mc | short | fill:<variant> | match:<variant>   [| LIMIT] [| instruction]
//   3. Statement => TRUE // evidence  question with its answer; "a|b" lists accepted forms
//   A. Option text                    option (before the questions in match, after the prompt in mc)
//   => B // evidence                  answer line closing a multiple-choice question
//   Text with a blank {{9=answer|alt}}   body of a fill group; "% A. word" lines add a word bank
//
// Speaking (key S...) is a full mock test, one line per block, items separated by " | ":
//   P1 Topic: question | question | question
//   P2 Describe ... | bullet | bullet | bullet | and explain ...
//   R rounding-off question | another
//   P3 Theme: question | question | question | question | question

type Raw = Record<string, unknown>;
export type ParsedTest = { key: string; file: string; raw: Raw };

const LIMITS: Record<string, string> = {
  "1W": "ONE WORD ONLY",
  "2W": "NO MORE THAN TWO WORDS",
  "3W": "NO MORE THAN THREE WORDS",
  "1N": "A NUMBER",
  "1WN": "ONE WORD AND/OR A NUMBER",
  "2WN": "NO MORE THAN TWO WORDS AND/OR A NUMBER",
  "3WN": "NO MORE THAN THREE WORDS AND/OR A NUMBER",
};

const FILL_NOUN: Record<string, string> = {
  summary: "summary",
  note: "notes",
  table: "table",
  flow_chart: "flow chart",
  sentence: "sentences",
  form: "form",
  diagram_label: "labels",
};

const TFNG =
  "Do the following statements agree with the information given in the passage? Write TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, or NOT GIVEN if there is no information on this.";
const YNNG =
  "Do the following statements agree with the claims of the writer in the passage? Write YES if the statement agrees with the claims of the writer, NO if the statement contradicts the claims of the writer, or NOT GIVEN if it is impossible to say what the writer thinks about this.";

const MATCH_DEFAULT: Record<string, string> = {
  headings: "Choose the correct heading for each paragraph from the list of headings below.",
  information: "Which paragraph contains the following information? You may use any letter more than once.",
  sentence_endings: "Complete each sentence with the correct ending from the list below.",
  features: "Match each statement with the correct option from the list below. You may use any letter more than once.",
  generic: "Choose the correct option from the list below for each question.",
  map_labelling: "Label the plan described below. Choose the correct letter for each place.",
};

class DslError extends Error {}

function splitAnswer(rest: string) {
  const [answerPart, ...evidence] = rest.split(" // ");
  const answer = answerPart.split("|").map((a) => a.trim()).filter(Boolean);
  return { answer, evidence: evidence.join(" // ").trim() || undefined };
}

function parseGroup(header: string, body: string[], listening: boolean, paragraphLabels: string[], where: string): Raw {
  const [kindPart, ...fields] = header.split("|").map((f) => f.trim());
  const [kind, variant] = kindPart.split(":");
  const needsLimit = kind === "fill" || kind === "short";
  const limitCode = needsLimit ? fields.shift() : undefined;
  const custom = fields.join(" | ") || undefined;
  if (needsLimit && !(limitCode && LIMITS[limitCode])) {
    throw new DslError(`${where}: unknown word limit "${limitCode}" in "== ${header}"`);
  }
  const limit = limitCode ? LIMITS[limitCode] : "";
  const source = listening ? "Write" : "Choose";
  const from = listening ? "" : " from the passage";

  if (kind === "fill") {
    const answers: Record<string, string[]> = {};
    const wordBank: Record<string, string> = {};
    const lines: string[] = [];
    for (const line of body) {
      const bank = line.match(/^% ?([A-Za-z]{1,4})\. (.+)$/);
      if (bank) {
        wordBank[bank[1]] = bank[2].trim();
        continue;
      }
      // Sentences are numbered by their blank, so a leading "6." would only repeat it.
      const body = variant === "sentence" ? line.replace(/^\d+\.\s+/, "") : line;
      lines.push(
        body.replace(/\{\{(\d+)=([^}]+)\}\}/g, (_, n: string, accepted: string) => {
          answers[n] = accepted.split("|").map((a) => a.trim()).filter(Boolean);
          return `{{${n}}}`;
        }),
      );
    }
    const noun = FILL_NOUN[variant ?? "summary"];
    if (!noun) throw new DslError(`${where}: unknown fill variant "${variant}"`);
    const hasBank = Object.keys(wordBank).length > 0;
    return {
      type: "completion",
      variant: variant ?? "summary",
      instruction:
        custom ??
        (hasBank
          ? `Complete the ${noun} using the list of words below.`
          : `Complete the ${noun} below. ${source} ${limit}${from} for each answer.`),
      word_limit: hasBank ? "ONE LETTER" : limit,
      text: lines.join("\n").trim(),
      ...(hasBank ? { word_bank: wordBank } : {}),
      answers,
    };
  }

  const options: Record<string, string> = {};
  const questions: Raw[] = [];
  let open: Raw | null = null;
  for (const line of body) {
    if (!line.trim()) continue;
    const question = line.match(/^(\d+)\. (.+)$/);
    const option = line.match(/^([A-Za-z]{1,5})\. (.+)$/);
    const answerLine = line.match(/^=> (.+)$/);
    if (question) {
      const [, n, rest] = question;
      const at = rest.indexOf(" => ");
      if (at === -1) {
        open = { n: Number(n), prompt: rest.trim(), options: {} };
        questions.push(open);
      } else {
        questions.push({ n: Number(n), prompt: rest.slice(0, at).trim(), ...splitAnswer(rest.slice(at + 4)) });
        open = null;
      }
    } else if (answerLine && open) {
      Object.assign(open, splitAnswer(answerLine[1]));
      open = null;
    } else if (option) {
      if (open) (open.options as Record<string, string>)[option[1]] = option[2].trim();
      else options[option[1]] = option[2].trim();
    } else {
      throw new DslError(`${where}: cannot read line "${line.slice(0, 60)}" in "== ${header}"`);
    }
  }
  if (open) throw new DslError(`${where}: question ${open.n} in "== ${header}" has no "=> answer" line`);

  if (kind === "tfng") return { type: "true_false_not_given", instruction: custom ?? TFNG, questions };
  if (kind === "ynng") return { type: "yes_no_not_given", instruction: custom ?? YNNG, questions };
  if (kind === "mc") {
    return {
      type: "multiple_choice",
      instruction: custom ?? (listening ? "Choose the correct letter, A, B or C." : "Choose the correct letter, A, B, C or D."),
      questions,
    };
  }
  if (kind === "short") {
    return {
      type: "short_answer",
      instruction: custom ?? `Answer the questions below. ${source} ${limit}${from} for each answer.`,
      word_limit: limit,
      questions,
    };
  }
  if (kind === "match") {
    const v = variant ?? "generic";
    if (!MATCH_DEFAULT[v]) throw new DslError(`${where}: unknown match variant "${v}"`);
    if (v === "information" && Object.keys(options).length === 0) {
      for (const label of paragraphLabels) options[label] = `Paragraph ${label}`;
    }
    return { type: "matching", variant: v, instruction: custom ?? MATCH_DEFAULT[v], options, questions };
  }
  throw new DslError(`${where}: unknown group kind "${kind}"`);
}

function parseSpeaking(title: string, body: string[], where: string): Raw {
  const topics: Raw[] = [];
  let cueCard: Raw | null = null;
  let roundingOff: string[] = [];
  let part3: Raw | null = null;
  const items = (text: string) => text.split(" | ").map((item) => item.trim()).filter(Boolean);
  const titled = (text: string) => {
    const at = text.indexOf(": ");
    if (at === -1) throw new DslError(`${where}: expected "Topic: question | question" in "${text.slice(0, 50)}"`);
    return { name: text.slice(0, at).trim(), questions: items(text.slice(at + 2)) };
  };
  for (const line of body) {
    if (!line.trim()) continue;
    if (line.startsWith("P1 ")) {
      const { name, questions } = titled(line.slice(3));
      topics.push({ topic: name, questions });
    } else if (line.startsWith("P2 ")) {
      const [prompt, ...rest] = items(line.slice(3));
      const closing = /^and (explain|say)/i.test(rest[rest.length - 1] ?? "") ? rest.pop() : undefined;
      cueCard = { prompt, bullets: rest, ...(closing ? { closing } : {}) };
    } else if (line.startsWith("R ")) {
      roundingOff = items(line.slice(2));
    } else if (line.startsWith("P3 ")) {
      const { name, questions } = titled(line.slice(3));
      part3 = { theme: name, questions };
    } else {
      throw new DslError(`${where}: cannot read line "${line.slice(0, 60)}"`);
    }
  }
  if (!cueCard || !part3) throw new DslError(`${where}: a speaking test needs P1, P2 and P3 lines`);
  return {
    skill: "speaking",
    part: "full",
    title,
    part1: { topics },
    part2: { cue_card: cueCard, rounding_off: roundingOff },
    part3,
  };
}

/** Parses one bank file into the importer's raw JSON, one object per test. */
export function parseBankFile(text: string, file: string): ParsedTest[] {
  const tests: ParsedTest[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const head = lines[i].match(/^# (\S+) \| (.+)$/);
    if (!head) {
      if (lines[i].trim()) throw new DslError(`${file}:${i + 1}: expected "# KEY | Title", got "${lines[i].slice(0, 50)}"`);
      i++;
      continue;
    }
    const [, key, title] = head;
    const listening = key.startsWith("L");
    const where = `${file} ${key}`;
    i++;

    if (key.startsWith("S")) {
      const body: string[] = [];
      while (i < lines.length && !lines[i].startsWith("# ")) body.push(lines[i++]);
      tests.push({ key, file, raw: parseSpeaking(title, body, where) });
      continue;
    }

    const parts: Raw[] = [];
    let passageTitle = "";
    const paragraphs: { label: string; text: string }[] = [];
    let groups: Raw[] = [];
    let part: Raw | null = null;

    const closePart = () => {
      if (part) {
        part.groups = groups;
        parts.push(part);
        groups = [];
        part = null;
      }
    };

    while (i < lines.length && !lines[i].startsWith("# ")) {
      const line = lines[i];
      if (line.startsWith("## ")) {
        if (listening) {
          closePart();
          const m = line.match(/^## (\d) \| (.+)$/);
          if (!m) throw new DslError(`${where}: expected "## <part> | <context>"`);
          part = { part: Number(m[1]), context: m[2].trim(), speakers: [], script: [] };
        } else {
          passageTitle = line.slice(3).trim();
        }
        i++;
      } else if (line.startsWith("== ")) {
        const header = line.slice(3).trim();
        const body: string[] = [];
        i++;
        while (i < lines.length && !/^(== |## |# )/.test(lines[i])) body.push(lines[i++]);
        groups.push(parseGroup(header, body, listening, paragraphs.map((p) => p.label), where));
      } else if (listening && part && line.startsWith("@")) {
        const m = line.match(/^@(\S+) (.+) (female_uk|male_uk|female_us|male_us)$/);
        if (!m) throw new DslError(`${where}: cannot read speaker line "${line}"`);
        (part.speakers as Raw[]).push({ id: m[1], name: m[2].trim(), voice: m[3] });
        i++;
      } else if (listening && part && /^\S+: /.test(line)) {
        const at = line.indexOf(": ");
        (part.script as Raw[]).push({ speaker: line.slice(0, at), text: line.slice(at + 2).trim() });
        i++;
      } else if (!listening && /^\[[A-Z]\] /.test(line)) {
        paragraphs.push({ label: line[1], text: line.slice(4).trim() });
        i++;
      } else if (!line.trim()) {
        i++;
      } else {
        throw new DslError(`${where}: cannot read line ${i + 1}: "${line.slice(0, 60)}"`);
      }
    }
    closePart();

    tests.push({
      key,
      file,
      raw: listening
        ? { skill: "listening", title, parts }
        : { skill: "reading", title, passage: { title: passageTitle || title, paragraphs }, groups },
    });
  }
  return tests;
}

export { DslError, LIMITS };
