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
import type { Band } from "./types";
import { deriveBandTendencies } from "./bandTendency";
import { deriveChronicHardship } from "./chronicHardship";
import {
  deriveCarriedWaterRelief,
  deriveCarryingRelief,
  deriveDryRouteWaterRelief,
  deriveShelterPortabilityBurden,
  type CarriedWaterReliefResult,
  type PracticalReliefResult,
} from "./adaptationBoundary";

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
 * Master switch. SPIKE-MOBILITY-1 (2026-06-15) enabled the walk for EVERY
 * migration-class intent scaled only by intent persistence — HEAT founders
 * carried strong intent perpetually, re-walked ~every season, never anchored,
 * and the 500y single-origin population collapsed (655→91). That negative
 * result reverted the spike with this flag.
 *
 * CAUSAL-REPAIR-2 re-enables the walk behind a REPAIRED cause gate
 * (`deriveSeasonalTravelPlan`): engagement now requires either ACTIVE chronic
 * hardship (repeated low-support evidence that is gate-inert for comfortable
 * bands and structurally self-terminating — dwell resets and mean8 recovers
 * after a successful escape) or a migration-class intent held across a
 * multi-season cooldown since the last residential move (derived from
 * movementHistory — no perpetual every-season re-walking). Dependents, carry
 * burden, water uncertainty, and low route confidence LIMIT the step budget
 * (never below 2 while the motive is strong); comfort or a fresh move
 * disengages entirely. The walk itself is unchanged: contiguous single-tile
 * steps, band-known values only, breadcrumbs, stop-at-good-enough.
 */
export const MIGRATION_WALK_ENABLED = true;

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

// ---------------------------------------------------------------------------
// CAUSAL-REPAIR-2 — Seasonal travel plan: the repaired CAUSE gate for the walk.
//
// The plan answers, per residential move: is a multi-tile seasonal journey
// justified, how far, and — when it is not — WHY not (legible limiters for
// Technical). Motives are the ones the design allows: chronic hardship escape
// (repeated low-support evidence), dispersal/frontier pull, or committed
// corridor migration. Constraints LIMIT distance rather than collapsing it to
// one tile: while the motive is strong the budget floors at 2 steps.
// Anti-churn (the SPIKE-MOBILITY-1 killer): intent-driven journeys need a
// multi-season rest since the last residential move; hardship journeys need a
// shorter rest (a staged escape advances in legs, not every single season) and
// self-terminate because a successful escape resets the hardship evidence.
// ---------------------------------------------------------------------------

export type SeasonalTravelMotive =
  | "chronic_hardship_escape"
  | "dispersal_or_frontier"
  | "corridor_migration"
  | "none";

export interface SeasonalTravelPlanInput {
  readonly intentKind?: string;
  readonly intentPersistence: number;
  readonly hardshipActive: boolean;
  readonly hardshipSeverity: number;
  readonly dispersalPressure: number;
  // Dependents + elders share of population (load of slow travellers).
  readonly vulnerableShare: number;
  // Band-known carrying constraint (bodyCampLogistics carryConstraintBias).
  readonly carryConstraint: number;
  readonly waterStress: number;
  // Average confidence across the band's own observed tiles (route knowledge).
  readonly routeConfidence: number;
  readonly seasonsSinceLastResidentialMove: number;
}

export interface SeasonalTravelPlan {
  readonly engaged: boolean;
  readonly motive: SeasonalTravelMotive;
  readonly motiveStrength: number;
  // Final step budget after limiters; <2 means today's single hop.
  readonly budget: number;
  // Human-legible reasons the journey is short/blocked (Technical proof).
  readonly limiters: readonly string[];
  // INVENTION-1: practical-response reliefs the plan actually consumed
  // (0 when no matching practiced response). Proof surface for Technical and
  // for the response-specific efficacy evaluators.
  readonly appliedCarryingRelief?: PracticalReliefResult;
  readonly appliedWaterRelief?: PracticalReliefResult;
  // INVENTION-3: carried-water relief (water_storage response) and the
  // shelter portability burden the plan actually paid.
  readonly appliedCarriedWaterRelief?: CarriedWaterReliefResult;
  readonly appliedShelterPortabilityBurden?: number;
}

const DISPERSAL_INTENT_KINDS: ReadonlySet<string> = new Set<string>([
  "frontier_dispersal",
  "daughter_range_expansion",
  "seek_new_range",
  "expand_known_world",
]);
const CORRIDOR_INTENT_KINDS: ReadonlySet<string> = new Set<string>([
  "follow_river_corridor",
  "seek_better_water",
  "cross_pass",
  "return_to_known_good_area",
]);

const HARDSHIP_MOTIVE_FLOOR = 0.2;
const HARDSHIP_LEG_REST_SEASONS = 2;
const INTENT_LEG_REST_SEASONS = 4;
const STRONG_MOTIVE_FLOOR = 0.45;

export function deriveSeasonalTravelPlan(input: SeasonalTravelPlanInput): SeasonalTravelPlan {
  const limiters: string[] = [];
  let motive: SeasonalTravelMotive = "none";
  let strength = 0;

  if (input.hardshipActive && input.hardshipSeverity >= HARDSHIP_MOTIVE_FLOOR) {
    if (input.seasonsSinceLastResidentialMove >= HARDSHIP_LEG_REST_SEASONS) {
      motive = "chronic_hardship_escape";
      strength = clamp01(input.hardshipSeverity);
    } else {
      limiters.push("recently moved — hardship journey continues in a later leg");
    }
  }

  if (motive === "none" && input.intentKind !== undefined) {
    const dispersal = DISPERSAL_INTENT_KINDS.has(input.intentKind);
    const corridor = CORRIDOR_INTENT_KINDS.has(input.intentKind);

    if (dispersal || corridor) {
      if (input.seasonsSinceLastResidentialMove >= INTENT_LEG_REST_SEASONS) {
        motive = dispersal ? "dispersal_or_frontier" : "corridor_migration";
        strength = dispersal
          ? clamp01(Math.max(input.intentPersistence, input.dispersalPressure))
          : clamp01(input.intentPersistence * 0.85);
      } else {
        limiters.push("recently moved — travel intent rests before another leg");
      }
    }
  }

  if (motive === "none" && limiters.length === 0) {
    limiters.push("no travel motive (comfortable or local move)");
  }

  let budget = motive === "none" ? 1 : deriveMigrationWalkBudget(strength);

  if (motive !== "none") {
    if (input.vulnerableShare > 0.44) {
      budget -= 1;
      limiters.push("many dependents/elders slow the column");
    }
    if (input.carryConstraint > 0.28) {
      budget -= 1;
      limiters.push("carrying burden limits the day's range");
    }
    if (input.waterStress > 0.5) {
      budget -= 1;
      limiters.push("water uncertainty keeps stages short");
    }
    if (input.routeConfidence < 0.35) {
      budget -= 1;
      limiters.push("little confident route knowledge");
    }

    // Constraints LIMIT distance; they do not collapse a strongly-motivated
    // journey to a single tile.
    budget = Math.max(strength >= STRONG_MOTIVE_FLOOR ? 2 : 1, Math.min(MIGRATION_WALK_MAX_STEPS, budget));

    if (budget < 2) {
      limiters.push("constraints reduce this journey to a single hop");
    }
  }

  return {
    engaged: motive !== "none" && budget >= 2,
    motive,
    motiveStrength: Math.round(strength * 100) / 100,
    budget,
    limiters,
  };
}

// ---------------------------------------------------------------------------
// Residential season movement classification (CAUSAL-REPAIR-2). One legible
// answer per season for the RESIDENTIAL band (task parties / probes / scouts
// never move the residence and are reported separately): did the camp hold,
// shift locally, travel in a staged leg, relocate outright — or want to move
// and get held back? Pure presentation-grade derivation over existing state.
// ---------------------------------------------------------------------------

export type ResidentialSeasonMovementKind =
  | "no_residential_move"
  | "local_camp_shift"
  | "staged_residential_travel"
  | "full_residential_relocation"
  | "relocation_blocked_or_held";

export function classifyResidentialSeason(input: {
  readonly movedThisSeason: boolean;
  readonly moveDistance: number;
  readonly planMotive: SeasonalTravelMotive;
  readonly planEngaged: boolean;
  readonly anchorRecommendation?: string;
  readonly blockedCrossingOnBestMove: boolean;
}): { readonly kind: ResidentialSeasonMovementKind; readonly label: string } {
  if (input.movedThisSeason && input.moveDistance >= 2) {
    return {
      kind: "staged_residential_travel",
      label: `staged residential travel — ${input.moveDistance} tiles in one season (motive ${input.planMotive})`,
    };
  }

  if (input.movedThisSeason) {
    if (input.anchorRecommendation === "residential_relocation" || input.planMotive !== "none") {
      return {
        kind: "full_residential_relocation",
        label: "residential relocation (single stage this season)",
      };
    }

    return { kind: "local_camp_shift", label: "local camp shift (low-pressure adjustment)" };
  }

  if (input.planMotive !== "none" || input.anchorRecommendation === "residential_relocation") {
    return {
      kind: "relocation_blocked_or_held",
      label: input.blockedCrossingOnBestMove
        ? "relocation motive present but the best route is a blocked crossing"
        : "relocation motive present but held back (see travel limiters / anchor gates)",
    };
  }

  return { kind: "no_residential_move", label: "no residential move (camp held all season)" };
}

/**
 * Band-level convenience builder: assembles SeasonalTravelPlanInput from the
 * band's own persisted state (never truth). Used by the decision apply path
 * and by Technical, so the shown plan is exactly the consumed plan.
 *
 * INVENTION-1: practiced carrying / dry-route responses apply bounded,
 * context-gated reliefs to the plan's limiter INPUTS (never the motive):
 *  - carrying relief scales down the carry-constraint input and softens the
 *    vulnerable-share input (a practiced band carries its dependents' loads a
 *    little better) — the constraint itself is always mostly paid;
 *  - water relief scales down the water-stress input ONLY when the journey's
 *    scored destination is one of the band's own remembered watered places
 *    (`destinationKnownWatered` — the apply path passes it; Technical's
 *    target-less view shows the relief as context-gated instead).
 * `options.disablePracticalReliefs` exists so the efficacy evaluators can
 * measure the counterfactual budget with the SAME inputs minus the reliefs.
 */
export function deriveSeasonalTravelPlanForBand(
  band: Band,
  intentKind: string | undefined,
  intentPersistence: number,
  currentTick: number,
  options?: {
    readonly destinationKnownWatered?: boolean;
    readonly disablePracticalReliefs?: boolean;
    readonly disableCarryingRelief?: boolean;
    readonly disableDryRouteWaterRelief?: boolean;
    readonly disableCarriedWaterRelief?: boolean;
    readonly disableShelterBurden?: boolean;
  },
): SeasonalTravelPlan {
  const hardship = deriveChronicHardship(band, deriveBandTendencies(band));
  const lastMove = band.movementHistory[band.movementHistory.length - 1];
  const seasonsSinceLastResidentialMove =
    lastMove === undefined ? 999 : Math.max(0, currentTick - Number(lastMove.tick));
  const records = Object.values(band.knowledge.observedTiles);
  const routeConfidence = records.length === 0
    ? 0
    : records.reduce((total, record) => total + record.confidence, 0) / records.length;
  const disabled = options?.disablePracticalReliefs === true;
  const carryingRelief = disabled || options?.disableCarryingRelief === true
    ? undefined
    : deriveCarryingRelief(band, currentTick);
  const waterRelief = disabled || options?.disableDryRouteWaterRelief === true
    ? undefined
    : deriveDryRouteWaterRelief(band, currentTick, options?.destinationKnownWatered);
  // INVENTION-3: carried water covers dry stages with or without a remembered
  // watered destination; the plan pays the LARGER of staging/carried relief
  // on the water limiter (they answer the same constraint — never both).
  // Heat context is the band's own lived camp exposure, not hidden truth.
  const heatContext = (band.bodyCampLogistics?.campExposure?.heat ?? 0) >= 0.4;
  const rawVulnerableShare =
    (band.demography.dependents + band.demography.elders) /
    Math.max(1, band.demography.population);
  const rawCarryConstraint = band.bodyCampLogistics?.behavior?.carryConstraintBias ?? 0;
  const rawWaterStress = band.pressureState?.waterStress ?? 0;
  const baseInput: SeasonalTravelPlanInput = {
    intentKind,
    intentPersistence: clamp01(intentPersistence),
    hardshipActive: hardship.active,
    hardshipSeverity: hardship.severity,
    dispersalPressure: band.pressureState?.daughterDispersalPressure ?? 0,
    vulnerableShare: rawVulnerableShare,
    carryConstraint: rawCarryConstraint,
    waterStress: rawWaterStress,
    routeConfidence,
    seasonsSinceLastResidentialMove,
  };
  const unrelievedPlan = deriveSeasonalTravelPlan(baseInput);
  const carriedWaterRelief = disabled || options?.disableCarriedWaterRelief === true
    ? undefined
    : deriveCarriedWaterRelief(band, currentTick, {
        heatContext,
        routeDurationSteps: Math.max(1, unrelievedPlan.budget),
        familiarRoute: routeConfidence >= 0.5,
      });
  // INVENTION-3: a standing heavy shelter travels with the camp — its
  // portability burden is PAID on the same carry input carrying practice eases.
  const shelterBurden = disabled || options?.disableShelterBurden === true ? 0 : deriveShelterPortabilityBurden(band);
  const carrying = carryingRelief?.active === true ? carryingRelief.relief : 0;
  const stagedWater = waterRelief?.active === true ? waterRelief.relief : 0;
  const carriedWater = carriedWaterRelief?.active === true ? carriedWaterRelief.relief : 0;
  const water = Math.max(stagedWater, carriedWater);
  const carriedWaterBurden = carriedWaterRelief?.active === true ? carriedWaterRelief.carryingBurden : 0;

  const plan = deriveSeasonalTravelPlan({
    ...baseInput,
    vulnerableShare: Math.max(0, rawVulnerableShare - carrying * 0.2),
    carryConstraint: Math.min(1, rawCarryConstraint * (1 - carrying) + shelterBurden + carriedWaterBurden),
    waterStress: rawWaterStress * (1 - water),
  });

  const appliedStaging = waterRelief === undefined || stagedWater <= 0 || stagedWater < carriedWater
    ? waterRelief === undefined ? undefined : { ...waterRelief, active: false, relief: 0, reason: "carried water addressed the same limiter more strongly; staging was not credited" }
    : waterRelief;
  const appliedCarried = carriedWaterRelief === undefined || carriedWater <= 0 || carriedWater < stagedWater
    ? carriedWaterRelief === undefined ? undefined : { ...carriedWaterRelief, active: false, relief: 0, reason: "water staging addressed the same limiter more strongly; carried water was not credited" }
    : carriedWaterRelief;

  return {
    ...plan,
    appliedCarryingRelief: carryingRelief,
    appliedWaterRelief: appliedStaging,
    appliedCarriedWaterRelief: appliedCarried,
    appliedShelterPortabilityBurden: shelterBurden,
  };
}
