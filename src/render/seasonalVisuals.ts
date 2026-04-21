import { getSeasonalTileConditions } from "../sim/world/seasonal";
import { SEASON_LENGTH_DAYS } from "../sim/core/types";
import type { Season, WorldTime } from "../sim/core/types";
import type { SeasonalTileConditions } from "../sim/world/seasonal";
import type { Tile, WorldState } from "../sim/world/types";

export type SeasonalVisualClimateProfile =
  | "default_global"
  | "temperate"
  | "tropical"
  | "arid"
  | "mediterranean"
  | "polar"
  | "highland";

export interface SeasonalVisualProfile {
  readonly climateProfile: SeasonalVisualClimateProfile;
  readonly conditions: SeasonalTileConditions;
  readonly productivity: number;
  readonly stress: number;
  readonly tint: ColorTint;
  readonly visualOnly: true;
}

export interface ColorTint {
  readonly warmDry: number;
  readonly coolWet: number;
  readonly springGreen: number;
  readonly lush: number;
  readonly dormant: number;
  readonly autumnFoliage: number;
  readonly frost: number;
  readonly snow: number;
}

interface SeasonalVisualWeights {
  readonly spring: number;
  readonly summer: number;
  readonly autumn: number;
  readonly winter: number;
}

export interface SeasonalVisualStrategy {
  readonly id: SeasonalVisualClimateProfile;
  readonly deriveProfile: (
    world: WorldState,
    tile: Tile,
    conditions: SeasonalTileConditions,
  ) => SeasonalVisualProfile;
}

const DEFAULT_GLOBAL_SEASONAL_VISUAL_STRATEGY: SeasonalVisualStrategy = {
  id: "default_global",
  deriveProfile: (world, tile, conditions) => {
    const weights = deriveSeasonalVisualWeights(world.time);
    const productivity = clamp01(conditions.currentFoodEstimate / 82);
    const stress = clamp01(
      conditions.currentWaterStress * 0.42 +
        conditions.currentDroughtStress * 0.34 +
        conditions.currentFloodStress * 0.18,
    );
    const peakWeight = getSeasonSetWeight(tile.seasonalProfile.peakSeasons, weights);
    const leanWeight = getSeasonSetWeight(tile.seasonalProfile.leanSeasons, weights);
    const dryness = getTileVisualDryness(tile, conditions);
    const vegetation = getTileVisualVegetation(tile);

    return {
      climateProfile: "default_global",
      conditions,
      productivity,
      stress,
      visualOnly: true,
      tint: {
        warmDry: clamp01((leanWeight * 0.16 + stress * 0.24 + weights.summer * dryness * 0.16) * (1 - weights.winter * 0.32)),
        coolWet: clamp01((conditions.currentFloodStress * 0.2 + weights.spring * 0.05 + weights.winter * 0.06) * (1 - dryness * 0.36)),
        springGreen: clamp01(weights.spring * vegetation * (0.28 + productivity * 0.26) * (1 - dryness * 0.48)),
        lush: clamp01((weights.summer * 0.26 + peakWeight * 0.22) * vegetation * (0.58 + productivity * 0.54) * (1 - dryness * 0.34)),
        dormant: clamp01((weights.winter * (0.2 + dryness * 0.12) + weights.autumn * 0.05) * (1 - vegetation * 0.18)),
        autumnFoliage: clamp01(weights.autumn * vegetation * (0.32 + productivity * 0.24) * (1 - dryness * 0.42)),
        frost: clamp01(weights.winter * (0.09 + tile.elevation * 0.18 + conditions.currentWaterStress * 0.05) * (1 - dryness * 0.34)),
        snow: clamp01(weights.winter * deriveSnowStrength(tile, conditions, dryness)),
      },
    };
  },
};

const SEASONAL_FOOD_BASE_COLORS: readonly [string, string, string, string, string] = [
  "#6d5532",
  "#947042",
  "#9a944f",
  "#4f9654",
  "#1f7446",
];

export function getSeasonalFoodColor(world: WorldState, tile: Tile): string {
  const profile = deriveSeasonalVisualProfile(world, tile);
  const baseColor = getSteppedColor(profile.productivity, SEASONAL_FOOD_BASE_COLORS);

  return applySeasonalTint(baseColor, profile.tint);
}

export function getSeasonalTerrainColor(
  world: WorldState,
  tile: Tile,
  baseColor: string,
): string {
  if (tile.isAquatic || tile.isRiver) {
    return baseColor;
  }

  const profile = deriveSeasonalVisualProfile(world, tile);
  const seasonTint = getDefaultGlobalTerrainTint(world.time);
  const sensitivity = getTerrainSeasonalSensitivity(tile);
  const snowSensitivity = getSnowSeasonalSensitivity(tile);

  return applySeasonalTint(baseColor, {
    warmDry: clamp01((profile.tint.warmDry * 0.55 + seasonTint.warmDry) * sensitivity),
    coolWet: clamp01((profile.tint.coolWet * 0.45 + seasonTint.coolWet) * sensitivity),
    springGreen: clamp01((profile.tint.springGreen * 0.95 + seasonTint.springGreen) * sensitivity),
    lush: clamp01((profile.tint.lush * 0.85 + seasonTint.lush) * sensitivity),
    dormant: clamp01((profile.tint.dormant + seasonTint.dormant) * sensitivity),
    autumnFoliage: clamp01((profile.tint.autumnFoliage + seasonTint.autumnFoliage) * sensitivity),
    frost: clamp01((profile.tint.frost + seasonTint.frost) * sensitivity),
    snow: clamp01((profile.tint.snow + seasonTint.snow) * snowSensitivity),
  });
}

export function deriveSeasonalVisualProfile(
  world: WorldState,
  tile: Tile,
  strategy: SeasonalVisualStrategy = DEFAULT_GLOBAL_SEASONAL_VISUAL_STRATEGY,
): SeasonalVisualProfile {
  return strategy.deriveProfile(world, tile, getSeasonalTileConditions(world, tile));
}

export function getSeasonalVisualTimeKey(time: WorldTime): string {
  const calendarDay = Math.max(
    0,
    Math.floor(time.day ?? Number(time.tick) * SEASON_LENGTH_DAYS + (time.dayOfSeason ?? 0)),
  );

  return `day:${calendarDay}`;
}

export function applySeasonalTint(color: string, tint: ColorTint): string {
  const rgb = parseHexColor(color);
  const warmTinted = mixColor(rgb, { r: 185, g: 132, b: 67 }, tint.warmDry);
  const wetTinted = mixColor(warmTinted, { r: 54, g: 119, b: 148 }, tint.coolWet);
  const springTinted = mixColor(wetTinted, { r: 116, g: 190, b: 75 }, tint.springGreen);
  const lushTinted = mixColor(springTinted, { r: 28, g: 128, b: 65 }, tint.lush);
  const autumnTinted = mixColor(lushTinted, { r: 205, g: 96, b: 38 }, tint.autumnFoliage);
  const dormantTinted = mixColor(autumnTinted, { r: 120, g: 113, b: 91 }, tint.dormant);
  const frosted = mixColor(dormantTinted, { r: 182, g: 194, b: 184 }, tint.frost);
  const snowed = mixColor(frosted, { r: 236, g: 239, b: 228 }, tint.snow);

  return formatHexColor(snowed);
}

function getDefaultGlobalTerrainTint(time: WorldTime): ColorTint {
  const weights = deriveSeasonalVisualWeights(time);

  return {
    warmDry: clamp01(weights.summer * 0.14 + weights.autumn * 0.12 + weights.winter * 0.03),
    coolWet: clamp01(weights.spring * 0.04 + weights.winter * 0.08),
    springGreen: clamp01(weights.spring * 0.3),
    lush: clamp01(weights.summer * 0.2 + weights.spring * 0.06),
    dormant: clamp01(weights.autumn * 0.08 + weights.winter * 0.25),
    autumnFoliage: clamp01(weights.autumn * 0.3),
    frost: clamp01(weights.winter * 0.1),
    snow: clamp01(weights.winter * 0.025),
  };
}

export function deriveSeasonalVisualWeights(time: WorldTime): SeasonalVisualWeights {
  const progress = getSeasonProgress(time);
  const previousWeight = (1 - smoothstep01(0, 0.34, progress)) * 0.42;
  const nextWeight = smoothstep01(0.66, 1, progress) * 0.42;
  const currentWeight = clamp01(1 - previousWeight - nextWeight);
  const weights: Record<Season, number> = {
    spring: 0,
    summer: 0,
    autumn: 0,
    winter: 0,
  };
  const current = time.season;

  weights[getPreviousSeason(current)] += previousWeight;
  weights[current] += currentWeight;
  weights[getNextSeason(current)] += nextWeight;

  return {
    spring: weights.spring,
    summer: weights.summer,
    autumn: weights.autumn,
    winter: weights.winter,
  };
}

function getSeasonSetWeight(seasons: readonly Season[], weights: SeasonalVisualWeights): number {
  return clamp01(seasons.reduce((total, season) => total + weights[season], 0));
}

function getSeasonProgress(time: WorldTime): number {
  const seasonLength = Math.max(1, time.seasonLengthDays ?? SEASON_LENGTH_DAYS);
  return clamp01((time.dayOfSeason ?? 0) / seasonLength);
}

function getPreviousSeason(season: Season): Season {
  if (season === "spring") {
    return "winter";
  }

  if (season === "summer") {
    return "spring";
  }

  if (season === "autumn") {
    return "summer";
  }

  return "autumn";
}

function getNextSeason(season: Season): Season {
  if (season === "spring") {
    return "summer";
  }

  if (season === "summer") {
    return "autumn";
  }

  if (season === "autumn") {
    return "winter";
  }

  return "spring";
}

function getTerrainSeasonalSensitivity(tile: Tile): number {
  if (tile.terrainKind === "forest") {
    return 1;
  }

  if (tile.terrainKind === "river_valley") {
    return 0.9;
  }

  if (tile.terrainKind === "plains") {
    return 0.78;
  }

  if (tile.terrainKind === "wetlands") {
    return 0.64;
  }

  if (tile.terrainKind === "coast") {
    return 0.48;
  }

  if (tile.terrainKind === "desert") {
    return 0.24;
  }

  if (tile.terrainKind === "hills") {
    return 0.26;
  }

  return 0.08;
}

function getSnowSeasonalSensitivity(tile: Tile): number {
  if (tile.isAquatic || tile.isRiver) {
    return 0;
  }

  if (tile.terrainKind === "mountains") {
    return 1;
  }

  if (tile.terrainKind === "hills") {
    return tile.elevation >= 0.56 ? 0.84 : 0.34;
  }

  if (tile.terrainKind === "forest" || tile.biomeKind === "boreal_forest") {
    return 0.58;
  }

  if (tile.terrainKind === "tundra" || tile.biomeKind === "alpine") {
    return 0.72;
  }

  if (tile.terrainKind === "river_valley" || tile.terrainKind === "wetlands") {
    return 0.28;
  }

  if (tile.terrainKind === "desert") {
    return tile.elevation >= 0.72 ? 0.24 : 0.035;
  }

  return 0.2;
}

function getTileVisualDryness(tile: Tile, conditions: SeasonalTileConditions): number {
  const terrainDryness =
    tile.terrainKind === "desert"
      ? 0.9
      : tile.terrainKind === "hills"
        ? 0.46
        : tile.terrainKind === "coast" || tile.terrainKind === "wetlands" || tile.terrainKind === "river_valley"
          ? 0.08
          : 0.24;
  const waterDryness = 1 - tile.resourceProfile.waterAccess;

  return clamp01(terrainDryness * 0.42 + waterDryness * 0.34 + conditions.currentDroughtStress * 0.24);
}

function getTileVisualVegetation(tile: Tile): number {
  if (tile.terrainKind === "desert" || tile.terrainKind === "mountains") {
    return clamp01(tile.resourceProfile.baseRichness * 0.22);
  }

  if (tile.terrainKind === "forest") {
    return clamp01(0.62 + tile.resourceProfile.baseRichness * 0.36);
  }

  if (tile.terrainKind === "wetlands" || tile.terrainKind === "river_valley") {
    return clamp01(0.5 + tile.resourceProfile.baseRichness * 0.28);
  }

  return clamp01(0.18 + tile.resourceProfile.baseRichness * 0.55);
}

function deriveSnowStrength(
  tile: Tile,
  conditions: SeasonalTileConditions,
  dryness: number,
): number {
  const highElevationSnow = smoothstep01(0.55, 0.92, tile.elevation) * 0.72;
  const coldBiomeSnow =
    tile.terrainKind === "tundra" || tile.biomeKind === "alpine" || tile.biomeKind === "boreal_forest"
      ? 0.18
      : 0;
  const wetGroundFrost =
    tile.terrainKind === "wetlands" || tile.terrainKind === "river_valley" || tile.terrainKind === "coast"
      ? clamp01(tile.resourceProfile.waterAccess) * 0.08
      : 0;
  const dryPenalty = tile.terrainKind === "desert" && tile.elevation < 0.72 ? 0.9 : dryness * 0.66;
  const waterStressPenalty = conditions.currentWaterStress * 0.18;

  return clamp01((highElevationSnow + coldBiomeSnow + wetGroundFrost) * (1 - dryPenalty) - waterStressPenalty);
}

function getSteppedColor(
  value: number,
  colors: readonly [string, string, string, string, string],
): string {
  const normalized = clamp01(value);

  if (normalized < 0.2) {
    return colors[0];
  }

  if (normalized < 0.4) {
    return colors[1];
  }

  if (normalized < 0.6) {
    return colors[2];
  }

  if (normalized < 0.8) {
    return colors[3];
  }

  return colors[4];
}

function parseHexColor(color: string): RgbColor {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function mixColor(first: RgbColor, second: RgbColor, amount: number): RgbColor {
  const clampedAmount = clamp01(amount);

  return {
    r: Math.round(first.r + (second.r - first.r) * clampedAmount),
    g: Math.round(first.g + (second.g - first.g) * clampedAmount),
    b: Math.round(first.b + (second.b - first.b) * clampedAmount),
  };
}

function formatHexColor(color: RgbColor): string {
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function toHex(value: number): string {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothstep01(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
