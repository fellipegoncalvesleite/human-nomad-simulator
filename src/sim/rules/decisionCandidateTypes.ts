// CORE-PIPELINE-DECOMPOSITION-2 — shared candidate contract.
//
// The types the decision orchestrator and the extracted candidate-family modules
// both depend on. Moved out of bandDecision.ts so a domain family module can own
// a candidate family (eligibility, evidence, benefits, risks, contribution)
// without importing the orchestrator, and without either side owning the shared
// contract. Types only — no runtime behavior, so extraction is byte-identical.
import type { getBiomeAdaptationFit } from "../agents/biomeAdaptation";
import type { deriveReportedKnowledgeTargetBias } from "../agents/reportedKnowledge";
import type { BandTendencyProfile } from "../agents/bandTendency";
import type { ChronicHardshipSignal } from "../agents/chronicHardship";
import type { AdaptiveDecisionSupport } from "../agents/adaptiveHuman";
import type { CampMovementDecisionSupport } from "../agents/campMovement";
import type { ResourceBeliefOpportunity } from "../agents/resourceKnowledge";
import type { ResidentialAnchorContext } from "../agents/residentialAnchor";
import type { SeasonalRoundScoringContext } from "../agents/seasonalRound";
import type { TickContextCache } from "../agents/contextCache";
import type {
  Band,
  BandPressureState,
  BandViabilityState,
  DaughterDispersalPressure,
  DryMarginMobilityContext,
  NearbyBandPressure,
  RangeSaturationState,
  FrontierDispersalPressure,
  TravelCorridorMemory,
} from "../agents/types";
import type { BandId, Coord, TileId, WorldTime } from "../core/types";
import type {
  RiverCrossingCapability,
  SeasonalRiverCrossingState,
} from "../world/hydrography";
import type { RiverCrossingProfile } from "../world/types";
import type { Action, Reason, ScoreBreakdown } from "./types";

export interface CandidateDecision {
  readonly action: Action;
  readonly scoreBreakdown: ScoreBreakdown;
  readonly score: number;
  readonly primaryReason: Reason;
  readonly secondaryReasons: readonly Reason[];
  readonly riverAssessment?: RiverMovementAssessment;
  // M0.8: an OPT-IN candidate (the M0.7 inferred-frontier probe, the M0.8 corridor
  // relocation) is excluded from `coreDeliberationBreadth` so that merely OFFERING it
  // (winning or not) cannot shift any band-known confidence that is coupled to how many
  // options were weighed (see memory.ts travel-corridor confidence). Core survival
  // candidates (stay/move/explore/probe/scout) leave this undefined.
  readonly isOptInCandidate?: boolean;
}

export interface RiverMovementAssessment {
  readonly crossing?: RiverCrossingProfile;
  readonly seasonalState?: SeasonalRiverCrossingState;
  readonly capability: RiverCrossingCapability;
  readonly capabilityLabel: string;
  readonly riverCrossingCost: number;
  readonly riverCrossingRisk: number;
  readonly riverCorridorValue: number;
  readonly knownFordValue: number;
  readonly blockedCrossingPenalty: number;
  readonly memoryUseCount: number;
  // CAUSAL-REPAIR-1 — practiced-crossing relief: the fraction of the raw
  // crossing risk removed by the band's OWN repeated successful use of THIS
  // crossing (KnownCrossingMemory useCount/successConfidence, discounted by
  // remembered risk, decaying with staleness). Local, capped, forgettable.
  readonly crossingPracticeRelief: number;
}

export type MovementDecisionSubphase =
  | "candidateGeneration"
  | "knownTileStats"
  | "corridorLookupBuild"
  | "knownMoveCandidateRadiusLookup"
  | "knownMoveCandidateFiltering"
  | "candidatePassabilityChecks"
  | "candidatePressureScoring"
  | "candidateOpportunityScoring"
  | "candidateMemoryScoring"
  | "candidateEncounterSocialScoring"
  | "candidateFrontierDispersalScoring"
  | "candidateSorting"
  | "candidateReasonHydration"
  | "reportBiasIntegration"
  | "sideCountryEvidenceLookup"
  | "adaptiveDecisionSupport"
  | "campMovementDecisionSupport"
  | "stuckSitePenalty"
  | "unknownFrontierCandidateSelection"
  | "inferredFrontierProbeSearch"
  | "corridorRelocationGoalSelection"
  | "finalDecisionSelection"
  | "movementApplication"
  | "observationUpdate"
  | "memoryUpdate"
  | "biomeAdaptationUpdate"
  | "pressureStateDerivation"
  | "pressureUpdate"
  | "adaptiveStateUpdate"
  | "animalPatternManagementUpdate"
  | "campMovementStateUpdate";

export interface MovementDecisionProfiler {
  readonly measure: <TResult>(
    phase: MovementDecisionSubphase,
    operation: () => TResult,
  ) => TResult;
  readonly count?: (name: string, amount?: number) => void;
}

export interface BandPressureSnapshot {
  readonly bandId: BandId;
  readonly tick: WorldTime["tick"];
  readonly currentTileId: TileId;
  readonly bandPressureState: BandPressureState;
  readonly nearbyBandPressure: NearbyBandPressure;
  readonly rangeSaturation: RangeSaturationState;
  readonly frontierDispersalPressure: FrontierDispersalPressure;
  readonly daughterDispersalPressure?: DaughterDispersalPressure;
  readonly encounterTension: number;
  readonly encounterTolerance: number;
  readonly biomeCurrentTileFit: number;
  readonly viabilityStatus: BandViabilityState;
}

export interface CandidateTileMemo {
  readonly tileId: TileId;
  readonly nearbyPressure: NearbyBandPressure;
  readonly daughterDispersal: DaughterDispersalPressure;
  readonly crowdingPenalty: number;
  readonly localUsePressure: number;
  readonly pressureRecovery: number;
  readonly biomeFit: ReturnType<typeof getBiomeAdaptationFit>;
  readonly placeAttachment: number;
  readonly attachmentValue: number;
  readonly rememberedReliability: number;
  readonly rememberedRisk: number;
  readonly familiarCorridor: number;
  readonly returnPlacePull: number;
  readonly parentAwayValue: number;
}

export interface CandidateEdgeMemo {
  readonly edgeKey: string;
  readonly toTilePassable: boolean;
  readonly riverAssessment: RiverMovementAssessment;
}

export interface CandidateEvaluationCache {
  readonly bandId: BandId;
  readonly tick: WorldTime["tick"];
  readonly pressureSnapshot: BandPressureSnapshot;
  readonly tileScoresByTileId: Map<TileId, CandidateTileMemo>;
  readonly edgeScoresByEdgeKey: Map<string, CandidateEdgeMemo>;
  readonly knownTileCount: number;
  readonly averageKnownTileConfidence: number;
  readonly previousMovementVector?: Coord;
  readonly parentAwayVector?: Coord;
  readonly corridorByEdgeKey: ReadonlyMap<string, TravelCorridorMemory>;
  readonly reportedBiasByKey: Map<string, ReturnType<typeof deriveReportedKnowledgeTargetBias>>;
  readonly sideCountryEvidenceIndex: { value?: ReadonlyMap<TileId, number> };
  readonly contextCache?: TickContextCache;
  readonly profiler?: MovementDecisionProfiler;
  readonly dryMarginContext?: DryMarginMobilityContext;
  readonly anchorContext?: ResidentialAnchorContext;
  readonly seasonalRoundContext?: SeasonalRoundScoringContext;
  // Resource-belief probe pressure (2K.1F), computed once per decision and shared by
  // the dry-margin probe-availability gate, the scout/probe candidate scores, and debug.
  readonly beliefOpportunity: ResourceBeliefOpportunity;
  readonly adaptiveSupport: AdaptiveDecisionSupport;
  readonly campMovementSupport: CampMovementDecisionSupport;
  // CAUSAL-REPAIR-1: computed once per decision — stable per-band tendencies and
  // the repeated-low-support escalation signal (both pure, band-known only).
  readonly tendencies: BandTendencyProfile;
  readonly hardship: ChronicHardshipSignal;
}

export type InferredFrontierTiles = NonNullable<Band["frontierKnowledge"]>["inferredTiles"];
