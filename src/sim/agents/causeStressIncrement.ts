import type { BandId, EventId, ReasonId, Season, TickNumber } from "../core/types";
import type { NormalizedIntensity } from "../rules/types";
import type {
  CauseSpecificConfidence,
  CauseSpecificEvent,
  CauseSpecificEventRingEntry,
} from "./causeSpecificEvent";
import {
  deriveCauseStressReadiness,
  deriveCauseStressReadinessDigest,
  type CauseStressDomain,
  type CauseStressReadinessLevel,
} from "./causeStressReadiness";

// ---------------------------------------------------------------------------
// Checkpoint 2K.3D — First Bounded Cause-Attributed Nonlethal Stress Increment.
//
// FEATURE-FLAGGED, REVERSIBLE, NONLETHAL. This is the FIRST place a cause event /
// readiness label may translate into an actual (tiny, capped) cause-attributed STRESS
// CONTRIBUTION — but ONLY under an explicit opt-in flag, ONLY for one or two
// high-confidence domains, and the value is reported SEPARATELY (causeStressContribution
// V0). It is NOT written into the band's `pressureState`/`foodStress` (the existing
// stress blob that feeds movement / viability / demography), so it cannot drive any
// behaviour until a later checkpoint explicitly and reviewably wires it in.
//
// HARD SCOPE LOCK: a contribution NEVER changes mortality, population, yield, carrying
// capacity, per-capita return, relocation, fission, or movement scoring; there is NO
// random poisoning and NO disease spread. With the flag OFF (the default) the applied
// delta is exactly 0 and nothing is computed into behaviour — macro is byte-identical.
// The increment is PURE/DERIVED (no new band state): turning the flag off again removes
// the effect entirely; the increment itself stores no permanent memory.
// ---------------------------------------------------------------------------

export interface CauseStressV0Options {
  // Off by default everywhere. Only targeted/audit scenarios set this true.
  readonly enabled: boolean;
}

const DISABLED: CauseStressV0Options = { enabled: false };

// Only these high-confidence domains are eligible for the v0 increment. water_safety
// stays placeholder-only; illness_suspicion / fallback_low_value / avoidance_caution /
// unknown_cause are deferred to a later, separately-reviewed checkpoint.
const V0_ELIGIBLE_DOMAINS: ReadonlySet<CauseStressDomain> = new Set<CauseStressDomain>([
  "food_safety",
  "processing_uncertainty",
]);

// Tiny, capped magnitudes. No cascading: the per-event delta is capped, and the
// band-level aggregate is capped again well below any behaviour-relevant threshold.
const CAUSE_STRESS_V0_EVENT_CAP = 0.04;
const CAUSE_STRESS_V0_BAND_CAP = 0.08;

const READINESS_BASE_DELTA: Readonly<Record<CauseStressReadinessLevel, number>> = {
  none: 0,
  trace: 0.01,
  mild_future: 0.02,
  moderate_future_placeholder: 0.03,
};

const CONFIDENCE_SCALE: Readonly<Record<CauseSpecificConfidence, number>> = {
  suspected: 0.6,
  plausible: 0.85,
  strong_later: 1,
};

// processing uncertainty is a milder stressor than a food-safety/toxicity suspicion.
const DOMAIN_SCALE: Readonly<Partial<Record<CauseStressDomain, number>>> = {
  food_safety: 1,
  processing_uncertainty: 0.5,
};

export interface CauseStressContributionV0 {
  readonly sourceCauseEventId: EventId;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly stressDomain: CauseStressDomain;
  readonly readiness: CauseStressReadinessLevel;
  readonly confidence: CauseSpecificConfidence;
  readonly v0Eligible: boolean;
  readonly flagEnabled: boolean;
  // What the domain/readiness/confidence IMPLY (always computed for transparency)…
  readonly stressDelta: NormalizedIntensity;
  readonly cappedStressDelta: NormalizedIntensity;
  // …vs what is actually applied (0 unless the flag is on AND the domain is v0-eligible).
  readonly appliedStressDelta: NormalizedIntensity;
  readonly appliedBecauseFlagEnabled: boolean;
  readonly nonlethal: true;
  readonly appliesToSeparateCauseStressFieldOnly: true;
  readonly noMortalityChange: true;
  readonly noPopulationChange: true;
  readonly noYieldChange: true;
  readonly noCarryingCapacityChange: true;
  readonly noRelocationChange: true;
  readonly reasonIds: readonly ReasonId[];
}

// Compact band-level aggregate, DERIVED on demand from the existing bounded cause-event
// ring (no new band state), exactly like the readiness summary.
export interface CauseStressContributionV0Summary {
  readonly flagEnabled: boolean;
  readonly contributingEventCount: number;
  readonly byStressDomain: Readonly<Partial<Record<CauseStressDomain, number>>>;
  readonly totalCappedStressDelta: NormalizedIntensity;
  readonly totalAppliedStressDelta: NormalizedIntensity;
  readonly latestContribution?: CauseStressContributionV0;
  readonly appliesToSeparateCauseStressFieldOnly: true;
  readonly noMortalityChange: true;
  readonly noPopulationChange: true;
  readonly noYieldChange: true;
  readonly noRelocationChange: true;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Derive the bounded, cause-labelled v0 stress contribution for a single cause event.
// With `enabled=false` (default) the applied delta is 0; the potential delta is still
// reported so the report/UI can show "what would apply if enabled".
export function deriveCauseStressContributionV0(
  event: CauseSpecificEvent,
  options: CauseStressV0Options = DISABLED,
): CauseStressContributionV0 {
  const readiness = deriveCauseStressReadiness(event);
  const domain = readiness.stressDomain;
  const v0Eligible = V0_ELIGIBLE_DOMAINS.has(domain);
  const base = READINESS_BASE_DELTA[readiness.stressReadiness];
  const domainScale = DOMAIN_SCALE[domain] ?? 0;
  const rawDelta = v0Eligible ? round3(base * CONFIDENCE_SCALE[event.confidence] * domainScale) : 0;
  const cappedStressDelta = Math.min(CAUSE_STRESS_V0_EVENT_CAP, rawDelta);
  const appliedBecauseFlagEnabled = options.enabled && v0Eligible && cappedStressDelta > 0;
  const appliedStressDelta = appliedBecauseFlagEnabled ? cappedStressDelta : 0;
  const reasonId =
    `reason:cause_stress_v0:${event.tileId}:${event.tick}:${domain}:${appliedBecauseFlagEnabled ? "applied" : "inert"}` as ReasonId;

  return {
    sourceCauseEventId: event.eventId,
    bandId: event.bandId,
    tick: event.tick,
    season: event.season,
    stressDomain: domain,
    readiness: readiness.stressReadiness,
    confidence: event.confidence,
    v0Eligible,
    flagEnabled: options.enabled,
    stressDelta: rawDelta,
    cappedStressDelta,
    appliedStressDelta,
    appliedBecauseFlagEnabled,
    nonlethal: true,
    appliesToSeparateCauseStressFieldOnly: true,
    noMortalityChange: true,
    noPopulationChange: true,
    noYieldChange: true,
    noCarryingCapacityChange: true,
    noRelocationChange: true,
    reasonIds: [reasonId, ...readiness.reasonIds.slice(0, 2)],
  };
}

// Band-level aggregate over the bounded cause-event ring (+ the latest event). Derived,
// stateless, capped — no cascading and no new band state.
export function summarizeCauseStressContributionV0(
  lastEvent: CauseSpecificEvent | undefined,
  ring: readonly CauseSpecificEventRingEntry[] | undefined,
  options: CauseStressV0Options = DISABLED,
): CauseStressContributionV0Summary {
  const entries = ring ?? [];
  const byStressDomain: Partial<Record<CauseStressDomain, number>> = {};
  let totalCapped = 0;
  let totalApplied = 0;
  let contributing = 0;

  for (const entry of entries) {
    const digest = deriveCauseStressReadinessDigest(entry);
    if (!V0_ELIGIBLE_DOMAINS.has(digest.stressDomain)) {
      continue;
    }
    const base = READINESS_BASE_DELTA[digest.stressReadiness];
    const domainScale = DOMAIN_SCALE[digest.stressDomain] ?? 0;
    const capped = Math.min(
      CAUSE_STRESS_V0_EVENT_CAP,
      round3(base * CONFIDENCE_SCALE[entry.confidence] * domainScale),
    );
    if (capped <= 0) {
      continue;
    }
    contributing += 1;
    byStressDomain[digest.stressDomain] = (byStressDomain[digest.stressDomain] ?? 0) + 1;
    totalCapped += capped;
    if (options.enabled) {
      totalApplied += capped;
    }
  }

  return {
    flagEnabled: options.enabled,
    contributingEventCount: contributing,
    byStressDomain,
    totalCappedStressDelta: round3(Math.min(CAUSE_STRESS_V0_BAND_CAP, totalCapped)),
    totalAppliedStressDelta: round3(Math.min(CAUSE_STRESS_V0_BAND_CAP, totalApplied)),
    latestContribution: lastEvent === undefined ? undefined : deriveCauseStressContributionV0(lastEvent, options),
    appliesToSeparateCauseStressFieldOnly: true,
    noMortalityChange: true,
    noPopulationChange: true,
    noYieldChange: true,
    noRelocationChange: true,
  };
}
