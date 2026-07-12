// CUMULATIVE PRACTICAL LEARNING / ANIMAL ROUTINES-2
//
// Persisted, bounded knowledge of animal patterns plus a deliberately limited
// proto-management loop. Bands learn only from observation records already
// produced by lived activity (trip traces) or from the observable result of a
// prior feeding/holding attempt. Hidden fauna state is consulted only by the
// physical response function, never to choose a target or grant knowledge.

import type { BandId, Season, TickNumber, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import type { Band, IntraSeasonTripRecord } from "./types";
import { deriveFaunaSignStrength, deriveFaunaStockGeography, getFaunaStockDynamic } from "./faunaStock";

export type AnimalPatternKind =
  | "feeding_place"
  | "water_seeking"
  | "resting_cover"
  | "seasonal_return"
  | "herd_cohesion"
  | "flight_after_pursuit"
  | "defends_young"
  | "camp_approach"
  | "holding_tolerance";

export type AnimalKnowledgeBasis = "direct_observation" | "bounded_inference" | "inherited";
export type AnimalKnowledgeStateKind = "tentative" | "confident" | "contradicted" | "stale" | "dormant";

export interface AnimalPatternRecord {
  readonly id: string;
  readonly stockId: string;
  readonly faunaKind: string;
  readonly placeTileId: TileId;
  readonly routeTileIds: readonly TileId[];
  readonly seasonsObserved: readonly Season[];
  readonly patterns: readonly AnimalPatternKind[];
  readonly observationCount: number;
  readonly directObservationCount: number;
  readonly inferenceCount: number;
  readonly contradictionCount: number;
  readonly confidence: number;
  readonly state: AnimalKnowledgeStateKind;
  readonly basis: AnimalKnowledgeBasis;
  readonly lastObservedTick: TickNumber;
  readonly evidenceRefs: readonly string[];
}

export interface AnimalPatternKnowledgeState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly records: readonly AnimalPatternRecord[];
  readonly recordCap: number;
  readonly evidencePerRecordCap: number;
  readonly capsHeld: boolean;
}

export type AnimalManagementAction = "observe" | "feed" | "protect" | "temporary_hold" | "release" | "none";
export type AnimalManagementOutcome =
  | "observed_only"
  | "brief_proximity"
  | "habituation_increased"
  | "holding_succeeded"
  | "escaped"
  | "enclosure_stress"
  | "injury_risk"
  | "reproduction_failed"
  | "contact_lost"
  | "cost_too_high"
  | "abandoned_unsuitable";
export type AnimalManagementStatus = "observing" | "feeding" | "holding" | "dormant" | "abandoned";

export interface AnimalManagementRecord {
  readonly id: string;
  readonly stockId: string;
  readonly faunaKind: string;
  readonly placeTileId: TileId;
  readonly status: AnimalManagementStatus;
  readonly action: AnimalManagementAction;
  readonly outcome: AnimalManagementOutcome;
  readonly contactSeasons: number;
  readonly feedingAttempts: number;
  readonly holdingAttempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly laborCost: number;
  readonly waterCost: number;
  readonly campCost: number;
  readonly willingness: number;
  readonly animalToleranceObserved: number;
  readonly stressObserved: number;
  readonly lastContactTick: TickNumber;
  readonly reason: string;
}

export interface ProtoAnimalManagementState {
  readonly bandId: BandId;
  readonly lastUpdatedTick: TickNumber;
  readonly records: readonly AnimalManagementRecord[];
  readonly recordCap: number;
  readonly capsHeld: boolean;
  readonly noDomesticationUnlock: true;
  readonly noOwnershipBreedingPastoralism: true;
}

export const ANIMAL_PATTERN_CAP = 12;
export const ANIMAL_PATTERN_EVIDENCE_CAP = 5;
export const ANIMAL_MANAGEMENT_CAP = 4;
const STALE_AFTER_TICKS = 16;
const DORMANT_AFTER_TICKS = 32;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function unique<T>(values: readonly T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function observationPatterns(trip: IntraSeasonTripRecord): readonly AnimalPatternKind[] {
  const trace = trip.animalActivityTrace;
  if (trace === undefined) return [];
  const patterns: AnimalPatternKind[] = ["feeding_place"];
  if (["river_reach", "delta_wetland", "river_meadow", "lake"].includes(trace.habitat)) patterns.push("water_seeking");
  if (["dense_cover", "wet_woodland", "forest_edge", "scrub_edge"].includes(trace.habitat)) patterns.push("resting_cover");
  if (["large_game", "medium_game", "waterfowl"].includes(trace.faunaKind)) patterns.push("herd_cohesion");
  if (trace.warinessChange >= 0.04 || trace.knowledgeUpdate === "danger_caution_added") patterns.push("flight_after_pursuit");
  return unique(patterns);
}

function recordFromTrip(trip: IntraSeasonTripRecord): AnimalPatternRecord | undefined {
  const trace = trip.animalActivityTrace;
  if (trace === undefined) return undefined;
  const failed = trace.outcomeClass === "failure";
  return {
    id: `animal-pattern:${trace.stockId}`,
    stockId: trace.stockId,
    faunaKind: trace.faunaKind,
    placeTileId: trace.anchorTileId,
    routeTileIds: trip.pathTiles.slice(0, 6),
    seasonsObserved: [trip.season],
    patterns: observationPatterns(trip),
    observationCount: 1,
    directObservationCount: 1,
    inferenceCount: 0,
    contradictionCount: failed ? 1 : 0,
    confidence: round2(clamp01(0.22 + trace.confidence * 0.34 - (failed ? 0.08 : 0))),
    state: failed ? "contradicted" : "tentative",
    basis: "direct_observation",
    lastObservedTick: trip.tick,
    evidenceRefs: [`trip:${String(trip.tick)}:${String(trip.targetTileId)}:${trace.stockId}`],
  };
}

function mergeObservation(prior: AnimalPatternRecord, next: AnimalPatternRecord): AnimalPatternRecord {
  const seasonalReturn = prior.seasonsObserved.includes(next.seasonsObserved[0]) && prior.observationCount >= 1;
  const observationCount = prior.observationCount + 1;
  const contradictionCount = prior.contradictionCount + next.contradictionCount;
  const patterns = unique([...prior.patterns, ...next.patterns, ...(seasonalReturn ? ["seasonal_return" as const] : [])]);
  const inferenceCount = prior.inferenceCount + (seasonalReturn ? 1 : 0);
  const confidence = round2(clamp01(
    prior.confidence + 0.1 + (seasonalReturn ? 0.05 : 0) - next.contradictionCount * 0.12,
  ));
  return {
    ...prior,
    routeTileIds: unique([...next.routeTileIds, ...prior.routeTileIds]).slice(0, 6),
    seasonsObserved: unique([...prior.seasonsObserved, ...next.seasonsObserved]),
    patterns,
    observationCount,
    directObservationCount: prior.directObservationCount + 1,
    inferenceCount,
    contradictionCount,
    confidence,
    state: contradictionCount >= 3 ? "contradicted" : confidence >= 0.62 && observationCount >= 3 ? "confident" : "tentative",
    basis: seasonalReturn ? "bounded_inference" : "direct_observation",
    lastObservedTick: next.lastObservedTick,
    evidenceRefs: unique([...next.evidenceRefs, ...prior.evidenceRefs]).slice(0, ANIMAL_PATTERN_EVIDENCE_CAP),
  };
}

function managementObservation(record: AnimalManagementRecord): AnimalPatternRecord | undefined {
  if (record.action === "none" || record.outcome === "cost_too_high" || record.outcome === "contact_lost") return undefined;
  const positive = ["brief_proximity", "habituation_increased", "holding_succeeded"].includes(record.outcome);
  const patterns: AnimalPatternKind[] = record.action === "temporary_hold"
    ? ["holding_tolerance"]
    : ["camp_approach"];
  return {
    id: `animal-pattern:${record.stockId}`,
    stockId: record.stockId,
    faunaKind: record.faunaKind,
    placeTileId: record.placeTileId,
    routeTileIds: [record.placeTileId],
    seasonsObserved: [],
    patterns,
    observationCount: 1,
    directObservationCount: 1,
    inferenceCount: 0,
    contradictionCount: positive ? 0 : 1,
    confidence: positive ? 0.34 : 0.22,
    state: positive ? "tentative" : "contradicted",
    basis: "direct_observation",
    lastObservedTick: record.lastContactTick,
    evidenceRefs: [`management:${record.id}:${record.outcome}`],
  };
}

function localSignObservation(world: WorldState, band: Band): AnimalPatternRecord | undefined {
  const geography = deriveFaunaStockGeography(world);
  const stock = [...(geography.byTile.get(band.position) ?? [])]
    .sort((left, right) => right.detectability - left.detectability || String(left.id).localeCompare(String(right.id)))[0];
  if (stock === undefined) return undefined;
  const strength = deriveFaunaSignStrength(
    world, geography, band.position, stock.faunaClass, world.time.season, 0.28, world.time.tick,
  );
  if (strength < 0.42) return undefined;
  const direct = strength >= 0.62;
  const patterns: AnimalPatternKind[] = stock.waterDependence >= 0.65 ? ["water_seeking"] :
    stock.routineProfile === "cover_forager" ? ["resting_cover"] : ["feeding_place"];
  if (stock.herdTendency >= 0.65) patterns.push("herd_cohesion");
  return {
    id: `animal-pattern:${String(stock.id)}`,
    stockId: String(stock.id),
    faunaKind: stock.kind,
    placeTileId: band.position,
    routeTileIds: [band.position],
    seasonsObserved: [world.time.season],
    patterns,
    observationCount: 1,
    directObservationCount: direct ? 1 : 0,
    inferenceCount: direct ? 0 : 1,
    contradictionCount: 0,
    confidence: round2(0.16 + strength * 0.38),
    state: "tentative",
    basis: direct ? "direct_observation" : "bounded_inference",
    lastObservedTick: world.time.tick,
    evidenceRefs: [`local-${direct ? "sighting" : "tracks"}:${String(world.time.tick)}:${String(band.position)}`],
  };
}

export function advanceAnimalPatternKnowledge(world: WorldState, band: Band): AnimalPatternKnowledgeState {
  const currentTick = Number(world.time.tick);
  const prior = band.animalPatternKnowledge;
  const byId = new Map((prior?.records ?? []).map((record) => [record.id, record]));
  const observations: AnimalPatternRecord[] = [];
  const local = localSignObservation(world, band);
  if (local !== undefined && Number(world.time.tick) > Number(prior?.lastUpdatedTick ?? -1)) observations.push(local);
  for (const trip of band.recentIntraSeasonTrips ?? []) {
    if (Number(trip.tick) <= Number(prior?.lastUpdatedTick ?? -1)) continue;
    const observation = recordFromTrip(trip);
    if (observation !== undefined) observations.push(observation);
  }
  for (const management of band.animalManagement?.records ?? []) {
    if (Number(management.lastContactTick) <= Number(prior?.lastUpdatedTick ?? -1)) continue;
    const observation = managementObservation(management);
    if (observation !== undefined) observations.push(observation);
  }
  for (const observation of observations.sort((a, b) => a.id.localeCompare(b.id))) {
    const existing = byId.get(observation.id);
    byId.set(observation.id, existing === undefined ? observation : mergeObservation(existing, observation));
  }
  const records = [...byId.values()].map((record) => {
    const age = currentTick - Number(record.lastObservedTick);
    if (age >= DORMANT_AFTER_TICKS) return { ...record, state: "dormant" as const, confidence: round2(record.confidence * 0.55) };
    if (age >= STALE_AFTER_TICKS) return { ...record, state: "stale" as const, confidence: round2(record.confidence * 0.78) };
    return record;
  }).sort((a, b) => b.confidence - a.confidence || Number(b.lastObservedTick) - Number(a.lastObservedTick) || a.id.localeCompare(b.id))
    .slice(0, ANIMAL_PATTERN_CAP);
  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    records,
    recordCap: ANIMAL_PATTERN_CAP,
    evidencePerRecordCap: ANIMAL_PATTERN_EVIDENCE_CAP,
    capsHeld: records.length <= ANIMAL_PATTERN_CAP && records.every((record) => record.evidenceRefs.length <= ANIMAL_PATTERN_EVIDENCE_CAP),
  };
}

function actionCosts(action: AnimalManagementAction): { labor: number; water: number; camp: number } {
  switch (action) {
    case "feed": return { labor: 0.12, water: 0.06, camp: 0.08 };
    case "protect": return { labor: 0.16, water: 0.08, camp: 0.1 };
    case "temporary_hold": return { labor: 0.26, water: 0.18, camp: 0.24 };
    case "release": return { labor: 0.05, water: 0.01, camp: 0.02 };
    case "observe": return { labor: 0.04, water: 0.01, camp: 0.02 };
    case "none": return { labor: 0, water: 0, camp: 0 };
  }
}

function nextAction(prior: AnimalManagementRecord | undefined): AnimalManagementAction {
  // Entry already requires repeated pattern observations. The first explicit
  // management action can therefore be a small feeding trial; adding another
  // whole-season "observe" record made mobile bands lose contact before the
  // causal loop could ever be exercised live.
  if (prior === undefined) return "feed";
  if (prior.failures >= 3) return "release";
  if (prior.action === "observe") return "feed";
  if (prior.action === "feed" && prior.successes >= 2) return "temporary_hold";
  if (prior.action === "temporary_hold" && prior.outcome === "holding_succeeded") return "protect";
  return prior.action === "protect" ? "feed" : prior.action;
}

function physicalOutcome(world: WorldState, stockId: string, action: AnimalManagementAction): AnimalManagementOutcome {
  const geography = deriveFaunaStockGeography(world);
  const stock = geography.byId.get(stockId as never);
  if (stock === undefined) return "contact_lost";
  const dyn = getFaunaStockDynamic(world, stock.id);
  if (action === "observe") return "observed_only";
  if (action === "release") return "contact_lost";
  const tolerant = stock.kind === "small_game" || stock.kind === "medium_game" || stock.kind === "forest_edge_game";
  const unsuitable = stock.kind === "waterfowl" || stock.kind === "large_game" || stock.kind === "upland_game";
  if (action === "temporary_hold") {
    if (unsuitable && dyn.disturbance >= 0.18) return "injury_risk";
    if (unsuitable) return "escaped";
    if (dyn.disturbance >= 0.42) return "enclosure_stress";
    return tolerant ? "holding_succeeded" : "escaped";
  }
  if (action === "protect" && dyn.disturbance >= 0.34) return "reproduction_failed";
  if (tolerant && dyn.disturbance < 0.38) return dyn.disturbance < 0.18 ? "habituation_increased" : "brief_proximity";
  return unsuitable ? "brief_proximity" : "habituation_increased";
}

export function advanceAnimalManagement(
  world: WorldState,
  band: Band,
  knowledge: AnimalPatternKnowledgeState,
): ProtoAnimalManagementState {
  const geography = deriveFaunaStockGeography(world);
  const priorRecords = band.animalManagement?.records ?? [];
  const candidates = knowledge.records.filter((record) =>
    record.observationCount >= 2 && record.directObservationCount >= 1 && record.confidence >= 0.3 && record.state !== "dormant" &&
    // Aquatic prey are not held/fed on land; predators are prey/danger, never a
    // proto-management target — feeding a wolf-like stock must never read as
    // habituation. Both are excluded from management candidacy (anti-domestication).
    !record.faunaKind.includes("fish") && record.faunaKind !== "shellfish_reedbed" && !record.faunaKind.includes("predator"));
  const records: AnimalManagementRecord[] = [];
  for (const pattern of candidates.slice(0, ANIMAL_MANAGEMENT_CAP)) {
    const prior = priorRecords.find((record) => record.stockId === pattern.stockId);
    // The remembered stock is selected from observed knowledge first. Hidden
    // geography may then answer only the physical question "are we still in
    // this already-targeted stock's bounded habitat?" It never reveals a new
    // stock or grants a pattern. This prevents a one-tile camp shift from
    // erasing contact while still allowing movement away to end management.
    const targetedStock = geography.byId.get(pattern.stockId as never);
    const stillInObservedContext = pattern.placeTileId === band.position || pattern.routeTileIds.includes(band.position);
    const stillInTargetHabitat = targetedStock?.influenceTileIds.includes(band.position) ?? false;
    const contactLost = prior !== undefined && !stillInObservedContext && !stillInTargetHabitat;
    const action = contactLost ? "none" : nextAction(prior);
    const costs = actionCosts(action);
    const laborAvailability = band.demography.workingAdults / Math.max(1, band.demography.population);
    const waterStress = band.pressureState?.waterStress ?? 0;
    const campPressure = band.bodyCampLogistics?.campCleanliness.pressure ?? 0;
    const willingness = round2(clamp01(
      0.58 + pattern.confidence * 0.24 + (prior?.successes ?? 0) * 0.06 -
      costs.labor * (1.2 - laborAvailability) - costs.water * (0.8 + waterStress) - costs.camp * campPressure -
      (prior?.failures ?? 0) * 0.12,
    ));
    const unaffordable = laborAvailability < costs.labor || waterStress + costs.water > 0.78 || willingness < 0.28;
    const outcome: AnimalManagementOutcome = contactLost
      ? "contact_lost"
      : unaffordable
        ? "cost_too_high"
        : physicalOutcome(world, pattern.stockId, action);
    const success = ["brief_proximity", "habituation_increased", "holding_succeeded"].includes(outcome);
    const failure = ["escaped", "enclosure_stress", "injury_risk", "reproduction_failed", "abandoned_unsuitable"].includes(outcome);
    const failures = (prior?.failures ?? 0) + (failure ? 1 : 0);
    const status: AnimalManagementStatus = failures >= 3
      ? "abandoned"
      : outcome === "contact_lost" || outcome === "cost_too_high"
        ? "dormant"
        : action === "temporary_hold" || action === "protect"
          ? "holding"
          : action === "feed"
            ? "feeding"
            : "observing";
    records.push({
      id: prior?.id ?? `animal-management:${String(band.id)}:${pattern.stockId}`,
      stockId: pattern.stockId,
      faunaKind: pattern.faunaKind,
      placeTileId: pattern.placeTileId,
      status,
      action,
      outcome,
      contactSeasons: (prior?.contactSeasons ?? 0) + (contactLost ? 0 : 1),
      feedingAttempts: (prior?.feedingAttempts ?? 0) + (action === "feed" ? 1 : 0),
      holdingAttempts: (prior?.holdingAttempts ?? 0) + (action === "temporary_hold" ? 1 : 0),
      successes: (prior?.successes ?? 0) + (success ? 1 : 0),
      failures,
      laborCost: unaffordable ? 0 : costs.labor,
      waterCost: unaffordable ? 0 : costs.water,
      campCost: unaffordable ? 0 : costs.camp,
      willingness,
      animalToleranceObserved: round2(clamp01((prior?.animalToleranceObserved ?? 0.12) + (success ? 0.12 : failure ? -0.1 : 0))),
      stressObserved: round2(clamp01((prior?.stressObserved ?? 0) + (outcome === "enclosure_stress" || outcome === "injury_risk" ? 0.24 : -0.05))),
      lastContactTick: world.time.tick,
      reason: `${action}: ${outcome}; labor ${costs.labor}, water ${costs.water}, camp ${costs.camp}, willingness ${willingness}`,
    });
  }
  // Contact can end without erasing the attempted relationship. Retain a
  // bounded dormant record so abandonment/rediscovery and live audits can see
  // that feeding or holding actually occurred.
  for (const prior of priorRecords) {
    if (records.some((record) => record.stockId === prior.stockId) || records.length >= ANIMAL_MANAGEMENT_CAP) continue;
    records.push({
      ...prior,
      status: prior.status === "abandoned" ? "abandoned" : "dormant",
      action: "none",
      outcome: "contact_lost",
      laborCost: 0,
      waterCost: 0,
      campCost: 0,
      reason: "contact stopped or the remembered animal pattern became stale; management is dormant",
    });
  }
  return {
    bandId: band.id,
    lastUpdatedTick: world.time.tick,
    records,
    recordCap: ANIMAL_MANAGEMENT_CAP,
    capsHeld: records.length <= ANIMAL_MANAGEMENT_CAP,
    noDomesticationUnlock: true,
    noOwnershipBreedingPastoralism: true,
  };
}

export function inheritAnimalPatternKnowledgeForDaughter(
  parent: AnimalPatternKnowledgeState | undefined,
  daughterBandId: BandId,
  currentTick: TickNumber,
): AnimalPatternKnowledgeState | undefined {
  if (parent === undefined) return undefined;
  const records = parent.records.filter((record) => record.confidence >= 0.5).slice(0, 3).map((record) => ({
    ...record,
    confidence: round2(record.confidence * 0.5),
    state: "tentative" as const,
    basis: "inherited" as const,
    directObservationCount: 0,
    inferenceCount: record.inferenceCount + 1,
    lastObservedTick: currentTick,
    evidenceRefs: ["inherited:parent_animal_pattern"],
  }));
  if (records.length === 0) return undefined;
  return {
    bandId: daughterBandId,
    lastUpdatedTick: currentTick,
    records,
    recordCap: ANIMAL_PATTERN_CAP,
    evidencePerRecordCap: ANIMAL_PATTERN_EVIDENCE_CAP,
    capsHeld: true,
  };
}
