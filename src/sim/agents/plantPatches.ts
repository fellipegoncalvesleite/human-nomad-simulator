import type { ReasonId, ResourcePatchId, Season, TickNumber, TileId, WorldTime } from "../core/types";
import type { ResourceClassId } from "./resourceClasses";
import type { Tile } from "../world/types";

export type PlantClassId =
  | "fruit_berry"
  | "nuts_mast"
  | "roots_tubers_uso"
  | "wild_grain_seed"
  | "leaf_green"
  | "wetland_plant"
  | "aquatic_plant"
  | "fiber_reed"
  | "fuel_wood"
  | "medicinal_toxic";

export type PlantDomain = "food" | "material" | "medicinal_toxic" | "future";
export type PlantAbundancePattern = "pulse" | "mast" | "continuous_sparse" | "sharp_window" | "diffuse" | "water_level" | "broad_material" | "sparse_risky";
export type PlantProcessingNeed = "none" | "low" | "moderate" | "high" | "unknown";
export type PlantStoragePotential = "none" | "low" | "moderate" | "high" | "future";
export type PlantSafetyRisk = "low" | "moderate" | "high" | "unknown";
export type PlantRegrowthProfile = "seasonal_annual" | "multi_year_mast" | "belowground_reserve" | "fast_wetland" | "slow_woody" | "future";
export type PlantFallbackRole = "none" | "minor" | "important" | "emergency";
export type PlantPatchOrigin = "terrain_derived" | "hydro_derived" | "scenario_seeded" | "future_event";
export type PlantPatchAvailability = "active" | "low" | "absent" | "dormant" | "unreliable";
export type PlantLifecycleState = "active" | "low" | "absent" | "dormant" | "recovering" | "unreliable";
export type PlantPatchCondition = "thriving" | "normal" | "sparse" | "depleted_placeholder" | "recovering";
export type PlantAbundanceTrend = "rising" | "flat" | "falling" | "pulse_peak" | "pulse_drop" | "unreliable";

export interface PlantSeasonalProfile {
  readonly peakSeasons: readonly Season[];
  readonly lowSeasons: readonly Season[];
  readonly dormantSeasons: readonly Season[];
  readonly reliability: number;
  readonly globalV0: true;
}

export interface PlantKnowledgeRequirements {
  readonly seasonKnowledge: number;
  readonly safetyKnowledge: number;
  readonly processingKnowledge: number;
  readonly practiceKnowledge: number;
}

export interface PlantClassProfile {
  readonly id: PlantClassId;
  readonly linkedResourceClassId?: ResourceClassId;
  readonly domain: PlantDomain;
  readonly typicalSeasonality: PlantSeasonalProfile;
  readonly reliability: number;
  readonly abundancePattern: PlantAbundancePattern;
  readonly laborCost: number;
  readonly visibility: number;
  readonly discoverability: number;
  readonly processingNeed: PlantProcessingNeed;
  readonly storagePotential: PlantStoragePotential;
  readonly safetyRisk: PlantSafetyRisk;
  readonly depletionSensitivity: number;
  readonly regrowthProfile: PlantRegrowthProfile;
  readonly fallbackRole: PlantFallbackRole;
  readonly fallbackRank: number;
  readonly knowledgeRequirements: PlantKnowledgeRequirements;
  readonly debugLabel: string;
}

export interface PlantPatch {
  readonly patchId: ResourcePatchId;
  readonly tileId: TileId;
  readonly plantClassId: PlantClassId;
  readonly origin: PlantPatchOrigin;
  readonly baseAbundance: number;
  readonly currentAbundance: number;
  readonly seasonalProfile: PlantSeasonalProfile;
  readonly lifecycleState: PlantLifecycleState;
  readonly condition: PlantPatchCondition;
  readonly currentSeasonalAvailability: PlantPatchAvailability;
  readonly previousAvailability: PlantPatchAvailability;
  readonly seasonalModifier: number;
  readonly seasonalReasonIds: readonly ReasonId[];
  readonly reliability: number;
  readonly naturalRecoveryProgress: number;
  readonly naturalRegrowthModifier: number;
  readonly seasonalPulseStrength: number;
  readonly reliabilityThisSeason: number;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly lastLifecycleTick: TickNumber;
  readonly lifecycleReasonIds: readonly ReasonId[];
  readonly visibility: number;
  readonly accessCostHint: number;
  readonly laborCost: number;
  readonly processingNeed: PlantProcessingNeed;
  readonly safetyRisk: PlantSafetyRisk;
  readonly storagePotential: PlantStoragePotential;
  readonly depletion: number;
  readonly depletionSensitivity: number;
  readonly regrowthRate: number;
  readonly regrowthProfile: PlantRegrowthProfile;
  readonly lastUpdatedTick: TickNumber;
  readonly fallbackRole: PlantFallbackRole;
  readonly fallbackRank: number;
  readonly humanUseHistory: PlantPatchHumanUsePlaceholder;
  readonly nicheConstructionHooks: PlantPatchNicheHooks;
  readonly debugReasons: readonly ReasonId[];
}

export interface PlantPatchHumanUsePlaceholder {
  readonly status: "future";
  readonly useCount: 0;
}

export interface PlantPatchNicheHooks {
  readonly status: "future";
  readonly possibleFeedbacks: readonly ("seed_dispersal" | "burning" | "trail_access" | "managed_patch")[];
}

export interface PlantPatchDebugSummary {
  readonly patchId: string;
  readonly tileId: string;
  readonly plantClassId: PlantClassId;
  readonly season: Season;
  readonly lifecycleState: PlantLifecycleState;
  readonly condition: PlantPatchCondition;
  readonly currentAvailability: PlantPatchAvailability;
  readonly previousAvailability: PlantPatchAvailability;
  readonly baseAbundance: number;
  readonly currentAbundance: number;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly seasonalPulseStrength: number;
  readonly reliabilityThisSeason: number;
  readonly naturalRecoveryProgress: number;
  readonly naturalRegrowthModifier: number;
  readonly visibility: number;
  readonly laborCost: number;
  readonly processingNeed: PlantProcessingNeed;
  readonly safetyRisk: PlantSafetyRisk;
  readonly depletion: number;
  readonly regrowthProfile: PlantRegrowthProfile;
  readonly fallbackRank: number;
  readonly debugReasons: readonly string[];
  readonly lifecycleReasonIds: readonly string[];
}

export interface PlantScoutObservationHint {
  readonly targetTile: TileId;
  readonly scoutKind: "plant_patch" | "fallback_food" | "material_patch" | "medicinal_toxic" | "aquatic_patch";
  readonly observedPlantClassId?: PlantClassId;
  readonly linkedResourceClassId?: ResourceClassId;
  readonly observedPatchId?: ResourcePatchId;
  readonly observedLifecycleState: PlantLifecycleState;
  readonly observedConditionHint: PlantPatchCondition;
  readonly observedAvailabilityHint: number;
  readonly observedAbundanceHint: number;
  readonly observedSeasonalState: PlantPatchAvailability;
  readonly observedVisibility: number;
  readonly suspectedProcessingNeed: boolean;
  readonly suspectedSafetyRisk: boolean;
  readonly suspectedStoragePotential: boolean;
  readonly storagePotentialHint?: PlantStoragePotential;
  readonly fallbackRoleHint: PlantFallbackRole;
  readonly fallbackRankHint: number;
  readonly confidenceModifier: number;
  readonly observationLimitReason:
    | "bounded_scout_target"
    | "visible_patch_hint"
    | "low_visibility_hint"
    | "seasonal_absence_hint"
    | "no_relevant_patch_visible";
  readonly visiblePatchCount: number;
  readonly strongestClass?: PlantClassId;
  readonly observationOutcome:
    | "confirmed_patch_present"
    | "confirmed_seasonal_absent"
    | "found_low_abundance"
    | "suspected_processing_need"
    | "suspected_safety_risk"
    | "fallback_role_identified"
    | "plant_patch_not_confirmed"
    | "memory_refreshed_no_new_info";
  readonly presenceHint: number;
  readonly seasonalFitHint: number;
  readonly yieldHint: number;
  readonly accessHint: number;
  readonly trueValueHiddenFromBand: true;
  readonly reasonIds: readonly ReasonId[];
}

const ALL_SEASONS: readonly Season[] = ["spring", "summer", "autumn", "winter"];
const MAX_PLANT_PATCHES_PER_TILE = 3;
const SEASON_ORDER: readonly Season[] = ["spring", "summer", "autumn", "winter"];

export const PLANT_CLASS_PROFILES: readonly PlantClassProfile[] = [
  makeProfile("fruit_berry", "generic_plant_food", "food", ["summer", "autumn"], ["spring"], ["winter"], 0.52, "pulse", 0.32, 0.72, 0.68, "low", "low", "low", 0.58, "seasonal_annual", "minor", 0.28, "fruit / berry"),
  makeProfile("nuts_mast", "generic_plant_food", "food", ["autumn"], ["summer"], ["winter", "spring"], 0.42, "mast", 0.42, 0.56, 0.52, "low", "high", "low", 0.38, "multi_year_mast", "important", 0.52, "nuts / mast"),
  makeProfile("roots_tubers_uso", "generic_plant_food", "food", ["spring", "summer", "autumn"], ["winter"], [], 0.72, "continuous_sparse", 0.72, 0.34, 0.42, "moderate", "moderate", "moderate", 0.45, "belowground_reserve", "emergency", 0.84, "roots / tubers / underground storage organs"),
  makeProfile("wild_grain_seed", "generic_plant_food", "food", ["summer", "autumn"], ["spring"], ["winter"], 0.48, "sharp_window", 0.62, 0.52, 0.48, "moderate", "high", "low", 0.62, "seasonal_annual", "important", 0.62, "wild grain / seed"),
  makeProfile("leaf_green", "generic_plant_food", "food", ["spring", "summer"], ["autumn"], ["winter"], 0.58, "diffuse", 0.38, 0.65, 0.62, "none", "none", "low", 0.66, "seasonal_annual", "minor", 0.2, "leaf greens"),
  makeProfile("wetland_plant", "generic_plant_food", "food", ["spring", "summer"], ["autumn"], ["winter"], 0.63, "water_level", 0.48, 0.55, 0.54, "moderate", "low", "moderate", 0.42, "fast_wetland", "important", 0.58, "wetland plant food"),
  makeProfile("aquatic_plant", "aquatic_food", "food", ["summer"], ["spring", "autumn"], ["winter"], 0.54, "water_level", 0.58, 0.42, 0.38, "moderate", "low", "moderate", 0.4, "fast_wetland", "minor", 0.36, "aquatic plant"),
  makeProfile("fiber_reed", "fiber_material", "material", ["summer", "autumn"], ["spring", "winter"], [], 0.7, "broad_material", 0.46, 0.68, 0.64, "low", "future", "low", 0.36, "fast_wetland", "none", 0, "fiber / reed"),
  makeProfile("fuel_wood", "fuel_material", "material", ALL_SEASONS, [], [], 0.76, "broad_material", 0.5, 0.72, 0.7, "none", "future", "low", 0.5, "slow_woody", "none", 0, "fuel wood"),
  makeProfile("medicinal_toxic", "medicinal_or_toxic", "medicinal_toxic", ["spring", "summer"], ["autumn"], ["winter"], 0.36, "sparse_risky", 0.55, 0.22, 0.25, "unknown", "future", "unknown", 0.5, "future", "none", 0, "medicinal / toxic plant"),
];

const PLANT_PROFILE_BY_ID = new Map<PlantClassId, PlantClassProfile>(
  PLANT_CLASS_PROFILES.map((profile) => [profile.id, profile]),
);

export function getPlantClassProfile(id: PlantClassId): PlantClassProfile {
  const profile = PLANT_PROFILE_BY_ID.get(id);

  if (profile === undefined) {
    throw new Error(`Unknown plant class profile: ${id}`);
  }

  return profile;
}

export function derivePlantPatchesForTile(
  tile: Tile,
  time: WorldTime,
  limit: number = MAX_PLANT_PATCHES_PER_TILE,
): readonly PlantPatch[] {
  const cappedLimit = Math.max(0, Math.min(MAX_PLANT_PATCHES_PER_TILE, Math.floor(limit)));
  const candidates = PLANT_CLASS_PROFILES
    .map((profile) => derivePlantCandidate(tile, profile))
    .filter((candidate) => candidate.score >= candidate.threshold)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      return scoreDelta === 0
        ? left.profile.id.localeCompare(right.profile.id)
        : scoreDelta;
    })
    .slice(0, cappedLimit);

  return candidates.map((candidate) => materializePlantPatch(tile, candidate.profile, candidate.score, time));
}

export function summarizePlantPatchForDebug(patch: PlantPatch, season: Season): PlantPatchDebugSummary {
  return {
    patchId: String(patch.patchId),
    tileId: String(patch.tileId),
    plantClassId: patch.plantClassId,
    season,
    lifecycleState: patch.lifecycleState,
    condition: patch.condition,
    currentAvailability: patch.currentSeasonalAvailability,
    previousAvailability: patch.previousAvailability,
    baseAbundance: patch.baseAbundance,
    currentAbundance: patch.currentAbundance,
    abundanceTrend: patch.abundanceTrend,
    seasonalPulseStrength: patch.seasonalPulseStrength,
    reliabilityThisSeason: patch.reliabilityThisSeason,
    naturalRecoveryProgress: patch.naturalRecoveryProgress,
    naturalRegrowthModifier: patch.naturalRegrowthModifier,
    visibility: patch.visibility,
    laborCost: patch.laborCost,
    processingNeed: patch.processingNeed,
    safetyRisk: patch.safetyRisk,
    depletion: patch.depletion,
    regrowthProfile: patch.regrowthProfile,
    fallbackRank: patch.fallbackRank,
    debugReasons: patch.debugReasons.map(String),
    lifecycleReasonIds: patch.lifecycleReasonIds.map(String),
  };
}

export function derivePlantScoutObservationHint(
  tile: Tile,
  time: WorldTime,
  scoutKind: PlantScoutObservationHint["scoutKind"],
): PlantScoutObservationHint {
  const relevant = derivePlantPatchesForScoutKind(tile, time, scoutKind);
  const minimumVisibleSignal = scoutKind === "medicinal_toxic" ? 0.16 : 0.28;
  const minimumAbundanceSignal = scoutKind === "medicinal_toxic" ? 0.12 : 0.24;
  const visible = relevant.filter((patch) => patch.visibility >= minimumVisibleSignal || patch.currentAbundance >= minimumAbundanceSignal);
  const strongest = visible.slice().sort((left, right) => {
    const leftSignal = left.currentAbundance * (0.45 + left.visibility * 0.55);
    const rightSignal = right.currentAbundance * (0.45 + right.visibility * 0.55);

    return rightSignal === leftSignal
      ? left.plantClassId.localeCompare(right.plantClassId)
      : rightSignal - leftSignal;
  })[0];
  const reasonIds: ReasonId[] = [
    `reason:plant_scout:${tile.id}:${time.tick}:${scoutKind}:bounded_hint` as ReasonId,
  ];

  if (strongest === undefined) {
    const accessHint = round2(1 - clamp01(tile.movementCost / 3));

    return {
      targetTile: tile.id,
      scoutKind,
      observedLifecycleState: "absent",
      observedConditionHint: "sparse",
      observedAvailabilityHint: 0.08,
      observedAbundanceHint: 0.02,
      observedSeasonalState: "absent",
      observedVisibility: 0,
      suspectedProcessingNeed: false,
      suspectedSafetyRisk: false,
      suspectedStoragePotential: false,
      storagePotentialHint: undefined,
      fallbackRoleHint: "none",
      fallbackRankHint: 0,
      confidenceModifier: 0.18,
      observationLimitReason: "no_relevant_patch_visible",
      visiblePatchCount: 0,
      observationOutcome: scoutKind === "plant_patch" || scoutKind === "fallback_food"
        ? "plant_patch_not_confirmed"
        : "memory_refreshed_no_new_info",
      presenceHint: 0.08,
      seasonalFitHint: 0.12,
      yieldHint: 0.02,
      accessHint,
      trueValueHiddenFromBand: true,
      reasonIds,
    };
  }

  const visibleEnoughForPatchId = strongest.visibility >= 0.5 || strongest.currentAbundance >= 0.32;
  const observationOutcome = classifyScoutHintOutcome(strongest, scoutKind);
  const observedAvailabilityHint = round2(clamp01(
    strongest.currentAbundance * 0.6 + strongest.visibility * 0.25 + strongest.reliability * 0.15,
  ));
  const confidenceModifier = round2(clamp01(strongest.visibility * 0.5 + strongest.reliability * 0.3 + strongest.currentAbundance * 0.2));

  return {
    targetTile: tile.id,
    scoutKind,
    observedPlantClassId: strongest.plantClassId,
    linkedResourceClassId: getPlantClassProfile(strongest.plantClassId).linkedResourceClassId,
    observedPatchId: visibleEnoughForPatchId ? strongest.patchId : undefined,
    observedLifecycleState: strongest.lifecycleState,
    observedConditionHint: strongest.condition,
    observedAvailabilityHint,
    observedAbundanceHint: round2(strongest.currentAbundance),
    observedSeasonalState: strongest.currentSeasonalAvailability,
    observedVisibility: strongest.visibility,
    suspectedProcessingNeed: strongest.processingNeed === "moderate" || strongest.processingNeed === "high" || strongest.processingNeed === "unknown",
    suspectedSafetyRisk: strongest.safetyRisk === "moderate" || strongest.safetyRisk === "high" || strongest.safetyRisk === "unknown",
    suspectedStoragePotential: strongest.storagePotential !== "none" && strongest.storagePotential !== "future",
    storagePotentialHint: strongest.storagePotential,
    fallbackRoleHint: strongest.fallbackRole,
    fallbackRankHint: strongest.fallbackRank,
    confidenceModifier,
    observationLimitReason: strongest.currentSeasonalAvailability === "absent" || strongest.currentSeasonalAvailability === "dormant"
      ? "seasonal_absence_hint"
      : visibleEnoughForPatchId
        ? "visible_patch_hint"
        : "low_visibility_hint",
    visiblePatchCount: visible.length,
    strongestClass: strongest.plantClassId,
    observationOutcome,
    presenceHint: observedAvailabilityHint,
    seasonalFitHint: round2(strongest.seasonalModifier),
    yieldHint: round2(strongest.currentAbundance * (strongest.processingNeed === "high" ? 0.55 : 0.75)),
    accessHint: round2(clamp01(1 - strongest.accessCostHint)),
    trueValueHiddenFromBand: true,
    reasonIds: [...reasonIds, ...strongest.seasonalReasonIds],
  };
}

function derivePlantPatchesForScoutKind(
  tile: Tile,
  time: WorldTime,
  scoutKind: PlantScoutObservationHint["scoutKind"],
): readonly PlantPatch[] {
  const candidates = PLANT_CLASS_PROFILES
    .filter((profile) => profileMatchesScoutKind(profile.id, scoutKind))
    .map((profile) => derivePlantCandidate(tile, profile))
    .filter((candidate) => candidate.score >= candidate.threshold)
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      return scoreDelta === 0
        ? left.profile.id.localeCompare(right.profile.id)
        : scoreDelta;
    })
    .slice(0, MAX_PLANT_PATCHES_PER_TILE);

  return candidates.map((candidate) => materializePlantPatch(tile, candidate.profile, candidate.score, time));
}

function makeProfile(
  id: PlantClassId,
  linkedResourceClassId: ResourceClassId,
  domain: PlantDomain,
  peakSeasons: readonly Season[],
  lowSeasons: readonly Season[],
  dormantSeasons: readonly Season[],
  reliability: number,
  abundancePattern: PlantAbundancePattern,
  laborCost: number,
  visibility: number,
  discoverability: number,
  processingNeed: PlantProcessingNeed,
  storagePotential: PlantStoragePotential,
  safetyRisk: PlantSafetyRisk,
  depletionSensitivity: number,
  regrowthProfile: PlantRegrowthProfile,
  fallbackRole: PlantFallbackRole,
  fallbackRank: number,
  debugLabel: string,
): PlantClassProfile {
  return {
    id,
    linkedResourceClassId,
    domain,
    typicalSeasonality: {
      peakSeasons,
      lowSeasons,
      dormantSeasons,
      reliability,
      globalV0: true,
    },
    reliability,
    abundancePattern,
    laborCost,
    visibility,
    discoverability,
    processingNeed,
    storagePotential,
    safetyRisk,
    depletionSensitivity,
    regrowthProfile,
    fallbackRole,
    fallbackRank,
    knowledgeRequirements: {
      seasonKnowledge: clamp01(0.2 + (peakSeasons.length < 3 ? 0.25 : 0.08)),
      safetyKnowledge: safetyRisk === "unknown" || safetyRisk === "high" ? 0.72 : safetyRisk === "moderate" ? 0.48 : 0.2,
      processingKnowledge: processingNeed === "unknown" || processingNeed === "high" ? 0.74 : processingNeed === "moderate" ? 0.52 : processingNeed === "low" ? 0.24 : 0.05,
      practiceKnowledge: clamp01(0.12 + laborCost * 0.55),
    },
    debugLabel,
  };
}

function derivePlantCandidate(tile: Tile, profile: PlantClassProfile): {
  readonly profile: PlantClassProfile;
  readonly score: number;
  readonly threshold: number;
} {
  const terrainScore = getTerrainPlantSuitability(tile, profile.id);
  const hydroScore = getHydroPlantSuitability(tile, profile.id);
  const resourceScore = getResourcePlantSuitability(tile, profile.id);
  const riskScore = getRiskPlantSuitability(tile, profile.id);
  const sparseSignal = hashUnit(`${tile.id}:${profile.id}:plant_patch`);
  const baseScore = clamp01(terrainScore * 0.42 + hydroScore * 0.28 + resourceScore * 0.24 + riskScore * 0.06);
  const score = round2(clamp01(baseScore * (0.86 + sparseSignal * 0.28)));
  const threshold = getPatchMaterializationThreshold(profile.id, tile);

  return { profile, score, threshold };
}

function materializePlantPatch(
  tile: Tile,
  profile: PlantClassProfile,
  suitabilityScore: number,
  time: WorldTime,
): PlantPatch {
  const baseAbundance = round2(clamp01(
    suitabilityScore * (0.58 + profile.reliability * 0.26) + tile.resourceProfile.baseRichness * 0.12,
  ));
  const lifecycle = derivePlantPatchLifecycle(profile, time, baseAbundance, tile);
  const accessCostHint = round2(clamp01((tile.movementCost - 1) / 2.8 + (tile.isAquatic ? 0.16 : 0)));
  const reasonPrefix = `reason:plant_patch:${tile.id}:${profile.id}:${time.tick}`;

  return {
    patchId: `plant:${tile.id}:${profile.id}` as ResourcePatchId,
    tileId: tile.id,
    plantClassId: profile.id,
    origin: tile.isRiver || tile.isFloodplain || tile.isRiverbank || tile.isCoastal || tile.isAquatic
      ? "hydro_derived"
      : "terrain_derived",
    baseAbundance,
    currentAbundance: lifecycle.currentAbundance,
    seasonalProfile: profile.typicalSeasonality,
    lifecycleState: lifecycle.lifecycleState,
    condition: lifecycle.condition,
    currentSeasonalAvailability: lifecycle.availability,
    previousAvailability: lifecycle.previousAvailability,
    seasonalModifier: lifecycle.seasonalModifier,
    seasonalReasonIds: lifecycle.reasonIds,
    reliability: lifecycle.baselineReliability,
    naturalRecoveryProgress: lifecycle.naturalRecoveryProgress,
    naturalRegrowthModifier: lifecycle.naturalRegrowthModifier,
    seasonalPulseStrength: lifecycle.seasonalPulseStrength,
    reliabilityThisSeason: lifecycle.reliabilityThisSeason,
    abundanceTrend: lifecycle.abundanceTrend,
    lastLifecycleTick: time.tick,
    lifecycleReasonIds: lifecycle.lifecycleReasonIds,
    visibility: round2(clamp01(profile.visibility * (0.75 + tile.resourceProfile.baseRichness * 0.25))),
    accessCostHint,
    laborCost: profile.laborCost,
    processingNeed: profile.processingNeed,
    safetyRisk: profile.safetyRisk,
    storagePotential: profile.storagePotential,
    depletion: 0,
    depletionSensitivity: profile.depletionSensitivity,
    regrowthRate: getRegrowthRate(profile.regrowthProfile),
    regrowthProfile: profile.regrowthProfile,
    lastUpdatedTick: time.tick,
    fallbackRole: profile.fallbackRole,
    fallbackRank: profile.fallbackRank,
    humanUseHistory: { status: "future", useCount: 0 },
    nicheConstructionHooks: {
      status: "future",
      possibleFeedbacks: getNicheHooks(profile.id),
    },
    debugReasons: [
      `${reasonPrefix}:sparse_deterministic_truth` as ReasonId,
      `${reasonPrefix}:${tile.terrainKind}` as ReasonId,
      ...lifecycle.reasonIds,
    ],
  };
}

interface PlantLifecycleSummary {
  readonly availability: PlantPatchAvailability;
  readonly previousAvailability: PlantPatchAvailability;
  readonly seasonalModifier: number;
  readonly currentAbundance: number;
  readonly lifecycleState: PlantLifecycleState;
  readonly condition: PlantPatchCondition;
  readonly baselineReliability: number;
  readonly reliabilityThisSeason: number;
  readonly seasonalPulseStrength: number;
  readonly naturalRecoveryProgress: number;
  readonly naturalRegrowthModifier: number;
  readonly abundanceTrend: PlantAbundanceTrend;
  readonly reasonIds: readonly ReasonId[];
  readonly lifecycleReasonIds: readonly ReasonId[];
}

interface PlantLifecycleMoment {
  readonly season: Season;
  readonly year: number;
  readonly tick: number;
}

interface PlantLifecycleCalculation {
  readonly availability: PlantPatchAvailability;
  readonly seasonalModifier: number;
  readonly currentAbundance: number;
  readonly lifecycleState: PlantLifecycleState;
  readonly condition: PlantPatchCondition;
  readonly baselineReliability: number;
  readonly reliabilityThisSeason: number;
  readonly seasonalPulseStrength: number;
  readonly naturalRecoveryProgress: number;
  readonly naturalRegrowthModifier: number;
  readonly seasonReason: string;
  readonly lifecycleReasonIds: readonly ReasonId[];
}

function derivePlantPatchLifecycle(
  profile: PlantClassProfile,
  time: WorldTime,
  baseAbundance: number,
  tile: Tile,
): PlantLifecycleSummary {
  const current = computeLifecycleForMoment(profile, {
    season: time.season,
    year: time.year,
    tick: Number(time.tick),
  }, baseAbundance, tile);
  const previousSeasonIndex = (time.seasonIndex + 3) % SEASON_ORDER.length;
  const previous = computeLifecycleForMoment(profile, {
    season: SEASON_ORDER[previousSeasonIndex],
    year: time.seasonIndex === 0 ? time.year - 1 : time.year,
    tick: Number(time.tick) - 1,
  }, baseAbundance, tile);
  const abundanceTrend = getAbundanceTrend(profile, current, previous);

  return {
    availability: current.availability,
    previousAvailability: previous.availability,
    seasonalModifier: current.seasonalModifier,
    currentAbundance: current.currentAbundance,
    lifecycleState: current.lifecycleState,
    condition: current.condition,
    baselineReliability: current.baselineReliability,
    reliabilityThisSeason: current.reliabilityThisSeason,
    seasonalPulseStrength: current.seasonalPulseStrength,
    naturalRecoveryProgress: current.naturalRecoveryProgress,
    naturalRegrowthModifier: current.naturalRegrowthModifier,
    abundanceTrend,
    reasonIds: [
      `reason:plant_season:${tile.id}:${profile.id}:${time.season}:${current.seasonReason}` as ReasonId,
    ],
    lifecycleReasonIds: [
      ...current.lifecycleReasonIds,
      `reason:plant_lifecycle:${tile.id}:${profile.id}:${time.tick}:trend_${abundanceTrend}` as ReasonId,
    ],
  };
}

function computeLifecycleForMoment(
  profile: PlantClassProfile,
  moment: PlantLifecycleMoment,
  baseAbundance: number,
  tile: Tile,
): PlantLifecycleCalculation {
  const waterPenalty = (profile.id === "wetland_plant" || profile.id === "aquatic_plant" || profile.id === "fiber_reed") &&
    !tile.isRiver && !tile.isFloodplain && !tile.isRiverbank && !tile.isAquatic && !tile.isCoastal
    ? 0.68
    : 1;
  const baselineReliability = round2(profile.reliability * (0.72 + tile.seasonalProfile.reliability * 0.28));
  const reliabilityThisSeason = getReliabilityThisSeason(profile, tile, moment, baselineReliability);
  const naturalRecoveryProgress = getNaturalRecoveryProgress(profile, moment.season, tile);
  const naturalRegrowthModifier = round2(clamp01(0.5 + naturalRecoveryProgress * 0.38 + getRegrowthRate(profile.regrowthProfile) * 0.45));
  const seasonalPulseStrength = getSeasonalPulseStrength(profile, tile, moment);
  let seasonalBaseModifier = 0.18;
  let seasonalReason = "season_absent";

  if (profile.typicalSeasonality.peakSeasons.includes(moment.season)) {
    seasonalBaseModifier = 1;
    seasonalReason = "season_active";
  } else if (profile.typicalSeasonality.lowSeasons.includes(moment.season)) {
    seasonalBaseModifier = 0.42;
    seasonalReason = "season_low";
  } else if (profile.typicalSeasonality.dormantSeasons.includes(moment.season)) {
    seasonalBaseModifier = 0.06;
    seasonalReason = "season_dormant";
  } else {
    seasonalBaseModifier = 0.62;
    seasonalReason = "season_continuous";
  }

  if (profile.abundancePattern === "sparse_risky") {
    seasonalBaseModifier *= 0.64;
  }

  const modifier = round2(clamp01(seasonalBaseModifier * seasonalPulseStrength * reliabilityThisSeason * naturalRegrowthModifier * waterPenalty));
  const currentAbundance = round2(clamp01(baseAbundance * modifier));
  const availability: PlantPatchAvailability =
    modifier < 0.08 ? "dormant" :
    currentAbundance < 0.08 ? "absent" :
    modifier < 0.24 ? "low" :
    reliabilityThisSeason < 0.35 && currentAbundance < 0.32 ? "unreliable" :
    "active";
  const recovering =
    availability !== "dormant" &&
    availability !== "absent" &&
    naturalRecoveryProgress < 0.58 &&
    currentAbundance < 0.3;
  const lifecycleState: PlantLifecycleState = recovering
    ? "recovering"
    : availability === "unreliable" || reliabilityThisSeason < 0.35
      ? "unreliable"
      : availability;
  const condition: PlantPatchCondition = getPatchCondition(lifecycleState, currentAbundance, reliabilityThisSeason);

  return {
    availability,
    seasonalModifier: modifier,
    currentAbundance,
    lifecycleState,
    condition,
    baselineReliability,
    reliabilityThisSeason,
    seasonalPulseStrength,
    naturalRecoveryProgress,
    naturalRegrowthModifier,
    seasonReason: seasonalReason,
    lifecycleReasonIds: [
      `reason:plant_lifecycle:${tile.id}:${profile.id}:${moment.tick}:state_${lifecycleState}` as ReasonId,
      `reason:plant_lifecycle:${tile.id}:${profile.id}:${moment.tick}:condition_${condition}` as ReasonId,
      `reason:plant_lifecycle:${tile.id}:${profile.id}:${moment.tick}:reliability_${getReliabilityReason(profile, reliabilityThisSeason)}` as ReasonId,
    ],
  };
}

function getPatchCondition(
  lifecycleState: PlantLifecycleState,
  currentAbundance: number,
  reliabilityThisSeason: number,
): PlantPatchCondition {
  if (lifecycleState === "recovering") {
    return "recovering";
  }
  if (currentAbundance < 0.12 || lifecycleState === "absent" || lifecycleState === "dormant" || lifecycleState === "unreliable") {
    return "sparse";
  }
  if (currentAbundance >= 0.5 && reliabilityThisSeason >= 0.5 && lifecycleState === "active") {
    return "thriving";
  }
  return "normal";
}

function getAbundanceTrend(
  profile: PlantClassProfile,
  current: PlantLifecycleCalculation,
  previous: PlantLifecycleCalculation,
): PlantAbundanceTrend {
  const delta = current.currentAbundance - previous.currentAbundance;

  if (current.lifecycleState === "unreliable") {
    return "unreliable";
  }
  if (profile.abundancePattern === "pulse" || profile.abundancePattern === "mast" || profile.abundancePattern === "sharp_window") {
    if (delta > 0.08 && current.seasonalPulseStrength > 0.72) {
      return "pulse_peak";
    }
    if (delta < -0.08 && previous.seasonalPulseStrength > 0.72) {
      return "pulse_drop";
    }
  }
  if (delta > 0.05) {
    return "rising";
  }
  if (delta < -0.05) {
    return "falling";
  }
  return "flat";
}

function getSeasonalPulseStrength(
  profile: PlantClassProfile,
  tile: Tile,
  moment: PlantLifecycleMoment,
): number {
  const yearSignal = hashUnit(`${tile.id}:${profile.id}:${moment.year}:pulse`);

  switch (profile.abundancePattern) {
    case "mast":
      return round2(0.42 + yearSignal * 0.58);
    case "pulse":
      return profile.typicalSeasonality.peakSeasons.includes(moment.season)
        ? round2(0.72 + yearSignal * 0.28)
        : round2(0.62 + yearSignal * 0.18);
    case "sharp_window":
      return profile.typicalSeasonality.peakSeasons.includes(moment.season)
        ? round2(0.78 + yearSignal * 0.22)
        : round2(0.5 + yearSignal * 0.16);
    case "water_level": {
      const waterSignal = hashUnit(`${tile.id}:${profile.id}:${moment.year}:water_level`);
      return round2(clamp01(0.58 + waterSignal * 0.28 + tile.resourceProfile.waterAccess * 0.08 - tile.riskProfile.droughtRisk * 0.08));
    }
    case "continuous_sparse":
      return round2(0.78 + yearSignal * 0.08);
    case "broad_material":
      return round2(0.82 + yearSignal * 0.08);
    case "sparse_risky":
      return round2(0.45 + yearSignal * 0.32);
    case "diffuse":
    default:
      return round2(0.68 + yearSignal * 0.16);
  }
}

function getReliabilityThisSeason(
  profile: PlantClassProfile,
  tile: Tile,
  moment: PlantLifecycleMoment,
  baselineReliability: number,
): number {
  const signal = hashUnit(`${tile.id}:${profile.id}:${moment.year}:${moment.season}:reliability`);
  let variation = 0.9 + signal * 0.2;

  if (profile.abundancePattern === "mast") {
    variation = 0.58 + signal * 0.56;
  } else if (profile.abundancePattern === "pulse" || profile.abundancePattern === "sharp_window") {
    variation = 0.78 + signal * 0.3;
  } else if (profile.abundancePattern === "water_level") {
    variation = 0.72 + signal * 0.24 + tile.resourceProfile.waterAccess * 0.08 - tile.riskProfile.droughtRisk * 0.12;
  } else if (profile.abundancePattern === "continuous_sparse") {
    variation = 0.94 + signal * 0.08;
  } else if (profile.abundancePattern === "sparse_risky") {
    variation = 0.52 + signal * 0.46;
  }

  const dryFallbackBoost = profile.id === "roots_tubers_uso" && tile.riskProfile.droughtRisk > 0.5 ? 0.06 : 0;

  return round2(clamp01(baselineReliability * variation + dryFallbackBoost));
}

function getNaturalRecoveryProgress(
  profile: PlantClassProfile,
  season: Season,
  tile: Tile,
): number {
  switch (profile.regrowthProfile) {
    case "seasonal_annual":
      return season === "spring" ? 0.42 : season === "summer" ? 0.92 : season === "autumn" ? 0.68 : 0.12;
    case "multi_year_mast":
      return season === "autumn" ? 0.88 : season === "summer" ? 0.62 : season === "spring" ? 0.32 : 0.16;
    case "belowground_reserve":
      return round2(clamp01(0.68 + tile.seasonalProfile.reliability * 0.16));
    case "fast_wetland":
      return round2(clamp01((season === "spring" || season === "summer" ? 0.82 : season === "autumn" ? 0.52 : 0.24) + tile.resourceProfile.waterAccess * 0.08));
    case "slow_woody":
      return season === "winter" ? 0.62 : 0.82;
    case "future":
    default:
      return round2(clamp01(0.28 + profile.reliability * 0.24));
  }
}

function getReliabilityReason(profile: PlantClassProfile, reliabilityThisSeason: number): string {
  if (reliabilityThisSeason < 0.35) {
    return "low";
  }
  if (profile.abundancePattern === "mast") {
    return "mast_cycle";
  }
  if (profile.abundancePattern === "water_level") {
    return "water_sensitive";
  }
  if (profile.abundancePattern === "sparse_risky") {
    return "sparse_risky";
  }
  if (reliabilityThisSeason > 0.65) {
    return "stable";
  }
  return "seasonal";
}

function getTerrainPlantSuitability(tile: Tile, id: PlantClassId): number {
  const terrain = tile.terrainKind;

  if (id === "fruit_berry") {
    return terrain === "forest" ? 0.82 : terrain === "hills" ? 0.44 : terrain === "river_valley" ? 0.36 : 0.16;
  }
  if (id === "nuts_mast") {
    return terrain === "forest" ? 0.78 : terrain === "hills" ? 0.46 : 0.12;
  }
  if (id === "roots_tubers_uso") {
    return terrain === "desert" ? 0.34 : terrain === "tundra" ? 0.26 : terrain === "plains" || terrain === "hills" ? 0.58 : terrain === "river_valley" ? 0.52 : 0.36;
  }
  if (id === "wild_grain_seed") {
    return terrain === "plains" ? 0.72 : terrain === "river_valley" ? 0.58 : terrain === "desert" ? 0.24 : 0.18;
  }
  if (id === "leaf_green") {
    return terrain === "forest" ? 0.58 : terrain === "river_valley" || terrain === "wetlands" ? 0.48 : terrain === "plains" ? 0.34 : 0.12;
  }
  if (id === "wetland_plant" || id === "fiber_reed") {
    return terrain === "wetlands" ? 0.88 : terrain === "river_valley" ? 0.56 : terrain === "lake" || terrain === "coast" ? 0.4 : 0.08;
  }
  if (id === "aquatic_plant") {
    return terrain === "lake" || terrain === "wetlands" ? 0.62 : terrain === "coast" ? 0.36 : terrain === "river_valley" ? 0.28 : 0.04;
  }
  if (id === "fuel_wood") {
    return terrain === "forest" ? 0.84 : terrain === "hills" ? 0.44 : terrain === "plains" || terrain === "river_valley" ? 0.28 : 0.08;
  }
  return terrain === "forest" || terrain === "wetlands" || terrain === "river_valley" ? 0.32 : 0.12;
}

function getHydroPlantSuitability(tile: Tile, id: PlantClassId): number {
  const wetSignal =
    (tile.isRiver ? 0.18 : 0) +
    (tile.isFloodplain ? 0.24 : 0) +
    (tile.isRiverbank ? 0.18 : 0) +
    (tile.isConfluence ? 0.12 : 0) +
    (tile.isEstuary ? 0.18 : 0) +
    (tile.isMarshChannel ? 0.26 : 0) +
    (tile.isCoastal ? 0.1 : 0) +
    (tile.isAquatic ? 0.22 : 0);

  if (id === "wetland_plant" || id === "fiber_reed") {
    return clamp01(tile.resourceProfile.waterAccess * 0.42 + wetSignal);
  }
  if (id === "aquatic_plant") {
    return clamp01(tile.resourceProfile.aquaticPotential * 0.6 + (tile.isAquatic ? 0.18 : 0) + (tile.isRiver ? 0.12 : 0));
  }
  if (id === "roots_tubers_uso") {
    return clamp01(tile.resourceProfile.waterAccess * 0.22 + (tile.riskProfile.droughtRisk > 0.48 ? 0.12 : 0));
  }
  if (id === "wild_grain_seed") {
    return clamp01(tile.resourceProfile.waterAccess * 0.14 + (tile.isFloodplain ? 0.16 : 0));
  }
  return clamp01(tile.resourceProfile.waterAccess * 0.12 + wetSignal * 0.18);
}

function getResourcePlantSuitability(tile: Tile, id: PlantClassId): number {
  if (id === "aquatic_plant") {
    return tile.resourceProfile.aquaticPotential;
  }
  if (id === "wild_grain_seed") {
    return clamp01(tile.resourceProfile.wildGrainPotential * 0.78 + tile.resourceProfile.baseRichness * 0.18);
  }
  if (id === "fuel_wood" || id === "fiber_reed") {
    return clamp01(tile.resourceProfile.baseRichness * 0.54 + tile.resourceProfile.resourceRegenerationRate * 0.28);
  }
  if (id === "medicinal_toxic") {
    return clamp01(tile.resourceProfile.baseRichness * 0.22 + tile.riskProfile.diseaseRisk * 0.24 + tile.riskProfile.depletionRisk * 0.12);
  }
  return clamp01(tile.resourceProfile.baseRichness * 0.46 + tile.resourceProfile.plantTendingPotential * 0.2 + tile.resourceProfile.resourceRegenerationRate * 0.16);
}

function getRiskPlantSuitability(tile: Tile, id: PlantClassId): number {
  if (id === "roots_tubers_uso") {
    return clamp01(tile.riskProfile.droughtRisk * 0.34 + (tile.seasonalProfile.reliability < 0.48 ? 0.12 : 0));
  }
  if (id === "medicinal_toxic") {
    return clamp01(tile.riskProfile.diseaseRisk * 0.32 + tile.riskProfile.climateVolatility * 0.22);
  }
  if (id === "wetland_plant" || id === "aquatic_plant") {
    return clamp01(tile.riskProfile.floodRisk * 0.18);
  }
  return clamp01((1 - tile.riskProfile.droughtRisk) * 0.1);
}

function getPatchMaterializationThreshold(id: PlantClassId, tile: Tile): number {
  if (id === "medicinal_toxic") {
    return clamp01(
      0.3 +
        hashUnit(`${tile.id}:${id}:rare`) * 0.18 -
        tile.riskProfile.diseaseRisk * 0.08 -
        tile.riskProfile.climateVolatility * 0.04,
    );
  }
  if (id === "aquatic_plant") {
    return tile.isAquatic || tile.isRiver ? 0.38 : 0.48;
  }
  if (id === "wetland_plant" || id === "fiber_reed") {
    return tile.isFloodplain || tile.isMarshChannel || tile.terrainKind === "wetlands" ? 0.34 : 0.46;
  }
  if (id === "roots_tubers_uso") {
    return tile.riskProfile.droughtRisk > 0.5 || tile.terrainKind === "desert" ? 0.24 : 0.34;
  }
  if (id === "fuel_wood") {
    return tile.terrainKind === "forest" ? 0.3 : 0.42;
  }
  return 0.36;
}

function profileMatchesScoutKind(
  plantClassId: PlantClassId,
  scoutKind: PlantScoutObservationHint["scoutKind"],
): boolean {
  if (scoutKind === "plant_patch") {
    return plantClassId !== "fiber_reed" && plantClassId !== "fuel_wood" && plantClassId !== "medicinal_toxic";
  }
  if (scoutKind === "fallback_food") {
    return getPlantClassProfile(plantClassId).fallbackRank > 0;
  }
  if (scoutKind === "material_patch") {
    return plantClassId === "fiber_reed" || plantClassId === "fuel_wood";
  }
  if (scoutKind === "medicinal_toxic") {
    return plantClassId === "medicinal_toxic";
  }
  return plantClassId === "aquatic_plant" || plantClassId === "wetland_plant";
}

function classifyScoutHintOutcome(
  patch: PlantPatch,
  scoutKind: PlantScoutObservationHint["scoutKind"],
): PlantScoutObservationHint["observationOutcome"] {
  if (scoutKind === "medicinal_toxic") {
    return patch.processingNeed === "unknown" || patch.processingNeed === "high"
      ? "suspected_processing_need"
      : "suspected_safety_risk";
  }
  if (patch.lifecycleState === "dormant" || patch.lifecycleState === "absent") {
    return "confirmed_seasonal_absent";
  }
  if (patch.lifecycleState === "recovering" || patch.condition === "recovering" || patch.currentAbundance < 0.2) {
    return "found_low_abundance";
  }
  if (scoutKind === "fallback_food" && patch.fallbackRank > 0) {
    return "fallback_role_identified";
  }
  if (patch.lifecycleState === "unreliable") {
    return "found_low_abundance";
  }
  if (patch.processingNeed === "high" || patch.processingNeed === "unknown") {
    return "suspected_processing_need";
  }
  if (patch.safetyRisk === "high" || patch.safetyRisk === "unknown") {
    return "suspected_safety_risk";
  }
  return "confirmed_patch_present";
}

function getRegrowthRate(profile: PlantRegrowthProfile): number {
  if (profile === "fast_wetland") {
    return 0.18;
  }
  if (profile === "seasonal_annual") {
    return 0.14;
  }
  if (profile === "belowground_reserve") {
    return 0.1;
  }
  if (profile === "multi_year_mast") {
    return 0.06;
  }
  if (profile === "slow_woody") {
    return 0.04;
  }
  return 0;
}

function getNicheHooks(id: PlantClassId): PlantPatchNicheHooks["possibleFeedbacks"] {
  if (id === "fruit_berry" || id === "nuts_mast" || id === "wild_grain_seed") {
    return ["seed_dispersal", "trail_access", "managed_patch"];
  }
  if (id === "roots_tubers_uso") {
    return ["trail_access", "managed_patch"];
  }
  if (id === "fuel_wood") {
    return ["burning", "trail_access"];
  }
  return ["trail_access"];
}

function hashUnit(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) / 4294967295;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
