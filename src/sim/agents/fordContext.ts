// RANGE-3 — Ford Context substrate (READ-ONLY, derived).
//
// Pure & deterministic: no unseeded random call, no `any`, no UI/render/store imports, and NEVER
// called inside stepSim — so the simulation is byte-identical. Surfaces a bounded, read-only
// view of river crossings on band-known tiles. No omniscient reveal: only crossings whose
// tile endpoints the band has personally observed, or which the band has a crossing memory
// for, are included. Reads crossing TOPOLOGY only — no richness/yield/seasonal scan.

import type { Band } from "./types";
import type { BandId, RiverId, TileId } from "../core/types";
import type { RiverCrossingClass, RiverCrossingProfile } from "../world/types";
import type { WorldState } from "../world/types";
import { makeRiverCrossingKey } from "../world/hydrography";

export const FORD_CONTEXT_CONSTANTS = {
  MAX_FORDS: 8,
} as const;

export interface KnownFord {
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly riverId: RiverId;
  readonly crossingClass: RiverCrossingClass;
  readonly knownFord: boolean;
  readonly baseCrossingCost: number;
  readonly hasMemory: boolean; // band has a KnownCrossingMemory for it
  readonly useCount: number; // 0 if no memory
  readonly successConfidence: number; // 0 if no memory
}

export interface FordContext {
  readonly bandId: BandId;
  readonly knownFords: readonly KnownFord[];
  readonly counts: {
    readonly total: number;
    readonly withMemory: number;
    readonly usable: number;
  };
  readonly derivedFromKnownMemoryOnly: true;
  readonly noHiddenTruthScan: true;
}

// Crossing classes that the band can use without special capability.
const USABLE_CROSSING_CLASSES: ReadonlySet<RiverCrossingClass> = new Set<RiverCrossingClass>([
  "ford",
  "seasonal_ford",
  "shallow_crossing",
]);

interface RiverCrossingIndex {
  readonly byEndpoint: ReadonlyMap<TileId, readonly RiverCrossingProfile[]>;
  readonly byKey: ReadonlyMap<string, RiverCrossingProfile>;
}

const riverCrossingIndexByTopology = new WeakMap<
  WorldState["riverCrossings"],
  RiverCrossingIndex
>();

function getRiverCrossingIndex(crossings: WorldState["riverCrossings"]): RiverCrossingIndex {
  const cached = riverCrossingIndexByTopology.get(crossings);

  if (cached !== undefined) {
    return cached;
  }

  const byEndpoint = new Map<TileId, RiverCrossingProfile[]>();
  const byKey = new Map<string, RiverCrossingProfile>();

  for (const crossing of Object.values(crossings)) {
    if (crossing === undefined) {
      continue;
    }

    const key = makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId);
    byKey.set(key, crossing);

    for (const endpoint of [crossing.fromTileId, crossing.toTileId]) {
      const existing = byEndpoint.get(endpoint) ?? [];
      byEndpoint.set(endpoint, [...existing, crossing]);
    }
  }

  const index: RiverCrossingIndex = { byEndpoint, byKey };
  riverCrossingIndexByTopology.set(crossings, index);

  return index;
}

export function deriveFordContext(band: Band, world: WorldState): FordContext {
  const crossings = world.riverCrossings;
  if (crossings === undefined) {
    return {
      bandId: band.id,
      knownFords: [],
      counts: { total: 0, withMemory: 0, usable: 0 },
      derivedFromKnownMemoryOnly: true,
      noHiddenTruthScan: true,
    };
  }

  const observedTiles = band.knowledge.observedTiles;
  const crossingMemories = band.crossingMemories;
  const index = getRiverCrossingIndex(crossings);
  const candidateCrossings = new Map<string, RiverCrossingProfile>();

  for (const tileId of Object.keys(observedTiles) as TileId[]) {
    for (const crossing of index.byEndpoint.get(tileId) ?? []) {
      candidateCrossings.set(makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId), crossing);
    }
  }

  for (const memory of Object.values(crossingMemories)) {
    const crossingKey = makeRiverCrossingKey(memory.crossingTileA, memory.crossingTileB);
    const crossing = index.byKey.get(crossingKey);

    if (crossing !== undefined) {
      candidateCrossings.set(crossingKey, crossing);
    }
  }

  const kept: KnownFord[] = [];

  for (const crossing of candidateCrossings.values()) {
    const crossingKey = makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId);

    const memory = crossingMemories[crossingKey];
    const hasMemory = memory !== undefined;

    kept.push({
      fromTileId: crossing.fromTileId,
      toTileId: crossing.toTileId,
      riverId: crossing.riverId,
      crossingClass: crossing.crossingClass,
      knownFord: crossing.knownFord,
      baseCrossingCost: crossing.baseCrossingCost,
      hasMemory,
      useCount: hasMemory ? memory.useCount : 0,
      successConfidence: hasMemory ? memory.successConfidence : 0,
    });
  }

  // Deterministic sort: by fromTileId string, then toTileId string.
  kept.sort((a, b) => {
    const fromCmp = String(a.fromTileId).localeCompare(String(b.fromTileId));
    if (fromCmp !== 0) {
      return fromCmp;
    }
    return String(a.toTileId).localeCompare(String(b.toTileId));
  });

  // Pre-cap counts (computed from the full kept set before capping to MAX_FORDS).
  const totalPreCap = kept.length;
  let withMemoryPreCap = 0;
  let usablePreCap = 0;
  for (const ford of kept) {
    if (ford.hasMemory) {
      withMemoryPreCap += 1;
    }
    if (ford.knownFord || USABLE_CROSSING_CLASSES.has(ford.crossingClass)) {
      usablePreCap += 1;
    }
  }

  const capped = kept.slice(0, FORD_CONTEXT_CONSTANTS.MAX_FORDS);

  return {
    bandId: band.id,
    knownFords: capped,
    // counts reflect pre-cap totals (full band-known crossing set, not just the top-8 slice)
    counts: {
      total: totalPreCap,
      withMemory: withMemoryPreCap,
      usable: usablePreCap,
    },
    derivedFromKnownMemoryOnly: true,
    noHiddenTruthScan: true,
  };
}
