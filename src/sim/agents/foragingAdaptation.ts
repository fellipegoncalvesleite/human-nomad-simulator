import type { BandId, ReasonId, TickNumber, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import { getTile } from "../world/generate";
import { isBandPassableDestination } from "../world/passability";
import type { Tile, WorldState } from "../world/types";
import type { ResourceClassId } from "./resourceClasses";
import {
  effectiveResourceConfidence,
  type ResourceKnowledgeState,
  type ResourceKnowledgeStateKind,
  type ResourcePatchMemory,
} from "./resourceKnowledge";
import type {
  Band,
  EmpiricalResourceLearningRecord,
  FallbackDietCandidate,
  FallbackDietExpansionLevel,
  ForagingAdaptationBehavior,
  ForagingAdaptationMode,
  ForagingLearningAdaptationState,
  ForagingTripFailureMemory,
  IntraSeasonTripActivityResult,
  IntraSeasonTripRecord,
  NearbyForagingOpportunityProbe,
  TripAdaptationAction,
} from "./types";

const LEARNING_RECORD_CAP = 10;
const FALLBACK_CANDIDATE_CAP = 6;
const TRIP_FAILURE_CAP = 6;
const NEARBY_PROBE_CAP = 5;
const CANDIDATE_TILE_CAP = 18;
const EMPIRICAL_LOCAL_DISTANCE = 4;
const PEACEFUL_FISSION_POPULATION_THRESHOLD = 46;

interface ForagingAdaptationDerivation {
  readonly state: ForagingLearningAdaptationState;
  readonly resourceKnowledgeState?: ResourceKnowledgeState;
}

interface TripFailureAccumulator {
  readonly key: string;
  readonly tileId: TileId;
  readonly resourceClassId?: ResourceClassId;
  readonly taskGroupType: IntraSeasonTripRecord["taskGroupType"];
  readonly trips: readonly IntraSeasonTripRecord[];
}

export function applyForagingLearningAdaptationContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((bandsById, band) => {
      const derivation = deriveForagingLearningAdaptation(world, band);
      bandsById[String(band.id)] = {
        ...band,
        resourceKnowledgeState: derivation.resourceKnowledgeState ?? band.resourceKnowledgeState,
        foragingAdaptation: derivation.state,
      };

      return bandsById;
    }, {});

  return {
    ...world,
    bands: bands as Readonly<Record<BandId, Band>>,
  };
}

export function deriveForagingLearningAdaptation(
  world: WorldState,
  band: Band,
): ForagingAdaptationDerivation {
  const hungerSeverity = deriveHungerSeverity(band);
  const prior = band.foragingAdaptation;
  const hungerStreak = hungerSeverity >= 0.28
    ? Math.min(48, (prior?.hungerStreak ?? 0) + 1)
    : 0;
  const recoverySignal = deriveRecoverySignal(band, hungerSeverity);
  const learningBase = deriveEmpiricalLearningRecords(world, band, hungerSeverity);
  const resourceKnowledgeState = applyEmpiricalLearningToResourceKnowledge(world, band, learningBase.records);
  const learningRecords = learningBase.records;
  const fallbackCandidates = deriveFallbackCandidates(world, band, hungerSeverity, learningRecords);
  const tripFailureMemories = deriveTripFailureMemories(band);
  const nearbyOpportunityProbes = deriveNearbyOpportunityProbes(world, band);
  const mode = deriveAdaptationMode({
    hungerSeverity,
    hungerStreak,
    recoverySignal,
    fallbackCandidates,
    tripFailureMemories,
    nearbyOpportunityProbes,
    priorMode: prior?.mode,
  });
  const crisisBreakaway = deriveCrisisBreakawayState(
    world,
    band,
    hungerSeverity,
    hungerStreak,
    fallbackCandidates,
    tripFailureMemories,
    nearbyOpportunityProbes,
  );
  const behavior = deriveBehaviorHooks(
    mode,
    hungerSeverity,
    hungerStreak,
    fallbackCandidates,
    tripFailureMemories,
    nearbyOpportunityProbes,
    crisisBreakaway.pressure,
    recoverySignal,
    band,
  );
  const knowledgeUpdatedTileIds = learningBase.knowledgeUpdatedTileIds;
  const capsHeld =
    learningRecords.length <= LEARNING_RECORD_CAP &&
    fallbackCandidates.length <= FALLBACK_CANDIDATE_CAP &&
    tripFailureMemories.length <= TRIP_FAILURE_CAP &&
    nearbyOpportunityProbes.length <= NEARBY_PROBE_CAP;
  const reasonIds = uniqueReasonIds([
    ...learningRecords.flatMap((record) => record.reasonIds),
    ...fallbackCandidates.flatMap((candidate) => candidate.reasonIds),
    ...tripFailureMemories.flatMap((memory) => memory.reasonIds),
    ...nearbyOpportunityProbes.flatMap((probe) => probe.reasonIds),
    ...crisisBreakaway.reasonIds,
  ]).slice(0, 20);

  return {
    state: {
      bandId: band.id,
      lastUpdatedTick: world.time.tick,
      mode,
      hungerSeverity: round2(hungerSeverity),
      hungerStreak,
      recoverySignal: round2(recoverySignal),
      learningRecords,
      fallbackCandidates,
      tripFailureMemories,
      nearbyOpportunityProbes,
      behavior,
      crisisBreakaway,
      knowledgeUpdatedTileIds,
      learningRecordCap: LEARNING_RECORD_CAP,
      fallbackCandidateCap: FALLBACK_CANDIDATE_CAP,
      tripFailureCap: TRIP_FAILURE_CAP,
      nearbyProbeCap: NEARBY_PROBE_CAP,
      candidateTileCap: CANDIDATE_TILE_CAP,
      antiOmniscience: {
        fromBandKnownTilesOnly: true,
        hiddenPatchTruthUsed: false,
        hiddenBandTruthUsed: false,
        unseenPatchesRemainUnknown: true,
      },
      capsHeld,
      noCultureLadder: true,
      noAgriculture: true,
      noVillageSedentism: true,
      noStorageEconomy: true,
      noNamedPeople: true,
      noWarTerritory: true,
      reasonIds,
    },
    resourceKnowledgeState,
  };
}

function deriveEmpiricalLearningRecords(
  world: WorldState,
  band: Band,
  hungerSeverity: number,
): { readonly records: readonly EmpiricalResourceLearningRecord[]; readonly knowledgeUpdatedTileIds: readonly TileId[] } {
  const origin = getTile(world, band.position);
  const memories = band.resourceKnowledgeState?.patchMemories ?? [];
  const records = memories
    .map((memory) => deriveLearningRecord(world, band, origin, memory, hungerSeverity))
    .filter((record): record is EmpiricalResourceLearningRecord => record !== undefined)
    .sort(compareLearningRecords)
    .slice(0, LEARNING_RECORD_CAP);
  const knowledgeUpdatedTileIds = records
    .filter((record) => shouldImproveMemoryState(record))
    .map((record) => record.tileId)
    .filter((tileId, index, tileIds) => tileIds.indexOf(tileId) === index)
    .slice(0, LEARNING_RECORD_CAP);

  return { records, knowledgeUpdatedTileIds };
}

function deriveLearningRecord(
  world: WorldState,
  band: Band,
  origin: Tile | undefined,
  memory: ResourcePatchMemory,
  hungerSeverity: number,
): EmpiricalResourceLearningRecord | undefined {
  const record = band.knowledge.observedTiles[memory.approximateTile];
  const tile = getTile(world, memory.approximateTile);

  if (record === undefined || tile === undefined || origin === undefined) {
    return undefined;
  }

  const distanceTiles = getGridDistance(origin, tile);

  if (distanceTiles > EMPIRICAL_LOCAL_DISTANCE && memory.useHistory.visits === 0 && record.visits < 2) {
    return undefined;
  }

  const currentTick = Number(world.time.tick);
  const effective = effectiveResourceConfidence(memory, currentTick);
  const place = band.placeMemory[memory.approximateTile];
  const tripCount = (band.recentIntraSeasonTrips ?? []).filter((trip) => trip.targetTileId === memory.approximateTile).length;
  const proximityCount = record.visits + (place?.visitCount ?? 0) + tripCount + (distanceTiles <= 2 ? 1 : 0);
  const testCount =
    memory.useHistory.visits +
    (memory.learning?.confirmationCount ?? 0) +
    (memory.learning?.contradictionCount ?? 0) +
    (memory.plantObservation?.observationCount ?? 0);
  const confidence = clamp01(
    effective.effectivePresenceConfidence * 0.36 +
      effective.effectiveYieldConfidence * 0.22 +
      effective.effectiveSafetyConfidence * 0.18 +
      record.confidence * 0.16 +
      Math.min(0.18, proximityCount * 0.018 + testCount * 0.014),
  );
  const riskHigh = isRiskyMemory(memory);
  const fallbackStatus = deriveFallbackStatus(memory.resourceClassId, hungerSeverity, confidence, riskHigh);
  const status = deriveLearningStatus(memory, confidence, proximityCount, testCount, riskHigh);
  const reasonIds = [
    makeAdaptationReasonId(band.id, world.time.tick, "learning", memory.approximateTile, memory.resourceClassId),
    ...memory.reasonIds.slice(0, 3),
  ];

  return {
    tileId: memory.approximateTile,
    resourceClassId: memory.resourceClassId,
    status,
    knowledgeState: memory.state,
    source: memory.source,
    proximityCount,
    visitCount: record.visits + memory.useHistory.visits,
    testCount,
    observedSeasons: uniqueSeasons([...record.seasonsObserved, ...memory.seasonality.bestSeasons, ...memory.seasonality.badSeasons]),
    confidence: round2(confidence),
    fallbackStatus,
    riskStatus: deriveRiskStatus(memory, riskHigh),
    gatedReason: deriveGatedReason(memory, status, confidence, riskHigh),
    unlockHint: deriveUnlockHint(memory, status, riskHigh),
    reasonIds,
  };
}

function applyEmpiricalLearningToResourceKnowledge(
  world: WorldState,
  band: Band,
  records: readonly EmpiricalResourceLearningRecord[],
): ResourceKnowledgeState | undefined {
  const state = band.resourceKnowledgeState;

  if (state === undefined || records.length === 0) {
    return undefined;
  }

  const recordsByTile = records.reduce<Record<string, EmpiricalResourceLearningRecord>>((output, record) => {
    output[String(record.tileId)] = record;
    return output;
  }, {});
  let changed = false;
  const patchMemories = state.patchMemories.map((memory) => {
    const record = recordsByTile[String(memory.approximateTile)];

    if (record === undefined || !shouldImproveMemoryState(record)) {
      return memory;
    }

    const riskHigh = record.riskStatus === "high" || record.riskStatus === "known_risk";
    const nextState: ResourceKnowledgeStateKind = riskHigh
      ? "risky"
      : record.status === "known_poor"
        ? "seasonally_bad"
        : record.status === "known_useful"
          ? "observed"
          : memory.state === "unknown" || memory.state === "suspected"
            ? "observed"
            : memory.state;
    const confidenceLift = clamp01(Math.min(0.12, record.proximityCount * 0.01 + record.testCount * 0.008));
    const nextMemory: ResourcePatchMemory = {
      ...memory,
      state: nextState,
      confidence: {
        ...memory.confidence,
        presenceConfidence: round2(Math.max(memory.confidence.presenceConfidence, Math.min(0.82, record.confidence + confidenceLift * 0.28))),
        seasonConfidence: round2(Math.max(memory.confidence.seasonConfidence, Math.min(0.72, memory.confidence.seasonConfidence + confidenceLift * 0.5))),
        yieldConfidence: round2(Math.max(memory.confidence.yieldConfidence, Math.min(0.66, memory.confidence.yieldConfidence + confidenceLift * 0.35))),
        safetyConfidence: riskHigh
          ? memory.confidence.safetyConfidence
          : round2(Math.max(memory.confidence.safetyConfidence, Math.min(0.72, memory.confidence.safetyConfidence + confidenceLift * 0.28))),
      },
      learning: {
        lastOutcome: riskHigh ? "safety_risk_detected" : "confirmed_present",
        lastContradictionKind: "partial_confirmation",
        lastOutcomeTick: world.time.tick,
        lastFailedTick: memory.learning?.lastFailedTick,
        confirmationCount: (memory.learning?.confirmationCount ?? 0) + 1,
        contradictionCount: memory.learning?.contradictionCount ?? 0,
        partialConfirmationCount: (memory.learning?.partialConfirmationCount ?? 0) + 1,
        noInfoCount: memory.learning?.noInfoCount ?? 0,
        falseInferenceCount: memory.learning?.falseInferenceCount ?? 0,
        seasonalMismatchCount: memory.learning?.seasonalMismatchCount ?? 0,
      },
      lastNotedTick: world.time.tick,
      reasonIds: uniqueReasonIds([
        ...memory.reasonIds,
        makeAdaptationReasonId(band.id, world.time.tick, "empirical-knowledge-update", memory.approximateTile, memory.resourceClassId),
      ]).slice(-8),
    };
    changed = true;

    return nextMemory;
  });

  return changed ? { ...state, patchMemories } : undefined;
}

function deriveFallbackCandidates(
  world: WorldState,
  band: Band,
  hungerSeverity: number,
  learningRecords: readonly EmpiricalResourceLearningRecord[],
): readonly FallbackDietCandidate[] {
  if (hungerSeverity < 0.18) {
    return [];
  }

  const records = learningRecords
    .filter((record) => isFoodOrFallbackClass(record.resourceClassId))
    .map((record) => deriveFallbackCandidate(world, band, record, hungerSeverity))
    .filter((candidate): candidate is FallbackDietCandidate => candidate !== undefined);
  const storageCards = (band.resourceEcology?.storageSuitabilityCards ?? [])
    .map((card) => {
      const resourceClassId = toResourceClassId(card.classId);

      if (resourceClassId === undefined || !isFoodOrFallbackClass(resourceClassId)) {
        return undefined;
      }

      const tileId = card.sourceTileIds[0] ?? band.position;
      const existing = records.find((candidate) => candidate.tileId === tileId && candidate.resourceClassId === resourceClassId);

      if (existing !== undefined) {
        return existing;
      }

      const syntheticRecord: EmpiricalResourceLearningRecord = {
        tileId,
        resourceClassId,
        status: card.riskIfMishandled === "high" ? "cautiously_known" : "watched",
        knowledgeState: "observed",
        source: "storage_suitability_card",
        proximityCount: 1,
        visitCount: 1,
        testCount: 0,
        observedSeasons: [world.time.season],
        confidence: card.storageConfidence,
        fallbackStatus: "candidate",
        riskStatus: card.riskIfMishandled === "high" ? "high" : "moderate",
        gatedReason: "storage or processing evidence is known but not a food bank",
        unlockHint: "needs ordinary use or cautious testing",
        reasonIds: [makeAdaptationReasonId(band.id, world.time.tick, "storage-fallback", tileId, resourceClassId)],
      };

      return deriveFallbackCandidate(world, band, syntheticRecord, hungerSeverity);
    })
    .filter((candidate): candidate is FallbackDietCandidate => candidate !== undefined);

  return [...dedupeFallbackCandidates([...records, ...storageCards])]
    .sort(compareFallbackCandidates)
    .slice(0, FALLBACK_CANDIDATE_CAP);
}

function deriveFallbackCandidate(
  world: WorldState,
  band: Band,
  record: EmpiricalResourceLearningRecord,
  hungerSeverity: number,
): FallbackDietCandidate | undefined {
  const costs = getFallbackCosts(record.resourceClassId, record.riskStatus);
  const level = deriveFallbackLevel(hungerSeverity, record, costs.riskCost);

  if (level === "none") {
    return undefined;
  }

  const expectedUsefulness = clamp01(
    record.confidence * 0.42 +
      hungerSeverity * 0.36 +
      fallbackClassBaseUsefulness(record.resourceClassId) -
      costs.laborCost * 0.12 -
      costs.riskCost * 0.16 -
      costs.dietQualityPenalty * 0.08,
  );

  return {
    tileId: record.tileId,
    resourceClassId: record.resourceClassId,
    level,
    laborCost: round2(costs.laborCost),
    riskCost: round2(costs.riskCost),
    dietQualityPenalty: round2(costs.dietQualityPenalty),
    confidence: record.confidence,
    expectedUsefulness: round2(expectedUsefulness),
    reason: fallbackReason(record.resourceClassId, level, record.riskStatus),
    reasonIds: [
      makeAdaptationReasonId(band.id, world.time.tick, "fallback", record.tileId, record.resourceClassId),
      ...record.reasonIds.slice(0, 2),
    ],
  };
}

function deriveTripFailureMemories(band: Band): readonly ForagingTripFailureMemory[] {
  const recentTrips = (band.recentIntraSeasonTrips ?? []).slice(-24);
  const accumulators = recentTrips.reduce<Record<string, TripFailureAccumulator>>((output, trip) => {
    const key = `${String(trip.targetTileId)}:${trip.resourceClassId ?? "unknown"}:${trip.taskGroupType}`;
    const existing = output[key];
    output[key] = existing === undefined
      ? {
          key,
          tileId: trip.targetTileId,
          resourceClassId: trip.resourceClassId,
          taskGroupType: trip.taskGroupType,
          trips: [trip],
        }
      : {
          ...existing,
          trips: [...existing.trips, trip],
        };

    return output;
  }, {});

  return Object.values(accumulators)
    .map((accumulator) => deriveTripFailureMemory(accumulator))
    .filter((memory): memory is ForagingTripFailureMemory => memory !== undefined)
    .sort(compareTripFailureMemories)
    .slice(0, TRIP_FAILURE_CAP);
}

function deriveTripFailureMemory(accumulator: TripFailureAccumulator): ForagingTripFailureMemory | undefined {
  if (accumulator.trips.length < 2) {
    return undefined;
  }

  const failureCount = accumulator.trips.filter((trip) => isTripFailure(trip.activityOutcome)).length;
  const lowReturnCount = accumulator.trips.filter((trip) =>
    trip.resourceReturn.returnedResourceKind.endsWith("_placeholder") &&
    trip.resourceReturn.estimatedReturnValue < 0.045,
  ).length;
  const successCount = accumulator.trips.filter((trip) => isTripSuccess(trip.activityOutcome)).length;
  const meanReturn = accumulator.trips.reduce((sum, trip) => sum + trip.resourceReturn.estimatedReturnValue, 0) / accumulator.trips.length;
  const longestDistanceTiles = Math.max(...accumulator.trips.map((trip) => trip.distanceTiles));
  const failureRate = (failureCount + lowReturnCount * 0.55) / accumulator.trips.length;
  const confidencePenalty = clamp01(failureRate * 0.2 + (longestDistanceTiles >= 7 ? 0.05 : 0) - successCount * 0.025);
  const action = deriveTripAction(accumulator.trips.length, failureCount, lowReturnCount, successCount, longestDistanceTiles, meanReturn);

  if (action === "continue" && confidencePenalty < 0.04) {
    return undefined;
  }

  return {
    tileId: accumulator.tileId,
    resourceClassId: accumulator.resourceClassId,
    taskGroupType: accumulator.taskGroupType,
    recentTripCount: accumulator.trips.length,
    failureCount,
    lowReturnCount,
    successCount,
    longestDistanceTiles,
    meanReturn: round2(clamp01(meanReturn)),
    confidencePenalty: round2(confidencePenalty),
    action,
    restTicksSuggested: action === "abandon_temporarily" ? 8 : action === "reduce_confidence" ? 4 : 2,
    recoveredBySuccess: action === "recovering_after_success",
    reasonIds: uniqueReasonIds(accumulator.trips.flatMap((trip) => trip.activityOutcomeReasonIds)).slice(0, 6),
  };
}

function deriveNearbyOpportunityProbes(
  world: WorldState,
  band: Band,
): readonly NearbyForagingOpportunityProbe[] {
  const origin = getTile(world, band.position);

  if (origin === undefined) {
    return [];
  }

  const currentRecord = band.knowledge.observedTiles[band.position];
  const currentPotential = currentRecord === undefined
    ? 0.42
    : clamp01(currentRecord.observedRichness * 0.58 + currentRecord.observedAquaticPotential * 0.24 + (currentRecord.observedWaterAccess ?? 0.32) * 0.18);
  const currentOverCapacity = clamp01(
    Math.max(
      band.rangeSaturation?.saturationPressure ?? 0,
      band.pressureState?.foodStress ?? 0,
      band.pressureState?.crowdingPenalty ?? 0,
      band.perCapitaReturn === undefined ? 0 : 0.55 - band.perCapitaReturn.perCapitaReturn,
    ),
  );
  const candidates = Object.values(band.knowledge.observedTiles)
    .sort(compareKnownRecords)
    .slice(0, CANDIDATE_TILE_CAP)
    .map((record) => deriveNearbyProbe(world, band, origin, currentPotential, currentOverCapacity, record.tileId))
    .filter((probe): probe is NearbyForagingOpportunityProbe => probe !== undefined);
  const gradient = band.nearbyOpportunity;
  const gradientProbe = gradient?.bestKnownOpportunityTileId === undefined
    ? undefined
    : deriveNearbyProbe(world, band, origin, currentPotential, currentOverCapacity, gradient.bestKnownOpportunityTileId);

  return [...dedupeNearbyProbes(gradientProbe === undefined ? candidates : [gradientProbe, ...candidates])]
    .sort(compareNearbyProbes)
    .slice(0, NEARBY_PROBE_CAP);
}

function deriveNearbyProbe(
  world: WorldState,
  band: Band,
  origin: Tile,
  currentPotential: number,
  currentOverCapacity: number,
  tileId: TileId,
): NearbyForagingOpportunityProbe | undefined {
  if (tileId === band.position) {
    return undefined;
  }

  const record = band.knowledge.observedTiles[tileId];
  const tile = getTile(world, tileId);

  if (record === undefined || tile === undefined || !isBandPassableDestination(tile)) {
    return undefined;
  }

  const distanceTiles = getGridDistance(origin, tile);

  if (distanceTiles <= 0 || distanceTiles > 6) {
    return undefined;
  }

  const candidatePotential = clamp01(
    record.observedRichness * 0.6 +
      record.observedAquaticPotential * 0.22 +
      (record.observedWaterAccess ?? 0.24) * 0.18,
  );
  const relativeOpportunity = clamp01(candidatePotential - currentPotential + currentOverCapacity * 0.28);

  if (relativeOpportunity <= 0.06) {
    return undefined;
  }

  const riskPenalty = clamp01(record.observedRisk ?? 0.34);
  const distancePenalty = clamp01(distanceTiles / 8);
  const probeReadiness = clamp01(
    relativeOpportunity * 0.72 +
      currentOverCapacity * 0.26 +
      record.confidence * 0.12 -
      riskPenalty * 0.2 -
      distancePenalty * 0.16,
  );
  const comparison = distanceTiles <= 3 && probeReadiness >= 0.16
    ? "nearby_probe"
    : distanceTiles <= 4
      ? "not_enough_known"
      : "distant_wait";

  return {
    tileId,
    distanceTiles,
    relativeOpportunity: round2(relativeOpportunity),
    probeReadiness: round2(probeReadiness),
    currentOverCapacity: round2(currentOverCapacity),
    riskPenalty: round2(riskPenalty),
    distancePenalty: round2(distancePenalty),
    confidence: round2(record.confidence),
    comparison,
    reasonIds: [makeAdaptationReasonId(band.id, world.time.tick, "nearby-probe", tileId, "known_tile")],
  };
}

function deriveAdaptationMode(input: {
  readonly hungerSeverity: number;
  readonly hungerStreak: number;
  readonly recoverySignal: number;
  readonly fallbackCandidates: readonly FallbackDietCandidate[];
  readonly tripFailureMemories: readonly ForagingTripFailureMemory[];
  readonly nearbyOpportunityProbes: readonly NearbyForagingOpportunityProbe[];
  readonly priorMode?: ForagingAdaptationMode;
}): ForagingAdaptationMode {
  if (input.recoverySignal >= 0.32 && input.hungerSeverity < 0.34 && (input.priorMode === "hungry" || input.priorMode === "desperate" || input.priorMode === "pressured")) {
    return "recovering";
  }

  if (input.hungerSeverity >= 0.72 || (input.hungerSeverity >= 0.56 && input.hungerStreak >= 8)) {
    return "desperate";
  }

  if (input.hungerSeverity >= 0.46 || input.fallbackCandidates.some((candidate) => candidate.level === "expanded" || candidate.level === "emergency")) {
    return "hungry";
  }

  if (
    input.hungerSeverity >= 0.24 ||
    input.tripFailureMemories.some((memory) => memory.action === "reduce_confidence" || memory.action === "abandon_temporarily") ||
    input.nearbyOpportunityProbes.some((probe) => probe.comparison === "nearby_probe")
  ) {
    return "pressured";
  }

  return "stable";
}

function deriveBehaviorHooks(
  mode: ForagingAdaptationMode,
  hungerSeverity: number,
  hungerStreak: number,
  fallbackCandidates: readonly FallbackDietCandidate[],
  tripFailureMemories: readonly ForagingTripFailureMemory[],
  nearbyOpportunityProbes: readonly NearbyForagingOpportunityProbe[],
  crisisBreakawayPressure: number,
  recoverySignal: number,
  band: Band,
): ForagingAdaptationBehavior {
  const fallbackExpansionBias = clampHook(
    fallbackCandidates.length === 0 ? 0 : hungerSeverity * 0.16 + fallbackCandidates[0].expectedUsefulness * 0.08,
    recoverySignal,
  );
  const tripAbandonmentBias = clampHook(
    tripFailureMemories.reduce((max, memory) => Math.max(max, memory.confidencePenalty), 0) * 0.75,
    recoverySignal * 0.4,
  );
  const nearbyProbeBias = clampHook(
    nearbyOpportunityProbes.reduce((max, probe) => Math.max(max, probe.probeReadiness), 0) * 0.55,
    recoverySignal * 0.2,
  );
  const recentDeathCaution = band.deathMemory?.cautionModifier ?? 0;
  const riskToleranceModifier = clampHook(
    hungerSeverity * 0.13 +
      Math.min(0.08, hungerStreak * 0.006) +
      (mode === "desperate" ? 0.05 : 0) -
      recentDeathCaution * 0.05,
    recoverySignal,
  );
  const socialScarcityTension = clampHook(
    hungerSeverity * 0.12 +
      (band.innerFission?.hungerTension ?? 0) * 0.08 +
      (band.protoAccessMemory?.behavior.toleranceReductionBias ?? 0) * 0.5,
    recoverySignal * 0.5,
  );
  const movementDebateBias = clampHook(
    nearbyProbeBias * 0.45 + tripAbandonmentBias * 0.35 + crisisBreakawayPressure * 0.2,
    recoverySignal * 0.4,
  );
  const cappedCrisisPressure = clamp01(Math.min(0.18, crisisBreakawayPressure));
  const maxBehaviorHook = Math.max(
    riskToleranceModifier,
    fallbackExpansionBias,
    tripAbandonmentBias,
    nearbyProbeBias,
    movementDebateBias,
    socialScarcityTension,
    cappedCrisisPressure,
  );

  return {
    riskToleranceModifier: round2(riskToleranceModifier),
    fallbackExpansionBias: round2(fallbackExpansionBias),
    tripAbandonmentBias: round2(tripAbandonmentBias),
    nearbyProbeBias: round2(nearbyProbeBias),
    movementDebateBias: round2(movementDebateBias),
    socialScarcityTension: round2(socialScarcityTension),
    crisisBreakawayPressure: round2(cappedCrisisPressure),
    maxBehaviorHook: round2(maxBehaviorHook),
    reversible: true,
    noCultureLadder: true,
    noAgriculture: true,
    noVillageSedentism: true,
    noStorageEconomy: true,
    noWarTerritory: true,
  };
}

function deriveCrisisBreakawayState(
  world: WorldState,
  band: Band,
  hungerSeverity: number,
  hungerStreak: number,
  fallbackCandidates: readonly FallbackDietCandidate[],
  tripFailureMemories: readonly ForagingTripFailureMemory[],
  nearbyOpportunityProbes: readonly NearbyForagingOpportunityProbe[],
): ForagingLearningAdaptationState["crisisBreakaway"] {
  const overCapacity = clamp01(Math.max(
    band.rangeSaturation?.saturationPressure ?? 0,
    band.pressureState?.foodStress ?? 0,
    band.pressureState?.crowdingPenalty ?? 0,
  ));
  const repeatedFailedTrips = tripFailureMemories.filter((memory) => memory.action === "reduce_confidence" || memory.action === "abandon_temporarily").length;
  const bestFallbackUsefulness = fallbackCandidates.reduce((max, candidate) => Math.max(max, candidate.expectedUsefulness), 0);
  const bestProbe = nearbyOpportunityProbes.find((probe) => probe.comparison === "nearby_probe" || probe.comparison === "not_enough_known");
  const severeGroundedPressure =
    hungerSeverity >= 0.64 &&
    hungerStreak >= 4 &&
    overCapacity >= 0.42 &&
    repeatedFailedTrips >= 1;
  const adultLaborEnough = (band.demography?.workingAdults ?? 0) >= 8 && band.size >= 30;
  const noSafeAcceptedSolution = bestFallbackUsefulness < 0.52 && (bestProbe?.riskPenalty ?? 0.4) >= 0.22;
  const pressure = clamp01(
    hungerSeverity * 0.34 +
      Math.min(0.2, hungerStreak * 0.025) +
      overCapacity * 0.22 +
      repeatedFailedTrips * 0.06 +
      (band.innerFission?.hungerTension ?? 0) * 0.08 -
      bestFallbackUsefulness * 0.12,
  );
  const active = pressure >= 0.58 && severeGroundedPressure && adultLaborEnough && noSafeAcceptedSolution;
  const reasonIds = active || pressure >= 0.35
    ? [
        makeAdaptationReasonId(band.id, world.time.tick, "crisis-breakaway-pressure", band.position, "scarcity"),
        ...(bestProbe === undefined ? [] : bestProbe.reasonIds.slice(0, 2)),
      ]
    : [];

  return {
    active,
    pressure: round2(pressure),
    belowPeacefulFissionThreshold: band.size < PEACEFUL_FISSION_POPULATION_THRESHOLD,
    severeGroundedPressure,
    knownRiskyDestination: bestProbe?.tileId,
    adultLaborEnough,
    noSafeAcceptedSolution,
    reasonIds,
    noWar: true,
    noForcedConflict: true,
  };
}

function deriveHungerSeverity(band: Band): number {
  const seasonalSupport = band.seasonalSupport;
  const currentSeason = seasonalSupport?.currentSeasonSupport;
  const seasonalFoodStress = Math.max(
    currentSeason?.deficitRatio ?? 0,
    currentSeason === undefined ? 0 : Math.max(0, 0.95 - currentSeason.rawSupportRatio) * 0.8,
    seasonalSupport?.hungerClassification === "seasonal_lean_stress" ? 0.34 : 0,
    seasonalSupport?.hungerClassification === "chronic_plus_seasonal_stress" ? 0.48 : 0,
    seasonalSupport?.hungerClassification === "crisis_deficit" ? 0.72 : 0,
  );

  return clamp01(Math.max(
    band.pressureState?.foodStress ?? 0,
    band.hungerPressure,
    seasonalFoodStress,
    band.perCapitaReturn === undefined ? 0 : Math.max(0, 0.58 - band.perCapitaReturn.perCapitaReturn),
  ));
}

function deriveRecoverySignal(band: Band, hungerSeverity: number): number {
  const recovery = band.pressureState === undefined
    ? 0
    : clamp01((1 - band.pressureState.foodStress) * 0.24 + (1 - band.pressureState.netMovePressure) * 0.1);
  const perCapitaRecovery = band.perCapitaReturn === undefined
    ? 0
    : clamp01((band.perCapitaReturn.perCapitaReturn - 0.5) * 0.9);
  const successfulTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) => isTripSuccess(trip.activityOutcome)).length;

  return clamp01((hungerSeverity < 0.34 ? 0.18 : 0) + recovery + perCapitaRecovery + Math.min(0.18, successfulTrips * 0.03));
}

function deriveLearningStatus(
  memory: ResourcePatchMemory,
  confidence: number,
  proximityCount: number,
  testCount: number,
  riskHigh: boolean,
): EmpiricalResourceLearningRecord["status"] {
  if (riskHigh && (confidence >= 0.32 || proximityCount + testCount >= 3)) {
    return "known_risky";
  }

  if (riskHigh) {
    return "cautiously_known";
  }

  if (memory.useHistory.successfulUses > 0 && confidence >= 0.42) {
    return memory.useHistory.lastYieldEstimate < 0.16 ? "known_poor" : "known_useful";
  }

  if (confidence >= 0.56 || proximityCount + testCount >= 5) {
    return memory.resourceClassId === "fallback_food" && memory.useHistory.lastYieldEstimate < 0.18
      ? "known_poor"
      : "watched";
  }

  if (memory.state === "unknown" || memory.state === "suspected" || memory.source === "inferred") {
    return proximityCount >= 2 ? "suspected" : "not_known";
  }

  return "watched";
}

function deriveFallbackStatus(
  classId: ResourceClassId,
  hungerSeverity: number,
  confidence: number,
  riskHigh: boolean,
): EmpiricalResourceLearningRecord["fallbackStatus"] {
  if (!isFoodOrFallbackClass(classId)) {
    return "none";
  }

  if (classId === "fallback_food" || classId === "medicinal_or_toxic") {
    return hungerSeverity >= 0.68 && confidence >= 0.22 ? "emergency" : "fallback_only";
  }

  if (riskHigh) {
    return hungerSeverity >= 0.64 ? "emergency" : "fallback_only";
  }

  return hungerSeverity >= 0.34 ? "candidate" : "none";
}

function deriveRiskStatus(
  memory: ResourcePatchMemory,
  riskHigh: boolean,
): EmpiricalResourceLearningRecord["riskStatus"] {
  if (memory.risk.poisoningOrBadReaction || memory.risk.badWater || memory.risk.tabooOrAvoidanceFutureFlag) {
    return "known_risk";
  }

  if (riskHigh || memory.resourceClassId === "medicinal_or_toxic") {
    return "high";
  }

  return memory.risk.predatorOrAnimalRisk >= 0.28 || memory.confidence.safetyConfidence < 0.34 ? "moderate" : "low";
}

function deriveGatedReason(
  memory: ResourcePatchMemory,
  status: EmpiricalResourceLearningRecord["status"],
  confidence: number,
  riskHigh: boolean,
): string {
  if (status === "not_known") {
    return "seen too little to treat as usable";
  }

  if (riskHigh || status === "known_risky") {
    return "risk memory keeps use cautious";
  }

  if (memory.resourceClassId === "fallback_food" || status === "known_poor") {
    return "low return or heavy labor keeps it fallback";
  }

  if (confidence < 0.42) {
    return "known as a place, not yet a dependable food";
  }

  return "not gated by hidden truth";
}

function deriveUnlockHint(
  memory: ResourcePatchMemory,
  status: EmpiricalResourceLearningRecord["status"],
  riskHigh: boolean,
): string {
  if (riskHigh || status === "known_risky") {
    return "only cautious testing or repeated safe handling can reduce risk";
  }

  if (status === "not_known" || status === "suspected") {
    return "more local observation or a successful small test";
  }

  if (memory.resourceClassId === "fallback_food") {
    return "hunger or better processing confidence makes it worth trying";
  }

  return "already empirically visible";
}

function shouldImproveMemoryState(record: EmpiricalResourceLearningRecord): boolean {
  return (
    (record.knowledgeState === "unknown" || record.knowledgeState === "suspected" || record.source === "inferred") &&
    record.status !== "not_known" &&
    record.proximityCount + record.testCount >= 3 &&
    record.confidence >= 0.32
  );
}

function isRiskyMemory(memory: ResourcePatchMemory): boolean {
  return (
    memory.risk.poisoningOrBadReaction ||
    memory.risk.badWater ||
    memory.risk.tabooOrAvoidanceFutureFlag ||
    memory.risk.predatorOrAnimalRisk >= 0.44 ||
    memory.resourceClassId === "medicinal_or_toxic" ||
    memory.confidence.safetyConfidence < 0.28 ||
    memory.plantObservation?.suspectedSafetyRisk === true
  );
}

function deriveFallbackLevel(
  hungerSeverity: number,
  record: EmpiricalResourceLearningRecord,
  riskCost: number,
): FallbackDietExpansionLevel {
  if (record.resourceClassId === "medicinal_or_toxic" && hungerSeverity < 0.72) {
    return "none";
  }

  if (record.riskStatus === "known_risk" && hungerSeverity < 0.68) {
    return "watching";
  }

  if (hungerSeverity >= 0.72) {
    return "emergency";
  }

  if (hungerSeverity >= 0.5) {
    return riskCost >= 0.48 ? "testing" : "expanded";
  }

  if (hungerSeverity >= 0.3 || record.fallbackStatus === "fallback_only") {
    return "testing";
  }

  return "watching";
}

function getFallbackCosts(
  classId: ResourceClassId,
  riskStatus: EmpiricalResourceLearningRecord["riskStatus"],
): { readonly laborCost: number; readonly riskCost: number; readonly dietQualityPenalty: number } {
  const riskBump = riskStatus === "known_risk" ? 0.32 : riskStatus === "high" ? 0.22 : riskStatus === "moderate" ? 0.1 : 0;

  switch (classId) {
    case "aquatic_food":
      return { laborCost: 0.32, riskCost: clamp01(0.18 + riskBump), dietQualityPenalty: 0.1 };
    case "animal_food":
      return { laborCost: 0.58, riskCost: clamp01(0.22 + riskBump), dietQualityPenalty: 0.08 };
    case "generic_plant_food":
      return { laborCost: 0.3, riskCost: clamp01(0.12 + riskBump), dietQualityPenalty: 0.1 };
    case "fallback_food":
      return { laborCost: 0.56, riskCost: clamp01(0.22 + riskBump), dietQualityPenalty: 0.3 };
    case "medicinal_or_toxic":
      return { laborCost: 0.68, riskCost: clamp01(0.58 + riskBump), dietQualityPenalty: 0.48 };
    default:
      return { laborCost: 0.45, riskCost: clamp01(0.18 + riskBump), dietQualityPenalty: 0.18 };
  }
}

function fallbackClassBaseUsefulness(classId: ResourceClassId): number {
  switch (classId) {
    case "aquatic_food":
      return 0.16;
    case "generic_plant_food":
      return 0.12;
    case "fallback_food":
      return 0.1;
    case "animal_food":
      return 0.08;
    case "medicinal_or_toxic":
      return -0.06;
    default:
      return 0;
  }
}

function fallbackReason(
  classId: ResourceClassId,
  level: FallbackDietExpansionLevel,
  riskStatus: EmpiricalResourceLearningRecord["riskStatus"],
): string {
  if (riskStatus === "known_risk" || classId === "medicinal_or_toxic") {
    return "hunger may force cautious risky fallback testing";
  }

  if (classId === "fallback_food") {
    return "low-return fallback becomes more relevant as hunger rises";
  }

  if (classId === "aquatic_food") {
    return "water-edge food can buffer hunger but costs work and may spoil";
  }

  return level === "emergency"
    ? "ordinary choices are failing, so the diet widens"
    : "pressure makes a marginal known resource worth testing";
}

function deriveTripAction(
  tripCount: number,
  failureCount: number,
  lowReturnCount: number,
  successCount: number,
  longestDistanceTiles: number,
  meanReturn: number,
): TripAdaptationAction {
  if (successCount >= failureCount && successCount > 0) {
    return failureCount > 0 ? "recovering_after_success" : "continue";
  }

  if (failureCount >= 3 && longestDistanceTiles >= 6 && meanReturn < 0.05) {
    return "abandon_temporarily";
  }

  if (failureCount >= 2 || (failureCount + lowReturnCount >= 3 && tripCount >= 3)) {
    return "reduce_confidence";
  }

  if (lowReturnCount >= 2 || failureCount > 0) {
    return "watch";
  }

  return "continue";
}

function isTripFailure(outcome: IntraSeasonTripActivityResult): boolean {
  return (
    outcome === "failed_due_to_distance" ||
    outcome === "failed_due_to_water_risk" ||
    outcome === "failed_due_to_low_memory_confidence" ||
    outcome === "failed_due_to_season_mismatch" ||
    outcome === "abandoned_due_to_risk" ||
    outcome === "target_not_found" ||
    outcome === "delayed_return"
  );
}

function isTripSuccess(outcome: IntraSeasonTripActivityResult): boolean {
  return outcome === "partial_success" || outcome === "target_found" || outcome === "successful_observation";
}

function isFoodOrFallbackClass(classId: ResourceClassId): boolean {
  return (
    classId === "generic_plant_food" ||
    classId === "aquatic_food" ||
    classId === "animal_food" ||
    classId === "fallback_food" ||
    classId === "medicinal_or_toxic"
  );
}

function toResourceClassId(classId: string): ResourceClassId | undefined {
  switch (classId) {
    case "generic_plant_food":
    case "aquatic_food":
    case "animal_food":
    case "fallback_food":
    case "fiber_material":
    case "fuel_material":
    case "medicinal_or_toxic":
    case "water_resource":
      return classId;
    default:
      return undefined;
  }
}

function dedupeFallbackCandidates(candidates: readonly FallbackDietCandidate[]): readonly FallbackDietCandidate[] {
  const byKey = new Map<string, FallbackDietCandidate>();

  for (const candidate of candidates) {
    const key = `${String(candidate.tileId)}:${candidate.resourceClassId}`;
    const existing = byKey.get(key);

    if (
      existing === undefined ||
      candidate.expectedUsefulness > existing.expectedUsefulness ||
      (candidate.expectedUsefulness === existing.expectedUsefulness && candidate.confidence > existing.confidence)
    ) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()];
}

function dedupeNearbyProbes(probes: readonly NearbyForagingOpportunityProbe[]): readonly NearbyForagingOpportunityProbe[] {
  const byTile = new Map<string, NearbyForagingOpportunityProbe>();

  for (const probe of probes) {
    const existing = byTile.get(String(probe.tileId));

    if (
      existing === undefined ||
      probe.probeReadiness > existing.probeReadiness ||
      (probe.probeReadiness === existing.probeReadiness && probe.distanceTiles < existing.distanceTiles)
    ) {
      byTile.set(String(probe.tileId), probe);
    }
  }

  return [...byTile.values()];
}

function compareLearningRecords(left: EmpiricalResourceLearningRecord, right: EmpiricalResourceLearningRecord): number {
  return (
    statusRank(right.status) - statusRank(left.status) ||
    right.confidence - left.confidence ||
    right.proximityCount - left.proximityCount ||
    String(left.tileId).localeCompare(String(right.tileId))
  );
}

function compareFallbackCandidates(left: FallbackDietCandidate, right: FallbackDietCandidate): number {
  return (
    right.expectedUsefulness - left.expectedUsefulness ||
    right.confidence - left.confidence ||
    String(left.tileId).localeCompare(String(right.tileId))
  );
}

function compareTripFailureMemories(left: ForagingTripFailureMemory, right: ForagingTripFailureMemory): number {
  return (
    right.confidencePenalty - left.confidencePenalty ||
    right.failureCount - left.failureCount ||
    String(left.tileId).localeCompare(String(right.tileId))
  );
}

function compareNearbyProbes(left: NearbyForagingOpportunityProbe, right: NearbyForagingOpportunityProbe): number {
  return (
    right.probeReadiness - left.probeReadiness ||
    left.distanceTiles - right.distanceTiles ||
    String(left.tileId).localeCompare(String(right.tileId))
  );
}

function compareKnownRecords(
  left: { readonly tileId: TileId; readonly confidence: number; readonly observedRichness: number; readonly observedAquaticPotential: number },
  right: { readonly tileId: TileId; readonly confidence: number; readonly observedRichness: number; readonly observedAquaticPotential: number },
): number {
  const leftScore = left.confidence + left.observedRichness * 0.4 + left.observedAquaticPotential * 0.25;
  const rightScore = right.confidence + right.observedRichness * 0.4 + right.observedAquaticPotential * 0.25;

  return rightScore - leftScore || String(left.tileId).localeCompare(String(right.tileId));
}

function statusRank(status: EmpiricalResourceLearningRecord["status"]): number {
  switch (status) {
    case "known_useful":
      return 7;
    case "known_risky":
      return 6;
    case "cautiously_known":
      return 5;
    case "known_poor":
      return 4;
    case "watched":
      return 3;
    case "suspected":
      return 2;
    case "not_known":
      return 1;
  }
}

function uniqueReasonIds(reasonIds: readonly ReasonId[]): readonly ReasonId[] {
  return reasonIds.filter((reasonId, index, all) => all.indexOf(reasonId) === index);
}

function uniqueSeasons<SeasonKind extends string>(seasons: readonly SeasonKind[]): readonly SeasonKind[] {
  return seasons.filter((season, index, all) => all.indexOf(season) === index);
}

function makeAdaptationReasonId(
  bandId: BandId,
  tick: TickNumber,
  category: string,
  tileId: TileId,
  suffix: string,
): ReasonId {
  return `reason:foraging-adaptation:${String(bandId)}:${Number(tick)}:${category}:${String(tileId)}:${suffix}` as ReasonId;
}

function getGridDistance(left: Tile, right: Tile): number {
  return Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.y - right.coord.y);
}

function clampHook(value: number, recovery: number): number {
  return clamp01(Math.min(0.18, value - recovery * 0.08));
}

function clamp01(value: number): NormalizedIntensity {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}
