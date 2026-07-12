import type {
  ActivityMemoryConfidenceChannel,
  ActivityMemoryConfidenceSnapshot,
  ActivityMemoryEffectCount,
  ActivityMemoryEffectRecord,
  ActivityMemoryEffectType,
  ActivityMemoryUpdateSummary,
  AnimalActivityTrace,
  ActivityGroupLaborRecord,
  ActivityGroupLaborStatus,
  ActivityLaborSummary,
  ActivityOutcomeSummary,
  ActivityOutcomeTaskTypeCount,
  ActivityOutcomeTypeCount,
  ActivityResourceReturnRecord,
  ActivityReturnResourceKind,
  ActivityReturnResourceKindCount,
  ActivityShadowReturnKind,
  ActivityShadowReturnKindContribution,
  ActivityShadowReturnRecord,
  ActivityShadowSubsistenceSummary,
  ActivityShadowTaskTypeContribution,
  ActivityTypeLaborAllocation,
  AquaticActivityTrace,
  Band,
  IntraSeasonTripCause,
  IntraSeasonTripActivityResult,
  IntraSeasonTripMovementType,
  IntraSeasonTripObjective,
  IntraSeasonTripOutcome,
  IntraSeasonTripRecord,
  IntraSeasonTripTaskGroupType,
  PlantPatchActivityTrace,
  PhysicalFoodHarvestRecord,
} from "./types";
import type { DailyAction } from "./dailyActions";
import { deriveBaseHabitatPotential } from "./habitatYield";
import {
  applyFaunaTripDepletion,
  deriveFaunaStockGeography,
  deriveFaunaTripStockTrace,
  deriveFaunaTripReturnFactor,
  resolveFaunaFoodHarvest,
  type FaunaTripStockTraceBase,
  type FaunaClass,
  type FaunaHabitatType,
  type FaunaStockGeography,
  type FaunaStockKind,
} from "./faunaStock";
import { derivePlantGatherPatchTrace, derivePlantGatherReturnFactor, resolvePlantFoodHarvest, type PlantGatherPatchTraceBase } from "./plantStock";
import { deriveResourceClassAvailability } from "./resourceClasses";
import { deriveHuntingSafetyRelief } from "./practicalResponses";
import {
  classifyActivityReturnKind,
  getActivityReturnSemantics,
  isPhysicalFoodReturnKind,
  isPhysicalMaterialReturnKind,
} from "./physicalFoodReturn";
import { effectiveResourceConfidence, updateResourceKnowledgeFromObservation } from "./resourceKnowledge";
import {
  deriveSeasonalEcologyFactor,
  shadowSeasonalModifier,
  taskGroupTypeToEcologyDomain,
  updateSeasonalEcologyMemory,
} from "./seasonalResourceEcology";
// 2K.12: selection-only seasonal-memory reader (band-learned only; no hidden truth).
import { domainForResourceClass, readSeasonalEcologyHint } from "./seasonalEcologyReader";
import type {
  ResourceConfidenceProfile,
  ResourceKnowledgeState,
  ResourcePatchContradictionKind,
  ResourcePatchLearningMemory,
  ResourcePatchLearningOutcome,
  ResourcePatchMemory,
  ResourceKnowledgeStateKind,
  ResourceUseHistory,
} from "./resourceKnowledge";
import type { ResourceClassId } from "./resourceClasses";
import type { BandId, DayNumber, ReasonId, ResourcePatchId, TickNumber, TileId } from "../core/types";
import { SEASON_LENGTH_DAYS } from "../core/types";
import { getWorldTimeForDay } from "../tick/time";
import { isBandPassableDestination } from "../world/passability";
import type { Tile, WorldState } from "../world/types";

const TRIP_DAY_CADENCE = 3;
const FIRST_TRIP_DAY_OF_SEASON = 6;
const MAX_TRIP_DISTANCE_TILES = 10;
const SAME_DAY_ROUND_TRIP_TILE_BUDGET = 8;
const RECENT_TRIP_RECORD_CAP = 24;
const RECENT_ACTIVITY_GROUP_SUMMARY_CAP = 8;
const STARTING_LOCAL_RECON_MAX_DISTANCE_TILES = 2;
const STARTING_LOCAL_RECON_OBSERVED_TILE_CAP = 6;
const LOW_MEMORY_CONFIDENCE_THRESHOLD = 0.25;
const PARTIAL_RETURN_CONFIDENCE_THRESHOLD = 0.58;
const OBSERVATION_CONFIDENCE_THRESHOLD = 0.42;
const RECENT_ACTIVITY_MEMORY_EFFECT_CAP = 8;

interface TripCandidate {
  readonly memory: ResourcePatchMemory;
  readonly targetTileId: TileId;
  readonly distanceTiles: number;
  readonly cause: IntraSeasonTripCause;
  readonly score: number;
  readonly riskToleranceModifier: number;
  readonly fallbackExpansionBias: number;
  readonly tripAbandonmentPenalty: number;
  readonly nearbyProbeBonus: number;
  readonly logisticsSelectionBias: number;
  readonly seededResourceKnowledgeState?: ResourceKnowledgeState;
}

interface ActivityOutcomeDetail {
  readonly activityOutcome: IntraSeasonTripActivityResult;
  readonly activityOutcomeReasonIds: readonly ReasonId[];
  readonly activityOutcomeSummary: string;
  readonly resourceReturn: ActivityResourceReturnRecord;
}

export interface ActivityMemoryApplication {
  readonly resourceKnowledgeState: ResourceKnowledgeState | undefined;
  readonly effect: ActivityMemoryEffectRecord;
}

/**
 * TIME-1C: the task-group trip ledger exposed as a registered {@link DailyAction}.
 * It samples regular daily activity at a bounded cadence, recording
 * non-relocating task-group trips with explicit source/type/objective metadata.
 * `apply` records breadcrumbs/outcomes but NEVER moves `band.position`.
 * This is the first member of the daily-action registry; the time system runs it
 * identically under daily/weekly/monthly/seasonal step modes.
 */
export const intraSeasonTripDailyAction: DailyAction = {
  id: "intra-season-trips",
  firesOnDayOfSeason(dayOfSeason: number): boolean {
    return dayOfSeason >= FIRST_TRIP_DAY_OF_SEASON && dayOfSeason < SEASON_LENGTH_DAYS && dayOfSeason % TRIP_DAY_CADENCE === 0;
  },
  apply(world: WorldState, day: number): WorldState {
    return applyTripDay(world, day);
  },
};

/** The default daily-action registry advanced by `advanceWorldByDays`. */
export const DEFAULT_DAILY_ACTIONS: readonly DailyAction[] = [intraSeasonTripDailyAction];

function applyTripDay(world: WorldState, day: number): WorldState {
  const time = getWorldTimeForDay(day as DayNumber);
  const bandsById: Record<string, Band> = { ...world.bands };
  // FAUNA/AQUATIC-1 — fauna geography is static (memoized by tiles); the dynamic
  // stock state is threaded through the day so each successful hunting/fishing
  // trip depletes the targeted stock and LATER bands the same day see the lower
  // abundance in their return factor (shared-catchment competition, deterministic
  // sorted band order).
  const faunaGeo = deriveFaunaStockGeography(world);
  let currentWorld = world;
  let changed = false;

  for (const band of Object.values(world.bands).sort(compareBands)) {
    if (!isActiveBand(band)) {
      continue;
    }

    const candidate = selectTripCandidate(currentWorld, band, day);

    if (candidate === undefined) {
      continue;
    }

    const activityBand =
      candidate.seededResourceKnowledgeState === undefined
        ? band
        : {
            ...band,
            resourceKnowledgeState: candidate.seededResourceKnowledgeState,
          };
    const initialRecord = buildTripRecord(currentWorld, activityBand, candidate, time.day ?? (day as DayNumber), time.tick, time.season, faunaGeo);
    const physicalResolution = resolvePhysicalFoodHarvest(currentWorld, initialRecord, time, faunaGeo);
    currentWorld = physicalResolution.world;
    const resolvedRecord = physicalResolution.record;
    const memoryApplication = applyActivityOutcomeToMemoryForWorld(currentWorld, activityBand, resolvedRecord, candidate.memory);
    const record: IntraSeasonTripRecord = {
      ...resolvedRecord,
      activityMemoryEffect: memoryApplication.effect,
      reasonIds: [...resolvedRecord.reasonIds, ...memoryApplication.effect.reasonIds],
    };
    const recentIntraSeasonTrips = [record, ...(band.recentIntraSeasonTrips ?? [])].slice(0, RECENT_TRIP_RECORD_CAP);
    const activityLaborSummary = buildActivityLaborSummary(activityBand, record, recentIntraSeasonTrips);
    // ECO-SEASON-1: learn the realized seasonal ecology into the band's SEPARATE seasonal
    // memory (never read by the economy). Only tiles the band actually visited get learned.
    const seasonalEcologyMemory =
      record.seasonalEcology === undefined || record.seasonalEcology.taughtSeasonalHint !== true
        ? band.seasonalEcologyMemory
        : updateSeasonalEcologyMemory(band.seasonalEcologyMemory, record.targetTileId, record.seasonalEcology, time.tick);
    bandsById[band.id] = {
      ...band,
      resourceKnowledgeState: memoryApplication.resourceKnowledgeState,
      lastIntraSeasonTrip: record,
      recentIntraSeasonTrips,
      seasonalEcologyMemory,
      activityLaborSummary,
      activityOutcomeSummary: buildActivityOutcomeSummary(activityBand, record, recentIntraSeasonTrips),
      activityShadowSubsistenceSummary: buildActivityShadowSubsistenceSummary(
        activityBand,
        record,
        recentIntraSeasonTrips,
        activityLaborSummary,
      ),
      activityMemoryUpdateSummary: buildActivityMemoryUpdateSummary(activityBand, record, recentIntraSeasonTrips),
    };
    changed = true;

  }

  return changed
    ? {
        ...currentWorld,
        bands: bandsById as Readonly<Record<BandId, Band>>,
      }
    : world;
}

function resolvePhysicalFoodHarvest(
  world: WorldState,
  record: IntraSeasonTripRecord,
  time: ReturnType<typeof getWorldTimeForDay>,
  faunaGeo: FaunaStockGeography,
): { readonly world: WorldState; readonly record: IntraSeasonTripRecord } {
  const faunaClass = faunaClassForTrip(record.taskGroupType, record.resourceClassId);
  const plantTrip = faunaClass === undefined && isPlantGatherTrip(record.taskGroupType, record.resourceClassId);
  if (faunaClass === undefined && !plantTrip) {
    return { world, record };
  }

  const attempted = true;
  const standTileId = record.pathTiles[record.pathTiles.length - 1];
  const targetTile = world.tiles[record.targetTileId];
  const routeReached = standTileId === record.targetTileId ||
    (targetTile?.isAquatic === true && world.tiles[standTileId]?.neighbors.includes(record.targetTileId) === true);
  const activityEligible = routeReached && isPhysicalFoodReturnKind(record.resourceReturn.returnedResourceKind) &&
    record.resourceReturn.estimatedReturnValue > 0;
  const requestedAmount = record.resourceReturn.estimatedReturnValue;
  const transportLossRate = Math.min(0.25, record.roundTripTiles * 0.012);
  const knownness: PhysicalFoodHarvestRecord["knownness"] = record.resourceReturn.returnConfidence >= 0.42
    ? "known_target"
    : "stale_or_inferred_target";

  const resolution = faunaClass === undefined
    ? (() => {
        const tile = world.tiles[record.targetTileId];
        return tile === undefined
          ? {
              world,
              sourceFound: false,
              physicalAvailability: 0,
              harvestedAmount: 0,
              depletionApplied: 0,
              processingLossRate: 0,
              failureReason: "physical_source_absent" as const,
            }
          : resolvePlantFoodHarvest(world, tile, time, requestedAmount, activityEligible);
      })()
    : resolveFaunaFoodHarvest(
        world,
        faunaGeo,
        record.targetTileId,
        faunaClass,
        record.season,
        record.tick,
        requestedAmount,
        activityEligible,
      );
  const transportLoss = resolution.harvestedAmount * transportLossRate;
  const processingLoss = Math.max(0, resolution.harvestedAmount - transportLoss) * resolution.processingLossRate;
  const usableSupport = round4(Math.max(0, resolution.harvestedAmount - transportLoss - processingLoss));
  const sourceKind: PhysicalFoodHarvestRecord["sourceKind"] = faunaClass === "animal_food"
    ? "fauna_stock"
    : faunaClass === "aquatic_food"
      ? "aquatic_stock"
      : "plant_patch";
  const sourceId = resolution.sourceId;
  const sourceClass = String(resolution.sourceClass ?? record.resourceClassId ?? faunaClass ?? "generic_plant_food");
  const physicalFoodHarvest: PhysicalFoodHarvestRecord = {
    sourceKind,
    ...(sourceId === undefined ? {} : { sourceId: String(sourceId) }),
    sourceClass,
    knownness,
    attempted,
    physicalSourceFound: resolution.sourceFound,
    physicalAvailability: round4(resolution.physicalAvailability),
    harvestedAmount: round4(resolution.harvestedAmount),
    depletionApplied: round4(resolution.depletionApplied),
    transportLoss: round4(transportLoss),
    processingLoss: round4(processingLoss),
    usableSupport,
    ...(resolution.failureReason === undefined ? {} : { failureReason: resolution.failureReason }),
    worldTruthDebugOnly: true,
    reasonIds: [`reason:physical-food-harvest:${record.sourceBandId}:${record.day}:${sourceKind}:${sourceId ?? "absent"}` as ReasonId],
  };
  const physicalFailure = resolution.failureReason === "physical_source_absent" || resolution.failureReason === "physically_exhausted";
  const activityOutcome = !routeReached
    ? "failed_due_to_distance"
    : physicalFailure && isSuccessfulFaunaOutcome(record.activityOutcome)
      ? "target_not_found"
      : record.activityOutcome;
  const returnedResourceKind = usableSupport > 0 ? record.resourceReturn.returnedResourceKind : "none";
  const resourceReturn: ActivityResourceReturnRecord = {
    ...record.resourceReturn,
    returnedResourceKind,
    semantics: getActivityReturnSemantics(returnedResourceKind),
    estimatedReturnValue: usableSupport,
    consumedByEconomy: usableSupport > 0,
    noCarryingCapacityCoupling: false,
    noSupportChange: false,
    reasonIds: [...record.resourceReturn.reasonIds, ...physicalFoodHarvest.reasonIds],
  };

  return {
    world: resolution.world,
    record: {
      ...record,
      activityResult: activityOutcome,
      activityOutcome,
      activityOutcomeSummary: summarizeActivityOutcome(activityOutcome, returnedResourceKind),
      resultSummary: summarizeActivityOutcome(activityOutcome, returnedResourceKind),
      resourceReturn,
      physicalFoodHarvest,
      ...(record.plantPatchTrace === undefined
        ? {}
        : { plantPatchTrace: { ...record.plantPatchTrace, depletionApplied: resolution.depletionApplied > 0 } }),
      ...(record.animalActivityTrace === undefined
        ? {}
        : {
            animalActivityTrace: {
              ...record.animalActivityTrace,
              activityOutcome,
              actualReturnValue: usableSupport,
              depletionApplied: resolution.depletionApplied > 0,
              pressureApplied: resolution.depletionApplied > 0
                ? estimateFaunaTripPressureIntensity(record.estimatedPeopleCount, usableSupport)
                : 0,
            },
          }),
      ...(record.aquaticActivityTrace === undefined
        ? {}
        : { aquaticActivityTrace: { ...record.aquaticActivityTrace, activityOutcome, depletionApplied: resolution.depletionApplied > 0 } }),
      reasonIds: [...record.reasonIds, ...physicalFoodHarvest.reasonIds],
      noSupportChange: false,
    },
  };
}

// Maps a trip's task group / resource class to the finite fauna stock class it
// draws on, or undefined for non-fauna trips (plants / water / route / info).
function faunaClassForTrip(
  taskGroupType: IntraSeasonTripTaskGroupType,
  resourceClassId: ResourceClassId | undefined,
): FaunaClass | undefined {
  if (taskGroupType === "hunting_group" || resourceClassId === "animal_food") {
    return "animal_food";
  }

  if (taskGroupType === "fishing_group" || resourceClassId === "aquatic_food") {
    return "aquatic_food";
  }

  return undefined;
}

function isSuccessfulFaunaOutcome(outcome: IntraSeasonTripActivityResult): boolean {
  return outcome === "partial_success" || outcome === "target_found";
}

// A plant-gathering trip (not fauna, not water/route/info) that draws on finite
// plant patches and can overharvest them.
function isPlantGatherTrip(
  taskGroupType: IntraSeasonTripTaskGroupType,
  resourceClassId: ResourceClassId | undefined,
): boolean {
  if (taskGroupType === "hunting_group" || taskGroupType === "fishing_group" || taskGroupType === "water_group" || taskGroupType === "memory_refresh_group") {
    return false;
  }

  if (resourceClassId === "fiber_material" || resourceClassId === "fuel_material") {
    return false;
  }

  return (
    taskGroupType === "plant_gathering_group" ||
    taskGroupType === "local_foraging_group" ||
    taskGroupType === "plant_followup_group" ||
    resourceClassId === "generic_plant_food" ||
    resourceClassId === "fallback_food"
  );
}

function selectTripCandidate(world: WorldState, band: Band, day: number): TripCandidate | undefined {
  const seededResourceKnowledgeState =
    (band.resourceKnowledgeState?.patchMemories.length ?? 0) === 0
      ? buildStartingLocalReconnaissanceState(world, band, day)
      : undefined;
  const resourceKnowledgeState = seededResourceKnowledgeState ?? band.resourceKnowledgeState;
  const memories = resourceKnowledgeState?.patchMemories ?? [];
  const origin = world.tiles[band.position];

  if (origin === undefined || memories.length === 0) {
    return undefined;
  }

  const currentTick = Number(world.time.tick);
  const adaptationBehavior = band.foragingAdaptation?.behavior;
  let best: TripCandidate | undefined;

  for (const memory of memories) {
    if (memory.approximateTile === band.position) {
      continue;
    }

    const target = world.tiles[memory.approximateTile];

    if (target === undefined) {
      continue;
    }

    const distanceTiles = getGridDistance(origin, target);

    if (distanceTiles <= 0 || distanceTiles > MAX_TRIP_DISTANCE_TILES) {
      continue;
    }

    const cause = getTripCause(band, memory, currentTick);

    if (cause === undefined) {
      continue;
    }

    if (wasRecentlyVisited(band, memory.approximateTile, day, getRepeatTargetSuppressionDays(cause))) {
      continue;
    }

    const effective = effectiveResourceConfidence(memory, currentTick);
    const causeWeight = getCauseWeight(cause);
    const distancePenalty = distanceTiles / MAX_TRIP_DISTANCE_TILES;
    const confidence = effective.effectivePresenceConfidence;
    const fallbackExpansionBias = getAdaptationFallbackSelectionBias(band, memory.resourceClassId);
    const tripAbandonmentPenalty = getAdaptationTripAbandonmentPenalty(band, memory.approximateTile, memory.resourceClassId);
    const nearbyProbeBonus = getAdaptationNearbyProbeBonus(band, memory.approximateTile);
    const logisticsSelectionBias = getLogisticsTripSelectionBias(band, memory.resourceClassId, distanceTiles);
    // 2K.12: bounded, selection-only seasonal-memory bias on the activity target argmax
    // (band-learned only, no hidden truth). Flag default OFF / no learned memory for this
    // tile → bias 0 → byte-identical activity-target selection.
    const seasonalBias =
      world.auditOptions?.seasonalEcologyMemoryReadersEnabled === true
        ? readSeasonalEcologyHint(band.seasonalEcologyMemory, memory.approximateTile, world.time.season, domainForResourceClass(memory.resourceClassId))?.bias ?? 0
        : 0;
    const score = round4(
      causeWeight +
        confidence * 0.2 -
        distancePenalty * 0.22 +
        seasonalBias +
        fallbackExpansionBias +
        nearbyProbeBonus -
        tripAbandonmentPenalty +
        logisticsSelectionBias,
    );
    const candidate = {
      memory,
      targetTileId: memory.approximateTile,
      distanceTiles,
      cause,
      score,
      riskToleranceModifier: adaptationBehavior?.riskToleranceModifier ?? 0,
      fallbackExpansionBias,
      tripAbandonmentPenalty,
      nearbyProbeBonus,
      logisticsSelectionBias,
      seededResourceKnowledgeState,
    };

    if (
      best === undefined ||
      candidate.score > best.score ||
      (candidate.score === best.score && String(candidate.targetTileId) < String(best.targetTileId))
    ) {
      best = candidate;
    }
  }

  return best;
}

function getAdaptationFallbackSelectionBias(
  band: Band,
  resourceClassId: ResourceClassId,
): number {
  const behavior = band.foragingAdaptation?.behavior;

  if (behavior === undefined || behavior.fallbackExpansionBias <= 0 || !isFoodClass(resourceClassId)) {
    return 0;
  }

  if (resourceClassId === "fallback_food") {
    return round4(behavior.fallbackExpansionBias * 0.55);
  }

  if (resourceClassId === "aquatic_food" || resourceClassId === "generic_plant_food") {
    return round4(behavior.fallbackExpansionBias * 0.32);
  }

  if (resourceClassId === "animal_food") {
    return round4(behavior.fallbackExpansionBias * 0.16);
  }

  return 0;
}

function getAdaptationTripAbandonmentPenalty(
  band: Band,
  tileId: TileId,
  resourceClassId: ResourceClassId,
): number {
  const behavior = band.foragingAdaptation?.behavior;

  if (behavior === undefined || behavior.tripAbandonmentBias <= 0) {
    return 0;
  }

  const memory = band.foragingAdaptation?.tripFailureMemories.find((entry) =>
    entry.tileId === tileId &&
    (entry.resourceClassId === undefined || entry.resourceClassId === resourceClassId),
  );

  if (memory === undefined) {
    return 0;
  }

  const actionWeight =
    memory.action === "abandon_temporarily" ? 1 :
      memory.action === "reduce_confidence" ? 0.72 :
        memory.action === "watch" ? 0.42 :
          memory.action === "recovering_after_success" ? 0.18 : 0;

  return round4(Math.min(0.18, behavior.tripAbandonmentBias * actionWeight + memory.confidencePenalty * 0.28));
}

function getAdaptationNearbyProbeBonus(
  band: Band,
  tileId: TileId,
): number {
  const behavior = band.foragingAdaptation?.behavior;

  if (behavior === undefined || behavior.nearbyProbeBias <= 0) {
    return 0;
  }

  const probe = band.foragingAdaptation?.nearbyOpportunityProbes.find((entry) => entry.tileId === tileId);

  if (probe === undefined || probe.comparison !== "nearby_probe") {
    return 0;
  }

  return round4(Math.min(0.14, behavior.nearbyProbeBias * 0.55 + probe.probeReadiness * 0.12));
}

function getLogisticsTripSelectionBias(
  band: Band,
  resourceClassId: ResourceClassId,
  distanceTiles: number,
): number {
  const logistics = band.bodyCampLogistics;

  if (logistics === undefined) {
    return 0;
  }

  const foodBias = isFoodClass(resourceClassId)
    ? logistics.behavior.opportunisticFoodBias * (distanceTiles <= 4 ? 0.46 : 0.18)
    : 0;
  const materialRepairBias =
    resourceClassId === "fiber_material" || resourceClassId === "fuel_material"
      ? logistics.behavior.materialWearPenalty * 0.42 +
        (logistics.fire.status === "limited_by_fuel" ? logistics.behavior.fireExposureReliefBias * 0.18 : 0)
      : 0;
  const sicknessDistancePenalty =
    distanceTiles >= 5
      ? logistics.behavior.sicknessActivityPenalty * 0.42 +
        logistics.behavior.careTravelBurdenBias * 0.34 +
        logistics.behavior.carryConstraintBias * 0.22
      : 0;

  return round4(Math.min(0.08, Math.max(-0.08, foodBias + materialRepairBias - sicknessDistancePenalty)));
}

function buildStartingLocalReconnaissanceState(
  world: WorldState,
  band: Band,
  day: number,
): ResourceKnowledgeState | undefined {
  const origin = world.tiles[band.position];

  if (origin === undefined) {
    return undefined;
  }

  const time = getWorldTimeForDay(day as DayNumber);
  const waterStress = band.pressureState?.waterStress ?? 0;
  const perCapitaReturn =
    band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
    band.perCapitaReturn?.perCapitaReturn ??
    0.5;
  let state = band.resourceKnowledgeState;
  const localObservedRecords = Object.values(band.knowledge.observedTiles)
    .map((record) => {
      const tile = world.tiles[record.tileId];

      return tile === undefined ? undefined : { record, tile, distanceTiles: getGridDistance(origin, tile) };
    })
    .filter((entry): entry is NonNullable<typeof entry> =>
      entry !== undefined &&
      entry.record.tileId !== band.position &&
      entry.distanceTiles > 0 &&
      entry.distanceTiles <= STARTING_LOCAL_RECON_MAX_DISTANCE_TILES,
    )
    .sort((left, right) => {
      const distanceDelta = left.distanceTiles - right.distanceTiles;

      return distanceDelta === 0
        ? String(left.record.tileId).localeCompare(String(right.record.tileId))
        : distanceDelta;
    })
    .slice(0, STARTING_LOCAL_RECON_OBSERVED_TILE_CAP);

  for (const { record } of localObservedRecords) {
    const habitatPotential = deriveBaseHabitatPotential(record.tileId, record, time);
    const resourceSummary = deriveResourceClassAvailability(habitatPotential, record, time);
    state = updateResourceKnowledgeFromObservation(state, resourceSummary, {
      tileId: record.tileId,
      tick: time.tick,
      season: time.season,
      waterStress,
      perCapitaReturn,
      anchorTileId: band.position,
      observationSource: "starting_local_reconnaissance",
    });
  }

  return state === band.resourceKnowledgeState ? undefined : state;
}

function getTripCause(
  band: Band,
  memory: ResourcePatchMemory,
  currentTick: number,
): IntraSeasonTripCause | undefined {
  const effective = effectiveResourceConfidence(memory, currentTick);
  const waterStress = band.pressureState?.waterStress ?? 0;
  const foodStress = band.pressureState?.foodStress ?? 0;
  const perCapitaReturn =
    band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
    band.perCapitaReturn?.perCapitaReturn ??
    0.5;
  const stressedForFood = foodStress >= 0.35 || perCapitaReturn < 0.55 || band.returnTrend?.chronicDecline === true;

  if (memory.resourceClassId === "water_resource" && waterStress >= 0.32) {
    return "water_check";
  }

  if (memory.plantObservation !== undefined && !hasRecentlyTestedClass(band, memory.resourceClassId)) {
    return "plant_followup_test";
  }

  if (stressedForFood && isFoodClass(memory.resourceClassId)) {
    return "food_resource_check";
  }

  if (effective.isStale && effective.effectivePresenceConfidence >= 0.25) {
    return "memory_refresh";
  }

  if (
    isFoodClass(memory.resourceClassId) &&
    effective.effectivePresenceConfidence >= 0.45 &&
    (band.intraSeasonActivity?.activityBudget.nearAnchorForaging ?? 0.45) >= 0.35
  ) {
    return "local_resource_use";
  }

  return undefined;
}

function hasRecentlyTestedClass(band: Band, classId: ResourceClassId): boolean {
  return (band.recentPlantUseTests ?? []).some((entry) => entry.resourceClassId === classId);
}

function wasRecentlyVisited(
  band: Band,
  targetTileId: TileId,
  day: number,
  suppressionDays: number,
): boolean {
  return (band.recentIntraSeasonTrips ?? []).some(
    (trip) => trip.targetTileId === targetTileId && day - Number(trip.day) <= suppressionDays,
  );
}

function buildTripRecord(
  world: WorldState,
  band: Band,
  candidate: TripCandidate,
  day: DayNumber,
  tick: TickNumber,
  season: IntraSeasonTripRecord["season"],
  faunaGeo: FaunaStockGeography,
): IntraSeasonTripRecord {
  const roundTripTiles = candidate.distanceTiles * 2;
  const estimatedDurationDays = Math.max(1, Math.ceil(roundTripTiles / SAME_DAY_ROUND_TRIP_TILE_BUDGET));
  const outcome = classifyOutcome(estimatedDurationDays);
  const movementType = deriveMovementType(candidate.cause, outcome, candidate.distanceTiles);
  const taskGroupType = deriveTaskGroupType(candidate.cause, candidate.memory.resourceClassId);
  const faunaClass = faunaClassForTrip(taskGroupType, candidate.memory.resourceClassId);
  const faunaReturnFactor = faunaClass === undefined
    ? 1
    : deriveFaunaTripReturnFactor(world, faunaGeo, candidate.targetTileId, faunaClass, season);
  const animalTraceBase = faunaClass === "animal_food"
    ? deriveFaunaTripStockTrace(world, faunaGeo, candidate.targetTileId, faunaClass, season, tick)
    : undefined;
  const aquaticTraceBase = faunaClass === "aquatic_food"
    ? deriveFaunaTripStockTrace(world, faunaGeo, candidate.targetTileId, faunaClass, season, tick)
    : undefined;
  const targetTile = world.tiles[candidate.targetTileId];
  const isPlantTraceTrip = faunaClass === undefined && isPlantGatherTrip(taskGroupType, candidate.memory.resourceClassId);
  const plantTraceBase = isPlantTraceTrip && targetTile !== undefined
    ? derivePlantGatherPatchTrace(world, targetTile, world.time)
    : undefined;
  const plantReturnFactor = plantTraceBase !== undefined
    ? plantTraceBase.expectedReturnFactor
    : isPlantTraceTrip && targetTile !== undefined
      ? derivePlantGatherReturnFactor(world, targetTile, world.time)
      : 1;
  const estimatedPeopleCount = estimateTaskGroupPeople(band, taskGroupType);
  const objective = deriveObjective(candidate.cause);
  const pathTiles = buildOutboundPathTiles(world, band.position, candidate.targetTileId);
  const endDay = (Number(day) + estimatedDurationDays - 1) as DayNumber;
  const reasonId =
    `reason:intra-season-trip:${band.id}:${Number(day)}:${candidate.cause}:${candidate.targetTileId}` as ReasonId;
  const outcomeDetail = deriveActivityOutcomeDetail(
    candidate,
    taskGroupType,
    estimatedPeopleCount,
    estimatedDurationDays,
    tick,
    season,
    band.id,
    day,
    faunaReturnFactor,
    plantReturnFactor,
  );
  // ECO-SEASON-1: realized seasonal ecology the group observes at its target this season.
  // Recorded on the trip (debug) and used to scale the SHADOW estimate only — never the
  // canonical activityOutcome above (which feeds memory->2K.9->carrying capacity).
  const seasonalEcology = deriveSeasonalEcologyFactor(
    world,
    candidate.targetTileId,
    taskGroupTypeToEcologyDomain(taskGroupType),
  );
  const plantPatchTrace = plantTraceBase === undefined
    ? undefined
    : finalizePlantPatchTrace(plantTraceBase, outcomeDetail.activityOutcome);
  const animalActivityTrace = animalTraceBase === undefined
    ? undefined
    : finalizeAnimalActivityTrace(
        animalTraceBase,
        outcomeDetail.activityOutcome,
        outcomeDetail.resourceReturn.estimatedReturnValue,
        candidate,
        estimatedPeopleCount,
        band,
        Number(tick),
      );
  const aquaticActivityTrace = aquaticTraceBase === undefined
    ? undefined
    : finalizeAquaticActivityTrace(aquaticTraceBase, outcomeDetail.activityOutcome);
  const effectiveResourceReturn = animalActivityTrace === undefined
    ? outcomeDetail.resourceReturn
    : {
        ...outcomeDetail.resourceReturn,
        estimatedReturnValue: animalActivityTrace.actualReturnValue,
      };

  return {
    day,
    tick,
    season,
    sourceBandId: band.id,
    originTileId: band.position,
    targetTileId: candidate.targetTileId,
    taskGroupType,
    groupLabel: deriveTaskGroupLabel(taskGroupType),
    estimatedPeopleCount,
    objective,
    objectiveLabel: deriveObjectiveLabel(objective),
    startDay: day,
    endDay,
    activityStatus: "completed_observation",
    distanceTiles: candidate.distanceTiles,
    estimatedDurationDays,
    cause: candidate.cause,
    movementType,
    outcome,
    activityResult: outcomeDetail.activityOutcome,
    activityOutcome: outcomeDetail.activityOutcome,
    activityOutcomeReasonIds: outcomeDetail.activityOutcomeReasonIds,
    activityOutcomeSummary: outcomeDetail.activityOutcomeSummary,
    resourceReturn: effectiveResourceReturn,
    shadowSubsistence: deriveShadowSubsistenceRecord(
      candidate,
      taskGroupType,
      estimatedPeopleCount,
      estimatedDurationDays,
      roundTripTiles,
      outcome,
      outcomeDetail.activityOutcome,
      effectiveResourceReturn,
      season,
      tick,
      band.id,
      day,
      shadowSeasonalModifier(seasonalEcology),
    ),
    seasonalEcology,
    ...(plantPatchTrace === undefined ? {} : { plantPatchTrace }),
    ...(animalActivityTrace === undefined ? {} : { animalActivityTrace }),
    ...(aquaticActivityTrace === undefined ? {} : { aquaticActivityTrace }),
    activityMemoryEffect: createNoActivityMemoryEffect(band.id, day, tick, season, candidate.targetTileId, outcomeDetail.activityOutcome),
    pathTiles,
    tilesCrossed: Math.max(0, pathTiles.length - 1),
    roundTripTiles,
    activityDaysRepresented: TRIP_DAY_CADENCE,
    resourceClassId: candidate.memory.resourceClassId,
    resultSummary: outcomeDetail.activityOutcomeSummary,
    reasonIds: [reasonId, ...outcomeDetail.activityOutcomeReasonIds, ...outcomeDetail.resourceReturn.reasonIds],
    noResidentialRelocation: true,
    noYieldChange: true,
    noStressChange: true,
    noPopulationChange: true,
    noCarryingCapacityChange: true,
    noSupportChange: true,
    bandKnownTargetOnly: true,
  };
}

function estimateFaunaTripPressureIntensity(estimatedPeopleCount: number, estimatedReturnValue: number): number {
  return Math.max(0, Math.min(1, estimatedPeopleCount * 0.08 + estimatedReturnValue * 0.6));
}

function animalArchetypeHint(kind: FaunaStockKind, habitat: FaunaHabitatType): string {
  switch (kind) {
    case "large_game":
      return habitat === "open_plain" || habitat === "river_meadow" ? "wild cattle / horse-like open herd" : "large herd prey";
    case "medium_game":
      return habitat === "open_plain" ? "wild horse-like open herd" : "deer / sheep / goat-like herd prey";
    case "small_game":
      return "hares / rabbits / small game";
    case "waterfowl":
      return "waterfowl / wetland birds";
    case "upland_game":
      return "upland deer / sheep / goat-like herd prey";
    case "forest_edge_game":
      return habitat === "wet_woodland" || habitat === "dense_cover" ? "boar-like or forest-edge game" : "forest-edge game";
    case "small_predator":
      return "small predator";
    case "large_predator":
      return "large predator";
    case "lake_fish":
    case "river_reach_fish":
    case "delta_wetland_fish":
    case "seasonal_fish_run":
    case "shellfish_reedbed":
      return "aquatic stock";
  }
}

function finalizeAnimalActivityTrace(
  base: FaunaTripStockTraceBase,
  outcome: IntraSeasonTripActivityResult,
  actualReturnValue: number,
  candidate: TripCandidate,
  estimatedPeopleCount: number,
  band: Band,
  currentTick: number,
): AnimalActivityTrace {
  const depletionApplied = isSuccessfulFaunaOutcome(outcome);
  const pressureApplied = depletionApplied
    ? estimateFaunaTripPressureIntensity(estimatedPeopleCount, actualReturnValue)
    : 0;
  const outcomeClass: AnimalActivityTrace["outcomeClass"] =
    outcome === "partial_success" || outcome === "target_found"
      ? outcome === "partial_success" ? "partial" : "success"
      : isFailureOutcome(outcome)
        ? "failure"
        : "information";
  const rawDangerRisk = round4(clamp01(base.risk + base.disturbance * 0.18 + base.pressure * 0.2 + (outcomeClass === "failure" ? 0.08 : 0)));
  // INVENTION-3: a practiced hunting-method response (striking from reach,
  // snare lines) relieves a bounded share of the danger this trip pays —
  // never more than 60% of it; defended/pressed game still turns hunts back.
  const hunting = deriveHuntingSafetyRelief(band, currentTick, { faunaKind: base.kind, habitat: base.habitat });
  const huntingReliefApplied = hunting.active && hunting.contextMatched && !hunting.materialFailed
    ? round4(Math.min(hunting.relief, rawDangerRisk * 0.6))
    : 0;
  const dangerRisk = round4(clamp01(rawDangerRisk - huntingReliefApplied));
  if (hunting.active && hunting.returnShift > 0) {
    actualReturnValue = round4(clamp01(actualReturnValue * (1 + hunting.returnShift)));
  }
  const knowledgeUpdate: AnimalActivityTrace["knowledgeUpdate"] =
    dangerRisk >= 0.52 && outcomeClass === "failure"
      ? "danger_caution_added"
      : outcomeClass === "partial" || outcomeClass === "success"
        ? base.pressure >= 0.3 ? "reliable_route_strengthened" : "direct_sighting"
        : outcomeClass === "failure"
          ? "failure_staled_route"
          : "tracks_observed";
  const protoCampInfluence: AnimalActivityTrace["protoCampInfluence"] =
    dangerRisk >= 0.55
      ? "danger_avoidance_signal"
      : base.pressure >= 0.48 || base.currentAbundance < 0.48
        ? "overhunted_scarcity_signal"
        : depletionApplied && (base.habitat === "forest_edge" || base.habitat === "wet_woodland" || base.habitat === "scrub_edge")
          ? "forest_edge_game_signal"
          : depletionApplied || base.expectedReturnFactor >= 0.72
            ? "animal_route_signal"
            : "none";

  return {
    stockId: base.stockId,
    faunaKind: base.kind,
    habitat: base.habitat,
    anchorTileId: base.anchorTileId,
    targetArchetypeHint: animalArchetypeHint(base.kind, base.habitat),
    targetChosenReason: `${candidate.cause}; resource memory ${candidate.memory.resourceClassId}; confidence ${round4(candidate.score)}`,
    habitatBasis: base.habitatBasis,
    habitatSuitability: base.habitatSuitability,
    expectedReturnFactor: base.expectedReturnFactor,
    actualReturnValue: round4(actualReturnValue),
    currentAbundance: base.currentAbundance,
    disturbance: base.disturbance,
    seasonalAvailability: base.seasonalAvailability,
    confidence: round4(clamp01(base.detectability * 0.34 + base.habitatSuitability * 0.28 + base.expectedReturnFactor * 0.26 - base.pressure * 0.12)),
    pressure: base.pressure,
    pressureApplied: round4(pressureApplied),
    recoveryRate: base.recoveryRate,
    warinessBefore: round4(clamp01(base.disturbance * 0.56 + base.pressure * 0.32)),
    warinessChange: round4(clamp01(pressureApplied * base.mobility * 0.18)),
    dangerRisk,
    dangerClass: dangerRisk >= 0.58 ? "high" : dangerRisk >= 0.32 ? "moderate" : "low",
    ...(hunting.attempted
      ? {
          dangerRiskBeforeLearning: rawDangerRisk,
          huntingReliefApplied,
          huntingResponseId: hunting.responseId,
          huntingVariantKey: hunting.variantKey,
          huntingContextMatched: hunting.contextMatched && !hunting.materialFailed,
          huntingPreparationLabor: hunting.laborShift,
          huntingReturnShiftApplied: round4(Math.max(0, actualReturnValue - actualReturnValue / Math.max(1, 1 + hunting.returnShift))),
        }
      : {}),
    distanceTiles: candidate.distanceTiles,
    travelCost: round4(clamp01(candidate.distanceTiles / MAX_TRIP_DISTANCE_TILES)),
    laborAccessCost: hunting.active && hunting.laborShift > 0
      ? round4(clamp01(base.laborAccessCost + hunting.laborShift))
      : base.laborAccessCost,
    activityOutcome: outcome,
    outcomeClass,
    depletionApplied,
    knowledgeUpdate,
    memoryUpdate: knowledgeUpdate === "failure_staled_route" || knowledgeUpdate === "reliable_route_strengthened" || depletionApplied
      ? "resource_memory_update"
      : knowledgeUpdate === "danger_caution_added"
        ? "caution_memory_update"
        : "no_memory_update",
    protoCampInfluence,
    rawSource: base.rawSource,
    reasonIds: base.reasonIds,
    targetKnownMemoryOnly: true,
  };
}

function finalizeAquaticActivityTrace(
  base: FaunaTripStockTraceBase,
  outcome: IntraSeasonTripActivityResult,
): AquaticActivityTrace {
  const depletionApplied = isSuccessfulFaunaOutcome(outcome);
  const knowledgeUpdate: AquaticActivityTrace["knowledgeUpdate"] = depletionApplied
    ? "confirmed_by_fishing"
    : isFailureOutcome(outcome)
      ? "failure_lowered_confidence"
      : "observed_only";
  const protoCampInfluence: AquaticActivityTrace["protoCampInfluence"] =
    depletionApplied && (base.seasonalAvailability >= 1 || base.expectedReturnFactor >= 0.72)
      ? "aquatic_activity_base_signal"
      : base.habitat === "lake" || base.habitat === "delta_wetland"
        ? "lean_season_buffer_signal"
        : "none";

  return {
    stockId: base.stockId,
    aquaticKind: base.kind,
    waterContext: base.habitat,
    anchorTileId: base.anchorTileId,
    resourceClassId: "aquatic_food",
    expectedReturnFactor: base.expectedReturnFactor,
    currentAbundance: base.currentAbundance,
    disturbance: base.disturbance,
    seasonalAvailability: base.seasonalAvailability,
    pressure: base.pressure,
    recoveryRate: base.recoveryRate,
    risk: base.risk,
    laborAccessCost: base.laborAccessCost,
    activityOutcome: outcome,
    depletionApplied,
    knowledgeUpdate,
    memoryUpdate: depletionApplied || knowledgeUpdate === "failure_lowered_confidence"
      ? "resource_memory_update"
      : "no_memory_update",
    protoCampInfluence,
    rawSource: base.rawSource,
    reasonIds: base.reasonIds,
  };
}

function finalizePlantPatchTrace(
  base: PlantGatherPatchTraceBase,
  outcome: IntraSeasonTripActivityResult,
): PlantPatchActivityTrace {
  const depletionApplied = isSuccessfulFaunaOutcome(outcome);
  const knowledgeUpdate: PlantPatchActivityTrace["knowledgeUpdate"] = depletionApplied
    ? "confirmed_by_gathering"
    : isFailureOutcome(outcome)
      ? "failure_lowered_confidence"
      : "observed_only";
  const protoCampInfluence: PlantPatchActivityTrace["protoCampInfluence"] =
    base.fallbackRole === "important" || base.fallbackRole === "emergency"
      ? "fallback_refuge_signal"
      : depletionApplied && base.expectedReturnFactor >= 0.72
        ? "activity_base_signal"
        : "none";

  return {
    ...base,
    depletionApplied,
    knowledgeUpdate,
    memoryUpdate: depletionApplied || knowledgeUpdate === "failure_lowered_confidence"
      ? "resource_memory_update"
      : "no_memory_update",
    protoCampInfluence,
  };
}

function deriveActivityOutcomeDetail(
  candidate: TripCandidate,
  taskGroupType: IntraSeasonTripTaskGroupType,
  estimatedPeopleCount: number,
  estimatedDurationDays: number,
  tick: TickNumber,
  season: IntraSeasonTripRecord["season"],
  bandId: BandId,
  day: DayNumber,
  faunaReturnFactor: number,
  plantReturnFactor: number,
): ActivityOutcomeDetail {
  const effective = effectiveResourceConfidence(candidate.memory, Number(tick));
  const seasonMismatch = isKnownSeasonMismatch(candidate.memory, season, effective.effectiveSeasonConfidence);
  const waterRiskKnown =
    candidate.memory.resourceClassId === "water_resource" &&
    candidate.memory.risk.badWater &&
    effective.effectiveSafetyConfidence >= 0.35;
  const riskToleranceModifier = candidate.riskToleranceModifier;
  const desperationFoodOverride =
    riskToleranceModifier >= 0.06 &&
    isFoodClass(candidate.memory.resourceClassId) &&
    effective.effectiveAccessConfidence >= 0.22 &&
    effective.effectivePresenceConfidence >= 0.18;
  const distanceRiskKnown =
    estimatedDurationDays > 1 &&
    candidate.distanceTiles >= 8 &&
    effective.effectiveAccessConfidence < 0.35 &&
    !desperationFoodOverride;
  const lowMemoryConfidenceThreshold = isFoodClass(candidate.memory.resourceClassId)
    ? Math.max(0.14, LOW_MEMORY_CONFIDENCE_THRESHOLD - riskToleranceModifier * 0.55)
    : LOW_MEMORY_CONFIDENCE_THRESHOLD;
  const lowMemoryConfidence =
    effective.isDormant ||
    Math.min(effective.effectivePresenceConfidence, effective.effectiveYieldConfidence) < lowMemoryConfidenceThreshold;
  const outcome = classifyActivityOutcome(
    candidate,
    taskGroupType,
    estimatedPeopleCount,
    estimatedDurationDays,
    seasonMismatch,
    waterRiskKnown,
    distanceRiskKnown,
    lowMemoryConfidence,
    effective.effectivePresenceConfidence,
    effective.effectiveYieldConfidence,
  );
  const outcomeReasonIds = [
    makeActivityReasonId(bandId, day, "outcome", outcome, candidate.targetTileId),
    ...(seasonMismatch ? [makeActivityReasonId(bandId, day, "season", "mismatch", candidate.targetTileId)] : []),
    ...(waterRiskKnown ? [makeActivityReasonId(bandId, day, "risk", "bad-water", candidate.targetTileId)] : []),
    ...(distanceRiskKnown ? [makeActivityReasonId(bandId, day, "distance", "access-low", candidate.targetTileId)] : []),
    ...(lowMemoryConfidence ? [makeActivityReasonId(bandId, day, "memory", "low-confidence", candidate.targetTileId)] : []),
    ...(desperationFoodOverride ? [makeActivityReasonId(bandId, day, "adaptation", "desperation-risk-tolerance", candidate.targetTileId)] : []),
  ];
  const resourceReturn = deriveResourceReturnRecord(
    candidate,
    taskGroupType,
    estimatedPeopleCount,
    outcome,
    effective.effectivePresenceConfidence,
    effective.effectiveYieldConfidence,
    bandId,
    day,
    faunaReturnFactor,
    plantReturnFactor,
  );

  return {
    activityOutcome: outcome,
    activityOutcomeReasonIds: outcomeReasonIds,
    activityOutcomeSummary: summarizeActivityOutcome(outcome, resourceReturn.returnedResourceKind),
    resourceReturn,
  };
}

function classifyActivityOutcome(
  candidate: TripCandidate,
  taskGroupType: IntraSeasonTripTaskGroupType,
  estimatedPeopleCount: number,
  estimatedDurationDays: number,
  seasonMismatch: boolean,
  waterRiskKnown: boolean,
  distanceRiskKnown: boolean,
  lowMemoryConfidence: boolean,
  presenceConfidence: number,
  yieldConfidence: number,
): IntraSeasonTripActivityResult {
  if (waterRiskKnown) {
    return candidate.cause === "water_check" ? "failed_due_to_water_risk" : "abandoned_due_to_risk";
  }

  if (distanceRiskKnown) {
    return "failed_due_to_distance";
  }

  if (seasonMismatch && candidate.cause !== "memory_refresh") {
    return "failed_due_to_season_mismatch";
  }

  if (lowMemoryConfidence) {
    return candidate.memory.state === "suspected" || candidate.memory.source === "inferred"
      ? "target_not_found"
      : "failed_due_to_low_memory_confidence";
  }

  if (estimatedDurationDays > 1 && presenceConfidence < OBSERVATION_CONFIDENCE_THRESHOLD) {
    return "delayed_return";
  }

  if (candidate.cause === "memory_refresh" || taskGroupType === "memory_refresh_group") {
    return "returned_with_information";
  }

  if (candidate.cause === "water_check" || taskGroupType === "water_group") {
    return "returned_with_information";
  }

  if (candidate.cause === "plant_followup_test" || taskGroupType === "plant_followup_group") {
    return yieldConfidence >= PARTIAL_RETURN_CONFIDENCE_THRESHOLD ? "partial_success" : "returned_with_information";
  }

  if (isFoodClass(candidate.memory.resourceClassId)) {
    if (presenceConfidence >= PARTIAL_RETURN_CONFIDENCE_THRESHOLD && yieldConfidence >= OBSERVATION_CONFIDENCE_THRESHOLD) {
      return estimatedPeopleCount >= 2 ? "partial_success" : "target_found";
    }

    if (presenceConfidence >= OBSERVATION_CONFIDENCE_THRESHOLD) {
      return "target_found";
    }
  }

  if (presenceConfidence >= OBSERVATION_CONFIDENCE_THRESHOLD) {
    return "successful_observation";
  }

  return "no_effect_observed";
}

function deriveResourceReturnRecord(
  candidate: TripCandidate,
  taskGroupType: IntraSeasonTripTaskGroupType,
  estimatedPeopleCount: number,
  outcome: IntraSeasonTripActivityResult,
  presenceConfidence: number,
  yieldConfidence: number,
  bandId: BandId,
  day: DayNumber,
  faunaReturnFactor: number,
  plantReturnFactor: number,
): ActivityResourceReturnRecord {
  const returnedResourceKind = deriveReturnedResourceKind(candidate, taskGroupType, outcome);
  const returnConfidence = round4(Math.max(0, Math.min(1, presenceConfidence * 0.62 + yieldConfidence * 0.38)));
  // FAUNA/AQUATIC-1 + ECO-BIOME-1 — hunted/fish returns scale by the finite fauna
  // stock; gathered returns scale by the finite plant patch (abundance/season/
  // depletion). Shadow value only — it drives memory yield-trend / talk / movement,
  // never support directly. Water/info kinds are unaffected.
  const baseReturnValue = estimatedPeopleCount * 0.035 + yieldConfidence * 0.22 + presenceConfidence * 0.08;
  const isFaunaReturn = returnedResourceKind === "hunted_fauna_food" || returnedResourceKind === "harvested_aquatic_food";
  const isPlantReturn = returnedResourceKind === "gathered_plant_food";
  const scaledReturnValue = isFaunaReturn
    ? baseReturnValue * faunaReturnFactor
    : isPlantReturn
      ? baseReturnValue * plantReturnFactor
      : baseReturnValue;
  const outcomeRealization = outcome === "target_found" ? 0.55 : 1;
  const estimatedReturnValue = isPhysicalFoodReturnKind(returnedResourceKind) || isPhysicalMaterialReturnKind(returnedResourceKind)
    ? round4(Math.min(0.5, scaledReturnValue * outcomeRealization))
    : 0;

  return {
    returnedResourceKind,
    semantics: getActivityReturnSemantics(returnedResourceKind),
    estimatedReturnValue,
    returnConfidence,
    consumedByEconomy: false,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: true,
    noPopulationChange: true,
    noStressChange: true,
    noSupportChange: true,
    reasonIds: [makeActivityReasonId(bandId, day, "return", returnedResourceKind, candidate.targetTileId)],
  };
}

function deriveReturnedResourceKind(
  candidate: TripCandidate,
  taskGroupType: IntraSeasonTripTaskGroupType,
  outcome: IntraSeasonTripActivityResult,
): ActivityReturnResourceKind {
  return classifyActivityReturnKind({
    resourceClassId: candidate.memory.resourceClassId,
    taskGroupType,
    outcome,
  });
}

function summarizeActivityOutcome(
  outcome: IntraSeasonTripActivityResult,
  returnedResourceKind: ActivityReturnResourceKind,
): string {
  const semantics = getActivityReturnSemantics(returnedResourceKind);
  const result = semantics.contributesToNutrition
    ? "physical_receipt_feeds_support"
    : semantics.category === "physical_material"
      ? "physical_material_no_nutrition"
      : "information_or_zero_return";
  return `deterministic_${outcome}; return=${returnedResourceKind}; ${result}`;
}

// ===========================================================================
// ACTIVITY-GROUPS-10 — SHADOW subsistence estimate.
//
// Academic grounding (central-place foraging; Hadza/Hill–Hurtado/Kelly/Binford):
//   - Gathering is the reliable caloric staple: moderate per-person return, low
//     variance. Local foraging near camp is similar but smaller.
//   - Fishing is moderately reliable where water/aquatic patches are known.
//   - Hunting is high-yield-per-success but HIGH VARIANCE: most outings fail, so a
//     success brings real (shared) food yet its EXPECTED, dependable contribution is
//     low. It must never be modelled as guaranteed food.
//   - Water groups produce survival-critical SUPPORT, not calories (own domain).
//   - Plant follow-up is uncertain: unproven safety/processing => discounted, never
//     instantly edible/safe.
//   - Central-place foraging: the band is fed by NET return after round-trip travel
//     cost and known risk; farther/over-night forays cost more. Food sharing means a
//     group's return supports the whole band, but only AFTER it returns (same-day
//     groups support the base today; overnight/continuing groups contribute later).
//
// All inputs are band-KNOWN (patch memory effective confidence, remembered risk,
// remembered seasonality, distance, estimated group size, task type, deterministic
// outcome). No hidden truth, no randomness. The result is shadow-only.
// ===========================================================================

const SHADOW_FOOD_BASE_RATE: Partial<Record<IntraSeasonTripTaskGroupType, number>> = {
  hunting_group: 0.18,
  fishing_group: 0.12,
  plant_gathering_group: 0.13,
  local_foraging_group: 0.1,
  plant_followup_group: 0.07,
};
const SHADOW_WATER_SUPPORT_RATE = 0.07;
const SHADOW_TASK_RELIABILITY: Record<IntraSeasonTripTaskGroupType, number> = {
  hunting_group: 0.32,
  fishing_group: 0.66,
  plant_gathering_group: 0.82,
  local_foraging_group: 0.8,
  plant_followup_group: 0.42,
  water_group: 0.85,
  memory_refresh_group: 0.9,
};
const SHADOW_TRAVEL_RATE_PER_TILE = 0.01;
const SHADOW_OVERNIGHT_TRAVEL_COST = 0.02;
const SHADOW_MAX_TRAVEL_COST = 0.25;
const SHADOW_MAX_RISK_PENALTY = 0.2;

function deriveShadowReturnKind(
  returnedResourceKind: ActivityReturnResourceKind,
  taskGroupType: IntraSeasonTripTaskGroupType,
): ActivityShadowReturnKind {
  switch (returnedResourceKind) {
    case "hunted_fauna_food":
      return "hunted_food_shadow";
    case "harvested_aquatic_food":
      return "fish_shadow";
    case "gathered_plant_food":
      return taskGroupType === "plant_followup_group" ? "plant_food_shadow_uncertain" : "gathered_food_shadow";
    case "water_information":
      return "water_support_shadow";
    case "food_observation_only":
    case "gathered_fiber_material":
    case "gathered_fuel_material":
    case "plant_information":
    case "route_information":
      return "information_only";
    case "none":
      return "none";
  }
}

function shadowSupportDomain(kind: ActivityShadowReturnKind): ActivityShadowReturnRecord["shadowSupportDomain"] {
  if (kind === "water_support_shadow") {
    return "water_support";
  }
  if (kind === "none" || kind === "information_only") {
    return "information";
  }
  return "food";
}

function shadowOutcomeFoodFactor(activityOutcome: IntraSeasonTripActivityResult): number {
  switch (activityOutcome) {
    case "partial_success":
      return 1;
    case "target_found":
      return 0.45;
    case "successful_observation":
      return 0.15;
    default:
      return 0;
  }
}

function deriveShadowSubsistenceRecord(
  candidate: TripCandidate,
  taskGroupType: IntraSeasonTripTaskGroupType,
  estimatedPeopleCount: number,
  estimatedDurationDays: number,
  roundTripTiles: number,
  tripOutcome: IntraSeasonTripOutcome,
  activityOutcome: IntraSeasonTripActivityResult,
  resourceReturn: ActivityResourceReturnRecord,
  season: IntraSeasonTripRecord["season"],
  tick: TickNumber,
  bandId: BandId,
  day: DayNumber,
  // ECO-SEASON-1: realized seasonal ecology multiplier (~0.5..1.3; 1 = season-neutral).
  // Scales the SHADOW estimate only — never the canonical outcome or the real economy
  // (the economy reads this shadow value solely through the OFF-by-default AG11 path).
  seasonalEcologyModifier = 1,
): ActivityShadowReturnRecord {
  const effective = effectiveResourceConfidence(candidate.memory, Number(tick));
  const kind = deriveShadowReturnKind(resourceReturn.returnedResourceKind, taskGroupType);
  const domain = shadowSupportDomain(kind);
  const patchConfidence = clamp01(resourceReturn.returnConfidence);
  const seasonMismatch = isKnownSeasonMismatch(candidate.memory, season, effective.effectiveSeasonConfidence);
  const seasonFactor = seasonMismatch ? 0.45 : clamp01(0.7 + 0.3 * effective.effectiveSeasonConfidence);

  // Known remembered risk (band-known only — never hidden truth).
  const predatorRisk = clamp01(candidate.memory.risk.predatorOrAnimalRisk ?? 0);
  const badWater = candidate.memory.risk.badWater === true;
  const badReaction = candidate.memory.risk.poisoningOrBadReaction === true;
  const overnight = estimatedDurationDays > 1;

  const ecologyModifier = Math.max(0.5, Math.min(1.3, seasonalEcologyModifier));
  let shadowGrossValue = 0;
  if (domain === "food") {
    const baseRate = SHADOW_FOOD_BASE_RATE[taskGroupType] ?? 0.09;
    shadowGrossValue =
      baseRate * estimatedPeopleCount * shadowOutcomeFoodFactor(activityOutcome) * patchConfidence * seasonFactor * ecologyModifier;
  } else if (domain === "water_support") {
    // Water security support: people-scaled, confidence-gated. ECO-SEASON-1 lets realized
    // seasonal water reliability scale it (the shadow only — economy reads it solely via AG11).
    shadowGrossValue = SHADOW_WATER_SUPPORT_RATE * estimatedPeopleCount * patchConfidence * ecologyModifier;
  }

  const shadowTravelCost = Math.min(
    SHADOW_MAX_TRAVEL_COST,
    SHADOW_TRAVEL_RATE_PER_TILE * roundTripTiles + (overnight ? SHADOW_OVERNIGHT_TRAVEL_COST * (estimatedDurationDays - 1) : 0),
  );
  const shadowRiskPenalty = Math.min(
    SHADOW_MAX_RISK_PENALTY,
    predatorRisk * 0.08 + (badWater ? 0.05 : 0) + (badReaction ? 0.05 : 0) + (overnight ? 0.02 : 0),
  );

  const shadowGross = round4(shadowGrossValue);
  const travelCost = round4(shadowGrossValue === 0 ? 0 : shadowTravelCost);
  const riskPenalty = round4(shadowGrossValue === 0 ? 0 : shadowRiskPenalty);
  const shadowNetValue = round4(Math.max(0, shadowGrossValue - travelCost - riskPenalty));

  const taskReliability = SHADOW_TASK_RELIABILITY[taskGroupType] ?? 0.6;
  const riskReliabilityFactor = clamp01(1 - (predatorRisk * 0.5 + (badWater ? 0.3 : 0) + (badReaction ? 0.3 : 0)));
  const shadowReliability = round4(
    domain === "information" || shadowGrossValue === 0
      ? 0
      : clamp01(taskReliability * patchConfidence * (seasonMismatch ? 0.6 : clamp01(0.85 + 0.15 * effective.effectiveSeasonConfidence)) * riskReliabilityFactor),
  );

  return {
    shadowReturnKind: kind,
    shadowSupportDomain: domain,
    shadowGrossValue: shadowGross,
    shadowTravelCost: travelCost,
    shadowRiskPenalty: riskPenalty,
    shadowNetValue,
    shadowReliability,
    contributesAtBaseSameDay: tripOutcome === "returns_same_day",
    seasonalEcologyModifier: round4(ecologyModifier),
    shadowConsumedByEconomy: false,
    noEconomyCoupling: true,
    reasonIds: [makeActivityReasonId(bandId, day, "shadow", kind, candidate.targetTileId)],
  };
}

function buildActivityShadowSubsistenceSummary(
  band: Band,
  record: IntraSeasonTripRecord,
  recentIntraSeasonTrips: readonly IntraSeasonTripRecord[],
  laborSummary: ActivityLaborSummary,
): ActivityShadowSubsistenceSummary {
  let totalShadowGross = 0;
  let totalShadowNet = 0;
  let totalFoodShadowNet = 0;
  let totalWaterSupportShadowNet = 0;
  let sameDayShadowNet = 0;
  let delayedShadowNet = 0;
  let totalShadowTravelCost = 0;
  let foodBearingTripCount = 0;
  let waterSupportTripCount = 0;
  let informationOnlyTripCount = 0;
  let noContributionTripCount = 0;
  let seasonMismatchTripCount = 0;
  let foodReliabilitySum = 0;
  const byTaskType = new Map<IntraSeasonTripTaskGroupType, ActivityShadowTaskTypeContribution>();
  const byReturnKind = new Map<ActivityShadowReturnKind, ActivityShadowReturnKindContribution>();

  for (const trip of recentIntraSeasonTrips) {
    const shadow = trip.shadowSubsistence;
    totalShadowGross += shadow.shadowGrossValue;
    totalShadowNet += shadow.shadowNetValue;
    totalShadowTravelCost += shadow.shadowTravelCost;
    if (shadow.contributesAtBaseSameDay) {
      sameDayShadowNet += shadow.shadowNetValue;
    } else {
      delayedShadowNet += shadow.shadowNetValue;
    }

    if (shadow.shadowSupportDomain === "food") {
      totalFoodShadowNet += shadow.shadowNetValue;
      if (shadow.shadowNetValue > 0) {
        foodBearingTripCount += 1;
        foodReliabilitySum += shadow.shadowReliability;
      }
    } else if (shadow.shadowSupportDomain === "water_support") {
      totalWaterSupportShadowNet += shadow.shadowNetValue;
      if (shadow.shadowNetValue > 0) {
        waterSupportTripCount += 1;
      }
    }

    if (shadow.shadowReturnKind === "information_only") {
      informationOnlyTripCount += 1;
    }
    if (shadow.shadowReturnKind === "none") {
      noContributionTripCount += 1;
    }
    if (trip.activityOutcome === "failed_due_to_season_mismatch") {
      seasonMismatchTripCount += 1;
    }

    const task = byTaskType.get(trip.taskGroupType) ?? {
      taskGroupType: trip.taskGroupType,
      count: 0,
      grossTotal: 0,
      netTotal: 0,
    };
    byTaskType.set(trip.taskGroupType, {
      taskGroupType: trip.taskGroupType,
      count: task.count + 1,
      grossTotal: round4(task.grossTotal + shadow.shadowGrossValue),
      netTotal: round4(task.netTotal + shadow.shadowNetValue),
    });

    const kind = byReturnKind.get(shadow.shadowReturnKind) ?? {
      shadowReturnKind: shadow.shadowReturnKind,
      count: 0,
      netTotal: 0,
    };
    byReturnKind.set(shadow.shadowReturnKind, {
      shadowReturnKind: shadow.shadowReturnKind,
      count: kind.count + 1,
      netTotal: round4(kind.netTotal + shadow.shadowNetValue),
    });
  }

  const recentTripCount = recentIntraSeasonTrips.length;
  const meanFoodTripShadowNet = foodBearingTripCount > 0 ? round4(totalFoodShadowNet / foodBearingTripCount) : 0;
  const meanShadowReliability = foodBearingTripCount > 0 ? round4(foodReliabilitySum / foodBearingTripCount) : 0;
  const currentAbstractPerCapitaReturn = round4(band.carryingCapacity?.perCapitaReturn?.perCapitaReturn ?? 0);
  const currentAbstractAdjustedSupport = round4(
    band.carryingCapacity?.perCapitaReturn?.supportDebug?.adjustedReachableSupport ?? 0,
  );
  const currentAbstractDemand = round4(
    band.carryingCapacity?.perCapitaReturn?.supportDebug?.adultEquivalentDemand ?? 0,
  );
  const shadowSupportComparable = currentAbstractPerCapitaReturn > 0 && foodBearingTripCount > 0;

  return {
    bandId: band.id,
    day: record.day,
    tick: record.tick,
    season: record.season,
    recentTripCount,
    foodBearingTripCount,
    waterSupportTripCount,
    informationOnlyTripCount,
    noContributionTripCount,
    totalShadowGross: round4(totalShadowGross),
    totalShadowNet: round4(totalShadowNet),
    totalFoodShadowNet: round4(totalFoodShadowNet),
    totalWaterSupportShadowNet: round4(totalWaterSupportShadowNet),
    sameDayShadowNet: round4(sameDayShadowNet),
    delayedShadowNet: round4(delayedShadowNet),
    totalShadowTravelCost: round4(totalShadowTravelCost),
    meanFoodTripShadowNet,
    meanShadowReliability,
    travelCostShareOfGross: totalShadowGross > 0 ? round4(totalShadowTravelCost / totalShadowGross) : 0,
    seasonMismatchTripShare: recentTripCount > 0 ? round4(seasonMismatchTripCount / recentTripCount) : 0,
    shadowByTaskType: [...byTaskType.values()].sort((left, right) =>
      left.taskGroupType.localeCompare(right.taskGroupType),
    ),
    shadowByReturnKind: [...byReturnKind.values()].sort((left, right) =>
      left.shadowReturnKind.localeCompare(right.shadowReturnKind),
    ),
    peopleAssignedEstimate: laborSummary.peopleAssignedToActivityGroups,
    peopleAtResidentialCenterEstimate: laborSummary.peopleAtResidentialCenterEstimate,
    currentAbstractPerCapitaReturn,
    currentAbstractAdjustedSupport,
    currentAbstractDemand,
    shadowVsCurrentSupportRatio: shadowSupportComparable
      ? round4(meanFoodTripShadowNet / currentAbstractPerCapitaReturn)
      : 0,
    shadowSupportComparable,
    shadowConsumedByEconomy: false,
    noEconomyCoupling: true,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: true,
    noPopulationChange: true,
    noStressChange: true,
    noSupportChange: true,
  };
}

function isKnownSeasonMismatch(
  memory: ResourcePatchMemory,
  season: IntraSeasonTripRecord["season"],
  seasonConfidence: number,
): boolean {
  if (seasonConfidence < 0.35 || memory.seasonality.bestSeasons.length === 0) {
    return false;
  }

  return !memory.seasonality.bestSeasons.includes(season);
}

function makeActivityReasonId(
  bandId: BandId,
  day: DayNumber,
  category: string,
  detail: string,
  targetTileId: TileId,
): ReasonId {
  return `reason:activity-${category}:${bandId}:${Number(day)}:${detail}:${targetTileId}` as ReasonId;
}

function applyActivityOutcomeToMemory(
  band: Band,
  record: IntraSeasonTripRecord,
  targetMemory: ResourcePatchMemory,
): ActivityMemoryApplication {
  const state = band.resourceKnowledgeState;

  if (state === undefined) {
    return {
      resourceKnowledgeState: state,
      effect: createNoActivityMemoryEffect(
        band.id,
        record.day,
        record.tick,
        record.season,
        record.targetTileId,
        record.activityOutcome,
        "no band resource-knowledge state; no activity memory update",
      ),
    };
  }

  const memoryIndex = state.patchMemories.findIndex(
    (memory) => memory.patchId === targetMemory.patchId && memory.approximateTile === record.targetTileId,
  );

  if (memoryIndex === -1) {
    return {
      resourceKnowledgeState: state,
      effect: createNoActivityMemoryEffect(
        band.id,
        record.day,
        record.tick,
        record.season,
        record.targetTileId,
        record.activityOutcome,
        "target patch not in band-known memory; no discovery created",
      ),
    };
  }

  const memory = state.patchMemories[memoryIndex];
  const effectType = deriveActivityMemoryEffectType(record, memory);

  if (effectType === "none") {
    return {
      resourceKnowledgeState: state,
      effect: createNoActivityMemoryEffect(
        band.id,
        record.day,
        record.tick,
        record.season,
        record.targetTileId,
        record.activityOutcome,
        "activity outcome is debug-only for memory",
        memory,
      ),
    };
  }

  const reasonId = makeActivityReasonId(band.id, record.day, "memory", effectType, record.targetTileId);
  const updatedMemory = updateResourcePatchMemoryFromActivity(memory, record, effectType, reasonId);
  const patchMemories = state.patchMemories.map((entry, index) =>
    index === memoryIndex ? updatedMemory : entry,
  );
  const effect = buildActivityMemoryEffectRecord(
    band.id,
    record,
    memory,
    updatedMemory,
    effectType,
    reasonId,
  );

  return {
    resourceKnowledgeState: {
      ...state,
      patchMemories,
    },
    effect,
  };
}

function applyActivityOutcomeToMemoryForWorld(
  world: WorldState,
  band: Band,
  record: IntraSeasonTripRecord,
  targetMemory: ResourcePatchMemory,
): ActivityMemoryApplication {
  if (world.auditOptions?.activityMemoryCouplingDisabled === true) {
    return {
      resourceKnowledgeState: band.resourceKnowledgeState,
      effect: createNoActivityMemoryEffect(
        band.id,
        record.day,
        record.tick,
        record.season,
        record.targetTileId,
        record.activityOutcome,
        "activity memory coupling disabled by audit; no memory update",
        targetMemory,
      ),
    };
  }

  return applyActivityOutcomeToMemory(band, record, targetMemory);
}

export function applyActivityOutcomeToMemoryForAudit(
  band: Band,
  record: IntraSeasonTripRecord,
  targetMemory: ResourcePatchMemory,
): ActivityMemoryApplication {
  return applyActivityOutcomeToMemory(band, record, targetMemory);
}

function deriveActivityMemoryEffectType(
  record: IntraSeasonTripRecord,
  memory: ResourcePatchMemory,
): ActivityMemoryEffectType {
  switch (record.activityOutcome) {
    case "partial_success":
    case "target_found":
    case "successful_observation":
      return "confidence_refreshed";
    case "returned_with_information":
      if (record.taskGroupType === "water_group" || memory.resourceClassId === "water_resource") {
        return "water_reliability_refreshed";
      }

      if (record.taskGroupType === "plant_followup_group" && memory.plantObservation !== undefined) {
        return "plant_caution_refreshed";
      }

      if (record.taskGroupType === "memory_refresh_group") {
        return "route_memory_refreshed";
      }

      return "confidence_refreshed";
    case "target_not_found":
    case "failed_due_to_low_memory_confidence":
    case "failed_due_to_distance":
    case "delayed_return":
      return "confidence_lowered";
    case "failed_due_to_season_mismatch":
      return "seasonality_hint_added";
    case "failed_due_to_water_risk":
    case "abandoned_due_to_risk":
      return "risk_suspicion_added";
    case "no_effect_observed":
      return "none";
  }
}

function updateResourcePatchMemoryFromActivity(
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
  reasonId: ReasonId,
): ResourcePatchMemory {
  const confidence = updateActivityMemoryConfidence(memory.confidence, memory, record, effectType);
  const state = updateActivityMemoryState(memory, record, effectType, confidence);
  const source = isActivityConfirmation(record.activityOutcome) ? "direct" : memory.source;

  return {
    ...memory,
    state,
    source,
    confidence,
    seasonality: updateActivitySeasonality(memory, record, effectType),
    useHistory: updateActivityUseHistory(memory, record, effectType, confidence),
    risk: updateActivityRisk(memory, record, effectType),
    plantObservation: updateActivityPlantObservation(memory, record, effectType, reasonId),
    learning: updateActivityPatchLearningMemory(memory.learning, record, effectType),
    lastNotedTick: record.tick,
    reasonIds: [...memory.reasonIds, reasonId, ...record.activityOutcomeReasonIds].slice(-12),
  };
}

function updateActivityMemoryConfidence(
  confidence: ResourceConfidenceProfile,
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
): ResourceConfidenceProfile {
  switch (effectType) {
    case "confidence_refreshed":
      return withActivityConfidenceDeltas(confidence, {
        presenceConfidence: 0.03,
        seasonConfidence: 0.02,
        yieldConfidence: record.activityOutcome === "partial_success" ? 0.03 : 0.01,
        safetyConfidence: 0.01,
        accessConfidence: 0.01,
      });
    case "water_reliability_refreshed":
      return withActivityConfidenceDeltas(confidence, {
        presenceConfidence: 0.02,
        seasonConfidence: 0.01,
        safetyConfidence: memory.risk.badWater ? 0 : 0.01,
        accessConfidence: 0.02,
      });
    case "plant_caution_refreshed":
      return withActivityConfidenceDeltas(confidence, {
        presenceConfidence: 0.01,
        safetyConfidence: memory.plantObservation?.suspectedSafetyRisk === true ? -0.02 : 0,
        processingConfidence: memory.plantObservation?.suspectedProcessingNeed === true ? 0.02 : 0,
      });
    case "route_memory_refreshed":
      return withActivityConfidenceDeltas(confidence, {
        presenceConfidence: 0.01,
        accessConfidence: 0.03,
      });
    case "confidence_lowered":
      if (record.activityOutcome === "failed_due_to_distance" || record.activityOutcome === "delayed_return") {
        return withActivityConfidenceDeltas(confidence, {
          presenceConfidence: -0.01,
          accessConfidence: -0.05,
        });
      }

      return withActivityConfidenceDeltas(confidence, {
        presenceConfidence: -0.04,
        yieldConfidence: -0.03,
        accessConfidence: -0.01,
      });
    case "seasonality_hint_added":
      return withActivityConfidenceDeltas(confidence, {
        seasonConfidence: -0.05,
        yieldConfidence: -0.03,
      });
    case "risk_suspicion_added":
      return withActivityConfidenceDeltas(confidence, {
        presenceConfidence: -0.01,
        safetyConfidence: -0.06,
      });
    case "repeated_use_counter_incremented_placeholder":
    case "none":
      return confidence;
  }
}

function withActivityConfidenceDeltas(
  confidence: ResourceConfidenceProfile,
  delta: Partial<Record<ActivityMemoryConfidenceChannel, number>>,
): ResourceConfidenceProfile {
  return {
    presenceConfidence: adjustActivityConfidenceChannel(confidence.presenceConfidence, delta.presenceConfidence ?? 0),
    seasonConfidence: adjustActivityConfidenceChannel(confidence.seasonConfidence, delta.seasonConfidence ?? 0),
    yieldConfidence: adjustActivityConfidenceChannel(confidence.yieldConfidence, delta.yieldConfidence ?? 0),
    safetyConfidence: adjustActivityConfidenceChannel(confidence.safetyConfidence, delta.safetyConfidence ?? 0),
    processingConfidence: adjustActivityConfidenceChannel(confidence.processingConfidence, delta.processingConfidence ?? 0),
    accessConfidence: adjustActivityConfidenceChannel(confidence.accessConfidence, delta.accessConfidence ?? 0),
    recoveryConfidence: adjustActivityConfidenceChannel(confidence.recoveryConfidence, delta.recoveryConfidence ?? 0),
  };
}

function adjustActivityConfidenceChannel(previous: number, delta: number): number {
  if (delta > 0) {
    return round2(previous >= 0.9 ? previous : Math.min(0.9, previous + delta));
  }

  return round2(clamp01(previous + delta));
}

function updateActivityMemoryState(
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
  confidence: ResourceConfidenceProfile,
): ResourceKnowledgeStateKind {
  if (effectType === "risk_suspicion_added") {
    return "risky";
  }

  if (effectType === "seasonality_hint_added") {
    return "seasonally_bad";
  }

  if (effectType === "confidence_lowered") {
    return confidence.presenceConfidence < 0.18 ? "suspected" : memory.state;
  }

  if (
    record.activityOutcome === "partial_success" &&
    (memory.state === "observed" || memory.state === "used" || memory.state === "reliable")
  ) {
    return "used";
  }

  if (isActivityConfirmation(record.activityOutcome) && (memory.state === "unknown" || memory.state === "suspected")) {
    return "observed";
  }

  return memory.state;
}

function updateActivitySeasonality(
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
): ResourcePatchMemory["seasonality"] {
  const confirmed = effectType === "confidence_refreshed" ||
    effectType === "water_reliability_refreshed" ||
    effectType === "route_memory_refreshed";
  const failed = effectType === "seasonality_hint_added";

  return {
    bestSeasons: confirmed
      ? addUniqueSeason(memory.seasonality.bestSeasons, record.season)
      : memory.seasonality.bestSeasons,
    badSeasons: failed
      ? addUniqueSeason(memory.seasonality.badSeasons, record.season)
      : memory.seasonality.badSeasons,
    lastConfirmedSeason: confirmed ? record.season : memory.seasonality.lastConfirmedSeason,
    lastFailedTick: failed ? record.tick : memory.seasonality.lastFailedTick,
    failedSeasonCount: failed
      ? Math.min(99, memory.seasonality.failedSeasonCount + 1)
      : memory.seasonality.failedSeasonCount,
  };
}

function updateActivityUseHistory(
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
  confidence: ResourceConfidenceProfile,
): ResourceUseHistory {
  const visited = effectType !== "none";
  const successfulUse = (record.physicalFoodHarvest?.usableSupport ?? 0) > 0;
  const failedUse = isFailureOutcome(record.activityOutcome);
  const previousYield = memory.useHistory.lastYieldEstimate;
  const nextYield = successfulUse || failedUse ? confidence.yieldConfidence : previousYield;

  return {
    ...memory.useHistory,
    visits: visited ? Math.min(999, memory.useHistory.visits + 1) : memory.useHistory.visits,
    successfulUses: successfulUse ? Math.min(999, memory.useHistory.successfulUses + 1) : memory.useHistory.successfulUses,
    failedUses: failedUse ? Math.min(999, memory.useHistory.failedUses + 1) : memory.useHistory.failedUses,
    lastUsedTick: successfulUse ? record.tick : memory.useHistory.lastUsedTick,
    lastYieldEstimate: round2(nextYield),
    yieldTrend: deriveActivityYieldTrend(previousYield, nextYield),
  };
}

function deriveActivityYieldTrend(previous: number, next: number): ResourceUseHistory["yieldTrend"] {
  if (next > previous + 0.03) {
    return "rising";
  }

  if (next < previous - 0.03) {
    return "declining";
  }

  return "flat";
}

function updateActivityRisk(
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
): ResourcePatchMemory["risk"] {
  if (effectType !== "risk_suspicion_added") {
    return memory.risk;
  }

  return {
    ...memory.risk,
    badWater: memory.risk.badWater || record.activityOutcome === "failed_due_to_water_risk",
    predatorOrAnimalRisk: record.activityOutcome === "abandoned_due_to_risk"
      ? round2(Math.min(0.85, memory.risk.predatorOrAnimalRisk + 0.05))
      : memory.risk.predatorOrAnimalRisk,
  };
}

function updateActivityPlantObservation(
  memory: ResourcePatchMemory,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
  reasonId: ReasonId,
): ResourcePatchMemory["plantObservation"] {
  if (effectType !== "plant_caution_refreshed" || memory.plantObservation === undefined) {
    return memory.plantObservation;
  }

  return {
    ...memory.plantObservation,
    observationCount: Math.min(99, memory.plantObservation.observationCount + 1),
    lastObservedTick: record.tick,
    trueValueHiddenFromBand: true,
    reasonIds: [...memory.plantObservation.reasonIds, reasonId].slice(-12),
  };
}

function updateActivityPatchLearningMemory(
  previous: ResourcePatchLearningMemory | undefined,
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
): ResourcePatchLearningMemory {
  const outcome = deriveActivityPatchLearningOutcome(record, effectType);
  const contradictionKind = deriveActivityPatchContradiction(record, effectType);
  const contradiction = isActivityMemoryContradiction(contradictionKind);
  const partial = contradictionKind === "partial_confirmation";
  const noInfo =
    contradictionKind === "repeated_no_new_information" ||
    contradictionKind === "memory_refreshed_without_confirmation";
  const falseInference = contradictionKind === "inferred_belief_unconfirmed";
  const seasonalMismatch = contradictionKind === "expected_seasonal_found_out_of_season";

  return {
    lastOutcome: outcome,
    lastContradictionKind: contradictionKind,
    lastOutcomeTick: record.tick,
    lastFailedTick: contradiction ? record.tick : previous?.lastFailedTick,
    confirmationCount: Math.min(
      999,
      (previous?.confirmationCount ?? 0) + (contradictionKind === "no_contradiction_confirmed" ? 1 : 0),
    ),
    contradictionCount: Math.min(999, (previous?.contradictionCount ?? 0) + (contradiction ? 1 : 0)),
    partialConfirmationCount: Math.min(999, (previous?.partialConfirmationCount ?? 0) + (partial ? 1 : 0)),
    noInfoCount: Math.min(999, (previous?.noInfoCount ?? 0) + (noInfo ? 1 : 0)),
    falseInferenceCount: Math.min(999, (previous?.falseInferenceCount ?? 0) + (falseInference ? 1 : 0)),
    seasonalMismatchCount: Math.min(999, (previous?.seasonalMismatchCount ?? 0) + (seasonalMismatch ? 1 : 0)),
  };
}

function deriveActivityPatchLearningOutcome(
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
): ResourcePatchLearningOutcome {
  if (effectType === "seasonality_hint_added") {
    return "confirmed_seasonal_absent";
  }

  if (effectType === "risk_suspicion_added") {
    return "safety_risk_detected";
  }

  if (effectType === "route_memory_refreshed") {
    return "route_improved_only";
  }

  if (effectType === "confidence_lowered") {
    return record.activityOutcome === "failed_due_to_distance" || record.activityOutcome === "delayed_return"
      ? "route_failed_or_blocked"
      : "belief_refuted";
  }

  if (effectType === "plant_caution_refreshed") {
    return "processing_need_suspected";
  }

  if (effectType === "water_reliability_refreshed" || effectType === "confidence_refreshed") {
    return record.activityOutcome === "partial_success" ? "confirmed_present" : "memory_refreshed_no_new_info";
  }

  return "memory_refreshed_no_new_info";
}

function deriveActivityPatchContradiction(
  record: IntraSeasonTripRecord,
  effectType: ActivityMemoryEffectType,
): ResourcePatchContradictionKind {
  if (effectType === "seasonality_hint_added") {
    return "expected_seasonal_found_out_of_season";
  }

  if (effectType === "risk_suspicion_added") {
    return record.activityOutcome === "failed_due_to_water_risk"
      ? "expected_water_refuge_unconfirmed"
      : "expected_accessible_found_costly";
  }

  if (effectType === "confidence_lowered") {
    return record.activityOutcome === "failed_due_to_distance" || record.activityOutcome === "delayed_return"
      ? "expected_accessible_found_costly"
      : "expected_present_found_absent";
  }

  if (effectType === "plant_caution_refreshed") {
    return "partial_confirmation";
  }

  if (effectType === "route_memory_refreshed") {
    return "memory_refreshed_without_confirmation";
  }

  if (record.activityOutcome === "partial_success") {
    return "partial_confirmation";
  }

  return "no_contradiction_confirmed";
}

function isActivityMemoryContradiction(kind: ResourcePatchContradictionKind): boolean {
  return kind !== "no_contradiction_confirmed" &&
    kind !== "partial_confirmation" &&
    kind !== "memory_refreshed_without_confirmation" &&
    kind !== "repeated_no_new_information";
}

function buildActivityMemoryEffectRecord(
  bandId: BandId,
  record: IntraSeasonTripRecord,
  before: ResourcePatchMemory,
  after: ResourcePatchMemory,
  effectType: ActivityMemoryEffectType,
  reasonId: ReasonId,
): ActivityMemoryEffectRecord {
  const beforeConfidence = snapshotActivityConfidence(before.confidence);
  const afterConfidence = snapshotActivityConfidence(after.confidence);
  const mainDelta = getMainActivityConfidenceDelta(beforeConfidence, afterConfidence);

  return {
    sourceBandId: bandId,
    sourceTripDay: record.day,
    tick: record.tick,
    season: record.season,
    targetTileId: record.targetTileId,
    patchId: before.patchId,
    resourceClassId: before.resourceClassId,
    activityOutcome: record.activityOutcome,
    effectType,
    effectSummary: summarizeActivityMemoryEffect(effectType, before, after, mainDelta.channel, mainDelta.delta),
    confidenceBefore: beforeConfidence,
    confidenceAfter: afterConfidence,
    mainConfidenceChannel: mainDelta.channel,
    confidenceDelta: mainDelta.delta,
    reasonIds: [reasonId],
    noHiddenTruth: true,
    targetKnownMemoryOnly: true,
    noNewResourceDiscovery: true,
    noFoodCoupling: true,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: true,
    noPopulationChange: true,
    noStressChange: true,
    noSupportChange: true,
  };
}

function createNoActivityMemoryEffect(
  bandId: BandId,
  day: DayNumber,
  tick: TickNumber,
  season: IntraSeasonTripRecord["season"],
  targetTileId: TileId,
  activityOutcome: IntraSeasonTripActivityResult,
  summary = "no activity memory update",
  memory?: ResourcePatchMemory,
): ActivityMemoryEffectRecord {
  return {
    sourceBandId: bandId,
    sourceTripDay: day,
    tick,
    season,
    targetTileId,
    patchId: memory?.patchId,
    resourceClassId: memory?.resourceClassId,
    activityOutcome,
    effectType: "none",
    effectSummary: summary,
    confidenceBefore: memory === undefined ? undefined : snapshotActivityConfidence(memory.confidence),
    confidenceAfter: memory === undefined ? undefined : snapshotActivityConfidence(memory.confidence),
    confidenceDelta: 0,
    reasonIds: [],
    noHiddenTruth: true,
    targetKnownMemoryOnly: true,
    noNewResourceDiscovery: true,
    noFoodCoupling: true,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: true,
    noPopulationChange: true,
    noStressChange: true,
    noSupportChange: true,
  };
}

function snapshotActivityConfidence(confidence: ResourceConfidenceProfile): ActivityMemoryConfidenceSnapshot {
  return {
    presenceConfidence: confidence.presenceConfidence,
    seasonConfidence: confidence.seasonConfidence,
    yieldConfidence: confidence.yieldConfidence,
    safetyConfidence: confidence.safetyConfidence,
    processingConfidence: confidence.processingConfidence,
    accessConfidence: confidence.accessConfidence,
    recoveryConfidence: confidence.recoveryConfidence,
  };
}

function getMainActivityConfidenceDelta(
  before: ActivityMemoryConfidenceSnapshot,
  after: ActivityMemoryConfidenceSnapshot,
): { readonly channel: ActivityMemoryConfidenceChannel; readonly delta: number } {
  const channels: readonly ActivityMemoryConfidenceChannel[] = [
    "presenceConfidence",
    "seasonConfidence",
    "yieldConfidence",
    "safetyConfidence",
    "processingConfidence",
    "accessConfidence",
    "recoveryConfidence",
  ];
  let channel = channels[0];
  let delta = round4(after[channel] - before[channel]);

  for (const candidate of channels.slice(1)) {
    const candidateDelta = round4(after[candidate] - before[candidate]);

    if (Math.abs(candidateDelta) > Math.abs(delta)) {
      channel = candidate;
      delta = candidateDelta;
    }
  }

  return { channel, delta };
}

function summarizeActivityMemoryEffect(
  effectType: ActivityMemoryEffectType,
  before: ResourcePatchMemory,
  after: ResourcePatchMemory,
  channel: ActivityMemoryConfidenceChannel,
  delta: number,
): string {
  return `${effectType}; ${String(before.patchId)}; ${channel} ${delta >= 0 ? "+" : ""}${round4(delta)}; state ${before.state}->${after.state}; memory_only_no_economy`;
}

function isActivityConfirmation(outcome: IntraSeasonTripActivityResult): boolean {
  return outcome === "successful_observation" ||
    outcome === "target_found" ||
    outcome === "partial_success" ||
    outcome === "returned_with_information";
}

function addUniqueSeason(seasons: readonly IntraSeasonTripRecord["season"][], season: IntraSeasonTripRecord["season"]): readonly IntraSeasonTripRecord["season"][] {
  return seasons.includes(season) ? seasons : [...seasons, season];
}

function deriveTaskGroupLabel(taskGroupType: IntraSeasonTripTaskGroupType): string {
  switch (taskGroupType) {
    case "hunting_group":
      return "Hunting group";
    case "fishing_group":
      return "Fishing group";
    case "plant_gathering_group":
      return "Plant gathering group";
    case "water_group":
      return "Water group";
    case "plant_followup_group":
      return "Plant follow-up group";
    case "memory_refresh_group":
      return "Memory refresh group";
    case "local_foraging_group":
      return "Local foraging group";
  }
}

function deriveObjectiveLabel(objective: IntraSeasonTripObjective): string {
  switch (objective) {
    case "local_exploitation":
      return "Local exploitation";
    case "water_security":
      return "Water security";
    case "food_patch_check":
      return "Food patch check";
    case "plant_followup_testing":
      return "Plant follow-up testing";
    case "memory_refresh":
      return "Memory refresh";
  }
}

function estimateTaskGroupPeople(band: Band, taskGroupType: IntraSeasonTripTaskGroupType): number {
  const adults = Math.max(1, Math.round(band.demography.workingAdults));
  const baseShare =
    taskGroupType === "water_group" || taskGroupType === "memory_refresh_group"
      ? 0.12
      : taskGroupType === "hunting_group" || taskGroupType === "plant_followup_group"
        ? 0.18
        : taskGroupType === "fishing_group" || taskGroupType === "plant_gathering_group"
          ? 0.22
          : 0.2;
  const cap =
    taskGroupType === "water_group" || taskGroupType === "memory_refresh_group"
      ? 4
      : taskGroupType === "hunting_group" || taskGroupType === "plant_followup_group"
        ? 6
        : 8;

  return Math.max(1, Math.min(cap, Math.round(adults * baseShare)));
}

function buildActivityLaborSummary(
  band: Band,
  latestTrip: IntraSeasonTripRecord,
  recentTrips: readonly IntraSeasonTripRecord[],
): ActivityLaborSummary {
  const workingAdults = Math.max(0, Math.round(band.demography.workingAdults));
  const totalPeople = Math.max(0, Math.round(band.demography.population));
  const day = latestTrip.day;
  const activeTrips = recentTrips
    .filter((trip) => isTripActiveOnDay(trip, day))
    .sort((left, right) => compareLaborTrips(left, right, day));
  let remainingAdults = workingAdults;
  let assignedPeople = 0;
  let awayPeople = 0;
  let impossibleOverAllocationCount = 0;
  const laborRecords: ActivityGroupLaborRecord[] = [];

  for (const trip of activeTrips) {
    const estimatedPeopleCount = Math.max(0, Math.round(trip.estimatedPeopleCount));
    const assignedPeopleEstimate = Math.min(estimatedPeopleCount, remainingAdults);
    const status = deriveLaborStatus(trip, day);

    if (assignedPeopleEstimate < estimatedPeopleCount) {
      impossibleOverAllocationCount += 1;
    }

    remainingAdults = Math.max(0, remainingAdults - assignedPeopleEstimate);
    assignedPeople += assignedPeopleEstimate;

    if (status !== "returned") {
      awayPeople += assignedPeopleEstimate;
    }

    laborRecords.push({
      sourceBandId: trip.sourceBandId,
      sourceTripDay: trip.day,
      sourceTripReasonIds: trip.reasonIds,
      taskGroupType: trip.taskGroupType,
      groupLabel: trip.groupLabel,
      objective: trip.objective,
      objectiveLabel: trip.objectiveLabel,
      targetTileId: trip.targetTileId,
      estimatedPeopleCount,
      assignedPeopleEstimate,
      status,
      outcome: trip.outcome,
      activityResult: trip.activityResult,
      activityOutcome: trip.activityOutcome,
      activityOutcomeSummary: trip.activityOutcomeSummary,
      resourceReturn: trip.resourceReturn,
      activityMemoryEffect: trip.activityMemoryEffect,
    });
  }

  const recentActivityGroupSummaries = [...laborRecords]
    .sort(compareLaborRecordsByRecency)
    .slice(0, RECENT_ACTIVITY_GROUP_SUMMARY_CAP);
  const physicalFoodConsumed = recentTrips.some((trip) => trip.resourceReturn.consumedByEconomy);

  return {
    bandId: band.id,
    day,
    tick: latestTrip.tick,
    season: latestTrip.season,
    totalPeople,
    workingAdults,
    activeActivityGroupCount: laborRecords.length,
    peopleAssignedToActivityGroups: assignedPeople,
    peopleAwayInActivityGroups: awayPeople,
    peopleAtResidentialCenterEstimate: Math.max(0, workingAdults - assignedPeople),
    peopleByActivityType: summarizePeopleByActivityType(laborRecords),
    latestActivityGroupSummary: recentActivityGroupSummaries[0],
    recentActivityGroupSummaries,
    cappedAllocation: impossibleOverAllocationCount > 0,
    impossibleOverAllocationCount,
    allocationConfidence: "estimated_only",
    noFoodCoupling: !physicalFoodConsumed,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: !physicalFoodConsumed,
    noPopulationChange: true,
    noStressChange: true,
  };
}

function buildActivityOutcomeSummary(
  band: Band,
  latestTrip: IntraSeasonTripRecord,
  recentTrips: readonly IntraSeasonTripRecord[],
): ActivityOutcomeSummary {
  const outcomesByType: ActivityOutcomeTypeCount[] = [];
  const outcomesByTaskType: ActivityOutcomeTaskTypeCount[] = [];
  const returnsByResourceKind: ActivityReturnResourceKindCount[] = [];
  let successCount = 0;
  let partialCount = 0;
  let failedCount = 0;
  let informationCount = 0;
  let noEffectCount = 0;
  let maxEstimatedReturnValue = 0;
  let physicalFoodConsumed = false;

  for (const trip of recentTrips) {
    incrementOutcomeCount(outcomesByType, trip.activityOutcome);
    incrementTaskOutcomeCount(outcomesByTaskType, trip.taskGroupType, trip.activityOutcome);
    incrementReturnKindCount(
      returnsByResourceKind,
      trip.resourceReturn.returnedResourceKind,
      trip.resourceReturn.estimatedReturnValue,
    );
    maxEstimatedReturnValue = Math.max(maxEstimatedReturnValue, trip.resourceReturn.estimatedReturnValue);
    physicalFoodConsumed ||= trip.resourceReturn.consumedByEconomy;

    if (isSuccessOutcome(trip.activityOutcome)) {
      successCount += 1;
    } else if (trip.activityOutcome === "partial_success") {
      partialCount += 1;
    } else if (isFailureOutcome(trip.activityOutcome)) {
      failedCount += 1;
    } else if (trip.activityOutcome === "returned_with_information") {
      informationCount += 1;
    } else if (trip.activityOutcome === "no_effect_observed") {
      noEffectCount += 1;
    }
  }

  return {
    bandId: band.id,
    day: latestTrip.day,
    tick: latestTrip.tick,
    season: latestTrip.season,
    outcomesByType: outcomesByType.sort((left, right) => left.outcome.localeCompare(right.outcome)),
    outcomesByTaskType: outcomesByTaskType.sort((left, right) =>
      left.taskGroupType === right.taskGroupType
        ? left.outcome.localeCompare(right.outcome)
        : left.taskGroupType.localeCompare(right.taskGroupType),
    ),
    returnsByResourceKind: returnsByResourceKind.sort((left, right) =>
      left.returnedResourceKind.localeCompare(right.returnedResourceKind),
    ),
    successCount,
    partialCount,
    failedCount,
    informationCount,
    noEffectCount,
    maxEstimatedReturnValue: round4(maxEstimatedReturnValue),
    consumedByEconomy: physicalFoodConsumed,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: !physicalFoodConsumed,
    noPopulationChange: true,
    noStressChange: true,
    noSupportChange: !physicalFoodConsumed,
  };
}

function buildActivityMemoryUpdateSummary(
  band: Band,
  latestTrip: IntraSeasonTripRecord,
  recentTrips: readonly IntraSeasonTripRecord[],
): ActivityMemoryUpdateSummary {
  const effects = recentTrips.map((trip) => trip.activityMemoryEffect);
  const effectCounts: ActivityMemoryEffectCount[] = [];
  const touchedPatchIds = new Set<ResourcePatchId>();
  let confidenceIncreaseTotal = 0;
  let confidenceDecreaseTotal = 0;
  let minConfidenceDelta = 0;
  let maxConfidenceDelta = 0;
  let sawDelta = false;

  for (const effect of effects) {
    incrementActivityMemoryEffectCount(effectCounts, effect.effectType);

    if (effect.effectType !== "none" && effect.patchId !== undefined) {
      touchedPatchIds.add(effect.patchId);
    }

    if (effect.confidenceDelta > 0) {
      confidenceIncreaseTotal += effect.confidenceDelta;
    } else if (effect.confidenceDelta < 0) {
      confidenceDecreaseTotal += effect.confidenceDelta;
    }

    if (!sawDelta || effect.confidenceDelta < minConfidenceDelta) {
      minConfidenceDelta = effect.confidenceDelta;
    }

    if (!sawDelta || effect.confidenceDelta > maxConfidenceDelta) {
      maxConfidenceDelta = effect.confidenceDelta;
    }

    sawDelta = true;
  }

  const recentMemoryEffects = effects
    .filter((effect) => effect.effectType !== "none")
    .slice(0, RECENT_ACTIVITY_MEMORY_EFFECT_CAP);

  return {
    bandId: band.id,
    day: latestTrip.day,
    tick: latestTrip.tick,
    season: latestTrip.season,
    effectCounts: effectCounts.sort((left, right) => left.effectType.localeCompare(right.effectType)),
    touchedMemoryCount: touchedPatchIds.size,
    confidenceIncreaseTotal: round4(confidenceIncreaseTotal),
    confidenceDecreaseTotal: round4(confidenceDecreaseTotal),
    minConfidenceDelta: round4(minConfidenceDelta),
    maxConfidenceDelta: round4(maxConfidenceDelta),
    latestMemoryEffect: recentMemoryEffects[0],
    recentMemoryEffects,
    noHiddenTruth: true,
    targetKnownMemoryOnly: true,
    noNewResourceDiscovery: true,
    noFoodCoupling: true,
    noYieldCoupling: true,
    noCarryingCapacityCoupling: true,
    noPopulationChange: true,
    noStressChange: true,
    noSupportChange: true,
  };
}

function incrementActivityMemoryEffectCount(
  counts: ActivityMemoryEffectCount[],
  effectType: ActivityMemoryEffectType,
): void {
  const index = counts.findIndex((entry) => entry.effectType === effectType);

  if (index === -1) {
    counts.push({ effectType, count: 1 });
    return;
  }

  counts[index] = { ...counts[index], count: counts[index].count + 1 };
}

function incrementOutcomeCount(
  counts: ActivityOutcomeTypeCount[],
  outcome: IntraSeasonTripActivityResult,
): void {
  const index = counts.findIndex((entry) => entry.outcome === outcome);

  if (index === -1) {
    counts.push({ outcome, count: 1 });
    return;
  }

  counts[index] = { ...counts[index], count: counts[index].count + 1 };
}

function incrementTaskOutcomeCount(
  counts: ActivityOutcomeTaskTypeCount[],
  taskGroupType: IntraSeasonTripTaskGroupType,
  outcome: IntraSeasonTripActivityResult,
): void {
  const index = counts.findIndex((entry) => entry.taskGroupType === taskGroupType && entry.outcome === outcome);

  if (index === -1) {
    counts.push({ taskGroupType, outcome, count: 1 });
    return;
  }

  counts[index] = { ...counts[index], count: counts[index].count + 1 };
}

function incrementReturnKindCount(
  counts: ActivityReturnResourceKindCount[],
  returnedResourceKind: ActivityReturnResourceKind,
  estimatedReturnValue: number,
): void {
  const index = counts.findIndex((entry) => entry.returnedResourceKind === returnedResourceKind);

  if (index === -1) {
    counts.push({
      returnedResourceKind,
      count: 1,
      estimatedReturnValueTotal: round4(estimatedReturnValue),
    });
    return;
  }

  counts[index] = {
    ...counts[index],
    count: counts[index].count + 1,
    estimatedReturnValueTotal: round4(counts[index].estimatedReturnValueTotal + estimatedReturnValue),
  };
}

function compareLaborRecordsByRecency(
  left: ActivityGroupLaborRecord,
  right: ActivityGroupLaborRecord,
): number {
  if (Number(right.sourceTripDay) !== Number(left.sourceTripDay)) {
    return Number(right.sourceTripDay) - Number(left.sourceTripDay);
  }

  return String(left.targetTileId).localeCompare(String(right.targetTileId));
}

function isTripActiveOnDay(trip: IntraSeasonTripRecord, day: DayNumber): boolean {
  const numericDay = Number(day);

  return Number(trip.startDay) <= numericDay && Number(trip.endDay) >= numericDay;
}

function compareLaborTrips(
  left: IntraSeasonTripRecord,
  right: IntraSeasonTripRecord,
  day: DayNumber,
): number {
  const leftPriority = getLaborStatusPriority(deriveLaborStatus(left, day));
  const rightPriority = getLaborStatusPriority(deriveLaborStatus(right, day));

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  if (Number(left.startDay) !== Number(right.startDay)) {
    return Number(left.startDay) - Number(right.startDay);
  }

  return String(left.targetTileId).localeCompare(String(right.targetTileId));
}

function deriveLaborStatus(
  trip: IntraSeasonTripRecord,
  day: DayNumber,
): ActivityGroupLaborStatus {
  if (trip.activityOutcome === "delayed_return") {
    return "delayed";
  }

  const numericDay = Number(day);

  if (trip.outcome === "continues") {
    return numericDay < Number(trip.endDay) ? "continuing" : "returned";
  }

  if (trip.outcome === "overnight") {
    return numericDay < Number(trip.endDay) ? "overnight" : "returned";
  }

  if (trip.outcome === "returns_same_day") {
    return "returned";
  }

  return "away";
}

function isSuccessOutcome(outcome: IntraSeasonTripActivityResult): boolean {
  return outcome === "successful_observation" || outcome === "target_found";
}

function isFailureOutcome(outcome: IntraSeasonTripActivityResult): boolean {
  return outcome === "target_not_found" ||
    outcome === "failed_due_to_distance" ||
    outcome === "failed_due_to_water_risk" ||
    outcome === "failed_due_to_low_memory_confidence" ||
    outcome === "failed_due_to_season_mismatch" ||
    outcome === "abandoned_due_to_risk";
}

function getLaborStatusPriority(status: ActivityGroupLaborStatus): number {
  switch (status) {
    case "continuing":
      return 0;
    case "overnight":
      return 1;
    case "delayed":
      return 2;
    case "away":
      return 3;
    case "returned":
      return 4;
  }
}

function summarizePeopleByActivityType(
  records: readonly ActivityGroupLaborRecord[],
): readonly ActivityTypeLaborAllocation[] {
  const byType: Partial<Record<IntraSeasonTripTaskGroupType, ActivityTypeLaborAllocation>> = {};

  for (const record of records) {
    const previous = byType[record.taskGroupType];
    byType[record.taskGroupType] = previous === undefined
      ? {
          taskGroupType: record.taskGroupType,
          groupCount: 1,
          assignedPeopleEstimate: record.assignedPeopleEstimate,
        }
      : {
          ...previous,
          groupCount: previous.groupCount + 1,
          assignedPeopleEstimate: previous.assignedPeopleEstimate + record.assignedPeopleEstimate,
        };
  }

  return Object.values(byType).sort((left, right) =>
    left.taskGroupType.localeCompare(right.taskGroupType),
  );
}

// A day-return loop fits inside one daily travel budget; longer round trips imply a
// night out or a multi-day foray. NONE of these move the residential marker — a
// `continues` trip is a task group ranging far while the camp stays fixed.
function classifyOutcome(estimatedDurationDays: number): IntraSeasonTripOutcome {
  if (estimatedDurationDays <= 1) {
    return "returns_same_day";
  }

  if (estimatedDurationDays === 2) {
    return "overnight";
  }

  return "continues";
}

function deriveMovementType(
  cause: IntraSeasonTripCause,
  outcome: IntraSeasonTripOutcome,
  distanceTiles: number,
): IntraSeasonTripMovementType {
  if (cause === "local_resource_use") {
    return "local_foraging_loop";
  }

  if (cause === "water_check") {
    return "water_trip";
  }

  if (cause === "plant_followup_test") {
    return "plant_followup_trip";
  }

  if (cause === "memory_refresh") {
    return "memory_refresh_trip";
  }

  // food_resource_check: a same-day short hop is a local foraging loop; a same-day
  // longer reach is a known-patch trip; an out-overnight one is a hunt/scout foray.
  if (outcome !== "returns_same_day") {
    return "overnight_hunt_or_scout";
  }

  return distanceTiles <= 2 ? "local_foraging_loop" : "food_patch_trip";
}

function deriveTaskGroupType(
  cause: IntraSeasonTripCause,
  resourceClassId: ResourceClassId,
): IntraSeasonTripTaskGroupType {
  if (cause === "water_check") {
    return "water_group";
  }

  if (cause === "plant_followup_test") {
    return "plant_followup_group";
  }

  if (cause === "memory_refresh") {
    return "memory_refresh_group";
  }

  if (cause === "local_resource_use") {
    return "local_foraging_group";
  }

  switch (resourceClassId) {
    case "animal_food":
      return "hunting_group";
    case "aquatic_food":
      return "fishing_group";
    case "generic_plant_food":
    case "fallback_food":
      return "plant_gathering_group";
    default:
      return "local_foraging_group";
  }
}

function deriveObjective(cause: IntraSeasonTripCause): IntraSeasonTripObjective {
  switch (cause) {
    case "water_check":
      return "water_security";
    case "food_resource_check":
      return "food_patch_check";
    case "plant_followup_test":
      return "plant_followup_testing";
    case "memory_refresh":
      return "memory_refresh";
    case "local_resource_use":
    default:
      return "local_exploitation";
  }
}

// Deterministic 4-neighbour staircase that hugs the straight line origin→target: at
// each step move the axis with more distance remaining (x wins ties). Each step is
// grid-distance 1 — the trip is logically NOT a teleport even if the UI compresses
// it; history preserves every crossed tile. Bounded by MAX_TRIP_DISTANCE_TILES + 1.
/**
 * REALISM-2B Part C — passability-aware activity breadcrumb.
 *
 * The earlier geometric (Bresenham) path stepped straight through water: ~26% of
 * trips ended STANDING on an aquatic tile because a water/aquatic target tile is
 * itself unwalkable. There is no boat/swim system, so an activity group must keep
 * to passable land:
 *   - a land target is aimed at directly;
 *   - an aquatic target (a water source) is a valid OBJECTIVE but not a stand tile,
 *     so we resolve the accessible shoreline tile nearest the origin and stand there;
 *   - the route is a contiguous (4-adjacent) shortest path over PASSABLE land only;
 *   - if no passable route exists, we return a single-tile (non-drawable) path rather
 *     than draw a fake water crossing.
 *
 * `targetTileId`/`distanceTiles`/`roundTripTiles` (and therefore the shadow economy)
 * are unchanged — only the drawn breadcrumb `pathTiles`/`tilesCrossed` become honest.
 */
function buildOutboundPathTiles(
  world: WorldState,
  originTileId: TileId,
  targetTileId: TileId,
): readonly TileId[] {
  const origin = world.tiles[originTileId];
  const target = world.tiles[targetTileId];

  if (origin === undefined || target === undefined) {
    return [originTileId];
  }

  const aimTile = isBandPassableDestination(target)
    ? target
    : resolveShoreApproachTile(world, origin, target) ?? origin;

  if (aimTile.id === originTileId) {
    return [originTileId];
  }

  return findPassablePath(world, origin, aimTile) ?? [originTileId];
}

/**
 * The accessible shoreline/land tile adjacent to a water target, nearest the origin
 * (deterministic tile-id tie-break). Undefined when the water source has no passable
 * 4-neighbour at all (fully enclosed water) → the trip is target-inaccessible.
 */
function resolveShoreApproachTile(world: WorldState, origin: Tile, target: Tile): Tile | undefined {
  let best: Tile | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const neighborId of target.neighbors) {
    const neighbor = world.tiles[neighborId];

    if (neighbor === undefined || getGridDistance(target, neighbor) !== 1 || !isBandPassableDestination(neighbor)) {
      continue;
    }

    const distance = getGridDistance(origin, neighbor);

    if (
      best === undefined ||
      distance < bestDistance ||
      (distance === bestDistance && String(neighbor.id) < String(best.id))
    ) {
      best = neighbor;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Deterministic breadth-first shortest contiguous path over 4-adjacent PASSABLE land
 * tiles from origin to aim. The aim tile is always enterable (it is already passable
 * land — a land target or a resolved shoreline). Returns undefined when no passable
 * route exists within a bounded neighbourhood.
 */
function findPassablePath(world: WorldState, origin: Tile, aim: Tile): readonly TileId[] | undefined {
  const maxExplored = (MAX_TRIP_DISTANCE_TILES * 2 + 4) ** 2;
  const cameFrom = new Map<TileId, TileId>();
  const visited = new Set<TileId>([origin.id]);
  let frontier: Tile[] = [origin];
  let explored = 0;

  while (frontier.length > 0 && explored < maxExplored) {
    const next: Tile[] = [];

    for (const tile of frontier) {
      explored += 1;

      if (tile.id === aim.id) {
        return reconstructPassablePath(cameFrom, origin.id, aim.id);
      }

      const neighbors = [...tile.neighbors].sort((left, right) => String(left).localeCompare(String(right)));

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) {
          continue;
        }

        const neighbor = world.tiles[neighborId];

        if (neighbor === undefined || getGridDistance(tile, neighbor) !== 1) {
          continue;
        }

        if (neighbor.id !== aim.id && !isBandPassableDestination(neighbor)) {
          continue;
        }

        visited.add(neighborId);
        cameFrom.set(neighborId, tile.id);
        next.push(neighbor);
      }
    }

    frontier = next;
  }

  return undefined;
}

function reconstructPassablePath(
  cameFrom: ReadonlyMap<TileId, TileId>,
  originId: TileId,
  aimId: TileId,
): readonly TileId[] {
  const reversed: TileId[] = [aimId];
  let current = aimId;

  while (current !== originId) {
    const previous = cameFrom.get(current);

    if (previous === undefined) {
      break;
    }

    reversed.push(previous);
    current = previous;
  }

  reversed.reverse();

  return reversed;
}

function isActiveBand(band: Band): boolean {
  return (
    band.status !== "dispersed" &&
    band.viability?.status !== "absorbed" &&
    band.viability?.status !== "extinct"
  );
}

function isFoodClass(classId: ResourceClassId): boolean {
  return classId === "generic_plant_food" || classId === "aquatic_food" || classId === "animal_food" || classId === "fallback_food";
}

function getCauseWeight(cause: IntraSeasonTripCause): number {
  switch (cause) {
    case "local_resource_use":
      return 0.58;
    case "water_check":
      return 0.82;
    case "food_resource_check":
      return 0.72;
    case "plant_followup_test":
      return 0.66;
    case "memory_refresh":
    default:
      return 0.52;
  }
}

function getRepeatTargetSuppressionDays(cause: IntraSeasonTripCause): number {
  switch (cause) {
    case "water_check":
      return 6;
    case "local_resource_use":
      return 6;
    case "food_resource_check":
      return 12;
    case "memory_refresh":
      return 21;
    case "plant_followup_test":
    default:
      return 30;
  }
}

function getGridDistance(left: Tile, right: Tile): number {
  return Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.y - right.coord.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}
