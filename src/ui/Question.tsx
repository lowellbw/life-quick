/**
 * The question interaction used by drill and mock screens.
 * One decision per screen. Options shuffle on every render of a new variant
 * (seeded). Single-answer taps submit immediately; multi-answer requires
 * exactly k selections plus confirm. "Not sure" is a quiet affordance, never
 * styled as failure. Feedback: green settle for correct, amber for wrong.
 */
import { useMemo, useRef, useState } from "react";
import type { Variant } from "../content/types";
import { shuffled, substream } from "../lib/rng";
import { Hairline } from "./components";

export interface QuestionResult {
  optionIdx: number[]; // canonical indices
  notSure: boolean;
}

export function Question({
  variant,
  seed,
  serial,
  showFeedback,
  progressFrac,
  onAnswer,
}: {
  variant: Variant;
  seed: number;
  serial: number; // varies per serving so the shuffle differs every time
  showFeedback: boolean; // drills yes, mocks no
  progressFrac: number | null;
  onAnswer: (r: QuestionResult) => void;
}) {
  // display order -> canonical index
  const order = useMemo(
    () => shuffled(variant.options.map((_, i) => i), substream(seed, `shuffle:${variant.id}`, serial)),
    [variant.id, seed, serial],
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [locked, setLocked] = useState<null | { correct: boolean; chosen: number[] }>(null);
  // synchronous double-submit guard — React state alone is async and can let
  // a second tap through before the re-render lands
  const lockRef = useRef(false);

  const k = variant.answersRequired;

  /**
   * Deliver the answer exactly-once-or-idempotently. The settle delay is a
   * plain setTimeout, which browsers throttle or pause in background tabs
   * (a user who switches apps mid-answer must not come back to a frozen
   * screen). So: primary timer + backup timer + visibility flush; the
   * reducer's variantId stale-guard makes duplicate deliveries no-ops.
   */
  function deliverAfterSettle(result: QuestionResult, delayMs: number) {
    let delivered = false;
    const deliver = () => {
      if (delivered) return;
      delivered = true;
      document.removeEventListener("visibilitychange", deliver);
      onAnswer(result);
    };
    window.setTimeout(deliver, delayMs);
    window.setTimeout(deliver, delayMs + 1200); // backup if the first is lost
    document.addEventListener("visibilitychange", deliver);
  }

  function submit(chosen: number[], notSure: boolean) {
    if (lockRef.current) return;
    lockRef.current = true;
    if (showFeedback && !notSure) {
      const correct =
        chosen.length === k && [...chosen].sort().join() === [...variant.answerIdx].sort().join();
      setLocked({ correct, chosen });
      // brief settle, then hand off (card flip or auto-advance)
      deliverAfterSettle({ optionIdx: chosen, notSure }, correct ? 400 : 550);
    } else {
      onAnswer({ optionIdx: chosen, notSure });
    }
  }

  function tap(canonical: number) {
    if (lockRef.current) return;
    if (k === 1) {
      submit([canonical], false);
      return;
    }
    setSelected((prev) =>
      prev.includes(canonical) ? prev.filter((x) => x !== canonical) : prev.length < k ? [...prev, canonical] : prev,
    );
  }

  function stateOf(canonical: number): string | undefined {
    if (!locked) return selected.includes(canonical) ? "selected" : undefined;
    if (showFeedback) {
      if (variant.answerIdx.includes(canonical) && (locked.correct || locked.chosen.includes(canonical)))
        return locked.correct ? "correct" : undefined;
      if (locked.chosen.includes(canonical) && !variant.answerIdx.includes(canonical)) return "wrong";
      if (locked.correct && variant.answerIdx.includes(canonical)) return "correct";
    }
    return undefined;
  }

  return (
    <div>
      {progressFrac != null && <Hairline frac={progressFrac} />}
      <h1 className="stem">{variant.stem}</h1>
      {k > 1 && (
        <p className="muted" style={{ marginTop: "-0.75rem" }}>
          Choose {k === 2 ? "two" : "three"}.
        </p>
      )}
      <div role="group" aria-label="Answer options">
        {order.map((canonical, di) => {
          const st = stateOf(canonical);
          return (
            <button
              key={variant.id + ":" + canonical}
              className="option"
              data-state={st}
              onClick={() => tap(canonical)}
              disabled={!!locked}
              aria-pressed={selected.includes(canonical)}
            >
              <span aria-hidden="true" className="muted" style={{ flex: "none", width: "1.2rem" }}>
                {String.fromCharCode(65 + di)}
              </span>
              <span>{variant.options[canonical]}</span>
              {st === "correct" && <span className="mark correct" aria-label="correct">✓</span>}
              {st === "wrong" && <span className="mark wrong" aria-label="needs another look">•</span>}
            </button>
          );
        })}
      </div>
      {k > 1 && (
        <button className="btn primary" disabled={selected.length !== k || !!locked} onClick={() => submit(selected, false)}>
          Check
        </button>
      )}
      <button className="btn quiet" onClick={() => submit([], true)} disabled={!!locked}>
        Not sure
      </button>
    </div>
  );
}
