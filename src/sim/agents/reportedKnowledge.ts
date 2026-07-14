import type { BandId, ReasonId, TickNumber, TileId } from "../core/types";
import type { Action, NormalizedIntensity, ResourceScoutKind } from "../rules/types";
import type { ResourceClassId } from "./resourceClasses";
import { getTile } from "../world/generate";
import type { Tile, WorldState } from "../world/types";
import type { TickContextCache } from "./contextCache";
import type {
  Band,
  IntraSeasonTripRecord,
  KnownBandContactMemory,
  LandscapeVisibilityCueKind,
  ReportContactMechanism,
  ReportDistortionLevel,
  ReportReplyGrounding,
  ReportReplyStatus,
  ReportedKnowledgeDirectionFromReceiver,
  ReportedKnowledgePrecision,
  ReportedKnowledgeRegionKind,
  ReportedKnowledgeRegionTarget,
  ReportedKnowledgeSourceBasis,
  ReportedKnowledgeSpeculation,
  ReportedKnowledgeSpeculationDisposition,
  ReportedKnowledgeSpeculationHypothesis,
  ReportReceiverDisposition,
  ReportedKnowledgeState,
  ReportedKnowledgeTopic,
  ReportTrustBasis,
  ReportSourceBiasKind,
  TravelCorridorMemory,
  WordOfMouthReport,
} from "./types";

const REPORT_RING_LIMIT = 16;
const REPORT_MAX_AGE_TICKS = 160;
const REPORT_SOURCE_FACT_LIMIT = 6;
const REPORT_SOURCE_SEND_LIMIT = 2;
const REPORT_RECEIVE_LIMIT = 2;
const REPORT_RECEIVER_LIMIT = 8;
const REPORT_BIAS_MAX = 0.14;
const INTERNAL_REPORT_SEND_LIMIT = 3;
const SPECULATION_RING_LIMIT = 8;
const SPECULATION_MAX_AGE_TICKS = 120;
const REPORT_REGION_MATCH_EXTRA_RADIUS = 1;
const SOURCE_FACT_CATEGORY_SCAN_LIMIT = REPORT_SOURCE_FACT_LIMIT * 2;
const REPORT_EVIDENCE_REFRESH_INTERVAL_TICKS = 4;
const INTERNAL_REPORT_REFRESH_INTERVAL_TICKS = 2;

export type ReportedKnowledgePerfPhase =
  | "activeBandCollection"
  | "childrenByParent"
  | "sourceFactGeneration"
  | "sourceCandidateSelection"
  | "interBandTransmission"
  | "reportRefresh"
  | "regionMatching"
  | "evidenceScanning"
  | "confirmationContradiction"
  | "internalReportGeneration"
  | "mergeDedupRetain"
  | "speculationRefresh"
  | "speculationGeneration"
  | "speculationRetain";

export interface ReportedKnowledgeProfiler {
  measure<T>(phase: ReportedKnowledgePerfPhase, operation: () => T): T;
  count(name: string, amount?: number): void;
}

function profileReportedKnowledge<T>(
  profiler: ReportedKnowledgeProfiler | undefined,
  phase: ReportedKnowledgePerfPhase,
  operation: () => T,
): T {
  return profiler === undefined ? operation() : profiler.measure(phase, operation);
}

function countReportedKnowledge(
  profiler: ReportedKnowledgeProfiler | undefined,
  name: string,
  amount = 1,
): void {
  profiler?.count(name, amount);
}

function selectTopN<T>(
  items: readonly T[],
  limit: number,
  compare: (left: T, right: T) => number,
): readonly T[] {
  if (items.length <= limit) {
    return [...items].sort(compare);
  }

  const selected: T[] = [];

  for (const item of items) {
    selected.push(item);
    selected.sort(compare);

    if (selected.length > limit) {
      selected.pop();
    }
  }

  return selected;
}

interface SourceReportFact {
  readonly topic: ReportedKnowledgeTopic;
  readonly targetTileId?: TileId;
  readonly targetApproxRegion?: string;
  readonly sourceBasis: ReportedKnowledgeSourceBasis;
  readonly confidence: NormalizedIntensity;
  readonly lastNotedTick: TickNumber;
  readonly hops?: number;
  readonly originalObserverBandId?: BandId;
  readonly sourceReportId?: string;
  readonly reasonIds: readonly ReasonId[];
}

interface ReportReceiverCandidate {
  readonly band: Band;
  readonly trustBasis: ReportTrustBasis;
  readonly trust: NormalizedIntensity;
  readonly contactMechanism: ReportContactMechanism;
  readonly contactDistanceTiles?: number;
  readonly relayHopCount: number;
}

interface RetainedReportsResult {
  readonly reports: readonly WordOfMouthReport[];
  readonly expiredOrFadedCount: number;
  readonly mergedSimilarCount: number;
}

type ReportPatchMemory = NonNullable<Band["resourceKnowledgeState"]>["patchMemories"][number];
type ReportPlaceMemory = Band["placeMemory"][TileId];
type ParsedTileCoord = { readonly x: number; readonly y: number };

interface ReportEvidenceIndex {
  readonly observedTileIds: readonly TileId[];
  readonly patchMemories: readonly ReportPatchMemory[];
  readonly placeMemories: readonly ReportPlaceMemory[];
  readonly recentTrips: readonly IntraSeasonTripRecord[];
  readonly travelCorridors: readonly TravelCorridorMemory[];
  readonly regionMatchCache: Map<string, boolean>;
  readonly tileCoordCache: Map<string, ParsedTileCoord | undefined>;
}

interface ReportEvidenceCounts {
  readonly evidenceCount: number;
  readonly contradictionCount: number;
}

export interface ReportedKnowledgeTargetBias {
  readonly bias: NormalizedIntensity;
  readonly opportunityBias: NormalizedIntensity;
  readonly cautionPenalty: NormalizedIntensity;
  readonly matchedReportIds: readonly string[];
  readonly matchedTopics: readonly ReportedKnowledgeTopic[];
}

export function advanceReportedKnowledge(
  world: WorldState,
  cache: TickContextCache,
  profiler?: ReportedKnowledgeProfiler,
): WorldState {
  const activeBands = profileReportedKnowledge(profiler, "activeBandCollection", () =>
    cache.activeBandIds
      .map((bandId) => world.bands[bandId])
      .filter((band): band is Band => band !== undefined)
      .sort(compareBands),
  );
  countReportedKnowledge(profiler, "activeBandsVisited", activeBands.length);

  if (
    activeBands.length > 0 &&
    activeBands.every((band) => band.reportedKnowledge?.lastUpdatedTick === world.time.tick)
  ) {
    countReportedKnowledge(profiler, "alreadyUpdatedEarlyReturn");
    return world;
  }

  const childrenByParent = profileReportedKnowledge(profiler, "childrenByParent", () => buildChildrenByParent(activeBands));
  const incomingByReceiver = new Map<BandId, WordOfMouthReport[]>();
  const sourceBiasWithheldByReceiver = new Map<BandId, number>();

  for (const source of activeBands) {
    const facts = profileReportedKnowledge(
      profiler,
      "sourceFactGeneration",
      () => deriveSourceFacts(world, source),
    ).slice(0, REPORT_SOURCE_FACT_LIMIT);
    countReportedKnowledge(profiler, "sourceFactsProcessed", facts.length);

    if (facts.length === 0) {
      continue;
    }

    const receivers = profileReportedKnowledge(
      profiler,
      "sourceCandidateSelection",
      () => deriveReportReceivers(world, source, cache, childrenByParent),
    ).slice(0, REPORT_RECEIVER_LIMIT);
    countReportedKnowledge(profiler, "sourceCandidatesProcessed", receivers.length);
    let sentBySource = 0;

    profileReportedKnowledge(profiler, "interBandTransmission", () => {
      for (const receiver of receivers) {
        if (sentBySource >= REPORT_SOURCE_SEND_LIMIT) {
          break;
        }

        const currentIncoming = incomingByReceiver.get(receiver.band.id) ?? [];

        if (currentIncoming.length >= REPORT_RECEIVE_LIMIT) {
          continue;
        }

        const fact = selectFactForReceiver(source, receiver.band, facts, world.time.tick);

        if (fact === undefined || !passesReportTransmissionCadence(source, receiver, fact, world.time.tick)) {
          continue;
        }

        if (shouldWithholdSourceBiasedReport(source, receiver, fact, world.time.tick)) {
          sourceBiasWithheldByReceiver.set(
            receiver.band.id,
            (sourceBiasWithheldByReceiver.get(receiver.band.id) ?? 0) + 1,
          );
          countReportedKnowledge(profiler, "sourceBiasReportsWithheld");
          continue;
        }

        const priorReports = receiver.band.reportedKnowledge?.reports ?? [];

        if (hasRecentSimilarReport(priorReports, source.id, fact, world.time.tick)) {
          continue;
        }

        const report = makeReport(world, source, receiver, fact);
        incomingByReceiver.set(receiver.band.id, [...currentIncoming, report]);
        sentBySource += 1;
        countReportedKnowledge(profiler, "interBandReportsCreated");
      }
    });
  }

  let changed = false;
  const bands: Record<string, Band> = { ...world.bands };

  for (const band of activeBands) {
    const previous = band.reportedKnowledge;

    if (previous?.lastUpdatedTick === world.time.tick) {
      continue;
    }

    const previousReports = previous?.reports ?? [];
    countReportedKnowledge(profiler, "reportsProcessed", previousReports.length);
    const fullEvidenceRefresh = shouldRunCadenceForBand(
      band.id,
      world.time.tick,
      REPORT_EVIDENCE_REFRESH_INTERVAL_TICKS,
    );
    const internalReportRefresh = shouldRunCadenceForBand(
      band.id,
      world.time.tick,
      INTERNAL_REPORT_REFRESH_INTERVAL_TICKS,
    );
    const evidenceIndex = fullEvidenceRefresh ? buildReportEvidenceIndex(band) : undefined;
    countReportedKnowledge(profiler, fullEvidenceRefresh ? "fullEvidenceRefreshBands" : "cheapLifecycleRefreshBands");
    const refreshed = profileReportedKnowledge(
      profiler,
      "reportRefresh",
      () => refreshReports(previousReports, world.time.tick, band, evidenceIndex, profiler),
    );
    const refreshedDroppedCount = Math.max(0, previousReports.length - refreshed.length);
    const internal = internalReportRefresh
      ? profileReportedKnowledge(
          profiler,
          "internalReportGeneration",
          () => deriveInternalReports(world, band, refreshed),
        )
      : [];
    countReportedKnowledge(profiler, "internalReportsCreated", internal.length);
    const incoming = [...internal, ...(incomingByReceiver.get(band.id) ?? [])];
    const retainedReports = profileReportedKnowledge(
      profiler,
      "mergeDedupRetain",
      () => retainReportsWithStats([...refreshed, ...incoming], world.time.tick),
    );
    const reports = retainedReports.reports;
    const refreshedSpeculations = profileReportedKnowledge(
      profiler,
      "speculationRefresh",
      () => refreshSpeculations(previous?.speculations ?? [], reports, world.time.tick),
    );
    const newSpeculations = profileReportedKnowledge(
      profiler,
      "speculationGeneration",
      () => evidenceIndex === undefined ? [] : deriveSpeculations(world, band, reports, evidenceIndex, profiler),
    );
    const speculations = profileReportedKnowledge(
      profiler,
      "speculationRetain",
      () => retainSpeculations([...refreshedSpeculations, ...newSpeculations], world.time.tick),
    );

    const sourceBiasWithheldCount =
      (previous?.sourceBiasWithheldCount ?? 0) + (sourceBiasWithheldByReceiver.get(band.id) ?? 0);

    if (
      reports.length === 0 &&
      speculations.length === 0 &&
      previous === undefined &&
      incoming.length === 0 &&
      sourceBiasWithheldCount === 0
    ) {
      continue;
    }

    const internalIncomingCount = incoming.filter((report) => report.trustBasis === "internal_band").length;
    const interBandIncomingCount = incoming.length - internalIncomingCount;
    const generatedCount = (previous?.generatedCount ?? 0) + incoming.length;
    const receivedCount = (previous?.receivedCount ?? 0) + incoming.length;
    const misleadingCount =
      (previous?.misleadingCount ?? 0) +
      incoming.filter((report) =>
        report.distortionLevel === "wrong_or_misleading" ||
        (report.sourceBiasKind !== undefined && report.sourceBiasKind !== "none"),
      ).length;
    const partiallyConfirmedCount = reports.filter(isReportConfirmedLike).length;
    const contradictedCount = reports.filter(isReportContradictedLike).length;
    const staleCount = reports.filter(isReportStaleLike).length;

    bands[band.id] = {
      ...band,
      reportedKnowledge: {
        reports,
        speculations: speculations.length > 0 ? speculations : undefined,
        lastUpdatedTick: world.time.tick,
        generatedCount,
        internalGeneratedCount: (previous?.internalGeneratedCount ?? 0) + internalIncomingCount,
        interBandGeneratedCount: (previous?.interBandGeneratedCount ?? 0) + interBandIncomingCount,
        receivedCount,
        checkedByProbeCount: previous?.checkedByProbeCount ?? 0,
        actedOnCount: previous?.actedOnCount ?? 0,
        misleadingCount,
        sourceBiasWithheldCount,
        partiallyConfirmedCount,
        contradictedCount,
        staleCount,
        expiredOrFadedCount:
          (previous?.expiredOrFadedCount ?? 0) + refreshedDroppedCount + retainedReports.expiredOrFadedCount,
        mergedSimilarCount: (previous?.mergedSimilarCount ?? 0) + retainedReports.mergedSimilarCount,
      },
    };
    changed = true;
  }

  return changed ? { ...world, bands: bands as Readonly<Record<BandId, Band>> } : world;
}

export function deriveReportedKnowledgeTargetBias(
  band: Band,
  targetTileId: TileId,
  input: {
    readonly currentTick: TickNumber;
    readonly targetKnown: boolean;
    readonly routeEvidence: boolean;
    readonly localEvidence?: boolean;
  },
): ReportedKnowledgeTargetBias {
  const reports = band.reportedKnowledge?.reports ?? [];
  const matched: WordOfMouthReport[] = [];
  let opportunityBias = 0;
  let cautionPenalty = 0;

  for (const report of reports) {
    if (!reportMatchesTile(report, targetTileId) || report.receiverDisposition === "ignored") {
      continue;
    }

    const usableEvidence = input.targetKnown || input.routeEvidence || input.localEvidence === true;

    if (!usableEvidence) {
      continue;
    }

    const age = Math.max(0, Number(input.currentTick) - Number(report.tickReceived));
    const freshness = clamp01(report.freshness - age / REPORT_MAX_AGE_TICKS);
    const trustWeight = trustWeightForBasis(report.trustBasis);
    const strength = clamp01(report.confidence * 0.56 + freshness * 0.24 + trustWeight * 0.2);
    const dispositionWeight = dispositionBiasWeight(report.receiverDisposition);
    const uncertaintyWeight = isReportContradictedLike(report)
      ? 0
      : isReportStaleLike(report)
        ? 0.18
        : isReportConfirmedLike(report)
          ? 0.92
          : 0.7;

    if (isPositiveOpportunityTopic(report.topic)) {
      opportunityBias = Math.max(opportunityBias, strength * dispositionWeight * uncertaintyWeight * REPORT_BIAS_MAX);
    } else if (isWarningTopic(report.topic)) {
      cautionPenalty = Math.max(cautionPenalty, strength * uncertaintyWeight * 0.1);
    }

    matched.push(report);
  }

  for (const speculation of band.reportedKnowledge?.speculations ?? []) {
    if (!speculationMatchesTile(speculation, targetTileId)) {
      continue;
    }

    const usableEvidence = input.targetKnown || input.routeEvidence || input.localEvidence === true;
    if (!usableEvidence) {
      continue;
    }

    const dispositionWeight = speculationDispositionBiasWeight(speculation.receiverDisposition);
    const speculationBias = clamp01(speculation.confidence * dispositionWeight) * 0.07;
    if (isPositiveSpeculation(speculation.hypothesis)) {
      opportunityBias = Math.max(opportunityBias, speculationBias);
    } else {
      cautionPenalty = Math.max(cautionPenalty, speculationBias * 0.7);
    }
  }

  return {
    bias: round2(clamp01(opportunityBias) - clamp01(cautionPenalty)),
    opportunityBias: round2(clamp01(opportunityBias)),
    cautionPenalty: round2(clamp01(cautionPenalty)),
    matchedReportIds: matched.map((report) => report.reportId),
    matchedTopics: [...new Set(matched.map((report) => report.topic))].sort(),
  };
}

export function advanceReportedKnowledgeAfterDecision(
  state: ReportedKnowledgeState | undefined,
  input: {
    readonly action: Action;
    readonly tick: TickNumber;
    readonly observedTileIds: readonly TileId[];
    readonly moved: boolean;
  },
): ReportedKnowledgeState | undefined {
  if (state === undefined || state.reports.length === 0) {
    return state;
  }

  const targetTileId = getActionTargetTileId(input.action);
  let checkedAdded = 0;
  let actedAdded = 0;
  const observed = new Set<TileId>(input.observedTileIds);
  const reports = state.reports.map((report) => {
    if (targetTileId === undefined && report.targetTileId === undefined) {
      return report;
    }

    const observedMatches =
      report.targetTileId !== undefined && observed.has(report.targetTileId);
    const targetMatches =
      (targetTileId !== undefined && reportMatchesTile(report, targetTileId)) ||
      observedMatches ||
      [...observed].some((tileId) => reportMatchesTile(report, tileId));

    if (!targetMatches) {
      return report;
    }

    if (input.action.type === "logistical_probe" || input.action.type === "resource_scout") {
      if (!isAlreadyCheckedOrResolved(report.receiverDisposition)) {
        checkedAdded += 1;
      }

      return { ...report, receiverDisposition: "checked_by_probe" as const };
    }

    if (input.moved && (input.action.type === "move_to_tile" || input.action.type === "explore_unknown_neighbor")) {
      if (targetTileId !== report.targetTileId) {
        return report;
      }

      if (report.receiverDisposition !== "acted_on" && !isAlreadyCheckedOrResolved(report.receiverDisposition)) {
        actedAdded += 1;
      }

      return { ...report, receiverDisposition: "acted_on" as const };
    }

    return report;
  });

  let speculationChecked = false;
  const speculations = state.speculations?.map((speculation) => {
    const targetMatches =
      targetTileId !== undefined &&
      (speculation.regionTarget.approximateCenterTile === targetTileId ||
        regionTargetMatchesTile(speculation.regionTarget, targetTileId));

    if (!targetMatches || (input.action.type !== "logistical_probe" && input.action.type !== "resource_scout")) {
      return speculation;
    }

    speculationChecked = true;
    return { ...speculation, receiverDisposition: "checked_by_probe" as const };
  });

  if (checkedAdded === 0 && actedAdded === 0) {
    return speculationChecked ? { ...state, speculations } : state;
  }

  return {
    ...state,
    reports,
    speculations,
    checkedByProbeCount: state.checkedByProbeCount + checkedAdded,
    actedOnCount: state.actedOnCount + actedAdded,
    lastUpdatedTick: input.tick,
  };
}

function isAlreadyCheckedOrResolved(disposition: ReportReceiverDisposition): boolean {
  return (
    disposition === "checked_by_probe" ||
    disposition === "acted_on" ||
    disposition === "partially_confirmed" ||
    disposition === "contradicted" ||
    disposition === "stale"
  );
}

function deriveInternalReports(
  world: WorldState,
  band: Band,
  previousReports: readonly WordOfMouthReport[],
): readonly WordOfMouthReport[] {
  const candidates: WordOfMouthReport[] = [];
  const add = (
    topic: ReportedKnowledgeTopic,
    targetTileId: TileId | undefined,
    sourceBasis: ReportedKnowledgeSourceBasis,
    confidence: number,
    lastNotedTick: TickNumber,
    reasonIds: readonly ReasonId[],
    precision: ReportedKnowledgePrecision = "exact_observed_area",
  ) => {
    if (candidates.length >= INTERNAL_REPORT_SEND_LIMIT * 3) {
      return;
    }

    if (Number(world.time.tick) - Number(lastNotedTick) > 16 || confidence <= 0.28) {
      return;
    }

    const regionTarget = makeRegionTarget(world, band, topic, targetTileId, precision);
    const report = makeInternalReport(world, band, topic, targetTileId, regionTarget, sourceBasis, confidence, lastNotedTick, reasonIds);

    if (hasRecentSimilarInternalReport([...previousReports, ...candidates], report, world.time.tick)) {
      return;
    }

    candidates.push(report);
  };

  for (const trip of selectTopN(band.recentIntraSeasonTrips ?? [], 10, compareTrips)) {
    const topic = topicForTrip(world, band, trip);
    if (topic === undefined) {
      continue;
    }
    add(
      topic,
      trip.targetTileId,
      sourceBasisForTrip(trip, topic),
      confidenceForTripTalk(trip),
      trip.tick,
      [
        `reason:reported_internal_trip:${String(band.id)}:${Number(trip.day)}:${topic}:${String(trip.targetTileId)}` as ReasonId,
        ...trip.reasonIds.slice(0, 2),
      ],
      precisionForTrip(trip),
    );
  }

  const scout = band.lastResourceScout;
  if (scout !== undefined) {
    const topic = topicForScout(scout.scoutKind, scout.targetResourceClass, scout.outcome, scout.contradictionKind);
    if (topic !== undefined) {
      add(
        topic,
        scout.targetTile,
        "scout_return",
        clamp01(scout.confidenceAfter * 0.56 + scout.expectedInfoValue * 0.24 + (scout.memoryUpdated ? 0.12 : 0)),
        scout.tick as TickNumber,
        [
          `reason:reported_internal_scout:${String(band.id)}:${Number(scout.tick)}:${topic}:${String(scout.targetTile)}` as ReasonId,
          ...scout.learning.reasonIds.slice(0, 2),
        ],
        scout.partialConfirmContradict ? "approximate_region" : "exact_observed_area",
      );
    }
  }

  for (const crossing of selectTopN(
    Object.values(band.crossingMemories).filter((memory) => memory.useCount > 0 && memory.successConfidence > 0.34),
    3,
    (left, right) => Number(right.lastUsedAt.tick) - Number(left.lastUsedAt.tick) || compareTileIds(left.crossingTileA, right.crossingTileA),
  )) {
    add(
      "ford_or_crossing_known",
      selectKnownEndpoint(band, crossing.crossingTileA, crossing.crossingTileB),
      "crossing_party",
      crossing.successConfidence,
      crossing.lastUsedAt.tick,
      crossing.reasonIds,
      "approximate_region",
    );
  }

  for (const corridor of selectTopN(
    Object.values(band.travelCorridors).filter((memory) => memory.confidence > 0.34),
    3,
    (left, right) => Number(right.lastUsedAt.tick) - Number(left.lastUsedAt.tick) || String(left.id).localeCompare(String(right.id)),
  )) {
    const from = getTile(world, corridor.fromTileId);
    const to = getTile(world, corridor.toTileId);
    const targetTileId = to?.hasCreek === true ? to.id : from?.hasCreek === true ? from.id : corridor.toTileId;
    const topic: ReportedKnowledgeTopic =
      from?.hasCreek === true || to?.hasCreek === true
        ? "creek_valley_hint"
        : to?.terrainKind === "mountains" || from?.terrainKind === "mountains"
          ? "possible_pass_through_hills"
          : "tributary_route_hint";
    add(
      topic,
      targetTileId,
      "route_followers",
      clamp01(corridor.confidence * 0.8 + Math.min(0.14, corridor.useCount * 0.03)),
      corridor.lastUsedAt.tick,
      [`reason:reported_internal_corridor:${String(band.id)}:${String(corridor.id)}:${topic}` as ReasonId],
      "vague_direction",
    );
  }

  for (const event of (band.recentRangeFrictionEvents ?? []).slice(0, 3)) {
    const topic: ReportedKnowledgeTopic =
      event.interpretation === "crowded_water_place"
        ? "crowded_water_warning"
        : event.interpretation === "avoid_warning_remembered"
          ? "outsider_use_warning"
          : event.tensionLevel === "mild" || event.tensionLevel === "moderate_placeholder"
            ? "outsider_use_warning"
            : "unknown_story_or_guess";
    add(
      topic,
      event.tileId,
      "range_friction_report",
      event.tensionLevel === "none" ? 0.34 : 0.58,
      event.tick,
      [
        `reason:reported_internal_range_friction:${String(band.id)}:${event.eventId}:${topic}` as ReasonId,
        ...event.reasonIds.slice(0, 2),
      ],
      "approximate_region",
    );
  }

  for (const cue of selectTopN(
    (band.visibleLandscapeCues ?? []).filter((entry) => entry.status !== "stale" && entry.confidence > 0.36),
    3,
    (left, right) => right.confidence - left.confidence || left.cueId.localeCompare(right.cueId),
  )) {
    const topic = topicForVisibleLandscapeCue(cue.kind);
    add(
      topic,
      cue.approximateTileId,
      "visible_landscape_cue",
      clamp01(cue.confidence * 0.72),
      cue.tick,
      [
        `reason:reported_internal_visible_landscape:${String(band.id)}:${cue.cueId}:${topic}` as ReasonId,
        ...cue.reasonIds.slice(0, 1),
      ],
      "vague_direction",
    );
  }

  for (const move of (band.recentResidentialMoveEvents ?? []).slice(0, 2)) {
    const topic: ReportedKnowledgeTopic =
      move.status === "arrived" && move.confidence > 0.48
        ? move.cause === "known_opportunity" || move.cause === "frontier_intent"
          ? "good_camp_region"
          : "return_to_known_place"
        : "unknown_story_or_guess";
    add(
      topic,
      move.toTileId,
      "recent_movers",
      move.confidence,
      move.tick,
      [`reason:reported_internal_residential_move:${String(band.id)}:${move.eventId}:${topic}` as ReasonId],
      "approximate_region",
    );
  }

  addCampLifeReports(world, band, add);

  return candidates
    .sort((left, right) =>
      reportRetentionScore(right, world.time.tick) - reportRetentionScore(left, world.time.tick) ||
      left.reportId.localeCompare(right.reportId),
    )
    .slice(0, INTERNAL_REPORT_SEND_LIMIT);
}

function makeInternalReport(
  world: WorldState,
  band: Band,
  topic: ReportedKnowledgeTopic,
  targetTileId: TileId | undefined,
  regionTarget: ReportedKnowledgeRegionTarget,
  sourceBasis: ReportedKnowledgeSourceBasis,
  confidence: number,
  lastNotedTick: TickNumber,
  reasonIds: readonly ReasonId[],
): WordOfMouthReport {
  const age = Math.max(0, Number(world.time.tick) - Number(lastNotedTick));
  const freshness = round2(clamp01(1 - age / REPORT_MAX_AGE_TICKS));
  const boundedConfidence = round2(clamp01(confidence * 0.78 + freshness * 0.22));
  const distortionLevel: ReportDistortionLevel =
    regionTarget.precision === "vague_direction" ? "direction_blurred" : boundedConfidence < 0.42 ? "vague" : "none";
  const isVisibleCue = sourceBasis === "visible_landscape_cue";

  return {
    reportId: `internal-report:${String(band.id)}:${Number(world.time.tick)}:${topic}:${regionTarget.regionId}`,
    sourceBandId: band.id,
    receiverBandId: band.id,
    originalObserverBandId: band.id,
    tickCreated: world.time.tick,
    tickReceived: world.time.tick,
    topic,
    targetTileId,
    targetApproxRegion: formatRegionTarget(regionTarget),
    regionTarget,
    sourceBasis,
    confidence: boundedConfidence,
    freshness,
    hops: 0,
    distortionLevel,
    trustBasis: "internal_band",
    receiverDisposition: isVisibleCue
      ? "cautiously_considered"
      : boundedConfidence >= 0.54
        ? "used_as_minor_bias"
        : "remembered_only",
    confirmationStatus: isVisibleCue ? "unconfirmed" : "partially_confirmed",
    evidenceCount: isVisibleCue ? 0 : 1,
    contradictionCount: 0,
    noHiddenTruth: true,
    noDirectUnlock: true,
    noGuaranteedTruth: true,
    noLanguageSystem: true,
    reasonIds,
  };
}

function topicForVisibleLandscapeCue(kind: LandscapeVisibilityCueKind): ReportedKnowledgeTopic {
  switch (kind) {
    case "visible_water":
    case "lake_shore_visible":
    case "river_or_tributary_corridor":
      return "good_water_region";
    case "visible_wetland":
    case "delta_like_area":
      return "good_delta_or_wetland";
    case "greener_lowland":
    case "open_valley":
      return "better_land_speculation";
    case "pass_or_saddle":
    case "higher_ground":
      return "possible_pass_through_hills";
    case "opposite_bank":
      return "safe_side_country";
    case "dry_or_barren_country":
      return "dry_place_warning";
  }
}

function addCampLifeReports(
  world: WorldState,
  band: Band,
  add: (
    topic: ReportedKnowledgeTopic,
    targetTileId: TileId | undefined,
    sourceBasis: ReportedKnowledgeSourceBasis,
    confidence: number,
    lastNotedTick: TickNumber,
    reasonIds: readonly ReasonId[],
    precision?: ReportedKnowledgePrecision,
  ) => void,
): void {
  const labor = band.activityLaborSummary;
  const dependents = Math.max(0, Math.round(band.demography.dependents));
  const elders = Math.max(0, Math.round(band.demography.elders));
  const peopleAtCamp = Math.max(0, Math.round(labor?.peopleAtResidentialCenterEstimate ?? 0));
  const dependencyLoad = clamp01((dependents + elders) / Math.max(1, band.demography.workingAdults + dependents + elders));
  const currentPlace = band.placeMemory[band.position];
  const currentTile = getTile(world, band.position);

  if (
    dependents > 0 &&
    peopleAtCamp > 0 &&
    (currentPlace?.valences.includes("reliable") === true ||
      currentTile?.isRiverbank === true ||
      currentTile?.terrainKind === "lake" ||
      currentTile?.terrainKind === "wetlands")
  ) {
    add(
      "return_to_known_place",
      band.position,
      "dependent_camp_pressure",
      clamp01(0.32 + dependencyLoad * 0.28 + Math.min(0.12, dependents * 0.02)),
      world.time.tick,
      [`reason:reported_internal_dependent_camp_pressure:${String(band.id)}:${Number(world.time.tick)}` as ReasonId],
      "approximate_region",
    );
  }

  const elderMemory = elders <= 0
    ? undefined
    : selectTopN(
        Object.values(band.placeMemory).filter(
          (memory) =>
            memory.confidence > 0.34 &&
            (memory.isReturnPlace ||
              memory.valences.includes("reliable") ||
              memory.valences.includes("seasonally_good") ||
              memory.valences.includes("route_node") ||
              memory.valences.includes("avoid_place")),
        ),
        1,
        (left, right) => placeReportStrength(right) - placeReportStrength(left) || compareTileIds(left.tileId, right.tileId),
      )[0];

  if (elderMemory !== undefined) {
    const topic: ReportedKnowledgeTopic = elderMemory.valences.includes("avoid_place")
      ? "avoid_place"
      : elderMemory.valences.includes("seasonally_good")
        ? "seasonal_opportunity"
        : elderMemory.valences.includes("route_node")
          ? "tributary_route_hint"
          : elderMemory.isReturnPlace
            ? "return_to_known_place"
            : "reliable_water";
    add(
      topic,
      elderMemory.tileId,
      "elder_memory",
      clamp01(elderMemory.confidence * 0.66 + Math.min(0.18, elders * 0.04)),
      world.time.tick,
      [`reason:reported_internal_elder_memory:${String(band.id)}:${String(elderMemory.tileId)}:${topic}` as ReasonId],
      "vague_direction",
    );
  }

  const returnTrendDeclining =
    band.returnTrend?.chronicDecline === true || band.returnTrend?.trendDirection === "declining";
  if (returnTrendDeclining && peopleAtCamp > 0) {
    add(
      "poor_return_region",
      band.position,
      "camp_talk",
      clamp01(0.38 + (band.pressureState?.mobilityPressure ?? 0) * 0.16),
      world.time.tick,
      [`reason:reported_internal_camp_talk_poor_returns:${String(band.id)}:${Number(world.time.tick)}` as ReasonId],
      "approximate_region",
    );
  }
}

function deriveSourceFacts(world: WorldState, band: Band): readonly SourceReportFact[] {
  const facts: SourceReportFact[] = [];

  for (const memory of selectTopN(
    Object.values(band.crossingMemories).filter((entry) => entry.successConfidence > 0.32),
    SOURCE_FACT_CATEGORY_SCAN_LIMIT,
    (left, right) => right.successConfidence - left.successConfidence || compareTileIds(left.crossingTileA, right.crossingTileA),
  )) {
    facts.push({
      topic: "ford_or_crossing",
      targetTileId: selectKnownEndpoint(band, memory.crossingTileA, memory.crossingTileB),
      sourceBasis: "direct_trip_return",
      confidence: clamp01(memory.successConfidence * 0.8 + memory.seasonalReliability * 0.2),
      lastNotedTick: memory.lastUsedAt.tick,
      reasonIds: memory.reasonIds,
    });
  }

  for (const corridor of selectTopN(
    Object.values(band.travelCorridors).filter((entry) => entry.confidence > 0.28),
    SOURCE_FACT_CATEGORY_SCAN_LIMIT,
    (left, right) => right.confidence + right.useCount * 0.04 - (left.confidence + left.useCount * 0.04),
  )) {
    const from = getTile(world, corridor.fromTileId);
    const to = getTile(world, corridor.toTileId);
    const targetTileId = to?.hasCreek === true ? to.id : from?.hasCreek === true ? from.id : corridor.toTileId;

    if (from?.hasCreek === true || to?.hasCreek === true) {
      facts.push({
        topic: "tributary_route",
        targetTileId,
        sourceBasis: "direct_trip_return",
        confidence: clamp01(corridor.confidence * 0.84 + Math.min(0.16, corridor.useCount * 0.03)),
        lastNotedTick: corridor.lastUsedAt.tick,
        reasonIds: [`reason:reported_knowledge:${band.id}:${corridor.id}:tributary_route` as ReasonId],
      });
    }
  }

  for (const memory of selectTopN(
    (band.resourceKnowledgeState?.patchMemories ?? []).filter((entry) => entry.confidence.presenceConfidence > 0.32),
    SOURCE_FACT_CATEGORY_SCAN_LIMIT,
    (left, right) => patchReportStrength(right) - patchReportStrength(left),
  )) {
    const topic = topicForPatch(world, memory.resourceClassId, memory.approximateTile);

    if (topic === undefined) {
      continue;
    }

    facts.push({
      topic,
      targetTileId: memory.approximateTile,
      sourceBasis: "direct_trip_return",
      confidence: patchReportStrength(memory),
      lastNotedTick: memory.lastNotedTick,
      reasonIds: memory.reasonIds,
    });
  }

  for (const memory of selectTopN(
    Object.values(band.placeMemory).filter((entry) => entry.confidence > 0.28),
    SOURCE_FACT_CATEGORY_SCAN_LIMIT,
    (left, right) => placeReportStrength(right) - placeReportStrength(left),
  )) {
    const fact = factForPlaceMemory(memory);

    if (fact !== undefined) {
      facts.push(fact);
    }
  }

  // PERCEPTION-MOBILITY-1 — a band may only frame range pressure SOCIALLY ("crowded
  // range / outsiders") when it has GROUNDED evidence of other bands. Range
  // saturation pressure is mostly the band's OWN population overusing its range;
  // for an isolated band that is ECOLOGICAL self-overuse, NOT foreigners — so it is
  // reworded as poor returns / tired ground, matching the band's actual knowledge.
  const saturationPressure = band.rangeSaturation?.saturationPressure ?? 0;
  const nearbyBandPressure = band.pressureState?.nearbyBandPressure ?? 0;
  const currentPressure = Math.max(saturationPressure, nearbyBandPressure);
  const hasGroundedOtherBandEvidence =
    (band.pressureState?.crowdingBandIds?.length ?? 0) > 0 ||
    nearbyBandPressure > 0.18 ||
    Object.keys(band.contactMemories ?? {}).length > 0 ||
    (band.recentRangeFrictionEvents?.length ?? 0) > 0;

  if (currentPressure > 0.55) {
      facts.push(
        hasGroundedOtherBandEvidence
          ? {
              topic: "crowded_range_warning",
              targetTileId: band.position,
              sourceBasis: "range_shared_use",
              confidence: clamp01(currentPressure),
              lastNotedTick: band.pressureState?.tick ?? world.time.tick,
              reasonIds: [`reason:reported_knowledge:${band.id}:${Number(band.pressureState?.tick ?? 0)}:crowded_range_grounded` as ReasonId],
            }
          : {
              topic: "poor_return_region",
              targetTileId: band.position,
              sourceBasis: "direct_trip_return",
              confidence: clamp01(saturationPressure * 0.85),
              lastNotedTick: band.pressureState?.tick ?? world.time.tick,
              reasonIds: [`reason:reported_knowledge:${band.id}:${Number(band.pressureState?.tick ?? 0)}:self_overuse_ecological` as ReasonId],
            },
      );
    }

  for (const cue of selectTopN(
    (band.visibleLandscapeCues ?? []).filter((entry) => entry.status !== "stale" && entry.confidence > 0.42),
    2,
    (left, right) => right.confidence - left.confidence || left.cueId.localeCompare(right.cueId),
  )) {
    facts.push({
      topic: topicForVisibleLandscapeCue(cue.kind),
      targetTileId: cue.approximateTileId,
      sourceBasis: "visible_landscape_cue",
      confidence: clamp01(cue.confidence * 0.58),
      lastNotedTick: cue.tick,
      reasonIds: [
        `reason:reported_knowledge:${band.id}:${cue.cueId}:visible_landscape` as ReasonId,
        ...cue.reasonIds.slice(0, 1),
      ],
    });
  }

  for (const report of band.reportedKnowledge?.reports ?? []) {
    if (facts.length >= REPORT_SOURCE_FACT_LIMIT * 2) {
      break;
    }

    if (report.hops >= 3 || report.freshness < 0.22 || report.confidence < 0.36) {
      continue;
    }

    facts.push({
      topic: report.topic,
      targetTileId: report.targetTileId ?? report.regionTarget.approximateCenterTile,
      targetApproxRegion: report.targetApproxRegion,
      sourceBasis: "repeated_contact_report",
      confidence: clamp01(report.confidence * report.freshness * 0.74),
      lastNotedTick: report.tickReceived,
      hops: report.hops + 1,
      originalObserverBandId: report.originalObserverBandId ?? report.sourceBandId,
      sourceReportId: report.reportId,
      reasonIds: [
        `reason:reported_knowledge_chain:${String(band.id)}:${report.reportId}` as ReasonId,
        ...report.reasonIds.slice(0, 2),
      ],
    });
  }

  return facts
    .filter((fact) => fact.confidence > 0.25)
    .sort((left, right) =>
      right.confidence === left.confidence
        ? compareReportFactIds(left, right)
        : right.confidence - left.confidence,
    );
}

function deriveReportReceivers(
  world: WorldState,
  source: Band,
  cache: TickContextCache,
  childrenByParent: ReadonlyMap<BandId, readonly Band[]>,
): readonly ReportReceiverCandidate[] {
  const candidates = new Map<BandId, ReportReceiverCandidate>();
  const add = (bandId: BandId | undefined, trustBasis: ReportTrustBasis, trust: number) => {
    if (bandId === undefined || bandId === source.id) {
      return;
    }

    const band = world.bands[bandId];

    if (band === undefined || band.status === "dispersed" || band.viability?.status === "absorbed" || band.viability?.status === "extinct") {
      return;
    }

    const contact = source.contactMemories[band.id];
    const path = deriveReportContactPath(source, band, trustBasis, contact);
    if (path === undefined) {
      return;
    }

    const existing = candidates.get(band.id);
    const adjustedTrust = clamp01(trust * path.trustMultiplier);

    if (existing === undefined || adjustedTrust > existing.trust) {
      candidates.set(band.id, {
        band,
        trustBasis,
        trust: adjustedTrust,
        contactMechanism: path.contactMechanism,
        contactDistanceTiles: path.contactDistanceTiles,
        relayHopCount: path.relayHopCount,
      });
    }
  };

  add(source.parentBandId, "parent", 0.9);

  for (const daughterId of source.daughterBandIds) {
    add(daughterId, "daughter", 0.86);
  }

  const siblings = source.parentBandId === undefined ? [] : childrenByParent.get(source.parentBandId) ?? [];

  for (const sibling of siblings) {
    add(sibling.id, "sibling", 0.78);
  }

  for (const contact of selectTopN(
    Object.values(source.contactMemories),
    6,
    (left, right) => contactScore(right) - contactScore(left),
  )) {
    const basis = trustBasisForContact(contact);
    add(contact.otherBandId, basis, contactTrust(contact));
  }

  for (const nearbyBandId of cache.nearbyBandsByBandId.get(source.id) ?? []) {
    const contact = source.contactMemories[nearbyBandId];
    add(nearbyBandId, contact === undefined ? "stranger" : "weak_contact", contact === undefined ? 0.22 : 0.3);
  }

  return [...candidates.values()].sort((left, right) =>
    right.trust === left.trust
      ? compareBandIds(left.band.id, right.band.id)
      : right.trust - left.trust,
  );
}

function deriveReportContactPath(
  source: Band,
  receiver: Band,
  trustBasis: ReportTrustBasis,
  contact: KnownBandContactMemory | undefined,
): { readonly contactMechanism: ReportContactMechanism; readonly contactDistanceTiles?: number; readonly relayHopCount: number; readonly trustMultiplier: number } | undefined {
  const distance = getTileDistance(source.position, receiver.position);
  const closeEnough = distance !== undefined && distance <= 5;
  const kinTravelRange = distance !== undefined && distance <= 18;

  if (closeEnough) {
    return {
      contactMechanism: "nearby_camp",
      contactDistanceTiles: distance,
      relayHopCount: 0,
      trustMultiplier: 1,
    };
  }

  if (contact !== undefined) {
    if (contact.sharedUseCount >= 2) {
      return {
        contactMechanism: "shared_water_place",
        contactDistanceTiles: distance,
        relayHopCount: 0,
        trustMultiplier: 0.94,
      };
    }
    if (contact.strainedContactCount > 0 || contact.tension > 0.42) {
      return {
        contactMechanism: "range_shared_use",
        contactDistanceTiles: distance,
        relayHopCount: 0,
        trustMultiplier: 0.86,
      };
    }
    if (contact.contactCount > 0) {
      return {
        contactMechanism: "direct_contact_memory",
        contactDistanceTiles: distance,
        relayHopCount: 0,
        trustMultiplier: 0.92,
      };
    }
  }

  if ((trustBasis === "parent" || trustBasis === "daughter") && kinTravelRange) {
    return {
      contactMechanism: "parent_daughter_visit",
      contactDistanceTiles: distance,
      relayHopCount: 0,
      trustMultiplier: 0.88,
    };
  }

  if ((trustBasis === "sibling" || trustBasis === "lineage_kin") && kinTravelRange) {
    return {
      contactMechanism: "sibling_lineage_visit",
      contactDistanceTiles: distance,
      relayHopCount: 0,
      trustMultiplier: 0.82,
    };
  }

  return undefined;
}

function makeReport(
  world: WorldState,
  source: Band,
  receiver: ReportReceiverCandidate,
  fact: SourceReportFact,
): WordOfMouthReport {
  const age = Math.max(0, Number(world.time.tick) - Number(fact.lastNotedTick));
  const freshness = clamp01(1 - age / REPORT_MAX_AGE_TICKS);
  const sourceBiasKind = deriveReportSourceBiasKind(source, receiver, fact, world.time.tick);
  const sourceBiasPenalty = sourceBiasKind === "downplayed_opportunity" || sourceBiasKind === "protective_vagueness"
    ? 0.16
    : sourceBiasKind === "exaggerated_risk" || sourceBiasKind === "stale_warning_repeated"
      ? 0.08
      : 0;
  const confidence = round2(clamp01(fact.confidence * 0.58 + receiver.trust * 0.28 + freshness * 0.14 - sourceBiasPenalty));
  const distortionLevel = sourceBiasDistortion(sourceBiasKind, deriveDistortion(fact, receiver, age, source));
  const sourceBasis = sourceBasisForReceiver(receiver.trustBasis, fact);
  const precision = precisionForReport(fact, receiver, distortionLevel);
  const regionTarget = makeRegionTarget(world, receiver.band, fact.topic, fact.targetTileId, precision);
  const relayHopCount = Math.max(receiver.relayHopCount, Math.max(0, (fact.hops ?? 1) - 1));

  return {
    reportId: `report:${String(source.id)}:${String(receiver.band.id)}:${Number(world.time.tick)}:${fact.topic}:${regionTarget.regionId}`,
    sourceBandId: source.id,
    receiverBandId: receiver.band.id,
    originalObserverBandId: fact.originalObserverBandId ?? source.id,
    tickCreated: world.time.tick,
    tickReceived: world.time.tick,
    topic: fact.topic,
    targetTileId: fact.targetTileId,
    targetApproxRegion: fact.targetApproxRegion ?? formatRegionTarget(regionTarget),
    regionTarget,
    sourceBasis,
    confidence,
    freshness: round2(freshness),
    hops: fact.hops ?? 1,
    distortionLevel,
    trustBasis: receiver.trustBasis,
    contactMechanism: receiver.contactMechanism,
    contactDistanceTiles: receiver.contactDistanceTiles,
    relayHopCount,
    sourceBiasKind,
    sourceBiasReason: sourceBiasReason(sourceBiasKind),
    withheldBySourceBias: false,
    receiverDisposition: deriveReceiverDisposition(receiver.band, fact, confidence),
    confirmationStatus: "unconfirmed",
    evidenceCount: 0,
    contradictionCount: 0,
    noHiddenTruth: true,
    noDirectUnlock: true,
    noGuaranteedTruth: true,
    noLanguageSystem: true,
    reasonIds: [`reason:reported_knowledge:${String(source.id)}:${String(receiver.band.id)}:${Number(world.time.tick)}:${fact.topic}` as ReasonId],
  };
}

function refreshReports(
  reports: readonly WordOfMouthReport[],
  tick: TickNumber,
  band: Band,
  evidenceIndex: ReportEvidenceIndex | undefined,
  profiler?: ReportedKnowledgeProfiler,
): readonly WordOfMouthReport[] {
  return reports
    .map((report) => {
      const age = Math.max(0, Number(tick) - Number(report.tickReceived));
      const freshness = round2(Math.min(report.freshness, clamp01(1 - age / REPORT_MAX_AGE_TICKS)));
      const targetKnown =
        report.targetTileId !== undefined && band.knowledge.observedTiles[report.targetTileId] !== undefined;
      const evidence = evidenceIndex === undefined
        ? { evidenceCount: report.evidenceCount, contradictionCount: report.contradictionCount }
        : profileReportedKnowledge(
            profiler,
            "evidenceScanning",
            () => countReportEvidence(evidenceIndex, report),
          );
      const { confirmationStatus, replyStatus, replyGrounding } = profileReportedKnowledge(profiler, "confirmationContradiction", () => {
        const staleReport = freshness <= 0.12 || age > REPORT_MAX_AGE_TICKS * 0.82;
        const regionObserved =
          evidence.contradictionCount > report.contradictionCount &&
          (targetKnown ||
            (evidenceIndex !== undefined &&
              profileReportedKnowledge(
                profiler,
                "regionMatching",
                () => hasObservedReportRegion(evidenceIndex, report),
              )));
        const reply = deriveReportReply(report, evidence, targetKnown, regionObserved, staleReport);
        return {
          confirmationStatus: reply.confirmationStatus,
          replyStatus: reply.replyStatus,
          replyGrounding: reply.replyGrounding,
        };
      });
      const receiverDisposition =
        confirmationStatus === "partially_confirmed" ||
        confirmationStatus === "confirmed" ||
        confirmationStatus === "strengthened" ||
        confirmationStatus === "corrected"
          ? "partially_confirmed"
          : confirmationStatus === "contradicted" || confirmationStatus === "disputed"
            ? "contradicted"
          : confirmationStatus === "stale" && report.receiverDisposition !== "acted_on"
            ? "stale"
              : targetKnown && report.receiverDisposition === "remembered_only"
                ? "cautiously_considered"
                : report.receiverDisposition;

      return {
        ...report,
        freshness,
        receiverDisposition,
        confirmationStatus,
        replyStatus,
        replyGrounding,
        evidenceCount: Math.max(report.evidenceCount, evidence.evidenceCount),
        contradictionCount: Math.max(report.contradictionCount, evidence.contradictionCount),
      };
    })
    .filter((report) => report.freshness > 0.08 || report.receiverDisposition === "acted_on" || report.receiverDisposition === "checked_by_probe");
}

function retainReportsWithStats(reports: readonly WordOfMouthReport[], tick: TickNumber): RetainedReportsResult {
  const deduped = new Map<string, WordOfMouthReport>();
  let mergedSimilarCount = 0;

  for (const report of reports) {
    const key = reportDedupKey(report);
    const existing = deduped.get(key);
    if (existing === undefined || reportRetentionScore(report, tick) > reportRetentionScore(existing, tick)) {
      deduped.set(key, report);
    }
    if (existing !== undefined) {
      mergedSimilarCount += 1;
    }
  }

  const dedupedReports = [...deduped.values()];
  const ageFiltered = dedupedReports.filter((report) => Number(tick) - Number(report.tickReceived) <= REPORT_MAX_AGE_TICKS);
  const sorted = ageFiltered.sort((left, right) =>
    reportRetentionScore(right, tick) - reportRetentionScore(left, tick) || left.reportId.localeCompare(right.reportId),
  );
  const retained = sorted.slice(0, REPORT_RING_LIMIT);
  const expiredOrFadedCount = dedupedReports.length - ageFiltered.length + Math.max(0, sorted.length - retained.length);

  return {
    reports: retained,
    expiredOrFadedCount,
    mergedSimilarCount,
  };
}

function deriveReportReply(
  report: WordOfMouthReport,
  evidence: ReportEvidenceCounts,
  targetKnown: boolean,
  regionObserved: boolean,
  staleReport: boolean,
): {
  readonly confirmationStatus: WordOfMouthReport["confirmationStatus"];
  readonly replyStatus: ReportReplyStatus;
  readonly replyGrounding: ReportReplyGrounding;
} {
  const newEvidence = evidence.evidenceCount > report.evidenceCount;
  const newContradiction = evidence.contradictionCount > report.contradictionCount && regionObserved;
  const grounding: ReportReplyGrounding =
    newContradiction
      ? "recent_contradictory_return"
      : newEvidence && targetKnown
        ? "direct_memory"
        : newEvidence
          ? "scout_or_trip_record"
          : targetKnown
            ? "familiar_range"
            : "no_grounding";

  if (newContradiction && evidence.evidenceCount > 0) {
    return {
      confirmationStatus: "disputed",
      replyStatus: "disputed",
      replyGrounding: grounding,
    };
  }
  if (newContradiction) {
    return {
      confirmationStatus: "contradicted",
      replyStatus: "contradicted",
      replyGrounding: grounding,
    };
  }
  if (newEvidence && report.confirmationStatus === "partially_confirmed") {
    return {
      confirmationStatus: "strengthened",
      replyStatus: "strengthened",
      replyGrounding: grounding,
    };
  }
  if (newEvidence && targetKnown) {
    return {
      confirmationStatus: "confirmed",
      replyStatus: "confirmed",
      replyGrounding: grounding,
    };
  }
  if (newEvidence) {
    return {
      confirmationStatus: "partially_confirmed",
      replyStatus: "confirmed",
      replyGrounding: grounding,
    };
  }
  if (staleReport && report.confirmationStatus !== "contradicted" && report.confirmationStatus !== "disputed") {
    return {
      confirmationStatus: "downgraded",
      replyStatus: "downgraded",
      replyGrounding: "no_grounding",
    };
  }
  if (targetKnown && report.confirmationStatus === "unconfirmed") {
    return {
      confirmationStatus: "corrected",
      replyStatus: "uncertain",
      replyGrounding: "familiar_range",
    };
  }
  return {
    confirmationStatus: report.confirmationStatus,
    replyStatus: report.replyStatus ?? "none",
    replyGrounding: report.replyGrounding ?? "no_grounding",
  };
}

function isReportConfirmedLike(report: WordOfMouthReport): boolean {
  return (
    report.confirmationStatus === "partially_confirmed" ||
    report.confirmationStatus === "confirmed" ||
    report.confirmationStatus === "corrected" ||
    report.confirmationStatus === "strengthened"
  );
}

function isReportContradictedLike(report: WordOfMouthReport): boolean {
  return report.confirmationStatus === "contradicted" || report.confirmationStatus === "disputed";
}

function isReportStaleLike(report: WordOfMouthReport): boolean {
  return report.confirmationStatus === "stale" || report.confirmationStatus === "downgraded";
}

function selectFactForReceiver(
  source: Band,
  receiver: Band,
  facts: readonly SourceReportFact[],
  tick: TickNumber,
): SourceReportFact | undefined {
  if (facts.length === 0) {
    return undefined;
  }

  const index = deterministicIndex(`${String(source.id)}:${String(receiver.id)}:${Number(tick)}`, facts.length);
  return facts[index];
}

function passesReportTransmissionCadence(
  source: Band,
  receiver: ReportReceiverCandidate,
  fact: SourceReportFact,
  tick: TickNumber,
): boolean {
  const score = fact.confidence * 0.62 + receiver.trust * 0.38;
  const cadence = receiver.trustBasis === "parent" || receiver.trustBasis === "daughter" || receiver.trustBasis === "sibling" ? 4 : 8;
  const phase = deterministicIndex(`${String(source.id)}:${String(receiver.band.id)}:${fact.topic}:${String(fact.targetTileId ?? "area")}`, cadence);

  return score >= 0.42 && (Number(tick) + phase) % cadence === 0;
}

function shouldWithholdSourceBiasedReport(
  source: Band,
  receiver: ReportReceiverCandidate,
  fact: SourceReportFact,
  tick: TickNumber,
): boolean {
  if (!canSourceBiasApply(source, receiver, fact)) {
    return false;
  }

  if (sourceBiasPressure(source) < 0.52 || receiver.trust >= 0.38 || fact.confidence < 0.52) {
    return false;
  }

  const phase = deterministicIndex(
    `${String(source.id)}:${String(receiver.band.id)}:${String(fact.targetTileId ?? fact.topic)}:withhold:${Number(tick)}`,
    61,
  );
  return phase === 0;
}

function deriveReportSourceBiasKind(
  source: Band,
  receiver: ReportReceiverCandidate,
  fact: SourceReportFact,
  tick: TickNumber,
): ReportSourceBiasKind {
  if (!canSourceBiasApply(source, receiver, fact)) {
    if (fact.hops !== undefined && fact.hops >= 2 && fact.confidence < 0.48) {
      return "stale_warning_repeated";
    }
    return "none";
  }

  const phase = deterministicIndex(
    `${String(source.id)}:${String(receiver.band.id)}:${String(fact.targetTileId ?? fact.topic)}:bias:${Number(tick)}`,
    9,
  );
  if (phase === 0 || phase === 1) {
    return "protective_vagueness";
  }
  if (phase === 2 || phase === 3) {
    return "downplayed_opportunity";
  }
  if (phase === 4 && isWarningTopic(fact.topic)) {
    return "exaggerated_risk";
  }
  return "none";
}

function canSourceBiasApply(
  source: Band,
  receiver: ReportReceiverCandidate,
  fact: SourceReportFact,
): boolean {
  if (receiver.trustBasis === "parent" || receiver.trustBasis === "daughter" || receiver.trustBasis === "sibling") {
    return false;
  }
  if (!isPositiveOpportunityTopic(fact.topic) && !isWarningTopic(fact.topic)) {
    return false;
  }
  const weakTrust =
    receiver.trust < 0.46 ||
    receiver.trustBasis === "weak_contact" ||
    receiver.trustBasis === "stranger" ||
    receiver.trustBasis === "range_friction";
  if (!weakTrust) {
    return false;
  }
  return sourceBiasPressure(source) >= 0.34 && fact.confidence >= 0.44;
}

function sourceBiasPressure(source: Band): number {
  return (
    (source.ecologicalStressCauses?.foodDeficit ?? 0) * 0.36 +
    (source.ecologicalStressCauses?.sharedCatchmentCrowding ?? 0) * 0.34 +
    (source.ecologicalStressCauses?.resourceDepletion ?? 0) * 0.18 +
    (source.rangeSaturation?.saturationPressure ?? 0) * 0.2
  );
}

function sourceBiasDistortion(
  sourceBiasKind: ReportSourceBiasKind,
  fallback: ReportDistortionLevel,
): ReportDistortionLevel {
  switch (sourceBiasKind) {
    case "protective_vagueness":
      return "source_biased";
    case "downplayed_opportunity":
      return "understated";
    case "exaggerated_risk":
      return "exaggerated";
    case "stale_warning_repeated":
      return "stale";
    case "none":
      return fallback;
  }
}

function sourceBiasReason(sourceBiasKind: ReportSourceBiasKind): string | undefined {
  switch (sourceBiasKind) {
    case "protective_vagueness":
      return "possibly protective vague talk under crowding pressure";
    case "downplayed_opportunity":
      return "weak-contact source may be downplaying a pressured place";
    case "exaggerated_risk":
      return "weak-contact warning may be exaggerated by source pressure";
    case "stale_warning_repeated":
      return "secondhand or old warning repeated with low confidence";
    case "none":
      return undefined;
  }
}

function hasRecentSimilarReport(
  reports: readonly WordOfMouthReport[],
  sourceBandId: BandId,
  fact: SourceReportFact,
  tick: TickNumber,
): boolean {
  return reports.some(
    (report) =>
      report.sourceBandId === sourceBandId &&
      report.topic === fact.topic &&
      report.targetTileId === fact.targetTileId &&
      Number(tick) - Number(report.tickReceived) < 48,
  );
}

function buildChildrenByParent(activeBands: readonly Band[]): ReadonlyMap<BandId, readonly Band[]> {
  const children = new Map<BandId, Band[]>();

  for (const band of activeBands) {
    if (band.parentBandId === undefined) {
      continue;
    }

    const existing = children.get(band.parentBandId) ?? [];
    children.set(band.parentBandId, [...existing, band].sort(compareBands));
  }

  return children;
}

function shouldRunCadenceForBand(bandId: BandId, tick: TickNumber, intervalTicks: number): boolean {
  if (intervalTicks <= 1) {
    return true;
  }

  const phase = deterministicIndex(String(bandId), intervalTicks);
  return (Number(tick) + phase) % intervalTicks === 0;
}

function factForPlaceMemory(memory: Band["placeMemory"][TileId]): SourceReportFact | undefined {
  if (memory.valences.includes("avoid_place") || memory.valences.includes("risky")) {
    return {
      topic: "avoid_place",
      targetTileId: memory.tileId,
      sourceBasis: "residential_move_memory",
      confidence: clamp01(memory.confidence * 0.84 + (memory.valences.includes("avoid_place") ? 0.12 : 0)),
      lastNotedTick: memory.lastObservedAt.tick,
      reasonIds: memory.reasonIds,
    };
  }

  if (memory.valences.includes("depleted")) {
    return {
      topic: "poor_return_warning",
      targetTileId: memory.tileId,
      sourceBasis: "direct_trip_return",
      confidence: clamp01(memory.confidence * 0.72 + 0.12),
      lastNotedTick: memory.lastObservedAt.tick,
      reasonIds: memory.reasonIds,
    };
  }

  if (memory.valences.includes("reliable") || (memory.lastKnownWaterStress ?? 1) < 0.28) {
    return {
      topic: "reliable_water",
      targetTileId: memory.tileId,
      sourceBasis: "water_party_return",
      confidence: clamp01(memory.confidence * 0.78 + (memory.isReturnPlace ? 0.1 : 0)),
      lastNotedTick: memory.lastObservedAt.tick,
      reasonIds: memory.reasonIds,
    };
  }

  if (memory.valences.includes("seasonally_good")) {
    return {
      topic: "seasonal_opportunity",
      targetTileId: memory.tileId,
      sourceBasis: "seasonal_observers",
      confidence: clamp01(memory.confidence * 0.74),
      lastNotedTick: memory.lastObservedAt.tick,
      reasonIds: memory.reasonIds,
    };
  }

  return undefined;
}

function topicForPatch(world: WorldState, classId: string, tileId: TileId): ReportedKnowledgeTopic | undefined {
  const tile = getTile(world, tileId);

  if (classId === "aquatic_food") {
    return tile !== undefined && (tile.isEstuary || tile.isMarshChannel || tile.terrainKind === "wetlands")
      ? "good_delta_or_wetland"
      : "good_fishing";
  }

  if (classId === "water_resource") {
    return "reliable_water";
  }

  if (classId === "animal_food") {
    return "animal_abundance";
  }

  return undefined;
}

function topicForTrip(
  world: WorldState,
  band: Band,
  trip: IntraSeasonTripRecord,
): ReportedKnowledgeTopic | undefined {
  const tile = getTile(world, trip.targetTileId);
  const patchMemory = findPatchMemory(band, trip.targetTileId, trip.resourceClassId);
  const successful =
    trip.activityOutcome === "partial_success" ||
    trip.activityOutcome === "target_found" ||
    trip.activityOutcome === "successful_observation" ||
    trip.activityOutcome === "returned_with_information";
  const failed =
    trip.activityOutcome === "target_not_found" ||
    trip.activityOutcome === "failed_due_to_distance" ||
    trip.activityOutcome === "failed_due_to_low_memory_confidence" ||
    trip.activityOutcome === "failed_due_to_season_mismatch" ||
    trip.activityOutcome === "failed_due_to_water_risk" ||
    trip.activityOutcome === "abandoned_due_to_risk";

  if (trip.activityOutcome === "failed_due_to_water_risk" || patchMemory?.risk.badWater === true) {
    return "bad_water_warning";
  }

  if (failed && trip.resourceClassId === "water_resource") {
    return tile !== undefined && tile.riskProfile.droughtRisk > 0.55 ? "dry_place_warning" : "bad_water_warning";
  }

  if (failed) {
    return world.time.season === "winter" && trip.activityOutcome === "failed_due_to_season_mismatch"
      ? "snow_or_winter_hardship_warning"
      : "poor_return_region";
  }

  if (trip.resourceClassId === "water_resource" || trip.resourceReturn.returnedResourceKind === "water_information") {
    return successful ? "good_water_region" : "unknown_story_or_guess";
  }

  if (trip.resourceClassId === "aquatic_food" || trip.resourceReturn.returnedResourceKind === "harvested_aquatic_food") {
    return tile !== undefined && (tile.isEstuary || tile.isMarshChannel || tile.terrainKind === "wetlands")
      ? "good_delta_or_wetland"
      : "good_fishing_region";
  }

  if (trip.resourceClassId === "animal_food" || trip.taskGroupType === "hunting_group") {
    if ((patchMemory?.risk.predatorOrAnimalRisk ?? 0) > 0.58) {
      return "animal_danger_or_avoidance";
    }
    return trip.activityOutcome === "partial_success" ? "hunting_potential" : "animals_seen";
  }

  if (
    trip.resourceClassId === "generic_plant_food" ||
    trip.resourceClassId === "fallback_food" ||
    trip.taskGroupType === "plant_gathering_group" ||
    trip.taskGroupType === "plant_followup_group"
  ) {
    return trip.seasonalEcology?.shadowSeasonalResult === "boosted" ? "seasonal_resource_pulse" : "gathering_potential";
  }

  if (trip.taskGroupType === "memory_refresh_group" || trip.resourceReturn.returnedResourceKind === "route_information") {
    return tile?.hasCreek === true ? "creek_valley_hint" : "tributary_route_hint";
  }

  if (tile?.terrainKind === "hills" || tile?.terrainKind === "mountains") {
    return "possible_pass_through_hills";
  }

  return undefined;
}

function sourceBasisForTrip(
  trip: IntraSeasonTripRecord,
  topic: ReportedKnowledgeTopic,
): ReportedKnowledgeSourceBasis {
  if (topic === "poor_return_region" || topic === "poor_return_warning") {
    return "frustrated_foragers";
  }
  if (trip.taskGroupType === "water_group" || trip.resourceClassId === "water_resource") {
    return "water_party_return";
  }
  if (trip.taskGroupType === "fishing_group" || trip.resourceClassId === "aquatic_food") {
    return "fishing_party_return";
  }
  if (trip.taskGroupType === "hunting_group" || trip.resourceClassId === "animal_food") {
    return "hunter_return";
  }
  if (
    trip.taskGroupType === "plant_gathering_group" ||
    trip.taskGroupType === "plant_followup_group" ||
    trip.resourceClassId === "generic_plant_food" ||
    trip.resourceClassId === "fallback_food"
  ) {
    return "gathering_party_return";
  }
  if (trip.taskGroupType === "memory_refresh_group" || trip.resourceReturn.returnedResourceKind === "route_information") {
    return "route_followers";
  }
  if (
    trip.taskGroupType === "local_foraging_group" &&
    (trip.activityOutcome === "partial_success" ||
      trip.activityOutcome === "target_found" ||
      trip.activityOutcome === "successful_observation")
  ) {
    return "successful_foragers";
  }
  if (trip.movementType === "overnight_hunt_or_scout") {
    return "scout_return";
  }
  if (trip.taskGroupType === "local_foraging_group") {
    return "forager_return";
  }
  return "direct_trip_return";
}

function confidenceForTripTalk(trip: IntraSeasonTripRecord): number {
  const returnConfidence = trip.resourceReturn.returnConfidence;
  const outcomeBoost =
    trip.activityOutcome === "partial_success"
      ? 0.18
      : trip.activityOutcome === "target_found" || trip.activityOutcome === "returned_with_information"
        ? 0.12
        : trip.activityOutcome === "failed_due_to_water_risk" || trip.activityOutcome === "failed_due_to_distance"
          ? 0.08
          : 0;
  const repeated = trip.activityMemoryEffect.effectType === "confidence_refreshed" ? 0.1 : 0;
  return clamp01(returnConfidence * 0.7 + outcomeBoost + repeated);
}

function precisionForTrip(trip: IntraSeasonTripRecord): ReportedKnowledgePrecision {
  if (trip.activityOutcome === "failed_due_to_distance" || trip.movementType === "overnight_hunt_or_scout") {
    return "vague_direction";
  }
  if (trip.distanceTiles >= 6 || trip.outcome !== "returns_same_day") {
    return "approximate_region";
  }
  return "exact_observed_area";
}

function topicForScout(
  scoutKind: ResourceScoutKind,
  resourceClassId: ResourceClassId,
  outcome: string,
  contradictionKind: string,
): ReportedKnowledgeTopic | undefined {
  if (
    contradictionKind === "expected_water_refuge_unconfirmed" ||
    contradictionKind === "expected_present_found_absent" ||
    contradictionKind === "inferred_belief_unconfirmed" ||
    contradictionKind === "inherited_belief_stale_or_wrong" ||
    contradictionKind === "repeated_no_new_information"
  ) {
    return scoutKind === "water_refuge" ? "bad_water_warning" : "poor_return_region";
  }

  if (scoutKind === "water_refuge" || resourceClassId === "water_resource") {
    return outcome === "belief_refuted" || outcome === "confirmed_seasonal_absent" ? "bad_water_warning" : "good_water_region";
  }

  if (scoutKind === "aquatic_patch" || resourceClassId === "aquatic_food") {
    return "good_fishing_region";
  }

  if (scoutKind === "animal_sign" || resourceClassId === "animal_food") {
    return outcome === "found_sign_only" ? "animals_seen" : "hunting_potential";
  }

  if (resourceClassId === "generic_plant_food" || resourceClassId === "fallback_food") {
    return "gathering_potential";
  }

  return outcome === "not_found" ? "poor_return_region" : "unknown_story_or_guess";
}

function makeRegionTarget(
  world: WorldState,
  receiver: Band,
  topic: ReportedKnowledgeTopic,
  anchorTileId: TileId | undefined,
  precision: ReportedKnowledgePrecision,
): ReportedKnowledgeRegionTarget {
  const tile = anchorTileId === undefined ? undefined : getTile(world, anchorTileId);
  const regionKind = regionKindForTopicTile(topic, tile);
  const directionFromReceiver = directionFromReceiverToTile(world, receiver, tile, topic, regionKind);
  const radiusTiles = radiusForPrecision(precision);
  const regionId = makeRegionId(tile, regionKind, directionFromReceiver, radiusTiles);

  return {
    regionId,
    approximateCenterTile: anchorTileId,
    radiusTiles,
    roughExtent: roughExtentForRegion(regionKind, radiusTiles),
    regionKind,
    directionFromReceiver,
    precision,
  };
}

function makeRegionId(
  tile: Tile | undefined,
  regionKind: ReportedKnowledgeRegionKind,
  direction: ReportedKnowledgeDirectionFromReceiver,
  radiusTiles: number,
): string {
  if (tile === undefined) {
    return `region:unknown:${regionKind}:${direction}:${radiusTiles}`;
  }

  const bucketX = Math.floor(tile.coord.x / Math.max(1, radiusTiles));
  const bucketY = Math.floor(tile.coord.y / Math.max(1, radiusTiles));
  return `region:${String(tile.regionId)}:${regionKind}:${bucketX}:${bucketY}`;
}

function regionKindForTopicTile(
  topic: ReportedKnowledgeTopic,
  tile: Tile | undefined,
): ReportedKnowledgeRegionKind {
  if (topic === "ford_or_crossing" || topic === "ford_or_crossing_known") {
    return "ford_area";
  }
  if (
    topic === "crowded_range_warning" ||
    topic === "crowded_water_warning" ||
    topic === "outsider_use_warning"
  ) {
    return "crowded_water_place";
  }
  if (topic === "safe_side_country") {
    return "opposite_bank";
  }
  if (topic === "tributary_route" || topic === "tributary_route_hint") {
    return "tributary_corridor";
  }
  if (topic === "creek_valley_hint") {
    return "creek_valley";
  }
  if (topic === "possible_pass_through_hills") {
    return "mountain_pass";
  }
  if (topic === "dry_place_warning" || topic === "snow_or_winter_hardship_warning") {
    return "dry_margin";
  }
  if (topic === "better_land_speculation" || topic === "uncertain_edge_opportunity") {
    return "familiar_range_edge";
  }

  if (tile === undefined) {
    return "unknown_directional_area";
  }
  if (tile.isEstuary || tile.isMarshChannel || tile.terrainKind === "wetlands") {
    return "delta_or_wetland";
  }
  if (tile.terrainKind === "lake") {
    return "lake_shore";
  }
  if (tile.hasCreek === true) {
    return "creek_valley";
  }
  if (tile.isRiverbank || tile.isFloodplain || tile.terrainKind === "river_valley") {
    return "river_reach";
  }
  if (tile.terrainKind === "mountains") {
    return "mountain_pass";
  }
  if (tile.terrainKind === "hills") {
    return "upland_slope";
  }
  if (tile.terrainKind === "forest") {
    return "forest_edge";
  }
  if (tile.terrainKind === "desert") {
    return "dry_margin";
  }
  return "unknown_directional_area";
}

function directionFromReceiverToTile(
  world: WorldState,
  receiver: Band,
  tile: Tile | undefined,
  topic: ReportedKnowledgeTopic,
  regionKind: ReportedKnowledgeRegionKind,
): ReportedKnowledgeDirectionFromReceiver {
  if (tile === undefined) {
    return "uncertain";
  }

  if (topic === "safe_side_country" || regionKind === "opposite_bank") {
    return "across_river";
  }
  if (regionKind === "tributary_corridor" || regionKind === "creek_valley") {
    return "along_tributary";
  }
  if (regionKind === "mountain_pass") {
    return "toward_mountains";
  }
  if (regionKind === "upland_slope") {
    return "toward_hills";
  }
  if (regionKind === "lake_shore") {
    return "toward_lake";
  }
  if (regionKind === "delta_or_wetland") {
    return "toward_delta";
  }

  const receiverTile = getTile(world, receiver.position);
  if (receiverTile === undefined) {
    return "uncertain";
  }

  const dy = tile.coord.y - receiverTile.coord.y;
  const dx = tile.coord.x - receiverTile.coord.x;
  if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= 3) {
    return dy > 0 ? "downstream" : "upstream";
  }
  if (Math.abs(dx) >= 4 || Math.abs(dy) >= 4) {
    return "beyond_known_edge";
  }
  return "uncertain";
}

function radiusForPrecision(precision: ReportedKnowledgePrecision): number {
  switch (precision) {
    case "exact_observed_area":
      return 3;
    case "approximate_region":
      return 5;
    case "vague_direction":
      return 8;
    case "story_only":
      return 11;
  }
}

function roughExtentForRegion(regionKind: ReportedKnowledgeRegionKind, radiusTiles: number): string {
  switch (regionKind) {
    case "river_reach":
      return `roughly ${radiusTiles} tiles along a river reach`;
    case "tributary_corridor":
      return `roughly ${radiusTiles} tiles along a tributary corridor`;
    case "creek_valley":
      return `roughly ${radiusTiles} tiles around a creek valley`;
    case "delta_or_wetland":
      return `roughly ${radiusTiles} tiles across wetland or delta country`;
    case "lake_shore":
      return `roughly ${radiusTiles} tiles along a lake shore`;
    case "opposite_bank":
      return `roughly ${radiusTiles} tiles across the water`;
    case "upland_slope":
      return `roughly ${radiusTiles} tiles toward upland slopes`;
    case "mountain_pass":
      return `roughly ${radiusTiles} tiles around a possible hard-terrain passage`;
    case "dry_margin":
      return `roughly ${radiusTiles} tiles around dry-margin country`;
    case "forest_edge":
      return `roughly ${radiusTiles} tiles near a forest edge`;
    case "familiar_range_edge":
      return `roughly ${radiusTiles} tiles beyond familiar country`;
    case "ford_area":
      return `roughly ${radiusTiles} tiles around a crossing place`;
    case "crowded_water_place":
      return `roughly ${radiusTiles} tiles around a shared water place`;
    case "unknown_directional_area":
      return `roughly ${radiusTiles} tiles in an uncertain direction`;
  }
}

function formatRegionTarget(region: ReportedKnowledgeRegionTarget): string {
  return `${region.regionKind} · ${region.directionFromReceiver} · ${region.precision} · ${region.roughExtent}`;
}

function patchReportStrength(memory: NonNullable<Band["resourceKnowledgeState"]>["patchMemories"][number]): number {
  const confidence = memory.confidence;
  const warningBoost = memory.risk.badWater || memory.risk.predatorOrAnimalRisk > 0.5 ? 0.12 : 0;

  return clamp01(
    confidence.presenceConfidence * 0.34 +
      confidence.accessConfidence * 0.22 +
      confidence.yieldConfidence * 0.22 +
      confidence.safetyConfidence * 0.12 +
      warningBoost,
  );
}

function placeReportStrength(memory: Band["placeMemory"][TileId]): number {
  return clamp01(memory.confidence * 0.62 + memory.attachment * 0.16 + (memory.isReturnPlace ? 0.12 : 0));
}

function sourceBasisForReceiver(
  trustBasis: ReportTrustBasis,
  fact: SourceReportFact,
): ReportedKnowledgeSourceBasis {
  if ((fact.hops ?? 1) >= 2) {
    return "secondhand_chain";
  }

  switch (trustBasis) {
    case "parent":
      return "parent_band";
    case "daughter":
      return "daughter_band";
    case "sibling":
      return "sibling_band";
    case "lineage_kin":
      return "lineage_kin";
    case "shared_water":
      if (fact.topic === "ford_or_crossing" || fact.topic === "ford_or_crossing_known") {
        return "ford_contact";
      }
      if (
        fact.topic === "good_delta_or_wetland" ||
        fact.topic === "good_fishing" ||
        fact.topic === "good_fishing_region"
      ) {
        return "delta_contact";
      }
      return "crowded_water_contact";
    case "repeated_contact":
    case "familiar_neighbor":
    case "residential_proximity":
      return "familiar_neighbor";
    case "weak_contact":
      return "weak_contact";
    case "stranger":
      return "unknown_band_nearby";
    case "range_friction":
      return "range_shared_use";
    case "internal_band":
      return fact.sourceBasis;
  }
}

function precisionForReport(
  fact: SourceReportFact,
  receiver: ReportReceiverCandidate,
  distortion: ReportDistortionLevel,
): ReportedKnowledgePrecision {
  if (fact.targetTileId === undefined) {
    return "story_only";
  }
  if (distortion === "stale" || distortion === "direction_blurred" || distortion === "overgeneralized") {
    return "vague_direction";
  }
  if (distortion === "wrong_or_misleading" || receiver.trust < 0.38 || (fact.hops ?? 1) >= 2) {
    return "story_only";
  }
  if (receiver.trust < 0.58 || fact.confidence < 0.48) {
    return "approximate_region";
  }
  return fact.sourceBasis === "direct_trip_return" ? "exact_observed_area" : "approximate_region";
}

function findPatchMemory(
  band: Band,
  tileId: TileId,
  resourceClassId: ResourceClassId | undefined,
): NonNullable<Band["resourceKnowledgeState"]>["patchMemories"][number] | undefined {
  return (band.resourceKnowledgeState?.patchMemories ?? []).find(
    (memory) =>
      memory.approximateTile === tileId &&
      (resourceClassId === undefined || memory.resourceClassId === resourceClassId),
  );
}

function buildReportEvidenceIndex(band: Band): ReportEvidenceIndex {
  return {
    observedTileIds: Object.keys(band.knowledge.observedTiles).sort().map((tileId) => tileId as TileId),
    patchMemories: band.resourceKnowledgeState?.patchMemories ?? [],
    placeMemories: Object.values(band.placeMemory),
    recentTrips: band.recentIntraSeasonTrips ?? [],
    travelCorridors: Object.values(band.travelCorridors),
    regionMatchCache: new Map<string, boolean>(),
    tileCoordCache: new Map<string, ParsedTileCoord | undefined>(),
  };
}

function hasObservedReportRegion(evidenceIndex: ReportEvidenceIndex, report: WordOfMouthReport): boolean {
  return evidenceIndex.observedTileIds.some((tileId) =>
    regionTargetMatchesTileCached(evidenceIndex, report.regionTarget, tileId),
  );
}

function countReportEvidence(evidenceIndex: ReportEvidenceIndex, report: WordOfMouthReport): ReportEvidenceCounts {
  let evidenceCount = 0;
  let contradictionCount = 0;

  for (const memory of evidenceIndex.patchMemories) {
    if (!regionTargetMatchesTileCached(evidenceIndex, report.regionTarget, memory.approximateTile)) {
      continue;
    }

    if (supportsReportTopic(report.topic, memory.resourceClassId, memory.confidence.presenceConfidence, memory.confidence.yieldConfidence)) {
      evidenceCount += 1;
    }

    if (report.topic === "bad_water_warning" && memory.risk.badWater) {
      evidenceCount += 1;
    }

    if ((report.topic === "animal_danger" || report.topic === "animal_danger_or_avoidance") && memory.risk.predatorOrAnimalRisk > 0.5) {
      evidenceCount += 1;
    }

    if (
      isPositiveOpportunityTopic(report.topic) &&
      memory.confidence.presenceConfidence < 0.24 &&
      memory.confidence.yieldConfidence < 0.24
    ) {
      contradictionCount += 1;
    }

    if (
      report.topic === "reliable_water" ||
      report.topic === "good_water_region"
    ) {
      if (memory.resourceClassId === "water_resource" && memory.risk.badWater) {
        contradictionCount += 1;
      }
    }
  }

  for (const place of evidenceIndex.placeMemories) {
    if (!regionTargetMatchesTileCached(evidenceIndex, report.regionTarget, place.tileId)) {
      continue;
    }

    if (isWarningTopic(report.topic) && (place.valences.includes("avoid_place") || place.valences.includes("risky") || place.valences.includes("depleted"))) {
      evidenceCount += 1;
    }
    if (isPositiveOpportunityTopic(report.topic) && (place.valences.includes("reliable") || place.valences.includes("seasonally_good") || place.isReturnPlace)) {
      evidenceCount += 1;
    }
  }

  for (const trip of evidenceIndex.recentTrips) {
    if (!regionTargetMatchesTileCached(evidenceIndex, report.regionTarget, trip.targetTileId)) {
      continue;
    }

    if (
      isPositiveOpportunityTopic(report.topic) &&
      (trip.activityOutcome === "target_not_found" ||
        trip.activityOutcome === "failed_due_to_low_memory_confidence" ||
        trip.activityOutcome === "failed_due_to_water_risk" ||
        trip.activityOutcome === "failed_due_to_season_mismatch")
    ) {
      contradictionCount += 1;
    }
  }

  return {
    evidenceCount: Math.min(4, evidenceCount),
    contradictionCount: Math.min(4, contradictionCount),
  };
}

function supportsReportTopic(
  topic: ReportedKnowledgeTopic,
  resourceClassId: ResourceClassId,
  presenceConfidence: number,
  yieldConfidence: number,
): boolean {
  const strongEnough = presenceConfidence >= 0.36 || yieldConfidence >= 0.34;
  if (!strongEnough) {
    return false;
  }

  if (
    topic === "good_fishing" ||
    topic === "good_fishing_region" ||
    topic === "good_delta_or_wetland"
  ) {
    return resourceClassId === "aquatic_food";
  }
  if (topic === "reliable_water" || topic === "good_water_region") {
    return resourceClassId === "water_resource";
  }
  if (
    topic === "animal_abundance" ||
    topic === "animals_seen" ||
    topic === "hunting_potential"
  ) {
    return resourceClassId === "animal_food";
  }
  if (topic === "gathering_potential" || topic === "seasonal_resource_pulse") {
    return resourceClassId === "generic_plant_food" || resourceClassId === "fallback_food";
  }
  return false;
}

function deriveSpeculations(
  world: WorldState,
  band: Band,
  reports: readonly WordOfMouthReport[],
  evidenceIndex: ReportEvidenceIndex,
  profiler?: ReportedKnowledgeProfiler,
): readonly ReportedKnowledgeSpeculation[] {
  const candidates: ReportedKnowledgeSpeculation[] = [];
  const grouped = new Map<string, WordOfMouthReport[]>();

  for (const report of reports) {
    if (report.receiverDisposition === "ignored" || report.receiverDisposition === "contradicted") {
      continue;
    }

    const key = `${report.regionTarget.regionId}:${hypothesisForTopic(report.topic) ?? "none"}`;
    const existing = grouped.get(key) ?? [];
    grouped.set(key, [...existing, report]);
  }

  for (const group of [...grouped.values()].sort(compareReportGroups)) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }

    const hypothesis = hypothesisForTopic(first.topic);
    if (hypothesis === undefined) {
      continue;
    }

    const grounding = profileReportedKnowledge(
      profiler,
      "evidenceScanning",
      () => speculationGroundingScore(band, evidenceIndex, first.regionTarget, group),
    );
    if (grounding.evidenceCount <= 0) {
      continue;
    }

    candidates.push(makeSpeculation(world, band, first.regionTarget, hypothesis, group, grounding));
  }

  return candidates
    .sort((left, right) =>
      right.confidence - left.confidence ||
      right.evidenceCount - left.evidenceCount ||
      left.speculationId.localeCompare(right.speculationId),
    )
    .slice(0, 3);
}

function hypothesisForTopic(topic: ReportedKnowledgeTopic): ReportedKnowledgeSpeculationHypothesis | undefined {
  if (topic === "better_land_speculation" || topic === "uncertain_edge_opportunity" || topic === "good_camp_region") {
    return "better_land_possible";
  }
  if (topic === "good_water_region" || topic === "reliable_water" || topic === "good_delta_or_wetland") {
    return "water_likely";
  }
  if (topic === "animals_seen" || topic === "animal_abundance" || topic === "hunting_potential") {
    return "animals_likely";
  }
  if (topic === "good_fishing" || topic === "good_fishing_region") {
    return "fish_likely";
  }
  if (
    topic === "tributary_route" ||
    topic === "tributary_route_hint" ||
    topic === "creek_valley_hint" ||
    topic === "possible_pass_through_hills" ||
    topic === "ford_or_crossing" ||
    topic === "ford_or_crossing_known"
  ) {
    return "route_likely_continues";
  }
  if (topic === "crowded_range_warning" || topic === "crowded_water_warning" || topic === "outsider_use_warning") {
    return "crowding_likely";
  }
  if (topic === "bad_water_warning" || topic === "animal_danger" || topic === "animal_danger_or_avoidance" || topic === "avoid_place") {
    return "risk_likely";
  }
  if (topic === "poor_return_warning" || topic === "poor_return_region" || topic === "dry_place_warning" || topic === "snow_or_winter_hardship_warning") {
    return "poor_return_likely";
  }
  return undefined;
}

function speculationGroundingScore(
  band: Band,
  evidenceIndex: ReportEvidenceIndex,
  regionTarget: ReportedKnowledgeRegionTarget,
  reports: readonly WordOfMouthReport[],
): {
  readonly evidenceCount: number;
  readonly contradictionCount: number;
  readonly confidence: number;
  readonly disposition: ReportedKnowledgeSpeculationDisposition;
} {
  let evidenceCount = reports.length;
  let contradictionCount = 0;

  const pressure = band.rangeSaturation?.saturationPressure ?? band.pressureState?.mobilityPressure ?? 0;
  if (pressure > 0.48) {
    evidenceCount += 1;
  }
  if ((band.returnTrend?.chronicDecline ?? false) || band.returnTrend?.trendDirection === "declining") {
    evidenceCount += 1;
  }
  for (const trip of evidenceIndex.recentTrips) {
    if (!regionTargetMatchesTileCached(evidenceIndex, regionTarget, trip.targetTileId)) {
      continue;
    }
    evidenceCount += trip.activityOutcome === "target_not_found" ? 0 : 1;
    contradictionCount += trip.activityOutcome === "target_not_found" ? 1 : 0;
  }
  for (const corridor of evidenceIndex.travelCorridors) {
    if (
      regionTargetMatchesTileCached(evidenceIndex, regionTarget, corridor.fromTileId) ||
      regionTargetMatchesTileCached(evidenceIndex, regionTarget, corridor.toTileId)
    ) {
      evidenceCount += corridor.confidence > 0.36 ? 1 : 0;
    }
  }

  const reportConfidence = reports.reduce((sum, report) => sum + report.confidence * report.freshness, 0) / Math.max(1, reports.length);
  const confidence = round2(clamp01(reportConfidence * 0.58 + Math.min(0.28, evidenceCount * 0.07) - Math.min(0.22, contradictionCount * 0.08)));
  const checked = reports.some((report) => report.receiverDisposition === "checked_by_probe" || report.receiverDisposition === "partially_confirmed");
  const disposition: ReportedKnowledgeSpeculationDisposition =
    contradictionCount > evidenceCount
      ? "disproven"
      : checked
        ? "checked_by_probe"
        : confidence >= 0.52
          ? "watched"
          : confidence >= 0.34
            ? "remembered"
            : "dismissed";

  return { evidenceCount, contradictionCount, confidence, disposition };
}

function makeSpeculation(
  world: WorldState,
  band: Band,
  regionTarget: ReportedKnowledgeRegionTarget,
  hypothesis: ReportedKnowledgeSpeculationHypothesis,
  reports: readonly WordOfMouthReport[],
  grounding: ReturnType<typeof speculationGroundingScore>,
): ReportedKnowledgeSpeculation {
  return {
    speculationId: `speculation:${String(band.id)}:${Number(world.time.tick)}:${hypothesis}:${regionTarget.regionId}`,
    bandId: band.id,
    tick: world.time.tick,
    regionTarget,
    hypothesis,
    confidence: grounding.confidence,
    evidenceCount: grounding.evidenceCount,
    contradictionCount: grounding.contradictionCount,
    sourceReports: reports.map((report) => report.reportId).sort().slice(0, 5),
    receiverDisposition: grounding.disposition,
    noHiddenTruth: true,
    noDirectUnlock: true,
    noForcedMove: true,
  };
}

function refreshSpeculations(
  speculations: readonly ReportedKnowledgeSpeculation[],
  reports: readonly WordOfMouthReport[],
  tick: TickNumber,
): readonly ReportedKnowledgeSpeculation[] {
  return speculations.map((speculation) => {
    const relatedReports = reports.filter((report) => speculation.sourceReports.includes(report.reportId));
    const contradicted = relatedReports.some(isReportContradictedLike);
    const partiallyConfirmed = relatedReports.some(isReportConfirmedLike);
    const age = Math.max(0, Number(tick) - Number(speculation.tick));
    const receiverDisposition: ReportedKnowledgeSpeculationDisposition =
      contradicted
        ? "disproven"
        : partiallyConfirmed
          ? "partially_confirmed"
          : speculation.receiverDisposition === "checked_by_probe"
            ? "checked_by_probe"
            : age > 80
              ? "dismissed"
              : speculation.receiverDisposition;

    return {
      ...speculation,
      receiverDisposition,
      confidence: round2(clamp01(speculation.confidence - age / (SPECULATION_MAX_AGE_TICKS * 4))),
      contradictionCount: speculation.contradictionCount + (contradicted ? 1 : 0),
      evidenceCount: speculation.evidenceCount + (partiallyConfirmed ? 1 : 0),
    };
  });
}

function retainSpeculations(
  speculations: readonly ReportedKnowledgeSpeculation[],
  tick: TickNumber,
): readonly ReportedKnowledgeSpeculation[] {
  const deduped = new Map<string, ReportedKnowledgeSpeculation>();
  for (const speculation of speculations) {
    const key = `${speculation.hypothesis}:${speculation.regionTarget.regionId}`;
    const existing = deduped.get(key);
    if (existing === undefined || speculationRetentionScore(speculation, tick) > speculationRetentionScore(existing, tick)) {
      deduped.set(key, speculation);
    }
  }
  return [...deduped.values()]
    .filter((speculation) =>
      Number(tick) - Number(speculation.tick) <= SPECULATION_MAX_AGE_TICKS &&
      speculation.confidence > 0.12 &&
      speculation.receiverDisposition !== "dismissed",
    )
    .sort((left, right) =>
      speculationRetentionScore(right, tick) - speculationRetentionScore(left, tick) ||
      left.speculationId.localeCompare(right.speculationId),
    )
    .slice(0, SPECULATION_RING_LIMIT);
}

function speculationRetentionScore(speculation: ReportedKnowledgeSpeculation, tick: TickNumber): number {
  const age = Math.max(0, Number(tick) - Number(speculation.tick));
  return speculation.confidence * 0.68 + Math.min(0.24, speculation.evidenceCount * 0.04) - Math.min(0.3, speculation.contradictionCount * 0.08) - age * 0.001;
}

function reportMatchesTile(report: WordOfMouthReport, tileId: TileId): boolean {
  return report.targetTileId === tileId || regionTargetMatchesTile(report.regionTarget, tileId);
}

function speculationMatchesTile(speculation: ReportedKnowledgeSpeculation, tileId: TileId): boolean {
  return regionTargetMatchesTile(speculation.regionTarget, tileId);
}

function regionTargetMatchesTile(regionTarget: ReportedKnowledgeRegionTarget, tileId: TileId): boolean {
  if (regionTarget.approximateCenterTile === undefined) {
    return false;
  }

  const distance = getTileDistance(regionTarget.approximateCenterTile, tileId);
  return distance !== undefined && distance <= regionTarget.radiusTiles + REPORT_REGION_MATCH_EXTRA_RADIUS;
}

function regionTargetMatchesTileCached(
  evidenceIndex: ReportEvidenceIndex,
  regionTarget: ReportedKnowledgeRegionTarget,
  tileId: TileId,
): boolean {
  if (regionTarget.approximateCenterTile === undefined) {
    return false;
  }

  const key = `${regionTarget.regionId}:${String(tileId)}`;
  const cached = evidenceIndex.regionMatchCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const distance = getTileDistanceCached(evidenceIndex, regionTarget.approximateCenterTile, tileId);
  const matches = distance !== undefined && distance <= regionTarget.radiusTiles + REPORT_REGION_MATCH_EXTRA_RADIUS;
  evidenceIndex.regionMatchCache.set(key, matches);
  return matches;
}

function getTileDistanceCached(
  evidenceIndex: ReportEvidenceIndex,
  leftTileId: TileId,
  rightTileId: TileId,
): number | undefined {
  const left = parseTileCoordCached(evidenceIndex, leftTileId);
  const right = parseTileCoordCached(evidenceIndex, rightTileId);

  if (left === undefined || right === undefined) {
    return undefined;
  }

  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function parseTileCoordCached(evidenceIndex: ReportEvidenceIndex, tileId: TileId): ParsedTileCoord | undefined {
  const key = String(tileId);

  if (evidenceIndex.tileCoordCache.has(key)) {
    return evidenceIndex.tileCoordCache.get(key);
  }

  const parsed = parseTileCoord(tileId);
  evidenceIndex.tileCoordCache.set(key, parsed);
  return parsed;
}

function hasRecentSimilarInternalReport(
  reports: readonly WordOfMouthReport[],
  incoming: WordOfMouthReport,
  tick: TickNumber,
): boolean {
  return reports.some(
    (report) =>
      report.sourceBandId === incoming.sourceBandId &&
      report.receiverBandId === incoming.receiverBandId &&
      report.topic === incoming.topic &&
      report.regionTarget.regionId === incoming.regionTarget.regionId &&
      Number(tick) - Number(report.tickReceived) < 24,
  );
}

function reportDedupKey(report: WordOfMouthReport): string {
  return `${String(report.sourceBandId)}:${String(report.receiverBandId)}:${report.topic}:${report.regionTarget.regionId}:${report.sourceBasis}`;
}

function isPositiveSpeculation(hypothesis: ReportedKnowledgeSpeculationHypothesis): boolean {
  return (
    hypothesis === "better_land_possible" ||
    hypothesis === "water_likely" ||
    hypothesis === "animals_likely" ||
    hypothesis === "fish_likely" ||
    hypothesis === "route_likely_continues"
  );
}

function speculationDispositionBiasWeight(disposition: ReportedKnowledgeSpeculationDisposition): number {
  switch (disposition) {
    case "partially_confirmed":
      return 0.8;
    case "checked_by_probe":
      return 0.7;
    case "used_as_minor_bias":
      return 0.64;
    case "watched":
      return 0.52;
    case "remembered":
      return 0.32;
    case "dismissed":
    case "disproven":
      return 0;
  }
}

function deriveDistortion(
  fact: SourceReportFact,
  receiver: ReportReceiverCandidate,
  age: number,
  source: Band,
): ReportDistortionLevel {
  if ((fact.hops ?? 1) >= 3) {
    return "overgeneralized";
  }

  if (age > 96) {
    return "stale";
  }

  if ((fact.hops ?? 1) >= 2 && receiver.trust < 0.58) {
    return "direction_blurred";
  }

  if (fact.confidence < 0.34 && receiver.trust < 0.38) {
    return "wrong_or_misleading";
  }

  if (source.rangeSaturation?.saturationPressure !== undefined && source.rangeSaturation.saturationPressure > 0.64) {
    return "source_biased";
  }

  if (receiver.trust < 0.42 || fact.confidence < 0.42) {
    return "vague";
  }

  if (isPositiveOpportunityTopic(fact.topic) && fact.confidence > 0.72 && receiver.trust < 0.58) {
    return "exaggerated";
  }

  if (isWarningTopic(fact.topic) && fact.confidence < 0.5) {
    return "understated";
  }

  return "none";
}

function deriveReceiverDisposition(
  receiver: Band,
  fact: SourceReportFact,
  confidence: number,
): ReportReceiverDisposition {
  if (confidence < 0.28) {
    return "ignored";
  }

  if (fact.targetTileId === undefined) {
    return "remembered_only";
  }

  const targetKnown = receiver.knowledge.observedTiles[fact.targetTileId] !== undefined;
  const routeKnown = hasRouteEvidence(receiver, fact.targetTileId);

  if (targetKnown || routeKnown) {
    return "used_as_minor_bias";
  }

  return confidence >= 0.48 ? "cautiously_considered" : "remembered_only";
}

function hasRouteEvidence(band: Band, tileId: TileId): boolean {
  return (
    Object.values(band.travelCorridors).some(
      (corridor) => corridor.fromTileId === tileId || corridor.toTileId === tileId,
    ) ||
    Object.values(band.crossingMemories).some(
      (crossing) => crossing.crossingTileA === tileId || crossing.crossingTileB === tileId,
    )
  );
}

function selectKnownEndpoint(band: Band, left: TileId, right: TileId): TileId {
  const leftKnown = band.knowledge.observedTiles[left] !== undefined;
  const rightKnown = band.knowledge.observedTiles[right] !== undefined;

  if (rightKnown && !leftKnown) {
    return right;
  }

  if (leftKnown && !rightKnown) {
    return left;
  }

  return compareTileIds(left, right) <= 0 ? left : right;
}

function trustBasisForContact(contact: KnownBandContactMemory): ReportTrustBasis {
  if (contact.relation === "parent_daughter") {
    return "lineage_kin";
  }

  if (contact.relation === "siblings") {
    return "sibling";
  }

  if (contact.contactCount >= 4 || contact.sharedUseCount >= 2) {
    return contact.sharedUseCount >= 2 ? "shared_water" : "repeated_contact";
  }

  if (contact.familiarity > 0.5 || contact.trustLikeTolerance > 0.52) {
    return "familiar_neighbor";
  }

  return "weak_contact";
}

function contactTrust(contact: KnownBandContactMemory): number {
  return clamp01(
    contact.trustLikeTolerance * 0.44 +
      contact.familiarity * 0.28 +
      Math.min(0.18, contact.contactCount * 0.03) +
      Math.min(0.1, contact.sharedUseCount * 0.04) -
      contact.tension * 0.18,
  );
}

function contactScore(contact: KnownBandContactMemory): number {
  return contactTrust(contact) + contact.contactCount * 0.02 + Number(contact.lastContactAt.tick) * 0.0001;
}

function reportRetentionScore(report: WordOfMouthReport, tick: TickNumber): number {
  const age = Math.max(0, Number(tick) - Number(report.tickReceived));
  const disposition =
    report.receiverDisposition === "acted_on"
      ? 0.4
      : report.receiverDisposition === "checked_by_probe"
        ? 0.3
        : report.receiverDisposition === "used_as_minor_bias"
          ? 0.18
          : 0;

  return report.confidence * 0.52 + report.freshness * 0.28 + disposition - age * 0.001;
}

function dispositionBiasWeight(disposition: ReportReceiverDisposition): number {
  switch (disposition) {
    case "acted_on":
      return 0.82;
    case "partially_confirmed":
      return 0.78;
    case "checked_by_probe":
      return 0.72;
    case "used_as_minor_bias":
      return 0.66;
    case "cautiously_considered":
      return 0.44;
    case "remembered_only":
      return 0.24;
    case "stale":
      return 0.1;
    case "contradicted":
    case "ignored":
      return 0;
  }
}

function trustWeightForBasis(trustBasis: ReportTrustBasis): number {
  switch (trustBasis) {
    case "internal_band":
      return 0.96;
    case "parent":
      return 0.9;
    case "daughter":
      return 0.86;
    case "sibling":
      return 0.78;
    case "lineage_kin":
      return 0.66;
    case "repeated_contact":
      return 0.58;
    case "familiar_neighbor":
      return 0.48;
    case "shared_water":
      return 0.46;
    case "residential_proximity":
      return 0.4;
    case "range_friction":
      return 0.36;
    case "weak_contact":
      return 0.3;
    case "stranger":
      return 0.18;
  }
}

function isPositiveOpportunityTopic(topic: ReportedKnowledgeTopic): boolean {
  return (
    topic === "good_fishing" ||
    topic === "good_fishing_region" ||
    topic === "reliable_water" ||
    topic === "good_water_region" ||
    topic === "animal_abundance" ||
    topic === "animals_seen" ||
    topic === "hunting_potential" ||
    topic === "gathering_potential" ||
    topic === "seasonal_opportunity" ||
    topic === "seasonal_resource_pulse" ||
    topic === "ford_or_crossing" ||
    topic === "ford_or_crossing_known" ||
    topic === "tributary_route" ||
    topic === "tributary_route_hint" ||
    topic === "creek_valley_hint" ||
    topic === "possible_pass_through_hills" ||
    topic === "good_delta_or_wetland" ||
    topic === "safe_side_country" ||
    topic === "better_land_speculation" ||
    topic === "good_camp_region" ||
    topic === "return_to_known_place" ||
    topic === "uncertain_edge_opportunity"
  );
}

function isWarningTopic(topic: ReportedKnowledgeTopic): boolean {
  return (
    topic === "bad_water_warning" ||
    topic === "animal_danger" ||
    topic === "animal_danger_or_avoidance" ||
    topic === "poor_return_warning" ||
    topic === "poor_return_region" ||
    topic === "crowded_range_warning" ||
    topic === "crowded_water_warning" ||
    topic === "outsider_use_warning" ||
    topic === "dry_place_warning" ||
    topic === "snow_or_winter_hardship_warning" ||
    topic === "avoid_place"
  );
}

function getActionTargetTileId(action: Action): TileId | undefined {
  switch (action.type) {
    case "move_to_tile":
    case "explore_unknown_neighbor":
    case "logistical_probe":
    case "resource_scout":
      return action.targetTileId;
    case "stay":
    case "create_temporary_camp":
    case "create_seasonal_camp":
    case "intensify_place_use":
    case "experiment_with_storage":
    case "experiment_with_plant_tending":
      return action.tileId;
    default:
      return undefined;
  }
}

function compareReportGroups(left: readonly WordOfMouthReport[], right: readonly WordOfMouthReport[]): number {
  const leftBest = left.reduce((best, report) => Math.max(best, report.confidence * report.freshness), 0);
  const rightBest = right.reduce((best, report) => Math.max(best, report.confidence * report.freshness), 0);
  const leftFirst = left[0];
  const rightFirst = right[0];
  return rightBest - leftBest || String(leftFirst?.reportId ?? "").localeCompare(String(rightFirst?.reportId ?? ""));
}

function compareTrips(left: IntraSeasonTripRecord, right: IntraSeasonTripRecord): number {
  return (
    Number(right.tick) - Number(left.tick) ||
    Number(right.day) - Number(left.day) ||
    compareTileIds(left.targetTileId, right.targetTileId) ||
    left.taskGroupType.localeCompare(right.taskGroupType)
  );
}

function compareReportFactIds(left: SourceReportFact, right: SourceReportFact): number {
  const leftKey = `${left.topic}:${String(left.targetTileId ?? left.targetApproxRegion ?? "")}:${left.sourceBasis}`;
  const rightKey = `${right.topic}:${String(right.targetTileId ?? right.targetApproxRegion ?? "")}:${right.sourceBasis}`;
  return leftKey.localeCompare(rightKey);
}

function compareBands(left: Band, right: Band): number {
  return compareBandIds(left.id, right.id);
}

function compareBandIds(left: BandId, right: BandId): number {
  return String(left).localeCompare(String(right));
}

function compareTileIds(left: TileId, right: TileId): number {
  return String(left).localeCompare(String(right));
}

function getTileDistance(leftTileId: TileId, rightTileId: TileId): number | undefined {
  const left = parseTileCoord(leftTileId);
  const right = parseTileCoord(rightTileId);

  if (left === undefined || right === undefined) {
    return undefined;
  }

  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function parseTileCoord(tileId: TileId): { readonly x: number; readonly y: number } | undefined {
  const parts = String(tileId).split(":");
  if (parts.length !== 3 || parts[0] !== "tile") {
    return undefined;
  }

  const x = Number(parts[1]);
  const y = Number(parts[2]);

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function deterministicIndex(key: string, modulo: number): number {
  if (modulo <= 1) {
    return 0;
  }

  let hash = 2166136261;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % modulo;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
