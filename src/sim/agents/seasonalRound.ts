import type { ResidentialAnchorContext } from "./residentialAnchor";
import { getLocalUsePressureValue } from "./pressure";
import type {
  Band,
  DryMarginSeasonalMode,
  IntraSeasonActivitySummary,
  RoundCatchmentRotationState,
  SeasonalResidenceMode,
  SeasonalRoundDecisionState,
  SeasonalRoundMemory,
  SeasonalRoundOutcome,
  SeasonalRoundPhase,
  SeasonalRoundPhaseRecord,
  SeasonalTimelineEntry,
} from "./types";
import type { ReasonId, Season, TileId, WorldTime } from "../core/types";
import { getTile } from "../world/generate";
import { isBandPassableDestination } from "../world/passability";
import type { Tile, WorldState } from "../world/types";

// Multi-year seasonal-round coherence (checkpoint 2I.4). Infers a band's mobile
// seasonal pattern (dry-refuge return ↔ wet dispersal) from its anchor memories
// and seasonal observations, then lets it lightly bias — never override — the
// season's decision. Pure, bounded, deterministic, anti-omniscient.

const MAX_ASSOCIATED_TILES = 8;
const MAX_TIMELINE_ENTRIES = 12;
const MAX_ROTATION_CANDIDATES = 24;
const MAX_ROTATION_SELECTED = 16;
const MIN_ROUND_PULL_CONFIDENCE = 0.4;
const BASE_ROUND_PULL = 0.18;
// Dry-refuge stickiness (2I.5, PART 2/3): refuge return pull is a little stronger
// than the generic round pull when confidence is high and the refuge is viable;
// drifting to a non-refuge tile in a dry phase takes a small penalty.
const REFUGE_RETURN_PULL_BASE = 0.24;
const REFUGE_DRIFT_PENALTY_BASE = 0.16;
// Above this water stress, the band is allowed to drift off the remembered refuge
// without penalty (water failure / survival overrides the round).
const REFUGE_DRIFT_ALLOWED_WATER_STRESS = 0.7;
// Minimum known water access for a remembered refuge to still count as viable.
const REFUGE_VIABLE_MIN_WATER = 0.4;
const DRY_PHASES: ReadonlySet<SeasonalRoundPhase> = new Set([
  "dry_refuge_return",
  "late_dry_hold",
]);
const WET_PHASES: ReadonlySet<SeasonalRoundPhase> = new Set([
  "wet_dispersal",
  "green_harvest",
]);

// Read-only scoring view of the band's existing seasonal-round memory (built on a
// prior tick). Used to bias this season's candidates toward the remembered
// pattern without recomputing the round during scoring.
export interface SeasonalRoundScoringContext {
  readonly round: SeasonalRoundMemory | undefined;
  readonly currentPhase: SeasonalRoundPhase;
  readonly expectedNextPhase: SeasonalRoundPhase;
  readonly phaseConfidence: number;
  readonly seasonalRoundPull: number;
  readonly dryApproaching: boolean;
  readonly wetSeason: boolean;
  readonly rememberedDryRefugeTileId: TileId | undefined;
  readonly rememberedWetRangeTileIds: readonly TileId[];
  readonly refugeViable: boolean;
  readonly currentDistanceFromRememberedRefuge: number | undefined;
  readonly dryRefugeStickiness: number;
  readonly refugeReturnPull: number;
  readonly refugeDriftPenalty: number;
  readonly driftAllowedByWaterStress: boolean;
}

export function getSeasonalRoundScoringContext(
  band: Band,
  world: WorldState,
): SeasonalRoundScoringContext {
  const round = band.seasonalRound;
  const season = world.time.season;
  const currentPhase = phaseForSeason(season);
  const expectedNextPhase = phaseForSeason(nextSeason(season));
  const dryApproaching = season === "summer" || season === "autumn";
  const wetSeason = season === "spring";

  const dryRefuge = round === undefined ? undefined : bestDryRefugePhase(round);
  // The remembered dry refuge is the band's best PROVEN refuge from anchor memory
  // (highest dry-season reliability among tiles it has successfully held), which is
  // stable across drift; fall back to the round's dry-phase anchor tile. This is
  // what stickiness pulls toward (2I.5, PART 2).
  const rememberedDryRefugeTileId =
    bestRememberedRefugeFromMemory(band) ?? dryRefuge?.anchorTileId ?? dryRefuge?.tetheringWaterTileId;
  const rememberedWetRangeTileIds = round === undefined ? [] : collectWetRangeTiles(round);
  const phaseConfidence = round === undefined
    ? 0
    : phaseRecordFor(round, expectedNextPhase)?.confidence ?? dryRefuge?.confidence ?? 0;

  const roundConfidence = round?.confidence ?? 0;
  const abovePullConfidence = round !== undefined && roundConfidence >= MIN_ROUND_PULL_CONFIDENCE;
  const strength = clamp01(roundConfidence * (0.5 + phaseConfidence * 0.5));
  const seasonalRoundPull = abovePullConfidence ? round2(strength * BASE_ROUND_PULL) : 0;

  // Dry-refuge stickiness (PART 2): is the remembered refuge still viable in the
  // band's OWN memory (known, passable, water still acceptable, not failed)?
  const refugeViable = isRememberedRefugeViable(world, band, rememberedDryRefugeTileId);
  const currentDistanceFromRememberedRefuge = rememberedDryRefugeTileId === undefined
    ? undefined
    : gridDistanceBetween(world, band.position, rememberedDryRefugeTileId);
  const driftAllowedByWaterStress = (band.pressureState?.waterStress ?? 0) > REFUGE_DRIFT_ALLOWED_WATER_STRESS;
  const dryRefugeStickiness = abovePullConfidence && dryApproaching && refugeViable && !driftAllowedByWaterStress
    ? round2(strength)
    : 0;
  const refugeReturnPull = round2(dryRefugeStickiness * REFUGE_RETURN_PULL_BASE);
  const refugeDriftPenalty = round2(dryRefugeStickiness * REFUGE_DRIFT_PENALTY_BASE);

  return {
    round,
    currentPhase,
    expectedNextPhase,
    phaseConfidence: round2(phaseConfidence),
    seasonalRoundPull,
    dryApproaching,
    wetSeason,
    rememberedDryRefugeTileId,
    rememberedWetRangeTileIds,
    refugeViable,
    currentDistanceFromRememberedRefuge,
    dryRefugeStickiness,
    refugeReturnPull,
    refugeDriftPenalty,
    driftAllowedByWaterStress,
  };
}

// Pull rewarding holding the remembered dry refuge as the dry season approaches.
// Reinforced by dry-refuge stickiness (PART 2) when the band is already on it.
export function getSeasonalRoundStayPull(
  context: SeasonalRoundScoringContext,
  currentTileId: TileId,
): number {
  if (context.seasonalRoundPull <= 0 || !context.dryApproaching) {
    return 0;
  }

  if (context.rememberedDryRefugeTileId !== currentTileId) {
    return 0;
  }

  return round2(Math.max(context.seasonalRoundPull, context.refugeReturnPull));
}

// Pull rewarding a whole-band relocation back toward the remembered dry refuge.
export function getSeasonalRoundMovePull(
  context: SeasonalRoundScoringContext,
  candidateTileId: TileId,
): number {
  if (context.seasonalRoundPull <= 0 || !context.dryApproaching) {
    return 0;
  }

  return context.rememberedDryRefugeTileId === candidateTileId
    ? round2(Math.max(context.seasonalRoundPull, context.refugeReturnPull))
    : 0;
}

// Penalty (to be subtracted from a move score) for drifting to a NON-refuge tile
// during a dry phase while the remembered refuge is still viable and water is not
// failing. Survival/clearly-better moves outscore it; it only resists casual drift.
export function getSeasonalRoundDriftPenalty(
  context: SeasonalRoundScoringContext,
  candidateTileId: TileId,
): number {
  if (
    context.refugeDriftPenalty <= 0 ||
    !context.dryApproaching ||
    context.rememberedDryRefugeTileId === undefined ||
    context.rememberedDryRefugeTileId === candidateTileId
  ) {
    return 0;
  }

  return context.refugeDriftPenalty;
}

// Pull rewarding outward foraging/probing within the remembered wet range.
export function getSeasonalRoundProbePull(context: SeasonalRoundScoringContext): number {
  if (context.seasonalRoundPull <= 0 || !context.wetSeason) {
    return 0;
  }

  return context.rememberedWetRangeTileIds.length > 0 ? round2(context.seasonalRoundPull * 0.6) : 0;
}

// Update the band's seasonal-round memory after a decision is applied, and build
// the per-tick debug state + bounded timeline entry. Gated to dry-margin bands
// (anchorContext present); other bands keep their existing fields.
export function updateSeasonalRound(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly anchorContext: ResidentialAnchorContext;
  readonly intraSeason: IntraSeasonActivitySummary | undefined;
  readonly scoring: SeasonalRoundScoringContext;
  readonly moved: boolean;
  readonly currentTileId: TileId;
  readonly nextTileId: TileId;
  readonly actionType: string;
}): {
  readonly round: SeasonalRoundMemory;
  readonly state: SeasonalRoundDecisionState;
  readonly timeline: readonly SeasonalTimelineEntry[];
  readonly rotation: RoundCatchmentRotationState | undefined;
} {
  const { world, band, anchorContext, intraSeason, scoring, moved, currentTileId, nextTileId, actionType } = input;
  const anchor = anchorContext.anchor;
  const season = world.time.season;
  const tick = world.time.tick;
  const phase = mapModeToPhase(anchorContext.seasonalModeKind);
  const previous = band.seasonalRound;

  const failed =
    anchor.anchorStatus === "breaking" ||
    anchor.anchorStatus === "trapped" ||
    anchorContext.decision.waterFailureGate;
  const successful = !failed && anchor.anchorWaterSecurity >= 0.45;

  const priorRecord = previous === undefined ? undefined : phaseRecordFor(previous, phase);
  // Dry-refuge stability (2I.5, PART 2): in a dry phase, keep the previously
  // remembered refuge tile rather than overwriting it with wherever the band has
  // drifted — only adopt the current tile as the remembered refuge when its water
  // is clearly better. This is what lets stickiness pull the band back instead of
  // the memory chasing the drift. (Wet phases always track the current range.)
  const preferPriorRefuge =
    DRY_PHASES.has(phase) &&
    priorRecord?.anchorTileId !== undefined &&
    anchor.anchorWaterSecurity <= (priorRecord.expectedWaterSecurity ?? 0) + 0.1;
  const recordAnchorTileId = preferPriorRefuge ? priorRecord.anchorTileId : anchor.anchorTileId;
  const recordTetheringWaterTileId = preferPriorRefuge
    ? priorRecord.tetheringWaterTileId
    : anchor.tetheringWaterTileId;
  const associatedTileIds = [recordAnchorTileId, ...anchor.catchmentTileIds]
    .filter((tileId, index, all) => all.indexOf(tileId) === index)
    .slice(0, MAX_ASSOCIATED_TILES);
  const updatedRecord: SeasonalRoundPhaseRecord = {
    phase,
    preferredSeason: season,
    anchorTileId: recordAnchorTileId,
    tetheringWaterTileId: recordTetheringWaterTileId,
    associatedTileIds,
    expectedWaterSecurity: round2(blend(priorRecord?.expectedWaterSecurity, anchor.anchorWaterSecurity)),
    expectedCatchmentReturn: round2(blend(priorRecord?.expectedCatchmentReturn, anchor.catchmentReturnEstimate)),
    riskMemory: round2(blend(priorRecord?.riskMemory, clamp01(1 - anchor.anchorWaterSecurity))),
    successCount: (priorRecord?.successCount ?? 0) + (successful ? 1 : 0),
    failureCount: (priorRecord?.failureCount ?? 0) + (failed ? 1 : 0),
    confidence: 0,
    reasonIds: [makeRoundReasonId(world.time, band.id, `phase:${phase}`)],
  };
  const observedHolds = Math.max(1, updatedRecord.successCount + updatedRecord.failureCount);
  const recordConfidence = clamp01(
    (updatedRecord.successCount / observedHolds) * 0.6 +
      Math.min(1, observedHolds / 4) * 0.4 -
      (failed ? 0.12 : 0),
  );
  const phaseRecords = mergePhaseRecord(previous?.phaseRecords ?? [], {
    ...updatedRecord,
    confidence: round2(recordConfidence),
  });

  // A wet→dry phase transition closes one dispersal-and-return cycle (counted at
  // most once per dry onset).
  const closedCycle =
    previous !== undefined &&
    WET_PHASES.has(previous.lastPhase) &&
    DRY_PHASES.has(phase) &&
    previous.lastCycleClosedTick !== tick;
  const observedCycleCount = (previous?.observedCycleCount ?? 0) + (closedCycle ? 1 : 0);
  const avgPhaseConfidence = phaseRecords.reduce((sum, record) => sum + record.confidence, 0) /
    Math.max(1, phaseRecords.length);
  const roundConfidence = clamp01(Math.min(1, observedCycleCount / 3) * 0.5 + avgPhaseConfidence * 0.5);
  const confidenceRose = roundConfidence > (previous?.confidence ?? 0) + 0.0001;
  const confidenceFell = roundConfidence < (previous?.confidence ?? 0) - 0.0001;

  const roundReasonIds: ReasonId[] = [
    makeRoundReasonId(world.time, band.id, previous === undefined ? "round:created" : "round:updated"),
  ];

  if (closedCycle) {
    roundReasonIds.push(makeRoundReasonId(world.time, band.id, "round:cycle_repeated"));
  }

  if (confidenceRose) {
    roundReasonIds.push(makeRoundReasonId(world.time, band.id, "round:confidence_increased"));
  } else if (confidenceFell) {
    roundReasonIds.push(makeRoundReasonId(world.time, band.id, "round:confidence_decreased"));
  }

  const round: SeasonalRoundMemory = {
    bandId: band.id,
    roundId: previous?.roundId ?? `round:${band.id}`,
    confidence: round2(roundConfidence),
    lastUpdatedTick: tick,
    observedCycleCount,
    lastPhase: phase,
    lastCycleClosedTick: closedCycle ? tick : previous?.lastCycleClosedTick,
    phaseRecords,
    reasonIds: roundReasonIds,
  };

  const state = buildDecisionState({
    world,
    band,
    scoring,
    phase,
    failed,
    moved,
    currentTileId,
    nextTileId,
    actionType,
    residenceMode: intraSeason?.residenceMode,
  });

  // Round-aware wet-catchment rotation (PART 1): in wet/green phases, rotate which
  // known/associated tiles are foraged so one small catchment is not hammered.
  const rotation = computeWetCatchmentRotation(world, band, anchorContext, round, phase);

  const timelineEntry: SeasonalTimelineEntry = {
    tick,
    season,
    tileId: nextTileId,
    anchorTileId: anchor.anchorTileId,
    residenceMode: intraSeason?.residenceMode,
    phase,
    actionType,
    waterSecurity: anchor.anchorWaterSecurity,
    catchmentReturn: anchor.catchmentReturnEstimate,
    reasonId: state.reasonIds[0],
  };
  const timeline = [...(band.seasonalTimeline ?? []), timelineEntry].slice(-MAX_TIMELINE_ENTRIES);

  return { round, state, timeline, rotation };
}

function buildDecisionState(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly scoring: SeasonalRoundScoringContext;
  readonly phase: SeasonalRoundPhase;
  readonly failed: boolean;
  readonly moved: boolean;
  readonly currentTileId: TileId;
  readonly nextTileId: TileId;
  readonly actionType: string;
  readonly residenceMode: SeasonalResidenceMode | undefined;
}): SeasonalRoundDecisionState {
  const { world, band, scoring, phase, failed, moved, currentTileId, nextTileId, actionType, residenceMode } = input;
  const refuge = scoring.rememberedDryRefugeTileId;

  let outcome: SeasonalRoundOutcome = "none";
  let roundBlockedReason: string | undefined;
  let roundAbandonedReason: string | undefined;

  if (failed && DRY_PHASES.has(phase)) {
    outcome = "abandoned_failure";
    roundAbandonedReason = "water_failure_at_dry_phase";
  } else if (scoring.seasonalRoundPull > 0 && scoring.dryApproaching && refuge !== undefined) {
    const atRefuge = nextTileId === refuge;
    const reachable = currentTileId === refuge || isAdjacentTile(world, currentTileId, refuge);

    if (atRefuge || (!moved && currentTileId === refuge)) {
      outcome = "followed";
    } else if (!reachable && !moved) {
      outcome = "blocked_passability";
      roundBlockedReason = "remembered_refuge_not_reachable_in_one_move";
    } else {
      outcome = "ignored";
    }
  } else if (scoring.seasonalRoundPull > 0 && scoring.wetSeason) {
    const dispersing =
      residenceMode === "dispersed_wet_season_round" ||
      actionType === "logistical_probe" ||
      actionType === "explore_unknown_neighbor" ||
      moved;
    outcome = dispersing ? "followed" : "ignored";
  } else if (scoring.round !== undefined) {
    outcome = "ignored";
  }

  const reasonIds: ReasonId[] = [makeRoundReasonId(world.time, band.id, `outcome:${outcome}`)];

  if (scoring.dryRefugeStickiness > 0) {
    reasonIds.push(makeRoundReasonId(world.time, band.id, "stickiness:dry_refuge"));

    if (!moved && currentTileId === refuge) {
      reasonIds.push(makeRoundReasonId(world.time, band.id, "stickiness:refuge_still_viable"));
    } else if (scoring.refugeReturnPull > 0 && nextTileId === refuge) {
      reasonIds.push(makeRoundReasonId(world.time, band.id, "stickiness:return_pull"));
    } else if (moved && refuge !== undefined && nextTileId !== refuge) {
      reasonIds.push(makeRoundReasonId(world.time, band.id, "stickiness:drift_penalty"));
    }
  } else if (scoring.driftAllowedByWaterStress && DRY_PHASES.has(phase)) {
    reasonIds.push(makeRoundReasonId(world.time, band.id, "stickiness:drift_allowed_water"));
  }

  if (outcome === "blocked_passability") {
    reasonIds.push(makeRoundReasonId(world.time, band.id, "stickiness:return_blocked"));
  }

  return {
    bandId: band.id,
    currentPhase: phase,
    expectedNextPhase: scoring.expectedNextPhase,
    phaseConfidence: scoring.phaseConfidence,
    seasonalRoundPull: scoring.seasonalRoundPull,
    rememberedDryRefugeTileId: refuge,
    rememberedWetRangeTileIds: scoring.rememberedWetRangeTileIds,
    outcome,
    roundBlockedReason,
    roundAbandonedReason,
    currentDistanceFromRememberedRefuge: scoring.currentDistanceFromRememberedRefuge,
    dryRefugeStickiness: scoring.dryRefugeStickiness,
    refugeReturnPull: scoring.refugeReturnPull,
    refugeDriftPenalty: scoring.refugeDriftPenalty,
    refugeViable: scoring.refugeViable,
    reasonIds,
  };
}

interface RotationCandidate {
  readonly tileId: TileId;
  readonly depletion: number;
  readonly recentUse: number;
  readonly associated: boolean;
  readonly score: number;
}

// Rotate wet/green-phase foraging across known/associated tiles (PART 1). Builds
// a bounded candidate set from the anchor catchment + remembered wet-range tiles,
// then prefers fresher (less-depleted, not-recently-used, non-risky) tiles so the
// band stops hammering one small catchment. Uses only known tiles — no hidden
// truth, no map scan.
function computeWetCatchmentRotation(
  world: WorldState,
  band: Band,
  anchorContext: ResidentialAnchorContext,
  round: SeasonalRoundMemory,
  phase: SeasonalRoundPhase,
): RoundCatchmentRotationState | undefined {
  if (!WET_PHASES.has(phase)) {
    return undefined;
  }

  const anchor = anchorContext.anchor;
  const anchorTile = getTile(world, anchor.anchorTileId);

  if (anchorTile === undefined) {
    return undefined;
  }

  const wetRange = collectWetRangeTiles(round);
  const candidateIds = [...new Set<TileId>([...anchor.catchmentTileIds, ...wetRange])]
    .filter((tileId) => tileId !== anchor.anchorTileId)
    .slice(0, MAX_ROTATION_CANDIDATES);
  const wetRangeSet = new Set(wetRange);
  const candidates: RotationCandidate[] = [];
  let avoidedDepleted = 0;

  for (const tileId of candidateIds) {
    const record = band.knowledge.observedTiles[tileId];
    const tile = getTile(world, tileId);

    if (record === undefined || tile === undefined || tile.isAquatic || !isBandPassableDestination(tile)) {
      continue;
    }

    if (gridDistance(anchorTile, tile) > anchor.logisticalRadius) {
      continue;
    }

    const memory = band.placeMemory[tileId];
    const risky = memory !== undefined &&
      (memory.valences.includes("risky") ||
        memory.valences.includes("avoid_place") ||
        memory.valences.includes("depleted"));
    const depletion = getLocalUsePressureValue(band.usePressure[tileId]);
    const recentUse = band.usePressure[tileId]?.recentUseIntensity ?? 0;

    if (depletion > 0.55) {
      avoidedDepleted += 1;
    }

    const associated = wetRangeSet.has(tileId);
    const score = clamp01(
      (1 - depletion) * 0.6 +
        (associated ? 0.2 : 0) -
        recentUse * 0.3 -
        (risky ? 0.3 : 0),
    );

    candidates.push({ tileId, depletion, recentUse, associated, score });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  const ranked = [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return String(left.tileId).localeCompare(String(right.tileId));
  });
  const selectCount = Math.min(MAX_ROTATION_SELECTED, Math.max(1, anchor.catchmentTileIds.length));
  const selected = ranked.slice(0, selectCount).map((candidate) => candidate.tileId);
  const recentlyUsed = candidates
    .filter((candidate) => candidate.recentUse > 0.3)
    .sort((left, right) => right.recentUse - left.recentUse)
    .slice(0, MAX_ROTATION_SELECTED)
    .map((candidate) => candidate.tileId);
  const rotationPressure = round2(clamp01(anchor.catchmentDepletion));
  const depletionAvoidance = round2(clamp01(avoidedDepleted / Math.max(1, candidates.length)));

  const reasonIds: ReasonId[] = [makeRoundReasonId({ tick: round.lastUpdatedTick } as WorldTime, band.id, "rotation")];

  if (phase === "green_harvest") {
    reasonIds.push(makeRoundReasonId({ tick: round.lastUpdatedTick } as WorldTime, band.id, "rotation:green_harvest"));
  } else {
    reasonIds.push(makeRoundReasonId({ tick: round.lastUpdatedTick } as WorldTime, band.id, "rotation:wet_range"));
  }

  if (avoidedDepleted > 0) {
    reasonIds.push(makeRoundReasonId({ tick: round.lastUpdatedTick } as WorldTime, band.id, "rotation:depleted_avoided"));
  }

  if (recentlyUsed.length > 0) {
    reasonIds.push(makeRoundReasonId({ tick: round.lastUpdatedTick } as WorldTime, band.id, "rotation:recent_reduced"));
  }

  return {
    bandId: band.id,
    roundId: round.roundId,
    phase,
    candidateTileIds: candidates.map((candidate) => candidate.tileId),
    recentlyUsedTileIds: recentlyUsed,
    selectedCatchmentTileIds: selected,
    rotationPressure,
    depletionAvoidance,
    confidence: round.confidence,
    reasonIds,
  };
}

// The band's best proven dry refuge from anchor memory (2I.3): the tile it has
// most reliably held in dry seasons. Stable across casual residence drift.
function bestRememberedRefugeFromMemory(band: Band): TileId | undefined {
  const memories = band.anchorMemories;

  if (memories === undefined) {
    return undefined;
  }

  return Object.values(memories)
    .filter(
      (memory) =>
        memory.successfulHoldCount > memory.failedHoldCount &&
        memory.drySeasonReliability >= REFUGE_VIABLE_MIN_WATER,
    )
    .sort((left, right) => {
      if (right.drySeasonReliability !== left.drySeasonReliability) {
        return right.drySeasonReliability - left.drySeasonReliability;
      }

      return String(left.tileId).localeCompare(String(right.tileId));
    })[0]?.tileId;
}

function isRememberedRefugeViable(
  world: WorldState,
  band: Band,
  refugeTileId: TileId | undefined,
): boolean {
  if (refugeTileId === undefined) {
    return false;
  }

  const record = band.knowledge.observedTiles[refugeTileId];
  const tile = getTile(world, refugeTileId);

  if (record === undefined || tile === undefined || !isBandPassableDestination(tile)) {
    return false;
  }

  const memory = band.placeMemory[refugeTileId];
  const failed = memory !== undefined && memory.valences.includes("avoid_place");

  if (failed) {
    return false;
  }

  // Viable if the tile itself has acceptable water, OR the band has proven (via
  // anchor memory) that holding here is reliable — e.g. residing next to a good
  // tethering water source even when the residence tile's own water is modest.
  const provenReliable = (band.anchorMemories?.[refugeTileId]?.drySeasonReliability ?? 0) >= 0.45;

  return provenReliable || (record.observedWaterAccess ?? 0) >= REFUGE_VIABLE_MIN_WATER;
}

function gridDistanceBetween(world: WorldState, fromTileId: TileId, toTileId: TileId): number | undefined {
  const from = getTile(world, fromTileId);
  const to = getTile(world, toTileId);

  return from === undefined || to === undefined ? undefined : gridDistance(from, to);
}

function gridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function mergePhaseRecord(
  records: readonly SeasonalRoundPhaseRecord[],
  updated: SeasonalRoundPhaseRecord,
): readonly SeasonalRoundPhaseRecord[] {
  const others = records.filter((record) => record.phase !== updated.phase);

  return [...others, updated].sort((left, right) => left.phase.localeCompare(right.phase));
}

function phaseRecordFor(
  round: SeasonalRoundMemory,
  phase: SeasonalRoundPhase,
): SeasonalRoundPhaseRecord | undefined {
  return round.phaseRecords.find((record) => record.phase === phase);
}

function bestDryRefugePhase(round: SeasonalRoundMemory): SeasonalRoundPhaseRecord | undefined {
  return round.phaseRecords
    .filter((record) => DRY_PHASES.has(record.phase) && record.anchorTileId !== undefined)
    .sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return String(left.anchorTileId).localeCompare(String(right.anchorTileId));
    })[0];
}

function collectWetRangeTiles(round: SeasonalRoundMemory): readonly TileId[] {
  const tiles = new Set<TileId>();

  for (const record of round.phaseRecords) {
    if (!WET_PHASES.has(record.phase)) {
      continue;
    }

    for (const tileId of record.associatedTileIds) {
      tiles.add(tileId);
    }
  }

  return [...tiles].slice(0, MAX_ASSOCIATED_TILES);
}

function mapModeToPhase(mode: DryMarginSeasonalMode | undefined): SeasonalRoundPhase {
  switch (mode) {
    case "wet_season_dispersal":
      return "wet_dispersal";
    case "green_season_harvest":
      return "green_harvest";
    case "dry_season_consolidation":
      return "dry_refuge_return";
    case "late_dry_refuge":
      return "late_dry_hold";
    case "drought_emergency":
      return "drought_escape";
    default:
      return "transition";
  }
}

function phaseForSeason(season: Season): SeasonalRoundPhase {
  switch (season) {
    case "spring":
      return "wet_dispersal";
    case "summer":
      return "dry_refuge_return";
    case "autumn":
      return "late_dry_hold";
    default:
      return "transition";
  }
}

function nextSeason(season: Season): Season {
  switch (season) {
    case "spring":
      return "summer";
    case "summer":
      return "autumn";
    case "autumn":
      return "winter";
    default:
      return "spring";
  }
}

function isAdjacentTile(world: WorldState, fromTileId: TileId, toTileId: TileId): boolean {
  if (fromTileId === toTileId) {
    return true;
  }

  const tile = getTile(world, fromTileId);

  return tile !== undefined && tile.neighbors.includes(toTileId);
}

function blend(previous: number | undefined, current: number): number {
  return previous === undefined ? current : previous * 0.7 + current * 0.3;
}

function makeRoundReasonId(time: WorldTime, bandId: string, suffix: string): ReasonId {
  return `reason:${bandId}:${time.tick}:round:${suffix}` as ReasonId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
