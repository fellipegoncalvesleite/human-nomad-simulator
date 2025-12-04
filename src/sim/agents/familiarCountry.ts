// RANGE-1 — Familiar Country / Use-Range substrate (READ-ONLY, derived).
//
// Pure & deterministic: no unseeded random call, no `any`, no UI/render/store imports, and NEVER
// called inside stepSim — so the simulation is byte-identical. Reads ONLY the band's OWN
// known memory; every range tile is a key of knowledge.observedTiles (range ⊆ observed —
// the anti-omniscience guarantee). No economy/CC/yield/support coupling. This is NOT
// territory, borders, ownership, or defense — it is a derived view of used space over time.

import type { Band } from "./types";
import type { MobilityIntentKind } from "../rules/types";
import type { BandId, TickNumber, TileId } from "../core/types";

// Presentational/semantic constants (nothing in stepSim reads them). Keep in sync with the
// §4.6 table in docs/superpowers/specs/2026-06-22-range-1-familiar-country-design.md.
export const RANGE1_CONSTANTS = {
  BASE_FREQ_W: 0.5,
  BASE_CONF_W: 0.5,
  VISITS_FULL: 4,
  RETURN_FULL: 2,
  CORRIDOR_W: 0.35,
  USE_FULL: 4,
  ANCHOR_W: 0.5,
  ANCHOR_MEM_W: 0.3,
  WATER_W: 0.4,
  RECENT_W: 0.3,
  RECENT_WINDOW: 16,
  DECAY_WINDOW: 40,
  RECENCY_FLOOR: 0.15,
  CORE_THRESHOLD: 0.62,
  FAMILIAR_THRESHOLD: 0.33,
  EDGE_FLOOR: 0.12,
  CORE_SAMPLE_CAP: 8,
  MOVE_RECENCY_TICKS: 4,
  MIN_RANGE_TILES: 3,
  WATER_RELIABILITY_MIN: 0.5,
  SEASONAL_ROUND_CONFIDENCE_MIN: 0.5,
} as const;

export type MovementContext =
  | "within_known_range"
  | "local_camp_shift"
  | "working_known_water"
  | "seasonal_round"
  | "range_edge_probe"
  | "leaving_familiar_country"
  | "founding_new_range"
  | "unsettled_no_range";

export interface FamiliarCountryCorePlaces {
  readonly campCore?: TileId;
  readonly waterCore?: TileId;
  readonly routeCorridorTiles: readonly TileId[];
  readonly activityZoneTiles: readonly TileId[];
}

export interface FamiliarCountrySummary {
  readonly bandId: BandId;
  readonly currentTick: TickNumber;
  readonly coreTiles: readonly TileId[];
  readonly familiarTiles: readonly TileId[];
  readonly edgeTiles: readonly TileId[];
  readonly corePlaces: FamiliarCountryCorePlaces;
  readonly counts: {
    readonly core: number;
    readonly familiar: number;
    readonly edge: number;
    readonly rangeTotal: number;
    readonly observedTotal: number;
  };
  readonly hasMeaningfulRange: boolean;
  readonly derivedFromKnownMemoryOnly: true;
  readonly noHiddenTruthScan: true;
  readonly noEconomyCoupling: true;
  readonly noBehaviorChange: true;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function deriveFamiliarCountry(band: Band, currentTick: TickNumber): FamiliarCountrySummary {
  const C = RANGE1_CONSTANTS;
  const tick = Number(currentTick);

  const observed = band.knowledge.observedTiles;
  const place = band.placeMemory ?? {};
  const corridors = band.travelCorridors ?? {};
  const anchorMem = band.anchorMemories ?? {};
  const ecology = band.seasonalEcologyMemory ?? {};
  const anchor = band.residentialAnchor;

  // Corridor tile membership: best useCount + most-recent lastUsedAt per endpoint tile.
  const corridorTileUse = new Map<string, { use: number; tick: number }>();
  for (const corridor of Object.values(corridors)) {
    const lastUsed = Number(corridor.lastUsedAt.tick);
    for (const endpoint of [corridor.fromTileId, corridor.toTileId]) {
      const key = String(endpoint);
      const prev = corridorTileUse.get(key);
      if (prev === undefined || corridor.useCount > prev.use) {
        corridorTileUse.set(key, { use: corridor.useCount, tick: lastUsed });
      }
    }
  }

  // Current anchor + catchment.
  const catchment = new Set<string>();
  if (anchor !== undefined) {
    catchment.add(String(anchor.anchorTileId));
    for (const tileId of anchor.catchmentTileIds) {
      catchment.add(String(tileId));
    }
  }
  const tetherWater = anchor?.tetheringWaterTileId !== undefined ? String(anchor.tetheringWaterTileId) : undefined;

  // Recent activity tiles within RECENT_WINDOW (trip targets + recent move paths).
  const recentTiles = new Map<string, number>();
  for (const trip of band.recentIntraSeasonTrips ?? []) {
    const tripTick = Number(trip.tick);
    if (tick - tripTick <= C.RECENT_WINDOW) {
      const key = String(trip.targetTileId);
      recentTiles.set(key, Math.max(recentTiles.get(key) ?? 0, tripTick));
    }
  }
  for (const move of band.recentResidentialMoveEvents ?? []) {
    const moveTick = Number(move.tick);
    if (tick - moveTick <= C.RECENT_WINDOW) {
      for (const tileId of move.pathTiles) {
        const key = String(tileId);
        recentTiles.set(key, Math.max(recentTiles.get(key) ?? 0, moveTick));
      }
    }
  }

  const isReliableWater = (tileKey: string): boolean => {
    const obs = ecology[tileKey as TileId];
    if (obs === undefined || obs.domain !== "water_reliability") {
      return false;
    }
    return Object.values(obs.seasonalReliabilityBySeason).some((r) => (r ?? 0) >= C.WATER_RELIABILITY_MIN);
  };

  const coreTiles: TileId[] = [];
  const familiarTiles: TileId[] = [];
  const edgeTiles: TileId[] = [];

  for (const [tileKey, record] of Object.entries(observed)) {
    const tileId = tileKey as TileId;
    const freq = Math.min(1, record.visits / C.VISITS_FULL);
    const base = C.BASE_FREQ_W * freq + C.BASE_CONF_W * record.confidence;

    let boost = 0;
    let isCorePlace = false;

    const pm = place[tileId];
    if (pm !== undefined) {
      boost += 0.4 * pm.attachment + 0.2 * Math.min(1, pm.repeatedReturnCount / C.RETURN_FULL);
      if (pm.isReturnPlace || pm.valences.includes("return_place") || pm.valences.includes("route_node")) {
        isCorePlace = true;
      }
    }
    const cu = corridorTileUse.get(tileKey);
    if (cu !== undefined) {
      boost += C.CORRIDOR_W * Math.min(1, cu.use / C.USE_FULL);
    }
    if (catchment.has(tileKey)) {
      boost += C.ANCHOR_W;
      isCorePlace = true;
    }
    const am = anchorMem[tileId];
    if (am !== undefined) {
      boost += C.ANCHOR_MEM_W * Math.min(1, am.anchoredSeasonCount / C.USE_FULL);
    }
    if (tetherWater === tileKey || isReliableWater(tileKey)) {
      boost += C.WATER_W;
      isCorePlace = true;
    }
    const recentTick = recentTiles.get(tileKey);
    if (recentTick !== undefined) {
      boost += C.RECENT_W;
    }

    let lastUsed = Number(record.lastObservedAt.tick);
    if (pm !== undefined) {
      lastUsed = Math.max(lastUsed, Number(pm.lastObservedAt.tick));
    }
    if (cu !== undefined) {
      lastUsed = Math.max(lastUsed, cu.tick);
    }
    if (am !== undefined) {
      lastUsed = Math.max(lastUsed, Number(am.lastAnchoredTick));
    }
    if (recentTick !== undefined) {
      lastUsed = Math.max(lastUsed, recentTick);
    }
    const age = Math.max(0, tick - lastUsed);
    const recency = clamp(1 - age / C.DECAY_WINDOW, C.RECENCY_FLOOR, 1);

    const familiarity = clamp01((base + boost) * recency);

    if (isCorePlace || familiarity >= C.CORE_THRESHOLD) {
      coreTiles.push(tileId);
    } else if (familiarity >= C.FAMILIAR_THRESHOLD) {
      familiarTiles.push(tileId);
    } else if (familiarity >= C.EDGE_FLOOR) {
      edgeTiles.push(tileId);
    }
  }

  // Core places (compact, bounded samples).
  let bestReturn: { tileId: TileId; attachment: number } | undefined;
  for (const pm of Object.values(place)) {
    if (pm.isReturnPlace && (bestReturn === undefined || pm.attachment > bestReturn.attachment)) {
      bestReturn = { tileId: pm.tileId, attachment: pm.attachment };
    }
  }
  const campCore = anchor?.anchorTileId ?? bestReturn?.tileId;

  let bestWater: { tileId: TileId; reliability: number } | undefined;
  for (const obs of Object.values(ecology)) {
    if (obs.domain !== "water_reliability") {
      continue;
    }
    const reliability = Math.max(0, ...Object.values(obs.seasonalReliabilityBySeason).map((r) => r ?? 0));
    if (reliability >= C.WATER_RELIABILITY_MIN && (bestWater === undefined || reliability > bestWater.reliability)) {
      bestWater = { tileId: obs.tileId, reliability };
    }
  }
  const waterCore = anchor?.tetheringWaterTileId ?? bestWater?.tileId;

  const routeCorridorTiles = Object.values(corridors)
    .slice()
    .sort((a, b) => b.useCount - a.useCount)
    .flatMap((corridor) => [corridor.fromTileId, corridor.toTileId])
    .filter((tileId, index, all) => all.indexOf(tileId) === index)
    .slice(0, C.CORE_SAMPLE_CAP);

  const activityZoneTiles: TileId[] = [];
  for (const trip of band.recentIntraSeasonTrips ?? []) {
    if (tick - Number(trip.tick) <= C.RECENT_WINDOW && !activityZoneTiles.includes(trip.targetTileId)) {
      activityZoneTiles.push(trip.targetTileId);
      if (activityZoneTiles.length >= C.CORE_SAMPLE_CAP) {
        break;
      }
    }
  }

  const rangeTotal = coreTiles.length + familiarTiles.length + edgeTiles.length;
  const observedTotal = Object.keys(observed).length;
  const hasMeaningfulRange = rangeTotal >= C.MIN_RANGE_TILES || anchor !== undefined || campCore !== undefined;

  return {
    bandId: band.id,
    currentTick,
    coreTiles,
    familiarTiles,
    edgeTiles,
    corePlaces: { campCore, waterCore, routeCorridorTiles, activityZoneTiles },
    counts: { core: coreTiles.length, familiar: familiarTiles.length, edge: edgeTiles.length, rangeTotal, observedTotal },
    hasMeaningfulRange,
    derivedFromKnownMemoryOnly: true,
    noHiddenTruthScan: true,
    noEconomyCoupling: true,
    noBehaviorChange: true,
  };
}

// Module-local intent sets (sim-side; do NOT import the UI's bandSummary sets).
const MOVE_INTENTS: ReadonlySet<MobilityIntentKind> = new Set([
  "follow_river_corridor",
  "seek_better_water",
  "cross_pass",
  "return_to_known_good_area",
  "avoid_risk",
]);
const EXPLORE_INTENTS: ReadonlySet<MobilityIntentKind> = new Set([
  "expand_known_world",
  "seek_new_range",
  "frontier_dispersal",
  "daughter_range_expansion",
  "probe_wetland_or_lake",
  "probe_coast",
]);
const FOUNDING_INTENTS: ReadonlySet<MobilityIntentKind> = new Set([
  "seek_new_range",
  "frontier_dispersal",
  "daughter_range_expansion",
]);

export function classifyMovementContext(
  band: Band,
  range: FamiliarCountrySummary,
  currentTick: TickNumber,
): MovementContext {
  const C = RANGE1_CONSTANTS;
  if (!range.hasMeaningfulRange) {
    return "unsettled_no_range";
  }
  const tick = Number(currentTick);
  const coreSet = new Set(range.coreTiles.map(String));
  const familiarSet = new Set(range.familiarTiles.map(String));
  const edgeSet = new Set(range.edgeTiles.map(String));
  const inRange = (tileKey: string): boolean => coreSet.has(tileKey) || familiarSet.has(tileKey);
  const pos = String(band.position);
  const waterCore = range.corePlaces.waterCore !== undefined ? String(range.corePlaces.waterCore) : undefined;

  const lastMove = (band.recentResidentialMoveEvents ?? [])[0]; // newest-first
  const movedRecently = lastMove !== undefined && tick - Number(lastMove.tick) <= C.MOVE_RECENCY_TICKS;
  const intentKind = band.currentIntent?.kind;
  const isMoving =
    movedRecently ||
    band.status === "moving" ||
    band.status === "splitting" ||
    (intentKind !== undefined && (MOVE_INTENTS.has(intentKind) || EXPLORE_INTENTS.has(intentKind)));

  if (!isMoving) {
    if (waterCore !== undefined && pos === waterCore) {
      return "working_known_water";
    }
    if ((band.seasonalRound?.confidence ?? 0) >= C.SEASONAL_ROUND_CONFIDENCE_MIN && range.counts.rangeTotal >= C.MIN_RANGE_TILES) {
      return "seasonal_round";
    }
    return "within_known_range";
  }

  const dest = lastMove !== undefined ? String(lastMove.toTileId) : undefined;
  if (dest !== undefined) {
    if (inRange(dest) && waterCore !== undefined && dest === waterCore) {
      return "working_known_water";
    }
    if (inRange(dest)) {
      // An in-range relocation by a band with a confident learned seasonal cycle reads as
      // its seasonal round; otherwise it is a local camp shift. Both stay inside familiar
      // country, so neither is generic migration.
      if ((band.seasonalRound?.confidence ?? 0) >= C.SEASONAL_ROUND_CONFIDENCE_MIN) {
        return "seasonal_round";
      }
      return "local_camp_shift";
    }
    if (edgeSet.has(dest)) {
      return "range_edge_probe";
    }
    if (band.frontierResidence?.established === true || (intentKind !== undefined && FOUNDING_INTENTS.has(intentKind))) {
      return "founding_new_range";
    }
    return "leaving_familiar_country";
  }

  // Moving by intent only (no residential relocation yet).
  if (intentKind !== undefined && FOUNDING_INTENTS.has(intentKind)) {
    return "founding_new_range";
  }
  if (intentKind !== undefined && EXPLORE_INTENTS.has(intentKind)) {
    return "range_edge_probe";
  }
  return "within_known_range";
}

// RANGE-2 — read-only daughter inherited-range context. Fission already seeds daughters with
// degraded (behaviour-affecting) parent memory; this adds NO seeding — it only classifies the
// daughter's (already-inherited) familiar country relative to the parent's range. Pure, never
// called in stepSim.
export type ParentRangeRelation =
  | "inside_parent_range"
  | "parent_range_edge"
  | "outside_parent_range"
  | "no_parent_data";

export interface InheritedRangeContext {
  readonly daughterBandId: BandId;
  readonly parentBandId?: BandId;
  readonly relation: ParentRangeRelation;
  readonly daughterRange: FamiliarCountrySummary;
  readonly parentRangeCounts?: {
    readonly core: number;
    readonly familiar: number;
    readonly edge: number;
    readonly rangeTotal: number;
  };
  readonly sharedRangeTileCount: number;
  readonly derivedFromKnownMemoryOnly: true;
  readonly noHiddenTruthScan: true;
  readonly noEconomyCoupling: true;
  readonly noBehaviorChange: true;
}

export function deriveInheritedRangeContext(
  daughter: Band,
  parent: Band | undefined,
  currentTick: TickNumber,
): InheritedRangeContext {
  const daughterRange = deriveFamiliarCountry(daughter, currentTick);
  const base = {
    daughterBandId: daughter.id,
    parentBandId: parent?.id,
    daughterRange,
    derivedFromKnownMemoryOnly: true as const,
    noHiddenTruthScan: true as const,
    noEconomyCoupling: true as const,
    noBehaviorChange: true as const,
  };

  if (parent === undefined) {
    return { ...base, relation: "no_parent_data", sharedRangeTileCount: 0 };
  }
  const parentRange = deriveFamiliarCountry(parent, currentTick);
  if (!parentRange.hasMeaningfulRange) {
    return { ...base, relation: "no_parent_data", sharedRangeTileCount: 0 };
  }

  const parentCore = new Set(parentRange.coreTiles.map(String));
  const parentFamiliar = new Set(parentRange.familiarTiles.map(String));
  const parentEdge = new Set(parentRange.edgeTiles.map(String));
  const pos = String(daughter.position);
  const relation: ParentRangeRelation =
    parentCore.has(pos) || parentFamiliar.has(pos)
      ? "inside_parent_range"
      : parentEdge.has(pos)
        ? "parent_range_edge"
        : "outside_parent_range";

  const parentAll = new Set<string>([...parentCore, ...parentFamiliar, ...parentEdge]);
  let sharedRangeTileCount = 0;
  for (const tileId of [...daughterRange.coreTiles, ...daughterRange.familiarTiles, ...daughterRange.edgeTiles]) {
    if (parentAll.has(String(tileId))) {
      sharedRangeTileCount += 1;
    }
  }

  return {
    ...base,
    relation,
    parentRangeCounts: {
      core: parentRange.counts.core,
      familiar: parentRange.counts.familiar,
      edge: parentRange.counts.edge,
      rangeTotal: parentRange.counts.rangeTotal,
    },
    sharedRangeTileCount,
  };
}

// RANGE-3 shared helpers (pure, read-only) — reused by socialRangeRecognition / lineageIdentity.
export function familiarCountryTileSet(summary: FamiliarCountrySummary): Set<string> {
  const set = new Set<string>();
  for (const tileId of summary.coreTiles) {
    set.add(String(tileId));
  }
  for (const tileId of summary.familiarTiles) {
    set.add(String(tileId));
  }
  for (const tileId of summary.edgeTiles) {
    set.add(String(tileId));
  }
  return set;
}

export function familiarCountryWaterCores(summary: FamiliarCountrySummary): readonly TileId[] {
  const cores: TileId[] = [];
  if (summary.corePlaces.waterCore !== undefined) {
    cores.push(summary.corePlaces.waterCore);
  }
  return cores;
}
