// Fauna / Aquatic finite-stock layer (checkpoint FAUNA/AQUATIC-1).
//
// WHY: until now `animal_food` and `aquatic_food` were pure DECOMPOSITION shares
// of a band's observed habitat potential (resourceClasses.ts) — fungible food
// numbers with no finite, place-specific population behind them. A band could
// hunt a delta forever as if it were day one; "fishing" and "hunting" were
// labels. This module gives those classes a bounded, causal, finite stock
// substrate: summarized animal/aquatic POPULATIONS by zone, with seasonality,
// recovery, mobility, human-pressure depletion, and avoidance — NOT one agent
// per deer or fish.
//
// ARCHITECTURE (mirrors M0.14 tileDepletion exactly):
//   * STATIC GEOGRAPHY (`FaunaStockGeo`) — where stocks live, their kind,
//     habitat, anchor, influence tiles, carrying capacity, seasonality, mobility.
//     A PURE function of `world.tiles` + seed, memoized by the (immutable) tiles
//     reference so it is derived ONCE per world. Bounded/sparse (caps + spacing),
//     never one-per-tile.
//   * DYNAMIC STATE (`FaunaStockDynamic`) — current abundance (fraction of
//     carrying capacity) + disturbance/avoidance. SPARSE physical truth stored
//     on `world.faunaStocks`; absent ⇒ baseline (full). Advanced ONCE per season
//     from the shared-catchment extraction index plus in-season hunting/fishing
//     trip depletion, recovering when rested. Deterministic, bounded, capped.
//
// ANTI-OMNISCIENCE: this is PHYSICAL TRUTH, like tile wear. Bands experience it
// through realized support (the fauna multiplier in carryingCapacity) and
// through what they OBSERVE on trips/scouts (uncertain SIGNS, never a remote
// exact read). Stock geography is never handed to a band; knowledge lives in the
// band's own patch memory / scout signs / reports. No band can TARGET a hidden
// stock it has not discovered.
//
// HARD SCOPE LOCK: no individual-animal agents and no domestication/livestock/
// agriculture/storage. LIVING-ECOLOGY-1B adds only bounded aggregate forage and
// predator-prey coupling. No unseeded randomness, no any, no UI imports.

import { getSharedCatchmentIndex } from "./sharedCatchment";
import { consumePlantForage, forageClassesForTrophicRole, type PlantForageClaim } from "./plantStock";
import type { TickContextCache } from "./contextCache";
import { classifyForestCoverForTile, estimateForestSuitability } from "./forestPatches";
import type { ResourceClassContribution } from "./resourceClasses";
import type { ReasonId, RegionId, Season, TickNumber, TileId } from "../core/types";
import type { Tile, WorldState } from "../world/types";

export type FaunaStockId = string & { readonly __faunaStockId: "FaunaStockId" };

// The two food resource classes a stock backs (subset of ResourceClassId).
export type FaunaClass = "animal_food" | "aquatic_food";

export type FaunaStockKind =
  // aquatic
  | "lake_fish"
  | "river_reach_fish"
  | "delta_wetland_fish"
  | "seasonal_fish_run"
  | "shellfish_reedbed"
  // terrestrial
  | "large_game"
  | "medium_game"
  | "small_game"
  | "waterfowl"
  | "upland_game"
  | "forest_edge_game"
  | "small_predator"
  | "large_predator";

export type FaunaTrophicRole = "aquatic_prey" | "herbivore" | "omnivore" | "predator";

export type FaunaHabitatType =
  | "lake"
  | "river_reach"
  | "delta_wetland"
  | "coast_reedbed"
  | "open_valley"
  | "open_plain"
  | "river_meadow"
  | "forest_edge"
  | "wet_woodland"
  | "scrub_edge"
  | "dense_cover"
  | "upland_slope"
  | "dry_country";

export type FaunaRoutineProfile =
  | "schooling_aquatic"
  | "migratory_herd"
  | "cover_forager"
  | "camp_scavenger";

export type FaunaRoutinePhase =
  | "feeding"
  | "water_seeking"
  | "resting_cover"
  | "roaming"
  | "habitat_return"
  | "migration"
  | "young_protection"
  | "flight"
  | "camp_following";

export interface FaunaSeasonality {
  readonly peakSeasons: readonly Season[];
  readonly leanSeasons: readonly Season[];
  // 0..1 — how strongly availability swings between peak and lean.
  readonly amplitude: number;
}

// Static placement + traits of one summarized stock zone. Never mutated.
export interface FaunaStockGeo {
  readonly id: FaunaStockId;
  readonly faunaClass: FaunaClass;
  readonly trophicRole: FaunaTrophicRole;
  readonly kind: FaunaStockKind;
  readonly habitat: FaunaHabitatType;
  readonly anchorTileId: TileId;
  readonly regionId: RegionId;
  readonly influenceTileIds: readonly TileId[];
  // Ceiling fauna richness of the zone (0..1), static. Scales trip returns + sign.
  readonly carryingCapacity: number;
  // 0..1 habitat-fit score used at placement time. Static, explanatory only.
  readonly habitatSuitability: number;
  readonly habitatBasis: readonly string[];
  // Per-season regrowth fraction toward carrying capacity when rested.
  readonly recoveryRate: number;
  readonly seasonality: FaunaSeasonality;
  // 0..1 — how much the stock moves/avoids under pressure (terrestrial > aquatic).
  readonly mobility: number;
  // 0..1 — how strongly human pressure depletes/scatters it.
  readonly pressureSensitivity: number;
  // 0..1 — how readable its tracks/signs are to scouts/hunters.
  readonly detectability: number;
  // 0..1 — bounded hunting/fishing risk placeholder (injury / dangerous water).
  readonly riskPlaceholder: number;
  readonly routineProfile: FaunaRoutineProfile;
  readonly waterDependence: number;
  readonly herdTendency: number;
  readonly flightResponse: number;
  readonly aggressionDefense: number;
  readonly habituationPotential: number;
  readonly managementSuitability: number;
  readonly reproductiveRate: number;
}

// Dynamic, persisted, sparse. `abundance` is a FRACTION of carryingCapacity
// (1 = full). Absent entry ⇒ treated as baseline { abundance: 1, disturbance: 0 }.
export interface FaunaStockDynamic {
  readonly abundance: number; // [0, 1]
  readonly disturbance: number; // [0, 1]
  readonly lastPressureTick: TickNumber;
  readonly cumulativePressure: number; // debug only
  // ROUTINES-2: sparse stock-level behavior, never individual animals.
  readonly routinePhase?: FaunaRoutinePhase;
  readonly herdCohesion?: number;
  readonly humanWariness?: number;
  readonly habituation?: number;
  readonly campProximity?: number;
  readonly habitatReturn?: number;
  readonly migrationPressure?: number;
  readonly youngProtection?: number;
  readonly reproductiveCondition?: number;
  readonly managementStress?: number;
  readonly forageSupportRatio?: number;
  readonly feedingPressure?: number;
  readonly forageStress?: number;
  readonly predationPressure?: number;
  readonly preyRemoved?: number;
  readonly predatorCondition?: number;
  readonly preySupportRatio?: number;
  readonly trophicTargetId?: string;
  readonly relocationPressure?: number;
}

export interface FaunaStockGeography {
  readonly stocks: readonly FaunaStockGeo[];
  readonly byId: ReadonlyMap<FaunaStockId, FaunaStockGeo>;
  readonly byTile: ReadonlyMap<TileId, readonly FaunaStockGeo[]>;
}

// Resolved per-tile fauna effect on realized support (consumed by carryingCapacity).
export interface FaunaTileSupportEffect {
  readonly covered: boolean;
  readonly animalFactor: number; // [FACTOR_FLOOR, 1] — 1 = healthy, lower = depleted/lean
  readonly aquaticFactor: number;
  readonly animalLoss: number; // support fraction lost to animal-stock shortfall
  readonly aquaticLoss: number;
  readonly faunaMultiplier: number; // [1 - FAUNA_LOSS_CAP, 1]
}

export interface FaunaTripStockTraceBase {
  readonly stockId: string;
  readonly faunaClass: FaunaClass;
  readonly kind: FaunaStockKind;
  readonly habitat: FaunaHabitatType;
  readonly anchorTileId: TileId;
  readonly habitatSuitability: number;
  readonly habitatBasis: readonly string[];
  readonly expectedReturnFactor: number;
  readonly currentAbundance: number;
  readonly disturbance: number;
  readonly seasonalAvailability: number;
  readonly pressure: number;
  readonly recoveryRate: number;
  readonly mobility: number;
  readonly pressureSensitivity: number;
  readonly detectability: number;
  readonly risk: number;
  readonly laborAccessCost: number;
  readonly rawSource: string;
  readonly reasonIds: readonly ReasonId[];
}

export interface FaunaFoodHarvestResolution {
  readonly world: WorldState;
  readonly sourceId?: string;
  readonly sourceClass?: string;
  readonly sourceFound: boolean;
  readonly stockId?: FaunaStockId;
  readonly stockKind?: FaunaStockKind;
  readonly physicalAvailability: number;
  readonly harvestedAmount: number;
  readonly depletionApplied: number;
  readonly processingLossRate: number;
  readonly failureReason?: "activity_failed" | "physical_source_absent" | "physically_exhausted";
}

// --- tuning constants (all bounded, conservative; calibrated at 100/300/500y) ---

// Geography generation.
const ANCHOR_SPACING = 4; // min ~grid separation between same-class anchors
const INFLUENCE_RADIUS = 2;
const INFLUENCE_TILE_CAP = 13;
// TOTAL fauna-stock ceiling — bounds ALL physical fauna stocks (prey + predators)
// regardless of map size. Predators are reserved WITHIN this ceiling, never
// appended on top of it (see computeFaunaStockGeography).
export const GLOBAL_STOCK_CAP = 260; // hard ceiling regardless of map size
const STOCKS_PER_TILE_DENSITY = 22; // ~1 candidate per N tiles before caps
const REGION_STOCK_CAP_BASE = 2;
const REGION_STOCK_TILES_PER = 14;
const SUITABILITY_THRESHOLD = 0.34;

// Dynamics.
// Direct human harvesting cannot draw a stock below this reserve (it is NOT a
// survival guarantee — trophic/forage/predation/natural pressure can still push
// a weakened stock below it toward local collapse).
export const HUMAN_HARVEST_RESERVE = 0.08;
const DEPLETION_STRENGTH = 0.5; // how hard pressure pulls abundance down per season
const GENERAL_PRESSURE_WEIGHT = 0.7; // camp/catchment occupation
const DISTURB_GAIN = 0.5;
const DISTURB_DECAY = 0.22;
const DISTURB_SUPPRESS = 0.35; // disturbance suppresses realized abundance factor
// Entries within this of baseline are dropped from the sparse record. MUST stay
// small: a too-large epsilon would drop sub-epsilon depletion every season and
// prevent multi-season accumulation toward a depleted equilibrium.
// Mean per-tile catchment claim over a stock zone that ≈ full general (camp/
// occupation) pressure. A delta core foraged by a large shared band for decades
// drives sustained fauna decline; an abandoned zone rebounds. The SUPPORT impact
// is independently capped (FAUNA_LOSS_CAP), so deeper depletion never craters
// population — it only makes crowded cores visibly poorer fauna grounds.
const CLAIM_PRESSURE_NORM = 2.2;
const TRIP_DEPLETION_PULL = 0.22; // per-trip abundance pull (× sensitivity × intensity)
const FAUNA_HARVEST_SUPPORT_SCALE = 3.2;
const FORAGE_DEMAND_SCALE = 0.085;
const FORAGE_SHORTAGE_LOSS = 0.22;
const PREDATOR_DEMAND_SCALE = 0.055;
const PREDATOR_SHORTAGE_LOSS = 0.2;
const PREDATION_CANDIDATE_CAP = 6;
// Predator sub-cap — at most this many predator stocks, reserved inside the total
// GLOBAL_STOCK_CAP. Map-size independent; predators are never appended unbounded.
export const PREDATOR_STOCK_CAP = 24;

// Support coupling.
const FACTOR_FLOOR = 0.45; // worst-case realized fauna factor for a covered tile
const SEASONAL_FACTOR_FLOOR = 0.78; // lean-season floor for the SUPPORT multiplier
const FAUNA_LOSS_CAP = 0.18; // max fraction of a tile's food support fauna can remove

// Trip return shaping (pulse allowed above 1 for seasonal runs — returns only,
// never the support multiplier, so carrying capacity is never inflated).
const RUN_PULSE_BONUS = 0.35;

// --- deterministic integer hashing (no unseeded randomness) ---

function hashParts(seed: string, parts: readonly (string | number)[]): number {
  let hash = 2166136261 ^ hashString(seed);

  for (const part of parts) {
    if (typeof part === "number") {
      hash ^= part | 0;
      hash = Math.imul(hash, 16777619);
    } else {
      for (let index = 0; index < part.length; index += 1) {
        hash ^= part.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
    }
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 2246822519);
  }

  return hash >>> 0;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

// Deterministic [0,1) from seed + parts.
function hashUnit(seed: string, parts: readonly (string | number)[]): number {
  return hashParts(seed, parts) / 4294967296;
}

// --- geography (memoized by world.tiles) ---

const geographyMemo = new WeakMap<object, FaunaStockGeography>();

export function deriveFaunaStockGeography(world: WorldState): FaunaStockGeography {
  const cached = geographyMemo.get(world.tiles);

  if (cached !== undefined) {
    return cached;
  }

  const value = computeFaunaStockGeography(world);
  geographyMemo.set(world.tiles, value);

  return value;
}

interface StockCandidate {
  readonly kind: FaunaStockKind;
  readonly habitat: FaunaHabitatType;
  readonly faunaClass: FaunaClass;
  readonly suitability: number;
}

function computeFaunaStockGeography(world: WorldState): FaunaStockGeography {
  const seed = String(world.seed);
  const tileIds = Object.keys(world.tiles).sort() as TileId[];
  const globalCap = Math.min(GLOBAL_STOCK_CAP, Math.max(8, Math.floor(tileIds.length / STOCKS_PER_TILE_DENSITY)) * 2);
  const occupiedCells = new Set<string>();
  const regionCounts = new Map<RegionId, number>();
  const stocks: FaunaStockGeo[] = [];

  for (const tileId of tileIds) {
    if (stocks.length >= globalCap) {
      break;
    }

    const tile = world.tiles[tileId];

    if (tile === undefined) {
      continue;
    }

    // At most one aquatic + one terrestrial anchor per tile (best candidate each).
    const candidates = classifyTileFaunaCandidates(tile);

    for (const candidate of candidates) {
      if (stocks.length >= globalCap) {
        break;
      }

      if (candidate.suitability < SUITABILITY_THRESHOLD) {
        continue;
      }

      const cellKey = `${candidate.faunaClass}:${Math.floor(tile.coord.x / ANCHOR_SPACING)}:${Math.floor(
        tile.coord.y / ANCHOR_SPACING,
      )}`;

      if (occupiedCells.has(cellKey)) {
        continue;
      }

      const regionCap = REGION_STOCK_CAP_BASE + Math.floor((world.regions[tile.regionId]?.tileIds.length ?? 0) / REGION_STOCK_TILES_PER);

      if ((regionCounts.get(tile.regionId) ?? 0) >= regionCap) {
        continue;
      }

      occupiedCells.add(cellKey);
      regionCounts.set(tile.regionId, (regionCounts.get(tile.regionId) ?? 0) + 1);
      stocks.push(buildStockGeo(world, tile, candidate, seed));
    }
  }

  // Sparse predator representation: one stock for selected prey-rich regions,
  // anchored on an actual terrestrial prey stock. This is physical geography,
  // not a decorative sign profile, and remains bounded independently of map size.
  const preyAnchors = stocks
    .filter((stock) => stock.faunaClass === "animal_food" && stock.trophicRole !== "predator")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const predatorRegions = new Set<RegionId>();
  for (const prey of preyAnchors) {
    if (predatorRegions.size >= PREDATOR_STOCK_CAP || predatorRegions.has(prey.regionId)) continue;
    const tile = world.tiles[prey.anchorTileId];
    if (tile === undefined) continue;
    const selector = hashUnit(seed, [String(prey.id), "predator-anchor"]);
    if (selector > 0.42 && prey.carryingCapacity < 0.55) continue;
    const candidate: StockCandidate = {
      kind: prey.kind === "large_game" || prey.kind === "medium_game" ? "large_predator" : "small_predator",
      habitat: prey.habitat,
      faunaClass: "animal_food",
      suitability: clamp(0.34 + prey.habitatSuitability * 0.45, 0, 0.82),
    };
    stocks.push(buildStockGeo(world, tile, candidate, seed));
    predatorRegions.add(prey.regionId);
  }

  // Enforce the TOTAL cap contract: prey + predators must fit inside
  // GLOBAL_STOCK_CAP. If appending predators pushed the total over the ceiling,
  // deterministically drop the lowest-carrying-capacity NON-predator stocks
  // (stable by id) so predators are reserved within the cap rather than erased
  // and the total never exceeds the declared ceiling. Predator-anchor prey have
  // high carrying capacity (see gate above) and are retained.
  let cappedStocks: readonly FaunaStockGeo[] = stocks;
  if (stocks.length > GLOBAL_STOCK_CAP) {
    const predators = stocks.filter((stock) => stock.trophicRole === "predator");
    const keptPreyIds = new Set(
      stocks
        .filter((stock) => stock.trophicRole !== "predator")
        .sort((a, b) => b.carryingCapacity - a.carryingCapacity || String(a.id).localeCompare(String(b.id)))
        .slice(0, Math.max(0, GLOBAL_STOCK_CAP - predators.length))
        .map((stock) => stock.id),
    );
    cappedStocks = stocks.filter((stock) => stock.trophicRole === "predator" || keptPreyIds.has(stock.id));
  }

  const byId = new Map<FaunaStockId, FaunaStockGeo>();
  const byTile = new Map<TileId, FaunaStockGeo[]>();

  for (const stock of cappedStocks) {
    byId.set(stock.id, stock);

    for (const tileId of stock.influenceTileIds) {
      const list = byTile.get(tileId);

      if (list === undefined) {
        byTile.set(tileId, [stock]);
      } else {
        list.push(stock);
      }
    }
  }

  return { stocks: cappedStocks, byId, byTile };
}

// Habitat → best aquatic candidate + best terrestrial candidate for this tile.
function classifyTileFaunaCandidates(tile: Tile): readonly StockCandidate[] {
  const out: StockCandidate[] = [];
  const aquatic = bestAquaticCandidate(tile);
  const terrestrial = bestTerrestrialCandidate(tile);

  if (aquatic !== undefined) {
    out.push(aquatic);
  }

  if (terrestrial !== undefined) {
    out.push(terrestrial);
  }

  return out;
}

function bestAquaticCandidate(tile: Tile): StockCandidate | undefined {
  const aq = clamp01(tile.resourceProfile.aquaticPotential);
  const water = clamp01(tile.resourceProfile.waterAccess);
  const reliability = clamp01(tile.seasonalProfile.reliability);

  if (aq < 0.18 && !tile.isAquatic && !tile.isFloodplain && !tile.isMarshChannel) {
    return undefined;
  }

  // Delta / wetland fish: richest, density-but-sensitive.
  if (tile.isEstuary || tile.isMarshChannel || tile.isFloodplain || tile.terrainKind === "wetlands") {
    return { kind: "delta_wetland_fish", habitat: "delta_wetland", faunaClass: "aquatic_food", suitability: clamp01(0.55 + aq * 0.4 + water * 0.1) };
  }

  // Lake fish.
  if (tile.terrainKind === "lake" || (tile.isAquatic && !tile.isRiver && !tile.isCoastal)) {
    return { kind: "lake_fish", habitat: "lake", faunaClass: "aquatic_food", suitability: clamp01(0.5 + aq * 0.45) };
  }

  // Seasonal fish run on a strongly seasonal river reach; otherwise steady reach.
  if (tile.isRiver || tile.isRiverbank || tile.isConfluence) {
    const seasonal = clamp01(tile.seasonalProfile.seasonalVariance);
    if (seasonal > 0.5 && tile.seasonalProfile.peakSeasons.length > 0) {
      return { kind: "seasonal_fish_run", habitat: "river_reach", faunaClass: "aquatic_food", suitability: clamp01(0.42 + aq * 0.35 + seasonal * 0.2) };
    }
    return { kind: "river_reach_fish", habitat: "river_reach", faunaClass: "aquatic_food", suitability: clamp01(0.4 + aq * 0.4 + reliability * 0.15) };
  }

  // Coastal shellfish / reedbed fallback aquatic.
  if (tile.isCoastal || (tile.isAquatic && water > 0.5)) {
    return { kind: "shellfish_reedbed", habitat: "coast_reedbed", faunaClass: "aquatic_food", suitability: clamp01(0.36 + aq * 0.3 + water * 0.2) };
  }

  return undefined;
}

function bestTerrestrialCandidate(tile: Tile): StockCandidate | undefined {
  if (tile.isAquatic) {
    return undefined; // open water hosts the aquatic stock, not land game
  }

  const richness = clamp01(tile.resourceProfile.baseRichness);
  const water = clamp01(tile.resourceProfile.waterAccess);
  const elevation = clamp01(tile.elevation);
  const nearWater = water > 0.45 || tile.isRiverbank || tile.isFloodplain;
  const forestCover = classifyForestCoverForTile(tile);
  const forestSuitability = estimateForestSuitability(tile);

  // Waterfowl near wetlands / lake / delta shores.
  if ((tile.terrainKind === "wetlands" || tile.isMarshChannel || tile.isFloodplain) && nearWater) {
    return { kind: "waterfowl", habitat: "delta_wetland", faunaClass: "animal_food", suitability: clamp01(0.5 + water * 0.3 + richness * 0.2) };
  }

  // Forest / scrub / wet-edge cover creates habitat for boar-like, deer-like,
  // small-game, and predator-cover future hooks without deep fauna ecology.
  if (forestCover === "dense_woodland" || forestCover === "wet_forest_edge" || forestCover === "riparian_trees") {
    return {
      kind: "forest_edge_game",
      habitat: forestCover === "dense_woodland" ? "dense_cover" : "wet_woodland",
      faunaClass: "animal_food",
      suitability: clamp01(0.36 + forestSuitability * 0.38 + richness * 0.16 + (nearWater ? 0.08 : 0)),
    };
  }

  if (forestCover === "forest_edge" || forestCover === "open_woodland" || forestCover === "scrub_tree_mix") {
    return {
      kind: forestCover === "scrub_tree_mix" && richness < 0.52 ? "small_game" : "forest_edge_game",
      habitat: forestCover === "scrub_tree_mix" ? "scrub_edge" : "forest_edge",
      faunaClass: "animal_food",
      suitability: clamp01(0.34 + forestSuitability * 0.34 + richness * 0.2 + (nearWater ? 0.06 : 0)),
    };
  }

  // Upland game on slopes / mountains.
  if (tile.terrainKind === "mountains" || (tile.terrainKind === "hills" && elevation > 0.5)) {
    return { kind: "upland_game", habitat: "upland_slope", faunaClass: "animal_food", suitability: clamp01(0.34 + richness * 0.3 + elevation * 0.2) };
  }

  // Large game along water / open river-valley edges.
  if (
    (tile.terrainKind === "river_valley" || tile.terrainKind === "plains") &&
    nearWater &&
    richness > 0.4
  ) {
    return { kind: "large_game", habitat: tile.terrainKind === "plains" ? "river_meadow" : "open_valley", faunaClass: "animal_food", suitability: clamp01(0.46 + richness * 0.35 + water * 0.15) };
  }

  // Dry country: sparse but present, seasonal.
  if (tile.terrainKind === "desert" || tile.terrainKind === "tundra") {
    return { kind: "small_game", habitat: "dry_country", faunaClass: "animal_food", suitability: clamp01(0.3 + richness * 0.4) };
  }

  // Medium / small game broadly distributed elsewhere.
  if (richness > 0.32) {
    const kind: FaunaStockKind = richness > 0.55 ? "medium_game" : "small_game";
    return {
      kind,
      habitat: tile.terrainKind === "plains" ? "open_plain" : "open_valley",
      faunaClass: "animal_food",
      suitability: clamp01(0.32 + richness * 0.4 + water * 0.1),
    };
  }

  return undefined;
}

function buildStockGeo(world: WorldState, tile: Tile, candidate: StockCandidate, seed: string): FaunaStockGeo {
  const traits = KIND_TRAITS[candidate.kind];
  const jitter = hashUnit(seed, [String(tile.id), candidate.kind]);
  const carryingCapacity = clamp(traits.ccBase * (0.7 + candidate.suitability * 0.5) + (jitter - 0.5) * 0.08, 0.18, 1);
  const influenceTileIds = collectInfluenceTiles(world, tile, candidate.faunaClass);
  const seasonality = deriveSeasonality(tile, traits, jitter);

  return {
    id: `fauna:${candidate.kind}:${tile.id}` as FaunaStockId,
    faunaClass: candidate.faunaClass,
    trophicRole: trophicRoleForKind(candidate.kind),
    kind: candidate.kind,
    habitat: candidate.habitat,
    anchorTileId: tile.id,
    regionId: tile.regionId,
    influenceTileIds,
    carryingCapacity: round3(carryingCapacity),
    habitatSuitability: round3(candidate.suitability),
    habitatBasis: describeHabitatBasis(tile, candidate),
    recoveryRate: round3(traits.recovery),
    seasonality,
    mobility: traits.mobility,
    pressureSensitivity: traits.pressureSensitivity,
    detectability: traits.detectability,
    riskPlaceholder: traits.risk,
    routineProfile: traits.routineProfile,
    waterDependence: traits.waterDependence,
    herdTendency: traits.herdTendency,
    flightResponse: traits.flightResponse,
    aggressionDefense: traits.aggressionDefense,
    habituationPotential: traits.habituationPotential,
    managementSuitability: traits.managementSuitability,
    reproductiveRate: traits.reproductiveRate,
  };
}

function trophicRoleForKind(kind: FaunaStockKind): FaunaTrophicRole {
  if (["lake_fish", "river_reach_fish", "delta_wetland_fish", "seasonal_fish_run", "shellfish_reedbed"].includes(kind)) {
    return "aquatic_prey";
  }
  if (kind === "small_predator" || kind === "large_predator") return "predator";
  if (kind === "small_game" || kind === "forest_edge_game") return "omnivore";
  return "herbivore";
}

function describeHabitatBasis(tile: Tile, candidate: StockCandidate): readonly string[] {
  const basis: string[] = [
    `${candidate.habitat.replace(/_/g, " ")} habitat`,
    `terrain ${tile.terrainKind}`,
  ];
  const water = clamp01(tile.resourceProfile.waterAccess);
  const richness = clamp01(tile.resourceProfile.baseRichness);
  const aquatic = clamp01(tile.resourceProfile.aquaticPotential);
  const forestCover = classifyForestCoverForTile(tile);

  if (candidate.faunaClass === "aquatic_food" || candidate.kind === "waterfowl") {
    if (tile.isRiver || tile.isRiverbank || tile.isConfluence) {
      basis.push("river or confluence edge");
    }
    if (tile.isEstuary || tile.isFloodplain || tile.isMarshChannel || tile.terrainKind === "wetlands") {
      basis.push("wetland/delta water edge");
    }
    if (tile.terrainKind === "lake" || tile.isAquatic) {
      basis.push("standing/open water context");
    }
    if (aquatic >= 0.28) {
      basis.push(`aquatic potential ${round2(aquatic)}`);
    }
  } else {
    if (forestCover === "dense_woodland" || forestCover === "wet_forest_edge" || forestCover === "riparian_trees") {
      basis.push(`${forestCover.replace(/_/g, " ")} cover`);
    } else if (forestCover === "forest_edge" || forestCover === "open_woodland" || forestCover === "scrub_tree_mix") {
      basis.push(`${forestCover.replace(/_/g, " ")} edge`);
    }
    if (tile.terrainKind === "plains" || tile.terrainKind === "river_valley") {
      basis.push("open grazing/browsing ground");
    }
    if (water >= 0.42 || tile.isRiverbank || tile.isFloodplain) {
      basis.push(`water access ${round2(water)}`);
    }
    if (richness >= 0.4) {
      basis.push(`plant browse/graze potential ${round2(richness)}`);
    }
  }

  return uniqueStrings(basis).slice(0, 5);
}

// BFS radius around the anchor, keeping only habitat-compatible tiles, capped.
function collectInfluenceTiles(world: WorldState, anchor: Tile, faunaClass: FaunaClass): readonly TileId[] {
  const accepted: TileId[] = [anchor.id];
  const seen = new Set<TileId>([anchor.id]);
  let frontier: readonly TileId[] = [anchor.id];

  for (let depth = 0; depth < INFLUENCE_RADIUS && accepted.length < INFLUENCE_TILE_CAP; depth += 1) {
    const next: TileId[] = [];

    for (const tileId of frontier) {
      const tile = world.tiles[tileId];

      if (tile === undefined) {
        continue;
      }

      for (const neighborId of [...tile.neighbors].sort()) {
        if (seen.has(neighborId) || accepted.length >= INFLUENCE_TILE_CAP) {
          continue;
        }

        seen.add(neighborId);
        const neighbor = world.tiles[neighborId];

        if (neighbor !== undefined && tileHostsClass(neighbor, faunaClass)) {
          accepted.push(neighborId);
          next.push(neighborId);
        }
      }
    }

    frontier = next;
  }

  return accepted;
}

function tileHostsClass(tile: Tile, faunaClass: FaunaClass): boolean {
  if (faunaClass === "aquatic_food") {
    return (
      tile.isAquatic ||
      tile.isFloodplain ||
      tile.isMarshChannel ||
      tile.isRiverbank ||
      tile.resourceProfile.aquaticPotential > 0.2 ||
      tile.resourceProfile.waterAccess > 0.5
    );
  }

  return !tile.isAquatic;
}

function deriveSeasonality(tile: Tile, traits: KindTraits, jitter: number): FaunaSeasonality {
  const peakSeasons = tile.seasonalProfile.peakSeasons.length > 0 ? tile.seasonalProfile.peakSeasons : traits.defaultPeak;
  const leanSeasons = tile.seasonalProfile.leanSeasons.length > 0 ? tile.seasonalProfile.leanSeasons : traits.defaultLean;

  return {
    peakSeasons,
    leanSeasons,
    amplitude: clamp01(traits.amplitude * (0.85 + jitter * 0.3)),
  };
}

interface KindTraits {
  readonly ccBase: number;
  readonly recovery: number;
  readonly mobility: number;
  readonly pressureSensitivity: number;
  readonly detectability: number;
  readonly risk: number;
  readonly amplitude: number;
  readonly defaultPeak: readonly Season[];
  readonly defaultLean: readonly Season[];
  readonly routineProfile: FaunaRoutineProfile;
  readonly waterDependence: number;
  readonly herdTendency: number;
  readonly flightResponse: number;
  readonly aggressionDefense: number;
  readonly habituationPotential: number;
  readonly managementSuitability: number;
  readonly reproductiveRate: number;
}

// Per-kind static traits. Aquatic: higher recovery, lower mobility, can pulse.
// Terrestrial: lower recovery, higher mobility/avoidance, large game riskier.
const aquaticRoutine = { routineProfile: "schooling_aquatic" as const, waterDependence: 1, herdTendency: 0.7, flightResponse: 0.5, aggressionDefense: 0.02, habituationPotential: 0.05, managementSuitability: 0.02, reproductiveRate: 0.7 };
const herdRoutine = { routineProfile: "migratory_herd" as const, waterDependence: 0.75, herdTendency: 0.9, flightResponse: 0.82, aggressionDefense: 0.5, habituationPotential: 0.18, managementSuitability: 0.14, reproductiveRate: 0.22 };
const coverRoutine = { routineProfile: "cover_forager" as const, waterDependence: 0.48, herdTendency: 0.42, flightResponse: 0.58, aggressionDefense: 0.34, habituationPotential: 0.42, managementSuitability: 0.4, reproductiveRate: 0.42 };
const scavengerRoutine = { routineProfile: "camp_scavenger" as const, waterDependence: 0.4, herdTendency: 0.25, flightResponse: 0.38, aggressionDefense: 0.14, habituationPotential: 0.78, managementSuitability: 0.62, reproductiveRate: 0.72 };
const predatorRoutine = { routineProfile: "cover_forager" as const, waterDependence: 0.52, herdTendency: 0.12, flightResponse: 0.46, aggressionDefense: 0.82, habituationPotential: 0.08, managementSuitability: 0.01, reproductiveRate: 0.12 };

const KIND_TRAITS: Readonly<Record<FaunaStockKind, KindTraits>> = {
  lake_fish: { ccBase: 0.8, recovery: 0.22, mobility: 0.18, pressureSensitivity: 0.5, detectability: 0.4, risk: 0.08, amplitude: 0.3, defaultPeak: ["summer"], defaultLean: ["winter"], ...aquaticRoutine },
  river_reach_fish: { ccBase: 0.68, recovery: 0.26, mobility: 0.3, pressureSensitivity: 0.52, detectability: 0.42, risk: 0.12, amplitude: 0.4, defaultPeak: ["spring", "summer"], defaultLean: ["winter"], ...aquaticRoutine },
  delta_wetland_fish: { ccBase: 0.92, recovery: 0.3, mobility: 0.22, pressureSensitivity: 0.62, detectability: 0.46, risk: 0.1, amplitude: 0.45, defaultPeak: ["spring", "autumn"], defaultLean: ["winter"], ...aquaticRoutine },
  seasonal_fish_run: { ccBase: 0.6, recovery: 0.42, mobility: 0.4, pressureSensitivity: 0.5, detectability: 0.5, risk: 0.14, amplitude: 0.85, defaultPeak: ["spring"], defaultLean: ["summer", "winter"], ...aquaticRoutine },
  shellfish_reedbed: { ccBase: 0.55, recovery: 0.2, mobility: 0.1, pressureSensitivity: 0.46, detectability: 0.38, risk: 0.18, amplitude: 0.25, defaultPeak: ["summer"], defaultLean: ["winter"], ...aquaticRoutine, herdTendency: 0.05, flightResponse: 0.02 },
  large_game: { ccBase: 0.62, recovery: 0.12, mobility: 0.72, pressureSensitivity: 0.78, detectability: 0.66, risk: 0.4, amplitude: 0.4, defaultPeak: ["autumn"], defaultLean: ["winter"], ...herdRoutine },
  medium_game: { ccBase: 0.52, recovery: 0.18, mobility: 0.6, pressureSensitivity: 0.6, detectability: 0.54, risk: 0.26, amplitude: 0.35, defaultPeak: ["autumn"], defaultLean: ["winter"], ...coverRoutine },
  small_game: { ccBase: 0.44, recovery: 0.3, mobility: 0.45, pressureSensitivity: 0.42, detectability: 0.4, risk: 0.14, amplitude: 0.3, defaultPeak: ["summer"], defaultLean: ["winter"], ...scavengerRoutine },
  waterfowl: { ccBase: 0.58, recovery: 0.34, mobility: 0.82, pressureSensitivity: 0.66, detectability: 0.6, risk: 0.16, amplitude: 0.7, defaultPeak: ["spring", "autumn"], defaultLean: ["summer"], ...herdRoutine, aggressionDefense: 0.2, reproductiveRate: 0.5 },
  upland_game: { ccBase: 0.46, recovery: 0.16, mobility: 0.58, pressureSensitivity: 0.56, detectability: 0.5, risk: 0.3, amplitude: 0.4, defaultPeak: ["summer"], defaultLean: ["winter"], ...coverRoutine, managementSuitability: 0.18 },
  forest_edge_game: { ccBase: 0.56, recovery: 0.2, mobility: 0.55, pressureSensitivity: 0.58, detectability: 0.52, risk: 0.24, amplitude: 0.35, defaultPeak: ["autumn"], defaultLean: ["winter"], ...coverRoutine, habituationPotential: 0.55, managementSuitability: 0.52 },
  small_predator: { ccBase: 0.28, recovery: 0.1, mobility: 0.68, pressureSensitivity: 0.5, detectability: 0.36, risk: 0.48, amplitude: 0.25, defaultPeak: ["winter"], defaultLean: ["summer"], ...predatorRoutine, reproductiveRate: 0.18 },
  large_predator: { ccBase: 0.22, recovery: 0.07, mobility: 0.78, pressureSensitivity: 0.58, detectability: 0.44, risk: 0.72, amplitude: 0.22, defaultPeak: ["winter"], defaultLean: ["summer"], ...predatorRoutine },
};

// --- dynamic state read helpers ---

export function getFaunaStockDynamic(world: WorldState, stockId: FaunaStockId): FaunaStockDynamic {
  const stored = world.faunaStocks?.[stockId];

  if (stored !== undefined) {
    return stored;
  }

  return { abundance: 1, disturbance: 0, lastPressureTick: 0 as TickNumber, cumulativePressure: 0 };
}

// Seasonal availability multiplier. `allowPulse` permits >1 for a run season
// (used for TRIP RETURNS only — never the support multiplier).
export function seasonalAvailabilityFactor(geo: FaunaStockGeo, season: Season, allowPulse: boolean): number {
  const { peakSeasons, leanSeasons, amplitude } = geo.seasonality;

  if (peakSeasons.includes(season)) {
    const pulse = allowPulse ? 1 + amplitude * RUN_PULSE_BONUS : 1;
    return clamp(pulse, SEASONAL_FACTOR_FLOOR, allowPulse ? 1.6 : 1);
  }

  if (leanSeasons.includes(season)) {
    return clamp(1 - amplitude * 0.5, SEASONAL_FACTOR_FLOOR, 1);
  }

  return clamp(1 - amplitude * 0.18, SEASONAL_FACTOR_FLOOR, 1);
}

// Realized relative abundance of a stock right now (for the SUPPORT multiplier):
// fraction-of-capacity × seasonal × (1 − disturbance). Bounded [FACTOR_FLOOR, 1].
function realizedSupportFactor(geo: FaunaStockGeo, dyn: FaunaStockDynamic, season: Season): number {
  const seasonal = seasonalAvailabilityFactor(geo, season, false);
  const factor = dyn.abundance * seasonal * (1 - dyn.disturbance * DISTURB_SUPPRESS);

  return clamp(factor, FACTOR_FLOOR, 1);
}

// --- per-tile support effect (consumed by carryingCapacity) ---

export function deriveFaunaTileSupportEffect(
  world: WorldState,
  geo: FaunaStockGeography,
  tileId: TileId,
  season: Season,
  contributionByClass: readonly ResourceClassContribution[],
): FaunaTileSupportEffect {
  const stocks = geo.byTile.get(tileId);
  const animalContribution = foodContribution(contributionByClass, "animal_food");
  const aquaticContribution = foodContribution(contributionByClass, "aquatic_food");
  const totalFood = totalFoodContribution(contributionByClass);

  // Uncovered tile → generic fallback placeholder: factor 1 (no fauna loss). This
  // keeps inland/non-stock tiles on the prior abstract behaviour and concentrates
  // finite depletion where stocks actually exist (deltas, lakes, game grounds).
  let animalFactor = 1;
  let aquaticFactor = 1;
  let covered = false;

  if (stocks !== undefined) {
    for (const stock of stocks) {
      if (stock.trophicRole === "predator") continue;
      const factor = realizedSupportFactor(stock, getFaunaStockDynamic(world, stock.id), season);

      if (stock.faunaClass === "animal_food") {
        animalFactor = Math.min(animalFactor, factor);
        covered = true;
      } else {
        aquaticFactor = Math.min(aquaticFactor, factor);
        covered = true;
      }
    }
  }

  const animalLoss = animalContribution * (1 - animalFactor);
  const aquaticLoss = aquaticContribution * (1 - aquaticFactor);
  const lossFraction = totalFood <= 0 ? 0 : clamp((animalLoss + aquaticLoss) / totalFood, 0, FAUNA_LOSS_CAP);

  return {
    covered,
    animalFactor: round3(animalFactor),
    aquaticFactor: round3(aquaticFactor),
    animalLoss: round3(animalLoss),
    aquaticLoss: round3(aquaticLoss),
    faunaMultiplier: round3(1 - lossFraction),
  };
}

function foodContribution(contributionByClass: readonly ResourceClassContribution[], classId: FaunaClass): number {
  for (const entry of contributionByClass) {
    if (entry.classId === classId) {
      return entry.supportContribution;
    }
  }

  return 0;
}

function totalFoodContribution(contributionByClass: readonly ResourceClassContribution[]): number {
  let sum = 0;

  for (const entry of contributionByClass) {
    if (entry.domain === "food") {
      sum += entry.supportContribution;
    }
  }

  return sum;
}

// --- trip return + scout sign (anti-omniscient experience signals) ---

// Stock-grounded multiplier on a hunting/fishing trip's RETURN value. >1 only on
// a seasonal run; depleted/disturbed/lean → <1. Returns 1 (neutral) when the
// target tile hosts no stock of that class (generic placeholder hunting).
export function deriveFaunaTripReturnFactor(
  world: WorldState,
  geo: FaunaStockGeography,
  tileId: TileId,
  faunaClass: FaunaClass,
  season: Season,
): number {
  const stock = bestStockOfClassAt(geo, tileId, faunaClass);

  if (stock === undefined) {
    return 1;
  }

  const dyn = getFaunaStockDynamic(world, stock.id);
  const seasonal = seasonalAvailabilityFactor(stock, season, true);
  // ROUTINES-2: flight/wariness makes a stock harder to encounter; temporary
  // camp proximity or regrouping can partly offset that. These are physical
  // stock effects, but bands learn them only through the resulting trip trace.
  const routineEncounter = clamp(
    1 - (dyn.humanWariness ?? dyn.disturbance) * 0.18 + (dyn.campProximity ?? 0) * 0.1 + (dyn.herdCohesion ?? 0) * 0.04,
    0.72,
    1.12,
  );
  const factor = (0.4 + stock.carryingCapacity * 0.6) * dyn.abundance * seasonal *
    (1 - dyn.disturbance * DISTURB_SUPPRESS) * routineEncounter;

  return clamp(factor, 0.05, 1.6);
}

export function deriveFaunaTripStockTrace(
  world: WorldState,
  geo: FaunaStockGeography,
  tileId: TileId,
  faunaClass: FaunaClass,
  season: Season,
  tick: TickNumber,
): FaunaTripStockTraceBase | undefined {
  const stock = bestStockOfClassAt(geo, tileId, faunaClass);

  if (stock === undefined) {
    return undefined;
  }

  const dyn = getFaunaStockDynamic(world, stock.id);
  const seasonalAvailability = seasonalAvailabilityFactor(stock, season, true);
  const expectedReturnFactor = deriveFaunaTripReturnFactor(world, geo, tileId, faunaClass, season);

  return {
    stockId: String(stock.id),
    faunaClass: stock.faunaClass,
    kind: stock.kind,
    habitat: stock.habitat,
    anchorTileId: stock.anchorTileId,
    habitatSuitability: stock.habitatSuitability,
    habitatBasis: stock.habitatBasis,
    expectedReturnFactor: round3(expectedReturnFactor),
    currentAbundance: round3(dyn.abundance),
    disturbance: round3(dyn.disturbance),
    seasonalAvailability: round3(seasonalAvailability),
    pressure: round3(clamp01(dyn.cumulativePressure * 0.12 + dyn.disturbance * 0.4)),
    recoveryRate: stock.recoveryRate,
    mobility: stock.mobility,
    pressureSensitivity: stock.pressureSensitivity,
    detectability: stock.detectability,
    risk: round3(clamp01(stock.riskPlaceholder + (dyn.youngProtection ?? 0) * stock.aggressionDefense * 0.28 + (dyn.managementStress ?? 0) * 0.12)),
    laborAccessCost: round3(clamp01(0.18 + stock.riskPlaceholder * 0.22 + (stock.habitat === "river_reach" ? 0.1 : 0))),
    rawSource: "deriveFaunaTripStockTrace from finite fauna/aquatic stock geography + sparse dynamic state",
    reasonIds: [`reason:fauna-trip-stock:${String(stock.id)}:${String(tileId)}:${String(tick)}` as ReasonId],
  };
}

// Canonical fauna/aquatic harvest owner. Inventions may alter the requested
// take before this call, but only a real stock can satisfy it. The returned
// world and receipt describe the same bounded removal.
export function resolveFaunaFoodHarvest(
  world: WorldState,
  geo: FaunaStockGeography,
  tileId: TileId,
  faunaClass: FaunaClass,
  season: Season,
  tick: TickNumber,
  requestedAmount: number,
  activityEligible: boolean,
): FaunaFoodHarvestResolution {
  const stock = bestStockOfClassAt(geo, tileId, faunaClass);
  if (stock === undefined) {
    return {
      world,
      sourceFound: false,
      physicalAvailability: 0,
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate: 0,
      failureReason: "physical_source_absent",
    };
  }

  const dyn = getFaunaStockDynamic(world, stock.id);
  const seasonal = seasonalAvailabilityFactor(stock, season, false);
  const harvestableAbundance = Math.max(0, dyn.abundance - HUMAN_HARVEST_RESERVE);
  const physicalAvailability = harvestableAbundance * stock.carryingCapacity * seasonal * FAUNA_HARVEST_SUPPORT_SCALE;
  const processingLossRate = faunaClass === "aquatic_food" ? 0.12 : 0.16;

  if (!activityEligible) {
    return {
      world,
      sourceId: String(stock.id),
      sourceClass: stock.kind,
      sourceFound: true,
      stockId: stock.id,
      stockKind: stock.kind,
      physicalAvailability: round4(physicalAvailability),
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate,
      failureReason: "activity_failed",
    };
  }

  if (physicalAvailability <= 0.0001) {
    return {
      world,
      sourceId: String(stock.id),
      sourceClass: stock.kind,
      sourceFound: true,
      stockId: stock.id,
      stockKind: stock.kind,
      physicalAvailability: 0,
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate,
      failureReason: "physically_exhausted",
    };
  }

  const harvestedAmount = Math.min(Math.max(0, requestedAmount), physicalAvailability);
  if (harvestedAmount <= 0) {
    return {
      world,
      sourceId: String(stock.id),
      sourceClass: stock.kind,
      sourceFound: true,
      stockId: stock.id,
      stockKind: stock.kind,
      physicalAvailability: round4(physicalAvailability),
      harvestedAmount: 0,
      depletionApplied: 0,
      processingLossRate,
      failureReason: "activity_failed",
    };
  }

  const abundanceDraw = harvestedAmount /
    Math.max(0.0001, stock.carryingCapacity * seasonal * FAUNA_HARVEST_SUPPORT_SCALE);
  const nextAbundance = clamp(dyn.abundance - abundanceDraw, HUMAN_HARVEST_RESERVE, 1);
  const actualDraw = Math.max(0, dyn.abundance - nextAbundance) *
    stock.carryingCapacity * seasonal * FAUNA_HARVEST_SUPPORT_SCALE;
  const intensity = clamp01(actualDraw / Math.max(0.0001, physicalAvailability));
  const nextWorld: WorldState = {
    ...world,
    faunaStocks: {
      ...(world.faunaStocks ?? {}),
      [stock.id]: {
        ...dyn,
        abundance: round4(nextAbundance),
        disturbance: round4(clamp01(dyn.disturbance + intensity * stock.mobility * 0.18)),
        lastPressureTick: tick,
        cumulativePressure: round4(dyn.cumulativePressure + intensity),
      },
    },
  };

  return {
    world: nextWorld,
    sourceId: String(stock.id),
    sourceClass: stock.kind,
    sourceFound: true,
    stockId: stock.id,
    stockKind: stock.kind,
    physicalAvailability: round4(physicalAvailability),
    harvestedAmount: round4(actualDraw),
    depletionApplied: round4(actualDraw),
    processingLossRate,
  };
}

// Uncertain "sign/tracks" strength a scout/hunter can read WITHOUT a remote exact
// stock read — bounded by the stock's detectability and the band's skill, with
// deterministic per-tile noise. Never reveals abundance precisely.
export function deriveFaunaSignStrength(
  world: WorldState,
  geo: FaunaStockGeography,
  tileId: TileId,
  faunaClass: FaunaClass,
  season: Season,
  skill: number,
  tick: TickNumber,
): number {
  const stock = bestStockOfClassAt(geo, tileId, faunaClass);

  if (stock === undefined) {
    return 0;
  }

  const dyn = getFaunaStockDynamic(world, stock.id);
  const seasonal = seasonalAvailabilityFactor(stock, season, false);
  const trueSignal = dyn.abundance * seasonal * (0.5 + stock.carryingCapacity * 0.5);
  // Detection is uncertain: detectability + skill gate it, and deterministic noise
  // makes signs stale/misleading rather than an exact reveal.
  const noise = hashUnit(String(world.seed), [String(stock.id), Number(tick)]) - 0.5;
  const detected = trueSignal * (0.4 + stock.detectability * 0.4 + clamp01(skill) * 0.2) + noise * 0.18;

  return clamp01(detected);
}

function bestStockOfClassAt(geo: FaunaStockGeography, tileId: TileId, faunaClass: FaunaClass): FaunaStockGeo | undefined {
  const stocks = geo.byTile.get(tileId);

  if (stocks === undefined) {
    return undefined;
  }

  let best: FaunaStockGeo | undefined;

  for (const stock of stocks) {
    if (stock.faunaClass !== faunaClass || stock.trophicRole === "predator") {
      continue;
    }

    if (best === undefined || stock.carryingCapacity > best.carryingCapacity) {
      best = stock;
    }
  }

  return best;
}

// --- in-season trip depletion (physical truth write) ---

// A successful hunting/fishing trip pulls the targeted stock's abundance down and
// raises disturbance. Bounded, deterministic, sparse. Returns a new world (or the
// same world when the tile hosts no matching stock).
export function applyFaunaTripDepletion(
  world: WorldState,
  geo: FaunaStockGeography,
  tileId: TileId,
  faunaClass: FaunaClass,
  intensity: number,
  tick: TickNumber,
): WorldState {
  const stock = bestStockOfClassAt(geo, tileId, faunaClass);

  if (stock === undefined) {
    return world;
  }

  const clampedIntensity = clamp01(intensity);

  if (clampedIntensity <= 0) {
    return world;
  }

  const previous = world.faunaStocks ?? {};
  const dyn = previous[stock.id] ?? { abundance: 1, disturbance: 0, lastPressureTick: 0 as TickNumber, cumulativePressure: 0 };
  const pull = clampedIntensity * stock.pressureSensitivity * TRIP_DEPLETION_PULL;
  const nextAbundance = clamp(dyn.abundance - pull * dyn.abundance, HUMAN_HARVEST_RESERVE, 1);
  const nextDisturbance = clamp01(dyn.disturbance + clampedIntensity * stock.mobility * 0.18);

  return {
    ...world,
    faunaStocks: {
      ...previous,
      [stock.id]: {
        abundance: round4(nextAbundance),
        disturbance: round4(nextDisturbance),
        lastPressureTick: tick,
        cumulativePressure: round4(dyn.cumulativePressure + clampedIntensity),
      },
    },
  };
}

// --- seasonal advance (once per season, like advanceTileDepletion) ---

export function advanceFaunaStocks(world: WorldState, cache: TickContextCache): WorldState {
  const geo = deriveFaunaStockGeography(world);

  if (geo.stocks.length === 0) {
    return world.faunaStocks === undefined ? world : { ...world, faunaStocks: {} };
  }

  const index = getSharedCatchmentIndex(world, cache);
  const previous = world.faunaStocks ?? {};
  const tick = world.time.tick;
  const next: Record<string, FaunaStockDynamic> = {};
  const managementByStock = collectManagementPressure(world);

  const forageClaims: PlantForageClaim[] = geo.stocks
    .filter((stock) => stock.trophicRole === "herbivore" || stock.trophicRole === "omnivore")
    .map((stock) => {
      const dyn = getFaunaStockDynamic(world, stock.id);
      return {
        consumerId: String(stock.id),
        tileIds: stock.influenceTileIds,
        demand: stock.carryingCapacity * dyn.abundance * FORAGE_DEMAND_SCALE *
          (stock.trophicRole === "omnivore" ? 0.62 : 1),
        // §10 forage-class compatibility: grazers/browsers take surface forage,
        // omnivores also root underground-storage organs. Still habitat-bounded
        // by influenceTileIds above.
        forageClasses: forageClassesForTrophicRole(stock.trophicRole),
      };
    });
  const forage = consumePlantForage(world, forageClaims, world.time);

  for (const stock of geo.stocks) {
    const dyn = previous[stock.id] ?? { abundance: 1, disturbance: 0, lastPressureTick: 0 as TickNumber, cumulativePressure: 0 };

    // General (camp / catchment occupation) pressure over the stock's zone.
    let claimWeight = 0;
    for (const tileId of stock.influenceTileIds) {
      claimWeight += index.claimsByTileId.get(tileId)?.totalWeight ?? 0;
    }
    const generalPressure = clamp01((claimWeight / stock.influenceTileIds.length) / CLAIM_PRESSURE_NORM);

    // In-season trip depletion already lowered abundance directly; here we apply
    // catchment-occupation pressure + recovery + disturbance dynamics.
    const pressure = clamp01(generalPressure * GENERAL_PRESSURE_WEIGHT) * stock.pressureSensitivity;
    const management = managementByStock.get(String(stock.id));
    const routine = deriveRoutineState(stock, dyn, world.time.season, generalPressure, management);
    const forageReceipt = forage.receipts.get(String(stock.id));
    // Only land herbivores/omnivores depend on the plant-forage ledger. Predators
    // are gated by prey below; aquatic prey (fish/shellfish/seasonal runs) are
    // supported by their own aquatic habitat, not land plants — treating a missing
    // land-forage receipt as zero support wrongly starved them to extinction and
    // collapsed their sign strength (breaking recovery and animal-pattern learning).
    const selfSupportingForage = stock.trophicRole === "predator" || stock.trophicRole === "aquatic_prey";
    const forageSupportRatio = selfSupportingForage ? 1 : (forageReceipt?.supportRatio ?? 0);
    const forageStress = selfSupportingForage ? 0 : clamp01(1 - forageSupportRatio);
    const recovery = stock.recoveryRate * (1 - dyn.abundance) * (1 - dyn.disturbance * 0.5) *
      (0.35 + (routine.reproductiveCondition ?? 0.7) * 0.35) *
      (stock.trophicRole === "predator" ? 0 : forageSupportRatio) *
      clamp01(dyn.abundance * 4);
    const loss = pressure * DEPLETION_STRENGTH * dyn.abundance +
      forageStress * FORAGE_SHORTAGE_LOSS * dyn.abundance;
    const nextAbundance = stock.trophicRole === "predator"
      ? dyn.abundance
      : clamp(dyn.abundance + recovery - loss, 0, 1);

    const rested = generalPressure < 0.04 && dyn.lastPressureTick !== tick;
    const nextDisturbance = clamp01(
      dyn.disturbance * (1 - DISTURB_DECAY) + generalPressure * DISTURB_GAIN - (rested ? DISTURB_DECAY * 0.5 : 0),
    );

    next[stock.id] = {
      abundance: round4(nextAbundance),
      disturbance: round4(nextDisturbance),
      lastPressureTick: generalPressure > 0.02 ? tick : dyn.lastPressureTick,
      cumulativePressure: round4(dyn.cumulativePressure + generalPressure),
      forageSupportRatio: round4(forageSupportRatio),
      feedingPressure: round4(forageReceipt?.consumed ?? 0),
      forageStress: round4(forageStress),
      relocationPressure: round4(forageStress * stock.mobility),
      ...routine,
    };
  }

  // Predators consume actual local prey abundance. Human hunting has already
  // removed prey earlier in the season, so both consumers compete for the same
  // stock state. Candidate scans are region/local-overlap bounded and sorted.
  for (const predator of geo.stocks.filter((stock) => stock.trophicRole === "predator")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const priorPredator = previous[predator.id] ?? getFaunaStockDynamic(world, predator.id);
    const candidates = geo.stocks
      .filter((prey) => prey.trophicRole !== "predator" && prey.faunaClass === "animal_food" &&
        prey.regionId === predator.regionId && compatiblePrey(predator, prey))
      .sort((a, b) => {
        const abundanceDelta = (next[b.id]?.abundance ?? getFaunaStockDynamic(world, b.id).abundance) -
          (next[a.id]?.abundance ?? getFaunaStockDynamic(world, a.id).abundance);
        return abundanceDelta || String(a.id).localeCompare(String(b.id));
      })
      .slice(0, PREDATION_CANDIDATE_CAP);
    const demand = predator.carryingCapacity * priorPredator.abundance * PREDATOR_DEMAND_SCALE;
    let remaining = demand;
    let consumed = 0;
    let targetId: string | undefined;
    for (const prey of candidates) {
      if (remaining <= 0) break;
      const preyDyn = next[prey.id] ?? getFaunaStockDynamic(forage.world, prey.id);
      const available = preyDyn.abundance * prey.carryingCapacity * 0.18;
      const take = Math.min(remaining, available);
      if (take <= 0) continue;
      const abundanceDraw = take / Math.max(0.0001, prey.carryingCapacity);
      next[prey.id] = {
        ...preyDyn,
        abundance: round4(clamp(preyDyn.abundance - abundanceDraw, 0, 1)),
        predationPressure: round4(clamp01((preyDyn.predationPressure ?? 0) * 0.6 + abundanceDraw)),
      };
      consumed += take;
      remaining -= take;
      targetId ??= String(prey.id);
    }
    const preySupportRatio = demand <= 0 ? 1 : clamp(consumed / demand, 0, 1);
    const shortage = 1 - preySupportRatio;
    const recovery = predator.recoveryRate * (1 - priorPredator.abundance) * preySupportRatio * 0.65;
    const abundance = clamp(
      priorPredator.abundance + recovery - shortage * PREDATOR_SHORTAGE_LOSS * priorPredator.abundance,
      0,
      1,
    );
    const base = next[predator.id] ?? priorPredator;
    next[predator.id] = {
      ...base,
      abundance: round4(abundance),
      preyRemoved: round4(consumed),
      preySupportRatio: round4(preySupportRatio),
      predatorCondition: round4(clamp01((priorPredator.predatorCondition ?? 0.8) * 0.65 + preySupportRatio * 0.35)),
      trophicTargetId: targetId,
      relocationPressure: round4(shortage * predator.mobility),
      reproductiveCondition: round4(clamp01((base.reproductiveCondition ?? 0.7) * 0.65 + preySupportRatio * 0.35)),
    };
  }

  transferForageDrivenMovement(geo, next);
  return { ...forage.world, faunaStocks: next as Readonly<Record<FaunaStockId, FaunaStockDynamic>> };
}

function compatiblePrey(predator: FaunaStockGeo, prey: FaunaStockGeo): boolean {
  if (predator.kind === "large_predator") {
    return prey.kind !== "small_predator" && prey.kind !== "large_predator" && prey.kind !== "shellfish_reedbed";
  }
  return prey.kind === "small_game" || prey.kind === "waterfowl" || prey.kind === "forest_edge_game";
}

function transferForageDrivenMovement(
  geo: FaunaStockGeography,
  next: Record<string, FaunaStockDynamic>,
): void {
  const stocks = geo.stocks
    .filter((stock) => stock.trophicRole === "herbivore" || stock.trophicRole === "omnivore")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const source of stocks) {
    const sourceDyn = next[source.id];
    if (sourceDyn === undefined || (sourceDyn.relocationPressure ?? 0) < 0.35 || sourceDyn.abundance <= 0.02) continue;
    const destination = stocks.find((candidate) => candidate.id !== source.id && candidate.regionId === source.regionId &&
      candidate.trophicRole === source.trophicRole && (next[candidate.id]?.forageSupportRatio ?? 0) > (sourceDyn.forageSupportRatio ?? 0) + 0.2);
    if (destination === undefined) continue;
    const destinationDyn = next[destination.id] ?? { abundance: 1, disturbance: 0, lastPressureTick: 0 as TickNumber, cumulativePressure: 0 };
    const transfer = Math.min(0.025, sourceDyn.abundance * 0.08, 1 - destinationDyn.abundance);
    if (transfer <= 0) continue;
    next[source.id] = { ...sourceDyn, abundance: round4(sourceDyn.abundance - transfer) };
    next[destination.id] = { ...destinationDyn, abundance: round4(destinationDyn.abundance + transfer) };
  }
}

interface ManagementPressure {
  readonly feeding: number;
  readonly holding: number;
  readonly protection: number;
  readonly failure: number;
}

function collectManagementPressure(world: WorldState): ReadonlyMap<string, ManagementPressure> {
  const accumulated = new Map<string, ManagementPressure>();
  for (const band of Object.values(world.bands)) {
    for (const record of band.animalManagement?.records ?? []) {
      const prior = accumulated.get(record.stockId) ?? { feeding: 0, holding: 0, protection: 0, failure: 0 };
      accumulated.set(record.stockId, {
        feeding: clamp01(prior.feeding + (record.action === "feed" ? 0.2 : 0)),
        holding: clamp01(prior.holding + (record.action === "temporary_hold" ? 0.28 : 0)),
        protection: clamp01(prior.protection + (record.action === "protect" ? 0.18 : 0)),
        failure: clamp01(prior.failure + (["escaped", "enclosure_stress", "injury_risk", "reproduction_failed"].includes(record.outcome) ? 0.2 : 0)),
      });
    }
  }
  return accumulated;
}

function deriveRoutineState(
  stock: FaunaStockGeo,
  dyn: FaunaStockDynamic,
  season: Season,
  pressure: number,
  management: ManagementPressure | undefined,
): Pick<FaunaStockDynamic,
  "routinePhase" | "herdCohesion" | "humanWariness" | "habituation" | "campProximity" |
  "habitatReturn" | "migrationPressure" | "youngProtection" | "reproductiveCondition" | "managementStress"> {
  const feeding = management?.feeding ?? 0;
  const holding = management?.holding ?? 0;
  const protection = management?.protection ?? 0;
  const failure = management?.failure ?? 0;
  const priorWariness = dyn.humanWariness ?? dyn.disturbance;
  const priorHabituation = dyn.habituation ?? 0;
  const managementStress = clamp01((dyn.managementStress ?? 0) * 0.7 + holding * 0.72 + failure * 0.4);
  const habituation = clamp01(
    priorHabituation * 0.86 + feeding * stock.habituationPotential * 0.5 -
      pressure * stock.flightResponse * 0.16 - managementStress * 0.12,
  );
  const humanWariness = clamp01(
    priorWariness * 0.76 + pressure * stock.flightResponse * 0.42 + holding * 0.24 + failure * 0.2 - habituation * 0.16,
  );
  const fragmentation = clamp01(pressure * stock.flightResponse + managementStress * 0.4);
  const herdCohesion = clamp01(
    (dyn.herdCohesion ?? stock.herdTendency) * 0.72 + stock.herdTendency * 0.28 - fragmentation * 0.24 + protection * 0.08,
  );
  const migrationPressure = clamp01(
    (stock.routineProfile === "migratory_herd" ? (season === "spring" || season === "autumn" ? 0.68 : 0.24) :
      stock.routineProfile === "schooling_aquatic" && stock.kind === "seasonal_fish_run" && season === "spring" ? 0.82 : 0.08) +
      pressure * stock.mobility * 0.24,
  );
  const waterSeeking = stock.waterDependence * (season === "summer" ? 0.82 : 0.42);
  const youngProtection = clamp01((season === "spring" ? stock.aggressionDefense * 0.76 : 0.08) + protection * 0.16);
  const campProximity = clamp01(
    (dyn.campProximity ?? 0) * 0.68 + feeding * stock.habituationPotential * 0.54 - humanWariness * 0.18,
  );
  const habitatReturn = clamp01((dyn.habitatReturn ?? 0.5) * 0.78 + (pressure < 0.08 ? 0.18 : -0.08) + stock.herdTendency * 0.04);
  const reproductiveCondition = clamp01(
    (dyn.reproductiveCondition ?? 0.78) * 0.76 + stock.reproductiveRate * 0.22 + protection * 0.08 -
      pressure * 0.18 - managementStress * 0.42,
  );
  const routinePhase: FaunaRoutinePhase =
    humanWariness >= 0.62 ? "flight" :
    stock.routineProfile === "camp_scavenger" && campProximity >= 0.2 ? "camp_following" :
    youngProtection >= 0.38 ? "young_protection" :
    migrationPressure >= 0.58 ? "migration" :
    waterSeeking >= 0.58 ? "water_seeking" :
    stock.routineProfile === "cover_forager" && season === "winter" ? "resting_cover" :
    habitatReturn >= 0.68 && pressure < 0.12 ? "habitat_return" :
    stock.routineProfile === "migratory_herd" ? "roaming" : "feeding";
  return {
    routinePhase,
    herdCohesion: round4(herdCohesion),
    humanWariness: round4(humanWariness),
    habituation: round4(habituation),
    campProximity: round4(campProximity),
    habitatReturn: round4(habitatReturn),
    migrationPressure: round4(migrationPressure),
    youngProtection: round4(youngProtection),
    reproductiveCondition: round4(reproductiveCondition),
    managementStress: round4(managementStress),
  };
}

// --- audit / debug summary ---

export interface FaunaStockSummary {
  readonly stockCount: number;
  readonly aquaticCount: number;
  readonly terrestrialCount: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly byRegion: number;
  readonly meanCarryingCapacity: number;
  readonly meanAbundance: number;
  readonly minAbundance: number;
  readonly depletedStockCount: number; // abundance < 0.7
  readonly disturbedStockCount: number; // disturbance > 0.3
  readonly meanInfluenceTiles: number;
  readonly maxInfluenceTiles: number;
  readonly byRoutineProfile: Readonly<Record<string, number>>;
  readonly byRoutinePhase: Readonly<Record<string, number>>;
  readonly managedStockCount: number;
  readonly meanWariness: number;
  readonly meanHabituation: number;
  readonly meanReproductiveCondition: number;
  readonly herbivoreCount: number;
  readonly predatorCount: number;
  readonly meanForageSupportRatio: number;
  readonly totalFeedingPressure: number;
  readonly totalPreyRemoved: number;
  readonly meanPredatorCondition: number;
}

export function summarizeFaunaStocks(world: WorldState): FaunaStockSummary {
  const geo = deriveFaunaStockGeography(world);
  const byKind: Record<string, number> = {};
  const regions = new Set<RegionId>();
  let aquaticCount = 0;
  let ccSum = 0;
  let abundanceSum = 0;
  let minAbundance = 1;
  let depleted = 0;
  let disturbed = 0;
  let influenceSum = 0;
  let maxInfluence = 0;
  const byRoutineProfile: Record<string, number> = {};
  const byRoutinePhase: Record<string, number> = {};
  let managedStockCount = 0;
  let warinessSum = 0;
  let habituationSum = 0;
  let reproductiveConditionSum = 0;
  let herbivoreCount = 0;
  let predatorCount = 0;
  let forageSupportSum = 0;
  let feedingPressureSum = 0;
  let preyRemovedSum = 0;
  let predatorConditionSum = 0;

  for (const stock of geo.stocks) {
    byKind[stock.kind] = (byKind[stock.kind] ?? 0) + 1;
    byRoutineProfile[stock.routineProfile] = (byRoutineProfile[stock.routineProfile] ?? 0) + 1;
    regions.add(stock.regionId);
    ccSum += stock.carryingCapacity;
    influenceSum += stock.influenceTileIds.length;
    maxInfluence = Math.max(maxInfluence, stock.influenceTileIds.length);

    if (stock.faunaClass === "aquatic_food") {
      aquaticCount += 1;
    }

    const dyn = getFaunaStockDynamic(world, stock.id);
    const phase = dyn.routinePhase ?? "uninitialized";
    byRoutinePhase[phase] = (byRoutinePhase[phase] ?? 0) + 1;
    if ((dyn.managementStress ?? 0) > 0 || (dyn.campProximity ?? 0) > 0) managedStockCount += 1;
    warinessSum += dyn.humanWariness ?? 0;
    habituationSum += dyn.habituation ?? 0;
    reproductiveConditionSum += dyn.reproductiveCondition ?? 1;
    if (stock.trophicRole === "herbivore" || stock.trophicRole === "omnivore") {
      herbivoreCount += 1;
      forageSupportSum += dyn.forageSupportRatio ?? 1;
      feedingPressureSum += dyn.feedingPressure ?? 0;
    }
    if (stock.trophicRole === "predator") {
      predatorCount += 1;
      preyRemovedSum += dyn.preyRemoved ?? 0;
      predatorConditionSum += dyn.predatorCondition ?? 1;
    }
    abundanceSum += dyn.abundance;
    minAbundance = Math.min(minAbundance, dyn.abundance);

    if (dyn.abundance < 0.7) {
      depleted += 1;
    }

    if (dyn.disturbance > 0.3) {
      disturbed += 1;
    }
  }

  const count = geo.stocks.length;

  return {
    stockCount: count,
    aquaticCount,
    terrestrialCount: count - aquaticCount,
    byKind,
    byRegion: regions.size,
    meanCarryingCapacity: count === 0 ? 0 : round3(ccSum / count),
    meanAbundance: count === 0 ? 1 : round3(abundanceSum / count),
    minAbundance: round3(minAbundance),
    depletedStockCount: depleted,
    disturbedStockCount: disturbed,
    meanInfluenceTiles: count === 0 ? 0 : round3(influenceSum / count),
    maxInfluenceTiles: maxInfluence,
    byRoutineProfile,
    byRoutinePhase,
    managedStockCount,
    meanWariness: count === 0 ? 0 : round3(warinessSum / count),
    meanHabituation: count === 0 ? 0 : round3(habituationSum / count),
    meanReproductiveCondition: count === 0 ? 1 : round3(reproductiveConditionSum / count),
    herbivoreCount,
    predatorCount,
    meanForageSupportRatio: herbivoreCount === 0 ? 0 : round3(forageSupportSum / herbivoreCount),
    totalFeedingPressure: round3(feedingPressureSum),
    totalPreyRemoved: round3(preyRemovedSum),
    meanPredatorCondition: predatorCount === 0 ? 0 : round3(predatorConditionSum / predatorCount),
  };
}

// --- small numeric helpers ---

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  }

  return output;
}
