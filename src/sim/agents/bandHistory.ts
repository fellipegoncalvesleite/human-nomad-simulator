// ===========================================================================
// DEEP-TIME-HISTORY-TECH-1 — the durable per-band history substrate
// (Historical Memory Pyramid): founding snapshot → era records → durable
// episodes → (existing bounded recent windows) → evidence references.
//
// INVARIANTS (binding):
// - OBSERVE-ONLY: this module writes ONLY Band.deepHistory. No decision path
//   reads deepHistory; history must never steer behavior in this checkpoint.
// - EVIDENCE-BACKED, NO INVENTION: every record points at real sim state
//   (fission event ids, churn years, reason ids, place/route/crossing keys).
//   A fact the sim cannot prove stays undefined and is listed by name in
//   unknownAtFounding instead of being fabricated.
// - DETERMINISTIC: no unseeded random call, no clock; Record iteration sorts keys;
//   ids are minted from (bandId, type, subject/year) templates.
// - BOUNDED: eras cap at MAX_ERA_RECORDS (oldest adjacent pairs merge —
//   the deep past gets coarser, the recent past stays sharp); episodes cap
//   at MAX_EPISODES (lowest deterministic significance drops); inheritance
//   is a bounded selection, never the parent's logs; only the band's own
//   bounded state is read (placeMemory ≤72, corridors ≤96, churn ≤10,
//   fissionEvents ≤12) — never a map scan.
// ===========================================================================

import type { BandId, RouteId, TickNumber, TileId } from "../core/types";
import { getTile } from "../world/generate";
import type { WorldState } from "../world/types";
import type {
  AncestryEntry,
  Band,
  BandDeepHistoryCaps,
  BandDeepHistoryState,
  BandEpisodeType,
  BandEraCloseTrigger,
  BandEraHeadline,
  BandEraRecord,
  BandFissionEvent,
  BandFoundingSnapshot,
  BandHistoricalEpisode,
  BandHistoryTrackingState,
  BandLineageLink,
  BandTerminalRecord,
  HistoryEvidenceRef,
  InheritedEraSummary,
  OpenEraAccumulator,
  SeasonalHungerClassification,
} from "./types";

export const DEEP_HISTORY_CONSTANTS = {
  ERA_TARGET_YEARS: 20,
  ERA_MIN_YEARS_FOR_EVENT_CLOSE: 5,
  MAX_ERA_RECORDS: 12,
  MAX_EPISODES: 28,
  MAX_INHERITED_EPISODES: 4,
  MAX_INHERITED_ERA_SUMMARIES: 3,
  MAX_ANCESTRY_ENTRIES: 8,
  MAX_EVIDENCE_REFS: 6,
  MAX_EVIDENCE_IDS_PER_REF: 6,
  MAX_DAUGHTER_IDS_PER_ERA: 4,
  POPULATION_LOSS_MIN: 6,
  POPULATION_LOSS_SHARE: 0.3,
  POPULATION_RECOVERY_MIN: 6,
  POPULATION_RECOVERY_SHARE: 0.3,
  LONG_HUNGER_MIN_STREAK_SEASONS: 8,
  WATER_CAUTION_MIN_SEASONS_LAST8: 5,
  ROUTE_MEMORY_USE_THRESHOLD: 6,
  CAMP_HOME_RETURN_THRESHOLD: 4,
  HARD_CROSSING_RISK_THRESHOLD: 0.5,
  HARD_CROSSING_MIN_USES: 2,
  FALLBACK_RELIANCE_THRESHOLD: 0.3,
  FALLBACK_RELIANCE_MIN_YEARS: 3,
  NEAR_COLLAPSE_RISK_THRESHOLD: 0.6,
  NEAR_COLLAPSE_CLOSE_THRESHOLD: 0.3,
  RELOCATION_MIN_DISTANCE_TILES: 8,
  RELOCATION_HOLD_YEARS: 3,
  COUNTRY_EXPANDED_TILE_STEP: 18,
  PAYLOAD_SOFT_CAP_BYTES: 20_000,
} as const;

const C = DEEP_HISTORY_CONSTANTS;

const DEEP_HISTORY_INTEGRITY = {
  observeOnly: true,
  noBehaviorInfluence: true,
  evidenceBacked: true,
  noInventedClaims: true,
} as const;

export interface DaughterFoundingArgs {
  readonly daughterBandId: BandId;
  readonly foundingTileId: TileId;
  readonly lineage: BandLineageLink;
  readonly fissionEvent: BandFissionEvent;
  readonly startingDependents: number;
  readonly startingWorkingAdults: number;
  readonly startingElders: number;
}

// ---------------------------------------------------------------------------
// Founding snapshots
// ---------------------------------------------------------------------------

export function createOriginDeepHistory(world: WorldState, band: Band): BandDeepHistoryState {
  const tile = getTile(world, band.position);
  const founding: BandFoundingSnapshot = {
    bandId: band.id,
    kind: "origin_spawn",
    foundedAt: world.time,
    foundingTileId: band.position,
    foundingTileWaterAccess: tile === undefined ? undefined : round2(tile.resourceProfile.waterAccess),
    foundingTileIsRiverbank: tile?.isRiverbank,
    foundingTileIsCoastal: tile?.isCoastal,
    foundingTileIsFloodplain: tile?.isFloodplain,
    creationCause: band.initialSpawnReason?.profileRole,
    creationReasonIds: [],
    startingPopulation: band.demography.population,
    startingDependents: band.demography.dependents,
    startingWorkingAdults: band.demography.workingAdults,
    startingElders: band.demography.elders,
    startingKnownTileCount: Object.keys(band.knowledge.observedTiles).length,
    startingPlaceMemoryCount: 0,
    startingCorridorCount: 0,
    startingCrossingCount: 0,
    evidence: [{ kind: "creation_record", ids: [String(band.id)] }],
    // Origin bands have no parent context by definition — the whole fission
    // block is not-applicable, which we record honestly rather than fill.
    unknownAtFounding: ["parentContext_notApplicable_originBand"],
  };

  return buildInitialState(band.id, founding, [], [], [], world.time.year, band.position, band.demography.population, founding.startingKnownTileCount, world.time.tick);
}

export function createDaughterDeepHistory(
  world: WorldState,
  parent: Band,
  args: DaughterFoundingArgs,
): BandDeepHistoryState {
  const tile = getTile(world, args.foundingTileId);
  const event = args.fissionEvent;
  const unknownAtFounding: string[] = [];
  const parentFoodStressAtSplit = parent.pressureState?.foodStress;
  const parentWaterStressAtSplit = parent.pressureState?.waterStress;
  const parentHungerClassificationAtSplit = parent.seasonalSupport?.hungerClassification;
  const parentExtinctionRiskAtSplit = parent.viability?.extinctionRisk;

  if (parentFoodStressAtSplit === undefined) {
    unknownAtFounding.push("parentFoodStressAtSplit");
  }

  if (parentWaterStressAtSplit === undefined) {
    unknownAtFounding.push("parentWaterStressAtSplit");
  }

  if (parentHungerClassificationAtSplit === undefined) {
    unknownAtFounding.push("parentHungerClassificationAtSplit");
  }

  if (parentExtinctionRiskAtSplit === undefined) {
    unknownAtFounding.push("parentExtinctionRiskAtSplit");
  }

  const founding: BandFoundingSnapshot = {
    bandId: args.daughterBandId,
    kind: "fission_daughter",
    foundedAt: world.time,
    foundingTileId: args.foundingTileId,
    foundingTileWaterAccess: tile === undefined ? undefined : round2(tile.resourceProfile.waterAccess),
    foundingTileIsRiverbank: tile?.isRiverbank,
    foundingTileIsCoastal: tile?.isCoastal,
    foundingTileIsFloodplain: tile?.isFloodplain,
    creationCause: args.lineage.relation,
    creationReasonIds: args.lineage.reasonIds.slice(0, C.MAX_EVIDENCE_IDS_PER_REF),
    startingPopulation: event.daughterPopulation,
    startingDependents: args.startingDependents,
    startingWorkingAdults: args.startingWorkingAdults,
    startingElders: args.startingElders,
    startingKnownTileCount: event.inheritedKnowledgeCount,
    startingPlaceMemoryCount: event.inheritedMemoryCount,
    startingCorridorCount: event.inheritedCorridorCount,
    startingCrossingCount: event.inheritedCrossingCount,
    parentBandId: parent.id,
    parentOriginTileId: args.lineage.originTileId,
    relation: args.lineage.relation,
    parentPopulationBefore: event.parentPopulationBefore,
    parentFoodStressAtSplit: roundOptional(parentFoodStressAtSplit),
    parentWaterStressAtSplit: roundOptional(parentWaterStressAtSplit),
    parentHungerClassificationAtSplit,
    parentExtinctionRiskAtSplit: roundOptional(parentExtinctionRiskAtSplit),
    inheritedKnowledgeCount: event.inheritedKnowledgeCount,
    inheritedMemoryCount: event.inheritedMemoryCount,
    inheritedCorridorCount: event.inheritedCorridorCount,
    inheritedCrossingCount: event.inheritedCrossingCount,
    evidence: [
      { kind: "fission_event", ids: [String(event.id)] },
      { kind: "lineage_link", ids: args.lineage.reasonIds.slice(0, C.MAX_EVIDENCE_IDS_PER_REF).map(String) },
    ],
    unknownAtFounding,
  };

  const parentHistory = parent.deepHistory;
  const ancestryLine: AncestryEntry[] = [
    ...(parentHistory?.ancestryLine ?? []),
    {
      bandId: parent.id,
      foundedYear: parentHistory?.founding.foundedAt.year ?? 0,
      kind: parentHistory?.founding.kind ?? "origin_spawn",
    },
  ].slice(-C.MAX_ANCESTRY_ENTRIES);
  const inheritedEraSummaries: InheritedEraSummary[] = (parentHistory?.eras ?? [])
    .slice(-C.MAX_INHERITED_ERA_SUMMARIES)
    .map((era) => ({
      sourceBandId: parent.id,
      startYear: era.startYear,
      endYear: era.endYear,
      headline: era.headline,
      populationEnd: era.populationEnd,
    }));
  const inheritedEpisodes: BandHistoricalEpisode[] = [...(parentHistory?.episodes ?? [])]
    .sort((left, right) => (right.severity - left.severity) || left.id.localeCompare(right.id))
    .slice(0, C.MAX_INHERITED_EPISODES)
    .map((episode) => ({
      ...episode,
      ongoing: false,
      endYear: episode.endYear ?? episode.lastUpdatedYear,
      confidence: round2(Math.max(0, episode.confidence * 0.7)),
      provenance: "inherited",
      inheritedFromBandId: parent.id,
      evidence: capRefs([
        ...episode.evidence,
        { kind: "inherited_summary", ids: [String(parent.id)] },
      ]),
    }));

  return buildInitialState(
    args.daughterBandId,
    founding,
    ancestryLine,
    inheritedEraSummaries,
    inheritedEpisodes,
    world.time.year,
    args.foundingTileId,
    event.daughterPopulation,
    event.inheritedKnowledgeCount,
    world.time.tick,
  );
}

function buildInitialState(
  bandId: BandId,
  founding: BandFoundingSnapshot,
  ancestryLine: readonly AncestryEntry[],
  inheritedEraSummaries: readonly InheritedEraSummary[],
  inheritedEpisodes: readonly BandHistoricalEpisode[],
  year: number,
  tileId: TileId,
  population: number,
  knownBreadth: number,
  tick: TickNumber,
): BandDeepHistoryState {
  const state: BandDeepHistoryState = {
    bandId,
    founding,
    eras: [],
    openEra: {
      startYear: year,
      startTileId: tileId,
      populationStart: population,
      populationMin: population,
      populationMax: population,
      births: 0,
      deaths: 0,
      crisisDeaths: 0,
      hungerYears: 0,
      waterStressYears: 0,
      recoveryYears: 0,
      fissionCount: 0,
      daughterBandIds: [],
      movesCount: 0,
      yearsAccumulated: 0,
      awayFromStartYears: 0,
    },
    episodes: [],
    inheritedEpisodes,
    inheritedEraSummaries,
    ancestryLine,
    tracking: {
      lastObservedTick: tick,
      lastObservedYear: year,
      populationPeak: population,
      populationPeakYear: year,
      populationTrough: population,
      populationTroughYear: year,
      knownBreadthBaseline: knownBreadth,
      fallbackRelianceYears: 0,
    },
    caps: makeCaps(0, 0, true),
    integrity: DEEP_HISTORY_INTEGRITY,
    lastAdvancedYear: year,
    payloadBytesEstimate: 0,
  };

  return finalizeCappedHistoryState(state, 0, 0);
}

// ---------------------------------------------------------------------------
// Yearly observation pass (spring-gated, mirrors the annual demography cadence)
// ---------------------------------------------------------------------------

export function applyBandDeepHistoryContext(world: WorldState): WorldState {
  if (world.time.season !== "spring" || world.time.tick <= 0) {
    return world;
  }

  let changed = false;
  const bandsById: Record<string, Band> = {};

  for (const band of Object.values(world.bands).sort(compareBands)) {
    const advanced = advanceBandDeepHistoryForYear(world, band);
    bandsById[band.id] = advanced;

    if (advanced !== band) {
      changed = true;
    }
  }

  if (!changed) {
    return world;
  }

  return {
    ...world,
    bands: bandsById as Readonly<Record<BandId, Band>>,
  };
}

function advanceBandDeepHistoryForYear(world: WorldState, band: Band): Band {
  const history = band.deepHistory;

  if (history === undefined) {
    return band;
  }

  const dead =
    band.status === "dispersed" ||
    band.viability?.status === "absorbed" ||
    band.viability?.status === "extinct";

  if (dead) {
    if (history.terminalRecord !== undefined) {
      return band;
    }

    return { ...band, deepHistory: recordTerminalHistory(world, band, history) };
  }

  if (world.time.year <= history.lastAdvancedYear) {
    return band;
  }

  return { ...band, deepHistory: observeYear(world, band, history) };
}

interface YearObservation {
  readonly year: number;
  readonly births: number;
  readonly deaths: number;
  readonly crisisDeaths: number;
  readonly churnYears: readonly number[];
  readonly hungerClassification: SeasonalHungerClassification | undefined;
  readonly chronicDeficitStreak: number;
  readonly waterStressSeasonsLast8: number;
  readonly extinctionRisk: number;
  readonly newFissionEvents: readonly BandFissionEvent[];
  readonly movesThisYear: number;
  readonly knownBreadth: number;
  readonly fallbackFoodReliance: number;
  readonly population: number;
}

function collectYearObservation(band: Band, tracking: BandHistoryTrackingState, year: number): YearObservation {
  const churnRecords = (band.demography.demographicChurn?.records ?? []).filter(
    (record) => record.year > tracking.lastObservedYear,
  );
  const support = band.seasonalSupport;

  return {
    year,
    births: churnRecords.reduce((sum, record) => sum + record.births, 0),
    deaths: churnRecords.reduce((sum, record) => sum + record.deaths, 0),
    crisisDeaths: churnRecords.reduce((sum, record) => sum + record.crisisDeaths, 0),
    churnYears: churnRecords.map((record) => record.year),
    hungerClassification: support?.hungerClassification,
    chronicDeficitStreak: support?.chronicDeficitStreak ?? 0,
    waterStressSeasonsLast8: support?.waterStressSeasonsLast8 ?? 0,
    extinctionRisk: band.viability?.extinctionRisk ?? 0,
    newFissionEvents: band.fissionEvents.filter((event) => event.tick > tracking.lastObservedTick),
    movesThisYear: band.movementHistory.filter((record) => record.tick > tracking.lastObservedTick).length,
    knownBreadth: deriveKnownBreadth(band),
    fallbackFoodReliance: band.ecologicalStressCauses?.fallbackFoodReliance ?? 0,
    population: band.demography.population,
  };
}

function observeYear(world: WorldState, band: Band, history: BandDeepHistoryState): BandDeepHistoryState {
  const year = world.time.year;
  const observation = collectYearObservation(band, history.tracking, year);
  const tracking = advanceTracking(history.tracking, observation, world.time.tick);
  const episodesAfterDetection = detectEpisodes(band, history, observation, tracking);
  const { episodes, droppedCount } = capEpisodes(episodesAfterDetection);
  const openEra = accumulateEra(world, band, history.openEra, observation);
  const closeTrigger = openEra === undefined ? undefined : deriveEraCloseTrigger(openEra, observation, episodes, year);
  let eras = history.eras;
  let nextOpenEra = openEra;

  if (openEra !== undefined && closeTrigger !== undefined) {
    eras = [...eras, closeEra(band.id, openEra, closeTrigger, year, band.position)];
    nextOpenEra = {
      startYear: year,
      startTileId: band.position,
      populationStart: observation.population,
      populationMin: observation.population,
      populationMax: observation.population,
      births: 0,
      deaths: 0,
      crisisDeaths: 0,
      hungerYears: 0,
      waterStressYears: 0,
      recoveryYears: 0,
      fissionCount: 0,
      daughterBandIds: [],
      movesCount: 0,
      yearsAccumulated: 0,
      awayFromStartYears: 0,
    };
  }

  let erasMergedCount = history.caps.erasMergedCount;

  while (eras.length > C.MAX_ERA_RECORDS) {
    eras = [mergeEras(eras[0], eras[1]), ...eras.slice(2)];
    erasMergedCount += 1;
  }

  const next: BandDeepHistoryState = {
    ...history,
    eras,
    openEra: nextOpenEra,
    episodes,
    tracking,
    caps: makeCaps(erasMergedCount, history.caps.episodesDroppedCount + droppedCount, true),
    lastAdvancedYear: year,
    payloadBytesEstimate: 0,
  };

  return finalizeCappedHistoryState(next, erasMergedCount, history.caps.episodesDroppedCount + droppedCount);
}

function advanceTracking(
  tracking: BandHistoryTrackingState,
  observation: YearObservation,
  tick: TickNumber,
): BandHistoryTrackingState {
  const fallbackActive = observation.fallbackFoodReliance >= C.FALLBACK_RELIANCE_THRESHOLD;

  return {
    lastObservedTick: tick,
    lastObservedYear: observation.year,
    populationPeak: Math.max(tracking.populationPeak, observation.population),
    populationPeakYear:
      observation.population > tracking.populationPeak ? observation.year : tracking.populationPeakYear,
    populationTrough: Math.min(tracking.populationTrough, observation.population),
    populationTroughYear:
      observation.population < tracking.populationTrough ? observation.year : tracking.populationTroughYear,
    // The breadth baseline advances exactly when the country_expanded episode
    // fires (same condition read from the same observation), so each expansion
    // step is recorded once.
    knownBreadthBaseline:
      observation.knownBreadth >= tracking.knownBreadthBaseline + C.COUNTRY_EXPANDED_TILE_STEP
        ? observation.knownBreadth
        : tracking.knownBreadthBaseline,
    fallbackRelianceYears: fallbackActive ? tracking.fallbackRelianceYears + 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Episode detection (stable ids: episode:<bandId>:<type>:<subjectKey>)
// ---------------------------------------------------------------------------

interface EpisodeDraft {
  readonly type: BandEpisodeType;
  readonly subjectKey: string;
  readonly startYear: number;
  readonly ongoing: boolean;
  readonly severity: number;
  readonly summary: string;
  readonly detail: Readonly<Record<string, number>>;
  readonly evidence: readonly HistoryEvidenceRef[];
  readonly recordKind: BandHistoricalEpisode["recordKind"];
  readonly confidence: number;
  readonly relatedTileId?: TileId;
  readonly relatedRouteId?: RouteId;
  readonly relatedBandId?: BandId;
}

function detectEpisodes(
  band: Band,
  history: BandDeepHistoryState,
  observation: YearObservation,
  tracking: BandHistoryTrackingState,
): readonly BandHistoricalEpisode[] {
  const drafts: EpisodeDraft[] = [];
  const year = observation.year;
  const foundingYear = history.founding.foundedAt.year;
  // Period episodes anchor to the year the pattern was FIRST detected: while
  // an episode of the type is still ongoing, its startYear is reused so the
  // rolling detection window never mints a second id for the same period.
  const anchorPeriodStart = (type: BandEpisodeType, fallbackStartYear: number): number => {
    const ongoing = history.episodes.find(
      (episode) => episode.type === type && episode.provenance === "lived" && episode.ongoing,
    );

    return ongoing?.startYear ?? fallbackStartYear;
  };

  // daughter_branch_formed — recorded events, one per new fission.
  for (const event of observation.newFissionEvents) {
    drafts.push({
      type: "daughter_branch_formed",
      subjectKey: String(event.daughterBandId),
      startYear: event.time.year,
      ongoing: false,
      severity: clamp01(event.parentPopulationBefore <= 0 ? 0 : event.daughterPopulation / event.parentPopulationBefore),
      summary: `a daughter band of ${event.daughterPopulation} people split away`,
      detail: {
        parentPopulationBefore: event.parentPopulationBefore,
        daughterPopulation: event.daughterPopulation,
        year: event.time.year,
      },
      evidence: [{ kind: "fission_event", ids: [String(event.id)] }],
      recordKind: "recorded_event",
      confidence: 1,
      relatedBandId: event.daughterBandId,
      relatedTileId: event.targetTileId,
    });
  }

  // population_thinned / population_recovered — compressed churn patterns.
  const churn = band.demography.demographicChurn;

  if (churn !== undefined) {
    const net10 = churn.netPopulationChangeLast10Years;
    const basePopulation = observation.population - net10;
    const lossFloor = Math.max(C.POPULATION_LOSS_MIN, Math.round(basePopulation * C.POPULATION_LOSS_SHARE));
    const gainFloor = Math.max(C.POPULATION_RECOVERY_MIN, Math.round(basePopulation * C.POPULATION_RECOVERY_SHARE));
    const spanStart = Math.max(foundingYear, year - 10);
    const churnEvidence: HistoryEvidenceRef[] = [
      { kind: "demographic_churn", ids: [`churn:${String(band.id)}:${spanStart}-${year}`] },
    ];

    if (net10 <= -lossFloor && basePopulation > 0) {
      const thinnedStart = anchorPeriodStart("population_thinned", spanStart);
      drafts.push({
        type: "population_thinned",
        subjectKey: String(thinnedStart),
        startYear: thinnedStart,
        ongoing: true,
        severity: clamp01(-net10 / Math.max(1, basePopulation)),
        summary: `the band thinned by ${-net10} people over ten years`,
        detail: { netChange: net10, basePopulation, population: observation.population },
        evidence: churnEvidence,
        recordKind: "compressed_pattern",
        confidence: 0.85,
      });
    }

    const hardTimes = [...history.episodes]
      .filter(
        (episode) =>
          (episode.type === "population_thinned" ||
            episode.type === "near_collapse" ||
            episode.type === "long_hunger_period") &&
          (episode.endYear ?? episode.lastUpdatedYear) >= year - 15,
      )
      .sort((left, right) => left.id.localeCompare(right.id));

    if (net10 >= gainFloor && basePopulation > 0 && hardTimes.length > 0) {
      const recoveredStart = anchorPeriodStart("population_recovered", spanStart);
      drafts.push({
        type: "population_recovered",
        subjectKey: String(recoveredStart),
        startYear: recoveredStart,
        ongoing: true,
        severity: clamp01(net10 / Math.max(1, basePopulation)),
        summary: `the band grew back by ${net10} people after hard times`,
        detail: { netChange: net10, basePopulation, population: observation.population },
        evidence: capRefs([...churnEvidence, { kind: "demographic_churn", ids: [hardTimes[0].id] }]),
        recordKind: "compressed_pattern",
        confidence: 0.8,
      });
    }
  }

  // long_hunger_period — from the seasonal-support chronic streak.
  const hungerNow = isChronicHunger(observation.hungerClassification);

  if (observation.chronicDeficitStreak >= C.LONG_HUNGER_MIN_STREAK_SEASONS && hungerNow) {
    const startYear = anchorPeriodStart(
      "long_hunger_period",
      Math.max(foundingYear, year - Math.floor(observation.chronicDeficitStreak / 4)),
    );
    drafts.push({
      type: "long_hunger_period",
      subjectKey: String(startYear),
      startYear,
      ongoing: true,
      severity: clamp01(observation.chronicDeficitStreak / 24 + observation.crisisDeaths * 0.08),
      summary: `food ran short season after season (${observation.chronicDeficitStreak} seasons)`,
      detail: { streakSeasons: observation.chronicDeficitStreak, crisisDeaths: observation.crisisDeaths },
      evidence: [
        { kind: "seasonal_support", ids: [`support:${String(band.id)}:${startYear}-${year}`] },
      ],
      recordKind: "compressed_pattern",
      confidence: 0.9,
    });
  }

  // water_caution_period — recurring water stress in the rolling 8 seasons.
  if (observation.waterStressSeasonsLast8 >= C.WATER_CAUTION_MIN_SEASONS_LAST8) {
    const startYear = anchorPeriodStart("water_caution_period", Math.max(foundingYear, year - 2));
    drafts.push({
      type: "water_caution_period",
      subjectKey: String(startYear),
      startYear,
      ongoing: true,
      severity: clamp01(observation.waterStressSeasonsLast8 / 8),
      summary: `water worries kept returning (${observation.waterStressSeasonsLast8} of the last 8 seasons)`,
      detail: { waterStressSeasonsLast8: observation.waterStressSeasonsLast8 },
      evidence: [
        { kind: "seasonal_support", ids: [`water:${String(band.id)}:${startYear}-${year}`] },
      ],
      recordKind: "compressed_pattern",
      confidence: 0.85,
    });
  }

  // route_became_memory — corridors that crossed the use threshold.
  for (const routeId of Object.keys(band.travelCorridors).sort()) {
    const corridor = band.travelCorridors[routeId as RouteId];

    if (corridor.useCount >= C.ROUTE_MEMORY_USE_THRESHOLD) {
      drafts.push({
        type: "route_became_memory",
        subjectKey: String(routeId),
        startYear: year,
        ongoing: false,
        severity: clamp01(corridor.useCount / 24),
        summary: `a route walked ${corridor.useCount} times became part of the band's memory`,
        detail: { useCount: corridor.useCount },
        evidence: [{ kind: "route_memory", ids: [String(routeId)] }],
        recordKind: "recorded_event",
        confidence: round2(clamp01(corridor.confidence)),
        relatedRouteId: routeId as RouteId,
        relatedTileId: corridor.toTileId,
      });
    }
  }

  // country_expanded — known breadth grew well past the PRE-advance baseline
  // (the tracking param already advanced its baseline for this same step).
  const previousBreadthBaseline = history.tracking.knownBreadthBaseline;

  if (observation.knownBreadth >= previousBreadthBaseline + C.COUNTRY_EXPANDED_TILE_STEP) {
    drafts.push({
      type: "country_expanded",
      subjectKey: String(year),
      startYear: year,
      ongoing: false,
      severity: clamp01(
        (observation.knownBreadth - previousBreadthBaseline) / (C.COUNTRY_EXPANDED_TILE_STEP * 3),
      ),
      summary: `the band's known country grew from ${previousBreadthBaseline} to ${observation.knownBreadth} places`,
      detail: { fromBreadth: previousBreadthBaseline, toBreadth: observation.knownBreadth },
      evidence: [
        { kind: "knowledge_breadth", ids: [`breadth:${String(band.id)}:${year}:${observation.knownBreadth}`] },
      ],
      recordKind: "compressed_pattern",
      confidence: 0.85,
    });
  }

  // camp_became_home — repeated-return places.
  for (const tileId of Object.keys(band.placeMemory).sort()) {
    const record = band.placeMemory[tileId as TileId];

    if (record.isReturnPlace && record.repeatedReturnCount >= C.CAMP_HOME_RETURN_THRESHOLD) {
      drafts.push({
        type: "camp_became_home",
        subjectKey: String(tileId),
        startYear: year,
        ongoing: false,
        severity: clamp01(record.repeatedReturnCount / 24 + record.attachment * 0.25),
        summary: `a camp returned to ${record.repeatedReturnCount} times became home ground`,
        detail: { repeatedReturnCount: record.repeatedReturnCount, attachment: round2(record.attachment) },
        evidence: [{ kind: "place_memory", ids: [String(tileId)] }],
        recordKind: "recorded_event",
        confidence: round2(clamp01(record.confidence)),
        relatedTileId: tileId as TileId,
      });
    }
  }

  // hard_crossing_remembered — risky, repeatedly used crossings.
  for (const crossingKey of Object.keys(band.crossingMemories).sort()) {
    const crossing = band.crossingMemories[crossingKey];

    if (
      crossing.riskMemory >= C.HARD_CROSSING_RISK_THRESHOLD &&
      crossing.useCount >= C.HARD_CROSSING_MIN_USES
    ) {
      drafts.push({
        type: "hard_crossing_remembered",
        subjectKey: crossingKey,
        startYear: year,
        ongoing: false,
        severity: round2(clamp01(crossing.riskMemory)),
        summary: `a dangerous river crossing is remembered with caution`,
        detail: { useCount: crossing.useCount, riskMemory: round2(crossing.riskMemory) },
        evidence: [{ kind: "crossing_memory", ids: [crossingKey] }],
        recordKind: "recorded_event",
        confidence: round2(clamp01(crossing.successConfidence)),
        relatedTileId: crossing.crossingTileA,
      });
    }
  }

  // fallback_reliance_period — sustained reliance on fallback foods.
  if (tracking.fallbackRelianceYears >= C.FALLBACK_RELIANCE_MIN_YEARS) {
    const startYear = anchorPeriodStart(
      "fallback_reliance_period",
      Math.max(foundingYear, year - tracking.fallbackRelianceYears + 1),
    );
    drafts.push({
      type: "fallback_reliance_period",
      subjectKey: String(startYear),
      startYear,
      ongoing: true,
      severity: clamp01(observation.fallbackFoodReliance),
      summary: `the band leaned on fallback foods for ${tracking.fallbackRelianceYears} years running`,
      detail: {
        years: tracking.fallbackRelianceYears,
        fallbackFoodReliance: round2(observation.fallbackFoodReliance),
      },
      evidence: [
        { kind: "pressure_state", ids: [`fallback:${String(band.id)}:${startYear}-${year}`] },
      ],
      recordKind: "compressed_pattern",
      confidence: 0.8,
    });
  }

  // near_collapse — high extinction risk observed.
  if (observation.extinctionRisk >= C.NEAR_COLLAPSE_RISK_THRESHOLD) {
    const collapseStart = anchorPeriodStart("near_collapse", year);
    drafts.push({
      type: "near_collapse",
      subjectKey: String(collapseStart),
      startYear: collapseStart,
      ongoing: true,
      severity: round2(clamp01(observation.extinctionRisk)),
      summary: `the band came close to disappearing`,
      detail: { extinctionRisk: round2(observation.extinctionRisk), population: observation.population },
      evidence: [
        {
          kind: "viability_record",
          ids: (band.viability?.reasonIds ?? []).slice(-C.MAX_EVIDENCE_IDS_PER_REF).map(String),
        },
      ],
      recordKind: "recorded_event",
      confidence: 0.9,
    });
  }

  return foldEpisodeDrafts(band.id, history.episodes, drafts, observation);
}

function foldEpisodeDrafts(
  bandId: BandId,
  existing: readonly BandHistoricalEpisode[],
  drafts: readonly EpisodeDraft[],
  observation: YearObservation,
): readonly BandHistoricalEpisode[] {
  const byId = new Map<string, BandHistoricalEpisode>();

  for (const episode of existing) {
    byId.set(episode.id, episode);
  }

  const touchedOngoingIds = new Set<string>();

  for (const draft of drafts) {
    const id = `episode:${String(bandId)}:${draft.type}:${draft.subjectKey}`;
    const current = byId.get(id);

    if (current === undefined) {
      byId.set(id, {
        id,
        type: draft.type,
        startYear: draft.startYear,
        endYear: draft.ongoing ? undefined : observation.year,
        ongoing: draft.ongoing,
        severity: round2(clamp01(draft.severity)),
        relatedTileId: draft.relatedTileId,
        relatedRouteId: draft.relatedRouteId,
        relatedBandId: draft.relatedBandId,
        summary: draft.summary,
        detail: draft.detail,
        evidence: capRefs(draft.evidence),
        recordKind: draft.recordKind,
        confidence: round2(clamp01(draft.confidence)),
        occurrenceCount: 1,
        lastUpdatedYear: observation.year,
        provenance: "lived",
      });
    } else {
      byId.set(id, {
        ...current,
        endYear: draft.ongoing ? undefined : observation.year,
        ongoing: draft.ongoing,
        severity: round2(Math.max(current.severity, clamp01(draft.severity))),
        summary: draft.summary,
        detail: draft.detail,
        occurrenceCount: current.occurrenceCount + 1,
        lastUpdatedYear: observation.year,
      });
    }

    if (draft.ongoing) {
      touchedOngoingIds.add(id);
    }
  }

  // Ongoing episodes whose condition no longer holds this year close now.
  const episodes: BandHistoricalEpisode[] = [];

  for (const episode of byId.values()) {
    if (episode.provenance === "lived" && episode.ongoing && !touchedOngoingIds.has(episode.id)) {
      episodes.push({ ...episode, ongoing: false, endYear: episode.lastUpdatedYear });
    } else {
      episodes.push(episode);
    }
  }

  return episodes.sort((left, right) => (left.startYear - right.startYear) || left.id.localeCompare(right.id));
}

const EPISODE_TYPE_WEIGHT: Readonly<Record<BandEpisodeType, number>> = {
  population_thinned: 0.5,
  population_recovered: 0.5,
  daughter_branch_formed: 1,
  long_hunger_period: 0.6,
  water_caution_period: 0.3,
  route_became_memory: 0.2,
  country_expanded: 0.3,
  camp_became_home: 0.35,
  hard_crossing_remembered: 0.25,
  fallback_reliance_period: 0.3,
  near_collapse: 0.9,
  band_absorbed_end: 2,
  band_collapsed_end: 2,
};

function capEpisodes(episodes: readonly BandHistoricalEpisode[]): {
  readonly episodes: readonly BandHistoricalEpisode[];
  readonly droppedCount: number;
} {
  if (episodes.length <= C.MAX_EPISODES) {
    return { episodes, droppedCount: 0 };
  }

  const scored = [...episodes].sort((left, right) => {
    const leftScore = episodeSignificance(left);
    const rightScore = episodeSignificance(right);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.id.localeCompare(right.id);
  });
  const kept = new Set(scored.slice(0, C.MAX_EPISODES).map((episode) => episode.id));

  return {
    episodes: episodes.filter((episode) => kept.has(episode.id)),
    droppedCount: episodes.length - C.MAX_EPISODES,
  };
}

function episodeSignificance(episode: BandHistoricalEpisode): number {
  return (
    episode.severity +
    EPISODE_TYPE_WEIGHT[episode.type] +
    (episode.ongoing ? 0.5 : 0) +
    Math.min(0.4, episode.occurrenceCount * 0.02)
  );
}

// ---------------------------------------------------------------------------
// Era accumulation, close triggers, deterministic deep-past merging
// ---------------------------------------------------------------------------

function accumulateEra(
  world: WorldState,
  band: Band,
  openEra: OpenEraAccumulator | undefined,
  observation: YearObservation,
): OpenEraAccumulator | undefined {
  if (openEra === undefined) {
    return undefined;
  }

  const away = tileChebyshevDistance(world, band.position, openEra.startTileId) >= C.RELOCATION_MIN_DISTANCE_TILES;

  return {
    ...openEra,
    populationMin: Math.min(openEra.populationMin, observation.population),
    populationMax: Math.max(openEra.populationMax, observation.population),
    births: openEra.births + observation.births,
    deaths: openEra.deaths + observation.deaths,
    crisisDeaths: openEra.crisisDeaths + observation.crisisDeaths,
    hungerYears: openEra.hungerYears + (isChronicHunger(observation.hungerClassification) ? 1 : 0),
    waterStressYears: openEra.waterStressYears + (isWaterStress(observation.hungerClassification) ? 1 : 0),
    recoveryYears: openEra.recoveryYears + (isRecovery(observation.hungerClassification) ? 1 : 0),
    fissionCount: openEra.fissionCount + observation.newFissionEvents.length,
    daughterBandIds: [
      ...openEra.daughterBandIds,
      ...observation.newFissionEvents.map((event) => event.daughterBandId),
    ].slice(0, C.MAX_DAUGHTER_IDS_PER_ERA),
    movesCount: openEra.movesCount + observation.movesThisYear,
    yearsAccumulated: openEra.yearsAccumulated + 1,
    awayFromStartYears: away ? openEra.awayFromStartYears + 1 : 0,
  };
}

function deriveEraCloseTrigger(
  openEra: OpenEraAccumulator,
  observation: YearObservation,
  episodes: readonly BandHistoricalEpisode[],
  year: number,
): BandEraCloseTrigger | undefined {
  const population = observation.population;
  const canEventClose = openEra.yearsAccumulated >= C.ERA_MIN_YEARS_FOR_EVENT_CLOSE;

  if (
    canEventClose &&
    population <= openEra.populationMax * (1 - C.POPULATION_LOSS_SHARE) &&
    openEra.populationMax - population >= C.POPULATION_LOSS_MIN
  ) {
    return "population_loss";
  }

  if (
    canEventClose &&
    openEra.populationMin > 0 &&
    population >= openEra.populationMin * (1 + C.POPULATION_RECOVERY_SHARE) &&
    population - openEra.populationMin >= C.POPULATION_RECOVERY_MIN
  ) {
    return "population_recovery";
  }

  if (canEventClose && observation.newFissionEvents.length > 0) {
    return "fission";
  }

  if (openEra.awayFromStartYears >= C.RELOCATION_HOLD_YEARS) {
    return "relocation_shift";
  }

  if (
    canEventClose &&
    episodes.some(
      (episode) =>
        episode.type === "long_hunger_period" &&
        episode.provenance === "lived" &&
        episode.ongoing &&
        episode.lastUpdatedYear === year &&
        episode.occurrenceCount === 1,
    )
  ) {
    return "long_crisis";
  }

  if (openEra.yearsAccumulated >= C.ERA_TARGET_YEARS) {
    return "interval_elapsed";
  }

  return undefined;
}

function closeEra(
  bandId: BandId,
  openEra: OpenEraAccumulator,
  closeTrigger: BandEraCloseTrigger,
  endYear: number,
  endTileId: TileId,
): BandEraRecord {
  const span = Math.max(1, openEra.yearsAccumulated);
  const net = openEra.births - openEra.deaths;
  const evidence: HistoryEvidenceRef[] = [
    { kind: "demographic_churn", ids: [`churn:${String(bandId)}:${openEra.startYear}-${endYear}`] },
  ];

  if (openEra.hungerYears + openEra.waterStressYears + openEra.recoveryYears > 0) {
    evidence.push({
      kind: "seasonal_support",
      ids: [`support:${String(bandId)}:${openEra.startYear}-${endYear}`],
    });
  }

  if (openEra.daughterBandIds.length > 0) {
    evidence.push({
      kind: "fission_event",
      ids: openEra.daughterBandIds.slice(0, C.MAX_EVIDENCE_IDS_PER_REF).map(String),
    });
  }

  return {
    id: `era:${String(bandId)}:${openEra.startYear}`,
    startYear: openEra.startYear,
    endYear,
    closeTrigger,
    headline: classifyEraHeadline(openEra, net, span),
    populationStart: openEra.populationStart,
    populationEnd: openEra.populationStart + net,
    populationMin: openEra.populationMin,
    populationMax: openEra.populationMax,
    births: openEra.births,
    deaths: openEra.deaths,
    crisisDeaths: openEra.crisisDeaths,
    hungerYears: openEra.hungerYears,
    waterStressYears: openEra.waterStressYears,
    recoveryYears: openEra.recoveryYears,
    fissionCount: openEra.fissionCount,
    daughterBandIds: openEra.daughterBandIds,
    movesCount: openEra.movesCount,
    startTileId: openEra.startTileId,
    endTileId,
    evidence: capRefs(evidence),
    recordKind: "compressed_pattern",
    confidence: 0.9,
    merged: false,
    mergedSpanCount: 1,
  };
}

function classifyEraHeadline(openEra: OpenEraAccumulator, net: number, span: number): BandEraHeadline {
  if (net <= -Math.max(C.POPULATION_LOSS_MIN, Math.round(openEra.populationStart * C.POPULATION_LOSS_SHARE))) {
    return "loss_years";
  }

  if (openEra.hungerYears >= span * 0.4 || openEra.crisisDeaths >= 4) {
    return "hardship_years";
  }

  if (openEra.recoveryYears >= span * 0.3 && net > 0) {
    return "recovery_years";
  }

  if (openEra.fissionCount >= 1) {
    return "branching_years";
  }

  if (net >= Math.max(C.POPULATION_RECOVERY_MIN, Math.round(openEra.populationStart * C.POPULATION_RECOVERY_SHARE))) {
    return "growth_years";
  }

  if (openEra.movesCount >= span * 0.75) {
    return "wandering_years";
  }

  if (openEra.movesCount <= span * 0.15) {
    return "settling_years";
  }

  return "steady_years";
}

function mergeEras(first: BandEraRecord, second: BandEraRecord): BandEraRecord {
  const firstSpan = first.endYear - first.startYear;
  const secondSpan = second.endYear - second.startYear;

  return {
    id: first.id,
    startYear: first.startYear,
    endYear: second.endYear,
    closeTrigger: second.closeTrigger,
    headline: secondSpan > firstSpan ? second.headline : first.headline,
    populationStart: first.populationStart,
    populationEnd: second.populationEnd,
    populationMin: Math.min(first.populationMin, second.populationMin),
    populationMax: Math.max(first.populationMax, second.populationMax),
    births: first.births + second.births,
    deaths: first.deaths + second.deaths,
    crisisDeaths: first.crisisDeaths + second.crisisDeaths,
    hungerYears: first.hungerYears + second.hungerYears,
    waterStressYears: first.waterStressYears + second.waterStressYears,
    recoveryYears: first.recoveryYears + second.recoveryYears,
    fissionCount: first.fissionCount + second.fissionCount,
    daughterBandIds: [...first.daughterBandIds, ...second.daughterBandIds].slice(0, C.MAX_DAUGHTER_IDS_PER_ERA),
    movesCount: first.movesCount + second.movesCount,
    startTileId: first.startTileId,
    endTileId: second.endTileId,
    evidence: capRefs([...first.evidence, ...second.evidence]),
    recordKind: "compressed_pattern",
    confidence: round2(Math.max(0.4, Math.min(first.confidence, second.confidence) - 0.05)),
    merged: true,
    mergedSpanCount: first.mergedSpanCount + second.mergedSpanCount,
  };
}

// ---------------------------------------------------------------------------
// Terminal records (a band's end is itself durable history)
// ---------------------------------------------------------------------------

function recordTerminalHistory(
  world: WorldState,
  band: Band,
  history: BandDeepHistoryState,
): BandDeepHistoryState {
  const viability = band.viability;
  const absorbed = viability?.status === "absorbed";
  const terminalTrace = [...band.causalTraces]
    .reverse()
    .find((trace) => trace.kind === "band_absorbed" || trace.kind === "band_extinct");
  const endYear = terminalTrace?.time.year ?? world.time.year;
  const evidence: HistoryEvidenceRef[] = [
    {
      kind: "viability_record",
      ids: (viability?.reasonIds ?? []).slice(-C.MAX_EVIDENCE_IDS_PER_REF).map(String),
    },
  ];
  const terminalRecord: BandTerminalRecord = {
    year: endYear,
    cause: absorbed ? "absorbed" : "collapsed",
    absorbedByBandId: viability?.absorbedByBandId,
    populationAtEnd: (absorbed ? viability?.populationTransferred : viability?.populationRemoved) ?? 0,
    evidence,
  };
  const terminalEpisode: BandHistoricalEpisode = {
    id: `episode:${String(band.id)}:${absorbed ? "band_absorbed_end" : "band_collapsed_end"}:${endYear}`,
    type: absorbed ? "band_absorbed_end" : "band_collapsed_end",
    startYear: endYear,
    endYear,
    ongoing: false,
    severity: 1,
    relatedBandId: viability?.absorbedByBandId,
    summary: absorbed
      ? `the band's last ${terminalRecord.populationAtEnd} people joined another band`
      : `the band scattered and its ${terminalRecord.populationAtEnd} people were lost`,
    detail: { populationAtEnd: terminalRecord.populationAtEnd, year: endYear },
    evidence,
    recordKind: "recorded_event",
    confidence: 1,
    occurrenceCount: 1,
    lastUpdatedYear: endYear,
    provenance: "lived",
  };
  let eras = history.eras;

  if (history.openEra !== undefined) {
    eras = [...eras, closeEra(band.id, history.openEra, "terminal", endYear, band.position)];
  }

  let erasMergedCount = history.caps.erasMergedCount;

  while (eras.length > C.MAX_ERA_RECORDS) {
    eras = [mergeEras(eras[0], eras[1]), ...eras.slice(2)];
    erasMergedCount += 1;
  }

  const { episodes, droppedCount } = capEpisodes(
    [...history.episodes.map((episode) => (episode.ongoing ? { ...episode, ongoing: false, endYear: episode.lastUpdatedYear } : episode)), terminalEpisode].sort(
      (left, right) => (left.startYear - right.startYear) || left.id.localeCompare(right.id),
    ),
  );
  const next: BandDeepHistoryState = {
    ...history,
    eras,
    openEra: undefined,
    episodes,
    terminalRecord,
    caps: makeCaps(erasMergedCount, history.caps.episodesDroppedCount + droppedCount, true),
    lastAdvancedYear: world.time.year,
    payloadBytesEstimate: 0,
  };

  return finalizeCappedHistoryState(next, erasMergedCount, history.caps.episodesDroppedCount + droppedCount);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function finalizeCappedHistoryState(
  state: BandDeepHistoryState,
  erasMergedCount: number,
  episodesDroppedCount: number,
): BandDeepHistoryState {
  let eras = [...state.eras];
  let episodes = [...state.episodes];
  let mergedCount = erasMergedCount;
  let droppedCount = episodesDroppedCount;
  let next: BandDeepHistoryState = {
    ...state,
    eras,
    episodes,
    caps: makeCaps(mergedCount, droppedCount, true),
    payloadBytesEstimate: 0,
  };

  while (eras.length > C.MAX_ERA_RECORDS) {
    eras = [mergeEras(eras[0], eras[1]), ...eras.slice(2)];
    mergedCount += 1;
    next = { ...next, eras, caps: makeCaps(mergedCount, droppedCount, true), payloadBytesEstimate: 0 };
  }

  let payloadBytesEstimate = estimatePayloadBytes(next);

  while (payloadBytesEstimate > C.PAYLOAD_SOFT_CAP_BYTES && eras.length > 1) {
    eras = [mergeEras(eras[0], eras[1]), ...eras.slice(2)];
    mergedCount += 1;
    next = { ...next, eras, caps: makeCaps(mergedCount, droppedCount, true), payloadBytesEstimate: 0 };
    payloadBytesEstimate = estimatePayloadBytes(next);
  }

  while (payloadBytesEstimate > C.PAYLOAD_SOFT_CAP_BYTES && episodes.length > 0) {
    episodes = dropLeastSignificantEpisode(episodes);
    droppedCount += 1;
    next = { ...next, episodes, caps: makeCaps(mergedCount, droppedCount, true), payloadBytesEstimate: 0 };
    payloadBytesEstimate = estimatePayloadBytes(next);
  }

  const capsHeld =
    eras.length <= C.MAX_ERA_RECORDS &&
    episodes.length <= C.MAX_EPISODES &&
    state.inheritedEpisodes.length <= C.MAX_INHERITED_EPISODES &&
    state.inheritedEraSummaries.length <= C.MAX_INHERITED_ERA_SUMMARIES &&
    state.ancestryLine.length <= C.MAX_ANCESTRY_ENTRIES &&
    payloadBytesEstimate <= C.PAYLOAD_SOFT_CAP_BYTES;

  return {
    ...next,
    caps: makeCaps(mergedCount, droppedCount, capsHeld),
    payloadBytesEstimate,
  };
}

function dropLeastSignificantEpisode(
  episodes: readonly BandHistoricalEpisode[],
): BandHistoricalEpisode[] {
  const drop = [...episodes].sort((left, right) => {
    const scoreDiff = episodeSignificance(left) - episodeSignificance(right);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return right.id.localeCompare(left.id);
  })[0];

  if (drop === undefined) {
    return [...episodes];
  }

  return episodes.filter((episode) => episode.id !== drop.id);
}

function makeCaps(erasMergedCount: number, episodesDroppedCount: number, capsHeld: boolean): BandDeepHistoryCaps {
  return {
    maxEraRecords: C.MAX_ERA_RECORDS,
    maxEpisodes: C.MAX_EPISODES,
    maxInheritedEpisodes: C.MAX_INHERITED_EPISODES,
    maxInheritedEraSummaries: C.MAX_INHERITED_ERA_SUMMARIES,
    maxAncestryEntries: C.MAX_ANCESTRY_ENTRIES,
    erasMergedCount,
    episodesDroppedCount,
    capsHeld,
  };
}

function deriveKnownBreadth(band: Band): number {
  const observed = Object.keys(band.knowledge.observedTiles).length;
  const compressed = band.knowledge.compressedKnownTileSummaries.reduce(
    (sum, summary) => sum + summary.tileCount,
    0,
  );
  const areas = band.knowledge.knownAreaSummaries.reduce((sum, summary) => sum + summary.tileCount, 0);

  return observed + compressed + areas;
}

function isChronicHunger(classification: SeasonalHungerClassification | undefined): boolean {
  return (
    classification === "chronic_food_deficit" ||
    classification === "chronic_plus_seasonal_stress" ||
    classification === "crisis_deficit"
  );
}

function isWaterStress(classification: SeasonalHungerClassification | undefined): boolean {
  return classification === "seasonal_water_stress" || classification === "chronic_water_deficit";
}

function isRecovery(classification: SeasonalHungerClassification | undefined): boolean {
  // Only true post-crisis recovery counts as a "recovery year" — the routine
  // seasonal_pulse_recovery pattern is normal seasonality, not a hardship arc.
  return classification === "recovery_after_crisis";
}

function tileChebyshevDistance(world: WorldState, left: TileId, right: TileId): number {
  const leftTile = getTile(world, left);
  const rightTile = getTile(world, right);

  if (leftTile === undefined || rightTile === undefined) {
    return 0;
  }

  return Math.max(
    Math.abs(leftTile.coord.x - rightTile.coord.x),
    Math.abs(leftTile.coord.y - rightTile.coord.y),
  );
}

function capRefs(refs: readonly HistoryEvidenceRef[]): readonly HistoryEvidenceRef[] {
  return refs
    .filter((ref) => ref.ids.length > 0)
    .slice(0, C.MAX_EVIDENCE_REFS)
    .map((ref) => ({ kind: ref.kind, ids: ref.ids.slice(0, C.MAX_EVIDENCE_IDS_PER_REF) }));
}

function estimatePayloadBytes(state: BandDeepHistoryState): number {
  return byteLengthUtf8(JSON.stringify(state));
}

function byteLengthUtf8(text: string): number {
  let bytes = 0;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.codePointAt(index) ?? 0;

    if (code > 0xffff) {
      index += 1;
    }

    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }

  return bytes;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundOptional(value: number | undefined): number | undefined {
  return value === undefined ? undefined : round2(value);
}

function compareBands(left: Band, right: Band): number {
  return String(left.id).localeCompare(String(right.id));
}
