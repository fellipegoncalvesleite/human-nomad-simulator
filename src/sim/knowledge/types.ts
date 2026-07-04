import type {
  BandId,
  RegionId,
  RouteId,
  Season,
  SettlementId,
  TileId,
  WorldTime,
} from "../core/types";

export type ContactKind =
  | "direct"
  | "tracks"
  | "smoke"
  | "rumor"
  | "refugee"
  | "artifact";

export type RumorSubject =
  | "tile"
  | "band"
  | "settlement"
  | "route"
  | "risk"
  | "resource";

export interface TileObservation {
  readonly tileId: TileId;
  readonly observedAt: WorldTime;
  readonly season: Season;
  readonly observedRichness: number;
  readonly observedAquaticPotential: number;
  readonly observedRisk: number;
  readonly observerBandId?: BandId;
}

export interface ObservedSeasonalPattern {
  readonly peakSeasons: readonly Season[];
  readonly leanSeasons: readonly Season[];
  readonly reliability: number;
  readonly confidence: number;
}

export type KnowledgeSourceKind =
  | "personally_observed"
  | "physically_seen_on_spawn"
  | "inherited_memory"
  | "inherited_rumor"
  | "inherited_route_hint";

export interface KnownTileRecord {
  readonly tileId: TileId;
  readonly firstObservedAt: WorldTime;
  readonly lastObservedAt: WorldTime;
  readonly seasonsObserved: readonly Season[];
  readonly visits: number;
  readonly observedRichness: number;
  readonly observedWaterAccess?: number;
  readonly observedAquaticPotential: number;
  readonly observedMovementCost?: number;
  readonly observedRisk?: number;
  readonly observedStorageSuitability?: number;
  readonly observedSeasonalPattern?: ObservedSeasonalPattern;
  readonly confidence: number;
  readonly knowledgeSource: KnowledgeSourceKind;
}

export type MemoryInfluenceMode = "decision_relevant" | "ui_debug_only";

export type BroadWaterRole =
  | "river"
  | "coast"
  | "lake"
  | "wetland"
  | "dry"
  | "unknown";

export interface CompressedKnownTileSummary {
  readonly id: string;
  readonly tileCount: number;
  readonly sourceKnowledgeTypes: readonly KnowledgeSourceKind[];
  readonly confidence: number;
  readonly lastObservedAt: WorldTime;
  readonly seasonsObserved: readonly Season[];
  readonly broadTerrainRoles: readonly string[];
  readonly broadWaterRoles: readonly BroadWaterRole[];
  readonly canInfluenceDecisions: boolean;
  readonly influenceMode: MemoryInfluenceMode;
}

export interface KnownAreaSummary {
  readonly id: string;
  readonly tileCount: number;
  readonly sourceKnowledgeTypes: readonly KnowledgeSourceKind[];
  readonly confidence: number;
  readonly lastObservedAt: WorldTime;
  readonly seasonsObserved: readonly Season[];
  readonly broadTerrainRoles: readonly string[];
  readonly broadWaterRoles: readonly BroadWaterRole[];
  readonly canInfluenceDecisions: boolean;
  readonly influenceMode: MemoryInfluenceMode;
}

export interface KnownBandRecord {
  readonly bandId?: BandId;
  readonly firstObservedAt: WorldTime;
  readonly lastObservedAt: WorldTime;
  readonly confidence: number;
  readonly estimatedSize: number;
  readonly lastKnownTileId: TileId;
  readonly contactKind: ContactKind;
}

export interface KnownSettlementRecord {
  readonly settlementId?: SettlementId;
  readonly tileId: TileId;
  readonly firstObservedAt: WorldTime;
  readonly lastObservedAt: WorldTime;
  readonly confidence: number;
  readonly estimatedPopulation: number;
  readonly apparentPermanence: number;
  readonly observedStorage: number;
  readonly contactKind: ContactKind;
}

export interface PlaceAttachment {
  readonly tileId: TileId;
  readonly seasonsKnown: number;
  readonly practicalWeight: number;
  readonly ritualOrSymbolicWeight: number;
  readonly burialOrAncestorWeight: number;
  readonly claimStrength: number;
}

export interface RouteMemory {
  readonly routeId?: RouteId;
  readonly tileIds: readonly TileId[];
  readonly firstUsedAt: WorldTime;
  readonly lastUsedAt: WorldTime;
  readonly usualSeasons: readonly Season[];
  readonly expectedFoodValue: number;
  readonly expectedRisk: number;
  readonly confidence: number;
}

export interface RumorRecord {
  readonly subject: RumorSubject;
  readonly receivedAt: WorldTime;
  readonly sourceContactKind: ContactKind;
  readonly confidence: number;
  readonly tileId?: TileId;
  readonly bandId?: BandId;
  readonly settlementId?: SettlementId;
  readonly routeId?: RouteId;
  readonly regionId?: RegionId;
}

export interface KnowledgeState {
  readonly selfBandId: BandId;
  readonly observedTiles: Readonly<Record<TileId, KnownTileRecord>>;
  readonly compressedKnownTileSummaries: readonly CompressedKnownTileSummary[];
  readonly knownAreaSummaries: readonly KnownAreaSummary[];
  readonly knownBands: readonly KnownBandRecord[];
  readonly knownSettlements: readonly KnownSettlementRecord[];
  readonly knownRoutes: readonly RouteMemory[];
  readonly placeAttachments: readonly PlaceAttachment[];
  readonly tileObservationHistory: readonly TileObservation[];
  readonly rumors: readonly RumorRecord[];
}
