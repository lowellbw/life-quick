/**
 * Speed-round pool: the easiest facts (population prior >= 0.80), highest
 * prior first, capped, guaranteeing every area shows up where it can, then
 * seeded-shuffled so the round doesn't feel sorted.
 */
import type { Bank } from "../content/types";
import { TUNING } from "../model/tuning";
import { shuffled, type Rng } from "../lib/rng";

export function speedPool(bank: Bank, rng: Rng): string[] {
  const eligible = bank.facts.filter((f) => f.speedEligible).sort((a, b) => b.prior - a.prior);
  const cap = TUNING.SPEED_POOL_MAX;
  const byArea = new Map<string, string[]>();
  for (const f of eligible) {
    const list = byArea.get(f.area) ?? [];
    list.push(f.id);
    byArea.set(f.area, list);
  }
  const picked = new Set<string>();
  // one per area first (where available)
  for (const list of byArea.values()) if (list.length > 0) picked.add(list[0]);
  for (const f of eligible) {
    if (picked.size >= cap) break;
    picked.add(f.id);
  }
  return shuffled([...picked], rng);
}
