// TREE-FOREST-PATCHES-1 — bounded tree/forest patch substrate.
//
// This is a sparse, deterministic forest-cover layer. It does not create
// per-tree agents, logging, construction, storage, agriculture, religion, or a
// full succession model. Static patch presence is derived from terrain,
// hydrography, productivity, and seed-stable variation; world.forestPatchState
// stores only sparse pressure/health deviations, like plant/fauna overlays.

import { getSharedCatchmentIndex } from "./sharedCatchment";
import type { TickContextCache } from "./contextCache";
import type { ReasonId, Season, TickNumber, TileId, WorldTime } from "../core/types";
import type { Tile, WorldState } from "../world/types";

export type TreeCoverType =
  | "scattered_trees"
  | "open_woodland"
  | "dense_woodland"
  | "riparian_trees"
  | "wet_forest_edge"
  | "scrub_tree_mix"
  | "fruit_nut_mast_stand"
  | "young_regrowth"
  | "declining_dieback_patch"
  | "forest_edge";

export type ForestSeasonalState =
  | "spring_flush"
  | "summer_canopy"
  | "autumn_mast"
  | "winter_open"
  | "dry_stressed"
  | "stable";

export type ForestGrowthTrend = "spreading" | "recovering" | "stable" | "declining" | "dieback";

export interface ForestPatchState {
  readonly tileId: TileId;
  readonly coverType: TreeCoverType;
  readonly pressure: number;
  readonly healthStress: number;
  readonly recovery: number;
  readonly edgeSpreadSignal: number;
  readonly lastUseTick: TickNumber;
  readonly cumulativeUse: number;
}

export interface ForestPatch {
  readonly id: string;
  readonly tileId: TileId;
  readonly coverType: TreeCoverType;
  readonly density: number;
  readonly maturity: number;
  readonly health: number;
  readonly seasonalState: ForestSeasonalState;
  readonly growthTrend: ForestGrowthTrend;
  readonly diebackTrend: number;
  readonly spreadChance: number;
  readonly fruitMastLink: "none" | "fruit_berry" | "nuts_mast" | "mixed_mast";
  readonly visibilityEffect: number;
  readonly travelAccessEffect: number;
  readonly animalHabitatValue: number;
  readonly woodFuelMaterialValue: number;
  readonly shadeRefugeValue: number;
  readonly pressure: number;
  readonly recovery: number;
  readonly rawSource: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface ForestTileEffect {
  readonly visibilityReduction: number;
  readonly travelCostBump: number;
  readonly shelterRefuge: number;
  readonly animalHabitatValue: number;
  readonly fruitMastValue: number;
  readonly woodFuelHook: number;
}

export interface ForestPatchSummary {
  readonly patchCount: number;
  readonly dynamicRecords: number;
  readonly byCoverType: Readonly<Record<string, number>>;
  readonly meanDensity: number;
  readonly meanHealth: number;
  readonly recoveringCount: number;
  readonly decliningCount: number;
  readonly spreadingCount: number;
  readonly animalHabitatLinks: number;
  readonly fruitMastLinks: number;
}

const PRESSURE_NORM = 2.2;
const PRESSURE_GAIN = 0.18;
const HEALTH_STRESS_GAIN = 0.12;
const RECOVERY_RATE = 0.16;
const DROP_EPSILON = 0.006;

export function deriveForestPatchesForTile(
  tile: Tile,
  time: WorldTime,
  state?: ForestPatchState,
): readonly ForestPatch[] {
  const coverType = classifyForestCoverForTile(tile);

  if (coverType === undefined) {
    return [];
  }

  const suitability = estimateForestSuitability(tile);
  const statePressure = state?.pressure ?? 0;
  const stateHealthStress = state?.healthStress ?? 0;
  const baseDensity = getBaseDensity(tile, coverType, suitability);
  const droughtStress = getSeasonalDroughtStress(tile, time.season);
  const density = round2(clamp01(baseDensity * (1 - statePressure * 0.28)));
  const maturity = round2(getMaturity(tile, coverType));
  const diebackTrend = round2(clamp01(droughtStress * 0.55 + statePressure * 0.26 + stateHealthStress * 0.4 + (suitability < 0.26 ? 0.16 : 0)));
  const health = round2(clamp01(0.72 + suitability * 0.24 + (state?.recovery ?? 0) * 0.18 - diebackTrend * 0.48));
  const spreadChance = round2(getSpreadChance(tile, coverType, density, health, state?.edgeSpreadSignal ?? 0));
  const seasonalState = classifySeasonalState(tile, coverType, time.season, diebackTrend);
  const growthTrend = classifyGrowthTrend(health, diebackTrend, spreadChance, state?.recovery ?? 0, statePressure);
  const fruitMastLink = getFruitMastLink(tile, coverType);
  const visibilityEffect = round2(clamp01(density * (coverType === "dense_woodland" ? 0.72 : 0.52)));
  const travelAccessEffect = round2(clamp01(density * getTravelEffectWeight(coverType)));
  const animalHabitatValue = round2(getAnimalHabitatValue(tile, coverType, density, health));
  const woodFuelMaterialValue = round2(clamp01(density * 0.54 + maturity * 0.22));
  const shadeRefugeValue = round2(clamp01(density * 0.34 + tile.resourceProfile.waterAccess * 0.16));

  return [{
    id: getForestPatchId(tile.id, coverType),
    tileId: tile.id,
    coverType,
    density,
    maturity,
    health,
    seasonalState,
    growthTrend,
    diebackTrend,
    spreadChance,
    fruitMastLink,
    visibilityEffect,
    travelAccessEffect,
    animalHabitatValue,
    woodFuelMaterialValue,
    shadeRefugeValue,
    pressure: round2(statePressure),
    recovery: round2(state?.recovery ?? clamp01((1 - statePressure) * 0.2 + health * 0.18)),
    rawSource: "deriveForestPatchesForTile terrain/hydrography/productivity deterministic patch summary",
    reasonIds: [`reason:forest-patch:${String(tile.id)}:${coverType}` as ReasonId],
  }];
}

export function deriveForestTileEffect(tile: Tile, time: WorldTime, state?: ForestPatchState): ForestTileEffect {
  const patch = deriveForestPatchesForTile(tile, time, state)[0];

  if (patch === undefined) {
    return {
      visibilityReduction: 0,
      travelCostBump: 0,
      shelterRefuge: 0,
      animalHabitatValue: 0,
      fruitMastValue: 0,
      woodFuelHook: 0,
    };
  }

  return {
    visibilityReduction: patch.visibilityEffect,
    travelCostBump: patch.travelAccessEffect,
    shelterRefuge: patch.shadeRefugeValue,
    animalHabitatValue: patch.animalHabitatValue,
    fruitMastValue: patch.fruitMastLink === "none" ? 0 : round2(clamp01(patch.density * patch.health)),
    woodFuelHook: patch.woodFuelMaterialValue,
  };
}

export function estimateForestSuitability(tile: Tile): number {
  const richness = clamp01(tile.resourceProfile.baseRichness);
  const water = clamp01(tile.resourceProfile.waterAccess);
  const wetEdge =
    tile.isFloodplain ||
    tile.isRiverbank ||
    tile.isConfluence ||
    tile.isMarshChannel ||
    tile.isEstuary ||
    tile.hasCreek === true;
  const dryPenalty = tile.terrainKind === "desert" ? 0.34 : tile.terrainKind === "tundra" ? 0.18 : 0;
  const aquaticPenalty = tile.isAquatic && !tile.isRiverbank && !tile.isFloodplain ? 0.62 : 0;
  const terrainBase = getTerrainForestBase(tile);
  const slopeSupport = tile.terrainKind === "hills" ? clamp01(tile.elevation) * 0.16 : tile.terrainKind === "mountains" ? clamp01(1 - tile.elevation) * 0.08 : 0;
  const waterBoost = wetEdge ? 0.28 : water * 0.2;

  return round3(clamp01(terrainBase + richness * 0.22 + waterBoost + slopeSupport - dryPenalty - aquaticPenalty));
}

export function classifyForestCoverForTile(tile: Tile): TreeCoverType | undefined {
  const suitability = estimateForestSuitability(tile);

  if (suitability < 0.18) {
    return undefined;
  }

  const wetEdge =
    tile.isFloodplain ||
    tile.isRiverbank ||
    tile.isConfluence ||
    tile.isMarshChannel ||
    tile.isEstuary ||
    tile.hasCreek === true;

  if (tile.terrainKind === "desert" || tile.terrainKind === "tundra") {
    return wetEdge && suitability >= 0.2 ? "scrub_tree_mix" : undefined;
  }

  if (tile.terrainKind === "coast" && !wetEdge && suitability < 0.42) {
    return suitability >= 0.28 ? "scrub_tree_mix" : undefined;
  }

  if (tile.terrainKind === "wetlands" || tile.isMarshChannel || tile.isEstuary) {
    return "wet_forest_edge";
  }

  if (wetEdge && tile.resourceProfile.waterAccess >= 0.35) {
    return "riparian_trees";
  }

  if (tile.terrainKind === "forest") {
    const selector = hashUnit(String(tile.id), ["forest-cover", tile.coord.x, tile.coord.y]);
    if (selector > 0.74 && tile.resourceProfile.baseRichness >= 0.46) {
      return "fruit_nut_mast_stand";
    }
    if (selector < 0.24) {
      return "forest_edge";
    }
    return suitability >= 0.68 ? "dense_woodland" : "open_woodland";
  }

  if (tile.terrainKind === "hills" || tile.terrainKind === "mountains") {
    return suitability >= 0.46 ? "open_woodland" : "scrub_tree_mix";
  }

  if (tile.terrainKind === "plains" || tile.terrainKind === "river_valley") {
    if (suitability >= 0.58 && tile.resourceProfile.baseRichness >= 0.5) {
      return "open_woodland";
    }
    return suitability >= 0.34 ? "scattered_trees" : "scrub_tree_mix";
  }

  return suitability >= 0.5 ? "open_woodland" : "scattered_trees";
}

export function getForestPatchId(tileId: TileId, coverType: TreeCoverType): string {
  return `forest:${coverType}:${String(tileId)}`;
}

export function advanceForestPatchState(world: WorldState, cache: TickContextCache): WorldState {
  const previous = world.forestPatchState ?? {};
  const index = getSharedCatchmentIndex(world, cache);
  const tick = world.time.tick;
  const next: Record<string, ForestPatchState> = {};
  const touched = new Set<string>(Object.keys(previous));

  for (const [tileId, claim] of index.claimsByTileId) {
    const tile = world.tiles[tileId];

    if (tile === undefined) {
      continue;
    }

    const coverType = classifyForestCoverForTile(tile);

    if (coverType === undefined) {
      continue;
    }

    const patchId = getForestPatchId(tile.id, coverType);
    const patch = deriveForestPatchesForTile(tile, world.time, previous[patchId])[0];

    if (patch === undefined) {
      continue;
    }

    const state = previous[patchId];
    const generalPressure = clamp01((claim.totalWeight / PRESSURE_NORM) * (0.45 + patch.density * 0.36 + patch.travelAccessEffect * 0.18));
    const droughtStress = getSeasonalDroughtStress(tile, world.time.season);
    const pressure = clamp01((state?.pressure ?? 0) * 0.72 + generalPressure * PRESSURE_GAIN);
    const healthStress = clamp01((state?.healthStress ?? 0) * 0.82 + generalPressure * HEALTH_STRESS_GAIN + droughtStress * 0.08);
    const recovery = clamp01((state?.recovery ?? 0) * 0.62 + (generalPressure < 0.05 ? RECOVERY_RATE : 0.02));
    const edgeSpreadSignal = clamp01((state?.edgeSpreadSignal ?? 0) * 0.78 + (generalPressure < 0.04 && patch.spreadChance >= 0.28 ? 0.08 : 0));

    if (pressure >= DROP_EPSILON || healthStress >= DROP_EPSILON || recovery >= DROP_EPSILON || edgeSpreadSignal >= DROP_EPSILON) {
      next[patchId] = {
        tileId: tile.id,
        coverType,
        pressure: round4(pressure),
        healthStress: round4(healthStress),
        recovery: round4(recovery),
        edgeSpreadSignal: round4(edgeSpreadSignal),
        lastUseTick: generalPressure > 0.02 ? tick : (state?.lastUseTick ?? tick),
        cumulativeUse: round4((state?.cumulativeUse ?? 0) + generalPressure),
      };
    }

    touched.delete(patchId);
  }

  for (const patchId of touched) {
    const state = previous[patchId];

    if (state === undefined) {
      continue;
    }

    const pressure = clamp01(state.pressure * 0.72 - RECOVERY_RATE * 0.05);
    const healthStress = clamp01(state.healthStress * 0.82 - RECOVERY_RATE * 0.04);
    const recovery = clamp01(state.recovery * 0.72 + RECOVERY_RATE * 0.08);
    const edgeSpreadSignal = clamp01(state.edgeSpreadSignal * 0.84 + recovery * 0.04);

    if (pressure >= DROP_EPSILON || healthStress >= DROP_EPSILON || recovery >= DROP_EPSILON || edgeSpreadSignal >= DROP_EPSILON) {
      next[patchId] = {
        ...state,
        pressure: round4(pressure),
        healthStress: round4(healthStress),
        recovery: round4(recovery),
        edgeSpreadSignal: round4(edgeSpreadSignal),
      };
    }
  }

  return { ...world, forestPatchState: next as Readonly<Record<string, ForestPatchState>> };
}

export function summarizeForestPatches(world: WorldState, sampleCap = 100000): ForestPatchSummary {
  const byCoverType: Record<string, number> = {};
  let patchCount = 0;
  let densitySum = 0;
  let healthSum = 0;
  let recoveringCount = 0;
  let decliningCount = 0;
  let spreadingCount = 0;
  let animalHabitatLinks = 0;
  let fruitMastLinks = 0;

  const tileIds = Object.keys(world.tiles).sort().slice(0, sampleCap) as TileId[];

  for (const tileId of tileIds) {
    const tile = world.tiles[tileId];

    if (tile === undefined) {
      continue;
    }

    for (const patch of deriveForestPatchesForTile(tile, world.time, getForestPatchState(world, tile))) {
      patchCount += 1;
      byCoverType[patch.coverType] = (byCoverType[patch.coverType] ?? 0) + 1;
      densitySum += patch.density;
      healthSum += patch.health;
      if (patch.growthTrend === "recovering") {
        recoveringCount += 1;
      }
      if (patch.growthTrend === "declining" || patch.growthTrend === "dieback") {
        decliningCount += 1;
      }
      if (patch.growthTrend === "spreading") {
        spreadingCount += 1;
      }
      if (patch.animalHabitatValue >= 0.32) {
        animalHabitatLinks += 1;
      }
      if (patch.fruitMastLink !== "none") {
        fruitMastLinks += 1;
      }
    }
  }

  return {
    patchCount,
    dynamicRecords: Object.keys(world.forestPatchState ?? {}).length,
    byCoverType,
    meanDensity: patchCount === 0 ? 0 : round3(densitySum / patchCount),
    meanHealth: patchCount === 0 ? 0 : round3(healthSum / patchCount),
    recoveringCount,
    decliningCount,
    spreadingCount,
    animalHabitatLinks,
    fruitMastLinks,
  };
}

export function getForestPatchState(world: WorldState, tile: Tile): ForestPatchState | undefined {
  const coverType = classifyForestCoverForTile(tile);

  if (coverType === undefined) {
    return undefined;
  }

  return world.forestPatchState?.[getForestPatchId(tile.id, coverType)];
}

function getTerrainForestBase(tile: Tile): number {
  switch (tile.terrainKind) {
    case "forest":
      return 0.54;
    case "wetlands":
      return 0.34;
    case "river_valley":
      return 0.26;
    case "hills":
      return 0.3;
    case "mountains":
      return 0.18;
    case "plains":
      return 0.18;
    case "coast":
      return 0.12;
    case "desert":
      return 0.04;
    case "tundra":
      return 0.08;
    case "lake":
      return 0.02;
  }
}

function getBaseDensity(tile: Tile, coverType: TreeCoverType, suitability: number): number {
  const jitter = hashUnit(String(tile.id), ["density", coverType]);
  const coverBase = (() => {
    switch (coverType) {
      case "dense_woodland":
        return 0.78;
      case "fruit_nut_mast_stand":
        return 0.62;
      case "wet_forest_edge":
      case "riparian_trees":
      case "open_woodland":
        return 0.5;
      case "forest_edge":
        return 0.42;
      case "young_regrowth":
      case "scrub_tree_mix":
        return 0.3;
      case "scattered_trees":
        return 0.2;
      case "declining_dieback_patch":
        return 0.24;
    }
  })();

  return clamp01(coverBase + suitability * 0.18 + (jitter - 0.5) * 0.1);
}

function getMaturity(tile: Tile, coverType: TreeCoverType): number {
  if (coverType === "young_regrowth") {
    return 0.24;
  }
  if (coverType === "dense_woodland" || coverType === "fruit_nut_mast_stand") {
    return round2(clamp01(0.62 + tile.resourceProfile.baseRichness * 0.2));
  }
  return round2(clamp01(0.38 + estimateForestSuitability(tile) * 0.28));
}

function classifySeasonalState(
  tile: Tile,
  coverType: TreeCoverType,
  season: Season,
  diebackTrend: number,
): ForestSeasonalState {
  if (diebackTrend >= 0.48) {
    return "dry_stressed";
  }
  if (season === "spring") {
    return "spring_flush";
  }
  if (season === "summer") {
    return tile.riskProfile.droughtRisk >= 0.32 ? "dry_stressed" : "summer_canopy";
  }
  if (season === "autumn" && getFruitMastLink(tile, coverType) !== "none") {
    return "autumn_mast";
  }
  if (season === "winter") {
    return "winter_open";
  }
  return "stable";
}

function classifyGrowthTrend(
  health: number,
  diebackTrend: number,
  spreadChance: number,
  recovery: number,
  pressure: number,
): ForestGrowthTrend {
  if (diebackTrend >= 0.58 || health < 0.42) {
    return "dieback";
  }
  if (diebackTrend >= 0.36 || pressure >= 0.46) {
    return "declining";
  }
  if (recovery >= 0.18) {
    return "recovering";
  }
  if (spreadChance >= 0.32 && pressure < 0.14 && health >= 0.62) {
    return "spreading";
  }
  return "stable";
}

function getSpreadChance(
  tile: Tile,
  coverType: TreeCoverType,
  density: number,
  health: number,
  edgeSpreadSignal: number,
): number {
  const edgeType = coverType === "forest_edge" || coverType === "riparian_trees" || coverType === "open_woodland";
  return round2(clamp01(
    (edgeType ? 0.16 : 0.04) +
      tile.resourceProfile.resourceRegenerationRate * 0.18 +
      tile.resourceProfile.waterAccess * 0.08 +
      health * 0.12 -
      density * 0.08 +
      edgeSpreadSignal * 0.2,
  ));
}

function getFruitMastLink(tile: Tile, coverType: TreeCoverType): ForestPatch["fruitMastLink"] {
  if (coverType === "fruit_nut_mast_stand") {
    return "mixed_mast";
  }
  if (coverType === "forest_edge" || coverType === "open_woodland" || coverType === "riparian_trees") {
    const selector = hashUnit(String(tile.id), ["fruit-mast", coverType]);
    if (tile.resourceProfile.baseRichness >= 0.45 && selector > 0.68) {
      return "fruit_berry";
    }
    if (tile.resourceProfile.baseRichness >= 0.52 && selector > 0.42) {
      return "nuts_mast";
    }
  }
  return "none";
}

function getTravelEffectWeight(coverType: TreeCoverType): number {
  switch (coverType) {
    case "dense_woodland":
      return 0.48;
    case "wet_forest_edge":
      return 0.4;
    case "scrub_tree_mix":
      return 0.34;
    case "riparian_trees":
    case "fruit_nut_mast_stand":
      return 0.28;
    case "open_woodland":
    case "forest_edge":
      return 0.22;
    case "young_regrowth":
    case "declining_dieback_patch":
      return 0.18;
    case "scattered_trees":
      return 0.08;
  }
}

function getAnimalHabitatValue(tile: Tile, coverType: TreeCoverType, density: number, health: number): number {
  const edgeBonus = coverType === "forest_edge" || coverType === "open_woodland" || coverType === "riparian_trees" ? 0.18 : 0;
  const wetBonus = coverType === "wet_forest_edge" || tile.isFloodplain || tile.isRiverbank ? 0.14 : 0;
  const densePenaltyForOpenHerds = coverType === "dense_woodland" ? 0.06 : 0;

  return clamp01(density * 0.42 + health * 0.2 + edgeBonus + wetBonus - densePenaltyForOpenHerds);
}

function getSeasonalDroughtStress(tile: Tile, season: Season): number {
  const drySeason = season === "summer" || tile.seasonalProfile.leanSeasons.includes(season);
  return drySeason ? clamp01(tile.riskProfile.droughtRisk * 0.72 + tile.seasonalProfile.expectedWinterStress * 0.12) : 0;
}

function hashUnit(seed: string, parts: readonly (string | number)[]): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  for (const part of parts) {
    const value = String(part);
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 2246822519);
  }
  return (hash >>> 0) / 4294967296;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
