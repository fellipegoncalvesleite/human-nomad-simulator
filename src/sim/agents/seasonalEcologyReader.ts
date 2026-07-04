// 2K.12 — Seasonal ecology MEMORY READER (selection-only, anti-omniscient).
//
// Reads ONLY the band's own learned `seasonalEcologyMemory` (per visited tile, per
// domain) and returns a small, bounded, explainable SELECTION-ONLY bias for a known
// target tile this season. It NEVER reads hidden seasonal truth
// (`deriveSeasonalEcologyFactor` / `getSeasonalTileConditions` / the world's tiles),
// never creates candidates, and never mutates support/yield/carrying-capacity/
// population/stress. PURE: no unseeded random call, no `any`, no UI/render/store imports.
//
// The bias is consumed by residence-unchanged target choices (resource scout /
// known-patch recheck, activity target, water-check target) and by a record-only
// reasonId annotation on residential moves. Empty / not-in-memory / wrong-domain
// lookups return `undefined` (zero effect, by construction), so with the
// `seasonalEcologyMemoryReadersEnabled` flag OFF the sim is byte-identical to baseline.

import type { ReasonId, Season, TileId } from "../core/types";
import type { ResourceClassId } from "./resourceClasses";
import type { SeasonalEcologyDomain, SeasonalEcologyObservation } from "./types";

// Bounded selection-only bias band. 2K.12E reverted it to 0.12 (from 2K.12D's 0.08): the
// global cap was NOT a clean magnitude knob — map1's long-run drift is positive-arm-driven
// and map2's is caution-arm-driven, so a uniform shrink helped map1 a little but regressed
// map2 (worst-case drift got worse). ±0.12 has the smallest worst-case ON/OFF drift of every
// magnitude config tested (see the per-arm note below).
export const MAX_SEASONAL_SELECTION_BIAS = 0.12;

// 2K.12E — per-arm calibration scales (each damps ONE arm WITHIN the shared ±cap; 1.0 =
// identity, and x*1.0===x exactly, so 1.0/1.0 is byte-identical to the 2K.12C reader).
// The hypothesis was: damp the positive recall arms to cut map1's probe/recheck-over-relocate
// drift while leaving the 2K.12C proportional caution arm intact. CALIBRATION REJECTED IT:
// the 300y ON/OFF macro delta is NON-MONOTONIC in both scales (map1: 1.0→−2.81%, 0.8→+1.41%,
// 0.7→−2.96%, 0.6→−0.28%) and NO setting beat the un-damped ±0.12 control on the binding
// constraint — every positive damp worsened the caution-driven map2, and damping caution
// worsened map2 too (it was net-supporting population). So both stay at identity 1.0; the
// constants + harness reporting are kept only so a future checkpoint can re-sweep trivially.
// The reader's residual ~2–3% long-run drift is structural/path-dependent, not a magnitude
// that bias tuning can dial out — it needs real spatial context (RANGE-1), not a finer knob.
export const POSITIVE_RECALL_SCALE = 1.0;
export const CAUTION_SCALE = 1.0;

// Learned-signal thresholds. All derived from the band's OWN observations.
const HIGH_RELIABILITY = 0.6;
const HIGH_CONCERN = 0.5;
const HIGH_OPPORTUNITY = 0.5;
const LOW_RELIABILITY = 0.3;
const IN_SEASON_DAMP = 0.6; // in-season recheck is gentler than a fresh opportunity
// 2K.12C: need at least this many observations before any failure-RATE caution fires (so a
// single bad trip never creates caution, matching the prior >=2 guard but rate-based).
const MIN_CAUTION_OBSERVATIONS = 2;

export type SeasonalEcologyHintKind =
  | "dry_water_recall"
  | "wet_opportunity_recall"
  | "in_season_recall"
  | "bad_season_caution";

export interface SeasonalEcologyHint {
  readonly tileId: TileId;
  readonly domain: SeasonalEcologyDomain;
  readonly season: Season;
  readonly kind: SeasonalEcologyHintKind;
  // Selection-only delta, clamped to [-MAX_SEASONAL_SELECTION_BIAS, +MAX].
  readonly bias: number;
  readonly basis: string;
  readonly reasonId: ReasonId;
  readonly learnedReliability?: number;
  readonly noEconomyCoupling: true;
  readonly noHiddenTruthRead: true;
}

// The ONLY resource class pinned to a specific ecology domain at the call sites
// (so a water-check reads water reliability). Everything else uses the tile's own
// stored learned domain. Pure, deterministic.
export function domainForResourceClass(classId: ResourceClassId): SeasonalEcologyDomain | undefined {
  return classId === "water_resource" ? "water_reliability" : undefined;
}

export function readSeasonalEcologyHint(
  memory: Readonly<Record<TileId, SeasonalEcologyObservation>> | undefined,
  tileId: TileId,
  season: Season,
  expectedDomain?: SeasonalEcologyDomain,
): SeasonalEcologyHint | undefined {
  if (memory === undefined) {
    return undefined;
  }
  const entry = memory[tileId];
  if (entry === undefined) {
    return undefined;
  }
  // No cross-domain bleed: a water-check only reads a water-reliability memory, etc.
  if (expectedDomain !== undefined && entry.domain !== expectedDomain) {
    return undefined;
  }

  const domain = entry.domain;
  const reliability = entry.seasonalReliabilityBySeason[season];
  // 2K.12C: PROPORTIONAL failure evidence (a RATE over this tile's own success+failure
  // history) instead of a flat gate on monotonic lifetime counts. Later successes dilute
  // old failures, so an isolated past failure cannot create permanent over-caution; a tile
  // whose failures keep dominating still earns caution. Recency is already encoded in
  // seasonalReliabilityBySeason (an EMA) and drySeasonConcern (which decays when not failing).
  const totalObservations = entry.repeatedSeasonalSuccessCount + entry.repeatedSeasonalFailureCount;
  const failureRate =
    totalObservations >= MIN_CAUTION_OBSERVATIONS ? entry.repeatedSeasonalFailureCount / totalObservations : 0;
  const failureDominant = failureRate > 0.5;
  const isWater = domain === "water_reliability";
  const isForageLike =
    domain === "plant_patch" ||
    domain === "gathering_general" ||
    domain === "local_foraging" ||
    domain === "fishing";

  let kind: SeasonalEcologyHintKind;
  let rawBias: number;

  if (
    isWater &&
    reliability !== undefined &&
    reliability >= HIGH_RELIABILITY &&
    entry.drySeasonConcern < HIGH_CONCERN &&
    !failureDominant
  ) {
    // Remembered reliable water this season → gently prefer this water-check target.
    kind = "dry_water_recall";
    rawBias = positiveBiasFromReliability(reliability);
  } else if (isForageLike && entry.wetSeasonOpportunity >= HIGH_OPPORTUNITY && !failureDominant) {
    // Remembered wet-season opportunity → gently prefer this foraging/gathering recheck.
    kind = "wet_opportunity_recall";
    rawBias = positiveBiasFromOpportunity(entry.wetSeasonOpportunity);
  } else if (cautionStrength(entry, reliability, failureRate) > 0) {
    // Remembered proportional bad-season failure / dry concern → add caution.
    kind = "bad_season_caution";
    rawBias = -cautionStrength(entry, reliability, failureRate) * MAX_SEASONAL_SELECTION_BIAS * CAUTION_SCALE;
  } else if (reliability !== undefined && reliability >= 0.5 && isSeasonBest(entry, reliability)) {
    // This season is the tile's learned-best → small in-season recheck bias.
    kind = "in_season_recall";
    rawBias = positiveBiasFromReliability(reliability) * IN_SEASON_DAMP;
  } else {
    return undefined;
  }

  const bias = round4(clamp(rawBias, -MAX_SEASONAL_SELECTION_BIAS, MAX_SEASONAL_SELECTION_BIAS));
  if (bias === 0 && kind !== "bad_season_caution") {
    return undefined;
  }

  return {
    tileId,
    domain,
    season,
    kind,
    bias,
    basis: `${kind}: ${domain} ${season} reliability=${reliability === undefined ? "—" : round4(reliability)} dryConcern=${round4(
      entry.drySeasonConcern,
    )} wetOpp=${round4(entry.wetSeasonOpportunity)} ok=${entry.repeatedSeasonalSuccessCount}/bad=${entry.repeatedSeasonalFailureCount}`,
    reasonId: `reason:seasonal-memory:${String(tileId)}:${season}:${kind}` as ReasonId,
    learnedReliability: reliability,
    noEconomyCoupling: true,
    noHiddenTruthRead: true,
  };
}

function positiveBiasFromReliability(reliability: number): number {
  // 0.5 reliability → 0; 1.0 → full cap. Linear, bounded. POSITIVE_RECALL_SCALE damps it.
  return clamp((reliability - 0.5) * 2, 0, 1) * MAX_SEASONAL_SELECTION_BIAS * POSITIVE_RECALL_SCALE;
}

function positiveBiasFromOpportunity(opportunity: number): number {
  // 0.4 opportunity → 0; 1.0 → full cap. Linear, bounded. POSITIVE_RECALL_SCALE damps it.
  return clamp((opportunity - 0.4) / 0.6, 0, 1) * MAX_SEASONAL_SELECTION_BIAS * POSITIVE_RECALL_SCALE;
}

function cautionStrength(
  entry: SeasonalEcologyObservation,
  reliability: number | undefined,
  failureRate: number,
): number {
  // Proportional: 0 at <=50% failures, scaling to 1 at 100% — a marginal majority-failure
  // tile (e.g. 60%) earns only light caution, a consistently-failing one (e.g. 90%) strong.
  const ratioCaution = failureRate > 0.5 ? (failureRate - 0.5) * 2 : 0;
  return clamp(
    Math.max(
      entry.drySeasonConcern >= HIGH_CONCERN ? entry.drySeasonConcern : 0,
      ratioCaution,
      reliability !== undefined && reliability < LOW_RELIABILITY ? (LOW_RELIABILITY - reliability) * 2 : 0,
    ),
    0,
    1,
  );
}

function isSeasonBest(entry: SeasonalEcologyObservation, reliability: number): boolean {
  return Object.values(entry.seasonalReliabilityBySeason).every(
    (value) => value === undefined || value <= reliability,
  );
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
