import type { TickContextCache } from "./contextCache";
import type { Band } from "./types";
import type { BandId, TileId } from "../core/types";
import { getTile } from "../world/generate";
import type { WorldState } from "../world/types";

// Shared catchment pressure (checkpoint 2J.1).
//
// Overlapping bands draw from the same reachable support tiles, so a rich
// delta/coast/wetland is NOT a private infinite food bubble for every band that
// sits on it. This module builds, once per TickContextCache, a deterministic and
// bounded per-tile "claim" index: each active band projects a bounded foraging
// footprint (its persisted anchor catchment, or a small ring-walk over its OWN
// known tiles), weighted by its foraging draw and distance decay. A tile's support
// is then divided among its claimants in proportion to their claim weight.
//
// Anti-omniscient: a band never reads other bands' identities or memories here —
// it simply experiences a smaller share of a contested patch (real exploitation
// competition), exactly as overlapping foragers would. Bounded: each footprint is
// capped, and the index is memoized on the cache (built at most once per cache).

const MAX_FOOTPRINT_TILES = 16;
const FOOTPRINT_FALLBACK_RADIUS = 2;

export interface TileClaim {
  readonly totalWeight: number;
  readonly claimantBandIds: readonly BandId[];
}

export interface FootprintTile {
  readonly tileId: TileId;
  readonly distance: number;
  readonly weight: number;
}

export interface SharedCatchmentIndex {
  readonly claimsByTileId: ReadonlyMap<TileId, TileClaim>;
  readonly footprintByBandId: ReadonlyMap<BandId, readonly FootprintTile[]>;
}

// The band's bounded foraging footprint: the tiles it actually draws support from,
// each with a distance (from the band's current position) and a claim weight. This
// is the single source of truth shared by the shared-catchment index AND the
// carrying-capacity yield sum, so "what the band forages" and "what it competes
// for" never diverge.
export function getBandForagingFootprint(
  world: WorldState,
  band: Band,
): readonly FootprintTile[] {
  const originTile = getTile(world, band.position);

  if (originTile === undefined) {
    return [];
  }

  const draw = getBandForagingDraw(band);
  const candidateIds = collectFootprintCandidateIds(world, band, band.position);
  const tiles: FootprintTile[] = [];

  for (const tileId of candidateIds) {
    const record = band.knowledge.observedTiles[tileId];
    const tile = getTile(world, tileId);

    // Only the band's OWN known, existing tiles contribute support. This mirrors
    // the carrying-capacity yield sum exactly (anchor catchment, or a radius-2
    // ring fallback), so a solo band's support is unchanged and only overlapping
    // bands degrade each other. The candidate set is already bounded.
    if (record === undefined || tile === undefined) {
      continue;
    }

    const distance = gridDistance(originTile.coord, tile.coord);

    tiles.push({ tileId, distance, weight: round4(draw * distanceDecay(distance)) });
  }

  return tiles
    .sort((left, right) =>
      left.distance === right.distance
        ? String(left.tileId).localeCompare(String(right.tileId))
        : left.distance - right.distance,
    )
    .slice(0, MAX_FOOTPRINT_TILES);
}

// Memoized accessor: builds the index on first use for a given cache and reuses it
// thereafter. The cache is a fixed per-pass world snapshot, so the index is stable.
export function getSharedCatchmentIndex(
  world: WorldState,
  cache: TickContextCache,
): SharedCatchmentIndex {
  if (cache.sharedCatchmentMemo.value === undefined) {
    cache.sharedCatchmentMemo.value = buildSharedCatchmentIndex(world, cache);
  }

  return cache.sharedCatchmentMemo.value;
}

export function buildSharedCatchmentIndex(
  world: WorldState,
  cache: TickContextCache,
): SharedCatchmentIndex {
  const footprintByBandId = new Map<BandId, readonly FootprintTile[]>();
  const claims = new Map<TileId, { totalWeight: number; claimantBandIds: BandId[] }>();

  // cache.activeBandIds is already sorted, so accumulation order is deterministic.
  for (const bandId of cache.activeBandIds) {
    const band = world.bands[bandId];

    if (band === undefined) {
      continue;
    }

    const footprint = getBandForagingFootprint(world, band);
    footprintByBandId.set(bandId, footprint);

    for (const tile of footprint) {
      const existing = claims.get(tile.tileId);

      if (existing === undefined) {
        claims.set(tile.tileId, { totalWeight: tile.weight, claimantBandIds: [bandId] });
      } else {
        existing.totalWeight += tile.weight;
        existing.claimantBandIds.push(bandId);
      }
    }
  }

  const claimsByTileId = new Map<TileId, TileClaim>();

  for (const [tileId, claim] of claims) {
    claimsByTileId.set(tileId, {
      totalWeight: round4(claim.totalWeight),
      claimantBandIds: claim.claimantBandIds.slice().sort(compareBandIds),
    });
  }

  return { claimsByTileId, footprintByBandId };
}

// The fraction of a tile's support this band receives: its own claim weight over
// the total claim on that tile. 1.0 when it is the sole claimant (private tile).
export function getTileSupportShare(
  index: SharedCatchmentIndex,
  tileId: TileId,
  ownWeight: number,
): number {
  const claim = index.claimsByTileId.get(tileId);

  if (claim === undefined || claim.totalWeight <= 0 || ownWeight <= 0) {
    return 1;
  }

  return clamp01(ownWeight / claim.totalWeight);
}

// All other active bands that share at least one footprint tile with this band.
export function getOverlappingBandIds(
  index: SharedCatchmentIndex,
  bandId: BandId,
): readonly BandId[] {
  const own = index.footprintByBandId.get(bandId);

  if (own === undefined) {
    return [];
  }

  const overlapping = new Set<BandId>();

  for (const tile of own) {
    const claim = index.claimsByTileId.get(tile.tileId);

    if (claim === undefined) {
      continue;
    }

    for (const otherId of claim.claimantBandIds) {
      if (otherId !== bandId) {
        overlapping.add(otherId);
      }
    }
  }

  return [...overlapping].sort(compareBandIds);
}

function collectFootprintCandidateIds(
  world: WorldState,
  band: Band,
  originTileId: TileId,
): readonly TileId[] {
  const anchorCatchment = band.residentialAnchor?.catchmentTileIds;
  const candidates = new Set<TileId>([originTileId]);

  if (anchorCatchment !== undefined && anchorCatchment.length > 0) {
    for (const tileId of anchorCatchment) {
      candidates.add(tileId);
    }

    return [...candidates];
  }

  // Fallback foraging range before an anchor forms: a bounded ring-walk outward
  // over grid topology to FOOTPRINT_FALLBACK_RADIUS (O(radius^2), independent of
  // how many tiles the band knows). Only known tiles are scored later.
  let frontier: TileId[] = [originTileId];

  for (let depth = 0; depth < FOOTPRINT_FALLBACK_RADIUS; depth += 1) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      const tile = getTile(world, tileId);

      if (tile === undefined) {
        continue;
      }

      for (const neighborId of tile.neighbors) {
        if (!candidates.has(neighborId)) {
          candidates.add(neighborId);
          next.push(neighborId);
        }
      }
    }

    frontier = next;
  }

  return [...candidates];
}

// Foraging draw approximates how hard the band pulls on its catchment. Matches the
// adult-equivalent demand formula in carryingCapacity.derivePopulationDemand so the
// shared division and the demand denominator are on the same scale.
function getBandForagingDraw(band: Band): number {
  const demo = band.demography;
  const adults = Math.max(0, demo.workingAdults);
  const dependents = Math.max(0, demo.dependents);
  const elders = Math.max(0, demo.elders);

  return Math.max(1, adults * 1.0 + dependents * 0.65 + elders * 0.85);
}

function distanceDecay(distance: number): number {
  if (distance <= 0) {
    return 1;
  }

  if (distance === 1) {
    return 0.7;
  }

  if (distance === 2) {
    return 0.45;
  }

  return 0.3;
}

function gridDistance(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function compareBandIds(left: BandId, right: BandId): number {
  return String(left).localeCompare(String(right));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
