/*
 * PRE-RUN-MAP-MAKER-1 — setup-only deterministic terrain painting.
 *
 * A terrain edit is part of the run CONFIG (SimWorldKind.terrainEdits), applied
 * once while building the initial world — BEFORE any band spawns — so the whole
 * derived substrate (spawn scoring, carrying capacity, fauna/plant/forest
 * geography, hydrology-adjacent flags) re-derives from the edited tiles record.
 * Same base map + same sorted edits ⇒ byte-identical world on the main thread
 * and in the worker (both call initSimWorld). Nothing here runs after tick 0.
 *
 * v1 scope (honest constraints, reported by validateTerrainEdits):
 * - River tiles are LOCKED: rivers/crossings are authored map structures with
 *   segment profiles and crossing edges keyed to specific tiles; repainting them
 *   would orphan those records. Painting still water ("lake") is supported.
 * - Painting land over generated water does not retro-lower the generated
 *   water-access of distant tiles (macro water geometry is per-map); adjacency
 *   flags and the painted tiles themselves are always recomputed.
 */

import type { Coord, TileId } from "../core/types";
import type {
  CarryingCapacityProfile,
  TerrainKind,
  Tile,
  TileResourceProfile,
  WorldState,
} from "./types";
import {
  getCarryingCapacity,
  getMovementCost,
  getPeakSeasons,
  getTileAtCoord,
  makeTileId,
} from "./generate";

/** Paintable terrain kinds. Rivers/coast strips derive; they are not painted. */
export type TerrainPaintKind =
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "wetlands"
  | "desert"
  | "tundra"
  | "lake";

export const TERRAIN_PAINT_KINDS: readonly TerrainPaintKind[] = [
  "plains",
  "forest",
  "hills",
  "mountains",
  "wetlands",
  "desert",
  "tundra",
  "lake",
];

export interface TerrainEdit {
  readonly x: number;
  readonly y: number;
  readonly terrain: TerrainPaintKind;
}

export type TerrainEditRejectionReason = "outside_map" | "river_tile_locked";

export interface TerrainEditValidation {
  readonly accepted: readonly TerrainEdit[];
  readonly rejected: readonly {
    readonly edit: TerrainEdit;
    readonly reason: TerrainEditRejectionReason;
  }[];
}

// Canonical physical anchors per painted terrain. Deterministic per-tile jitter
// (hashed from tile id + terrain + map seed) keeps painted areas from reading as
// perfectly uniform while staying reproducible.
interface PaintAnchor {
  readonly elevation: number;
  readonly waterAccess: number;
  readonly baseRichness: number;
  readonly floodRisk: number;
  readonly droughtRisk: number;
  readonly aquatic: boolean;
}

const PAINT_ANCHORS: Readonly<Record<TerrainPaintKind, PaintAnchor>> = {
  plains: { elevation: 0.3, waterAccess: 0.36, baseRichness: 0.46, floodRisk: 0.1, droughtRisk: 0.3, aquatic: false },
  forest: { elevation: 0.38, waterAccess: 0.44, baseRichness: 0.68, floodRisk: 0.12, droughtRisk: 0.18, aquatic: false },
  hills: { elevation: 0.62, waterAccess: 0.3, baseRichness: 0.4, floodRisk: 0.06, droughtRisk: 0.32, aquatic: false },
  mountains: { elevation: 0.82, waterAccess: 0.22, baseRichness: 0.2, floodRisk: 0.04, droughtRisk: 0.36, aquatic: false },
  wetlands: { elevation: 0.16, waterAccess: 0.8, baseRichness: 0.62, floodRisk: 0.58, droughtRisk: 0.06, aquatic: false },
  desert: { elevation: 0.32, waterAccess: 0.08, baseRichness: 0.12, floodRisk: 0.02, droughtRisk: 0.85, aquatic: false },
  tundra: { elevation: 0.42, waterAccess: 0.3, baseRichness: 0.18, floodRisk: 0.06, droughtRisk: 0.4, aquatic: false },
  lake: { elevation: 0.08, waterAccess: 0.95, baseRichness: 0.3, floodRisk: 0.5, droughtRisk: 0, aquatic: true },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// FNV-1a over the edit key — small deterministic jitter source, independent of
// generate.ts internals so painted tiles never depend on module-private noise.
function hashEditKey(key: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) / 0xffffffff;
}

function jitter(seedKey: string, channel: string, amount: number): number {
  return (hashEditKey(`${seedKey}:${channel}`) - 0.5) * 2 * amount;
}

/**
 * Validate edits against a base world: in-bounds and not a river tile. The UI
 * blocks the same cases at paint time; the sim skips rejected edits with the
 * same deterministic rule, so both sides always agree on the applied set.
 */
export function validateTerrainEdits(
  world: WorldState,
  edits: readonly TerrainEdit[] | undefined,
): TerrainEditValidation {
  const accepted: TerrainEdit[] = [];
  const rejected: { edit: TerrainEdit; reason: TerrainEditRejectionReason }[] = [];

  for (const edit of edits ?? []) {
    const tile = getTileAtCoord(world, { x: edit.x, y: edit.y });

    if (tile === undefined) {
      rejected.push({ edit, reason: "outside_map" });
      continue;
    }

    if (tile.isRiver || tile.riverSegmentId !== undefined) {
      rejected.push({ edit, reason: "river_tile_locked" });
      continue;
    }

    accepted.push(edit);
  }

  return { accepted, rejected };
}

function buildPaintedResourceProfile(
  anchor: PaintAnchor,
  seedKey: string,
): { readonly profile: TileResourceProfile; readonly elevation: number; readonly floodRisk: number; readonly droughtRisk: number } {
  const elevation = clamp01(anchor.elevation + jitter(seedKey, "elev", 0.05));
  const waterAccess = clamp01(anchor.waterAccess + jitter(seedKey, "water", 0.05));
  const baseRichness = clamp01(anchor.baseRichness + jitter(seedKey, "rich", 0.06));
  const floodRisk = clamp01(anchor.floodRisk + jitter(seedKey, "flood", 0.04));
  const droughtRisk = clamp01(anchor.droughtRisk + jitter(seedKey, "dry", 0.05));
  const aquaticPotential = clamp01(
    (anchor.aquatic ? 0.78 : 0) + waterAccess * 0.22 + jitter(seedKey, "aqua", 0.04),
  );
  const wildGrainPotential = clamp01(
    0.16 + (1 - droughtRisk) * 0.36 + jitter(seedKey, "grain", 0.08) - floodRisk * 0.12,
  );
  const plantTendingPotential = clamp01(
    baseRichness * 0.48 + waterAccess * 0.34 + wildGrainPotential * 0.22 - floodRisk * 0.1,
  );
  const storageSuitability = clamp01(
    0.3 + elevation * 0.28 + droughtRisk * 0.22 - floodRisk * 0.28,
  );

  return {
    profile: {
      baseRichness,
      waterAccess,
      aquaticPotential,
      wildGrainPotential,
      plantTendingPotential,
      storageSuitability,
      resourceRegenerationRate: clamp01(0.18 + baseRichness * 0.52 + waterAccess * 0.18),
    },
    elevation,
    floodRisk,
    droughtRisk,
  };
}

function buildPaintedTile(base: Tile, terrain: TerrainPaintKind, worldSeed: string): Tile {
  const anchor = PAINT_ANCHORS[terrain];
  const seedKey = `paint:${worldSeed}:${String(base.id)}:${terrain}`;
  const { profile, elevation, floodRisk, droughtRisk } = buildPaintedResourceProfile(anchor, seedKey);
  const diseaseRisk = clamp01(profile.waterAccess * 0.42 + floodRisk * 0.38 + (anchor.aquatic ? 0.14 : 0));
  const movementCost = getMovementCost({
    terrainKind: terrain,
    elevation,
    isAquatic: anchor.aquatic,
    floodRisk,
    droughtRisk,
    fineNoise: hashEditKey(`${seedKey}:noise`),
  });
  const keepRiverAdjacency = !anchor.aquatic;

  return {
    ...base,
    terrainKind: terrain,
    biomeKind: base.biomeKind === undefined ? undefined : "unknown",
    resourceProfile: profile,
    seasonalProfile: {
      seasonalVariance: clamp01(0.18 + droughtRisk * 0.42 + jitter(seedKey, "var", 0.06)),
      peakSeasons: getPeakSeasons(profile.waterAccess, droughtRisk),
      leanSeasons: droughtRisk > 0.55 ? ["summer", "winter"] : ["winter"],
      reliability: clamp01(0.88 - droughtRisk * 0.38 - floodRisk * 0.16),
      expectedWinterStress: clamp01(0.24 + droughtRisk * 0.24 + (1 - profile.storageSuitability) * 0.22),
    },
    riskProfile: {
      floodRisk,
      droughtRisk,
      diseaseRisk,
      depletionRisk: clamp01(profile.baseRichness * 0.28 + (1 - profile.waterAccess) * 0.3),
      climateVolatility: clamp01(0.16 + droughtRisk * 0.28 + floodRisk * 0.18),
    },
    carryingCapacity: getCarryingCapacity(profile, movementCost),
    movementCost,
    elevation,
    isRiver: false,
    isAquatic: anchor.aquatic,
    // Painting land keeps river-adjacency context (the river itself is locked);
    // painting water replaces the land character entirely.
    isFloodplain: keepRiverAdjacency ? base.isFloodplain : false,
    isRiverbank: keepRiverAdjacency ? base.isRiverbank : false,
    isConfluence: false,
    isEstuary: false,
    isMarshChannel: false,
    hasCreek: keepRiverAdjacency ? base.hasCreek : undefined,
    // isCoastal is recomputed for the whole edited neighborhood afterwards.
    isCoastal: false,
  };
}

// Lakeside support: land directly adjacent to painted water gets a shoreline
// water floor (same spirit as generated lakeshores) so a painted lake is
// actually usable. Deterministic and local to the adjacency ring.
function withShorelineSupport(tile: Tile, worldSeed: string): Tile {
  const floorKey = `shore:${worldSeed}:${String(tile.id)}`;
  const waterAccess = Math.max(tile.resourceProfile.waterAccess, clamp01(0.58 + jitter(floorKey, "wa", 0.04)));

  if (waterAccess === tile.resourceProfile.waterAccess) {
    return tile;
  }

  const profile: TileResourceProfile = {
    ...tile.resourceProfile,
    waterAccess,
    aquaticPotential: Math.max(tile.resourceProfile.aquaticPotential, 0.3),
  };
  const riskProfile = {
    ...tile.riskProfile,
    droughtRisk: Math.min(tile.riskProfile.droughtRisk, 0.35),
  };
  const carryingCapacity: CarryingCapacityProfile = getCarryingCapacity(profile, tile.movementCost);

  return { ...tile, resourceProfile: profile, riskProfile, carryingCapacity };
}

const CARDINAL_OFFSETS: readonly Coord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Apply setup terrain edits to a freshly generated world (no bands yet, tick 0).
 * Pure: returns a new world with a new tiles record; the input is untouched.
 * Rejected edits (out of bounds / river-locked) are skipped deterministically.
 * Duplicate coords keep the LAST edit (paint order semantics), and the final
 * per-coord set is applied in sorted order so any stroke history that ends in
 * the same per-tile paints yields the same world.
 */
export function applyTerrainEdits(
  world: WorldState,
  edits: readonly TerrainEdit[] | undefined,
): WorldState {
  const { accepted } = validateTerrainEdits(world, edits);

  if (accepted.length === 0) {
    return world;
  }

  const lastPerCoord = new Map<TileId, TerrainEdit>();

  for (const edit of accepted) {
    lastPerCoord.set(makeTileId({ x: edit.x, y: edit.y }), edit);
  }

  const orderedEdits = Array.from(lastPerCoord.entries()).sort(([left], [right]) =>
    String(left).localeCompare(String(right)),
  );
  const worldSeed = String(world.seed);
  const nextTiles: Record<string, Tile> = { ...world.tiles };
  const touched = new Set<TileId>();

  for (const [tileId, edit] of orderedEdits) {
    const base = world.tiles[tileId];

    if (base === undefined) {
      continue;
    }

    nextTiles[tileId] = buildPaintedTile(base, edit.terrain, worldSeed);
    touched.add(tileId);

    for (const offset of CARDINAL_OFFSETS) {
      const neighborId = makeTileId({ x: edit.x + offset.x, y: edit.y + offset.y });

      if (nextTiles[neighborId] !== undefined) {
        touched.add(neighborId);
      }
    }
  }

  // Recompute adjacency-derived state for the touched neighborhood, in sorted
  // order for determinism: coastal flags always; shoreline water support where
  // land now borders painted still water.
  const touchedIds = Array.from(touched).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );

  for (const tileId of touchedIds) {
    const tile = nextTiles[tileId];

    if (tile === undefined || tile.isAquatic) {
      continue;
    }

    let bordersWater = false;
    let bordersPaintedWater = false;

    for (const offset of CARDINAL_OFFSETS) {
      const neighbor = nextTiles[makeTileId({ x: tile.coord.x + offset.x, y: tile.coord.y + offset.y })];

      if (neighbor !== undefined && neighbor.isAquatic) {
        bordersWater = true;

        if (lastPerCoord.has(neighbor.id)) {
          bordersPaintedWater = true;
        }
      }
    }

    let next = tile.isCoastal === bordersWater ? tile : { ...tile, isCoastal: bordersWater };

    if (bordersPaintedWater) {
      next = withShorelineSupport(next, worldSeed);
    }

    if (next !== tile) {
      nextTiles[tileId] = next;
    }
  }

  return {
    ...world,
    tiles: nextTiles as Readonly<Record<TileId, Tile>>,
  };
}

export interface SetupValidationIssue {
  readonly kind:
    | "band_start_on_water"
    | "band_start_impassable"
    | "band_start_missing_tile"
    | "insufficient_land";
  readonly bandId?: string;
  readonly tileId?: string;
  readonly message: string;
}

/**
 * Map-level setup validation on the BUILT world (after edits + roster edits):
 * every band must start on passable land and the map must keep enough land for
 * the roster. Used by the setup UI to block Play on a broken map, and by the
 * targeted audit.
 */
export function validateWorldSetup(world: WorldState): readonly SetupValidationIssue[] {
  const issues: SetupValidationIssue[] = [];
  const bands = Object.values(world.bands).sort((left, right) =>
    String(left.id).localeCompare(String(right.id)),
  );

  for (const band of bands) {
    const tile = world.tiles[band.position];

    if (tile === undefined) {
      issues.push({
        kind: "band_start_missing_tile",
        bandId: String(band.id),
        tileId: String(band.position),
        message: `${band.name} starts on a tile that does not exist.`,
      });
      continue;
    }

    if (tile.isAquatic) {
      issues.push({
        kind: "band_start_on_water",
        bandId: String(band.id),
        tileId: String(tile.id),
        message: `${band.name} starts on water — move the band or repaint the tile.`,
      });
      continue;
    }

    if (!Number.isFinite(tile.movementCost) || tile.movementCost > 4.5) {
      issues.push({
        kind: "band_start_impassable",
        bandId: String(band.id),
        tileId: String(tile.id),
        message: `${band.name} starts on nearly impassable ground.`,
      });
    }
  }

  let landTiles = 0;

  for (const tile of Object.values(world.tiles)) {
    if (!tile.isAquatic) {
      landTiles += 1;
    }
  }

  const neededLand = Math.max(12, bands.length * 4);

  if (landTiles < neededLand) {
    issues.push({
      kind: "insufficient_land",
      message: `Only ${landTiles} land tiles remain — not enough for ${bands.length} starting bands.`,
    });
  }

  return issues;
}
