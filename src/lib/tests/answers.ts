// Mirrors private.normalize_answer in the database: the server decides the
// score, this copy only marks individual answers right or wrong on review.
export function normalizeAnswer(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/[.,;:!?"“”‘’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCorrect(given: string | null | undefined, accepted: string[] | undefined) {
  const normalized = normalizeAnswer(given);
  if (!normalized || !accepted) return false;
  return accepted.some((answer) => normalizeAnswer(answer) === normalized);
}

// British / American pairs that IELTS accepts interchangeably. An explicit list
// rather than suffix rules: a rule like "-ll- becomes -l-" would also accept
// real misspellings ("kiler" for "killer").
const SPELLING_PAIRS: [british: string, american: string][] = [
  ["colour", "color"], ["favour", "favor"], ["favourite", "favorite"], ["behaviour", "behavior"],
  ["labour", "labor"], ["neighbour", "neighbor"], ["neighbourhood", "neighborhood"],
  ["harbour", "harbor"], ["honour", "honor"], ["humour", "humor"], ["flavour", "flavor"],
  ["rumour", "rumor"], ["vapour", "vapor"], ["odour", "odor"], ["tumour", "tumor"],
  ["centre", "center"], ["metre", "meter"], ["kilometre", "kilometer"], ["centimetre", "centimeter"],
  ["millimetre", "millimeter"], ["litre", "liter"], ["theatre", "theater"], ["fibre", "fiber"],
  ["catalogue", "catalog"], ["dialogue", "dialog"], ["analogue", "analog"],
  ["defence", "defense"], ["licence", "license"], ["offence", "offense"],
  ["programme", "program"], ["grey", "gray"], ["aluminium", "aluminum"], ["jewellery", "jewelry"],
  ["organise", "organize"], ["organised", "organized"], ["organising", "organizing"],
  ["organisation", "organization"], ["realise", "realize"], ["realised", "realized"],
  ["recognise", "recognize"], ["recognised", "recognized"],
  ["analyse", "analyze"], ["analysed", "analyzed"], ["specialise", "specialize"],
  ["specialised", "specialized"], ["specialisation", "specialization"],
  ["emphasise", "emphasize"], ["minimise", "minimize"], ["maximise", "maximize"],
  ["summarise", "summarize"], ["criticise", "criticize"], ["apologise", "apologize"],
  ["memorise", "memorize"], ["prioritise", "prioritize"], ["utilise", "utilize"],
  ["urbanisation", "urbanization"], ["globalisation", "globalization"],
  ["industrialisation", "industrialization"], ["civilisation", "civilization"],
  ["fertiliser", "fertilizer"], ["travelled", "traveled"], ["travelling", "traveling"],
  ["traveller", "traveler"], ["cancelled", "canceled"], ["cancelling", "canceling"],
  ["modelling", "modeling"], ["labelled", "labeled"], ["labelling", "labeling"],
  ["counsellor", "counselor"], ["fulfil", "fulfill"], ["enrol", "enroll"],
  ["enrolment", "enrollment"], ["skilful", "skillful"], ["plough", "plow"], ["mould", "mold"],
  ["ageing", "aging"], ["judgement", "judgment"], ["sceptical", "skeptical"],
  ["artefact", "artifact"], ["cosy", "cozy"], ["sulphur", "sulfur"], ["speciality", "specialty"],
  ["aeroplane", "airplane"], ["manoeuvre", "maneuver"], ["pyjamas", "pajamas"],
  ["moustache", "mustache"],
];

const OTHER_SPELLING = new Map<string, string>();
for (const [british, american] of SPELLING_PAIRS) {
  OTHER_SPELLING.set(british, american);
  OTHER_SPELLING.set(american, british);
  // Regular plurals / third person, e.g. colours ↔ colors.
  OTHER_SPELLING.set(`${british}s`, `${american}s`);
  OTHER_SPELLING.set(`${american}s`, `${british}s`);
}

function swapSpelling(text: string) {
  return text
    .split(/(\s+)/)
    .map((word) => OTHER_SPELLING.get(word.toLowerCase()) ?? word)
    .join("");
}

/** Accepted answers plus their other-side-of-the-Atlantic spellings, deduplicated. */
export function expandSpellingVariants(accepted: string[]) {
  const seen = new Map<string, string>();
  for (const answer of accepted) {
    for (const variant of [answer, swapSpelling(answer)]) {
      const key = normalizeAnswer(variant);
      if (key && !seen.has(key)) seen.set(key, variant.trim());
    }
  }
  return [...seen.values()];
}
