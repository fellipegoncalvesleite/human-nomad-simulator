import type { BandId, ReasonId, RouteId, TickNumber, TileId } from "../core/types";
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
  RepetitionAffordanceDomain,
  RepetitionAffordanceItem,
  RepetitionDeadEndRisk,
  RepetitionFamiliarityStatus,
  RepetitionFeedbackQuality,
  RepetitionImprovementPotential,
  TripAdaptationAction,
} from "./types";
import { deriveCanonicalNutritionState } from "./seasonalSurvival";
import { isPhysicalFoodReturnKind } from "./physicalFoodReturn";

const LEARNING_RECORD_CAP = 10;
const FALLBACK_CANDIDATE_CAP = 6;
const TRIP_FAILURE_CAP = 6;
const NEARBY_PROBE_CAP = 5;
const REPETITION_AFFORDANCE_CAP = 8;
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

interface RepetitionAffordanceDraft extends RepetitionAffordanceItem {
  readonly score: number;
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
  const repetitionAffordances = deriveRepetitionAffordances(world, band, learningRecords, tripFailureMemories);
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
    nearbyOpportunityProbes.length <= NEARBY_PROBE_CAP &&
    repetitionAffordances.length <= REPETITION_AFFORDANCE_CAP;
  const reasonIds = uniqueReasonIds([
    ...learningRecords.flatMap((record) => record.reasonIds),
    ...fallbackCandidates.flatMap((candidate) => candidate.reasonIds),
    ...tripFailureMemories.flatMap((memory) => memory.reasonIds),
    ...nearbyOpportunityProbes.flatMap((probe) => probe.reasonIds),
    ...repetitionAffordances.flatMap((affordance) => affordance.reasonIds),
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
      repetitionAffordances,
      behavior,
      crisisBreakaway,
      knowledgeUpdatedTileIds,
      learningRecordCap: LEARNING_RECORD_CAP,
      fallbackCandidateCap: FALLBACK_CANDIDATE_CAP,
      tripFailureCap: TRIP_FAILURE_CAP,
      nearbyProbeCap: NEARBY_PROBE_CAP,
      repetitionAffordanceCap: REPETITION_AFFORDANCE_CAP,
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
  // §6 outcome learning: this reads the RESOLVED ACTUAL return, not a pre-trip
  // estimate. resolvePhysicalFoodHarvest overwrites resourceReturn.estimatedReturnValue
  // with physicalFoodHarvest.usableSupport and sets returnedResourceKind to "none"
  // when the real patch/stock yielded zero — so a physical-food kind here means the
  // receipt was actually useful (>0), and a high pre-trip estimate that harvested
  // nothing is already excluded (kind "none", value 0, counted via failureCount).
  // Reconstructed audit fixtures set estimatedReturnValue to the intended actual
  // return directly, so this accessor is correct in both production and fixtures.
  const lowReturnCount = accumulator.trips.filter((trip) =>
    isPhysicalFoodReturnKind(trip.resourceReturn.returnedResourceKind) &&
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

function deriveRepetitionAffordances(
  world: WorldState,
  band: Band,
  learningRecords: readonly EmpiricalResourceLearningRecord[],
  tripFailureMemories: readonly ForagingTripFailureMemory[],
): readonly RepetitionAffordanceItem[] {
  const recordByResource = new Map<string, EmpiricalResourceLearningRecord>();
  for (const record of learningRecords) {
    recordByResource.set(`${String(record.tileId)}:${record.resourceClassId}`, record);
  }

  const resourceDrafts = (band.resourceKnowledgeState?.patchMemories ?? [])
    .map((memory) => deriveResourceRepetitionAffordance(world, band, memory, recordByResource.get(`${String(memory.approximateTile)}:${memory.resourceClassId}`)))
    .filter((draft): draft is RepetitionAffordanceDraft => draft !== undefined);
  const tripDrafts = tripFailureMemories
    .map((memory) => deriveTripRepetitionAffordance(world, band, memory))
    .filter((draft): draft is RepetitionAffordanceDraft => draft !== undefined);
  const crossingDrafts = Object.values(band.crossingMemories)
    .map((crossing) => deriveCrossingRepetitionAffordance(world, band, crossing))
    .filter((draft): draft is RepetitionAffordanceDraft => draft !== undefined);
  const routeDrafts = Object.values(band.travelCorridors)
    .map((route) => deriveRouteRepetitionAffordance(world, band, route))
    .filter((draft): draft is RepetitionAffordanceDraft => draft !== undefined);
  const campDraft = deriveCampSetupRepetitionAffordance(world, band);

  return capRepetitionAffordances([
    ...resourceDrafts,
    ...tripDrafts,
    ...crossingDrafts,
    ...routeDrafts,
    ...(campDraft === undefined ? [] : [campDraft]),
  ]);
}

function deriveResourceRepetitionAffordance(
  world: WorldState,
  band: Band,
  memory: ResourcePatchMemory,
  record: EmpiricalResourceLearningRecord | undefined,
): RepetitionAffordanceDraft | undefined {
  const domain = repetitionDomainForResource(memory);

  if (domain === undefined) {
    return undefined;
  }

  const learning = memory.learning;
  const exposure = Math.max(
    record?.proximityCount ?? 0,
    memory.useHistory.visits +
      memory.transmission.practiceReinforced +
      (memory.plantObservation?.observationCount ?? 0) +
      (band.placeMemory[memory.approximateTile]?.visitCount ?? 0),
  );
  const attempts = Math.max(
    record?.testCount ?? 0,
    memory.useHistory.visits +
      (learning?.confirmationCount ?? 0) +
      (learning?.partialConfirmationCount ?? 0) +
      (learning?.contradictionCount ?? 0) +
      (learning?.noInfoCount ?? 0) +
      (memory.plantObservation?.observationCount ?? 0),
  );

  if (exposure < 2 && attempts < 2) {
    return undefined;
  }

  const positiveFeedback =
    memory.useHistory.successfulUses +
    (learning?.confirmationCount ?? 0) +
    (learning?.partialConfirmationCount ?? 0);
  const poorFeedback =
    memory.useHistory.failedUses +
    (learning?.contradictionCount ?? 0) +
    (learning?.falseInferenceCount ?? 0) +
    (learning?.seasonalMismatchCount ?? 0) +
    (memory.risk.poisoningOrBadReaction || memory.risk.badWater || memory.plantObservation?.suspectedSafetyRisk === true ? 1 : 0);
  const feedbackQuality = deriveRepetitionFeedbackQuality(positiveFeedback, poorFeedback, attempts, memory.seasonality.bestSeasons.length + memory.seasonality.badSeasons.length);
  const deadEndRisk = deriveRepetitionDeadEndRisk({
    positiveFeedback,
    poorFeedback,
    attempts,
    exposure,
    source: memory.source,
    contextBound: memory.seasonality.bestSeasons.length + memory.seasonality.badSeasons.length <= 1 && positiveFeedback > 0,
  });
  const improvementPotential = deriveRepetitionPotential(domain, exposure, attempts, positiveFeedback, poorFeedback);
  const familiarityStatus = deriveRepetitionStatus(deadEndRisk, improvementPotential, attempts, positiveFeedback);
  const title = resourceRepetitionTitle(domain, deadEndRisk);
  const summary = resourceRepetitionSummary(domain, deadEndRisk);

  return makeRepetitionAffordanceDraft({
    band,
    tick: world.time.tick,
    domain,
    sourceKey: `${String(memory.approximateTile)}:${memory.resourceClassId}`,
    title,
    summary,
    repeatedExposureCount: exposure,
    repeatedAttemptSignal: attempts,
    feedbackQuality,
    improvementPotential,
    deadEndRisk,
    familiarityStatus,
    evidenceLabels: [
      `${resourceClassLabel(memory.resourceClassId)} remembered`,
      countLabel(exposure, "exposure", "exposures"),
      countLabel(attempts, "attempt", "attempts"),
    ],
    reasonIds: [
      makeAdaptationReasonId(band.id, world.time.tick, "repetition-affordance", memory.approximateTile, memory.resourceClassId),
      ...memory.reasonIds.slice(0, 3),
    ],
    score: exposure * 0.08 + attempts * 0.1 + potentialRank(improvementPotential) * 0.08 + deadEndRiskRank(deadEndRisk) * 0.08,
  });
}

function deriveTripRepetitionAffordance(
  world: WorldState,
  band: Band,
  memory: ForagingTripFailureMemory,
): RepetitionAffordanceDraft | undefined {
  if (memory.recentTripCount < 2) {
    return undefined;
  }

  const domain = repetitionDomainForTrip(memory.taskGroupType);
  const poorFeedback = memory.failureCount + memory.lowReturnCount;
  const positiveFeedback = memory.successCount;
  const deadEndRisk: RepetitionDeadEndRisk = memory.action === "abandon_temporarily"
    ? "dead_end_attempt"
    : memory.action === "reduce_confidence"
      ? "reinforced_bad_habit"
      : memory.action === "recovering_after_success"
        ? "local_context_only"
        : "low_feedback_risk";
  const feedbackQuality = deriveRepetitionFeedbackQuality(positiveFeedback, poorFeedback, memory.recentTripCount, 1);
  const improvementPotential = deadEndRisk === "dead_end_attempt" || deadEndRisk === "reinforced_bad_habit"
    ? "weak"
    : "possible";
  const task = taskGroupLabel(memory.taskGroupType);

  return makeRepetitionAffordanceDraft({
    band,
    tick: world.time.tick,
    domain,
    sourceKey: `${String(memory.tileId)}:${memory.taskGroupType}`,
    title: `${task} repeats without proof of mastery`,
    summary: "Repeated attempts are preserved as familiarity and possible future practice evidence, but poor returns can also be a marginal routine or dead end.",
    repeatedExposureCount: memory.recentTripCount,
    repeatedAttemptSignal: memory.failureCount + memory.lowReturnCount + memory.successCount,
    feedbackQuality,
    improvementPotential,
    deadEndRisk,
    familiarityStatus: deriveRepetitionStatus(deadEndRisk, improvementPotential, memory.recentTripCount, positiveFeedback),
    evidenceLabels: [
      countLabel(memory.recentTripCount, "recent trip", "recent trips"),
      countLabel(memory.failureCount, "failure", "failures"),
      countLabel(memory.lowReturnCount, "low return", "low returns"),
    ],
    reasonIds: [
      makeAdaptationReasonId(band.id, world.time.tick, "repetition-affordance", memory.tileId, memory.taskGroupType),
      ...memory.reasonIds.slice(0, 3),
    ],
    score: memory.confidencePenalty + memory.recentTripCount * 0.09 + deadEndRiskRank(deadEndRisk) * 0.1,
  });
}

function deriveCrossingRepetitionAffordance(
  world: WorldState,
  band: Band,
  crossing: NonNullable<Band["crossingMemories"][string]>,
): RepetitionAffordanceDraft | undefined {
  if (crossing.useCount < 2 && crossing.riskMemory < 0.45) {
    return undefined;
  }

  const hardCrossing = crossing.riskMemory >= 0.5 || crossing.successConfidence < 0.45;
  const deadEndRisk: RepetitionDeadEndRisk = hardCrossing && crossing.useCount >= 3
    ? "reinforced_bad_habit"
    : crossing.seasonalReliability < 0.42
      ? "local_context_only"
      : hardCrossing
        ? "dead_end_attempt"
        : "low_feedback_risk";
  const feedbackQuality: RepetitionFeedbackQuality = hardCrossing
    ? "negative_feedback"
    : crossing.seasonalReliability < 0.5
      ? "context_bound_feedback"
      : "mixed_feedback";

  return makeRepetitionAffordanceDraft({
    band,
    tick: world.time.tick,
    domain: "crossing",
    sourceKey: `${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}`,
    title: "Crossing pressure repeats, not mastery",
    summary: hardCrossing
      ? "Repeated crossing pressure creates future crossing-aid potential, but past repetitions mostly show difficulty, not mastery."
      : "Repeated crossing use creates familiarity, but no crossing aid or engineering practice is known.",
    repeatedExposureCount: crossing.useCount,
    repeatedAttemptSignal: crossing.useCount,
    feedbackQuality,
    improvementPotential: crossing.useCount >= 4 ? "possible" : "weak",
    deadEndRisk,
    familiarityStatus: deriveRepetitionStatus(deadEndRisk, crossing.useCount >= 4 ? "possible" : "weak", crossing.useCount, hardCrossing ? 0 : 1),
    evidenceLabels: [
      countLabel(crossing.useCount, "crossing attempt", "crossing attempts"),
      `risk ${round2(crossing.riskMemory)}`,
      `success confidence ${round2(crossing.successConfidence)}`,
    ],
    reasonIds: [
      makeAdaptationReasonId(band.id, world.time.tick, "repetition-affordance", crossing.crossingTileA, "crossing"),
      ...crossing.reasonIds.slice(0, 3),
    ],
    score: crossing.useCount * 0.1 + crossing.riskMemory * 0.24 + deadEndRiskRank(deadEndRisk) * 0.08,
  });
}

function deriveRouteRepetitionAffordance(
  world: WorldState,
  band: Band,
  route: NonNullable<Band["travelCorridors"][RouteId]>,
): RepetitionAffordanceDraft | undefined {
  if (route.useCount < 3) {
    return undefined;
  }

  const deadEndRisk: RepetitionDeadEndRisk = route.confidence < 0.42 && route.useCount >= 5
    ? "false_confidence_risk"
    : route.intentKinds.length <= 1
      ? "local_context_only"
      : "low";

  return makeRepetitionAffordanceDraft({
    band,
    tick: world.time.tick,
    domain: "route_use",
    sourceKey: String(route.id),
    title: "Route repetition creates familiarity only",
    summary: "Route use is repeated enough to preserve familiarity, but route familiarity is not a travel skill by itself.",
    repeatedExposureCount: route.useCount,
    repeatedAttemptSignal: route.useCount,
    feedbackQuality: route.confidence >= 0.58 ? "useful_feedback" : "context_bound_feedback",
    improvementPotential: route.useCount >= 6 ? "possible" : "weak",
    deadEndRisk,
    familiarityStatus: deriveRepetitionStatus(deadEndRisk, route.useCount >= 6 ? "possible" : "weak", route.useCount, route.confidence >= 0.58 ? 1 : 0),
    evidenceLabels: [
      countLabel(route.useCount, "route use", "route uses"),
      `confidence ${round2(route.confidence)}`,
    ],
    reasonIds: [makeAdaptationReasonId(band.id, world.time.tick, "repetition-affordance", route.toTileId, "route-use")],
    score: route.useCount * 0.08 + route.confidence * 0.18 + deadEndRiskRank(deadEndRisk) * 0.06,
  });
}

function deriveCampSetupRepetitionAffordance(
  world: WorldState,
  band: Band,
): RepetitionAffordanceDraft | undefined {
  const protoPlace = band.protoCampMemory?.currentPlace ?? band.protoCampMemory?.topPlaces[0];
  const fallbackPlace = Object.values(band.placeMemory)
    .sort((left, right) =>
      right.repeatedReturnCount - left.repeatedReturnCount ||
      right.visitCount - left.visitCount ||
      String(left.tileId).localeCompare(String(right.tileId)))[0];
  const exposure = Math.max(
    protoPlace?.visitCount ?? 0,
    fallbackPlace?.repeatedReturnCount ?? 0,
    fallbackPlace?.visitCount ?? 0,
  );

  if (exposure < 4) {
    return undefined;
  }

  const tileId = protoPlace?.tileId ?? fallbackPlace?.tileId ?? band.position;
  const contextBound = (protoPlace?.seasonalIdentity ?? "general_return_place") !== "general_return_place" ||
    (fallbackPlace?.seasonalReturnPattern?.length ?? 0) > 0;
  const deadEndRisk: RepetitionDeadEndRisk = contextBound ? "local_context_only" : "low_feedback_risk";

  return makeRepetitionAffordanceDraft({
    band,
    tick: world.time.tick,
    domain: "camp_setup",
    sourceKey: String(tileId),
    title: "Camp setup repeats often",
    summary: "Camp setup is repeated often; this may later support shelter routines if useful feedback accumulates.",
    repeatedExposureCount: exposure,
    repeatedAttemptSignal: Math.max(protoPlace?.residentialAnchorUseCount ?? 0, fallbackPlace?.repeatedReturnCount ?? 0),
    feedbackQuality: contextBound ? "context_bound_feedback" : "low_feedback",
    improvementPotential: exposure >= 8 ? "possible" : "weak",
    deadEndRisk,
    familiarityStatus: contextBound ? "local_context_only" : "familiarity_without_proven_skill",
    evidenceLabels: [
      countLabel(exposure, "camp return", "camp returns"),
      contextBound ? "seasonal or local context" : "repeated setup context",
    ],
    reasonIds: [
      makeAdaptationReasonId(band.id, world.time.tick, "repetition-affordance", tileId, "camp-setup"),
      ...(protoPlace?.reasonIds ?? fallbackPlace?.reasonIds ?? []).slice(0, 3),
    ],
    score: exposure * 0.07 + (contextBound ? 0.08 : 0),
  });
}

function capRepetitionAffordances(drafts: readonly RepetitionAffordanceDraft[]): readonly RepetitionAffordanceItem[] {
  const seen = new Set<string>();
  const result: RepetitionAffordanceItem[] = [];

  for (const draft of [...drafts].sort(compareRepetitionAffordanceDrafts)) {
    const key = `${draft.domain}:${draft.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      id: draft.id,
      domain: draft.domain,
      title: draft.title,
      summary: draft.summary,
      repeatedExposureCount: draft.repeatedExposureCount,
      repeatedAttemptSignal: draft.repeatedAttemptSignal,
      feedbackQuality: draft.feedbackQuality,
      improvementPotential: draft.improvementPotential,
      deadEndRisk: draft.deadEndRisk,
      familiarityStatus: draft.familiarityStatus,
      evidenceLabels: draft.evidenceLabels,
      futureHook: draft.futureHook,
      noSkillUnlocked: draft.noSkillUnlocked,
      noAutomaticImprovement: draft.noAutomaticImprovement,
      reasonIds: draft.reasonIds,
    });
    if (result.length >= REPETITION_AFFORDANCE_CAP) {
      break;
    }
  }

  return result;
}

function makeRepetitionAffordanceDraft(input: {
  readonly band: Band;
  readonly tick: TickNumber;
  readonly domain: RepetitionAffordanceDomain;
  readonly sourceKey: string;
  readonly title: string;
  readonly summary: string;
  readonly repeatedExposureCount: number;
  readonly repeatedAttemptSignal: number;
  readonly feedbackQuality: RepetitionFeedbackQuality;
  readonly improvementPotential: RepetitionImprovementPotential;
  readonly deadEndRisk: RepetitionDeadEndRisk;
  readonly familiarityStatus: RepetitionFamiliarityStatus;
  readonly evidenceLabels: readonly string[];
  readonly reasonIds: readonly ReasonId[];
  readonly score: number;
}): RepetitionAffordanceDraft {
  return {
    id: `repetition:${String(input.band.id)}:${input.domain}:${input.sourceKey.replace(/[^a-zA-Z0-9:_-]+/g, "-")}`,
    domain: input.domain,
    title: input.title,
    summary: input.summary,
    repeatedExposureCount: Math.max(0, Math.floor(input.repeatedExposureCount)),
    repeatedAttemptSignal: Math.max(0, Math.floor(input.repeatedAttemptSignal)),
    feedbackQuality: input.feedbackQuality,
    improvementPotential: input.improvementPotential,
    deadEndRisk: input.deadEndRisk,
    familiarityStatus: input.familiarityStatus,
    evidenceLabels: input.evidenceLabels.filter((label) => label.length > 0).slice(0, 4),
    futureHook: "practice_experimentation",
    noSkillUnlocked: true,
    noAutomaticImprovement: true,
    reasonIds: uniqueReasonIds(input.reasonIds).slice(0, 6),
    score: input.score,
  };
}

function repetitionDomainForResource(memory: ResourcePatchMemory): RepetitionAffordanceDomain | undefined {
  switch (memory.resourceClassId) {
    case "fiber_material":
      return "fiber_handling";
    case "fuel_material":
      return "material_handling";
    case "generic_plant_food":
    case "fallback_food":
      return memory.plantObservation?.suspectedProcessingNeed === true ||
        memory.confidence.processingConfidence >= 0.16 ||
        memory.useHistory.lastYieldEstimate < 0.18
        ? "food_processing"
        : "food_work";
    case "aquatic_food":
    case "animal_food":
      return "food_work";
    case "medicinal_or_toxic":
      return memory.plantObservation?.suspectedProcessingNeed === true || memory.useHistory.visits > 0
        ? "food_processing"
        : undefined;
    case "water_resource":
      return undefined;
  }
}

function repetitionDomainForTrip(taskGroupType: IntraSeasonTripRecord["taskGroupType"]): RepetitionAffordanceDomain {
  switch (taskGroupType) {
    case "memory_refresh_group":
      return "route_use";
    case "water_group":
      return "crossing";
    case "plant_followup_group":
    case "plant_gathering_group":
    case "local_foraging_group":
      return "food_processing";
    case "fishing_group":
    case "hunting_group":
      return "food_work";
  }
}

function deriveRepetitionFeedbackQuality(
  positiveFeedback: number,
  poorFeedback: number,
  attempts: number,
  contextCount: number,
): RepetitionFeedbackQuality {
  if (poorFeedback > positiveFeedback && poorFeedback > 0) {
    return "negative_feedback";
  }
  if (positiveFeedback > 0 && poorFeedback > 0) {
    return "mixed_feedback";
  }
  if (positiveFeedback > 0 && contextCount <= 1) {
    return "context_bound_feedback";
  }
  if (positiveFeedback > 0) {
    return "useful_feedback";
  }
  return "low_feedback";
}

function deriveRepetitionDeadEndRisk(input: {
  readonly positiveFeedback: number;
  readonly poorFeedback: number;
  readonly attempts: number;
  readonly exposure: number;
  readonly source: string;
  readonly contextBound: boolean;
}): RepetitionDeadEndRisk {
  if (input.poorFeedback >= 2 && input.positiveFeedback === 0) {
    return "reinforced_bad_habit";
  }
  if (input.attempts >= 2 && input.positiveFeedback === 0) {
    return "dead_end_attempt";
  }
  if (input.source === "inferred" && input.exposure >= 4 && input.positiveFeedback === 0) {
    return "false_confidence_risk";
  }
  if (input.contextBound) {
    return "local_context_only";
  }
  if (input.attempts === 0 || input.positiveFeedback === 0) {
    return "low_feedback_risk";
  }
  return "low";
}

function deriveRepetitionPotential(
  domain: RepetitionAffordanceDomain,
  exposure: number,
  attempts: number,
  positiveFeedback: number,
  poorFeedback: number,
): RepetitionImprovementPotential {
  if (poorFeedback >= 2 && positiveFeedback === 0) {
    return "none_yet";
  }
  if (positiveFeedback > 0 && attempts + exposure >= 7) {
    return "strong_if_feedback_improves";
  }
  if (
    domain === "fiber_handling" ||
    domain === "food_processing" ||
    domain === "crossing" ||
    domain === "camp_setup"
  ) {
    return exposure + attempts >= 4 ? "possible" : "weak";
  }
  return exposure + attempts >= 6 ? "possible" : "weak";
}

function deriveRepetitionStatus(
  deadEndRisk: RepetitionDeadEndRisk,
  improvementPotential: RepetitionImprovementPotential,
  attempts: number,
  positiveFeedback: number,
): RepetitionFamiliarityStatus {
  switch (deadEndRisk) {
    case "reinforced_bad_habit":
    case "dead_end_attempt":
      return "dead_end_attempt";
    case "false_confidence_risk":
      return "false_confidence_risk";
    case "local_context_only":
      return "local_context_only";
    case "low":
    case "low_feedback_risk":
      break;
  }

  if (improvementPotential === "possible" || improvementPotential === "strong_if_feedback_improves") {
    return "future_practice_potential";
  }
  if (attempts > 0 && positiveFeedback === 0) {
    return "marginal_routine";
  }
  return "familiarity_without_proven_skill";
}

function resourceRepetitionTitle(
  domain: RepetitionAffordanceDomain,
  deadEndRisk: RepetitionDeadEndRisk,
): string {
  if (deadEndRisk === "reinforced_bad_habit" || deadEndRisk === "dead_end_attempt") {
    return "Repeated work may be a dead end";
  }
  switch (domain) {
    case "fiber_handling":
      return "Fiber handling is familiar, not proven";
    case "food_processing":
      return "Food processing questions are recurring";
    case "material_handling":
      return "Material handling is familiar, not a skill";
    case "food_work":
      return "Food work repeats without guaranteed improvement";
    case "crossing":
      return "Crossing repetition creates familiarity only";
    case "camp_setup":
      return "Camp setup repeats often";
    case "route_use":
      return "Route repetition creates familiarity only";
  }
}

function resourceRepetitionSummary(
  domain: RepetitionAffordanceDomain,
  deadEndRisk: RepetitionDeadEndRisk,
): string {
  if (deadEndRisk === "reinforced_bad_habit") {
    return "Repeated attempts may be reinforcing a bad habit or false confidence; future systems must be able to correct it.";
  }
  if (deadEndRisk === "dead_end_attempt") {
    return "Repeated attempts are visible, but the feedback is too weak or poor to treat as improvement.";
  }
  switch (domain) {
    case "fiber_handling":
      return "Fiber handling is repeatedly encountered, but no successful container practice exists yet.";
    case "food_processing":
      return "Plant or seed food-work is repeated enough to create processing questions, but no reliable processing method is known.";
    case "material_handling":
      return "Repeated material encounters are preserved as handling familiarity, not tool skill.";
    case "food_work":
      return "Repeated food work may create practical confidence later, but this pass only records familiarity and feedback quality.";
    case "crossing":
      return "Repeated crossing use creates familiarity, but no crossing aid practice is known.";
    case "camp_setup":
      return "Camp setup is repeated often; this may later support shelter routines if useful feedback accumulates.";
    case "route_use":
      return "Route use is repeated enough to preserve familiarity, but route familiarity is not a travel skill by itself.";
  }
}

function compareRepetitionAffordanceDrafts(left: RepetitionAffordanceDraft, right: RepetitionAffordanceDraft): number {
  return (
    right.score - left.score ||
    domainRank(left.domain) - domainRank(right.domain) ||
    String(left.id).localeCompare(String(right.id))
  );
}

function domainRank(domain: RepetitionAffordanceDomain): number {
  switch (domain) {
    case "fiber_handling":
      return 1;
    case "crossing":
      return 2;
    case "food_processing":
      return 3;
    case "camp_setup":
      return 4;
    case "route_use":
      return 5;
    case "material_handling":
      return 6;
    case "food_work":
      return 7;
  }
}

function potentialRank(potential: RepetitionImprovementPotential): number {
  switch (potential) {
    case "strong_if_feedback_improves":
      return 4;
    case "possible":
      return 3;
    case "weak":
      return 2;
    case "none_yet":
      return 1;
  }
}

function deadEndRiskRank(risk: RepetitionDeadEndRisk): number {
  switch (risk) {
    case "reinforced_bad_habit":
      return 6;
    case "false_confidence_risk":
      return 5;
    case "dead_end_attempt":
      return 4;
    case "local_context_only":
      return 3;
    case "low_feedback_risk":
      return 2;
    case "low":
      return 1;
  }
}

function resourceClassLabel(classId: ResourceClassId): string {
  switch (classId) {
    case "generic_plant_food":
      return "plant food";
    case "aquatic_food":
      return "aquatic food";
    case "animal_food":
      return "animal food";
    case "fallback_food":
      return "fallback food";
    case "fiber_material":
      return "fiber material";
    case "fuel_material":
      return "fuel material";
    case "medicinal_or_toxic":
      return "risky plant material";
    case "water_resource":
      return "water resource";
  }
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function taskGroupLabel(taskGroupType: IntraSeasonTripRecord["taskGroupType"]): string {
  switch (taskGroupType) {
    case "hunting_group":
      return "hunting work";
    case "fishing_group":
      return "fishing work";
    case "plant_gathering_group":
      return "plant gathering";
    case "water_group":
      return "water work";
    case "plant_followup_group":
      return "plant follow-up";
    case "memory_refresh_group":
      return "route refresh";
    case "local_foraging_group":
      return "local foraging";
  }
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
  return deriveCanonicalNutritionState(band.seasonalSupport).foodMovementPressure;
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
