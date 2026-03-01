import type { BandId, EventId, ReasonId, RouteId, Season, TickNumber, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import { deriveMemoryReferents } from "./memoryReferents";
import type {
  Band,
  BandEraHeadline,
  BandEraRecord,
  BandEpisodeType,
  BandFissionEvent,
  BandHistoricalEpisode,
  BandReadableEvent,
  BandReadableEventCategory,
  HistoryEvidenceRef,
  InheritedEraSummary,
  ResidentialMoveEvent,
} from "./types";

const TOTAL_EVENT_CAP = 36;
const PER_FAMILY_CAP = 8;
const EVIDENCE_CHIP_CAP = 3;
const RELATED_LINK_CAP = 4;
const SOURCE_ID_CAP = 5;
const TECHNICAL_SAMPLE_CAP = 8;

export type CanonicalEventFamily =
  | "origin_lineage"
  | "demography"
  | "movement_place"
  | "route_crossing"
  | "knowledge_memory"
  | "food_water_pressure"
  | "contact_social"
  | "historical_compression";

export type CanonicalEventType =
  | "founding"
  | "daughter_fission"
  | "terminal_absorbed"
  | "terminal_collapsed"
  | "durable_era_closed"
  | "durable_episode"
  | "inherited_episode"
  | "inherited_era_summary"
  | "recent_event"
  | "recent_pattern"
  | "residential_move"
  | "fission_split";

export type CanonicalEventMemoryScope = "recent" | "durable" | "inherited";

export type CanonicalEventProvenance =
  | "direct_sim_transition"
  | "grouped_recent_pattern"
  | "compressed_deep_history"
  | "deep_history_episode"
  | "inherited_history"
  | "terminal_record"
  | "movement_trace";

export type CanonicalEventSourceSystem =
  | "deep_history_founding"
  | "deep_history_era"
  | "deep_history_episode"
  | "deep_history_inheritance"
  | "deep_history_terminal"
  | "readable_event_history"
  | "residential_move_record"
  | "fission_record";

export type CanonicalEventLivedStatus = "personally_lived" | "inherited_not_personally_lived";

export interface CanonicalEventEvidenceChip {
  readonly kind: string;
  readonly label: string;
  readonly sourceIds: readonly string[];
}

export interface CanonicalEvent {
  readonly id: string;
  readonly type: CanonicalEventType;
  readonly family: CanonicalEventFamily;
  readonly memoryScope: CanonicalEventMemoryScope;
  readonly livedStatus: CanonicalEventLivedStatus;
  readonly provenance: CanonicalEventProvenance;
  readonly sourceSystem: CanonicalEventSourceSystem;
  readonly startYear: number;
  readonly endYear: number;
  readonly season?: Season;
  readonly title: string;
  readonly summary: string;
  readonly consequence: string;
  readonly actualCause?: string;
  readonly severity: number;
  readonly significance: number;
  readonly grouped: boolean;
  readonly groupedCount: number;
  readonly involvedBandIds: readonly BandId[];
  readonly involvedTileIds: readonly TileId[];
  readonly involvedRouteIds: readonly RouteId[];
  readonly sourceEventIds: readonly EventId[];
  readonly sourceReasonIds: readonly ReasonId[];
  readonly sourceHistoryIds: readonly string[];
  readonly evidenceChips: readonly CanonicalEventEvidenceChip[];
  readonly chronicleLinkIds: readonly string[];
  readonly chronicleSectionIds: readonly string[];
  readonly relatedReferentIds: readonly string[];
  readonly relatedTalkIds: readonly string[];
  readonly talkMentionCount: number;
  readonly referentHookCount: number;
}

export interface CanonicalEventState {
  readonly bandId: BandId;
  readonly generatedAtTick: TickNumber;
  readonly generatedAtYear: number;
  readonly generatedAtSeason: Season;
  readonly events: readonly CanonicalEvent[];
  readonly familyCounts: Readonly<Record<CanonicalEventFamily, number>>;
  readonly sourceCounts: Readonly<Record<CanonicalEventSourceSystem, number>>;
  readonly recentEventCount: number;
  readonly durableEventCount: number;
  readonly inheritedEventCount: number;
  readonly groupedEventCount: number;
  readonly oldestEventYear?: number;
  readonly recentRange?: { readonly start: number; readonly end: number };
  readonly durableRange?: { readonly start: number; readonly end: number };
  readonly caps: {
    readonly totalEventCap: number;
    readonly perFamilyCap: number;
    readonly evidenceChipCap: number;
    readonly relatedLinkCap: number;
    readonly sourceIdCap: number;
    readonly droppedByTotalCap: number;
    readonly droppedByFamilyCap: number;
    readonly capsHeld: boolean;
  };
  readonly linkIntegrity: {
    readonly selectedBandOnly: true;
    readonly allEventsHaveProvenance: boolean;
    readonly allEventsHaveEvidence: boolean;
    readonly talkIsHookOnly: true;
    readonly noBehaviorInfluence: true;
  };
  readonly technicalProof: {
    readonly payloadBytesEstimate: number;
    readonly maxEventPayloadBytes: number;
    readonly sourceIdSamples: readonly string[];
    readonly eventIdSamples: readonly string[];
  };
}

interface CanonicalEventDraft extends Omit<
  CanonicalEvent,
  "relatedReferentIds" | "relatedTalkIds" | "talkMentionCount" | "referentHookCount"
> {
  readonly score: number;
  readonly sourceKeys: readonly string[];
}

const EMPTY_FAMILY_COUNTS: Readonly<Record<CanonicalEventFamily, number>> = {
  origin_lineage: 0,
  demography: 0,
  movement_place: 0,
  route_crossing: 0,
  knowledge_memory: 0,
  food_water_pressure: 0,
  contact_social: 0,
  historical_compression: 0,
};

const EMPTY_SOURCE_COUNTS: Readonly<Record<CanonicalEventSourceSystem, number>> = {
  deep_history_founding: 0,
  deep_history_era: 0,
  deep_history_episode: 0,
  deep_history_inheritance: 0,
  deep_history_terminal: 0,
  readable_event_history: 0,
  residential_move_record: 0,
  fission_record: 0,
};

export function deriveCanonicalEvents(world: WorldState, band: Band): CanonicalEventState {
  const dedupedDrafts = dedupeVisibleDrafts([
    ...deriveDeepHistoryEvents(band),
    ...deriveReadableHistoryEvents(band),
    ...deriveResidentialMoveEvents(band),
    ...deriveFissionEvents(band),
  ]);
  const drafts = [...dedupedDrafts].sort(compareDraftPriority);
  const capped = capEventDrafts(drafts);
  const withHooks = attachReferentAndTalkHooks(world, band, capped.kept);
  const events = [...withHooks].sort(compareEventsForTimeline);
  const familyCounts = countByFamily(events);
  const sourceCounts = countBySource(events);
  const recentRange = yearRange(events.filter((event) => event.memoryScope === "recent"));
  const durableRange = yearRange(events.filter((event) => event.memoryScope === "durable" || event.memoryScope === "inherited"));
  const eventPayloads = events.map((event) => byteLengthUtf8(JSON.stringify(event)));
  const payloadBytesEstimate = byteLengthUtf8(JSON.stringify({
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: world.time.year,
    events,
    familyCounts,
    sourceCounts,
    caps: {
      droppedByTotalCap: capped.droppedByTotalCap,
      droppedByFamilyCap: capped.droppedByFamilyCap,
    },
  }));

  return {
    bandId: band.id,
    generatedAtTick: world.time.tick,
    generatedAtYear: world.time.year,
    generatedAtSeason: world.time.season,
    events,
    familyCounts,
    sourceCounts,
    recentEventCount: events.filter((event) => event.memoryScope === "recent").length,
    durableEventCount: events.filter((event) => event.memoryScope === "durable").length,
    inheritedEventCount: events.filter((event) => event.memoryScope === "inherited").length,
    groupedEventCount: events.filter((event) => event.grouped).length,
    oldestEventYear: events.length === 0 ? undefined : Math.min(...events.map((event) => event.startYear)),
    recentRange,
    durableRange,
    caps: {
      totalEventCap: TOTAL_EVENT_CAP,
      perFamilyCap: PER_FAMILY_CAP,
      evidenceChipCap: EVIDENCE_CHIP_CAP,
      relatedLinkCap: RELATED_LINK_CAP,
      sourceIdCap: SOURCE_ID_CAP,
      droppedByTotalCap: capped.droppedByTotalCap,
      droppedByFamilyCap: capped.droppedByFamilyCap,
      capsHeld: events.length <= TOTAL_EVENT_CAP && Object.values(familyCounts).every((count) => count <= PER_FAMILY_CAP),
    },
    linkIntegrity: {
      selectedBandOnly: true,
      allEventsHaveProvenance: events.every((event) => event.provenance.length > 0 && event.sourceSystem.length > 0),
      allEventsHaveEvidence: events.every((event) => event.evidenceChips.length > 0),
      talkIsHookOnly: true,
      noBehaviorInfluence: true,
    },
    technicalProof: {
      payloadBytesEstimate,
      maxEventPayloadBytes: Math.max(0, ...eventPayloads),
      sourceIdSamples: capStrings(events.flatMap((event) => [
        ...event.sourceHistoryIds,
        ...event.sourceEventIds.map(String),
        ...event.sourceReasonIds.map(String),
      ]), TECHNICAL_SAMPLE_CAP),
      eventIdSamples: events.slice(0, TECHNICAL_SAMPLE_CAP).map((event) => event.id),
    },
  };
}

function deriveDeepHistoryEvents(band: Band): readonly CanonicalEventDraft[] {
  const history = band.deepHistory;
  if (history === undefined) {
    return [];
  }

  const founding = history.founding;
  const foundingYear = founding.foundedAt.year;
  const foundingTitle = founding.kind === "fission_daughter" ? "Daughter band began" : "Band record began";
  const foundingSummary = founding.kind === "fission_daughter"
    ? `This daughter band's own event record begins in Year ${foundingYear}; parent history is inherited, not personally lived.`
    : `The band's own event record begins in Year ${foundingYear} with ${founding.startingPopulation} people.`;
  const foundingDraft: CanonicalEventDraft = {
    id: canonicalId(band, "founding", foundingYear),
    type: "founding",
    family: "origin_lineage",
    memoryScope: "durable",
    livedStatus: "personally_lived",
    provenance: "direct_sim_transition",
    sourceSystem: "deep_history_founding",
    startYear: foundingYear,
    endYear: foundingYear,
    title: foundingTitle,
    summary: foundingSummary,
    consequence: founding.kind === "fission_daughter"
      ? "The event line is separate from the parent, while bounded parent summaries remain available as inheritance."
      : "Later eras and episodes are measured against this starting record.",
    actualCause: founding.creationCause === undefined ? undefined : humanizeKey(founding.creationCause),
    severity: 0.8,
    significance: 1,
    grouped: false,
    groupedCount: 1,
    involvedBandIds: compactIds([band.id, founding.parentBandId]),
    involvedTileIds: compactIds([founding.foundingTileId]),
    involvedRouteIds: [],
    sourceEventIds: [],
    sourceReasonIds: capIds(founding.creationReasonIds, SOURCE_ID_CAP),
    sourceHistoryIds: [String(founding.bandId), `founding:${String(founding.bandId)}:${foundingYear}`],
    evidenceChips: evidenceChips(founding.evidence, [
      `${founding.startingPopulation} people`,
      founding.kind === "fission_daughter" ? "fission founding" : "origin founding",
    ]),
    chronicleLinkIds: [`year:${foundingYear}`],
    chronicleSectionIds: ["article-long-memory"],
    sourceKeys: ["founding", String(founding.bandId), String(founding.foundingTileId)],
    score: 1000,
  };

  return [
    foundingDraft,
    ...history.eras.map((era) => eraEventDraft(band, era)),
    ...history.episodes.map((episode) => episodeEventDraft(band, episode, false)),
    ...history.inheritedEraSummaries.map((summary) => inheritedEraEventDraft(band, summary)),
    ...history.inheritedEpisodes.map((episode) => episodeEventDraft(band, episode, true)),
    ...(history.terminalRecord === undefined ? [] : [terminalEventDraft(band)]),
  ];
}

function eraEventDraft(band: Band, era: BandEraRecord): CanonicalEventDraft {
  const title = eraHeadlineLabel(era.headline);
  const churn = era.births + era.deaths > 0
    ? ` Recorded churn: ${era.births} births and ${era.deaths} deaths.`
    : "";
  const movement = era.movesCount > 0 ? ` ${era.movesCount} moves are part of the record.` : "";
  return {
    id: canonicalId(band, "era", era.id),
    type: "durable_era_closed",
    family: eraFamily(era),
    memoryScope: "durable",
    livedStatus: "personally_lived",
    provenance: era.merged ? "compressed_deep_history" : "direct_sim_transition",
    sourceSystem: "deep_history_era",
    startYear: era.startYear,
    endYear: era.endYear,
    title,
    summary: `${formatYearRange(era.startYear, era.endYear)} closed as ${lowerFirst(title)}. Population changed ${era.populationStart} to ${era.populationEnd}.${churn}${movement}`,
    consequence: era.merged
      ? "Older adjacent records were folded together so the deep past stays bounded."
      : "This closed era gives later UI a durable period record without keeping every year in full detail.",
    actualCause: eraCloseTriggerLabel(era.closeTrigger),
    severity: clamp01((Math.abs(era.populationEnd - era.populationStart) / Math.max(1, era.populationStart)) + era.hungerYears * 0.04 + era.waterStressYears * 0.04),
    significance: era.merged ? 0.7 : 0.62,
    grouped: true,
    groupedCount: Math.max(1, era.mergedSpanCount),
    involvedBandIds: compactIds([band.id, ...era.daughterBandIds]),
    involvedTileIds: compactIds([era.startTileId, era.endTileId]),
    involvedRouteIds: [],
    sourceEventIds: [],
    sourceReasonIds: [],
    sourceHistoryIds: [era.id],
    evidenceChips: evidenceChips(era.evidence, [
      `population ${era.populationStart}->${era.populationEnd}`,
      era.births + era.deaths > 0 ? `${era.births} births / ${era.deaths} deaths` : undefined,
      era.merged ? "merged older eras" : undefined,
    ]),
    chronicleLinkIds: [`year:${era.endYear}`],
    chronicleSectionIds: ["article-long-memory"],
    sourceKeys: [era.id, era.headline, era.closeTrigger],
    score: 560 + era.endYear * 0.01 + (era.merged ? 20 : 0),
  };
}

function inheritedEraEventDraft(band: Band, summary: InheritedEraSummary): CanonicalEventDraft {
  return {
    id: canonicalId(band, "inherited-era", `${String(summary.sourceBandId)}:${summary.startYear}-${summary.endYear}`),
    type: "inherited_era_summary",
    family: "historical_compression",
    memoryScope: "inherited",
    livedStatus: "inherited_not_personally_lived",
    provenance: "inherited_history",
    sourceSystem: "deep_history_inheritance",
    startYear: summary.startYear,
    endYear: summary.endYear,
    title: "Inherited parent-era summary",
    summary: `Inherited from parent band; not personally lived by this band. Parent history preserved ${lowerFirst(eraHeadlineLabel(summary.headline))} ending with population ${summary.populationEnd}.`,
    consequence: "The daughter receives a bounded summary, not a full duplicate of the parent history.",
    actualCause: "Founding inheritance",
    severity: 0.35,
    significance: 0.52,
    grouped: true,
    groupedCount: 1,
    involvedBandIds: compactIds([band.id, summary.sourceBandId]),
    involvedTileIds: [],
    involvedRouteIds: [],
    sourceEventIds: [],
    sourceReasonIds: [],
    sourceHistoryIds: [`inherited-era:${String(summary.sourceBandId)}:${summary.startYear}-${summary.endYear}`],
    evidenceChips: [
      { kind: "inheritance", label: "inherited summary", sourceIds: [String(summary.sourceBandId)] },
      { kind: "era", label: formatYearRange(summary.startYear, summary.endYear), sourceIds: [] },
    ],
    chronicleLinkIds: [`year:${summary.endYear}`],
    chronicleSectionIds: ["article-long-memory"],
    sourceKeys: [String(summary.sourceBandId), summary.headline],
    score: 540 + summary.endYear * 0.01,
  };
}

function episodeEventDraft(band: Band, episode: BandHistoricalEpisode, inherited: boolean): CanonicalEventDraft {
  const family = episodeFamily(episode.type);
  const title = episodeTitle(episode.type);
  const endYear = episode.endYear ?? episode.lastUpdatedYear;
  const episodeLine = `${formatYearRange(episode.startYear, endYear)}: ${ensureSentence(cleanSummary(episode.summary))}`;
  const summary = inherited
    ? `Inherited from parent band; not personally lived by this band. ${episodeLine}`
    : episodeLine;

  return {
    id: canonicalId(band, inherited ? "inherited-episode" : "episode", episode.id),
    type: inherited ? "inherited_episode" : "durable_episode",
    family,
    memoryScope: inherited ? "inherited" : "durable",
    livedStatus: inherited ? "inherited_not_personally_lived" : "personally_lived",
    provenance: inherited ? "inherited_history" : "deep_history_episode",
    sourceSystem: inherited ? "deep_history_inheritance" : "deep_history_episode",
    startYear: episode.startYear,
    endYear,
    title,
    summary,
    consequence: inherited
      ? "This remains lineage memory only; it is not counted as a personal event for the daughter band."
      : episodeConsequence(episode.type),
    actualCause: episodeActualCause(episode.type),
    severity: episode.severity,
    significance: Math.max(0.45, Math.min(1, episode.severity + episode.occurrenceCount * 0.03)),
    grouped: episode.occurrenceCount > 1 || episode.ongoing,
    groupedCount: Math.max(1, episode.occurrenceCount),
    involvedBandIds: compactIds([band.id, episode.relatedBandId, episode.inheritedFromBandId]),
    involvedTileIds: compactIds([episode.relatedTileId]),
    involvedRouteIds: compactIds([episode.relatedRouteId]),
    sourceEventIds: [],
    sourceReasonIds: [],
    sourceHistoryIds: [episode.id],
    evidenceChips: evidenceChips(episode.evidence, [
      episode.occurrenceCount > 1 ? `${episode.occurrenceCount} occurrences` : undefined,
      inherited ? "inherited" : "durable episode",
    ]),
    chronicleLinkIds: [`year:${endYear}`],
    chronicleSectionIds: ["article-long-memory"],
    sourceKeys: [episode.id, episode.type, String(episode.relatedTileId ?? ""), String(episode.relatedRouteId ?? "")],
    score: (inherited ? 570 : 620) + episode.severity * 100 + endYear * 0.01,
  };
}

function terminalEventDraft(band: Band): CanonicalEventDraft {
  const record = band.deepHistory?.terminalRecord;
  if (record === undefined) {
    throw new Error("terminalEventDraft requires terminalRecord");
  }
  const title = record.cause === "absorbed" ? "Band absorbed" : "Band collapsed";
  return {
    id: canonicalId(band, "terminal", `${record.cause}:${record.year}`),
    type: record.cause === "absorbed" ? "terminal_absorbed" : "terminal_collapsed",
    family: record.cause === "absorbed" ? "contact_social" : "demography",
    memoryScope: "durable",
    livedStatus: "personally_lived",
    provenance: "terminal_record",
    sourceSystem: "deep_history_terminal",
    startYear: record.year,
    endYear: record.year,
    title,
    summary: record.cause === "absorbed"
      ? `The band ended in Year ${record.year} by absorption with population ${record.populationAtEnd}.`
      : `The band ended in Year ${record.year} after collapse with population ${record.populationAtEnd}.`,
    consequence: "The terminal record preserves the end state without adding a future active band story.",
    actualCause: record.cause,
    severity: 1,
    significance: 1,
    grouped: false,
    groupedCount: 1,
    involvedBandIds: compactIds([band.id, record.absorbedByBandId]),
    involvedTileIds: [],
    involvedRouteIds: [],
    sourceEventIds: [],
    sourceReasonIds: [],
    sourceHistoryIds: [`terminal:${String(band.id)}:${record.year}`],
    evidenceChips: evidenceChips(record.evidence, [`population ${record.populationAtEnd}`]),
    chronicleLinkIds: [`year:${record.year}`],
    chronicleSectionIds: ["article-long-memory"],
    sourceKeys: [record.cause, String(record.absorbedByBandId ?? "")],
    score: 940 + record.year * 0.01,
  };
}

function deriveReadableHistoryEvents(band: Band): readonly CanonicalEventDraft[] {
  const events = band.eventHistory?.last25Years ?? band.eventHistory?.recentEvents ?? [];
  const groups = new Map<string, BandReadableEvent[]>();

  for (const event of events) {
    if (event.grounded !== true) {
      continue;
    }
    const key = `${event.category}:${event.stateKey}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [event]);
    } else {
      existing.push(event);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => readableGroupDraft(band, key, group))
    .sort(compareDraftPriority)
    .slice(0, 18);
}

function readableGroupDraft(band: Band, key: string, group: readonly BandReadableEvent[]): CanonicalEventDraft {
  const sorted = [...group].sort((left, right) =>
    Number(left.tick) - Number(right.tick) || String(left.eventId).localeCompare(String(right.eventId)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const highCount = sorted.filter((event) => event.salience === "high").length;
  const category = last.category;
  const grouped = sorted.length > 1;
  const title = grouped
    ? `${publicReadableCategoryLabel(category)} pattern`
    : uiSafeReadableEventTitle(last, category);
  const safeDescription = uiSafeReadableEventDescription(last, category);
  const summary = grouped
    ? `${sorted.length} similar ${lowerFirst(publicReadableCategoryLabel(category))} records recur from ${formatYearRange(first.year, last.year)}. ${safeDescription}`
    : safeDescription;

  return {
    id: canonicalId(band, grouped ? "recent-pattern" : "recent-event", key),
    type: grouped ? "recent_pattern" : "recent_event",
    family: readableFamily(category),
    memoryScope: "recent",
    livedStatus: "personally_lived",
    provenance: grouped ? "grouped_recent_pattern" : "direct_sim_transition",
    sourceSystem: "readable_event_history",
    startYear: first.year,
    endYear: last.year,
    season: last.season,
    title,
    summary,
    consequence: grouped
      ? "Similar recent records are folded together so the Events tab stays readable."
      : "This stays as a recent event; source proof remains in Technical.",
    actualCause: "recent band record",
    severity: last.salience === "high" ? 0.78 : last.salience === "medium" ? 0.55 : 0.32,
    significance: Math.min(1, 0.38 + sorted.length * 0.06 + highCount * 0.14),
    grouped,
    groupedCount: sorted.length,
    involvedBandIds: compactIds([band.id, ...sorted.map((event) => event.relatedBandId)]),
    involvedTileIds: compactIds(sorted.map((event) => event.relatedTileId)),
    involvedRouteIds: [],
    sourceEventIds: capIds(sorted.map((event) => event.eventId), SOURCE_ID_CAP),
    sourceReasonIds: capIds(sorted.flatMap((event) => event.sourceReasonIds), SOURCE_ID_CAP),
    sourceHistoryIds: [],
    evidenceChips: [
      { kind: "recent_event", label: grouped ? `${sorted.length} grouped records` : "recent record", sourceIds: sorted.slice(0, SOURCE_ID_CAP).map((event) => String(event.eventId)) },
      { kind: "category", label: publicReadableCategoryLabel(category).toLowerCase(), sourceIds: [] },
      ...(last.salience === "high" ? [{ kind: "salience", label: "high salience", sourceIds: [] }] : []),
    ].slice(0, EVIDENCE_CHIP_CAP),
    chronicleLinkIds: capStrings([
      ...sorted.slice(-3).map((event) => `event:${String(event.eventId)}`),
      `year:${last.year}`,
    ], RELATED_LINK_CAP),
    chronicleSectionIds: ["article-history"],
    sourceKeys: [key, last.stateKey, last.rawSource],
    score: 520 + (last.salience === "high" ? 90 : last.salience === "medium" ? 45 : 0) + sorted.length * 10 + last.year * 0.01,
  };
}

function deriveResidentialMoveEvents(band: Band): readonly CanonicalEventDraft[] {
  return (band.recentResidentialMoveEvents ?? [])
    .slice(0, 6)
    .map((event) => residentialMoveDraft(band, event));
}

function residentialMoveDraft(band: Band, event: ResidentialMoveEvent): CanonicalEventDraft {
  return {
    id: canonicalId(band, "residential-move", String(event.eventId)),
    type: "residential_move",
    family: "movement_place",
    memoryScope: "recent",
    livedStatus: "personally_lived",
    provenance: "movement_trace",
    sourceSystem: "residential_move_record",
    startYear: estimateYearFromTick(event.tick, band),
    endYear: estimateYearFromTick(event.tick, band),
    season: event.season,
    title: residentialMoveTitle(event),
    summary: `${residentialMoveSummary(event)} ${formatMoveDistance(event.distanceTiles)} and ${residentialMoveStatusLine(event)}.`,
    consequence: "This records a camp move that already happened; it does not steer future movement.",
    actualCause: residentialMoveCauseLine(event.cause),
    severity: event.hardshipRisk ?? 0.35,
    significance: 0.48 + (event.hardshipRisk ?? 0) * 0.3,
    grouped: event.pathTiles.length > 2,
    groupedCount: Math.max(1, event.pathTiles.length - 1),
    involvedBandIds: [band.id],
    involvedTileIds: compactIds([event.fromTileId, event.toTileId]),
    involvedRouteIds: [],
    sourceEventIds: [event.eventId],
    sourceReasonIds: capIds(event.reasonIds, SOURCE_ID_CAP),
    sourceHistoryIds: [],
    evidenceChips: [
      { kind: "move", label: `${event.distanceTiles} tile move`, sourceIds: [String(event.eventId)] },
      { kind: "status", label: humanizeKey(event.status), sourceIds: [] },
    ],
    chronicleLinkIds: [`event:${String(event.eventId)}`],
    chronicleSectionIds: ["article-history"],
    sourceKeys: [String(event.eventId), event.moveKind, event.cause],
    score: 500 + (event.hardshipRisk ?? 0) * 80 + Number(event.tick) * 0.0001,
  };
}

function deriveFissionEvents(band: Band): readonly CanonicalEventDraft[] {
  return band.fissionEvents.slice(-6).map((event) => fissionDraft(band, event));
}

function fissionDraft(band: Band, event: BandFissionEvent): CanonicalEventDraft {
  return {
    id: canonicalId(band, "fission", String(event.id)),
    type: "fission_split",
    family: "origin_lineage",
    memoryScope: "recent",
    livedStatus: "personally_lived",
    provenance: "direct_sim_transition",
    sourceSystem: "fission_record",
    startYear: event.time.year,
    endYear: event.time.year,
    season: event.time.season,
    title: "Daughter branch formed",
    summary: `A daughter band formed in Year ${event.time.year}. Parent population changed ${event.parentPopulationBefore} to ${event.parentPopulationAfter}; the daughter began with ${event.daughterPopulation} people.`,
    consequence: "The daughter receives its own founding event and bounded inherited records, not a clone of the parent event list.",
    actualCause: humanizeKey(event.splitReason.type),
    severity: 0.68,
    significance: 0.78,
    grouped: false,
    groupedCount: 1,
    involvedBandIds: compactIds([event.parentBandId, event.daughterBandId]),
    involvedTileIds: compactIds([event.originTileId, event.targetTileId]),
    involvedRouteIds: [],
    sourceEventIds: [event.id],
    sourceReasonIds: capIds([event.splitReason.id], SOURCE_ID_CAP),
    sourceHistoryIds: [],
    evidenceChips: [
      { kind: "fission", label: "daughter branch", sourceIds: [String(event.id)] },
      { kind: "population", label: `${event.daughterPopulation} people`, sourceIds: [] },
    ],
    chronicleLinkIds: [`event:${String(event.id)}`, `year:${event.time.year}`],
    chronicleSectionIds: ["article-history", "article-long-memory"],
    sourceKeys: [String(event.id), String(event.daughterBandId), event.splitReason.type],
    score: 650 + event.time.year * 0.01,
  };
}

function attachReferentAndTalkHooks(world: WorldState, band: Band, drafts: readonly CanonicalEventDraft[]): readonly CanonicalEvent[] {
  const referents = deriveMemoryReferents(world, band).referents;
  const talkItems = band.campRumors?.items ?? [];

  return drafts.map((draft) => {
    const sourceEventIdSet = new Set(draft.sourceEventIds.map(String));
    const sourceReasonIdSet = new Set(draft.sourceReasonIds.map(String));
    const tileIdSet = new Set(draft.involvedTileIds.map(String));
    const routeIdSet = new Set(draft.involvedRouteIds.map(String));
    const bandIdSet = new Set(draft.involvedBandIds.map(String));
    const sourceKeySet = new Set(draft.sourceKeys.map(String));
    const relatedReferentIds = capStrings(
      referents
        .filter((referent) =>
          referent.relatedEventIds.some((id) => sourceEventIdSet.has(String(id))) ||
          referent.relatedPlaceIds.some((id) => tileIdSet.has(String(id))) ||
          referent.relatedRouteIds.some((id) => routeIdSet.has(String(id))) ||
          referent.relatedBandIds.some((id) => bandIdSet.has(String(id))))
        .map((referent) => referent.linkTargetId),
      RELATED_LINK_CAP,
    );
    const relatedTalkIds = capStrings(
      talkItems
        .filter((item) =>
          item.reasonIds.some((id) => sourceReasonIdSet.has(String(id))) ||
          (item.relatedTileId !== undefined && tileIdSet.has(String(item.relatedTileId))) ||
          (item.relatedBandId !== undefined && bandIdSet.has(String(item.relatedBandId))) ||
          sourceKeySet.has(item.stateKey))
        .map((item) => item.id),
      RELATED_LINK_CAP,
    );

    return {
      ...stripDraftOnlyFields(draft),
      relatedReferentIds,
      relatedTalkIds,
      talkMentionCount: relatedTalkIds.length,
      referentHookCount: relatedReferentIds.length,
    };
  });
}

function stripDraftOnlyFields(draft: CanonicalEventDraft): Omit<
  CanonicalEventDraft,
  "score" | "sourceKeys"
> {
  const {
    score: _score,
    sourceKeys: _sourceKeys,
    ...event
  } = draft;
  return event;
}

function capEventDrafts(drafts: readonly CanonicalEventDraft[]): {
  readonly kept: readonly CanonicalEventDraft[];
  readonly droppedByTotalCap: number;
  readonly droppedByFamilyCap: number;
  readonly familyOverflow: readonly CanonicalEventFamily[];
} {
  const familyCounts = { ...EMPTY_FAMILY_COUNTS };
  const familyOverflow = new Set<CanonicalEventFamily>();
  const familyCapped: CanonicalEventDraft[] = [];

  for (const draft of drafts) {
    if (familyCounts[draft.family] >= PER_FAMILY_CAP) {
      familyOverflow.add(draft.family);
      continue;
    }
    familyCounts[draft.family] += 1;
    familyCapped.push(draft);
  }

  const kept = familyCapped.slice(0, TOTAL_EVENT_CAP);
  return {
    kept,
    droppedByTotalCap: Math.max(0, familyCapped.length - kept.length),
    droppedByFamilyCap: Math.max(0, drafts.length - familyCapped.length),
    familyOverflow: [...familyOverflow].sort(),
  };
}

function dedupeVisibleDrafts(drafts: readonly CanonicalEventDraft[]): readonly CanonicalEventDraft[] {
  const byVisibleMeaning = new Map<string, CanonicalEventDraft>();

  for (const draft of drafts) {
    const key = [
      draft.memoryScope,
      draft.livedStatus,
      draft.family,
      draft.title,
      draft.summary,
    ].join("|");
    const existing = byVisibleMeaning.get(key);

    if (existing === undefined) {
      byVisibleMeaning.set(key, draft);
      continue;
    }

    byVisibleMeaning.set(key, {
      ...existing,
      startYear: Math.min(existing.startYear, draft.startYear),
      endYear: Math.max(existing.endYear, draft.endYear),
      severity: Math.max(existing.severity, draft.severity),
      significance: Math.max(existing.significance, draft.significance),
      grouped: true,
      groupedCount: existing.groupedCount + draft.groupedCount,
      involvedBandIds: capIds([...existing.involvedBandIds, ...draft.involvedBandIds], SOURCE_ID_CAP),
      involvedTileIds: capIds([...existing.involvedTileIds, ...draft.involvedTileIds], SOURCE_ID_CAP),
      involvedRouteIds: capIds([...existing.involvedRouteIds, ...draft.involvedRouteIds], SOURCE_ID_CAP),
      sourceEventIds: capIds([...existing.sourceEventIds, ...draft.sourceEventIds], SOURCE_ID_CAP),
      sourceReasonIds: capIds([...existing.sourceReasonIds, ...draft.sourceReasonIds], SOURCE_ID_CAP),
      sourceHistoryIds: capStrings([...existing.sourceHistoryIds, ...draft.sourceHistoryIds], SOURCE_ID_CAP),
      evidenceChips: mergeEvidenceChips(existing.evidenceChips, draft.evidenceChips),
      chronicleLinkIds: capStrings([...existing.chronicleLinkIds, ...draft.chronicleLinkIds], RELATED_LINK_CAP),
      chronicleSectionIds: capStrings([...existing.chronicleSectionIds, ...draft.chronicleSectionIds], RELATED_LINK_CAP),
      sourceKeys: capStrings([...existing.sourceKeys, ...draft.sourceKeys], SOURCE_ID_CAP),
      score: Math.max(existing.score, draft.score) + 1,
    });
  }

  return [...byVisibleMeaning.values()];
}

function mergeEvidenceChips(
  left: readonly CanonicalEventEvidenceChip[],
  right: readonly CanonicalEventEvidenceChip[],
): readonly CanonicalEventEvidenceChip[] {
  const byKey = new Map<string, CanonicalEventEvidenceChip>();

  for (const chip of [...left, ...right]) {
    const key = `${chip.kind}:${chip.label}`;
    const existing = byKey.get(key);
    byKey.set(key, existing === undefined
      ? chip
      : {
        ...existing,
        sourceIds: capStrings([...existing.sourceIds, ...chip.sourceIds], SOURCE_ID_CAP),
      });
  }

  return [...byKey.values()].slice(0, EVIDENCE_CHIP_CAP);
}

function countByFamily(events: readonly CanonicalEvent[]): Readonly<Record<CanonicalEventFamily, number>> {
  const counts = { ...EMPTY_FAMILY_COUNTS };
  for (const event of events) {
    counts[event.family] += 1;
  }
  return counts;
}

function countBySource(events: readonly CanonicalEvent[]): Readonly<Record<CanonicalEventSourceSystem, number>> {
  const counts = { ...EMPTY_SOURCE_COUNTS };
  for (const event of events) {
    counts[event.sourceSystem] += 1;
  }
  return counts;
}

function compareDraftPriority(left: CanonicalEventDraft, right: CanonicalEventDraft): number {
  return right.score - left.score ||
    right.endYear - left.endYear ||
    right.startYear - left.startYear ||
    left.family.localeCompare(right.family) ||
    left.id.localeCompare(right.id);
}

function compareEventsForTimeline(left: CanonicalEvent, right: CanonicalEvent): number {
  return right.endYear - left.endYear ||
    right.startYear - left.startYear ||
    familyOrder(left.family) - familyOrder(right.family) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id);
}

function familyOrder(family: CanonicalEventFamily): number {
  const order: Readonly<Record<CanonicalEventFamily, number>> = {
    origin_lineage: 0,
    demography: 1,
    movement_place: 2,
    route_crossing: 3,
    knowledge_memory: 4,
    food_water_pressure: 5,
    contact_social: 6,
    historical_compression: 7,
  };
  return order[family];
}

function evidenceChips(refs: readonly HistoryEvidenceRef[], fallback: readonly (string | undefined)[]): readonly CanonicalEventEvidenceChip[] {
  const chips: CanonicalEventEvidenceChip[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const label = evidenceLabel(ref);
    const key = `${ref.kind}:${label}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    chips.push({
      kind: ref.kind,
      label,
      sourceIds: ref.ids.map(String).slice(0, SOURCE_ID_CAP),
    });
    if (chips.length >= EVIDENCE_CHIP_CAP) {
      return chips;
    }
  }

  for (const line of fallback) {
    if (line === undefined || line.trim().length === 0 || seen.has(line)) {
      continue;
    }
    seen.add(line);
    chips.push({ kind: "summary", label: line, sourceIds: [] });
    if (chips.length >= EVIDENCE_CHIP_CAP) {
      break;
    }
  }

  return chips;
}

function evidenceLabel(ref: HistoryEvidenceRef): string {
  const kind = humanizeKey(ref.kind);
  if (ref.ids.length > 1) {
    return `${kind} x${ref.ids.length}`;
  }
  return kind;
}

function truncateChip(label: string): string {
  return label.length <= 30 ? label : `${label.slice(0, 27).trim()}...`;
}

function eraFamily(era: BandEraRecord): CanonicalEventFamily {
  switch (era.headline) {
    case "growth_years":
    case "loss_years":
    case "recovery_years":
      return "demography";
    case "branching_years":
      return "origin_lineage";
    case "wandering_years":
    case "settling_years":
      return "movement_place";
    case "hardship_years":
      return "food_water_pressure";
    case "steady_years":
      return "historical_compression";
  }
}

function episodeFamily(type: BandEpisodeType): CanonicalEventFamily {
  switch (type) {
    case "population_thinned":
    case "population_recovered":
    case "near_collapse":
    case "band_collapsed_end":
      return "demography";
    case "daughter_branch_formed":
      return "origin_lineage";
    case "route_became_memory":
    case "hard_crossing_remembered":
      return "route_crossing";
    case "country_expanded":
      return "knowledge_memory";
    case "camp_became_home":
      return "movement_place";
    case "long_hunger_period":
    case "water_caution_period":
    case "fallback_reliance_period":
      return "food_water_pressure";
    case "band_absorbed_end":
      return "contact_social";
  }
}

function readableFamily(category: BandReadableEventCategory): CanonicalEventFamily {
  switch (category) {
    case "demography":
    case "death_memory":
    case "weak_band_fate":
      return "demography";
    case "movement":
    case "camp_place":
      return "movement_place";
    case "lineage":
    case "inner_fission":
      return "origin_lineage";
    case "resource_ecology":
    case "survival":
    case "body_logistics":
      return "food_water_pressure";
    case "relationship_memory":
    case "social_tension":
    case "access_norms":
      return "contact_social";
    case "adaptation":
    case "activity":
    case "nature":
      return "knowledge_memory";
  }
}

export function familyLabel(family: CanonicalEventFamily): string {
  switch (family) {
    case "origin_lineage":
      return "Origin / lineage";
    case "demography":
      return "Demography";
    case "movement_place":
      return "Movement / place";
    case "route_crossing":
      return "Route / crossing";
    case "knowledge_memory":
      return "Knowledge / memory";
    case "food_water_pressure":
      return "Food / water pressure";
    case "contact_social":
      return "Contact / social";
    case "historical_compression":
      return "Durable history";
  }
}

function eraHeadlineLabel(headline: BandEraHeadline): string {
  switch (headline) {
    case "steady_years":
      return "Steady years";
    case "growth_years":
      return "Growth years";
    case "hardship_years":
      return "Hardship years";
    case "loss_years":
      return "Loss years";
    case "recovery_years":
      return "Recovery years";
    case "branching_years":
      return "Branching years";
    case "wandering_years":
      return "Wandering years";
    case "settling_years":
      return "Settling years";
  }
}

function eraCloseTriggerLabel(trigger: string): string {
  return humanizeKey(trigger);
}

function episodeTitle(type: BandEpisodeType): string {
  switch (type) {
    case "population_thinned":
      return "Population thinned";
    case "population_recovered":
      return "Population recovered";
    case "daughter_branch_formed":
      return "Daughter branch formed";
    case "long_hunger_period":
      return "Long hunger period";
    case "water_caution_period":
      return "Water caution period";
    case "route_became_memory":
      return "Route became memory";
    case "country_expanded":
      return "Known country expanded";
    case "camp_became_home":
      return "Camp became home";
    case "hard_crossing_remembered":
      return "Hard crossing remembered";
    case "fallback_reliance_period":
      return "Fallback reliance period";
    case "near_collapse":
      return "Near collapse";
    case "band_absorbed_end":
      return "Band absorbed";
    case "band_collapsed_end":
      return "Band collapsed";
  }
}

function episodeConsequence(type: BandEpisodeType): string {
  switch (type) {
    case "route_became_memory":
      return "Repeated route use survived as long-history evidence.";
    case "camp_became_home":
      return "Repeated returns made the camp durable in memory.";
    case "country_expanded":
      return "Known country grew enough to survive compression.";
    case "daughter_branch_formed":
      return "The branch becomes a link between parent history and a new band record.";
    default:
      return "The episode survived compression because it had grounded evidence and enough significance.";
  }
}

function episodeActualCause(type: BandEpisodeType): string {
  switch (type) {
    case "route_became_memory":
      return "Repeated route evidence";
    case "camp_became_home":
      return "Repeated camp return evidence";
    case "country_expanded":
      return "Known-country expansion";
    case "hard_crossing_remembered":
      return "Crossing memory evidence";
    case "population_thinned":
    case "population_recovered":
    case "near_collapse":
    case "band_collapsed_end":
      return "Demographic history evidence";
    case "long_hunger_period":
    case "water_caution_period":
    case "fallback_reliance_period":
      return "Pressure history evidence";
    case "daughter_branch_formed":
      return "Fission record";
    case "band_absorbed_end":
      return "Terminal absorption record";
  }
}

function readableCategoryLabel(category: BandReadableEventCategory): string {
  switch (category) {
    case "body_logistics":
      return "Body logistics";
    case "relationship_memory":
      return "Relationship memory";
    case "weak_band_fate":
      return "Weak-band fate";
    case "death_memory":
      return "Death memory";
    case "inner_fission":
      return "Inner fission";
    case "social_tension":
      return "Social tension";
    case "access_norms":
      return "Shared access";
    case "camp_place":
      return "Camp and place";
    case "resource_ecology":
      return "Resource ecology";
    default:
      return humanizeKey(category);
  }
}

function publicReadableCategoryLabel(category: BandReadableEventCategory): string {
  switch (category) {
    case "body_logistics":
      return "Daily work";
    case "relationship_memory":
      return "Relations";
    case "weak_band_fate":
      return "Band condition";
    case "death_memory":
      return "Loss";
    case "inner_fission":
      return "Branching";
    case "social_tension":
      return "Cooperation";
    case "access_norms":
      return "Shared access";
    case "camp_place":
      return "Camp place";
    case "resource_ecology":
      return "Food and resources";
    case "activity":
      return "Daily activity";
    case "adaptation":
      return "Practice memory";
    case "nature":
      return "Living world";
    case "movement":
      return "Movement";
    case "survival":
      return "Survival pressure";
    case "demography":
      return "People";
    case "lineage":
      return "Lineage";
  }
}

function uiSafeReadableEventTitle(event: BandReadableEvent, category: BandReadableEventCategory): string {
  const title = cleanSummary(event.title);
  const normalized = title.toLowerCase();
  switch (normalized) {
    case "camp-like place fragile":
      return "Camp under pressure";
    case "camp-like place has resource reason":
      return "Camp has a food reason";
    case "remnant holdout":
      return "Small band held together";
    case "residential move recorded":
      return "Camp moved";
    case "carrying logistics strained":
      return "Daily work strained";
    case "fire work is salient":
      return "Fuel and fire work mattered";
    case "seasonal task priority":
      return "Seasonal work shifted";
    case "sickness wave":
      return "Sickness reduced spare labor";
    case "place character visible":
      return "Place pattern became clear";
    case "practice memory changed":
      return "Practice memory changed";
    case "social tension readable":
      return "Cooperation visible";
    default:
      if (looksTechnical(title) || /\b(?:salient|readable|aggregate|ui)\b/i.test(title)) {
        return publicReadableCategoryLabel(category);
      }
      return title.length === 0 ? publicReadableCategoryLabel(category) : title;
  }
}

function uiSafeReadableEventDescription(event: BandReadableEvent, category: BandReadableEventCategory): string {
  const description = ensureSentence(cleanSummary(event.description));
  const known = knownReadableDescription(description);
  if (known !== undefined) {
    return known;
  }
  if (looksTechnical(description) || /\b(?:salient|bounded aggregate|readable|ui)\b/i.test(description)) {
    return `${publicReadableCategoryLabel(category)} changed in a recent record.`;
  }
  return description
    .replace(/\bhelps explain why this place matters\b/i, "helps explain why this place matters")
    .replace(/\bsalient\b/gi, "important")
    .replace(/\breadable\b/gi, "visible");
}

function knownReadableDescription(description: string): string | undefined {
  const normalized = description.toLowerCase();
  if (normalized.includes("this camp-like place is useful but worn")) {
    return "A useful camp place is under pressure from risk, wear, or hardship.";
  }
  if (normalized.includes("a weak remnant is holding together")) {
    return "A small band is still holding near a familiar refuge.";
  }
  if (normalized.includes("adult labor, care work, carrying load")) {
    return "Care work, carrying loads, or crossings are narrowing what the band can safely do.";
  }
  if (normalized.includes("fire would help")) {
    return "Fuel and labor limits make fire work harder.";
  }
  if (normalized.includes("storable pulses") && normalized.includes("perishable food")) {
    return "Seasonal food is making processing and fuel work more important.";
  }
  if (normalized.includes("recent pressure is easing")) {
    return "Pressure has eased enough for rest and recovery to matter.";
  }
  if (normalized.includes("bounded aggregate sickness wave")) {
    return "Sickness is reducing spare labor and increasing care needs.";
  }
  if (normalized.includes("cold route is emerging")) {
    return "Repeated conditions are making this route feel colder or harder.";
  }
  if (normalized.includes("plant gathering is reliable")) {
    return "Repeated activity made plant gathering more reliable.";
  }
  if (normalized.includes("unified; trusted cooperation")) {
    return "The band is holding together with trusted cooperation.";
  }
  if (normalized.includes("fish / shellfish helps explain")) {
    return "Fish and shellfish help explain why this camp matters.";
  }
  return undefined;
}

function looksTechnical(text: string): boolean {
  return /\b(?:band|tile|route|event|stock|fauna|patch|reason|decision):[a-z0-9]/i.test(text) ||
    /(?:\braw\b|[a-z]+_[a-z]+|;.*;.*;)/i.test(text) ||
    text.length > 220;
}

function residentialMoveTitle(event: ResidentialMoveEvent): string {
  if (event.status === "failed_no_route") {
    return "Move could not find a route";
  }
  if (event.moveKind === "daughter_colonization_move") {
    return "Daughter moved out";
  }
  return "Camp moved";
}

function residentialMoveSummary(event: ResidentialMoveEvent): string {
  switch (event.moveKind) {
    case "emergency_water_move":
      return "Water pressure pushed a camp move.";
    case "food_pressure_move":
      return "Food pressure pushed a camp move.";
    case "crowding_pressure_move":
      return "Local pressure pushed the camp away from a crowded place.";
    case "frontier_probe_residential_shift":
      return "The band shifted camp while testing nearby country.";
    case "daughter_colonization_move":
      return "A daughter band moved into its own range.";
    case "seasonal_strategy_future":
      return "A seasonal move was recorded.";
    case "residential_relocation":
      return "The band moved its main camp.";
  }
}

function formatMoveDistance(distanceTiles: number): string {
  return distanceTiles === 1 ? "It moved 1 tile" : `It moved ${distanceTiles} tiles`;
}

function residentialMoveStatusLine(event: ResidentialMoveEvent): string {
  switch (event.status) {
    case "arrived":
      return "arrived";
    case "failed_no_route":
      return "could not find a passable route";
    case "planned":
      return "was planned";
    case "in_progress_placeholder":
      return "was still in progress";
    case "delayed_placeholder":
      return "was delayed";
  }
}

function residentialMoveCauseLine(cause: ResidentialMoveEvent["cause"]): string {
  switch (cause) {
    case "water_stress":
      return "water pressure";
    case "poor_return":
      return "poor food return";
    case "local_pressure":
      return "local pressure";
    case "known_opportunity":
      return "known opportunity";
    case "fission_daughter":
      return "daughter fission";
    case "frontier_intent":
      return "nearby country";
    case "seasonal_refuge_future":
      return "seasonal refuge";
    case "unknown":
      return "recorded move";
  }
}

function estimateYearFromTick(tick: TickNumber, band: Band): number {
  const recent = band.eventHistory?.recentEvents.find((event) => event.tick === tick);
  return recent?.year ?? band.deepHistory?.lastAdvancedYear ?? 0;
}

function canonicalId(band: Band, kind: string, suffix: string | number): string {
  return `canonical-event:${String(band.id)}:${kind}:${String(suffix).replace(/\s+/g, "-")}`;
}

function formatYearRange(startYear: number, endYear: number): string {
  return startYear === endYear ? `Year ${startYear}` : `Years ${startYear}-${endYear}`;
}

function yearRange(events: readonly CanonicalEvent[]): { readonly start: number; readonly end: number } | undefined {
  if (events.length === 0) {
    return undefined;
  }
  return {
    start: Math.min(...events.map((event) => event.startYear)),
    end: Math.max(...events.map((event) => event.endYear)),
  };
}

function ensureSentence(text: string): string {
  const clean = cleanSummary(text);
  if (clean.length === 0) {
    return clean;
  }
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function cleanSummary(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function humanizeKey(key: string): string {
  const normalized = key.replace(/[_.-]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? "unknown" : `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function compactIds<T extends string>(ids: readonly (T | undefined)[]): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const id of ids) {
    if (id === undefined || seen.has(String(id))) {
      continue;
    }
    seen.add(String(id));
    result.push(id);
  }
  return result;
}

function capIds<T extends string>(ids: readonly (T | undefined)[], cap: number): readonly T[] {
  return compactIds(ids).slice(0, cap);
}

function capStrings(values: readonly (string | undefined)[], cap: number): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value === undefined || value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
    if (result.length >= cap) {
      break;
    }
  }
  return result;
}

function byteLengthUtf8(value: string): number {
  return new TextEncoder().encode(value).length;
}
