// Chronic hardship escalation (checkpoint CAUSAL-REPAIR-1) — repeated
// low-support evidence must RAISE action pressure instead of de-escalating it.
//
// WHY THIS EXISTS (CAUSAL_AGENCY_DIAGNOSTIC §15.3): the decision score gives
// `stay` a flat +0.24 plus an anchor hold bonus, every move pays a fixed toll,
// and `getPopulationPressure` scales with population/86 — so a band shrinking
// 36→20 on a failing patch receives LESS movement pressure the worse things
// get, and chronic decline contributed only a +0.05 probe nudge. Foraging
// theory expects the inverse: a patch is abandoned when its marginal return
// falls to the remembered habitat average, even without a proven better
// alternative (marginal-value family: Charnov 1976; camp-departure-before-
// depletion: Venkataraman et al. 2017 — source families recorded per project
// Source Discipline; couplings kept conservative).
//
// WHAT THIS DOES: derives, per decision, a bounded ChronicHardshipSignal from
// evidence the band ALREADY persists about its own repeated experience —
// its 8-season return memory (`returnTrend.mean8`, `chronicDecline`), the
// M0.11 sustained shared-catchment over-capacity signal, its own food-per-
// person stress, range saturation, and how long it has dwelt on the current
// tile. The signal exposes three capped effects the decision reads:
//   * stayBiasErosion  — multiplies DOWN the flat stay bonus + anchor hold;
//   * movePressureBoost — added into mobility/net move pressure (pressure.ts);
//   * scoutUrgency      — added into the exploration baseline.
//
// HARD SCOPE LOCK: no new Band state (pure derivation from persisted fields),
// no truth richness, no map scan, no forced departure (erosion is bounded so
// water/refuge/route/anchor blockers still win when they are real), no
// unseeded random call, no `any`, no UI imports. Deterministic: same band
// state → same signal.

import type { Band } from "./types";
import type { BandTendencyProfile } from "./bandTendency";

// Caps — every downstream effect is bounded by these named constants.
export const STAY_BIAS_EROSION_CAP = 0.6;
export const MOVE_PRESSURE_BOOST_CAP = 0.18;
export const SCOUT_URGENCY_CAP = 0.14;

// A band whose 8-season mean return sits at/above this is not in hardship.
const COMFORT_RETURN_FLOOR = 0.45;
// Dwell seasons needed before hardship escalates fully — the "repeated while
// staying" quality; a band that just arrived is not yet stuck.
const FULL_ESCALATION_DWELL_SEASONS = 8;
// Severity below this is treated as inactive (gate-inert for healthy bands).
const ACTIVE_SEVERITY_FLOOR = 0.08;

export interface ChronicHardshipSignal {
  readonly bandId: Band["id"];
  // Blended repeated-low-support evidence, 0..1.
  readonly severity: number;
  // Evidence components (debug/audit visibility, all 0..1).
  readonly lowReturnEvidence: number;
  readonly saturationEvidence: number;
  readonly foodStressEvidence: number;
  // 0.5..1 — how much dwelling on the current tile escalates the evidence.
  readonly dwellEscalation: number;
  // Capped effects consumed by the decision.
  readonly stayBiasErosion: number;
  readonly movePressureBoost: number;
  readonly scoutUrgency: number;
  // False for comfortable bands: every effect is exactly 0.
  readonly active: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function deriveChronicHardship(
  band: Band,
  tendencies?: BandTendencyProfile,
): ChronicHardshipSignal {
  const returnTrend = band.returnTrend ?? band.carryingCapacity?.returnTrend;
  const sustainedOverCapacity =
    band.carryingCapacity?.perCapitaReturn.sustainedOverCapacity ??
    band.perCapitaReturn?.sustainedOverCapacity ??
    0;

  // Repeated poor returns: the band's own 8-season memory, not one bad season.
  const lowReturnEvidence =
    returnTrend === undefined || returnTrend.sampleCount < 4
      ? 0
      : clamp01(
          (COMFORT_RETURN_FLOOR - returnTrend.mean8) * 1.6 +
            (returnTrend.chronicDecline ? 0.25 : 0),
        );
  // Sustained shared-catchment over-capacity (M0.11, ≥2 consecutive
  // derivations) plus the standing saturation pressure.
  const saturationEvidence = clamp01(
    sustainedOverCapacity * 0.6 +
      (band.rangeSaturation?.saturationPressure ?? 0) * 0.2,
  );
  const foodStressEvidence = clamp01(band.demography.foodPerPersonStress);

  // Only fully escalate once the band has actually stayed through the
  // hardship — this is what makes the signal about REPEATED conditions.
  const dwellEscalation =
    0.5 + Math.min(1, band.consecutiveSeasonsOnTile / FULL_ESCALATION_DWELL_SEASONS) * 0.5;

  // Deterministic per-band variation: failure-sensitive bands feel repeated
  // hardship sooner; stoic bands hold longer. Bounded ±15%.
  const sensitivityScale = 1 + (tendencies?.failureSensitivity ?? 0) * 0.15;

  const severity = round2(
    clamp01(
      (lowReturnEvidence * 0.5 +
        saturationEvidence * 0.3 +
        foodStressEvidence * 0.34) *
        dwellEscalation *
        sensitivityScale,
    ),
  );
  const active = severity > ACTIVE_SEVERITY_FLOOR;

  return {
    bandId: band.id,
    severity,
    lowReturnEvidence: round2(lowReturnEvidence),
    saturationEvidence: round2(saturationEvidence),
    foodStressEvidence: round2(foodStressEvidence),
    dwellEscalation: round2(dwellEscalation),
    stayBiasErosion: active ? round2(Math.min(STAY_BIAS_EROSION_CAP, severity * 0.75)) : 0,
    movePressureBoost: active ? round2(Math.min(MOVE_PRESSURE_BOOST_CAP, severity * 0.22)) : 0,
    scoutUrgency: active ? round2(Math.min(SCOUT_URGENCY_CAP, severity * 0.18)) : 0,
    active,
  };
}
