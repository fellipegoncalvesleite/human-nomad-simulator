import type { BandId, EventId, ReasonId, ResourcePatchId, Season, TickNumber, TileId } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type { ResourceClassId } from "./resourceClasses";
import type { PlantClassId } from "./plantPatches";
import type {
  CauseSpecificCauseKind,
  CauseSpecificConfidence,
  CauseSpecificEvent,
  CauseSpecificEventRingEntry,
  CauseSpecificEventSource,
  CauseSpecificMemoryEffect,
  CauseSpecificOutcome,
  CauseSpecificSeverity,
} from "./causeSpecificEvent";

// ---------------------------------------------------------------------------
// Checkpoint 2K.3B — Cause-Labelled Nonlethal Stress Readiness.
//
// PURE, DERIVED, READINESS/DEBUG ONLY. This classifies a CauseSpecificEvent
// (2K.3A) into the FUTURE stress domain it would later contribute to, so a later
// checkpoint knows *what kind* of stress an event represents before any real
// stress/illness/water consequence exists. It stores NOTHING on the band: the
// per-band aggregate is derived on demand from the existing bounded cause-event
// ring (`recentCauseSpecificEvents`) — no new ring, no new state, no duplication.
//
// HARD SCOPE LOCK: a readiness signal NEVER applies/changes actual stress,
// mortality, population, yield, carrying capacity, per-capita return, movement
// scoring, relocation, fission, or real avoidance/taboo behaviour. There is no
// random poisoning and no disease spread. `appliedToActualStress` is always false.
// ---------------------------------------------------------------------------

export type CauseStressDomain =
  | "food_safety"
  | "water_safety"
  | "processing_uncertainty"
  | "illness_suspicion"
  | "fallback_low_value"
  | "avoidance_caution"
  | "unknown_cause";

export type CauseStressReadinessLevel =
  | "none"
  | "trace"
  | "mild_future"
  | "moderate_future_placeholder";

// The FUTURE systems a signal would feed once consequences exist — labels only.
export type CauseStressFutureEffect =
  | "stress"
  | "avoidance"
  | "resource_confidence"
  | "plant_testing"
  | "water_safety"
  | "culture_taboo_future";

export interface CauseStressReadiness {
  readonly signalId: EventId;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly sourceCauseEventId: EventId;
  readonly source: CauseSpecificEventSource;
  readonly causeKind: CauseSpecificCauseKind;
  readonly stressDomain: CauseStressDomain;
  readonly stressReadiness: CauseStressReadinessLevel;
  readonly confidence: CauseSpecificConfidence;
  readonly affectedShareEstimate: NormalizedIntensity;
  readonly linkedPatchId?: ResourcePatchId;
  readonly linkedPlantClassId?: PlantClassId;
  readonly linkedResourceClassId?: ResourceClassId;
  readonly linkedWaterTile?: TileId;
  readonly memoryEffect: CauseSpecificMemoryEffect;
  readonly wouldAffectFuture: readonly CauseStressFutureEffect[];
  readonly appliedToActualStress: false;
  readonly noStressChange: true;
  readonly noMortalityChange: true;
  readonly noPopulationChange: true;
  readonly noYieldChange: true;
  readonly noRelocationChange: true;
  readonly reasonIds: readonly ReasonId[];
}

// Compact per-band aggregate, DERIVED from the bounded cause-event ring + latest.
export interface CauseStressReadinessSummary {
  readonly recentCauseStressCount: number;
  readonly byStressDomain: Readonly<Record<CauseStressDomain, number>>;
  readonly strongestRecentSignal?: CauseStressReadinessDigest;
  readonly latestSignal?: CauseStressReadiness;
  readonly foodSafetyReadiness: CauseStressReadinessLevel;
  readonly waterSafetyReadiness: CauseStressReadinessLevel;
  readonly processingReadiness: CauseStressReadinessLevel;
  readonly illnessSuspicionReadiness: CauseStressReadinessLevel;
  readonly avoidanceCautionReadiness: CauseStressReadinessLevel;
  readonly unknownCauseReadiness: CauseStressReadinessLevel;
  readonly appliedToActualStress: false;
}

// A minimal digest used inside the aggregate (ring entries lack bandId, so a
// ring-derived signal is reported compactly rather than as a full CauseStressReadiness).
export interface CauseStressReadinessDigest {
  readonly tick: TickNumber;
  readonly season: Season;
  readonly tileId: TileId;
  readonly source: CauseSpecificEventSource;
  readonly causeKind: CauseSpecificCauseKind;
  readonly stressDomain: CauseStressDomain;
  readonly stressReadiness: CauseStressReadinessLevel;
  readonly confidence: CauseSpecificConfidence;
  readonly wouldAffectFuture: readonly CauseStressFutureEffect[];
}

interface CauseStressLabel {
  readonly stressDomain: CauseStressDomain;
  readonly stressReadiness: CauseStressReadinessLevel;
  readonly wouldAffectFuture: readonly CauseStressFutureEffect[];
}

// The deterministic ordering of readiness levels (for "strongest"/per-domain max).
const READINESS_RANK: Readonly<Record<CauseStressReadinessLevel, number>> = {
  none: 0,
  trace: 1,
  mild_future: 2,
  moderate_future_placeholder: 3,
};

const EMPTY_DOMAIN_COUNTS: Readonly<Record<CauseStressDomain, number>> = {
  food_safety: 0,
  water_safety: 0,
  processing_uncertainty: 0,
  illness_suspicion: 0,
  fallback_low_value: 0,
  avoidance_caution: 0,
  unknown_cause: 0,
};

// Full readiness signal for a single cause event (used for the latest signal).
export function deriveCauseStressReadiness(event: CauseSpecificEvent): CauseStressReadiness {
  const label = mapCauseToStressLabel(event.causeKind, event.outcome, event.severity, event.memoryEffect);
  const reasonId =
    `reason:cause_stress_readiness:${event.tileId}:${event.tick}:${label.stressDomain}:${label.stressReadiness}` as ReasonId;

  return {
    signalId: `signal:cause_stress:${event.eventId}` as EventId,
    bandId: event.bandId,
    tick: event.tick,
    season: event.season,
    sourceCauseEventId: event.eventId,
    source: event.source,
    causeKind: event.causeKind,
    stressDomain: label.stressDomain,
    stressReadiness: label.stressReadiness,
    confidence: event.confidence,
    affectedShareEstimate: event.affectedShareEstimate,
    linkedPatchId: event.linkedPatchId,
    linkedPlantClassId: event.linkedPlantClassId,
    linkedResourceClassId: event.linkedResourceClassId,
    linkedWaterTile: event.linkedWaterTile,
    memoryEffect: event.memoryEffect,
    wouldAffectFuture: label.wouldAffectFuture,
    appliedToActualStress: false,
    noStressChange: true,
    noMortalityChange: true,
    noPopulationChange: true,
    noYieldChange: true,
    noRelocationChange: true,
    reasonIds: [reasonId, ...event.reasonIds.slice(0, 3)],
  };
}

// Compact readiness digest for a bounded ring entry (no bandId on the entry).
export function deriveCauseStressReadinessDigest(entry: CauseSpecificEventRingEntry): CauseStressReadinessDigest {
  const label = mapCauseToStressLabel(entry.causeKind, entry.outcome, entry.severity, entry.memoryEffect);
  return {
    tick: entry.tick,
    season: entry.season,
    tileId: entry.tileId,
    source: entry.source,
    causeKind: entry.causeKind,
    stressDomain: label.stressDomain,
    stressReadiness: label.stressReadiness,
    confidence: entry.confidence,
    wouldAffectFuture: label.wouldAffectFuture,
  };
}

// Band-level aggregate, DERIVED from the existing bounded cause-event ring + the
// latest cause event. No band state is added or scanned globally.
export function summarizeCauseStressReadiness(
  lastEvent: CauseSpecificEvent | undefined,
  ring: readonly CauseSpecificEventRingEntry[] | undefined,
): CauseStressReadinessSummary {
  const entries = ring ?? [];
  const digests = entries.map(deriveCauseStressReadinessDigest);

  const byStressDomain: Record<CauseStressDomain, number> = { ...EMPTY_DOMAIN_COUNTS };
  const domainReadiness: Record<CauseStressDomain, CauseStressReadinessLevel> = {
    food_safety: "none",
    water_safety: "none",
    processing_uncertainty: "none",
    illness_suspicion: "none",
    fallback_low_value: "none",
    avoidance_caution: "none",
    unknown_cause: "none",
  };
  let strongest: CauseStressReadinessDigest | undefined;

  for (const digest of digests) {
    byStressDomain[digest.stressDomain] += 1;
    if (READINESS_RANK[digest.stressReadiness] > READINESS_RANK[domainReadiness[digest.stressDomain]]) {
      domainReadiness[digest.stressDomain] = digest.stressReadiness;
    }
    if (strongest === undefined || READINESS_RANK[digest.stressReadiness] > READINESS_RANK[strongest.stressReadiness]) {
      strongest = digest;
    }
  }

  return {
    recentCauseStressCount: digests.length,
    byStressDomain,
    strongestRecentSignal: strongest,
    latestSignal: lastEvent === undefined ? undefined : deriveCauseStressReadiness(lastEvent),
    foodSafetyReadiness: domainReadiness.food_safety,
    waterSafetyReadiness: domainReadiness.water_safety,
    processingReadiness: domainReadiness.processing_uncertainty,
    illnessSuspicionReadiness: domainReadiness.illness_suspicion,
    avoidanceCautionReadiness: domainReadiness.avoidance_caution,
    unknownCauseReadiness: domainReadiness.unknown_cause,
    appliedToActualStress: false,
  };
}

function mapCauseToStressLabel(
  causeKind: CauseSpecificCauseKind,
  outcome: CauseSpecificOutcome,
  severity: CauseSpecificSeverity,
  memoryEffect: CauseSpecificMemoryEffect,
): CauseStressLabel {
  const stressDomain = domainForCause(causeKind, outcome, memoryEffect);
  return {
    stressDomain,
    stressReadiness: readinessFromSeverity(severity),
    wouldAffectFuture: futureEffectsForDomain(stressDomain),
  };
}

function domainForCause(
  causeKind: CauseSpecificCauseKind,
  outcome: CauseSpecificOutcome,
  memoryEffect: CauseSpecificMemoryEffect,
): CauseStressDomain {
  // The band avoided / flagged avoidance: this is caution pressure, not consumption.
  if (outcome === "avoided_due_to_risk" || memoryEffect === "avoidance_hint_added") {
    return "avoidance_caution";
  }
  switch (causeKind) {
    case "suspected_toxicity":
    case "spoilage_future":
      return "food_safety";
    case "suspected_plant_reaction":
    case "stomach_sickness_suspected":
    case "parasite_or_pathogen_future":
      return "illness_suspicion";
    case "suspected_processing_problem":
      return "processing_uncertainty";
    case "bad_taste_or_rejection":
      return "fallback_low_value";
    case "water_safety_suspected":
    case "contaminated_water_future":
      return "water_safety";
    case "unknown_cause":
      return "unknown_cause";
  }
}

// A FIRED cause event always implies at least a `trace` future-stress readiness;
// `none` is reserved for the empty per-domain aggregate default.
function readinessFromSeverity(severity: CauseSpecificSeverity): CauseStressReadinessLevel {
  switch (severity) {
    case "none":
    case "trace":
      return "trace";
    case "mild":
      return "mild_future";
    case "moderate_placeholder":
      return "moderate_future_placeholder";
  }
}

function futureEffectsForDomain(domain: CauseStressDomain): readonly CauseStressFutureEffect[] {
  switch (domain) {
    case "food_safety":
      return ["stress", "resource_confidence", "plant_testing"];
    case "water_safety":
      return ["stress", "water_safety"];
    case "processing_uncertainty":
      return ["resource_confidence", "plant_testing"];
    case "illness_suspicion":
      return ["stress", "avoidance"];
    case "fallback_low_value":
      return ["resource_confidence", "plant_testing"];
    case "avoidance_caution":
      return ["avoidance", "culture_taboo_future"];
    case "unknown_cause":
      return ["stress"];
  }
}
