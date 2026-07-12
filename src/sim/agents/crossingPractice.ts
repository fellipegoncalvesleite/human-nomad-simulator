// Practiced-crossing relief (checkpoint CAUSAL-REPAIR-1) — the one real local
// learning loop of this pass.
//
// LOOP: repeated local condition (crossing this river here) → practice
// evidence (KnownCrossingMemory: useCount +1 and successConfidence +0.16 per
// REAL crossing, riskMemory tracking experienced risk — memory.ts) → small
// capped decision effect (this module: bounded relief on the crossing risk the
// decision pays at THIS crossing) → future outcomes update the memory again.
//
// PROPERTIES: local (per crossing key, never a global skill), capped (relief
// ≤ CROSSING_PRACTICE_RELIEF_CAP so ≥65% of the raw risk is always paid),
// discounted by remembered danger (a ford remembered as dangerous earns less
// relief no matter how often it was used), and PERISHABLE (full within 2
// years of last use, fading to zero by ~8 years — forgetting is part of the
// loop). Pure and deterministic; no truth reads; no `any`; no UI imports.

import type { KnownCrossingMemory } from "./types";

export const CROSSING_PRACTICE_RELIEF_CAP = 0.35;
const SEASONS_PER_YEAR = 4;
const FULL_RELIEF_YEARS = 2;
const RELIEF_GONE_AFTER_EXTRA_YEARS = 6;

export interface CrossingPracticeRelief {
  // Fraction of the raw crossing risk removed (0..CROSSING_PRACTICE_RELIEF_CAP).
  readonly relief: number;
  // Practice evidence before staleness (debug visibility).
  readonly practice: number;
  // 1 = fresh, 0 = fully forgotten.
  readonly staleness: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Staleness factor: full relief for the first FULL_RELIEF_YEARS since last
// use, fading linearly to zero over the following RELIEF_GONE_AFTER_EXTRA_YEARS.
export function getCrossingPracticeStaleness(
  currentTick: number,
  lastUsedTick: number,
): number {
  const yearsSinceUse = Math.max(0, currentTick - lastUsedTick) / SEASONS_PER_YEAR;

  return clamp01(1 - Math.max(0, yearsSinceUse - FULL_RELIEF_YEARS) / RELIEF_GONE_AFTER_EXTRA_YEARS);
}

export function deriveCrossingPracticeRelief(
  memory: KnownCrossingMemory | undefined,
  currentTick: number,
): CrossingPracticeRelief {
  if (memory === undefined) {
    return { relief: 0, practice: 0, staleness: 0 };
  }

  const practice = clamp01(
    Math.min(1, memory.useCount / 6) * 0.55 + memory.successConfidence * 0.45,
  );
  const staleness = getCrossingPracticeStaleness(currentTick, Number(memory.lastUsedAt.tick));
  const relief = round2(
    Math.min(
      CROSSING_PRACTICE_RELIEF_CAP,
      practice * CROSSING_PRACTICE_RELIEF_CAP * clamp01(1 - memory.riskMemory * 0.5),
    ) * staleness,
  );

  return { relief, practice: round2(practice), staleness: round2(staleness) };
}
