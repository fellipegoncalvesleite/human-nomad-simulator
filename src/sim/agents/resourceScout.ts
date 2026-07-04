import type { NormalizedIntensity } from "../rules/types";
import type { ResourceScoutKind } from "../rules/types";
import type { ResourceClassId } from "./resourceClasses";
import type { PlantObservationMemory, ResourceConfidenceProfile, ResourcePatchContradictionKind, ResourcePatchLearningMemory, ResourcePatchLearningOutcome, ResourceKnowledgeSource, ResourceKnowledgeState, ResourcePatchMemory } from "./resourceKnowledge";
import type { PlantScoutObservationHint } from "./plantPatches";
import type { PlantUseEligibility } from "./plantUseEligibility";
import type { PlantUseTestEvent, PlantUseTestRingEntry } from "./plantUseTesting";
import type { CauseSpecificEvent, CauseSpecificEventRingEntry } from "./causeSpecificEvent";
import type { BandId, ReasonId, Season, TickNumber, TileId } from "../core/types";
import {
  effectiveResourceConfidence,
  enforceResourceKnowledgeCap,
} from "./resourceKnowledge";
// 2K.5 — THE explicit runtime behaviour hook for patch-return knowledge. This is the
// ONLY `src/sim` import of the (otherwise report/UI-only) 2K.4 derived view, and it is
// read EXCLUSIVELY inside scout-target selection below: it may reorder which already-
// valid patch the band observes/tests next — never yield, support, stress, movement,
// relocation, or fission (the static guard now asserts exactly this import set).
import type {
  ObservedPatchReturnConfidence,
  ObservedPatchRiskState,
  PatchExploitationReadiness,
  PatchReturnSkillReason,
} from "./patchExploitationKnowledge";
import { deriveObservedPatchReturn } from "./patchExploitationKnowledge";
// 2K.12: selection-only seasonal-memory reader (band-learned only; no hidden truth).
import { domainForResourceClass, readSeasonalEcologyHint } from "./seasonalEcologyReader";
import type { SeasonalEcologyHint } from "./seasonalEcologyReader";
import type { SeasonalEcologyObservation } from "./types";
// 2K.7 — type-only: the band's learned exploitation skill is passed through the scout context
// as DATA (no runtime coupling), so a band scout-selects using competence it ALREADY holds.
import type { ExploitationSkillState } from "./exploitationSkill";

// General resource_scout v0 (checkpoint 2K.1H).
//
// A resource scout is an INFORMATION action, not a production or migration action.
// It selects a target from the band's OWN bounded resource beliefs (direct / inferred
// / inherited patch memories — never a map scan or hidden truth) and scores the
// VALUE OF INFORMATION of going to look: how much uncertainty a closer look could
// resolve, weighted by the band's own need and season, minus distance / route / repeat
// costs. A high score means "worth scouting", NOT "worth moving". The scout, when
// applied, observes the target (band perception, residence-unchanged) and lets the
// existing observation->resource-knowledge pipeline raise mostly presence/access/season
// confidence. It never updates yield, carrying capacity, stress, mortality, or the
// residential position, and it never assumes the band understands edibility / processing
// / safety (knowing a patch exists is not knowing how to exploit it).

// Bounded scouting envelope (Manhattan tiles) and the minimum value-of-information a
// candidate must clear to be worth a scout. EMPIRICAL CALIBRATION CONSTANTS (2K.1H).
const SCOUT_MAX_DISTANCE = 10;
const SCOUT_VOI_MIN = 0.34;
// 2K.6B / INFO-1: relaxed VOI floor used ONLY in proactive-info mode (a stable, spare-labor
// band learning before a crisis). Lower than SCOUT_VOI_MIN so an under-known nearby patch
// that a band would not normally bother scouting becomes a valid PROACTIVE target. Still > 0
// (never a zero-information scout) and still subject to every other filter (presence, distance,
// repeat/stale penalties). Applied only when context.proactiveInfoMode === true.
const SCOUT_VOI_MIN_PROACTIVE = 0.12;
// 2K.6B / INFO-1: floor proactive value for a plant-bearing patch the band KNOWS is present
// but has NOT learned to USE (its class is untested in the recent ring) — the diet-breadth
// "go learn to use what I know is here". Clears the relaxed floor; applied only in proactive mode.
const PROACTIVE_USE_FLOOR = 0.2;
// 2K.6B / INFO-1: smaller floor for proactively re-looking at a NOVEL known nearby patch (not
// just plant-bearing ones) — "go look more closely", which can form a plant observation on a
// plant-bearing tile and bootstrap future use-tests. Clears SCOUT_VOI_MIN_PROACTIVE.
const PROACTIVE_GENERAL_FLOOR = 0.14;
// A presence belief this faint is "nothing really believed here" — not worth a scout.
const SCOUT_MIN_PRESENCE = 0.08;

export function scoutKindForClass(classId: ResourceClassId): ResourceScoutKind {
  switch (classId) {
    case "water_resource":
      return "water_refuge";
    case "aquatic_food":
      return "aquatic_patch";
    case "animal_food":
      return "animal_sign";
    case "fallback_food":
      return "fallback_food";
    case "fiber_material":
    case "fuel_material":
      return "material_patch";
    case "medicinal_or_toxic":
      return "medicinal_toxic";
    case "generic_plant_food":
    default:
      return "plant_patch";
  }
}

function isSeasonalClass(classId: ResourceClassId): boolean {
  return (
    classId === "generic_plant_food" ||
    classId === "aquatic_food" ||
    classId === "animal_food"
  );
}

export interface ResourceScoutContext {
  readonly currentTileId: TileId;
  readonly currentTick: number;
  readonly season: Season;
  // 2K.6B / INFO-1: when true (a stable, spare-labor band whose proactive cooldown has
  // elapsed), the VOI floor is RELAXED so an under-known nearby patch becomes a valid scout
  // target — the band proactively learns before a crisis. Optional/false → byte-identical to
  // pre-INFO-1 selection (existing callers/fixtures need no change).
  readonly proactiveInfoMode?: boolean;
  readonly waterStress: NormalizedIntensity;
  readonly foodStress: NormalizedIntensity;
  readonly perCapitaReturn: NormalizedIntensity;
  readonly chronicDecline: boolean;
  // 0..1 — how much spare scouting labor the band has (working-adult share). Severe
  // stress reduces safe scout capacity even though it raises scout pressure.
  readonly scoutCapacity: NormalizedIntensity;
  readonly exhaustedRangeStress: NormalizedIntensity;
  // Manhattan distance from the current tile to a candidate (undefined = unreachable).
  readonly distanceTo: (tileId: TileId) => number | undefined;
  // Probe-recency hooks (shared probeMemory): 1 = novel, 0 = just probed; and the
  // consecutive no-information repeat count for that target.
  readonly probeNovelty: (tileId: TileId) => number;
  readonly probeNoGain: (tileId: TileId) => number;
  // 2K.5: the band's OWN capped recent test/cause rings, so scout selection can derive
  // patch-return readiness for follow-up observation/testing. Band-known evidence only.
  readonly recentPlantUseTests?: readonly PlantUseTestRingEntry[];
  readonly recentCauseSpecificEvents?: readonly CauseSpecificEventRingEntry[];
  // 2K.7: the band's OWN learned exploitation skill (anti-omniscient, band-own). Optional so
  // existing callers/fixtures need no change; absent → the patch-return estimate's
  // learnedRankDelta is 0 → scout selection is BYTE-IDENTICAL to pre-2K.7.
  readonly exploitationSkill?: ExploitationSkillState;
  // 2K.12: the band's OWN learned seasonal-ecology memory + the reader flag. When the
  // flag is enabled, a bounded SELECTION-ONLY seasonal bias may reorder which ALREADY-
  // VALID known patch wins the argmax (never the exported voiScore, never the scout-vs-
  // stay weight). Absent/flag-off → byte-identical to pre-2K.12 selection.
  readonly seasonalEcologyMemory?: Readonly<Record<TileId, SeasonalEcologyObservation>>;
  readonly seasonalEcologyReadersEnabled?: boolean;
}

// ---------------------------------------------------------------------------------------------
// 2K.5 — Patch Return-Guided Observation/Testing v0.
// A SELECTION-ONLY bias derived from the band's own 2K.4 patch-return estimate: it reorders
// which ALREADY-VALID scout candidate wins the argmax (follow-up observation of a promising-
// but-unproven patch, recheck of an unresolved processing question, another look at a patch
// under cautious testing, deprioritising a risk-flagged patch unless stress is severe). It is
// applied AFTER the SCOUT_VOI_MIN gate (it can neither create nor remove candidates), it is
// NOT part of the exported voiScore (so the scout-vs-stay/move decision weight is unchanged),
// and it never reads truth/yield — only the band's own memories and capped rings.
// ---------------------------------------------------------------------------------------------
const PATCH_RETURN_PROMISING_BIAS = 0.1; // follow-up observation of locally_promising_unproven
const PATCH_RETURN_PROCESSING_BIAS = 0.07; // recheck a processing_required_unknown patch
const PATCH_RETURN_CAUTIOUS_TESTING_BIAS = 0.05; // continue an already-cautious testing thread
const PATCH_RETURN_RISK_DEPRIORITIZE = -0.12; // risk-flagged patch loses ties at low stress
// "Strong fallback/stress gate": at/above this food stress a risk-flagged patch may be
// RE-CHECKED at normal priority (bias 0 — never boosted). Matches the severe-stress band
// used elsewhere (fallback trials / risky-scout urgency live around 0.7+).
const PATCH_RETURN_RISK_RECHECK_FOOD_STRESS = 0.75;

export type PatchReturnGuidanceReason =
  | "promising_unproven_patch_recheck"
  | "processing_unknown_recheck"
  | "cautious_testing_preferred"
  | "risk_state_blocks_use"
  | "risk_recheck_under_stress"
  | "no_guidance";

export interface PatchReturnScoutGuidance {
  // Bounded selection-only bias; added to the argmax key, NEVER to voiScore.
  readonly selectionBias: number;
  readonly guidanceReason: PatchReturnGuidanceReason;
  readonly readiness: PatchExploitationReadiness;
  readonly riskState: ObservedPatchRiskState;
  readonly confidence: ObservedPatchReturnConfidence;
  // 2K.7: the bounded learned-skill component folded into selectionBias (0 when the band has no
  // applicable skill for this known class → selection byte-identical to pre-2K.7), plus the
  // explainable provenance of that component. Selection-only — never yield/support/stress.
  readonly learnedRankDelta: number;
  readonly skillContributionReasons: readonly PatchReturnSkillReason[];
  // Literal guards: guidance picks what to OBSERVE/TEST next; it grants nothing.
  readonly knowledgeOnlyNoYield: true;
  readonly noSupportChange: true;
  readonly noStressChange: true;
}

// Derive the bounded selection guidance for ONE candidate patch memory. Pure +
// deterministic; exported for the targeted behaviour suite. Medicinal/toxic patches are
// excluded (their scout urgency is governed by the accepted 2K.3C-A stress-gated path —
// guidance must not invert it), so guidance only steers ordinary observation/testing.
export function derivePatchReturnScoutGuidance(
  memory: ResourcePatchMemory,
  context: ResourceScoutContext,
): PatchReturnScoutGuidance {
  const estimate = deriveObservedPatchReturn(memory, {
    currentTick: context.currentTick as TickNumber,
    recentPlantUseTests: context.recentPlantUseTests,
    recentCauseSpecificEvents: context.recentCauseSpecificEvents,
    // 2K.7: the band's own learned exploitation skill (optional / anti-omniscient). Absent →
    // estimate.learnedRankDelta is 0 → this guidance is byte-identical to pre-2K.7.
    exploitationSkill: context.exploitationSkill,
  });
  const skillDelta = estimate.learnedRankDelta;
  const base = {
    readiness: estimate.exploitationReadiness,
    riskState: estimate.riskState,
    confidence: estimate.confidence,
    learnedRankDelta: skillDelta,
    skillContributionReasons: estimate.skillContributionReasons,
    knowledgeOnlyNoYield: true,
    noSupportChange: true,
    noStressChange: true,
  } as const;

  // Medicinal/toxic stays governed by the 2K.3C-A stress-gated risky-scout path: learned skill
  // never steers it (estimate.learnedRankDelta is already 0 for that class, by construction).
  if (memory.resourceClassId === "medicinal_or_toxic") {
    return { ...base, selectionBias: 0, guidanceReason: "no_guidance" };
  }

  // 2K.7: the learned-skill delta REORDERS already-valid candidates exactly like the 2K.5
  // patch-return biases — added to the selection-only argmax key, NEVER to voiScore. For a
  // band-known-blocked patch the delta is already ≤ 0 (knowledge layer), so it can only
  // deprioritise, never rescue, a risk-flagged target.
  const withSkill = (
    baseBias: number,
    guidanceReason: PatchReturnGuidanceReason,
  ): PatchReturnScoutGuidance => ({
    ...base,
    selectionBias: round2(baseBias + skillDelta),
    guidanceReason,
  });

  if (estimate.riskState === "suspected_toxicity" || estimate.riskState === "avoided_due_to_risk") {
    return context.foodStress >= PATCH_RETURN_RISK_RECHECK_FOOD_STRESS
      ? withSkill(0, "risk_recheck_under_stress")
      : withSkill(PATCH_RETURN_RISK_DEPRIORITIZE, "risk_state_blocks_use");
  }

  if (estimate.exploitationReadiness === "locally_promising_unproven") {
    return withSkill(PATCH_RETURN_PROMISING_BIAS, "promising_unproven_patch_recheck");
  }

  if (estimate.exploitationReadiness === "processing_required_unknown") {
    return withSkill(PATCH_RETURN_PROCESSING_BIAS, "processing_unknown_recheck");
  }

  if (estimate.exploitationReadiness === "cautious_testing") {
    return withSkill(PATCH_RETURN_CAUTIOUS_TESTING_BIAS, "cautious_testing_preferred");
  }

  return withSkill(0, "no_guidance");
}

export interface ResourceScoutReasonVector {
  readonly uncertaintyReductionValue: NormalizedIntensity;
  readonly needPressure: NormalizedIntensity;
  readonly resourceClassUrgency: NormalizedIntensity;
  readonly seasonMatch: NormalizedIntensity;
  readonly routeConfidence: NormalizedIntensity;
  readonly distanceCost: NormalizedIntensity;
  readonly repeatPenalty: NormalizedIntensity;
  readonly staleWrongPenalty: NormalizedIntensity;
  readonly lowConfidencePenalty: NormalizedIntensity;
}

export interface ResourceScoutCandidate {
  readonly targetTileId: TileId;
  readonly targetResourceClass: ResourceClassId;
  readonly scoutKind: ResourceScoutKind;
  readonly targetSource: ResourceKnowledgeSource;
  readonly voiScore: NormalizedIntensity;
  readonly expectedInfoValue: NormalizedIntensity;
  readonly confidenceBefore: NormalizedIntensity;
  readonly routeConfidence: NormalizedIntensity;
  readonly laborCost: NormalizedIntensity;
  readonly repeatPenalty: NormalizedIntensity;
  readonly distance: number;
  readonly candidateCount: number;
  readonly reasonVector: ResourceScoutReasonVector;
  // 2K.5: the bounded patch-return selection guidance that was derived for this
  // candidate (debug + audit; selection-only — never part of voiScore).
  readonly patchReturnGuidance: PatchReturnScoutGuidance;
  // 2K.12: the learned-seasonal-memory hint that biased this candidate's selection key
  // (debug + audit; selection-only — never part of voiScore). Present only when the
  // reader flag is on AND the band has a relevant learned memory for this tile.
  readonly seasonalEcologyHint?: SeasonalEcologyHint;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Per-class urgency from the band's OWN stress, mirroring the belief-opportunity
// amplifiers: water/aquatic under water stress, fallback under low return, plant/
// animal under food stress. Material stays low-priority.
//
// 2K.3C-A (minimal scout-candidate path for risky-plant coverage): a HEAVILY
// food-stressed band is modestly more willing to send an INFORMATION scout toward a
// believed medicinal/toxic patch — a desperate "is this risky plant usable?" probe.
// This is a bounded, stress-gated SCOUT (information) pressure ONLY: it never makes a
// medicinal/toxic plant attractive food, never grants yield/support, never relocates the
// band, and stays below food/fallback urgency. It is inert for non-stressed bands
// (baseline 0.12) and for every existing scenario (none seed a medicinal/toxic belief,
// and such patches almost never materialize), so macro/determinism are unchanged.
const MEDICINAL_SCOUT_STRESS_GATE = 0.45;
const MEDICINAL_SCOUT_URGENCY_CAP = 0.6;
function resourceClassUrgency(classId: ResourceClassId, context: ResourceScoutContext): number {
  switch (classId) {
    case "water_resource":
      return context.waterStress;
    case "aquatic_food":
      return clamp01(context.waterStress * 0.7 + context.foodStress * 0.3);
    case "fallback_food":
      return clamp01((1 - context.perCapitaReturn) * 0.7 + context.foodStress * 0.3);
    case "generic_plant_food":
    case "animal_food":
      return clamp01(context.foodStress * 0.7 + (1 - context.perCapitaReturn) * 0.3);
    case "medicinal_or_toxic": {
      // Only a food-stressed band considers risky medicinal/toxic plants, and only as a
      // bounded INFORMATION scout — a desperate "is this risky plant usable?" probe. This is
      // SCOUT (information) pressure ONLY: never makes a medicinal/toxic plant attractive food,
      // never grants yield/support, never relocates the band, and stays at/under food urgency.
      // Inert for non-stressed bands (baseline 0.12) and for every existing scenario (none
      // seed a medicinal/toxic belief and such patches almost never materialize), so
      // macro/determinism are unchanged.
      const desperation = Math.max(context.foodStress, 1 - context.perCapitaReturn);
      if (desperation < MEDICINAL_SCOUT_STRESS_GATE) {
        return 0.12;
      }
      return Math.min(MEDICINAL_SCOUT_URGENCY_CAP, 0.12 + (desperation - MEDICINAL_SCOUT_STRESS_GATE) * 1.1);
    }
    case "fiber_material":
    case "fuel_material":
    default:
      return 0.12;
  }
}

// In-season match for seasonal classes; water/material/medicinal are season-agnostic.
function seasonMatch(memory: ResourcePatchMemory, classId: ResourceClassId, season: Season): number {
  if (!isSeasonalClass(classId)) {
    return 1;
  }
  if (memory.seasonality.badSeasons.includes(season)) {
    return 0.1;
  }
  if (memory.seasonality.bestSeasons.length === 0) {
    return 0.6; // unknown seasonality — mild; scouting partly to LEARN the season
  }
  return memory.seasonality.bestSeasons.includes(season) ? 1 : 0.25;
}

// Value of information: uncertainty there is to resolve, peaking for mid-confidence
// (suspected/inferred) beliefs and faint for already-reliable or near-empty ones.
function uncertaintyReduction(presence: number, source: ResourceKnowledgeSource, stale: boolean): number {
  const midPeak = clamp01(presence * (1 - presence) * 4); // peaks at presence=0.5
  const inferredBoost = source === "inferred" ? 0.25 : source === "inherited" ? 0.12 : 0;
  const staleBoost = stale ? 0.2 : 0;
  return clamp01(midPeak + inferredBoost + staleBoost);
}

// Select the best-VOI resource-scout target from the band's own bounded patch
// memories. Anti-omniscient (no map scan, no hidden truth), deterministic, bounded
// by the capped patch-memory list and the scouting envelope.
export function selectResourceScoutTarget(
  state: ResourceKnowledgeState | undefined,
  context: ResourceScoutContext,
): ResourceScoutCandidate | undefined {
  if (state === undefined || state.patchMemories.length === 0) {
    return undefined;
  }
  // Severe stress reduces safe scouting capacity (the band cannot spare a task group),
  // except urgent water/refuge scouting handled per-candidate below.
  const capacity = clamp01(context.scoutCapacity);

  let best: ResourceScoutCandidate | undefined;
  // 2K.5: the argmax compares voi + patch-return selectionBias (selection-only; the
  // exported voiScore stays the raw VOI so the scout-vs-stay decision weight is unchanged).
  let bestSelectionKey = -Infinity;
  let candidateCount = 0;

  for (const memory of state.patchMemories) {
    if (memory.approximateTile === context.currentTileId) {
      continue; // already here — nothing to scout
    }
    const distance = context.distanceTo(memory.approximateTile);
    if (distance === undefined || distance <= 0 || distance > SCOUT_MAX_DISTANCE) {
      continue; // out of the bounded scouting envelope / unreachable from known info
    }
    const effective = effectiveResourceConfidence(memory, context.currentTick);
    const presence = effective.effectivePresenceConfidence;
    if (presence < SCOUT_MIN_PRESENCE) {
      continue; // nothing really believed here
    }
    const classId = memory.resourceClassId;
    const urgency = resourceClassUrgency(classId, context);
    const isWater = classId === "water_resource";

    // Stress gates non-water scouting (no spare capacity), but urgent water/refuge
    // scouting is allowed even under stress (reliability rechecks are rational).
    // 2K.6B / INFO-1: a PROACTIVE band is stable with spare labor by construction (its
    // proactive gate required low stress + labor capacity), so it bypasses this low-capacity
    // throttle — it is precisely the band that CAN afford to learn before a crisis. Off →
    // byte-identical (the gate applies exactly as before for non-proactive bands).
    if (!isWater && capacity < 0.3 && urgency < 0.5 && context.proactiveInfoMode !== true) {
      continue;
    }

    const match = seasonMatch(memory, classId, context.season);
    const uncertainty = uncertaintyReduction(presence, memory.source, effective.isStale);
    const routeConfidence = effective.effectiveAccessConfidence;
    const needPressure = clamp01(
      urgency * 0.6 + (context.chronicDecline ? 0.18 : 0) + context.exhaustedRangeStress * 0.22,
    );
    const distanceCost = clamp01(distance / SCOUT_MAX_DISTANCE);
    const repeatPenalty = clamp01((1 - context.probeNovelty(memory.approximateTile)) * 0.6 + Math.min(1, context.probeNoGain(memory.approximateTile) / 5) * 0.4);
    const staleWrongPenalty = clamp01(memory.seasonality.failedSeasonCount * 0.12 + (memory.state === "seasonally_bad" ? 0.3 : 0));
    const lowConfidencePenalty = presence < 0.2 ? 0.15 : 0;
    const laborCost = clamp01(0.2 + distance / SCOUT_MAX_DISTANCE * 0.5 + (1 - capacity) * 0.3);

    const voiRaw =
      uncertainty * 0.5 +
      needPressure * 0.3 +
      match * 0.18 +
      routeConfidence * 0.12 +
      (context.chronicDecline ? 0.05 : 0) -
      distanceCost * 0.22 -
      repeatPenalty * 0.45 -
      staleWrongPenalty -
      lowConfidencePenalty -
      laborCost * 0.12;
    // Non-water out-of-season scouting is rarely worth it (learn-the-season aside).
    const voi = clamp01(voiRaw * (isWater ? 1 : 0.55 + match * 0.45));

    // 2K.6B / INFO-1: proactive USE-learning (the diet-breadth point). The base VOI above
    // measures PRESENCE uncertainty, so a stable band whose nearby patches are well-KNOWN finds
    // nothing to scout — yet it may KNOW a plant is here while never having learned to USE it.
    // In proactive mode, a plant-bearing patch whose resource class the band has NOT recently
    // tested gets a floor proactive value, so "go cautiously test the plant I know is here but
    // haven't used" becomes a valid target. Off → effectiveVoi === voi (byte-identical).
    let effectiveVoi = voi;
    if (context.proactiveInfoMode === true && context.probeNovelty(memory.approximateTile) > 0.5) {
      // Only a patch the band has NOT just probed (novelty) — so it rotates targets rather
      // than re-scouting one tile. A plant-bearing patch whose class is untested gets the
      // higher USE floor (go learn to use it); any other novel known patch gets a smaller
      // GENERAL floor (go look more closely — a plant-bearing tile can then form a plant
      // observation, enabling future use-tests). Off → effectiveVoi === voi (byte-identical).
      const useUnknownPlant =
        memory.plantObservation !== undefined &&
        !(context.recentPlantUseTests ?? []).some((entry) => entry.resourceClassId === classId);
      effectiveVoi = Math.max(effectiveVoi, useUnknownPlant ? PROACTIVE_USE_FLOOR : PROACTIVE_GENERAL_FLOOR);
    }

    // 2K.6B / INFO-1: a stable, spare-labor band in proactive mode accepts a lower VOI floor
    // so it learns under-known nearby patches before a crisis. Off → byte-identical (SCOUT_VOI_MIN).
    const voiFloor = context.proactiveInfoMode === true ? SCOUT_VOI_MIN_PROACTIVE : SCOUT_VOI_MIN;
    if (effectiveVoi < voiFloor) {
      continue;
    }
    candidateCount += 1;

    // 2K.5: bounded, selection-only patch-return guidance — derived AFTER the VOI gate so
    // it can only reorder candidates that already cleared it (never creates/removes one).
    // The key uses round2(voi) — the pre-2K.5 comparison granularity — so with all biases
    // zero the selection is BYTE-IDENTICAL to pre-2K.5 (the only behaviour delta a scenario
    // can ever show is a nonzero bias actually firing; verified by toggle experiment).
    const patchReturnGuidance = derivePatchReturnScoutGuidance(memory, context);
    // 2K.12: bounded, selection-only seasonal-memory bias (band-learned only, no hidden
    // truth). Like 2K.5, it is added to the selection key AFTER the VOI gate (cannot
    // create/remove a candidate) and is NEVER part of voiScore. Flag-off / no learned
    // memory for this tile → seasonalHint undefined → bias 0 → byte-identical selection.
    const seasonalHint =
      context.seasonalEcologyReadersEnabled === true
        ? readSeasonalEcologyHint(context.seasonalEcologyMemory, memory.approximateTile, context.season, domainForResourceClass(classId))
        : undefined;
    const seasonalSelectionBias = seasonalHint?.bias ?? 0;
    // Argmax/score key uses effectiveVoi (== voi off proactive) so a proactive band PREFERS
    // the known-but-unused plant patch; non-proactive selection is byte-identical.
    const selectionKey = round2(effectiveVoi) + patchReturnGuidance.selectionBias + seasonalSelectionBias;

    const candidate: ResourceScoutCandidate = {
      targetTileId: memory.approximateTile,
      targetResourceClass: classId,
      scoutKind: scoutKindForClass(classId),
      targetSource: memory.source,
      voiScore: round2(effectiveVoi),
      expectedInfoValue: round2(clamp01(uncertainty * 0.6 + match * 0.2 + routeConfidence * 0.2)),
      confidenceBefore: round2(presence),
      routeConfidence: round2(routeConfidence),
      laborCost: round2(laborCost),
      repeatPenalty: round2(repeatPenalty),
      distance,
      candidateCount: 0,
      reasonVector: {
        uncertaintyReductionValue: round2(uncertainty),
        needPressure: round2(needPressure),
        resourceClassUrgency: round2(urgency),
        seasonMatch: round2(match),
        routeConfidence: round2(routeConfidence),
        distanceCost: round2(distanceCost),
        repeatPenalty: round2(repeatPenalty),
        staleWrongPenalty: round2(staleWrongPenalty),
        lowConfidencePenalty: round2(lowConfidencePenalty),
      },
      patchReturnGuidance,
      ...(seasonalHint !== undefined ? { seasonalEcologyHint: seasonalHint } : {}),
    };

    // Deterministic argmax with id tie-break (2K.5: on voi + selection bias).
    if (
      best === undefined ||
      selectionKey > bestSelectionKey ||
      (selectionKey === bestSelectionKey && String(candidate.targetTileId) < String(best.targetTileId))
    ) {
      best = candidate;
      bestSelectionKey = selectionKey;
    }
  }

  return best === undefined ? undefined : { ...best, candidateCount };
}

export type ResourceScoutOutcome = ResourcePatchLearningOutcome;
export type ResourceScoutContradictionKind = ResourcePatchContradictionKind;

export interface ResourceScoutConfidenceDelta {
  readonly presenceConfidence: number;
  readonly seasonConfidence: number;
  readonly yieldConfidence: number;
  readonly safetyConfidence: number;
  readonly processingConfidence: number;
  readonly accessConfidence: number;
  readonly recoveryConfidence: number;
}

export type ResourceScoutConfidenceChannel = keyof ResourceScoutConfidenceDelta;

export interface ScoutExpectationRecord {
  readonly bandId: BandId;
  readonly tick: number;
  readonly season: Season;
  readonly originTile: TileId;
  readonly targetTile: TileId;
  readonly scoutKind: ResourceScoutKind;
  readonly targetResourceClass: ResourceClassId;
  readonly targetSource: ResourceKnowledgeSource;
  readonly expectedPresence: NormalizedIntensity;
  readonly expectedSeasonalFit: NormalizedIntensity;
  readonly expectedYieldHint: NormalizedIntensity;
  readonly expectedAccess: NormalizedIntensity;
  readonly expectedSafety: NormalizedIntensity;
  readonly observedPresenceHint: NormalizedIntensity;
  readonly observedSeasonalFit: NormalizedIntensity;
  readonly observedYieldHint: NormalizedIntensity;
  readonly observedAccess: NormalizedIntensity;
  readonly outcome: ResourceScoutOutcome;
  readonly contradictionKind: ResourceScoutContradictionKind;
  readonly confidenceBefore: ResourceConfidenceProfile;
  readonly confidenceAfter: ResourceConfidenceProfile;
  readonly deltaByConfidenceChannel: ResourceScoutConfidenceDelta;
  readonly plantObservation?: PlantScoutObservationHint;
  readonly memoryUpdated: boolean;
  readonly reasonIds: readonly ReasonId[];
}

export interface ScoutLearningSummary {
  readonly presence: NormalizedIntensity;
  readonly seasonalFit: NormalizedIntensity;
  readonly yieldHint: NormalizedIntensity;
  readonly access: NormalizedIntensity;
}

export interface ScoutMainConfidenceDelta {
  readonly channel: ResourceScoutConfidenceChannel;
  readonly delta: number;
}

export interface ScoutLearningRingEntry {
  readonly tick: number;
  readonly season: Season;
  readonly scoutKind: ResourceScoutKind;
  readonly targetTile: TileId;
  readonly resourceClass: ResourceClassId;
  readonly source: ResourceKnowledgeSource;
  readonly contradictionKind: ResourceScoutContradictionKind;
  readonly expected: ScoutLearningSummary;
  readonly observed: ScoutLearningSummary;
  readonly mainConfidenceDelta: ScoutMainConfidenceDelta;
  readonly memoryUpdated: boolean;
  readonly reasonIds: readonly ReasonId[];
}

const RECENT_SCOUT_LEARNING_CAP = 6;

export interface ScoutOutcomeInput {
  readonly scoutKind: ResourceScoutKind;
  readonly targetResourceClass: ResourceClassId;
  readonly presenceBefore: NormalizedIntensity;
  readonly presenceAfter: NormalizedIntensity;
  // Observed availability of the scouted class at the target (band perception, 0..1).
  readonly observedClassAvailability: NormalizedIntensity;
  readonly seasonMatch: NormalizedIntensity;
  readonly newTilesObserved: boolean;
  readonly accessBefore: NormalizedIntensity;
  readonly accessAfter: NormalizedIntensity;
}

// Deterministic, conservative, PARTIAL outcome classification for debug. Never reveals
// the full hidden value: it reads the band's own observation + prior belief only.
export function classifyScoutOutcome(input: ScoutOutcomeInput): ResourceScoutOutcome {
  const {
    scoutKind,
    presenceBefore,
    presenceAfter,
    observedClassAvailability,
    seasonMatch: match,
    newTilesObserved,
    accessBefore,
    accessAfter,
  } = input;

  const confidenceShift = Math.abs(presenceAfter - presenceBefore);
  const routeImproved = accessAfter - accessBefore > 0.05;

  // Animal targets: scouts read SIGNS/tracks, not stocks — stay uncertain.
  if (scoutKind === "animal_sign") {
    if (observedClassAvailability < 0.18) {
      return "belief_refuted";
    }
    return "found_sign_only";
  }

  // Medicinal/toxic: conservative — mostly caution / refresh, no poisoning effects yet.
  if (scoutKind === "medicinal_toxic") {
    return observedClassAvailability < 0.15 ? "belief_refuted" : "memory_refreshed_no_new_info";
  }

  if (!newTilesObserved && confidenceShift < 0.03 && !routeImproved) {
    return "memory_refreshed_no_new_info";
  }

  if (scoutKind === "water_refuge") {
    if (observedClassAvailability >= 0.45) {
      return "confirmed_present";
    }
    if (routeImproved) {
      return "route_improved_only";
    }
    // Low water/refuge confirmation is not a route failure. Blocked routes are
    // handled by the movement layer before scout observation is applied.
    return observedClassAvailability < 0.2 ? "belief_refuted" : "found_low_abundance";
  }

  // Plant / aquatic / fallback / material.
  if (observedClassAvailability >= 0.5) {
    return "confirmed_present";
  }
  if (observedClassAvailability >= 0.25) {
    return "found_low_abundance";
  }
  // Low availability: a seasonal miss vs a genuine refutation.
  if (match < 0.4) {
    return "confirmed_seasonal_absent";
  }
  if (routeImproved) {
    return "route_improved_only";
  }
  return "belief_refuted";
}

export interface ScoutContradictionInput {
  readonly scoutKind: ResourceScoutKind;
  readonly targetSource: ResourceKnowledgeSource;
  readonly outcome: ResourceScoutOutcome;
  readonly expectedPresence: NormalizedIntensity;
  readonly expectedSeasonalFit: NormalizedIntensity;
  readonly expectedYieldHint: NormalizedIntensity;
  readonly expectedAccess: NormalizedIntensity;
  readonly observedPresenceHint: NormalizedIntensity;
  readonly observedSeasonalFit: NormalizedIntensity;
  readonly observedYieldHint: NormalizedIntensity;
  readonly observedAccess: NormalizedIntensity;
  readonly previousNoGainCount: number;
  readonly wasStale: boolean;
}

export function classifyScoutContradiction(input: ScoutContradictionInput): ResourceScoutContradictionKind {
  if (input.outcome === "confirmed_present" || input.outcome === "confirmed_patch_present") {
    return "no_contradiction_confirmed";
  }

  if (input.outcome === "memory_refreshed_no_new_info") {
    return input.previousNoGainCount >= 2
      ? "repeated_no_new_information"
      : "memory_refreshed_without_confirmation";
  }

  if (input.targetSource === "inferred" && (
    input.outcome === "belief_refuted" ||
    input.outcome === "plant_patch_not_confirmed" ||
    input.outcome === "confirmed_seasonal_absent" ||
    input.observedPresenceHint < Math.max(0.18, input.expectedPresence * 0.5)
  )) {
    return "inferred_belief_unconfirmed";
  }

  if (input.targetSource === "inherited" && input.wasStale && (
    input.outcome === "belief_refuted" ||
    input.outcome === "plant_patch_not_confirmed" ||
    input.outcome === "confirmed_seasonal_absent" ||
    input.observedPresenceHint < Math.max(0.18, input.expectedPresence * 0.5)
  )) {
    return "inherited_belief_stale_or_wrong";
  }

  if (input.outcome === "route_failed_or_blocked") {
    return "expected_accessible_route_blocked";
  }

  if (input.observedAccess < input.expectedAccess - 0.18) {
    return "expected_accessible_found_costly";
  }

  if (input.outcome === "confirmed_seasonal_absent" || input.observedSeasonalFit < input.expectedSeasonalFit - 0.35) {
    return "expected_seasonal_found_out_of_season";
  }

  if (input.outcome === "belief_refuted" || input.outcome === "plant_patch_not_confirmed") {
    return input.scoutKind === "water_refuge"
      ? "expected_water_refuge_unconfirmed"
      : "expected_present_found_absent";
  }

  if (input.scoutKind === "animal_sign" && input.outcome === "found_sign_only") {
    return "expected_animal_sign_only";
  }

  if (input.outcome === "found_low_abundance" || input.observedYieldHint < input.expectedYieldHint - 0.18) {
    if (input.scoutKind === "material_patch") {
      return "expected_material_low_value";
    }
    return input.expectedYieldHint >= 0.28
      ? "expected_abundant_found_low"
      : "partial_confirmation";
  }

  if (
    input.outcome === "route_improved_only" ||
    input.outcome === "found_sign_only" ||
    input.outcome === "fallback_role_identified" ||
    input.outcome === "processing_need_suspected" ||
    input.outcome === "safety_risk_detected"
  ) {
    return "partial_confirmation";
  }

  return "partial_confirmation";
}

export interface ResourceScoutLearningUpdateInput {
  readonly state: ResourceKnowledgeState | undefined;
  readonly bandId: BandId;
  readonly tick: TickNumber;
  readonly season: Season;
  readonly originTile: TileId;
  readonly targetTile: TileId;
  readonly scoutKind: ResourceScoutKind;
  readonly targetResourceClass: ResourceClassId;
  readonly targetSource: ResourceKnowledgeSource;
  readonly outcome: ResourceScoutOutcome;
  readonly contradictionKind: ResourceScoutContradictionKind;
  readonly expectedPresence: NormalizedIntensity;
  readonly expectedSeasonalFit: NormalizedIntensity;
  readonly expectedYieldHint: NormalizedIntensity;
  readonly expectedAccess: NormalizedIntensity;
  readonly expectedSafety: NormalizedIntensity;
  readonly observedPresenceHint: NormalizedIntensity;
  readonly observedSeasonalFit: NormalizedIntensity;
  readonly observedYieldHint: NormalizedIntensity;
  readonly observedAccess: NormalizedIntensity;
  readonly plantObservation?: PlantScoutObservationHint;
}

export interface ResourceScoutLearningUpdate {
  readonly state: ResourceKnowledgeState | undefined;
  readonly reasonIds: readonly ReasonId[];
}

export function applyResourceScoutLearningDelta(
  input: ResourceScoutLearningUpdateInput,
): ResourceScoutLearningUpdate {
  const state = input.state;
  const memory = state?.patchMemories.find(
    (entry) => entry.approximateTile === input.targetTile && entry.resourceClassId === input.targetResourceClass,
  );

  if (state === undefined || memory === undefined) {
    return { state, reasonIds: [] };
  }

  const reasonId = makeScoutReasonId(input);
  const updatedMemory = applyLearningToPatch(memory, input, reasonId);

  if (updatedMemory === memory) {
    return { state, reasonIds: [] };
  }

  const patchMemories = state.patchMemories.map((entry) =>
    entry.patchId === memory.patchId ? updatedMemory : entry,
  );

  return {
    state: enforceResourceKnowledgeCap({ ...state, patchMemories }, Number(input.tick)),
    reasonIds: [reasonId],
  };
}

export function buildScoutExpectationRecord(input: {
  readonly bandId: BandId;
  readonly tick: number;
  readonly season: Season;
  readonly originTile: TileId;
  readonly targetTile: TileId;
  readonly scoutKind: ResourceScoutKind;
  readonly targetResourceClass: ResourceClassId;
  readonly targetSource: ResourceKnowledgeSource;
  readonly expectedPresence: NormalizedIntensity;
  readonly expectedSeasonalFit: NormalizedIntensity;
  readonly expectedYieldHint: NormalizedIntensity;
  readonly expectedAccess: NormalizedIntensity;
  readonly expectedSafety: NormalizedIntensity;
  readonly observedPresenceHint: NormalizedIntensity;
  readonly observedSeasonalFit: NormalizedIntensity;
  readonly observedYieldHint: NormalizedIntensity;
  readonly observedAccess: NormalizedIntensity;
  readonly plantObservation?: PlantScoutObservationHint;
  readonly outcome: ResourceScoutOutcome;
  readonly contradictionKind: ResourceScoutContradictionKind;
  readonly confidenceBefore: ResourceConfidenceProfile;
  readonly confidenceAfter: ResourceConfidenceProfile;
  readonly memoryUpdated: boolean;
  readonly reasonIds: readonly ReasonId[];
}): ScoutExpectationRecord {
  return {
    ...input,
    expectedPresence: round2(input.expectedPresence),
    expectedSeasonalFit: round2(input.expectedSeasonalFit),
    expectedYieldHint: round2(input.expectedYieldHint),
    expectedAccess: round2(input.expectedAccess),
    expectedSafety: round2(input.expectedSafety),
    observedPresenceHint: round2(input.observedPresenceHint),
    observedSeasonalFit: round2(input.observedSeasonalFit),
    observedYieldHint: round2(input.observedYieldHint),
    observedAccess: round2(input.observedAccess),
    confidenceBefore: roundConfidenceProfile(input.confidenceBefore),
    confidenceAfter: roundConfidenceProfile(input.confidenceAfter),
    deltaByConfidenceChannel: getConfidenceDelta(input.confidenceBefore, input.confidenceAfter),
  };
}

export function appendRecentScoutLearning(
  previous: readonly ScoutLearningRingEntry[] | undefined,
  learning: ScoutExpectationRecord,
): readonly ScoutLearningRingEntry[] | undefined {
  if (!shouldRememberScoutLearning(learning)) {
    return previous;
  }

  const entry: ScoutLearningRingEntry = {
    tick: learning.tick,
    season: learning.season,
    scoutKind: learning.scoutKind,
    targetTile: learning.targetTile,
    resourceClass: learning.targetResourceClass,
    source: learning.targetSource,
    contradictionKind: learning.contradictionKind,
    expected: {
      presence: learning.expectedPresence,
      seasonalFit: learning.expectedSeasonalFit,
      yieldHint: learning.expectedYieldHint,
      access: learning.expectedAccess,
    },
    observed: {
      presence: learning.observedPresenceHint,
      seasonalFit: learning.observedSeasonalFit,
      yieldHint: learning.observedYieldHint,
      access: learning.observedAccess,
    },
    mainConfidenceDelta: getMainConfidenceDelta(learning.contradictionKind, learning.deltaByConfidenceChannel),
    memoryUpdated: learning.memoryUpdated,
    reasonIds: learning.reasonIds,
  };

  return [entry, ...(previous ?? [])].slice(0, RECENT_SCOUT_LEARNING_CAP);
}

export function emptyConfidenceProfile(): ResourceConfidenceProfile {
  return {
    presenceConfidence: 0,
    seasonConfidence: 0,
    yieldConfidence: 0,
    safetyConfidence: 0,
    processingConfidence: 0,
    accessConfidence: 0,
    recoveryConfidence: 0,
  };
}

export function effectiveConfidenceProfile(
  memory: ResourcePatchMemory | undefined,
  currentTick: number,
): ResourceConfidenceProfile {
  if (memory === undefined) {
    return emptyConfidenceProfile();
  }
  const effective = effectiveResourceConfidence(memory, currentTick);
  return {
    presenceConfidence: effective.effectivePresenceConfidence,
    seasonConfidence: effective.effectiveSeasonConfidence,
    yieldConfidence: effective.effectiveYieldConfidence,
    safetyConfidence: effective.effectiveSafetyConfidence,
    processingConfidence: effective.effectiveProcessingConfidence,
    accessConfidence: effective.effectiveAccessConfidence,
    recoveryConfidence: effective.effectiveRecoveryConfidence,
  };
}

export function expectationSeasonalFit(
  memory: ResourcePatchMemory | undefined,
  classId: ResourceClassId,
  season: Season,
): NormalizedIntensity {
  return memory === undefined ? 0.6 : seasonMatch(memory, classId, season);
}

// Compact per-band debug record of the band's most recent resource_scout (2K.1H).
// Surfaced in report-band + BandPanel. movementEffect is always residential_unchanged;
// omniscient is always false and trueValueHiddenFromBand always true.
export interface ResourceScoutDebug {
  readonly tick: number;
  readonly season: Season;
  readonly scoutKind: ResourceScoutKind;
  readonly targetTile: TileId;
  readonly targetResourceClass: ResourceClassId;
  readonly targetSource: ResourceKnowledgeSource;
  readonly candidateCount: number;
  readonly selectedScore: NormalizedIntensity;
  readonly expectedInfoValue: NormalizedIntensity;
  readonly confidenceBefore: NormalizedIntensity;
  readonly confidenceAfter: NormalizedIntensity;
  readonly routeConfidenceChange: number;
  readonly repeatPenalty: NormalizedIntensity;
  readonly outcome: ResourceScoutOutcome;
  readonly contradictionKind: ResourceScoutContradictionKind;
  readonly learning: ScoutExpectationRecord;
  readonly deltaByConfidenceChannel: ResourceScoutConfidenceDelta;
  readonly plantObservation?: PlantScoutObservationHint;
  readonly plantUseEligibility?: PlantUseEligibility;
  readonly plantUseTest?: PlantUseTestEvent;
  // 2K.3A: bounded nonlethal cause-specific stress/illness-poisoning SCAFFOLD event,
  // derived only from a risk-relevant plant-use/test outcome. Knowledge/debug only.
  readonly causeSpecificEvent?: CauseSpecificEvent;
  readonly inferredBeliefTested: boolean;
  readonly falseOrUnconfirmedInference: boolean;
  readonly repeatedNoInfoScout: boolean;
  readonly seasonalMismatch: boolean;
  readonly partialConfirmation: boolean;
  readonly partialConfirmContradict: boolean;
  readonly memoryUpdated: boolean;
  readonly reasonVector: ResourceScoutReasonVector;
  // 2K.5: the patch-return guidance that was derived for the EXECUTED scout target
  // (selection-only bias; knowledge/debug — the scout still only observes/tests).
  readonly patchReturnGuidance?: PatchReturnScoutGuidance;
  readonly learnedWorldModelStatus: "future; contradiction records now feed it";
}

function applyLearningToPatch(
  memory: ResourcePatchMemory,
  input: ResourceScoutLearningUpdateInput,
  reasonId: ReasonId,
): ResourcePatchMemory {
  const confidence = adjustConfidence(memory.confidence, input);
  const seasonality = adjustSeasonality(memory, input);
  const state = adjustState(memory, input, confidence);
  const source = adjustSource(memory, input);
  const learning = updatePatchLearningMemory(memory.learning, input);
  const plantObservation = updatePlantObservationMemory(memory.plantObservation, input, reasonId);
  const useHistory = {
    ...memory.useHistory,
    lastYieldEstimate: round2(input.observedYieldHint),
    yieldTrend: getYieldTrend(memory.useHistory.lastYieldEstimate, input.observedYieldHint),
  };
  const reasonIds = [...memory.reasonIds, reasonId].slice(-12);

  return {
    ...memory,
    state,
    source,
    confidence,
    seasonality,
    useHistory,
    learning,
    plantObservation,
    transmission:
      input.contradictionKind === "inherited_belief_stale_or_wrong"
        ? {
            ...memory.transmission,
            detailLoss: round2(clamp01(memory.transmission.detailLoss + 0.15)),
          }
        : memory.transmission,
    lastNotedTick: input.tick,
    reasonIds,
  };
}

function adjustConfidence(
  confidence: ResourceConfidenceProfile,
  input: ResourceScoutLearningUpdateInput,
): ResourceConfidenceProfile {
  const water = input.scoutKind === "water_refuge";
  const c = confidence;
  let adjusted: ResourceConfidenceProfile = confidence;

  switch (input.contradictionKind) {
    case "no_contradiction_confirmed":
      adjusted = withConfidenceDeltas(c, {
        presenceConfidence: 0.05,
        seasonConfidence: isSeasonalClass(input.targetResourceClass) ? 0.04 : 0,
        yieldConfidence: 0.03,
        safetyConfidence: 0.01,
        accessConfidence: 0.03,
      });
      break;
    case "partial_confirmation":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: 0.03,
        seasonConfidence: input.observedSeasonalFit >= 0.45 ? 0.01 : -0.02,
        yieldConfidence: input.observedYieldHint < input.expectedYieldHint ? -0.03 : 0.01,
        accessConfidence: 0.02,
      }), input);
      break;
    case "expected_animal_sign_only":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: 0.02,
        yieldConfidence: -0.04,
        safetyConfidence: 0.01,
        accessConfidence: 0.02,
      }), input);
      break;
    case "expected_abundant_found_low":
    case "expected_material_low_value":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: 0.02,
        seasonConfidence: -0.02,
        yieldConfidence: -0.08,
      }), input);
      break;
    case "expected_seasonal_found_out_of_season":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: -0.02,
        seasonConfidence: -0.14,
        yieldConfidence: -0.04,
      }), input);
      break;
    case "expected_accessible_found_costly":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        accessConfidence: -0.1,
      }), input);
      break;
    case "expected_accessible_route_blocked":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        accessConfidence: -0.18,
      }), input);
      break;
    case "expected_water_refuge_unconfirmed":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: -0.08,
        yieldConfidence: -0.05,
        accessConfidence: -0.04,
      }), input);
      break;
    case "expected_present_found_absent":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: -0.12,
        yieldConfidence: -0.08,
      }), input);
      break;
    case "inferred_belief_unconfirmed":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: -0.14,
        seasonConfidence: -0.04,
        yieldConfidence: -0.1,
      }), input);
      break;
    case "inherited_belief_stale_or_wrong":
      adjusted = capContradictedChannels(withConfidenceDeltas(c, {
        presenceConfidence: -0.12,
        seasonConfidence: -0.05,
        yieldConfidence: -0.09,
      }), input);
      break;
    case "repeated_no_new_information":
      adjusted = withConfidenceDeltas(c, {
        presenceConfidence: water ? -0.01 : -0.02,
        seasonConfidence: -0.03,
        yieldConfidence: water ? -0.02 : -0.04,
      });
      break;
    case "memory_refreshed_without_confirmation":
      adjusted = withConfidenceDeltas(c, {
        seasonConfidence: -0.02,
        yieldConfidence: -0.02,
      });
      break;
  }

  return applyPlantObservationConfidenceHints(adjusted, input);
}

function applyPlantObservationConfidenceHints(
  confidence: ResourceConfidenceProfile,
  input: ResourceScoutLearningUpdateInput,
): ResourceConfidenceProfile {
  const observation = input.plantObservation;

  if (observation === undefined) {
    return confidence;
  }

  let adjusted = confidence;

  if (
    observation.observationOutcome === "confirmed_patch_present" ||
    observation.observationOutcome === "fallback_role_identified"
  ) {
    adjusted = withConfidenceDeltas(adjusted, {
      presenceConfidence: round2(0.02 + observation.confidenceModifier * 0.03),
      seasonConfidence: observation.observedSeasonalState === "active" ? 0.02 : 0,
      yieldConfidence: round2(Math.min(0.02, observation.observedAbundanceHint * 0.04)),
    });
  }

  if (
    observation.observationOutcome === "suspected_processing_need" ||
    observation.suspectedProcessingNeed
  ) {
    adjusted = withConfidenceDeltas(adjusted, {
      processingConfidence: 0.03,
    });
    adjusted = {
      ...adjusted,
      processingConfidence: round2(Math.min(adjusted.processingConfidence, 0.24)),
    };
  }

  if (
    observation.observationOutcome === "suspected_safety_risk" ||
    observation.suspectedSafetyRisk
  ) {
    adjusted = {
      ...adjusted,
      safetyConfidence: round2(Math.min(adjusted.safetyConfidence, 0.24)),
    };
  }

  return adjusted;
}

function capContradictedChannels(
  confidence: ResourceConfidenceProfile,
  input: ResourceScoutLearningUpdateInput,
): ResourceConfidenceProfile {
  switch (input.contradictionKind) {
    case "expected_accessible_found_costly":
      return {
        ...confidence,
        accessConfidence: round2(Math.min(confidence.accessConfidence, clamp01(input.expectedAccess - 0.05))),
      };
    case "expected_accessible_route_blocked":
      return {
        ...confidence,
        accessConfidence: round2(Math.min(confidence.accessConfidence, clamp01(input.expectedAccess - 0.14))),
      };
    case "expected_seasonal_found_out_of_season":
      return {
        ...confidence,
        seasonConfidence: round2(Math.min(confidence.seasonConfidence, clamp01(input.expectedSeasonalFit - 0.1))),
        yieldConfidence: round2(Math.min(confidence.yieldConfidence, clamp01(input.expectedYieldHint - 0.03))),
      };
    case "expected_abundant_found_low":
    case "expected_material_low_value":
    case "partial_confirmation":
    case "expected_animal_sign_only":
      return input.observedYieldHint < input.expectedYieldHint
        ? {
            ...confidence,
            yieldConfidence: round2(Math.min(confidence.yieldConfidence, clamp01(input.expectedYieldHint - 0.02))),
          }
        : confidence;
    case "expected_present_found_absent":
    case "expected_water_refuge_unconfirmed":
    case "inferred_belief_unconfirmed":
    case "inherited_belief_stale_or_wrong":
      return input.observedPresenceHint < input.expectedPresence
        ? {
            ...confidence,
            presenceConfidence: round2(Math.min(confidence.presenceConfidence, clamp01(input.expectedPresence - 0.06))),
          }
        : confidence;
    default:
      return confidence;
  }
}

function withConfidenceDeltas(
  confidence: ResourceConfidenceProfile,
  delta: Partial<ResourceScoutConfidenceDelta>,
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

function adjustSeasonality(
  memory: ResourcePatchMemory,
  input: ResourceScoutLearningUpdateInput,
) {
  const failed =
    input.contradictionKind === "expected_seasonal_found_out_of_season" ||
    (isSeasonalClass(input.targetResourceClass) &&
      (input.contradictionKind === "inferred_belief_unconfirmed" ||
        input.contradictionKind === "inherited_belief_stale_or_wrong") &&
      input.observedPresenceHint < 0.2);
  const confirmed =
    isSeasonalClass(input.targetResourceClass) &&
    (input.contradictionKind === "no_contradiction_confirmed" ||
      input.contradictionKind === "partial_confirmation") &&
    input.observedSeasonalFit >= 0.45 &&
    input.observedPresenceHint >= 0.22;

  if (!failed && !confirmed) {
    return memory.seasonality;
  }

  return {
    bestSeasons: confirmed
      ? addUniqueSeason(memory.seasonality.bestSeasons, input.season)
      : memory.seasonality.bestSeasons,
    badSeasons: failed
      ? addUniqueSeason(memory.seasonality.badSeasons, input.season)
      : memory.seasonality.badSeasons,
    lastConfirmedSeason: confirmed ? input.season : memory.seasonality.lastConfirmedSeason,
    lastFailedTick: failed ? input.tick : memory.seasonality.lastFailedTick,
    failedSeasonCount: failed
      ? Math.min(99, memory.seasonality.failedSeasonCount + 1)
      : memory.seasonality.failedSeasonCount,
  };
}

function updatePlantObservationMemory(
  previous: PlantObservationMemory | undefined,
  input: ResourceScoutLearningUpdateInput,
  reasonId: ReasonId,
): PlantObservationMemory | undefined {
  if (input.plantObservation === undefined) {
    return previous;
  }

  return plantObservationMemoryFromHint(previous, input.plantObservation, input.tick, reasonId);
}

// 2K.11 — exported converter so a side-encountered cautious test (bandDecision.ts) can attach a
// freshly-observed plant hint to a band-known patch memory through the SAME logic the scout uses
// (the scout path now delegates here, so it stays byte-identical).
export function plantObservationMemoryFromHint(
  previous: PlantObservationMemory | undefined,
  observation: PlantScoutObservationHint,
  tick: TickNumber,
  reasonId: ReasonId,
): PlantObservationMemory {
  return {
    plantClassId: observation.observedPlantClassId ?? previous?.plantClassId,
    plantPatchId: observation.observedPatchId ?? previous?.plantPatchId,
    observedLifecycleState: observation.observedLifecycleState,
    observedConditionHint: observation.observedConditionHint,
    observedSeasonalState: observation.observedSeasonalState,
    suspectedProcessingNeed: previous?.suspectedProcessingNeed === true || observation.suspectedProcessingNeed,
    suspectedSafetyRisk: previous?.suspectedSafetyRisk === true || observation.suspectedSafetyRisk,
    suspectedStoragePotential: previous?.suspectedStoragePotential === true || observation.suspectedStoragePotential,
    storagePotentialHint: observation.storagePotentialHint ?? previous?.storagePotentialHint,
    fallbackRoleHint: observation.fallbackRoleHint !== "none"
      ? observation.fallbackRoleHint
      : previous?.fallbackRoleHint ?? "none",
    fallbackRankHint: round2(Math.max(previous?.fallbackRankHint ?? 0, observation.fallbackRankHint)),
    observedAvailabilityHint: observation.observedAvailabilityHint,
    observedAbundanceHint: observation.observedAbundanceHint,
    confidenceModifier: observation.confidenceModifier,
    observationCount: Math.min(99, (previous?.observationCount ?? 0) + 1),
    lastObservedTick: tick,
    trueValueHiddenFromBand: true,
    reasonIds: [...(previous?.reasonIds ?? []), reasonId, ...observation.reasonIds].slice(-12),
  };
}

function adjustState(
  memory: ResourcePatchMemory,
  input: ResourceScoutLearningUpdateInput,
  confidence: ResourceConfidenceProfile,
) {
  if (input.contradictionKind === "expected_seasonal_found_out_of_season") {
    return "seasonally_bad";
  }

  if (
    input.contradictionKind === "expected_present_found_absent" ||
    input.contradictionKind === "inferred_belief_unconfirmed" ||
    input.contradictionKind === "inherited_belief_stale_or_wrong" ||
    input.contradictionKind === "expected_water_refuge_unconfirmed"
  ) {
    return confidence.presenceConfidence < 0.18 ? "suspected" : memory.state;
  }

  if (input.scoutKind === "animal_sign" && input.contradictionKind === "expected_animal_sign_only") {
    return memory.state === "unknown" ? "suspected" : memory.state;
  }

  if (
    (input.contradictionKind === "no_contradiction_confirmed" ||
      input.contradictionKind === "partial_confirmation") &&
    (memory.state === "unknown" || memory.state === "suspected")
  ) {
    return "observed";
  }

  return memory.state;
}

function adjustSource(
  memory: ResourcePatchMemory,
  input: ResourceScoutLearningUpdateInput,
): ResourceKnowledgeSource {
  if (
    input.contradictionKind === "no_contradiction_confirmed" ||
    input.contradictionKind === "partial_confirmation" ||
    input.contradictionKind === "expected_animal_sign_only"
  ) {
    return "direct";
  }

  return memory.source;
}

function updatePatchLearningMemory(
  previous: ResourcePatchLearningMemory | undefined,
  input: ResourceScoutLearningUpdateInput,
): ResourcePatchLearningMemory {
  const contradiction = isContradiction(input.contradictionKind);
  const partial = input.contradictionKind === "partial_confirmation" || input.contradictionKind === "expected_animal_sign_only";
  const noInfo =
    input.contradictionKind === "repeated_no_new_information" ||
    input.contradictionKind === "memory_refreshed_without_confirmation";
  const falseInference = input.contradictionKind === "inferred_belief_unconfirmed";
  const seasonalMismatch = input.contradictionKind === "expected_seasonal_found_out_of_season";

  return {
    lastOutcome: input.outcome,
    lastContradictionKind: input.contradictionKind,
    lastOutcomeTick: input.tick,
    lastFailedTick: contradiction ? input.tick : previous?.lastFailedTick,
    confirmationCount: Math.min(
      999,
      (previous?.confirmationCount ?? 0) + (input.contradictionKind === "no_contradiction_confirmed" ? 1 : 0),
    ),
    contradictionCount: Math.min(999, (previous?.contradictionCount ?? 0) + (contradiction ? 1 : 0)),
    partialConfirmationCount: Math.min(999, (previous?.partialConfirmationCount ?? 0) + (partial ? 1 : 0)),
    noInfoCount: Math.min(999, (previous?.noInfoCount ?? 0) + (noInfo ? 1 : 0)),
    falseInferenceCount: Math.min(999, (previous?.falseInferenceCount ?? 0) + (falseInference ? 1 : 0)),
    seasonalMismatchCount: Math.min(999, (previous?.seasonalMismatchCount ?? 0) + (seasonalMismatch ? 1 : 0)),
  };
}

function shouldRememberScoutLearning(learning: ScoutExpectationRecord): boolean {
  return (
    learning.contradictionKind !== "no_contradiction_confirmed" ||
    Object.values(learning.deltaByConfidenceChannel).some((delta) => delta < 0)
  );
}

function getMainConfidenceDelta(
  contradictionKind: ResourceScoutContradictionKind,
  delta: ResourceScoutConfidenceDelta,
): ScoutMainConfidenceDelta {
  const preferred = preferredDeltaChannel(contradictionKind, delta);
  if (preferred !== undefined) {
    return { channel: preferred, delta: round2(delta[preferred]) };
  }

  const entries: readonly ResourceScoutConfidenceChannel[] = [
    "presenceConfidence",
    "seasonConfidence",
    "yieldConfidence",
    "safetyConfidence",
    "processingConfidence",
    "accessConfidence",
    "recoveryConfidence",
  ];
  let channel = entries[0];
  let value = delta[channel];

  for (const candidate of entries.slice(1)) {
    const candidateValue = delta[candidate];
    if (Math.abs(candidateValue) > Math.abs(value)) {
      channel = candidate;
      value = candidateValue;
    }
  }

  return { channel, delta: round2(value) };
}

function preferredDeltaChannel(
  contradictionKind: ResourceScoutContradictionKind,
  delta: ResourceScoutConfidenceDelta,
): ResourceScoutConfidenceChannel | undefined {
  switch (contradictionKind) {
    case "expected_accessible_found_costly":
    case "expected_accessible_route_blocked":
      return "accessConfidence";
    case "expected_seasonal_found_out_of_season":
      return "seasonConfidence";
    case "expected_abundant_found_low":
    case "expected_material_low_value":
    case "expected_animal_sign_only":
      return "yieldConfidence";
    case "expected_present_found_absent":
    case "expected_water_refuge_unconfirmed":
    case "inherited_belief_stale_or_wrong":
      return "presenceConfidence";
    case "inferred_belief_unconfirmed":
      return delta.presenceConfidence !== 0 ? "presenceConfidence" : "yieldConfidence";
    case "repeated_no_new_information":
    case "memory_refreshed_without_confirmation":
      return strongestNegativeDeltaChannel(delta);
    case "no_contradiction_confirmed":
    case "partial_confirmation":
      return undefined;
  }
}

function strongestNegativeDeltaChannel(
  delta: ResourceScoutConfidenceDelta,
): ResourceScoutConfidenceChannel | undefined {
  const entries: readonly ResourceScoutConfidenceChannel[] = [
    "presenceConfidence",
    "seasonConfidence",
    "yieldConfidence",
    "safetyConfidence",
    "processingConfidence",
    "accessConfidence",
    "recoveryConfidence",
  ];
  let channel: ResourceScoutConfidenceChannel | undefined;
  let value = 0;

  for (const candidate of entries) {
    const candidateValue = delta[candidate];
    if (candidateValue < value) {
      channel = candidate;
      value = candidateValue;
    }
  }

  return channel;
}

function isContradiction(kind: ResourceScoutContradictionKind): boolean {
  return kind !== "no_contradiction_confirmed" && kind !== "partial_confirmation";
}

function getYieldTrend(previous: number, next: number): ResourcePatchMemory["useHistory"]["yieldTrend"] {
  if (next > previous + 0.03) {
    return "rising";
  }
  if (next < previous - 0.03) {
    return "declining";
  }
  return "flat";
}

function makeScoutReasonId(input: ResourceScoutLearningUpdateInput): ReasonId {
  return `reason:resource_scout:${input.bandId}:${String(input.targetTile)}:${input.targetResourceClass}:${Number(input.tick)}:${input.contradictionKind}` as ReasonId;
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

function getConfidenceDelta(
  before: ResourceConfidenceProfile,
  after: ResourceConfidenceProfile,
): ResourceScoutConfidenceDelta {
  return {
    presenceConfidence: round2(after.presenceConfidence - before.presenceConfidence),
    seasonConfidence: round2(after.seasonConfidence - before.seasonConfidence),
    yieldConfidence: round2(after.yieldConfidence - before.yieldConfidence),
    safetyConfidence: round2(after.safetyConfidence - before.safetyConfidence),
    processingConfidence: round2(after.processingConfidence - before.processingConfidence),
    accessConfidence: round2(after.accessConfidence - before.accessConfidence),
    recoveryConfidence: round2(after.recoveryConfidence - before.recoveryConfidence),
  };
}

function addUniqueSeason(seasons: readonly Season[], season: Season): readonly Season[] {
  return seasons.includes(season) ? seasons : [...seasons, season];
}
