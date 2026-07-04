import type { BandId, ReasonId, Season, TickNumber, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import { getTile } from "../world/generate";
import type { WorldState } from "../world/types";
import type { ResourceClassId, ResourceClassPressureEffect } from "./resourceClasses";
import {
  effectiveResourceConfidence,
  type ResourceKnowledgeSource,
  type ResourceKnowledgeStateKind,
  type ResourcePatchMemory,
} from "./resourceKnowledge";
import {
  deriveResourceStorageSuitabilityCards,
  describeActivityStorageImplications,
  getStorageSuitabilityTraits,
  summarizeStorageSuitability,
} from "./storageSuitability";
import type {
  ResourceActivityStorageInterpretation,
  ResourceStorageSuitabilityCard,
  ResourceStorageSuitabilitySummary,
} from "./storageSuitability";
import type { Band, IntraSeasonTripRecord, ProtoCampFactor } from "./types";

export type ResourceEcologyClassId =
  | "gathered_plants"
  | "fruits_or_pulse_plants"
  | "roots_tubers_fallback"
  | "seeds_nuts_mast"
  | "wetland_plants"
  | "aquatic_food"
  | "fish_or_shellfish"
  | "small_game"
  | "large_game_abstract"
  | "fallback_foods"
  | "reeds_fibers"
  | "fuel_wood"
  | "medicinal_toxic_hook"
  | "water_refuge";

export type ResourceEcologyBroadType = "plant" | "aquatic" | "animal" | "fallback" | "material_hook" | "water_refuge";

export type ResourceEcologySeasonalProfile =
  | "season_general"
  | "wet_recovery"
  | "pulse_autumn"
  | "dry_refuge"
  | "stress_fallback"
  | "low_seasonality"
  | "future_hook";

export type ResourceEcologyKnowledgeState =
  | "unknown"
  | "inferred"
  | "observed"
  | "tested"
  | "reliable"
  | "risky"
  | "avoided"
  | "inherited"
  | "stale";

export type ResourceEcologyKnowledgeSource =
  | "observed"
  | "activity"
  | "inherited"
  | "scouting"
  | "event"
  | "repeated_use"
  | "inferred";

export interface ResourceEcologyClassDefinition {
  readonly id: ResourceEcologyClassId;
  readonly label: string;
  readonly broadType: ResourceEcologyBroadType;
  readonly habitatAffinities: readonly string[];
  readonly seasonalAvailabilityProfile: ResourceEcologySeasonalProfile;
  readonly reliability: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly risk: NormalizedIntensity;
  readonly pressureDepletionSensitivity: NormalizedIntensity;
  readonly storageSuitabilityHook: NormalizedIntensity;
  readonly knowledgeDifficulty: NormalizedIntensity;
  readonly supportActiveNow: boolean;
  readonly debugDescription: string;
}

export interface ResourceEcologyContribution {
  readonly classId: ResourceEcologyClassId;
  readonly label: string;
  readonly broadType: ResourceEcologyBroadType;
  readonly supportContribution: number;
  readonly supportShare: NormalizedIntensity;
  readonly seasonalModifier: number;
  readonly pressure: NormalizedIntensity;
  readonly pressureLoss: NormalizedIntensity;
  readonly reliability: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly risk: NormalizedIntensity;
  readonly knowledgeState: ResourceEcologyKnowledgeState;
  readonly knowledgeConfidence: NormalizedIntensity;
  readonly knowledgeSource: ResourceEcologyKnowledgeSource;
  readonly abstractSourceClassId?: ResourceClassId;
  readonly realResourceSpecific: boolean;
  readonly topReason: string;
}

export interface ResourceEcologyPressureEffect {
  readonly classId: ResourceEcologyClassId;
  readonly pressure: NormalizedIntensity;
  readonly pressureLoss: NormalizedIntensity;
  readonly reason: string;
}

export interface ResourceEcologySupportBreakdown {
  readonly totalRawSupport: number;
  readonly clampedSupportRatio: NormalizedIntensity;
  readonly explainedByResourceClass: number;
  readonly explainedShare: NormalizedIntensity;
  readonly abstractRemainder: number;
  readonly plantContribution: number;
  readonly aquaticContribution: number;
  readonly animalForagingContribution: number;
  readonly fallbackContribution: number;
  readonly waterRefugeContribution: number;
  readonly topContributingClasses: readonly ResourceEcologyContribution[];
  readonly weakMissingClasses: readonly ResourceEcologyClassId[];
  readonly seasonalResourceModifier: number;
  readonly pressureEffects: readonly ResourceEcologyPressureEffect[];
  readonly rawSource: string;
}

export interface ResourceEcologyKnowledgeMemory {
  readonly resourceClassId: ResourceEcologyClassId;
  readonly label: string;
  readonly placeTileId: TileId;
  readonly knowledgeState: ResourceEcologyKnowledgeState;
  readonly confidence: NormalizedIntensity;
  readonly source: ResourceEcologyKnowledgeSource;
  readonly lastUpdatedYear: number;
  readonly lastUpdatedSeason: Season;
  readonly seasonalReliability: NormalizedIntensity;
  readonly successCount: number;
  readonly failureCount: number;
  readonly riskOrAvoidanceNote?: string;
  readonly rawPatchId: string;
  readonly rawSource: string;
}

export interface ResourceEcologyKnowledgeSummary {
  readonly memoryCount: number;
  readonly memoryCap: number;
  readonly withinCap: boolean;
  readonly stateCounts: Readonly<Record<ResourceEcologyKnowledgeState, number>>;
  readonly knownResourceClasses: readonly ResourceEcologyClassId[];
  readonly topMemories: readonly ResourceEcologyKnowledgeMemory[];
  readonly antiOmniscience: {
    readonly fullyKnownWithoutMemoryCount: number;
    readonly inferredOnlyWithoutUse: boolean;
    readonly noEveryResourceKnown: boolean;
    readonly noHiddenMapResourceTruth: true;
  };
}

export interface ResourceEcologyPlaceMemory {
  readonly tileId: TileId;
  readonly resourceClassId: ResourceEcologyClassId;
  readonly label: string;
  readonly visitsOrUses: number;
  readonly seasonalSuccessCount: number;
  readonly seasonalFailureCount: number;
  readonly contributionToSupport: number;
  readonly linkedActivityCount: number;
  readonly linkedEventCount: number;
  readonly protoCampReasonLinks: readonly string[];
  readonly pressure: NormalizedIntensity;
  readonly overuseNote?: string;
  readonly lastUpdatedYear: number;
  readonly lastUpdatedSeason: Season;
  readonly rawSource: string;
}

export interface ResourceEcologyActivityTrace {
  readonly activityType: string;
  readonly resourceClassId: ResourceEcologyClassId;
  readonly label: string;
  readonly season: Season;
  readonly expectedContribution: number;
  readonly outcome: string;
  readonly knowledgeUpdate: string;
  readonly memoryUpdate: string;
  readonly storageSuitability?: ResourceActivityStorageInterpretation;
  readonly targetTileId: TileId;
  readonly rawSource: string;
}

export interface ResourceEcologyBandState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly support: ResourceEcologySupportBreakdown;
  readonly knowledge: ResourceEcologyKnowledgeSummary;
  readonly topResourcePlaceMemories: readonly ResourceEcologyPlaceMemory[];
  readonly activityResourceTraces: readonly ResourceEcologyActivityTrace[];
  readonly storageSuitabilityCards: readonly ResourceStorageSuitabilityCard[];
  readonly storageSuitabilitySummary: ResourceStorageSuitabilitySummary;
  readonly resourceMemoryCap: number;
  readonly placeMemoryCap: number;
  readonly bounded: true;
  readonly noNamedSpecies: true;
  readonly noStorageEconomy: true;
  readonly noStoredFoodBank: true;
  readonly noAgriculture: true;
  readonly noFullPlantFaunaEcology: true;
  readonly reasonIds: readonly ReasonId[];
}

interface FineContributionDraft {
  readonly classId: ResourceEcologyClassId;
  readonly amount: number;
  readonly seasonalModifier: number;
  readonly pressure: NormalizedIntensity;
  readonly pressureLoss: NormalizedIntensity;
  readonly abstractSourceClassId?: ResourceClassId;
  readonly topReason: string;
}

interface ProtoCampResourceFactors {
  readonly positive: readonly ProtoCampFactor[];
  readonly negative: readonly ProtoCampFactor[];
  readonly reasonIds: readonly ReasonId[];
}

const RESOURCE_PLACE_MEMORY_CAP = 12;
const RESOURCE_ACTIVITY_TRACE_CAP = 8;
const TOP_SUPPORT_CLASS_LIMIT = 6;

export const RESOURCE_ECOLOGY_CLASSES: readonly ResourceEcologyClassDefinition[] = [
  { id: "gathered_plants", label: "gathered plants", broadType: "plant", habitatAffinities: ["foraging", "forest_edge", "grassland"], seasonalAvailabilityProfile: "season_general", reliability: 0.58, laborCost: 0.42, risk: 0.12, pressureDepletionSensitivity: 0.54, storageSuitabilityHook: 0.28, knowledgeDifficulty: 0.35, supportActiveNow: true, debugDescription: "Generic gathered plant foods; not named species or crop plants." },
  { id: "fruits_or_pulse_plants", label: "fruits / pulse plants", broadType: "plant", habitatAffinities: ["seasonal_edge", "riparian", "woodland"], seasonalAvailabilityProfile: "pulse_autumn", reliability: 0.42, laborCost: 0.36, risk: 0.14, pressureDepletionSensitivity: 0.62, storageSuitabilityHook: 0.22, knowledgeDifficulty: 0.48, supportActiveNow: true, debugDescription: "Seasonal plant pulse slot; generic fruiting or short pulse resources." },
  { id: "roots_tubers_fallback", label: "roots / tubers fallback", broadType: "fallback", habitatAffinities: ["dry_margin", "stress_refuge", "open_foraging"], seasonalAvailabilityProfile: "stress_fallback", reliability: 0.7, laborCost: 0.64, risk: 0.2, pressureDepletionSensitivity: 0.34, storageSuitabilityHook: 0.42, knowledgeDifficulty: 0.5, supportActiveNow: true, debugDescription: "Fallback plant foods with labor cost; no storage economy." },
  { id: "seeds_nuts_mast", label: "seeds / nuts / mast", broadType: "plant", habitatAffinities: ["woodland", "seasonal_edge"], seasonalAvailabilityProfile: "pulse_autumn", reliability: 0.5, laborCost: 0.48, risk: 0.1, pressureDepletionSensitivity: 0.58, storageSuitabilityHook: 0.68, knowledgeDifficulty: 0.46, supportActiveNow: true, debugDescription: "Generic mast/seed pulse hook; storage suitability is debug only." },
  { id: "wetland_plants", label: "wetland plants", broadType: "plant", habitatAffinities: ["wetland", "riverbank", "floodplain"], seasonalAvailabilityProfile: "wet_recovery", reliability: 0.62, laborCost: 0.4, risk: 0.16, pressureDepletionSensitivity: 0.46, storageSuitabilityHook: 0.26, knowledgeDifficulty: 0.38, supportActiveNow: true, debugDescription: "Generic wetland plant support around known water/refuge." },
  { id: "aquatic_food", label: "aquatic food", broadType: "aquatic", habitatAffinities: ["lake", "river", "wetland", "coast"], seasonalAvailabilityProfile: "dry_refuge", reliability: 0.64, laborCost: 0.48, risk: 0.18, pressureDepletionSensitivity: 0.44, storageSuitabilityHook: 0.3, knowledgeDifficulty: 0.42, supportActiveNow: true, debugDescription: "Broad aquatic food slot around known water; no animal agents." },
  { id: "fish_or_shellfish", label: "fish / shellfish", broadType: "aquatic", habitatAffinities: ["lake", "river", "coast"], seasonalAvailabilityProfile: "low_seasonality", reliability: 0.56, laborCost: 0.54, risk: 0.2, pressureDepletionSensitivity: 0.5, storageSuitabilityHook: 0.4, knowledgeDifficulty: 0.52, supportActiveNow: true, debugDescription: "Fish-like support placeholder; no named species." },
  { id: "small_game", label: "small game", broadType: "animal", habitatAffinities: ["mixed_foraging", "edge"], seasonalAvailabilityProfile: "season_general", reliability: 0.38, laborCost: 0.66, risk: 0.26, pressureDepletionSensitivity: 0.44, storageSuitabilityHook: 0.24, knowledgeDifficulty: 0.55, supportActiveNow: true, debugDescription: "Small animal-food hook; no animal agents." },
  { id: "large_game_abstract", label: "large game abstract", broadType: "animal", habitatAffinities: ["open_range", "corridor"], seasonalAvailabilityProfile: "low_seasonality", reliability: 0.28, laborCost: 0.82, risk: 0.38, pressureDepletionSensitivity: 0.52, storageSuitabilityHook: 0.48, knowledgeDifficulty: 0.7, supportActiveNow: true, debugDescription: "High-variance large-game placeholder; not full fauna ecology." },
  { id: "fallback_foods", label: "fallback foods", broadType: "fallback", habitatAffinities: ["dry_margin", "poor_refuge", "stress"], seasonalAvailabilityProfile: "stress_fallback", reliability: 0.74, laborCost: 0.72, risk: 0.24, pressureDepletionSensitivity: 0.3, storageSuitabilityHook: 0.22, knowledgeDifficulty: 0.44, supportActiveNow: true, debugDescription: "Generic fallback survival foods; useful but costly." },
  { id: "reeds_fibers", label: "reeds / fibers", broadType: "material_hook", habitatAffinities: ["wetland", "riverbank"], seasonalAvailabilityProfile: "future_hook", reliability: 0.66, laborCost: 0.44, risk: 0.08, pressureDepletionSensitivity: 0.32, storageSuitabilityHook: 0.72, knowledgeDifficulty: 0.34, supportActiveNow: false, debugDescription: "Material hook only; no survival effect in this pass." },
  { id: "fuel_wood", label: "fuel wood", broadType: "material_hook", habitatAffinities: ["woodland", "shrubland"], seasonalAvailabilityProfile: "future_hook", reliability: 0.68, laborCost: 0.46, risk: 0.1, pressureDepletionSensitivity: 0.38, storageSuitabilityHook: 0.58, knowledgeDifficulty: 0.3, supportActiveNow: false, debugDescription: "Fuel hook only; no survival effect in this pass." },
  { id: "medicinal_toxic_hook", label: "medicinal / toxic hook", broadType: "material_hook", habitatAffinities: ["diverse_foraging"], seasonalAvailabilityProfile: "future_hook", reliability: 0.38, laborCost: 0.52, risk: 0.62, pressureDepletionSensitivity: 0.26, storageSuitabilityHook: 0.3, knowledgeDifficulty: 0.78, supportActiveNow: false, debugDescription: "Risk/medicine hook only; no culture, ritual, or disease system." },
  { id: "water_refuge", label: "water / refuge", broadType: "water_refuge", habitatAffinities: ["river", "lake", "coast", "wetland", "creek"], seasonalAvailabilityProfile: "dry_refuge", reliability: 0.78, laborCost: 0.22, risk: 0.1, pressureDepletionSensitivity: 0.2, storageSuitabilityHook: 0.08, knowledgeDifficulty: 0.24, supportActiveNow: true, debugDescription: "Known water/refuge support context; not ownership or territory." },
];

const DEFINITION_BY_ID = new Map<ResourceEcologyClassId, ResourceEcologyClassDefinition>(
  RESOURCE_ECOLOGY_CLASSES.map((definition) => [definition.id, definition]),
);

export function applyResourceEcologyContext(world: WorldState): WorldState {
  const bands = Object.values(world.bands)
    .sort(compareBands)
    .reduce<Record<string, Band>>((records, band) => {
      records[String(band.id)] = {
        ...band,
        resourceEcology: deriveResourceEcologyBandState(world, band),
      };
      return records;
    }, {});

  return { ...world, bands: bands as Readonly<Record<BandId, Band>> };
}

export function deriveResourceEcologyBandState(world: WorldState, band: Band): ResourceEcologyBandState {
  const support = deriveResourceEcologySupportBreakdown(band, world.time.season);
  const knowledge = deriveResourceEcologyKnowledgeSummary(band, world.time.tick, world.time.year, world.time.season);
  const topResourcePlaceMemories = deriveResourcePlaceMemories(world, band, support).slice(0, RESOURCE_PLACE_MEMORY_CAP);
  const activityResourceTraces = deriveActivityResourceTraces(band, support).slice(0, RESOURCE_ACTIVITY_TRACE_CAP);
  const storageSuitabilityCards = deriveResourceStorageSuitabilityCards({
    band,
    season: world.time.season,
    support,
    knowledge,
    activityTraces: activityResourceTraces,
  });
  const storageSuitabilitySummary = summarizeStorageSuitability(storageSuitabilityCards);

  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    support,
    knowledge,
    topResourcePlaceMemories,
    activityResourceTraces,
    storageSuitabilityCards,
    storageSuitabilitySummary,
    resourceMemoryCap: band.resourceKnowledgeState?.cap ?? 48,
    placeMemoryCap: RESOURCE_PLACE_MEMORY_CAP,
    bounded: true,
    noNamedSpecies: true,
    noStorageEconomy: true,
    noStoredFoodBank: true,
    noAgriculture: true,
    noFullPlantFaunaEcology: true,
    reasonIds: collectResourceEcologyReasonIds(band),
  };
}

export function deriveResourceEcologySupportBreakdown(
  band: Band,
  season: Season,
): ResourceEcologySupportBreakdown {
  const supportDebug = band.carryingCapacity?.perCapitaReturn.supportDebug ?? band.perCapitaReturn?.supportDebug;
  const rawSupport = supportDebug?.rawReachableSupport ?? 0;
  const clampedSupportRatio = supportDebug?.clampedSupportRatio ?? 0;
  const coarseEffects = supportDebug?.resourceClassContributions ?? [];
  const totalCoarseFood = coarseEffects
    .filter((effect) => effect.domain === "food")
    .reduce((sum, effect) => sum + effect.supportContribution, 0);
  const rawScale = rawSupport > 0 && totalCoarseFood > 0 ? rawSupport / totalCoarseFood : 0;
  const drafts = coarseEffects.flatMap((effect) => splitCoarseContribution(effect, rawScale, season));
  const waterRefugeDraft = deriveWaterRefugeDraft(band, rawSupport, season, coarseEffects);
  const allDrafts = waterRefugeDraft === undefined ? drafts : [...drafts, waterRefugeDraft];
  const draftTotal = allDrafts.reduce((sum, draft) => sum + draft.amount, 0);
  const precision = deriveSpecificKnowledgeShare(band);
  const activityPrecision = deriveActivitySpecificShare(band);
  const explainedShare = draftTotal <= 0 || rawSupport <= 0
    ? 0
    : round2(clamp01(0.42 + precision * 0.34 + activityPrecision * 0.16 + Math.min(0.08, (supportDebug?.resourceClassPressureLoss ?? 0) * 0.8)));
  const explainedTarget = rawSupport * explainedShare;
  const scale = draftTotal <= 0 ? 0 : explainedTarget / draftTotal;
  const contributions = mergeFineContributions(allDrafts, scale, band, season, rawSupport);
  const explainedByResourceClass = round2(contributions.reduce((sum, entry) => sum + entry.supportContribution, 0));
  const abstractRemainder = round2(Math.max(0, rawSupport - explainedByResourceClass));
  const topContributingClasses = contributions
    .filter((entry) => entry.supportContribution > 0)
    .sort(compareContributions)
    .slice(0, TOP_SUPPORT_CLASS_LIMIT);
  const weakMissingClasses = deriveWeakMissingClasses(contributions);
  const weightedSeasonalModifier = weightedAverage(
    contributions.filter((entry) => entry.supportContribution > 0).map((entry) => ({
      value: entry.seasonalModifier,
      weight: entry.supportContribution,
    })),
  );

  return {
    totalRawSupport: round2(rawSupport),
    clampedSupportRatio: round2(clampedSupportRatio),
    explainedByResourceClass,
    explainedShare,
    abstractRemainder,
    plantContribution: round2(sumByBroadType(contributions, "plant")),
    aquaticContribution: round2(sumByBroadType(contributions, "aquatic")),
    animalForagingContribution: round2(sumByBroadType(contributions, "animal")),
    fallbackContribution: round2(sumByBroadType(contributions, "fallback")),
    waterRefugeContribution: round2(sumByBroadType(contributions, "water_refuge")),
    topContributingClasses,
    weakMissingClasses,
    seasonalResourceModifier: round2(weightedSeasonalModifier),
    pressureEffects: contributions
      .filter((entry) => entry.pressure > 0.08 || entry.pressureLoss > 0.02)
      .map((entry) => ({
        classId: entry.classId,
        pressure: entry.pressure,
        pressureLoss: entry.pressureLoss,
        reason: `${entry.label} pressure ${entry.pressure}`,
      }))
      .slice(0, 6),
    rawSource: "SupportRatioBreakdown.resourceClassContributions + ResourceKnowledgeState + recentIntraSeasonTrips",
  };
}

export function deriveProtoCampResourceReasonFactors(
  world: WorldState,
  band: Band,
  tileId: TileId,
  current: boolean,
): ProtoCampResourceFactors {
  const support = band.resourceEcology?.support ?? deriveResourceEcologySupportBreakdown(band, world.time.season);
  const nearbyTrips = (band.recentIntraSeasonTrips ?? []).filter((trip) => isNearTile(world, tileId, trip.targetTileId, 2));
  const successByClass = new Map<ResourceEcologyClassId, number>();
  const failureByClass = new Map<ResourceEcologyClassId, number>();

  for (const trip of nearbyTrips) {
    const classId = primaryFineClassForTrip(trip);
    if (classId === undefined) {
      continue;
    }
    if (isSuccessfulTrip(trip)) {
      successByClass.set(classId, (successByClass.get(classId) ?? 0) + 1);
    } else if (isFailedTrip(trip)) {
      failureByClass.set(classId, (failureByClass.get(classId) ?? 0) + 1);
    }
  }

  const positive: ProtoCampFactor[] = [];
  const negative: ProtoCampFactor[] = [];
  const top = support.topContributingClasses;
  const topFood = top.find((entry) => entry.broadType !== "water_refuge" && entry.supportContribution > 0);
  const aquatic = top.find((entry) => entry.broadType === "aquatic" && entry.supportShare >= 0.08);
  const fallback = top.find((entry) => entry.broadType === "fallback" && entry.supportShare >= 0.12);
  const pulse = top.find((entry) => entry.seasonalModifier > 1.05 && entry.supportShare >= 0.06);

  for (const [classId, count] of successByClass) {
    const definition = getDefinition(classId);
    positive.push(factor(`resource memory: successful ${definition.label} nearby`, Math.min(0.12, count * 0.04), "recentIntraSeasonTrips.resourceClassId"));
  }

  for (const trip of nearbyTrips.slice(0, 6)) {
    const animal = trip.animalActivityTrace;
    if (animal === undefined) {
      continue;
    }

    if (animal.outcomeClass === "success" || animal.outcomeClass === "partial" || animal.knowledgeUpdate === "reliable_route_strengthened") {
      const reason =
        animal.protoCampInfluence === "forest_edge_game_signal"
          ? "forest-edge game helped repeated return"
          : animal.protoCampInfluence === "animal_route_signal"
            ? "familiar animal route nearby"
            : "animal hunting signs supported this place";
      positive.push(factor(reason, Math.min(0.12, 0.04 + animal.confidence * 0.08), "recentIntraSeasonTrips.animalActivityTrace"));
    }

    if (animal.protoCampInfluence === "danger_avoidance_signal" || animal.knowledgeUpdate === "danger_caution_added") {
      negative.push(factor("predator or dangerous animal signs weakened the place", Math.min(0.12, animal.dangerRisk * 0.12), "recentIntraSeasonTrips.animalActivityTrace"));
    } else if (animal.protoCampInfluence === "overhunted_scarcity_signal" || animal.knowledgeUpdate === "failure_staled_route") {
      negative.push(factor("overhunting or failed animal route lowered usefulness", Math.min(0.1, 0.04 + animal.pressure * 0.1), "recentIntraSeasonTrips.animalActivityTrace"));
    }
  }

  if (current && aquatic !== undefined) {
    positive.push(factor(`resource memory: ${aquatic.label} helps anchor this place`, Math.min(0.1, aquatic.supportShare * 0.4), "Band.resourceEcology.support.topContributingClasses"));
  }

  if (current && pulse !== undefined) {
    positive.push(factor(`seasonal resource pulse: ${pulse.label}`, Math.min(0.08, pulse.supportShare * 0.3), "Band.resourceEcology.support.seasonalResourceModifier"));
  }

  if (current && fallback !== undefined && band.seasonalSupport?.hungerClassification !== "stable") {
    positive.push(factor(`least-bad refuge supported by ${fallback.label}`, Math.min(0.08, fallback.supportShare * 0.28), "Band.resourceEcology.support.fallbackContribution"));
  }

  if (current && topFood !== undefined && positive.length === 0 && topFood.supportShare >= 0.08) {
    positive.push(factor(`resource memory: ${topFood.label} contributes here`, Math.min(0.06, topFood.supportShare * 0.2), "Band.resourceEcology.support.topContributingClasses"));
  }

  for (const entry of top.slice(0, 5)) {
    if (entry.broadType === "water_refuge" || entry.supportShare < 0.04) {
      continue;
    }
    const storage = getStorageSuitabilityTraits(entry.classId);
    const strength = Math.min(0.09, entry.supportShare * 0.22 + entry.knowledgeConfidence * 0.04);

    if (
      current &&
      (storage.storageSuitability === "excellent" || storage.storageSuitability === "good") &&
      storage.seasonalBufferValue === "high"
    ) {
      positive.push(factor(`storage-ready resource nearby: ${entry.label}`, strength, "Band.resourceEcology.storageSuitabilityCards"));
    }

    if (current && (storage.dryingSuitability === "good" || storage.dryingSuitability === "excellent" || storage.smokingSuitability === "good")) {
      positive.push(factor(`place could help process ${entry.label} before it spoils`, strength, "Band.resourceEcology.storageSuitabilityCards"));
    }

    if (current && storage.crossingMaterialUse !== "none") {
      positive.push(factor(`material for keeping or temporary crossings: ${entry.label}`, strength, "Band.resourceEcology.storageSuitabilityCards"));
    }

    if (storage.perishability === "high" && storage.spoilageRisk === "high") {
      negative.push(factor(`food spoils quickly here: ${entry.label}`, Math.min(0.08, strength), "Band.resourceEcology.storageSuitabilityCards"));
    }

    if (storage.processingLabor === "high" || storage.carryBurden === "high") {
      negative.push(factor(`keeping ${entry.label} costs labor or carrying effort`, Math.min(0.08, strength), "Band.resourceEcology.storageSuitabilityCards"));
    }

    if (storage.riskIfMishandled === "high") {
      negative.push(factor(`mishandled resource remains risky: ${entry.label}`, Math.min(0.08, strength), "Band.resourceEcology.storageSuitabilityCards"));
    }
  }

  for (const [classId, count] of failureByClass) {
    const definition = getDefinition(classId);
    negative.push(factor(`resource failures: ${definition.label}`, Math.min(0.1, count * 0.035), "recentIntraSeasonTrips.activityOutcome"));
  }

  for (const pressure of support.pressureEffects.slice(0, 3)) {
    const definition = getDefinition(pressure.classId);
    if (pressure.pressure >= 0.18) {
      negative.push(factor(`resource pressure: ${definition.label}`, Math.min(0.1, pressure.pressure * 0.18), "SupportRatioBreakdown.pressureByResourceClass"));
    }
  }

  if (support.fallbackContribution > support.plantContribution + support.aquaticContribution && support.fallbackContribution > 0.2) {
    negative.push(factor("fallback dependence is high", 0.08, "Band.resourceEcology.support.fallbackContribution"));
  }

  return {
    positive: positive.sort(compareFactors).slice(0, 4),
    negative: negative.sort(compareFactors).slice(0, 4),
    reasonIds: uniqueStrings([
      ...support.topContributingClasses.map((entry) =>
        `reason:resource-ecology:${band.id}:${tileId}:${entry.classId}`,
      ),
      ...nearbyTrips.flatMap((trip) => trip.animalActivityTrace?.reasonIds.map(String) ?? []),
    ]).slice(0, 8).map((value) => value as ReasonId),
  };
}

function splitCoarseContribution(
  effect: ResourceClassPressureEffect,
  rawScale: number,
  season: Season,
): readonly FineContributionDraft[] {
  const amount = effect.supportContribution * rawScale;
  const pressure = effect.pressure;
  const pressureLoss = effect.pressureLoss;

  switch (effect.classId) {
    case "generic_plant_food":
      return splitWeighted(amount, pressure, pressureLoss, effect.classId, season, [
        ["gathered_plants", 0.34, "general plant gathering"],
        ["fruits_or_pulse_plants", season === "spring" || season === "autumn" ? 0.24 : 0.14, "seasonal plant pulse"],
        ["seeds_nuts_mast", season === "autumn" ? 0.22 : 0.12, "seed/nut/mast pulse"],
        ["wetland_plants", 0.12, "wetland plant share"],
      ]);
    case "aquatic_food":
      return splitWeighted(amount, pressure, pressureLoss, effect.classId, season, [
        ["fish_or_shellfish", 0.56, "fish/shellfish-like aquatic return"],
        ["aquatic_food", 0.32, "broad aquatic food"],
        ["wetland_plants", 0.12, "wetland plant support"],
      ]);
    case "animal_food":
      return splitWeighted(amount, pressure, pressureLoss, effect.classId, season, [
        ["small_game", 0.64, "small-game placeholder"],
        ["large_game_abstract", 0.36, "large-game abstract placeholder"],
      ]);
    case "fallback_food":
      return splitWeighted(amount, pressure, pressureLoss, effect.classId, season, [
        ["roots_tubers_fallback", 0.62, "roots/tubers fallback"],
        ["fallback_foods", 0.38, "fallback food reliance"],
      ]);
    default:
      return [];
  }
}

function splitWeighted(
  amount: number,
  pressure: number,
  pressureLoss: number,
  sourceClassId: ResourceClassId,
  season: Season,
  rows: readonly (readonly [ResourceEcologyClassId, number, string])[],
): readonly FineContributionDraft[] {
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  if (total <= 0 || amount <= 0) {
    return [];
  }

  return rows.map(([classId, weight, reason]) => ({
    classId,
    amount: amount * (weight / total),
    seasonalModifier: seasonalModifierForClass(classId, season),
    pressure: round2(pressure),
    pressureLoss: round2(pressureLoss * (weight / total)),
    abstractSourceClassId: sourceClassId,
    topReason: reason,
  }));
}

function deriveWaterRefugeDraft(
  band: Band,
  rawSupport: number,
  season: Season,
  coarseEffects: readonly ResourceClassPressureEffect[],
): FineContributionDraft | undefined {
  const base = band.carryingCapacity?.baseHabitatPotential;
  const waterPotential = base?.waterPotential ?? 0;
  const waterEffect = coarseEffects.find((effect) => effect.classId === "water_resource");
  const anchorSecurity = band.residentialAnchor?.anchorWaterSecurity ?? 0;
  const stress = band.pressureState?.waterStress ?? 0;
  const amount = rawSupport * clamp01(waterPotential * 0.08 + anchorSecurity * 0.05 + stress * 0.04);

  if (amount <= 0) {
    return undefined;
  }

  return {
    classId: "water_refuge",
    amount,
    seasonalModifier: seasonalModifierForClass("water_refuge", season),
    pressure: round2(waterEffect?.pressure ?? Math.max(0, stress * 0.25)),
    pressureLoss: round2(waterEffect?.pressureLoss ?? 0),
    abstractSourceClassId: "water_resource",
    topReason: "water/refuge support context",
  };
}

function mergeFineContributions(
  drafts: readonly FineContributionDraft[],
  scale: number,
  band: Band,
  season: Season,
  rawSupport: number,
): readonly ResourceEcologyContribution[] {
  const byClass = new Map<ResourceEcologyClassId, FineContributionDraft[]>();
  for (const draft of drafts) {
    byClass.set(draft.classId, [...(byClass.get(draft.classId) ?? []), draft]);
  }

  return [...byClass.entries()]
    .map(([classId, entries]) => {
      const definition = getDefinition(classId);
      const supportContribution = round2(entries.reduce((sum, entry) => sum + entry.amount * scale, 0));
      const pressure = round2(Math.max(0, ...entries.map((entry) => entry.pressure)));
      const pressureLoss = round2(entries.reduce((sum, entry) => sum + entry.pressureLoss * scale, 0));
      const seasonalModifier = round2(weightedAverage(entries.map((entry) => ({ value: entry.seasonalModifier, weight: entry.amount }))));
      const knowledge = getBestKnowledgeForClass(band, classId, supportContribution > 0, season);

      return {
        classId,
        label: definition.label,
        broadType: definition.broadType,
        supportContribution,
        supportShare: rawSupport <= 0 ? 0 : round2(clamp01(supportContribution / rawSupport)),
        seasonalModifier,
        pressure,
        pressureLoss,
        reliability: definition.reliability,
        laborCost: definition.laborCost,
        risk: definition.risk,
        knowledgeState: knowledge.state,
        knowledgeConfidence: knowledge.confidence,
        knowledgeSource: knowledge.source,
        abstractSourceClassId: entries[0]?.abstractSourceClassId,
        realResourceSpecific: knowledge.state === "observed" || knowledge.state === "tested" || knowledge.state === "reliable",
        topReason: entries[0]?.topReason ?? "resource-class support split",
      };
    })
    .sort(compareContributions);
}

function deriveResourceEcologyKnowledgeSummary(
  band: Band,
  tick: TickNumber,
  year: number,
  season: Season,
): ResourceEcologyKnowledgeSummary {
  const memories = band.resourceKnowledgeState?.patchMemories ?? [];
  const topMemories = memories
    .flatMap((memory) => resourceMemoryToKnowledgeMemories(memory, tick, year, season))
    .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label))
    .slice(0, 10);
  const stateCounts = emptyKnowledgeCounts();

  for (const memory of topMemories) {
    stateCounts[memory.knowledgeState] += 1;
  }

  const knownResourceClasses = uniqueResourceEcologyClassIds(topMemories.map((memory) => memory.resourceClassId));
  const fullyKnownWithoutMemoryCount = 0;

  return {
    memoryCount: memories.length,
    memoryCap: band.resourceKnowledgeState?.cap ?? 48,
    withinCap: memories.length <= (band.resourceKnowledgeState?.cap ?? 48),
    stateCounts,
    knownResourceClasses,
    topMemories,
    antiOmniscience: {
      fullyKnownWithoutMemoryCount,
      inferredOnlyWithoutUse: topMemories.every((memory) => memory.source !== "inferred" || memory.knowledgeState === "inferred"),
      noEveryResourceKnown: knownResourceClasses.length < RESOURCE_ECOLOGY_CLASSES.length,
      noHiddenMapResourceTruth: true,
    },
  };
}

function deriveResourcePlaceMemories(
  world: WorldState,
  band: Band,
  support: ResourceEcologySupportBreakdown,
): readonly ResourceEcologyPlaceMemory[] {
  const byKey = new Map<string, ResourceEcologyPlaceMemory>();

  for (const memory of band.resourceKnowledgeState?.patchMemories ?? []) {
    const classIds = fineClassesForCoarseClass(memory.resourceClassId);
    for (const classId of classIds.slice(0, 2)) {
      const key = `${String(memory.approximateTile)}:${classId}`;
      const existing = byKey.get(key);
      const confidence = effectiveResourceConfidence(memory, Number(world.time.tick)).effectiveYieldConfidence;
      byKey.set(key, mergePlaceMemory(existing, {
        tileId: memory.approximateTile,
        resourceClassId: classId,
        label: getDefinition(classId).label,
        visitsOrUses: memory.useHistory.visits,
        seasonalSuccessCount: memory.useHistory.successfulUses,
        seasonalFailureCount: memory.useHistory.failedUses,
        contributionToSupport: support.topContributingClasses.find((entry) => entry.classId === classId)?.supportContribution ?? 0,
        linkedActivityCount: 0,
        linkedEventCount: 0,
        protoCampReasonLinks: protoCampLinksForClass(band, memory.approximateTile, classId),
        pressure: support.pressureEffects.find((entry) => entry.classId === classId)?.pressure ?? 0,
        ...(confidence < 0.25 ? { overuseNote: "low confidence or stale resource memory" } : {}),
        lastUpdatedYear: world.time.year,
        lastUpdatedSeason: world.time.season,
        rawSource: "ResourceKnowledgeState.patchMemories",
      }));
    }
  }

  for (const trip of band.recentIntraSeasonTrips ?? []) {
    const classId = primaryFineClassForTrip(trip);
    if (classId === undefined) {
      continue;
    }
    const key = `${String(trip.targetTileId)}:${classId}`;
    const existing = byKey.get(key);
    byKey.set(key, mergePlaceMemory(existing, {
      tileId: trip.targetTileId,
      resourceClassId: classId,
      label: getDefinition(classId).label,
      visitsOrUses: 1,
      seasonalSuccessCount: isSuccessfulTrip(trip) ? 1 : 0,
      seasonalFailureCount: isFailedTrip(trip) ? 1 : 0,
      contributionToSupport: support.topContributingClasses.find((entry) => entry.classId === classId)?.supportContribution ?? 0,
      linkedActivityCount: 1,
      linkedEventCount: 0,
      protoCampReasonLinks: protoCampLinksForClass(band, trip.targetTileId, classId),
      pressure: support.pressureEffects.find((entry) => entry.classId === classId)?.pressure ?? 0,
      ...(isFailedTrip(trip) ? { overuseNote: "recent resource activity failed or aborted" } : {}),
      lastUpdatedYear: world.time.year,
      lastUpdatedSeason: trip.season,
      rawSource: "recentIntraSeasonTrips.resourceClassId",
    }));
  }

  return [...byKey.values()]
    .filter((entry) => entry.visitsOrUses > 0 || entry.contributionToSupport > 0 || entry.linkedActivityCount > 0)
    .sort((left, right) =>
      right.contributionToSupport - left.contributionToSupport ||
      right.linkedActivityCount - left.linkedActivityCount ||
      String(left.tileId).localeCompare(String(right.tileId)),
    );
}

function deriveActivityResourceTraces(
  band: Band,
  support: ResourceEcologySupportBreakdown,
): readonly ResourceEcologyActivityTrace[] {
  return (band.recentIntraSeasonTrips ?? [])
    .map((trip) => {
      const classId = primaryFineClassForTrip(trip);
      if (classId === undefined) {
        return undefined;
      }
      const supportEntry = support.topContributingClasses.find((entry) => entry.classId === classId);
      return {
        activityType: trip.taskGroupType,
        resourceClassId: classId,
        label: getDefinition(classId).label,
        season: trip.season,
        expectedContribution: supportEntry?.supportContribution ?? 0,
        outcome: trip.activityOutcome,
        knowledgeUpdate: isSuccessfulTrip(trip)
          ? "activity confirmed or refreshed resource knowledge"
          : isFailedTrip(trip)
            ? "activity failure can lower confidence or mark pressure"
            : "activity produced observation only",
        memoryUpdate: "resource/place memory linked to real trip trace",
        storageSuitability: describeActivityStorageImplications(classId),
        targetTileId: trip.targetTileId,
        rawSource: "IntraSeasonTripRecord.resourceClassId + activityOutcome",
      };
    })
    .filter(isDefined)
    .slice(0, RESOURCE_ACTIVITY_TRACE_CAP);
}

function resourceMemoryToKnowledgeMemories(
  memory: ResourcePatchMemory,
  tick: TickNumber,
  year: number,
  season: Season,
): readonly ResourceEcologyKnowledgeMemory[] {
  const effective = effectiveResourceConfidence(memory, Number(tick));
  const classIds = fineClassesForCoarseClass(memory.resourceClassId);
  const state = translateKnowledgeState(memory.state, memory.source, effective.label);
  const source = translateKnowledgeSource(memory.source, memory.state);
  const confidence = round2(Math.max(
    effective.effectivePresenceConfidence,
    effective.effectiveYieldConfidence,
    effective.effectiveSeasonConfidence,
  ));

  return classIds.slice(0, 3).map((classId) => ({
    resourceClassId: classId,
    label: getDefinition(classId).label,
    placeTileId: memory.approximateTile,
    knowledgeState: state,
    confidence,
    source,
    lastUpdatedYear: memory.lastNotedTick === tick ? year : year - Math.floor(effective.stalenessTicks / 4),
    lastUpdatedSeason: memory.seasonality.lastConfirmedSeason ?? season,
    seasonalReliability: round2(effective.effectiveSeasonConfidence),
    successCount: memory.useHistory.successfulUses,
    failureCount: memory.useHistory.failedUses,
    ...(state === "risky" || state === "avoided" ? { riskOrAvoidanceNote: riskNoteForMemory(memory) } : {}),
    rawPatchId: String(memory.patchId),
    rawSource: "ResourceKnowledgeState.patchMemories",
  }));
}

function getBestKnowledgeForClass(
  band: Band,
  classId: ResourceEcologyClassId,
  hasContribution: boolean,
  season: Season,
): {
  readonly state: ResourceEcologyKnowledgeState;
  readonly confidence: NormalizedIntensity;
  readonly source: ResourceEcologyKnowledgeSource;
} {
  const compatible = (band.resourceKnowledgeState?.patchMemories ?? []).filter((memory) =>
    fineClassesForCoarseClass(memory.resourceClassId).includes(classId),
  );

  if (compatible.length === 0) {
    return hasContribution
      ? { state: "inferred", confidence: 0.22, source: "inferred" }
      : { state: "unknown", confidence: 0, source: "inferred" };
  }

  const ranked = compatible
    .map((memory) => {
      const effective = effectiveResourceConfidence(memory, Number(memory.lastNotedTick));
      return {
        memory,
        score: Math.max(
          effective.effectivePresenceConfidence,
          effective.effectiveYieldConfidence,
          effective.effectiveSeasonConfidence,
        ),
      };
    })
    .sort((left, right) => right.score - left.score);
  const best = ranked[0]?.memory;
  if (best === undefined) {
    return hasContribution
      ? { state: "inferred", confidence: 0.22, source: "inferred" }
      : { state: "unknown", confidence: 0, source: "inferred" };
  }
  const effective = effectiveResourceConfidence(best, Number(best.lastNotedTick));
  return {
    state: translateKnowledgeState(best.state, best.source, effective.label),
    confidence: round2(Math.max(effective.effectivePresenceConfidence, effective.effectiveYieldConfidence)),
    source: translateKnowledgeSource(best.source, best.state),
  };
}

function fineClassesForCoarseClass(classId: ResourceClassId): readonly ResourceEcologyClassId[] {
  switch (classId) {
    case "generic_plant_food":
      return ["gathered_plants", "fruits_or_pulse_plants", "seeds_nuts_mast", "wetland_plants"];
    case "aquatic_food":
      return ["fish_or_shellfish", "aquatic_food", "wetland_plants"];
    case "animal_food":
      return ["small_game", "large_game_abstract"];
    case "fallback_food":
      return ["roots_tubers_fallback", "fallback_foods"];
    case "fiber_material":
      return ["reeds_fibers"];
    case "fuel_material":
      return ["fuel_wood"];
    case "medicinal_or_toxic":
      return ["medicinal_toxic_hook"];
    case "water_resource":
      return ["water_refuge"];
    default:
      return [];
  }
}

function primaryFineClassForTrip(trip: IntraSeasonTripRecord): ResourceEcologyClassId | undefined {
  if (trip.taskGroupType === "water_group" || trip.resourceClassId === "water_resource") {
    return "water_refuge";
  }
  if (trip.taskGroupType === "fishing_group" || trip.resourceClassId === "aquatic_food") {
    return "fish_or_shellfish";
  }
  if (trip.taskGroupType === "hunting_group" || trip.resourceClassId === "animal_food") {
    if (trip.animalActivityTrace?.faunaKind === "small_game") {
      return "small_game";
    }
    return "large_game_abstract";
  }
  if (trip.resourceClassId === "fallback_food") {
    return "roots_tubers_fallback";
  }
  if (trip.resourceClassId === "generic_plant_food") {
    return trip.season === "autumn" ? "seeds_nuts_mast" : "gathered_plants";
  }
  if (trip.resourceClassId === undefined) {
    return undefined;
  }
  return fineClassesForCoarseClass(trip.resourceClassId)[0];
}

function translateKnowledgeState(
  state: ResourceKnowledgeStateKind,
  source: ResourceKnowledgeSource,
  stalenessLabel: string,
): ResourceEcologyKnowledgeState {
  if (stalenessLabel === "stale" || stalenessLabel === "dormant" || stalenessLabel === "remembered_location_only") {
    return "stale";
  }
  if (source === "inherited") {
    return "inherited";
  }
  switch (state) {
    case "unknown":
      return "unknown";
    case "suspected":
      return "inferred";
    case "observed":
      return "observed";
    case "used":
      return "tested";
    case "reliable":
      return "reliable";
    case "risky":
      return "risky";
    case "depleted":
    case "seasonally_bad":
      return "avoided";
  }
}

function translateKnowledgeSource(
  source: ResourceKnowledgeSource,
  state: ResourceKnowledgeStateKind,
): ResourceEcologyKnowledgeSource {
  switch (source) {
    case "direct":
      return state === "used" || state === "reliable" ? "activity" : "observed";
    case "inherited":
      return "inherited";
    case "inferred":
      return "inferred";
    case "encounter_shared":
    case "rumored":
      return "scouting";
    case "absorbed":
      return "event";
  }
}

function deriveSpecificKnowledgeShare(band: Band): number {
  const memories = band.resourceKnowledgeState?.patchMemories ?? [];
  if (memories.length === 0) {
    return 0;
  }
  const strong = memories.filter((memory) =>
    memory.state === "observed" ||
    memory.state === "used" ||
    memory.state === "reliable" ||
    memory.source === "inherited",
  ).length;

  return clamp01(strong / 8);
}

function deriveActivitySpecificShare(band: Band): number {
  const trips = band.recentIntraSeasonTrips ?? [];
  if (trips.length === 0) {
    return 0;
  }

  return clamp01(trips.filter((trip) => trip.resourceClassId !== undefined && isSuccessfulTrip(trip)).length / 6);
}

function deriveWeakMissingClasses(contributions: readonly ResourceEcologyContribution[]): readonly ResourceEcologyClassId[] {
  const byId = new Map<ResourceEcologyClassId, ResourceEcologyContribution>(
    contributions.map((entry) => [entry.classId, entry]),
  );

  return RESOURCE_ECOLOGY_CLASSES
    .filter((definition) => definition.supportActiveNow)
    .filter((definition) => {
      const contribution = byId.get(definition.id);
      return contribution === undefined || contribution.supportShare < 0.03 || contribution.knowledgeState === "unknown";
    })
    .map((definition) => definition.id)
    .slice(0, 6);
}

function seasonalModifierForClass(classId: ResourceEcologyClassId, season: Season): number {
  const profile = getDefinition(classId).seasonalAvailabilityProfile;
  if (profile === "wet_recovery") {
    return season === "spring" || season === "summer" ? 1.12 : 0.9;
  }
  if (profile === "pulse_autumn") {
    return season === "autumn" ? 1.18 : 0.86;
  }
  if (profile === "dry_refuge") {
    return season === "summer" || season === "winter" ? 1.08 : 0.98;
  }
  if (profile === "stress_fallback") {
    return season === "winter" || season === "summer" ? 1.04 : 0.96;
  }
  if (profile === "future_hook") {
    return 1;
  }
  return season === "winter" ? 0.92 : 1;
}

function sumByBroadType(contributions: readonly ResourceEcologyContribution[], broadType: ResourceEcologyBroadType): number {
  return contributions
    .filter((entry) => entry.broadType === broadType)
    .reduce((sum, entry) => sum + entry.supportContribution, 0);
}

function protoCampLinksForClass(
  band: Band,
  tileId: TileId,
  classId: ResourceEcologyClassId,
): readonly string[] {
  const place = band.protoCampMemory?.places[tileId];
  if (place === undefined || place.campLikeState === "none") {
    return [];
  }

  const label = getDefinition(classId).label;
  return [`${place.campLikeState}: ${label}`];
}

function mergePlaceMemory(
  previous: ResourceEcologyPlaceMemory | undefined,
  next: ResourceEcologyPlaceMemory,
): ResourceEcologyPlaceMemory {
  if (previous === undefined) {
    return next;
  }

  return {
    ...next,
    visitsOrUses: previous.visitsOrUses + next.visitsOrUses,
    seasonalSuccessCount: previous.seasonalSuccessCount + next.seasonalSuccessCount,
    seasonalFailureCount: previous.seasonalFailureCount + next.seasonalFailureCount,
    contributionToSupport: round2(Math.max(previous.contributionToSupport, next.contributionToSupport)),
    linkedActivityCount: previous.linkedActivityCount + next.linkedActivityCount,
    linkedEventCount: previous.linkedEventCount + next.linkedEventCount,
    protoCampReasonLinks: uniqueStrings([...previous.protoCampReasonLinks, ...next.protoCampReasonLinks]),
    pressure: round2(Math.max(previous.pressure, next.pressure)),
    overuseNote: next.overuseNote ?? previous.overuseNote,
  };
}

function collectResourceEcologyReasonIds(band: Band): readonly ReasonId[] {
  return uniqueStrings([
    ...(band.carryingCapacity?.reasonIds ?? []).map(String),
    ...(band.carryingCapacity?.perCapitaReturn.supportDebug.reasonIds ?? []).map(String),
    ...(band.resourceKnowledgeState?.patchMemories ?? []).flatMap((memory) => memory.reasonIds.map(String)),
    ...(band.recentIntraSeasonTrips ?? []).flatMap((trip) => trip.reasonIds.map(String)),
  ]).slice(0, 16).map((value) => value as ReasonId);
}

function riskNoteForMemory(memory: ResourcePatchMemory): string {
  if (memory.risk.badWater) {
    return "bad water risk remembered";
  }
  if (memory.risk.poisoningOrBadReaction) {
    return "bad reaction risk remembered";
  }
  if (memory.risk.predatorOrAnimalRisk > 0.35) {
    return "animal risk remembered";
  }
  return "resource avoided or depleted";
}

function emptyKnowledgeCounts(): Record<ResourceEcologyKnowledgeState, number> {
  return {
    unknown: 0,
    inferred: 0,
    observed: 0,
    tested: 0,
    reliable: 0,
    risky: 0,
    avoided: 0,
    inherited: 0,
    stale: 0,
  };
}

function getDefinition(classId: ResourceEcologyClassId): ResourceEcologyClassDefinition {
  const definition = DEFINITION_BY_ID.get(classId);
  if (definition === undefined) {
    throw new Error(`Unknown resource ecology class ${classId}`);
  }
  return definition;
}

function isSuccessfulTrip(trip: IntraSeasonTripRecord): boolean {
  return trip.activityOutcome === "successful_observation" ||
    trip.activityOutcome === "target_found" ||
    trip.activityOutcome === "partial_success" ||
    trip.activityOutcome === "returned_with_information";
}

function isFailedTrip(trip: IntraSeasonTripRecord): boolean {
  return trip.activityOutcome === "target_not_found" ||
    trip.activityOutcome === "failed_due_to_distance" ||
    trip.activityOutcome === "failed_due_to_water_risk" ||
    trip.activityOutcome === "failed_due_to_low_memory_confidence" ||
    trip.activityOutcome === "failed_due_to_season_mismatch" ||
    trip.activityOutcome === "abandoned_due_to_risk";
}

function isNearTile(world: WorldState, leftId: TileId, rightId: TileId, maxDistance: number): boolean {
  const left = getTile(world, leftId);
  const right = getTile(world, rightId);
  if (left === undefined || right === undefined) {
    return false;
  }

  return Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.y - right.coord.y) <= maxDistance;
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}

function compareContributions(left: ResourceEcologyContribution, right: ResourceEcologyContribution): number {
  return right.supportContribution - left.supportContribution || left.label.localeCompare(right.label);
}

function compareFactors(left: ProtoCampFactor, right: ProtoCampFactor): number {
  return right.strength - left.strength || left.reason.localeCompare(right.reason);
}

function factor(reason: string, strength: number, rawSource: string): ProtoCampFactor {
  return { reason, strength: round2(clamp01(strength)), rawSource };
}

function weightedAverage(values: readonly { readonly value: number; readonly weight: number }[]): number {
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return 1;
  }

  return values.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function uniqueResourceEcologyClassIds(values: readonly ResourceEcologyClassId[]): readonly ResourceEcologyClassId[] {
  return [...new Set(values)].sort();
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
