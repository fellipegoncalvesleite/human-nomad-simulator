import type { ReasonId, ResourcePatchId, Season, TickNumber, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { ResourceClassId } from "./resourceClasses";
import type {
  PlantClassId,
  PlantFallbackRole,
  PlantLifecycleState,
  PlantPatchAvailability,
  PlantPatchCondition,
} from "./plantPatches";
import { getPlantClassProfile } from "./plantPatches";
import {
  effectiveResourceConfidence,
  type ResourceKnowledgeSource,
  type ResourceKnowledgeState,
  type ResourceKnowledgeStateKind,
  type ResourcePatchMemory,
  type ResourceStalenessLabel,
} from "./resourceKnowledge";

export type PlantUseEligibilityState =
  | "unknown"
  | "not_known"
  | "out_of_season"
  | "low_abundance"
  | "access_costly"
  | "safety_uncertain"
  | "processing_required_unknown"
  | "processing_required_known_missing"
  | "fallback_only"
  | "material_only"
  | "eligible_cautious"
  | "eligible_known"
  | "not_usable_now";

export type PlantDietBreadthReadiness =
  | "preferred_resource_candidate"
  | "fallback_resource_candidate"
  | "famine_only_candidate"
  | "material_only_candidate"
  | "medicinal_toxic_caution";

export type PlantUseGateStatus = "pass" | "weak" | "fail" | "unknown";

export interface PlantUseGateSummary {
  readonly status: PlantUseGateStatus;
  readonly score: NormalizedIntensity;
  readonly reason: ReasonId;
}

export interface PlantUseEligibilityConfidenceUsed {
  readonly source: ResourceKnowledgeSource;
  readonly memoryState: ResourceKnowledgeStateKind;
  readonly stalenessTicks: number;
  readonly stalenessLabel: ResourceStalenessLabel;
  readonly presence: NormalizedIntensity;
  readonly season: NormalizedIntensity;
  readonly yield: NormalizedIntensity;
  readonly safety: NormalizedIntensity;
  readonly processing: NormalizedIntensity;
  readonly access: NormalizedIntensity;
  readonly recovery: NormalizedIntensity;
  readonly observationCount: number;
  readonly lastObservedTick?: TickNumber;
  readonly contradictionCount: number;
  readonly falseInferenceCount: number;
}

export interface PlantUseEligibility {
  readonly patchId: ResourcePatchId;
  readonly tileId: TileId;
  readonly plantClassId?: PlantClassId;
  readonly linkedResourceClassId: ResourceClassId;
  readonly eligibilityState: PlantUseEligibilityState;
  readonly eligibilityScore: NormalizedIntensity;
  readonly dietBreadthReadiness: PlantDietBreadthReadiness;
  readonly knowledgeGate: PlantUseGateSummary;
  readonly seasonGate: PlantUseGateSummary;
  readonly accessGate: PlantUseGateSummary;
  readonly abundanceGate: PlantUseGateSummary;
  readonly safetyGate: PlantUseGateSummary;
  readonly processingGate: PlantUseGateSummary;
  readonly laborGate: PlantUseGateSummary;
  readonly fallbackGate: PlantUseGateSummary;
  readonly failedGates: readonly string[];
  readonly confidenceUsed: PlantUseEligibilityConfidenceUsed;
  readonly currentSeason: Season;
  readonly observedLifecycleState?: PlantLifecycleState;
  readonly observedConditionHint?: PlantPatchCondition;
  readonly observedSeasonalState?: PlantPatchAvailability;
  readonly fallbackRoleHint: PlantFallbackRole;
  readonly fallbackRankHint: NormalizedIntensity;
  readonly suspectedProcessingNeed: boolean;
  readonly suspectedSafetyRisk: boolean;
  readonly suspectedStoragePotential: boolean;
  readonly knownVsTruthLabel: "band_known_or_scouted_only";
  readonly noYieldStressRelocationCoupling: true;
  readonly trueValueHiddenFromBand: true;
  readonly reasons: readonly ReasonId[];
}

export interface PlantUseEligibilityContext {
  readonly tick: TickNumber | number;
  readonly season: Season;
  readonly foodStress?: NormalizedIntensity;
  readonly perCapitaReturn?: NormalizedIntensity;
  readonly laborCapacity?: number;
  readonly dependencyLoad?: NormalizedIntensity;
}

const PLANT_RELATED_RESOURCE_CLASSES: readonly ResourceClassId[] = [
  "generic_plant_food",
  "aquatic_food",
  "fallback_food",
  "fiber_material",
  "fuel_material",
  "medicinal_or_toxic",
];

export function isPlantUseCandidateMemory(memory: ResourcePatchMemory): boolean {
  return (
    memory.plantObservation !== undefined ||
    PLANT_RELATED_RESOURCE_CLASSES.includes(memory.resourceClassId)
  );
}

export function derivePlantUseEligibility(
  memory: ResourcePatchMemory,
  context: PlantUseEligibilityContext,
): PlantUseEligibility {
  const observation = memory.plantObservation;
  const tick = Number(context.tick);
  const effective = effectiveResourceConfidence(memory, tick);
  const plantClassId = observation?.plantClassId;
  const profile = plantClassId === undefined ? undefined : getPlantClassProfile(plantClassId);
  const linkedResourceClassId = observation?.plantClassId === undefined
    ? memory.resourceClassId
    : profile?.linkedResourceClassId ?? memory.resourceClassId;
  const fallbackRoleHint = observation?.fallbackRoleHint ?? "none";
  const fallbackRankHint = observation?.fallbackRankHint ?? 0;
  const suspectedProcessingNeed = observation?.suspectedProcessingNeed === true;
  const suspectedSafetyRisk = observation?.suspectedSafetyRisk === true || memory.risk.poisoningOrBadReaction;
  const medicinalOrToxic = linkedResourceClassId === "medicinal_or_toxic" || plantClassId === "medicinal_toxic";
  const materialOnly =
    linkedResourceClassId === "fiber_material" ||
    linkedResourceClassId === "fuel_material" ||
    plantClassId === "fiber_reed" ||
    plantClassId === "fuel_wood";
  const confidenceUsed: PlantUseEligibilityConfidenceUsed = {
    source: memory.source,
    memoryState: memory.state,
    stalenessTicks: effective.stalenessTicks,
    stalenessLabel: effective.label,
    presence: effective.effectivePresenceConfidence,
    season: effective.effectiveSeasonConfidence,
    yield: effective.effectiveYieldConfidence,
    safety: effective.effectiveSafetyConfidence,
    processing: effective.effectiveProcessingConfidence,
    access: effective.effectiveAccessConfidence,
    recovery: effective.effectiveRecoveryConfidence,
    observationCount: observation?.observationCount ?? 0,
    lastObservedTick: observation?.lastObservedTick,
    contradictionCount: memory.learning?.contradictionCount ?? 0,
    falseInferenceCount: memory.learning?.falseInferenceCount ?? 0,
  };

  const knowledgeGate = deriveKnowledgeGate(memory, confidenceUsed, observation !== undefined);
  const seasonGate = deriveSeasonGate(memory, confidenceUsed, observation?.observedSeasonalState, observation?.observedLifecycleState, context.season);
  const abundanceGate = deriveAbundanceGate(confidenceUsed, observation?.observedAbundanceHint, observation?.observedLifecycleState);
  const accessGate = deriveAccessGate(confidenceUsed);
  const safetyGate = deriveSafetyGate(confidenceUsed, suspectedSafetyRisk, medicinalOrToxic);
  const processingGate = deriveProcessingGate(confidenceUsed, suspectedProcessingNeed);
  const laborGate = deriveLaborGate(context, plantClassId, profile?.laborCost, fallbackRankHint, observation?.confidenceModifier);
  const fallbackGate = deriveFallbackGate(context, fallbackRoleHint, fallbackRankHint);
  const dietBreadthReadiness = deriveDietBreadthReadiness(
    materialOnly,
    medicinalOrToxic,
    fallbackRoleHint,
    fallbackRankHint,
    context,
  );
  const failedGates = [
    ["knowledge", knowledgeGate] as const,
    ["season", seasonGate] as const,
    ["abundance", abundanceGate] as const,
    ["access", accessGate] as const,
    ["safety", safetyGate] as const,
    ["processing", processingGate] as const,
    ["labor", laborGate] as const,
    ["fallback", fallbackGate] as const,
  ]
    .filter(([, gate]) => gate.status === "fail" || gate.status === "unknown")
    .map(([name]) => name);
  const eligibilityScore = round2(clamp01(
    knowledgeGate.score * 0.22 +
      seasonGate.score * 0.14 +
      abundanceGate.score * 0.12 +
      accessGate.score * 0.12 +
      safetyGate.score * 0.16 +
      processingGate.score * 0.12 +
      laborGate.score * 0.08 +
      fallbackGate.score * 0.04,
  ));
  const eligibilityState = deriveEligibilityState({
    observationKnown: observation !== undefined,
    source: memory.source,
    materialOnly,
    medicinalOrToxic,
    fallbackRoleHint,
    knowledgeGate,
    seasonGate,
    abundanceGate,
    accessGate,
    safetyGate,
    processingGate,
    laborGate,
    eligibilityScore,
    memory,
  });
  const reasons = compactReasons([
    `reason:plant_eligibility:${String(memory.patchId)}:${tick}:band_known_only` as ReasonId,
    knowledgeGate.reason,
    seasonGate.reason,
    abundanceGate.reason,
    accessGate.reason,
    safetyGate.reason,
    processingGate.reason,
    laborGate.reason,
    fallbackGate.reason,
    ...(memory.learning?.lastContradictionKind === undefined
      ? []
      : [`reason:plant_eligibility:${String(memory.patchId)}:${tick}:${memory.learning.lastContradictionKind}` as ReasonId]),
  ]);

  return {
    patchId: observation?.plantPatchId ?? memory.patchId,
    tileId: memory.approximateTile,
    plantClassId,
    linkedResourceClassId,
    eligibilityState,
    eligibilityScore,
    dietBreadthReadiness,
    knowledgeGate,
    seasonGate,
    accessGate,
    abundanceGate,
    safetyGate,
    processingGate,
    laborGate,
    fallbackGate,
    failedGates,
    confidenceUsed,
    currentSeason: context.season,
    observedLifecycleState: observation?.observedLifecycleState,
    observedConditionHint: observation?.observedConditionHint,
    observedSeasonalState: observation?.observedSeasonalState,
    fallbackRoleHint,
    fallbackRankHint,
    suspectedProcessingNeed,
    suspectedSafetyRisk,
    suspectedStoragePotential: observation?.suspectedStoragePotential === true,
    knownVsTruthLabel: "band_known_or_scouted_only",
    noYieldStressRelocationCoupling: true,
    trueValueHiddenFromBand: true,
    reasons,
  };
}

export function summarizePlantUseEligibilityCandidates(
  state: ResourceKnowledgeState | undefined,
  context: PlantUseEligibilityContext,
  limit: number = 6,
): readonly PlantUseEligibility[] {
  if (state === undefined || state.patchMemories.length === 0 || limit <= 0) {
    return [];
  }

  return state.patchMemories
    .filter(isPlantUseCandidateMemory)
    .map((memory) => derivePlantUseEligibility(memory, context))
    .sort(compareEligibility)
    .slice(0, Math.max(0, Math.floor(limit)));
}

function deriveKnowledgeGate(
  memory: ResourcePatchMemory,
  confidence: PlantUseEligibilityConfidenceUsed,
  hasPlantObservation: boolean,
): PlantUseGateSummary {
  if (!hasPlantObservation) {
    return gate(
      memory.source === "inferred" ? "unknown" : "fail",
      memory.source === "inferred" ? 0.18 : 0.12,
      memory.source === "inferred" ? "knowledge_inferred_without_plant_observation" : "knowledge_no_plant_patch_observation",
    );
  }

  if (memory.state === "seasonally_bad" || confidence.contradictionCount > confidence.observationCount) {
    return gate("weak", 0.36, "knowledge_recent_contradiction");
  }

  if (memory.source === "inferred") {
    return gate("weak", 0.34, "knowledge_inferred_but_scout_observed");
  }

  if (memory.source === "inherited") {
    return gate("weak", 0.44, "knowledge_inherited_degraded");
  }

  if (confidence.presence >= 0.45 && confidence.observationCount > 0) {
    return gate("pass", Math.max(0.62, confidence.presence), "knowledge_direct_observed_patch");
  }

  return gate("weak", Math.max(0.32, confidence.presence), "knowledge_observed_but_low_confidence");
}

function deriveSeasonGate(
  memory: ResourcePatchMemory,
  confidence: PlantUseEligibilityConfidenceUsed,
  observedSeasonalState: PlantPatchAvailability | undefined,
  observedLifecycleState: PlantLifecycleState | undefined,
  currentSeason: Season,
): PlantUseGateSummary {
  if (memory.seasonality.badSeasons.includes(currentSeason) || observedSeasonalState === "absent" || observedSeasonalState === "dormant" || observedLifecycleState === "absent" || observedLifecycleState === "dormant") {
    return gate("fail", 0.04, "season_out_of_season_or_dormant");
  }

  if (observedLifecycleState === "recovering" || observedLifecycleState === "unreliable" || observedSeasonalState === "unreliable") {
    return gate("weak", 0.38, "season_recovering_or_unreliable_hint");
  }

  if (observedSeasonalState === "low" || observedLifecycleState === "low") {
    return gate("weak", 0.46, "season_low_current_hint");
  }

  if (observedSeasonalState === "active" || observedLifecycleState === "active") {
    return gate("pass", Math.max(0.62, confidence.season), "season_currently_active_hint");
  }

  if (confidence.season < 0.24) {
    return gate("unknown", 0.22, "season_known_presence_not_timing");
  }

  return gate("weak", confidence.season, "season_memory_only");
}

function deriveAbundanceGate(
  confidence: PlantUseEligibilityConfidenceUsed,
  observedAbundanceHint: NormalizedIntensity | undefined,
  observedLifecycleState: PlantLifecycleState | undefined,
): PlantUseGateSummary {
  if (observedAbundanceHint !== undefined && observedAbundanceHint < 0.08) {
    return gate("fail", 0.08, "abundance_too_low_hint");
  }

  if (
    observedLifecycleState === "recovering" ||
    observedLifecycleState === "unreliable" ||
    (observedAbundanceHint !== undefined && observedAbundanceHint < 0.22)
  ) {
    return gate("weak", Math.max(0.28, observedAbundanceHint ?? confidence.yield), "abundance_low_or_recovering_hint");
  }

  if (observedAbundanceHint !== undefined) {
    return gate("pass", Math.max(0.55, observedAbundanceHint), "abundance_visible_enough_hint");
  }

  if (confidence.yield < 0.18) {
    return gate("unknown", 0.18, "abundance_not_scouted");
  }

  return gate("weak", confidence.yield, "abundance_memory_only");
}

function deriveAccessGate(confidence: PlantUseEligibilityConfidenceUsed): PlantUseGateSummary {
  if (confidence.access < 0.22) {
    return gate("fail", confidence.access, "access_costly_or_uncertain");
  }
  if (confidence.access < 0.46) {
    return gate("weak", confidence.access, "access_plausible_but_costly");
  }
  return gate("pass", confidence.access, "access_known_enough");
}

function deriveSafetyGate(
  confidence: PlantUseEligibilityConfidenceUsed,
  suspectedSafetyRisk: boolean,
  medicinalOrToxic: boolean,
): PlantUseGateSummary {
  if (medicinalOrToxic) {
    return gate("fail", 0.06, "safety_medicinal_toxic_caution");
  }

  if (suspectedSafetyRisk) {
    return gate("fail", Math.min(0.24, confidence.safety), "safety_suspicion_not_tested");
  }

  if (confidence.safety < 0.18) {
    return gate("unknown", confidence.safety, "safety_not_known");
  }

  if (confidence.safety < 0.56) {
    return gate("weak", Math.max(0.32, confidence.safety), "safety_cautious_only");
  }

  return gate("pass", confidence.safety, "safety_confidence_sufficient_for_debug");
}

function deriveProcessingGate(
  confidence: PlantUseEligibilityConfidenceUsed,
  suspectedProcessingNeed: boolean,
): PlantUseGateSummary {
  if (!suspectedProcessingNeed) {
    return confidence.processing < 0.12
      ? gate("weak", 0.44, "processing_not_suspected_but_skill_unknown")
      : gate("pass", Math.max(0.58, confidence.processing), "processing_no_need_suspected");
  }

  if (confidence.processing < 0.08) {
    return gate("unknown", confidence.processing, "processing_required_unknown");
  }

  if (confidence.processing < 0.36) {
    return gate("fail", confidence.processing, "processing_required_known_missing");
  }

  return gate("weak", confidence.processing, "processing_suspected_placeholder_only");
}

function deriveLaborGate(
  context: PlantUseEligibilityContext,
  plantClassId: PlantClassId | undefined,
  profileLaborCost: NormalizedIntensity | undefined,
  fallbackRankHint: NormalizedIntensity,
  confidenceModifier: NormalizedIntensity | undefined,
): PlantUseGateSummary {
  const laborCapacity = context.laborCapacity;
  const dependencyLoad = context.dependencyLoad ?? 0;
  const hiddenEffort = clamp01(1 - (confidenceModifier ?? 0.55));
  const classLaborCost =
    profileLaborCost ??
    (plantClassId === "roots_tubers_uso" ? 0.72 : plantClassId === "wild_grain_seed" ? 0.62 : 0.42);
  const laborNeed = clamp01(classLaborCost * 0.52 + hiddenEffort * 0.3 + fallbackRankHint * 0.18 + dependencyLoad * 0.2);

  if (laborCapacity !== undefined && laborCapacity < 8 && laborNeed > 0.52) {
    return gate("fail", 0.22, "labor_capacity_low_for_patch_effort");
  }

  if (laborNeed > 0.62) {
    return gate("weak", 0.38, "labor_heavy_or_low_visibility");
  }

  return gate("pass", round2(clamp01(1 - laborNeed * 0.55)), "labor_plausible_debug_gate");
}

function deriveFallbackGate(
  context: PlantUseEligibilityContext,
  fallbackRoleHint: PlantFallbackRole,
  fallbackRankHint: NormalizedIntensity,
): PlantUseGateSummary {
  if (fallbackRoleHint === "none") {
    return gate("pass", 1, "fallback_not_required");
  }

  const foodStress = context.foodStress ?? 0;
  const lowReturn = 1 - (context.perCapitaReturn ?? 0.5);
  const need = clamp01(foodStress * 0.55 + lowReturn * 0.45);

  if (fallbackRoleHint === "emergency" && need < 0.45) {
    return gate("weak", 0.38, "fallback_known_but_not_stress_context");
  }

  if (fallbackRankHint >= 0.7 || need >= 0.45) {
    return gate("weak", round2(clamp01(0.42 + need * 0.35)), "fallback_role_known_readiness_only");
  }

  return gate("weak", 0.48, "fallback_minor_role_known");
}

function deriveDietBreadthReadiness(
  materialOnly: boolean,
  medicinalOrToxic: boolean,
  fallbackRoleHint: PlantFallbackRole,
  fallbackRankHint: NormalizedIntensity,
  context: PlantUseEligibilityContext,
): PlantDietBreadthReadiness {
  if (materialOnly) {
    return "material_only_candidate";
  }
  if (medicinalOrToxic) {
    return "medicinal_toxic_caution";
  }
  if (fallbackRoleHint === "emergency" || fallbackRankHint >= 0.78) {
    return "famine_only_candidate";
  }
  if (fallbackRoleHint === "important" || fallbackRankHint >= 0.5 || (context.foodStress ?? 0) >= 0.55 || (context.perCapitaReturn ?? 1) <= 0.45) {
    return "fallback_resource_candidate";
  }
  return "preferred_resource_candidate";
}

function deriveEligibilityState(input: {
  readonly observationKnown: boolean;
  readonly source: ResourceKnowledgeSource;
  readonly materialOnly: boolean;
  readonly medicinalOrToxic: boolean;
  readonly fallbackRoleHint: PlantFallbackRole;
  readonly knowledgeGate: PlantUseGateSummary;
  readonly seasonGate: PlantUseGateSummary;
  readonly abundanceGate: PlantUseGateSummary;
  readonly accessGate: PlantUseGateSummary;
  readonly safetyGate: PlantUseGateSummary;
  readonly processingGate: PlantUseGateSummary;
  readonly laborGate: PlantUseGateSummary;
  readonly eligibilityScore: NormalizedIntensity;
  readonly memory: ResourcePatchMemory;
}): PlantUseEligibilityState {
  if (!input.observationKnown) {
    return input.source === "inferred" ? "unknown" : "not_known";
  }
  if (input.knowledgeGate.status === "fail" || input.knowledgeGate.status === "unknown") {
    return input.source === "inferred" ? "unknown" : "not_known";
  }
  if (input.materialOnly) {
    return "material_only";
  }
  if (input.medicinalOrToxic) {
    return "safety_uncertain";
  }
  if (input.seasonGate.status === "fail") {
    return "out_of_season";
  }
  if (input.abundanceGate.status === "fail") {
    return "low_abundance";
  }
  if (input.accessGate.status === "fail") {
    return "access_costly";
  }
  if (input.fallbackRoleHint === "important" || input.fallbackRoleHint === "emergency") {
    return "fallback_only";
  }
  if (input.processingGate.status === "unknown") {
    return "processing_required_unknown";
  }
  if (input.processingGate.status === "fail") {
    return "processing_required_known_missing";
  }
  if (input.safetyGate.status === "fail" || input.safetyGate.status === "unknown") {
    return "safety_uncertain";
  }
  if (input.laborGate.status === "fail") {
    return "not_usable_now";
  }
  if (
    input.eligibilityScore >= 0.7 &&
    input.memory.source === "direct" &&
    (input.memory.state === "reliable" || input.memory.state === "used") &&
    (input.memory.learning?.confirmationCount ?? 0) >= 2 &&
    input.safetyGate.status === "pass" &&
    input.processingGate.status === "pass"
  ) {
    return "eligible_known";
  }
  if (input.eligibilityScore >= 0.48) {
    return "eligible_cautious";
  }
  return "not_usable_now";
}

function compareEligibility(left: PlantUseEligibility, right: PlantUseEligibility): number {
  const stateDelta = stateRank(right.eligibilityState) - stateRank(left.eligibilityState);
  if (stateDelta !== 0) {
    return stateDelta;
  }
  const scoreDelta = right.eligibilityScore - left.eligibilityScore;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  const tileDelta = String(left.tileId).localeCompare(String(right.tileId));
  if (tileDelta !== 0) {
    return tileDelta;
  }
  return String(left.patchId).localeCompare(String(right.patchId));
}

function stateRank(state: PlantUseEligibilityState): number {
  switch (state) {
    case "eligible_known":
      return 12;
    case "eligible_cautious":
      return 11;
    case "fallback_only":
      return 10;
    case "material_only":
      return 9;
    case "safety_uncertain":
    case "processing_required_known_missing":
    case "processing_required_unknown":
      return 8;
    case "access_costly":
    case "low_abundance":
      return 7;
    case "out_of_season":
      return 6;
    case "not_usable_now":
      return 5;
    case "unknown":
      return 4;
    case "not_known":
      return 3;
  }
}

function gate(status: PlantUseGateStatus, score: number, reason: string): PlantUseGateSummary {
  return {
    status,
    score: round2(clamp01(score)),
    reason: `reason:plant_eligibility:${reason}` as ReasonId,
  };
}

function compactReasons(reasons: readonly ReasonId[]): readonly ReasonId[] {
  const seen = new Set<string>();
  const output: ReasonId[] = [];

  for (const reason of reasons) {
    const key = String(reason);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(reason);
    }
  }

  return output.slice(-12);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
