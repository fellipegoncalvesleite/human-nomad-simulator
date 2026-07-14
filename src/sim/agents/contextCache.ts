import type {
  BandId,
  RouteId,
  Season,
  TickNumber,
  TileId,
} from "../core/types";
import type { WorldState } from "../world/types";
import { getTile, getTileAtCoord } from "../world/generate";
import { isBandPassableDestination } from "../world/passability";
import type {
  Band,
  DryMarginMobilityContext,
  NearbyBandPressure,
  NearbyOpportunityGradient,
  PlaceMemoryRecord,
  RangeSaturationState,
} from "./types";
import type { CrowdingField } from "./crowding";
import type { SharedCatchmentIndex } from "./sharedCatchment";
import type { ResidentialAnchorContext } from "./residentialAnchor";
import type { SeasonalRoundScoringContext } from "./seasonalRound";
import { isLivingBand } from "./bandLifecycle";

const SPATIAL_BUCKET_SIZE = 5;
const DEFAULT_NEARBY_RADIUS = 4;
const MAX_SALIENT_PLACES = 16;
const MAX_SALIENT_CORRIDORS = 12;
const MAX_FRONTIER_CANDIDATES = 16;
const MAX_OPPORTUNITY_CANDIDATES = 16;

export interface BandSpatialIndex {
  readonly bucketSize: number;
  readonly activeBandIds: readonly BandId[];
  readonly tileBandOccupancy: ReadonlyMap<TileId, readonly BandId[]>;
  readonly bandIdsByBucket: ReadonlyMap<string, readonly BandId[]>;
  // PERF-3: getNearbyActiveBandIdsForTile is a pure function of (tileId, radius)
  // for a given index/world, but is called ~9× per band per tick (nearbyBands
  // build + local population estimate + local band count, across 3 context
  // passes). Memoize the result per `${tileId}:${radius}` so repeated queries
  // for the same tile (clustered bands, multiple metrics, multiple passes)
  // reuse it. Byte-identical: the cached array is the same sorted list, and
  // all callers read it (filter/reduce produce new arrays, never mutate it).
  readonly nearbyByTileRadius: Map<string, readonly BandId[]>;
}

export interface SalientBandMemorySummary {
  readonly bandId: BandId;
  readonly topReturnPlaceIds: readonly TileId[];
  readonly topAnchorPlaceIds: readonly TileId[];
  readonly topRiskyPlaceIds: readonly TileId[];
  readonly topDepletedPlaceIds: readonly TileId[];
  readonly topCorridorIds: readonly RouteId[];
  readonly knownFrontierTileIds: readonly TileId[];
  readonly knownOpportunityCandidateIds: readonly TileId[];
  readonly salientInheritedMemoryIds: readonly TileId[];
}

export interface TickContextCache {
  readonly tick: TickNumber;
  readonly season: Season;
  readonly bandSpatialIndex: BandSpatialIndex;
  readonly activeBandIds: readonly BandId[];
  readonly nonDispersedBandCount: number;
  readonly tileBandOccupancy: ReadonlyMap<TileId, readonly BandId[]>;
  readonly nearbyBandsByBandId: ReadonlyMap<BandId, readonly BandId[]>;
  readonly nearbyBandPressureByBandTileKey: Map<string, NearbyBandPressure>;
  readonly salientMemoryByBandId: ReadonlyMap<BandId, SalientBandMemorySummary>;
  readonly salientMemoryBandIdsByTileId: ReadonlyMap<TileId, readonly BandId[]>;
  readonly knownOpportunityByBandId: Map<BandId, NearbyOpportunityGradient>;
  readonly rangeSaturationByBandId: Map<BandId, RangeSaturationState>;
  // Pre-decision dry-margin + anchor contexts, computed once per band while
  // scoring (2I.3, PART 1). Reused as the post-decision state when the residence
  // does not move, so the anchor/catchment is derived once per held band per tick
  // instead of twice. `has(bandId)` distinguishes "computed, none" from "absent".
  readonly preDecisionDryContextByBandId: Map<BandId, DryMarginMobilityContext | undefined>;
  readonly preDecisionAnchorByBandId: Map<BandId, ResidentialAnchorContext | undefined>;
  readonly preDecisionSeasonalRoundByBandId: Map<BandId, SeasonalRoundScoringContext | undefined>;
  // Shared catchment claims index (2J.1), built at most once per cache via
  // getSharedCatchmentIndex. Mutable holder so the deterministic, bounded index
  // is memoized rather than rebuilt per band.
  readonly sharedCatchmentMemo: { value?: SharedCatchmentIndex };
  // Per-band salient place-memory sort (2J.1A perf). Keyed by the immutable band
  // SNAPSHOT (object identity), not band.id: applyBandDecision yields a new band
  // object whenever a band's memory changes, so a mutated band is a fresh key
  // (recomputed) and an unchanged snapshot read many times reuses one sort.
  readonly salientPlaceMemoByBand: WeakMap<Band, readonly PlaceMemoryRecord[]>;
  // Deterministic per-tick crowding field (2J.2B): each band scatters its
  // proximity + remembered-area influence into nearby tiles ONCE per cache from
  // the fixed band snapshot, so getNearbyBandPressure reads per-tile crowding in
  // O(local kin) instead of iterating nearby bands per (band, candidate tile).
  // Mutable holder so the field is built at most once per cache.
  readonly crowdingFieldMemo: { value?: CrowdingField };
}

export function buildTickContextCache(world: WorldState): TickContextCache {
  const allBands = Object.values(world.bands);
  const activeBandIds = allBands
    .filter(isActiveBand)
    .map((band) => band.id)
    .sort(compareBandIds);
  const nonDispersedBandCount = allBands.filter(isLivingBand).length;
  const bandSpatialIndex = buildBandSpatialIndex(world, activeBandIds);
  const salientMemoryByBandId = new Map<BandId, SalientBandMemorySummary>();
  const nearbyBandsByBandId = new Map<BandId, readonly BandId[]>();

  for (const bandId of activeBandIds) {
    const band = world.bands[bandId];

    if (band === undefined) {
      continue;
    }

    salientMemoryByBandId.set(band.id, buildSalientBandMemorySummary(world, band));
    nearbyBandsByBandId.set(
      band.id,
      getNearbyActiveBandIdsForTile(world, bandSpatialIndex, band.position, DEFAULT_NEARBY_RADIUS)
        .filter((nearbyBandId) => nearbyBandId !== band.id),
    );
  }

  return {
    tick: world.time.tick,
    season: world.time.season,
    bandSpatialIndex,
    activeBandIds,
    nonDispersedBandCount,
    tileBandOccupancy: bandSpatialIndex.tileBandOccupancy,
    nearbyBandsByBandId,
    nearbyBandPressureByBandTileKey: new Map(),
    salientMemoryByBandId,
    salientMemoryBandIdsByTileId: buildSalientMemoryTileIndex(salientMemoryByBandId),
    knownOpportunityByBandId: new Map<BandId, NearbyOpportunityGradient>(),
    rangeSaturationByBandId: new Map<BandId, RangeSaturationState>(),
    preDecisionDryContextByBandId: new Map<BandId, DryMarginMobilityContext | undefined>(),
    preDecisionAnchorByBandId: new Map<BandId, ResidentialAnchorContext | undefined>(),
    preDecisionSeasonalRoundByBandId: new Map<BandId, SeasonalRoundScoringContext | undefined>(),
    sharedCatchmentMemo: {},
    salientPlaceMemoByBand: new WeakMap<Band, readonly PlaceMemoryRecord[]>(),
    crowdingFieldMemo: {},
  };
}

export function getActiveBandsFromCache(
  world: WorldState,
  cache: TickContextCache,
): readonly Band[] {
  return cache.activeBandIds
    .map((bandId) => world.bands[bandId])
    .filter((band): band is Band => band !== undefined)
    .sort(compareBands);
}

export function getNearbyActiveBandIdsForTile(
  world: WorldState,
  index: BandSpatialIndex,
  tileId: TileId,
  radius = DEFAULT_NEARBY_RADIUS,
): readonly BandId[] {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return [];
  }

  const memoKey = `${String(tileId)}:${radius}`;
  const memoized = index.nearbyByTileRadius.get(memoKey);

  if (memoized !== undefined) {
    return memoized;
  }

  const bucketRadius = Math.ceil(radius / index.bucketSize) + 1;
  const centerBucket = getBucketCoord(tile.coord.x, tile.coord.y, index.bucketSize);
  const candidateIds = new Set<BandId>();

  for (let y = centerBucket.y - bucketRadius; y <= centerBucket.y + bucketRadius; y += 1) {
    for (let x = centerBucket.x - bucketRadius; x <= centerBucket.x + bucketRadius; x += 1) {
      const bandIds = index.bandIdsByBucket.get(getBucketKey(x, y));

      if (bandIds === undefined) {
        continue;
      }

      for (const bandId of bandIds) {
        candidateIds.add(bandId);
      }
    }
  }

  const result = [...candidateIds]
    .filter((bandId) => {
      const band = world.bands[bandId];
      const bandTile = band === undefined ? undefined : getTile(world, band.position);

      return bandTile !== undefined && getGridDistance(tile, bandTile) <= radius;
    })
    .sort(compareBandIds);

  index.nearbyByTileRadius.set(memoKey, result);

  return result;
}

export function getLocalPopulationEstimateFromCache(
  world: WorldState,
  cache: TickContextCache,
  tileId: TileId,
  radius = DEFAULT_NEARBY_RADIUS,
): number {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return 0;
  }

  return getNearbyActiveBandIdsForTile(world, cache.bandSpatialIndex, tileId, radius)
    .reduce((total, bandId) => {
      const band = world.bands[bandId];
      const bandTile = band === undefined ? undefined : getTile(world, band.position);

      if (band === undefined || bandTile === undefined) {
        return total;
      }

      const distance = getGridDistance(tile, bandTile);
      const weight = (radius + 1 - distance) / (radius + 1);

      return total + band.demography.population * Math.max(0, weight);
    }, 0);
}

export function getLocalBandCountFromCache(
  world: WorldState,
  cache: TickContextCache,
  tileId: TileId,
  radius = DEFAULT_NEARBY_RADIUS,
): number {
  return getNearbyActiveBandIdsForTile(world, cache.bandSpatialIndex, tileId, radius).length;
}

export function getSalientMemorySummary(
  cache: TickContextCache | undefined,
  bandId: BandId,
): SalientBandMemorySummary | undefined {
  return cache?.salientMemoryByBandId.get(bandId);
}

export function getBandIdsWithSalientMemoryNearTile(
  world: WorldState,
  cache: TickContextCache,
  tileId: TileId,
  radius = 2,
): readonly BandId[] {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return [];
  }

  const bandIds = new Set<BandId>();

  for (let y = tile.coord.y - radius; y <= tile.coord.y + radius; y += 1) {
    for (let x = tile.coord.x - radius; x <= tile.coord.x + radius; x += 1) {
      if (Math.abs(tile.coord.x - x) + Math.abs(tile.coord.y - y) > radius) {
        continue;
      }

      const nearbyTile = getTileAtCoord(world, { x, y });

      if (nearbyTile === undefined) {
        continue;
      }

      for (const bandId of cache.salientMemoryBandIdsByTileId.get(nearbyTile.id) ?? []) {
        bandIds.add(bandId);
      }
    }
  }

  return [...bandIds].sort(compareBandIds);
}

function buildSalientMemoryTileIndex(
  summariesByBandId: ReadonlyMap<BandId, SalientBandMemorySummary>,
): ReadonlyMap<TileId, readonly BandId[]> {
  const entries = new Map<TileId, BandId[]>();

  for (const summary of summariesByBandId.values()) {
    const tileIds = new Set<TileId>([
      ...summary.topReturnPlaceIds,
      ...summary.topAnchorPlaceIds,
    ]);

    for (const tileId of tileIds) {
      const bandIds = entries.get(tileId) ?? [];
      bandIds.push(summary.bandId);
      entries.set(tileId, bandIds);
    }
  }

  const output = new Map<TileId, readonly BandId[]>();

  for (const [tileId, bandIds] of entries) {
    output.set(tileId, bandIds.sort(compareBandIds));
  }

  return output;
}

function buildBandSpatialIndex(
  world: WorldState,
  activeBandIds: readonly BandId[],
): BandSpatialIndex {
  const tileBandEntries = new Map<TileId, BandId[]>();
  const bucketEntries = new Map<string, BandId[]>();

  for (const bandId of activeBandIds) {
    const band = world.bands[bandId];
    const tile = band === undefined ? undefined : getTile(world, band.position);

    if (band === undefined || tile === undefined) {
      continue;
    }

    const tileBands = tileBandEntries.get(tile.id) ?? [];
    tileBands.push(band.id);
    tileBandEntries.set(tile.id, tileBands);

    const bucketKey = getBucketKeyForTile(tile.coord.x, tile.coord.y, SPATIAL_BUCKET_SIZE);
    const bucketBands = bucketEntries.get(bucketKey) ?? [];
    bucketBands.push(band.id);
    bucketEntries.set(bucketKey, bucketBands);
  }

  const tileBandOccupancy = new Map<TileId, readonly BandId[]>();
  const bandIdsByBucket = new Map<string, readonly BandId[]>();

  for (const [tileId, bandIds] of tileBandEntries) {
    tileBandOccupancy.set(tileId, bandIds.sort(compareBandIds));
  }

  for (const [bucketKey, bandIds] of bucketEntries) {
    bandIdsByBucket.set(bucketKey, bandIds.sort(compareBandIds));
  }

  return {
    bucketSize: SPATIAL_BUCKET_SIZE,
    activeBandIds,
    tileBandOccupancy,
    bandIdsByBucket,
    nearbyByTileRadius: new Map<string, readonly BandId[]>(),
  };
}

// PERF-2: the salient-memory summary is a pure function of the band's
// placeMemory / observedTiles / travelCorridors / position (+ static world
// topology). All four sub-objects are reference-preserved across context
// passes and ticks until the band actually changes that aspect (the range/
// frontier passes spread NEW band wrappers but keep these refs), so memoizing
// on placeMemory + validating the other three refs reuses the summary across
// the 3 cache builds per tick and into the next tick — byte-identical, since
// identical inputs yield identical output. It was ~6% of self-time (rebuilt 3×
// per tick per band). Keyed on placeMemory (unique per band snapshot).
interface SalientMemoCacheEntry {
  readonly observedTiles: Band["knowledge"]["observedTiles"];
  readonly travelCorridors: Band["travelCorridors"];
  readonly position: TileId;
  readonly summary: SalientBandMemorySummary;
}

const salientMemorySummaryMemo = new WeakMap<
  Band["placeMemory"],
  SalientMemoCacheEntry
>();

function buildSalientBandMemorySummary(
  world: WorldState,
  band: Band,
): SalientBandMemorySummary {
  const cached = salientMemorySummaryMemo.get(band.placeMemory);

  if (
    cached !== undefined &&
    cached.observedTiles === band.knowledge.observedTiles &&
    cached.travelCorridors === band.travelCorridors &&
    cached.position === band.position
  ) {
    return cached.summary;
  }

  const summary = computeSalientBandMemorySummary(world, band);
  salientMemorySummaryMemo.set(band.placeMemory, {
    observedTiles: band.knowledge.observedTiles,
    travelCorridors: band.travelCorridors,
    position: band.position,
    summary,
  });

  return summary;
}

function computeSalientBandMemorySummary(
  world: WorldState,
  band: Band,
): SalientBandMemorySummary {
  const placeMemories = Object.values(band.placeMemory);
  const topReturnPlaceIds = placeMemories
    .filter((memory) => memory.isReturnPlace)
    .sort(comparePlaceMemoryImportance)
    .slice(0, MAX_SALIENT_PLACES)
    .map((memory) => memory.tileId);
  const topAnchorPlaceIds = placeMemories
    .filter((memory) => memory.attachment > 0.4 || memory.isReturnPlace)
    .sort(comparePlaceMemoryImportance)
    .slice(0, MAX_SALIENT_PLACES)
    .map((memory) => memory.tileId);
  const topRiskyPlaceIds = placeMemories
    .filter((memory) => memory.valences.includes("risky") || memory.valences.includes("avoid_place"))
    .sort(comparePlaceMemoryImportance)
    .slice(0, MAX_SALIENT_PLACES)
    .map((memory) => memory.tileId);
  const topDepletedPlaceIds = placeMemories
    .filter((memory) => memory.valences.includes("depleted"))
    .sort(comparePlaceMemoryImportance)
    .slice(0, MAX_SALIENT_PLACES)
    .map((memory) => memory.tileId);
  const topCorridorIds = Object.values(band.travelCorridors)
    .sort((left, right) => {
      const scoreDelta = right.useCount + right.confidence - (left.useCount + left.confidence);

      return scoreDelta === 0
        ? String(left.id).localeCompare(String(right.id))
        : scoreDelta;
    })
    .slice(0, MAX_SALIENT_CORRIDORS)
    .map((corridor) => corridor.id);
  const knownRecords = Object.values(band.knowledge.observedTiles);
  const knownFrontierTileIds = knownRecords
    .filter((record) => isKnownFrontierRecord(world, band, record.tileId))
    .sort(compareKnownTileRecordOpportunity)
    .slice(0, MAX_FRONTIER_CANDIDATES)
    .map((record) => record.tileId);
  const knownOpportunityCandidateIds = knownRecords
    .filter((record) => isKnownOpportunityRecord(world, band, record.tileId))
    .sort(compareKnownTileRecordOpportunity)
    .slice(0, MAX_OPPORTUNITY_CANDIDATES)
    .map((record) => record.tileId);
  const salientInheritedMemoryIds = knownRecords
    .filter((record) => record.knowledgeSource !== "personally_observed" && record.confidence > 0.22)
    .sort(compareKnownTileRecordOpportunity)
    .slice(0, MAX_SALIENT_PLACES)
    .map((record) => record.tileId);

  return {
    bandId: band.id,
    topReturnPlaceIds,
    topAnchorPlaceIds,
    topRiskyPlaceIds,
    topDepletedPlaceIds,
    topCorridorIds,
    knownFrontierTileIds,
    knownOpportunityCandidateIds,
    salientInheritedMemoryIds,
  };
}

function isKnownFrontierRecord(
  world: WorldState,
  band: Band,
  tileId: TileId,
): boolean {
  const tile = getTile(world, tileId);

  return (
    tile !== undefined &&
    isBandPassableDestination(tile) &&
    tile.neighbors.some((neighborId) => band.knowledge.observedTiles[neighborId] === undefined)
  );
}

function isKnownOpportunityRecord(
  world: WorldState,
  band: Band,
  tileId: TileId,
): boolean {
  const tile = getTile(world, tileId);
  const currentTile = getTile(world, band.position);

  return (
    tile !== undefined &&
    currentTile !== undefined &&
    tile.id !== band.position &&
    isBandPassableDestination(tile) &&
    getGridDistance(tile, currentTile) <= 8
  );
}

function comparePlaceMemoryImportance(
  left: Band["placeMemory"][TileId],
  right: Band["placeMemory"][TileId],
): number {
  const leftScore = left.attachment + left.confidence * 0.18 + (left.isReturnPlace ? 0.35 : 0);
  const rightScore = right.attachment + right.confidence * 0.18 + (right.isReturnPlace ? 0.35 : 0);

  return rightScore === leftScore
    ? String(left.tileId).localeCompare(String(right.tileId))
    : rightScore - leftScore;
}

function compareKnownTileRecordOpportunity(
  left: Band["knowledge"]["observedTiles"][TileId],
  right: Band["knowledge"]["observedTiles"][TileId],
): number {
  const leftScore = getRememberedOpportunityValue(left);
  const rightScore = getRememberedOpportunityValue(right);

  return rightScore === leftScore
    ? String(left.tileId).localeCompare(String(right.tileId))
    : rightScore - leftScore;
}

function getRememberedOpportunityValue(record: Band["knowledge"]["observedTiles"][TileId]): number {
  return (
    record.observedRichness * 0.36 +
    (record.observedWaterAccess ?? 0) * 0.28 +
    record.observedAquaticPotential * 0.16 +
    (record.observedSeasonalPattern?.reliability ?? 0) * 0.1 +
    record.confidence * 0.1 -
    (record.observedRisk ?? 0) * 0.12
  );
}

function isActiveBand(band: Band): boolean {
  return isLivingBand(band);
}

function getBucketCoord(
  x: number,
  y: number,
  bucketSize: number,
): { readonly x: number; readonly y: number } {
  return {
    x: Math.floor(x / bucketSize),
    y: Math.floor(y / bucketSize),
  };
}

function getBucketKeyForTile(x: number, y: number, bucketSize: number): string {
  const bucketCoord = getBucketCoord(x, y, bucketSize);

  return getBucketKey(bucketCoord.x, bucketCoord.y);
}

function getBucketKey(x: number, y: number): string {
  return `${x},${y}`;
}

function getGridDistance(
  first: NonNullable<ReturnType<typeof getTile>>,
  second: NonNullable<ReturnType<typeof getTile>>,
): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function compareBands(left: Band, right: Band): number {
  return compareBandIds(left.id, right.id);
}

function compareBandIds(left: BandId, right: BandId): number {
  return String(left).localeCompare(String(right));
}
