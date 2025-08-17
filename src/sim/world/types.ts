import type {
  BandId,
  Coord,
  DecisionId,
  RegionId,
  RiverId,
  Season,
  SeasonIndex,
  SimulationSeed,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import type { Band } from "../agents/types";
import type { FaunaStockDynamic } from "../agents/faunaStock";
import type { ForestPatchState } from "../agents/forestPatches";
import type { PlantPatchState } from "../agents/plantStock";
import type { Decision, DecisionArchiveSummary } from "../rules/types";

export type TerrainKind =
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "wetlands"
  | "river_valley"
  | "coast"
  | "lake"
  | "desert"
  | "tundra";

export type BiomeKind =
  | "unknown"
  | "temperate_grassland"
  | "temperate_forest"
  | "boreal_forest"
  | "savanna"
  | "shrubland"
  | "floodplain"
  | "marsh"
  | "coastal"
  | "arid"
  | "alpine";

export type ClimateRegime =
  | {
      readonly kind: "stable";
      readonly seasonalHarshness: number;
      readonly aridity: number;
      readonly volatility: number;
    }
  | {
      readonly kind: "warming";
      readonly seasonalHarshness: number;
      readonly aridity: number;
      readonly volatility: number;
    }
  | {
      readonly kind: "cooling";
      readonly seasonalHarshness: number;
      readonly aridity: number;
      readonly volatility: number;
    }
  | {
      readonly kind: "drying";
      readonly seasonalHarshness: number;
      readonly aridity: number;
      readonly volatility: number;
    }
  | {
      readonly kind: "wetting";
      readonly seasonalHarshness: number;
      readonly aridity: number;
      readonly volatility: number;
    }
  | {
      readonly kind: "volatile";
      readonly seasonalHarshness: number;
      readonly aridity: number;
      readonly volatility: number;
    };

export interface TileResourceProfile {
  readonly baseRichness: number;
  readonly waterAccess: number;
  readonly aquaticPotential: number;
  readonly wildGrainPotential: number;
  readonly plantTendingPotential: number;
  readonly storageSuitability: number;
  readonly resourceRegenerationRate: number;
}

export interface SeasonalResourceProfile {
  readonly seasonalVariance: number;
  readonly peakSeasons: readonly Season[];
  readonly leanSeasons: readonly Season[];
  readonly reliability: number;
  readonly expectedWinterStress: number;
}

export interface EnvironmentalRiskProfile {
  readonly floodRisk: number;
  readonly droughtRisk: number;
  readonly diseaseRisk: number;
  readonly depletionRisk: number;
  readonly climateVolatility: number;
}

export type RiverKind =
  | "seasonal_stream"
  | "shallow_braided"
  | "meandering_channel"
  | "deep_channel"
  | "marsh_channel"
  | "estuary"
  | "rapid_gorge";

export type RiverWidthClass =
  | "narrow"
  | "medium"
  | "wide"
  | "very_wide";

export type RiverDepthClass =
  | "shallow"
  | "mixed"
  | "deep";

export type FlowStrength =
  | "weak"
  | "moderate"
  | "strong"
  | "dangerous";

export type RiverCrossingClass =
  | "ford"
  | "seasonal_ford"
  | "shallow_crossing"
  | "dangerous_crossing"
  | "impassable_without_watercraft"
  | "impassable_without_bridge_or_ferry";

export interface RiverSegmentProfile {
  readonly riverId: RiverId;
  readonly kind: RiverKind;
  readonly widthClass: RiverWidthClass;
  readonly depthClass: RiverDepthClass;
  readonly flowStrength: FlowStrength;
  readonly bankSteepness: number;
  readonly seasonalFlowVariance: number;
  readonly floodSeason?: Season;
  readonly fordability: number;
  readonly navigability: number;
  readonly aquaticReliabilityModifier: number;
  readonly floodplainFertilityModifier: number;
  readonly crossingRisk: number;
}

export interface RiverCrossingProfile {
  readonly fromTileId: TileId;
  readonly toTileId: TileId;
  readonly riverId: RiverId;
  readonly crossingClass: RiverCrossingClass;
  readonly baseCrossingCost: number;
  readonly seasonalCostModifier: number;
  readonly risk: number;
  readonly knownFord: boolean;
  readonly confidence: number;
}

export interface SubsistenceModeCapacity {
  readonly sustainablePopulation: number;
  readonly foodPerTick: number;
  readonly reliability: number;
  readonly depletionSensitivity: number;
  readonly seasonalPressure: number;
}

export interface CarryingCapacityProfile {
  readonly foraging: SubsistenceModeCapacity;
  readonly aquatic: SubsistenceModeCapacity;
  readonly plantTending: SubsistenceModeCapacity;
  readonly earlyAgriculture: SubsistenceModeCapacity;
  readonly irrigatedAgriculture: SubsistenceModeCapacity;
}

export interface SubsistenceYieldBreakdown {
  readonly aquaticYield: number;
  readonly wildPlantYield: number;
  readonly plantTendingYield: number;
  readonly earlyAgricultureYield: number;
  readonly irrigatedAgricultureYield: number;
  readonly storageModifiedYield: number;
  readonly storageLoss: number;
}

export interface ResourceYieldEstimate extends SubsistenceYieldBreakdown {
  readonly tileId: TileId;
  readonly expectedFood: number;
  readonly foodReliability: number;
  readonly leanSeasonRisk: number;
  readonly movementCostToAccess: number;
  readonly expectedFutureValue: number;
  readonly planningHorizonTicks: TickNumber;
}

export interface SeasonalYieldEstimate {
  readonly season: Season;
  readonly seasonIndex: SeasonIndex;
  readonly estimate: ResourceYieldEstimate;
}

export interface Tile {
  readonly id: TileId;
  readonly coord: Coord;
  readonly regionId: RegionId;
  readonly terrainKind: TerrainKind;
  readonly biomeKind?: BiomeKind;
  readonly resourceProfile: TileResourceProfile;
  readonly seasonalProfile: SeasonalResourceProfile;
  readonly riskProfile: EnvironmentalRiskProfile;
  readonly carryingCapacity: CarryingCapacityProfile;
  readonly movementCost: number;
  readonly elevation: number;
  readonly isRiver: boolean;
  readonly isCoastal: boolean;
  readonly isAquatic: boolean;
  readonly riverSegmentId?: RiverId;
  readonly isFloodplain: boolean;
  readonly isRiverbank: boolean;
  readonly isConfluence: boolean;
  readonly isEstuary: boolean;
  readonly isMarshChannel: boolean;
  // MAP2-R: marks tiles on a sub-tile creek/small-stream influence corridor
  // (debug/render visibility only — creeks act on the sim through the tile's
  // resource/risk profiles, never through this flag). Unset on maps without
  // authored creeks.
  readonly hasCreek?: boolean;
  readonly neighbors: readonly TileId[];
}

export interface WorldConfig {
  readonly width: number;
  readonly height: number;
  readonly seasonsPerYear: number;
  readonly yearsPerGeneration: number;
  readonly ticksPerGeneration: number;
}

export interface WorldRegion {
  readonly id: RegionId;
  readonly name?: string;
  readonly tileIds: readonly TileId[];
  readonly climateRegime?: ClimateRegime;
}

export interface ClimateStressSnapshot {
  readonly label: string;
  readonly severity: number;
  readonly affectedRegionIds: readonly RegionId[];
  readonly observedAt: WorldTime;
}

export interface WorldAuditOptions {
  // Benchmark-only switch used to compare activity-memory coupling ON/OFF.
  // Normal worlds leave this undefined.
  readonly activityMemoryCouplingDisabled?: boolean;
  // AG11: benchmark/experimental switch for the tiny activity-subsistence
  // supplement. Undefined/false is the normal default and must stay byte-identical
  // to the abstract economy floor.
  readonly activitySubsistenceSupplementEnabled?: boolean;
  // 2K.12: enable the seasonal-ecology MEMORY READERS — bands read their own learned
  // `seasonalEcologyMemory` to put a small, bounded, selection-only bias on
  // residence-unchanged target choices (resource scout / known-patch recheck, activity
  // target, water-check target) plus a record-only reasonId annotation on residential
  // moves. Undefined/false is the normal default and stays byte-identical to baseline;
  // no economy/yield/carrying-capacity/hidden-truth coupling either way.
  readonly seasonalEcologyMemoryReadersEnabled?: boolean;
  // RANGE-3B: daughter-colonization founder/fission bias override. Undefined is
  // normal MVP behaviour (enabled); benchmark audits set false to compare the old
  // conservative path. The bias only scores band-known underused-habitat opportunities
  // with route/ford/edge/side-country evidence. Never reads truth richness.
  readonly daughterColonizationFissionBiasEnabled?: boolean;
}

export interface WorldState {
  readonly config: WorldConfig;
  readonly time: WorldTime;
  readonly seed: SimulationSeed;
  // VAR-1 — run-variation seed (numeric hash). DISTINCT from `seed` (which is
  // the map-generation/terrain seed): runSeed perturbs only near-tie decision
  // ordering, never terrain/economy/demography. undefined = legacy (zero
  // jitter, byte-identical to pre-VAR-1 baselines). Set by the runner/UI.
  readonly runSeed?: number;
  readonly tiles: Readonly<Record<TileId, Tile>>;
  // M0.14 — persistent local depletion: SPARSE per-tile ecological wear
  // (0..0.85), advanced once per season from the shared-catchment extraction
  // index, recovering at the tile's own regeneration rate when unused.
  // Physical truth (not knowledge); lives here because the tiles record is
  // immutable and reference-stable (caches key on it). Optional so synthetic
  // fixture worlds and older constructors need no change.
  readonly tileDepletion?: Readonly<Record<TileId, number>>;
  // FAUNA/AQUATIC-1 — persistent finite fauna/aquatic stock dynamics: SPARSE
  // per-stock abundance (fraction of carrying capacity) + disturbance/avoidance.
  // Physical truth (not knowledge); placement geography is a pure function of the
  // tiles record (derived/memoized separately, never stored). Advanced once per
  // season from catchment occupation + in-season hunting/fishing trip depletion,
  // recovering when rested. Absent entry ⇒ baseline (full); whole field optional
  // so synthetic/fixture worlds and older constructors need no change.
  readonly faunaStocks?: Readonly<Record<string, FaunaStockDynamic>>;
  // ECO-BIOME-1 — sparse human-use depletion overlay on the plant-patch geography
  // (plant mirror of faunaStocks / tileDepletion). Physical truth; absent ⇒ no
  // human depletion. Advanced once per season from gathering trips + catchment
  // occupation, recovering at class-specific regrowth rates. Optional.
  readonly plantPatchState?: Readonly<Record<string, PlantPatchState>>;
  // TREE-FOREST-PATCHES-1 — sparse pressure/health overlay on deterministic
  // tree/forest patch summaries. Physical truth, not band knowledge; absent
  // means baseline forest health. Advanced once per season from local occupation
  // pressure and slow recovery. No per-tree agents or dense forest grid.
  readonly forestPatchState?: Readonly<Record<string, ForestPatchState>>;
  readonly climateRegime: ClimateRegime;
  readonly currentClimateStress: ClimateStressSnapshot | null;
  readonly auditOptions?: WorldAuditOptions;
  readonly regions: Readonly<Record<RegionId, WorldRegion>>;
  readonly rivers: Readonly<Record<RiverId, RiverSegmentProfile>>;
  readonly riverCrossings: Readonly<Record<string, RiverCrossingProfile>>;
  readonly bands: Readonly<Record<BandId, Band>>;
  readonly decisions: Readonly<Record<DecisionId, Decision>>;
  readonly decisionArchive: DecisionArchiveSummary;
}
