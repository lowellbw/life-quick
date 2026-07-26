/** Shared UI atoms. One decision per screen; 56px targets; state never carried by colour alone. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Bank, Card, Fact } from "../content/types";
import type { MeterView } from "../model/meter";

export function Screen({ children, center = false }: { children: ReactNode; center?: boolean }) {
  return (
    <div className="screen">
      <div className="screen-inner enter" style={center ? { justifyContent: "center" } : undefined}>
        {children}
      </div>
    </div>
  );
}

export function Dots({ total, on }: { total: number; on: number }) {
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i <= on ? "on" : ""} />
      ))}
    </div>
  );
}

export function Hairline({ frac }: { frac: number }) {
  return (
    <div className="hairline" role="progressbar" aria-valuenow={Math.round(frac * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${Math.min(100, Math.max(0, frac * 100))}%` }} />
    </div>
  );
}

/** Bold **spans** in card statements. */
export function Bold({ text }: { text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

/** Animated count-up for the meter number. */
export function CountUp({ to, durationMs = 800 }: { to: number; durationMs?: number }) {
  const [val, setVal] = useState(to);
  const fromRef = useRef(to);
  useEffect(() => {
    const from = fromRef.current;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, durationMs]);
  return <>{val}</>;
}

const DROP_COPY: Record<string, string> = {
  mock: "That mock found some gaps — the number moved down. Good. Better to find them here.",
  audit: "That last stretch found some gaps — the number moved down. Better here than in the test.",
  recheck: "A few things faded while you were away. The number reflects what stuck.",
};

export function Meter({
  view,
  responsesSeen,
  celebrate = false,
}: {
  view: MeterView | null;
  responsesSeen: number;
  celebrate?: boolean;
}) {
  if (!view) {
    return (
      <div className="meter-wrap">
        <div className="meter-label">Working out what you already know</div>
        <div className="meter-bar">
          <div className="meter-fill" style={{ width: "4%" }} />
        </div>
      </div>
    );
  }
  if (view.kind === "calibrating") {
    return (
      <div className="meter-wrap">
        <div className="meter-label">Working out what you already know</div>
        <div className="meter-bar">
          <div className="meter-fill" style={{ width: `${Math.max(4, view.progress * 100)}%` }} />
        </div>
        <p className="muted small" style={{ margin: "0.6rem 0 0" }}>
          This fills as we get a precise read on you — right or wrong answers both count.
        </p>
      </div>
    );
  }
  return (
    <div className={`meter-wrap${celebrate ? " reveal reveal-sweep" : ""}`}>
      <div className="meter-label">Right now, you'd have</div>
      <div className="meter-number" aria-live="polite">
        <CountUp to={view.pct ?? 0} />
        <span className="pct">%</span>
        <span style={{ fontFamily: "var(--sans)", fontSize: "1.05rem", color: "var(--ink-muted)", marginLeft: 8 }}>
          chance of passing
        </span>
      </div>
      {view.dropReason && <p className="notice" style={{ marginTop: "0.75rem" }}>{DROP_COPY[view.dropReason]}</p>}
      <p className="muted small" style={{ margin: "0.6rem 0 0" }}>
        Based on {responsesSeen} questions we've seen you answer.
      </p>
    </div>
  );
}

/** Topic-level memory card: missed fact highlighted, siblings expandable. */
export function MemoryCard({
  bank,
  fact,
  onGotIt,
}: {
  bank: Bank;
  fact: Fact;
  onGotIt: () => void;
}) {
  const card: Card | undefined = bank.cards.find((c) => c.id === fact.cardId);
  const [expanded, setExpanded] = useState(false);
  const siblings = card
    ? card.factIds.filter((id) => id !== fact.id).map((id) => bank.facts.find((f) => f.id === id)!).filter(Boolean)
    : [];
  return (
    <div className="card" role="region" aria-label="Memory card">
      <div className="card-topic">
        <span className="card-title">{card?.title ?? "Hold on to this"}</span>
        <span className="chip">{fact.area}</span>
      </div>
      <p className="fact">
        <Bold text={fact.statement} />
      </p>
      {card?.hook && (
        <p className="hook">
          <Bold text={card.hook} />
        </p>
      )}
      {fact.keyedNote && <p className="keyed-note">{fact.keyedNote}</p>}
      {siblings.length > 0 && (
        <div className="related">
          {!expanded ? (
            <button className="btn quiet" style={{ width: "auto", padding: 0 }} onClick={() => setExpanded(true)}>
              More on this topic ({siblings.length})
            </button>
          ) : (
            <>
              {siblings.map((s) => (
                <p key={s.id} className="fact">
                  <Bold text={s.statement} />
                </p>
              ))}
            </>
          )}
        </div>
      )}
      {card?.wikiUrl && (
        <a className="wiki" href={card.wikiUrl} target="_blank" rel="noreferrer">
          Read more ↗
        </a>
      )}
      <div style={{ marginTop: "1.1rem" }}>
        <button className="btn primary" onClick={onGotIt} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}
