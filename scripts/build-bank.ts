/**
 * Content pipeline: data/life_in_uk_questions.csv (+ data/cards.json,
 * data/fact_overrides.json) -> src/content/bank.json
 *
 * Deterministic and idempotent. Fails loudly on any invariant violation.
 * Run: npm run build:bank
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { Bank, Card, Fact, Theme, Variant } from "../src/content/types.ts";

// ---------------------------------------------------------------- tuning
/** difficulty (1..10) -> population correct-rate prior */
const PRIOR_BY_DIFFICULTY = [NaN, 0.95, 0.9, 0.85, 0.8, 0.72, 0.64, 0.55, 0.47, 0.4, 0.35];
const SPEED_ELIGIBLE_PRIOR = 0.8;
const EXAM_QUESTIONS = 24;

// ---------------------------------------------------------------- helpers
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’‘"“”]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’‘"“”]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have how in is it of on or that the to was were what when where which who whose why with you your".split(" "),
);

function tokenSet(s: string): Set<string> {
  return new Set(normText(s).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function priorFor(difficulty: number): number {
  const lo = Math.floor(difficulty);
  const hi = Math.ceil(difficulty);
  const pLo = PRIOR_BY_DIFFICULTY[Math.min(10, Math.max(1, lo))];
  const pHi = PRIOR_BY_DIFFICULTY[Math.min(10, Math.max(1, hi))];
  if (lo === hi) return pLo;
  return +(pLo + (pHi - pLo) * (difficulty - lo)).toFixed(4);
}

function fail(msg: string): never {
  console.error(`\nBANK BUILD FAILED: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- load CSV
interface Row {
  exam: string;
  exam_url: string;
  q_number: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  num_correct_answers: string;
  area: string;
  theme: string;
  difficulty_1_10: string;
  explanation: string;
}

const csvRaw = readFileSync("data/life_in_uk_questions.csv");
const rows: Row[] = parse(csvRaw, { columns: true, bom: true, skip_empty_lines: true });
if (rows.length !== 408) fail(`expected 408 rows, got ${rows.length}`);
const sourceHash = createHash("sha256").update(csvRaw).digest("hex").slice(0, 16);

interface Q {
  id: string;
  row: Row;
  options: string[];
  answers: string[]; // correct answer texts
  answerIdx: number[];
  answersRequired: 1 | 2 | 3;
  format: "tf" | "mc";
  difficulty: number;
  themeName: string;
  area: string;
}

const questions: Q[] = rows.map((row) => {
  const options = [row.option_a, row.option_b, row.option_c, row.option_d].filter((o) => o !== "");
  const answers = row.correct_answer.split(" | ").map((a) => a.trim());
  const answerIdx = answers.map((a) => {
    const i = options.findIndex((o) => o.trim() === a);
    if (i === -1) fail(`answer not found in options for e${row.exam}q${row.q_number}: "${a}"`);
    return i;
  });
  const n = Number(row.num_correct_answers);
  if (n !== answers.length) fail(`num_correct mismatch e${row.exam}q${row.q_number}`);
  if (n !== 1 && n !== 2 && n !== 3) fail(`bad answersRequired ${n}`);
  return {
    id: `e${row.exam}q${row.q_number}`,
    row,
    options,
    answers,
    answerIdx,
    answersRequired: n as 1 | 2 | 3,
    format: options.length === 2 ? "tf" : "mc",
    difficulty: Number(row.difficulty_1_10),
    themeName: row.theme,
    area: row.area,
  };
});

// invariant: format split
const tfCount = questions.filter((q) => q.format === "tf").length;
if (tfCount !== 57) fail(`expected 57 two-option questions, got ${tfCount}`);

// ---------------------------------------------------------------- cluster into facts
// Union-find
const parent = new Map<string, string>();
function find(x: string): string {
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r)!;
  // path compress
  let c = x;
  while (parent.get(c) !== r) {
    const nxt = parent.get(c)!;
    parent.set(c, r);
    c = nxt;
  }
  return r;
}
function union(a: string, b: string) {
  const ra = find(a);
  const rb = find(b);
  if (ra !== rb) parent.set(ra, rb);
}
for (const q of questions) parent.set(q.id, q.id);

// Rule A: same theme + same normalized answer set (non-TF).
// Rule B: TF questions additionally require stem Jaccard >= 0.5.
const byKey = new Map<string, Q[]>();
for (const q of questions) {
  const key = `${q.themeName}||${q.answers.map(normText).sort().join("&&")}`;
  const list = byKey.get(key) ?? [];
  list.push(q);
  byKey.set(key, list);
}
for (const group of byKey.values()) {
  if (group.length < 2) continue;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i];
      const b = group[j];
      const eitherTf = a.format === "tf" || b.format === "tf";
      if (!eitherTf) {
        union(a.id, b.id);
      } else if (jaccard(tokenSet(a.row.question), tokenSet(b.row.question)) >= 0.5) {
        union(a.id, b.id);
      }
    }
  }
}

// Manual overrides: { "e3q7": "e1q4" } merges e3q7 into e1q4's fact; value "!" splits a question out.
if (existsSync("data/fact_overrides.json")) {
  const overrides: Record<string, string> = JSON.parse(readFileSync("data/fact_overrides.json", "utf8"));
  for (const [qid, target] of Object.entries(overrides)) {
    if (target === "!") {
      parent.set(qid, qid); // note: only safe when qid was a cluster leaf; report will show result
    } else {
      union(qid, target);
    }
  }
}

const clusters = new Map<string, Q[]>();
for (const q of questions) {
  const root = find(q.id);
  const list = clusters.get(root) ?? [];
  list.push(q);
  clusters.set(root, list);
}

// ---------------------------------------------------------------- cards join
interface CardIn {
  id: string;
  title: string;
  area: string;
  theme: string;
  hook: string;
  wikiUrl: string | null;
  facts: { statement: string; questions: string[]; keyedNote?: string }[];
}
let cardsIn: CardIn[] = [];
if (existsSync("data/cards.json")) {
  cardsIn = JSON.parse(readFileSync("data/cards.json", "utf8"));
} else {
  console.warn("WARN: data/cards.json missing — building with fallback statements only");
}

// card lookup: question id -> {card, factIndex}
const cardByQuestion = new Map<string, { card: CardIn; factIdx: number }>();
for (const card of cardsIn) {
  card.facts.forEach((f, fi) => {
    for (const qid of f.questions) {
      if (cardByQuestion.has(qid)) fail(`question ${qid} claimed by two cards (${card.id} and ${cardByQuestion.get(qid)!.card.id})`);
      cardByQuestion.set(qid, { card, factIdx: fi });
    }
  });
}
if (cardsIn.length > 0) {
  for (const q of questions) {
    if (!cardByQuestion.has(q.id)) fail(`question ${q.id} not covered by any card`);
  }
}

/** Fallback statement: the explanation sentence containing the first answer, else answer alone. */
function fallbackStatement(qs: Q[]): string {
  const q = qs[0];
  const ans = q.answers[0];
  const sentences = q.row.explanation.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => s.toLowerCase().includes(ans.toLowerCase()));
  const base = (hit ?? `${q.row.question} — ${q.answers.join(", ")}.`).trim();
  return base.length > 220 ? `${q.row.question} — **${q.answers.join(", ")}**.` : base.replace(ans, `**${ans}**`);
}

// ---------------------------------------------------------------- themes
const themeAgg = new Map<string, { area: string; count: number }>();
for (const q of questions) {
  const t = themeAgg.get(q.themeName) ?? { area: q.area, count: 0 };
  t.count++;
  themeAgg.set(q.themeName, t);
}

// ---------------------------------------------------------------- build facts
// Cluster questions sharing a card-fact must collapse: if the card file maps two
// clustered questions to the same card fact, fine; if to different card facts, we
// keep them as separate facts split by card-fact identity (card wins over clusterer).
interface ProtoFact {
  key: string;
  qs: Q[];
  statement: string;
  keyedNote: string | null;
  cardId: string;
}
const protoFacts = new Map<string, ProtoFact>();
for (const [root, qs] of clusters) {
  // group cluster members by their card-fact identity (or fallback bucket)
  const groups = new Map<string, Q[]>();
  for (const q of qs) {
    const cf = cardByQuestion.get(q.id);
    const gkey = cf ? `${cf.card.id}#${cf.factIdx}` : `fallback#${root}`;
    const list = groups.get(gkey) ?? [];
    list.push(q);
    groups.set(gkey, list);
  }
  for (const [gkey, gqs] of groups) {
    const cf = cardByQuestion.get(gqs[0].id);
    const statement = cf ? cf.card.facts[cf.factIdx].statement : fallbackStatement(gqs);
    const keyedNote = cf ? (cf.card.facts[cf.factIdx].keyedNote ?? null) : null;
    const cardId = cf ? cf.card.id : `auto--${slug(gqs[0].themeName)}`;
    const existing = protoFacts.get(gkey);
    if (existing) {
      existing.qs.push(...gqs);
    } else {
      protoFacts.set(gkey, { key: gkey, qs: gqs, statement, keyedNote, cardId });
    }
  }
}

// Also merge separate clusters that the card file says are the SAME fact
// (card-fact identity is authoritative): protoFacts keyed by card-fact already handles this.

const factIdCounts = new Map<string, number>();
const facts: Fact[] = [];
const sortedProtos = [...protoFacts.values()].sort((a, b) => (a.qs[0].id < b.qs[0].id ? -1 : 1));
for (const pf of sortedProtos) {
  const q0 = pf.qs.sort((a, b) => (a.id < b.id ? -1 : 1))[0];
  const themeSlug = slug(q0.themeName);
  const ansSlug = slug(q0.answers.join(" ")).split("-").slice(0, 5).join("-") || "fact";
  let base = `${themeSlug}--${ansSlug}`;
  const n = (factIdCounts.get(base) ?? 0) + 1;
  factIdCounts.set(base, n);
  if (n > 1) base = `${base}--${n}`;
  const difficulty = +(pf.qs.reduce((s, q) => s + q.difficulty, 0) / pf.qs.length).toFixed(1);
  const prior = priorFor(difficulty);
  facts.push({
    id: base,
    themeId: themeSlug,
    area: q0.area,
    cardId: pf.cardId,
    statement: pf.statement,
    keyedNote: pf.keyedNote,
    difficulty,
    prior,
    appearWeight: 0, // filled below
    speedEligible: prior >= SPEED_ELIGIBLE_PRIOR,
    variants: pf.qs.map(
      (q): Variant => ({
        id: q.id,
        stem: q.row.question,
        options: q.options,
        answerIdx: q.answerIdx,
        answersRequired: q.answersRequired,
        format: q.format,
        explanation: q.row.explanation,
        difficulty: q.difficulty,
        exam: Number(q.row.exam),
        sourceUrl: q.row.exam_url,
      }),
    ),
  });
}

// appearWeight: expected appearances of this fact in a 24-question exam,
// assuming the exam samples themes by share and facts uniformly within theme.
const factCountByTheme = new Map<string, number>();
for (const f of facts) factCountByTheme.set(f.themeId, (factCountByTheme.get(f.themeId) ?? 0) + 1);
const themes: Theme[] = [...themeAgg.entries()]
  .map(([name, t]) => ({
    id: slug(name),
    name,
    area: t.area,
    share: +(t.count / questions.length).toFixed(6),
    factCount: factCountByTheme.get(slug(name)) ?? 0,
  }))
  .sort((a, b) => b.share - a.share);
for (const f of facts) {
  const th = themes.find((t) => t.id === f.themeId)!;
  f.appearWeight = +((EXAM_QUESTIONS * th.share) / th.factCount).toFixed(5);
}

// ---------------------------------------------------------------- cards out
const factsByCard = new Map<string, string[]>();
for (const f of facts) {
  const list = factsByCard.get(f.cardId) ?? [];
  list.push(f.id);
  factsByCard.set(f.cardId, list);
}
const cards: Card[] = [];
for (const c of cardsIn) {
  const factIds = factsByCard.get(c.id);
  if (!factIds) continue; // card unused (shouldn't happen given coverage check)
  cards.push({ id: c.id, title: c.title, area: c.area, theme: c.theme, hook: c.hook, wikiUrl: c.wikiUrl, factIds });
}
// auto cards for fallback mode
for (const [cardId, factIds] of factsByCard) {
  if (cardId.startsWith("auto--")) {
    const f0 = facts.find((f) => f.cardId === cardId)!;
    cards.push({ id: cardId, title: f0.themeId.replace(/-/g, " "), area: f0.area, theme: f0.themeId, hook: "", wikiUrl: null, factIds });
  }
}

// ---------------------------------------------------------------- validate
const allVariantIds = facts.flatMap((f) => f.variants.map((v) => v.id));
if (allVariantIds.length !== 408) fail(`variant count ${allVariantIds.length} != 408`);
if (new Set(allVariantIds).size !== 408) fail("duplicate variant ids");
const reqHist: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
for (const f of facts) for (const v of f.variants) reqHist[v.answersRequired]++;
if (reqHist[1] !== 374 || reqHist[2] !== 33 || reqHist[3] !== 1)
  fail(`answersRequired histogram wrong: ${JSON.stringify(reqHist)}`);
const shareSum = themes.reduce((s, t) => s + t.share, 0);
if (Math.abs(shareSum - 1) > 0.001) fail(`theme share sum ${shareSum}`);
const weightSum = facts.reduce((s, f) => s + f.appearWeight, 0);
if (Math.abs(weightSum - EXAM_QUESTIONS) > 0.1) fail(`appearWeight sum ${weightSum} != ~24`);
for (const f of facts) {
  if (!f.statement) fail(`fact ${f.id} has no statement`);
  if (f.variants.length === 0) fail(`fact ${f.id} has no variants`);
}
const speedPool = facts.filter((f) => f.speedEligible);
for (const f of speedPool) {
  if (f.statement.replace(/\*\*/g, "").length > 200)
    console.warn(`WARN: speed statement long (${f.statement.length}): ${f.id}`);
}
// verbatim-answer check (soft: warn, since bolding/inflection can shift text)
let verbatimMisses = 0;
for (const f of facts) {
  const plain = f.statement.replace(/\*\*/g, "").toLowerCase();
  for (const v of f.variants) {
    for (const ai of v.answerIdx) {
      const ans = v.options[ai].toLowerCase().replace(/^the /, "").trim();
      if (ans !== "true" && ans !== "false" && !plain.includes(ans.slice(0, Math.min(ans.length, 25)))) {
        verbatimMisses++;
        if (verbatimMisses <= 15) console.warn(`WARN: statement of ${f.id} may not contain answer of ${v.id}: "${v.options[ai]}"`);
      }
    }
  }
}

// ---------------------------------------------------------------- emit
const bank: Bank = {
  version: 1,
  builtAt: new Date().toISOString(),
  sourceHash,
  themes,
  cards,
  facts,
};
writeFileSync("src/content/bank.json", JSON.stringify(bank, null, 1));

// cluster report
const multi = facts.filter((f) => f.variants.length > 1);
console.log(`bank.json written: ${facts.length} facts, ${cards.length} cards, ${themes.length} themes`);
console.log(`multi-variant facts: ${multi.length} (${multi.reduce((s, f) => s + f.variants.length, 0)} questions)`);
console.log(`speed-eligible facts: ${speedPool.length}`);
console.log(`verbatim warnings: ${verbatimMisses}`);
console.log(`answersRequired: ${JSON.stringify(reqHist)}  tf=${tfCount} mc=${408 - tfCount}`);
