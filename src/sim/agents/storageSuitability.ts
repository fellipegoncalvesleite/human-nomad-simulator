import type { ReasonId, TileId } from "../core/types";
import type { RiverCrossingClass, RiverCrossingProfile, RiverSegmentProfile, WorldState } from "../world/types";
import { makeRiverCrossingKey } from "../world/hydrography";
import type {
  ResourceEcologyActivityTrace,
  ResourceEcologyBroadType,
  ResourceEcologyClassId,
  ResourceEcologyKnowledgeSummary,
  ResourceEcologySupportBreakdown,
} from "./resourceEcologyFoundation";
import type { Band, ResidentialMoveStatus } from "./types";
import { deriveEngineeringSafetyRelief } from "./practicalResponses";

export type PerishabilityLevel = "low" | "medium" | "high";
export type StorageSuitabilityLevel = "none" | "poor" | "limited" | "good" | "excellent";
export type CacheSuitabilityLevel = "none" | "poor" | "useful" | "strong";
export type DryingSuitabilityLevel = "none" | "possible" | "good" | "excellent";
export type SmokingSuitabilityLevel = "none" | "possible" | "good";
export type StorageBurdenLevel = "low" | "medium" | "high";
export type StorageConfidenceKind = "observed_use" | "repeated_use" | "memory" | "low_confidence_inference";
export type StorageAntiOmniscienceStatus =
  | "band_known_memory"
  | "activity_observed"
  | "current_place_inference_low_confidence";
export type CrossingMaterialUse =
  | "none"
  | "fiber_lashing"
  | "reed_bundle"
  | "wood_or_bark"
  | "heavy_floatable_wood"
  | "hide_cover";

export interface ResourceStorageSuitabilityTraits {
  readonly perishability: PerishabilityLevel;
  readonly storageSuitability: StorageSuitabilityLevel;
  readonly cacheSuitability: CacheSuitabilityLevel;
  readonly dryingSuitability: DryingSuitabilityLevel;
  readonly smokingSuitability: SmokingSuitabilityLevel;
  readonly processingLabor: StorageBurdenLevel;
  readonly carryBurden: StorageBurdenLevel;
  readonly spoilageRisk: StorageBurdenLevel;
  readonly seasonalBufferValue: StorageBurdenLevel;
  readonly riskIfMishandled: StorageBurdenLevel;
  readonly crossingMaterialUse: CrossingMaterialUse;
}

export interface ResourceActivityStorageInterpretation extends ResourceStorageSuitabilityTraits {
  readonly note: string;
  readonly burdenReason: string;
}

export interface ResourceStorageSuitabilityCard extends ResourceStorageSuitabilityTraits {
  readonly classId: ResourceEcologyClassId;
  readonly label: string;
  readonly broadType: ResourceEcologyBroadType;
  readonly immediateUseValue: number;
  readonly seasonalUsefulness: string;
  readonly storageConfidence: number;
  readonly confidenceKind: StorageConfidenceKind;
  readonly antiOmniscienceStatus: StorageAntiOmniscienceStatus;
  readonly resourceKnownToBand: true;
  readonly protoCampRelevance: "processing_place" | "cache_place" | "material_place" | "caution_only" | "none";
  readonly sourceTileIds: readonly TileId[];
  readonly sourceIds: readonly string[];
  readonly reasons: readonly string[];
  readonly rawSource: string;
}

export interface ResourceStorageSuitabilitySummary {
  readonly cardCount: number;
  readonly cardCap: number;
  readonly coveredClasses: readonly ResourceEcologyClassId[];
  readonly foodCardCount: number;
  readonly materialCardCount: number;
  readonly bestSeasonalBufferClassId?: ResourceEcologyClassId;
  readonly mostPerishableClassId?: ResourceEcologyClassId;
  readonly carryingConcernClassId?: ResourceEcologyClassId;
  readonly seasonalBufferHeadline: string;
  readonly carryingConcern: string;
  readonly crossingMaterialHeadline: string;
  readonly antiOmniscience: {
    readonly hiddenTruthCardCount: 0;
    readonly cardsFromBandKnownSourcesOnly: true;
    readonly lowConfidenceInferenceCount: number;
  };
  readonly guards: {
    readonly noActualStockpile: true;
    readonly noStoredFoodBank: true;
    readonly noGranary: true;
    readonly noSedentism: true;
    readonly noAgriculture: true;
    readonly noPropertyTerritoryTax: true;
  };
}

export type TemporaryWatercraftKind =
  | "log_raft"
  | "reed_bundle_raft"
  | "bark_or_hide_frame_craft"
  | "dugout_logboat_candidate";

export type TemporaryWatercraftResult =
  | "not_considered"
  | "materials_missing"
  | "crossing_delayed_materials"
  | "crossing_abandoned_risk"
  | "crossing_success"
  | "crossing_partial_success";

export type TemporaryWatercraftTraceType =
  | "temporary_watercraft_preparation"
  | "raft_crossing_attempt"
  | "river_crossing_shuttle"
  | "crossing_delayed_materials"
  | "crossing_abandoned_risk"
  | "crossing_success"
  | "crossing_partial_success";

export interface TemporaryWatercraftOption {
  readonly kind: TemporaryWatercraftKind;
  readonly label: string;
  readonly materialBasis: readonly string[];
  readonly laborBurden: StorageBurdenLevel;
  readonly carryingCapacity: "low" | "medium" | "high";
  readonly durability: "low" | "medium";
  readonly confidence: number;
  readonly safety: number;
  readonly shuttleSuitability: number;
  readonly reasons: readonly string[];
}

export interface TemporaryWatercraftAssessment {
  readonly considered: boolean;
  readonly traceType: TemporaryWatercraftTraceType;
  readonly result: TemporaryWatercraftResult;
  readonly reason: string;
  readonly sourceRiverId?: string;
  readonly sourceTileId?: TileId;
  readonly targetTileId?: TileId;
  readonly crossingClass?: RiverCrossingClass;
  readonly watercraftType?: TemporaryWatercraftKind;
  readonly optionLabel?: string;
  readonly optionCount: number;
  readonly optionCap: number;
  readonly bestOption?: TemporaryWatercraftOption;
  readonly materialBasis: readonly string[];
  readonly materialConfidence: number;
  readonly adultLabor: number;
  readonly dependents: number;
  readonly elders: number;
  readonly carryBurden: StorageBurdenLevel;
  readonly shuttleTrips: number;
  readonly riskTolerance: number;
  readonly expectedCrossingSafety: number;
  readonly crossingSafetyBeforeLearning: number;
  readonly engineeringSafetyRelief: number;
  readonly engineeringResponseActive: boolean;
  readonly engineeringResponseId?: string;
  readonly crossingContextKey?: string;
  readonly riverRisk: number;
  readonly seasonExposureRisk: number;
  readonly crossingPathTiles: readonly TileId[];
  readonly routeConfidence: number;
  readonly hardshipKind: "none" | "labor_delay" | "risk_rejection" | "material_limit" | "successful_crossing";
  readonly acuteRiskHint?: "travel_accident" | "aquatic_accident" | "exposure_or_cold_snap";
  readonly protoCampMemoryHint?: "known_crossing_place" | "dangerous_crossing_place" | "material_crossing_place";
  readonly reasonIds: readonly ReasonId[];
  readonly antiOmniscience: {
    readonly knownCrossingOnly: true;
    readonly materialBasisFromKnownResourcesOnly: true;
    readonly noHiddenRiverScan: true;
  };
  readonly guards: {
    readonly noPermanentBoatInventory: true;
    readonly noDockBridgeOrFerry: true;
    readonly noCanoeCulture: true;
    readonly noVillageOrTerritory: true;
  };
}

interface StorageCandidateDraft {
  readonly classId: ResourceEcologyClassId;
  readonly label: string;
  readonly broadType: ResourceEcologyBroadType;
  readonly immediateUseValue: number;
  readonly confidence: number;
  readonly confidenceKind: StorageConfidenceKind;
  readonly antiOmniscienceStatus: StorageAntiOmniscienceStatus;
  readonly sourceTileIds: readonly TileId[];
  readonly sourceIds: readonly string[];
  readonly reasons: readonly string[];
  readonly rawSources: readonly string[];
}

interface MaterialBasis {
  readonly wood: number;
  readonly fiber: number;
  readonly reed: number;
  readonly bark: number;
  readonly hide: number;
  readonly confidence: number;
  readonly basis: readonly string[];
}

interface KnownCrossingCandidate {
  readonly crossing: RiverCrossingProfile;
  readonly distanceScore: number;
  readonly hasMemory: boolean;
  readonly useCount: number;
  readonly successConfidence: number;
}

const STORAGE_CARD_CAP = 8;
const WATERCRAFT_OPTION_CAP = 4;

export function deriveResourceStorageSuitabilityCards(input: {
  readonly band: Band;
  readonly season: string;
  readonly support: ResourceEcologySupportBreakdown;
  readonly knowledge: ResourceEcologyKnowledgeSummary;
  readonly activityTraces: readonly ResourceEcologyActivityTrace[];
}): readonly ResourceStorageSuitabilityCard[] {
  const drafts = new Map<ResourceEcologyClassId, StorageCandidateDraft>();

  for (const contribution of input.support.topContributingClasses) {
    if (contribution.supportContribution <= 0 && contribution.supportShare <= 0) {
      continue;
    }
    const inferredOnly = contribution.knowledgeSource === "inferred";
    addStorageDraft(drafts, {
      classId: contribution.classId,
      label: contribution.label,
      broadType: contribution.broadType,
      immediateUseValue: contribution.supportShare,
      confidence: inferredOnly
        ? Math.min(0.24, Math.max(0.12, contribution.knowledgeConfidence))
        : Math.max(0.28, contribution.knowledgeConfidence),
      confidenceKind: inferredOnly ? "low_confidence_inference" : "memory",
      antiOmniscienceStatus: inferredOnly ? "current_place_inference_low_confidence" : "band_known_memory",
      sourceTileIds: [],
      sourceIds: [`support:${contribution.classId}`],
      reasons: [
        `support share ${round2(contribution.supportShare)}`,
        contribution.topReason,
        `${contribution.knowledgeState}/${contribution.knowledgeSource}`,
      ],
      rawSources: ["ResourceEcologySupportBreakdown.topContributingClasses"],
    });
  }

  for (const memory of input.knowledge.topMemories) {
    addStorageDraft(drafts, {
      classId: memory.resourceClassId,
      label: memory.label,
      broadType: broadTypeForClass(memory.resourceClassId),
      immediateUseValue: Math.min(0.22, (memory.successCount + 1) * 0.04),
      confidence: memory.source === "inferred"
        ? Math.min(0.24, memory.confidence)
        : Math.max(0.26, memory.confidence),
      confidenceKind: memory.successCount >= 2
        ? "repeated_use"
        : memory.source === "inferred"
          ? "low_confidence_inference"
          : "memory",
      antiOmniscienceStatus: memory.source === "inferred" ? "current_place_inference_low_confidence" : "band_known_memory",
      sourceTileIds: [memory.placeTileId],
      sourceIds: [memory.rawPatchId],
      reasons: [
        `memory ${memory.knowledgeState}`,
        `successes ${memory.successCount}`,
        memory.riskOrAvoidanceNote ?? `seasonal reliability ${round2(memory.seasonalReliability)}`,
      ],
      rawSources: [memory.rawSource],
    });
  }

  for (const trace of input.activityTraces) {
    addStorageDraft(drafts, {
      classId: trace.resourceClassId,
      label: trace.label,
      broadType: broadTypeForClass(trace.resourceClassId),
      immediateUseValue: Math.min(0.2, Math.max(0.04, trace.expectedContribution)),
      confidence: trace.outcome.includes("failed") ? 0.3 : 0.58,
      confidenceKind: "observed_use",
      antiOmniscienceStatus: "activity_observed",
      sourceTileIds: [trace.targetTileId],
      sourceIds: [`activity:${trace.activityType}:${String(trace.targetTileId)}`],
      reasons: [
        `activity ${trace.activityType}`,
        `outcome ${trace.outcome}`,
        trace.knowledgeUpdate,
      ],
      rawSources: [trace.rawSource],
    });
  }

  return [...drafts.values()]
    .map((draft) => storageDraftToCard(draft, input.season))
    .filter((card) => card.classId !== "water_refuge" && card.storageConfidence >= 0.12)
    .sort(compareStorageCards)
    .slice(0, STORAGE_CARD_CAP);
}

export function summarizeStorageSuitability(
  cards: readonly ResourceStorageSuitabilityCard[],
): ResourceStorageSuitabilitySummary {
  const bestBuffer = cards.find((card) =>
    card.broadType !== "material_hook" &&
    (card.seasonalBufferValue === "high" || card.storageSuitability === "excellent" || card.storageSuitability === "good")
  );
  const perishable = cards.find((card) =>
    card.perishability === "high" || card.spoilageRisk === "high"
  );
  const carryConcern = cards.find((card) =>
    card.carryBurden === "high" || card.processingLabor === "high"
  );
  const material = cards.find((card) => card.crossingMaterialUse !== "none");
  const lowConfidenceInferenceCount = cards.filter((card) => card.confidenceKind === "low_confidence_inference").length;

  return {
    cardCount: cards.length,
    cardCap: STORAGE_CARD_CAP,
    coveredClasses: uniqueClassIds(cards.map((card) => card.classId)),
    foodCardCount: cards.filter((card) => card.broadType !== "material_hook" && card.broadType !== "water_refuge").length,
    materialCardCount: cards.filter((card) => card.broadType === "material_hook").length,
    bestSeasonalBufferClassId: bestBuffer?.classId,
    mostPerishableClassId: perishable?.classId,
    carryingConcernClassId: carryConcern?.classId,
    seasonalBufferHeadline: bestBuffer === undefined
      ? "No known resource is a strong lean-season storage buffer yet."
      : `${bestBuffer.label} is the clearest known seasonal buffer candidate.`,
    carryingConcern: carryConcern === undefined
      ? "No carrying or processing burden dominates the known resources."
      : `${carryConcern.label} is useful but costly to process or carry.`,
    crossingMaterialHeadline: material === undefined
      ? "No known storage/material card strongly supports temporary crossings."
      : `${material.label} also matters as temporary crossing material.`,
    antiOmniscience: {
      hiddenTruthCardCount: 0,
      cardsFromBandKnownSourcesOnly: true,
      lowConfidenceInferenceCount,
    },
    guards: {
      noActualStockpile: true,
      noStoredFoodBank: true,
      noGranary: true,
      noSedentism: true,
      noAgriculture: true,
      noPropertyTerritoryTax: true,
    },
  };
}

export function getStorageSuitabilityTraits(classId: ResourceEcologyClassId): ResourceStorageSuitabilityTraits {
  switch (classId) {
    case "seeds_nuts_mast":
      return traits("low", "excellent", "strong", "good", "none", "medium", "low", "low", "high", "low", "none");
    case "fruits_or_pulse_plants":
      return traits("high", "poor", "poor", "possible", "none", "low", "medium", "high", "medium", "low", "none");
    case "gathered_plants":
      return traits("medium", "limited", "poor", "possible", "none", "low", "medium", "medium", "low", "low", "none");
    case "roots_tubers_fallback":
      return traits("medium", "good", "useful", "possible", "none", "high", "high", "medium", "high", "medium", "none");
    case "wetland_plants":
      return traits("high", "poor", "poor", "possible", "none", "medium", "medium", "high", "medium", "medium", "reed_bundle");
    case "aquatic_food":
      return traits("high", "poor", "poor", "good", "possible", "high", "high", "high", "medium", "medium", "none");
    case "fish_or_shellfish":
      return traits("high", "limited", "poor", "good", "good", "high", "high", "high", "medium", "medium", "none");
    case "small_game":
      return traits("high", "limited", "useful", "good", "good", "high", "medium", "high", "medium", "medium", "hide_cover");
    case "large_game_abstract":
      return traits("high", "limited", "useful", "excellent", "good", "high", "high", "high", "high", "high", "hide_cover");
    case "fallback_foods":
      return traits("medium", "poor", "poor", "possible", "none", "high", "medium", "medium", "medium", "high", "none");
    case "reeds_fibers":
      return traits("low", "good", "useful", "excellent", "none", "medium", "medium", "low", "low", "low", "fiber_lashing");
    case "fuel_wood":
      return traits("low", "good", "strong", "excellent", "none", "medium", "high", "medium", "low", "low", "heavy_floatable_wood");
    case "medicinal_toxic_hook":
      return traits("medium", "poor", "poor", "possible", "none", "medium", "low", "medium", "low", "high", "none");
    case "water_refuge":
      return traits("high", "none", "none", "none", "none", "low", "high", "high", "low", "medium", "none");
  }
}

export function describeActivityStorageImplications(classId: ResourceEcologyClassId): ResourceActivityStorageInterpretation {
  const trait = getStorageSuitabilityTraits(classId);
  const note =
    trait.storageSuitability === "excellent" || trait.storageSuitability === "good"
      ? `${labelForClass(classId)} could buffer a later lean season if handled well.`
      : trait.perishability === "high"
        ? `${labelForClass(classId)} helps now but spoils quickly without work.`
        : broadTypeForClass(classId) === "material_hook"
          ? `${labelForClass(classId)} is a material keeping/crossing hook, not food surplus.`
          : `${labelForClass(classId)} has only limited keeping value.`;
  const burdenReason =
    trait.processingLabor === "high"
      ? "processing labor high"
      : trait.carryBurden === "high"
        ? "carrying burden high"
        : trait.spoilageRisk === "high"
          ? "spoilage risk high"
          : "bounded storage burden";

  return {
    ...trait,
    note,
    burdenReason,
  };
}

export function deriveTemporaryWatercraftAssessmentForMove(input: {
  readonly world: WorldState;
  readonly band: Band;
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly landRouteStatus: ResidentialMoveStatus;
  readonly landRouteDistance: number;
  readonly storageCards: readonly ResourceStorageSuitabilityCard[];
  readonly reasonIds: readonly ReasonId[];
}): TemporaryWatercraftAssessment | undefined {
  const crossing = chooseKnownCrossingCandidate(input.world, input.band, input.fromTileId, input.toTileId);
  const directWaterBlock = input.landRouteStatus === "failed_no_route";
  const shouldConsider =
    directWaterBlock ||
    crossing !== undefined ||
    input.reasonIds.some((reasonId) => String(reasonId).includes("river") || String(reasonId).includes("cross"));

  if (!shouldConsider) {
    return undefined;
  }

  const material = deriveKnownMaterialBasis(input.band, input.storageCards);
  const river = crossing === undefined ? undefined : input.world.rivers[crossing.crossing.riverId];
  const riverRisk = crossing === undefined ? 0.48 : estimateRiverRisk(input.world, crossing.crossing, river);
  const options = [...deriveWatercraftOptions(material, riverRisk, river, crossing?.useCount ?? 0)]
    .sort(compareWatercraftOptions)
    .slice(0, WATERCRAFT_OPTION_CAP);
  const population = Math.max(1, input.band.demography.population);
  const adultLabor = Math.max(0, input.band.demography.workingAdults);
  const dependents = Math.max(0, input.band.demography.dependents);
  const elders = Math.max(0, input.band.demography.elders);
  const carryBurden = summarizeKnownCarryBurden(input.storageCards);
  const carryLoad = burdenScore(carryBurden);
  const dependencyLoad = clamp01((dependents + elders * 1.1) / population);
  const laborNeed = clamp01(population / Math.max(1, adultLabor * 2.8) + carryLoad * 0.24 + dependencyLoad * 0.22);
  const stress = Math.max(input.band.pressureState?.foodStress ?? 0, input.band.pressureState?.waterStress ?? 0);
  const riskTolerance = round2(clamp01(0.34 + stress * 0.34 + (input.band.seasonalSupport?.hungerClassification === "crisis_deficit" ? 0.16 : 0)));
  const seasonExposureRisk = seasonalExposureRisk(input.world.time.season, river);
  const best = options[0];
  const crossingContextKey = crossing === undefined
    ? undefined
    : `${String(crossing.crossing.riverId)}:${String(crossing.crossing.fromTileId)}->${String(crossing.crossing.toTileId)}`;
  const engineeringRelief = deriveEngineeringSafetyRelief(
    input.band,
    Number(input.world.time.tick),
    crossingContextKey,
  );
  const crossingSafetyBeforeLearning = best === undefined
    ? 0
    : round2(clamp01(best.safety - riverRisk * 0.34 - laborNeed * 0.18 - seasonExposureRisk * 0.14 + riskTolerance * 0.12));
  const expectedCrossingSafety = round2(clamp01(
    crossingSafetyBeforeLearning + (engineeringRelief.active ? engineeringRelief.relief : 0),
  ));
  const shuttleTrips = best === undefined
    ? 0
    : Math.max(1, Math.ceil((population * (0.65 + carryLoad * 0.45)) / watercraftTripCapacity(best.kind)));
  const result = classifyWatercraftResult({
    directWaterBlock,
    best,
    material,
    riverRisk,
    riskTolerance,
    laborNeed,
    expectedCrossingSafety,
    seasonExposureRisk,
    dependencyLoad,
    engineeringResponseActive: engineeringRelief.active,
  });
  const pathTiles = result === "crossing_success" || result === "crossing_partial_success"
    ? buildWatercraftPath(input.fromTileId, input.toTileId, crossing?.crossing)
    : [];

  return {
    considered: true,
    traceType: traceTypeForWatercraftResult(result),
    result,
    reason: describeWatercraftResult(result, best, material, riverRisk, laborNeed, dependencyLoad),
    sourceRiverId: crossing === undefined ? undefined : String(crossing.crossing.riverId),
    sourceTileId: crossing?.crossing.fromTileId,
    targetTileId: crossing?.crossing.toTileId,
    crossingClass: crossing?.crossing.crossingClass,
    watercraftType: best?.kind,
    optionLabel: best?.label,
    optionCount: options.length,
    optionCap: WATERCRAFT_OPTION_CAP,
    bestOption: best,
    materialBasis: material.basis,
    materialConfidence: material.confidence,
    adultLabor: round2(adultLabor),
    dependents: round2(dependents),
    elders: round2(elders),
    carryBurden,
    shuttleTrips,
    riskTolerance,
    expectedCrossingSafety,
    crossingSafetyBeforeLearning,
    engineeringSafetyRelief: engineeringRelief.active ? engineeringRelief.relief : 0,
    engineeringResponseActive: engineeringRelief.active,
    engineeringResponseId: engineeringRelief.responseId,
    crossingContextKey,
    riverRisk: round2(riverRisk),
    seasonExposureRisk,
    crossingPathTiles: pathTiles,
    routeConfidence: round2(clamp01((crossing?.successConfidence ?? 0.18) + material.confidence * 0.28 - riverRisk * 0.2)),
    hardshipKind:
      result === "crossing_success" || result === "crossing_partial_success" ? "successful_crossing" :
      result === "crossing_abandoned_risk" ? "risk_rejection" :
      result === "materials_missing" ? "material_limit" :
      result === "crossing_delayed_materials" ? "labor_delay" :
      "none",
    acuteRiskHint:
      result === "crossing_abandoned_risk" && seasonExposureRisk >= 0.3 ? "exposure_or_cold_snap" :
      result === "crossing_abandoned_risk" || result === "crossing_partial_success" ? "aquatic_accident" :
      best !== undefined && shuttleTrips >= 4 ? "travel_accident" :
      undefined,
    protoCampMemoryHint:
      result === "crossing_abandoned_risk" ? "dangerous_crossing_place" :
      best !== undefined && material.basis.length > 0 ? "material_crossing_place" :
      crossing !== undefined ? "known_crossing_place" :
      undefined,
    reasonIds: input.reasonIds.slice(0, 8),
    antiOmniscience: {
      knownCrossingOnly: true,
      materialBasisFromKnownResourcesOnly: true,
      noHiddenRiverScan: true,
    },
    guards: {
      noPermanentBoatInventory: true,
      noDockBridgeOrFerry: true,
      noCanoeCulture: true,
      noVillageOrTerritory: true,
    },
  };
}

function addStorageDraft(
  drafts: Map<ResourceEcologyClassId, StorageCandidateDraft>,
  next: StorageCandidateDraft,
): void {
  const previous = drafts.get(next.classId);
  if (previous === undefined) {
    drafts.set(next.classId, next);
    return;
  }

  drafts.set(next.classId, {
    ...next,
    immediateUseValue: round2(Math.max(previous.immediateUseValue, next.immediateUseValue)),
    confidence: round2(Math.max(previous.confidence, next.confidence)),
    confidenceKind: mergeConfidenceKind(previous.confidenceKind, next.confidenceKind),
    antiOmniscienceStatus: mergeAntiOmniscienceStatus(previous.antiOmniscienceStatus, next.antiOmniscienceStatus),
    sourceTileIds: uniqueTileIds([...previous.sourceTileIds, ...next.sourceTileIds]).slice(0, 4),
    sourceIds: uniqueStrings([...previous.sourceIds, ...next.sourceIds]).slice(0, 5),
    reasons: uniqueStrings([...previous.reasons, ...next.reasons]).slice(0, 6),
    rawSources: uniqueStrings([...previous.rawSources, ...next.rawSources]).slice(0, 4),
  });
}

function storageDraftToCard(draft: StorageCandidateDraft, season: string): ResourceStorageSuitabilityCard {
  const trait = getStorageSuitabilityTraits(draft.classId);
  const seasonalUsefulness = seasonalUsefulnessForClass(draft.classId, trait, season);
  const protoCampRelevance = getProtoCampStorageRelevance(draft.classId, trait);

  return {
    classId: draft.classId,
    label: draft.label,
    broadType: draft.broadType,
    ...trait,
    immediateUseValue: round2(clamp01(draft.immediateUseValue)),
    seasonalUsefulness,
    storageConfidence: round2(clamp01(draft.confidence)),
    confidenceKind: draft.confidenceKind,
    antiOmniscienceStatus: draft.antiOmniscienceStatus,
    resourceKnownToBand: true,
    protoCampRelevance,
    sourceTileIds: draft.sourceTileIds,
    sourceIds: draft.sourceIds,
    reasons: uniqueStrings([
      ...draft.reasons,
      storageReasonForTraits(draft.classId, trait),
      seasonalUsefulness,
    ]).slice(0, 6),
    rawSource: draft.rawSources.join(" + "),
  };
}

function traits(
  perishability: PerishabilityLevel,
  storageSuitability: StorageSuitabilityLevel,
  cacheSuitability: CacheSuitabilityLevel,
  dryingSuitability: DryingSuitabilityLevel,
  smokingSuitability: SmokingSuitabilityLevel,
  processingLabor: StorageBurdenLevel,
  carryBurden: StorageBurdenLevel,
  spoilageRisk: StorageBurdenLevel,
  seasonalBufferValue: StorageBurdenLevel,
  riskIfMishandled: StorageBurdenLevel,
  crossingMaterialUse: CrossingMaterialUse,
): ResourceStorageSuitabilityTraits {
  return {
    perishability,
    storageSuitability,
    cacheSuitability,
    dryingSuitability,
    smokingSuitability,
    processingLabor,
    carryBurden,
    spoilageRisk,
    seasonalBufferValue,
    riskIfMishandled,
    crossingMaterialUse,
  };
}

function seasonalUsefulnessForClass(
  classId: ResourceEcologyClassId,
  trait: ResourceStorageSuitabilityTraits,
  season: string,
): string {
  if (classId === "seeds_nuts_mast" && season === "autumn") {
    return "autumn pulse can buffer later lean pressure";
  }
  if ((classId === "fish_or_shellfish" || classId === "aquatic_food") && (season === "winter" || season === "summer")) {
    return "useful immediate water-edge buffer, not a safe store without work";
  }
  if (classId === "roots_tubers_fallback") {
    return "fallback value rises in lean seasons, but labor stays high";
  }
  if (broadTypeForClass(classId) === "material_hook") {
    return "material hook for keeping, drying, shelter, or temporary crossings";
  }
  if (trait.seasonalBufferValue === "high") {
    return "known resource could reduce later seasonal fear";
  }
  if (trait.perishability === "high") {
    return "helps this season but fades quickly";
  }
  return "bounded seasonal usefulness";
}

function storageReasonForTraits(classId: ResourceEcologyClassId, trait: ResourceStorageSuitabilityTraits): string {
  if (trait.storageSuitability === "excellent" || trait.storageSuitability === "good") {
    return `${labelForClass(classId)} keeps better than wet foods`;
  }
  if (trait.perishability === "high") {
    return `${labelForClass(classId)} spoils quickly unless processed`;
  }
  if (trait.crossingMaterialUse !== "none") {
    return `${labelForClass(classId)} is useful material, not a food bank`;
  }
  if (trait.processingLabor === "high") {
    return `${labelForClass(classId)} needs costly processing`;
  }
  return `${labelForClass(classId)} has limited storage meaning`;
}

function getProtoCampStorageRelevance(
  classId: ResourceEcologyClassId,
  trait: ResourceStorageSuitabilityTraits,
): ResourceStorageSuitabilityCard["protoCampRelevance"] {
  if (classId === "reeds_fibers" || classId === "fuel_wood") {
    return "material_place";
  }
  if (trait.spoilageRisk === "high" || trait.riskIfMishandled === "high") {
    return "caution_only";
  }
  if (trait.cacheSuitability === "strong" || trait.storageSuitability === "excellent") {
    return "cache_place";
  }
  if (trait.dryingSuitability === "good" || trait.dryingSuitability === "excellent" || trait.smokingSuitability === "good") {
    return "processing_place";
  }
  return "none";
}

function deriveKnownMaterialBasis(
  band: Band,
  cards: readonly ResourceStorageSuitabilityCard[],
): MaterialBasis {
  let wood = 0;
  let fiber = 0;
  let reed = 0;
  let bark = 0;
  let hide = 0;
  const basis: string[] = [];

  for (const card of cards) {
    if (card.classId === "reeds_fibers" || card.crossingMaterialUse === "fiber_lashing") {
      fiber = Math.max(fiber, card.storageConfidence);
      reed = Math.max(reed, card.storageConfidence * 0.9);
      basis.push(`${card.label}: lashing/fiber`);
    }
    if (card.classId === "wetland_plants" || card.crossingMaterialUse === "reed_bundle") {
      reed = Math.max(reed, card.storageConfidence * 0.8);
      fiber = Math.max(fiber, card.storageConfidence * 0.55);
      basis.push(`${card.label}: reed/bundle material`);
    }
    if (card.classId === "fuel_wood" || card.crossingMaterialUse === "heavy_floatable_wood") {
      wood = Math.max(wood, card.storageConfidence);
      bark = Math.max(bark, card.storageConfidence * 0.55);
      basis.push(`${card.label}: logs/wood`);
    }
    if (card.classId === "large_game_abstract" || card.classId === "small_game") {
      hide = Math.max(hide, card.storageConfidence * 0.6);
      basis.push(`${card.label}: possible hide/skin from recent animal use`);
    }
  }

  for (const forest of band.visibleNature?.forestCards ?? []) {
    if (forest.woodFuelMaterialHook >= 0.38 && forest.confidence >= 0.24) {
      wood = Math.max(wood, forest.woodFuelMaterialHook * forest.confidence);
      bark = Math.max(bark, forest.woodFuelMaterialHook * 0.4);
      basis.push(`${forest.label}: visible wood/bark hook`);
    }
  }

  for (const plant of band.visibleNature?.plantCards ?? []) {
    if (plant.plantClassId === "fiber_reed" && plant.confidence >= 0.22) {
      fiber = Math.max(fiber, plant.confidence);
      reed = Math.max(reed, plant.confidence * Math.max(0.4, plant.abundance));
      basis.push(`${plant.label}: visible fiber/reed`);
    }
  }

  for (const trip of band.recentIntraSeasonTrips?.slice(0, 6) ?? []) {
    if (trip.animalActivityTrace !== undefined && (trip.activityOutcome === "target_found" || trip.activityOutcome === "partial_success")) {
      hide = Math.max(hide, 0.36 + trip.animalActivityTrace.confidence * 0.24);
      basis.push(`${trip.animalActivityTrace.faunaKind}: recent hide/skin hook`);
    }
    if (trip.plantPatchTrace?.plantClassId === "fiber_reed") {
      fiber = Math.max(fiber, 0.44);
      reed = Math.max(reed, 0.42);
      basis.push("recent fiber/reed activity trace");
    }
  }

  return {
    wood: round2(clamp01(wood)),
    fiber: round2(clamp01(fiber)),
    reed: round2(clamp01(reed)),
    bark: round2(clamp01(bark)),
    hide: round2(clamp01(hide)),
    confidence: round2(clamp01((wood + fiber + reed + bark + hide) / 3)),
    basis: uniqueStrings(basis).slice(0, 6),
  };
}

function deriveWatercraftOptions(
  material: MaterialBasis,
  riverRisk: number,
  river: RiverSegmentProfile | undefined,
  useCount: number,
): readonly TemporaryWatercraftOption[] {
  const options: TemporaryWatercraftOption[] = [];
  const calmWater = river === undefined
    ? 0.35
    : river.flowStrength === "weak"
      ? 0.78
      : river.flowStrength === "moderate"
        ? 0.48
        : 0.18;

  if (material.wood >= 0.28 && material.fiber >= 0.2) {
    options.push(makeWatercraftOption("log_raft", material, "high", "high", "medium", clamp01(material.wood * 0.42 + material.fiber * 0.34 + calmWater * 0.18 - riverRisk * 0.12), [
      "tree/wood plus lashing basis",
      "heavy labor but carries loads",
    ]));
  }

  if (material.reed >= 0.32 && material.fiber >= 0.2) {
    options.push(makeWatercraftOption("reed_bundle_raft", material, "medium", "medium", "low", clamp01(material.reed * 0.42 + material.fiber * 0.28 + calmWater * 0.26 - riverRisk * 0.18), [
      "reed/fiber basis",
      "limited load and weak in strong current",
    ]));
  }

  if ((material.bark >= 0.24 || material.hide >= 0.24) && material.fiber >= 0.26 && material.wood >= 0.18) {
    options.push(makeWatercraftOption("bark_or_hide_frame_craft", material, "high", "medium", "medium", clamp01(material.bark * 0.22 + material.hide * 0.22 + material.fiber * 0.24 + material.wood * 0.18 + Math.min(0.12, useCount * 0.04) - riverRisk * 0.12), [
      "bark/hide/frame possibility grounded by material memory",
      "higher craft difficulty",
    ]));
  }

  if (material.wood >= 0.58 && material.fiber >= 0.22 && useCount >= 2) {
    options.push(makeWatercraftOption("dugout_logboat_candidate", material, "high", "high", "medium", clamp01(material.wood * 0.42 + Math.min(0.18, useCount * 0.05) - riverRisk * 0.18), [
      "large wood and repeated crossing memory",
      "possible but costly; not quick emergency craft",
    ]));
  }

  return options;
}

function makeWatercraftOption(
  kind: TemporaryWatercraftKind,
  material: MaterialBasis,
  laborBurden: StorageBurdenLevel,
  carryingCapacity: "low" | "medium" | "high",
  durability: "low" | "medium",
  safety: number,
  reasons: readonly string[],
): TemporaryWatercraftOption {
  return {
    kind,
    label: labelWatercraft(kind),
    materialBasis: material.basis,
    laborBurden,
    carryingCapacity,
    durability,
    confidence: round2(clamp01(material.confidence * 0.62 + safety * 0.38)),
    safety: round2(clamp01(safety)),
    shuttleSuitability: round2(clamp01(watercraftTripCapacity(kind) / 18 + safety * 0.28)),
    reasons,
  };
}

function chooseKnownCrossingCandidate(
  world: WorldState,
  band: Band,
  fromTileId: TileId,
  toTileId: TileId,
): KnownCrossingCandidate | undefined {
  const from = world.tiles[fromTileId];
  const to = world.tiles[toTileId];
  if (from === undefined || to === undefined) {
    return undefined;
  }

  const candidateKeys = new Set<string>();
  for (const memory of Object.values(band.crossingMemories)) {
    candidateKeys.add(makeRiverCrossingKey(memory.crossingTileA, memory.crossingTileB));
  }
  for (const tileId of Object.keys(band.knowledge.observedTiles) as TileId[]) {
    const tile = world.tiles[tileId];
    if (tile === undefined) {
      continue;
    }
    for (const neighborId of tile.neighbors) {
      candidateKeys.add(makeRiverCrossingKey(tile.id, neighborId));
    }
  }

  const candidates: KnownCrossingCandidate[] = [];
  for (const key of [...candidateKeys].sort()) {
    const crossing = world.riverCrossings[key];
    if (crossing === undefined) {
      continue;
    }
    const memory = band.crossingMemories[makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId)];
    const a = world.tiles[crossing.fromTileId];
    const b = world.tiles[crossing.toTileId];
    if (a === undefined || b === undefined) {
      continue;
    }
    const nearDistance = Math.min(
      gridDistance(from, a) + gridDistance(to, b),
      gridDistance(from, b) + gridDistance(to, a),
    );
    candidates.push({
      crossing,
      distanceScore: nearDistance,
      hasMemory: memory !== undefined,
      useCount: memory?.useCount ?? 0,
      successConfidence: memory?.successConfidence ?? crossing.confidence * 0.45,
    });
  }

  return candidates
    .sort((left, right) =>
      left.distanceScore - right.distanceScore ||
      Number(right.hasMemory) - Number(left.hasMemory) ||
      right.successConfidence - left.successConfidence ||
      makeRiverCrossingKey(left.crossing.fromTileId, left.crossing.toTileId)
        .localeCompare(makeRiverCrossingKey(right.crossing.fromTileId, right.crossing.toTileId)),
    )[0];
}

function classifyWatercraftResult(input: {
  readonly directWaterBlock: boolean;
  readonly best: TemporaryWatercraftOption | undefined;
  readonly material: MaterialBasis;
  readonly riverRisk: number;
  readonly riskTolerance: number;
  readonly laborNeed: number;
  readonly expectedCrossingSafety: number;
  readonly seasonExposureRisk: number;
  readonly dependencyLoad: number;
  readonly engineeringResponseActive: boolean;
}): TemporaryWatercraftResult {
  if (input.best === undefined || input.material.confidence < 0.18) {
    return "materials_missing";
  }
  if (input.riverRisk > input.riskTolerance + 0.28 || input.seasonExposureRisk >= 0.5) {
    return "crossing_abandoned_risk";
  }
  if (input.laborNeed >= 0.72 || (input.dependencyLoad >= 0.46 && input.best.carryingCapacity === "low")) {
    return input.directWaterBlock ? "crossing_delayed_materials" : "crossing_partial_success";
  }
  if (input.engineeringResponseActive && input.expectedCrossingSafety >= 0.42 && input.riverRisk <= input.riskTolerance + 0.16) {
    return "crossing_success";
  }
  if (input.expectedCrossingSafety >= 0.28) {
    return "crossing_partial_success";
  }
  return "crossing_abandoned_risk";
}

function describeWatercraftResult(
  result: TemporaryWatercraftResult,
  option: TemporaryWatercraftOption | undefined,
  material: MaterialBasis,
  riverRisk: number,
  laborNeed: number,
  dependencyLoad: number,
): string {
  switch (result) {
    case "materials_missing":
      return "temporary crossing was considered, but known wood/fiber/reed material was too weak";
    case "crossing_delayed_materials":
      return `${option?.label ?? "temporary craft"} needed preparation; labor/load/dependents made the crossing a delay`;
    case "crossing_abandoned_risk":
      return `river risk ${round2(riverRisk)} outweighed known material confidence ${round2(material.confidence)}`;
    case "crossing_success":
      return `${option?.label ?? "temporary craft"} supported a whole-band crossing with shuttle work`;
    case "crossing_partial_success":
      return `${option?.label ?? "temporary craft"} helped, but load ${round2(laborNeed)} and dependents ${round2(dependencyLoad)} made it partial`;
    case "not_considered":
      return "no grounded crossing was salient";
  }
}

function traceTypeForWatercraftResult(result: TemporaryWatercraftResult): TemporaryWatercraftTraceType {
  switch (result) {
    case "crossing_success":
      return "river_crossing_shuttle";
    case "crossing_partial_success":
      return "crossing_partial_success";
    case "crossing_delayed_materials":
    case "materials_missing":
      return "crossing_delayed_materials";
    case "crossing_abandoned_risk":
      return "crossing_abandoned_risk";
    case "not_considered":
      return "raft_crossing_attempt";
  }
}

function estimateRiverRisk(
  world: WorldState,
  crossing: RiverCrossingProfile,
  river: RiverSegmentProfile | undefined,
): number {
  const flood = river?.floodSeason === world.time.season ? 0.18 : 0;
  const flow =
    river?.flowStrength === "strong" ? 0.18 :
    river?.flowStrength === "moderate" ? 0.08 :
    0;
  const width =
    river?.widthClass === "very_wide" ? 0.2 :
    river?.widthClass === "wide" ? 0.14 :
    river?.widthClass === "medium" ? 0.08 :
    0.02;
  return clamp01(crossing.risk + crossing.seasonalCostModifier * 0.14 + flood + flow + width);
}

function buildWatercraftPath(
  fromTileId: TileId,
  toTileId: TileId,
  crossing: RiverCrossingProfile | undefined,
): readonly TileId[] {
  if (crossing === undefined) {
    return [fromTileId, toTileId];
  }
  return uniqueTileIds([fromTileId, crossing.fromTileId, crossing.toTileId, toTileId]);
}

function seasonalExposureRisk(season: string, river: RiverSegmentProfile | undefined): number {
  const flood = river?.floodSeason === season ? 0.18 : 0;
  const cold = season === "winter" ? 0.22 : 0;
  const hot = season === "summer" ? 0.08 : 0;
  return round2(clamp01(flood + cold + hot));
}

function summarizeKnownCarryBurden(cards: readonly ResourceStorageSuitabilityCard[]): StorageBurdenLevel {
  const top = cards
    .filter((card) => card.immediateUseValue > 0.02 || card.storageConfidence >= 0.3)
    .sort((left, right) =>
      burdenScore(right.carryBurden) - burdenScore(left.carryBurden) ||
      right.immediateUseValue - left.immediateUseValue,
    )[0];
  return top?.carryBurden ?? "medium";
}

function broadTypeForClass(classId: ResourceEcologyClassId): ResourceEcologyBroadType {
  switch (classId) {
    case "aquatic_food":
    case "fish_or_shellfish":
      return "aquatic";
    case "small_game":
    case "large_game_abstract":
      return "animal";
    case "roots_tubers_fallback":
    case "fallback_foods":
      return "fallback";
    case "reeds_fibers":
    case "fuel_wood":
    case "medicinal_toxic_hook":
      return "material_hook";
    case "water_refuge":
      return "water_refuge";
    default:
      return "plant";
  }
}

function labelForClass(classId: ResourceEcologyClassId): string {
  switch (classId) {
    case "gathered_plants": return "gathered plants";
    case "fruits_or_pulse_plants": return "fruits / pulse plants";
    case "roots_tubers_fallback": return "roots / tubers fallback";
    case "seeds_nuts_mast": return "seeds / nuts / mast";
    case "wetland_plants": return "wetland plants";
    case "aquatic_food": return "aquatic food";
    case "fish_or_shellfish": return "fish / shellfish";
    case "small_game": return "small game";
    case "large_game_abstract": return "large game abstract";
    case "fallback_foods": return "fallback foods";
    case "reeds_fibers": return "reeds / fibers";
    case "fuel_wood": return "fuel wood";
    case "medicinal_toxic_hook": return "medicinal / toxic hook";
    case "water_refuge": return "water / refuge";
  }
}

function labelWatercraft(kind: TemporaryWatercraftKind): string {
  switch (kind) {
    case "log_raft":
      return "log raft";
    case "reed_bundle_raft":
      return "reed / bundle raft";
    case "bark_or_hide_frame_craft":
      return "bark / hide frame craft";
    case "dugout_logboat_candidate":
      return "dugout/logboat candidate";
  }
}

function mergeConfidenceKind(
  left: StorageConfidenceKind,
  right: StorageConfidenceKind,
): StorageConfidenceKind {
  const rank: Record<StorageConfidenceKind, number> = {
    repeated_use: 4,
    observed_use: 3,
    memory: 2,
    low_confidence_inference: 1,
  };
  return rank[right] > rank[left] ? right : left;
}

function mergeAntiOmniscienceStatus(
  left: StorageAntiOmniscienceStatus,
  right: StorageAntiOmniscienceStatus,
): StorageAntiOmniscienceStatus {
  const rank: Record<StorageAntiOmniscienceStatus, number> = {
    activity_observed: 3,
    band_known_memory: 2,
    current_place_inference_low_confidence: 1,
  };
  return rank[right] > rank[left] ? right : left;
}

function compareStorageCards(left: ResourceStorageSuitabilityCard, right: ResourceStorageSuitabilityCard): number {
  return (
    burdenScore(right.seasonalBufferValue) - burdenScore(left.seasonalBufferValue) ||
    storageRank(right.storageSuitability) - storageRank(left.storageSuitability) ||
    right.immediateUseValue - left.immediateUseValue ||
    right.storageConfidence - left.storageConfidence ||
    left.label.localeCompare(right.label)
  );
}

function compareWatercraftOptions(left: TemporaryWatercraftOption, right: TemporaryWatercraftOption): number {
  return (
    right.safety - left.safety ||
    right.confidence - left.confidence ||
    right.shuttleSuitability - left.shuttleSuitability ||
    left.kind.localeCompare(right.kind)
  );
}

function storageRank(value: StorageSuitabilityLevel): number {
  switch (value) {
    case "excellent": return 4;
    case "good": return 3;
    case "limited": return 2;
    case "poor": return 1;
    case "none": return 0;
  }
}

function burdenScore(level: StorageBurdenLevel): number {
  switch (level) {
    case "high": return 1;
    case "medium": return 0.55;
    case "low": return 0.18;
  }
}

function watercraftTripCapacity(kind: TemporaryWatercraftKind): number {
  switch (kind) {
    case "log_raft": return 14;
    case "reed_bundle_raft": return 7;
    case "bark_or_hide_frame_craft": return 9;
    case "dugout_logboat_candidate": return 12;
  }
}

function gridDistance(
  left: { readonly coord: { readonly x: number; readonly y: number } },
  right: { readonly coord: { readonly x: number; readonly y: number } },
): number {
  return Math.abs(left.coord.x - right.coord.x) + Math.abs(left.coord.y - right.coord.y);
}

function uniqueClassIds(values: readonly ResourceEcologyClassId[]): readonly ResourceEcologyClassId[] {
  return [...new Set(values)].sort();
}

function uniqueTileIds(values: readonly TileId[]): readonly TileId[] {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)));
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
