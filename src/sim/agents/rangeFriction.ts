// RANGE-4 — record-only shared-use / intrusion-tension notices.
//
// This module records bounded recent notices from already grounded evidence:
// a band's own familiar-country memory, nearby/contact/kin bands, recent activity
// trips, band-known ford context, and existing second-hand reports. It is memory/debug
// state only: no movement, conflict, demography, stress, yield, support, or territory
// rule reads these records.

import type { BandId, ReasonId, TickNumber, TileId } from "../core/types";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import type { TickContextCache } from "./contextCache";
import { deriveFamiliarCountry, type FamiliarCountrySummary } from "./familiarCountry";
import { deriveFordContext } from "./fordContext";
import type {
  Band,
  IntraSeasonTripRecord,
  RangeFrictionConfidence,
  RangeFrictionEvent,
  RangeFrictionInterpretation,
  RangeFrictionObserverRangeTier,
  RangeFrictionOtherActivityKind,
  RangeFrictionRelation,
  RangeFrictionTensionLevel,
  WordOfMouthReport,
} from "./types";

const RANGE_FRICTION_RING_LIMIT = 8;
const RANGE_FRICTION_MAX_AGE_TICKS = 48;
const RANGE_FRICTION_CANDIDATE_LIMIT = 12;
const RANGE_FRICTION_TRIP_WINDOW_TICKS = 12;
const RANGE_FRICTION_EVENTS_PER_PAIR_LIMIT = 2;
const RANGE_FRICTION_NEW_EVENTS_PER_BAND_LIMIT = 5;

interface RangeMembership {
  readonly summary: FamiliarCountrySummary;
  readonly coreTiles: ReadonlySet<string>;
  readonly familiarTiles: ReadonlySet<string>;
  readonly edgeTiles: ReadonlySet<string>;
  readonly routeTiles: ReadonlySet<string>;
  readonly fordTiles: ReadonlySet<string>;
}

interface PairNotice {
  readonly tileId: TileId;
  readonly activityKind: RangeFrictionOtherActivityKind;
  readonly confidence: RangeFrictionConfidence;
  readonly recentOverlapCount: number;
  readonly linkedActivityTripId?: string;
  readonly reasonIds: readonly ReasonId[];
}

export function advanceRangeFriction(world: WorldState, cache: TickContextCache): WorldState {
  const activeBands = cache.activeBandIds
    .map((bandId) => world.bands[bandId])
    .filter((band): band is Band => band !== undefined)
    .sort(compareBands);
  const activeById = new Map<BandId, Band>();
  for (const band of activeBands) {
    activeById.set(band.id, band);
  }
  const childrenByParent = buildChildrenByParent(activeBands);
  let changed = false;
  const bands: Record<string, Band> = { ...world.bands };

  for (const observer of activeBands) {
    const membership = buildRangeMembership(observer, world);
    const candidates = deriveCandidateBands(observer, activeById, childrenByParent, cache)
      .filter((candidate) => candidate.id !== observer.id)
      .slice(0, RANGE_FRICTION_CANDIDATE_LIMIT);
    const freshEvents: RangeFrictionEvent[] = [];

    for (const other of candidates) {
      if (freshEvents.length >= RANGE_FRICTION_NEW_EVENTS_PER_BAND_LIMIT) {
        break;
      }

      const pairEvents = derivePairEvents(world, observer, other, membership)
        .slice(0, RANGE_FRICTION_EVENTS_PER_PAIR_LIMIT);
      freshEvents.push(...pairEvents);
    }

    if (freshEvents.length < RANGE_FRICTION_NEW_EVENTS_PER_BAND_LIMIT) {
      freshEvents.push(
        ...deriveReportLinkedEvents(world, observer, activeById, membership)
          .slice(0, RANGE_FRICTION_NEW_EVENTS_PER_BAND_LIMIT - freshEvents.length),
      );
    }

    const previous = observer.recentRangeFrictionEvents ?? [];
    const ring = mergeEventRing(previous, freshEvents, world.time.tick);

    if (!sameEventRing(previous, ring)) {
      bands[observer.id] = {
        ...observer,
        recentRangeFrictionEvents: ring.length > 0 ? ring : undefined,
      };
      changed = true;
    }
  }

  return changed ? { ...world, bands: bands as Readonly<Record<BandId, Band>> } : world;
}

function derivePairEvents(
  world: WorldState,
  observer: Band,
  other: Band,
  membership: RangeMembership,
): readonly RangeFrictionEvent[] {
  const notices = derivePairNotices(world, observer, other, membership);
  const relation = deriveRelation(world, observer, other);

  return notices
    .map((notice) => makePairEvent(world, observer, other, membership, notice, relation))
    .filter((event): event is RangeFrictionEvent => event !== undefined)
    .sort(compareEvents);
}

function derivePairNotices(
  world: WorldState,
  observer: Band,
  other: Band,
  membership: RangeMembership,
): readonly PairNotice[] {
  const notices: PairNotice[] = [];
  const currentTier = classifyRangeTier(membership, other.position);

  if (currentTier !== "unknown_to_observer") {
    notices.push({
      tileId: other.position,
      activityKind: "residential_presence",
      confidence: "observed",
      recentOverlapCount: 1 + countRecentTripsInRange(world, other, membership),
      reasonIds: [
        makeReasonId(world, observer.id, other.id, "observed_residential_presence", other.position),
      ],
    });
  }

  const recentTrips = (other.recentIntraSeasonTrips ?? [])
    .filter((trip) => {
      const age = Number(world.time.tick) - Number(trip.tick);
      return age >= 0 && age <= RANGE_FRICTION_TRIP_WINDOW_TICKS;
    })
    .filter((trip) => classifyRangeTier(membership, trip.targetTileId) !== "unknown_to_observer")
    .sort(compareTrips)
    .slice(0, 4);

  for (const trip of recentTrips) {
    const overlapCount = recentTrips.filter((candidate) => candidate.targetTileId === trip.targetTileId).length;
    notices.push({
      tileId: trip.targetTileId,
      activityKind: classifyTripActivity(world, observer, trip, membership),
      confidence: "inferred_from_recent_activity",
      recentOverlapCount: overlapCount,
      linkedActivityTripId: makeTripId(trip),
      reasonIds: [
        makeReasonId(world, observer.id, other.id, "recent_activity_overlap", trip.targetTileId),
        ...trip.reasonIds.slice(0, 2),
      ],
    });
  }

  return notices
    .sort(compareNotices)
    .filter((notice, index, all) => {
      const firstIndex = all.findIndex(
        (candidate) =>
          candidate.tileId === notice.tileId &&
          candidate.activityKind === notice.activityKind &&
          candidate.confidence === notice.confidence,
      );
      return firstIndex === index;
    });
}

function makePairEvent(
  world: WorldState,
  observer: Band,
  other: Band,
  membership: RangeMembership,
  notice: PairNotice,
  relation: RangeFrictionRelation,
): RangeFrictionEvent | undefined {
  const tier = classifyRangeTier(membership, notice.tileId);
  if (tier === "unknown_to_observer") {
    return undefined;
  }

  const tile = getTile(world, notice.tileId);
  const interpretation = deriveInterpretation(tier, notice.activityKind, relation, tile, notice.recentOverlapCount);
  const tensionLevel = deriveTensionLevel(interpretation, relation, tier, notice.recentOverlapCount);
  const priorRecurrence = countPriorRecurrence(
    observer.recentRangeFrictionEvents ?? [],
    other.id,
    notice.tileId,
    interpretation,
    world.time.tick,
  );

  return {
    eventId: makeEventId(world, observer.id, other.id, notice.tileId, interpretation, notice.activityKind),
    tick: world.time.tick,
    season: world.time.season,
    observerBandId: observer.id,
    otherBandId: other.id,
    tileId: notice.tileId,
    observerRangeTier: tier,
    otherActivityKind: notice.activityKind,
    relation,
    interpretation,
    tensionLevel,
    confidence: notice.confidence,
    recurrenceCount: priorRecurrence + 1,
    recentOverlapCount: notice.recentOverlapCount,
    linkedActivityTripId: notice.linkedActivityTripId,
    noConflictChange: true,
    noMovementChange: true,
    noPopulationChange: true,
    noStressChange: true,
    noYieldChange: true,
    noTerritoryClaim: true,
    reasonIds: notice.reasonIds,
  };
}

function deriveReportLinkedEvents(
  world: WorldState,
  observer: Band,
  activeById: ReadonlyMap<BandId, Band>,
  membership: RangeMembership,
): readonly RangeFrictionEvent[] {
  const reports = observer.reportedKnowledge?.reports ?? [];
  const events: RangeFrictionEvent[] = [];

  for (const report of reports) {
    if (!isFrictionReport(report) || report.targetTileId === undefined) {
      continue;
    }
    // RUMOR-LOOP FIX (2026-07-10): a band's OWN report is not evidence of
    // another band. Without this exclusion, a band's internally generated
    // avoid_place / bad_water_warning reports became friction events with
    // otherBandId === itself (the self falls through every kin check →
    // stranger-tier tension), which reportedKnowledge then re-published as
    // "outsider_use_warning" — so even a LONE band heard perpetual rumors of
    // outsiders, and multi-band worlds carried permanent phantom friction.
    // Only reports that actually arrived from ANOTHER band may seed
    // report-linked friction.
    if (report.sourceBandId === observer.id) {
      continue;
    }

    const tier = classifyRangeTier(membership, report.targetTileId);
    if (tier === "unknown_to_observer") {
      continue;
    }

    const sourceBand = activeById.get(report.sourceBandId);
    const relation = sourceBand !== undefined
      ? deriveRelation(world, observer, sourceBand)
      : relationFromReportTrust(report);
    const tile = getTile(world, report.targetTileId);
    const interpretation = interpretationFromReport(report, tile);
    events.push({
      eventId: makeEventId(
        world,
        observer.id,
        report.sourceBandId,
        report.targetTileId,
        interpretation,
        "unknown_activity",
      ),
      tick: world.time.tick,
      season: world.time.season,
      observerBandId: observer.id,
      otherBandId: report.sourceBandId,
      tileId: report.targetTileId,
      observerRangeTier: tier,
      otherActivityKind: "unknown_activity",
      relation,
      interpretation,
      tensionLevel: relation === "parent" || relation === "daughter" || relation === "sibling" ? "none" : "watchful",
      confidence: "reported_secondhand",
      recurrenceCount: countPriorRecurrence(
        observer.recentRangeFrictionEvents ?? [],
        report.sourceBandId,
        report.targetTileId,
        interpretation,
        world.time.tick,
      ) + 1,
      recentOverlapCount: 1,
      linkedReportId: report.reportId,
      noConflictChange: true,
      noMovementChange: true,
      noPopulationChange: true,
      noStressChange: true,
      noYieldChange: true,
      noTerritoryClaim: true,
      reasonIds: [
        makeReasonId(world, observer.id, report.sourceBandId, "secondhand_report_linked", report.targetTileId),
        ...report.reasonIds.slice(0, 2),
      ],
    });
  }

  return events.sort(compareEvents);
}

function isFrictionReport(report: WordOfMouthReport): boolean {
  return (
    report.topic === "crowded_range_warning" ||
    report.topic === "avoid_place" ||
    report.topic === "bad_water_warning"
  );
}

function interpretationFromReport(
  report: WordOfMouthReport,
  tile: Tile | undefined,
): RangeFrictionInterpretation {
  if (report.topic === "avoid_place" || report.topic === "bad_water_warning") {
    return "avoid_warning_remembered";
  }

  if (isWaterOrDeltaTile(tile)) {
    return "crowded_water_place";
  }

  return "uncertain_presence";
}

function deriveInterpretation(
  tier: RangeFrictionObserverRangeTier,
  activityKind: RangeFrictionOtherActivityKind,
  relation: RangeFrictionRelation,
  tile: Tile | undefined,
  recentOverlapCount: number,
): RangeFrictionInterpretation {
  if (isKinRelation(relation)) {
    return tier === "ford_or_crossing" ? "ford_overlap" : "tolerated_kin_presence";
  }

  if (tier === "ford_or_crossing" || activityKind === "crossing_or_route_use") {
    return "ford_overlap";
  }

  if (tier === "route_or_corridor") {
    return "route_overlap";
  }

  if (isWaterOrDeltaTile(tile) && recentOverlapCount >= 2) {
    return "crowded_water_place";
  }

  if (recentOverlapCount >= 3) {
    return "repeated_outsider_use";
  }

  if (tier === "camp_core" || tier === "water_core" || tier === "familiar_core") {
    return "possible_intrusion";
  }

  return relation === "familiar_neighbor" ? "noticed_shared_use" : "uncertain_presence";
}

function deriveTensionLevel(
  interpretation: RangeFrictionInterpretation,
  relation: RangeFrictionRelation,
  tier: RangeFrictionObserverRangeTier,
  recentOverlapCount: number,
): RangeFrictionTensionLevel {
  if (interpretation === "tolerated_kin_presence" || isKinRelation(relation)) {
    return "none";
  }

  if (
    interpretation === "repeated_outsider_use" &&
    recentOverlapCount >= 4 &&
    (tier === "camp_core" || tier === "water_core" || tier === "familiar_core")
  ) {
    return "moderate_placeholder";
  }

  if (
    interpretation === "possible_intrusion" ||
    interpretation === "crowded_water_place" ||
    interpretation === "repeated_outsider_use" ||
    interpretation === "avoid_warning_remembered"
  ) {
    return "mild";
  }

  return relation === "stranger_or_unrecognized" || relation === "weak_contact" ? "watchful" : "none";
}

function classifyTripActivity(
  world: WorldState,
  observer: Band,
  trip: IntraSeasonTripRecord,
  membership: RangeMembership,
): RangeFrictionOtherActivityKind {
  const tile = getTile(world, trip.targetTileId);
  const task = trip.taskGroupType;
  const objective = trip.objective;
  const cause = trip.cause;
  const movement = trip.movementType;
  const resourceClass = trip.resourceClassId;

  if (
    classifyRangeTier(membership, trip.targetTileId) === "ford_or_crossing" ||
    trip.pathTiles.some((tileId) => membership.fordTiles.has(String(tileId))) ||
    String(movement).includes("route")
  ) {
    return "crossing_or_route_use";
  }

  if (
    String(task).includes("scout") ||
    String(objective).includes("scout") ||
    String(cause).includes("probe") ||
    String(cause).includes("scout")
  ) {
    return "scouting_or_probe";
  }

  if (
    resourceClass === "water_resource" ||
    resourceClass === "aquatic_food" ||
    String(task).includes("water") ||
    String(task).includes("fish") ||
    isWaterOrDeltaTile(tile)
  ) {
    return "fishing_or_water_work";
  }

  if (
    String(task).includes("forag") ||
    String(task).includes("hunt") ||
    String(task).includes("gather") ||
    String(objective).includes("food")
  ) {
    return "foraging_trip";
  }

  return observer.position === trip.targetTileId ? "passing_through" : "unknown_activity";
}

function deriveCandidateBands(
  observer: Band,
  activeById: ReadonlyMap<BandId, Band>,
  childrenByParent: ReadonlyMap<BandId, readonly Band[]>,
  cache: TickContextCache,
): readonly Band[] {
  const candidates = new Map<BandId, Band>();
  const add = (bandId: BandId | undefined) => {
    if (bandId === undefined || bandId === observer.id || candidates.size >= RANGE_FRICTION_CANDIDATE_LIMIT) {
      return;
    }
    const band = activeById.get(bandId);
    if (band !== undefined) {
      candidates.set(band.id, band);
    }
  };

  for (const bandId of cache.nearbyBandsByBandId.get(observer.id) ?? []) {
    add(bandId);
  }
  add(observer.parentBandId);
  for (const daughterId of observer.daughterBandIds) {
    add(daughterId);
  }
  if (observer.parentBandId !== undefined) {
    for (const sibling of childrenByParent.get(observer.parentBandId) ?? []) {
      add(sibling.id);
    }
  }
  for (const bandId of Object.keys(observer.contactMemories).sort()) {
    add(bandId as BandId);
  }

  return [...candidates.values()].sort(compareBands);
}

function buildRangeMembership(band: Band, world: WorldState): RangeMembership {
  const summary = deriveFamiliarCountry(band, world.time.tick);
  const knownFords = deriveFordContext(band, world).knownFords;
  const fordTileIds: string[] = [];
  for (const ford of knownFords) {
    fordTileIds.push(String(ford.fromTileId), String(ford.toTileId));
  }

  return {
    summary,
    coreTiles: new Set(summary.coreTiles.map(String)),
    familiarTiles: new Set(summary.familiarTiles.map(String)),
    edgeTiles: new Set(summary.edgeTiles.map(String)),
    routeTiles: new Set(summary.corePlaces.routeCorridorTiles.map(String)),
    fordTiles: new Set(fordTileIds),
  };
}

function classifyRangeTier(
  membership: RangeMembership,
  tileId: TileId,
): RangeFrictionObserverRangeTier {
  const key = String(tileId);

  if (membership.summary.corePlaces.campCore === tileId) {
    return "camp_core";
  }
  if (membership.summary.corePlaces.waterCore === tileId) {
    return "water_core";
  }
  if (membership.fordTiles.has(key)) {
    return "ford_or_crossing";
  }
  if (membership.routeTiles.has(key)) {
    return "route_or_corridor";
  }
  if (membership.coreTiles.has(key)) {
    return "familiar_core";
  }
  if (membership.familiarTiles.has(key)) {
    return "familiar_country";
  }
  if (membership.edgeTiles.has(key)) {
    return "edge";
  }

  return "unknown_to_observer";
}

function deriveRelation(
  world: WorldState,
  observer: Band,
  other: Band,
): RangeFrictionRelation {
  if (observer.parentBandId === other.id) {
    return "parent";
  }
  if (observer.daughterBandIds.includes(other.id) || other.parentBandId === observer.id) {
    return "daughter";
  }
  if (
    observer.parentBandId !== undefined &&
    other.parentBandId !== undefined &&
    observer.parentBandId === other.parentBandId
  ) {
    return "sibling";
  }
  if (isLineageKin(world, observer, other)) {
    return "lineage_kin";
  }

  const contact = observer.contactMemories[other.id];
  if (contact !== undefined) {
    if (
      contact.familiarity >= 0.42 ||
      contact.sharedUseCount >= 2 ||
      contact.peacefulContactCount >= 2 ||
      contact.trustLikeTolerance >= 0.45
    ) {
      return "familiar_neighbor";
    }
    return "weak_contact";
  }

  return "stranger_or_unrecognized";
}

function isLineageKin(world: WorldState, left: Band, right: Band): boolean {
  return isAncestor(world, left.id, right) || isAncestor(world, right.id, left);
}

function isAncestor(world: WorldState, ancestorId: BandId, descendant: Band): boolean {
  let currentParentId = descendant.parentBandId;
  for (let depth = 0; depth < 8; depth += 1) {
    if (currentParentId === undefined) {
      return false;
    }
    if (currentParentId === ancestorId) {
      return true;
    }
    currentParentId = world.bands[currentParentId]?.parentBandId;
  }
  return false;
}

function relationFromReportTrust(report: WordOfMouthReport): RangeFrictionRelation {
  if (report.trustBasis === "parent") return "parent";
  if (report.trustBasis === "daughter") return "daughter";
  if (report.trustBasis === "sibling") return "sibling";
  if (report.trustBasis === "lineage_kin") return "lineage_kin";
  if (report.trustBasis === "familiar_neighbor" || report.trustBasis === "repeated_contact") {
    return "familiar_neighbor";
  }
  if (report.trustBasis === "shared_water" || report.trustBasis === "residential_proximity") {
    return "familiar_neighbor";
  }
  if (report.trustBasis === "range_friction") {
    return "weak_contact";
  }
  if (report.trustBasis === "weak_contact") {
    return "weak_contact";
  }
  return "stranger_or_unrecognized";
}

function buildChildrenByParent(activeBands: readonly Band[]): ReadonlyMap<BandId, readonly Band[]> {
  const children = new Map<BandId, readonly Band[]>();

  for (const band of activeBands) {
    if (band.parentBandId === undefined) {
      continue;
    }
    const existing = children.get(band.parentBandId) ?? [];
    children.set(band.parentBandId, [...existing, band].sort(compareBands));
  }

  return children;
}

function countRecentTripsInRange(world: WorldState, other: Band, membership: RangeMembership): number {
  return (other.recentIntraSeasonTrips ?? []).filter((trip) => {
    const age = Number(world.time.tick) - Number(trip.tick);
    return (
      age >= 0 &&
      age <= RANGE_FRICTION_TRIP_WINDOW_TICKS &&
      classifyRangeTier(membership, trip.targetTileId) !== "unknown_to_observer"
    );
  }).length;
}

function countPriorRecurrence(
  previousEvents: readonly RangeFrictionEvent[],
  otherBandId: BandId,
  tileId: TileId,
  interpretation: RangeFrictionInterpretation,
  currentTick: TickNumber,
): number {
  return previousEvents.filter((event) => {
    const age = Number(currentTick) - Number(event.tick);
    return (
      age >= 0 &&
      age <= RANGE_FRICTION_MAX_AGE_TICKS &&
      event.otherBandId === otherBandId &&
      event.tileId === tileId &&
      event.interpretation === interpretation
    );
  }).length;
}

function mergeEventRing(
  previous: readonly RangeFrictionEvent[],
  fresh: readonly RangeFrictionEvent[],
  currentTick: TickNumber,
): readonly RangeFrictionEvent[] {
  const byId = new Map<string, RangeFrictionEvent>();

  for (const event of [...fresh, ...previous]) {
    const age = Number(currentTick) - Number(event.tick);
    if (age < 0 || age > RANGE_FRICTION_MAX_AGE_TICKS) {
      continue;
    }
    if (!byId.has(event.eventId)) {
      byId.set(event.eventId, event);
    }
  }

  return [...byId.values()].sort(compareEvents).slice(0, RANGE_FRICTION_RING_LIMIT);
}

function sameEventRing(
  left: readonly RangeFrictionEvent[],
  right: readonly RangeFrictionEvent[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((event, index) => event.eventId === right[index]?.eventId);
}

function isKinRelation(relation: RangeFrictionRelation): boolean {
  return (
    relation === "parent" ||
    relation === "daughter" ||
    relation === "sibling" ||
    relation === "lineage_kin"
  );
}

function isWaterOrDeltaTile(tile: Tile | undefined): boolean {
  return (
    tile !== undefined &&
    (tile.isAquatic ||
      tile.isRiver ||
      tile.isRiverbank === true ||
      tile.isFloodplain === true ||
      tile.isEstuary === true ||
      tile.isMarshChannel === true ||
      tile.terrainKind === "wetlands" ||
      tile.terrainKind === "river_valley" ||
      tile.terrainKind === "coast" ||
      tile.terrainKind === "lake")
  );
}

function makeEventId(
  world: WorldState,
  observerBandId: BandId,
  otherBandId: BandId,
  tileId: TileId | undefined,
  interpretation: RangeFrictionInterpretation,
  activityKind: RangeFrictionOtherActivityKind,
): string {
  return [
    "range-friction",
    Number(world.time.tick),
    String(observerBandId),
    String(otherBandId),
    tileId === undefined ? "untiled" : String(tileId),
    interpretation,
    activityKind,
  ].join(":");
}

function makeReasonId(
  world: WorldState,
  observerBandId: BandId,
  otherBandId: BandId,
  reason: string,
  tileId: TileId,
): ReasonId {
  return `reason:range-friction:${Number(world.time.tick)}:${observerBandId}:${otherBandId}:${reason}:${tileId}` as ReasonId;
}

function makeTripId(trip: IntraSeasonTripRecord): string {
  return [
    String(trip.sourceBandId),
    Number(trip.day),
    Number(trip.tick),
    String(trip.originTileId),
    String(trip.targetTileId),
    trip.taskGroupType,
    trip.cause,
  ].join("|");
}

function compareEvents(left: RangeFrictionEvent, right: RangeFrictionEvent): number {
  return (
    Number(right.tick) - Number(left.tick) ||
    compareTension(right.tensionLevel, left.tensionLevel) ||
    right.recentOverlapCount - left.recentOverlapCount ||
    String(left.otherBandId).localeCompare(String(right.otherBandId)) ||
    String(left.tileId ?? "").localeCompare(String(right.tileId ?? "")) ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareTension(left: RangeFrictionTensionLevel, right: RangeFrictionTensionLevel): number {
  return tensionRank(left) - tensionRank(right);
}

function tensionRank(tension: RangeFrictionTensionLevel): number {
  if (tension === "moderate_placeholder") return 3;
  if (tension === "mild") return 2;
  if (tension === "watchful") return 1;
  return 0;
}

function compareNotices(left: PairNotice, right: PairNotice): number {
  return (
    right.recentOverlapCount - left.recentOverlapCount ||
    confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
    String(left.tileId).localeCompare(String(right.tileId)) ||
    left.activityKind.localeCompare(right.activityKind)
  );
}

function confidenceRank(confidence: RangeFrictionConfidence): number {
  if (confidence === "observed") return 3;
  if (confidence === "inferred_from_recent_activity") return 2;
  if (confidence === "reported_secondhand") return 1;
  return 0;
}

function compareTrips(left: IntraSeasonTripRecord, right: IntraSeasonTripRecord): number {
  return (
    Number(right.tick) - Number(left.tick) ||
    Number(right.day) - Number(left.day) ||
    String(left.targetTileId).localeCompare(String(right.targetTileId)) ||
    left.taskGroupType.localeCompare(right.taskGroupType)
  );
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}
