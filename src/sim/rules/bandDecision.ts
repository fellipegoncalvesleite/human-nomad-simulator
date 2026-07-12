import { updateBandMemory } from "../agents/memory";
import { compressBandMemoryState } from "../agents/memoryCompression";
import {
  deriveResourceBeliefOpportunity,
  EMPTY_BELIEF_OPPORTUNITY,
  type ResourceBeliefOpportunity,
} from "../agents/resourceKnowledge";
import {
  derivePlantScoutObservationHint,
  type PlantScoutObservationHint,
} from "../agents/plantPatches";
import { derivePlantUseEligibility } from "../agents/plantUseEligibility";
import {
  appendRecentPlantUseTest,
  applyPlantUseTestFromEligibility,
} from "../agents/plantUseTesting";
import {
  appendRecentCauseSpecificEvent,
  deriveCauseSpecificEventFromPlantUseTest,
} from "../agents/causeSpecificEvent";
import { advanceExploitationSkill } from "../agents/exploitationSkill";
import {
  deriveMigrationWalk,
  deriveSeasonalTravelPlanForBand,
  MIGRATION_WALK_ENABLED,
  type MigrationWalkView,
} from "../agents/migrationWalk";
import {
  chooseDiverseProbeTarget,
  deriveProbeDiminishingReturn,
  probeTargetNovelty,
  recordProbe,
} from "../agents/probeMemory";
import {
  appendRecentScoutLearning,
  applyResourceScoutLearningDelta,
  buildScoutExpectationRecord,
  classifyScoutContradiction,
  classifyScoutOutcome,
  effectiveConfidenceProfile,
  expectationSeasonalFit,
  plantObservationMemoryFromHint,
  selectResourceScoutTarget,
  type ResourceScoutContext,
  type ResourceScoutCandidate,
  type ResourceScoutDebug,
} from "../agents/resourceScout";
// 2K.12: selection-only seasonal-memory reader (band-learned only; no hidden truth).
import { readSeasonalEcologyHint } from "../agents/seasonalEcologyReader";
import {
  effectiveResourceConfidence,
  updateResourceKnowledgeFromObservation,
  type ResourceKnowledgeState,
  type ResourcePatchMemory,
} from "../agents/resourceKnowledge";
import {
  advanceReportedKnowledgeAfterDecision,
  deriveReportedKnowledgeTargetBias,
} from "../agents/reportedKnowledge";
import {
  advanceAdaptiveHumanState,
  deriveAdaptiveDecisionSupport,
  selectAdaptiveInfluenceForAction,
  type AdaptiveDecisionSupport,
} from "../agents/adaptiveHuman";
import {
  advanceCampMovementState,
  deriveCampMovementDecisionSupport,
  selectCampMovementInfluenceForAction,
  type CampMovementDecisionSupport,
} from "../agents/campMovement";
import { deriveBandTendencies } from "../agents/bandTendency";
import type { BandTendencyProfile } from "../agents/bandTendency";
import { deriveChronicHardship } from "../agents/chronicHardship";
import type { ChronicHardshipSignal } from "../agents/chronicHardship";
import { getCanonicalFoodStress } from "../agents/seasonalSurvival";
import { deriveCrossingPracticeRelief } from "../agents/crossingPractice";
import {
  evaluateCareEfficacy,
  evaluateCarryingEfficacy,
  evaluateEngineeringEfficacy,
  evaluateHuntingEfficacy,
  evaluateMeasureEfficacy,
  evaluateShelterEfficacy,
  evaluateWaterStorageEfficacy,
  evaluateWaterRouteEfficacy,
} from "../agents/adaptiveEfficacy";
import {
  advancePracticalAdaptation,
  deriveCarryingCondition,
  deriveEffectiveStorageCapacity,
  deriveWaterStorageCondition,
  deriveWaterRouteCondition,
} from "../agents/practicalResponses";
import {
  advanceAnimalManagement,
  advanceAnimalPatternKnowledge,
} from "../agents/animalLearning";
import { deriveBaseHabitatPotential } from "../agents/habitatYield";
import { deriveResourceClassAvailability } from "../agents/resourceClasses";
import {
  getBiomeAdaptationFit,
  updateBiomeAdaptation,
} from "../agents/biomeAdaptation";
import {
  getCrowdingPenalty,
  getDaughterDispersalPressure,
  getNearbyBandPressure,
} from "../agents/crowding";
import { frontierIntentHold, frontierIntentPull } from "../agents/frontierIntent";
import { frontierResidenceInwardDamp, frontierResidenceOriginPullRelief, frontierResidenceStayHold } from "../agents/frontierResidence";
import { isChannelCorridorLand, isNearWaterMarginLand } from "../agents/frontierKnowledge";
import { getDepletionAdjustedRichness } from "../world/depletion";
import {
  deriveDryMarginMobilityContext,
  getDryMarginAttachmentMultiplier,
} from "../agents/dryMargin";
import {
  deriveResidentialAnchorContext,
  getAnchorHoldBonus,
  getAnchorRelocationHysteresis,
  summarizeIntraSeasonActivity,
  updateAnchorMemories,
  type ResidentialAnchorContext,
} from "../agents/residentialAnchor";
import {
  getSeasonalRoundDriftPenalty,
  getSeasonalRoundMovePull,
  getSeasonalRoundProbePull,
  getSeasonalRoundScoringContext,
  getSeasonalRoundStayPull,
  updateSeasonalRound,
  type SeasonalRoundScoringContext,
} from "../agents/seasonalRound";
import {
  advanceResidentialMovementIntentOutcomes,
  deriveResidentialMoveEventRing,
} from "../agents/residentialMoveEvent";
import type { TickContextCache } from "../agents/contextCache";
import {
  deriveBandPressureState,
  getLocalUsePressureValue,
  getPressureRecoveryValue,
  updateBandPressure,
} from "../agents/pressure";
import type {
  AnchorActionTrace,
  AnchorDecisionComparison,
  Band,
  BandPressureState,
  BandViabilityState,
  CorridorHeadingSource,
  CorridorRelocationState,
  DaughterDispersalPressure,
  DryMarginMobilityContext,
  NearbyBandPressure,
  RangeSaturationState,
  FrontierDispersalPressure,
  TravelCorridorMemory,
} from "../agents/types";
import type {
  BandId,
  Coord,
  DecisionId,
  ReasonId,
  Season,
  TickNumber,
  TileId,
  WorldTime,
} from "../core/types";
import { MOVEMENT_TIEBREAK_EPSILON, seededTieBreakJitter } from "../core/seededVariation";
import type { KnownTileRecord, KnowledgeState, TileObservation } from "../knowledge/types";
import { getNeighborTiles, getTile } from "../world/generate";
import {
  getRiverCrossingForMovement,
  getSeasonalRiverCrossingState,
  makeRiverCrossingKey,
  type RiverCrossingCapability,
  type SeasonalRiverCrossingState,
} from "../world/hydrography";
import { getSeasonalTileConditions } from "../world/seasonal";
import type { RiverCrossingProfile, Tile, WorldState } from "../world/types";
import {
  advanceCorridorHeading,
  advanceFrontierProbeCadence,
  evaluateMobilityIntent,
  type MobilityIntentEvaluation,
} from "./mobilityIntent";
import type {
  Action,
  AlternativeConsidered,
  Decision,
  DecisionContextSnapshot,
  MobilityIntentKind,
  Reason,
  ScoreBreakdown,
} from "./types";
import { RECENT_BAND_DECISION_HISTORY_LIMIT } from "./decisionArchive";

const RECENT_TILE_OBSERVATION_HISTORY_LIMIT = 180;

// PERF-4: movement candidate topology is static for a generated map. Cache
// sorted neighbor rings by tile/topology so each band/tick does not rebuild the
// same id-ordered arrays. Values are immutable projections of world.tiles only,
// not band knowledge or hidden richness, so decision semantics stay identical.
const sortedNeighborIdsByTile = new WeakMap<Tile, readonly TileId[]>();
const knownMoveRadiusCacheByTiles = new WeakMap<WorldState["tiles"], Map<TileId, readonly TileId[]>>();
const knownTileStatsByObservedTiles = new WeakMap<KnowledgeState["observedTiles"], KnownTileStats>();
const corridorLookupByTravelCorridors = new WeakMap<
  Band["travelCorridors"],
  ReadonlyMap<string, TravelCorridorMemory>
>();

interface KnownTileStats {
  readonly count: number;
  readonly averageConfidence: number;
}

function getSortedNeighborIds(tile: Tile): readonly TileId[] {
  const cached = sortedNeighborIdsByTile.get(tile);

  if (cached !== undefined) {
    return cached;
  }

  const sorted = [...tile.neighbors].sort(compareTileIds);
  sortedNeighborIdsByTile.set(tile, sorted);

  return sorted;
}

// Resource-belief probe coupling (2K.1F). The hard-capped probePressure
// (<= BELIEF_PROBE_PRESSURE_CAP, ~0.08) is scaled into the logistical-probe
// candidate score. Small so it tips genuinely-borderline "stay/blind-move vs
// scout-first" decisions toward scouting without ever dominating water, attachment,
// risk, route, or anchor logic. Probe candidate only — never a relocation candidate.
// EMPIRICAL CALIBRATION CONSTANT (2K.1F; audited 2K.1F-A), not a historical law.
const BELIEF_PROBE_SCORE_WEIGHT = 2.4;
const VISIBLE_LANDSCAPE_PROBE_SCORE_WEIGHT = 2.0;

// Probe target diversity + diminishing returns (2K.1G). How strongly a detected
// no-information same-target probe loop degrades the logistical-probe candidate score,
// so the band stays/forages/moves instead of re-scouting the same tile every season.
// Suppressed inside deriveProbeDiminishingReturn when water need makes the recheck
// rational. EMPIRICAL CALIBRATION CONSTANT (2K.1G), not a historical law.
const PROBE_DIMINISHING_RETURN_SCORE_WEIGHT = 1.0;

// Resource-scout value-of-information weight (2K.1H): scales the bounded VOI score of
// the best scout candidate into the resource_scout candidate score, so beliefs about
// resources elsewhere can win a residence-unchanged INFORMATION action over stay /
// blind move — never a relocation candidate. EMPIRICAL CALIBRATION CONSTANT (2K.1H).
const RESOURCE_SCOUT_SCORE_WEIGHT = 2.6;

// Inferred-frontier curiosity weight (M0.7): the SMALL, cautious pull a settled band
// feels to reconnoitre its band-known INFERRED near-water corridor (formed by
// [[frontierKnowledge]] M0.6 — "a reachable near-water LAND tile likely continues here").
// It expresses curiosity about reachable land the band believes EXISTS, NOT a belief the
// tile is rich/good (inference carries NO richness, so NOTHING here adds food/yield/
// opportunity value). A tie-breaker, well under water/refuge/risk/attachment; the probe is gated to
// SETTLED bands (no active frontier intent/residence/dispersal) so it never disturbs the
// frontier expansion/retention M0.3–M0.5 built. On a visit, normal observation replaces
// the inference with real KnownTileRecord data, and only THEN can ordinary opportunity/
// yield logic evaluate the tile. EMPIRICAL CONSTANT.
const INFERRED_FRONTIER_EXPLORE_PULL = 0.16;

// Inferred-frontier PROBE radius (M0.7): a SETTLED band holding inferred near-water
// corridor knowledge (it dwells on the margin, so its immediate neighbours are already
// observed and explore_unknown_neighbor cannot act) may send a residence-UNCHANGED
// logistical_probe to the NEAREST inferred frontier tile within this bounded radius —
// observing it (inference → real KnownTileRecord) without relocating. Small, so the probe
// stays a plausible local reconnaissance, not a long expedition.
const INFERRED_FRONTIER_PROBE_RADIUS = 4;

// M0.16B — off-corridor SIDE-COUNTRY probe (knowledge CONSUMPTION). M0.16 formed abundant
// off-corridor side existence beliefs but they were behaviourally INERT: the M0.7 gate rejects
// settled/anchored corridor bands and the probe's tiny pull loses to a comfortable stay, so
// side inference was never scouted into real observation (HEAT 500y byte-identical; side-probe
// wins = 0). This lets a SETTLED/ANCHORED corridor band OCCASIONALLY spend a residence-
// UNCHANGED logistical_probe to OBSERVE its inferred side land — a rare INFORMATION action,
// never a relocation/migration force. Strict caps below keep it rare and bounded.
//
// Minimum seasons between a band's side probes (16 = 4 years) — structural rarity.
const SIDE_COUNTRY_PROBE_COOLDOWN_SEASONS = 16;
// Hard per-band lifetime budget — after this many side probes the band stops offering them.
const SIDE_COUNTRY_PROBE_LIFETIME_CAP = 12;
// Survival gate: a band under SEVERE food stress is surviving, not scouting — block it
// (urgent forage/refuge moves stay first; they also outscore the probe). HEAT corridor bands
// run at moderate stress normally, so this is set to genuine severity, not mere discomfort.
const SIDE_COUNTRY_PROBE_MAX_FOOD_STRESS = 0.6;
// Sustained-presence floor for a non-residence-anchored band to count as "settled enough".
const SIDE_COUNTRY_PROBE_MIN_VISITS = 3;
// Information motive (routed through the principled `explorationValue` channel). Unlike M0.7's
// tiny 0.16 pull (which always loses to a comfortable corridor stay), this is sized so a side
// probe CAN win against a comfortable stay WHEN ELIGIBLE — information is worth gathering even
// when not starving — while a genuine expansion/refuge move (higher-scoring) still beats it and
// a poor route self-suppresses (route/risk cost). EMPIRICAL, calibrated on HEAT heat-1/heat-2:
// 0.16/1.5 → 0 wins (loses to everything); 10 → 38 wins/250y (saturates the cap); 2.5 → 6–9
// wins/250y (a moderate "sometimes", well under the lifetime cap, no collapse, reach intact).
// The hard cooldown + lifetime cap make volume safe regardless, so this targets reliable wins
// when eligible rather than a knife-edge.
const SIDE_COUNTRY_PROBE_EXPLORATION_VALUE = 2.5;

// 2K.6B / INFO-1 — PROACTIVE resource information-seeking. 2K.6 built a learned-exploitation-
// skill substrate, but in-vivo accrual was ~0 because stable bands almost never autonomously
// scout/test resources (they only learn under duress). Real foragers buy information cheaply
// in good times because it reduces FUTURE risk. This lets a STABLE, spare-labor band
// OCCASIONALLY win the existing residence-UNCHANGED resource_scout toward an UNDER-KNOWN
// NEARBY patch/side-country — feeding the scout→plant-test→2K.6-skill chain. NOT random
// exploration, NOT migration, NOT yield: gated hard and rare (cooldown-bounded).
const PROACTIVE_INFO_COOLDOWN_SEASONS = 12; // ≤ ~1 proactive scout per 3 years per band
const PROACTIVE_INFO_MAX_FOOD_STRESS = 0.5; // not in survival crisis (then it forages, not learns)
const PROACTIVE_INFO_MAX_MOBILITY_PRESSURE = 0.75; // not URGENTLY driven to relocate (a residence-
// unchanged scout does not prevent moving next season; a genuine high-priority move still outscores it)
const PROACTIVE_INFO_MIN_LABOR = 6; // has labor/logistical capacity to spare for learning
// Information motive added when eligible — sized (like the M0.16B side probe) so a proactive
// scout CAN win over a comfortable stay WHEN ELIGIBLE, while a real expansion/refuge move
// (higher-scoring) still beats it; the long cooldown makes volume safe regardless. EMPIRICAL.
const PROACTIVE_INFO_PULL = 2.5;

// STUCK-SITE-1: staying in known harsh country can be valid, but a band should
// not sit indefinitely on a site its own pressure model says is failing. This
// penalty weakens only the stay candidate after multi-year same-tile dwell on a
// bad site; all route, water, risk, passability, and knowledge gates still decide
// which non-stay action can win.
const BAD_SITE_STUCK_SOFT_SEASONS = 6;
const BAD_SITE_STUCK_HARD_SEASONS = 18;
const BAD_SITE_STUCK_MIN_PRESSURE = 0.28;
const BAD_SITE_STUCK_MAX_STAY_PENALTY = 1.65;
const BAD_SITE_STUCK_INFO_ACTION_PENALTY_SCALE = 0.55;

// M0.8 corridor relocation: the band must have dwelt at its current tile this many seasons
// before it relocates one step along the corridor — so the walk is stepwise (settle → step
// → settle), not a continuous nomadic shuffle, and residence/anchor safety stays relevant.
const CORRIDOR_RELOCATION_MIN_VISITS = 3;
// The corridor-progress curiosity for a RELOCATION (a real base move) is smaller than the
// residence-unchanged probe's: a move must clear the band's stay/anchor value on its own
// observed merits, so this only tips a genuinely borderline step toward the believed
// corridor — it never overrides a good refuge/forage (residence/anchor safety stays first).
const CORRIDOR_RELOCATION_PULL = 0.08;
// M0.8-A rate-limit / anchor reluctance. M0.8's dwell gate keyed on the ABSOLUTE per-tile
// visitCount, so a band stepping onto an already-familiar tile could re-step immediately —
// settled/parent bands drifted along the shore (1740 steps/200y). These bound the walk to a
// genuine settle→step→settle cadence keyed on the LAST RELOCATION (not absolute visits) and
// make it eventually settle, WITHOUT undoing M0.8 (progress / anti-omniscience preserved).
//
// Minimum seasons a band must DWELL at its new locus after a corridor relocation before it
// may relocate again (8 seasons = 2 years). This is the dwell-since-last-relocation cooldown.
const CORRIDOR_RELOCATION_COOLDOWN_SEASONS = 8;
// After this many settled seasons with no relocation the band is deemed genuinely
// re-anchored: its un-settled step run dissolves and the per-step reluctance decays to 0.
const CORRIDOR_RELOCATION_SETTLE_RESET_SEASONS = 24;
// Each accumulated un-settled step adds this much score reluctance (capped), so a band that
// has already drifted several steps without re-anchoring grows reluctant to step again — the
// walk converges instead of wandering. Cap is below the curiosity pull, so reluctance erodes
// the curiosity tip (not the step's REAL observed value): genuine local value can still move.
const CORRIDOR_RELOCATION_RELUCTANCE_PER_STEP = 0.015;
const CORRIDOR_RELOCATION_RELUCTANCE_CAP = 0.06;

interface CandidateDecision {
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

interface KnownTileCandidate {
  readonly tile: Tile;
  readonly record: KnownTileRecord;
  readonly distance: number;
}

interface ObservationTarget {
  readonly tile: Tile;
  readonly distance: number;
}

interface UnknownFrontierCandidate {
  readonly tileId: TileId;
  readonly directionVector: Coord;
  readonly score: number;
  readonly frontierProbeValue: number;
  readonly parentAwayValue: number;
  readonly inferredRisk: number;
  readonly riverCrossingCost: number;
  readonly riverCrossingRisk: number;
  readonly blockedCrossingPenalty: number;
}

interface RiverMovementAssessment {
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

interface BandPressureSnapshot {
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

interface CandidateTileMemo {
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

interface CandidateEdgeMemo {
  readonly edgeKey: string;
  readonly toTilePassable: boolean;
  readonly riverAssessment: RiverMovementAssessment;
}

type InferredFrontierTiles = NonNullable<Band["frontierKnowledge"]>["inferredTiles"];

interface InferredFrontierProbeTarget {
  readonly tileId: TileId;
  readonly routeDistance: number;
  readonly routeRisk: number;
}

interface CandidateEvaluationCache {
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

function createCandidateEvaluationCache(
  world: WorldState,
  band: Band,
  contextCache: TickContextCache | undefined,
  profiler: MovementDecisionProfiler | undefined,
): CandidateEvaluationCache {
  const pressureSnapshot = measureDecision(
    profiler,
    "pressureStateDerivation",
    () => createBandPressureSnapshot(world, band, contextCache),
  );
  const currentTile = getTile(world, band.position);
  // Resource-belief probe pressure (2K.1F): derived once here from the band's own
  // bounded resource memories + current water/return stress, then shared by the
  // probe-availability gate and the scout/probe candidate scoring below.
  const beliefOpportunity = currentTile === undefined
    ? EMPTY_BELIEF_OPPORTUNITY
    : deriveBandBeliefOpportunity(world, band, currentTile.id, pressureSnapshot);
  const { dryMarginContext, anchorContext, seasonalRoundContext } = measureDecision(
    profiler,
    "candidateOpportunityScoring",
    () => deriveDryMarginDecisionBundle(world, band, contextCache, beliefOpportunity.stressProbePressure),
  );
  const knownTileStats = measureDecision(
    profiler,
    "knownTileStats",
    () => getKnownTileStats(band.knowledge),
  );
  const corridorByEdgeKey = measureDecision(
    profiler,
    "corridorLookupBuild",
    () => buildCorridorLookup(band),
  );
  const adaptiveSupport = measureDecision(
    profiler,
    "adaptiveDecisionSupport",
    () => deriveAdaptiveDecisionSupport(world, band),
  );
  const campMovementSupport = measureDecision(
    profiler,
    "campMovementDecisionSupport",
    () => deriveCampMovementDecisionSupport(world, band),
  );
  const tendencies = deriveBandTendencies(band);
  const hardship = deriveChronicHardship(band, tendencies);

  return {
    bandId: band.id,
    tick: world.time.tick,
    pressureSnapshot,
    beliefOpportunity,
    adaptiveSupport,
    campMovementSupport,
    tendencies,
    hardship,
    tileScoresByTileId: new Map<TileId, CandidateTileMemo>(),
    edgeScoresByEdgeKey: new Map<string, CandidateEdgeMemo>(),
    knownTileCount: knownTileStats.count,
    averageKnownTileConfidence: knownTileStats.averageConfidence,
    previousMovementVector: getPreviousMovementVector(world, band),
    parentAwayVector: currentTile === undefined ? undefined : getParentAwayVector(world, band, currentTile),
    corridorByEdgeKey,
    reportedBiasByKey: new Map<string, ReturnType<typeof deriveReportedKnowledgeTargetBias>>(),
    sideCountryEvidenceIndex: {},
    contextCache,
    profiler,
    dryMarginContext,
    anchorContext,
    seasonalRoundContext,
  };
}

interface DryMarginDecisionBundle {
  readonly dryMarginContext?: DryMarginMobilityContext;
  readonly anchorContext?: ResidentialAnchorContext;
  readonly seasonalRoundContext?: SeasonalRoundScoringContext;
}

// Single gated per-tick derivation path for the stacked dry-margin layers (2I.5,
// PART 4): dry-margin context → residential anchor → seasonal-round scoring view.
// Each layer is gated on the previous (anchor needs dry context; round-scoring
// needs an anchor), so a non-dry-margin band exits after one cheap check. The
// results are cached pre-decision so applyBandDecision can reuse them as the
// post-decision state when the residence does not move (avoids re-derivation).
function deriveDryMarginDecisionBundle(
  world: WorldState,
  band: Band,
  contextCache: TickContextCache | undefined,
  beliefProbePressure: number,
): DryMarginDecisionBundle {
  const dryMarginContext = deriveDryMarginMobilityContext(world, band, contextCache, beliefProbePressure);
  const anchorContext = deriveResidentialAnchorContext(world, band, dryMarginContext, contextCache);
  const seasonalRoundContext = anchorContext === undefined
    ? undefined
    : getSeasonalRoundScoringContext(band, world);

  contextCache?.preDecisionDryContextByBandId.set(band.id, dryMarginContext);
  contextCache?.preDecisionAnchorByBandId.set(band.id, anchorContext);
  contextCache?.preDecisionSeasonalRoundByBandId.set(band.id, seasonalRoundContext);

  return { dryMarginContext, anchorContext, seasonalRoundContext };
}

function createBandPressureSnapshot(
  world: WorldState,
  band: Band,
  contextCache: TickContextCache | undefined,
): BandPressureSnapshot {
  const currentTile = getTile(world, band.position);
  const nearbyBandPressure = getNearbyBandPressure(world, band, band.position, contextCache);
  const daughterDispersalPressure = getDaughterDispersalPressure(world, band, band.position, contextCache);

  return {
    bandId: band.id,
    tick: world.time.tick,
    currentTileId: band.position,
    bandPressureState: deriveBandPressureState(world, band, contextCache),
    nearbyBandPressure,
    rangeSaturation:
      contextCache?.rangeSaturationByBandId.get(band.id) ??
      band.rangeSaturation ??
      createEmptyRangeSaturation(world, band),
    frontierDispersalPressure: band.frontierDispersal ?? createEmptyFrontierDispersal(band),
    daughterDispersalPressure,
    encounterTension: getLatestEncounterTension(band),
    encounterTolerance: getLatestEncounterTolerance(band),
    biomeCurrentTileFit: currentTile === undefined
      ? 0
      : getBiomeAdaptationFit(band.biomeAdaptation, currentTile).competence,
    viabilityStatus: band.viability ?? createDefaultViabilityState(band),
  };
}

function getCandidateTileMemo(
  world: WorldState,
  band: Band,
  tile: Tile,
  decisionCache: CandidateEvaluationCache,
): CandidateTileMemo {
  const existing = decisionCache.tileScoresByTileId.get(tile.id);

  if (existing !== undefined) {
    return existing;
  }

  const pressureMemo = measureDecision(
    decisionCache.profiler,
    "candidatePressureScoring",
    () => {
      const nearbyPressure = tile.id === band.position
        ? decisionCache.pressureSnapshot.nearbyBandPressure
        : getNearbyBandPressure(world, band, tile.id, decisionCache.contextCache);
      const daughterDispersal = tile.id === band.position && decisionCache.pressureSnapshot.daughterDispersalPressure !== undefined
        ? decisionCache.pressureSnapshot.daughterDispersalPressure
        : getDaughterDispersalPressure(world, band, tile.id, decisionCache.contextCache);

      return {
        nearbyPressure,
        daughterDispersal,
        crowdingPenalty: getCrowdingPenalty(tile, nearbyPressure),
        localUsePressure: getLocalUsePressureValue(band.usePressure[tile.id]),
        pressureRecovery: getPressureRecoveryValue(band.usePressure[tile.id]),
      };
    },
  );
  const memoryMemo = measureDecision(
    decisionCache.profiler,
    "candidateMemoryScoring",
    () => {
      const placeMemory = band.placeMemory[tile.id];
      const placeAttachment = placeMemory?.attachment ?? 0;
      const returnPlacePull = placeMemory?.isReturnPlace === true
        ? clamp01((placeMemory.attachment + placeMemory.confidence) / 2)
        : 0;

      return {
        placeAttachment,
        attachmentValue: Math.max(getAttachmentValue(band, tile.id), placeAttachment),
        rememberedReliability: getRememberedReliability(placeMemory),
        rememberedRisk: placeMemory?.lastKnownRiskEstimate ?? 0,
        familiarCorridor: getFamiliarCorridorValue(decisionCache, band.position, tile.id),
        returnPlacePull,
      };
    },
  );
  const socialMemo = measureDecision(
    decisionCache.profiler,
    "candidateEncounterSocialScoring",
    () => ({
      parentAwayValue: getParentAwayValue(world, band, tile),
    }),
  );
  const biomeFit = measureDecision(
    decisionCache.profiler,
    "candidateOpportunityScoring",
    () => getBiomeAdaptationFit(band.biomeAdaptation, tile),
  );
  const memo: CandidateTileMemo = {
    tileId: tile.id,
    ...pressureMemo,
    ...memoryMemo,
    ...socialMemo,
    biomeFit,
  };

  decisionCache.tileScoresByTileId.set(tile.id, memo);

  return memo;
}

function getCandidateEdgeMemo(
  world: WorldState,
  band: Band,
  fromTileId: TileId,
  toTileId: TileId,
  intentKind: MobilityIntentKind | undefined,
  decisionCache: CandidateEvaluationCache,
): CandidateEdgeMemo {
  const edgeKey = `${fromTileId}->${toTileId}:${intentKind ?? "none"}`;
  const existing = decisionCache.edgeScoresByEdgeKey.get(edgeKey);

  if (existing !== undefined) {
    return existing;
  }

  const memo = measureDecision(
    decisionCache.profiler,
    "candidatePassabilityChecks",
    () => {
      const targetTile = getTile(world, toTileId);

      return {
        edgeKey,
        toTilePassable: targetTile !== undefined && isBandPassableDestination(targetTile),
        riverAssessment: getRiverMovementAssessment(world, band, fromTileId, toTileId, intentKind),
      };
    },
  );

  decisionCache.edgeScoresByEdgeKey.set(edgeKey, memo);

  return memo;
}

function createEmptyRangeSaturation(
  world: WorldState,
  band: Band,
): RangeSaturationState {
  return {
    bandId: band.id,
    focalTileId: band.position,
    localBandCount: 1,
    localPopulationEstimate: band.demography.population,
    localUsePressure: 0,
    nearbyCrowding: 0,
    effectiveHabitatSuitability: 0,
    perCapitaReturnEstimate: 0,
    saturationPressure: 0,
    confidence: 0,
    reasonIds: [`reason:${band.id}:${world.time.tick}:range-saturation-empty` as ReasonId],
  };
}

function createEmptyFrontierDispersal(band: Band): FrontierDispersalPressure {
  return {
    bandId: band.id,
    pressure: 0,
    preferredCorridor: "unknown",
    frontierCandidateTileIds: [],
    reasonIds: [],
  };
}

function createDefaultViabilityState(band: Band): BandViabilityState {
  return {
    bandId: band.id,
    population: band.demography.population,
    minimumViablePopulation: 14,
    viabilityPressure: 0,
    extinctionRisk: 0,
    absorptionOpportunity: 0,
    status: "viable",
    reasonIds: [],
  };
}

function measureDecision<TResult>(
  profiler: MovementDecisionProfiler | undefined,
  phase: MovementDecisionSubphase,
  operation: () => TResult,
): TResult {
  return profiler === undefined ? operation() : profiler.measure(phase, operation);
}

function buildCorridorLookup(band: Band): ReadonlyMap<string, TravelCorridorMemory> {
  const cached = corridorLookupByTravelCorridors.get(band.travelCorridors);

  if (cached !== undefined) {
    return cached;
  }

  const corridors = new Map<string, TravelCorridorMemory>();

  for (const corridor of Object.values(band.travelCorridors)) {
    corridors.set(makeTilePairKey(corridor.fromTileId, corridor.toTileId), corridor);
  }

  corridorLookupByTravelCorridors.set(band.travelCorridors, corridors);

  return corridors;
}

function getKnownTileStats(knowledge: KnowledgeState): KnownTileStats {
  const cached = knownTileStatsByObservedTiles.get(knowledge.observedTiles);

  if (cached !== undefined) {
    return cached;
  }

  let count = 0;
  let confidenceSum = 0;

  for (const record of Object.values(knowledge.observedTiles)) {
    count += 1;
    confidenceSum += record.confidence;
  }

  const stats = {
    count,
    averageConfidence: count === 0 ? 0 : confidenceSum / count,
  };
  knownTileStatsByObservedTiles.set(knowledge.observedTiles, stats);

  return stats;
}

export function evaluateBandDecision(
  world: WorldState,
  band: Band,
  contextCache?: TickContextCache,
  profiler?: MovementDecisionProfiler,
): Decision {
  const decisionId = makeDecisionId(world.time, band.id);
  const intentEvaluation = evaluateMobilityIntent(world, band);
  const decisionCache = createCandidateEvaluationCache(world, band, contextCache, profiler);
  const candidates = measureDecision(
    profiler,
    "candidateGeneration",
    () => {
      const unsorted = [
        ...buildDecisionCandidates(world, band, decisionId, intentEvaluation, decisionCache),
      ];
      profiler?.count?.("candidateCount", unsorted.length);

      return measureDecision(
        profiler,
        "candidateSorting",
        () => sortCandidatesWithSeededTieBreak(world, band, unsorted),
      );
    },
  );
  const rankedCandidates = applyResidentialRelocationClearance(world, band, candidates);
  const chosen = measureDecision(
    profiler,
    "finalDecisionSelection",
    () => hydrateChosenCandidateReasons(
      world,
      band,
      decisionId,
      rankedCandidates[0] ?? buildNoOpCandidate(world, band, decisionId),
      decisionCache,
    ),
  );
  const alternativesConsidered = measureDecision(
    profiler,
    "candidateReasonHydration",
    () => rankedCandidates.map((candidate, index) => ({
      action: candidate.action,
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      rejectionReason:
        index === 0
          ? undefined
          : getRejectionReason(world, band, decisionId, candidate, chosen),
      // M0.8-B: surface the M0.8 corridor-relocation marker on the archived alternative so an
      // audit can count OFFERS (incl. losing ones). Archive-only metadata — not read by scoring.
      isCorridorRelocation:
        candidate.primaryReason.type === "frontier_probe" &&
        candidate.primaryReason.isCorridorRelocation === true
          ? true
          : undefined,
    })),
  );

  // M0.8: stable deliberation breadth = the CORE survival candidates only (opt-in helper
  // candidates excluded), so band-known confidence coupled to it cannot be perturbed by
  // merely offering an opt-in probe/relocation candidate. In accepted (pre-M0.8) runs no
  // candidate is opt-in, so this equals the old `candidates.length` → byte-identical.
  const coreDeliberationBreadth = candidates.reduce(
    (count, candidate) => (candidate.isOptInCandidate === true ? count : count + 1),
    0,
  );

  return {
    id: decisionId,
    bandId: band.id,
    time: world.time,
    action: chosen.action,
    primaryReason: chosen.primaryReason,
    secondaryReasons: chosen.secondaryReasons,
    alternativesConsidered,
    coreDeliberationBreadth,
    contextSnapshot: getDecisionContextSnapshot(world, band, decisionCache.knownTileCount),
    mobilityIntent: intentEvaluation.activeIntent,
    intentStatus: intentEvaluation.status,
  };
}

function applyResidentialRelocationClearance(
  world: WorldState,
  band: Band,
  candidates: readonly CandidateDecision[],
): readonly CandidateDecision[] {
  const top = candidates[0];
  if (top === undefined || (top.action.type !== "move_to_tile" && top.action.type !== "explore_unknown_neighbor")) {
    return candidates;
  }
  const stay = candidates.find((candidate) => candidate.action.type === "stay");
  if (stay === undefined) return candidates;
  const dependency = (band.demography.dependents + band.demography.elders) / Math.max(1, band.demography.population);
  const clearance = 0.08 +
    getRecentRelocationSettlementCost(world, band) * 0.42 +
    (band.pressureState?.fatiguePressure ?? 0) * 0.2 +
    dependency * 0.05;
  if (top.score >= stay.score + clearance) return candidates;
  // The move remains an inspected alternative; a residence-unchanged scout or
  // stay wins until the known improvement clears whole-band establishment cost.
  return [stay, ...candidates.filter((candidate) => candidate !== stay)];
}

function hydrateChosenCandidateReasons(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  candidate: CandidateDecision,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision {
  const tileId = getActionRelatedTileId(candidate.action, band.position);
  const tile = getTile(world, tileId);

  if (tile === undefined || candidate.riverAssessment === undefined) {
    return candidate;
  }

  return {
    ...candidate,
    secondaryReasons: [
      ...candidate.secondaryReasons,
      ...buildCommonSecondaryReasons(
        decisionId,
        band,
        tile,
        candidate.scoreBreakdown,
        candidate.action,
        world,
        world.time.season,
        candidate.riverAssessment,
        candidate.secondaryReasons.length,
        decisionCache,
      ),
    ],
  };
}

export function applyBandDecision(
  world: WorldState,
  band: Band,
  decision: Decision,
  contextCache?: TickContextCache,
  profiler?: MovementDecisionProfiler,
): Band {
  const targetTileId = getDecisionTargetTileId(decision.action, band.position);
  const isMovementAction =
    decision.action.type === "move_to_tile" ||
    decision.action.type === "explore_unknown_neighbor";
  // logistical_probe and resource_scout are both residence-UNCHANGED scouting actions:
  // they observe the target area (perception) but never move the residential base.
  const isScoutAction = decision.action.type === "resource_scout";
  const isProbeAction = decision.action.type === "logistical_probe" || isScoutAction;
  const riverAssessment = getRiverMovementAssessment(
    world,
    band,
    band.position,
    targetTileId,
    decision.mobilityIntent?.kind,
  );
  const crossingBlocked =
    (isMovementAction || isProbeAction) &&
    riverAssessment.blockedCrossingPenalty > 0.8;
  const targetTile = getTile(world, targetTileId);
  const destinationBlocked =
    (isMovementAction || isProbeAction) &&
    (targetTile === undefined || !isBandPassableDestination(targetTile));
  const canonicalNextPosition =
    crossingBlocked || destinationBlocked || !isMovementAction ? band.position : targetTile?.id ?? band.position;
  // SPIKE (2026-06-15) — cause-gated migration walk. A COMMITTED migration (a residential
  // move under a migration-class mobility intent with real persistence) is realized as a
  // contiguous breadcrumb PATH of single-tile steps in the band's own chosen direction,
  // instead of a single ≤2-tile hop. The marker is a seasonal residential base, and a mobile
  // forager's base displaces well beyond ~3 km/season; this gives the base realistic per-season
  // reach WITHOUT teleporting (each step is grid-distance 1, anti-omniscient, cause-scaled).
  // It is a pure REALIZER of the already-scored decision — it never re-runs the scorer. A
  // low-commitment / non-migration move keeps the canonical single hop (byte-identical).
  const migrationWalk =
    canonicalNextPosition !== band.position && isMovementAction
      ? deriveAppliedMigrationWalk(world, band, decision, targetTileId)
      : undefined;
  const nextPosition = migrationWalk?.endpointTileId ?? canonicalNextPosition;
  const moved = nextPosition !== band.position;
  // ADAPTIVE EFFICACY FEEDBACK-1: compact decision-time + realized crossing
  // context for response-specific efficacy. All fields come from the SAME
  // river assessment the decision paid (no recomputation); the used crossing
  // is the memoized lookup the memory system itself applies to this move.
  const usedCrossing = moved
    ? getRiverCrossingForMovement(world, band.position, nextPosition)
    : undefined;
  const crossingOutcome = {
    attemptedCrossingKey: riverAssessment.crossing === undefined
      ? undefined
      : makeRiverCrossingKey(riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId),
    practiceRelief: riverAssessment.crossingPracticeRelief,
    rawCrossingRisk: riverAssessment.seasonalState?.effectiveRisk ?? 0,
    effectiveCrossingRisk: riverAssessment.riverCrossingRisk,
    crossingBlocked,
    usedCrossingKey: usedCrossing === undefined
      ? undefined
      : makeRiverCrossingKey(usedCrossing.fromTileId, usedCrossing.toTileId),
    stagedLegIncomplete: migrationWalk !== undefined && migrationWalk.stopReason === "budget_exhausted",
  };
  const shouldObserveNewArea =
    !crossingBlocked &&
    !destinationBlocked &&
    isMovementAction;
  const shouldObserveProbe =
    !crossingBlocked &&
    !destinationBlocked &&
    isProbeAction;
  const observationTile = getTile(world, nextPosition);
  const observationTargets =
    observationTile === undefined
      ? []
      : shouldObserveNewArea
        ? collectMigrationObservationTargets(world, migrationWalk?.path ?? [], observationTile)
        : shouldObserveProbe && targetTile !== undefined
          ? collectProbeObservationTargets(world, band.position, targetTile)
        : [{ tile: observationTile, distance: 0 }];
  const observedTileIds = observationTargets.map((target) => target.tile.id);
  const updatedKnowledge = measureDecision(
    profiler,
    "observationUpdate",
    () => targetTile === undefined || (!shouldObserveNewArea && !shouldObserveProbe)
      ? band.knowledge
      : observeTileAndNearby(world, band.knowledge, observationTargets),
  );
  const memoryUpdate = measureDecision(
    profiler,
    "memoryUpdate",
    () => updateBandMemory({
      world,
      band,
      decision,
      nextPosition,
      moved,
      observedTileIds,
      knownTiles: updatedKnowledge.observedTiles,
    }),
  );
  const biomeAdaptation = measureDecision(
    profiler,
    "biomeAdaptationUpdate",
    () => updateBiomeAdaptation({
      world,
      band,
      observedTileIds,
      nextPosition,
      moved,
    }),
  );
  // Probe recency update (2K.1G/2K.1H): an applied logistical_probe OR resource_scout
  // (both residence-unchanged) is recorded against its target, with "info gain" =
  // it observed at least one tile the band did not already know. Repeated no-gain
  // scouts/probes of the same target accrue a diminishing-return penalty next time.
  const scoutOrProbeTargetId =
    (decision.action.type === "logistical_probe" || decision.action.type === "resource_scout") &&
    isProbeAction &&
    !crossingBlocked &&
    !destinationBlocked
      ? decision.action.targetTileId
      : undefined;
  const newTilesObserved = observedTileIds.some((id) => band.knowledge.observedTiles[id] === undefined);
  const probeMemory =
    scoutOrProbeTargetId === undefined
      ? band.probeMemory
      : recordProbe(band.probeMemory, scoutOrProbeTargetId, world.time.tick, newTilesObserved);
  // 2K.1H resource_scout: a residence-unchanged INFORMATION action observes the target
  // patch (band perception) and updates resource belief / patch memory ONLY (presence/
  // access/season confidence, staleness) via the existing observation pipeline — never
  // yield/carrying-capacity/stress/mortality, and never the residential position. The
  // outcome is a conservative, partial, deterministic label (no hidden truth revealed).
  const scoutUpdate =
    isScoutAction && !crossingBlocked && !destinationBlocked && decision.action.type === "resource_scout"
      ? applyResourceScoutObservation(world, band, decision.action, updatedKnowledge, newTilesObserved)
      : undefined;
  // 2K.10 — an APPLIED side-country probe that actually observed its side tile may form bounded,
  // anti-omniscient resource/patch memory there (the missing off-corridor substrate 2K.9 needed).
  // Mutually exclusive with scoutUpdate (probe = logistical_probe, scout = resource_scout).
  const isSideProbeApplied =
    scoutUpdate === undefined &&
    shouldObserveProbe &&
    !crossingBlocked &&
    !destinationBlocked &&
    isAppliedSideCountryProbe(decision);
  const sideProbeResourceState = isSideProbeApplied
    ? formSideCountryResourceMemory(world, band, targetTileId, updatedKnowledge)
    : undefined;
  // 2K.11 — if that side probe formed a memory at a PLANT-BEARING side tile, it may also run a
  // bounded cautious test there so exploitationSkill ACCRUES for the encountered side class (the
  // chain that makes side memories and learned skill finally match). Reuses the existing plant-test
  // pipeline; outcomes stay suspicion-level; rarity inherited from the side-probe cadence.
  const sideTestUpdate =
    isSideProbeApplied && sideProbeResourceState !== undefined
      ? applySideEncounteredCautiousTest(world, band, targetTileId, sideProbeResourceState)
      : undefined;
  const resourceKnowledgeState =
    scoutUpdate?.resourceKnowledgeState ??
    sideTestUpdate?.resourceKnowledgeState ??
    sideProbeResourceState ??
    band.resourceKnowledgeState;
  // Merge the plant-use-test / cause-event produced by EITHER a resource_scout or a 2K.11 side test
  // (mutually exclusive). Off both paths this is byte-identical to the pre-2K.11 scout-only handling.
  const appliedPlantUseTest = scoutUpdate?.debug.plantUseTest ?? sideTestUpdate?.plantUseTest;
  const appliedCauseSpecificEvent = scoutUpdate?.debug.causeSpecificEvent ?? sideTestUpdate?.causeSpecificEvent;
  const lastResourceScout = scoutUpdate?.debug ?? band.lastResourceScout;
  const recentScoutLearning =
    scoutUpdate === undefined
      ? band.recentScoutLearning
      : appendRecentScoutLearning(band.recentScoutLearning, scoutUpdate.debug.learning);
  const lastPlantUseTest = appliedPlantUseTest ?? band.lastPlantUseTest;
  const recentPlantUseTests =
    appliedPlantUseTest === undefined
      ? band.recentPlantUseTests
      : appendRecentPlantUseTest(band.recentPlantUseTests, appliedPlantUseTest);
  const lastCauseSpecificEvent = appliedCauseSpecificEvent ?? band.lastCauseSpecificEvent;
  const recentCauseSpecificEvents =
    appliedCauseSpecificEvent === undefined
      ? band.recentCauseSpecificEvents
      : appendRecentCauseSpecificEvent(band.recentCauseSpecificEvents, appliedCauseSpecificEvent);
  // 2K.6: accrue learned exploitation skill from THIS season's own use-test / cause event (from a
  // resource_scout OR a 2K.11 side-encountered test). Knowledge-only — stores skill state, reads no
  // truth, feeds no yield/support/movement. Carries the prior state unchanged when nothing
  // class-attributable happened, so a band that never tests keeps it undefined (inert).
  const exploitationSkill =
    appliedPlantUseTest === undefined && appliedCauseSpecificEvent === undefined
      ? band.exploitationSkill
      : advanceExploitationSkill(
          band.exploitationSkill,
          band.id,
          world.time.tick,
          appliedPlantUseTest,
          appliedCauseSpecificEvent,
        );
  const reportedKnowledge = advanceReportedKnowledgeAfterDecision(band.reportedKnowledge, {
    action: decision.action,
    tick: world.time.tick,
    observedTileIds,
    moved,
  });
  const visibleLandscapeCues = updateVisibleLandscapeCueProbeUse(
    band,
    decision.action,
    scoutOrProbeTargetId,
  );
  const bandWithMemory: Band = {
    ...band,
    position: nextPosition,
    status: crossingBlocked ? "foraging" : getBandStatusAfterDecision(decision.action),
    knowledge: updatedKnowledge,
    currentIntent: decision.mobilityIntent,
    intentHistory: getNextIntentHistory(band, decision),
    movementHistory: memoryUpdate.movementHistory,
    probeMemory,
    resourceKnowledgeState,
    lastResourceScout,
    recentScoutLearning,
    lastPlantUseTest,
    recentPlantUseTests,
    lastCauseSpecificEvent,
    recentCauseSpecificEvents,
    exploitationSkill,
    reportedKnowledge,
    visibleLandscapeCues,
    placeMemory: memoryUpdate.placeMemory,
    travelCorridors: memoryUpdate.travelCorridors,
    crossingMemories: memoryUpdate.crossingMemories,
    biomeAdaptation,
    consecutiveSeasonsOnTile: moved ? 0 : band.consecutiveSeasonsOnTile + 1,
    decisionHistory: [...band.decisionHistory, decision.id].slice(-RECENT_BAND_DECISION_HISTORY_LIMIT),
  };
  // Residential anchor + intra-season activity for this season (2I.2/2I.3).
  // The pre-decision context (computed while scoring) is what actually drove the
  // decision. When the residence does not move, that context is still valid as
  // the post-decision state, so we reuse it and skip a second derivation (2I.3,
  // PART 1). Only a genuine relocation needs a fresh anchor at the new tile.
  const hasPreDecision = contextCache?.preDecisionAnchorByBandId.has(band.id) ?? false;
  const preDecisionAnchorContext = contextCache?.preDecisionAnchorByBandId.get(band.id);
  const reusePreDecision = !moved && hasPreDecision;
  // When reusing, take the stored value directly (it may legitimately be
  // undefined for a non-dry-margin band) — do NOT fall through to a fresh
  // derivation, which would defeat the reuse for the common held-band case.
  const postDryContext = reusePreDecision
    ? contextCache?.preDecisionDryContextByBandId.get(band.id)
    : deriveDryMarginMobilityContext(world, bandWithMemory, contextCache);
  const anchorContext = reusePreDecision
    ? preDecisionAnchorContext
    : deriveResidentialAnchorContext(world, bandWithMemory, postDryContext, contextCache);
  // The decision comparison that actually scored the chosen action is always the
  // pre-decision one; report-band labels it as such (2I.3, PART 4).
  const scoringDecision = preDecisionAnchorContext?.decision ?? anchorContext?.decision;
  const intraSeasonActivity = anchorContext === undefined
    ? undefined
    : summarizeIntraSeasonActivity({
        world,
        band: bandWithMemory,
        actionType: decision.action.type,
        moved,
        context: anchorContext,
        observedTileIds: observationTargets.map((target) => target.tile.id),
      });
  const anchorMemories = anchorContext === undefined
    ? band.anchorMemories
    : updateAnchorMemories({ world, band: bandWithMemory, context: anchorContext, moved });
  // Multi-year seasonal-round memory (2I.4). Derived post-decision from the anchor
  // context + this season's outcome, using the same scoring view the candidates
  // saw (both read the prior-tick round + same season, so it is identical).
  // Update the seasonal round for dry-margin bands (PART 7 gate). Reuse the
  // pre-decision scoring view computed while scoring, so it is derived once/tick.
  const seasonalScoring = contextCache?.preDecisionSeasonalRoundByBandId.get(band.id);
  const seasonalRoundUpdate = anchorContext === undefined
    ? undefined
    : updateSeasonalRound({
        world,
        band: bandWithMemory,
        anchorContext,
        intraSeason: intraSeasonActivity,
        scoring: seasonalScoring ?? getSeasonalRoundScoringContext(band, world),
        moved,
        currentTileId: band.position,
        nextTileId: nextPosition,
        actionType: decision.action.type,
      });
  // Round-aware catchment rotation (2I.5, PART 1): in a wet/green phase, forage the
  // rotated (fresher) tile set instead of the default catchment, so a held band
  // does not hammer the same small area. Only override the foraged set once
  // depletion is actually accumulating (rotate when needed) — a fresh catchment is
  // left untouched, keeping behaviour stable when there is nothing to rotate away
  // from. Pressure spread reads depletionTileIds.
  const rotation = seasonalRoundUpdate?.rotation;
  const rotationActive = rotation !== undefined &&
    (rotation.rotationPressure > 0.15 || rotation.depletionAvoidance > 0);
  const rotatedIntraSeason = !rotationActive || rotation === undefined || intraSeasonActivity === undefined || moved
    ? intraSeasonActivity
    : {
        ...intraSeasonActivity,
        depletionTileIds: [nextPosition, ...rotation.selectedCatchmentTileIds]
          .filter((tileId, index, all) => all.indexOf(tileId) === index),
      };
  const bandWithActivity: Band = {
    ...bandWithMemory,
    intraSeasonActivity: rotatedIntraSeason,
    anchorMemories,
    seasonalRound: seasonalRoundUpdate?.round ?? band.seasonalRound,
    seasonalRoundState: seasonalRoundUpdate?.state ?? band.seasonalRoundState,
    seasonalTimeline: seasonalRoundUpdate?.timeline ?? band.seasonalTimeline,
    roundCatchmentRotation: rotation ?? band.roundCatchmentRotation,
  };
  const pressureUpdate = measureDecision(
    profiler,
    "pressureUpdate",
    () => updateBandPressure({
      world,
      previousBand: band,
      band: bandWithActivity,
      decision,
      nextPosition,
      moved,
      observedTileIds: observationTargets.map((target) => target.tile.id),
      knownTiles: updatedKnowledge.observedTiles,
      contextCache,
    }, profiler),
  );

  const bandWithPressure: Band = {
    ...bandWithActivity,
    placeMemory: pressureUpdate.placeMemory,
    usePressure: pressureUpdate.usePressure,
    pressureState: pressureUpdate.pressureState,
    causalTraces: pressureUpdate.causalTraces,
  };
  const adaptiveOriginTile = getTile(world, band.position);
  const residentialMoveDistance = moved && adaptiveOriginTile !== undefined && observationTile !== undefined
    ? getGridDistance(adaptiveOriginTile, observationTile)
    : 0;
  // INVENTION-1: the residential-move event ring is derived HERE (hoisted from
  // the return literal — identical pure derivation) so the carrying efficacy
  // can read the realized hardship of THIS season's move.
  const recentResidentialMoveEvents = deriveResidentialMoveEventRing({
    world,
    band,
    nextPosition,
    moved,
    decision,
    prevRing: band.recentResidentialMoveEvents,
    executedPathTiles: migrationWalk === undefined ? undefined : [band.position, ...migrationWalk.path],
    stagedLegIncomplete: migrationWalk !== undefined && migrationWalk.stopReason === "budget_exhausted",
  });
  const residentialDependencyShare =
    (band.demography.dependents + band.demography.elders) / Math.max(1, band.demography.population);
  const temporaryResidentialDelayGrounded = !isMovementAction && band.currentIntent !== undefined && (
    (band.pressureState?.fatiguePressure ?? 0) >= 0.32 ||
    (band.bodyCampLogistics?.sickness.severity ?? 0) >= 0.3 ||
    residentialDependencyShare >= 0.55 ||
    band.demography.workingAdults < 4 ||
    ((world.time.season === "summer" || world.time.season === "winter") &&
      (band.pressureState?.riskPressure ?? 0) >= 0.45)
  );
  const residentialMovementIntentOutcomes = advanceResidentialMovementIntentOutcomes({
    world,
    band,
    decision,
    selectedTileId: targetTileId,
    actualTileId: nextPosition,
    attempted: isMovementAction,
    moved,
    crossingBlocked,
    destinationBlocked,
    stagedLegIncomplete: migrationWalk !== undefined && migrationWalk.stopReason === "budget_exhausted",
    temporaryDelayGrounded: temporaryResidentialDelayGrounded,
    prior: band.residentialMovementIntentOutcomes,
  });
  const latestMoveEvent = moved ? recentResidentialMoveEvents?.[0] : undefined;
  // INVENTION-1: practical-response efficacy contexts. The applied plan is the
  // SAME derivation the migration walk consumed; the counterfactual plan
  // disables the practical reliefs so the budget delta isolates the response's
  // own effect. Both derivations are cheap scalar work + one bounded
  // observed-tile average, and run only when a practiced state exists.
  const practicalState = band.practicalAdaptation;
  const hasPracticalResponses = (practicalState?.responses.length ?? 0) > 0;
  const planIntent = decision.mobilityIntent;
  const destinationKnownWatered = isKnownWateredDestination(band, targetTileId);
  const appliedTravelPlan = hasPracticalResponses && moved && isMovementAction
    ? deriveSeasonalTravelPlanForBand(
        band, planIntent?.kind, clamp01(planIntent?.persistence ?? 0), Number(world.time.tick),
        { destinationKnownWatered })
    : undefined;
  const carryingCounterfactualPlan = appliedTravelPlan === undefined
    ? undefined
    : deriveSeasonalTravelPlanForBand(
        band, planIntent?.kind, clamp01(planIntent?.persistence ?? 0), Number(world.time.tick),
        { destinationKnownWatered, disableCarryingRelief: true });
  const waterRouteCounterfactualPlan = appliedTravelPlan === undefined
    ? undefined
    : deriveSeasonalTravelPlanForBand(
        band, planIntent?.kind, clamp01(planIntent?.persistence ?? 0), Number(world.time.tick),
        { destinationKnownWatered, disableDryRouteWaterRelief: true });
  const waterStorageCounterfactualPlan = appliedTravelPlan === undefined
    ? undefined
    : deriveSeasonalTravelPlanForBand(
        band, planIntent?.kind, clamp01(planIntent?.persistence ?? 0), Number(world.time.tick),
        { destinationKnownWatered, disableCarriedWaterRelief: true });
  const dependentShare = band.demography.dependents / Math.max(1, band.demography.population);
  const elderShare = band.demography.elders / Math.max(1, band.demography.population);
  const appliedCarrying = appliedTravelPlan?.appliedCarryingRelief;
  const appliedWater = appliedTravelPlan?.appliedWaterRelief;
  const carryingEfficacy = evaluateCarryingEfficacy({
    moved,
    context: appliedTravelPlan === undefined || carryingCounterfactualPlan === undefined
      ? undefined
      : {
          reliefApplied: appliedCarrying?.active === true ? appliedCarrying.relief : 0,
          responseId: appliedCarrying?.responseId,
          variantKey: appliedCarrying?.variantKey,
          conditionPresent: deriveCarryingCondition(band) >= 0.2,
          budgetWithRelief: appliedTravelPlan.budget,
          budgetWithoutRelief: carryingCounterfactualPlan.budget,
          moveDistance: residentialMoveDistance,
          stagedLegIncomplete: migrationWalk !== undefined && migrationWalk.stopReason === "budget_exhausted",
          hardshipLevel: latestMoveEvent?.hardshipLevel,
          // Same formula deriveMigrationHardship applies: relief×0.6 of the
          // dependent/elder terms (estimate for the proof record).
          hardshipReliefApplied: round2(
            (appliedCarrying?.active === true ? appliedCarrying.relief : 0) * 0.6 *
            (dependentShare * 0.18 + elderShare * 0.16)),
        },
  });
  const waterRouteEfficacy = evaluateWaterRouteEfficacy({
    moved,
    context: appliedTravelPlan === undefined || waterRouteCounterfactualPlan === undefined
      ? undefined
      : {
          reliefApplied: appliedWater?.active === true ? appliedWater.relief : 0,
          responseId: appliedWater?.responseId,
          conditionPresent: deriveWaterRouteCondition(band) >= 0.2,
          destinationKnownWatered,
          budgetWithRelief: appliedTravelPlan.budget,
          budgetWithoutRelief: waterRouteCounterfactualPlan.budget,
          waterStressBefore: band.pressureState?.waterStress ?? 0,
          waterStressAfter: bandWithPressure.pressureState?.waterStress ?? 0,
        },
  });
  const engineeringEfficacy = evaluateEngineeringEfficacy({
    responseId: latestMoveEvent?.temporaryWatercraft?.engineeringResponseId,
    responseActive: latestMoveEvent?.temporaryWatercraft?.engineeringResponseActive === true,
    contextKey: latestMoveEvent?.temporaryWatercraft?.crossingContextKey,
    safetyBefore: latestMoveEvent?.temporaryWatercraft?.crossingSafetyBeforeLearning ?? 0,
    safetyAfter: latestMoveEvent?.temporaryWatercraft?.expectedCrossingSafety ?? 0,
    safetyRelief: latestMoveEvent?.temporaryWatercraft?.engineeringSafetyRelief ?? 0,
    result: latestMoveEvent?.temporaryWatercraft?.result,
    hardshipLevel: latestMoveEvent?.hardshipLevel,
  });
  const appliedCarriedWater = appliedTravelPlan?.appliedCarriedWaterRelief;
  const waterStorageEfficacy = evaluateWaterStorageEfficacy({
    moved,
    context: appliedTravelPlan === undefined || waterStorageCounterfactualPlan === undefined || appliedCarriedWater === undefined
      ? undefined
      : {
          reliefApplied: appliedCarriedWater.relief,
          responseId: appliedCarriedWater.responseId,
          conditionPresent: deriveWaterStorageCondition(band) >= 0.2,
          budgetWithRelief: appliedTravelPlan.budget,
          budgetWithoutRelief: waterStorageCounterfactualPlan.budget,
          waterStressBefore: band.pressureState?.waterStress ?? 0,
          waterStressAfter: bandWithPressure.pressureState?.waterStress ?? 0,
          sealCracked: appliedCarriedWater.sealCracked,
          creditedLimiter: appliedCarriedWater.active,
        },
  });
  const exposure = band.bodyCampLogistics?.campExposure;
  const shelterEfficacy = evaluateShelterEfficacy({
    context: exposure === undefined || exposure.shelterResponseId === undefined
      ? undefined
      : {
          responseId: exposure.shelterResponseId,
          rawExposure: exposure.rawExposure,
          effectiveExposure: exposure.effectiveExposure,
          reliefApplied: exposure.shelterReliefApplied,
          contextMatched: exposure.shelterContextMatched,
          dominantKind: exposure.dominantKind,
          sicknessSeverity: band.bodyCampLogistics?.sickness.severity ?? 0,
          priorSicknessSeverity: band.bodyCampLogistics?.sickness.severity ?? 0,
        },
  });
  const recentAnimalTraces = (band.recentIntraSeasonTrips ?? [])
    .filter((trip) => Number(trip.tick) >= Number(world.time.tick) - 1)
    .map((trip) => trip.animalActivityTrace)
    .filter((trace): trace is NonNullable<typeof trace> => trace !== undefined);
  const animalInjuryThisSeason = (band.acuteRisk?.recentEpisodes ?? []).some((episode) =>
    episode.kind === "animal_encounter_injury" && Number(episode.tick) === Number(world.time.tick));
  const huntingEfficacy = evaluateHuntingEfficacy({ traces: recentAnimalTraces, animalInjuryThisSeason });
  const currentCareEpisodes = (band.acuteRisk?.recentEpisodes ?? []).filter((episode) =>
    Number(episode.tick) === Number(world.time.tick) && episode.careAttempted === true);
  const firstCareResponseId = currentCareEpisodes.find((episode) => episode.careResponseId !== undefined)?.careResponseId;
  const careEfficacy = evaluateCareEfficacy({
    context: firstCareResponseId === undefined
      ? undefined
      : {
          responseId: firstCareResponseId,
          reliefApplied: currentCareEpisodes.reduce((sum, episode) => sum + (episode.careReliefApplied ?? 0), 0),
          treatedEpisodes: currentCareEpisodes.filter((episode) => episode.careMatched === true && (episode.careHarmApplied ?? 0) <= 0).length,
          mismatchedEpisodes: currentCareEpisodes.filter((episode) => episode.careMatched === false).length,
          recoverySeasonsSaved: currentCareEpisodes.reduce((sum, episode) => sum + Math.max(0, episode.careRecoverySeasonsSaved ?? 0), 0),
          worsenedEpisodes: currentCareEpisodes.filter((episode) => (episode.careHarmApplied ?? 0) > 0).length,
        },
  });
  const measureEfficacy = evaluateMeasureEfficacy({
    context: appliedCarriedWater?.measurementResponseId === undefined || !moved
      ? undefined
      : {
          responseId: appliedCarriedWater.measurementResponseId,
          provisioningAccuracy: appliedCarriedWater.provisioningAccuracy,
          carriedWaterUsed: appliedCarriedWater.active && appliedCarriedWater.relief > 0,
          arrivedNoDrier: (bandWithPressure.pressureState?.waterStress ?? 0) <= (band.pressureState?.waterStress ?? 0),
        },
  });
  const residenceRecord = band.knowledge.observedTiles[band.position];
  const residenceContext = adaptiveOriginTile === undefined
    ? undefined
    : {
        tileId: String(band.position),
        droughtRisk: adaptiveOriginTile.riskProfile.droughtRisk,
        isWoodedContext: adaptiveOriginTile.terrainKind === "forest",
        dampGroundCue: adaptiveOriginTile.isFloodplain || adaptiveOriginTile.isRiverbank ||
          adaptiveOriginTile.terrainKind === "wetlands" || (residenceRecord?.observedWaterAccess ?? 0) >= 0.58,
        season: String(world.time.season),
      };
  const groundwaterContext = adaptiveOriginTile === undefined
    ? undefined
    : {
        tileId: band.position,
        surfaceWaterAccess: adaptiveOriginTile.resourceProfile.waterAccess,
        droughtRisk: adaptiveOriginTile.riskProfile.droughtRisk,
        isFloodplainOrValley: adaptiveOriginTile.isFloodplain || adaptiveOriginTile.terrainKind === "river_valley",
        season: String(world.time.season),
      };
  const practicalAdaptation = advancePracticalAdaptation({
    band,
    currentTick: world.time.tick,
    moved,
    residentialMoveDistance,
    crossedThisSeason: usedCrossing !== undefined,
    latestMoveEvent,
    carryingEfficacy,
    waterRouteEfficacy,
    engineeringEfficacy,
    waterStorageEfficacy,
    shelterEfficacy,
    huntingEfficacy,
    careEfficacy,
    measureEfficacy,
    residenceContext,
    groundwaterContext,
  });
  const effectiveStorageCapacity = deriveEffectiveStorageCapacity(
    { ...band, practicalAdaptation },
    Number(world.time.tick),
  );
  // ROUTINES-2: animal patterns persist only from lived observation records;
  // proto-management then consumes that knowledge plus current labor/water/camp
  // constraints. Hidden stock state is used only inside the physical outcome.
  const animalUpdate = measureDecision(profiler, "animalPatternManagementUpdate", () => {
    const animalPatternKnowledge = advanceAnimalPatternKnowledge(world, bandWithPressure);
    const animalManagement = advanceAnimalManagement(
      world,
      { ...bandWithPressure, animalPatternKnowledge },
      animalPatternKnowledge,
    );
    return { animalPatternKnowledge, animalManagement };
  });
  const { animalPatternKnowledge, animalManagement } = animalUpdate;
  const adaptiveHuman = measureDecision(
    profiler,
    "adaptiveStateUpdate",
    () => band.practicalAdaptation === undefined ? advanceAdaptiveHumanState({
      world,
      previousBand: band,
      updatedBand: bandWithPressure,
      decision,
      nextPosition,
      moved,
      crossingBlocked,
      destinationBlocked,
      observedTileIds: observationTargets.map((target) => target.tile.id),
      crossingOutcome,
      // Camp wear (band-known use pressure) at old vs new residence — the same
      // coefficient campMovement's relief scoring pays. Pre-decision records:
      // the band's own accumulated wear, not this tick's fresh accrual.
      campShiftOutcome: {
        priorCampUsePressure: getLocalUsePressureValue(band.usePressure[band.position]),
        newCampUsePressure: getLocalUsePressureValue(band.usePressure[nextPosition]),
        moveDistance: residentialMoveDistance,
        travelEngaged: migrationWalk !== undefined,
      },
    }) : band.adaptiveHuman,
  );
  const bandWithAdaptive: Band = {
    ...bandWithPressure,
    adaptiveHuman,
  };
  const worldWithAdaptiveBand = {
    ...world,
    bands: {
      ...world.bands,
      [bandWithAdaptive.id]: bandWithAdaptive,
    },
  };
  const campMovement = measureDecision(
    profiler,
    "campMovementStateUpdate",
    () => advanceCampMovementState({
      world,
      previousBand: band,
      updatedBand: bandWithAdaptive,
      decision,
      nextPosition,
      moved,
      crossingBlocked,
      destinationBlocked,
      observedTileIds: observationTargets.map((target) => target.tile.id),
    }),
  );
  const bandWithCampMovement: Band = {
    ...bandWithAdaptive,
    campMovement,
  };
  const worldWithCampMovementBand = {
    ...worldWithAdaptiveBand,
    bands: {
      ...worldWithAdaptiveBand.bands,
      [bandWithCampMovement.id]: bandWithCampMovement,
    },
  };

  // M0.8-A: advance the corridor-relocation cadence governor ONLY when this decision was an
  // executed corridor relocation; otherwise carry the prior state unchanged (it decays at
  // read time in the candidate builder). Baseline never relocates → stays undefined.
  const corridorRelocation = isAppliedCorridorRelocation(decision, moved)
    ? advanceCorridorRelocationState(band.corridorRelocation, world.time.tick)
    : band.corridorRelocation;

  // M0.8-B: advance the shore-probe cadence governor ONLY when this decision was an executed
  // pre-existing mobility-intent `frontier_probe` move (NOT the M0.8 corridor relocation, which
  // has its own cadence above). Otherwise carry the prior state — the cooldown decays at read
  // time in `isFrontierProbeCooling`. A band that never shore-probes keeps it undefined (inert).
  const frontierProbeCadence = isAppliedShorelineProbeMove(decision, moved)
    ? advanceFrontierProbeCadence(band.frontierProbeCadence, world.time.tick)
    : band.frontierProbeCadence;

  // M0.16B: advance the side-country probe cadence/budget ONLY when this decision was an
  // executed side-country probe (a residence-unchanged logistical_probe carrying the
  // isSideCountryProbe reason). Otherwise carry the prior state unchanged. A band that never
  // side-probes keeps it undefined (inert) — preserving byte-identical behaviour elsewhere.
  const sideProbeMemory = isAppliedSideCountryProbe(decision)
    ? {
        lastSideProbeTick: world.time.tick,
        cumulativeSideProbes: (band.sideProbeMemory?.cumulativeSideProbes ?? 0) + 1,
      }
    : band.sideProbeMemory;

  // 2K.6B / INFO-1: advance the proactive-information cadence ONLY when this decision was a
  // proactive resource_scout (residence-unchanged information action). Otherwise carry the
  // prior state. A band that never proactively scouts keeps it undefined (inert).
  const proactiveInfoMemory = isAppliedProactiveInfo(decision)
    ? {
        lastProactiveInfoTick: world.time.tick,
        cumulativeProactiveInfoActions: (band.proactiveInfoMemory?.cumulativeProactiveInfoActions ?? 0) + 1,
      }
    : band.proactiveInfoMemory;

  // M0.9: advance the directional heading ONLY on a realized corridor/probe move (frontier_probe
  // or corridor_following). The heading is the band's own realized-motion bearing + post-move
  // known-tile count (frontier-expansion signal) — never truth/inferred richness or a target.
  const corridorHeading = isAppliedCorridorOrProbeMove(decision, moved)
    ? advanceCorridorHeading(
        band.corridorHeading,
        getRealizedMoveDelta(world, band.position, nextPosition),
        Object.keys(updatedKnowledge.observedTiles).length,
        corridorHeadingSourceForDecision(decision),
        decision.primaryReason.id,
        world.time.tick,
      )
    : band.corridorHeading;

  return compressBandMemoryState(worldWithCampMovementBand, {
    ...bandWithCampMovement,
    corridorRelocation,
    frontierProbeCadence,
    sideProbeMemory,
    proactiveInfoMemory,
    corridorHeading,
    dryMarginContext: postDryContext,
    residentialAnchor: anchorContext?.anchor,
    // When the band relocated, the scoring (pre-decision) anchor was at the old
    // tile; expose it separately so reports do not conflate it with the new
    // post-decision anchor (2I.3, PART 4). Identical when residence held, so omit.
    preDecisionAnchor: moved ? preDecisionAnchorContext?.anchor : undefined,
    foragingRadiusState: anchorContext?.foragingRadius,
    intraSeasonActivity: rotatedIntraSeason,
    anchorDecision: scoringDecision,
    anchorMemories,
    // Reconcile the pre-decision anchor recommendation with the final action so
    // reports never show "stay_anchor" beside a band that actually moved (2J.1).
    anchorActionTrace: buildAnchorActionTrace(world, band, decision, moved, scoringDecision),
    // RESIDENTIAL-MOVE-1 — record-only relocation event (derived once, above,
    // so the carrying efficacy could read this season's realized hardship).
    recentResidentialMoveEvents,
    residentialMovementIntentOutcomes,
    // INVENTION-1: bounded learned fragments + composed practical responses.
    practicalAdaptation,
    storageCapacity: effectiveStorageCapacity,
    animalPatternKnowledge,
    animalManagement,
  });
}

function buildAnchorActionTrace(
  world: WorldState,
  band: Band,
  decision: Decision,
  moved: boolean,
  scoringDecision: AnchorDecisionComparison | undefined,
): AnchorActionTrace {
  const anchorRecommendation: AnchorActionTrace["anchorRecommendation"] =
    scoringDecision?.chosenResidentialAction ?? "none";
  const finalAction: AnchorActionTrace["finalAction"] =
    decision.action.type === "stay"
      ? "stayed"
      : decision.action.type === "move_to_tile"
        ? "moved"
        : decision.action.type === "explore_unknown_neighbor"
          ? "explored"
          : decision.action.type === "logistical_probe"
            ? "probed"
            : "other";

  // stay_anchor / logistical_foray both mean "hold the residence"; relocation means
  // "move it". An override is when the final action contradicts the recommendation.
  const recommendedHold =
    anchorRecommendation === "stay_anchor" || anchorRecommendation === "logistical_foray";
  const recommendedRelocate = anchorRecommendation === "residential_relocation";
  const overrodeAnchor = (recommendedHold && moved) || (recommendedRelocate && !moved);
  const overrideReason = recommendedHold && moved
    ? "movement_overrode_anchor_recommendation"
    : recommendedRelocate && !moved
      ? "stayed_despite_relocation_recommendation"
      : undefined;

  return {
    bandId: band.id,
    anchorRecommendation,
    finalAction,
    residenceMoved: moved,
    overrodeAnchor,
    overrideReason,
    reasonIds: [
      makeAnchorTraceReasonId(
        world.time,
        band.id,
        overrodeAnchor ? "movement_overrode_anchor_recommendation" : "anchor_recommendation_followed",
      ),
    ],
  };
}

function makeAnchorTraceReasonId(time: WorldTime, bandId: BandId, suffix: string): ReasonId {
  return `reason:${bandId}:${time.tick}:carrying:${suffix}` as ReasonId;
}

function buildDecisionCandidates(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  intentEvaluation: MobilityIntentEvaluation,
  decisionCache: CandidateEvaluationCache,
): readonly CandidateDecision[] {
  const candidates: CandidateDecision[] = [];
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  // Resource-belief probe pressure (2K.1F): computed once in the decision cache and
  // shared by the scout/probe candidates here (and the probe-availability gate).
  // Influences probe/scout pressure only — never the move candidates — so beliefs
  // raise curiosity, not automatic relocation.
  const beliefOpportunity = decisionCache.beliefOpportunity;

  if (
    currentTile !== undefined &&
    currentRecord !== undefined &&
    isBandPassableDestination(currentTile)
  ) {
    candidates.push(buildStayCandidate(world, band, decisionId, currentTile, currentRecord, decisionCache));
  }

  for (const knownCandidate of getKnownMoveCandidates(world, band, decisionCache)) {
    candidates.push(buildMoveCandidate(world, band, decisionId, knownCandidate, intentEvaluation, decisionCache));
  }

  const explorationCandidate = buildExploreCandidate(world, band, decisionId, intentEvaluation, decisionCache, beliefOpportunity);

  if (explorationCandidate !== undefined) {
    candidates.push(explorationCandidate);
  }

  const logisticalProbeCandidate = buildLogisticalProbeCandidate(world, band, decisionId, decisionCache, beliefOpportunity);

  if (logisticalProbeCandidate !== undefined) {
    candidates.push(logisticalProbeCandidate);
  }

  const visibleLandscapeProbeCandidate = buildVisibleLandscapeProbeCandidate(world, band, decisionId, decisionCache);

  if (visibleLandscapeProbeCandidate !== undefined) {
    candidates.push(visibleLandscapeProbeCandidate);
  }

  // 2K.1H: general resource_scout — a residence-unchanged information action toward the
  // band's best value-of-information resource belief (distinct from the water/route
  // logistical_probe above). Never a relocation candidate.
  const resourceScoutCandidate = buildResourceScoutCandidate(world, band, decisionId, decisionCache);

  if (resourceScoutCandidate !== undefined) {
    candidates.push(resourceScoutCandidate);
  }

  const shapedCandidates = candidates.map((candidate) =>
    applyIntentShaping(world, band, intentEvaluation, candidate, decisionCache),
  );

  // M0.7: a settled near-water band may probe the nearest inferred frontier tile to
  // OBSERVE it (inference → real knowledge) without relocating. M0.8: a settled band may
  // also relocate one bounded step along its band-known observed/inferred shore corridor.
  // Both are OPT-IN candidates (`isOptInCandidate`): they are excluded from
  // `coreDeliberationBreadth`, so merely OFFERING them (winning or not) cannot perturb the
  // confidence that scales with how many options were weighed (memory.ts). They WIN only
  // when they outrank every core candidate (no richness, route/safety-checked).
  for (const optIn of [
    buildInferredFrontierProbeCandidate(world, band, decisionId, decisionCache),
    buildCorridorRelocationCandidate(world, band, decisionId, intentEvaluation, decisionCache),
    // M0.16B: off-corridor side-country probe (knowledge consumption). Same opt-in discipline
    // (excluded from coreDeliberationBreadth; wins only when it outranks every core candidate).
    buildSideCountryProbeCandidate(world, band, decisionId, decisionCache),
    buildPressureReliefProbeCandidate(world, band, decisionId, decisionCache),
  ]) {
    if (optIn !== undefined) {
      shapedCandidates.push({
        ...applyIntentShaping(world, band, intentEvaluation, optIn, decisionCache),
        isOptInCandidate: true,
      });
    }
  }

  const adaptiveCandidates = shapedCandidates.map((candidate) =>
    applyAdaptiveDecisionShaping(band, decisionId, candidate, decisionCache),
  );
  const campMovementCandidates = adaptiveCandidates.map((candidate) =>
    applyCampMovementDecisionShaping(band, decisionId, candidate, decisionCache),
  );

  if (campMovementCandidates.length === 0) {
    return [
      applyCampMovementDecisionShaping(
        band,
        decisionId,
        applyAdaptiveDecisionShaping(
          band,
          decisionId,
          applyIntentShaping(world, band, intentEvaluation, buildNoOpCandidate(world, band, decisionId), decisionCache),
          decisionCache,
        ),
        decisionCache,
      ),
    ];
  }

  return campMovementCandidates;
}

function buildStayCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  tile: Tile,
  record: KnownTileRecord,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision {
  const riverAssessment = getCandidateEdgeMemo(world, band, band.position, tile.id, undefined, decisionCache)
    .riverAssessment;
  const scoreBreakdown = buildKnownTileScoreBreakdown(
    world,
    band,
    tile,
    record,
    0,
    riverAssessment,
    decisionCache,
  );
  const action: Action = { type: "stay", tileId: tile.id };
  const seasonalRoundStayPull = decisionCache.seasonalRoundContext === undefined
    ? 0
    : getSeasonalRoundStayPull(decisionCache.seasonalRoundContext, tile.id);
  // CAUSAL-REPAIR-1: the flat stay bonus is no longer unconditional. Per-band
  // attachment tendency shifts it ±15%, and repeated low-support evidence
  // erodes it (capped) — staying stays possible (water/refuge/anchor gates and
  // route costs still hold moves back) but is no longer automatic on a
  // chronically failing patch. The anchor hold erodes at 0.6× the rate so a
  // genuine water-secure refuge keeps most of its hold.
  const hardshipErosion = decisionCache.hardship.stayBiasErosion;
  const stayBias = 0.24 * (1 + decisionCache.tendencies.attachment * 0.15) * (1 - hardshipErosion);
  const anchorHold = getAnchorHoldBonus(decisionCache.anchorContext) * (1 - hardshipErosion * 0.6);
  const score = scoreDecision(scoreBreakdown) + stayBias + anchorHold + seasonalRoundStayPull;
  const comfortMargin = clamp01(score / 5);
  const dryContext = decisionCache.dryMarginContext;
  const dryComparison = dryContext?.stayMoveScout;
  const anchorContext = decisionCache.anchorContext;
  const anchorReason = anchorContext !== undefined &&
    anchorContext.decision.chosenResidentialAction === "stay_anchor"
    ? makeAnchorStayReason(decisionId, world.time, band, tile.id, anchorContext, scoreBreakdown.memoryConfidence)
    : undefined;
  const primaryReason = anchorReason !== undefined
    ? anchorReason
    : dryComparison !== undefined &&
    dryComparison.stayValue >= dryComparison.moveValue &&
    dryComparison.currentRefugeSecurity > 0.34
      ? makeReason(decisionId, "primary", 0, {
          type: "stayed_due_to_known_refuge",
          strength: dryComparison.stayValue,
          confidence: scoreBreakdown.memoryConfidence,
          relatedTileIds: [tile.id],
          bandId: band.id,
          currentTileId: tile.id,
          targetTileId: dryContext?.riverProspect?.bestProspectTileId,
          waterSourceKind: dryContext?.currentWaterRefuge?.sourceKind,
          reliability: dryContext?.currentWaterRefuge?.reliability,
          droughtRisk: dryContext?.currentWaterRefuge?.droughtFailureRisk,
          seasonalMode: dryContext?.seasonalMode?.mode,
          stayValue: dryComparison.stayValue,
          scoutValue: dryComparison.scoutValue,
          moveValue: dryComparison.moveValue,
          marginalReturn: dryComparison.currentMarginalReturn,
          departureThreshold: dryComparison.departureThreshold,
          uncertainty: dryContext?.riverProspect?.uncertainty,
          socialRisk: dryComparison.socialAccessRisk,
          crossingRisk: dryContext?.riverProspect?.crossingRisk,
          travelCost: dryContext?.riverProspect?.travelCost,
          basis: dryContext?.riverProspect?.basis,
        })
      : scoreBreakdown.foodValue > 0.62 && scoreBreakdown.riskCost < 0.48
      ? makeReason(decisionId, "primary", 0, {
          type: "known_site_sufficient",
          strength: clamp01(scoreBreakdown.foodValue),
          confidence: record.confidence,
          relatedTileIds: [tile.id],
          currentTileId: tile.id,
          currentValue: scoreBreakdown.expectedFutureValue,
          pressure: getMobilityPressure(band, scoreBreakdown),
        })
      : makeReason(decisionId, "primary", 0, {
          type: "low_mobility_pressure",
          strength: comfortMargin,
          confidence: record.confidence,
          relatedTileIds: [tile.id],
          currentTileId: tile.id,
          pressure: getMobilityPressure(band, scoreBreakdown),
        });

  return {
    action,
    scoreBreakdown,
    score: round2(score),
    primaryReason,
    secondaryReasons: anchorContext === undefined
      ? []
      : [makeAnchorRadiusReason(decisionId, world.time, band, anchorContext)],
    riverAssessment,
  };
}

// Build the stay candidate's primary reason when a held anchor drives the
// decision: poor-but-safe water gets its own reason; otherwise a plain
// stay_anchor / anchored_refuge reason carrying the catchment diagnostics.
function makeAnchorStayReason(
  decisionId: DecisionId,
  time: WorldTime,
  band: Band,
  tileId: TileId,
  anchorContext: ResidentialAnchorContext,
  confidence: number,
): Reason {
  const anchor = anchorContext.anchor;
  const decision = anchorContext.decision;
  const poorButSafe =
    anchor.anchorWaterSecurity > 0.45 && anchor.catchmentReturnEstimate < 0.4;
  const type = poorButSafe
    ? "poor_but_safe_water_anchor"
    : anchor.anchorStatus === "secure_hold" || anchor.anchorStatus === "contracting"
      ? "anchored_refuge_mode"
      : "stay_anchor_selected";

  return makeReason(decisionId, "primary", numericTileIdPart(tileId), {
    type,
    strength: anchor.holdValue,
    confidence,
    relatedTileIds: anchor.tetheringWaterTileId === undefined
      ? [tileId]
      : [tileId, anchor.tetheringWaterTileId],
    bandId: band.id,
    anchorTileId: tileId,
    tetheringWaterTileId: anchor.tetheringWaterTileId,
    season: time.season,
    foragingRadius: anchor.foragingRadius,
    catchmentTileCount: anchor.catchmentTileIds.length,
    holdValue: anchor.holdValue,
    forayValue: anchor.forayValue,
    relocateValue: anchor.relocateValue,
    anchorMarginalReturn: decision.anchorMarginalReturn,
    bestKnownAlternativeNet: decision.bestKnownAlternativeNet,
    relocationHysteresis: decision.relocationHysteresis,
    anchorWaterSecurity: anchor.anchorWaterSecurity,
    dependencyLoad: anchor.dependencyLoad,
    logisticalCapacity: anchor.logisticalCapacity,
    catchmentReturnEstimate: anchor.catchmentReturnEstimate,
    catchmentDepletion: anchor.catchmentDepletion,
    seasonsAnchored: anchor.seasonsAnchored,
    anchorStatus: anchor.anchorStatus,
    droughtResponse: anchor.droughtResponse,
  });
}

function makeAnchorRadiusReason(
  decisionId: DecisionId,
  time: WorldTime,
  band: Band,
  anchorContext: ResidentialAnchorContext,
): Reason {
  const radius = anchorContext.foragingRadius;
  const type = radius.basis === "wet_season_released"
    ? "wet_season_tether_released"
    : radius.basis === "water_tethered"
      ? "drought_tether_tightened"
      : "water_tethered_foraging_radius";

  return makeReason(decisionId, "secondary", radius.radiusTiles, {
    type,
    strength: clamp01(anchorContext.anchor.anchorWaterSecurity),
    confidence: 0.6,
    relatedTileIds: [radius.anchorTileId],
    bandId: band.id,
    anchorTileId: radius.anchorTileId,
    season: time.season,
    foragingRadius: radius.radiusTiles,
    catchmentTileCount: radius.reachableKnownTileIds.length,
    anchorWaterSecurity: anchorContext.anchor.anchorWaterSecurity,
    catchmentReturnEstimate: anchorContext.anchor.catchmentReturnEstimate,
    catchmentDepletion: anchorContext.anchor.catchmentDepletion,
  });
}

function buildMoveCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  candidate: KnownTileCandidate,
  intentEvaluation: MobilityIntentEvaluation,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision {
  const riverAssessment = getCandidateEdgeMemo(
    world,
    band,
    band.position,
    candidate.tile.id,
    intentEvaluation.activeIntent?.kind,
    decisionCache,
  ).riverAssessment;
  const scoreBreakdown = buildKnownTileScoreBreakdown(
    world,
    band,
    candidate.tile,
    candidate.record,
    candidate.distance,
    riverAssessment,
    decisionCache,
  );
  const action: Action = { type: "move_to_tile", targetTileId: candidate.tile.id };
  // Seasonal-round move bias: pull back toward the remembered dry refuge, minus a
  // small drift penalty for relocating to a non-refuge tile during a dry phase
  // (2I.5, PART 2). Both are inert unless the round is confident and refuge viable.
  const seasonalRoundMovePull = decisionCache.seasonalRoundContext === undefined
    ? 0
    : getSeasonalRoundMovePull(decisionCache.seasonalRoundContext, candidate.tile.id) -
      getSeasonalRoundDriftPenalty(decisionCache.seasonalRoundContext, candidate.tile.id);
  const score = scoreDecision(scoreBreakdown) + seasonalRoundMovePull;
  const primaryReason = getMovePrimaryReason(
    decisionId,
    candidate.tile,
    candidate.record,
    scoreBreakdown,
    intentEvaluation,
  );

  return {
    action,
    scoreBreakdown,
    score: round2(score),
    primaryReason,
    secondaryReasons: [],
    riverAssessment,
  };
}

function buildExploreCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  intentEvaluation: MobilityIntentEvaluation,
  decisionCache: CandidateEvaluationCache,
  beliefOpportunity: ResourceBeliefOpportunity,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return undefined;
  }

  const daughterDispersal =
    decisionCache.pressureSnapshot.daughterDispersalPressure ??
    getCandidateTileMemo(world, band, currentTile, decisionCache).daughterDispersal;
  const frontierCandidate = measureDecision(
    decisionCache.profiler,
    "candidateFrontierDispersalScoring",
    () => chooseUnknownFrontierCandidate(
      band,
      currentTile,
      getPassableUnknownNeighborIds(world, band, currentTile, decisionCache),
      intentEvaluation,
      decisionCache.previousMovementVector,
      decisionCache.parentAwayVector,
      daughterDispersal.daughterDispersalPressure,
      getUnknownFrontierCrossingHints(world, band, currentTile, intentEvaluation.activeIntent?.kind, decisionCache),
    ),
  );

  if (frontierCandidate === undefined) {
    return undefined;
  }

  const targetTileId = frontierCandidate.tileId;
  const knownTileCount = decisionCache.knownTileCount;
  const averageConfidence = decisionCache.averageKnownTileConfidence;
  const localConditions = getSeasonalTileConditions(world, currentTile);
  const currentRecord = band.knowledge.observedTiles[currentTile.id];
  const pressureState = decisionCache.pressureSnapshot.bandPressureState;
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const nearbyPressure = decisionCache.pressureSnapshot.nearbyBandPressure;
  const crowdingPenalty = getCrowdingPenalty(currentTile, nearbyPressure);
  const rangeSaturation = band.rangeSaturation?.saturationPressure ?? 0;
  const frontierDispersal = band.frontierDispersal?.pressure ?? 0;
  // Resource-belief probe pressure (2K.1F): nudges scout/probe curiosity only.
  const explorationBaseline = getExplorationBaseline(band, beliefOpportunity.probePressure, decisionCache);
  const crowdingExploreBoost = clamp01(nearbyPressure.weightedCrowding * 0.18);
  // CAUSAL-REPAIR-1: SUSTAINED over-capacity (M0.11 signal — ≥2 consecutive
  // derivations, so a passing band never triggers it) escalates edge scouting
  // beyond the standing saturation pressure. Crowded good basins now push
  // outward probing instead of only shaving per-capita return.
  const saturationExploreBoost = clamp01(
    rangeSaturation * 0.22 +
      (band.carryingCapacity?.perCapitaReturn.sustainedOverCapacity ?? 0) * 0.3,
  );
  const daughterDispersalExploreBoost = clamp01(daughterDispersal.daughterDispersalPressure * 0.28);
  const explorationRiskPenalty = clamp01(
    frontierCandidate.inferredRisk * 0.16 +
      getDependentMovementRisk(band) +
      getLowPopulationExplorationPenalty(band),
  );
  const recoveryBenefit = clamp01(currentUsePressure * 0.52 + pressureState.netMovePressure * 0.34);
  const riverAssessment = getCandidateEdgeMemo(
    world,
    band,
    currentTile.id,
    targetTileId,
    intentEvaluation.activeIntent?.kind,
    decisionCache,
  ).riverAssessment;
  const explorationValue = clamp01(
    explorationBaseline +
      frontierCandidate.frontierProbeValue * 0.54 +
      Math.max(0, 12 - knownTileCount) * 0.055 +
      (1 - averageConfidence) * 0.22 +
      getCanonicalFoodStress(band) * 0.18 +
      pressureState.netMovePressure * 0.18 +
      band.demography.splitPressure * 0.18 +
      daughterDispersal.daughterDispersalPressure * 0.36 +
      frontierDispersal * 0.26 +
      daughterDispersal.safeFrontierPull * 0.28 +
      frontierCandidate.parentAwayValue * daughterDispersal.daughterDispersalPressure * 0.22 -
      explorationRiskPenalty -
      crowdingPenalty * 0.04 -
      band.demography.workingAdults / Math.max(1, band.demography.population) * 0.08 +
      crowdingExploreBoost +
      saturationExploreBoost +
      daughterDispersalExploreBoost,
  );
  const scoreBreakdown: ScoreBreakdown = {
    foodValue: clamp01((currentRecord?.observedRichness ?? 0.35) * 0.38),
    waterValue: clamp01((currentRecord?.observedWaterAccess ?? 0.35) * 0.28),
    waterRefugeSecurity: decisionCache.dryMarginContext?.stayMoveScout?.currentRefugeSecurity ?? 0,
    dryRefugePull: decisionCache.dryMarginContext?.seasonalMode?.dryRefugePull ?? 0,
    aquaticValue: clamp01((currentRecord?.observedAquaticPotential ?? 0.2) * 0.2),
    movementCost: clamp01(0.42 + pressureState.fatiguePressure * 0.28 + getRecentRelocationSettlementCost(world, band)),
    riskCost: clamp01(
      frontierCandidate.inferredRisk * 0.44 +
      frontierCandidate.riverCrossingRisk * 0.44 +
      localConditions.currentFloodStress * 0.16 +
        localConditions.currentDroughtStress * 0.16 +
        localConditions.currentWaterStress * 0.12 +
        getDependentMovementRisk(band),
    ),
    memoryConfidence: clamp01(averageConfidence),
    routeValue: 0,
    attachmentValue: getAttachmentValue(band, currentTile.id) * 0.18,
    populationPressure: getPopulationPressure(band),
    storageValue: band.storageCapacity * 0.12,
    explorationValue,
    socialCost: clamp01((1 - band.cohesion) * 0.16),
    expectedFutureValue: clamp01(explorationValue + getCanonicalFoodStress(band) * 0.18),
    intentAlignment: 0,
    movementInertia: 0,
    reversalPenalty: 0,
    frontierProbeValue: frontierCandidate.frontierProbeValue,
    localSurvivalValue: 0,
    placeAttachment: 0,
    rememberedReliability: 0,
    rememberedRisk: frontierCandidate.inferredRisk,
    familiarCorridor: 0,
    returnPlacePull: 0,
    foodStress: pressureState.foodStress,
    waterStress: pressureState.waterStress,
    localUsePressure: round2(currentUsePressure * 0.34),
    mobilityPressure: pressureState.mobilityPressure,
    placeAttachmentPull: 0,
    netMovePressure: pressureState.netMovePressure,
    recoveryBenefit,
    depletionPenalty: round2(currentUsePressure * 0.24),
    riverCrossingCost: frontierCandidate.riverCrossingCost,
    riverCrossingRisk: frontierCandidate.riverCrossingRisk,
    riverCorridorValue: riverAssessment.riverCorridorValue,
    knownFordValue: riverAssessment.knownFordValue,
    blockedCrossingPenalty: frontierCandidate.blockedCrossingPenalty,
    nearbyBandPressure: nearbyPressure.weightedCrowding,
    parentCoreOverlap: daughterDispersal.parentCoreOverlap,
    daughterDispersalPressure: daughterDispersal.daughterDispersalPressure,
    inheritedFamiliarityPull: daughterDispersal.inheritedFamiliarityPull,
    safeFrontierPull: daughterDispersal.safeFrontierPull,
    crowdingPenalty,
    biomeCompetence: decisionCache.pressureSnapshot.biomeCurrentTileFit,
    biomeMismatchPenalty: 0,
    rangeSaturation,
    perCapitaReturn: band.rangeSaturation?.perCapitaReturnEstimate ?? 0,
    frontierDispersalPressure: frontierDispersal,
    knownOpportunityPull: 0,
    explorationBaseline,
    crowdingExploreBoost,
    saturationExploreBoost,
    daughterDispersalExploreBoost,
    explorationRiskPenalty,
    encounterTension: getLatestEncounterTension(band),
    encounterTolerance: getLatestEncounterTolerance(band),
    splitRisk: getLatestEncounterSplitRisk(band),
    scoutValue: 0,
    moveValue: 0,
    currentMarginalReturn: decisionCache.dryMarginContext?.stayMoveScout?.currentMarginalReturn ?? 0,
    expectedNextReturn: decisionCache.dryMarginContext?.stayMoveScout?.expectedNextReturn ?? 0,
    lossOfFallbackSecurity: 0,
    riverProspectStrength: 0,
    socialAccessRisk: decisionCache.dryMarginContext?.stayMoveScout?.socialAccessRisk ?? 0,
    logisticalProbeValue: 0,
  };
  const score = scoreDecision(scoreBreakdown) + explorationValue * 0.8;
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(currentTile), {
    type: "frontier_probe",
    strength: explorationValue,
    confidence: 0.64,
    relatedTileIds: [currentTile.id, targetTileId],
    intentKind: intentEvaluation.activeIntent?.kind ?? "expand_known_world",
    currentTileId: currentTile.id,
    targetTileId,
    frontierValue: frontierCandidate.frontierProbeValue,
    directionVector: frontierCandidate.directionVector,
  });

  const action: Action = {
    type: "explore_unknown_neighbor",
    fromTileId: currentTile.id,
    targetTileId,
  };

  return {
    action,
    scoreBreakdown,
    score: round2(score),
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 0, {
        type: "insufficient_known_tiles",
        strength: clamp01(Math.max(0, 12 - knownTileCount) / 12),
        confidence: 0.82,
        relatedTileIds: [currentTile.id],
        knownTileCount,
      }),
      makeReason(decisionId, "secondary", 1, {
        type: "low_confidence_memory",
        strength: clamp01(1 - averageConfidence),
        confidence: 0.72,
        relatedTileIds: [currentTile.id],
        memoryConfidence: averageConfidence,
      }),
    ],
    riverAssessment,
  };
}

// Resource-scout context (2K.1H), built from the band's OWN fields so it is identical
// at decision time and at apply time (deterministic). Anti-omniscient: distance is
// from known tile coords, novelty/no-gain from the band's own probe memory.
function buildResourceScoutContext(world: WorldState, band: Band): ResourceScoutContext {
  const currentTile = getTile(world, band.position);
  const population = Math.max(1, band.demography.population);
  const scoutCapacity = clamp01(band.demography.workingAdults / population);
  const probeRecord = (tileId: TileId) =>
    band.probeMemory?.recentTargets.find((record) => record.tileId === tileId);
  // 2K.6B / INFO-1: is this band currently in PROACTIVE information-seeking mode? Stable
  // (not in survival crisis, not driven to relocate) + has spare labor + its proactive
  // cooldown has elapsed. When true, selectResourceScoutTarget relaxes the VOI floor so an
  // under-known nearby patch becomes a valid scout target (a stable band learns before a
  // crisis); when false the selector is BYTE-IDENTICAL to pre-INFO-1. Deterministic.
  const proactiveFoodStress = getCanonicalFoodStress(band);
  const proactiveMobilityPressure = band.pressureState?.mobilityPressure ?? 0;
  const proactiveLabor = band.carryingCapacity?.populationDemand?.laborCapacity ?? band.size ?? 0;
  const proactiveCooldownOk =
    band.proactiveInfoMemory === undefined ||
    Number(world.time.tick) - Number(band.proactiveInfoMemory.lastProactiveInfoTick) >=
      PROACTIVE_INFO_COOLDOWN_SEASONS;
  const proactiveInfoMode =
    proactiveFoodStress < PROACTIVE_INFO_MAX_FOOD_STRESS &&
    proactiveMobilityPressure < PROACTIVE_INFO_MAX_MOBILITY_PRESSURE &&
    proactiveLabor >= PROACTIVE_INFO_MIN_LABOR &&
    proactiveCooldownOk;
  return {
    currentTileId: band.position,
    currentTick: Number(world.time.tick),
    proactiveInfoMode,
    season: world.time.season,
    waterStress: band.pressureState?.waterStress ?? 0,
    foodStress: band.pressureState?.foodStress ?? 0,
    perCapitaReturn:
      band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
      band.perCapitaReturn?.perCapitaReturn ??
      0.5,
    chronicDecline: band.returnTrend?.chronicDecline === true,
    scoutCapacity,
    exhaustedRangeStress: band.exhaustedRangeAudit?.stressLevel ?? 0,
    distanceTo: (tileId) => {
      const tile = getTile(world, tileId);
      if (tile === undefined || currentTile === undefined) {
        return undefined;
      }
      return Math.abs(tile.coord.x - currentTile.coord.x) + Math.abs(tile.coord.y - currentTile.coord.y);
    },
    probeNovelty: (tileId) => probeTargetNovelty(band.probeMemory, tileId, Number(world.time.tick)),
    probeNoGain: (tileId) => probeRecord(tileId)?.consecutiveNoGain ?? 0,
    // 2K.5: the band's own capped recent rings, so scout selection can derive
    // patch-return readiness (follow-up observation/testing guidance only).
    recentPlantUseTests: band.recentPlantUseTests,
    recentCauseSpecificEvents: band.recentCauseSpecificEvents,
    // 2K.7: the band's PERSISTED learned exploitation skill (from prior seasons — this season's
    // scout has not run yet, so this is competence already held, never about-to-be-gained). Lets
    // a band slightly prefer scouting/testing a KNOWN patch whose class it has learned to use.
    // undefined → byte-identical to pre-2K.7 selection.
    exploitationSkill: band.exploitationSkill,
    // 2K.12: the band's OWN learned seasonal-ecology memory + the reader flag, so scout
    // target selection can carry a bounded, selection-only seasonal bias. Flag default OFF
    // → byte-identical to pre-2K.12 selection.
    seasonalEcologyMemory: band.seasonalEcologyMemory,
    seasonalEcologyReadersEnabled: world.auditOptions?.seasonalEcologyMemoryReadersEnabled === true,
  };
}

// Audit-only helper: lets benchmark tooling inspect the exact resource-scout
// target selected from a band's private known-world state without reimplementing
// this file's scout context construction. Pure; not used by sim behavior.
export function selectResourceScoutTargetForAudit(
  world: WorldState,
  band: Band,
): ResourceScoutCandidate | undefined {
  return selectResourceScoutTarget(band.resourceKnowledgeState, buildResourceScoutContext(world, band));
}

// 2K.1H: general resource_scout candidate. A residence-unchanged INFORMATION action
// toward the best value-of-information resource belief (the band's own bounded patch
// memories). Competes with stay / move / probe; never feeds relocation. It carries the
// anchor-hold bonus (residence stays) so it can beat a blind move when worth scouting.
function buildResourceScoutCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return undefined;
  }

  const scoutContext = buildResourceScoutContext(world, band);
  const candidate = selectResourceScoutTarget(band.resourceKnowledgeState, scoutContext);

  if (candidate === undefined) {
    return undefined;
  }

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, candidate.targetTileId, "expand_known_world", decisionCache);
  const targetTile = getTile(world, candidate.targetTileId);

  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8 || targetTile === undefined) {
    return undefined;
  }

  // 2K.6B / INFO-1: when the band is proactive-eligible (the scout context computed stability
  // + spare labor + cooldown elapsed — and the selector surfaced this under-known/under-used
  // target only because of that mode), boost the residence-unchanged scout so it occasionally
  // WINS over a comfortable stay — learning before a crisis. A real expansion/refuge move
  // (higher-scoring) still beats it; the cooldown bounds it to ≤1 per window per band; it
  // feeds the scout→plant-test→2K.6-skill chain. (The "known patch, unknown USE" case is a
  // valid proactive target, so we do NOT exclude well-known patches here.)
  const proactiveInfoEligible = scoutContext.proactiveInfoMode === true;
  const proactiveInfoBoost = proactiveInfoEligible ? PROACTIVE_INFO_PULL : 0;
  const reportedTargetBias = getReportedKnowledgeTargetBias(band, candidate.targetTileId, decisionCache, {
    currentTick: world.time.tick,
    targetKnown: band.knowledge.observedTiles[candidate.targetTileId] !== undefined,
    routeEvidence:
      edgeMemo.riverAssessment.knownFordValue > 0.12 ||
      edgeMemo.riverAssessment.riverCorridorValue > 0.12 ||
      candidate.confidenceBefore > 0.32,
    localEvidence: candidate.distance <= 2,
  });

  const currentRecord = band.knowledge.observedTiles[currentTile.id];
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    // Residence-unchanged: keep the local survival value of staying put, plus a small
    // route/risk cost for sending the task group. The pull is the VOI additive below.
    foodValue: clamp01((currentRecord?.observedRichness ?? 0.35) * 0.18),
    waterValue: clamp01((currentRecord?.observedWaterAccess ?? 0.35) * 0.14),
    memoryConfidence: candidate.confidenceBefore,
    movementCost: clamp01(candidate.distance / 12 + candidate.laborCost * 0.2),
    riskCost: clamp01(
      edgeMemo.riverAssessment.riverCrossingRisk * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.14 +
        reportedTargetBias.cautionPenalty * 0.28,
    ),
    localUsePressure: clamp01(currentUsePressure * 0.18),
    routeValue: reportedTargetBias.opportunityBias,
    expectedFutureValue: clamp01(candidate.expectedInfoValue + reportedTargetBias.opportunityBias * 0.12),
    frontierProbeValue: clamp01(candidate.voiScore + reportedTargetBias.opportunityBias * 0.18),
  };

  const action: Action = {
    type: "resource_scout",
    originTileId: currentTile.id,
    targetTileId: candidate.targetTileId,
    scoutKind: candidate.scoutKind,
    targetResourceClass: candidate.targetResourceClass,
  };

  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(candidate.targetTileId), {
    type: "frontier_probe",
    strength: candidate.voiScore,
    confidence: candidate.confidenceBefore,
    relatedTileIds: [currentTile.id, candidate.targetTileId],
    intentKind: "expand_known_world",
    currentTileId: currentTile.id,
    targetTileId: candidate.targetTileId,
    frontierValue: candidate.voiScore,
    isProactiveInfo: proactiveInfoEligible ? true : undefined,
  });

  return {
    action,
    scoreBreakdown,
    score: round2(
      scoreDecision(scoreBreakdown) +
        candidate.voiScore * RESOURCE_SCOUT_SCORE_WEIGHT +
        getAnchorHoldBonus(decisionCache.anchorContext) +
        proactiveInfoBoost,
    ),
    primaryReason,
    secondaryReasons: [],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

function buildPressureReliefProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);
  const relief = decisionCache.campMovementSupport.pressureRelief.scoutProbeBridge;

  if (currentTile === undefined || relief === undefined || relief.actionStrategy !== "scout_probe") {
    return undefined;
  }

  const targetTile = getTile(world, relief.tileId);
  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, relief.tileId, "expand_known_world", decisionCache);

  if (targetTile === undefined || !edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
    return undefined;
  }

  const currentRecord = band.knowledge.observedTiles[currentTile.id];
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    foodValue: clamp01((currentRecord?.observedRichness ?? 0.35) * 0.16),
    waterValue: clamp01((currentRecord?.observedWaterAccess ?? 0.35) * 0.14),
    memoryConfidence: relief.knownness,
    movementCost: relief.crossingTravelCost,
    riskCost: clamp01(edgeMemo.riverAssessment.riverCrossingRisk * 0.26 + relief.uncertainty * 0.12),
    localUsePressure: clamp01(currentUsePressure * 0.18),
    routeValue: relief.sameRiverCountry ? 0.14 : 0.06,
    expectedFutureValue: relief.pressureReliefScore,
    frontierProbeValue: clamp01(relief.pressureReliefScore * 0.72 + (1 - relief.uncertainty) * 0.14),
    recoveryBenefit: relief.campSicknessWearRelief,
    depletionPenalty: clamp01(currentUsePressure * 0.12),
    riverCrossingCost: edgeMemo.riverAssessment.riverCrossingCost,
    riverCrossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    riverCorridorValue: edgeMemo.riverAssessment.riverCorridorValue,
    knownFordValue: edgeMemo.riverAssessment.knownFordValue,
    blockedCrossingPenalty: edgeMemo.riverAssessment.blockedCrossingPenalty,
    logisticalProbeValue: relief.pressureReliefScore,
  };
  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId: relief.tileId,
    prospectTileIds: [relief.tileId],
  };
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(relief.tileId), {
    type: "logistical_probe_selected",
    strength: relief.pressureReliefScore,
    confidence: relief.knownness,
    relatedTileIds: [currentTile.id, relief.tileId],
    bandId: band.id,
    currentTileId: currentTile.id,
    targetTileId: relief.tileId,
    prospectTileIds: [relief.tileId],
    stayValue: 0,
    scoutValue: relief.pressureReliefScore,
    moveValue: 0,
    marginalReturn: relief.supportAdequacy,
    departureThreshold: relief.waterRefugeAdequacy,
    uncertainty: relief.uncertainty,
    socialRisk: 0,
    crossingRisk: relief.crossingTravelCost,
    travelCost: relief.crossingTravelCost,
    basis: [
      relief.reasonLabel,
      relief.betterThanCurrent ? "better than current" : "good-enough relief, not richer-country migration",
      relief.sameRiverCountry ? "river country retained" : "familiar edge checked first",
    ],
  });

  return {
    action,
    scoreBreakdown,
    score: round2(
      scoreDecision(scoreBreakdown) +
        relief.pressureReliefScore * 1.24 +
        getAnchorHoldBonus(decisionCache.anchorContext) +
        (decisionCache.campMovementSupport.pressureRelief.localOrbitTrap.detected ? 0.06 : 0),
    ),
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 36, {
        type: "scout_before_relocation",
        strength: relief.pressureReliefScore,
        confidence: relief.knownness,
        relatedTileIds: [currentTile.id, relief.tileId],
        bandId: band.id,
        currentTileId: currentTile.id,
        targetTileId: relief.tileId,
        prospectTileIds: [relief.tileId],
        stayValue: 0,
        scoutValue: relief.pressureReliefScore,
        moveValue: 0,
        departureThreshold: relief.waterRefugeAdequacy,
        uncertainty: relief.uncertainty,
        socialRisk: 0,
        crossingRisk: relief.crossingTravelCost,
        travelCost: relief.crossingTravelCost,
        basis: ["pressure relief probe", relief.reasonLabel],
      }),
    ],
    riverAssessment: edgeMemo.riverAssessment,
    isOptInCandidate: true,
  };
}

// M0.7: act on M0.6 inferred frontier knowledge from a SETTLED band. A band dwelling on
// the near-water margin holds inferred corridor knowledge but has no unknown immediate
// neighbours (its 2-ring is observed), so explore_unknown_neighbor cannot act on it. This
// emits a residence-UNCHANGED logistical_probe to the NEAREST inferred frontier tile
// within INFERRED_FRONTIER_PROBE_RADIUS — a cautious reconnaissance that, when applied,
// OBSERVES the tile (inference → real KnownTileRecord) WITHOUT relocating. It expresses
// curiosity about reachable land it believes EXISTS, NOT richness: the score adds NO
// resource/yield value (inference carries none), is low-confidence and route/risk-checked,
// and competes as a probe only — never a relocation, never forced, never a rich target.
function buildInferredFrontierProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const inferred = band.frontierKnowledge?.inferredTiles;

  if (inferred === undefined) {
    return undefined;
  }

  // Only a SETTLED band reconnoitres its inferred corridor: a band that is actively
  // expanding or holding a frontier (active frontier intent, established frontier
  // residence, or meaningful frontier/daughter-dispersal pressure) must NOT be distracted
  // by local reconnaissance — that would blunt the M0.3–M0.5 frontier reach/retention this
  // checkpoint must preserve. So the probe is reserved for bands that are otherwise idle on
  // their margin (where it converts the odd inferred tile without perturbing expansion).
  //
  // M0.12 gate amendment: a band that is economically STUCK (deeply sub-viable
  // per-capita return) with no active intent and no established residence is NOT an
  // expanding band — its dispersal pressure is the symptom of being trapped, and
  // blocking reconnaissance on that pressure inverted the gate's purpose (M0.10/12
  // audits: dry-corridor bands held corridor-continuation beliefs for centuries but
  // never probed them). Desperation reconnaissance stays an information action:
  // residence-unchanged, no richness in the score, normal candidate competition.
  const economicallyStuck = (band.perCapitaReturn?.perCapitaReturn ?? 0.5) < 0.3;

  if (
    band.frontierIntent !== undefined ||
    band.frontierResidence?.established === true ||
    ((band.frontierDispersal?.pressure ?? 0) >= 0.2 && !economicallyStuck)
  ) {
    return undefined;
  }

  const currentTile = getTile(world, band.position);

  if (currentTile === undefined || !isBandPassableDestination(currentTile)) {
    return undefined;
  }

  const target = findReachableInferredFrontierProbeTarget(
    world,
    band,
    currentTile,
    inferred,
    decisionCache,
  );

  if (target === undefined) {
    return undefined;
  }

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, target.tileId, "expand_known_world", decisionCache);

  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
    return undefined; // route not plausible / would cross blocked water — never force it
  }

  // Deliberately MINIMAL breakdown: this is a residence-unchanged reconnaissance with
  // low existence confidence plus current refuge/risk context. It carries the route/risk
  // COST of sending a task group so it self-suppresses when the route is poor — but NO
  // local food/water yield and NO resource/yield value from the inferred target
  // (inference carries no richness).
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    waterRefugeSecurity: decisionCache.dryMarginContext?.stayMoveScout?.currentRefugeSecurity ?? 0,
    memoryConfidence: 0.2, // existence-only inference → low confidence
    movementCost: clamp01(target.routeDistance / 8 + 0.12),
    riskCost: clamp01(
      Math.max(target.routeRisk, edgeMemo.riverAssessment.riverCrossingRisk) * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.14,
    ),
  };

  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId: target.tileId,
    prospectTileIds: [target.tileId],
  };

  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(target.tileId), {
    type: "frontier_probe",
    strength: INFERRED_FRONTIER_EXPLORE_PULL,
    confidence: 0.2,
    relatedTileIds: [currentTile.id, target.tileId],
    intentKind: "expand_known_world",
    currentTileId: currentTile.id,
    targetTileId: target.tileId,
    frontierValue: INFERRED_FRONTIER_EXPLORE_PULL,
  });

  return {
    action,
    scoreBreakdown,
    // Cautious tie-breaker: the residence-unchanged base (route/risk cost only) plus a
    // tiny inferred-frontier curiosity. It loses to any decent stay / forage / refuge and
    // only surfaces when the band is otherwise idle on its margin — so it converts the odd
    // nearby inferred tile to observed without disrupting frontier expansion/retention.
    score: round2(scoreDecision(scoreBreakdown) + INFERRED_FRONTIER_EXPLORE_PULL + getAnchorHoldBonus(decisionCache.anchorContext) * 0.5),
    primaryReason,
    secondaryReasons: [],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

function findReachableInferredFrontierProbeTarget(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  inferred: InferredFrontierTiles,
  decisionCache: CandidateEvaluationCache,
): InferredFrontierProbeTarget | undefined {
  const queue: Array<{ readonly tileId: TileId; readonly distance: number; readonly routeRisk: number }> = [
    { tileId: currentTile.id, distance: 0, routeRisk: 0 },
  ];
  const visited = new Set<TileId>([currentTile.id]);
  let best: InferredFrontierProbeTarget | undefined;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const fromTile = getTile(world, current.tileId);

    if (fromTile === undefined || current.distance >= INFERRED_FRONTIER_PROBE_RADIUS) {
      continue;
    }

    const neighborIds = getSortedNeighborIds(fromTile);

    for (const neighborId of neighborIds) {
      if (visited.has(neighborId)) {
        continue;
      }

      const knownToBand =
        band.knowledge.observedTiles[neighborId] !== undefined || inferred[neighborId] !== undefined;

      if (!knownToBand) {
        continue;
      }

      const neighborTile = getTile(world, neighborId);

      if (neighborTile === undefined || neighborTile.isAquatic) {
        continue;
      }

      const edgeMemo = getCandidateEdgeMemo(
        world,
        band,
        current.tileId,
        neighborId,
        "expand_known_world",
        decisionCache,
      );

      if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
        continue;
      }

      const distance = current.distance + 1;
      const routeRisk = Math.max(current.routeRisk, edgeMemo.riverAssessment.riverCrossingRisk);
      visited.add(neighborId);

      if (inferred[neighborId] !== undefined && band.knowledge.observedTiles[neighborId] === undefined) {
        const candidate: InferredFrontierProbeTarget = {
          tileId: neighborId,
          routeDistance: distance,
          routeRisk,
        };

        if (
          best === undefined ||
          candidate.routeDistance < best.routeDistance ||
          (candidate.routeDistance === best.routeDistance && compareTileIds(candidate.tileId, best.tileId) < 0)
        ) {
          best = candidate;
        }
      }

      if (distance < INFERRED_FRONTIER_PROBE_RADIUS) {
        queue.push({ tileId: neighborId, distance, routeRisk });
      }
    }
  }

  return best;
}

// M0.16B: off-corridor SIDE-COUNTRY probe (knowledge CONSUMPTION). A settled/anchored corridor
// band may OCCASIONALLY send a residence-UNCHANGED logistical_probe to OBSERVE a nearby tile it
// INFERRED exists off the corridor (source off_corridor_side_inference), converting an existence
// belief into real KnownTileRecord knowledge. This is the M0.16 consumption path the M0.7 gate
// never opened for comfortable corridor bands. STRICT: side-source target only; residence
// UNCHANGED (never relocates, the side tile is never a move destination); no richness in the
// score (information motive only — anti-omniscience); hard-blocked under active expansion or
// survival stress; long cooldown + per-band lifetime cap; loses to survival/refuge moves;
// id-ordered. Information action, NOT a migration force.
function buildSideCountryProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const inferred = band.frontierKnowledge?.inferredTiles;

  if (inferred === undefined) {
    return undefined;
  }

  // Must actually hold an off-corridor side belief to consume.
  let hasSideBelief = false;
  for (const tileId of Object.keys(inferred)) {
    if (inferred[tileId as TileId].source === "off_corridor_side_inference") {
      hasSideBelief = true;
      break;
    }
  }

  if (!hasSideBelief) {
    return undefined;
  }

  // Gate. NOTE on frontier intent: a residence-UNCHANGED probe is compatible with holding an
  // expansion intent — the band scouts ONE season without abandoning its frontier and resumes
  // drifting next season — and HEAT corridor bands perpetually carry a strong intent (the
  // M0.16B funnel showed 4–5/5 with strength ≥ 0.5), so a hard intent gate blocks everyone and
  // mismatches the checkpoint's design (which gates on survival/stability/reachability, not
  // intent). So intent is NOT a hard gate here: SCORE arbitrates — a genuine expansion-move
  // candidate outscores this probe (reach preserved), while a comfortable-stay season loses to
  // it. The only hard survival gate is SEVERE food stress (never scout while truly starving).
  if ((band.pressureState?.foodStress ?? 0) >= SIDE_COUNTRY_PROBE_MAX_FOOD_STRESS) {
    return undefined; // busy surviving — forage/refuge first, not backcountry scouting
  }

  const settledEnough =
    band.frontierResidence?.established === true ||
    (band.placeMemory[band.position]?.visitCount ?? 0) >= SIDE_COUNTRY_PROBE_MIN_VISITS;

  if (!settledEnough) {
    return undefined; // only a settled/anchored band probes the side-country
  }

  // Cooldown + lifetime cap (rarity + boundedness). A band that has never side-probed has no
  // cadence → cooldown trivially satisfied, count 0; the gates above keep it inert otherwise.
  const cadence = band.sideProbeMemory;

  if (cadence !== undefined) {
    if (cadence.cumulativeSideProbes >= SIDE_COUNTRY_PROBE_LIFETIME_CAP) {
      return undefined; // lifetime side-scouting budget spent
    }
    if (
      Number(world.time.tick) - Number(cadence.lastSideProbeTick) <
      SIDE_COUNTRY_PROBE_COOLDOWN_SEASONS
    ) {
      return undefined; // still cooling down since the last side probe
    }
  }

  const currentTile = getTile(world, band.position);

  if (currentTile === undefined || !isBandPassableDestination(currentTile)) {
    return undefined;
  }

  const target = findReachableSideProbeTarget(world, band, currentTile, inferred, decisionCache);

  if (target === undefined) {
    return undefined; // no reachable inferred SIDE tile within the probe radius
  }

  const edgeMemo = getCandidateEdgeMemo(
    world,
    band,
    currentTile.id,
    target.tileId,
    "expand_known_world",
    decisionCache,
  );

  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
    return undefined; // route not plausible / would cross blocked water — never force it
  }

  const reportedTargetBias = getReportedKnowledgeTargetBias(band, target.tileId, decisionCache, {
    currentTick: world.time.tick,
    targetKnown: band.knowledge.observedTiles[target.tileId] !== undefined,
    routeEvidence:
      inferred[target.tileId] !== undefined ||
      edgeMemo.riverAssessment.knownFordValue > 0.12 ||
      edgeMemo.riverAssessment.riverCorridorValue > 0.12,
    localEvidence: target.routeDistance <= 2,
  });
  // Information-motive breakdown: existence-only (low memoryConfidence), the principled
  // `explorationValue` channel carries the value (information is worth gathering even when
  // comfortable), plus refuge context and the route/risk COST so a poor route self-suppresses.
  // NO food/water/yield from the inferred target (it carries no richness — anti-omniscience).
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    waterRefugeSecurity: decisionCache.dryMarginContext?.stayMoveScout?.currentRefugeSecurity ?? 0,
    memoryConfidence: 0.2, // existence-only inference → low confidence
    routeValue: reportedTargetBias.opportunityBias,
    explorationValue: SIDE_COUNTRY_PROBE_EXPLORATION_VALUE + reportedTargetBias.opportunityBias * 0.12,
    movementCost: clamp01(target.routeDistance / 8 + 0.12),
    riskCost: clamp01(
      Math.max(target.routeRisk, edgeMemo.riverAssessment.riverCrossingRisk) * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.14 +
        reportedTargetBias.cautionPenalty * 0.28,
    ),
  };

  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId: target.tileId,
    prospectTileIds: [target.tileId],
  };

  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(target.tileId), {
    type: "frontier_probe",
    strength: SIDE_COUNTRY_PROBE_EXPLORATION_VALUE,
    confidence: 0.2,
    relatedTileIds: [currentTile.id, target.tileId],
    intentKind: "expand_known_world",
    currentTileId: currentTile.id,
    targetTileId: target.tileId,
    frontierValue: INFERRED_FRONTIER_EXPLORE_PULL,
    isSideCountryProbe: true,
  });

  return {
    action,
    scoreBreakdown,
    // The information value lives in the breakdown (explorationValue), so the score is the
    // standard scoreDecision + the usual small anchor-hold bonus — no bespoke additive pull.
    score: round2(scoreDecision(scoreBreakdown) + getAnchorHoldBonus(decisionCache.anchorContext) * 0.5),
    primaryReason,
    secondaryReasons: [],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

// M0.16B: nearest reachable inferred OFF-CORRIDOR SIDE tile within the probe radius. Mirrors
// findReachableInferredFrontierProbeTarget's bounded id-ordered BFS, but a tile only qualifies
// as a target when its inference source is `off_corridor_side_inference` (so the side probe
// never accidentally observes a margin/corridor tile — those are M0.7's domain). Land-only,
// passable-only, route/crossing-checked; existence-only (reads no richness).
function findReachableSideProbeTarget(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  inferred: InferredFrontierTiles,
  decisionCache: CandidateEvaluationCache,
): InferredFrontierProbeTarget | undefined {
  const queue: Array<{ readonly tileId: TileId; readonly distance: number; readonly routeRisk: number }> = [
    { tileId: currentTile.id, distance: 0, routeRisk: 0 },
  ];
  const visited = new Set<TileId>([currentTile.id]);
  let best: InferredFrontierProbeTarget | undefined;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const fromTile = getTile(world, current.tileId);

    if (fromTile === undefined || current.distance >= INFERRED_FRONTIER_PROBE_RADIUS) {
      continue;
    }

    const neighborIds = getSortedNeighborIds(fromTile);

    for (const neighborId of neighborIds) {
      if (visited.has(neighborId)) {
        continue;
      }

      const knownToBand =
        band.knowledge.observedTiles[neighborId] !== undefined || inferred[neighborId] !== undefined;

      if (!knownToBand) {
        continue; // traverse only through band-known land (no omniscient pathing)
      }

      const neighborTile = getTile(world, neighborId);

      if (neighborTile === undefined || neighborTile.isAquatic) {
        continue;
      }

      const edgeMemo = getCandidateEdgeMemo(
        world,
        band,
        current.tileId,
        neighborId,
        "expand_known_world",
        decisionCache,
      );

      if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
        continue;
      }

      const distance = current.distance + 1;
      const routeRisk = Math.max(current.routeRisk, edgeMemo.riverAssessment.riverCrossingRisk);
      visited.add(neighborId);

      const record = inferred[neighborId];

      if (
        record !== undefined &&
        record.source === "off_corridor_side_inference" &&
        band.knowledge.observedTiles[neighborId] === undefined
      ) {
        const candidate: InferredFrontierProbeTarget = {
          tileId: neighborId,
          routeDistance: distance,
          routeRisk,
        };

        if (
          best === undefined ||
          candidate.routeDistance < best.routeDistance ||
          (candidate.routeDistance === best.routeDistance && compareTileIds(candidate.tileId, best.tileId) < 0)
        ) {
          best = candidate;
        }
      }

      if (distance < INFERRED_FRONTIER_PROBE_RADIUS) {
        queue.push({ tileId: neighborId, distance, routeRisk });
      }
    }
  }

  return best;
}

// M0.8: bounded corridor RELOCATION. A SETTLED band that has formed inferred shore-corridor
// knowledge AND already personally OBSERVED the adjacent corridor step (route evidence) may
// relocate ONE step onto that observed near-water-margin tile when it makes progress toward
// its nearest inferred frontier tile — i.e. it walks the band-known shore corridor toward
// the believed-reachable land it has not yet seen, so that after the move its new 2-ring
// observation extends the known corridor and it can step again. STRICT limits: the step
// target is a band-OBSERVED land tile (its value is the band's real observed record, NEVER
// truth overlay and NEVER an inferred tile used as a yield opportunity — inference only sets
// the DIRECTION); distance 1 only (no jump to a far/rich tile); never aquatic (so the rich
// aquatic tile:53:67 can never be a target); route/crossing/water-refuge checked; a cautious
// move that competes normally (loses to a good stay/forage), gated to settled bands so it
// never forces a daughter migration or abandons a refuge under pressure.
function buildCorridorRelocationCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  intentEvaluation: MobilityIntentEvaluation,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const inferred = band.frontierKnowledge?.inferredTiles;

  if (inferred === undefined) {
    return undefined;
  }

  // Settled bands only (mirror the M0.7 probe gate): never distract a band that is
  // actively expanding or holding a frontier, and never force a daughter migration.
  if (
    band.frontierIntent !== undefined ||
    band.frontierResidence?.established === true ||
    (band.frontierDispersal?.pressure ?? 0) >= 0.2
  ) {
    return undefined;
  }

  const currentTile = getTile(world, band.position);

  if (currentTile === undefined || !isBandPassableDestination(currentTile)) {
    return undefined;
  }

  // Re-settle before stepping: the band must have DWELT at its current tile (sustained
  // presence) before it relocates again. This keeps the corridor walk genuinely STEPWISE
  // (settle → step → settle), keeps residence/anchor safety relevant, and prevents a
  // continuous nomadic shuffle along the shore.
  if ((band.placeMemory[band.position]?.visitCount ?? 0) < CORRIDOR_RELOCATION_MIN_VISITS) {
    return undefined;
  }

  // M0.8-A cooldown (dwell-since-LAST-RELOCATION): the absolute-visitCount gate above let a
  // band hop onto an already-familiar tile and immediately re-step. Require a minimum dwell
  // measured from the band's OWN last corridor relocation, so the cadence is a genuine
  // settle→step→settle even across familiar tiles. (Baseline never relocates → state stays
  // undefined → seasonsSinceLastRelocation = Infinity → no effect; byte-identical preserved.)
  const seasonsSinceLastRelocation =
    band.corridorRelocation === undefined ? Infinity : world.time.tick - band.corridorRelocation.lastRelocationTick;

  if (seasonsSinceLastRelocation < CORRIDOR_RELOCATION_COOLDOWN_SEASONS) {
    return undefined; // still dwelling since the last relocation — rate-limited
  }

  // Anchor reluctance: steps accumulated in the current un-settled run (a long settled gap
  // dissolves the run → 0) add a capped score penalty, so a band that has already drifted
  // several steps without re-anchoring becomes reluctant to step again and the walk settles.
  const unsettledStepRun =
    band.corridorRelocation === undefined || seasonsSinceLastRelocation >= CORRIDOR_RELOCATION_SETTLE_RESET_SEASONS
      ? 0
      : band.corridorRelocation.cumulativeStepsSinceSettled;
  const anchorReluctance = Math.min(
    CORRIDOR_RELOCATION_RELUCTANCE_CAP,
    unsettledStepRun * CORRIDOR_RELOCATION_RELUCTANCE_PER_STEP,
  );

  // Direction goal: the nearest inferred frontier tile (existence belief only — used for
  // DIRECTION, never value). Deterministic (Manhattan nearest, id tie-break).
  let goalId: TileId | undefined;
  let goalCoord: { readonly x: number; readonly y: number } | undefined;
  let goalDistance = Infinity;

  for (const inferredId of Object.keys(inferred)) {
    // M0.16: off-corridor SIDE beliefs feed ONLY the residence-unchanged M0.7
    // probe (opportunity-to-scout), never this relocation HEADING — a band does
    // not walk the shore corridor to reach perpendicular backcountry, it probes
    // it from the corridor. Skipping the new source here keeps M0.8's direction
    // goal exactly margin/corridor (its pre-M0.16 behaviour) and is a no-op on
    // worlds without side beliefs.
    if (inferred[inferredId as TileId].source === "off_corridor_side_inference") {
      continue;
    }

    const inferredTile = getTile(world, inferredId as TileId);

    if (inferredTile === undefined) {
      continue;
    }

    const distance = Math.abs(inferredTile.coord.x - currentTile.coord.x) + Math.abs(inferredTile.coord.y - currentTile.coord.y);

    if (distance < goalDistance || (distance === goalDistance && goalId !== undefined && compareTileIds(inferredId as TileId, goalId) < 0)) {
      goalDistance = distance;
      goalCoord = inferredTile.coord;
      goalId = inferredId as TileId;
    }
  }

  if (goalCoord === undefined || goalDistance <= 1) {
    return undefined; // no inferred goal, or already adjacent (the probe handles that)
  }

  // Best adjacent step: a band-OBSERVED, passable, near-water-margin LAND neighbour that is
  // route-safe and strictly reduces the Manhattan distance to the goal (real progress).
  let bestStep: { readonly tile: Tile; readonly record: KnownTileRecord; readonly routeRisk: number; readonly newDistance: number } | undefined;

  for (const neighborId of getSortedNeighborIds(currentTile)) {
    const record = band.knowledge.observedTiles[neighborId];

    if (record === undefined) {
      continue; // relocation only onto a tile the band has actually OBSERVED (route evidence)
    }

    const neighborTile = getTile(world, neighborId);

    // M0.13: creeks/seasonal streams are legal (weaker) corridor routes — at
    // ~1 km/tile they are how plains and dry margins were historically
    // traversed. A creek-corridor step is allowed alongside the open-water
    // margin; it is naturally weaker because the step is scored from the
    // tile's OWN observed water/richness (creek tiles carry less of both).
    if (
      neighborTile === undefined ||
      !isBandPassableDestination(neighborTile) ||
      (!isNearWaterMarginLand(world, neighborTile) && !isChannelCorridorLand(world, neighborTile))
    ) {
      continue;
    }

    const newDistance = Math.abs(neighborTile.coord.x - goalCoord.x) + Math.abs(neighborTile.coord.y - goalCoord.y);

    if (newDistance >= goalDistance) {
      continue; // no progress toward the believed corridor → skip
    }

    const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, neighborId, "expand_known_world", decisionCache);

    if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
      continue;
    }

    if (
      bestStep === undefined ||
      newDistance < bestStep.newDistance ||
      (newDistance === bestStep.newDistance && compareTileIds(neighborTile.id, bestStep.tile.id) < 0)
    ) {
      bestStep = { tile: neighborTile, record, routeRisk: edgeMemo.riverAssessment.riverCrossingRisk, newDistance };
    }
  }

  if (bestStep === undefined) {
    return undefined;
  }

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, bestStep.tile.id, "expand_known_world", decisionCache);
  // Cautious breakdown: the step target's REAL band-observed value (modest weights) +
  // route/risk/refuge cost. No inferred richness, no truth overlay. The corridor-progress
  // curiosity is added to the score below (direction only, no yield).
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    foodValue: clamp01((bestStep.record.observedRichness ?? 0.35) * 0.3),
    waterValue: clamp01((bestStep.record.observedWaterAccess ?? 0.35) * 0.22),
    waterRefugeSecurity: decisionCache.dryMarginContext?.stayMoveScout?.currentRefugeSecurity ?? 0,
    memoryConfidence: clamp01(bestStep.record.confidence),
    movementCost: 0.42,
    riskCost: clamp01(
      Math.max(bestStep.routeRisk, edgeMemo.riverAssessment.riverCrossingRisk) * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.14,
    ),
  };

  const action: Action = { type: "move_to_tile", targetTileId: bestStep.tile.id };
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(bestStep.tile.id), {
    type: "frontier_probe",
    strength: CORRIDOR_RELOCATION_PULL,
    confidence: clamp01(bestStep.record.confidence),
    relatedTileIds: [currentTile.id, bestStep.tile.id],
    intentKind: "expand_known_world",
    currentTileId: currentTile.id,
    targetTileId: bestStep.tile.id,
    frontierValue: CORRIDOR_RELOCATION_PULL,
    // Unambiguous M0.8 corridor-relocation marker (M0.8-A): distinguishes this from the
    // pre-existing mobility-intent frontier_probe moves so audits/cadence measure it alone.
    isCorridorRelocation: true,
  });

  return {
    action,
    scoreBreakdown,
    // Cautious relocation: real observed step value + a small corridor-progress curiosity
    // (no anchor hold — the band is deliberately stepping along the shore), MINUS the M0.8-A
    // anchor reluctance that grows per un-settled step. It loses to a good stay/forage and
    // only wins when the band is otherwise idle and the step both progresses toward its
    // believed corridor and is a safe observed tile — and, once it has drifted several
    // steps, only when the step's REAL observed value (not the curiosity) still justifies it.
    score: round2(scoreDecision(scoreBreakdown) + CORRIDOR_RELOCATION_PULL - anchorReluctance),
    primaryReason,
    secondaryReasons: [],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

// M0.8-A: true when an applied decision is a corridor relocation that actually moved the
// band (a move_to_tile carrying the corridor-relocation `frontier_probe` primary reason —
// the M0.7 inferred-frontier probe is a logistical_probe, never move_to_tile, so this is
// unambiguous). Used to advance the relocation cadence governor.
function isAppliedCorridorRelocation(decision: Decision, moved: boolean): boolean {
  return (
    moved &&
    decision.action.type === "move_to_tile" &&
    decision.primaryReason.type === "frontier_probe" &&
    decision.primaryReason.isCorridorRelocation === true
  );
}

// M0.16B: true when an applied decision is an off-corridor side-country probe — a residence-
// UNCHANGED `logistical_probe` carrying the `frontier_probe` primary reason flagged
// `isSideCountryProbe`. Residence-unchanged, so it is unambiguous against the M0.8 corridor
// relocation (move_to_tile) and the M0.7 inferred-frontier probe (no isSideCountryProbe flag).
// Used to advance the side-probe cadence/budget governor and to count side-probe wins.
function isAppliedSideCountryProbe(decision: Decision): boolean {
  return (
    decision.action.type === "logistical_probe" &&
    decision.primaryReason.type === "frontier_probe" &&
    decision.primaryReason.isSideCountryProbe === true
  );
}

// 2K.10 — side-country resource/patch memory formation. When an applied side-country probe OBSERVES
// its inferred side tile, run the SAME band-known observation→patch-memory pipeline that resource_scout
// uses (deriveResourceClassAvailability + updateResourceKnowledgeFromObservation) for that ONE observed
// tile — so side-country becomes ecologically meaningful (a remembered resource/patch class), not just
// "I saw land". Anti-omniscient: forms ONLY from the band's own OBSERVED record of the tile (requires
// updatedKnowledge.observedTiles[tileId] to exist — an inferred-only tile, never reached, forms NOTHING),
// salience-gated and low first-observation confidence (the existing pipeline), capped by the existing cap.
// NEVER mutates tile yield/truth, grants no support/safety/processing certainty, forces no movement.
export function formSideCountryResourceMemory(
  world: WorldState,
  band: Band,
  tileId: TileId,
  updatedKnowledge: Band["knowledge"],
): ResourceKnowledgeState | undefined {
  const record = updatedKnowledge.observedTiles[tileId];

  if (record === undefined) {
    return undefined; // not actually observed → no resource memory (the anti-omniscience gate)
  }

  const baseHab = deriveBaseHabitatPotential(tileId, record, world.time);
  const summary = deriveResourceClassAvailability(baseHab, record, world.time);

  return updateResourceKnowledgeFromObservation(band.resourceKnowledgeState, summary, {
    tileId,
    tick: world.time.tick,
    season: world.time.season,
    waterStress: band.pressureState?.waterStress ?? 0,
    perCapitaReturn:
      band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
      band.perCapitaReturn?.perCapitaReturn ??
      0.5,
    anchorTileId: band.residentialAnchor?.anchorTileId,
    observationSource: "side_country_probe",
  });
}

// 2K.11 — side-encountered cautious test. When a side-country probe formed a patch memory at a
// PLANT-BEARING side tile, run the SAME band-known plant-use-test chain the resource_scout uses
// (plant observation → eligibility → cautious test → cause event) on that ONE remembered patch, so
// exploitationSkill can ACCRUE for the side class the band actually encountered — closing the 2K.10
// gap (sideFormedWithMatchingSkill was 0). Testability gate: derivePlantScoutObservationHint returns
// nothing for a non-plant side tile (water / fallback floor / barren → no test). Anti-omniscient: it
// reads the band's OWN observed plant hint (the same bounded perception the scout uses) + a
// band-known patch memory it just formed; outcomes stay suspicion-level (the existing cautious-test
// rules) — NO calories/support/safety/processing certainty. Rarity is inherited from the side-probe
// cadence (M0.16B cooldown + lifetime cap, daughter-reset): at most one test per applied side probe.
export function applySideEncounteredCautiousTest(
  world: WorldState,
  band: Band,
  tileId: TileId,
  sideResourceState: ResourceKnowledgeState,
) {
  const tile = getTile(world, tileId);

  if (tile === undefined) {
    return undefined;
  }

  const hint = derivePlantScoutObservationHint(tile, world.time, "plant_patch");

  // Testability gate: a non-plant-bearing side tile yields no plant hint → no cautious test.
  if (hint === undefined || hint.observedPlantClassId === undefined || hint.linkedResourceClassId === undefined) {
    return undefined;
  }

  const resourceClass = hint.linkedResourceClassId;
  const memory = sideResourceState.patchMemories.find(
    (entry) => entry.approximateTile === tileId && entry.resourceClassId === resourceClass,
  );

  if (memory === undefined) {
    return undefined; // no band-known side memory of this observed class to test
  }

  const reasonId = `reason:side_encountered_cautious_test:${memory.patchId}:${Number(world.time.tick)}` as ReasonId;
  const memoryWithObs: ResourcePatchMemory = {
    ...memory,
    plantObservation: plantObservationMemoryFromHint(memory.plantObservation, hint, world.time.tick, reasonId),
  };
  const stateWithObs: ResourceKnowledgeState = {
    ...sideResourceState,
    patchMemories: sideResourceState.patchMemories.map((entry) =>
      entry.patchId === memory.patchId ? memoryWithObs : entry,
    ),
  };

  const season = world.time.season;
  const foodStress = getCanonicalFoodStress(band);
  const perCapitaReturn =
    band.carryingCapacity?.perCapitaReturn.perCapitaReturn ?? band.perCapitaReturn?.perCapitaReturn ?? 0.5;
  const eligibility = derivePlantUseEligibility(memoryWithObs, {
    tick: world.time.tick,
    season,
    foodStress,
    perCapitaReturn,
    laborCapacity: band.carryingCapacity?.populationDemand?.laborCapacity,
    dependencyLoad: band.carryingCapacity?.populationDemand?.dependencyLoad,
  });
  const testUpdate = applyPlantUseTestFromEligibility(stateWithObs, {
    bandId: band.id,
    tick: world.time.tick,
    season,
    memory: memoryWithObs,
    eligibility,
    foodStress,
    perCapitaReturn,
  });
  const causeUpdate = deriveCauseSpecificEventFromPlantUseTest(testUpdate.resourceKnowledgeState, {
    bandId: band.id,
    tick: world.time.tick,
    season,
    memory: testUpdate.memory,
    plantUseTest: testUpdate.event,
    eligibility,
  });

  return {
    resourceKnowledgeState: causeUpdate?.resourceKnowledgeState ?? testUpdate.resourceKnowledgeState,
    plantUseTest: testUpdate.event,
    causeSpecificEvent: causeUpdate?.event,
  };
}

// 2K.6B / INFO-1: true when an applied decision is a PROACTIVE resource_scout — a residence-
// unchanged resource_scout carrying the `frontier_probe` primary reason flagged
// `isProactiveInfo`. Used to advance the proactive-info cadence governor and count the actions.
function isAppliedProactiveInfo(decision: Decision): boolean {
  return (
    decision.action.type === "resource_scout" &&
    decision.primaryReason.type === "frontier_probe" &&
    decision.primaryReason.isProactiveInfo === true
  );
}

// M0.8-B: an executed PRE-EXISTING mobility-intent shore/frontier probe move — a `move_to_tile`
// whose primary reason is `frontier_probe` and is NOT the M0.8 corridor relocation. This is
// exactly the set the lake audit counts as `mobilityIntentFrontierMoveCount` (probe_coast /
// probe_wetland_or_lake / expand_known_world). Daughter expansion carries a different reason
// (`frontier_dispersal_pressure`) and so never advances this cadence.
function isAppliedShorelineProbeMove(decision: Decision, moved: boolean): boolean {
  return (
    moved &&
    decision.action.type === "move_to_tile" &&
    decision.primaryReason.type === "frontier_probe" &&
    decision.primaryReason.isCorridorRelocation !== true
  );
}

// M0.9: an executed realized corridor/probe move (frontier_probe shore/expand, M0.8 relocation,
// or corridor_following river/pass) — the moves whose REALIZED direction may build a heading.
function isAppliedCorridorOrProbeMove(decision: Decision, moved: boolean): boolean {
  return (
    moved &&
    decision.action.type === "move_to_tile" &&
    (decision.primaryReason.type === "frontier_probe" ||
      decision.primaryReason.type === "corridor_following")
  );
}

function corridorHeadingSourceForDecision(decision: Decision): CorridorHeadingSource {
  const reason = decision.primaryReason;

  if (reason.type === "frontier_probe" && reason.isCorridorRelocation === true) {
    return "inferred_frontier_relocation";
  }

  if (reason.type === "corridor_following") {
    return "corridor_move";
  }

  if (reason.type === "frontier_probe" && reason.intentKind === "expand_known_world") {
    return "frontier_probe_expand";
  }

  return "shoreline_probe";
}

// Raw (un-normalized) move delta old→new tile; advanceCorridorHeading normalizes it. Returns
// undefined when either tile is missing (no directional information).
function getRealizedMoveDelta(
  world: WorldState,
  fromTileId: TileId,
  toTileId: TileId,
): { readonly x: number; readonly y: number } | undefined {
  const fromTile = getTile(world, fromTileId);
  const toTile = getTile(world, toTileId);

  if (fromTile === undefined || toTile === undefined) {
    return undefined;
  }

  return { x: toTile.coord.x - fromTile.coord.x, y: toTile.coord.y - fromTile.coord.y };
}

// Advance the cadence governor when a corridor relocation executes: stamp this tick as the
// last relocation and increment the un-settled step run. A long settled gap since the prior
// relocation (≥ SETTLE_RESET) means the band genuinely re-anchored, so the run restarts at 1.
function advanceCorridorRelocationState(
  prior: CorridorRelocationState | undefined,
  tick: TickNumber,
): CorridorRelocationState {
  const seasonsSinceLast = prior === undefined ? Infinity : tick - prior.lastRelocationTick;
  const priorRun =
    prior === undefined || seasonsSinceLast >= CORRIDOR_RELOCATION_SETTLE_RESET_SEASONS
      ? 0
      : prior.cumulativeStepsSinceSettled;

  return { lastRelocationTick: tick, cumulativeStepsSinceSettled: priorRun + 1 };
}

// 2K.1H: apply an executed resource_scout. Observes the target patch (band perception)
// and routes it through the existing observation -> resource-knowledge pipeline, which
// raises mostly presence/access/season confidence and upgrades inferred beliefs in
// place. Produces a conservative, partial, deterministic outcome for debug. Touches
// resource belief / patch memory ONLY — never yield/stress/mortality/position.
function applyResourceScoutObservation(
  world: WorldState,
  band: Band,
  action: Extract<Action, { type: "resource_scout" }>,
  updatedKnowledge: Band["knowledge"],
  newTilesObserved: boolean,
): { readonly resourceKnowledgeState: ResourceKnowledgeState | undefined; readonly debug: ResourceScoutDebug } {
  const targetTileId = action.targetTileId;
  const targetClass = action.targetResourceClass;
  const tick = Number(world.time.tick);
  const season = world.time.season;
  const findPatch = (state: ResourceKnowledgeState | undefined) =>
    state?.patchMemories.find((m) => m.approximateTile === targetTileId && m.resourceClassId === targetClass);

  const before = findPatch(band.resourceKnowledgeState);
  const beforeEff = before === undefined ? undefined : effectiveResourceConfidence(before, tick);
  const beforeProfile = effectiveConfidenceProfile(before, tick);
  const presenceBefore = beforeProfile.presenceConfidence;
  const accessBefore = beforeProfile.accessConfidence;
  const expectedSeasonalFit = expectationSeasonalFit(before, targetClass, season);
  const expectedYieldHint = round2(Math.max(beforeProfile.yieldConfidence, before?.useHistory.lastYieldEstimate ?? 0));
  const expectedSafety = beforeProfile.safetyConfidence;

  // Re-derive the candidate (same band-field context as decision time, deterministic)
  // to surface the decision-time reason vector / VOI / candidate count in debug.
  const candidate = selectResourceScoutTarget(band.resourceKnowledgeState, buildResourceScoutContext(world, band));
  const dbg = candidate !== undefined && candidate.targetTileId === targetTileId ? candidate : undefined;
  const targetSource = dbg?.targetSource ?? before?.source ?? "inferred";
  const previousNoGainCount =
    band.probeMemory?.recentTargets.find((record) => record.tileId === targetTileId)?.consecutiveNoGain ?? 0;
  const targetTile = getTile(world, targetTileId);
  const plantObservation = targetTile === undefined
    ? undefined
    : derivePlantObservationForResourceScout(action, targetTile, world.time);

  const targetRecord = updatedKnowledge.observedTiles[targetTileId];
  let observedClassAvailability = 0;
  let observedClassSupport = 0;
  let observedSeasonalFit = 0;
  let observedAccess = 0;
  let resourceKnowledgeStateAfterObservation = band.resourceKnowledgeState;
  if (targetRecord !== undefined) {
    const baseHab = deriveBaseHabitatPotential(targetTileId, targetRecord, world.time);
    const summary = deriveResourceClassAvailability(baseHab, targetRecord, world.time);
    const contribution = summary.contributionByClass.find((entry) => entry.classId === targetClass);
    observedClassAvailability = clamp01(contribution?.availability ?? 0);
    observedClassSupport = clamp01(contribution?.supportContribution ?? 0);
    observedSeasonalFit = clamp01(contribution?.seasonalModifier ?? 0);
    observedAccess = clamp01((1 - (targetRecord.observedMovementCost ?? 0.5)) * 0.6 + targetRecord.confidence * 0.4);
    resourceKnowledgeStateAfterObservation =
      updateResourceKnowledgeFromObservation(band.resourceKnowledgeState, summary, {
        tileId: targetTileId,
        tick: world.time.tick,
        season,
        waterStress: band.pressureState?.waterStress ?? 0,
        perCapitaReturn:
          band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
          band.perCapitaReturn?.perCapitaReturn ??
          0.5,
        anchorTileId: band.residentialAnchor?.anchorTileId,
      }) ?? band.resourceKnowledgeState;
  }

  if (plantObservation !== undefined) {
    observedClassAvailability = plantObservation.observedAvailabilityHint;
    observedClassSupport = plantObservation.observedAbundanceHint;
    observedSeasonalFit = plantObservation.seasonalFitHint;
    observedAccess = plantObservation.accessHint;
  }

  const afterObservation = findPatch(resourceKnowledgeStateAfterObservation);
  const afterObservationProfile = effectiveConfidenceProfile(afterObservation, tick);
  const outcome = plantObservation === undefined
    ? classifyScoutOutcome({
        scoutKind: action.scoutKind,
        targetResourceClass: targetClass,
        presenceBefore,
        presenceAfter: afterObservationProfile.presenceConfidence,
        observedClassAvailability,
        seasonMatch: observedSeasonalFit,
        newTilesObserved,
        accessBefore,
        accessAfter: observedAccess,
      })
    : mapPlantObservationToScoutOutcome(plantObservation);
  const contradictionKind = classifyScoutContradiction({
    scoutKind: action.scoutKind,
    targetSource,
    outcome,
    expectedPresence: presenceBefore,
    expectedSeasonalFit,
    expectedYieldHint,
    expectedAccess: accessBefore,
    observedPresenceHint: observedClassAvailability,
    observedSeasonalFit,
    observedYieldHint: observedClassSupport,
    observedAccess,
    previousNoGainCount,
    wasStale: beforeEff?.isStale === true,
  });
  const learningUpdate = applyResourceScoutLearningDelta({
    state: resourceKnowledgeStateAfterObservation,
    bandId: band.id,
    tick: world.time.tick,
    season,
    originTile: action.originTileId,
    targetTile: targetTileId,
    scoutKind: action.scoutKind,
    targetResourceClass: targetClass,
    targetSource,
    outcome,
    contradictionKind,
    expectedPresence: presenceBefore,
    expectedSeasonalFit,
    expectedYieldHint,
    expectedAccess: accessBefore,
    expectedSafety,
    observedPresenceHint: observedClassAvailability,
    observedSeasonalFit,
    observedYieldHint: observedClassSupport,
    observedAccess,
    plantObservation,
  });

  const resourceKnowledgeStateAfterScout = learningUpdate.state;
  const afterScout = findPatch(resourceKnowledgeStateAfterScout);
  const afterScoutProfile = effectiveConfidenceProfile(afterScout, tick);
  const memoryUpdated = resourceKnowledgeStateAfterScout !== band.resourceKnowledgeState;
  const plantUseEligibility = afterScout === undefined || plantObservation === undefined
    ? undefined
    : derivePlantUseEligibility(afterScout, {
        tick: world.time.tick,
        season,
        foodStress: getCanonicalFoodStress(band),
        perCapitaReturn:
          band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
          band.perCapitaReturn?.perCapitaReturn ??
          0.5,
        laborCapacity: band.carryingCapacity?.populationDemand?.laborCapacity,
        dependencyLoad: band.carryingCapacity?.populationDemand?.dependencyLoad,
      });
  const plantUseTestUpdate =
    resourceKnowledgeStateAfterScout === undefined || afterScout === undefined || plantUseEligibility === undefined
      ? undefined
      : applyPlantUseTestFromEligibility(resourceKnowledgeStateAfterScout, {
          bandId: band.id,
          tick: world.time.tick,
          season,
          memory: afterScout,
          eligibility: plantUseEligibility,
          foodStress: getCanonicalFoodStress(band),
          perCapitaReturn:
            band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
            band.perCapitaReturn?.perCapitaReturn ??
            0.5,
        });
  const resourceKnowledgeStateAfterPlantTest =
    plantUseTestUpdate?.resourceKnowledgeState ?? resourceKnowledgeStateAfterScout;
  // 2K.3A: derive a bounded NONLETHAL cause-specific event ONLY from a risk-relevant
  // plant-use/test outcome (safety/processing suspicion, avoidance, supported fallback
  // reaction). Updates conservative band-known caution memory (behaviour-neutral risk
  // flags / observation suspicion) + debug only — never yield/CC/stress/mortality/
  // population/relocation/fission. Most plant tests produce NO cause event.
  const causeSpecificUpdate =
    plantUseTestUpdate === undefined || plantUseEligibility === undefined
      ? undefined
      : deriveCauseSpecificEventFromPlantUseTest(plantUseTestUpdate.resourceKnowledgeState, {
          bandId: band.id,
          tick: world.time.tick,
          season,
          memory: plantUseTestUpdate.memory,
          plantUseTest: plantUseTestUpdate.event,
          eligibility: plantUseEligibility,
        });
  const resourceKnowledgeState =
    causeSpecificUpdate?.resourceKnowledgeState ?? resourceKnowledgeStateAfterPlantTest;
  const learning = buildScoutExpectationRecord({
    bandId: band.id,
    tick,
    season,
    originTile: action.originTileId,
    targetTile: targetTileId,
    scoutKind: action.scoutKind,
    targetResourceClass: targetClass,
    targetSource,
    expectedPresence: presenceBefore,
    expectedSeasonalFit,
    expectedYieldHint,
    expectedAccess: accessBefore,
    expectedSafety,
    observedPresenceHint: observedClassAvailability,
    observedSeasonalFit,
    observedYieldHint: observedClassSupport,
    observedAccess,
    plantObservation,
    outcome,
    contradictionKind,
    confidenceBefore: beforeProfile,
    confidenceAfter: afterScoutProfile,
    memoryUpdated,
    reasonIds: learningUpdate.reasonIds,
  });

  return {
    resourceKnowledgeState,
    debug: {
      tick,
      season,
      scoutKind: action.scoutKind,
      targetTile: targetTileId,
      targetResourceClass: targetClass,
      targetSource,
      candidateCount: dbg?.candidateCount ?? 1,
      selectedScore: dbg?.voiScore ?? 0,
      expectedInfoValue: dbg?.expectedInfoValue ?? 0,
      confidenceBefore: round2(presenceBefore),
      confidenceAfter: round2(afterScoutProfile.presenceConfidence),
      routeConfidenceChange: round2(afterScoutProfile.accessConfidence - accessBefore),
      repeatPenalty: dbg?.repeatPenalty ?? 0,
      outcome,
      contradictionKind,
      learning,
      deltaByConfidenceChannel: learning.deltaByConfidenceChannel,
      plantObservation,
      plantUseEligibility,
      plantUseTest: plantUseTestUpdate?.event,
      causeSpecificEvent: causeSpecificUpdate?.event,
      inferredBeliefTested: targetSource === "inferred",
      falseOrUnconfirmedInference: contradictionKind === "inferred_belief_unconfirmed",
      repeatedNoInfoScout: contradictionKind === "repeated_no_new_information",
      seasonalMismatch: contradictionKind === "expected_seasonal_found_out_of_season",
      partialConfirmation: contradictionKind === "partial_confirmation" || contradictionKind === "expected_animal_sign_only",
      partialConfirmContradict:
        contradictionKind !== "no_contradiction_confirmed" &&
        Object.values(learning.deltaByConfidenceChannel).some((delta) => delta > 0) &&
        Object.values(learning.deltaByConfidenceChannel).some((delta) => delta < 0),
      memoryUpdated,
      reasonVector: dbg?.reasonVector ?? {
        uncertaintyReductionValue: 0,
        needPressure: 0,
        resourceClassUrgency: 0,
        seasonMatch: round2(expectedSeasonalFit),
        routeConfidence: round2(accessBefore),
        distanceCost: 0,
        repeatPenalty: 0,
        staleWrongPenalty: 0,
        lowConfidencePenalty: 0,
      },
      // 2K.5: guidance derived for the executed target (selection-only; debug/audit).
      patchReturnGuidance: dbg?.patchReturnGuidance,
      learnedWorldModelStatus: "future; contradiction records now feed it",
    },
  };
}

function derivePlantObservationForResourceScout(
  action: Extract<Action, { type: "resource_scout" }>,
  targetTile: Tile,
  time: WorldTime,
): PlantScoutObservationHint | undefined {
  switch (action.scoutKind) {
    case "plant_patch":
    case "aquatic_patch":
    case "fallback_food":
    case "material_patch":
    case "medicinal_toxic":
      return derivePlantScoutObservationHint(targetTile, time, action.scoutKind);
    case "water_refuge":
    case "animal_sign":
      return undefined;
  }
}

function mapPlantObservationToScoutOutcome(
  observation: PlantScoutObservationHint,
): ResourceScoutDebug["outcome"] {
  switch (observation.observationOutcome) {
    case "confirmed_patch_present":
      return "confirmed_patch_present";
    case "confirmed_seasonal_absent":
      return "confirmed_seasonal_absent";
    case "found_low_abundance":
      return "found_low_abundance";
    case "suspected_processing_need":
      return "processing_need_suspected";
    case "suspected_safety_risk":
      return "safety_risk_detected";
    case "fallback_role_identified":
      return "fallback_role_identified";
    case "plant_patch_not_confirmed":
      return "plant_patch_not_confirmed";
    case "memory_refreshed_no_new_info":
      return "memory_refreshed_no_new_info";
  }
}

// 2K.12: bounded, selection-only seasonal-memory bias for the water-check candidate set.
// Reads ONLY the band's own learned water-reliability memory (water_reliability domain);
// returns undefined when nothing relevant is remembered (→ byte-identical water-check).
function buildSeasonalProbeBias(
  band: Band,
  candidateTileIds: readonly TileId[],
  season: Season,
): Readonly<Record<TileId, number>> | undefined {
  const bias: Record<TileId, number> = {};
  let hasRelevantBias = false;
  for (const tileId of candidateTileIds) {
    const hint = readSeasonalEcologyHint(band.seasonalEcologyMemory, tileId, season, "water_reliability");
    if (hint !== undefined && hint.bias !== 0) {
      bias[tileId] = hint.bias;
      hasRelevantBias = true;
    }
  }
  return hasRelevantBias ? bias : undefined;
}

function buildLogisticalProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
  beliefOpportunity: ResourceBeliefOpportunity,
): CandidateDecision | undefined {
  const dryContext = decisionCache.dryMarginContext;
  const prospect = dryContext?.riverProspect;
  const comparison = dryContext?.stayMoveScout;
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];
  const bestProspectTileId = prospect?.bestProspectTileId;

  if (
    dryContext === undefined ||
    prospect === undefined ||
    comparison === undefined ||
    currentTile === undefined ||
    currentRecord === undefined ||
    bestProspectTileId === undefined ||
    !dryContext.logisticalProbeAvailable
  ) {
    return undefined;
  }

  // Probe target diversity (2K.1G): if the water/route logic's best target is in a
  // detected no-information loop and a less-recently-probed alternative exists among
  // the SAME prospect candidate set, divert to it; otherwise keep the water choice.
  const currentTick = Number(world.time.tick);
  // 2K.12: a remembered reliable-water prospect (band-learned only, bounded, selection-only)
  // may win the water-check. Flag default OFF / no relevant memory → undefined → byte-identical.
  const seasonalProbeBias =
    world.auditOptions?.seasonalEcologyMemoryReadersEnabled === true
      ? buildSeasonalProbeBias(band, prospect.candidateTileIds, world.time.season)
      : undefined;
  const diverseTarget = chooseDiverseProbeTarget(
    prospect.candidateTileIds,
    bestProspectTileId,
    band.probeMemory,
    currentTick,
    seasonalProbeBias,
  );
  const targetTileId = diverseTarget.tileId;

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, targetTileId, "seek_better_water", decisionCache);
  const targetTile = getTile(world, targetTileId);

  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8 || targetTile === undefined) {
    return undefined;
  }

  const reportedTargetBias = getReportedKnowledgeTargetBias(band, targetTileId, decisionCache, {
    currentTick: world.time.tick,
    targetKnown: band.knowledge.observedTiles[targetTileId] !== undefined,
    routeEvidence:
      edgeMemo.riverAssessment.knownFordValue > 0.12 ||
      edgeMemo.riverAssessment.riverCorridorValue > 0.12 ||
      prospect.confidence > 0.34,
    localEvidence: prospect.travelCost <= 2,
  });
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    foodValue: clamp01((currentRecord.observedRichness ?? 0.35) * 0.24 + prospect.expectedFood * 0.34),
    waterValue: clamp01((currentRecord.observedWaterAccess ?? 0.35) * 0.18 + prospect.expectedWater * 0.46),
    waterRefugeSecurity: comparison.currentRefugeSecurity,
    dryRefugePull: dryContext.seasonalMode?.dryRefugePull ?? 0,
    aquaticValue: clamp01(currentRecord.observedAquaticPotential * 0.12),
    movementCost: clamp01(prospect.travelCost * 0.52),
    riskCost: clamp01(
      prospect.crossingRisk * 0.34 +
        prospect.socialAccessRisk * 0.16 +
        (band.pressureState?.riskPressure ?? 0) * 0.18 +
        reportedTargetBias.cautionPenalty * 0.28,
    ),
    memoryConfidence: prospect.confidence,
    routeValue: reportedTargetBias.opportunityBias,
    explorationValue: clamp01(comparison.scoutValue * 0.5 + prospect.prospectStrength * 0.26 + reportedTargetBias.opportunityBias * 0.12),
    socialCost: prospect.socialAccessRisk,
    expectedFutureValue: clamp01(prospect.prospectStrength * 0.62 + comparison.bestKnownAlternativeReturn * 0.2 + reportedTargetBias.opportunityBias * 0.1),
    frontierProbeValue: clamp01(prospect.prospectStrength + reportedTargetBias.opportunityBias * 0.16),
    localSurvivalValue: comparison.stayValue,
    rememberedReliability: dryContext.currentWaterRefuge?.reliability ?? 0,
    rememberedRisk: prospect.crossingRisk,
    foodStress: decisionCache.pressureSnapshot.bandPressureState.foodStress,
    waterStress: decisionCache.pressureSnapshot.bandPressureState.waterStress,
    localUsePressure: clamp01(currentUsePressure * 0.24),
    mobilityPressure: decisionCache.pressureSnapshot.bandPressureState.mobilityPressure,
    placeAttachmentPull: decisionCache.pressureSnapshot.bandPressureState.placeAttachmentPull,
    netMovePressure: decisionCache.pressureSnapshot.bandPressureState.netMovePressure,
    recoveryBenefit: clamp01(currentUsePressure * 0.18),
    depletionPenalty: clamp01(currentUsePressure * 0.12),
    riverCrossingCost: edgeMemo.riverAssessment.riverCrossingCost,
    riverCrossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    riverCorridorValue: edgeMemo.riverAssessment.riverCorridorValue,
    knownFordValue: edgeMemo.riverAssessment.knownFordValue,
    blockedCrossingPenalty: edgeMemo.riverAssessment.blockedCrossingPenalty,
    scoutValue: comparison.scoutValue,
    moveValue: comparison.moveValue,
    currentMarginalReturn: comparison.currentMarginalReturn,
    expectedNextReturn: comparison.expectedNextReturn,
    lossOfFallbackSecurity: comparison.lossOfFallbackSecurity,
    riverProspectStrength: prospect.prospectStrength,
    socialAccessRisk: prospect.socialAccessRisk,
    logisticalProbeValue: comparison.scoutValue,
  };
  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId,
    prospectTileIds: prospect.candidateTileIds,
  };
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(targetTileId), {
    type: "logistical_probe_selected",
    strength: comparison.scoutValue,
    confidence: prospect.confidence,
    relatedTileIds: [currentTile.id, targetTileId],
    bandId: band.id,
    currentTileId: currentTile.id,
    targetTileId,
    prospectTileIds: prospect.candidateTileIds,
    waterSourceKind: dryContext.currentWaterRefuge?.sourceKind,
    reliability: dryContext.currentWaterRefuge?.reliability,
    droughtRisk: dryContext.currentWaterRefuge?.droughtFailureRisk,
    seasonalMode: dryContext.seasonalMode?.mode,
    stayValue: comparison.stayValue,
    scoutValue: comparison.scoutValue,
    moveValue: comparison.moveValue,
    marginalReturn: comparison.currentMarginalReturn,
    departureThreshold: comparison.departureThreshold,
    uncertainty: prospect.uncertainty,
    socialRisk: prospect.socialAccessRisk,
    crossingRisk: prospect.crossingRisk,
    travelCost: prospect.travelCost,
    basis: prospect.basis,
  });

  const seasonalRoundProbePull = decisionCache.seasonalRoundContext === undefined
    ? 0
    : getSeasonalRoundProbePull(decisionCache.seasonalRoundContext);

  // Resource-belief probe pressure (2K.1F): a believed resource opportunity elsewhere
  // raises the urge to scout-before-relocation. This is a probe candidate only, so it
  // can tip "stay vs probe" or "blind-move vs scout-first" toward scouting — it never
  // feeds a relocation candidate, so beliefs cannot auto-migrate the band. Bounded by
  // the hard-capped probePressure (<= BELIEF_PROBE_PRESSURE_CAP).
  const beliefProbePull = beliefOpportunity.probePressure * BELIEF_PROBE_SCORE_WEIGHT;

  // Probe diminishing returns (2K.1G): re-scouting the same target with no information
  // gain becomes less attractive, letting the band do something else — UNLESS water
  // need (high water stress / no safer alternative / low route confidence) makes the
  // recheck rational, in which case the penalty is suppressed (and labelled in debug).
  const diminishingReturn = deriveProbeDiminishingReturn(band.probeMemory, targetTileId, currentTick, {
    waterStress: decisionCache.pressureSnapshot.bandPressureState.waterStress,
    routeConfidence: prospect.confidence,
    hasAlternativeTarget: prospect.candidateTileIds.length > 1,
    resourceBeliefRelevant: beliefOpportunity.hasBelievableOpportunity,
    exhaustedRangeStress: band.exhaustedRangeAudit?.stressLevel ?? 0,
  });
  const probeDiminishingReturnPull = diminishingReturn.probeDiminishingReturnPenalty * PROBE_DIMINISHING_RETURN_SCORE_WEIGHT;

  return {
    action,
    scoreBreakdown,
    score: round2(scoreDecision(scoreBreakdown) + comparison.scoutValue * 1.42 + getAnchorHoldBonus(decisionCache.anchorContext) + seasonalRoundProbePull + beliefProbePull - probeDiminishingReturnPull),
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 0, {
        type: "scout_before_relocation",
        strength: comparison.scoutValue,
        confidence: prospect.confidence,
        relatedTileIds: [currentTile.id, targetTileId],
        bandId: band.id,
        currentTileId: currentTile.id,
        targetTileId,
        prospectTileIds: prospect.candidateTileIds,
        stayValue: comparison.stayValue,
        scoutValue: comparison.scoutValue,
        moveValue: comparison.moveValue,
        departureThreshold: comparison.departureThreshold,
        uncertainty: prospect.uncertainty,
        socialRisk: prospect.socialAccessRisk,
        crossingRisk: prospect.crossingRisk,
        travelCost: prospect.travelCost,
        basis: prospect.basis,
      }),
    ],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

function buildVisibleLandscapeProbeCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision | undefined {
  const currentTile = getTile(world, band.position);
  const currentRecord = band.knowledge.observedTiles[band.position];

  if (currentTile === undefined || currentRecord === undefined) {
    return undefined;
  }

  const cue = (band.visibleLandscapeCues ?? [])
    .filter((entry) =>
      entry.status !== "stale" &&
      entry.confidence >= 0.38 &&
      band.knowledge.observedTiles[entry.approximateTileId] === undefined,
    )
    .sort((left, right) =>
      right.confidence - left.confidence ||
      left.distanceTiles - right.distanceTiles ||
      left.cueId.localeCompare(right.cueId),
    )[0];

  if (cue === undefined) {
    return undefined;
  }

  const targetTile = getTile(world, cue.approximateTileId);
  if (targetTile === undefined) {
    return undefined;
  }

  const distance = getGridDistance(currentTile, targetTile);
  if (distance <= 0 || distance > 10) {
    return undefined;
  }

  const edgeMemo = getCandidateEdgeMemo(world, band, currentTile.id, targetTile.id, "expand_known_world", decisionCache);
  if (!edgeMemo.toTilePassable || edgeMemo.riverAssessment.blockedCrossingPenalty > 0.8) {
    return undefined;
  }

  const currentUsePressure = getLocalUsePressureValue(band.usePressure[currentTile.id]);
  const targetKindPull = visibleCueProbeKindPull(cue.kind);
  // PERCEPTION-MOBILITY-1C — a chronically poor band that can clearly see nearby
  // WATER should not ignore it forever. This boosts the SCOUT/PROBE value (never a
  // relocation) so the band investigates the cue; observing the shore then feeds
  // the existing, fully-gated residential scorer. Anti-omniscient: the cue is an
  // uncertain visible hint, the probe legitimately observes it, and no hidden water
  // truth, exact target, or direct relocation is used.
  const isWaterCue =
    cue.kind === "visible_water" ||
    cue.kind === "visible_wetland" ||
    cue.kind === "lake_shore_visible" ||
    cue.kind === "delta_like_area" ||
    cue.kind === "river_or_tributary_corridor";
  const probeSupportDebug = band.perCapitaReturn?.supportDebug ?? band.carryingCapacity?.perCapitaReturn?.supportDebug;
  const bandPoorness = clamp01(
    Math.max(
      decisionCache.pressureSnapshot.bandPressureState.foodStress,
      probeSupportDebug?.deficitRatio ?? 0,
    ) + (band.returnTrend?.chronicDecline === true ? 0.2 : 0),
  );
  const nearbyWaterUrgency =
    isWaterCue && !cue.blockedByTerrain ? clamp01(bandPoorness * (distance <= 6 ? 1 : 0.5)) : 0;
  const routeConfidence = clamp01(
    cue.confidence * 0.42 +
      edgeMemo.riverAssessment.knownFordValue * 0.22 +
      edgeMemo.riverAssessment.riverCorridorValue * 0.18 +
      (distance <= 5 ? 0.12 : 0),
  );
  const scoreBreakdown: ScoreBreakdown = {
    ...emptyScoreBreakdown(),
    foodValue: clamp01((currentRecord.observedRichness ?? 0.35) * 0.16),
    waterValue: clamp01((currentRecord.observedWaterAccess ?? 0.35) * 0.16 + (cue.kind === "visible_water" ? cue.confidence * 0.16 : 0) + nearbyWaterUrgency * 0.22),
    memoryConfidence: cue.confidence,
    movementCost: clamp01(distance / 12),
    riskCost: clamp01(
      edgeMemo.riverAssessment.riverCrossingRisk * 0.34 +
        (band.pressureState?.riskPressure ?? 0) * 0.12 +
        (cue.blockedByTerrain ? 0.12 : 0),
    ),
    routeValue: routeConfidence,
    explorationValue: clamp01(cue.confidence * 0.5 + targetKindPull * 0.22 + nearbyWaterUrgency * 0.12),
    frontierProbeValue: clamp01(cue.confidence * 0.62 + targetKindPull * 0.22 + nearbyWaterUrgency * 0.18),
    localSurvivalValue: clamp01((currentRecord.observedRichness ?? 0.35) * 0.18 + (currentRecord.observedWaterAccess ?? 0.35) * 0.14 + nearbyWaterUrgency * 0.3),
    localUsePressure: clamp01(currentUsePressure * 0.14),
    foodStress: decisionCache.pressureSnapshot.bandPressureState.foodStress,
    waterStress: decisionCache.pressureSnapshot.bandPressureState.waterStress,
    mobilityPressure: decisionCache.pressureSnapshot.bandPressureState.mobilityPressure,
    riverCrossingCost: edgeMemo.riverAssessment.riverCrossingCost,
    riverCrossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    riverCorridorValue: edgeMemo.riverAssessment.riverCorridorValue,
    knownFordValue: edgeMemo.riverAssessment.knownFordValue,
    blockedCrossingPenalty: edgeMemo.riverAssessment.blockedCrossingPenalty,
    scoutValue: cue.confidence,
    logisticalProbeValue: cue.confidence,
  };
  const action: Action = {
    type: "logistical_probe",
    originTileId: currentTile.id,
    targetTileId: targetTile.id,
    prospectTileIds: [targetTile.id],
  };
  const basis = [`visible_landscape:${cue.kind}:${cue.direction}`];
  const primaryReason = makeReason(decisionId, "primary", numericTileIdPart(targetTile.id), {
    type: "logistical_probe_selected",
    strength: cue.confidence,
    confidence: routeConfidence,
    relatedTileIds: [currentTile.id, targetTile.id],
    bandId: band.id,
    currentTileId: currentTile.id,
    targetTileId: targetTile.id,
    prospectTileIds: [targetTile.id],
    scoutValue: cue.confidence,
    uncertainty: round2(1 - cue.confidence),
    crossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
    travelCost: distance,
    basis,
  });
  const diminishingReturn = deriveProbeDiminishingReturn(band.probeMemory, targetTile.id, Number(world.time.tick), {
    waterStress: decisionCache.pressureSnapshot.bandPressureState.waterStress,
    routeConfidence,
    hasAlternativeTarget: (band.visibleLandscapeCues ?? []).length > 1,
    resourceBeliefRelevant: false,
    exhaustedRangeStress: band.exhaustedRangeAudit?.stressLevel ?? 0,
  });
  const probeDiminishingReturnPull = diminishingReturn.probeDiminishingReturnPenalty * PROBE_DIMINISHING_RETURN_SCORE_WEIGHT;

  return {
    action,
    scoreBreakdown,
    score: round2(
      scoreDecision(scoreBreakdown) +
        cue.confidence * VISIBLE_LANDSCAPE_PROBE_SCORE_WEIGHT +
        getAnchorHoldBonus(decisionCache.anchorContext) -
        probeDiminishingReturnPull,
    ),
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 1, {
        type: "scout_before_relocation",
        strength: cue.confidence,
        confidence: routeConfidence,
        relatedTileIds: [currentTile.id, targetTile.id],
        bandId: band.id,
        currentTileId: currentTile.id,
        targetTileId: targetTile.id,
        prospectTileIds: [targetTile.id],
        scoutValue: cue.confidence,
        uncertainty: round2(1 - cue.confidence),
        crossingRisk: edgeMemo.riverAssessment.riverCrossingRisk,
        travelCost: distance,
        basis,
      }),
    ],
    riverAssessment: edgeMemo.riverAssessment,
  };
}

function visibleCueProbeKindPull(kind: NonNullable<Band["visibleLandscapeCues"]>[number]["kind"]): number {
  switch (kind) {
    case "visible_water":
    case "visible_wetland":
    case "lake_shore_visible":
    case "delta_like_area":
    case "river_or_tributary_corridor":
      return 0.22;
    case "greener_lowland":
    case "open_valley":
      return 0.16;
    case "pass_or_saddle":
    case "opposite_bank":
      return 0.12;
    case "higher_ground":
    case "dry_or_barren_country":
      return 0.06;
  }
}

function updateVisibleLandscapeCueProbeUse(
  band: Band,
  action: Action,
  scoutOrProbeTargetId: TileId | undefined,
): readonly NonNullable<Band["visibleLandscapeCues"]>[number][] | undefined {
  const cues = band.visibleLandscapeCues;
  if (cues === undefined || scoutOrProbeTargetId === undefined || action.type !== "logistical_probe") {
    return cues;
  }

  return cues.map((cue) =>
    cue.approximateTileId === scoutOrProbeTargetId
      ? {
          ...cue,
          status: "partly_checked",
          influencedScoutOrProbeCount: cue.influencedScoutOrProbeCount + 1,
        }
      : cue,
  );
}

function buildNoOpCandidate(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
): CandidateDecision {
  const scoreBreakdown = emptyScoreBreakdown();
  const primaryReason = makeReason(decisionId, "primary", 0, {
    type: "insufficient_known_tiles",
    strength: 1,
    confidence: 0.4,
    relatedTileIds: [band.position],
    knownTileCount: Object.keys(band.knowledge.observedTiles).length,
  });

  return {
    action: { type: "no_op" },
    scoreBreakdown,
    score: 0,
    primaryReason,
    secondaryReasons: [
      makeReason(decisionId, "secondary", 0, {
        type: "low_confidence_memory",
        strength: 1,
        confidence: 0.4,
        relatedTileIds: [band.position],
        memoryConfidence: getAverageKnownTileConfidence(band.knowledge),
      }),
    ],
  };
}

function getMovePrimaryReason(
  decisionId: DecisionId,
  tile: Tile,
  record: KnownTileRecord,
  scoreBreakdown: ScoreBreakdown,
  intentEvaluation: MobilityIntentEvaluation,
): Reason {
  const intent = intentEvaluation.activeIntent;

  if (intent?.kind === "return_to_known_good_area") {
    return makeReason(decisionId, "primary", numericTileIdPart(tile), {
      type: "return_to_known_good_area",
      strength: clamp01(scoreBreakdown.expectedFutureValue),
      confidence: record.confidence,
      relatedTileIds: [tile.id],
      currentTileId: intent.reason.relatedTileIds[0] ?? tile.id,
      targetTileId: tile.id,
      currentValue: scoreBreakdown.localSurvivalValue,
      targetValue: scoreBreakdown.expectedFutureValue,
    });
  }

  if (intent?.kind === "seek_better_water") {
    return makeReason(decisionId, "primary", numericTileIdPart(tile), {
      type: "seek_better_water",
      strength: clamp01(scoreBreakdown.waterValue),
      confidence: record.confidence,
      relatedTileIds: [tile.id],
      currentTileId: intent.reason.relatedTileIds[0] ?? tile.id,
      targetTileId: tile.id,
      currentValue: 0,
      targetValue: scoreBreakdown.waterValue,
      pressure: scoreBreakdown.populationPressure,
    });
  }

  if (intent?.kind === "avoid_risk") {
    return makeReason(decisionId, "primary", numericTileIdPart(tile), {
      type: "risk_avoidance",
      strength: clamp01(1 - scoreBreakdown.riskCost),
      confidence: record.confidence,
      relatedTileIds: [tile.id],
      currentTileId: intent.reason.relatedTileIds[0] ?? tile.id,
      targetTileId: tile.id,
      riskSeverity: scoreBreakdown.riskCost,
      pressure: scoreBreakdown.populationPressure,
    });
  }

  if (
    intent?.kind === "follow_river_corridor" ||
    intent?.kind === "cross_pass" ||
    intent?.kind === "probe_coast" ||
    intent?.kind === "probe_wetland_or_lake"
  ) {
    return makeReason(decisionId, "primary", numericTileIdPart(tile), {
      type: intent.kind === "follow_river_corridor" || intent.kind === "cross_pass"
        ? "corridor_following"
        : "frontier_probe",
      strength: clamp01(scoreBreakdown.intentAlignment + scoreBreakdown.expectedFutureValue * 0.42),
      confidence: record.confidence,
      relatedTileIds: [tile.id],
      intentKind: intent.kind,
      currentTileId: intent.reason.relatedTileIds[0] ?? tile.id,
      targetTileId: tile.id,
      frontierValue: scoreBreakdown.frontierProbeValue,
      directionVector: intent.directionVector,
    });
  }

  return makeReason(decisionId, "primary", numericTileIdPart(tile), {
    type: "known_route_has_better_expected_value",
    strength: clamp01(scoreBreakdown.expectedFutureValue),
    confidence: record.confidence,
    relatedTileIds: [tile.id],
    routeValue: scoreBreakdown.expectedFutureValue,
  });
}

function getKnownMoveCandidates(
  world: WorldState,
  band: Band,
  decisionCache: CandidateEvaluationCache,
): readonly KnownTileCandidate[] {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined) {
    return [];
  }

  return measureDecision(
    decisionCache.profiler,
    "knownMoveCandidateFiltering",
    () => {
      const candidates: KnownTileCandidate[] = [];
      const tileIds = measureDecision(
        decisionCache.profiler,
        "knownMoveCandidateRadiusLookup",
        () => getTileIdsWithinKnownMoveRadius(world, currentTile),
      );

      for (const tileId of tileIds) {
        const record = band.knowledge.observedTiles[tileId];
        const tile = getTile(world, tileId);

        if (record === undefined || tile === undefined) {
          continue;
        }

        const distance = getGridDistance(currentTile, tile);

        if (getCandidateEdgeMemo(world, band, band.position, tile.id, undefined, decisionCache).toTilePassable) {
          candidates.push({ tile, record, distance });
        }
      }

      decisionCache.profiler?.count?.("knownMoveCandidatesConsidered", tileIds.length);
      decisionCache.profiler?.count?.("knownMoveCandidatesAccepted", candidates.length);

      return candidates;
    },
  );
}

function getTileIdsWithinKnownMoveRadius(
  world: WorldState,
  currentTile: Tile,
): readonly TileId[] {
  let cache = knownMoveRadiusCacheByTiles.get(world.tiles);

  if (cache === undefined) {
    cache = new Map<TileId, readonly TileId[]>();
    knownMoveRadiusCacheByTiles.set(world.tiles, cache);
  }

  const cached = cache.get(currentTile.id);

  if (cached !== undefined) {
    return cached;
  }

  const tileIds = new Set<TileId>();

  for (const neighborId of getSortedNeighborIds(currentTile)) {
    tileIds.add(neighborId);
    const neighbor = getTile(world, neighborId);

    if (neighbor === undefined) {
      continue;
    }

    for (const secondRingId of getSortedNeighborIds(neighbor)) {
      if (secondRingId !== currentTile.id) {
        tileIds.add(secondRingId);
      }
    }
  }

  const result = [...tileIds]
    .map((tileId) => getTile(world, tileId))
    .filter((tile): tile is Tile => tile !== undefined && getGridDistance(currentTile, tile) <= 2)
    .sort(compareTiles)
    .map((tile) => tile.id);

  cache.set(currentTile.id, result);

  return result;
}

function applyAdaptiveDecisionShaping(
  band: Band,
  decisionId: DecisionId,
  candidate: CandidateDecision,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision {
  // INVENTION-3: once the canonical problem→idea→experiment state exists,
  // legacy adaptiveHuman cards are a frozen compatibility projection and no
  // longer form an independently behavior-driving history.
  if (band.practicalAdaptation !== undefined) {
    return candidate;
  }
  const influence = selectAdaptiveInfluenceForAction(candidate.action, decisionCache.adaptiveSupport);

  if (influence === undefined || influence.scoreDelta <= 0) {
    return candidate;
  }

  const relatedTileId = getActionRelatedTileId(candidate.action, band.position);

  return {
    ...candidate,
    score: round2(candidate.score + influence.scoreDelta),
    secondaryReasons: [
      ...candidate.secondaryReasons,
      makeReason(decisionId, "secondary", candidate.secondaryReasons.length + 80, {
        type: "adaptive_response_selected",
        strength: influence.scoreDelta,
        confidence: Math.min(0.82, 0.42 + influence.scoreDelta),
        relatedTileIds: relatedTileId === band.position ? [band.position] : [band.position, relatedTileId],
        bandId: band.id,
        ideaId: influence.ideaId,
        responseId: influence.responseId,
        family: influence.family,
        responseType: influence.responseType,
        expectedBenefit: influence.expectedBenefit,
        risk: influence.risk,
        behaviorEffectScope: influence.behaviorEffectScope,
        scoreDelta: influence.scoreDelta,
        basis: influence.basis,
      }),
    ],
  };
}

function applyCampMovementDecisionShaping(
  band: Band,
  decisionId: DecisionId,
  candidate: CandidateDecision,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision {
  const influence = selectCampMovementInfluenceForAction(candidate.action, decisionCache.campMovementSupport);

  if (influence === undefined || influence.scoreDelta <= 0) {
    return candidate;
  }

  const relatedTileId = influence.targetTileId ?? getActionRelatedTileId(candidate.action, band.position);

  return {
    ...candidate,
    score: round2(candidate.score + influence.scoreDelta),
    secondaryReasons: [
      ...candidate.secondaryReasons,
      makeReason(decisionId, "secondary", candidate.secondaryReasons.length + 100, {
        type: "camp_movement_response_selected",
        strength: influence.scoreDelta,
        confidence: Math.min(0.82, 0.42 + influence.scoreDelta),
        relatedTileIds: relatedTileId === band.position ? [band.position] : [band.position, relatedTileId],
        bandId: band.id,
        scale: influence.scale,
        status: influence.status,
        expectedBenefit: influence.expectedBenefit,
        risk: influence.risk,
        behaviorEffectScope: influence.behaviorEffectScope,
        scoreDelta: influence.scoreDelta,
        basis: influence.basis,
        targetTileId: influence.targetTileId,
      }),
    ],
  };
}

function applyIntentShaping(
  world: WorldState,
  band: Band,
  intentEvaluation: MobilityIntentEvaluation,
  candidate: CandidateDecision,
  decisionCache: CandidateEvaluationCache,
): CandidateDecision {
  const intent = intentEvaluation.activeIntent;
  const targetTileId = getActionRelatedTileId(candidate.action, band.position);
  const actionVector = getActionVector(band.position, targetTileId);
  const intentAlignment = getIntentAlignment(intent, candidate.action, band.position, targetTileId, actionVector);
  const previousVector = getPreviousMovementVector(world, band);
  const movementInertia =
    actionVector === undefined || previousVector === undefined
      ? 0
      : clamp01((dotVectors(actionVector, previousVector) + 1) / 2);
  const reversalPenalty =
    actionVector === undefined || previousVector === undefined
      ? 0
      : clamp01(-dotVectors(actionVector, previousVector));
  const currentRecord = band.knowledge.observedTiles[band.position];
  const successfulCurrentCamp =
    getCanonicalFoodStress(band) <= 0.3 &&
    (currentRecord?.observedWaterAccess ?? 0.35) >= 0.48 &&
    decisionCache.pressureSnapshot.bandPressureState.riskPressure < 0.8;
  const stayContradictsMobilityIntent =
    candidate.action.type === "stay" &&
    intent !== undefined &&
    intent.kind !== "local_foraging" &&
    !successfulCurrentCamp;
  const stayIntentPenalty = stayContradictsMobilityIntent
    ? clamp01(intent.persistence * (band.consecutiveSeasonsOnTile >= 1 ? 0.74 : 0.38))
    : 0;
  const localSurvivalValue =
    candidate.action.type === "stay"
      ? stayContradictsMobilityIntent
        ? candidate.scoreBreakdown.localSurvivalValue * 0.38
        : candidate.scoreBreakdown.localSurvivalValue
      : candidate.scoreBreakdown.localSurvivalValue * 0.24;
  const scoreBreakdown: ScoreBreakdown = {
    ...candidate.scoreBreakdown,
    intentAlignment,
    movementInertia,
    reversalPenalty: clamp01(reversalPenalty + stayIntentPenalty),
    frontierProbeValue: candidate.scoreBreakdown.frontierProbeValue,
    localSurvivalValue,
    placeAttachment: stayContradictsMobilityIntent
      ? candidate.scoreBreakdown.placeAttachment * 0.35
      : candidate.scoreBreakdown.placeAttachment,
    rememberedReliability: stayContradictsMobilityIntent
      ? candidate.scoreBreakdown.rememberedReliability * 0.55
      : candidate.scoreBreakdown.rememberedReliability,
    returnPlacePull: stayContradictsMobilityIntent
      ? candidate.scoreBreakdown.returnPlacePull * 0.35
      : candidate.scoreBreakdown.returnPlacePull,
  };
  const badSiteStuckResidencePenalty = measureDecision(
    decisionCache.profiler,
    "stuckSitePenalty",
    () => getBadSiteStuckResidencePenalty(candidate.action.type, band, scoreBreakdown),
  );
  const intentSecondaryReason =
    intent === undefined || intentAlignment < 0.38
      ? undefined
      : makeReason(
          makeDecisionId(world.time, band.id),
          "secondary",
          candidate.secondaryReasons.length,
          {
            type: "intent_continuation",
            strength: intentAlignment,
            confidence: intent.confidence,
            relatedTileIds: [band.position, targetTileId],
            intentKind: intent.kind,
            currentTileId: band.position,
            targetTileId,
            directionVector: intent.directionVector,
          },
        );

  // CAUSAL-REPAIR-1: the stay candidate carries an additive bias premium built ON
  // TOP of scoreDecision by buildStayCandidate — the flat stay bias, anchor hold,
  // and seasonal-round pull — and that premium is where the chronic-hardship
  // stay-bias EROSION lives (a failing band's stay bias is eroded, a comfortable
  // band's is not). Recomputing the score purely from scoreDecision here would
  // discard it, collapsing a chronically-failing and a comfortable band to an
  // identical stay score. Preserve the premium so hardship erosion survives intent
  // shaping. Only the stay action carries this premium, so moves/scouts/probes are
  // unaffected (their scoring is unchanged).
  const stayBiasPremium = candidate.action.type === "stay"
    ? candidate.score - round2(scoreDecision(candidate.scoreBreakdown))
    : 0;
  return {
    ...candidate,
    scoreBreakdown,
    score: round2(scoreDecision(scoreBreakdown) + stayBiasPremium - badSiteStuckResidencePenalty),
    secondaryReasons:
      intentSecondaryReason === undefined
        ? candidate.secondaryReasons
        : [...candidate.secondaryReasons, intentSecondaryReason],
  };
}

function getBadSiteStuckResidencePenalty(
  actionType: Action["type"],
  band: Band,
  scoreBreakdown: ScoreBreakdown,
): number {
  const penaltyScale =
    actionType === "stay"
      ? 1
      : actionType === "logistical_probe" || actionType === "resource_scout"
        ? BAD_SITE_STUCK_INFO_ACTION_PENALTY_SCALE
        : 0;

  if (penaltyScale === 0) {
    return 0;
  }

  if (band.consecutiveSeasonsOnTile <= BAD_SITE_STUCK_SOFT_SEASONS) {
    return 0;
  }

  const dwellPressure = clamp01(
    (band.consecutiveSeasonsOnTile - BAD_SITE_STUCK_SOFT_SEASONS) /
      Math.max(1, BAD_SITE_STUCK_HARD_SEASONS - BAD_SITE_STUCK_SOFT_SEASONS),
  );
  const badSitePressure = clamp01(
    (1 - scoreBreakdown.localSurvivalValue) * 0.34 +
      scoreBreakdown.foodStress * 0.24 +
      scoreBreakdown.waterStress * 0.22 +
      scoreBreakdown.mobilityPressure * 0.16 +
      scoreBreakdown.nearbyBandPressure * 0.16 +
      scoreBreakdown.rangeSaturation * 0.14 +
      scoreBreakdown.crowdingPenalty * 0.14 +
      scoreBreakdown.socialAccessRisk * 0.08 +
      scoreBreakdown.depletionPenalty * 0.18 +
      scoreBreakdown.biomeMismatchPenalty * 0.12 +
      scoreBreakdown.riskCost * 0.08 -
      scoreBreakdown.waterRefugeSecurity * 0.12 -
      scoreBreakdown.rememberedReliability * 0.08,
  );

  if (badSitePressure < BAD_SITE_STUCK_MIN_PRESSURE) {
    return 0;
  }

  return round2(BAD_SITE_STUCK_MAX_STAY_PENALTY * penaltyScale * dwellPressure * badSitePressure);
}

function chooseUnknownFrontierCandidate(
  band: Band,
  currentTile: Tile,
  passableUnknownNeighborIds: readonly TileId[],
  intentEvaluation: MobilityIntentEvaluation,
  previousVector: Coord | undefined,
  parentAwayVector: Coord | undefined,
  daughterDispersalPressure: number,
  crossingHints: Readonly<Record<TileId, RiverMovementAssessment>>,
): UnknownFrontierCandidate | undefined {
  const unknownNeighborIds = passableUnknownNeighborIds;

  if (unknownNeighborIds.length === 0) {
    return undefined;
  }

  const intent = intentEvaluation.activeIntent;
  const inferredRisk = getFrontierInferredRisk(band);
  const currentRecord = band.knowledge.observedTiles[currentTile.id];
  const currentFavorableContext = clamp01(
    (currentRecord?.observedRichness ?? 0.35) * 0.34 +
      (currentRecord?.observedWaterAccess ?? 0.35) * 0.26 +
      (currentRecord?.observedAquaticPotential ?? 0.2) * 0.18 +
      (currentTile.isRiver || currentTile.isCoastal || currentTile.terrainKind === "wetlands" ? 0.18 : 0),
  );
  return unknownNeighborIds
    .map((tileId) => {
      const targetCoord = parseTileCoord(tileId);
      const directionVector =
        targetCoord === undefined
          ? { x: 0, y: 0 }
          : getDirectionBetweenCoords(currentTile.coord, targetCoord);
      const intentAlignment =
        intent?.directionVector === undefined
          ? 0
          : clamp01((dotVectors(directionVector, intent.directionVector) + 1) / 2);
      const inertia =
        previousVector === undefined
          ? 0
          : clamp01((dotVectors(directionVector, previousVector) + 1) / 2);
      const parentAwayValue =
        parentAwayVector === undefined
          ? 0
          : clamp01((dotVectors(directionVector, parentAwayVector) + 1) / 2);
      const corridorContext = getKnownCorridorContextValue(currentTile, intent?.kind);
      const crossingHint = crossingHints[tileId];
      const frontierProbeValue = clamp01(
        0.34 +
          intentAlignment * 0.26 +
          inertia * 0.12 +
          parentAwayValue * daughterDispersalPressure * 0.24 +
          currentFavorableContext * 0.18 +
          corridorContext * 0.16 -
          inferredRisk * 0.12 -
          (crossingHint?.riverCrossingRisk ?? 0) * 0.18 -
          (crossingHint?.blockedCrossingPenalty ?? 0) * 0.52,
      );

      return {
        tileId,
        directionVector,
        score:
          frontierProbeValue +
          intentAlignment * 0.2 +
          inertia * 0.08 +
          parentAwayValue * daughterDispersalPressure * 0.22 +
          (crossingHint?.riverCorridorValue ?? 0) * 0.16 +
          (crossingHint?.knownFordValue ?? 0) * 0.14 -
          (crossingHint?.riverCrossingCost ?? 0) * 0.28 -
          (crossingHint?.blockedCrossingPenalty ?? 0) * 2,
        frontierProbeValue,
        parentAwayValue,
        inferredRisk,
        riverCrossingCost: crossingHint?.riverCrossingCost ?? 0,
        riverCrossingRisk: crossingHint?.riverCrossingRisk ?? 0,
        blockedCrossingPenalty: crossingHint?.blockedCrossingPenalty ?? 0,
      };
    })
    .sort(compareUnknownFrontierCandidates)[0];
}

function buildKnownTileScoreBreakdown(
  world: WorldState,
  band: Band,
  tile: Tile,
  record: KnownTileRecord,
  distance: number,
  riverAssessment: RiverMovementAssessment,
  decisionCache: CandidateEvaluationCache,
): ScoreBreakdown {
  const seasonalPattern = record.observedSeasonalPattern;
  const seasonWasObserved = record.seasonsObserved.includes(world.time.season);
  const isPeakSeason = seasonalPattern?.peakSeasons.includes(world.time.season) ?? false;
  const isLeanSeason = seasonalPattern?.leanSeasons.includes(world.time.season) ?? false;
  const seasonalFoodModifier = clamp01(
    (seasonalPattern?.reliability ?? 0.48) +
      (isPeakSeason ? 0.18 : 0) -
      (isLeanSeason ? 0.18 : 0) -
      (seasonWasObserved ? 0 : 0.06),
  );
  const movementCost = distance === 0
    ? 0
    : clamp01(
        ((record.observedMovementCost ?? 1.6) * Math.max(1, distance) - 1) / 3 +
          decisionCache.pressureSnapshot.bandPressureState.fatiguePressure * 0.28 +
          getRecentRelocationSettlementCost(world, band),
      );
  const baseRiskCost = clamp01(record.observedRisk ?? 0.35);
  const foodValue = clamp01(
    record.observedRichness * 0.62 +
      seasonalFoodModifier * 0.22 +
      record.observedAquaticPotential * 0.12,
  );
  const waterValue = clamp01(record.observedWaterAccess ?? 0.35);
  const aquaticValue = clamp01(record.observedAquaticPotential);
  const storageValue = clamp01((record.observedStorageSuitability ?? 0.24) * band.storageCapacity);
  const placeMemory = band.placeMemory[tile.id];
  const pressureState = decisionCache.pressureSnapshot.bandPressureState;
  const rangeSaturationState = band.rangeSaturation;
  const frontierDispersalState = band.frontierDispersal;
  const nearbyOpportunity = band.nearbyOpportunity;
  const tileMemo = getCandidateTileMemo(world, band, tile, decisionCache);
  const nearbyPressure = tileMemo.nearbyPressure;
  const daughterDispersal = tileMemo.daughterDispersal;
  const parentAwayValue = tileMemo.parentAwayValue;
  const biomeFit = tileMemo.biomeFit;
  const crowdingPenalty = tileMemo.crowdingPenalty;
  const targetUsePressure = tileMemo.localUsePressure;
  const currentUsePressure = getLocalUsePressureValue(band.usePressure[band.position]);
  const targetRecovery = tileMemo.pressureRecovery;
  const familiarCorridor = tileMemo.familiarCorridor;
  const returnPlacePull = tileMemo.returnPlacePull;
  const rememberedReliability = tileMemo.rememberedReliability;
  const rememberedRisk = tileMemo.rememberedRisk;
  const placeAttachment = tileMemo.placeAttachment;
  const attachmentValue = tileMemo.attachmentValue;
  const populationPressure = getPopulationPressure(band);
  const isStay = distance === 0;
  const ecologicalMovePressure = clamp01(
    (band.ecologicalStressCauses?.foodDeficit ?? 0) * 0.24 +
      (band.ecologicalStressCauses?.sharedCatchmentCrowding ?? 0) * 0.22 +
      (band.ecologicalStressCauses?.resourceDepletion ?? 0) * 0.22 +
      (band.ecologicalStressCauses?.poorReturnTrend ?? 0) * 0.08 +
      (band.nomadicScalePressure?.nomadicScalePressure ?? 0) * 0.24,
  );
  const stayAttachmentPressureRelief = isStay ? 1 - ecologicalMovePressure * 0.46 : 1;
  const rangeSaturation = isStay
    ? rangeSaturationState?.saturationPressure ?? 0
    : 0;
  const perCapitaReturn = isStay
    ? rangeSaturationState?.perCapitaReturnEstimate ?? 0
    : clamp01(expectedKnownFoodForRecord(record) - crowdingPenalty * 0.24);
  const frontierDispersalPressure = frontierDispersalState?.pressure ?? 0;
  // FrontierIntent v0 (M0.3): a bounded pull toward the band's own held, decaying
  // frontier-drift direction/target (band-known only). Lets a frontier group keep
  // drifting/probing outward along a known corridor for a while instead of looping
  // home. It is a small additive nudge (≤ strength, ≤0.85) inside the clamp01 sum —
  // it cannot override movement cost, water/refuge safety, or attachment, and is
  // never applied to a stay (so parents keep their refuge).
  const frontierIntentDriftPull = isStay ? 0 : frontierIntentPull(world, band, tile.id);
  // Stay-hold: only on the stay option, only once the band has reached its frontier
  // target — lets a colonised frontier stick instead of drifting back to origin.
  const frontierIntentStayHold = isStay ? frontierIntentHold(world, band) : 0;
  // FrontierResidence (M0.4 model, M0.5 principled refinement): retention EARNED by a
  // frontier daughter dwelling at a reached locus (band-known local value only). M0.5
  // replaces M0.4's force-magnitude additive inward-damp with two tie-breaker-scale
  // levers: (1) a small stay-hold to consolidate the reached range, and (2) an
  // `originPullRelief` MULTIPLIER (<=1) that DISCOUNTS her origin-ward memory pull
  // (place attachment / return-place / inherited familiarity / familiar corridor) for
  // an INWARD candidate once she has earned strong residence — so the remembered origin
  // COMPETES but no longer dominates. Relief only scales an existing pull DOWN (never
  // adds), so it can't push her anywhere unsafe; it is gated on `established` (good
  // band-known water+return) and decays, so she still retreats when the frontier
  // collapses; and it leaves her FRONTIER-locus attachment (the stay option) untouched.
  const frontierResidenceStay = isStay ? frontierResidenceStayHold(world, band) : 0;
  const originPullRelief = isStay ? 1 : frontierResidenceOriginPullRelief(world, band, tile.id);
  const frontierResidenceMoveDamp = isStay ? 0 : frontierResidenceInwardDamp(world, band, tile.id);
  const carryingOpportunity = band.carryingCapacity?.knownUnusedHabitat;
  const carryingOpportunityPull =
    !isStay && carryingOpportunity?.candidateTileId === tile.id
      ? clamp01(
          (carryingOpportunity.expectedPerCapitaReturn - (band.perCapitaReturn?.perCapitaReturn ?? 0.5) + 0.14) *
            1.6 *
            carryingOpportunity.confidence +
            (carryingOpportunity.consideredAsTarget ? 0.16 : 0) +
            ecologicalMovePressure * 0.12,
        )
      : 0;
  const knownOpportunityPull = !isStay
    ? Math.max(
        nearbyOpportunity?.bestKnownOpportunityTileId === tile.id
          ? nearbyOpportunity.opportunityStrength
          : 0,
        carryingOpportunityPull,
      )
    : 0;
  const sideCountryEvidence = getKnownSideCountryResourceEvidence(band, tile.id, decisionCache);
  const reportedTargetBias = getReportedKnowledgeTargetBias(band, tile.id, decisionCache, {
    currentTick: world.time.tick,
    targetKnown: true,
    routeEvidence:
      familiarCorridor > 0.18 ||
      riverAssessment.knownFordValue > 0.12 ||
      riverAssessment.riverCorridorValue > 0.12 ||
      tile.hasCreek === true ||
      sideCountryEvidence > 0.18,
    localEvidence: distance <= 2,
  });
  const creekCorridorBias =
    !isStay && tile.hasCreek === true && record.confidence > 0.34
      ? 0.05
      : 0;
  const knownFordOppositeBankBias =
    !isStay && riverAssessment.knownFordValue > 0.16 && riverAssessment.riverCrossingRisk < 0.55
      ? 0.05
      : 0;
  const sideCountryOpportunityBias = !isStay ? sideCountryEvidence * 0.08 : 0;
  const lightExplorationRouteBias = clamp01(
    creekCorridorBias +
      knownFordOppositeBankBias +
      sideCountryOpportunityBias +
      reportedTargetBias.opportunityBias,
  );
  const riskCost = clamp01(baseRiskCost + reportedTargetBias.cautionPenalty * 0.44);
  const dryContext = decisionCache.dryMarginContext;
  const dryComparison = dryContext?.stayMoveScout;
  const dryProspect = dryContext?.riverProspect;
  const dryAttachmentMultiplier = isStay ? getDryMarginAttachmentMultiplier(dryContext) : 1;
  const waterRefugeSecurity = isStay
    ? dryComparison?.currentRefugeSecurity ?? 0
    : dryContext?.bestWaterCandidates.find((candidate) => candidate.tileId === tile.id)?.reliability ?? 0;
  const dryRefugePull = isStay ? dryContext?.seasonalMode?.dryRefugePull ?? 0 : 0;
  const isRiverProspectTarget = !isStay && dryProspect?.bestProspectTileId === tile.id;
  const scoutValue = isStay ? 0 : 0;
  const moveValue = isRiverProspectTarget ? dryComparison?.moveValue ?? 0 : 0;
  const currentMarginalReturn = dryComparison?.currentMarginalReturn ?? 0;
  const expectedNextReturn = dryComparison?.expectedNextReturn ?? 0;
  // Loss of fallback security applies when leaving a refuge. For river-prospect
  // moves it carries the full comparison value. For other residential moves
  // away from a *strong* dry-margin refuge (currentRefugeSecurity > 0.5) it
  // scales with how much more secure the current refuge is than the destination,
  // so the band does not abandon reliable water for a worse tile on a thin
  // intent pull, while relocations toward equal-or-better water stay unpenalised.
  const dryRefugeSecurityNow = dryComparison?.currentRefugeSecurity ?? 0;
  const fallbackDeficit = clamp01(dryRefugeSecurityNow - waterRefugeSecurity);
  // Relocation hysteresis from a held residential anchor (2I.2): a whole-band
  // relocation must clear the cost of giving up the anchored catchment.
  const anchorHysteresis = getAnchorRelocationHysteresis(decisionCache.anchorContext);
  const baseLossOfFallback = isRiverProspectTarget
    ? dryComparison?.lossOfFallbackSecurity ?? 0
    : dryRefugeSecurityNow > 0.5
      ? clamp01(dryRefugeSecurityNow * (0.45 + 0.55 * fallbackDeficit))
      : 0;
  const lossOfFallbackSecurity = isStay
    ? 0
    : Math.max(baseLossOfFallback, anchorHysteresis);
  const riverProspectStrength = isRiverProspectTarget ? dryProspect?.prospectStrength ?? 0 : 0;
  const socialAccessRisk = isRiverProspectTarget
    ? dryProspect?.socialAccessRisk ?? 0
    : isStay ? dryContext?.currentWaterRefuge?.socialAccessRisk ?? 0 : 0;
  const encounterTension = decisionCache.pressureSnapshot.encounterTension;
  const encounterTolerance = decisionCache.pressureSnapshot.encounterTolerance;
  const splitRisk = getLatestEncounterSplitRisk(band);
  const localUsePressure = isStay ? targetUsePressure : targetUsePressure * 0.58;
  const recoveryBenefit = isStay
    ? 0
    : clamp01(
        currentUsePressure * 0.46 +
          pressureState.netMovePressure * 0.32 +
          targetRecovery * 0.1 +
          ecologicalMovePressure * 0.16,
      );
  const depletionPenalty = isStay
    ? clamp01(
        targetUsePressure * 0.78 +
          pressureState.foodStress * 0.18 +
          (band.ecologicalStressCauses?.resourceDepletion ?? 0) * 0.32 +
          ecologicalMovePressure * 0.2,
      )
    : clamp01(targetUsePressure * 0.52 + (placeMemory?.valences.includes("depleted") === true ? 0.18 : 0));
  const placeAttachmentPull = isStay
    ? pressureState.placeAttachmentPull
    : clamp01(placeAttachment * 0.22 + returnPlacePull * 0.14);
  // Pressure is a reason to seek relief, not a blanket bonus for any move.
  // Reward it only when this known destination offers a grounded improvement
  // (water, food opportunity, rested range, or explicit known opportunity).
  const currentRecord = band.knowledge.observedTiles[band.position];
  const currentWaterValue = clamp01(currentRecord?.observedWaterAccess ?? 0.35);
  const currentFoodValue = clamp01(
    (currentRecord?.observedRichness ?? 0.35) * 0.62 +
      (currentRecord?.observedAquaticPotential ?? 0) * 0.12,
  );
  const groundedRelief = clamp01(
    Math.max(0, waterValue - currentWaterValue) * 0.46 +
      Math.max(0, foodValue - currentFoodValue) * 0.38 +
      recoveryBenefit * 0.34 +
      knownOpportunityPull * 0.3,
  );
  const netMovePressure = isStay ? 0 : pressureState.netMovePressure * clamp01(0.08 + groundedRelief * 0.92);
  const expectedFutureValue = clamp01(
    foodValue * 0.34 +
      waterValue * 0.24 +
      waterRefugeSecurity * 0.12 +
      (isStay ? dryRefugePull * 0.08 : 0) +
      aquaticValue * 0.14 +
      storageValue * 0.14 +
      record.confidence * 0.14 -
      riskCost * 0.18 -
      movementCost * 0.14 +
      placeAttachment * 0.08 * originPullRelief +
      rememberedReliability * 0.08 +
      familiarCorridor * 0.06 * originPullRelief +
      returnPlacePull * 0.1 * originPullRelief -
      rememberedRisk * 0.08 -
      localUsePressure * 0.12 -
      depletionPenalty * 0.12 +
      recoveryBenefit * 0.12 +
      riverAssessment.riverCorridorValue * 0.12 +
      riverAssessment.knownFordValue * 0.1 -
      riverAssessment.riverCrossingCost * 0.12 -
      riverAssessment.riverCrossingRisk * 0.1 -
      riverAssessment.blockedCrossingPenalty * 0.5 -
      lightExplorationRouteBias * 0.08 -
      reportedTargetBias.cautionPenalty * 0.06 -
      crowdingPenalty * 0.14 -
      nearbyPressure.weightedCrowding * 0.08 -
      daughterDispersal.parentCoreOverlap * (isStay ? 0.22 : 0.04) +
      daughterDispersal.daughterDispersalPressure * (isStay ? -0.28 : 0.18) +
      (isStay ? 0 : daughterDispersal.safeFrontierPull * 0.12) +
      (isStay ? 0 : parentAwayValue * daughterDispersal.daughterDispersalPressure * 0.18) +
      daughterDispersal.inheritedFamiliarityPull * 0.05 * originPullRelief +
      (isStay ? -rangeSaturation * 0.18 : 0) +
      (isStay ? -ecologicalMovePressure * 0.22 : ecologicalMovePressure * 0.14) +
      perCapitaReturn * 0.08 +
      (isStay ? 0 : frontierDispersalPressure * 0.12) +
      frontierIntentDriftPull * 0.2 +
      frontierIntentStayHold * 0.18 +
      frontierResidenceStay * 0.3 +
      frontierResidenceMoveDamp * 0.8 +
      knownOpportunityPull * 0.2 * originPullRelief -
      lossOfFallbackSecurity * 0.16 +
      moveValue * 0.12 +
      riverProspectStrength * 0.1 -
      socialAccessRisk * 0.08 -
      encounterTension * (isStay ? 0.14 : 0.04) +
      encounterTolerance * (isStay ? 0.08 : 0.02) -
      splitRisk * 0.08 +
      biomeFit.competence * 0.08 -
      biomeFit.mismatchPenalty * 0.14,
  );

  return {
    foodValue,
    waterValue,
    waterRefugeSecurity: round2(waterRefugeSecurity),
    dryRefugePull: round2(dryRefugePull),
    aquaticValue,
    movementCost,
    riskCost,
    memoryConfidence: record.confidence,
    routeValue: round2(lightExplorationRouteBias),
    attachmentValue: round2(attachmentValue * dryAttachmentMultiplier * stayAttachmentPressureRelief),
    populationPressure,
    storageValue,
    explorationValue: 0,
    socialCost: clamp01((1 - band.cohesion) * 0.18 + movementCost * 0.08),
    expectedFutureValue,
    intentAlignment: 0,
    movementInertia: 0,
    reversalPenalty: 0,
    frontierProbeValue: 0,
    // For a held anchor, local survival reflects the whole seasonal catchment
    // (water security + reachable food across the foraging radius), not just the
    // single anchor tile — this is the core 2I.2 fix for refuge anchoring.
    localSurvivalValue: isStay && decisionCache.anchorContext !== undefined
      ? clamp01(
          (foodValue * 0.44 + waterValue * 0.34 - riskCost * 0.22) * 0.55 +
            decisionCache.anchorContext.anchor.holdValue * 0.55,
        )
      : clamp01(foodValue * 0.44 + waterValue * 0.34 - riskCost * 0.22),
    placeAttachment: round2(placeAttachment * dryAttachmentMultiplier * stayAttachmentPressureRelief),
    rememberedReliability,
    rememberedRisk,
    familiarCorridor,
    returnPlacePull: round2(returnPlacePull * dryAttachmentMultiplier),
    foodStress: pressureState.foodStress,
    waterStress: pressureState.waterStress,
    localUsePressure: round2(localUsePressure),
    mobilityPressure: pressureState.mobilityPressure,
    placeAttachmentPull: round2(placeAttachmentPull * stayAttachmentPressureRelief),
    netMovePressure,
    recoveryBenefit: round2(recoveryBenefit),
    depletionPenalty: round2(depletionPenalty),
    riverCrossingCost: riverAssessment.riverCrossingCost,
    riverCrossingRisk: riverAssessment.riverCrossingRisk,
    riverCorridorValue: riverAssessment.riverCorridorValue,
    knownFordValue: riverAssessment.knownFordValue,
    blockedCrossingPenalty: riverAssessment.blockedCrossingPenalty,
    nearbyBandPressure: nearbyPressure.weightedCrowding,
    parentCoreOverlap: daughterDispersal.parentCoreOverlap,
    daughterDispersalPressure: daughterDispersal.daughterDispersalPressure,
    inheritedFamiliarityPull: daughterDispersal.inheritedFamiliarityPull,
    safeFrontierPull: isStay ? 0 : daughterDispersal.safeFrontierPull,
    crowdingPenalty,
    biomeCompetence: biomeFit.competence,
    biomeMismatchPenalty: biomeFit.mismatchPenalty,
    rangeSaturation,
    perCapitaReturn,
    frontierDispersalPressure,
    knownOpportunityPull,
    explorationBaseline: 0,
    crowdingExploreBoost: 0,
    saturationExploreBoost: 0,
    daughterDispersalExploreBoost: 0,
    explorationRiskPenalty: 0,
    encounterTension,
    encounterTolerance,
    splitRisk,
    scoutValue,
    moveValue,
    currentMarginalReturn,
    expectedNextReturn,
    lossOfFallbackSecurity,
    riverProspectStrength,
    socialAccessRisk,
    logisticalProbeValue: 0,
  };
}

function getRecentRelocationSettlementCost(world: WorldState, band: Band): number {
  const latest = band.recentResidentialMoveEvents?.[0];
  if (latest === undefined) return 0;
  const seasonsSince = Math.max(0, Number(world.time.tick) - Number(latest.tick));
  if (seasonsSince > 2) return 0;
  const hardship = latest.hardshipLevel === "severe" ? 0.12
    : latest.hardshipLevel === "high" ? 0.09
      : latest.hardshipLevel === "moderate" ? 0.06
        : 0.03;
  // A whole-band relocation consumes camp re-establishment and dependent-care
  // capacity beyond the walking days themselves. The cost decays after one
  // settled season and never blocks a sufficiently better refuge.
  const dependentShare = band.demography.dependents / Math.max(1, band.demography.population);
  const establishmentCost = seasonsSince <= 1 ? 0.22 : 0.07;
  return clamp01(establishmentCost + hardship + dependentShare * 0.08);
}

function scoreDecision(scoreBreakdown: ScoreBreakdown): number {
  return round2(
    scoreBreakdown.foodValue * 1.45 +
      scoreBreakdown.waterValue * 1.2 +
      scoreBreakdown.waterRefugeSecurity * 0.52 +
      scoreBreakdown.dryRefugePull * 0.28 +
      scoreBreakdown.aquaticValue * 0.72 +
      scoreBreakdown.memoryConfidence * 0.48 +
      scoreBreakdown.routeValue * 0.42 +
      scoreBreakdown.attachmentValue * 0.62 +
      scoreBreakdown.populationPressure * 0.22 +
      scoreBreakdown.storageValue * 0.42 +
      scoreBreakdown.explorationValue * 1.25 +
      scoreBreakdown.expectedFutureValue * 1.1 +
      scoreBreakdown.intentAlignment * 1.08 +
      scoreBreakdown.movementInertia * 0.34 +
      scoreBreakdown.frontierProbeValue * 0.72 +
      scoreBreakdown.localSurvivalValue * 0.64 -
      scoreBreakdown.placeAttachment * 0.36 +
      scoreBreakdown.rememberedReliability * 0.3 +
      scoreBreakdown.familiarCorridor * 0.28 +
      scoreBreakdown.returnPlacePull * 0.42 -
      scoreBreakdown.localUsePressure * 0.44 +
      scoreBreakdown.placeAttachmentPull * 0.4 +
      scoreBreakdown.netMovePressure * 0.72 +
      scoreBreakdown.recoveryBenefit * 0.52 -
      scoreBreakdown.depletionPenalty * 0.88 -
      scoreBreakdown.riverCorridorValue * 0.72 +
      scoreBreakdown.knownFordValue * 0.82 -
      scoreBreakdown.nearbyBandPressure * 0.24 -
      scoreBreakdown.parentCoreOverlap * 0.16 +
      scoreBreakdown.inheritedFamiliarityPull * 0.18 +
      scoreBreakdown.safeFrontierPull * 0.62 -
      scoreBreakdown.rangeSaturation * 0.34 +
      scoreBreakdown.perCapitaReturn * 0.24 +
      scoreBreakdown.frontierDispersalPressure * 0.42 +
      scoreBreakdown.knownOpportunityPull * 1.04 +
      scoreBreakdown.scoutValue * 0.62 +
      scoreBreakdown.moveValue * 0.42 +
      scoreBreakdown.riverProspectStrength * 0.36 +
      scoreBreakdown.logisticalProbeValue * 0.92 -
      scoreBreakdown.lossOfFallbackSecurity * 0.42 -
      scoreBreakdown.socialAccessRisk * 0.36 +
      scoreBreakdown.explorationBaseline * 0.72 +
      scoreBreakdown.crowdingExploreBoost * 0.48 +
      scoreBreakdown.saturationExploreBoost * 0.58 +
      scoreBreakdown.daughterDispersalExploreBoost * 0.7 -
      scoreBreakdown.explorationRiskPenalty * 0.92 -
      scoreBreakdown.encounterTension * 0.46 +
      scoreBreakdown.encounterTolerance * 0.14 -
      scoreBreakdown.splitRisk * 0.36 -
      scoreBreakdown.crowdingPenalty * 0.72 -
      scoreBreakdown.biomeMismatchPenalty * 0.42 +
      scoreBreakdown.biomeCompetence * 0.16 -
      scoreBreakdown.riverCrossingCost * 1.25 -
      scoreBreakdown.riverCrossingRisk * 1.08 -
      scoreBreakdown.blockedCrossingPenalty * 8 -
      scoreBreakdown.foodStress * 0.1 -
      scoreBreakdown.waterStress * 0.1 -
      scoreBreakdown.mobilityPressure * 0.05 -
      scoreBreakdown.movementCost * 1.05 -
      scoreBreakdown.riskCost * 1.0 -
      scoreBreakdown.rememberedRisk * 0.34 -
      scoreBreakdown.reversalPenalty * 0.46 -
      scoreBreakdown.socialCost * 0.7,
  );
}

function buildCommonSecondaryReasons(
  decisionId: DecisionId,
  band: Band,
  tile: Tile,
  scoreBreakdown: ScoreBreakdown,
  action: Action,
  world: WorldState,
  season: WorldTime["season"],
  riverAssessment: RiverMovementAssessment,
  startIndex = 0,
  decisionCache: CandidateEvaluationCache,
): readonly Reason[] {
  const reasons: Reason[] = [];

  if (scoreBreakdown.foodValue < 0.34 || getCanonicalFoodStress(band) > 0.55) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "food_scarcity",
        strength: clamp01(1 - scoreBreakdown.foodValue + getCanonicalFoodStress(band) * 0.28),
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        deficit: clamp01(1 - scoreBreakdown.foodValue),
      }),
    );
  }

  if (scoreBreakdown.riskCost > 0.48) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "environmental_risk",
        strength: scoreBreakdown.riskCost,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        riskSeverity: scoreBreakdown.riskCost,
      }),
    );
  }

  if (scoreBreakdown.memoryConfidence < 0.5) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "low_confidence_memory",
        strength: clamp01(1 - scoreBreakdown.memoryConfidence),
        confidence: 0.68,
        relatedTileIds: [tile.id],
        memoryConfidence: scoreBreakdown.memoryConfidence,
      }),
    );
  }

  const dryContext = decisionCache.dryMarginContext;
  const dryComparison = dryContext?.stayMoveScout;
  const dryProspect = dryContext?.riverProspect;

  if (dryContext?.currentWaterRefuge !== undefined && scoreBreakdown.waterRefugeSecurity > 0.12) {
    const waterRefuge = dryContext.currentWaterRefuge;

    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: waterRefuge.sourceKind === "permanent_refuge_water" ? "permanent_refuge_water" : "water_refuge_profile_detected",
        strength: scoreBreakdown.waterRefugeSecurity,
        confidence: waterRefuge.lastKnownWaterConfidence,
        relatedTileIds: [waterRefuge.tileId],
        bandId: band.id,
        currentTileId: band.position,
        targetTileId: waterRefuge.tileId,
        waterSourceKind: waterRefuge.sourceKind,
        reliability: waterRefuge.reliability,
        droughtRisk: waterRefuge.droughtFailureRisk,
        socialRisk: waterRefuge.socialAccessRisk,
        travelCost: waterRefuge.travelCostFromCurrent,
      }),
    );
  }

  if (dryContext?.seasonalMode !== undefined) {
    const modeReasonType = getDryMarginModeReasonType(dryContext.seasonalMode.mode);

    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: modeReasonType,
        strength: Math.max(dryContext.seasonalMode.dryRefugePull, dryContext.seasonalMode.temporaryWaterOpportunity),
        confidence: dryContext.seasonalMode.confidence,
        relatedTileIds: [band.position],
        bandId: band.id,
        currentTileId: band.position,
        seasonalMode: dryContext.seasonalMode.mode,
        droughtRisk: dryContext.seasonalMode.droughtSeverity,
      }),
    );
  }

  if (dryProspect !== undefined && scoreBreakdown.riverProspectStrength > 0.16) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: dryProspect.corridorDirection === "downstream"
          ? "downstream_prospect_detected"
          : dryProspect.corridorDirection === "upstream"
            ? "upstream_prospect_detected"
            : dryProspect.corridorDirection === "wadi_chain"
              ? "wadi_chain_prospect_detected"
              : "river_corridor_prospect_detected",
        strength: dryProspect.prospectStrength,
        confidence: dryProspect.confidence,
        relatedTileIds: [band.position, ...(dryProspect.bestProspectTileId === undefined ? [] : [dryProspect.bestProspectTileId])],
        bandId: band.id,
        currentTileId: band.position,
        targetTileId: dryProspect.bestProspectTileId,
        prospectTileIds: dryProspect.candidateTileIds,
        reliability: dryProspect.expectedWater,
        uncertainty: dryProspect.uncertainty,
        socialRisk: dryProspect.socialAccessRisk,
        crossingRisk: dryProspect.crossingRisk,
        travelCost: dryProspect.travelCost,
        basis: dryProspect.basis,
      }),
    );
  }

  if (dryComparison !== undefined) {
    if (dryComparison.currentMarginalReturn < 0.42) {
      reasons.push(
        makeReason(decisionId, "secondary", reasons.length + startIndex, {
          type: "current_marginal_return_declined",
          strength: clamp01(1 - dryComparison.currentMarginalReturn),
          confidence: 0.72,
          relatedTileIds: [band.position],
          bandId: band.id,
          currentTileId: band.position,
          stayValue: dryComparison.stayValue,
          scoutValue: dryComparison.scoutValue,
          moveValue: dryComparison.moveValue,
          marginalReturn: dryComparison.currentMarginalReturn,
          departureThreshold: dryComparison.departureThreshold,
        }),
      );
    }

    if (action.type === "stay" && dryComparison.stayValue >= dryComparison.moveValue) {
      reasons.push(
        makeReason(decisionId, "secondary", reasons.length + startIndex, {
          type: dryContext?.currentPlaceAssessment === "declining_refuge" ? "known_place_declining" : "known_place_still_secure",
          strength: dryComparison.stayValue,
          confidence: scoreBreakdown.memoryConfidence,
          relatedTileIds: [band.position],
          bandId: band.id,
          currentTileId: band.position,
          stayValue: dryComparison.stayValue,
          scoutValue: dryComparison.scoutValue,
          moveValue: dryComparison.moveValue,
          marginalReturn: dryComparison.currentMarginalReturn,
          departureThreshold: dryComparison.departureThreshold,
        }),
      );
    }

    if (action.type !== "stay" && dryComparison.lossOfFallbackSecurity > 0.18) {
      reasons.push(
        makeReason(decisionId, "secondary", reasons.length + startIndex, {
          type: "loss_of_fallback_security",
          strength: dryComparison.lossOfFallbackSecurity,
          confidence: scoreBreakdown.memoryConfidence,
          relatedTileIds: [band.position, getActionRelatedTileId(action, band.position)],
          bandId: band.id,
          currentTileId: band.position,
          targetTileId: getActionRelatedTileId(action, band.position),
          lossOfFallbackSecurity: dryComparison.lossOfFallbackSecurity,
          stayValue: dryComparison.stayValue,
          moveValue: dryComparison.moveValue,
        }),
      );
    }
  }

  if (scoreBreakdown.biomeMismatchPenalty > 0.28) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "biome_mismatch",
        strength: scoreBreakdown.biomeMismatchPenalty,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        affinityGap: scoreBreakdown.biomeMismatchPenalty,
      }),
    );
  }

  const placeMemory = band.placeMemory[tile.id];

  if (placeMemory?.isReturnPlace === true) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "repeated_return",
        strength: clamp01(placeMemory.repeatedReturnCount / 4),
        confidence: placeMemory.confidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        returnCount: placeMemory.repeatedReturnCount,
        lastReturnAt: placeMemory.lastReturnAt,
      }),
    );
  }

  if (placeMemory !== undefined && placeMemory.attachment > 0.34) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "remembered_good_place",
        strength: placeMemory.attachment,
        confidence: placeMemory.confidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        visitCount: placeMemory.visitCount,
        attachment: placeMemory.attachment,
      }),
    );
  }

  if (placeMemory?.valences.includes("risky") === true || placeMemory?.valences.includes("avoid_place") === true) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "remembered_risky_place",
        strength: placeMemory.lastKnownRiskEstimate ?? scoreBreakdown.riskCost,
        confidence: placeMemory.confidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        riskEstimate: placeMemory.lastKnownRiskEstimate ?? scoreBreakdown.riskCost,
      }),
    );
  }

  const familiarCorridor = getFamiliarCorridor(decisionCache, band.position, tile.id);

  if (familiarCorridor !== undefined && familiarCorridor.useCount > 1) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "familiar_corridor",
        strength: familiarCorridor.confidence,
        confidence: familiarCorridor.confidence,
        relatedTileIds: [familiarCorridor.fromTileId, familiarCorridor.toTileId],
        fromTileId: familiarCorridor.fromTileId,
        toTileId: familiarCorridor.toTileId,
        useCount: familiarCorridor.useCount,
      }),
    );
  }

  if (scoreBreakdown.localUsePressure > 0.22) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "local_resource_pressure",
        strength: scoreBreakdown.localUsePressure,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        previousPressure: Math.max(0, scoreBreakdown.localUsePressure - 0.08),
        currentPressure: scoreBreakdown.localUsePressure,
        useCount: band.usePressure[tile.id]?.useTicks ?? 0,
        season,
      }),
    );
  }

  if (scoreBreakdown.nearbyBandPressure > 0.18) {
    const nearbyPressure = getCandidateTileMemo(world, band, tile, decisionCache).nearbyPressure;

    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "nearby_band_crowding",
        strength: scoreBreakdown.nearbyBandPressure,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        nearbyBandIds: nearbyPressure.pressureBandIds,
        tileId: tile.id,
        weightedCrowding: scoreBreakdown.nearbyBandPressure,
      }),
    );
  }

  if (scoreBreakdown.crowdingPenalty > 0.12) {
    const nearbyPressure = getCandidateTileMemo(world, band, tile, decisionCache).nearbyPressure;

    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "crowding_reduced_local_suitability",
        strength: scoreBreakdown.crowdingPenalty,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        nearbyBandIds: nearbyPressure.pressureBandIds,
        tileId: tile.id,
        weightedCrowding: scoreBreakdown.nearbyBandPressure,
        crowdingPenalty: scoreBreakdown.crowdingPenalty,
        localSuitability: clamp01(scoreBreakdown.foodValue + scoreBreakdown.waterValue * 0.35),
      }),
    );
  }

  if (band.parentBandId !== undefined && scoreBreakdown.parentCoreOverlap > 0.22) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "parent_core_overlap",
        strength: scoreBreakdown.parentCoreOverlap,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        parentBandId: band.parentBandId,
        tileId: tile.id,
        overlap: scoreBreakdown.parentCoreOverlap,
        pressure: scoreBreakdown.daughterDispersalPressure,
      }),
    );
  }

  if (scoreBreakdown.daughterDispersalPressure > 0.18) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "daughter_dispersal_pressure",
        strength: scoreBreakdown.daughterDispersalPressure,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        parentBandId: band.parentBandId,
        tileId: tile.id,
        pressure: scoreBreakdown.daughterDispersalPressure,
        parentCoreOverlap: scoreBreakdown.parentCoreOverlap,
        chosenTargetTileId: action.type === "stay" ? undefined : getActionRelatedTileId(action, band.position),
      }),
    );
  }

  if (band.parentBandId !== undefined && scoreBreakdown.inheritedFamiliarityPull > 0.18) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "inherited_familiarity_pull",
        strength: scoreBreakdown.inheritedFamiliarityPull,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        parentBandId: band.parentBandId,
        tileId: tile.id,
        pull: scoreBreakdown.inheritedFamiliarityPull,
      }),
    );
  }

  if (scoreBreakdown.safeFrontierPull > 0.22) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "safe_frontier_pull",
        strength: scoreBreakdown.safeFrontierPull,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        parentBandId: band.parentBandId,
        tileId: tile.id,
        pull: scoreBreakdown.safeFrontierPull,
        chosenTargetTileId: action.type === "stay" ? undefined : getActionRelatedTileId(action, band.position),
      }),
    );
  }

  if (
    band.parentBandId !== undefined &&
    action.type !== "stay" &&
    scoreBreakdown.daughterDispersalPressure > 0.16 &&
    scoreBreakdown.safeFrontierPull > 0.16
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "split_group_sought_new_range",
        strength: scoreBreakdown.daughterDispersalPressure,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [band.position, getActionRelatedTileId(action, band.position)],
        bandId: band.id,
        parentBandId: band.parentBandId,
        tileId: band.position,
        chosenTargetTileId: getActionRelatedTileId(action, band.position),
        pressure: scoreBreakdown.daughterDispersalPressure,
        safeFrontierPull: scoreBreakdown.safeFrontierPull,
      }),
    );
  }

  if (
    band.parentBandId !== undefined &&
    action.type === "stay" &&
    scoreBreakdown.parentCoreOverlap > 0.18 &&
    scoreBreakdown.crowdingPenalty < 0.16 &&
    scoreBreakdown.daughterDispersalPressure < 0.2
  ) {
    const dispersal = getCandidateTileMemo(world, band, tile, decisionCache).daughterDispersal;

    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "overlap_tolerated_low_pressure",
        strength: clamp01(1 - scoreBreakdown.daughterDispersalPressure),
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        bandId: band.id,
        parentBandId: band.parentBandId,
        tileId: tile.id,
        overlap: scoreBreakdown.parentCoreOverlap,
        pressure: scoreBreakdown.daughterDispersalPressure,
        kinTolerance: dispersal.kinTolerance,
      }),
    );
  }

  if (scoreBreakdown.foodStress > 0.42) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "food_stress",
        strength: scoreBreakdown.foodStress,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        stress: scoreBreakdown.foodStress,
        season,
      }),
    );
  }

  if (scoreBreakdown.waterStress > 0.42) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "water_stress",
        strength: scoreBreakdown.waterStress,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        stress: scoreBreakdown.waterStress,
        season,
      }),
    );
  }

  if (scoreBreakdown.mobilityPressure > 0.38) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "mobility_pressure",
        strength: scoreBreakdown.mobilityPressure,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        pressure: scoreBreakdown.mobilityPressure,
        foodStress: scoreBreakdown.foodStress,
        waterStress: scoreBreakdown.waterStress,
      }),
    );
  }

  if (scoreBreakdown.depletionPenalty > 0.24) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "repeated_use_depletion",
        strength: scoreBreakdown.depletionPenalty,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        pressure: scoreBreakdown.depletionPenalty,
        useCount: band.usePressure[tile.id]?.useTicks ?? 0,
      }),
    );
  }

  if (scoreBreakdown.recoveryBenefit > 0.32) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "recovery_opportunity",
        strength: scoreBreakdown.recoveryBenefit,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id, band.position],
        tileId: tile.id,
        bandId: band.id,
        recoveryBenefit: scoreBreakdown.recoveryBenefit,
        sourceMemoryTileId: band.position,
      }),
    );
  }

  if (
    action.type === "stay" &&
    scoreBreakdown.placeAttachmentPull > 0.28 &&
    scoreBreakdown.depletionPenalty < 0.42
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "attachment_resisted_movement",
        strength: scoreBreakdown.placeAttachmentPull,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        attachmentPull: scoreBreakdown.placeAttachmentPull,
        netMovePressure: scoreBreakdown.netMovePressure,
      }),
    );
  }

  if (
    action.type === "stay" &&
    scoreBreakdown.mobilityPressure < 0.28 &&
    scoreBreakdown.depletionPenalty < 0.24
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "low_pressure_stay",
        strength: clamp01(1 - scoreBreakdown.mobilityPressure),
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        bandId: band.id,
        netMovePressure: scoreBreakdown.netMovePressure,
        attachmentPull: scoreBreakdown.placeAttachmentPull,
      }),
    );
  }

  if (
    action.type !== "stay" &&
    scoreBreakdown.netMovePressure > 0.3 &&
    scoreBreakdown.placeAttachmentPull > 0.08
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "pressure_overcame_attachment",
        strength: scoreBreakdown.netMovePressure,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id, band.position],
        tileId: band.position,
        bandId: band.id,
        pressure: scoreBreakdown.netMovePressure,
        attachmentPull: scoreBreakdown.placeAttachmentPull,
      }),
    );
  }

  if (riverAssessment.blockedCrossingPenalty > 0.8 && riverAssessment.crossing !== undefined) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "river_crossing_blocked",
        strength: 1,
        confidence: riverAssessment.crossing.confidence,
        relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
        riverId: riverAssessment.crossing.riverId,
        fromTileId: riverAssessment.crossing.fromTileId,
        toTileId: riverAssessment.crossing.toTileId,
        crossingClass: riverAssessment.crossing.crossingClass,
        season,
        crossingCost: riverAssessment.riverCrossingCost,
        crossingRisk: riverAssessment.riverCrossingRisk,
        bandCapability: riverAssessment.capabilityLabel,
        intentKind: action.type === "stay" ? undefined : band.currentIntent?.kind,
      }),
    );
  } else if (riverAssessment.crossing !== undefined && riverAssessment.riverCrossingCost > 0.18) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "river_crossing_cost",
        strength: clamp01(riverAssessment.riverCrossingCost + riverAssessment.riverCrossingRisk * 0.42),
        confidence: riverAssessment.crossing.confidence,
        relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
        riverId: riverAssessment.crossing.riverId,
        fromTileId: riverAssessment.crossing.fromTileId,
        toTileId: riverAssessment.crossing.toTileId,
        crossingClass: riverAssessment.crossing.crossingClass,
        season,
        crossingCost: riverAssessment.riverCrossingCost,
        crossingRisk: riverAssessment.riverCrossingRisk,
        bandCapability: riverAssessment.capabilityLabel,
        intentKind: action.type === "stay" ? undefined : band.currentIntent?.kind,
      }),
    );
  }

  if (
    riverAssessment.crossing !== undefined &&
    riverAssessment.knownFordValue > 0.2 &&
    riverAssessment.memoryUseCount > 0
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "used_known_ford",
        strength: riverAssessment.knownFordValue,
        confidence: riverAssessment.crossing.confidence,
        relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
        riverId: riverAssessment.crossing.riverId,
        fromTileId: riverAssessment.crossing.fromTileId,
        toTileId: riverAssessment.crossing.toTileId,
        crossingClass: riverAssessment.crossing.crossingClass,
        useCount: riverAssessment.memoryUseCount,
        seasonalReliability: riverAssessment.knownFordValue,
      }),
    );
  }

  if (
    riverAssessment.crossing !== undefined &&
    riverAssessment.crossing.knownFord &&
    riverAssessment.memoryUseCount === 0 &&
    action.type !== "stay"
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "discovered_ford",
        strength: riverAssessment.crossing.confidence,
        confidence: riverAssessment.crossing.confidence,
        relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
        riverId: riverAssessment.crossing.riverId,
        fromTileId: riverAssessment.crossing.fromTileId,
        toTileId: riverAssessment.crossing.toTileId,
        crossingClass: riverAssessment.crossing.crossingClass,
        season,
      }),
    );
  }

  if (
    riverAssessment.crossing !== undefined &&
    riverAssessment.riverCrossingRisk > 0.62
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "avoided_deep_channel",
        strength: riverAssessment.riverCrossingRisk,
        confidence: riverAssessment.crossing.confidence,
        relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
        riverId: riverAssessment.crossing.riverId,
        fromTileId: riverAssessment.crossing.fromTileId,
        toTileId: riverAssessment.crossing.toTileId,
        crossingClass: riverAssessment.crossing.crossingClass,
        crossingRisk: riverAssessment.riverCrossingRisk,
        bandCapability: riverAssessment.capabilityLabel,
      }),
    );
  }

  if (
    riverAssessment.seasonalState?.isFloodSeason === true &&
    riverAssessment.riverCrossingRisk > 0.42 &&
    riverAssessment.crossing !== undefined
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "flood_season_crossing_risk",
        strength: riverAssessment.riverCrossingRisk,
        confidence: riverAssessment.crossing.confidence,
        relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
        riverId: riverAssessment.crossing.riverId,
        fromTileId: riverAssessment.crossing.fromTileId,
        toTileId: riverAssessment.crossing.toTileId,
        crossingClass: riverAssessment.crossing.crossingClass,
        season,
        crossingRisk: riverAssessment.riverCrossingRisk,
      }),
    );
  }

  if (riverAssessment.riverCorridorValue > 0.32) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: band.currentIntent?.kind === "follow_river_corridor"
          ? "followed_river_corridor"
          : "riverbank_continuity",
        strength: riverAssessment.riverCorridorValue,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [band.position, tile.id],
        riverId: tile.riverSegmentId,
        fromTileId: band.position,
        toTileId: tile.id,
        intentKind: band.currentIntent?.kind,
        continuity: riverAssessment.riverCorridorValue,
      }),
    );
  }

  if (tile.isEstuary && scoreBreakdown.aquaticValue > 0.45) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "estuary_resource_pull",
        strength: scoreBreakdown.aquaticValue,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        riverId: tile.riverSegmentId,
        tileId: tile.id,
        aquaticValue: scoreBreakdown.aquaticValue,
        movementPenalty: scoreBreakdown.movementCost,
      }),
    );
  }

  if (tile.isMarshChannel && riverAssessment.riverCrossingCost > 0.16) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "marsh_channel_slowdown",
        strength: clamp01(riverAssessment.riverCrossingCost + riverAssessment.riverCrossingRisk),
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [band.position, tile.id],
        riverId: tile.riverSegmentId,
        fromTileId: band.position,
        toTileId: tile.id,
        crossingCost: riverAssessment.riverCrossingCost,
        crossingRisk: riverAssessment.riverCrossingRisk,
      }),
    );
  }

  if (tile.isConfluence) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "confluence_attractor",
        strength: clamp01(scoreBreakdown.waterValue * 0.5 + scoreBreakdown.aquaticValue * 0.5),
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        tileId: tile.id,
        waterValue: scoreBreakdown.waterValue,
        aquaticValue: scoreBreakdown.aquaticValue,
      }),
    );
  }

  if (
    tile.riverSegmentId !== undefined &&
    scoreBreakdown.knownFordValue > 0.24 &&
    season === "summer"
  ) {
    reasons.push(
      makeReason(decisionId, "secondary", reasons.length + startIndex, {
        type: "seasonal_stream_opportunity",
        strength: scoreBreakdown.knownFordValue,
        confidence: scoreBreakdown.memoryConfidence,
        relatedTileIds: [tile.id],
        riverId: tile.riverSegmentId,
        tileId: tile.id,
        season,
        fordability: scoreBreakdown.knownFordValue,
      }),
    );
  }

  return reasons;
}

function getRejectionReason(
  world: WorldState,
  band: Band,
  decisionId: DecisionId,
  rejected: CandidateDecision,
  chosen: CandidateDecision,
): Reason {
  const relatedTileId = getActionRelatedTileId(rejected.action, band.position);
  const movementCost = rejected.scoreBreakdown.movementCost;
  const benefitDelta = Math.max(0, chosen.score - rejected.score);
  const riverAssessment = rejected.riverAssessment;

  if (
    riverAssessment?.crossing !== undefined &&
    riverAssessment.blockedCrossingPenalty > 0.8
  ) {
    return makeReason(decisionId, "rejection", numericTileIdPart(relatedTileId), {
      type: "river_crossing_blocked",
      strength: 1,
      confidence: riverAssessment.crossing.confidence,
      relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
      riverId: riverAssessment.crossing.riverId,
      fromTileId: riverAssessment.crossing.fromTileId,
      toTileId: riverAssessment.crossing.toTileId,
      crossingClass: riverAssessment.crossing.crossingClass,
      season: world.time.season,
      crossingCost: riverAssessment.riverCrossingCost,
      crossingRisk: riverAssessment.riverCrossingRisk,
      bandCapability: riverAssessment.capabilityLabel,
      intentKind: rejected.action.type === "stay" ? undefined : band.currentIntent?.kind,
    });
  }

  if (
    riverAssessment?.crossing !== undefined &&
    riverAssessment.riverCrossingRisk > 0.62
  ) {
    return makeReason(decisionId, "rejection", numericTileIdPart(relatedTileId), {
      type: "avoided_deep_channel",
      strength: riverAssessment.riverCrossingRisk,
      confidence: riverAssessment.crossing.confidence,
      relatedTileIds: [riverAssessment.crossing.fromTileId, riverAssessment.crossing.toTileId],
      riverId: riverAssessment.crossing.riverId,
      fromTileId: riverAssessment.crossing.fromTileId,
      toTileId: riverAssessment.crossing.toTileId,
      crossingClass: riverAssessment.crossing.crossingClass,
      crossingRisk: riverAssessment.riverCrossingRisk,
      bandCapability: riverAssessment.capabilityLabel,
    });
  }

  if (movementCost > rejected.scoreBreakdown.expectedFutureValue) {
    return makeReason(decisionId, "rejection", numericTileIdPart(relatedTileId), {
      type: "movement_cost_exceeds_benefit",
      strength: clamp01(movementCost - rejected.scoreBreakdown.expectedFutureValue),
      confidence: rejected.scoreBreakdown.memoryConfidence,
      relatedTileIds: [relatedTileId],
      movementCost,
      expectedBenefit: rejected.scoreBreakdown.expectedFutureValue,
    });
  }

  if (rejected.scoreBreakdown.riskCost > 0.52) {
    return makeReason(decisionId, "rejection", numericTileIdPart(relatedTileId), {
      type: "environmental_risk",
      strength: rejected.scoreBreakdown.riskCost,
      confidence: rejected.scoreBreakdown.memoryConfidence,
      relatedTileIds: [relatedTileId],
      riskSeverity: rejected.scoreBreakdown.riskCost,
    });
  }

  const rememberedRejected = band.placeMemory[relatedTileId];

  if (
    rememberedRejected?.valences.includes("risky") === true ||
    rememberedRejected?.valences.includes("avoid_place") === true
  ) {
    return makeReason(decisionId, "rejection", numericTileIdPart(relatedTileId), {
      type: "avoided_remembered_bad_place",
      strength: rememberedRejected.lastKnownRiskEstimate ?? rejected.scoreBreakdown.rememberedRisk,
      confidence: rememberedRejected.confidence,
      relatedTileIds: [relatedTileId],
      tileId: relatedTileId,
      riskEstimate: rememberedRejected.lastKnownRiskEstimate ?? rejected.scoreBreakdown.rememberedRisk,
    });
  }

  return makeReason(decisionId, "rejection", numericTileIdPart(relatedTileId), {
    type: "known_better_site",
    strength: clamp01(benefitDelta / 3),
    confidence: 0.72,
    relatedTileIds: [getActionRelatedTileId(chosen.action, band.position), relatedTileId],
    expectedValueDelta: benefitDelta,
  });
}

function observeTileAndNearby(
  world: WorldState,
  knowledge: KnowledgeState,
  targets: readonly ObservationTarget[],
): KnowledgeState {
  const observedTiles: Record<string, KnownTileRecord> = {
    ...knowledge.observedTiles,
  };
  const tileObservationHistory: TileObservation[] = [
    ...knowledge.tileObservationHistory.slice(-RECENT_TILE_OBSERVATION_HISTORY_LIMIT),
  ];

  for (const target of targets) {
    observeTile(world, observedTiles, tileObservationHistory, knowledge.selfBandId, target);
  }

  return {
    ...knowledge,
    observedTiles: observedTiles as Readonly<Record<TileId, KnownTileRecord>>,
    tileObservationHistory: tileObservationHistory.slice(-RECENT_TILE_OBSERVATION_HISTORY_LIMIT),
  };
}

function observeTile(
  world: WorldState,
  observedTiles: Record<string, KnownTileRecord>,
  tileObservationHistory: TileObservation[],
  observerBandId: BandId,
  target: ObservationTarget,
): void {
  const existingRecord = observedTiles[target.tile.id];
  const confidence = target.distance === 0 ? 1 : target.distance === 1 ? 0.68 : 0.34;
  const existingSeasons = existingRecord?.seasonsObserved ?? [];
  const seasonsObserved = existingSeasons.includes(world.time.season)
    ? existingSeasons
    : [...existingSeasons, world.time.season];
  const visits = (existingRecord?.visits ?? 0) + (target.distance === 0 ? 1 : 0);
  const observedRisk = getObservedRisk(target.tile);
  const record: KnownTileRecord = {
    tileId: target.tile.id,
    firstObservedAt: existingRecord?.firstObservedAt ?? world.time,
    lastObservedAt: world.time,
    seasonsObserved,
    visits,
    observedRichness: getDepletionAdjustedRichness(world, target.tile),
    observedWaterAccess: target.tile.resourceProfile.waterAccess,
    observedAquaticPotential: target.tile.resourceProfile.aquaticPotential,
    observedMovementCost: target.tile.movementCost,
    observedRisk,
    observedStorageSuitability: target.tile.resourceProfile.storageSuitability,
    observedSeasonalPattern: {
      peakSeasons: target.tile.seasonalProfile.peakSeasons,
      leanSeasons: target.tile.seasonalProfile.leanSeasons,
      reliability: target.tile.seasonalProfile.reliability,
      confidence: Math.max(existingRecord?.observedSeasonalPattern?.confidence ?? 0, confidence),
    },
    confidence: Math.max(existingRecord?.confidence ?? 0, confidence),
    knowledgeSource: "personally_observed",
  };

  tileObservationHistory.push({
    tileId: target.tile.id,
    observedAt: world.time,
    season: world.time.season,
    observedRichness: getDepletionAdjustedRichness(world, target.tile),
    observedAquaticPotential: target.tile.resourceProfile.aquaticPotential,
    observedRisk,
    observerBandId,
  });

  observedTiles[target.tile.id] = record;
}

// SPIKE (2026-06-15) — cause-gated migration walk helpers (see applyBandDecision).
const MIGRATION_SETTLE_RICHNESS_FLOOR = 0.5;
const MIGRATION_OBSERVATION_CAP = 64;

/** Build the band's OWN observed read-only world view the migration walk steps over. */
function buildMigrationWalkView(
  world: WorldState,
  band: Band,
  intentKind: MobilityIntentKind | undefined,
): MigrationWalkView {
  return {
    coordOf: (tileId) => getTile(world, tileId)?.coord,
    neighborIdsOf: (tileId) => {
      const tile = getTile(world, tileId);
      if (tile === undefined) {
        return [];
      }
      return getSortedNeighborIds(tile);
    },
    canStep: (fromTileId, toTileId) => {
      const toTile = getTile(world, toTileId);
      if (toTile === undefined || !isBandPassableDestination(toTile)) {
        return false;
      }
      // Reuse the canonical river-crossing gate so the walk can never hop an uncrossable river.
      return getRiverMovementAssessment(world, band, fromTileId, toTileId, intentKind).blockedCrossingPenalty <= 0.8;
    },
    stepView: (tileId) => {
      const tile = getTile(world, tileId);
      if (tile === undefined) {
        return undefined;
      }
      const record = band.knowledge.observedTiles[tileId];
      if (record === undefined) {
        // Unknown land: the walk values it only by direction + a small exploration base (never
        // truth). Cost fields are unread on the unknown branch but kept sane.
        return {
          observedRichness: 0,
          observedWaterAccess: 0,
          observedMovementCost: 0.2,
          observedRisk: 0.35,
          localUsePressure: 0,
          confidence: 0,
          known: false,
        };
      }
      // Normalize raw observed movement cost (~1..2.5) to the 0..1 per-step scale the walk
      // scorer expects — the SAME transform buildKnownTileScoreBreakdown applies at distance 1.
      return {
        observedRichness: clamp01(record.observedRichness),
        observedWaterAccess: clamp01(record.observedWaterAccess ?? 0.35),
        observedMovementCost: clamp01(((record.observedMovementCost ?? 1.6) - 1) / 3),
        observedRisk: clamp01(record.observedRisk ?? 0.35),
        localUsePressure: getLocalUsePressureValue(band.usePressure[tileId]),
        confidence: record.confidence,
        known: true,
      };
    },
  };
}

// INVENTION-1: a destination counts as a remembered watered place only from
// the band's OWN place memory (never truth) — recent-enough water reading.
function isKnownWateredDestination(band: Band, targetTileId: TileId): boolean {
  const record = band.placeMemory[targetTileId];
  return record !== undefined && (record.lastKnownWaterStress ?? 1) <= 0.4;
}

/**
 * Realize a committed migration decision as a contiguous breadcrumb path, or `undefined` to
 * keep the canonical single hop. Engages ONLY for a migration-class intent with enough
 * persistence to earn a multi-step budget — so stay/probe/scout and low-commitment moves are
 * byte-identical to pre-spike behaviour.
 */
function deriveAppliedMigrationWalk(
  world: WorldState,
  band: Band,
  decision: Decision,
  targetTileId: TileId,
): ReturnType<typeof deriveMigrationWalk> | undefined {
  if (!MIGRATION_WALK_ENABLED) {
    return undefined;
  }
  // CAUSAL-REPAIR-2: the walk engages on the seasonal-travel PLAN, not on raw
  // intent persistence (the SPIKE-MOBILITY-1 churn cause). Chronic hardship
  // escape can justify a journey even without a formal migration intent; a
  // migration-class intent needs a multi-season rest since the last move.
  const intent = decision.mobilityIntent;
  const plan = deriveSeasonalTravelPlanForBand(
    band,
    intent?.kind,
    clamp01(intent?.persistence ?? 0),
    Number(world.time.tick),
    // INVENTION-1: the dry-route water relief applies only when the scored
    // destination is one of the band's OWN remembered watered places.
    { destinationKnownWatered: isKnownWateredDestination(band, targetTileId) },
  );
  if (!plan.engaged) {
    return undefined; // single hop; the plan's limiters explain why in Technical
  }
  // Heading is the band's OWN already-chosen direction (intent vector / realized heading /
  // the canonical move's bearing) — never a hidden target or truth gradient.
  const heading =
    intent?.directionVector ??
    band.corridorHeading?.headingVector ??
    getRealizedMoveDelta(world, band.position, targetTileId);
  if (heading === undefined || (heading.x === 0 && heading.y === 0)) {
    return undefined;
  }
  // Exploratory dispersal AND hardship escape may take one bounded step into
  // unknown land (a journey out of a failing range accepts visible route risk);
  // corridor migration stays on known ground.
  const exploratory =
    plan.motive === "chronic_hardship_escape" ||
    intent?.kind === "frontier_dispersal" ||
    intent?.kind === "seek_new_range" ||
    intent?.kind === "expand_known_world" ||
    intent?.kind === "daughter_range_expansion";
  const result = deriveMigrationWalk(buildMigrationWalkView(world, band, intent?.kind), {
    startTileId: band.position,
    headingVector: heading,
    maxSteps: plan.budget,
    runSeed: world.runSeed,
    bandId: band.id,
    tick: world.time.tick,
    allowUnknownSteps: exploratory ? 1 : 0,
    settleRichnessFloor: MIGRATION_SETTLE_RICHNESS_FLOOR,
  });
  return result.steps >= 1 ? result : undefined;
}

/**
 * Observe every tile on the migration path (and its neighbours), bounded — knowledge gained en
 * route is the real spread lever. With an empty path this is byte-identical to a single-hop
 * `collectObservationTargets` at the endpoint.
 */
function collectMigrationObservationTargets(
  world: WorldState,
  pathTileIds: readonly TileId[],
  endpointTile: Tile,
): readonly ObservationTarget[] {
  if (pathTileIds.length === 0) {
    return collectObservationTargets(world, endpointTile);
  }
  const byTileId = new Map<TileId, ObservationTarget>();
  for (const centerId of pathTileIds) {
    const centerTile = getTile(world, centerId);
    if (centerTile === undefined) {
      continue;
    }
    for (const target of collectObservationTargets(world, centerTile)) {
      const existing = byTileId.get(target.tile.id);
      if (existing === undefined || target.distance < existing.distance) {
        byTileId.set(target.tile.id, target);
      }
    }
  }
  return Array.from(byTileId.values())
    .sort((left, right) =>
      left.distance === right.distance
        ? compareTiles(left.tile, right.tile)
        : left.distance - right.distance,
    )
    .slice(0, MIGRATION_OBSERVATION_CAP);
}

function collectObservationTargets(
  world: WorldState,
  currentTile: Tile,
): readonly ObservationTarget[] {
  const byTileId = new Map<TileId, ObservationTarget>();

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
      ? compareTiles(left.tile, right.tile)
      : left.distance - right.distance,
  );
}

function collectProbeObservationTargets(
  world: WorldState,
  originTileId: TileId,
  targetTile: Tile,
): readonly ObservationTarget[] {
  const byTileId = new Map<TileId, ObservationTarget>();

  byTileId.set(targetTile.id, { tile: targetTile, distance: 1 });

  for (const neighbor of getNeighborTiles(world, targetTile.id)) {
    if (neighbor.id !== originTileId && !byTileId.has(neighbor.id)) {
      byTileId.set(neighbor.id, { tile: neighbor, distance: 2 });
    }
  }

  return Array.from(byTileId.values()).sort((left, right) =>
    left.distance === right.distance
      ? compareTiles(left.tile, right.tile)
      : left.distance - right.distance,
  );
}

function getUnknownFrontierCrossingHints(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  intentKind: MobilityIntentKind | undefined,
  decisionCache: CandidateEvaluationCache,
): Readonly<Record<TileId, RiverMovementAssessment>> {
  const hints: Record<string, RiverMovementAssessment> = {};

  for (const neighborId of currentTile.neighbors) {
    if (band.knowledge.observedTiles[neighborId] !== undefined) {
      continue;
    }

    hints[neighborId] = getCandidateEdgeMemo(
      world,
      band,
      currentTile.id,
      neighborId,
      intentKind,
      decisionCache,
    ).riverAssessment;
  }

  return hints as Readonly<Record<TileId, RiverMovementAssessment>>;
}

function getPassableUnknownNeighborIds(
  world: WorldState,
  band: Band,
  currentTile: Tile,
  decisionCache: CandidateEvaluationCache,
): readonly TileId[] {
  return measureDecision(
    decisionCache.profiler,
    "candidatePassabilityChecks",
    () => currentTile.neighbors.filter((neighborId) => {
      const neighbor = getTile(world, neighborId);

      return (
        neighbor !== undefined &&
        band.knowledge.observedTiles[neighborId] === undefined &&
        getCandidateEdgeMemo(world, band, currentTile.id, neighborId, undefined, decisionCache).toTilePassable
      );
    }),
  );
}

function getRiverMovementAssessment(
  world: WorldState,
  band: Band,
  fromTileId: TileId,
  toTileId: TileId,
  intentKind: MobilityIntentKind | undefined,
): RiverMovementAssessment {
  const capability = getBandRiverCrossingCapability(band);
  const crossing = getRiverCrossingForMovement(world, fromTileId, toTileId);
  const fromTile = world.tiles[fromTileId];
  const toTile = world.tiles[toTileId];
  const memory = crossing === undefined
    ? undefined
    : band.crossingMemories[makeRiverCrossingKey(crossing.fromTileId, crossing.toTileId)];
  const seasonalState =
    crossing === undefined
      ? undefined
      : getSeasonalRiverCrossingState(world, crossing, capability);
  const memoryUseCount = memory?.useCount ?? 0;
  const knownFordValue = crossing === undefined
    ? 0
    : clamp01(
        (crossing.knownFord ? 0.3 : 0) +
          (memory?.successConfidence ?? 0) * 0.34 +
          (memory?.seasonalReliability ?? 0) * 0.24 -
          (memory?.riskMemory ?? crossing.risk) * 0.18,
      );
  const riverCorridorValue = getRiverCorridorValue(fromTile, toTile, intentKind);
  const rawCost = seasonalState?.effectiveCrossingCost ?? 0;
  const rawRisk = seasonalState?.effectiveRisk ?? 0;
  // CAUSAL-REPAIR-1 — one real local learning loop (crossingPractice.ts):
  // repeated successful use of THIS crossing earns a bounded, perishable
  // relief on the crossing risk the decision pays here. The band's stable
  // crossing-caution tendency shifts the risk it perceives ±12% before relief.
  const crossingPracticeRelief = deriveCrossingPracticeRelief(memory, Number(world.time.tick)).relief;
  const crossingCautionScale = 1 + deriveBandTendencies(band).crossingCaution * 0.12;

  return {
    crossing,
    seasonalState,
    capability,
    capabilityLabel: formatRiverCapability(capability),
    riverCrossingCost: round2(clamp01(rawCost / 2.8)),
    riverCrossingRisk: round2(clamp01(rawRisk * crossingCautionScale * (1 - crossingPracticeRelief))),
    riverCorridorValue,
    knownFordValue: round2(knownFordValue),
    blockedCrossingPenalty: seasonalState?.isBlockedWithoutCapability === true ? 1 : 0,
    memoryUseCount,
    crossingPracticeRelief,
  };
}

function getBandRiverCrossingCapability(band: Band): RiverCrossingCapability {
  const crossingPractice = Object.values(band.crossingMemories).some((memory) =>
    memory.useCount >= 2 && memory.successConfidence >= 0.5);
  const aquaticPractice = (band.recentIntraSeasonTrips ?? []).filter((trip) =>
    trip.taskGroupType === "fishing_group" || trip.taskGroupType === "water_group").length >= 3;
  const engineeringResponse = (band.practicalAdaptation?.responses ?? []).some((response) =>
    response.family === "engineering_structure" &&
    (response.status === "forming" || response.status === "active"));
  const fragments = band.practicalAdaptation?.fragments ?? [];
  const componentSubjects = new Set(fragments
    .filter((fragment) => fragment.knowledgeState !== "incorrect" && fragment.knowledgeState !== "dormant")
    .map((fragment) => fragment.subject));
  const componentBasis = componentSubjects.has("buoyancy_under_load") &&
    componentSubjects.has("binding_under_load") &&
    componentSubjects.has("staged_shuttle_crossing");

  return {
    canUseFords: true,
    canUseShallowCrossings: crossingPractice || aquaticPractice || engineeringResponse,
    canAttemptBasicRaftCrossing: engineeringResponse && componentBasis,
  };
}

function formatRiverCapability(capability: RiverCrossingCapability): string {
  return [
    capability.canUseFords ? "fords" : undefined,
    capability.canUseShallowCrossings ? "shallow" : undefined,
    capability.canAttemptBasicRaftCrossing ? "basic_raft" : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join("+") || "none";
}

function getRiverCorridorValue(
  fromTile: Tile | undefined,
  toTile: Tile | undefined,
  intentKind: MobilityIntentKind | undefined,
): number {
  if (fromTile === undefined || toTile === undefined) {
    return 0;
  }

  const sameRiverSegment =
    fromTile.riverSegmentId !== undefined &&
    fromTile.riverSegmentId === toTile.riverSegmentId;
  const bothRiverLandscape =
    (fromTile.isRiverbank || fromTile.isFloodplain || fromTile.isRiver || fromTile.isMarshChannel) &&
    (toTile.isRiverbank || toTile.isFloodplain || toTile.isRiver || toTile.isMarshChannel);
  const confluenceBonus = toTile.isConfluence ? 0.18 : 0;
  const estuaryBonus = toTile.isEstuary ? 0.14 : 0;
  const intentBonus = intentKind === "follow_river_corridor" ? 0.22 : 0;
  const continuity = clamp01(
    (sameRiverSegment ? 0.44 : 0) +
      (bothRiverLandscape ? 0.28 : 0) +
      confluenceBonus +
      estuaryBonus +
      intentBonus,
  );

  return round2(continuity);
}

function getDecisionContextSnapshot(
  world: WorldState,
  band: Band,
  knownTileCount: number,
): DecisionContextSnapshot {
  return {
    time: world.time,
    currentTileId: band.position,
    knownTileCount,
    knownSettlementCount: band.knowledge.knownSettlements.length,
    populationEstimate: band.demography.population,
    hungerPressure: getCanonicalFoodStress(band),
    territorialPressure: band.territorialPressure,
  };
}

function getBandStatusAfterDecision(action: Action): Band["status"] {
  if (action.type === "stay") {
    return "foraging";
  }

  if (action.type === "move_to_tile" || action.type === "explore_unknown_neighbor") {
    return "moving";
  }

  if (action.type === "logistical_probe") {
    return "foraging";
  }

  return "foraging";
}

function getDryMarginModeReasonType(
  mode: NonNullable<DryMarginMobilityContext["seasonalMode"]>["mode"],
): Reason["type"] {
  if (mode === "wet_season_dispersal") {
    return "wet_season_dispersal_mode";
  }

  if (mode === "green_season_harvest") {
    return "green_season_harvest_mode";
  }

  if (mode === "dry_season_consolidation") {
    return "dry_season_consolidation_mode";
  }

  if (mode === "late_dry_refuge") {
    return "late_dry_refuge_mode";
  }

  if (mode === "drought_emergency") {
    return "drought_emergency_mode";
  }

  return "dry_refuge_pull";
}

function getDecisionTargetTileId(action: Action, fallbackTileId: TileId): TileId {
  if (action.type === "stay") {
    return action.tileId;
  }

  if (
    action.type === "move_to_tile" ||
    action.type === "explore_unknown_neighbor" ||
    action.type === "logistical_probe" ||
    action.type === "resource_scout"
  ) {
    return action.targetTileId;
  }

  return fallbackTileId;
}

function getActionRelatedTileId(action: Action, fallbackTileId: TileId): TileId {
  if (action.type === "stay") {
    return action.tileId;
  }

  if (
    action.type === "move_to_tile" ||
    action.type === "explore_unknown_neighbor" ||
    action.type === "logistical_probe" ||
    action.type === "resource_scout"
  ) {
    return action.targetTileId;
  }

  return fallbackTileId;
}

function getNextIntentHistory(band: Band, decision: Decision): readonly NonNullable<Band["currentIntent"]>[] {
  const existingHistory = band.intentHistory ?? [];
  const activeIntent = decision.mobilityIntent;

  if (
    activeIntent === undefined ||
    decision.intentStatus === "continued_intent" ||
    hasSameIntent(existingHistory[existingHistory.length - 1], activeIntent)
  ) {
    return existingHistory;
  }

  return [...existingHistory, activeIntent].slice(-16);
}

function hasSameIntent(
  left: NonNullable<Band["currentIntent"]> | undefined,
  right: NonNullable<Band["currentIntent"]>,
): boolean {
  return left?.kind === right.kind && left.createdAt.tick === right.createdAt.tick;
}

function getAttachmentValue(band: Band, tileId: TileId): number {
  const attachment = band.knowledge.placeAttachments.find((place) => place.tileId === tileId);
  const rememberedAttachment = band.placeMemory[tileId]?.attachment ?? 0;

  return Math.max(attachment?.practicalWeight ?? 0, rememberedAttachment);
}

function getRememberedReliability(
  placeMemory: Band["placeMemory"][TileId] | undefined,
): number {
  if (placeMemory === undefined) {
    return 0;
  }

  return clamp01(
    (placeMemory.valences.includes("reliable") ? 0.48 : 0) +
      (placeMemory.valences.includes("seasonally_good") ? 0.26 : 0) +
      (placeMemory.isReturnPlace ? 0.18 : 0) +
      placeMemory.confidence * 0.08,
  );
}

function getFamiliarCorridorValue(
  decisionCache: CandidateEvaluationCache,
  fromTileId: TileId,
  toTileId: TileId,
): number {
  return getFamiliarCorridor(decisionCache, fromTileId, toTileId)?.confidence ?? 0;
}

function getFamiliarCorridor(
  decisionCache: CandidateEvaluationCache,
  fromTileId: TileId,
  toTileId: TileId,
): TravelCorridorMemory | undefined {
  return decisionCache.corridorByEdgeKey.get(makeTilePairKey(fromTileId, toTileId));
}

function makeTilePairKey(left: TileId, right: TileId): string {
  return String(left).localeCompare(String(right)) <= 0
    ? `${left}|${right}`
    : `${right}|${left}`;
}

function getPopulationPressure(band: Band): number {
  return clamp01(
    band.demography.population / 86 +
      band.socialPressure.demographicPressure * 0.24 +
      band.demography.householdCrowdingPressure * 0.34 +
      band.demography.splitPressure * 0.28 +
      band.demography.foodPerPersonStress * 0.26,
  );
}

function expectedKnownFoodForRecord(record: KnownTileRecord): number {
  return clamp01(
    record.observedRichness * 0.56 +
      record.observedAquaticPotential * 0.16 +
      (record.observedStorageSuitability ?? 0.2) * 0.08 +
      (record.observedSeasonalPattern?.reliability ?? 0.48) * 0.2,
  );
}

// Resource-belief opportunity for the band's current tile (2K.1F). Anti-omniscient:
// reasons only from the band's own bounded resource-knowledge memories, current
// water/return stress, and chronic-decline trend — never a map scan.
function deriveBandBeliefOpportunity(
  world: WorldState,
  band: Band,
  currentTileId: TileId,
  pressureSnapshot: BandPressureSnapshot,
): ResourceBeliefOpportunity {
  return deriveResourceBeliefOpportunity(band.resourceKnowledgeState, {
    currentTileId,
    currentTick: Number(world.time.tick),
    waterStress: pressureSnapshot.bandPressureState.waterStress,
    perCapitaReturn:
      band.carryingCapacity?.perCapitaReturn.perCapitaReturn ??
      band.perCapitaReturn?.perCapitaReturn ??
      0.5,
    chronicDecline: band.returnTrend?.chronicDecline === true,
  });
}

function getExplorationBaseline(
  band: Band,
  beliefProbePressure = 0,
  decisionCache?: CandidateEvaluationCache,
): number {
  const vulnerableShare =
    (band.demography.dependents + band.demography.elders) /
    Math.max(1, band.demography.population);
  const stressPenalty = clamp01(
    (band.pressureState?.riskPressure ?? 0) * 0.08 +
      (band.pressureState?.fatiguePressure ?? 0) * 0.08 +
      getLowPopulationExplorationPenalty(band) * 0.36 +
      Math.max(0, vulnerableShare - 0.44) * 0.18,
  );

  // Chronic return decline lightly raises the urge to probe alternatives — a
  // sustained downturn, not one bad season (2J.1). Small so it never dominates.
  const chronicDeclineProbe = band.returnTrend?.chronicDecline === true ? 0.05 : 0;
  // Resource-belief curiosity (2K.1F): hard-capped probe/scout nudge from the band's
  // own believed opportunities elsewhere (direct > inferred). Probe pressure only —
  // it raises the urge to scout/probe, NOT residential relocation, and is small
  // enough never to dominate water/attachment/route/anchor logic.
  const beliefProbe = clamp01(beliefProbePressure);
  // CAUSAL-REPAIR-1: repeated low-support evidence escalates the scouting urge
  // (capped by SCOUT_URGENCY_CAP), and the band's stable exploration tendency
  // shifts its personal baseline ±15%.
  const hardshipScoutUrgency = decisionCache?.hardship.scoutUrgency ?? 0;
  const explorationTendencyScale = 1 + (decisionCache?.tendencies.exploration ?? 0) * 0.15;

  return round2(
    clamp01(
      (0.1 +
        (band.parentBandId === undefined ? 0 : 0.04) +
        (band.frontierDispersal?.pressure ?? 0) * 0.08 +
        chronicDeclineProbe +
        beliefProbe +
        hardshipScoutUrgency -
        stressPenalty) * explorationTendencyScale,
    ),
  );
}

function getLatestEncounterTension(band: Band): number {
  return band.encounterRecords[band.encounterRecords.length - 1]?.tension ?? 0;
}

function getLatestEncounterTolerance(band: Band): number {
  return band.encounterRecords[band.encounterRecords.length - 1]?.tolerance ?? 0;
}

function getLatestEncounterSplitRisk(band: Band): number {
  return band.encounterResponses[band.encounterResponses.length - 1]?.splitRisk ?? 0;
}

function getAverageKnownTileConfidence(knowledge: KnowledgeState): number {
  const records = Object.values(knowledge.observedTiles);

  if (records.length === 0) {
    return 0;
  }

  return records.reduce((total, record) => total + record.confidence, 0) / records.length;
}

function getReportedKnowledgeTargetBias(
  band: Band,
  tileId: TileId,
  decisionCache: CandidateEvaluationCache,
  input: Parameters<typeof deriveReportedKnowledgeTargetBias>[2],
): ReturnType<typeof deriveReportedKnowledgeTargetBias> {
  const usableEvidence = input.targetKnown || input.routeEvidence || input.localEvidence === true;
  const key = [
    String(tileId),
    input.currentTick,
    usableEvidence ? "usable" : "unusable",
  ].join("|");
  const cached = decisionCache.reportedBiasByKey.get(key);

  if (cached !== undefined) {
    decisionCache.profiler?.count?.("reportBiasCacheHits");
    return cached;
  }

  const bias = measureDecision(
    decisionCache.profiler,
    "reportBiasIntegration",
    () => deriveReportedKnowledgeTargetBias(band, tileId, input),
  );
  decisionCache.reportedBiasByKey.set(key, bias);
  decisionCache.profiler?.count?.("reportBiasComputed");

  return bias;
}

function getKnownSideCountryResourceEvidence(
  band: Band,
  tileId: TileId,
  decisionCache?: CandidateEvaluationCache,
): number {
  if (decisionCache !== undefined) {
    const index = getSideCountryEvidenceIndex(band, decisionCache);
    return round2(clamp01(index.get(tileId) ?? 0));
  }

  let evidence = 0;

  for (const memory of band.resourceKnowledgeState?.patchMemories ?? []) {
    if (memory.approximateTile !== tileId && !memory.linkedTiles.includes(tileId)) {
      continue;
    }

    evidence = Math.max(evidence, sideCountryResourceEvidence(memory));
  }

  return round2(clamp01(evidence));
}

function getSideCountryEvidenceIndex(
  band: Band,
  decisionCache: CandidateEvaluationCache,
): ReadonlyMap<TileId, number> {
  if (decisionCache.sideCountryEvidenceIndex.value !== undefined) {
    decisionCache.profiler?.count?.("sideCountryEvidenceCacheHits");
    return decisionCache.sideCountryEvidenceIndex.value;
  }

  const index = measureDecision(
    decisionCache.profiler,
    "sideCountryEvidenceLookup",
    () => buildSideCountryEvidenceIndex(band),
  );
  decisionCache.sideCountryEvidenceIndex.value = index;
  decisionCache.profiler?.count?.("sideCountryEvidenceIndexBuilds");

  return index;
}

function buildSideCountryEvidenceIndex(band: Band): ReadonlyMap<TileId, number> {
  const index = new Map<TileId, number>();

  for (const memory of band.resourceKnowledgeState?.patchMemories ?? []) {
    const evidence = sideCountryResourceEvidence(memory);
    const tileIds = new Set<TileId>([memory.approximateTile, ...memory.linkedTiles]);

    for (const tileId of tileIds) {
      const previous = index.get(tileId) ?? 0;
      if (evidence > previous) {
        index.set(tileId, evidence);
      }
    }
  }

  return index;
}

function sideCountryResourceEvidence(memory: ResourcePatchMemory): number {
  const reasonEvidence = memory.reasonIds.some((reasonId) => String(reasonId).includes("side_country")) ? 0.34 : 0;
  const confidenceEvidence = clamp01(
    memory.confidence.presenceConfidence * 0.24 +
      memory.confidence.accessConfidence * 0.22 +
      memory.confidence.safetyConfidence * 0.16,
  );

  return clamp01(reasonEvidence + confidenceEvidence);
}

function getGridDistance(first: Tile, second: Tile): number {
  return Math.abs(first.coord.x - second.coord.x) + Math.abs(first.coord.y - second.coord.y);
}

function getMobilityPressure(band: Band, scoreBreakdown: ScoreBreakdown): number {
  return clamp01(
    getCanonicalFoodStress(band) * 0.34 +
      band.territorialPressure * 0.14 +
      band.demography.foodPerPersonStress * 0.18 +
      band.demography.splitPressure * 0.12 +
      (1 - scoreBreakdown.foodValue) * 0.2 +
      (1 - scoreBreakdown.waterValue) * 0.18 +
      scoreBreakdown.riskCost * 0.18,
  );
}

function getLowPopulationExplorationPenalty(band: Band): number {
  return clamp01(Math.max(0, 24 - band.demography.population) / 40);
}

function getDependentMovementRisk(band: Band): number {
  return clamp01(band.demography.dependents / Math.max(1, band.demography.population) - 0.32) * 0.18;
}

function getIntentAlignment(
  intent: MobilityIntentEvaluation["activeIntent"],
  action: Action,
  currentTileId: TileId,
  targetTileId: TileId,
  actionVector: Coord | undefined,
): number {
  if (intent === undefined) {
    return 0;
  }

  if (action.type === "stay") {
    return intent.kind === "local_foraging" || intent.targetTileId === currentTileId ? 0.74 : 0;
  }

  if (intent.targetTileId !== undefined && intent.targetTileId === targetTileId) {
    return 1;
  }

  if (intent.directionVector === undefined || actionVector === undefined) {
    return 0;
  }

  return clamp01((dotVectors(actionVector, intent.directionVector) + 1) / 2);
}

function getActionVector(currentTileId: TileId, targetTileId: TileId): Coord | undefined {
  const currentCoord = parseTileCoord(currentTileId);
  const targetCoord = parseTileCoord(targetTileId);

  return currentCoord === undefined || targetCoord === undefined
    ? undefined
    : getDirectionBetweenCoords(currentCoord, targetCoord);
}

function isBandPassableDestination(tile: Tile): boolean {
  // Rivers and wetlands shape movement through banks/crossing edges; bands do not occupy water tiles.
  return !tile.isAquatic;
}

function getPreviousMovementVector(world: WorldState, band: Band): Coord | undefined {
  const previousDecisionId = band.decisionHistory[band.decisionHistory.length - 1];
  const previousDecision =
    previousDecisionId === undefined ? undefined : world.decisions[previousDecisionId];
  const fromTileId = previousDecision?.contextSnapshot.currentTileId;

  if (
    previousDecision === undefined ||
    fromTileId === undefined ||
    (previousDecision.action.type !== "move_to_tile" &&
      previousDecision.action.type !== "explore_unknown_neighbor")
  ) {
    return undefined;
  }

  const toTileId = previousDecision.action.type === "move_to_tile"
    ? previousDecision.action.targetTileId
    : previousDecision.action.targetTileId;

  return getActionVector(fromTileId, toTileId);
}

function getParentAwayVector(world: WorldState, band: Band, currentTile: Tile): Coord | undefined {
  if (band.parentBandId === undefined) {
    return undefined;
  }

  const parentBand = world.bands[band.parentBandId];
  const parentTile = parentBand === undefined ? undefined : getTile(world, parentBand.position);
  const originTile = band.lineage?.originTileId === undefined
    ? undefined
    : getTile(world, band.lineage.originTileId);
  const sourceTile = parentTile ?? originTile;

  if (sourceTile === undefined) {
    return undefined;
  }

  return normalizeVector({
    x: currentTile.coord.x - sourceTile.coord.x,
    y: currentTile.coord.y - sourceTile.coord.y,
  });
}

function getParentAwayValue(world: WorldState, band: Band, targetTile: Tile): number {
  const currentTile = getTile(world, band.position);

  if (currentTile === undefined || currentTile.id === targetTile.id) {
    return 0;
  }

  const parentAwayVector = getParentAwayVector(world, band, currentTile);

  if (parentAwayVector === undefined) {
    return 0;
  }

  return clamp01(
    (dotVectors(getDirectionBetweenCoords(currentTile.coord, targetTile.coord), parentAwayVector) + 1) / 2,
  );
}

function getFrontierInferredRisk(band: Band): number {
  const records = Object.values(band.knowledge.observedTiles);

  if (records.length === 0) {
    return 0.35;
  }

  const totalRisk = records.reduce((total, record) => total + (record.observedRisk ?? 0.35), 0);

  return clamp01(totalRisk / records.length);
}

function getKnownCorridorContextValue(
  currentTile: Tile,
  intentKind: MobilityIntentKind | undefined,
): number {
  if (intentKind === "follow_river_corridor") {
    return currentTile.isRiver || currentTile.terrainKind === "river_valley" ? 1 : 0.25;
  }

  if (intentKind === "probe_coast") {
    return currentTile.isCoastal || currentTile.terrainKind === "coast" ? 1 : 0.2;
  }

  if (intentKind === "probe_wetland_or_lake") {
    return currentTile.terrainKind === "wetlands" || currentTile.terrainKind === "lake" ? 1 : 0.25;
  }

  if (intentKind === "cross_pass") {
    return currentTile.terrainKind === "hills" || currentTile.elevation > 0.48 ? 0.76 : 0.2;
  }

  return 0.35;
}

function compareUnknownFrontierCandidates(
  left: UnknownFrontierCandidate,
  right: UnknownFrontierCandidate,
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return compareTileIds(left.tileId, right.tileId);
}

function getObservedRisk(tile: Tile): number {
  return clamp01(
    tile.riskProfile.floodRisk * 0.34 +
      tile.riskProfile.droughtRisk * 0.34 +
      tile.riskProfile.diseaseRisk * 0.32,
  );
}

function emptyScoreBreakdown(): ScoreBreakdown {
  return {
    foodValue: 0,
    waterValue: 0,
    waterRefugeSecurity: 0,
    dryRefugePull: 0,
    aquaticValue: 0,
    movementCost: 0,
    riskCost: 0,
    memoryConfidence: 0,
    routeValue: 0,
    attachmentValue: 0,
    populationPressure: 0,
    storageValue: 0,
    explorationValue: 0,
    socialCost: 0,
    expectedFutureValue: 0,
    intentAlignment: 0,
    movementInertia: 0,
    reversalPenalty: 0,
    frontierProbeValue: 0,
    localSurvivalValue: 0,
    placeAttachment: 0,
    rememberedReliability: 0,
    rememberedRisk: 0,
    familiarCorridor: 0,
    returnPlacePull: 0,
    foodStress: 0,
    waterStress: 0,
    localUsePressure: 0,
    mobilityPressure: 0,
    placeAttachmentPull: 0,
    netMovePressure: 0,
    recoveryBenefit: 0,
    depletionPenalty: 0,
    riverCrossingCost: 0,
    riverCrossingRisk: 0,
    riverCorridorValue: 0,
    knownFordValue: 0,
    blockedCrossingPenalty: 0,
    nearbyBandPressure: 0,
    parentCoreOverlap: 0,
    daughterDispersalPressure: 0,
    inheritedFamiliarityPull: 0,
    safeFrontierPull: 0,
    crowdingPenalty: 0,
    biomeCompetence: 0,
    biomeMismatchPenalty: 0,
    rangeSaturation: 0,
    perCapitaReturn: 0,
    frontierDispersalPressure: 0,
    knownOpportunityPull: 0,
    explorationBaseline: 0,
    crowdingExploreBoost: 0,
    saturationExploreBoost: 0,
    daughterDispersalExploreBoost: 0,
    explorationRiskPenalty: 0,
    encounterTension: 0,
    encounterTolerance: 0,
    splitRisk: 0,
    scoutValue: 0,
    moveValue: 0,
    currentMarginalReturn: 0,
    expectedNextReturn: 0,
    lossOfFallbackSecurity: 0,
    riverProspectStrength: 0,
    socialAccessRisk: 0,
    logisticalProbeValue: 0,
  };
}

function makeDecisionId(time: WorldTime, bandId: BandId): DecisionId {
  return `decision:${bandId}:${time.tick}` as DecisionId;
}

function makeReasonId(
  decisionId: DecisionId,
  group: "primary" | "secondary" | "rejection",
  index: number,
): ReasonId {
  return `reason:${decisionId}:${group}:${index}` as ReasonId;
}

function makeReason<TReason extends Omit<Reason, "id" | "relatedEventIds"> & {
  readonly relatedEventIds?: readonly never[];
}>(
  decisionId: DecisionId,
  group: "primary" | "secondary" | "rejection",
  index: number,
  reason: TReason,
): Reason {
  return {
    ...reason,
    id: makeReasonId(decisionId, group, index),
    relatedEventIds: [],
  } as unknown as Reason;
}

function compareCandidates(left: CandidateDecision, right: CandidateDecision): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return getActionSortKey(left.action).localeCompare(getActionSortKey(right.action));
}

// VAR-1: sort movement candidates by score, but with a small deterministic
// seeded jitter so a band facing CLOSE alternatives picks differently per run
// seed (divergent migration). When world.runSeed is undefined (every legacy/
// test path), jitter is zero and this reduces EXACTLY to `sort(compareCandidates)`
// — byte-identical to pre-VAR-1. The jitter is bounded by MOVEMENT_TIEBREAK_
// EPSILON (< typical score gaps), so a clear winner is never displaced; only
// the order of genuinely-near candidates changes. Keyed on (runSeed, tick,
// bandId, action key), so it is stable for a given seed and reproducible.
function sortCandidatesWithSeededTieBreak(
  world: WorldState,
  band: Band,
  candidates: readonly CandidateDecision[],
): CandidateDecision[] {
  const runSeed = world.runSeed;

  if (runSeed === undefined) {
    return [...candidates].sort(compareCandidates);
  }

  const tick = Number(world.time.tick);
  const ranked = candidates.map((candidate) => {
    const actionKey = getActionSortKey(candidate.action);
    const jitter =
      seededTieBreakJitter(runSeed, [tick, String(band.id), actionKey]) * MOVEMENT_TIEBREAK_EPSILON;

    return { candidate, actionKey, effectiveScore: candidate.score + jitter };
  });

  ranked.sort((left, right) =>
    left.effectiveScore !== right.effectiveScore
      ? right.effectiveScore - left.effectiveScore
      : left.actionKey.localeCompare(right.actionKey),
  );

  return ranked.map((entry) => entry.candidate);
}

function getActionSortKey(action: Action): string {
  if (action.type === "stay") {
    return `0:${action.tileId}`;
  }

  if (action.type === "move_to_tile") {
    return `1:${action.targetTileId}`;
  }

  if (action.type === "explore_unknown_neighbor") {
    return `2:${action.targetTileId}`;
  }

  if (action.type === "logistical_probe") {
    return `3:${action.targetTileId}`;
  }

  return `9:${action.type}`;
}

function compareTileIds(left: TileId, right: TileId): number {
  return String(left).localeCompare(String(right));
}

function compareTiles(left: Tile, right: Tile): number {
  if (left.coord.y !== right.coord.y) {
    return left.coord.y - right.coord.y;
  }

  if (left.coord.x !== right.coord.x) {
    return left.coord.x - right.coord.x;
  }

  return compareTileIds(left.id, right.id);
}

function numericTileIdPart(tile: Tile | TileId): number {
  const tileId = typeof tile === "string" ? tile : tile.id;
  const parts = String(tileId).split(":");
  const x = Number(parts[1] ?? 0);
  const y = Number(parts[2] ?? 0);

  return Number.isFinite(x) && Number.isFinite(y) ? y * 1000 + x : 0;
}

function parseTileCoord(tileId: TileId): Coord | undefined {
  const [, rawX, rawY] = String(tileId).split(":");
  const x = Number(rawX);
  const y = Number(rawY);

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function getDirectionBetweenCoords(from: Coord, to: Coord): Coord {
  return normalizeVector({
    x: to.x - from.x,
    y: to.y - from.y,
  }) ?? { x: 0, y: 0 };
}

function normalizeVector(vector: Coord): Coord | undefined {
  const magnitude = Math.hypot(vector.x, vector.y);

  if (magnitude <= 0.0001) {
    return undefined;
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  };
}

function dotVectors(left: Coord, right: Coord): number {
  return left.x * right.x + left.y * right.y;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
