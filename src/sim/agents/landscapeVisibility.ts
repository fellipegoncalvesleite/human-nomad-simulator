import type { ReasonId } from "../core/types";
import { getTile, getTileAtCoord } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import type {
  Band,
  LandscapeVisibilityCueKind,
  LandscapeVisibilityDirection,
  VisibleLandscapeCue,
} from "./types";

const VISIBILITY_RADIUS_TILES = 10;
const MIN_VISIBILITY_DISTANCE_TILES = 3;
const VISIBLE_CUE_LIMIT = 6;
const VISIBILITY_REFRESH_TICKS = 2;
const STALE_VISIBLE_CUE_TICKS = 16;

interface CueCandidate {
  readonly tile: Tile;
  readonly kind: LandscapeVisibilityCueKind;
  readonly direction: LandscapeVisibilityDirection;
  readonly distanceTiles: number;
  readonly confidence: number;
  readonly blockedByTerrain: boolean;
}

export function advanceVisibleLandscapeCues(world: WorldState, band: Band): readonly VisibleLandscapeCue[] {
  const previous = band.visibleLandscapeCues ?? [];
  if (previous.some((cue) => cue.tick === world.time.tick)) {
    return previous;
  }

  const phase = deterministicIndex(String(band.id), VISIBILITY_REFRESH_TICKS);

  if ((Number(world.time.tick) + phase) % VISIBILITY_REFRESH_TICKS !== 0) {
    return previous
      .filter((cue) => Number(world.time.tick) - Number(cue.tick) <= STALE_VISIBLE_CUE_TICKS)
      .map((cue) => ({
        ...cue,
        status:
          Number(world.time.tick) - Number(cue.tick) > STALE_VISIBLE_CUE_TICKS / 2
            ? "stale"
            : cue.status,
      }));
  }

  const currentTile = getTile(world, band.position);
  if (currentTile === undefined) {
    return previous.filter((cue) => Number(world.time.tick) - Number(cue.tick) <= STALE_VISIBLE_CUE_TICKS);
  }

  const observed = band.knowledge.observedTiles;
  const candidates = collectCueCandidates(world, band, currentTile)
    .filter((candidate) => observed[candidate.tile.id] === undefined)
    .sort(compareCueCandidates);
  const merged = new Map<string, VisibleLandscapeCue>();

  for (const candidate of candidates) {
    if (merged.size >= VISIBLE_CUE_LIMIT) {
      break;
    }
    const key = cueMergeKey(candidate);
    if (merged.has(key)) {
      continue;
    }
    const prior = previous.find(
      (cue) =>
        cue.kind === candidate.kind &&
        cue.direction === candidate.direction &&
        distanceBand(cue.distanceTiles) === distanceBand(candidate.distanceTiles),
    );
    merged.set(key, makeVisibleCue(world, band, currentTile, candidate, prior));
  }

  for (const oldCue of previous) {
    if (merged.size >= VISIBLE_CUE_LIMIT) {
      break;
    }
    if (Number(world.time.tick) - Number(oldCue.tick) > STALE_VISIBLE_CUE_TICKS) {
      continue;
    }
    const key = `${oldCue.kind}:${oldCue.direction}:${distanceBand(oldCue.distanceTiles)}`;
    if (merged.has(key)) {
      continue;
    }
    merged.set(key, {
      ...oldCue,
      status: "stale",
    });
  }

  return [...merged.values()].sort((left, right) => right.confidence - left.confidence || left.cueId.localeCompare(right.cueId));
}

function collectCueCandidates(world: WorldState, band: Band, currentTile: Tile): readonly CueCandidate[] {
  const candidates: CueCandidate[] = [];

  for (let dy = -VISIBILITY_RADIUS_TILES; dy <= VISIBILITY_RADIUS_TILES; dy += 1) {
    for (let dx = -VISIBILITY_RADIUS_TILES; dx <= VISIBILITY_RADIUS_TILES; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const distanceTiles = Math.max(Math.abs(dx), Math.abs(dy));
      if (distanceTiles < MIN_VISIBILITY_DISTANCE_TILES || distanceTiles > VISIBILITY_RADIUS_TILES) {
        continue;
      }

      const tile = getTileAtCoord(world, {
        x: currentTile.coord.x + dx,
        y: currentTile.coord.y + dy,
      });
      if (tile === undefined) {
        continue;
      }

      const kind = classifyVisibleCue(currentTile, tile);
      if (kind === undefined) {
        continue;
      }

      const blockedByTerrain = isLineBlocked(world, currentTile, tile);
      const confidence = visibleCueConfidence(currentTile, tile, distanceTiles, blockedByTerrain, band);
      if (confidence < 0.34) {
        continue;
      }

      candidates.push({
        tile,
        kind,
        direction: directionFromDelta(dx, dy),
        distanceTiles,
        confidence,
        blockedByTerrain,
      });
    }
  }

  return candidates;
}

function classifyVisibleCue(currentTile: Tile, target: Tile): LandscapeVisibilityCueKind | undefined {
  if (target.isEstuary || (target.isConfluence && target.isFloodplain)) {
    return "delta_like_area";
  }
  if (target.terrainKind === "lake" || (target.isAquatic && target.isRiver === false && target.isCoastal === false)) {
    return "lake_shore_visible";
  }
  if (target.terrainKind === "wetlands" || target.isMarshChannel) {
    return "visible_wetland";
  }
  if (target.isRiver || target.isRiverbank || target.hasCreek === true) {
    return "river_or_tributary_corridor";
  }
  if (target.isCoastal || target.isAquatic || target.resourceProfile.waterAccess > 0.7) {
    return "visible_water";
  }
  if (target.terrainKind === "river_valley" || target.isFloodplain) {
    return "open_valley";
  }
  if (
    (currentTile.isRiverbank || currentTile.isFloodplain || currentTile.isRiver) &&
    (target.isRiverbank || target.isFloodplain || target.isRiver) &&
    Math.abs(target.coord.y - currentTile.coord.y) + Math.abs(target.coord.x - currentTile.coord.x) >= 4
  ) {
    return "opposite_bank";
  }
  if (target.terrainKind === "hills" && target.movementCost <= 1.9 && target.elevation > currentTile.elevation + 0.05) {
    return "pass_or_saddle";
  }
  if (target.terrainKind === "mountains" || target.elevation > currentTile.elevation + 0.18) {
    return "higher_ground";
  }
  if (target.terrainKind === "desert" || target.riskProfile.droughtRisk > 0.68) {
    return "dry_or_barren_country";
  }
  if (
    target.resourceProfile.waterAccess > currentTile.resourceProfile.waterAccess + 0.18 ||
    target.terrainKind === "forest" ||
    (target.resourceProfile.baseRichness > currentTile.resourceProfile.baseRichness + 0.22 &&
      target.riskProfile.droughtRisk < 0.55)
  ) {
    return "greener_lowland";
  }

  return undefined;
}

function visibleCueConfidence(
  currentTile: Tile,
  target: Tile,
  distanceTiles: number,
  blockedByTerrain: boolean,
  band: Band,
): number {
  const distanceFactor = clamp01(1 - (distanceTiles - MIN_VISIBILITY_DISTANCE_TILES) / (VISIBILITY_RADIUS_TILES + 2));
  const elevationFactor = clamp01(0.44 + currentTile.elevation * 0.3 + Math.max(0, target.elevation - currentTile.elevation) * 0.22);
  const waterSalience =
    target.isRiver ||
    target.isRiverbank ||
    target.isCoastal ||
    target.isAquatic ||
    target.terrainKind === "wetlands" ||
    target.terrainKind === "lake"
      ? 0.2
      : 0;
  const campPressure = clamp01(
    (band.ecologicalStressCauses?.foodDeficit ?? 0) * 0.1 +
      (band.ecologicalStressCauses?.sharedCatchmentCrowding ?? 0) * 0.08,
  );
  return round2(clamp01(distanceFactor * 0.55 + elevationFactor * 0.25 + waterSalience + campPressure - (blockedByTerrain ? 0.22 : 0)));
}

function isLineBlocked(world: WorldState, from: Tile, to: Tile): boolean {
  const dx = to.coord.x - from.coord.x;
  const dy = to.coord.y - from.coord.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 2) {
    return false;
  }

  const sightCeiling = Math.max(from.elevation, to.elevation) + 0.16;
  for (let step = 1; step < steps; step += 1) {
    const sample = getTileAtCoord(world, {
      x: Math.round(from.coord.x + (dx * step) / steps),
      y: Math.round(from.coord.y + (dy * step) / steps),
    });
    if (sample !== undefined && sample.elevation > sightCeiling && sample.terrainKind === "mountains") {
      return true;
    }
  }
  return false;
}

function makeVisibleCue(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  candidate: CueCandidate,
  prior: VisibleLandscapeCue | undefined,
): VisibleLandscapeCue {
  const reasonId =
    `reason:visible_landscape:${String(band.id)}:${Number(world.time.tick)}:${candidate.kind}:${candidate.direction}` as ReasonId;
  return {
    cueId: `visible:${String(band.id)}:${candidate.kind}:${candidate.direction}:${distanceBand(candidate.distanceTiles)}`,
    bandId: band.id,
    tick: world.time.tick,
    sourceTileId: currentTile.id,
    approximateTileId: candidate.tile.id,
    kind: candidate.kind,
    direction: candidate.direction,
    distanceTiles: candidate.distanceTiles,
    confidence: round2(Math.max(candidate.confidence, prior?.confidence ?? 0)),
    status: "unchecked",
    blockedByTerrain: candidate.blockedByTerrain,
    influencedScoutOrProbeCount: prior?.influencedScoutOrProbeCount ?? 0,
    noObservedTileCreated: true,
    noResourceUnlock: true,
    noDirectRelocation: true,
    reasonIds: [reasonId],
  };
}

function directionFromDelta(dx: number, dy: number): LandscapeVisibilityDirection {
  const angle = Math.atan2(dy, dx);
  const eighth = Math.round(angle / (Math.PI / 4));
  const normalized = (eighth + 8) % 8;
  const directions: readonly LandscapeVisibilityDirection[] = [
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
    "north",
    "northeast",
  ];
  return directions[normalized] ?? "east";
}

function compareCueCandidates(left: CueCandidate, right: CueCandidate): number {
  return (
    right.confidence - left.confidence ||
    left.distanceTiles - right.distanceTiles ||
    left.kind.localeCompare(right.kind) ||
    String(left.tile.id).localeCompare(String(right.tile.id))
  );
}

function cueMergeKey(candidate: CueCandidate): string {
  return `${candidate.kind}:${candidate.direction}:${distanceBand(candidate.distanceTiles)}`;
}

function distanceBand(distanceTiles: number): string {
  if (distanceTiles <= 4) {
    return "near";
  }
  if (distanceTiles <= 7) {
    return "middle";
  }
  return "far";
}

function deterministicIndex(key: string, modulo: number): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, modulo);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
