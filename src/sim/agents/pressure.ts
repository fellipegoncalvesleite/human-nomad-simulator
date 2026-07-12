import type {
  Band,
  BandPressureState,
  CausalSignalKind,
  CausalTrace,
  LocalUsePressureRecord,
  PlaceMemoryRecord,
  PlaceMemoryValence,
} from "./types";
import {
  getCrowdingPenalty,
  getDaughterDispersalPressure,
  getNearbyBandPressure,
} from "./crowding";
import type { TickContextCache } from "./contextCache";
import { deriveBandTendencies } from "./bandTendency";
import { deriveChronicHardship } from "./chronicHardship";
import { deriveWaterWorksRelief } from "./practicalResponses";
import { deriveCanonicalNutritionState } from "./seasonalSurvival";
import { deriveForestTileEffect, getForestPatchState } from "./forestPatches";
import type { ReasonId, TileId } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import type { Action, Decision } from "../rules/types";
import type { WorldState } from "../world/types";

export interface BandPressureUpdateInput {
  readonly world: WorldState;
  readonly previousBand: Band;
  readonly band: Band;
  readonly decision: Decision;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly observedTileIds: readonly TileId[];
  readonly knownTiles: Readonly<Record<TileId, KnownTileRecord>>;
  readonly contextCache?: TickContextCache;
}

export interface BandPressureUpdate {
  readonly usePressure: Readonly<Record<TileId, LocalUsePressureRecord>>;
  readonly pressureState: BandPressureState;
  readonly placeMemory: Readonly<Record<TileId, PlaceMemoryRecord>>;
  readonly causalTraces: readonly CausalTrace[];
}

interface UsePressureUpdateContext {
  readonly world: WorldState;
  readonly previousBand: Band;
  readonly band: Band;
  readonly decision: Decision;
  readonly nextPosition: TileId;
  readonly moved: boolean;
  readonly knownTiles: Readonly<Record<TileId, KnownTileRecord>>;
  readonly useIntensities: Readonly<Record<TileId, number>>;
  readonly contextCache?: TickContextCache;
}

interface PressureProfiler {
  readonly measure: <TResult>(
    phase: "pressureStateDerivation",
    operation: () => TResult,
  ) => TResult;
}

export function updateBandPressure(
  input: BandPressureUpdateInput,
  profiler?: PressureProfiler,
): BandPressureUpdate {
  const useIntensities = getUseIntensities(input);
  const usePressure = updateUsePressureRecords({
    world: input.world,
    previousBand: input.previousBand,
    band: input.band,
    decision: input.decision,
    nextPosition: input.nextPosition,
    moved: input.moved,
    knownTiles: input.knownTiles,
    useIntensities,
    contextCache: input.contextCache,
  });
  const pressureState = profiler === undefined
    ? deriveBandPressureState(input.world, {
        ...input.band,
        usePressure,
      }, input.contextCache)
    : profiler.measure("pressureStateDerivation", () =>
        deriveBandPressureState(input.world, {
          ...input.band,
          usePressure,
        }, input.contextCache),
      );
  const pressureAdjustedMemory = applyPressureToPlaceMemory({
    placeMemory: input.band.placeMemory,
    usePressure,
    pressureState,
    currentTileId: input.nextPosition,
    decision: input.decision,
  });
  const traces = getPressureTraces({
    world: input.world,
    previousBand: input.previousBand,
    band: input.band,
    decision: input.decision,
    nextPosition: input.nextPosition,
    usePressure,
    pressureState,
  });

  return {
    usePressure,
    pressureState,
    placeMemory: pressureAdjustedMemory,
    causalTraces: [...input.previousBand.causalTraces, ...traces].slice(-80),
  };
}

export function deriveBandPressureState(
  world: WorldState,
  band: Band,
  contextCache?: TickContextCache,
): BandPressureState {
  const currentRecord = band.knowledge.observedTiles[band.position];
  const currentPressure = band.usePressure[band.position];
  const currentMemory = band.placeMemory[band.position];
  const seasonalPattern = currentRecord?.observedSeasonalPattern;
  const leanSeasonStress =
    seasonalPattern?.leanSeasons.includes(world.time.season) === true ? 0.08 : 0;
  const waterAccess = currentRecord?.observedWaterAccess ?? 0.38;
  const riskEstimate = currentRecord?.observedRisk ?? 0.35;
  const combinedPressure = getLocalUsePressureValue(currentPressure);
  const nearbyPressure = getNearbyBandPressure(world, band, band.position, contextCache);
  const daughterDispersal = getDaughterDispersalPressure(world, band, band.position, contextCache);
  const currentTile = world.tiles[band.position];
  const crowdingPenalty =
    currentTile === undefined ? 0 : getCrowdingPenalty(currentTile, nearbyPressure);
  const forestEffect = currentTile === undefined
    ? undefined
    : deriveForestTileEffect(currentTile, world.time, getForestPatchState(world, currentTile));
  const forestVisibilityRisk = forestEffect?.visibilityReduction ?? 0;
  const forestTravelCost = forestEffect?.travelCostBump ?? 0;
  const forestShelter = forestEffect?.shelterRefuge ?? 0;
  const seasonalSupport = band.seasonalSupport;
  const currentSeason = seasonalSupport?.currentSeasonSupport;
  const seasonalWaterStress = clamp01(
    Math.max(
      currentSeason?.waterStress ?? 0,
      seasonalSupport?.hungerClassification === "seasonal_water_stress" ? 0.2 : 0,
      seasonalSupport?.hungerClassification === "chronic_water_deficit" ? 0.28 : 0,
      seasonalSupport?.currentSeasonSupport.mode === "dry" ? 0.16 : 0,
    ),
  );
  const deathCaution = band.deathMemory?.cautionModifier ?? 0;
  const acuteRiskEffect = band.acuteRisk?.activeEffect;
  const acuteStress = acuteRiskEffect?.extraSeasonalStress ?? 0;
  const acuteActivityPenalty = acuteRiskEffect?.activityEfficiencyPenalty ?? 0;
  const acuteMortalityRisk = acuteRiskEffect?.mortalityRiskBump ?? 0;
  const acuteCaution = acuteRiskEffect?.movementCautionBump ?? 0;
  const innerFissionDebate = band.innerFission?.residentialDebatePressure ?? 0;
  const innerFissionScouting = band.innerFission?.scoutingPressure ?? 0;
  const protoCampReturnBias = band.protoCampMemory?.behavior.returnBias ?? 0;
  const protoCampMoveAwayPressure = band.protoCampMemory?.behavior.contestedMoveAwayPressure ?? 0;
  const accessBehavior = band.protoAccessMemory?.behavior;
  const accessSensitiveCautionBias = accessBehavior?.sensitivePlaceCautionBias ?? 0;
  const accessToleranceReductionBias = accessBehavior?.toleranceReductionBias ?? 0;
  const accessKinToleranceReliefBias = accessBehavior?.kinToleranceReliefBias ?? 0;
  const accessContestedAvoidanceBias = accessBehavior?.contestedAvoidanceBias ?? 0;
  const accessExpectedReturnBias = accessBehavior?.expectedReturnBias ?? 0;
  const adaptationBehavior = band.foragingAdaptation?.behavior;
  const adaptationRiskToleranceModifier = adaptationBehavior?.riskToleranceModifier ?? 0;
  const adaptationFallbackExpansionBias = adaptationBehavior?.fallbackExpansionBias ?? 0;
  const adaptationNearbyProbeBias = adaptationBehavior?.nearbyProbeBias ?? 0;
  const adaptationTripAbandonmentBias = adaptationBehavior?.tripAbandonmentBias ?? 0;
  const adaptationCrisisBreakawayPressure = adaptationBehavior?.crisisBreakawayPressure ?? 0;
  const adaptationSocialScarcityTension = adaptationBehavior?.socialScarcityTension ?? 0;
  const logisticsBehavior = band.bodyCampLogistics?.behavior;
  const logisticsWeatherCautionBias = logisticsBehavior?.weatherRouteCautionBias ?? 0;
  const logisticsSicknessActivityPenalty = logisticsBehavior?.sicknessActivityPenalty ?? 0;
  const logisticsCareTravelBurdenBias = logisticsBehavior?.careTravelBurdenBias ?? 0;
  const logisticsCarryConstraintBias = logisticsBehavior?.carryConstraintBias ?? 0;
  const logisticsMaterialWearPenalty = logisticsBehavior?.materialWearPenalty ?? 0;
  const logisticsCampCleanlinessMoveAwayBias = logisticsBehavior?.campCleanlinessMoveAwayBias ?? 0;
  const logisticsSharingTensionBias = logisticsBehavior?.sharingTensionBias ?? 0;
  const logisticsFireExposureReliefBias = logisticsBehavior?.fireExposureReliefBias ?? 0;
  const logisticsOpportunisticFoodBias = logisticsBehavior?.opportunisticFoodBias ?? 0;
  const relationshipBehavior = band.relationshipMemory?.behavior;
  const relationshipPracticeEfficiencyBias = relationshipBehavior?.practiceEfficiencyBias ?? 0;
  const relationshipAnimalCautionBias = relationshipBehavior?.animalCautionBias ?? 0;
  const relationshipScavengerRiskBias = relationshipBehavior?.scavengerRiskBias ?? 0;
  const relationshipAggregationToleranceBias = relationshipBehavior?.aggregationToleranceBias ?? 0;
  const relationshipReputationToleranceBias = relationshipBehavior?.reputationToleranceBias ?? 0;
  const relationshipFailureCautionBias = relationshipBehavior?.failureCautionBias ?? 0;
  const relationshipPlaceCharacterPull = relationshipBehavior?.placeCharacterPull ?? 0;
  const relationshipRouteConfidenceBias = relationshipBehavior?.routeConfidenceBias ?? 0;
  // CAUSAL-REPAIR-1: repeated low-support evidence escalates the push to act
  // (the inverse of the old population/86 de-escalation). Bounded, band-known.
  const chronicHardship = deriveChronicHardship(band, deriveBandTendencies(band));
  // Current food stress has exactly one authority: physical support plus its
  // bounded history. Remembered richness/foraging pressure remain opportunity
  // signals elsewhere; they cannot declare a band fed or starving.
  const nutrition = deriveCanonicalNutritionState(seasonalSupport);
  const foodStress = nutrition.foodMovementPressure;
  // INVENTION-3: the band's own built waterworks (dug seep/lined well) at
  // THIS tile relieve a bounded share of the residence water stress while
  // they still yield this season (practicalResponses.deriveWaterWorksRelief;
  // cap 0.15, 0 for dry holes/collapses/other tiles).
  const waterWorksRelief = deriveWaterWorksRelief(band, band.position, String(world.time.season));
  const waterWorksLabor = band.practicalAdaptation?.waterWorks?.tileId === band.position
    ? band.practicalAdaptation.waterWorks.lastLaborCost
    : 0;
  const waterStress = clamp01(
    (1 - waterAccess) * 0.52 +
      (currentPressure?.waterPressure ?? 0) * 0.38 +
      leanSeasonStress * 0.45 +
      seasonalWaterStress * 0.18 +
      acuteStress * 0.18 -
      forestShelter * 0.02 -
      (waterWorksRelief.active ? waterWorksRelief.relief : 0),
  );
  const fatiguePressure = clamp01(
    getRecentMovementFatigue(band) +
      acuteActivityPenalty * 0.62 +
      acuteStress * 0.24 +
      forestTravelCost * 0.05 +
      logisticsSicknessActivityPenalty * 0.26 +
      logisticsCareTravelBurdenBias * 0.18 +
      logisticsMaterialWearPenalty * 0.12 +
      logisticsCarryConstraintBias * 0.1 +
      waterWorksLabor * 0.42 -
      logisticsFireExposureReliefBias * 0.08 -
      relationshipPracticeEfficiencyBias * 0.08 -
      relationshipRouteConfidenceBias * 0.06,
  );
  const riskPressure = clamp01(
    riskEstimate * 0.62 +
      combinedPressure * 0.16 +
      crowdingPenalty * 0.08 +
      (currentMemory?.valences.includes("risky") === true ? 0.12 : 0) +
      acuteCaution * 0.44 +
      acuteMortalityRisk * 0.7 +
      forestVisibilityRisk * 0.06 +
      accessSensitiveCautionBias * 0.16 +
      accessToleranceReductionBias * 0.08 -
      adaptationRiskToleranceModifier * 0.08 +
      logisticsWeatherCautionBias * 0.16 +
      logisticsSicknessActivityPenalty * 0.12 +
      logisticsMaterialWearPenalty * 0.08 +
      logisticsSharingTensionBias * 0.08 -
      logisticsFireExposureReliefBias * 0.08 +
      relationshipAnimalCautionBias * 0.12 +
      relationshipScavengerRiskBias * 0.14 +
      relationshipFailureCautionBias * 0.16 -
      relationshipRouteConfidenceBias * 0.06,
  );
  const rawAttachmentPull = clamp01(
    (currentMemory?.attachment ?? 0) * 0.72 +
      (currentMemory?.isReturnPlace === true ? 0.14 : 0) +
      (currentMemory?.valences.includes("reliable") === true ? 0.12 : 0) +
      protoCampReturnBias * 0.22 +
      accessExpectedReturnBias * 0.18 +
      accessKinToleranceReliefBias * 0.06 -
      accessToleranceReductionBias * 0.06 +
      relationshipPlaceCharacterPull * 0.12 +
      relationshipReputationToleranceBias * 0.06,
  );
  const placeAttachmentPull = clamp01(
    rawAttachmentPull * (1 - combinedPressure * 0.42) -
      riskPressure * 0.08 -
      crowdingPenalty * 0.22 +
      daughterDispersal.inheritedFamiliarityPull * 0.08,
  );
  const mobilityPressure = clamp01(
    foodStress * 0.34 +
      waterStress * 0.3 +
      riskPressure * 0.18 +
      combinedPressure * 0.26 +
      crowdingPenalty * 0.2 +
      daughterDispersal.daughterDispersalPressure * 0.16 +
      band.territorialPressure * 0.08 +
      deathCaution * 0.08 +
      acuteStress * 0.14 +
      acuteCaution * 0.08 +
      forestTravelCost * 0.04 +
      forestVisibilityRisk * 0.02 -
      forestShelter * 0.03 +
      innerFissionDebate * 0.08 +
      innerFissionScouting * 0.04 +
      protoCampMoveAwayPressure * 0.18 +
      accessContestedAvoidanceBias * 0.2 +
      accessSensitiveCautionBias * 0.08 +
      adaptationTripAbandonmentBias * 0.12 +
      adaptationNearbyProbeBias * 0.16 +
      adaptationCrisisBreakawayPressure * 0.14 +
      adaptationSocialScarcityTension * 0.08 -
      adaptationRiskToleranceModifier * 0.06 +
      logisticsCampCleanlinessMoveAwayBias * 0.18 +
      logisticsWeatherCautionBias * 0.1 +
      logisticsSicknessActivityPenalty * 0.1 +
      logisticsCareTravelBurdenBias * 0.16 +
      logisticsCarryConstraintBias * 0.14 +
      logisticsMaterialWearPenalty * 0.08 +
      logisticsSharingTensionBias * 0.06 -
      logisticsFireExposureReliefBias * 0.08 +
      relationshipAnimalCautionBias * 0.08 +
      relationshipScavengerRiskBias * 0.1 +
      relationshipFailureCautionBias * 0.14 -
      relationshipPracticeEfficiencyBias * 0.05 -
      relationshipRouteConfidenceBias * 0.08 -
      relationshipAggregationToleranceBias * 0.04 +
      chronicHardship.movePressureBoost * 0.24,
  );
  const netMovePressure = clamp01(
    mobilityPressure +
      chronicHardship.movePressureBoost +
      daughterDispersal.daughterDispersalPressure * 0.18 +
      band.mobilityCostTolerance * 0.06 -
      placeAttachmentPull * 0.48 -
      daughterDispersal.kinTolerance * 0.08 +
      innerFissionDebate * 0.06 +
      protoCampMoveAwayPressure * 0.22 -
      protoCampReturnBias * 0.12 -
      accessExpectedReturnBias * 0.08 +
      accessContestedAvoidanceBias * 0.2 +
      accessToleranceReductionBias * 0.08 -
      accessKinToleranceReliefBias * 0.04 -
      adaptationRiskToleranceModifier * 0.04 +
      adaptationNearbyProbeBias * 0.16 +
      adaptationTripAbandonmentBias * 0.12 +
      adaptationCrisisBreakawayPressure * 0.16 +
      adaptationFallbackExpansionBias * 0.04 +
      logisticsCampCleanlinessMoveAwayBias * 0.18 +
      logisticsCareTravelBurdenBias * 0.16 +
      logisticsCarryConstraintBias * 0.16 +
      logisticsMaterialWearPenalty * 0.08 +
      logisticsSharingTensionBias * 0.06 +
      logisticsWeatherCautionBias * 0.08 -
      logisticsFireExposureReliefBias * 0.08 -
      logisticsOpportunisticFoodBias * 0.03 +
      relationshipAnimalCautionBias * 0.08 +
      relationshipScavengerRiskBias * 0.08 +
      relationshipFailureCautionBias * 0.14 -
      relationshipPlaceCharacterPull * 0.1 -
      relationshipRouteConfidenceBias * 0.08 -
      relationshipReputationToleranceBias * 0.04 -
      relationshipAggregationToleranceBias * 0.04 -
      relationshipPracticeEfficiencyBias * 0.03 +
      acuteCaution * 0.12 +
      forestTravelCost * 0.03 -
      forestShelter * 0.02,
  );

  return {
    tick: world.time.tick,
    time: world.time,
    foodStress: round2(foodStress),
    foodMovementPressure: nutrition.foodMovementPressure,
    foodStressSource: "canonical_physical_support_history",
    waterStress: round2(waterStress),
    mobilityPressure: round2(mobilityPressure),
    fatiguePressure: round2(fatiguePressure),
    riskPressure: round2(riskPressure),
    placeAttachmentPull: round2(placeAttachmentPull),
    netMovePressure: round2(netMovePressure),
    chronicHardshipEscalation: chronicHardship.movePressureBoost,
    nearbyBandPressure: nearbyPressure.weightedCrowding,
    parentCoreOverlap: daughterDispersal.parentCoreOverlap,
    daughterDispersalPressure: daughterDispersal.daughterDispersalPressure,
    inheritedFamiliarityPull: daughterDispersal.inheritedFamiliarityPull,
    safeFrontierPull: daughterDispersal.safeFrontierPull,
    crowdingPenalty,
    protoCampReturnBias: round2(protoCampReturnBias),
    protoCampMoveAwayPressure: round2(protoCampMoveAwayPressure),
    accessSensitiveCautionBias: round2(accessSensitiveCautionBias),
    accessToleranceReductionBias: round2(accessToleranceReductionBias),
    accessKinToleranceReliefBias: round2(accessKinToleranceReliefBias),
    accessContestedAvoidanceBias: round2(accessContestedAvoidanceBias),
    accessExpectedReturnBias: round2(accessExpectedReturnBias),
    adaptationRiskToleranceModifier: round2(adaptationRiskToleranceModifier),
    adaptationFallbackExpansionBias: round2(adaptationFallbackExpansionBias),
    adaptationNearbyProbeBias: round2(adaptationNearbyProbeBias),
    adaptationTripAbandonmentBias: round2(adaptationTripAbandonmentBias),
    adaptationCrisisBreakawayPressure: round2(adaptationCrisisBreakawayPressure),
    adaptationSocialScarcityTension: round2(adaptationSocialScarcityTension),
    logisticsWeatherCautionBias: round2(logisticsWeatherCautionBias),
    logisticsSicknessActivityPenalty: round2(logisticsSicknessActivityPenalty),
    logisticsCareTravelBurdenBias: round2(logisticsCareTravelBurdenBias),
    logisticsCarryConstraintBias: round2(logisticsCarryConstraintBias),
    logisticsMaterialWearPenalty: round2(logisticsMaterialWearPenalty),
    logisticsCampCleanlinessMoveAwayBias: round2(logisticsCampCleanlinessMoveAwayBias),
    logisticsSharingTensionBias: round2(logisticsSharingTensionBias),
    logisticsFireExposureReliefBias: round2(logisticsFireExposureReliefBias),
    logisticsOpportunisticFoodBias: round2(logisticsOpportunisticFoodBias),
    relationshipPracticeEfficiencyBias: round2(relationshipPracticeEfficiencyBias),
    relationshipAnimalCautionBias: round2(relationshipAnimalCautionBias),
    relationshipScavengerRiskBias: round2(relationshipScavengerRiskBias),
    relationshipAggregationToleranceBias: round2(relationshipAggregationToleranceBias),
    relationshipReputationToleranceBias: round2(relationshipReputationToleranceBias),
    relationshipFailureCautionBias: round2(relationshipFailureCautionBias),
    relationshipPlaceCharacterPull: round2(relationshipPlaceCharacterPull),
    relationshipRouteConfidenceBias: round2(relationshipRouteConfidenceBias),
    crowdingBandIds: nearbyPressure.pressureBandIds,
    confidence: round2(currentRecord?.confidence ?? 0.36),
    sourceReasonIds: [
      ...(currentMemory?.reasonIds.slice(-6) ?? []),
      ...(band.acuteRisk?.activeEffect.recoverySeasons !== undefined && band.acuteRisk.activeEffect.recoverySeasons > 0
        ? [`reason:acute-risk:${String(band.id)}:${Number(band.acuteRisk.lastUpdatedTick)}` as ReasonId]
        : []),
      ...(forestEffect !== undefined && (forestEffect.visibilityReduction > 0 || forestEffect.shelterRefuge > 0)
        ? [`reason:forest-pressure:${String(band.position)}:${Number(world.time.tick)}` as ReasonId]
        : []),
      ...(band.foragingAdaptation?.reasonIds.slice(0, 3) ?? []),
      ...(band.bodyCampLogistics?.reasonIds.slice(0, 3) ?? []),
      ...(band.relationshipMemory?.reasonIds.slice(0, 3) ?? []),
    ].slice(-8),
  };
}

export function getLocalUsePressureValue(
  record: LocalUsePressureRecord | undefined,
): number {
  if (record === undefined) {
    return 0;
  }

  const weightedPressure = clamp01(
    record.foragingPressure * 0.46 +
      record.waterPressure * 0.26 +
      record.aquaticPressure * 0.16 +
      record.recentUseIntensity * 0.18,
  );

  return clamp01(
    Math.max(
      weightedPressure,
      record.foragingPressure * 0.82,
      record.waterPressure * 0.86,
      record.aquaticPressure * 0.72,
      record.recentUseIntensity * 0.28,
    ),
  );
}

export function getPressureRecoveryValue(
  record: LocalUsePressureRecord | undefined,
): number {
  if (record === undefined) {
    return 0;
  }

  return clamp01(record.recoveryProgress * 0.7 + getLocalUsePressureValue(record) * 0.18);
}

function getUseIntensities(
  input: BandPressureUpdateInput,
): Readonly<Record<TileId, number>> {
  const intensities: Record<string, number> = {};
  const nearbyPressure = getNearbyBandPressure(
    input.world,
    input.previousBand,
    input.nextPosition,
    input.contextCache,
  );
  const mainUseIntensity = clamp01(
    getMainUseIntensity(input.decision.action, input.previousBand, input.moved) *
      (1 + nearbyPressure.weightedCrowding * 0.28),
  );

  // When the band holds a residential anchor (2I.2), foraging effort is spread
  // across the seasonal catchment rather than hammering the single anchor tile.
  // The anchor tile takes a reduced share; the remainder is distributed across
  // the catchment tiles, so a reliable refuge stays viable across seasons.
  const activity = input.band.intraSeasonActivity;
  const catchmentTileIds =
    activity !== undefined && !activity.residenceMoved && input.decision.action.type === "stay"
      ? activity.depletionTileIds.filter((tileId) => tileId !== input.nextPosition)
      : [];

  if (catchmentTileIds.length > 0) {
    const anchorShare = 0.5 + (activity?.activityBudget.nearAnchorForaging ?? 0.5) * 0.3;
    const anchorIntensity = mainUseIntensity * anchorShare;
    const spread = (mainUseIntensity * (1 - anchorShare)) / catchmentTileIds.length;

    intensities[input.nextPosition] = Math.max(intensities[input.nextPosition] ?? 0, anchorIntensity);

    for (const tileId of catchmentTileIds) {
      intensities[tileId] = Math.max(intensities[tileId] ?? 0, spread);
    }
  } else {
    intensities[input.nextPosition] = Math.max(intensities[input.nextPosition] ?? 0, mainUseIntensity);
  }

  for (const tileId of input.observedTileIds) {
    if (tileId === input.nextPosition) {
      continue;
    }

    intensities[tileId] = Math.max(intensities[tileId] ?? 0, 0.012);
  }

  return intensities as Readonly<Record<TileId, number>>;
}

function getMainUseIntensity(action: Action, band: Band, moved: boolean): number {
  if (action.type === "stay") {
    return clamp01(0.18 + Math.min(5, band.consecutiveSeasonsOnTile) * 0.026);
  }

  if (action.type === "move_to_tile" || action.type === "explore_unknown_neighbor") {
    return moved ? 0.12 : 0.065;
  }

  if (action.type === "logistical_probe") {
    return 0.055;
  }

  return 0.035;
}

function updateUsePressureRecords(
  context: UsePressureUpdateContext,
): Readonly<Record<TileId, LocalUsePressureRecord>> {
  const nextPressure: Record<string, LocalUsePressureRecord> = {};
  const existingTileIds = Object.keys(context.previousBand.usePressure) as TileId[];
  const updatedTileIds = addUnique(
    existingTileIds,
    ...(Object.keys(context.useIntensities) as TileId[]),
  );

  for (const tileId of updatedTileIds) {
    const record = context.knownTiles[tileId] ?? context.previousBand.knowledge.observedTiles[tileId];

    if (record === undefined) {
      continue;
    }

    const intensity = context.useIntensities[tileId] ?? 0;
    const existing = context.previousBand.usePressure[tileId];
    const updated =
      intensity > 0
        ? applyUsePressureIncrease(context, tileId, record, existing, intensity)
        : applyUsePressureRecovery(context, tileId, record, existing);

    if (getLocalUsePressureValue(updated) > 0.015 || updated.useTicks > 0) {
      nextPressure[tileId] = updated;
    }
  }

  return compactUsePressureRecords(nextPressure) as Readonly<Record<TileId, LocalUsePressureRecord>>;
}

function applyUsePressureIncrease(
  context: UsePressureUpdateContext,
  tileId: TileId,
  record: KnownTileRecord,
  existing: LocalUsePressureRecord | undefined,
  intensity: number,
): LocalUsePressureRecord {
  const recoveryRate = getRecoveryRate(record);
  const pressureSensitivity = getPressureSensitivity(record);
  const isMainUse = tileId === context.nextPosition && intensity >= 0.04;
  const aquaticUse = record.observedAquaticPotential > 0.22
    ? intensity * (0.08 + (1 - record.observedAquaticPotential) * 0.1)
    : 0;
  const foragingIncrease = intensity * pressureSensitivity * 0.7;
  const waterIncrease = intensity * (0.08 + (1 - (record.observedWaterAccess ?? 0.35)) * 0.24);
  const reasonIds =
    isMainUse
      ? addUnique(existing?.reasonIds ?? [], context.decision.primaryReason.id).slice(-16)
      : existing?.reasonIds ?? [];

  return {
    tileId,
    bandId: context.band.id,
    firstUsedAt: existing?.firstUsedAt ?? context.world.time,
    lastUsedAt: context.world.time,
    useTicks: (existing?.useTicks ?? 0) + (isMainUse ? 1 : 0),
    consecutiveUseTicks: isMainUse ? (existing?.consecutiveUseTicks ?? 0) + 1 : 0,
    recentUseIntensity: round2(clamp01((existing?.recentUseIntensity ?? 0) * 0.58 + intensity)),
    foragingPressure: round2(clamp01((existing?.foragingPressure ?? 0) + foragingIncrease - recoveryRate * 0.1)),
    aquaticPressure: round2(clamp01((existing?.aquaticPressure ?? 0) + aquaticUse - recoveryRate * 0.12)),
    waterPressure: round2(clamp01((existing?.waterPressure ?? 0) + waterIncrease - recoveryRate * 0.1)),
    recoveryProgress: round2(clamp01((existing?.recoveryProgress ?? 0.5) - intensity * 0.5)),
    confidence: round2(Math.max(existing?.confidence ?? 0, record.confidence)),
    reasonIds,
  };
}

function applyUsePressureRecovery(
  context: UsePressureUpdateContext,
  tileId: TileId,
  record: KnownTileRecord,
  existing: LocalUsePressureRecord | undefined,
): LocalUsePressureRecord {
  const fallback: LocalUsePressureRecord = {
    tileId,
    bandId: context.band.id,
    firstUsedAt: context.world.time,
    lastUsedAt: context.world.time,
    useTicks: 0,
    consecutiveUseTicks: 0,
    recentUseIntensity: 0,
    foragingPressure: 0,
    aquaticPressure: 0,
    waterPressure: 0,
    recoveryProgress: 1,
    confidence: record.confidence,
    reasonIds: [],
  };
  const pressure = existing ?? fallback;
  const recoveryRate = getRecoveryRate(record);

  return {
    ...pressure,
    lastUsedAt: pressure.lastUsedAt,
    consecutiveUseTicks: 0,
    recentUseIntensity: round2(clamp01(pressure.recentUseIntensity * 0.48)),
    foragingPressure: round2(clamp01(pressure.foragingPressure - recoveryRate * 0.8)),
    aquaticPressure: round2(clamp01(pressure.aquaticPressure - recoveryRate * 0.94)),
    waterPressure: round2(clamp01(pressure.waterPressure - recoveryRate * 0.7)),
    recoveryProgress: round2(clamp01(pressure.recoveryProgress + recoveryRate * 1.35)),
    confidence: round2(Math.max(pressure.confidence, record.confidence)),
  };
}

function applyPressureToPlaceMemory(input: {
  readonly placeMemory: Readonly<Record<TileId, PlaceMemoryRecord>>;
  readonly usePressure: Readonly<Record<TileId, LocalUsePressureRecord>>;
  readonly pressureState: BandPressureState;
  readonly currentTileId: TileId;
  readonly decision: Decision;
}): Readonly<Record<TileId, PlaceMemoryRecord>> {
  const adjusted: Record<string, PlaceMemoryRecord> = { ...input.placeMemory };
  const candidateTileIds = addUnique(
    Object.keys(input.usePressure) as TileId[],
    input.currentTileId,
  );

  for (const tileId of candidateTileIds) {
    const memory = input.placeMemory[tileId];

    if (memory === undefined) {
      continue;
    }

    const pressureRecord = input.usePressure[memory.tileId];
    const pressureValue = getLocalUsePressureValue(pressureRecord);
    const isCurrentTile = memory.tileId === input.currentTileId;
    const stressValue = isCurrentTile
      ? Math.max(input.pressureState.foodStress, input.pressureState.waterStress)
      : 0;
    const pressureDrag = pressureValue > 0.24 ? (pressureValue - 0.24) * 0.28 : 0;
    const stressDrag = stressValue > 0.58 ? (stressValue - 0.58) * 0.16 : 0;
    const valences = getPressureAdjustedValences(memory, pressureValue, stressValue);
    const reasonIds =
      pressureValue > 0.48 || stressValue > 0.58
        ? addUnique(memory.reasonIds, input.decision.primaryReason.id).slice(-16)
        : memory.reasonIds;

    const uncappedAttachment = clamp01(memory.attachment - pressureDrag - stressDrag);
    const pressureAttachmentCap = pressureValue > 0.25
      ? clamp01(1 - (pressureValue - 0.25) * 0.55)
      : 1;

    const nextMemory = {
      ...memory,
      valences,
      attachment: round2(Math.min(uncappedAttachment, pressureAttachmentCap)),
      reasonIds,
    };

    if (
      nextMemory.attachment !== memory.attachment ||
      nextMemory.valences !== memory.valences ||
      nextMemory.reasonIds !== memory.reasonIds
    ) {
      adjusted[memory.tileId] = nextMemory;
    }
  }

  return adjusted as Readonly<Record<TileId, PlaceMemoryRecord>>;
}

function compactUsePressureRecords(
  pressureRecords: Readonly<Record<string, LocalUsePressureRecord>>,
): Readonly<Record<string, LocalUsePressureRecord>> {
  const records = Object.values(pressureRecords);

  if (records.length <= 128) {
    return pressureRecords;
  }

  return Object.fromEntries(
    records
      .sort((left, right) => {
        const leftScore = getUsePressureRetentionScore(left);
        const rightScore = getUsePressureRetentionScore(right);

        return rightScore === leftScore
          ? String(left.tileId).localeCompare(String(right.tileId))
          : rightScore - leftScore;
      })
      .slice(0, 128)
      .map((record) => [record.tileId, record] as const),
  );
}

function getUsePressureRetentionScore(record: LocalUsePressureRecord): number {
  return (
    getLocalUsePressureValue(record) * 0.72 +
    record.useTicks * 0.035 +
    record.consecutiveUseTicks * 0.04 +
    record.lastUsedAt.tick * 0.0004
  );
}

function getPressureAdjustedValences(
  memory: PlaceMemoryRecord,
  pressureValue: number,
  stressValue: number,
): readonly PlaceMemoryValence[] {
  let valences = memory.valences;

  if (pressureValue >= 0.4) {
    valences = addUnique(valences, "depleted");
  }

  if (stressValue >= 0.62) {
    valences = addUnique(valences, "risky");
  }

  if (pressureValue >= 0.68 || stressValue >= 0.76) {
    valences = addUnique(valences, "avoid_place");
  }

  return valences;
}

function getPressureTraces(input: {
  readonly world: WorldState;
  readonly previousBand: Band;
  readonly band: Band;
  readonly decision: Decision;
  readonly nextPosition: TileId;
  readonly usePressure: Readonly<Record<TileId, LocalUsePressureRecord>>;
  readonly pressureState: BandPressureState;
}): readonly CausalTrace[] {
  const traces: CausalTrace[] = [];
  const previousPressureState = input.previousBand.pressureState;
  const currentUse = getLocalUsePressureValue(input.usePressure[input.nextPosition]);
  const previousUse = getLocalUsePressureValue(input.previousBand.usePressure[input.nextPosition]);

  if (currentUse > previousUse + 0.045) {
    traces.push(
      makeTrace(input, "local_use_increased", input.nextPosition, previousUse, currentUse),
    );
  }

  if (currentUse > 0.24 && currentUse > previousUse + 0.03) {
    traces.push(
      makeTrace(input, "resource_pressure_increased", input.nextPosition, previousUse, currentUse),
    );
  }

  addStressTrace(input, traces, "food_stress_increased", previousPressureState?.foodStress, input.pressureState.foodStress);
  addStressTrace(input, traces, "water_stress_increased", previousPressureState?.waterStress, input.pressureState.waterStress);
  addStressTrace(
    input,
    traces,
    "mobility_pressure_increased",
    previousPressureState?.mobilityPressure,
    input.pressureState.mobilityPressure,
  );

  if (
    input.decision.action.type === "stay" &&
    input.pressureState.placeAttachmentPull > 0.34 &&
    input.pressureState.netMovePressure < 0.42
  ) {
    traces.push(
      makeTrace(
        input,
        "place_attachment_resisted_move",
        input.nextPosition,
        input.pressureState.netMovePressure,
        input.pressureState.placeAttachmentPull,
      ),
    );
  }

  if (
    input.decision.action.type === "stay" &&
    currentUse > 0.24
  ) {
    traces.push(
      makeTrace(input, "pressure_reduced_stay_score", input.nextPosition, previousUse, currentUse),
    );
  }

  if (
    (input.decision.action.type === "move_to_tile" ||
      input.decision.action.type === "explore_unknown_neighbor") &&
    input.pressureState.netMovePressure > 0.34
  ) {
    traces.push(
      makeTrace(
        input,
        "pressure_triggered_move",
        input.nextPosition,
        previousPressureState?.netMovePressure ?? 0,
        input.pressureState.netMovePressure,
      ),
    );
  }

  return traces.slice(0, 8);
}

function addStressTrace(
  input: Parameters<typeof makeTrace>[0],
  traces: CausalTrace[],
  kind: CausalSignalKind,
  previousValue: number | undefined,
  currentValue: number,
): void {
  if (currentValue > (previousValue ?? 0) + 0.07 && currentValue > 0.34) {
    traces.push(makeTrace(input, kind, input.nextPosition, previousValue ?? 0, currentValue));
  }
}

function makeTrace(
  input: {
    readonly world: WorldState;
    readonly band: Band;
    readonly decision: Decision;
    readonly nextPosition: TileId;
  },
  kind: CausalSignalKind,
  sourceTileId: TileId,
  fromValue: number,
  toValue: number,
): CausalTrace {
  return {
    id: `trace:${input.band.id}:${input.world.time.tick}:${kind}:${sourceTileId}`,
    tick: input.world.time.tick,
    time: input.world.time,
    actorId: input.band.id,
    kind,
    sourceTileId,
    targetTileId: getActionTargetTileId(input.decision.action),
    fromValue: round2(fromValue),
    toValue: round2(toValue),
    reasonId: input.decision.primaryReason.id,
    decisionId: input.decision.id,
  };
}

function getActionTargetTileId(action: Action): TileId | undefined {
  if (action.type === "logistical_probe") {
    return action.targetTileId;
  }

  if (action.type === "stay") {
    return action.tileId;
  }

  if (action.type === "move_to_tile" || action.type === "explore_unknown_neighbor") {
    return action.targetTileId;
  }

  return undefined;
}

function getRecoveryRate(record: KnownTileRecord): number {
  return clamp01(
    0.012 +
      (record.observedWaterAccess ?? 0.35) * 0.012 +
      record.observedAquaticPotential * 0.01 +
      (record.observedSeasonalPattern?.reliability ?? 0.45) * 0.006,
  );
}

function getPressureSensitivity(record: KnownTileRecord): number {
  const regeneration = clamp01(
    record.observedRichness * 0.42 +
      (record.observedWaterAccess ?? 0.35) * 0.24 +
      record.observedAquaticPotential * 0.18 +
      (record.observedSeasonalPattern?.reliability ?? 0.45) * 0.16,
  );

  return clamp01(0.62 + (1 - regeneration) * 0.48);
}

function getRecentMovementFatigue(band: Band): number {
  const recentMovementCount = band.movementHistory
    .slice(-4)
    .filter((movement) => movement.toTileId !== movement.fromTileId).length;

  return clamp01(recentMovementCount / 5);
}

function addUnique<TValue>(values: readonly TValue[], ...nextValues: readonly TValue[]): readonly TValue[] {
  const merged = [...values];

  for (const value of nextValues) {
    if (!merged.includes(value)) {
      merged.push(value);
    }
  }

  return merged;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
