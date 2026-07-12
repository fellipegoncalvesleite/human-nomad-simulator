// ENVIRONMENT-READING PRACTICAL ADAPTATION / INVENTION-1 — practical responses.
//
// A PRACTICAL RESPONSE is a composed, context-bound way of acting that a band
// may develop because of conditions it repeatedly experiences. The causal
// chain is strict:
//
//   repeated experienced condition (real pressure/burden evidence)
//   → learned fragments (practicalFragments.ts — material/technique/route)
//   → a response VARIANT composed from specific fragments
//   → a capped effect on a REAL coefficient (seasonal travel budget limiters,
//     migration hardship) in MATCHING context only
//   → response-specific efficacy (adaptiveEfficacy.ts evaluators)
//   → confidence, partial success, failure, revision, dormancy, abandonment
//   → changed future behavior.
//
// Responses are NOT inventory, technology unlocks, crafting recipes, or
// identity labels. A variant name ("fiber sling") explains a configuration of
// fragments; the fragments and measured efficacy are the cause. Two bands can
// reach the same label through different histories, or never form one at all.
//
// IMPLEMENTED (behavior-driving) families:
//   * carrying_load  — condition: sustained carrying/care burden on residential
//     travel; effect: bounded relief on the travel plan's carry-constraint and
//     vulnerable-share limiters + a capped reduction of the dependent/elder
//     hardship terms of a residential move.
//   * dry_route_water — condition: repeated water stress with movement
//     pressure; effect: bounded relief on the travel plan's water-stress
//     limiter, ONLY when the scored destination is one of the band's own
//     remembered watered places (staging between known water points).
//   * engineering_structure — condition: a real attempted temporary-watercraft
//     crossing; effect: capped relief on that crossing's expected-safety
//     coefficient, only where multiple components were learned in context.
//
// DECLARED-ONLY response families (registry below documents what real substrate
// each still needs): hunting_distance, temporary_shelter, water_storage and
// animal_proximity. Proto-animal management is implemented separately in
// animalLearning.ts; the generic response family remains deliberately inert.
//
// Purity: deterministic, bounded, no unseeded randomness, no `any`, no UI
// imports, anti-omniscient (band-known evidence only).

import type { TickNumber } from "../core/types";
import type {
  AdaptiveEfficacyRecord,
  Band,
  PracticalAdaptationState,
  PracticalExperiment,
  PracticalFragment,
  PracticalIdeaCandidate,
  PracticalProblemFamily,
  PracticalProblemFrame,
  PracticalResponseFamily,
  PracticalResponseState,
  PracticalResponseStatus,
  PracticalWaterWorks,
  ResidentialMoveEvent,
} from "./types";
import { deriveBandTendencies } from "./bandTendency";
import { evaluateGroundwaterEfficacy, type EfficacyEvaluation } from "./adaptiveEfficacy";
import {
  advancePracticalFragments,
  deriveFragmentSignals,
  effectiveFragmentStrength,
  findFragment,
  inheritFragmentsForDaughter,
  recordFragmentFailure,
  recordFragmentSuccess,
  FRAGMENT_CAP,
  type DigOutcomeSignal,
  type FragmentResidenceContext,
} from "./practicalFragments";
import {
  advanceExperiments,
  advanceProblemFrames,
  deterministicRoll,
  inheritProblemFramesForDaughter,
  mergeIdeas,
  selectIdeaForProblem,
  startExperiment,
  EXPERIMENT_CAP,
  IDEA_CAP,
  PROBLEM_CAP,
  type ExperimentAdvanceEvent,
  type IdeaOption,
  type ProblemSignal,
} from "./inventionChain";

export const RESPONSE_CAP = 10;
export const PRACTICAL_RECORD_CAP = 12;
// Effect caps (same conservative family as crossing practice's 0.35): most of
// the underlying constraint is ALWAYS still paid.
export const CARRYING_RELIEF_CAP_SIMPLE = 0.3;
export const CARRYING_RELIEF_CAP_COMPOSITE = 0.4;
export const WATER_ROUTE_RELIEF_CAP = 0.3;
export const ENGINEERING_SAFETY_CAP = 0.22;
// INVENTION-3 effect caps.
export const CARRIED_WATER_RELIEF_CAP = 0.28;
export const SHELTER_EXPOSURE_RELIEF_CAP = 0.35;
export const HUNTING_DANGER_RELIEF_CAP = 0.3;
export const CARE_TREATMENT_RELIEF_CAP = 0.35;
export const WATERWORKS_YIELD_CAP = 0.15;
export const SHELTER_PORTABILITY_BURDEN_CAP = 0.05;
// Provisioning without any counting/pacing practice under-fills or wastes a
// share of what is carried; a practiced tally closes most of that gap.
export const PROVISIONING_ACCURACY_BASE = 0.75;
export const RAW_VARIANT_CANDIDATE_CAP = 6;
export const TOP_VARIANT_CANDIDATE_CAP = 3;
// A grounded useful repeated activity starts around 0.30, while a specific
// difficult three-tile move starts at 0.26. Either may support a crude/simple
// response; multi-component configurations retain the stricter 0.50
// weakest-link floor below.
const FRAGMENT_BASIS_FLOOR = 0.25;
const COMPOSITE_BASIS_FLOOR = 0.5;
const CONDITION_FLOOR = 0.2;
const DORMANT_AFTER_TICKS = 8; // 2y without the matching condition
const ABANDON_FAILURES = 3;
const REDISCOVERY_BLOCK_TICKS = 32; // 8y before an abandoned variant may re-form
const RELIEF_ACTIVE_FLOOR = 0.05;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Registry — the documented possibility space. `implemented: false` entries
// are extension hooks: they name the real condition source and effect target
// a future pass must use, and what is still missing. Nothing decorative is
// derived from them.
// ---------------------------------------------------------------------------

export interface PracticalResponseRegistryEntry {
  readonly family: PracticalResponseFamily;
  readonly implemented: boolean;
  readonly conditionSource: string;
  readonly effectTarget: string;
  readonly fragmentBasis: string;
  readonly blockedOn?: string;
}

export const PRACTICAL_RESPONSE_REGISTRY: readonly PracticalResponseRegistryEntry[] = [
  {
    family: "carrying_load",
    implemented: true,
    conditionSource: "bodyCampLogistics carryConstraintBias / careTravelBurdenBias + dependents/elders share on residential travel",
    effectTarget: "seasonal travel plan carry + vulnerable limiters; residential-move hardship dependent/elder terms",
    fragmentBasis: "fiber_cordage, load_binding, load_staging",
  },
  {
    family: "dry_route_water",
    implemented: true,
    conditionSource: "pressureState.waterStress with move pressure; water-hardship residential moves",
    effectTarget: "seasonal travel plan water limiter, gated on a remembered watered destination",
    fragmentBasis: "watered_route_reading",
  },
  {
    family: "hunting_distance",
    implemented: true,
    conditionSource: "band's own hunting-trip traces (dangerClass/wariness) + lived animal-encounter injury episodes",
    effectTarget: "AnimalActivityTrace.dangerRisk paid on hunting trips (capped relief; snare variant also shifts return/labor)",
    fragmentBasis: "shaft_truing, tension_release, seal_coating (hafted composite)",
  },
  {
    family: "temporary_shelter",
    implemented: true,
    conditionSource: "campExposure coefficient (bodyCampLogistics) + lived weather memories",
    effectTarget: "campExposure.effectiveExposure → sickness-wave severity → existing demographic risk; portability burden is paid on the travel plan",
    fragmentBasis: "camp_ground_reading, cover_layering, frame_shaping",
  },
  {
    family: "water_storage",
    implemented: true,
    conditionSource: "water stress with movement pressure + lived water-hardship moves (few or no remembered watered destinations)",
    effectTarget: "carried-water relief on the travel plan water limiter and the residential-move water hardship term",
    fragmentBasis: "container_holding, fiber_cordage, seal_coating (sealed composite)",
  },
  {
    family: "groundwater_seek",
    implemented: true,
    conditionSource: "persistent residence water stress + observable damp-ground/animal-water cues (no aquifer truth)",
    effectTarget: "waterWorks yield: bounded relief on pressureState.waterStress at the built tile only",
    fragmentBasis: "groundwater_reading, pit_support (lined composite)",
  },
  {
    family: "care_treatment",
    implemented: true,
    conditionSource: "band's own lived acute injury/sickness episodes + care burden",
    effectTarget: "acute episode recovery seasons and mortality-risk bump (capped damping, cause-matched)",
    fragmentBasis: "wound_care, plant_preparation",
  },
  {
    family: "proto_measure",
    implemented: true,
    conditionSource: "journey misjudgment evidence: stranded staged legs, shuttle load division, repeated task parties",
    effectTarget: "provisioningAccuracy consumed by carried-water relief (task-specific; no universal mathematics)",
    fragmentBasis: "one_to_one_count, journey_pacing",
  },
  {
    family: "animal_proximity",
    implemented: false,
    conditionSource: "persisted animal-pattern observations plus causal proto-management outcomes in animalLearning.ts",
    effectTarget: "animal encounter/return coefficients; eventually managed-animal costs",
    fragmentBasis: "animal-pattern knowledge exists, but is not yet translated into generic practical fragments",
    blockedOn: "management already affects stock routines directly; no separate generic response coefficient is justified yet",
  },
  {
    family: "engineering_structure",
    implemented: true,
    conditionSource: "temporaryWatercraft per-move assessment (already real) + structure fragments",
    effectTarget: "crossing feasibility for no-land-route moves (pontoon/temporary bridge class)",
    fragmentBasis: "buoyancy_reading, frame_bracing, binding_under_load",
  },
];

// ---------------------------------------------------------------------------
// Variant compositions — which fragments make which configuration possible.
// The weakest required fragment bounds the composition (weakest-link rule).
// ---------------------------------------------------------------------------

interface VariantSpec {
  readonly family: PracticalResponseFamily;
  readonly variantKey: string;
  readonly publicLabel: string;
  readonly requiredSubjects: readonly string[];
  readonly basisFloor: number;
  readonly reliefCap: number;
  readonly contextNote: string;
  // INVENTION-3 idea metadata: what mechanism the band believes this
  // configuration uses, and its relative cost (rejection reasons).
  readonly mechanismBelief?: string;
  readonly costNote?: string;
  // Water vessels: share of carried water lost per journey (before heat).
  readonly leakage?: number;
  // Shelter: which exposure kinds this structure actually addresses.
  readonly exposureKinds?: readonly ("heat" | "cold" | "wet" | "wind")[];
  // Shelter: carrying burden the structure adds to residential travel.
  readonly portabilityBurden?: number;
  // Care: which episode-cause groups this treatment can plausibly help.
  readonly careKinds?: readonly ("injury" | "sickness")[];
  // Aggregate carrier physics (no individual inventory objects).
  readonly waterCapacity?: number;
  readonly carryingBurden?: number;
  // Compact physical experiment proof.
  readonly materials?: readonly string[];
  readonly procedure?: string;
  readonly laborCost?: number;
  readonly riskCost?: number;
}

const VARIANT_SPECS: readonly VariantSpec[] = [
  {
    family: "carrying_load",
    variantKey: "fiber_sling",
    publicLabel: "fiber sling and wrap carrying response",
    requiredSubjects: ["fiber_cordage"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: CARRYING_RELIEF_CAP_SIMPLE,
    contextNote: "helps only burdened residential travel; fades if fiber work is not kept up",
  },
  {
    family: "carrying_load",
    variantKey: "load_staging",
    publicLabel: "staged-load carrying response",
    requiredSubjects: ["load_staging"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: CARRYING_RELIEF_CAP_SIMPLE,
    contextNote: "helps only burdened residential travel; depends on lived staged-travel experience",
  },
  {
    family: "carrying_load",
    variantKey: "carrying_frame",
    publicLabel: "rough carrying-frame response",
    requiredSubjects: ["fiber_cordage", "load_binding"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: CARRYING_RELIEF_CAP_COMPOSITE,
    contextNote: "composite: needs strong fiber AND binding practice; helps only burdened residential travel",
  },
  {
    family: "dry_route_water",
    variantKey: "stage_known_water",
    publicLabel: "stage travel between remembered watered places",
    requiredSubjects: ["watered_route_reading"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: WATER_ROUTE_RELIEF_CAP,
    contextNote: "applies only when the journey's scored destination is a remembered watered place",
  },
  {
    family: "engineering_structure",
    variantKey: "crude_bundle_float",
    publicLabel: "crude bound-bundle crossing response",
    requiredSubjects: ["buoyancy_under_load", "binding_under_load", "staged_shuttle_crossing"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: ENGINEERING_SAFETY_CAP * 0.72,
    contextNote: "three-component bundle/shuttle response; applies only at a crossing context actually tested",
  },
  {
    family: "engineering_structure",
    variantKey: "braced_load_raft",
    publicLabel: "braced load-distributing crossing response",
    requiredSubjects: ["buoyancy_under_load", "binding_under_load", "load_distribution", "staged_shuttle_crossing"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: ENGINEERING_SAFETY_CAP,
    contextNote: "four-component refinement; local flow, load and season can still make it fail",
  },
  // ------------------------------------------------------------------- A —
  {
    family: "water_storage",
    variantKey: "membrane_water_bag",
    publicLabel: "plugged membrane water bag",
    requiredSubjects: ["membrane_folding"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: CARRIED_WATER_RELIEF_CAP * 0.5,
    contextNote: "a flexible lining carries a little water, but its neck and seams leak on long routes",
    mechanismBelief: "a folded skin or membrane tied around a plug holds some water between camps",
    costNote: "small capacity and steady leakage; the lining also adds carried weight",
    leakage: 0.28,
    waterCapacity: 0.12,
    carryingBurden: 0.035,
    materials: ["flexible skin or membrane", "wooden or bone plug", "binding strip"],
    procedure: "fold the membrane around a plug, bind the neck, fill it, and watch how much remains after a short carry",
    laborCost: 0.06,
    riskCost: 0.07,
  },
  {
    family: "water_storage",
    variantKey: "woven_lined_carrier",
    publicLabel: "woven lined water carrier",
    requiredSubjects: ["container_holding", "fiber_cordage"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: CARRIED_WATER_RELIEF_CAP * 0.72,
    contextNote: "carries water across dry stages but weeps through the weave; worse in heat",
    mechanismBelief: "a tight weave with a wet lining holds water long enough to cross a dry stage",
    costNote: "steady fiber work to keep tight",
    leakage: 0.35,
    waterCapacity: 0.18,
    carryingBurden: 0.045,
    materials: ["worked fiber", "flexible wet lining"],
    procedure: "weave a tight carrier, press in a wet lining, fill it, and watch the seams through a short carry",
    laborCost: 0.08,
    riskCost: 0.08,
  },
  {
    family: "water_storage",
    variantKey: "sealed_water_carrier",
    publicLabel: "gum-sealed water carrier",
    requiredSubjects: ["container_holding", "seal_coating"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: CARRIED_WATER_RELIEF_CAP,
    contextNote: "sealed seams lose little water, but the coating can crack in hard heat",
    mechanismBelief: "a heated gum coat closes the seams a weave alone cannot",
    costNote: "gathering and heating the coating is slow work",
    leakage: 0.12,
    waterCapacity: 0.26,
    carryingBurden: 0.07,
    materials: ["woven carrier", "tree gum or resin", "fine charcoal or mineral dust", "fire heat"],
    procedure: "warm the gum, mix in fine dry additive, press the viscous compound into seams, then cool and test it with water",
    laborCost: 0.14,
    riskCost: 0.14,
  },
  // ------------------------------------------------------------------- A —
  {
    family: "groundwater_seek",
    variantKey: "seep_scrape",
    publicLabel: "scraped seep hollow",
    requiredSubjects: ["groundwater_reading"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: WATERWORKS_YIELD_CAP * 0.66,
    contextNote: "a shallow scrape where the ground reads damp; may yield nothing, and dries with the season",
    mechanismBelief: "damp ground and green margins mean water sits close beneath",
    costNote: "digging labor lost if the reading is wrong",
  },
  {
    family: "groundwater_seek",
    variantKey: "lined_seep_pit",
    publicLabel: "lined and deepened seep pit",
    requiredSubjects: ["groundwater_reading", "pit_support"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: WATERWORKS_YIELD_CAP,
    contextNote: "deepened toward a steadier yield; unsupported walls collapse",
    mechanismBelief: "supported walls let a damp scrape be deepened to steadier water",
    costNote: "heavy digging and lining labor",
  },
  // ------------------------------------------------------------------- B —
  {
    family: "temporary_shelter",
    variantKey: "brush_windbreak",
    publicLabel: "brush windbreak",
    requiredSubjects: ["camp_ground_reading"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: SHELTER_EXPOSURE_RELIEF_CAP * 0.57,
    contextNote: "cuts wind and cold at the sleeping ground; useless against rain or heat",
    mechanismBelief: "banked brush on the weather side keeps the cold wind off sleepers",
    costNote: "cheap to raise, rebuilt at every camp",
    exposureKinds: ["wind", "cold"],
    portabilityBurden: 0,
  },
  {
    family: "temporary_shelter",
    variantKey: "shade_screen",
    publicLabel: "raised shade screen",
    requiredSubjects: ["cover_layering"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: SHELTER_EXPOSURE_RELIEF_CAP * 0.63,
    contextNote: "keeps hard sun off rest and stores; does nothing for cold or rain",
    mechanismBelief: "a raised cover holds shade over the resting ground through the hot hours",
    costNote: "light to carry, needs steady re-covering",
    exposureKinds: ["heat"],
    portabilityBurden: 0.01,
  },
  {
    family: "temporary_shelter",
    variantKey: "covered_rain_shelter",
    publicLabel: "framed and covered rain shelter",
    requiredSubjects: ["cover_layering", "frame_shaping"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: SHELTER_EXPOSURE_RELIEF_CAP,
    contextNote: "sheds rain and holds warmth, but its frame and covers burden every residential move",
    mechanismBelief: "a braced frame under layered covers sheds rain away from bedding",
    costNote: "heavy: frame poles and covers travel with the camp",
    exposureKinds: ["wet", "cold", "wind"],
    portabilityBurden: SHELTER_PORTABILITY_BURDEN_CAP,
  },
  // ------------------------------------------------------------------- C —
  {
    family: "hunting_distance",
    variantKey: "thrown_reach_hunting",
    publicLabel: "trued throwing-shaft hunting",
    requiredSubjects: ["shaft_truing"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: HUNTING_DANGER_RELIEF_CAP * 0.6,
    contextNote: "strikes from farther than a close thrust; wary or defended game still turns hunts back",
    mechanismBelief: "a trued shaft thrown hard strikes before the animal closes or flees",
    costNote: "shafts break and need re-truing",
  },
  {
    family: "hunting_distance",
    variantKey: "hafted_point_hunting",
    publicLabel: "gum-hafted point hunting",
    requiredSubjects: ["shaft_truing", "seal_coating"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: HUNTING_DANGER_RELIEF_CAP,
    contextNote: "a bound and gummed point holds through the strike; the haft can fail in heat or damp",
    mechanismBelief: "gum-set binding keeps the point fast to the shaft through a hard strike",
    costNote: "point and gum work before every season",
  },
  {
    family: "hunting_distance",
    variantKey: "tensioned_snare_line",
    publicLabel: "tensioned snare lines",
    requiredSubjects: ["fiber_cordage", "tension_release"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: HUNTING_DANGER_RELIEF_CAP * 0.73,
    contextNote: "takes small game without close approach; lines must be walked and reset (labor), and wary game learns",
    mechanismBelief: "a bent stem held by a set trigger takes game while the hunters are elsewhere",
    costNote: "daily walking and resetting of the lines",
  },
  // ------------------------------------------------------------------- H —
  {
    family: "care_treatment",
    variantKey: "wound_binding_care",
    publicLabel: "cleaned and bound wound care",
    requiredSubjects: ["wound_care"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: CARE_TREATMENT_RELIEF_CAP * 0.71,
    contextNote: "helps hurts and injuries mend; does little against gut sickness",
    mechanismBelief: "a cleaned, bound hurt worsens less and mends sooner",
    costNote: "care time from working hands",
    careKinds: ["injury"],
    materials: ["clean water", "worked binding fiber"],
    procedure: "rinse a hurt, press it closed, bind it, and rest the injured person",
    laborCost: 0.1,
    riskCost: 0.06,
  },
  {
    family: "care_treatment",
    variantKey: "plant_poultice_care",
    publicLabel: "prepared plant poultice care",
    requiredSubjects: ["wound_care", "plant_preparation"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: CARE_TREATMENT_RELIEF_CAP,
    contextNote: "eases both hurts and some sickness — for reasons the band only partly reads",
    mechanismBelief: "certain prepared plants drive the badness out of hurts and gut sickness",
    costNote: "gathering and preparing the right plants",
    careKinds: ["injury", "sickness"],
    materials: ["locally gathered plant", "water", "heat or pounding tool", "binding fiber"],
    procedure: "select, pound or warm the plant, apply a small preparation, and watch whether the hurt or sickness changes",
    laborCost: 0.14,
    riskCost: 0.24,
  },
  // ------------------------------------------------------------------- F —
  {
    family: "proto_measure",
    variantKey: "load_tally_reckoning",
    publicLabel: "load-and-vessel tally reckoning",
    requiredSubjects: ["one_to_one_count"],
    basisFloor: FRAGMENT_BASIS_FLOOR,
    reliefCap: 0.25,
    contextNote: "matches filled vessels and loads to marks, one for one; accurate only for small counts",
    mechanismBelief: "a mark for each filled vessel shows what is short before leaving",
    costNote: "someone must keep and read the marks",
  },
  {
    family: "proto_measure",
    variantKey: "journey_pacing_reckoning",
    publicLabel: "day-stage journey reckoning",
    requiredSubjects: ["journey_pacing", "one_to_one_count"],
    basisFloor: COMPOSITE_BASIS_FLOOR,
    reliefCap: 0.25,
    contextNote: "reckons water against remembered day-stages; poor outside familiar country",
    mechanismBelief: "water for a journey can be reckoned by its remembered day-stages",
    costNote: "depends on remembered stages staying true",
  },
];

const VARIANTS_BY_FAMILY = new Map<PracticalResponseFamily, readonly VariantSpec[]>();
for (const spec of VARIANT_SPECS) {
  const existing = VARIANTS_BY_FAMILY.get(spec.family) ?? [];
  VARIANTS_BY_FAMILY.set(spec.family, [...existing, spec]);
}

function variantBasis(
  spec: VariantSpec,
  fragments: readonly PracticalFragment[],
  currentTick: number,
): { readonly basis: number; readonly fragmentIds: readonly string[] } {
  let weakest = 1;
  const ids: string[] = [];
  for (const subject of spec.requiredSubjects) {
    const fragment = findFragment(fragments, subject);
    const strength = fragment === undefined ? 0 : effectiveFragmentStrength(fragment, currentTick);
    if (fragment !== undefined) {
      ids.push(fragment.id);
    }
    if (strength < weakest) {
      weakest = strength;
    }
  }
  return { basis: round2(weakest), fragmentIds: ids };
}

// ---------------------------------------------------------------------------
// Condition detection — band-known pressure/burden evidence only.
// ---------------------------------------------------------------------------

// Carrying condition. Coefficient scales are calibrated to the REAL ranges of
// the underlying behavior hooks (bodyCampLogistics clamps carryConstraintBias
// to ~0..0.18 and careTravelBurdenBias to ~0..0.16 by construction), and the
// primary lived evidence is the band's own recent BURDENED residential moves
// (the move-event ring records realized hardship risk and dependent/elder
// hardship reasons) — carrying is experienced as a problem when moving camp
// under load, not while sitting still.
export function deriveCarryingCondition(band: Band): number {
  const behavior = band.bodyCampLogistics?.behavior;
  const vulnerableShare =
    (band.demography.dependents + band.demography.elders) /
    Math.max(1, band.demography.population);
  const burdenedMoves = (band.recentResidentialMoveEvents ?? []).filter((event) =>
    (event.hardshipReason ?? "").includes("dependents") || (event.hardshipRisk ?? 0) >= 0.45).length;
  const burdenedMoveEvidence = burdenedMoves >= 2 ? 0.35 : burdenedMoves === 1 ? 0.25 : 0;
  return round2(clamp01(
    (behavior?.carryConstraintBias ?? 0) * 2.2 +
      (behavior?.careTravelBurdenBias ?? 0) * 1.5 +
      Math.max(0, vulnerableShare - 0.42) * 1.2 +
      burdenedMoveEvidence,
  ));
}

// Water-route condition: standing water stress WITH movement pressure, plus
// the band's own recent water-hardship moves (lived dry-travel evidence).
export function deriveWaterRouteCondition(band: Band): number {
  const waterStress = band.pressureState?.waterStress ?? 0;
  const movePressure = band.pressureState?.netMovePressure ?? band.pressureState?.mobilityPressure ?? 0;
  const recentWaterHardship = (band.recentResidentialMoveEvents ?? [])
    .some((event) => (event.hardshipReason ?? "").includes("water")) ? 0.25 : 0;
  if (waterStress < 0.4 && recentWaterHardship === 0) {
    return 0;
  }
  return round2(clamp01(
    Math.max(0, waterStress - 0.4) * 2.2 * (movePressure >= 0.2 ? 1 : 0.4) + recentWaterHardship,
  ));
}

export function deriveEngineeringCondition(band: Band): number {
  const assessments = (band.recentResidentialMoveEvents ?? [])
    .map((event) => event.temporaryWatercraft)
    .filter((assessment) => assessment?.considered === true);
  if (assessments.length === 0) return 0;
  const latest = assessments[0];
  const failurePressure = latest?.result === "crossing_abandoned_risk" || latest?.result === "materials_missing" ? 0.32 :
    latest?.result === "crossing_partial_success" || latest?.result === "crossing_delayed_materials" ? 0.5 : 0.38;
  return round2(clamp01(failurePressure + Math.min(0.28, assessments.length * 0.07)));
}

// ---------------------------------------------------------------------------
// INVENTION-3 conditions — band-known evidence only.
// ---------------------------------------------------------------------------

// Carried-water condition: standing water stress under movement pressure when
// the band's remembered watered places are FEW (staging between known points
// is not available or not enough) or its moves already ended in water
// hardship. Carrying water is the answer when the route itself is dry.
export function deriveWaterStorageCondition(band: Band): number {
  const waterStress = band.pressureState?.waterStress ?? 0;
  const movePressure = band.pressureState?.netMovePressure ?? band.pressureState?.mobilityPressure ?? 0;
  const waterHardshipMoves = (band.recentResidentialMoveEvents ?? [])
    .filter((event) => (event.hardshipReason ?? "").includes("water")).length;
  let wateredPlaces = 0;
  for (const record of Object.values(band.placeMemory)) {
    if ((record.lastKnownWaterStress ?? 1) <= 0.35 && record.visitCount >= 2) {
      wateredPlaces += 1;
    }
  }
  if (waterStress < 0.4 && waterHardshipMoves === 0) {
    return 0;
  }
  const sparseWaterKnowledge = wateredPlaces <= 2 ? 0.14 : 0;
  return round2(clamp01(
    Math.max(0, waterStress - 0.4) * 1.9 * (movePressure >= 0.15 ? 1 : 0.5) +
      Math.min(0.3, waterHardshipMoves * 0.15) +
      sparseWaterKnowledge,
  ));
}

// Groundwater condition: water stress that PERSISTS at the residence — the
// band has stayed through it (moving did not resolve it, or it cannot move).
export function deriveGroundwaterCondition(band: Band): number {
  const waterStress = band.pressureState?.waterStress ?? 0;
  if (waterStress < 0.45) {
    return 0;
  }
  const stayedThrough = Math.min(1, (band.consecutiveSeasonsOnTile ?? 0) / 3);
  const hardshipWaterMoves = (band.recentResidentialMoveEvents ?? [])
    .some((event) => (event.hardshipReason ?? "").includes("water")) ? 0.12 : 0;
  return round2(clamp01((waterStress - 0.45) * 1.6 + stayedThrough * 0.3 + hardshipWaterMoves));
}

// Shelter condition: the exposure the band actually lived at its camp last
// season (bodyCampLogistics.campExposure raw value) plus lived weather
// memories. A mild-country band has no shelter problem.
export function deriveShelterCondition(band: Band): number {
  const exposure = band.bodyCampLogistics?.campExposure;
  const raw = exposure?.rawExposure ?? 0;
  if (raw < 0.3) {
    return 0;
  }
  const weather = (band.bodyCampLogistics?.weatherMemories ?? [])
    .reduce((max, memory) => Math.max(max, memory.strength), 0);
  return round2(clamp01((raw - 0.3) * 1.8 + weather * 0.2));
}

// Hunting condition: danger and injury the band's own hunting actually paid —
// dangerous trip traces and animal-encounter injury episodes.
export function deriveHuntingCondition(band: Band): number {
  const traces = (band.recentIntraSeasonTrips ?? [])
    .map((trip) => trip.animalActivityTrace)
    .filter((trace): trace is NonNullable<typeof trace> => trace !== undefined);
  if (traces.length === 0) {
    return 0;
  }
  const dangerous = traces.filter((trace) => trace.dangerClass !== "low").length;
  const failures = traces.filter((trace) => trace.outcomeClass === "failure").length;
  const injuries = (band.acuteRisk?.recentEpisodes ?? [])
    .filter((episode) => episode.kind === "animal_encounter_injury").length;
  if (dangerous === 0 && injuries === 0) {
    return 0;
  }
  return round2(clamp01(
    Math.min(0.4, dangerous * 0.14) + Math.min(0.24, injuries * 0.12) + Math.min(0.16, failures * 0.08),
  ));
}

// Care condition: episodes the band actually lived through recently.
export function deriveCareCondition(band: Band): number {
  const episodes = band.acuteRisk?.recentEpisodes ?? [];
  if (episodes.length < 2) {
    return 0;
  }
  const severe = episodes.filter((episode) =>
    episode.severity === "severe" || episode.severity === "critical").length;
  const careBurden = band.bodyCampLogistics?.careTravelBurden?.sickCareBurden ?? 0;
  return round2(clamp01(Math.min(0.42, episodes.length * 0.11) + severe * 0.12 + careBurden * 0.25));
}

// Measure condition: journeys and provisioning the band misjudged — stranded
// staged legs, water hardship despite carrying, shuttle divisions. Mostly an
// IMPROVEMENT opportunity on an already-functional practice.
export function deriveMeasureCondition(band: Band): number {
  const events = band.recentResidentialMoveEvents ?? [];
  const stagedLegs = events.filter((event) => (event.distanceTiles ?? 0) >= 2).length;
  const waterHardship = events.filter((event) => (event.hardshipReason ?? "").includes("water")).length;
  const shuttles = events.filter((event) => (event.temporaryWatercraft?.shuttleTrips ?? 0) >= 2).length;
  const carriedWaterActive = (band.practicalAdaptation?.responses ?? [])
    .some((response) => response.family === "water_storage" && response.status !== "abandoned");
  if (stagedLegs === 0 && shuttles === 0 && waterHardship === 0) {
    return 0;
  }
  return round2(clamp01(
    Math.min(0.24, stagedLegs * 0.08) +
      Math.min(0.24, waterHardship * 0.2) +
      Math.min(0.16, shuttles * 0.08) +
      (carriedWaterActive ? 0.12 : 0),
  ));
}

function conditionFor(family: PracticalResponseFamily, band: Band): number {
  switch (family) {
    case "carrying_load": return deriveCarryingCondition(band);
    case "dry_route_water": return deriveWaterRouteCondition(band);
    case "engineering_structure": return deriveEngineeringCondition(band);
    case "water_storage": return deriveWaterStorageCondition(band);
    case "groundwater_seek": return deriveGroundwaterCondition(band);
    case "temporary_shelter": return deriveShelterCondition(band);
    case "hunting_distance": return deriveHuntingCondition(band);
    case "care_treatment": return deriveCareCondition(band);
    case "proto_measure": return deriveMeasureCondition(band);
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// INVENTION-3 — problem families: which lived problem each response family
// addresses, and the frame evidence/interpretations behind it.
// ---------------------------------------------------------------------------

const PROBLEM_TO_FAMILIES: ReadonlyMap<PracticalProblemFamily, readonly PracticalResponseFamily[]> = new Map([
  ["carrying_burden", ["carrying_load"]],
  // One problem, several possible answers: staging between remembered water
  // and carrying water compete for the same lived problem.
  ["water_route_shortage", ["dry_route_water", "water_storage"]],
  ["camp_water_shortage", ["groundwater_seek"]],
  ["camp_exposure", ["temporary_shelter"]],
  ["hunting_danger", ["hunting_distance"]],
  ["sickness_injury", ["care_treatment"]],
  ["journey_misjudgment", ["proto_measure"]],
  ["crossing_blocked", ["engineering_structure"]],
] as const);

export const FAMILY_TO_PROBLEM: ReadonlyMap<PracticalResponseFamily, PracticalProblemFamily> = new Map(
  [...PROBLEM_TO_FAMILIES.entries()].flatMap(([problem, families]) =>
    families.map((family) => [family, problem] as const)),
);

/** Band-known problem signals for this season (severity = the same condition
 * evidence response formation uses; interpretation may later be misread). */
export function deriveProblemSignals(band: Band): readonly ProblemSignal[] {
  const signals: ProblemSignal[] = [];
  const position = String(band.position);

  const carrying = deriveCarryingCondition(band);
  if (carrying > 0) {
    signals.push({
      family: "carrying_burden",
      publicLabel: "moving camp under load wears the carriers down",
      severity: carrying,
      confidence: 0.7,
      interpretation: "the loads and the slow walkers exceed what hands can carry",
      ambiguity: 0.15,
      evidenceRefs: ["body_logistics:carry_constraint", "movement:burdened_moves"],
      origin: "lived",
    });
  }

  const waterRoute = Math.max(deriveWaterRouteCondition(band), deriveWaterStorageCondition(band));
  if (waterRoute > 0) {
    signals.push({
      family: "water_route_shortage",
      publicLabel: "travel keeps outrunning the water",
      severity: waterRoute,
      confidence: 0.62,
      interpretation: "the routes ahead hold too little water for the crossing days",
      competingInterpretation: "the band reads the country's water wrong and walks past it",
      ambiguity: 0.35,
      evidenceRefs: ["pressure:water_stress", "movement:water_hardship"],
      origin: "lived",
    });
  }

  const groundwater = deriveGroundwaterCondition(band);
  if (groundwater > 0) {
    signals.push({
      family: "camp_water_shortage",
      publicLabel: "the camp's water is failing where the band sits",
      severity: groundwater,
      confidence: 0.6,
      interpretation: "water may sit beneath the damp ground near camp",
      competingInterpretation: "this country simply lacks water and the camp must move",
      ambiguity: 0.5,
      evidenceRefs: ["pressure:water_stress_persistent"],
      contextKey: position,
      origin: "lived",
    });
  }

  const exposureState = band.bodyCampLogistics?.campExposure;
  const shelterCondition = deriveShelterCondition(band);
  if (shelterCondition > 0) {
    signals.push({
      family: "camp_exposure",
      publicLabel: `the camp lies open to ${exposureState?.dominantKind ?? "the weather"}`,
      severity: shelterCondition,
      confidence: 0.66,
      interpretation: exposureState?.dominantKind === "wet"
        ? "rain and wet ground reach the bedding because nothing sheds them"
        : "the sleeping ground lies open to the weather side",
      competingInterpretation: "the shelters themselves are shaped wrong, not the ground they stand on",
      ambiguity: 0.4,
      evidenceRefs: ["camp_exposure:lived", "weather_memories"],
      contextKey: position,
      origin: "lived",
    });
  }

  const hunting = deriveHuntingCondition(band);
  if (hunting > 0) {
    signals.push({
      family: "hunting_danger",
      publicLabel: "close hunts keep turning dangerous",
      severity: hunting,
      confidence: 0.68,
      interpretation: "the hunters must close to striking distance and the game turns on them there",
      competingInterpretation: "the game itself has turned bad-tempered in this country",
      ambiguity: 0.3,
      evidenceRefs: ["trips:dangerous_hunts", "episodes:animal_injury"],
      origin: "lived",
    });
  }

  const care = deriveCareCondition(band);
  if (care > 0) {
    const episodes = band.acuteRisk?.recentEpisodes ?? [];
    const sicknessCount = episodes.filter((episode) =>
      episode.kind === "bad_water_sickness" || episode.kind === "spoiled_or_risky_food_sickness" ||
      episode.kind === "plant_poisoning_or_irritation").length;
    const injuryCount = episodes.length - sicknessCount;
    const mixed = sicknessCount > 0 && injuryCount > 0;
    signals.push({
      family: "sickness_injury",
      publicLabel: "hurts and sickness keep taking working hands",
      severity: care,
      confidence: mixed ? 0.5 : 0.68,
      interpretation: sicknessCount >= injuryCount
        ? "something taken in — water or food — keeps sickening the camp"
        : "untended hurts worsen until they lay people up",
      competingInterpretation: sicknessCount >= injuryCount
        ? "untended hurts worsen until they lay people up"
        : "something taken in — water or food — keeps sickening the camp",
      ambiguity: mixed ? 0.55 : 0.25,
      evidenceRefs: ["episodes:recent", "care_burden"],
      origin: "lived",
    });
  }

  const measure = deriveMeasureCondition(band);
  if (measure > 0) {
    signals.push({
      family: "journey_misjudgment",
      publicLabel: "journeys and loads keep coming out short of the reckoning",
      severity: measure,
      confidence: 0.6,
      interpretation: "what is carried is not being matched against the days it must last",
      ambiguity: 0.2,
      evidenceRefs: ["movement:staged_legs", "movement:shuttle_division"],
      origin: "opportunity",
    });
  }

  const engineering = deriveEngineeringCondition(band);
  if (engineering > 0) {
    signals.push({
      family: "crossing_blocked",
      publicLabel: "the water route blocks the band's way",
      severity: engineering,
      confidence: 0.7,
      interpretation: "the crossing needs something that floats and holds a load",
      ambiguity: 0.2,
      evidenceRefs: ["movement:watercraft_assessment"],
      origin: "lived",
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Relief derivation — the REAL effects. Read by the seasonal travel plan and
// the residential-move hardship derivation. O(1) over bounded state.
// ---------------------------------------------------------------------------

export interface PracticalReliefResult {
  readonly relief: number;
  readonly cap: number;
  readonly active: boolean;
  readonly responseId?: string;
  readonly variantKey?: string;
  readonly reason: string;
}

const NO_RELIEF: PracticalReliefResult = {
  relief: 0,
  cap: 0,
  active: false,
  reason: "no matching practical response",
};

function reliefFromResponse(
  response: PracticalResponseState | undefined,
  fragments: readonly PracticalFragment[],
  currentTick: number,
): PracticalReliefResult {
  if (response === undefined) {
    return NO_RELIEF;
  }
  const spec = VARIANT_SPECS.find(
    (entry) => entry.family === response.family && entry.variantKey === response.variantKey,
  );
  if (spec === undefined) {
    return NO_RELIEF;
  }
  if (response.status === "abandoned") {
    return { ...NO_RELIEF, responseId: response.id, reason: "response abandoned after repeated failure" };
  }
  if (response.status === "dormant") {
    return { ...NO_RELIEF, responseId: response.id, reason: "response dormant — its condition has not recurred" };
  }
  const { basis } = variantBasis(spec, fragments, currentTick);
  if (basis < spec.basisFloor) {
    return {
      ...NO_RELIEF,
      responseId: response.id,
      reason: `material/technique basis faded below ${spec.basisFloor} — practice cannot operate`,
    };
  }
  // Forming responses PROBE with a small relief (the first real attempts);
  // active responses scale with earned confidence. Never the full constraint.
  const relief = response.status === "forming"
    ? round2(spec.reliefCap * 0.25)
    : round2(Math.min(spec.reliefCap, spec.reliefCap * (0.35 + 0.65 * response.confidence)));
  return {
    relief,
    cap: spec.reliefCap,
    active: relief >= RELIEF_ACTIVE_FLOOR,
    responseId: response.id,
    variantKey: response.variantKey,
    reason: response.status === "forming" ? "forming response — probe-level relief" : "active practiced response",
  };
}

function currentResponse(
  band: Band,
  family: PracticalResponseFamily,
): PracticalResponseState | undefined {
  const responses = band.practicalAdaptation?.responses ?? [];
  // Deterministic: prefer the non-abandoned response with the highest
  // confidence; ties by id.
  return [...responses]
    .filter((response) => response.family === family)
    .sort((left, right) =>
      (right.status === "abandoned" ? -1 : right.confidence) - (left.status === "abandoned" ? -1 : left.confidence) ||
      left.id.localeCompare(right.id))[0];
}

export function deriveCarryingRelief(band: Band, currentTick: number): PracticalReliefResult {
  return reliefFromResponse(
    currentResponse(band, "carrying_load"),
    band.practicalAdaptation?.fragments ?? [],
    currentTick,
  );
}

export function deriveDryRouteWaterRelief(
  band: Band,
  currentTick: number,
  destinationKnownWatered: boolean | undefined,
): PracticalReliefResult {
  const base = reliefFromResponse(
    currentResponse(band, "dry_route_water"),
    band.practicalAdaptation?.fragments ?? [],
    currentTick,
  );
  if (!base.active) {
    return base;
  }
  // Strict context matching: staging between known water points can only help
  // a journey whose scored destination is a remembered watered place.
  if (destinationKnownWatered !== true) {
    return {
      ...base,
      relief: 0,
      active: false,
      reason: "no remembered watered destination on this journey — practice does not apply",
    };
  }
  return base;
}

export function deriveEngineeringSafetyRelief(
  band: Band,
  currentTick: number,
  crossingContextKey: string | undefined,
): PracticalReliefResult {
  const response = currentResponse(band, "engineering_structure");
  const base = reliefFromResponse(response, band.practicalAdaptation?.fragments ?? [], currentTick);
  if (!base.active || response === undefined) return base;
  if (crossingContextKey === undefined) {
    return { ...base, relief: 0, active: false, reason: "no known crossing context for the engineering response" };
  }
  const required = (band.practicalAdaptation?.fragments ?? []).filter((fragment) =>
    response.requiredFragmentIds.includes(fragment.id));
  const locallyGrounded = required.filter((fragment) =>
    (fragment.contextKeys ?? []).includes(crossingContextKey) ||
    (fragment.contextKeys ?? []).includes("known_crossing")).length;
  if (locallyGrounded < Math.min(2, response.requiredFragmentIds.length)) {
    return { ...base, relief: 0, active: false, reason: "components were learned in another crossing context" };
  }
  return base;
}

// ---------------------------------------------------------------------------
// INVENTION-3 relief derivations — the real effect interfaces consumed by the
// travel plan (carried water), bodyCampLogistics (shelter/exposure),
// intraSeasonTrips (hunting danger), acuteRisk (care) and pressure
// (waterworks yield). All O(1) over bounded band state.
// ---------------------------------------------------------------------------

function specFor(response: PracticalResponseState | undefined): VariantSpec | undefined {
  if (response === undefined) {
    return undefined;
  }
  return VARIANT_SPECS.find(
    (entry) => entry.family === response.family && entry.variantKey === response.variantKey,
  );
}

/** Aggregate carrying burden the band's standing shelter structures add to a
 * residential move (heavier structures travel with the camp). Real tradeoff:
 * paid on the SAME carry-constraint input the carrying relief eases. */
export function deriveShelterPortabilityBurden(band: Band): number {
  const response = currentResponse(band, "temporary_shelter");
  if (response === undefined || (response.status !== "active" && response.status !== "forming")) {
    return 0;
  }
  return round2(Math.min(SHELTER_PORTABILITY_BURDEN_CAP, specFor(response)?.portabilityBurden ?? 0));
}

/** Provisioning accuracy 0.75..1 — how much of what is carried actually
 * covers the journey. Without any counting/pacing practice, part of the
 * carried water is under-filled, mis-divided, or wasted. */
export function deriveProvisioningAccuracy(band: Band, currentTick: number): number {
  const response = currentResponse(band, "proto_measure");
  const relief = reliefFromResponse(response, band.practicalAdaptation?.fragments ?? [], currentTick);
  if (!relief.active || response === undefined) {
    return PROVISIONING_ACCURACY_BASE;
  }
  return round2(Math.min(1, PROVISIONING_ACCURACY_BASE +
    (1 - PROVISIONING_ACCURACY_BASE) * (relief.relief / Math.max(0.01, relief.cap))));
}

export interface CarriedWaterReliefResult extends PracticalReliefResult {
  // Share of carried water lost before it helps (variant leakage, heat-worn).
  readonly leakage: number;
  // Provisioning accuracy multiplier actually applied (proto_measure effect).
  readonly provisioningAccuracy: number;
  // Deterministic seal-crack exposure this journey (sealed variants in heat).
  readonly heatCrackRisk: number;
  readonly sealCracked: boolean;
  readonly capacity: number;
  readonly carryingBurden: number;
  readonly routeDurationSteps: number;
  readonly consumedShare: number;
  readonly measurementResponseId?: string;
}

const NO_CARRIED_WATER: CarriedWaterReliefResult = {
  relief: 0,
  cap: 0,
  active: false,
  reason: "no practiced water-carrying response",
  leakage: 0,
  provisioningAccuracy: PROVISIONING_ACCURACY_BASE,
  heatCrackRisk: 0,
  sealCracked: false,
  capacity: 0,
  carryingBurden: 0,
  routeDurationSteps: 0,
  consumedShare: 0,
};

/** Carried-water relief on a journey's water limiter. Unlike dry-route
 * staging it needs no remembered watered destination — the band brings its
 * water — but leakage, provisioning error and heat always eat part of it. */
export function deriveCarriedWaterRelief(
  band: Band,
  currentTick: number,
  options?: { readonly heatContext?: boolean; readonly routeDurationSteps?: number; readonly familiarRoute?: boolean },
): CarriedWaterReliefResult {
  const response = currentResponse(band, "water_storage");
  const base = reliefFromResponse(response, band.practicalAdaptation?.fragments ?? [], currentTick);
  if (!base.active || response === undefined) {
    return { ...NO_CARRIED_WATER, responseId: base.responseId, reason: base.reason };
  }
  const spec = specFor(response);
  const heat = options?.heatContext === true;
  const routeDurationSteps = Math.max(1, Math.min(8, Math.round(options?.routeDurationSteps ?? 2)));
  const baseLeakage = spec?.leakage ?? 0.35;
  // Longer routes expose more seams; heat wears every vessel and unsealed
  // weaves suffer the most.
  const durationLeakage = Math.max(0, routeDurationSteps - 2) * 0.035;
  const leakageBeforeCrack = clamp01(baseLeakage * (heat ? baseLeakage > 0.2 ? 1.4 : 1.15 : 1) + durationLeakage);
  const measurement = currentResponse(band, "proto_measure");
  const measurementContextMatched = measurement?.variantKey !== "journey_pacing_reckoning" || options?.familiarRoute === true;
  const provisioningAccuracy = measurementContextMatched
    ? deriveProvisioningAccuracy(band, currentTick)
    : PROVISIONING_ACCURACY_BASE;
  // Sealed coatings can crack in hard heat — exposure surfaces here; the
  // journey efficacy decides deterministically whether it cracked.
  const heatCrackRisk = heat && (spec?.leakage ?? 1) <= 0.2 ? 0.35 : 0;
  const sealCracked = heatCrackRisk > 0 && deterministicRoll(
    `seal-crack:${String(band.id)}:${response.id}:${currentTick}`,
  ) < heatCrackRisk;
  const leakage = sealCracked ? 1 : leakageBeforeCrack;
  const capacity = spec?.waterCapacity ?? 0.16;
  const relief = sealCracked ? 0 : round2(clamp01(base.relief * capacity / 0.26 * (1 - leakage) * provisioningAccuracy));
  const measurementRelief = reliefFromResponse(measurement, band.practicalAdaptation?.fragments ?? [], currentTick);
  return {
    ...base,
    relief,
    // A cracked carrier was still an actual attempted use and must return
    // dangerous feedback even though its physical relief fell to zero.
    active: base.active,
    leakage: round2(leakage),
    provisioningAccuracy,
    heatCrackRisk,
    sealCracked,
    capacity: round2(capacity),
    carryingBurden: round2((spec?.carryingBurden ?? 0.04) * Math.max(0.5, provisioningAccuracy)),
    routeDurationSteps,
    consumedShare: round2(Math.min(1, routeDurationSteps / 6)),
    ...(measurementRelief.active && measurementContextMatched && measurement !== undefined ? { measurementResponseId: measurement.id } : {}),
    reason: sealCracked
      ? "the cooled gum seal cracked in the route heat and the carrier emptied"
      : relief >= RELIEF_ACTIVE_FLOOR
      ? `carried water covers part of the dry stages (leakage ${Math.round(leakage * 100)}%, reckoning ${Math.round(provisioningAccuracy * 100)}%)`
      : "carried water loses too much to leakage and misreckoning to matter",
  };
}

/** Effective aggregate storage/carrying capacity, recomputed from current
 * causal practice rather than frozen from a spawn technology tag. */
export function deriveEffectiveStorageCapacity(band: Band, currentTick: number): number {
  const carried = deriveCarriedWaterRelief(band, currentTick, { routeDurationSteps: 1 });
  return round2(Math.min(0.42, 0.16 + (carried.active ? carried.capacity * (1 - carried.leakage) * 0.65 : 0)));
}

export interface ShelterReliefResult extends PracticalReliefResult {
  readonly matchedKinds: readonly string[];
  readonly portabilityBurden: number;
}

/** Shelter relief against the exposure kinds actually present. A structure
 * built for another weather is honest dead weight (context mismatch). */
export function deriveShelterExposureRelief(
  band: Band,
  currentTick: number,
  presentKinds: readonly ("heat" | "cold" | "wet" | "wind")[],
): ShelterReliefResult {
  const response = currentResponse(band, "temporary_shelter");
  const base = reliefFromResponse(response, band.practicalAdaptation?.fragments ?? [], currentTick);
  const empty: ShelterReliefResult = { ...base, relief: 0, active: false, matchedKinds: [], portabilityBurden: 0 };
  if (!base.active || response === undefined) {
    return empty;
  }
  const spec = specFor(response);
  const matched = (spec?.exposureKinds ?? []).filter((kind) => presentKinds.includes(kind));
  if (matched.length === 0) {
    return {
      ...empty,
      responseId: response.id,
      portabilityBurden: spec?.portabilityBurden ?? 0,
      reason: `the ${spec?.publicLabel ?? "shelter"} does not answer this season's exposure (${presentKinds.join("/") || "mild"})`,
    };
  }
  return {
    ...base,
    matchedKinds: matched,
    portabilityBurden: spec?.portabilityBurden ?? 0,
    reason: `practiced shelter against ${matched.join("/")}`,
  };
}

/** Hunting danger relief paid on the band's hunting-trip traces. The snare
 * variant trades approach danger for line labor and a small return shift. */
export interface HuntingReliefResult extends PracticalReliefResult {
  readonly isTrapLine: boolean;
  readonly returnShift: number;
  readonly laborShift: number;
  readonly attempted: boolean;
  readonly contextMatched: boolean;
  readonly materialFailed: boolean;
}

export function deriveHuntingSafetyRelief(
  band: Band,
  currentTick: number,
  context?: { readonly faunaKind: string; readonly habitat: string },
): HuntingReliefResult {
  const response = currentResponse(band, "hunting_distance");
  const base = reliefFromResponse(response, band.practicalAdaptation?.fragments ?? [], currentTick);
  const isTrapLine = response?.variantKey === "tensioned_snare_line";
  if (!base.active || response === undefined) {
    return { ...base, relief: 0, active: false, isTrapLine: false, returnShift: 0, laborShift: 0, attempted: false, contextMatched: false, materialFailed: false };
  }
  const kind = context?.faunaKind ?? "unknown";
  const habitat = context?.habitat ?? "unknown";
  const contextMatched = isTrapLine
    ? kind === "small_game" || kind === "forest_edge_game" || kind === "upland_game"
    : response.variantKey === "thrown_reach_hunting"
      ? kind !== "small_game" && kind !== "waterfowl" && habitat !== "dense_cover"
      : kind !== "waterfowl";
  const harshSealContext = response.variantKey === "hafted_point_hunting" &&
    ((band.bodyCampLogistics?.campExposure?.heat ?? 0) >= 0.45 || (band.bodyCampLogistics?.campExposure?.wet ?? 0) >= 0.45);
  const materialFailed = contextMatched && harshSealContext && deterministicRoll(
    `haft-failure:${String(band.id)}:${response.id}:${currentTick}:${kind}:${habitat}`,
  ) < 0.28;
  const working = contextMatched && !materialFailed;
  return {
    ...base,
    relief: working ? base.relief : 0,
    active: true,
    isTrapLine,
    // A working snare line takes game without close approach: small return
    // bump, real labor cost. Distance weapons shift neither.
    returnShift: working ? round2(base.relief * (isTrapLine ? 0.25 : 0.12)) : 0,
    laborShift: isTrapLine ? 0.08 : 0.04,
    attempted: true,
    contextMatched,
    materialFailed,
    reason: materialFailed
      ? "the gum-set haft loosened in heat or damp before the strike"
      : contextMatched
        ? base.reason
        : "the prepared method did not fit this prey or cover",
  };
}

export interface CareTreatmentResult extends PracticalReliefResult {
  readonly attempted: boolean;
  readonly matched: boolean;
  readonly harmful: boolean;
  readonly treatmentBurden: number;
}

/** Care attempt against a specific episode cause group. Mismatched treatment
 * earns nothing; uncertain plant preparation can physically worsen an episode. */
export function deriveCareTreatmentRelief(
  band: Band,
  currentTick: number,
  causeGroup: "injury" | "sickness",
): CareTreatmentResult {
  const response = currentResponse(band, "care_treatment");
  const base = reliefFromResponse(response, band.practicalAdaptation?.fragments ?? [], currentTick);
  if (!base.active || response === undefined) {
    return { ...base, relief: 0, active: false, attempted: false, matched: false, harmful: false, treatmentBurden: 0 };
  }
  const spec = specFor(response);
  const matched = (spec?.careKinds ?? []).includes(causeGroup);
  if (!matched) {
    return {
      ...base,
      relief: 0,
      active: true,
      attempted: true,
      matched: false,
      harmful: false,
      treatmentBurden: round2(spec?.laborCost ?? 0.08),
      reason: `the practiced ${spec?.publicLabel ?? "care"} does not answer ${causeGroup === "injury" ? "hurts" : "sickness"}`,
    };
  }
  const plantPreparation = response.variantKey === "plant_poultice_care";
  const harmful = plantPreparation && deterministicRoll(
    `care-preparation:${String(band.id)}:${response.id}:${currentTick}:${causeGroup}`,
  ) < Math.max(0.08, 0.28 - response.confidence * 0.18);
  return {
    ...base,
    relief: harmful ? 0 : base.relief,
    active: true,
    attempted: true,
    matched: true,
    harmful,
    treatmentBurden: round2(spec?.laborCost ?? 0.1),
    reason: harmful
      ? "the prepared plant irritated or poisoned the treated person"
      : base.reason,
  };
}

/** Bounded water-stress relief from the band's own built waterworks — only at
 * the tile they were dug, only while they still yield this season. */
export function deriveWaterWorksRelief(
  band: Band,
  tileId: Band["position"],
  season: string,
): { readonly relief: number; readonly active: boolean; readonly status?: string; readonly reason: string } {
  const works = band.practicalAdaptation?.waterWorks;
  if (works === undefined || works.tileId !== tileId) {
    return { relief: 0, active: false, reason: "no built waterworks at this camp" };
  }
  if (works.status === "dry_hole" || works.status === "contaminated_seep" || works.status === "collapsed" || works.status === "abandoned" || works.status === "digging") {
    return { relief: 0, active: false, status: works.status, reason: `waterworks ${works.status.replace("_", " ")}` };
  }
  // Seasonal seeps fail in the dry heat; a lined shallow well holds through it.
  const seasonalFactor = works.status === "seasonal_seep" && season === "summer" ? 0
    : works.status === "damp_seep" && season === "summer" ? 0.4
      : 1;
  const relief = round2(Math.min(WATERWORKS_YIELD_CAP, works.yieldLevel * seasonalFactor));
  return {
    relief,
    active: relief >= RELIEF_ACTIVE_FLOOR,
    status: works.status,
    reason: relief >= RELIEF_ACTIVE_FLOOR
      ? `${works.status.replace("_", " ")} yields water at this camp`
      : `the ${works.status.replace("_", " ")} gives nothing back this season`,
  };
}

// ---------------------------------------------------------------------------
// Advance — one call per applied band decision.
// ---------------------------------------------------------------------------

export interface PracticalAdaptationAdvanceInput {
  readonly band: Band; // pre-decision band (holds prior state)
  readonly currentTick: TickNumber;
  readonly moved: boolean;
  readonly residentialMoveDistance: number;
  readonly crossedThisSeason: boolean;
  readonly latestMoveEvent?: ResidentialMoveEvent;
  // Response-specific efficacy evaluations for THIS season's decision
  // (adaptiveEfficacy.ts); absent when the response was not exercised.
  readonly carryingEfficacy?: EfficacyEvaluation;
  readonly waterRouteEfficacy?: EfficacyEvaluation;
  readonly engineeringEfficacy?: EfficacyEvaluation;
  // INVENTION-3 (all optional — absent inputs preserve pre-pass behavior):
  readonly waterStorageEfficacy?: EfficacyEvaluation;
  readonly shelterEfficacy?: EfficacyEvaluation;
  readonly huntingEfficacy?: EfficacyEvaluation;
  readonly careEfficacy?: EfficacyEvaluation;
  readonly measureEfficacy?: EfficacyEvaluation;
  readonly groundwaterEfficacy?: EfficacyEvaluation;
  // Observable residence context (surface cues) + ground truth for the
  // waterworks physical outcome only.
  readonly residenceContext?: FragmentResidenceContext;
  readonly groundwaterContext?: GroundwaterContext;
}

function applyEfficacyToResponse(
  response: PracticalResponseState,
  efficacy: EfficacyEvaluation,
  currentTick: TickNumber,
): PracticalResponseState {
  switch (efficacy.classification) {
    case "clear_success_specific":
      return {
        ...response,
        status: "active",
        confidence: round2(Math.min(0.9, response.confidence + 0.12)),
        successCount: response.successCount + 1,
        lastActiveTick: currentTick,
        lastEfficacy: efficacy.classification,
      };
    case "partial_success_specific":
      return {
        ...response,
        status: "active",
        confidence: round2(Math.min(0.9, response.confidence + 0.04)),
        partialCount: response.partialCount + 1,
        lastActiveTick: currentTick,
        lastEfficacy: efficacy.classification,
      };
    case "failure_or_danger_specific":
      return {
        ...response,
        confidence: round2(Math.max(0, response.confidence - 0.15)),
        failureCount: response.failureCount + 1,
        lastActiveTick: currentTick,
        lastEfficacy: efficacy.classification,
      };
    case "context_mismatch":
      return {
        ...response,
        confidence: round2(Math.max(0, response.confidence - 0.05)),
        failureCount: response.failureCount + 1,
        lastActiveTick: currentTick,
        lastEfficacy: efficacy.classification,
      };
    default:
      // low/no feedback, mismatch, irrelevant: caution preserved, no credit.
      return { ...response, lastActiveTick: currentTick, lastEfficacy: efficacy.classification };
  }
}

interface FamilyLifecycleResult {
  readonly responses: readonly PracticalResponseState[];
  // Responses abandoned THIS tick (revision + experiment conclusion sources).
  readonly freshlyAbandoned: readonly PracticalResponseState[];
  // Responses matured forming→active THIS tick (experiment success).
  readonly matured: readonly PracticalResponseState[];
}

// Lifecycle only (efficacy application, maturation, dormancy, abandonment).
// Formation is problem-driven: see formResponsesThroughProblems below.
function advanceFamilyLifecycle(
  family: PracticalResponseFamily,
  prior: readonly PracticalResponseState[],
  band: Band,
  currentTick: TickNumber,
  efficacy: EfficacyEvaluation | undefined,
): FamilyLifecycleResult {
  const tick = Number(currentTick);
  const condition = conditionFor(family, band);

  let familyResponses = prior.filter((response) => response.family === family);
  const others = prior.filter((response) => response.family !== family);
  const matured: PracticalResponseState[] = [];

  // (1) Apply this season's response-specific efficacy to the response that
  // was actually exercised (matched by responseId).
  if (efficacy !== undefined) {
    familyResponses = familyResponses.map((response) => {
      if (!efficacy.responseActive || response.id !== efficacyResponseId(efficacy)) {
        return response;
      }
      const advanced = applyEfficacyToResponse(response, efficacy, currentTick);
      if (response.status === "forming" && advanced.status === "active") {
        matured.push(advanced);
      }
      return advanced;
    });
  }

  // (2) Lifecycle transitions.
  familyResponses = familyResponses.map((response) => {
    if (response.status === "abandoned") {
      return response;
    }
    // Abandonment: repeated failure with no earned confidence.
    if (response.failureCount >= ABANDON_FAILURES && response.confidence < 0.25) {
      return { ...response, status: "abandoned" as PracticalResponseStatus };
    }
    if (condition >= CONDITION_FLOOR) {
      // A forming response is the selected experiment. Persistence alone is
      // never success: only response-specific efficacy above can mature it.
      if (response.status === "dormant") {
        // The condition returned: the response wakes, keeping its old evidence.
        return { ...response, status: "active" as PracticalResponseStatus, lastActiveTick: currentTick };
      }
      return { ...response, lastActiveTick: currentTick };
    }
    // Condition absent: an unused response goes dormant (not deleted).
    if (response.status === "active" && tick - Number(response.lastActiveTick) >= DORMANT_AFTER_TICKS) {
      return { ...response, status: "dormant" as PracticalResponseStatus };
    }
    return response;
  });

  const freshlyAbandoned = familyResponses.filter(
    (response) => response.status === "abandoned" && Number(response.lastActiveTick) === tick,
  );

  return { responses: [...others, ...familyResponses], freshlyAbandoned, matured };
}

// ---------------------------------------------------------------------------
// INVENTION-3 — problem-driven formation. Every new response forms THROUGH
// the canonical chain: an active problem frame, an idea selected among
// recorded alternatives, and a started experiment (the forming response's
// real practice). A misread frame selects a weaker-fitting mechanism.
// ---------------------------------------------------------------------------

const FAMILY_ORDER: readonly PracticalResponseFamily[] = [
  "carrying_load",
  "dry_route_water",
  "water_storage",
  "engineering_structure",
  "groundwater_seek",
  "temporary_shelter",
  "hunting_distance",
  "care_treatment",
  "proto_measure",
];

function baseThresholdForProblem(problem: PracticalProblemFamily): number {
  // Staging toward remembered water keeps its accepted lower gate; carrying
  // water and everything else keeps the 0.3 base.
  return problem === "water_route_shortage" ? 0.22 : 0.3;
}

function ideaSourceForBasis(
  fragments: readonly PracticalFragment[],
  fragmentIds: readonly string[],
  basis: number,
  isFirstConsideration: boolean,
): PracticalIdeaCandidate["source"] {
  const used = fragments.filter((fragment) => fragmentIds.includes(fragment.id));
  if (used.some((fragment) => fragment.evidenceRefs.some((ref) => ref.startsWith("accidental:")))) {
    return "accident";
  }
  if (used.some((fragment) => fragment.basis === "inherited")) {
    return "inherited";
  }
  if (used.some((fragment) => fragment.basis === "copied")) {
    return "copied";
  }
  void basis;
  void isFirstConsideration;
  return "local_inference";
}

interface FormationResult {
  readonly responses: readonly PracticalResponseState[];
  readonly ideas: readonly PracticalIdeaCandidate[];
  readonly startedExperiments: readonly PracticalExperiment[];
}

function formResponsesThroughProblems(input: {
  readonly band: Band;
  readonly frames: readonly PracticalProblemFrame[];
  readonly responses: readonly PracticalResponseState[];
  readonly fragments: readonly PracticalFragment[];
  readonly freshlyAbandonedByFamily: ReadonlyMap<PracticalResponseFamily, PracticalResponseState>;
  readonly currentTick: TickNumber;
}): FormationResult {
  const tick = Number(input.currentTick);
  const tendencies = deriveBandTendencies(input.band);
  let responses = input.responses;
  const ideas: PracticalIdeaCandidate[] = [];
  const startedExperiments: PracticalExperiment[] = [];

  for (const frame of input.frames) {
    if (frame.status !== "active" && frame.status !== "revised") {
      continue;
    }
    const mappedFamilies = PROBLEM_TO_FAMILIES.get(frame.family) ?? [];
    // Families of this problem that have no live response yet, in stable order.
    const openFamilies = FAMILY_ORDER.filter((family) =>
      mappedFamilies.includes(family) &&
      !responses.some((response) => response.family === family && response.status !== "abandoned"));
    if (openFamilies.length === 0) {
      continue;
    }
    const threshold = baseThresholdForProblem(frame.family) *
      (1 - tendencies.routineReliance * 0.15) * (1 + tendencies.attachment * 0.15);
    if (frame.severity < Math.max(CONDITION_FLOOR, threshold)) {
      continue;
    }

    // Bounded idea options: family-indexed variant specs, fragment-filtered.
    const options: IdeaOption[] = [];
    for (const family of openFamilies) {
      const blockedKeys = responses
        .filter((response) =>
          response.family === family &&
          response.status === "abandoned" &&
          tick - Number(response.lastActiveTick) < REDISCOVERY_BLOCK_TICKS)
        .map((response) => response.variantKey);
      for (const spec of (VARIANTS_BY_FAMILY.get(family) ?? []).slice(0, RAW_VARIANT_CANDIDATE_CAP)) {
        if (blockedKeys.includes(spec.variantKey)) {
          continue;
        }
        const { basis, fragmentIds } = variantBasis(spec, input.fragments, tick);
        if (fragmentIds.length === 0) {
          continue; // no material/technique foothold at all
        }
        options.push({
          family,
          variantKey: spec.variantKey,
          publicLabel: spec.publicLabel,
          mechanismBelief: spec.mechanismBelief ?? spec.contextNote,
          basisFragmentIds: fragmentIds,
          basisScore: basis,
          basisFloor: spec.basisFloor,
          costNote: spec.costNote ?? "more labor for the same help",
          source: ideaSourceForBasis(input.fragments, fragmentIds, basis,
            !responses.some((response) => response.family === family)),
        });
      }
    }
    if (options.length === 0) {
      continue;
    }

    const selection = selectIdeaForProblem({
      frame,
      options: options.slice(0, RAW_VARIANT_CANDIDATE_CAP),
      currentTick: input.currentTick,
    });
    ideas.push(...selection.ideas.slice(0, TOP_VARIANT_CANDIDATE_CAP + 1));
    const selected = selection.selected;
    if (selected === undefined) {
      continue;
    }
    const spec = VARIANT_SPECS.find((entry) =>
      entry.family === selected.family && entry.variantKey === selected.variantKey);
    if (spec === undefined) {
      continue;
    }

    const revisedFrom = input.freshlyAbandonedByFamily.get(selected.family);
    // Direct discovery: a strong fragment basis at formation starts more
    // confident (observations aligned); a thin basis starts weak.
    const responseId = `practical-response:${String(input.band.id)}:${selected.family}:${selected.variantKey}:${tick}`;
    const response: PracticalResponseState = {
      id: responseId,
      family: selected.family,
      variantKey: selected.variantKey,
      publicLabel: spec.publicLabel,
      status: "forming",
      confidence: selected.source === "accident" ? 0.38 : 0.3,
      successCount: 0,
      partialCount: 0,
      failureCount: 0,
      formedAtTick: input.currentTick,
      lastActiveTick: input.currentTick,
      requiredFragmentIds: selected.basisFragmentIds,
      contextNote: spec.contextNote,
      problemId: frame.id,
      ideaId: selected.id,
      experimentId: `experiment:${responseId}`,
      ...(revisedFrom !== undefined ? { revisionOf: revisedFrom.id } : {}),
    };
    responses = [...responses, response];
    startedExperiments.push(startExperiment({
      idea: selected,
      responseId,
      expectedEffect: PRACTICAL_RESPONSE_REGISTRY.find((entry) => entry.family === selected.family)?.effectTarget
        ?? "a bounded practical coefficient",
      materials: spec.materials ?? spec.requiredSubjects.map((subject) => subject.replace(/_/g, " ")),
      procedure: spec.procedure ?? `assemble and test ${spec.publicLabel} under the problem's current conditions`,
      laborCost: spec.laborCost ?? Math.min(0.2, 0.05 + spec.requiredSubjects.length * 0.035),
      riskCost: spec.riskCost ?? Math.min(0.28, 0.04 + spec.requiredSubjects.length * 0.04),
      opportunityCost: spec.costNote ?? "working hands leave other subsistence tasks while the test is made",
      observationBasis: selected.source === "accident" ? "direct" : "inferred",
      contextKey: frame.contextKey,
      currentTick: input.currentTick,
    }));
  }

  return { responses, ideas, startedExperiments };
}

// ---------------------------------------------------------------------------
// INVENTION-3 — waterworks physics. The band digs on its READING (cues); the
// OUTCOME comes from the ground truth the decision path passes in. The band
// never sees seepPotential — only what its digging finds.
// ---------------------------------------------------------------------------

export interface GroundwaterContext {
  readonly tileId: Band["position"];
  readonly surfaceWaterAccess: number;
  readonly droughtRisk: number;
  readonly isFloodplainOrValley: boolean;
  readonly season: string;
}

interface WaterWorksAdvanceResult {
  readonly works?: PracticalWaterWorks;
  readonly digOutcome?: DigOutcomeSignal;
  readonly attempted: boolean;
  readonly outcomeNote?: string;
}

const WATERWORKS_UNMAINTAINED_ABANDON_TICKS = 4;

function advanceWaterWorks(input: {
  readonly band: Band;
  readonly prior: PracticalWaterWorks | undefined;
  readonly responses: readonly PracticalResponseState[];
  readonly context: GroundwaterContext | undefined;
  readonly currentTick: TickNumber;
}): WaterWorksAdvanceResult {
  const tick = Number(input.currentTick);
  const response = input.responses.find((entry) =>
    entry.family === "groundwater_seek" && entry.status !== "abandoned" && entry.status !== "dormant");
  let prior = input.prior;

  // No context (fixtures/older callers): carry prior state unchanged.
  if (input.context === undefined) {
    return { works: prior, attempted: false };
  }
  const context = input.context;

  // Works left behind: unmaintained ground silts and slumps.
  if (prior !== undefined && prior.tileId !== context.tileId) {
    if (response === undefined) {
      if (tick - Number(prior.lastMaintainedTick) >= WATERWORKS_UNMAINTAINED_ABANDON_TICKS) {
        return { works: { ...prior, status: "abandoned", yieldLevel: 0, lastLaborCost: 0, outcomeNote: "left unmaintained; the works silted in" }, attempted: false };
      }
      return { works: { ...prior, lastLaborCost: 0 }, attempted: false };
    }
    // One aggregate work record per mobile band: once a new local test starts,
    // the left-behind work remains physically at its old tile but is no longer
    // maintained or behaviorally available to this band.
    prior = undefined;
  }

  if (response === undefined) {
    // Maintained only by an alive practice; otherwise it decays in place.
    if (prior !== undefined && tick - Number(prior.lastMaintainedTick) >= WATERWORKS_UNMAINTAINED_ABANDON_TICKS &&
      prior.status !== "abandoned") {
      return { works: { ...prior, status: "abandoned", yieldLevel: 0, lastLaborCost: 0, outcomeNote: "the practice lapsed; the works silted in" }, attempted: false };
    }
    return { works: prior === undefined ? undefined : { ...prior, lastLaborCost: 0 }, attempted: false };
  }

  const lined = response.variantKey === "lined_seep_pit";
  // HIDDEN truth — used only to resolve the physical outcome, never exposed
  // to the band's knowledge or reliefs.
  const seepPotential = clamp01(
    context.surfaceWaterAccess * 0.55 +
      (context.isFloodplainOrValley ? 0.25 : 0) -
      context.droughtRisk * 0.2 +
      0.05,
  );

  // First attempt or restart after failure at this tile.
  if (prior === undefined || prior.tileId !== context.tileId ||
    prior.status === "dry_hole" || prior.status === "contaminated_seep" || prior.status === "collapsed" || prior.status === "abandoned") {
    return {
      works: {
        tileId: context.tileId,
        status: "digging",
        responseId: response.id,
        yieldLevel: 0,
        digSeasons: 1,
        laborPaid: 0.1,
        lastLaborCost: 0.1,
        builtAtTick: input.currentTick,
        lastMaintainedTick: input.currentTick,
        outcomeNote: "scraping where the ground reads damp",
      },
      attempted: true,
    };
  }

  const rollSeed = `dig:${String(input.band.id)}:${String(context.tileId)}:${Number(prior.builtAtTick)}:${prior.digSeasons}`;
  const roll = deterministicRoll(rollSeed);
  const contaminationRoll = deterministicRoll(`${rollSeed}:water-quality`);

  if (prior.status === "digging") {
    // The scrape either finds damp ground or it does not.
    if (roll < seepPotential * 0.6) {
      if (contaminationRoll < 0.12 + (context.isFloodplainOrValley ? 0.12 : 0) + context.surfaceWaterAccess * 0.08) {
        const works: PracticalWaterWorks = {
          ...prior,
          status: "contaminated_seep",
          yieldLevel: 0,
          digSeasons: prior.digSeasons + 1,
          laborPaid: round2(Math.min(1, prior.laborPaid + 0.1)),
          lastLaborCost: 0.1,
          lastMaintainedTick: input.currentTick,
          outcomeNote: "the seep filled, but the water smelled foul and sickness followed",
        };
        return { works, digOutcome: { outcome: "contaminated_seep", lined, tileId: String(context.tileId) }, attempted: true };
      }
      const works: PracticalWaterWorks = {
        ...prior,
        status: "damp_seep",
        yieldLevel: 0.07,
        digSeasons: prior.digSeasons + 1,
        laborPaid: round2(Math.min(1, prior.laborPaid + 0.1)),
        lastLaborCost: 0.1,
        lastMaintainedTick: input.currentTick,
        outcomeNote: "the scrape holds damp water by morning",
      };
      return { works, digOutcome: { outcome: "damp_seep", lined, tileId: String(context.tileId) }, attempted: true };
    }
    if (prior.digSeasons >= 2) {
      const works: PracticalWaterWorks = {
        ...prior,
        status: "dry_hole",
        yieldLevel: 0,
        digSeasons: prior.digSeasons + 1,
        laborPaid: round2(Math.min(1, prior.laborPaid + 0.1)),
        lastLaborCost: 0.1,
        lastMaintainedTick: input.currentTick,
        outcomeNote: "two seasons of digging found only dry ground",
      };
      return { works, digOutcome: { outcome: "dry_hole", lined, tileId: String(context.tileId) }, attempted: true };
    }
    return {
      works: {
        ...prior,
        digSeasons: prior.digSeasons + 1,
        laborPaid: round2(Math.min(1, prior.laborPaid + 0.1)),
        lastMaintainedTick: input.currentTick,
      },
      attempted: true,
    };
  }

  // Deepening/maintenance of an existing seep. Unsupported walls can slump.
  if (prior.status === "damp_seep" || prior.status === "seasonal_seep") {
    const collapseRisk = lined ? 0.08 : 0.3 + context.droughtRisk * 0.15;
    if (roll < collapseRisk) {
      const works: PracticalWaterWorks = {
        ...prior,
        status: "collapsed",
        yieldLevel: 0,
        digSeasons: prior.digSeasons + 1,
        laborPaid: round2(Math.min(1, prior.laborPaid + 0.12)),
        lastLaborCost: 0.12,
        lastMaintainedTick: input.currentTick,
        outcomeNote: lined ? "even the lined walls slumped in" : "the unsupported walls slumped in",
      };
      return { works, digOutcome: { outcome: "collapsed", lined, tileId: String(context.tileId) }, attempted: true };
    }
    if (prior.status === "damp_seep" && roll < collapseRisk + seepPotential * 0.7) {
      const works: PracticalWaterWorks = {
        ...prior,
        status: "seasonal_seep",
        yieldLevel: 0.1,
        digSeasons: prior.digSeasons + 1,
        laborPaid: round2(Math.min(1, prior.laborPaid + 0.1)),
        lastLaborCost: 0.1,
        lastMaintainedTick: input.currentTick,
        outcomeNote: "the deepened seep refills except in the dry heat",
      };
      return { works, digOutcome: { outcome: "seasonal_seep", lined, tileId: String(context.tileId) }, attempted: true };
    }
    if (prior.status === "seasonal_seep" && lined && roll < collapseRisk + seepPotential * 0.6) {
      const works: PracticalWaterWorks = {
        ...prior,
        status: "shallow_well",
        yieldLevel: 0.14,
        digSeasons: prior.digSeasons + 1,
        laborPaid: round2(Math.min(1, prior.laborPaid + 0.12)),
        lastLaborCost: 0.12,
        lastMaintainedTick: input.currentTick,
        outcomeNote: "lined and deepened to water that holds through the seasons",
      };
      return { works, digOutcome: { outcome: "shallow_well", lined, tileId: String(context.tileId) }, attempted: true };
    }
    return {
      works: { ...prior, lastMaintainedTick: input.currentTick, lastLaborCost: 0.03 },
      attempted: true,
    };
  }

  // Standing well/seep: maintained while the practice lives.
  return {
    works: { ...prior, lastMaintainedTick: input.currentTick, lastLaborCost: 0.02 },
    attempted: false,
  };
}

function efficacyResponseId(efficacy: EfficacyEvaluation): string | undefined {
  return efficacy.responseId;
}

function buildPracticalRecord(
  band: Band,
  currentTick: TickNumber,
  efficacy: EfficacyEvaluation,
  priorResponses: readonly PracticalResponseState[],
  nextResponses: readonly PracticalResponseState[],
): AdaptiveEfficacyRecord {
  const responseId = efficacyResponseId(efficacy) ?? "unformed";
  const prior = priorResponses.find((response) => response.id === responseId);
  const next = nextResponses.find((response) => response.id === responseId);
  const confidenceDelta = round2((next?.confidence ?? 0) - (prior?.confidence ?? 0));
  const failureDelta = (next?.failureCount ?? 0) - (prior?.failureCount ?? 0);
  return {
    id: `practical-efficacy:${String(band.id)}:${String(currentTick)}:${efficacy.family}`,
    tick: currentTick,
    responseId,
    family: efficacy.family,
    classification: efficacy.classification,
    outcome: efficacy.outcome,
    contextKey: efficacy.contextKey,
    responseActive: efficacy.responseActive,
    coefficient: efficacy.coefficient,
    preEffectValue: efficacy.preEffectValue,
    effectAmount: efficacy.effectAmount,
    effectCap: efficacy.effectCap,
    dangerDelta: efficacy.dangerDelta,
    practiceDelta: efficacy.practiceDelta,
    confidenceDelta,
    failureDelta,
    futureInfluenceChanged: Math.abs(confidenceDelta) > 0.001 || (next?.status !== prior?.status),
    localityNote: efficacy.localityNote,
    reason: efficacy.reason,
  };
}

export function advancePracticalAdaptation(
  input: PracticalAdaptationAdvanceInput,
): PracticalAdaptationState {
  const prior = input.band.practicalAdaptation;
  const tick = Number(input.currentTick);

  // (0) Waterworks physics FIRST: this season's dig outcome is itself
  // fragment evidence (pit support) and groundwater efficacy evidence.
  const waterWorksResult = advanceWaterWorks({
    band: input.band,
    prior: prior?.waterWorks,
    responses: prior?.responses ?? [],
    context: input.groundwaterContext,
    currentTick: input.currentTick,
  });

  // (1) Learned fragments from this season's lived evidence.
  const signals = deriveFragmentSignals({
    band: input.band,
    moved: input.moved,
    residentialMoveDistance: input.residentialMoveDistance,
    crossedThisSeason: input.crossedThisSeason,
    latestMoveEvent: input.latestMoveEvent,
    residenceContext: input.residenceContext,
    digOutcome: waterWorksResult.digOutcome,
  });
  let fragments = advancePracticalFragments(prior?.fragments ?? [], signals, input.currentTick);

  // Groundwater efficacy is produced by the dig itself (the physical outcome
  // is only known here); an explicitly passed evaluation (fixtures) wins.
  const groundwaterEfficacy = input.groundwaterEfficacy ?? evaluateGroundwaterEfficacy({
    responseId: waterWorksResult.works?.responseId,
    attempted: waterWorksResult.attempted,
    outcome: waterWorksResult.digOutcome?.outcome,
    yieldLevel: waterWorksResult.works?.yieldLevel ?? 0,
    laborPaid: waterWorksResult.works?.lastLaborCost ?? 0,
    laterWaterStressRelief: waterWorksResult.works === undefined
      ? 0
      : deriveWaterWorksRelief(input.band, input.band.position, input.groundwaterContext?.season ?? "").relief,
  });

  // (2) Response lifecycle per family (efficacy application, maturation,
  // dormancy, abandonment) — formation happens later, through problems.
  const efficacies: readonly (readonly [PracticalResponseFamily, EfficacyEvaluation | undefined])[] = [
    ["carrying_load", input.carryingEfficacy],
    ["dry_route_water", input.waterRouteEfficacy],
    ["engineering_structure", input.engineeringEfficacy],
    ["water_storage", input.waterStorageEfficacy],
    ["temporary_shelter", input.shelterEfficacy],
    ["hunting_distance", input.huntingEfficacy],
    ["care_treatment", input.careEfficacy],
    ["proto_measure", input.measureEfficacy],
    ["groundwater_seek", groundwaterEfficacy],
  ];
  let responses = prior?.responses ?? [];
  const priorResponses = responses;
  const freshlyAbandonedByFamily = new Map<PracticalResponseFamily, PracticalResponseState>();
  const maturedResponses: PracticalResponseState[] = [];
  for (const [family, efficacy] of efficacies) {
    const lifecycle = advanceFamilyLifecycle(family, responses, input.band, input.currentTick, efficacy);
    responses = lifecycle.responses;
    if (lifecycle.freshlyAbandoned[0] !== undefined) {
      freshlyAbandonedByFamily.set(family, lifecycle.freshlyAbandoned[0]);
    }
    maturedResponses.push(...lifecycle.matured);
  }

  // (3) Problem frames from the same lived condition evidence, with the
  // revision/resolution feedback this season's efficacy produced.
  const problemSignals = deriveProblemSignals(input.band);
  const reviseProblemIds: string[] = [];
  const resolveProblemIds: string[] = [];
  for (const [, efficacy] of efficacies) {
    if (efficacy === undefined) {
      continue;
    }
    const exercised = priorResponses.find((response) => response.id === efficacyResponseId(efficacy));
    if (exercised?.problemId === undefined) {
      continue;
    }
    const exercisedAfter = responses.find((response) => response.id === efficacyResponseId(efficacy));
    if ((efficacy.classification === "failure_or_danger_specific" || efficacy.classification === "context_mismatch") &&
      (exercisedAfter?.failureCount ?? 0) >= 2) {
      reviseProblemIds.push(exercised.problemId);
    }
    if (efficacy.classification === "clear_success_specific") {
      resolveProblemIds.push(exercised.problemId);
    }
  }
  const problems = advanceProblemFrames({
    bandId: String(input.band.id),
    prior: prior?.problems ?? [],
    signals: problemSignals,
    currentTick: input.currentTick,
    reviseProblemIds,
    resolveProblemIds,
  });

  // (4) Formation THROUGH the chain: active problem → recorded idea
  // candidates → selected idea → new forming response + started experiment.
  const formation = formResponsesThroughProblems({
    band: input.band,
    frames: problems,
    responses,
    fragments,
    freshlyAbandonedByFamily,
    currentTick: input.currentTick,
  });
  responses = formation.responses;

  // Bounded: deterministic eviction keeps the most alive/confident responses.
  responses = [...responses]
    .sort((left, right) => {
      const rank = (response: PracticalResponseState): number =>
        response.status === "abandoned" ? response.confidence - 1 : response.confidence;
      return rank(right) - rank(left) || left.id.localeCompare(right.id);
    })
    .slice(0, RESPONSE_CAP);

  // (5) Experiments: attempts accrue while their response forms; maturation
  // concludes success; failure efficacy and abandonment conclude failure.
  const experimentEvents: ExperimentAdvanceEvent[] = [];
  for (const matured of maturedResponses) {
    const observed = efficacies.find(([, efficacy]) =>
      efficacy !== undefined && efficacyResponseId(efficacy) === matured.id)?.[1];
    experimentEvents.push({
      responseId: matured.id,
      attempted: true,
      conclusion: matured.lastEfficacy === "partial_success_specific" ? "partial" : "success",
      observedOutcome: observed?.reason ?? "the practice produced response-specific useful feedback and stayed in use",
      fragmentsLearned: matured.requiredFragmentIds,
    });
  }
  for (const [family, efficacy] of efficacies) {
    if (efficacy === undefined) {
      continue;
    }
    const responseId = efficacyResponseId(efficacy);
    if (responseId === undefined || maturedResponses.some((entry) => entry.id === responseId)) {
      continue;
    }
    const abandoned = freshlyAbandonedByFamily.get(family);
    if (abandoned !== undefined && abandoned.id === responseId) {
      experimentEvents.push({
        responseId,
        attempted: true,
        conclusion: "abandoned",
        observedOutcome: efficacy.reason,
        fragmentsContradicted: abandoned.requiredFragmentIds,
      });
      continue;
    }
    experimentEvents.push({
      responseId,
      attempted: true,
      // A single bad attempt is evidence, not a concluded invention history.
      // The experiment remains underway until success/partial maturation or
      // repeated failure causes abandonment above.
      conclusion: undefined,
      observedOutcome: efficacy.reason,
      ...(efficacy.classification === "failure_or_danger_specific"
        ? { fragmentsContradicted: priorResponses.find((entry) => entry.id === responseId)?.requiredFragmentIds ?? [] }
        : {}),
    });
  }
  const experiments = advanceExperiments(
    prior?.experiments ?? [],
    experimentEvents,
    formation.startedExperiments,
    input.currentTick,
  );

  // (6) Idea records (bounded newest-per-variant history).
  const ideas = mergeIdeas(prior?.ideas ?? [], formation.ideas);

  // (7) Failures propagate to the fragments the failed composition relied on.
  const records: AdaptiveEfficacyRecord[] = [];
  for (const [, efficacy] of efficacies) {
    if (efficacy === undefined) {
      continue;
    }
    records.push(buildPracticalRecord(input.band, input.currentTick, efficacy, priorResponses, responses));
    if (efficacy.classification === "failure_or_danger_specific") {
      const failed = responses.find((response) => response.id === efficacyResponseId(efficacy));
      fragments = recordFragmentFailure(fragments, failed?.requiredFragmentIds ?? []);
    } else if (efficacy.classification === "clear_success_specific" || efficacy.classification === "partial_success_specific") {
      const succeeded = responses.find((response) => response.id === efficacyResponseId(efficacy));
      fragments = recordFragmentSuccess(
        fragments,
        succeeded?.requiredFragmentIds ?? [],
        input.currentTick,
        `experiment:${efficacy.family}:${efficacy.classification}`,
        efficacy.classification === "partial_success_specific",
      );
    }
  }

  const efficacyRecords = [...records, ...(prior?.efficacyRecords ?? [])].slice(0, PRACTICAL_RECORD_CAP);

  return {
    bandId: input.band.id,
    lastUpdatedTick: input.currentTick,
    fragments,
    responses,
    efficacyRecords,
    problems,
    ideas,
    experiments,
    ...(waterWorksResult.works !== undefined ? { waterWorks: waterWorksResult.works } : {}),
    caps: {
      fragmentCap: FRAGMENT_CAP,
      responseCap: RESPONSE_CAP,
      recordCap: PRACTICAL_RECORD_CAP,
      problemCap: PROBLEM_CAP,
      ideaCap: IDEA_CAP,
      experimentCap: EXPERIMENT_CAP,
      held:
        fragments.length <= FRAGMENT_CAP &&
        responses.length <= RESPONSE_CAP &&
        efficacyRecords.length <= PRACTICAL_RECORD_CAP &&
        problems.length <= PROBLEM_CAP &&
        ideas.length <= IDEA_CAP &&
        experiments.length <= EXPERIMENT_CAP,
    },
  };
}

/** Daughters inherit weakened fragments and at most one inherited problem
 * framing — responses, ideas, experiments and waterworks must be re-formed
 * and re-proven locally (no inherited competence; the well stays with the
 * ground and the parent). */
export function inheritPracticalAdaptationForDaughter(
  parentState: PracticalAdaptationState | undefined,
  daughterBandId: Band["id"],
  currentTick: TickNumber,
): PracticalAdaptationState | undefined {
  if (parentState === undefined) {
    return undefined;
  }
  const fragments = inheritFragmentsForDaughter(parentState.fragments, currentTick);
  if (fragments.length === 0) {
    return undefined;
  }
  return {
    bandId: daughterBandId,
    lastUpdatedTick: currentTick,
    fragments,
    responses: [],
    efficacyRecords: [],
    problems: inheritProblemFramesForDaughter(parentState.problems ?? [], String(daughterBandId), currentTick),
    ideas: [],
    experiments: [],
    caps: {
      fragmentCap: FRAGMENT_CAP,
      responseCap: RESPONSE_CAP,
      recordCap: PRACTICAL_RECORD_CAP,
      problemCap: PROBLEM_CAP,
      ideaCap: IDEA_CAP,
      experimentCap: EXPERIMENT_CAP,
      held: true,
    },
  };
}
