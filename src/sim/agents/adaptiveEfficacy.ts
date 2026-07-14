// ADAPTIVE EFFICACY FEEDBACK-1 — response-specific practice efficacy.
//
// PROBLEM THIS SOLVES: `classifyAttemptOutcome` previously judged every
// adaptive attempt by the band's broad movement outcome (moved + general
// collapse pressure fell ⇒ success), so a practical response could earn
// confidence from movement that had nothing to do with it. The correct chain
// is: experienced condition → practical response attempted → response affects
// a REAL coefficient/outcome → the sim measures whether THAT response helped
// in THAT context → local confidence changes → later matching behavior changes.
//
// LOOP 1 — crossing practice (route_crossing family). The real coefficient is
// `riverCrossingRisk`: practiced-crossing relief (crossingPractice.ts, cap
// 0.35, per-ford, perishable) is paid by the decision at a specific crossing
// key. Efficacy here reads the DECISION-TIME context (which crossing was
// scored, how much relief was actually applied, raw vs effective risk,
// whether the crossing was blocked) plus the REALIZED outcome (which crossing
// the residential move actually recorded into KnownCrossingMemory, and how
// remembered danger moved). Movement without a matching crossing earns the
// response NOTHING.
//
// LOOP 2 — camp shift (camp_care family). The real signal is the band's OWN
// local use-pressure (camp wear/fouling proxy — the same `usePressure` record
// campMovement's relief scoring pays). A LOCAL one-tile shift made without a
// seasonal travel motive is credited only when the residence wear signal it
// addressed measurably fell; staying put or travelling far for other motives
// earns the camp response nothing.
//
// PRIORITY (never inverted): specific failure/danger > specific clear success
// > specific partial success > specific low/no feedback > generic fallback
// (returning `undefined` hands classification back to the generic movement
// rules, which remain for families without real efficacy signals).
//
// PROPERTIES: pure, deterministic, bounded, anti-omniscient (reads only the
// band's own memories and the coefficients its decision actually paid), local
// (per crossing key / per camp tile — never a universal skill), and fragile
// (failure and danger evidence is first-priority; staleness is inherited from
// crossingPractice decay). No unseeded randomness, no `any`, no UI imports.

import type {
  AdaptiveEfficacyClassification,
  AdaptiveFeedbackType,
  KnownCrossingMemory,
} from "./types";
import {
  CROSSING_PRACTICE_RELIEF_CAP,
  deriveCrossingPracticeRelief,
} from "./crossingPractice";

// Serious matching risk actually paid on the crossing ⇒ dangerous feedback.
const SERIOUS_RISK_FLOOR = 0.55;
// Remembered danger rising by at least this much at the used ford ⇒ dangerous.
const DANGER_DELTA_FLOOR = 0.04;
// Relief must be at least this to count as an ACTIVE practiced response.
const ACTIVE_RELIEF_FLOOR = 0.05;
// The realized risk reduction must be at least this to be "measurable help".
const MEASURABLE_RELIEF_FLOOR = 0.02;
// Camp wear (band-known use pressure) at/above this is a real camp-care condition.
const CAMP_WEAR_CONDITION_FLOOR = 0.3;
// Wear-signal drop thresholds (same 0.06 margin campMovement's relief scoring uses).
const CAMP_WEAR_PARTIAL_DROP = 0.06;
const CAMP_WEAR_CLEAR_DROP = 0.14;

export interface CrossingOutcomeContext {
  // Crossing key on the canonical scored move (the one whose risk the decision paid).
  readonly attemptedCrossingKey?: string;
  // Practiced-crossing relief actually applied to riverCrossingRisk at that key.
  readonly practiceRelief: number;
  // Seasonal effective risk BEFORE tendency scaling and relief.
  readonly rawCrossingRisk: number;
  // Risk the decision actually paid (after caution scaling and relief).
  readonly effectiveCrossingRisk: number;
  readonly crossingBlocked: boolean;
  // Crossing key the REALIZED residential move recorded (memory write), if any.
  readonly usedCrossingKey?: string;
  // A staged migration walk stopped by budget while the motive remained.
  readonly stagedLegIncomplete: boolean;
}

export interface CampShiftOutcomeContext {
  // Band-known wear (use pressure) at the residence BEFORE the decision.
  readonly priorCampUsePressure: number;
  // Band-known wear at the tile the residence ends the season on.
  readonly newCampUsePressure: number;
  // Grid distance of the realized residential move (0 = held).
  readonly moveDistance: number;
  // A seasonal travel plan (staged migration walk) drove this move.
  readonly travelEngaged: boolean;
}

export interface EfficacyEvaluation {
  readonly family:
    | "route_crossing"
    | "camp_care"
    | "carrying_load"
    | "dry_route_water"
    | "engineering_structure"
    // INVENTION-3 families:
    | "water_storage"
    | "temporary_shelter"
    | "hunting_distance"
    | "care_treatment"
    | "groundwater_seek"
    | "proto_measure";
  readonly classification: AdaptiveEfficacyClassification;
  readonly outcome: AdaptiveFeedbackType;
  readonly responseActive: boolean;
  readonly contextKey?: string;
  // INVENTION-1: the practical response that was exercised (practical
  // families only; crossing/camp practices are memory-derived, not id-bound).
  readonly responseId?: string;
  readonly coefficient: string;
  readonly preEffectValue: number;
  readonly effectAmount: number;
  readonly effectCap: number;
  readonly dangerDelta: number;
  readonly practiceDelta: number;
  readonly localityNote: string;
  readonly reason: string;
}

export interface CrossingEfficacyInput {
  readonly context: CrossingOutcomeContext | undefined;
  readonly moved: boolean;
  readonly priorCrossingMemories: Readonly<Record<string, KnownCrossingMemory>>;
  readonly updatedCrossingMemories: Readonly<Record<string, KnownCrossingMemory>>;
  readonly currentTick: number;
  // Realized limits that keep a helped crossing PARTIAL, not a clear success.
  readonly vulnerableShare: number;
  readonly carryConstraint: number;
  readonly waterStress: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Strongest practiced crossing OTHER than the given key — evidence that the
// band's remembered practice belongs to a different ford/context. Deterministic:
// keys are visited in sorted order; ties keep the first.
function bestOtherPracticedKey(
  memories: Readonly<Record<string, KnownCrossingMemory>>,
  excludeKey: string | undefined,
  currentTick: number,
): { readonly key: string; readonly relief: number } | undefined {
  let best: { key: string; relief: number } | undefined;
  for (const key of Object.keys(memories).sort()) {
    if (key === excludeKey) {
      continue;
    }
    const relief = deriveCrossingPracticeRelief(memories[key], currentTick).relief;
    if (relief >= ACTIVE_RELIEF_FLOOR && (best === undefined || relief > best.relief)) {
      best = { key, relief };
    }
  }
  return best;
}

const CROSSING_LOCALITY_NOTE =
  "practice is per-ford: relief exists only at this crossing key, capped, danger-discounted, and perishes without use";

export function evaluateCrossingEfficacy(input: CrossingEfficacyInput): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined) {
    return undefined; // no decision-time crossing context — generic fallback
  }

  const base = {
    family: "route_crossing" as const,
    coefficient: "riverCrossingRisk",
    effectCap: CROSSING_PRACTICE_RELIEF_CAP,
    localityNote: CROSSING_LOCALITY_NOTE,
  };

  // (1) Specific failure: the scored move needed this crossing and it stayed
  // blocked. If practice was active, the practice failed to make it feasible.
  if (context.crossingBlocked && context.attemptedCrossingKey !== undefined) {
    const active = context.practiceRelief >= ACTIVE_RELIEF_FLOOR;
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "blocked_before_attempt",
      responseActive: active,
      contextKey: context.attemptedCrossingKey,
      preEffectValue: round2(context.rawCrossingRisk),
      effectAmount: round2(context.practiceRelief),
      dangerDelta: 0,
      practiceDelta: 0,
      reason: active
        ? "practice was active but the crossing stayed blocked — no feasibility gained"
        : "crossing blocked before attempt; no practice was active to credit or blame",
    };
  }

  // (2) A residential move actually used a crossing (the memory system recorded it).
  if (input.moved && context.usedCrossingKey !== undefined) {
    const usedKey = context.usedCrossingKey;
    const prior = input.priorCrossingMemories[usedKey];
    const updated = input.updatedCrossingMemories[usedKey];
    const matching = context.attemptedCrossingKey === usedKey;
    const reliefAtUsed = matching
      ? context.practiceRelief
      : deriveCrossingPracticeRelief(prior, input.currentTick).relief;
    // Practice counts as the ACTIVE response only when the decision actually
    // paid its relief at the crossing that was used.
    const active = matching && reliefAtUsed >= ACTIVE_RELIEF_FLOOR;
    const dangerDelta = round2(
      (updated?.riskMemory ?? 0) - (prior?.riskMemory ?? updated?.riskMemory ?? 0),
    );
    const practiceDelta = round2(
      (updated?.successConfidence ?? 0) - (prior?.successConfidence ?? 0),
    );
    // Risk the decision would have paid WITHOUT the relief (relief < 1 always).
    const riskWithoutRelief = context.effectiveCrossingRisk / Math.max(0.0001, 1 - context.practiceRelief);
    const realizedRiskReduction = round2(riskWithoutRelief - context.effectiveCrossingRisk);
    const common = {
      ...base,
      responseActive: active,
      contextKey: usedKey,
      preEffectValue: round2(context.rawCrossingRisk),
      effectAmount: round2(reliefAtUsed),
      dangerDelta,
      practiceDelta,
    };

    // (2a) FIRST priority: danger. A completed crossing that raised remembered
    // danger, or paid serious matching risk, must not become success.
    if (dangerDelta >= DANGER_DELTA_FLOOR || context.effectiveCrossingRisk >= SERIOUS_RISK_FLOOR) {
      return {
        ...common,
        classification: "failure_or_danger_specific",
        outcome: "dangerous_feedback",
        reason: dangerDelta >= DANGER_DELTA_FLOOR
          ? `crossing completed but remembered danger rose (+${dangerDelta.toFixed(2)}) at this ford`
          : `crossing completed but serious matching risk (${round2(context.effectiveCrossingRisk).toFixed(2)}) was paid`,
      };
    }

    // (2b) Practice active and it measurably reduced the risk actually paid.
    if (active && realizedRiskReduction >= MEASURABLE_RELIEF_FLOOR) {
      const limiters = [
        input.vulnerableShare > 0.44 ? "many dependents/elders" : undefined,
        input.carryConstraint > 0.28 ? "carrying burden" : undefined,
        input.waterStress > 0.5 ? "water uncertainty" : undefined,
        context.stagedLegIncomplete ? "the larger staged journey remains incomplete" : undefined,
      ].filter((entry): entry is string => entry !== undefined);
      if (limiters.length > 0) {
        return {
          ...common,
          classification: "partial_success_specific",
          outcome: "partial_success",
          reason: `practiced relief helped (risk −${realizedRiskReduction.toFixed(2)}) but limits remained: ${limiters.join(", ")}`,
        };
      }
      return {
        ...common,
        classification: "clear_success_specific",
        outcome: "clear_success",
        reason: `practiced relief at this ford measurably cut the crossing risk paid (−${realizedRiskReduction.toFixed(2)} of ${round2(riskWithoutRelief).toFixed(2)}) and the crossing completed`,
      };
    }

    // (2c) A real crossing completed WITHOUT active practice. This is genuine
    // local crossing experience (it is what builds practice), but it is not
    // practice-specific success. If remembered practice exists at ANOTHER
    // ford, expose the mismatch and weaken the feedback.
    const other = bestOtherPracticedKey(input.priorCrossingMemories, usedKey, input.currentTick);
    if (other !== undefined) {
      return {
        ...common,
        classification: "context_mismatch",
        outcome: "mixed_feedback",
        reason: `remembered practice belongs to ${other.key} (relief ${other.relief.toFixed(2)}), not this crossing — locally untested here, no confident gain`,
      };
    }
    return {
      ...common,
      classification: "matching_use_without_practice",
      outcome: "local_only_success",
      reason: active
        ? "practice active but relief too small to measurably help — local crossing experience only"
        : "crossing completed without practiced relief — real local experience, no practice credit",
    };
  }

  // (3) Irrelevant movement: the band relocated WITHOUT using a crossing.
  // General pressure relief from that move must not credit the crossing response.
  if (input.moved) {
    const other = bestOtherPracticedKey(input.priorCrossingMemories, undefined, input.currentTick);
    return {
      ...base,
      classification: "irrelevant_movement",
      outcome: "low_feedback",
      responseActive: false,
      contextKey: undefined,
      preEffectValue: round2(context.rawCrossingRisk),
      effectAmount: 0,
      dangerDelta: 0,
      practiceDelta: 0,
      reason: other === undefined
        ? "band relocated without using a crossing — movement success is not crossing evidence"
        : `band relocated without using a crossing — practice at ${other.key} stayed unused (dormant)`,
    };
  }

  // No matching crossing evidence this season — generic rules classify.
  return undefined;
}

export interface CampCareEfficacyInput {
  readonly context: CampShiftOutcomeContext | undefined;
  readonly moved: boolean;
}

const CAMP_LOCALITY_NOTE =
  "camp-care credit is per-shift and local: it exists only when the residence wear signal it addressed actually fell";

export function evaluateCampCareEfficacy(input: CampCareEfficacyInput): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined) {
    return undefined;
  }

  const conditionExisted = context.priorCampUsePressure >= CAMP_WEAR_CONDITION_FLOOR;
  if (!conditionExisted) {
    return undefined; // no matching camp-pressure condition — generic fallback
  }

  const base = {
    family: "camp_care" as const,
    coefficient: "localUsePressure",
    effectCap: 1,
    localityNote: CAMP_LOCALITY_NOTE,
    dangerDelta: 0,
    practiceDelta: 0,
    preEffectValue: round2(context.priorCampUsePressure),
  };

  // The matching response is a LOCAL one-tile residential shift made without a
  // seasonal travel motive. Longer or travel-motivated moves address other
  // pressures; crediting camp care for them would repeat the movement bug.
  const localShift = input.moved && context.moveDistance === 1 && !context.travelEngaged;

  if (localShift) {
    const wearDrop = round2(context.priorCampUsePressure - context.newCampUsePressure);
    if (wearDrop >= CAMP_WEAR_CLEAR_DROP) {
      return {
        ...base,
        classification: "clear_success_specific",
        outcome: "clear_success",
        responseActive: true,
        contextKey: undefined,
        effectAmount: wearDrop,
        reason: `local camp shift dropped the residence wear signal by ${wearDrop.toFixed(2)}`,
      };
    }
    if (wearDrop >= CAMP_WEAR_PARTIAL_DROP) {
      return {
        ...base,
        classification: "partial_success_specific",
        outcome: "partial_success",
        responseActive: true,
        contextKey: undefined,
        effectAmount: wearDrop,
        reason: `local camp shift eased the wear signal (−${wearDrop.toFixed(2)}) but wear pressure remains`,
      };
    }
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      responseActive: true,
      contextKey: undefined,
      effectAmount: Math.max(0, wearDrop),
      reason: "camp shifted but the wear signal did not measurably fall — no camp-care credit",
    };
  }

  if (input.moved) {
    return {
      ...base,
      classification: "irrelevant_movement",
      outcome: "low_feedback",
      responseActive: false,
      contextKey: undefined,
      effectAmount: 0,
      reason: context.travelEngaged
        ? "the band travelled for a seasonal motive — not a camp-care shift; no credit"
        : "the residence moved farther than a local shift — other pressures drove it; no camp-care credit",
    };
  }

  // Stayed through a worn camp: resting does not address wear. Honest low
  // feedback (the old rule granted local_only_success for merely staying).
  return {
    ...base,
    classification: "low_or_no_feedback_specific",
    outcome: "low_feedback",
    responseActive: false,
    contextKey: undefined,
    effectAmount: 0,
    reason: "band stayed through camp wear — rest does not reduce the wear signal; no camp-care credit",
  };
}

// ---------------------------------------------------------------------------
// INVENTION-1 — LOOP 3: carrying/load response (carrying_load family).
//
// Real coefficient: the seasonal travel plan's carry-constraint and
// vulnerable-share limiters (budget steps) plus the residential move's
// dependent/elder hardship terms. The response is exercised only on a
// burdened RESIDENTIAL move where the relief was actually consumed; efficacy
// reads whether the relief measurably changed the plan (a budget step
// restored) or the realized hardship, and whether the move ended in hardship
// anyway. Unburdened movement earns the carrying response nothing.
// ---------------------------------------------------------------------------

export interface CarryingOutcomeContext {
  readonly reliefApplied: number;
  readonly responseId?: string;
  readonly variantKey?: string;
  // Burdened context at decision time (carry constraint / vulnerable share).
  readonly conditionPresent: boolean;
  readonly budgetWithRelief: number;
  readonly budgetWithoutRelief: number;
  readonly moveDistance: number;
  readonly stagedLegIncomplete: boolean;
  // Realized hardship of the residential move event (record built this tick).
  readonly hardshipLevel?: "low" | "moderate" | "high" | "severe";
  // Estimated hardship-risk reduction the carrying relief provided (same
  // formula the hardship derivation applies to the dependent/elder terms).
  readonly hardshipReliefApplied: number;
}

const CARRYING_LOCALITY_NOTE =
  "carrying practice applies only to burdened residential travel and fades with its material basis; it is not a universal load multiplier";

export function evaluateCarryingEfficacy(input: {
  readonly context: CarryingOutcomeContext | undefined;
  readonly moved: boolean;
}): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined || context.reliefApplied < ACTIVE_RELIEF_FLOOR) {
    return undefined; // response not exercised — nothing to judge
  }
  if (!context.conditionPresent || !input.moved) {
    // Relief floors at 0 without the burdened condition (matching is applied
    // at derivation), so this is a guard: no matching condition ⇒ no record.
    return undefined;
  }

  const base = {
    family: "carrying_load" as const,
    responseId: context.responseId,
    contextKey: "burdened_residential_travel",
    coefficient: "seasonalTravelBudget.carry+vulnerable limiters / moveHardship dependent terms",
    preEffectValue: round2(context.budgetWithoutRelief),
    effectCap: 0.4,
    dangerDelta: 0,
    practiceDelta: 0,
    localityNote: CARRYING_LOCALITY_NOTE,
    responseActive: true,
  };
  const budgetGain = context.budgetWithRelief - context.budgetWithoutRelief;
  // Measurable help: a travel-budget step restored, or a realized hardship
  // reduction ≥0.01 (≈ a double-digit share of the dependent-burden term —
  // hardship risk feeds inner-fission stress and body/camp logistics, so this
  // is a real outcome, not a cosmetic delta).
  const measurable = budgetGain >= 1 || context.hardshipReliefApplied >= 0.01;

  // FIRST priority: the burdened move still ended in SEVERE realized hardship
  // — the carrying response failed the condition it addresses. NOTE: this
  // reads hardshipLevel (derived from real band state), NOT hardshipOutcome —
  // the outcome field is currently stamped "rejected" on virtually every
  // completed move by a pre-existing residentialMoveEvent annotation bug
  // (incidental watercraft assessments preempt the outcome ladder), so it is
  // not usable as failure evidence (documented in the handoff).
  if (context.hardshipLevel === "severe") {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      effectAmount: round2(context.reliefApplied),
      reason: "burdened move ended in severe hardship despite the carrying response",
    };
  }

  if (!measurable) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      effectAmount: round2(context.reliefApplied),
      reason: "carrying relief was active but changed neither the travel budget nor the realized hardship — no credit",
    };
  }

  if (context.stagedLegIncomplete || context.hardshipLevel === "high") {
    return {
      ...base,
      classification: "partial_success_specific",
      outcome: "partial_success",
      effectAmount: round2(context.reliefApplied),
      reason: budgetGain >= 1
        ? `carrying response restored ${budgetGain} travel step(s) but the burdened journey stayed hard`
        : "carrying response eased the move's hardship but the burden still limited it",
    };
  }

  return {
    ...base,
    classification: "clear_success_specific",
    outcome: "clear_success",
    effectAmount: round2(context.reliefApplied),
    reason: budgetGain >= 1
      ? `carrying response restored ${budgetGain} travel step(s) on a burdened residential move that completed`
      : `carrying response cut the move's dependent/elder hardship by ~${context.hardshipReliefApplied.toFixed(2)} and the move completed`,
  };
}

// ---------------------------------------------------------------------------
// INVENTION-1 — LOOP 4: dry-route water response (dry_route_water family).
//
// Real coefficient: the seasonal travel plan's water-stress limiter, applied
// ONLY when the journey's scored destination is one of the band's own
// remembered watered places. Efficacy reads the band's own realized water
// stress after the move: staging toward known water must not leave the band
// drier than before. Movement without the matching watered-destination
// context earns the response nothing.
// ---------------------------------------------------------------------------

export interface WaterRouteOutcomeContext {
  readonly reliefApplied: number;
  readonly responseId?: string;
  readonly conditionPresent: boolean; // waterStress ≥ 0.5 with move pressure
  readonly destinationKnownWatered: boolean;
  readonly budgetWithRelief: number;
  readonly budgetWithoutRelief: number;
  readonly waterStressBefore: number;
  readonly waterStressAfter: number;
}

const WATER_ROUTE_LOCALITY_NOTE =
  "water-route practice applies only to journeys toward the band's own remembered watered places; it discovers no water and fades if those memories go stale";

export function evaluateWaterRouteEfficacy(input: {
  readonly context: WaterRouteOutcomeContext | undefined;
  readonly moved: boolean;
}): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined || context.responseId === undefined) {
    return undefined;
  }
  if (!context.conditionPresent || !input.moved) {
    return undefined;
  }

  const base = {
    family: "dry_route_water" as const,
    responseId: context.responseId,
    contextKey: "known_watered_destination",
    coefficient: "seasonalTravelBudget.water limiter",
    preEffectValue: round2(context.waterStressBefore),
    effectCap: 0.3,
    dangerDelta: round2(context.waterStressAfter - context.waterStressBefore),
    practiceDelta: 0,
    localityNote: WATER_ROUTE_LOCALITY_NOTE,
    responseActive: true,
  };

  // Guard: the relief is derivation-gated on a known watered destination; a
  // consumed relief without that context is a mismatch, never a success.
  if (!context.destinationKnownWatered) {
    return {
      ...base,
      classification: "context_mismatch",
      outcome: "mixed_feedback",
      effectAmount: 0,
      reason: "water-route relief consumed without a remembered watered destination — context mismatch, no credit",
    };
  }

  // FIRST priority: the journey left the band measurably drier — staging
  // toward remembered water failed its own purpose.
  if (context.waterStressAfter > context.waterStressBefore + 0.06) {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      effectAmount: round2(context.reliefApplied),
      reason: `the staged journey left the band drier (water stress ${round2(context.waterStressBefore)} → ${round2(context.waterStressAfter)}) — the remembered water did not hold`,
    };
  }

  const budgetGain = context.budgetWithRelief - context.budgetWithoutRelief;
  if (budgetGain < 1) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      effectAmount: round2(context.reliefApplied),
      reason: "water-route relief was active but did not change the journey's budget — no credit",
    };
  }

  if (context.waterStressAfter > 0.5) {
    return {
      ...base,
      classification: "partial_success_specific",
      outcome: "partial_success",
      effectAmount: round2(context.reliefApplied),
      reason: `staging toward remembered water restored ${budgetGain} travel step(s), but the band is still water-stressed`,
    };
  }

  return {
    ...base,
    classification: "clear_success_specific",
    outcome: "clear_success",
    effectAmount: round2(context.reliefApplied),
    reason: `staging toward remembered water restored ${budgetGain} travel step(s) and the band arrived no drier`,
  };
}

// ROUTINES-2 — multi-fragment temporary-watercraft response. The measured
// coefficient is expectedCrossingSafety; categorical residential hardship is
// deliberately ignored because of the documented hardshipOutcome bug.
export function evaluateEngineeringEfficacy(input: {
  readonly responseId?: string;
  readonly responseActive: boolean;
  readonly contextKey?: string;
  readonly safetyBefore: number;
  readonly safetyAfter: number;
  readonly safetyRelief: number;
  readonly result?: "not_considered" | "materials_missing" | "crossing_delayed_materials" |
    "crossing_abandoned_risk" | "crossing_success" | "crossing_partial_success";
  readonly hardshipLevel?: "low" | "moderate" | "high" | "severe";
}): EfficacyEvaluation | undefined {
  if (!input.responseActive || input.safetyRelief < ACTIVE_RELIEF_FLOOR || input.result === undefined) return undefined;
  const base = {
    family: "engineering_structure" as const,
    responseId: input.responseId,
    responseActive: true,
    contextKey: input.contextKey,
    coefficient: "temporaryWatercraft.expectedCrossingSafety",
    preEffectValue: round2(input.safetyBefore),
    effectAmount: round2(input.safetyRelief),
    effectCap: 0.22,
    dangerDelta: round2(input.safetyBefore - input.safetyAfter),
    practiceDelta: round2(input.safetyAfter - input.safetyBefore),
    localityNote: "crossing engineering is bound to tested water/material/load context and can fail under another flow, season, or burden",
  };
  if (input.result === "crossing_abandoned_risk" || input.result === "materials_missing" || input.hardshipLevel === "severe") {
    return { ...base, classification: "failure_or_danger_specific", outcome: "dangerous_feedback", reason: `learned components were active but the crossing ended ${input.result}` };
  }
  if (input.result === "crossing_partial_success" || input.result === "crossing_delayed_materials" || input.hardshipLevel === "high") {
    return { ...base, classification: "partial_success_specific", outcome: "partial_success", reason: "the composed response improved crossing safety, but load/labor/flow still limited the attempt" };
  }
  if (input.result === "crossing_success" && input.safetyAfter > input.safetyBefore + 0.03) {
    return { ...base, classification: "clear_success_specific", outcome: "clear_success", reason: "the learned buoyancy/binding/load/sequence composition measurably improved crossing safety and arrived" };
  }
  return { ...base, classification: "low_or_no_feedback_specific", outcome: "low_feedback", reason: "the response was present but produced no measurable crossing change" };
}

// ---------------------------------------------------------------------------
// INVENTION-3 evaluators. Same discipline as the loops above: each response
// earns confidence ONLY from its own measured effect in matching context.
// ---------------------------------------------------------------------------

// Carried water (water_storage): judged on a moved journey where the relief
// was consumed — budget restored or arrival no drier; a heat-cracked seal is
// specific failure that also contradicts the seal fragment.
export function evaluateWaterStorageEfficacy(input: {
  readonly moved: boolean;
  readonly context: {
    readonly reliefApplied: number;
    readonly responseId?: string;
    readonly conditionPresent: boolean;
    readonly budgetWithRelief: number;
    readonly budgetWithoutRelief: number;
    readonly waterStressBefore: number;
    readonly waterStressAfter: number;
    readonly sealCracked: boolean;
    readonly creditedLimiter?: boolean;
  } | undefined;
}): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined || context.reliefApplied < ACTIVE_RELIEF_FLOOR) {
    return undefined;
  }
  if (!context.conditionPresent || !input.moved) {
    return undefined;
  }
  const base = {
    family: "water_storage" as const,
    responseId: context.responseId,
    contextKey: "carried_water_journey",
    coefficient: "seasonalTravelBudget.water limiter / moveHardship water term",
    preEffectValue: round2(context.waterStressBefore),
    effectAmount: round2(context.reliefApplied),
    effectCap: 0.28,
    dangerDelta: round2(context.waterStressAfter - context.waterStressBefore),
    practiceDelta: 0,
    localityNote: "carried water covers only what the vessels hold; leakage, heat and misreckoning always eat part of it",
    responseActive: context.creditedLimiter !== false || context.sealCracked,
  };
  if (context.creditedLimiter === false && !context.sealCracked) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      reason: "water staging addressed the same limiter more strongly, so the carrier was not credited for this journey",
    };
  }
  if (context.sealCracked) {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      reason: "the vessel seal cracked in the heat and the carried water was lost on the way",
    };
  }
  if (context.waterStressAfter > context.waterStressBefore + 0.06) {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      reason: `the journey still left the band drier (water stress ${round2(context.waterStressBefore)} → ${round2(context.waterStressAfter)}) — what was carried was not enough`,
    };
  }
  const budgetGain = context.budgetWithRelief - context.budgetWithoutRelief;
  if (budgetGain < 1 && context.waterStressAfter >= context.waterStressBefore) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      reason: "the carried water changed neither the journey's budget nor the arrival — no credit",
    };
  }
  if (context.waterStressAfter > 0.5) {
    return {
      ...base,
      classification: "partial_success_specific",
      outcome: "partial_success",
      reason: `carried water ${budgetGain >= 1 ? `restored ${budgetGain} travel step(s)` : "eased the crossing"}, but the band is still water-stressed`,
    };
  }
  return {
    ...base,
    classification: "clear_success_specific",
    outcome: "clear_success",
    reason: budgetGain >= 1
      ? `carried water restored ${budgetGain} travel step(s) across dry stages and the band arrived no drier`
      : "carried water covered the dry stages and the band arrived no drier",
  };
}

// Shelter (temporary_shelter): judged at a camp season with a real exposure
// condition — did the effective exposure the band lived under fall by the
// relief, in a matching weather?
export function evaluateShelterEfficacy(input: {
  readonly context: {
    readonly responseId?: string;
    readonly rawExposure: number;
    readonly effectiveExposure: number;
    readonly reliefApplied: number;
    readonly contextMatched: boolean;
    readonly dominantKind: string;
    readonly sicknessSeverity: number;
    readonly priorSicknessSeverity: number;
  } | undefined;
}): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined || context.rawExposure < 0.3) {
    return undefined; // no real exposure condition — nothing to judge
  }
  if (context.responseId === undefined) {
    return undefined; // no shelter response exercised
  }
  const base = {
    family: "temporary_shelter" as const,
    responseId: context.responseId,
    contextKey: `exposure:${context.dominantKind}`,
    coefficient: "campExposure.effectiveExposure → sickness severity / child-elder weather risk",
    preEffectValue: round2(context.rawExposure),
    effectAmount: round2(context.reliefApplied),
    effectCap: 0.35,
    dangerDelta: round2(context.sicknessSeverity - context.priorSicknessSeverity),
    practiceDelta: 0,
    localityNote: "a shelter answers only the weather it was built against, and its parts burden every residential move",
    responseActive: true,
  };
  if (!context.contextMatched) {
    return {
      ...base,
      classification: "context_mismatch",
      outcome: "mixed_feedback",
      reason: `the shelter does not answer this season's ${context.dominantKind} — dead weight against the wrong weather`,
    };
  }
  if (context.reliefApplied < ACTIVE_RELIEF_FLOOR) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      reason: "the shelter stood but measurably changed nothing this season",
    };
  }
  if (context.sicknessSeverity > context.priorSicknessSeverity + 0.08) {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      reason: "sickness at the sheltered camp still worsened through the exposed season",
    };
  }
  if (context.effectiveExposure > 0.42) {
    return {
      ...base,
      classification: "partial_success_specific",
      outcome: "partial_success",
      reason: `the shelter cut the ${context.dominantKind} exposure by ${round2(context.reliefApplied)}, but the camp still lies hard against the weather`,
    };
  }
  return {
    ...base,
    classification: "clear_success_specific",
    outcome: "clear_success",
    reason: `the shelter cut the lived ${context.dominantKind} exposure by ${round2(context.reliefApplied)} through a season that needed it`,
  };
}

// Hunting (hunting_distance): judged on this season's hunting-trip traces
// where the relief was actually paid — danger down without new injuries is
// the practice's own effect; wariness rising is honest diminishing return.
export function evaluateHuntingEfficacy(input: {
  readonly traces: readonly {
    readonly huntingReliefApplied?: number;
    readonly huntingResponseId?: string;
    readonly dangerRisk: number;
    readonly dangerRiskBeforeLearning?: number;
    readonly dangerClass: "low" | "moderate" | "high";
    readonly outcomeClass: "success" | "partial" | "failure" | "information";
    readonly warinessChange: number;
    readonly huntingContextMatched?: boolean;
    readonly huntingPreparationLabor?: number;
    readonly huntingReturnShiftApplied?: number;
  }[];
  readonly animalInjuryThisSeason: boolean;
}): EfficacyEvaluation | undefined {
  const exercised = input.traces.filter((trace) => trace.huntingResponseId !== undefined);
  if (exercised.length === 0) {
    return undefined;
  }
  const first = exercised[0];
  const totalReliefPaid = exercised.reduce((sum, trace) =>
    sum + ((trace.dangerRiskBeforeLearning ?? trace.dangerRisk) - trace.dangerRisk), 0);
  const successes = exercised.filter((trace) => trace.outcomeClass === "success" || trace.outcomeClass === "partial").length;
  const mismatchCount = exercised.filter((trace) => trace.huntingContextMatched === false).length;
  const laborPaid = exercised.reduce((sum, trace) => sum + (trace.huntingPreparationLabor ?? 0), 0);
  const returnShift = exercised.reduce((sum, trace) => sum + (trace.huntingReturnShiftApplied ?? 0), 0);
  const base = {
    family: "hunting_distance" as const,
    responseId: first.huntingResponseId,
    contextKey: "hunting_trips",
    coefficient: "AnimalActivityTrace.dangerRisk",
    preEffectValue: round2(first.dangerRiskBeforeLearning ?? first.dangerRisk),
    effectAmount: round2(totalReliefPaid),
    effectCap: 0.3,
    dangerDelta: round2(exercised.reduce((max, trace) => Math.max(max, trace.warinessChange), 0)),
    practiceDelta: round2(returnShift - laborPaid),
    localityNote: "reach helps only the hunts it was used on; pressed game grows warier and defended game still turns hunts back",
    responseActive: true,
  };
  if (mismatchCount === exercised.length) {
    return {
      ...base,
      classification: "context_mismatch",
      outcome: "mixed_feedback",
      reason: `the method was prepared and paid ${round2(laborPaid)} labor, but it did not fit this prey or cover`,
    };
  }
  if (input.animalInjuryThisSeason || exercised.some((trace) => trace.dangerClass === "high")) {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      reason: input.animalInjuryThisSeason
        ? "hunters were still hurt at close quarters despite the practiced reach"
        : "a practiced hunt still ran into high danger",
    };
  }
  if (totalReliefPaid < 0.02) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      reason: "the practiced method changed the danger paid too little to read",
    };
  }
  if (successes === 0) {
    return {
      ...base,
      classification: "partial_success_specific",
      outcome: "partial_success",
      reason: `striking from reach cut the danger paid (−${round2(totalReliefPaid)}) but the hunts still came back empty`,
    };
  }
  return {
    ...base,
    classification: "clear_success_specific",
    outcome: "clear_success",
    reason: `striking from reach cut the danger paid (−${round2(totalReliefPaid)}) across ${exercised.length} hunt(s) that returned`,
  };
}

// Care (care_treatment): judged on episodes the treatment actually touched —
// recovery running ahead of the untreated expectation is the treatment's own
// effect; a mismatched treatment (wrong cause) earns a mismatch.
export function evaluateCareEfficacy(input: {
  readonly context: {
    readonly responseId?: string;
    readonly reliefApplied: number;
    readonly treatedEpisodes: number;
    readonly mismatchedEpisodes: number;
    readonly recoverySeasonsSaved: number;
    readonly worsenedEpisodes: number;
  } | undefined;
}): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined || context.responseId === undefined ||
    (context.treatedEpisodes === 0 && context.mismatchedEpisodes === 0 && context.worsenedEpisodes === 0)) {
    return undefined;
  }
  const base = {
    family: "care_treatment" as const,
    responseId: context.responseId,
    contextKey: "acute_episodes",
    coefficient: "AcuteRiskEpisode.recoverySeasons / mortalityRiskBump",
    preEffectValue: 0,
    effectAmount: round2(context.reliefApplied),
    effectCap: 0.35,
    dangerDelta: context.worsenedEpisodes,
    practiceDelta: 0,
    localityNote: "care helps only the hurts and sickness it actually answers; the wrong treatment tends the wrong cause",
    responseActive: true,
  };
  if (context.worsenedEpisodes > 0) {
    return {
      ...base,
      classification: "failure_or_danger_specific",
      outcome: "dangerous_feedback",
      reason: "tended people still worsened — the treatment did not hold against this",
    };
  }
  if (context.treatedEpisodes === 0 && context.mismatchedEpisodes > 0) {
    return {
      ...base,
      classification: "context_mismatch",
      outcome: "mixed_feedback",
      reason: "the practiced treatment did not answer the kind of trouble the camp actually had",
    };
  }
  if (context.recoverySeasonsSaved <= 0) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      reason: "care was given but recovery ran no faster than untended hurts usually do",
    };
  }
  return {
    ...base,
    classification: context.mismatchedEpisodes > 0 ? "partial_success_specific" : "clear_success_specific",
    outcome: context.mismatchedEpisodes > 0 ? "partial_success" : "clear_success",
    reason: `tended people mended sooner (${context.recoverySeasonsSaved} season(s) saved across ${context.treatedEpisodes} episode(s))${context.mismatchedEpisodes > 0 ? ", though some trouble was beyond this treatment" : ""}`,
  };
}

// Groundwater (groundwater_seek): judged on the dig's physical outcome.
export function evaluateGroundwaterEfficacy(input: {
  readonly responseId?: string;
  readonly attempted: boolean;
  readonly outcome?: "dry_hole" | "damp_seep" | "contaminated_seep" | "seasonal_seep" | "shallow_well" | "collapsed";
  readonly yieldLevel: number;
  readonly laborPaid?: number;
  readonly laterWaterStressRelief?: number;
}): EfficacyEvaluation | undefined {
  if (!input.attempted || input.responseId === undefined || input.outcome === undefined) {
    return undefined;
  }
  const base = {
    family: "groundwater_seek" as const,
    responseId: input.responseId,
    contextKey: "camp_waterworks",
    coefficient: "pressureState.waterStress (waterworks yield at the built tile)",
    preEffectValue: 0,
    effectAmount: round2(input.yieldLevel),
    effectCap: 0.15,
    dangerDelta: input.outcome === "collapsed" ? 1 : 0,
    practiceDelta: round2((input.laterWaterStressRelief ?? 0) - (input.laborPaid ?? 0)),
    localityNote: "a dug seep belongs to the ground it was dug in; the reading of damp ground can simply be wrong",
    responseActive: true,
  };
  switch (input.outcome) {
    case "collapsed":
      return { ...base, classification: "failure_or_danger_specific", outcome: "dangerous_feedback", reason: "the pit walls slumped in and the digging labor was lost" };
    case "dry_hole":
      return { ...base, classification: "failure_or_danger_specific", outcome: "clear_failure", reason: "seasons of digging found only dry ground — the reading was wrong here" };
    case "contaminated_seep":
      return { ...base, classification: "failure_or_danger_specific", outcome: "dangerous_feedback", reason: "the seep filled, but foul water worsened sickness; water found was not water made safe" };
    case "damp_seep":
      return { ...base, classification: "partial_success_specific", outcome: "partial_success", reason: "the scrape holds damp water by morning — little, but real" };
    case "seasonal_seep":
      return { ...base, classification: "partial_success_specific", outcome: "partial_success", reason: "the deepened seep refills except in the dry heat" };
    case "shallow_well":
      return { ...base, classification: "clear_success_specific", outcome: "clear_success", reason: "the lined well holds water through the seasons at this camp" };
  }
}

// Proto-measure (proto_measure): judged on provisioned journeys — the tally
// either closed the reckoning gap on a carried-water journey or it did not.
export function evaluateMeasureEfficacy(input: {
  readonly context: {
    readonly responseId?: string;
    readonly provisioningAccuracy: number;
    readonly carriedWaterUsed: boolean;
    readonly arrivedNoDrier: boolean;
  } | undefined;
}): EfficacyEvaluation | undefined {
  const context = input.context;
  if (context === undefined || context.responseId === undefined || !context.carriedWaterUsed) {
    return undefined; // the tally is judged only where it was actually used
  }
  const base = {
    family: "proto_measure" as const,
    responseId: context.responseId,
    contextKey: "provisioned_journey",
    coefficient: "provisioningAccuracy (carried-water coverage)",
    preEffectValue: 0.75,
    effectAmount: round2(context.provisioningAccuracy - 0.75),
    effectCap: 0.25,
    dangerDelta: 0,
    practiceDelta: 0,
    localityNote: "the tally is task-bound: it counts vessels and day-stages, and is poor outside the range it was practiced in",
    responseActive: context.provisioningAccuracy > 0.75,
  };
  if (context.provisioningAccuracy <= 0.75) {
    return {
      ...base,
      classification: "low_or_no_feedback_specific",
      outcome: "low_feedback",
      reason: "no working tally was applied to the provisioning — nothing to credit",
    };
  }
  if (!context.arrivedNoDrier) {
    return {
      ...base,
      classification: "partial_success_specific",
      outcome: "partial_success",
      reason: "the reckoning improved the fill, but the journey still ran the water out",
    };
  }
  return {
    ...base,
    classification: "clear_success_specific",
    outcome: "clear_success",
    reason: "the tallied provisioning matched the journey and the water lasted its days",
  };
}
