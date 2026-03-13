import type { BandId, EventId, ReasonId, RouteId, TickNumber, TileId } from "../core/types";
import type { WorldState } from "../world/types";
import type {
  Band,
  BandDeepHistoryState,
  BandReadableEvent,
  BandReadableEventCategory,
  CampRumorReadabilityItem,
  CampTalkCategory,
  CampTalkRepetitionRecord,
  DemographicChurnRecord,
  HistoryEvidenceRef,
  ProtoAccessMemoryState,
  ProtoCampPlaceMemory,
  ResidentialMoveEvent,
  SeasonalSupportSample,
} from "./types";
import { deriveFamiliarCountry } from "./familiarCountry";
import { deriveMemoryReferents } from "./memoryReferents";
import type { MemoryReferent, MemoryReferentKind, MemoryReferentState } from "./memoryReferents";

const YEAR_ENTRY_CAP = 12;
const MAJOR_ARC_CAP = 6;
const MAJOR_EVENT_CAP = 10;
const IMPORTANT_PLACE_CAP = 8;
const IMPORTANT_ROUTE_CAP = 6;
const IMPORTANT_RESOURCE_CAP = 8;
const IMPORTANT_RELATION_CAP = 6;
const TALK_THEME_CAP = 8;
const LINK_TARGET_CAP = 40;
const PROOF_ID_CAP = 12;
const YEAR_SOURCE_CAP = 5;
const TECHNICAL_PROOF_SECTION_CAP = 16;

// BAND-CHRONICLE-WIKI-EXPANSION-1 — bounded wiki/article layer. Caps are sized
// so the whole selected-band projection (foundation + wiki) stays inside the
// foundation audit's 80KB payload bound.
const EPISODE_CAP = 5;
const EPISODE_SOURCE_ID_CAP = 4;
const PERIOD_CAP = 8;
const ARTICLE_SECTION_CAP = 6;
const SECTION_PARAGRAPH_CAP = 3;
const LEAD_PARAGRAPH_CAP = 3;
const INFOBOX_FACT_CAP = 13;
const SEGMENTS_PER_PARAGRAPH_CAP = 24;
// Per-kind caps sum to less than PAGE_TOTAL_CAP so no kind is starved by
// assembly order (resources are built last and must still get pages).
const PAGE_TOTAL_CAP = 40;
const YEAR_PAGE_CAP = 5;
const EVENT_PAGE_CAP = 5;
const REFERENT_PAGE_CAP = 5;
const PLACE_PAGE_CAP = 6;
const ROUTE_PAGE_CAP = 6;
const RESOURCE_PAGE_CAP = 6;
const RELATED_LINKS_PER_PAGE_CAP = 4;
const PAGE_FACT_CAP = 6;
const PAGE_PARAGRAPH_CAP = 4;
const TEMPLATE_PROOF_CAP = 16;
// 1C — century-scale framing: bands older than this get a long-story lead and
// era list built from durable signals; SLACK is how much older than the
// detailed window a band must be before "detail vs older story" wording kicks in.
const LONG_STORY_MIN_AGE_YEARS = 40;
const LONG_STORY_SLACK_YEARS = 10;
const ERA_CAP = 5;
const DEEP_HISTORY_ERA_DISPLAY_CAP = 5;
const DEEP_HISTORY_EPISODE_DISPLAY_CAP = 6;
const DEEP_HISTORY_INHERITED_DISPLAY_CAP = 4;
const DEEP_HISTORY_EVIDENCE_CHIP_CAP = 3;

export type BandChronicleSectionId =
  | "summary"
  | "current"
  | "recent-years"
  | "major-arcs"
  | "places"
  | "food-ecology"
  | "movement-routes"
  | "people-social"
  | "talk-memory"
  | "concrete-referents"
  | "technical-proof";

export type BandChronicleArcKind =
  | "decline"
  | "recovery"
  | "hunger"
  | "movement"
  | "camp"
  | "resource"
  | "ecology"
  | "social"
  | "lineage"
  // BAND-CHRONICLE-WIKI-EXPANSION-1 — long-term multi-cause trap stories.
  | "stagnation"
  | "logistics"
  | "foothold";

export type BandChronicleLinkKind =
  | "band"
  | "event"
  | "arc"
  | "place"
  | "route"
  | "resource"
  | "referent"
  | "ecology"
  | "year"
  | "future-hook";

export interface BandChronicleLinkTarget {
  readonly id: string;
  readonly kind: BandChronicleLinkKind;
  readonly label: string;
  readonly sectionId: BandChronicleSectionId;
  readonly targetBandId?: BandId;
  readonly targetEventId?: EventId;
  readonly targetTileId?: TileId;
  readonly targetRouteId?: RouteId;
  readonly targetReferentId?: string;
  readonly targetYear?: number;
  readonly inactiveFutureHook?: true;
}

export interface BandChronicleYearEntry {
  readonly id: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly title: string;
  readonly summary: string;
  readonly compressed: boolean;
  readonly dominantSignals: readonly string[];
  readonly importanceScore: number;
  readonly sourceEventIds: readonly EventId[];
  readonly sourceTalkIds: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
  readonly linkTargetIds: readonly string[];
}

export interface BandChronicleMajorArc {
  readonly id: string;
  readonly kind: BandChronicleArcKind;
  readonly startYear: number;
  readonly endYear: number;
  readonly title: string;
  readonly summary: string;
  readonly causeLines: readonly string[];
  readonly consequenceLines: readonly string[];
  readonly score: number;
  readonly sourceEventIds: readonly EventId[];
  readonly sourceTalkIds: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
  readonly linkTargetIds: readonly string[];
}

export interface BandChronicleMajorEvent {
  readonly id: string;
  readonly eventId: EventId;
  readonly year: number;
  readonly season: string;
  readonly title: string;
  readonly summary: string;
  readonly category: BandReadableEventCategory;
  readonly categoryLabel: string;
  readonly score: number;
  readonly whyIncluded: string;
  readonly linkTargetIds: readonly string[];
}

export interface BandChroniclePlaceSummary {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly score: number;
  readonly tileId?: TileId;
  readonly linkTargetId: string;
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface BandChronicleRouteSummary {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly score: number;
  readonly routeId?: RouteId;
  readonly tileId?: TileId;
  readonly linkTargetId: string;
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface BandChronicleResourceSummary {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly score: number;
  readonly linkTargetId: string;
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface BandChronicleRelationSummary {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly score: number;
  readonly relatedBandId?: BandId;
  readonly linkTargetId: string;
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface BandChronicleTalkTheme {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly sourceCategory: CampTalkCategory;
  readonly score: number;
  readonly sourceTalkIds: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface BandChronicleDeclineRecoverySignal {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly signalKind: "decline" | "recovery" | "collapse" | "stable";
  readonly sourceReasonIds: readonly ReasonId[];
}

export interface BandChronicleTechnicalProof {
  readonly generatedForTick: TickNumber;
  readonly sourceEventCount: number;
  readonly sourceTalkItemCount: number;
  readonly sourceTalkLedgerCount: number;
  readonly yearlyEntryCap: number;
  readonly majorArcCap: number;
  readonly majorEventCap: number;
  readonly linkTargetCap: number;
  readonly proofIdCap: number;
  readonly payloadBytesEstimate: number;
  readonly selectedBandOnly: true;
  readonly bounded: true;
  readonly antiOmniscience: {
    readonly bandKnownEventsOnly: true;
    readonly bandKnownTalkOnly: true;
    readonly hiddenMapTruthUsed: false;
    readonly hiddenBandTruthUsed: false;
  };
  readonly futureHooksReserved: readonly string[];
  readonly arcProof: readonly BandChronicleArcProof[];
  readonly eventProof: readonly BandChronicleEventProof[];
  readonly yearProof: readonly BandChronicleYearProof[];
  // BAND-CHRONICLE-WIKI-EXPANSION-1 — wiki layer proof.
  readonly episodeProof: readonly BandChronicleEpisodeProof[];
  readonly pageProof: readonly BandChroniclePageProof[];
  readonly pageCountsByKind: Readonly<Record<BandChroniclePageKind, number>>;
  readonly linkGraph: BandChronicleLinkGraphProof;
  readonly templateKeysUsed: readonly string[];
  readonly templateVariationCount: number;
  readonly droppedByCap: {
    readonly yearlyEntries: number;
    readonly majorArcs: number;
    readonly majorEvents: number;
    readonly linkTargets: number;
    readonly episodes: number;
    readonly pages: number;
  };
}

export interface BandChronicleArcProof {
  readonly arcId: string;
  readonly kind: BandChronicleArcKind;
  readonly score: number;
  readonly sourceEventIds: readonly string[];
  readonly sourceTalkIds: readonly string[];
  readonly sourceReasonIds: readonly string[];
  readonly scoringReasons: readonly string[];
}

export interface BandChronicleEventProof {
  readonly eventId: string;
  readonly category: BandReadableEventCategory;
  readonly salience: string;
  readonly score: number;
  readonly scoringReasons: readonly string[];
  readonly sourceReasonIds: readonly string[];
}

export interface BandChronicleYearProof {
  readonly id: string;
  readonly yearRange: string;
  readonly compressed: boolean;
  readonly sourceEventIds: readonly string[];
  readonly sourceTalkIds: readonly string[];
  readonly sourceReasonIds: readonly string[];
  readonly dominantSignals: readonly string[];
}

// ---------------------------------------------------------------------------
// BAND-CHRONICLE-WIKI-EXPANSION-1 — article, episode correlation, and pages.
// The chronicle is no longer a stack of card lists: it carries a readable
// article (lead, infobox, chronological period prose, thematic sections) whose
// paragraphs embed inline wiki links, plus focused pages the UI can open for
// years, long arcs (periods), events, memory referents, places, routes, and
// resources. Everything is derived from band-known inputs only.
// ---------------------------------------------------------------------------

export interface BandChronicleTextSegment {
  readonly text: string;
  /** Resolvable wiki link (page id or link-target id). Sanitized: never broken. */
  readonly linkId?: string;
}

export interface BandChronicleParagraph {
  readonly id: string;
  readonly segments: readonly BandChronicleTextSegment[];
}

export interface BandChronicleInfoboxFact {
  readonly label: string;
  readonly value: string;
  readonly linkId?: string;
}

export interface BandChroniclePeriod {
  readonly id: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly title: string;
  readonly paragraphs: readonly BandChronicleParagraph[];
  /** Year pages the reader can expand for the individual years of this stretch. */
  readonly yearPageIds: readonly string[];
  readonly sourceYearEntryId: string;
}

export interface BandChronicleArticleSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly BandChronicleParagraph[];
}

export interface BandChronicleEra {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

export interface BandChronicleDeepHistoryEvidenceChip {
  readonly label: string;
}

export interface BandChronicleDeepHistoryComparison {
  readonly foundedLine: string;
  readonly nowLine: string;
  readonly changeLine: string;
  readonly inheritanceLine?: string;
  readonly terminalLine?: string;
}

export interface BandChronicleDeepHistoryEra {
  readonly id: string;
  readonly title: string;
  readonly yearRange: string;
  readonly summary: string;
  readonly evidenceChips: readonly BandChronicleDeepHistoryEvidenceChip[];
  readonly compressed: boolean;
}

export interface BandChronicleDeepHistoryEpisode {
  readonly id: string;
  readonly title: string;
  readonly yearRange: string;
  readonly summary: string;
  readonly provenance: "lived" | "inherited";
  readonly evidenceChips: readonly BandChronicleDeepHistoryEvidenceChip[];
}

export interface BandChronicleDeepHistorySummary {
  readonly ageYears: number;
  readonly durableRange: string;
  readonly recentRange?: string;
  readonly memoryBoundaryLine: string;
  readonly comparison: BandChronicleDeepHistoryComparison;
  readonly eras: readonly BandChronicleDeepHistoryEra[];
  readonly episodes: readonly BandChronicleDeepHistoryEpisode[];
  readonly inherited: readonly BandChronicleDeepHistoryEpisode[];
  readonly countsLine: string;
}

type BandChronicleDeepHistoryEraRecord = BandDeepHistoryState["eras"][number];
type BandChronicleDeepHistoryEpisodeRecord = BandDeepHistoryState["episodes"][number];

export interface BandChronicleArticle {
  readonly leadParagraphs: readonly BandChronicleParagraph[];
  readonly infobox: readonly BandChronicleInfoboxFact[];
  readonly contents: readonly { readonly id: string; readonly title: string }[];
  /**
   * UI-READABILITY-CHRONICLE-ACTIVITY-POLISH-1C — century-scale framing.
   * The detailed yearly record is bounded recent memory; for long-lived bands
   * these paragraphs tell the longer story from durable signals (known
   * country, route/crossing persistence, food knowledge, population shape,
   * lineage) so a hundred years feels like a hundred years.
   */
  readonly longStory: readonly BandChronicleParagraph[];
  readonly eras: readonly BandChronicleEra[];
  readonly deepHistory?: BandChronicleDeepHistorySummary;
  /** Human explanation of what the detailed record covers; empty when young. */
  readonly coverageNote?: string;
  readonly periods: readonly BandChroniclePeriod[];
  readonly sections: readonly BandChronicleArticleSection[];
}

export type BandChroniclePageKind =
  | "year"
  | "period"
  | "event"
  | "referent"
  | "place"
  | "route"
  | "resource";

export interface BandChroniclePageFact {
  readonly label: string;
  readonly value: string;
}

export interface BandChroniclePage {
  readonly id: string;
  readonly kind: BandChroniclePageKind;
  readonly title: string;
  readonly subtitle?: string;
  readonly paragraphs: readonly BandChronicleParagraph[];
  readonly facts: readonly BandChroniclePageFact[];
  readonly relatedLinkIds: readonly string[];
}

/**
 * Correlation layer: repeated identical event states are merged into one
 * historical episode instead of showing as duplicate cards. Episodes are the
 * evidence bridge between raw events and long arcs.
 */
export interface BandChronicleEpisode {
  readonly id: string;
  readonly category: BandReadableEventCategory;
  readonly title: string;
  readonly summary: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly occurrenceCount: number;
  readonly sourceEventIds: readonly EventId[];
  readonly linkTargetIds: readonly string[];
}

export interface BandChronicleEpisodeProof {
  readonly episodeId: string;
  readonly category: BandReadableEventCategory;
  readonly occurrenceCount: number;
  readonly sourceEventIds: readonly string[];
}

export interface BandChroniclePageProof {
  readonly pageId: string;
  readonly kind: BandChroniclePageKind;
  readonly paragraphCount: number;
  readonly relatedLinkCount: number;
}

export interface BandChronicleLinkGraphProof {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly brokenLinkCount: number;
  readonly unresolvedDroppedCount: number;
}

export interface BandChronicleState {
  readonly bandId: BandId;
  readonly headline: string;
  readonly shortArticleSummary: string;
  readonly currentEra: string;
  readonly currentSituation: string;
  readonly yearlyEntries: readonly BandChronicleYearEntry[];
  readonly majorArcs: readonly BandChronicleMajorArc[];
  readonly majorEvents: readonly BandChronicleMajorEvent[];
  readonly importantPlaces: readonly BandChroniclePlaceSummary[];
  readonly importantRoutes: readonly BandChronicleRouteSummary[];
  readonly importantResources: readonly BandChronicleResourceSummary[];
  readonly importantRelations: readonly BandChronicleRelationSummary[];
  readonly talkThemes: readonly BandChronicleTalkTheme[];
  readonly declineRecoverySignals: readonly BandChronicleDeclineRecoverySignal[];
  readonly linkTargets: readonly BandChronicleLinkTarget[];
  // BAND-CHRONICLE-WIKI-EXPANSION-1 — wiki/article layer.
  readonly episodes: readonly BandChronicleEpisode[];
  readonly article: BandChronicleArticle;
  readonly pages: readonly BandChroniclePage[];
  readonly technicalProof: BandChronicleTechnicalProof;
}

interface ChronicleContext {
  readonly world: WorldState;
  readonly band: Band;
  readonly events: readonly BandReadableEvent[];
  readonly talkItems: readonly CampRumorReadabilityItem[];
  readonly talkLedger: readonly CampTalkRepetitionRecord[];
  readonly eventScores: ReadonlyMap<string, EventScore>;
  readonly yearFacts: readonly YearFact[];
  readonly linkBuilder: LinkBuilder;
}

interface EventScore {
  readonly event: BandReadableEvent;
  readonly score: number;
  readonly reasons: readonly string[];
}

interface YearFact {
  readonly year: number;
  readonly events: readonly BandReadableEvent[];
  readonly talkItems: readonly CampRumorReadabilityItem[];
  readonly talkRecords: readonly CampTalkRepetitionRecord[];
  readonly residentialMoves: readonly ResidentialMoveEvent[];
  readonly demographicRecord?: DemographicChurnRecord;
  readonly seasonalSamples: readonly SeasonalSupportSample[];
  readonly signals: readonly string[];
  readonly signature: string;
  readonly score: number;
  readonly summaryLines: readonly string[];
  readonly reasonIds: readonly ReasonId[];
}

interface ArcDraft {
  readonly kind: BandChronicleArcKind;
  readonly title: string;
  readonly summary: string;
  readonly startYear: number;
  readonly endYear: number;
  readonly score: number;
  readonly causeLines: readonly string[];
  readonly consequenceLines: readonly string[];
  readonly sourceEvents: readonly BandReadableEvent[];
  readonly sourceTalkIds: readonly string[];
  readonly sourceReasonIds: readonly ReasonId[];
  readonly scoringReasons: readonly string[];
  readonly linkLabels: readonly string[];
}

class LinkBuilder {
  private readonly targets = new Map<string, BandChronicleLinkTarget>();

  add(target: BandChronicleLinkTarget): string {
    if (this.targets.size >= LINK_TARGET_CAP && !this.targets.has(target.id)) {
      return target.id;
    }

    this.targets.set(target.id, target);
    return target.id;
  }

  addBand(label: string, sectionId: BandChronicleSectionId, bandId: BandId): string {
    return this.add({
      id: `band:${String(bandId)}`,
      kind: "band",
      label,
      sectionId,
      targetBandId: bandId,
    });
  }

  addYear(year: number): string {
    return this.add({
      id: `year:${year}`,
      kind: "year",
      label: `Year ${year}`,
      sectionId: "recent-years",
      targetYear: year,
    });
  }

  addEvent(event: BandReadableEvent): string {
    return this.add({
      id: `event:${String(event.eventId)}`,
      kind: "event",
      label: cleanPlayerText(event.title),
      sectionId: "major-arcs",
      targetEventId: event.eventId,
      targetYear: event.year,
    });
  }

  addArc(id: string, label: string): string {
    return this.add({
      id,
      kind: "arc",
      label,
      sectionId: "major-arcs",
    });
  }

  addPlace(id: string, label: string, tileId: TileId | undefined): string {
    return this.add({
      id,
      kind: "place",
      label,
      sectionId: "places",
      targetTileId: tileId,
    });
  }

  addRoute(id: string, label: string, routeId: RouteId | undefined, tileId: TileId | undefined): string {
    return this.add({
      id,
      kind: "route",
      label,
      sectionId: "movement-routes",
      targetRouteId: routeId,
      targetTileId: tileId,
    });
  }

  addResource(id: string, label: string): string {
    return this.add({
      id,
      kind: "resource",
      label,
      sectionId: "food-ecology",
    });
  }

  addReferent(id: string, label: string): string {
    return this.add({
      id: `referent:${id}`,
      kind: "referent",
      label,
      sectionId: "concrete-referents",
      targetReferentId: id,
    });
  }

  addEcology(id: string, label: string): string {
    return this.add({
      id,
      kind: "ecology",
      label,
      sectionId: "food-ecology",
    });
  }

  addFutureHook(id: string, label: string): string {
    return this.add({
      id,
      kind: "future-hook",
      label,
      sectionId: "technical-proof",
      inactiveFutureHook: true,
    });
  }

  list(): readonly BandChronicleLinkTarget[] {
    return [...this.targets.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, LINK_TARGET_CAP);
  }

  attemptedCount(): number {
    return this.targets.size;
  }
}

export function deriveBandChronicle(world: WorldState, band: Band): BandChronicleState {
  const events = [...uniqueEvents([
    ...(band.eventHistory?.last25Years ?? []),
    ...(band.eventHistory?.last10Years ?? []),
    ...(band.eventHistory?.recentEvents ?? []),
  ])].sort(compareEventsOldestFirst);
  const eventScores = scoreEvents(events, world.time.year);
  const linkBuilder = new LinkBuilder();
  linkBuilder.addBand(band.name, "summary", band.id);
  const memoryReferents = deriveMemoryReferents(world, band);
  for (const referent of memoryReferents.referents.slice(0, REFERENT_PAGE_CAP)) {
    linkBuilder.addReferent(referent.id, referent.shortLabel);
  }

  for (const hook of futureHookLabels()) {
    linkBuilder.addFutureHook(hook.id, hook.label);
  }

  const baseContext: ChronicleContext = {
    world,
    band,
    events,
    talkItems: band.campRumors?.items ?? [],
    talkLedger: band.campRumors?.repetitionLedger ?? [],
    eventScores,
    yearFacts: [],
    linkBuilder,
  };
  const yearFacts = buildYearFacts(baseContext);
  const context: ChronicleContext = { ...baseContext, yearFacts };
  const yearlyEntries = buildYearEntries(context);
  const majorEvents = buildMajorEvents(context);
  const majorArcs = buildMajorArcs(context);
  const importantPlaces = buildImportantPlaces(context);
  const importantRoutes = buildImportantRoutes(context);
  const importantResources = buildImportantResources(context);
  const importantRelations = buildImportantRelations(context);
  const talkThemes = buildTalkThemes(context);
  const declineRecoverySignals = buildDeclineRecoverySignals(context, majorArcs);
  const tracker: WikiTracker = { templateKeys: new Set<string>() };
  const episodesBuilt = buildEpisodes(context, tracker);
  const wiki = buildWikiLayer({
    context,
    tracker,
    yearlyEntries,
    majorArcs,
    majorEvents,
    importantPlaces,
    importantRoutes,
    importantResources,
    importantRelations,
    talkThemes,
    episodes: episodesBuilt.episodes,
    memoryReferents,
  });
  const linkTargets = linkBuilder.list();
  const sanitized = sanitizeWikiLinks(wiki.article, wiki.pages, linkTargets);
  const technicalProof = buildTechnicalProof({
    context,
    yearlyEntries,
    majorEvents,
    majorArcs,
    linkTargets,
    attemptedLinkCount: linkBuilder.attemptedCount(),
    episodes: episodesBuilt.episodes,
    episodesDropped: episodesBuilt.dropped,
    article: sanitized.article,
    pages: sanitized.pages,
    pagesDropped: wiki.pagesDropped,
    linkGraph: sanitized.linkGraph,
    tracker,
  });

  return {
    bandId: band.id,
    headline: buildHeadline(band),
    shortArticleSummary: buildShortArticleSummary(context, majorArcs, importantPlaces, importantResources),
    currentEra: buildCurrentEra(context, majorArcs),
    currentSituation: buildCurrentSituation(context),
    yearlyEntries,
    majorArcs,
    majorEvents,
    importantPlaces,
    importantRoutes,
    importantResources,
    importantRelations,
    talkThemes,
    declineRecoverySignals,
    linkTargets,
    episodes: episodesBuilt.episodes,
    article: sanitized.article,
    pages: sanitized.pages,
    technicalProof,
  };
}

function buildHeadline(band: Band): string {
  const lineage = band.lineageReadability?.generationLabel;
  const active = band.lineageReadability?.activeStatus;

  if (active === "absorbed") {
    return `${band.name}, a band whose independent line was absorbed`;
  }

  if (active === "extinct" || band.viability?.status === "extinct") {
    return `${band.name}, a band that disappeared from the record`;
  }

  if (lineage !== undefined && lineage !== "origin") {
    return `${band.name}, ${articleFor(lineage)} ${lineage} band`;
  }

  return `${band.name}, an origin band`;
}

function buildShortArticleSummary(
  context: ChronicleContext,
  arcs: readonly BandChronicleMajorArc[],
  places: readonly BandChroniclePlaceSummary[],
  resources: readonly BandChronicleResourceSummary[],
): string {
  const { band, world } = context;
  const mainArc = arcs[0];
  const place = places[0]?.label;
  const resource = resources[0]?.label;
  const current = buildCurrentConditionPhrase(band);
  const firstRecordedYear = context.yearFacts[0]?.year ?? world.time.year;
  const chronicleAge = world.time.year - (band.lineage?.createdAt.year ?? 0);
  const period = context.yearFacts.length === 0 || firstRecordedYear >= world.time.year
    ? `The recorded chronicle has just begun (Year ${world.time.year}).`
    : chronicleAge > world.time.year - firstRecordedYear + 10
      ? `Detailed records cover Years ${firstRecordedYear}–${world.time.year}; the older story survives in places, routes, and people.`
      : `The recorded chronicle covers Years ${firstRecordedYear}–${world.time.year}.`;

  if (mainArc !== undefined) {
    return joinSentences([
      `${band.name} is ${current}.`,
      period,
      `${mainArc.summary}`,
      place === undefined ? undefined : `The most important remembered place is ${lowerFirst(place)}.`,
      resource === undefined ? undefined : `Food history most often points to ${lowerFirst(resource)}.`,
    ]);
  }

  return joinSentences([
    `${band.name} is ${current}.`,
    period,
    place === undefined ? "No single place dominates the recorded history yet." : `${place} is the strongest place in the record.`,
    resource === undefined ? undefined : `${resource} is the clearest food or ecology theme.`,
  ]);
}

function buildCurrentEra(context: ChronicleContext, arcs: readonly BandChronicleMajorArc[]): string {
  const { band, world } = context;
  const strongest = arcs[0];

  if (band.viability?.status === "extinct") {
    return `Ended by year ${world.time.year}`;
  }

  if (band.viability?.status === "absorbed") {
    return `Absorbed by year ${world.time.year}`;
  }

  if (strongest !== undefined && strongest.kind === "recovery") {
    return "Recovery after pressure";
  }

  if (strongest !== undefined && (strongest.kind === "decline" || strongest.kind === "hunger")) {
    return "A pressured survival period";
  }

  if (strongest !== undefined && strongest.kind === "movement") {
    return "A route-making period";
  }

  if (band.protoCampMemory?.currentPlace !== undefined) {
    return "A camp-centered period";
  }

  return "A mobile foraging period";
}

function buildCurrentSituation(context: ChronicleContext): string {
  const { band } = context;
  const pieces = [
    buildCurrentConditionPhrase(band),
    buildCurrentPlacePhrase(band),
    buildCurrentFoodPhrase(band),
    buildCurrentSocialPhrase(band),
  ];

  return sentenceCase(joinClauses(pieces));
}

function buildCurrentConditionPhrase(band: Band): string {
  if (band.viability?.status === "extinct") {
    return "no longer recorded as an independent group";
  }

  if (band.viability?.status === "absorbed") {
    return "remembered as an absorbed remnant";
  }

  if (band.viability?.status === "nonviable" || band.viability?.weakBandFate === "collapse_risk") {
    return "in a fragile, high-risk condition";
  }

  if (band.seasonalSupport?.hungerClassification === "recovery_after_crisis" || band.bodyCampLogistics?.mode === "recovering") {
    return "recovering from recent pressure";
  }

  if (band.seasonalSupport?.hungerClassification === "crisis_deficit") {
    return "in a survival crisis";
  }

  if (band.seasonalSupport?.hungerClassification !== undefined && band.seasonalSupport.hungerClassification !== "stable") {
    return "under food or water pressure";
  }

  if (band.innerFission?.state === "near_split" || band.innerFission?.state === "split_delayed") {
    return "held together under internal split pressure";
  }

  return "still active and independently organized";
}

function buildCurrentPlacePhrase(band: Band): string | undefined {
  const place = band.protoCampMemory?.currentPlace;

  if (place === undefined || place.campLikeState === "none") {
    return undefined;
  }

  if (place.usePressureStatus === "overused" || place.campLikeState === "fragile_camp_like_place") {
    return "living around a useful but worn camp-like place";
  }

  if (place.campLikeState === "crossing_camp") {
    return "living around a remembered crossing camp";
  }

  if (place.seasonalIdentity !== "general_return_place") {
    return `living around ${seasonalIdentityPhrase(place.seasonalIdentity)}`;
  }

  return "living around a familiar return place";
}

function buildCurrentFoodPhrase(band: Band): string | undefined {
  const support = band.resourceEcology?.support;
  const fallback = support?.fallbackContribution ?? 0;
  const aquatic = support?.aquaticContribution ?? 0;
  const plant = support?.plantContribution ?? 0;

  if (fallback > Math.max(plant, aquatic) && fallback > 0.15) {
    return "leaning heavily on fallback foods";
  }

  if (aquatic > Math.max(plant, fallback) && aquatic > 0.15) {
    return "with water-edge foods carrying much of the food story";
  }

  if (plant > Math.max(aquatic, fallback) && plant > 0.15) {
    return "with plant gathering central to support";
  }

  return undefined;
}

function buildCurrentSocialPhrase(band: Band): string | undefined {
  if (band.viability?.status === "absorbed" && band.viability.absorbedByBandId !== undefined) {
    return "its independent history ending through absorption by a known band";
  }

  if ((band.socialTension?.socialTensionPressure ?? 0) >= 0.55) {
    return "with social tension shaping what people can agree to do";
  }

  if ((band.relationshipMemory?.seasonalAggregations.length ?? 0) > 0) {
    return "with repeated gatherings and remembered relationships in the background";
  }

  return undefined;
}

function scoreEvents(
  events: readonly BandReadableEvent[],
  currentYear: number,
): ReadonlyMap<string, EventScore> {
  const categoryCounts = new Map<BandReadableEventCategory, number>();
  const stateCounts = new Map<string, number>();

  for (const event of events) {
    categoryCounts.set(event.category, (categoryCounts.get(event.category) ?? 0) + 1);
    stateCounts.set(event.stateKey, (stateCounts.get(event.stateKey) ?? 0) + 1);
  }

  const scores = new Map<string, EventScore>();
  for (const event of events) {
    const reasons: string[] = [];
    let score = 0;

    if (event.salience === "high") {
      score += 42;
      reasons.push("high salience");
    } else if (event.salience === "medium") {
      score += 24;
      reasons.push("medium salience");
    } else {
      score += 10;
      reasons.push("low salience");
    }

    const categoryWeight = categoryRelevanceWeight(event.category);
    score += categoryWeight;
    reasons.push(`${categoryLabel(event.category)} relevance`);

    const age = Math.max(0, currentYear - event.year);
    score += Math.max(0, 18 - age);
    if (age <= 3) {
      reasons.push("recent enough to explain the present");
    }

    const recurrence = stateCounts.get(event.stateKey) ?? 0;
    if (recurrence > 1) {
      score += Math.min(14, recurrence * 4);
      reasons.push("recurring state");
    }

    const categoryCount = categoryCounts.get(event.category) ?? 0;
    if (categoryCount >= 3) {
      score += 8;
      reasons.push("part of a repeated category");
    }

    if (event.relatedTileId !== undefined || event.relatedBandId !== undefined) {
      score += 5;
      reasons.push("linked to a place or band");
    }

    scores.set(String(event.eventId), { event, score, reasons });
  }

  return scores;
}

function categoryRelevanceWeight(category: BandReadableEventCategory): number {
  switch (category) {
    case "weak_band_fate":
    case "death_memory":
    case "inner_fission":
    case "lineage":
      return 24;
    case "survival":
    case "demography":
    case "movement":
      return 20;
    case "body_logistics":
    case "camp_place":
    case "resource_ecology":
    case "relationship_memory":
      return 16;
    case "nature":
    case "social_tension":
    case "access_norms":
      return 13;
    case "activity":
    case "adaptation":
      return 11;
  }
}

function buildYearFacts(context: ChronicleContext): readonly YearFact[] {
  const { band, world, events, talkItems, talkLedger } = context;
  const startYear = Math.max(0, world.time.year - (YEAR_ENTRY_CAP + 4));
  const years = new Set<number>();
  years.add(world.time.year);

  for (const event of events) {
    if (event.year >= startYear) {
      years.add(event.year);
    }
  }

  for (const record of band.demography.demographicChurn?.records ?? []) {
    if (record.year >= startYear) {
      years.add(record.year);
    }
  }

  for (const sample of band.seasonalSupport?.recentSamples ?? []) {
    if (sample.year >= startYear) {
      years.add(sample.year);
    }
  }

  for (const move of band.recentResidentialMoveEvents ?? []) {
    const moveYear = tickToYear(move.tick);
    if (moveYear >= startYear) {
      years.add(moveYear);
    }
  }

  for (const record of talkLedger) {
    const first = tickToYear(record.firstTick);
    const last = tickToYear(record.lastTick);
    if (last >= startYear) {
      years.add(Math.max(startYear, first));
      years.add(last);
    }
  }

  return [...years]
    .filter((year) => year >= startYear && year <= world.time.year)
    .sort((left, right) => left - right)
    .slice(-YEAR_ENTRY_CAP)
    .map((year) => buildYearFact(context, year, talkItems, talkLedger));
}

function buildYearFact(
  context: ChronicleContext,
  year: number,
  talkItems: readonly CampRumorReadabilityItem[],
  talkLedger: readonly CampTalkRepetitionRecord[],
): YearFact {
  const { band, events, eventScores } = context;
  const yearEvents = events.filter((event) => event.year === year);
  const yearTalkItems = year === context.world.time.year ? talkItems : [];
  const yearTalkRecords = talkLedger.filter((record) => tickToYear(record.firstTick) <= year && tickToYear(record.lastTick) >= year);
  const residentialMoves = (band.recentResidentialMoveEvents ?? []).filter((move) => tickToYear(move.tick) === year);
  const demographicRecord = band.demography.demographicChurn?.records.find((record) => record.year === year);
  const seasonalSamples = band.seasonalSupport?.recentSamples.filter((sample) => sample.year === year) ?? [];
  const signals = classifyYearSignals({ yearEvents, yearTalkItems, yearTalkRecords, residentialMoves, demographicRecord, seasonalSamples });
  const score =
    yearEvents.reduce((sum, event) => sum + (eventScores.get(String(event.eventId))?.score ?? 0), 0) +
    yearTalkRecords.reduce((sum, record) => sum + Math.min(18, record.count * 3), 0) +
    residentialMoves.length * 14 +
    (demographicRecord === undefined ? 0 : demographicRecord.deaths * 10 + demographicRecord.births * 6);
  const summaryLines = buildYearSummaryLines({
    year,
    yearEvents,
    yearTalkItems,
    yearTalkRecords,
    residentialMoves,
    demographicRecord,
    seasonalSamples,
    signals,
  });

  return {
    year,
    events: yearEvents,
    talkItems: yearTalkItems,
    talkRecords: yearTalkRecords,
    residentialMoves,
    demographicRecord,
    seasonalSamples,
    signals,
    signature: makeYearSignature(signals, yearEvents, seasonalSamples, demographicRecord),
    score,
    summaryLines,
    reasonIds: capReasonIds([
      ...yearEvents.flatMap((event) => event.sourceReasonIds),
      ...yearTalkItems.flatMap((item) => item.reasonIds),
      ...yearTalkRecords.flatMap((record) => record.reasonIds),
      ...residentialMoves.flatMap((move) => move.reasonIds),
    ]),
  };
}

function classifyYearSignals(input: {
  readonly yearEvents: readonly BandReadableEvent[];
  readonly yearTalkItems: readonly CampRumorReadabilityItem[];
  readonly yearTalkRecords: readonly CampTalkRepetitionRecord[];
  readonly residentialMoves: readonly ResidentialMoveEvent[];
  readonly demographicRecord?: DemographicChurnRecord;
  readonly seasonalSamples: readonly SeasonalSupportSample[];
}): readonly string[] {
  const signals: string[] = [];
  const categories = new Set(input.yearEvents.map((event) => event.category));
  const talkCategories = new Set<CampTalkCategory>([
    ...input.yearTalkItems.map((item) => item.category),
    ...input.yearTalkRecords.map((record) => record.sourceCategory),
  ]);
  const hungrySamples = input.seasonalSamples.filter((sample) => sample.deficitRatio >= 0.28 || sample.foodStress >= 0.32);
  const waterSamples = input.seasonalSamples.filter((sample) => sample.waterStress >= 0.32);

  if (categories.has("weak_band_fate")) {
    signals.push("weak-band pressure");
  }

  if (categories.has("survival") || hungrySamples.length > 0 || talkCategories.has("survival")) {
    signals.push("food pressure");
  }

  if (waterSamples.length > 0 || talkCategories.has("water")) {
    signals.push("water pressure");
  }

  if (categories.has("movement") || input.residentialMoves.length > 0 || talkCategories.has("movement")) {
    signals.push("movement and routes");
  }

  if (categories.has("body_logistics") || talkCategories.has("body_logistics")) {
    signals.push("body and camp strain");
  }

  if (categories.has("camp_place") || talkCategories.has("camp_place")) {
    signals.push("camp and place memory");
  }

  if (categories.has("resource_ecology") || talkCategories.has("plants") || talkCategories.has("aquatic") || talkCategories.has("storage")) {
    signals.push("food and resources");
  }

  if (categories.has("nature") || talkCategories.has("fauna") || talkCategories.has("forest") || talkCategories.has("acute_risk")) {
    signals.push("animals and ecology");
  }

  if (categories.has("demography") || (input.demographicRecord?.births ?? 0) > 0 || (input.demographicRecord?.deaths ?? 0) > 0) {
    signals.push("births and deaths");
  }

  if (categories.has("inner_fission") || categories.has("lineage") || talkCategories.has("inner_fission")) {
    signals.push("splitting and lineage");
  }

  if (categories.has("relationship_memory") || categories.has("social_tension") || categories.has("access_norms") || talkCategories.has("relationship_memory") || talkCategories.has("social_tension") || talkCategories.has("access_norms")) {
    signals.push("people and social memory");
  }

  if (signals.length === 0) {
    signals.push("stable record");
  }

  return uniqueStrings(signals).slice(0, 5);
}

function buildYearSummaryLines(input: {
  readonly year: number;
  readonly yearEvents: readonly BandReadableEvent[];
  readonly yearTalkItems: readonly CampRumorReadabilityItem[];
  readonly yearTalkRecords: readonly CampTalkRepetitionRecord[];
  readonly residentialMoves: readonly ResidentialMoveEvent[];
  readonly demographicRecord?: DemographicChurnRecord;
  readonly seasonalSamples: readonly SeasonalSupportSample[];
  readonly signals: readonly string[];
}): readonly string[] {
  const lines: string[] = [];
  const strongestEvent = [...input.yearEvents].sort(compareEventImportanceForYear)[0];
  const hungry = input.seasonalSamples.some((sample) => sample.deficitRatio >= 0.28 || sample.foodStress >= 0.32);
  const water = input.seasonalSamples.some((sample) => sample.waterStress >= 0.32);
  const deaths = input.demographicRecord?.deaths ?? 0;
  const births = input.demographicRecord?.births ?? 0;
  const repeatedTalk = [...input.yearTalkRecords].sort((left, right) => right.count - left.count)[0];

  if (strongestEvent !== undefined) {
    lines.push(cleanPlayerText(strongestEvent.description));
  }

  if (hungry && water) {
    lines.push(selectTemplate(`year:${input.year}:hunger-water`, [
      "Food and water pressure shaped most decisions.",
      "The year was dominated by the search for enough food and dependable water.",
      "Returns and water access were poor enough to shape movement and talk.",
    ]));
  } else if (hungry) {
    lines.push(selectTemplate(`year:${input.year}:hunger`, [
      "Food pressure shaped most decisions.",
      "The year was dominated by the search for enough food.",
      "Poor returns kept the band cautious.",
    ]));
  } else if (water) {
    lines.push(selectTemplate(`year:${input.year}:water`, [
      "Water pressure narrowed the band's choices.",
      "Finding dependable water shaped the year.",
      "Dryness kept movement and camp choice cautious.",
    ]));
  }

  if (input.residentialMoves.length > 0) {
    const move = input.residentialMoves[0];
    lines.push(describeResidentialMoveForChronicle(move));
  }

  // Year-anchored, template-varied churn lines: the same fact in two different
  // years must not produce byte-identical prose (BAND-CHRONICLE-WIKI-EXPANSION-1).
  if (deaths > 0 && births > 0) {
    lines.push(selectTemplate(`year:${input.year}:churn-both`, [
      `Year ${input.year} recorded ${births} birth${plural(births)} and ${deaths} death${plural(deaths)}; the balance of hands and mouths shifted both ways.`,
      `Births and deaths both mattered in Year ${input.year}: ${births} birth${plural(births)} against ${deaths} death${plural(deaths)}.`,
      `${births} birth${plural(births)} and ${deaths} death${plural(deaths)} reshaped the people in Year ${input.year}.`,
    ]));
  } else if (deaths > 0) {
    lines.push(selectTemplate(`year:${input.year}:churn-deaths`, [
      `${deaths} death${plural(deaths)} in Year ${input.year} changed the age balance and reduced the margin for work.`,
      `Death came to the band in Year ${input.year}: ${deaths} lost, and the working margin thinner for it.`,
      `Year ${input.year} took ${deaths} of the band's people and narrowed what it could attempt.`,
    ]));
  } else if (births > 0) {
    lines.push(selectTemplate(`year:${input.year}:churn-births`, [
      `${births} birth${plural(births)} in Year ${input.year} added recovery pressure and future dependents.`,
      `Year ${input.year} added ${births} birth${plural(births)} — more mouths now, more hands later.`,
      `The record for Year ${input.year} keeps ${births} birth${plural(births)} and little else so sharp.`,
    ]));
  }

  if (repeatedTalk !== undefined && repeatedTalk.count >= 2) {
    lines.push(`People kept coming back to the same point: ${sentenceCase(cleanPlayerText(repeatedTalk.lastSummary))}`);
  }

  if (lines.length === 0) {
    lines.push(selectTemplate(`year:${input.year}:quiet`, [
      `No single crisis dominates the surviving record for Year ${input.year}.`,
      `Year ${input.year} passed without a recorded crisis.`,
      `The record keeps no sharp turn for Year ${input.year}.`,
    ]));
  }

  return uniqueStrings(lines).slice(0, 4);
}

function makeYearSignature(
  signals: readonly string[],
  events: readonly BandReadableEvent[],
  seasonalSamples: readonly SeasonalSupportSample[],
  demographicRecord: DemographicChurnRecord | undefined,
): string {
  if (events.some((event) => event.salience === "high")) {
    return `high:${signals[0] ?? "record"}`;
  }

  if ((demographicRecord?.deaths ?? 0) > 0) {
    return "demography:death";
  }

  if (seasonalSamples.some((sample) => sample.deficitRatio >= 0.28 || sample.foodStress >= 0.32)) {
    return "pressure:food";
  }

  if (seasonalSamples.some((sample) => sample.waterStress >= 0.32)) {
    return "pressure:water";
  }

  return signals[0] ?? "stable record";
}

function buildYearEntries(context: ChronicleContext): readonly BandChronicleYearEntry[] {
  const groups: readonly YearFact[][] = compressYearFacts(context.yearFacts);
  const entries = groups.map((group) => makeYearEntry(context, group));
  return entries.slice(-YEAR_ENTRY_CAP);
}

function compressYearFacts(facts: readonly YearFact[]): readonly YearFact[][] {
  const groups: YearFact[][] = [];
  let current: YearFact[] = [];

  for (const fact of facts) {
    const previous = current[current.length - 1];
    const compressible =
      previous !== undefined &&
      previous.signature === fact.signature &&
      previous.score < 90 &&
      fact.score < 90 &&
      fact.year === previous.year + 1;

    if (!compressible && current.length > 0) {
      groups.push(current);
      current = [];
    }

    current.push(fact);
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function makeYearEntry(context: ChronicleContext, group: readonly YearFact[]): BandChronicleYearEntry {
  const first = group[0];
  const last = group[group.length - 1];
  const startYear = first?.year ?? context.world.time.year;
  const endYear = last?.year ?? startYear;
  const compressed = group.length > 1;
  const allEvents = group.flatMap((fact) => fact.events).slice(0, YEAR_SOURCE_CAP);
  const allTalkItems = [
    ...group.flatMap((fact) => fact.talkItems.map((item) => item.id)),
    ...group.flatMap((fact) => fact.talkRecords.map((record) => record.stateKey)),
  ].slice(0, YEAR_SOURCE_CAP);
  const signals = uniqueStrings(group.flatMap((fact) => fact.signals)).slice(0, 5);
  const reasonIds = capReasonIds(group.flatMap((fact) => fact.reasonIds));
  const linkTargetIds = uniqueStrings([
    ...group.map((fact) => context.linkBuilder.addYear(fact.year)),
    ...allEvents.map((event) => context.linkBuilder.addEvent(event)),
  ]).slice(0, 8);
  const title = compressed
    ? `Years ${startYear}-${endYear} - ${compressedYearTitle(signals)}`
    : `Year ${startYear} - ${singleYearTitle(first)}`;
  const summary = compressed
    ? buildCompressedYearSummary(group, signals)
    : sentenceCase(joinSentences(first?.summaryLines ?? ["The record is thin for this year."]));

  return {
    id: compressed ? `years:${startYear}-${endYear}` : `year:${startYear}`,
    startYear,
    endYear,
    title,
    summary,
    compressed,
    dominantSignals: signals,
    importanceScore: round2(group.reduce((sum, fact) => sum + fact.score, 0) / Math.max(1, group.length)),
    sourceEventIds: allEvents.map((event) => event.eventId),
    sourceTalkIds: allTalkItems,
    sourceReasonIds: reasonIds,
    linkTargetIds,
  };
}

function singleYearTitle(fact: YearFact | undefined): string {
  if (fact === undefined) {
    return "A thin record";
  }

  if (fact.signals.includes("weak-band pressure")) {
    return "A fragile year";
  }

  if (fact.signals.includes("movement and routes")) {
    return "A year shaped by movement";
  }

  if (fact.signals.includes("camp and place memory")) {
    return "A camp-centered year";
  }

  if (fact.signals.includes("food pressure")) {
    return "A hungry year";
  }

  if (fact.signals.includes("births and deaths")) {
    return "A year of population change";
  }

  if (fact.signals.includes("animals and ecology")) {
    return "A year of visible nature";
  }

  return "A steady year";
}

function compressedYearTitle(signals: readonly string[]): string {
  if (signals.includes("food pressure")) {
    return "Repeated lean years";
  }

  if (signals.includes("movement and routes")) {
    return "Repeated route years";
  }

  if (signals.includes("camp and place memory")) {
    return "A repeated camp pattern";
  }

  if (signals.includes("births and deaths")) {
    return "A population-change stretch";
  }

  return "A repeated pattern";
}

function buildCompressedYearSummary(group: readonly YearFact[], signals: readonly string[]): string {
  const start = group[0]?.year ?? 0;
  const end = group[group.length - 1]?.year ?? start;
  const notableLines = uniqueStrings(group.flatMap((fact) => fact.summaryLines)).slice(0, 3);
  const lead = selectTemplate(`compressed:${start}:${end}:${signals.join("|")}`, [
    `Several years followed the same pattern from ${start} to ${end}.`,
    `Across ${start}-${end}, the record repeats rather than breaks sharply.`,
    `The years ${start}-${end} form one continuous stretch.`,
  ]);
  const signalText = signals.filter((signal) => signal !== "stable record").slice(0, 3).join(", ");
  const middle = signalText.length === 0
    ? "The band stayed broadly stable without one dominant recorded crisis."
    : `The repeated themes were ${signalText}.`;

  return sentenceCase(joinSentences([lead, middle, ...notableLines]));
}

function buildMajorEvents(context: ChronicleContext): readonly BandChronicleMajorEvent[] {
  const ranked = [...context.eventScores.values()]
    .sort((left, right) => right.score - left.score || compareEventsNewestFirst(left.event, right.event))
    .slice(0, MAJOR_EVENT_CAP);

  return ranked.map((entry) => ({
    id: `major-event:${String(entry.event.eventId)}`,
    eventId: entry.event.eventId,
    year: entry.event.year,
    season: entry.event.season,
    title: cleanPlayerText(entry.event.title),
    summary: cleanPlayerText(entry.event.description),
    category: entry.event.category,
    categoryLabel: categoryLabel(entry.event.category),
    score: round2(entry.score),
    whyIncluded: sentenceCase(entry.reasons.slice(0, 3).join(", ")),
    linkTargetIds: [context.linkBuilder.addEvent(entry.event), context.linkBuilder.addYear(entry.event.year)],
  }));
}

function buildMajorArcs(context: ChronicleContext): readonly BandChronicleMajorArc[] {
  const drafts = [
    detectDeclineArc(context),
    detectRecoveryArc(context),
    detectHungerArc(context),
    detectMovementArc(context),
    detectCampArc(context),
    detectResourceArc(context),
    detectEcologyArc(context),
    detectSocialArc(context),
    detectLineageArc(context),
    detectStagnationTrapArc(context),
    detectLogisticsTrapArc(context),
    detectFootholdArc(context),
  ].filter(isArcDraft);
  const sorted = drafts.sort((left, right) => right.score - left.score).slice(0, MAJOR_ARC_CAP);

  return sorted.map((draft, index) => {
    const id = `arc:${draft.kind}:${index + 1}`;
    const linkTargetIds = uniqueStrings([
      context.linkBuilder.addArc(id, draft.title),
      ...draft.sourceEvents.slice(0, 4).map((event) => context.linkBuilder.addEvent(event)),
      ...draft.linkLabels.map((label) => context.linkBuilder.add({
        id: `arc-link:${draft.kind}:${slug(label)}`,
        kind: draft.kind === "ecology" ? "ecology" : "arc",
        label,
        sectionId: draft.kind === "movement" ? "movement-routes" : draft.kind === "camp" ? "places" : "major-arcs",
      })),
    ]).slice(0, 8);

    return {
      id,
      kind: draft.kind,
      startYear: draft.startYear,
      endYear: draft.endYear,
      title: draft.title,
      summary: draft.summary,
      causeLines: draft.causeLines.slice(0, 5),
      consequenceLines: draft.consequenceLines.slice(0, 4),
      score: round2(draft.score),
      sourceEventIds: draft.sourceEvents.slice(0, PROOF_ID_CAP).map((event) => event.eventId),
      sourceTalkIds: draft.sourceTalkIds.slice(0, PROOF_ID_CAP),
      sourceReasonIds: capReasonIds(draft.sourceReasonIds),
      linkTargetIds,
    };
  });
}

function detectDeclineArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events, yearFacts } = context;
  const declineEvents = events.filter((event) =>
    event.category === "weak_band_fate" ||
    event.category === "death_memory" ||
    event.category === "survival" ||
    event.category === "body_logistics" ||
    event.category === "demography"
  );
  const hungryYears = yearFacts.filter((fact) => fact.signals.includes("food pressure") || fact.signals.includes("water pressure"));
  const deathYears = yearFacts.filter((fact) => (fact.demographicRecord?.deaths ?? 0) > 0);
  const causes = uniqueStrings([
    hungryYears.length >= 2 ? "food or water pressure lasted across several years" : undefined,
    band.resourceEcology?.support.fallbackContribution !== undefined && band.resourceEcology.support.fallbackContribution > 0.18
      ? "fallback foods became important to survival"
      : undefined,
    band.bodyCampLogistics?.sickness.active === true || (band.bodyCampLogistics?.sickness.severity ?? 0) >= 0.28
      ? "sickness reduced spare labor"
      : undefined,
    (band.bodyCampLogistics?.logisticCapacity.carryingLoad ?? 0) >= 0.38 || (band.bodyCampLogistics?.careTravelBurden.sickCareBurden ?? 0) >= 0.28
      ? "carrying and care burdens narrowed movement choices"
      : undefined,
    deathYears.length > 0 ? "deaths changed the age balance" : undefined,
    (band.protoCampMemory?.currentPlace?.ecologicalPressure ?? 0) >= 0.28 || band.protoCampMemory?.currentPlace?.usePressureStatus === "overused"
      ? "a familiar camp-like place became worn"
      : undefined,
    (band.crossingMemories !== undefined && Object.values(band.crossingMemories).some((memory) => memory.riskMemory >= 0.35))
      ? "remembered crossing risk made relocation harder"
      : undefined,
    (band.socialTension?.socialTensionPressure ?? 0) >= 0.5 ? "social tension made coordinated decisions harder" : undefined,
  ]);
  const collapseLike =
    band.viability?.status === "fragile" ||
    band.viability?.status === "nonviable" ||
    band.viability?.status === "extinct" ||
    band.viability?.weakBandFate === "collapse_risk" ||
    band.viability?.weakBandFate === "collapsed" ||
    causes.length >= 3;

  if (!collapseLike || causes.length < 2) {
    return undefined;
  }

  const years = [...hungryYears, ...deathYears];
  const startYear = years[0]?.year ?? declineEvents[0]?.year ?? Math.max(0, context.world.time.year - 3);
  const endYear = context.world.time.year;
  const status = band.viability?.status === "extinct" || band.viability?.weakBandFate === "collapsed"
    ? "The decline ended the band's independent record."
    : "The decline explains why the current band is fragile.";

  return {
    kind: "decline",
    title: "Multi-cause decline",
    startYear,
    endYear,
    score: 90 + causes.length * 8 + declineEvents.length,
    summary: `The decline unfolded through linked pressures: ${joinNaturalList(causes.slice(0, 4))}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      status,
      band.viability?.supportSeekingGrounding,
      band.viability?.lastStressSummary,
    ]),
    sourceEvents: declineEvents,
    sourceTalkIds: talkIdsForCategories(context, ["survival", "water", "body_logistics", "demography", "camp_place", "movement"]),
    sourceReasonIds: capReasonIds([
      ...(band.viability?.reasonIds ?? []),
      ...(band.seasonalSupport?.reasonIds ?? []),
      ...(band.bodyCampLogistics?.reasonIds ?? []),
      ...(band.deathMemory?.reasonIds ?? []),
      ...declineEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["current weak-band condition", "multiple grounded cause families", "recent event and talk support"],
    linkLabels: causes.slice(0, 4),
  };
}

function detectRecoveryArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events, yearFacts } = context;
  const recoveryEvents = events.filter((event) =>
    event.description.toLowerCase().includes("recover") ||
    event.title.toLowerCase().includes("recover") ||
    event.category === "survival" ||
    event.category === "body_logistics"
  );
  const supportRecovery = band.seasonalSupport?.hungerClassification === "recovery_after_crisis" ||
    (band.seasonalSupport?.seasonalRecoveryStreak ?? 0) > 0 ||
    band.bodyCampLogistics?.mode === "recovering";

  if (!supportRecovery && recoveryEvents.length < 2) {
    return undefined;
  }

  const causes = uniqueStrings([
    band.seasonalSupport?.hungerClassification === "recovery_after_crisis" ? "support improved after crisis" : undefined,
    (band.bodyCampLogistics?.sickness.recoverySignal ?? 0) >= 0.25 ? "sickness began to ease" : undefined,
    band.bodyCampLogistics?.sharingPressure.state === "relief" ? "food sharing pressure eased" : undefined,
    band.resourceEcology?.support.seasonalResourceModifier !== undefined && band.resourceEcology.support.seasonalResourceModifier > 1.05
      ? "a seasonal resource pulse improved returns"
      : undefined,
    (band.demography.demographicChurn?.birthsThisYear ?? 0) > 0 ? "births returned to the record" : undefined,
  ]);
  const startYear = recoveryEvents[0]?.year ?? yearFacts.find((fact) => fact.signals.includes("food pressure"))?.year ?? context.world.time.year;

  return {
    kind: "recovery",
    title: "Recovery after pressure",
    startYear,
    endYear: context.world.time.year,
    score: 58 + causes.length * 9 + recoveryEvents.length,
    summary: causes.length === 0
      ? "The record shows recovery language, but the causes are still thin."
      : `Recovery came from ${joinNaturalList(causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "The band is not simply stable; the recent record remembers the crisis it is recovering from.",
      band.conditionProfile?.summary,
    ]),
    sourceEvents: recoveryEvents,
    sourceTalkIds: talkIdsForCategories(context, ["survival", "body_logistics", "plants", "aquatic"]),
    sourceReasonIds: capReasonIds([
      ...(band.seasonalSupport?.reasonIds ?? []),
      ...(band.bodyCampLogistics?.reasonIds ?? []),
      ...recoveryEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["recovery state", "support or body-logistics evidence"],
    linkLabels: causes,
  };
}

function detectHungerArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events, yearFacts } = context;
  const hungerYears = yearFacts.filter((fact) => fact.signals.includes("food pressure") || fact.signals.includes("water pressure"));
  const hungerEvents = events.filter((event) => event.category === "survival" || event.category === "adaptation" || event.category === "resource_ecology");
  const fallback = band.foragingAdaptation?.fallbackCandidates[0];
  const pressureLongEnough = hungerYears.length >= 2 ||
    (band.seasonalSupport?.deficitSeasonsLast8 ?? 0) >= 3 ||
    (band.seasonalSupport?.chronicDeficitStreak ?? 0) >= 2;

  if (!pressureLongEnough && fallback === undefined && hungerEvents.length < 3) {
    return undefined;
  }

  const underpopulated = band.demography.population > 0 &&
    band.demography.population <= 8 &&
    band.demography.workingAdults <= 3;
  const causes = uniqueStrings([
    hungerYears.length >= 2 ? "lean seasons repeated" : undefined,
    (band.seasonalSupport?.waterStressSeasonsLast8 ?? 0) >= 2 ? "water stress returned more than once" : undefined,
    fallback !== undefined ? `${cleanPlayerText(fallback.reason)} became part of survival` : undefined,
    (band.resourceEcology?.support.fallbackContribution ?? 0) > 0.12 ? "fallback resources carried a visible share of support" : undefined,
    (band.resourceEcology?.support.pressureEffects.length ?? 0) > 0 ? "known resource pressure reduced some returns" : undefined,
    underpopulated ? "too few working hands made every task expensive" : undefined,
  ]);

  return {
    kind: "hunger",
    title: "Repeated food pressure",
    startYear: hungerYears[0]?.year ?? hungerEvents[0]?.year ?? Math.max(0, context.world.time.year - 2),
    endYear: context.world.time.year,
    score: 54 + hungerYears.length * 10 + hungerEvents.length,
    summary: `Food history matters because ${joinNaturalList(causes.length === 0 ? ["lean returns show up repeatedly"] : causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "The band survived by changing what it leaned on, not by an unexplained stable surplus.",
      band.foragingAdaptation?.crisisBreakaway !== undefined ? "Food stress also raised breakaway pressure." : undefined,
      underpopulated ? "Fallback foods kept people alive but could not rebuild the missing labor margin." : undefined,
    ]),
    sourceEvents: hungerEvents,
    sourceTalkIds: talkIdsForCategories(context, ["survival", "water", "adaptation", "plants", "aquatic"]),
    sourceReasonIds: capReasonIds([
      ...(band.seasonalSupport?.reasonIds ?? []),
      ...(band.foragingAdaptation?.reasonIds ?? []),
      ...(band.resourceEcology?.reasonIds ?? []),
      ...hungerEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["repeated hunger or water years", "resource/fallback evidence"],
    linkLabels: causes,
  };
}

function detectMovementArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const moveEvents = events.filter((event) => event.category === "movement");
  const moves = band.recentResidentialMoveEvents ?? [];
  const riskyCrossings = Object.values(band.crossingMemories).filter((memory) => memory.riskMemory >= 0.28 || memory.successConfidence < 0.55);
  const routeCount = Object.keys(band.travelCorridors).length + (band.compressedCorridorSummaries?.length ?? 0);

  if (moveEvents.length + moves.length + riskyCrossings.length < 2 && routeCount < 2) {
    return undefined;
  }

  const causes = uniqueStrings([
    moves.some((move) => move.hardshipOutcome === "rejected" || move.status === "failed_no_route") ? "some moves were blocked or rejected" : undefined,
    moves.some((move) => move.hardshipLevel === "high" || move.hardshipLevel === "severe") ? "route hardship made movement costly" : undefined,
    riskyCrossings.length > 0 ? "crossing memory stayed risky" : undefined,
    routeCount > 1 ? "several remembered routes shaped later choices" : undefined,
    band.currentIntent?.kind === "return_to_known_good_area" ? "returning to known country remained attractive" : undefined,
  ]);

  return {
    kind: "movement",
    title: riskyCrossings.length > 0 ? "Crossing and route memory" : "Movement history",
    startYear: moveEvents[0]?.year ?? (moves[0] === undefined ? Math.max(0, context.world.time.year - 1) : tickToYear(moves[0].tick)),
    endYear: context.world.time.year,
    score: 46 + moveEvents.length * 7 + moves.length * 8 + riskyCrossings.length * 14 + routeCount * 4,
    summary: causes.length === 0
      ? "Movement mattered because route memory and camp shifts kept appearing in the record."
      : `Movement mattered because ${joinNaturalList(causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "Route memory made later choices more cautious and more legible.",
      band.bodyCampLogistics?.weatherMemories.find((memory) => memory.kind === "bad_crossing_season")?.source,
    ]),
    sourceEvents: moveEvents,
    sourceTalkIds: talkIdsForCategories(context, ["movement", "body_logistics", "range_knowledge"]),
    sourceReasonIds: capReasonIds([
      ...moves.flatMap((move) => move.reasonIds),
      ...riskyCrossings.flatMap((crossing) => crossing.reasonIds),
      ...moveEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["movement events", "residential move records", "crossing memories"],
    linkLabels: causes,
  };
}

function detectCampArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const place = band.protoCampMemory?.currentPlace;
  const campEvents = events.filter((event) => event.category === "camp_place");
  const topPlaces = band.protoCampMemory?.topPlaces ?? [];

  if (place === undefined && campEvents.length < 2 && topPlaces.length < 2) {
    return undefined;
  }

  const causes = uniqueStrings([
    place === undefined ? undefined : campStatePhrase(place),
    place?.usePressureStatus === "overused" || place?.usePressureStatus === "worn" ? "repeated use also wore the place down" : undefined,
    (place?.ecologicalPressure ?? 0) >= 0.24 ? "local ecological pressure was visible" : undefined,
    (place?.deathMemoryNearby ?? 0) >= 0.2 ? "death memory attached to the area" : undefined,
    (place?.crossingUseScore ?? 0) >= 0.25 ? "crossing use helped make the place memorable" : undefined,
    topPlaces.length > 1 ? "more than one remembered place shaped the band's range" : undefined,
  ]);

  return {
    kind: "camp",
    title: "Camp and place attachment",
    startYear: campEvents[0]?.year ?? place?.lastUsedYear ?? context.world.time.year,
    endYear: context.world.time.year,
    score: 42 + campEvents.length * 9 + topPlaces.length * 5 + (place?.campLikeScore ?? 0) * 30,
    summary: causes.length === 0
      ? "Place history is present, but still thin."
      : `The place story centers on ${joinNaturalList(causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      (place?.movementHardshipAvoidedByStaying ?? 0) > 0.2 ? "Staying sometimes avoided movement hardship." : undefined,
      (place?.ecologicalPressure ?? 0) > (place?.ecologicalRecovery ?? 0) ? "The same familiarity also risked overuse." : undefined,
    ]),
    sourceEvents: campEvents,
    sourceTalkIds: talkIdsForCategories(context, ["camp_place", "access_norms"]),
    sourceReasonIds: capReasonIds([
      ...(band.protoCampMemory?.reasonIds ?? []),
      ...campEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["proto-camp memory", "camp/place events", "use pressure"],
    linkLabels: causes,
  };
}

function detectResourceArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const resourceEvents = events.filter((event) => event.category === "resource_ecology" || event.category === "adaptation" || event.category === "activity");
  const support = band.resourceEcology?.support;
  const top = support?.topContributingClasses.filter((entry) => entry.supportShare >= 0.05).slice(0, 4) ?? [];

  if (resourceEvents.length < 2 && top.length === 0 && (band.foragingAdaptation?.fallbackCandidates.length ?? 0) === 0) {
    return undefined;
  }

  const resourceNames = top.map((entry) => entry.label);
  const causes = uniqueStrings([
    resourceNames.length > 0 ? `${joinNaturalList(resourceNames)} carried visible support` : undefined,
    (support?.fallbackContribution ?? 0) > 0.12 ? "fallback foods became important" : undefined,
    (support?.pressureEffects.length ?? 0) > 0 ? "pressure on known resources reduced returns" : undefined,
    (band.resourceEcology?.knowledge.memoryCount ?? 0) > 0 ? "resource memory came from the band's own use and activity traces" : undefined,
  ]);

  return {
    kind: "resource",
    title: "Food and resource history",
    startYear: resourceEvents[0]?.year ?? context.world.time.year,
    endYear: context.world.time.year,
    score: 40 + resourceEvents.length * 7 + top.length * 8 + (support?.pressureEffects.length ?? 0) * 7,
    summary: causes.length === 0
      ? "Food history is still mostly a current snapshot."
      : `Food history centers on ${joinNaturalList(causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "The chronicle treats resources as remembered support and pressure, not hidden map truth.",
      band.resourceEcology?.storageSuitabilitySummary.seasonalBufferHeadline,
    ]),
    sourceEvents: resourceEvents,
    sourceTalkIds: talkIdsForCategories(context, ["plants", "aquatic", "adaptation", "storage", "survival"]),
    sourceReasonIds: capReasonIds([
      ...(band.resourceEcology?.reasonIds ?? []),
      ...(band.foragingAdaptation?.reasonIds ?? []),
      ...resourceEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["resource events", "support contributions", "band-known resource memory"],
    linkLabels: causes,
  };
}

function detectEcologyArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const natureEvents = events.filter((event) => event.category === "nature");
  const visible = band.visibleNature;
  const relationshipAnimals = band.relationshipMemory?.animalFamiliarity ?? [];
  const ecologyCount =
    (visible?.faunaCards.length ?? 0) +
    (visible?.aquaticCards.length ?? 0) +
    (visible?.plantCards.length ?? 0) +
    (visible?.forestCards.length ?? 0) +
    relationshipAnimals.length;

  if (natureEvents.length < 2 && ecologyCount < 3) {
    return undefined;
  }

  const causes = uniqueStrings([
    visible?.animalHeadline,
    visible?.aquaticHeadline,
    visible?.plantHeadline,
    visible?.natureHeadline,
    relationshipAnimals.length > 0 ? "animal familiarity and wariness entered practical memory" : undefined,
  ]).map(phraseText);

  return {
    kind: "ecology",
    title: "Animals and visible ecology",
    startYear: natureEvents[0]?.year ?? context.world.time.year,
    endYear: context.world.time.year,
    score: 34 + natureEvents.length * 8 + ecologyCount * 3,
    summary: causes.length === 0
      ? "Visible nature appears in the record but has not formed a strong arc yet."
      : `The nature record is grounded in what the band could notice: ${joinNaturalList(causes.slice(0, 4))}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "Animals and plant signs enter this record only as practical, observable ecology.",
      relationshipAnimals[0]?.usefulness,
    ]),
    sourceEvents: natureEvents,
    sourceTalkIds: talkIdsForCategories(context, ["fauna", "forest", "plants", "aquatic", "acute_risk"]),
    sourceReasonIds: capReasonIds([
      ...(visible?.reasonIds ?? []),
      ...(band.relationshipMemory?.reasonIds ?? []),
      ...natureEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["visible nature records", "animal/ecology talk", "relationship memory"],
    linkLabels: causes,
  };
}

function detectSocialArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const socialEvents = events.filter((event) =>
    event.category === "relationship_memory" ||
    event.category === "social_tension" ||
    event.category === "access_norms" ||
    event.category === "inner_fission"
  );
  const relation = band.relationshipMemory;
  const socialPressure = band.socialTension?.socialTensionPressure ?? 0;

  if (socialEvents.length < 2 && relation === undefined && socialPressure < 0.35) {
    return undefined;
  }

  const causes = uniqueStrings([
    socialPressure >= 0.5 ? "social tension was high enough to shape choices" : undefined,
    (band.innerFission?.pressureScore ?? 0) >= 0.45 ? "internal split pressure became visible" : undefined,
    (relation?.seasonalAggregations.length ?? 0) > 0 ? "seasonal gatherings entered memory" : undefined,
    (relation?.failureStories.length ?? 0) > 0 ? "failure stories made later action more cautious" : undefined,
    (band.protoAccessMemory?.topPlaces.length ?? 0) > 0 ? "shared-use expectations attached to places" : undefined,
  ]);

  return {
    kind: "social",
    title: "People and social memory",
    startYear: socialEvents[0]?.year ?? context.world.time.year,
    endYear: context.world.time.year,
    score: 36 + socialEvents.length * 8 + socialPressure * 30,
    summary: causes.length === 0
      ? "The social record is present, but not yet dominant."
      : `People history matters because ${joinNaturalList(causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      band.innerFission?.splitDelayedReason,
      band.socialTension?.topCauses[0],
      relation?.failureStories[0]?.phrase,
    ]).map(cleanPlayerText),
    sourceEvents: socialEvents,
    sourceTalkIds: talkIdsForCategories(context, ["relationship_memory", "inner_fission", "social_tension", "access_norms"]),
    sourceReasonIds: capReasonIds([
      ...(band.relationshipMemory?.reasonIds ?? []),
      ...(band.socialTension?.reasonIds ?? []),
      ...(band.innerFission?.reasonIds ?? []),
      ...(band.protoAccessMemory?.reasonIds ?? []),
      ...socialEvents.flatMap((event) => event.sourceReasonIds),
    ]),
    scoringReasons: ["social events", "relationship memory", "access or fission pressure"],
    linkLabels: causes,
  };
}

function detectLineageArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const lineageEvents = events.filter((event) => event.category === "lineage");
  const lineage = band.lineageReadability;
  const fissionCount = band.fissionEvents.length;
  const hasLineageStory =
    lineage !== undefined &&
    (lineage.parentBandId !== undefined || lineage.daughterBandIds.length > 0 || lineage.activeStatus !== "active" || fissionCount > 0);

  if (!hasLineageStory && lineageEvents.length === 0) {
    return undefined;
  }

  const causes = uniqueStrings([
    lineage?.parentBandId !== undefined ? "this band began as a daughter branch" : undefined,
    lineage !== undefined && lineage.daughterBandIds.length > 0 ? "it later produced daughter bands" : undefined,
    fissionCount > 0 ? "recorded fission events changed the lineage" : undefined,
    lineage?.activeStatus === "absorbed" ? "its independent line ended through absorption" : undefined,
  ]);

  return {
    kind: "lineage",
    title: "Lineage and band continuity",
    startYear: lineageEvents[0]?.year ?? band.fissionEvents[0]?.time.year ?? context.world.time.year,
    endYear: context.world.time.year,
    score: 32 + lineageEvents.length * 10 + fissionCount * 8 + causes.length * 8,
    summary: causes.length === 0
      ? "Lineage is recorded, but still thin."
      : `Lineage history matters because ${joinNaturalList(causes)}.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      lineage?.displayLabel,
      lineage?.absorbedByBandId === undefined ? undefined : "Absorption connects this history to another known band.",
    ]),
    sourceEvents: lineageEvents,
    sourceTalkIds: talkIdsForCategories(context, ["inner_fission", "demography", "relationship_memory"]),
    sourceReasonIds: capReasonIds([
      ...lineageEvents.flatMap((event) => event.sourceReasonIds),
      ...band.fissionEvents.map((event) => event.splitReason.id),
    ]),
    scoringReasons: ["lineage events", "parent/daughter links", "fission or absorption state"],
    linkLabels: causes,
  };
}

// ---------------------------------------------------------------------------
// BAND-CHRONICLE-WIKI-EXPANSION-1 — long-term trap arcs. They fire only when
// several independent grounded pressures interlock, so they describe cumulative
// multi-cause history rather than one bad season. Detection is read-only; the
// sim's movement and survival decisions are untouched.
// ---------------------------------------------------------------------------

function detectStagnationTrapArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events, yearFacts } = context;
  const leanYears = yearFacts.filter((fact) => fact.signals.includes("food pressure"));
  const place = band.protoCampMemory?.currentPlace;
  const moves = band.recentResidentialMoveEvents ?? [];
  const blockedMoves = moves.filter((move) =>
    move.status === "failed_no_route" ||
    move.hardshipOutcome === "rejected" ||
    move.hardshipOutcome === "delayed" ||
    move.hardshipLevel === "high" ||
    move.hardshipLevel === "severe",
  );
  const riskyCrossings = Object.values(band.crossingMemories).filter((memory) => memory.riskMemory >= 0.3);
  const lean =
    leanYears.length >= 2 ||
    (band.seasonalSupport?.chronicDeficitStreak ?? 0) >= 2 ||
    (band.resourceEcology?.support.fallbackContribution ?? 0) > 0.12;
  const attached = place !== undefined && place.campLikeState !== "none" &&
    (place.visitCount >= 3 || place.usePressureStatus === "worn" || place.usePressureStatus === "overused");
  const movementHard = blockedMoves.length > 0 || riskyCrossings.length > 0;

  if (!lean || place === undefined || !attached || !movementHard) {
    return undefined;
  }

  const causes = uniqueStrings([
    "poor or uneven returns kept arguing for a move",
    place.usePressureStatus === "overused" || place.usePressureStatus === "worn"
      ? "the familiar camp was wearing down under repeated use"
      : "the familiar camp stayed the safest known ground",
    blockedMoves.length > 0 ? "attempted moves were blocked, delayed, or costly" : undefined,
    riskyCrossings.length > 0 ? "remembered crossing risk made each attempt feel more dangerous" : undefined,
    (band.relationshipMemory?.failureStories.length ?? 0) > 0 ? "remembered failures argued for caution" : undefined,
  ]);
  const stagnationEvents = events.filter((event) =>
    event.category === "survival" || event.category === "movement" || event.category === "camp_place");

  return {
    kind: "stagnation",
    title: "Held in a familiar place",
    startYear: leanYears[0]?.year ?? Math.max(0, context.world.time.year - 3),
    endYear: context.world.time.year,
    score: 66 + causes.length * 6 + blockedMoves.length * 4,
    summary: `The band did not simply refuse to move. ${sentenceCase(joinNaturalList(causes.slice(0, 3)))} — and each failed or costly attempt made the next one harder to argue for, so the band held ground that fed it thinly but predictably.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "Staying kept the band alive but let the same places wear down further.",
      "Later choices carried the weight of earlier caution, not just current conditions.",
    ]),
    sourceEvents: stagnationEvents,
    sourceTalkIds: talkIdsForCategories(context, ["survival", "movement", "camp_place"]),
    sourceReasonIds: capReasonIds([
      ...(band.seasonalSupport?.reasonIds ?? []),
      ...(band.protoCampMemory?.reasonIds ?? []),
      ...blockedMoves.flatMap((move) => move.reasonIds),
      ...riskyCrossings.flatMap((crossing) => crossing.reasonIds),
    ]),
    scoringReasons: ["repeated lean years", "camp attachment", "blocked or costly movement"],
    linkLabels: causes.slice(0, 4),
  };
}

function detectLogisticsTrapArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const demography = band.demography;
  const dependentLoad = demography.population > 0
    ? (demography.dependents + demography.elders) / demography.population
    : 0;
  const carrying = band.bodyCampLogistics?.logisticCapacity.carryingLoad ?? 0;
  const care = band.bodyCampLogistics?.careTravelBurden.sickCareBurden ?? 0;
  const moves = band.recentResidentialMoveEvents ?? [];
  const slowMoves = moves.filter((move) => move.durationDays >= 6 || move.hardshipOutcome === "delayed");
  const splitBlocked = band.innerFission?.state === "split_delayed" || band.innerFission?.state === "near_split";
  const foodTight = demography.foodPerPersonStress >= 0.3 || (band.seasonalSupport?.deficitSeasonsLast8 ?? 0) >= 2;
  const conditionCount = [
    dependentLoad >= 0.45,
    carrying >= 0.35 || care >= 0.25,
    slowMoves.length > 0,
    splitBlocked,
    foodTight,
  ].filter(Boolean).length;

  if (conditionCount < 3 || dependentLoad < 0.4) {
    return undefined;
  }

  const causes = uniqueStrings([
    "dependents and elders outnumbered the hands free to carry and scout",
    carrying >= 0.35 ? "carrying loads sat near the practical limit" : undefined,
    care >= 0.25 ? "sick care tied up people who would otherwise work" : undefined,
    slowMoves.length > 0 ? "moves took longer than the season comfortably allowed" : undefined,
    splitBlocked ? "a split was wanted but never looked safe enough" : undefined,
    foodTight ? "food stayed tight even with many people to feed" : undefined,
  ]);
  const logisticsEvents = events.filter((event) =>
    event.category === "demography" || event.category === "body_logistics" || event.category === "inner_fission");

  return {
    kind: "logistics",
    title: "Many mouths, heavy loads",
    startYear: logisticsEvents[0]?.year ?? Math.max(0, context.world.time.year - 2),
    endYear: context.world.time.year,
    score: 62 + causes.length * 6 + slowMoves.length * 4,
    summary: `Size did not translate into strength. ${sentenceCase(joinNaturalList(causes.slice(0, 3)))} — so leaving, splitting, and staying each stayed open in talk and closed in practice.`,
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "The band's numbers made it slower exactly when pressure asked it to be faster.",
      splitBlocked ? "Split pressure kept building without a safe way to resolve it." : undefined,
    ]),
    sourceEvents: logisticsEvents,
    sourceTalkIds: talkIdsForCategories(context, ["body_logistics", "demography", "inner_fission"]),
    sourceReasonIds: capReasonIds([
      ...(band.bodyCampLogistics?.reasonIds ?? []),
      ...(band.innerFission?.reasonIds ?? []),
      ...slowMoves.flatMap((move) => move.reasonIds),
    ]),
    scoringReasons: ["dependent-heavy population", "carrying or care burden", "delayed movement or blocked split"],
    linkLabels: causes.slice(0, 4),
  };
}

function detectFootholdArc(context: ChronicleContext): ArcDraft | undefined {
  const { band, events } = context;
  const moves = band.recentResidentialMoveEvents ?? [];
  const hardAttempts = moves.filter((move) =>
    move.status === "failed_no_route" ||
    move.hardshipOutcome === "rejected" ||
    move.hardshipOutcome === "diverted" ||
    move.hardshipLevel === "high" ||
    move.hardshipLevel === "severe",
  );
  const scarredCrossings = Object.values(band.crossingMemories)
    .filter((memory) => memory.useCount >= 1 && memory.riskMemory >= 0.35);
  const pullBack = band.currentIntent?.kind === "return_to_known_good_area" ||
    moves.some((move) => move.cause === "known_opportunity");

  if (hardAttempts.length === 0 || scarredCrossings.length === 0 || !pullBack) {
    return undefined;
  }

  const causes = uniqueStrings([
    "a hard move or crossing was attempted",
    "accidents or near-failures attached risk to the far side",
    "the pull of familiar country won over pressing on",
  ]);
  const footholdEvents = events.filter((event) => event.category === "movement" || event.category === "survival");
  const startYear = hardAttempts[0] === undefined
    ? Math.max(0, context.world.time.year - 2)
    : tickToYear(hardAttempts[0].tick);

  return {
    kind: "foothold",
    title: "A foothold that did not hold",
    startYear,
    endYear: context.world.time.year,
    score: 58 + hardAttempts.length * 5 + scarredCrossings.length * 6,
    summary: "The band reached past its known ground, and the ground pushed back: hard passages and remembered accidents turned the far side into a brief foothold rather than a new range, and the record shows the band circling back to what it already trusted.",
    causeLines: causes,
    consequenceLines: uniqueStrings([
      "Crossing memory kept the cost of the attempt alive long after it ended.",
      "The known base gained weight with every retreat to it.",
    ]),
    sourceEvents: footholdEvents,
    sourceTalkIds: talkIdsForCategories(context, ["movement", "body_logistics"]),
    sourceReasonIds: capReasonIds([
      ...hardAttempts.flatMap((move) => move.reasonIds),
      ...scarredCrossings.flatMap((crossing) => crossing.reasonIds),
    ]),
    scoringReasons: ["hard or failed movement attempts", "scarred crossing memory", "return pull toward known ground"],
    linkLabels: causes,
  };
}

function buildImportantPlaces(context: ChronicleContext): readonly BandChroniclePlaceSummary[] {
  const { band } = context;
  const places: BandChroniclePlaceSummary[] = [];
  const current = band.protoCampMemory?.currentPlace;
  const topPlaces = band.protoCampMemory?.topPlaces ?? [];

  for (const place of uniquePlaces([current, ...topPlaces])) {
    const score = place.campLikeScore * 40 +
      place.visitCount * 2 +
      place.residentialAnchorUseCount * 3 +
      place.crossingUseScore * 12 +
      (place.usePressureStatus === "overused" ? 12 : place.usePressureStatus === "worn" ? 7 : 0) +
      (place.activeStatus === "abandoned" ? 8 : 0);
    const label = placeLabel(place);
    const id = `place:${String(place.tileId)}`;
    const linkTargetId = context.linkBuilder.addPlace(id, label, place.tileId);

    places.push({
      id,
      label,
      summary: buildPlaceSummary(place),
      score: round2(score),
      tileId: place.tileId,
      linkTargetId,
      sourceReasonIds: capReasonIds(place.reasonIds),
    });
  }

  const access = band.protoAccessMemory;
  if (access !== undefined) {
    for (const place of access.topPlaces.slice(0, 3)) {
      const id = `access-place:${String(place.tileId)}`;
      if (places.some((entry) => entry.tileId === place.tileId)) {
        continue;
      }
      const label = accessPlaceLabel(access, place.tileId);
      places.push({
        id,
        label,
        summary: `${label} mattered because shared use or access expectations were remembered there.`,
        score: round2(place.accessImportance * 34 + place.placeSensitivity * 20),
        tileId: place.tileId,
        linkTargetId: context.linkBuilder.addPlace(id, label, place.tileId),
        sourceReasonIds: capReasonIds(place.sourceReasonIds),
      });
    }
  }

  return places.sort((left, right) => right.score - left.score).slice(0, IMPORTANT_PLACE_CAP);
}

function buildImportantRoutes(context: ChronicleContext): readonly BandChronicleRouteSummary[] {
  const { band } = context;
  const routes: BandChronicleRouteSummary[] = [];

  for (const route of Object.values(band.travelCorridors)) {
    const label = route.intentKinds.includes("follow_river_corridor") ? "Remembered river route" : "Remembered travel route";
    const id = `route:${String(route.id)}`;
    routes.push({
      id,
      label,
      summary: `${label} mattered because it was used ${route.useCount} time${plural(route.useCount)} and still had ${confidencePhrase(route.confidence)} confidence.`,
      score: round2(route.useCount * 5 + route.confidence * 30),
      routeId: route.id,
      tileId: route.toTileId,
      linkTargetId: context.linkBuilder.addRoute(id, label, route.id, route.toTileId),
      sourceReasonIds: [],
    });
  }

  for (const crossing of Object.values(band.crossingMemories)) {
    const risky = crossing.riskMemory >= 0.35 || crossing.successConfidence < 0.55;
    const label = risky ? "Difficult remembered crossing" : "Known crossing";
    const id = `crossing:${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}`;
    routes.push({
      id,
      label,
      summary: risky
        ? "This crossing mattered because risk memory made later movement more cautious."
        : `This crossing mattered because repeated use gave it ${confidencePhrase(crossing.successConfidence)} confidence.`,
      score: round2(crossing.useCount * 7 + crossing.riskMemory * 30 + crossing.successConfidence * 12),
      tileId: crossing.crossingTileA,
      linkTargetId: context.linkBuilder.addRoute(id, label, undefined, crossing.crossingTileA),
      sourceReasonIds: capReasonIds(crossing.reasonIds),
    });
  }

  for (const move of band.recentResidentialMoveEvents ?? []) {
    const hard = move.hardshipLevel === "high" || move.hardshipLevel === "severe" || move.hardshipOutcome === "rejected";
    const label = hard ? "Hard residential route" : "Residential move route";
    const id = `move-route:${String(move.eventId)}`;
    routes.push({
      id,
      label,
      summary: describeResidentialMoveForChronicle(move),
      score: round2(move.distanceTiles * 2 + move.confidence * 16 + (hard ? 25 : 8)),
      tileId: move.toTileId,
      linkTargetId: context.linkBuilder.addRoute(id, label, undefined, move.toTileId),
      sourceReasonIds: capReasonIds(move.reasonIds),
    });
  }

  return routes.sort((left, right) => right.score - left.score).slice(0, IMPORTANT_ROUTE_CAP);
}

function buildImportantResources(context: ChronicleContext): readonly BandChronicleResourceSummary[] {
  const { band } = context;
  const resources: BandChronicleResourceSummary[] = [];
  const support = band.resourceEcology?.support;

  for (const entry of support?.topContributingClasses ?? []) {
    if (entry.supportShare < 0.04) {
      continue;
    }

    const label = cleanPlayerText(entry.label);
    const pressure = entry.pressure >= 0.25 ? " Pressure on this resource also mattered." : "";
    const id = `resource:${String(entry.classId)}`;
    resources.push({
      id,
      label: sentenceCase(label),
      summary: `${sentenceCase(label)} contributed to support with ${confidencePhrase(entry.knowledgeConfidence)} knowledge.${pressure}`,
      score: round2(entry.supportShare * 80 + entry.pressure * 28 + entry.knowledgeConfidence * 18),
      linkTargetId: context.linkBuilder.addResource(id, sentenceCase(label)),
      sourceReasonIds: capReasonIds(band.resourceEcology?.reasonIds ?? []),
    });
  }

  for (const memory of band.resourceEcology?.topResourcePlaceMemories ?? []) {
    const label = sentenceCase(cleanPlayerText(memory.label));
    const id = `resource-place:${String(memory.tileId)}:${String(memory.resourceClassId)}`;
    if (resources.some((entry) => entry.label === label)) {
      continue;
    }

    resources.push({
      id,
      label,
      summary: `${label} mattered through remembered use at an important place.`,
      score: round2(memory.contributionToSupport * 40 + memory.visitsOrUses * 4 + memory.pressure * 20),
      linkTargetId: context.linkBuilder.addResource(id, label),
      sourceReasonIds: [],
    });
  }

  for (const animal of band.relationshipMemory?.animalFamiliarity ?? []) {
    const label = sentenceCase(cleanPlayerText(animal.label));
    const id = `ecology-animal:${String(animal.stockId)}`;
    resources.push({
      id,
      label,
      summary: `${label} mattered as practical animal memory: ${cleanPlayerText(animal.usefulness)}`,
      score: round2(animal.confidence * 18 + animal.humanLearning * 20 + animal.animalWariness * 24 + animal.risk * 16),
      linkTargetId: context.linkBuilder.addEcology(id, label),
      sourceReasonIds: capReasonIds(animal.reasonIds),
    });
  }

  return resources.sort((left, right) => right.score - left.score).slice(0, IMPORTANT_RESOURCE_CAP);
}

function buildImportantRelations(context: ChronicleContext): readonly BandChronicleRelationSummary[] {
  const { band, world } = context;
  const relations: BandChronicleRelationSummary[] = [];
  const lineage = band.lineageReadability;

  if (lineage?.parentBandId !== undefined) {
    const parentName = world.bands[lineage.parentBandId]?.name ?? "Parent band";
    relations.push({
      id: `relation:parent:${String(lineage.parentBandId)}`,
      label: parentName,
      summary: `${band.name} is remembered as a daughter branch of ${parentName}.`,
      score: 44,
      relatedBandId: lineage.parentBandId,
      linkTargetId: context.linkBuilder.addBand(parentName, "people-social", lineage.parentBandId),
      sourceReasonIds: [],
    });
  }

  for (const daughterId of lineage?.daughterBandIds ?? []) {
    const daughterName = world.bands[daughterId]?.name ?? "Daughter band";
    relations.push({
      id: `relation:daughter:${String(daughterId)}`,
      label: daughterName,
      summary: `${daughterName} is remembered as a daughter band from this line.`,
      score: 38,
      relatedBandId: daughterId,
      linkTargetId: context.linkBuilder.addBand(daughterName, "people-social", daughterId),
      sourceReasonIds: [],
    });
  }

  if (band.viability?.absorbedByBandId !== undefined) {
    const absorber = world.bands[band.viability.absorbedByBandId]?.name ?? "Known absorbing band";
    relations.push({
      id: `relation:absorbed:${String(band.viability.absorbedByBandId)}`,
      label: absorber,
      summary: `${band.name} ended independent history by joining ${absorber}.`,
      score: 58,
      relatedBandId: band.viability.absorbedByBandId,
      linkTargetId: context.linkBuilder.addBand(absorber, "people-social", band.viability.absorbedByBandId),
      sourceReasonIds: capReasonIds(band.viability.reasonIds),
    });
  }

  for (const reputation of band.relationshipMemory?.reputations ?? []) {
    const otherName = world.bands[reputation.otherBandId]?.name ?? "Known band";
    relations.push({
      id: `relation:reputation:${String(reputation.otherBandId)}:${reputation.kind}`,
      label: otherName,
      summary: cleanPlayerText(reputation.basis),
      score: round2(reputation.familiarity * 18 + reputation.trust * 16 + reputation.tension * 16 + reputation.sharedUse * 12 - reputation.staleness * 8),
      relatedBandId: reputation.otherBandId,
      linkTargetId: context.linkBuilder.addBand(otherName, "people-social", reputation.otherBandId),
      sourceReasonIds: capReasonIds(reputation.reasonIds),
    });
  }

  for (const gathering of band.relationshipMemory?.seasonalAggregations ?? []) {
    const id = `relation:gathering:${String(gathering.tileId)}:${gathering.trigger}`;
    relations.push({
      id,
      label: "Seasonal gathering memory",
      summary: cleanPlayerText(gathering.basis),
      score: round2(gathering.intensity * 30 + gathering.tolerance * 10 + gathering.tension * 12),
      linkTargetId: context.linkBuilder.addPlace(id, "Seasonal gathering place", gathering.tileId),
      sourceReasonIds: capReasonIds(gathering.reasonIds),
    });
  }

  return relations.sort((left, right) => right.score - left.score).slice(0, IMPORTANT_RELATION_CAP);
}

function buildTalkThemes(context: ChronicleContext): readonly BandChronicleTalkTheme[] {
  const themes = new Map<string, BandChronicleTalkTheme>();

  for (const item of context.talkItems) {
    const key = `${item.category}:${item.family}`;
    const score = salienceWeight(item.salience) + item.occurrenceCount * 3 + item.compressedRepeatCount * 4;
    const existing = themes.get(key);
    const next: BandChronicleTalkTheme = {
      id: `talk-theme:${slug(key)}`,
      label: talkCategoryLabel(item.category),
      summary: cleanPlayerText(item.summary),
      sourceCategory: item.category,
      score: round2(Math.max(existing?.score ?? 0, score)),
      sourceTalkIds: uniqueStrings([...(existing?.sourceTalkIds ?? []), item.id]).slice(0, PROOF_ID_CAP),
      sourceReasonIds: capReasonIds([...(existing?.sourceReasonIds ?? []), ...item.reasonIds]),
    };
    themes.set(key, next);
  }

  for (const record of context.talkLedger) {
    if (record.count < 2) {
      continue;
    }

    const key = `${record.sourceCategory}:${record.family}`;
    const score = salienceWeight(record.salience) + record.count * 4 + record.suppressedCount;
    const existing = themes.get(key);
    const next: BandChronicleTalkTheme = {
      id: `talk-theme:${slug(key)}`,
      label: talkCategoryLabel(record.sourceCategory),
      summary: cleanPlayerText(record.lastSummary),
      sourceCategory: record.sourceCategory,
      score: round2(Math.max(existing?.score ?? 0, score)),
      sourceTalkIds: uniqueStrings([...(existing?.sourceTalkIds ?? []), record.stateKey]).slice(0, PROOF_ID_CAP),
      sourceReasonIds: capReasonIds([...(existing?.sourceReasonIds ?? []), ...record.reasonIds]),
    };
    themes.set(key, next);
  }

  return [...themes.values()].sort((left, right) => right.score - left.score).slice(0, TALK_THEME_CAP);
}

function buildDeclineRecoverySignals(
  context: ChronicleContext,
  arcs: readonly BandChronicleMajorArc[],
): readonly BandChronicleDeclineRecoverySignal[] {
  const { band } = context;
  const signals: BandChronicleDeclineRecoverySignal[] = [];

  if (arcs.some((arc) => arc.kind === "decline")) {
    signals.push({
      id: "signal:decline",
      label: "Decline was multi-cause",
      summary: "The chronicle does not reduce decline to one number; it connects food, movement, body, place, and people signals when they are present.",
      signalKind: band.viability?.status === "extinct" ? "collapse" : "decline",
      sourceReasonIds: capReasonIds([
        ...(band.viability?.reasonIds ?? []),
        ...(band.seasonalSupport?.reasonIds ?? []),
        ...(band.bodyCampLogistics?.reasonIds ?? []),
      ]),
    });
  }

  if (arcs.some((arc) => arc.kind === "recovery")) {
    signals.push({
      id: "signal:recovery",
      label: "Recovery is recorded",
      summary: "Recovery appears only when support, body logistics, births, or event language grounds it.",
      signalKind: "recovery",
      sourceReasonIds: capReasonIds([
        ...(band.seasonalSupport?.reasonIds ?? []),
        ...(band.bodyCampLogistics?.reasonIds ?? []),
      ]),
    });
  }

  if (signals.length === 0) {
    signals.push({
      id: "signal:stable",
      label: "No major decline or recovery arc dominates",
      summary: "The strongest current history is not a collapse or recovery story.",
      signalKind: "stable",
      sourceReasonIds: [],
    });
  }

  return signals.slice(0, 4);
}

function buildTechnicalProof(input: {
  readonly context: ChronicleContext;
  readonly yearlyEntries: readonly BandChronicleYearEntry[];
  readonly majorEvents: readonly BandChronicleMajorEvent[];
  readonly majorArcs: readonly BandChronicleMajorArc[];
  readonly linkTargets: readonly BandChronicleLinkTarget[];
  readonly attemptedLinkCount: number;
  readonly episodes: readonly BandChronicleEpisode[];
  readonly episodesDropped: number;
  readonly article: BandChronicleArticle;
  readonly pages: readonly BandChroniclePage[];
  readonly pagesDropped: number;
  readonly linkGraph: BandChronicleLinkGraphProof;
  readonly tracker: WikiTracker;
}): BandChronicleTechnicalProof {
  const arcProof = input.majorArcs.slice(0, TECHNICAL_PROOF_SECTION_CAP).map((arc) => ({
    arcId: arc.id,
    kind: arc.kind,
    score: arc.score,
    sourceEventIds: arc.sourceEventIds.map(String).slice(0, PROOF_ID_CAP),
    sourceTalkIds: arc.sourceTalkIds.slice(0, PROOF_ID_CAP),
    sourceReasonIds: arc.sourceReasonIds.map(String).slice(0, PROOF_ID_CAP),
    scoringReasons: ["selected after deterministic arc scoring", `${arc.causeLines.length} cause lines`, `${arc.consequenceLines.length} consequence lines`],
  }));
  const eventProof = input.majorEvents.slice(0, TECHNICAL_PROOF_SECTION_CAP).map((event) => {
    const score = input.context.eventScores.get(String(event.eventId));
    return {
      eventId: String(event.eventId),
      category: event.category,
      salience: score?.event.salience ?? "unknown",
      score: event.score,
      scoringReasons: score?.reasons.slice(0, 5) ?? [],
      sourceReasonIds: score?.event.sourceReasonIds.map(String).slice(0, PROOF_ID_CAP) ?? [],
    };
  });
  const yearProof = input.yearlyEntries.slice(0, TECHNICAL_PROOF_SECTION_CAP).map((entry) => ({
    id: entry.id,
    yearRange: entry.startYear === entry.endYear ? String(entry.startYear) : `${entry.startYear}-${entry.endYear}`,
    compressed: entry.compressed,
    sourceEventIds: entry.sourceEventIds.map(String).slice(0, PROOF_ID_CAP),
    sourceTalkIds: entry.sourceTalkIds.slice(0, PROOF_ID_CAP),
    sourceReasonIds: entry.sourceReasonIds.map(String).slice(0, PROOF_ID_CAP),
    dominantSignals: entry.dominantSignals,
  }));
  const proofShell = {
    eventCount: input.context.events.length,
    talkCount: input.context.talkItems.length,
    yearCount: input.yearlyEntries.length,
    arcCount: input.majorArcs.length,
    linkCount: input.linkTargets.length,
  };
  const episodeProof = input.episodes.slice(0, TECHNICAL_PROOF_SECTION_CAP).map((episode) => ({
    episodeId: episode.id,
    category: episode.category,
    occurrenceCount: episode.occurrenceCount,
    sourceEventIds: episode.sourceEventIds.map(String).slice(0, PROOF_ID_CAP),
  }));
  const pageProof = input.pages.slice(0, TECHNICAL_PROOF_SECTION_CAP * 2).map((page) => ({
    pageId: page.id,
    kind: page.kind,
    paragraphCount: page.paragraphs.length,
    relatedLinkCount: page.relatedLinkIds.length,
  }));
  const pageCountsByKind = countPagesByKind(input.pages);
  const templateKeysUsed = [...input.tracker.templateKeys].sort().slice(0, TEMPLATE_PROOF_CAP);

  return {
    generatedForTick: input.context.world.time.tick,
    sourceEventCount: input.context.events.length,
    sourceTalkItemCount: input.context.talkItems.length,
    sourceTalkLedgerCount: input.context.talkLedger.length,
    yearlyEntryCap: YEAR_ENTRY_CAP,
    majorArcCap: MAJOR_ARC_CAP,
    majorEventCap: MAJOR_EVENT_CAP,
    linkTargetCap: LINK_TARGET_CAP,
    proofIdCap: PROOF_ID_CAP,
    payloadBytesEstimate: byteLengthUtf8(JSON.stringify(proofShell)) +
      byteLengthUtf8(JSON.stringify(input.yearlyEntries)) +
      byteLengthUtf8(JSON.stringify(input.majorArcs)) +
      byteLengthUtf8(JSON.stringify(input.majorEvents)) +
      byteLengthUtf8(JSON.stringify(input.linkTargets)) +
      byteLengthUtf8(JSON.stringify(input.episodes)) +
      byteLengthUtf8(JSON.stringify(input.article)) +
      byteLengthUtf8(JSON.stringify(input.pages)),
    selectedBandOnly: true,
    bounded: true,
    antiOmniscience: {
      bandKnownEventsOnly: true,
      bandKnownTalkOnly: true,
      hiddenMapTruthUsed: false,
      hiddenBandTruthUsed: false,
    },
    futureHooksReserved: futureHookLabels().map((hook) => hook.label),
    arcProof,
    eventProof,
    yearProof,
    episodeProof,
    pageProof,
    pageCountsByKind,
    linkGraph: input.linkGraph,
    templateKeysUsed,
    templateVariationCount: input.tracker.templateKeys.size,
    droppedByCap: {
      yearlyEntries: Math.max(0, input.context.yearFacts.length - YEAR_ENTRY_CAP),
      majorArcs: 0,
      majorEvents: Math.max(0, input.context.eventScores.size - MAJOR_EVENT_CAP),
      linkTargets: Math.max(0, input.attemptedLinkCount - LINK_TARGET_CAP),
      episodes: input.episodesDropped,
      pages: input.pagesDropped,
    },
  };
}

function futureHookLabels(): readonly { readonly id: string; readonly label: string }[] {
  return [
    { id: "future:religion-myth", label: "Religion and myth" },
    { id: "future:cultural-memory", label: "Cultural memory" },
    { id: "future:named-places", label: "Named places" },
    { id: "future:settlements", label: "Settlements" },
    { id: "future:polities", label: "Polities" },
    { id: "future:wars", label: "Wars" },
    { id: "future:trade-routes", label: "Trade routes" },
    { id: "future:agriculture", label: "Agriculture" },
    { id: "future:sacred-animals-plants", label: "Sacred animals and plants" },
    { id: "future:world-history", label: "World history" },
  ];
}

function talkIdsForCategories(
  context: ChronicleContext,
  categories: readonly CampTalkCategory[],
): readonly string[] {
  const allowed = new Set<CampTalkCategory>(categories);
  return uniqueStrings([
    ...context.talkItems.filter((item) => allowed.has(item.category)).map((item) => item.id),
    ...context.talkLedger.filter((record) => allowed.has(record.sourceCategory)).map((record) => record.stateKey),
  ]).slice(0, PROOF_ID_CAP);
}

function categoryLabel(category: BandReadableEventCategory): string {
  switch (category) {
    case "survival":
      return "survival";
    case "demography":
      return "births and deaths";
    case "movement":
      return "movement";
    case "activity":
      return "daily work";
    case "adaptation":
      return "foraging adaptation";
    case "body_logistics":
      return "body and camp logistics";
    case "relationship_memory":
      return "relationship memory";
    case "weak_band_fate":
      return "weak-band fate";
    case "death_memory":
      return "death memory";
    case "inner_fission":
      return "internal split pressure";
    case "social_tension":
      return "social tension";
    case "access_norms":
      return "shared-use memory";
    case "lineage":
      return "lineage";
    case "camp_place":
      return "camp and place";
    case "resource_ecology":
      return "resources";
    case "nature":
      return "visible nature";
  }
}

function talkCategoryLabel(category: CampTalkCategory): string {
  switch (category) {
    case "survival":
      return "Survival talk";
    case "water":
      return "Water talk";
    case "plants":
      return "Plant talk";
    case "aquatic":
      return "Water-edge food talk";
    case "adaptation":
      return "Adaptation talk";
    case "body_logistics":
      return "Body and camp talk";
    case "relationship_memory":
      return "Relationship talk";
    case "storage":
      return "Keeping-food talk";
    case "forest":
      return "Forest talk";
    case "fauna":
      return "Animal talk";
    case "acute_risk":
      return "Risk talk";
    case "movement":
      return "Movement talk";
    case "camp_place":
      return "Camp talk";
    case "demography":
      return "Birth and death talk";
    case "inner_fission":
      return "Internal split talk";
    case "social_tension":
      return "Social tension talk";
    case "access_norms":
      return "Shared-use talk";
    case "range_knowledge":
      return "Known-country talk";
    case "everyday":
      return "Everyday talk";
  }
}

function placeLabel(place: ProtoCampPlaceMemory): string {
  if (place.campLikeState === "crossing_camp") {
    return "Known crossing camp";
  }

  if (place.campLikeState === "fragile_camp_like_place") {
    return "Fragile camp-like place";
  }

  if (place.campLikeState === "contested_camp_like_place") {
    return "Contested camp-like place";
  }

  if (place.activeStatus === "abandoned") {
    return "Abandoned camp trace";
  }

  if (place.seasonalIdentity !== "general_return_place") {
    return sentenceCase(seasonalIdentityPhrase(place.seasonalIdentity));
  }

  if (place.visitCount >= 3 || place.consecutiveUseCount >= 2) {
    return "Familiar return place";
  }

  return "Remembered place";
}

function buildPlaceSummary(place: ProtoCampPlaceMemory): string {
  const reasons = uniqueStrings([
    campStatePhrase(place),
    place.usePressureStatus === "overused" ? "repeated use has made it overused" : undefined,
    place.usePressureStatus === "worn" ? "the place is showing wear" : undefined,
    place.waterRefugeReliability >= 0.35 ? "water or refuge reliability made it worth returning to" : undefined,
    place.activitySuccessCountNearby > place.activityFailureCountNearby ? "nearby work often succeeded" : undefined,
    place.crossingUseScore >= 0.25 ? "crossing use made it a route node" : undefined,
    place.knownKinContactNearby >= 0.25 ? "known social contact happened nearby" : undefined,
  ]);

  return sentenceCase(joinSentences([
    `${placeLabel(place)} mattered because ${joinNaturalList(reasons.slice(0, 3))}.`,
    place.topReasons[0],
  ]));
}

function campStatePhrase(place: ProtoCampPlaceMemory): string {
  switch (place.campLikeState) {
    case "none":
      return "it has no special camp standing";
    case "repeated_stop":
      return "repeated stops made it familiar";
    case "seasonal_return_place":
      return "seasonal return made it important";
    case "refuge_anchor":
      return "it worked as a refuge anchor";
    case "activity_base":
      return "work parties made it an activity base";
    case "remnant_holdout":
      return "a weakened group could hold there";
    case "storage_processing_candidate":
      return "processing and short-term keeping made it useful";
    case "crossing_camp":
      return "crossing use made it memorable";
    case "fragile_camp_like_place":
      return "it was useful but fragile";
    case "contested_camp_like_place":
      return "shared use made it contested";
    case "stale_remembered_camp":
      return "old camp memory was fading";
    case "persistent_camp_candidate":
      return "repeated use made it more persistent";
    case "proto_camp_candidate":
      return "it was starting to feel camp-like";
    case "abandoned_camp_trace":
      return "hardship or staleness left an abandoned trace";
  }
}

function seasonalIdentityPhrase(identity: ProtoCampPlaceMemory["seasonalIdentity"]): string {
  switch (identity) {
    case "dry_refuge_return":
      return "a dry-season refuge";
    case "wet_spread_place":
      return "a wet-season spreading place";
    case "winter_shelter":
      return "a winter shelter";
    case "spring_pulse_camp":
      return "a spring food-pulse camp";
    case "autumn_processing_candidate":
      return "an autumn processing place";
    case "seasonal_crossing_camp":
      return "a seasonal crossing camp";
    case "general_return_place":
      return "a general return place";
  }
}

function accessPlaceLabel(access: ProtoAccessMemoryState, tileId: TileId): string {
  const place = access.topPlaces.find((entry) => entry.tileId === tileId);

  if (place?.placeType === "ford_crossing") {
    return "Shared crossing place";
  }

  if (place?.placeType === "water_source") {
    return "Shared water place";
  }

  if (place?.accessState === "sensitive_place") {
    return "Sensitive remembered place";
  }

  return "Shared-use place";
}

function describeResidentialMoveForChronicle(move: ResidentialMoveEvent): string {
  const distance = `${move.distanceTiles} tile${plural(move.distanceTiles)}`;

  if (move.hardshipOutcome === "rejected" || move.status === "failed_no_route") {
    return `A planned move was blocked after ${distance}, leaving route failure in memory.`;
  }

  if (move.hardshipOutcome === "delayed") {
    return `A residential move was delayed by load, stress, or route hardship.`;
  }

  if (move.hardshipOutcome === "diverted") {
    return `The camp move diverted toward a safer known route.`;
  }

  if (move.cause === "water_stress") {
    return `The whole camp shifted for water across ${distance}.`;
  }

  if (move.cause === "poor_return") {
    return `Poor returns pushed a camp move across ${distance}.`;
  }

  if (move.cause === "fission_daughter") {
    return `A daughter-band move separated the line across ${distance}.`;
  }

  return `The camp moved across ${distance}, adding another route to the record.`;
}

function uniquePlaces(places: readonly (ProtoCampPlaceMemory | undefined)[]): readonly ProtoCampPlaceMemory[] {
  const seen = new Set<string>();
  const result: ProtoCampPlaceMemory[] = [];

  for (const place of places) {
    if (place === undefined) {
      continue;
    }

    const key = String(place.tileId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(place);
  }

  return result;
}

function isArcDraft(value: ArcDraft | undefined): value is ArcDraft {
  return value !== undefined;
}

function compareEventsOldestFirst(left: BandReadableEvent, right: BandReadableEvent): number {
  return Number(left.tick) - Number(right.tick) || String(left.eventId).localeCompare(String(right.eventId));
}

function compareEventsNewestFirst(left: BandReadableEvent, right: BandReadableEvent): number {
  return Number(right.tick) - Number(left.tick) || String(left.eventId).localeCompare(String(right.eventId));
}

function compareEventImportanceForYear(left: BandReadableEvent, right: BandReadableEvent): number {
  const leftSalience = salienceWeight(left.salience);
  const rightSalience = salienceWeight(right.salience);
  return rightSalience - leftSalience || categoryRelevanceWeight(right.category) - categoryRelevanceWeight(left.category);
}

function salienceWeight(salience: string): number {
  if (salience === "high") {
    return 30;
  }

  if (salience === "medium") {
    return 18;
  }

  return 8;
}

function uniqueEvents(events: readonly BandReadableEvent[]): readonly BandReadableEvent[] {
  const seen = new Set<string>();
  const result: BandReadableEvent[] = [];

  for (const event of events) {
    const key = String(event.eventId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(event);
  }

  return result;
}

function uniqueStrings(values: readonly (string | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (value === undefined) {
      continue;
    }

    const cleaned = cleanPlayerText(value);
    if (cleaned.length === 0) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function capReasonIds(reasonIds: readonly ReasonId[]): readonly ReasonId[] {
  const seen = new Set<string>();
  const result: ReasonId[] = [];

  for (const reasonId of reasonIds) {
    const key = String(reasonId);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(reasonId);

    if (result.length >= PROOF_ID_CAP) {
      break;
    }
  }

  return result;
}

function tickToYear(tick: TickNumber): number {
  return Math.floor(Number(tick) / 4);
}

function cleanPlayerText(value: string): string {
  return value
    .replace(/\b(?:tile|band|reason|decision|event|stock|patch):[a-z0-9:_-]+/gi, "")
    .replace(/\b[a-z]+_[a-z0-9_]+\b/gi, (match) => match.split("_").join(" "))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    // Generated-splice artifacts: "the an autumn place", "a the route",
    // doubled periods from joined fragments.
    .replace(/\b(the) (?:an?|the) /gi, "$1 ")
    .replace(/\ban? (the) /gi, "$1 ")
    .replace(/\.{2,}/g, ".")
    .replace(/[·|]\s*$/g, "")
    .trim();
}

/** "An autumn processing place" → "the autumn processing place". */
function theify(label: string): string {
  return `the ${lowerFirst(label).replace(/^(?:an?|the)\s+/i, "")}`;
}

function phraseText(value: string): string {
  return cleanPlayerText(value).replace(/[.!?]+$/g, "");
}

function sentenceCase(value: string): string {
  const cleaned = cleanPlayerText(value);

  if (cleaned.length === 0) {
    return cleaned;
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function lowerFirst(value: string): string {
  if (value.length === 0) {
    return value;
  }

  return value.charAt(0).toLowerCase() + value.slice(1);
}

function joinSentences(parts: readonly (string | undefined)[]): string {
  return parts
    .map((part) => part === undefined ? "" : cleanPlayerText(part))
    .filter((part) => part.length > 0)
    .map((part) => /[.!?]$/.test(part) ? part : `${part}.`)
    .join(" ");
}

function joinClauses(parts: readonly (string | undefined)[]): string {
  const cleaned = parts
    .map((part) => part === undefined ? "" : cleanPlayerText(part))
    .filter((part) => part.length > 0);

  if (cleaned.length === 0) {
    return "No current situation is recorded yet";
  }

  if (cleaned.length === 1) {
    return cleaned[0] ?? "";
  }

  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function joinNaturalList(items: readonly string[]): string {
  const cleaned = uniqueStrings(items);

  if (cleaned.length === 0) {
    return "the surviving record";
  }

  if (cleaned.length === 1) {
    return cleaned[0] ?? "the surviving record";
  }

  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }

  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function confidencePhrase(value: number): string {
  if (value >= 0.75) {
    return "strong";
  }

  if (value >= 0.5) {
    return "moderate";
  }

  if (value >= 0.25) {
    return "uncertain";
  }

  return "weak";
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

function articleFor(value: string): string {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function selectTemplate(key: string, variants: readonly string[]): string {
  if (variants.length === 0) {
    return "";
  }

  return variants[hashString(key) % variants.length] ?? variants[0] ?? "";
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function byteLengthUtf8(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

// ===========================================================================
// BAND-CHRONICLE-WIKI-EXPANSION-1 — deterministic wiki/article layer.
//
// Everything below is a pure projection over the same band-known inputs the
// foundation already reads. There is no runtime text-generation service, no
// nondeterministic randomness, no hidden map or band truth, and no invented content.
// Template variation is keyed on stable ids via hashString, so identical
// worlds produce identical prose. Links resolve either to a focused chronicle
// page or to a known band; anything else is stripped before the state leaves
// this module.
// ===========================================================================

interface WikiTracker {
  readonly templateKeys: Set<string>;
}

function pickTemplate(tracker: WikiTracker, key: string, variants: readonly string[]): string {
  tracker.templateKeys.add(`${key}#${variants.length}`);
  return selectTemplate(key, variants);
}

type WikiSegmentInput = string | { readonly text: string; readonly linkId?: string } | undefined;

function cleanSegmentText(value: string): string {
  const leading = /^\s/.test(value) ? " " : "";
  const trailing = /\s$/.test(value) ? " " : "";
  const core = cleanPlayerText(value);

  if (core.length === 0) {
    return "";
  }

  return `${leading}${core}${trailing}`;
}

function mergeSegmentText(left: string, right: string): string {
  if (/\s$/.test(left) || /^[\s,.;:!?)]/.test(right)) {
    return `${left}${right}`.replace(/ {2,}/g, " ");
  }

  return `${left} ${right}`;
}

function makeParagraph(id: string, parts: readonly WikiSegmentInput[]): BandChronicleParagraph | undefined {
  const segments: BandChronicleTextSegment[] = [];

  for (const part of parts) {
    if (part === undefined) {
      continue;
    }

    const raw = typeof part === "string" ? { text: part, linkId: undefined } : part;
    const text = cleanSegmentText(raw.text);
    if (text.trim().length === 0) {
      continue;
    }

    const previous = segments[segments.length - 1];
    if (raw.linkId === undefined && previous !== undefined && previous.linkId === undefined) {
      segments[segments.length - 1] = { text: mergeSegmentText(previous.text, text) };
      continue;
    }

    if (segments.length >= SEGMENTS_PER_PARAGRAPH_CAP) {
      break;
    }

    segments.push(raw.linkId === undefined ? { text } : { text, linkId: raw.linkId });
  }

  if (segments.length === 0) {
    return undefined;
  }

  const first = segments[0];
  if (first !== undefined) {
    segments[0] = first.linkId === undefined
      ? { text: first.text.replace(/^\s+/, "") }
      : { text: first.text.replace(/^\s+/, ""), linkId: first.linkId };
  }
  const last = segments[segments.length - 1];
  if (last !== undefined) {
    segments[segments.length - 1] = last.linkId === undefined
      ? { text: last.text.replace(/\s+$/, "") }
      : { text: last.text.replace(/\s+$/, ""), linkId: last.linkId };
  }

  return { id, segments };
}

function definedParagraphs(paragraphs: readonly (BandChronicleParagraph | undefined)[]): readonly BandChronicleParagraph[] {
  return paragraphs.filter((paragraph): paragraph is BandChronicleParagraph => paragraph !== undefined);
}

// --- Episode correlation -----------------------------------------------------

function buildEpisodes(context: ChronicleContext, tracker: WikiTracker): {
  readonly episodes: readonly BandChronicleEpisode[];
  readonly dropped: number;
} {
  const groups = new Map<string, BandReadableEvent[]>();

  for (const event of context.events) {
    const group = groups.get(event.stateKey);
    if (group === undefined) {
      groups.set(event.stateKey, [event]);
    } else {
      group.push(event);
    }
  }

  const drafts: BandChronicleEpisode[] = [];
  for (const [stateKey, events] of groups) {
    if (events.length < 2) {
      continue;
    }

    const sorted = [...events].sort(compareEventsOldestFirst);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first === undefined || last === undefined) {
      continue;
    }

    const desc = phraseText(first.title);
    const span = last.year > first.year
      ? `between Year ${first.year} and Year ${last.year}`
      : `within Year ${first.year}`;
    const count = sorted.length;
    const summary = pickTemplate(tracker, `episode:${String(context.band.id)}:${stateKey}`, [
      `The record repeats ${count} times ${span}: ${lowerFirst(desc)}.`,
      `${sentenceCase(desc)} did not happen once — the band lived it ${count} times ${span}.`,
      `The same trouble returned ${count} times ${span}: ${lowerFirst(desc)}.`,
      `${sentenceCase(desc)} became a pattern, recorded ${count} times ${span}.`,
    ]);

    drafts.push({
      id: `episode:${slug(stateKey)}`,
      category: first.category,
      title: sentenceCase(desc),
      summary,
      startYear: first.year,
      endYear: last.year,
      occurrenceCount: count,
      sourceEventIds: sorted.slice(0, EPISODE_SOURCE_ID_CAP).map((event) => event.eventId),
      linkTargetIds: sorted.slice(0, 3).map((event) => context.linkBuilder.addEvent(event)),
    });
  }

  const sortedDrafts = drafts.sort((left, right) =>
    right.occurrenceCount - left.occurrenceCount ||
    right.endYear - left.endYear ||
    left.id.localeCompare(right.id));

  return {
    episodes: sortedDrafts.slice(0, EPISODE_CAP),
    dropped: Math.max(0, sortedDrafts.length - EPISODE_CAP),
  };
}

// --- Arc narration helpers ---------------------------------------------------

type ArcStanding = "ongoing" | "recent" | "past";

function arcStanding(arc: BandChronicleMajorArc, currentYear: number): ArcStanding {
  if (arc.endYear >= currentYear - 1) {
    return "ongoing";
  }

  if (arc.endYear >= currentYear - 3) {
    return "recent";
  }

  return "past";
}

function arcStandingLabel(standing: ArcStanding): string {
  switch (standing) {
    case "ongoing":
      return "still shaping choices";
    case "recent":
      return "recently eased";
    case "past":
      return "past, but remembered";
  }
}

function arcEssence(kind: BandChronicleArcKind): string {
  switch (kind) {
    case "decline":
      return "one of accumulating pressure";
    case "recovery":
      return "one of slow recovery after crisis";
    case "hunger":
      return "a long argument with hunger";
    case "movement":
      return "shaped by routes and crossings";
    case "camp":
      return "bound to a familiar camp";
    case "resource":
      return "written around its food places";
    case "ecology":
      return "entangled with the animals and plants around it";
    case "social":
      return "strained and held together around the fire";
    case "lineage":
      return "a story of branching lines";
    case "stagnation":
      return "one of staying put while the ground wore down";
    case "logistics":
      return "one of heavy loads and many dependents";
    case "foothold":
      return "the story of a foothold that did not hold";
  }
}

function humanArcPhrase(kind: BandChronicleArcKind): string {
  switch (kind) {
    case "decline":
      return "the band's long decline";
    case "recovery":
      return "the slow recovery";
    case "hunger":
      return "the hungry years";
    case "movement":
      return "the crossing and route story";
    case "camp":
      return "the familiar-camp story";
    case "resource":
      return "the story of what fed the band";
    case "ecology":
      return "the living-country record";
    case "social":
      return "the strain among people";
    case "lineage":
      return "the branching of the line";
    case "stagnation":
      return "the years of being held in place";
    case "logistics":
      return "the trap of many mouths and heavy loads";
    case "foothold":
      return "the failed foothold";
  }
}

function arcPageTitle(arc: BandChronicleMajorArc): string {
  switch (arc.kind) {
    case "decline":
      return "The long decline";
    case "recovery":
      return "The slow recovery";
    case "hunger":
      return "The hungry years";
    case "movement":
      return "Routes, crossings, and caution";
    case "camp":
      return "The familiar camp";
    case "resource":
      return "What fed the band";
    case "ecology":
      return "The living country around them";
    case "social":
      return "Strain and standing";
    case "lineage":
      return "The branching line";
    case "stagnation":
    case "logistics":
    case "foothold":
      return arc.title;
  }
}

function arcOpener(tracker: WikiTracker, bandKey: string, arc: BandChronicleMajorArc): string {
  const key = `arc-open:${bandKey}:${arc.id}`;

  switch (arc.kind) {
    case "decline":
      return pickTemplate(tracker, key, [
        "The decline developed over several years rather than from one blow.",
        "No single failure explains these years; the pressure accumulated.",
        "What looks like one long slide was really several pressures arriving in sequence.",
      ]);
    case "recovery":
      return pickTemplate(tracker, key, [
        "Recovery here is not a return to how things were — it is a slow rebuilding with the crisis still in living memory.",
        "The turn upward was gradual, and the record still carries the crisis it grew out of.",
      ]);
    case "hunger":
      return pickTemplate(tracker, key, [
        "Hunger was not an event here — it kept returning, like weather.",
        "The food story of these years is one of repetition, not of a single bad season.",
        "Lean seasons came back often enough to become the band's normal.",
      ]);
    case "movement":
    case "foothold":
      return pickTemplate(tracker, key, [
        "Movement shaped these years more than any camp did.",
        "The band's paths — taken, refused, and remembered — carry most of this stretch of history.",
      ]);
    case "camp":
    case "stagnation":
      return pickTemplate(tracker, key, [
        "The camp remained useful, but not comfortable.",
        "Familiar ground held the band even as it wore down under them.",
        "Over several seasons the same pattern accumulated: return, pressure, repair, and another delayed departure.",
      ]);
    case "resource":
      return pickTemplate(tracker, key, [
        "What the band ate, and where, left the clearest trace in this record.",
        "The food places did the quiet work of these years.",
      ]);
    case "ecology":
      return pickTemplate(tracker, key, [
        "The band read the country around it, and the country changed under that attention.",
        "Animals, plants, and water signs fill this part of the record.",
      ]);
    case "social":
    case "logistics":
      return pickTemplate(tracker, key, [
        "The hardest work of these years happened between people.",
        "What the band could agree to do mattered as much as what the land offered.",
      ]);
    case "lineage":
      return pickTemplate(tracker, key, [
        "This band's story does not stand alone; it branches.",
        "The line this band belongs to shaped what it inherited and what it passed on.",
      ]);
  }
}

function stitchCauses(tracker: WikiTracker, key: string, causes: readonly string[]): string {
  // Cause lines arrive sentence-cased from arc detectors; lower them so they
  // read as clauses inside one stitched sentence.
  const cleaned = uniqueStrings(causes.map((cause) => lowerFirst(phraseText(cause)))).slice(0, 4);
  const c0 = cleaned[0];
  const c1 = cleaned[1];
  const c2 = cleaned[2];
  const c3 = cleaned[3];

  if (c0 === undefined) {
    return "The surviving record explains it only thinly.";
  }

  if (c1 === undefined) {
    return pickTemplate(tracker, `${key}:one`, [
      `Most of it traces to one pressure: ${c0}.`,
      `One pressure did most of the work here: ${c0}.`,
    ]);
  }

  if (c2 === undefined) {
    return pickTemplate(tracker, `${key}:two`, [
      `${sentenceCase(c0)}; meanwhile, ${c1}.`,
      `${sentenceCase(c0)} — and over the same stretch, ${c1}.`,
      `${sentenceCase(c0)}. Alongside it, ${c1}.`,
    ]);
  }

  const tail = c3 === undefined ? "" : `; and behind it all, ${c3}`;

  return pickTemplate(tracker, `${key}:many`, [
    `${sentenceCase(c0)}. On top of that, ${c1}; over the same years, ${c2}${tail}. None of these alone explains what followed — together they set its shape.`,
    `It seems to have begun with ${c0}. Because of that, later pressures cut deeper: ${c1}, then ${c2}${tail}.`,
    `${sentenceCase(c0)}, and it did not act alone: ${c1}; meanwhile, ${c2}${tail}. Each made the others harder to escape.`,
  ]);
}

function referentKindsForArc(kind: BandChronicleArcKind): readonly MemoryReferentKind[] {
  switch (kind) {
    case "decline":
    case "hunger":
      return ["food_patch", "sickness_source", "gear_material_issue"];
    case "recovery":
      return ["food_patch", "camp_place"];
    case "movement":
    case "foothold":
      return ["route", "crossing", "accident"];
    case "camp":
    case "stagnation":
      return ["camp_place", "access_place"];
    case "resource":
      return ["food_patch", "resource_place", "aquatic_place"];
    case "ecology":
      return ["animal_sign", "aquatic_place", "forest_place"];
    case "social":
    case "logistics":
      return ["social_relation", "talk_source", "gear_material_issue"];
    case "lineage":
      return [];
  }
}

function matchedReferents(state: MemoryReferentState, kind: BandChronicleArcKind): readonly MemoryReferent[] {
  const kinds = new Set(referentKindsForArc(kind));
  return state.referents.filter((referent) => kinds.has(referent.kind));
}

/**
 * "Camp talk" → "camp": lets prose say "talk kept returning to camp and water".
 * Multiword topics hyphenate their inner "and" so a joined list still parses
 * ("camp and birth-and-death", not "camp and birth and death").
 */
function talkTopicPhrase(label: string): string {
  return lowerFirst(phraseText(label))
    .replace(/\s+talk$/i, "")
    .replace(/ and /g, "-and-");
}

// --- Wiki layer assembly -------------------------------------------------------

interface WikiLayerInput {
  readonly context: ChronicleContext;
  readonly tracker: WikiTracker;
  readonly yearlyEntries: readonly BandChronicleYearEntry[];
  readonly majorArcs: readonly BandChronicleMajorArc[];
  readonly majorEvents: readonly BandChronicleMajorEvent[];
  readonly importantPlaces: readonly BandChroniclePlaceSummary[];
  readonly importantRoutes: readonly BandChronicleRouteSummary[];
  readonly importantResources: readonly BandChronicleResourceSummary[];
  readonly importantRelations: readonly BandChronicleRelationSummary[];
  readonly talkThemes: readonly BandChronicleTalkTheme[];
  readonly episodes: readonly BandChronicleEpisode[];
  readonly memoryReferents: MemoryReferentState;
}

function buildWikiLayer(input: WikiLayerInput): {
  readonly article: BandChronicleArticle;
  readonly pages: readonly BandChroniclePage[];
  readonly pagesDropped: number;
} {
  const allPages = [
    ...buildPeriodPages(input),
    ...buildYearPages(input),
    ...buildEventPages(input),
    ...buildReferentPages(input),
    ...buildPlacePages(input),
    ...buildRoutePages(input),
    ...buildResourcePages(input),
  ];
  const pages = allPages.slice(0, PAGE_TOTAL_CAP);
  const article = buildArticle(input);

  return { article, pages, pagesDropped: Math.max(0, allPages.length - PAGE_TOTAL_CAP) };
}

function buildArticle(input: WikiLayerInput): BandChronicleArticle {
  const periods = buildPeriods(input).slice(0, PERIOD_CAP);
  const sections = buildThematicSections(input).slice(0, ARTICLE_SECTION_CAP);
  const deepHistory = buildDeepHistorySummary(input);
  const contents = [
    ...(deepHistory === undefined ? [] : [{ id: "long-memory", title: "Long memory" }]),
    { id: "history", title: "History" },
    ...sections.map((section) => ({ id: section.id, title: section.title })),
  ];

  return {
    leadParagraphs: buildLeadParagraphs(input).slice(0, LEAD_PARAGRAPH_CAP),
    infobox: buildInfobox(input).slice(0, INFOBOX_FACT_CAP),
    contents,
    longStory: buildLongStory(input).slice(0, 2),
    eras: buildEras(input).slice(0, ERA_CAP),
    deepHistory,
    coverageNote: buildCoverageNote(input, periods),
    periods,
    sections,
  };
}

/** Years since this band began: daughters know their founding; origin bands
 *  have existed since the world's first year. */
function bandAgeYears(world: WorldState, band: Band): number {
  return Math.max(0, world.time.year - (band.lineage?.createdAt.year ?? 0));
}

/** Graceful record-span wording: never "Year X to Year X", and long-lived
 *  bands distinguish bounded detail from the older durable story. */
function recordSpanPhrase(input: WikiLayerInput): string {
  const { world } = input.context;
  const firstYear = input.context.yearFacts[0]?.year ?? world.time.year;
  const currentYear = world.time.year;
  const age = bandAgeYears(world, input.context.band);

  if (firstYear >= currentYear) {
    return age >= LONG_STORY_MIN_AGE_YEARS
      ? "Only the newest entries survive in full detail; the longer story lives in what the band still knows."
      : "Its record has only just begun.";
  }

  if (age > currentYear - firstYear + LONG_STORY_SLACK_YEARS) {
    return `Its detailed record covers Years ${firstYear}–${currentYear}; the older story survives in its places, routes, and people.`;
  }

  return `Its recorded story runs from Year ${firstYear} to Year ${currentYear}.`;
}

function buildCoverageNote(input: WikiLayerInput, periods: readonly BandChroniclePeriod[]): string | undefined {
  const { world, band } = input.context;
  const first = periods[0];
  const last = periods[periods.length - 1];

  if (first === undefined || last === undefined) {
    return undefined;
  }

  const age = bandAgeYears(world, band);
  const windowYears = last.endYear - first.startYear + 1;

  if (age <= windowYears + LONG_STORY_SLACK_YEARS) {
    return undefined;
  }

  const span = first.startYear === last.endYear
    ? `Year ${last.endYear}`
    : `Years ${first.startYear}–${last.endYear}`;

  return `The record keeps this level of detail only for ${span}; the longer story is told above, and survives in places, routes, and people.`;
}

function buildDeepHistorySummary(input: WikiLayerInput): BandChronicleDeepHistorySummary | undefined {
  const { band, world } = input.context;
  const history = band.deepHistory;

  if (history === undefined) {
    return undefined;
  }

  const eras = selectDeepHistoryEras(history.eras).map((era) => ({
    id: `deep-era:${era.id}`,
    title: deepEraTitle(era),
    yearRange: formatDeepYearRange(era.startYear, era.endYear),
    summary: deepEraSummary(era),
    evidenceChips: evidenceChips(era.evidence),
    compressed: era.merged,
  }));
  const episodes = dedupeDeepEpisodeDisplays(
    selectDeepHistoryEpisodes(history.episodes, DEEP_HISTORY_EPISODE_DISPLAY_CAP * 2)
      .map((episode) => deepEpisodeDisplay(episode, "lived")),
  ).slice(0, DEEP_HISTORY_EPISODE_DISPLAY_CAP);
  const inherited = dedupeDeepEpisodeDisplays(
    selectDeepHistoryEpisodes(history.inheritedEpisodes, DEEP_HISTORY_INHERITED_DISPLAY_CAP * 2)
      .map((episode) => deepEpisodeDisplay(episode, "inherited")),
  ).slice(0, DEEP_HISTORY_INHERITED_DISPLAY_CAP);
  const durableRange = getDeepHistoryYearRangeLabel(history);
  const recentRange = getRecentMemoryRangeLabel(band);
  const comparison = buildDeepHistoryComparison(world, band, history);

  return {
    ageYears: Math.max(0, world.time.year - history.founding.foundedAt.year),
    durableRange,
    recentRange,
    memoryBoundaryLine: buildDeepMemoryBoundaryLine(history, band),
    comparison,
    eras,
    episodes,
    inherited,
    countsLine: `Showing ${eras.length} of ${history.eras.length} durable eras and ${episodes.length} of ${history.episodes.length} lived episodes; raw proof stays in Technical.`,
  };
}

function buildDeepHistoryComparison(
  world: WorldState,
  band: Band,
  history: BandDeepHistoryState,
): BandChronicleDeepHistoryComparison {
  const founding = history.founding;
  const founderKind = founding.kind === "fission_daughter" ? "daughter split" : "origin band";
  const foundingContext = foundingTileContextPhrase(founding);
  const currentContext = currentTileContextPhrase(world, band);
  const startingCohorts = `${founding.startingDependents} young, ${founding.startingWorkingAdults} working, ${founding.startingElders} old`;
  const currentCohorts = `${band.demography.dependents} young, ${band.demography.workingAdults} working, ${band.demography.elders} old`;
  const foundedLine = foundingContext === undefined
    ? `Founded in Year ${founding.foundedAt.year} as ${articleFor(founderKind)} ${founderKind}, with ${founding.startingPopulation} people (${startingCohorts})`
    : `Founded in Year ${founding.foundedAt.year} as ${articleFor(founderKind)} ${founderKind}, with ${founding.startingPopulation} people (${startingCohorts}), and ${foundingContext}`;
  const nowLine = currentContext === undefined
    ? `Now it has ${band.demography.population} people (${currentCohorts})`
    : `Now it has ${band.demography.population} people (${currentCohorts}), and ${currentContext}`;
  const knownStart = founding.startingKnownTileCount;
  const knownNow = knownBreadthForChronicle(band);
  const changeLine = joinSentences([
    populationChangeSentence(founding.startingPopulation, band.demography.population),
    knownNow > knownStart
      ? `Known ground grew from ${knownStart} founding records to about ${knownNow} current records`
      : knownNow === knownStart
        ? `Known ground is still about ${knownNow} records`
        : `The current known-ground record is smaller than the founding record (${knownNow} now, ${knownStart} at founding)`,
  ]);
  const inheritanceLine = founding.kind === "fission_daughter"
    ? history.inheritedEraSummaries.length + history.inheritedEpisodes.length > 0
      ? `This daughter band carries ${history.inheritedEraSummaries.length} parent-era summaries and ${history.inheritedEpisodes.length} inherited episodes as lineage memory, not personally lived years.`
      : `This daughter band's personally lived record starts in Year ${founding.foundedAt.year}.`
    : undefined;
  const terminal = history.terminalRecord;
  const terminalLine = terminal === undefined
    ? undefined
    : terminal.cause === "absorbed"
      ? `Its independent record ends in Year ${terminal.year}, when ${terminal.populationAtEnd} people were absorbed into another band.`
      : `Its independent record ends in Year ${terminal.year}, when ${terminal.populationAtEnd} people disappeared from the active band record.`;

  return {
    foundedLine: sentenceCase(foundedLine),
    nowLine: sentenceCase(nowLine),
    changeLine,
    inheritanceLine,
    terminalLine,
  };
}

function foundingTileContextPhrase(founding: BandDeepHistoryState["founding"]): string | undefined {
  const contexts = [
    founding.foundingTileIsRiverbank === true ? "riverbank tile" : undefined,
    founding.foundingTileIsCoastal === true ? "coastal tile" : undefined,
    founding.foundingTileIsFloodplain === true ? "floodplain tile" : undefined,
  ].filter((entry): entry is string => entry !== undefined);

  if (contexts.length === 0) {
    return undefined;
  }

  return `on a recorded ${joinNaturalList(contexts)}`;
}

function currentTileContextPhrase(world: WorldState, band: Band): string | undefined {
  const tile = world.tiles[band.position];

  if (tile === undefined) {
    return undefined;
  }

  const contexts = [
    tile.isRiverbank ? "riverbank tile" : undefined,
    tile.isCoastal ? "coastal tile" : undefined,
    tile.isFloodplain ? "floodplain tile" : undefined,
  ].filter((entry): entry is string => entry !== undefined);

  return contexts.length === 0 ? undefined : `is currently on a recorded ${joinNaturalList(contexts)}`;
}

function knownBreadthForChronicle(band: Band): number {
  return (
    Object.keys(band.knowledge.observedTiles).length +
    band.knowledge.compressedKnownTileSummaries.reduce((sum, summary) => sum + summary.tileCount, 0) +
    band.knowledge.knownAreaSummaries.reduce((sum, summary) => sum + summary.tileCount, 0)
  );
}

function populationChangeSentence(start: number, current: number): string {
  if (current > start) {
    return `Population rose from ${start} to ${current}`;
  }

  if (current < start) {
    return `Population fell from ${start} to ${current}`;
  }

  return `Population stayed near its founding size of ${start}`;
}

function buildDeepMemoryBoundaryLine(history: BandDeepHistoryState, band: Band): string {
  const recentRange = getRecentMemoryRangeLabel(band);
  const durableRange = getDeepHistoryYearRangeLabel(history);

  if (recentRange === undefined) {
    return `Durable history covers ${durableRange}; no detailed recent event window is available for this band.`;
  }

  return `Durable history covers ${durableRange}; the recent record keeps closer detail for ${recentRange}.`;
}

function selectDeepHistoryEras(eras: readonly BandChronicleDeepHistoryEraRecord[]): readonly BandChronicleDeepHistoryEraRecord[] {
  if (eras.length <= DEEP_HISTORY_ERA_DISPLAY_CAP) {
    return eras;
  }

  const selected = new Map<string, BandChronicleDeepHistoryEraRecord>();
  const add = (era: BandChronicleDeepHistoryEraRecord | undefined) => {
    if (era !== undefined) {
      selected.set(era.id, era);
    }
  };

  add(eras[0]);
  add(eras[1]);
  for (const era of eras.slice(-3)) {
    add(era);
  }

  return [...selected.values()]
    .sort((left, right) => (left.startYear - right.startYear) || left.id.localeCompare(right.id))
    .slice(0, DEEP_HISTORY_ERA_DISPLAY_CAP);
}

function deepEraTitle(era: BandChronicleDeepHistoryEraRecord): string {
  if (era.closeTrigger === "terminal") {
    return "The final recorded era";
  }

  if (era.fissionCount > 0 || era.headline === "branching_years") {
    return "The line branches";
  }

  switch (era.headline) {
    case "growth_years":
      return "Population grew";
    case "loss_years":
      return "Population thinned";
    case "hardship_years":
      return "Hard years";
    case "recovery_years":
      return "Recovery years";
    case "wandering_years":
      return "Years of movement";
    case "settling_years":
      return "Camps held longer";
    case "steady_years":
    default:
      return "Steady years";
  }
}

function deepEraSummary(era: BandChronicleDeepHistoryEraRecord): string {
  const stress = [
    era.hungerYears > 0 ? `${era.hungerYears} hunger year${plural(era.hungerYears)}` : undefined,
    era.waterStressYears > 0 ? `${era.waterStressYears} water-stress year${plural(era.waterStressYears)}` : undefined,
    era.fissionCount > 0 ? `${era.fissionCount} daughter split${plural(era.fissionCount)}` : undefined,
    era.movesCount > 0 ? `${era.movesCount} recorded move${plural(era.movesCount)}` : undefined,
  ].filter((entry): entry is string => entry !== undefined);
  const churn = era.births + era.deaths > 0
    ? `${era.births} births and ${era.deaths} deaths were recorded`
    : undefined;
  const compressed = era.merged
    ? `Older detail is compressed across ${era.mergedSpanCount} era slices`
    : undefined;

  return joinSentences([
    populationChangeSentence(era.populationStart, era.populationEnd),
    churn,
    stress.length === 0 ? undefined : `The durable counters also keep ${joinNaturalList(stress)}`,
    compressed,
  ]);
}

function selectDeepHistoryEpisodes(
  episodes: readonly BandChronicleDeepHistoryEpisodeRecord[],
  capCount: number,
): readonly BandChronicleDeepHistoryEpisodeRecord[] {
  return [...episodes]
    .sort((left, right) =>
      deepEpisodeScore(right) - deepEpisodeScore(left) ||
      left.startYear - right.startYear ||
      left.id.localeCompare(right.id))
    .slice(0, capCount)
    .sort((left, right) => (left.startYear - right.startYear) || left.id.localeCompare(right.id));
}

function deepEpisodeScore(episode: BandChronicleDeepHistoryEpisodeRecord): number {
  const typeWeight: Readonly<Record<string, number>> = {
    band_absorbed_end: 4,
    band_collapsed_end: 4,
    daughter_branch_formed: 3,
    near_collapse: 3,
    population_thinned: 2.4,
    population_recovered: 2.2,
    long_hunger_period: 2,
    route_became_memory: 1.8,
    hard_crossing_remembered: 1.8,
    camp_became_home: 1.5,
    country_expanded: 1.4,
    fallback_reliance_period: 1.4,
    water_caution_period: 1.3,
  };

  return (typeWeight[episode.type] ?? 1) + episode.severity + Math.min(0.6, episode.occurrenceCount * 0.05);
}

function deepEpisodeDisplay(
  episode: BandChronicleDeepHistoryEpisodeRecord,
  provenance: "lived" | "inherited",
): BandChronicleDeepHistoryEpisode {
  return {
    id: `deep-episode:${episode.id}`,
    title: deepEpisodeTitle(episode.type),
    yearRange: formatDeepYearRange(episode.startYear, episode.endYear ?? episode.lastUpdatedYear),
    summary: deepEpisodeSummary(episode),
    provenance,
    evidenceChips: evidenceChips(episode.evidence),
  };
}

function dedupeDeepEpisodeDisplays(
  episodes: readonly BandChronicleDeepHistoryEpisode[],
): readonly BandChronicleDeepHistoryEpisode[] {
  const seen = new Set<string>();
  const output: BandChronicleDeepHistoryEpisode[] = [];

  for (const episode of episodes) {
    const key = `${episode.title}::${episode.summary}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(episode);
  }

  return output;
}

function deepEpisodeTitle(type: BandChronicleDeepHistoryEpisodeRecord["type"]): string {
  switch (type) {
    case "population_thinned":
      return "Population thinned";
    case "population_recovered":
      return "Population recovered";
    case "daughter_branch_formed":
      return "Branch formed";
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

function deepEpisodeSummary(episode: BandChronicleDeepHistoryEpisodeRecord): string {
  const d = episode.detail;

  switch (episode.type) {
    case "population_thinned": {
      const netChange = finiteHistoryNumber(d.netChange);
      const basePopulation = finiteHistoryNumber(d.basePopulation);
      if (netChange !== undefined && basePopulation !== undefined) {
        return `Population fell by ${Math.abs(netChange)} from a base of ${basePopulation}.`;
      }
      if (netChange !== undefined) {
        return `Population fell by ${Math.abs(netChange)} in the durable record.`;
      }
      return "The durable record marks a real population decline.";
    }
    case "population_recovered": {
      const netChange = finiteHistoryNumber(d.netChange);
      const basePopulation = finiteHistoryNumber(d.basePopulation);
      if (netChange !== undefined && basePopulation !== undefined) {
        return `Population recovered by ${netChange} from a base of ${basePopulation}.`;
      }
      if (netChange !== undefined) {
        return `Population recovered by ${netChange} in the durable record.`;
      }
      return "The durable record marks a real population recovery.";
    }
    case "daughter_branch_formed":
      return finiteHistoryNumber(d.daughterPopulation) === undefined
        ? "A daughter band formed in the durable record."
        : `A daughter band began with ${d.daughterPopulation} people.`;
    case "long_hunger_period":
      return finiteHistoryNumber(d.streakSeasons) === undefined
        ? "Hunger pressure lasted long enough to become a durable episode."
        : `Hunger pressure lasted ${d.streakSeasons} seasons.`;
    case "water_caution_period":
      return finiteHistoryNumber(d.waterStressSeasonsLast8) === undefined
        ? "Water stress repeated enough to remain in durable caution memory."
        : `Water stress appeared in ${d.waterStressSeasonsLast8} recent seasons.`;
    case "route_became_memory":
      return finiteHistoryNumber(d.useCount) === undefined
        ? "A route was used repeatedly enough to survive as durable route memory."
        : `A route was used ${d.useCount} times, enough to survive as durable route memory.`;
    case "country_expanded": {
      const fromBreadth = finiteHistoryNumber(d.fromBreadth);
      const toBreadth = finiteHistoryNumber(d.toBreadth);
      return fromBreadth === undefined || toBreadth === undefined
        ? "Known ground expanded enough to survive as durable country memory."
        : `Known ground expanded from ${fromBreadth} to ${toBreadth} records.`;
    }
    case "camp_became_home":
      return finiteHistoryNumber(d.repeatedReturnCount) === undefined
        ? "A recorded camp place was returned to enough times to remain in durable place memory."
        : `A recorded camp place was returned to ${d.repeatedReturnCount} times.`;
    case "hard_crossing_remembered":
      return finiteHistoryNumber(d.useCount) === undefined
        ? "A difficult crossing repeated enough to remain as caution memory."
        : `A difficult crossing was used ${d.useCount} times and kept as caution memory.`;
    case "fallback_reliance_period":
      return finiteHistoryNumber(d.years) === undefined
        ? "Fallback foods mattered for enough recorded years to remain in durable memory."
        : `Fallback foods mattered for ${d.years} recorded years.`;
    case "near_collapse":
      return `Extinction risk reached ${formatIntensityPercent(d.extinctionRisk)} in the durable record.`;
    case "band_absorbed_end":
      return `The final record keeps ${d.populationAtEnd ?? "the remaining"} people joining another band.`;
    case "band_collapsed_end":
      return `The final record keeps ${d.populationAtEnd ?? "the remaining"} people disappearing from the active band record.`;
  }
}

function finiteHistoryNumber(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function formatIntensityPercent(value: number | undefined): string {
  return value === undefined ? "a high level" : `${Math.round(value * 100)}%`;
}

function evidenceChips(evidence: readonly HistoryEvidenceRef[]): readonly BandChronicleDeepHistoryEvidenceChip[] {
  return uniqueStrings(evidence.map((ref) => evidenceKindLabel(ref.kind)))
    .slice(0, DEEP_HISTORY_EVIDENCE_CHIP_CAP)
    .map((label) => ({ label }));
}

function evidenceKindLabel(kind: string): string {
  switch (kind) {
    case "creation_record":
      return "founding record";
    case "fission_event":
      return "split record";
    case "lineage_link":
      return "lineage link";
    case "demographic_churn":
      return "birth/death record";
    case "seasonal_support":
      return "seasonal support";
    case "viability_record":
      return "viability record";
    case "place_memory":
      return "place memory";
    case "route_memory":
      return "route memory";
    case "crossing_memory":
      return "crossing memory";
    case "movement_record":
      return "movement record";
    case "knowledge_breadth":
      return "known-ground count";
    case "pressure_state":
      return "pressure state";
    case "inherited_summary":
      return "inherited summary";
    default:
      return cleanPlayerText(kind);
  }
}

function getDeepHistoryYearRangeLabel(history: BandDeepHistoryState): string {
  const years = [
    history.founding.foundedAt.year,
    ...history.eras.flatMap((era) => [era.startYear, era.endYear]),
    ...history.episodes.flatMap((episode) => [episode.startYear, episode.endYear ?? episode.lastUpdatedYear]),
    ...history.inheritedEraSummaries.flatMap((era) => [era.startYear, era.endYear]),
    ...history.inheritedEpisodes.flatMap((episode) => [episode.startYear, episode.endYear ?? episode.lastUpdatedYear]),
    ...(history.openEra === undefined ? [] : [history.openEra.startYear, history.lastAdvancedYear]),
    ...(history.terminalRecord === undefined ? [] : [history.terminalRecord.year]),
  ].filter((year) => Number.isFinite(year));

  if (years.length === 0) {
    return "an unknown range";
  }

  return formatDeepYearRange(Math.min(...years), Math.max(...years));
}

function getRecentMemoryRangeLabel(band: Band): string | undefined {
  const years = (band.eventHistory?.last25Years ?? []).map((entry) => entry.year);

  if (years.length === 0) {
    return undefined;
  }

  return formatDeepYearRange(Math.min(...years), Math.max(...years));
}

function formatDeepYearRange(startYear: number, endYear: number): string {
  return startYear === endYear ? `Year ${startYear}` : `Years ${startYear}-${endYear}`;
}

function buildLongStory(input: WikiLayerInput): readonly BandChronicleParagraph[] {
  const { context, tracker } = input;
  const { band, world } = context;
  const age = bandAgeYears(world, band);
  const deepHistory = band.deepHistory;

  if (deepHistory !== undefined && age >= LONG_STORY_MIN_AGE_YEARS) {
    const bandKey = String(band.id);
    const firstEra = deepHistory.eras[0];
    const latestEra = deepHistory.eras[deepHistory.eras.length - 1];
    const standoutEpisode = selectDeepHistoryEpisodes(deepHistory.episodes, DEEP_HISTORY_EPISODE_DISPLAY_CAP)[0];
    const inheritedLine = deepHistory.founding.kind === "fission_daughter"
      ? "Its own lived story begins at the split; parent history is kept separately as inherited memory."
      : undefined;
    const opener = pickTemplate(tracker, `deep-long-story:${bandKey}`, [
      `${band.name}'s older history is now carried in founding records, compressed eras, and durable episodes.`,
      `${band.name}'s long record reaches beyond the recent yearly memory into compressed eras and remembered episodes.`,
    ]);
    const eraLine = firstEra === undefined
      ? undefined
      : latestEra !== undefined && latestEra.id !== firstEra.id
        ? `The durable era record runs from ${formatDeepYearRange(firstEra.startYear, latestEra.endYear)}.`
        : `The durable era record begins with ${formatDeepYearRange(firstEra.startYear, firstEra.endYear)}.`;
    const episodeLine = standoutEpisode === undefined
      ? undefined
      : `${deepEpisodeTitle(standoutEpisode.type)} survives as long-history evidence: ${deepEpisodeSummary(standoutEpisode)}.`;
    const boundary = buildDeepMemoryBoundaryLine(deepHistory, band);

    return definedParagraphs([
      makeParagraph("deep-long-story:1", [joinSentences([opener, eraLine, episodeLine])]),
      makeParagraph("deep-long-story:2", [joinSentences([inheritedLine, boundary])]),
    ]);
  }

  if (age < LONG_STORY_MIN_AGE_YEARS) {
    return [];
  }

  const bandKey = String(band.id);
  const country = deriveFamiliarCountry(band, world.time.tick);
  const knownIntimate = country.coreTiles.length;
  const knownWell = country.familiarTiles.length;
  const corridors = Object.values(band.travelCorridors);
  const mostWalked = corridors.reduce((max, corridor) => Math.max(max, corridor.useCount), 0);
  const scarredCrossing = Object.values(band.crossingMemories)
    .some((crossing) => crossing.riskMemory >= 0.3 && crossing.useCount >= 1);
  const foodLabels = (band.resourceEcology?.support.topContributingClasses ?? [])
    .filter((entry) => entry.supportShare >= 0.08 && entry.knowledgeConfidence >= 0.5)
    .slice(0, 2)
    .map((entry) => lowerFirst(cleanPlayerText(entry.label)));
  const population = Math.max(0, Math.round(band.demography.population));
  const households = Math.max(1, Math.round(band.demography.householdCount));
  const thinMargin = band.demography.population > 0 &&
    (band.demography.dependents + band.demography.elders) / band.demography.population >= 0.45;

  const evidence: (string | undefined)[] = [
    knownIntimate + knownWell >= 12
      ? `Its people now know ${knownIntimate} places intimately${knownWell > 0 ? ` and ${knownWell} more well enough to move with confidence` : ""} — a country learned, not given.`
      : undefined,
    mostWalked >= 3
      ? scarredCrossing
        ? `One route has been walked ${mostWalked} times, and the old crossing trouble never disappeared — it became part of how the band remembers movement.`
        : `One route has been walked ${mostWalked} times; movement runs on memory now, not on guesswork.`
      : scarredCrossing
        ? "A hard crossing left its mark early, and the caution it taught still shapes how the band moves."
        : undefined,
    foodLabels.length > 0
      ? `Food knowledge deepened: ${joinNaturalList(foodLabels)} are known ground now.`
      : undefined,
    thinMargin || population <= 12
      ? `The people are few for so much remembering — ${population} in ${households} household${plural(households)}, with little spare margin.`
      : undefined,
  ];
  const grounded = evidence.filter((line): line is string => line !== undefined);

  if (grounded.length < 2) {
    return [];
  }

  const spanWord = age >= 95 ? "a century" : age >= 70 ? "most of a century" : "decades";
  const origin = band.lineage === undefined;
  const opener = pickTemplate(tracker, `long-story:${bandKey}`, origin
    ? [
      `Across ${spanWord}, ${band.name} has carried its story from the world's first years to now.`,
      `${band.name} has been walking this country for ${spanWord}, and the walking shows.`,
    ]
    : [
      `Across ${spanWord}, ${band.name} has grown from a young split into a band with its own long memory.`,
      `${spanWord.charAt(0).toUpperCase()}${spanWord.slice(1)} separate ${band.name} from the split that made it, and the years left their shape.`,
    ]);
  const closer = pickTemplate(tracker, `long-story-close:${bandKey}`, [
    "What survives in full detail is only the recent record; the older story lives in the places, routes, and knowledge that remain.",
    "The yearly record below is recent memory — the rest of the story is carried by what the band still knows and still returns to.",
  ]);

  return definedParagraphs([
    makeParagraph("long-story:1", [`${opener} `, grounded.slice(0, 3).join(" ")]),
    makeParagraph("long-story:2", [closer]),
  ]);
}

function buildEras(input: WikiLayerInput): readonly BandChronicleEra[] {
  const { context } = input;
  const { band, world } = context;
  const deepHistory = band.deepHistory;

  if (deepHistory !== undefined && deepHistory.eras.length > 0) {
    return selectDeepHistoryEras(deepHistory.eras).map((era) => ({
      id: `deep-${era.id}`,
      title: `${formatDeepYearRange(era.startYear, era.endYear)}: ${deepEraTitle(era)}`,
      summary: deepEraSummary(era),
    }));
  }

  if (bandAgeYears(world, band) < LONG_STORY_MIN_AGE_YEARS) {
    return [];
  }

  const country = deriveFamiliarCountry(band, world.time.tick);
  const corridors = Object.values(band.travelCorridors);
  const mostWalked = corridors.reduce((max, corridor) => Math.max(max, corridor.useCount), 0);
  const scarredCrossing = Object.values(band.crossingMemories)
    .some((crossing) => crossing.riskMemory >= 0.3 && crossing.useCount >= 1);
  const knowledgeCount = band.resourceEcology?.knowledge.memoryCount ?? 0;
  const thinMargin = band.demography.population > 0 &&
    (band.demography.dependents + band.demography.elders) / band.demography.population >= 0.45;
  const daughters = band.lineageReadability?.daughterBandIds.length ?? 0;

  const eras: (BandChronicleEra | undefined)[] = [
    mostWalked >= 3 || scarredCrossing
      ? {
        id: "era:routes",
        title: scarredCrossing ? "The crossing becomes route memory" : "Routes worn into memory",
        summary: scarredCrossing
          ? "Hard water and hard passages taught caution, and the caution outlived the seasons that caused it."
          : "Repeated journeys turned unknown ground into remembered ways.",
      }
      : undefined,
    country.coreTiles.length + country.familiarTiles.length >= 12
      ? {
        id: "era:country",
        title: "Known country expands",
        summary: country.familiarTiles.length > 0
          ? `From a narrow beginning, the band's world grew to ${country.coreTiles.length} intimate places and a wider familiar range.`
          : `From a narrow beginning, the band's world grew to ${country.coreTiles.length} intimately known places.`,
      }
      : undefined,
    knowledgeCount >= 6
      ? {
        id: "era:food",
        title: "Food knowledge deepens",
        summary: "Trial, failure, and return visits slowly turned strange plants and waters into a working larder.",
      }
      : undefined,
    thinMargin
      ? {
        id: "era:margin",
        title: "A thin demographic margin",
        summary: "Whatever the map gained, the balance of hands and mouths stayed tight — every loss of a worker mattered.",
      }
      : undefined,
    daughters > 0
      ? {
        id: "era:lineage",
        title: "The line branches",
        summary: `${daughters} daughter band${plural(daughters)} set out from this line and carried parts of its memory with them.`,
      }
      : undefined,
    {
      id: "era:now",
      title: `Now: ${lowerFirst(buildCurrentEra(context, input.majorArcs))}`,
      summary: sentenceCase(buildCurrentConditionPhrase(band)),
    },
  ];

  return eras.filter((era): era is BandChronicleEra => era !== undefined);
}

function buildLeadParagraphs(input: WikiLayerInput): readonly BandChronicleParagraph[] {
  const { context, tracker } = input;
  const { band, world } = context;
  const bandKey = String(band.id);
  const firstYear = context.yearFacts[0]?.year ?? world.time.year;
  const wayOfLife = wayOfLifePhrase(band);
  const mainArc = input.majorArcs[0];
  const place = input.importantPlaces[0];
  const resource = input.importantResources[0];
  const themes = input.talkThemes.slice(0, 2);

  const p1 = makeParagraph("lead:1", [
    `${band.name} is ${articleFor(wayOfLife)} ${wayOfLife} of ${band.demography.population} people. ${recordSpanPhrase(input)}`,
    mainArc === undefined ? undefined : pickTemplate(tracker, `lead:arc:${bandKey}`, [
      " Its recent story is mostly ",
      " Most of what the record keeps is ",
      " What the years add up to is largely ",
    ]),
    mainArc === undefined ? undefined : { text: arcEssence(mainArc.kind), linkId: mainArc.id },
    mainArc === undefined ? undefined : ".",
  ]);

  const p2 = makeParagraph("lead:2", [
    `Today the band is ${buildCurrentConditionPhrase(band)}`,
    place === undefined ? undefined : ", living around ",
    place === undefined ? undefined : { text: theify(place.label), linkId: place.id },
    resource === undefined ? undefined : ", while ",
    resource === undefined ? undefined : { text: lowerFirst(resource.label), linkId: resource.id },
    resource === undefined ? undefined : " carries much of the food story",
    ".",
  ]);

  const themeTopics = themes.map((theme) => talkTopicPhrase(theme.label));
  const p3 = themes.length === 0 ? undefined : makeParagraph("lead:3", [
    pickTemplate(tracker, `lead:talk:${bandKey}`, [
      `Around camp, talk keeps returning to ${joinNaturalList(themeTopics)} — repetition is how the band keeps its past alive.`,
      `What people repeat around the fire — ${joinNaturalList(themeTopics)} — is itself part of this history; it marks what the band could not afford to forget.`,
    ]),
  ]);

  return definedParagraphs([p1, p2, p3]);
}

function buildInfobox(input: WikiLayerInput): readonly BandChronicleInfoboxFact[] {
  const { context } = input;
  const { band, world } = context;
  const firstYear = context.yearFacts[0]?.year ?? world.time.year;
  const lineage = band.lineageReadability;
  const place = input.importantPlaces[0];
  const route = input.importantRoutes[0];
  const resource = input.importantResources[0];
  const pressureArc = input.majorArcs.find((arc) =>
    arc.kind === "decline" || arc.kind === "hunger" || arc.kind === "stagnation" || arc.kind === "logistics");
  const parentName = lineage?.parentBandId === undefined
    ? undefined
    : world.bands[lineage.parentBandId]?.name;
  const daughterCount = lineage?.daughterBandIds.length ?? 0;
  const founding = band.deepHistory?.founding;
  const foundedFact = founding === undefined
    ? undefined
    : {
      label: "Founded",
      value: founding.kind === "fission_daughter"
        ? `Year ${founding.foundedAt.year} - daughter split`
        : `Year ${founding.foundedAt.year} - origin band`,
    };

  const facts: (BandChronicleInfoboxFact | undefined)[] = [
    foundedFact,
    { label: "People", value: `${band.demography.population}` },
    { label: "Households", value: String(band.demography.householdCount) },
    {
      label: "Age balance",
      value: `${band.demography.dependents} young, ${band.demography.workingAdults} working, ${band.demography.elders} old`,
    },
    { label: "Way of life", value: sentenceCase(wayOfLifePhrase(band)) },
    { label: "Era", value: buildCurrentEra(context, input.majorArcs) },
    { label: "Condition", value: sentenceCase(buildCurrentConditionPhrase(band)) },
    place === undefined ? undefined : { label: "Key place", value: place.label, linkId: place.id },
    route === undefined ? undefined : { label: "Key route", value: route.label, linkId: route.id },
    pressureArc === undefined || pressureArc.causeLines.length === 0
      ? undefined
      : {
        label: "Main pressure",
        value: sentenceCase(phraseText(pressureArc.causeLines[0] ?? pressureArc.title)),
        linkId: pressureArc.id,
      },
    resource === undefined ? undefined : { label: "Main support", value: resource.label, linkId: resource.id },
    parentName === undefined
      ? { label: "Line", value: lineage === undefined || lineage.generationLabel === "origin" ? "Origin line" : sentenceCase(cleanPlayerText(lineage.generationLabel)) }
      : {
        label: "Line",
        value: `Daughter of ${parentName}`,
        linkId: lineage?.parentBandId === undefined ? undefined : `band:${String(lineage.parentBandId)}`,
      },
    daughterCount === 0 ? undefined : { label: "Daughter bands", value: String(daughterCount) },
    {
      label: "Recorded years",
      value: firstYear >= world.time.year
        ? `Just begun (Year ${world.time.year})`
        : bandAgeYears(world, band) > world.time.year - firstYear + LONG_STORY_SLACK_YEARS
          ? `Years ${firstYear}–${world.time.year} in detail`
          : `Years ${firstYear}–${world.time.year}`,
    },
  ];

  return facts.filter((fact): fact is BandChronicleInfoboxFact => fact !== undefined);
}

function wayOfLifePhrase(band: Band): string {
  const support = band.resourceEcology?.support;
  const aquatic = support?.aquaticContribution ?? 0;
  const plant = support?.plantContribution ?? 0;
  const fallback = support?.fallbackContribution ?? 0;
  const camped = band.protoCampMemory?.currentPlace !== undefined &&
    band.protoCampMemory.currentPlace.campLikeState !== "none";
  const base = aquatic > Math.max(plant, fallback) && aquatic > 0.15
    ? "water-edge forager group"
    : plant > Math.max(aquatic, fallback) && plant > 0.15
      ? "plant-gathering forager group"
      : fallback > 0.15
        ? "forager group leaning on fallback foods"
        : "mobile forager group";

  return camped ? `camp-centered ${base}` : base;
}

// --- History periods -----------------------------------------------------------

function buildPeriods(input: WikiLayerInput): readonly BandChroniclePeriod[] {
  const entries = input.yearlyEntries.slice(-PERIOD_CAP);
  // Cross-period dedupe: a talk record or repeated fact can span every year in
  // the window; without ownership every stretch reprints the same sentence.
  // The NEWEST stretch that carries a line owns it; older stretches drop it.
  const lineOwner = new Map<string, string>();

  for (const entry of entries) {
    const facts = input.context.yearFacts.filter((fact) => fact.year >= entry.startYear && fact.year <= entry.endYear);
    for (const line of facts.flatMap((fact) => fact.summaryLines)) {
      lineOwner.set(line, entry.id);
    }
  }

  return entries.map((entry) => buildPeriod(input, entry, lineOwner));
}

function buildPeriod(
  input: WikiLayerInput,
  entry: BandChronicleYearEntry,
  lineOwner: ReadonlyMap<string, string>,
): BandChroniclePeriod {
  const { context, tracker } = input;
  const bandKey = String(context.band.id);
  const facts = context.yearFacts.filter((fact) => fact.year >= entry.startYear && fact.year <= entry.endYear);
  // An arc that spans the whole window would otherwise be name-dropped in
  // every stretch; mention it only where it begins or where it ends.
  const overlappingArcs = input.majorArcs
    .filter((arc) =>
      (arc.startYear >= entry.startYear && arc.startYear <= entry.endYear) ||
      (arc.endYear >= entry.startYear && arc.endYear <= entry.endYear))
    .slice(0, 2);
  const majorEventIds = new Set(input.majorEvents.map((event) => `event:${String(event.eventId)}`));
  const strongestEvent = facts
    .flatMap((fact) => fact.events)
    .sort(compareEventImportanceForYear)[0];
  const strongestEventLinkId = strongestEvent === undefined ? undefined : `event:${String(strongestEvent.eventId)}`;
  // A run of per-year quiet lines reads badly under a multi-year title;
  // compressed stretches get one quiet-period line instead. Lines owned by a
  // newer stretch (cross-period repeats) are dropped here.
  const quietLine = /^(No single crisis dominates|Year \d+ passed without|The record keeps no sharp turn)/;
  const notableLines = uniqueStrings(facts.flatMap((fact) => fact.summaryLines))
    .filter((line) => !entry.compressed || !quietLine.test(line))
    .filter((line) => (lineOwner.get(line) ?? entry.id) === entry.id);
  const notable = notableLines.length === 0
    ? [pickTemplate(tracker, `period-quiet:${bandKey}:${entry.id}`, [
      `No single crisis dominates ${entry.startYear}–${entry.endYear}; the record is one of steady, repeated work.`,
      `The years ${entry.startYear}–${entry.endYear} left a quiet record — the kind a band is usually glad to have.`,
    ])]
    : notableLines.slice(0, entry.compressed ? 3 : 4);
  const firstArc = overlappingArcs[0];
  const secondArc = overlappingArcs[1];

  const paragraph = makeParagraph(`period:${entry.id}`, [
    entry.compressed
      ? pickTemplate(tracker, `period-lead:${bandKey}:${entry.id}`, [
        "These years did not produce one sharp break; the same pressures repeated. ",
        "Nothing in this stretch stands alone — the record repeats more than it turns. ",
        "The record here reads as one continuous stretch rather than separate years. ",
      ])
      : undefined,
    `${joinSentences(notable)} `,
    firstArc === undefined ? undefined : pickTemplate(tracker, `period-arc:${bandKey}:${entry.id}`, [
      "This stretch belongs to ",
      "Seen from later years, this stretch is part of ",
      "The chronicle folds these years into ",
    ]),
    firstArc === undefined ? undefined : { text: lowerFirst(humanArcPhrase(firstArc.kind)), linkId: firstArc.id },
    firstArc === undefined ? undefined : (secondArc === undefined ? ". " : " and "),
    secondArc === undefined ? undefined : { text: lowerFirst(humanArcPhrase(secondArc.kind)), linkId: secondArc.id },
    secondArc === undefined ? undefined : ". ",
    strongestEvent === undefined || strongestEventLinkId === undefined || !majorEventIds.has(strongestEventLinkId)
      ? undefined
      : "The sharpest memory from this stretch is ",
    strongestEvent === undefined || strongestEventLinkId === undefined || !majorEventIds.has(strongestEventLinkId)
      ? undefined
      : { text: lowerFirst(phraseText(strongestEvent.title)), linkId: strongestEventLinkId },
    strongestEvent === undefined || strongestEventLinkId === undefined || !majorEventIds.has(strongestEventLinkId)
      ? undefined
      : ".",
  ]);

  return {
    id: `period-block:${entry.id}`,
    startYear: entry.startYear,
    endYear: entry.endYear,
    title: periodTitle(tracker, bandKey, entry),
    paragraphs: definedParagraphs([paragraph]),
    yearPageIds: facts.map((fact) => `year:${fact.year}`),
    sourceYearEntryId: entry.id,
  };
}

function periodTitle(tracker: WikiTracker, bandKey: string, entry: BandChronicleYearEntry): string {
  const range = entry.compressed ? `Years ${entry.startYear}–${entry.endYear}` : `Year ${entry.startYear}`;
  return `${range} — ${periodFlavor(tracker, bandKey, entry)}`;
}

function periodFlavor(tracker: WikiTracker, bandKey: string, entry: BandChronicleYearEntry): string {
  const signals = entry.dominantSignals;
  const key = `period-title:${bandKey}:${entry.id}`;
  const plural = entry.compressed;

  if (signals.includes("weak-band pressure")) {
    return pickTemplate(tracker, key, ["A fragile stretch", "Close to the edge", "Thin margins"]);
  }

  if (signals.includes("food pressure")) {
    return plural
      ? pickTemplate(tracker, key, ["Holding on through thin returns", "The lean stretch", "Hunger set the terms"])
      : pickTemplate(tracker, key, ["A hungry year", "Thin returns", "Hunger set the terms"]);
  }

  if (signals.includes("water pressure")) {
    return pickTemplate(tracker, key, ["Chasing dependable water", "Dry-country caution"]);
  }

  if (signals.includes("movement and routes")) {
    return plural
      ? pickTemplate(tracker, key, ["Years on the move", "Testing routes and crossings", "The route-making stretch"])
      : pickTemplate(tracker, key, ["A year shaped by movement", "Testing routes and crossings"]);
  }

  if (signals.includes("camp and place memory")) {
    return plural
      ? pickTemplate(tracker, key, ["Holding the same worn camp", "Bound to a familiar place", "The camp pattern repeats"])
      : pickTemplate(tracker, key, ["A camp-centered year", "Bound to a familiar place"]);
  }

  if (signals.includes("births and deaths")) {
    return pickTemplate(tracker, key, ["The people changed", "Births and deaths reshaped the band"]);
  }

  if (signals.includes("splitting and lineage")) {
    return pickTemplate(tracker, key, ["Split pressure in camp", "The line under strain"]);
  }

  if (signals.includes("people and social memory")) {
    return pickTemplate(tracker, key, ["Strain and standing among people", "The social ledger"]);
  }

  if (signals.includes("animals and ecology")) {
    return pickTemplate(tracker, key, ["Reading the living country", "Signs in the country"]);
  }

  return plural
    ? pickTemplate(tracker, key, ["Quiet years", "A steady stretch", "Uneventful, and glad of it"])
    : pickTemplate(tracker, key, ["A quiet year", "A steady year"]);
}

// --- Thematic article sections ---------------------------------------------------

function linkedSummaryParts(label: string, linkId: string, summary: string): readonly WikiSegmentInput[] {
  const clean = cleanPlayerText(summary);

  if (clean.toLowerCase().startsWith(label.toLowerCase())) {
    const rest = clean.slice(label.length);
    return [{ text: label, linkId }, /[.!?]$/.test(rest) ? rest : `${rest}.`];
  }

  return [{ text: label, linkId }, `. ${sentenceCase(clean)}${/[.!?]$/.test(clean) ? "" : "."}`];
}

function buildThematicSections(input: WikiLayerInput): readonly BandChronicleArticleSection[] {
  return [
    buildPlacesSection(input),
    buildFoodSection(input),
    buildMovementSection(input),
    buildPeopleSection(input),
    buildTalkSection(input),
  ].filter((section): section is BandChronicleArticleSection => section !== undefined);
}

function buildPlacesSection(input: WikiLayerInput): BandChronicleArticleSection | undefined {
  const { tracker, context } = input;
  const bandKey = String(context.band.id);
  // Two places can share a player-facing label ("Known crossing camp" at two
  // tiles); repeating "X mattered because…" reads as template spam, so only
  // the strongest of each label is narrated here. Pages keep them all.
  const seenLabels = new Set<string>();
  const places = input.importantPlaces
    .filter((place) => {
      const key = place.label.toLowerCase();
      if (seenLabels.has(key)) {
        return false;
      }
      seenLabels.add(key);
      return true;
    })
    .slice(0, 3);
  const first = places[0];

  if (first === undefined) {
    return undefined;
  }

  const campArc = input.majorArcs.find((arc) => arc.kind === "camp" || arc.kind === "stagnation");
  const paragraphs = definedParagraphs([
    makeParagraph("section:places:1", [
      ...linkedSummaryParts(first.label, first.id, first.summary),
      campArc === undefined ? undefined : " Its weight in the record is part of ",
      campArc === undefined ? undefined : { text: lowerFirst(humanArcPhrase(campArc.kind)), linkId: campArc.id },
      campArc === undefined ? undefined : ".",
    ]),
    places[1] === undefined ? undefined : makeParagraph("section:places:2", [
      pickTemplate(tracker, `section:places:more:${bandKey}`, [
        "The range does not center on one spot alone. ",
        "Other ground holds the band's memory too. ",
      ]),
      ...linkedSummaryParts(places[1].label, places[1].id, places[1].summary),
    ]),
    places[2] === undefined ? undefined : makeParagraph("section:places:3", [
      ...linkedSummaryParts(places[2].label, places[2].id, places[2].summary),
    ]),
  ]);

  return paragraphs.length === 0 ? undefined : {
    id: "places",
    title: "Important places",
    paragraphs: paragraphs.slice(0, SECTION_PARAGRAPH_CAP),
  };
}

function buildFoodSection(input: WikiLayerInput): BandChronicleArticleSection | undefined {
  const { tracker, context } = input;
  const { band } = context;
  const bandKey = String(band.id);
  const resources = input.importantResources.slice(0, 3);
  const first = resources[0];

  if (first === undefined) {
    return undefined;
  }

  const fallbackHeavy = (band.resourceEcology?.support.fallbackContribution ?? 0) > 0.12;
  const sicknessActive = band.bodyCampLogistics?.sickness.active === true;
  const paragraphs = definedParagraphs([
    makeParagraph("section:food:1", [
      ...linkedSummaryParts(first.label, first.id, first.summary),
      resources[1] === undefined ? undefined : " Alongside it, ",
      resources[1] === undefined ? undefined : { text: lowerFirst(resources[1].label), linkId: resources[1].id },
      resources[1] === undefined ? undefined : " keeps appearing in the record",
      resources[2] === undefined ? undefined : ", as does ",
      resources[2] === undefined ? undefined : { text: lowerFirst(resources[2].label), linkId: resources[2].id },
      resources[1] === undefined ? undefined : ".",
    ]),
    !fallbackHeavy && !sicknessActive ? undefined : makeParagraph("section:food:2", [
      fallbackHeavy
        ? pickTemplate(tracker, `section:food:fallback:${bandKey}`, [
          "Fallback foods are not a footnote here: they repeatedly carried the band through thin seasons, and each time they charged something back in labor, carrying strain, or sickness risk.",
          "When better returns failed, the band reached for fallback foods again and again — help that kept people alive while quietly adding costs of its own.",
        ])
        : undefined,
      sicknessActive
        ? " Sickness sits in the same story: it thinned the working hands exactly when food work needed them."
        : undefined,
    ]),
  ]);

  return paragraphs.length === 0 ? undefined : {
    id: "food-ecology",
    title: "Food and ecology",
    paragraphs: paragraphs.slice(0, SECTION_PARAGRAPH_CAP),
  };
}

function buildMovementSection(input: WikiLayerInput): BandChronicleArticleSection | undefined {
  const { tracker, context } = input;
  const bandKey = String(context.band.id);
  const routes = input.importantRoutes.slice(0, 3);
  const first = routes[0];

  if (first === undefined) {
    return undefined;
  }

  const moveArc = input.majorArcs.find((arc) => arc.kind === "movement" || arc.kind === "foothold");
  const movementEpisode = input.episodes.find((episode) => episode.category === "movement");
  const paragraphs = definedParagraphs([
    makeParagraph("section:movement:1", [
      ...linkedSummaryParts(first.label, first.id, first.summary),
      routes[1] === undefined ? undefined : " The band also keeps ",
      routes[1] === undefined ? undefined : { text: lowerFirst(routes[1].label), linkId: routes[1].id },
      routes[1] === undefined ? undefined : " in living memory.",
    ]),
    moveArc === undefined && movementEpisode === undefined ? undefined : makeParagraph("section:movement:2", [
      movementEpisode === undefined ? undefined : `${movementEpisode.summary} `,
      moveArc === undefined ? undefined : pickTemplate(tracker, `section:movement:arc:${bandKey}`, [
        "The movement record bends around remembered risk; the fuller story is ",
        "Taken together, these paths and refusals form ",
      ]),
      moveArc === undefined ? undefined : { text: lowerFirst(humanArcPhrase(moveArc.kind)), linkId: moveArc.id },
      moveArc === undefined ? undefined : ".",
    ]),
  ]);

  return paragraphs.length === 0 ? undefined : {
    id: "movement-crossings",
    title: "Movement and crossings",
    paragraphs: paragraphs.slice(0, SECTION_PARAGRAPH_CAP),
  };
}

function buildPeopleSection(input: WikiLayerInput): BandChronicleArticleSection | undefined {
  const { tracker, context } = input;
  const { band } = context;
  const bandKey = String(band.id);
  const relations = input.importantRelations.slice(0, 2);
  const records = band.demography.demographicChurn?.records ?? [];
  const births = records.reduce((sum, record) => sum + record.births, 0);
  const deaths = records.reduce((sum, record) => sum + record.deaths, 0);
  const socialArc = input.majorArcs.find((arc) =>
    arc.kind === "social" || arc.kind === "lineage" || arc.kind === "logistics");
  const firstRelation = relations[0];

  if (records.length === 0 && firstRelation === undefined && socialArc === undefined) {
    return undefined;
  }

  const paragraphs = definedParagraphs([
    records.length === 0 ? undefined : makeParagraph("section:people:1", [
      pickTemplate(tracker, `section:people:churn:${bandKey}`, [
        `Across the recorded years, ${births} birth${plural(births)} and ${deaths} death${plural(deaths)} are remembered — and each change in the people changed what work was possible.`,
        `The record keeps ${births} birth${plural(births)} and ${deaths} death${plural(deaths)}; behind every one, the balance of carriers, workers, and dependents shifted.`,
      ]),
    ]),
    firstRelation === undefined ? undefined : makeParagraph("section:people:2", [
      ...linkedSummaryParts(firstRelation.label, firstRelation.linkTargetId, firstRelation.summary),
      relations[1] === undefined ? undefined : ` ${sentenceCase(cleanPlayerText(relations[1].summary))}${/[.!?]$/.test(cleanPlayerText(relations[1].summary)) ? "" : "."}`,
    ]),
    socialArc === undefined ? undefined : makeParagraph("section:people:3", [
      "How people held together under this is its own story: ",
      { text: lowerFirst(humanArcPhrase(socialArc.kind)), linkId: socialArc.id },
      ".",
    ]),
  ]);

  return paragraphs.length === 0 ? undefined : {
    id: "people-social",
    title: "People and social history",
    paragraphs: paragraphs.slice(0, SECTION_PARAGRAPH_CAP),
  };
}

function buildTalkSection(input: WikiLayerInput): BandChronicleArticleSection | undefined {
  const { tracker, context } = input;
  const bandKey = String(context.band.id);
  const themes = input.talkThemes.slice(0, 3);
  const first = themes[0];

  if (first === undefined) {
    return undefined;
  }

  const labels = themes.map((theme) => talkTopicPhrase(theme.label));
  const paragraphs = definedParagraphs([
    makeParagraph("section:talk:1", [
      pickTemplate(tracker, `section:talk:lead:${bandKey}`, [
        `Around camp, some worries refused to die: talk kept returning to ${joinNaturalList(labels)}.`,
        `The band's evenings had their own record-keeping — talk circled back to ${joinNaturalList(labels)}.`,
      ]),
    ]),
    makeParagraph("section:talk:2", [
      `${sentenceCase(cleanPlayerText(first.summary))}${/[.!?]$/.test(cleanPlayerText(first.summary)) ? "" : "."} `,
      pickTemplate(tracker, `section:talk:why:${bandKey}`, [
        "What people repeat is not decoration — it is how the band keeps route risk, food places, and obligations alive between seasons.",
        "Repetition is the band's memory working: what stays in talk stays in reach.",
      ]),
    ]),
  ]);

  return paragraphs.length === 0 ? undefined : {
    id: "talk-memory",
    title: "Talk and memory",
    paragraphs: paragraphs.slice(0, SECTION_PARAGRAPH_CAP),
  };
}

// --- Focused pages ---------------------------------------------------------------

function capFacts(facts: readonly (BandChroniclePageFact | undefined)[]): readonly BandChroniclePageFact[] {
  return facts
    .filter((fact): fact is BandChroniclePageFact => fact !== undefined && fact.value.length > 0)
    .slice(0, PAGE_FACT_CAP);
}

function capRelated(ids: readonly (string | undefined)[]): readonly string[] {
  return uniqueStrings(ids).slice(0, RELATED_LINKS_PER_PAGE_CAP);
}

function buildPeriodPages(input: WikiLayerInput): readonly BandChroniclePage[] {
  const { context } = input;
  const currentYear = context.world.time.year;

  return input.majorArcs.map((arc) => {
    const standing = arcStanding(arc, currentYear);
    const arcEventIds = new Set(arc.sourceEventIds.map(String));
    const arcEpisodes = input.episodes
      .filter((episode) => episode.sourceEventIds.some((id) => arcEventIds.has(String(id))))
      .slice(0, 2);
    const span = arc.startYear === arc.endYear
      ? `Year ${arc.startYear}`
      : `Years ${arc.startYear}–${arc.endYear}`;
    const refs = matchedReferents(input.memoryReferents, arc.kind).slice(0, 2);

    return {
      id: arc.id,
      kind: "period" as const,
      title: arcPageTitle(arc),
      subtitle: `${span} — ${arcStandingLabel(standing)}`,
      paragraphs: buildArcNarrative(input, arc, arcEpisodes, refs, standing).slice(0, PAGE_PARAGRAPH_CAP),
      facts: capFacts([
        { label: "Span", value: span },
        { label: "Standing", value: sentenceCase(arcStandingLabel(standing)) },
        { label: "Grounded causes", value: String(arc.causeLines.length) },
        arcEpisodes.length === 0 ? undefined : { label: "Repeating troubles", value: String(arcEpisodes.length) },
      ]),
      relatedLinkIds: capRelated([
        ...arc.sourceEventIds.slice(0, 3).map((id) => `event:${String(id)}`),
        `year:${arc.startYear}`,
        arc.endYear === arc.startYear ? undefined : `year:${arc.endYear}`,
        ...refs.map((referent) => `referent:${referent.id}`),
      ]),
    };
  });
}

function buildArcNarrative(
  input: WikiLayerInput,
  arc: BandChronicleMajorArc,
  arcEpisodes: readonly BandChronicleEpisode[],
  refs: readonly MemoryReferent[],
  standing: ArcStanding,
): readonly BandChronicleParagraph[] {
  const { context, tracker } = input;
  const bandKey = String(context.band.id);
  const theme = input.talkThemes.find((candidate) =>
    candidate.sourceTalkIds.some((id) => arc.sourceTalkIds.includes(id)));
  const firstRef = refs[0];
  // Two referents can carry the same player-facing label; naming it twice in
  // one sentence reads as a bug, so the second mention must differ.
  const secondRef = refs.find((candidate) =>
    firstRef !== undefined &&
    candidate.id !== firstRef.id &&
    phraseText(candidate.shortLabel).toLowerCase() !== phraseText(firstRef.shortLabel).toLowerCase());

  const causeParagraph = makeParagraph(`arc:${arc.id}:causes`, [
    `${arcOpener(tracker, bandKey, arc)} `,
    stitchCauses(tracker, `arc-stitch:${bandKey}:${arc.id}`, arc.causeLines),
  ]);

  const arcPhrase = humanArcPhrase(arc.kind);
  const evidenceParagraph = makeParagraph(`arc:${arc.id}:evidence`, [
    arcEpisodes.length === 0 ? undefined : `${arcEpisodes.map((episode) => episode.summary).join(" ")} `,
    firstRef === undefined ? undefined : pickTemplate(tracker, `arc-refs:${bandKey}:${arc.id}`, [
      `Concrete traces of ${arcPhrase} survive in memory: `,
      `The evidence for ${arcPhrase} is not abstract — memory keeps `,
      `What grounds ${arcPhrase} is specific: memory holds `,
    ]),
    firstRef === undefined ? undefined : { text: lowerFirst(phraseText(firstRef.shortLabel)), linkId: `referent:${firstRef.id}` },
    secondRef === undefined ? undefined : " and ",
    secondRef === undefined ? undefined : { text: lowerFirst(phraseText(secondRef.shortLabel)), linkId: `referent:${secondRef.id}` },
    firstRef === undefined ? undefined : ". ",
    theme === undefined ? undefined : pickTemplate(tracker, `arc-talk:${bandKey}:${arc.id}`, [
      `Talk did its part too — people kept returning to ${lowerFirst(phraseText(theme.label))}.`,
      `Around camp, ${lowerFirst(phraseText(theme.label))} kept the pressure socially alive.`,
    ]),
  ]);

  // Only the strongest consequence line is narrated; deeper grounding strings
  // stay in Technical so provenance text never leaks into article prose.
  const consequence = arc.consequenceLines[0];
  const standingSentence = standing === "ongoing"
    ? pickTemplate(tracker, `arc-standing:${bandKey}:${arc.id}`, [
      `This part of the record is not closed: the weight of ${arcPhrase} still sits on the band's current choices.`,
      `The pressure behind ${arcPhrase} has not fully lifted; it still narrows what the band can safely try.`,
    ])
    : standing === "recent"
      ? `The worst of ${arcPhrase} has eased, but the record kept its mark — later choices stayed more cautious.`
      : `${sentenceCase(arcPhrase)} lies behind the band now, though what people repeated about it stayed in the record.`;
  const consequenceParagraph = makeParagraph(`arc:${arc.id}:consequence`, [
    `${standingSentence} `,
    consequence === undefined ? undefined : `${sentenceCase(cleanPlayerText(consequence))}${/[.!?]$/.test(cleanPlayerText(consequence)) ? "" : "."}`,
  ]);

  return definedParagraphs([causeParagraph, evidenceParagraph, consequenceParagraph]);
}

function buildYearPages(input: WikiLayerInput): readonly BandChroniclePage[] {
  const { context } = input;
  const majorEventIds = new Set(input.majorEvents.map((event) => `event:${String(event.eventId)}`));
  const yearSet = new Set(context.yearFacts.map((fact) => fact.year));

  return context.yearFacts.slice(-YEAR_PAGE_CAP).map((fact) => {
    const hungry = fact.seasonalSamples.some((sample) => sample.deficitRatio >= 0.28 || sample.foodStress >= 0.32);
    const dry = fact.seasonalSamples.some((sample) => sample.waterStress >= 0.32);
    const births = fact.demographicRecord?.births ?? 0;
    const deaths = fact.demographicRecord?.deaths ?? 0;
    const summaryText = joinSentences(fact.summaryLines);
    const linkableEvents = fact.events
      .filter((event) => majorEventIds.has(`event:${String(event.eventId)}`))
      .slice(0, 3);
    const repeatedTalk = [...fact.talkRecords].sort((left, right) => right.count - left.count)[0];
    const talkAlreadyTold = summaryText.includes("kept returning");
    const overlappingArcs = input.majorArcs
      .filter((arc) => arc.startYear <= fact.year && arc.endYear >= fact.year)
      .slice(0, 2);
    const eventParts: WikiSegmentInput[] = linkableEvents.length === 0 ? [] : [
      "Recorded that year: ",
      ...linkableEvents.flatMap((event, index): WikiSegmentInput[] => [
        index === 0 ? undefined : "; ",
        { text: lowerFirst(phraseText(event.title)), linkId: `event:${String(event.eventId)}` },
      ]),
      ". ",
    ];

    return {
      id: `year:${fact.year}`,
      kind: "year" as const,
      title: `Year ${fact.year}`,
      subtitle: sentenceCase(fact.signals[0] ?? "a thin record"),
      paragraphs: definedParagraphs([
        makeParagraph(`year:${fact.year}:1`, [summaryText]),
        makeParagraph(`year:${fact.year}:2`, [
          ...eventParts,
          repeatedTalk === undefined || repeatedTalk.count < 2 || talkAlreadyTold
            ? undefined
            : `People kept returning to ${lowerFirst(cleanPlayerText(repeatedTalk.lastSummary))}`,
        ]),
      ]).slice(0, PAGE_PARAGRAPH_CAP),
      facts: capFacts([
        births === 0 ? undefined : { label: "Births", value: String(births) },
        deaths === 0 ? undefined : { label: "Deaths", value: String(deaths) },
        fact.residentialMoves.length === 0 ? undefined : { label: "Camp moves", value: String(fact.residentialMoves.length) },
        { label: "Season pressure", value: hungry && dry ? "lean and dry" : hungry ? "lean" : dry ? "dry" : "steady" },
      ]),
      relatedLinkIds: capRelated([
        ...overlappingArcs.map((arc) => arc.id),
        ...linkableEvents.map((event) => `event:${String(event.eventId)}`),
        yearSet.has(fact.year - 1) ? `year:${fact.year - 1}` : undefined,
        yearSet.has(fact.year + 1) ? `year:${fact.year + 1}` : undefined,
      ]),
    };
  });
}

function buildEventPages(input: WikiLayerInput): readonly BandChroniclePage[] {
  const { context, tracker } = input;
  const bandKey = String(context.band.id);

  return input.majorEvents.slice(0, EVENT_PAGE_CAP).map((event) => {
    const episode = input.episodes.find((candidate) =>
      candidate.sourceEventIds.some((id) => String(id) === String(event.eventId)));
    const arc = input.majorArcs.find((candidate) =>
      candidate.sourceEventIds.some((id) => String(id) === String(event.eventId)));
    const refs = input.memoryReferents.referents
      .filter((referent) => referent.relatedEventIds.some((id) => String(id) === String(event.eventId)))
      .slice(0, 2);
    const episodeSpan = episode === undefined
      ? undefined
      : episode.endYear > episode.startYear
        ? `between Year ${episode.startYear} and Year ${episode.endYear}`
        : `within Year ${episode.startYear}`;

    return {
      id: `event:${String(event.eventId)}`,
      kind: "event" as const,
      title: event.title,
      subtitle: `${sentenceCase(event.season)} of Year ${event.year} — ${event.categoryLabel}`,
      paragraphs: definedParagraphs([
        makeParagraph(`event:${String(event.eventId)}:1`, [event.summary]),
        makeParagraph(`event:${String(event.eventId)}:2`, [
          pickTemplate(tracker, `event-why:${bandKey}:${String(event.eventId)}`, [
            `It stays in the chronicle because ${lowerFirst(phraseText(event.whyIncluded))}. `,
            `The historians of this record would keep it for a plain reason: ${lowerFirst(phraseText(event.whyIncluded))}. `,
          ]),
          episode === undefined || episodeSpan === undefined || episode.occurrenceCount < 2
            ? undefined
            : `It was not isolated — the same pattern was recorded ${episode.occurrenceCount} times ${episodeSpan}. `,
          arc === undefined ? undefined : "It belongs to ",
          arc === undefined ? undefined : { text: lowerFirst(humanArcPhrase(arc.kind)), linkId: arc.id },
          arc === undefined ? undefined : ".",
        ]),
      ]).slice(0, PAGE_PARAGRAPH_CAP),
      facts: capFacts([
        { label: "Year", value: String(event.year) },
        { label: "Season", value: sentenceCase(event.season) },
        { label: "Kind", value: sentenceCase(event.categoryLabel) },
      ]),
      relatedLinkIds: capRelated([
        `year:${event.year}`,
        arc?.id,
        ...refs.map((referent) => `referent:${referent.id}`),
      ]),
    };
  });
}

function freshnessWord(freshness: MemoryReferent["freshness"]): string {
  switch (freshness) {
    case "current":
      return "current";
    case "recent":
      return "recent";
    case "repeated":
      return "repeated";
    case "stale":
      return "fading";
    case "recovering":
      return "recovering";
    case "worsening":
      return "worsening";
    case "uncertain":
      return "uncertain";
  }
}

function buildReferentPages(input: WikiLayerInput): readonly BandChroniclePage[] {
  return input.memoryReferents.referents.slice(0, REFERENT_PAGE_CAP).map((referent) => {
    const subtitleParts = [
      referent.placeLabel,
      referent.year === undefined
        ? undefined
        : referent.season === undefined
          ? `Year ${referent.year}`
          : `${sentenceCase(referent.season)} of Year ${referent.year}`,
      freshnessWord(referent.freshness),
    ].filter((part): part is string => part !== undefined && part.length > 0);
    const consequences = referent.consequences.slice(0, 2);

    return {
      id: `referent:${referent.id}`,
      kind: "referent" as const,
      title: referent.title,
      subtitle: subtitleParts.join(", "),
      paragraphs: definedParagraphs([
        makeParagraph(`referent:${referent.id}:1`, [referent.summary]),
        makeParagraph(`referent:${referent.id}:2`, [
          `${cleanPlayerText(referent.currentResponse)}${/[.!?]$/.test(cleanPlayerText(referent.currentResponse)) ? "" : "."} `,
          consequences.length === 0 ? undefined : joinSentences(consequences),
        ]),
      ]).slice(0, PAGE_PARAGRAPH_CAP),
      facts: capFacts([
        { label: "Status", value: sentenceCase(cleanPlayerText(referent.status)) },
        { label: "Confidence", value: sentenceCase(referent.confidenceWord) },
        { label: "Memory", value: sentenceCase(freshnessWord(referent.freshness)) },
        referent.recurrence === undefined ? undefined : { label: "Recurrence", value: sentenceCase(cleanPlayerText(referent.recurrence)) },
      ]),
      relatedLinkIds: capRelated([
        ...referent.relatedEventIds.slice(0, 3).map((id) => `event:${String(id)}`),
        ...referent.relatedPlaceIds.slice(0, 2).map((id) => `place:${String(id)}`),
        ...referent.relatedRouteIds.slice(0, 2).map((id) => `route:${String(id)}`),
      ]),
    };
  });
}

function usePressureWord(status: ProtoCampPlaceMemory["usePressureStatus"]): string {
  switch (status) {
    case "overused":
      return "overused";
    case "worn":
      return "worn";
    default:
      return "holding up";
  }
}

function buildPlacePages(input: WikiLayerInput): readonly BandChroniclePage[] {
  const { context, tracker } = input;
  const { band } = context;
  const bandKey = String(band.id);
  const memories = uniquePlaces([band.protoCampMemory?.currentPlace, ...(band.protoCampMemory?.topPlaces ?? [])]);
  const memoryByTile = new Map(memories.map((place) => [String(place.tileId), place]));
  const crossings = Object.values(band.crossingMemories);
  const pages: BandChroniclePage[] = [];

  for (const entry of input.importantPlaces.slice(0, PLACE_PAGE_CAP)) {
    const memory = entry.tileId === undefined ? undefined : memoryByTile.get(String(entry.tileId));

    if (memory !== undefined) {
      const wearing = memory.usePressureStatus === "overused" || memory.usePressureStatus === "worn";
      const recovering = memory.ecologicalRecovery > memory.ecologicalPressure;
      const nearbyCrossings = crossings
        .filter((crossing) => String(crossing.crossingTileA) === String(memory.tileId) || String(crossing.crossingTileB) === String(memory.tileId))
        .slice(0, 2);
      const campArc = input.majorArcs.find((arc) => arc.kind === "camp" || arc.kind === "stagnation");
      const campReferent = input.memoryReferents.referents.find((referent) =>
        referent.kind === "camp_place" &&
        referent.relatedPlaceIds.some((id) => String(id) === String(memory.tileId)));

      pages.push({
        id: entry.id,
        kind: "place" as const,
        title: entry.label,
        subtitle: memory.seasonalIdentity === "general_return_place"
          ? sentenceCase(usePressureWord(memory.usePressureStatus))
          : `${sentenceCase(seasonalIdentityPhrase(memory.seasonalIdentity))}, ${usePressureWord(memory.usePressureStatus)}`,
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [
            memory.visitCount > 0
              ? pickTemplate(tracker, `place-use:${bandKey}:${entry.id}`, [
                `The band has come back here ${memory.visitCount} time${plural(memory.visitCount)}; familiarity, not accident, keeps it in the record. `,
                `${memory.visitCount} recorded visit${plural(memory.visitCount)} made this ground familiar — and familiarity is why it keeps appearing in the band's story. `,
              ])
              : undefined,
            `${sentenceCase(campStatePhrase(memory))}.`,
          ]),
          makeParagraph(`${entry.id}:2`, [
            wearing
              ? pickTemplate(tracker, `place-wear:${bandKey}:${entry.id}`, [
                `Return, use, wear, return again — the pattern is visible. The place is ${usePressureWord(memory.usePressureStatus)}, and each stay now costs a little more than it once did. `,
                `Repeated use is quietly charging rent: the ground is ${usePressureWord(memory.usePressureStatus)}, and every return adds to the bill. `,
              ])
              : recovering
                ? "Left alone between stays, the ground has been recovering. "
                : undefined,
            memory.deathMemoryNearby >= 0.2 ? "Death memory clings to the area and colors every decision to stay. " : undefined,
            memory.crossingUseScore >= 0.25 || nearbyCrossings.length > 0
              ? "Its place in the crossing story keeps it relevant even when returns are thin. "
              : undefined,
            memory.topReasons[0] === undefined ? undefined : `${sentenceCase(cleanPlayerText(memory.topReasons[0]))}${/[.!?]$/.test(cleanPlayerText(memory.topReasons[0])) ? "" : "."}`,
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          memory.visitCount === 0 ? undefined : { label: "Visits", value: String(memory.visitCount) },
          { label: "Wear", value: sentenceCase(usePressureWord(memory.usePressureStatus)) },
          memory.lastUsedYear === undefined ? undefined : { label: "Last used", value: `Year ${memory.lastUsedYear}` },
        ]),
        relatedLinkIds: capRelated([
          campArc?.id,
          campReferent === undefined ? undefined : `referent:${campReferent.id}`,
          ...nearbyCrossings.map((crossing) => `crossing:${String(crossing.crossingTileA)}:${String(crossing.crossingTileB)}`),
        ]),
      });
      continue;
    }

    pages.push({
      id: entry.id,
      kind: "place" as const,
      title: entry.label,
      subtitle: "a shared or remembered place",
      paragraphs: definedParagraphs([
        makeParagraph(`${entry.id}:1`, [entry.summary]),
        makeParagraph(`${entry.id}:2`, [
          "Nobody owns it, but expectations gather around it: who uses it, when, and how it is left matters to more than one group.",
        ]),
      ]).slice(0, PAGE_PARAGRAPH_CAP),
      facts: [],
      relatedLinkIds: [],
    });
  }

  return pages;
}

function intentPurposePhrase(kind: string): string {
  switch (kind) {
    case "follow_river_corridor":
      return "following the river";
    case "local_foraging":
      return "daily foraging";
    case "return_to_known_good_area":
      return "returning to known ground";
    case "seek_better_water":
      return "reaching better water";
    case "avoid_risk":
      return "keeping clear of remembered danger";
    case "cross_pass":
      return "crossing high ground";
    case "seek_new_range":
    case "frontier_dispersal":
    case "daughter_range_expansion":
      return "pushing toward new range";
    case "probe_wetland_or_lake":
      return "checking wet ground";
    case "probe_coast":
      return "checking the coast";
    case "expand_known_world":
      return "widening known country";
    default:
      return cleanPlayerText(kind);
  }
}

function riskWordFromValue(value: number): string {
  if (value >= 0.5) {
    return "high";
  }

  if (value >= 0.25) {
    return "present";
  }

  return "low";
}

function buildRoutePages(input: WikiLayerInput): readonly BandChroniclePage[] {
  const { context, tracker } = input;
  const { band } = context;
  const bandKey = String(band.id);
  const corridors = Object.values(band.travelCorridors);
  const crossings = Object.values(band.crossingMemories);
  const moves = band.recentResidentialMoveEvents ?? [];
  const moveArc = input.majorArcs.find((arc) => arc.kind === "movement" || arc.kind === "foothold");
  const pages: BandChroniclePage[] = [];

  for (const entry of input.importantRoutes.slice(0, ROUTE_PAGE_CAP)) {
    const corridor = corridors.find((candidate) => `route:${String(candidate.id)}` === entry.id);
    const crossing = crossings.find((candidate) =>
      `crossing:${String(candidate.crossingTileA)}:${String(candidate.crossingTileB)}` === entry.id);
    const move = moves.find((candidate) => `move-route:${String(candidate.eventId)}` === entry.id);

    if (corridor !== undefined) {
      const river = corridor.intentKinds.includes("follow_river_corridor");
      const purposes = uniqueStrings(corridor.intentKinds.map(intentPurposePhrase)).slice(0, 3);

      pages.push({
        id: entry.id,
        kind: "route" as const,
        title: entry.label,
        subtitle: `used ${corridor.useCount} time${plural(corridor.useCount)}, confidence ${confidencePhrase(corridor.confidence)}`,
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [
            pickTemplate(tracker, `route-use:${bandKey}:${entry.id}`, [
              `A remembered ${river ? "river-edge" : "overland"} way, walked ${corridor.useCount} time${plural(corridor.useCount)}. Confidence in it is ${confidencePhrase(corridor.confidence)} — familiar is not the same as safe, and the band knows the difference. `,
              `${corridor.useCount} recorded use${plural(corridor.useCount)} made this ${river ? "river-edge" : "overland"} way part of the band's mental map; its confidence in the route is ${confidencePhrase(corridor.confidence)}. `,
            ]),
            purposes.length === 0 ? undefined : `It has served for ${joinNaturalList(purposes)}.`,
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          { label: "Uses", value: String(corridor.useCount) },
          { label: "Confidence", value: sentenceCase(confidencePhrase(corridor.confidence)) },
        ]),
        relatedLinkIds: capRelated([moveArc?.id]),
      });
      continue;
    }

    if (crossing !== undefined) {
      const risky = crossing.riskMemory >= 0.35 || crossing.successConfidence < 0.55;
      const crossingReferent = input.memoryReferents.referents.find((referent) =>
        (referent.kind === "crossing" || referent.kind === "accident") &&
        referent.relatedPlaceIds.some((id) =>
          String(id) === String(crossing.crossingTileA) || String(id) === String(crossing.crossingTileB)));

      pages.push({
        id: entry.id,
        kind: "route" as const,
        title: entry.label,
        subtitle: `used ${crossing.useCount} time${plural(crossing.useCount)}, risk ${riskWordFromValue(crossing.riskMemory)}`,
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [
            `The band has used this crossing ${crossing.useCount} time${plural(crossing.useCount)}; its confidence in a safe passage is ${confidencePhrase(crossing.successConfidence)}.`,
          ]),
          makeParagraph(`${entry.id}:2`, [
            risky
              ? pickTemplate(tracker, `crossing-risk:${bandKey}:${entry.id}`, [
                "Accidents and hard passages left a mark: the band seems to treat this crossing as risky and approaches it with caution. ",
                "The water here has charged for passage before, and memory keeps the receipt — later crossings were made more carefully, or not at all. ",
              ])
              : "Repeated safe use has made this the calmer kind of memory: known, planned around, and rarely discussed. ",
            crossing.seasonalReliability < 0.5 ? "Its reliability shifts with the seasons." : undefined,
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          { label: "Uses", value: String(crossing.useCount) },
          { label: "Confidence", value: sentenceCase(confidencePhrase(crossing.successConfidence)) },
          { label: "Risk", value: sentenceCase(riskWordFromValue(crossing.riskMemory)) },
        ]),
        relatedLinkIds: capRelated([
          moveArc?.id,
          crossingReferent === undefined ? undefined : `referent:${crossingReferent.id}`,
        ]),
      });
      continue;
    }

    if (move !== undefined) {
      const outcomeSentence = move.hardshipOutcome === "rejected"
        ? "In the end the move was turned back."
        : move.hardshipOutcome === "delayed"
          ? "The move went through late, and the delay had its own costs."
          : move.hardshipOutcome === "diverted"
            ? "The path bent around trouble rather than through it."
            : undefined;

      pages.push({
        id: entry.id,
        kind: "route" as const,
        title: entry.label,
        subtitle: `${sentenceCase(move.season)}, ${move.distanceTiles} tile${plural(move.distanceTiles)} over ${move.durationDays} day${plural(move.durationDays)}`,
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [describeResidentialMoveForChronicle(move)]),
          makeParagraph(`${entry.id}:2`, [
            move.hardshipReason === undefined ? undefined : `${sentenceCase(cleanPlayerText(move.hardshipReason))}${/[.!?]$/.test(cleanPlayerText(move.hardshipReason)) ? "" : "."} `,
            outcomeSentence,
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          { label: "Distance", value: `${move.distanceTiles} tile${plural(move.distanceTiles)}` },
          { label: "Days", value: String(move.durationDays) },
        ]),
        relatedLinkIds: capRelated([moveArc?.id, `year:${tickToYear(move.tick)}`]),
      });
      continue;
    }

    pages.push({
      id: entry.id,
      kind: "route" as const,
      title: entry.label,
      subtitle: undefined,
      paragraphs: definedParagraphs([makeParagraph(`${entry.id}:1`, [entry.summary])]).slice(0, PAGE_PARAGRAPH_CAP),
      facts: [],
      relatedLinkIds: capRelated([moveArc?.id]),
    });
  }

  return pages;
}

function shareWord(value: number): string {
  if (value >= 0.25) {
    return "a large share";
  }

  if (value >= 0.1) {
    return "a steady share";
  }

  return "a visible share";
}

function buildResourcePages(input: WikiLayerInput): readonly BandChroniclePage[] {
  const { context, tracker } = input;
  const { band } = context;
  const bandKey = String(band.id);
  const classes = band.resourceEcology?.support.topContributingClasses ?? [];
  const placeMemories = band.resourceEcology?.topResourcePlaceMemories ?? [];
  const animals = band.relationshipMemory?.animalFamiliarity ?? [];
  const foodArc = input.majorArcs.find((arc) => arc.kind === "resource" || arc.kind === "hunger");
  const pages: BandChroniclePage[] = [];

  for (const entry of input.importantResources.slice(0, RESOURCE_PAGE_CAP)) {
    const supportClass = classes.find((candidate) => `resource:${String(candidate.classId)}` === entry.id);
    const placeMemory = placeMemories.find((candidate) =>
      `resource-place:${String(candidate.tileId)}:${String(candidate.resourceClassId)}` === entry.id);
    const animal = animals.find((candidate) => `ecology-animal:${String(candidate.stockId)}` === entry.id);

    if (supportClass !== undefined) {
      pages.push({
        id: entry.id,
        kind: "resource" as const,
        title: entry.label,
        subtitle: `${shareWord(supportClass.supportShare)} of remembered support`,
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [
            pickTemplate(tracker, `resource-role:${bandKey}:${entry.id}`, [
              `${entry.label} carried ${shareWord(supportClass.supportShare)} of the support the band remembers; its knowledge of the source is ${confidencePhrase(supportClass.knowledgeConfidence)}. `,
              `In the seasons the band can recall, ${lowerFirst(entry.label)} did real work — ${shareWord(supportClass.supportShare)} of support — and the band knows it with ${confidencePhrase(supportClass.knowledgeConfidence)} confidence. `,
            ]),
          ]),
          makeParagraph(`${entry.id}:2`, [
            supportClass.pressure >= 0.25
              ? "Use has pressed on it: the record notes thinner returns where it was leaned on hardest. "
              : "So far the record does not show it failing under use. ",
            foodArc === undefined ? undefined : "Its longer role is told in ",
            foodArc === undefined ? undefined : { text: lowerFirst(humanArcPhrase(foodArc.kind)), linkId: foodArc.id },
            foodArc === undefined ? undefined : ".",
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          { label: "Support", value: sentenceCase(shareWord(supportClass.supportShare)) },
          { label: "Knowledge", value: sentenceCase(confidencePhrase(supportClass.knowledgeConfidence)) },
          { label: "Pressure", value: sentenceCase(riskWordFromValue(supportClass.pressure)) },
        ]),
        relatedLinkIds: capRelated([foodArc?.id]),
      });
      continue;
    }

    if (placeMemory !== undefined) {
      pages.push({
        id: entry.id,
        kind: "resource" as const,
        title: entry.label,
        subtitle: "a remembered food place",
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [entry.summary]),
          makeParagraph(`${entry.id}:2`, [
            `Remembered use, not map truth: the band knows this source because it worked there ${placeMemory.visitsOrUses} time${plural(placeMemory.visitsOrUses)}.`,
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          { label: "Uses", value: String(placeMemory.visitsOrUses) },
          { label: "Pressure", value: sentenceCase(riskWordFromValue(placeMemory.pressure)) },
        ]),
        relatedLinkIds: capRelated([foodArc?.id, `place:${String(placeMemory.tileId)}`]),
      });
      continue;
    }

    if (animal !== undefined) {
      pages.push({
        id: entry.id,
        kind: "resource" as const,
        title: entry.label,
        subtitle: "practical animal memory",
        paragraphs: definedParagraphs([
          makeParagraph(`${entry.id}:1`, [
            `${sentenceCase(cleanPlayerText(animal.usefulness))}${/[.!?]$/.test(cleanPlayerText(animal.usefulness)) ? "" : "."}`,
          ]),
          makeParagraph(`${entry.id}:2`, [
            animal.animalWariness >= 0.3
              ? "The animals have learned too: wariness near the band's grounds is part of this memory, and it changes what a hunt costs."
              : "The record keeps this as working knowledge — where, when, and how much effort an encounter is worth.",
          ]),
        ]).slice(0, PAGE_PARAGRAPH_CAP),
        facts: capFacts([
          { label: "Familiarity", value: sentenceCase(confidencePhrase(animal.confidence)) },
          { label: "Wariness", value: sentenceCase(riskWordFromValue(animal.animalWariness)) },
          { label: "Risk", value: sentenceCase(riskWordFromValue(animal.risk)) },
        ]),
        relatedLinkIds: capRelated([
          input.majorArcs.find((arc) => arc.kind === "ecology")?.id,
        ]),
      });
      continue;
    }

    pages.push({
      id: entry.id,
      kind: "resource" as const,
      title: entry.label,
      subtitle: undefined,
      paragraphs: definedParagraphs([makeParagraph(`${entry.id}:1`, [entry.summary])]).slice(0, PAGE_PARAGRAPH_CAP),
      facts: [],
      relatedLinkIds: capRelated([foodArc?.id]),
    });
  }

  return pages;
}

// --- Link sanitation and proof helpers -------------------------------------------

function sanitizeWikiLinks(
  article: BandChronicleArticle,
  pages: readonly BandChroniclePage[],
  linkTargets: readonly BandChronicleLinkTarget[],
): {
  readonly article: BandChronicleArticle;
  readonly pages: readonly BandChroniclePage[];
  readonly linkGraph: BandChronicleLinkGraphProof;
} {
  // A link is only clickable if it opens a chronicle page or another band's
  // panel; anything else is demoted to plain text so normal UI never shows a
  // dead link.
  const resolvable = new Set<string>();
  for (const page of pages) {
    resolvable.add(page.id);
  }
  for (const target of linkTargets) {
    if (target.inactiveFutureHook !== true && target.kind === "band") {
      resolvable.add(target.id);
    }
  }

  let edges = 0;
  let dropped = 0;

  const fixParagraph = (paragraph: BandChronicleParagraph): BandChronicleParagraph => ({
    id: paragraph.id,
    segments: paragraph.segments.map((segment) => {
      if (segment.linkId === undefined) {
        return segment;
      }

      if (resolvable.has(segment.linkId)) {
        edges += 1;
        return segment;
      }

      dropped += 1;
      return { text: segment.text };
    }),
  });

  const fixedArticle: BandChronicleArticle = {
    leadParagraphs: article.leadParagraphs.map(fixParagraph),
    longStory: article.longStory.map(fixParagraph),
    eras: article.eras,
    deepHistory: article.deepHistory,
    coverageNote: article.coverageNote,
    infobox: article.infobox.map((fact) => {
      if (fact.linkId === undefined) {
        return fact;
      }

      if (resolvable.has(fact.linkId)) {
        edges += 1;
        return fact;
      }

      dropped += 1;
      return { label: fact.label, value: fact.value };
    }),
    contents: article.contents,
    periods: article.periods.map((period) => {
      const yearPageIds = period.yearPageIds.filter((id) => resolvable.has(id));
      edges += yearPageIds.length;
      dropped += period.yearPageIds.length - yearPageIds.length;
      return { ...period, paragraphs: period.paragraphs.map(fixParagraph), yearPageIds };
    }),
    sections: article.sections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs.map(fixParagraph),
    })),
  };

  const fixedPages = pages.map((page) => {
    const relatedLinkIds = page.relatedLinkIds.filter((id) => id !== page.id && resolvable.has(id));
    edges += relatedLinkIds.length;
    dropped += page.relatedLinkIds.length - relatedLinkIds.length;
    return { ...page, paragraphs: page.paragraphs.map(fixParagraph), relatedLinkIds };
  });

  return {
    article: fixedArticle,
    pages: fixedPages,
    linkGraph: {
      nodeCount: resolvable.size,
      edgeCount: edges,
      brokenLinkCount: 0,
      unresolvedDroppedCount: dropped,
    },
  };
}

function countPagesByKind(pages: readonly BandChroniclePage[]): Readonly<Record<BandChroniclePageKind, number>> {
  const counts: Record<BandChroniclePageKind, number> = {
    year: 0,
    period: 0,
    event: 0,
    referent: 0,
    place: 0,
    route: 0,
    resource: 0,
  };

  for (const page of pages) {
    counts[page.kind] += 1;
  }

  return counts;
}
