// CORE-PIPELINE-DECOMPOSITION-2 — shared decision scoring/reason kit.
//
// The self-contained scoring, reason, id, comparison, and geometry primitives the
// decision orchestrator and every candidate-family module use. Extracted verbatim
// from bandDecision.ts so a family module can own its candidate without importing
// the orchestrator, and the orchestrator no longer owns these primitives. Pure
// functions only (plus the deterministic seeded tie-break) — behavior is
// byte-identical to the pre-extraction inline versions.
import { MOVEMENT_TIEBREAK_EPSILON, seededTieBreakJitter } from "../core/seededVariation";
import type { BandId, Coord, DecisionId, ReasonId, TileId, WorldTime } from "../core/types";
import type { Band } from "../agents/types";
import type { Tile, WorldState } from "../world/types";
import type { Action, Reason, ScoreBreakdown } from "./types";
import type {
  CandidateDecision,
  MovementDecisionProfiler,
  MovementDecisionSubphase,
} from "./decisionCandidateTypes";

export function measureDecision<TResult>(
  profiler: MovementDecisionProfiler | undefined,
  phase: MovementDecisionSubphase,
  operation: () => TResult,
): TResult {
  return profiler === undefined ? operation() : profiler.measure(phase, operation);
}

export function getGridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

export function makeTilePairKey(left: TileId, right: TileId): string {
  return String(left).localeCompare(String(right)) <= 0
    ? `${left}|${right}`
    : `${right}|${left}`;
}

export function isBandPassableDestination(tile: Tile): boolean {
  // Rivers and wetlands shape movement through banks/crossing edges; bands do not occupy water tiles.
  return !tile.isAquatic;
}

export function getObservedRisk(tile: Tile): number {
  return clamp01(
    tile.riskProfile.floodRisk * 0.34 +
      tile.riskProfile.droughtRisk * 0.34 +
      tile.riskProfile.diseaseRisk * 0.32,
  );
}

export function scoreDecision(scoreBreakdown: ScoreBreakdown): number {
  return round2(
    scoreBreakdown.foodValue * 1.45 +
      scoreBreakdown.waterValue * 1.2 +
      scoreBreakdown.waterRefugeSecurity * 0.52 +
      scoreBreakdown.dryRefugePull * 0.28 +
      scoreBreakdown.aquaticValue * 0.72 +
      scoreBreakdown.memoryConfidence * 0.48 +
      scoreBreakdown.routeValue * 0.42 +
      scoreBreakdown.attachmentValue * 0.62 +
      scoreBreakdown.populationPressure * 0.22 +
      scoreBreakdown.storageValue * 0.42 +
      scoreBreakdown.explorationValue * 1.25 +
      scoreBreakdown.expectedFutureValue * 1.1 +
      scoreBreakdown.intentAlignment * 1.08 +
      scoreBreakdown.movementInertia * 0.34 +
      scoreBreakdown.frontierProbeValue * 0.72 +
      scoreBreakdown.localSurvivalValue * 0.64 -
      scoreBreakdown.placeAttachment * 0.36 +
      scoreBreakdown.rememberedReliability * 0.3 +
      scoreBreakdown.familiarCorridor * 0.28 +
      scoreBreakdown.returnPlacePull * 0.42 -
      scoreBreakdown.localUsePressure * 0.44 +
      scoreBreakdown.placeAttachmentPull * 0.4 +
      scoreBreakdown.netMovePressure * 0.72 +
      scoreBreakdown.recoveryBenefit * 0.52 -
      scoreBreakdown.depletionPenalty * 0.88 -
      scoreBreakdown.riverCorridorValue * 0.72 +
      scoreBreakdown.knownFordValue * 0.82 -
      scoreBreakdown.nearbyBandPressure * 0.24 -
      scoreBreakdown.parentCoreOverlap * 0.16 +
      scoreBreakdown.inheritedFamiliarityPull * 0.18 +
      scoreBreakdown.safeFrontierPull * 0.62 -
      scoreBreakdown.rangeSaturation * 0.34 +
      scoreBreakdown.perCapitaReturn * 0.24 +
      scoreBreakdown.frontierDispersalPressure * 0.42 +
      scoreBreakdown.knownOpportunityPull * 1.04 +
      scoreBreakdown.scoutValue * 0.62 +
      scoreBreakdown.moveValue * 0.42 +
      scoreBreakdown.riverProspectStrength * 0.36 +
      scoreBreakdown.logisticalProbeValue * 0.92 -
      scoreBreakdown.lossOfFallbackSecurity * 0.42 -
      scoreBreakdown.socialAccessRisk * 0.36 +
      scoreBreakdown.explorationBaseline * 0.72 +
      scoreBreakdown.crowdingExploreBoost * 0.48 +
      scoreBreakdown.saturationExploreBoost * 0.58 +
      scoreBreakdown.daughterDispersalExploreBoost * 0.7 -
      scoreBreakdown.explorationRiskPenalty * 0.92 -
      scoreBreakdown.encounterTension * 0.46 +
      scoreBreakdown.encounterTolerance * 0.14 -
      scoreBreakdown.splitRisk * 0.36 -
      scoreBreakdown.crowdingPenalty * 0.72 -
      scoreBreakdown.biomeMismatchPenalty * 0.42 +
      scoreBreakdown.biomeCompetence * 0.16 -
      scoreBreakdown.riverCrossingCost * 1.25 -
      scoreBreakdown.riverCrossingRisk * 1.08 -
      scoreBreakdown.blockedCrossingPenalty * 8 -
      scoreBreakdown.foodStress * 0.1 -
      scoreBreakdown.waterStress * 0.1 -
      scoreBreakdown.mobilityPressure * 0.05 -
      scoreBreakdown.movementCost * 1.05 -
      scoreBreakdown.riskCost * 1.0 -
      scoreBreakdown.rememberedRisk * 0.34 -
      scoreBreakdown.reversalPenalty * 0.46 -
      scoreBreakdown.socialCost * 0.7,
  );
}

export function emptyScoreBreakdown(): ScoreBreakdown {
  return {
    foodValue: 0,
    waterValue: 0,
    waterRefugeSecurity: 0,
    dryRefugePull: 0,
    aquaticValue: 0,
    movementCost: 0,
    riskCost: 0,
    memoryConfidence: 0,
    routeValue: 0,
    attachmentValue: 0,
    populationPressure: 0,
    storageValue: 0,
    explorationValue: 0,
    socialCost: 0,
    expectedFutureValue: 0,
    intentAlignment: 0,
    movementInertia: 0,
    reversalPenalty: 0,
    frontierProbeValue: 0,
    localSurvivalValue: 0,
    placeAttachment: 0,
    rememberedReliability: 0,
    rememberedRisk: 0,
    familiarCorridor: 0,
    returnPlacePull: 0,
    foodStress: 0,
    waterStress: 0,
    localUsePressure: 0,
    mobilityPressure: 0,
    placeAttachmentPull: 0,
    netMovePressure: 0,
    recoveryBenefit: 0,
    depletionPenalty: 0,
    riverCrossingCost: 0,
    riverCrossingRisk: 0,
    riverCorridorValue: 0,
    knownFordValue: 0,
    blockedCrossingPenalty: 0,
    nearbyBandPressure: 0,
    parentCoreOverlap: 0,
    daughterDispersalPressure: 0,
    inheritedFamiliarityPull: 0,
    safeFrontierPull: 0,
    crowdingPenalty: 0,
    biomeCompetence: 0,
    biomeMismatchPenalty: 0,
    rangeSaturation: 0,
    perCapitaReturn: 0,
    frontierDispersalPressure: 0,
    knownOpportunityPull: 0,
    explorationBaseline: 0,
    crowdingExploreBoost: 0,
    saturationExploreBoost: 0,
    daughterDispersalExploreBoost: 0,
    explorationRiskPenalty: 0,
    encounterTension: 0,
    encounterTolerance: 0,
    splitRisk: 0,
    scoutValue: 0,
    moveValue: 0,
    currentMarginalReturn: 0,
    expectedNextReturn: 0,
    lossOfFallbackSecurity: 0,
    riverProspectStrength: 0,
    socialAccessRisk: 0,
    logisticalProbeValue: 0,
  };
}

export function makeDecisionId(time: WorldTime, bandId: BandId): DecisionId {
  return `decision:${bandId}:${time.tick}` as DecisionId;
}

export function makeReasonId(
  decisionId: DecisionId,
  group: "primary" | "secondary" | "rejection",
  index: number,
): ReasonId {
  return `reason:${decisionId}:${group}:${index}` as ReasonId;
}

export function makeReason<TReason extends Omit<Reason, "id" | "relatedEventIds"> & {
  readonly relatedEventIds?: readonly never[];
}>(
  decisionId: DecisionId,
  group: "primary" | "secondary" | "rejection",
  index: number,
  reason: TReason,
): Reason {
  return {
    ...reason,
    id: makeReasonId(decisionId, group, index),
    relatedEventIds: [],
  } as unknown as Reason;
}

export function compareCandidates(left: CandidateDecision, right: CandidateDecision): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return getActionSortKey(left.action).localeCompare(getActionSortKey(right.action));
}

// VAR-1: sort movement candidates by score, but with a small deterministic
// seeded jitter so a band facing CLOSE alternatives picks differently per run
// seed (divergent migration). When world.runSeed is undefined (every legacy/
// test path), jitter is zero and this reduces EXACTLY to `sort(compareCandidates)`
// — byte-identical to pre-VAR-1. The jitter is bounded by MOVEMENT_TIEBREAK_
// EPSILON (< typical score gaps), so a clear winner is never displaced; only
// the order of genuinely-near candidates changes. Keyed on (runSeed, tick,
// bandId, action key), so it is stable for a given seed and reproducible.
export function sortCandidatesWithSeededTieBreak(
  world: WorldState,
  band: Band,
  candidates: readonly CandidateDecision[],
): CandidateDecision[] {
  const runSeed = world.runSeed;

  if (runSeed === undefined) {
    return [...candidates].sort(compareCandidates);
  }

  const tick = Number(world.time.tick);
  const ranked = candidates.map((candidate) => {
    const actionKey = getActionSortKey(candidate.action);
    const jitter =
      seededTieBreakJitter(runSeed, [tick, String(band.id), actionKey]) * MOVEMENT_TIEBREAK_EPSILON;

    return { candidate, actionKey, effectiveScore: candidate.score + jitter };
  });

  ranked.sort((left, right) =>
    left.effectiveScore !== right.effectiveScore
      ? right.effectiveScore - left.effectiveScore
      : left.actionKey.localeCompare(right.actionKey),
  );

  return ranked.map((entry) => entry.candidate);
}

export function getActionSortKey(action: Action): string {
  if (action.type === "stay") {
    return `0:${action.tileId}`;
  }

  if (action.type === "move_to_tile") {
    return `1:${action.targetTileId}`;
  }

  if (action.type === "explore_unknown_neighbor") {
    return `2:${action.targetTileId}`;
  }

  if (action.type === "logistical_probe") {
    return `3:${action.targetTileId}`;
  }

  return `9:${action.type}`;
}

export function compareTileIds(left: TileId, right: TileId): number {
  return String(left).localeCompare(String(right));
}

export function compareTiles(left: Tile, right: Tile): number {
  if (left.coord.y !== right.coord.y) {
    return left.coord.y - right.coord.y;
  }

  if (left.coord.x !== right.coord.x) {
    return left.coord.x - right.coord.x;
  }

  return compareTileIds(left.id, right.id);
}

export function numericTileIdPart(tile: Tile | TileId): number {
  const tileId = typeof tile === "string" ? tile : tile.id;
  const parts = String(tileId).split(":");
  const x = Number(parts[1] ?? 0);
  const y = Number(parts[2] ?? 0);

  return Number.isFinite(x) && Number.isFinite(y) ? y * 1000 + x : 0;
}

export function parseTileCoord(tileId: TileId): Coord | undefined {
  const [, rawX, rawY] = String(tileId).split(":");
  const x = Number(rawX);
  const y = Number(rawY);

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

export function getDirectionBetweenCoords(from: Coord, to: Coord): Coord {
  return normalizeVector({
    x: to.x - from.x,
    y: to.y - from.y,
  }) ?? { x: 0, y: 0 };
}

export function normalizeVector(vector: Coord): Coord | undefined {
  const magnitude = Math.hypot(vector.x, vector.y);

  if (magnitude <= 0.0001) {
    return undefined;
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

export function dotVectors(left: Coord, right: Coord): number {
  return left.x * right.x + left.y * right.y;
}

export function getActionVector(currentTileId: TileId, targetTileId: TileId): Coord | undefined {
  const currentCoord = parseTileCoord(currentTileId);
  const targetCoord = parseTileCoord(targetTileId);

  return currentCoord === undefined || targetCoord === undefined
    ? undefined
    : getDirectionBetweenCoords(currentCoord, targetCoord);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
