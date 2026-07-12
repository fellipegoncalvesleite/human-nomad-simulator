import type {
  Band,
  BandDemography,
  HealthProfile,
  InitialSpawnProfileRole,
  InitialSpawnReason,
  MobilityStrategy,
  SocialPressureProfile,
  SpawnCriterion,
  SpawnSiteScoreBreakdown,
  SubsistenceMode,
  TechnologyTag,
} from "./types";
import { createInitialBiomeAdaptation } from "./biomeAdaptation";
import { createOriginDeepHistory } from "./bandHistory";
import type { BandId, TileId } from "../core/types";
import type {
  KnownBandRecord,
  KnowledgeState,
  KnownTileRecord,
  PlaceAttachment,
  TileObservation,
} from "../knowledge/types";
import { getNeighborTiles, getTile } from "../world/generate";
import { hashSeedString } from "../core/seededVariation";
import { getDepletionAdjustedRichness } from "../world/depletion";
import type { Tile, WorldState } from "../world/types";

interface SpawnProfile {
  readonly role: InitialSpawnProfileRole;
  readonly bandId: BandId;
  readonly name: string;
  readonly color: string;
  readonly size: number;
  readonly mobilityStrategy: MobilityStrategy;
  readonly subsistenceModes: readonly SubsistenceMode[];
  readonly technologies: readonly TechnologyTag[];
  readonly criteria: readonly SpawnCriterion[];
  readonly scoreTile: (world: WorldState, tile: Tile) => SpawnSiteScoreBreakdown;
}

const INITIAL_SPAWN_PROFILES: readonly SpawnProfile[] = [
  {
    role: "delta_coastal_foragers",
    bandId: "band:delta-coastal-foragers" as BandId,
    name: "Delta Reed Band",
    color: "#44c2a8",
    size: 34,
    mobilityStrategy: "seasonal_round",
    subsistenceModes: ["foraging", "aquatic"],
    technologies: ["basic_foraging", "fishing", "basketry", "drying_smoking"],
    criteria: ["aquatic_resources", "coastal_access", "manageable_risk"],
    scoreTile: (_world, tile) =>
      scoreSpawnSite({
        tile,
        foodValue: tile.resourceProfile.baseRichness * 0.65,
        waterValue: tile.resourceProfile.waterAccess,
        aquaticValue: tile.resourceProfile.aquaticPotential,
        movementCostPenalty: movementPenalty(tile),
        riskPenalty: moderateRiskPenalty(tile.riskProfile.floodRisk, 0.58) +
          moderateRiskPenalty(tile.riskProfile.diseaseRisk, 0.46),
        terrainMatch: terrainMatch(tile, ["coast", "wetlands"]),
        profileMatch: clamp01(
          (tile.isCoastal ? 0.42 : 0) +
            (tile.terrainKind === "wetlands" ? 0.34 : 0) +
            tile.resourceProfile.aquaticPotential * 0.24,
        ),
        weights: {
          food: 1.15,
          water: 1.2,
          aquatic: 1.75,
          movement: 0.72,
          risk: 1.05,
          terrain: 1.25,
          profile: 1.45,
        },
      }),
  },
  {
    role: "river_valley_foragers",
    bandId: "band:river-valley-foragers" as BandId,
    name: "Green River Band",
    color: "#56b55d",
    size: 38,
    mobilityStrategy: "seasonal_round",
    subsistenceModes: ["foraging", "wild_grain_collection", "plant_tending"],
    technologies: ["basic_foraging", "basketry", "plant_tending"],
    criteria: [
      "river_floodplain",
      "plant_tending_potential",
      "wild_grain_potential",
      "low_movement_cost",
    ],
    scoreTile: (_world, tile) =>
      scoreSpawnSite({
        tile,
        foodValue: tile.resourceProfile.baseRichness,
        waterValue: tile.resourceProfile.waterAccess,
        aquaticValue: tile.resourceProfile.aquaticPotential * 0.36,
        movementCostPenalty: movementPenalty(tile),
        riskPenalty: tile.riskProfile.droughtRisk * 0.42 + tile.riskProfile.floodRisk * 0.22,
        terrainMatch: terrainMatch(tile, ["river_valley", "plains", "forest"]),
        profileMatch: clamp01(
          tile.resourceProfile.plantTendingPotential * 0.42 +
            tile.resourceProfile.wildGrainPotential * 0.42 +
            (tile.terrainKind === "river_valley" ? 0.22 : 0),
        ),
        weights: {
          food: 1.45,
          water: 1.35,
          aquatic: 0.45,
          movement: 1.05,
          risk: 0.72,
          terrain: 1.1,
          profile: 1.55,
        },
      }),
  },
  {
    role: "lake_wetland_foragers",
    bandId: "band:lake-wetland-foragers" as BandId,
    name: "Lake Marsh Band",
    color: "#3d93d1",
    size: 31,
    mobilityStrategy: "logistical_foraging",
    subsistenceModes: ["foraging", "aquatic", "wild_grain_collection"],
    technologies: ["basic_foraging", "fishing", "basic_storage", "basketry"],
    criteria: ["lake_wetland", "seasonal_abundance", "aquatic_resources"],
    scoreTile: (_world, tile) =>
      scoreSpawnSite({
        tile,
        foodValue: tile.resourceProfile.baseRichness * 0.8,
        waterValue: tile.resourceProfile.waterAccess,
        aquaticValue: tile.resourceProfile.aquaticPotential,
        movementCostPenalty: movementPenalty(tile),
        riskPenalty: tile.riskProfile.floodRisk * 0.46 + tile.riskProfile.diseaseRisk * 0.32,
        terrainMatch: terrainMatch(tile, ["wetlands", "river_valley", "plains"]),
        profileMatch: clamp01(
          tile.seasonalProfile.seasonalVariance * 0.42 +
            tile.resourceProfile.storageSuitability * 0.26 +
            tile.resourceProfile.aquaticPotential * 0.32,
        ),
        weights: {
          food: 1.1,
          water: 1.15,
          aquatic: 1.45,
          movement: 0.82,
          risk: 0.82,
          terrain: 1,
          profile: 1.65,
        },
      }),
  },
  {
    role: "highland_edge_foragers",
    bandId: "band:highland-edge-foragers" as BandId,
    name: "Pass Edge Band",
    color: "#d6bd62",
    size: 27,
    mobilityStrategy: "high_mobility",
    subsistenceModes: ["foraging", "wild_grain_collection"],
    technologies: ["basic_foraging", "basketry"],
    criteria: ["mountain_edge", "pass_corridor", "low_movement_cost"],
    scoreTile: (_world, tile) =>
      scoreSpawnSite({
        tile,
        foodValue: tile.resourceProfile.baseRichness * 0.72,
        waterValue: tile.resourceProfile.waterAccess * 0.7,
        aquaticValue: tile.resourceProfile.aquaticPotential * 0.1,
        movementCostPenalty: movementPenalty(tile),
        riskPenalty: tile.riskProfile.droughtRisk * 0.34 + mountainPenalty(tile),
        terrainMatch: terrainMatch(tile, ["hills", "plains", "river_valley"]),
        profileMatch: clamp01(
          mountainEdgeValue(tile) * 0.5 +
            passCorridorValue(tile) * 0.36 +
            (tile.movementCost <= 1.45 ? 0.18 : 0),
        ),
        weights: {
          food: 0.95,
          water: 0.85,
          aquatic: 0.15,
          movement: 1.35,
          risk: 0.75,
          terrain: 1.05,
          profile: 1.75,
        },
      }),
  },
  {
    role: "dry_margin_foragers",
    bandId: "band:dry-margin-foragers" as BandId,
    name: "Dry Margin Band",
    color: "#d08a43",
    size: 25,
    mobilityStrategy: "high_mobility",
    subsistenceModes: ["foraging", "wild_grain_collection"],
    technologies: ["basic_foraging", "basketry", "drying_smoking"],
    criteria: ["dry_margin_access", "manageable_risk", "low_movement_cost"],
    scoreTile: (world, tile) => {
      const nearbyOpportunity = getNearbyOpportunityValue(world, tile);

      return scoreSpawnSite({
        tile,
        foodValue: tile.resourceProfile.baseRichness * 0.54 + nearbyOpportunity * 0.36,
        waterValue: tile.resourceProfile.waterAccess,
        aquaticValue: tile.resourceProfile.aquaticPotential * 0.12,
        movementCostPenalty: movementPenalty(tile),
        riskPenalty: deepDryPenalty(tile) + tile.riskProfile.diseaseRisk * 0.12,
        terrainMatch: terrainMatch(tile, ["desert", "plains", "hills"]),
        profileMatch: clamp01(
          dryMarginValue(tile) * 0.56 +
            nearbyOpportunity * 0.3 +
            (tile.movementCost <= 1.75 ? 0.16 : 0),
        ),
        weights: {
          food: 0.95,
          water: 1,
          aquatic: 0.1,
          movement: 1.15,
          risk: 1.1,
          terrain: 0.9,
          profile: 1.6,
        },
      });
    },
  },
];

interface ScoreInput {
  readonly tile: Tile;
  readonly foodValue: number;
  readonly waterValue: number;
  readonly aquaticValue: number;
  readonly movementCostPenalty: number;
  readonly riskPenalty: number;
  readonly terrainMatch: number;
  readonly profileMatch: number;
  readonly weights: {
    readonly food: number;
    readonly water: number;
    readonly aquatic: number;
    readonly movement: number;
    readonly risk: number;
    readonly terrain: number;
    readonly profile: number;
  };
}

interface SpawnCandidate {
  readonly tile: Tile;
  readonly scoreBreakdown: SpawnSiteScoreBreakdown;
}

export interface InitialBandPlacement {
  readonly bandId: BandId;
  readonly tileId: TileId;
}

export type InitialBandPlacementInvalidReason =
  | "not_setup_state"
  | "unknown_band"
  | "not_initial_band"
  | "outside_map"
  | "impassable_water"
  | "forbidden_terrain"
  | "too_costly"
  | "occupied_start_tile"
  | "insufficient_local_support";

export type InitialBandPlacementValidation =
  | {
      readonly valid: true;
      readonly bandId: BandId;
      readonly tileId: TileId;
    }
  | {
      readonly valid: false;
      readonly bandId: BandId;
      readonly tileId?: TileId;
      readonly reason: InitialBandPlacementInvalidReason;
    };

interface KnownTileWithDistance {
  readonly tile: Tile;
  readonly distance: number;
}

const INITIAL_PLACEMENT_MIN_SCORE = 0.05;

export function spawnInitialBands(world: WorldState): WorldState {
  const selectedCandidates: SpawnCandidate[] = [];
  const bands: Band[] = [];

  for (const profile of INITIAL_SPAWN_PROFILES) {
    const candidate = selectSpawnCandidate(world, profile, selectedCandidates);
    selectedCandidates.push(candidate);
    bands.push(createBandFromSpawnProfile(world, profile, candidate));
  }

  const bandsWithNearbyKnowledge = addNearbyBandKnowledge(world, bands);
  const bandRecord: Record<string, Band> = {};

  for (const band of bandsWithNearbyKnowledge) {
    bandRecord[band.id] = band;
  }

  return {
    ...world,
    bands: bandRecord as Readonly<Record<BandId, Band>>,
  };
}

// ---------------------------------------------------------------------------
// M0.10 (reworked in MAP2-R) — explicit spawn points for Map 2
// ("Varied Migration Test", 1 tile ≈ 1.5 km).
//
// Unlike Map 1's score-search spawns, Map 2 places bands at EXPLICIT authored
// coordinates (nearest spawnable land tile to each target) so migration/
// saturation audits start from known, reproducible positions: two dry-margin
// bands on the seasonal "yellow corridor", a deliberately crowded three-band
// cluster around the lake/marsh basin (saturation test — the fed basin is the
// region's productive core, so a multi-band cluster there is ecologically
// plausible), a river-valley band on the long river, a creek-anchored open-
// plains band, an estuary band on the delta, and one small low-density
// frontier band at the central ridge pass. Initial state is otherwise the
// standard spawn pipeline — no special pressure/stress is injected.
// ---------------------------------------------------------------------------

interface VariedMigrationSpawnPoint {
  readonly baseRole: InitialSpawnProfileRole;
  readonly bandId: BandId;
  readonly name: string;
  readonly color: string;
  readonly size: number;
  readonly target: { readonly x: number; readonly y: number };
}

const VARIED_MIGRATION_SPAWN_POINTS: readonly VariedMigrationSpawnPoint[] = [
  // Dry-margin corridor pair (the user's "yellow corridor" question).
  { baseRole: "dry_margin_foragers", bandId: "band:varied-dry-corridor-mid" as BandId, name: "Yellow Corridor Band", color: "#d08a43", size: 25, target: { x: 76, y: 111 } },
  { baseRole: "dry_margin_foragers", bandId: "band:varied-dry-corridor-upper" as BandId, name: "Upper Corridor Band", color: "#c19a4e", size: 22, target: { x: 56, y: 106 } },
  // Rich lake basin: one comfortable band + a deliberately crowded pair → a
  // three-band cluster sharing one catchment (wetland saturation test).
  { baseRole: "lake_wetland_foragers", bandId: "band:varied-lake-north" as BandId, name: "Rich Basin Band", color: "#3d93d1", size: 31, target: { x: 78, y: 60 } },
  { baseRole: "lake_wetland_foragers", bandId: "band:varied-lake-west" as BandId, name: "Basin Crowd West", color: "#4f7fc9", size: 28, target: { x: 68, y: 78 } },
  { baseRole: "lake_wetland_foragers", bandId: "band:varied-lake-east" as BandId, name: "Basin Crowd East", color: "#62a7d8", size: 28, target: { x: 88, y: 80 } },
  // Long-river valley band (river corridor dispersal test).
  { baseRole: "river_valley_foragers", bandId: "band:varied-river-mid" as BandId, name: "Long River Band", color: "#56b55d", size: 34, target: { x: 108, y: 54 } },
  // MAP2-R: open-plains band anchored on a sub-tile creek line in the central
  // plains mosaic (plains are no longer uniformly poor; creeks make them
  // habitable away from the big rivers).
  { baseRole: "river_valley_foragers", bandId: "band:varied-plains-creek" as BandId, name: "Creek Plains Band", color: "#8aa84f", size: 24, target: { x: 100, y: 46 } },
  // Delta/estuary band.
  { baseRole: "delta_coastal_foragers", bandId: "band:varied-estuary" as BandId, name: "Estuary Band", color: "#44c2a8", size: 30, target: { x: 194, y: 90 } },
  // Low-density frontier band at the central ridge pass (bottleneck gateway to
  // the semi-isolated NE basin — poorer-but-empty land nearby).
  { baseRole: "highland_edge_foragers", bandId: "band:varied-pass-frontier" as BandId, name: "North Frontier Band", color: "#d6bd62", size: 16, target: { x: 135, y: 45 } },
];

// One-origin colonization test (user heat-test requirement): the SAME Map 2
// terrain with a single founding band on the long river — its descendants
// should, over centuries, come to inhabit multiple distinct regions.
const SINGLE_ORIGIN_SPAWN_POINTS: readonly VariedMigrationSpawnPoint[] = [
  { baseRole: "river_valley_foragers", bandId: "band:single-origin" as BandId, name: "Origin Band", color: "#e0b14f", size: 32, target: { x: 108, y: 54 } },
];

export function spawnSingleOriginBand(world: WorldState): WorldState {
  return spawnBandsAtPoints(world, SINGLE_ORIGIN_SPAWN_POINTS);
}

export function spawnVariedMigrationBands(world: WorldState): WorldState {
  return spawnBandsAtPoints(world, VARIED_MIGRATION_SPAWN_POINTS);
}

function spawnBandsAtPoints(
  world: WorldState,
  spawnPoints: readonly VariedMigrationSpawnPoint[],
): WorldState {
  const bands: Band[] = [];

  for (const spawnPoint of spawnPoints) {
    const profile = createSpawnProfileFromPoint(spawnPoint);

    if (profile === undefined) {
      continue;
    }
    const tile = findNearestSpawnableTile(world, spawnPoint.target);

    if (tile === undefined) {
      continue;
    }

    const candidate: SpawnCandidate = {
      tile,
      scoreBreakdown: profile.scoreTile(world, tile),
    };
    bands.push(createBandFromSpawnProfile(world, profile, candidate));
  }

  const bandsWithNearbyKnowledge = addNearbyBandKnowledge(world, bands);
  const bandRecord: Record<string, Band> = {};

  for (const band of bandsWithNearbyKnowledge) {
    bandRecord[band.id] = band;
  }

  return {
    ...world,
    bands: bandRecord as Readonly<Record<BandId, Band>>,
  };
}

export function validateInitialBandPlacement(
  world: WorldState,
  bandId: BandId,
  tileId: TileId | null,
): InitialBandPlacementValidation {
  if (!isInitialSetupWorld(world)) {
    return { valid: false, bandId, tileId: tileId ?? undefined, reason: "not_setup_state" };
  }

  if (world.bands[bandId] === undefined) {
    return { valid: false, bandId, tileId: tileId ?? undefined, reason: "unknown_band" };
  }

  const profile = getInitialSpawnProfileForBandId(bandId);

  if (profile === undefined) {
    return { valid: false, bandId, tileId: tileId ?? undefined, reason: "not_initial_band" };
  }

  if (tileId === null) {
    return { valid: false, bandId, reason: "outside_map" };
  }

  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return { valid: false, bandId, tileId, reason: "outside_map" };
  }

  for (const band of Object.values(world.bands)) {
    if (band.id !== bandId && band.position === tileId) {
      return { valid: false, bandId, tileId, reason: "occupied_start_tile" };
    }
  }

  const invalidReason = getInitialPlacementTileInvalidReason(tile);

  if (invalidReason !== undefined) {
    return { valid: false, bandId, tileId, reason: invalidReason };
  }

  if (profile.scoreTile(world, tile).finalScore < INITIAL_PLACEMENT_MIN_SCORE) {
    return { valid: false, bandId, tileId, reason: "insufficient_local_support" };
  }

  return { valid: true, bandId, tileId };
}

export function applyInitialBandPlacements(
  world: WorldState,
  placements: readonly InitialBandPlacement[] | undefined,
): WorldState {
  if (placements === undefined || placements.length === 0 || !isInitialSetupWorld(world)) {
    return world;
  }

  const placementByBandId = new Map<BandId, TileId>();

  for (const placement of placements) {
    placementByBandId.set(placement.bandId, placement.tileId);
  }

  const rebuiltBands: Band[] = [];
  const preservedBands: Band[] = [];
  const reservedTileIds = new Set<TileId>();

  for (const band of Object.values(world.bands).sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    const profile = getInitialSpawnProfileForBandId(band.id);

    if (profile === undefined) {
      preservedBands.push(band);
      continue;
    }

    const targetTileId = placementByBandId.get(band.id) ?? band.position;
    const validation = validateInitialBandPlacement(world, band.id, targetTileId);

    if (!validation.valid || reservedTileIds.has(validation.tileId)) {
      rebuiltBands.push(band);
      reservedTileIds.add(band.position);
      continue;
    }

    const tile = getTile(world, validation.tileId);

    if (tile === undefined) {
      rebuiltBands.push(band);
      reservedTileIds.add(band.position);
      continue;
    }

    reservedTileIds.add(validation.tileId);
    rebuiltBands.push(
      createBandFromSpawnProfile(world, profile, {
        tile,
        scoreBreakdown: profile.scoreTile(world, tile),
      }),
    );
  }

  if (rebuiltBands.length === 0) {
    return world;
  }

  const bandsWithNearbyKnowledge = addNearbyBandKnowledge(world, [...rebuiltBands, ...preservedBands]);
  const bandRecord: Record<string, Band> = {};

  for (const band of bandsWithNearbyKnowledge) {
    bandRecord[band.id] = band;
  }

  return {
    ...world,
    bands: bandRecord as Readonly<Record<BandId, Band>>,
  };
}

// ===========================================================================
// PRE-RUN-BAND-MANAGER-1 (SETUP-DEMOGRAPHY-MERGE-1 Phase 1) — setup-only roster
// editing: remove default bands and add custom starting bands BEFORE the run.
// Fully deterministic (no unseeded randomness): defaults are hashed from seed+tile+index.
// Only valid in the initial setup state; never edits a live world.
// ===========================================================================

export type AddedBandKnowledgePreset = "default" | "cautious" | "normal" | "experienced";

export interface AddedBandSpec {
  readonly tileId: TileId;
  readonly population?: number;
  readonly color?: string;
  readonly name?: string;
  readonly knowledgePreset?: AddedBandKnowledgePreset;
}

// Plausible, varied band-marker colours for added bands (same family as the
// authored founder colours). Picked deterministically by hash, offset to avoid
// colliding with colours already in use.
const ADDED_BAND_COLOR_PALETTE: readonly string[] = [
  "#c8743a", "#3f8fc0", "#5aa85b", "#caa94d", "#8a6fb0", "#4cb39a",
  "#cf6f6f", "#7f9b46", "#5d77c2", "#b07a52", "#46a0c8", "#bd9a55",
];

export function addedBandId(index: number): BandId {
  return `band:custom:${index}` as BandId;
}

function roleForAddedBand(tile: Tile, preset: AddedBandKnowledgePreset | undefined): InitialSpawnProfileRole {
  if (preset === "cautious") {
    return "highland_edge_foragers";
  }

  if (tile.isEstuary || tile.isCoastal) {
    return "delta_coastal_foragers";
  }

  if (tile.terrainKind === "lake" || tile.terrainKind === "wetlands" || tile.isFloodplain || tile.isMarshChannel) {
    return "lake_wetland_foragers";
  }

  if (tile.isRiver || tile.isRiverbank || tile.terrainKind === "river_valley") {
    return "river_valley_foragers";
  }

  if (tile.terrainKind === "desert" || tile.terrainKind === "tundra") {
    return "dry_margin_foragers";
  }

  if (tile.terrainKind === "hills" || tile.terrainKind === "mountains") {
    return "highland_edge_foragers";
  }

  return "river_valley_foragers";
}

function pickAddedBandColor(hash: number, usedColors: ReadonlySet<string>): string {
  for (let offset = 0; offset < ADDED_BAND_COLOR_PALETTE.length; offset += 1) {
    const color = ADDED_BAND_COLOR_PALETTE[(hash + offset) % ADDED_BAND_COLOR_PALETTE.length];

    if (!usedColors.has(color)) {
      return color;
    }
  }

  return ADDED_BAND_COLOR_PALETTE[hash % ADDED_BAND_COLOR_PALETTE.length];
}

// Validate a tile for a NEW (added) band — same tile rules as moving an initial
// band, plus an occupancy check against already-placed/reserved tiles.
export function validateAddedBandPlacement(
  world: WorldState,
  tileId: TileId | null,
  reservedTileIds: ReadonlySet<TileId> = new Set(),
): InitialBandPlacementValidation {
  const bandId = "band:custom:pending" as BandId;

  if (!isInitialSetupWorld(world)) {
    return { valid: false, bandId, tileId: tileId ?? undefined, reason: "not_setup_state" };
  }

  if (tileId === null) {
    return { valid: false, bandId, reason: "outside_map" };
  }

  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return { valid: false, bandId, tileId, reason: "outside_map" };
  }

  if (reservedTileIds.has(tileId) || Object.values(world.bands).some((band) => band.position === tileId)) {
    return { valid: false, bandId, tileId, reason: "occupied_start_tile" };
  }

  const invalidReason = getInitialPlacementTileInvalidReason(tile);

  if (invalidReason !== undefined) {
    return { valid: false, bandId, tileId, reason: invalidReason };
  }

  return { valid: true, bandId, tileId };
}

// Remove default starting bands (setup-only). Returns the world with those band
// ids dropped from the roster.
export function removeInitialBands(
  world: WorldState,
  removedBandIds: readonly BandId[] | undefined,
): WorldState {
  if (removedBandIds === undefined || removedBandIds.length === 0 || !isInitialSetupWorld(world)) {
    return world;
  }

  const removed = new Set(removedBandIds.map((id) => String(id)));
  const bandRecord: Record<string, Band> = {};

  for (const band of Object.values(world.bands)) {
    if (!removed.has(String(band.id))) {
      bandRecord[band.id] = band;
    }
  }

  return { ...world, bands: bandRecord as Readonly<Record<BandId, Band>> };
}

// Spawn user-added custom starting bands (setup-only). Defaults (size/color/name/
// role) are deterministic from seed+tile+index. Invalid/occupied tiles are
// skipped. Population conserved is N/A (these are new founders).
export function spawnCustomBands(
  world: WorldState,
  specs: readonly AddedBandSpec[] | undefined,
  seed: string,
): WorldState {
  if (specs === undefined || specs.length === 0 || !isInitialSetupWorld(world)) {
    return world;
  }

  const reserved = new Set<TileId>();
  const usedColors = new Set(Object.values(world.bands).map((band) => band.color));
  const addedBands: Band[] = [];

  specs.forEach((spec, index) => {
    const validation = validateAddedBandPlacement(world, spec.tileId, reserved);

    if (!validation.valid) {
      return;
    }

    const tile = getTile(world, spec.tileId);
    const bandId = addedBandId(index);

    if (tile === undefined || world.bands[bandId] !== undefined) {
      return;
    }

    const hash = hashSeedString(`${seed}:${String(spec.tileId)}:${index}`);
    const size = spec.population !== undefined
      ? Math.max(2, Math.round(spec.population))
      : 18 + (hash % 14);
    const color = spec.color ?? pickAddedBandColor(hash, usedColors);
    const name = spec.name !== undefined && spec.name.trim().length > 0
      ? spec.name.trim()
      : `New Band ${index + 1}`;
    const profile = createSpawnProfileFromPoint({
      baseRole: roleForAddedBand(tile, spec.knowledgePreset),
      bandId,
      name,
      color,
      size,
      target: tile.coord,
    });

    if (profile === undefined) {
      return;
    }

    addedBands.push(
      createBandFromSpawnProfile(world, profile, { tile, scoreBreakdown: profile.scoreTile(world, tile) }),
    );
    reserved.add(spec.tileId);
    usedColors.add(color);
  });

  if (addedBands.length === 0) {
    return world;
  }

  // Recompute cross-band nearby knowledge for the full roster so new and existing
  // bands legitimately see their neighbours (setup-state, deterministic).
  const allBands = addNearbyBandKnowledge(world, [...Object.values(world.bands), ...addedBands]);
  const bandRecord: Record<string, Band> = {};

  for (const band of allBands) {
    bandRecord[band.id] = band;
  }

  return { ...world, bands: bandRecord as Readonly<Record<BandId, Band>> };
}

function createSpawnProfileFromPoint(spawnPoint: VariedMigrationSpawnPoint): SpawnProfile | undefined {
  const baseProfile = INITIAL_SPAWN_PROFILES.find((profile) => profile.role === spawnPoint.baseRole);

  if (baseProfile === undefined) {
    return undefined;
  }

  return {
    ...baseProfile,
    bandId: spawnPoint.bandId,
    name: spawnPoint.name,
    color: spawnPoint.color,
    size: spawnPoint.size,
  };
}

function getInitialSpawnProfileForBandId(bandId: BandId): SpawnProfile | undefined {
  const baseProfile = INITIAL_SPAWN_PROFILES.find((profile) => profile.bandId === bandId);

  if (baseProfile !== undefined) {
    return baseProfile;
  }

  const variedPoint = VARIED_MIGRATION_SPAWN_POINTS.find((point) => point.bandId === bandId);

  if (variedPoint !== undefined) {
    return createSpawnProfileFromPoint(variedPoint);
  }

  const singleOriginPoint = SINGLE_ORIGIN_SPAWN_POINTS.find((point) => point.bandId === bandId);

  return singleOriginPoint === undefined ? undefined : createSpawnProfileFromPoint(singleOriginPoint);
}

function isInitialSetupWorld(world: WorldState): boolean {
  return (
    Number(world.time.tick) === 0 &&
    Object.keys(world.decisions).length === 0 &&
    world.decisionArchive.totalDecisions === 0
  );
}

function getInitialPlacementTileInvalidReason(tile: Tile): InitialBandPlacementInvalidReason | undefined {
  if (tile.isAquatic) {
    return "impassable_water";
  }

  if (tile.terrainKind === "mountains") {
    return "forbidden_terrain";
  }

  if (tile.movementCost > 2.25) {
    return "too_costly";
  }

  return undefined;
}

function findNearestSpawnableTile(
  world: WorldState,
  target: { readonly x: number; readonly y: number },
): Tile | undefined {
  let best: Tile | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const tile of Object.values(world.tiles)) {
    if (!isSpawnableLandTile(tile)) {
      continue;
    }

    const tileDistanceToTarget = Math.abs(tile.coord.x - target.x) + Math.abs(tile.coord.y - target.y);

    if (
      tileDistanceToTarget < bestDistance ||
      (tileDistanceToTarget === bestDistance && best !== undefined && compareTilesByCoord(tile, best) < 0)
    ) {
      best = tile;
      bestDistance = tileDistanceToTarget;
    }
  }

  return best;
}

function selectSpawnCandidate(
  world: WorldState,
  profile: SpawnProfile,
  alreadySelected: readonly SpawnCandidate[],
): SpawnCandidate {
  const rankedCandidates = Object.values(world.tiles)
    .filter((tile) => isSpawnableLandTile(tile))
    .map((tile) => ({ tile, scoreBreakdown: profile.scoreTile(world, tile) }))
    .sort(compareSpawnCandidates);

  const separatedCandidate = rankedCandidates.find((candidate) =>
    alreadySelected.every((selected) => tileDistance(candidate.tile, selected.tile) >= 9),
  );

  return separatedCandidate ?? rankedCandidates[0];
}

function createBandFromSpawnProfile(
  world: WorldState,
  profile: SpawnProfile,
  candidate: SpawnCandidate,
): Band {
  const reason: InitialSpawnReason = {
    profileRole: profile.role,
    selectedTileId: candidate.tile.id,
    criteria: profile.criteria,
    scoreBreakdown: candidate.scoreBreakdown,
  };

  const band: Band = {
    id: profile.bandId,
    name: profile.name,
    color: profile.color,
    position: candidate.tile.id,
    size: profile.size,
    status: "foraging",
    mobilityStrategy: profile.mobilityStrategy,
    subsistenceModes: profile.subsistenceModes,
    technologies: profile.technologies,
    knowledge: createInitialKnowledgeState(world, profile.bandId, candidate.tile),
    seasonalRoute: [],
    consecutiveSeasonsOnTile: 0,
    decisionHistory: [],
    cohesion: 0.78,
    mobilityCostTolerance: profile.mobilityStrategy === "high_mobility" ? 0.82 : 0.64,
    // INVENTION-3: learned container/storage practice is recomputed from the
    // practical-response substrate after lived evidence; spawn labels never
    // grant a perfect, frozen container coefficient.
    storageCapacity: 0.16,
    hungerPressure: 0.18,
    territorialPressure: 0.12,
    demography: createInitialDemography(world, profile.size),
    biomeAdaptation: createInitialBiomeAdaptation(candidate.tile, world.time),
    socialPressure: getInitialSocialPressure(),
    health: getInitialHealthProfile(),
    daughterBandIds: [],
    fissionEvents: [],
    initialSpawnReason: reason,
    movementHistory: [],
    placeMemory: {},
    travelCorridors: {},
    crossingMemories: {},
    usePressure: {},
    encounterRecords: [],
    contactMemories: {},
    encounterPerceptions: [],
    encounterResponses: [],
    viability: {
      bandId: profile.bandId,
      population: profile.size,
      minimumViablePopulation: 14,
      viabilityPressure: 0,
      extinctionRisk: 0,
      absorptionOpportunity: 0,
      status: "viable",
      reasonIds: [],
    },
    causalTraces: [],
  };

  // DEEP-TIME-HISTORY-TECH-1 — every origin band starts with a truthful
  // founding snapshot. Setup-editor moves rebuild the band through this same
  // function at the new tile, so the snapshot stays correct for moved bands.
  return {
    ...band,
    deepHistory: createOriginDeepHistory(world, band),
  };
}

function createInitialDemography(world: WorldState, population: number): BandDemography {
  const integerPopulation = Math.max(0, Math.round(population));
  const householdCount = getHouseholdCount(integerPopulation);
  const dependents = Math.round(integerPopulation * 0.34);
  const elders = Math.round(integerPopulation * 0.09);
  const workingAdults = Math.max(1, Math.round(integerPopulation - dependents - elders));

  return {
    population: integerPopulation,
    growthAccumulator: 0,
    mortalityAccumulator: 0,
    lastPopulationChangeReasonIds: [],
    householdCount,
    dependents,
    workingAdults,
    elders,
    fertilityPressure: 0.42,
    mortalityPressure: 0.18,
    foodPerPersonStress: 0.18,
    householdCrowdingPressure: 0.08,
    splitPressure: 0.06,
    lastDemographicUpdate: world.time,
    sourceReasonIds: [],
  };
}

function getHouseholdCount(population: number): number {
  return Math.max(1, Math.round(population / 5));
}

function createInitialKnowledgeState(
  world: WorldState,
  bandId: BandId,
  currentTile: Tile,
): KnowledgeState {
  const knownTiles = collectKnownTiles(world, currentTile);
  const observedTiles: Record<string, KnownTileRecord> = {};
  const tileObservationHistory: TileObservation[] = [];

  for (const knownTile of knownTiles) {
    const confidence = knownTile.distance === 0 ? 1 : knownTile.distance === 1 ? 0.72 : 0.38;
    const visits = knownTile.distance === 0 ? 1 : 0;

    observedTiles[knownTile.tile.id] = {
      tileId: knownTile.tile.id,
      firstObservedAt: world.time,
      lastObservedAt: world.time,
      seasonsObserved: [world.time.season],
      visits,
      observedRichness: getDepletionAdjustedRichness(world, knownTile.tile),
      observedWaterAccess: knownTile.tile.resourceProfile.waterAccess,
      observedAquaticPotential: knownTile.tile.resourceProfile.aquaticPotential,
      observedMovementCost: knownTile.tile.movementCost,
      observedRisk: getObservedRisk(knownTile.tile),
      observedStorageSuitability: knownTile.tile.resourceProfile.storageSuitability,
      observedSeasonalPattern: {
        peakSeasons: knownTile.tile.seasonalProfile.peakSeasons,
        leanSeasons: knownTile.tile.seasonalProfile.leanSeasons,
        reliability: knownTile.tile.seasonalProfile.reliability,
        confidence,
      },
      confidence,
      knowledgeSource: "personally_observed",
    };

    tileObservationHistory.push({
      tileId: knownTile.tile.id,
      observedAt: world.time,
      season: world.time.season,
      observedRichness: getDepletionAdjustedRichness(world, knownTile.tile),
      observedAquaticPotential: knownTile.tile.resourceProfile.aquaticPotential,
      observedRisk: getObservedRisk(knownTile.tile),
      observerBandId: bandId,
    });
  }

  return {
    selfBandId: bandId,
    observedTiles: observedTiles as Readonly<Record<TileId, KnownTileRecord>>,
    compressedKnownTileSummaries: [],
    knownAreaSummaries: [],
    knownBands: [],
    knownSettlements: [],
    knownRoutes: [],
    placeAttachments: [createInitialPlaceAttachment(currentTile)],
    tileObservationHistory,
    rumors: [],
  };
}

function addNearbyBandKnowledge(world: WorldState, bands: readonly Band[]): readonly Band[] {
  return bands.map((band) => {
    const knownBands: KnownBandRecord[] = [];
    const bandTile = getTile(world, band.position);

    if (bandTile === undefined) {
      return band;
    }

    for (const otherBand of bands) {
      if (otherBand.id === band.id) {
        continue;
      }

      const otherTile = getTile(world, otherBand.position);

      if (otherTile === undefined || tileDistance(bandTile, otherTile) > 4) {
        continue;
      }

      knownBands.push({
        bandId: otherBand.id,
        firstObservedAt: world.time,
        lastObservedAt: world.time,
        confidence: 0.86,
        estimatedSize: otherBand.size,
        lastKnownTileId: otherBand.position,
        contactKind: "direct",
      });
    }

    if (knownBands.length === 0) {
      return band;
    }

    return {
      ...band,
      knowledge: {
        ...band.knowledge,
        knownBands,
      },
    };
  });
}

function collectKnownTiles(world: WorldState, currentTile: Tile): readonly KnownTileWithDistance[] {
  const byTileId = new Map<TileId, KnownTileWithDistance>();

  byTileId.set(currentTile.id, { tile: currentTile, distance: 0 });

  for (const neighbor of getNeighborTiles(world, currentTile.id)) {
    byTileId.set(neighbor.id, { tile: neighbor, distance: 1 });

    for (const secondRing of getNeighborTiles(world, neighbor.id)) {
      if (!byTileId.has(secondRing.id)) {
        byTileId.set(secondRing.id, { tile: secondRing, distance: 2 });
      }
    }
  }

  return Array.from(byTileId.values()).sort((left, right) =>
    left.distance === right.distance
      ? compareTilesByCoord(left.tile, right.tile)
      : left.distance - right.distance,
  );
}

function createInitialPlaceAttachment(tile: Tile): PlaceAttachment {
  return {
    tileId: tile.id,
    seasonsKnown: 1,
    practicalWeight: clamp01(tile.resourceProfile.baseRichness * 0.46 + tile.resourceProfile.waterAccess * 0.38),
    ritualOrSymbolicWeight: 0,
    burialOrAncestorWeight: 0,
    claimStrength: 0.12,
  };
}

function scoreSpawnSite(input: ScoreInput): SpawnSiteScoreBreakdown {
  const foodValue = clamp01(input.foodValue);
  const waterValue = clamp01(input.waterValue);
  const aquaticValue = clamp01(input.aquaticValue);
  const movementCostPenalty = clamp01(input.movementCostPenalty);
  const riskPenalty = clamp01(input.riskPenalty);
  const terrainMatchValue = clamp01(input.terrainMatch);
  const profileMatchValue = clamp01(input.profileMatch);
  const finalScore =
    foodValue * input.weights.food +
    waterValue * input.weights.water +
    aquaticValue * input.weights.aquatic +
    terrainMatchValue * input.weights.terrain +
    profileMatchValue * input.weights.profile -
    movementCostPenalty * input.weights.movement -
    riskPenalty * input.weights.risk;

  return {
    foodValue: round2(foodValue),
    waterValue: round2(waterValue),
    aquaticValue: round2(aquaticValue),
    movementCostPenalty: round2(movementCostPenalty),
    riskPenalty: round2(riskPenalty),
    terrainMatch: round2(terrainMatchValue),
    profileMatch: round2(profileMatchValue),
    finalScore: round2(finalScore),
  };
}

function compareSpawnCandidates(left: SpawnCandidate, right: SpawnCandidate): number {
  if (left.scoreBreakdown.finalScore !== right.scoreBreakdown.finalScore) {
    return right.scoreBreakdown.finalScore - left.scoreBreakdown.finalScore;
  }

  return compareTilesByCoord(left.tile, right.tile);
}

function compareTilesByCoord(left: Tile, right: Tile): number {
  if (left.coord.y !== right.coord.y) {
    return left.coord.y - right.coord.y;
  }

  if (left.coord.x !== right.coord.x) {
    return left.coord.x - right.coord.x;
  }

  return String(left.id).localeCompare(String(right.id));
}

function isSpawnableLandTile(tile: Tile): boolean {
  return !tile.isAquatic && tile.movementCost <= 2.25 && tile.terrainKind !== "mountains";
}

function terrainMatch(tile: Tile, terrainKinds: readonly Tile["terrainKind"][]): number {
  return terrainKinds.includes(tile.terrainKind) ? 1 : 0;
}

function movementPenalty(tile: Tile): number {
  return clamp01((tile.movementCost - 1) / 1.8);
}

function mountainPenalty(tile: Tile): number {
  return tile.terrainKind === "mountains" ? 1 : clamp01((tile.elevation - 0.58) / 0.34);
}

function moderateRiskPenalty(value: number, preferredMaximum: number): number {
  return clamp01((value - preferredMaximum) / Math.max(0.01, 1 - preferredMaximum));
}

function mountainEdgeValue(tile: Tile): number {
  const elevationValue = 1 - Math.abs(tile.elevation - 0.48) / 0.32;

  return clamp01(elevationValue);
}

function passCorridorValue(tile: Tile): number {
  if (tile.terrainKind !== "hills" && tile.terrainKind !== "river_valley") {
    return 0;
  }

  return clamp01(1 - movementPenalty(tile));
}

function dryMarginValue(tile: Tile): number {
  const droughtValue = 1 - Math.abs(tile.riskProfile.droughtRisk - 0.48) / 0.34;
  const waterAccessValue = 1 - Math.abs(tile.resourceProfile.waterAccess - 0.42) / 0.34;

  return clamp01((droughtValue + waterAccessValue) / 2);
}

function deepDryPenalty(tile: Tile): number {
  return clamp01((tile.riskProfile.droughtRisk - 0.68) / 0.32 + (0.22 - tile.resourceProfile.waterAccess));
}

function getNearbyOpportunityValue(world: WorldState, tile: Tile): number {
  const knownTiles = collectKnownTiles(world, tile);
  let bestValue = 0;

  for (const knownTile of knownTiles) {
    if (knownTile.distance === 0) {
      continue;
    }

    bestValue = Math.max(
      bestValue,
      knownTile.tile.resourceProfile.baseRichness * 0.58 +
        knownTile.tile.resourceProfile.waterAccess * 0.42,
    );
  }

  return clamp01(bestValue);
}

function getObservedRisk(tile: Tile): number {
  return clamp01(
    tile.riskProfile.floodRisk * 0.34 +
      tile.riskProfile.droughtRisk * 0.34 +
      tile.riskProfile.diseaseRisk * 0.32,
  );
}

function getInitialSocialPressure(): SocialPressureProfile {
  return {
    demographicPressure: 0.18,
    fissionPressure: 0.12,
    leadershipStress: 0.1,
    territorialPressure: 0.08,
    stateAvoidancePressure: 0,
    cohesionStress: 0.14,
  };
}

function getInitialHealthProfile(): HealthProfile {
  return {
    diseaseBurden: 0.08,
    nutritionStress: 0.12,
    injuryBurden: 0.06,
    mortalityRisk: 0.08,
  };
}

function tileDistance(first: Tile, second: Tile): number {
  return Math.hypot(first.coord.x - second.coord.x, first.coord.y - second.coord.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
