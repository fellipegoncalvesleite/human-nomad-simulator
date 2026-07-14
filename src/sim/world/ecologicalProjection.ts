// ALL-MAP LIVING ECOLOGY — read-only three-layer ecological projections.
//
// These projections explain existing state. They are NEVER an economy input:
//   * habitat potential reads slow/static terrain substrate;
//   * current living ecology reads exact physical patch/stock state (Technical);
//   * perceived opportunity reads one band's bounded knowledge and nothing else.
//
// A projection cannot create food. In particular, current source channels start
// at zero and only receive a contribution from an actual plant patch or fauna /
// aquatic stock. The scalar helpers exist for map colour only; source-separated
// values remain authoritative for inspection and all records carry an explicit
// `feedsHumanNutrition: false` guard.

import type { Band } from "../agents/types";
import {
  deriveFaunaStockGeography,
  getFaunaStockDynamic,
  seasonalAvailabilityFactor,
  type FaunaStockGeo,
  type FaunaStockGeography,
} from "../agents/faunaStock";
import {
  derivePlantPatchesForTile,
  getPlantClassProfile,
  type PlantPatch,
} from "../agents/plantPatches";
import type { ResourcePatchMemory } from "../agents/resourceKnowledge";
import type { Season, TickNumber, TileId, WorldTime } from "../core/types";
import type { KnownTileRecord } from "../knowledge/types";
import { getSeasonalTileConditions } from "./seasonal";
import type { Tile, WorldState } from "./types";

export const MAX_WORLD_ECOLOGICAL_PROJECTION_TILES = 200_000;
export const MAX_CURRENT_SOURCES_PER_TILE = 8;
export const MAX_PERCEIVED_ECOLOGICAL_TILES = 256;
export const MAX_PERCEIVED_EVIDENCE_PER_TILE = 8;

export type EcologicalProjectionKind =
  | "habitat_potential"
  | "current_living_ecology"
  | "band_perceived_opportunity";

export type EcologicalSupportChannel = "plant" | "terrestrial_fauna" | "aquatic" | "water";

export interface EcologicalSourceChannels {
  readonly plant: number;
  readonly terrestrialFauna: number;
  readonly aquatic: number;
  readonly water: number;
}

export interface AggregatedEcologicalSupport {
  // Food-source projection only. Water never disguises an absence of food.
  readonly foodSupportScalar: number;
  // Broader ecological support for display; keeps water explicit in channels.
  readonly ecologicalSupportScalar: number;
}

export interface HabitatPotentialTileProjection extends EcologicalSourceChannels, AggregatedEcologicalSupport {
  readonly kind: "habitat_potential";
  readonly tileId: TileId;
  readonly accessibility: number;
  readonly seasonalReliability: number;
  readonly substrateOnly: true;
  readonly currentFoodAvailable: false;
  readonly feedsHumanNutrition: false;
}

export interface EcologicalSourceContribution {
  readonly sourceId: string;
  readonly sourceClass: string;
  readonly channel: Exclude<EcologicalSupportChannel, "water">;
  readonly availability: number;
  readonly depletion: number;
  readonly seasonalFactor: number;
  readonly recoverySignal: number;
}

export interface CurrentLivingEcologyTileProjection extends EcologicalSourceChannels, AggregatedEcologicalSupport {
  readonly kind: "current_living_ecology";
  readonly tileId: TileId;
  readonly season: Season;
  readonly plantPatchCount: number;
  readonly terrestrialFaunaStockCount: number;
  readonly aquaticStockCount: number;
  readonly predatorStockCount: number;
  readonly accessibility: number;
  readonly depletion: number;
  readonly recoverySignal: number;
  readonly trophicCondition: number;
  readonly predatorPressure: number;
  readonly sources: readonly EcologicalSourceContribution[];
  readonly exactWorldTruth: true;
  readonly technicalOnly: true;
  readonly feedsHumanNutrition: false;
}

export type PerceivedStaleness = "fresh" | "aging" | "stale" | "very_stale" | "unknown";

export interface PerceivedEcologicalEvidence {
  readonly sourceId: string;
  readonly sourceKind: "tile_observation" | "resource_memory";
  readonly channel: EcologicalSupportChannel;
  readonly rememberedOpportunity: number;
  readonly confidence: number;
  readonly observedTick: TickNumber;
}

export interface BandPerceivedEcologicalTileProjection extends EcologicalSourceChannels, AggregatedEcologicalSupport {
  readonly kind: "band_perceived_opportunity";
  readonly tileId: TileId;
  readonly known: boolean;
  readonly confidence: number;
  readonly uncertainty: number;
  readonly ageTicks: number | null;
  readonly staleness: PerceivedStaleness;
  readonly evidence: readonly PerceivedEcologicalEvidence[];
  readonly approximateOnly: true;
  readonly fromBandKnowledgeOnly: true;
  readonly exactCurrentStockHidden: true;
  readonly feedsHumanNutrition: false;
}

export interface HabitatPotentialProjection {
  readonly kind: "habitat_potential";
  readonly tiles: Readonly<Record<TileId, HabitatPotentialTileProjection>>;
  readonly projectedTileCount: number;
  readonly omittedTileCount: number;
  readonly bounded: true;
  readonly feedsHumanNutrition: false;
}

export interface CurrentLivingEcologyProjection {
  readonly kind: "current_living_ecology";
  readonly time: WorldTime;
  readonly tiles: Readonly<Record<TileId, CurrentLivingEcologyTileProjection>>;
  readonly projectedTileCount: number;
  readonly omittedTileCount: number;
  readonly sourceTotals: {
    readonly plantPatches: number;
    readonly terrestrialFaunaStocks: number;
    readonly aquaticStocks: number;
    readonly predators: number;
  };
  readonly exactWorldTruth: true;
  readonly technicalOnly: true;
  readonly bounded: true;
  readonly feedsHumanNutrition: false;
}

export interface BandPerceivedEcologicalOpportunityProjection {
  readonly kind: "band_perceived_opportunity";
  readonly bandId: Band["id"];
  readonly time: WorldTime;
  readonly tiles: Readonly<Record<TileId, BandPerceivedEcologicalTileProjection>>;
  readonly projectedTileCount: number;
  readonly omittedKnownTileCount: number;
  readonly fromBandKnowledgeOnly: true;
  readonly bounded: true;
  readonly feedsHumanNutrition: false;
}

const habitatProjectionMemo = new WeakMap<object, HabitatPotentialProjection>();
const currentProjectionMemo = new WeakMap<object, CurrentLivingEcologyProjection>();

/** Map-colour aggregation only. It is intentionally not imported by food logic. */
export function aggregateEcologicalSupport(channels: EcologicalSourceChannels): AggregatedEcologicalSupport {
  const plant = clamp01(channels.plant);
  const terrestrial = clamp01(channels.terrestrialFauna);
  const aquatic = clamp01(channels.aquatic);
  const water = clamp01(channels.water);
  const foodSupportScalar = clamp01(plant * 0.48 + terrestrial * 0.32 + aquatic * 0.2);

  return {
    foodSupportScalar: round4(foodSupportScalar),
    ecologicalSupportScalar: round4(clamp01(foodSupportScalar * 0.9 + water * 0.1)),
  };
}

/** Static/slow substrate projection. It never claims that food exists now. */
export function deriveHabitatPotentialProjection(world: WorldState): HabitatPotentialProjection {
  const cached = habitatProjectionMemo.get(world.tiles);
  if (cached !== undefined) return cached;

  const orderedTileIds = boundedWorldTileIds(world);
  const tiles: Record<string, HabitatPotentialTileProjection> = {};

  for (const tileId of orderedTileIds) {
    const tile = world.tiles[tileId];
    if (tile === undefined) continue;
    tiles[tileId] = deriveHabitatPotentialTile(tile);
  }

  const totalTileCount = Object.keys(world.tiles).length;
  const projection: HabitatPotentialProjection = {
    kind: "habitat_potential",
    tiles: tiles as Readonly<Record<TileId, HabitatPotentialTileProjection>>,
    projectedTileCount: orderedTileIds.length,
    omittedTileCount: Math.max(0, totalTileCount - orderedTileIds.length),
    bounded: true,
    feedsHumanNutrition: false,
  };
  habitatProjectionMemo.set(world.tiles, projection);
  return projection;
}

export function deriveHabitatPotentialTile(tile: Tile): HabitatPotentialTileProjection {
  const plant = clamp01(
    tile.resourceProfile.baseRichness * 0.48 +
      tile.resourceProfile.wildGrainPotential * 0.27 +
      tile.resourceProfile.plantTendingPotential * 0.15 +
      tile.resourceProfile.resourceRegenerationRate * 0.1,
  );
  const terrestrialFauna = tile.isAquatic
    ? 0
    : clamp01(
        tile.resourceProfile.baseRichness * 0.52 +
          tile.resourceProfile.waterAccess * 0.2 +
          (tile.terrainKind === "forest" || tile.terrainKind === "plains" || tile.isFloodplain ? 0.18 : 0) -
          tile.riskProfile.droughtRisk * 0.12,
      );
  const aquatic = clamp01(tile.resourceProfile.aquaticPotential);
  const water = clamp01(tile.resourceProfile.waterAccess);
  const channels = { plant, terrestrialFauna, aquatic, water };

  return {
    kind: "habitat_potential",
    tileId: tile.id,
    ...roundChannels(channels),
    ...aggregateEcologicalSupport(channels),
    accessibility: rawTileAccessibility(tile),
    seasonalReliability: round4(clamp01(tile.seasonalProfile.reliability)),
    substrateOnly: true,
    currentFoodAvailable: false,
    feedsHumanNutrition: false,
  };
}

/** Exact Technical layer from physical patches/stocks. Absence always stays zero. */
export function deriveCurrentLivingEcologyProjection(world: WorldState): CurrentLivingEcologyProjection {
  const cached = currentProjectionMemo.get(world as object);
  if (cached !== undefined) return cached;

  const geography = deriveFaunaStockGeography(world);
  const orderedTileIds = boundedWorldTileIds(world);
  const tiles: Record<string, CurrentLivingEcologyTileProjection> = {};
  let plantPatches = 0;

  for (const tileId of orderedTileIds) {
    const tileProjection = deriveCurrentLivingEcologyTile(world, tileId, geography);
    if (tileProjection === undefined) continue;
    tiles[tileId] = tileProjection;
    plantPatches += tileProjection.plantPatchCount;
  }

  // Geography stocks span several influence tiles. Report unique physical stocks,
  // not tile-stock coverage occurrences from the loop above.
  const terrestrialFaunaStocks = geography.stocks.filter(
    (stock) => stock.faunaClass === "animal_food" && stock.trophicRole !== "predator",
  ).length;
  const aquaticStocks = geography.stocks.filter(
    (stock) => stock.faunaClass === "aquatic_food" && stock.trophicRole !== "predator",
  ).length;
  const predators = geography.stocks.filter((stock) => stock.trophicRole === "predator").length;

  const projection: CurrentLivingEcologyProjection = {
    kind: "current_living_ecology",
    time: world.time,
    tiles: tiles as Readonly<Record<TileId, CurrentLivingEcologyTileProjection>>,
    projectedTileCount: orderedTileIds.length,
    omittedTileCount: Math.max(0, Object.keys(world.tiles).length - orderedTileIds.length),
    sourceTotals: { plantPatches, terrestrialFaunaStocks, aquaticStocks, predators },
    exactWorldTruth: true,
    technicalOnly: true,
    bounded: true,
    feedsHumanNutrition: false,
  };
  currentProjectionMemo.set(world as object, projection);
  return projection;
}

export function deriveCurrentLivingEcologyTile(
  world: WorldState,
  tileId: TileId,
  geography: FaunaStockGeography = deriveFaunaStockGeography(world),
): CurrentLivingEcologyTileProjection | undefined {
  const tile = world.tiles[tileId];
  if (tile === undefined) return undefined;

  const sourceContributions: EcologicalSourceContribution[] = [];
  const plantValues: number[] = [];
  const terrestrialValues: number[] = [];
  const aquaticValues: number[] = [];
  const depletionValues: number[] = [clamp01(world.tileDepletion?.[tileId] ?? 0)];
  const recoveryValues: number[] = [];
  const trophicValues: number[] = [];
  const predatorPressures: number[] = [];
  let plantPatchCount = 0;
  let terrestrialFaunaStockCount = 0;
  let aquaticStockCount = 0;
  let predatorStockCount = 0;

  const patches = derivePlantPatchesForTile(tile, world.time)
    // Match the canonical plant-food owner: materials/medicinal plants and the
    // aquatic-plant placeholder cannot become edible support in this projection.
    .filter((patch) => {
      const profile = getPlantClassProfile(patch.plantClassId);
      return profile.domain === "food" && profile.linkedResourceClassId === "generic_plant_food";
    })
    .sort((left, right) => String(left.patchId).localeCompare(String(right.patchId)));
  for (const patch of patches) {
    plantPatchCount += 1;
    const contribution = projectPlantSource(world, patch);
    plantValues.push(contribution.availability);
    depletionValues.push(contribution.depletion);
    recoveryValues.push(contribution.recoverySignal);
    sourceContributions.push(contribution);
  }

  const stocks = [...(geography.byTile.get(tileId) ?? [])]
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  for (const stock of stocks) {
    const dyn = getFaunaStockDynamic(world, stock.id);
    if (stock.trophicRole === "predator") {
      predatorStockCount += 1;
      predatorPressures.push(clamp01((dyn.predationPressure ?? 0) * 0.55 + (dyn.predatorCondition ?? 0.5) * 0.45));
      trophicValues.push(clamp01(dyn.predatorCondition ?? 0.5));
      continue;
    }

    const contribution = projectFaunaSource(world, stock);
    if (stock.faunaClass === "aquatic_food") {
      aquaticStockCount += 1;
      aquaticValues.push(contribution.availability);
    } else {
      terrestrialFaunaStockCount += 1;
      terrestrialValues.push(contribution.availability);
    }
    depletionValues.push(contribution.depletion);
    recoveryValues.push(contribution.recoverySignal);
    trophicValues.push(clamp01(dyn.forageSupportRatio ?? dyn.preySupportRatio ?? dyn.reproductiveCondition ?? 1));
    sourceContributions.push(contribution);
  }

  const conditions = getSeasonalTileConditions(world, tile);
  const channels: EcologicalSourceChannels = {
    plant: combineIndependentSignals(plantValues),
    terrestrialFauna: combineIndependentSignals(terrestrialValues),
    aquatic: combineIndependentSignals(aquaticValues),
    water: clamp01(1 - conditions.currentWaterStress),
  };

  return {
    kind: "current_living_ecology",
    tileId,
    season: world.time.season,
    ...roundChannels(channels),
    ...aggregateEcologicalSupport(channels),
    plantPatchCount,
    terrestrialFaunaStockCount,
    aquaticStockCount,
    predatorStockCount,
    accessibility: rawTileAccessibility(tile),
    depletion: round4(maxOrZero(depletionValues)),
    recoverySignal: round4(meanOrZero(recoveryValues)),
    trophicCondition: round4(trophicValues.length === 0 ? 0 : meanOrZero(trophicValues)),
    predatorPressure: round4(maxOrZero(predatorPressures)),
    sources: sourceContributions
      .sort((left, right) => right.availability - left.availability || left.sourceId.localeCompare(right.sourceId))
      .slice(0, MAX_CURRENT_SOURCES_PER_TILE),
    exactWorldTruth: true,
    technicalOnly: true,
    feedsHumanNutrition: false,
  };
}

/**
 * Band-facing layer. Deliberately takes no WorldState: unseen stocks, exact current
 * abundance, hidden predators, and future seasonality are impossible to access.
 */
export function deriveBandPerceivedEcologicalOpportunity(
  band: Band,
  time: WorldTime,
): BandPerceivedEcologicalOpportunityProjection {
  const memories = [...(band.resourceKnowledgeState?.patchMemories ?? [])]
    .sort((left, right) => String(left.patchId).localeCompare(String(right.patchId)));
  const memoriesByTile = indexMemoriesByTile(memories);
  const candidateTileIds = collectPerceivedCandidateTiles(band, memoriesByTile, time.tick);
  const tiles: Record<string, BandPerceivedEcologicalTileProjection> = {};

  for (const tileId of candidateTileIds.slice(0, MAX_PERCEIVED_ECOLOGICAL_TILES)) {
    tiles[tileId] = deriveBandPerceivedEcologicalTile(
      band,
      tileId,
      time,
      memoriesByTile.get(tileId) ?? [],
    );
  }

  return {
    kind: "band_perceived_opportunity",
    bandId: band.id,
    time,
    tiles: tiles as Readonly<Record<TileId, BandPerceivedEcologicalTileProjection>>,
    projectedTileCount: Math.min(candidateTileIds.length, MAX_PERCEIVED_ECOLOGICAL_TILES),
    omittedKnownTileCount: Math.max(0, candidateTileIds.length - MAX_PERCEIVED_ECOLOGICAL_TILES),
    fromBandKnowledgeOnly: true,
    bounded: true,
    feedsHumanNutrition: false,
  };
}

export function deriveBandPerceivedEcologicalTile(
  band: Band,
  tileId: TileId,
  time: WorldTime,
  suppliedMemories?: readonly ResourcePatchMemory[],
): BandPerceivedEcologicalTileProjection {
  const record = band.knowledge.observedTiles[tileId];
  const memories = suppliedMemories ?? findMemoriesForTile(band.resourceKnowledgeState?.patchMemories ?? [], tileId);
  if (record === undefined && memories.length === 0) return unknownPerceivedTile(tileId);

  const evidence: PerceivedEcologicalEvidence[] = [];
  const plantValues: number[] = [];
  const terrestrialValues: number[] = [];
  const aquaticValues: number[] = [];
  const waterValues: number[] = [];
  const confidenceValues: number[] = [];
  const evidenceTicks: number[] = [];

  if (record !== undefined) {
    const age = ageTicks(time.tick, record.lastObservedAt.tick);
    const confidence = staleConfidence(record.confidence, age);
    const observationRows: readonly [EcologicalSupportChannel, number][] = [
      ["plant", clamp01(record.observedRichness * 0.62)],
      ["terrestrial_fauna", clamp01(record.observedRichness * 0.34)],
      ["aquatic", clamp01(record.observedAquaticPotential)],
      ["water", clamp01(record.observedWaterAccess ?? 0)],
    ];
    for (const [channel, value] of observationRows) {
      evidence.push({
        sourceId: `tile:${String(tileId)}:${channel}`,
        sourceKind: "tile_observation",
        channel,
        rememberedOpportunity: round4(value),
        confidence: round4(confidence),
        observedTick: record.lastObservedAt.tick,
      });
      pushChannelValue(channel, value, plantValues, terrestrialValues, aquaticValues, waterValues);
    }
    confidenceValues.push(confidence);
    evidenceTicks.push(Number(record.lastObservedAt.tick));
  }

  for (const memory of [...memories].sort((left, right) => String(left.patchId).localeCompare(String(right.patchId)))) {
    const channel = memoryChannel(memory);
    if (channel === undefined) continue;
    const age = ageTicks(time.tick, memory.lastNotedTick);
    const confidence = staleConfidence(memoryConfidence(memory), age);
    const opportunity = rememberedPatchOpportunity(memory, time.season);
    evidence.push({
      sourceId: String(memory.patchId),
      sourceKind: "resource_memory",
      channel,
      rememberedOpportunity: opportunity,
      confidence: round4(confidence),
      observedTick: memory.lastNotedTick,
    });
    pushChannelValue(channel, opportunity, plantValues, terrestrialValues, aquaticValues, waterValues);
    confidenceValues.push(confidence);
    evidenceTicks.push(Number(memory.lastNotedTick));
  }

  const channels: EcologicalSourceChannels = {
    plant: combineIndependentSignals(plantValues),
    terrestrialFauna: combineIndependentSignals(terrestrialValues),
    aquatic: combineIndependentSignals(aquaticValues),
    water: combineIndependentSignals(waterValues),
  };
  const latestEvidenceTick = evidenceTicks.length === 0 ? Number(time.tick) : Math.max(...evidenceTicks);
  const age = Math.max(0, Number(time.tick) - latestEvidenceTick);
  const confidence = meanOrZero(confidenceValues);

  return {
    kind: "band_perceived_opportunity",
    tileId,
    known: true,
    ...roundChannels(channels),
    ...aggregateEcologicalSupport(channels),
    confidence: round4(confidence),
    uncertainty: round4(clamp01(1 - confidence)),
    ageTicks: age,
    staleness: classifyStaleness(age),
    evidence: evidence
      .sort((left, right) => right.confidence - left.confidence || left.sourceId.localeCompare(right.sourceId))
      .slice(0, MAX_PERCEIVED_EVIDENCE_PER_TILE),
    approximateOnly: true,
    fromBandKnowledgeOnly: true,
    exactCurrentStockHidden: true,
    feedsHumanNutrition: false,
  };
}

export interface EcologicalProjectionAuditResult {
  readonly passed: boolean;
  readonly issueCount: number;
  readonly issues: readonly string[];
}

/** Focused invariant audit for callers and deterministic benchmark scripts. */
export function auditEcologicalProjection(
  projection: HabitatPotentialProjection | CurrentLivingEcologyProjection | BandPerceivedEcologicalOpportunityProjection,
): EcologicalProjectionAuditResult {
  const issues: string[] = [];
  for (const tile of Object.values(projection.tiles).sort((left, right) => String(left.tileId).localeCompare(String(right.tileId)))) {
    for (const [name, value] of Object.entries({
      plant: tile.plant,
      terrestrialFauna: tile.terrestrialFauna,
      aquatic: tile.aquatic,
      water: tile.water,
      foodSupportScalar: tile.foodSupportScalar,
      ecologicalSupportScalar: tile.ecologicalSupportScalar,
    })) {
      if (!Number.isFinite(value) || value < 0 || value > 1) issues.push(`${String(tile.tileId)}:${name}:out_of_bounds`);
    }
    if (tile.feedsHumanNutrition !== false) issues.push(`${String(tile.tileId)}:nutrition_guard_missing`);
    if (tile.kind === "current_living_ecology") {
      if (tile.plantPatchCount === 0 && tile.plant !== 0) issues.push(`${String(tile.tileId)}:plant_without_patch`);
      if (tile.terrestrialFaunaStockCount === 0 && tile.terrestrialFauna !== 0) issues.push(`${String(tile.tileId)}:fauna_without_stock`);
      if (tile.aquaticStockCount === 0 && tile.aquatic !== 0) issues.push(`${String(tile.tileId)}:aquatic_without_stock`);
    }
  }

  return { passed: issues.length === 0, issueCount: issues.length, issues };
}

function projectPlantSource(world: WorldState, patch: PlantPatch): EcologicalSourceContribution {
  const state = world.plantPatchState?.[String(patch.patchId)];
  const depletion = clamp01(state?.depletion ?? 0);
  // `currentAbundance` already contains base abundance × the natural lifecycle /
  // seasonal modifier. Multiplying baseAbundance again would square the substrate.
  const seasonallyAvailable = plantIsPhysicallyPresentThisSeason(patch)
    ? clamp01(patch.currentAbundance)
    : 0;
  const seasonalFactor = patch.baseAbundance <= 0
    ? 0
    : clamp01(seasonallyAvailable / patch.baseAbundance);
  const availability = clamp01(seasonallyAvailable * (1 - depletion));
  const recoverySignal = clamp01(
    (patch.lifecycleState === "recovering" || patch.abundanceTrend === "rising" ? 0.55 : 0) +
      patch.naturalRecoveryProgress * 0.45,
  );
  return {
    sourceId: String(patch.patchId),
    sourceClass: patch.plantClassId,
    channel: "plant",
    availability: round4(availability),
    depletion: round4(depletion),
    seasonalFactor: round4(seasonalFactor),
    recoverySignal: round4(recoverySignal),
  };
}

function projectFaunaSource(world: WorldState, stock: FaunaStockGeo): EcologicalSourceContribution {
  const dyn = getFaunaStockDynamic(world, stock.id);
  const seasonalFactor = seasonalAvailabilityFactor(stock, world.time.season, false);
  const disturbanceFactor = clamp01(1 - dyn.disturbance * 0.58);
  const availability = clamp01(stock.carryingCapacity * dyn.abundance * seasonalFactor * disturbanceFactor);
  const depletion = clamp01(Math.max(1 - dyn.abundance, dyn.disturbance));
  const recoverySignal = clamp01(
    (1 - dyn.abundance) *
      (1 - dyn.disturbance) *
      (dyn.reproductiveCondition ?? 1) *
      (0.5 + (dyn.habitatReturn ?? 0.5) * 0.5),
  );
  return {
    sourceId: String(stock.id),
    sourceClass: stock.kind,
    channel: stock.faunaClass === "aquatic_food" ? "aquatic" : "terrestrial_fauna",
    availability: round4(availability),
    depletion: round4(depletion),
    seasonalFactor: round4(seasonalFactor),
    recoverySignal: round4(recoverySignal),
  };
}

function plantIsPhysicallyPresentThisSeason(patch: PlantPatch): boolean {
  switch (patch.currentSeasonalAvailability) {
    case "active":
    case "low":
    case "unreliable":
      return true;
    case "absent":
    case "dormant":
      return false;
  }
}

function indexMemoriesByTile(memories: readonly ResourcePatchMemory[]): ReadonlyMap<TileId, readonly ResourcePatchMemory[]> {
  const mutable = new Map<TileId, ResourcePatchMemory[]>();
  for (const memory of memories) {
    for (const tileId of uniqueSortedTileIds([memory.approximateTile, ...memory.linkedTiles])) {
      mutable.set(tileId, [...(mutable.get(tileId) ?? []), memory]);
    }
  }
  return mutable;
}

function collectPerceivedCandidateTiles(
  band: Band,
  memoriesByTile: ReadonlyMap<TileId, readonly ResourcePatchMemory[]>,
  currentTick: TickNumber,
): readonly TileId[] {
  const ids = uniqueSortedTileIds([
    ...(Object.keys(band.knowledge.observedTiles) as TileId[]),
    ...memoriesByTile.keys(),
  ]);
  return ids.sort((left, right) => {
    const leftRecency = perceivedTileRecency(band.knowledge.observedTiles[left], memoriesByTile.get(left), currentTick);
    const rightRecency = perceivedTileRecency(band.knowledge.observedTiles[right], memoriesByTile.get(right), currentTick);
    return rightRecency - leftRecency || String(left).localeCompare(String(right));
  });
}

function perceivedTileRecency(
  record: KnownTileRecord | undefined,
  memories: readonly ResourcePatchMemory[] | undefined,
  currentTick: TickNumber,
): number {
  let latest = record === undefined ? -Infinity : Number(record.lastObservedAt.tick);
  for (const memory of memories ?? []) latest = Math.max(latest, Number(memory.lastNotedTick));
  return Number.isFinite(latest) ? latest : Number(currentTick) - 1_000_000;
}

function findMemoriesForTile(memories: readonly ResourcePatchMemory[], tileId: TileId): readonly ResourcePatchMemory[] {
  return memories
    .filter((memory) => memory.approximateTile === tileId || memory.linkedTiles.includes(tileId))
    .sort((left, right) => String(left.patchId).localeCompare(String(right.patchId)));
}

function memoryChannel(memory: ResourcePatchMemory): EcologicalSupportChannel | undefined {
  switch (String(memory.resourceClassId)) {
    case "generic_plant_food":
    case "fallback_food": return "plant";
    case "animal_food": return "terrestrial_fauna";
    case "aquatic_food": return "aquatic";
    case "water_resource": return "water";
    default: return undefined;
  }
}

function rememberedPatchOpportunity(memory: ResourcePatchMemory, season: Season): number {
  const stateFactor = {
    unknown: 0,
    suspected: 0.24,
    observed: 0.48,
    used: 0.68,
    reliable: 0.88,
    risky: 0.24,
    depleted: 0.1,
    seasonally_bad: 0.16,
  }[memory.state];
  const rememberedYield = clamp01(memory.useHistory.lastYieldEstimate);
  const observedPlant = clamp01(memory.plantObservation?.observedAvailabilityHint ?? 0);
  const seasonFactor = memory.seasonality.badSeasons.includes(season)
    ? 0.35
    : memory.seasonality.bestSeasons.includes(season)
      ? 1
      : 0.72;
  const depletionPenalty = clamp01(memory.useHistory.depletionMemory) * 0.58;
  return round4(clamp01((stateFactor * 0.48 + rememberedYield * 0.38 + observedPlant * 0.14) * seasonFactor - depletionPenalty));
}

function memoryConfidence(memory: ResourcePatchMemory): number {
  return clamp01(
    memory.confidence.presenceConfidence * 0.38 +
      memory.confidence.yieldConfidence * 0.28 +
      memory.confidence.seasonConfidence * 0.18 +
      memory.confidence.accessConfidence * 0.1 +
      memory.confidence.recoveryConfidence * 0.06,
  );
}

function unknownPerceivedTile(tileId: TileId): BandPerceivedEcologicalTileProjection {
  return {
    kind: "band_perceived_opportunity",
    tileId,
    known: false,
    plant: 0,
    terrestrialFauna: 0,
    aquatic: 0,
    water: 0,
    foodSupportScalar: 0,
    ecologicalSupportScalar: 0,
    confidence: 0,
    uncertainty: 1,
    ageTicks: null,
    staleness: "unknown",
    evidence: [],
    approximateOnly: true,
    fromBandKnowledgeOnly: true,
    exactCurrentStockHidden: true,
    feedsHumanNutrition: false,
  };
}

function rawTileAccessibility(tile: Tile): number {
  if (tile.isAquatic) return 0;
  return round4(clamp01(1 - Math.max(0, tile.movementCost - 1) / 3));
}

function boundedWorldTileIds(world: WorldState): readonly TileId[] {
  return (Object.keys(world.tiles) as TileId[])
    .sort((left, right) => String(left).localeCompare(String(right)))
    .slice(0, MAX_WORLD_ECOLOGICAL_PROJECTION_TILES);
}

function pushChannelValue(
  channel: EcologicalSupportChannel,
  value: number,
  plant: number[],
  terrestrial: number[],
  aquatic: number[],
  water: number[],
): void {
  if (channel === "plant") plant.push(value);
  else if (channel === "terrestrial_fauna") terrestrial.push(value);
  else if (channel === "aquatic") aquatic.push(value);
  else water.push(value);
}

function combineIndependentSignals(values: readonly number[]): number {
  let absence = 1;
  for (const value of values) absence *= 1 - clamp01(value);
  return round4(1 - absence);
}

function roundChannels(channels: EcologicalSourceChannels): EcologicalSourceChannels {
  return {
    plant: round4(clamp01(channels.plant)),
    terrestrialFauna: round4(clamp01(channels.terrestrialFauna)),
    aquatic: round4(clamp01(channels.aquatic)),
    water: round4(clamp01(channels.water)),
  };
}

function staleConfidence(confidence: number, age: number): number {
  const multiplier = age <= 4 ? 1 : age <= 12 ? 0.88 : age <= 32 ? 0.68 : 0.45;
  return clamp01(confidence * multiplier);
}

function classifyStaleness(age: number): PerceivedStaleness {
  if (age <= 4) return "fresh";
  if (age <= 12) return "aging";
  if (age <= 32) return "stale";
  return "very_stale";
}

function ageTicks(now: TickNumber, then: TickNumber): number {
  return Math.max(0, Number(now) - Number(then));
}

function uniqueSortedTileIds(tileIds: readonly TileId[]): TileId[] {
  return [...new Set(tileIds)].sort((left, right) => String(left).localeCompare(String(right)));
}

function maxOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.max(...values);
}

function meanOrZero(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
