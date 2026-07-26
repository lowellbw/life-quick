/** Generated content bank types. bank.json is emitted by scripts/build-bank.ts — never hand-edited. */

export interface Bank {
  version: 1;
  builtAt: string;
  sourceHash: string;
  themes: Theme[];
  cards: Card[];
  facts: Fact[];
}

export interface Theme {
  id: string; // slug
  name: string;
  area: string;
  share: number; // question-count share of the 408, sums to 1 across themes
  factCount: number;
}

/**
 * A topic-level knowledge card. One card serves several facts (and therefore
 * several questions): e.g. a single "William the Conqueror & 1066" card backs
 * the Hastings, Bayeux Tapestry and Domesday questions.
 */
export interface Card {
  id: string;
  title: string;
  area: string;
  theme: string; // primary theme name
  hook: string; // one memorable line
  wikiUrl: string | null;
  /** statements of every fact on this card, in display order (factIds) */
  factIds: string[];
}

/** A testable atom: one fact the exam can ask about, with 1..n phrasings. */
export interface Fact {
  id: string;
  themeId: string;
  area: string;
  cardId: string;
  /** one-sentence revision statement; answer span(s) bolded with **…** */
  statement: string;
  /** honest note when the site's keyed answer is contestable */
  keyedNote: string | null;
  difficulty: number; // mean of variant difficulties, 1dp
  prior: number; // population correct-rate p0 from the difficulty mapping
  appearWeight: number; // expected appearances per 24-question exam
  speedEligible: boolean; // prior >= SPEED_ELIGIBLE_PRIOR
  variants: Variant[];
}

export interface Variant {
  id: string; // "e{exam}q{q}"
  stem: string;
  options: string[]; // length 2 or 4, canonical source order (UI shuffles)
  answerIdx: number[]; // indices into options; length === answersRequired
  answersRequired: 1 | 2 | 3;
  format: "tf" | "mc"; // tf = 2 options, mc = 4
  explanation: string;
  difficulty: number;
  exam: number;
  sourceUrl: string;
}
