import type {
  Coord,
  DayNumber,
  RegionId,
  RiverId,
  Season,
  SimulationSeed,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import {
  DAYS_PER_YEAR,
  SEASON_LENGTH_DAYS,
  SEASONS_PER_YEAR,
  TICKS_PER_GENERATION,
  YEARS_PER_GENERATION,
} from "../core/types";
import type {
  BiomeKind,
  CarryingCapacityProfile,
  ClimateRegime,
  RiverCrossingClass,
  RiverCrossingProfile,
  RiverSegmentProfile,
  TerrainKind,
  Tile,
  TileResourceProfile,
  WorldConfig,
  WorldRegion,
  WorldState,
} from "./types";
import { makeRiverCrossingKey, makeRiverId } from "./hydrography";
import { createEmptyDecisionArchive } from "../rules/decisionArchive";

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  width: 30,
  height: 20,
  seasonsPerYear: SEASONS_PER_YEAR,
  yearsPerGeneration: YEARS_PER_GENERATION,
  ticksPerGeneration: TICKS_PER_GENERATION,
};

export const EARTH_DEBUG_WORLD_CONFIG: WorldConfig = {
  width: 360,
  height: 180,
  seasonsPerYear: SEASONS_PER_YEAR,
  yearsPerGeneration: YEARS_PER_GENERATION,
  ticksPerGeneration: TICKS_PER_GENERATION,
};

export const REGIONAL_DEBUG_WORLD_CONFIG: WorldConfig = {
  width: 160,
  height: 100,
  seasonsPerYear: SEASONS_PER_YEAR,
  yearsPerGeneration: YEARS_PER_GENERATION,
  ticksPerGeneration: TICKS_PER_GENERATION,
};

export const DEFAULT_WORLD_SEED = "checkpoint-2a" as SimulationSeed;
export const EARTH_DEBUG_WORLD_SEED = "earth-debug-map" as SimulationSeed;
export const REGIONAL_DEBUG_WORLD_SEED = "regional-cradle-debug-map" as SimulationSeed;

const INITIAL_TIME: WorldTime = {
  tick: 0 as TickNumber,
  seasonTick: 0 as TickNumber,
  day: 0 as DayNumber,
  dayOfSeason: 0,
  seasonLengthDays: SEASON_LENGTH_DAYS,
  daysPerYear: DAYS_PER_YEAR,
  year: 0,
  season: "spring",
  seasonIndex: 0,
  generation: {
    index: 0,
    yearWithinGeneration: 0,
    tickWithinGeneration: 0 as TickNumber,
  },
};

const SEASON_ORDER: readonly Season[] = ["spring", "summer", "autumn", "winter"];

type CoastSide = "north" | "south" | "east" | "west";

const COAST_SIDES: readonly CoastSide[] = ["north", "south", "east", "west"];

interface MacroPoint {
  readonly x: number;
  readonly y: number;
}

interface CoastPlan {
  readonly side: CoastSide;
  readonly baseDepth: number;
  readonly amplitude: number;
  readonly frequency: number;
  readonly phase: number;
}

interface LakePlan {
  readonly center: MacroPoint;
  readonly radius: number;
}

interface RiverPlan {
  readonly points: readonly MacroPoint[];
  readonly width: number;
}

interface MacroZone {
  readonly center: MacroPoint;
  readonly radius: number;
  readonly intensity: number;
}

interface RidgePlan {
  readonly start: MacroPoint;
  readonly end: MacroPoint;
  readonly width: number;
  readonly intensity: number;
}

interface MacroWorldPlan {
  readonly coast: CoastPlan;
  readonly river: RiverPlan;
  readonly lakes: readonly LakePlan[];
  readonly richZones: readonly MacroZone[];
  readonly dryZones: readonly MacroZone[];
  readonly elevationZones: readonly MacroZone[];
  readonly ridges: readonly RidgePlan[];
  readonly aridityBias: number;
}

interface RegionalTileHydrography {
  readonly riverSegmentId?: RiverId;
  readonly isFloodplain: boolean;
  readonly isRiverbank: boolean;
  readonly isConfluence: boolean;
  readonly isEstuary: boolean;
  readonly isMarshChannel: boolean;
}

// MAP1-R: Map 1 redesigned with the MAP2-R toolkit (meandering subdivided
// channels, organic lake, honest connectivity, creeks, causal moisture →
// richness fields). Declared scale ~1 km/tile → a 160×100 km sub-region for
// finer-scale testing. Feature ANCHORS preserved for the test infrastructure:
// lake centroid (58,74), delta (134,65), west range + pass, main-river course,
// west/north dry zones (dry-margin spawns), so catchment classification,
// spawn-profile habitats and the lake-opportunity audit premises all survive.
const REGIONAL_SEED_HASH = hashString(String(REGIONAL_DEBUG_WORLD_SEED));

export const REGIONAL_KM_PER_TILE = 1;

const REGIONAL_MAIN_RIVER_BASE: readonly MacroPoint[] = [
  // Future rule: derive rivers from elevation and drainage, not hand-authored paths.
  { x: 32, y: 16 },
  { x: 39, y: 34 },
  { x: 56, y: 45 },
  { x: 82, y: 52 },
  { x: 109, y: 58 },
  { x: 132, y: 64 },
];
const REGIONAL_MAIN_RIVER = subdivideMacroPath(REGIONAL_MAIN_RIVER_BASE, 3, 0.9, 211, 2.4, REGIONAL_SEED_HASH);

// MAP1-R: honest lake plumbing. The old single "lake river" path ran THROUGH
// the lake circle, which swallowed its middle and left two floating channel
// stubs. Now: an INFLOW from the pass slopes ends ON the west shore, and an
// OUTLET leaves the east shore and joins the main river (mouth on-channel).
const REGIONAL_LAKE_INFLOW_BASE: readonly MacroPoint[] = [
  { x: 35, y: 52 },
  { x: 44, y: 60 },
  { x: 54, y: 69 },
];
const REGIONAL_LAKE_INFLOW = subdivideMacroPath(REGIONAL_LAKE_INFLOW_BASE, 2, 0.8, 223, 1.3, REGIONAL_SEED_HASH);

const REGIONAL_LAKE_OUTLET_BASE: readonly MacroPoint[] = [
  { x: 63, y: 70 },
  { x: 75, y: 66 },
  { x: 88, y: 54 },
];
const REGIONAL_LAKE_OUTLET_PATH = subdivideMacroPath(REGIONAL_LAKE_OUTLET_BASE, 2, 0.9, 227, 1.5, REGIONAL_SEED_HASH);

// Delta distributaries fan out FROM the main stem's apex (132,64) — connected
// by construction, splitting only at the sea (deltas are where rivers split).
const REGIONAL_DELTA_RIVER_BASES: readonly (readonly MacroPoint[])[] = [
  [
    { x: 132, y: 64 },
    { x: 138, y: 55 },
    { x: 145, y: 54 },
  ],
  [
    { x: 132, y: 64 },
    { x: 141, y: 65 },
    { x: 148, y: 66 },
  ],
  [
    { x: 132, y: 64 },
    { x: 136, y: 74 },
    { x: 144, y: 78 },
  ],
];
const REGIONAL_DELTA_RIVERS: readonly (readonly MacroPoint[])[] = REGIONAL_DELTA_RIVER_BASES.map(
  (path, index) => subdivideMacroPath(path, 2, 0.7, 231 + index * 4, 0.7, REGIONAL_SEED_HASH),
);

// MAP1-R: sub-tile creeks (influence corridors + hasCreek flag, same model as
// Map 2). Each flows downhill: range/highland flanks → rivers/lake, hills →
// delta. Mouths overshoot onto preserved channel vertices/edges so the meander
// wobble can never leave a stream floating.
const REGIONAL_CREEK_BASES: readonly (readonly MacroPoint[])[] = [
  [{ x: 36, y: 24 }, { x: 41, y: 30 }, { x: 45, y: 37 }], // range east flank → upper main
  [{ x: 60, y: 18 }, { x: 64, y: 30 }, { x: 68, y: 49 }], // north highland → main meander (mouth overshoots onto the channel)
  [{ x: 84, y: 16 }, { x: 89, y: 32 }, { x: 94, y: 52 }], // north dry edge → main (seasonal)
  [{ x: 44, y: 42 }, { x: 47, y: 52 }, { x: 50, y: 63 }], // pass slopes → lake inflow
  [{ x: 70, y: 84 }, { x: 72, y: 76 }, { x: 73, y: 68 }], // south plains → lake outlet
  [{ x: 118, y: 88 }, { x: 128, y: 84 }, { x: 140, y: 78 }], // SE hills → delta south channel
  [{ x: 30, y: 66 }, { x: 33, y: 60 }, { x: 36, y: 54 }], // west lee wash → lake inflow head (dry-margin water line)
  [{ x: 112, y: 40 }, { x: 115, y: 49 }, { x: 118, y: 59 }], // east plains → lower main
];
const REGIONAL_CREEKS: readonly (readonly MacroPoint[])[] = REGIONAL_CREEK_BASES.map(
  (creek, index) => subdivideMacroPath(creek, 2, 0.8, 401 + index * 7, 0.8, REGIONAL_SEED_HASH),
);

const REGIONAL_LAKE_INFLOW_RIVER_ID = makeRiverId("regional-lake-inflow");
const REGIONAL_MAIN_HEADWATER_RIVER_ID = makeRiverId("regional-main-headwater");
const REGIONAL_MAIN_GORGE_RIVER_ID = makeRiverId("regional-main-gorge");
const REGIONAL_MAIN_MEANDER_RIVER_ID = makeRiverId("regional-main-meander");
const REGIONAL_MAIN_DEEP_RIVER_ID = makeRiverId("regional-main-deep");
const REGIONAL_LAKE_OUTLET_RIVER_ID = makeRiverId("regional-lake-outlet");
const REGIONAL_DELTA_MARSH_RIVER_ID = makeRiverId("regional-delta-marsh");
const REGIONAL_ESTUARY_RIVER_ID = makeRiverId("regional-estuary");

export function createRegionalDebugWorld(
  config: WorldConfig = REGIONAL_DEBUG_WORLD_CONFIG,
): WorldState {
  const tiles: Record<string, Tile> = {};
  const regionTiles = new Map<RegionId, TileId[]>();

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const tile = createRegionalDebugTile(config, { x, y });
      tiles[tile.id] = tile;

      const regionTileIds = regionTiles.get(tile.regionId) ?? [];
      regionTileIds.push(tile.id);
      regionTiles.set(tile.regionId, regionTileIds);
    }
  }

  const regions: Record<string, WorldRegion> = {};
  for (const [regionId, tileIds] of regionTiles.entries()) {
    regions[regionId] = {
      id: regionId,
      name: formatRegionName(regionId),
      tileIds,
    };
  }

  const rivers = createRegionalRiverProfiles();
  const riverCrossings = createRegionalRiverCrossings(config, tiles as Readonly<Record<TileId, Tile>>);

  return {
    config,
    time: INITIAL_TIME,
    seed: REGIONAL_DEBUG_WORLD_SEED,
    tiles: tiles as Readonly<Record<TileId, Tile>>,
    climateRegime: {
      kind: "stable",
      seasonalHarshness: 0.32,
      aridity: 0.42,
      volatility: 0.16,
    },
    currentClimateStress: null,
    regions: regions as Readonly<Record<RegionId, WorldRegion>>,
    rivers,
    riverCrossings,
    bands: {},
    decisions: {},
    decisionArchive: createEmptyDecisionArchive(),
  };
}

export function createEarthDebugWorld(
  config: WorldConfig = EARTH_DEBUG_WORLD_CONFIG,
): WorldState {
  const tiles: Record<string, Tile> = {};
  const regionTiles = new Map<RegionId, TileId[]>();

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const tile = createEarthDebugTile(config, { x, y });
      tiles[tile.id] = tile;

      const regionTileIds = regionTiles.get(tile.regionId) ?? [];
      regionTileIds.push(tile.id);
      regionTiles.set(tile.regionId, regionTileIds);
    }
  }

  const regions: Record<string, WorldRegion> = {};
  for (const [regionId, tileIds] of regionTiles.entries()) {
    regions[regionId] = {
      id: regionId,
      name: formatRegionName(regionId),
      tileIds,
    };
  }

  return {
    config,
    time: INITIAL_TIME,
    seed: EARTH_DEBUG_WORLD_SEED,
    tiles: tiles as Readonly<Record<TileId, Tile>>,
    climateRegime: {
      kind: "stable",
      seasonalHarshness: 0.34,
      aridity: 0.38,
      volatility: 0.14,
    },
    currentClimateStress: null,
    regions: regions as Readonly<Record<RegionId, WorldRegion>>,
    rivers: {},
    riverCrossings: {},
    bands: {},
    decisions: {},
    decisionArchive: createEmptyDecisionArchive(),
  };
}

export function createWorld(
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
  seed: SimulationSeed = DEFAULT_WORLD_SEED,
): WorldState {
  const seedHash = hashString(seed);
  const macroPlan = createMacroWorldPlan(config, seedHash);
  const tiles: Record<string, Tile> = {};
  const regionTiles = new Map<RegionId, TileId[]>();

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const tile = createTile(config, seedHash, macroPlan, { x, y });
      tiles[tile.id] = tile;

      const regionTileIds = regionTiles.get(tile.regionId) ?? [];
      regionTileIds.push(tile.id);
      regionTiles.set(tile.regionId, regionTileIds);
    }
  }

  const regions: Record<string, WorldRegion> = {};
  for (const [regionId, tileIds] of regionTiles.entries()) {
    regions[regionId] = {
      id: regionId,
      name: formatRegionName(regionId),
      tileIds,
    };
  }

  const climateRegime: ClimateRegime = {
    kind: "stable",
    seasonalHarshness: 0.35,
    aridity: 0.42,
    volatility: 0.18,
  };

  return {
    config,
    time: INITIAL_TIME,
    seed,
    tiles: tiles as Readonly<Record<TileId, Tile>>,
    climateRegime,
    currentClimateStress: null,
    regions: regions as Readonly<Record<RegionId, WorldRegion>>,
    rivers: {},
    riverCrossings: {},
    bands: {},
    decisions: {},
    decisionArchive: createEmptyDecisionArchive(),
  };
}

export function getTile(world: WorldState, tileId: TileId): Tile | undefined {
  return world.tiles[tileId];
}

// PERF-1: coordinate lookups were building a `tile:x:y` string key per call —
// a major allocation source in hot loops (crowding fields, render scans). The
// flat grid index is built once per tiles record (reference-stable for a
// world's lifetime) and returns the exact same Tile references — byte-identical
// behaviour, no string allocation on lookup.
const tileGridMemo = new WeakMap<Readonly<Record<TileId, Tile>>, (Tile | undefined)[]>();

export function getTileAtCoord(
  world: WorldState,
  coord: Coord,
): Tile | undefined {
  if (!isInsideWorld(world.config, coord)) {
    return undefined;
  }

  let grid = tileGridMemo.get(world.tiles);

  if (grid === undefined) {
    grid = new Array<Tile | undefined>(world.config.width * world.config.height);

    for (const tile of Object.values(world.tiles)) {
      grid[tile.coord.y * world.config.width + tile.coord.x] = tile;
    }

    tileGridMemo.set(world.tiles, grid);
  }

  return grid[coord.y * world.config.width + coord.x];
}

export function getNeighborTiles(
  world: WorldState,
  tileId: TileId,
): readonly Tile[] {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return [];
  }

  return tile.neighbors
    .map((neighborId) => getTile(world, neighborId))
    .filter((neighbor): neighbor is Tile => neighbor !== undefined);
}

export function makeTileId(coord: Coord): TileId {
  return `tile:${coord.x}:${coord.y}` as TileId;
}

function createRegionalDebugTile(config: WorldConfig, coord: Coord): Tile {
  const point = toRegionalPoint(config, coord);
  const id = makeTileId(coord);
  const regionId = getRegionId(config, coord);
  const coastlineX = getRegionalCoastlineX(point);
  const coastDistance = coastlineX - point.x;
  const deltaInfluence = regionalEllipse(point, { x: 134, y: 65 }, 16, 16);
  // MAP1-R: organic lobed lake shoreline (anchored at (58,74), audit-preserved).
  const lakeDistance = variedLakeDistance(point, { x: 58, y: 74 }, 3, REGIONAL_SEED_HASH);
  const mainRiverDistance = getRegionalPathDistance(point, REGIONAL_MAIN_RIVER);
  const lakeInflowDistance = getRegionalPathDistance(point, REGIONAL_LAKE_INFLOW);
  const lakeOutletDistance = getRegionalPathDistance(point, REGIONAL_LAKE_OUTLET_PATH);
  const deltaRiverDistance = getRegionalDeltaRiverDistance(point);
  let creekDistance = Number.POSITIVE_INFINITY;
  for (const creek of REGIONAL_CREEKS) {
    creekDistance = Math.min(creekDistance, getRegionalPathDistance(point, creek));
  }
  const creekMargin = clamp01(1 - creekDistance / 2);

  // MAP1-R deterministic field noise (seeded with the REGIONAL seed).
  const reliefNoise = variedFieldNoise(point.x, point.y, 5, 503, REGIONAL_SEED_HASH) - 0.5;
  const climateNoise = variedFieldNoise(point.x, point.y, 8, 509, REGIONAL_SEED_HASH) - 0.5;
  const fertilityNoise =
    (variedFieldNoise(point.x, point.y, 11, 521, REGIONAL_SEED_HASH) - 0.5) * 0.24 +
    (variedFieldNoise(point.x, point.y, 4.5, 541, REGIONAL_SEED_HASH) - 0.5) * 0.11 +
    (hashNoise(REGIONAL_SEED_HASH, point.x, point.y, 547) - 0.5) * 0.02;

  // Relief: west range with the pass, north highland belt, and a new low SE
  // hill belt (creek sources — the bare south-east becomes rolling country).
  const mountainDistance = distanceToSegment(point, { x: 28, y: 3 }, { x: 39, y: 96 });
  const northHighland = regionalEllipse(point, { x: 48, y: 10 }, 40, 12);
  const southeastHills = regionalEllipse(point, { x: 112, y: 88 }, 26, 11) * 0.5;
  const passInfluence = regionalEllipse(point, { x: 38, y: 50 }, 9, 11);
  const mountainInfluence = clamp01(
    Math.max(clamp01(1 - mountainDistance / 13), northHighland * 0.62, southeastHills) +
      reliefNoise * 0.18 -
      passInfluence * 0.62,
  );
  const corridorInfluence = clamp01(
    passInfluence * 0.9 +
      clamp01(1 - mainRiverDistance / 4) * 0.34 +
      clamp01(1 - lakeOutletDistance / 3.5) * 0.24 +
      creekMargin * 0.14,
  );
  // Dry zones kept where the test infrastructure expects them (west lee +
  // north interior) but smaller and noisy-edged — less bare filler.
  const dryInteriorInfluence = clamp01(
    Math.max(
      regionalEllipse(point, { x: 88, y: 22 }, 34, 15),
      regionalEllipse(point, { x: 116, y: 34 }, 22, 12) * 0.8,
      regionalEllipse(point, { x: 20, y: 74 }, 20, 18) * 0.8,
    ) +
      climateNoise * 0.26 -
      deltaInfluence * 0.34 -
      clamp01(1 - mainRiverDistance / 10) * 0.3 -
      clamp01(1 - lakeDistance / 15) * 0.35 -
      creekMargin * 0.2,
  );
  const isOcean = point.x >= coastlineX;
  const isLake = !isOcean && lakeDistance <= 7.8;
  // 1 tile ≈ 1 km: the main channel's mapped corridor widens downstream.
  const mainProgress = clamp01((point.x - 32) / 100);
  const mainChannelWidth = 0.6 + mainProgress * 0.6 + deltaInfluence * 0.3;
  const isRiver =
    !isOcean &&
    !isLake &&
    (mainRiverDistance <= mainChannelWidth ||
      lakeInflowDistance <= 0.6 ||
      lakeOutletDistance <= 0.68 ||
      deltaRiverDistance <= 0.8);
  const isDeltaWetland = !isOcean && !isLake && deltaInfluence > 0.28;
  const isLakeWetland =
    !isOcean && !isLake && lakeDistance > 7.8 && lakeDistance <= 12.5 + reliefNoise * 3;
  const isCoastal = !isOcean && !isLake && !isRiver && coastDistance <= 4.2;
  const isAquatic = isOcean || isLake || isRiver;
  const hasCreek = !isAquatic && creekDistance <= 0.7;
  const lakeWetlandInfluence = clamp01(1 - Math.abs(lakeDistance - 9.5) / 5.5);
  const riverInfluence = Math.max(
    // Young river upstream, broad mature floodplain downstream.
    clamp01(1 - mainRiverDistance / (4 + mainProgress * 4)),
    clamp01(1 - lakeInflowDistance / 3.5) * 0.55,
    clamp01(1 - lakeOutletDistance / 4.5) * 0.7,
    clamp01(1 - deltaRiverDistance / 5) * 0.82,
  );
  const floodplainInfluence = clamp01(
    riverInfluence * 0.92 + deltaInfluence * 0.54 - mountainInfluence * 0.3 - dryInteriorInfluence * 0.2,
  );
  const hydrography = getRegionalTileHydrography({
    point,
    isOcean,
    isLake,
    isRiver,
    mainRiverDistance,
    mainChannelWidth,
    lakeInflowDistance,
    lakeOutletDistance,
    deltaRiverDistance,
    deltaInfluence,
    lakeWetlandInfluence,
    floodplainInfluence,
    coastDistance,
    mountainInfluence,
  });
  const wetlandInfluence = Math.max(
    isDeltaWetland ? deltaInfluence : 0,
    isLakeWetland ? lakeWetlandInfluence : 0,
  );
  const coastalWetness = isCoastal ? clamp01(1 - coastDistance / 5) : 0;

  // MAP1-R causal moisture field: oceanic humidity from the east, orographic
  // rain on the range/highland flanks, surface-water proximity, minus the dry
  // interiors. Richness/water derive from this field instead of stamped blobs.
  const coastalHumidity = clamp01(0.4 + clamp01(1 - Math.max(coastDistance, 0) / 130) * 0.36);
  const foothillRain =
    clamp01(1 - Math.abs(mountainDistance - 10) / 8) * 0.14 + northHighland * 0.06;
  const surfaceWaterMoisture = Math.max(
    clamp01(1 - mainRiverDistance / 6) * 0.4,
    clamp01(1 - lakeInflowDistance / 3.5) * 0.26,
    clamp01(1 - lakeOutletDistance / 4) * 0.3,
    clamp01(1 - deltaRiverDistance / 4.5) * 0.34,
    creekMargin * 0.3,
    clamp01(1 - lakeDistance / 15) * 0.4,
  );
  const moisture = clamp01(
    coastalHumidity * 0.6 +
      foothillRain +
      surfaceWaterMoisture +
      deltaInfluence * 0.22 +
      climateNoise * 0.12 -
      dryInteriorInfluence * 0.5 -
      mountainInfluence * 0.2,
  );
  const waterAccess = clamp01(
    Math.max(
      (isAquatic ? 0.96 : 0) +
        riverInfluence * 0.62 +
        wetlandInfluence * 0.55 +
        coastalWetness * 0.55 +
        moisture * 0.3 -
        dryInteriorInfluence * 0.3,
      creekMargin * 0.44,
    ),
  );
  const droughtRisk = clamp01(
    0.14 + dryInteriorInfluence * 0.6 + (1 - moisture) * 0.2 - waterAccess * 0.32,
  );
  const floodRisk = clamp01(
    (isRiver ? 0.66 : 0) +
      floodplainInfluence * 0.38 +
      deltaInfluence * 0.28 +
      wetlandInfluence * 0.22 -
      mountainInfluence * 0.18,
  );
  const diseaseRisk = clamp01(
    waterAccess * 0.24 +
      wetlandInfluence * 0.34 +
      deltaInfluence * 0.24 +
      (isOcean ? 0.04 : 0) -
      dryInteriorInfluence * 0.14,
  );
  const elevation = getRegionalElevation({
    isOcean,
    isLake,
    mountainInfluence,
    corridorInfluence,
    dryInteriorInfluence,
    floodplainInfluence,
  });
  const baseRichness = clamp01(
    Math.max(
      0.14 +
        moisture * 0.72 +
        floodplainInfluence * 0.2 +
        wetlandInfluence * 0.16 +
        deltaInfluence * 0.08 -
        mountainInfluence * 0.24 -
        dryInteriorInfluence * 0.34 +
        fertilityNoise,
      // Creek lines stay survivable even inside the dry zones.
      creekMargin * clamp01(0.3 - dryInteriorInfluence * 0.12),
    ),
  );
  const aquaticPotential = clamp01(
    (isOcean ? 0.72 : 0) +
      (isLake ? 0.82 : 0) +
      (isRiver ? 0.44 : 0) +
      coastalWetness * 0.42 +
      wetlandInfluence * 0.42 +
      deltaInfluence * 0.34,
  );
  const wildGrainPotential = clamp01(
    0.12 +
      floodplainInfluence * 0.46 +
      lakeWetlandInfluence * 0.2 +
      moisture * 0.2 +
      baseRichness * 0.18 -
      mountainInfluence * 0.12 -
      dryInteriorInfluence * 0.14 +
      fertilityNoise * 0.5,
  );
  const plantTendingPotential = clamp01(
    0.08 +
      floodplainInfluence * 0.5 +
      deltaInfluence * 0.2 +
      waterAccess * 0.22 +
      moisture * 0.14 +
      baseRichness * 0.2 -
      mountainInfluence * 0.16 -
      dryInteriorInfluence * 0.12,
  );
  const seasonalVariance = clamp01(
    0.2 +
      lakeWetlandInfluence * 0.38 +
      dryInteriorInfluence * 0.22 +
      mountainInfluence * 0.12 +
      creekMargin * 0.08 -
      deltaInfluence * 0.08 -
      floodplainInfluence * 0.06,
  );
  const storageSuitability = clamp01(
    0.34 +
      dryInteriorInfluence * 0.22 +
      corridorInfluence * 0.12 +
      elevation * 0.16 -
      floodRisk * 0.2 -
      diseaseRisk * 0.1,
  );
  const terrainKind = getRegionalTerrainKind({
    isOcean,
    isLake,
    isRiver,
    isCoastal,
    isDeltaWetland,
    isLakeWetland,
    mountainInfluence,
    corridorInfluence,
    floodplainInfluence,
    dryInteriorInfluence,
    baseRichness,
  });
  const biomeKind = getRegionalBiomeKind({
    terrainKind,
    isCoastal,
    isDeltaWetland,
    isLakeWetland,
    corridorInfluence,
  });
  const movementCost = getRegionalMovementCost({
    terrainKind,
    isAquatic,
    mountainInfluence,
    corridorInfluence,
    floodRisk,
    droughtRisk,
  });
  const resourceProfile: TileResourceProfile = {
    baseRichness,
    waterAccess,
    aquaticPotential,
    wildGrainPotential,
    plantTendingPotential,
    storageSuitability,
    resourceRegenerationRate: clamp01(0.18 + baseRichness * 0.54 + waterAccess * 0.18),
  };

  return {
    id,
    coord,
    regionId,
    terrainKind,
    biomeKind,
    resourceProfile,
    seasonalProfile: {
      seasonalVariance,
      peakSeasons: getRegionalPeakSeasons(waterAccess, seasonalVariance, isLakeWetland),
      leanSeasons: droughtRisk > 0.52 ? ["summer", "winter"] : ["winter"],
      reliability: clamp01(
        0.48 + waterAccess * 0.32 + floodplainInfluence * 0.18 - seasonalVariance * 0.24,
      ),
      expectedWinterStress: clamp01(0.2 + droughtRisk * 0.26 + seasonalVariance * 0.22),
    },
    riskProfile: {
      floodRisk,
      droughtRisk,
      diseaseRisk,
      depletionRisk: clamp01(baseRichness * 0.22 + (1 - waterAccess) * 0.24),
      climateVolatility: clamp01(0.12 + droughtRisk * 0.2 + seasonalVariance * 0.18),
    },
    carryingCapacity: getCarryingCapacity(resourceProfile, movementCost),
    movementCost,
    elevation,
    isRiver,
    isCoastal,
    isAquatic,
    riverSegmentId: hydrography.riverSegmentId,
    isFloodplain: hydrography.isFloodplain,
    isRiverbank: hydrography.isRiverbank,
    isConfluence: hydrography.isConfluence,
    isEstuary: hydrography.isEstuary,
    isMarshChannel: hydrography.isMarshChannel,
    hasCreek: hasCreek ? true : undefined,
    neighbors: getNeighborIds(config, coord),
  };
}

function toRegionalPoint(config: WorldConfig, coord: Coord): MacroPoint {
  return {
    x: (coord.x / Math.max(1, config.width - 1)) * 159,
    y: (coord.y / Math.max(1, config.height - 1)) * 99,
  };
}

function getRegionalCoastlineX(point: MacroPoint): number {
  const deltaBite = regionalEllipse(point, { x: 137, y: 65 }, 15, 18);
  const shallowBay = regionalEllipse(point, { x: 143, y: 35 }, 7, 10);

  return 140 + Math.sin(point.y / 8) * 1.7 - deltaBite * 8 + shallowBay * 2;
}

function getRegionalPathDistance(
  point: MacroPoint,
  path: readonly MacroPoint[],
): number {
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length - 1; index += 1) {
    nearestDistance = Math.min(
      nearestDistance,
      distanceToSegment(point, path[index], path[index + 1]),
    );
  }

  return nearestDistance;
}

function getRegionalDeltaRiverDistance(point: MacroPoint): number {
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const riverPath of REGIONAL_DELTA_RIVERS) {
    nearestDistance = Math.min(nearestDistance, getRegionalPathDistance(point, riverPath));
  }

  return nearestDistance;
}

function getRegionalTileHydrography(input: {
  readonly point: MacroPoint;
  readonly isOcean: boolean;
  readonly isLake: boolean;
  readonly isRiver: boolean;
  readonly mainRiverDistance: number;
  readonly mainChannelWidth: number;
  readonly lakeInflowDistance: number;
  readonly lakeOutletDistance: number;
  readonly deltaRiverDistance: number;
  readonly deltaInfluence: number;
  readonly lakeWetlandInfluence: number;
  readonly floodplainInfluence: number;
  readonly coastDistance: number;
  readonly mountainInfluence: number;
}): RegionalTileHydrography {
  const isMainRiver = input.isRiver && input.mainRiverDistance <= input.mainChannelWidth;
  const isLakeInflow = input.isRiver && !isMainRiver && input.lakeInflowDistance <= 0.6;
  const isLakeOutlet = input.isRiver && !isMainRiver && !isLakeInflow && input.lakeOutletDistance <= 0.68;
  const isDeltaChannel = input.isRiver && input.deltaRiverDistance <= 0.8 && !isMainRiver;
  const riverSegmentId = getRegionalRiverSegmentId({
    point: input.point,
    isMainRiver,
    isLakeInflow,
    isLakeOutlet,
    isDeltaChannel,
    deltaInfluence: input.deltaInfluence,
    mountainInfluence: input.mountainInfluence,
  });
  const isConfluence =
    regionalEllipse(input.point, { x: 88, y: 54 }, 6, 5) > 0.42 ||
    regionalEllipse(input.point, { x: 132, y: 64 }, 6, 6) > 0.4;
  const isEstuary =
    !input.isOcean &&
    input.deltaInfluence > 0.42 &&
    input.coastDistance <= 6.2;
  const isMarshChannel =
    isDeltaChannel ||
    (isLakeOutlet && input.lakeWetlandInfluence > 0.48) ||
    (input.deltaInfluence > 0.34 && input.deltaRiverDistance < 3.4);

  return {
    riverSegmentId,
    isFloodplain: !input.isOcean && !input.isLake && input.floodplainInfluence > 0.36,
    isRiverbank: !input.isRiver && !input.isOcean && input.floodplainInfluence > 0.62,
    isConfluence,
    isEstuary,
    isMarshChannel,
  };
}

function getRegionalRiverSegmentId(input: {
  readonly point: MacroPoint;
  readonly isMainRiver: boolean;
  readonly isLakeInflow: boolean;
  readonly isLakeOutlet: boolean;
  readonly isDeltaChannel: boolean;
  readonly deltaInfluence: number;
  readonly mountainInfluence: number;
}): RiverId | undefined {
  if (input.isDeltaChannel && input.deltaInfluence > 0.48) {
    return input.point.x > 138 ? REGIONAL_ESTUARY_RIVER_ID : REGIONAL_DELTA_MARSH_RIVER_ID;
  }

  if (input.isLakeInflow) {
    return REGIONAL_LAKE_INFLOW_RIVER_ID;
  }

  if (input.isLakeOutlet) {
    return REGIONAL_LAKE_OUTLET_RIVER_ID;
  }

  if (!input.isMainRiver) {
    return undefined;
  }

  if (input.point.x < 43) {
    return input.mountainInfluence > 0.46
      ? REGIONAL_MAIN_GORGE_RIVER_ID
      : REGIONAL_MAIN_HEADWATER_RIVER_ID;
  }

  if (input.point.x < 92) {
    return REGIONAL_MAIN_MEANDER_RIVER_ID;
  }

  if (input.point.x < 124) {
    return REGIONAL_MAIN_DEEP_RIVER_ID;
  }

  return input.deltaInfluence > 0.36
    ? REGIONAL_DELTA_MARSH_RIVER_ID
    : REGIONAL_MAIN_DEEP_RIVER_ID;
}

function createRegionalRiverProfiles(): Readonly<Record<RiverId, RiverSegmentProfile>> {
  const profiles: readonly RiverSegmentProfile[] = [
    {
      riverId: REGIONAL_MAIN_HEADWATER_RIVER_ID,
      kind: "seasonal_stream",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "moderate",
      bankSteepness: 0.38,
      seasonalFlowVariance: 0.72,
      floodSeason: "spring",
      fordability: 0.76,
      navigability: 0.08,
      aquaticReliabilityModifier: 0.08,
      floodplainFertilityModifier: 0.1,
      crossingRisk: 0.24,
    },
    {
      riverId: REGIONAL_MAIN_GORGE_RIVER_ID,
      kind: "rapid_gorge",
      widthClass: "narrow",
      depthClass: "mixed",
      flowStrength: "dangerous",
      bankSteepness: 0.88,
      seasonalFlowVariance: 0.58,
      floodSeason: "spring",
      fordability: 0.08,
      navigability: 0.02,
      aquaticReliabilityModifier: -0.04,
      floodplainFertilityModifier: -0.06,
      crossingRisk: 0.86,
    },
    {
      riverId: REGIONAL_MAIN_MEANDER_RIVER_ID,
      kind: "meandering_channel",
      widthClass: "medium",
      depthClass: "mixed",
      flowStrength: "moderate",
      bankSteepness: 0.34,
      seasonalFlowVariance: 0.42,
      floodSeason: "spring",
      fordability: 0.44,
      navigability: 0.18,
      aquaticReliabilityModifier: 0.12,
      floodplainFertilityModifier: 0.22,
      crossingRisk: 0.42,
    },
    {
      riverId: REGIONAL_MAIN_DEEP_RIVER_ID,
      kind: "deep_channel",
      widthClass: "wide",
      depthClass: "deep",
      flowStrength: "strong",
      bankSteepness: 0.52,
      seasonalFlowVariance: 0.34,
      floodSeason: "spring",
      fordability: 0.14,
      navigability: 0.42,
      aquaticReliabilityModifier: 0.18,
      floodplainFertilityModifier: 0.18,
      crossingRisk: 0.7,
    },
    {
      riverId: REGIONAL_LAKE_OUTLET_RIVER_ID,
      kind: "marsh_channel",
      widthClass: "medium",
      depthClass: "shallow",
      flowStrength: "weak",
      bankSteepness: 0.18,
      seasonalFlowVariance: 0.62,
      floodSeason: "spring",
      fordability: 0.54,
      navigability: 0.24,
      aquaticReliabilityModifier: 0.22,
      floodplainFertilityModifier: 0.18,
      crossingRisk: 0.36,
    },
    {
      // MAP1-R: the lake's feeder from the pass slopes — a small seasonal
      // stream, easily forded, ending on the west shore.
      riverId: REGIONAL_LAKE_INFLOW_RIVER_ID,
      kind: "seasonal_stream",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "weak",
      bankSteepness: 0.24,
      seasonalFlowVariance: 0.68,
      floodSeason: "spring",
      fordability: 0.78,
      navigability: 0.04,
      aquaticReliabilityModifier: 0.08,
      floodplainFertilityModifier: 0.1,
      crossingRisk: 0.2,
    },
    {
      riverId: REGIONAL_DELTA_MARSH_RIVER_ID,
      kind: "marsh_channel",
      widthClass: "wide",
      depthClass: "mixed",
      flowStrength: "weak",
      bankSteepness: 0.12,
      seasonalFlowVariance: 0.46,
      floodSeason: "spring",
      fordability: 0.46,
      navigability: 0.32,
      aquaticReliabilityModifier: 0.28,
      floodplainFertilityModifier: 0.24,
      crossingRisk: 0.4,
    },
    {
      riverId: REGIONAL_ESTUARY_RIVER_ID,
      kind: "estuary",
      widthClass: "very_wide",
      depthClass: "deep",
      flowStrength: "moderate",
      bankSteepness: 0.22,
      seasonalFlowVariance: 0.28,
      floodSeason: "spring",
      fordability: 0.08,
      navigability: 0.54,
      aquaticReliabilityModifier: 0.34,
      floodplainFertilityModifier: 0.14,
      crossingRisk: 0.72,
    },
  ];
  const byId: Record<string, RiverSegmentProfile> = {};

  for (const profile of profiles) {
    byId[profile.riverId] = profile;
  }

  return byId as Readonly<Record<RiverId, RiverSegmentProfile>>;
}

function createRegionalRiverCrossings(
  config: WorldConfig,
  tiles: Readonly<Record<TileId, Tile>>,
): Readonly<Record<string, RiverCrossingProfile>> {
  const crossings: Record<string, RiverCrossingProfile> = {};
  const rivers = createRegionalRiverProfiles();

  for (const tile of Object.values(tiles)) {
    for (const neighborId of tile.neighbors) {
      const neighbor = tiles[neighborId];

      if (neighbor === undefined || String(tile.id) > String(neighbor.id)) {
        continue;
      }

      const crossing = getRegionalRiverCrossingForEdge(config, rivers, tile, neighbor);

      if (crossing !== undefined) {
        crossings[makeRiverCrossingKey(tile.id, neighbor.id)] = crossing;
      }
    }
  }

  return crossings;
}

function getRegionalRiverCrossingForEdge(
  config: WorldConfig,
  rivers: Readonly<Record<RiverId, RiverSegmentProfile>>,
  first: Tile,
  second: Tile,
): RiverCrossingProfile | undefined {
  const riverTile = first.riverSegmentId !== undefined ? first : second.riverSegmentId !== undefined ? second : undefined;
  const bankTile = riverTile?.id === first.id ? second : first;

  if (riverTile === undefined || bankTile === undefined || bankTile.riverSegmentId !== undefined) {
    return undefined;
  }

  const riverSegmentId = riverTile.riverSegmentId;

  if (riverSegmentId === undefined) {
    return undefined;
  }

  const river = rivers[riverSegmentId];

  if (river === undefined) {
    return undefined;
  }

  const crossingClass = getRegionalCrossingClass(config, riverTile, bankTile, river);
  const knownFord = crossingClass === "ford" || crossingClass === "seasonal_ford";
  const explicitQuality = getExplicitRegionalCrossingQuality(toRegionalPoint(config, riverTile.coord));
  const risk = clamp01(
    explicitQuality?.risk ??
      river.crossingRisk +
        river.bankSteepness * 0.16 +
        (riverTile.isMarshChannel ? 0.08 : 0),
  );

  return {
    fromTileId: first.id,
    toTileId: second.id,
    riverId: river.riverId,
    crossingClass,
    baseCrossingCost: round2(getCrossingBaseCost(crossingClass, river, explicitQuality?.cost)),
    seasonalCostModifier: round2(river.seasonalFlowVariance),
    risk: round2(risk),
    knownFord,
    confidence: knownFord ? 0.76 : 0.54,
  };
}

function getRegionalCrossingClass(
  config: WorldConfig,
  riverTile: Tile,
  bankTile: Tile,
  river: RiverSegmentProfile,
): RiverCrossingClass {
  const explicitQuality = getExplicitRegionalCrossingQuality(toRegionalPoint(config, riverTile.coord));

  if (explicitQuality !== undefined) {
    return explicitQuality.crossingClass;
  }

  if (river.kind === "rapid_gorge") {
    return "impassable_without_bridge_or_ferry";
  }

  if (river.kind === "estuary") {
    return "impassable_without_watercraft";
  }

  if (river.kind === "deep_channel") {
    return "dangerous_crossing";
  }

  if (river.kind === "marsh_channel") {
    return bankTile.terrainKind === "wetlands" ? "shallow_crossing" : "seasonal_ford";
  }

  if (river.kind === "seasonal_stream") {
    return "seasonal_ford";
  }

  if (river.kind === "shallow_braided") {
    return "shallow_crossing";
  }

  return river.fordability > 0.48 ? "seasonal_ford" : "dangerous_crossing";
}

function getExplicitRegionalCrossingQuality(
  point: MacroPoint,
): { readonly crossingClass: RiverCrossingClass; readonly cost: number; readonly risk: number } | undefined {
  if (distance(point, { x: 62, y: 47 }) <= 3.2) {
    return { crossingClass: "ford", cost: 0.42, risk: 0.18 };
  }

  if (distance(point, { x: 93, y: 54 }) <= 3.4) {
    return { crossingClass: "seasonal_ford", cost: 0.72, risk: 0.36 };
  }

  if (distance(point, { x: 112, y: 59 }) <= 3.2) {
    return { crossingClass: "dangerous_crossing", cost: 1.36, risk: 0.74 };
  }

  if (distance(point, { x: 136, y: 65 }) <= 5.2) {
    return { crossingClass: "shallow_crossing", cost: 0.86, risk: 0.42 };
  }

  if (distance(point, { x: 40, y: 34 }) <= 4.2) {
    return { crossingClass: "impassable_without_bridge_or_ferry", cost: 2.6, risk: 0.92 };
  }

  if (distance(point, { x: 69, y: 68 }) <= 4.2) {
    return { crossingClass: "seasonal_ford", cost: 0.82, risk: 0.38 };
  }

  return undefined;
}

function getCrossingBaseCost(
  crossingClass: RiverCrossingClass,
  river: RiverSegmentProfile,
  explicitCost: number | undefined,
): number {
  if (explicitCost !== undefined) {
    return explicitCost;
  }

  const classCost: Record<RiverCrossingClass, number> = {
    ford: 0.42,
    seasonal_ford: 0.78,
    shallow_crossing: 0.92,
    dangerous_crossing: 1.46,
    impassable_without_watercraft: 2.1,
    impassable_without_bridge_or_ferry: 4,
  };

  return classCost[crossingClass] + river.bankSteepness * 0.28;
}

function regionalEllipse(
  point: MacroPoint,
  center: MacroPoint,
  radiusX: number,
  radiusY: number,
): number {
  const normalizedX = (point.x - center.x) / radiusX;
  const normalizedY = (point.y - center.y) / radiusY;

  return clamp01(1 - (normalizedX * normalizedX + normalizedY * normalizedY));
}

function getRegionalElevation(input: {
  readonly isOcean: boolean;
  readonly isLake: boolean;
  readonly mountainInfluence: number;
  readonly corridorInfluence: number;
  readonly dryInteriorInfluence: number;
  readonly floodplainInfluence: number;
}): number {
  if (input.isOcean || input.isLake) {
    return 0.05;
  }

  return clamp01(
    0.16 +
      input.mountainInfluence * 0.72 +
      input.dryInteriorInfluence * 0.16 -
      input.floodplainInfluence * 0.12 -
      input.corridorInfluence * 0.22,
  );
}

function getRegionalTerrainKind(input: {
  readonly isOcean: boolean;
  readonly isLake: boolean;
  readonly isRiver: boolean;
  readonly isCoastal: boolean;
  readonly isDeltaWetland: boolean;
  readonly isLakeWetland: boolean;
  readonly mountainInfluence: number;
  readonly corridorInfluence: number;
  readonly floodplainInfluence: number;
  readonly dryInteriorInfluence: number;
  readonly baseRichness: number;
}): TerrainKind {
  if (input.isLake) {
    return "lake";
  }

  if (input.isOcean || input.isCoastal) {
    return "coast";
  }

  if (input.isRiver || input.floodplainInfluence > 0.42) {
    return "river_valley";
  }

  if (input.isDeltaWetland || input.isLakeWetland) {
    return "wetlands";
  }

  if (input.corridorInfluence > 0.58 && input.mountainInfluence > 0.18) {
    return "hills";
  }

  if (input.mountainInfluence > 0.62) {
    return "mountains";
  }

  if (input.mountainInfluence > 0.34) {
    return "hills";
  }

  if (input.dryInteriorInfluence > 0.52) {
    return "desert";
  }

  if (input.baseRichness > 0.62) {
    return "forest";
  }

  return "plains";
}

function getRegionalBiomeKind(input: {
  readonly terrainKind: TerrainKind;
  readonly isCoastal: boolean;
  readonly isDeltaWetland: boolean;
  readonly isLakeWetland: boolean;
  readonly corridorInfluence: number;
}): BiomeKind {
  if (input.isCoastal) {
    return "coastal";
  }

  if (input.isDeltaWetland || input.isLakeWetland) {
    return "marsh";
  }

  if (input.terrainKind === "river_valley") {
    return "floodplain";
  }

  if (input.terrainKind === "desert") {
    return "arid";
  }

  if (input.terrainKind === "mountains") {
    return "alpine";
  }

  if (input.corridorInfluence > 0.58) {
    return "shrubland";
  }

  if (input.terrainKind === "forest") {
    return "temperate_forest";
  }

  return "temperate_grassland";
}

function getRegionalMovementCost(input: {
  readonly terrainKind: TerrainKind;
  readonly isAquatic: boolean;
  readonly mountainInfluence: number;
  readonly corridorInfluence: number;
  readonly floodRisk: number;
  readonly droughtRisk: number;
}): number {
  const terrainCost: Record<TerrainKind, number> = {
    plains: 1.16,
    forest: 1.34,
    hills: 1.58,
    mountains: 2.65,
    wetlands: 1.72,
    river_valley: 1.08,
    coast: 1.24,
    lake: 2.1,
    desert: 1.76,
    tundra: 1.5,
  };

  const rawCost =
    terrainCost[input.terrainKind] +
      input.mountainInfluence * 0.44 +
      input.floodRisk * 0.18 +
      input.droughtRisk * 0.12 -
      input.corridorInfluence * 0.64 +
      (input.isAquatic ? 0.24 : 0);

  return round2(Math.max(0.9, Math.min(3.2, rawCost)));
}

function getRegionalPeakSeasons(
  waterAccess: number,
  seasonalVariance: number,
  isLakeWetland: boolean,
): readonly Season[] {
  if (isLakeWetland || seasonalVariance > 0.58) {
    return ["spring", "autumn"];
  }

  if (waterAccess > 0.72) {
    return ["spring", "summer"];
  }

  return ["autumn"];
}

function createEarthDebugTile(config: WorldConfig, coord: Coord): Tile {
  const x = coord.x / Math.max(1, config.width - 1);
  const y = coord.y / Math.max(1, config.height - 1);
  const id = makeTileId(coord);
  const regionId = getRegionId(config, coord);
  const landScore = getEarthLandScore(x, y);
  const isOcean = landScore < 0.22;
  const lakeInfluence = getEarthLakeInfluence(x, y);
  const isLake = !isOcean && lakeInfluence > 0.68;
  const riverInfluence = isOcean || isLake ? 0 : getEarthRiverInfluence(x, y);
  const isRiver = riverInfluence > 0.74;
  const isAquatic = isOcean || isLake || isRiver;
  const isCoastal =
    !isAquatic && (landScore < 0.36 || getEarthCoastalBayInfluence(x, y) > 0.68);
  const desertInfluence = getEarthDesertInfluence(x, y);
  const mountainInfluence = getEarthMountainInfluence(x, y);
  const latitudeWetness = clamp01(1 - Math.abs(y - 0.5) * 1.7);
  const fertileRiverValley = clamp01(riverInfluence * 0.82);
  const coastalWetness = isCoastal ? 0.38 : 0;
  const waterAccess = clamp01(
    (isAquatic ? 0.96 : 0) + fertileRiverValley * 0.72 + coastalWetness + lakeInfluence * 0.34,
  );
  const droughtRisk = clamp01(
    desertInfluence * 0.82 + Math.abs(y - 0.5) * 0.18 - waterAccess * 0.28,
  );
  const floodRisk = clamp01(
    (isRiver ? 0.78 : 0) + fertileRiverValley * 0.28 + (isCoastal ? 0.2 : 0),
  );
  const diseaseRisk = clamp01(
    waterAccess * 0.34 + latitudeWetness * 0.22 + floodRisk * 0.2,
  );
  const elevation = isOcean || isLake
    ? 0.06
    : clamp01(0.16 + mountainInfluence * 0.72 + desertInfluence * 0.1);
  const baseRichness = clamp01(
    0.18 +
      latitudeWetness * 0.24 +
      waterAccess * 0.34 +
      fertileRiverValley * 0.34 -
      droughtRisk * 0.38 -
      mountainInfluence * 0.18,
  );
  const aquaticPotential = clamp01(
    (isOcean ? 0.86 : 0) + (isLake ? 0.76 : 0) + (isRiver ? 0.48 : 0) + (isCoastal ? 0.34 : 0),
  );
  const wildGrainPotential = clamp01(
    0.16 + baseRichness * 0.44 + fertileRiverValley * 0.22 - mountainInfluence * 0.12,
  );
  const plantTendingPotential = clamp01(
    baseRichness * 0.52 + waterAccess * 0.26 + fertileRiverValley * 0.28 - mountainInfluence * 0.14,
  );
  const storageSuitability = clamp01(
    0.36 + droughtRisk * 0.18 + elevation * 0.18 - floodRisk * 0.24 - diseaseRisk * 0.08,
  );
  const terrainKind = getTerrainKind({
    isSea: isOcean,
    isLake,
    isRiver,
    isCoastal,
    elevation,
    floodRisk,
    droughtRisk,
    baseRichness,
  });
  const movementCost = getMovementCost({
    terrainKind,
    elevation,
    isAquatic,
    floodRisk,
    droughtRisk,
    fineNoise: 0.12 + mountainInfluence * 0.24,
  });
  const resourceProfile: TileResourceProfile = {
    baseRichness,
    waterAccess,
    aquaticPotential,
    wildGrainPotential,
    plantTendingPotential,
    storageSuitability,
    resourceRegenerationRate: clamp01(0.2 + baseRichness * 0.52 + waterAccess * 0.16),
  };

  return {
    id,
    coord,
    regionId,
    terrainKind,
    biomeKind: "unknown",
    resourceProfile,
    seasonalProfile: {
      seasonalVariance: clamp01(0.2 + droughtRisk * 0.35 + Math.abs(y - 0.5) * 0.2),
      peakSeasons: waterAccess > 0.7 ? ["spring", "summer"] : ["spring", "autumn"],
      leanSeasons: droughtRisk > 0.55 ? ["summer", "winter"] : ["winter"],
      reliability: clamp01(0.84 - droughtRisk * 0.34 - floodRisk * 0.12),
      expectedWinterStress: clamp01(0.2 + Math.max(0, 0.32 - y) * 0.55 + droughtRisk * 0.18),
    },
    riskProfile: {
      floodRisk,
      droughtRisk,
      diseaseRisk,
      depletionRisk: clamp01(baseRichness * 0.24 + (1 - waterAccess) * 0.22),
      climateVolatility: clamp01(0.14 + droughtRisk * 0.24 + floodRisk * 0.16),
    },
    carryingCapacity: getCarryingCapacity(resourceProfile, movementCost),
    movementCost,
    elevation,
    isRiver,
    isCoastal,
    isAquatic,
    isFloodplain: false,
    isRiverbank: false,
    isConfluence: false,
    isEstuary: false,
    isMarshChannel: false,
    neighbors: getNeighborIds(config, coord),
  };
}

function createTile(
  config: WorldConfig,
  seedHash: number,
  macroPlan: MacroWorldPlan,
  coord: Coord,
): Tile {
  const { x, y } = coord;
  const id = makeTileId(coord);
  const regionId = getRegionId(config, coord);
  const coastWaterDepth = getCoastWaterDepth(config, macroPlan.coast, coord);
  const coastDistance = getDistanceFromCoastEdge(config, macroPlan.coast.side, coord);
  const coastProximity = coastDistance - coastWaterDepth;
  const riverDistance = getRiverDistance(coord, macroPlan.river);
  const nearestLake = getNearestLakeDistance(coord, macroPlan.lakes);
  const isSea = coastProximity <= 0;
  const isLake = nearestLake.distance <= nearestLake.radius;
  const isRiver = riverDistance <= macroPlan.river.width && !isSea && !isLake;
  const isAquatic = isSea || isLake || isRiver;
  const isCoastal =
    !isAquatic &&
    (coastProximity <= 2.4 ||
      (nearestLake.distance > nearestLake.radius &&
        nearestLake.distance <= nearestLake.radius + 1.6));
  const broadNoise = smoothNoise(seedHash, x, y, 5);
  const fineNoise = smoothNoise(seedHash + 97, x, y, 2);
  const richZone = getZoneInfluence(coord, macroPlan.richZones);
  const dryZone = getZoneInfluence(coord, macroPlan.dryZones);
  const elevationZone = getZoneInfluence(coord, macroPlan.elevationZones);
  const ridgeInfluence = getRidgeInfluence(coord, macroPlan.ridges);
  const coastWaterAccess = coastProximity <= 3.6 ? (3.6 - coastProximity) / 3.6 : 0;
  const lakeWaterAccess =
    nearestLake.distance <= nearestLake.radius + 4
      ? (nearestLake.radius + 4 - nearestLake.distance) / (nearestLake.radius + 4)
      : 0;
  const riverWaterAccess = clamp01(1 - riverDistance / 7);
  const dryBand = clamp01(
    macroPlan.aridityBias + dryZone * 0.72 + (1 - riverWaterAccess) * 0.18 - richZone * 0.22,
  );
  const elevation = isAquatic
    ? clamp01(0.08 + fineNoise * 0.08)
    : clamp01(
        0.12 +
          broadNoise * 0.34 +
          elevationZone * 0.34 +
          ridgeInfluence * 0.42 +
          dryZone * 0.12,
      );
  const waterAccess = clamp01(
    (isAquatic ? 0.95 : 0) +
      riverWaterAccess * 0.52 +
      coastWaterAccess * 0.48 +
      lakeWaterAccess * 0.56 +
      richZone * 0.18 -
      dryBand * 0.28,
  );
  const floodRisk = clamp01(
    (isRiver ? 0.85 : 0) +
      (isCoastal ? coastWaterAccess * 0.36 : 0) +
      (nearestLake.distance <= nearestLake.radius + 1.3 ? 0.44 : 0) -
      elevation * 0.35,
  );
  const droughtRisk = clamp01(dryBand * 0.72 + (1 - waterAccess) * 0.45);
  const diseaseRisk = clamp01(waterAccess * 0.42 + floodRisk * 0.38 + (isAquatic ? 0.14 : 0));
  const baseRichness = clamp01(
    0.16 +
      waterAccess * 0.36 +
      richZone * 0.34 +
      broadNoise * 0.22 +
      fineNoise * 0.1 -
      droughtRisk * 0.32 -
      ridgeInfluence * 0.08,
  );
  const aquaticPotential = clamp01(
    (isAquatic ? 0.78 : 0) + (isCoastal ? 0.42 : 0) + waterAccess * 0.22,
  );
  const wildGrainPotential = clamp01(
    0.16 + (1 - droughtRisk) * 0.36 + fineNoise * 0.32 - floodRisk * 0.12,
  );
  const plantTendingPotential = clamp01(
    baseRichness * 0.48 + waterAccess * 0.34 + wildGrainPotential * 0.22 - floodRisk * 0.1,
  );
  const storageSuitability = clamp01(
    0.3 + elevation * 0.28 + droughtRisk * 0.22 - floodRisk * 0.28 - diseaseRisk * 0.1,
  );
  const terrainKind = getTerrainKind({
    isSea,
    isLake,
    isRiver,
    isCoastal,
    elevation,
    floodRisk,
    droughtRisk,
    baseRichness,
  });
  const movementCost = getMovementCost({
    terrainKind,
    elevation,
    isAquatic,
    floodRisk,
    droughtRisk,
    fineNoise,
  });
  const resourceProfile: TileResourceProfile = {
    baseRichness,
    waterAccess,
    aquaticPotential,
    wildGrainPotential,
    plantTendingPotential,
    storageSuitability,
    resourceRegenerationRate: clamp01(0.18 + baseRichness * 0.52 + waterAccess * 0.18),
  };
  const carryingCapacity = getCarryingCapacity(resourceProfile, movementCost);

  return {
    id,
    coord,
    regionId,
    terrainKind,
    biomeKind: "unknown",
    resourceProfile,
    seasonalProfile: {
      seasonalVariance: clamp01(0.18 + droughtRisk * 0.42 + fineNoise * 0.24),
      peakSeasons: getPeakSeasons(waterAccess, droughtRisk),
      leanSeasons: droughtRisk > 0.55 ? ["summer", "winter"] : ["winter"],
      reliability: clamp01(0.88 - droughtRisk * 0.38 - floodRisk * 0.16),
      expectedWinterStress: clamp01(0.24 + droughtRisk * 0.24 + (1 - storageSuitability) * 0.22),
    },
    riskProfile: {
      floodRisk,
      droughtRisk,
      diseaseRisk,
      depletionRisk: clamp01(baseRichness * 0.28 + (1 - waterAccess) * 0.3),
      climateVolatility: clamp01(0.16 + droughtRisk * 0.28 + floodRisk * 0.18),
    },
    carryingCapacity,
    movementCost,
    elevation,
    isRiver,
    isCoastal,
    isAquatic,
    isFloodplain: false,
    isRiverbank: false,
    isConfluence: false,
    isEstuary: false,
    isMarshChannel: false,
    neighbors: getNeighborIds(config, coord),
  };
}

// PRE-RUN-MAP-MAKER-1 — exported so setup-only terrain painting (mapEdits.ts)
// derives painted-tile capacity/movement/seasonality through the exact same
// formulas as generated tiles.
export function getCarryingCapacity(
  resources: TileResourceProfile,
  movementCost: number,
): CarryingCapacityProfile {
  const accessPenalty = clamp01((movementCost - 1) / 3);

  return {
    foraging: {
      sustainablePopulation: Math.round(12 + resources.baseRichness * 42),
      foodPerTick: resources.baseRichness * 18,
      reliability: clamp01(0.42 + resources.resourceRegenerationRate * 0.45),
      depletionSensitivity: clamp01(0.48 + accessPenalty * 0.2),
      seasonalPressure: clamp01(0.35 + accessPenalty * 0.22),
    },
    aquatic: {
      sustainablePopulation: Math.round(8 + resources.aquaticPotential * 52),
      foodPerTick: resources.aquaticPotential * 21,
      reliability: clamp01(0.34 + resources.aquaticPotential * 0.5),
      depletionSensitivity: clamp01(0.3 + resources.aquaticPotential * 0.24),
      seasonalPressure: clamp01(0.24 + (1 - resources.waterAccess) * 0.3),
    },
    plantTending: {
      sustainablePopulation: Math.round(10 + resources.plantTendingPotential * 60),
      foodPerTick: resources.plantTendingPotential * 24,
      reliability: clamp01(0.32 + resources.plantTendingPotential * 0.48),
      depletionSensitivity: clamp01(0.38 + resources.plantTendingPotential * 0.24),
      seasonalPressure: clamp01(0.42 - resources.storageSuitability * 0.16),
    },
    earlyAgriculture: {
      sustainablePopulation: Math.round(14 + resources.plantTendingPotential * 78),
      foodPerTick: resources.plantTendingPotential * 29,
      reliability: clamp01(0.28 + resources.waterAccess * 0.34 + resources.storageSuitability * 0.2),
      depletionSensitivity: clamp01(0.52 + accessPenalty * 0.12),
      seasonalPressure: clamp01(0.48 - resources.storageSuitability * 0.18),
    },
    irrigatedAgriculture: {
      sustainablePopulation: Math.round(18 + resources.waterAccess * 88),
      foodPerTick: resources.waterAccess * 32,
      reliability: clamp01(0.2 + resources.waterAccess * 0.58),
      depletionSensitivity: clamp01(0.6 + accessPenalty * 0.08),
      seasonalPressure: clamp01(0.44 - resources.waterAccess * 0.16),
    },
  };
}

function getNeighborIds(config: WorldConfig, coord: Coord): readonly TileId[] {
  const offsets: readonly Coord[] = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  return offsets
    .map((offset) => ({ x: coord.x + offset.x, y: coord.y + offset.y }))
    .filter((candidate) => isInsideWorld(config, candidate))
    .map(makeTileId);
}

function getTerrainKind(input: {
  readonly isSea: boolean;
  readonly isLake: boolean;
  readonly isRiver: boolean;
  readonly isCoastal: boolean;
  readonly elevation: number;
  readonly floodRisk: number;
  readonly droughtRisk: number;
  readonly baseRichness: number;
}): TerrainKind {
  if (input.isLake) {
    return "lake";
  }

  if (input.isSea || input.isCoastal) {
    return "coast";
  }

  if (input.isRiver) {
    return "river_valley";
  }

  if (input.elevation > 0.72) {
    return "mountains";
  }

  if (input.elevation > 0.58) {
    return "hills";
  }

  if (input.floodRisk > 0.52) {
    return "wetlands";
  }

  if (input.droughtRisk > 0.66) {
    return "desert";
  }

  if (input.baseRichness > 0.64) {
    return "forest";
  }

  return "plains";
}

// PRE-RUN-MAP-MAKER-1 — exported for setup-only terrain painting (mapEdits.ts).
export function getMovementCost(input: {
  readonly terrainKind: TerrainKind;
  readonly elevation: number;
  readonly isAquatic: boolean;
  readonly floodRisk: number;
  readonly droughtRisk: number;
  readonly fineNoise: number;
}): number {
  const terrainCost: Record<TerrainKind, number> = {
    plains: 1,
    forest: 1.35,
    hills: 1.55,
    mountains: 2.4,
    wetlands: 1.8,
    river_valley: 1.15,
    coast: 1.25,
    lake: 2.15,
    desert: 1.75,
    tundra: 1.55,
  };

  return round2(
    terrainCost[input.terrainKind] +
      input.elevation * 0.48 +
      input.floodRisk * 0.24 +
      input.droughtRisk * 0.18 +
      input.fineNoise * 0.22 +
      (input.isAquatic ? 0.45 : 0),
  );
}

// PRE-RUN-MAP-MAKER-1 — exported for setup-only terrain painting (mapEdits.ts).
export function getPeakSeasons(
  waterAccess: number,
  droughtRisk: number,
): readonly Season[] {
  if (waterAccess > 0.74) {
    return ["spring", "summer"];
  }

  if (droughtRisk > 0.58) {
    return ["autumn"];
  }

  return [SEASON_ORDER[0], SEASON_ORDER[2]];
}

function getRegionId(config: WorldConfig, coord: Coord): RegionId {
  const horizontal = coord.x < config.width / 2 ? "west" : "east";
  const vertical = coord.y < config.height / 2 ? "north" : "south";

  return `region:${vertical}:${horizontal}` as RegionId;
}

function formatRegionName(regionId: RegionId): string {
  return String(regionId).replace("region:", "").replace(":", " ");
}

function getEarthLandScore(x: number, y: number): number {
  const continentalMass = Math.max(
    // Stylized equirectangular continent masks, not GIS data.
    ellipseInfluence(x, y, 0.16, 0.28, 0.14, 0.12),
    ellipseInfluence(x, y, 0.23, 0.36, 0.11, 0.11),
    ellipseInfluence(x, y, 0.11, 0.24, 0.08, 0.05),
    ellipseInfluence(x, y, 0.28, 0.45, 0.06, 0.045),
    ellipseInfluence(x, y, 0.32, 0.59, 0.065, 0.12),
    ellipseInfluence(x, y, 0.34, 0.75, 0.045, 0.14),
    ellipseInfluence(x, y, 0.35, 0.13, 0.06, 0.04),
    ellipseInfluence(x, y, 0.52, 0.33, 0.08, 0.07),
    ellipseInfluence(x, y, 0.66, 0.32, 0.19, 0.11),
    ellipseInfluence(x, y, 0.82, 0.36, 0.13, 0.11),
    ellipseInfluence(x, y, 0.92, 0.47, 0.055, 0.065),
    ellipseInfluence(x, y, 0.63, 0.46, 0.055, 0.05),
    ellipseInfluence(x, y, 0.69, 0.52, 0.045, 0.075),
    ellipseInfluence(x, y, 0.78, 0.52, 0.07, 0.045),
    ellipseInfluence(x, y, 0.86, 0.56, 0.055, 0.045),
    ellipseInfluence(x, y, 0.56, 0.52, 0.085, 0.13),
    ellipseInfluence(x, y, 0.59, 0.67, 0.06, 0.11),
    ellipseInfluence(x, y, 0.82, 0.72, 0.085, 0.055),
    ellipseInfluence(x, y, 0.88, 0.85, 0.035, 0.04),
    ellipseInfluence(x, y, 0.60, 0.68, 0.025, 0.04),
    ellipseInfluence(x, y, 0.49, 0.37, 0.025, 0.025),
    clamp01((y - 0.89) / 0.035),
  );
  const waterCut = Math.max(
    ellipseInfluence(x, y, 0.27, 0.43, 0.09, 0.04),
    ellipseInfluence(x, y, 0.22, 0.24, 0.06, 0.045),
    ellipseInfluence(x, y, 0.46, 0.4, 0.09, 0.035),
    ellipseInfluence(x, y, 0.58, 0.41, 0.075, 0.026),
    ellipseInfluence(x, y, 0.63, 0.45, 0.022, 0.06),
    ellipseInfluence(x, y, 0.72, 0.55, 0.04, 0.035),
    ellipseInfluence(x, y, 0.76, 0.59, 0.06, 0.04),
    ellipseInfluence(x, y, 0.90, 0.62, 0.045, 0.05),
  );

  return clamp01(continentalMass - waterCut * 0.48);
}

function getEarthLakeInfluence(x: number, y: number): number {
  return Math.max(
    ellipseInfluence(x, y, 0.25, 0.32, 0.04, 0.021),
    ellipseInfluence(x, y, 0.63, 0.38, 0.026, 0.04),
    ellipseInfluence(x, y, 0.76, 0.31, 0.026, 0.015),
    ellipseInfluence(x, y, 0.59, 0.57, 0.022, 0.025),
    ellipseInfluence(x, y, 0.59, 0.63, 0.014, 0.045),
  );
}

function getEarthCoastalBayInfluence(x: number, y: number): number {
  return Math.max(
    ellipseInfluence(x, y, 0.27, 0.43, 0.08, 0.045),
    ellipseInfluence(x, y, 0.46, 0.4, 0.11, 0.04),
    ellipseInfluence(x, y, 0.58, 0.41, 0.09, 0.032),
    ellipseInfluence(x, y, 0.63, 0.45, 0.03, 0.07),
    ellipseInfluence(x, y, 0.73, 0.55, 0.045, 0.04),
    ellipseInfluence(x, y, 0.78, 0.6, 0.07, 0.045),
    ellipseInfluence(x, y, 0.9, 0.62, 0.05, 0.05),
  );
}

function getEarthRiverInfluence(x: number, y: number): number {
  const point = { x, y };
  const riverDistances = [
    distanceToSegment(point, { x: 0.24, y: 0.27 }, { x: 0.27, y: 0.43 }),
    distanceToSegment(point, { x: 0.31, y: 0.58 }, { x: 0.42, y: 0.55 }),
    distanceToSegment(point, { x: 0.31, y: 0.53 }, { x: 0.38, y: 0.57 }),
    distanceToSegment(point, { x: 0.58, y: 0.68 }, { x: 0.57, y: 0.41 }),
    distanceToSegment(point, { x: 0.55, y: 0.55 }, { x: 0.6, y: 0.55 }),
    distanceToSegment(point, { x: 0.52, y: 0.36 }, { x: 0.6, y: 0.38 }),
    distanceToSegment(point, { x: 0.61, y: 0.42 }, { x: 0.64, y: 0.49 }),
    distanceToSegment(point, { x: 0.68, y: 0.45 }, { x: 0.77, y: 0.48 }),
    distanceToSegment(point, { x: 0.79, y: 0.42 }, { x: 0.89, y: 0.43 }),
    distanceToSegment(point, { x: 0.77, y: 0.36 }, { x: 0.87, y: 0.38 }),
  ];
  const nearestRiverDistance = Math.min(...riverDistances);

  return clamp01(1 - nearestRiverDistance / 0.018);
}

function getEarthDesertInfluence(x: number, y: number): number {
  return Math.max(
    ellipseInfluence(x, y, 0.55, 0.46, 0.11, 0.06),
    ellipseInfluence(x, y, 0.63, 0.48, 0.05, 0.045),
    ellipseInfluence(x, y, 0.72, 0.35, 0.1, 0.045),
    ellipseInfluence(x, y, 0.82, 0.73, 0.075, 0.05),
    ellipseInfluence(x, y, 0.22, 0.39, 0.07, 0.05),
    ellipseInfluence(x, y, 0.31, 0.72, 0.035, 0.1),
    ellipseInfluence(x, y, 0.57, 0.68, 0.06, 0.055),
  );
}

function getEarthMountainInfluence(x: number, y: number): number {
  const point = { x, y };
  const ridgeDistances = [
    distanceToSegment(point, { x: 0.31, y: 0.51 }, { x: 0.34, y: 0.86 }),
    distanceToSegment(point, { x: 0.17, y: 0.19 }, { x: 0.21, y: 0.45 }),
    distanceToSegment(point, { x: 0.49, y: 0.36 }, { x: 0.58, y: 0.38 }),
    distanceToSegment(point, { x: 0.61, y: 0.42 }, { x: 0.68, y: 0.49 }),
    distanceToSegment(point, { x: 0.67, y: 0.42 }, { x: 0.79, y: 0.41 }),
    distanceToSegment(point, { x: 0.56, y: 0.55 }, { x: 0.59, y: 0.72 }),
    distanceToSegment(point, { x: 0.84, y: 0.67 }, { x: 0.85, y: 0.78 }),
  ];
  const ridgeInfluence = Math.max(
    ...ridgeDistances.map((ridgeDistance) => clamp01(1 - ridgeDistance / 0.035)),
  );

  return Math.max(
    ridgeInfluence,
    ellipseInfluence(x, y, 0.75, 0.72, 0.04, 0.035) * 0.58,
  );
}

function ellipseInfluence(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): number {
  const normalizedX = (x - centerX) / radiusX;
  const normalizedY = (y - centerY) / radiusY;
  const distanceSquared = normalizedX * normalizedX + normalizedY * normalizedY;

  return clamp01(1 - distanceSquared);
}

function createMacroWorldPlan(
  config: WorldConfig,
  seedHash: number,
): MacroWorldPlan {
  const rng = createSeededRng(seedHash);
  const coastSide = pickOne(rng, COAST_SIDES);
  const coast: CoastPlan = {
    side: coastSide,
    baseDepth: 1.1 + rng() * 1.7,
    amplitude: 0.8 + rng() * 1.8,
    frequency: 1.2 + rng() * 2.2,
    phase: rng() * Math.PI * 2,
  };
  const river = createRiverPlan(config, rng, coastSide);
  const lakes = createLakePlans(config, rng, coastSide);

  return {
    coast,
    river,
    lakes,
    richZones: createZonePlans(config, rng, 2 + Math.floor(rng() * 3), 0.42, 0.9),
    dryZones: createZonePlans(config, rng, 2 + Math.floor(rng() * 3), 0.45, 0.95),
    elevationZones: createZonePlans(config, rng, 2 + Math.floor(rng() * 3), 0.32, 0.82),
    ridges: createRidgePlans(config, rng),
    aridityBias: rng() * 0.22,
  };
}

function createRiverPlan(
  config: WorldConfig,
  rng: () => number,
  coastSide: CoastSide,
): RiverPlan {
  const target = getPointOnEdge(config, coastSide, rng);
  const sourceEdge = pickOne(
    rng,
    getNonAdjacentEdges(coastSide),
  );
  const source = getPointOnEdge(config, sourceEdge, rng);
  const controlA = {
    x: lerp(source.x, target.x, 0.32) + (rng() - 0.5) * config.width * 0.42,
    y: lerp(source.y, target.y, 0.32) + (rng() - 0.5) * config.height * 0.42,
  };
  const controlB = {
    x: lerp(source.x, target.x, 0.68) + (rng() - 0.5) * config.width * 0.38,
    y: lerp(source.y, target.y, 0.68) + (rng() - 0.5) * config.height * 0.38,
  };

  return {
    points: [source, clampPoint(config, controlA), clampPoint(config, controlB), target],
    width: 0.58 + rng() * 0.25,
  };
}

function createLakePlans(
  config: WorldConfig,
  rng: () => number,
  coastSide: CoastSide,
): readonly LakePlan[] {
  const count = 1 + Math.floor(rng() * 3);
  const lakes: LakePlan[] = [];

  for (let index = 0; index < count; index += 1) {
    lakes.push({
      center: getInteriorPoint(config, rng, coastSide),
      radius: 1.4 + rng() * 2.2,
    });
  }

  return lakes;
}

function createZonePlans(
  config: WorldConfig,
  rng: () => number,
  count: number,
  minimumIntensity: number,
  maximumIntensity: number,
): readonly MacroZone[] {
  const zones: MacroZone[] = [];

  for (let index = 0; index < count; index += 1) {
    zones.push({
      center: {
        x: rng() * (config.width - 1),
        y: rng() * (config.height - 1),
      },
      radius: 4 + rng() * 8,
      intensity: lerp(minimumIntensity, maximumIntensity, rng()),
    });
  }

  return zones;
}

function createRidgePlans(
  config: WorldConfig,
  rng: () => number,
): readonly RidgePlan[] {
  const count = 1 + Math.floor(rng() * 2);
  const ridges: RidgePlan[] = [];

  for (let index = 0; index < count; index += 1) {
    const sideA = pickOne(rng, COAST_SIDES);
    const sideB = pickOne(rng, getNonAdjacentEdges(sideA));
    ridges.push({
      start: getPointOnEdge(config, sideA, rng),
      end: getPointOnEdge(config, sideB, rng),
      width: 1.8 + rng() * 2.8,
      intensity: 0.38 + rng() * 0.5,
    });
  }

  return ridges;
}

function getPointOnEdge(
  config: WorldConfig,
  edge: CoastSide,
  rng: () => number,
): MacroPoint {
  const margin = 1.5;

  if (edge === "north") {
    return { x: lerp(margin, config.width - 1 - margin, rng()), y: 0 };
  }

  if (edge === "south") {
    return { x: lerp(margin, config.width - 1 - margin, rng()), y: config.height - 1 };
  }

  if (edge === "east") {
    return { x: config.width - 1, y: lerp(margin, config.height - 1 - margin, rng()) };
  }

  return { x: 0, y: lerp(margin, config.height - 1 - margin, rng()) };
}

function getInteriorPoint(
  config: WorldConfig,
  rng: () => number,
  coastSide: CoastSide,
): MacroPoint {
  const margin = 3;
  const point = {
    x: lerp(margin, config.width - 1 - margin, rng()),
    y: lerp(margin, config.height - 1 - margin, rng()),
  };

  if (coastSide === "north") {
    return { ...point, y: Math.max(point.y, config.height * 0.25) };
  }

  if (coastSide === "south") {
    return { ...point, y: Math.min(point.y, config.height * 0.75) };
  }

  if (coastSide === "east") {
    return { ...point, x: Math.min(point.x, config.width * 0.75) };
  }

  return { ...point, x: Math.max(point.x, config.width * 0.25) };
}

function getNonAdjacentEdges(edge: CoastSide): readonly CoastSide[] {
  if (edge === "north") {
    return ["south", "east", "west"];
  }

  if (edge === "south") {
    return ["north", "east", "west"];
  }

  if (edge === "east") {
    return ["west", "north", "south"];
  }

  return ["east", "north", "south"];
}

function getCoastWaterDepth(
  config: WorldConfig,
  coast: CoastPlan,
  coord: Coord,
): number {
  const tangent =
    coast.side === "north" || coast.side === "south"
      ? coord.x / Math.max(1, config.width - 1)
      : coord.y / Math.max(1, config.height - 1);
  const wave = Math.sin(tangent * Math.PI * 2 * coast.frequency + coast.phase);
  const secondary = Math.sin(tangent * Math.PI * 5 + coast.phase * 0.7) * 0.45;

  return coast.baseDepth + wave * coast.amplitude + secondary;
}

function getDistanceFromCoastEdge(
  config: WorldConfig,
  coastSide: CoastSide,
  coord: Coord,
): number {
  if (coastSide === "north") {
    return coord.y;
  }

  if (coastSide === "south") {
    return config.height - 1 - coord.y;
  }

  if (coastSide === "east") {
    return config.width - 1 - coord.x;
  }

  return coord.x;
}

function getNearestLakeDistance(
  coord: Coord,
  lakes: readonly LakePlan[],
): { readonly distance: number; readonly radius: number } {
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestRadius = 0;

  for (const lake of lakes) {
    const lakeDistance = distance(coord, lake.center);

    if (lakeDistance < nearestDistance) {
      nearestDistance = lakeDistance;
      nearestRadius = lake.radius;
    }
  }

  return { distance: nearestDistance, radius: nearestRadius };
}

function getRiverDistance(coord: Coord, river: RiverPlan): number {
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < river.points.length - 1; index += 1) {
    nearestDistance = Math.min(
      nearestDistance,
      distanceToSegment(coord, river.points[index], river.points[index + 1]),
    );
  }

  return nearestDistance;
}

function getZoneInfluence(coord: Coord, zones: readonly MacroZone[]): number {
  let influence = 0;

  for (const zone of zones) {
    const normalizedDistance = distance(coord, zone.center) / zone.radius;
    const falloff = clamp01(1 - normalizedDistance);
    influence += falloff * falloff * zone.intensity;
  }

  return clamp01(influence);
}

function getRidgeInfluence(coord: Coord, ridges: readonly RidgePlan[]): number {
  let influence = 0;

  for (const ridge of ridges) {
    const ridgeDistance = distanceToSegment(coord, ridge.start, ridge.end);
    const falloff = clamp01(1 - ridgeDistance / ridge.width);
    influence += falloff * falloff * ridge.intensity;
  }

  return clamp01(influence);
}

function distanceToSegment(
  point: MacroPoint,
  start: MacroPoint,
  end: MacroPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distance(point, start);
  }

  const t = clamp01(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
  );
  const projected = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return distance(point, projected);
}

function clampPoint(config: WorldConfig, point: MacroPoint): MacroPoint {
  return {
    x: Math.max(0, Math.min(config.width - 1, point.x)),
    y: Math.max(0, Math.min(config.height - 1, point.y)),
  };
}

function smoothNoise(
  seedHash: number,
  x: number,
  y: number,
  scale: number,
): number {
  const scaledX = Math.floor(x / scale);
  const scaledY = Math.floor(y / scale);

  return (
    hashNoise(seedHash, scaledX, scaledY, 0) * 0.55 +
    hashNoise(seedHash, scaledX + 1, scaledY, 11) * 0.2 +
    hashNoise(seedHash, scaledX, scaledY + 1, 23) * 0.15 +
    hashNoise(seedHash, x, y, 41) * 0.1
  );
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRng(seedHash: number): () => number {
  let state = seedHash || 0x6d2b79f5;

  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);

    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<TValue>(
  rng: () => number,
  values: readonly TValue[],
): TValue {
  return values[Math.floor(rng() * values.length)];
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function hashNoise(
  seedHash: number,
  x: number,
  y: number,
  salt: number,
): number {
  let hash = seedHash ^ Math.imul(x + 374761393, 668265263);
  hash ^= Math.imul(y + 1442695041, 2246822519);
  hash ^= Math.imul(salt + 3266489917, 3266489917);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  hash ^= hash >>> 16;

  return (hash >>> 0) / 4294967295;
}

function isInsideWorld(config: WorldConfig, coord: Coord): boolean {
  return (
    coord.x >= 0 &&
    coord.x < config.width &&
    coord.y >= 0 &&
    coord.y < config.height
  );
}

function distance(first: Coord, second: Coord): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Checkpoint M0.10 (reworked in MAP2-R) — Map 2 "Varied Migration Test".
//
// A second, LARGER hand-authored deterministic debug map for migration /
// saturation auditing. Scale: 1 tile ≈ 1.5 km, so the map is a ~330 × 210 km
// temperate east-coast region. Climate story (drives moisture → richness):
// moist air arrives from the eastern ocean and the south-east; the western
// cordillera and the central ridge capture rain on their flanks (humid coast,
// green SE lowlands, foothill belts) while the SW interior sits in the
// combined rain shadow — a semi-arid belt crossed by one seasonal river whose
// downstream end reaches the green lowlands (dry-stay vs dry-escape test).
// The big lake fills a depression at the foot of the west ridge, fed by
// highland creeks and drained by a marsh outlet to the main river (saturation
// battery test). A semi-isolated NE steppe basin sits behind the central
// ridge's single pass (bottleneck + poorer-but-empty target). Sub-tile creeks
// are authored influence corridors (moisture/richness/movement), not river
// tiles. Richness is a causal field (moisture, floodplains, aridity, relief +
// seeded deterministic noise mosaics), not stamped blobs. Map 1 (the regional
// cradle debug map above) is unchanged; nothing here is imported by Map 1
// code paths.
// ---------------------------------------------------------------------------

export const VARIED_MIGRATION_WORLD_CONFIG: WorldConfig = {
  width: 220,
  height: 140,
  seasonsPerYear: SEASONS_PER_YEAR,
  yearsPerGeneration: YEARS_PER_GENERATION,
  ticksPerGeneration: TICKS_PER_GENERATION,
};

export const VARIED_MIGRATION_WORLD_SEED = "varied-migration-test-map" as SimulationSeed;

// MAP2-R: declared map scale. One tile ≈ 1.5 km of terrain, so seasonal band
// movement of a few tiles reads as realistic foraging-range shifts and a
// 100–300y migration of 50–150 tiles reads as a 75–225 km range expansion.
export const VARIED_MIGRATION_KM_PER_TILE = 1.5;

const VARIED_SEED_HASH = hashString(String(VARIED_MIGRATION_WORLD_SEED));

// MAP2-R: bilinearly interpolated deterministic value noise. `smoothNoise`
// floors coordinates to its lattice, which reads as visible square patches on
// Map 2's smooth color ramps; this variant interpolates between the four
// surrounding lattice points so fields vary continuously. Map 2 only.
function variedFieldNoise(x: number, y: number, scale: number, salt: number, seedHash: number = VARIED_SEED_HASH): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  const n00 = hashNoise(seedHash, x0, y0, salt);
  const n10 = hashNoise(seedHash, x0 + 1, y0, salt);
  const n01 = hashNoise(seedHash, x0, y0 + 1, salt);
  const n11 = hashNoise(seedHash, x0 + 1, y0 + 1, salt);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

// MAP2-R polish: deterministic midpoint displacement. Subdividing an authored
// macro path adds banked meanders while PRESERVING every original vertex, so
// named fords/confluences and benchmark audit anchors stay on the channel.
function subdivideMacroPath(
  path: readonly MacroPoint[],
  iterations: number,
  amplitude: number,
  salt: number,
  // Young rivers are straight and steep, mature rivers meander: the wobble
  // amplitude tapers from `amplitude` at the path start (source) to
  // `amplitudeEnd` at the path end (mouth). Defaults to uniform.
  amplitudeEnd: number = amplitude,
  seedHash: number = VARIED_SEED_HASH,
): readonly MacroPoint[] {
  let points: readonly MacroPoint[] = path;
  let decay = 1;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next: MacroPoint[] = [points[0]];

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      const downstreamFraction = (index + 0.5) / (points.length - 1);
      const localAmplitude = lerp(amplitude, amplitudeEnd, downstreamFraction) * decay;
      const offset =
        (hashNoise(seedHash, iteration * 131 + index, salt, 7) - 0.5) * 2 * localAmplitude;

      next.push({
        x: (start.x + end.x) / 2 + (-dy / length) * offset,
        y: (start.y + end.y) / 2 + (dx / length) * offset,
      });
      next.push(end);
    }

    points = next;
    decay *= 0.55;
  }

  return points;
}

// MAP2-R polish: organic lake shorelines. Effective distance to the lake
// centre is the Euclidean distance divided by an angle-dependent radius
// modulation, so the shoreline becomes a smooth lobed blob, not a circle.
function variedLakeDistance(point: MacroPoint, center: MacroPoint, salt: number, seedHash: number = VARIED_SEED_HASH): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const phase1 = hashNoise(seedHash, salt, 1, 13) * Math.PI * 2;
  const phase2 = hashNoise(seedHash, salt, 2, 13) * Math.PI * 2;
  const phase3 = hashNoise(seedHash, salt, 3, 13) * Math.PI * 2;
  const modulation =
    Math.sin(angle * 2 + phase1) * 0.2 +
    Math.sin(angle * 3 + phase2) * 0.13 +
    Math.sin(angle * 5 + phase3) * 0.08;

  return dist / (1 + modulation);
}

// Macro space = tile space (220x140): paths/ellipses below are tile
// coordinates. Base paths are hand-authored control vertices; the rendered
// channels are midpoint-displaced (subdivideMacroPath) so rivers meander
// naturally while still passing through every authored vertex (fords,
// confluences, audit anchors).
const VARIED_MAIN_RIVER_BASE: readonly MacroPoint[] = [
  { x: 48, y: 32 },
  { x: 64, y: 44 },
  { x: 86, y: 52 },
  { x: 108, y: 58 },
  { x: 134, y: 68 },
  { x: 160, y: 80 },
  { x: 184, y: 90 },
  { x: 204, y: 95 },
];
const VARIED_MAIN_RIVER = subdivideMacroPath(VARIED_MAIN_RIVER_BASE, 3, 1.2, 11, 3.6);

// Rivers rise in high ground: the north tributary now sources in the north
// hill belt, the south tributary in the south hill belt (see the hill
// influences in createVariedMigrationTile).
const VARIED_NORTH_TRIBUTARY_BASE: readonly MacroPoint[] = [
  { x: 90, y: 8 },
  { x: 94, y: 22 },
  { x: 98, y: 34 },
  // Mouth ON the main-river confluence vertex so the join never gaps.
  { x: 108, y: 58 },
];
const VARIED_NORTH_TRIBUTARY = subdivideMacroPath(VARIED_NORTH_TRIBUTARY_BASE, 3, 1, 19, 2.4);

const VARIED_SOUTH_TRIBUTARY_BASE: readonly MacroPoint[] = [
  { x: 120, y: 132 },
  { x: 128, y: 118 },
  { x: 136, y: 108 },
  { x: 148, y: 92 },
  // Mouth ON the main-river confluence vertex so the join never gaps.
  { x: 160, y: 80 },
];
const VARIED_SOUTH_TRIBUTARY = subdivideMacroPath(VARIED_SOUTH_TRIBUTARY_BASE, 3, 1, 23, 2.4);

const VARIED_LAKE_OUTLET_BASE: readonly MacroPoint[] = [
  { x: 86, y: 74 },
  { x: 98, y: 68 },
  // Mouth ON the main-river confluence vertex so the join never gaps.
  { x: 108, y: 58 },
];
const VARIED_LAKE_OUTLET = subdivideMacroPath(VARIED_LAKE_OUTLET_BASE, 2, 1.2, 31);

// The "yellow corridor": a seasonal river through the arid belt. Its downstream
// end (x > ~146) leaves the dry zone and enters the green SE lowlands, so a
// dry-margin band always has a REAL greener downstream alternative to find.
const VARIED_DRY_SEASONAL_RIVER_BASE: readonly MacroPoint[] = [
  { x: 50, y: 106 },
  { x: 74, y: 110 },
  { x: 98, y: 114 },
  { x: 122, y: 118 },
  { x: 146, y: 120 },
  { x: 166, y: 122 },
  // Continues through the green lowlands to the SE coast — rivers reach the
  // sea instead of stopping inland (last point past the coastline so the
  // channel terminates exactly at the shore).
  { x: 180, y: 124 },
  { x: 194, y: 127 },
  { x: 206, y: 130 },
];
const VARIED_DRY_SEASONAL_RIVER = subdivideMacroPath(VARIED_DRY_SEASONAL_RIVER_BASE, 3, 1.2, 37, 2.4);

// Small stream from the central ridge pass down to the main river: gives the
// low-density frontier band a water anchor and a natural pass→river corridor.
const VARIED_PASS_STREAM_BASE: readonly MacroPoint[] = [
  { x: 136, y: 44 },
  { x: 126, y: 52 },
  // Runs onto the main channel (no floating end).
  { x: 116, y: 61 },
];
const VARIED_PASS_STREAM = subdivideMacroPath(VARIED_PASS_STREAM_BASE, 2, 1, 41);

// MAP2-R polish: the land behind (west of) the cordillera was inaccessible
// filler. A lee-side river now rises near the north end of the ridge and runs
// south along its foot, exiting the map at the south edge (continuing
// off-map), fed by mountain streams — the west strip becomes a real, if
// modest, habitable corridor.
const VARIED_WEST_RIVER_BASE: readonly MacroPoint[] = [
  { x: 26, y: 22 },
  { x: 21, y: 42 },
  { x: 18, y: 62 },
  { x: 20, y: 84 },
  { x: 24, y: 104 },
  { x: 28, y: 122 },
  { x: 31, y: 139 },
];
const VARIED_WEST_RIVER = subdivideMacroPath(VARIED_WEST_RIVER_BASE, 3, 1.3, 47, 2.8);

// MAP2-R: sub-tile creeks/small streams as influence corridors. At ~1.5 km per
// tile a creek does not fill a tile with water, so creeks never set isRiver —
// they raise moisture/waterAccess/richness in a narrow band, ease movement
// slightly, and set the hasCreek debug/render flag on the line itself. Each
// path flows downhill: ridge flanks → rivers/lake, lowland rises → coast.
// Mouth points deliberately overshoot ONTO the target channel/lake/coast so
// meander wobble can never leave a stream floating short of its confluence
// (hasCreek is only set on non-aquatic tiles, so overshoot is invisible).
const VARIED_CREEK_BASES: readonly (readonly MacroPoint[])[] = [
  // West cordillera east-flank creeks.
  [{ x: 42, y: 18 }, { x: 50, y: 28 }, { x: 58, y: 38 }], // headwater creek → upper main river
  [{ x: 42, y: 52 }, { x: 56, y: 60 }, { x: 73, y: 70 }], // NW lake feeder
  [{ x: 44, y: 90 }, { x: 56, y: 84 }, { x: 73, y: 75 }], // SW lake feeder
  // Plains creeks feeding the main system.
  [{ x: 76, y: 18 }, { x: 86, y: 24 }, { x: 96, y: 32 }], // north plains → north tributary
  [{ x: 102, y: 12 }, { x: 98, y: 20 }, { x: 96, y: 28 }], // steppe-edge creek → north tributary
  [{ x: 96, y: 36 }, { x: 100, y: 46 }, { x: 104, y: 56 }], // central plains creek → main river
  [{ x: 116, y: 86 }, { x: 122, y: 76 }, { x: 134, y: 68 }], // south plains creek → main river (mouth on a preserved channel vertex)
  // Green lowlands / coastal creeks.
  [{ x: 176, y: 102 }, { x: 172, y: 112 }, { x: 166, y: 122 }], // lowland creek → lower dry river (mouth on a preserved channel vertex)
  [{ x: 186, y: 116 }, { x: 192, y: 110 }, { x: 204, y: 103 }], // lowland creek → SE coast
  [{ x: 190, y: 52 }, { x: 196, y: 46 }, { x: 204, y: 41 }], // short coastal stream → north bay
  // Dry-belt and NE-basin seasonal creeks (thin survivable side corridors).
  [{ x: 88, y: 94 }, { x: 92, y: 102 }, { x: 96, y: 113 }], // arid-hills wash → dry seasonal river
  [{ x: 158, y: 20 }, { x: 164, y: 24 }, { x: 170, y: 28 }], // NE basin creek → basin lake
  // MAP2-R polish: mountain streams out of the ridges so no flank is dead.
  [{ x: 36, y: 48 }, { x: 29, y: 50 }, { x: 19, y: 49 }], // west-flank stream → west river
  [{ x: 40, y: 92 }, { x: 32, y: 90 }, { x: 20, y: 84 }], // west-flank stream → west river (mouth on a preserved channel vertex)
  [{ x: 38, y: 122 }, { x: 34, y: 124 }, { x: 28, y: 122 }], // south-west flank stream → west river (mouth on a preserved channel vertex)
  [{ x: 148, y: 40 }, { x: 157, y: 35 }, { x: 168, y: 30 }], // central-ridge east flank → NE basin lake
];
const VARIED_CREEKS: readonly (readonly MacroPoint[])[] = VARIED_CREEK_BASES.map(
  (creek, index) => subdivideMacroPath(creek, 2, 1.1, 101 + index * 7),
);

const VARIED_RICH_LAKE_CENTER: MacroPoint = { x: 78, y: 72 };
const VARIED_RICH_LAKE_RADIUS = 8.5;
const VARIED_NE_BASIN_LAKE_CENTER: MacroPoint = { x: 172, y: 30 };
const VARIED_NE_BASIN_LAKE_RADIUS = 5;

const VARIED_MAIN_UPPER_RIVER_ID = makeRiverId("varied-main-upper");
const VARIED_MAIN_MIDDLE_RIVER_ID = makeRiverId("varied-main-middle");
const VARIED_MAIN_LOWER_RIVER_ID = makeRiverId("varied-main-lower");
const VARIED_ESTUARY_RIVER_ID = makeRiverId("varied-estuary");
const VARIED_NORTH_TRIBUTARY_RIVER_ID = makeRiverId("varied-north-tributary");
const VARIED_SOUTH_TRIBUTARY_RIVER_ID = makeRiverId("varied-south-tributary");
const VARIED_LAKE_OUTLET_RIVER_ID = makeRiverId("varied-lake-outlet");
const VARIED_DRY_SEASONAL_RIVER_ID = makeRiverId("varied-dry-seasonal");
const VARIED_PASS_STREAM_RIVER_ID = makeRiverId("varied-pass-stream");
const VARIED_WEST_RIVER_ID = makeRiverId("varied-west-river");

export function createVariedMigrationWorld(
  config: WorldConfig = VARIED_MIGRATION_WORLD_CONFIG,
): WorldState {
  const tiles: Record<string, Tile> = {};
  const regionTiles = new Map<RegionId, TileId[]>();

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const tile = createVariedMigrationTile(config, { x, y });
      tiles[tile.id] = tile;

      const regionTileIds = regionTiles.get(tile.regionId) ?? [];
      regionTileIds.push(tile.id);
      regionTiles.set(tile.regionId, regionTileIds);
    }
  }

  const regions: Record<string, WorldRegion> = {};
  for (const [regionId, tileIds] of regionTiles.entries()) {
    regions[regionId] = {
      id: regionId,
      name: formatRegionName(regionId),
      tileIds,
    };
  }

  const rivers = createVariedRiverProfiles();
  const riverCrossings = createVariedRiverCrossings(tiles as Readonly<Record<TileId, Tile>>, rivers);

  return {
    config,
    time: INITIAL_TIME,
    seed: VARIED_MIGRATION_WORLD_SEED,
    tiles: tiles as Readonly<Record<TileId, Tile>>,
    climateRegime: {
      kind: "stable",
      seasonalHarshness: 0.34,
      aridity: 0.44,
      volatility: 0.16,
    },
    currentClimateStress: null,
    regions: regions as Readonly<Record<RegionId, WorldRegion>>,
    rivers,
    riverCrossings,
    bands: {},
    decisions: {},
    decisionArchive: createEmptyDecisionArchive(),
  };
}

function getVariedCoastlineX(point: MacroPoint): number {
  const estuaryBite = regionalEllipse(point, { x: 207, y: 93 }, 12, 16);
  const northBay = regionalEllipse(point, { x: 211, y: 38 }, 6, 11);
  // MAP2-R: deterministic low-frequency capes/bays so the shoreline is not a
  // clean sine — depends on y only, so the coast stays a single-valued line.
  const capeNoise = (variedFieldNoise(7, point.y, 6, 89) - 0.5) * 5;

  return 204 + Math.sin(point.y / 9) * 2.1 + capeNoise - estuaryBite * 7 + northBay * 2;
}

function createVariedMigrationTile(config: WorldConfig, coord: Coord): Tile {
  // Macro space == tile space for this map (no scaling). 1 tile ≈ 1.5 km.
  const point: MacroPoint = { x: coord.x, y: coord.y };
  const id = makeTileId(coord);
  const regionId = getRegionId(config, coord);
  const coastlineX = getVariedCoastlineX(point);
  const coastDistance = coastlineX - point.x;
  const deltaInfluence = regionalEllipse(point, { x: 196, y: 92 }, 15, 15);
  // Organic (angle-modulated) lake shorelines instead of circles.
  const richLakeDistance = variedLakeDistance(point, VARIED_RICH_LAKE_CENTER, 5);
  const neLakeDistance = variedLakeDistance(point, VARIED_NE_BASIN_LAKE_CENTER, 9);
  const mainRiverDistance = getRegionalPathDistance(point, VARIED_MAIN_RIVER);
  const northTributaryDistance = getRegionalPathDistance(point, VARIED_NORTH_TRIBUTARY);
  const southTributaryDistance = getRegionalPathDistance(point, VARIED_SOUTH_TRIBUTARY);
  const lakeOutletDistance = getRegionalPathDistance(point, VARIED_LAKE_OUTLET);
  const drySeasonalDistance = getRegionalPathDistance(point, VARIED_DRY_SEASONAL_RIVER);
  const passStreamDistance = getRegionalPathDistance(point, VARIED_PASS_STREAM);
  const westRiverDistance = getRegionalPathDistance(point, VARIED_WEST_RIVER);
  const tributaryDistance = Math.min(northTributaryDistance, southTributaryDistance);
  // 1 tile ≈ 1.5 km: the main river's mapped corridor widens downstream —
  // ~1 tile near the headwaters to ~3 tiles at the delta mouth.
  const mainRiverProgress = clamp01((point.x - 48) / 156);
  const mainRiverChannelWidth = 0.62 + mainRiverProgress * 0.95 + deltaInfluence * 0.45;
  let creekDistance = Number.POSITIVE_INFINITY;
  for (const creek of VARIED_CREEKS) {
    creekDistance = Math.min(creekDistance, getRegionalPathDistance(point, creek));
  }
  // Sub-tile creeks moisten a narrow band (~3 km wide at 1.5 km/tile).
  const creekMargin = clamp01(1 - creekDistance / 2.2);
  // The dry seasonal river supports a NARROW survivable margin (water + thin
  // richness) — "staying is realistic" close to the channel, harsh away from it.
  const drySeasonalMargin = clamp01(1 - drySeasonalDistance / 3.4);

  // MAP2-R deterministic field noise (seeded; no unseeded random call): relief breaks up
  // ridge edges, climate softens zone boundaries, fertility creates mosaics.
  const reliefNoise = variedFieldNoise(point.x, point.y, 5, 17) - 0.5;
  const climateNoise = variedFieldNoise(point.x, point.y, 9, 29) - 0.5;
  const fertilityNoise =
    (variedFieldNoise(point.x, point.y, 13, 43) - 0.5) * 0.26 +
    (variedFieldNoise(point.x, point.y, 5, 71) - 0.5) * 0.12 +
    (hashNoise(VARIED_SEED_HASH, point.x, point.y, 3) - 0.5) * 0.02;

  // Western cordillera with two passes; central ridge sealing the NE basin
  // with a single pass (bottlenecks / narrow corridors).
  const westRidgeDistance = distanceToSegment(point, { x: 34, y: 4 }, { x: 50, y: 134 });
  const centralRidgeDistance = distanceToSegment(point, { x: 116, y: 8 }, { x: 152, y: 56 });
  const northPassInfluence = regionalEllipse(point, { x: 42, y: 38 }, 8, 9);
  const southPassInfluence = regionalEllipse(point, { x: 48, y: 100 }, 8, 9);
  const centralPassInfluence = regionalEllipse(point, { x: 136, y: 42 }, 7, 7);
  const passInfluence = Math.max(northPassInfluence, southPassInfluence, centralPassInfluence);
  // Low hill belts where the tributaries rise (rivers start in high ground):
  // north uplands feed the north tributary, south uplands the south tributary.
  const northHillsInfluence = regionalEllipse(point, { x: 90, y: 6 }, 26, 11) * 0.46;
  const southHillsInfluence = regionalEllipse(point, { x: 120, y: 134 }, 24, 11) * 0.44;
  const mountainInfluence = clamp01(
    Math.max(
      clamp01(1 - westRidgeDistance / 12),
      clamp01(1 - centralRidgeDistance / 10) * 0.92,
      northHillsInfluence,
      southHillsInfluence,
    ) +
      reliefNoise * 0.2 -
      passInfluence * 0.66,
  );
  const corridorInfluence = clamp01(
    passInfluence * 0.9 +
      clamp01(1 - mainRiverDistance / 4) * 0.32 +
      clamp01(1 - drySeasonalDistance / 3.5) * 0.26 +
      clamp01(1 - tributaryDistance / 3.5) * 0.2 +
      creekMargin * 0.14,
  );

  // Rain-shadow interior: arid belt around the dry seasonal river plus the
  // drier NE basin / northern steppe behind the central ridge. Noisy edges so
  // the desert boundary is a transition band, not a stamped ellipse.
  const greenLowlandInfluence = clamp01(
    Math.max(
      regionalEllipse(point, { x: 172, y: 112 }, 32, 22),
      regionalEllipse(point, { x: 150, y: 124 }, 22, 12) * 0.85,
    ) +
      climateNoise * 0.12,
  );
  const aridCore = clamp01(
    Math.max(
      regionalEllipse(point, { x: 92, y: 108 }, 50, 24),
      regionalEllipse(point, { x: 186, y: 54 }, 26, 16) * 0.6,
      regionalEllipse(point, { x: 174, y: 30 }, 22, 15) * 0.5,
      regionalEllipse(point, { x: 140, y: 12 }, 42, 11) * 0.55,
    ) +
      climateNoise * 0.3,
  );
  const dryInteriorInfluence = clamp01(
    aridCore -
      deltaInfluence * 0.34 -
      greenLowlandInfluence * 0.66 -
      clamp01(1 - mainRiverDistance / 10) * 0.3 -
      clamp01(1 - drySeasonalDistance / 5) * 0.22 -
      clamp01(1 - richLakeDistance / 16) * 0.42 -
      clamp01(1 - neLakeDistance / 8) * 0.3 -
      creekMargin * 0.18,
  );

  const isOcean = point.x >= coastlineX;
  const isLake =
    !isOcean &&
    (richLakeDistance <= VARIED_RICH_LAKE_RADIUS || neLakeDistance <= VARIED_NE_BASIN_LAKE_RADIUS);
  const isRiver =
    !isOcean &&
    !isLake &&
    (mainRiverDistance <= mainRiverChannelWidth ||
      tributaryDistance <= 0.66 ||
      lakeOutletDistance <= 0.7 ||
      drySeasonalDistance <= 0.6 ||
      passStreamDistance <= 0.5 ||
      westRiverDistance <= 0.72);
  const isDeltaWetland = !isOcean && !isLake && deltaInfluence > 0.3;
  // Narrow, noisy-edged marsh fringe around the lakes (a fed basin gradient,
  // not the old wide rich ring).
  const isLakeWetland =
    !isOcean &&
    !isLake &&
    ((richLakeDistance > VARIED_RICH_LAKE_RADIUS && richLakeDistance <= 12 + reliefNoise * 4) ||
      (neLakeDistance > VARIED_NE_BASIN_LAKE_RADIUS && neLakeDistance <= 7.5 + reliefNoise * 2));
  const isCoastal = !isOcean && !isLake && !isRiver && coastDistance <= 4.4;
  const isAquatic = isOcean || isLake || isRiver;
  const hasCreek = !isAquatic && creekDistance <= 0.75;
  const lakeWetlandInfluence = Math.max(
    clamp01(1 - Math.abs(richLakeDistance - 9.5) / 5),
    clamp01(1 - Math.abs(neLakeDistance - 6) / 3.5) * 0.6,
  );

  const riverInfluence = Math.max(
    // Floodplains belong beside mature rivers: the main valley is a narrow
    // young-river corridor upstream and a broad fertile floodplain downstream.
    clamp01(1 - mainRiverDistance / (4 + mainRiverProgress * 5)),
    clamp01(1 - tributaryDistance / 4.5) * 0.7,
    clamp01(1 - lakeOutletDistance / 4.5) * 0.72,
    clamp01(1 - passStreamDistance / 3.5) * 0.5,
    // The lee-side west river supports a modest valley corridor.
    clamp01(1 - westRiverDistance / 4.5) * 0.6,
    // The dry seasonal river supports only a NARROW margin (it is the dry
    // corridor, not a floodplain) until it reaches the green lowlands.
    drySeasonalMargin * (0.38 + greenLowlandInfluence * 0.5),
  );
  const floodplainInfluence = clamp01(
    riverInfluence * 0.9 + deltaInfluence * 0.52 - mountainInfluence * 0.3 - dryInteriorInfluence * 0.22,
  );
  const wetlandInfluence = Math.max(
    isDeltaWetland ? deltaInfluence : 0,
    isLakeWetland ? lakeWetlandInfluence : 0,
  );
  const coastalWetness = isCoastal ? clamp01(1 - coastDistance / 5) : 0;

  // MAP2-R causal moisture field: oceanic humidity from the east, orographic
  // rain on ridge flanks, proximity to surface water, minus the rain shadow.
  // Richness and water access derive from this field instead of stamped blobs.
  const coastalHumidity = clamp01(0.38 + clamp01(1 - Math.max(coastDistance, 0) / 170) * 0.38);
  const foothillRain =
    clamp01(1 - Math.abs(westRidgeDistance - 11) / 9) * 0.16 +
    clamp01(1 - Math.abs(centralRidgeDistance - 9) / 8) * 0.1;
  const surfaceWaterMoisture = Math.max(
    clamp01(1 - mainRiverDistance / 7) * 0.4,
    clamp01(1 - tributaryDistance / 4.5) * 0.3,
    clamp01(1 - lakeOutletDistance / 4.5) * 0.32,
    clamp01(1 - passStreamDistance / 3.5) * 0.24,
    drySeasonalMargin * 0.3,
    creekMargin * 0.3,
    clamp01(1 - westRiverDistance / 4.5) * 0.28,
    clamp01(1 - richLakeDistance / 17) * 0.36,
    clamp01(1 - neLakeDistance / 9) * 0.22,
  );
  const moisture = clamp01(
    coastalHumidity * 0.62 +
      greenLowlandInfluence * 0.3 +
      foothillRain +
      surfaceWaterMoisture +
      deltaInfluence * 0.24 +
      climateNoise * 0.12 -
      dryInteriorInfluence * 0.5 -
      mountainInfluence * 0.2,
  );

  // The seasonal channel is the WATER SOURCE inside the arid belt: a narrow
  // margin floor survives the dry-interior penalty (staying near the channel is
  // realistic; two tiles away it is not). Creeks form similar thin floors.
  const waterAccess = clamp01(
    Math.max(
      (isAquatic ? 0.96 : 0) +
        riverInfluence * 0.62 +
        wetlandInfluence * 0.52 +
        coastalWetness * 0.52 +
        moisture * 0.32 -
        dryInteriorInfluence * 0.3,
      drySeasonalMargin * 0.46,
      creekMargin * 0.44,
    ),
  );
  const droughtRisk = clamp01(
    0.14 + dryInteriorInfluence * 0.6 + (1 - moisture) * 0.2 - waterAccess * 0.32,
  );
  const floodRisk = clamp01(
    (isRiver ? 0.62 : 0) +
      floodplainInfluence * 0.36 +
      deltaInfluence * 0.28 +
      wetlandInfluence * 0.22 -
      mountainInfluence * 0.18 -
      dryInteriorInfluence * 0.12,
  );
  const diseaseRisk = clamp01(
    waterAccess * 0.22 +
      wetlandInfluence * 0.34 +
      deltaInfluence * 0.24 +
      (isOcean ? 0.04 : 0) -
      dryInteriorInfluence * 0.12,
  );
  const elevation = getRegionalElevation({
    isOcean,
    isLake,
    mountainInfluence,
    corridorInfluence,
    dryInteriorInfluence,
    floodplainInfluence,
  });
  // Richness follows the moisture field + floodplain/wetland fertility, with a
  // seeded mosaic so plains vary instead of being uniformly poor; thin floors
  // keep the dry-river margin and creek lines survivable.
  const baseRichness = clamp01(
    Math.max(
      0.14 +
        moisture * 0.74 +
        floodplainInfluence * 0.18 +
        wetlandInfluence * 0.14 +
        deltaInfluence * 0.06 -
        mountainInfluence * 0.26 -
        dryInteriorInfluence * 0.34 +
        fertilityNoise,
      // Thin-but-real richness floor on the channel margin (dry-margin niche).
      drySeasonalMargin * 0.2,
      creekMargin * clamp01(0.32 - dryInteriorInfluence * 0.14),
    ),
  );
  // The NE basin lake is ENDORHEIC (inflow creeks, no outlet — by design):
  // a brackish seasonal lake, so its open water yields less than the fresh
  // outlet-drained rich lake.
  const isEndorheicLake = isLake && neLakeDistance <= VARIED_NE_BASIN_LAKE_RADIUS;
  const aquaticPotential = clamp01(
    (isOcean ? 0.72 : 0) +
      (isLake ? (isEndorheicLake ? 0.48 : 0.82) : 0) +
      (isRiver ? 0.42 : 0) +
      coastalWetness * 0.4 +
      wetlandInfluence * 0.42 +
      deltaInfluence * 0.32,
  );
  const wildGrainPotential = clamp01(
    0.12 +
      floodplainInfluence * 0.46 +
      lakeWetlandInfluence * 0.18 +
      moisture * 0.2 +
      baseRichness * 0.18 -
      mountainInfluence * 0.12 -
      dryInteriorInfluence * 0.14 +
      fertilityNoise * 0.5,
  );
  const plantTendingPotential = clamp01(
    0.08 +
      floodplainInfluence * 0.48 +
      deltaInfluence * 0.2 +
      waterAccess * 0.22 +
      moisture * 0.14 +
      baseRichness * 0.2 -
      mountainInfluence * 0.16 -
      dryInteriorInfluence * 0.12,
  );
  const seasonalVariance = clamp01(
    0.2 +
      lakeWetlandInfluence * 0.32 +
      dryInteriorInfluence * 0.26 +
      mountainInfluence * 0.12 +
      creekMargin * 0.08 +
      // Endorheic basin: strongly seasonal shoreline (salt-marsh flats).
      clamp01(1 - neLakeDistance / 9) * 0.12 -
      deltaInfluence * 0.08 -
      greenLowlandInfluence * 0.08 -
      floodplainInfluence * 0.06,
  );
  const storageSuitability = clamp01(
    0.34 +
      dryInteriorInfluence * 0.22 +
      corridorInfluence * 0.12 +
      elevation * 0.16 -
      floodRisk * 0.2 -
      diseaseRisk * 0.1,
  );
  const terrainKind = getRegionalTerrainKind({
    isOcean,
    isLake,
    isRiver,
    isCoastal,
    isDeltaWetland,
    isLakeWetland,
    mountainInfluence,
    corridorInfluence,
    floodplainInfluence,
    dryInteriorInfluence,
    baseRichness,
  });
  const biomeKind = getRegionalBiomeKind({
    terrainKind,
    isCoastal,
    isDeltaWetland,
    isLakeWetland,
    corridorInfluence,
  });
  const movementCost = getRegionalMovementCost({
    terrainKind,
    isAquatic,
    mountainInfluence,
    corridorInfluence,
    floodRisk,
    droughtRisk,
  });
  const hydrography = getVariedTileHydrography({
    point,
    isOcean,
    isLake,
    isRiver,
    mainRiverDistance,
    mainRiverChannelWidth,
    northTributaryDistance,
    southTributaryDistance,
    lakeOutletDistance,
    drySeasonalDistance,
    passStreamDistance,
    westRiverDistance,
    deltaInfluence,
    floodplainInfluence,
    coastDistance,
  });
  const resourceProfile: TileResourceProfile = {
    baseRichness,
    waterAccess,
    aquaticPotential,
    wildGrainPotential,
    plantTendingPotential,
    storageSuitability,
    resourceRegenerationRate: clamp01(0.18 + baseRichness * 0.54 + waterAccess * 0.18),
  };

  return {
    id,
    coord,
    regionId,
    terrainKind,
    biomeKind,
    resourceProfile,
    seasonalProfile: {
      seasonalVariance,
      peakSeasons: getRegionalPeakSeasons(waterAccess, seasonalVariance, isLakeWetland),
      leanSeasons: droughtRisk > 0.52 ? ["summer", "winter"] : ["winter"],
      reliability: clamp01(
        0.48 + waterAccess * 0.32 + floodplainInfluence * 0.18 - seasonalVariance * 0.24,
      ),
      expectedWinterStress: clamp01(0.2 + droughtRisk * 0.26 + seasonalVariance * 0.22),
    },
    riskProfile: {
      floodRisk,
      droughtRisk,
      diseaseRisk,
      depletionRisk: clamp01(baseRichness * 0.22 + (1 - waterAccess) * 0.24),
      climateVolatility: clamp01(0.12 + droughtRisk * 0.2 + seasonalVariance * 0.18),
    },
    carryingCapacity: getCarryingCapacity(resourceProfile, movementCost),
    movementCost,
    elevation,
    isRiver,
    isCoastal,
    isAquatic,
    riverSegmentId: hydrography.riverSegmentId,
    isFloodplain: hydrography.isFloodplain,
    isRiverbank: hydrography.isRiverbank,
    isConfluence: hydrography.isConfluence,
    isEstuary: hydrography.isEstuary,
    isMarshChannel: hydrography.isMarshChannel,
    hasCreek: hasCreek ? true : undefined,
    neighbors: getNeighborIds(config, coord),
  };
}

function getVariedTileHydrography(input: {
  readonly point: MacroPoint;
  readonly isOcean: boolean;
  readonly isLake: boolean;
  readonly isRiver: boolean;
  readonly mainRiverDistance: number;
  readonly mainRiverChannelWidth: number;
  readonly northTributaryDistance: number;
  readonly southTributaryDistance: number;
  readonly lakeOutletDistance: number;
  readonly drySeasonalDistance: number;
  readonly passStreamDistance: number;
  readonly westRiverDistance: number;
  readonly deltaInfluence: number;
  readonly floodplainInfluence: number;
  readonly coastDistance: number;
}): RegionalTileHydrography {
  const isMainRiver = input.isRiver && input.mainRiverDistance <= input.mainRiverChannelWidth;
  const isNorthTributary = input.isRiver && !isMainRiver && input.northTributaryDistance <= 0.66;
  const isSouthTributary = input.isRiver && !isMainRiver && input.southTributaryDistance <= 0.66;
  const isLakeOutlet = input.isRiver && !isMainRiver && input.lakeOutletDistance <= 0.7;
  const isDrySeasonal =
    input.isRiver && !isMainRiver && !isNorthTributary && !isSouthTributary && !isLakeOutlet &&
    input.drySeasonalDistance <= 0.6;
  const isPassStream =
    input.isRiver && !isMainRiver && !isNorthTributary && !isSouthTributary && !isLakeOutlet &&
    !isDrySeasonal && input.passStreamDistance <= 0.5;
  const isWestRiver =
    input.isRiver && !isMainRiver && !isNorthTributary && !isSouthTributary && !isLakeOutlet &&
    !isDrySeasonal && !isPassStream && input.westRiverDistance <= 0.72;
  let riverSegmentId: RiverId | undefined;

  if (isMainRiver) {
    if (input.deltaInfluence > 0.42) {
      riverSegmentId = VARIED_ESTUARY_RIVER_ID;
    } else if (input.point.x < 86) {
      riverSegmentId = VARIED_MAIN_UPPER_RIVER_ID;
    } else if (input.point.x < 160) {
      riverSegmentId = VARIED_MAIN_MIDDLE_RIVER_ID;
    } else {
      riverSegmentId = VARIED_MAIN_LOWER_RIVER_ID;
    }
  } else if (isNorthTributary) {
    riverSegmentId = VARIED_NORTH_TRIBUTARY_RIVER_ID;
  } else if (isSouthTributary) {
    riverSegmentId = VARIED_SOUTH_TRIBUTARY_RIVER_ID;
  } else if (isLakeOutlet) {
    riverSegmentId = VARIED_LAKE_OUTLET_RIVER_ID;
  } else if (isDrySeasonal) {
    riverSegmentId = VARIED_DRY_SEASONAL_RIVER_ID;
  } else if (isPassStream) {
    riverSegmentId = VARIED_PASS_STREAM_RIVER_ID;
  } else if (isWestRiver) {
    riverSegmentId = VARIED_WEST_RIVER_ID;
  }

  const isConfluence =
    regionalEllipse(input.point, { x: 108, y: 58 }, 6, 5) > 0.42 ||
    regionalEllipse(input.point, { x: 160, y: 80 }, 6, 5) > 0.42;
  const isEstuary = !input.isOcean && input.deltaInfluence > 0.44 && input.coastDistance <= 6.4;

  return {
    riverSegmentId,
    isFloodplain: !input.isOcean && !input.isLake && input.floodplainInfluence > 0.36,
    isRiverbank: !input.isRiver && !input.isOcean && input.floodplainInfluence > 0.62,
    isConfluence,
    isEstuary,
    isMarshChannel:
      (isLakeOutlet || (input.deltaInfluence > 0.34 && input.mainRiverDistance < 3.4)) && !input.isOcean,
  };
}

function createVariedRiverProfiles(): Readonly<Record<RiverId, RiverSegmentProfile>> {
  const profiles: readonly RiverSegmentProfile[] = [
    {
      // MAP2-R: braided gravel reaches below the headwaters — at ~1.5 km/tile
      // the upper course is a wandering multi-thread channel that nomads can
      // ford along most of its length in normal flow.
      riverId: VARIED_MAIN_UPPER_RIVER_ID,
      kind: "shallow_braided",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "moderate",
      bankSteepness: 0.24,
      seasonalFlowVariance: 0.54,
      floodSeason: "spring",
      fordability: 0.74,
      navigability: 0.08,
      aquaticReliabilityModifier: 0.1,
      floodplainFertilityModifier: 0.16,
      crossingRisk: 0.24,
    },
    {
      riverId: VARIED_MAIN_MIDDLE_RIVER_ID,
      kind: "meandering_channel",
      widthClass: "medium",
      depthClass: "mixed",
      flowStrength: "moderate",
      bankSteepness: 0.36,
      seasonalFlowVariance: 0.42,
      floodSeason: "spring",
      fordability: 0.42,
      navigability: 0.2,
      aquaticReliabilityModifier: 0.14,
      floodplainFertilityModifier: 0.22,
      crossingRisk: 0.44,
    },
    {
      riverId: VARIED_MAIN_LOWER_RIVER_ID,
      kind: "deep_channel",
      widthClass: "wide",
      depthClass: "deep",
      flowStrength: "strong",
      bankSteepness: 0.5,
      seasonalFlowVariance: 0.32,
      floodSeason: "spring",
      fordability: 0.14,
      navigability: 0.44,
      aquaticReliabilityModifier: 0.18,
      floodplainFertilityModifier: 0.18,
      crossingRisk: 0.7,
    },
    {
      riverId: VARIED_ESTUARY_RIVER_ID,
      kind: "estuary",
      widthClass: "very_wide",
      depthClass: "deep",
      flowStrength: "moderate",
      bankSteepness: 0.2,
      seasonalFlowVariance: 0.28,
      floodSeason: "spring",
      fordability: 0.08,
      navigability: 0.56,
      aquaticReliabilityModifier: 0.34,
      floodplainFertilityModifier: 0.14,
      crossingRisk: 0.72,
    },
    {
      riverId: VARIED_NORTH_TRIBUTARY_RIVER_ID,
      kind: "seasonal_stream",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "moderate",
      bankSteepness: 0.34,
      seasonalFlowVariance: 0.66,
      floodSeason: "spring",
      fordability: 0.72,
      navigability: 0.06,
      aquaticReliabilityModifier: 0.08,
      floodplainFertilityModifier: 0.12,
      crossingRisk: 0.26,
    },
    {
      riverId: VARIED_SOUTH_TRIBUTARY_RIVER_ID,
      kind: "seasonal_stream",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "moderate",
      bankSteepness: 0.3,
      seasonalFlowVariance: 0.6,
      floodSeason: "spring",
      fordability: 0.74,
      navigability: 0.06,
      aquaticReliabilityModifier: 0.08,
      floodplainFertilityModifier: 0.12,
      crossingRisk: 0.24,
    },
    {
      riverId: VARIED_LAKE_OUTLET_RIVER_ID,
      kind: "marsh_channel",
      widthClass: "medium",
      depthClass: "shallow",
      flowStrength: "weak",
      bankSteepness: 0.16,
      seasonalFlowVariance: 0.58,
      floodSeason: "spring",
      fordability: 0.56,
      navigability: 0.22,
      aquaticReliabilityModifier: 0.22,
      floodplainFertilityModifier: 0.18,
      crossingRisk: 0.34,
    },
    {
      riverId: VARIED_DRY_SEASONAL_RIVER_ID,
      kind: "seasonal_stream",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "weak",
      bankSteepness: 0.22,
      seasonalFlowVariance: 0.86,
      floodSeason: "spring",
      fordability: 0.82,
      navigability: 0.02,
      aquaticReliabilityModifier: 0.04,
      floodplainFertilityModifier: 0.06,
      crossingRisk: 0.16,
    },
    {
      riverId: VARIED_PASS_STREAM_RIVER_ID,
      kind: "seasonal_stream",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "weak",
      bankSteepness: 0.28,
      seasonalFlowVariance: 0.7,
      floodSeason: "spring",
      fordability: 0.8,
      navigability: 0.02,
      aquaticReliabilityModifier: 0.06,
      floodplainFertilityModifier: 0.08,
      crossingRisk: 0.18,
    },
    {
      // MAP2-R polish: modest lee-side river along the cordillera's west foot.
      riverId: VARIED_WEST_RIVER_ID,
      kind: "meandering_channel",
      widthClass: "narrow",
      depthClass: "shallow",
      flowStrength: "moderate",
      bankSteepness: 0.3,
      seasonalFlowVariance: 0.52,
      floodSeason: "spring",
      fordability: 0.64,
      navigability: 0.08,
      aquaticReliabilityModifier: 0.1,
      floodplainFertilityModifier: 0.14,
      crossingRisk: 0.28,
    },
  ];
  const byId: Record<string, RiverSegmentProfile> = {};

  for (const profile of profiles) {
    byId[profile.riverId] = profile;
  }

  return byId as Readonly<Record<RiverId, RiverSegmentProfile>>;
}

// MAP2-R map-scale crossing v0 (1 tile ≈ 1.5 km): the upper course is braided
// and fordable along the reach (handled by segment kind), the middle course is
// crossable only at named points — a gravel-narrows ford, a confluence-shelf
// seasonal ford, and a low-water seasonal ford — the lower deep channel has a
// single dangerous narrows, the estuary needs watercraft, and the dry seasonal
// river is a margin, not a barrier. Plausible nomad crossings, no boats/bridges.
function getExplicitVariedCrossingQuality(
  point: MacroPoint,
): { readonly crossingClass: RiverCrossingClass; readonly cost: number; readonly risk: number } | undefined {
  if (distance(point, { x: 86, y: 52 }) <= 3.4) {
    return { crossingClass: "ford", cost: 0.44, risk: 0.18 };
  }

  if (distance(point, { x: 108, y: 58 }) <= 3) {
    return { crossingClass: "seasonal_ford", cost: 0.7, risk: 0.3 };
  }

  if (distance(point, { x: 134, y: 68 }) <= 3.4) {
    return { crossingClass: "seasonal_ford", cost: 0.74, risk: 0.34 };
  }

  if (distance(point, { x: 184, y: 90 }) <= 3.4) {
    return { crossingClass: "dangerous_crossing", cost: 1.4, risk: 0.72 };
  }

  if (getRegionalPathDistance(point, VARIED_DRY_SEASONAL_RIVER) <= 1.6) {
    return { crossingClass: "seasonal_ford", cost: 0.6, risk: 0.2 };
  }

  return undefined;
}

function createVariedRiverCrossings(
  tiles: Readonly<Record<TileId, Tile>>,
  rivers: Readonly<Record<RiverId, RiverSegmentProfile>>,
): Readonly<Record<string, RiverCrossingProfile>> {
  const crossings: Record<string, RiverCrossingProfile> = {};

  for (const tile of Object.values(tiles)) {
    for (const neighborId of tile.neighbors) {
      const neighbor = tiles[neighborId];

      if (neighbor === undefined || String(tile.id) > String(neighbor.id)) {
        continue;
      }

      const riverTile = tile.riverSegmentId !== undefined ? tile : neighbor.riverSegmentId !== undefined ? neighbor : undefined;
      const bankTile = riverTile?.id === tile.id ? neighbor : tile;

      if (riverTile === undefined || riverTile.riverSegmentId === undefined || bankTile.riverSegmentId !== undefined) {
        continue;
      }

      const river = rivers[riverTile.riverSegmentId];

      if (river === undefined) {
        continue;
      }

      const explicitQuality = getExplicitVariedCrossingQuality({ x: riverTile.coord.x, y: riverTile.coord.y });
      const crossingClass = explicitQuality?.crossingClass ?? getVariedCrossingClass(bankTile, river);
      const knownFord = crossingClass === "ford" || crossingClass === "seasonal_ford";
      const risk = clamp01(
        explicitQuality?.risk ??
          river.crossingRisk + river.bankSteepness * 0.16 + (riverTile.isMarshChannel ? 0.08 : 0),
      );

      crossings[makeRiverCrossingKey(tile.id, neighbor.id)] = {
        fromTileId: tile.id,
        toTileId: neighbor.id,
        riverId: river.riverId,
        crossingClass,
        baseCrossingCost: round2(getCrossingBaseCost(crossingClass, river, explicitQuality?.cost)),
        seasonalCostModifier: round2(river.seasonalFlowVariance),
        risk: round2(risk),
        knownFord,
        confidence: knownFord ? 0.76 : 0.54,
      };
    }
  }

  return crossings;
}

function getVariedCrossingClass(bankTile: Tile, river: RiverSegmentProfile): RiverCrossingClass {
  if (river.kind === "estuary") {
    return "impassable_without_watercraft";
  }

  if (river.kind === "deep_channel") {
    return "dangerous_crossing";
  }

  // Braided gravel reaches: fordable along the reach in normal flow.
  if (river.kind === "shallow_braided") {
    return "ford";
  }

  if (river.kind === "marsh_channel") {
    return bankTile.terrainKind === "wetlands" ? "shallow_crossing" : "seasonal_ford";
  }

  if (river.kind === "seasonal_stream") {
    return "seasonal_ford";
  }

  return river.fordability > 0.48 ? "seasonal_ford" : "dangerous_crossing";
}
