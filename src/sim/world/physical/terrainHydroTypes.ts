import type { WorldM0ContentIdentity, WorldM0RecipeDigest } from "./identity";

export interface WorldM0PointM {
  readonly xM: number;
  readonly yM: number;
}

export interface WorldM0StrategicCellRef {
  readonly row: number;
  readonly column: number;
}

export interface WorldM0StrategicEdgeRef {
  readonly first: WorldM0StrategicCellRef;
  readonly second: WorldM0StrategicCellRef;
}

export type LandformProvenanceFamily =
  | "stable_denudational"
  | "orogenic_uplift"
  | "volcanic_constructive"
  | "sedimentary_basin";

export interface LandformProvenanceProvince {
  readonly id: string;
  readonly family: LandformProvenanceFamily;
  readonly center: WorldM0PointM;
  readonly radiusXM: number;
  readonly radiusYM: number;
  readonly axisAngleRadians: number;
  readonly influenceRadiusM: number;
  readonly elevationOffsetMeters: number;
  readonly reliefMultiplier: number;
}

export type TerrainHydroTerminalKind =
  | "ocean_outlet"
  | "retained_closed_basin"
  | "external_domain_outlet";

export interface TerrainHydroTerminal {
  readonly id: string;
  readonly kind: TerrainHydroTerminalKind;
  readonly point: WorldM0PointM;
  readonly catchmentId: string;
  readonly localContributingAreaM2: number;
}

export interface TerrainCatchment {
  readonly id: string;
  readonly terminalId: string;
  readonly areaM2: number;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
}

export interface TerrainDepressionBasin {
  readonly id: string;
  readonly catchmentId: string;
  readonly floorElevationMeters: number;
  readonly spillElevationMeters: number | null;
  readonly outletTerminalId: string | null;
  readonly closedEndorheic: boolean;
  readonly areaM2: number;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
}

export interface TerrainDrainageNode {
  readonly id: string;
  readonly point: WorldM0PointM;
  readonly kind: "source" | "confluence" | "terminal";
  readonly terminalId: string | null;
}

export interface TerrainDrainageReach {
  readonly id: string;
  readonly upstreamNodeId: string;
  readonly downstreamNodeId: string;
  readonly downstreamReachId: string | null;
  readonly catchmentId: string;
  readonly terminalId: string;
  readonly geometry: readonly WorldM0PointM[];
  readonly lengthMeters: number;
  readonly contributingAreaM2: number;
  readonly localContributingAreaM2: number;
  readonly meanTerrainGradient: number;
  readonly localReliefMeters: number;
  readonly channelIncisionMeters: number;
}

export interface TerrainValleyCandidate {
  readonly id: string;
  readonly reachId: string;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
  readonly areaM2: number;
  readonly localReliefMeters: number;
}

export interface TerrainFloodplainCandidate {
  readonly id: string;
  readonly reachId: string;
  readonly boundaryRings: readonly (readonly WorldM0PointM[])[];
  readonly areaM2: number;
  readonly terrainSlope: number;
}

export interface PhysicalCrossingCandidate {
  readonly id: string;
  readonly reachId: string;
  readonly strategicEdge: WorldM0StrategicEdgeRef;
  readonly intersection: WorldM0PointM;
  readonly leftBank: WorldM0PointM;
  readonly rightBank: WorldM0PointM;
  readonly channelIncisionMeters: number;
  readonly firstApproachSlope: number;
  readonly secondApproachSlope: number;
}

export interface StrategicTerrainSummary {
  readonly cell: WorldM0StrategicCellRef;
  readonly landOceanClass: "land" | "ocean" | "mixed";
  readonly landAreaM2: number;
  readonly oceanAreaM2: number;
  readonly elevationMinMeters: number;
  readonly elevationMaxMeters: number;
  readonly elevationMeanMeters: number;
  readonly localReliefMeters: number;
  readonly slopeMean: number;
  readonly coastlineLengthMeters: number;
  readonly provenanceFractions: readonly {
    readonly provinceId: string;
    readonly areaFraction: number;
  }[];
  readonly catchmentIds: readonly string[];
  readonly reachIds: readonly string[];
  readonly depressionBasinIds: readonly string[];
  readonly valleyCandidateIds: readonly string[];
  readonly floodplainCandidateIds: readonly string[];
  readonly crossingCandidateIds: readonly string[];
}

export interface WorldM0TerrainHydroCandidateV2 {
  readonly schema: "world-m0-terrain-hydro-candidate/v2";
  readonly recipeDigest: WorldM0RecipeDigest;
  readonly physicalConstants: WorldM0ContentIdentity;
  readonly physicalGeneratorVersion: string;
  readonly repairPolicyVersion: string;
  readonly numericKernelVersion: string;
  readonly analysis: {
    readonly cellSizeMeters: 250;
    readonly width: number;
    readonly height: number;
    readonly boundaryModel: "finite_open_outflow";
    readonly flowAlgorithm: "d_infinity_v1";
  };
  readonly provenanceProvinces: readonly LandformProvenanceProvince[];
  readonly strategicTerrain: readonly StrategicTerrainSummary[];
  readonly coastline: readonly (readonly WorldM0PointM[])[];
  readonly terminals: readonly TerrainHydroTerminal[];
  readonly catchments: readonly TerrainCatchment[];
  readonly drainageNodes: readonly TerrainDrainageNode[];
  readonly drainageReaches: readonly TerrainDrainageReach[];
  readonly depressionBasins: readonly TerrainDepressionBasin[];
  readonly valleys: readonly TerrainValleyCandidate[];
  readonly floodplainCandidates: readonly TerrainFloodplainCandidate[];
  readonly crossingCandidates: readonly PhysicalCrossingCandidate[];
  readonly deterministicProvenance: {
    readonly repairOperationCount: number;
    readonly conditionedDepressionCount: number;
    readonly retainedDepressionCount: number;
  };
}
