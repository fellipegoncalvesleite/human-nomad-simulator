import type { EventId, ReasonId, ResourcePatchId, Season, TickNumber, TileId, BandId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { ResourceClassId } from "./resourceClasses";
import type { PlantClassId } from "./plantPatches";
import type { PlantUseEligibility } from "./plantUseEligibility";
import type { PlantUseTestEvent } from "./plantUseTesting";
import type {
  ResourceConfidenceProfile,
  ResourceKnowledgeState,
  ResourcePatchMemory,
  PlantObservationMemory,
  ResourceRiskMemory,
} from "./resourceKnowledge";
import { enforceResourceKnowledgeCap } from "./resourceKnowledge";

// ---------------------------------------------------------------------------
// Checkpoint 2K.3A — Cause-Specific Stress / Nonlethal Illness-Poisoning Event
// Scaffold v0.
//
// This is a TYPED EVENT/MEMORY/DEBUG SCAFFOLD ONLY. It represents the *possible
// consequences* of risky food/water/testing as cause-specific, nonlethal,
// suspicion-level records so later checkpoints can attach real stress/yield/
// illness behaviour to a CAUSE — instead of plants silently becoming safe
// calories. It is wired only to the post-scout plant-use/test pipeline (2K.2E).
//
// HARD SCOPE LOCK (must remain true): a CauseSpecificEvent NEVER changes
// population, mortality, stress, effectiveYield, carryingCapacity,
// perCapitaReturn, relocation, fission, or movement scoring. There is NO random
// poisoning/illness. Safety/processing stay suspicion-level. The only writes are
// to conservative band-known caution memory (already behaviour-neutral risk
// flags + plant-observation suspicion) and a capped per-band debug ring.
// ---------------------------------------------------------------------------

// WHERE the cause came from. Only `plant_test` is emitted today; the rest are
// reserved type members for future water/food/processing causes so downstream
// consumers (and the graph) can already branch on a stable taxonomy.
export type CauseSpecificEventSource =
  | "plant_test"
  | "water_quality_future"
  | "food_safety_future"
  | "processing_failure_future"
  | "unknown_future";

// WHAT is suspected. Plant-derived kinds are emitted now; water/spoilage/pathogen
// kinds are reserved placeholders (no behaviour, no truth).
export type CauseSpecificCauseKind =
  | "suspected_plant_reaction"
  | "suspected_toxicity"
  | "suspected_processing_problem"
  | "bad_taste_or_rejection"
  | "stomach_sickness_suspected"
  | "water_safety_suspected"
  | "contaminated_water_future"
  | "spoilage_future"
  | "parasite_or_pathogen_future"
  | "unknown_cause";

// All severities are NONLETHAL placeholders. `moderate_placeholder` is reserved
// for a future checkpoint that introduces real (still bounded) consequences; it
// is intentionally not emitted yet.
export type CauseSpecificSeverity =
  | "none"
  | "trace"
  | "mild"
  | "moderate_placeholder";

export type CauseSpecificConfidence = "suspected" | "plausible" | "strong_later";

export type CauseSpecificOutcome =
  | "no_effect_observed"
  | "avoided_due_to_risk"
  | "mild_bad_reaction_suspected"
  | "processing_problem_suspected"
  | "safety_warning_created"
  | "cause_uncertain";

export type CauseSpecificMemoryEffect =
  | "none"
  | "caution_added"
  | "safety_confidence_lowered"
  | "processing_suspicion_raised"
  | "avoidance_hint_added";

export interface CauseSpecificEvent {
  readonly eventId: EventId;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly tileId: TileId;
  readonly source: CauseSpecificEventSource;
  readonly causeKind: CauseSpecificCauseKind;
  readonly severity: CauseSpecificSeverity;
  readonly confidence: CauseSpecificConfidence;
  // Deterministic NONLETHAL placeholder only — never consumed by demography/yield.
  readonly affectedShareEstimate: NormalizedIntensity;
  readonly linkedPatchId?: ResourcePatchId;
  readonly linkedPlantClassId?: PlantClassId;
  readonly linkedResourceClassId?: ResourceClassId;
  readonly linkedWaterTile?: TileId;
  readonly linkedPlantUseTestEventId?: EventId;
  readonly linkedScoutEventId?: EventId;
  readonly outcome: CauseSpecificOutcome;
  readonly memoryEffect: CauseSpecificMemoryEffect;
  readonly safetyBefore: NormalizedIntensity;
  readonly safetyAfter: NormalizedIntensity;
  readonly memoryUpdated: boolean;
  readonly noMortalityChange: true;
  readonly noPopulationChange: true;
  readonly noYieldChange: true;
  readonly noStressChange: true;
  readonly noRelocationChange: true;
  readonly noCarryingCapacityChange: true;
  readonly nonlethalScaffoldOnly: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface CauseSpecificEventRingEntry {
  readonly tick: TickNumber;
  readonly season: Season;
  readonly tileId: TileId;
  readonly source: CauseSpecificEventSource;
  readonly causeKind: CauseSpecificCauseKind;
  readonly severity: CauseSpecificSeverity;
  readonly confidence: CauseSpecificConfidence;
  readonly linkedPatchId?: ResourcePatchId;
  readonly linkedPlantClassId?: PlantClassId;
  readonly linkedResourceClassId?: ResourceClassId;
  readonly outcome: CauseSpecificOutcome;
  readonly memoryEffect: CauseSpecificMemoryEffect;
  readonly safetyDelta: number;
  readonly memoryUpdated: boolean;
  readonly noMortalityChange: true;
  readonly noPopulationChange: true;
  readonly noYieldChange: true;
  readonly noStressChange: true;
  readonly noRelocationChange: true;
  readonly reasonIds: readonly ReasonId[];
}

export interface CauseSpecificEventContext {
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly memory: ResourcePatchMemory;
  readonly plantUseTest: PlantUseTestEvent;
  readonly eligibility: PlantUseEligibility;
  readonly scoutEventId?: EventId;
}

export interface CauseSpecificEventUpdate {
  readonly resourceKnowledgeState: ResourceKnowledgeState;
  readonly memory: ResourcePatchMemory;
  readonly event: CauseSpecificEvent;
}

const RECENT_CAUSE_SPECIFIC_EVENT_CAP = 6;

// Lowest suspicion-level safety cap a single cause event may pull safety down to.
// Stays well under any "safe" threshold — caution, never certainty.
const CAUSE_SAFETY_CAUTION_CAP = 0.2;

// Derive a bounded, nonlethal CauseSpecificEvent from a post-scout plant-use/test
// event. Returns undefined when the test outcome is not a risk consequence
// (observe-only / seasonality / presence / material / no-test) so most plant
// tests produce NO cause event — this is deliberately not 1:1 with plant tests.
export function deriveCauseSpecificEventFromPlantUseTest(
  state: ResourceKnowledgeState,
  input: CauseSpecificEventContext,
): CauseSpecificEventUpdate | undefined {
  const decision = chooseCauseSpecificOutcome(input.plantUseTest, input.eligibility, input.memory);
  if (decision === undefined) {
    return undefined;
  }

  const reasonId = makeCauseSpecificReason(input, decision);
  const updatedMemory = applyCauseSpecificEventToMemory(input.memory, decision, input.tick, reasonId);
  const memoryUpdated = updatedMemory !== input.memory;
  const linkedPlantClassId = input.eligibility.plantClassId ?? input.memory.plantObservation?.plantClassId;

  const event: CauseSpecificEvent = {
    eventId: makeCauseSpecificEventId(input, decision),
    bandId: input.bandId,
    tick: input.tick,
    season: input.season,
    tileId: input.eligibility.tileId,
    source: "plant_test",
    causeKind: decision.causeKind,
    severity: decision.severity,
    confidence: decision.confidence,
    affectedShareEstimate: affectedShareForSeverity(decision.severity),
    linkedPatchId: input.memory.patchId,
    linkedPlantClassId,
    linkedResourceClassId: input.eligibility.linkedResourceClassId,
    linkedWaterTile: undefined,
    linkedPlantUseTestEventId: input.plantUseTest.eventId,
    linkedScoutEventId: input.scoutEventId,
    outcome: decision.outcome,
    memoryEffect: decision.memoryEffect,
    safetyBefore: round2(input.memory.confidence.safetyConfidence),
    safetyAfter: round2(updatedMemory.confidence.safetyConfidence),
    memoryUpdated,
    noMortalityChange: true,
    noPopulationChange: true,
    noYieldChange: true,
    noStressChange: true,
    noRelocationChange: true,
    noCarryingCapacityChange: true,
    nonlethalScaffoldOnly: true,
    reasonIds: [reasonId, ...input.plantUseTest.reasonIds.slice(0, 4)].slice(0, 8),
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

export function appendRecentCauseSpecificEvent(
  previous: readonly CauseSpecificEventRingEntry[] | undefined,
  event: CauseSpecificEvent | undefined,
): readonly CauseSpecificEventRingEntry[] | undefined {
  if (event === undefined) {
    return previous;
  }

  const entry: CauseSpecificEventRingEntry = {
    tick: event.tick,
    season: event.season,
    tileId: event.tileId,
    source: event.source,
    causeKind: event.causeKind,
    severity: event.severity,
    confidence: event.confidence,
    linkedPatchId: event.linkedPatchId,
    linkedPlantClassId: event.linkedPlantClassId,
    linkedResourceClassId: event.linkedResourceClassId,
    outcome: event.outcome,
    memoryEffect: event.memoryEffect,
    safetyDelta: round2(event.safetyAfter - event.safetyBefore),
    memoryUpdated: event.memoryUpdated,
    noMortalityChange: true,
    noPopulationChange: true,
    noYieldChange: true,
    noStressChange: true,
    noRelocationChange: true,
    reasonIds: event.reasonIds.slice(0, 6),
  };

  return [entry, ...(previous ?? [])].slice(0, RECENT_CAUSE_SPECIFIC_EVENT_CAP);
}

interface CauseSpecificDecision {
  readonly causeKind: CauseSpecificCauseKind;
  readonly severity: CauseSpecificSeverity;
  readonly confidence: CauseSpecificConfidence;
  readonly outcome: CauseSpecificOutcome;
  readonly memoryEffect: CauseSpecificMemoryEffect;
}

function chooseCauseSpecificOutcome(
  plantUseTest: PlantUseTestEvent,
  eligibility: PlantUseEligibility,
  memory: ResourcePatchMemory,
): CauseSpecificDecision | undefined {
  const medicinalOrToxic =
    plantUseTest.testKind === "medicinal_toxic_caution" ||
    eligibility.linkedResourceClassId === "medicinal_or_toxic";
  const priorSafetyCaution =
    memory.risk.poisoningOrBadReaction ||
    memory.risk.tabooOrAvoidanceFutureFlag ||
    memory.plantObservation?.suspectedSafetyRisk === true;
  const priorProcessingSuspicion = memory.plantObservation?.suspectedProcessingNeed === true;

  switch (plantUseTest.result) {
    case "suspected_safety_risk":
      // A safety warning was created from a cautious test. Suspicion only — never
      // a confirmed reaction (the band did not consume), so no poisoning flag.
      return {
        causeKind: "suspected_toxicity",
        severity: "trace",
        confidence: "plausible",
        outcome: "safety_warning_created",
        memoryEffect: "safety_confidence_lowered",
      };
    case "avoided_due_to_risk":
      // The band avoided the patch. If it was already cautious here, escalate to a
      // (behaviour-neutral) avoidance readiness flag; otherwise just add caution.
      return {
        causeKind: medicinalOrToxic ? "suspected_toxicity" : "suspected_plant_reaction",
        severity: "none",
        confidence: "suspected",
        outcome: "avoided_due_to_risk",
        memoryEffect: priorSafetyCaution ? "avoidance_hint_added" : "caution_added",
      };
    case "suspected_processing_needed":
      return {
        causeKind: "suspected_processing_problem",
        severity: "none",
        confidence: "plausible",
        outcome: "processing_problem_suspected",
        memoryEffect: "processing_suspicion_raised",
      };
    case "learned_low_value":
      // A fallback trial under stress. 2K.3A-A semantic split:
      //  - PRIOR SAFETY caution already present → a (suspicion-level) mild bad
      //    reaction is plausible: durable bad-reaction caution. Still NOT confirmed
      //    poisoning, no calories, no stress.
      //  - PROCESSING-ONLY suspicion (no safety caution) → label it a PROCESSING
      //    problem, NOT a bad reaction / poisoning. Raises processing suspicion only;
      //    does not set the durable poisoning flag.
      if (plantUseTest.testKind !== "fallback_trial") {
        return undefined;
      }
      if (priorSafetyCaution) {
        return {
          causeKind: "suspected_plant_reaction",
          severity: "mild",
          confidence: "suspected",
          outcome: "mild_bad_reaction_suspected",
          memoryEffect: "safety_confidence_lowered",
        };
      }
      if (priorProcessingSuspicion) {
        return {
          causeKind: "suspected_processing_problem",
          severity: "trace",
          confidence: "suspected",
          outcome: "processing_problem_suspected",
          memoryEffect: "processing_suspicion_raised",
        };
      }
      return undefined;
    case "cautious_no_effect_observed":
    case "learned_presence":
    case "learned_seasonality":
    case "material_use_only":
    case "no_test_too_uncertain":
      // Not a risk consequence: no cause event (keeps events meaningful + bounded).
      return undefined;
  }
}

function applyCauseSpecificEventToMemory(
  memory: ResourcePatchMemory,
  decision: CauseSpecificDecision,
  tick: TickNumber,
  reasonId: ReasonId,
): ResourcePatchMemory {
  if (decision.memoryEffect === "none") {
    return memory;
  }

  let confidence: ResourceConfidenceProfile = memory.confidence;
  let plantObservation: PlantObservationMemory | undefined = memory.plantObservation;
  let risk: ResourceRiskMemory = memory.risk;

  switch (decision.memoryEffect) {
    case "safety_confidence_lowered": {
      const capped = round2(Math.min(confidence.safetyConfidence, CAUSE_SAFETY_CAUTION_CAP));
      if (capped !== confidence.safetyConfidence) {
        confidence = { ...confidence, safetyConfidence: capped };
      }
      plantObservation = withObservationFlag(plantObservation, "safety", reasonId);
      // A mild bad reaction was *suspected* (not proven) — record durable caution.
      if (decision.outcome === "mild_bad_reaction_suspected" && !risk.poisoningOrBadReaction) {
        risk = { ...risk, poisoningOrBadReaction: true };
      }
      break;
    }
    case "caution_added":
      plantObservation = withObservationFlag(plantObservation, "safety", reasonId);
      if (plantObservation === memory.plantObservation && !risk.tabooOrAvoidanceFutureFlag) {
        // No plant observation to flag — fall back to the durable avoidance flag so
        // the caution is still remembered somewhere (behaviour-neutral).
        risk = { ...risk, tabooOrAvoidanceFutureFlag: true };
      }
      break;
    case "avoidance_hint_added":
      // Behaviour-neutral future flag only: NOTHING consumes this for movement.
      if (!risk.tabooOrAvoidanceFutureFlag) {
        risk = { ...risk, tabooOrAvoidanceFutureFlag: true };
      }
      plantObservation = withObservationFlag(plantObservation, "safety", reasonId);
      break;
    case "processing_suspicion_raised":
      plantObservation = withObservationFlag(plantObservation, "processing", reasonId);
      break;
  }

  const changed =
    confidence !== memory.confidence ||
    plantObservation !== memory.plantObservation ||
    risk !== memory.risk;
  if (!changed) {
    return memory;
  }

  return {
    ...memory,
    confidence,
    plantObservation,
    risk,
    lastNotedTick: tick,
    reasonIds: [...memory.reasonIds, reasonId].slice(-12),
  };
}

function withObservationFlag(
  observation: PlantObservationMemory | undefined,
  flag: "safety" | "processing",
  reasonId: ReasonId,
): PlantObservationMemory | undefined {
  if (observation === undefined) {
    return undefined;
  }
  const alreadySet =
    flag === "safety" ? observation.suspectedSafetyRisk : observation.suspectedProcessingNeed;
  if (alreadySet) {
    // Idempotent: still record the reason, but only if not already the last reason.
    if (observation.reasonIds[observation.reasonIds.length - 1] === reasonId) {
      return observation;
    }
    return { ...observation, reasonIds: [...observation.reasonIds, reasonId].slice(-12) };
  }
  return {
    ...observation,
    suspectedSafetyRisk: flag === "safety" ? true : observation.suspectedSafetyRisk,
    suspectedProcessingNeed: flag === "processing" ? true : observation.suspectedProcessingNeed,
    reasonIds: [...observation.reasonIds, reasonId].slice(-12),
  };
}

function affectedShareForSeverity(severity: CauseSpecificSeverity): NormalizedIntensity {
  switch (severity) {
    case "none":
      return 0;
    case "trace":
      return 0.02;
    case "mild":
      return 0.08;
    case "moderate_placeholder":
      return 0.18;
  }
}

function makeCauseSpecificEventId(
  input: CauseSpecificEventContext,
  decision: CauseSpecificDecision,
): EventId {
  return `event:cause_specific:${input.bandId}:${input.eligibility.tileId}:${input.tick}:${decision.causeKind}:${decision.outcome}` as EventId;
}

function makeCauseSpecificReason(
  input: CauseSpecificEventContext,
  decision: CauseSpecificDecision,
): ReasonId {
  return `reason:cause_specific:${input.eligibility.tileId}:${input.tick}:${decision.causeKind}:${decision.outcome}` as ReasonId;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
