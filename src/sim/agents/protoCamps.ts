import type { BandId, ReasonId, TickNumber, TileId } from "../core/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import type {
  Band,
  IntraSeasonTripRecord,
  ProtoCampActiveStatus,
  ProtoCampBehaviorEffectState,
  ProtoCampFactor,
  ProtoCampLifecycleTrend,
  ProtoCampMemoryState,
  ProtoCampPlaceMemory,
  ProtoCampReasonFamily,
  ProtoCampReasonFamilySummary,
  ProtoCampSeasonalIdentity,
  ProtoCampStateKind,
  ProtoCampUsePressureStatus,
  SeasonalHungerClassification,
} from "./types";
import { deriveProtoCampResourceReasonFactors } from "./resourceEcologyFoundation";

const PROTO_CAMP_MEMORY_CAP = 8;
const MAX_CANDIDATE_TILE_IDS = 18;
const MAX_SUPPORT_HISTORY = 8;
const DISPLAY_REASON_CAP = 4;
const REASON_FAMILY_CAP = 10;

interface ProtoCampEcologyReasonFactors {
  readonly positive: readonly ProtoCampFactor[];
  readonly negative: readonly ProtoCampFactor[];
  readonly pressure: number;
  readonly recovery: number;
  readonly reasonIds: readonly ReasonId[];
}

export function applyProtoCampContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((bandsById, band) => {
      bandsById[String(band.id)] = {
        ...band,
        protoCampMemory: advanceProtoCampMemory(world, band),
      };

      return bandsById;
    }, {});

  return {
    ...world,
    bands: bands as Readonly<Record<BandId, Band>>,
  };
}

export function advanceProtoCampMemory(world: WorldState, band: Band): ProtoCampMemoryState {
  const prior = band.protoCampMemory;
  const candidateIds = collectProtoCampCandidateTileIds(band);
  const places = candidateIds
    .map((tileId) => deriveProtoCampPlace(world, band, tileId, prior?.places[tileId]))
    .filter((place) => place.campLikeState !== "none" || place.tileId === band.position || place.visitCount >= 2)
    .sort(compareProtoCampPlaces);
  const retained = retainBoundedPlaces(places, band.position);
  const placesById = retained.reduce<Record<string, ProtoCampPlaceMemory>>((records, place) => {
    records[String(place.tileId)] = place;
    return records;
  }, {});
  const currentPlace = retained.find((place) => place.tileId === band.position);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    currentPlace,
    topPlaces: retained,
    places: placesById as Readonly<Record<TileId, ProtoCampPlaceMemory>>,
    memoryCap: PROTO_CAMP_MEMORY_CAP,
    candidateTileCap: MAX_CANDIDATE_TILE_IDS,
    displayReasonCap: DISPLAY_REASON_CAP,
    reasonFamilyCap: REASON_FAMILY_CAP,
    droppedLowSalienceCount: Math.max(0, places.length - retained.length) + (prior?.droppedLowSalienceCount ?? 0),
    behavior: deriveProtoCampBehavior(currentPlace, world.time.season),
    reasonIds: collectProtoCampReasonIds(retained),
  };
}

function collectProtoCampCandidateTileIds(band: Band): readonly TileId[] {
  const ids: TileId[] = [band.position];

  if (band.residentialAnchor?.anchorTileId !== undefined) {
    ids.push(band.residentialAnchor.anchorTileId);
  }

  if (band.preDecisionAnchor?.anchorTileId !== undefined) {
    ids.push(band.preDecisionAnchor.anchorTileId);
  }

  for (const tileId of Object.keys(band.anchorMemories ?? {}).slice(0, 12)) {
    ids.push(tileId as TileId);
  }

  for (const memory of Object.values(band.placeMemory)
    .filter((entry) => entry.isReturnPlace || entry.repeatedReturnCount >= 2 || entry.attachment >= 0.35)
    .sort((left, right) => right.attachment - left.attachment)
    .slice(0, 8)) {
    ids.push(memory.tileId);
  }

  for (const trip of band.recentIntraSeasonTrips?.slice(0, 6) ?? []) {
    ids.push(trip.originTileId, trip.targetTileId);
  }

  for (const move of band.recentResidentialMoveEvents?.slice(0, 4) ?? []) {
    ids.push(move.fromTileId, move.toTileId);
    if (move.temporaryWatercraft?.sourceTileId !== undefined) {
      ids.push(move.temporaryWatercraft.sourceTileId);
    }
    if (move.temporaryWatercraft?.targetTileId !== undefined) {
      ids.push(move.temporaryWatercraft.targetTileId);
    }
  }

  if (band.deathMemory?.placeTileId !== undefined) {
    ids.push(band.deathMemory.placeTileId);
  }

  for (const place of band.protoCampMemory?.topPlaces ?? []) {
    ids.push(place.tileId);
  }

  return uniqueTileIds(ids).slice(0, MAX_CANDIDATE_TILE_IDS);
}

function deriveProtoCampPlace(
  world: WorldState,
  band: Band,
  tileId: TileId,
  prior: ProtoCampPlaceMemory | undefined,
): ProtoCampPlaceMemory {
  const tile = getTile(world, tileId);
  const current = tileId === band.position;
  const placeMemory = band.placeMemory[tileId];
  const anchorMemory = band.anchorMemories?.[tileId];
  const support = current ? band.seasonalSupport : undefined;
  const supportHistory = updateSupportHistory(prior?.seasonalSupportHistory ?? [], support?.hungerClassification);
  const activityCounts = countNearbyActivity(world, band, tileId);
  const moveHardship = countMoveHardship(band, tileId);
  const deathMemoryNearby = current || band.deathMemory?.placeTileId === tileId
    ? band.deathMemory?.deathMemorySeverity ?? 0
    : 0;
  const churn = current ? band.demography.demographicChurn : undefined;
  const residentialAnchorUseCount = Math.max(
    anchorMemory?.anchoredSeasonCount ?? 0,
    current && band.residentialAnchor?.anchorTileId === tileId ? band.residentialAnchor.seasonsAnchored : 0,
  );
  const visitCount = getVisitCount(world, band, tileId, prior, current, placeMemory?.visitCount ?? 0, residentialAnchorUseCount);
  const consecutiveUseCount = current ? Math.max(band.consecutiveSeasonsOnTile, band.residentialAnchor?.seasonsAnchored ?? 0, 1) : 0;
  const seasonsUsed = collectSeasonsUsed(world, prior, placeMemory, anchorMemory?.bestSeason, current);
  const waterRefugeReliability = getWaterRefugeReliability(band, tileId, placeMemory, anchorMemory);
  const knownKinContactNearby = getKnownKinContactNearby(world, band, tile);
  const socialCrowdingPressureNearby = current
    ? Math.max(band.socialTension?.crowdedKinResourcePressure ?? 0, band.pressureState?.nearbyBandPressure ?? 0)
    : 0;
  const localUsePressure = band.usePressure[tileId]?.recentUseIntensity ?? 0;
  const weakBandRemnantUse = current && (
    band.viability?.weakBandFate === "stable_remnant" ||
    band.viability?.weakBandFate === "collapse_risk" ||
    band.viability?.weakBandClassification === "stable_small_remnant"
  );
  const resourceFactors = deriveProtoCampResourceReasonFactors(world, band, tileId, current);
  const crossingFactors = deriveProtoCampCrossingReasonFactors(band, tileId);
  const ecologyFactors = deriveProtoCampEcologyReasonFactors(world, band, tileId, localUsePressure);
  const positiveReasonRaw = collectPositiveReasons({
    visitCount,
    consecutiveUseCount,
    seasonsUsed,
    waterRefugeReliability,
    supportHistory,
    activitySuccessCountNearby: activityCounts.success,
    residentialAnchorUseCount,
    movementHardshipAvoidedByStaying: moveHardship.avoided,
    deathMemoryNearby,
    knownKinContactNearby,
    weakBandRemnantUse,
    tile,
    band,
    current,
    resourceFactors: [...resourceFactors.positive, ...crossingFactors.positive, ...ecologyFactors.positive],
  });
  const staleYears = getStaleYears(world, prior, current);
  const negativeReasonRaw = collectNegativeReasons({
    supportHistory,
    activityFailureCountNearby: activityCounts.failure,
    migrationHardshipLinkedToLeaving: moveHardship.leaving,
    deathMemoryNearby,
    deathsWhileAnchoredLast10Years: churn?.deathsLast10Years ?? prior?.deathsWhileAnchoredLast10Years ?? 0,
    socialCrowdingPressureNearby,
    localUsePressure,
    staleYears,
    band,
    current,
    resourceFactors: [...resourceFactors.negative, ...crossingFactors.negative, ...ecologyFactors.negative],
  });
  const reasonFamilies = buildReasonFamilySummaries(positiveReasonRaw, negativeReasonRaw);
  const positiveReasons = compressDisplayReasons(positiveReasonRaw, reasonFamilies, "positive");
  const negativeReasons = compressDisplayReasons(negativeReasonRaw, reasonFamilies, "negative");
  const positiveScore = sumFactorStrengths(positiveReasonRaw);
  const negativeScore = sumFactorStrengths(negativeReasonRaw);
  const campLikeScore = round2(clamp01(positiveScore - negativeScore * 0.62));
  const storageProcessingScore = familyPositiveStrength(reasonFamilies, "storage_processing");
  const crossingUseScore = familyPositiveStrength(reasonFamilies, "crossing_mobility");
  const ecologicalPressure = round2(clamp01(Math.max(ecologyFactors.pressure, localUsePressure)));
  const ecologicalRecovery = round2(clamp01(ecologyFactors.recovery));
  const activityTotal = activityCounts.success + activityCounts.failure;
  const activitySuccessTrend = activityTotal === 0 ? 0 : round2(clamp01(activityCounts.success / activityTotal));
  const activityFailureTrend = activityTotal === 0 ? 0 : round2(clamp01(activityCounts.failure / activityTotal));
  const campLikeState = classifyProtoCampState({
    prior,
    current,
    campLikeScore,
    positiveScore,
    negativeScore,
    visitCount,
    seasonsUsed,
    waterRefugeReliability,
    activitySuccessCountNearby: activityCounts.success,
    residentialAnchorUseCount,
    socialCrowdingPressureNearby,
    weakBandRemnantUse,
    staleYears,
    supportHistory,
    deathsWhileAnchoredLast10Years: churn?.deathsLast10Years ?? prior?.deathsWhileAnchoredLast10Years ?? 0,
    storageProcessingScore,
    crossingUseScore,
    ecologicalPressure,
    ecologicalRecovery,
  });
  const activeStatus = classifyActiveStatus(campLikeState, current, staleYears, socialCrowdingPressureNearby);
  const lifecycleTrend = deriveLifecycleTrend({
    prior,
    current,
    campLikeScore,
    positiveScore,
    negativeScore,
    ecologicalPressure,
    ecologicalRecovery,
    staleYears,
    state: campLikeState,
  });
  const seasonalIdentity = deriveSeasonalIdentity({
    season: world.time.season,
    seasonsUsed,
    waterRefugeReliability,
    storageProcessingScore,
    crossingUseScore,
    ecologicalRecovery,
    state: campLikeState,
    supportHistory,
    reasonFamilies,
  });
  const usePressureStatus = deriveUsePressureStatus(ecologicalPressure, ecologicalRecovery, localUsePressure, current);
  const confidence = round2(clamp01(
    Math.min(1, visitCount / 8) * 0.32 +
      Math.min(1, seasonsUsed.length / 4) * 0.18 +
      waterRefugeReliability * 0.18 +
      Math.min(1, residentialAnchorUseCount / 5) * 0.2 +
      (placeMemory?.confidence ?? 0) * 0.12,
  ));

  return {
    tileId,
    bandId: band.id,
    firstObservedTick: prior?.firstObservedTick ?? world.time.tick,
    lastUsedTick: current ? world.time.tick : prior?.lastUsedTick ?? placeMemory?.lastReturnAt?.tick ?? world.time.tick,
    lastUsedYear: current ? world.time.year : prior?.lastUsedYear ?? world.time.year,
    lastUsedSeason: current ? world.time.season : prior?.lastUsedSeason ?? world.time.season,
    visitCount,
    consecutiveUseCount,
    seasonsUsed,
    returnIntervalTicks: placeMemory?.returnIntervalTicks ?? prior?.returnIntervalTicks,
    waterRefugeReliability,
    seasonalSupportHistory: supportHistory,
    activitySuccessCountNearby: activityCounts.success,
    activityFailureCountNearby: activityCounts.failure,
    residentialAnchorUseCount,
    movementHardshipAvoidedByStaying: moveHardship.avoided,
    migrationHardshipLinkedToLeaving: moveHardship.leaving,
    deathMemoryNearby: round2(deathMemoryNearby),
    birthsWhileAnchoredLast10Years: churn?.birthsLast10Years ?? prior?.birthsWhileAnchoredLast10Years ?? 0,
    deathsWhileAnchoredLast10Years: churn?.deathsLast10Years ?? prior?.deathsWhileAnchoredLast10Years ?? 0,
    weakBandRemnantUse,
    knownKinContactNearby: round2(knownKinContactNearby),
    socialCrowdingPressureNearby: round2(socialCrowdingPressureNearby),
    storageProcessingScore,
    crossingUseScore,
    ecologicalPressure,
    ecologicalRecovery,
    activitySuccessTrend,
    activityFailureTrend,
    campLikeScore,
    campLikeState,
    activeStatus,
    lifecycleTrend,
    seasonalIdentity,
    usePressureStatus,
    reasonFamilies,
    positiveReasons,
    negativeReasons,
    displayPositiveReasons: positiveReasons,
    displayNegativeReasons: negativeReasons,
    rawPositiveReasonCount: positiveReasonRaw.length,
    rawNegativeReasonCount: negativeReasonRaw.length,
    topReasons: [
      ...positiveReasons.slice(0, 3).map((reason) => `+ ${reason.reason}`),
      ...negativeReasons.slice(0, 3).map((reason) => `- ${reason.reason}`),
    ],
    confidence,
    staleYears,
    decay: round2(clamp01(staleYears / 12)),
    reasonIds: uniqueStrings([
      ...collectPlaceReasonIds(band, tileId, placeMemory?.reasonIds ?? [], anchorMemory?.reasonIds ?? []).map(String),
      ...resourceFactors.reasonIds.map(String),
      ...crossingFactors.reasonIds.map(String),
      ...ecologyFactors.reasonIds.map(String),
    ]).slice(0, 12).map((value) => value as ReasonId),
  };
}

function deriveProtoCampBehavior(
  currentPlace: ProtoCampPlaceMemory | undefined,
  season: string,
): ProtoCampBehaviorEffectState {
  if (
    currentPlace === undefined ||
    currentPlace.campLikeState === "none" ||
    currentPlace.campLikeState === "abandoned_camp_trace" ||
    currentPlace.campLikeState === "stale_remembered_camp"
  ) {
    return emptyBehavior(currentPlace?.tileId);
  }

  const contested = currentPlace.campLikeState === "contested_camp_like_place";
  const fragile = currentPlace.campLikeState === "fragile_camp_like_place" || currentPlace.usePressureStatus === "overused";
  const returnBias = contested ? 0 : round2(clamp01(currentPlace.campLikeScore * 0.18 + currentPlace.confidence * 0.06));
  const seasonalReturnBias = currentPlace.campLikeState === "seasonal_return_place" || currentPlace.campLikeState === "persistent_camp_candidate"
    ? round2(clamp01(returnBias + currentPlace.seasonsUsed.length / 20))
    : 0;
  const drySeasonAnchorBias = currentPlace.campLikeState === "refuge_anchor" && (season === "summer" || season === "winter")
    ? round2(clamp01(returnBias + currentPlace.waterRefugeReliability * 0.12))
    : 0;
  const contestedMoveAwayPressure = contested
    ? round2(clamp01(currentPlace.socialCrowdingPressureNearby * 0.22 + currentPlace.campLikeScore * 0.08))
    : 0;
  const weakRemnantHoldBias = currentPlace.campLikeState === "remnant_holdout"
    ? round2(clamp01(returnBias + 0.08))
    : 0;
  const processingCampReturnBias = currentPlace.campLikeState === "storage_processing_candidate" || currentPlace.seasonalIdentity === "autumn_processing_candidate"
    ? round2(Math.min(0.08, currentPlace.storageProcessingScore * 0.32 + currentPlace.confidence * 0.03))
    : 0;
  const crossingCampRouteBias = currentPlace.campLikeState === "crossing_camp" || currentPlace.seasonalIdentity === "seasonal_crossing_camp"
    ? round2(Math.min(0.08, currentPlace.crossingUseScore * 0.34 + currentPlace.confidence * 0.03))
    : 0;
  const restOverusedCampBias = fragile
    ? round2(Math.min(0.08, currentPlace.ecologicalPressure * 0.12 + currentPlace.deathMemoryNearby * 0.06))
    : 0;

  return {
    currentTileId: currentPlace.tileId,
    returnBias,
    seasonalReturnBias,
    drySeasonAnchorBias,
    riskyMoveCautionBias: round2(clamp01(returnBias * 0.4 + currentPlace.deathMemoryNearby * 0.12)),
    contestedMoveAwayPressure,
    weakRemnantHoldBias,
    processingCampReturnBias,
    crossingCampRouteBias,
    restOverusedCampBias,
    topBehaviorReasons: currentPlace.topReasons.slice(0, 4),
    reversible: true,
    noSedentism: true,
    noStorageEconomy: true,
    noTerritory: true,
  };
}

function emptyBehavior(tileId?: TileId): ProtoCampBehaviorEffectState {
  return {
    currentTileId: tileId,
    returnBias: 0,
    seasonalReturnBias: 0,
    drySeasonAnchorBias: 0,
    riskyMoveCautionBias: 0,
    contestedMoveAwayPressure: 0,
    weakRemnantHoldBias: 0,
    processingCampReturnBias: 0,
    crossingCampRouteBias: 0,
    restOverusedCampBias: 0,
    topBehaviorReasons: [],
    reversible: true,
    noSedentism: true,
    noStorageEconomy: true,
    noTerritory: true,
  };
}

function collectPositiveReasons(input: {
  readonly visitCount: number;
  readonly consecutiveUseCount: number;
  readonly seasonsUsed: readonly string[];
  readonly waterRefugeReliability: number;
  readonly supportHistory: readonly SeasonalHungerClassification[];
  readonly activitySuccessCountNearby: number;
  readonly residentialAnchorUseCount: number;
  readonly movementHardshipAvoidedByStaying: number;
  readonly deathMemoryNearby: number;
  readonly knownKinContactNearby: number;
  readonly weakBandRemnantUse: boolean;
  readonly tile: Tile | undefined;
  readonly band: Band;
  readonly current: boolean;
  readonly resourceFactors: readonly ProtoCampFactor[];
}): readonly ProtoCampFactor[] {
  const reasons: ProtoCampFactor[] = [];
  if (input.visitCount >= 2) {
    reasons.push(factor("repeated return/use", Math.min(0.22, input.visitCount / 40), "PlaceMemory.visitCount + prior protoCampMemory", "seasonal_round"));
  }
  if (input.consecutiveUseCount >= 2) {
    reasons.push(factor("consecutive residential use", Math.min(0.14, input.consecutiveUseCount / 35), "Band.consecutiveSeasonsOnTile / ResidentialAnchorState.seasonsAnchored", "seasonal_round"));
  }
  if (input.seasonsUsed.length >= 2) {
    reasons.push(factor("used across multiple seasons", Math.min(0.14, input.seasonsUsed.length / 24), "PlaceMemory.seasonsObserved + current season", "seasonal_round"));
  }
  if (input.waterRefugeReliability >= 0.45) {
    reasons.push(factor("reliable water/refuge basis", input.waterRefugeReliability * 0.2, "ResidentialAnchorState / AnchorMemoryRecord / PlaceMemory water stress", "water_refuge"));
  }
  if (input.supportHistory.some((state) => state === "seasonal_pulse_recovery" || state === "recovery_after_crisis")) {
    reasons.push(factor("seasonal recovery/pulse remembered here", 0.1, "SeasonalSupportState.hungerClassification", "seasonal_round"));
  }
  if (input.activitySuccessCountNearby > 0) {
    reasons.push(factor("successful activity nearby", Math.min(0.16, input.activitySuccessCountNearby * 0.04), "recentIntraSeasonTrips / ActivityOutcomeSummary", "activity_success"));
  }
  if (input.residentialAnchorUseCount > 0) {
    reasons.push(factor("residential anchor memory", Math.min(0.18, input.residentialAnchorUseCount * 0.04), "AnchorMemoryRecord.anchoredSeasonCount", "seasonal_round"));
  }
  if (input.movementHardshipAvoidedByStaying > 0) {
    reasons.push(factor("staying avoids recent route hardship", input.movementHardshipAvoidedByStaying * 0.08, "recentResidentialMoveEvents.hardship", "crossing_mobility"));
  }
  if (input.knownKinContactNearby > 0.2) {
    reasons.push(factor("known kin/contact nearby", input.knownKinContactNearby * 0.08, "contactMemories / grounded kin", "social_shared_use"));
  }
  if (input.weakBandRemnantUse) {
    reasons.push(factor("weak remnant holding at familiar refuge", 0.14, "Band.viability.weakBandFate", "risk_hardship"));
  }
  if (input.current && input.band.innerFission?.splitDelayed === true) {
    reasons.push(factor("split/move pressure delayed by unsafe conditions", 0.05, "Band.innerFission.splitDelayed", "risk_hardship"));
  }
  reasons.push(...input.resourceFactors);

  return reasons.sort(compareFactors);
}

function collectNegativeReasons(input: {
  readonly supportHistory: readonly SeasonalHungerClassification[];
  readonly activityFailureCountNearby: number;
  readonly migrationHardshipLinkedToLeaving: number;
  readonly deathMemoryNearby: number;
  readonly deathsWhileAnchoredLast10Years: number;
  readonly socialCrowdingPressureNearby: number;
  readonly localUsePressure: number;
  readonly staleYears: number;
  readonly band: Band;
  readonly current: boolean;
  readonly resourceFactors: readonly ProtoCampFactor[];
}): readonly ProtoCampFactor[] {
  const reasons: ProtoCampFactor[] = [];
  if (input.supportHistory.some((state) => state === "chronic_food_deficit" || state === "chronic_plus_seasonal_stress" || state === "crisis_deficit")) {
    reasons.push(factor("chronic/severe hunger while using this place", 0.14, "SeasonalSupportState.hungerClassification", "risk_hardship"));
  }
  if (input.supportHistory.some((state) => state === "chronic_water_deficit")) {
    reasons.push(factor("chronic water deficit", 0.12, "SeasonalSupportState.hungerClassification", "water_refuge"));
  }
  if (input.activityFailureCountNearby > 0) {
    reasons.push(factor("activity failures nearby", Math.min(0.1, input.activityFailureCountNearby * 0.035), "recentIntraSeasonTrips.activityOutcome", "activity_success"));
  }
  if (input.migrationHardshipLinkedToLeaving > 0) {
    reasons.push(factor("hardship linked to leaving/reaching this place", input.migrationHardshipLinkedToLeaving * 0.12, "recentResidentialMoveEvents.hardship", "crossing_mobility"));
  }
  if (input.deathMemoryNearby > 0) {
    reasons.push(factor("death memory nearby", input.deathMemoryNearby * 0.16, "Band.deathMemory", "death_memory"));
  }
  if (input.deathsWhileAnchoredLast10Years >= 3) {
    reasons.push(factor("deaths occurred while anchored here", Math.min(0.14, input.deathsWhileAnchoredLast10Years * 0.025), "DemographicChurnState.deathsLast10Years", "death_memory"));
  }
  if (input.socialCrowdingPressureNearby >= 0.25) {
    reasons.push(factor("crowded/contested kin-resource pressure", input.socialCrowdingPressureNearby * 0.18, "Band.socialTension / BandPressureState", "social_shared_use"));
  }
  if (input.localUsePressure >= 0.35) {
    reasons.push(factor("local overuse pressure", input.localUsePressure * 0.12, "LocalUsePressureRecord.recentUseIntensity", "overuse_recovery"));
  }
  if (!input.current && input.staleYears >= 5) {
    reasons.push(factor("memory is stale", Math.min(0.14, input.staleYears / 80), "ProtoCampPlaceMemory.lastUsedYear", "knowledge_confidence"));
  }
  if (input.current && input.band.socialTension?.tolerance !== undefined && input.band.socialTension.tolerance <= 0.05) {
    reasons.push(factor("hostile social tension", 0.1, "Band.socialTension.tolerance", "social_shared_use"));
  }
  reasons.push(...input.resourceFactors);

  return reasons.sort(compareFactors);
}

function classifyProtoCampState(input: {
  readonly prior: ProtoCampPlaceMemory | undefined;
  readonly current: boolean;
  readonly campLikeScore: number;
  readonly positiveScore: number;
  readonly negativeScore: number;
  readonly visitCount: number;
  readonly seasonsUsed: readonly string[];
  readonly waterRefugeReliability: number;
  readonly activitySuccessCountNearby: number;
  readonly residentialAnchorUseCount: number;
  readonly socialCrowdingPressureNearby: number;
  readonly weakBandRemnantUse: boolean;
  readonly staleYears: number;
  readonly supportHistory: readonly SeasonalHungerClassification[];
  readonly deathsWhileAnchoredLast10Years: number;
  readonly storageProcessingScore: number;
  readonly crossingUseScore: number;
  readonly ecologicalPressure: number;
  readonly ecologicalRecovery: number;
}): ProtoCampStateKind {
  const previouslyCampLike = input.prior !== undefined && input.prior.campLikeState !== "none";
  if (
    previouslyCampLike &&
    !input.current &&
    (input.staleYears >= 7 || input.negativeScore > input.positiveScore + 0.18 || input.deathsWhileAnchoredLast10Years >= 5)
  ) {
    return "abandoned_camp_trace";
  }

  if (previouslyCampLike && !input.current && input.staleYears >= 4) {
    return "stale_remembered_camp";
  }

  if (input.campLikeScore < 0.18 && input.visitCount < 2 && input.residentialAnchorUseCount < 1) {
    return "none";
  }

  if (
    input.campLikeScore >= 0.2 &&
    (input.ecologicalPressure >= 0.5 || input.deathsWhileAnchoredLast10Years >= 3 || input.negativeScore >= input.positiveScore * 0.75)
  ) {
    return "fragile_camp_like_place";
  }

  if (input.socialCrowdingPressureNearby >= 0.35 && input.campLikeScore >= 0.24) {
    return "contested_camp_like_place";
  }

  if (input.weakBandRemnantUse && input.campLikeScore >= 0.22) {
    return "remnant_holdout";
  }

  if (input.crossingUseScore >= 0.08 && input.campLikeScore >= 0.2) {
    return "crossing_camp";
  }

  if (input.storageProcessingScore >= 0.1 && input.campLikeScore >= 0.22) {
    return "storage_processing_candidate";
  }

  if (input.activitySuccessCountNearby >= 2 && input.campLikeScore >= 0.28) {
    return "activity_base";
  }

  if (
    input.waterRefugeReliability >= 0.55 &&
    input.campLikeScore >= 0.24 &&
    (input.residentialAnchorUseCount >= 1 || input.visitCount >= 2 || hasSevereSupportPressure(input.supportHistory))
  ) {
    return "refuge_anchor";
  }

  if (input.seasonsUsed.length >= 2 && input.visitCount >= 3 && input.campLikeScore >= 0.28) {
    return "seasonal_return_place";
  }

  if ((input.visitCount >= 4 && input.seasonsUsed.length >= 2 && input.campLikeScore >= 0.34) || input.campLikeScore >= 0.56) {
    return "persistent_camp_candidate";
  }

  if (input.campLikeScore >= 0.48) {
    return "proto_camp_candidate";
  }

  if (input.visitCount >= 2 || input.residentialAnchorUseCount >= 1) {
    return "repeated_stop";
  }

  return "none";
}

function classifyActiveStatus(
  state: ProtoCampStateKind,
  current: boolean,
  staleYears: number,
  crowding: number,
): ProtoCampActiveStatus {
  if (state === "abandoned_camp_trace") {
    return "abandoned";
  }
  if (state === "stale_remembered_camp") {
    return "stale";
  }
  if (state === "contested_camp_like_place" || crowding >= 0.35) {
    return "contested";
  }
  if (!current && staleYears >= 4) {
    return "stale";
  }
  return "active";
}

function retainBoundedPlaces(
  places: readonly ProtoCampPlaceMemory[],
  currentTileId: TileId,
): readonly ProtoCampPlaceMemory[] {
  const current = places.find((place) => place.tileId === currentTileId);
  const ranked = places.filter((place) => place.tileId !== currentTileId).slice(0, PROTO_CAMP_MEMORY_CAP - (current === undefined ? 0 : 1));
  return current === undefined ? ranked : [current, ...ranked];
}

function collectSeasonsUsed(
  world: WorldState,
  prior: ProtoCampPlaceMemory | undefined,
  placeMemory: Band["placeMemory"][TileId] | undefined,
  anchorBestSeason: string | undefined,
  current: boolean,
): readonly ProtoCampPlaceMemory["lastUsedSeason"][] {
  const seasons = [
    ...(prior?.seasonsUsed ?? []),
    ...(placeMemory?.seasonsObserved ?? []),
    ...(anchorBestSeason === undefined ? [] : [anchorBestSeason as ProtoCampPlaceMemory["lastUsedSeason"]]),
    ...(current ? [world.time.season] : []),
  ];

  return uniqueStrings(seasons).filter(isSeason);
}

function updateSupportHistory(
  prior: readonly SeasonalHungerClassification[],
  current: SeasonalHungerClassification | undefined,
): readonly SeasonalHungerClassification[] {
  return uniqueStrings([
    ...(current === undefined ? [] : [current]),
    ...prior,
  ]).filter(isSeasonalSupportClassification).slice(0, MAX_SUPPORT_HISTORY);
}

function getVisitCount(
  world: WorldState,
  band: Band,
  tileId: TileId,
  prior: ProtoCampPlaceMemory | undefined,
  current: boolean,
  placeVisitCount: number,
  anchorUseCount: number,
): number {
  const alreadyUpdatedThisTick = prior?.lastUsedTick === world.time.tick;
  const currentIncrement = current && !alreadyUpdatedThisTick ? 1 : 0;
  const movementVisits = (band.recentResidentialMoveEvents ?? []).filter((move) => move.toTileId === tileId).length;

  return Math.min(999, Math.max(prior?.visitCount ?? 0, placeVisitCount, anchorUseCount + movementVisits) + currentIncrement);
}

function getWaterRefugeReliability(
  band: Band,
  tileId: TileId,
  placeMemory: Band["placeMemory"][TileId] | undefined,
  anchorMemory: NonNullable<Band["anchorMemories"]>[TileId] | undefined,
): number {
  const currentAnchor = band.residentialAnchor?.anchorTileId === tileId ? band.residentialAnchor.anchorWaterSecurity : 0;
  const memoryWater = placeMemory?.lastKnownWaterStress === undefined ? 0 : clamp01(1 - placeMemory.lastKnownWaterStress);

  return round2(Math.max(
    currentAnchor,
    anchorMemory?.drySeasonReliability ?? 0,
    memoryWater,
    placeMemory?.valences.includes("reliable") === true ? 0.5 : 0,
  ));
}

function countNearbyActivity(
  world: WorldState,
  band: Band,
  tileId: TileId,
): { readonly success: number; readonly failure: number } {
  const tile = getTile(world, tileId);
  let success = 0;
  let failure = 0;

  for (const trip of band.recentIntraSeasonTrips ?? []) {
    if (!isNearTile(world, tile, trip.targetTileId, 2)) {
      continue;
    }
    if (isSuccessfulActivityTrip(trip)) {
      success += 1;
    } else if (isFailedActivityTrip(trip)) {
      failure += 1;
    }
  }

  if (tileId === band.position && band.activityOutcomeSummary !== undefined) {
    success += band.activityOutcomeSummary.successCount + band.activityOutcomeSummary.partialCount;
    failure += band.activityOutcomeSummary.failedCount;
  }

  return { success, failure };
}

function countMoveHardship(
  band: Band,
  tileId: TileId,
): { readonly avoided: number; readonly leaving: number } {
  let avoided = 0;
  let leaving = 0;

  for (const move of band.recentResidentialMoveEvents ?? []) {
    const hardship = hardshipStrength(move.hardshipLevel);
    if (move.fromTileId === tileId) {
      leaving = Math.max(leaving, hardship);
    }
    if (move.toTileId === tileId && move.hardshipOutcome !== "rejected") {
      avoided = Math.max(avoided, Math.max(0, hardship - 0.1));
    }
  }

  return { avoided: round2(avoided), leaving: round2(leaving) };
}

function deriveProtoCampEcologyReasonFactors(
  world: WorldState,
  band: Band,
  tileId: TileId,
  localUsePressure: number,
): ProtoCampEcologyReasonFactors {
  const tile = getTile(world, tileId);
  const positive: ProtoCampFactor[] = [];
  const negative: ProtoCampFactor[] = [];
  const reasonIds: string[] = [];
  let pressure = localUsePressure;
  let recovery = 0;

  for (const card of (band.resourceEcology?.storageSuitabilityCards ?? [])
    .filter((entry) => entry.sourceTileIds.length === 0 || entry.sourceTileIds.some((sourceTileId) => isNearTile(world, tile, sourceTileId, 2)))
    .slice(0, 6)) {
    reasonIds.push(...card.sourceIds.map((sourceId) => `storage:${sourceId}`));
    if (
      card.protoCampRelevance === "processing_place" ||
      card.protoCampRelevance === "cache_place" ||
      card.storageSuitability === "excellent" ||
      card.storageSuitability === "good" ||
      card.seasonalBufferValue === "high"
    ) {
      positive.push(factor(
        `${card.label} gives this place short-term processing/seasonal value`,
        Math.min(0.13, 0.04 + card.storageConfidence * 0.1),
        "Band.resourceEcology.storageSuitabilityCards",
        "storage_processing",
      ));
    }
    if (card.crossingMaterialUse !== "none" || card.protoCampRelevance === "material_place") {
      positive.push(factor(
        `${card.label} supports temporary crossing material`,
        Math.min(0.1, 0.035 + card.storageConfidence * 0.08),
        "Band.resourceEcology.storageSuitabilityCards",
        "crossing_mobility",
      ));
    }
    if (card.perishability === "high" || card.spoilageRisk === "high" || card.carryBurden === "high" || card.processingLabor === "high") {
      negative.push(factor(
        `${card.label} is useful but costly to keep or carry`,
        Math.min(0.1, 0.035 + card.storageConfidence * 0.07),
        "Band.resourceEcology.storageSuitabilityCards",
        "storage_processing",
      ));
    }
  }

  for (const card of (band.visibleNature?.plantCards ?? [])
    .filter((entry) => isNearTile(world, tile, entry.tileId, 2))
    .slice(0, 5)) {
    reasonIds.push(`visible-plant:${card.patchId}`);
    pressure = Math.max(pressure, card.pressure, card.depletion);
    recovery = Math.max(recovery, card.recovery);
    if (card.plantPatchEffect === "seasonal_pulse" || card.plantPatchEffect === "fallback_food" || card.plantPatchEffect === "recovering" || card.reliability >= 0.55) {
      positive.push(factor(
        `${card.label} links this place to known plant work`,
        Math.min(0.12, 0.035 + card.confidence * 0.06 + card.reliability * 0.04),
        "Band.visibleNature.plantCards",
        card.plantPatchEffect === "recovering" ? "overuse_recovery" : "plants",
      ));
    }
    if (card.useStatus === "overused" || card.plantPatchEffect === "overused" || card.pressure >= 0.45 || card.depletion >= 0.45) {
      negative.push(factor(
        `${card.label} shows plant pressure near the camp`,
        Math.min(0.13, 0.04 + Math.max(card.pressure, card.depletion) * 0.1),
        "Band.visibleNature.plantCards",
        "overuse_recovery",
      ));
    }
    if (card.plantPatchEffect === "risky_or_avoided" || card.useStatus === "avoided") {
      negative.push(factor(
        `${card.label} is remembered as risky/avoided food`,
        Math.min(0.09, 0.035 + card.confidence * 0.06),
        "Band.visibleNature.plantCards",
        "risk_hardship",
      ));
    }
  }

  for (const card of (band.visibleNature?.aquaticCards ?? [])
    .filter((entry) => isCardNearTile(world, tile, entry.anchorTileId, entry.seenTileIds, 2))
    .slice(0, 4)) {
    reasonIds.push(`visible-aquatic:${card.stockId}`);
    pressure = Math.max(pressure, card.pressure);
    recovery = Math.max(recovery, card.recovery);
    if (card.aquaticEffect === "fish_pulse" || card.aquaticEffect === "winter_buffer" || card.aquaticEffect === "wetland_buffer" || card.reliability >= 0.52) {
      positive.push(factor(
        `${card.label} makes this a known aquatic buffer place`,
        Math.min(0.13, 0.04 + card.confidence * 0.05 + card.reliability * 0.06),
        "Band.visibleNature.aquaticCards",
        "aquatic",
      ));
    }
    if (card.aquaticEffect === "overfished" || card.aquaticEffect === "poor_water_food" || card.pressure >= 0.45 || card.riskDifficulty >= 0.55) {
      negative.push(factor(
        `${card.label} is pressured or risky near this place`,
        Math.min(0.12, 0.04 + Math.max(card.pressure, card.riskDifficulty) * 0.08),
        "Band.visibleNature.aquaticCards",
        card.aquaticEffect === "overfished" ? "overuse_recovery" : "aquatic",
      ));
    }
  }

  for (const card of (band.visibleNature?.forestCards ?? [])
    .filter((entry) => isNearTile(world, tile, entry.tileId, 2))
    .slice(0, 4)) {
    reasonIds.push(`visible-forest:${card.patchId}`);
    pressure = Math.max(pressure, card.pressure, card.diebackTrend);
    recovery = Math.max(recovery, card.recovery);
    if (card.shadeRefugeValue >= 0.35 || card.woodFuelMaterialHook >= 0.35 || card.perception.includes("sheltering") || card.perception.includes("good_for_fruits_nuts")) {
      positive.push(factor(
        `${card.label} supports shelter/material use near camp`,
        Math.min(0.12, 0.035 + Math.max(card.shadeRefugeValue, card.woodFuelMaterialHook) * 0.1),
        "Band.visibleNature.forestCards",
        "forest",
      ));
    }
    if (card.perception.includes("recovering") || card.recovery >= 0.42) {
      positive.push(factor(
        `${card.label} shows recovery after rest`,
        Math.min(0.1, 0.035 + card.recovery * 0.08),
        "Band.visibleNature.forestCards",
        "overuse_recovery",
      ));
    }
    if (card.perception.includes("overused") || card.pressure >= 0.45 || card.diebackTrend >= 0.35) {
      negative.push(factor(
        `${card.label} shows tree/forest wear near camp`,
        Math.min(0.13, 0.04 + Math.max(card.pressure, card.diebackTrend) * 0.09),
        "Band.visibleNature.forestCards",
        "overuse_recovery",
      ));
    }
  }

  for (const card of (band.visibleNature?.faunaCards ?? [])
    .filter((entry) => isCardNearTile(world, tile, entry.anchorTileId, entry.seenTileIds, 3))
    .slice(0, 4)) {
    reasonIds.push(`visible-fauna:${card.stockId}`);
    pressure = Math.max(pressure, card.huntingOrFishingPressure, card.wariness);
    if (card.routeReliability >= 0.5 || card.knownness === "reliable_route" || card.usefulness === "high_value" || card.usefulness === "promising") {
      positive.push(factor(
        `${card.label} keeps this place tied to a known animal route`,
        Math.min(0.11, 0.035 + card.routeReliability * 0.06 + card.confidence * 0.04),
        "Band.visibleNature.faunaCards",
        "fauna",
      ));
    }
    if (card.huntingOrFishingPressure >= 0.42 || card.wariness >= 0.45 || card.risk >= 0.55 || card.knownness === "danger_caution") {
      negative.push(factor(
        `${card.label} is wary/risky after nearby use`,
        Math.min(0.12, 0.04 + Math.max(card.huntingOrFishingPressure, card.wariness, card.risk) * 0.08),
        "Band.visibleNature.faunaCards",
        "fauna",
      ));
    }
  }

  return {
    positive: positive.sort(compareFactors).slice(0, 10),
    negative: negative.sort(compareFactors).slice(0, 10),
    pressure: round2(clamp01(pressure)),
    recovery: round2(clamp01(recovery)),
    reasonIds: uniqueStrings(reasonIds).slice(0, 10).map((value) => value as ReasonId),
  };
}

function deriveProtoCampCrossingReasonFactors(
  band: Band,
  tileId: TileId,
): {
  readonly positive: readonly ProtoCampFactor[];
  readonly negative: readonly ProtoCampFactor[];
  readonly reasonIds: readonly ReasonId[];
} {
  const positive: ProtoCampFactor[] = [];
  const negative: ProtoCampFactor[] = [];
  const reasonIds: string[] = [];

  for (const move of band.recentResidentialMoveEvents?.slice(0, 4) ?? []) {
    const crossing = move.temporaryWatercraft;
    if (crossing === undefined) {
      continue;
    }
    const linked =
      move.fromTileId === tileId ||
      move.toTileId === tileId ||
      crossing.sourceTileId === tileId ||
      crossing.targetTileId === tileId;
    if (!linked) {
      continue;
    }

    reasonIds.push(...crossing.reasonIds.map(String));
    if (crossing.result === "crossing_success" || crossing.result === "crossing_partial_success") {
      positive.push(factor(
        crossing.protoCampMemoryHint === "known_crossing_place"
          ? "known whole-band crossing place"
          : "temporary crossing material made this place useful",
        Math.min(0.12, 0.04 + crossing.materialConfidence * 0.08),
        "ResidentialMoveEvent.temporaryWatercraft",
        "crossing_mobility",
      ));
    }

    if (
      crossing.result === "crossing_abandoned_risk" ||
      crossing.result === "crossing_delayed_materials" ||
      crossing.result === "materials_missing"
    ) {
      negative.push(factor(
        crossing.result === "materials_missing"
          ? "crossing place lacked known wood/reed/fiber material"
          : "river crossing carried labor or danger memory",
        Math.min(0.12, 0.04 + crossing.riverRisk * 0.08),
        "ResidentialMoveEvent.temporaryWatercraft",
        "crossing_mobility",
      ));
    }
  }

  return {
    positive: positive.sort(compareFactors).slice(0, 2),
    negative: negative.sort(compareFactors).slice(0, 2),
    reasonIds: uniqueStrings(reasonIds).slice(0, 6).map((value) => value as ReasonId),
  };
}

function getKnownKinContactNearby(
  world: WorldState,
  band: Band,
  tile: Tile | undefined,
): number {
  if (tile === undefined) {
    return 0;
  }

  let best = 0;
  for (const other of Object.values(world.bands)) {
    if (other.id === band.id || other.status === "dispersed" || other.viability?.status === "absorbed" || other.viability?.status === "extinct") {
      continue;
    }
    const otherTile = getTile(world, other.position);
    if (otherTile === undefined || gridDistance(tile, otherTile) > 4) {
      continue;
    }
    const contact = band.contactMemories[other.id];
    const kin = band.parentBandId === other.id || other.parentBandId === band.id || (band.parentBandId !== undefined && band.parentBandId === other.parentBandId);
    if (contact !== undefined || kin) {
      best = Math.max(best, (contact?.familiarity ?? 0.4) * 0.5 + (contact?.trustLikeTolerance ?? 0.4) * 0.35 + (kin ? 0.15 : 0));
    }
  }

  return clamp01(best);
}

function collectPlaceReasonIds(
  band: Band,
  tileId: TileId,
  placeReasonIds: readonly ReasonId[],
  anchorReasonIds: readonly ReasonId[],
): readonly ReasonId[] {
  return uniqueStrings([
    ...placeReasonIds.map(String),
    ...anchorReasonIds.map(String),
    ...(band.seasonalSupport?.reasonIds ?? []).map(String),
    ...(band.deathMemory?.placeTileId === tileId ? band.deathMemory.reasonIds.map(String) : []),
    ...(band.viability?.reasonIds ?? []).map(String),
  ]).slice(0, 12).map((value) => value as ReasonId);
}

function collectProtoCampReasonIds(places: readonly ProtoCampPlaceMemory[]): readonly ReasonId[] {
  return uniqueStrings(places.flatMap((place) => place.reasonIds.map(String))).slice(0, 16).map((value) => value as ReasonId);
}

function hasSevereSupportPressure(history: readonly SeasonalHungerClassification[]): boolean {
  return history.some((state) =>
    state === "seasonal_water_stress" ||
    state === "chronic_water_deficit" ||
    state === "chronic_plus_seasonal_stress" ||
    state === "crisis_deficit"
  );
}

function getStaleYears(world: WorldState, prior: ProtoCampPlaceMemory | undefined, current: boolean): number {
  if (current || prior === undefined) {
    return 0;
  }

  return Math.max(0, world.time.year - prior.lastUsedYear);
}

function isNearTile(world: WorldState, source: Tile | undefined, targetTileId: TileId, maxDistance: number): boolean {
  const target = getTile(world, targetTileId);
  return source !== undefined && target !== undefined && gridDistance(source, target) <= maxDistance;
}

function isCardNearTile(
  world: WorldState,
  source: Tile | undefined,
  anchorTileId: TileId,
  seenTileIds: readonly TileId[],
  maxDistance: number,
): boolean {
  return isNearTile(world, source, anchorTileId, maxDistance) || seenTileIds.some((tileId) => isNearTile(world, source, tileId, maxDistance));
}

function isSuccessfulActivityTrip(trip: IntraSeasonTripRecord): boolean {
  return (
    trip.activityOutcome === "successful_observation" ||
    trip.activityOutcome === "target_found" ||
    trip.activityOutcome === "partial_success" ||
    trip.activityOutcome === "returned_with_information" ||
    trip.activityOutcome === "no_effect_observed"
  );
}

function isFailedActivityTrip(trip: IntraSeasonTripRecord): boolean {
  return trip.activityOutcome.startsWith("failed_due_to") || trip.activityOutcome === "abandoned_due_to_risk";
}

function buildReasonFamilySummaries(
  positiveReasons: readonly ProtoCampFactor[],
  negativeReasons: readonly ProtoCampFactor[],
): readonly ProtoCampReasonFamilySummary[] {
  const grouped = new Map<ProtoCampReasonFamily, { positive: ProtoCampFactor[]; negative: ProtoCampFactor[] }>();

  for (const reason of positiveReasons) {
    const family = familyForFactor(reason);
    const entry = grouped.get(family) ?? { positive: [], negative: [] };
    entry.positive.push(reason);
    grouped.set(family, entry);
  }

  for (const reason of negativeReasons) {
    const family = familyForFactor(reason);
    const entry = grouped.get(family) ?? { positive: [], negative: [] };
    entry.negative.push(reason);
    grouped.set(family, entry);
  }

  return [...grouped.entries()]
    .map(([family, entry]) => {
      const positive = entry.positive.sort(compareFactors);
      const negative = entry.negative.sort(compareFactors);
      const positiveStrength = round2(sumFactorStrengths(positive));
      const negativeStrength = round2(sumFactorStrengths(negative));
      const displayReasonCount = Math.min(1, positive.length) + Math.min(1, negative.length);
      return {
        family,
        positiveStrength,
        negativeStrength,
        netStrength: round2(positiveStrength - negativeStrength),
        positiveCount: positive.length,
        negativeCount: negative.length,
        rawReasonCount: positive.length + negative.length,
        displayReasonCount,
        topPositiveReason: positive[0]?.reason,
        topNegativeReason: negative[0]?.reason,
      };
    })
    .sort(compareReasonFamilySummaries)
    .slice(0, REASON_FAMILY_CAP);
}

function compressDisplayReasons(
  reasons: readonly ProtoCampFactor[],
  familySummaries: readonly ProtoCampReasonFamilySummary[],
  polarity: "positive" | "negative",
): readonly ProtoCampFactor[] {
  const selected: ProtoCampFactor[] = [];
  for (const summary of familySummaries) {
    const family = summary.family;
    const hasSignal = polarity === "positive" ? summary.positiveStrength > 0 : summary.negativeStrength > 0;
    if (!hasSignal) {
      continue;
    }
    const strongest = reasons
      .filter((reason) => familyForFactor(reason) === family)
      .sort(compareFactors)[0];
    if (strongest !== undefined) {
      selected.push(strongest);
    }
    if (selected.length >= DISPLAY_REASON_CAP) {
      break;
    }
  }

  return selected.sort(compareFactors);
}

function familyPositiveStrength(
  summaries: readonly ProtoCampReasonFamilySummary[],
  family: ProtoCampReasonFamily,
): number {
  return summaries.find((summary) => summary.family === family)?.positiveStrength ?? 0;
}

function deriveLifecycleTrend(input: {
  readonly prior: ProtoCampPlaceMemory | undefined;
  readonly current: boolean;
  readonly campLikeScore: number;
  readonly positiveScore: number;
  readonly negativeScore: number;
  readonly ecologicalPressure: number;
  readonly ecologicalRecovery: number;
  readonly staleYears: number;
  readonly state: ProtoCampStateKind;
}): ProtoCampLifecycleTrend {
  if (input.state === "stale_remembered_camp" || input.staleYears >= 4) {
    return "stale";
  }
  if (input.prior === undefined || input.prior.campLikeState === "none") {
    return input.campLikeScore >= 0.18 ? "new" : "stable";
  }
  if (input.ecologicalRecovery > input.ecologicalPressure + 0.12 && (input.current || input.prior.activeStatus === "abandoned" || input.prior.activeStatus === "stale")) {
    return "recovering";
  }
  if (input.ecologicalPressure >= 0.5 || input.negativeScore > input.positiveScore * 0.74 || input.campLikeScore < input.prior.campLikeScore - 0.06) {
    return "weakening";
  }
  if (input.current && input.campLikeScore > input.prior.campLikeScore + 0.05) {
    return "strengthening";
  }
  return "stable";
}

function deriveSeasonalIdentity(input: {
  readonly season: string;
  readonly seasonsUsed: readonly string[];
  readonly waterRefugeReliability: number;
  readonly storageProcessingScore: number;
  readonly crossingUseScore: number;
  readonly ecologicalRecovery: number;
  readonly state: ProtoCampStateKind;
  readonly supportHistory: readonly SeasonalHungerClassification[];
  readonly reasonFamilies: readonly ProtoCampReasonFamilySummary[];
}): ProtoCampSeasonalIdentity {
  if (input.crossingUseScore >= 0.08 || input.state === "crossing_camp") {
    return "seasonal_crossing_camp";
  }
  if (input.storageProcessingScore >= 0.1 && input.season === "autumn") {
    return "autumn_processing_candidate";
  }
  if (input.waterRefugeReliability >= 0.55 && (input.season === "summer" || input.supportHistory.includes("seasonal_water_stress"))) {
    return "dry_refuge_return";
  }
  if (input.waterRefugeReliability >= 0.5 && input.season === "winter" && hasReasonFamily(input.reasonFamilies, "forest")) {
    return "winter_shelter";
  }
  if (input.season === "spring" && (input.ecologicalRecovery >= 0.35 || hasReasonFamily(input.reasonFamilies, "plants"))) {
    return "spring_pulse_camp";
  }
  if (input.season === "summer" && hasReasonFamily(input.reasonFamilies, "aquatic")) {
    return "wet_spread_place";
  }
  if (input.seasonsUsed.length >= 2 || input.state === "seasonal_return_place" || input.state === "persistent_camp_candidate") {
    return "general_return_place";
  }
  return "general_return_place";
}

function deriveUsePressureStatus(
  ecologicalPressure: number,
  ecologicalRecovery: number,
  localUsePressure: number,
  current: boolean,
): ProtoCampUsePressureStatus {
  const pressure = Math.max(ecologicalPressure, localUsePressure);
  if (pressure >= 0.58) {
    return "overused";
  }
  if (ecologicalRecovery > pressure + 0.12 && !current) {
    return "recovering";
  }
  if (pressure >= 0.32) {
    return "worn";
  }
  return "low";
}

function hasReasonFamily(
  summaries: readonly ProtoCampReasonFamilySummary[],
  family: ProtoCampReasonFamily,
): boolean {
  return summaries.some((summary) => summary.family === family && (summary.positiveStrength > 0 || summary.negativeStrength > 0));
}

function factor(reason: string, strength: number, rawSource: string, family?: ProtoCampReasonFamily): ProtoCampFactor {
  return {
    reason,
    strength: round2(clamp01(strength)),
    rawSource,
    family,
  };
}

function familyForFactor(factorEntry: ProtoCampFactor): ProtoCampReasonFamily {
  if (factorEntry.family !== undefined) {
    return factorEntry.family;
  }

  const text = `${factorEntry.reason} ${factorEntry.rawSource}`.toLowerCase();
  if (text.includes("storage") || text.includes("process") || text.includes("cache") || text.includes("spoil") || text.includes("carry")) {
    return "storage_processing";
  }
  if (text.includes("cross") || text.includes("route") || text.includes("watercraft") || text.includes("river")) {
    return "crossing_mobility";
  }
  if (text.includes("plant") || text.includes("seed") || text.includes("mast") || text.includes("root") || text.includes("fiber")) {
    return "plants";
  }
  if (text.includes("fish") || text.includes("aquatic") || text.includes("wetland") || text.includes("shellfish")) {
    return "aquatic";
  }
  if (text.includes("animal") || text.includes("fauna") || text.includes("hunt")) {
    return "fauna";
  }
  if (text.includes("forest") || text.includes("tree") || text.includes("wood")) {
    return "forest";
  }
  if (text.includes("death")) {
    return "death_memory";
  }
  if (text.includes("kin") || text.includes("social") || text.includes("crowd") || text.includes("contested")) {
    return "social_shared_use";
  }
  if (text.includes("overuse") || text.includes("recover") || text.includes("pressure") || text.includes("wear")) {
    return "overuse_recovery";
  }
  if (text.includes("water") || text.includes("refuge")) {
    return "water_refuge";
  }
  if (text.includes("season") || text.includes("return") || text.includes("anchor")) {
    return "seasonal_round";
  }
  if (text.includes("risk") || text.includes("hardship") || text.includes("hunger") || text.includes("tension")) {
    return "risk_hardship";
  }
  return "knowledge_confidence";
}

function sumFactorStrengths(factors: readonly ProtoCampFactor[]): number {
  return clamp01(factors.reduce((sum, factorEntry) => sum + factorEntry.strength, 0));
}

function hardshipStrength(level: string | undefined): number {
  switch (level) {
    case "severe":
      return 1;
    case "high":
      return 0.72;
    case "moderate":
      return 0.42;
    case "low":
      return 0.18;
    default:
      return 0;
  }
}

function compareProtoCampPlaces(left: ProtoCampPlaceMemory, right: ProtoCampPlaceMemory): number {
  const score = right.campLikeScore - left.campLikeScore;
  if (score !== 0) {
    return score;
  }

  const confidence = right.confidence - left.confidence;
  if (confidence !== 0) {
    return confidence;
  }

  return String(left.tileId).localeCompare(String(right.tileId));
}

function compareFactors(left: ProtoCampFactor, right: ProtoCampFactor): number {
  return right.strength === left.strength
    ? left.reason.localeCompare(right.reason)
    : right.strength - left.strength;
}

function compareReasonFamilySummaries(
  left: ProtoCampReasonFamilySummary,
  right: ProtoCampReasonFamilySummary,
): number {
  const leftTotal = left.positiveStrength + left.negativeStrength;
  const rightTotal = right.positiveStrength + right.negativeStrength;
  if (rightTotal !== leftTotal) {
    return rightTotal - leftTotal;
  }

  const net = Math.abs(right.netStrength) - Math.abs(left.netStrength);
  if (net !== 0) {
    return net;
  }

  return left.family.localeCompare(right.family);
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function uniqueTileIds(values: readonly TileId[]): readonly TileId[] {
  const seen = new Set<string>();
  const result: TileId[] = [];
  for (const value of values) {
    const key = String(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function isSeason(value: string): value is ProtoCampPlaceMemory["lastUsedSeason"] {
  return value === "spring" || value === "summer" || value === "autumn" || value === "winter";
}

function isSeasonalSupportClassification(value: string): value is SeasonalHungerClassification {
  return (
    value === "stable" ||
    value === "seasonal_lean_stress" ||
    value === "seasonal_water_stress" ||
    value === "seasonal_pulse_recovery" ||
    value === "chronic_food_deficit" ||
    value === "chronic_water_deficit" ||
    value === "chronic_plus_seasonal_stress" ||
    value === "crisis_deficit" ||
    value === "recovery_after_crisis"
  );
}

function gridDistance(left: Tile, right: Tile): number {
  return Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.y - right.coord.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
