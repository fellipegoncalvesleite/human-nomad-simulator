// Persistent local depletion / regeneration v0 (checkpoint M0.14).
//
// WHY: M0.11 models CROWDING — an instantaneous, memoryless competition effect
// that vanishes the moment a band leaves. It does not model DEGRADATION: the
// user's year-300 visual audit found 28 bands and 1,200+ people foraging a
// delta exactly as pristine as on day one, and every newcomer arriving at a
// virgin estuary. Real sustained extraction wears the local resource base, and
// abandoned places recover slowly. This module is that physics.
//
// WHAT: a SPARSE, bounded, slowly-recovering per-tile depletion stock on the
// world (never on the immutable tiles record — caches key on its reference).
// Each season, every tile's depletion rises with the TOTAL extraction pressure
// actually placed on it — the 2J.1 shared-catchment claim index, which the
// engine already computes and memoizes per tick — and decays toward zero at a
// rate scaled by the tile's own regeneration profile when use stops.
//
// HARD SCOPE LOCK (M0.14):
//   * PHYSICAL TRUTH, not knowledge: depletion exists in the world. Bands
//     experience it through their own realized foraging support and through
//     what they OBSERVE when present (observation captures worn richness) —
//     never through remote truth reads.
//   * No forced migration, no mortality, no global richness reduction, no
//     permanent desertification (hard cap + guaranteed regeneration).
//   * Crowding (M0.11) stays separate — instantaneous competition and
//     accumulated wear are different forces; both are real.
//   * Deterministic (sorted iteration), bounded (sparse record, cap 0.85,
//     entries below the floor are dropped), no unseeded random call / any / UI imports.

import { getSharedCatchmentIndex } from "../agents/sharedCatchment";
import type { TickContextCache } from "../agents/contextCache";
import type { Band } from "../agents/types";
import type { TileId } from "../core/types";
import type { Tile, WorldState } from "./types";

// Max share of a tile's yield that wear can remove (cap 0.85 × weight 0.6 ≈
// −51% at absolute worst — heavily degraded, never dead).
export const DEPLETION_YIELD_WEIGHT = 0.6;
// Hard ceiling on stored depletion — never permanent desertification.
const DEPLETION_CAP = 0.85;
// Wear accrued per unit of claim weight per season, saturating as the tile
// degrades. A lone sustainable band (claim ≈ 2) equilibrates near zero; a
// ten-band shared core (claim ≈ 10) equilibrates around 0.5 over decades.
const DEPLETION_GAIN = 0.0008;
// Recovery per season when unused, scaled by the tile's own regeneration
// profile: full recovery from 0.5 wear in roughly 25-40 years.
const REGEN_BASE = 0.0035;
// Entries below this are dropped from the sparse record.
const DEPLETION_FLOOR = 0.005;
// Dormant-tile optimization: if an old depleted tile is not currently claimed
// and no active band is near it, skip the full tile-regeneration profile read and
// use a cheap scalar offstage recovery until the sparse entry drops.
const DORMANT_DEPLETION_ACTIVE_RADIUS = 6;
const DORMANT_REGEN_BASE = REGEN_BASE * 0.75;

export function getTileDepletion(world: WorldState, tileId: TileId): number {
  return world.tileDepletion?.[tileId] ?? 0;
}

// What a band standing at (or observing) this tile actually finds: the tile's
// base richness reduced by its CURRENT physical wear. Used at observation time
// so beliefs reflect what was seen when present — never read remotely.
export function getDepletionAdjustedRichness(world: WorldState, tile: Tile): number {
  const wear = getTileDepletion(world, tile.id);

  if (wear <= 0) {
    return tile.resourceProfile.baseRichness;
  }

  return round4(tile.resourceProfile.baseRichness * (1 - wear * DEPLETION_YIELD_WEIGHT));
}

// Multiplier applied to REALIZED tile support in the carrying-capacity sum.
export function getDepletionYieldMultiplier(world: WorldState, tileId: TileId): number {
  const wear = getTileDepletion(world, tileId);

  return wear <= 0 ? 1 : 1 - wear * DEPLETION_YIELD_WEIGHT;
}

// One bounded depletion/regeneration step per season. Reads the tick's
// (memoized) shared-catchment claim index — the per-tile extraction that
// actually happened — and advances the sparse stock deterministically.
export function advanceTileDepletion(
  world: WorldState,
  cache: TickContextCache,
): WorldState {
  const index = getSharedCatchmentIndex(world, cache);
  const previous = world.tileDepletion ?? {};
  const touched = new Set<string>(Object.keys(previous));

  for (const tileId of index.claimsByTileId.keys()) {
    touched.add(String(tileId));
  }

  if (touched.size === 0) {
    return world.tileDepletion === undefined ? world : { ...world, tileDepletion: {} };
  }

  const orderedTileIds = [...touched].sort();
  const next: Record<string, number> = {};
  const activeDepletionTileIds = collectActiveDepletionTileIds(world);

  for (const tileId of orderedTileIds) {
    const current = previous[tileId as TileId] ?? 0;
    const claim = index.claimsByTileId.get(tileId as TileId)?.totalWeight ?? 0;

    if (claim <= 0 && current > 0 && !activeDepletionTileIds.has(tileId)) {
      const value = Math.max(0, current - DORMANT_REGEN_BASE);

      if (value >= DEPLETION_FLOOR) {
        next[tileId] = round4(value);
      }
      continue;
    }

    const tile = world.tiles[tileId as TileId];

    if (tile === undefined) {
      continue;
    }

    const regen = REGEN_BASE * (0.5 + tile.resourceProfile.resourceRegenerationRate);
    const value = Math.min(
      DEPLETION_CAP,
      Math.max(0, current + DEPLETION_GAIN * claim * (1 - current) - regen),
    );

    if (value >= DEPLETION_FLOOR) {
      next[tileId] = round4(value);
    }
  }

  return { ...world, tileDepletion: next as Readonly<Record<TileId, number>> };
}

function collectActiveDepletionTileIds(world: WorldState): ReadonlySet<string> {
  const activeTileIds = new Set<string>();

  for (const band of Object.values(world.bands)) {
    if (!isActiveDepletionBand(band)) {
      continue;
    }

    addTileNeighborhood(world, band.position, activeTileIds);
  }

  return activeTileIds;
}

function isActiveDepletionBand(band: Band): boolean {
  return (
    band.status !== "dispersed" &&
    band.viability?.status !== "absorbed" &&
    band.viability?.status !== "extinct"
  );
}

function addTileNeighborhood(
  world: WorldState,
  originTileId: TileId,
  activeTileIds: Set<string>,
): void {
  let frontier: readonly TileId[] = [originTileId];
  const seen = new Set<TileId>(frontier);

  activeTileIds.add(String(originTileId));

  for (let depth = 0; depth < DORMANT_DEPLETION_ACTIVE_RADIUS; depth += 1) {
    const nextFrontier: TileId[] = [];

    for (const tileId of frontier) {
      const tile = world.tiles[tileId];

      if (tile === undefined) {
        continue;
      }

      for (const neighborId of tile.neighbors) {
        if (seen.has(neighborId)) {
          continue;
        }

        seen.add(neighborId);
        activeTileIds.add(String(neighborId));
        nextFrontier.push(neighborId);
      }
    }

    frontier = nextFrontier;

    if (frontier.length === 0) {
      break;
    }
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
