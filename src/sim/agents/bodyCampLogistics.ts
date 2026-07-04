import type { BandId, ReasonId, Season, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { WorldState } from "../world/types";
import type {
  Band,
  BodyCampLogisticsBehavior,
  BodyCampLogisticsMode,
  BodyCampSurvivalLogisticsState,
  CampCleanlinessState,
  CareTravelBurdenState,
  FireUseState,
  FoodSharingPressureState,
  LogisticCapacityState,
  MaterialWearCategory,
  MaterialWearRecord,
  OpportunisticFoodCandidate,
  SeasonalTaskPriority,
  SicknessCauseKind,
  SicknessWaveState,
  WeatherMemoryKind,
  WeatherMemoryRecord,
  WeatherMemoryTrend,
} from "./types";
import type { ResourceStorageSuitabilityCard } from "./storageSuitability";

const WEATHER_MEMORY_CAP = 5;
const MATERIAL_WEAR_CAP = 7;
const OPPORTUNISTIC_FOOD_CAP = 5;
const SEASONAL_TASK_CAP = 5;
const MAX_BEHAVIOR_HOOK = 0.18;

interface WeatherDraft {
  readonly kind: WeatherMemoryKind;
  readonly strength: number;
  readonly routeCaution: number;
  readonly fireNeed: number;
  readonly childElderRisk: number;
  readonly source: string;
  readonly reasonIds: readonly ReasonId[];
}

interface LoadSignals {
  readonly adults: number;
  readonly dependents: number;
  readonly elders: number;
  readonly population: number;
  readonly dependentShare: number;
  readonly elderShare: number;
  readonly adultLaborShare: number;
  readonly dependencyLoad: number;
  readonly hunger: number;
  readonly waterStress: number;
  readonly fatigue: number;
  readonly localUsePressure: number;
  readonly recoverySignal: number;
  readonly supportReasonIds: readonly ReasonId[];
}

export function applyBodyCampSurvivalLogisticsContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((bandsById, band) => {
      bandsById[String(band.id)] = {
        ...band,
        bodyCampLogistics: deriveBodyCampSurvivalLogistics(world, band),
      };

      return bandsById;
    }, {});

  return {
    ...world,
    bands: bands as Readonly<Record<BandId, Band>>,
  };
}

export function deriveBodyCampSurvivalLogistics(
  world: WorldState,
  band: Band,
): BodyCampSurvivalLogisticsState {
  const loads = deriveLoadSignals(band);
  const cards = band.resourceEcology?.storageSuitabilityCards ?? [];
  const reasonSeed = makeLogisticsReasonId(band.id, world.time.tick, "current");
  const weatherMemories = deriveWeatherMemories(world, band, loads);
  const campCleanliness = deriveCampCleanliness(world, band, cards, loads);
  const fire = deriveFireUseState(world, band, cards, weatherMemories, campCleanliness, loads);
  const sickness = deriveSicknessWaveState(world, band, cards, weatherMemories, campCleanliness, loads);
  const careTravelBurden = deriveCareTravelBurden(world, band, sickness, weatherMemories, loads);
  const materialWear = deriveMaterialWear(world, band, cards, weatherMemories, fire, loads);
  const logisticCapacity = deriveLogisticCapacity(world, band, cards, careTravelBurden, sickness, materialWear, loads);
  const opportunisticFoodCandidates = deriveOpportunisticFoodCandidates(world, band, sickness, loads);
  const sharingPressure = deriveSharingPressure(band, sickness, logisticCapacity, loads);
  const seasonalTasks = deriveSeasonalTasks(world, band, cards, fire, sickness, campCleanliness, materialWear, opportunisticFoodCandidates, loads);
  const behavior = deriveBehavior(weatherMemories, fire, sickness, careTravelBurden, logisticCapacity, materialWear, campCleanliness, sharingPressure, opportunisticFoodCandidates);
  const mode = deriveMode(weatherMemories, sickness, careTravelBurden, logisticCapacity, campCleanliness, behavior, loads);
  const reasonIds = uniqueReasonIds([
    reasonSeed,
    ...weatherMemories.flatMap((memory) => memory.sourceReasonIds),
    ...fire.reasonIds,
    ...sickness.reasonIds,
    ...careTravelBurden.reasonIds,
    ...logisticCapacity.reasonIds,
    ...materialWear.flatMap((wear) => wear.reasonIds),
    ...opportunisticFoodCandidates.flatMap((candidate) => candidate.reasonIds),
    ...sharingPressure.reasonIds,
    ...campCleanliness.reasonIds,
    ...seasonalTasks.flatMap((task) => task.reasonIds),
  ]).slice(0, 24);
  const capsHeld =
    weatherMemories.length <= WEATHER_MEMORY_CAP &&
    materialWear.length <= MATERIAL_WEAR_CAP &&
    opportunisticFoodCandidates.length <= OPPORTUNISTIC_FOOD_CAP &&
    seasonalTasks.length <= SEASONAL_TASK_CAP;

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    mode,
    weatherMemories,
    fire,
    sickness,
    careTravelBurden,
    logisticCapacity,
    materialWear,
    opportunisticFoodCandidates,
    sharingPressure,
    campCleanliness,
    seasonalTasks,
    behavior,
    caps: {
      weatherMemoryCap: WEATHER_MEMORY_CAP,
      materialWearCap: MATERIAL_WEAR_CAP,
      opportunisticFoodCap: OPPORTUNISTIC_FOOD_CAP,
      seasonalTaskCap: SEASONAL_TASK_CAP,
    },
    antiOmniscience: {
      fromBandKnownInputsOnly: true,
      hiddenResourceTruthUsed: false,
      hiddenBandTruthUsed: false,
      hiddenWeatherTruthUsed: false,
    },
    capsHeld,
    noCultureSystem: true,
    noReligionMyth: true,
    noAgriculture: true,
    noVillageSedentism: true,
    noStorageEconomy: true,
    noPropertyLawTerritoryWar: true,
    noNamedPeople: true,
    reasonIds,
  };
}

function deriveLoadSignals(band: Band): LoadSignals {
  const population = Math.max(1, Math.round(band.demography.population));
  const adults = Math.max(0, band.demography.workingAdults);
  const dependents = Math.max(0, band.demography.dependents);
  const elders = Math.max(0, band.demography.elders);
  const dependentShare = clamp01(dependents / population);
  const elderShare = clamp01(elders / population);
  const adultLaborShare = clamp01(adults / population);
  const support = band.seasonalSupport;
  const pressure = band.pressureState;
  const hunger = clamp01(Math.max(
    pressure?.foodStress ?? 0,
    band.foragingAdaptation?.hungerSeverity ?? 0,
    support?.currentSeasonSupport.foodStress ?? 0,
    support?.hungerClassification === "crisis_deficit" ? 0.74 : 0,
    support?.hungerClassification === "chronic_plus_seasonal_stress" ? 0.58 : 0,
    support?.hungerClassification === "seasonal_lean_stress" ? 0.38 : 0,
  ));
  const waterStress = clamp01(Math.max(
    pressure?.waterStress ?? 0,
    support?.currentSeasonSupport.waterStress ?? 0,
    support?.hungerClassification === "chronic_water_deficit" ? 0.68 : 0,
    support?.hungerClassification === "seasonal_water_stress" ? 0.42 : 0,
  ));
  const fatigue = clamp01(pressure?.fatiguePressure ?? 0);
  const localUsePressure = clamp01(
    (band.usePressure[band.position]?.recentUseIntensity ?? 0) * 0.32 +
      (band.usePressure[band.position]?.foragingPressure ?? 0) * 0.28 +
      (band.usePressure[band.position]?.waterPressure ?? 0) * 0.22 +
      (band.usePressure[band.position]?.aquaticPressure ?? 0) * 0.18,
  );
  const recoverySignal = clamp01(Math.max(
    band.foragingAdaptation?.recoverySignal ?? 0,
    support?.hungerClassification === "seasonal_pulse_recovery" ? 0.5 : 0,
    pressure !== undefined && pressure.foodStress < 0.2 && pressure.waterStress < 0.2 ? 0.22 : 0,
  ));
  const dependencyLoad = clamp01(dependentShare * 0.72 + elderShare * 0.48 + Math.max(0, 0.42 - adultLaborShare) * 0.38);

  return {
    adults,
    dependents,
    elders,
    population,
    dependentShare: round2(dependentShare),
    elderShare: round2(elderShare),
    adultLaborShare: round2(adultLaborShare),
    dependencyLoad: round2(dependencyLoad),
    hunger: round2(hunger),
    waterStress: round2(waterStress),
    fatigue: round2(fatigue),
    localUsePressure: round2(localUsePressure),
    recoverySignal: round2(recoverySignal),
    supportReasonIds: support?.reasonIds ?? band.demography.sourceReasonIds,
  };
}

function deriveWeatherMemories(
  world: WorldState,
  band: Band,
  loads: LoadSignals,
): readonly WeatherMemoryRecord[] {
  const drafts: WeatherDraft[] = [];
  const currentTile = world.tiles[band.position];

  for (const episode of band.acuteRisk?.recentEpisodes ?? []) {
    const age = Math.max(0, Number(world.time.tick) - Number(episode.tick));
    const freshness = clamp01(1 - age / 18);
    if (freshness <= 0.08 && episode.remainingRecoverySeasons <= 0) {
      continue;
    }
    const strength = clamp01(severityValue(episode.severity) * 0.72 + freshness * 0.24 + episode.effect.movementCautionBump * 0.2);
    if (episode.kind === "exposure_or_cold_snap") {
      drafts.push(weatherDraft("cold_exposure", strength, strength * 0.72, strength * 0.84, strength * 0.68, "recent acute cold/exposure episode", episode.reasonIds));
    } else if (episode.kind === "heat_or_drought_exhaustion") {
      drafts.push(weatherDraft("heat_drought", strength, strength * 0.7, strength * 0.18, strength * 0.58, "recent heat/drought hardship episode", episode.reasonIds));
    } else if (episode.kind === "bad_water_sickness") {
      drafts.push(weatherDraft("dry_water_stress", strength * 0.82, strength * 0.5, 0.08, strength * 0.3, "bad-water sickness made dry water routes memorable", episode.reasonIds));
    } else if (episode.kind === "aquatic_accident" || episode.kind === "travel_accident") {
      drafts.push(weatherDraft("bad_crossing_season", strength * 0.78, strength * 0.82, strength * 0.28, strength * 0.62, "recent route or water crossing accident", episode.reasonIds));
    }
  }

  for (const move of band.recentResidentialMoveEvents ?? []) {
    const age = Math.max(0, Number(world.time.tick) - Number(move.tick));
    const freshness = clamp01(1 - age / 24);
    const hardshipRisk = move.hardshipRisk ?? 0;
    const hardshipReason = move.hardshipReason ?? "";
    const moveStrength = clamp01(hardshipRisk * 0.72 + freshness * 0.18);
    if (moveStrength < 0.16) {
      continue;
    }
    if (move.temporaryWatercraft !== undefined || hardshipReason.includes("crossing")) {
      drafts.push(weatherDraft("bad_crossing_season", moveStrength, moveStrength * 0.78, move.temporaryWatercraft?.seasonExposureRisk ?? 0.22, moveStrength * 0.68, "whole-band crossing or route hardship record", move.reasonIds));
    }
    if (move.season === "winter" || hardshipReason.includes("cold")) {
      drafts.push(weatherDraft("cold_exposure", moveStrength * 0.82, moveStrength * 0.58, moveStrength * 0.78, moveStrength * 0.66, "winter move hardship record", move.reasonIds));
    }
    if (move.season === "summer" || hardshipReason.includes("water")) {
      drafts.push(weatherDraft("heat_drought", moveStrength * 0.7, moveStrength * 0.54, moveStrength * 0.12, moveStrength * 0.46, "hot or thirsty move hardship record", move.reasonIds));
    }
  }

  if (world.time.season === "winter" && (loads.fatigue >= 0.24 || loads.dependencyLoad >= 0.32)) {
    drafts.push(weatherDraft("cold_exposure", clamp01(0.24 + loads.fatigue * 0.32 + loads.dependencyLoad * 0.22), 0.26, 0.44, 0.38, "winter plus care/fatigue burden", loads.supportReasonIds));
  }
  if (world.time.season === "summer" && loads.waterStress >= 0.28) {
    drafts.push(weatherDraft("heat_drought", clamp01(0.22 + loads.waterStress * 0.55), 0.34, 0.08, 0.28, "summer water stress", loads.supportReasonIds));
  }
  if (loads.waterStress >= 0.5) {
    drafts.push(weatherDraft("dry_water_stress", clamp01(loads.waterStress * 0.76), 0.36, 0.06, 0.25, "dry-season water pressure memory", loads.supportReasonIds));
  }
  if (currentTile !== undefined && (currentTile.terrainKind === "wetlands" || currentTile.biomeKind === "marsh" || currentTile.biomeKind === "floodplain")) {
    const wetStrength = clamp01(0.16 + currentTile.resourceProfile.waterAccess * 0.22 + currentTile.riskProfile.diseaseRisk * 0.28 + loads.localUsePressure * 0.12);
    drafts.push(weatherDraft("floodplain_wetland", wetStrength, wetStrength * 0.36, wetStrength * 0.28, wetStrength * 0.26, "known wetland/floodplain camp cue", [
      makeLogisticsReasonId(band.id, world.time.tick, "wetland", band.position),
    ]));
  }

  const priorByKind = new Map<WeatherMemoryKind, WeatherMemoryRecord>();
  for (const memory of band.bodyCampLogistics?.weatherMemories ?? []) {
    priorByKind.set(memory.kind, memory);
  }
  const merged = new Map<WeatherMemoryKind, WeatherMemoryRecord>();
  for (const draft of drafts) {
    const prior = priorByKind.get(draft.kind);
    const oldStrength = prior?.strength ?? 0;
    const strength = clamp01(Math.max(draft.strength, oldStrength * 0.82 + draft.strength * 0.28));
    const trend: WeatherMemoryTrend =
      prior === undefined ? "forming" :
      strength > prior.strength + 0.03 ? "reinforced" :
      "fading";
    merged.set(draft.kind, {
      kind: draft.kind,
      strength: round2(strength),
      staleness: round2(clamp01((prior?.staleness ?? 0.2) * 0.5)),
      trend,
      routeCaution: round2(clamp01(draft.routeCaution + strength * 0.18)),
      fireNeed: round2(clamp01(draft.fireNeed + strength * 0.12)),
      childElderRisk: round2(clamp01(draft.childElderRisk + loads.dependencyLoad * 0.18)),
      source: draft.source,
      sourceReasonIds: draft.reasonIds.slice(0, 8),
    });
  }
  for (const prior of priorByKind.values()) {
    if (merged.has(prior.kind)) {
      continue;
    }
    const faded = clamp01(prior.strength * (loads.recoverySignal >= 0.34 ? 0.48 : 0.68));
    if (faded < 0.12) {
      continue;
    }
    merged.set(prior.kind, {
      ...prior,
      strength: round2(faded),
      staleness: round2(clamp01(prior.staleness + 0.18 + loads.recoverySignal * 0.2)),
      trend: loads.recoverySignal >= 0.34 ? "recovered" : "fading",
      routeCaution: round2(clamp01(prior.routeCaution * 0.76)),
      fireNeed: round2(clamp01(prior.fireNeed * 0.78)),
      childElderRisk: round2(clamp01(prior.childElderRisk * 0.78)),
    });
  }

  return [...merged.values()]
    .sort(compareWeatherMemories)
    .slice(0, WEATHER_MEMORY_CAP);
}

function deriveFireUseState(
  world: WorldState,
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
  weatherMemories: readonly WeatherMemoryRecord[],
  cleanliness: CampCleanlinessState,
  loads: LoadSignals,
): FireUseState {
  const forestFuel = Math.max(0, ...(band.visibleNature?.forestCards ?? []).map((card) =>
    card.woodFuelMaterialHook * card.confidence * (1 - card.pressure * 0.4),
  ));
  const storageFuel = Math.max(0, ...cards.filter(isFuelOrWoodCard).map((card) => card.storageConfidence));
  const fiberBasis = Math.max(0, ...cards.filter((card) => card.classId === "reeds_fibers" || card.crossingMaterialUse === "fiber_lashing").map((card) => card.storageConfidence * 0.45));
  const fuelBasis = clamp01(Math.max(forestFuel, storageFuel, fiberBasis * 0.55));
  const materialConfidence = clamp01(Math.max(fuelBasis, forestFuel * 0.8, storageFuel * 0.9));
  const coldNeed = Math.max(0, ...weatherMemories.filter((memory) => memory.kind === "cold_exposure" || memory.kind === "wet_travel").map((memory) => memory.fireNeed));
  const processingNeed = Math.max(0, ...cards.filter((card) =>
    card.smokingSuitability !== "none" ||
    card.dryingSuitability === "good" ||
    card.dryingSuitability === "excellent" ||
    card.processingLabor === "high" ||
    card.spoilageRisk === "high"
  ).map((card) =>
    card.storageConfidence *
      (burdenValue(card.processingLabor) * 0.28 + burdenValue(card.spoilageRisk) * 0.32 + (card.smokingSuitability === "good" ? 0.18 : 0)),
  ));
  const winterNeed = world.time.season === "winter" ? 0.32 : 0;
  const wetNeed = Math.max(0, ...weatherMemories.filter((memory) => memory.kind === "floodplain_wetland").map((memory) => memory.strength * 0.3));
  const need = clamp01(Math.max(coldNeed, winterNeed, wetNeed, processingNeed * 0.55, cleanliness.pressure * 0.18));
  const warmthValue = clamp01((coldNeed + winterNeed + wetNeed) * materialConfidence);
  const processingValue = clamp01(processingNeed * materialConfidence);
  const smokeDeterrenceValue = clamp01(Math.max(cleanliness.scavengerPressure, cleanliness.wetCampLoad * 0.4) * materialConfidence);
  const fuelPressure = clamp01(loads.localUsePressure * 0.32 + Math.max(0, 0.48 - fuelBasis) * 0.5 + Math.max(0, forestFuel - 0.42) * 0.18);
  const laborCost = clamp01(need * 0.28 + fuelPressure * 0.34 + processingNeed * 0.22);
  const dryHeat = weatherMemories.find((memory) => memory.kind === "heat_drought" || memory.kind === "dry_water_stress")?.strength ?? 0;
  const currentTile = world.tiles[band.position];
  const aridity = currentTile?.riskProfile.droughtRisk ?? world.climateRegime.aridity;
  const fireRisk = round2(clamp01(dryHeat * 0.34 + aridity * 0.28 + fuelPressure * 0.16 + (world.time.season === "summer" ? 0.08 : 0)));
  const usefulness = round2(clamp01(warmthValue * 0.38 + processingValue * 0.36 + smokeDeterrenceValue * 0.16 - laborCost * 0.12 - fireRisk * 0.08));
  const status =
    need < 0.18 && usefulness < 0.14 ? "not_relevant" :
    fireRisk >= 0.58 ? "risky" :
    fuelBasis < 0.24 && need >= 0.22 ? "limited_by_fuel" :
    laborCost >= 0.48 ? "strained" :
    "useful";
  const reasonIds = uniqueReasonIds([
    ...weatherMemories.flatMap((memory) => memory.sourceReasonIds),
    ...(band.resourceEcology?.reasonIds ?? []),
    ...(band.visibleNature?.reasonIds ?? []),
    makeLogisticsReasonId(band.id, world.time.tick, "fire", band.position),
  ]).slice(0, 10);

  return {
    status,
    need: round2(need),
    usefulness,
    fuelBasis: round2(fuelBasis),
    materialConfidence: round2(materialConfidence),
    warmthValue: round2(warmthValue),
    processingValue: round2(processingValue),
    smokeDeterrenceValue: round2(smokeDeterrenceValue),
    fuelPressure: round2(fuelPressure),
    laborCost: round2(laborCost),
    fireRisk,
    reasonIds,
    noPermanentHearth: true,
    noTechnologyTree: true,
  };
}

function deriveSicknessWaveState(
  world: WorldState,
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
  weatherMemories: readonly WeatherMemoryRecord[],
  cleanliness: CampCleanlinessState,
  loads: LoadSignals,
): SicknessWaveState {
  const causes: SicknessCauseKind[] = [];
  const reasonIds: ReasonId[] = [];
  let severity = 0;

  for (const episode of band.acuteRisk?.recentEpisodes ?? []) {
    if (episode.kind === "bad_water_sickness") {
      causes.push("bad_water");
      severity = Math.max(severity, severityValue(episode.severity) * 0.76);
      reasonIds.push(...episode.reasonIds);
    } else if (episode.kind === "spoiled_or_risky_food_sickness") {
      causes.push("spoiled_food");
      severity = Math.max(severity, severityValue(episode.severity) * 0.74);
      reasonIds.push(...episode.reasonIds);
    } else if (episode.kind === "plant_poisoning_or_irritation") {
      causes.push("risky_fallback_food");
      severity = Math.max(severity, severityValue(episode.severity) * 0.68);
      reasonIds.push(...episode.reasonIds);
    } else if (episode.kind === "exposure_or_cold_snap") {
      causes.push("cold_exposure");
      severity = Math.max(severity, severityValue(episode.severity) * 0.42);
      reasonIds.push(...episode.reasonIds);
    } else if (episode.kind === "heat_or_drought_exhaustion") {
      causes.push("heat_stress");
      severity = Math.max(severity, severityValue(episode.severity) * 0.46);
      reasonIds.push(...episode.reasonIds);
    }
  }

  const spoilage = Math.max(0, ...cards.map((card) => burdenValue(card.spoilageRisk) * card.storageConfidence * (card.perishability === "high" ? 1 : 0.55)));
  if (spoilage >= 0.28) {
    causes.push("spoiled_food");
    severity = Math.max(severity, spoilage * 0.48);
    reasonIds.push(...(band.resourceEcology?.reasonIds.slice(0, 4) ?? []));
  }
  const riskyFallback = Math.max(0, ...(band.foragingAdaptation?.fallbackCandidates ?? []).map((candidate) => candidate.riskCost * candidate.expectedUsefulness));
  if (riskyFallback >= 0.16) {
    causes.push("risky_fallback_food");
    severity = Math.max(severity, riskyFallback * 0.72);
    reasonIds.push(...(band.foragingAdaptation?.reasonIds.slice(0, 4) ?? []));
  }
  if (cleanliness.pressure >= 0.38) {
    causes.push("camp_waste");
    severity = Math.max(severity, cleanliness.pressure * 0.58);
    reasonIds.push(...cleanliness.reasonIds);
  }
  if (loads.dependencyLoad >= 0.46 && loads.localUsePressure >= 0.32) {
    causes.push("crowding");
    severity = Math.max(severity, (loads.dependencyLoad + loads.localUsePressure) * 0.22);
    reasonIds.push(...loads.supportReasonIds);
  }
  if (loads.hunger >= 0.5) {
    causes.push("poor_diet");
    severity = Math.max(severity, loads.hunger * 0.32);
    reasonIds.push(...loads.supportReasonIds);
  }
  if (weatherMemories.some((memory) => memory.kind === "floodplain_wetland" && memory.strength >= 0.28)) {
    causes.push("wetland_insects");
    severity = Math.max(severity, (weatherMemories.find((memory) => memory.kind === "floodplain_wetland")?.strength ?? 0) * 0.38);
    reasonIds.push(...weatherMemories.flatMap((memory) => memory.sourceReasonIds));
  }

  const prior = band.bodyCampLogistics?.sickness;
  const recoverySignal = clamp01(loads.recoverySignal + (cleanliness.recovery * 0.2) + (severity < (prior?.severity ?? 0) ? 0.12 : 0));
  const fadedPrior = prior === undefined ? 0 : clamp01(prior.severity * (recoverySignal >= 0.34 ? 0.45 : 0.68));
  const finalSeverity = round2(clamp01(Math.max(severity, fadedPrior)));
  const active = finalSeverity >= 0.18;
  const durationEstimate =
    !active ? "none" :
    finalSeverity >= 0.62 ? "season_background" :
    finalSeverity >= 0.38 ? "several_days" :
    "short";

  return {
    active,
    severity: finalSeverity,
    durationEstimate,
    recoverySignal: round2(recoverySignal),
    causeKinds: uniqueSicknessCauses(causes).slice(0, 6),
    activityPenalty: round2(clamp01(finalSeverity * 0.42)),
    careBurden: round2(clamp01(finalSeverity * (0.34 + loads.dependencyLoad * 0.24))),
    travelCaution: round2(clamp01(finalSeverity * 0.38 + loads.dependencyLoad * 0.12)),
    mortalityPressureBump: round2(clamp01(finalSeverity * 0.08)),
    fertilitySuppressionBump: round2(clamp01(finalSeverity * 0.1)),
    reasonIds: uniqueReasonIds([...reasonIds, makeLogisticsReasonId(band.id, world.time.tick, "sickness", band.position)]).slice(0, 12),
    bounded: true,
    noNamedSickPeople: true,
    noSuddenMassDeath: true,
  };
}

function deriveCareTravelBurden(
  world: WorldState,
  band: Band,
  sickness: SicknessWaveState,
  weatherMemories: readonly WeatherMemoryRecord[],
  loads: LoadSignals,
): CareTravelBurdenState {
  const latestBirths = band.demography.lastBirths ?? 0;
  const fertilityPressure = band.demography.fertilityPressure ?? 0;
  const nursingBurden = clamp01(Math.min(0.34, latestBirths * 0.08) + fertilityPressure * 0.14 + loads.dependentShare * 0.12);
  const crossing = (band.recentResidentialMoveEvents ?? [])[0]?.temporaryWatercraft;
  const crossingBurden = crossing === undefined
    ? 0
    : clamp01(crossing.dependents / Math.max(1, loads.population) * 0.42 + crossing.elders / Math.max(1, loads.population) * 0.34 + crossing.shuttleTrips / 12 + crossing.seasonExposureRisk * 0.28);
  const longMoveBurden = Math.max(0, ...(band.recentResidentialMoveEvents ?? []).map((move) =>
    clamp01(move.distanceTiles / 18 * 0.34 + (move.hardshipRisk ?? 0) * 0.52),
  ));
  const childElderWeather = Math.max(0, ...weatherMemories.map((memory) => memory.childElderRisk));
  const adultLaborAvailable = clamp01(loads.adultLaborShare - sickness.careBurden * 0.18 - nursingBurden * 0.12);

  return {
    dependentCarryBurden: round2(clamp01(loads.dependentShare * 0.78 + loads.hunger * 0.08)),
    elderTravelCaution: round2(clamp01(loads.elderShare * 0.72 + childElderWeather * 0.28)),
    pregnancyNursingBurden: round2(nursingBurden),
    sickCareBurden: sickness.careBurden,
    wholeBandCrossingBurden: round2(crossingBurden),
    longMoveBurden: round2(longMoveBurden),
    coldHeatVulnerability: round2(childElderWeather),
    adultLaborAvailable: round2(adultLaborAvailable),
    reasonIds: uniqueReasonIds([
      ...band.demography.sourceReasonIds,
      ...sickness.reasonIds,
      ...weatherMemories.flatMap((memory) => memory.sourceReasonIds),
      ...((band.recentResidentialMoveEvents ?? [])[0]?.reasonIds ?? []),
      makeLogisticsReasonId(band.id, world.time.tick, "care", band.position),
    ]).slice(0, 12),
    aggregateOnly: true,
  };
}

function deriveMaterialWear(
  world: WorldState,
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
  weatherMemories: readonly WeatherMemoryRecord[],
  fire: FireUseState,
  loads: LoadSignals,
): readonly MaterialWearRecord[] {
  const tripCount = band.recentIntraSeasonTrips?.length ?? 0;
  const huntingTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) => trip.taskGroupType === "hunting_group").length;
  const fishingTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) => trip.taskGroupType === "fishing_group").length;
  const gatheringTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) => trip.taskGroupType === "plant_gathering_group" || trip.taskGroupType === "local_foraging_group").length;
  const longTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) => trip.distanceTiles >= 5).length;
  const moves = band.recentResidentialMoveEvents ?? [];
  const crossingUse = moves.filter((move) => move.temporaryWatercraft !== undefined).length;
  const heavyCarry = Math.max(0, ...cards.map((card) => burdenValue(card.carryBurden) * card.storageConfidence));
  const processing = Math.max(0, ...cards.map((card) => burdenValue(card.processingLabor) * card.storageConfidence));
  const fiberMaterial = Math.max(0, ...cards.filter((card) => card.classId === "reeds_fibers" || card.crossingMaterialUse === "fiber_lashing" || card.crossingMaterialUse === "reed_bundle").map((card) => card.storageConfidence));
  const woodMaterial = Math.max(0, ...cards.filter(isFuelOrWoodCard).map((card) => card.storageConfidence));
  const hideMaterial = Math.max(0, ...cards.filter((card) => card.crossingMaterialUse === "hide_cover" || card.broadType === "animal").map((card) => card.storageConfidence));
  const wetWear = Math.max(0, ...weatherMemories.filter((memory) => memory.kind === "floodplain_wetland" || memory.kind === "wet_travel" || memory.kind === "bad_crossing_season").map((memory) => memory.strength));
  const reasonIds = uniqueReasonIds([
    ...(band.recentIntraSeasonTrips ?? []).flatMap((trip) => trip.reasonIds).slice(0, 8),
    ...moves.flatMap((move) => move.reasonIds).slice(0, 8),
    ...(band.resourceEcology?.reasonIds ?? []),
    makeLogisticsReasonId(band.id, world.time.tick, "wear", band.position),
  ]).slice(0, 14);
  const records: MaterialWearRecord[] = [
    makeWear("carrying_gear", clamp01(heavyCarry * 0.45 + moves.length * 0.1 + longTrips * 0.025 + wetWear * 0.18), clamp01(fiberMaterial * 0.38 + hideMaterial * 0.22), 0.36, "heavy loads and moves strain carrying gear", reasonIds),
    makeWear("cordage_fiber", clamp01(crossingUse * 0.24 + processing * 0.16 + wetWear * 0.2 + fire.laborCost * 0.08), fiberMaterial, 0.28, "lashing, binding, and wet work use up fiber", reasonIds),
    makeWear("containers_wraps", clamp01(heavyCarry * 0.25 + gatheringTrips * 0.025 + processing * 0.18 + wetWear * 0.12), clamp01(fiberMaterial * 0.32 + hideMaterial * 0.32), 0.22, "carrying and processing need containers or wraps", reasonIds),
    makeWear("hunting_gear", clamp01(huntingTrips * 0.06 + longTrips * 0.014 + loads.fatigue * 0.12), clamp01(woodMaterial * 0.24 + hideMaterial * 0.2 + fiberMaterial * 0.16), 0.22, "hunting trips wear generic hunting gear", reasonIds),
    makeWear("fishing_gear", clamp01(fishingTrips * 0.06 + wetWear * 0.1), clamp01(fiberMaterial * 0.32 + woodMaterial * 0.12), 0.2, "water-edge work strains fishing gear", reasonIds),
    makeWear("fire_processing_material", clamp01(fire.need * 0.2 + fire.laborCost * 0.32 + processing * 0.18), clamp01(woodMaterial * 0.36 + fiberMaterial * 0.12), 0.24, "fire and processing need fuel and repair work", reasonIds),
    makeWear("crossing_lashings", clamp01(crossingUse * 0.34 + (moves[0]?.temporaryWatercraft?.shuttleTrips ?? 0) * 0.045 + wetWear * 0.16), fiberMaterial, 0.32, "temporary crossings strain lashings", reasonIds),
  ];

  return records
    .filter((record) => record.wear >= 0.08 || record.condition !== "good")
    .sort(compareWearRecords)
    .slice(0, MATERIAL_WEAR_CAP);
}

function deriveLogisticCapacity(
  world: WorldState,
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
  burden: CareTravelBurdenState,
  sickness: SicknessWaveState,
  materialWear: readonly MaterialWearRecord[],
  loads: LoadSignals,
): LogisticCapacityState {
  const carryingLoad = clamp01(Math.max(0, ...cards.map((card) => burdenValue(card.carryBurden) * card.storageConfidence)) * 0.52 + burden.dependentCarryBurden * 0.22);
  const processingLoad = clamp01(Math.max(0, ...cards.map((card) => burdenValue(card.processingLabor) * card.storageConfidence)) * 0.48);
  const travelLoad = clamp01(burden.longMoveBurden * 0.54 + burden.elderTravelCaution * 0.14 + loads.fatigue * 0.2);
  const crossingLoad = burden.wholeBandCrossingBurden;
  const careLoad = clamp01(burden.sickCareBurden * 0.55 + burden.pregnancyNursingBurden * 0.22 + burden.dependentCarryBurden * 0.18 + burden.elderTravelCaution * 0.12);
  const materialPenalty = clamp01(Math.max(0, ...materialWear.map((wear) => wear.wear)) * 0.34);
  const loadTotal = clamp01(carryingLoad * 0.22 + processingLoad * 0.18 + travelLoad * 0.2 + crossingLoad * 0.18 + careLoad * 0.24 + sickness.activityPenalty * 0.18 + materialPenalty);
  const spareAdultLabor = clamp01(burden.adultLaborAvailable - loadTotal * 0.38);
  const capacity = round2(clamp01(spareAdultLabor + (1 - loadTotal) * 0.34));
  const state =
    capacity <= 0.26 || loadTotal >= 0.74 ? "overloaded" :
    capacity <= 0.42 || loadTotal >= 0.56 ? "strained" :
    capacity <= 0.58 || loadTotal >= 0.38 ? "tight" :
    "comfortable";
  const limitingReason =
    careLoad >= Math.max(carryingLoad, processingLoad, travelLoad, crossingLoad)
      ? "care burden is using spare adults"
      : crossingLoad >= Math.max(carryingLoad, processingLoad, travelLoad)
        ? "whole-band crossing and shuttle load dominate"
        : carryingLoad >= Math.max(processingLoad, travelLoad)
          ? "heavy resources are hard to carry"
          : processingLoad >= travelLoad
            ? "processing and repair work consume labor"
            : "travel, terrain, and fatigue limit safe movement";

  return {
    state,
    capacity,
    spareAdultLabor: round2(spareAdultLabor),
    carryingLoad: round2(carryingLoad),
    processingLoad: round2(processingLoad),
    travelLoad: round2(travelLoad),
    crossingLoad: round2(crossingLoad),
    careLoad: round2(careLoad),
    limitingReason,
    reasonIds: uniqueReasonIds([
      ...burden.reasonIds,
      ...sickness.reasonIds,
      ...materialWear.flatMap((wear) => wear.reasonIds),
      makeLogisticsReasonId(band.id, world.time.tick, "capacity", band.position),
    ]).slice(0, 12),
    noInventorySimulation: true,
  };
}

function deriveCampCleanliness(
  world: WorldState,
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
  loads: LoadSignals,
): CampCleanlinessState {
  const currentTile = world.tiles[band.position];
  const repeatedStayLoad = clamp01(band.consecutiveSeasonsOnTile / 8 * 0.42 + (band.protoCampMemory?.currentPlace?.consecutiveUseCount ?? 0) / 8 * 0.28);
  const wetCampLoad = currentTile === undefined
    ? 0
    : clamp01(
        (currentTile.terrainKind === "wetlands" || currentTile.biomeKind === "marsh" || currentTile.biomeKind === "floodplain" ? 0.36 : 0) +
          currentTile.riskProfile.diseaseRisk * 0.24 +
          currentTile.resourceProfile.waterAccess * 0.08,
      );
  const fishMeatProcessing = Math.max(0, ...cards.filter((card) =>
    card.classId === "fish_or_shellfish" ||
    card.classId === "aquatic_food" ||
    card.classId === "small_game"
  ).map((card) =>
    card.storageConfidence * (burdenValue(card.spoilageRisk) * 0.34 + burdenValue(card.processingLabor) * 0.18),
  ));
  const scavengerPressure = Math.max(0, ...(band.visibleNature?.faunaCards ?? []).map((card) =>
    card.tags.includes("pack_predator") || card.tags.includes("lone_predator") || card.risk >= 0.45 ? card.risk * card.confidence : card.humanTolerance * 0.18,
  ));
  const sicknessLoad = band.acuteRisk?.recentEpisodes.some((episode) =>
    episode.kind === "bad_water_sickness" || episode.kind === "spoiled_or_risky_food_sickness"
  ) === true ? 0.28 : 0;
  const recovery = clamp01(
    loads.recoverySignal * 0.28 +
      (band.consecutiveSeasonsOnTile <= 1 ? 0.22 : 0) +
      (band.protoCampMemory?.currentPlace?.ecologicalRecovery ?? 0) * 0.18,
  );
  const pressure = round2(clamp01(
    repeatedStayLoad * 0.28 +
      wetCampLoad * 0.22 +
      fishMeatProcessing * 0.22 +
      sicknessLoad * 0.18 +
      scavengerPressure * 0.16 +
      loads.localUsePressure * 0.18 -
      recovery * 0.18,
  ));
  const state =
    pressure >= 0.62 ? "waste_pressure" :
    pressure >= 0.44 ? "dirty" :
    recovery >= 0.34 && pressure < 0.38 ? "recovering" :
    pressure >= 0.22 ? "watchful" :
    "clean";

  return {
    state,
    pressure,
    repeatedStayLoad: round2(repeatedStayLoad),
    wetCampLoad: round2(wetCampLoad),
    processingWasteLoad: round2(fishMeatProcessing),
    sicknessLoad: round2(sicknessLoad),
    scavengerPressure: round2(scavengerPressure),
    recovery: round2(recovery),
    movementDebate: round2(clamp01(pressure * 0.42 + repeatedStayLoad * 0.18)),
    reasonIds: uniqueReasonIds([
      ...(band.protoCampMemory?.reasonIds ?? []),
      ...(band.visibleNature?.reasonIds ?? []),
      ...(band.resourceEcology?.reasonIds ?? []),
      makeLogisticsReasonId(band.id, world.time.tick, "cleanliness", band.position),
    ]).slice(0, 12),
    noSanitationTech: true,
  };
}

function deriveOpportunisticFoodCandidates(
  world: WorldState,
  band: Band,
  sickness: SicknessWaveState,
  loads: LoadSignals,
): readonly OpportunisticFoodCandidate[] {
  if (loads.hunger < 0.3 && band.foragingAdaptation?.mode !== "hungry" && band.foragingAdaptation?.mode !== "desperate") {
    return [];
  }
  const candidates: OpportunisticFoodCandidate[] = [];
  const riskBump = sickness.active ? 0.12 : 0;
  const reasonIds = uniqueReasonIds([
    ...(band.foragingAdaptation?.reasonIds ?? []),
    ...(band.visibleNature?.reasonIds ?? []),
    makeLogisticsReasonId(band.id, world.time.tick, "opportunistic", band.position),
  ]).slice(0, 12);

  const animal = band.visibleNature?.faunaCards.find((card) => !card.tags.includes("aquatic") && card.confidence >= 0.18);
  if (animal !== undefined && (loads.hunger >= 0.42 || animal.risk >= 0.34)) {
    candidates.push(makeOpportunistic("carrion_leftover", animal.anchorTileId, clamp01(0.16 + loads.hunger * 0.24), clamp01(0.28 + animal.risk * 0.34 + riskBump), 0.22, 0.28, "recent animal signs make carrion or leftovers thinkable", reasonIds));
  }
  const aquatic = band.visibleNature?.aquaticCards.find((card) => card.confidence >= 0.18);
  if (aquatic !== undefined) {
    candidates.push(makeOpportunistic(
      aquatic.waterContext === "delta_wetland" ? "shellfish_wetland_find" : "stranded_fish",
      aquatic.anchorTileId,
      clamp01(0.18 + loads.hunger * 0.22 + aquatic.reliability * 0.12),
      clamp01(aquatic.riskDifficulty * 0.34 + riskBump + 0.12),
      clamp01(aquatic.laborAccessCost * 0.3 + 0.14),
      clamp01(aquatic.confidence * 0.38),
      "water-edge food signs make small finds possible under pressure",
      reasonIds,
    ));
  }
  const plantFallback = band.foragingAdaptation?.fallbackCandidates.find((candidate) => candidate.level === "expanded" || candidate.level === "emergency");
  if (plantFallback !== undefined) {
    candidates.push(makeOpportunistic("insects_small_animals", plantFallback.tileId, clamp01(0.12 + loads.hunger * 0.18), clamp01(plantFallback.riskCost * 0.34 + riskBump + 0.1), 0.18, 0.2, "fallback search broadens to small low-return foods", plantFallback.reasonIds));
  }
  if (world.time.season === "spring" && loads.hunger >= 0.34) {
    candidates.push(makeOpportunistic("eggs_nests", band.position, clamp01(0.12 + loads.hunger * 0.16), clamp01(0.2 + riskBump), 0.18, 0.16, "spring animal signs can include small nest finds", reasonIds));
  }
  if (band.bodyCampLogistics?.weatherMemories.some((memory) => memory.trend === "recovered") === true && loads.hunger >= 0.36) {
    candidates.push(makeOpportunistic("post_weather_find", band.position, clamp01(0.12 + loads.hunger * 0.14), clamp01(0.24 + riskBump), 0.2, 0.12, "recent weather hardship can leave unreliable small finds", reasonIds));
  }

  return candidates
    .sort(compareOpportunistic)
    .slice(0, OPPORTUNISTIC_FOOD_CAP);
}

function deriveSharingPressure(
  band: Band,
  sickness: SicknessWaveState,
  capacity: LogisticCapacityState,
  loads: LoadSignals,
): FoodSharingPressureState {
  const tripFailures = band.foragingAdaptation?.tripFailureMemories.reduce((sum, memory) => sum + memory.failureCount + memory.lowReturnCount, 0) ?? 0;
  const lowReturnLoad = clamp01(loads.hunger * 0.42 + tripFailures / 16 * 0.24 + (band.returnTrend?.chronicDecline === true ? 0.18 : 0));
  const careLoad = clamp01(sickness.careBurden * 0.46 + loads.dependencyLoad * 0.28);
  const accessCrowdingLoad = clamp01((band.protoAccessMemory?.currentPlace?.sharedUsePressure ?? 0) * 0.34 + (band.protoAccessMemory?.currentPlace?.crowdingResourcePressure ?? 0) * 0.24);
  const recoveryRelief = clamp01(loads.recoverySignal * 0.4 + (capacity.state === "comfortable" ? 0.18 : 0));
  const pressure = round2(clamp01(
    lowReturnLoad * 0.38 +
      loads.dependencyLoad * 0.22 +
      careLoad * 0.18 +
      accessCrowdingLoad * 0.18 +
      (capacity.state === "overloaded" ? 0.16 : capacity.state === "strained" ? 0.08 : 0) -
      recoveryRelief * 0.24,
  ));
  const state =
    recoveryRelief >= 0.36 && pressure < 0.3 ? "relief" :
    pressure >= 0.66 ? "ration_like_caution" :
    pressure >= 0.46 ? "strained_sharing" :
    pressure >= 0.24 ? "watchful_sharing" :
    "easy_sharing";

  return {
    state,
    pressure,
    dependencyLoad: loads.dependencyLoad,
    lowReturnLoad: round2(lowReturnLoad),
    careLoad: round2(careLoad),
    accessCrowdingLoad: round2(accessCrowdingLoad),
    recoveryRelief: round2(recoveryRelief),
    reasonIds: uniqueReasonIds([
      ...(band.foragingAdaptation?.reasonIds ?? []),
      ...sickness.reasonIds,
      ...(band.protoAccessMemory?.reasonIds ?? []),
      ...loads.supportReasonIds,
    ]).slice(0, 12),
    noOwnershipProperty: true,
  };
}

function deriveSeasonalTasks(
  world: WorldState,
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
  fire: FireUseState,
  sickness: SicknessWaveState,
  cleanliness: CampCleanlinessState,
  materialWear: readonly MaterialWearRecord[],
  opportunistic: readonly OpportunisticFoodCandidate[],
  loads: LoadSignals,
): readonly SeasonalTaskPriority[] {
  const tasks: SeasonalTaskPriority[] = [];
  const reasonIds = uniqueReasonIds([
    ...(band.resourceEcology?.reasonIds ?? []),
    ...(band.visibleNature?.reasonIds ?? []),
    ...(band.foragingAdaptation?.reasonIds ?? []),
    makeLogisticsReasonId(band.id, world.time.tick, "seasonal-task", band.position),
  ]).slice(0, 12);
  const plantPulse = Math.max(0, ...(band.visibleNature?.plantCards ?? []).map((card) =>
    card.plantPatchEffect === "seasonal_pulse" ? card.confidence * card.seasonalPulseStrength : 0,
  ));
  const aquatic = Math.max(0, ...(band.visibleNature?.aquaticCards ?? []).map((card) => card.reliability * card.confidence));
  const storagePulse = Math.max(0, ...cards.filter((card) => card.seasonalBufferValue === "high" || card.storageSuitability === "good" || card.storageSuitability === "excellent").map((card) => card.storageConfidence * (card.classId === "seeds_nuts_mast" ? 1 : 0.72)));
  const repairNeed = Math.max(0, ...materialWear.map((wear) => wear.wear * (1 - wear.recovery)));

  if (world.time.season === "spring" || plantPulse >= 0.22) {
    tasks.push(taskPriority("plant_observation", clamp01(0.2 + plantPulse * 0.52 + (world.time.season === "spring" ? 0.16 : 0)), "watch plant pulses and learn what is actually useful here", "visible plant cards and seasonal pulse memory", reasonIds));
  }
  if (aquatic >= 0.22 || world.time.season === "summer") {
    tasks.push(taskPriority("water_wetland_work", clamp01(0.18 + aquatic * 0.4 + loads.waterStress * 0.32), "water-edge work matters because local cues support it", "visible aquatic cards and water pressure", reasonIds));
  }
  if (world.time.season === "autumn" || storagePulse >= 0.28 || fire.processingValue >= 0.22) {
    tasks.push(taskPriority("processing_firewood", clamp01(0.18 + storagePulse * 0.42 + fire.processingValue * 0.24 + (world.time.season === "autumn" ? 0.16 : 0)), "storable pulses and perishable food make processing and fuel work salient", "storage suitability and fire processing value", reasonIds));
  }
  if (world.time.season === "winter" || fire.need >= 0.34) {
    tasks.push(taskPriority("winter_shelter_fire", clamp01(0.18 + fire.need * 0.48 + (world.time.season === "winter" ? 0.18 : 0)), "shelter and fire matter more under cold or wet memory", "fire state and weather memory", fire.reasonIds));
  }
  if (loads.waterStress >= 0.34 || band.seasonalSupport?.currentSeasonSupport.mode === "dry") {
    tasks.push(taskPriority("dry_water_refuge", clamp01(0.2 + loads.waterStress * 0.55), "water and refuge shape the day before distance does", "seasonal support water stress", loads.supportReasonIds));
  }
  if (opportunistic.length > 0 || loads.hunger >= 0.48) {
    tasks.push(taskPriority("fallback_scavenging", clamp01(0.18 + loads.hunger * 0.5 + opportunistic.length * 0.04), "pressure is widening low-return opportunistic food work", "foraging adaptation and opportunistic candidates", opportunistic.flatMap((candidate) => candidate.reasonIds)));
  }
  if (repairNeed >= 0.18) {
    tasks.push(taskPriority("repair_materials", clamp01(0.16 + repairNeed * 0.58), "material wear makes fiber, wood, hide, and repair work salient", "material wear records", materialWear.flatMap((wear) => wear.reasonIds)));
  }
  if (sickness.recoverySignal >= 0.34 || cleanliness.recovery >= 0.34) {
    tasks.push(taskPriority("rest_recovery", clamp01(0.12 + sickness.recoverySignal * 0.34 + cleanliness.recovery * 0.34), "recent pressure is easing enough for rest and recovery to matter", "sickness and camp cleanliness recovery", [...sickness.reasonIds, ...cleanliness.reasonIds]));
  }

  return tasks
    .sort(compareTaskPriorities)
    .slice(0, SEASONAL_TASK_CAP);
}

function deriveBehavior(
  weatherMemories: readonly WeatherMemoryRecord[],
  fire: FireUseState,
  sickness: SicknessWaveState,
  burden: CareTravelBurdenState,
  capacity: LogisticCapacityState,
  materialWear: readonly MaterialWearRecord[],
  cleanliness: CampCleanlinessState,
  sharing: FoodSharingPressureState,
  opportunistic: readonly OpportunisticFoodCandidate[],
): BodyCampLogisticsBehavior {
  const weatherRouteCautionBias = clampHook(Math.max(0, ...weatherMemories.map((memory) => memory.routeCaution * 0.16)));
  const sicknessActivityPenalty = clampHook(sickness.activityPenalty * 0.64);
  const careTravelBurdenBias = clampHook(Math.max(
    burden.dependentCarryBurden,
    burden.elderTravelCaution,
    burden.pregnancyNursingBurden,
    burden.sickCareBurden,
    burden.wholeBandCrossingBurden,
    burden.longMoveBurden,
  ) * 0.16);
  const carryConstraintBias = clampHook((1 - capacity.capacity) * 0.14 + (capacity.state === "overloaded" ? 0.04 : 0));
  const materialWearPenalty = clampHook(Math.max(0, ...materialWear.map((wear) => wear.wear)) * 0.15);
  const campCleanlinessMoveAwayBias = clampHook(cleanliness.movementDebate * 0.16);
  const sharingTensionBias = clampHook(sharing.pressure * 0.14);
  const fireExposureReliefBias = clampHook(fire.usefulness * 0.12);
  const opportunisticFoodBias = clampHook(Math.max(0, ...opportunistic.map((candidate) => candidate.usefulness * (1 - candidate.risk * 0.5))) * 0.14);
  const maxBehaviorHook = Math.max(
    weatherRouteCautionBias,
    sicknessActivityPenalty,
    careTravelBurdenBias,
    carryConstraintBias,
    materialWearPenalty,
    campCleanlinessMoveAwayBias,
    sharingTensionBias,
    fireExposureReliefBias,
    opportunisticFoodBias,
  );

  return {
    weatherRouteCautionBias: round2(weatherRouteCautionBias),
    sicknessActivityPenalty: round2(sicknessActivityPenalty),
    careTravelBurdenBias: round2(careTravelBurdenBias),
    carryConstraintBias: round2(carryConstraintBias),
    materialWearPenalty: round2(materialWearPenalty),
    campCleanlinessMoveAwayBias: round2(campCleanlinessMoveAwayBias),
    sharingTensionBias: round2(sharingTensionBias),
    fireExposureReliefBias: round2(fireExposureReliefBias),
    opportunisticFoodBias: round2(opportunisticFoodBias),
    maxBehaviorHook: round2(maxBehaviorHook),
    reversible: true,
    noMagicBuff: true,
    noPermanentPenalty: true,
  };
}

function deriveMode(
  weatherMemories: readonly WeatherMemoryRecord[],
  sickness: SicknessWaveState,
  burden: CareTravelBurdenState,
  capacity: LogisticCapacityState,
  cleanliness: CampCleanlinessState,
  behavior: BodyCampLogisticsBehavior,
  loads: LoadSignals,
): BodyCampLogisticsMode {
  if (loads.recoverySignal >= 0.36 && behavior.maxBehaviorHook <= 0.08 && sickness.severity <= 0.18 && cleanliness.pressure <= 0.3) {
    return "recovering";
  }
  if (sickness.severity >= 0.46) {
    return "sick";
  }
  if (capacity.state === "overloaded" || burden.dependentCarryBurden + burden.elderTravelCaution + burden.sickCareBurden >= 1.05) {
    return "overburdened";
  }
  if (weatherMemories.some((memory) => memory.strength >= 0.56 && memory.routeCaution >= 0.42)) {
    return "weather_pinned";
  }
  if (behavior.maxBehaviorHook >= 0.08 || capacity.state === "strained" || cleanliness.pressure >= 0.38) {
    return "strained";
  }
  return "stable";
}

function weatherDraft(
  kind: WeatherMemoryKind,
  strength: number,
  routeCaution: number,
  fireNeed: number,
  childElderRisk: number,
  source: string,
  reasonIds: readonly ReasonId[],
): WeatherDraft {
  return {
    kind,
    strength: clamp01(strength),
    routeCaution: clamp01(routeCaution),
    fireNeed: clamp01(fireNeed),
    childElderRisk: clamp01(childElderRisk),
    source,
    reasonIds,
  };
}

function makeWear(
  category: MaterialWearCategory,
  wear: number,
  materialBasis: number,
  laborCostBase: number,
  consequence: string,
  reasonIds: readonly ReasonId[],
): MaterialWearRecord {
  const recovery = clamp01(materialBasis * 0.42 + Math.max(0, 0.38 - wear) * 0.24);
  const finalWear = round2(clamp01(wear - recovery * 0.18));
  const condition =
    recovery >= 0.32 && finalWear < 0.32 ? "recovering" :
    finalWear >= 0.68 ? "failing" :
    finalWear >= 0.48 ? "strained" :
    finalWear >= 0.24 ? "worn" :
    "good";

  return {
    category,
    condition,
    wear: finalWear,
    recovery: round2(recovery),
    materialBasis: round2(clamp01(materialBasis)),
    laborCost: round2(clamp01(finalWear * laborCostBase + Math.max(0, 0.34 - materialBasis) * 0.18)),
    consequence,
    reasonIds,
  };
}

function makeOpportunistic(
  kind: OpportunisticFoodCandidate["kind"],
  tileId: TileId | undefined,
  usefulness: number,
  risk: number,
  laborCost: number,
  reliability: number,
  triggeredBy: string,
  reasonIds: readonly ReasonId[],
): OpportunisticFoodCandidate {
  return {
    kind,
    tileId,
    usefulness: round2(clamp01(usefulness)),
    risk: round2(clamp01(risk)),
    laborCost: round2(clamp01(laborCost)),
    reliability: round2(clamp01(reliability)),
    triggeredBy,
    reasonIds: reasonIds.slice(0, 8),
    notStableSurplus: true,
  };
}

function taskPriority(
  category: SeasonalTaskPriority["category"],
  urgency: number,
  reason: string,
  source: string,
  reasonIds: readonly ReasonId[],
): SeasonalTaskPriority {
  return {
    category,
    urgency: round2(clamp01(urgency)),
    reason,
    source,
    reasonIds: reasonIds.slice(0, 8),
  };
}

function isFuelOrWoodCard(card: ResourceStorageSuitabilityCard): boolean {
  return card.classId === "fuel_wood" || card.crossingMaterialUse === "heavy_floatable_wood" || card.crossingMaterialUse === "wood_or_bark";
}

function burdenValue(level: "low" | "medium" | "high"): number {
  switch (level) {
    case "high":
      return 1;
    case "medium":
      return 0.58;
    case "low":
      return 0.22;
  }
}

function severityValue(severity: "minor" | "moderate" | "severe" | "critical"): number {
  switch (severity) {
    case "critical":
      return 1;
    case "severe":
      return 0.78;
    case "moderate":
      return 0.48;
    case "minor":
      return 0.24;
  }
}

function compareWeatherMemories(left: WeatherMemoryRecord, right: WeatherMemoryRecord): number {
  const strength = right.strength - left.strength;
  if (strength !== 0) {
    return strength;
  }
  return left.kind.localeCompare(right.kind);
}

function compareWearRecords(left: MaterialWearRecord, right: MaterialWearRecord): number {
  const wear = right.wear - left.wear;
  if (wear !== 0) {
    return wear;
  }
  return left.category.localeCompare(right.category);
}

function compareOpportunistic(left: OpportunisticFoodCandidate, right: OpportunisticFoodCandidate): number {
  const score = (right.usefulness - right.risk * 0.32) - (left.usefulness - left.risk * 0.32);
  if (score !== 0) {
    return score;
  }
  return left.kind.localeCompare(right.kind);
}

function compareTaskPriorities(left: SeasonalTaskPriority, right: SeasonalTaskPriority): number {
  const urgency = right.urgency - left.urgency;
  if (urgency !== 0) {
    return urgency;
  }
  return left.category.localeCompare(right.category);
}

function uniqueReasonIds(ids: readonly ReasonId[]): readonly ReasonId[] {
  const seen = new Set<string>();
  const result: ReasonId[] = [];
  for (const id of ids) {
    const key = String(id);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(id);
  }
  return result;
}

function uniqueSicknessCauses(causes: readonly SicknessCauseKind[]): readonly SicknessCauseKind[] {
  const seen = new Set<SicknessCauseKind>();
  const result: SicknessCauseKind[] = [];
  for (const cause of causes) {
    if (seen.has(cause)) {
      continue;
    }
    seen.add(cause);
    result.push(cause);
  }
  return result;
}

function makeLogisticsReasonId(
  bandId: BandId,
  tick: number,
  family: string,
  tileId?: TileId,
): ReasonId {
  return `reason:body-camp-logistics:${String(bandId)}:${Math.floor(tick)}:${family}:${String(tileId ?? "band")}` as ReasonId;
}

function clampHook(value: number): number {
  return clamp(0, MAX_BEHAVIOR_HOOK, value);
}

function clamp01(value: number): NormalizedIntensity {
  return clamp(0, 1, value) as NormalizedIntensity;
}

function clamp(min: number, max: number, value: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): NormalizedIntensity {
  return Math.round(clamp01(value) * 100) / 100 as NormalizedIntensity;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}
