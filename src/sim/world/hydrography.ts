import type { RiverId, Season, TileId, WorldTime } from "../core/types";
import type {
  RiverCrossingClass,
  RiverCrossingProfile,
  RiverSegmentProfile,
  WorldState,
} from "./types";

export interface SeasonalRiverCrossingState {
  readonly crossing: RiverCrossingProfile;
  readonly season: Season;
  readonly effectiveCrossingCost: number;
  readonly effectiveRisk: number;
  readonly isFloodSeason: boolean;
  readonly isBlockedWithoutCapability: boolean;
}

export interface RiverCrossingCapability {
  readonly canUseFords: boolean;
  readonly canUseShallowCrossings: boolean;
  readonly canAttemptBasicRaftCrossing: boolean;
}

const movementCrossingMemo = new WeakMap<WorldState["tiles"], Map<string, RiverCrossingProfile | null>>();
const seasonalCrossingStateMemo = new WeakMap<WorldTime, Map<string, SeasonalRiverCrossingState>>();

export function makeRiverId(id: string): RiverId {
  return `river:${id}` as RiverId;
}

export function makeRiverCrossingKey(first: TileId, second: TileId): string {
  const left = String(first);
  const right = String(second);

  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function getRiverCrossing(
  world: WorldState,
  fromTileId: TileId,
  toTileId: TileId,
): RiverCrossingProfile | undefined {
  return world.riverCrossings[makeRiverCrossingKey(fromTileId, toTileId)];
}

export function getRiverCrossingForMovement(
  world: WorldState,
  fromTileId: TileId,
  toTileId: TileId,
): RiverCrossingProfile | undefined {
  let cachedByEdge = movementCrossingMemo.get(world.tiles);

  if (cachedByEdge === undefined) {
    cachedByEdge = new Map<string, RiverCrossingProfile | null>();
    movementCrossingMemo.set(world.tiles, cachedByEdge);
  }

  const cacheKey = `${String(fromTileId)}->${String(toTileId)}`;
  const cached = cachedByEdge.get(cacheKey);

  if (cached !== undefined) {
    return cached ?? undefined;
  }

  const directCrossing = getRiverCrossing(world, fromTileId, toTileId);

  if (directCrossing !== undefined) {
    cachedByEdge.set(cacheKey, directCrossing);
    return directCrossing;
  }

  const fromTile = world.tiles[fromTileId];
  const toTile = world.tiles[toTileId];

  if (
    fromTile === undefined ||
    toTile === undefined ||
    fromTile.isAquatic ||
    toTile.isAquatic
  ) {
    cachedByEdge.set(cacheKey, null);
    return undefined;
  }

  const sharedRiverTileId = fromTile.neighbors
    .filter((neighborId) => toTile.neighbors.includes(neighborId))
    .map((neighborId) => world.tiles[neighborId])
    .filter((tile) => tile !== undefined && tile.isRiver && tile.riverSegmentId !== undefined)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0]?.id;

  if (sharedRiverTileId === undefined) {
    cachedByEdge.set(cacheKey, null);
    return undefined;
  }

  const firstCrossing = getRiverCrossing(world, fromTileId, sharedRiverTileId);
  const secondCrossing = getRiverCrossing(world, sharedRiverTileId, toTileId);

  if (
    firstCrossing === undefined ||
    secondCrossing === undefined ||
    firstCrossing.riverId !== secondCrossing.riverId
  ) {
    cachedByEdge.set(cacheKey, null);
    return undefined;
  }

  const synthesized: RiverCrossingProfile = {
    fromTileId,
    toTileId,
    riverId: firstCrossing.riverId,
    crossingClass: getHarderCrossingClass(firstCrossing.crossingClass, secondCrossing.crossingClass),
    baseCrossingCost: round2(firstCrossing.baseCrossingCost + secondCrossing.baseCrossingCost),
    seasonalCostModifier: round2(Math.max(firstCrossing.seasonalCostModifier, secondCrossing.seasonalCostModifier)),
    risk: round2(clamp01(Math.max(firstCrossing.risk, secondCrossing.risk) + 0.08)),
    knownFord: firstCrossing.knownFord && secondCrossing.knownFord,
    confidence: round2(Math.min(firstCrossing.confidence, secondCrossing.confidence) * 0.86),
  };

  cachedByEdge.set(cacheKey, synthesized);
  return synthesized;
}

export function getAdjacentRiverCrossings(
  world: WorldState,
  tileId: TileId,
): readonly RiverCrossingProfile[] {
  const tile = world.tiles[tileId];

  if (tile === undefined) {
    return [];
  }

  return tile.neighbors
    .map((neighborId) => getRiverCrossing(world, tileId, neighborId))
    .filter((crossing): crossing is RiverCrossingProfile => crossing !== undefined)
    .sort((left, right) =>
      makeRiverCrossingKey(left.fromTileId, left.toTileId)
        .localeCompare(makeRiverCrossingKey(right.fromTileId, right.toTileId)),
    );
}

export function getRiverProfile(
  world: WorldState,
  riverId: RiverId | undefined,
): RiverSegmentProfile | undefined {
  return riverId === undefined ? undefined : world.rivers[riverId];
}

export function getSeasonalRiverCrossingState(
  world: WorldState,
  crossing: RiverCrossingProfile,
  capability: RiverCrossingCapability,
): SeasonalRiverCrossingState {
  let cachedByCrossing = seasonalCrossingStateMemo.get(world.time);

  if (cachedByCrossing === undefined) {
    cachedByCrossing = new Map<string, SeasonalRiverCrossingState>();
    seasonalCrossingStateMemo.set(world.time, cachedByCrossing);
  }

  const cacheKey = [
    `${String(crossing.fromTileId)}->${String(crossing.toTileId)}`,
    crossing.crossingClass,
    capability.canUseFords ? "f" : "-",
    capability.canUseShallowCrossings ? "s" : "-",
    capability.canAttemptBasicRaftCrossing ? "r" : "-",
  ].join("|");
  const cached = cachedByCrossing.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const river = world.rivers[crossing.riverId];
  const isFloodSeason = river?.floodSeason === world.time.season;
  const seasonMultiplier = getCrossingSeasonMultiplier(world.time.season, crossing.crossingClass, isFloodSeason);
  const capabilityModifier = getCapabilityCostModifier(crossing.crossingClass, capability);
  const seasonalRisk = clamp01(
    crossing.risk +
      crossing.seasonalCostModifier * (isFloodSeason ? 0.42 : 0.14) +
      (river?.crossingRisk ?? 0) * (isFloodSeason ? 0.26 : 0.08),
  );
  const effectiveCrossingCost = round2(
    crossing.baseCrossingCost * seasonMultiplier * capabilityModifier,
  );
  const effectiveRisk = round2(
    clamp01(seasonalRisk * getCapabilityRiskModifier(crossing.crossingClass, capability)),
  );

  const state: SeasonalRiverCrossingState = {
    crossing,
    season: world.time.season,
    effectiveCrossingCost,
    effectiveRisk,
    isFloodSeason,
    isBlockedWithoutCapability: isCrossingBlocked(crossing.crossingClass, capability, effectiveRisk),
  };

  cachedByCrossing.set(cacheKey, state);
  return state;
}

function getCrossingSeasonMultiplier(
  season: Season,
  crossingClass: RiverCrossingClass,
  isFloodSeason: boolean,
): number {
  const floodMultiplier = isFloodSeason ? 1.48 : 1;

  if (crossingClass === "seasonal_ford") {
    return season === "summer" ? 0.74 : floodMultiplier * 1.18;
  }

  if (crossingClass === "ford" || crossingClass === "shallow_crossing") {
    return floodMultiplier;
  }

  if (crossingClass === "dangerous_crossing") {
    return floodMultiplier * 1.18;
  }

  return floodMultiplier * 1.28;
}

function getCapabilityCostModifier(
  crossingClass: RiverCrossingClass,
  capability: RiverCrossingCapability,
): number {
  if (crossingClass === "ford" && capability.canUseFords) {
    return 0.72;
  }

  if (crossingClass === "seasonal_ford" && capability.canUseFords) {
    return 0.86;
  }

  if (crossingClass === "shallow_crossing" && capability.canUseShallowCrossings) {
    return 0.82;
  }

  if (
    crossingClass === "impassable_without_watercraft" &&
    capability.canAttemptBasicRaftCrossing
  ) {
    return 1.48;
  }

  return 1;
}

function getCapabilityRiskModifier(
  crossingClass: RiverCrossingClass,
  capability: RiverCrossingCapability,
): number {
  if (crossingClass === "ford" && capability.canUseFords) {
    return 0.68;
  }

  if (crossingClass === "seasonal_ford" && capability.canUseFords) {
    return 0.82;
  }

  if (crossingClass === "shallow_crossing" && capability.canUseShallowCrossings) {
    return 0.78;
  }

  if (
    crossingClass === "impassable_without_watercraft" &&
    capability.canAttemptBasicRaftCrossing
  ) {
    return 0.86;
  }

  return 1;
}

function isCrossingBlocked(
  crossingClass: RiverCrossingClass,
  capability: RiverCrossingCapability,
  effectiveRisk: number,
): boolean {
  if (crossingClass === "impassable_without_bridge_or_ferry") {
    return true;
  }

  if (
    crossingClass === "impassable_without_watercraft" &&
    !capability.canAttemptBasicRaftCrossing
  ) {
    return true;
  }

  if (
    crossingClass === "dangerous_crossing" &&
    !capability.canAttemptBasicRaftCrossing &&
    effectiveRisk >= 0.86
  ) {
    return true;
  }

  return false;
}

function getHarderCrossingClass(
  first: RiverCrossingClass,
  second: RiverCrossingClass,
): RiverCrossingClass {
  return getCrossingClassSeverity(first) >= getCrossingClassSeverity(second) ? first : second;
}

function getCrossingClassSeverity(crossingClass: RiverCrossingClass): number {
  const severity: Record<RiverCrossingClass, number> = {
    ford: 1,
    shallow_crossing: 2,
    seasonal_ford: 3,
    dangerous_crossing: 4,
    impassable_without_watercraft: 5,
    impassable_without_bridge_or_ferry: 6,
  };

  return severity[crossingClass];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
