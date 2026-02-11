import type {
  Band,
  CompressedCorridorSummary,
  PlaceMemoryRecord,
  TravelCorridorMemory,
} from "./types";
import type { TileId } from "../core/types";
import type {
  BroadWaterRole,
  CompressedKnownTileSummary,
  KnownAreaSummary,
  KnowledgeSourceKind,
  KnownTileRecord,
} from "../knowledge/types";
import { getNeighborTiles, getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";

const MAX_EXACT_KNOWN_TILES = 72;
const MAX_EXACT_PLACE_MEMORIES = 72;
const MAX_EXACT_CORRIDORS = 36;
const MAX_COMPRESSED_KNOWN_SUMMARIES = 40;
const MAX_COMPRESSED_AREA_SUMMARIES = 40;
const MAX_COMPRESSED_CORRIDOR_SUMMARIES = 32;
const RECENT_MEMORY_TICK_WINDOW = 96;

export function compressBandMemoryState(world: WorldState, band: Band): Band {
  if (world.time.tick % 4 !== 0) {
    return band;
  }

  const knownCount = Object.keys(band.knowledge.observedTiles).length;
  const placeMemoryCount = Object.keys(band.placeMemory).length;
  const corridorCount = Object.keys(band.travelCorridors).length;

  if (
    knownCount <= MAX_EXACT_KNOWN_TILES &&
    placeMemoryCount <= MAX_EXACT_PLACE_MEMORIES &&
    corridorCount <= MAX_EXACT_CORRIDORS
  ) {
    return band;
  }

  const knownRecords = Object.values(band.knowledge.observedTiles);
  const placeMemories = Object.values(band.placeMemory);
  const corridors = Object.values(band.travelCorridors);

  const retainedKnownTileIds = selectRetainedKnownTileIds(world, band, knownRecords);
  const compressedKnownRecords = knownRecords.filter((record) => !retainedKnownTileIds.has(record.tileId));
  const retainedObservedTiles = knownRecords
    .filter((record) => retainedKnownTileIds.has(record.tileId))
    .map((record) => [record.tileId, record] as const);
  const retainedPlaceMemoryIds = selectRetainedPlaceMemoryIds(band, retainedKnownTileIds, placeMemories);
  const compressedPlaceMemories = placeMemories.filter((memory) => !retainedPlaceMemoryIds.has(memory.tileId));
  const retainedPlaceMemories = placeMemories
    .filter((memory) => retainedPlaceMemoryIds.has(memory.tileId))
    .map((memory) => [memory.tileId, memory] as const);
  const retainedCorridors = selectRetainedCorridors(corridors);
  const retainedCorridorIds = new Set(retainedCorridors.map((corridor) => corridor.id));
  const compressedCorridors = corridors.filter((corridor) => !retainedCorridorIds.has(corridor.id));

  return {
    ...band,
    knowledge: {
      ...band.knowledge,
      observedTiles: Object.fromEntries(retainedObservedTiles) as Readonly<Record<TileId, KnownTileRecord>>,
      compressedKnownTileSummaries: appendCompressedKnownSummary(
        band.knowledge.compressedKnownTileSummaries ?? [],
        world,
        band,
        compressedKnownRecords,
      ),
      knownAreaSummaries: appendKnownAreaSummary(
        band.knowledge.knownAreaSummaries ?? [],
        world,
        band,
        compressedKnownRecords,
        compressedPlaceMemories,
      ),
    },
    placeMemory: Object.fromEntries(retainedPlaceMemories) as Readonly<Record<TileId, PlaceMemoryRecord>>,
    travelCorridors: Object.fromEntries(
      retainedCorridors.map((corridor) => [corridor.id, corridor] as const),
    ) as Band["travelCorridors"],
    compressedCorridorSummaries: appendCompressedCorridorSummary(
      band.compressedCorridorSummaries ?? [],
      world,
      band,
      compressedCorridors,
    ),
  };
}

function selectRetainedKnownTileIds(
  world: WorldState,
  band: Band,
  records: readonly KnownTileRecord[],
): Set<TileId> {
  const mandatory = new Set<TileId>([
    band.position,
    ...getLocalTileIds(world, band.position),
    ...getCrossingEndpointIds(band),
  ]);

  for (const record of records) {
    const tile = getTile(world, record.tileId);
    const memory = band.placeMemory[record.tileId];

    if (
      tile !== undefined &&
      (isImportantWaterRecord(record, tile) ||
        memory?.isReturnPlace === true ||
        memory?.valences.includes("avoid_place") === true ||
        memory?.valences.includes("risky") === true ||
        memory?.valences.includes("depleted") === true)
    ) {
      mandatory.add(record.tileId);
    }
  }

  const sorted = [...records]
    .sort((left, right) => {
      const leftScore = getKnownRetentionScore(world, band, left, mandatory.has(left.tileId));
      const rightScore = getKnownRetentionScore(world, band, right, mandatory.has(right.tileId));

      return rightScore === leftScore
        ? String(left.tileId).localeCompare(String(right.tileId))
        : rightScore - leftScore;
    });
  const retained = new Set<TileId>();

  for (const record of sorted) {
    if (mandatory.has(record.tileId) || retained.size < MAX_EXACT_KNOWN_TILES) {
      retained.add(record.tileId);
    }
  }

  return retained;
}

function selectRetainedPlaceMemoryIds(
  band: Band,
  retainedKnownTileIds: ReadonlySet<TileId>,
  memories: readonly PlaceMemoryRecord[],
): Set<TileId> {
  const sorted = [...memories].sort((left, right) => {
    const leftScore = getPlaceRetentionScore(left, retainedKnownTileIds.has(left.tileId));
    const rightScore = getPlaceRetentionScore(right, retainedKnownTileIds.has(right.tileId));

    return rightScore === leftScore
      ? String(left.tileId).localeCompare(String(right.tileId))
      : rightScore - leftScore;
  });
  const retained = new Set<TileId>();

  for (const memory of sorted) {
    if (retainedKnownTileIds.has(memory.tileId) || retained.size < MAX_EXACT_PLACE_MEMORIES) {
      retained.add(memory.tileId);
    }
  }

  for (const tileId of getCrossingEndpointIds(band)) {
    retained.add(tileId);
  }

  return retained;
}

function selectRetainedCorridors(
  corridors: readonly TravelCorridorMemory[],
): readonly TravelCorridorMemory[] {
  if (corridors.length <= MAX_EXACT_CORRIDORS) {
    return corridors;
  }

  return [...corridors]
    .sort((left, right) => {
      const leftScore = left.useCount * 0.7 + left.confidence * 0.3 + left.lastUsedAt.tick * 0.0005;
      const rightScore = right.useCount * 0.7 + right.confidence * 0.3 + right.lastUsedAt.tick * 0.0005;

      return rightScore === leftScore
        ? String(left.id).localeCompare(String(right.id))
        : rightScore - leftScore;
    })
    .slice(0, MAX_EXACT_CORRIDORS);
}

function appendCompressedKnownSummary(
  existing: readonly CompressedKnownTileSummary[],
  world: WorldState,
  band: Band,
  records: readonly KnownTileRecord[],
): readonly CompressedKnownTileSummary[] {
  if (records.length === 0) {
    return existing;
  }

  return [...existing, buildCompressedKnownSummary(world, band, records)]
    .slice(-MAX_COMPRESSED_KNOWN_SUMMARIES);
}

function appendKnownAreaSummary(
  existing: readonly KnownAreaSummary[],
  world: WorldState,
  band: Band,
  records: readonly KnownTileRecord[],
  memories: readonly PlaceMemoryRecord[],
): readonly KnownAreaSummary[] {
  if (records.length === 0 && memories.length === 0) {
    return existing;
  }

  const sourceRecords = records.length > 0
    ? records
    : memories
      .map((memory) => band.knowledge.observedTiles[memory.tileId])
      .filter((record): record is KnownTileRecord => record !== undefined);

  if (sourceRecords.length === 0) {
    return existing;
  }

  return [...existing, buildKnownAreaSummary(world, band, sourceRecords)]
    .slice(-MAX_COMPRESSED_AREA_SUMMARIES);
}

function appendCompressedCorridorSummary(
  existing: readonly CompressedCorridorSummary[],
  world: WorldState,
  band: Band,
  corridors: readonly TravelCorridorMemory[],
): readonly CompressedCorridorSummary[] {
  if (corridors.length === 0) {
    return existing;
  }

  const lastUsed = corridors.reduce((latest, corridor) =>
    corridor.lastUsedAt.tick > latest.tick ? corridor.lastUsedAt : latest,
    corridors[0]?.lastUsedAt ?? world.time,
  );
  const averageConfidence = corridors.reduce((total, corridor) => total + corridor.confidence, 0) / corridors.length;

  const summary: CompressedCorridorSummary = {
    id: `compressed-corridor:${band.id}:${world.time.tick}:${existing.length}`,
    corridorCount: corridors.length,
    sourceKnowledgeTypes: ["personally_observed"],
    confidence: round2(averageConfidence),
    lastUsedAt: lastUsed,
    broadCorridorRoles: getBroadCorridorRoles(world, corridors),
    canInfluenceDecisions: false,
    influenceMode: "ui_debug_only",
  };

  return [...existing, summary].slice(-MAX_COMPRESSED_CORRIDOR_SUMMARIES);
}

function buildCompressedKnownSummary(
  world: WorldState,
  band: Band,
  records: readonly KnownTileRecord[],
): CompressedKnownTileSummary {
  return {
    id: `compressed-known:${band.id}:${world.time.tick}:${records.length}`,
    tileCount: records.length,
    sourceKnowledgeTypes: getSourceTypes(records),
    confidence: round2(getAverageConfidence(records)),
    lastObservedAt: getLatestObservedAt(records),
    seasonsObserved: getSeasons(records),
    broadTerrainRoles: getTerrainRoles(world, records),
    broadWaterRoles: getWaterRoles(world, records),
    canInfluenceDecisions: false,
    influenceMode: "ui_debug_only",
  };
}

function buildKnownAreaSummary(
  world: WorldState,
  band: Band,
  records: readonly KnownTileRecord[],
): KnownAreaSummary {
  return {
    id: `known-area:${band.id}:${world.time.tick}:${records.length}`,
    tileCount: records.length,
    sourceKnowledgeTypes: getSourceTypes(records),
    confidence: round2(getAverageConfidence(records)),
    lastObservedAt: getLatestObservedAt(records),
    seasonsObserved: getSeasons(records),
    broadTerrainRoles: getTerrainRoles(world, records),
    broadWaterRoles: getWaterRoles(world, records),
    canInfluenceDecisions: false,
    influenceMode: "ui_debug_only",
  };
}

function getKnownRetentionScore(
  world: WorldState,
  band: Band,
  record: KnownTileRecord,
  mandatory: boolean,
): number {
  const tile = getTile(world, record.tileId);
  const memory = band.placeMemory[record.tileId];
  const recency = clamp01((RECENT_MEMORY_TICK_WINDOW - (world.time.tick - record.lastObservedAt.tick)) / RECENT_MEMORY_TICK_WINDOW);
  const waterValue = (record.observedWaterAccess ?? 0) * 0.32 + record.observedAquaticPotential * 0.22;
  const memoryValue =
    (memory?.attachment ?? 0) * 0.52 +
    (memory?.isReturnPlace === true ? 0.42 : 0) +
    (memory?.valences.includes("risky") === true ? 0.34 : 0) +
    (memory?.valences.includes("avoid_place") === true ? 0.38 : 0) +
    (memory?.valences.includes("depleted") === true ? 0.32 : 0);

  return (
    (mandatory ? 10 : 0) +
    record.visits * 0.42 +
    record.confidence * 0.28 +
    recency * 0.5 +
    waterValue +
    memoryValue +
    (tile !== undefined && isHighValueWaterTile(tile) ? 0.5 : 0) +
    (record.knowledgeSource === "personally_observed" ? 0.12 : -0.08)
  );
}

function getPlaceRetentionScore(
  memory: PlaceMemoryRecord,
  retainedKnownTile: boolean,
): number {
  return (
    (retainedKnownTile ? 1.2 : 0) +
    memory.attachment * 0.6 +
    memory.confidence * 0.24 +
    memory.visitCount * 0.08 +
    (memory.isReturnPlace ? 0.46 : 0) +
    (memory.valences.includes("risky") || memory.valences.includes("avoid_place") ? 0.38 : 0) +
    (memory.valences.includes("depleted") ? 0.34 : 0) +
    memory.lastObservedAt.tick * 0.0005
  );
}

function getLocalTileIds(world: WorldState, tileId: TileId): readonly TileId[] {
  const output = new Set<TileId>([tileId]);

  for (const neighbor of getNeighborTiles(world, tileId)) {
    output.add(neighbor.id);

    for (const secondRing of getNeighborTiles(world, neighbor.id)) {
      output.add(secondRing.id);
    }
  }

  return [...output];
}

function getCrossingEndpointIds(band: Band): readonly TileId[] {
  const output = new Set<TileId>();

  for (const crossing of Object.values(band.crossingMemories)) {
    output.add(crossing.crossingTileA);
    output.add(crossing.crossingTileB);
  }

  return [...output];
}

function isImportantWaterRecord(record: KnownTileRecord, tile: Tile): boolean {
  return (
    record.visits > 0 &&
    ((record.observedWaterAccess ?? 0) >= 0.68 ||
      record.observedAquaticPotential >= 0.62 ||
      isHighValueWaterTile(tile))
  );
}

function isHighValueWaterTile(tile: Tile): boolean {
  return (
    tile.isRiver ||
    tile.isRiverbank ||
    tile.isFloodplain ||
    tile.isCoastal ||
    tile.isConfluence ||
    tile.isEstuary ||
    tile.isMarshChannel ||
    tile.terrainKind === "wetlands" ||
    tile.terrainKind === "lake"
  );
}

function getSourceTypes(records: readonly KnownTileRecord[]): readonly KnowledgeSourceKind[] {
  return addUnique(records.map((record) => record.knowledgeSource));
}

function getAverageConfidence(records: readonly KnownTileRecord[]): number {
  return records.reduce((total, record) => total + record.confidence, 0) / Math.max(1, records.length);
}

function getLatestObservedAt(records: readonly KnownTileRecord[]): KnownTileRecord["lastObservedAt"] {
  const first = records[0];

  if (first === undefined) {
    throw new Error("Cannot summarize empty known tile records");
  }

  return records.reduce((latest, record) =>
    record.lastObservedAt.tick > latest.tick ? record.lastObservedAt : latest,
    first.lastObservedAt,
  );
}

function getSeasons(records: readonly KnownTileRecord[]): readonly KnownTileRecord["seasonsObserved"][number][] {
  return addUnique(records.flatMap((record) => record.seasonsObserved));
}

function getTerrainRoles(
  world: WorldState,
  records: readonly KnownTileRecord[],
): readonly string[] {
  const roles = records.map((record) => getTile(world, record.tileId)?.terrainKind ?? "unknown");

  return addUnique(roles).slice(0, 8);
}

function getWaterRoles(
  world: WorldState,
  records: readonly KnownTileRecord[],
): readonly BroadWaterRole[] {
  return addUnique(records.map((record) => {
    const tile = getTile(world, record.tileId);

    if (tile === undefined) {
      return "unknown";
    }

    return getWaterRole(tile);
  })).slice(0, 8);
}

function getWaterRole(tile: Tile): BroadWaterRole {
  if (tile.isRiver || tile.isRiverbank || tile.isFloodplain || tile.isConfluence) {
    return "river";
  }

  if (tile.isCoastal || tile.isEstuary) {
    return "coast";
  }

  if (tile.terrainKind === "lake") {
    return "lake";
  }

  if (tile.terrainKind === "wetlands" || tile.isMarshChannel) {
    return "wetland";
  }

  return "dry";
}

function getBroadCorridorRoles(
  world: WorldState,
  corridors: readonly TravelCorridorMemory[],
): readonly string[] {
  return addUnique(corridors.flatMap((corridor) => {
    const fromTile = getTile(world, corridor.fromTileId);
    const toTile = getTile(world, corridor.toTileId);

    return [fromTile, toTile]
      .filter((tile): tile is Tile => tile !== undefined)
      .map((tile) => getWaterRole(tile));
  })).slice(0, 8);
}

function addUnique<TValue>(values: readonly TValue[]): readonly TValue[] {
  const output: TValue[] = [];

  for (const value of values) {
    if (!output.includes(value)) {
      output.push(value);
    }
  }

  return output;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
