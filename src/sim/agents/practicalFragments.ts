// ENVIRONMENT-READING PRACTICAL ADAPTATION / INVENTION-1 — learned fragments.
//
// A PRACTICAL FRAGMENT is a small piece of lived practical knowledge — a
// material property, a technique, or a place/route reading — earned from
// evidence the band ALREADY persists (repetition affordances, movement and
// crossing history, its own place memory). Fragments are the compositional
// primitives of invention: responses (practicalResponses.ts) require specific
// fragments, so what a band can attempt depends on what it has actually lived
// through and handled, not on a technology list.
//
// PROPERTIES: bounded (FRAGMENT_CAP, deterministic eviction), perishable
// (strength decays when the reinforcing evidence disappears — same staleness
// family as crossingPractice), fallible (failures from response efficacy
// weaken the fragment), partially inheritable (daughters receive weakened
// "inherited" copies that must be re-proven), and anti-omniscient (every
// source below is band-known evidence, never world truth). Fragment labels
// explain state; they never create behavior by themselves.
//
// Source discipline: the fragment families implemented here (cordage/binding
// handling, staged load movement, staged crossing experience, camp-ground
// reading, watered-route reading) are conservative, low-tech practices that
// are uncontroversial in the hunter-gatherer ethnographic and experimental-
// archaeology literature (e.g. cordage/basketry handling, logistical load
// staging, water-point-to-water-point travel in arid-zone mobility studies).
// Coupling is kept weak and capped.
//
// Purity: deterministic, no unseeded randomness, no `any`, no UI imports.

import type { TickNumber } from "../core/types";
import type {
  Band,
  PracticalFragment,
  PracticalFragmentBasis,
  PracticalFragmentDomain,
  ResidentialMoveEvent,
} from "./types";
import { deterministicRoll } from "./inventionChain";

export const FRAGMENT_CAP = 10;
const EVIDENCE_REF_CAP = 3;
const SEASONS_PER_YEAR = 4;
// Reinforcement/decay tuning: a fragment reinforced this season gains
// REINFORCE_GAIN; an unreinforced fragment keeps full strength for
// FULL_STRENGTH_YEARS after its last reinforcement, then fades to zero over
// FADE_YEARS more (forgetting is part of learning).
const REINFORCE_GAIN = 0.12;
const FULL_STRENGTH_YEARS = 2;
const FADE_YEARS = 6;
const SIGNAL_FLOOR = 0.25;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function fragmentStaleness(currentTick: number, lastReinforcedTick: number): number {
  const years = Math.max(0, currentTick - lastReinforcedTick) / SEASONS_PER_YEAR;
  return clamp01(1 - Math.max(0, years - FULL_STRENGTH_YEARS) / FADE_YEARS);
}

/** Effective (staleness-discounted, failure-discounted) strength of a fragment. */
export function effectiveFragmentStrength(fragment: PracticalFragment, currentTick: number): number {
  const failureDiscount = clamp01(1 - fragment.failureCount * 0.15);
  const inheritedDiscount = fragment.basis === "lived" ? 1 : 0.7;
  return round2(
    fragment.strength *
      fragmentStaleness(currentTick, Number(fragment.lastReinforcedTick)) *
      failureDiscount *
      inheritedDiscount,
  );
}

export function findFragment(
  fragments: readonly PracticalFragment[],
  subject: string,
): PracticalFragment | undefined {
  return fragments.find((fragment) => fragment.subject === subject);
}

export interface FragmentSignal {
  readonly domain: PracticalFragmentDomain;
  readonly subject: string;
  readonly property: string;
  readonly publicLabel: string;
  // 0..1 evidence signal THIS season; ≥ SIGNAL_FLOOR reinforces the fragment.
  readonly signal: number;
  readonly evidenceRef: string;
  readonly contextKey: string;
  readonly inferred?: boolean;
}

// INVENTION-3 — observable residence-tile context the decision path passes in
// (surface cues only: what a band standing there can see; never the hidden
// aquifer/outcome truth, which stays inside the waterworks physical outcome).
export interface FragmentResidenceContext {
  readonly tileId: string;
  readonly droughtRisk: number;
  readonly isWoodedContext: boolean;
  // Visible surface-water cue: damp ground / green margin / animal trails to
  // water (derived from observable tile surface, not aquifer truth).
  readonly dampGroundCue: boolean;
  readonly season: string;
}

// INVENTION-3 — the realized outcome of this season's dig attempt (waterworks
// physical result), fed back as structural learning evidence.
export interface DigOutcomeSignal {
  readonly outcome: "dry_hole" | "damp_seep" | "contaminated_seep" | "seasonal_seep" | "shallow_well" | "collapsed";
  readonly lined: boolean;
  readonly tileId: string;
}

function affordanceSignal(band: Band, domain: string): number {
  const items = band.foragingAdaptation?.repetitionAffordances ?? [];
  let best = 0;
  for (const item of items) {
    if (item.domain !== domain) {
      continue;
    }
    // A registry/repetition entry is only familiarity. It becomes fragment
    // evidence only after several actual attempts with useful or explicitly
    // context-bound feedback; dead ends, negative feedback and reinforced bad
    // habits do not magically teach the claimed material property.
    if (
      item.repeatedExposureCount < 3 ||
      item.repeatedAttemptSignal < 2 ||
      (item.feedbackQuality !== "useful_feedback" && item.feedbackQuality !== "context_bound_feedback") ||
      item.deadEndRisk === "dead_end_attempt" ||
      item.deadEndRisk === "reinforced_bad_habit" ||
      item.deadEndRisk === "false_confidence_risk"
    ) {
      continue;
    }
    const value = clamp01(
      Math.min(1, item.repeatedExposureCount / 8) * 0.55 +
        Math.min(1, item.repeatedAttemptSignal / 6) * 0.35 +
        (item.feedbackQuality === "useful_feedback" ? 0.1 : 0.04),
    );
    if (value > best) {
      best = value;
    }
  }
  return best;
}

// Count of the band's OWN remembered places with confirmed decent water
// (band-known lastKnownWaterStress, never a truth scan) — the evidence behind
// "this route holds water at known points".
function wateredPlaceSignal(band: Band): { readonly signal: number; readonly count: number } {
  let count = 0;
  for (const record of Object.values(band.placeMemory)) {
    if ((record.lastKnownWaterStress ?? 1) <= 0.35 && record.visitCount >= 2) {
      count += 1;
    }
  }
  return { signal: clamp01(count / 4), count };
}

/**
 * Derive this season's fragment evidence signals from state the band already
 * persists. All O(bounded-memory); no world scans, no new derivations.
 */
export function deriveFragmentSignals(input: {
  readonly band: Band;
  readonly moved: boolean;
  readonly residentialMoveDistance: number;
  readonly crossedThisSeason: boolean;
  readonly latestMoveEvent?: ResidentialMoveEvent;
  // INVENTION-3 (all optional — absent inputs simply yield no new-domain
  // signals; older callers/fixtures keep their exact prior behavior):
  readonly residenceContext?: FragmentResidenceContext;
  readonly digOutcome?: DigOutcomeSignal;
}): readonly FragmentSignal[] {
  const { band } = input;
  const signals: FragmentSignal[] = [];

  const fiber = affordanceSignal(band, "fiber_handling");
  if (fiber > 0) {
    signals.push({
      domain: "material_property",
      subject: "fiber_cordage",
      property: "holds_tension_when_dry",
      publicLabel: "worked plant fiber holds a carrying tension",
      signal: fiber,
      evidenceRef: "repetition:fiber_handling",
      contextKey: String(band.position),
    });
  }

  const binding = affordanceSignal(band, "material_handling");
  if (binding > 0) {
    signals.push({
      domain: "material_property",
      subject: "load_binding",
      property: "binds_and_carries_load",
      publicLabel: "bound material carries weight without spilling",
      signal: binding,
      evidenceRef: "repetition:material_handling",
      contextKey: String(band.position),
    });
  }

  // Lived staged travel: a completed multi-tile residential leg is direct
  // experience that loads can move in stages.
  if (
    input.moved && input.residentialMoveDistance >= 3 &&
    ((input.latestMoveEvent?.hardshipRisk ?? 0) >= 0.28 ||
      (input.latestMoveEvent?.temporaryWatercraft?.shuttleTrips ?? 0) >= 2)
  ) {
    signals.push({
      domain: "technique",
      subject: "load_staging",
      property: "staged_loads_ease_burdened_travel",
      publicLabel: "moving camp in stages eases the carried burden",
      signal: 0.48,
      evidenceRef: "movement:staged_residential_leg",
      contextKey: `${String(input.latestMoveEvent?.fromTileId ?? band.position)}->${String(input.latestMoveEvent?.toTileId ?? band.position)}`,
    });
  }

  // Lived crossings under load: real crossing use (crossing memory was
  // written this season) teaches that burdens can cross in stages.
  if (input.crossedThisSeason && Object.values(band.crossingMemories).some((memory) => memory.useCount >= 2)) {
    signals.push({
      domain: "technique",
      subject: "staged_crossing",
      property: "burdens_cross_in_stages",
      publicLabel: "loads and dependents can cross a ford in stages",
      signal: 0.5,
      evidenceRef: "movement:crossing_used",
      contextKey: "known_crossing",
    });
  }

  const campGround = affordanceSignal(band, "camp_setup");
  if (campGround > 0) {
    signals.push({
      domain: "place_route",
      subject: "camp_ground_reading",
      property: "some_ground_sleeps_drier",
      publicLabel: "repeated camp setup teaches which ground sleeps drier",
      signal: campGround,
      evidenceRef: "repetition:camp_setup",
      contextKey: String(band.position),
    });
  }

  const watered = wateredPlaceSignal(band);
  if (watered.count >= 2) {
    signals.push({
      domain: "place_route",
      subject: "watered_route_reading",
      property: "route_holds_water_at_known_points",
      publicLabel: `travel can be staged between ${watered.count} remembered watered place(s)`,
      signal: watered.signal,
      evidenceRef: "place_memory:confirmed_water_points",
      contextKey: "remembered_water_route",
      inferred: true,
    });
  }

  // Complex engineering fragments arise from an ACTUAL bounded crossing
  // assessment/experiment, not from the existence of a craft registry entry.
  // Even a partial or failed experiment can teach a component while also
  // contradicting another component later through response-specific failure.
  const craft = input.latestMoveEvent?.temporaryWatercraft;
  if (craft?.considered === true && craft.bestOption !== undefined) {
    const experimentSignal = craft.result === "crossing_success" ? 0.82 :
      craft.result === "crossing_partial_success" ? 0.64 :
      craft.result === "crossing_delayed_materials" ? 0.48 : 0.3;
    const crossingContext = `${craft.sourceRiverId ?? "water"}:${String(craft.sourceTileId ?? band.position)}->${String(craft.targetTileId ?? band.position)}`;
    signals.push({
      domain: "material_property",
      subject: "buoyancy_under_load",
      property: "bundled_material_can_float_a_load",
      publicLabel: "a tested bundle can carry some load on this water",
      signal: experimentSignal * Math.max(0.4, craft.materialConfidence),
      evidenceRef: `watercraft:${craft.result}:buoyancy`,
      contextKey: crossingContext,
      inferred: craft.result !== "crossing_success",
    });
    if (craft.materialBasis.some((basis) => basis.includes("fiber") || basis.includes("lashing"))) {
      signals.push({
        domain: "technique",
        subject: "binding_under_load",
        property: "lashings_hold_or_fail_under_crossing_load",
        publicLabel: "lashings can be tested under a moving water load",
        signal: experimentSignal * 0.9,
        evidenceRef: `watercraft:${craft.result}:binding`,
        contextKey: crossingContext,
        inferred: craft.result !== "crossing_success",
      });
    }
    if (craft.shuttleTrips >= 2) {
      signals.push({
        domain: "structure",
        subject: "load_distribution",
        property: "spread_load_across_bundles_or_frame",
        publicLabel: "spreading and shuttling loads changes stability",
        signal: experimentSignal * 0.84,
        evidenceRef: `watercraft:${craft.result}:load_distribution`,
        contextKey: crossingContext,
        inferred: craft.result !== "crossing_success",
      });
      signals.push({
        domain: "technique",
        subject: "staged_shuttle_crossing",
        property: "cross_people_and_loads_in_ordered_shuttles",
        publicLabel: "people and loads can be sequenced across in shuttles",
        signal: experimentSignal * 0.88,
        evidenceRef: `watercraft:${craft.result}:sequence`,
        contextKey: crossingContext,
        inferred: craft.result !== "crossing_success",
      });
    }
  }

  // -------------------------------------------------------------------------
  // INVENTION-3 signals. Every source below is state the band already
  // persists (its own trips, episodes, weather memories, animal knowledge,
  // fire use) or an OBSERVABLE surface cue passed by the decision path.
  // -------------------------------------------------------------------------

  const trips = band.recentIntraSeasonTrips ?? [];
  const waterTrips = trips.filter((trip) => trip.taskGroupType === "water_group").length;
  const waterHardshipMoves = (band.recentResidentialMoveEvents ?? []).filter((event) =>
    (event.hardshipReason ?? "").includes("water")).length;
  const huntingTrips = trips.filter((trip) => trip.taskGroupType === "hunting_group");
  const fire = band.bodyCampLogistics?.fire;
  const weatherMemories = band.bodyCampLogistics?.weatherMemories ?? [];
  const context = input.residenceContext;
  const livedWaterStress = band.pressureState?.waterStress ?? 0;

  // Container holding: repeated water-fetching work plus real fiber/binding
  // practice teaches that made containers hold water between places.
  const fiberOrBinding = Math.max(fiber, binding);
  if ((waterTrips >= 2 && fiberOrBinding > 0) || waterHardshipMoves >= 1 || livedWaterStress >= 0.55) {
    signals.push({
      domain: "technique",
      subject: "container_holding",
      property: "worked_container_can_be_tested_with_water",
      publicLabel: waterHardshipMoves > 0 || livedWaterStress >= 0.55
        ? "water shortage showed how a filled lining held or leaked"
        : "worked containers may hold water long enough to test on a carry",
      signal: clamp01(0.3 + Math.min(waterTrips, 6) * 0.04 + fiberOrBinding * 0.2 + Math.min(0.12, waterHardshipMoves * 0.06) + Math.max(0, livedWaterStress - 0.4) * 0.3),
      evidenceRef: waterHardshipMoves > 0
        ? "movement:carried_water_shortfall"
        : livedWaterStress >= 0.55
          ? "camp:water_shortage_fill_test"
          : "trips:water_group_repeated",
      contextKey: String(band.position),
    });
  }

  // A water-short camp can test an already handled flexible lining without
  // first knowing weaving or sealing. This is a small material foothold for a
  // leaky membrane bag, not a storage unlock; the later physical carry decides
  // whether the fold, plug and binding actually hold.
  if (livedWaterStress >= 0.55) {
    signals.push({
      domain: "technique",
      subject: "membrane_folding",
      property: "folded_flexible_lining_can_hold_a_small_fill",
      publicLabel: "a folded flexible lining can be filled and watched for leaks",
      signal: clamp01(0.35 + livedWaterStress * 0.16),
      evidenceRef: "camp:water_shortage_membrane_test",
      contextKey: String(band.position),
    });
  }

  // Seal coating (compound material): regular fire use + handled material in
  // a wooded country where gums/resins are gatherable. The property carries
  // its own failure mode — heated coatings crack under later heat.
  const fireSignal = Math.max(fire?.warmthValue ?? 0, fire?.usefulness ?? 0);
  if (context?.isWoodedContext === true && fireSignal >= 0.3 && binding > 0) {
    const accidentalObservation = deterministicRoll(
      `gum-on-binding:${String(band.id)}:${String(context.tileId)}:${Number(band.bodyCampLogistics?.lastUpdatedTick ?? 0)}`,
    ) < 0.18;
    signals.push({
      domain: "material_property",
      subject: "seal_coating",
      property: "heated_gum_coats_and_seals_but_cracks_in_heat",
      publicLabel: "heated tree gum can coat and seal a seam, though heat can crack it",
      signal: clamp01(0.26 + fireSignal * 0.2 + binding * 0.18),
      evidenceRef: accidentalObservation ? "accidental:heated_gum_on_binding" : "fire+material:wooded_country",
      contextKey: `wooded:${String(band.position)}`,
      inferred: !accidentalObservation,
    });
  }

  // Groundwater reading (uncertain inference): visible damp-ground cues, or
  // remembered animal water-seeking routines, in dry country. The band forms
  // an IDEA about hidden water; only digging tests it.
  const animalWaterRecords = (band.animalPatternKnowledge?.records ?? []).filter(
    (record) => record.patterns.includes("water_seeking") && record.confidence >= 0.35 &&
      record.state !== "contradicted" && record.state !== "dormant",
  ).length;
  if (context !== undefined && context.droughtRisk >= 0.35 && (context.dampGroundCue || animalWaterRecords > 0)) {
    signals.push({
      domain: "place_route",
      subject: "groundwater_reading",
      property: "some_ground_may_hold_water_beneath",
      publicLabel: context.dampGroundCue
        ? "damp ground and green margins hint at water beneath"
        : "animal water habits hint at water hidden in this country",
      signal: clamp01(0.28 + (context.dampGroundCue ? 0.14 : 0) + Math.min(animalWaterRecords, 3) * 0.08),
      evidenceRef: context.dampGroundCue ? "surface:damp_ground_cue" : "animal_knowledge:water_seeking",
      contextKey: context.tileId,
      inferred: true,
    });
  }

  // Pit support (structural learning from real digging): collapse teaches the
  // need for support the hard way; a held lined pit reinforces it.
  if (input.digOutcome !== undefined) {
    const dig = input.digOutcome;
    const taught = dig.outcome === "collapsed" || (dig.lined && dig.outcome !== "dry_hole");
    if (taught) {
      signals.push({
        domain: "structure",
        subject: "pit_support",
        property: "dug_walls_hold_only_when_supported",
        publicLabel: dig.outcome === "collapsed"
          ? "a collapsed pit taught that dug walls need support"
          : "a lined pit held where bare walls would slump",
        signal: dig.outcome === "collapsed" ? 0.42 : 0.5,
        evidenceRef: `dig:${dig.outcome}`,
        contextKey: dig.tileId,
        inferred: dig.outcome === "collapsed",
      });
    }
  }

  // Cover layering: repeated camp setup plus lived wet-weather memories.
  const wetMemory = weatherMemories
    .filter((memory) => memory.kind === "wet_travel" || memory.kind === "floodplain_wetland")
    .reduce((max, memory) => Math.max(max, memory.strength), 0);
  if (campGround > 0 && wetMemory >= 0.3) {
    signals.push({
      domain: "technique",
      subject: "cover_layering",
      property: "layered_cover_sheds_rain_and_wind",
      publicLabel: "layered brush and cover shed rain better than open bedding",
      signal: clamp01(0.26 + campGround * 0.25 + wetMemory * 0.2),
      evidenceRef: "camp_setup+wet_weather_memory",
      contextKey: String(band.position),
    });
  }

  // Frame shaping: handled structural material in wooded country plus real
  // camp practice — poles and frames can be shaped and braced.
  if (context?.isWoodedContext === true && binding > 0 && campGround > 0) {
    signals.push({
      domain: "structure",
      subject: "frame_shaping",
      property: "shaped_poles_brace_a_standing_frame",
      publicLabel: "shaped poles can brace a standing camp frame",
      signal: clamp01(0.24 + binding * 0.25 + campGround * 0.2),
      evidenceRef: "material+camp_setup:wooded_country",
      contextKey: `wooded:${String(band.position)}`,
    });
  }

  // Shaft truing: repeated hunting trips (including failures — close calls
  // teach the need for reach) plus handled material.
  if (huntingTrips.length >= 2 && binding > 0) {
    const dangerous = huntingTrips.some((trip) =>
      trip.animalActivityTrace?.dangerClass === "high" || trip.animalActivityTrace?.dangerClass === "moderate");
    signals.push({
      domain: "technique",
      subject: "shaft_truing",
      property: "trued_shafts_fly_and_strike_straighter",
      publicLabel: "straightened shafts strike more truly at reach",
      signal: clamp01(0.26 + Math.min(huntingTrips.length, 5) * 0.05 + (dangerous ? 0.1 : 0)),
      evidenceRef: "trips:hunting_repeated",
      contextKey: String(band.position),
      inferred: true,
    });
  }

  // Tension release (recombination): fiber practice + an existing binding
  // fragment + hunting exposure — a held line can be made to release.
  const bindingFragment = findFragment(input.band.practicalAdaptation?.fragments ?? [], "load_binding");
  if (huntingTrips.length >= 1 && fiber > 0 && bindingFragment !== undefined) {
    signals.push({
      domain: "technique",
      subject: "tension_release",
      property: "held_tension_can_release_on_a_trigger",
      publicLabel: "a bound line under tension can be set to release",
      signal: clamp01(0.24 + fiber * 0.22 + Math.min(huntingTrips.length, 4) * 0.04),
      evidenceRef: "recombination:binding+hunting",
      contextKey: String(band.position),
      inferred: true,
    });
  }

  // Wound care: injuries and sickness actually lived through, with real care
  // burden carried — repeated tending is where treatment knowledge starts.
  const episodes = band.acuteRisk?.recentEpisodes ?? [];
  const careBurden = band.bodyCampLogistics?.careTravelBurden?.sickCareBurden ?? 0;
  if (episodes.length >= 2) {
    signals.push({
      domain: "technique",
      subject: "wound_care",
      property: "cleaning_and_binding_changes_a_hurt",
      publicLabel: "cleaning and binding a hurt gives a repeatable care test",
      signal: clamp01(0.26 + Math.min(episodes.length, 5) * 0.05 + careBurden * 0.2),
      evidenceRef: "acute_episodes:lived_care",
      contextKey: String(band.position),
      inferred: true,
    });
  }

  // Plant preparation: repeated processing work with useful feedback.
  const processing = affordanceSignal(band, "food_processing");
  if (processing > 0 && episodes.length >= 1) {
    signals.push({
      domain: "material_property",
      subject: "plant_preparation",
      property: "prepared_plants_can_change_hurts_or_sickness",
      publicLabel: "prepared plants can be tested against hurts or sickness",
      signal: clamp01(0.24 + processing * 0.3),
      evidenceRef: "repetition:food_processing+episodes",
      contextKey: String(band.position),
      inferred: true,
    });
  }

  // One-to-one counting (abstract pattern): dividing people and loads across
  // shuttle trips, or repeated task parties, is lived one-to-one matching.
  const shuttleTrips = input.latestMoveEvent?.temporaryWatercraft?.shuttleTrips ?? 0;
  if (shuttleTrips >= 2 || trips.length >= 3 || waterHardshipMoves >= 1) {
    signals.push({
      domain: "abstract_pattern",
      subject: "one_to_one_count",
      property: "loads_and_people_match_marks_one_to_one",
      publicLabel: "loads and people can be matched against marks, one for one",
      signal: clamp01(0.24 + (shuttleTrips >= 2 ? 0.16 : 0) + Math.min(trips.length, 6) * 0.03 + Math.min(0.12, waterHardshipMoves * 0.06)),
      evidenceRef: shuttleTrips >= 2
        ? "movement:shuttle_load_division"
        : waterHardshipMoves > 0
          ? "movement:water_allocation_shortfall"
          : "trips:repeated_task_parties",
      contextKey: String(band.position),
      inferred: true,
    });
  }

  // Journey pacing (abstract pattern): repeated staged residential legs teach
  // journeys measured in day-stages.
  const stagedLegs = (band.recentResidentialMoveEvents ?? []).filter(
    (event) => (event.distanceTiles ?? 0) >= 2).length;
  if (stagedLegs >= 2) {
    signals.push({
      domain: "abstract_pattern",
      subject: "journey_pacing",
      property: "journeys_split_into_recallable_day_stages",
      publicLabel: "long journeys can be reckoned in remembered day-stages",
      signal: clamp01(0.26 + Math.min(stagedLegs, 4) * 0.07),
      evidenceRef: "movement:repeated_staged_legs",
      contextKey: "staged_travel",
      inferred: true,
    });
  }

  return signals;
}

/**
 * Advance the fragment list one season: reinforce fragments whose evidence
 * signal is present, create new ones (basis "lived"), and let unreinforced
 * fragments fade via staleness at READ time (state keeps last-reinforced tick;
 * nothing is deleted until the cap forces deterministic eviction).
 */
export function advancePracticalFragments(
  prior: readonly PracticalFragment[],
  signals: readonly FragmentSignal[],
  currentTick: TickNumber,
): readonly PracticalFragment[] {
  const byId = new Map<string, PracticalFragment>(prior.map((fragment) => [fragment.id, fragment]));

  for (const signal of signals) {
    if (signal.signal < SIGNAL_FLOOR) {
      continue;
    }
    const id = `fragment:${signal.domain}:${signal.subject}`;
    const existing = byId.get(id);
    if (existing === undefined) {
      byId.set(id, {
        id,
        domain: signal.domain,
        subject: signal.subject,
        property: signal.property,
        publicLabel: signal.publicLabel,
        basis: "lived",
        strength: round2(Math.min(1, 0.2 + signal.signal * REINFORCE_GAIN)),
        failureCount: 0,
        lastReinforcedTick: currentTick,
        evidenceRefs: [signal.evidenceRef],
        knowledgeState: signal.inferred === true ? "tentative" : "partial",
        observationCount: 1,
        contradictionCount: 0,
        contextKeys: [signal.contextKey],
      });
    } else {
      byId.set(id, {
        ...existing,
        // Re-proving an inherited/copied fragment locally converts it to lived.
        basis: "lived",
        publicLabel: signal.publicLabel,
        strength: round2(Math.min(1, existing.strength + signal.signal * REINFORCE_GAIN)),
        lastReinforcedTick: currentTick,
        evidenceRefs: [signal.evidenceRef, ...existing.evidenceRefs.filter((ref) => ref !== signal.evidenceRef)]
          .slice(0, EVIDENCE_REF_CAP),
        knowledgeState: signal.inferred === true && (existing.observationCount ?? 0) < 2
          ? "tentative"
          : effectiveFragmentStrength(existing, Number(currentTick)) >= 0.62
            ? "confident"
            : "partial",
        observationCount: (existing.observationCount ?? 1) + 1,
        contextKeys: [signal.contextKey, ...(existing.contextKeys ?? []).filter((key) => key !== signal.contextKey)].slice(0, 3),
      });
    }
  }

  // Deterministic eviction: keep the strongest (effective) fragments; ties by id.
  return [...byId.values()]
    .map((fragment) => {
      const stale = fragmentStaleness(Number(currentTick), Number(fragment.lastReinforcedTick));
      if (stale <= 0.05) return { ...fragment, knowledgeState: "dormant" as const };
      if (stale < 0.65) return { ...fragment, knowledgeState: "stale" as const };
      return fragment;
    })
    .sort((left, right) => {
      const strengthGap =
        effectiveFragmentStrength(right, Number(currentTick)) -
        effectiveFragmentStrength(left, Number(currentTick));
      return strengthGap !== 0 ? strengthGap : left.id.localeCompare(right.id);
    })
    .slice(0, FRAGMENT_CAP);
}

/** Record a response-efficacy failure against the fragments it composed. */
export function recordFragmentFailure(
  fragments: readonly PracticalFragment[],
  fragmentIds: readonly string[],
): readonly PracticalFragment[] {
  if (fragmentIds.length === 0) {
    return fragments;
  }
  return fragments.map((fragment) =>
    fragmentIds.includes(fragment.id)
      ? {
          ...fragment,
          failureCount: fragment.failureCount + 1,
          contradictionCount: (fragment.contradictionCount ?? 0) + 1,
          knowledgeState: (fragment.contradictionCount ?? 0) >= 2
            ? "incorrect"
            : (fragment.contradictionCount ?? 0) >= 1
              ? "contradicted"
              : "tentative",
        }
      : fragment);
}

/** A response-specific useful physical outcome re-proves the exact component
 * fragments that were exercised; generic survival never calls this. */
export function recordFragmentSuccess(
  fragments: readonly PracticalFragment[],
  fragmentIds: readonly string[],
  currentTick: TickNumber,
  evidenceRef: string,
  partial: boolean,
): readonly PracticalFragment[] {
  if (fragmentIds.length === 0) return fragments;
  return fragments.map((fragment) => fragmentIds.includes(fragment.id)
    ? {
        ...fragment,
        basis: "lived" as PracticalFragmentBasis,
        strength: round2(Math.min(1, fragment.strength + (partial ? 0.04 : 0.08))),
        lastReinforcedTick: currentTick,
        evidenceRefs: [evidenceRef, ...fragment.evidenceRefs.filter((ref) => ref !== evidenceRef)].slice(0, EVIDENCE_REF_CAP),
        knowledgeState: partial ? "partial" as const : "confident" as const,
        observationCount: (fragment.observationCount ?? 1) + 1,
      }
    : fragment);
}

/** Daughters inherit weakened fragments that must be re-proven locally. */
export function inheritFragmentsForDaughter(
  parentFragments: readonly PracticalFragment[],
  currentTick: TickNumber,
): readonly PracticalFragment[] {
  return parentFragments
    .filter((fragment) => fragment.strength >= 0.3)
    .slice(0, 4)
    .map((fragment) => ({
      ...fragment,
      basis: "inherited" as PracticalFragmentBasis,
      strength: round2(fragment.strength * 0.5),
      failureCount: 0,
      lastReinforcedTick: currentTick,
      evidenceRefs: ["inherited:parent_band"],
    }));
}
