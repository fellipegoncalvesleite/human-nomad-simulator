import type { TileId, WorldTime } from "../core/types";
import { getRiverProfile } from "./hydrography";
import type { Tile, WorldState } from "./types";

export interface SeasonalTileConditions {
  readonly tileId: TileId;
  readonly time: WorldTime;
  readonly currentFoodEstimate: number;
  readonly currentWaterStress: number;
  readonly currentFloodStress: number;
  readonly currentDroughtStress: number;
  readonly currentAquaticReliability: number;
  readonly currentMovementDifficulty: number;
}

const seasonalTileConditionsByTime = new WeakMap<WorldTime, Map<TileId, SeasonalTileConditions>>();

export function getSeasonalTileConditions(
  world: WorldState,
  tile: Tile,
): SeasonalTileConditions {
  let cachedByTile = seasonalTileConditionsByTime.get(world.time);

  if (cachedByTile === undefined) {
    cachedByTile = new Map<TileId, SeasonalTileConditions>();
    seasonalTileConditionsByTime.set(world.time, cachedByTile);
  }

  const cached = cachedByTile.get(tile.id);

  if (cached !== undefined) {
    return cached;
  }

  const seasonalAvailability = getSeasonalAvailability(world, tile);
  const riverProfile = getRiverProfile(world, tile.riverSegmentId);
  const isRiverFloodSeason = riverProfile?.floodSeason === world.time.season;
  const currentFloodStress = clamp01(
    tile.riskProfile.floodRisk * getFloodSeasonMultiplier(world.time) +
      (isRiverFloodSeason ? (riverProfile?.seasonalFlowVariance ?? 0) * 0.18 : 0),
  );
  const currentDroughtStress = clamp01(
    tile.riskProfile.droughtRisk * getDroughtSeasonMultiplier(world.time),
  );
  const currentWaterStress = clamp01(
    1 - tile.resourceProfile.waterAccess + currentDroughtStress * 0.46 - currentFloodStress * 0.12,
  );
  const currentAquaticReliability = clamp01(
    tile.resourceProfile.aquaticPotential *
      (0.42 + tile.seasonalProfile.reliability * 0.48 + seasonalAvailability * 0.1) -
      currentDroughtStress * 0.12 +
      (riverProfile?.aquaticReliabilityModifier ?? 0),
  );
  const currentFoodEstimate = round2(
    getBaseFoodPotential(tile) * (0.54 + seasonalAvailability * 0.62) +
      currentAquaticReliability * 10 -
      currentWaterStress * 8 +
      (tile.isFloodplain ? (riverProfile?.floodplainFertilityModifier ?? 0.08) * 16 : 0),
  );
  const currentMovementDifficulty = round2(
    tile.movementCost *
      (1 +
        currentFloodStress * 0.24 +
        currentDroughtStress * 0.08 +
        getWinterMovementPenalty(world.time) +
        (tile.isMarshChannel ? 0.12 : 0)),
  );

  const result: SeasonalTileConditions = {
    tileId: tile.id,
    time: world.time,
    currentFoodEstimate: Math.max(0, currentFoodEstimate),
    currentWaterStress,
    currentFloodStress,
    currentDroughtStress,
    currentAquaticReliability,
    currentMovementDifficulty,
  };

  cachedByTile.set(tile.id, result);
  return result;
}

function getSeasonalAvailability(world: WorldState, tile: Tile): number {
  const isPeakSeason = tile.seasonalProfile.peakSeasons.includes(world.time.season);
  const isLeanSeason = tile.seasonalProfile.leanSeasons.includes(world.time.season);
  const seasonalSwing = tile.seasonalProfile.seasonalVariance * 0.36;
  const peakModifier = isPeakSeason ? seasonalSwing : 0;
  const leanModifier = isLeanSeason ? -seasonalSwing : 0;

  return clamp01(tile.seasonalProfile.reliability + peakModifier + leanModifier);
}

function getBaseFoodPotential(tile: Tile): number {
  return (
    tile.resourceProfile.baseRichness * 34 +
    tile.resourceProfile.wildGrainPotential * 20 +
    tile.resourceProfile.plantTendingPotential * 18 +
    tile.resourceProfile.aquaticPotential * 14
  );
}

function getFloodSeasonMultiplier(time: WorldTime): number {
  if (time.season === "spring") {
    return 1.24;
  }

  if (time.season === "summer") {
    return 0.72;
  }

  if (time.season === "autumn") {
    return 0.96;
  }

  return 0.86;
}

function getDroughtSeasonMultiplier(time: WorldTime): number {
  if (time.season === "summer") {
    return 1.28;
  }

  if (time.season === "autumn") {
    return 1;
  }

  if (time.season === "winter") {
    return 0.82;
  }

  return 0.66;
}

function getWinterMovementPenalty(time: WorldTime): number {
  return time.season === "winter" ? 0.08 : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
