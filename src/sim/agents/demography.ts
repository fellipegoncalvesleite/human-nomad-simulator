import type {
  Band,
  BandDemography,
  BandFissionEvent,
  BandLineageLink,
  CausalTrace,
  DeathCauseKind,
  DeathMemoryState,
  DemographicChurnRecord,
  DemographicChurnState,
  KnownCrossingMemory,
  NoDeathAuditState,
  PlaceMemoryRecord,
  PopulationAccountingState,
  SeasonalHungerClassification,
  SocialPressureProfile,
  TravelCorridorMemory,
} from "./types";
import { createDaughterDeepHistory } from "./bandHistory";
import { inheritAdaptiveHumanForDaughter } from "./adaptiveHuman";
import { inheritPracticalAdaptationForDaughter } from "./practicalResponses";
import { inheritAnimalPatternKnowledgeForDaughter } from "./animalLearning";
import { inheritResourceKnowledgeForDaughter } from "./resourceKnowledge";
import { deriveReportedKnowledgeTargetBias } from "./reportedKnowledge";
import { deriveDaughterColor } from "./lineageColor";
import { getLocalUsePressureValue } from "./pressure";
import {
  getCrowdingPenalty,
  getNearbyBandPressure,
} from "./crowding";
import { inheritBiomeAdaptation } from "./biomeAdaptation";
import { degradeInheritedExploitationSkill } from "./exploitationSkill";
import {
  inheritFrontierIntentForDaughter,
  parentFrontierIntentAlignment,
} from "./frontierIntent";
import {
  getSalientMemorySummary,
  type TickContextCache,
} from "./contextCache";
import type {
  BandId,
  Coord,
  EventId,
  ReasonId,
  RouteId,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import type {
  KnowledgeState,
  KnownBandRecord,
  KnownTileRecord,
  PlaceAttachment,
  TileObservation,
} from "../knowledge/types";
import type { MobilityIntent, Reason } from "../rules/types";
import { getNeighborTiles, getTile } from "../world/generate";
import { FISSION_TIEBREAK_EPSILON, seededTieBreakJitter } from "../core/seededVariation";
import { getDepletionAdjustedRichness } from "../world/depletion";
import { getNomadicScaleClass, NOMADIC_MAX_MOBILE_BANDS_WARNING_COUNT } from "./nomadicScale";
import { deriveCanonicalNutritionState } from "./seasonalSurvival";
import {
  getRiverCrossingForMovement,
  makeRiverCrossingKey,
} from "../world/hydrography";
import { isBandPassableDestination } from "../world/passability";
import type { Tile, WorldState } from "../world/types";

interface DemographyComputation {
  readonly demography: BandDemography;
  readonly deathMemory?: DeathMemoryState;
  readonly primaryReason: Reason;
  readonly localUsePressure: number;
  readonly comfortablePopulation: number;
  readonly viableFrontier: FissionTargetCandidate | undefined;
  readonly shouldCreateDaughter: boolean;
  readonly deferredReason: Reason | undefined;
}

interface FissionTargetCandidate {
  readonly tileId: TileId;
  readonly score: number;
  readonly frontierValue: number;
  readonly corridorValue: number;
  readonly aquaticValue: number;
  readonly knownBandSpacingPenalty: number;
  readonly knownBandsConsidered: number;
  readonly closestKnownBandDistanceTiles?: number;
  readonly crossingMemory?: KnownCrossingMemory;
  readonly reasonType:
    | "frontier_split"
    | "river_corridor_split"
    | "coastal_split"
    | "crossing_enabled_split";
}

export interface KnownBandSpacingForFission {
  readonly knownBandsConsidered: number;
  readonly closestKnownBandDistanceTiles?: number;
  readonly trustedKinTolerance: number;
  readonly crowdedContactPressure: number;
  readonly knownBandSpacingPenalty: number;
  readonly hiddenUnknownBandAvoidance: 0;
  readonly reasonIds: readonly ReasonId[];
}

interface DaughterCreation {
  readonly parent: Band;
  readonly daughter: Band;
}

const MINIMUM_SPLIT_POPULATION = 46;
const SPLIT_PRESSURE_THRESHOLD = 0.64;
const DAUGHTER_MIN_POPULATION = 18;
const DAUGHTER_MAX_POPULATION = 64;
const MAX_BANDS = NOMADIC_MAX_MOBILE_BANDS_WARNING_COUNT;
const FISSION_COOLDOWN_TICKS = 60;
const LARGE_BAND_FISSION_COOLDOWN_TICKS = 28;
const MEGA_BAND_FISSION_COOLDOWN_TICKS = 16;

export function updateBandsDemographyAndFission(
  world: WorldState,
  contextCache?: TickContextCache,
): WorldState {
  if (!shouldRunAnnualDemography(world)) {
    return world;
  }

  let bandsById: Readonly<Record<BandId, Band>> = world.bands;
  const bandOrder = Object.values(world.bands).sort(compareBands);

  for (const orderedBand of bandOrder) {
    const band = bandsById[orderedBand.id];

    if (band === undefined) {
      continue;
    }

    if (
      band.status === "dispersed" ||
      band.viability?.status === "absorbed" ||
      band.viability?.status === "extinct"
    ) {
      bandsById = {
        ...bandsById,
        [band.id]: band,
      };
      continue;
    }

    const currentWorld = {
      ...world,
      bands: bandsById,
    };
    const computation = computeBandDemography(currentWorld, band, contextCache);
    const bandWithDemography = applyDemographyUpdate(currentWorld, band, computation);
    const maybeFission =
      computation.shouldCreateDaughter && Object.keys(bandsById).length < MAX_BANDS
        ? createDaughterBand(currentWorld, bandWithDemography, computation)
        : undefined;

    if (maybeFission === undefined) {
      bandsById = {
        ...bandsById,
        [bandWithDemography.id]: bandWithDemography,
      };
      continue;
    }

    bandsById = {
      ...bandsById,
      [maybeFission.parent.id]: maybeFission.parent,
      [maybeFission.daughter.id]: maybeFission.daughter,
    };
  }

  return {
    ...world,
    bands: bandsById,
  };
}

export function updateBandDemography(world: WorldState, band: Band): BandDemography {
  return computeBandDemography(world, band).demography;
}

function shouldRunAnnualDemography(world: WorldState): boolean {
  return world.time.tick > 0 && world.time.season === "spring";
}

function computeBandDemography(
  world: WorldState,
  band: Band,
  contextCache?: TickContextCache,
): DemographyComputation {
  const previous = band.demography;
  const population = toPopulationCount(previous.population);
  const pressureState = band.pressureState;
  const currentRecord = band.knowledge.observedTiles[band.position];
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[band.position]);
  const currentMemory = band.placeMemory[band.position];
  const ecologyReliability = currentRecord?.observedSeasonalPattern?.reliability ?? 0.48;
  const nomadicScalePressure = band.nomadicScalePressure?.nomadicScalePressure ?? getPopulationScalePressure(population);
  const logisticalInefficiency = band.nomadicScalePressure?.logisticalInefficiencyPenalty ?? getPopulationLogisticalPressure(population);
  const largeBandFissionPressure = band.nomadicScalePressure?.largeBandFissionPressure ?? getPopulationScalePressure(population);
  const seasonalSupport = band.seasonalSupport;
  const nutrition = deriveCanonicalNutritionState(seasonalSupport);
  const seasonalFoodStress = nutrition.currentFoodStress;
  const seasonalWaterStress = clamp01(
    Math.max(
      seasonalSupport?.currentSeasonSupport.waterStress ?? 0,
      seasonalSupport?.hungerClassification === "seasonal_water_stress" ? 0.22 : 0,
      seasonalSupport?.hungerClassification === "chronic_water_deficit" ? 0.36 : 0,
    ),
  );
  const repeatedSeasonalHunger = nutrition.recentFoodStress;
  const chronicSeasonalDeficit = nutrition.chronicFoodStress;
  const recentDeathSuppression = band.deathMemory?.fertilitySuppressionFromRecentDeaths ?? 0;
  const acuteRiskEffect = band.acuteRisk?.activeEffect;
  const acuteSeasonalStress = acuteRiskEffect?.extraSeasonalStress ?? 0;
  const acuteMortalityRisk = acuteRiskEffect?.mortalityRiskBump ?? 0;
  const acuteActivityPenalty = acuteRiskEffect?.activityEfficiencyPenalty ?? 0;
  const logistics = band.bodyCampLogistics;
  const logisticsSicknessMortality = logistics?.sickness.mortalityPressureBump ?? 0;
  const logisticsFertilitySuppression = logistics?.sickness.fertilitySuppressionBump ?? 0;
  const logisticsCareBurden = logistics === undefined
    ? 0
    : clamp01(
        logistics.careTravelBurden.dependentCarryBurden * 0.24 +
          logistics.careTravelBurden.elderTravelCaution * 0.18 +
          logistics.careTravelBurden.sickCareBurden * 0.34 +
          (1 - logistics.logisticCapacity.capacity) * 0.18,
      );
  const maxBandCapBlockingFragmentation =
    Object.keys(world.bands).length >= MAX_BANDS &&
    population >= 120 &&
    largeBandFissionPressure > 0.34;
  const chronicDeficitStress = nutrition.chronicFoodStress;
  const foodStress = nutrition.foodDemographicPressure;
  const waterStress = clamp01((pressureState?.waterStress ?? 0.22) + seasonalWaterStress * 0.18 + acuteSeasonalStress * 0.12);
  const riskStress = clamp01(pressureState?.riskPressure ?? currentRecord?.observedRisk ?? 0.28);
  const comfortablePopulation = getComfortablePopulation(band, currentRecord);
  const householdCount = getHouseholdCount(population);
  const comfortableHouseholds = Math.max(5, Math.round(comfortablePopulation / 5));
  const householdCrowdingPressure = clamp01(
    Math.max(0, population - comfortablePopulation) / 42 +
      Math.max(0, householdCount - comfortableHouseholds) * 0.055 +
      logisticalInefficiency * 0.34,
  );
  // Demand scaling is already inside the canonical adult-equivalent ratio.
  // Crowding/logistical scale remain independent pressures below; they must not
  // create a second food system.
  const foodPerPersonStress = foodStress;
  const foodFertilitySuppression = clamp01(
    foodPerPersonStress * 0.22 + chronicDeficitStress * 0.2 + repeatedSeasonalHunger * 0.1,
  );
  const foodMortalityContribution = clamp01(
    foodPerPersonStress * 0.36 + chronicDeficitStress * 0.28,
  );
  const fertilityPressure = clamp01(
    0.34 +
      (1 - foodPerPersonStress) * 0.14 +
      (1 - waterStress) * 0.12 -
      riskStress * 0.14 -
      householdCrowdingPressure * 0.1 -
      nomadicScalePressure * 0.18 -
      foodFertilitySuppression -
      seasonalWaterStress * 0.08 -
      (pressureState?.fatiguePressure ?? 0) * 0.08 -
      acuteSeasonalStress * 0.08 -
      recentDeathSuppression * 0.18 -
      logisticsFertilitySuppression * 0.16 -
      logisticsCareBurden * 0.08,
  );
  const mortalityPressure = clamp01(
    foodMortalityContribution +
      waterStress * 0.24 +
      riskStress * 0.22 +
      nomadicScalePressure * 0.16 +
      logisticalInefficiency * 0.12 +
      seasonalWaterStress * 0.08 +
      acuteMortalityRisk * 0.22 +
      acuteActivityPenalty * 0.08 +
      logisticsSicknessMortality * 0.18 +
      logisticsCareBurden * 0.06 +
      (maxBandCapBlockingFragmentation ? 0.1 : 0),
  );
  const maxDeclineRate = population >= 1000
    ? -0.055
    : population >= 500
      ? -0.042
      : population >= 300
        ? -0.032
        : -0.018;
  const maxGrowthRate = population >= 300
    ? 0.004
    : population >= 150
      ? Math.max(0.003, 0.008 - chronicDeficitStress * 0.006)
      : Math.max(0.004, 0.014 - chronicDeficitStress * 0.01);
  // DEMOGRAPHY-MORTALITY-1 — end the "immortal crisis gridlock": a chronically
  // deficit / high-mortality band should slowly SHRINK (toward a smaller remnant
  // that stabilises as demand falls, or eventual collapse) instead of hovering
  // forever. Mortality + chronic-deficit bite slightly harder, and the small
  // survival baseline is trimmed (not removed) while starving — so a starving band
  // gets no free growth. Healthy bands (low mortality/chronic) are barely affected,
  // preserving prosperous growth/fission. Tuned conservatively from fresh runs.
  const survivalBaseline = chronicDeficitStress > 0.2 ? 0.0014 : 0.002;
  const severeRepeatedSeasonalBite =
    seasonalSupport?.hungerClassification === "crisis_deficit"
      ? 0.006
      : seasonalSupport?.hungerClassification === "chronic_plus_seasonal_stress"
        ? 0.0035
        : seasonalSupport?.chronicDeficitStreak !== undefined && seasonalSupport.chronicDeficitStreak >= 4
          ? 0.002
          : 0;
  const growthRate = clamp(
    survivalBaseline +
      fertilityPressure * 0.012 -
      mortalityPressure * 0.014 -
      chronicDeficitStress * 0.006 -
      severeRepeatedSeasonalBite,
    maxDeclineRate,
    maxGrowthRate,
  );
  const populationAccounting = advancePopulationAccounting(previous, population, growthRate);
  const roundedPopulation = populationAccounting.population;
  const cohorts = advanceAgeCohorts(
    previous,
    populationAccounting.births,
    populationAccounting.deaths,
    roundedPopulation,
    {
      dependentVulnerability: clamp01(seasonalFoodStress * 0.44 + seasonalWaterStress * 0.34 + chronicSeasonalDeficit * 0.22),
      adultCrisisPressure: clamp01(chronicSeasonalDeficit * 0.42 + mortalityPressure * 0.26 + (pressureState?.fatiguePressure ?? 0) * 0.2 + acuteMortalityRisk * 0.12 + logisticsCareBurden * 0.08),
    },
  );
  const crisisDeaths = getCrisisDeaths(cohorts, seasonalFoodStress, seasonalWaterStress, chronicSeasonalDeficit);
  const waterStressDeaths = getWaterStressDeaths(cohorts, seasonalWaterStress);
  const starvationDeaths = getStarvationDeaths(cohorts, seasonalFoodStress, chronicSeasonalDeficit);
  const migrationHardshipDeaths = 0;
  const churn = withCauseSpecificChurn(
    buildDemographicChurnState(previous.demographicChurn, world.time.year, population, roundedPopulation, cohorts),
    crisisDeaths,
    waterStressDeaths,
    starvationDeaths,
    migrationHardshipDeaths,
  );
  const noDeathAudit = deriveNoDeathAudit(band, churn, seasonalSupport?.hungerClassification ?? "stable");
  const deathMemory = advanceDeathMemory(world, band, cohorts, seasonalFoodStress, seasonalWaterStress);
  const nextHouseholdCount = getHouseholdCount(roundedPopulation);
  const canCreateMoreBands = Object.keys(world.bands).length < MAX_BANDS;
  const crisisBreakaway = band.foragingAdaptation?.crisisBreakaway;
  const crisisBreakawayEligible =
    crisisBreakaway?.active === true &&
    crisisBreakaway.pressure >= 0.62 &&
    crisisBreakaway.severeGroundedPressure &&
    crisisBreakaway.adultLaborEnough &&
    crisisBreakaway.noSafeAcceptedSolution &&
    population >= DAUGHTER_MIN_POPULATION + 14;
  const shouldEvaluateFissionTarget =
    canCreateMoreBands &&
    (population >= MINIMUM_SPLIT_POPULATION - 6 || crisisBreakawayEligible);
  const viableFrontier = shouldEvaluateFissionTarget
    ? selectFissionTarget(world, band, comfortablePopulation, contextCache)
    : undefined;
  const frontierOpportunity = viableFrontier === undefined
    ? 0
    : clamp01(viableFrontier.score / 2.4);
  const knowledgeSaturation = clamp01(Object.keys(band.knowledge.observedTiles).length / 48);
  const returnPlaceStrain = getReturnPlaceStrain(band);
  const pressureSignal = clamp01(
    householdCrowdingPressure * 0.26 +
      foodPerPersonStress * 0.18 +
      currentUsePressure * 0.18 +
      nomadicScalePressure * 0.22 +
      largeBandFissionPressure * 0.26 +
      chronicDeficitStress * 0.18 +
      (maxBandCapBlockingFragmentation ? 0.12 : 0) +
      (pressureState?.netMovePressure ?? 0.18) * 0.14 +
      knowledgeSaturation * 0.08 +
      returnPlaceStrain * 0.1 +
      frontierOpportunity * 0.22 +
      (crisisBreakaway?.pressure ?? 0) * 0.16 +
      Math.max(0, roundedPopulation - MINIMUM_SPLIT_POPULATION) / 70,
  );
  const dangerPenalty = clamp01(
    mortalityPressure * 0.2 +
      (viableFrontier === undefined ? 0.12 : 0) +
      (currentMemory?.attachment ?? 0) * Math.max(0, 0.22 - currentUsePressure),
  );
  const splitPressure = clamp01(
    previous.splitPressure * 0.72 +
      pressureSignal * 0.34 -
      dangerPenalty * 0.18 +
      (crisisBreakawayEligible ? (crisisBreakaway?.pressure ?? 0) * 0.08 : 0),
  );
  const primaryReason = getDemographyPrimaryReason({
    world,
    band,
    population: roundedPopulation,
    comfortablePopulation,
    householdCount: nextHouseholdCount,
    comfortableHouseholds,
    householdCrowdingPressure,
    foodPerPersonStress,
    currentUsePressure,
    nomadicScalePressure,
    maxBandCapBlockingFragmentation,
  });
  const demographicState: BandDemography = {
    population: roundedPopulation,
    growthAccumulator: populationAccounting.growthAccumulator,
    mortalityAccumulator: populationAccounting.mortalityAccumulator,
    lastPopulationChangeReasonIds:
      roundedPopulation === population
        ? previous.lastPopulationChangeReasonIds ?? []
        : [primaryReason.id],
    householdCount: nextHouseholdCount,
    dependents: cohorts.dependents,
    workingAdults: cohorts.workingAdults,
    elders: cohorts.elders,
    fertilityPressure: round2(fertilityPressure),
    mortalityPressure: round2(mortalityPressure),
    foodPerPersonStress: round2(foodPerPersonStress),
    foodMortalityContribution: round2(foodMortalityContribution),
    foodFertilitySuppression: round2(foodFertilitySuppression),
    householdCrowdingPressure: round2(householdCrowdingPressure),
    splitPressure: round2(splitPressure),
    lastDemographicUpdate: world.time,
    sourceReasonIds: [
      ...addUnique(previous.sourceReasonIds, primaryReason.id),
      ...buildCohortReasonIds(world, band.id, cohorts),
    ].slice(-16),
    dependentToAdultAccumulator: cohorts.dependentToAdultAccumulator,
    adultToElderAccumulator: cohorts.adultToElderAccumulator,
    elderMortalityAccumulator: cohorts.elderMortalityAccumulator,
    birthAccumulator: cohorts.birthAccumulator,
    lastBirths: cohorts.birthsAdded,
    lastDeaths: cohorts.totalDeaths,
    lastDependentsMatured: cohorts.dependentsMatured,
    lastAdultsAged: cohorts.adultsAged,
    lastEldersDied: cohorts.eldersDied,
    lastDependentDeaths: cohorts.dependentDeaths,
    lastAdultDeaths: cohorts.adultDeaths,
    lastCrisisDeaths: crisisDeaths,
    lastWaterStressDeaths: waterStressDeaths,
    lastStarvationDeaths: starvationDeaths,
    lastMigrationHardshipDeaths: migrationHardshipDeaths,
    demographicChurn: churn,
    noDeathAudit,
  };
  const deferredReason = getSplitDeferredReason({
    world,
    band,
    demography: demographicState,
    viableFrontier,
    mortalityPressure,
    crisisBreakawayEligible,
  });
  const crisisBreakawayCreatesDaughter =
    crisisBreakawayEligible &&
    viableFrontier !== undefined &&
    demographicState.splitPressure >= 0.48 &&
    hasFissionCooldownElapsed(world.time, band, population);

  return {
    demography: demographicState,
    deathMemory,
    primaryReason,
    localUsePressure: currentUsePressure,
    comfortablePopulation,
    viableFrontier,
    shouldCreateDaughter:
      deferredReason === undefined &&
      (demographicState.splitPressure >= SPLIT_PRESSURE_THRESHOLD || crisisBreakawayCreatesDaughter) &&
      hasFissionCooldownElapsed(world.time, band, population),
    deferredReason,
  };
}

function applyDemographyUpdate(
  world: WorldState,
  band: Band,
  computation: DemographyComputation,
): Band {
  const traces = getDemographyTraces(world, band, computation);

  return {
    ...band,
    size: Math.round(computation.demography.population),
    demography: computation.demography,
    deathMemory: computation.deathMemory ?? band.deathMemory,
    socialPressure: applyDemographyToSocialPressure(
      band.socialPressure,
      computation.demography,
    ),
    causalTraces: [...band.causalTraces, ...traces].slice(-80),
  };
}

// Band-level state a freshly-split daughter must NOT inherit wholesale through the
// `{ ...parent }` spread — each is explicitly inherited (partial), reset, or
// degraded in createDaughterBand. `satisfies readonly (keyof Band)[]` keeps the
// list valid if a field is renamed. 2K.1D-A.
const DAUGHTER_NON_CLONEABLE_FIELDS = [
  "knowledge", // inherit: partial known tiles
  "placeMemory", // inherit: partial
  "travelCorridors", // inherit: partial
  "crossingMemories", // inherit: partial
  "resourceKnowledgeState", // inherit: partial + degraded (inheritResourceKnowledgeForDaughter)
  "resourceEcology", // reset/recompute: derived from current support, activity, and inherited resource knowledge
  "visibleNature", // reset/recompute: visible animals/plants require the daughter's own known range and trips
  "animalPatternKnowledge", // inherit: bounded degraded observations only, never current hidden stock state
  "animalManagement", // reset: management depends on the daughter's own contact, labor, water, and camp
  "acuteRisk", // reset: acute short-run hardship is the parent's recent embodied risk memory, not inherited wholesale
  "usePressure", // reset: own use pressure accrues
  "encounterRecords", // reset
  "contactMemories", // reset
  "reportedKnowledge", // reset: reports are receiver-specific second-hand records
  "visibleLandscapeCues", // reset: current-horizon cues belong to the daughter's new camp
  "recentRangeFrictionEvents", // reset: record-only RANGE-4 notices are observer-specific recent history
  "encounterPerceptions", // reset
  "encounterResponses", // reset
  "decisionHistory", // reset
  "fissionEvents", // reset to [own creation event]
  "intentHistory", // reset to [dispersal intent]
  "movementHistory", // reset
  "lastIntraSeasonTrip", // reset: task-group trip history is parent's own in-season activity
  "recentIntraSeasonTrips", // reset: daughters earn their own trip cadence
  "seasonalEcologyMemory", // reset: a daughter learns its own seasonal ecology by observation (ECO-SEASON-1)
  "seasonalSupport", // reset/recompute: a daughter earns its own seasonal support history
  "deathMemory", // reset: recent death/caution memory is parent-specific
  "innerFission", // reset/recompute: internal subgroup pressure is current-band state
  "socialTension", // reset/recompute: social readability belongs to the daughter's own contacts/range
  "eventHistory", // reset/recompute: selected-band history belongs to this independent band only
  "campRumors", // reset/recompute: rumor readability belongs to this band's own contacts/support state
  "conditionProfile", // reset/recompute: summary is current-band state, not inherited identity
  "lineageReadability", // reset/recompute: daughter gets its own lineage display from metadata
  "protoCampMemory", // reset/recompute: camp-like places require the daughter's own repeated use
  "protoAccessMemory", // reset/recompute: access expectations require the daughter's own observed place/contact memory
  "foragingAdaptation", // reset/recompute: empirical learning/desperation is current-band lived experience
  "bodyCampLogistics", // reset/recompute: weather, sickness, carry, material, and camp-waste pressure are current-band lived logistics
  "technologies", // legacy display tags are not inherited as complex competence
  "relationshipMemory", // reset/recompute: practice, reputation, route, and place-character memory is current-band lived relationship state
  "recentResidentialMoveEvents", // reset: a daughter does not inherit the parent's relocation events (RESIDENTIAL-MOVE-1)
  "activityLaborSummary", // reset: labor allocation is a current-day parent snapshot, not inherited history
  "activityOutcomeSummary", // reset: deterministic trip outcome scaffold is parent's current/recent activity history
  "activityMemoryUpdateSummary", // reset: activity-derived memory effects are parent's current/recent patch history
  "probeMemory", // reset: a daughter has no probe history of its own (2K.1G)
  "recentScoutLearning", // reset: debug ring is the parent's scout-learning history (2K.1I-A)
  "lastResourceScout", // reset: the parent's latest scout debug event (now carrying 2K.5 patch-return guidance) is never perfect-copied
  "lastPlantUseTest", // reset: plant-use test event is parent's debug/event history (2K.2E)
  "recentPlantUseTests", // reset: do not clone cautious plant testing history as inherited competence (2K.2E)
  "lastCauseSpecificEvent", // reset: cause-specific event is parent's debug/event history (2K.3A)
  "recentCauseSpecificEvents", // reset: do not clone cause-specific caution history as inherited memory (2K.3A)
  "exploitationSkill", // inherit: DEGRADED (2K.6) — cultural transmission of processing skill, never a perfect copy (competence halved, processing_learned re-earned)
  "frontierIntent", // inherit: DEGRADED on frontier-driven fission (M0.3); never a hard parent lock
  "frontierResidence", // reset: residence is EARNED at the daughter's own frontier locus, never inherited (M0.4)
  "frontierKnowledge", // reset: shoreline knowledge is FORMED from the daughter's own presence, never inherited (M0.6)
  "corridorRelocation", // reset: relocation cadence is the daughter's OWN; never inherit a parent's cooldown/reluctance (M0.8-A)
  "frontierProbeCadence", // reset: shore-probe cadence is the daughter's OWN; never inherit a parent's probe cooldown (M0.8-B)
  "sideProbeMemory", // reset: side-country probe cadence/budget is the daughter's OWN; never inherit a parent's cooldown/lifetime count (M0.16B)
  "proactiveInfoMemory", // reset: proactive-info cadence is the daughter's OWN; never inherit a parent's cooldown (2K.6B/INFO-1)
  "corridorHeading", // reset: directional heading is EARNED from the daughter's own realized motion; never inherited (M0.9)
  "adaptiveHuman", // inherit/reset: daughters carry partial hints only, never tested attempts or routines
  "campMovement", // reset: daughters establish their own camp-place state and do not inherit parent-tested establishment
  "seasonalRoute", // reset
  "daughterBandIds", // reset
  "causalTraces", // reset to [own trace]
  "deepHistory", // inherit: OWN founding snapshot + bounded inherited summaries (DEEP-TIME-HISTORY-TECH-1) — never the parent's history object
] as const satisfies readonly (keyof Band)[];

// Structural guard (2K.1D-A): fail loudly when a non-cloneable field still points
// at the parent's object/array (i.e. it slipped through the spread unhandled).
// Only fires on a genuine clone bug — current construction overrides each with a
// fresh value, so this is a no-op pass-through. Cheap (event-time, ~17 ===) and
// deterministic.
function assertDaughterFissionStateNotCloned(parent: Band, daughter: Band): void {
  const shared: string[] = [];

  for (const field of DAUGHTER_NON_CLONEABLE_FIELDS) {
    const parentValue = parent[field];

    if (parentValue !== undefined && daughter[field] === parentValue) {
      shared.push(field);
    }
  }

  if (shared.length > 0) {
    throw new Error(
      `Fission clone guard (2K.1D-A): daughter ${String(daughter.id)} shares non-cloneable state with parent ${String(parent.id)} via the { ...parent } spread: ${shared.join(", ")}. Each must be explicitly inherited / reset / degraded in createDaughterBand.`,
    );
  }
}

function createDaughterBand(
  world: WorldState,
  parent: Band,
  computation: DemographyComputation,
): DaughterCreation | undefined {
  const target = computation.viableFrontier;

  if (target === undefined) {
    return undefined;
  }

  const parentPopulationBefore = toPopulationCount(parent.demography.population);
  const daughterPopulation = getDaughterPopulation(parentPopulationBefore);

  if (daughterPopulation < DAUGHTER_MIN_POPULATION) {
    return undefined;
  }

  const daughterIndex = parent.daughterBandIds.length + 1;
  const daughterBandId = makeDaughterBandId(parent.id, daughterIndex, world.time.tick);
  const splitReason = makeFissionReason(world, parent, daughterBandId, target, daughterPopulation);
  const inheritedKnowledge = inheritKnowledgeState(world, parent, daughterBandId, target.tileId);
  const inheritedMemory = inheritPlaceMemory(parent, inheritedKnowledge);
  const inheritedCrossings = inheritCrossingMemories(parent, inheritedKnowledge);
  const inheritedCorridors = inheritTravelCorridors(parent, inheritedKnowledge);
  // Resource knowledge inheritance (2K.1D): partial, degraded, source-tagged — NOT
  // the wholesale parent copy the `...parent` spread would otherwise carry.
  const inheritedResourceKnowledge = inheritResourceKnowledgeForDaughter(parent.resourceKnowledgeState, {
    parentBandId: parent.id,
    daughterBandId,
    daughterTileId: target.tileId,
    currentTick: world.time.tick,
    inheritedKnownTileIds: new Set(Object.keys(inheritedKnowledge.observedTiles) as TileId[]),
  });
  const inheritanceProfile = getInheritanceProfile(parent, inheritedKnowledge, inheritedMemory, inheritedCrossings, inheritedCorridors);
  const targetTile = getTile(world, target.tileId);

  if (targetTile === undefined) {
    return undefined;
  }

  const parentPopulationAfter = toPopulationCount(parentPopulationBefore - daughterPopulation);
  const worldPopulationBeforeFission = getWorldPopulation(world);
  const worldPopulationAfterFission = worldPopulationBeforeFission;
  const daughterIntent = createDaughterDispersalIntent(
    world,
    parent,
    daughterBandId,
    target.tileId,
    target.score,
  );
  const event: BandFissionEvent = {
    id: makeFissionEventId(parent.id, daughterBandId, world.time.tick),
    time: world.time,
    tick: world.time.tick,
    parentBandId: parent.id,
    daughterBandId,
    splitReason,
    parentPopulationBefore,
    daughterPopulation,
    parentPopulationAfter,
    originTileId: parent.position,
    targetTileId: target.tileId,
    inheritedKnowledgeCount: Object.keys(inheritedKnowledge.observedTiles).length,
    inheritedMemoryCount: Object.keys(inheritedMemory).length,
    inheritedCrossingCount: Object.keys(inheritedCrossings).length,
    inheritedCorridorCount: Object.keys(inheritedCorridors).length,
    parentResourceMemoryCount: parent.resourceKnowledgeState?.patchMemories.length ?? 0,
    inheritedResourceMemoryCount: inheritedResourceKnowledge.patchMemories.length,
    inheritedResourceAvgDetailLoss: inheritedResourceKnowledge.patchMemories.length === 0
      ? 0
      : round2(
          inheritedResourceKnowledge.patchMemories.reduce((sum, memory) => sum + memory.transmission.detailLoss, 0) /
            inheritedResourceKnowledge.patchMemories.length,
        ),
    worldPopulationBeforeFission,
    worldPopulationAfterFission,
    fissionPopulationConserved: worldPopulationBeforeFission === worldPopulationAfterFission,
  };
  const lineage: BandLineageLink = {
    parentBandId: parent.id,
    daughterBandId,
    createdAt: world.time,
    originTileId: parent.position,
    relation: target.frontierValue > 0.5 ? "frontier_split" : "pressure_split",
    contactMemory: 0.72,
    reasonIds: [splitReason.id],
  };
  const parentDemography = recomputeDemographicCounts({
    ...parent.demography,
    population: parentPopulationAfter,
    splitPressure: round2(parent.demography.splitPressure * 0.34),
    lastPopulationChangeReasonIds: [splitReason.id],
    sourceReasonIds: addUnique(parent.demography.sourceReasonIds, splitReason.id).slice(-16),
  });
  const parentTrace = makeFissionTrace(world, parent.id, parent.position, target.tileId, splitReason.id);
  const daughter: Band = {
    // FISSION CLONE TRAP (2K.1D-A): this { ...parent } spread copies EVERY parent
    // field by reference. Any band-level state that a freshly-split daughter must
    // NOT inherit wholesale (knowledge / memory / history / per-band beliefs) MUST
    // be explicitly overridden below with one of: copy / reset / degrade / inherit /
    // recompute. New band-level state added in future checkpoints must make that
    // choice here AND be registered in DAUGHTER_NON_CLONEABLE_FIELDS if sensitive;
    // the assertDaughterFissionStateNotCloned guard below fails loudly otherwise.
    ...parent,
    id: daughterBandId,
    name: `${parent.name} Daughter ${daughterIndex}`,
    color: deriveDaughterColor(parent.color, daughterIndex, activeBandColors(world)),
    position: target.tileId,
    size: daughterPopulation,
    status: "foraging",
    knowledge: inheritedKnowledge,
    seasonalRoute: [],
    consecutiveSeasonsOnTile: 0,
    decisionHistory: [],
    cohesion: clamp01(parent.cohesion * 0.94 + 0.04),
    hungerPressure: clamp01(parent.hungerPressure * 0.86),
    territorialPressure: clamp01(parent.territorialPressure * 0.72 + 0.04),
    demography: createDaughterDemography(world.time, daughterPopulation, splitReason.id),
    biomeAdaptation: inheritBiomeAdaptation(parent.biomeAdaptation, targetTile, world.time),
    socialPressure: applyDemographyToSocialPressure(parent.socialPressure, createDaughterDemography(world.time, daughterPopulation, splitReason.id)),
    parentBandId: parent.id,
    daughterBandIds: [],
    lineage,
    fissionEvents: [event],
    initialSpawnReason: undefined,
    currentIntent: daughterIntent,
    intentHistory: [daughterIntent],
    movementHistory: [],
    lastIntraSeasonTrip: undefined,
    recentIntraSeasonTrips: undefined,
    seasonalEcologyMemory: undefined,
    seasonalSupport: undefined,
    deathMemory: undefined,
    innerFission: undefined,
    socialTension: undefined,
    eventHistory: undefined,
    campRumors: undefined,
    conditionProfile: undefined,
    lineageReadability: undefined,
    protoCampMemory: undefined,
    protoAccessMemory: undefined,
    foragingAdaptation: undefined,
    bodyCampLogistics: undefined,
    technologies: parent.technologies.filter((technology) => technology === "basic_foraging"),
    storageCapacity: 0.16,
    relationshipMemory: undefined,
    recentResidentialMoveEvents: undefined,
    activityLaborSummary: undefined,
    activityOutcomeSummary: undefined,
    activityShadowSubsistenceSummary: undefined,
    activityMemoryUpdateSummary: undefined,
    probeMemory: undefined, // 2K.1G: a daughter starts with no probe history of its own
    recentScoutLearning: undefined, // 2K.1I-A: do not clone the parent's debug learning ring
    lastResourceScout: undefined, // 2K.5: the parent's last scout debug (incl. patch-return guidance) resets on fission
    lastPlantUseTest: undefined, // 2K.2E: plant test events are not perfectly inherited
    recentPlantUseTests: undefined, // 2K.2E: debug/event ring resets on fission
    lastCauseSpecificEvent: undefined, // 2K.3A: cause-specific events are not perfectly inherited
    recentCauseSpecificEvents: undefined, // 2K.3A: cause-specific event ring resets on fission
    // 2K.6: exploitation skill transmits DEGRADED (cultural transmission, never perfect) —
    // competence halved, processing_learned downgraded to suspected (re-earn), confirmed
    // problems kept as caution. A NEW object (clone-guard safe); undefined if parent had none.
    exploitationSkill: degradeInheritedExploitationSkill(parent.exploitationSkill, daughterBandId, world.time.tick),
    // FrontierIntent v0 (M0.3): a daughter splitting toward the frontier inherits a
    // DEGRADED outward drift so a lineage can sustain frontier range — but it is not
    // a hard parent-attachment lock; it decays unless the daughter's own evidence
    // renews it. Pressure-splits hand over no intent.
    frontierIntent: inheritFrontierIntentForDaughter(
      world,
      parent,
      daughterBandId,
      target.tileId,
      target.frontierValue > 0.5,
      world.time.tick,
    ),
    // FrontierResidence v0 (M0.4): never inherited — a daughter EARNS retention at
    // her own reached frontier locus from her own local experience (reset to undefined).
    frontierResidence: undefined,
    // FrontierKnowledge v0 (M0.6): never inherited — a daughter FORMS shoreline
    // knowledge from her own sustained presence on a water boundary (reset to undefined).
    frontierKnowledge: undefined,
    // Corridor-relocation cadence (M0.8-A): never inherited — a daughter starts with a
    // clean cooldown/reluctance and earns her own settle→step rhythm (reset to undefined).
    corridorRelocation: undefined,
    // Shore-probe cadence (M0.8-B): never inherited — a daughter starts with a clean
    // probe cooldown and earns her own burst→rest rhythm (reset to undefined).
    frontierProbeCadence: undefined,
    // Side-country probe cadence/budget (M0.16B): never inherited — a daughter starts with a
    // clean cooldown and a full lifetime budget, earning her own side-scouting (reset).
    sideProbeMemory: undefined,
    // Proactive-info cadence (2K.6B/INFO-1): never inherited — a daughter earns her own
    // learning rhythm (reset to undefined).
    proactiveInfoMemory: undefined,
    // Directional heading (M0.9): never inherited — a daughter earns her own bearing from
    // her own realized motion (reset to undefined). No clear inherited-route reason in v0.
    corridorHeading: undefined,
    // ADAPTIVE-HUMAN-1: daughters may carry a few partial ideas/variants as hints,
    // but never parent-tested attempts, routines, or local adaptations.
    adaptiveHuman: inheritAdaptiveHumanForDaughter(parent.adaptiveHuman, daughterBandId, world.time.tick),
    // INVENTION-1: daughters inherit a few WEAKENED practical fragments (basis
    // "inherited", must be re-proven locally); composed responses never travel.
    practicalAdaptation: inheritPracticalAdaptationForDaughter(parent.practicalAdaptation, daughterBandId, world.time.tick),
    // CAMP-MOVEMENT-1: daughter establishment starts as local lived evidence only
    // after her own first seasons; never clone parent camp-shift or old-anchor state.
    campMovement: undefined,
    placeMemory: inheritedMemory,
    // Override the wholesale `...parent` clone with the partial degraded inheritance.
    resourceKnowledgeState: inheritedResourceKnowledge,
    resourceEcology: undefined,
    visibleNature: undefined,
    animalPatternKnowledge: inheritAnimalPatternKnowledgeForDaughter(parent.animalPatternKnowledge, daughterBandId, world.time.tick),
    animalManagement: undefined,
    acuteRisk: undefined,
    travelCorridors: inheritedCorridors,
    crossingMemories: inheritedCrossings,
    usePressure: {},
    pressureState: undefined,
    inheritanceProfile,
    encounterRecords: [],
    contactMemories: {},
    reportedKnowledge: undefined,
    visibleLandscapeCues: undefined,
    recentRangeFrictionEvents: undefined,
    encounterPerceptions: [],
    encounterResponses: [],
    temporarySeparation: undefined,
    viability: {
      bandId: daughterBandId,
      population: daughterPopulation,
      minimumViablePopulation: 14,
      viabilityPressure: 0.08,
      extinctionRisk: 0,
      absorptionOpportunity: 0.18,
      status: "viable",
      reasonIds: [splitReason.id],
    },
    causalTraces: [makeFissionTrace(world, daughterBandId, parent.position, target.tileId, splitReason.id)],
    // DEEP-TIME-HISTORY-TECH-1: never the parent's history object — replaced
    // below with the daughter's OWN founding snapshot + bounded inheritance.
    deepHistory: undefined,
  };
  const daughterWithHistory: Band = {
    ...daughter,
    deepHistory: createDaughterDeepHistory(world, parent, {
      daughterBandId,
      foundingTileId: target.tileId,
      lineage,
      fissionEvent: event,
      startingDependents: daughter.demography.dependents,
      startingWorkingAdults: daughter.demography.workingAdults,
      startingElders: daughter.demography.elders,
    }),
  };
  assertDaughterFissionStateNotCloned(parent, daughterWithHistory);
  const parentBand: Band = {
    ...parent,
    size: Math.round(parentPopulationAfter),
    status: "splitting",
    demography: parentDemography,
    socialPressure: applyDemographyToSocialPressure(parent.socialPressure, parentDemography),
    daughterBandIds: addUnique(parent.daughterBandIds, daughterBandId),
    fissionEvents: [...parent.fissionEvents, event].slice(-12),
    activityLaborSummary: undefined,
    activityOutcomeSummary: undefined,
    activityShadowSubsistenceSummary: undefined,
    activityMemoryUpdateSummary: undefined,
    causalTraces: [...parent.causalTraces, parentTrace].slice(-80),
  };

  return {
    parent: parentBand,
    daughter: daughterWithHistory,
  };
}

function createDaughterDispersalIntent(
  world: WorldState,
  parent: Band,
  daughterBandId: BandId,
  targetTileId: TileId,
  pressure: number,
): MobilityIntent {
  const reason: Reason = {
    ...makeReasonBase(world, parent, "daughter-dispersal-intent", parent.daughterBandIds.length + 1),
    type: "daughter_dispersal_intent_created",
    strength: clamp01(pressure),
    confidence: 0.86,
    relatedTileIds: [parent.position, targetTileId],
    bandId: daughterBandId,
    parentBandId: parent.id,
    originTileId: parent.position,
    targetTileId,
    expectedHorizonTicks: 20 as TickNumber,
    pressure: clamp01(pressure),
  };

  return {
    kind: "seek_new_range",
    createdAt: world.time,
    expectedHorizonTicks: 20 as TickNumber,
    targetTileId,
    directionVector: getDirectionBetweenTileIds(world, parent.position, targetTileId),
    reason,
    confidence: 0.86,
    persistence: 0.84,
  };
}

function selectFissionTarget(
  world: WorldState,
  band: Band,
  comfortablePopulation: number,
  contextCache?: TickContextCache,
): FissionTargetCandidate | undefined {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return undefined;
  }

  return getFissionTargetRecordIds(band, contextCache)
    .map((tileId) => band.knowledge.observedTiles[tileId])
    .filter((record): record is KnownTileRecord =>
      record !== undefined &&
      record.tileId !== band.position &&
      record.confidence >= 0.34,
    )
    .map((record) =>
      scoreFissionTarget(
        world,
        band,
        currentTile,
        record,
        comfortablePopulation,
        contextCache,
      ),
    )
    .filter((candidate): candidate is FissionTargetCandidate => candidate !== undefined)
    .sort((left, right) => compareFissionTargetsSeeded(world, band, left, right))[0];
}

// VAR-1: fission-target ordering with the same seeded near-tie jitter as
// movement (where a daughter founds is a key migration-divergence lever).
// runSeed undefined → reduces to compareFissionTargets (legacy byte-identical);
// otherwise close targets reorder per seed, a clear best target never flips.
function compareFissionTargetsSeeded(
  world: WorldState,
  band: Band,
  left: FissionTargetCandidate,
  right: FissionTargetCandidate,
): number {
  const runSeed = world.runSeed;

  if (runSeed === undefined) {
    return compareFissionTargets(left, right);
  }

  const tick = Number(world.time.tick);
  const leftScore =
    left.score +
    seededTieBreakJitter(runSeed, [tick, String(band.id), "fission", String(left.tileId)]) *
      FISSION_TIEBREAK_EPSILON;
  const rightScore =
    right.score +
    seededTieBreakJitter(runSeed, [tick, String(band.id), "fission", String(right.tileId)]) *
      FISSION_TIEBREAK_EPSILON;

  return leftScore !== rightScore
    ? rightScore - leftScore
    : String(left.tileId).localeCompare(String(right.tileId));
}

function getFissionTargetRecordIds(
  band: Band,
  contextCache?: TickContextCache,
): readonly TileId[] {
  const salient = getSalientMemorySummary(contextCache, band.id);

  if (salient === undefined) {
    return Object.keys(band.knowledge.observedTiles) as TileId[];
  }

  return [...new Set<TileId>([
    ...salient.knownFrontierTileIds,
    ...salient.knownOpportunityCandidateIds,
    ...salient.topAnchorPlaceIds,
    ...salient.topReturnPlaceIds,
  ])].slice(0, 72);
}

// RANGE-3B: founder-style daughter colonization fission bias constants
// (normal MVP default; audits can set the flag false). These only affect target scoring once ordinary
// demography has already allowed a fission and the target is already band-known.
const COLONIZE_MIN = 0.24;
const COLONIZE_FULL = 0.58;
const COLONIZE_BONUS_W = 0.72;
const DIST_RELAX = 0.2;
const ROUTE_RELAX = 0.18;
const MAX_FOUNDER_DISTANCE_RELAX = 0.34;

interface FounderPulseTargetContext {
  readonly pressure: number;
  readonly opportunityMatch: boolean;
  readonly routeEvidence: number;
  readonly fordEvidence: number;
  readonly edgeEvidence: number;
  readonly sideCountryEvidence: number;
  readonly parentOverlap: number;
  readonly lackOwnCore: number;
  readonly safeFrontierPull: number;
  readonly confidence: number;
  readonly knownCausalEvidence: boolean;
}

function getFounderPulseTargetContext(input: {
  readonly band: Band;
  readonly record: KnownTileRecord;
  readonly tile: Tile;
  readonly corridorMemory: TravelCorridorMemory | undefined;
  readonly crossingMemory: KnownCrossingMemory | undefined;
  readonly corridorValue: number;
  readonly frontierValue: number;
  readonly waterValue: number;
  readonly riskPenalty: number;
}): FounderPulseTargetContext {
  const opportunity = input.band.daughterColonization?.bestKnownUnusedHabitatOpportunity;
  const opportunityMatch =
    opportunity !== undefined &&
    opportunity.consideredAsTarget &&
    opportunity.candidateTileId === input.record.tileId;
  const fordEvidence = clamp01((input.crossingMemory?.successConfidence ?? 0) * 0.9);
  const edgeEvidence = clamp01(
    input.frontierValue * 0.52 +
      input.corridorValue * 0.42 +
      (input.tile.isRiverbank || input.tile.isFloodplain || input.tile.isCoastal || input.tile.isEstuary ? 0.18 : 0),
  );
  const sideCountryEvidence = getKnownSideCountrySettlementEvidence(input.band, input.record.tileId);
  const routeEvidence = getFounderRouteEvidence({
    opportunityBasis: opportunity?.basis ?? [],
    corridorMemory: input.corridorMemory,
    fordEvidence,
    edgeEvidence,
    sideCountryEvidence,
  });
  const parentOverlap = input.band.pressureState?.parentCoreOverlap ?? 0;
  const safeFrontierPull = input.band.pressureState?.safeFrontierPull ?? 0;
  const daughterDispersalPressure = input.band.pressureState?.daughterDispersalPressure ?? 0;
  const lackOwnCore = getLackOwnCorePressure(input.band);
  const basePressure = input.band.daughterColonization?.pressure ?? 0;
  const pressure = clamp01(
    basePressure +
      parentOverlap * 0.18 +
      daughterDispersalPressure * 0.16 +
      safeFrontierPull * 0.12 +
      lackOwnCore * 0.12 +
      sideCountryEvidence * 0.08,
  );
  const confidence = clamp01(
    input.record.confidence * 0.38 +
      (opportunity?.confidence ?? 0) * 0.34 +
      routeEvidence * 0.14 +
      input.waterValue * 0.14,
  );
  const knownCausalEvidence =
    opportunityMatch &&
    pressure >= COLONIZE_MIN &&
    input.record.confidence >= 0.34 &&
    (opportunity?.confidence ?? 0) >= 0.34 &&
    input.waterValue >= 0.32 &&
    input.riskPenalty <= 0.5 &&
    routeEvidence >= 0.3;

  return {
    pressure: round2(pressure),
    opportunityMatch,
    routeEvidence: round2(routeEvidence),
    fordEvidence: round2(fordEvidence),
    edgeEvidence: round2(edgeEvidence),
    sideCountryEvidence: round2(sideCountryEvidence),
    parentOverlap: round2(parentOverlap),
    lackOwnCore: round2(lackOwnCore),
    safeFrontierPull: round2(safeFrontierPull),
    confidence: round2(confidence),
    knownCausalEvidence,
  };
}

function getFounderRouteEvidence(input: {
  readonly opportunityBasis: readonly string[];
  readonly corridorMemory: TravelCorridorMemory | undefined;
  readonly fordEvidence: number;
  readonly edgeEvidence: number;
  readonly sideCountryEvidence: number;
}): number {
  const basisRouteEvidence = input.opportunityBasis.some(
    (basis) =>
      basis === "river_corridor_inference" ||
      basis === "coast_corridor_inference" ||
      basis === "lake_wetland_chain" ||
      basis === "pass_corridor" ||
      basis === "scout_probe_result" ||
      basis === "seasonal_round_memory",
  )
    ? 0.38
    : 0;
  const personallyKnownEvidence = input.opportunityBasis.some(
    (basis) => basis === "personally_observed" || basis === "remembered_place",
  )
    ? 0.22
    : 0;

  return clamp01(
    basisRouteEvidence +
      personallyKnownEvidence +
      (input.corridorMemory?.confidence ?? 0) * 0.34 +
      input.fordEvidence * 0.32 +
      input.edgeEvidence * 0.28 +
      input.sideCountryEvidence * 0.22,
  );
}

function getKnownSideCountrySettlementEvidence(band: Band, tileId: TileId): number {
  const patchEvidence =
    band.resourceKnowledgeState?.patchMemories
      .filter((memory) => memory.approximateTile === tileId || memory.linkedTiles.includes(tileId))
      .map((memory) => {
        const reasonEvidence = memory.reasonIds.some((reasonId) => String(reasonId).includes("side_country")) ? 0.34 : 0;
        const sourceEvidence = memory.source === "direct" ? 0.18 : memory.source === "inferred" ? 0.08 : 0;
        const confidenceEvidence = clamp01(
          memory.confidence.presenceConfidence * 0.24 +
            memory.confidence.accessConfidence * 0.22 +
            memory.confidence.safetyConfidence * 0.18,
        );
        return reasonEvidence + sourceEvidence + confidenceEvidence;
      })
      .sort((left, right) => right - left)[0] ?? 0;

  const scoutEvidence =
    band.recentIntraSeasonTrips
      ?.filter((trip) => trip.targetTileId === tileId)
      .map((trip) => (trip.activityResult === "successful_observation" || trip.activityResult === "target_found" ? 0.2 : 0.08))
      .sort((left, right) => right - left)[0] ?? 0;

  return round2(clamp01(patchEvidence + scoutEvidence));
}

function getLackOwnCorePressure(band: Band): number {
  const returnPlaceCount = Object.values(band.placeMemory).filter(
    (memory) => memory.isReturnPlace && memory.attachment >= 0.45,
  ).length;
  const sparseCatchment =
    band.rangeSaturation?.densityPhase === "founder_sparse_range" ||
    (band.residentialAnchor?.catchmentTileIds.length ?? 0) < 3;
  const weakAnchor = band.residentialAnchor === undefined || band.residentialAnchor.holdValue < 0.42;

  return clamp01(
    (returnPlaceCount === 0 ? 0.34 : returnPlaceCount === 1 ? 0.18 : 0) +
      (sparseCatchment ? 0.32 : 0) +
      (weakAnchor ? 0.22 : 0),
  );
}

export function deriveKnownBandSpacingForFission(
  world: WorldState,
  band: Band,
  targetTileId: TileId,
): KnownBandSpacingForFission {
  const targetTile = getTile(world, targetTileId);
  if (targetTile === undefined) {
    return emptyKnownBandSpacingForFission(band, targetTileId);
  }

  const knownBands = band.knowledge.knownBands
    .filter((record) => record.confidence > 0.24 && record.bandId !== band.id)
    .sort((left, right) =>
      right.confidence - left.confidence ||
      Number(right.lastObservedAt.tick) - Number(left.lastObservedAt.tick) ||
      String(left.bandId ?? left.lastKnownTileId).localeCompare(String(right.bandId ?? right.lastKnownTileId)),
    )
    .slice(0, 12);

  let closestKnownBandDistanceTiles: number | undefined;
  let trustedKinTolerance = 0;
  let crowdedContactPressure = 0;
  let penalty = 0;

  for (const knownBand of knownBands) {
    const knownTile = getTile(world, knownBand.lastKnownTileId);
    if (knownTile === undefined) {
      continue;
    }

    const distance = getGridDistance(targetTile, knownTile);
    closestKnownBandDistanceTiles =
      closestKnownBandDistanceTiles === undefined ? distance : Math.min(closestKnownBandDistanceTiles, distance);
    const contact = knownBand.bandId === undefined ? undefined : band.contactMemories[knownBand.bandId];
    const kinTolerance = contact === undefined
      ? 0
      : contact.relation === "parent_daughter" || contact.relation === "siblings"
        ? 0.48
        : contact.trustLikeTolerance * 0.24;
    const contactCrowding = contact === undefined
      ? 0
      : clamp01(contact.sharedUseCount * 0.08 + contact.tension * 0.22 + contact.strainedContactCount * 0.06);
    const proximityPressure =
      distance <= 2
        ? 1
        : distance <= 5
          ? 0.62
          : distance <= 8
            ? 0.28
            : 0;
    trustedKinTolerance = Math.max(trustedKinTolerance, kinTolerance);
    crowdedContactPressure = Math.max(crowdedContactPressure, contactCrowding);
    penalty += proximityPressure * (1 - kinTolerance) * (0.1 + knownBand.confidence * 0.12) + contactCrowding * 0.08;
  }

  return {
    knownBandsConsidered: knownBands.length,
    closestKnownBandDistanceTiles,
    trustedKinTolerance: round2(clamp01(trustedKinTolerance)),
    crowdedContactPressure: round2(clamp01(crowdedContactPressure)),
    knownBandSpacingPenalty: round2(clamp01(penalty)),
    hiddenUnknownBandAvoidance: 0,
    reasonIds:
      knownBands.length > 0
        ? [`reason:${String(band.id)}:${String(targetTileId)}:fission_known_band_spacing` as ReasonId]
        : [],
  };
}

function emptyKnownBandSpacingForFission(
  band: Band,
  targetTileId: TileId,
): KnownBandSpacingForFission {
  return {
    knownBandsConsidered: 0,
    trustedKinTolerance: 0,
    crowdedContactPressure: 0,
    knownBandSpacingPenalty: 0,
    hiddenUnknownBandAvoidance: 0,
    reasonIds: [`reason:${String(band.id)}:${String(targetTileId)}:fission_no_known_band_spacing` as ReasonId],
  };
}

function scoreFissionTarget(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  record: KnownTileRecord,
  comfortablePopulation: number,
  contextCache?: TickContextCache,
): FissionTargetCandidate | undefined {
  const tile = getTile(world, record.tileId);

  if (tile === undefined || !isViableDaughterTile(tile, record)) {
    return undefined;
  }

  const distance = getGridDistance(currentTile, tile);
  const memory = band.placeMemory[tile.id];
  const localPressure = getLocalUsePressureValue(band.usePressure[tile.id]);
  const nearbyPressure = getNearbyBandPressure(world, band, tile.id, contextCache);
  const crowdingPenalty = getCrowdingPenalty(tile, nearbyPressure);
  const frontierValue = getKnownFrontierValue(world, band, tile);
  const corridorMemory = getBestCorridorMemory(band, tile.id);
  const crossingMemory = getBestCrossingMemory(band, tile.id);
  const corridorValue = clamp01(
    (tile.isRiverbank || tile.isFloodplain || tile.isRiver ? 0.28 : 0) +
      (tile.isConfluence ? 0.16 : 0) +
      (corridorMemory?.confidence ?? 0) * 0.28 +
      (crossingMemory?.successConfidence ?? 0) * 0.2,
  );
  const aquaticValue = clamp01(
    record.observedAquaticPotential * 0.54 +
      (tile.isCoastal ? 0.22 : 0) +
      (tile.isMarshChannel || tile.isEstuary ? 0.18 : 0),
  );
  const knownFood = getKnownFoodEstimate(record);
  const waterValue = record.observedWaterAccess ?? 0.35;
  const rememberedGood = clamp01(
    (memory?.attachment ?? 0) * 0.18 +
      (memory?.valences.includes("reliable") === true ? 0.16 : 0) +
      (memory?.valences.includes("depleted") === true ? -0.24 : 0),
  );
  const scaleFissionPressure = band.nomadicScalePressure?.largeBandFissionPressure ?? 0;
  const ecologicalStress =
    (band.ecologicalStressCauses?.foodDeficit ?? 0) * 0.34 +
    (band.ecologicalStressCauses?.sharedCatchmentCrowding ?? 0) * 0.22 +
    (band.ecologicalStressCauses?.resourceDepletion ?? 0) * 0.2;
  const pressureRelief = clamp01(
    Math.max(0, band.demography.population - comfortablePopulation) / 58 +
      getLocalUsePressureValue(band.usePressure[band.position]) * 0.26 -
      localPressure * 0.22 +
      scaleFissionPressure * 0.28 +
      ecologicalStress * 0.18,
  );
  const hydroBarrierPenalty = getHydroBarrierPenalty(world, band, currentTile.id, tile.id);
  // FrontierIntent v0 (M0.3): when the PARENT holds a sustained frontier intent,
  // bias the daughter's target further along that band-known corridor. The aligned
  // bonus is bounded by intent strength (≤0.85) and partially relaxes the distance
  // penalty for aligned tiles only — it never rewards risk/mountain/crowding (those
  // penalties remain) and never reads truth richness. This converts corridor intent
  // into a less-local daughter target without forcing departure or rich-tile chasing.
  const frontierIntentAlignment = parentFrontierIntentAlignment(world, band, tile.id);
  const distancePenalty = clamp01(Math.max(0, distance - 8) / 18);
  const parentCoreProximityPenalty = clamp01(Math.max(0, 3 - distance) / 3);
  const nearbyRangeValue = distance >= 3 && distance <= 8 ? 0.16 : 0;
  const mountainPenalty = tile.terrainKind === "mountains" || tile.movementCost > 2.35 ? 0.8 : 0;
  const riskPenalty = clamp01((record.observedRisk ?? 0.35) * 0.36 + hydroBarrierPenalty + mountainPenalty);
  // RANGE-3B: daughter/founder colonization fission bias (normal default; explicit false disables it).
  // The bias is selection-only and only applies to the band's own known unused-habitat
  // opportunity, with route/ford/edge/side-country evidence. It never changes split
  // pressure, survival risk, water gates, or the knowledge source of the target tile.
  const colonizationBiasEnabled = world.auditOptions?.daughterColonizationFissionBiasEnabled ?? true;
  const founderContext = colonizationBiasEnabled
    ? getFounderPulseTargetContext({
      band,
      record,
      tile,
      corridorMemory,
      crossingMemory,
      corridorValue,
      frontierValue,
      waterValue,
      riskPenalty,
    })
    : undefined;
  const colonizationPressure = founderContext?.pressure ?? 0;
  const founderDistanceRelax =
    founderContext?.knownCausalEvidence === true
      ? Math.min(
          MAX_FOUNDER_DISTANCE_RELAX,
          DIST_RELAX * colonizationPressure + ROUTE_RELAX * founderContext.routeEvidence + scaleFissionPressure * 0.08,
        )
      : 0;
  const colonizationOpportunityBonus =
    founderContext !== undefined &&
    founderContext.opportunityMatch &&
    founderContext.knownCausalEvidence &&
    founderContext.pressure >= COLONIZE_MIN
      ? COLONIZE_BONUS_W *
        founderContext.pressure *
        founderContext.confidence *
        (0.55 + 0.28 * founderContext.routeEvidence + 0.17 * founderContext.sideCountryEvidence)
      : 0;
  const reportedBias = deriveReportedKnowledgeTargetBias(band, tile.id, {
    currentTick: world.time.tick,
    targetKnown: true,
    routeEvidence:
      corridorMemory !== undefined ||
      crossingMemory !== undefined ||
      corridorValue > 0.28 ||
      frontierValue > 0.2 ||
      (founderContext?.sideCountryEvidence ?? 0) > 0.12,
    localEvidence: distance <= 3,
  });
  const knownBandSpacing = deriveKnownBandSpacingForFission(world, band, tile.id);
  const score =
    knownFood * 0.62 +
    waterValue * 0.4 +
    aquaticValue * 0.26 +
    frontierValue * 0.44 +
    corridorValue * 0.34 +
    rememberedGood +
    pressureRelief * 0.42 +
    nearbyRangeValue +
    frontierIntentAlignment * 0.7 +
    record.confidence * 0.2 -
    localPressure * 0.38 -
    crowdingPenalty * 0.36 -
    knownBandSpacing.knownBandSpacingPenalty * 0.34 -
    parentCoreProximityPenalty * 0.24 -
    (riskPenalty + reportedBias.cautionPenalty * 0.24) * 0.52 -
    distancePenalty * 0.34 * (1 - 0.7 * frontierIntentAlignment - founderDistanceRelax) +
    colonizationOpportunityBonus +
    scaleFissionPressure * 0.18 +
    reportedBias.opportunityBias * 0.42;

  if (score < 0.46) {
    return undefined;
  }

  return {
    tileId: tile.id,
    score: round2(score),
    frontierValue: round2(frontierValue),
    corridorValue: round2(corridorValue),
    aquaticValue: round2(aquaticValue),
    knownBandSpacingPenalty: knownBandSpacing.knownBandSpacingPenalty,
    knownBandsConsidered: knownBandSpacing.knownBandsConsidered,
    closestKnownBandDistanceTiles: knownBandSpacing.closestKnownBandDistanceTiles,
    crossingMemory,
    reasonType: getFissionReasonType(tile, crossingMemory, corridorValue, aquaticValue),
  };
}

function getDemographyPrimaryReason(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly population: number;
  readonly comfortablePopulation: number;
  readonly householdCount: number;
  readonly comfortableHouseholds: number;
  readonly householdCrowdingPressure: number;
  readonly foodPerPersonStress: number;
  readonly currentUsePressure: number;
  readonly nomadicScalePressure: number;
  readonly maxBandCapBlockingFragmentation: boolean;
}): Reason {
  const base = makeReasonBase(input.world, input.band, "demography", 0);

  if (input.nomadicScalePressure >= 0.3 || input.maxBandCapBlockingFragmentation) {
    return {
      ...base,
      type: "group_too_large",
      strength: Math.max(input.nomadicScalePressure, input.maxBandCapBlockingFragmentation ? 0.72 : 0),
      confidence: 0.82,
      relatedTileIds: [input.band.position],
      estimatedSize: input.population,
    };
  }

  if (input.foodPerPersonStress >= 0.46) {
    return {
      ...base,
      type: "food_per_person_stress",
      strength: input.foodPerPersonStress,
      confidence: input.band.pressureState?.confidence ?? 0.58,
      relatedTileIds: [input.band.position],
      parentBandId: input.band.id,
      population: input.population,
      stress: input.foodPerPersonStress,
      currentTileId: input.band.position,
    };
  }

  if (input.householdCrowdingPressure >= 0.3) {
    return {
      ...base,
      type: "household_crowding",
      strength: input.householdCrowdingPressure,
      confidence: 0.7,
      relatedTileIds: [input.band.position],
      parentBandId: input.band.id,
      householdCount: input.householdCount,
      comfortableHouseholds: input.comfortableHouseholds,
      pressure: input.householdCrowdingPressure,
    };
  }

  if (input.currentUsePressure >= 0.38) {
    return {
      ...base,
      type: "sustained_local_pressure",
      strength: input.currentUsePressure,
      confidence: input.band.pressureState?.confidence ?? 0.58,
      relatedTileIds: [input.band.position],
      parentBandId: input.band.id,
      currentTileId: input.band.position,
      pressure: input.currentUsePressure,
      useCount: input.band.usePressure[input.band.position]?.useTicks ?? 0,
    };
  }

  return {
    ...base,
    type: "population_growth_pressure",
    strength: clamp01(input.population / Math.max(1, input.comfortablePopulation + 18)),
    confidence: 0.68,
    relatedTileIds: [input.band.position],
    parentBandId: input.band.id,
    population: input.population,
    comfortablePopulation: input.comfortablePopulation,
    pressure: clamp01(input.population / Math.max(1, input.comfortablePopulation + 18)),
    year: input.world.time.year,
    season: input.world.time.season,
  };
}

function getSplitDeferredReason(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly demography: BandDemography;
  readonly viableFrontier: FissionTargetCandidate | undefined;
  readonly mortalityPressure: number;
  readonly crisisBreakawayEligible: boolean;
}): Reason | undefined {
  if (input.demography.population < MINIMUM_SPLIT_POPULATION && !input.crisisBreakawayEligible) {
    return {
      ...makeReasonBase(input.world, input.band, "split-deferred", 0),
      type: "split_deferred_low_population",
      strength: clamp01(1 - input.demography.population / MINIMUM_SPLIT_POPULATION),
      confidence: 0.78,
      relatedTileIds: [input.band.position],
      parentBandId: input.band.id,
      population: input.demography.population,
      minimumPopulation: MINIMUM_SPLIT_POPULATION,
    };
  }

  if (input.demography.splitPressure < SPLIT_PRESSURE_THRESHOLD) {
    return undefined;
  }

  if (input.viableFrontier === undefined) {
    return {
      ...makeReasonBase(input.world, input.band, "split-deferred", 1),
      type: "split_deferred_no_viable_frontier",
      strength: input.demography.splitPressure,
      confidence: 0.68,
      relatedTileIds: [input.band.position],
      parentBandId: input.band.id,
      knownTileCount: Object.keys(input.band.knowledge.observedTiles).length,
      splitPressure: input.demography.splitPressure,
    };
  }

  if (input.mortalityPressure > 0.72 || (input.band.pressureState?.riskPressure ?? 0) > 0.76) {
    return {
      ...makeReasonBase(input.world, input.band, "split-deferred", 2),
      type: "split_deferred_high_risk",
      strength: Math.max(input.mortalityPressure, input.band.pressureState?.riskPressure ?? 0),
      confidence: input.band.pressureState?.confidence ?? 0.58,
      relatedTileIds: [input.band.position, input.viableFrontier.tileId],
      parentBandId: input.band.id,
      riskPressure: input.band.pressureState?.riskPressure ?? 0,
      mortalityPressure: round2(input.mortalityPressure),
      splitPressure: input.demography.splitPressure,
    };
  }

  return undefined;
}

function makeFissionReason(
  world: WorldState,
  parent: Band,
  daughterBandId: BandId,
  target: FissionTargetCandidate,
  daughterPopulation: number,
): Reason {
  const base = makeReasonBase(world, parent, "fission", parent.daughterBandIds.length + 1);
  const parentPopulationAfter = toPopulationCount(parent.demography.population - daughterPopulation);

  if (target.reasonType === "crossing_enabled_split" && target.crossingMemory !== undefined) {
    const crossingKey = makeRiverCrossingKey(
      target.crossingMemory.crossingTileA,
      target.crossingMemory.crossingTileB,
    );

    return {
      ...base,
      type: "crossing_enabled_split",
      strength: parent.demography.splitPressure,
      confidence: target.crossingMemory.successConfidence,
      relatedTileIds: [parent.position, target.tileId],
      parentBandId: parent.id,
      daughterBandId,
      originTileId: parent.position,
      targetTileId: target.tileId,
      riverId: target.crossingMemory.riverId,
      crossingKey,
      knownCrossingConfidence: target.crossingMemory.successConfidence,
    };
  }

  if (target.reasonType === "river_corridor_split") {
    return {
      ...base,
      type: "river_corridor_split",
      strength: parent.demography.splitPressure,
      confidence: 0.7,
      relatedTileIds: [parent.position, target.tileId],
      parentBandId: parent.id,
      daughterBandId,
      originTileId: parent.position,
      targetTileId: target.tileId,
      riverId: getTile(world, target.tileId)?.riverSegmentId,
      corridorValue: target.corridorValue,
    };
  }

  if (target.reasonType === "coastal_split") {
    return {
      ...base,
      type: "coastal_split",
      strength: parent.demography.splitPressure,
      confidence: 0.7,
      relatedTileIds: [parent.position, target.tileId],
      parentBandId: parent.id,
      daughterBandId,
      originTileId: parent.position,
      targetTileId: target.tileId,
      aquaticValue: target.aquaticValue,
    };
  }

  if (parent.demography.splitPressure > SPLIT_PRESSURE_THRESHOLD) {
    return {
      ...base,
      type: "daughter_group_formed",
      strength: parent.demography.splitPressure,
      confidence: 0.74,
      relatedTileIds: [parent.position, target.tileId],
      parentBandId: parent.id,
      daughterBandId,
      parentPopulationBefore: parent.demography.population,
      daughterPopulation,
      parentPopulationAfter,
      originTileId: parent.position,
      targetTileId: target.tileId,
    };
  }

  return {
    ...base,
    type: "frontier_split",
    strength: target.frontierValue,
    confidence: 0.68,
    relatedTileIds: [parent.position, target.tileId],
    parentBandId: parent.id,
    daughterBandId,
    originTileId: parent.position,
    targetTileId: target.tileId,
    frontierValue: target.frontierValue,
  };
}

function inheritKnowledgeState(
  world: WorldState,
  parent: Band,
  daughterBandId: BandId,
  targetTileId: TileId,
): KnowledgeState {
  const inheritedRecords = selectInheritedKnownTileRecords(world, parent, targetTileId);
  const observedTiles: Record<string, KnownTileRecord> = {};
  const tileObservationHistory: TileObservation[] = [];

  for (const record of inheritedRecords) {
    const confidence = round2(record.confidence * 0.58);

    observedTiles[record.tileId] = {
      ...record,
      firstObservedAt: world.time,
      lastObservedAt: world.time,
      visits: 0,
      confidence,
      knowledgeSource: "inherited_memory",
      observedSeasonalPattern:
        record.observedSeasonalPattern === undefined
          ? undefined
          : {
              ...record.observedSeasonalPattern,
              confidence: round2(record.observedSeasonalPattern.confidence * 0.72),
            },
    };
    tileObservationHistory.push({
      tileId: record.tileId,
      observedAt: world.time,
      season: world.time.season,
      observedRichness: record.observedRichness,
      observedAquaticPotential: record.observedAquaticPotential,
      observedRisk: record.observedRisk ?? 0.35,
      observerBandId: daughterBandId,
    });
  }

  for (const physicalRecord of createSpawnPhysicalPerceptionRecords(world, daughterBandId, targetTileId)) {
    observedTiles[physicalRecord.record.tileId] = physicalRecord.record;
    tileObservationHistory.push(physicalRecord.observation);
  }

  return {
    selfBandId: daughterBandId,
    observedTiles: observedTiles as Readonly<Record<TileId, KnownTileRecord>>,
    compressedKnownTileSummaries: [],
    knownAreaSummaries: [],
    knownBands: [createParentBandRecord(world, parent)],
    knownSettlements: [],
    knownRoutes: [],
    placeAttachments: createInheritedPlaceAttachments(parent, targetTileId),
    tileObservationHistory,
    rumors: [],
  };
}

function createSpawnPhysicalPerceptionRecords(
  world: WorldState,
  daughterBandId: BandId,
  targetTileId: TileId,
): readonly {
  readonly record: KnownTileRecord;
  readonly observation: TileObservation;
}[] {
  const targetTile = getTile(world, targetTileId);

  if (targetTile === undefined) {
    return [];
  }

  const visibleTiles = [
    { tile: targetTile, confidence: 1, visits: 1, knowledgeSource: "personally_observed" as const },
    ...getNeighborTiles(world, targetTileId)
      .filter(isBandPassableDestination)
      .sort(compareTiles)
      .map((tile) => ({
        tile,
        confidence: getSpawnNeighborConfidence(targetTile, tile),
        visits: 0,
        knowledgeSource: "physically_seen_on_spawn" as const,
      })),
  ];

  return visibleTiles.map(({ tile, confidence, visits, knowledgeSource }) => {
    const observedRisk = getObservedRisk(tile);

    return {
      record: {
        tileId: tile.id,
        firstObservedAt: world.time,
        lastObservedAt: world.time,
        seasonsObserved: [world.time.season],
        visits,
        observedRichness: getDepletionAdjustedRichness(world, tile),
        observedWaterAccess: tile.resourceProfile.waterAccess,
        observedAquaticPotential: tile.resourceProfile.aquaticPotential,
        observedMovementCost: tile.movementCost,
        observedRisk,
        observedStorageSuitability: tile.resourceProfile.storageSuitability,
        observedSeasonalPattern: {
          peakSeasons: tile.seasonalProfile.peakSeasons,
          leanSeasons: tile.seasonalProfile.leanSeasons,
          reliability: tile.seasonalProfile.reliability,
          confidence,
        },
        confidence,
        knowledgeSource,
      },
      observation: {
        tileId: tile.id,
        observedAt: world.time,
        season: world.time.season,
        observedRichness: getDepletionAdjustedRichness(world, tile),
        observedAquaticPotential: tile.resourceProfile.aquaticPotential,
        observedRisk,
        observerBandId: daughterBandId,
      },
    };
  });
}

function selectInheritedKnownTileRecords(
  world: WorldState,
  parent: Band,
  targetTileId: TileId,
): readonly KnownTileRecord[] {
  const targetTile = getTile(world, targetTileId);
  const currentTile = getTile(world, parent.position);
  const records = Object.values(parent.knowledge.observedTiles)
    .filter((record) => {
      const tile = getTile(world, record.tileId);

      if (tile === undefined || targetTile === undefined) {
        return false;
      }

      const nearParentCore =
        currentTile === undefined ? false : getGridDistance(tile, currentTile) <= 2;
      const strongMemory =
        (parent.placeMemory[record.tileId]?.attachment ?? 0) > 0.42 ||
        parent.placeMemory[record.tileId]?.isReturnPlace === true;

      return record.tileId !== targetTileId && (nearParentCore || strongMemory);
    })
    .sort((left, right) => compareInheritedRecords(world, parent, targetTileId, left, right));

  const inheritedLimit = Math.max(
    6,
    Math.min(14, Math.ceil(Object.keys(parent.knowledge.observedTiles).length * 0.26)),
  );

  return records.slice(0, inheritedLimit);
}

function inheritPlaceMemory(
  parent: Band,
  knowledge: KnowledgeState,
): Readonly<Record<TileId, PlaceMemoryRecord>> {
  const inherited: Record<string, PlaceMemoryRecord> = {};
  const knownTileIds = new Set(Object.keys(knowledge.observedTiles));
  const memories = Object.values(parent.placeMemory)
    .filter((memory) => knownTileIds.has(String(memory.tileId)))
    .sort(compareMemoryForInheritance)
    .slice(0, Math.max(2, Math.min(5, Math.ceil(Object.keys(parent.placeMemory).length * 0.16))));

  for (const memory of memories) {
    inherited[memory.tileId] = {
      ...memory,
      visitCount: memory.isReturnPlace ? 1 : 0,
      attachment: round2(memory.attachment * 0.42),
      confidence: round2(memory.confidence * 0.56),
      repeatedReturnCount: 0,
      isReturnPlace: false,
      reasonIds: memory.reasonIds.slice(-4),
    };
  }

  return inherited as Readonly<Record<TileId, PlaceMemoryRecord>>;
}

function inheritCrossingMemories(
  parent: Band,
  knowledge: KnowledgeState,
): Readonly<Record<string, KnownCrossingMemory>> {
  const inherited: Record<string, KnownCrossingMemory> = {};
  const knownTileIds = new Set(Object.keys(knowledge.observedTiles));

  for (const memory of Object.values(parent.crossingMemories)
    .filter((candidate) =>
      knownTileIds.has(String(candidate.crossingTileA)) ||
      knownTileIds.has(String(candidate.crossingTileB)),
    )
    .sort((left, right) => right.successConfidence - left.successConfidence)
    .slice(0, 2)) {
    inherited[makeRiverCrossingKey(memory.crossingTileA, memory.crossingTileB)] = {
      ...memory,
      useCount: 0,
      successConfidence: round2(memory.successConfidence * 0.58),
      seasonalReliability: round2(memory.seasonalReliability * 0.62),
      riskMemory: round2(memory.riskMemory),
      reasonIds: memory.reasonIds.slice(-4),
    };
  }

  return inherited as Readonly<Record<string, KnownCrossingMemory>>;
}

function inheritTravelCorridors(
  parent: Band,
  knowledge: KnowledgeState,
): Readonly<Record<RouteId, TravelCorridorMemory>> {
  const inherited: Record<string, TravelCorridorMemory> = {};
  const knownTileIds = new Set(Object.keys(knowledge.observedTiles));

  for (const corridor of Object.values(parent.travelCorridors)
    .filter((candidate) =>
      knownTileIds.has(String(candidate.fromTileId)) &&
      knownTileIds.has(String(candidate.toTileId)),
    )
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 2)) {
    inherited[corridor.id] = {
      ...corridor,
      useCount: 0,
      confidence: round2(corridor.confidence * 0.36),
    };
  }

  return inherited as Readonly<Record<RouteId, TravelCorridorMemory>>;
}

function getInheritanceProfile(
  parent: Band,
  knowledge: KnowledgeState,
  memories: Readonly<Record<TileId, PlaceMemoryRecord>>,
  crossings: Readonly<Record<string, KnownCrossingMemory>>,
  corridors: Readonly<Record<RouteId, TravelCorridorMemory>>,
): Band["inheritanceProfile"] {
  const records = Object.values(knowledge.observedTiles);
  const inheritedMemoryRecords = records.filter((record) => record.knowledgeSource === "inherited_memory");
  const inheritedRumorRecords = records.filter((record) => record.knowledgeSource === "inherited_rumor");
  const inheritedRouteHintRecords = records.filter((record) => record.knowledgeSource === "inherited_route_hint");
  const inheritedRecords = [
    ...inheritedMemoryRecords,
    ...inheritedRumorRecords,
    ...inheritedRouteHintRecords,
  ];
  const physicallySeenRecords = records.filter((record) => record.knowledgeSource === "physically_seen_on_spawn");
  const personalRecords = records.filter((record) => record.knowledgeSource === "personally_observed");
  const inheritedConfidenceTotal = inheritedRecords.reduce((total, record) => total + record.confidence, 0);

  return {
    inheritedKnownTileCount: inheritedRecords.length,
    physicallySeenOnSpawnCount: physicallySeenRecords.length,
    inheritedRumorCount: inheritedRumorRecords.length,
    inheritedMemoryCount: Object.keys(memories).length,
    inheritedCrossingCount: Object.keys(crossings).length,
    inheritedCorridorHintCount: Object.keys(corridors).length,
    inheritedRouteHintTileCount: inheritedRouteHintRecords.length,
    personallyObservedTileCount: personalRecords.length,
    inheritedKnowledgeShare: round2(inheritedRecords.length / Math.max(1, Object.keys(parent.knowledge.observedTiles).length)),
    averageInheritedConfidence: round2(inheritedConfidenceTotal / Math.max(1, inheritedRecords.length)),
    parentKnownTileCount: Object.keys(parent.knowledge.observedTiles).length,
    parentMemoryCount: Object.keys(parent.placeMemory).length,
    parentCorridorCount: Object.keys(parent.travelCorridors).length,
  };
}

function createParentBandRecord(world: WorldState, parent: Band): KnownBandRecord {
  return {
    bandId: parent.id,
    firstObservedAt: world.time,
    lastObservedAt: world.time,
    confidence: 1,
    estimatedSize: Math.round(parent.demography.population),
    lastKnownTileId: parent.position,
    contactKind: "direct",
  };
}

function createInheritedPlaceAttachments(
  parent: Band,
  targetTileId: TileId,
): readonly PlaceAttachment[] {
  const inherited = parent.knowledge.placeAttachments
    .filter((attachment) => attachment.tileId === targetTileId)
    .map((attachment) => ({
      ...attachment,
      seasonsKnown: 1,
      practicalWeight: round2(attachment.practicalWeight * 0.74),
      claimStrength: round2(attachment.claimStrength * 0.28),
    }));

  if (inherited.length > 0) {
    return inherited;
  }

  return [{
    tileId: targetTileId,
    seasonsKnown: 1,
    practicalWeight: 0.28,
    ritualOrSymbolicWeight: 0,
    burialOrAncestorWeight: 0,
    claimStrength: 0.04,
  }];
}

function createDaughterDemography(
  time: WorldTime,
  population: number,
  reasonId: ReasonId,
): BandDemography {
  const integerPopulation = toPopulationCount(population);

  return recomputeDemographicCounts({
    population: integerPopulation,
    growthAccumulator: 0,
    mortalityAccumulator: 0,
    lastPopulationChangeReasonIds: [reasonId],
    householdCount: getHouseholdCount(integerPopulation),
    dependents: 0,
    workingAdults: 0,
    elders: 0,
    fertilityPressure: 0.36,
    mortalityPressure: 0.2,
    foodPerPersonStress: 0.2,
    householdCrowdingPressure: 0.06,
    splitPressure: 0.05,
    lastDemographicUpdate: time,
    sourceReasonIds: [reasonId],
  });
}

function recomputeDemographicCounts(demography: BandDemography): BandDemography {
  const population = toPopulationCount(demography.population);
  const dependents = Math.round(population * 0.35);
  const elders = Math.round(population * 0.1);
  const workingAdults = population <= 0 ? 0 : Math.max(1, Math.round(population - dependents - elders));

  return {
    ...demography,
    population,
    growthAccumulator: round4(demography.growthAccumulator ?? 0),
    mortalityAccumulator: round4(demography.mortalityAccumulator ?? 0),
    lastPopulationChangeReasonIds: demography.lastPopulationChangeReasonIds ?? [],
    householdCount: getHouseholdCount(population),
    dependents,
    workingAdults,
    elders,
  };
}

function applyDemographyToSocialPressure(
  socialPressure: SocialPressureProfile,
  demography: BandDemography,
): SocialPressureProfile {
  return {
    ...socialPressure,
    demographicPressure: demography.foodPerPersonStress,
    fissionPressure: demography.splitPressure,
    cohesionStress: clamp01(
      socialPressure.cohesionStress * 0.7 +
        demography.householdCrowdingPressure * 0.24 +
        demography.splitPressure * 0.1,
    ),
  };
}

function getDemographyTraces(
  world: WorldState,
  band: Band,
  computation: DemographyComputation,
): readonly CausalTrace[] {
  const traces: CausalTrace[] = [];
  const previousSplitPressure = band.demography.splitPressure;

  if (computation.demography.splitPressure > previousSplitPressure + 0.06) {
    traces.push({
      id: `trace:${band.id}:${world.time.tick}:split_pressure_increased:${band.position}`,
      tick: world.time.tick,
      time: world.time,
      actorId: band.id,
      kind: "split_pressure_increased",
      sourceTileId: band.position,
      fromValue: previousSplitPressure,
      toValue: computation.demography.splitPressure,
      reasonId: computation.primaryReason.id,
    });
  }

  if (
    computation.deferredReason !== undefined &&
    computation.demography.splitPressure >= SPLIT_PRESSURE_THRESHOLD * 0.7
  ) {
    traces.push({
      id: `trace:${band.id}:${world.time.tick}:split_deferred:${band.position}`,
      tick: world.time.tick,
      time: world.time,
      actorId: band.id,
      kind: "split_deferred",
      sourceTileId: band.position,
      fromValue: computation.demography.splitPressure,
      toValue: computation.demography.population,
      reasonId: computation.deferredReason.id,
    });
  }

  return traces;
}

function makeFissionTrace(
  world: WorldState,
  bandId: BandId,
  originTileId: TileId,
  targetTileId: TileId,
  reasonId: ReasonId,
): CausalTrace {
  return {
    id: `trace:${bandId}:${world.time.tick}:band_fission_created:${targetTileId}`,
    tick: world.time.tick,
    time: world.time,
    actorId: bandId,
    kind: "band_fission_created",
    sourceTileId: originTileId,
    targetTileId,
    fromValue: 0,
    toValue: 1,
    reasonId,
  };
}

function hasFissionCooldownElapsed(time: WorldTime, band: Band, population: number): boolean {
  const latestFission = band.fissionEvents[band.fissionEvents.length - 1];
  const requiredCooldown =
    population >= 300
      ? MEGA_BAND_FISSION_COOLDOWN_TICKS
      : population >= 150
        ? LARGE_BAND_FISSION_COOLDOWN_TICKS
        : FISSION_COOLDOWN_TICKS;

  return latestFission === undefined || time.tick - latestFission.tick >= requiredCooldown;
}

function getComfortablePopulation(
  band: Band,
  currentRecord: KnownTileRecord | undefined,
): number {
  const ecologyCapacity = clamp01(
    (currentRecord?.observedRichness ?? 0.44) * 0.44 +
      (currentRecord?.observedWaterAccess ?? 0.4) * 0.24 +
      (currentRecord?.observedAquaticPotential ?? 0.18) * 0.18 +
      (currentRecord?.observedSeasonalPattern?.reliability ?? 0.48) * 0.14,
  );
  const mobilityCapacity = band.mobilityStrategy === "logistical_foraging"
    ? 6
    : band.mobilityStrategy === "seasonal_round"
      ? 4
      : 0;

  const baseComfort = 34 + ecologyCapacity * 18 + band.storageCapacity * 8 + mobilityCapacity;
  const scalePenalty =
    band.nomadicScalePressure === undefined
      ? 0
      : band.nomadicScalePressure.logisticalInefficiencyPenalty * 18 +
        band.nomadicScalePressure.aggregationStress * 12;

  return Math.round(Math.max(28, baseComfort - scalePenalty));
}

function getDaughterPopulation(parentPopulation: number): number {
  const scaleClass = getNomadicScaleClass(parentPopulation);
  const splitFraction =
    scaleClass === "failure_warning"
      ? 0.16
      : scaleClass === "mega_band"
        ? 0.18
        : scaleClass === "aggregation"
          ? 0.24
          : 0.34;
  const scaleMax =
    scaleClass === "failure_warning" || scaleClass === "mega_band"
      ? DAUGHTER_MAX_POPULATION
      : scaleClass === "aggregation"
        ? 52
        : 30;

  return Math.min(
    scaleMax,
    Math.max(DAUGHTER_MIN_POPULATION, Math.round(parentPopulation * splitFraction)),
  );
}

interface PopulationAccountingResult extends PopulationAccountingState {
  readonly births: number;
  readonly deaths: number;
}

function advancePopulationAccounting(
  previous: BandDemography,
  population: number,
  growthRate: number,
): PopulationAccountingResult {
  const rawDelta = population * growthRate;
  let growthAccumulator = (previous.growthAccumulator ?? 0) + Math.max(0, rawDelta);
  let mortalityAccumulator = (previous.mortalityAccumulator ?? 0) + Math.max(0, -rawDelta);
  const births = Math.floor(growthAccumulator);
  const deaths = Math.floor(mortalityAccumulator);
  growthAccumulator -= births;
  mortalityAccumulator -= deaths;

  return {
    population: toPopulationCount(population + births - deaths),
    growthAccumulator: round4(growthAccumulator),
    mortalityAccumulator: round4(mortalityAccumulator),
    lastPopulationChangeReasonIds: previous.lastPopulationChangeReasonIds ?? [],
    births,
    deaths,
  };
}

// Age-cohort lifecycle transitions (checkpoint 2J). Deterministic accumulator-based
// aging: dependents mature into adults, adults age into elders, elder mortality is
// biased high, and gross births add dependents. Cohorts are reconciled to equal the
// integer population from accounting, so the population trajectory is unchanged and
// fission/extinction integer accounting keeps working.
const DEPENDENT_TO_ADULT_RATE = 0.07;
const ADULT_TO_ELDER_RATE = 0.03;
const ELDER_DEATH_SHARE = 0.5;
const ADULT_DEATH_SHARE = 0.6;
// Intrinsic (replacement) demographic turnover: even a band at stable population
// keeps cycling people — elders die at a baseline rate and are replaced by an
// equal number of births. This is balanced (deaths === births), so it leaves the
// integer population total untouched (net growth/decline still comes only from
// accounting) while letting the age structure settle to a realistic stationary
// distribution instead of crystallizing everyone into the elder cohort.
const ELDER_INTRINSIC_MORTALITY_RATE = 0.12;

interface AgeCohortResult {
  readonly dependents: number;
  readonly workingAdults: number;
  readonly elders: number;
  readonly dependentToAdultAccumulator: number;
  readonly adultToElderAccumulator: number;
  readonly elderMortalityAccumulator: number;
  readonly birthAccumulator: number;
  readonly dependentsMatured: number;
  readonly adultsAged: number;
  readonly eldersDied: number;
  readonly intrinsicElderDeaths: number;
  readonly elderAccountingDeaths: number;
  readonly dependentDeaths: number;
  readonly adultDeaths: number;
  readonly totalDeaths: number;
  readonly birthsAdded: number;
}

interface CohortMortalityStress {
  readonly dependentVulnerability: number;
  readonly adultCrisisPressure: number;
}

function buildCohortReasonIds(
  world: WorldState,
  bandId: string,
  cohorts: AgeCohortResult,
): readonly ReasonId[] {
  const ids: ReasonId[] = [];
  const make = (suffix: string): ReasonId =>
    `reason:${bandId}:${world.time.tick}:cohort:${suffix}` as ReasonId;

  if (cohorts.birthsAdded > 0) {
    ids.push(make("birth_added_dependent"));
  }

  if (cohorts.dependentsMatured > 0) {
    ids.push(make("dependent_aged_to_adult"));
  }

  if (cohorts.adultsAged > 0) {
    ids.push(make("adult_aged_to_elder"));
  }

  if (cohorts.eldersDied > 0) {
    ids.push(make("elder_mortality"));
  }

  if (cohorts.dependentDeaths > 0) {
    ids.push(make("dependent_vulnerability_death"));
  }

  if (cohorts.adultDeaths > 0) {
    ids.push(make("adult_crisis_death"));
  }

  return ids;
}

function advanceAgeCohorts(
  previous: BandDemography,
  births: number,
  deaths: number,
  population: number,
  stress: CohortMortalityStress,
): AgeCohortResult {
  let dependents = Math.max(0, Math.round(previous.dependents ?? Math.round(population * 0.35)));
  let adults = Math.max(0, Math.round(previous.workingAdults ?? Math.round(population * 0.55)));
  let elders = Math.max(0, Math.round(previous.elders ?? Math.round(population * 0.1)));

  // Maturation: dependents -> adults.
  let depToAdult = (previous.dependentToAdultAccumulator ?? 0) + dependents * DEPENDENT_TO_ADULT_RATE;
  const dependentsMatured = Math.min(dependents, Math.floor(depToAdult));
  depToAdult -= dependentsMatured;
  dependents -= dependentsMatured;
  adults += dependentsMatured;

  // Aging: adults -> elders.
  let adultToElder = (previous.adultToElderAccumulator ?? 0) + adults * ADULT_TO_ELDER_RATE;
  const adultsAged = Math.min(adults, Math.floor(adultToElder));
  adultToElder -= adultsAged;
  adults -= adultsAged;
  elders += adultsAged;

  // Births add dependents.
  const grossBirths = Math.max(0, births);
  dependents += grossBirths;

  // Intrinsic replacement turnover: a baseline share of elders dies each year and
  // is replaced by an equal number of births (new dependents). Balanced, so the
  // cohort total is unchanged here and the accounting trajectory is preserved; it
  // only keeps the elder cohort from accumulating without bound.
  let elderMortality = (previous.elderMortalityAccumulator ?? 0) + elders * ELDER_INTRINSIC_MORTALITY_RATE;
  const intrinsicElderDeaths = Math.min(elders, Math.floor(elderMortality));
  elderMortality -= intrinsicElderDeaths;
  elders -= intrinsicElderDeaths;
  dependents += intrinsicElderDeaths;

  // Net accounting deaths biased toward elders, then adults, then dependents.
  let remaining = Math.max(0, deaths);
  const dependentCrisisShare = clamp01(0.08 + stress.dependentVulnerability * 0.5);
  const adultCrisisShare = clamp01(0.1 + stress.adultCrisisPressure * 0.32);
  const dependentDeaths = Math.min(dependents, Math.round(remaining * dependentCrisisShare));
  dependents -= dependentDeaths;
  remaining -= dependentDeaths;
  const elderDeaths = Math.min(elders, Math.round(remaining * (ELDER_DEATH_SHARE - stress.dependentVulnerability * 0.12)));
  elders -= elderDeaths;
  remaining -= elderDeaths;
  const adultDeaths = Math.min(adults, Math.round(remaining * (ADULT_DEATH_SHARE + adultCrisisShare)));
  adults -= adultDeaths;
  remaining -= adultDeaths;
  const remainingDependentDeaths = Math.min(dependents, remaining);
  dependents -= remainingDependentDeaths;
  let totalDependentDeaths = dependentDeaths + remainingDependentDeaths;
  let totalAdultDeaths = adultDeaths;
  let totalElderAccountingDeaths = elderDeaths;
  remaining -= remainingDependentDeaths;

  while (remaining > 0 && dependents + adults + elders > 0) {
    if (elders >= adults && elders >= dependents && elders > 0) {
      elders -= 1;
      totalElderAccountingDeaths += 1;
    } else if (adults >= dependents && adults > 0) {
      adults -= 1;
      totalAdultDeaths += 1;
    } else if (dependents > 0) {
      dependents -= 1;
      totalDependentDeaths += 1;
    } else {
      break;
    }
    remaining -= 1;
  }

  // Reconcile cohorts to the integer population from accounting (buffer = adults),
  // so dependents + adults + elders === population exactly.
  let delta = population - (dependents + adults + elders);
  adults += delta;

  if (adults < 0) {
    let deficit = -adults;
    adults = 0;
    const fromElders = Math.min(elders, deficit);
    elders -= fromElders;
    deficit -= fromElders;
    dependents = Math.max(0, dependents - deficit);
  }

  if (population > 0 && adults < 1) {
    if (dependents > 0) {
      dependents -= 1;
      adults += 1;
    } else if (elders > 0) {
      elders -= 1;
      adults += 1;
    }
  }

  return {
    dependents,
    workingAdults: adults,
    elders,
    dependentToAdultAccumulator: round4(depToAdult),
    adultToElderAccumulator: round4(adultToElder),
    elderMortalityAccumulator: round4(elderMortality),
    birthAccumulator: round4(previous.birthAccumulator ?? 0),
    dependentsMatured,
    adultsAged,
    eldersDied: intrinsicElderDeaths + totalElderAccountingDeaths,
    intrinsicElderDeaths,
    elderAccountingDeaths: totalElderAccountingDeaths,
    dependentDeaths: totalDependentDeaths,
    adultDeaths: totalAdultDeaths,
    totalDeaths: intrinsicElderDeaths + totalElderAccountingDeaths + totalDependentDeaths + totalAdultDeaths,
    birthsAdded: grossBirths + intrinsicElderDeaths,
  };
}

function buildDemographicChurnState(
  previous: DemographicChurnState | undefined,
  year: number,
  previousPopulation: number,
  currentPopulation: number,
  cohorts: AgeCohortResult,
): DemographicChurnState {
  const record: DemographicChurnRecord = {
    year,
    births: cohorts.birthsAdded,
    deaths: cohorts.totalDeaths,
    netPopulationChange: currentPopulation - previousPopulation,
    dependentsMatured: cohorts.dependentsMatured,
    adultsAged: cohorts.adultsAged,
    elderDeaths: cohorts.eldersDied,
    dependentDeaths: cohorts.dependentDeaths,
    adultDeaths: cohorts.adultDeaths,
    crisisDeaths: 0,
    waterStressDeaths: 0,
    starvationDeaths: 0,
    migrationHardshipDeaths: 0,
  };
  const priorRecords = previous?.records ?? [];
  const baseRecords =
    priorRecords.length > 0 && priorRecords[priorRecords.length - 1]?.year === year
      ? priorRecords.slice(0, -1)
      : priorRecords;
  const records = [...baseRecords, record].slice(-10);
  const birthsLast10Years = sum(records.map((entry) => entry.births));
  const deathsLast10Years = sum(records.map((entry) => entry.deaths));
  const netPopulationChangeLast10Years = sum(records.map((entry) => entry.netPopulationChange));
  const yearsSinceLastBirth = record.births > 0 ? 0 : (previous?.yearsSinceLastBirth ?? getYearsSince(records, (entry) => entry.births > 0)) + 1;
  const yearsSinceLastDeath = record.deaths > 0 ? 0 : (previous?.yearsSinceLastDeath ?? getYearsSince(records, (entry) => entry.deaths > 0)) + 1;

  return {
    latestYear: year,
    records,
    birthsThisYear: record.births,
    deathsThisYear: record.deaths,
    birthsLast10Years,
    deathsLast10Years,
    netPopulationChangeLast10Years,
    yearsSinceLastBirth,
    yearsSinceLastDeath,
    dependentsMaturedThisYear: record.dependentsMatured,
    dependentsMaturedLast10Years: sum(records.map((entry) => entry.dependentsMatured)),
    adultsAgedThisYear: record.adultsAged,
    adultsAgedLast10Years: sum(records.map((entry) => entry.adultsAged)),
    elderDeathsThisYear: record.elderDeaths,
    elderDeathsLast10Years: sum(records.map((entry) => entry.elderDeaths)),
    dependentDeathsThisYear: record.dependentDeaths,
    dependentDeathsLast10Years: sum(records.map((entry) => entry.dependentDeaths)),
    adultDeathsThisYear: record.adultDeaths,
    adultDeathsLast10Years: sum(records.map((entry) => entry.adultDeaths)),
    crisisDeathsThisYear: record.crisisDeaths,
    crisisDeathsLast10Years: sum(records.map((entry) => entry.crisisDeaths)),
    waterStressDeathsThisYear: record.waterStressDeaths,
    waterStressDeathsLast10Years: sum(records.map((entry) => entry.waterStressDeaths)),
    starvationDeathsThisYear: record.starvationDeaths,
    starvationDeathsLast10Years: sum(records.map((entry) => entry.starvationDeaths)),
    migrationHardshipDeathsThisYear: record.migrationHardshipDeaths,
    migrationHardshipDeathsLast10Years: sum(records.map((entry) => entry.migrationHardshipDeaths)),
    stablePopulationHidesChurn: Math.abs(netPopulationChangeLast10Years) <= 2 && birthsLast10Years > 0 && deathsLast10Years > 0,
    demographicOutlook: getDemographicOutlook(currentPopulation, netPopulationChangeLast10Years, deathsLast10Years),
  };
}

function withCauseSpecificChurn(
  churn: DemographicChurnState,
  crisisDeaths: number,
  waterStressDeaths: number,
  starvationDeaths: number,
  migrationHardshipDeaths: number,
): DemographicChurnState {
  const latest = churn.records[churn.records.length - 1];

  if (latest === undefined) {
    return churn;
  }

  const patched: DemographicChurnRecord = {
    ...latest,
    crisisDeaths,
    waterStressDeaths,
    starvationDeaths,
    migrationHardshipDeaths,
  };
  const records = [...churn.records.slice(0, -1), patched];

  return {
    ...churn,
    records,
    crisisDeathsThisYear: crisisDeaths,
    crisisDeathsLast10Years: sum(records.map((entry) => entry.crisisDeaths)),
    waterStressDeathsThisYear: waterStressDeaths,
    waterStressDeathsLast10Years: sum(records.map((entry) => entry.waterStressDeaths)),
    starvationDeathsThisYear: starvationDeaths,
    starvationDeathsLast10Years: sum(records.map((entry) => entry.starvationDeaths)),
    migrationHardshipDeathsThisYear: migrationHardshipDeaths,
    migrationHardshipDeathsLast10Years: sum(records.map((entry) => entry.migrationHardshipDeaths)),
  };
}

function deriveNoDeathAudit(
  band: Band,
  churn: DemographicChurnState,
  hungerClassification: SeasonalHungerClassification,
): NoDeathAuditState {
  const noDeathStreakYears = churn.yearsSinceLastDeath;
  const population = Math.max(0, Math.round(band.demography.population));
  const elderShare = population <= 0 ? 0 : band.demography.elders / population;
  const chronicDeficit =
    hungerClassification === "chronic_food_deficit" ||
    hungerClassification === "chronic_water_deficit" ||
    hungerClassification === "chronic_plus_seasonal_stress" ||
    hungerClassification === "crisis_deficit";
  const seasonalHunger =
    hungerClassification === "seasonal_lean_stress" ||
    hungerClassification === "seasonal_water_stress";
  const elderHeavyNoDeaths = noDeathStreakYears >= 25 && elderShare >= 0.16;
  const chronicDeficitNoDeaths = noDeathStreakYears >= 10 && chronicDeficit;
  const seasonalHungerNoDeaths = noDeathStreakYears >= 10 && seasonalHunger && (band.seasonalSupport?.seasonalHungerStreak ?? 0) >= 3;

  if (churn.deathsThisYear > 0) {
    return {
      noDeathStreakYears: 0,
      noDeath25Years: false,
      noDeath50Years: false,
      elderHeavyNoDeaths: false,
      chronicDeficitNoDeaths: false,
      seasonalHungerNoDeaths: false,
      suspicious: false,
      classification: churn.stablePopulationHidesChurn ? "births_deaths_offset_hidden" : "recent_deaths_observed",
      why: churn.stablePopulationHidesChurn
        ? "births and deaths both occurred, so net population hides gross churn"
        : "recent deaths observed in gross churn",
    };
  }

  if (elderHeavyNoDeaths) {
    return makeNoDeathAudit(noDeathStreakYears, true, "suspicious_elder_underdeath", "elder-heavy band has a long no-death streak");
  }

  if (hungerClassification === "crisis_deficit" && noDeathStreakYears >= 8) {
    return makeNoDeathAudit(noDeathStreakYears, true, "suspicious_crisis_underdeath", "crisis support deficit has not produced deaths");
  }

  if (chronicDeficitNoDeaths) {
    return makeNoDeathAudit(noDeathStreakYears, true, "suspicious_chronic_deficit_underdeath", "chronic deficit has a long no-death streak");
  }

  if (seasonalHungerNoDeaths) {
    return makeNoDeathAudit(noDeathStreakYears, true, "suspicious_seasonal_hunger_underdeath", "repeating seasonal hunger has no deaths");
  }

  if (population <= 22 && band.demography.elders === 0) {
    return makeNoDeathAudit(noDeathStreakYears, false, "plausible_small_band_no_elders", "small band has no elders and no recent crisis");
  }

  return makeNoDeathAudit(noDeathStreakYears, false, "plausible_young_healthy_band", "no strong elder, chronic-deficit, or crisis signal");
}

function makeNoDeathAudit(
  noDeathStreakYears: number,
  suspicious: boolean,
  classification: NoDeathAuditState["classification"],
  why: string,
): NoDeathAuditState {
  return {
    noDeathStreakYears,
    noDeath25Years: noDeathStreakYears >= 25,
    noDeath50Years: noDeathStreakYears >= 50,
    elderHeavyNoDeaths: classification === "suspicious_elder_underdeath",
    chronicDeficitNoDeaths: classification === "suspicious_chronic_deficit_underdeath",
    seasonalHungerNoDeaths: classification === "suspicious_seasonal_hunger_underdeath",
    suspicious,
    classification,
    why,
  };
}

function advanceDeathMemory(
  world: WorldState,
  band: Band,
  cohorts: AgeCohortResult,
  seasonalFoodStress: number,
  seasonalWaterStress: number,
): DeathMemoryState | undefined {
  const prior = band.deathMemory;
  const totalDeaths = cohorts.totalDeaths;

  if (totalDeaths <= 0) {
    if (prior === undefined) {
      return undefined;
    }

    const severity = round2(prior.deathMemorySeverity * 0.72);
    if (severity < 0.03) {
      return undefined;
    }

    return {
      ...prior,
      lastUpdatedTick: world.time.tick,
      recentDeathCount: Math.max(0, Math.round(prior.recentDeathCount * 0.55)),
      recentDependentDeaths: Math.max(0, Math.round(prior.recentDependentDeaths * 0.5)),
      recentAdultDeaths: Math.max(0, Math.round(prior.recentAdultDeaths * 0.5)),
      recentElderDeaths: Math.max(0, Math.round(prior.recentElderDeaths * 0.5)),
      deathMemorySeverity: severity,
      cautionModifier: round2(severity * 0.58),
      fertilitySuppressionFromRecentDeaths: round2(severity * 0.42),
      avoidPlacePressure: round2(severity * 0.28),
    };
  }

  const cause = getDominantDeathCause(cohorts, seasonalFoodStress, seasonalWaterStress);
  const severity = clamp01(
    totalDeaths / Math.max(8, band.demography.population) +
      cohorts.dependentDeaths * 0.08 +
      cohorts.adultDeaths * 0.1 +
      seasonalFoodStress * 0.18 +
      seasonalWaterStress * 0.14,
  );

  return {
    lastUpdatedTick: world.time.tick,
    recentDeathCount: Math.min(99, totalDeaths + Math.round((prior?.recentDeathCount ?? 0) * 0.45)),
    recentDependentDeaths: Math.min(99, cohorts.dependentDeaths + Math.round((prior?.recentDependentDeaths ?? 0) * 0.4)),
    recentAdultDeaths: Math.min(99, cohorts.adultDeaths + Math.round((prior?.recentAdultDeaths ?? 0) * 0.4)),
    recentElderDeaths: Math.min(99, cohorts.eldersDied + Math.round((prior?.recentElderDeaths ?? 0) * 0.4)),
    deathMemorySeverity: round2(severity),
    deathMemoryCause: cause,
    cautionModifier: round2(clamp01(severity * 0.62 + cohorts.adultDeaths * 0.04)),
    fertilitySuppressionFromRecentDeaths: round2(clamp01(severity * 0.48 + cohorts.dependentDeaths * 0.03)),
    avoidPlacePressure: round2(clamp01(severity * 0.3 + (cause === "water_stress" || cause === "migration_hardship" ? 0.12 : 0))),
    placeTileId: band.position,
    reasonIds: [`reason:death-memory:${band.id}:${world.time.tick}:${cause}` as ReasonId],
  };
}

function getDominantDeathCause(
  cohorts: AgeCohortResult,
  seasonalFoodStress: number,
  seasonalWaterStress: number,
): DeathCauseKind {
  if (seasonalWaterStress >= 0.58 && cohorts.totalDeaths > cohorts.intrinsicElderDeaths) {
    return "water_stress";
  }

  if (seasonalFoodStress >= 0.5 && cohorts.totalDeaths > cohorts.intrinsicElderDeaths) {
    return "starvation_sustained_food_deficit";
  }

  if (cohorts.adultDeaths > 0) {
    return "adult_crisis";
  }

  if (cohorts.dependentDeaths > 0) {
    return "dependent_vulnerability";
  }

  if (cohorts.eldersDied > 0) {
    return "elder_senescence";
  }

  return "unknown_other";
}

function getCrisisDeaths(
  cohorts: AgeCohortResult,
  seasonalFoodStress: number,
  seasonalWaterStress: number,
  chronicSeasonalDeficit: number,
): number {
  if (Math.max(seasonalFoodStress, seasonalWaterStress, chronicSeasonalDeficit) < 0.48) {
    return 0;
  }

  return Math.min(cohorts.totalDeaths, cohorts.dependentDeaths + cohorts.adultDeaths + cohorts.elderAccountingDeaths);
}

function getWaterStressDeaths(cohorts: AgeCohortResult, seasonalWaterStress: number): number {
  if (seasonalWaterStress < 0.56) {
    return 0;
  }

  return Math.min(cohorts.totalDeaths, Math.max(0, cohorts.totalDeaths - cohorts.intrinsicElderDeaths));
}

function getStarvationDeaths(
  cohorts: AgeCohortResult,
  seasonalFoodStress: number,
  chronicSeasonalDeficit: number,
): number {
  if (Math.max(seasonalFoodStress, chronicSeasonalDeficit) < 0.5) {
    return 0;
  }

  return Math.min(cohorts.totalDeaths, Math.max(0, cohorts.totalDeaths - cohorts.intrinsicElderDeaths));
}

function getDemographicOutlook(
  currentPopulation: number,
  netPopulationChangeLast10Years: number,
  deathsLast10Years: number,
): string {
  if (currentPopulation <= 0) {
    return "collapsed";
  }

  if (netPopulationChangeLast10Years < -4) {
    return "declining";
  }

  if (netPopulationChangeLast10Years > 4) {
    return "growing";
  }

  if (deathsLast10Years > 0) {
    return "stable with visible churn";
  }

  return "stable with little observed churn";
}

function getYearsSince(
  records: readonly DemographicChurnRecord[],
  predicate: (record: DemographicChurnRecord) => boolean,
): number {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (predicate(records[index])) {
      return records.length - 1 - index;
    }
  }

  return records.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toPopulationCount(value: number): number {
  return Math.max(0, Math.round(value));
}

function getHouseholdCount(population: number): number {
  return population <= 0 ? 0 : Math.max(1, Math.round(population / 5));
}

function isViableDaughterTile(tile: Tile, record: KnownTileRecord): boolean {
  if (tile.isAquatic || tile.terrainKind === "mountains" || tile.movementCost > 2.45) {
    return false;
  }

  return (
    record.observedRichness >= 0.28 ||
    (record.observedWaterAccess ?? 0) >= 0.42 ||
    record.observedAquaticPotential >= 0.32
  );
}

function getKnownFrontierValue(world: WorldState, band: Band, tile: Tile): number {
  const unknownNeighbors = tile.neighbors.filter(
    (neighborId) => band.knowledge.observedTiles[neighborId] === undefined,
  ).length;
  const knownNeighbors = tile.neighbors.length - unknownNeighbors;

  return clamp01(
    unknownNeighbors / Math.max(1, tile.neighbors.length) * 0.72 +
      (knownNeighbors > 0 ? 0.1 : 0) +
      (hasKnownPassOrCorridorContext(world, band, tile) ? 0.18 : 0),
  );
}

function hasKnownPassOrCorridorContext(world: WorldState, band: Band, tile: Tile): boolean {
  if (tile.isRiverbank || tile.isCoastal || tile.isFloodplain) {
    return true;
  }

  return Object.values(band.travelCorridors).some((corridor) => {
    const from = world.tiles[corridor.fromTileId];
    const to = world.tiles[corridor.toTileId];

    return (
      corridor.confidence > 0.36 &&
      ((from !== undefined && getGridDistance(from, tile) <= 1) ||
        (to !== undefined && getGridDistance(to, tile) <= 1))
    );
  });
}

function getReturnPlaceStrain(band: Band): number {
  const strained = Object.values(band.placeMemory).filter(
    (memory) =>
      memory.isReturnPlace &&
      (memory.valences.includes("depleted") || memory.valences.includes("avoid_place")),
  ).length;

  return clamp01(strained / 4);
}

function getHydroBarrierPenalty(
  world: WorldState,
  band: Band,
  originTileId: TileId,
  targetTileId: TileId,
): number {
  const crossing = getRiverCrossingForMovement(world, originTileId, targetTileId);

  if (crossing !== undefined) {
    const memory = band.crossingMemories[makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId)];

    if (memory !== undefined && memory.successConfidence > 0.45) {
      return clamp01(crossing.risk * 0.18);
    }

    if (
      crossing.crossingClass === "impassable_without_bridge_or_ferry" ||
      crossing.crossingClass === "impassable_without_watercraft"
    ) {
      return 0.9;
    }

    return clamp01(crossing.risk * 0.56 + crossing.baseCrossingCost / 5);
  }

  const targetHasCrossingMemory = getBestCrossingMemory(band, targetTileId);

  return targetHasCrossingMemory === undefined ? 0 : clamp01(targetHasCrossingMemory.riskMemory * 0.18);
}

function getBestCorridorMemory(
  band: Band,
  tileId: TileId,
): TravelCorridorMemory | undefined {
  return Object.values(band.travelCorridors)
    .filter((corridor) => corridor.fromTileId === tileId || corridor.toTileId === tileId)
    .sort((left, right) =>
      right.confidence === left.confidence
        ? String(left.id).localeCompare(String(right.id))
        : right.confidence - left.confidence,
    )[0];
}

function getBestCrossingMemory(
  band: Band,
  tileId: TileId,
): KnownCrossingMemory | undefined {
  return Object.values(band.crossingMemories)
    .filter((memory) => memory.crossingTileA === tileId || memory.crossingTileB === tileId)
    .sort((left, right) =>
      right.successConfidence === left.successConfidence
        ? makeRiverCrossingKey(left.crossingTileA, left.crossingTileB)
          .localeCompare(makeRiverCrossingKey(right.crossingTileA, right.crossingTileB))
        : right.successConfidence - left.successConfidence,
    )[0];
}

function getFissionReasonType(
  tile: Tile,
  crossingMemory: KnownCrossingMemory | undefined,
  corridorValue: number,
  aquaticValue: number,
): FissionTargetCandidate["reasonType"] {
  if (crossingMemory !== undefined && crossingMemory.successConfidence > 0.42) {
    return "crossing_enabled_split";
  }

  if (tile.isCoastal || tile.isEstuary || aquaticValue > 0.52) {
    return "coastal_split";
  }

  if (tile.isRiverbank || tile.isFloodplain || corridorValue > 0.34) {
    return "river_corridor_split";
  }

  return "frontier_split";
}

function getKnownFoodEstimate(record: KnownTileRecord): number {
  return clamp01(
    record.observedRichness * 0.56 +
      record.observedAquaticPotential * 0.16 +
      (record.observedStorageSuitability ?? 0.2) * 0.08 +
      (record.observedSeasonalPattern?.reliability ?? 0.48) * 0.2,
  );
}

function getObservedRisk(tile: Tile): number {
  return clamp01(
    tile.riskProfile.floodRisk * 0.34 +
      tile.riskProfile.droughtRisk * 0.34 +
      tile.riskProfile.diseaseRisk * 0.32,
  );
}

function getSpawnNeighborConfidence(origin: Tile, neighbor: Tile): number {
  const crossing = origin.isRiver || neighbor.isRiver || origin.riverSegmentId === neighbor.riverSegmentId;
  const openVisibility = origin.elevation > 0.42 || neighbor.elevation > 0.42 || origin.isCoastal || neighbor.isCoastal;

  return round2(clamp01(0.28 + (openVisibility ? 0.12 : 0) + (crossing ? 0.04 : 0)));
}

function makeReasonBase(
  world: WorldState,
  band: Band,
  group: string,
  index: number,
): {
  readonly id: ReasonId;
  readonly strength: number;
  readonly confidence: number;
  readonly relatedTileIds: readonly TileId[];
  readonly relatedEventIds: readonly never[];
} {
  return {
    id: `reason:demography:${band.id}:${world.time.tick}:${group}:${index}` as ReasonId,
    strength: 0,
    confidence: 0,
    relatedTileIds: [],
    relatedEventIds: [],
  };
}

function makeDaughterBandId(parentBandId: BandId, index: number, tick: number): BandId {
  return `${parentBandId}:daughter:${index}:t${tick}` as BandId;
}

function makeFissionEventId(
  parentBandId: BandId,
  daughterBandId: BandId,
  tick: number,
): EventId {
  return `event:fission:${parentBandId}:${daughterBandId}:${tick}` as EventId;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function compareFissionTargets(
  left: FissionTargetCandidate,
  right: FissionTargetCandidate,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return String(left.tileId).localeCompare(String(right.tileId));
}

function compareInheritedRecords(
  world: WorldState,
  parent: Band,
  targetTileId: TileId,
  left: KnownTileRecord,
  right: KnownTileRecord,
): number {
  const leftScore = getInheritanceScore(world, parent, targetTileId, left);
  const rightScore = getInheritanceScore(world, parent, targetTileId, right);

  return rightScore === leftScore
    ? String(left.tileId).localeCompare(String(right.tileId))
    : rightScore - leftScore;
}

function getInheritanceScore(
  world: WorldState,
  parent: Band,
  targetTileId: TileId,
  record: KnownTileRecord,
): number {
  const targetTile = getTile(world, targetTileId);
  const tile = getTile(world, record.tileId);
  const distanceValue =
    targetTile === undefined || tile === undefined
      ? 0
      : clamp01(1 - getGridDistance(targetTile, tile) / 8);
  const memory = parent.placeMemory[record.tileId];

  return (
    distanceValue * 0.42 +
    record.confidence * 0.28 +
    (memory?.attachment ?? 0) * 0.18 +
    (memory?.isReturnPlace === true ? 0.12 : 0)
  );
}

function compareMemoryForInheritance(
  left: PlaceMemoryRecord,
  right: PlaceMemoryRecord,
): number {
  const leftScore = left.attachment + left.visitCount * 0.04 + (left.isReturnPlace ? 0.18 : 0);
  const rightScore = right.attachment + right.visitCount * 0.04 + (right.isReturnPlace ? 0.18 : 0);

  return rightScore === leftScore
    ? String(left.tileId).localeCompare(String(right.tileId))
    : rightScore - leftScore;
}

function compareTiles(left: Tile, right: Tile): number {
  if (left.coord.y !== right.coord.y) {
    return left.coord.y - right.coord.y;
  }

  if (left.coord.x !== right.coord.x) {
    return left.coord.x - right.coord.x;
  }

  return String(left.id).localeCompare(String(right.id));
}

function getWorldPopulation(world: WorldState): number {
  return Object.values(world.bands).reduce(
    (total, band) => total + toPopulationCount(band.demography.population),
    0,
  );
}

function getDirectionBetweenTileIds(
  world: WorldState,
  fromTileId: TileId,
  toTileId: TileId,
): Coord | undefined {
  const fromTile = getTile(world, fromTileId);
  const toTile = getTile(world, toTileId);

  if (fromTile === undefined || toTile === undefined) {
    return undefined;
  }

  return normalizeVector({
    x: toTile.coord.x - fromTile.coord.x,
    y: toTile.coord.y - fromTile.coord.y,
  });
}

function getGridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function normalizeVector(vector: Coord): Coord | undefined {
  const magnitude = Math.hypot(vector.x, vector.y);

  if (magnitude <= 0.0001) {
    return undefined;
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

// RANGE-2: colours of currently-active bands, so a new daughter colour can be pushed clear of
// them (display-only — band.color affects no decision, fingerprint, or baseline).
function activeBandColors(world: WorldState): readonly string[] {
  return Object.values(world.bands)
    .filter((band) => band.viability?.status !== "absorbed" && band.viability?.status !== "extinct")
    .map((band) => band.color);
}

function addUnique<TValue>(
  values: readonly TValue[],
  ...nextValues: readonly TValue[]
): readonly TValue[] {
  const merged = [...values];

  for (const value of nextValues) {
    if (!merged.includes(value)) {
      merged.push(value);
    }
  }

  return merged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function getPopulationScalePressure(population: number): number {
  return clamp01(
    Math.max(0, population - 80) / 280 * 0.42 +
      Math.max(0, population - 150) / 450 * 0.28 +
      Math.max(0, population - 300) / 700 * 0.3,
  );
}

function getPopulationLogisticalPressure(population: number): number {
  return clamp01(
    Math.max(0, population - 80) / 260 * 0.12 +
      Math.max(0, population - 150) / 420 * 0.14 +
      Math.max(0, population - 300) / 700 * 0.18,
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
