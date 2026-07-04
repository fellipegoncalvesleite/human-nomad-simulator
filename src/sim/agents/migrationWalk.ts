// Cause-gated sub-tick migration walk (experimental spike, 2026-06-15).
//
// PURPOSE. A band that has ALREADY made a fully-scored seasonal migration decision
// (a residential `move_to_tile`/`explore` under a migration-class mobility intent)
// realizes that decision as a BREADCRUMB PATH of single-tile steps in its own chosen
// direction, instead of a single ≤2-tile hop. This corrects a real scale gap: the
// marker is a seasonal residential base, and a mobile forager's base displaces
// ~5–25 km/season — far more than the ≤3 km the single-hop cap allowed.
//
// THIS IS A PATH REALIZER, NOT A SECOND DECISION SYSTEM. It does not re-run the
// canonical band scorer (that would be risky duplication AND multiply the
// PERF-1-critical tick cost). It greedily extends the band's already-caused realized
// motion, tile by tile, using ONLY the band's own observed records (anti-omniscient),
// and stops when terrain/knowledge/crowding say so. Each step is grid-distance 1, so
// nothing ever teleports across a wall of mountains or a sea.
//
// PURITY: deterministic, no unseeded random call, no `any`, no WorldState/UI imports. The world
// is injected as a small `MigrationWalkView` so the walk is unit-testable in isolation.
// Seeded near-tie reordering is VAR-1-compliant (jitter ≪ score gaps; runSeed===undefined
// → zero jitter → legacy-identical ordering).

import type { Coord, TileId } from "../core/types";
import { MOVEMENT_TIEBREAK_EPSILON, seededTieBreakJitter } from "../core/seededVariation";

/** A band's OWN observed view of one tile (never ground truth). */
export interface MigrationWalkStepView {
  readonly observedRichness: number;
  readonly observedWaterAccess: number;
  readonly observedMovementCost: number;
  readonly observedRisk: number;
  /** Crowding / local depletion proxy at the tile (band-known use pressure). */
  readonly localUsePressure: number;
  readonly confidence: number;
  /** Whether this tile is in the band's observed memory (false = unknown land). */
  readonly known: boolean;
}

/** Injected, pure read-only world view the walk needs (keeps the module WorldState-free). */
export interface MigrationWalkView {
  coordOf(tileId: TileId): Coord | undefined;
  /** id-ordered passable+impassable neighbour ids of a tile (deterministic order). */
  neighborIdsOf(tileId: TileId): readonly TileId[];
  /** Canonical passability + river-crossing gate for a single step. */
  canStep(fromTileId: TileId, toTileId: TileId): boolean;
  stepView(tileId: TileId): MigrationWalkStepView | undefined;
}

export interface MigrationWalkInput {
  readonly startTileId: TileId;
  /** Direction of the band's own already-chosen motion (need not be normalized). */
  readonly headingVector: Coord;
  /** Cause-scaled step budget (>=1). 1 ≈ today's single hop. */
  readonly maxSteps: number;
  /** VAR-1 run seed (undefined → legacy zero-jitter movie). */
  readonly runSeed: number | undefined;
  readonly bandId: string;
  readonly tick: number;
  /** Bounded number of steps the walk may take into UNKNOWN directional land. */
  readonly allowUnknownSteps: number;
  /** Observed richness at/above which the current tile is "good enough to settle". */
  readonly settleRichnessFloor: number;
}

export type MigrationWalkStopReason =
  | "settled_good_enough"
  | "no_directional_candidate"
  | "no_progress"
  | "budget_exhausted"
  | "not_engaged";

export interface MigrationWalkResult {
  /** Contiguous path of stepped tiles (excludes start); each step is grid-distance 1. */
  readonly path: readonly TileId[];
  readonly endpointTileId: TileId;
  readonly steps: number;
  readonly stopReason: MigrationWalkStopReason;
}

// Step-scoring weights. Deliberately direction- and cost-led (a migration walk follows a
// heading down a corridor), NOT a richest-tile hunt — that, plus the breadcrumb/crowding
// terms and the stop-at-good-enough rule, is what prevents "rich-tile chasing".
const W_DIRECTION = 0.6;
const W_RICHNESS = 0.45;
const W_WATER = 0.3;
const W_MOVEMENT_COST = 0.7;
const W_RISK = 0.35;
const W_CROWDING = 0.55;
const W_BREADCRUMB = 0.9; // strong: a tile stepped on this walk is heavily discouraged again
const UNKNOWN_BASE_VALUE = 0.16; // a directional unknown step is worth a little (exploration), never truth
const UNKNOWN_MOVEMENT_COST = 0.55; // unknown terrain is assumed costlier to traverse
const SETTLE_CROWDING_CEILING = 0.45; // a "good home" must not be crowded
const SETTLE_IMPROVEMENT_MARGIN = 0.08; // best step must beat staying by this to keep walking

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function normalize(vector: Coord): Coord {
  const magnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (magnitude < 1e-9) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function dot(left: Coord, right: Coord): number {
  return left.x * right.x + left.y * right.y;
}

/** Value of holding the current tile as a settled home (band-known richness + water). */
function settleValueOf(view: MigrationWalkStepView): number {
  return view.observedRichness * W_RICHNESS + view.observedWaterAccess * W_WATER;
}

/**
 * Realize an already-caused migration decision as a contiguous breadcrumb path.
 *
 * Returns `{ path: [], steps: 0, stopReason: "not_engaged" }` for a degenerate input
 * (no budget or no heading) so the caller can fall back to its single-hop behaviour
 * byte-identically.
 */
export function deriveMigrationWalk(
  view: MigrationWalkView,
  input: MigrationWalkInput,
): MigrationWalkResult {
  const heading = normalize(input.headingVector);
  if ((heading.x === 0 && heading.y === 0) || input.maxSteps < 1) {
    return { path: [], endpointTileId: input.startTileId, steps: 0, stopReason: "not_engaged" };
  }

  const path: TileId[] = [];
  // Walk-local breadcrumb counts: transient, NOT global depletion (which advances once/season).
  const visited = new Map<TileId, number>([[input.startTileId, 1]]);
  let current = input.startTileId;
  let unknownUsed = 0;
  let stopReason: MigrationWalkStopReason = "budget_exhausted";

  for (let step = 0; step < input.maxSteps; step += 1) {
    const currentCoord = view.coordOf(current);
    if (currentCoord === undefined) {
      stopReason = "no_directional_candidate";
      break;
    }

    interface StepCandidate {
      readonly tileId: TileId;
      readonly score: number;
      readonly known: boolean;
    }
    const candidates: StepCandidate[] = [];

    for (const neighborId of view.neighborIdsOf(current)) {
      if (!view.canStep(current, neighborId)) {
        continue;
      }
      const neighborCoord = view.coordOf(neighborId);
      if (neighborCoord === undefined) {
        continue;
      }
      const stepDir = normalize({ x: neighborCoord.x - currentCoord.x, y: neighborCoord.y - currentCoord.y });
      const progress = dot(stepDir, heading);
      if (progress <= 0) {
        continue; // never step sideways or backward relative to the band's own heading
      }
      const sv = view.stepView(neighborId);
      if (sv === undefined) {
        continue;
      }
      if (!sv.known && unknownUsed >= input.allowUnknownSteps) {
        continue; // anti-omniscience: bounded exploratory stepping into unknown land only
      }
      const breadcrumb = visited.get(neighborId) ?? 0;
      const value = sv.known
        ? sv.observedRichness * W_RICHNESS +
          sv.observedWaterAccess * W_WATER -
          sv.observedMovementCost * W_MOVEMENT_COST -
          sv.observedRisk * W_RISK -
          sv.localUsePressure * W_CROWDING
        : UNKNOWN_BASE_VALUE - UNKNOWN_MOVEMENT_COST * W_MOVEMENT_COST;
      const score =
        progress * W_DIRECTION + value - breadcrumb * W_BREADCRUMB;
      candidates.push({ tileId: neighborId, score, known: sv.known });
    }

    if (candidates.length === 0) {
      stopReason = "no_directional_candidate";
      break;
    }

    // Deterministic argmax with VAR-1 near-tie jitter; id-order is the final tie-break
    // (candidates are already in id order because neighborIdsOf is).
    let best = candidates[0];
    let bestJittered =
      best.score +
      seededTieBreakJitter(input.runSeed ?? 0, [input.tick, input.bandId, step, best.tileId]) *
        (input.runSeed === undefined ? 0 : MOVEMENT_TIEBREAK_EPSILON);
    for (let index = 1; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const jittered =
        candidate.score +
        seededTieBreakJitter(input.runSeed ?? 0, [input.tick, input.bandId, step, candidate.tileId]) *
          (input.runSeed === undefined ? 0 : MOVEMENT_TIEBREAK_EPSILON);
      if (jittered > bestJittered) {
        best = candidate;
        bestJittered = jittered;
      }
    }

    // Stop-at-good-enough: if the band is already sitting on a rich, uncrowded tile and the
    // best onward step does not materially improve, it settles here (the breadcrumb
    // "resource above threshold → stay" rule). Only meaningful once it has stepped at least
    // once (the start tile's suitability was already weighed by the seasonal decision).
    const currentView = view.stepView(current);
    if (
      step > 0 &&
      currentView !== undefined &&
      currentView.known &&
      currentView.observedRichness >= input.settleRichnessFloor &&
      currentView.localUsePressure < SETTLE_CROWDING_CEILING &&
      best.score < settleValueOf(currentView) + SETTLE_IMPROVEMENT_MARGIN
    ) {
      stopReason = "settled_good_enough";
      break;
    }

    if (best.known === false) {
      unknownUsed += 1;
    }
    current = best.tileId;
    path.push(best.tileId);
    visited.set(best.tileId, (visited.get(best.tileId) ?? 0) + 1);
  }

  return {
    path,
    endpointTileId: path.length > 0 ? path[path.length - 1] : input.startTileId,
    steps: path.length,
    stopReason: path.length === 0 && stopReason === "budget_exhausted" ? "no_progress" : stopReason,
  };
}

/**
 * Spike master switch. `false` reverts to the pre-spike single-hop behaviour everywhere
 * (used to measure true before/after on this machine; flip to revert the whole spike).
 */
export const MIGRATION_WALK_ENABLED = false;

/** Migration-class mobility intents — the CAUSE gate for engaging the walk. */
export const MIGRATION_INTENT_KINDS: ReadonlySet<string> = new Set<string>([
  "follow_river_corridor",
  "seek_better_water",
  "cross_pass",
  "return_to_known_good_area",
  "expand_known_world",
  "seek_new_range",
  "frontier_dispersal",
  "daughter_range_expansion",
]);

/** Hard ceiling on steps per migration (≈ MAX×1.5 km on Map 2). Conservative & tunable. */
export const MIGRATION_WALK_MAX_STEPS = 6;

/**
 * Cause-scaled step budget: a mild relocation gets ~1 step (≈ today's single hop), a
 * strongly-pressured stress/dispersal relocation gets up to MAX. `pressure` in [0,1].
 */
export function deriveMigrationWalkBudget(pressure: number): number {
  const clamped = clamp01(pressure);
  return 1 + Math.round(clamped * (MIGRATION_WALK_MAX_STEPS - 1));
}
