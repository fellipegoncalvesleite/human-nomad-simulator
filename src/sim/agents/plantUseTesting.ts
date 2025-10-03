import type { EventId, ReasonId, ResourcePatchId, Season, TickNumber, TileId, BandId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { ResourceClassId } from "./resourceClasses";
import type { PlantClassId } from "./plantPatches";
import type { PlantUseEligibility, PlantUseEligibilityState } from "./plantUseEligibility";
import type {
  ResourceConfidenceProfile,
  ResourceKnowledgeState,
  ResourcePatchContradictionKind,
  ResourcePatchLearningMemory,
  ResourcePatchLearningOutcome,
  ResourcePatchMemory,
} from "./resourceKnowledge";
import { enforceResourceKnowledgeCap } from "./resourceKnowledge";

export type PlantUseTestKind =
  | "observe_only"
  | "cautious_sample"
  | "processing_probe"
  | "fallback_trial"
  | "material_collection_trial"
  | "medicinal_toxic_caution";

export type PlantUseTestMotivation =
  | "curiosity"
  | "food_stress"
  | "fallback_need"
  | "confirm_memory"
  | "processing_question"
  | "material_need"
  | "medicinal_caution";

export type PlantUseTestResult =
  | "learned_presence"
  | "learned_seasonality"
  | "learned_low_value"
  | "suspected_processing_needed"
  | "suspected_safety_risk"
  | "cautious_no_effect_observed"
  | "avoided_due_to_risk"
  | "material_use_only"
  | "no_test_too_uncertain";

export interface PlantUseTestEvent {
  readonly eventId: EventId;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly tileId: TileId;
  readonly patchId: ResourcePatchId;
  readonly plantClassId?: PlantClassId;
  readonly resourceClassId: ResourceClassId;
  readonly eligibilityStateBefore: PlantUseEligibilityState;
  readonly testKind: PlantUseTestKind;
  readonly motivation: PlantUseTestMotivation;
  readonly confidenceBefore: ResourceConfidenceProfile;
  readonly confidenceAfter: ResourceConfidenceProfile;
  readonly safetyBefore: NormalizedIntensity;
  readonly safetyAfter: NormalizedIntensity;
  readonly processingBefore: NormalizedIntensity;
  readonly processingAfter: NormalizedIntensity;
  readonly result: PlantUseTestResult;
  readonly memoryUpdated: boolean;
  readonly noYieldChange: true;
  readonly noStressChange: true;
  readonly noMortalityChange: true;
  readonly noRelocationChange: true;
  readonly noCarryingCapacityChange: true;
  readonly trueValueHiddenFromBand: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface PlantUseTestRingEntry {
  readonly tick: TickNumber;
  readonly season: Season;
  readonly tileId: TileId;
  readonly plantClassId?: PlantClassId;
  readonly resourceClassId: ResourceClassId;
  readonly eligibilityStateBefore: PlantUseEligibilityState;
  readonly testKind: PlantUseTestKind;
  readonly motivation: PlantUseTestMotivation;
  readonly result: PlantUseTestResult;
  readonly confidenceDelta: number;
  readonly safetyDelta: number;
  readonly processingDelta: number;
  readonly memoryUpdated: boolean;
  readonly noYieldChange: true;
  readonly noStressChange: true;
  readonly noMortalityChange: true;
  readonly noRelocationChange: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface PlantUseTestContext {
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly memory: ResourcePatchMemory;
  readonly eligibility: PlantUseEligibility;
  readonly foodStress?: NormalizedIntensity;
  readonly perCapitaReturn?: NormalizedIntensity;
}

export interface PlantUseTestUpdate {
  readonly resourceKnowledgeState: ResourceKnowledgeState;
  readonly memory: ResourcePatchMemory;
  readonly event: PlantUseTestEvent;
}

const RECENT_PLANT_USE_TEST_CAP = 6;

export function applyPlantUseTestFromEligibility(
  state: ResourceKnowledgeState,
  input: PlantUseTestContext,
): PlantUseTestUpdate {
  const attempt = choosePlantUseTestAttempt(input.eligibility, {
    foodStress: input.foodStress,
    perCapitaReturn: input.perCapitaReturn,
  });
  const reasonId = makePlantUseTestReason(input, attempt);
  const updatedMemory = applyPlantUseTestToMemory(input.memory, input, attempt, reasonId);
  const memoryUpdated = updatedMemory !== input.memory;
  const event: PlantUseTestEvent = {
    eventId: makePlantUseTestEventId(input, attempt),
    bandId: input.bandId,
    tick: input.tick,
    season: input.season,
    tileId: input.eligibility.tileId,
    patchId: input.eligibility.patchId,
    plantClassId: input.eligibility.plantClassId,
    resourceClassId: input.eligibility.linkedResourceClassId,
    eligibilityStateBefore: input.eligibility.eligibilityState,
    testKind: attempt.testKind,
    motivation: attempt.motivation,
    confidenceBefore: roundConfidenceProfile(input.memory.confidence),
    confidenceAfter: roundConfidenceProfile(updatedMemory.confidence),
    safetyBefore: round2(input.memory.confidence.safetyConfidence),
    safetyAfter: round2(updatedMemory.confidence.safetyConfidence),
    processingBefore: round2(input.memory.confidence.processingConfidence),
    processingAfter: round2(updatedMemory.confidence.processingConfidence),
    result: attempt.result,
    memoryUpdated,
    noYieldChange: true,
    noStressChange: true,
    noMortalityChange: true,
    noRelocationChange: true,
    noCarryingCapacityChange: true,
    trueValueHiddenFromBand: true,
    reasonIds: [
      reasonId,
      ...input.eligibility.reasons.slice(-5),
    ],
  };
  const patchMemories = state.patchMemories.map((memory) =>
    memory.patchId === input.memory.patchId ? updatedMemory : memory,
  );

  return {
    resourceKnowledgeState: memoryUpdated
      ? enforceResourceKnowledgeCap({ ...state, patchMemories }, Number(input.tick))
      : state,
    memory: updatedMemory,
    event,
  };
}

export function appendRecentPlantUseTest(
  previous: readonly PlantUseTestRingEntry[] | undefined,
  event: PlantUseTestEvent | undefined,
): readonly PlantUseTestRingEntry[] | undefined {
  if (event === undefined) {
    return previous;
  }

  const entry: PlantUseTestRingEntry = {
    tick: event.tick,
    season: event.season,
    tileId: event.tileId,
    plantClassId: event.plantClassId,
    resourceClassId: event.resourceClassId,
    eligibilityStateBefore: event.eligibilityStateBefore,
    testKind: event.testKind,
    motivation: event.motivation,
    result: event.result,
    confidenceDelta: round2(event.confidenceAfter.presenceConfidence - event.confidenceBefore.presenceConfidence),
    safetyDelta: round2(event.safetyAfter - event.safetyBefore),
    processingDelta: round2(event.processingAfter - event.processingBefore),
    memoryUpdated: event.memoryUpdated,
    noYieldChange: true,
    noStressChange: true,
    noMortalityChange: true,
    noRelocationChange: true,
    reasonIds: event.reasonIds.slice(0, 6),
  };

  return [entry, ...(previous ?? [])].slice(0, RECENT_PLANT_USE_TEST_CAP);
}

function choosePlantUseTestAttempt(
  eligibility: PlantUseEligibility,
  context: {
    readonly foodStress?: NormalizedIntensity;
    readonly perCapitaReturn?: NormalizedIntensity;
  },
): {
  readonly testKind: PlantUseTestKind;
  readonly motivation: PlantUseTestMotivation;
  readonly result: PlantUseTestResult;
} {
  const stressNeed = clamp01((context.foodStress ?? 0) * 0.58 + (1 - (context.perCapitaReturn ?? 0.5)) * 0.42);

  if (eligibility.dietBreadthReadiness === "medicinal_toxic_caution" || eligibility.linkedResourceClassId === "medicinal_or_toxic") {
    return {
      testKind: "medicinal_toxic_caution",
      motivation: "medicinal_caution",
      result: eligibility.suspectedSafetyRisk ? "suspected_safety_risk" : "avoided_due_to_risk",
    };
  }

  switch (eligibility.eligibilityState) {
    case "eligible_known":
    case "eligible_cautious":
      return {
        testKind: "cautious_sample",
        motivation: stressNeed >= 0.5 ? "food_stress" : "curiosity",
        result: eligibility.abundanceGate.status === "weak" ? "learned_low_value" : "cautious_no_effect_observed",
      };
    case "fallback_only":
      return stressNeed >= 0.45
        ? {
            testKind: "fallback_trial",
            motivation: "fallback_need",
            result: "learned_low_value",
          }
        : {
            testKind: "observe_only",
            motivation: "confirm_memory",
            result: "no_test_too_uncertain",
          };
    case "processing_required_unknown":
    case "processing_required_known_missing":
      return {
        testKind: "processing_probe",
        motivation: "processing_question",
        result: "suspected_processing_needed",
      };
    case "safety_uncertain":
      return {
        testKind: "observe_only",
        motivation: "confirm_memory",
        result: eligibility.suspectedSafetyRisk ? "suspected_safety_risk" : "avoided_due_to_risk",
      };
    case "material_only":
      return {
        testKind: "material_collection_trial",
        motivation: "material_need",
        result: "material_use_only",
      };
    case "low_abundance":
      return {
        testKind: "observe_only",
        motivation: "confirm_memory",
        result: "learned_low_value",
      };
    case "out_of_season":
      return {
        testKind: "observe_only",
        motivation: "confirm_memory",
        result: "learned_seasonality",
      };
    case "access_costly":
    case "not_usable_now":
    case "unknown":
    case "not_known":
      return {
        testKind: "observe_only",
        motivation: "confirm_memory",
        result: "no_test_too_uncertain",
      };
  }
}

function applyPlantUseTestToMemory(
  memory: ResourcePatchMemory,
  context: PlantUseTestContext,
  attempt: {
    readonly testKind: PlantUseTestKind;
    readonly motivation: PlantUseTestMotivation;
    readonly result: PlantUseTestResult;
  },
  reasonId: ReasonId,
): ResourcePatchMemory {
  if (attempt.result === "no_test_too_uncertain") {
    return memory;
  }

  const confidence = adjustPlantUseTestConfidence(memory.confidence, attempt.result);
  const plantObservation = memory.plantObservation === undefined
    ? undefined
    : {
        ...memory.plantObservation,
        suspectedProcessingNeed:
          memory.plantObservation.suspectedProcessingNeed ||
          attempt.result === "suspected_processing_needed",
        suspectedSafetyRisk:
          memory.plantObservation.suspectedSafetyRisk ||
          attempt.result === "suspected_safety_risk" ||
          attempt.result === "avoided_due_to_risk",
        reasonIds: [...memory.plantObservation.reasonIds, reasonId].slice(-12),
      };
  const learning = updateLearningFromPlantUseTest(memory.learning, context.tick, attempt.result);
  const reasonIds = [...memory.reasonIds, reasonId].slice(-12);

  return {
    ...memory,
    confidence,
    plantObservation,
    learning,
    lastNotedTick: context.tick,
    reasonIds,
  };
}

function adjustPlantUseTestConfidence(
  confidence: ResourceConfidenceProfile,
  result: PlantUseTestResult,
): ResourceConfidenceProfile {
  switch (result) {
    case "cautious_no_effect_observed":
      return capSafety(withConfidenceDeltas(confidence, {
        presenceConfidence: 0.02,
        seasonConfidence: 0.02,
        safetyConfidence: 0.02,
        processingConfidence: 0.01,
      }), 0.46);
    case "learned_presence":
      return withConfidenceDeltas(confidence, {
        presenceConfidence: 0.02,
        seasonConfidence: 0.01,
      });
    case "learned_seasonality":
      return withConfidenceDeltas(confidence, {
        seasonConfidence: 0.02,
        yieldConfidence: -0.02,
      });
    case "learned_low_value":
      return {
        ...withConfidenceDeltas(confidence, {
          presenceConfidence: 0.01,
          yieldConfidence: -0.03,
          processingConfidence: 0.01,
        }),
        yieldConfidence: round2(Math.min(confidence.yieldConfidence, 0.28)),
      };
    case "suspected_processing_needed":
      return {
        ...withConfidenceDeltas(confidence, {
          processingConfidence: 0.03,
        }),
        processingConfidence: round2(Math.min(confidence.processingConfidence + 0.03, 0.28)),
      };
    case "suspected_safety_risk":
    case "avoided_due_to_risk":
      return {
        ...confidence,
        safetyConfidence: round2(Math.min(confidence.safetyConfidence, 0.24)),
      };
    case "material_use_only":
      return withConfidenceDeltas(confidence, {
        presenceConfidence: 0.02,
        accessConfidence: 0.02,
        processingConfidence: 0.01,
      });
    case "no_test_too_uncertain":
      return confidence;
  }
}

function updateLearningFromPlantUseTest(
  previous: ResourcePatchLearningMemory | undefined,
  tick: TickNumber,
  result: PlantUseTestResult,
): ResourcePatchLearningMemory {
  const outcome = learningOutcomeForPlantUseTest(result);
  const contradictionKind = contradictionKindForPlantUseTest(result);
  const contradiction = contradictionKind !== "no_contradiction_confirmed" && contradictionKind !== "partial_confirmation";
  const partial = contradictionKind === "partial_confirmation";
  const noInfo = contradictionKind === "memory_refreshed_without_confirmation";
  const seasonalMismatch = contradictionKind === "expected_seasonal_found_out_of_season";

  return {
    lastOutcome: outcome,
    lastContradictionKind: contradictionKind,
    lastOutcomeTick: tick,
    lastFailedTick: contradiction ? tick : previous?.lastFailedTick,
    confirmationCount: Math.min(
      999,
      (previous?.confirmationCount ?? 0) + (contradictionKind === "no_contradiction_confirmed" ? 1 : 0),
    ),
    contradictionCount: Math.min(999, (previous?.contradictionCount ?? 0) + (contradiction ? 1 : 0)),
    partialConfirmationCount: Math.min(999, (previous?.partialConfirmationCount ?? 0) + (partial ? 1 : 0)),
    noInfoCount: Math.min(999, (previous?.noInfoCount ?? 0) + (noInfo ? 1 : 0)),
    falseInferenceCount: previous?.falseInferenceCount ?? 0,
    seasonalMismatchCount: Math.min(999, (previous?.seasonalMismatchCount ?? 0) + (seasonalMismatch ? 1 : 0)),
  };
}

function learningOutcomeForPlantUseTest(result: PlantUseTestResult): ResourcePatchLearningOutcome {
  switch (result) {
    case "cautious_no_effect_observed":
    case "learned_presence":
      return "confirmed_patch_present";
    case "learned_seasonality":
      return "confirmed_seasonal_absent";
    case "learned_low_value":
      return "found_low_abundance";
    case "suspected_processing_needed":
      return "processing_need_suspected";
    case "suspected_safety_risk":
    case "avoided_due_to_risk":
      return "safety_risk_detected";
    case "material_use_only":
      return "confirmed_patch_present";
    case "no_test_too_uncertain":
      return "memory_refreshed_no_new_info";
  }
}

function contradictionKindForPlantUseTest(result: PlantUseTestResult): ResourcePatchContradictionKind {
  switch (result) {
    case "cautious_no_effect_observed":
    case "learned_presence":
    case "material_use_only":
      return "partial_confirmation";
    case "learned_seasonality":
      return "expected_seasonal_found_out_of_season";
    case "learned_low_value":
      return "expected_abundant_found_low";
    case "suspected_processing_needed":
    case "suspected_safety_risk":
    case "avoided_due_to_risk":
      return "partial_confirmation";
    case "no_test_too_uncertain":
      return "memory_refreshed_without_confirmation";
  }
}

function makePlantUseTestEventId(
  input: PlantUseTestContext,
  attempt: {
    readonly testKind: PlantUseTestKind;
    readonly result: PlantUseTestResult;
  },
): EventId {
  return `event:plant_use_test:${input.bandId}:${input.eligibility.tileId}:${input.tick}:${attempt.testKind}:${attempt.result}` as EventId;
}

function makePlantUseTestReason(
  input: PlantUseTestContext,
  attempt: {
    readonly testKind: PlantUseTestKind;
    readonly result: PlantUseTestResult;
  },
): ReasonId {
  return `reason:plant_use_test:${input.eligibility.tileId}:${input.tick}:${attempt.testKind}:${attempt.result}` as ReasonId;
}

function withConfidenceDeltas(
  confidence: ResourceConfidenceProfile,
  delta: Partial<ResourceConfidenceProfile>,
): ResourceConfidenceProfile {
  return {
    presenceConfidence: round2(clamp01(confidence.presenceConfidence + (delta.presenceConfidence ?? 0))),
    seasonConfidence: round2(clamp01(confidence.seasonConfidence + (delta.seasonConfidence ?? 0))),
    yieldConfidence: round2(clamp01(confidence.yieldConfidence + (delta.yieldConfidence ?? 0))),
    safetyConfidence: round2(clamp01(confidence.safetyConfidence + (delta.safetyConfidence ?? 0))),
    processingConfidence: round2(clamp01(confidence.processingConfidence + (delta.processingConfidence ?? 0))),
    accessConfidence: round2(clamp01(confidence.accessConfidence + (delta.accessConfidence ?? 0))),
    recoveryConfidence: round2(clamp01(confidence.recoveryConfidence + (delta.recoveryConfidence ?? 0))),
  };
}

function capSafety(confidence: ResourceConfidenceProfile, cap: number): ResourceConfidenceProfile {
  return {
    ...confidence,
    safetyConfidence: round2(Math.min(confidence.safetyConfidence, cap)),
  };
}

function roundConfidenceProfile(confidence: ResourceConfidenceProfile): ResourceConfidenceProfile {
  return {
    presenceConfidence: round2(confidence.presenceConfidence),
    seasonConfidence: round2(confidence.seasonConfidence),
    yieldConfidence: round2(confidence.yieldConfidence),
    safetyConfidence: round2(confidence.safetyConfidence),
    processingConfidence: round2(confidence.processingConfidence),
    accessConfidence: round2(confidence.accessConfidence),
    recoveryConfidence: round2(confidence.recoveryConfidence),
  };
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
